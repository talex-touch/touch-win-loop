import type { H3Event } from 'h3'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  EmbeddingSignature,
  ProjectKnowledgeEmbeddingApiStyle,
  ProjectKnowledgeEmbeddingInputType,
} from '~~/shared/types/domain'
import { createHash } from 'node:crypto'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { isAiRuntimeConfigured, normalizeAiRuntimeProvider } from '~~/server/utils/ai-runtime'
import {
  normalizePlatformAiApiKey,
  resolveDashScopeNativeBaseURL,
  resolvePlatformAiRequestBaseURL,
} from '~~/server/utils/platform-ai-base-url'
import {
  resolveAiRuntimeForChannel,
  resolvePlatformAiChannelEmbeddingApiStyle,
} from '~~/server/utils/platform-ai-channels'
import {
  normalizePlatformAiClientType,
  normalizeProjectKnowledgeEmbeddingApiStyle,
} from '~~/server/utils/platform-ai-client'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { runWithRetry } from '~~/server/utils/retry'

interface EmbeddingApiResponse {
  data?: Array<{
    embedding?: number[]
  }>
}

interface BailianMultimodalEmbeddingResponse {
  output?: {
    embeddings?: Array<{
      index?: number
      embedding?: number[]
      type?: string
    }>
  }
  request_id?: string
  code?: string
  message?: string
}

export type KnowledgeEmbeddingContentItem
  = string
    | { text: string }
    | { image: string }
    | { video: string }
    | { multi_images: string[] }

type KnowledgeEmbeddingClientType = 'openai-compatible' | 'bailian-native'

export interface KnowledgeEmbeddingResult {
  embedding: number[]
  provider: string
  model: string
  fallbackUsed: boolean
  attempts: number
  clientType: KnowledgeEmbeddingClientType
  apiStyle: ProjectKnowledgeEmbeddingApiStyle
  inputType: ProjectKnowledgeEmbeddingInputType
  dimensions: number
  fusionUsed: boolean
  runtimeVersion: string
  signature: EmbeddingSignature
  failureReason?: string
  requestId?: string
}

