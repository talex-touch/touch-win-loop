import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { estimateWorkspaceBilling } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { hasWorkspaceMembership } from '~~/server/utils/platform-store'
import { toTeamBillingEstimateResponse } from '~~/server/utils/team-api-presenter'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = getRouterParam(event, 'id') || ''

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40086)
  }

  let estimate = null
  try {
    estimate = await withClient(event, async (db) => {
      const canAccess = await hasWorkspaceMembership(db, user, workspaceId)
      if (!canAccess)
        throw new Error('FORBIDDEN')

      return estimateWorkspaceBilling(db, {
        workspaceId,
      })
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权查看该 Team 计费信息。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40386)
    }
    throw error
  }

  if (!estimate) {
    setResponseStatus(event, 404)
    return fail('team billing not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40486)
  }

  return ok(toTeamBillingEstimateResponse(estimate), {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
