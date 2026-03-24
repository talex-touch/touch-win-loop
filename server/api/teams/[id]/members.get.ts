import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getWorkspaceMemberManagementSnapshot, hasWorkspaceMembership } from '~~/server/utils/platform-store'
import { toTeamMemberManagementSnapshotResponse } from '~~/server/utils/team-api-presenter'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40091)
  }

  try {
    const snapshot = await withClient(event, async (db) => {
      const canAccess = await hasWorkspaceMembership(db, user, workspaceId)
      if (!canAccess)
        throw new Error('FORBIDDEN')
      return getWorkspaceMemberManagementSnapshot(db, workspaceId)
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
      return fail('当前用户无权查看该 Team 成员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40391)
    }
    throw error
  }
})
