import type { WorkspaceMemberRole } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamCanManageProject } from '~~/server/utils/project-access-store'
import { createSessionToken, hashToken } from '~~/server/utils/security'
import { toTeamInvitationWithTokenResponse } from '~~/server/utils/team-api-presenter'
import { teamCreateInvitation } from '~~/server/utils/team-invitation-store'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import { teamGetWorkspaceType } from '~~/server/utils/team-quota-store'

interface InvitationBody {
  projectId?: string
  inviteeUsername?: string
  role?: WorkspaceMemberRole
  expiresInDays?: number
}

const MANAGE_INVITATION_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']
const ALLOWED_ROLES: WorkspaceMemberRole[] = ['admin', 'manager', 'member']

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = getRouterParam(event, 'id') || ''
  const body = await readBody<InvitationBody>(event)

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40021)
  }

  const role = ALLOWED_ROLES.includes(body?.role as WorkspaceMemberRole)
    ? (body?.role as WorkspaceMemberRole)
    : 'member'

  const inviteeUsername = String(body?.inviteeUsername || '').trim() || null
  const projectId = String(body?.projectId || '').trim() || null
  const expiresInDays = Math.max(1, Math.min(30, Number(body?.expiresInDays || 7)))
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const token = createSessionToken()
  const tokenHash = hashToken(token)

  try {
    const invitation = await withTransaction(event, async (db) => {
      const workspaceType = await teamGetWorkspaceType(db, workspaceId)
      if (!workspaceType)
        throw new Error('WORKSPACE_NOT_FOUND')
      if (workspaceType === 'personal' && role !== 'member')
        throw new Error('PERSONAL_WORKSPACE_ONLY_MEMBER_ALLOWED')

      const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, MANAGE_INVITATION_ROLES)
      if (!canManage)
        throw new Error('FORBIDDEN')

      const canAssignHigherRole = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canAssignHigherRole && role !== 'member')
        throw new Error('MANAGER_CAN_ONLY_INVITE_MEMBER')

      if (projectId) {
        const projectResult = await db.query<{ workspace_id: string }>(
          `SELECT workspace_id
           FROM projects
           WHERE id = $1
           LIMIT 1`,
          [projectId],
        )

        const projectWorkspaceId = String(projectResult.rows[0]?.workspace_id || '').trim()
        if (!projectWorkspaceId)
          throw new Error('PROJECT_NOT_FOUND')
        if (projectWorkspaceId !== workspaceId)
          throw new Error('PROJECT_SCOPE_MISMATCH')

        const canManageProject = await teamCanManageProject(db, user, projectId)
        if (!canManageProject)
          throw new Error('PROJECT_INVITE_FORBIDDEN')
      }

      return teamCreateInvitation(db, {
        workspaceId,
        projectId,
        invitedByUserId: user.id,
        tokenHash,
        inviteeUsername,
        role,
        expiresAt,
      })
    })

    return ok(toTeamInvitationWithTokenResponse({
      ...invitation,
      token,
    }), {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('Team 不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40421)
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权在该 Team 发送邀请。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40321)
    }
    if (error instanceof Error && error.message === 'MANAGER_CAN_ONLY_INVITE_MEMBER') {
      setResponseStatus(event, 403)
      return fail('manager 仅可邀请 member。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40322)
    }
    if (error instanceof Error && error.message === 'PERSONAL_WORKSPACE_ONLY_MEMBER_ALLOWED') {
      setResponseStatus(event, 403)
      return fail('个人项目台不支持 admin 或 manager 空间角色。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40323)
    }
    if (error instanceof Error && (error.message === 'PROJECT_NOT_FOUND' || error.message === 'PROJECT_SCOPE_MISMATCH')) {
      setResponseStatus(event, 404)
      return fail('当前项目不存在，或不属于该 Team。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40422)
    }
    if (error instanceof Error && error.message === 'PROJECT_INVITE_FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权向该项目发起邀请。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40324)
    }
    throw error
  }
})
