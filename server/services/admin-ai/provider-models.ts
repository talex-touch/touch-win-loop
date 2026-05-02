import type { PlatformAiModelCapability, PlatformAiProviderAdapter } from '~~/server/utils/platform-ai-channels'
import { normalizePlatformAiApiKey, normalizePlatformAiBaseURL, resolveDashScopeNativeBaseURL, resolvePlatformAiRequestBaseURL } from '~~/server/utils/platform-ai-base-url'
import { inferPlatformAiModelCapabilities } from '~~/server/utils/platform-ai-channels'

export type ProviderModelScope = 'llm' | 'docAi' | 'provider'

export interface ProviderModelItem {
  id: string
  provider: string
  model: string
  label: string
  mode: ProviderModelScope
  capabilities: PlatformAiModelCapability[]
  sourceEndpoint?: string
  rawText?: string
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: 'provider' | 'pricing_table' | 'none'
  pricingText: string
}

interface DiscoverProviderModelsInput {
  scope: ProviderModelScope
  provider: string
  baseURL: string
  apiKey: string
  adapter?: PlatformAiProviderAdapter
  modelPricingJson?: string
  timeoutMs?: number
}

interface RemotePricing {
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  source: 'provider' | 'pricing_table'
}

interface PricingTableItem {
  provider: string
  modelPattern: string
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
}

function toNonEmptyString(value: unknown): string {
  return String(value || '').trim()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return value

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.e+-]/gi, '')
    if (!cleaned)
      return null
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed))
      return parsed
  }

  return null
}

function toPricePer1M(raw: number | null): number | null {
  if (raw === null || raw <= 0)
    return null

  if (raw < 0.05)
    return raw * 1_000_000

  return raw
}

function formatPriceValue(value: number | null, currency: string): string {
  if (value === null)
    return '-'
  return `${currency} ${value.toFixed(4)}/1M`
}

function formatPricingText(
  inputPricePer1M: number | null,
  outputPricePer1M: number | null,
  currency: string,
): string {
  if (inputPricePer1M === null && outputPricePer1M === null)
    return '默认未计费'

  if (inputPricePer1M !== null && outputPricePer1M !== null)
    return `输入 ${formatPriceValue(inputPricePer1M, currency)} · 输出 ${formatPriceValue(outputPricePer1M, currency)}`

  if (inputPricePer1M !== null)
    return `输入 ${formatPriceValue(inputPricePer1M, currency)}`

  return `输出 ${formatPriceValue(outputPricePer1M, currency)}`
}

function parsePricingTable(input: string, defaultProvider: string): PricingTableItem[] {
  const raw = toNonEmptyString(input)
  if (!raw)
    return []

  try {
    const parsed = JSON.parse(raw)
    const source = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items))
          ? (parsed as Record<string, unknown>).items as unknown[]
          : []

    return source
      .map((record) => {
        if (!record || typeof record !== 'object' || Array.isArray(record))
          return null
        const item = record as Record<string, unknown>

        const modelPattern = toNonEmptyString(item.model || item.modelPattern || item.id)
        if (!modelPattern)
          return null

        const provider = toNonEmptyString(item.provider) || defaultProvider
        const inputPricePer1M = readPricingNumber(item, [
          'inputPricePer1M',
          'input_per_1m',
          'inputPer1M',
          'promptPricePer1M',
          'prompt_per_1m',
        ])
        const outputPricePer1M = readPricingNumber(item, [
          'outputPricePer1M',
          'output_per_1m',
          'outputPer1M',
          'completionPricePer1M',
          'completion_per_1m',
        ])
        if (inputPricePer1M === null && outputPricePer1M === null)
          return null

        return {
          provider: provider.toLowerCase(),
          modelPattern,
          inputPricePer1M,
          outputPricePer1M,
          currency: toNonEmptyString(item.currency).toUpperCase() || 'USD',
        } satisfies PricingTableItem
      })
      .filter((item): item is PricingTableItem => Boolean(item))
  }
  catch {
    return []
  }
}

function resolvePricingFromTable(
  table: PricingTableItem[],
  provider: string,
  model: string,
): RemotePricing | null {
  const normalizedProvider = provider.toLowerCase()
  const exactCandidates = table.filter(item => item.provider === normalizedProvider && item.modelPattern === model)
  if (exactCandidates[0]) {
    const item = exactCandidates[0]
    return {
      inputPricePer1M: item.inputPricePer1M,
      outputPricePer1M: item.outputPricePer1M,
      currency: item.currency,
      source: 'pricing_table',
    }
  }

  const wildcardCandidates = table
    .filter((item) => {
      if (item.provider !== normalizedProvider)
        return false
      if (!item.modelPattern.endsWith('*'))
        return false
      const prefix = item.modelPattern.slice(0, -1)
      return model.startsWith(prefix)
    })
    .sort((a, b) => b.modelPattern.length - a.modelPattern.length)

  const fallback = wildcardCandidates[0]
  if (!fallback)
    return null

  return {
    inputPricePer1M: fallback.inputPricePer1M,
    outputPricePer1M: fallback.outputPricePer1M,
    currency: fallback.currency,
    source: 'pricing_table',
  }
}

