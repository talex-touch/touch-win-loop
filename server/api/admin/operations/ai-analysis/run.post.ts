import { setResponseStatus } from 'h3'
import { runAdminOperationsAiAnalysis } from '~~/server/services/admin-operations-ai-analysis'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body: { force?: boolean } = await readBody<{ force?: boolean }>(event).catch(() => ({} as { force?: boolean }))

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权运行运营 AI 分析。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403422)
  }

  const payload = await withClient(event, async db => runAdminOperationsAiAnalysis({
    event,
    db,
    force: Boolean(body?.force),
  }))

  return ok(payload, {
    startedAt,
    provider: payload.provider || runtime.ai.provider,
    model: payload.model || runtime.ai.model,
    fallbackUsed: payload.fallbackUsed,
    attempts: payload.attempts || 1,
  }, payload.triggered ? 'analysis triggered' : 'cached analysis')
})
