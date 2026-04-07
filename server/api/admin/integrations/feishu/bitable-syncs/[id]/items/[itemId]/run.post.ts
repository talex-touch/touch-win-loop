import { setResponseStatus } from 'h3'
import { runWorkflow } from '~~/server/services/workflow/workflow-orchestrator'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权执行子表同步项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40462)
  }

  if (!syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40163)
  }

  const summary = await runWorkflow({
    providerName: 'feishu_bitable',
    syncItemId,
    actorUserId: user.id,
    triggerSource: 'manual',
  }).catch((error) => {
    const code = error instanceof Error ? error.message : String(error || '')
    if (code === 'FEISHU_BITABLE_SYNC_ITEM_NOT_FOUND' || code === 'FEISHU_BITABLE_SYNC_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('子表同步项不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40463)
    }
    if (code === 'FEISHU_INTEGRATION_DISABLED') {
      setResponseStatus(event, 400)
      return fail('飞书集成未启用，无法执行同步。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40164)
    }
    if (code === 'FEISHU_BITABLE_SYNC_DISABLED') {
      setResponseStatus(event, 400)
      return fail('当前主同步信息已禁用，请先启用后再执行子表同步项。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40165)
    }
    if (code === 'FEISHU_BITABLE_SYNC_ITEM_INACTIVE') {
      setResponseStatus(event, 400)
      return fail('当前子表同步项已禁用，请先启用后再执行。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40166)
    }
    throw error
  }) as {
    runId: string
    status: 'success' | 'partial_success' | 'failed'
    fetchedCount: number
    createdCount: number
    updatedCount: number
    skippedCount: number
    errorCount: number
    writebackSuccessCount: number
    writebackErrorCount: number
  }

  if ('code' in summary)
    return summary

  return ok(summary, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
