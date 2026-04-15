import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { RuntimeSettings } from '~~/server/utils/env'
import { normalizePlatformAiBaseURL } from '~~/server/utils/platform-ai-base-url'

export type PlatformAiProviderAdapter = 'openai-compatible' | 'response'
export type PlatformAiModelFormat = 'openai-compatible' | 'response'
export type PlatformAiPricingSource = 'provider' | 'manual' | 'none'
export type PlatformAiChannelKey
  = 'contest_filter'
    | 'project_chat'
    | 'topic_proposal'
    | 'defense'
    | 'workspace_dialog_ask'
    | 'workspace_auto_optimize'
    | 'workspace_issue_discovery'
    | 'workspace_document_summarize'
    | 'workspace_document_rewrite'
    | 'workspace_document_continue'
    | 'workspace_document_expand'
    | 'workspace_document_complete_context'
    | 'workspace_document_restructure'
    | 'workspace_canvas_generate'
    | 'workspace_canvas_complete'
    | 'workspace_canvas_refine'
    | 'workspace_document_assist'
    | 'admin_general'
    | 'admin_publish_assistant'
    | 'document_analysis'

export interface PlatformAiProviderModelConfig {
  model: string
  label: string
  format: PlatformAiModelFormat
  enabled: boolean
  providerInputPricePer1M: number | null
  providerOutputPricePer1M: number | null
  manualInputPricePer1M: number | null
  manualOutputPricePer1M: number | null
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: PlatformAiPricingSource
  manualPriceOverride: boolean
}

export interface PlatformAiProviderConfig {
  id: string
  name: string
  adapter: PlatformAiProviderAdapter
  provider: string
  baseURL: string
  apiKey: string
  enabled: boolean
  timeoutMs: number
  maxRetries: number
  fetchedAt: string
  models: PlatformAiProviderModelConfig[]
}

export interface PlatformAiSharedDefaults {
  defaultModel: string
  embeddingModel: string
  documentModel: string
}

export interface PlatformAiChannelConfig {
  key: PlatformAiChannelKey
  label: string
  description: string
  enabled: boolean
  models: string[]
  prompt: string
}

export interface PlatformAiChannelDefinition {
  key: PlatformAiChannelKey
  label: string
  description: string
}

export interface PlatformAiResolvedRegistry {
  providers: PlatformAiProviderConfig[]
  channels: PlatformAiChannelConfig[]
  defaults: PlatformAiSharedDefaults
}

export interface PlatformAiResolvedChannelCandidate {
  index: number
  provider: PlatformAiProviderConfig | null
  modelConfig: PlatformAiProviderModelConfig | null
  ai: AiRuntimeConfig
}

export interface PlatformAiResolvedChannelRuntime {
  key: PlatformAiChannelKey
  channel: PlatformAiChannelConfig
  provider: PlatformAiProviderConfig | null
  ai: AiRuntimeConfig
  prompt: string
  usedFallback: boolean
  candidates: PlatformAiResolvedChannelCandidate[]
  defaults: PlatformAiSharedDefaults
}

export interface PlatformAiAggregatedModelItem {
  providerId: string
  providerName: string
  adapter: PlatformAiProviderAdapter
  provider: string
  providerEnabled: boolean
  model: string
  label: string
  format: PlatformAiModelFormat
  modelEnabled: boolean
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: PlatformAiPricingSource
  manualPriceOverride: boolean
}

export interface PlatformAiChannelAttemptSummary {
  provider: string
  model: string
  success: boolean
  error?: string
}

export interface PlatformAiChannelRunResult<T> {
  data: T
  provider: PlatformAiProviderConfig | null
  ai: AiRuntimeConfig
  channel: PlatformAiChannelConfig
  prompt: string
  usedFallback: boolean
  attemptChain: PlatformAiChannelAttemptSummary[]
}

const PLATFORM_AI_REGISTRY_VERSION = 2
const SHARED_PROVIDER_ID = 'shared'
const SHARED_PROVIDER_NAME = '共享上游'

