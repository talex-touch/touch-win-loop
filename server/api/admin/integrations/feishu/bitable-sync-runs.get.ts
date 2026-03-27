import type { FeishuBitableSyncRun } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { listFeishuBitableSyncRuns } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const taskId = String(getQuery(event).taskId || '').trim()
  const limit = Math.max(1, Math.min(200, Number(getQuery(event).limit || 50)))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看飞书 Bitable 运行日志。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40404)
  }

  const runs = await withClient(event, async (db) => {
    return listFeishuBitableSyncRuns(db, {
      taskId: taskId || undefined,
      limit,
    })
  })

  return ok<FeishuBitableSyncRun[]>(runs, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
