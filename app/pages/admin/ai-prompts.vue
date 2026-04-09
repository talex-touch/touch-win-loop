<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type AiConsoleTab = 'providers' | 'channels' | 'models' | 'audits' | 'logs'
type SecretMode = 'keep' | 'replace' | 'clear'
type ProviderEditorKey = 'llm' | 'docAi'
type ChannelEditorKey = 'adminAi'
type ProviderModelScope = ProviderEditorKey | 'provider'
type PlatformAiChannelKey
  = 'contest_filter'
    | 'project_chat'
    | 'topic_proposal'
    | 'defense'
    | 'workspace_dialog_ask'
    | 'workspace_auto_optimize'
    | 'workspace_issue_discovery'
    | 'admin_general'
    | 'admin_publish_assistant'

interface RegistryProviderModel {
  model: string
  label: string
  format: 'openai-compatible' | 'response'
  enabled: boolean
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: 'provider' | 'pricing_table' | 'none'
}

interface RegistryProvider {
  id: string
  name: string
  adapter: 'openai-compatible' | 'response'
  provider: string
  baseURL: string
  enabled: boolean
  timeoutMs: number
  maxRetries: number
  apiKeyConfigured: boolean
  models: RegistryProviderModel[]
}

interface RegistryChannelDefinition {
  key: PlatformAiChannelKey
  label: string
  description: string
}

interface RegistryChannel {
  key: PlatformAiChannelKey
  label: string
  description: string
  enabled: boolean
  providerId: string
  model: string
  prompt: string
}

interface RegistryProviderUsageStat {
  providerId: string
  totalConsumed: number
  lastTriggeredAt: string | null
}

interface ProviderModelOption {
  id: string
  provider: string
  model: string
  label: string
  mode: ProviderModelScope
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: 'provider' | 'pricing_table' | 'none'
  pricingText: string
}

interface ProviderModelsPayload {
  scope: ProviderModelScope
  mode?: ProviderModelScope
  providerId?: string
  provider: string
  baseURL: string
  fetchedAt: string
  items: ProviderModelOption[]
}

interface ProvidersPayload {
  llm: {
    provider: string
    baseURL: string
    model: string
    embeddingModel: string
    modelCatalogJson: string
    modelPricingJson: string
    providersJson: string
    channelsJson: string
    temperature: number
    topP: number
    maxTokens: number
    presencePenalty: number
    frequencyPenalty: number
    timeoutMs: number
    maxRetries: number
    apiKeyConfigured: boolean
  }
  docAi: {
    provider: string
    baseURL: string
    model: string
    modelPricingJson: string
    timeoutMs: number
    maxRetries: number
    apiKeyConfigured: boolean
  }
  adminAi: {
    enabled: boolean
    tavilyConfigured: boolean
    webTimeoutMs: number
    maxWebResults: number
    maxPageChars: number
  }
  registry: {
    providers: RegistryProvider[]
    providerStats: RegistryProviderUsageStat[]
    channels: RegistryChannel[]
    channelDefinitions: RegistryChannelDefinition[]
  }
  overrideState?: {
    aiApiKeyOverridden?: boolean
    docAiApiKeyOverridden?: boolean
    adminTavilyApiKeyOverridden?: boolean
    updatedAt?: string
    updatedByUserId?: string
  }
}

interface ChannelsPayload {
  days: number
  totalCalls: number
  totalUnits: number
  items: Array<{
    route: string
    calls: number
    units: number
    lastAt: string | null
  }>
  channelItems: RegistryChannel[]
  channelDefinitions: RegistryChannelDefinition[]
  providers: RegistryProvider[]
  providerModelItems: Array<{
    providerId: string
    providerName: string
    adapter: 'openai-compatible' | 'response'
    provider: string
    providerEnabled: boolean
    model: string
    label: string
    format: 'openai-compatible' | 'response'
    modelEnabled: boolean
    inputPricePer1M: number | null
    outputPricePer1M: number | null
    currency: string
    pricingSource: 'provider' | 'pricing_table' | 'none'
  }>
}

interface ModelsPayload {
  days: number
  totalMessages: number
  items: Array<{
    provider: string
    model: string
    messages: number
    fallbackMessages: number
    fallbackRate: number
    lastAt: string | null
  }>
  totalCatalogModels: number
  catalogItems: Array<{
    providerId: string
    providerName: string
    adapter: 'openai-compatible' | 'response'
    provider: string
    providerEnabled: boolean
    model: string
    label: string
    format: 'openai-compatible' | 'response'
    modelEnabled: boolean
    inputPricePer1M: number | null
    outputPricePer1M: number | null
    currency: string
    pricingSource: 'provider' | 'pricing_table' | 'none'
  }>
}

interface AuditItem {
  id: string
  action: string
  contestId: string
  contestName: string
  actorUserId: string
  actorName: string
  payload: Record<string, unknown>
  createdAt: string
}

interface AuditsPayload {
  page: number
  pageSize: number
  total: number
  items: AuditItem[]
}

interface LogItem {
  id: string
  workspaceId: string
  workspaceName: string
  sessionId: string
  sessionTitle: string
  role: string
  provider: string
  model: string
  fallbackUsed: boolean
  actorUserId: string
  actorName: string
  contestId: string
  contestName: string
  trackId: string
  major: string
  content: string
  contentPreview: string
  createdAt: string
}

interface LogsPayload {
  page: number
  pageSize: number
  total: number
  days: number
  items: LogItem[]
}

interface ProviderConfigRow {
  key: ProviderEditorKey
  name: string
  mode: string
  provider: string
  model: string
  modelPriceText: string
  modelPoolSize: number
  modelFetchedAt: string
  baseURL: string
  timeoutMs: number
  maxRetries: number
  keyConfigured: boolean
}

interface ChannelConfigRow {
  key: ChannelEditorKey
  name: string
  enabled: boolean
  webTimeoutMs: number
  maxWebResults: number
  maxPageChars: number
  keyConfigured: boolean
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const tabOptions: Array<{ key: AiConsoleTab, label: string }> = [
  { key: 'providers', label: 'Providers' },
  { key: 'channels', label: 'Channels' },
  { key: 'models', label: 'Models' },
  { key: 'audits', label: 'Audits' },
  { key: 'logs', label: 'Logs' },
]

const activeTab = ref<AiConsoleTab>('providers')

const loaded = reactive<Record<AiConsoleTab, boolean>>({
  providers: false,
  channels: false,
  models: false,
  audits: false,
  logs: false,
})

const loadingMap = reactive<Record<AiConsoleTab, boolean>>({
  providers: false,
  channels: false,
  models: false,
  audits: false,
  logs: false,
})

const errorMap = reactive<Record<AiConsoleTab, string>>({
  providers: '',
  channels: '',
  models: '',
  audits: '',
  logs: '',
})

const providers = ref<ProvidersPayload | null>(null)
const channels = ref<ChannelsPayload | null>(null)
const models = ref<ModelsPayload | null>(null)
const audits = ref<AuditItem[]>([])
const logs = ref<LogItem[]>([])

const channelDays = ref(7)
const modelDays = ref(7)

const auditAction = ref('')
const auditPage = ref(1)
const auditPageSize = ref(20)
const auditTotal = ref(0)

const logPage = ref(1)
const logPageSize = ref(20)
const logTotal = ref(0)
const logFilters = reactive({
  days: 7,
  provider: '',
  model: '',
  role: '',
  workspaceId: '',
  sessionId: '',
  q: '',
})

const providerSaving = ref(false)
const providerSaveMessage = ref('')
const providerEditorVisible = ref(false)
const providerEditorKey = ref<ProviderEditorKey>('llm')
const channelEditorVisible = ref(false)
const channelScenarioEditorVisible = ref(false)
const modelDetailVisible = ref(false)
const modelDetailRow = ref<ModelsPayload['items'][number] | null>(null)
const auditDetailVisible = ref(false)
const auditDetailRow = ref<AuditItem | null>(null)
const logDetailVisible = ref(false)
const logDetailRow = ref<LogItem | null>(null)
const providerModelOptions = reactive<Record<ProviderEditorKey, ProviderModelOption[]>>({
  llm: [],
  docAi: [],
})
const providerModelLoading = reactive<Record<ProviderEditorKey, boolean>>({
  llm: false,
  docAi: false,
})
const providerModelError = reactive<Record<ProviderEditorKey, string>>({
  llm: '',
  docAi: '',
})
const providerModelFetchedAt = reactive<Record<ProviderEditorKey, string>>({
  llm: '',
  docAi: '',
})
const providerManualModelText = reactive<Record<ProviderEditorKey, string>>({
  llm: '',
  docAi: '',
})
const registryProviderPullLoading = reactive<Record<string, boolean>>({})
const registryProviderTestLoading = reactive<Record<string, boolean>>({})
const registryProviderTestMessage = reactive<Record<string, string>>({})
const registryProviderMutating = reactive<Record<string, boolean>>({})
const registryProviderModelEditorVisible = ref(false)
const registryProviderModelEditorProviderId = ref('')
const registryProviderModelEditorProviderName = ref('')
const registryProviderModelEditorRows = ref<RegistryProviderModel[]>([])
const registryChannelTestLoading = reactive<Record<string, boolean>>({})
const registryChannelTestMessage = reactive<Record<string, string>>({})
const channelScenarioForm = reactive<RegistryChannel>({
  key: 'project_chat',
  label: '',
  description: '',
  enabled: true,
  providerId: '',
  model: '',
  prompt: '',
})

const providerForm = reactive({
  aiProvider: '',
  aiBaseURL: '',
  aiModel: '',
  aiEmbeddingModel: '',
  aiModelCatalogJson: '',
  aiModelPricingJson: '',
  aiTemperature: 0.2,
  aiTopP: 1,
  aiMaxTokens: 0,
  aiPresencePenalty: 0,
  aiFrequencyPenalty: 0,
  aiTimeoutMs: 15000,
  aiMaxRetries: 2,
  aiApiKeyMode: 'keep' as SecretMode,
  aiApiKey: '',
  docAiProvider: '',
  docAiBaseURL: '',
  docAiModel: '',
  docAiModelPricingJson: '',
  docAiTimeoutMs: 15000,
  docAiMaxRetries: 2,
  docAiApiKeyMode: 'keep' as SecretMode,
  docAiApiKey: '',
  adminAiEnabled: false,
  adminAiWebTimeoutMs: 12000,
  adminAiMaxWebResults: 5,
  adminAiMaxPageChars: 10000,
  adminAiTavilyApiKeyMode: 'keep' as SecretMode,
  adminAiTavilyApiKey: '',
})

const providerColumns = [
  { title: '模式', dataIndex: 'name', width: 120 },
  { title: '配置', dataIndex: 'config', slotName: 'config' },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 260 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 190 },
]

