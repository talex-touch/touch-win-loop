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

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<CreateGovernanceTaskBody>(event)

  if (!contestId || !body?.taskType) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 taskType。', {
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

  const resourceIds = [...new Set([
    String(body.resourceId || '').trim(),
    ...((body.resourceIds || []).map(item => String(item || '').trim())),
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

    return Promise.all(
      resourceIds.map(resourceId => enqueueResourceGovernanceTask(db, {
        contestId,
        resourceId,
        taskType: body.taskType!,
        actorUserId: user.id,
        payload: body.payload,
      })),
    )
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
