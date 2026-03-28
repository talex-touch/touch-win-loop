import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createProject } from '~~/server/utils/platform-store'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'

interface QuickCreateBody {
  teamId?: string
  workspaceId?: string
  title?: string
  summary?: string
  contestIds?: string[]
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = (await readBody<QuickCreateBody>(event)) || {}

  const workspaceId = String(body.teamId || body.workspaceId || '').trim()
  const title = String(body.title || '').trim()
  const summary = String(body.summary || '').trim()
  const contestIds = Array.isArray(body.contestIds)
    ? body.contestIds.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const primaryContestId = contestIds[0] || 'quick_draft'

  if (!workspaceId || !title) {
    setResponseStatus(event, 400)
    return fail('teamId 与项目名称不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40043)
  }

  try {
    const project = await withTransaction(event, async (db) => {
      const canCreate = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin', 'manager'])
      if (!canCreate)
        throw new Error('FORBIDDEN')

      return createProject(db, {
        workspaceId,
        ownerUserId: user.id,
        creatorUserId: user.id,
        payerUserId: user.id,
        source: 'form',
        status: 'draft',
        title,
        contestId: primaryContestId,
        trackId: 'quick_draft',
        contestIds,
        problemStatement: summary || '待补充项目简介',
        innovationPoints: [],
        techRouteSteps: [],
        scoringMapping: [],
        risks: [],
        deliverables: [],
        summary,
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
      }, 40343)
    }
    if (error instanceof Error && error.message === 'WORKSPACE_PROJECT_LIMIT_REACHED') {
      setResponseStatus(event, 409)
      return fail('当前空间项目数量已达上限，请先扩容项目配额。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40943)
    }

    throw error
  }
})
