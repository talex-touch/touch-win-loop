import { setResponseStatus } from 'h3'
import { resolveProjectExportProfiles } from '~~/server/services/project/project-contest-export'
import { buildProjectExportJobDiagnostics } from '~~/server/services/project/project-contest-export-job'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { listProjectExportJobs } from '~~/server/utils/project-export-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400212)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')
      const profiles = resolveProjectExportProfiles({
        contestId: normalizeString(project.contestId) || null,
      })
      const jobs = await listProjectExportJobs(db, {
        projectId,
        limit: 8,
      })
      return {
        profiles,
        jobs,
        diagnostics: buildProjectExportJobDiagnostics(jobs),
        activeProfileId: profiles[0]?.id || '',
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
      }, 404212)
    }
    throw error
  }
})
