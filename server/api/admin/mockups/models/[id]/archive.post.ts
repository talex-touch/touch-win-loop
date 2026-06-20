import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { archiveMockupDeviceModel } from '~~/server/utils/mockup-device-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canWrite = user.isPlatformAdmin || await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权归档 Mockup 型号。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40611)
  }

  const modelId = normalizeString(getRouterParam(event, 'id'))
  const detail = await withTransaction(event, async (db) => {
    return archiveMockupDeviceModel(db, {
      modelId,
      actorUserId: user.id,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'MOCKUP_DEVICE_MODEL_NOT_FOUND')
      return null
    throw error
  })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('Mockup 型号不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40612)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
