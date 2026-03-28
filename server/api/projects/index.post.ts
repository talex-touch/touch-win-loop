import type { ProjectPayload, ProjectSource } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createProject } from '~~/server/utils/platform-store'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => String(item).trim()).filter(Boolean)
}

interface CreateProjectBody extends Partial<ProjectPayload> {
  source?: ProjectSource
  teamId?: string
  workspaceId?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = (await readBody<CreateProjectBody>(event)) || {}
  const workspaceId = String(body.teamId || body.workspaceId || '').trim()

  const payload: ProjectPayload = {
    title: String(body.title || '').trim(),
    contestId: String(body.contestId || '').trim(),
    trackId: String(body.trackId || '').trim(),
    contestIds: ensureStringArray(body.contestIds),
    problemStatement: String(body.problemStatement || '').trim(),
    innovationPoints: ensureStringArray(body.innovationPoints),
    techRouteSteps: ensureStringArray(body.techRouteSteps),
    scoringMapping: ensureStringArray(body.scoringMapping),
    risks: ensureStringArray(body.risks),
    deliverables: ensureStringArray(body.deliverables),
    summary: String(body.summary || '').trim(),
  }

  const hasRequired = payload.title
    && payload.contestId
    && payload.trackId
    && payload.problemStatement
    && payload.innovationPoints.length > 0
    && payload.techRouteSteps.length > 0
    && payload.scoringMapping.length > 0
    && payload.risks.length > 0
    && payload.deliverables.length > 0

  if (!workspaceId || !hasRequired) {
    setResponseStatus(event, 400)
    return fail('项目字段不完整，请补全后重试', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: true,
      attempts: 1,
    }, 40004)
  }

  try {
    const project = await withTransaction(event, async (db) => {
      const canCreate = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin', 'manager'])
      if (!canCreate)
        throw new Error('FORBIDDEN')

      return createProject(db, {
        ...payload,
        workspaceId,
        ownerUserId: user.id,
        creatorUserId: user.id,
        payerUserId: user.id,
        source: body.source || 'form',
        status: 'draft',
      })
    })

    return ok(project, {
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
      return fail('当前用户无权在该空间创建项目。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40304)
    }
    if (error instanceof Error && error.message === 'WORKSPACE_PROJECT_LIMIT_REACHED') {
      setResponseStatus(event, 409)
      return fail('当前空间项目数量已达上限，请先扩容项目配额。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40904)
    }
    throw error
  }
})
