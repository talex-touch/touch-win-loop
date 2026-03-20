import type { BillingCycle } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { estimateWorkspaceBilling, setWorkspaceBillingPlan } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchOrgBillingBody {
  planId?: string
  billingCycle?: BillingCycle
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchOrgBillingBody>(event)
  const planId = String(body?.planId || '').trim()
  const billingCycle = body?.billingCycle || 'monthly'

  const canWritePricing = await checkPlatformPermission(event, user, 'pricing.write')
  if (!canWritePricing) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改组织计费方案。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40394)
  }

  if (!workspaceId || !planId) {
    setResponseStatus(event, 400)
    return fail('缺少 workspaceId 或 planId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  if (!['monthly', 'quarterly', 'yearly'].includes(billingCycle)) {
    setResponseStatus(event, 400)
    return fail('billingCycle 仅支持 monthly / quarterly / yearly。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  try {
    const estimate = await withTransaction(event, async (db) => {
      const workspaceResult = await db.query<{ id: string }>(
        `SELECT id
         FROM workspaces
         WHERE id = $1
           AND type = 'team'
         LIMIT 1`,
        [workspaceId],
      )
      if (!workspaceResult.rows[0]?.id)
        throw new Error('ORG_NOT_FOUND')

      const planResult = await db.query<{ id: string }>(
        `SELECT id
         FROM billing_plans
         WHERE id = $1
         LIMIT 1`,
        [planId],
      )
      if (!planResult.rows[0]?.id)
        throw new Error('PLAN_NOT_FOUND')

      await setWorkspaceBillingPlan(db, {
        workspaceId,
        planId,
        billingCycle,
      })

      const estimate = await estimateWorkspaceBilling(db, { workspaceId })
      if (!estimate)
        throw new Error('ORG_NOT_FOUND')
      return estimate
    })

    return ok(estimate, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'ORG_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标组织不存在或不是团队工作区。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40494)
    }

    if (error instanceof Error && error.message === 'PLAN_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标套餐不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40495)
    }

    throw error
  }
})
