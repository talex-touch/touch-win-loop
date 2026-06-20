import { setResponseStatus } from 'h3'
import { runProjectResourcePageReview } from '~~/server/services/document/project-resource-review-runner'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { getProjectResourceReviewJob } from '~~/server/utils/project-resource-review-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const jobId = String(getRouterParam(event, 'jobId') || '').trim()

  if (!projectId || !resourceId || !jobId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId、resourceId 或 jobId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400135)
  }

  const previousJob = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')
    return getProjectResourceReviewJob(db, { projectId, resourceId, jobId })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND')
      return 'PROJECT_NOT_FOUND' as const
    throw error
  })

  if (previousJob === 'PROJECT_NOT_FOUND' || !previousJob) {
    setResponseStatus(event, 404)
    return fail('review job not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404136)
  }

  try {
    const job = await runProjectResourcePageReview({
      event,
      projectId,
      resourceId,
      actorUserId: user.id,
      prompt: previousJob.prompt,
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
      }, 404137)
    }
    if (error instanceof Error && error.message === 'PREVIEW_NOT_READY') {
      setResponseStatus(event, 409)
      return fail('资料预览还未就绪，无法重新生成页级审稿。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 409133)
    }
    throw error
  }
})
