import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { RuntimeSettings } from '~~/server/utils/env'

export type PlatformAiProviderAdapter = 'openai-compatible' | 'response'
export type PlatformAiModelFormat = 'openai-compatible' | 'response'
export type PlatformAiPricingSource = 'provider' | 'pricing_table' | 'none'
export type PlatformAiChannelKey
  = 'contest_filter'
    | 'project_chat'
    | 'topic_proposal'
    | 'defense'
    | 'workspace_dialog_ask'
    | 'workspace_auto_optimize'
    | 'workspace_issue_discovery'
    | 'admin_general'
    | 'admin_publish_assistant'
    | 'admin_import_sync_analysis'

export interface PlatformAiProviderModelConfig {
  model: string
  label: string
  format: PlatformAiModelFormat
  enabled: boolean
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: PlatformAiPricingSource
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
  models: PlatformAiProviderModelConfig[]
}

export interface PlatformAiChannelConfig {
  key: PlatformAiChannelKey
  label: string
  description: string
  enabled: boolean
  providerId: string
  model: string
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
}

export interface PlatformAiResolvedChannelRuntime {
  key: PlatformAiChannelKey
  channel: PlatformAiChannelConfig
  provider: PlatformAiProviderConfig | null
  ai: AiRuntimeConfig
  prompt: string
  usedFallback: boolean
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
}

const CHANNEL_DEFINITIONS: PlatformAiChannelDefinition[] = [
  { key: 'contest_filter', label: '选赛过滤', description: '竞赛筛选与推荐排序' },
  { key: 'project_chat', label: '项目聊天', description: '项目草案对话与改写' },
  { key: 'topic_proposal', label: '选题助手', description: '命题建议与路线生成' },
  { key: 'defense', label: '答辩模拟', description: '评委问答与评分反馈' },
  { key: 'workspace_dialog_ask', label: '工作台-对话询问', description: '工作台只读问答' },
  { key: 'workspace_auto_optimize', label: '工作台-自动优化', description: '工作台提案优化' },
  { key: 'workspace_issue_discovery', label: '工作台-寻疑发现', description: '工作台问题扫描' },
  { key: 'admin_general', label: '管理助手-通用', description: '后台管理通用任务' },
  { key: 'admin_publish_assistant', label: '管理助手-发布助手', description: '赛事发布预检与修复建议' },
  { key: 'admin_import_sync_analysis', label: '管理助手-导入同步', description: '导入与同步分析' },
]

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
  const normalized = toText(value)
  if (normalized === 'provider' || normalized === 'pricing_table')
    return normalized
  return 'none'
}

function normalizeProviderModel(raw: unknown, fallbackFormat: PlatformAiModelFormat): PlatformAiProviderModelConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null

  const source = raw as Record<string, unknown>
  const model = toText(source.model || source.id || source.name)
  if (!model)
    return null

  return {
    model,
    label: toText(source.label || source.name) || model,
    format: toModelFormat(source.format || source.adapter || source.type, fallbackFormat),
    enabled: toBoolean(source.enabled, true),
    inputPricePer1M: toNumber(source.inputPricePer1M),
    outputPricePer1M: toNumber(source.outputPricePer1M),
    currency: toText(source.currency).toUpperCase() || 'USD',
    pricingSource: resolvePricingSource(source.pricingSource),
  }
}

function dedupeProviderModels(items: PlatformAiProviderModelConfig[]): PlatformAiProviderModelConfig[] {
  const map = new Map<string, PlatformAiProviderModelConfig>()
  for (const item of items) {
    if (!item.model)
      continue
    map.set(item.model, item)
  }
  return Array.from(map.values()).sort((a, b) => a.model.localeCompare(b.model, 'en'))
}

function normalizeProvider(
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
      ? [
          {
            model: fallbackModel,
            label: fallbackModel,
            format: modelFormatFallback,
            enabled: true,
            inputPricePer1M: null,
            outputPricePer1M: null,
            currency: 'USD',
            pricingSource: 'none' as const,
          },
        ]
      : []

  return {
    id,
    name: toText(source.name) || id,
    adapter,
    provider,
    baseURL: toText(source.baseURL),
    apiKey: String(source.apiKey || ''),
    enabled: toBoolean(source.enabled, true),
    timeoutMs: clampInt(source.timeoutMs, runtime.ai.timeoutMs, 1000, 120000),
    maxRetries: clampInt(source.maxRetries, runtime.ai.maxRetries, 0, 10),
    models: dedupeProviderModels(withFallbackModel),
  }
}

