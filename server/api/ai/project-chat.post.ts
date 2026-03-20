import type { AiProjectChatRequest, AiProjectChatResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { runProjectChatFallback } from '~~/server/services/ai/fallback'
import { runProjectChatChain } from '~~/server/services/ai/project-chat-chain'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  appendAiChatMessage,
  createAiChatSession,
  getAiChatSessionById,
  patchAiChatSessionContext,
} from '~~/server/utils/chat-store'
import { getContestDetail, recordContestAuditLog, resolveAiPromptText } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { consumeAiQuota, hasWorkspaceMembership } from '~~/server/utils/platform-store'
import { runWithRetry } from '~~/server/utils/retry'

function buildSessionTitle(contestName: string, trackName: string): string {
  const left = contestName.trim()
  const right = trackName.trim()
  if (left && right)
    return `${left} · ${right}`
  if (left)
    return left
  if (right)
    return right
  return 'AI 对话'
}

function normalizeTemperature(raw: unknown, fallback: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.max(0, Math.min(1, parsed))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = await readBody<AiProjectChatRequest>(event)
  const workspaceId = String(request?.workspaceId || request?.context?.workspaceId || '').trim()
  const sessionId = String(request?.sessionId || '').trim()

  const safeRequest: AiProjectChatRequest = {
    workspaceId,
    sessionId,
    messages: Array.isArray(request?.messages) ? request.messages : [],
    aiOptions: {
      reasoningEnabled: typeof request?.aiOptions?.reasoningEnabled === 'boolean' ? request.aiOptions.reasoningEnabled : undefined,
      networkEnabled: typeof request?.aiOptions?.networkEnabled === 'boolean' ? request.aiOptions.networkEnabled : undefined,
      temperature: Number.isFinite(Number(request?.aiOptions?.temperature)) ? Number(request?.aiOptions?.temperature) : undefined,
    },
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

  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  const contextBundle = safeRequest.context.contestId
    ? await withClient(event, async (db) => {
        const detail = await getContestDetail(db, {
          contestId: safeRequest.context.contestId || '',
          includeInternal,
        })
        const injectedPrompt = await resolveAiPromptText(db, {
          contestId: safeRequest.context.contestId,
          trackId: safeRequest.context.trackId,
          target: 'project_chat',
        })
        return {
          detail,
          injectedPrompt,
        }
      })
    : { detail: null, injectedPrompt: '' }

  const contest = contextBundle.detail?.contest
  const track = contest?.tracks.find(item => item.id === safeRequest.context.trackId)
  const effectiveAiSettings = {
    reasoningEnabled: Boolean(safeRequest.aiOptions?.reasoningEnabled),
    networkEnabled: Boolean(safeRequest.aiOptions?.networkEnabled),
    temperature: normalizeTemperature(safeRequest.aiOptions?.temperature, runtime.ai.temperature),
  }
  const effectiveAiConfig = {
    ...runtime.ai,
    temperature: effectiveAiSettings.temperature,
  }

  const activeSession = await withTransaction(event, async (db) => {
    const canUseWorkspace = await hasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    if (safeRequest.sessionId) {
      const existing = await getAiChatSessionById(db, {
        workspaceId,
        sessionId: safeRequest.sessionId,
      })
      if (!existing)
        throw new Error('SESSION_NOT_FOUND')

      await patchAiChatSessionContext(db, {
        workspaceId,
        sessionId: safeRequest.sessionId,
        contestId: safeRequest.context.contestId,
        trackId: safeRequest.context.trackId,
        major: safeRequest.context.major,
      })
      return existing
    }

    const created = await createAiChatSession(db, {
      workspaceId,
      createdByUserId: user.id,
      title: buildSessionTitle(contest?.name || '', track?.name || ''),
      contestId: safeRequest.context.contestId,
      trackId: safeRequest.context.trackId,
      major: safeRequest.context.major,
    })
    return created
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return null
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return 'SESSION_NOT_FOUND'
    }
    throw error
  })

  if (!activeSession) {
    return fail('当前用户无权使用该空间。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40372)
  }

  if (activeSession === 'SESSION_NOT_FOUND') {
    return fail('会话不存在，请刷新后重试。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40472)
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

  const onlyFallback = effectiveAiConfig.provider === 'mock' || !effectiveAiConfig.apiKey
  let result: {
    data: AiProjectChatResult
    fallbackUsed: boolean
    attempts: number
  }

  if (onlyFallback) {
    result = {
      data: runProjectChatFallback(safeRequest),
      fallbackUsed: true,
      attempts: 1,
    }
  }
  else {
    result = await runWithRetry({
      maxRetries: runtime.ai.maxRetries,
      run: () => runProjectChatChain({
        request: safeRequest,
        ai: effectiveAiConfig,
        contestName: contest?.name,
        trackName: track?.name,
        injectedPrompt: contextBundle.injectedPrompt,
      }),
      fallback: () => runProjectChatFallback(safeRequest),
    })
  }

  const latestUserMessage = [...safeRequest.messages]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?.trim() || ''

  await withTransaction(event, async (db) => {
    if (latestUserMessage) {
      await appendAiChatMessage(db, {
        workspaceId,
        sessionId: activeSession.id,
        role: 'user',
        content: latestUserMessage,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        createdByUserId: user.id,
      })
    }

    await appendAiChatMessage(db, {
      workspaceId,
      sessionId: activeSession.id,
      role: 'assistant',
      content: result.data.assistantReply,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: result.fallbackUsed,
      createdByUserId: user.id,
    })

    await patchAiChatSessionContext(db, {
      workspaceId,
      sessionId: activeSession.id,
      contestId: safeRequest.context.contestId,
      trackId: safeRequest.context.trackId,
      major: safeRequest.context.major,
      title: result.data.projectDraft.title,
    })

    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'ai.invoke.project_chat',
      contestId: safeRequest.context.contestId,
      payload: {
        sessionId: activeSession.id,
        trackId: safeRequest.context.trackId,
        reasoningEnabled: effectiveAiSettings.reasoningEnabled,
        networkEnabled: effectiveAiSettings.networkEnabled,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      },
    })
  })

  result.data.sessionId = activeSession.id

  return ok(result.data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }, result.fallbackUsed ? 'fallback used' : 'ok')
})
