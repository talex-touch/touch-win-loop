import type { AuthUser } from '~~/shared/types/domain'
import { setHeader, setResponseStatus } from 'h3'
import { verifyProjectResourceAccessToken } from '~~/server/services/document/project-resource-access-token'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { getProjectResourceSourceFileRef } from '~~/server/utils/project-resource-document-store'
import { getProjectUploadedFileRef } from '~~/server/utils/project-resource-store'

function encodeFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(/%20/g, '+')
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const token = String(getQuery(event).token || '').trim()

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40077)
  }

  const tokenAuthorized = token
    ? verifyProjectResourceAccessToken({
        token,
        projectId,
        resourceId,
        kind: 'source',
      })
    : false

  let user: AuthUser | null = null
  if (!tokenAuthorized)
    ({ user } = await requireAuth(event))

  const result = await withClient(event, async (db) => {
    if (!tokenAuthorized) {
      const project = await getVisibleProjectById(db, user!, projectId)
      if (!project)
        return { reason: 'PROJECT_NOT_FOUND' as const, fileRef: null as null | { objectKey: string, fileName: string, mimeType: string } }
    }

    const sourceRef = await getProjectResourceSourceFileRef(db, {
      projectId,
      resourceId,
    })
    if (sourceRef) {
      return {
        reason: '' as const,
        fileRef: {
          objectKey: sourceRef.objectKey,
          fileName: sourceRef.fileName,
          mimeType: sourceRef.mimeType,
        },
      }
    }

    const fallbackRef = await getProjectUploadedFileRef(db, {
      projectId,
      resourceId,
    })
    if (!fallbackRef)
      return { reason: 'FILE_NOT_FOUND' as const, fileRef: null }
    return { reason: '' as const, fileRef: fallbackRef }
  })

  if (result.reason === 'PROJECT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40477)
  }

  if (result.reason === 'FILE_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('file not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40478)
  }

  const storage = getDocumentStorage()
  const fileRef = result.fileRef!
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
    }, 40479)
  }
})
