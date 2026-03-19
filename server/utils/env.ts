import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'

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

export interface RuntimeSettings {
  envPriority: string
  ai: {
    provider: string
    baseURL: string
    apiKey: string
    model: string
    timeoutMs: number
    maxRetries: number
  }
  docAi: {
    provider: string
    baseURL: string
    apiKey: string
    model: string
    timeoutMs: number
    maxRetries: number
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
    ai: {
      provider: String(runtime.ai?.provider ?? 'openai-compatible'),
      baseURL: String(runtime.ai?.baseURL ?? ''),
      apiKey: String(runtime.ai?.apiKey ?? ''),
      model: String(runtime.ai?.model ?? 'gpt-4o-mini'),
      timeoutMs: toNumber(runtime.ai?.timeoutMs, 15000),
      maxRetries: toNumber(runtime.ai?.maxRetries, 2),
    },
    docAi: {
      provider: String(runtime.docAi?.provider ?? 'openai-compatible'),
      baseURL: String(runtime.docAi?.baseURL ?? ''),
      apiKey: String(runtime.docAi?.apiKey ?? ''),
      model: String(runtime.docAi?.model ?? 'gpt-4o-mini'),
      timeoutMs: toNumber(runtime.docAi?.timeoutMs, 15000),
      maxRetries: toNumber(runtime.docAi?.maxRetries, 2),
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
  }
}
