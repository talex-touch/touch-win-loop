import type { MockupDeviceCategory, MockupVariantSlotKey } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { createMockupDeviceModel } from '~~/server/utils/mockup-device-store'

interface CreateMockupDeviceModelBody {
  slug?: string
  title?: string
  category?: MockupDeviceCategory
  brand?: string
  modelName?: string
  screenWidth?: number
  screenHeight?: number
  sortOrder?: number
  defaultVariantSlotKey?: MockupVariantSlotKey
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
    return fail('当前用户无权创建 Mockup 型号。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40602)
  }

  const body = (await readBody<CreateMockupDeviceModelBody>(event).catch(() => ({} as CreateMockupDeviceModelBody))) || {}
  if (!normalizeString(body.title) || !normalizeString(body.modelName)) {
    setResponseStatus(event, 400)
    return fail('title / modelName 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40603)
  }

  const detail = await withTransaction(event, async (db) => {
    return createMockupDeviceModel(db, {
      actorUserId: user.id,
      slug: body.slug,
      title: normalizeString(body.title),
      category: body.category || 'iphone',
      brand: body.brand,
      modelName: normalizeString(body.modelName),
      screenWidth: Math.max(1, toInteger(body.screenWidth, 1)),
      screenHeight: Math.max(1, toInteger(body.screenHeight, 1)),
      sortOrder: Math.max(0, toInteger(body.sortOrder, 0)),
      defaultVariantSlotKey: body.defaultVariantSlotKey,
    })
  })

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