export interface KnowledgeEmbeddingRuntimeProfile {
  sourceText: string
  contents: KnowledgeEmbeddingContentItem[]
  channelKey: 'knowledge_embedding' | 'knowledge_visual_embedding'
  provider: string
  model: string
  clientType: KnowledgeEmbeddingClientType
  apiStyle: ProjectKnowledgeEmbeddingApiStyle
  inputType: ProjectKnowledgeEmbeddingInputType
  dimensions: number
  fusionUsed: boolean
  runtimeVersion: string
  signature: EmbeddingSignature
  runtimeConfigured: boolean
  normalizedApiKey: string
  endpoint: string
  baseURL: string
  timeoutMs: number
  maxRetries: number
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

interface KnowledgeEmbeddingCacheEntry {
  cacheKey: string
  expiresAt: number
  value: KnowledgeEmbeddingResult
}

const KNOWLEDGE_EMBEDDING_CACHE_KEY = Symbol.for('winloop.knowledge.embedding.cache.v1')
const KNOWLEDGE_EMBEDDING_CACHE_TTL_MS = 45_000

function getKnowledgeEmbeddingCache(): Map<string, KnowledgeEmbeddingCacheEntry> {
  const globalRef = globalThis as Record<symbol, unknown>
  const cached = globalRef[KNOWLEDGE_EMBEDDING_CACHE_KEY]
  if (cached instanceof Map)
    return cached as Map<string, KnowledgeEmbeddingCacheEntry>
  const next = new Map<string, KnowledgeEmbeddingCacheEntry>()
  globalRef[KNOWLEDGE_EMBEDDING_CACHE_KEY] = next
  return next
}

function buildKnowledgeEmbeddingRuntimeVersion(input: {
  provider: string
  model: string
  apiStyle: ProjectKnowledgeEmbeddingApiStyle
  dimensions: number
}): string {
  const payload = JSON.stringify({
    provider: normalizeAiRuntimeProvider(input.provider),
    model: normalizeEmbeddingModel(input.model),
    apiStyle: input.apiStyle,
    dimensions: Math.max(0, normalizePositiveInt(input.dimensions, 0)),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 12)
}

function buildKnowledgeEmbeddingSignature(input: {
  provider: string
  model: string
  apiStyle: ProjectKnowledgeEmbeddingApiStyle
  dimensions: number
  inputType: ProjectKnowledgeEmbeddingInputType
  fusionUsed: boolean
}): EmbeddingSignature {
  return {
    provider: normalizeAiRuntimeProvider(input.provider),
    model: normalizeEmbeddingModel(input.model),
    apiStyle: input.apiStyle,
    dimensions: Math.max(0, normalizePositiveInt(input.dimensions, 0)),
    inputType: input.inputType,
    fusionUsed: Boolean(input.fusionUsed),
    runtimeVersion: buildKnowledgeEmbeddingRuntimeVersion(input),
  }
}

function buildKnowledgeEmbeddingCacheKey(input: {
  text: string
  contents: KnowledgeEmbeddingContentItem[]
  provider: string
  model: string
  apiStyle: ProjectKnowledgeEmbeddingApiStyle
  dimensions: number
  inputType: ProjectKnowledgeEmbeddingInputType
  fusionUsed: boolean
}): string {
  return createHash('sha256')
    .update(JSON.stringify({
      text: toKnowledgeText(input.text),
      contents: input.contents,
      provider: normalizeAiRuntimeProvider(input.provider),
      model: normalizeEmbeddingModel(input.model),
      apiStyle: input.apiStyle,
      dimensions: Math.max(0, normalizePositiveInt(input.dimensions, 0)),
      inputType: input.inputType,
      fusionUsed: Boolean(input.fusionUsed),
    }))
    .digest('hex')
}

function cloneKnowledgeEmbeddingResult(value: KnowledgeEmbeddingResult): KnowledgeEmbeddingResult {
  return {
    ...value,
    embedding: [...value.embedding],
    signature: {
      ...value.signature,
    },
  }
}

function resolveKnowledgeEmbeddingFailureReason(error: unknown, fallback = 'EMBEDDING_REQUEST_FAILED'): string {
  if (error instanceof Error)
    return toKnowledgeText(error.message) || fallback
  return toKnowledgeText(error) || fallback
}

function createKnowledgeEmbeddingResult(input: {
  embedding: number[]
  provider: string
  model: string
  fallbackUsed: boolean
  attempts: number
  clientType: KnowledgeEmbeddingClientType
  apiStyle: ProjectKnowledgeEmbeddingApiStyle
  inputType: ProjectKnowledgeEmbeddingInputType
  dimensions: number
  fusionUsed: boolean
  runtimeVersion: string
  failureReason?: string
  requestId?: string
}): KnowledgeEmbeddingResult {
  return {
    embedding: [...input.embedding],
    provider: input.provider,
    model: input.model,
    fallbackUsed: input.fallbackUsed,
    attempts: input.attempts,
    clientType: input.clientType,
    apiStyle: input.apiStyle,
    inputType: input.inputType,
    dimensions: input.dimensions,
    fusionUsed: input.fusionUsed,
    runtimeVersion: input.runtimeVersion,
    signature: buildKnowledgeEmbeddingSignature({
      provider: input.provider,
      model: input.model,
      apiStyle: input.apiStyle,
      dimensions: input.dimensions,
      inputType: input.inputType,
      fusionUsed: input.fusionUsed,
    }),
    failureReason: toKnowledgeText(input.failureReason) || undefined,
    requestId: toKnowledgeText(input.requestId) || undefined,
  }
}

function normalizeEmbeddingModel(model: string): string {
  return toKnowledgeText(model)
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

function normalizePositiveInt(value: unknown, fallback = 0): number {
  const normalized = Math.round(Number(value))
  if (!Number.isFinite(normalized) || normalized <= 0)
    return fallback
  return normalized
}

function resolveOpenAiCompatibleEmbeddingDimensions(model: string, configured: unknown): number {
  const configuredValue = normalizePositiveInt(configured, 0)
  if (configuredValue > 0)
    return configuredValue

  const normalizedModel = normalizeEmbeddingModel(model).toLowerCase()
  if (normalizedModel.includes('text-embedding-3-large'))
    return 3072
  if (normalizedModel.includes('text-embedding-3-small'))
    return 1536
  if (normalizedModel.includes('text-embedding-v4'))
    return 1024
  if (normalizedModel.includes('text-embedding-v3'))
    return 1024
  return 1536
}

function resolveBailianMultimodalDimensions(model: string, configured: unknown): number {
  const configuredValue = normalizePositiveInt(configured, 0)
  const normalizedModel = normalizeEmbeddingModel(model).toLowerCase()
  if (normalizedModel === 'multimodal-embedding-v1')
    return 1024

  const supportedDimensions = new Set([256, 512, 768, 1024, 1536, 2048, 2560])
  if (supportedDimensions.has(configuredValue))
    return configuredValue
  return 1024
}

function resolveKnowledgeEmbeddingDimensions(input: {
  apiStyle: ProjectKnowledgeEmbeddingApiStyle
  model: string
  configured: unknown
}): number {
  if (input.apiStyle === 'bailian-multimodal')
    return resolveBailianMultimodalDimensions(input.model, input.configured)
  return resolveOpenAiCompatibleEmbeddingDimensions(input.model, input.configured)
}

function normalizeKnowledgeEmbeddingInputText(input: {
  text?: string
  contents?: KnowledgeEmbeddingContentItem[]
}): string {
  const directText = toKnowledgeText(input.text)
  if (directText)
    return directText

  const contents = Array.isArray(input.contents) ? input.contents : []
  const lines = contents.flatMap((item) => {
    if (typeof item === 'string')
      return [toKnowledgeText(item)]
    if ('text' in item)
      return [toKnowledgeText(item.text)]
    if ('multi_images' in item)
      return item.multi_images.map(value => `image:${toKnowledgeText(value)}`).filter(Boolean)
    if ('image' in item)
      return [`image:${toKnowledgeText(item.image)}`]
    if ('video' in item)
      return [`video:${toKnowledgeText(item.video)}`]
    return []
  })

  return lines.filter(Boolean).join('\n')
}

function normalizeKnowledgeEmbeddingContents(input: {
  text?: string
  contents?: KnowledgeEmbeddingContentItem[]
}): KnowledgeEmbeddingContentItem[] {
  const contents = Array.isArray(input.contents)
    ? input.contents
        .map((item) => {
          if (typeof item === 'string')
            return toKnowledgeText(item)
          if ('text' in item)
            return { text: toKnowledgeText(item.text) }
          if ('image' in item)
            return { image: toKnowledgeText(item.image) }
          if ('video' in item)
            return { video: toKnowledgeText(item.video) }
          if ('multi_images' in item)
            return { multi_images: item.multi_images.map(value => toKnowledgeText(value)).filter(Boolean) }
          return null
        })
        .filter((item): item is KnowledgeEmbeddingContentItem => {
          if (!item)
            return false
          if (typeof item === 'string')
            return Boolean(item)
          if ('text' in item)
            return Boolean(item.text)
          if ('image' in item)
            return Boolean(item.image)
          if ('video' in item)
            return Boolean(item.video)
          return item.multi_images.length > 0
        })
    : []

  if (contents.length > 0)
    return contents

  const text = toKnowledgeText(input.text)
  return text ? [{ text }] : []
}

function inferKnowledgeEmbeddingInputType(contents: KnowledgeEmbeddingContentItem[], fusionUsed: boolean): ProjectKnowledgeEmbeddingInputType {
  if (fusionUsed)
    return 'fused'

  const first = contents[0]
  if (!first)
    return 'text'
  if (typeof first === 'string')
    return 'text'
  if ('image' in first)
    return 'image'
  if ('video' in first)
    return 'video'
  if ('multi_images' in first)
    return 'multi_images'
  return 'text'
}

function normalizeBailianEmbeddingType(value: unknown, fallback: ProjectKnowledgeEmbeddingInputType): ProjectKnowledgeEmbeddingInputType {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'image')
    return 'image'
  if (normalized === 'video')
    return 'video'
  if (normalized === 'multi_images')
    return 'multi_images'
  if (normalized === 'fusion' || normalized === 'fused')
    return 'fused'
  return fallback
}

function resolveKnowledgeEmbeddingChannelKey(
  contents: KnowledgeEmbeddingContentItem[],
  inputType: ProjectKnowledgeEmbeddingInputType | undefined,
  fusionUsed: boolean,
): 'knowledge_embedding' | 'knowledge_visual_embedding' {
  const normalizedInputType = String(inputType || '').trim()
  if (fusionUsed || normalizedInputType === 'image' || normalizedInputType === 'video' || normalizedInputType === 'multi_images' || normalizedInputType === 'fused')
    return 'knowledge_visual_embedding'

  return contents.some(item => typeof item !== 'string' && !('text' in item))
    ? 'knowledge_visual_embedding'
    : 'knowledge_embedding'
}

async function createOpenAiCompatibleTextEmbedding(input: {
  text: string
  provider: string
  model: string
  apiKey: string
  endpoint: string
  timeoutMs: number
  maxRetries: number
  dimensions: number
  runtimeVersion: string
}): Promise<KnowledgeEmbeddingResult> {
  if (!input.text) {
    return createKnowledgeEmbeddingResult({
      embedding: [],
      provider: input.provider,
      model: input.model,
      fallbackUsed: true,
      attempts: 1,
      clientType: 'openai-compatible',
      apiStyle: 'openai-compatible-text',
      inputType: 'text',
      dimensions: input.dimensions,
      fusionUsed: false,
      runtimeVersion: input.runtimeVersion,
      failureReason: 'EMBEDDING_EMPTY_INPUT',
    })
  }

  if (!input.apiKey || !input.model || !input.endpoint) {
    return createKnowledgeEmbeddingResult({
      embedding: buildDeterministicKnowledgeEmbedding(input.text, input.dimensions),
      provider: input.provider,
      model: input.model,
      fallbackUsed: true,
      attempts: 1,
      clientType: 'openai-compatible',
      apiStyle: 'openai-compatible-text',
      inputType: 'text',
      dimensions: input.dimensions,
      fusionUsed: false,
      runtimeVersion: input.runtimeVersion,
      failureReason: 'EMBEDDING_RUNTIME_NOT_CONFIGURED',
    })
  }

  const result = await runWithRetry<number[]>({
    maxRetries: input.maxRetries,
    run: async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), input.timeoutMs)
      try {
        const response = await fetch(`${input.endpoint}/embeddings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${input.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: input.model,
            input: input.text,
            dimensions: input.dimensions,
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
    fallback: () => buildDeterministicKnowledgeEmbedding(input.text, input.dimensions),
  })

  return createKnowledgeEmbeddingResult({
    embedding: result.data,
    provider: input.provider,
    model: input.model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
    clientType: 'openai-compatible',
    apiStyle: 'openai-compatible-text',
    inputType: 'text',
    dimensions: result.data.length || input.dimensions,
    fusionUsed: false,
    runtimeVersion: input.runtimeVersion,
    failureReason: result.fallbackUsed ? resolveKnowledgeEmbeddingFailureReason(result.lastError) : '',
  })
}

async function createBailianMultimodalEmbedding(input: {
  contents: KnowledgeEmbeddingContentItem[]
  provider: string
  model: string
  apiKey: string
  baseURL: string
  timeoutMs: number
  maxRetries: number
  dimensions: number
  fusionUsed: boolean
  inputType: ProjectKnowledgeEmbeddingInputType
  runtimeVersion: string
}): Promise<KnowledgeEmbeddingResult> {
  if (input.contents.length === 0) {
    return createKnowledgeEmbeddingResult({
      embedding: [],
      provider: input.provider,
      model: input.model,
      fallbackUsed: false,
      attempts: 1,
      clientType: 'bailian-native',
      apiStyle: 'bailian-multimodal',
      inputType: input.inputType,
      dimensions: input.dimensions,
      fusionUsed: input.fusionUsed,
      runtimeVersion: input.runtimeVersion,
    })
  }

  if (!input.apiKey || !input.model || !input.baseURL)
    throw new Error('BAILIAN_MULTIMODAL_RUNTIME_NOT_CONFIGURED')

  const result = await runWithRetry<{
    embedding: number[]
    inputType: ProjectKnowledgeEmbeddingInputType
    requestId: string
  }>({
    maxRetries: input.maxRetries,
    run: async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), input.timeoutMs)
      try {
        const response = await fetch(`${input.baseURL}/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${input.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: input.model,
            input: {
              contents: input.contents,
            },
            parameters: {
              output_type: 'dense',
              dimension: input.dimensions,
              enable_fusion: input.fusionUsed,
            },
          }),
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({})) as BailianMultimodalEmbeddingResponse
        if (!response.ok)
          throw new Error(`BAILIAN_MULTIMODAL_HTTP_${response.status}:${payload.message || payload.code || 'UNKNOWN'}`)
        const embeddings = Array.isArray(payload.output?.embeddings) ? payload.output?.embeddings : []
        const firstEmbedding = embeddings[0]
        const embedding = normalizeEmbeddingOutput(firstEmbedding?.embedding)
        if (!embedding.length)
          throw new Error(`BAILIAN_MULTIMODAL_EMPTY:${payload.message || payload.code || 'NO_VECTOR'}`)
        return {
          embedding,
          inputType: normalizeBailianEmbeddingType(firstEmbedding?.type, input.inputType),
          requestId: String(payload.request_id || '').trim(),
        }
      }
      finally {
        clearTimeout(timer)
      }
    },
  })

  return createKnowledgeEmbeddingResult({
    embedding: result.data.embedding,
    provider: input.provider,
    model: input.model,
    fallbackUsed: false,
    attempts: result.attempts,
    clientType: 'bailian-native',
    apiStyle: 'bailian-multimodal',
    inputType: result.data.inputType,
    dimensions: result.data.embedding.length || input.dimensions,
    fusionUsed: input.fusionUsed,
    runtimeVersion: input.runtimeVersion,
    requestId: result.data.requestId,
  })
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
  contents?: KnowledgeEmbeddingContentItem[]
  inputType?: ProjectKnowledgeEmbeddingInputType
  enableFusion?: boolean
  event?: H3Event
}): Promise<KnowledgeEmbeddingResult> {
  const profile = await resolveKnowledgeEmbeddingRuntimeProfile(input)
  const useCache = Boolean(input.event)
    && profile.channelKey === 'knowledge_embedding'
    && profile.inputType === 'text'
    && !profile.fusionUsed
    && profile.sourceText.length > 0
  const cacheKey = useCache
    ? buildKnowledgeEmbeddingCacheKey({
        text: profile.sourceText,
        contents: profile.contents,
        provider: profile.provider,
        model: profile.model,
        apiStyle: profile.apiStyle,
        dimensions: profile.dimensions,
        inputType: profile.inputType,
        fusionUsed: profile.fusionUsed,
      })
    : ''
  if (cacheKey) {
    const cache = getKnowledgeEmbeddingCache()
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now())
      return cloneKnowledgeEmbeddingResult(cached.value)
    if (cached)
      cache.delete(cacheKey)
  }

  let result: KnowledgeEmbeddingResult
  if (profile.apiStyle === 'bailian-multimodal') {
    if (!profile.runtimeConfigured || !profile.normalizedApiKey)
      throw new Error('BAILIAN_MULTIMODAL_RUNTIME_NOT_CONFIGURED')

    result = await createBailianMultimodalEmbedding({
      contents: profile.contents,
      provider: profile.provider,
      model: profile.model,
      apiKey: profile.normalizedApiKey,
      baseURL: profile.baseURL,
      timeoutMs: profile.timeoutMs,
      maxRetries: profile.maxRetries,
      dimensions: profile.dimensions,
      fusionUsed: profile.fusionUsed,
      inputType: profile.inputType,
      runtimeVersion: profile.runtimeVersion,
    })
  }
  else if (!profile.runtimeConfigured || !profile.model || !profile.endpoint || !profile.normalizedApiKey) {
    result = createKnowledgeEmbeddingResult({
      embedding: profile.sourceText ? buildDeterministicKnowledgeEmbedding(profile.sourceText, profile.dimensions) : [],
      provider: profile.provider,
      model: profile.model,
      fallbackUsed: true,
      attempts: 1,
      clientType: 'openai-compatible',
      apiStyle: 'openai-compatible-text',
      inputType: 'text',
      dimensions: profile.dimensions,
      fusionUsed: false,
      runtimeVersion: profile.runtimeVersion,
      failureReason: 'EMBEDDING_RUNTIME_NOT_CONFIGURED',
    })
  }
  else {
    result = await createOpenAiCompatibleTextEmbedding({
      text: profile.sourceText,
      provider: profile.provider,
      model: profile.model,
      apiKey: profile.normalizedApiKey,
      endpoint: profile.endpoint,
      timeoutMs: profile.timeoutMs,
      maxRetries: profile.maxRetries,
      dimensions: profile.dimensions,
      runtimeVersion: profile.runtimeVersion,
    })
  }

  if (cacheKey) {
    getKnowledgeEmbeddingCache().set(cacheKey, {
      cacheKey,
      expiresAt: Date.now() + KNOWLEDGE_EMBEDDING_CACHE_TTL_MS,
      value: cloneKnowledgeEmbeddingResult(result),
    })
  }

  return result
}

