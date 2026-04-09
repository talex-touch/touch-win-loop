import type { ResourceAvailability, ResourceCategory } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { getAuthFromEvent } from '~~/server/utils/auth'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { parseResourceMinQuality, parseResourceSearchSort, parseResourceSearchTags, resolveResourceSearchSessionId } from '~~/server/utils/resource-knowledge-event'
import { enqueueResourceGovernanceTask, listGlobalResourcesWithKnowledge, recordResourceSearchEvent } from '~~/server/utils/resource-knowledge-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const query = getQuery(event)
  const auth = await getAuthFromEvent(event)
  const queryText = typeof query.q === 'string' ? query.q : ''
  const searchTags = parseResourceSearchTags(query.tags)
  const sort = parseResourceSearchSort(query.sort)
  const minQuality = parseResourceMinQuality(query.minQuality)
  const relatedTo = typeof query.relatedTo === 'string' ? query.relatedTo : ''
  const explicitContestId = typeof query.contestId === 'string' ? query.contestId.trim() : ''
  const includeInternal = auth?.user
    ? Boolean(auth.user.isPlatformAdmin || await checkPlatformPermission(event, auth.user, 'contest.read_internal'))
    : false
  const category = typeof query.category === 'string' ? query.category as ResourceCategory : ''
  const availability = typeof query.availability === 'string' ? query.availability as ResourceAvailability : ''

  const resources = await withClient(event, async (db) => {
    return listGlobalResourcesWithKnowledge(db, {
      includeInternal,
      contestId: explicitContestId,
      category,
      year: typeof query.year === 'string' && query.year ? Number(query.year) : undefined,
      availability,
      type: typeof query.type === 'string' ? query.type : '',
      query: queryText,
      tags: searchTags,
      sort,
      minQuality,
      relatedTo,
    })
  })

  const filters = {
    contestId: explicitContestId,
    category: typeof query.category === 'string' ? query.category : '',
    year: typeof query.year === 'string' ? query.year : '',
    availability: typeof query.availability === 'string' ? query.availability : '',
    type: typeof query.type === 'string' ? query.type : '',
    tags: searchTags,
    sort: sort || '',
    minQuality: minQuality ?? null,
    relatedTo,
  }
  const resultCountByContest = new Map<string, number>()
  const resourceIdsByContest = new Map<string, string[]>()
  for (const resource of resources) {
    const contestId = String(resource.contestId || '').trim()
    if (!contestId)
      continue
    resultCountByContest.set(contestId, Number(resultCountByContest.get(contestId) || 0) + 1)
    const resourceIds = resourceIdsByContest.get(contestId) || []
    if (resourceIds.length < 8)
      resourceIds.push(resource.id)
    resourceIdsByContest.set(contestId, resourceIds)
  }
  const contestIds = explicitContestId
    ? [explicitContestId]
    : [...resultCountByContest.keys()]

  if (contestIds.length > 0) {
    try {
      await withTransaction(event, async (db) => {
        const sessionId = resolveResourceSearchSessionId(event, auth?.session.id)
        const knownContestIds = new Set<string>()
        const knownResult = await db.query<{ id: string }>(
          `SELECT id
           FROM contests
           WHERE id = ANY($1::TEXT[])`,
          [contestIds],
        )
        for (const row of knownResult.rows)
          knownContestIds.add(String(row.id || '').trim())

        for (const contestId of contestIds) {
          if (!knownContestIds.has(contestId))
            continue

          const resourceIds = resourceIdsByContest.get(contestId) || []
          try {
            await recordResourceSearchEvent(db, {
              contestId,
              query: queryText,
              filters,
              resultCount: explicitContestId ? resources.length : Number(resultCountByContest.get(contestId) || 0),
              clicked: false,
              sessionId,
              userId: auth?.user?.id || null,
            })
          }
          catch (error) {
            console.warn('[resource-search] 记录检索事件失败', { contestId, error })
          }

          if (resourceIds.length > 0) {
            try {
              await enqueueResourceGovernanceTask(db, {
                contestId,
                taskType: 'search_metric_rollup',
                payload: {
                  resourceIds,
                },
              })
            }
            catch (error) {
              console.warn('[resource-search] 入队检索治理任务失败', { contestId, error })
            }
          }
        }
      })
    }
    catch (error) {
      console.warn('[resource-search] 记录平台检索指标失败', error)
    }
  }

  return ok(resources, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