const CHANNEL_DEFINITIONS: PlatformAiChannelDefinition[] = [
  { key: 'contest_filter', label: '选赛过滤', description: '竞赛筛选与推荐排序' },
  { key: 'project_chat', label: '项目聊天', description: '项目草案对话与改写' },
  { key: 'topic_proposal', label: '选题助手', description: '命题建议与路线生成' },
  { key: 'defense', label: '答辩模拟', description: '评委问答与评分反馈' },
  { key: 'workspace_dialog_ask', label: '工作台-对话询问', description: '工作台只读问答' },
  { key: 'workspace_auto_optimize', label: '工作台-自动优化', description: '工作台提案优化' },
  { key: 'workspace_issue_discovery', label: '工作台-寻疑发现', description: '工作台问题扫描' },
  { key: 'workspace_document_summarize', label: '文档总结', description: '基于当前选区生成精炼摘要' },
  { key: 'workspace_document_rewrite', label: '文档润写', description: '对当前选区进行润写改写' },
  { key: 'workspace_document_continue', label: '文档续写', description: '基于当前上下文续写文档内容' },
  { key: 'workspace_document_expand', label: '文档扩写', description: '对当前选区做扩写和展开' },
  { key: 'workspace_document_complete_context', label: '文档补全上下文', description: '补全文档缺失上下文与衔接内容' },
  { key: 'workspace_document_restructure', label: '文档结构整理', description: '重整结构与层次，保持内容可直接落文' },
  { key: 'workspace_canvas_generate', label: '画布生成', description: '生成流程图、脑图、ER 图或架构图结构源' },
  { key: 'workspace_canvas_complete', label: '画布补全', description: '基于现有图结构补全缺失节点与关系' },
  { key: 'workspace_canvas_refine', label: '画布续改', description: '基于现有图结构重写和优化结构源' },
  { key: 'admin_general', label: '管理助手-通用', description: '后台管理通用任务' },
  { key: 'admin_publish_assistant', label: '管理助手-发布助手', description: '赛事发布预检与修复建议' },
  { key: 'document_analysis', label: '文档分析', description: '文档解析、预览与重解析' },
]

const LEGACY_DOCUMENT_ASSIST_KEY = 'workspace_document_assist'
const DOCUMENT_ASSIST_CHANNEL_KEYS: PlatformAiChannelKey[] = [
  'workspace_document_summarize',
  'workspace_document_rewrite',
  'workspace_document_continue',
  'workspace_document_expand',
  'workspace_document_complete_context',
  'workspace_document_restructure',
]

function isDocumentAssistChannelKey(key: PlatformAiChannelKey): boolean {
  return DOCUMENT_ASSIST_CHANNEL_KEYS.includes(key)
}

function expandLegacyChannelConfig(
  raw: Record<string, unknown>,
  defaults: PlatformAiSharedDefaults,
  provider: PlatformAiProviderConfig | null,
): PlatformAiChannelConfig[] {
  const models = Array.isArray(raw.models)
    ? dedupeStrings((raw.models as unknown[]).map(item => toText(item)))
    : dedupeStrings([toText(raw.model)])
  const enabled = toBoolean(raw.enabled, true)
  const prompt = String(raw.prompt || '')

  return DOCUMENT_ASSIST_CHANNEL_KEYS.map((key) => {
    const definition = resolveChannelDefinition(key)
    return {
      key,
      label: definition.label,
      description: definition.description,
      enabled,
      models: models.length > 0 ? models : resolveDefaultModelsForChannel(key, defaults, provider),
      prompt,
    }
  })
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized))
      return true
    if (['0', 'false', 'no', 'off'].includes(normalized))
      return false
  }
  return fallback
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return null
  return parsed
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  const next = Number.isFinite(parsed) ? Math.round(parsed) : fallback
  return Math.max(min, Math.min(max, next))
}

function resolveAdapter(value: unknown, provider: string): PlatformAiProviderAdapter {
  const normalized = toText(value).toLowerCase()
  if (normalized === 'response')
    return 'response'
  if (normalized === 'newapi' || normalized === 'sub2api' || normalized === 'openai-compatible')
    return 'openai-compatible'

  const providerText = provider.toLowerCase()
  if (providerText.includes('response'))
    return 'response'
  return 'openai-compatible'
}

function toModelFormat(value: unknown, fallback: PlatformAiModelFormat): PlatformAiModelFormat {
  const normalized = toText(value).toLowerCase()
  if (normalized === 'response')
    return 'response'
  if (normalized === 'openai-compatible' || normalized === 'newapi' || normalized === 'sub2api')
    return 'openai-compatible'
  return fallback
}

function resolvePricingSource(value: unknown): PlatformAiPricingSource {
  const normalized = toText(value).toLowerCase()
  if (normalized === 'provider')
    return 'provider'
  if (normalized === 'manual' || normalized === 'pricing_table')
    return 'manual'
  return 'none'
}

