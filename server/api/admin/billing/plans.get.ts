import { defineApiHandler } from '~~/server/utils/api-handler'
import { requireAuth } from '~~/server/utils/auth'
import { listBillingPlans } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineApiHandler(async ({ event, fail, ok }) => {
  const { user } = await requireAuth(event)

  const canWritePricing = await checkPlatformPermission(event, user, 'pricing.write')
  if (!canWritePricing)
    return fail('当前用户无权访问计费配置。', 40384, { status: 403 })

  const plans = await withClient(event, async (db) => {
    return listBillingPlans(db, true)
  })

  return ok(plans)
})
