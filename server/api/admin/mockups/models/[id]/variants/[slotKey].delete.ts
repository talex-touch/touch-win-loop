import type { MockupVariantSlotKey } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { deleteMockupDeviceVariant } from '~~/server/utils/mockup-device-store'
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
    return fail('当前用户无权删除 Mockup 变体。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40615)
  }

  const modelId = normalizeString(getRouterParam(event, 'id'))
  const slotKey = normalizeString(getRouterParam(event, 'slotKey')) as MockupVariantSlotKey
  const detail = await withTransaction(event, async (db) => {
    return deleteMockupDeviceVariant(db, {
      modelId,
      actorUserId: user.id,
      slotKey,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'MOCKUP_DEVICE_VARIANT_NOT_FOUND')
      return null
    throw error
  })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('Mockup 变体不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40616)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
