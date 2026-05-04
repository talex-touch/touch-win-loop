import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  PlatformAiClientType,
  ProjectKnowledgeEmbeddingApiStyle,
} from '~~/shared/types/domain'
import { normalizePlatformAiBaseURL } from '~~/server/utils/platform-ai-base-url'
import { normalizePlatformAiClientType, normalizeProjectKnowledgeEmbeddingApiStyle } from '~~/server/utils/platform-ai-client'

export type PlatformAiProviderAdapter = 'openai-compatible' | 'response'
export type PlatformAiProviderCapability = 'llm' | 'search' | 'embedding' | 'asr' | 'tts' | 'realtime' | 'voice'
export type PlatformAiProviderType = 'newapi' | 'openai-compatible' | 'dashscope-bailian' | 'coze-voice' | 'searchxng' | 'tavily'
export type PlatformAiModelFormat = 'openai-compatible' | 'response'
export type PlatformAiModelCapability = 'chat' | 'vision' | 'embedding' | 'asr' | 'tts' | 'image-gen' | 'video-gen'
export type PlatformAiPricingSource = 'provider' | 'manual' | 'none'
export type PlatformAiLoadBalanceStrategy = 'round_robin'
export type PlatformAiFailoverStrategy = 'model_then_provider'
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
    | 'admin_operations_analysis'
    | 'knowledge_embedding'
    | 'knowledge_visual_embedding'
    | 'knowledge_query_planner'
    | 'knowledge_visual_projection'
    | 'document_analysis'
    | 'meeting_asr'
    | 'speech_tts'

