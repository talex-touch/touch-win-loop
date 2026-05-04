import { setResponseStatus } from 'h3'
import { getAdminOperationsAiAnalysisSnapshot } from '~~/server/services/admin-operations-ai-analysis'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看运营 AI 分析。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403421)
  }

  const payload = getAdminOperationsAiAnalysisSnapshot()

  return ok(payload, {
    startedAt,
    provider: payload.provider || runtime.ai.provider,
    model: payload.model || runtime.ai.model,
    fallbackUsed: payload.fallbackUsed,
    attempts: payload.attempts || 1,
  })
})
