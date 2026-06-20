import type { ProjectMemberRole } from '~~/shared/types/domain'
import { defineApiHandler } from '~~/server/utils/api-handler'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { createProjectInvitation, getProjectMemberManagementSnapshot } from '~~/server/utils/platform-store'
import { createSessionToken, hashToken } from '~~/server/utils/security'

interface CreateProjectInvitationBody {
  inviteeUsername?: string
  projectRole?: ProjectMemberRole
  expiresInDays?: number
}

export default defineApiHandler(async ({ event, fail, ok }) => {
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = (await readBody<CreateProjectInvitationBody>(event)) || {}

  if (!projectId)
    return fail('缺少 projectId。', 40057, { status: 400 })

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
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      return fail('项目不存在。', 40457, { status: 404 })
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail('当前用户无权管理该项目协作邀请。', 40357, { status: 403 })
    }

    if (error instanceof Error && error.message === 'MANAGER_CAN_ONLY_INVITE_VIEWER') {
      return fail('当前角色仅可邀请 viewer。', 40358, { status: 403 })
    }

    if (error instanceof Error && error.message === 'PROJECT_SEAT_LIMIT_REACHED') {
      return fail('项目席位已满，暂时不能继续发起邀请。', 40957, { status: 409 })
    }

    throw error
  }
})
