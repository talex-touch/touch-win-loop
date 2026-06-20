import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { revokeFeishuBitableSyncConfigShare } from '~~/server/utils/feishu-bitable-sync-config-share-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface RevokeConfigShareBody {
  shareKey?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<RevokeConfigShareBody>(event).catch(() => ({} as RevokeConfigShareBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权撤销飞书同步公网配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40494)
  }

  const result = await withTransaction(event, db => revokeFeishuBitableSyncConfigShare(db, {
    sourceSyncId: syncId,
    actorUserId: user.id,
    shareKey: body.shareKey,
  }))

  return ok(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