function parseJsonObject(raw: unknown): unknown {
  const text = toText(raw)
  if (!text)
    return null
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const value = toText(item)
    if (!value || seen.has(value))
      continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function resolveEffectivePricing(input: {
  providerInputPricePer1M: number | null
  providerOutputPricePer1M: number | null
  manualInputPricePer1M: number | null
  manualOutputPricePer1M: number | null
  manualPriceOverride: boolean
}): {
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  pricingSource: PlatformAiPricingSource
} {
  const inputPricePer1M = input.manualPriceOverride
    ? (input.manualInputPricePer1M ?? input.providerInputPricePer1M)
    : (input.providerInputPricePer1M ?? input.manualInputPricePer1M)
  const outputPricePer1M = input.manualPriceOverride
    ? (input.manualOutputPricePer1M ?? input.providerOutputPricePer1M)
    : (input.providerOutputPricePer1M ?? input.manualOutputPricePer1M)

  const hasManual = input.manualInputPricePer1M !== null || input.manualOutputPricePer1M !== null
  const hasProvider = input.providerInputPricePer1M !== null || input.providerOutputPricePer1M !== null
  const pricingSource: PlatformAiPricingSource = inputPricePer1M === null && outputPricePer1M === null
    ? 'none'
    : (input.manualPriceOverride && hasManual)
        ? 'manual'
        : hasProvider
          ? 'provider'
          : hasManual
            ? 'manual'
            : 'none'

  return {
    inputPricePer1M,
    outputPricePer1M,
    pricingSource,
  }
}

function normalizeProviderModel(raw: unknown, fallbackFormat: PlatformAiModelFormat): PlatformAiProviderModelConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null

  const source = raw as Record<string, unknown>
  const model = toText(source.model || source.id || source.name)
  if (!model)
    return null

  const legacyPricingSource = resolvePricingSource(source.pricingSource)
  const legacyInputPricePer1M = toNumber(source.inputPricePer1M)
  const legacyOutputPricePer1M = toNumber(source.outputPricePer1M)

  let providerInputPricePer1M = toNumber(source.providerInputPricePer1M ?? source.remoteInputPricePer1M)
  let providerOutputPricePer1M = toNumber(source.providerOutputPricePer1M ?? source.remoteOutputPricePer1M)
  let manualInputPricePer1M = toNumber(source.manualInputPricePer1M)
  let manualOutputPricePer1M = toNumber(source.manualOutputPricePer1M)

  if (providerInputPricePer1M === null && legacyPricingSource === 'provider')
    providerInputPricePer1M = legacyInputPricePer1M
  if (providerOutputPricePer1M === null && legacyPricingSource === 'provider')
    providerOutputPricePer1M = legacyOutputPricePer1M
  if (manualInputPricePer1M === null && legacyPricingSource === 'manual')
    manualInputPricePer1M = legacyInputPricePer1M
  if (manualOutputPricePer1M === null && legacyPricingSource === 'manual')
    manualOutputPricePer1M = legacyOutputPricePer1M

  const manualPriceOverride = toBoolean(
    source.manualPriceOverride,
    manualInputPricePer1M !== null || manualOutputPricePer1M !== null || legacyPricingSource === 'manual',
  )
  const effectivePricing = resolveEffectivePricing({
    providerInputPricePer1M,
    providerOutputPricePer1M,
    manualInputPricePer1M,
    manualOutputPricePer1M,
    manualPriceOverride,
  })

  return {
    model,
    label: toText(source.label || source.name) || model,
    format: toModelFormat(source.format || source.adapter || source.type, fallbackFormat),
    enabled: toBoolean(source.enabled, true),
    providerInputPricePer1M,
    providerOutputPricePer1M,
    manualInputPricePer1M,
    manualOutputPricePer1M,
    inputPricePer1M: effectivePricing.inputPricePer1M,
    outputPricePer1M: effectivePricing.outputPricePer1M,
    currency: toText(source.currency).toUpperCase() || 'USD',
    pricingSource: effectivePricing.pricingSource,
    manualPriceOverride,
  }
}

function dedupeProviderModels(items: PlatformAiProviderModelConfig[]): PlatformAiProviderModelConfig[] {
  const map = new Map<string, PlatformAiProviderModelConfig>()
  for (const item of items) {
    if (!item.model)
      continue
    if (!map.has(item.model)) {
      map.set(item.model, item)
      continue
    }
    map.set(item.model, item)
  }
  return Array.from(map.values())
}

function createModelFromName(
  model: string,
  fallbackFormat: PlatformAiModelFormat,
): PlatformAiProviderModelConfig {
  return {
    model,
    label: model,
    format: fallbackFormat,
    enabled: true,
    providerInputPricePer1M: null,
    providerOutputPricePer1M: null,
    manualInputPricePer1M: null,
    manualOutputPricePer1M: null,
    inputPricePer1M: null,
    outputPricePer1M: null,
    currency: 'USD',
    pricingSource: 'none',
    manualPriceOverride: false,
  }
}

function ensurePoolIncludesModel(
  items: PlatformAiProviderModelConfig[],
  model: string,
  fallbackFormat: PlatformAiModelFormat,
): PlatformAiProviderModelConfig[] {
  const normalizedModel = toText(model)
  if (!normalizedModel)
    return items
  if (items.some(item => item.model === normalizedModel))
    return items
  return [...items, createModelFromName(normalizedModel, fallbackFormat)]
}

