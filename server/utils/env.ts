import type { H3Event } from 'h3'
import type {
  PlatformAiClientType,
  ProjectKnowledgeEmbeddingApiStyle,
} from '~~/shared/types/domain'
import { useRuntimeConfig } from '#imports'
import {
  normalizePlatformAiClientType,
  normalizeProjectKnowledgeEmbeddingApiStyle,
} from '~~/server/utils/platform-ai-client'
import { normalizeApiBase } from '~~/shared/utils/api-url'

function toNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw))
    return raw
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed))
      return parsed
  }
  return fallback
}

const DEFAULT_ONLYOFFICE_TIMEOUT_MS = 120000
const DEFAULT_ONLYOFFICE_RETRY_LIMIT = 3
const DEFAULT_ONLYOFFICE_WORKER_INTERVAL_MS = 2500
const DEFAULT_ONLYOFFICE_WORKER_BATCH_SIZE = 2
const DEFAULT_PROJECT_RESOURCE_ACCESS_URL_TTL_SECONDS = 600
const DEFAULT_STORAGE_WATERMARK_PERCENT = 90
const ONLYOFFICE_SOURCE_BASE_HINT_KEY = Symbol.for('winloop.onlyoffice.source-base.hint.v1')

interface OnlyOfficeSourceBaseHintState {
  value: string
  warnedFallback: boolean
}

function trimTrailingSlash(value: string): string {
  return String(value || '').trim().replace(/\/+$/g, '')
}

function getOnlyOfficeSourceBaseHintState(): OnlyOfficeSourceBaseHintState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[ONLYOFFICE_SOURCE_BASE_HINT_KEY] as OnlyOfficeSourceBaseHintState | undefined
  if (existing)
    return existing

  const created: OnlyOfficeSourceBaseHintState = {
    value: '',
    warnedFallback: false,
  }
  globalRef[ONLYOFFICE_SOURCE_BASE_HINT_KEY] = created
  return created
}

function getFirstHeaderValue(rawValue: string | string[] | undefined): string {
  const first = Array.isArray(rawValue) ? (rawValue[0] || '') : (rawValue || '')
  return String(first).split(',')[0]?.trim() || ''
}

function resolveRequestOrigin(event?: H3Event): string {
  if (!event)
    return ''

  const req = event.node?.req
  if (!req)
    return ''

  const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto'])
  const forwardedHost = getFirstHeaderValue(req.headers['x-forwarded-host'])
  const host = forwardedHost || getFirstHeaderValue(req.headers.host)
  if (!host)
    return ''

  const socket = req.socket as { encrypted?: boolean } | undefined
  const proto = forwardedProto
    ? forwardedProto.toLowerCase()
    : (socket?.encrypted ? 'https' : 'http')
  const protocol = proto === 'https' ? 'https' : 'http'

  try {
    return trimTrailingSlash(new URL(`${protocol}://${host}`).origin)
  }
  catch {
    return ''
  }
}

function resolveOnlyOfficeSourceBaseURL(runtime: ReturnType<typeof useRuntimeConfig>, event?: H3Event): string {
  const hintState = getOnlyOfficeSourceBaseHintState()
  const explicitSourceBase = trimTrailingSlash(String(runtime.onlyOffice?.sourceBaseURL ?? ''))
  if (/^https?:\/\//i.test(explicitSourceBase)) {
    hintState.value = explicitSourceBase
    return explicitSourceBase
  }

  const apiBaseUrl = String(runtime.public?.apiBaseUrl ?? '').trim()
  if (/^https?:\/\//i.test(apiBaseUrl)) {
    try {
      const origin = trimTrailingSlash(new URL(apiBaseUrl).origin)
      hintState.value = origin
      return origin
    }
    catch {
      return ''
    }
  }

  const requestOrigin = resolveRequestOrigin(event)
  if (requestOrigin) {
    hintState.value = requestOrigin
    return requestOrigin
  }

  if (hintState.value)
    return hintState.value

  if (trimTrailingSlash(String(runtime.onlyOffice?.endpoint ?? '')) && !hintState.warnedFallback) {
    hintState.warnedFallback = true
    console.warn('[runtime-settings] ONLYOFFICE sourceBaseURL 未配置且无法从运行时推断。请显式设置 WINLOOP_PUBLIC_BASE_URL。')
  }

  return ''
}

