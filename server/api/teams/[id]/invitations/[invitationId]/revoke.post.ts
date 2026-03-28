import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamMemberManagementSnapshotResponse } from '~~/server/utils/team-api-presenter'
import { teamRevokeWorkspaceInvitation } from '~~/server/utils/team-invitation-store'
import { teamGetWorkspaceMemberManagementSnapshot } from '~~/server/utils/team-membership-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const invitationId = String(getRouterParam(event, 'invitationId') || '').trim()

  if (!workspaceId || !invitationId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId 或 invitationId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40023)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const revoked = await teamRevokeWorkspaceInvitation(db, {
        workspaceId,
        invitationId,
        actorUser: user,
      })
      const snapshot = await teamGetWorkspaceMemberManagementSnapshot(db, workspaceId)
      return {
        revoked,
        snapshot,
      }
    })

    return ok({
      revoked: payload.revoked,
      ...toTeamMemberManagementSnapshotResponse(payload.snapshot),
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权撤销该 Team 邀请。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40323)
    }

    if (error instanceof Error && error.message === 'INVITATION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('邀请不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40423)
    }

    throw error
  }
})
