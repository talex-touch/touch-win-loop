import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { listResourceDemandInsights, listResourceSearchEvents } from '~~/server/utils/resource-knowledge-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400308)
  }

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看需求洞察。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403308)
  }

  const days = typeof query.days === 'string' ? Number(query.days) : 30
  const limit = typeof query.limit === 'string' ? Number(query.limit) : 20
  const payload = await withClient(event, async (db) => {
    const [insights, recentEvents] = await Promise.all([
      listResourceDemandInsights(db, {
        contestId,
        days,
        limit,
      }),
      listResourceSearchEvents(db, {
        contestId,
        days,
        limit: Math.max(20, limit * 3),
      }),
    ])

    return {
      contestId,
      insights,
      recentEvents,
      summary: {
        searchCount: recentEvents.filter(item => !item.clicked).length,
        clickCount: recentEvents.filter(item => item.clicked).length,
        zeroResultCount: recentEvents.filter(item => !item.clicked && Number(item.resultCount || 0) === 0).length,
      },
    }
  })

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
