import * as Sentry from '@sentry/nuxt'
import { setHeader, setResponseStatus } from 'h3'
import { resolveSentryEnvironment, resolveSentryRelease } from '~~/config/sentry'
import { createTraceId, fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { captureServerException } from '~~/server/utils/sentry'

interface SentrySmokeBody {
  target?: 'nitro' | 'worker'
}

function resolveTarget(raw: unknown): 'nitro' | 'worker' {
  return String(raw || '').trim().toLowerCase() === 'worker' ? 'worker' : 'nitro'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const environment = resolveSentryEnvironment()
  const release = resolveSentryRelease(runtime.build.version)
  const { user } = await requireAuth(event)
  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权执行 Sentry smoke 验证。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  if (environment !== 'staging') {
    setResponseStatus(event, 404)
    return fail('当前环境未开放 Sentry smoke 验证入口。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40495)
  }

  if (!Sentry.getClient()) {
    setResponseStatus(event, 412)
    return fail('Sentry SDK 未初始化，请先确认 WINLOOP_SENTRY_DSN 与 WINLOOP_SENTRY_ENVIRONMENT。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 41295)
  }

  const body = await readBody<SentrySmokeBody>(event).catch(() => ({} as SentrySmokeBody))
  const target = resolveTarget(body.target)
  const traceId = createTraceId()

  setHeader(event, 'x-trace-id', traceId)

  if (target === 'worker') {
    captureServerException(new Error(`[sentry-smoke] worker trace=${traceId}`), {
      module: 'sentry-smoke-worker',
      taskId: `sentry-smoke:${traceId}`,
      traceId,
    })

    return ok({
      target,
      traceId,
      release,
      environment,
      captured: true,
    }, {
      startedAt,
      traceId,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 'sentry smoke queued')
  }

  setResponseStatus(event, 500)
  throw new Error(`[sentry-smoke] nitro trace=${traceId}`)
})
