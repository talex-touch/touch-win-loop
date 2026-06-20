import type { FeishuBitableSyncCleanupPreview } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { previewFeishuBitableSyncItemCleanup } from '~~/server/utils/feishu-sync-cleanup-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权预览同步清理。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40464)
  }

  if (!syncId || !syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncId 与 syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40168)
  }

  const preview = await withClient(event, async (db) => {
    return previewFeishuBitableSyncItemCleanup(db, {
      syncId,
      syncItemId,
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
      }, 40465)
    }
    throw error
  }) as FeishuBitableSyncCleanupPreview | { code: number }

  if ('code' in preview)
    return preview

  return ok<FeishuBitableSyncCleanupPreview>(preview, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