export interface PlatformAiProviderModelConfig {
  model: string
  label: string
  format: PlatformAiModelFormat
  capabilities: PlatformAiModelCapability[]
  clientType: PlatformAiClientType
  embeddingApiStyle?: ProjectKnowledgeEmbeddingApiStyle
  embeddingDimensions?: number
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

export interface PlatformAiProviderVoiceConfig {
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

export interface PlatformAiProviderConfig {
  id: string
  name: string
  type: PlatformAiProviderType
  capability: PlatformAiProviderCapability
  adapter: PlatformAiProviderAdapter
  provider: string
  clientType: PlatformAiClientType
  baseURL: string
  apiKey: string
  enabled: boolean
  timeoutMs: number
  maxRetries: number
  fetchedAt: string
  embeddingApiStyle?: ProjectKnowledgeEmbeddingApiStyle
  embeddingDimensions?: number
  voice?: PlatformAiProviderVoiceConfig
  models: PlatformAiProviderModelConfig[]
}

export interface PlatformAiChannelConfig {
  key: PlatformAiChannelKey
  label: string
  description: string
  enabled: boolean
  providerIds: string[]
  loadBalanceStrategy: PlatformAiLoadBalanceStrategy
  models: string[]
  modelFallback: string[]
  failoverStrategy: PlatformAiFailoverStrategy
  prompt: string
}

export interface PlatformAiChannelDefinition {
  key: PlatformAiChannelKey
  label: string
  description: string
  builtinPrompt: string
  requiredModelCapability: PlatformAiModelCapability
  allowedProviderCapabilities: PlatformAiProviderCapability[]
  embeddingApiStyle?: ProjectKnowledgeEmbeddingApiStyle
}

export interface PlatformAiResolvedRegistry {
  providers: PlatformAiProviderConfig[]
  channels: PlatformAiChannelConfig[]
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
}

export interface PlatformAiResolvedCapabilityRuntime {
  provider: PlatformAiProviderConfig
  modelConfig: PlatformAiProviderModelConfig
  ai: AiRuntimeConfig
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
  capabilities: PlatformAiModelCapability[]
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
  latencyMs: number
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
  latencyMs: number
}

const PLATFORM_AI_REGISTRY_VERSION = 3

function defineChannel(
  definition: Omit<PlatformAiChannelDefinition, 'requiredModelCapability' | 'allowedProviderCapabilities'> & {
    requiredModelCapability?: PlatformAiModelCapability
    allowedProviderCapabilities?: PlatformAiProviderCapability[]
  },
): PlatformAiChannelDefinition {
  const requiredModelCapability = definition.requiredModelCapability || 'chat'
  return {
    ...definition,
    builtinPrompt: definition.builtinPrompt || '',
    requiredModelCapability,
    allowedProviderCapabilities: definition.allowedProviderCapabilities || ['llm'],
  }
}

const CHANNEL_DEFINITIONS: PlatformAiChannelDefinition[] = [
  defineChannel({ key: 'contest_filter', label: '选赛过滤', description: '竞赛筛选与推荐排序', builtinPrompt: '根据用户画像、赛题条件与项目方向筛选竞赛，并给出可解释排序。' }),
  defineChannel({ key: 'project_chat', label: '项目聊天', description: '项目草案对话与改写', builtinPrompt: '围绕当前项目资料回答问题，优先引用已有上下文，避免编造未提供事实。' }),
  defineChannel({ key: 'topic_proposal', label: '选题助手', description: '命题建议与路线生成', builtinPrompt: '基于竞赛要求和项目资源提出选题方向、技术路线和落地计划。' }),
  defineChannel({
    key: 'defense',
    label: '答辩模拟',
    description: '评委问答与评分反馈',
    builtinPrompt: '模拟评委追问项目价值、技术可行性、创新点、风险和答辩表达，并给出改进建议。',
    allowedProviderCapabilities: ['llm', 'voice', 'realtime'],
  }),
  defineChannel({ key: 'workspace_dialog_ask', label: '工作台-对话询问', description: '工作台只读问答', builtinPrompt: '以只读方式回答工作台问题，基于当前项目上下文给出明确结论。' }),
  defineChannel({ key: 'workspace_auto_optimize', label: '工作台-自动优化', description: '工作台提案优化', builtinPrompt: '识别当前项目草案的表达、结构和证据问题，并给出可落地优化建议。' }),
  defineChannel({ key: 'workspace_issue_discovery', label: '工作台-寻疑发现', description: '工作台问题扫描', builtinPrompt: '扫描项目资料中的缺口、冲突、风险和需要补证的问题。' }),
  defineChannel({ key: 'workspace_document_summarize', label: '文档总结', description: '基于当前选区生成精炼摘要', builtinPrompt: '提炼当前选区的核心结论、依据和后续动作，保持简洁准确。' }),
  defineChannel({ key: 'workspace_document_rewrite', label: '文档润写', description: '对当前选区进行润写改写', builtinPrompt: '在不改变事实的前提下提升表达清晰度、逻辑顺序和专业性。' }),
  defineChannel({ key: 'workspace_document_continue', label: '文档续写', description: '基于当前上下文续写文档内容', builtinPrompt: '延续当前上下文语气和结构续写，避免引入未确认事实。' }),
  defineChannel({ key: 'workspace_document_expand', label: '文档扩写', description: '对当前选区做扩写和展开', builtinPrompt: '围绕当前选区补充论据、步骤和细节，使内容更完整。' }),
  defineChannel({ key: 'workspace_document_complete_context', label: '文档补全上下文', description: '补全文档缺失上下文与衔接内容', builtinPrompt: '补全文档断裂处的背景、过渡和上下文衔接。' }),
  defineChannel({ key: 'workspace_document_restructure', label: '文档结构整理', description: '重整结构与层次，保持内容可直接落文', builtinPrompt: '重排内容层级和标题结构，保留原始事实并输出可直接落文的结构。' }),
  defineChannel({ key: 'workspace_canvas_generate', label: '画布生成', description: '生成流程图、脑图、ER 图或架构图结构源', builtinPrompt: '根据需求生成可视化结构源，优先保证节点、关系和层级清晰。' }),
  defineChannel({ key: 'workspace_canvas_complete', label: '画布补全', description: '基于现有图结构补全缺失节点与关系', builtinPrompt: '基于现有画布补全合理缺失，不破坏已有结构。' }),
  defineChannel({ key: 'workspace_canvas_refine', label: '画布续改', description: '基于现有图结构重写和优化结构源', builtinPrompt: '优化现有画布结构，使关系更清晰、命名更一致。' }),
  defineChannel({ key: 'admin_general', label: '管理助手-通用', description: '后台管理通用任务', builtinPrompt: '聚焦后台配置状态、风险识别、问题定位与可执行修复步骤。' }),
  defineChannel({ key: 'admin_publish_assistant', label: '管理助手-发布助手', description: '赛事发布预检与修复建议', builtinPrompt: '聚焦发布阻断项、字段缺口、模块级修复动作。' }),
  defineChannel({ key: 'admin_operations_analysis', label: '运营管控-AI 分析', description: '运营总览、SLA、风险和待办分析', builtinPrompt: '基于后台运营快照进行平台运营分析，输出风险等级、SLA 解读和可执行动作，禁止编造未提供指标。' }),
  defineChannel({
    key: 'knowledge_embedding',
    label: '知识库文本 Embedding',
    description: '知识库文本向量与检索索引',
    builtinPrompt: '为纯文本知识内容生成检索向量，要求使用 OpenAI 兼容文本 Embedding 接入。',
    requiredModelCapability: 'embedding',
    allowedProviderCapabilities: ['llm', 'embedding'],
    embeddingApiStyle: 'openai-compatible-text',
  }),
  defineChannel({
    key: 'knowledge_visual_embedding',
    label: '知识库视觉 Embedding',
    description: '图片、视频、多图与图文融合向量',
    builtinPrompt: '为图片、视频、多图或图文融合内容生成百炼原生多模态向量。',
    requiredModelCapability: 'embedding',
    allowedProviderCapabilities: ['llm', 'embedding'],
    embeddingApiStyle: 'bailian-multimodal',
  }),
  defineChannel({ key: 'knowledge_query_planner', label: '知识检索规划', description: '项目知识查询意图、召回策略与证据链规划', builtinPrompt: '分析用户问题的检索意图，规划召回关键词、向量查询和证据链组织。' }),
  defineChannel({
    key: 'knowledge_visual_projection',
    label: '知识库视觉投影',
    description: '图片、截图、OCR 与视觉摘要提取',
    builtinPrompt: '从图片、截图和 OCR 内容中提取结构化视觉摘要，用于知识检索和证据组织。',
    requiredModelCapability: 'vision',
  }),
  defineChannel({ key: 'document_analysis', label: '文档分析', description: '文档解析、预览与重解析', builtinPrompt: '分析文档结构、页面内容和可检索信息，输出稳定的解析与摘要结果。' }),
  defineChannel({
    key: 'meeting_asr',
    label: '会议 ASR',
    description: '会议字幕、录音转写与语音识别',
    builtinPrompt: '将会议音频转写为准确字幕，保留关键术语和发言内容。',
    requiredModelCapability: 'asr',
    allowedProviderCapabilities: ['llm', 'asr', 'voice', 'realtime'],
  }),
  defineChannel({
    key: 'speech_tts',
    label: '语音 TTS',
    description: '文本转语音、朗读与语音播报',
    builtinPrompt: '将文本合成为清晰可听的语音，用于朗读和语音播报。',
    requiredModelCapability: 'tts',
    allowedProviderCapabilities: ['llm', 'tts', 'voice', 'realtime'],
  }),
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

const SEARCH_PROVIDER_TYPES = new Set<PlatformAiProviderType>(['searchxng', 'tavily'])
const LEGACY_ROUND_ROBIN_POINTERS = new Map<string, number>()
const MODEL_CAPABILITY_ORDER: PlatformAiModelCapability[] = ['chat', 'vision', 'embedding', 'asr', 'tts', 'image-gen', 'video-gen']

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

function normalizeModelCapability(value: unknown): PlatformAiModelCapability | null {
  const normalized = toText(value).toLowerCase()
  if (normalized === 'llm' || normalized === 'text-generation' || normalized === 'chat-completions')
    return 'chat'
  if (normalized === 'chat' || normalized === 'vision' || normalized === 'embedding' || normalized === 'asr' || normalized === 'tts' || normalized === 'image-gen' || normalized === 'video-gen')
    return normalized
  if (normalized === 'speech-to-text' || normalized === 'speech_to_text' || normalized === 'transcription' || normalized === 'transcribe')
    return 'asr'
  if (normalized === 'text-to-speech' || normalized === 'text_to_speech' || normalized === 'speech-synthesis' || normalized === 'speech_synthesis')
    return 'tts'
  if (normalized === 'image_generation' || normalized === 'image-generation' || normalized === 'image')
    return 'image-gen'
  if (normalized === 'video_generation' || normalized === 'video-generation' || normalized === 'video')
    return 'video-gen'
  return null
}

function normalizeModelCapabilities(raw: unknown, fallback: PlatformAiModelCapability[]): PlatformAiModelCapability[] {
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,|\s]+/g)
      : []
  const normalized = source
    .map(item => normalizeModelCapability(item))
    .filter((item): item is PlatformAiModelCapability => Boolean(item))
  const values = normalized.length > 0 ? normalized : fallback
  const valueSet = new Set(values)
  return MODEL_CAPABILITY_ORDER.filter(item => valueSet.has(item))
}

export function inferPlatformAiModelCapabilities(input: {
  model: string
  label?: string
  provider?: string
  rawText?: string
}): PlatformAiModelCapability[] {
  const model = toText(input.model)
  const text = `${model} ${input.label || ''} ${input.provider || ''} ${input.rawText || ''}`.toLowerCase()
  const result = new Set<PlatformAiModelCapability>()

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

  return MODEL_CAPABILITY_ORDER.filter(item => result.has(item))
}

export function platformAiModelHasCapability(
  model: Pick<PlatformAiProviderModelConfig, 'capabilities'> | null | undefined,
  capability: PlatformAiModelCapability,
): boolean {
  return Boolean(model?.capabilities?.includes(capability))
}

function resolvePlatformAiProviderType(value: unknown, providerValue?: unknown): PlatformAiProviderType {
  const candidates = [toText(value), toText(providerValue)]
    .filter(Boolean)
    .map(item => item.toLowerCase())

  for (const normalized of candidates) {
    if (normalized === 'newapi')
      return 'newapi'
    if (normalized === 'openai-compatible' || normalized === 'openai_compatible')
      return 'openai-compatible'
    if (normalized === 'dashscope-bailian' || normalized === 'dashscope' || normalized === 'bailian' || normalized === 'qwen')
      return 'dashscope-bailian'
    if (normalized === 'coze-voice' || normalized === 'coze_voice' || normalized === 'coze-realtime' || normalized === 'coze_realtime')
      return 'coze-voice'
    if (normalized === 'searchxng' || normalized === 'searchxng-search' || normalized === 'searchxng_search')
      return 'searchxng'
    if (normalized === 'tavily')
      return 'tavily'
    if (normalized.includes('newapi'))
      return 'newapi'
    if (normalized.includes('dashscope') || normalized.includes('bailian') || normalized.includes('qwen'))
      return 'dashscope-bailian'
    if (normalized.includes('coze') && (normalized.includes('voice') || normalized.includes('realtime') || normalized.includes('rtc')))
      return 'coze-voice'
    if (normalized.includes('searchxng') || normalized.includes('searxng'))
      return 'searchxng'
    if (normalized.includes('tavily'))
      return 'tavily'
  }

  return 'openai-compatible'
}

function normalizeProviderCapability(value: unknown): PlatformAiProviderCapability | null {
  const normalized = toText(value).toLowerCase()
  if (normalized === 'llm' || normalized === 'search' || normalized === 'embedding' || normalized === 'asr' || normalized === 'tts' || normalized === 'realtime' || normalized === 'voice')
    return normalized
  if (normalized === 'embeddings' || normalized === 'embedding-only' || normalized === 'embedding_only' || normalized === 'vector')
    return 'embedding'
  if (normalized === 'speech-to-text' || normalized === 'speech_to_text' || normalized === 'transcription')
    return 'asr'
  if (normalized === 'text-to-speech' || normalized === 'text_to_speech' || normalized === 'speech-synthesis')
    return 'tts'
  if (normalized === 'realtime' || normalized === 'realtime-voice' || normalized === 'voice-realtime' || normalized === 'voice_realtime' || normalized === 'qwen-realtime' || normalized === 'coze-voice')
    return 'voice'
  return null
}

function resolveProviderCapability(type: PlatformAiProviderType, value?: unknown): PlatformAiProviderCapability {
  if (SEARCH_PROVIDER_TYPES.has(type))
    return 'search'
  if (type === 'coze-voice')
    return 'voice'

  const explicit = normalizeProviderCapability(value)
  if (explicit && explicit !== 'search')
    return explicit
  return 'llm'
}

function resolveAdapter(
  value: unknown,
  provider: string,
  type: PlatformAiProviderType,
): PlatformAiProviderAdapter {
  const normalized = toText(value).toLowerCase()
  if (normalized === 'response')
    return 'response'
  if (normalized === 'openai-compatible' || normalized === 'newapi' || normalized === 'sub2api')
    return 'openai-compatible'

  if (type === 'openai-compatible' && provider.toLowerCase().includes('response'))
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

function sanitizeModelFormatForProvider(type: PlatformAiProviderType, format: PlatformAiModelFormat): PlatformAiModelFormat {
  if (type === 'dashscope-bailian')
    return 'openai-compatible'
  if (type === 'coze-voice')
    return 'openai-compatible'
  return format
}

function normalizeModelClientType(value: unknown): PlatformAiClientType {
  return toText(value) === 'langchain' ? 'langchain' : 'langchain'
}

function inferEmbeddingApiStyle(model: string, providerType: PlatformAiProviderType, fallback: ProjectKnowledgeEmbeddingApiStyle): ProjectKnowledgeEmbeddingApiStyle {
  const normalizedModel = model.toLowerCase()
  if (
    providerType === 'dashscope-bailian'
    && (
      normalizedModel.includes('tongyi-embedding-vision')
      || normalizedModel.includes('embedding-vision')
      || normalizedModel.includes('vl-embedding')
      || normalizedModel.includes('multimodal-embedding')
      || normalizedModel.includes('qwen3-vl-embedding')
    )
  ) {
    return 'bailian-multimodal'
  }
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

const defaultModelPricingText = '默认价格：输入 USD 0.0000/1M · 输出 USD 0.0000/1M（Provider 未返回报价）'

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

function normalizeProviderModel(
  raw: unknown,
  fallbackFormat: PlatformAiModelFormat,
  options?: {
    providerType?: PlatformAiProviderType
    fallbackEmbeddingApiStyle?: ProjectKnowledgeEmbeddingApiStyle
    fallbackEmbeddingDimensions?: number
  },
): PlatformAiProviderModelConfig | null {
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
  const label = toText(source.label || source.name) || model
  const providerType = options?.providerType || 'openai-compatible'
  const inferredCapabilities = inferPlatformAiModelCapabilities({
    model,
    label,
    provider: providerType,
    rawText: JSON.stringify(source),
  })
  const capabilities = normalizeModelCapabilities(source.capabilities || source.capability || source.mode, inferredCapabilities)
  const embeddingApiStyleFallback = inferEmbeddingApiStyle(
    model,
    providerType,
    normalizeProjectKnowledgeEmbeddingApiStyle(options?.fallbackEmbeddingApiStyle),
  )
  const embeddingDimensionsFallback = clampInt(options?.fallbackEmbeddingDimensions, 0, 0, 16384)

  return {
    model,
    label,
    format: sanitizeModelFormatForProvider(providerType, toModelFormat(source.format || source.adapter || source.type, fallbackFormat)),
    capabilities,
    clientType: normalizeModelClientType(source.clientType),
    embeddingApiStyle: capabilities.includes('embedding')
      ? normalizeProjectKnowledgeEmbeddingApiStyle(source.embeddingApiStyle, embeddingApiStyleFallback)
      : undefined,
    embeddingDimensions: capabilities.includes('embedding')
      ? clampInt(source.embeddingDimensions, embeddingDimensionsFallback, 0, 16384)
      : undefined,
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
    map.set(item.model, item)
  }
  return Array.from(map.values())
}

function serializeProviderModel(item: PlatformAiProviderModelConfig): PlatformAiProviderModelConfig {
  return {
    ...item,
    capabilities: normalizeModelCapabilities(item.capabilities, inferPlatformAiModelCapabilities(item)),
    clientType: normalizeModelClientType(item.clientType),
    embeddingApiStyle: item.capabilities.includes('embedding')
      ? normalizeProjectKnowledgeEmbeddingApiStyle(item.embeddingApiStyle)
      : undefined,
    embeddingDimensions: item.capabilities.includes('embedding')
      ? clampInt(item.embeddingDimensions, 0, 0, 16384)
      : undefined,
    providerInputPricePer1M: item.providerInputPricePer1M === null ? null : Number(item.providerInputPricePer1M),
    providerOutputPricePer1M: item.providerOutputPricePer1M === null ? null : Number(item.providerOutputPricePer1M),
    manualInputPricePer1M: item.manualInputPricePer1M === null ? null : Number(item.manualInputPricePer1M),
    manualOutputPricePer1M: item.manualOutputPricePer1M === null ? null : Number(item.manualOutputPricePer1M),
    inputPricePer1M: item.inputPricePer1M === null ? null : Number(item.inputPricePer1M),
    outputPricePer1M: item.outputPricePer1M === null ? null : Number(item.outputPricePer1M),
  }
}

function sortVoiceItems<T extends { sortOrder: number, id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id, 'en'))
}

function normalizeVoiceId(value: unknown, fallback: string): string {
  return toText(value) || fallback
}

function normalizeVoiceBillingConfig(raw: unknown): NonNullable<PlatformAiProviderVoiceConfig['billing']> {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  return {
    realtimeStartupUnits: Math.max(0, clampInt(source.realtimeStartupUnits, 2, 0, 100000)),
    realtimeUnitsPerMinute: Math.max(0, clampInt(source.realtimeUnitsPerMinute, 1, 0, 100000)),
    asrUnitsPerMinute: Math.max(0, clampInt(source.asrUnitsPerMinute, 1, 0, 100000)),
    ttsUnitsPer1KChars: Math.max(0, clampInt(source.ttsUnitsPer1KChars, 1, 0, 100000)),
    videoFrameMultiplier: Math.max(1, Number.isFinite(Number(source.videoFrameMultiplier)) ? Number(source.videoFrameMultiplier) : 1),
    judgeMultiplierEnabled: toBoolean(source.judgeMultiplierEnabled, true),
    providerMarkupMultiplier: Math.max(1, Number.isFinite(Number(source.providerMarkupMultiplier)) ? Number(source.providerMarkupMultiplier) : 1),
  }
}

function normalizeQwenRealtimeProfiles(raw: unknown): NonNullable<NonNullable<PlatformAiProviderVoiceConfig['qwen']>['realtimeProfiles']> {
  const items = Array.isArray(raw) ? raw : []
  return sortVoiceItems(items.map((item, index) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
    const model = toText(source.model) || 'qwen3.5-omni-plus-realtime'
    return {
      id: normalizeVoiceId(source.id, `qwen_realtime_${index + 1}`),
      name: toText(source.name || source.label) || `千问实时 ${index + 1}`,
      model,
      baseWsUrl: toText(source.baseWsUrl || source.baseURL || source.url),
      workspaceId: toText(source.workspaceId || source.workspace_id),
      appId: toText(source.appId || source.app_id),
      defaultVoiceId: toText(source.defaultVoiceId || source.voiceId || source.voice_id),
      asrProfileId: toText(source.asrProfileId || source.asr_profile_id),
      ttsProfileId: toText(source.ttsProfileId || source.tts_profile_id),
      vadMode: toText(source.vadMode || source.vad_mode) === 'manual'
        ? 'manual'
        : (toText(source.vadMode || source.vad_mode) === 'semantic_vad' ? 'semantic_vad' : 'server_vad'),
      frameIntervalMs: clampInt(source.frameIntervalMs, 1000, 250, 5000),
      enabled: toBoolean(source.enabled, true),
      sortOrder: clampInt(source.sortOrder, index, -100000, 100000),
    }
  }))
}

