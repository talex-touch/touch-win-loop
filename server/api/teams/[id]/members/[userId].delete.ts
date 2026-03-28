import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamMemberManagementSnapshotResponse } from '~~/server/utils/team-api-presenter'
import { teamGetWorkspaceMemberManagementSnapshot, teamRemoveWorkspaceMember } from '~~/server/utils/team-membership-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const targetUserId = String(getRouterParam(event, 'userId') || '').trim()

  if (!workspaceId || !targetUserId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId 或 targetUserId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  try {
    const snapshot = await withTransaction(event, async (db) => {
      await teamRemoveWorkspaceMember(db, {
        workspaceId,
        actorUser: user,
        targetUserId,
      })
      return teamGetWorkspaceMemberManagementSnapshot(db, workspaceId)
    })

    return ok(toTeamMemberManagementSnapshotResponse(snapshot), {
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
      return fail('当前用户无权移除该 Team 成员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40393)
    }

    if (error instanceof Error && error.message === 'WORKSPACE_MEMBER_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标成员不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40493)
    }

    if (error instanceof Error && error.message === 'WORKSPACE_OWNER_IMMUTABLE') {
      setResponseStatus(event, 409)
      return fail('owner 不可移除。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40993)
    }

    throw error
  }
})
