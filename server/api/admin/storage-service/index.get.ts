import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  getPlatformRuntimeOverrideState,
  readEffectivePlatformRuntimeSettings,
} from '~~/server/utils/platform-runtime-config-store'
import { buildStorageServiceOverview } from '~~/server/utils/storage-service-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看存储服务。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403520)
  }

  const { runtime, overrides, configSource } = await readEffectivePlatformRuntimeSettings(event)
  const overrideState = getPlatformRuntimeOverrideState(overrides)
  const payload = await withClient(event, db => buildStorageServiceOverview(db, {
    runtime,
    configSource: configSource.storage,
    updatedAt: overrideState.updatedAt,
    updatedByUserId: overrideState.updatedByUserId,
  }))

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
