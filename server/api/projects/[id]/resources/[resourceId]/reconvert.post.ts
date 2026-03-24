import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { canManageProject, getVisibleProjectById } from '~~/server/utils/platform-store'
import { buildProjectResourceSignedUrls } from '~~/server/utils/project-resource-access-url'
import { enqueueProjectDocumentReconvert } from '~~/server/utils/project-resource-document-store'

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
    }, 40081)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const manageable = await canManageProject(db, user, projectId)
      if (!manageable)
        throw new Error('FORBIDDEN')

      return enqueueProjectDocumentReconvert(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
      })
    })

    const signedUrls = buildProjectResourceSignedUrls({
      projectId,
      resourceId,
    })

    return ok({
      documentId: payload.document.id,
      previewStatus: payload.document.previewStatus,
      previewProgressPercent: payload.document.previewProgressPercent,
      previewEtaSeconds: payload.document.previewEtaSeconds,
      previewError: payload.document.previewError,
      task: payload.task,
      previewUrl: signedUrls.previewUrl,
      previewUrlExpiresAt: signedUrls.previewUrlExpiresAt,
      sourceDownloadUrl: signedUrls.sourceDownloadUrl,
      sourceDownloadUrlExpiresAt: signedUrls.sourceDownloadUrlExpiresAt,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, '已重新加入转换队列。')
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40481)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理项目资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40381)
    }

    if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('document not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40482)
    }

    throw error
  }
})
