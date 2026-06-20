import type { ApiResponse, ApiResponseMeta } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { UNCONFIGURED_RUNTIME_MARKER } from '~~/server/utils/ai-runtime'

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
    provider: payload.provider ?? UNCONFIGURED_RUNTIME_MARKER,
    model: payload.model ?? '',
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
