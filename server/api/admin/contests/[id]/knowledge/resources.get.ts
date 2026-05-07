import type { ResourceCategory, ResourceKnowledgeGovernanceStatus, ResourceSearchSort, ResourceStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { parseResourceMinQuality, parseResourceSearchSort, parseResourceSearchTags } from '~~/server/utils/resource-knowledge-event'
import { listContestResourcesWithKnowledge } from '~~/server/utils/resource-knowledge-store'

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
    }, 400302)
  }

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看知识库治理资源。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403302)
  }

  const governanceStatus = typeof query.governanceStatus === 'string'
    ? query.governanceStatus as ResourceKnowledgeGovernanceStatus
    : ''
  const resources = await withClient(event, async (db) => {
    return listContestResourcesWithKnowledge(db, {
      contestId,
      includeInternal: true,
      status: typeof query.status === 'string' ? query.status as ResourceStatus : '',
      category: typeof query.category === 'string' ? query.category as ResourceCategory : '',
      year: typeof query.year === 'string' && query.year ? Number(query.year) : undefined,
      query: typeof query.q === 'string' ? query.q : '',
      tags: parseResourceSearchTags(query.tags),
      sort: (parseResourceSearchSort(query.sort) || 'relevance') as ResourceSearchSort,
      minQuality: parseResourceMinQuality(query.minQuality),
      relatedTo: typeof query.relatedTo === 'string' ? query.relatedTo : '',
    })
  })

  const filtered = governanceStatus
    ? resources.filter(item => item.aiProfile?.governanceStatus === governanceStatus)
    : resources

  return ok(filtered, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
