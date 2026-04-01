import type { FeishuSyncIssue, FeishuSyncIssueStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { listFeishuSyncIssues } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const query = getQuery(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看飞书关联问题。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40407)
  }

  const syncItemId = String(query.syncItemId || '').trim() || undefined
  const statusRaw = String(query.status || '').trim()
  const status = ['open', 'resolved', 'ignored'].includes(statusRaw)
    ? statusRaw as FeishuSyncIssueStatus
    : undefined
  const limit = Number(query.limit || 100)

  const issues = await withClient(event, async (db) => {
    return listFeishuSyncIssues(db, {
      syncItemId,
      status,
      limit,
    })
  })

  return ok<FeishuSyncIssue[]>(issues, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
