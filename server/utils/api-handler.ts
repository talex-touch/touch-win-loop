import type { H3Event } from 'h3'
import type { RuntimeSettings } from '~~/server/utils/env'
import type { ApiResponse } from '~~/shared/types/domain'
import { defineEventHandler, setResponseStatus } from 'h3'
import { fail as failResponse, ok as okResponse } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

type RuntimeLike = Pick<RuntimeSettings, 'ai'> | { provider?: string, model?: string } | null | undefined

interface TelemetryOverrides {
  attempts?: number
  fallbackUsed?: boolean
  provider?: string
  model?: string
}

interface ApiHandlerContext {
  event: H3Event
  startedAt: number
  runtime: RuntimeLike
  telemetry: (overrides?: TelemetryOverrides) => {
    startedAt: number
    provider?: string
    model?: string
    fallbackUsed?: boolean
    attempts?: number
  }
  ok: <T>(data: T, message?: string, overrides?: TelemetryOverrides) => ApiResponse<T>
  fail: (message: string, code?: number, options?: TelemetryOverrides & { status?: number }) => ApiResponse<null>
}

interface DefineApiHandlerOptions {
  resolveRuntime?: (event: H3Event) => RuntimeLike | Promise<RuntimeLike>
}

function resolveProvider(runtime: RuntimeLike): string | undefined {
  if (!runtime)
    return undefined
  if ('provider' in runtime && typeof runtime.provider === 'string')
    return runtime.provider
  if ('ai' in runtime && runtime.ai && typeof runtime.ai.provider === 'string')
    return runtime.ai.provider
  return undefined
}

function resolveModel(runtime: RuntimeLike): string | undefined {
  if (!runtime)
    return undefined
  if ('model' in runtime && typeof runtime.model === 'string')
    return runtime.model
  if ('ai' in runtime && runtime.ai && typeof runtime.ai.model === 'string')
    return runtime.ai.model
  return undefined
}

export function buildApiTelemetry(runtime: RuntimeLike, startedAt: number, overrides: TelemetryOverrides = {}) {
  return {
    startedAt,
    provider: overrides.provider ?? resolveProvider(runtime),
    model: overrides.model ?? resolveModel(runtime),
    fallbackUsed: overrides.fallbackUsed ?? false,
    attempts: overrides.attempts ?? 1,
  }
}

export function defineApiHandler(
  handler: (context: ApiHandlerContext) => Promise<ApiResponse<unknown>> | ApiResponse<unknown>,
  options: DefineApiHandlerOptions = {},
) {
  return defineEventHandler(async (event) => {
    const startedAt = Date.now()
    const runtime = await (options.resolveRuntime?.(event) ?? readRuntimeSettings(event))
    const telemetry = (overrides: TelemetryOverrides = {}) => buildApiTelemetry(runtime, startedAt, overrides)

    return handler({
      event,
      startedAt,
      runtime,
      telemetry,
      ok: (data, message = 'ok', overrides = {}) => okResponse(data, telemetry(overrides), message),
      fail: (message, code = 1, failOptions = {}) => {
        if (typeof failOptions.status === 'number')
          setResponseStatus(event, failOptions.status)
        return failResponse(message, telemetry(failOptions), code)
      },
    })
  })
}

export function createDeprecatedApiHandler(
  handler: (event: H3Event) => ApiResponse<null>,
) {
  return defineEventHandler((event) => {
    return handler(event)
  })
}
