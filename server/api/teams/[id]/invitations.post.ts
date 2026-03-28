import type { WorkspaceMemberRole } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createSessionToken, hashToken } from '~~/server/utils/security'
import { toTeamInvitationWithTokenResponse } from '~~/server/utils/team-api-presenter'
import { teamCreateInvitation } from '~~/server/utils/team-invitation-store'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import { teamGetWorkspaceType } from '~~/server/utils/team-quota-store'

interface InvitationBody {
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
  const expiresInDays = Math.max(1, Math.min(30, Number(body?.expiresInDays || 7)))
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const token = createSessionToken()
  const tokenHash = hashToken(token)

  try {
    const invitation = await withTransaction(event, async (db) => {
      const workspaceType = await teamGetWorkspaceType(db, workspaceId)
      if (!workspaceType)
        throw new Error('WORKSPACE_NOT_FOUND')

      const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, MANAGE_INVITATION_ROLES)
      if (!canManage)
        throw new Error('FORBIDDEN')

      const canAssignHigherRole = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canAssignHigherRole && role !== 'member')
        throw new Error('MANAGER_CAN_ONLY_INVITE_MEMBER')

      return teamCreateInvitation(db, {
        workspaceId,
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
    throw error
  }
})
