import { setResponseStatus } from 'h3'
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
    }, 400134)
  }

  const job = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')
    return getProjectResourceReviewJob(db, { projectId, resourceId, jobId })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND')
      return 'PROJECT_NOT_FOUND' as const
    throw error
  })

  if (job === 'PROJECT_NOT_FOUND' || !job) {
    setResponseStatus(event, 404)
    return fail('review job not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404135)
  }

  return ok(job, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: job.fallbackUsed,
    attempts: 1,
  })
})
