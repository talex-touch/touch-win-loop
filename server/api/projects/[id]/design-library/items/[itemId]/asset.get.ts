import { setHeader, setResponseStatus } from 'h3'
import { getDocumentStorageByChannel } from '~~/server/storage/document-storage'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getCanvasLibraryItemDetail } from '~~/server/utils/canvas-library-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const itemId = normalizeString(getRouterParam(event, 'itemId'))

  const detail = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')
    return getCanvasLibraryItemDetail(db, {
      itemId,
      publishedOnly: true,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND')
      return null
    throw error
  })

  const publishedVersion = detail?.publishedVersion
  if (!detail || !publishedVersion || publishedVersion.payloadType !== 'binary_asset') {
    setResponseStatus(event, 404)
    return fail('素材不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40500)
  }

  const payload = publishedVersion.payload as { objectKey?: string, storageProvider?: string, mimeType?: string }
  const objectKey = normalizeString(payload.objectKey)
  if (!objectKey) {
    setResponseStatus(event, 404)
    return fail('素材对象不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40501)
  }

  const storage = getDocumentStorageByChannel(normalizeString(payload.storageProvider) || 'local')
  const buffer = await storage.getObjectBuffer(objectKey).catch(() => null)
  if (!buffer) {
    setResponseStatus(event, 404)
    return fail('素材对象不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40501)
  }
  setHeader(event, 'Content-Type', normalizeString(payload.mimeType) || 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'private, max-age=60')
  return buffer
})
