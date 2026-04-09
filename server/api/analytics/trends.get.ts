import type { AnalyticsFilterInput, AnalyticsTrendAnalysisPayload } from '~~/shared/types/analytics'
import { readAnalyticsFilters } from '~~/server/utils/analytics-filters'
import { getContestTrendAnalysis } from '~~/server/utils/analytics-store'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  const filters: AnalyticsFilterInput = readAnalyticsFilters(event)

  const payload = await withClient(event, db => getContestTrendAnalysis(db, {
    user,
    includeInternal,
    filters,
  }))

  return ok<AnalyticsTrendAnalysisPayload>(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
