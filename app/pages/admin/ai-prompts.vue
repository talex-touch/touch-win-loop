<script setup lang="ts">
import type {
  ApiResponse,
  ProjectKnowledgeEmbeddingApiStyle as EmbeddingApiStyle,
  PlatformAiClientType,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'

definePageMeta({
  layout: 'admin',
})

type AiConsoleTab = 'channel_models' | 'scenes' | 'audits' | 'logs'
type SecretMode = 'keep' | 'replace' | 'clear'
type ModelFormat = 'openai-compatible' | 'response'
type PricingSource = 'provider' | 'manual' | 'none'
type ProviderType = 'newapi' | 'openai-compatible' | 'dashscope-bailian' | 'coze-voice' | 'searchxng' | 'tavily'
type ProviderCapability = 'llm' | 'search' | 'embedding' | 'asr' | 'tts' | 'realtime' | 'voice'
type ModelCapability = 'chat' | 'vision' | 'embedding' | 'asr' | 'tts' | 'image-gen' | 'video-gen'
type LoadBalanceStrategy = 'round_robin'
type FailoverStrategy = 'model_then_provider'
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
    | 'knowledge_embedding'
    | 'knowledge_visual_embedding'
    | 'knowledge_query_planner'
    | 'knowledge_visual_projection'
    | 'document_analysis'
    | 'meeting_asr'
    | 'speech_tts'

interface ProviderModelItem {
  model: string
  label: string
  format: ModelFormat
  capabilities: ModelCapability[]
  clientType: PlatformAiClientType
  embeddingApiStyle?: EmbeddingApiStyle
  embeddingDimensions?: number
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

interface ProviderItem {
  id: string
  name: string
  type: ProviderType
  capability: ProviderCapability
  adapter: string
  provider: string
  clientType: PlatformAiClientType
  baseURL: string
  enabled: boolean
  timeoutMs: number
  maxRetries: number
  fetchedAt: string
  apiKeyConfigured: boolean
  embeddingApiStyle: EmbeddingApiStyle
  embeddingDimensions: number
  voice?: ProviderVoiceConfig
  models: ProviderModelItem[]
}

interface ProviderVoiceConfig {
  botId: string
  connectorId: string
  voiceId: string
  authMode: 'pat' | 'oauth'
  qwen?: {
    realtimeProfiles: Array<{
      id: string
      name: string
      model: string
      baseWsUrl: string
      workspaceId: string
      appId: string
      defaultVoiceId: string
      asrProfileId: string
      ttsProfileId: string
      vadMode: 'server_vad' | 'semantic_vad' | 'manual'
      frameIntervalMs: number
      enabled: boolean
      sortOrder: number
    }>
    asrProfiles: Array<{
      id: string
      name: string
      model: string
      language: string
      enabled: boolean
      sortOrder: number
    }>
    ttsProfiles: Array<{
      id: string
      name: string
      model: string
      voiceId: string
      sampleRate: number
      enabled: boolean
      sortOrder: number
    }>
  }
  coze?: {
    agents: Array<{
      id: string
      name: string
      judgeType: string
      botId: string
      connectorId: string
      defaultVoiceId: string
      enabled: boolean
      sortOrder: number
    }>
    voices: Array<{
      id: string
      name: string
      voiceId: string
      style: string
      enabled: boolean
      sortOrder: number
    }>
    roomConfig: {
      createRoomOnServer: boolean
      roomNamePrefix: string
    }
  }
  billing?: {
    realtimeStartupUnits: number
    realtimeUnitsPerMinute: number
    asrUnitsPerMinute: number
    ttsUnitsPer1KChars: number
    videoFrameMultiplier: number
    judgeMultiplierEnabled: boolean
    providerMarkupMultiplier: number
  }
}

interface ProviderDraftItem extends ProviderItem {
  voice: ProviderVoiceConfig
  apiKeyMode: SecretMode
  apiKey: string
}

interface SceneDefinition {
  key: PlatformAiChannelKey
  label: string
  description: string
  builtinPrompt: string
  requiredModelCapability: ModelCapability
  allowedProviderCapabilities: ProviderCapability[]
  embeddingApiStyle?: EmbeddingApiStyle
}

interface SceneItem {
  key: PlatformAiChannelKey
  label: string
  description: string
  enabled: boolean
  providerIds: string[]
  loadBalanceStrategy: LoadBalanceStrategy
  models: string[]
  modelFallback: string[]
  failoverStrategy: FailoverStrategy
  prompt: string
}

interface ProvidersPayload {
  providers: ProviderItem[]
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
    ignoredProviderApiKeyIds?: string[]
  }
  overrideState?: {
    aiApiKeyOverridden?: boolean
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
  capabilities: ModelCapability[]
  sourceEndpoint?: string
  rawText?: string
  inputPricePer1M: number | null
  outputPricePer1M: number | null
  currency: string
  pricingSource: 'provider' | 'pricing_table' | 'none'
  pricingText: string
}

interface ProviderModelsPayload {
  providerId: string
  providerName?: string
  provider: string
  baseURL: string
  endpoint?: string
  nativeEmbeddingEndpoint?: string
  fetchedAt: string
  items: ProviderPullItem[]
}

interface ModelPullSeriesGroup {
  key: string
  label: string
  capability: ModelCapability | 'other'
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

interface ProviderTypeGuide {
  title: string
  summary: string
  providerPlaceholder: string
  baseURLPlaceholder: string
  baseURLHint: string
  apiKeyPlaceholder: string
  apiKeyHint: string
  clientTypeHint: string
  embeddingHint: string
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const providerTypeOptions: Array<{ value: ProviderType, label: string, capability: ProviderCapability }> = [
  { value: 'newapi', label: 'NewAPI', capability: 'llm' },
  { value: 'openai-compatible', label: 'OpenAI Compatible', capability: 'llm' },
  { value: 'dashscope-bailian', label: '百炼 DashScope', capability: 'llm' },
  { value: 'coze-voice', label: 'Coze 语音 / Realtime', capability: 'voice' },
  { value: 'searchxng', label: 'SearchXNG', capability: 'search' },
  { value: 'tavily', label: 'Tavily', capability: 'search' },
]

const providerCapabilityOptions: Array<{ value: ProviderCapability, label: string, hint: string }> = [
  { value: 'llm', label: 'LLM / 多模型', hint: '可承载聊天、视觉、Embedding、ASR、TTS 等模型能力，Scene 仍按模型能力过滤。' },
  { value: 'embedding', label: 'Embedding only', hint: '只参与知识库文本或视觉 Embedding 场景，适合 DashScope Embeddings 独立接入。' },
  { value: 'asr', label: 'ASR only', hint: '只参与会议 ASR、录音转写等语音识别场景。' },
  { value: 'tts', label: 'TTS only', hint: '只参与文本转语音、朗读和语音播报场景。' },
  { value: 'realtime', label: 'Voice realtime', hint: '千问或 Coze 实时语音视频 Provider，服务实时答辩、ASR 和 TTS，不进入普通聊天模型池。' },
  { value: 'voice', label: 'Voice legacy', hint: '兼容旧 Coze 语音 Provider；新配置建议使用 realtime 能力。' },
  { value: 'search', label: 'Search only', hint: '搜索型 Provider 固定为 search，不参与模型场景路由。' },
]

const modelCapabilityOptions: Array<{ value: ModelCapability, label: string, color: string, hint: string }> = [
  { value: 'chat', label: '聊天', color: 'arcoblue', hint: '用于 LLM 对话、文档分析和后台助手场景。' },
  { value: 'vision', label: '视觉', color: 'purple', hint: '用于图片理解、OCR 和视觉投影。' },
  { value: 'embedding', label: 'Embedding', color: 'green', hint: '用于知识库文本或多模态向量。' },
  { value: 'asr', label: 'ASR', color: 'cyan', hint: '用于会议字幕、录音转写和语音识别。' },
  { value: 'tts', label: 'TTS', color: 'lime', hint: '用于文本转语音、朗读和语音播报。' },
  { value: 'image-gen', label: '图片生成', color: 'orange', hint: '先作为生成路由能力保留。' },
  { value: 'video-gen', label: '视频生成', color: 'magenta', hint: '先作为生成路由能力保留。' },
]

const modelPullCapabilityFilters: Array<{ value: ModelCapability | 'all', label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'chat', label: '聊天' },
  { value: 'vision', label: '视觉' },
  { value: 'embedding', label: 'Embedding' },
  { value: 'asr', label: 'ASR' },
  { value: 'tts', label: 'TTS' },
  { value: 'image-gen', label: '图片生成' },
  { value: 'video-gen', label: '视频生成' },
]

const providerTypeGuides: Record<ProviderType, ProviderTypeGuide> = {
  'newapi': {
    title: 'NewAPI',
    summary: '按 OpenAI 兼容协议接入，适合聚合网关或自建 NewAPI 服务。',
    providerPlaceholder: 'newapi',
    baseURLPlaceholder: 'https://newapi.example.com',
    baseURLHint: '填写服务根地址即可；如果填到 /v1，保存时会规范化，运行时仍请求 /v1/chat/completions。',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: '填写即替换并持久化；留空则保持已保存密钥不变。',
    clientTypeHint: '聊天接入类型使用 LangChain，底层为 @langchain/openai 的 ChatOpenAI。',
    embeddingHint: 'Embedding 通常选择 OpenAI 兼容文本，并在对应场景里绑定所需向量模型。',
  },
  'openai-compatible': {
    title: 'OpenAI Compatible',
    summary: '用于 OpenAI 官方或任意兼容 /v1 接口的服务。',
    providerPlaceholder: 'openai-compatible',
    baseURLPlaceholder: 'https://api.openai.com',
    baseURLHint: '填写域名根地址或已包含 /v1 的地址均可，系统会统一拼接到 /v1。',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: '填写兼容服务的 API Key，不需要 Bearer 前缀；留空保持已保存密钥不变。',
    clientTypeHint: '聊天接入类型使用 LangChain，底层为 @langchain/openai。',
    embeddingHint: 'Embedding 选择 OpenAI 兼容文本，例如 text-embedding-3-small、text-embedding-v4 等兼容模型。',
  },
  'dashscope-bailian': {
    title: '百炼 DashScope',
    summary: 'Provider 只填百炼服务根地址；聊天、模型列表、多模态 Embedding、Qwen 实时音视频、ASR 与 TTS 配置统一维护。',
    providerPlaceholder: 'dashscope',
    baseURLPlaceholder: 'https://dashscope.aliyuncs.com',
    baseURLHint: 'Base URL 填服务根地址即可；系统会为聊天补 compatible-mode/v1/chat/completions，为模型列表补 compatible-mode/v1/models，为百炼多模态 Embedding 补原生 /api/v1/services/embeddings/multimodal-embedding/multimodal-embedding。',
    apiKeyPlaceholder: 'DASHSCOPE_API_KEY',
    apiKeyHint: '填写 DashScope API Key，不需要 Bearer 前缀；留空保持已保存密钥不变。',
    clientTypeHint: '聊天使用 @langchain/openai + 百炼 compatible-mode；实时音视频/ASR/TTS 走 DashScope WebSocket 或语音原生接口。',
    embeddingHint: '纯文本选 OpenAI 兼容文本；图片、视频或融合向量选百炼原生多模态，运行时使用 https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding。',
  },
  'coze-voice': {
    title: 'Coze 语音 / Realtime',
    summary: '用于 Coze 实时语音、ASR 和 TTS；token 作为 Provider API Key 保存，多智能体、多音色和房间配置单独维护。',
    providerPlaceholder: 'coze',
    baseURLPlaceholder: 'https://api.coze.cn',
    baseURLHint: 'Base URL 填 Coze Open API 根地址，例如 https://api.coze.cn；实时答辩会复用同一组语音身份。',
    apiKeyPlaceholder: 'pat_... / oauth token',
    apiKeyHint: '填写 Coze PAT 或 OAuth Token；留空保持已保存 token 不变。',
    clientTypeHint: 'Coze 语音不走普通 LLM 模型池，ASR/TTS 由 @coze/api audio 接口执行，答辩实时流由 @coze/realtime-api 执行。',
    embeddingHint: 'Coze 语音 Provider 不配置 Embedding。',
  },
  'searchxng': {
    title: 'SearchXNG',
    summary: '搜索型 Provider，只做 search-only 登记，不参与 AI 场景模型路由。',
    providerPlaceholder: 'searchxng',
    baseURLPlaceholder: 'https://search.example.com',
    baseURLHint: '填写 SearchXNG 服务地址；当前 Provider 模型池不会使用它发起 LLM 请求。',
    apiKeyPlaceholder: '可选',
    apiKeyHint: '如网关需要鉴权再填写；否则可保持为空。',
    clientTypeHint: '搜索型 Provider 不需要聊天接入类型。',
    embeddingHint: '搜索型 Provider 不配置 Embedding。',
  },
  'tavily': {
    title: 'Tavily',
    summary: '搜索型 Provider。当前联网搜索运行时主要读取管理助手 Web 搜索里的 Tavily API Key。',
    providerPlaceholder: 'tavily',
    baseURLPlaceholder: 'https://api.tavily.com',
    baseURLHint: 'Tavily 搜索代码固定请求 https://api.tavily.com/search；这里主要用于 Provider 登记展示。',
    apiKeyPlaceholder: 'tvly-...',
    apiKeyHint: '联网搜索密钥在下方管理助手 Web 搜索配置中保存；这里的 Provider API Key 不进入 LLM 模型路由。',
    clientTypeHint: '搜索型 Provider 不需要聊天接入类型。',
    embeddingHint: '搜索型 Provider 不配置 Embedding。',
  },
}

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

const configMasterKeyReady = ref(true)
const providers = ref<ProviderDraftItem[]>([])
const sceneItems = ref<SceneItem[]>([])
const sceneDefinitions = ref<SceneDefinition[]>([])

const adminAiForm = reactive({
  enabled: false,
  webTimeoutMs: 12000,
  maxWebResults: 5,
  maxPageChars: 10000,
  tavilyApiKeyMode: 'keep' as SecretMode,
  tavilyApiKey: '',
})

const providerEditorVisible = ref(false)
const providerEditorIsCreate = ref(false)
const providerEditorTestLoading = ref(false)
const providerEditorTestMessage = ref('')
const providerPullLoading = ref(false)
const providerPullMessage = ref('')
const providerEditorForm = reactive<ProviderDraftItem>({
  id: '',
  name: '',
  type: 'newapi',
  capability: 'llm',
  adapter: 'openai-compatible',
  provider: 'newapi',
  clientType: 'langchain',
  baseURL: '',
  enabled: true,
  timeoutMs: 15000,
  maxRetries: 2,
  fetchedAt: '',
  apiKeyConfigured: false,
  embeddingApiStyle: 'openai-compatible-text',
  embeddingDimensions: 1024,
  voice: {
    botId: '',
    connectorId: '',
    voiceId: '',
    authMode: 'pat',
    qwen: {
      realtimeProfiles: [],
      asrProfiles: [],
      ttsProfiles: [],
    },
    coze: {
      agents: [],
      voices: [],
      roomConfig: {
        createRoomOnServer: true,
        roomNamePrefix: 'WinLoop 答辩',
      },
    },
    billing: {
      realtimeStartupUnits: 2,
      realtimeUnitsPerMinute: 1,
      asrUnitsPerMinute: 1,
      ttsUnitsPer1KChars: 1,
      videoFrameMultiplier: 1,
      judgeMultiplierEnabled: true,
      providerMarkupMultiplier: 1,
    },
  },
  models: [],
  apiKeyMode: 'keep',
  apiKey: '',
})

const modelEditorVisible = ref(false)
const modelEditorIsCreate = ref(false)
const modelEditorForm = reactive<ProviderModelItem>({
  model: '',
  label: '',
  format: 'openai-compatible',
  capabilities: ['chat'],
  clientType: 'langchain',
  embeddingApiStyle: 'openai-compatible-text',
  embeddingDimensions: 1024,
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

const modelPullSelectorVisible = ref(false)
const pulledProviderModels = ref<ProviderPullItem[]>([])
const pulledProviderFetchedAt = ref('')
const pulledProviderMeta = reactive({
  providerId: '',
  providerName: '',
  provider: '',
  baseURL: '',
  endpoint: '',
  nativeEmbeddingEndpoint: '',
})
const modelPullFilterKeyword = ref('')
const modelPullCapabilityFilter = ref<ModelCapability | 'all'>('all')
const selectedPulledModels = ref<string[]>([])
const expandedModelPullSeriesKeys = ref<string[]>([])

const sceneTesting = reactive<Record<string, boolean>>({})
const sceneTestMessage = reactive<Record<string, string>>({})
const sceneEditorVisible = ref(false)
const sceneEditorForm = reactive({
  key: 'project_chat' as PlatformAiChannelKey,
  label: '',
  description: '',
  enabled: true,
  providerIds: [] as string[],
  loadBalanceStrategy: 'round_robin' as LoadBalanceStrategy,
  models: [] as string[],
  modelFallback: [] as string[],
  failoverStrategy: 'model_then_provider' as FailoverStrategy,
  prompt: '',
})
const sceneBatchEditorVisible = ref(false)
const sceneBatchForm = reactive({
  providerIds: [] as string[],
  loadBalanceStrategy: 'round_robin' as LoadBalanceStrategy,
  models: [] as string[],
  modelFallback: [] as string[],
  failoverStrategy: 'model_then_provider' as FailoverStrategy,
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

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const value = String(item || '').trim()
    if (!value || seen.has(value))
      continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function normalizeProviderCapability(value: unknown): ProviderCapability | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'llm' || normalized === 'search' || normalized === 'embedding' || normalized === 'asr' || normalized === 'tts' || normalized === 'realtime' || normalized === 'voice')
    return normalized
  if (normalized === 'embeddings' || normalized === 'embedding-only' || normalized === 'embedding_only' || normalized === 'vector')
    return 'embedding'
  if (normalized === 'speech-to-text' || normalized === 'speech_to_text' || normalized === 'transcription')
    return 'asr'
  if (normalized === 'text-to-speech' || normalized === 'text_to_speech' || normalized === 'speech-synthesis')
    return 'tts'
  if (normalized === 'realtime' || normalized === 'realtime-voice' || normalized === 'voice-realtime' || normalized === 'voice_realtime' || normalized === 'qwen-realtime' || normalized === 'coze-voice')
    return 'realtime'
  return null
}

function providerTypeDefaultCapability(type: ProviderType): ProviderCapability {
  return providerTypeOptions.find(item => item.value === type)?.capability || 'llm'
}

function resolveProviderCapability(type: ProviderType, value?: unknown): ProviderCapability {
  if (providerTypeDefaultCapability(type) === 'search')
    return 'search'
  if (providerTypeDefaultCapability(type) === 'voice')
    return 'voice'

  const explicit = normalizeProviderCapability(value)
  if (explicit && explicit !== 'search')
    return explicit
  return 'llm'
}

function providerCapabilityLabel(value: ProviderCapability): string {
  return providerCapabilityOptions.find(item => item.value === value)?.label || value
}

function providerCapabilityHint(value: ProviderCapability): string {
  return providerCapabilityOptions.find(item => item.value === value)?.hint || ''
}

function modelCapabilityLabel(value: ModelCapability): string {
  return modelCapabilityOptions.find(item => item.value === value)?.label || value
}

function modelCapabilityColor(value: ModelCapability): string {
  return modelCapabilityOptions.find(item => item.value === value)?.color || 'gray'
}

function normalizeModelCapability(value: unknown): ModelCapability | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'llm' || normalized === 'text-generation')
    return 'chat'
  if (normalized === 'chat' || normalized === 'vision' || normalized === 'embedding' || normalized === 'asr' || normalized === 'tts' || normalized === 'image-gen' || normalized === 'video-gen')
    return normalized
  if (normalized === 'speech-to-text' || normalized === 'speech_to_text' || normalized === 'transcription' || normalized === 'transcribe')
    return 'asr'
  if (normalized === 'text-to-speech' || normalized === 'text_to_speech' || normalized === 'speech-synthesis' || normalized === 'speech_synthesis')
    return 'tts'
  if (normalized === 'image' || normalized === 'image-generation' || normalized === 'image_generation')
    return 'image-gen'
  if (normalized === 'video' || normalized === 'video-generation' || normalized === 'video_generation')
    return 'video-gen'
  return null
}

function inferModelCapabilities(model: string, label = '', rawText = ''): ModelCapability[] {
  const text = `${model} ${label} ${rawText}`.toLowerCase()
  const result = new Set<ModelCapability>()
  if (/(?:^|[-_:./\s])(?:text-)?embed(?:ding)?(?:[-_:./\s]|$)|embedding|bge|gte|e5-|multimodal-embedding/.test(text))
    result.add('embedding')
  if (/(?:^|[-_:./\s])(?:whisper|transcribe|transcription|speech-to-text|asr|audio-transcriptions?|gpt-4o-(?:mini-)?transcribe)(?:[-_:./\s]|$)/.test(text))
    result.add('asr')
  if (/(?:^|[-_:./\s])(?:tts|text-to-speech|speech-synthesis|speech-generation|gpt-4o-(?:mini-)?tts)(?:[-_:./\s]|$)/.test(text))
    result.add('tts')
  if (!result.has('embedding') && !result.has('asr') && !result.has('tts') && /(?:^|[-_:./\s])(?:qwen[-_.:]?vl|vl|vision|gpt-4o|gpt-4\.1|gpt-4[-_.:]?vision|gemini[-_.:]?pro[-_.:]?vision)(?:[-_:./\s]|$)/.test(text))
    result.add('vision')
  if (/wanx|(?:^|[-_:./\s])(?:dall[-_.:]?e|gpt-image|image-generation|stable-diffusion|flux|cogview|t2i)(?:[-_:./\s]|$)/.test(text))
    result.add('image-gen')
  if (/(?:^|[-_:./\s])(?:sora|kling|cogvideo|video-generation|text-to-video|image-to-video|t2v|i2v|wan.*video)(?:[-_:./\s]|$)/.test(text))
    result.add('video-gen')
  if (!result.has('embedding') && !result.has('image-gen') && !result.has('video-gen') && !result.has('asr') && !result.has('tts'))
    result.add('chat')
  return modelCapabilityOptions.map(item => item.value).filter(item => result.has(item))
}

function inferEmbeddingApiStyleForModel(model: string, providerType: ProviderType, fallback: EmbeddingApiStyle = 'openai-compatible-text'): EmbeddingApiStyle {
  const normalized = String(model || '').toLowerCase()
  if (
    providerType === 'dashscope-bailian'
    && (
      normalized.includes('tongyi-embedding-vision')
      || normalized.includes('embedding-vision')
      || normalized.includes('vl-embedding')
      || normalized.includes('multimodal-embedding')
      || normalized.includes('qwen3-vl-embedding')
    )
  ) {
    return 'bailian-multimodal'
  }
  return fallback
}

function normalizeModelCapabilities(raw: unknown, fallback: ModelCapability[]): ModelCapability[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,|\s]+/g)
      : []
  const normalized = values
    .map(item => normalizeModelCapability(item))
    .filter((item): item is ModelCapability => Boolean(item))
  const source = normalized.length > 0 ? normalized : fallback
  const sourceSet = new Set(source)
  return modelCapabilityOptions.map(item => item.value).filter(item => sourceSet.has(item))
}

function modelHasCapability(item: Pick<ProviderModelItem, 'capabilities'>, capability: ModelCapability): boolean {
  return Array.isArray(item.capabilities) && item.capabilities.includes(capability)
}

function primaryModelCapability(item: Pick<ProviderPullItem, 'capabilities'>): ModelCapability | 'other' {
  return Array.isArray(item.capabilities) ? item.capabilities[0] || 'other' : 'other'
}

function sanitizeModelFormatForProvider(providerType: ProviderType, format: ModelFormat): ModelFormat {
  return providerType === 'dashscope-bailian' || providerType === 'coze-voice' ? 'openai-compatible' : format
}

function cloneModelItem(item: ProviderModelItem): ProviderModelItem {
  return {
    ...item,
    capabilities: [...item.capabilities],
  }
}

function cloneProviderItem(item: ProviderDraftItem): ProviderDraftItem {
  return {
    ...item,
    voice: normalizeProviderVoiceDraft(item.voice || createEmptyProviderDraft().voice),
    models: item.models.map(model => cloneModelItem(model)),
  }
}

function normalizeProviderVoiceDraft(raw?: Partial<ProviderVoiceConfig>): ProviderVoiceConfig {
  const source = raw || {}
  const qwen = source.qwen || { realtimeProfiles: [], asrProfiles: [], ttsProfiles: [] }
  const coze = source.coze || { agents: [], voices: [], roomConfig: { createRoomOnServer: true, roomNamePrefix: 'WinLoop 答辩' } }
  const billing = source.billing || {
    realtimeStartupUnits: 2,
    realtimeUnitsPerMinute: 1,
    asrUnitsPerMinute: 1,
    ttsUnitsPer1KChars: 1,
    videoFrameMultiplier: 1,
    judgeMultiplierEnabled: true,
    providerMarkupMultiplier: 1,
  }
  return {
    botId: String(source.botId || '').trim(),
    connectorId: String(source.connectorId || '').trim(),
    voiceId: String(source.voiceId || '').trim(),
    authMode: source.authMode === 'oauth' ? 'oauth' : 'pat',
    qwen: {
      realtimeProfiles: (qwen.realtimeProfiles || []).map((item, index) => ({
        id: String(item.id || `qwen_realtime_${index + 1}`).trim(),
        name: String(item.name || `千问实时 ${index + 1}`).trim(),
        model: String(item.model || 'qwen3.5-omni-plus-realtime').trim(),
        baseWsUrl: String(item.baseWsUrl || '').trim(),
        workspaceId: String(item.workspaceId || '').trim(),
        appId: String(item.appId || '').trim(),
        defaultVoiceId: String(item.defaultVoiceId || '').trim(),
        asrProfileId: String(item.asrProfileId || '').trim(),
        ttsProfileId: String(item.ttsProfileId || '').trim(),
        vadMode: item.vadMode === 'manual' ? 'manual' : (item.vadMode === 'semantic_vad' ? 'semantic_vad' : 'server_vad'),
        frameIntervalMs: Math.max(250, Math.min(5000, Math.trunc(Number(item.frameIntervalMs || 1000)))),
        enabled: item.enabled !== false,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : index,
      })),
      asrProfiles: (qwen.asrProfiles || []).map((item, index) => ({
        id: String(item.id || `qwen_asr_${index + 1}`).trim(),
        name: String(item.name || `千问 ASR ${index + 1}`).trim(),
        model: String(item.model || 'qwen3-asr-flash-realtime').trim(),
        language: String(item.language || 'zh-CN').trim(),
        enabled: item.enabled !== false,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : index,
      })),
      ttsProfiles: (qwen.ttsProfiles || []).map((item, index) => ({
        id: String(item.id || `qwen_tts_${index + 1}`).trim(),
        name: String(item.name || `千问 TTS ${index + 1}`).trim(),
        model: String(item.model || 'qwen-tts-realtime').trim(),
        voiceId: String(item.voiceId || '').trim(),
        sampleRate: Math.max(8000, Math.min(48000, Math.trunc(Number(item.sampleRate || 24000)))),
        enabled: item.enabled !== false,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : index,
      })),
    },
    coze: {
      agents: (coze.agents || []).map((item, index) => ({
        id: String(item.id || `coze_agent_${index + 1}`).trim(),
        name: String(item.name || `Coze 智能体 ${index + 1}`).trim(),
        judgeType: String(item.judgeType || 'custom').trim(),
        botId: String(item.botId || '').trim(),
        connectorId: String(item.connectorId || '').trim(),
        defaultVoiceId: String(item.defaultVoiceId || '').trim(),
        enabled: item.enabled !== false,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : index,
      })),
      voices: (coze.voices || []).map((item, index) => ({
        id: String(item.id || `coze_voice_${index + 1}`).trim(),
        name: String(item.name || `Coze 音色 ${index + 1}`).trim(),
        voiceId: String(item.voiceId || '').trim(),
        style: String(item.style || '').trim(),
        enabled: item.enabled !== false,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : index,
      })),
      roomConfig: {
        createRoomOnServer: coze.roomConfig?.createRoomOnServer !== false,
        roomNamePrefix: String(coze.roomConfig?.roomNamePrefix || 'WinLoop 答辩').trim(),
      },
    },
    billing: {
      realtimeStartupUnits: Math.max(0, Math.trunc(Number(billing.realtimeStartupUnits || 2))),
      realtimeUnitsPerMinute: Math.max(0, Math.trunc(Number(billing.realtimeUnitsPerMinute || 1))),
      asrUnitsPerMinute: Math.max(0, Math.trunc(Number(billing.asrUnitsPerMinute || 1))),
      ttsUnitsPer1KChars: Math.max(0, Math.trunc(Number(billing.ttsUnitsPer1KChars || 1))),
      videoFrameMultiplier: Math.max(1, Number(billing.videoFrameMultiplier || 1)),
      judgeMultiplierEnabled: billing.judgeMultiplierEnabled !== false,
      providerMarkupMultiplier: Math.max(1, Number(billing.providerMarkupMultiplier || 1)),
    },
  }
}

function createEmptyProviderDraft(): ProviderDraftItem {
  return {
    id: '',
    name: '',
    type: 'newapi',
    capability: 'llm',
    adapter: 'openai-compatible',
    provider: 'newapi',
    clientType: 'langchain',
    baseURL: '',
    enabled: true,
    timeoutMs: 15000,
    maxRetries: 2,
    fetchedAt: '',
    apiKeyConfigured: false,
    embeddingApiStyle: 'openai-compatible-text',
    embeddingDimensions: 1024,
    voice: {
      botId: '',
      connectorId: '',
      voiceId: '',
      authMode: 'pat',
      qwen: {
        realtimeProfiles: [],
        asrProfiles: [],
        ttsProfiles: [],
      },
      coze: {
        agents: [],
        voices: [],
        roomConfig: {
          createRoomOnServer: true,
          roomNamePrefix: 'WinLoop 答辩',
        },
      },
      billing: {
        realtimeStartupUnits: 2,
        realtimeUnitsPerMinute: 1,
        asrUnitsPerMinute: 1,
        ttsUnitsPer1KChars: 1,
        videoFrameMultiplier: 1,
        judgeMultiplierEnabled: true,
        providerMarkupMultiplier: 1,
      },
    },
    models: [],
    apiKeyMode: 'keep',
    apiKey: '',
  }
}

function normalizeProviderTypeLabel(type: ProviderType): string {
  return providerTypeOptions.find(item => item.value === type)?.label || type
}

function normalizePricing(item: Pick<ProviderModelItem, 'providerInputPricePer1M' | 'providerOutputPricePer1M' | 'manualInputPricePer1M' | 'manualOutputPricePer1M' | 'manualPriceOverride'>): {
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

function normalizeModelItem(item: ProviderModelItem, providerType: ProviderType = providerEditorForm.type): ProviderModelItem {
  const pricing = normalizePricing(item)
  const model = String(item.model || '').trim()
  const label = String(item.label || item.model || '').trim() || model
  const capabilities = normalizeModelCapabilities(item.capabilities, inferModelCapabilities(model, label))
  const isEmbedding = capabilities.includes('embedding')
  return {
    ...item,
    model,
    label,
    format: sanitizeModelFormatForProvider(providerType, item.format || 'openai-compatible'),
    capabilities,
    clientType: 'langchain',
    embeddingApiStyle: isEmbedding ? inferEmbeddingApiStyleForModel(model, providerType, item.embeddingApiStyle || 'openai-compatible-text') : undefined,
    embeddingDimensions: isEmbedding ? Number(item.embeddingDimensions || 1024) : undefined,
    currency: String(item.currency || 'USD').trim().toUpperCase() || 'USD',
    inputPricePer1M: pricing.inputPricePer1M,
    outputPricePer1M: pricing.outputPricePer1M,
    pricingSource: pricing.pricingSource,
  }
}

function buildPriceText(item: Pick<ProviderModelItem, 'inputPricePer1M' | 'outputPricePer1M' | 'currency'>): string {
  if (item.inputPricePer1M === null && item.outputPricePer1M === null)
    return '默认未计费'
  const input = item.inputPricePer1M === null ? '-' : `${item.currency} ${Number(item.inputPricePer1M).toFixed(4)}/1M`
  const output = item.outputPricePer1M === null ? '-' : `${item.currency} ${Number(item.outputPricePer1M).toFixed(4)}/1M`
  return `输入 ${input} · 输出 ${output}`
}

function buildImportedPriceText(item: Pick<ProviderModelItem, 'providerInputPricePer1M' | 'providerOutputPricePer1M' | 'currency'>): string {
  if (item.providerInputPricePer1M === null && item.providerOutputPricePer1M === null)
    return '默认未计费'
  const input = item.providerInputPricePer1M === null ? '-' : `${item.currency} ${Number(item.providerInputPricePer1M).toFixed(4)}/1M`
  const output = item.providerOutputPricePer1M === null ? '-' : `${item.currency} ${Number(item.providerOutputPricePer1M).toFixed(4)}/1M`
  return `输入 ${input} · 输出 ${output}`
}

function sceneModelEmptyHint(): string {
  if (sceneEditorForm.providerIds.length === 0)
    return '请先绑定可服务该场景的 Provider。'
  const requiredCapability = modelCapabilityLabel(sceneRequiredCapability(sceneEditorForm.key))
  const embeddingApiStyle = sceneEmbeddingApiStyleFilter(sceneEditorForm.key)
  if (sceneEditorForm.key === 'knowledge_embedding') {
    return `当前场景需要 ${requiredCapability} 模型，且接入类型必须为 OpenAI 兼容文本；DashScope 的 tongyi-embedding-vision-plus 属于百炼原生多模态，请改用 text-embedding-v4 等文本向量模型。`
  }
  if (sceneEditorForm.key === 'knowledge_visual_embedding') {
    return `当前场景需要 ${requiredCapability} 模型，且接入类型必须为百炼原生多模态；可选择 tongyi-embedding-vision-plus。`
  }
  return `当前绑定 Provider 中没有启用的 ${requiredCapability}${embeddingApiStyle ? ` / ${embeddingApiStyle}` : ''} 模型，请先在 Provider 模型池中新增或启用匹配模型。`
}

function normalizePullItem(item: ProviderPullItem): ProviderPullItem {
  const model = String(item.model || '').trim()
  const label = String(item.label || model).trim() || model
  return {
    ...item,
    model,
    label,
    capabilities: normalizeModelCapabilities(item.capabilities, inferModelCapabilities(model, label, item.rawText || '')),
    currency: String(item.currency || 'USD').trim().toUpperCase() || 'USD',
    rawText: String(item.rawText || ''),
  }
}

function providerCapabilitySupportsModels(capability: ProviderCapability): boolean {
  return capability !== 'search' && capability !== 'voice' && capability !== 'realtime'
}

function normalizeProviderDraft(provider: ProviderDraftItem): ProviderDraftItem {
  const capability = resolveProviderCapability(provider.type, provider.capability)
  const models = providerCapabilitySupportsModels(capability)
    ? provider.models.map(item => normalizeModelItem(item, provider.type)).sort((a, b) => a.model.localeCompare(b.model, 'en'))
    : []
  const hasApiKey = provider.apiKeyMode === 'clear'
    ? false
    : (provider.apiKeyConfigured || Boolean(String(provider.apiKey || '').trim()))
  return {
    ...provider,
    capability,
    provider: String(provider.provider || provider.type).trim() || provider.type,
    name: String(provider.name || normalizeProviderTypeLabel(provider.type)).trim() || normalizeProviderTypeLabel(provider.type),
    baseURL: String(provider.baseURL || '').trim(),
    apiKeyConfigured: hasApiKey,
    voice: normalizeProviderVoiceDraft(provider.voice),
    models,
  }
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

function mergePulledModels(currentItems: ProviderModelItem[], pulled: ProviderPullItem[]): ProviderModelItem[] {
  const currentMap = new Map(currentItems.map(item => [item.model, normalizeModelItem(item)]))
  const result: ProviderModelItem[] = []

  for (const item of pulled) {
    const current = currentMap.get(item.model)
    const next = normalizeModelItem({
      model: item.model,
      label: current?.label || item.label || item.model,
      format: current?.format || 'openai-compatible',
      capabilities: normalizeModelCapabilities(current?.capabilities, item.capabilities),
      clientType: 'langchain',
      embeddingApiStyle: current?.embeddingApiStyle || inferEmbeddingApiStyleForModel(item.model, providerEditorForm.type),
      embeddingDimensions: current?.embeddingDimensions || (item.capabilities.includes('embedding') ? 1024 : undefined),
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

const providerIdMap = computed(() => new Map(providers.value.map(item => [item.id, item])))

const providerRows = computed(() => {
  return [...providers.value].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

const routableProviderOptions = computed(() => {
  return providers.value
    .filter(item => item.capability !== 'search')
    .map(item => ({
      id: item.id,
      name: item.name,
      provider: item.provider,
      capability: item.capability,
      enabled: item.enabled,
    }))
})

const providerEditorSupportsModels = computed(() => providerCapabilitySupportsModels(providerEditorForm.capability))
const providerEditorCanRunChatTest = computed(() => providerEditorForm.capability === 'llm')
const providerEditorCanRunVoiceTest = computed(() => providerEditorForm.capability === 'voice' || providerEditorForm.capability === 'realtime')
const providerEditorCanRunTtsTest = computed(() => providerEditorForm.capability === 'tts')
const providerEditorCanRunProviderTest = computed(() => providerEditorCanRunChatTest.value || providerEditorCanRunVoiceTest.value || providerEditorCanRunTtsTest.value)
const providerEditorCapabilityLocked = computed(() => providerTypeDefaultCapability(providerEditorForm.type) === 'search' || providerTypeDefaultCapability(providerEditorForm.type) === 'voice')
const providerEditorCapabilityOptions = computed(() => {
  const values: ProviderCapability[] = providerEditorCapabilityLocked.value
    ? [providerTypeDefaultCapability(providerEditorForm.type)]
    : ['llm', 'embedding', 'asr', 'tts', 'realtime']
  return providerCapabilityOptions.filter(item => values.includes(item.value))
})
const providerEditorTypeGuide = computed(() => providerTypeGuides[providerEditorForm.type] || providerTypeGuides['openai-compatible'])

const providerEditorModelRows = computed(() => {
  return [...providerEditorForm.models].map(item => normalizeModelItem(item)).sort((a, b) => a.model.localeCompare(b.model, 'en'))
})

const currentModelPoolNameSet = computed(() => new Set(providerEditorForm.models.map(item => item.model)))

const normalizedModelPullFilterKeyword = computed(() => String(modelPullFilterKeyword.value || '').trim().toLowerCase())

function modelPullSearchText(item: ProviderPullItem): string {
  return [
    item.model,
    item.label,
    item.provider,
    item.pricingText,
    item.sourceEndpoint,
    item.rawText,
    ...item.capabilities,
    ...item.capabilities.map(capability => modelCapabilityLabel(capability)),
  ].filter(Boolean).join(' ').toLowerCase()
}

function matchesModelPullFilter(item: ProviderPullItem, keyword: string): boolean {
  if (!keyword)
    return true
  return modelPullSearchText(item).includes(keyword)
}

const filteredPulledModels = computed(() => {
  const keyword = normalizedModelPullFilterKeyword.value
  const capability = modelPullCapabilityFilter.value
  return pulledProviderModels.value.filter((item) => {
    if (capability !== 'all' && !item.capabilities.includes(capability))
      return false
    return matchesModelPullFilter(item, keyword)
  })
})

const modelPullSeriesGroups = computed<ModelPullSeriesGroup[]>(() => {
  const groups = new Map<string, ModelPullSeriesGroup>()
  for (const item of filteredPulledModels.value) {
    const capability = primaryModelCapability(item)
    const series = resolveModelSeries(item)
    const key = `${capability}:${series.key}`
    const capabilityLabel = capability === 'other' ? '其他' : modelCapabilityLabel(capability)
    const currentGroup = groups.get(key) || { key, label: `${capabilityLabel} / ${series.label}`, capability, items: [] }
    currentGroup.items.push(item)
    groups.set(key, currentGroup)
  }
  return Array.from(groups.values()).map(group => ({
    ...group,
    items: [...group.items].sort((a, b) => a.model.localeCompare(b.model, 'en')),
  }))
})

const filteredModelPullSeriesGroups = computed<ModelPullSeriesGroup[]>(() => {
  return modelPullSeriesGroups.value
})

const filteredPulledModelCount = computed(() => filteredModelPullSeriesGroups.value.reduce((count, group) => count + group.items.length, 0))
const selectedPulledModelSet = computed(() => new Set(selectedPulledModels.value))
const selectedPulledModelCount = computed(() => selectedPulledModels.value.length)
const allPulledModelsChecked = computed(() => filteredPulledModels.value.length > 0 && filteredPulledModels.value.every(item => selectedPulledModelSet.value.has(item.model)))
const allPulledModelsIndeterminate = computed(() => {
  const selectedCount = filteredPulledModels.value.filter(item => selectedPulledModelSet.value.has(item.model)).length
  return selectedCount > 0 && selectedCount < filteredPulledModels.value.length
})
const pulledEmbeddingCandidateCount = computed(() => pulledProviderModels.value.filter(item => item.capabilities.includes('embedding')).length)

const sceneDefinitionMap = computed(() => new Map(sceneDefinitions.value.map(item => [item.key, item])))

function sceneDefinitionForKey(key: PlatformAiChannelKey): SceneDefinition | null {
  return sceneDefinitionMap.value.get(key) || null
}

function sceneRequiredCapability(key: PlatformAiChannelKey): ModelCapability {
  return sceneDefinitionForKey(key)?.requiredModelCapability || 'chat'
}

function sceneAllowedProviderCapabilities(key: PlatformAiChannelKey): ProviderCapability[] {
  return sceneDefinitionForKey(key)?.allowedProviderCapabilities || ['llm']
}

function sceneEmbeddingApiStyleFilter(key: PlatformAiChannelKey): EmbeddingApiStyle | null {
  return sceneDefinitionForKey(key)?.embeddingApiStyle || null
}

function sceneCanRunChatTest(scene: Pick<SceneItem, 'key' | 'providerIds'>): boolean {
  const capability = sceneRequiredCapability(scene.key)
  if (capability === 'tts') {
    return scene.providerIds.some((id) => {
      const provider = providerIdMap.value.get(id)
      return provider?.capability === 'tts' || provider?.capability === 'voice' || provider?.capability === 'realtime' || provider?.capability === 'llm'
    })
  }
  if (capability !== 'chat')
    return false
  return scene.providerIds.some(id => providerIdMap.value.get(id)?.capability === 'llm')
}

function providerCanServeScene(provider: Pick<ProviderItem, 'capability'>, key: PlatformAiChannelKey): boolean {
  return sceneAllowedProviderCapabilities(key).includes(provider.capability)
}

function resolveSceneModelCatalog(providerIds: string[], currentModels: string[] = [], capability: ModelCapability = 'chat', embeddingApiStyle: EmbeddingApiStyle | null = null): Array<{ model: string, label: string, priceText: string }> {
  const providerSet = new Set(providerIds)
  const map = new Map<string, { model: string, label: string, priceText: string }>()
  for (const provider of providers.value.filter(item => item.capability !== 'search' && providerSet.has(item.id))) {
    for (const model of provider.models.filter(item => item.enabled && modelHasCapability(item, capability) && (!embeddingApiStyle || item.embeddingApiStyle === embeddingApiStyle))) {
      if (!map.has(model.model)) {
        map.set(model.model, {
          model: model.model,
          label: model.label,
          priceText: buildPriceText(model),
        })
      }
    }
  }
  for (const model of currentModels) {
    const normalized = String(model || '').trim()
    if (normalized && !map.has(normalized)) {
      map.set(normalized, {
        model: normalized,
        label: normalized,
        priceText: '未在当前 Provider 模型池中',
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.model.localeCompare(b.model, 'en'))
}

function resolveSceneBatchModelCatalog(providerIds: string[], currentModels: string[] = []): Array<{ model: string, label: string, priceText: string }> {
  const providerSet = new Set(providerIds)
  const map = new Map<string, { model: string, label: string, priceText: string }>()
  for (const provider of providers.value.filter(item => item.capability !== 'search' && providerSet.has(item.id))) {
    for (const model of provider.models.filter(item => item.enabled)) {
      if (!map.has(model.model)) {
        map.set(model.model, {
          model: model.model,
          label: model.label,
          priceText: buildPriceText(model),
        })
      }
    }
  }
  for (const model of currentModels) {
    const normalized = String(model || '').trim()
    if (normalized && !map.has(normalized)) {
      map.set(normalized, {
        model: normalized,
        label: normalized,
        priceText: '未在当前 Provider 模型池中',
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.model.localeCompare(b.model, 'en'))
}

function normalizeSceneModels(models: string[], providerIds: string[], capability: ModelCapability = 'chat', embeddingApiStyle: EmbeddingApiStyle | null = null): string[] {
  const catalog = new Set(resolveSceneModelCatalog(providerIds, [], capability, embeddingApiStyle).map(item => item.model))
  const normalized = dedupeStrings(models)
  if (catalog.size === 0)
    return []
  return normalized.filter(item => catalog.has(item))
}

function normalizeSceneBatchModels(models: string[], providerIds: string[]): string[] {
  const catalog = new Set(resolveSceneBatchModelCatalog(providerIds, []).map(item => item.model))
  const normalized = dedupeStrings(models)
  if (catalog.size === 0)
    return []
  return normalized.filter(item => catalog.has(item))
}

function normalizeSceneRoutingConfig(
  input: Pick<SceneItem, 'models' | 'modelFallback' | 'key'>,
  providerIds: string[],
): Pick<SceneItem, 'models' | 'modelFallback'> {
  const models = normalizeSceneModels(
    input.models.length > 0 ? input.models : input.modelFallback,
    providerIds,
    sceneRequiredCapability(input.key),
    sceneEmbeddingApiStyleFilter(input.key),
  )
  const modelSet = new Set(models)
  return {
    models,
    modelFallback: normalizeSceneModels(
      input.modelFallback,
      providerIds,
      sceneRequiredCapability(input.key),
      sceneEmbeddingApiStyleFilter(input.key),
    ).filter(item => modelSet.has(item)),
  }
}

function normalizeSceneBatchRoutingConfig(input: Pick<typeof sceneBatchForm, 'models' | 'modelFallback'>): Pick<typeof sceneBatchForm, 'models' | 'modelFallback'> {
  const models = normalizeSceneBatchModels(input.models.length > 0 ? input.models : input.modelFallback, sceneBatchForm.providerIds)
  const modelSet = new Set(models)
  return {
    models,
    modelFallback: normalizeSceneBatchModels(input.modelFallback, sceneBatchForm.providerIds).filter(item => modelSet.has(item)),
  }
}

const sceneEditorModelPoolOptions = computed(() => resolveSceneModelCatalog(sceneEditorForm.providerIds, sceneEditorForm.models, sceneRequiredCapability(sceneEditorForm.key), sceneEmbeddingApiStyleFilter(sceneEditorForm.key)))
const sceneEditorProviderOptions = computed(() => routableProviderOptions.value.filter(provider => providerCanServeScene(provider, sceneEditorForm.key)))
const sceneEditorFallbackOptions = computed(() => {
  const modelSet = new Set(sceneEditorForm.models)
  return sceneEditorModelPoolOptions.value.filter(item => modelSet.has(item.model))
})
const sceneBatchModelPoolOptions = computed(() => resolveSceneBatchModelCatalog(sceneBatchForm.providerIds, sceneBatchForm.models))
const sceneBatchFallbackOptions = computed(() => {
  const modelSet = new Set(sceneBatchForm.models)
  return sceneBatchModelPoolOptions.value.filter(item => modelSet.has(item.model))
})

function normalizeSceneProviderIds(providerIds: string[], key?: PlatformAiChannelKey): string[] {
  const providerMap = new Map(providers.value.map(item => [item.id, item]))
  return dedupeStrings(providerIds).filter((item) => {
    const provider = providerMap.get(item)
    if (!provider || provider.capability === 'search')
      return false
    return key ? providerCanServeScene(provider, key) : true
  })
}

const sceneRows = computed(() => {
  const definitionIndex = new Map(sceneDefinitions.value.map((item, index) => [item.key, index]))
  return [...sceneItems.value].sort((a, b) => Number(definitionIndex.get(a.key) ?? 999) - Number(definitionIndex.get(b.key) ?? 999))
})

function providerSummary(provider: ProviderDraftItem): string {
  if (provider.capability === 'search')
    return '仅搜索能力，不参与当前 AI 场景模型路由'
  if (provider.capability === 'embedding')
    return 'Embedding Provider，只参与知识库向量场景模型路由'
  if (provider.capability === 'asr')
    return '语音识别 Provider，只参与 ASR 场景模型路由'
  if (provider.capability === 'tts')
    return '语音合成 Provider，只参与 TTS 场景模型路由'
  if (provider.capability === 'voice' || provider.capability === 'realtime')
    return '实时语音视频 Provider，参与答辩、ASR 和 TTS 场景'
  const enabledCount = provider.models.filter(item => item.enabled).length
  const capabilityText = modelCapabilityOptions
    .map(option => `${option.label} ${provider.models.filter(item => modelHasCapability(item, option.value)).length}`)
    .filter(item => !item.endsWith(' 0'))
    .join(' · ')
  return `模型 ${enabledCount}/${provider.models.length}${capabilityText ? ` · ${capabilityText}` : ''}`
}

function sceneProvidersPreview(scene: SceneItem): string {
  if (scene.providerIds.length === 0)
    return '未绑定 Provider'
  return scene.providerIds
    .map((id) => {
      const providerName = providerIdMap.value.get(id)?.name || id
      return `${providerName} #${id}`
    })
    .join(' / ')
}

function sceneUsesModelLessVoice(scene: Pick<SceneItem, 'key' | 'providerIds'>): boolean {
  const capability = sceneRequiredCapability(scene.key)
  return (capability === 'asr' || capability === 'tts' || scene.key === 'defense')
    && scene.providerIds.some(id => ['voice', 'realtime'].includes(providerIdMap.value.get(id)?.capability || ''))
}

function sceneModelPoolPreview(scene: SceneItem): string {
  if (scene.models.length === 0 && sceneUsesModelLessVoice(scene))
    return '实时语音原生接口，无需模型池'
  if (scene.models.length === 0)
    return '未配置'
  return scene.models.join(' / ')
}

function sceneFallbackPreview(scene: SceneItem): string {
  if (scene.modelFallback.length === 0) {
    if (sceneUsesModelLessVoice(scene))
      return '实时语音原生接口，无需回退模型'
    if (scene.models.length === 0)
      return '未配置'
    return `未单独配置，将按模型池顺序：${scene.models.join(' -> ')}`
  }
  return scene.modelFallback.join(' -> ')
}

function sceneFailoverStrategyLabel(scene: Pick<SceneItem, 'failoverStrategy'>): string {
  if (scene.failoverStrategy === 'model_then_provider')
    return '按模型顺序切换，同模型内轮询 Provider'
  return '按模型顺序切换，同模型内轮询 Provider'
}

function sceneUsageHint(scene: SceneItem): string {
  if (scene.key === 'project_chat')
    return '项目对话场景'
  if (scene.key === 'document_analysis')
    return '文档分析场景'
  if (scene.key === 'knowledge_embedding')
    return '文本向量入口'
  if (scene.key === 'knowledge_visual_embedding')
    return '视觉向量入口'
  if (scene.key === 'knowledge_visual_projection')
    return '视觉投影入口'
  return ''
}

function sceneUsageHintColor(scene: SceneItem): 'arcoblue' | 'green' | 'gray' {
  if (scene.key === 'project_chat')
    return 'arcoblue'
  if (scene.key === 'document_analysis' || scene.key === 'knowledge_embedding' || scene.key === 'knowledge_visual_embedding' || scene.key === 'knowledge_visual_projection')
    return 'green'
  return 'gray'
}

function promptPreview(prompt: string): string {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim()
  if (!text)
    return '-'
  return text.length > 90 ? `${text.slice(0, 90)}...` : text
}

function applyConsolePayload(payload: ProvidersPayload): void {
  configMasterKeyReady.value = payload.config?.masterKeyReady !== false
  providers.value = (payload.providers || []).map((item) => {
    const draft = normalizeProviderDraft({
      ...item,
      voice: item.voice || createEmptyProviderDraft().voice,
      models: (item.models || []).map(model => normalizeModelItem(model, item.type)),
      apiKeyMode: 'keep',
      apiKey: '',
    })
    return draft
  })
  sceneDefinitions.value = payload.scenes?.definitions || []
  sceneItems.value = (payload.scenes?.items || []).map((item) => {
    const providerIds = normalizeSceneProviderIds(item.providerIds || [], item.key)
    const normalizedRouting = normalizeSceneRoutingConfig({
      key: item.key,
      models: dedupeStrings(item.models || item.modelFallback || []),
      modelFallback: dedupeStrings(item.modelFallback || []),
    }, providerIds)
    return {
      ...item,
      providerIds,
      loadBalanceStrategy: item.loadBalanceStrategy || 'round_robin',
      models: normalizedRouting.models,
      modelFallback: normalizedRouting.modelFallback,
      failoverStrategy: item.failoverStrategy || 'model_then_provider',
      prompt: String(item.prompt || ''),
    }
  })

  adminAiForm.enabled = Boolean(payload.adminAi.enabled)
  adminAiForm.webTimeoutMs = Number(payload.adminAi.webTimeoutMs || 12000)
  adminAiForm.maxWebResults = Number(payload.adminAi.maxWebResults || 5)
  adminAiForm.maxPageChars = Number(payload.adminAi.maxPageChars || 10000)
  adminAiForm.tavilyApiKeyMode = 'keep'
  adminAiForm.tavilyApiKey = ''
}

function resolveProviderApiKeyMode(provider: Pick<ProviderDraftItem, 'apiKey'>): SecretMode {
  return String(provider.apiKey || '').trim() ? 'replace' : 'keep'
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

function buildProviderPayload(provider: ProviderDraftItem) {
  const normalized = normalizeProviderDraft(provider)
  const apiKey = String(normalized.apiKey || '').trim()
  const payload: {
    id: string
    name: string
    type: ProviderType
    capability: ProviderCapability
    provider: string
    baseURL: string
    enabled: boolean
    timeoutMs: number
    maxRetries: number
    apiKeyMode: SecretMode
    apiKey?: string
    voice: ProviderVoiceConfig
    models: ProviderModelItem[]
  } = {
    id: normalized.id,
    name: normalized.name,
    type: normalized.type,
    capability: normalized.capability,
    provider: normalized.provider,
    baseURL: normalized.baseURL,
    enabled: normalized.enabled,
    timeoutMs: Number(normalized.timeoutMs || 15000),
    maxRetries: Number(normalized.maxRetries || 2),
    apiKeyMode: resolveProviderApiKeyMode(normalized),
    voice: normalized.voice,
    models: normalized.models.map(item => normalizeModelItem(item, normalized.type)),
  }
  if (apiKey)
    payload.apiKey = apiKey
  return payload
}

function addQwenRealtimeProfile(): void {
  const items = providerEditorForm.voice.qwen?.realtimeProfiles || []
  items.push({
    id: `qwen_realtime_${items.length + 1}`,
    name: `千问实时 ${items.length + 1}`,
    model: 'qwen3.5-omni-plus-realtime',
    baseWsUrl: '',
    workspaceId: '',
    appId: '',
    defaultVoiceId: '',
    asrProfileId: '',
    ttsProfileId: '',
    vadMode: 'server_vad',
    frameIntervalMs: 1000,
    enabled: true,
    sortOrder: items.length,
  })
  providerEditorForm.voice.qwen = {
    realtimeProfiles: items,
    asrProfiles: providerEditorForm.voice.qwen?.asrProfiles || [],
    ttsProfiles: providerEditorForm.voice.qwen?.ttsProfiles || [],
  }
}

function addQwenAsrProfile(): void {
  const items = providerEditorForm.voice.qwen?.asrProfiles || []
  items.push({
    id: `qwen_asr_${items.length + 1}`,
    name: `千问 ASR ${items.length + 1}`,
    model: 'qwen3-asr-flash-realtime',
    language: 'zh-CN',
    enabled: true,
    sortOrder: items.length,
  })
  providerEditorForm.voice.qwen = {
    realtimeProfiles: providerEditorForm.voice.qwen?.realtimeProfiles || [],
    asrProfiles: items,
    ttsProfiles: providerEditorForm.voice.qwen?.ttsProfiles || [],
  }
}

function addQwenTtsProfile(): void {
  const items = providerEditorForm.voice.qwen?.ttsProfiles || []
  items.push({
    id: `qwen_tts_${items.length + 1}`,
    name: `千问 TTS ${items.length + 1}`,
    model: 'qwen-tts-realtime',
    voiceId: '',
    sampleRate: 24000,
    enabled: true,
    sortOrder: items.length,
  })
  providerEditorForm.voice.qwen = {
    realtimeProfiles: providerEditorForm.voice.qwen?.realtimeProfiles || [],
    asrProfiles: providerEditorForm.voice.qwen?.asrProfiles || [],
    ttsProfiles: items,
  }
}

function addCozeAgent(): void {
  const items = providerEditorForm.voice.coze?.agents || []
  items.push({
    id: `coze_agent_${items.length + 1}`,
    name: `Coze 智能体 ${items.length + 1}`,
    judgeType: 'custom',
    botId: providerEditorForm.voice.botId,
    connectorId: providerEditorForm.voice.connectorId,
    defaultVoiceId: providerEditorForm.voice.voiceId,
    enabled: true,
    sortOrder: items.length,
  })
  providerEditorForm.voice.coze = {
    agents: items,
    voices: providerEditorForm.voice.coze?.voices || [],
    roomConfig: providerEditorForm.voice.coze?.roomConfig || { createRoomOnServer: true, roomNamePrefix: 'WinLoop 答辩' },
  }
}

function addCozeVoice(): void {
  const items = providerEditorForm.voice.coze?.voices || []
  items.push({
    id: `coze_voice_${items.length + 1}`,
    name: `Coze 音色 ${items.length + 1}`,
    voiceId: providerEditorForm.voice.voiceId,
    style: '',
    enabled: true,
    sortOrder: items.length,
  })
  providerEditorForm.voice.coze = {
    agents: providerEditorForm.voice.coze?.agents || [],
    voices: items,
    roomConfig: providerEditorForm.voice.coze?.roomConfig || { createRoomOnServer: true, roomNamePrefix: 'WinLoop 答辩' },
  }
}

function removeQwenRealtimeProfile(index: number): void {
  providerEditorForm.voice.qwen?.realtimeProfiles.splice(index, 1)
}

function removeQwenAsrProfile(index: number): void {
  providerEditorForm.voice.qwen?.asrProfiles.splice(index, 1)
}

function removeQwenTtsProfile(index: number): void {
  providerEditorForm.voice.qwen?.ttsProfiles.splice(index, 1)
}

function removeCozeAgent(index: number): void {
  providerEditorForm.voice.coze?.agents.splice(index, 1)
}

function removeCozeVoice(index: number): void {
  providerEditorForm.voice.coze?.voices.splice(index, 1)
}

async function saveConsole() {
  saving.value = true
  consoleError.value = ''
  try {
    const payload = await requestApi<ProvidersPayload>(endpoint('/admin/ai/providers'), {
      method: 'PATCH',
      body: {
        providers: providers.value.map(item => buildProviderPayload(item)),
        scenes: {
          items: sceneItems.value.map((item) => {
            const providerIds = normalizeSceneProviderIds(item.providerIds, item.key)
            const normalizedRouting = normalizeSceneRoutingConfig(item, providerIds)
            return {
              key: item.key,
              label: item.label,
              description: item.description,
              enabled: item.enabled,
              providerIds,
              loadBalanceStrategy: item.loadBalanceStrategy,
              models: normalizedRouting.models,
              modelFallback: normalizedRouting.modelFallback,
              failoverStrategy: item.failoverStrategy,
              prompt: item.prompt,
            }
          }),
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
    const ignoredIds = payload.warnings?.ignoredProviderApiKeyIds || []
    if (ignoredIds.length > 0) {
      const warning = `当前未配置 master key，这些 Provider 的 API Key 替换未持久化：${ignoredIds.join(', ')}`
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

function nextProviderId(): string {
  let index = providers.value.length + 1
  while (providers.value.some(item => item.id === `provider_${index}`))
    index += 1
  return `provider_${index}`
}

function openCreateProviderDrawer() {
  providerEditorIsCreate.value = true
  Object.assign(providerEditorForm, createEmptyProviderDraft(), {
    id: nextProviderId(),
  })
  providerEditorTestMessage.value = ''
  providerPullMessage.value = ''
  providerEditorVisible.value = true
}

function openEditProviderDrawer(record: ProviderDraftItem) {
  providerEditorIsCreate.value = false
  Object.assign(providerEditorForm, cloneProviderItem(record))
  providerEditorTestMessage.value = ''
  providerPullMessage.value = ''
  providerEditorVisible.value = true
}

function closeProviderDrawer() {
  providerEditorVisible.value = false
}

function syncProviderType(type: ProviderType) {
  const previousType = providerEditorForm.type
  providerEditorForm.type = type
  providerEditorForm.capability = resolveProviderCapability(type, providerEditorForm.capability)
  const previousProviderDefault = previousType === 'coze-voice' ? 'coze' : previousType
  const nextProviderDefault = type === 'coze-voice' ? 'coze' : type
  if (!providerEditorForm.provider || providerEditorForm.provider === previousType || providerEditorForm.provider === previousProviderDefault)
    providerEditorForm.provider = nextProviderDefault
  if (type === 'coze-voice' && !providerEditorForm.baseURL)
    providerEditorForm.baseURL = 'https://api.coze.cn'
  if (!providerEditorForm.voice)
    providerEditorForm.voice = createEmptyProviderDraft().voice
  if (!providerCapabilitySupportsModels(providerEditorForm.capability)) {
    providerEditorForm.models = []
  }
  if (providerCapabilitySupportsModels(providerEditorForm.capability))
    providerEditorForm.models = providerEditorForm.models.map(item => normalizeModelItem(item, type))
}

function handleProviderTypeChange(value: string | number | boolean | Record<string, unknown> | undefined) {
  syncProviderType(String(value || '').trim() as ProviderType)
}

function handleProviderCapabilityChange(value: string | number | boolean | Record<string, unknown> | undefined) {
  providerEditorForm.capability = resolveProviderCapability(providerEditorForm.type, value)
  if (!providerCapabilitySupportsModels(providerEditorForm.capability))
    providerEditorForm.models = []
}

function handleSceneProviderIdsChange(value: string | number | boolean | Array<string | number> | undefined) {
  const values = Array.isArray(value) ? value.map(item => String(item || '').trim()) : []
  const providerIds = normalizeSceneProviderIds(values, sceneEditorForm.key)
  const normalizedRouting = normalizeSceneRoutingConfig(sceneEditorForm, providerIds)
  sceneEditorForm.providerIds = providerIds
  sceneEditorForm.models = normalizedRouting.models
  sceneEditorForm.modelFallback = normalizedRouting.modelFallback
}

function handleSceneModelsChange(value: string | number | boolean | Array<string | number> | undefined) {
  const values = Array.isArray(value) ? value.map(item => String(item || '').trim()) : []
  const previousModels = new Set(sceneEditorForm.models)
  const models = normalizeSceneModels(values, sceneEditorForm.providerIds, sceneRequiredCapability(sceneEditorForm.key), sceneEmbeddingApiStyleFilter(sceneEditorForm.key))
  const modelSet = new Set(models)
  const modelFallback = sceneEditorForm.modelFallback.filter(item => modelSet.has(item))
  for (const model of models) {
    if (!previousModels.has(model) && !modelFallback.includes(model))
      modelFallback.push(model)
  }
  sceneEditorForm.models = models
  sceneEditorForm.modelFallback = modelFallback
}

function handleSceneModelFallbackChange(value: string | number | boolean | Array<string | number> | undefined) {
  const values = Array.isArray(value) ? value.map(item => String(item || '').trim()) : []
  const modelSet = new Set(sceneEditorForm.models)
  sceneEditorForm.modelFallback = dedupeStrings(values).filter(item => modelSet.has(item))
}

function handleSceneBatchProviderIdsChange(value: string | number | boolean | Array<string | number> | undefined) {
  const values = Array.isArray(value) ? value.map(item => String(item || '').trim()) : []
  const providerIds = normalizeSceneProviderIds(values)
  sceneBatchForm.providerIds = providerIds
  const normalizedRouting = normalizeSceneBatchRoutingConfig(sceneBatchForm)
  sceneBatchForm.models = normalizedRouting.models
  sceneBatchForm.modelFallback = normalizedRouting.modelFallback
}

function handleSceneBatchModelsChange(value: string | number | boolean | Array<string | number> | undefined) {
  const values = Array.isArray(value) ? value.map(item => String(item || '').trim()) : []
  const previousModels = new Set(sceneBatchForm.models)
  const models = normalizeSceneBatchModels(values, sceneBatchForm.providerIds)
  const modelSet = new Set(models)
  const modelFallback = sceneBatchForm.modelFallback.filter(item => modelSet.has(item))
  for (const model of models) {
    if (!previousModels.has(model) && !modelFallback.includes(model))
      modelFallback.push(model)
  }
  sceneBatchForm.models = models
  sceneBatchForm.modelFallback = modelFallback
}

function handleSceneBatchModelFallbackChange(value: string | number | boolean | Array<string | number> | undefined) {
  const values = Array.isArray(value) ? value.map(item => String(item || '').trim()) : []
  const modelSet = new Set(sceneBatchForm.models)
  sceneBatchForm.modelFallback = dedupeStrings(values).filter(item => modelSet.has(item))
}

function saveProviderDrawer() {
  const normalized = normalizeProviderDraft({
    ...providerEditorForm,
    apiKeyMode: resolveProviderApiKeyMode(providerEditorForm),
  })
  const next = [...providers.value]
  const index = next.findIndex(item => item.id === normalized.id)
  if (index >= 0)
    next.splice(index, 1, normalized)
  else
    next.push(normalized)
  providers.value = next.map(item => normalizeProviderDraft(item))
  providerEditorVisible.value = false
}

function removeProvider(providerId: string) {
  providers.value = providers.value.filter(item => item.id !== providerId)
  sceneItems.value = sceneItems.value.map((scene) => {
    const providerIds = scene.providerIds.filter(id => id !== providerId)
    const normalizedRouting = normalizeSceneRoutingConfig(scene, providerIds)
    return {
      ...scene,
      providerIds,
      models: normalizedRouting.models,
      modelFallback: normalizedRouting.modelFallback,
    }
  })
}

function openCreateModelDrawer() {
  modelEditorIsCreate.value = true
  Object.assign(modelEditorForm, {
    model: '',
    label: '',
    format: 'openai-compatible',
    capabilities: ['chat'],
    clientType: 'langchain',
    embeddingApiStyle: 'openai-compatible-text',
    embeddingDimensions: 1024,
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
  } satisfies ProviderModelItem)
  modelEditorVisible.value = true
}

function openEditModelDrawer(record: ProviderModelItem) {
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
    capabilities: normalizeModelCapabilities(modelEditorForm.capabilities, inferModelCapabilities(model, modelEditorForm.label)),
    clientType: 'langchain',
    format: sanitizeModelFormatForProvider(providerEditorForm.type, modelEditorForm.format),
  })
  if (providerEditorForm.type === 'dashscope-bailian' && modelEditorForm.format === 'response') {
    Message.warning('百炼 DashScope 当前仅支持 openai-compatible 格式，已自动改为 openai-compatible。')
  }
  const nextItems = [...providerEditorForm.models]
  const existingIndex = nextItems.findIndex(item => item.model === model)
  if (existingIndex >= 0)
    nextItems.splice(existingIndex, 1, nextItem)
  else
    nextItems.push(nextItem)
  providerEditorForm.models = nextItems.sort((a, b) => a.model.localeCompare(b.model, 'en'))
  modelEditorVisible.value = false
}

function removeProviderModel(model: string) {
  providerEditorForm.models = providerEditorForm.models.filter(item => item.model !== model)
}

function clearProviderModelPoolDraft() {
  providerEditorForm.models = []
  providerPullMessage.value = '已清空当前 Provider 的模型池草稿，请确认后保存。'
  Message.success(providerPullMessage.value)
}

function setSelectedPulledModels(models: string[]) {
  selectedPulledModels.value = dedupeStrings(models)
}

function openModelPullSelector(payload: ProviderModelsPayload) {
  pulledProviderModels.value = [...(payload.items || [])]
    .map(item => normalizePullItem(item))
    .filter(item => item.model)
    .sort((a, b) => a.model.localeCompare(b.model, 'en'))
  pulledProviderFetchedAt.value = payload.fetchedAt || ''
  pulledProviderMeta.providerId = payload.providerId || providerEditorForm.id
  pulledProviderMeta.providerName = payload.providerName || providerEditorForm.name
  pulledProviderMeta.provider = payload.provider || providerEditorForm.provider
  pulledProviderMeta.baseURL = payload.baseURL || providerEditorForm.baseURL
  pulledProviderMeta.endpoint = payload.endpoint || pulledProviderModels.value[0]?.sourceEndpoint || ''
  pulledProviderMeta.nativeEmbeddingEndpoint = payload.nativeEmbeddingEndpoint || ''
  modelPullFilterKeyword.value = ''
  modelPullCapabilityFilter.value = 'all'
  setSelectedPulledModels(pulledProviderModels.value.map(item => item.model))
  expandedModelPullSeriesKeys.value = []
  modelPullSelectorVisible.value = true
}

function closeModelPullSelector() {
  modelPullFilterKeyword.value = ''
  modelPullCapabilityFilter.value = 'all'
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
  const next = new Set(selectedPulledModels.value)
  for (const item of filteredPulledModels.value) {
    if (checked)
      next.add(item.model)
    else
      next.delete(item.model)
  }
  setSelectedPulledModels(Array.from(next))
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
  providerEditorForm.models = mergePulledModels(providerEditorForm.models, selectedItems)
  providerEditorForm.fetchedAt = pulledProviderFetchedAt.value || providerEditorForm.fetchedAt
  modelPullSelectorVisible.value = false
  providerPullMessage.value = `已导入 ${selectedItems.length} 个模型，请确认后保存 Provider。`
  Message.success(providerPullMessage.value)
}

async function pullProviderModels() {
  if (!providerEditorSupportsModels.value) {
    Message.warning('当前 Provider 类型不支持模型池。')
    return
  }
  providerPullLoading.value = true
  providerPullMessage.value = ''
  try {
    const data = await requestApi<ProviderModelsPayload>(
      endpoint('/admin/ai/provider-models'),
      {
        method: 'POST',
        body: {
          providerId: providerEditorForm.id,
          draftProvider: buildProviderPayload(providerEditorForm),
          apiKeyMode: resolveProviderApiKeyMode(providerEditorForm),
          apiKey: providerEditorForm.apiKey,
        },
      },
      '模型拉取失败。',
    )
    if ((data.items || []).length === 0) {
      providerPullMessage.value = '未拉取到可导入模型。'
      Message.warning(providerPullMessage.value)
      return
    }
    openModelPullSelector(data)
    providerPullMessage.value = `已拉取 ${data.items?.length || 0} 个候选模型，请在弹框中选择后导入。`
  }
  catch (error: any) {
    const message = normalizeError(error, '模型拉取失败。')
    providerPullMessage.value = message
    Message.error(message)
  }
  finally {
    providerPullLoading.value = false
  }
}

async function testProvider() {
  if (!providerEditorCanRunProviderTest.value) {
    Message.warning('当前 Provider 类型不支持连通性测试。')
    return
  }
  providerEditorTestLoading.value = true
  providerEditorTestMessage.value = ''
  try {
    const targetCapability: ModelCapability = providerEditorCanRunTtsTest.value ? 'tts' : 'chat'
    const testModel = providerEditorForm.models.find(item => item.enabled && modelHasCapability(item, targetCapability))?.model || ''
    if (providerEditorCanRunChatTest.value && !testModel) {
      Message.warning('当前 Provider 没有可用于聊天连通性测试的模型。')
      return
    }
    if (providerEditorCanRunTtsTest.value && !testModel) {
      Message.warning('当前 Provider 没有可用于 TTS 连通性测试的模型。')
      return
    }
    const data = await requestApi<{
      providerId: string
      provider: string
      model: string
      responsePreview: string
      latencyMs: number
    }>(endpoint('/admin/ai/providers/test'), {
      method: 'POST',
      body: {
        providerId: providerEditorForm.id,
        draftProvider: buildProviderPayload(providerEditorForm),
        apiKeyMode: resolveProviderApiKeyMode(providerEditorForm),
        apiKey: providerEditorForm.apiKey,
        model: testModel,
      },
    }, 'Provider 测试失败。')
    providerEditorTestMessage.value = data.model
      ? `${data.provider} / ${data.model} · ${data.responsePreview}`
      : `${data.provider} · ${data.responsePreview}`
    Message.success('Provider 连通性测试成功。')
  }
  catch (error: any) {
    const message = normalizeError(error, 'Provider 测试失败。')
    providerEditorTestMessage.value = message
    Message.error(message)
  }
  finally {
    providerEditorTestLoading.value = false
  }
}

function openSceneDrawer(record: SceneItem) {
  sceneEditorForm.key = record.key
  sceneEditorForm.label = record.label
  sceneEditorForm.description = record.description
  sceneEditorForm.enabled = Boolean(record.enabled)
  sceneEditorForm.providerIds = normalizeSceneProviderIds(record.providerIds || [], record.key)
  sceneEditorForm.loadBalanceStrategy = record.loadBalanceStrategy || 'round_robin'
  sceneEditorForm.models = dedupeStrings(record.models || record.modelFallback || [])
  sceneEditorForm.modelFallback = dedupeStrings(record.modelFallback || [])
  sceneEditorForm.failoverStrategy = record.failoverStrategy || 'model_then_provider'
  sceneEditorForm.prompt = String(record.prompt || '')
  sceneEditorVisible.value = true
}

function closeSceneDrawer() {
  sceneEditorVisible.value = false
}

function saveSceneDrawer() {
  const index = sceneItems.value.findIndex(item => item.key === sceneEditorForm.key)
  if (index < 0)
    return
  const providerIds = normalizeSceneProviderIds(sceneEditorForm.providerIds, sceneEditorForm.key)
  const normalizedRouting = normalizeSceneRoutingConfig(sceneEditorForm, providerIds)
  const next = [...sceneItems.value]
  next.splice(index, 1, {
    key: sceneEditorForm.key,
    label: sceneEditorForm.label,
    description: sceneEditorForm.description,
    enabled: Boolean(sceneEditorForm.enabled),
    providerIds,
    loadBalanceStrategy: sceneEditorForm.loadBalanceStrategy,
    models: normalizedRouting.models,
    modelFallback: normalizedRouting.modelFallback,
    failoverStrategy: sceneEditorForm.failoverStrategy,
    prompt: String(sceneEditorForm.prompt || ''),
  })
  sceneItems.value = next
  sceneEditorVisible.value = false
}

function openSceneBatchDrawer() {
  const mostUsedProviderIds = dedupeStrings(sceneItems.value.flatMap(item => item.providerIds || []))
  const mostUsedModels = dedupeStrings(sceneItems.value.flatMap(item => item.models || item.modelFallback || []))
  const mostUsedFallback = dedupeStrings(sceneItems.value.flatMap(item => item.modelFallback || []))
  sceneBatchForm.providerIds = mostUsedProviderIds
  sceneBatchForm.loadBalanceStrategy = 'round_robin'
  sceneBatchForm.models = mostUsedModels
  sceneBatchForm.modelFallback = mostUsedFallback
  sceneBatchForm.failoverStrategy = 'model_then_provider'
  sceneBatchEditorVisible.value = true
}

function closeSceneBatchDrawer() {
  sceneBatchEditorVisible.value = false
}

function applySceneBatchConfig() {
  const normalizedBatch = normalizeSceneBatchRoutingConfig(sceneBatchForm)
  sceneItems.value = sceneItems.value.map((item) => {
    const providerIds = normalizeSceneProviderIds(sceneBatchForm.providerIds, item.key)
    const normalizedRouting = normalizeSceneRoutingConfig({
      key: item.key,
      models: normalizedBatch.models,
      modelFallback: normalizedBatch.modelFallback,
    }, providerIds)
    return {
      ...item,
      providerIds,
      loadBalanceStrategy: sceneBatchForm.loadBalanceStrategy,
      models: normalizedRouting.models,
      modelFallback: normalizedRouting.modelFallback,
      failoverStrategy: sceneBatchForm.failoverStrategy,
    }
  })
  sceneBatchEditorVisible.value = false
  Message.success(`已为 ${sceneItems.value.length} 个场景应用统一 Provider、模型池与故障转移策略。`)
}

function applyCurrentSceneConfigToAll() {
  sceneItems.value = sceneItems.value.map((item) => {
    const providerIds = normalizeSceneProviderIds(sceneEditorForm.providerIds, item.key)
    const normalizedRouting = normalizeSceneRoutingConfig({
      key: item.key,
      models: sceneEditorForm.models,
      modelFallback: sceneEditorForm.modelFallback,
    }, providerIds)
    return {
      ...item,
      providerIds,
      loadBalanceStrategy: sceneEditorForm.loadBalanceStrategy,
      models: normalizedRouting.models,
      modelFallback: normalizedRouting.modelFallback,
      failoverStrategy: sceneEditorForm.failoverStrategy,
    }
  })
  Message.success(`已将「${sceneEditorForm.label}」的 Provider 绑定、模型池与故障转移策略复制到全部场景。`)
}

async function testScene(scene: SceneItem) {
  if (!sceneCanRunChatTest(scene)) {
    Message.info(`${modelCapabilityLabel(sceneRequiredCapability(scene.key))} 场景只配置模型路由，无需执行对话测试。`)
    return
  }
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
      .map(item => `${item.provider}/${item.model || 'coze-voice'}${item.success ? '' : '(failed)'}`)
      .join(' -> ')
    sceneTestMessage[scene.key] = `${data.provider} / ${data.model || 'coze-voice'}${data.fallbackUsed ? ' · 已回退' : ''} · ${chainText || data.responsePreview}`
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
  <div class="ai-prompts-page min-w-0 w-full space-y-4">
    <a-tabs v-model:active-key="activeTab" type="rounded">
      <a-tab-pane v-for="tab in tabOptions" :key="tab.key" :title="tab.label" />
    </a-tabs>

    <div v-if="activeTab === 'channel_models'" class="space-y-4">
      <a-alert v-if="consoleError" type="error" :show-icon="true">
        {{ consoleError }}
      </a-alert>

      <a-spin :loading="consoleLoading || saving" class="w-full block">
        <a-card :bordered="false" class="rounded-3xl shadow-sm">
          <template #title>
            <div class="flex flex-wrap gap-4 items-center justify-between">
              <div>
                <div class="text-base font-semibold">
                  Provider 列表
                </div>
                <div class="text-xs text-slate-500">
                  每个 Provider 独立维护类型、密钥、模型池，以及搜索或 AI 能力配置。
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <a-button @click="openCreateProviderDrawer">
                  新增 Provider
                </a-button>
                <a-button type="primary" :loading="saving" @click="saveConsole">
                  保存配置
                </a-button>
              </div>
            </div>
          </template>

          <a-table :data="providerRows" :pagination="false" row-key="id">
            <template #columns>
              <a-table-column title="Provider" data-index="name" :width="260">
                <template #cell="scope">
                  <div class="space-y-1">
                    <div class="text-slate-900 font-medium">
                      {{ scope.record.name }}
                    </div>
                    <div class="text-xs text-slate-500">
                      {{ scope.record.provider || scope.record.type }}
                    </div>
                  </div>
                </template>
              </a-table-column>
              <a-table-column title="类型" data-index="type" :width="180">
                <template #cell="scope">
                  <div class="space-y-1">
                    <a-tag>{{ normalizeProviderTypeLabel(scope.record.type) }}</a-tag>
                    <div class="text-xs text-slate-500">
                      {{ providerCapabilityLabel(scope.record.capability) }}
                    </div>
                  </div>
                </template>
              </a-table-column>
              <a-table-column title="连接" data-index="baseURL">
                <template #cell="scope">
                  <div class="space-y-1">
                    <div class="text-sm text-slate-700 break-all">
                      {{ scope.record.baseURL || '-' }}
                    </div>
                    <div class="text-xs text-slate-500">
                      {{ providerSummary(scope.record) }}
                    </div>
                  </div>
                </template>
              </a-table-column>
              <a-table-column title="状态" data-index="enabled" :width="120">
                <template #cell="scope">
                  <a-tag :color="scope.record.enabled ? 'green' : 'gray'">
                    {{ scope.record.enabled ? 'enabled' : 'disabled' }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="操作" data-index="providerActions" :width="180">
                <template #cell="scope">
                  <div class="flex gap-2">
                    <a-button size="mini" @click="openEditProviderDrawer(scope.record)">
                      编辑
                    </a-button>
                    <a-popconfirm
                      content="确认删除该 Provider 吗？删除后会同步从所有已绑定场景中移除；需要点击“保存配置”后才会持久化。"
                      type="warning"
                      @ok="removeProvider(scope.record.id)"
                    >
                      <a-button size="mini" status="danger">
                        删除
                      </a-button>
                    </a-popconfirm>
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

      <a-alert type="info" :show-icon="true">
        每个场景都只看自身绑定的 Provider、模型池和回退顺序；留空就表示该场景未接通，不再共享兜底。
      </a-alert>

      <a-card :bordered="false" class="rounded-3xl shadow-sm">
        <template #title>
          <div class="flex flex-wrap gap-4 items-center justify-between">
            <div>
              <div class="text-base font-semibold">
                场景路由
              </div>
              <div class="text-xs text-slate-500">
                每个场景独立维护 Provider 绑定、模型池、回退顺序和故障转移策略；只有显式绑定的模型才会参与运行。
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <a-button @click="openSceneBatchDrawer">
                一键设置全部场景
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
                  <div class="flex flex-wrap gap-2 items-center">
                    <div class="text-slate-900 font-medium">
                      {{ scope.record.label }}
                    </div>
                    <a-tag size="small" color="gray">
                      ID: {{ scope.record.key }}
                    </a-tag>
                    <a-tag v-if="sceneUsageHint(scope.record)" :color="sceneUsageHintColor(scope.record)">
                      {{ sceneUsageHint(scope.record) }}
                    </a-tag>
                    <a-tag size="small" :color="modelCapabilityColor(sceneRequiredCapability(scope.record.key))">
                      {{ modelCapabilityLabel(sceneRequiredCapability(scope.record.key)) }}
                    </a-tag>
                  </div>
                  <div class="text-xs text-slate-500">
                    {{ scope.record.description }}
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="Provider 绑定" data-index="providerIds" :width="240">
              <template #cell="scope">
                <div class="text-sm text-slate-700">
                  {{ sceneProvidersPreview(scope.record) }}
                </div>
              </template>
            </a-table-column>
            <a-table-column title="模型策略" data-index="modelFallback">
              <template #cell="scope">
                <div class="space-y-1.5">
                  <div class="text-sm text-slate-700">
                    模型池：{{ sceneModelPoolPreview(scope.record) }}
                  </div>
                  <div class="text-xs text-slate-500">
                    回退顺序：{{ sceneFallbackPreview(scope.record) }}
                  </div>
                  <div class="text-xs text-slate-500">
                    故障转移：{{ sceneFailoverStrategyLabel(scope.record) }}
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
                  <a-button size="mini" :disabled="!sceneCanRunChatTest(scope.record)" :loading="sceneTesting[scope.record.key]" @click="testScene(scope.record)">
                    {{ sceneCanRunChatTest(scope.record) ? '测试' : '无需测试' }}
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

    <a-drawer
      v-model:visible="providerEditorVisible"
      :title="providerEditorIsCreate ? '新增 Provider' : `编辑 Provider · ${providerEditorForm.name || providerEditorForm.id}`"
      width="min(1120px, calc(100vw - 32px))"
      unmount-on-close
    >
      <div class="pr-2 max-h-[calc(100vh-132px)] overflow-y-auto">
        <div class="gap-4 grid">
          <a-alert v-if="!configMasterKeyReady" type="warning" :show-icon="true">
            当前未配置 master key。你可以先用当前输入的 API Key 测试与拉取模型，但保存时不会持久化新密钥。
          </a-alert>
          <a-alert type="info" :show-icon="true">
            <div class="space-y-1">
              <div class="font-medium">
                {{ providerEditorTypeGuide.title }}
              </div>
              <div>{{ providerEditorTypeGuide.summary }}</div>
              <div class="text-xs text-slate-500">
                {{ providerEditorTypeGuide.baseURLHint }}
              </div>
            </div>
          </a-alert>

          <div class="px-4 py-4 border border-slate-200 rounded-lg bg-white space-y-3">
            <div>
              <div class="text-sm text-slate-900 font-medium">
                基础信息
              </div>
              <div class="text-xs text-slate-500">
                Provider 只保存连接身份；模型能力与接入细节在模型池里维护。
              </div>
            </div>
            <div class="gap-4 grid md:grid-cols-2">
              <a-form-item label="Provider 名称">
                <a-input v-model="providerEditorForm.name" placeholder="用于后台展示" />
              </a-form-item>
              <a-form-item label="Provider 类型">
                <a-select v-model="providerEditorForm.type" @change="handleProviderTypeChange">
                  <a-option v-for="item in providerTypeOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </a-option>
                </a-select>
              </a-form-item>
              <a-form-item label="Provider 能力">
                <div class="w-full space-y-1">
                  <a-select
                    v-model="providerEditorForm.capability"
                    :disabled="providerEditorCapabilityLocked"
                    class="w-full"
                    @change="handleProviderCapabilityChange"
                  >
                    <a-option
                      v-for="item in providerEditorCapabilityOptions"
                      :key="item.value"
                      :value="item.value"
                    >
                      {{ item.label }}
                    </a-option>
                  </a-select>
                  <div class="text-xs text-slate-500 leading-relaxed">
                    {{ providerCapabilityHint(providerEditorForm.capability) }}
                  </div>
                </div>
              </a-form-item>
              <a-form-item label="Provider 标识">
                <a-input v-model="providerEditorForm.provider" :placeholder="providerEditorTypeGuide.providerPlaceholder" />
              </a-form-item>
              <a-form-item label="启用">
                <a-switch v-model="providerEditorForm.enabled" />
              </a-form-item>
            </div>
          </div>

          <div class="px-4 py-4 border border-slate-200 rounded-lg bg-white space-y-3">
            <div>
              <div class="text-sm text-slate-900 font-medium">
                连接与密钥
              </div>
            </div>
            <a-alert type="info" :show-icon="true">
              <div class="text-xs leading-relaxed">
                {{ providerEditorTypeGuide.clientTypeHint }} {{ providerEditorTypeGuide.baseURLHint }}
              </div>
            </a-alert>
            <div class="gap-4 grid md:grid-cols-2">
              <a-form-item label="Base URL">
                <a-input v-model="providerEditorForm.baseURL" :placeholder="providerEditorTypeGuide.baseURLPlaceholder" />
              </a-form-item>
              <a-form-item label="API Key">
                <div class="w-full space-y-1">
                  <a-input-password
                    v-model="providerEditorForm.apiKey"
                    :placeholder="providerEditorTypeGuide.apiKeyPlaceholder"
                    autocomplete="new-password"
                    allow-clear
                  />
                  <div class="text-xs text-slate-500 leading-relaxed">
                    {{ providerEditorTypeGuide.apiKeyHint }}
                  </div>
                </div>
              </a-form-item>
              <a-form-item label="超时(ms)">
                <a-input-number v-model="providerEditorForm.timeoutMs" :min="1000" :step="1000" class="w-full" />
              </a-form-item>
              <a-form-item label="重试次数">
                <a-input-number v-model="providerEditorForm.maxRetries" :min="0" :max="10" class="w-full" />
              </a-form-item>
            </div>
          </div>

          <div v-if="providerEditorForm.capability === 'voice' || providerEditorForm.capability === 'realtime'" class="px-4 py-4 border border-slate-200 rounded-lg bg-white space-y-4">
            <div>
              <div class="text-sm text-slate-900 font-medium">
                实时语音视频能力
              </div>
              <div class="text-xs text-slate-500">
                同一 Provider 可配置 Qwen 实时音视频、ASR、TTS，也可配置 Coze 多智能体和音色。旧 botId / connectorId / voiceId 仍作为兼容默认值。
              </div>
            </div>
            <div class="gap-4 grid md:grid-cols-2">
              <a-form-item label="Bot ID">
                <a-input v-model="providerEditorForm.voice.botId" placeholder="Coze botId" />
              </a-form-item>
              <a-form-item label="Connector ID">
                <a-input v-model="providerEditorForm.voice.connectorId" placeholder="Coze connectorId" />
              </a-form-item>
              <a-form-item label="Voice ID">
                <a-input v-model="providerEditorForm.voice.voiceId" placeholder="Coze voiceId" />
              </a-form-item>
              <a-form-item label="Token 类型">
                <a-select v-model="providerEditorForm.voice.authMode">
                  <a-option value="pat">
                    PAT
                  </a-option>
                  <a-option value="oauth">
                    OAuth
                  </a-option>
                </a-select>
              </a-form-item>
            </div>

            <div class="px-4 py-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
              <div class="flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <div class="text-sm text-slate-900 font-medium">
                    Qwen Realtime / ASR / TTS
                  </div>
                  <div class="text-xs text-slate-500">
                    用于千问实时音视频、实时语音识别和语音合成。Base URL 仍使用百炼根地址，实时 WebSocket 可按 profile 覆盖。
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <a-button size="small" @click="addQwenRealtimeProfile">
                    新增 Realtime
                  </a-button>
                  <a-button size="small" @click="addQwenAsrProfile">
                    新增 ASR
                  </a-button>
                  <a-button size="small" @click="addQwenTtsProfile">
                    新增 TTS
                  </a-button>
                </div>
              </div>

              <div v-for="(profile, index) in providerEditorForm.voice.qwen?.realtimeProfiles || []" :key="profile.id" class="p-3 border border-slate-200 rounded-lg bg-white space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <strong class="text-sm text-slate-900">Realtime Profile</strong>
                  <a-button size="mini" status="danger" @click="removeQwenRealtimeProfile(index)">
                    删除
                  </a-button>
                </div>
                <div class="gap-3 grid md:grid-cols-3">
                  <a-input v-model="profile.name" placeholder="名称" />
                  <a-input v-model="profile.model" placeholder="qwen3.5-omni-plus-realtime" />
                  <a-input v-model="profile.baseWsUrl" placeholder="Realtime WebSocket URL" />
                  <a-input v-model="profile.workspaceId" placeholder="Workspace ID" />
                  <a-input v-model="profile.appId" placeholder="App ID" />
                  <a-input v-model="profile.defaultVoiceId" placeholder="默认音色 ID" />
                  <a-input v-model="profile.asrProfileId" placeholder="ASR Profile ID" />
                  <a-input v-model="profile.ttsProfileId" placeholder="TTS Profile ID" />
                  <a-select v-model="profile.vadMode">
                    <a-option value="server_vad">server_vad</a-option>
                    <a-option value="semantic_vad">semantic_vad</a-option>
                    <a-option value="manual">manual</a-option>
                  </a-select>
                  <a-input-number v-model="profile.frameIntervalMs" :min="250" :max="5000" :step="250" class="w-full" placeholder="视频帧间隔 ms" />
                  <a-switch v-model="profile.enabled" />
                </div>
              </div>

              <div v-for="(profile, index) in providerEditorForm.voice.qwen?.asrProfiles || []" :key="profile.id" class="p-3 border border-slate-200 rounded-lg bg-white space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <strong class="text-sm text-slate-900">ASR Profile</strong>
                  <a-button size="mini" status="danger" @click="removeQwenAsrProfile(index)">
                    删除
                  </a-button>
                </div>
                <div class="gap-3 grid md:grid-cols-4">
                  <a-input v-model="profile.name" placeholder="名称" />
                  <a-input v-model="profile.model" placeholder="qwen3-asr-flash-realtime" />
                  <a-input v-model="profile.language" placeholder="zh-CN" />
                  <a-switch v-model="profile.enabled" />
                </div>
              </div>

              <div v-for="(profile, index) in providerEditorForm.voice.qwen?.ttsProfiles || []" :key="profile.id" class="p-3 border border-slate-200 rounded-lg bg-white space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <strong class="text-sm text-slate-900">TTS Profile</strong>
                  <a-button size="mini" status="danger" @click="removeQwenTtsProfile(index)">
                    删除
                  </a-button>
                </div>
                <div class="gap-3 grid md:grid-cols-5">
                  <a-input v-model="profile.name" placeholder="名称" />
                  <a-input v-model="profile.model" placeholder="qwen-tts-realtime" />
                  <a-input v-model="profile.voiceId" placeholder="音色 ID" />
                  <a-input-number v-model="profile.sampleRate" :min="8000" :max="48000" :step="1000" class="w-full" />
                  <a-switch v-model="profile.enabled" />
                </div>
              </div>
            </div>

            <div class="px-4 py-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
              <div class="flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <div class="text-sm text-slate-900 font-medium">
                    Coze 智能体 / 音色 / 房间
                  </div>
                  <div class="text-xs text-slate-500">
                    按评委角色配置多个 Bot，发起答辩时用户可调整每个评委的智能体和音色。
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <a-button size="small" @click="addCozeAgent">
                    新增智能体
                  </a-button>
                  <a-button size="small" @click="addCozeVoice">
                    新增音色
                  </a-button>
                </div>
              </div>
              <div class="gap-3 grid md:grid-cols-2">
                <a-form-item label="服务端创建房间">
                  <a-switch v-model="providerEditorForm.voice.coze.roomConfig.createRoomOnServer" />
                </a-form-item>
                <a-form-item label="房间名前缀">
                  <a-input v-model="providerEditorForm.voice.coze.roomConfig.roomNamePrefix" placeholder="WinLoop 答辩" />
                </a-form-item>
              </div>
              <div v-for="(agent, index) in providerEditorForm.voice.coze?.agents || []" :key="agent.id" class="p-3 border border-slate-200 rounded-lg bg-white space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <strong class="text-sm text-slate-900">Coze 智能体</strong>
                  <a-button size="mini" status="danger" @click="removeCozeAgent(index)">
                    删除
                  </a-button>
                </div>
                <div class="gap-3 grid md:grid-cols-4">
                  <a-input v-model="agent.name" placeholder="名称" />
                  <a-select v-model="agent.judgeType">
                    <a-option value="technical">技术评委</a-option>
                    <a-option value="business">业务评委</a-option>
                    <a-option value="expression">表达评委</a-option>
                    <a-option value="custom">自定义评委</a-option>
                  </a-select>
                  <a-input v-model="agent.botId" placeholder="Bot ID" />
                  <a-input v-model="agent.connectorId" placeholder="Connector ID" />
                  <a-input v-model="agent.defaultVoiceId" placeholder="默认音色 ID" />
                  <a-switch v-model="agent.enabled" />
                </div>
              </div>
              <div v-for="(voice, index) in providerEditorForm.voice.coze?.voices || []" :key="voice.id" class="p-3 border border-slate-200 rounded-lg bg-white space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <strong class="text-sm text-slate-900">Coze 音色</strong>
                  <a-button size="mini" status="danger" @click="removeCozeVoice(index)">
                    删除
                  </a-button>
                </div>
                <div class="gap-3 grid md:grid-cols-4">
                  <a-input v-model="voice.name" placeholder="名称" />
                  <a-input v-model="voice.voiceId" placeholder="Voice ID" />
                  <a-input v-model="voice.style" placeholder="风格" />
                  <a-switch v-model="voice.enabled" />
                </div>
              </div>
            </div>

            <div class="px-4 py-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
              <div>
                <div class="text-sm text-slate-900 font-medium">
                  扣点策略
                </div>
                <div class="text-xs text-slate-500">
                  按 Provider 维护倍率，不把官方价格写死到业务逻辑。
                </div>
              </div>
              <div class="gap-3 grid md:grid-cols-4">
                <a-form-item label="启动扣点">
                  <a-input-number v-model="providerEditorForm.voice.billing.realtimeStartupUnits" :min="0" class="w-full" />
                </a-form-item>
                <a-form-item label="实时每分钟">
                  <a-input-number v-model="providerEditorForm.voice.billing.realtimeUnitsPerMinute" :min="0" class="w-full" />
                </a-form-item>
                <a-form-item label="ASR 每分钟">
                  <a-input-number v-model="providerEditorForm.voice.billing.asrUnitsPerMinute" :min="0" class="w-full" />
                </a-form-item>
                <a-form-item label="TTS 每千字">
                  <a-input-number v-model="providerEditorForm.voice.billing.ttsUnitsPer1KChars" :min="0" class="w-full" />
                </a-form-item>
                <a-form-item label="视频倍率">
                  <a-input-number v-model="providerEditorForm.voice.billing.videoFrameMultiplier" :min="1" :step="0.1" class="w-full" />
                </a-form-item>
                <a-form-item label="Provider 加价">
                  <a-input-number v-model="providerEditorForm.voice.billing.providerMarkupMultiplier" :min="1" :step="0.1" class="w-full" />
                </a-form-item>
                <a-form-item label="按评委数倍率">
                  <a-switch v-model="providerEditorForm.voice.billing.judgeMultiplierEnabled" />
                </a-form-item>
              </div>
            </div>
          </div>

          <div class="text-sm text-slate-500 flex flex-wrap gap-3 items-center">
            <span>能力：{{ providerCapabilityLabel(providerEditorForm.capability) }}</span>
            <span v-if="providerEditorSupportsModels">模型池拉取时间：{{ formatTime(providerEditorForm.fetchedAt) }}</span>
            <span v-if="providerEditorSupportsModels">当前模型数：{{ providerEditorForm.models.length }}</span>
            <span v-else>模型池：无需配置</span>
            <span>API Key：{{ providerEditorForm.apiKeyConfigured ? '已配置' : '未配置' }}</span>
          </div>

          <div class="flex flex-wrap gap-2">
            <a-button :loading="providerEditorTestLoading" :disabled="!providerEditorCanRunProviderTest" @click="testProvider">
              测试 Provider
            </a-button>
            <a-button :loading="providerPullLoading" :disabled="!providerEditorSupportsModels" @click="pullProviderModels">
              拉取模型
            </a-button>
          </div>

          <div v-if="providerEditorTestMessage" class="text-sm text-slate-600 px-4 py-3 rounded-2xl bg-slate-50">
            {{ providerEditorTestMessage }}
          </div>
          <div v-if="providerPullMessage" class="text-sm text-slate-600 px-4 py-3 rounded-2xl bg-slate-50">
            {{ providerPullMessage }}
          </div>

          <template v-if="providerEditorSupportsModels">
            <div class="px-4 py-4 border border-slate-200 rounded-2xl bg-slate-50 space-y-3">
              <div class="flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <div class="text-sm text-slate-900 font-medium">
                    Provider 模型池
                  </div>
                  <div class="text-xs text-slate-500">
                    每个可承载模型的 Provider 维护自己的模型池、能力标签、接入参数与价格覆盖。
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <a-button size="small" @click="openCreateModelDrawer">
                    新增模型
                  </a-button>
                  <a-popconfirm
                    content="确认清空当前 Provider 的模型池草稿吗？只有保存 Provider 后才会持久化。"
                    type="warning"
                    @ok="clearProviderModelPoolDraft"
                  >
                    <a-button size="small" status="danger" :disabled="providerEditorForm.models.length === 0">
                      清空模型池
                    </a-button>
                  </a-popconfirm>
                </div>
              </div>

              <a-table :data="providerEditorModelRows" :pagination="false" row-key="model">
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
                  <a-table-column title="能力" data-index="capabilities" :width="220">
                    <template #cell="scope">
                      <div class="flex flex-wrap gap-1">
                        <a-tag
                          v-for="capability in scope.record.capabilities"
                          :key="`${scope.record.model}-${capability}`"
                          :color="modelCapabilityColor(capability)"
                        >
                          {{ modelCapabilityLabel(capability) }}
                        </a-tag>
                      </div>
                    </template>
                  </a-table-column>
                  <a-table-column title="启用" data-index="enabled" :width="90">
                    <template #cell="scope">
                      <a-tag :color="scope.record.enabled ? 'green' : 'gray'">
                        {{ scope.record.enabled ? 'on' : 'off' }}
                      </a-tag>
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
                  <a-table-column title="操作" data-index="actions" :width="160">
                    <template #cell="scope">
                      <div class="flex gap-2">
                        <a-button size="mini" @click="openEditModelDrawer(scope.record)">
                          编辑
                        </a-button>
                        <a-button size="mini" status="danger" @click="removeProviderModel(scope.record.model)">
                          删除
                        </a-button>
                      </div>
                    </template>
                  </a-table-column>
                </template>
              </a-table>
            </div>
          </template>
          <a-alert v-else type="info" :show-icon="true">
            {{ providerEditorTypeGuide.summary }} {{ providerEditorTypeGuide.apiKeyHint }}
          </a-alert>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <a-button @click="closeProviderDrawer">
            取消
          </a-button>
          <a-button type="primary" @click="saveProviderDrawer">
            保存 Provider
          </a-button>
        </div>
      </template>
    </a-drawer>

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
            <div class="space-y-1">
              <div>
                当前 Provider：{{ pulledProviderMeta.providerName || pulledProviderMeta.providerId }} / {{ pulledProviderMeta.provider }}
              </div>
              <div class="text-xs">
                聊天 Base URL：{{ pulledProviderMeta.baseURL || '-' }}；模型列表端点：{{ pulledProviderMeta.endpoint || '-' }}
              </div>
              <div v-if="pulledProviderMeta.nativeEmbeddingEndpoint" class="text-xs">
                百炼多模态 Embedding 运行端点：{{ pulledProviderMeta.nativeEmbeddingEndpoint }}
              </div>
              <div class="text-xs">
                候选模型会按能力和系列分组展示，可按能力过滤、搜索模型名、展示名、能力标签或 Provider 原始字段。
              </div>
            </div>
          </a-alert>

          <div class="gap-3 grid md:grid-cols-[220px_1fr]">
            <a-select v-model="modelPullCapabilityFilter">
              <a-option v-for="item in modelPullCapabilityFilters" :key="item.value" :value="item.value">
                {{ item.label }}
              </a-option>
            </a-select>
            <a-input
              v-model="modelPullFilterKeyword"
              allow-clear
              placeholder="按模型名、展示名、能力或 Provider 原始字段筛选"
            />
          </div>

          <div class="px-4 py-3 rounded-2xl bg-slate-50 flex flex-wrap gap-3 items-center justify-between">
            <div class="text-sm text-slate-600 flex flex-wrap gap-3 items-center">
              <span>拉取时间：{{ formatTime(pulledProviderFetchedAt) }}</span>
              <span>候选模型：{{ pulledProviderModels.length }}</span>
              <span>筛选结果：{{ filteredPulledModelCount }}</span>
              <span>已选：{{ selectedPulledModelCount }}</span>
            </div>
            <div class="flex flex-wrap gap-3 items-center">
              <a-checkbox
                :model-value="allPulledModelsChecked"
                :indeterminate="allPulledModelsIndeterminate"
                @change="toggleAllPulledModels(Boolean($event))"
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
                  @change="togglePulledGroup(group.items, Boolean($event))"
                >
                  {{ group.label }}
                </a-checkbox>
                <a-tag color="arcoblue">
                  {{ group.items.length }} 个
                </a-tag>
                <a-tag v-if="group.capability !== 'other'" :color="modelCapabilityColor(group.capability)">
                  {{ modelCapabilityLabel(group.capability) }}
                </a-tag>
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
                  @change="togglePulledModel(item.model, Boolean($event))"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap gap-2 items-center">
                    <div class="text-sm text-slate-900 font-medium break-all">
                      {{ item.model }}
                    </div>
                    <a-tag :color="currentModelPoolNameSet.has(item.model) ? 'gold' : 'green'">
                      {{ currentModelPoolNameSet.has(item.model) ? '已在模型池' : '新模型' }}
                    </a-tag>
                    <a-tag
                      v-for="capability in item.capabilities"
                      :key="`${item.model}-pull-${capability}`"
                      :color="modelCapabilityColor(capability)"
                    >
                      {{ modelCapabilityLabel(capability) }}
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

          <a-alert v-if="pulledEmbeddingCandidateCount === 0" type="warning" :show-icon="true">
            未从该 Provider 拉取到 Embedding 模型，可手动新增 text-embedding-v4；百炼多模态可新增 tongyi-embedding-vision-plus 并选择“百炼原生多模态”。
          </a-alert>
          <a-empty v-if="filteredModelPullSeriesGroups.length === 0" description="没有匹配的模型" />
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <a-button @click="closeModelPullSelector">
            取消
          </a-button>
          <a-button type="primary" :disabled="selectedPulledModelCount === 0" @click="applyPulledModelSelection">
            导入选中模型
          </a-button>
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
          <a-form-item label="模型能力">
            <a-checkbox-group v-model="modelEditorForm.capabilities">
              <div class="flex flex-wrap gap-2">
                <a-checkbox v-for="item in modelCapabilityOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </a-checkbox>
              </div>
            </a-checkbox-group>
            <div class="text-xs text-slate-500 mt-1">
              场景绑定会按能力过滤：聊天场景只选择 chat 模型，知识库向量只选择 Embedding，视觉投影只选择 vision，ASR/TTS 场景只选择对应语音模型。
            </div>
          </a-form-item>
          <div v-if="modelEditorForm.capabilities.includes('chat')" class="px-4 py-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
            <div>
              <div class="text-sm text-slate-900 font-medium">
                聊天模型
              </div>
              <div class="text-xs text-slate-500">
                当前聊天接入固定使用 LangChain；百炼走 @langchain/openai + compatible-mode/v1。
              </div>
            </div>
            <a-form-item label="格式">
              <a-select v-model="modelEditorForm.format">
                <a-option value="openai-compatible">
                  openai-compatible
                </a-option>
                <a-option v-if="providerEditorForm.type !== 'dashscope-bailian'" value="response">
                  response
                </a-option>
              </a-select>
              <div v-if="providerEditorForm.type === 'dashscope-bailian'" class="text-xs text-slate-500 mt-1">
                DashScope 当前限定为 openai-compatible，避免走 Responses 客户端。
              </div>
            </a-form-item>
          </div>
          <div v-if="modelEditorForm.capabilities.includes('embedding')" class="px-4 py-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
            <div>
              <div class="text-sm text-slate-900 font-medium">
                Embedding 模型
              </div>
              <div class="text-xs text-slate-500">
                纯文本向量用 OpenAI 兼容文本；百炼图片、视频或融合向量用百炼原生多模态，运行时不走 compatible-mode。
              </div>
            </div>
            <a-form-item label="Embedding 接入类型">
              <a-select v-model="modelEditorForm.embeddingApiStyle">
                <a-option value="openai-compatible-text">
                  OpenAI 兼容文本
                </a-option>
                <a-option value="bailian-multimodal">
                  百炼原生多模态
                </a-option>
              </a-select>
            </a-form-item>
            <a-form-item label="Embedding 维度">
              <a-input-number v-model="modelEditorForm.embeddingDimensions" :min="64" :step="64" class="w-full" />
            </a-form-item>
          </div>
          <div v-if="modelEditorForm.capabilities.includes('vision') || modelEditorForm.capabilities.includes('image-gen') || modelEditorForm.capabilities.includes('video-gen')" class="px-4 py-4 border border-slate-200 rounded-lg bg-slate-50">
            <div class="text-sm text-slate-900 font-medium">
              视觉与生成能力
            </div>
            <div class="text-xs text-slate-500 mt-1">
              vision 能力模型通过显式模型池参与图片理解；image-gen / video-gen 先作为后续生成场景路由标签保留。
            </div>
          </div>
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
      :width="680"
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
          <a-form-item label="绑定 Provider">
            <a-select
              v-model="sceneEditorForm.providerIds"
              multiple
              allow-search
              allow-clear
              placeholder="按场景能力过滤 Provider"
              @change="handleSceneProviderIdsChange"
            >
              <a-option
                v-for="item in sceneEditorProviderOptions"
                :key="item.id"
                :value="item.id"
                :disabled="!item.enabled"
              >
                {{ item.name }} <span class="text-xs text-slate-400">({{ item.provider }} · {{ item.capability }})</span>
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="负载均衡策略">
            <a-select v-model="sceneEditorForm.loadBalanceStrategy">
              <a-option value="round_robin">
                轮询
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="模型池">
            <a-select
              v-model="sceneEditorForm.models"
              multiple
              allow-search
              allow-clear
              placeholder="按绑定 Provider 的模型池汇总选择"
              @change="handleSceneModelsChange"
            >
              <template #empty>
                <div class="px-4 py-5 text-left">
                  <div class="text-sm text-slate-700 font-medium">
                    没有匹配当前场景的模型
                  </div>
                  <div class="text-xs text-slate-500 leading-relaxed mt-1">
                    {{ sceneModelEmptyHint() }}
                  </div>
                </div>
              </template>
              <a-option
                v-for="item in sceneEditorModelPoolOptions"
                :key="`scene-model-pool-${item.model}`"
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
          <a-form-item label="回退顺序">
            <a-select
              v-model="sceneEditorForm.modelFallback"
              multiple
              allow-search
              allow-clear
              placeholder="留空则按模型池顺序依次尝试"
              @change="handleSceneModelFallbackChange"
            >
              <a-option
                v-for="item in sceneEditorFallbackOptions"
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
          <a-form-item label="故障转移策略">
            <a-select v-model="sceneEditorForm.failoverStrategy">
              <a-option value="model_then_provider">
                先按模型切换，再在同模型内轮询 Provider
              </a-option>
            </a-select>
          </a-form-item>

          <div class="text-xs text-slate-500 px-4 py-3 rounded-2xl bg-slate-50">
            当前 Provider：{{ sceneEditorForm.providerIds.length > 0 ? sceneProvidersPreview({ ...sceneEditorForm, providerIds: sceneEditorForm.providerIds, models: [], modelFallback: [], enabled: true, key: sceneEditorForm.key, label: '', description: '', loadBalanceStrategy: sceneEditorForm.loadBalanceStrategy, failoverStrategy: sceneEditorForm.failoverStrategy, prompt: '' }) : '未绑定 Provider' }}
          </div>
          <div class="text-xs text-slate-500 px-4 py-3 rounded-2xl bg-slate-50">
            当前模型池：{{ sceneEditorForm.models.length > 0 ? sceneEditorForm.models.join(' / ') : '未配置' }}
          </div>
          <div class="text-xs text-slate-500 px-4 py-3 rounded-2xl bg-slate-50">
            当前模型回退顺序：{{ sceneEditorForm.modelFallback.length > 0 ? sceneEditorForm.modelFallback.join(' -> ') : (sceneEditorForm.models.length > 0 ? `未单独配置，将按模型池顺序：${sceneEditorForm.models.join(' -> ')}` : '未配置') }}
          </div>
          <div class="text-xs text-slate-500 px-4 py-3 rounded-2xl bg-slate-50">
            当前故障转移：{{ sceneFailoverStrategyLabel(sceneEditorForm) }}
          </div>

          <div class="px-4 py-4 border border-slate-200 rounded-lg bg-slate-50 space-y-2">
            <div class="text-sm text-slate-900 font-medium">
              内置提示词
            </div>
            <pre class="text-xs text-slate-600 leading-relaxed m-0 whitespace-pre-wrap">{{ sceneDefinitionForKey(sceneEditorForm.key)?.builtinPrompt || '未配置内置提示词。' }}</pre>
          </div>

          <a-form-item label="自定义提示词">
            <a-textarea
              v-model="sceneEditorForm.prompt"
              :auto-size="{ minRows: 8, maxRows: 16 }"
              placeholder="留空表示不追加自定义提示词。"
            />
          </a-form-item>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <a-button @click="applyCurrentSceneConfigToAll">
            复制当前策略到全部场景
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
      title="一键设置全部场景"
      :width="680"
      unmount-on-close
    >
      <div class="pr-2 max-h-[calc(100vh-132px)] overflow-y-auto">
        <div class="gap-4 grid">
          <a-alert type="info" :show-icon="true">
            这里会覆盖全部场景的 Provider 绑定、负载均衡策略、模型池、回退顺序和故障转移策略，不会改动提示词和启停状态。
          </a-alert>
          <a-form-item label="统一 Provider 绑定">
            <a-select
              v-model="sceneBatchForm.providerIds"
              multiple
              allow-search
              allow-clear
              @change="handleSceneBatchProviderIdsChange"
            >
              <a-option
                v-for="item in routableProviderOptions"
                :key="`batch-provider-${item.id}`"
                :value="item.id"
                :disabled="!item.enabled"
              >
                {{ item.name }} <span class="text-xs text-slate-400">({{ item.capability }})</span>
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="统一负载均衡策略">
            <a-select v-model="sceneBatchForm.loadBalanceStrategy">
              <a-option value="round_robin">
                轮询
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="统一模型池">
            <a-select
              v-model="sceneBatchForm.models"
              multiple
              allow-search
              allow-clear
              @change="handleSceneBatchModelsChange"
            >
              <a-option
                v-for="item in sceneBatchModelPoolOptions"
                :key="`batch-model-pool-${item.model}`"
                :value="item.model"
              >
                {{ item.model }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="统一回退顺序">
            <a-select
              v-model="sceneBatchForm.modelFallback"
              multiple
              allow-search
              allow-clear
              @change="handleSceneBatchModelFallbackChange"
            >
              <a-option
                v-for="item in sceneBatchFallbackOptions"
                :key="`batch-model-${item.model}`"
                :value="item.model"
              >
                {{ item.model }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="统一故障转移策略">
            <a-select v-model="sceneBatchForm.failoverStrategy">
              <a-option value="model_then_provider">
                先按模型切换，再在同模型内轮询 Provider
              </a-option>
            </a-select>
          </a-form-item>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <a-button @click="closeSceneBatchDrawer">
            取消
          </a-button>
          <a-button type="primary" @click="applySceneBatchConfig">
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

<style scoped>
.ai-prompts-page :deep(.arco-spin),
.ai-prompts-page :deep(.arco-spin-container),
.ai-prompts-page :deep(.arco-spin-children) {
  display: block;
  width: 100%;
}
</style>
