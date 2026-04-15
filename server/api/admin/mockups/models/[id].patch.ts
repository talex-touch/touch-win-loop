import type { MockupDeviceCategory, MockupVariantSlotKey } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { updateMockupDeviceModel } from '~~/server/utils/mockup-device-store'

interface PatchMockupDeviceModelBody {
  slug?: string
  title?: string
  category?: MockupDeviceCategory
  brand?: string | null
  modelName?: string
  screenWidth?: number
  screenHeight?: number
  previewAssetItemId?: string | null
  previewAssetVersionId?: string | null
  sortOrder?: number
  defaultVariantSlotKey?: MockupVariantSlotKey | null
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
    return fail('当前用户无权编辑 Mockup 型号。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40606)
  }

  const modelId = normalizeString(getRouterParam(event, 'id'))
  const body = (await readBody<PatchMockupDeviceModelBody>(event).catch(() => ({} as PatchMockupDeviceModelBody))) || {}
  const nextModelName = body.modelName !== undefined ? normalizeString(body.modelName) : undefined
  const nextTitle = body.title !== undefined
    ? normalizeString(body.title)
    : (nextModelName ? nextModelName : undefined)
  const detail = await withTransaction(event, async (db) => {
    return updateMockupDeviceModel(db, {
      modelId,
      actorUserId: user.id,
      slug: body.slug,
      title: nextTitle,
      category: body.category,
      brand: body.brand,
      modelName: nextModelName,
      screenWidth: body.screenWidth !== undefined ? Math.max(1, toInteger(body.screenWidth, 1)) : undefined,
      screenHeight: body.screenHeight !== undefined ? Math.max(1, toInteger(body.screenHeight, 1)) : undefined,
      previewAssetItemId: body.previewAssetItemId !== undefined ? normalizeString(body.previewAssetItemId) || null : undefined,
      previewAssetVersionId: body.previewAssetVersionId !== undefined ? normalizeString(body.previewAssetVersionId) || null : undefined,
      sortOrder: body.sortOrder !== undefined ? Math.max(0, toInteger(body.sortOrder, 0)) : undefined,
      defaultVariantSlotKey: body.defaultVariantSlotKey,
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
    }, 40607)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
