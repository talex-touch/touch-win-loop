import type { ApiResponse, ApiResponseMeta } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface MetaPayload {
  startedAt: number
  traceId?: string
  provider?: string
  model?: string
  fallbackUsed?: boolean
  attempts?: number
}

export function createTraceId(): string {
  return randomUUID()
}

export function buildMeta(payload: MetaPayload): ApiResponseMeta {
  return {
    traceId: payload.traceId ?? createTraceId(),
    provider: payload.provider ?? 'mock',
    model: payload.model ?? 'fallback',
    latencyMs: Date.now() - payload.startedAt,
    fallbackUsed: payload.fallbackUsed ?? false,
    attempts: payload.attempts ?? 1,
  }
}

export function ok<T>(data: T, payload: MetaPayload, message = 'ok'): ApiResponse<T> {
  return {
    code: 0,
    message,
    data,
    meta: buildMeta(payload),
  }
}

export function fail(message: string, payload: MetaPayload, code = 1): ApiResponse<null> {
  return {
    code,
    message,
    data: null,
    meta: buildMeta(payload),
  }
}
