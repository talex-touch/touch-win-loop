import type { AiContestFilterRequest } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { runContestFilterChain } from '~~/server/services/ai/contest-filter-chain'
import { runContestFilterFallback } from '~~/server/services/ai/fallback'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { listContestLibrary, recordContestAuditLog, resolveAiPromptText } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { consumeAiQuota, hasWorkspaceMembership } from '~~/server/utils/platform-store'
import { runWithRetry } from '~~/server/utils/retry'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = await readBody<AiContestFilterRequest>(event)
  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )
  const workspaceId = String(request?.workspaceId || '').trim()
  const safeRequest: AiContestFilterRequest = {
    workspaceId,
    query: request?.query || '',
    major: request?.major || '',
    filters: request?.filters || {},
    topK: request?.topK || 6,
    contestId: request?.contestId || '',
    trackId: request?.trackId || '',
  }

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用 AI 筛选时必须传 workspaceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40061)
  }

  let quotaResult: { allowed: boolean, remaining: number | null }
  try {
    quotaResult = await withTransaction(event, async (db) => {
      const canUseWorkspace = await hasWorkspaceMembership(db, user, workspaceId)
      if (!canUseWorkspace)
        throw new Error('FORBIDDEN')

      return consumeAiQuota(db, {
        workspaceId,
        userId: user.id,
        route: '/api/ai/contest-filter',
        units: 1,
      })
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权使用该空间。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40361)
    }
    throw error
  }

  if (!quotaResult.allowed) {
    setResponseStatus(event, 429)
    return fail('Team AI 额度不足，请扩容或等待重置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42961)
  }

  const contests = await withClient(event, async (db) => {
    const result = await listContestLibrary(db, {
      includeInternal,
      q: '',
      discipline: '',
      level: '',
      major: '',
      trackType: '',
      keyword: [],
      deliverableType: '',
      timelineStatus: '',
      sort: 'composite',
      page: 1,
      pageSize: 1000,
    })
    return result.items
  })
  const injectedPrompt = await withClient(event, async (db) => {
    return resolveAiPromptText(db, {
      contestId: safeRequest.contestId,
      trackId: safeRequest.trackId,
      target: 'contest_filter',
    })
  })

  const onlyFallback = runtime.ai.provider === 'mock' || !runtime.ai.apiKey
  if (onlyFallback) {
    const data = runContestFilterFallback(safeRequest, contests)
    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'ai.invoke.contest_filter',
        contestId: safeRequest.contestId,
        payload: {
          trackId: safeRequest.trackId,
          workspaceId,
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

  const result = await runWithRetry({
    maxRetries: runtime.ai.maxRetries,
    run: () => runContestFilterChain({ request: safeRequest, contests, ai: runtime.ai, injectedPrompt }),
    fallback: () => runContestFilterFallback(safeRequest, contests),
  })

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'ai.invoke.contest_filter',
      contestId: safeRequest.contestId,
      payload: {
        trackId: safeRequest.trackId,
        workspaceId,
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
