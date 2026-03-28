import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { estimateWorkspaceBilling, setWorkspaceBillingPlan } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamBillingEstimateResponse } from '~~/server/utils/team-api-presenter'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'

interface PatchWorkspaceBillingBody {
  planId?: string
  billingCycle?: 'monthly' | 'quarterly' | 'yearly'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = getRouterParam(event, 'id') || ''
  const body = await readBody<PatchWorkspaceBillingBody>(event)

  if (!workspaceId || !body?.planId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId 或 planId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40087)
  }

  let estimate = null
  try {
    estimate = await withTransaction(event, async (db) => {
      const canAccess = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canAccess)
        throw new Error('FORBIDDEN')

      await setWorkspaceBillingPlan(db, {
        workspaceId,
        planId: body.planId!,
        billingCycle: body?.billingCycle,
      })

      return estimateWorkspaceBilling(db, { workspaceId })
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权修改该 Team 计费方案。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40387)
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
    }, 40487)
  }

  return ok(toTeamBillingEstimateResponse(estimate), {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
