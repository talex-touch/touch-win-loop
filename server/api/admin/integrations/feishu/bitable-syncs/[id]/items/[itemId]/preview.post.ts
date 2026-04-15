import type {
  FeishuBitableSyncItemPreviewRequest,
  FeishuBitableSyncItemPreviewResult,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { previewFeishuBitableSyncItem } from '~~/server/services/feishu/bitable-sync'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const body = await readBody<FeishuBitableSyncItemPreviewRequest>(event).catch(() => ({} as FeishuBitableSyncItemPreviewRequest))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权预检子表同步项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40461)
  }

  if (!syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40162)
  }

  const summary = await previewFeishuBitableSyncItem(event, {
    syncItemId,
    actorUserId: user.id,
    draft: body,
  }).catch((error) => {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '预检失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40167)
  })

  if ('code' in summary)
    return summary

  return ok<FeishuBitableSyncItemPreviewResult>(summary, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