export interface RuntimeSettings {
  envPriority: string
  apiBaseUrl: string
  build: {
    version: string
    commitSha: string
  }
  ai: {
    provider: string
    clientType: PlatformAiClientType
    baseURL: string
    apiKey: string
    model: string
    embeddingModel: string
    embeddingApiStyle: ProjectKnowledgeEmbeddingApiStyle
    embeddingDimensions: number
    visionModel: string
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
  }
  docAi: {
    provider: string
    baseURL: string
    apiKey: string
    model: string
    modelPricingJson: string
    timeoutMs: number
    maxRetries: number
  }
  auth: {
    registrationEnabled: boolean
  }
  onlyOffice: {
    endpoint: string
    sourceBaseURL: string
    jwtSecret: string
    timeoutMs: number
    retryLimit: number
    workerEnabled: boolean
    workerIntervalMs: number
    workerBatchSize: number
  }
  storage: {
    provider: string
    localRoot: string
    endpoint: string
    region: string
    bucket: string
    accessKey: string
    secretKey: string
    forcePathStyle: boolean
    primaryChannelId: string
    channels: RuntimeStorageChannel[]
  }
  adminAi: {
    enabled: boolean
    tavilyApiKey: string
    webTimeoutMs: number
    maxWebResults: number
    maxPageChars: number
  }
  pg: {
    url: string
  }
  redis: {
    url: string
  }
  contest: {
    autoSeed: boolean
  }
  resourceRecycle: {
    enabled: boolean
    intervalMs: number
    retentionDays: number
    batchSize: number
  }
  feishuScheduler: {
    enabled: boolean
    intervalMs: number
    batchSize: number
    lockTtlMs: number
  }
  projectResource: {
    accessUrlTtlSeconds: number
  }
  meeting: {
    rtc: {
      provider: string
      serverUrl: string
      apiKey: string
      apiSecret: string
      embedBaseUrl: string
      webhookSecret: string
      roomPrefix: string
    }
    asr: {
      provider: string
      serviceUrl: string
      apiKey: string
      webhookSecret: string
    }
    worker: {
      enabled: boolean
      intervalMs: number
      batchSize: number
      maxAttempts: number
    }
    monitoring: {
      prometheusBaseUrl: string
    }
  }
  defenseRealtime: {
    qwen: {
      baseWsUrl: string
      apiKey: string
      workspaceId: string
      appId: string
      voice: string
      frameIntervalMs: number
    }
    coze: {
      baseUrl: string
      botId: string
      connectorId: string
      voiceId: string
      authMode: string
      patOrOauthSecret: string
    }
  }
}

export type RuntimeStorageProvider = 'local' | 's3' | 'minio'

export interface RuntimeStorageChannel {
  id: string
  name: string
  provider: RuntimeStorageProvider
  enabled: boolean
  priority: number
  capacityBytes: number
  watermarkPercent: number
  localRoot: string
  endpoint: string
  region: string
  bucket: string
  accessKey: string
  secretKey: string
  forcePathStyle: boolean
}

function toBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized))
      return true
    if (['0', 'false', 'no', 'off'].includes(normalized))
      return false
  }
  return fallback
}

function normalizeStorageProvider(raw: unknown): RuntimeStorageProvider {
  const normalized = String(raw || '').trim().toLowerCase()
  if (normalized === 's3' || normalized === 'minio')
    return normalized
  return 'local'
}

