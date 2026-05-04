import type { AuthUser } from '~~/shared/types/domain'
import { setHeader, setResponseStatus } from 'h3'
import { verifyProjectResourceAccessToken } from '~~/server/services/document/project-resource-access-token'
import { getDocumentStorageByChannel } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import {
  buildProjectPreviewStatusPayload,
  getProjectResourcePreviewFileRef,
} from '~~/server/utils/project-resource-document-store'

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
    }, 40079)
  }

  const tokenAuthorized = token
    ? verifyProjectResourceAccessToken({
        token,
        projectId,
        resourceId,
        kind: 'preview',
      })
    : false

  let user: AuthUser | null = null
  if (!tokenAuthorized)
    ({ user } = await requireAuth(event))

  const result = await withClient(event, async (db) => {
    if (!tokenAuthorized) {
      const project = await getVisibleProjectById(db, user!, projectId)
      if (!project)
        return { reason: 'PROJECT_NOT_FOUND' as const, fileRef: null, statusPayload: null }
    }

    const fileRef = await getProjectResourcePreviewFileRef(db, {
      projectId,
      resourceId,
    })

    const statusPayload = await buildProjectPreviewStatusPayload(db, {
      projectId,
      resourceId,
    })

    return {
      reason: '' as const,
      fileRef,
      statusPayload,
    }
  })

  if (result.reason === 'PROJECT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40479)
  }

  if (result.fileRef) {
    const storage = getDocumentStorageByChannel(result.fileRef.storageProvider)
    const buffer = await storage.getObjectBuffer(result.fileRef.objectKey)
    setHeader(event, 'Content-Type', result.fileRef.mimeType || 'application/pdf')
    setHeader(event, 'Content-Length', buffer.length)
    setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeFileName(result.fileRef.fileName || 'preview.pdf')}`)
    return buffer
  }

  if (!result.statusPayload) {
    setResponseStatus(event, 404)
    return fail('preview not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40480)
  }

  if (result.statusPayload.status === 'failed')
    setResponseStatus(event, 409)
  else
    setResponseStatus(event, 202)

  return ok({
    ready: false,
    ...result.statusPayload,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }, 'preview not ready')
})