const channelConfigColumns = [
  { title: 'Channel', dataIndex: 'name' },
  { title: '配置', dataIndex: 'config', slotName: 'config' },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 220 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 110 },
]

const channelUsageColumns = [
  { title: 'Route', dataIndex: 'route' },
  { title: 'Calls', dataIndex: 'calls', width: 100 },
  { title: 'Units', dataIndex: 'units', width: 100 },
  { title: '最近调用', dataIndex: 'lastAt', slotName: 'lastAt', width: 180 },
]

const registryProviderColumns = [
  { title: 'Provider', dataIndex: 'name', width: 220 },
  { title: '配置', dataIndex: 'config', slotName: 'config' },
  { title: '模型池', dataIndex: 'models', slotName: 'models', width: 200 },
  { title: '启用', dataIndex: 'enabled', slotName: 'enabled', width: 120 },
  { title: '最后触发时间', dataIndex: 'lastTriggeredAt', slotName: 'lastTriggeredAt', width: 170 },
  { title: '累计消耗', dataIndex: 'totalConsumed', slotName: 'totalConsumed', width: 120 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 360 },
]

const registryChannelColumns = [
  { title: '场景', dataIndex: 'label', width: 220 },
  { title: '模型路由', dataIndex: 'routing', slotName: 'routing', width: 240 },
  { title: '提示词', dataIndex: 'prompt', slotName: 'prompt' },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 210 },
]

const modelColumns = [
  { title: 'Provider', dataIndex: 'provider', width: 140 },
  { title: 'Model', dataIndex: 'model' },
  { title: '消息量', dataIndex: 'messages', width: 110 },
  { title: 'Fallback', dataIndex: 'fallbackMessages', width: 110 },
  { title: 'Fallback率', dataIndex: 'fallbackRate', slotName: 'fallbackRate', width: 110 },
  { title: '最近调用', dataIndex: 'lastAt', slotName: 'lastAt', width: 180 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 90 },
]

const modelCatalogColumns = [
  { title: 'Provider', dataIndex: 'providerName', width: 180 },
  { title: '适配器', dataIndex: 'adapter', width: 110 },
  { title: 'Model', dataIndex: 'model' },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 200 },
  { title: '价格', dataIndex: 'price', slotName: 'price', width: 220 },
]

const auditColumns = [
  { title: '时间', dataIndex: 'createdAt', slotName: 'createdAt', width: 176 },
  { title: 'Action', dataIndex: 'action', width: 220 },
  { title: '操作者', dataIndex: 'actorName', slotName: 'actorName', width: 150 },
  { title: '赛事', dataIndex: 'contestName', slotName: 'contestName', width: 180 },
  { title: 'Payload', dataIndex: 'payload', slotName: 'payload' },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 90 },
]

const logColumns = [
  { title: '时间', dataIndex: 'createdAt', slotName: 'createdAt', width: 176 },
  { title: 'Workspace/Session', dataIndex: 'workspaceName', slotName: 'session', width: 260 },
  { title: '角色', dataIndex: 'role', width: 90 },
  { title: 'Provider/Model', dataIndex: 'provider', slotName: 'provider', width: 200 },
  { title: '操作者', dataIndex: 'actorName', slotName: 'actorName', width: 150 },
  { title: '消息', dataIndex: 'contentPreview', slotName: 'contentPreview' },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 90 },
]

const modelRows = computed(() => {
  return (models.value?.items || []).map(item => ({
    ...item,
    rowKey: `${item.provider}-${item.model}`,
  }))
})

const registryProviderRows = computed(() => {
  const statMap = new Map(
    (providers.value?.registry?.providerStats || []).map(item => [item.providerId, item]),
  )
  return (providers.value?.registry?.providers || []).map(item => ({
    ...item,
    lastTriggeredAt: statMap.get(item.id)?.lastTriggeredAt || null,
    totalConsumed: Number(statMap.get(item.id)?.totalConsumed || 0),
    rowKey: item.id,
  }))
})

const registryChannelRows = computed(() => {
  const source = channels.value?.channelItems?.length
    ? channels.value.channelItems
    : (providers.value?.registry?.channels || [])
  return source.map(item => ({
    ...item,
    rowKey: item.key,
  }))
})

const modelCatalogRows = computed(() => {
  return (models.value?.catalogItems || []).map(item => ({
    ...item,
    rowKey: `${item.providerId}:${item.model}`,
  }))
})

function formatCatalogPrice(item: {
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
}): string {
  const input = item.inputPricePer1M === null ? '-' : `${item.currency} ${Number(item.inputPricePer1M).toFixed(4)}/1M`
  const output = item.outputPricePer1M === null ? '-' : `${item.currency} ${Number(item.outputPricePer1M).toFixed(4)}/1M`
  return `输入 ${input} · 输出 ${output}`
}

function toPromptPreview(prompt: string): string {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim()
  if (!text)
    return '-'
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
}

function toProviderModelPreview(models: RegistryProviderModel[] | null | undefined): string {
  const items = Array.isArray(models) ? models : []
  if (items.length === 0)
    return '-'
  return items
    .slice(0, 3)
    .map(item => `${item.model}[${item.format || 'openai-compatible'}]${item.enabled ? '' : '(off)'}`)
    .join(' · ')
}

function toProviderModeLabel(key: ProviderModelScope): string {
  if (key === 'provider')
    return 'Provider'
  return key === 'llm' ? 'LLM' : 'DocAI'
}

function toModelFormat(value: unknown): RegistryProviderModel['format'] {
  return String(value || '').trim().toLowerCase() === 'response'
    ? 'response'
    : 'openai-compatible'
}

function toPricingSourceLabel(source: ProviderModelOption['pricingSource']): string {
  if (source === 'provider')
    return 'provider'
  if (source === 'pricing_table')
    return 'pricing_table'
  return 'none'
}

function toProviderEditorKey(value: unknown): ProviderEditorKey {
  return value === 'docAi' ? 'docAi' : 'llm'
}

function getProviderModelError(value: unknown): string {
  return providerModelError[toProviderEditorKey(value)]
}

function getProviderModelLoading(value: unknown): boolean {
  return providerModelLoading[toProviderEditorKey(value)]
}

function findProviderModelOption(key: ProviderEditorKey, model: string): ProviderModelOption | null {
  const normalized = String(model || '').trim()
  if (!normalized)
    return null
  return providerModelOptions[key].find(item => item.model === normalized) || null
}

function buildModelCatalogJsonFromOptions(items: ProviderModelOption[]): string {
  const options = items.map((item) => {
    const descriptionParts = [
      `mode=${toProviderModeLabel(item.mode)}`,
      item.pricingText,
    ].filter(Boolean)

    return {
      id: `${item.provider}:${item.model}`,
      label: item.label || item.model,
      provider: item.provider,
      model: item.model,
      description: descriptionParts.join(' · '),
    }
  })

  return JSON.stringify({
    groups: [
      {
        key: 'managed_llm',
        label: '平台统一模型目录',
        options,
      },
    ],
  }, null, 2)
}

const activeProviderModelOption = computed(() => {
  if (providerEditorKey.value === 'llm')
    return findProviderModelOption('llm', providerForm.aiModel)
  return findProviderModelOption('docAi', providerForm.docAiModel)
})

const providerEditorModelColumns = [
  { title: 'Model', dataIndex: 'model' },
  { title: 'Label', dataIndex: 'label', width: 180 },
  { title: '价格', dataIndex: 'pricingText', slotName: 'pricingText', width: 210 },
  { title: '来源', dataIndex: 'pricingSource', slotName: 'pricingSource', width: 120 },
  { title: '状态', dataIndex: 'selected', slotName: 'selected', width: 110 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 90 },
]

const registryProviderModelColumns = [
  { title: 'Model', dataIndex: 'model' },
  { title: 'Label', dataIndex: 'label', width: 180 },
  { title: '格式', dataIndex: 'format', slotName: 'format', width: 150 },
  { title: '启用', dataIndex: 'enabled', slotName: 'enabled', width: 110 },
  { title: '价格', dataIndex: 'price', slotName: 'price', width: 220 },
]

function parseManualModelLines(raw: string): string[] {
  const models = String(raw || '')
    .split(/\r?\n/g)
    .map(line => line.trim())
    .filter(Boolean)
  return Array.from(new Set(models))
}

const activeProviderManualModelsText = computed({
  get() {
    return providerManualModelText[providerEditorKey.value]
  },
  set(value: string) {
    providerManualModelText[providerEditorKey.value] = String(value || '')
  },
})

const providerEditorModelRows = computed(() => {
  const key = providerEditorKey.value
  const currentModel = key === 'llm'
    ? String(providerForm.aiModel || '').trim()
    : String(providerForm.docAiModel || '').trim()
  const currentProvider = key === 'llm'
    ? String(providerForm.aiProvider || '').trim()
    : String(providerForm.docAiProvider || '').trim()
  const rows = providerModelOptions[key].map(item => ({
    ...item,
    rowKey: item.id || `${item.provider}:${item.model}`,
    selected: item.model === currentModel,
  }))

  const seen = new Set(rows.map(item => item.model))
  const manualModels = parseManualModelLines(providerManualModelText[key])
  if (currentModel)
    manualModels.unshift(currentModel)

  for (const model of manualModels) {
    if (seen.has(model))
      continue
    seen.add(model)
    rows.push({
      id: `manual:${key}:${model}`,
      provider: currentProvider || '-',
      model,
      label: model,
      mode: key,
      inputPricePer1M: null,
      outputPricePer1M: null,
      currency: 'USD',
      pricingSource: 'none',
      pricingText: '手动录入',
      rowKey: `manual:${key}:${model}`,
      selected: model === currentModel,
    })
  }

  return rows
})