function normalizeLegacyProvider(
  raw: unknown,
  index: number,
  runtime: RuntimeSettings,
): PlatformAiProviderConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null

  const source = raw as Record<string, unknown>
  const provider = toText(source.provider) || runtime.ai.provider || 'openai-compatible'
  const id = toText(source.id) || `provider_${index + 1}`
  const adapter = resolveAdapter(source.adapter, provider)
  const modelFormatFallback: PlatformAiModelFormat = adapter === 'response' ? 'response' : 'openai-compatible'
  const modelArray = Array.isArray(source.models)
    ? source.models
        .map(item => normalizeProviderModel(item, modelFormatFallback))
        .filter((item): item is PlatformAiProviderModelConfig => Boolean(item))
    : []
  const fallbackModel = toText(source.model) || runtime.ai.model
  const withFallbackModel = modelArray.length > 0
    ? modelArray
    : fallbackModel
      ? [createModelFromName(fallbackModel, modelFormatFallback)]
      : []

  return {
    id,
    name: toText(source.name) || id,
    adapter,
    provider,
    baseURL: normalizePlatformAiBaseURL(source.baseURL, provider),
    apiKey: String(source.apiKey || ''),
    enabled: toBoolean(source.enabled, true),
    timeoutMs: clampInt(source.timeoutMs, runtime.ai.timeoutMs, 1000, 120000),
    maxRetries: clampInt(source.maxRetries, runtime.ai.maxRetries, 0, 10),
    fetchedAt: toText(source.fetchedAt || source.modelFetchedAt),
    models: dedupeProviderModels(withFallbackModel),
  }
}

function buildDefaultModels(runtime: RuntimeSettings, format: PlatformAiModelFormat): PlatformAiProviderModelConfig[] {
  const items: PlatformAiProviderModelConfig[] = []
  const seeds = dedupeStrings([
    runtime.ai.model,
    runtime.ai.embeddingModel,
    runtime.docAi.model,
  ])

  for (const model of seeds)
    items.push(createModelFromName(model, format))

  if (items.length > 0)
    return items

  return [createModelFromName('gpt-4o-mini', format)]
}

function buildDefaultProvider(runtime: RuntimeSettings): PlatformAiProviderConfig {
  const provider = toText(runtime.ai.provider) || 'openai-compatible'
  const adapter = resolveAdapter(provider, provider)
  const format: PlatformAiModelFormat = adapter === 'response' ? 'response' : 'openai-compatible'

  return {
    id: SHARED_PROVIDER_ID,
    name: SHARED_PROVIDER_NAME,
    adapter,
    provider,
    baseURL: normalizePlatformAiBaseURL(runtime.ai.baseURL, provider),
    apiKey: String(runtime.ai.apiKey || ''),
    enabled: true,
    timeoutMs: clampInt(runtime.ai.timeoutMs, 15000, 1000, 120000),
    maxRetries: clampInt(runtime.ai.maxRetries, 2, 0, 10),
    fetchedAt: '',
    models: buildDefaultModels(runtime, format),
  }
}

function buildSharedDefaults(
  runtime: RuntimeSettings,
  provider: PlatformAiProviderConfig,
  raw?: Record<string, unknown> | null,
): PlatformAiSharedDefaults {
  const availableModels = provider.models.map(item => item.model)
  const preferredEnabledModel = provider.models.find(item => item.enabled)?.model || provider.models[0]?.model || runtime.ai.model
  const defaultModel = toText(raw?.defaultModel || raw?.chatModel || raw?.primaryModel || runtime.ai.model) || preferredEnabledModel || ''
  const embeddingModel = toText(raw?.embeddingModel || runtime.ai.embeddingModel) || defaultModel || preferredEnabledModel || ''
  const documentModel = toText(raw?.documentModel || raw?.docModel || runtime.docAi.model) || defaultModel || preferredEnabledModel || ''

  return {
    defaultModel: availableModels.includes(defaultModel) ? defaultModel : (preferredEnabledModel || defaultModel),
    embeddingModel,
    documentModel: availableModels.includes(documentModel) ? documentModel : (defaultModel || documentModel),
  }
}

function parseLegacyProvidersState(raw: unknown, runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const parsed = parseJsonObject(raw)
  const source = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items))
        ? (parsed as Record<string, unknown>).items as unknown[]
        : []

  const normalized = source
    .map((item, index) => normalizeLegacyProvider(item, index, runtime))
    .filter((item): item is PlatformAiProviderConfig => Boolean(item))

  const legacyProviders = normalized.length > 0 ? normalized : [buildDefaultProvider(runtime)]
  const primaryProvider = legacyProviders[0] || buildDefaultProvider(runtime)
  const mergedModels = dedupeProviderModels(
    legacyProviders.flatMap(provider => provider.models),
  )

  const sharedProvider: PlatformAiProviderConfig = {
    ...primaryProvider,
    id: SHARED_PROVIDER_ID,
    name: SHARED_PROVIDER_NAME,
    apiKey: primaryProvider.apiKey || runtime.ai.apiKey,
    models: mergedModels.length > 0 ? mergedModels : primaryProvider.models,
  }
  const defaults = buildSharedDefaults(runtime, sharedProvider)

  return {
    providers: [sharedProvider],
    channels: [],
    defaults,
  }
}

