import type { AiContestFilterRequest } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { listContests } from '~~/server/data/catalog'
import { runContestFilterChain } from '~~/server/services/ai/contest-filter-chain'
import { runContestFilterFallback } from '~~/server/services/ai/fallback'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { consumeAiQuota, hasWorkspaceMembership } from '~~/server/utils/platform-store'
import { runWithRetry } from '~~/server/utils/retry'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = await readBody<AiContestFilterRequest>(event)

  const contests = listContests()
  const workspaceId = String(request?.workspaceId || '').trim()
  const safeRequest: AiContestFilterRequest = {
    workspaceId,
    query: request?.query || '',
    major: request?.major || '',
    filters: request?.filters || {},
    topK: request?.topK || 6,
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

  const onlyFallback = runtime.ai.provider === 'mock' || !runtime.ai.apiKey
  if (onlyFallback) {
    const data = runContestFilterFallback(safeRequest, contests)
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
    run: () => runContestFilterChain({ request: safeRequest, contests, ai: runtime.ai }),
    fallback: () => runContestFilterFallback(safeRequest, contests),
  })

  return ok(result.data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }, result.fallbackUsed ? 'fallback used' : 'ok')
})
