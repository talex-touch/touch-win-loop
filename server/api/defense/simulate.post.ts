import type { DefenseSession } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { runDefenseChain } from '~~/server/services/ai/defense-chain'
import { runDefenseFallback } from '~~/server/services/ai/fallback'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getContestDetail, recordContestAuditLog, resolveAiPromptText } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { runWithRetry } from '~~/server/utils/retry'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<{ contestId?: string, trackId?: string, strictness?: 'normal' | 'strict', rounds?: number }>(event)
  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  const bundle = await withClient(event, async (db) => {
    const detail = await getContestDetail(db, {
      contestId: String(body.contestId || ''),
      includeInternal,
    })
    const injectedPrompt = await resolveAiPromptText(db, {
      contestId: String(body.contestId || ''),
      trackId: String(body.trackId || ''),
      target: 'defense',
    })
    return { detail, injectedPrompt }
  })

  const contest = bundle.detail?.contest
  const track = contest?.tracks.find(item => item.id === body.trackId)

  if (!contest || !track) {
    setResponseStatus(event, 400)
    return fail('contestId 或 trackId 无效', { startedAt, provider: runtime.ai.provider, model: runtime.ai.model, fallbackUsed: false, attempts: 1 }, 40003)
  }

  const strictness = body.strictness || 'normal'
  const rounds = Math.max(1, Math.min(5, body.rounds || 3))

  const onlyFallback = runtime.ai.provider === 'mock' || !runtime.ai.apiKey
  if (onlyFallback) {
    const data = runDefenseFallback({
      contest,
      track,
      strictness,
      rounds,
    })
    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'ai.invoke.defense_simulate',
        contestId: contest.id,
        payload: {
          trackId: track.id,
          strictness,
          rounds,
          fallbackUsed: true,
          attempts: 1,
        },
      })
    })
    return ok(data, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: true,
      attempts: 1,
    }, 'fallback used')
  }

  const result = await runWithRetry<DefenseSession>({
    maxRetries: runtime.ai.maxRetries,
    run: () => runDefenseChain({
      contest,
      track,
      strictness,
      rounds,
      ai: runtime.ai,
      injectedPrompt: bundle.injectedPrompt,
    }),
    fallback: () => runDefenseFallback({
      contest,
      track,
      strictness,
      rounds,
    }),
  })

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'ai.invoke.defense_simulate',
      contestId: contest.id,
      payload: {
        trackId: track.id,
        strictness,
        rounds,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      },
    })
  })

  return ok(result.data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }, result.fallbackUsed ? 'fallback used' : 'ok')
})