function parseStructuredProviderState(raw: Record<string, unknown>, runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const providerSource = raw.provider && typeof raw.provider === 'object' && !Array.isArray(raw.provider)
    ? raw.provider as Record<string, unknown>
    : raw.sharedProvider && typeof raw.sharedProvider === 'object' && !Array.isArray(raw.sharedProvider)
      ? raw.sharedProvider as Record<string, unknown>
      : raw.upstream && typeof raw.upstream === 'object' && !Array.isArray(raw.upstream)
        ? raw.upstream as Record<string, unknown>
        : null
  const modelPoolSource = raw.modelPool && typeof raw.modelPool === 'object' && !Array.isArray(raw.modelPool)
    ? raw.modelPool as Record<string, unknown>
    : null
  const provider = toText(providerSource?.provider || raw.providerName || runtime.ai.provider) || 'openai-compatible'
  const adapter = resolveAdapter(providerSource?.adapter || raw.adapter, provider)
  const formatFallback: PlatformAiModelFormat = adapter === 'response' ? 'response' : 'openai-compatible'
  const modelItemsSource = Array.isArray(modelPoolSource?.items)
    ? modelPoolSource?.items as unknown[]
    : Array.isArray(providerSource?.models)
      ? providerSource?.models as unknown[]
      : Array.isArray(raw.models)
        ? raw.models as unknown[]
        : []

  let models = modelItemsSource
    .map(item => normalizeProviderModel(item, formatFallback))
    .filter((item): item is PlatformAiProviderModelConfig => Boolean(item))
  if (models.length === 0)
    models = buildDefaultModels(runtime, formatFallback)

  const sharedProvider: PlatformAiProviderConfig = {
    id: SHARED_PROVIDER_ID,
    name: SHARED_PROVIDER_NAME,
    adapter,
    provider,
    baseURL: normalizePlatformAiBaseURL(providerSource?.baseURL || raw.baseURL || runtime.ai.baseURL, provider),
    apiKey: String(providerSource?.apiKey || runtime.ai.apiKey || ''),
    enabled: toBoolean(providerSource?.enabled ?? raw.enabled, true),
    timeoutMs: clampInt(providerSource?.timeoutMs ?? raw.timeoutMs, runtime.ai.timeoutMs, 1000, 120000),
    maxRetries: clampInt(providerSource?.maxRetries ?? raw.maxRetries, runtime.ai.maxRetries, 0, 10),
    fetchedAt: toText(modelPoolSource?.fetchedAt || providerSource?.fetchedAt || raw.fetchedAt),
    models: dedupeProviderModels(models),
  }
  const defaultsSource = raw.defaults && typeof raw.defaults === 'object' && !Array.isArray(raw.defaults)
    ? raw.defaults as Record<string, unknown>
    : raw
  const defaults = buildSharedDefaults(runtime, sharedProvider, defaultsSource)

  sharedProvider.models = ensurePoolIncludesModel(sharedProvider.models, defaults.defaultModel, formatFallback)
  sharedProvider.models = ensurePoolIncludesModel(sharedProvider.models, defaults.embeddingModel, formatFallback)
  sharedProvider.models = ensurePoolIncludesModel(sharedProvider.models, defaults.documentModel, formatFallback)

  return {
    providers: [sharedProvider],
    channels: [],
    defaults,
  }
}

function parseProviderState(raw: unknown, runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const parsed = parseJsonObject(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    if (
      Number(record.version || 0) >= PLATFORM_AI_REGISTRY_VERSION
      || record.sharedProvider
      || record.upstream
      || record.modelPool
      || record.defaults
      || (record.provider && typeof record.provider === 'object' && !Array.isArray(record.provider))
    ) {
      return parseStructuredProviderState(record, runtime)
    }
  }

  return parseLegacyProvidersState(raw, runtime)
}

function sanitizeScenarioKey(value: unknown): PlatformAiChannelKey | null {
  const key = toText(value) as PlatformAiChannelKey
  if (CHANNEL_DEFINITIONS.some(item => item.key === key))
    return key
  return null
}

function resolveChannelDefinition(key: PlatformAiChannelKey): PlatformAiChannelDefinition {
  return CHANNEL_DEFINITIONS.find(item => item.key === key) || CHANNEL_DEFINITIONS[0]!
}

function resolveDefaultModelsForChannel(
  key: PlatformAiChannelKey,
  defaults: PlatformAiSharedDefaults,
  provider: PlatformAiProviderConfig | null,
): string[] {
  const preferred = key === 'document_analysis' || isDocumentAssistChannelKey(key)
    ? defaults.documentModel
    : defaults.defaultModel
  const fallback = provider?.models.find(item => item.enabled)?.model || provider?.models[0]?.model || preferred
  return dedupeStrings([preferred, fallback])
}

