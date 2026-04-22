import type {
  FeishuSyncIssueBatchHandleResult,
  FeishuSyncIssueStatus,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  getFeishuBitableSyncItemById,
  resolveFeishuSyncIssuesByFilter,
} from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface BatchHandleBody {
  action?: 'resolve' | 'ignore'
  status?: FeishuSyncIssueStatus
  reasonCode?: string
}

const ALLOWED_STATUSES = new Set<FeishuSyncIssueStatus>(['open', 'resolved', 'ignored'])

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const body = await readBody<BatchHandleBody>(event).catch(() => ({} as BatchHandleBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权批量处理飞书关联问题。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40470)
  }

  if (!syncId || !syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncId 与 syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40169)
  }

  const action = body.action === 'ignore' ? 'ignore' : body.action === 'resolve' ? 'resolve' : ''
  if (!action) {
    setResponseStatus(event, 400)
    return fail('action 必须是 resolve 或 ignore。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40170)
  }

  const status = ALLOWED_STATUSES.has(body.status as FeishuSyncIssueStatus)
    ? body.status as FeishuSyncIssueStatus
    : 'open'
  const reasonCode = String(body.reasonCode || '').trim()

  const result = await withTransaction(event, async (db) => {
    const item = await getFeishuBitableSyncItemById(db, syncItemId)
    if (!item || item.syncId !== syncId)
      return null

    const affectedCount = await resolveFeishuSyncIssuesByFilter(db, {
      actorUserId: user.id,
      syncItemId,
      status,
      reasonCode,
      resolution: action === 'ignore' ? 'ignored' : 'manual_bind',
      resolutionPayload: action === 'ignore'
        ? { reason: '管理员批量忽略', source: 'sync_item_editor_batch' }
        : { source: 'sync_item_editor_batch' },
    })

    return {
      affectedCount,
    } satisfies FeishuSyncIssueBatchHandleResult
  })

  if (!result) {
    setResponseStatus(event, 404)
    return fail('子表同步项不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40471)
  }

  return ok<FeishuSyncIssueBatchHandleResult>(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