function normalizeQwenAsrProfiles(raw: unknown): NonNullable<NonNullable<PlatformAiProviderVoiceConfig['qwen']>['asrProfiles']> {
  const items = Array.isArray(raw) ? raw : []
  return sortVoiceItems(items.map((item, index) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
    return {
      id: normalizeVoiceId(source.id, `qwen_asr_${index + 1}`),
      name: toText(source.name || source.label) || `千问 ASR ${index + 1}`,
      model: toText(source.model) || 'qwen3-asr-flash-realtime',
      language: toText(source.language || source.lang) || 'zh-CN',
      enabled: toBoolean(source.enabled, true),
      sortOrder: clampInt(source.sortOrder, index, -100000, 100000),
    }
  }))
}

function normalizeQwenTtsProfiles(raw: unknown): NonNullable<NonNullable<PlatformAiProviderVoiceConfig['qwen']>['ttsProfiles']> {
  const items = Array.isArray(raw) ? raw : []
  return sortVoiceItems(items.map((item, index) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
    return {
      id: normalizeVoiceId(source.id, `qwen_tts_${index + 1}`),
      name: toText(source.name || source.label) || `千问 TTS ${index + 1}`,
      model: toText(source.model) || 'qwen-tts-realtime',
      voiceId: toText(source.voiceId || source.voice_id),
      sampleRate: clampInt(source.sampleRate, 24000, 8000, 48000),
      enabled: toBoolean(source.enabled, true),
      sortOrder: clampInt(source.sortOrder, index, -100000, 100000),
    }
  }))
}