function appendPath(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

const DASH_SCOPE_MULTIMODAL_EMBEDDING_PATH = '/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding'

function isDashScopeProvider(provider: string, baseURL = ''): boolean {
  const text = `${provider} ${baseURL}`.toLowerCase()
  return text.includes('dashscope') || text.includes('bailian') || text.includes('qwen') || text.includes('aliyuncs.com')
}

export function resolveDashScopeMultimodalEmbeddingEndpoint(baseURL: string, provider: string): string {
  if (!isDashScopeProvider(provider, baseURL))
    return ''
  const nativeBase = resolveDashScopeNativeBaseURL(baseURL, provider)
  return nativeBase ? appendPath(nativeBase, DASH_SCOPE_MULTIMODAL_EMBEDDING_PATH) : ''
}

function resolveModelsEndpoints(
  baseURL: string,
  provider: string,
): string[] {
  const normalizedProvider = toNonEmptyString(provider).toLowerCase()
  if (!normalizedProvider)
    throw new Error('共享上游 provider 未配置，无法拉取模型列表。')

  const normalizedBase = normalizePlatformAiBaseURL(baseURL, normalizedProvider)
  if (!normalizedBase)
    throw new Error('共享上游 baseURL 未配置，无法拉取模型列表。')

  const requestBase = resolvePlatformAiRequestBaseURL(normalizedBase, normalizedProvider)
  const candidates: string[] = []

  candidates.push(appendPath(requestBase, 'models'))
  if (!(normalizedProvider === 'newapi' || normalizedProvider.includes('newapi')))
    candidates.push(appendPath(normalizedBase, 'models'))

  const unique: string[] = []
  for (const item of candidates) {
    if (!unique.includes(item))
      unique.push(item)
  }
  return unique
}

function buildSuggestedProviderModels(input: {
  scope: ProviderModelScope
  provider: string
  baseURL: string
}): ProviderModelItem[] {
  if (!isDashScopeProvider(input.provider, input.baseURL))
    return []

  const endpoint = resolveDashScopeMultimodalEmbeddingEndpoint(input.baseURL, input.provider)
  if (!endpoint)
    return []

  const model = 'tongyi-embedding-vision-plus'
  const label = 'Tongyi Embedding Vision Plus'
  return [{
    id: `${input.provider}:${model}`,
    provider: input.provider,
    model,
    label,
    mode: input.scope,
    capabilities: ['embedding'],
    sourceEndpoint: endpoint,
    rawText: JSON.stringify({
      id: model,
      name: label,
      source: 'dashscope-native-suggested',
      endpoint,
    }),
    inputPricePer1M: null,
    outputPricePer1M: null,
    currency: 'USD',
    pricingSource: 'none',
    pricingText: '默认未计费',
  }]
}

function readPricingNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    const parsed = toNumber(value)
    if (parsed !== null && parsed > 0)
      return parsed
  }
  return null
}

function readRemotePricing(record: Record<string, unknown>): RemotePricing | null {
  const pricing = record.pricing && typeof record.pricing === 'object'
    ? record.pricing as Record<string, unknown>
    : null

  const inputRaw = pricing
    ? readPricingNumber(pricing, ['input', 'prompt', 'input_cost_per_token', 'prompt_cost_per_token'])
    : readPricingNumber(record, [
        'input_cost_per_token',
        'prompt_cost_per_token',
        'inputPricePerToken',
        'promptPricePerToken',
        'input_price_per_token',
      ])

  const outputRaw = pricing
    ? readPricingNumber(pricing, ['output', 'completion', 'output_cost_per_token', 'completion_cost_per_token'])
    : readPricingNumber(record, [
        'output_cost_per_token',
        'completion_cost_per_token',
        'outputPricePerToken',
        'completionPricePerToken',
        'output_price_per_token',
      ])

  const inputPricePer1M = toPricePer1M(inputRaw)
  const outputPricePer1M = toPricePer1M(outputRaw)

  if (inputPricePer1M === null && outputPricePer1M === null)
    return null

  return {
    inputPricePer1M,
    outputPricePer1M,
    currency: 'USD',
    source: 'provider',
  }
}

function toModelRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null
  return raw as Record<string, unknown>
}

function isErrorEnvelope(record: Record<string, unknown>): boolean {
  const metaKeys = [
    'success',
    'message',
    'msg',
    'error',
    'code',
    'type',
    'status',
    'request_id',
    'requestId',
  ]
  const hasMetaKey = metaKeys.some(key => key in record)
  if (!hasMetaKey)
    return false

  const hasModelContainer = [
    record.data,
    record.models,
    record.items,
    record.result,
    record.payload,
    record.model_ids,
    record.modelIds,
    record.available_models,
  ].some((value) => {
    if (Array.isArray(value))
      return value.length > 0
    return Boolean(toModelRecord(value))
  })

  return !hasModelContainer
}

function maybeModelRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    const model = toNonEmptyString(raw)
    if (!model)
      return null
    return {
      id: model,
      model,
      name: model,
    }
  }

  const record = toModelRecord(raw)
  if (!record)
    return null
  if (toNonEmptyString(record.id || record.model || record.name || record.model_name))
    return record
  return null
}

function extractModelItemsFromMap(payload: unknown): Record<string, unknown>[] {
  const source = toModelRecord(payload)
  if (!source)
    return []

  const entries = Object.entries(source)
  if (entries.length === 0 || entries.length > 2000)
    return []

  const records: Record<string, unknown>[] = []
  for (const [key, value] of entries) {
    const modelKey = toNonEmptyString(key)
    if (!modelKey)
      continue

    if (Array.isArray(value)) {
      const nestedRecords = value
        .map(item => maybeModelRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))

      if (nestedRecords.length > 0) {
        records.push(...nestedRecords)
        continue
      }
    }

    if (typeof value === 'string') {
      const label = toNonEmptyString(value)
      records.push({
        id: modelKey,
        model: modelKey,
        name: label || modelKey,
      })
      continue
    }

    const record = toModelRecord(value)
    if (record) {
      records.push({
        ...record,
        id: toNonEmptyString(record.id) || modelKey,
        model: toNonEmptyString(record.model) || modelKey,
        name: toNonEmptyString(record.name) || modelKey,
      })
      continue
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      records.push({
        id: modelKey,
        model: modelKey,
        name: modelKey,
      })
    }
  }

  const valid = records.filter((item) => {
    const id = toNonEmptyString(item.id || item.model || item.name || item.model_name)
    return Boolean(id)
  })

  if (valid.length === 0)
    return []

  return valid
}

function extractModelItems(payload: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5)
    return []

  if (Array.isArray(payload)) {
    return payload
      .map(item => maybeModelRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
  }

  const objectPayload = toModelRecord(payload)
  if (!objectPayload)
    return []
  if (isErrorEnvelope(objectPayload))
    return []

  const direct = maybeModelRecord(objectPayload)
  if (direct)
    return [direct]

  const candidates: unknown[] = [
    objectPayload.data,
    objectPayload.models,
    objectPayload.items,
    objectPayload.result,
    objectPayload.payload,
    objectPayload.model_ids,
    objectPayload.modelIds,
    objectPayload.available_models,
  ]

  for (const candidate of candidates) {
    const records = extractModelItems(candidate, depth + 1)
    if (records.length > 0)
      return records
  }

  const mapRecords = extractModelItemsFromMap(objectPayload)
  if (mapRecords.length > 0)
    return mapRecords

  return []
}

function resolveModelId(record: Record<string, unknown>): string {
  return toNonEmptyString(record.id)
    || toNonEmptyString(record.model)
    || toNonEmptyString(record.name)
    || toNonEmptyString(record.model_name)
}

function resolveModelLabel(record: Record<string, unknown>, model: string): string {
  return toNonEmptyString(record.name)
    || toNonEmptyString(record.label)
    || toNonEmptyString(record.display_name)
    || model
}

function buildModelRawText(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record)
  }
  catch {
    return ''
  }
}

function shouldTryNextEndpoint(status: number): boolean {
  return status === 404 || status === 405 || status === 406 || status === 501
}

function readResponseContentType(response: Response): string {
  return response.headers?.get?.('content-type') || ''
}

