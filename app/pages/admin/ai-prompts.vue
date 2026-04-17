<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'

definePageMeta({
  layout: 'admin',
})

type AiConsoleTab = 'channel_models' | 'scenes' | 'audits' | 'logs'
type SecretMode = 'keep' | 'replace' | 'clear'
type ModelFormat = 'openai-compatible' | 'response'
type PricingSource = 'provider' | 'manual' | 'none'
type PlatformAiChannelKey
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
    | 'admin_general'
    | 'admin_publish_assistant'
    | 'document_analysis'

interface ModelPoolItem {
  model: string
  label: string
  format: ModelFormat
  enabled: boolean
  providerInputPricePer1M: number | null
  providerOutputPricePer1M: number | null
  manualInputPricePer1M: number | null
  manualOutputPricePer1M: number | null
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: PricingSource
  manualPriceOverride: boolean
}

interface SceneDefinition {
  key: PlatformAiChannelKey
  label: string
  description: string
}

interface SceneItem {
  key: PlatformAiChannelKey
  label: string
  description: string
  enabled: boolean
  models: string[]
  prompt: string
}

interface ProvidersPayload {
  upstream: {
    provider: string
    baseURL: string
    timeoutMs: number
    maxRetries: number
    apiKeyConfigured: boolean
    visionModel?: string
  }
  modelPool: {
    fetchedAt: string
    total: number
    items: ModelPoolItem[]
  }
  scenes: {
    items: SceneItem[]
    definitions: SceneDefinition[]
  }
  adminAi: {
    enabled: boolean
    tavilyConfigured: boolean
    webTimeoutMs: number
    maxWebResults: number
    maxPageChars: number
  }
  config?: {
    masterKeyReady?: boolean
  }
  warnings?: {
    ignoredSecretReplaceKeys?: string[]
  }
  overrideState?: {
    aiApiKeyOverridden?: boolean
    docAiApiKeyOverridden?: boolean
    adminTavilyApiKeyOverridden?: boolean
    updatedAt?: string
    updatedByUserId?: string
  }
}

interface ProviderPullItem {
  id: string
  provider: string
  model: string
  label: string
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: 'provider' | 'pricing_table' | 'none'
  pricingText: string
}

interface ProviderModelsPayload {
  provider: string
  baseURL: string
  fetchedAt: string
  items: ProviderPullItem[]
}

