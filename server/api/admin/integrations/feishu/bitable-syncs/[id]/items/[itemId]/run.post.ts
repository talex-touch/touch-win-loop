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

  return ok(summary, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
