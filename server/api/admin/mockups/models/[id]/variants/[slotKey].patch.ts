import type { MockupVariantSlotKey } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { patchMockupDeviceVariant } from '~~/server/utils/mockup-device-store'

interface PatchMockupDeviceVariantBody {
  title?: string
  shellAssetItemId?: string | null
  shellAssetVersionId?: string | null
  enabled?: boolean
  sortOrder?: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.trunc(parsed)
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canWrite = user.isPlatformAdmin || await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑 Mockup 变体。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40613)
  }

  const modelId = normalizeString(getRouterParam(event, 'id'))
  const slotKey = normalizeString(getRouterParam(event, 'slotKey')) as MockupVariantSlotKey
  const body = (await readBody<PatchMockupDeviceVariantBody>(event).catch(() => ({} as PatchMockupDeviceVariantBody))) || {}
  const variant = await withTransaction(event, async (db) => {
    return patchMockupDeviceVariant(db, {
      modelId,
      actorUserId: user.id,
      slotKey,
      title: body.title,
      shellAssetItemId: body.shellAssetItemId,
      shellAssetVersionId: body.shellAssetVersionId,
      enabled: body.enabled,
      sortOrder: body.sortOrder !== undefined ? Math.max(0, toInteger(body.sortOrder, 0)) : undefined,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'MOCKUP_DEVICE_VARIANT_NOT_FOUND')
      return null
    throw error
  })

  if (!variant) {
    setResponseStatus(event, 404)
    return fail('Mockup 变体不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40614)
  }

  return ok(variant, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