function buildDefaultProvider(runtime: RuntimeSettings): PlatformAiProviderConfig {
  const provider = toText(runtime.ai.provider) || 'openai-compatible'
  const adapter = resolveAdapter(provider, provider)
  const format: PlatformAiModelFormat = adapter === 'response' ? 'response' : 'openai-compatible'
  return {
    id: 'default',
    name: 'Default',
    adapter,
    provider,
    baseURL: toText(runtime.ai.baseURL),
    apiKey: String(runtime.ai.apiKey || ''),
    enabled: true,
    timeoutMs: clampInt(runtime.ai.timeoutMs, 15000, 1000, 120000),
    maxRetries: clampInt(runtime.ai.maxRetries, 2, 0, 10),
    models: [{
      model: toText(runtime.ai.model) || 'gpt-4o-mini',
      label: toText(runtime.ai.model) || 'gpt-4o-mini',
      format,
      enabled: true,
      inputPricePer1M: null,
      outputPricePer1M: null,
      currency: 'USD',
      pricingSource: 'none',
    }],
  }
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

function parseProvidersFromJson(raw: unknown, runtime: RuntimeSettings): PlatformAiProviderConfig[] {
  const parsed = parseJsonObject(raw)
  const source = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items))
        ? (parsed as Record<string, unknown>).items as unknown[]
        : []

  const normalized = source
    .map((item, index) => normalizeProvider(item, index, runtime))
    .filter((item): item is PlatformAiProviderConfig => Boolean(item))

  const unique = new Map<string, PlatformAiProviderConfig>()
  for (const item of normalized) {
    if (!item.id)
      continue
    unique.set(item.id, item)
  }

  const result = Array.from(unique.values())
  if (result.length > 0)
    return result
  return [buildDefaultProvider(runtime)]
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

function resolveProviderPreferredModel(provider: PlatformAiProviderConfig): string {
  const enabled = provider.models.find(item => item.enabled)
  if (enabled)
    return enabled.model
  return provider.models[0]?.model || ''
}

function normalizeChannel(
  raw: unknown,
  primaryProviderId: string,
  primaryModel: string,
): PlatformAiChannelConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null

  const source = raw as Record<string, unknown>
  const key = sanitizeScenarioKey(source.key || source.channel || source.scene)
  if (!key)
    return null

  const definition = resolveChannelDefinition(key)

  return {
    key,
    label: toText(source.label) || definition.label,
    description: toText(source.description) || definition.description,
    enabled: toBoolean(source.enabled, true),
    providerId: toText(source.providerId) || primaryProviderId,
    model: toText(source.model) || primaryModel,
    prompt: String(source.prompt || ''),
  }
}

function parseChannelsFromJson(
  raw: unknown,
  providers: PlatformAiProviderConfig[],
): PlatformAiChannelConfig[] {
  const primaryProvider = providers[0] || null
  const primaryProviderId = primaryProvider?.id || 'default'
  const primaryModel = primaryProvider ? resolveProviderPreferredModel(primaryProvider) : ''

  const parsed = parseJsonObject(raw)
  const source = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items))
        ? (parsed as Record<string, unknown>).items as unknown[]
        : []

  const normalized = source
    .map(item => normalizeChannel(item, primaryProviderId, primaryModel))
    .filter((item): item is PlatformAiChannelConfig => Boolean(item))

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
      providerId: primaryProviderId,
      model: primaryModel,
      prompt: '',
    })
  }

  return CHANNEL_DEFINITIONS
    .map(item => map.get(item.key))
    .filter((item): item is PlatformAiChannelConfig => Boolean(item))
}

function resolveProviderById(
  providers: PlatformAiProviderConfig[],
  providerId: string,
): PlatformAiProviderConfig | null {
  const preferred = providers.find(item => item.id === providerId && item.enabled)
  if (preferred)
    return preferred

  const anyEnabled = providers.find(item => item.enabled)
  if (anyEnabled)
    return anyEnabled

  return providers[0] || null
}

function resolveModelForProvider(provider: PlatformAiProviderConfig | null, preferredModel: string): string {
  if (!provider)
    return ''

  if (preferredModel) {
    const explicitEnabled = provider.models.find(item => item.model === preferredModel && item.enabled)
    if (explicitEnabled)
      return explicitEnabled.model

    const explicitAny = provider.models.find(item => item.model === preferredModel)
    if (explicitAny)
      return explicitAny.model
  }

  return resolveProviderPreferredModel(provider)
}

function resolveModelFormatForProvider(
  provider: PlatformAiProviderConfig | null,
  model: string,
): PlatformAiModelFormat {
  if (!provider)
    return 'openai-compatible'

  const explicit = provider.models.find(item => item.model === model)
  if (explicit)
    return explicit.format

  const enabled = provider.models.find(item => item.enabled)
  if (enabled)
    return enabled.format

  if (provider.models[0])
    return provider.models[0].format

  return provider.adapter === 'response' ? 'response' : 'openai-compatible'
}

function toSerializableProviders(items: PlatformAiProviderConfig[]): PlatformAiProviderConfig[] {
  return items.map((item) => {
    const models = item.models.map(model => ({
      ...model,
      inputPricePer1M: model.inputPricePer1M === null ? null : Number(model.inputPricePer1M),
      outputPricePer1M: model.outputPricePer1M === null ? null : Number(model.outputPricePer1M),
    }))

    return {
      ...item,
      models,
    }
  })
}

function toSerializableChannels(items: PlatformAiChannelConfig[]): PlatformAiChannelConfig[] {
  return items.map(item => ({
    ...item,
    prompt: String(item.prompt || ''),
  }))
}

