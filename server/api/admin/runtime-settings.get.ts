import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  getPlatformRuntimeOverrideState,
  readEffectivePlatformRuntimeSettings,
} from '~~/server/utils/platform-runtime-config-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看运行设置。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  const { runtime, overrides, configSource } = await readEffectivePlatformRuntimeSettings(event)

  return ok({
    auth: {
      registrationEnabled: runtime.auth.registrationEnabled,
    },
    feishuScheduler: {
      enabled: runtime.feishuScheduler.enabled,
      intervalMs: runtime.feishuScheduler.intervalMs,
      batchSize: runtime.feishuScheduler.batchSize,
      lockTtlMs: runtime.feishuScheduler.lockTtlMs,
    },
    resourceRecycle: {
      enabled: runtime.resourceRecycle.enabled,
      intervalMs: runtime.resourceRecycle.intervalMs,
      retentionDays: runtime.resourceRecycle.retentionDays,
      batchSize: runtime.resourceRecycle.batchSize,
    },
    contest: {
      autoSeed: runtime.contest.autoSeed,
    },
    overrideState: getPlatformRuntimeOverrideState(overrides),
    configSource,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