const providerRows = computed<ProviderConfigRow[]>(() => {
  if (!providers.value)
    return []

  const llmModelOption = findProviderModelOption('llm', providers.value.llm.model || '')
  const docAiModelOption = findProviderModelOption('docAi', providers.value.docAi.model || '')

  return [
    {
      key: 'llm',
      name: 'LLM',
      mode: 'LLM',
      provider: providers.value.llm.provider || '-',
      model: providers.value.llm.model || '-',
      modelPriceText: llmModelOption
        ? `${llmModelOption.pricingText} · ${toPricingSourceLabel(llmModelOption.pricingSource)}`
        : '价格未返回 · none',
      modelPoolSize: providerModelOptions.llm.length,
      modelFetchedAt: providerModelFetchedAt.llm,
      baseURL: providers.value.llm.baseURL || '-',
      timeoutMs: Number(providers.value.llm.timeoutMs || 0),
      maxRetries: Number(providers.value.llm.maxRetries || 0),
      keyConfigured: Boolean(providers.value.llm.apiKeyConfigured),
    },
    {
      key: 'docAi',
      name: 'DocAI',
      mode: 'DocAI',
      provider: providers.value.docAi.provider || '-',
      model: providers.value.docAi.model || '-',
      modelPriceText: docAiModelOption
        ? `${docAiModelOption.pricingText} · ${toPricingSourceLabel(docAiModelOption.pricingSource)}`
        : '价格未返回 · none',
      modelPoolSize: providerModelOptions.docAi.length,
      modelFetchedAt: providerModelFetchedAt.docAi,
      baseURL: providers.value.docAi.baseURL || '-',
      timeoutMs: Number(providers.value.docAi.timeoutMs || 0),
      maxRetries: Number(providers.value.docAi.maxRetries || 0),
      keyConfigured: Boolean(providers.value.docAi.apiKeyConfigured),
    },
  ]
})

const channelConfigRows = computed<ChannelConfigRow[]>(() => {
  if (!providers.value)
    return []
  return [
    {
      key: 'adminAi',
      name: 'Admin Agent Channel',
      enabled: Boolean(providers.value.adminAi.enabled),
      webTimeoutMs: Number(providers.value.adminAi.webTimeoutMs || 0),
      maxWebResults: Number(providers.value.adminAi.maxWebResults || 0),
      maxPageChars: Number(providers.value.adminAi.maxPageChars || 0),
      keyConfigured: Boolean(providers.value.adminAi.tavilyConfigured),
    },
  ]
})

const activeLoading = computed(() => loadingMap[activeTab.value])
const activeError = computed(() => errorMap[activeTab.value])
const providerEditorTitle = computed(() => providerEditorKey.value === 'llm' ? '编辑 LLM 模式配置' : '编辑 DocAI 模式配置')

