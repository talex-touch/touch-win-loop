import type { AnalyticsFilterInput, AnalyticsOverviewPayload } from '~~/shared/types/analytics'
import { getQuery } from 'h3'
import { getAnalyticsOverview } from '~~/server/utils/analytics-store'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const query = getQuery(event)
  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  const filters: AnalyticsFilterInput = {
    workspaceId: String(query.workspaceId || '').trim(),
    projectId: String(query.projectId || '').trim(),
    contestId: String(query.contestId || '').trim(),
    rangePreset: String(query.rangePreset || '').trim() as AnalyticsFilterInput['rangePreset'],
  }

  const payload = await withClient(event, db => getAnalyticsOverview(db, {
    user,
    includeInternal,
    filters,
  }))

  return ok<AnalyticsOverviewPayload>(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
