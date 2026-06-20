import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { enqueueDocumentTask, getResourceDocumentById } from '~~/server/utils/document-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

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
    }, 40098)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权重试解析。', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40398)
  }

  const result = await withTransaction(event, async (db) => {
    const document = await getResourceDocumentById(db, {
      documentId,
    })
    if (!document)
      return null

    const task = await enqueueDocumentTask(db, {
      documentId,
      actorUserId: user.id,
    })
    return {
      document,
      task,
    }
  })

  if (!result) {
    setResponseStatus(event, 404)
    return fail('document not found', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40498)
  }

  return ok(result, {
    startedAt,
    fallbackUsed: false,
    attempts: 1,
  })
})
