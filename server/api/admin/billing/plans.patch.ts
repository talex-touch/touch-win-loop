import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { patchBillingPlan } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchPlanBody {
  planId?: string
  code?: string
  name?: string
  basePriceCents?: number
  includedSeats?: number
  extraSeatPriceCents?: number
  includedAiQuota?: number
  isActive?: boolean
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<PatchPlanBody>(event)

  const canWritePricing = await checkPlatformPermission(event, user, 'pricing.write')
  if (!canWritePricing) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑套餐。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40386)
  }

  if (!body?.planId) {
    setResponseStatus(event, 400)
    return fail('planId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40085)
  }

  const plan = await withTransaction(event, async (db) => {
    return patchBillingPlan(db, {
      planId: body.planId!,
      patch: {
        code: body?.code,
        name: body?.name,
        basePriceCents: body?.basePriceCents,
        includedSeats: body?.includedSeats,
        extraSeatPriceCents: body?.extraSeatPriceCents,
        includedAiQuota: body?.includedAiQuota,
        isActive: body?.isActive,
      },
    })
  })

  if (!plan) {
    setResponseStatus(event, 404)
    return fail('plan not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40485)
  }

  return ok(plan, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
