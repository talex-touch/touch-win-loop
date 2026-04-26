import { setResponseStatus } from 'h3'
import { runProjectResourcePageReview } from '~~/server/services/document/project-resource-review-runner'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'

interface CreateReviewJobBody {
  prompt?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const body = await readBody<CreateReviewJobBody>(event).catch((): CreateReviewJobBody => ({}))

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400132)
  }

  const canAccess = await withClient(event, async db => Boolean(await getVisibleProjectById(db, user, projectId)))
  if (!canAccess) {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404132)
  }

  try {
    const job = await runProjectResourcePageReview({
      event,
      projectId,
      resourceId,
      actorUserId: user.id,
      prompt: String(body?.prompt || '').trim(),
      runtime,
    })
    return ok(job, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: job.fallbackUsed,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('resource document not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404133)
    }
    if (error instanceof Error && error.message === 'PREVIEW_NOT_READY') {
      setResponseStatus(event, 409)
      return fail('资料预览还未就绪，无法生成页级审稿。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 409132)
    }
    throw error
  }
})
