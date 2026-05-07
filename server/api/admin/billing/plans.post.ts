import { defineApiHandler } from '~~/server/utils/api-handler'
import { requireAuth } from '~~/server/utils/auth'
import { createBillingPlan } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
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

export default defineApiHandler(async ({ event, fail, ok }) => {
  const { user } = await requireAuth(event)
  const body = await readBody<CreatePlanBody>(event)

  const canWritePricing = await checkPlatformPermission(event, user, 'pricing.write')
  if (!canWritePricing)
    return fail('当前用户无权新增套餐。', 40385, { status: 403 })

  const code = String(body?.code || '').trim()
  const name = String(body?.name || '').trim()
  if (!code || !name)
    return fail('code 和 name 不能为空。', 40084, { status: 400 })

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

  return ok(plan)
})
