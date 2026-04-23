import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { getLatestProjectResourceReviewJob } from '~~/server/utils/project-resource-review-store'

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
    }, 400133)
  }

  const job = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')
    return getLatestProjectResourceReviewJob(db, { projectId, resourceId })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND')
      return 'PROJECT_NOT_FOUND' as const
    throw error
  })

  if (job === 'PROJECT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404134)
  }

  return ok({ latest: job || null }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