async function fetchModelsPayload(input: {
  endpoints: string[]
  apiKey: string
  timeoutMs: number
}): Promise<{ payload: unknown, endpoint: string }> {
  const errors: string[] = []

  for (const endpoint of input.endpoints) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), input.timeoutMs)

    try {
      console.warn('[admin-ai][provider-models] requesting endpoint', {
        endpoint,
        timeoutMs: input.timeoutMs,
        apiKeyPresent: Boolean(input.apiKey),
        apiKeyLength: String(input.apiKey || '').length,
      })
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '')
        console.warn('[admin-ai][provider-models] endpoint failed', {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          contentType: readResponseContentType(response),
          bodyPreview: bodyText.slice(0, 200),
        })
        errors.push(`${endpoint} -> ${response.status} ${response.statusText}${bodyText ? ` (${bodyText.slice(0, 80)})` : ''}`)
        if (shouldTryNextEndpoint(response.status))
          continue
        throw new Error(`拉取模型失败（${response.status} ${response.statusText}）`)
      }

      const payload = await response.json().catch(() => null)
      if (payload === null) {
        console.warn('[admin-ai][provider-models] endpoint returned non-json payload', {
          endpoint,
          status: response.status,
          contentType: readResponseContentType(response),
        })
        errors.push(`${endpoint} -> 200 OK（返回内容不是合法 JSON）`)
        continue
      }

      const records = extractModelItems(payload)
      if (records.length === 0) {
        const payloadKeys = toModelRecord(payload) ? Object.keys(payload as Record<string, unknown>).slice(0, 6).join(', ') : ''
        console.warn('[admin-ai][provider-models] endpoint returned unsupported payload', {
          endpoint,
          status: response.status,
          contentType: readResponseContentType(response),
          payloadKeys,
        })
        errors.push(`${endpoint} -> 200 OK（未解析到模型${payloadKeys ? `，顶层字段：${payloadKeys}` : ''}）`)
        continue
      }

      console.warn('[admin-ai][provider-models] endpoint succeeded', {
        endpoint,
        modelCount: records.length,
      })
      return {
        payload,
        endpoint,
      }
    }
    catch (error: any) {
      const message = String(error?.message || 'unknown error')
      console.warn('[admin-ai][provider-models] request threw error', {
        endpoint,
        message,
      })
      errors.push(`${endpoint} -> ${message}`)
      continue
    }
    finally {
      clearTimeout(timer)
    }
  }

  throw new Error(`拉取模型失败，已尝试 ${input.endpoints.length} 个端点。${errors.length > 0 ? ` 明细：${errors.slice(0, 3).join(' | ')}` : ''}`)
}

export async function discoverProviderModels(input: DiscoverProviderModelsInput): Promise<ProviderModelItem[]> {
  const apiKey = normalizePlatformAiApiKey(input.apiKey)
  if (!apiKey)
    throw new Error('API Key 未配置，无法拉取模型列表。')

  const provider = toNonEmptyString(input.provider)
  if (!provider)
    throw new Error('共享上游 provider 未配置，无法拉取模型列表。')

  const pricingTable = parsePricingTable(String(input.modelPricingJson || ''), provider)
  const timeoutMs = Math.max(3000, Math.min(60000, Number(input.timeoutMs || 12000)))
  const endpoints = resolveModelsEndpoints(input.baseURL, provider)

  const { payload, endpoint } = await fetchModelsPayload({
    endpoints,
    apiKey,
    timeoutMs,
  })

  const records = extractModelItems(payload)
  if (records.length === 0)
    throw new Error('模型接口返回成功，但未解析到可用模型。')

  const deduped = new Map<string, ProviderModelItem>()
  for (const record of records) {
    const model = resolveModelId(record)
    if (!model)
      continue

    const label = resolveModelLabel(record, model)
    const rawText = buildModelRawText(record)
    const remotePricing = readRemotePricing(record)
    const tablePricing = resolvePricingFromTable(pricingTable, provider, model)
    const inputPricePer1M = remotePricing?.inputPricePer1M ?? tablePricing?.inputPricePer1M ?? null
    const outputPricePer1M = remotePricing?.outputPricePer1M ?? tablePricing?.outputPricePer1M ?? null
    const currency = remotePricing?.currency || tablePricing?.currency || 'USD'
    const pricingSource = remotePricing?.source || tablePricing?.source || 'none'
    const item: ProviderModelItem = {
      id: `${provider}:${model}`,
      provider,
      model,
      label,
      mode: input.scope,
      capabilities: inferPlatformAiModelCapabilities({
        model,
        label,
        provider,
        rawText,
      }),
      sourceEndpoint: endpoint,
      rawText,
      inputPricePer1M,
      outputPricePer1M,
      currency,
      pricingSource,
      pricingText: formatPricingText(inputPricePer1M, outputPricePer1M, currency),
    }

    deduped.set(model, item)
  }

  for (const item of buildSuggestedProviderModels({
    scope: input.scope,
    provider,
    baseURL: input.baseURL,
  })) {
    if (!deduped.has(item.model))
      deduped.set(item.model, item)
  }

  return Array.from(deduped.values()).sort((a, b) => a.model.localeCompare(b.model, 'en'))
}
