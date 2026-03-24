import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { buildProjectResourceSignedUrls } from '~~/server/utils/project-resource-access-url'
import {
  buildProjectPreviewStatusPayload,
  getLatestProjectDocumentTaskByDocumentId,
  getProjectResourceDocumentByResourceId,
} from '~~/server/utils/project-resource-document-store'

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
    }, 40082)
  }

  const payload = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return null

    const document = await getProjectResourceDocumentByResourceId(db, {
      projectId,
      resourceId,
    })
    if (!document)
      return null

    const latestTask = await getLatestProjectDocumentTaskByDocumentId(db, {
      documentId: document.id,
    })
    const status = await buildProjectPreviewStatusPayload(db, {
      projectId,
      resourceId,
    })

    return {
      document,
      latestTask,
      previewStatus: status,
      ...buildProjectResourceSignedUrls({
        projectId,
        resourceId,
      }),
    }
  })

  if (!payload) {
    setResponseStatus(event, 404)
    return fail('document not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40483)
  }

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
