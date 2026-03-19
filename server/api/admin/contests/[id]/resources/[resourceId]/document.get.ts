import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { getLatestDocumentTaskByDocumentId, getResourceDocumentByResourceId } from '~~/server/utils/document-store'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = getRouterParam(event, 'id') || ''
  const resourceId = getRouterParam(event, 'resourceId') || ''

  if (!contestId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 resourceId。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40094)
  }

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看文档。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40394)
  }

  const result = await withClient(event, async (db) => {
    const document = await getResourceDocumentByResourceId(db, {
      contestId,
      resourceId,
    })
    if (!document)
      return null

    const latestTask = await getLatestDocumentTaskByDocumentId(db, {
      documentId: document.id,
    })

    return {
      ...document,
      latestTask,
      previewUrl: `/api/admin/documents/${document.id}/preview`,
    }
  })

  if (!result) {
    setResponseStatus(event, 404)
    return fail('document not found', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40494)
  }

  return ok(result, {
    startedAt,
    provider: runtime.docAi.provider,
    model: runtime.docAi.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
