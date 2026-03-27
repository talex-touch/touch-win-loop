import type { FeishuConfigValidationResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getFeishuBitableTaskById, validateFeishuMappingConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface ValidateConfigBody {
  mapping?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const taskId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<ValidateConfigBody>(event).catch(() => ({} as ValidateConfigBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权校验飞书映射配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40405)
  }

  if (!taskId) {
    setResponseStatus(event, 400)
    return fail('taskId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40105)
  }

  const task = await withClient(event, async (db) => {
    return getFeishuBitableTaskById(db, taskId)
  })
  if (!task) {
    setResponseStatus(event, 404)
    return fail('任务不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40406)
  }

  const mapping = body.mapping !== undefined ? body.mapping : task.mapping
  const validation = validateFeishuMappingConfig(mapping)
  return ok<FeishuConfigValidationResult>(validation, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