function formatTime(value?: string | null): string {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return String(value)
  return date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

function toAuditPayloadPreview(payload: Record<string, unknown>): string {
  const text = JSON.stringify(payload || {})
  if (text.length <= 140)
    return text
  return `${text.slice(0, 140)}...`
}

function toPrettyJson(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  if (typeof value === 'string')
    return value
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

function normalizeError(error: any, fallback: string): string {
  return String(error?.data?.message || error?.message || fallback)
}

type ApiRequestError = Error & {
  data?: {
    message?: string
  }
}

function createApiRequestError(message: string): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.data = { message }
  return error
}

async function requestApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    query?: Record<string, string | number | undefined>
    body?: unknown
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const url = new URL(path, 'http://localhost')
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value === undefined || value === '')
      continue
    url.searchParams.set(key, String(value))
  }

  const headers = new Headers()
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(`${url.pathname}${url.search}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body,
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0 || payload.data === null || payload.data === undefined)
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  return payload.data
}

function getRegistryChannelsSource(): RegistryChannel[] {
  const source = channels.value?.channelItems?.length
    ? channels.value.channelItems
    : (providers.value?.registry?.channels || [])
  return source.map(item => ({ ...item }))
}

function selectScenarioProviderDefaultModel(providerId: string): string {
  const key = String(providerId || '').trim()
  if (!key)
    return ''
  const provider = (providers.value?.registry?.providers || []).find(item => item.id === key)
  if (!provider)
    return ''
  return provider.models.find(item => item.enabled)?.model || provider.models[0]?.model || ''
}

function openChannelScenarioEditor(record: RegistryChannel) {
  const source = getRegistryChannelsSource().find(item => item.key === record.key) || record
  channelScenarioForm.key = source.key
  channelScenarioForm.label = source.label
  channelScenarioForm.description = source.description
  channelScenarioForm.enabled = Boolean(source.enabled)
  channelScenarioForm.providerId = String(source.providerId || '').trim()
  channelScenarioForm.model = String(source.model || '').trim()
  channelScenarioForm.prompt = String(source.prompt || '')

  if (!channelScenarioForm.providerId) {
    channelScenarioForm.providerId = providers.value?.registry?.providers?.[0]?.id || ''
  }
  if (!channelScenarioForm.model) {
    channelScenarioForm.model = selectScenarioProviderDefaultModel(channelScenarioForm.providerId)
  }

  errorMap.channels = ''
  channelScenarioEditorVisible.value = true
}

function closeChannelScenarioEditor() {
  if (providerSaving.value)
    return
  channelScenarioEditorVisible.value = false
}

function onChannelScenarioProviderChange(value: string | number | boolean) {
  const providerId = String(value || '').trim()
  channelScenarioForm.providerId = providerId
  channelScenarioForm.model = selectScenarioProviderDefaultModel(providerId)
}

function getProviderModelsById(providerId: string): RegistryProviderModel[] {
  const key = String(providerId || '').trim()
  if (!key)
    return []
  const provider = (providers.value?.registry?.providers || []).find(item => item.id === key)
  return provider?.models || []
}

function toProviderPatchItems(items: RegistryProvider[]): Array<Record<string, unknown>> {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    adapter: item.adapter,
    provider: item.provider,
    baseURL: item.baseURL,
    enabled: item.enabled,
    timeoutMs: item.timeoutMs,
    maxRetries: item.maxRetries,
    apiKeyMode: 'keep',
    models: (item.models || []).map(model => ({
      model: model.model,
      label: model.label,
      format: toModelFormat(model.format || (item.adapter === 'response' ? 'response' : 'openai-compatible')),
      enabled: model.enabled,
      inputPricePer1M: model.inputPricePer1M,
      outputPricePer1M: model.outputPricePer1M,
      currency: model.currency,
      pricingSource: model.pricingSource,
    })),
  }))
}

function getRegistryProvidersSource(): RegistryProvider[] {
  return (providers.value?.registry?.providers || []).map(item => ({
    ...item,
    models: [...(item.models || [])],
  }))
}

async function saveRegistryProviders(items: RegistryProvider[], message: string) {
  await patchProviders({
    ai: {
      providers: toProviderPatchItems(items),
    },
  }, {
    message,
    errorFallback: 'Provider Registry 保存失败。',
    errorScope: 'providers',
  })
}

async function toggleRegistryProviderEnabled(providerId: string, nextEnabled: boolean) {
  const key = String(providerId || '').trim()
  if (!key || registryProviderMutating[key])
    return
  const source = getRegistryProvidersSource()
  const index = source.findIndex(item => item.id === key)
  if (index < 0)
    return

  registryProviderMutating[key] = true
  try {
    source[index] = {
      ...source[index]!,
      enabled: nextEnabled,
    }
    await saveRegistryProviders(source, `Provider(${key}) 已${nextEnabled ? '启用' : '停用'}。`)
  }
  finally {
    registryProviderMutating[key] = false
  }
}

async function deleteRegistryProvider(providerId: string) {
  const key = String(providerId || '').trim()
  if (!key || registryProviderMutating[key])
    return
  const source = getRegistryProvidersSource()
  if (source.length <= 1) {
    registryProviderTestMessage[key] = '至少保留一个 Provider，无法删除。'
    return
  }

  const next = source.filter(item => item.id !== key)
  if (next.length === source.length)
    return

  registryProviderMutating[key] = true
  try {
    await saveRegistryProviders(next, `Provider(${key}) 已删除。`)
  }
  finally {
    registryProviderMutating[key] = false
  }
}

function openRegistryProviderModelEditor(providerId: string) {
  const key = String(providerId || '').trim()
  if (!key)
    return
  const provider = getRegistryProvidersSource().find(item => item.id === key)
  if (!provider)
    return
  registryProviderModelEditorProviderId.value = key
  registryProviderModelEditorProviderName.value = provider.name || provider.id
  registryProviderModelEditorRows.value = (provider.models || []).map(item => ({
    ...item,
    format: toModelFormat(item.format || (provider.adapter === 'response' ? 'response' : 'openai-compatible')),
  }))
  registryProviderModelEditorVisible.value = true
}

function closeRegistryProviderModelEditor() {
  if (providerSaving.value)
    return
  registryProviderModelEditorVisible.value = false
}

async function saveRegistryProviderModelEditor() {
  const key = String(registryProviderModelEditorProviderId.value || '').trim()
  if (!key || registryProviderMutating[key])
    return

  const source = getRegistryProvidersSource()
  const index = source.findIndex(item => item.id === key)
  if (index < 0) {
    errorMap.providers = `Provider(${key}) 不存在。`
    return
  }

  source[index] = {
    ...source[index]!,
    models: registryProviderModelEditorRows.value.map(item => ({
      ...item,
      model: String(item.model || '').trim(),
      label: String(item.label || item.model || '').trim() || String(item.model || '').trim(),
      format: toModelFormat(item.format),
      enabled: Boolean(item.enabled),
    })).filter(item => Boolean(item.model)),
  }

  if (!source[index]!.models.length) {
    errorMap.providers = '至少保留一个模型。'
    return
  }

  registryProviderMutating[key] = true
  try {
    await saveRegistryProviders(source, `Provider(${key}) 模型格式配置已保存。`)
    if (!errorMap.providers)
      registryProviderModelEditorVisible.value = false
  }
  finally {
    registryProviderMutating[key] = false
  }
}

async function saveChannelScenarioEditor() {
  const source = getRegistryChannelsSource()
  const index = source.findIndex(item => item.key === channelScenarioForm.key)
  if (index < 0) {
    errorMap.channels = `场景(${channelScenarioForm.key}) 不存在。`
    return
  }

  const nextProviderId = String(channelScenarioForm.providerId || '').trim()
  const nextModel = String(channelScenarioForm.model || '').trim()
  if (!nextProviderId) {
    errorMap.channels = '请先选择 Provider。'
    return
  }
  if (!nextModel) {
    errorMap.channels = '请先填写模型。'
    return
  }

  source[index] = {
    ...source[index]!,
    enabled: Boolean(channelScenarioForm.enabled),
    providerId: nextProviderId,
    model: nextModel,
    prompt: String(channelScenarioForm.prompt || ''),
  }

  await patchProviders({
    ai: {
      channels: source,
    },
  }, {
    message: `场景(${channelScenarioForm.key}) 配置已保存。`,
    errorFallback: `场景(${channelScenarioForm.key}) 配置保存失败。`,
    errorScope: 'channels',
  })

  if (!errorMap.channels)
    channelScenarioEditorVisible.value = false
}

async function pullRegistryProviderModels(providerId: string) {
  const key = String(providerId || '').trim()
  if (!key)
    return

  registryProviderPullLoading[key] = true
  registryProviderTestMessage[key] = ''
  try {
    const data = await requestApi<ProviderModelsPayload>(
      endpoint('/admin/ai/provider-models'),
      {
        query: {
          providerId: key,
        },
      },
      `Provider(${key}) 模型拉取失败。`,
    )

    const source = providers.value?.registry?.providers || []
    const updated = source.map((item) => {
      if (item.id !== key)
        return item
      return {
        ...item,
        models: (data.items || []).map(model => ({
          model: model.model,
          label: model.label || model.model,
          format: toModelFormat(item.adapter === 'response' ? 'response' : 'openai-compatible'),
          enabled: true,
          inputPricePer1M: model.inputPricePer1M,
          outputPricePer1M: model.outputPricePer1M,
          currency: model.currency,
          pricingSource: model.pricingSource,
        })),
      }
    })

    await saveRegistryProviders(updated, `Provider(${key}) 已拉取并更新 ${(data.items || []).length} 个模型。`)
  }
  catch (error: any) {
    registryProviderTestMessage[key] = normalizeError(error, `Provider(${key}) 模型拉取失败。`)
  }
  finally {
    registryProviderPullLoading[key] = false
  }
}

async function testRegistryProvider(providerId: string) {
  const key = String(providerId || '').trim()
  if (!key)
    return

  registryProviderTestLoading[key] = true
  registryProviderTestMessage[key] = ''
  try {
    const data = await requestApi<{
      provider: string
      model: string
      format: 'openai-compatible' | 'response'
      latencyMs: number
      responsePreview: string
    }>(
      endpoint('/admin/ai/providers/test'),
      {
        method: 'POST',
        body: {
          providerId: key,
        },
      },
      `Provider(${key}) 测试失败。`,
    )
    registryProviderTestMessage[key] = `测试成功：${data.provider}/${data.model}[${data.format}] · ${data.latencyMs}ms · ${toPromptPreview(data.responsePreview)}`
  }
  catch (error: any) {
    registryProviderTestMessage[key] = normalizeError(error, `Provider(${key}) 测试失败。`)
  }
  finally {
    registryProviderTestLoading[key] = false
  }
}

async function testChannelScenario(channelKey: PlatformAiChannelKey) {
  const key = String(channelKey || '').trim()
  if (!key)
    return

  registryChannelTestLoading[key] = true
  registryChannelTestMessage[key] = ''
  try {
    const data = await requestApi<{
      responsePreview: string
      latencyMs: number
      provider: string
      model: string
    }>(
      endpoint('/admin/ai/channels/test'),
      {
        method: 'POST',
        body: {
          channelKey: key,
        },
      },
      `场景(${key}) 测试失败。`,
    )
    registryChannelTestMessage[key] = `测试成功：${data.provider}/${data.model} · ${data.latencyMs}ms`
  }
  catch (error: any) {
    registryChannelTestMessage[key] = normalizeError(error, `场景(${key}) 测试失败。`)
  }
  finally {
    registryChannelTestLoading[key] = false
  }
}

function applyProvidersToForm(payload: ProvidersPayload | null) {
  if (!payload)
    return
  providerForm.aiProvider = payload.llm.provider || ''
  providerForm.aiBaseURL = payload.llm.baseURL || ''
  providerForm.aiModel = payload.llm.model || ''
  providerForm.aiEmbeddingModel = payload.llm.embeddingModel || ''
  providerForm.aiModelCatalogJson = payload.llm.modelCatalogJson || ''
  providerForm.aiModelPricingJson = payload.llm.modelPricingJson || ''
  providerForm.aiTemperature = Number(payload.llm.temperature ?? 0.2)
  providerForm.aiTopP = Number(payload.llm.topP ?? 1)
  providerForm.aiMaxTokens = Number(payload.llm.maxTokens ?? 0)
  providerForm.aiPresencePenalty = Number(payload.llm.presencePenalty ?? 0)
  providerForm.aiFrequencyPenalty = Number(payload.llm.frequencyPenalty ?? 0)
  providerForm.aiTimeoutMs = Number(payload.llm.timeoutMs || 15000)
  providerForm.aiMaxRetries = Number(payload.llm.maxRetries || 2)
  providerForm.docAiProvider = payload.docAi.provider || ''
  providerForm.docAiBaseURL = payload.docAi.baseURL || ''
  providerForm.docAiModel = payload.docAi.model || ''
  providerForm.docAiModelPricingJson = payload.docAi.modelPricingJson || ''
  providerForm.docAiTimeoutMs = Number(payload.docAi.timeoutMs || 15000)
  providerForm.docAiMaxRetries = Number(payload.docAi.maxRetries || 2)
  providerForm.adminAiEnabled = Boolean(payload.adminAi.enabled)
  providerForm.adminAiWebTimeoutMs = Number(payload.adminAi.webTimeoutMs || 12000)
  providerForm.adminAiMaxWebResults = Number(payload.adminAi.maxWebResults || 5)
  providerForm.adminAiMaxPageChars = Number(payload.adminAi.maxPageChars || 10000)

  providerForm.aiApiKeyMode = 'keep'
  providerForm.aiApiKey = ''
  providerForm.docAiApiKeyMode = 'keep'
  providerForm.docAiApiKey = ''
  providerForm.adminAiTavilyApiKeyMode = 'keep'
  providerForm.adminAiTavilyApiKey = ''
}

function resetProviderEditorState() {
  providerForm.aiApiKeyMode = 'keep'
  providerForm.aiApiKey = ''
  providerForm.docAiApiKeyMode = 'keep'
  providerForm.docAiApiKey = ''
  providerForm.adminAiTavilyApiKeyMode = 'keep'
  providerForm.adminAiTavilyApiKey = ''
}

function isProviderApiKeyConfigured(key: ProviderEditorKey): boolean {
  if (!providers.value)
    return false
  if (key === 'llm')
    return Boolean(providers.value.llm.apiKeyConfigured)
  return Boolean(providers.value.docAi.apiKeyConfigured)
}

async function loadProviderModelOptions(
  key: ProviderEditorKey,
  options: {
    assignIfEmpty?: boolean
    syncCatalogForLlm?: boolean
    silent?: boolean
  } = {},
) {
  providerModelLoading[key] = true
  providerModelError[key] = ''
  if (!options.silent)
    errorMap.providers = ''

  try {
    const data = await requestApi<ProviderModelsPayload>(
      endpoint('/admin/ai/provider-models'),
      {
        query: {
          scope: key,
        },
      },
      `${toProviderModeLabel(key)} 模型拉取失败。`,
    )

    const items = data.items || []
    providerModelOptions[key] = items
    providerModelFetchedAt[key] = data.fetchedAt || new Date().toISOString()

    if (options.assignIfEmpty) {
      if (key === 'llm' && !providerForm.aiModel.trim() && items[0]?.model)
        providerForm.aiModel = items[0].model
      if (key === 'docAi' && !providerForm.docAiModel.trim() && items[0]?.model)
        providerForm.docAiModel = items[0].model
    }

    if (key === 'llm' && options.syncCatalogForLlm)
      providerForm.aiModelCatalogJson = buildModelCatalogJsonFromOptions(items)

    if (!options.silent) {
      providerSaveMessage.value = `${toProviderModeLabel(key)} 已自动拉取 ${items.length} 个模型。`
    }
  }
  catch (error: any) {
    const message = normalizeError(error, `${toProviderModeLabel(key)} 模型拉取失败。`)
    providerModelError[key] = message
    if (!options.silent)
      providerSaveMessage.value = message
  }
  finally {
    providerModelLoading[key] = false
  }
}

async function patchProviders(
  body: Record<string, unknown>,
  options: {
    message: string
    errorFallback: string
    errorScope?: AiConsoleTab
  },
) {
  providerSaving.value = true
  providerSaveMessage.value = ''
  errorMap.providers = ''
  errorMap.channels = ''
  try {
    const data = await requestApi<ProvidersPayload>(
      endpoint('/admin/ai/providers'),
      {
        method: 'PATCH',
        body,
      },
      options.errorFallback,
    )
    providers.value = data
    applyProvidersToForm(data)
    if (channels.value) {
      channels.value.channelItems = data.registry.channels || []
      channels.value.providers = data.registry.providers || []
      channels.value.channelDefinitions = data.registry.channelDefinitions || []
    }
    providerSaveMessage.value = options.message
    loaded.providers = true
    loaded.channels = true
    loaded.models = false
    resetProviderEditorState()
  }
  catch (error: any) {
    const message = String(error?.message || normalizeError(error, options.errorFallback))
    if (options.errorScope === 'channels')
      errorMap.channels = message
    else
      errorMap.providers = message
  }
  finally {
    providerSaving.value = false
  }
}

function openProviderEditor(key: ProviderEditorKey) {
  providerEditorKey.value = key
  errorMap.providers = ''
  resetProviderEditorState()
  providerEditorVisible.value = true
  if (!providerManualModelText[key].trim()) {
    const seedModel = key === 'llm' ? providerForm.aiModel : providerForm.docAiModel
    const normalizedSeed = String(seedModel || '').trim()
    if (normalizedSeed)
      providerManualModelText[key] = normalizedSeed
  }

  if (!providerModelOptions[key].length && isProviderApiKeyConfigured(key))
    void loadProviderModelOptions(key, { silent: true })
}

function closeProviderEditor() {
  if (providerSaving.value)
    return
  providerEditorVisible.value = false
}

function selectProviderEditorModel(model: string) {
  const nextModel = String(model || '').trim()
  if (!nextModel)
    return
  if (providerEditorKey.value === 'llm')
    providerForm.aiModel = nextModel
  else
    providerForm.docAiModel = nextModel
}

async function saveProviderEditor() {
  if (providerEditorKey.value === 'llm') {
    const apiKey = String(providerForm.aiApiKey || '').trim()
    await patchProviders({
      ai: {
        provider: providerForm.aiProvider.trim(),
        baseURL: providerForm.aiBaseURL.trim(),
        model: providerForm.aiModel.trim(),
        embeddingModel: providerForm.aiEmbeddingModel.trim(),
        apiKeyMode: apiKey ? 'replace' : 'keep',
        apiKey,
      },
    }, {
      message: 'LLM 模式配置已保存并生效。',
      errorFallback: 'LLM 模式配置保存失败。',
      errorScope: 'providers',
    })
  }
  else {
    const apiKey = String(providerForm.docAiApiKey || '').trim()
    await patchProviders({
      docAi: {
        provider: providerForm.docAiProvider.trim(),
        baseURL: providerForm.docAiBaseURL.trim(),
        model: providerForm.docAiModel.trim(),
        apiKeyMode: apiKey ? 'replace' : 'keep',
        apiKey,
      },
    }, {
      message: 'DocAI 模式配置已保存并生效。',
      errorFallback: 'DocAI 模式配置保存失败。',
      errorScope: 'providers',
    })
  }

  if (!errorMap.providers)
    providerEditorVisible.value = false
}

function openChannelEditor(_key: ChannelEditorKey) {
  errorMap.channels = ''
  resetProviderEditorState()
  channelEditorVisible.value = true
}

function closeChannelEditor() {
  if (providerSaving.value)
    return
  channelEditorVisible.value = false
}

async function saveChannelEditor() {
  await patchProviders({
    adminAi: {
      enabled: providerForm.adminAiEnabled,
      webTimeoutMs: Number(providerForm.adminAiWebTimeoutMs || 12000),
      maxWebResults: Number(providerForm.adminAiMaxWebResults || 5),
      maxPageChars: Number(providerForm.adminAiMaxPageChars || 10000),
      tavilyApiKeyMode: providerForm.adminAiTavilyApiKeyMode,
      tavilyApiKey: providerForm.adminAiTavilyApiKey,
    },
  }, {
    message: 'Admin Agent Channel 配置已保存并生效。',
    errorFallback: 'Channel 配置保存失败。',
    errorScope: 'channels',
  })

  if (!errorMap.channels)
    channelEditorVisible.value = false
}

async function loadProviders() {
  loadingMap.providers = true
  errorMap.providers = ''
  try {
    const data = await requestApi<ProvidersPayload>(endpoint('/admin/ai/providers'), {}, 'Providers 加载失败。')
    providers.value = data
    applyProvidersToForm(data)
    loaded.providers = true

    if (data.llm.apiKeyConfigured && providerModelOptions.llm.length === 0)
      void loadProviderModelOptions('llm', { silent: true })
    if (data.docAi.apiKeyConfigured && providerModelOptions.docAi.length === 0)
      void loadProviderModelOptions('docAi', { silent: true })
  }
  catch (error: any) {
    providers.value = null
    errorMap.providers = normalizeError(error, 'Providers 加载失败。')
  }
  finally {
    loadingMap.providers = false
  }
}

async function loadChannels() {
  loadingMap.channels = true
  errorMap.channels = ''
  try {
    if (!providers.value)
      await loadProviders()

    const data = await requestApi<ChannelsPayload>(
      endpoint('/admin/ai/channels'),
      {
        query: {
          days: channelDays.value,
        },
      },
      'Channels 加载失败。',
    )
    channels.value = data
    loaded.channels = true
  }
  catch (error: any) {
    channels.value = null
    errorMap.channels = normalizeError(error, 'Channels 加载失败。')
  }
  finally {
    loadingMap.channels = false
  }
}

async function loadModels() {
  loadingMap.models = true
  errorMap.models = ''
  try {
    const data = await requestApi<ModelsPayload>(
      endpoint('/admin/ai/models'),
      {
        query: {
          days: modelDays.value,
        },
      },
      'Models 加载失败。',
    )
    models.value = data
    loaded.models = true
  }
  catch (error: any) {
    models.value = null
    errorMap.models = normalizeError(error, 'Models 加载失败。')
  }
  finally {
    loadingMap.models = false
  }
}

async function loadAudits() {
  loadingMap.audits = true
  errorMap.audits = ''
  try {
    const data = await requestApi<AuditsPayload>(
      endpoint('/admin/ai/audits'),
      {
        query: {
          page: auditPage.value,
          pageSize: auditPageSize.value,
          action: auditAction.value.trim(),
        },
      },
      'Audits 加载失败。',
    )
    audits.value = data.items || []
    auditTotal.value = Number(data.total || 0)
    loaded.audits = true
  }
  catch (error: any) {
    audits.value = []
    auditTotal.value = 0
    errorMap.audits = normalizeError(error, 'Audits 加载失败。')
  }
  finally {
    loadingMap.audits = false
  }
}

async function loadLogs() {
  loadingMap.logs = true
  errorMap.logs = ''
  try {
    const data = await requestApi<LogsPayload>(
      endpoint('/admin/ai/logs'),
      {
        query: {
          page: logPage.value,
          pageSize: logPageSize.value,
          days: logFilters.days,
          provider: logFilters.provider.trim(),
          model: logFilters.model.trim(),
          role: logFilters.role.trim(),
          workspaceId: logFilters.workspaceId.trim(),
          sessionId: logFilters.sessionId.trim(),
          q: logFilters.q.trim(),
        },
      },
      'Logs 加载失败。',
    )
    logs.value = data.items || []
    logTotal.value = Number(data.total || 0)
    loaded.logs = true
  }
  catch (error: any) {
    logs.value = []
    logTotal.value = 0
    errorMap.logs = normalizeError(error, 'Logs 加载失败。')
  }
  finally {
    loadingMap.logs = false
  }
}

async function loadActiveTab() {
  if (activeTab.value === 'providers') {
    await loadProviders()
    return
  }
  if (activeTab.value === 'channels') {
    await loadChannels()
    return
  }
  if (activeTab.value === 'models') {
    await loadModels()
    return
  }
  if (activeTab.value === 'audits') {
    await loadAudits()
    return
  }
  await loadLogs()
}

function switchTab(tab: AiConsoleTab) {
  activeTab.value = tab
  if (!loaded[tab])
    void loadActiveTab()
}

function refreshCurrentTab() {
  void loadActiveTab()
}

function applyAuditFilter() {
  auditPage.value = 1
  void loadAudits()
}

function onAuditPageChange(value: number) {
  auditPage.value = value
  void loadAudits()
}

function onAuditPageSizeChange(value: number) {
  auditPageSize.value = value
  auditPage.value = 1
  void loadAudits()
}

function applyLogFilter() {
  logPage.value = 1
  void loadLogs()
}

function onLogPageChange(value: number) {
  logPage.value = value
  void loadLogs()
}

function onLogPageSizeChange(value: number) {
  logPageSize.value = value
  logPage.value = 1
  void loadLogs()
}

function formatRate(value: number): string {
  return `${(Number(value || 0) * 100).toFixed(2)}%`
}

function openModelDetail(record: ModelsPayload['items'][number]) {
  modelDetailRow.value = record
  modelDetailVisible.value = true
}

function closeModelDetail() {
  modelDetailVisible.value = false
}

function openAuditDetail(record: AuditItem) {
  auditDetailRow.value = record
  auditDetailVisible.value = true
}

function closeAuditDetail() {
  auditDetailVisible.value = false
}

function openLogDetail(record: LogItem) {
  logDetailRow.value = record
  logDetailVisible.value = true
}

function closeLogDetail() {
  logDetailVisible.value = false
}

onMounted(async () => {
  await loadProviders()
})
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section class="p-2 border border-slate-200 bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div class="flex flex-wrap gap-1">
          <button
            v-for="tab in tabOptions"
            :key="tab.key"
            class="text-[11px] font-semibold px-3 py-1 border rounded transition-colors"
            :class="activeTab === tab.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
            @click="switchTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
        <a-button size="small" type="outline" :loading="activeLoading" @click="refreshCurrentTab">
          刷新当前分栏
        </a-button>
      </div>
    </section>

    <section v-if="activeLoading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="activeError && !loaded[activeTab]" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ activeError }}
    </section>

    <section v-else-if="activeTab === 'providers'" class="space-y-3">
      <section class="p-3 border border-slate-200 bg-white">
        <div class="text-[11px] text-slate-600">
          <p class="m-0">
            API Key 覆盖状态：LLM={{ providers?.overrideState?.aiApiKeyOverridden ? 'override' : 'env' }} ·
            DocAI={{ providers?.overrideState?.docAiApiKeyOverridden ? 'override' : 'env' }} ·
            Tavily={{ providers?.overrideState?.adminTavilyApiKeyOverridden ? 'override' : 'env' }}
          </p>
          <p class="m-0 mt-1">
            最近更新：{{ formatTime(providers?.overrideState?.updatedAt || '') }} · by {{ providers?.overrideState?.updatedByUserId || '-' }}
          </p>
        </div>
        <p v-if="providerSaveMessage" class="text-[11px] text-emerald-600 mt-2">
          {{ providerSaveMessage }}
        </p>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <a-table
          :bordered="{ cell: true }"
          :columns="providerColumns"
          :data="providerRows"
          :pagination="false"
          row-key="key"
          size="small"
        >
          <template #config="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0 truncate">
                mode={{ record.mode }} · provider={{ record.provider }}
              </p>
              <p class="text-[11px] text-slate-900 m-0 mt-1 truncate">
                model={{ record.model }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                baseURL={{ record.baseURL }}
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1">
                timeout={{ record.timeoutMs }}ms · retries={{ record.maxRetries }}
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1">
                price={{ record.modelPriceText }}
              </p>
            </div>
          </template>
          <template #status="{ record }">
            <div class="flex flex-wrap gap-1 items-center">
              <a-tag :color="record.keyConfigured ? 'green' : 'orange'" size="small">
                {{ record.keyConfigured ? 'Key 已配置' : 'Key 未配置' }}
              </a-tag>
              <a-tag color="arcoblue" size="small">
                {{ record.modelPoolSize }} models
              </a-tag>
              <a-tag
                v-if="record.modelFetchedAt"
                color="gray"
                size="small"
              >
                sync {{ formatTime(record.modelFetchedAt) }}
              </a-tag>
            </div>
            <p
              v-if="getProviderModelError(record.key)"
              class="text-[10px] text-rose-600 m-0 mt-1"
            >
              {{ getProviderModelError(record.key) }}
            </p>
          </template>
          <template #actions="{ record }">
            <div class="flex gap-1 items-center">
              <a-button
                size="mini"
                :loading="getProviderModelLoading(record.key)"
                :disabled="!record.keyConfigured"
                @click="loadProviderModelOptions(toProviderEditorKey(record.key), { assignIfEmpty: true, syncCatalogForLlm: toProviderEditorKey(record.key) === 'llm' })"
              >
                拉取模型
              </a-button>
              <a-button size="mini" :loading="providerSaving" @click="openProviderEditor(toProviderEditorKey(record.key))">
                编辑
              </a-button>
            </div>
          </template>
        </a-table>
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div>
          <p class="text-[11px] text-slate-900 font-semibold m-0">
            Provider Registry（多 Provider）
          </p>
          <p class="text-[10px] text-slate-500 m-0 mt-1">
            支持 provider/model 双层 enabled 开关，可用于 channels 场景路由。
          </p>
        </div>

        <a-table
          :bordered="{ cell: true }"
          :columns="registryProviderColumns"
          :data="registryProviderRows"
          :pagination="false"
          row-key="rowKey"
          size="small"
        >
          <template #config="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0 truncate">
                id={{ record.id }} · adapter={{ record.adapter }} · provider={{ record.provider }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                baseURL={{ record.baseURL || '-' }}
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1">
                enabled={{ record.enabled ? 'true' : 'false' }} · key={{ record.apiKeyConfigured ? 'configured' : 'missing' }}
              </p>
            </div>
          </template>
          <template #models="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0">
                {{ (record.models || []).length }} models
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1 truncate">
                {{ toProviderModelPreview(record.models) }}
              </p>
            </div>
          </template>
          <template #enabled="{ record }">
            <a-switch
              :model-value="record.enabled"
              :loading="registryProviderMutating[record.id]"
              size="small"
              @change="(value: boolean | string | number) => toggleRegistryProviderEnabled(record.id, Boolean(value))"
            />
          </template>
          <template #lastTriggeredAt="{ record }">
            <span class="text-[10px] text-slate-600">{{ formatTime(record.lastTriggeredAt) }}</span>
          </template>
          <template #totalConsumed="{ record }">
            <span class="text-[10px] text-slate-700 font-mono">{{ Number(record.totalConsumed || 0).toLocaleString('zh-CN') }}</span>
          </template>
          <template #actions="{ record }">
            <div class="space-y-1">
              <div class="flex gap-1 items-center">
                <a-button
                  size="mini"
                  :loading="registryProviderPullLoading[record.id]"
                  :disabled="registryProviderMutating[record.id]"
                  @click="pullRegistryProviderModels(record.id)"
                >
                  拉取模型
                </a-button>
                <a-button
                  size="mini"
                  :loading="registryProviderTestLoading[record.id]"
                  :disabled="registryProviderMutating[record.id]"
                  @click="testRegistryProvider(record.id)"
                >
                  测试
                </a-button>
                <a-button
                  size="mini"
                  type="outline"
                  :disabled="registryProviderMutating[record.id]"
                  @click="openRegistryProviderModelEditor(record.id)"
                >
                  模型格式
                </a-button>
                <a-popconfirm
                  content="确认删除该 Provider 吗？"
                  type="warning"
                  @ok="deleteRegistryProvider(record.id)"
                >
                  <a-button
                    size="mini"
                    status="danger"
                    :loading="registryProviderMutating[record.id]"
                  >
                    删除
                  </a-button>
                </a-popconfirm>
              </div>
              <p v-if="registryProviderTestMessage[record.id]" class="text-[10px] m-0" :class="(registryProviderTestMessage[record.id] || '').includes('失败') ? 'text-rose-600' : 'text-emerald-600'">
                {{ registryProviderTestMessage[record.id] }}
              </p>
            </div>
          </template>
        </a-table>
      </section>

      <a-modal
        v-model:visible="registryProviderModelEditorVisible"
        :closable="!providerSaving"
        :footer="false"
        :mask-closable="!providerSaving"
        :title="`编辑模型格式：${registryProviderModelEditorProviderName || '-'}`"
        @cancel="closeRegistryProviderModelEditor"
      >
        <div class="space-y-3">
          <section class="p-3 border border-slate-200 bg-slate-50/40">
            <p class="text-[11px] text-slate-700 m-0">
              Provider ID：{{ registryProviderModelEditorProviderId || '-' }}
            </p>
            <p class="text-[10px] text-slate-500 m-0 mt-1">
              每个模型可独立配置 format（openai-compatible / response）与启用状态。
            </p>
          </section>

          <section class="p-3 border border-slate-200 bg-white">
            <a-table
              :bordered="{ cell: true }"
              :columns="registryProviderModelColumns"
              :data="registryProviderModelEditorRows"
              :pagination="false"
              row-key="model"
              size="small"
            >
              <template #format="{ record }">
                <a-select v-model="record.format" size="small">
                  <a-option value="openai-compatible">
                    openai-compatible
                  </a-option>
                  <a-option value="response">
                    response
                  </a-option>
                </a-select>
              </template>
              <template #enabled="{ record }">
                <a-switch v-model="record.enabled" size="small" />
              </template>
              <template #price="{ record }">
                <p class="text-[10px] text-slate-600 m-0">
                  {{ formatCatalogPrice(record) }}
                </p>
              </template>
            </a-table>
          </section>
        </div>

        <div class="mt-4 flex gap-2 justify-end">
          <a-button size="small" :disabled="providerSaving" @click="closeRegistryProviderModelEditor">
            取消
          </a-button>
          <a-button
            size="small"
            type="primary"
            :loading="providerSaving || registryProviderMutating[registryProviderModelEditorProviderId]"
            @click="saveRegistryProviderModelEditor"
          >
            保存
          </a-button>
        </div>
      </a-modal>

      <a-modal
        v-model:visible="providerEditorVisible"
        :closable="!providerSaving"
        :footer="false"
        :mask-closable="!providerSaving"
        :title="providerEditorTitle"
        @cancel="closeProviderEditor"
      >
        <div class="space-y-3">
          <section class="p-3 border border-slate-200 bg-slate-50/40 space-y-1">
            <div class="flex gap-2 items-center justify-between">
              <p class="text-[11px] text-slate-700 m-0">
                模式：{{ providerEditorKey === 'llm' ? 'LLM' : 'DocAI' }}
              </p>
              <a-button
                size="mini"
                type="outline"
                :loading="providerEditorKey === 'llm' ? providerModelLoading.llm : providerModelLoading.docAi"
                @click="loadProviderModelOptions(providerEditorKey, { assignIfEmpty: true, syncCatalogForLlm: providerEditorKey === 'llm' })"
              >
                自动拉取模型
              </a-button>
            </div>
            <p class="text-[10px] text-slate-500 m-0">
              当前模型价格={{ activeProviderModelOption?.pricingText || '价格未返回' }} · 来源={{ activeProviderModelOption ? toPricingSourceLabel(activeProviderModelOption.pricingSource) : 'none' }}
            </p>
            <p class="text-[10px] text-slate-500 m-0">
              最近拉取时间={{ formatTime(providerModelFetchedAt[providerEditorKey] || '') }}
            </p>
          </section>

          <section class="p-3 border border-slate-200 bg-white space-y-2">
            <p class="text-[11px] text-slate-700 font-medium m-0">
              基础配置
            </p>
            <div class="gap-2 grid md:grid-cols-2">
              <label class="block space-y-1">
                <span class="text-[11px] text-slate-600">Provider</span>
                <a-input v-if="providerEditorKey === 'llm'" v-model="providerForm.aiProvider" size="small" placeholder="例如：openai" />
                <a-input v-else v-model="providerForm.docAiProvider" size="small" placeholder="例如：openai" />
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] text-slate-600">Model（可手输）</span>
                <a-input v-if="providerEditorKey === 'llm'" v-model="providerForm.aiModel" size="small" placeholder="例如：gpt-4o-mini" />
                <a-input v-else v-model="providerForm.docAiModel" size="small" placeholder="例如：gpt-4o-mini" />
              </label>
              <label v-if="providerEditorKey === 'llm'" class="block space-y-1">
                <span class="text-[11px] text-slate-600">Embedding Model</span>
                <a-input v-model="providerForm.aiEmbeddingModel" size="small" placeholder="例如：text-embedding-3-small" />
              </label>
              <label class="block space-y-1 md:col-span-2">
                <span class="text-[11px] text-slate-600">Base URL</span>
                <a-input v-if="providerEditorKey === 'llm'" v-model="providerForm.aiBaseURL" size="small" placeholder="例如：https://api.openai.com/v1" />
                <a-input v-else v-model="providerForm.docAiBaseURL" size="small" placeholder="例如：https://api.openai.com/v1" />
              </label>
            </div>
          </section>

          <section class="p-3 border border-slate-200 bg-white space-y-2">
            <p class="text-[11px] text-slate-700 font-medium m-0">
              模型池（Table）
            </p>
            <a-table
              :bordered="{ cell: true }"
              :columns="providerEditorModelColumns"
              :data="providerEditorModelRows"
              :pagination="false"
              row-key="rowKey"
              size="small"
            >
              <template #pricingText="{ record }">
                {{ record.pricingText || '-' }}
              </template>
              <template #pricingSource="{ record }">
                {{ toPricingSourceLabel(record.pricingSource) }}
              </template>
              <template #selected="{ record }">
                <a-tag :color="record.selected ? 'green' : 'gray'" size="small">
                  {{ record.selected ? '已选中' : '未选' }}
                </a-tag>
              </template>
              <template #actions="{ record }">
                <a-button size="mini" type="outline" @click="selectProviderEditorModel(record.model)">
                  选择
                </a-button>
              </template>
            </a-table>
            <p v-if="providerModelError[providerEditorKey]" class="text-[10px] text-rose-600 m-0">
              {{ providerModelError[providerEditorKey] }}
            </p>
            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">模型池文本编辑（每行一个）</span>
              <a-textarea
                v-model="activeProviderManualModelsText"
                :auto-size="{ minRows: 3, maxRows: 8 }"
                placeholder="每行一个模型名，例如：gpt-5.4"
              />
            </label>
          </section>

          <section class="p-3 border border-slate-200 bg-white space-y-2">
            <p class="text-[11px] text-slate-700 font-medium m-0">
              密钥策略
            </p>
            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">API Key（留空=keep，填写=replace）</span>
              <a-input
                v-if="providerEditorKey === 'llm'"
                v-model="providerForm.aiApiKey"
                size="small"
                type="password"
                placeholder="留空保持原值，填写后替换为新 Key"
              />
              <a-input
                v-else
                v-model="providerForm.docAiApiKey"
                size="small"
                type="password"
                placeholder="留空保持原值，填写后替换为新 Key"
              />
            </label>
          </section>
        </div>

        <div class="mt-4 flex gap-2 justify-end">
          <a-button size="small" :disabled="providerSaving" @click="closeProviderEditor">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="providerSaving" @click="saveProviderEditor">
            保存
          </a-button>
        </div>
      </a-modal>
    </section>

    <section v-else-if="activeTab === 'channels'" class="space-y-3">
      <section class="p-3 border border-slate-200 bg-white">
        <a-table
          :bordered="{ cell: true }"
          :columns="channelConfigColumns"
          :data="channelConfigRows"
          :pagination="false"
          row-key="key"
          size="small"
        >
          <template #config="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0">
                enabled={{ record.enabled ? 'true' : 'false' }} · webTimeout={{ record.webTimeoutMs }}ms
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1">
                maxWebResults={{ record.maxWebResults }} · maxPageChars={{ record.maxPageChars }}
              </p>
            </div>
          </template>
          <template #status="{ record }">
            <div class="flex flex-wrap gap-1 items-center">
              <a-tag :color="record.enabled ? 'green' : 'gray'" size="small">
                {{ record.enabled ? 'Enabled' : 'Disabled' }}
              </a-tag>
              <a-tag :color="record.keyConfigured ? 'green' : 'orange'" size="small">
                {{ record.keyConfigured ? 'Tavily Key 已配置' : 'Tavily Key 未配置' }}
              </a-tag>
            </div>
          </template>
          <template #actions="{ record }">
            <a-button size="mini" :loading="providerSaving" @click="openChannelEditor(record.key)">
              编辑
            </a-button>
          </template>
        </a-table>
        <p v-if="providerSaveMessage" class="text-[11px] text-emerald-600 mt-2">
          {{ providerSaveMessage }}
        </p>
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div>
          <div>
            <p class="text-[11px] text-slate-900 font-semibold m-0">
              Channel 场景路由（模型 + 提示词）
            </p>
            <p class="text-[10px] text-slate-500 m-0 mt-1">
              不同场景可指定不同 Provider/Model，并独立维护场景提示词。
            </p>
          </div>
        </div>

        <a-table
          :bordered="{ cell: true }"
          :columns="registryChannelColumns"
          :data="registryChannelRows"
          :pagination="false"
          row-key="rowKey"
          size="small"
        >
          <template #routing="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0 truncate">
                providerId={{ record.providerId || '-' }} · model={{ record.model || '-' }}
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1">
                enabled={{ record.enabled ? 'true' : 'false' }}
              </p>
            </div>
          </template>
          <template #prompt="{ record }">
            <div class="min-w-0">
              <p class="text-[10px] text-slate-700 m-0">
                {{ toPromptPreview(record.prompt) }}
              </p>
              <p v-if="registryChannelTestMessage[record.key]" class="text-[10px] m-0 mt-1" :class="(registryChannelTestMessage[record.key] || '').includes('失败') ? 'text-rose-600' : 'text-emerald-600'">
                {{ registryChannelTestMessage[record.key] }}
              </p>
            </div>
          </template>
          <template #actions="{ record }">
            <div class="flex gap-1 items-center">
              <a-button size="mini" type="outline" :disabled="providerSaving" @click="openChannelScenarioEditor(record)">
                编辑
              </a-button>
              <a-button size="mini" :loading="registryChannelTestLoading[record.key]" @click="testChannelScenario(record.key)">
                场景测试
              </a-button>
            </div>
          </template>
        </a-table>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <div class="flex flex-wrap gap-2 items-center justify-between">
          <div class="flex gap-2 items-center">
            <span class="text-[11px] text-slate-600">调用统计窗口</span>
            <a-select v-model="channelDays" size="small" style="width: 100px" @change="loadChannels">
              <a-option :value="1">
                1 天
              </a-option>
              <a-option :value="7">
                7 天
              </a-option>
              <a-option :value="30">
                30 天
              </a-option>
            </a-select>
          </div>
          <div class="text-[11px] text-slate-600 flex gap-2 items-center">
            <span>totalCalls: <b class="text-slate-900 font-mono">{{ channels?.totalCalls || 0 }}</b></span>
            <span>totalUnits: <b class="text-slate-900 font-mono">{{ channels?.totalUnits || 0 }}</b></span>
          </div>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <a-table
          :bordered="{ cell: true }"
          :columns="channelUsageColumns"
          :data="channels?.items || []"
          :pagination="false"
          row-key="route"
          size="small"
        >
          <template #lastAt="{ record }">
            {{ formatTime(record.lastAt) }}
          </template>
        </a-table>
      </section>

      <a-modal
        v-model:visible="channelScenarioEditorVisible"
        :closable="!providerSaving"
        :footer="false"
        :mask-closable="!providerSaving"
        title="编辑场景路由"
        @cancel="closeChannelScenarioEditor"
      >
        <div class="space-y-3">
          <section class="p-3 border border-slate-200 bg-slate-50/40 space-y-1">
            <p class="text-[11px] text-slate-700 m-0">
              场景：{{ channelScenarioForm.label || channelScenarioForm.key }}
            </p>
            <p class="text-[10px] text-slate-500 m-0">
              key={{ channelScenarioForm.key }} · {{ channelScenarioForm.description || '无描述' }}
            </p>
          </section>

          <section class="p-3 border border-slate-200 bg-white space-y-2">
            <label class="text-[11px] text-slate-700 inline-flex gap-2 items-center">
              <span>启用</span>
              <a-switch v-model="channelScenarioForm.enabled" size="small" />
            </label>

            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">Provider</span>
              <a-select
                v-model="channelScenarioForm.providerId"
                size="small"
                @change="onChannelScenarioProviderChange"
              >
                <a-option
                  v-for="item in providers?.registry?.providers || []"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.name }} ({{ item.id }})
                </a-option>
              </a-select>
            </label>

            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">Model</span>
              <a-input
                v-model="channelScenarioForm.model"
                size="small"
                placeholder="例如：gpt-5.4"
              />
            </label>
            <p class="text-[10px] text-slate-500 m-0">
              可用模型：{{ getProviderModelsById(channelScenarioForm.providerId).map(item => `${item.model}[${item.format}]${item.enabled ? '' : '(off)'}`).slice(0, 6).join(' · ') || '-' }}
            </p>
          </section>

          <section class="p-3 border border-slate-200 bg-white">
            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">场景提示词</span>
              <a-textarea
                v-model="channelScenarioForm.prompt"
                :auto-size="{ minRows: 6, maxRows: 14 }"
                placeholder="请输入该场景专用提示词。"
              />
            </label>
          </section>
        </div>

        <div class="mt-4 flex gap-2 justify-end">
          <a-button size="small" :disabled="providerSaving" @click="closeChannelScenarioEditor">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="providerSaving" @click="saveChannelScenarioEditor">
            保存
          </a-button>
        </div>
      </a-modal>

      <a-modal
        v-model:visible="channelEditorVisible"
        :closable="!providerSaving"
        :footer="false"
        :mask-closable="!providerSaving"
        title="编辑 Admin Agent Channel"
        @cancel="closeChannelEditor"
      >
        <div class="space-y-3">
          <label class="text-[11px] text-slate-700 inline-flex gap-2 items-center">
            <span>enabled</span>
            <a-switch v-model="providerForm.adminAiEnabled" size="small" />
          </label>
          <div class="gap-2 grid md:grid-cols-2">
            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">Web Timeout (ms)</span>
              <a-input-number v-model="providerForm.adminAiWebTimeoutMs" size="small" :min="1000" :max="120000" placeholder="webTimeoutMs" />
            </label>
            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">Max Web Results</span>
              <a-input-number v-model="providerForm.adminAiMaxWebResults" size="small" :min="1" :max="10" placeholder="maxWebResults" />
            </label>
            <label class="block space-y-1 md:col-span-2">
              <span class="text-[11px] text-slate-600">Max Page Chars</span>
              <a-input-number v-model="providerForm.adminAiMaxPageChars" size="small" :min="1000" :max="50000" placeholder="maxPageChars" />
            </label>
          </div>
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">Tavily Key 策略</span>
            <div class="gap-2 grid md:grid-cols-[140px_1fr]">
              <a-select v-model="providerForm.adminAiTavilyApiKeyMode" size="small">
                <a-option value="keep">
                  keep key
                </a-option>
                <a-option value="replace">
                  replace key
                </a-option>
                <a-option value="clear">
                  clear key
                </a-option>
              </a-select>
              <a-input
                v-model="providerForm.adminAiTavilyApiKey"
                size="small"
                type="password"
                :disabled="providerForm.adminAiTavilyApiKeyMode !== 'replace'"
                placeholder="仅 replace 模式下填写新的 Tavily API Key"
              />
            </div>
          </label>
        </div>

        <div class="mt-4 flex gap-2 justify-end">
          <a-button size="small" :disabled="providerSaving" @click="closeChannelEditor">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="providerSaving" @click="saveChannelEditor">
            保存
          </a-button>
        </div>
      </a-modal>
    </section>

    <section v-else-if="activeTab === 'models'" class="space-y-3">
      <section class="p-3 border border-slate-200 bg-white">
        <div class="flex flex-wrap gap-2 items-center justify-between">
          <div class="flex gap-2 items-center">
            <span class="text-[11px] text-slate-600">统计窗口</span>
            <a-select v-model="modelDays" size="small" style="width: 100px" @change="loadModels">
              <a-option :value="1">
                1 天
              </a-option>
              <a-option :value="7">
                7 天
              </a-option>
              <a-option :value="30">
                30 天
              </a-option>
            </a-select>
          </div>
          <div class="text-[11px] text-slate-600">
            totalMessages:
            <b class="text-slate-900 font-mono">{{ models?.totalMessages || 0 }}</b>
          </div>
        </div>
        <p class="text-[10px] text-slate-500 mb-0 mt-2">
          聚合模型池：{{ models?.totalCatalogModels || 0 }}（来自所有已配置 providers）
        </p>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <a-table
          :bordered="{ cell: true }"
          :columns="modelCatalogColumns"
          :data="modelCatalogRows"
          :pagination="false"
          row-key="rowKey"
          size="small"
        >
          <template #status="{ record }">
            <div class="flex flex-wrap gap-1 items-center">
              <a-tag :color="record.providerEnabled ? 'green' : 'gray'" size="small">
                {{ record.providerEnabled ? 'provider:on' : 'provider:off' }}
              </a-tag>
              <a-tag :color="record.modelEnabled ? 'green' : 'gray'" size="small">
                {{ record.modelEnabled ? 'model:on' : 'model:off' }}
              </a-tag>
              <a-tag color="arcoblue" size="small">
                {{ record.pricingSource }}
              </a-tag>
            </div>
          </template>
          <template #price="{ record }">
            <p class="text-[10px] text-slate-600 m-0">
              {{ formatCatalogPrice(record) }}
            </p>
          </template>
        </a-table>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <a-table
          :bordered="{ cell: true }"
          :columns="modelColumns"
          :data="modelRows"
          :pagination="false"
          row-key="rowKey"
          size="small"
        >
          <template #fallbackRate="{ record }">
            {{ formatRate(record.fallbackRate) }}
          </template>
          <template #lastAt="{ record }">
            {{ formatTime(record.lastAt) }}
          </template>
          <template #actions="{ record }">
            <a-button size="mini" @click="openModelDetail(record)">
              查看
            </a-button>
          </template>
        </a-table>
      </section>

      <a-modal
        v-model:visible="modelDetailVisible"
        :footer="false"
        title="Model 详情"
        @cancel="closeModelDetail"
      >
        <div v-if="modelDetailRow" class="text-[11px] text-slate-700 space-y-2">
          <p class="m-0">
            provider={{ modelDetailRow.provider || '-' }} / model={{ modelDetailRow.model || '-' }}
          </p>
          <p class="m-0">
            messages={{ modelDetailRow.messages }} · fallback={{ modelDetailRow.fallbackMessages }} · fallbackRate={{ formatRate(modelDetailRow.fallbackRate) }}
          </p>
          <p class="m-0">
            最近调用：{{ formatTime(modelDetailRow.lastAt) }}
          </p>
        </div>
        <div class="mt-4 flex justify-end">
          <a-button size="small" @click="closeModelDetail">
            关闭
          </a-button>
        </div>
      </a-modal>
    </section>

    <section v-else-if="activeTab === 'audits'" class="space-y-3">
      <section class="p-3 border border-slate-200 bg-white">
        <div class="gap-2 grid md:grid-cols-[1fr_auto]">
          <a-input
            v-model="auditAction"
            size="small"
            allow-clear
            placeholder="按 action 模糊筛选，如 ai.invoke.project_chat"
            @press-enter="applyAuditFilter"
          />
          <a-button size="small" type="primary" @click="applyAuditFilter">
            应用筛选
          </a-button>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <a-table
          :bordered="{ cell: true }"
          :columns="auditColumns"
          :data="audits"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #createdAt="{ record }">
            {{ formatTime(record.createdAt) }}
          </template>
          <template #actorName="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0 truncate">
                {{ record.actorName || '-' }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                {{ record.actorUserId || '-' }}
              </p>
            </div>
          </template>
          <template #contestName="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0 truncate">
                {{ record.contestName || '-' }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                {{ record.contestId || '-' }}
              </p>
            </div>
          </template>
          <template #payload="{ record }">
            <p class="text-[10px] text-slate-600 font-mono m-0">
              {{ toAuditPayloadPreview(record.payload || {}) }}
            </p>
          </template>
          <template #actions="{ record }">
            <a-button size="mini" @click="openAuditDetail(record)">
              查看
            </a-button>
          </template>
        </a-table>

        <div class="mt-3 flex justify-end">
          <a-pagination
            :current="auditPage"
            :page-size="auditPageSize"
            :page-size-options="[10, 20, 50]"
            :show-total="true"
            :total="auditTotal"
            size="small"
            @change="onAuditPageChange"
            @page-size-change="onAuditPageSizeChange"
          />
        </div>
      </section>

      <a-modal
        v-model:visible="auditDetailVisible"
        :footer="false"
        title="Audit 详情"
        @cancel="closeAuditDetail"
      >
        <div v-if="auditDetailRow" class="text-[11px] text-slate-700 space-y-2">
          <p class="m-0">
            时间：{{ formatTime(auditDetailRow.createdAt) }}
          </p>
          <p class="m-0">
            action={{ auditDetailRow.action }}
          </p>
          <p class="m-0">
            actor={{ auditDetailRow.actorName || '-' }} ({{ auditDetailRow.actorUserId || '-' }})
          </p>
          <p class="m-0">
            contest={{ auditDetailRow.contestName || '-' }} ({{ auditDetailRow.contestId || '-' }})
          </p>
          <pre class="text-[10px] leading-4 font-mono p-2 border border-slate-200 rounded bg-slate-50 max-h-80 overflow-auto">{{ toPrettyJson(auditDetailRow.payload || {}) }}</pre>
        </div>
        <div class="mt-4 flex justify-end">
          <a-button size="small" @click="closeAuditDetail">
            关闭
          </a-button>
        </div>
      </a-modal>
    </section>

    <section v-else class="space-y-3">
      <section class="p-3 border border-slate-200 bg-white">
        <div class="gap-2 grid md:grid-cols-3">
          <a-select v-model="logFilters.days" size="small" placeholder="窗口天数">
            <a-option :value="1">
              1 天
            </a-option>
            <a-option :value="7">
              7 天
            </a-option>
            <a-option :value="30">
              30 天
            </a-option>
          </a-select>
          <a-input v-model="logFilters.provider" size="small" allow-clear placeholder="provider" />
          <a-input v-model="logFilters.model" size="small" allow-clear placeholder="model" />
          <a-input v-model="logFilters.role" size="small" allow-clear placeholder="role(system/user/assistant)" />
          <a-input v-model="logFilters.workspaceId" size="small" allow-clear placeholder="workspaceId" />
          <a-input v-model="logFilters.sessionId" size="small" allow-clear placeholder="sessionId" />
        </div>
        <div class="mt-2 gap-2 grid md:grid-cols-[1fr_auto]">
          <a-input
            v-model="logFilters.q"
            size="small"
            allow-clear
            placeholder="全文检索：content/session/workspace/actor/contest"
            @press-enter="applyLogFilter"
          />
          <a-button size="small" type="primary" @click="applyLogFilter">
            应用筛选
          </a-button>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <a-table
          :bordered="{ cell: true }"
          :columns="logColumns"
          :data="logs"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #createdAt="{ record }">
            {{ formatTime(record.createdAt) }}
          </template>
          <template #session="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 font-semibold m-0 truncate">
                {{ record.workspaceName || '-' }}
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1 truncate">
                {{ record.sessionTitle || record.sessionId }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                ws={{ record.workspaceId }} · sid={{ record.sessionId }}
              </p>
            </div>
          </template>
          <template #provider="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0 truncate">
                {{ record.provider || '-' }} / {{ record.model || '-' }}
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1">
                fallback={{ record.fallbackUsed ? 'true' : 'false' }}
              </p>
            </div>
          </template>
          <template #actorName="{ record }">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-900 m-0 truncate">
                {{ record.actorName || '-' }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                {{ record.actorUserId || '-' }}
              </p>
            </div>
          </template>
          <template #contentPreview="{ record }">
            <div class="min-w-0">
              <p class="text-[10px] text-slate-700 font-mono m-0 truncate">
                {{ record.contentPreview || '-' }}
              </p>
              <p class="text-[10px] text-slate-500 m-0 mt-1 truncate">
                contest={{ record.contestName || record.contestId || '-' }} · track={{ record.trackId || '-' }} · major={{ record.major || '-' }}
              </p>
            </div>
          </template>
          <template #actions="{ record }">
            <a-button size="mini" @click="openLogDetail(record)">
              查看
            </a-button>
          </template>
        </a-table>

        <div class="mt-3 flex justify-end">
          <a-pagination
            :current="logPage"
            :page-size="logPageSize"
            :page-size-options="[10, 20, 50]"
            :show-total="true"
            :total="logTotal"
            size="small"
            @change="onLogPageChange"
            @page-size-change="onLogPageSizeChange"
          />
        </div>
      </section>

      <a-modal
        v-model:visible="logDetailVisible"
        :footer="false"
        title="Log 详情"
        @cancel="closeLogDetail"
      >
        <div v-if="logDetailRow" class="text-[11px] text-slate-700 space-y-2">
          <p class="m-0">
            时间：{{ formatTime(logDetailRow.createdAt) }}
          </p>
          <p class="m-0">
            workspace={{ logDetailRow.workspaceName || '-' }} ({{ logDetailRow.workspaceId || '-' }})
          </p>
          <p class="m-0">
            session={{ logDetailRow.sessionTitle || '-' }} ({{ logDetailRow.sessionId || '-' }})
          </p>
          <p class="m-0">
            role={{ logDetailRow.role || '-' }} · provider={{ logDetailRow.provider || '-' }} · model={{ logDetailRow.model || '-' }} · fallback={{ logDetailRow.fallbackUsed ? 'true' : 'false' }}
          </p>
          <p class="m-0">
            actor={{ logDetailRow.actorName || '-' }} ({{ logDetailRow.actorUserId || '-' }})
          </p>
          <p class="m-0">
            contest={{ logDetailRow.contestName || logDetailRow.contestId || '-' }} · track={{ logDetailRow.trackId || '-' }} · major={{ logDetailRow.major || '-' }}
          </p>
          <pre class="text-[10px] leading-4 font-mono p-2 border border-slate-200 rounded bg-slate-50 max-h-80 overflow-auto">{{ logDetailRow.content || '-' }}</pre>
        </div>
        <div class="mt-4 flex justify-end">
          <a-button size="small" @click="closeLogDetail">
            关闭
          </a-button>
        </div>
      </a-modal>
    </section>
  </div>
</template>
