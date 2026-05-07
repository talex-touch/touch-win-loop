import type {
  ReleaseQueueInsightsWindowDays,
  ReleaseQueueReviewerRankingMode,
  ReleaseScopeKind,
  ReleaseVersionStatus,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { listReleaseQueueResult } from '~~/server/utils/release-store'

function normalizeScopeKind(raw: unknown): ReleaseScopeKind | undefined {
  const value = String(raw || '').trim()
  if (value === 'contest' || value === 'policy_library')
    return value
  return undefined
}

function normalizeStatuses(raw: unknown): ReleaseVersionStatus[] | undefined {
  if (typeof raw !== 'string')
    return undefined
  const values = raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item): item is ReleaseVersionStatus => {
      return [
        'pending_first_review',
        'pending_second_review',
        'approved',
        'rejected',
        'published',
        'superseded',
      ].includes(item)
    })
  return values.length ? values : undefined
}

function normalizeReviewerRankingMode(raw: unknown): ReleaseQueueReviewerRankingMode {
  const value = String(raw || '').trim()
  if (value === 'second_review_approved' || value === 'published')
    return value
  return 'total_actions'
}

function normalizeInsightsWindowDays(raw: unknown): ReleaseQueueInsightsWindowDays {
  const value = Number(raw)
  if (value === 7 || value === 30)
    return value
  return 0
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')

  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权访问发布审批队列。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40371)
  }

  const query = getQuery(event)
  const scopeKind = normalizeScopeKind(query.scopeKind)
  const statuses = normalizeStatuses(query.statuses)
  const limit = Math.max(1, Math.min(500, Number(query.limit || 100)))
  const rankingMode = normalizeReviewerRankingMode(query.rankingMode)
  const windowDays = normalizeInsightsWindowDays(query.windowDays)
  const [canWrite, canPublish] = await Promise.all([
    checkPlatformPermission(event, user, 'contest.write'),
    checkPlatformPermission(event, user, 'contest.publish'),
  ])

  const items = await withClient(event, async (db) => {
    return listReleaseQueueResult(db, {
      actorUserId: user.id,
      canPublishCurrentUser: canPublish,
      canWriteCurrentUser: canWrite,
      rankingMode,
      scopeKind,
      statuses,
      limit,
      windowDays,
    })
  })

  return ok(items, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
