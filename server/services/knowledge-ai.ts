import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { readRuntimeSettings } from '~~/server/utils/env'
import { runWithRetry } from '~~/server/utils/retry'

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

interface EmbeddingApiResponse {
  data?: Array<{
    embedding?: number[]
  }>
}

export interface KnowledgeEmbeddingResult {
  embedding: number[]
  provider: string
  model: string
  fallbackUsed: boolean
  attempts: number
}

export interface KnowledgeEntityAnalysisResult {
  summary: string
  keywords: string[]
  risks: string[]
  suggestedActions: string[]
  qualityScore: number
  provider: string
  model: string
  fallbackUsed: boolean
  attempts: number
}

export function toKnowledgeText(raw: unknown): string {
  return String(raw || '').trim()
}

export function extractKnowledgeKeywords(text: string, limit = 8): string[] {
  const hit = text.match(/[\w\u4E00-\u9FFF]{2,24}/g) || []
  const buckets = new Map<string, number>()
  for (const item of hit) {
    const normalized = item.toLowerCase()
    if (normalized.length < 2)
      continue
    buckets.set(normalized, (buckets.get(normalized) || 0) + 1)
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, limit))
    .map(item => item[0])
}

export function buildDeterministicKnowledgeEmbedding(text: string, dimensions = 1536): number[] {
  const digest = createHash('sha256').update(text).digest()
  const values: number[] = []
  for (let index = 0; index < dimensions; index += 1) {
    const byte = digest[index % digest.length] || 0
    values.push(Number((((byte / 255) * 2) - 1).toFixed(6)))
  }
  return values
}

function normalizeEmbeddingModel(model: string): string {
  const candidate = toKnowledgeText(model)
  if (!candidate)
    return DEFAULT_EMBEDDING_MODEL
  if (candidate.startsWith('text-embedding-'))
    return candidate
  return DEFAULT_EMBEDDING_MODEL
}

function normalizeEmbeddingOutput(raw: unknown): number[] {
  if (!Array.isArray(raw))
    return []
  const result: number[] = []
  for (const item of raw) {
    const value = Number(item)
    if (Number.isFinite(value))
      result.push(value)
  }
  return result
}

function buildAnalysisFallback(text: string): Omit<KnowledgeEntityAnalysisResult, 'provider' | 'model' | 'fallbackUsed' | 'attempts'> {
  const normalized = toKnowledgeText(text)
  const summary = normalized.slice(0, 220) || '暂无可分析内容。'
  const keywords = extractKnowledgeKeywords(normalized, 10)
  const risks: string[] = []
  if (!normalized)
    risks.push('内容为空，无法完成有效分析。')
  if (normalized.length < 80)
    risks.push('内容偏短，分析结论可信度有限。')
  const suggestedActions = normalized
    ? ['补充结构化摘要、正文和标签。', '补充来源信息与版权说明。']
    : ['先补充资源正文，再触发重算。']

  return {
    summary,
    keywords,
    risks,
    suggestedActions,
    qualityScore: normalized.length >= 400 ? 78 : normalized.length >= 160 ? 64 : 45,
  }
}

