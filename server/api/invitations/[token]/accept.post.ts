import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { hashToken } from '~~/server/utils/security'
import { toTeamInvitationResponse, toTeamWithQuotaResponse } from '~~/server/utils/team-api-presenter'
import { teamAcceptInvitation } from '~~/server/utils/team-invitation-store'
import { teamListUserWorkspaces } from '~~/server/utils/team-workspace-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const token = getRouterParam(event, 'token') || ''

  if (!token) {
    setResponseStatus(event, 400)
    return fail('邀请 token 缺失。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40031)
  }

  try {
    const invitation = await withTransaction(event, async (db) => {
      return teamAcceptInvitation(db, hashToken(token), user)
    })

    if (!invitation) {
      setResponseStatus(event, 404)
      return fail('邀请不存在或已过期。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40431)
    }

    const workspaces = await withTransaction(event, async (db) => {
      return teamListUserWorkspaces(db, user.id)
    })

    return ok({
      invitation: toTeamInvitationResponse(invitation),
      teams: workspaces.map(toTeamWithQuotaResponse),
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'INVITATION_TARGET_MISMATCH') {
      setResponseStatus(event, 403)
      return fail('该邀请不匹配当前登录用户。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40331)
    }
    if (error instanceof Error && error.message === 'TEAM_SEAT_LIMIT_REACHED') {
      setResponseStatus(event, 409)
      return fail('Team 席位已满，请联系管理员扩容后重试。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40931)
    }
    throw error
  }
})
