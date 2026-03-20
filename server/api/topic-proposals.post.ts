import type { TopicProposal } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { runTopicProposalFallback } from '~~/server/services/ai/fallback'
import { runTopicProposalChain } from '~~/server/services/ai/topic-proposal-chain'
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
  const body = await readBody<{ contestId?: string, trackId?: string, major?: string }>(event)
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
      target: 'topic_proposal',
    })
    return { detail, injectedPrompt }
  })
  const contest = bundle.detail?.contest
  const track = contest?.tracks.find(item => item.id === body.trackId)

  if (!contest || !track) {
    setResponseStatus(event, 400)
    return fail('contestId 或 trackId 无效', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40001)
  }

  const onlyFallback = runtime.ai.provider === 'mock' || !runtime.ai.apiKey
  if (onlyFallback) {
    const data = runTopicProposalFallback({
      contest,
      track,
      major: body.major,
    })
    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'ai.invoke.topic_proposals',
        contestId: contest.id,
        payload: {
          trackId: track.id,
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

  const result = await runWithRetry<TopicProposal>({
    maxRetries: runtime.ai.maxRetries,
    run: () => runTopicProposalChain({
      contest,
      track,
      major: body.major,
      ai: runtime.ai,
      injectedPrompt: bundle.injectedPrompt,
    }),
    fallback: () => runTopicProposalFallback({
      contest,
      track,
      major: body.major,
    }),
  })

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'ai.invoke.topic_proposals',
      contestId: contest.id,
      payload: {
        trackId: track.id,
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
