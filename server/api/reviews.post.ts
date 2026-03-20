import type { ReviewReport } from '~~/shared/types/domain'
import { runReviewFallback } from '~~/server/services/ai/fallback'
import { runReviewChain } from '~~/server/services/ai/review-chain'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getContestDetail, getPublishedRubricByTrack, recordContestAuditLog, resolveAiPromptText } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { runWithRetry } from '~~/server/utils/retry'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<{ contestId?: string, trackId?: string, text?: string }>(event)
  const rawText = (body.text || '').trim()
  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  if (!body.contestId || !body.trackId)
    return fail('contestId 或 trackId 无效', { startedAt, provider: runtime.ai.provider, model: runtime.ai.model, fallbackUsed: false, attempts: 1 }, 40002)

  const reviewInput = await withClient(event, async (db) => {
    const detail = await getContestDetail(db, {
      contestId: body.contestId!,
      includeInternal,
    })
    const rubric = await getPublishedRubricByTrack(db, {
      contestId: body.contestId!,
      trackId: body.trackId!,
    })

    return {
      detail,
      rubric,
      injectedPrompt: await resolveAiPromptText(db, {
        contestId: body.contestId,
        trackId: body.trackId,
        target: 'review',
      }),
    }
  })

  if (!reviewInput.detail)
    return fail('contestId 或 trackId 无效', { startedAt, provider: runtime.ai.provider, model: runtime.ai.model, fallbackUsed: false, attempts: 1 }, 40002)
  const detail = reviewInput.detail

  const track = detail.contest.tracks.find(item => item.id === body.trackId)
  if (!track)
    return fail('contestId 或 trackId 无效', { startedAt, provider: runtime.ai.provider, model: runtime.ai.model, fallbackUsed: false, attempts: 1 }, 40002)

  if (!reviewInput.rubric)
    return fail('该赛道尚未配置已发布评分规则。', { startedAt, provider: runtime.ai.provider, model: runtime.ai.model, fallbackUsed: false, attempts: 1 }, 40003)

  const onlyFallback = runtime.ai.provider === 'mock' || !runtime.ai.apiKey
  if (onlyFallback) {
    const report = runReviewFallback({
      contestId: body.contestId,
      trackId: track.id,
      text: rawText,
      rubric: reviewInput.rubric,
    })

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'ai.invoke.reviews',
        contestId: body.contestId,
        payload: {
          trackId: body.trackId,
          fallbackUsed: true,
          attempts: 1,
        },
      })
    })

    return ok(report, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: true,
      attempts: 1,
    }, 'fallback used')
  }

  const result = await runWithRetry<ReviewReport>({
    maxRetries: runtime.ai.maxRetries,
    run: () => runReviewChain({
      contest: detail.contest,
      trackId: track.id,
      text: rawText,
      rubric: reviewInput.rubric!,
      ai: runtime.ai,
      injectedPrompt: reviewInput.injectedPrompt,
    }),
    fallback: () => runReviewFallback({
      contestId: body.contestId!,
      trackId: track.id,
      text: rawText,
      rubric: reviewInput.rubric!,
    }),
  })

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'ai.invoke.reviews',
      contestId: body.contestId,
      payload: {
        trackId: body.trackId,
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
