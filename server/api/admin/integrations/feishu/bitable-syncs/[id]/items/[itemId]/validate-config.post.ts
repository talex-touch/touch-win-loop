import type { FeishuConfigValidationResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getFeishuBitableSyncItemById, validateFeishuMappingConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface ValidateConfigBody {
  mapping?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const body = await readBody<ValidateConfigBody>(event).catch(() => ({} as ValidateConfigBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权校验子表映射配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40463)
  }

  if (!syncId || !syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncId 与 syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40164)
  }

  const item = await withClient(event, async (db) => {
    return getFeishuBitableSyncItemById(db, syncItemId)
  })
  if (!item || item.syncId !== syncId) {
    setResponseStatus(event, 404)
    return fail('子表同步项不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40464)
  }

  const validation = validateFeishuMappingConfig(body.mapping !== undefined ? body.mapping : item.mapping)
  return ok<FeishuConfigValidationResult>(validation, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