function normalizeCozeAgents(raw: unknown, legacy: { botId: string, connectorId: string, voiceId: string }): NonNullable<NonNullable<PlatformAiProviderVoiceConfig['coze']>['agents']> {
  const items = Array.isArray(raw) ? raw : []
  const normalized = items.map((item, index) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
    return {
      id: normalizeVoiceId(source.id, `coze_agent_${index + 1}`),
      name: toText(source.name || source.label) || `Coze 智能体 ${index + 1}`,
      judgeType: toText(source.judgeType || source.judge_type || 'custom') || 'custom',
      botId: toText(source.botId || source.bot_id),
      connectorId: toText(source.connectorId || source.connector_id),
      defaultVoiceId: toText(source.defaultVoiceId || source.voiceId || source.voice_id),
      enabled: toBoolean(source.enabled, true),
      sortOrder: clampInt(source.sortOrder, index, -100000, 100000),
    }
  }).filter(item => item.botId || item.connectorId || item.defaultVoiceId)

  if (normalized.length === 0 && (legacy.botId || legacy.connectorId || legacy.voiceId)) {
    normalized.push({
      id: 'coze_agent_default',
      name: 'Coze 默认智能体',
      judgeType: 'custom',
      botId: legacy.botId,
      connectorId: legacy.connectorId,
      defaultVoiceId: legacy.voiceId,
      enabled: true,
      sortOrder: 0,
    })
  }

  return sortVoiceItems(normalized)
}

function normalizeCozeVoices(raw: unknown, legacyVoiceId: string): NonNullable<NonNullable<PlatformAiProviderVoiceConfig['coze']>['voices']> {
  const items = Array.isArray(raw) ? raw : []
  const normalized = items.map((item, index) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
    return {
      id: normalizeVoiceId(source.id, `coze_voice_${index + 1}`),
      name: toText(source.name || source.label) || `Coze 音色 ${index + 1}`,
      voiceId: toText(source.voiceId || source.voice_id),
      style: toText(source.style),
      enabled: toBoolean(source.enabled, true),
      sortOrder: clampInt(source.sortOrder, index, -100000, 100000),
    }
  }).filter(item => item.voiceId)

  if (normalized.length === 0 && legacyVoiceId) {
    normalized.push({
      id: 'coze_voice_default',
      name: 'Coze 默认音色',
      voiceId: legacyVoiceId,
      style: '',
      enabled: true,
      sortOrder: 0,
    })
  }

  return sortVoiceItems(normalized)
}

function normalizeProviderVoiceConfig(raw: unknown): PlatformAiProviderVoiceConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return undefined

  const source = raw as Record<string, unknown>
  const authMode = toText(source.authMode).toLowerCase() === 'oauth' ? 'oauth' : 'pat'
  const qwenSource = source.qwen && typeof source.qwen === 'object' && !Array.isArray(source.qwen)
    ? source.qwen as Record<string, unknown>
    : {}
  const cozeSource = source.coze && typeof source.coze === 'object' && !Array.isArray(source.coze)
    ? source.coze as Record<string, unknown>
    : {}
  const voice: PlatformAiProviderVoiceConfig = {
    botId: toText(source.botId || source.bot_id),
    connectorId: toText(source.connectorId || source.connector_id),
    voiceId: toText(source.voiceId || source.voice_id),
    authMode,
  }

  const qwen = {
    realtimeProfiles: normalizeQwenRealtimeProfiles(qwenSource.realtimeProfiles || qwenSource.realtime_profiles),
    asrProfiles: normalizeQwenAsrProfiles(qwenSource.asrProfiles || qwenSource.asr_profiles),
    ttsProfiles: normalizeQwenTtsProfiles(qwenSource.ttsProfiles || qwenSource.tts_profiles),
  }
  const coze = {
    agents: normalizeCozeAgents(cozeSource.agents, voice),
    voices: normalizeCozeVoices(cozeSource.voices, voice.voiceId),
    roomConfig: {
      createRoomOnServer: toBoolean((cozeSource.roomConfig as Record<string, unknown> | undefined)?.createRoomOnServer, true),
      roomNamePrefix: toText((cozeSource.roomConfig as Record<string, unknown> | undefined)?.roomNamePrefix) || 'WinLoop 答辩',
    },
  }
  voice.qwen = qwen.realtimeProfiles.length || qwen.asrProfiles.length || qwen.ttsProfiles.length ? qwen : undefined
  voice.coze = coze.agents.length || coze.voices.length ? coze : undefined
  voice.billing = normalizeVoiceBillingConfig(source.billing)

  return Object.values(voice).some((value) => {
    if (typeof value === 'string')
      return Boolean(value)
    if (!value || typeof value !== 'object')
      return false
    if (Array.isArray(value))
      return value.length > 0
    const record = value as Record<string, unknown>
    return Object.values(record).some(item => Array.isArray(item) ? item.length > 0 : Boolean(item))
  })
    ? voice
    : undefined
}

