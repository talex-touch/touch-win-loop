import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createBillingPlan } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreatePlanBody {
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
  const body = await readBody<CreatePlanBody>(event)

  const canWritePricing = await checkPlatformPermission(event, user, 'pricing.write')
  if (!canWritePricing) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增套餐。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40385)
  }

  const code = String(body?.code || '').trim()
  const name = String(body?.name || '').trim()
  if (!code || !name) {
    setResponseStatus(event, 400)
    return fail('code 和 name 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40084)
  }

  const plan = await withTransaction(event, async (db) => {
    return createBillingPlan(db, {
      code,
      name,
      basePriceCents: Number(body?.basePriceCents || 0),
      includedSeats: Number(body?.includedSeats || 0),
      extraSeatPriceCents: Number(body?.extraSeatPriceCents || 0),
      includedAiQuota: Number(body?.includedAiQuota || 0),
      isActive: body?.isActive !== false,
    })
  })

  return ok(plan, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
