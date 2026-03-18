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
  pg: {
    url: string
  }
  redis: {
    url: string
  }
}

export function readRuntimeSettings(event: H3Event): RuntimeSettings {
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
    pg: {
      url: String(runtime.pg?.url ?? 'postgresql://winloop@127.0.0.1:5432/winloop'),
    },
    redis: {
      url: String(runtime.redis?.url ?? 'redis://127.0.0.1:6379/0'),
    },
  }
}