function resolveProviderVoiceConfig(source: Record<string, unknown>, type: PlatformAiProviderType): PlatformAiProviderVoiceConfig | undefined {
  const nested = normalizeProviderVoiceConfig(source.voice)
  if (nested)
    return nested
  if (type !== 'coze-voice')
    return undefined

  return normalizeProviderVoiceConfig({
    botId: source.botId,
    connectorId: source.connectorId,
    voiceId: source.voiceId,
    authMode: source.authMode,
  }) || {
    botId: '',
    connectorId: '',
    voiceId: '',
    authMode: 'pat',
  }
}

function sanitizeProviderId(value: unknown, index: number): string {
  return toText(value) || `provider_${index + 1}`
}

function buildProviderName(
  providerId: string,
  type: PlatformAiProviderType,
  capability: PlatformAiProviderCapability,
  source: Record<string, unknown>,
): string {
  const explicit = toText(source.name || source.label)
  if (explicit)
    return explicit
  if (capability === 'search')
    return type === 'tavily' ? 'Tavily' : 'SearchXNG'
  if (type === 'newapi')
    return 'NewAPI'
  if (type === 'dashscope-bailian')
    return '百炼 DashScope'
  if (type === 'coze-voice')
    return 'Coze 语音'
  return providerId
}

function normalizeProvider(
  raw: unknown,
  index: number,
  runtime: RuntimeSettings,
): PlatformAiProviderConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null

  const source = raw as Record<string, unknown>
  const providerRaw = toText(source.provider || source.providerName || source.name || source.type)
  const type = resolvePlatformAiProviderType(source.type || source.providerType, providerRaw)
  const capability = resolveProviderCapability(type, source.capability)
  const provider = providerRaw || type
  const adapter = resolveAdapter(source.adapter, provider, type)
  const formatFallback: PlatformAiModelFormat = adapter === 'response' ? 'response' : 'openai-compatible'
  const embeddingApiStyle = normalizeProjectKnowledgeEmbeddingApiStyle(source.embeddingApiStyle, runtime.ai.embeddingApiStyle)
  const embeddingDimensions = clampInt(source.embeddingDimensions, runtime.ai.embeddingDimensions, 0, 16384)
  const voice = resolveProviderVoiceConfig(source, type)

  const models = capability !== 'search' && capability !== 'voice' && Array.isArray(source.models)
    ? source.models
        .map(item => normalizeProviderModel(item, formatFallback, {
          providerType: type,
          fallbackEmbeddingApiStyle: embeddingApiStyle,
          fallbackEmbeddingDimensions: embeddingDimensions,
        }))
        .filter((item): item is PlatformAiProviderModelConfig => Boolean(item))
    : []

  const providerId = sanitizeProviderId(source.id, index)
  return {
    id: providerId,
    name: buildProviderName(providerId, type, capability, source),
    type,
    capability,
    adapter,
    provider,
    clientType: normalizePlatformAiClientType(source.clientType, runtime.ai.clientType),
    baseURL: normalizePlatformAiBaseURL(source.baseURL, provider),
    apiKey: String(source.apiKey ?? ''),
    enabled: toBoolean(source.enabled, true),
    timeoutMs: clampInt(source.timeoutMs, runtime.ai.timeoutMs, 1000, 120000),
    maxRetries: clampInt(source.maxRetries, runtime.ai.maxRetries, 0, 10),
    fetchedAt: toText(source.fetchedAt || source.modelFetchedAt),
    embeddingApiStyle,
    embeddingDimensions,
    voice,
    models: dedupeProviderModels(models),
  }
}

function parseLegacyProvidersState(raw: unknown, runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const parsed = parseJsonObject(raw)
  const source = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items))
        ? (parsed as Record<string, unknown>).items as unknown[]
        : []

  const providers = source
    .map((item, index) => normalizeProvider(item, index, runtime))
    .filter((item): item is PlatformAiProviderConfig => Boolean(item))

  return {
    providers,
    channels: [],
  }
}

function parseStructuredProviderState(raw: Record<string, unknown>, runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const sourceProviders = Array.isArray(raw.providers)
    ? raw.providers
    : []
  const providers = sourceProviders
    .map((item, index) => normalizeProvider(item, index, runtime))
    .filter((item): item is PlatformAiProviderConfig => Boolean(item))

  return {
    providers,
    channels: [],
  }
}

function parseProviderState(raw: unknown, runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const parsed = parseJsonObject(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.providers) || Number(record.version || 0) >= PLATFORM_AI_REGISTRY_VERSION)
      return parseStructuredProviderState(record, runtime)
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

function providerCanServeModelCapability(provider: PlatformAiProviderConfig, capability: PlatformAiModelCapability): boolean {
  if (provider.capability === 'search')
    return false
  if (provider.capability === 'llm')
    return true
  if (provider.capability === 'voice' || provider.capability === 'realtime')
    return capability === 'asr' || capability === 'tts'
  return provider.capability === capability
}

function providerCanServeChannel(provider: PlatformAiProviderConfig, key: PlatformAiChannelKey): boolean {
  const definition = resolveChannelDefinition(key)
  return definition.allowedProviderCapabilities.includes(provider.capability)
    && providerCanServeModelCapability(provider, definition.requiredModelCapability)
}

function resolvePrimaryLlmProvider(providers: PlatformAiProviderConfig[]): PlatformAiProviderConfig | null {
  return providers.find(provider => provider.capability === 'llm' && provider.enabled)
    || providers.find(provider => provider.capability === 'llm')
    || null
}

function resolveDefaultProviderIds(providers: PlatformAiProviderConfig[]): string[] {
  const primary = resolvePrimaryLlmProvider(providers)
  return primary ? [primary.id] : []
}

function extractProviderIds(raw: unknown): string[] {
  if (!Array.isArray(raw))
    return []

  return dedupeStrings(raw.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return toText(item)
    const record = item as Record<string, unknown>
    return toText(record.providerId || record.id || record.value)
  }))
}

function resolveLoadBalanceStrategy(value: unknown): PlatformAiLoadBalanceStrategy {
  return toText(value).toLowerCase() === 'round_robin'
    ? 'round_robin'
    : 'round_robin'
}

function resolveFailoverStrategy(value: unknown): PlatformAiFailoverStrategy {
  return toText(value).toLowerCase() === 'model_then_provider'
    ? 'model_then_provider'
    : 'model_then_provider'
}

