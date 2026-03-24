import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
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

const DEFAULT_ONLYOFFICE_SOURCE_BASE_URL = 'http://127.0.0.1:3510'
const DEFAULT_ONLYOFFICE_TIMEOUT_MS = 120000
const DEFAULT_ONLYOFFICE_RETRY_LIMIT = 3
const DEFAULT_ONLYOFFICE_WORKER_INTERVAL_MS = 2500
const DEFAULT_ONLYOFFICE_WORKER_BATCH_SIZE = 2
const DEFAULT_PROJECT_RESOURCE_ACCESS_URL_TTL_SECONDS = 600
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

function isLoopbackHttpUrl(rawUrl: string): boolean {
  const normalized = trimTrailingSlash(rawUrl)
  if (!/^https?:\/\//i.test(normalized))
    return false

  try {
    const parsed = new URL(normalized)
    const host = String(parsed.hostname || '').toLowerCase()
    return host === '127.0.0.1'
      || host === 'localhost'
      || host === '::1'
      || host === '0.0.0.0'
  }
  catch {
    return false
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
      return DEFAULT_ONLYOFFICE_SOURCE_BASE_URL
    }
  }

  const requestOrigin = resolveRequestOrigin(event)
  if (requestOrigin) {
    hintState.value = requestOrigin
    return requestOrigin
  }

  if (hintState.value)
    return hintState.value

  const endpoint = trimTrailingSlash(String(runtime.onlyOffice?.endpoint ?? ''))
  if (endpoint && !isLoopbackHttpUrl(endpoint) && !hintState.warnedFallback) {
    hintState.warnedFallback = true
    console.warn('[runtime-settings] ONLYOFFICE sourceBaseURL 未配置且无法从请求推断，当前回退到本地地址。请设置 WINLOOP_PUBLIC_BASE_URL。')
  }

  return DEFAULT_ONLYOFFICE_SOURCE_BASE_URL
}

export interface RuntimeSettings {
  envPriority: string
  apiBaseUrl: string
  ai: {
    provider: string
    baseURL: string
    apiKey: string
    model: string
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
  projectResource: {
    accessUrlTtlSeconds: number
  }
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

export function readRuntimeSettings(event?: H3Event): RuntimeSettings {
  const runtime = useRuntimeConfig(event)

  return {
    envPriority: String(runtime.envPriority ?? '.env.local > .env.prod > .env.dev > .env'),
    apiBaseUrl: normalizeApiBase(String(runtime.public?.apiBaseUrl ?? '/api')),
    ai: {
      provider: String(runtime.ai?.provider ?? 'openai-compatible'),
      baseURL: String(runtime.ai?.baseURL ?? ''),
      apiKey: String(runtime.ai?.apiKey ?? ''),
      model: String(runtime.ai?.model ?? 'gpt-4o-mini'),
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
      provider: String(runtime.docAi?.provider ?? 'openai-compatible'),
      baseURL: String(runtime.docAi?.baseURL ?? ''),
      apiKey: String(runtime.docAi?.apiKey ?? ''),
      model: String(runtime.docAi?.model ?? 'gpt-4o-mini'),
      modelPricingJson: String(runtime.docAi?.modelPricingJson ?? ''),
      timeoutMs: toNumber(runtime.docAi?.timeoutMs, 15000),
      maxRetries: toNumber(runtime.docAi?.maxRetries, 2),
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
    storage: {
      provider: String(runtime.storage?.provider ?? 'local'),
      localRoot: String(runtime.storage?.localRoot ?? './tmp/document-storage'),
      endpoint: String(runtime.storage?.endpoint ?? ''),
      region: String(runtime.storage?.region ?? ''),
      bucket: String(runtime.storage?.bucket ?? ''),
      accessKey: String(runtime.storage?.accessKey ?? ''),
      secretKey: String(runtime.storage?.secretKey ?? ''),
      forcePathStyle: toBoolean(runtime.storage?.forcePathStyle, true),
    },
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
    projectResource: {
      accessUrlTtlSeconds: Math.max(60, Math.min(2 * 60 * 60, Math.trunc(toNumber(runtime.projectResource?.accessUrlTtlSeconds, DEFAULT_PROJECT_RESOURCE_ACCESS_URL_TTL_SECONDS)))),
    },
  }
}