function normalizeChannel(
  raw: unknown,
  defaults: PlatformAiSharedDefaults,
  provider: PlatformAiProviderConfig | null,
): PlatformAiChannelConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null

  const source = raw as Record<string, unknown>
  if (toText(source.key || source.channel || source.scene) === LEGACY_DOCUMENT_ASSIST_KEY)
    return null

  const key = sanitizeScenarioKey(source.key || source.channel || source.scene)
  if (!key)
    return null

  const definition = resolveChannelDefinition(key)
  const models = Array.isArray(source.models)
    ? dedupeStrings((source.models as unknown[]).map(item => toText(item)))
    : dedupeStrings([toText(source.model)])

  return {
    key,
    label: toText(source.label) || definition.label,
    description: toText(source.description) || definition.description,
    enabled: toBoolean(source.enabled, true),
    models: models.length > 0 ? models : resolveDefaultModelsForChannel(key, defaults, provider),
    prompt: String(source.prompt || ''),
  }
}

function parseChannelsFromJson(
  raw: unknown,
  provider: PlatformAiProviderConfig | null,
  defaults: PlatformAiSharedDefaults,
): PlatformAiChannelConfig[] {
  const parsed = parseJsonObject(raw)
  const source = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items))
        ? (parsed as Record<string, unknown>).items as unknown[]
        : []

  const normalized = source
    .flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return []

      const record = item as Record<string, unknown>
      if (toText(record.key || record.channel || record.scene) === LEGACY_DOCUMENT_ASSIST_KEY)
        return expandLegacyChannelConfig(record, defaults, provider)

      const normalizedItem = normalizeChannel(item, defaults, provider)
      return normalizedItem ? [normalizedItem] : []
    })

  const map = new Map<PlatformAiChannelKey, PlatformAiChannelConfig>()
  for (const item of normalized)
    map.set(item.key, item)

  for (const definition of CHANNEL_DEFINITIONS) {
    if (map.has(definition.key))
      continue
    map.set(definition.key, {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      enabled: true,
      models: resolveDefaultModelsForChannel(definition.key, defaults, provider),
      prompt: '',
    })
  }

  return CHANNEL_DEFINITIONS
    .map(item => map.get(item.key))
    .filter((item): item is PlatformAiChannelConfig => Boolean(item))
}

function buildFallbackAi(runtime: RuntimeSettings): AiRuntimeConfig {
  const fallbackAdapter = resolveAdapter(runtime.ai.provider, runtime.ai.provider)
  const fallbackFormat: PlatformAiModelFormat = fallbackAdapter === 'response' ? 'response' : 'openai-compatible'
  return {
    ...runtime.ai,
    format: fallbackFormat,
  }
}

function resolveProviderModel(
  provider: PlatformAiProviderConfig | null,
  model: string,
): PlatformAiProviderModelConfig | null {
  if (!provider)
    return null
  const normalizedModel = toText(model)
  if (!normalizedModel)
    return null
  return provider.models.find(item => item.model === normalizedModel && item.enabled) || null
}

function buildAiRuntimeFromModel(
  runtime: RuntimeSettings,
  provider: PlatformAiProviderConfig,
  model: PlatformAiProviderModelConfig,
): AiRuntimeConfig {
  return {
    ...runtime.ai,
    provider: provider.provider || provider.adapter,
    baseURL: provider.baseURL,
    apiKey: provider.apiKey || runtime.ai.apiKey,
    model: model.model,
    format: model.format,
    timeoutMs: provider.timeoutMs,
    maxRetries: provider.maxRetries,
  }
}

function resolveChannelCandidates(
  runtime: RuntimeSettings,
  channel: PlatformAiChannelConfig,
  provider: PlatformAiProviderConfig | null,
  defaults: PlatformAiSharedDefaults,
): { candidates: PlatformAiResolvedChannelCandidate[], usedFallback: boolean } {
  const fallbackAi = buildFallbackAi(runtime)
  if (!channel.enabled || !provider || !provider.enabled) {
    return {
      candidates: [{
        index: 0,
        provider: null,
        modelConfig: null,
        ai: fallbackAi,
      }],
      usedFallback: true,
    }
  }

  const explicitCandidates = dedupeStrings(channel.models)
    .map(model => resolveProviderModel(provider, model))
    .filter((item): item is PlatformAiProviderModelConfig => Boolean(item))
    .map((item, index) => ({
      index,
      provider,
      modelConfig: item,
      ai: buildAiRuntimeFromModel(runtime, provider, item),
    }))

  if (explicitCandidates.length > 0) {
    return {
      candidates: explicitCandidates,
      usedFallback: false,
    }
  }

  const fallbackModelName = resolveDefaultModelsForChannel(channel.key, defaults, provider)
    .map(model => resolveProviderModel(provider, model))
    .find(Boolean)
  if (fallbackModelName) {
    return {
      candidates: [{
        index: 0,
        provider,
        modelConfig: fallbackModelName,
        ai: buildAiRuntimeFromModel(runtime, provider, fallbackModelName),
      }],
      usedFallback: true,
    }
  }

  return {
    candidates: [{
      index: 0,
      provider: null,
      modelConfig: null,
      ai: fallbackAi,
    }],
    usedFallback: true,
  }
}

