<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type AiConsoleTab = 'providers' | 'channels' | 'models' | 'audits' | 'logs'
type SecretMode = 'keep' | 'replace' | 'clear'
type ProviderEditorKey = 'llm' | 'docAi'
type ChannelEditorKey = 'adminAi'

interface ProvidersPayload {
  llm: {
    provider: string
    baseURL: string
    model: string
    modelCatalogJson: string
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
  provider: string
  model: string
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
const apiBase = runtime.public.apiBaseUrl || '/api'

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
const modelDetailVisible = ref(false)
const modelDetailRow = ref<ModelsPayload['items'][number] | null>(null)
const auditDetailVisible = ref(false)
const auditDetailRow = ref<AuditItem | null>(null)
const logDetailVisible = ref(false)
const logDetailRow = ref<LogItem | null>(null)

const providerForm = reactive({
  aiProvider: '',
  aiBaseURL: '',
  aiModel: '',
  aiModelCatalogJson: '',
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

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const providerColumns = [
  { title: 'Provider', dataIndex: 'name' },
  { title: '配置', dataIndex: 'config', slotName: 'config' },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 170 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 110 },
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

const modelColumns = [
  { title: 'Provider', dataIndex: 'provider', width: 140 },
  { title: 'Model', dataIndex: 'model' },
  { title: '消息量', dataIndex: 'messages', width: 110 },
  { title: 'Fallback', dataIndex: 'fallbackMessages', width: 110 },
  { title: 'Fallback率', dataIndex: 'fallbackRate', slotName: 'fallbackRate', width: 110 },
  { title: '最近调用', dataIndex: 'lastAt', slotName: 'lastAt', width: 180 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 90 },
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

const providerRows = computed<ProviderConfigRow[]>(() => {
  if (!providers.value)
    return []
  return [
    {
      key: 'llm',
      name: 'LLM Provider',
      provider: providers.value.llm.provider || '-',
      model: providers.value.llm.model || '-',
      baseURL: providers.value.llm.baseURL || '-',
      timeoutMs: Number(providers.value.llm.timeoutMs || 0),
      maxRetries: Number(providers.value.llm.maxRetries || 0),
      keyConfigured: Boolean(providers.value.llm.apiKeyConfigured),
    },
    {
      key: 'docAi',
      name: 'DocAI Provider',
      provider: providers.value.docAi.provider || '-',
      model: providers.value.docAi.model || '-',
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
const providerEditorTitle = computed(() => providerEditorKey.value === 'llm' ? '编辑 LLM Provider' : '编辑 DocAI Provider')

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
  return String(error?.data?.message || fallback)
}

function validateModelCatalogJson(raw: string): string | null {
  const text = String(raw || '').trim()
  if (!text)
    return null

  try {
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null)
      return '模型目录必须是 JSON 对象或数组。'
    return null
  }
  catch {
    return '模型目录 JSON 格式不合法，请检查后再保存。'
  }
}

function applyProvidersToForm(payload: ProvidersPayload | null) {
  if (!payload)
    return
  providerForm.aiProvider = payload.llm.provider || ''
  providerForm.aiBaseURL = payload.llm.baseURL || ''
  providerForm.aiModel = payload.llm.model || ''
  providerForm.aiModelCatalogJson = payload.llm.modelCatalogJson || ''
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
    const response = await $fetch<ApiResponse<ProvidersPayload>>(endpoint('/admin/ai/providers'), {
      method: 'PATCH',
      body,
    })
    providers.value = response.data
    applyProvidersToForm(response.data)
    providerSaveMessage.value = options.message
    loaded.providers = true
    loaded.channels = true
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
}

function closeProviderEditor() {
  if (providerSaving.value)
    return
  providerEditorVisible.value = false
}

async function saveProviderEditor() {
  if (providerEditorKey.value === 'llm') {
    const modelCatalogError = validateModelCatalogJson(providerForm.aiModelCatalogJson)
    if (modelCatalogError) {
      errorMap.providers = modelCatalogError
      return
    }
    await patchProviders({
      ai: {
        provider: providerForm.aiProvider.trim(),
        baseURL: providerForm.aiBaseURL.trim(),
        model: providerForm.aiModel.trim(),
        modelCatalogJson: providerForm.aiModelCatalogJson,
        temperature: Number(providerForm.aiTemperature ?? 0.2),
        topP: Number(providerForm.aiTopP ?? 1),
        maxTokens: Number(providerForm.aiMaxTokens ?? 0),
        presencePenalty: Number(providerForm.aiPresencePenalty ?? 0),
        frequencyPenalty: Number(providerForm.aiFrequencyPenalty ?? 0),
        timeoutMs: Number(providerForm.aiTimeoutMs || 15000),
        maxRetries: Number(providerForm.aiMaxRetries || 2),
        apiKeyMode: providerForm.aiApiKeyMode,
        apiKey: providerForm.aiApiKey,
      },
    }, {
      message: 'LLM Provider 配置已保存并生效。',
      errorFallback: 'LLM Provider 保存失败。',
      errorScope: 'providers',
    })
  }
  else {
    await patchProviders({
      docAi: {
        provider: providerForm.docAiProvider.trim(),
        baseURL: providerForm.docAiBaseURL.trim(),
        model: providerForm.docAiModel.trim(),
        timeoutMs: Number(providerForm.docAiTimeoutMs || 15000),
        maxRetries: Number(providerForm.docAiMaxRetries || 2),
        apiKeyMode: providerForm.docAiApiKeyMode,
        apiKey: providerForm.docAiApiKey,
      },
    }, {
      message: 'DocAI Provider 配置已保存并生效。',
      errorFallback: 'DocAI Provider 保存失败。',
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
    const response = await $fetch<ApiResponse<ProvidersPayload>>(endpoint('/admin/ai/providers'))
    providers.value = response.data
    applyProvidersToForm(response.data)
    loaded.providers = true
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

    const response = await $fetch<ApiResponse<ChannelsPayload>>(endpoint('/admin/ai/channels'), {
      query: {
        days: channelDays.value,
      },
    })
    channels.value = response.data
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
    const response = await $fetch<ApiResponse<ModelsPayload>>(endpoint('/admin/ai/models'), {
      query: {
        days: modelDays.value,
      },
    })
    models.value = response.data
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
    const response = await $fetch<ApiResponse<AuditsPayload>>(endpoint('/admin/ai/audits'), {
      query: {
        page: auditPage.value,
        pageSize: auditPageSize.value,
        action: auditAction.value.trim(),
      },
    })
    audits.value = response.data.items || []
    auditTotal.value = Number(response.data.total || 0)
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
    const response = await $fetch<ApiResponse<LogsPayload>>(endpoint('/admin/ai/logs'), {
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
    })
    logs.value = response.data.items || []
    logTotal.value = Number(response.data.total || 0)
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
  <div class="space-y-3 text-[11px]">
    <section class="border border-slate-200 bg-white p-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h1 class="text-[13px] font-bold text-slate-900">
            AI 平台配置
          </h1>
          <p class="mt-1 text-[11px] text-slate-500">
            平台级配置面板：providers / channels / models / audits / logs。赛事级提示词请到赛事工作区内维护。
          </p>
        </div>
        <a-button size="small" type="outline" :loading="activeLoading" @click="refreshCurrentTab">
          刷新当前分栏
        </a-button>
      </div>
    </section>

    <section class="border border-slate-200 bg-white p-2">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="tab in tabOptions"
          :key="tab.key"
          class="rounded border px-3 py-1 text-[11px] font-semibold transition-colors"
          :class="activeTab === tab.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </section>

    <section v-if="activeLoading" class="border border-slate-200 bg-white p-3">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="activeError" class="border border-rose-200 bg-rose-50 p-3 text-rose-600">
      {{ activeError }}
    </section>

    <section v-else-if="activeTab === 'providers'" class="space-y-3">
      <section class="border border-slate-200 bg-white p-3">
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
        <p v-if="providerSaveMessage" class="mt-2 text-[11px] text-emerald-600">
          {{ providerSaveMessage }}
        </p>
      </section>

      <section class="border border-slate-200 bg-white p-3">
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
              <p class="m-0 truncate text-[11px] text-slate-900">
                provider={{ record.provider }} / model={{ record.model }}
              </p>
              <p class="m-0 mt-1 truncate font-mono text-[10px] text-slate-500">
                baseURL={{ record.baseURL }}
              </p>
              <p class="m-0 mt-1 text-[10px] text-slate-500">
                timeout={{ record.timeoutMs }}ms · retries={{ record.maxRetries }}
              </p>
            </div>
          </template>
          <template #status="{ record }">
            <a-tag :color="record.keyConfigured ? 'green' : 'orange'" size="small">
              {{ record.keyConfigured ? 'Key 已配置' : 'Key 未配置' }}
            </a-tag>
          </template>
          <template #actions="{ record }">
            <a-button size="mini" :loading="providerSaving" @click="openProviderEditor(record.key)">
              编辑
            </a-button>
          </template>
        </a-table>
      </section>

      <a-modal
        v-model:visible="providerEditorVisible"
        :closable="!providerSaving"
        :footer="false"
        :mask-closable="!providerSaving"
        :title="providerEditorTitle"
        @cancel="closeProviderEditor"
      >
        <div v-if="providerEditorKey === 'llm'" class="space-y-2">
          <div class="grid gap-2 md:grid-cols-2">
            <a-input v-model="providerForm.aiProvider" size="small" placeholder="provider" />
            <a-input v-model="providerForm.aiModel" size="small" placeholder="model" />
            <a-input v-model="providerForm.aiBaseURL" size="small" class="md:col-span-2" placeholder="baseURL" />
            <a-input-number v-model="providerForm.aiTemperature" size="small" :min="0" :max="1" :step="0.1" placeholder="temperature" />
            <a-input-number v-model="providerForm.aiTopP" size="small" :min="0" :max="1" :step="0.1" placeholder="topP" />
            <a-input-number v-model="providerForm.aiMaxTokens" size="small" :min="0" :max="100000" placeholder="maxTokens(0=default)" />
            <a-input-number v-model="providerForm.aiPresencePenalty" size="small" :min="-2" :max="2" :step="0.1" placeholder="presencePenalty" />
            <a-input-number v-model="providerForm.aiFrequencyPenalty" size="small" :min="-2" :max="2" :step="0.1" placeholder="frequencyPenalty" />
            <a-input-number v-model="providerForm.aiTimeoutMs" size="small" :min="1000" :max="120000" placeholder="timeoutMs" />
            <a-input-number v-model="providerForm.aiMaxRetries" size="small" :min="0" :max="10" placeholder="maxRetries" />
          </div>
          <a-textarea
            v-model="providerForm.aiModelCatalogJson"
            :auto-size="{ minRows: 4, maxRows: 10 }"
            placeholder="模型目录 JSON（可选）"
          />
          <div class="grid gap-2 md:grid-cols-[140px_1fr]">
            <a-select v-model="providerForm.aiApiKeyMode" size="small">
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
              v-model="providerForm.aiApiKey"
              size="small"
              type="password"
              :disabled="providerForm.aiApiKeyMode !== 'replace'"
              placeholder="仅 replace 模式下填写新的 API Key"
            />
          </div>
        </div>

        <div v-else class="space-y-2">
          <div class="grid gap-2 md:grid-cols-2">
            <a-input v-model="providerForm.docAiProvider" size="small" placeholder="provider" />
            <a-input v-model="providerForm.docAiModel" size="small" placeholder="model" />
            <a-input v-model="providerForm.docAiBaseURL" size="small" class="md:col-span-2" placeholder="baseURL" />
            <a-input-number v-model="providerForm.docAiTimeoutMs" size="small" :min="1000" :max="120000" placeholder="timeoutMs" />
            <a-input-number v-model="providerForm.docAiMaxRetries" size="small" :min="0" :max="10" placeholder="maxRetries" />
          </div>
          <div class="grid gap-2 md:grid-cols-[140px_1fr]">
            <a-select v-model="providerForm.docAiApiKeyMode" size="small">
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
              v-model="providerForm.docAiApiKey"
              size="small"
              type="password"
              :disabled="providerForm.docAiApiKeyMode !== 'replace'"
              placeholder="仅 replace 模式下填写新的 API Key"
            />
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
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
      <section class="border border-slate-200 bg-white p-3">
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
              <p class="m-0 text-[11px] text-slate-900">
                enabled={{ record.enabled ? 'true' : 'false' }} · webTimeout={{ record.webTimeoutMs }}ms
              </p>
              <p class="m-0 mt-1 text-[10px] text-slate-500">
                maxWebResults={{ record.maxWebResults }} · maxPageChars={{ record.maxPageChars }}
              </p>
            </div>
          </template>
          <template #status="{ record }">
            <div class="flex flex-wrap items-center gap-1">
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
        <p v-if="providerSaveMessage" class="mt-2 text-[11px] text-emerald-600">
          {{ providerSaveMessage }}
        </p>
      </section>

      <section class="border border-slate-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
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
          <div class="flex items-center gap-2 text-[11px] text-slate-600">
            <span>totalCalls: <b class="font-mono text-slate-900">{{ channels?.totalCalls || 0 }}</b></span>
            <span>totalUnits: <b class="font-mono text-slate-900">{{ channels?.totalUnits || 0 }}</b></span>
          </div>
        </div>
      </section>

      <section class="border border-slate-200 bg-white p-3">
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
        v-model:visible="channelEditorVisible"
        :closable="!providerSaving"
        :footer="false"
        :mask-closable="!providerSaving"
        title="编辑 Admin Agent Channel"
        @cancel="closeChannelEditor"
      >
        <div class="space-y-2">
          <label class="inline-flex items-center gap-2 text-[11px] text-slate-700">
            <span>enabled</span>
            <a-switch v-model="providerForm.adminAiEnabled" size="small" />
          </label>
          <div class="grid gap-2 md:grid-cols-2">
            <a-input-number v-model="providerForm.adminAiWebTimeoutMs" size="small" :min="1000" :max="120000" placeholder="webTimeoutMs" />
            <a-input-number v-model="providerForm.adminAiMaxWebResults" size="small" :min="1" :max="10" placeholder="maxWebResults" />
            <a-input-number v-model="providerForm.adminAiMaxPageChars" size="small" :min="1000" :max="50000" placeholder="maxPageChars" />
          </div>
          <div class="grid gap-2 md:grid-cols-[140px_1fr]">
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
        </div>

        <div class="mt-4 flex justify-end gap-2">
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
      <section class="border border-slate-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
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
            <b class="font-mono text-slate-900">{{ models?.totalMessages || 0 }}</b>
          </div>
        </div>
      </section>

      <section class="border border-slate-200 bg-white p-3">
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
        <div v-if="modelDetailRow" class="space-y-2 text-[11px] text-slate-700">
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
      <section class="border border-slate-200 bg-white p-3">
        <div class="grid gap-2 md:grid-cols-[1fr_auto]">
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

      <section class="border border-slate-200 bg-white p-3">
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
              <p class="m-0 truncate text-[11px] text-slate-900">
                {{ record.actorName || '-' }}
              </p>
              <p class="m-0 mt-1 truncate font-mono text-[10px] text-slate-500">
                {{ record.actorUserId || '-' }}
              </p>
            </div>
          </template>
          <template #contestName="{ record }">
            <div class="min-w-0">
              <p class="m-0 truncate text-[11px] text-slate-900">
                {{ record.contestName || '-' }}
              </p>
              <p class="m-0 mt-1 truncate font-mono text-[10px] text-slate-500">
                {{ record.contestId || '-' }}
              </p>
            </div>
          </template>
          <template #payload="{ record }">
            <p class="m-0 font-mono text-[10px] text-slate-600">
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
        <div v-if="auditDetailRow" class="space-y-2 text-[11px] text-slate-700">
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
          <pre class="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] leading-4">{{ toPrettyJson(auditDetailRow.payload || {}) }}</pre>
        </div>
        <div class="mt-4 flex justify-end">
          <a-button size="small" @click="closeAuditDetail">
            关闭
          </a-button>
        </div>
      </a-modal>
    </section>

    <section v-else class="space-y-3">
      <section class="border border-slate-200 bg-white p-3">
        <div class="grid gap-2 md:grid-cols-3">
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
        <div class="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
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

      <section class="border border-slate-200 bg-white p-3">
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
              <p class="m-0 truncate text-[11px] font-semibold text-slate-900">
                {{ record.workspaceName || '-' }}
              </p>
              <p class="m-0 mt-1 truncate text-[10px] text-slate-500">
                {{ record.sessionTitle || record.sessionId }}
              </p>
              <p class="m-0 mt-1 truncate font-mono text-[10px] text-slate-500">
                ws={{ record.workspaceId }} · sid={{ record.sessionId }}
              </p>
            </div>
          </template>
          <template #provider="{ record }">
            <div class="min-w-0">
              <p class="m-0 truncate text-[11px] text-slate-900">
                {{ record.provider || '-' }} / {{ record.model || '-' }}
              </p>
              <p class="m-0 mt-1 text-[10px] text-slate-500">
                fallback={{ record.fallbackUsed ? 'true' : 'false' }}
              </p>
            </div>
          </template>
          <template #actorName="{ record }">
            <div class="min-w-0">
              <p class="m-0 truncate text-[11px] text-slate-900">
                {{ record.actorName || '-' }}
              </p>
              <p class="m-0 mt-1 truncate font-mono text-[10px] text-slate-500">
                {{ record.actorUserId || '-' }}
              </p>
            </div>
          </template>
          <template #contentPreview="{ record }">
            <div class="min-w-0">
              <p class="m-0 truncate font-mono text-[10px] text-slate-700">
                {{ record.contentPreview || '-' }}
              </p>
              <p class="m-0 mt-1 truncate text-[10px] text-slate-500">
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
        <div v-if="logDetailRow" class="space-y-2 text-[11px] text-slate-700">
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
          <pre class="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] leading-4">{{ logDetailRow.content || '-' }}</pre>
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
