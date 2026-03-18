import type { AiProjectChatRequest } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { findContestById, findTrackById } from '~~/server/data/catalog'
import { runProjectChatFallback } from '~~/server/services/ai/fallback'
import { runProjectChatChain } from '~~/server/services/ai/project-chat-chain'
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
  const request = await readBody<AiProjectChatRequest>(event)
  const workspaceId = String(request?.workspaceId || request?.context?.workspaceId || '').trim()

  const safeRequest: AiProjectChatRequest = {
    workspaceId,
    messages: Array.isArray(request?.messages) ? request.messages : [],
    context: {
      workspaceId,
      contestId: request?.context?.contestId || '',
      trackId: request?.context?.trackId || '',
      major: request?.context?.major || '',
    },
  }

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用 AI 聊天时必须传 workspaceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40071)
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
        route: '/api/ai/project-chat',
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
      }, 40371)
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
    }, 42971)
  }

  const contest = safeRequest.context.contestId ? findContestById(safeRequest.context.contestId) : undefined
  const track = safeRequest.context.contestId && safeRequest.context.trackId
    ? findTrackById(safeRequest.context.contestId, safeRequest.context.trackId)
    : undefined

  const onlyFallback = runtime.ai.provider === 'mock' || !runtime.ai.apiKey
  if (onlyFallback) {
    const data = runProjectChatFallback(safeRequest)
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
    run: () => runProjectChatChain({
      request: safeRequest,
      ai: runtime.ai,
      contestName: contest?.name,
      trackName: track?.name,
    }),
    fallback: () => runProjectChatFallback(safeRequest),
  })

  return ok(result.data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }, result.fallbackUsed ? 'fallback used' : 'ok')
})