function serializeProviderModel(item: PlatformAiProviderModelConfig): PlatformAiProviderModelConfig {
  return {
    ...item,
    providerInputPricePer1M: item.providerInputPricePer1M === null ? null : Number(item.providerInputPricePer1M),
    providerOutputPricePer1M: item.providerOutputPricePer1M === null ? null : Number(item.providerOutputPricePer1M),
    manualInputPricePer1M: item.manualInputPricePer1M === null ? null : Number(item.manualInputPricePer1M),
    manualOutputPricePer1M: item.manualOutputPricePer1M === null ? null : Number(item.manualOutputPricePer1M),
    inputPricePer1M: item.inputPricePer1M === null ? null : Number(item.inputPricePer1M),
    outputPricePer1M: item.outputPricePer1M === null ? null : Number(item.outputPricePer1M),
  }
}

function toSerializableProvider(item: PlatformAiProviderConfig): PlatformAiProviderConfig {
  return {
    ...item,
    models: item.models.map(model => serializeProviderModel(model)),
  }
}

function toSerializableChannels(items: PlatformAiChannelConfig[]): PlatformAiChannelConfig[] {
  return items.map(item => ({
    ...item,
    models: dedupeStrings(item.models),
    prompt: String(item.prompt || ''),
  }))
}

function buildModelCatalogJson(provider: PlatformAiProviderConfig): string {
  const options = provider.models
    .filter(item => item.enabled)
    .map((item) => {
      const priceText = item.inputPricePer1M === null && item.outputPricePer1M === null
        ? '价格未配置'
        : `输入 ${item.inputPricePer1M === null ? '-' : `${item.currency} ${item.inputPricePer1M.toFixed(4)}/1M`} · 输出 ${item.outputPricePer1M === null ? '-' : `${item.currency} ${item.outputPricePer1M.toFixed(4)}/1M`}`
      return {
        id: `${provider.provider}:${item.model}`,
        label: item.label || item.model,
        provider: provider.provider,
        model: item.model,
        description: `${item.format} · ${priceText}`,
      }
    })

  return JSON.stringify({
    groups: options.length > 0
      ? [{
          key: 'platform_ai_model_pool',
          label: '平台统一模型池',
          options,
        }]
      : [],
  }, null, 2)
}

function buildModelPricingJson(provider: PlatformAiProviderConfig): string {
  const items = provider.models
    .filter((item) => {
      return item.inputPricePer1M !== null || item.outputPricePer1M !== null
    })
    .map(item => ({
      provider: provider.provider,
      model: item.model,
      inputPricePer1M: item.inputPricePer1M,
      outputPricePer1M: item.outputPricePer1M,
      currency: item.currency,
      pricingSource: item.pricingSource,
    }))

  return JSON.stringify({ items }, null, 2)
}

export function getPlatformAiChannelDefinitions(): PlatformAiChannelDefinition[] {
  return [...CHANNEL_DEFINITIONS]
}

export function resolvePlatformAiRegistry(runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const providerState = parseProviderState(runtime.ai.providersJson, runtime)
  const provider = providerState.providers[0] || buildDefaultProvider(runtime)
  const channels = parseChannelsFromJson(runtime.ai.channelsJson, provider, providerState.defaults)

  return {
    providers: [toSerializableProvider(provider)],
    channels,
    defaults: providerState.defaults,
  }
}

export function buildPlatformAiRegistryJson(runtime: RuntimeSettings, raw: unknown): string {
  const parsed = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const structured = parseProviderState(
    JSON.stringify({
      version: PLATFORM_AI_REGISTRY_VERSION,
      provider: parsed.provider || parsed.sharedProvider || parsed.upstream || parsed,
      modelPool: parsed.modelPool || { items: parsed.models || [] },
      defaults: parsed.defaults || parsed,
    }),
    runtime,
  )
  const provider = structured.providers[0] || buildDefaultProvider(runtime)

  return JSON.stringify({
    version: PLATFORM_AI_REGISTRY_VERSION,
    provider: {
      id: provider.id,
      name: provider.name,
      adapter: provider.adapter,
      provider: provider.provider,
      baseURL: provider.baseURL,
      enabled: provider.enabled,
      timeoutMs: provider.timeoutMs,
      maxRetries: provider.maxRetries,
      fetchedAt: provider.fetchedAt,
      models: provider.models.map(item => serializeProviderModel(item)),
    },
    modelPool: {
      fetchedAt: provider.fetchedAt,
      items: provider.models.map(item => serializeProviderModel(item)),
    },
    defaults: structured.defaults,
  }, null, 2)
}