export async function createKnowledgeEmbedding(input: {
  text: string
  event?: H3Event
}): Promise<KnowledgeEmbeddingResult> {
  const runtime = readRuntimeSettings(input.event)
  const sourceText = toKnowledgeText(input.text)
  const provider = toKnowledgeText(runtime.ai.provider) || 'openai-compatible'
  const model = normalizeEmbeddingModel(runtime.ai.embeddingModel || runtime.ai.model)
  if (!sourceText) {
    return {
      embedding: [],
      provider,
      model,
      fallbackUsed: true,
      attempts: 1,
    }
  }

  if (!toKnowledgeText(runtime.ai.apiKey)) {
    return {
      embedding: buildDeterministicKnowledgeEmbedding(sourceText),
      provider,
      model,
      fallbackUsed: true,
      attempts: 1,
    }
  }

  const endpoint = `${toKnowledgeText(runtime.ai.baseURL) || 'https://api.openai.com/v1'}`.replace(/\/+$/g, '')
  const timeoutMs = Math.max(3_000, Math.min(120_000, Number(runtime.ai.timeoutMs || 15_000)))
  const maxRetries = Math.max(0, Math.min(6, Number(runtime.ai.maxRetries || 0)))

  const result = await runWithRetry<number[]>({
    maxRetries,
    run: async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(`${endpoint}/embeddings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${runtime.ai.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: sourceText,
          }),
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({})) as EmbeddingApiResponse
        if (!response.ok)
          throw new Error(`EMBEDDING_HTTP_${response.status}`)
        const embedding = normalizeEmbeddingOutput(payload.data?.[0]?.embedding)
        if (!embedding.length)
          throw new Error('EMBEDDING_EMPTY')
        return embedding
      }
      finally {
        clearTimeout(timer)
      }
    },
    fallback: () => buildDeterministicKnowledgeEmbedding(sourceText),
  })

  return {
    embedding: result.data,
    provider,
    model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }
}

const analysisSchema = z.object({
  summary: z.string().default(''),
  keywords: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  suggestedActions: z.array(z.string()).default([]),
  qualityScore: z.number().min(0).max(100).default(0),
})

export async function analyzeKnowledgeEntity(input: {
  scope: string
  text: string
  event?: H3Event
  systemPrompt?: string
}): Promise<KnowledgeEntityAnalysisResult> {
  const runtime = readRuntimeSettings(input.event)
  const provider = toKnowledgeText(runtime.ai.provider) || 'openai-compatible'
  const model = toKnowledgeText(runtime.ai.model) || 'gpt-4o-mini'
  const normalizedText = toKnowledgeText(input.text).slice(0, 12_000)
  const fallback = buildAnalysisFallback(normalizedText)

  if (!toKnowledgeText(runtime.ai.apiKey) || !normalizedText) {
    return {
      ...fallback,
      provider,
      model,
      fallbackUsed: true,
      attempts: 1,
    }
  }

  const chatModel = createChatModel({
    provider: runtime.ai.provider,
    baseURL: runtime.ai.baseURL,
    apiKey: runtime.ai.apiKey,
    model: runtime.ai.model,
    format: runtime.ai.provider === 'response' ? 'response' : 'openai-compatible',
    temperature: 0.1,
    topP: runtime.ai.topP,
    maxTokens: runtime.ai.maxTokens,
    presencePenalty: runtime.ai.presencePenalty,
    frequencyPenalty: runtime.ai.frequencyPenalty,
    timeoutMs: runtime.ai.timeoutMs,
    maxRetries: runtime.ai.maxRetries,
  })
  const structuredModel = chatModel.withStructuredOutput(analysisSchema, {
    name: 'KnowledgeEntityAnalysis',
    strict: false,
  })

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', input.systemPrompt?.trim() || '你是知识库治理分析助手。请基于输入内容输出结构化 JSON，总结、关键词、风险和建议动作。'],
    ['human', '实体类型：{scope}\n内容：\n{text}'],
  ])

  const result = await runWithRetry<z.infer<typeof analysisSchema>>({
    maxRetries: Math.max(0, Math.min(6, Number(runtime.ai.maxRetries || 0))),
    run: async () => {
      const promptValue = await prompt.invoke({
        scope: input.scope,
        text: normalizedText,
      })
      return analysisSchema.parse(await structuredModel.invoke(promptValue))
    },
    fallback: () => ({
      summary: fallback.summary,
      keywords: fallback.keywords,
      risks: fallback.risks,
      suggestedActions: fallback.suggestedActions,
      qualityScore: fallback.qualityScore,
    }),
  })

  return {
    summary: toKnowledgeText(result.data.summary),
    keywords: [...new Set((result.data.keywords || []).map(item => toKnowledgeText(item)).filter(Boolean))].slice(0, 10),
    risks: [...new Set((result.data.risks || []).map(item => toKnowledgeText(item)).filter(Boolean))].slice(0, 8),
    suggestedActions: [...new Set((result.data.suggestedActions || []).map(item => toKnowledgeText(item)).filter(Boolean))].slice(0, 8),
    qualityScore: Math.max(0, Math.min(100, Number(result.data.qualityScore || 0))),
    provider,
    model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }
}
