import { setResponseStatus } from 'h3'
import { runProjectContestExportJob } from '~~/server/services/project/project-contest-export-job'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { getProjectExportJobById } from '~~/server/utils/project-export-store'

interface RetryProjectExportBody {
  profileId?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const jobId = normalizeString(getRouterParam(event, 'jobId'))
  const body = (await readBody<RetryProjectExportBody>(event).catch(() => ({} as RetryProjectExportBody))) || {}

  if (!projectId || !jobId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 jobId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400213)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')
      const previousJob = await getProjectExportJobById(db, {
        projectId,
        jobId,
      })
      if (!previousJob)
        throw new Error('EXPORT_JOB_NOT_FOUND')

      const exported = await runProjectContestExportJob(db, {
        project,
        actorUserId: user.id,
        profileId: normalizeString(body.profileId) || previousJob.profileId || null,
        trigger: 'retry',
        attempt: Math.max(1, previousJob.attempt + 1),
        parentJobId: previousJob.id,
      })

      return {
        endpoint: 'contest-bundle-retry',
        job: exported.job,
        manifest: exported.manifest,
        artifacts: exported.artifacts,
      }
    })

    return ok(result, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
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
      }, 404213)
    }
    if (error instanceof Error && error.message === 'EXPORT_JOB_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('export job not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404214)
    }
    setResponseStatus(event, 500)
    return fail(normalizeString(error instanceof Error ? error.message : error) || 'contest bundle retry failed', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 500214)
  }
})