export function getPlatformAiChannelDefinitions(): PlatformAiChannelDefinition[] {
  return [...CHANNEL_DEFINITIONS]
}

export function resolvePlatformAiRegistry(runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const providers = parseProvidersFromJson(runtime.ai.providersJson, runtime)
  const channels = parseChannelsFromJson(runtime.ai.channelsJson, providers)

  return {
    providers,
    channels,
  }
}

export function buildPlatformAiRegistryJson(runtime: RuntimeSettings, raw: unknown): string {
  const source = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).items))
        ? (raw as Record<string, unknown>).items as unknown[]
        : []

  const existingMap = new Map(
    resolvePlatformAiRegistry(runtime).providers.map(item => [item.id, item.apiKey]),
  )

  const providers = source
    .map((item, index) => normalizeProvider(item, index, runtime))
    .filter((item): item is PlatformAiProviderConfig => Boolean(item))
    .map((item, index) => {
      const sourceItem = source[index]
      if (!sourceItem || typeof sourceItem !== 'object' || Array.isArray(sourceItem)) {
        item.apiKey = item.apiKey || existingMap.get(item.id) || ''
        return item
      }

      const sourceRecord = sourceItem as Record<string, unknown>
      const hasOwnApiKey = Object.prototype.hasOwnProperty.call(sourceRecord, 'apiKey')
      const mode = toText(sourceRecord.apiKeyMode).toLowerCase()

      if (mode === 'clear') {
        item.apiKey = ''
        return item
      }

      if (mode === 'replace') {
        item.apiKey = String(sourceRecord.apiKey || '')
        return item
      }

      if (hasOwnApiKey) {
        item.apiKey = String(sourceRecord.apiKey || '')
        return item
      }

      item.apiKey = existingMap.get(item.id) || item.apiKey || ''
      return item
    })

  const resolved = providers.length > 0 ? toSerializableProviders(providers) : [buildDefaultProvider(runtime)]
  return JSON.stringify({ items: resolved }, null, 2)
}

export function buildPlatformAiChannelsJson(
  runtime: RuntimeSettings,
  raw: unknown,
  providers?: PlatformAiProviderConfig[],
): string {
  const source = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).items))
        ? (raw as Record<string, unknown>).items as unknown[]
        : []

  const providerList = providers && providers.length > 0 ? providers : resolvePlatformAiRegistry(runtime).providers
  const primaryProvider = providerList[0] || null
  const primaryProviderId = primaryProvider?.id || 'default'
  const primaryModel = primaryProvider ? resolveProviderPreferredModel(primaryProvider) : ''

  const channels = source
    .map(item => normalizeChannel(item, primaryProviderId, primaryModel))
    .filter((item): item is PlatformAiChannelConfig => Boolean(item))
  const merged = parseChannelsFromJson(JSON.stringify({ items: channels }), providerList)
  return JSON.stringify({ items: toSerializableChannels(merged) }, null, 2)
}

export function resolveAiRuntimeForChannel(
  runtime: RuntimeSettings,
  key: PlatformAiChannelKey,
): PlatformAiResolvedChannelRuntime {
  const registry = resolvePlatformAiRegistry(runtime)
  const fallbackAdapter = resolveAdapter(runtime.ai.provider, runtime.ai.provider)
  const fallbackFormat: PlatformAiModelFormat = fallbackAdapter === 'response' ? 'response' : 'openai-compatible'
  const fallbackAi: AiRuntimeConfig = {
    ...runtime.ai,
    format: fallbackFormat,
  }

  const channel = registry.channels.find(item => item.key === key) || registry.channels[0]
  if (!channel) {
    return {
      key,
      channel: {
        key,
        label: key,
        description: '',
        enabled: true,
        providerId: '',
        model: runtime.ai.model,
        prompt: '',
      },
      provider: null,
      ai: fallbackAi,
      prompt: '',
      usedFallback: true,
    }
  }

  const provider = channel.enabled ? resolveProviderById(registry.providers, channel.providerId) : null
  const model = resolveModelForProvider(provider, channel.model)
  const modelFormat = resolveModelFormatForProvider(provider, model)
  if (!provider || !provider.enabled || !model) {
    return {
      key,
      channel,
      provider,
      ai: fallbackAi,
      prompt: channel.prompt || '',
      usedFallback: true,
    }
  }

  const ai: AiRuntimeConfig = {
    ...runtime.ai,
    provider: provider.provider || provider.adapter,
    baseURL: provider.baseURL,
    apiKey: provider.apiKey || runtime.ai.apiKey,
    model,
    format: modelFormat,
    timeoutMs: provider.timeoutMs,
    maxRetries: provider.maxRetries,
  }

  return {
    key,
    channel,
    provider,
    ai,
    prompt: channel.prompt || '',
    usedFallback: false,
  }
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
      })
    }
  }

  return rows.sort((a, b) => {
    if (a.providerId === b.providerId)
      return a.model.localeCompare(b.model, 'en')
    return a.providerId.localeCompare(b.providerId, 'en')
  })
}

export function buildMergedPrompt(...parts: Array<string | null | undefined>): string {
  return parts
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join('\n\n')
}
