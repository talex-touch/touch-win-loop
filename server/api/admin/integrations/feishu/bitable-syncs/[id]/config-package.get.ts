import type { FeishuBitableSyncConfigPackage } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { buildFeishuBitableSyncConfigPackage } from '~~/server/utils/feishu-bitable-sync-config-package'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getFeishuBitableSyncDetail } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权导出飞书多维同步配置包。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40491)
  }

  const detail = await withClient(event, db => getFeishuBitableSyncDetail(db, {
    syncId,
    includeInactive: true,
  }))
  if (!detail) {
    setResponseStatus(event, 404)
    return fail('同步信息不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40492)
  }

  return ok<FeishuBitableSyncConfigPackage>(
    buildFeishuBitableSyncConfigPackage(detail),
    {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    },
  )
})
