import { defineApiHandler } from '~~/server/utils/api-handler'
import { requireAuth } from '~~/server/utils/auth'
import { listBillingPlans } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'

export default defineApiHandler(async ({ event, ok }) => {
  await requireAuth(event)

  const plans = await withClient(event, async (db) => {
    return listBillingPlans(db, false)
  })

  return ok(plans)
})