interface ModelPullSeriesGroup {
  key: string
  label: string
  items: ProviderPullItem[]
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
  channelKey: string
  latencyMs: number | null
  attemptChain: Array<{ provider: string, model: string, success: boolean, latencyMs: number, error?: string }>
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

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const tabOptions: Array<{ key: AiConsoleTab, label: string }> = [
  { key: 'channel_models', label: '渠道和模型' },
  { key: 'scenes', label: '场景' },
  { key: 'audits', label: 'Audits' },
  { key: 'logs', label: 'Logs' },
]

const activeTab = ref<AiConsoleTab>('channel_models')
const consoleLoading = ref(false)
const consoleLoaded = ref(false)
const consoleError = ref('')
const saving = ref(false)
const pullLoading = ref(false)
const testingUpstream = ref(false)
const upstreamTestMessage = ref('')
const modelPullTriggered = ref(false)
const modelPullMessage = ref('')

const auditLoading = ref(false)
const auditError = ref('')
const audits = ref<AuditItem[]>([])
const auditAction = ref('')
const auditPage = ref(1)
const auditPageSize = ref(20)
const auditTotal = ref(0)
const auditDetailVisible = ref(false)
const auditDetailRow = ref<AuditItem | null>(null)

const logLoading = ref(false)
const logError = ref('')
const logs = ref<LogItem[]>([])
const logPage = ref(1)
const logPageSize = ref(20)
const logTotal = ref(0)
const logDetailVisible = ref(false)
const logDetailRow = ref<LogItem | null>(null)
const logFilters = reactive({
  days: 7,
  provider: '',
  model: '',
  role: '',
  workspaceId: '',
  sessionId: '',
  q: '',
})

const sceneTesting = reactive<Record<string, boolean>>({})
const sceneTestMessage = reactive<Record<string, string>>({})

const upstreamForm = reactive({
  provider: '',
  baseURL: '',
  timeoutMs: 15000,
  maxRetries: 2,
  visionModel: '',
  apiKeyMode: 'keep' as SecretMode,
  apiKey: '',
})

const adminAiForm = reactive({
  enabled: false,
  webTimeoutMs: 12000,
  maxWebResults: 5,
  maxPageChars: 10000,
  tavilyApiKeyMode: 'keep' as SecretMode,
  tavilyApiKey: '',
})

const configMasterKeyReady = ref(true)
const upstreamApiKeyConfigured = ref(false)

const modelPoolItems = ref<ModelPoolItem[]>([])
const modelPoolFetchedAt = ref('')
const modelPullSelectorVisible = ref(false)
const pulledProviderModels = ref<ProviderPullItem[]>([])
const pulledProviderFetchedAt = ref('')
const modelPullFilterKeyword = ref('')
const selectedPulledModels = ref<string[]>([])
const expandedModelPullSeriesKeys = ref<string[]>([])
const sceneItems = ref<SceneItem[]>([])
const sceneDefinitions = ref<SceneDefinition[]>([])

const modelEditorVisible = ref(false)
const modelEditorIsCreate = ref(false)
const modelEditorForm = reactive<ModelPoolItem>({
  model: '',
  label: '',
  format: 'openai-compatible',
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
})

const sceneEditorVisible = ref(false)
const sceneEditorForm = reactive({
  key: 'project_chat' as PlatformAiChannelKey,
  label: '',
  description: '',
  enabled: true,
  models: [] as string[],
  prompt: '',
})
const sceneBatchEditorVisible = ref(false)
const sceneBatchForm = reactive({
  models: [] as string[],
})

function formatTime(value?: string | null): string {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return String(value)
  return date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

function formatLatency(value?: number | null): string {
  const latencyMs = Number(value)
  if (!Number.isFinite(latencyMs) || latencyMs < 0)
    return '-'
  return `${Math.round(latencyMs)} ms`
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

function normalizeUpstreamBaseURL(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\/+$/g, '')
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/v1\/responses$/i, '')
    .replace(/\/v1\/embeddings$/i, '')
    .replace(/\/v1\/audio\/transcriptions$/i, '')
    .replace(/\/v1\/models$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/embeddings$/i, '')
    .replace(/\/audio\/transcriptions$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/v1$/i, '')
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
    method?: 'GET' | 'POST' | 'PATCH'
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

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of models) {
    const value = String(item || '').trim()
    if (!value || seen.has(value))
      continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function normalizeSceneModels(raw: unknown): string[] {
  if (!Array.isArray(raw))
    return []
  return dedupeModels(raw.map(item => String(item || '').trim()))
}

const modelSeriesRules = [
  { key: 'qwen', label: 'Qwen 系列', patterns: [/qwen/i, /qwq/i] },
  { key: 'deepseek', label: 'DeepSeek 系列', patterns: [/deepseek/i] },
  { key: 'claude', label: 'Claude 系列', patterns: [/claude/i] },
  { key: 'gemini', label: 'Gemini 系列', patterns: [/gemini/i] },
  { key: 'openai', label: 'OpenAI 系列', patterns: [/\bgpt\b/i, /\bo1\b/i, /\bo3\b/i, /\bo4\b/i, /text-embedding/i] },
  { key: 'llama', label: 'Llama 系列', patterns: [/llama/i] },
  { key: 'mistral', label: 'Mistral 系列', patterns: [/mistral/i] },
  { key: 'glm', label: 'GLM 系列', patterns: [/glm/i, /chatglm/i, /cogview/i, /cogvideox/i, /cogito/i] },
  { key: 'doubao', label: 'Doubao 系列', patterns: [/doubao/i] },
  { key: 'moonshot', label: 'Moonshot 系列', patterns: [/moonshot/i, /kimi/i] },
  { key: 'baichuan', label: '百川系列', patterns: [/baichuan/i] },
] as const

function formatSeriesLabel(token: string): string {
  const normalized = String(token || '').trim()
  if (!normalized)
    return '其他模型'
  if (/^[a-z0-9]+$/i.test(normalized) && normalized.length <= 4)
    return `${normalized.toUpperCase()} 系列`
  return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)} 系列`
}

function resolveModelSeries(item: Pick<ProviderPullItem, 'model' | 'label'>): { key: string, label: string } {
  const searchText = `${item.model} ${item.label}`.toLowerCase()
  const matchedRule = modelSeriesRules.find(rule => rule.patterns.some(pattern => pattern.test(searchText)))
  if (matchedRule)
    return { key: matchedRule.key, label: matchedRule.label }

  const firstToken = String(item.model || item.label || '')
    .trim()
    .split(/[:/_\s.-]+/g)
    .find(Boolean)
  if (!firstToken)
    return { key: 'other', label: '其他模型' }

  return {
    key: `series:${firstToken.toLowerCase()}`,
    label: formatSeriesLabel(firstToken),
  }
}

function formatPullPricingSource(source: ProviderPullItem['pricingSource']): string {
  if (source === 'provider')
    return '接口返回'
  if (source === 'pricing_table')
    return '价格表'
  return '未返回'
}

function resolveEffectivePricing(item: Pick<ModelPoolItem, 'providerInputPricePer1M' | 'providerOutputPricePer1M' | 'manualInputPricePer1M' | 'manualOutputPricePer1M' | 'manualPriceOverride'>): {
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  pricingSource: PricingSource
} {
  const inputPricePer1M = item.manualPriceOverride
    ? (item.manualInputPricePer1M ?? item.providerInputPricePer1M)
    : (item.providerInputPricePer1M ?? item.manualInputPricePer1M)
  const outputPricePer1M = item.manualPriceOverride
    ? (item.manualOutputPricePer1M ?? item.providerOutputPricePer1M)
    : (item.providerOutputPricePer1M ?? item.manualOutputPricePer1M)
  const hasManual = item.manualInputPricePer1M !== null || item.manualOutputPricePer1M !== null
  const hasProvider = item.providerInputPricePer1M !== null || item.providerOutputPricePer1M !== null
  const pricingSource: PricingSource = inputPricePer1M === null && outputPricePer1M === null
    ? 'none'
    : (item.manualPriceOverride && hasManual)
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

function normalizeModelItem(item: ModelPoolItem): ModelPoolItem {
  const pricing = resolveEffectivePricing(item)
  return {
    ...item,
    model: String(item.model || '').trim(),
    label: String(item.label || item.model || '').trim() || String(item.model || '').trim(),
    currency: String(item.currency || 'USD').trim().toUpperCase() || 'USD',
    inputPricePer1M: pricing.inputPricePer1M,
    outputPricePer1M: pricing.outputPricePer1M,
    pricingSource: pricing.pricingSource,
  }
}

function cloneModelItem(item: ModelPoolItem): ModelPoolItem {
  return normalizeModelItem({
    ...item,
  })
}

function buildPriceText(item: Pick<ModelPoolItem, 'inputPricePer1M' | 'outputPricePer1M' | 'currency'>): string {
  if (item.inputPricePer1M === null && item.outputPricePer1M === null)
    return 'none'
  const input = item.inputPricePer1M === null ? '-' : `${item.currency} ${Number(item.inputPricePer1M).toFixed(4)}/1M`
  const output = item.outputPricePer1M === null ? '-' : `${item.currency} ${Number(item.outputPricePer1M).toFixed(4)}/1M`
  return `输入 ${input} · 输出 ${output}`
}

function buildImportedPriceText(item: Pick<ModelPoolItem, 'providerInputPricePer1M' | 'providerOutputPricePer1M' | 'currency'>): string {
  if (item.providerInputPricePer1M === null && item.providerOutputPricePer1M === null)
    return '未导入'
  const input = item.providerInputPricePer1M === null ? '-' : `${item.currency} ${Number(item.providerInputPricePer1M).toFixed(4)}/1M`
  const output = item.providerOutputPricePer1M === null ? '-' : `${item.currency} ${Number(item.providerOutputPricePer1M).toFixed(4)}/1M`
  return `输入 ${input} · 输出 ${output}`
}

function sceneModelsPreview(scene: SceneItem): string {
  const models = dedupeModels(scene.models || [])
  if (models.length === 0)
    return '未配置，运行时将忽略并回退默认模型'
  return models.join(' -> ')
}

function promptPreview(prompt: string): string {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim()
  if (!text)
    return '-'
  return text.length > 90 ? `${text.slice(0, 90)}...` : text
}

const enabledModelSelectItems = computed(() => {
  return modelPoolItems.value
    .filter(item => item.enabled)
    .sort((a, b) => a.model.localeCompare(b.model, 'en'))
    .map(item => ({
      model: item.model,
      label: item.label,
      priceText: buildPriceText(item),
    }))
})

const modelPoolRows = computed(() => {
  return modelPoolItems.value
    .map(item => cloneModelItem(item))
    .sort((a, b) => a.model.localeCompare(b.model, 'en'))
})

const currentModelPoolNameSet = computed(() => new Set(modelPoolItems.value.map(item => item.model)))

const modelPullSeriesGroups = computed<ModelPullSeriesGroup[]>(() => {
  const orderMap = new Map<string, number>(modelSeriesRules.map((rule, index) => [rule.key, index]))
  const groups = new Map<string, ModelPullSeriesGroup>()

  for (const item of pulledProviderModels.value) {
    const series = resolveModelSeries(item)
    const currentGroup = groups.get(series.key) || {
      key: series.key,
      label: series.label,
      items: [],
    }
    currentGroup.items.push(item)
    groups.set(series.key, currentGroup)
  }

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      items: [...group.items].sort((a, b) => a.model.localeCompare(b.model, 'en')),
    }))
    .sort((a, b) => {
      const orderDiff = Number(orderMap.get(a.key) ?? 999) - Number(orderMap.get(b.key) ?? 999)
      if (orderDiff !== 0)
        return orderDiff
      if (a.key === 'other')
        return 1
      if (b.key === 'other')
        return -1
      return a.label.localeCompare(b.label, 'zh-CN')
    })
})

const normalizedModelPullFilterKeyword = computed(() => String(modelPullFilterKeyword.value || '').trim().toLowerCase())

function matchesModelPullFilter(item: Pick<ProviderPullItem, 'model' | 'label'>, keyword: string): boolean {
  if (!keyword)
    return true
  const searchText = `${item.model} ${item.label}`.toLowerCase()
  return searchText.includes(keyword)
}

const filteredModelPullSeriesGroups = computed<ModelPullSeriesGroup[]>(() => {
  const keyword = normalizedModelPullFilterKeyword.value
  if (!keyword)
    return modelPullSeriesGroups.value

  return modelPullSeriesGroups.value
    .map(group => ({
      ...group,
      items: group.items.filter(item => matchesModelPullFilter(item, keyword)),
    }))
    .filter(group => group.items.length > 0)
})

const filteredPulledModelCount = computed(() => filteredModelPullSeriesGroups.value.reduce((count, group) => count + group.items.length, 0))

const selectedPulledModelSet = computed(() => new Set(selectedPulledModels.value))

const selectedPulledModelCount = computed(() => selectedPulledModels.value.length)

const selectedPulledNewModelCount = computed(() => {
  const existingModels = currentModelPoolNameSet.value
  return pulledProviderModels.value.filter(item => selectedPulledModelSet.value.has(item.model) && !existingModels.has(item.model)).length
})

const selectedPulledExistingModelCount = computed(() => {
  return Math.max(0, selectedPulledModelCount.value - selectedPulledNewModelCount.value)
})

const allPulledModelsChecked = computed(() => {
  return pulledProviderModels.value.length > 0 && selectedPulledModelCount.value === pulledProviderModels.value.length
})

const allPulledModelsIndeterminate = computed(() => {
  return selectedPulledModelCount.value > 0 && selectedPulledModelCount.value < pulledProviderModels.value.length
})

const sceneRows = computed(() => {
  const definitionIndex = new Map(sceneDefinitions.value.map((item, index) => [item.key, index]))
  return [...sceneItems.value].sort((a, b) => {
    return Number(definitionIndex.get(a.key) ?? 999) - Number(definitionIndex.get(b.key) ?? 999)
  })
})

function resetSecretModes() {
  upstreamForm.apiKeyMode = 'keep'
  upstreamForm.apiKey = ''
  adminAiForm.tavilyApiKeyMode = 'keep'
  adminAiForm.tavilyApiKey = ''
}

function applyConsolePayload(payload: ProvidersPayload) {
  upstreamForm.provider = payload.upstream.provider || ''
  upstreamForm.baseURL = normalizeUpstreamBaseURL(payload.upstream.baseURL || '')
  upstreamForm.timeoutMs = Number(payload.upstream.timeoutMs || 15000)
  upstreamForm.maxRetries = Number(payload.upstream.maxRetries || 2)
  upstreamForm.visionModel = String(payload.upstream.visionModel || '').trim()
  configMasterKeyReady.value = payload.config?.masterKeyReady !== false
  upstreamApiKeyConfigured.value = Boolean(payload.upstream.apiKeyConfigured)

  adminAiForm.enabled = Boolean(payload.adminAi.enabled)
  adminAiForm.webTimeoutMs = Number(payload.adminAi.webTimeoutMs || 12000)
  adminAiForm.maxWebResults = Number(payload.adminAi.maxWebResults || 5)
  adminAiForm.maxPageChars = Number(payload.adminAi.maxPageChars || 10000)

  modelPoolFetchedAt.value = payload.modelPool.fetchedAt || ''
  modelPoolItems.value = (payload.modelPool.items || []).map(item => cloneModelItem(item))
  sceneDefinitions.value = payload.scenes.definitions || []
  sceneItems.value = (payload.scenes.items || []).map(item => ({
    ...item,
    models: dedupeModels(item.models || []),
    prompt: String(item.prompt || ''),
  }))
  resetSecretModes()
}

async function loadConsole() {
  consoleLoading.value = true
  consoleError.value = ''
  try {
    const data = await requestApi<ProvidersPayload>(endpoint('/admin/ai/providers'), {}, 'AI 配置加载失败。')
    applyConsolePayload(data)
    consoleLoaded.value = true
  }
  catch (error: any) {
    consoleError.value = normalizeError(error, 'AI 配置加载失败。')
  }
  finally {
    consoleLoading.value = false
  }
}

async function saveConsole() {
  saving.value = true
  consoleError.value = ''
  try {
    const normalizedBaseURL = normalizeUpstreamBaseURL(upstreamForm.baseURL)
    const payload = await requestApi<ProvidersPayload>(endpoint('/admin/ai/providers'), {
      method: 'PATCH',
      body: {
        upstream: {
          provider: upstreamForm.provider,
          baseURL: normalizedBaseURL,
          timeoutMs: Number(upstreamForm.timeoutMs || 15000),
          maxRetries: Number(upstreamForm.maxRetries || 2),
          visionModel: upstreamForm.visionModel,
          apiKeyMode: upstreamForm.apiKeyMode,
          apiKey: upstreamForm.apiKey,
        },
        modelPool: {
          fetchedAt: modelPoolFetchedAt.value,
          pullTriggered: modelPullTriggered.value,
          items: modelPoolItems.value.map(item => normalizeModelItem(item)),
        },
        scenes: {
          items: sceneItems.value.map(item => ({
            key: item.key,
            label: item.label,
            description: item.description,
            enabled: item.enabled,
            models: dedupeModels(item.models || []),
            prompt: item.prompt,
          })),
        },
        adminAi: {
          enabled: adminAiForm.enabled,
          webTimeoutMs: Number(adminAiForm.webTimeoutMs || 12000),
          maxWebResults: Number(adminAiForm.maxWebResults || 5),
          maxPageChars: Number(adminAiForm.maxPageChars || 10000),
          tavilyApiKeyMode: adminAiForm.tavilyApiKeyMode,
          tavilyApiKey: adminAiForm.tavilyApiKey,
        },
      },
    }, 'AI 配置保存失败。')
    applyConsolePayload(payload)
    modelPullTriggered.value = false
    modelPullMessage.value = ''
    const ignoredKeys = payload.warnings?.ignoredSecretReplaceKeys || []
    if (ignoredKeys.includes('upstream')) {
      const warning = '当前未配置 master key，本次上游 API Key 替换未持久化，服务端仍会继续使用旧密钥。'
      consoleError.value = warning
      Message.warning(warning)
      return
    }
    Message.success('AI 配置已保存。')
  }
  catch (error: any) {
    const message = normalizeError(error, 'AI 配置保存失败。')
    consoleError.value = message
    Message.error(message)
  }
  finally {
    saving.value = false
  }
}

function mergePulledModels(pulled: ProviderPullItem[]): ModelPoolItem[] {
  const currentMap = new Map(modelPoolItems.value.map(item => [item.model, cloneModelItem(item)]))
  const result: ModelPoolItem[] = []
  const defaultFormat: ModelFormat = upstreamForm.provider.toLowerCase().includes('response') ? 'response' : 'openai-compatible'

  for (const item of pulled) {
    const current = currentMap.get(item.model)
    const next = normalizeModelItem({
      model: item.model,
      label: current?.label || item.label || item.model,
      format: current?.format || defaultFormat,
      enabled: current?.enabled ?? true,
      providerInputPricePer1M: item.inputPricePer1M,
      providerOutputPricePer1M: item.outputPricePer1M,
      manualInputPricePer1M: current?.manualInputPricePer1M ?? null,
      manualOutputPricePer1M: current?.manualOutputPricePer1M ?? null,
      inputPricePer1M: current?.inputPricePer1M ?? item.inputPricePer1M,
      outputPricePer1M: current?.outputPricePer1M ?? item.outputPricePer1M,
      currency: current?.currency || item.currency || 'USD',
      pricingSource: current?.pricingSource || (item.pricingSource === 'pricing_table' ? 'provider' : item.pricingSource),
      manualPriceOverride: current?.manualPriceOverride ?? false,
    })
    result.push(next)
    currentMap.delete(item.model)
  }

  for (const item of currentMap.values())
    result.push(normalizeModelItem(item))

  return result.sort((a, b) => a.model.localeCompare(b.model, 'en'))
}

function setSelectedPulledModels(models: string[]) {
  selectedPulledModels.value = dedupeModels(models)
}

function openModelPullSelector(payload: ProviderModelsPayload) {
  pulledProviderModels.value = [...(payload.items || [])].sort((a, b) => a.model.localeCompare(b.model, 'en'))
  pulledProviderFetchedAt.value = payload.fetchedAt || ''
  modelPullFilterKeyword.value = ''
  setSelectedPulledModels(pulledProviderModels.value.map(item => item.model))
  expandedModelPullSeriesKeys.value = []
  modelPullSelectorVisible.value = true
}

function closeModelPullSelector() {
  modelPullFilterKeyword.value = ''
  modelPullSelectorVisible.value = false
}

function togglePulledModel(model: string, checked: boolean) {
  const next = new Set(selectedPulledModels.value)
  if (checked)
    next.add(model)
  else
    next.delete(model)
  setSelectedPulledModels(Array.from(next))
}

function hasSelectedAllModels(items: ProviderPullItem[]): boolean {
  return items.length > 0 && items.every(item => selectedPulledModelSet.value.has(item.model))
}

function hasPartialSelectedModels(items: ProviderPullItem[]): boolean {
  const selectedCount = items.filter(item => selectedPulledModelSet.value.has(item.model)).length
  return selectedCount > 0 && selectedCount < items.length
}

function togglePulledGroup(items: ProviderPullItem[], checked: boolean) {
  const next = new Set(selectedPulledModels.value)
  for (const item of items) {
    if (checked)
      next.add(item.model)
    else
      next.delete(item.model)
  }
  setSelectedPulledModels(Array.from(next))
}

function toggleAllPulledModels(checked: boolean) {
  setSelectedPulledModels(checked ? pulledProviderModels.value.map(item => item.model) : [])
}

function handleToggleAllPulledModels(checked: unknown) {
  toggleAllPulledModels(Boolean(checked))
}

function handleTogglePulledGroup(items: ProviderPullItem[], checked: unknown) {
  togglePulledGroup(items, Boolean(checked))
}

function handleTogglePulledModel(model: string, checked: unknown) {
  togglePulledModel(model, Boolean(checked))
}

function isModelPullSeriesExpanded(key: string): boolean {
  if (normalizedModelPullFilterKeyword.value)
    return true
  return expandedModelPullSeriesKeys.value.includes(key)
}

function toggleModelPullSeriesExpanded(key: string) {
  const next = new Set(expandedModelPullSeriesKeys.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  expandedModelPullSeriesKeys.value = Array.from(next)
}

function applyPulledModelSelection() {
  if (selectedPulledModelCount.value === 0) {
    Message.error('请至少选择一个模型后再导入。')
    return
  }

  const selectedSet = new Set(selectedPulledModels.value)
  const selectedItems = pulledProviderModels.value.filter(item => selectedSet.has(item.model))
  const existingModels = new Set(modelPoolItems.value.map(item => item.model))
  const newCount = selectedItems.filter(item => !existingModels.has(item.model)).length
  const skippedCount = Math.max(0, pulledProviderModels.value.length - selectedItems.length)

  modelPoolItems.value = mergePulledModels(selectedItems)
  modelPoolFetchedAt.value = pulledProviderFetchedAt.value || modelPoolFetchedAt.value
  modelPullTriggered.value = true
  modelPullSelectorVisible.value = false
  modelPullMessage.value = `已导入 ${selectedItems.length} 个模型${newCount > 0 ? `（新增 ${newCount} 个）` : ''}${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}，请确认后保存。`
  Message.success(modelPullMessage.value)
}

async function pullModels() {
  pullLoading.value = true
  modelPullMessage.value = ''
  try {
    const normalizedBaseURL = normalizeUpstreamBaseURL(upstreamForm.baseURL)
    const data = await requestApi<ProviderModelsPayload>(
      endpoint('/admin/ai/provider-models'),
      {
        method: 'POST',
        body: {
          provider: upstreamForm.provider,
          baseURL: normalizedBaseURL,
          apiKeyMode: upstreamForm.apiKeyMode,
          apiKey: upstreamForm.apiKey,
        },
      },
      '模型拉取失败。',
    )
    if ((data.items || []).length === 0) {
      modelPullMessage.value = '未拉取到可导入模型。'
      Message.warning(modelPullMessage.value)
      return
    }
    openModelPullSelector(data)
    modelPullMessage.value = `已拉取 ${data.items?.length || 0} 个候选模型，请在弹框中选择需要导入的系列或模型。`
  }
  catch (error: any) {
    const message = normalizeError(error, '模型拉取失败。')
    modelPullMessage.value = message
    Message.error(message)
  }
  finally {
    pullLoading.value = false
  }
}

async function testUpstream() {
  testingUpstream.value = true
  upstreamTestMessage.value = ''
  try {
    const testModel = modelPoolItems.value.find(item => item.enabled)?.model || ''
    const normalizedBaseURL = normalizeUpstreamBaseURL(upstreamForm.baseURL)
    const data = await requestApi<{
      provider: string
      model: string
      responsePreview: string
      latencyMs: number
    }>(endpoint('/admin/ai/providers/test'), {
      method: 'POST',
      body: {
        model: testModel,
        provider: upstreamForm.provider,
        baseURL: normalizedBaseURL,
        apiKeyMode: upstreamForm.apiKeyMode,
        apiKey: upstreamForm.apiKey,
      },
    }, '共享上游测试失败。')
    upstreamTestMessage.value = `${data.provider} / ${data.model} · ${data.responsePreview}`
    Message.success('共享上游连通性测试成功。')
  }
  catch (error: any) {
    const message = normalizeError(error, '共享上游测试失败。')
    upstreamTestMessage.value = message
    Message.error(message)
  }
  finally {
    testingUpstream.value = false
  }
}

function openCreateModelDrawer() {
  modelEditorIsCreate.value = true
  Object.assign(modelEditorForm, {
    model: '',
    label: '',
    format: upstreamForm.provider.toLowerCase().includes('response') ? 'response' : 'openai-compatible',
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
  } satisfies ModelPoolItem)
  modelEditorVisible.value = true
}

function openEditModelDrawer(record: ModelPoolItem) {
  modelEditorIsCreate.value = false
  Object.assign(modelEditorForm, cloneModelItem(record))
  modelEditorVisible.value = true
}

function closeModelDrawer() {
  modelEditorVisible.value = false
}

function saveModelDrawer() {
  const model = String(modelEditorForm.model || '').trim()
  if (!model) {
    Message.error('模型名不能为空。')
    return
  }

  const nextItem = normalizeModelItem({
    ...modelEditorForm,
    model,
    label: String(modelEditorForm.label || model).trim() || model,
  })
  const nextItems = [...modelPoolItems.value]
  const existingIndex = nextItems.findIndex(item => item.model === model)
  if (existingIndex >= 0)
    nextItems.splice(existingIndex, 1, nextItem)
  else
    nextItems.push(nextItem)
  modelPoolItems.value = nextItems.sort((a, b) => a.model.localeCompare(b.model, 'en'))
  modelEditorVisible.value = false
}

function removeModel(model: string) {
  const target = String(model || '').trim()
  modelPoolItems.value = modelPoolItems.value.filter(item => item.model !== target)
  sceneItems.value = sceneItems.value.map(item => ({
    ...item,
    models: item.models.filter(candidate => candidate !== target),
  }))
}

function clearModelPoolDraft() {
  modelPoolItems.value = []
  sceneItems.value = sceneItems.value.map(item => ({
    ...item,
    models: [],
  }))
  modelPullTriggered.value = true
  modelPullMessage.value = '已清空当前模型池，并同步清空场景模型回退链，请确认后保存。'
  Message.success(modelPullMessage.value)
}

function openSceneDrawer(record: SceneItem) {
  sceneEditorForm.key = record.key
  sceneEditorForm.label = record.label
  sceneEditorForm.description = record.description
  sceneEditorForm.enabled = Boolean(record.enabled)
  sceneEditorForm.models = dedupeModels(record.models || [])
  sceneEditorForm.prompt = String(record.prompt || '')
  sceneEditorVisible.value = true
}

function closeSceneDrawer() {
  sceneEditorVisible.value = false
}

function openSceneBatchDrawer() {
  const mostUsedModels = dedupeModels(sceneItems.value.flatMap(item => item.models || []))
  sceneBatchForm.models = mostUsedModels
  sceneBatchEditorVisible.value = true
}

function closeSceneBatchDrawer() {
  sceneBatchEditorVisible.value = false
}

function applySceneBatchModels() {
  const models = dedupeModels(sceneBatchForm.models || [])
  sceneItems.value = sceneItems.value.map(item => ({
    ...item,
    models,
  }))
  sceneBatchEditorVisible.value = false
  Message.success(`已为 ${sceneItems.value.length} 个场景应用统一模型回退链。`)
}

function saveSceneDrawer() {
  const index = sceneItems.value.findIndex(item => item.key === sceneEditorForm.key)
  if (index < 0)
    return

  const next = [...sceneItems.value]
  next.splice(index, 1, {
    key: sceneEditorForm.key,
    label: sceneEditorForm.label,
    description: sceneEditorForm.description,
    enabled: Boolean(sceneEditorForm.enabled),
    models: dedupeModels(sceneEditorForm.models || []),
    prompt: String(sceneEditorForm.prompt || ''),
  })
  sceneItems.value = next
  sceneEditorVisible.value = false
}

function applyCurrentSceneModelsToAll() {
  const models = dedupeModels(sceneEditorForm.models || [])
  sceneItems.value = sceneItems.value.map(item => ({
    ...item,
    models,
  }))
  Message.success(`已将「${sceneEditorForm.label}」的模型回退链复制到全部场景。`)
}

async function testScene(scene: SceneItem) {
  sceneTesting[scene.key] = true
  sceneTestMessage[scene.key] = ''
  try {
    const data = await requestApi<{
      channelKey: PlatformAiChannelKey
      channelLabel: string
      provider: string
      model: string
      fallbackUsed: boolean
      responsePreview: string
      attemptChain: Array<{ provider: string, model: string, success: boolean, error?: string }>
    }>(endpoint('/admin/ai/channels/test'), {
      method: 'POST',
      body: {
        channelKey: scene.key,
      },
    }, '场景测试失败。')

    const chainText = (data.attemptChain || [])
      .map(item => `${item.model}${item.success ? '' : '(failed)'}`)
      .join(' -> ')
    sceneTestMessage[scene.key] = `${data.provider} / ${data.model}${data.fallbackUsed ? ' · 已回退' : ''} · ${chainText || data.responsePreview}`
    Message.success(`场景「${scene.label}」测试成功。`)
  }
  catch (error: any) {
    const message = normalizeError(error, '场景测试失败。')
    sceneTestMessage[scene.key] = message
    Message.error(message)
  }
  finally {
    sceneTesting[scene.key] = false
  }
}

async function loadAudits() {
  auditLoading.value = true
  auditError.value = ''
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
      '审计日志加载失败。',
    )
    audits.value = data.items || []
    auditTotal.value = Number(data.total || 0)
  }
  catch (error: any) {
    audits.value = []
    auditTotal.value = 0
    auditError.value = normalizeError(error, '审计日志加载失败。')
  }
  finally {
    auditLoading.value = false
  }
}

async function loadLogs() {
  logLoading.value = true
  logError.value = ''
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
      '日志加载失败。',
    )
    logs.value = data.items || []
    logTotal.value = Number(data.total || 0)
  }
  catch (error: any) {
    logs.value = []
    logTotal.value = 0
    logError.value = normalizeError(error, '日志加载失败。')
  }
  finally {
    logLoading.value = false
  }
}

function openAuditDetail(record: AuditItem) {
  auditDetailRow.value = record
  auditDetailVisible.value = true
}

function openLogDetail(record: LogItem) {
  logDetailRow.value = record
  logDetailVisible.value = true
}

function onAuditPageChange(page: number) {
  auditPage.value = page
  void loadAudits()
}

function onLogPageChange(page: number) {
  logPage.value = page
  void loadLogs()
}

watch(activeTab, async (tab) => {
  if ((tab === 'channel_models' || tab === 'scenes') && !consoleLoaded.value && !consoleLoading.value)
    await loadConsole()
  if (tab === 'audits' && !auditLoading.value)
    await loadAudits()
  if (tab === 'logs' && !logLoading.value)
    await loadLogs()
})

onMounted(async () => {
  await loadConsole()
})
</script>

<template>
  <div class="space-y-4">
    <div class="text-white px-6 py-5 rounded-3xl shadow-lg from-slate-900 to-slate-900 via-slate-800 bg-gradient-to-r">
      <div class="flex flex-wrap gap-4 items-start justify-between">
        <div class="space-y-2">
          <div class="text-xs text-slate-300 tracking-[0.28em] uppercase">
            AI Console
          </div>
          <div class="text-2xl font-semibold">
            单上游 + 模型池 + 场景回退
          </div>
          <div class="text-sm text-slate-300 max-w-3xl">
            管理台现在只维护 1 套共享上游、1 个统一模型池，以及按顺序回退的场景路由。
          </div>
        </div>
      </div>
    </div>

    <a-tabs v-model:active-key="activeTab" type="rounded">
      <a-tab-pane v-for="tab in tabOptions" :key="tab.key" :title="tab.label" />
    </a-tabs>

    <div v-if="activeTab === 'channel_models'" class="space-y-4">
      <a-alert v-if="consoleError" type="error" :show-icon="true">
        {{ consoleError }}
      </a-alert>

      <a-spin :loading="consoleLoading || saving">
        <div class="gap-4 grid xl:grid-cols-[1.25fr_1fr]">
          <a-card :bordered="false" class="rounded-3xl shadow-sm">
            <template #title>
              <div class="flex gap-4 items-center justify-between">
                <div>
                  <div class="text-base font-semibold">
                    上游渠道配置
                  </div>
                  <div class="text-xs text-slate-500">
                    这里只保留共享上游连接信息，不再拆 LLM / DocAI。
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <a-button :loading="testingUpstream" @click="testUpstream">
                    测试上游
                  </a-button>
                  <a-button type="primary" :loading="saving" @click="saveConsole">
                    保存配置
                  </a-button>
                </div>
              </div>
            </template>

            <a-alert v-if="!configMasterKeyReady" type="warning" :show-icon="true" class="mb-4">
              当前未配置 master key。你可以先用当前表单里的 token 测试上游和拉取模型，但“保存配置”时不会持久化替换 API Key。
            </a-alert>

            <div class="gap-4 grid md:grid-cols-2 xl:grid-cols-3">
              <a-form-item label="Provider">
                <a-input v-model="upstreamForm.provider" placeholder="例如 newapi" />
              </a-form-item>
              <a-form-item label="Base URL">
                <a-input
                  v-model="upstreamForm.baseURL"
                  placeholder="https://your-newapi.example"
                  @blur="upstreamForm.baseURL = normalizeUpstreamBaseURL(upstreamForm.baseURL)"
                />
              </a-form-item>
              <a-form-item label="API Key 模式">
                <a-select v-model="upstreamForm.apiKeyMode">
                  <a-option value="keep">
                    保持不变
                  </a-option>
                  <a-option value="replace">
                    替换密钥
                  </a-option>
                  <a-option value="clear">
                    清空密钥
                  </a-option>
                </a-select>
              </a-form-item>

              <a-form-item label="API Key">
                <a-input-password
                  v-model="upstreamForm.apiKey"
                  placeholder="测试/拉取会优先使用当前输入；保存持久化需选择替换"
                  autocomplete="new-password"
                  allow-clear
                />
              </a-form-item>
              <a-form-item label="视觉模型">
                <a-input
                  v-model="upstreamForm.visionModel"
                  placeholder="可选，例如 gpt-4.1-mini / qwen-vl"
                  allow-clear
                />
              </a-form-item>
              <a-form-item label="超时(ms)">
                <a-input-number v-model="upstreamForm.timeoutMs" :min="1000" :step="1000" class="w-full" />
              </a-form-item>
              <a-form-item label="重试次数">
                <a-input-number v-model="upstreamForm.maxRetries" :min="0" :max="10" class="w-full" />
              </a-form-item>
            </div>

            <div class="text-sm text-slate-500 mt-4 flex flex-wrap gap-3 items-center">
              <span>模型池拉取时间：{{ formatTime(modelPoolFetchedAt) }}</span>
              <span>当前模型数：{{ modelPoolItems.length }}</span>
              <span>API Key：{{ upstreamApiKeyConfigured ? '已配置' : '未配置' }}</span>
              <span>默认密钥状态：{{ upstreamForm.apiKeyMode === 'keep' ? '沿用现有密钥' : upstreamForm.apiKeyMode === 'clear' ? '将清空密钥' : '将替换密钥' }}</span>
              <span>视觉模型：{{ upstreamForm.visionModel || '未配置（将回退到文件名/OCR/元信息摘要）' }}</span>
              <span>Base URL 将自动规范为根地址，调用时自动补 /v1</span>
              <span>当前输入框里的 API Key 会优先用于测试上游和拉取模型</span>
            </div>

            <div v-if="upstreamTestMessage" class="text-sm text-slate-600 mt-4 px-4 py-3 rounded-2xl bg-slate-50">
              {{ upstreamTestMessage }}
            </div>
          </a-card>

          <a-card :bordered="false" class="rounded-3xl shadow-sm">
            <template #title>
              <div>
                <div class="text-base font-semibold">
                  联网能力
                </div>
                <div class="text-xs text-slate-500">
                  管理助手的联网检索配置仍独立保留。
                </div>
              </div>
            </template>

            <div class="gap-4 grid">
              <a-form-item label="启用管理助手联网">
                <a-switch v-model="adminAiForm.enabled" />
              </a-form-item>
              <a-form-item label="Tavily Key 模式">
                <a-select v-model="adminAiForm.tavilyApiKeyMode">
                  <a-option value="keep">
                    保持不变
                  </a-option>
                  <a-option value="replace">
                    替换密钥
                  </a-option>
                  <a-option value="clear">
                    清空密钥
                  </a-option>
                </a-select>
              </a-form-item>
              <a-form-item label="Tavily Key">
                <a-input-password
                  v-model="adminAiForm.tavilyApiKey"
                  placeholder="仅在选择替换时填写"
                  autocomplete="new-password"
                  allow-clear
                />
              </a-form-item>
              <a-form-item label="网页超时(ms)">
                <a-input-number v-model="adminAiForm.webTimeoutMs" :min="1000" :step="1000" class="w-full" />
              </a-form-item>
              <a-form-item label="最多结果数">
                <a-input-number v-model="adminAiForm.maxWebResults" :min="1" :max="10" class="w-full" />
              </a-form-item>
              <a-form-item label="单页最大字符">
                <a-input-number v-model="adminAiForm.maxPageChars" :min="1000" :step="1000" class="w-full" />
              </a-form-item>
            </div>
          </a-card>
        </div>

        <a-card :bordered="false" class="rounded-3xl shadow-sm">
          <template #title>
            <div class="flex flex-wrap gap-4 items-center justify-between">
              <div>
                <div class="text-base font-semibold">
                  模型池
                </div>
                <div class="text-xs text-slate-500">
                  价格优先级固定为 手工覆盖 > NewAPI 导入 > none。
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <a-button @click="openCreateModelDrawer">
                  新增模型
                </a-button>
                <a-button :loading="pullLoading" @click="pullModels">
                  拉取模型
                </a-button>
                <a-popconfirm
                  content="确认清空当前模型池吗？这会移除全部模型，并同步清空场景里的模型回退链；只有保存后才会持久化。"
                  type="warning"
                  @ok="clearModelPoolDraft"
                >
                  <a-button status="danger" :disabled="modelPoolItems.length === 0">
                    清空模型池
                  </a-button>
                </a-popconfirm>
                <a-button type="primary" :loading="saving" @click="saveConsole">
                  保存模型池
                </a-button>
              </div>
            </div>
          </template>

          <a-alert v-if="modelPullMessage" type="info" :show-icon="true" class="mb-4">
            {{ modelPullMessage }}
          </a-alert>

          <a-table :data="modelPoolRows" :pagination="false" row-key="model">
            <template #columns>
              <a-table-column title="模型" data-index="model">
                <template #cell="scope">
                  <div class="space-y-1">
                    <div class="text-slate-900 font-medium">
                      {{ scope.record.model }}
                    </div>
                    <div class="text-xs text-slate-500">
                      {{ scope.record.label }}
                    </div>
                  </div>
                </template>
              </a-table-column>
              <a-table-column title="格式" data-index="format" :width="150">
                <template #cell="scope">
                  <a-tag>{{ scope.record.format }}</a-tag>
                </template>
              </a-table-column>
              <a-table-column title="启用" data-index="enabled" :width="100">
                <template #cell="scope">
                  <a-tag :color="scope.record.enabled ? 'green' : 'gray'">
                    {{ scope.record.enabled ? 'on' : 'off' }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="导入价格" data-index="providerInputPricePer1M" :width="260">
                <template #cell="scope">
                  {{ buildImportedPriceText(scope.record) }}
                </template>
              </a-table-column>
              <a-table-column title="生效价格" data-index="inputPricePer1M" :width="260">
                <template #cell="scope">
                  {{ buildPriceText(scope.record) }}
                </template>
              </a-table-column>
              <a-table-column title="来源" data-index="pricingSource" :width="120">
                <template #cell="scope">
                  <a-tag :color="scope.record.pricingSource === 'manual' ? 'orange' : scope.record.pricingSource === 'provider' ? 'arcoblue' : 'gray'">
                    {{ scope.record.pricingSource }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="操作" data-index="modelActions" :width="180">
                <template #cell="scope">
                  <div class="flex gap-2">
                    <a-button size="mini" @click="openEditModelDrawer(scope.record)">
                      编辑
                    </a-button>
                    <a-button size="mini" status="danger" @click="removeModel(scope.record.model)">
                      删除
                    </a-button>
                  </div>
                </template>
              </a-table-column>
            </template>
          </a-table>
        </a-card>
      </a-spin>
    </div>

    <div v-else-if="activeTab === 'scenes'" class="space-y-4">
      <a-alert v-if="consoleError" type="error" :show-icon="true">
        {{ consoleError }}
      </a-alert>

      <a-card :bordered="false" class="rounded-3xl shadow-sm">
        <template #title>
          <div class="flex flex-wrap gap-4 items-center justify-between">
            <div>
              <div class="text-base font-semibold">
                场景路由
              </div>
              <div class="text-xs text-slate-500">
                每个场景可配置多个模型，运行时按顺序回退，不做随机、不做负载均衡。
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <a-button @click="openSceneBatchDrawer">
                一键设置全部场景模型
              </a-button>
              <a-button type="primary" :loading="saving" @click="saveConsole">
                保存场景
              </a-button>
            </div>
          </div>
        </template>

        <a-table :data="sceneRows" :pagination="false" row-key="key">
          <template #columns>
            <a-table-column title="场景" data-index="label" :width="220">
              <template #cell="scope">
                <div class="space-y-1">
                  <div class="text-slate-900 font-medium">
                    {{ scope.record.label }}
                  </div>
                  <div class="text-xs text-slate-500">
                    {{ scope.record.description }}
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="模型回退链" data-index="models">
              <template #cell="scope">
                <div class="space-y-2">
                  <div class="text-sm text-slate-700">
                    {{ sceneModelsPreview(scope.record) }}
                  </div>
                  <div v-if="sceneTestMessage[scope.record.key]" class="text-xs text-slate-500">
                    {{ sceneTestMessage[scope.record.key] }}
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="提示词" data-index="prompt">
              <template #cell="scope">
                {{ promptPreview(scope.record.prompt) }}
              </template>
            </a-table-column>
            <a-table-column title="状态" data-index="enabled" :width="100">
              <template #cell="scope">
                <a-tag :color="scope.record.enabled ? 'green' : 'gray'">
                  {{ scope.record.enabled ? 'enabled' : 'disabled' }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column title="操作" data-index="sceneActions" :width="220">
              <template #cell="scope">
                <div class="flex gap-2">
                  <a-button size="mini" @click="openSceneDrawer(scope.record)">
                    编辑
                  </a-button>
                  <a-button size="mini" :loading="sceneTesting[scope.record.key]" @click="testScene(scope.record)">
                    测试
                  </a-button>
                </div>
              </template>
            </a-table-column>
          </template>
        </a-table>
      </a-card>
    </div>

    <div v-else-if="activeTab === 'audits'" class="space-y-4">
      <a-alert v-if="auditError" type="error" :show-icon="true">
        {{ auditError }}
      </a-alert>

      <a-card :bordered="false" class="rounded-3xl shadow-sm">
        <template #title>
          <div class="flex flex-wrap gap-4 items-center justify-between">
            <div class="text-base font-semibold">
              审计日志
            </div>
            <div class="flex flex-wrap gap-2">
              <a-input v-model="auditAction" placeholder="按 action 过滤" allow-clear class="w-60" />
              <a-button @click="loadAudits">
                刷新
              </a-button>
            </div>
          </div>
        </template>

        <a-table :data="audits" :loading="auditLoading" :pagination="false" row-key="id">
          <template #columns>
            <a-table-column title="时间" data-index="createdAt" :width="180">
              <template #cell="scope">
                {{ formatTime(scope.record.createdAt) }}
              </template>
            </a-table-column>
            <a-table-column title="Action" data-index="action" :width="260" />
            <a-table-column title="操作者" data-index="actorName" :width="150">
              <template #cell="scope">
                {{ scope.record.actorName || scope.record.actorUserId || '-' }}
              </template>
            </a-table-column>
            <a-table-column title="赛事" data-index="contestName" :width="180">
              <template #cell="scope">
                {{ scope.record.contestName || '-' }}
              </template>
            </a-table-column>
            <a-table-column title="Payload" data-index="payload">
              <template #cell="scope">
                <div class="text-sm text-slate-600 truncate">
                  {{ toPrettyJson(scope.record.payload).slice(0, 160) }}
                </div>
              </template>
            </a-table-column>
            <a-table-column title="操作" data-index="auditActions" :width="90">
              <template #cell="scope">
                <a-button size="mini" @click="openAuditDetail(scope.record)">
                  详情
                </a-button>
              </template>
            </a-table-column>
          </template>
        </a-table>

        <div class="mt-4 flex justify-end">
          <a-pagination
            :current="auditPage"
            :page-size="auditPageSize"
            :total="auditTotal"
            @change="onAuditPageChange"
          />
        </div>
      </a-card>
    </div>

    <div v-else class="space-y-4">
      <a-alert v-if="logError" type="error" :show-icon="true">
        {{ logError }}
      </a-alert>

      <a-card :bordered="false" class="rounded-3xl shadow-sm">
        <template #title>
          <div class="flex flex-wrap gap-4 items-center justify-between">
            <div class="text-base font-semibold">
              调用日志
            </div>
            <a-button @click="loadLogs">
              刷新
            </a-button>
          </div>
        </template>

        <div class="mb-4 gap-3 grid md:grid-cols-3 xl:grid-cols-6">
          <a-input-number v-model="logFilters.days" :min="1" :max="30" class="w-full" placeholder="天数" />
          <a-input v-model="logFilters.provider" placeholder="Provider" allow-clear />
          <a-input v-model="logFilters.model" placeholder="Model" allow-clear />
          <a-input v-model="logFilters.role" placeholder="Role" allow-clear />
          <a-input v-model="logFilters.workspaceId" placeholder="Workspace ID" allow-clear />
          <a-input v-model="logFilters.sessionId" placeholder="Session ID" allow-clear />
        </div>

        <div class="mb-4 flex flex-wrap gap-2">
          <a-input v-model="logFilters.q" placeholder="按内容搜索" allow-clear class="flex-1 min-w-[240px]" />
          <a-button type="primary" @click="loadLogs">
            查询
          </a-button>
        </div>

        <a-table :data="logs" :loading="logLoading" :pagination="false" row-key="id">
          <template #columns>
            <a-table-column title="时间" data-index="createdAt" :width="180">
              <template #cell="scope">
                {{ formatTime(scope.record.createdAt) }}
              </template>
            </a-table-column>
            <a-table-column title="Workspace / Session" data-index="workspaceName" :width="260">
              <template #cell="scope">
                <div class="space-y-1">
                  <div class="text-slate-900 font-medium">
                    {{ scope.record.workspaceName || scope.record.workspaceId || '-' }}
                  </div>
                  <div class="text-xs text-slate-500">
                    {{ scope.record.sessionTitle || scope.record.sessionId || '-' }}
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="角色" data-index="role" :width="100">
              <template #cell="scope">
                {{ scope.record.role }}
              </template>
            </a-table-column>
            <a-table-column title="Provider / Model" data-index="provider" :width="220">
              <template #cell="scope">
                <div class="space-y-1">
                  <div>{{ scope.record.provider || '-' }}</div>
                  <div class="text-xs text-slate-500">
                    {{ scope.record.model || '-' }}<span v-if="scope.record.fallbackUsed"> · fallback</span>
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="耗时" data-index="latencyMs" :width="110">
              <template #cell="scope">
                {{ formatLatency(scope.record.latencyMs) }}
              </template>
            </a-table-column>
            <a-table-column title="消息" data-index="contentPreview">
              <template #cell="scope">
                <div class="text-sm text-slate-600 truncate">
                  {{ scope.record.contentPreview || scope.record.content || '-' }}
                </div>
              </template>
            </a-table-column>
            <a-table-column title="操作" data-index="logActions" :width="90">
              <template #cell="scope">
                <a-button size="mini" @click="openLogDetail(scope.record)">
                  详情
                </a-button>
              </template>
            </a-table-column>
          </template>
        </a-table>

        <div class="mt-4 flex justify-end">
          <a-pagination
            :current="logPage"
            :page-size="logPageSize"
            :total="logTotal"
            @change="onLogPageChange"
          />
        </div>
      </a-card>
    </div>

    <a-modal
      v-model:visible="modelPullSelectorVisible"
      title="选择导入模型"
      width="960px"
      unmount-on-close
      @cancel="closeModelPullSelector"
    >
      <div class="pr-2 max-h-[70vh] overflow-y-auto">
        <div class="space-y-4">
          <a-alert type="info" :show-icon="true">
            拉取结果会先按系列分组展示。你可以全选、按系列勾选，或继续精确到单个模型后再导入。
          </a-alert>

          <a-input
            v-model="modelPullFilterKeyword"
            allow-clear
            placeholder="按模型名或展示名筛选"
          />

          <div class="px-4 py-3 rounded-2xl bg-slate-50 flex flex-wrap gap-3 items-center justify-between">
            <div class="text-sm text-slate-600 flex flex-wrap gap-3 items-center">
              <span>拉取时间：{{ formatTime(pulledProviderFetchedAt) }}</span>
              <span>候选模型：{{ pulledProviderModels.length }}</span>
              <span v-if="modelPullFilterKeyword">筛选结果：{{ filteredPulledModelCount }}</span>
              <span>已选：{{ selectedPulledModelCount }}</span>
              <span>新增：{{ selectedPulledNewModelCount }}</span>
              <span>已存在：{{ selectedPulledExistingModelCount }}</span>
            </div>
            <div class="flex flex-wrap gap-3 items-center">
              <a-checkbox
                :model-value="allPulledModelsChecked"
                :indeterminate="allPulledModelsIndeterminate"
                @change="handleToggleAllPulledModels"
              >
                全选
              </a-checkbox>
              <a-button size="mini" @click="toggleAllPulledModels(false)">
                清空
              </a-button>
            </div>
          </div>

          <div
            v-for="group in filteredModelPullSeriesGroups"
            :key="group.key"
            class="px-4 py-4 border border-slate-200 rounded-2xl bg-white"
          >
            <div class="flex flex-wrap gap-3 items-center justify-between">
              <div class="flex flex-wrap gap-3 items-center">
                <a-checkbox
                  :model-value="hasSelectedAllModels(group.items)"
                  :indeterminate="hasPartialSelectedModels(group.items)"
                  @change="handleTogglePulledGroup(group.items, $event)"
                >
                  {{ group.label }}
                </a-checkbox>
                <a-tag color="arcoblue">
                  {{ group.items.length }} 个
                </a-tag>
              </div>
              <div class="flex flex-wrap gap-3 items-center">
                <div class="text-xs text-slate-500">
                  {{ group.items.filter(item => selectedPulledModelSet.has(item.model)).length }} / {{ group.items.length }} 已选
                </div>
                <a-button
                  v-if="!normalizedModelPullFilterKeyword"
                  size="mini"
                  type="text"
                  @click="toggleModelPullSeriesExpanded(group.key)"
                >
                  {{ isModelPullSeriesExpanded(group.key) ? '收起' : '展开' }}
                </a-button>
              </div>
            </div>

            <div v-if="!isModelPullSeriesExpanded(group.key)" class="text-xs text-slate-500 mt-3">
              点击展开查看该系列下的 {{ group.items.length }} 个模型。
            </div>

            <div v-else class="mt-3 gap-3 grid md:grid-cols-2">
              <div
                v-for="item in group.items"
                :key="item.model"
                class="px-3 py-3 border border-slate-200 rounded-xl flex gap-3 items-start"
              >
                <a-checkbox
                  :model-value="selectedPulledModelSet.has(item.model)"
                  @change="handleTogglePulledModel(item.model, $event)"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap gap-2 items-center">
                    <div class="text-sm text-slate-900 font-medium break-all">
                      {{ item.model }}
                    </div>
                    <a-tag :color="currentModelPoolNameSet.has(item.model) ? 'gold' : 'green'">
                      {{ currentModelPoolNameSet.has(item.model) ? '已在模型池' : '新模型' }}
                    </a-tag>
                  </div>
                  <div class="text-xs text-slate-500 mt-1 break-all">
                    {{ item.label || item.model }}
                  </div>
                  <div class="text-xs text-slate-500 mt-2 flex flex-wrap gap-3 items-center">
                    <span>{{ item.pricingText }}</span>
                    <span>来源：{{ formatPullPricingSource(item.pricingSource) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <a-empty
            v-if="filteredModelPullSeriesGroups.length === 0"
            description="没有匹配的模型"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex flex-wrap gap-3 items-center justify-between">
          <div class="text-xs text-slate-500">
            已选择 {{ selectedPulledModelCount }} / {{ pulledProviderModels.length }} 个模型，确认后仅导入勾选项。
          </div>
          <div class="flex gap-2">
            <a-button @click="closeModelPullSelector">
              取消
            </a-button>
            <a-button type="primary" :disabled="selectedPulledModelCount === 0" @click="applyPulledModelSelection">
              导入选中模型
            </a-button>
          </div>
        </div>
      </template>
    </a-modal>

    <a-drawer
      v-model:visible="modelEditorVisible"
      :title="modelEditorIsCreate ? '新增模型' : '编辑模型'"
      :width="560"
      unmount-on-close
    >
      <div class="pr-2 max-h-[calc(100vh-132px)] overflow-y-auto">
        <div class="gap-4 grid">
          <a-form-item label="模型名">
            <a-input v-model="modelEditorForm.model" placeholder="例如 gpt-4.1-mini" />
          </a-form-item>
          <a-form-item label="展示名称">
            <a-input v-model="modelEditorForm.label" placeholder="用于后台展示" />
          </a-form-item>
          <a-form-item label="格式">
            <a-select v-model="modelEditorForm.format">
              <a-option value="openai-compatible">
                openai-compatible
              </a-option>
              <a-option value="response">
                response
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="启用">
            <a-switch v-model="modelEditorForm.enabled" />
          </a-form-item>
          <a-form-item label="货币">
            <a-input v-model="modelEditorForm.currency" placeholder="USD" />
          </a-form-item>

          <div class="text-sm text-slate-600 px-4 py-3 rounded-2xl bg-slate-50">
            <div class="text-slate-900 font-medium">
              导入价格
            </div>
            <div class="mt-2">
              {{ buildImportedPriceText(modelEditorForm) }}
            </div>
          </div>

          <a-form-item label="启用手工价格覆盖">
            <a-switch v-model="modelEditorForm.manualPriceOverride" />
          </a-form-item>
          <a-form-item label="手工输入价格 / 1M">
            <a-input-number v-model="modelEditorForm.manualInputPricePer1M" :min="0" :precision="6" class="w-full" />
          </a-form-item>
          <a-form-item label="手工输出价格 / 1M">
            <a-input-number v-model="modelEditorForm.manualOutputPricePer1M" :min="0" :precision="6" class="w-full" />
          </a-form-item>

          <div class="text-sm text-slate-600 px-4 py-3 rounded-2xl bg-slate-50">
            <div class="text-slate-900 font-medium">
              生效价格
            </div>
            <div class="mt-2">
              {{ buildPriceText(normalizeModelItem(modelEditorForm)) }}
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <a-button @click="closeModelDrawer">
            取消
          </a-button>
          <a-button type="primary" @click="saveModelDrawer">
            保存模型
          </a-button>
        </div>
      </template>
    </a-drawer>

    <a-drawer
      v-model:visible="sceneEditorVisible"
      :title="`编辑场景 · ${sceneEditorForm.label}`"
      :width="620"
      unmount-on-close
    >
      <div class="pr-2 max-h-[calc(100vh-132px)] overflow-y-auto">
        <div class="gap-4 grid">
          <a-alert type="info" :show-icon="true">
            {{ sceneEditorForm.description }}
          </a-alert>
          <a-form-item label="启用场景">
            <a-switch v-model="sceneEditorForm.enabled" />
          </a-form-item>
          <a-form-item label="模型回退链">
            <a-select
              v-model="sceneEditorForm.models"
              multiple
              allow-search
              allow-clear
              allow-create
              placeholder="搜索或添加模型，按添加顺序回退。留空则忽略并回退默认模型。"
              @change="sceneEditorForm.models = normalizeSceneModels($event)"
            >
              <a-option
                v-for="item in enabledModelSelectItems"
                :key="item.model"
                :value="item.model"
              >
                <div class="space-y-0.5">
                  <div class="flex gap-3 items-center justify-between">
                    <span>{{ item.model }}</span>
                    <span v-if="item.label && item.label !== item.model" class="text-xs text-slate-400">
                      {{ item.label }}
                    </span>
                  </div>
                  <div class="text-xs text-slate-400">
                    {{ item.priceText }}
                  </div>
                </div>
              </a-option>
            </a-select>
          </a-form-item>

          <div class="text-xs text-slate-500 px-4 py-3 rounded-2xl bg-slate-50">
            当前回退顺序：{{ sceneEditorForm.models.length > 0 ? sceneEditorForm.models.join(' -> ') : '未配置，运行时将忽略并回退默认模型' }}
          </div>

          <div class="text-xs text-slate-500">
            顺序按添加先后决定；如需调整顺序，请删除后按新的顺序重新添加。
          </div>

          <a-form-item label="场景提示词">
            <a-textarea
              v-model="sceneEditorForm.prompt"
              :auto-size="{ minRows: 8, maxRows: 16 }"
              placeholder="留空表示不追加场景提示词。"
            />
          </a-form-item>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <a-button @click="applyCurrentSceneModelsToAll">
            复制模型链到全部场景
          </a-button>
          <a-button @click="closeSceneDrawer">
            取消
          </a-button>
          <a-button type="primary" @click="saveSceneDrawer">
            保存场景
          </a-button>
        </div>
      </template>
    </a-drawer>

    <a-drawer
      v-model:visible="sceneBatchEditorVisible"
      title="一键设置全部场景模型"
      :width="620"
      unmount-on-close
    >
      <div class="pr-2 max-h-[calc(100vh-132px)] overflow-y-auto">
        <div class="gap-4 grid">
          <a-alert type="info" :show-icon="true">
            这里填写的模型回退链会覆盖全部场景的模型配置，不会改动提示词和启停状态。
          </a-alert>
          <a-form-item label="统一模型回退链">
            <a-select
              v-model="sceneBatchForm.models"
              multiple
              allow-search
              allow-clear
              allow-create
              placeholder="搜索或添加模型，按添加顺序回退。"
              @change="sceneBatchForm.models = normalizeSceneModels($event)"
            >
              <a-option
                v-for="item in enabledModelSelectItems"
                :key="`batch-${item.model}`"
                :value="item.model"
              >
                <div class="space-y-0.5">
                  <div class="flex gap-3 items-center justify-between">
                    <span>{{ item.model }}</span>
                    <span v-if="item.label && item.label !== item.model" class="text-xs text-slate-400">
                      {{ item.label }}
                    </span>
                  </div>
                  <div class="text-xs text-slate-400">
                    {{ item.priceText }}
                  </div>
                </div>
              </a-option>
            </a-select>
          </a-form-item>

          <div class="text-xs text-slate-500 px-4 py-3 rounded-2xl bg-slate-50">
            当前统一回退顺序：{{ sceneBatchForm.models.length > 0 ? sceneBatchForm.models.join(' -> ') : '未配置，运行时将忽略并回退默认模型' }}
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <a-button @click="closeSceneBatchDrawer">
            取消
          </a-button>
          <a-button type="primary" @click="applySceneBatchModels">
            应用到全部场景
          </a-button>
        </div>
      </template>
    </a-drawer>

    <a-drawer
      v-model:visible="auditDetailVisible"
      title="审计详情"
      :width="720"
      unmount-on-close
    >
      <div class="pr-2 max-h-[calc(100vh-132px)] overflow-y-auto">
        <template v-if="auditDetailRow">
          <div class="text-sm space-y-3">
            <div><span class="font-medium">时间：</span>{{ formatTime(auditDetailRow.createdAt) }}</div>
            <div><span class="font-medium">Action：</span>{{ auditDetailRow.action }}</div>
            <div><span class="font-medium">操作者：</span>{{ auditDetailRow.actorName || auditDetailRow.actorUserId || '-' }}</div>
            <div><span class="font-medium">赛事：</span>{{ auditDetailRow.contestName || '-' }}</div>
            <a-typography-paragraph>
              <pre class="text-xs text-slate-100 p-4 rounded-2xl bg-slate-950 overflow-x-auto">{{ toPrettyJson(auditDetailRow.payload) }}</pre>
            </a-typography-paragraph>
          </div>
        </template>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="logDetailVisible"
      title="日志详情"
      :width="760"
      unmount-on-close
    >
      <div class="pr-2 max-h-[calc(100vh-132px)] overflow-y-auto">
        <template v-if="logDetailRow">
          <div class="text-sm space-y-3">
            <div><span class="font-medium">时间：</span>{{ formatTime(logDetailRow.createdAt) }}</div>
            <div><span class="font-medium">Workspace：</span>{{ logDetailRow.workspaceName || logDetailRow.workspaceId || '-' }}</div>
            <div><span class="font-medium">Session：</span>{{ logDetailRow.sessionTitle || logDetailRow.sessionId || '-' }}</div>
            <div><span class="font-medium">Provider / Model：</span>{{ logDetailRow.provider || '-' }} / {{ logDetailRow.model || '-' }}</div>
            <div><span class="font-medium">Channel：</span>{{ logDetailRow.channelKey || '-' }}</div>
            <div><span class="font-medium">角色：</span>{{ logDetailRow.role }}</div>
            <div><span class="font-medium">Fallback：</span>{{ logDetailRow.fallbackUsed ? '是' : '否' }}</div>
            <div><span class="font-medium">耗时：</span>{{ formatLatency(logDetailRow.latencyMs) }}</div>
            <div v-if="logDetailRow.attemptChain.length > 0">
              <span class="font-medium">尝试链：</span>
              <div class="mt-2 space-y-2">
                <div
                  v-for="(attempt, index) in logDetailRow.attemptChain"
                  :key="`${logDetailRow.id}-${index}`"
                  class="text-xs text-slate-700 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                >
                  {{ index + 1 }}. {{ attempt.provider || '-' }} / {{ attempt.model || '-' }} · {{ attempt.success ? 'success' : 'failed' }} · {{ formatLatency(attempt.latencyMs) }}<span v-if="attempt.error"> · {{ attempt.error }}</span>
                </div>
              </div>
            </div>
            <a-typography-paragraph>
              <pre class="text-xs text-slate-100 p-4 rounded-2xl bg-slate-950 whitespace-pre-wrap overflow-x-auto">{{ logDetailRow.content || logDetailRow.contentPreview }}</pre>
            </a-typography-paragraph>
          </div>
        </template>
      </div>
    </a-drawer>
  </div>
</template>
