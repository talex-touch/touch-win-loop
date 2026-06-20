import { setHeader, setResponseStatus } from 'h3'
import { verifyProjectPreviewSourceToken } from '~~/server/services/document/project-preview-token'
import { getDocumentStorageByChannel } from '~~/server/storage/document-storage'
import { fail } from '~~/server/utils/api'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getProjectResourceDocumentById } from '~~/server/utils/project-resource-document-store'

function encodeFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(/%20/g, '+')
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const documentId = String(getRouterParam(event, 'documentId') || '').trim()
  const token = String(getQuery(event).token || '').trim()

  if (!documentId || !token) {
    setResponseStatus(event, 400)
    return fail('缺少 documentId 或 token。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40073)
  }

  if (!verifyProjectPreviewSourceToken({ token, documentId })) {
    setResponseStatus(event, 403)
    return fail('token 无效或已过期。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40373)
  }

  const document = await withClient(event, (db) => {
    return getProjectResourceDocumentById(db, {
      documentId,
    })
  })

  if (!document || !document.sourceObjectKey) {
    setResponseStatus(event, 404)
    return fail('document not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40473)
  }

  const storage = getDocumentStorageByChannel(document.sourceStorageProvider)
  const buffer = await storage.getObjectBuffer(document.sourceObjectKey)
  setHeader(event, 'Content-Type', document.sourceMimeType || 'application/octet-stream')
  setHeader(event, 'Content-Length', buffer.length)
  setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeFileName(document.sourceFileName || 'source.bin')}`)
  return buffer
})
