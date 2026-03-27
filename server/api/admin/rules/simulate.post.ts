import type { EngineContext } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { buildContestRuleContext, simulateRuleVersion } from '~~/server/utils/rule-store'

interface SimulateBody {
  versionId?: string
  contestId?: string
  context?: EngineContext
  now?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<SimulateBody>(event).catch(() => ({} as SimulateBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权执行规则模拟。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40433)
  }

  const contestId = String(body.contestId || '').trim()
  const context = body.context && typeof body.context === 'object'
    ? body.context as EngineContext
    : null
  if (!contestId && !context) {
    setResponseStatus(event, 400)
    return fail('contestId 或 context 至少提供一项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40127)
  }

  try {
    const simulation = await withClient(event, async (db) => {
      const resolvedContext = context || await buildContestRuleContext(db, contestId)
      return simulateRuleVersion(db, {
        versionId: String(body.versionId || '').trim() || undefined,
        context: resolvedContext,
        now: String(body.now || '').trim() || undefined,
        fallbackPublished: true,
      })
    })
    return ok(simulation, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '规则模拟失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50127)
  }
})
