import type { FeishuBitableSyncItemDetail } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getFeishuBitableSyncItemDetail } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const runLimit = Math.max(1, Math.min(100, Number(getQuery(event).runLimit || 20)))
  const issueLimit = Math.max(1, Math.min(200, Number(getQuery(event).issueLimit || 50)))

  const canRead = await checkPlatformPermission(event, user, 'contest.write')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看子表同步项详情。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40457)
  }

  if (!syncId || !syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncId 与 syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40158)
  }

  const detail = await withClient(event, async (db) => {
    return getFeishuBitableSyncItemDetail(db, {
      syncId,
      syncItemId,
      runLimit,
      issueLimit,
    })
  })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('子表同步项不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40458)
  }

  return ok<FeishuBitableSyncItemDetail>(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