function normalizeStorageChannelId(raw: unknown, fallback: string): string {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function normalizeStorageChannel(raw: unknown, fallback: RuntimeStorageChannel, index: number): RuntimeStorageChannel {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const provider = normalizeStorageProvider(source.provider ?? fallback.provider)
  const id = normalizeStorageChannelId(source.id, index === 0 ? fallback.id : `${provider}-${index + 1}`)
  const capacityBytes = Math.max(0, Math.trunc(toNumber(source.capacityBytes, fallback.capacityBytes)))
  const watermarkPercent = Math.max(1, Math.min(100, Math.trunc(toNumber(source.watermarkPercent, fallback.watermarkPercent))))
  return {
    id,
    name: String(source.name ?? fallback.name ?? '').trim() || id,
    provider,
    enabled: toBoolean(source.enabled, fallback.enabled),
    priority: Math.max(0, Math.trunc(toNumber(source.priority, fallback.priority))),
    capacityBytes,
    watermarkPercent,
    localRoot: String(source.localRoot ?? fallback.localRoot ?? './tmp/document-storage').trim() || './tmp/document-storage',
    endpoint: trimTrailingSlash(String(source.endpoint ?? fallback.endpoint ?? '')),
    region: String(source.region ?? fallback.region ?? '').trim(),
    bucket: String(source.bucket ?? fallback.bucket ?? '').trim(),
    accessKey: String(source.accessKey ?? fallback.accessKey ?? ''),
    secretKey: String(source.secretKey ?? fallback.secretKey ?? ''),
    forcePathStyle: toBoolean(source.forcePathStyle, fallback.forcePathStyle),
  }
}

function buildDefaultStorageChannel(storage: {
  provider: string
  localRoot: string
  endpoint: string
  region: string
  bucket: string
  accessKey: string
  secretKey: string
  forcePathStyle: boolean
}): RuntimeStorageChannel {
  const provider = normalizeStorageProvider(storage.provider)
  return {
    id: provider === 'local' ? 'local' : provider,
    name: provider === 'local' ? '本机存储' : provider,
    provider,
    enabled: true,
    priority: 0,
    capacityBytes: 0,
    watermarkPercent: DEFAULT_STORAGE_WATERMARK_PERCENT,
    localRoot: storage.localRoot || './tmp/document-storage',
    endpoint: storage.endpoint || '',
    region: storage.region || '',
    bucket: storage.bucket || '',
    accessKey: storage.accessKey || '',
    secretKey: storage.secretKey || '',
    forcePathStyle: storage.forcePathStyle,
  }
}

export function normalizeRuntimeStorageSettings(storage: RuntimeSettings['storage']): RuntimeSettings['storage'] {
  const legacy = {
    provider: String(storage?.provider ?? 'local'),
    localRoot: String(storage?.localRoot ?? './tmp/document-storage'),
    endpoint: trimTrailingSlash(String(storage?.endpoint ?? '')),
    region: String(storage?.region ?? ''),
    bucket: String(storage?.bucket ?? ''),
    accessKey: String(storage?.accessKey ?? ''),
    secretKey: String(storage?.secretKey ?? ''),
    forcePathStyle: toBoolean(storage?.forcePathStyle, true),
  }
  const defaultChannel = buildDefaultStorageChannel(legacy)
  const rawChannels = Array.isArray(storage?.channels) ? storage.channels : []
  const channelsById = new Map<string, RuntimeStorageChannel>()

  const localFallback: RuntimeStorageChannel = {
    ...defaultChannel,
    id: 'local',
    name: '本机存储',
    provider: 'local',
    priority: defaultChannel.provider === 'local' ? defaultChannel.priority : 0,
    localRoot: legacy.localRoot || './tmp/document-storage',
  }
  channelsById.set(localFallback.id, localFallback)

  if (rawChannels.length === 0 && defaultChannel.id !== 'local')
    channelsById.set(defaultChannel.id, defaultChannel)

  rawChannels.forEach((raw, index) => {
    const fallback = index === 0 ? defaultChannel : {
      ...defaultChannel,
      id: `${defaultChannel.provider}-${index + 1}`,
      name: `${defaultChannel.provider}-${index + 1}`,
      priority: index,
    }
    const channel = normalizeStorageChannel(raw, fallback, index)
    channelsById.set(channel.id, channel.id === 'local'
      ? {
          ...channel,
          name: channel.name || '本机存储',
          provider: 'local',
          endpoint: '',
          region: '',
          bucket: '',
          accessKey: '',
          secretKey: '',
          forcePathStyle: true,
        }
      : channel)
  })

  const channels = [...channelsById.values()]
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .map((channel, index) => ({
      ...channel,
      priority: Math.max(0, Math.trunc(Number.isFinite(channel.priority) ? channel.priority : index)),
    }))

  const primaryChannelId = normalizeStorageChannelId(storage?.primaryChannelId, defaultChannel.id)
  const resolvedPrimary = channels.some(channel => channel.id === primaryChannelId && channel.enabled)
    ? primaryChannelId
    : (channels.find(channel => channel.id === defaultChannel.id && channel.enabled)?.id || channels.find(channel => channel.enabled)?.id || channels[0]?.id || 'local')
  const activeChannel = channels.find(channel => channel.id === resolvedPrimary) || channels[0] || localFallback

  return {
    provider: activeChannel.provider,
    localRoot: activeChannel.localRoot,
    endpoint: activeChannel.endpoint,
    region: activeChannel.region,
    bucket: activeChannel.bucket,
    accessKey: activeChannel.accessKey,
    secretKey: activeChannel.secretKey,
    forcePathStyle: activeChannel.forcePathStyle,
    primaryChannelId: resolvedPrimary,
    channels,
  }
}

export function readRuntimeSettings(event?: H3Event): RuntimeSettings {
  const runtime = useRuntimeConfig(event)
  const runtimeDefenseRealtime = runtime.defenseRealtime && typeof runtime.defenseRealtime === 'object' && !Array.isArray(runtime.defenseRealtime)
    ? runtime.defenseRealtime as Record<string, unknown>
    : {}
  const runtimeDefenseRealtimeQwen = runtimeDefenseRealtime.qwen && typeof runtimeDefenseRealtime.qwen === 'object' && !Array.isArray(runtimeDefenseRealtime.qwen)
    ? runtimeDefenseRealtime.qwen as Record<string, unknown>
    : {}
  const runtimeDefenseRealtimeCoze = runtimeDefenseRealtime.coze && typeof runtimeDefenseRealtime.coze === 'object' && !Array.isArray(runtimeDefenseRealtime.coze)
    ? runtimeDefenseRealtime.coze as Record<string, unknown>
    : {}

  const storageSettings = normalizeRuntimeStorageSettings({
    provider: String(runtime.storage?.provider ?? 'local'),
    localRoot: String(runtime.storage?.localRoot ?? './tmp/document-storage'),
    endpoint: String(runtime.storage?.endpoint ?? ''),
    region: String(runtime.storage?.region ?? ''),
    bucket: String(runtime.storage?.bucket ?? ''),
    accessKey: String(runtime.storage?.accessKey ?? ''),
    secretKey: String(runtime.storage?.secretKey ?? ''),
    forcePathStyle: toBoolean(runtime.storage?.forcePathStyle, true),
    primaryChannelId: String(runtime.storage?.primaryChannelId ?? ''),
    channels: Array.isArray(runtime.storage?.channels) ? runtime.storage.channels as RuntimeStorageChannel[] : [],
  })

  return {
    envPriority: String(runtime.envPriority ?? '.env.local > .env.prod > .env.dev > .env'),
    apiBaseUrl: normalizeApiBase(String(runtime.public?.apiBaseUrl ?? '/api')),
    build: {
      version: String(runtime.build?.version ?? ''),
      commitSha: String(runtime.build?.commitSha ?? ''),
    },
    ai: {
      provider: String(runtime.ai?.provider ?? ''),
      clientType: normalizePlatformAiClientType(runtime.ai?.clientType),
      baseURL: String(runtime.ai?.baseURL ?? ''),
      apiKey: String(runtime.ai?.apiKey ?? ''),
      model: String(runtime.ai?.model ?? ''),
      embeddingModel: String(runtime.ai?.embeddingModel ?? ''),
      embeddingApiStyle: normalizeProjectKnowledgeEmbeddingApiStyle(runtime.ai?.embeddingApiStyle),
      embeddingDimensions: Math.max(0, Math.trunc(toNumber(runtime.ai?.embeddingDimensions, 1024))),
      visionModel: String(runtime.ai?.visionModel ?? ''),
      modelCatalogJson: String(runtime.ai?.modelCatalogJson ?? ''),
      modelPricingJson: String(runtime.ai?.modelPricingJson ?? ''),
      providersJson: String(runtime.ai?.providersJson ?? ''),
      channelsJson: String(runtime.ai?.channelsJson ?? ''),
      temperature: toNumber(runtime.ai?.temperature, 0.2),
      topP: toNumber(runtime.ai?.topP, 1),
      maxTokens: toNumber(runtime.ai?.maxTokens, 0),
      presencePenalty: toNumber(runtime.ai?.presencePenalty, 0),
      frequencyPenalty: toNumber(runtime.ai?.frequencyPenalty, 0),
      timeoutMs: toNumber(runtime.ai?.timeoutMs, 15000),
      maxRetries: toNumber(runtime.ai?.maxRetries, 2),
    },
    docAi: {
      provider: String(runtime.docAi?.provider ?? ''),
      baseURL: String(runtime.docAi?.baseURL ?? ''),
      apiKey: String(runtime.docAi?.apiKey ?? ''),
      model: String(runtime.docAi?.model ?? ''),
      modelPricingJson: String(runtime.docAi?.modelPricingJson ?? ''),
      timeoutMs: toNumber(runtime.docAi?.timeoutMs, 15000),
      maxRetries: toNumber(runtime.docAi?.maxRetries, 2),
    },
    auth: {
      registrationEnabled: toBoolean(runtime.auth?.registrationEnabled, true),
    },
    onlyOffice: {
      endpoint: String(runtime.onlyOffice?.endpoint ?? ''),
      sourceBaseURL: resolveOnlyOfficeSourceBaseURL(runtime, event),
      jwtSecret: String(runtime.onlyOffice?.jwtSecret ?? ''),
      timeoutMs: DEFAULT_ONLYOFFICE_TIMEOUT_MS,
      retryLimit: DEFAULT_ONLYOFFICE_RETRY_LIMIT,
      workerEnabled: true,
      workerIntervalMs: DEFAULT_ONLYOFFICE_WORKER_INTERVAL_MS,
      workerBatchSize: DEFAULT_ONLYOFFICE_WORKER_BATCH_SIZE,
    },
    storage: storageSettings,
    adminAi: {
      enabled: toBoolean(runtime.adminAi?.enabled, false),
      tavilyApiKey: String(runtime.adminAi?.tavilyApiKey ?? ''),
      webTimeoutMs: toNumber(runtime.adminAi?.webTimeoutMs, 12000),
      maxWebResults: Math.max(1, Math.min(10, toNumber(runtime.adminAi?.maxWebResults, 5))),
      maxPageChars: Math.max(1000, Math.min(50000, toNumber(runtime.adminAi?.maxPageChars, 10000))),
    },
    pg: {
      url: String(runtime.pg?.url ?? 'postgresql://winloop@127.0.0.1:5432/winloop'),
    },
    redis: {
      url: String(runtime.redis?.url ?? 'redis://127.0.0.1:6379/0'),
    },
    contest: {
      autoSeed: toBoolean(runtime.contest?.autoSeed, false),
    },
    resourceRecycle: {
      enabled: toBoolean(runtime.resourceRecycle?.enabled, true),
      intervalMs: Math.max(60_000, Math.min(24 * 60 * 60 * 1000, toNumber(runtime.resourceRecycle?.intervalMs, 1_800_000))),
      retentionDays: Math.max(1, Math.min(365, Math.trunc(toNumber(runtime.resourceRecycle?.retentionDays, 30)))),
      batchSize: Math.max(20, Math.min(1000, Math.trunc(toNumber(runtime.resourceRecycle?.batchSize, 200)))),
    },
    feishuScheduler: {
      enabled: toBoolean(runtime.feishuScheduler?.enabled, true),
      intervalMs: Math.max(15_000, Math.min(24 * 60 * 60 * 1000, toNumber(runtime.feishuScheduler?.intervalMs, 60_000))),
      batchSize: Math.max(1, Math.min(200, Math.trunc(toNumber(runtime.feishuScheduler?.batchSize, 20)))),
      lockTtlMs: Math.max(60_000, Math.min(24 * 60 * 60 * 1000, toNumber(runtime.feishuScheduler?.lockTtlMs, 10 * 60 * 1000))),
    },
    projectResource: {
      accessUrlTtlSeconds: Math.max(60, Math.min(2 * 60 * 60, Math.trunc(toNumber(runtime.projectResource?.accessUrlTtlSeconds, DEFAULT_PROJECT_RESOURCE_ACCESS_URL_TTL_SECONDS)))),
    },
    meeting: {
      rtc: {
        provider: String(runtime.meeting?.rtc?.provider ?? ''),
        serverUrl: trimTrailingSlash(String(runtime.meeting?.rtc?.serverUrl ?? '')),
        apiKey: String(runtime.meeting?.rtc?.apiKey ?? ''),
        apiSecret: String(runtime.meeting?.rtc?.apiSecret ?? ''),
        embedBaseUrl: trimTrailingSlash(String(runtime.meeting?.rtc?.embedBaseUrl ?? '')),
        webhookSecret: String(runtime.meeting?.rtc?.webhookSecret ?? ''),
        roomPrefix: String(runtime.meeting?.rtc?.roomPrefix ?? 'winloop'),
      },
      asr: {
        provider: String(runtime.meeting?.asr?.provider ?? ''),
        serviceUrl: trimTrailingSlash(String(runtime.meeting?.asr?.serviceUrl ?? '')),
        apiKey: String(runtime.meeting?.asr?.apiKey ?? ''),
        webhookSecret: String(runtime.meeting?.asr?.webhookSecret ?? ''),
      },
      worker: {
        enabled: toBoolean(runtime.meeting?.worker?.enabled, true),
        intervalMs: Math.max(1000, Math.min(60_000, Math.trunc(toNumber(runtime.meeting?.worker?.intervalMs, 5000)))),
        batchSize: Math.max(1, Math.min(50, Math.trunc(toNumber(runtime.meeting?.worker?.batchSize, 6)))),
        maxAttempts: Math.max(1, Math.min(20, Math.trunc(toNumber(runtime.meeting?.worker?.maxAttempts, 5)))),
      },
      monitoring: {
        prometheusBaseUrl: trimTrailingSlash(String(runtime.meeting?.monitoring?.prometheusBaseUrl ?? '')),
      },
    },
    defenseRealtime: {
      qwen: {
        baseWsUrl: trimTrailingSlash(String(runtimeDefenseRealtimeQwen.baseWsUrl ?? 'wss://dashscope.aliyuncs.com/api-ws/v1/inference')),
        apiKey: String(runtimeDefenseRealtimeQwen.apiKey ?? ''),
        workspaceId: String(runtimeDefenseRealtimeQwen.workspaceId ?? ''),
        appId: String(runtimeDefenseRealtimeQwen.appId ?? ''),
        voice: String(runtimeDefenseRealtimeQwen.voice ?? ''),
        frameIntervalMs: Math.max(250, Math.min(5000, Math.trunc(toNumber(runtimeDefenseRealtimeQwen.frameIntervalMs, 1000)))),
      },
      coze: {
        baseUrl: trimTrailingSlash(String(runtimeDefenseRealtimeCoze.baseUrl ?? 'https://api.coze.cn')),
        botId: String(runtimeDefenseRealtimeCoze.botId ?? ''),
        connectorId: String(runtimeDefenseRealtimeCoze.connectorId ?? ''),
        voiceId: String(runtimeDefenseRealtimeCoze.voiceId ?? ''),
        authMode: String(runtimeDefenseRealtimeCoze.authMode ?? 'pat'),
        patOrOauthSecret: String(runtimeDefenseRealtimeCoze.patOrOauthSecret ?? ''),
      },
    },
  }
}
