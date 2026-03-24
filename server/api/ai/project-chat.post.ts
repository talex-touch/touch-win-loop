import type { AiProjectChatRequest, AiProjectChatResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { runProjectChatFallback } from '~~/server/services/ai/fallback'
import { runProjectChatChain } from '~~/server/services/ai/project-chat-chain'
import { buildProjectResourceLocalContext, loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
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
import { buildMergedPrompt, resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
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
  const channelRuntime = resolveAiRuntimeForChannel(runtime, 'project_chat')
  const channelAiConfig = channelRuntime.ai
  const { user } = await requireAuth(event)
  const request = await readBody<AiProjectChatRequest>(event)
  const workspaceId = String(request?.teamId || request?.workspaceId || request?.context?.teamId || request?.context?.workspaceId || '').trim()
  const sessionId = String(request?.sessionId || '').trim()

  const safeRequest: AiProjectChatRequest = {
    teamId: workspaceId,
    workspaceId,
    sessionId,
    messages: Array.isArray(request?.messages) ? request.messages : [],
    aiOptions: {
      reasoningEnabled: typeof request?.aiOptions?.reasoningEnabled === 'boolean' ? request.aiOptions.reasoningEnabled : undefined,
      networkEnabled: typeof request?.aiOptions?.networkEnabled === 'boolean' ? request.aiOptions.networkEnabled : undefined,
      temperature: Number.isFinite(Number(request?.aiOptions?.temperature)) ? Number(request?.aiOptions?.temperature) : undefined,
    },
    context: {
      teamId: workspaceId,
      workspaceId,
      projectId: request?.context?.projectId || '',
      contestId: request?.context?.contestId || '',
      trackId: request?.context?.trackId || '',
      major: request?.context?.major || '',
    },
  }

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用 AI 聊天时必须传 teamId。', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40071)
  }

  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  let contextBundle: {
    detail: Awaited<ReturnType<typeof getContestDetail>> | null
    injectedPrompt: string
    localContext: string
  }

  try {
    contextBundle = await withClient(event, async (db) => {
      const detail = safeRequest.context.contestId
        ? await getContestDetail(db, {
            contestId: safeRequest.context.contestId || '',
            includeInternal,
          })
        : null

      const injectedPrompt = safeRequest.context.contestId
        ? await resolveAiPromptText(db, {
            contestId: safeRequest.context.contestId,
            trackId: safeRequest.context.trackId,
            target: 'project_chat',
          })
        : ''

      const resources = await loadVisibleProjectResourcesForAi(db, user, {
        workspaceId,
        projectId: safeRequest.context.projectId,
      })

      const contestName = detail?.contest?.name || ''
      const trackName = detail?.contest?.tracks.find(item => item.id === safeRequest.context.trackId)?.name || ''
      const localContext = buildProjectResourceLocalContext(resources, {
        contestName,
        trackName,
        major: safeRequest.context.major,
        limit: 10,
      })

      return {
        detail,
        injectedPrompt,
        localContext,
      }
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: channelAiConfig.provider,
        model: channelAiConfig.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40476)
    }
    throw error
  }

  const contest = contextBundle.detail?.contest
  const track = contest?.tracks.find(item => item.id === safeRequest.context.trackId)
  const effectiveAiSettings = {
    reasoningEnabled: Boolean(safeRequest.aiOptions?.reasoningEnabled),
    networkEnabled: Boolean(safeRequest.aiOptions?.networkEnabled),
    temperature: normalizeTemperature(safeRequest.aiOptions?.temperature, runtime.ai.temperature),
  }
  const effectiveAiConfig = {
    ...channelAiConfig,
    temperature: effectiveAiSettings.temperature,
  }
  const mergedInjectedPrompt = buildMergedPrompt(channelRuntime.prompt, contextBundle.injectedPrompt)

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
      provider: effectiveAiConfig.provider,
      model: effectiveAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40372)
  }

  if (activeSession === 'SESSION_NOT_FOUND') {
    return fail('会话不存在，请刷新后重试。', {
      startedAt,
      provider: effectiveAiConfig.provider,
      model: effectiveAiConfig.model,
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
        provider: effectiveAiConfig.provider,
        model: effectiveAiConfig.model,
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
      provider: effectiveAiConfig.provider,
      model: effectiveAiConfig.model,
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
      maxRetries: effectiveAiConfig.maxRetries,
      run: () => runProjectChatChain({
        request: safeRequest,
        ai: effectiveAiConfig,
        contestName: contest?.name,
        trackName: track?.name,
        injectedPrompt: mergedInjectedPrompt,
        localContext: contextBundle.localContext,
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
    const modeMetadata = {
      mode: 'project_chat',
    }

    if (latestUserMessage) {
      await appendAiChatMessage(db, {
        workspaceId,
        sessionId: activeSession.id,
        role: 'user',
        content: latestUserMessage,
        provider: effectiveAiConfig.provider,
        model: effectiveAiConfig.model,
        fallbackUsed: false,
        metadata: {
          ...modeMetadata,
          channelKey: channelRuntime.key,
          providerId: channelRuntime.provider?.id || null,
        },
        createdByUserId: user.id,
      })
    }

    await appendAiChatMessage(db, {
      workspaceId,
      sessionId: activeSession.id,
      role: 'assistant',
      content: result.data.assistantReply,
      provider: effectiveAiConfig.provider,
      model: effectiveAiConfig.model,
      fallbackUsed: result.fallbackUsed,
      metadata: {
        ...modeMetadata,
        channelKey: channelRuntime.key,
        providerId: channelRuntime.provider?.id || null,
      },
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
        projectId: safeRequest.context.projectId,
        trackId: safeRequest.context.trackId,
        reasoningEnabled: effectiveAiSettings.reasoningEnabled,
        networkEnabled: effectiveAiSettings.networkEnabled,
        channelKey: channelRuntime.key,
        providerId: channelRuntime.provider?.id || null,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      },
    })
  })

  result.data.sessionId = activeSession.id

  return ok(result.data, {
    startedAt,
    provider: effectiveAiConfig.provider,
    model: effectiveAiConfig.model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }, result.fallbackUsed ? 'fallback used' : 'ok')
})
