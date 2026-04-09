import type { ResourceAvailability, ResourceCategory } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { getAuthFromEvent } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { parseResourceMinQuality, parseResourceSearchSort, parseResourceSearchTags, resolveResourceSearchSessionId } from '~~/server/utils/resource-knowledge-event'
import { enqueueResourceGovernanceTask, listContestResourcesWithKnowledge, recordResourceSearchEvent } from '~~/server/utils/resource-knowledge-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const auth = await getAuthFromEvent(event)
  const contestId = getRouterParam(event, 'id') || ''
  const query = getQuery(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40089)
  }

  const includeInternal = auth?.user
    ? Boolean(auth.user.isPlatformAdmin || await checkPlatformPermission(event, auth.user, 'contest.read_internal'))
    : false

  const resources = await withClient(event, async (db) => {
    return listContestResourcesWithKnowledge(db, {
      contestId,
      includeInternal,
      category: typeof query.category === 'string' ? query.category as ResourceCategory : '',
      year: typeof query.year === 'string' && query.year ? Number(query.year) : undefined,
      availability: typeof query.availability === 'string' ? query.availability as ResourceAvailability : '',
      query: typeof query.q === 'string' ? query.q : '',
      tags: parseResourceSearchTags(query.tags),
      sort: parseResourceSearchSort(query.sort),
      minQuality: parseResourceMinQuality(query.minQuality),
      relatedTo: typeof query.relatedTo === 'string' ? query.relatedTo : '',
    })
  })

  if (includeInternal && auth?.user?.id) {
    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: auth.user.id,
        action: 'read.internal.contest_resources',
        contestId,
        payload: {
          category: typeof query.category === 'string' ? query.category : '',
          year: typeof query.year === 'string' ? query.year : '',
          availability: typeof query.availability === 'string' ? query.availability : '',
          q: typeof query.q === 'string' ? query.q : '',
        },
      })
    })
  }

  const searchQuery = typeof query.q === 'string' ? query.q.trim() : ''
  if (searchQuery) {
    await withTransaction(event, async (db) => {
      await recordResourceSearchEvent(db, {
        contestId,
        query: searchQuery,
        filters: {
          category: typeof query.category === 'string' ? query.category : '',
          year: typeof query.year === 'string' ? query.year : '',
          availability: typeof query.availability === 'string' ? query.availability : '',
          tags: parseResourceSearchTags(query.tags),
          sort: parseResourceSearchSort(query.sort) || '',
          minQuality: parseResourceMinQuality(query.minQuality) ?? null,
          relatedTo: typeof query.relatedTo === 'string' ? query.relatedTo : '',
        },
        resultCount: resources.length,
        clicked: false,
        sessionId: resolveResourceSearchSessionId(event, auth?.session.id),
        userId: auth?.user?.id || null,
      })
      await enqueueResourceGovernanceTask(db, {
        contestId,
        taskType: 'search_metric_rollup',
        payload: {
          resourceIds: resources.slice(0, 8).map(item => item.id),
        },
      })
    })
  }

  return ok(resources, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
