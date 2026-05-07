import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { enqueueResourceGovernanceTask } from '~~/server/utils/resource-knowledge-store'

interface AnalyzeKnowledgeResourceBody {
  resourceIds?: string[]
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<AnalyzeKnowledgeResourceBody>(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400305)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权触发知识分析。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403305)
  }

  const resourceIds = [...new Set(
    (Array.isArray(body?.resourceIds) ? body.resourceIds : [])
      .map(item => String(item || '').trim())
      .filter(Boolean),
  )]
  const tasks = await withTransaction(event, async (db) => {
    let validResourceIds = resourceIds
    if (resourceIds.length > 0) {
      const result = await db.query<{ id: string }>(
        `SELECT id
         FROM contest_resources
         WHERE contest_id = $1
           AND id = ANY($2::TEXT[])`,
        [contestId, resourceIds],
      )
      validResourceIds = result.rows.map(item => String(item.id || '').trim()).filter(Boolean)
    }

    if (validResourceIds.length === 0) {
      return [await enqueueResourceGovernanceTask(db, {
        contestId,
        taskType: 'profile_analyze',
        actorUserId: user.id,
        force: true,
      })]
    }

    const tasks = []
    for (const resourceId of validResourceIds) {
      tasks.push(await enqueueResourceGovernanceTask(db, {
        contestId,
        resourceId,
        taskType: 'profile_analyze',
        actorUserId: user.id,
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
