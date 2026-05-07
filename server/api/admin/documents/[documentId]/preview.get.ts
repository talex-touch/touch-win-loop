import { setHeader, setResponseStatus } from 'h3'
import { getDocumentStorageByChannel } from '~~/server/storage/document-storage'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { getResourceDocumentById } from '~~/server/utils/document-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function encodeFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(/%20/g, '+')
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { user } = await requireAuth(event)
  const documentId = getRouterParam(event, 'documentId') || ''

  if (!documentId) {
    setResponseStatus(event, 400)
    return fail('缺少 documentId。', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40100)
  }

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看预览。', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 403100)
  }

  const document = await withClient(event, async (db) => {
    return getResourceDocumentById(db, {
      documentId,
    })
  })

  if (!document) {
    setResponseStatus(event, 404)
    return fail('document not found', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 404100)
  }

  const storage = getDocumentStorageByChannel(document.storageProvider)
  const buffer = await storage.getObjectBuffer(document.objectKey)
  setHeader(event, 'Content-Type', document.mimeType || 'application/pdf')
  setHeader(event, 'Content-Length', buffer.length)
  setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeFileName(document.fileName || 'document.pdf')}`)
  return buffer
})