export function buildPlatformAiChannelsJson(
  runtime: RuntimeSettings,
  raw: unknown,
  providers?: PlatformAiProviderConfig[],
): string {
  const registry = resolvePlatformAiRegistry(runtime)
  const provider = providers?.[0] || registry.providers[0] || null
  const source = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).items))
        ? (raw as Record<string, unknown>).items as unknown[]
        : []

  const channels = source
    .map(item => normalizeChannel(item, registry.defaults, provider))
    .filter((item): item is PlatformAiChannelConfig => Boolean(item))
  const merged = parseChannelsFromJson(JSON.stringify({ items: channels }), provider, registry.defaults)

  return JSON.stringify({
    version: PLATFORM_AI_REGISTRY_VERSION,
    items: toSerializableChannels(merged),
  }, null, 2)
}

export function resolvePlatformAiModelCatalogJson(runtime: RuntimeSettings): string {
  const registry = resolvePlatformAiRegistry(runtime)
  const provider = registry.providers[0]
  return provider ? buildModelCatalogJson(provider) : ''
}

export function resolvePlatformAiModelPricingJson(runtime: RuntimeSettings): string {
  const registry = resolvePlatformAiRegistry(runtime)
  const provider = registry.providers[0]
  return provider ? buildModelPricingJson(provider) : ''
}

export function resolvePlatformAiDocumentRuntime(runtime: RuntimeSettings): AiRuntimeConfig {
  const resolved = resolveAiRuntimeForChannel(runtime, 'document_analysis')
  return resolved.ai
}

export function resolveAiRuntimeForChannel(
  runtime: RuntimeSettings,
  key: PlatformAiChannelKey,
): PlatformAiResolvedChannelRuntime {
  const registry = resolvePlatformAiRegistry(runtime)
  const provider = registry.providers[0] || null
  const fallbackAi = buildFallbackAi(runtime)
  const channel = registry.channels.find(item => item.key === key) || {
    key,
    label: key,
    description: '',
    enabled: true,
    models: resolveDefaultModelsForChannel(key, registry.defaults, provider),
    prompt: '',
  }
  const resolved = resolveChannelCandidates(runtime, channel, provider, registry.defaults)
  const selectedCandidate = resolved.candidates[0]

  return {
    key,
    channel,
    provider: selectedCandidate?.provider || null,
    ai: selectedCandidate?.ai || fallbackAi,
    prompt: channel.prompt || '',
    usedFallback: resolved.usedFallback,
    candidates: resolved.candidates.length > 0
      ? resolved.candidates
      : [{
          index: 0,
          provider: null,
          modelConfig: null,
          ai: fallbackAi,
        }],
    defaults: registry.defaults,
  }
}

export async function runWithPlatformAiChannelFallback<T>(
  runtime: RuntimeSettings,
  key: PlatformAiChannelKey,
  run: (input: {
    ai: AiRuntimeConfig
    channel: PlatformAiChannelConfig
    prompt: string
    provider: PlatformAiProviderConfig | null
    candidate: PlatformAiResolvedChannelCandidate
  }) => Promise<T>,
): Promise<PlatformAiChannelRunResult<T>> {
  const resolved = resolveAiRuntimeForChannel(runtime, key)
  const attemptChain: PlatformAiChannelAttemptSummary[] = []
  let lastError: unknown

  for (const candidate of resolved.candidates) {
    try {
      const data = await run({
        ai: candidate.ai,
        channel: resolved.channel,
        prompt: resolved.prompt,
        provider: candidate.provider,
        candidate,
      })
      attemptChain.push({
        provider: candidate.ai.provider,
        model: candidate.ai.model,
        success: true,
      })
      return {
        data,
        provider: candidate.provider,
        ai: candidate.ai,
        channel: resolved.channel,
        prompt: resolved.prompt,
        usedFallback: resolved.usedFallback || candidate.index > 0,
        attemptChain,
      }
    }
    catch (error) {
      lastError = error
      attemptChain.push({
        provider: candidate.ai.provider,
        model: candidate.ai.model,
        success: false,
        error: error instanceof Error ? (error.message || 'UNKNOWN_ERROR') : 'UNKNOWN_ERROR',
      })
    }
  }

  if (lastError instanceof Error)
    throw lastError
  throw new Error('CHANNEL_RUNTIME_FAILED')
}

export function aggregatePlatformAiModels(runtime: RuntimeSettings): PlatformAiAggregatedModelItem[] {
  const registry = resolvePlatformAiRegistry(runtime)
  const rows: PlatformAiAggregatedModelItem[] = []

  for (const provider of registry.providers) {
    for (const model of provider.models) {
      rows.push({
        providerId: provider.id,
        providerName: provider.name,
        adapter: provider.adapter,
        provider: provider.provider,
        providerEnabled: provider.enabled,
        model: model.model,
        label: model.label,
        format: model.format,
        modelEnabled: model.enabled,
        inputPricePer1M: model.inputPricePer1M,
        outputPricePer1M: model.outputPricePer1M,
        currency: model.currency,
        pricingSource: model.pricingSource,
        manualPriceOverride: model.manualPriceOverride,
      })
    }
  }

  return rows
}

export function buildMergedPrompt(...parts: Array<string | null | undefined>): string {
  return parts
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join('\n\n')
}
