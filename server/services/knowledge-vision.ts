import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { extractKnowledgeKeywords, toKnowledgeText } from '~~/server/services/knowledge-ai'
import { isAiRuntimeConfigured, normalizeAiRuntimeProvider } from '~~/server/utils/ai-runtime'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { normalizePlatformAiClientType } from '~~/server/utils/platform-ai-client'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { runWithRetry } from '~~/server/utils/retry'

const MAX_VISION_IMAGE_BYTES = 2 * 1024 * 1024

const visualProjectionSchema = z.object({
  summary: z.string().default(''),
  tags: z.array(z.string()).default([]),
  ocrText: z.string().default(''),
  layout: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0),
})

export interface KnowledgeVisualProjectionResult {
  summary: string
  tags: string[]
  ocrText: string
  layout: string
  confidence: number
  provider: string
  model: string
  fallbackUsed: boolean
  attempts: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function summarizeText(value: string, max = 220): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ')
  if (!normalized)
    return ''
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, max)}...`
}

function dedupeStrings(values: string[], limit = 12): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeString(value)
    if (!normalized)
      continue
    const key = normalized.toLowerCase()
    if (seen.has(key))
      continue
    seen.add(key)
    result.push(normalized)
    if (result.length >= limit)
      break
  }
  return result
}

function buildFallbackProjection(textFallback: string): Omit<KnowledgeVisualProjectionResult, 'provider' | 'model' | 'fallbackUsed' | 'attempts'> {
  const normalized = normalizeString(textFallback)
  return {
    summary: summarizeText(normalized) || '未配置视觉模型，已回退到文件名与资源元信息摘要。',
    tags: dedupeStrings(extractKnowledgeKeywords(normalized, 10)),
    ocrText: '',
    layout: '',
    confidence: normalized ? 0.38 : 0.22,
  }
}

function toDataUrl(buffer: Buffer, mimeType: string): string {
  const safeMimeType = normalizeString(mimeType) || 'image/png'
  return `data:${safeMimeType};base64,${buffer.toString('base64')}`
}

export async function analyzeKnowledgeVisualProjection(input: {
  imageBuffer: Buffer
  mimeType: string
  textFallback?: string
  event?: H3Event
}): Promise<KnowledgeVisualProjectionResult> {
  const { runtime } = await readEffectiveRuntimeSettings(input.event)
  const visionRuntime = resolveAiRuntimeForChannel(runtime, 'knowledge_visual_projection')
  const visionAi = visionRuntime.ai
  const provider = normalizeAiRuntimeProvider(visionAi.provider)
  const model = normalizeString(visionAi.model)
  const fallback = buildFallbackProjection(input.textFallback || '')

  if (
    !input.imageBuffer.length
    || !isAiRuntimeConfigured(visionAi)
    || input.imageBuffer.length > MAX_VISION_IMAGE_BYTES
  ) {
    return {
      ...fallback,
      provider,
      model,
      fallbackUsed: true,
      attempts: 1,
    }
  }

  const chatModel = createChatModel({
    provider,
    clientType: normalizePlatformAiClientType(visionAi.clientType),
    baseURL: visionAi.baseURL,
    apiKey: visionAi.apiKey,
    model,
    format: visionAi.format || 'openai-compatible',
    temperature: 0.1,
    topP: visionAi.topP,
    maxTokens: visionAi.maxTokens,
    presencePenalty: visionAi.presencePenalty,
    frequencyPenalty: visionAi.frequencyPenalty,
    timeoutMs: visionAi.timeoutMs,
    maxRetries: visionAi.maxRetries,
  })

  const structuredModel = chatModel.withStructuredOutput(visualProjectionSchema, {
    name: 'KnowledgeVisualProjection',
    strict: false,
  })

  const imageUrl = toDataUrl(input.imageBuffer, input.mimeType)
  const textFallback = normalizeString(input.textFallback)

  const result = await runWithRetry<z.infer<typeof visualProjectionSchema>>({
    maxRetries: Math.max(0, Math.min(6, Number(visionAi.maxRetries || 0))),
    run: async () => {
      return visualProjectionSchema.parse(await structuredModel.invoke([
        new SystemMessage([
          '你是项目知识多模态投影助手。',
          '请根据图片内容输出结构化 JSON，用于项目知识检索。',
          'summary 用 1~2 句总结主要视觉内容、界面、图表或版面。',
          'tags 给出可检索标签，优先保留界面元素、业务对象、图表类型、视觉主题。',
          'ocrText 只填写图片里真正可辨认的关键文字，不要编造。',
          'layout 简述布局或版面结构。',
          'confidence 为 0~1。',
        ].join('\n')),
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: [
                '请分析这张图片并输出结构化结果。',
                textFallback ? `资源补充信息：${textFallback}` : '',
              ].filter(Boolean).join('\n'),
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ] as any,
        }),
      ]))
    },
    fallback: () => ({
      summary: fallback.summary,
      tags: fallback.tags,
      ocrText: fallback.ocrText,
      layout: fallback.layout,
      confidence: fallback.confidence,
    }),
  })

  return {
    summary: normalizeString(result.data.summary) || fallback.summary,
    tags: dedupeStrings((result.data.tags || []).map(item => toKnowledgeText(item)).filter(Boolean), 12),
    ocrText: normalizeString(result.data.ocrText),
    layout: normalizeString(result.data.layout),
    confidence: Math.max(0, Math.min(1, Number(result.data.confidence || fallback.confidence))),
    provider,
    model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }
}
