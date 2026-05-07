import type { DocumentAnalysis } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { getResourceDocumentById, saveDocumentAnnotation } from '~~/server/utils/document-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface SaveAnnotationBody {
  annotationJson?: DocumentAnalysis
}

function isDocumentAnalysis(value: unknown): value is DocumentAnalysis {
  const root = value as Record<string, unknown>
  return Boolean(
    root
    && typeof root === 'object'
    && Array.isArray(root.pages),
  )
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { user } = await requireAuth(event)
  const documentId = getRouterParam(event, 'documentId') || ''
  const body = await readBody<SaveAnnotationBody>(event)

  if (!documentId) {
    setResponseStatus(event, 400)
    return fail('缺少 documentId。', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40096)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权保存标注。', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40396)
  }

  if (!isDocumentAnalysis(body?.annotationJson)) {
    setResponseStatus(event, 400)
    return fail('annotationJson 格式无效。', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  const updated = await withTransaction(event, async (db) => {
    const document = await getResourceDocumentById(db, {
      documentId,
    })
    if (!document)
      return null
    return saveDocumentAnnotation(db, {
      documentId,
      annotationJson: body.annotationJson!,
      actorUserId: user.id,
    })
  })

  if (!updated) {
    setResponseStatus(event, 404)
    return fail('document not found', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40496)
  }

  return ok(updated, {
    startedAt,
    fallbackUsed: false,
    attempts: 1,
  })
})