function normalizeChannelModelsAndFallback(
  key: PlatformAiChannelKey,
  providers: PlatformAiProviderConfig[],
  providerIds: string[],
  input: {
    models: string[]
    modelFallback: string[]
  },
  options?: {
    preserveEmpty?: boolean
  },
): {
  models: string[]
  modelFallback: string[]
} {
  const providerIdSet = new Set(providerIds)
  const eligibleProviders = providers.filter(provider => providerCanServeChannel(provider, key) && providerIdSet.has(provider.id))
  const explicitModels = dedupeStrings(input.models)
  const explicitFallback = dedupeStrings(input.modelFallback)
  const modelSeed = explicitModels.length > 0
    ? explicitModels
    : explicitFallback.length > 0
      ? explicitFallback
      : []
  const models = modelSeed.filter(model => eligibleProviders.some(provider => resolveProviderModelForChannel(provider, model, key)))
  const normalizedModels = models.length > 0
    ? models
    : []
  const fallbackSeed = explicitFallback.length > 0
    ? explicitFallback
    : (options?.preserveEmpty ? [] : normalizedModels)
  const modelSet = new Set(normalizedModels)

  return {
    models: normalizedModels,
    modelFallback: fallbackSeed.filter(model => modelSet.has(model)),
  }
}

function expandLegacyChannelConfig(
  raw: Record<string, unknown>,
  providers: PlatformAiProviderConfig[],
  defaultProviderIds: string[],
): PlatformAiChannelConfig[] {
  const enabled = toBoolean(raw.enabled, true)
  const prompt = String(raw.prompt || '')

  return DOCUMENT_ASSIST_CHANNEL_KEYS.map((key) => {
    const definition = resolveChannelDefinition(key)
    const normalizedProviderIds = [...defaultProviderIds]
    const normalizedModels = normalizeChannelModelsAndFallback(
      key,
      providers,
      normalizedProviderIds,
      {
        models: Array.isArray(raw.models)
          ? dedupeStrings((raw.models as unknown[]).map(item => toText(item)))
          : dedupeStrings([toText(raw.model)]),
        modelFallback: Array.isArray(raw.models)
          ? dedupeStrings((raw.models as unknown[]).map(item => toText(item)))
          : dedupeStrings([toText(raw.model)]),
      },
    )
    return {
      key,
      label: definition.label,
      description: definition.description,
      enabled,
      providerIds: normalizedProviderIds,
      loadBalanceStrategy: 'round_robin',
      models: normalizedModels.models,
      modelFallback: normalizedModels.modelFallback,
      failoverStrategy: 'model_then_provider',
      prompt,
    }
  })
}

function normalizeChannel(
  raw: unknown,
  providers: PlatformAiProviderConfig[],
  defaultProviderIds: string[],
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
  const explicitProviderIds = extractProviderIds(source.providerIds || source.providers)
  const hasExplicitProviderBinding = Array.isArray(source.providerIds) || Array.isArray(source.providers)
  const hasExplicitRoutingConfig = Array.isArray(source.models) || Array.isArray(source.modelFallback) || source.model !== undefined
  const sanitizedProviderIds = explicitProviderIds.filter((providerId) => {
    const provider = providers.find(item => item.id === providerId)
    return Boolean(provider && providerCanServeChannel(provider, key))
  })
  const providerIds = hasExplicitProviderBinding
    ? sanitizedProviderIds
    : explicitProviderIds.length > 0
      ? sanitizedProviderIds
      : (hasExplicitRoutingConfig ? [...defaultProviderIds] : [])
  const normalizedModels = normalizeChannelModelsAndFallback(
    key,
    providers,
    providerIds,
    {
      models: Array.isArray(source.models)
        ? dedupeStrings((source.models as unknown[]).map(item => toText(item)))
        : [],
      modelFallback: Array.isArray(source.modelFallback)
        ? dedupeStrings((source.modelFallback as unknown[]).map(item => toText(item)))
        : Array.isArray(source.models)
          ? dedupeStrings((source.models as unknown[]).map(item => toText(item)))
          : dedupeStrings([toText(source.model)]),
    },
    {
      preserveEmpty: hasExplicitProviderBinding || hasExplicitRoutingConfig,
    },
  )

  return {
    key,
    label: toText(source.label) || definition.label,
    description: toText(source.description) || definition.description,
    enabled: toBoolean(source.enabled, true),
    providerIds,
    loadBalanceStrategy: resolveLoadBalanceStrategy(source.loadBalanceStrategy),
    models: normalizedModels.models,
    modelFallback: normalizedModels.modelFallback,
    failoverStrategy: resolveFailoverStrategy(source.failoverStrategy),
    prompt: String(source.prompt || ''),
  }
}

function parseChannelsFromJson(
  raw: unknown,
  providers: PlatformAiProviderConfig[],
): PlatformAiChannelConfig[] {
  const parsed = parseJsonObject(raw)
  const source = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items))
        ? (parsed as Record<string, unknown>).items as unknown[]
        : []

  const defaultProviderIds = resolveDefaultProviderIds(providers)
  const normalized = source.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return []

    const record = item as Record<string, unknown>
    if (toText(record.key || record.channel || record.scene) === LEGACY_DOCUMENT_ASSIST_KEY)
      return expandLegacyChannelConfig(record, providers, defaultProviderIds)

    const normalizedItem = normalizeChannel(item, providers, defaultProviderIds)
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
      providerIds: [],
      loadBalanceStrategy: 'round_robin',
      models: [],
      modelFallback: [],
      failoverStrategy: 'model_then_provider',
      prompt: '',
    })
  }

  return CHANNEL_DEFINITIONS
    .map(item => map.get(item.key))
    .filter((item): item is PlatformAiChannelConfig => Boolean(item))
}

function buildFallbackAi(runtime: RuntimeSettings): AiRuntimeConfig {
  return {
    ...runtime.ai,
    provider: '',
    baseURL: '',
    apiKey: '',
    model: '',
    clientType: normalizePlatformAiClientType(runtime.ai.clientType),
    format: 'openai-compatible',
  }
}

function resolveProviderModel(
  provider: PlatformAiProviderConfig | null,
  model: string,
  capability: PlatformAiModelCapability = 'chat',
): PlatformAiProviderModelConfig | null {
  if (!provider || !providerCanServeModelCapability(provider, capability))
    return null
  const normalizedModel = toText(model)
  if (!normalizedModel)
    return null
  return provider.models.find(item => item.model === normalizedModel && item.enabled && platformAiModelHasCapability(item, capability)) || null
}

function buildAiRuntimeFromModel(
  runtime: RuntimeSettings,
  provider: PlatformAiProviderConfig,
  model: PlatformAiProviderModelConfig,
): AiRuntimeConfig {
  return {
    ...runtime.ai,
    provider: provider.provider || provider.type,
    clientType: model.clientType,
    baseURL: provider.baseURL,
    apiKey: provider.apiKey,
    model: model.model,
    format: model.format,
    timeoutMs: provider.timeoutMs,
    maxRetries: provider.maxRetries,
  }
}

function providerCanServeModelLessChannel(provider: PlatformAiProviderConfig, key: PlatformAiChannelKey): boolean {
  const capability = resolvePlatformAiChannelModelCapability(key)
  return (provider.capability === 'voice' || provider.capability === 'realtime')
    && (provider.type === 'coze-voice' || provider.type === 'dashscope-bailian')
    && (capability === 'asr' || capability === 'tts')
}

