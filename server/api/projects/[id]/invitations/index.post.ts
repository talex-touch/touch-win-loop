import type { ProjectMemberRole } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createProjectInvitation, getProjectMemberManagementSnapshot } from '~~/server/utils/platform-store'
import { createSessionToken, hashToken } from '~~/server/utils/security'

interface CreateProjectInvitationBody {
  inviteeUsername?: string
  projectRole?: ProjectMemberRole
  expiresInDays?: number
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = (await readBody<CreateProjectInvitationBody>(event)) || {}

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40057)
  }

  const expiresInDays = Math.max(1, Math.min(30, Number(body.expiresInDays || 7)))
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
  const token = createSessionToken()

  try {
    const result = await withTransaction(event, async (db) => {
      const invitation = await createProjectInvitation(db, {
        projectId,
        actorUser: user,
        tokenHash: hashToken(token),
        inviteeUsername: String(body.inviteeUsername || '').trim() || null,
        projectRole: body.projectRole,
        expiresAt,
      })
      const { emitInvitationCreatedNotifications } = await import('~~/server/utils/notification-store')
      await emitInvitationCreatedNotifications(db, {
        actorUser: user,
        workspaceId: String(invitation.workspaceId || invitation.teamId || '').trim(),
        projectId,
        inviteeUsername: String(body.inviteeUsername || '').trim() || null,
        projectRole: invitation.projectRole || 'viewer',
        expiresAt,
        token,
      })
      const snapshot = await getProjectMemberManagementSnapshot(db, projectId)
      if (!snapshot)
        throw new Error('PROJECT_NOT_FOUND')
      return {
        invitation,
        snapshot,
      }
    })

    return ok({
      token,
      invitation: result.invitation,
      snapshot: result.snapshot,
    }, {
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
      return fail('项目不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40457)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理该项目协作邀请。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40357)
    }

    if (error instanceof Error && error.message === 'MANAGER_CAN_ONLY_INVITE_VIEWER') {
      setResponseStatus(event, 403)
      return fail('当前角色仅可邀请 viewer。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40358)
    }

    if (error instanceof Error && error.message === 'PROJECT_SEAT_LIMIT_REACHED') {
      setResponseStatus(event, 409)
      return fail('项目席位已满，暂时不能继续发起邀请。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40957)
    }

    throw error
  }
})
