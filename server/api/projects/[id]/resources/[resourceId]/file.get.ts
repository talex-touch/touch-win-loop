import { setHeader, setResponseStatus } from 'h3'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { getProjectUploadedFileRef } from '~~/server/utils/project-resource-store'

function encodeFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(/%20/g, '+')
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40068)
  }

  const result = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return { reason: 'PROJECT_NOT_FOUND' as const, fileRef: null }

    const fileRef = await getProjectUploadedFileRef(db, {
      projectId,
      resourceId,
    })

    if (!fileRef)
      return { reason: 'FILE_NOT_FOUND' as const, fileRef: null }

    return { reason: '' as const, fileRef }
  })

  if (result.reason === 'PROJECT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40466)
  }

  if (result.reason === 'FILE_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('file not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40467)
  }

  const fileRef = result.fileRef!
  const storage = getDocumentStorage()

  try {
    const buffer = await storage.getObjectBuffer(fileRef.objectKey)
    setHeader(event, 'Content-Type', fileRef.mimeType || 'application/octet-stream')
    setHeader(event, 'Content-Length', buffer.length)
    setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeFileName(fileRef.fileName || 'resource.bin')}`)
    return buffer
  }
  catch {
    setResponseStatus(event, 404)
    return fail('file not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40468)
  }
})