function buildAiRuntimeFromProvider(
  runtime: RuntimeSettings,
  provider: PlatformAiProviderConfig,
): AiRuntimeConfig {
  return {
    ...runtime.ai,
    provider: provider.provider || provider.type,
    clientType: provider.clientType,
    baseURL: provider.baseURL,
    apiKey: provider.apiKey,
    model: '',
    format: 'openai-compatible',
    timeoutMs: provider.timeoutMs,
    maxRetries: provider.maxRetries,
  }
}

export function resolvePlatformAiChannelModelCapability(key: PlatformAiChannelKey): PlatformAiModelCapability {
  return resolveChannelDefinition(key).requiredModelCapability
}

export function resolvePlatformAiChannelEmbeddingApiStyle(key: PlatformAiChannelKey): ProjectKnowledgeEmbeddingApiStyle | null {
  return resolveChannelDefinition(key).embeddingApiStyle || null
}

function platformAiModelMatchesChannel(
  model: Pick<PlatformAiProviderModelConfig, 'capabilities' | 'embeddingApiStyle'> | null | undefined,
  key: PlatformAiChannelKey,
): boolean {
  const capability = resolvePlatformAiChannelModelCapability(key)
  if (!platformAiModelHasCapability(model, capability))
    return false

  const embeddingApiStyle = resolvePlatformAiChannelEmbeddingApiStyle(key)
  if (!embeddingApiStyle)
    return true

  return normalizeProjectKnowledgeEmbeddingApiStyle(model?.embeddingApiStyle) === embeddingApiStyle
}

function resolveProviderModelForChannel(
  provider: PlatformAiProviderConfig | null,
  model: string,
  key: PlatformAiChannelKey,
): PlatformAiProviderModelConfig | null {
  const modelConfig = resolveProviderModel(provider, model, resolvePlatformAiChannelModelCapability(key))
  if (!platformAiModelMatchesChannel(modelConfig, key))
    return null
  return modelConfig
}

export function resolvePlatformAiRuntimeByCapability(
  runtime: RuntimeSettings,
  capability: PlatformAiModelCapability,
  preferredModel?: string,
): PlatformAiResolvedCapabilityRuntime | null {
  const registry = resolvePlatformAiRegistry(runtime)
  const preferred = toText(preferredModel)
  const enabledProviders = registry.providers.filter(provider => provider.enabled && providerCanServeModelCapability(provider, capability))
  const providers = enabledProviders.length > 0
    ? enabledProviders
    : registry.providers.filter(provider => providerCanServeModelCapability(provider, capability))

  const modelOrder = dedupeStrings([
    preferred,
    ...providers.flatMap(provider => provider.models)
      .filter(model => model.enabled && platformAiModelHasCapability(model, capability))
      .map(model => model.model),
  ])

  for (const model of modelOrder) {
    for (const provider of providers) {
      const modelConfig = resolveProviderModel(provider, model, capability)
      if (!modelConfig)
        continue
      return {
        provider,
        modelConfig,
        ai: buildAiRuntimeFromModel(runtime, provider, modelConfig),
      }
    }
  }

  return null
}

function rotateProviders(
  channelKey: PlatformAiChannelKey,
  model: string,
  providers: PlatformAiProviderConfig[],
  strategy: PlatformAiLoadBalanceStrategy,
): PlatformAiProviderConfig[] {
  if (providers.length <= 1 || strategy !== 'round_robin')
    return providers

  const pointerKey = `${channelKey}:${model}:${providers.map(item => item.id).join(',')}`
  const startIndex = Number(LEGACY_ROUND_ROBIN_POINTERS.get(pointerKey) || 0) % providers.length
  LEGACY_ROUND_ROBIN_POINTERS.set(pointerKey, (startIndex + 1) % providers.length)

  return providers.map((_, index) => providers[(startIndex + index) % providers.length]!)
}

function resolveEligibleChannelProviders(
  channel: PlatformAiChannelConfig,
  providers: PlatformAiProviderConfig[],
): PlatformAiProviderConfig[] {
  const providerMap = new Map(providers.map(provider => [provider.id, provider]))
  const requestedProviderIds = channel.providerIds
  return requestedProviderIds
    .map(providerId => providerMap.get(providerId) || null)
    .filter((provider): provider is PlatformAiProviderConfig => Boolean(provider && provider.enabled && providerCanServeChannel(provider, channel.key)))
}

