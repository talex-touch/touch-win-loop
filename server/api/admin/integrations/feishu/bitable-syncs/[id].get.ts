import type { FeishuBitableSyncDetail } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
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
  const includeInactive = String(getQuery(event).includeInactive || '') === 'true'

  const canRead = await checkPlatformPermission(event, user, 'contest.write')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看飞书多维同步详情。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40453)
  }

  if (!syncId) {
    setResponseStatus(event, 400)
    return fail('syncId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40153)
  }

  const detail = await withClient(event, async (db) => {
    return getFeishuBitableSyncDetail(db, {
      syncId,
      includeInactive,
    })
  })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('同步信息不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40454)
  }

  return ok<FeishuBitableSyncDetail>(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
