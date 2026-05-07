import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { toKnowledgeText } from '~~/server/services/knowledge-ai'
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

  if (!input.imageBuffer.length)
    throw new Error('KNOWLEDGE_VISUAL_PROJECTION_EMPTY_IMAGE')
  if (!isAiRuntimeConfigured(visionAi))
    throw new Error('KNOWLEDGE_VISUAL_PROJECTION_RUNTIME_NOT_CONFIGURED')
  if (input.imageBuffer.length > MAX_VISION_IMAGE_BYTES)
    throw new Error('KNOWLEDGE_VISUAL_PROJECTION_IMAGE_TOO_LARGE')

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
  })

  const summary = normalizeString(result.data.summary)
  const tags = dedupeStrings((result.data.tags || []).map(item => toKnowledgeText(item)).filter(Boolean), 12)
  const ocrText = normalizeString(result.data.ocrText)
  const layout = normalizeString(result.data.layout)
  if (!summary && tags.length === 0 && !ocrText && !layout)
    throw new Error('KNOWLEDGE_VISUAL_PROJECTION_EMPTY_RESULT')

  return {
    summary,
    tags,
    ocrText,
    layout,
    confidence: Math.max(0, Math.min(1, Number(result.data.confidence || 0))),
    provider,
    model,
    fallbackUsed: false,
    attempts: result.attempts,
  }
}
