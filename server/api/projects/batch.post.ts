import type { ProjectPayload } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { batchCreateProjects } from '~~/server/utils/platform-store'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'

interface BatchCreateBody {
  teamId?: string
  workspaceId?: string
  projects?: Array<ProjectPayload & { source?: 'form' | 'chat' }>
}

function isValidProjectPayload(project: ProjectPayload): boolean {
  return Boolean(
    project.title?.trim()
    && project.contestId?.trim()
    && project.trackId?.trim()
    && project.problemStatement?.trim()
    && Array.isArray(project.innovationPoints)
    && project.innovationPoints.length > 0
    && Array.isArray(project.techRouteSteps)
    && project.techRouteSteps.length > 0
    && Array.isArray(project.scoringMapping)
    && project.scoringMapping.length > 0
    && Array.isArray(project.risks)
    && project.risks.length > 0
    && Array.isArray(project.deliverables)
    && project.deliverables.length > 0,
  )
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<BatchCreateBody>(event)
  const workspaceId = String(body?.teamId || body?.workspaceId || '').trim()
  const projects = Array.isArray(body?.projects) ? body.projects : []

  if (!workspaceId || projects.length === 0) {
    setResponseStatus(event, 400)
    return fail('teamId 与 projects 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40041)
  }

  const invalid = projects.some(project => !isValidProjectPayload(project))
  if (invalid) {
    setResponseStatus(event, 400)
    return fail('批量项目中存在字段不完整的数据。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40042)
  }

  try {
    const created = await withTransaction(event, async (db) => {
      const canBatchCreate = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin', 'manager'])
      if (!canBatchCreate)
        throw new Error('FORBIDDEN')

      return batchCreateProjects(db, user.id, workspaceId, projects)
    })

    return ok(created, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && (error.message === 'FORBIDDEN' || error.message === 'WORKSPACE_MEMBER_REQUIRED')) {
      setResponseStatus(event, 403)
      return fail('当前用户无权批量创建项目。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40341)
    }
    if (error instanceof Error && error.message === 'WORKSPACE_PROJECT_LIMIT_REACHED') {
      setResponseStatus(event, 409)
      return fail('当前空间项目数量已达上限，批量创建被中断。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40941)
    }
    throw error
  }
})
