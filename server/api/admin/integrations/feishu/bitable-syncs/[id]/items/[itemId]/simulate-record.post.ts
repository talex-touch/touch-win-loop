import type {
  FeishuBitableSimulateRecordRequest,
  FeishuBitableSimulateRecordResult,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { simulateFeishuBitableSyncItemRecord } from '~~/server/services/feishu/bitable-sync'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const body = await readBody<FeishuBitableSimulateRecordRequest>(event).catch(() => ({} as FeishuBitableSimulateRecordRequest))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权模拟执行子表同步项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40469)
  }

  if (!syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40169)
  }

  if (!String(body.locatorValue || '').trim()) {
    setResponseStatus(event, 400)
    return fail('请先输入业务编号、recordId 或行号。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40170)
  }

  const result = await simulateFeishuBitableSyncItemRecord(event, {
    syncItemId,
    actorUserId: user.id,
    draft: body,
  }).catch((error) => {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '模拟执行失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40171)
  })

  if ('code' in result)
    return result

  return ok<FeishuBitableSimulateRecordResult>(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