export async function resolveKnowledgeEmbeddingRuntimeProfile(input: {
  text?: string
  contents?: KnowledgeEmbeddingContentItem[]
  inputType?: ProjectKnowledgeEmbeddingInputType
  enableFusion?: boolean
  event?: H3Event
  runtime?: RuntimeSettings
}): Promise<KnowledgeEmbeddingRuntimeProfile> {
  const runtime = input.runtime || (await readEffectiveRuntimeSettings(input.event)).runtime
  const sourceText = normalizeKnowledgeEmbeddingInputText({
    text: input.text,
    contents: input.contents,
  })
  const contents = normalizeKnowledgeEmbeddingContents({
    text: input.text,
    contents: input.contents,
  })
  const fusionUsed = Boolean(input.enableFusion)
  const embeddingChannelKey = resolveKnowledgeEmbeddingChannelKey(contents, input.inputType, fusionUsed)
  const channelRuntime = resolveAiRuntimeForChannel(runtime, embeddingChannelKey)
  const channelCandidate = channelRuntime.candidates.find(candidate => candidate.provider && candidate.modelConfig?.capabilities.includes('embedding')) || null
  const modelRuntime = channelCandidate?.provider && channelCandidate.modelConfig
    ? {
        provider: channelCandidate.provider,
        modelConfig: channelCandidate.modelConfig,
        ai: channelCandidate.ai,
      }
    : null
  const embeddingAi = modelRuntime?.ai || channelRuntime.ai
  const provider = normalizeAiRuntimeProvider(embeddingAi.provider)
  const apiStyle = normalizeProjectKnowledgeEmbeddingApiStyle(
    modelRuntime?.modelConfig.embeddingApiStyle,
    resolvePlatformAiChannelEmbeddingApiStyle(embeddingChannelKey) || undefined,
  )
  const model = normalizeEmbeddingModel(modelRuntime?.modelConfig.model || embeddingAi.model || '')
  const dimensions = resolveKnowledgeEmbeddingDimensions({
    apiStyle,
    model,
    configured: modelRuntime?.modelConfig.embeddingDimensions || 0,
  })
  const normalizedApiKey = normalizePlatformAiApiKey(embeddingAi.apiKey)
  const timeoutMs = Math.max(3_000, Math.min(120_000, Number(embeddingAi.timeoutMs || 15_000)))
  const maxRetries = Math.max(0, Math.min(6, Number(embeddingAi.maxRetries || 0)))
  const endpoint = resolvePlatformAiRequestBaseURL(embeddingAi.baseURL, provider)
  const embeddingRuntimeConfigured = isAiRuntimeConfigured({
    provider: embeddingAi.provider,
    baseURL: embeddingAi.baseURL,
    apiKey: embeddingAi.apiKey,
    model,
  })

  return {
    sourceText,
    contents,
    channelKey: embeddingChannelKey,
    provider,
    model,
    clientType: apiStyle === 'bailian-multimodal' ? 'bailian-native' : 'openai-compatible',
    apiStyle,
    inputType: input.inputType || inferKnowledgeEmbeddingInputType(contents, fusionUsed),
    dimensions,
    fusionUsed,
    runtimeVersion: buildKnowledgeEmbeddingRuntimeVersion({
      provider,
      model,
      apiStyle,
      dimensions,
    }),
    signature: buildKnowledgeEmbeddingSignature({
      provider,
      model,
      apiStyle,
      dimensions,
      inputType: input.inputType || inferKnowledgeEmbeddingInputType(contents, fusionUsed),
      fusionUsed,
    }),
    runtimeConfigured: embeddingRuntimeConfigured && Boolean(model) && (apiStyle === 'bailian-multimodal'
      ? Boolean(resolveDashScopeNativeBaseURL(embeddingAi.baseURL, provider)) && Boolean(normalizedApiKey)
      : Boolean(endpoint) && Boolean(normalizedApiKey)),
    normalizedApiKey,
    endpoint,
    baseURL: resolveDashScopeNativeBaseURL(embeddingAi.baseURL, provider),
    timeoutMs,
    maxRetries,
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
  const { runtime } = await readEffectiveRuntimeSettings(input.event)
  const resolved = resolveAiRuntimeForChannel(runtime, 'admin_general')
  const provider = normalizeAiRuntimeProvider(resolved.ai.provider)
  const model = toKnowledgeText(resolved.ai.model)
  const normalizedText = toKnowledgeText(input.text).slice(0, 12_000)
  const fallback = buildAnalysisFallback(normalizedText)

  if (!normalizedText || !isAiRuntimeConfigured(resolved.ai)) {
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
    clientType: normalizePlatformAiClientType(resolved.ai.clientType),
    baseURL: resolved.ai.baseURL,
    apiKey: resolved.ai.apiKey,
    model,
    format: resolved.ai.format || (provider === 'response' ? 'response' : 'openai-compatible'),
    temperature: 0.1,
    topP: resolved.ai.topP,
    maxTokens: resolved.ai.maxTokens,
    presencePenalty: resolved.ai.presencePenalty,
    frequencyPenalty: resolved.ai.frequencyPenalty,
    timeoutMs: resolved.ai.timeoutMs,
    maxRetries: resolved.ai.maxRetries,
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
    maxRetries: Math.max(0, Math.min(6, Number(resolved.ai.maxRetries || 0))),
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
