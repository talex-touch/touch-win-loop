import type { FeishuFieldInspectionItem } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { inspectFeishuBitableSyncItemFields } from '~~/server/services/feishu/bitable-sync'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const sampleRecords = Math.max(1, Math.min(500, Number(getQuery(event).sampleRecords || 120)))

  const canRead = await checkPlatformPermission(event, user, 'contest.write')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看子表字段巡检。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40460)
  }

  if (!syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40161)
  }

  const items = await inspectFeishuBitableSyncItemFields(event, {
    syncItemId,
    sampleRecords,
  })

  return ok<FeishuFieldInspectionItem[]>(items, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
