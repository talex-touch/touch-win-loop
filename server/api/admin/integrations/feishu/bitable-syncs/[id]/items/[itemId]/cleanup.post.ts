import type { FeishuBitableSyncCleanupResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  cleanupFeishuBitableSyncItem,
  FEISHU_SYNC_ITEM_CLEANUP_CONFIRMATION_TOKEN,
} from '~~/server/utils/feishu-sync-cleanup-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const body = await readBody<{ confirmationToken?: string }>(event).catch(() => ({}) as { confirmationToken?: string })
  const confirmationToken = String(body?.confirmationToken || '').trim()

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权执行同步清理。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40466)
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

  if (confirmationToken !== FEISHU_SYNC_ITEM_CLEANUP_CONFIRMATION_TOKEN) {
    setResponseStatus(event, 400)
    return fail(`危险确认未通过，请输入确认词“${FEISHU_SYNC_ITEM_CLEANUP_CONFIRMATION_TOKEN}”。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40170)
  }

  const result = await withTransaction(event, async (db) => {
    return cleanupFeishuBitableSyncItem(db, {
      syncId,
      syncItemId,
      actorUserId: user.id,
    })
  }).catch((error) => {
    const code = error instanceof Error ? error.message : String(error || '')
    if (code === 'FEISHU_BITABLE_SYNC_ITEM_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('子表同步项不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40467)
    }
    throw error
  }) as FeishuBitableSyncCleanupResult | { code: number }

  if ('code' in result)
    return result

  return ok<FeishuBitableSyncCleanupResult>(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
