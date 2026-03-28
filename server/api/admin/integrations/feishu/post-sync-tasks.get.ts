import type { FeishuPostSyncTask, FeishuPostSyncTaskStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { listFeishuPostSyncTasks } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看飞书后处理任务。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40434)
  }

  const statusRaw = String(getQuery(event).status || '').trim()
  const status = ['queued', 'processing', 'succeeded', 'failed', 'dead_letter'].includes(statusRaw)
    ? statusRaw as FeishuPostSyncTaskStatus
    : undefined
  const limit = Math.max(1, Math.min(500, Number(getQuery(event).limit || 100)))

  const tasks = await withClient(event, async (db) => {
    return listFeishuPostSyncTasks(db, {
      status,
      limit,
    })
  })

  return ok<FeishuPostSyncTask[]>(tasks, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
