import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { getLatestDocumentTaskByDocumentId, getResourceDocumentById } from '~~/server/utils/document-store'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const documentId = getRouterParam(event, 'documentId') || ''

  if (!documentId) {
    setResponseStatus(event, 400)
    return fail('缺少 documentId。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看解析结果。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  const payload = await withClient(event, async (db) => {
    const document = await getResourceDocumentById(db, {
      documentId,
    })
    if (!document)
      return null
    const latestTask = await getLatestDocumentTaskByDocumentId(db, {
      documentId,
    })
    return {
      documentId: document.id,
      contestId: document.contestId,
      resourceId: document.resourceId,
      parseStatus: document.parseStatus,
      parseError: document.parseError,
      parserProvider: document.parserProvider,
      parserModel: document.parserModel,
      analysisJson: document.analysisJson,
      annotationJson: document.annotationJson,
      latestTask,
      previewUrl: `/api/admin/documents/${document.id}/preview`,
    }
  })

  if (!payload) {
    setResponseStatus(event, 404)
    return fail('document not found', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40495)
  }

  return ok(payload, {
    startedAt,
    provider: runtime.docAi.provider,
    model: runtime.docAi.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
