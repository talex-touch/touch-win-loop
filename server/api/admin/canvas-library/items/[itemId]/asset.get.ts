import { setHeader, setResponseStatus } from 'h3'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getCanvasLibraryItemDetail } from '~~/server/utils/canvas-library-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canRead = user.isPlatformAdmin || await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看画布资源库素材。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  const itemId = normalizeString(getRouterParam(event, 'itemId'))
  const detail = await withClient(event, async (db) => {
    return getCanvasLibraryItemDetail(db, { itemId })
  })
  const version = detail?.draftVersion || detail?.publishedVersion
  if (!detail || !version || version.payloadType !== 'binary_asset') {
    setResponseStatus(event, 404)
    return fail('素材不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40496)
  }

  const payload = version.payload as { objectKey?: string, mimeType?: string }
  const objectKey = normalizeString(payload.objectKey)
  if (!objectKey) {
    setResponseStatus(event, 404)
    return fail('素材对象不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40497)
  }

  const storage = getDocumentStorage()
  const buffer = await storage.getObjectBuffer(objectKey)
  setHeader(event, 'Content-Type', normalizeString(payload.mimeType) || 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'private, max-age=60')
  return buffer
})
