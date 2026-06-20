import { setResponseStatus } from 'h3'
import { FeishuBitableSyncRunError, runFeishuBitableSync } from '~~/server/services/feishu/bitable-sync-runner'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function statusCodeForRunError(error: FeishuBitableSyncRunError): number {
  if (error.code === 'FEISHU_BITABLE_SYNC_NOT_FOUND')
    return 404
  return 400
}

function responseCodeForRunError(error: FeishuBitableSyncRunError): number {
  if (error.code === 'FEISHU_BITABLE_SYNC_NOT_FOUND')
    return 40464
  if (error.code === 'FEISHU_BITABLE_SYNC_DISABLED')
    return 40165
  if (error.code === 'FEISHU_BITABLE_SYNC_ARCHIVED')
    return 40169
  if (error.code === 'FEISHU_BITABLE_SYNC_NO_ACTIVE_ITEMS')
    return 40170
  if (error.code === 'FEISHU_BITABLE_SYNC_MANUAL_BLOCKED')
    return 40171
  return 40172
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权执行同步信息。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40462)
  }

  if (!syncId) {
    setResponseStatus(event, 400)
    return fail('syncId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40163)
  }

  try {
    const summary = await runFeishuBitableSync(event, {
      syncId,
      actorUserId: user.id,
      triggerSource: 'manual',
    })

    return ok(summary, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof FeishuBitableSyncRunError) {
      setResponseStatus(event, statusCodeForRunError(error))
      return fail(error.publicMessage, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, responseCodeForRunError(error))
    }
    throw error
  }
})
