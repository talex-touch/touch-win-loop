import type { ReleaseScopeKind } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { claimRandomPendingSecondReviewRelease } from '~~/server/utils/release-store'

function normalizeScopeKind(raw: unknown): ReleaseScopeKind | undefined {
  const value = String(raw || '').trim()
  if (value === 'contest' || value === 'policy_library')
    return value
  return undefined
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权领取二审任务。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40376)
  }

  const body = await readBody<{ scopeKind?: ReleaseScopeKind }>(event).catch((): { scopeKind?: ReleaseScopeKind } => ({}))
  const scopeKind = normalizeScopeKind(body?.scopeKind)

  const version = await withTransaction(event, async (db) => {
    return claimRandomPendingSecondReviewRelease(db, {
      actorUserId: user.id,
      scopeKind,
    })
  })

  if (!version) {
    setResponseStatus(event, 404)
    return fail('当前没有可领取的二审任务。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40475)
  }

  return ok(version, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
