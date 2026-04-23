import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createWorkspaceBillingMockCheckout } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'

interface MockCheckoutBody {
  planId?: string
  billingCycle?: 'monthly' | 'quarterly' | 'yearly'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<MockCheckoutBody>(event)

  if (!workspaceId || !body?.planId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId 或 planId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400136)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canManage)
        throw new Error('FORBIDDEN')
      return createWorkspaceBillingMockCheckout(db, {
        workspaceId,
        planId: body.planId!,
        billingCycle: body.billingCycle || 'monthly',
        actorUserId: user.id,
      })
    })

    return ok({
      order: result.order,
      estimate: result.estimate,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 'mock payment succeeded')
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权为该 Team 结算。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 403136)
    }
    if (error instanceof Error && error.message === 'BILLING_PLAN_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('套餐不可用。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404137)
    }
    throw error
  }
})
