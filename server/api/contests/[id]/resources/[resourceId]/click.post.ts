import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { getAuthFromEvent } from '~~/server/utils/auth'
import { listContestResourcesByContestId } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { resolveResourceSearchSessionId } from '~~/server/utils/resource-knowledge-event'
import { enqueueResourceGovernanceTask, recordResourceSearchEvent } from '~~/server/utils/resource-knowledge-store'

interface ResourceClickBody {
  query?: string
  filters?: Record<string, unknown>
  resultCount?: number
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const auth = await getAuthFromEvent(event)
  const contestId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const body = await readBody<ResourceClickBody>(event)

  if (!contestId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400309)
  }

  const includeInternal = auth?.user
    ? Boolean(auth.user.isPlatformAdmin || await checkPlatformPermission(event, auth.user, 'contest.read_internal'))
    : false

  const resource = await withClient(event, async (db) => {
    const items = await listContestResourcesByContestId(db, {
      contestId,
      includeInternal,
    })
    return items.find(item => item.id === resourceId) || null
  })

  if (!resource) {
    setResponseStatus(event, 404)
    return fail('resource not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404309)
  }

  await withTransaction(event, async (db) => {
    await recordResourceSearchEvent(db, {
      contestId,
      resourceId,
      query: body?.query || '',
      filters: body?.filters || {},
      resultCount: Number(body?.resultCount || 0),
      clicked: true,
      sessionId: resolveResourceSearchSessionId(event, auth?.session.id),
      userId: auth?.user?.id || null,
    })
    await enqueueResourceGovernanceTask(db, {
      contestId,
      resourceId,
      taskType: 'search_metric_rollup',
      payload: {
        resourceId,
      },
    })
  })

  return ok({
    resourceId,
    targetUrl: resource.sourceLink,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