function resolveChannelCandidates(
  runtime: RuntimeSettings,
  channel: PlatformAiChannelConfig,
  providers: PlatformAiProviderConfig[],
): { candidates: PlatformAiResolvedChannelCandidate[], usedFallback: boolean } {
  const fallbackAi = buildFallbackAi(runtime)
  const eligibleProviders = resolveEligibleChannelProviders(channel, providers)
  if (!channel.enabled || eligibleProviders.length === 0) {
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

  const requestedModels = dedupeStrings(channel.modelFallback.length > 0 ? channel.modelFallback : channel.models)
  const modelOrder = requestedModels.filter(model => eligibleProviders.some(provider => resolveProviderModelForChannel(provider, model, channel.key)))
  const usedFallback = modelOrder.length === 0

  const candidates: PlatformAiResolvedChannelCandidate[] = []
  let candidateIndex = 0

  for (const model of modelOrder) {
    const providersWithModel = eligibleProviders.filter(provider => resolveProviderModelForChannel(provider, model, channel.key))
    const orderedProviders = rotateProviders(channel.key, model, providersWithModel, channel.loadBalanceStrategy)
    for (const provider of orderedProviders) {
      const modelConfig = resolveProviderModelForChannel(provider, model, channel.key)
      if (!modelConfig)
        continue
      candidates.push({
        index: candidateIndex,
        provider,
        modelConfig,
        ai: buildAiRuntimeFromModel(runtime, provider, modelConfig),
      })
      candidateIndex += 1
    }
  }

  const modelLessProviders = eligibleProviders.filter(provider => providerCanServeModelLessChannel(provider, channel.key))
  for (const provider of rotateProviders(channel.key, '__model_less__', modelLessProviders, channel.loadBalanceStrategy)) {
    candidates.push({
      index: candidateIndex,
      provider,
      modelConfig: null,
      ai: buildAiRuntimeFromProvider(runtime, provider),
    })
    candidateIndex += 1
  }

  if (candidates.length > 0) {
    return {
      candidates,
      usedFallback,
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

function toSerializableProvider(item: PlatformAiProviderConfig): PlatformAiProviderConfig {
  return {
    ...item,
    models: item.models.map(model => serializeProviderModel(model)),
  }
}

function toSerializableChannels(items: PlatformAiChannelConfig[]): PlatformAiChannelConfig[] {
  return items.map((item) => {
    const models = dedupeStrings(item.models)
    const modelSet = new Set(models)
    const modelFallback = dedupeStrings(item.modelFallback).filter(model => modelSet.has(model))
    return {
      ...item,
      providerIds: dedupeStrings(item.providerIds),
      models,
      modelFallback,
      failoverStrategy: resolveFailoverStrategy(item.failoverStrategy),
      prompt: String(item.prompt || ''),
    }
  })
}

function buildModelCatalogJson(providers: PlatformAiProviderConfig[]): string {
  const groups = providers
    .filter(provider => provider.capability !== 'search')
    .map((provider) => {
      const options = provider.models
        .filter(item => item.enabled)
        .map((item) => {
          const priceText = item.inputPricePer1M === null && item.outputPricePer1M === null
            ? defaultModelPricingText
            : `输入 ${item.inputPricePer1M === null ? '-' : `${item.currency} ${item.inputPricePer1M.toFixed(4)}/1M`} · 输出 ${item.outputPricePer1M === null ? '-' : `${item.currency} ${item.outputPricePer1M.toFixed(4)}/1M`}`
          return {
            id: `${provider.id}:${item.model}`,
            label: item.label || item.model,
            provider: provider.provider,
            model: item.model,
            capabilities: item.capabilities,
            description: `${provider.name} · ${item.capabilities.join('/')} · ${item.format} · ${priceText}`,
          }
        })

      return options.length > 0
        ? {
            key: provider.id,
            label: provider.name,
            options,
          }
        : null
    })
    .filter(Boolean)

  return JSON.stringify({ groups }, null, 2)
}

function buildModelPricingJson(providers: PlatformAiProviderConfig[]): string {
  const items = providers
    .filter(provider => provider.capability !== 'search')
    .flatMap(provider => provider.models
      .filter(model => model.inputPricePer1M !== null || model.outputPricePer1M !== null)
      .map(model => ({
        providerId: provider.id,
        provider: provider.provider,
        model: model.model,
        inputPricePer1M: model.inputPricePer1M,
        outputPricePer1M: model.outputPricePer1M,
        currency: model.currency,
        pricingSource: model.pricingSource,
      })))

  return JSON.stringify({ items }, null, 2)
}

export function getPlatformAiChannelDefinitions(): PlatformAiChannelDefinition[] {
  return [...CHANNEL_DEFINITIONS]
}

export function resolvePlatformAiRegistry(runtime: RuntimeSettings): PlatformAiResolvedRegistry {
  const providerState = parseProviderState(runtime.ai.providersJson, runtime)
  const channels = parseChannelsFromJson(runtime.ai.channelsJson, providerState.providers)

  return {
    providers: providerState.providers.map(item => toSerializableProvider(item)),
    channels,
  }
}

export function buildPlatformAiRegistryJson(runtime: RuntimeSettings, raw: unknown): string {
  const parsed = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}

  const providers = Array.isArray(parsed.providers)
    ? parsed.providers
    : []

  const structured = parseProviderState(JSON.stringify({
    version: PLATFORM_AI_REGISTRY_VERSION,
    providers,
  }), runtime)

  return JSON.stringify({
    version: PLATFORM_AI_REGISTRY_VERSION,
    providers: structured.providers.map(provider => ({
      ...provider,
      models: provider.models.map(item => serializeProviderModel(item)),
    })),
  }, null, 2)
}

export function buildPlatformAiChannelsJson(
  runtime: RuntimeSettings,
  raw: unknown,
  providers?: PlatformAiProviderConfig[],
): string {
  const registry = resolvePlatformAiRegistry(runtime)
  const sourceProviders = Array.isArray(providers) ? providers : registry.providers
  const source = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).items))
        ? (raw as Record<string, unknown>).items as unknown[]
        : []

  const defaultProviderIds = resolveDefaultProviderIds(sourceProviders)
  const channels = source
    .flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return []
      const record = item as Record<string, unknown>
      if (toText(record.key || record.channel || record.scene) === LEGACY_DOCUMENT_ASSIST_KEY)
        return expandLegacyChannelConfig(record, sourceProviders, defaultProviderIds)
      const normalizedItem = normalizeChannel(item, sourceProviders, defaultProviderIds)
      return normalizedItem ? [normalizedItem] : []
    })
  const merged = parseChannelsFromJson(JSON.stringify({ items: channels }), sourceProviders)

  return JSON.stringify({
    version: PLATFORM_AI_REGISTRY_VERSION,
    items: toSerializableChannels(merged),
  }, null, 2)
}

export function resolvePlatformAiModelCatalogJson(runtime: RuntimeSettings): string {
  const registry = resolvePlatformAiRegistry(runtime)
  return buildModelCatalogJson(registry.providers)
}

export function resolvePlatformAiModelPricingJson(runtime: RuntimeSettings): string {
  const registry = resolvePlatformAiRegistry(runtime)
  return buildModelPricingJson(registry.providers)
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
  const fallbackAi = buildFallbackAi(runtime)
  const channel = registry.channels.find(item => item.key === key) || {
    key,
    label: key,
    description: '',
    enabled: true,
    providerIds: [],
    loadBalanceStrategy: 'round_robin' as const,
    models: [],
    modelFallback: [],
    failoverStrategy: 'model_then_provider' as const,
    prompt: '',
  }
  const resolved = resolveChannelCandidates(runtime, channel, registry.providers)
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
  options?: {
    shouldContinueOnError?: (input: {
      candidate: PlatformAiResolvedChannelCandidate
      error: unknown
      attemptChain: PlatformAiChannelAttemptSummary[]
    }) => boolean
  },
): Promise<PlatformAiChannelRunResult<T>> {
  const resolved = resolveAiRuntimeForChannel(runtime, key)
  const attemptChain: PlatformAiChannelAttemptSummary[] = []
  let lastError: unknown
  const requestStartedAt = Date.now()

  for (const candidate of resolved.candidates) {
    const attemptStartedAt = Date.now()
    try {
      const data = await run({
        ai: candidate.ai,
        channel: resolved.channel,
        prompt: resolved.prompt,
        provider: candidate.provider,
        candidate,
      })
      const attemptLatencyMs = Date.now() - attemptStartedAt
      attemptChain.push({
        provider: candidate.ai.provider,
        model: candidate.ai.model,
        success: true,
        latencyMs: attemptLatencyMs,
      })
      const latencyMs = Date.now() - requestStartedAt
      console.warn('[platform-ai] request succeeded', {
        channelKey: key,
        provider: candidate.ai.provider,
        model: candidate.ai.model,
        providerId: candidate.provider?.id || null,
        fallbackUsed: resolved.usedFallback || candidate.index > 0,
        attempts: attemptChain.length,
        latencyMs,
        attemptChain,
      })
      return {
        data,
        provider: candidate.provider,
        ai: candidate.ai,
        channel: resolved.channel,
        prompt: resolved.prompt,
        usedFallback: resolved.usedFallback || candidate.index > 0,
        attemptChain,
        latencyMs,
      }
    }
    catch (error) {
      const attemptLatencyMs = Date.now() - attemptStartedAt
      lastError = error
      attemptChain.push({
        provider: candidate.ai.provider,
        model: candidate.ai.model,
        success: false,
        latencyMs: attemptLatencyMs,
        error: error instanceof Error ? (error.message || 'UNKNOWN_ERROR') : 'UNKNOWN_ERROR',
      })
      const shouldStopAfterError = options?.shouldContinueOnError
        && !options.shouldContinueOnError({ candidate, error, attemptChain })
      if (shouldStopAfterError)
        break
    }
  }

  const latencyMs = Date.now() - requestStartedAt
  console.error('[platform-ai] request failed', {
    channelKey: key,
    fallbackUsed: resolved.usedFallback || attemptChain.length > 1,
    attempts: attemptChain.length,
    latencyMs,
    attemptChain,
    error: lastError instanceof Error ? (lastError.message || 'UNKNOWN_ERROR') : 'UNKNOWN_ERROR',
  })

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
        capabilities: model.capabilities,
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
