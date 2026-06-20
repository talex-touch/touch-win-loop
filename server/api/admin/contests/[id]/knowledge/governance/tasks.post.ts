import type { ResourceGovernanceTaskType } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { enqueueResourceGovernanceTask } from '~~/server/utils/resource-knowledge-store'

interface CreateGovernanceTaskBody {
  taskType?: ResourceGovernanceTaskType
  resourceId?: string
  resourceIds?: string[]
  payload?: Record<string, unknown>
}

const ALLOWED_RESOURCE_GOVERNANCE_TASK_TYPES: ResourceGovernanceTaskType[] = [
  'profile_analyze',
  'relation_refresh',
  'governance_apply',
  'search_metric_rollup',
]

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<CreateGovernanceTaskBody>(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400307)
  }

  if (!body?.taskType || !ALLOWED_RESOURCE_GOVERNANCE_TASK_TYPES.includes(body.taskType)) {
    setResponseStatus(event, 400)
    return fail('taskType 非法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400307)
  }

  if (body.resourceIds !== undefined && !Array.isArray(body.resourceIds)) {
    setResponseStatus(event, 400)
    return fail('resourceIds 必须为字符串数组。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400307)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权创建治理任务。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403307)
  }

  const normalizedResourceId = typeof body.resourceId === 'string' ? body.resourceId.trim() : ''
  const normalizedResourceIds = (body.resourceIds || []).flatMap((item) => {
    if (typeof item !== 'string')
      return []
    const normalized = item.trim()
    return normalized ? [normalized] : []
  })
  const resourceIds = [...new Set([
    normalizedResourceId,
    ...normalizedResourceIds,
  ].filter(Boolean))]

  const tasks = await withTransaction(event, async (db) => {
    if (resourceIds.length === 0) {
      return [await enqueueResourceGovernanceTask(db, {
        contestId,
        taskType: body.taskType!,
        actorUserId: user.id,
        payload: body.payload,
        force: true,
      })]
    }

    const tasks = []
    for (const resourceId of resourceIds) {
      tasks.push(await enqueueResourceGovernanceTask(db, {
        contestId,
        resourceId,
        taskType: body.taskType!,
        actorUserId: user.id,
        payload: body.payload,
      }))
    }
    return tasks
  })

  return ok({
    contestId,
    count: tasks.length,
    tasks,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
