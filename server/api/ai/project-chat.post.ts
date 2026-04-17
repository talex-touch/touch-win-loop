import type { AiProjectChatRequest, AiProjectChatResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { runProjectChatChain } from '~~/server/services/ai/project-chat-chain'
import { buildProjectKnowledgeLocalContext } from '~~/server/services/ai/project-knowledge-context'
import { loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
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
import { buildMergedPrompt, resolveAiRuntimeForChannel, runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { runWithRetry } from '~~/server/utils/retry'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

function buildSessionTitle(contestName: string, trackName: string): string {
  const left = contestName.trim()
  const right = trackName.trim()
  if (left && right)
    return `Loopy 对话 · ${left} · ${right}`
  if (left)
    return `Loopy 对话 · ${left}`
  if (right)
    return `Loopy 对话 · ${right}`
  return 'Loopy 对话'
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

  if (!isAiRuntimeConfigured(channelAiConfig)) {
    setResponseStatus(event, 503)
    return fail(buildAiNotConfiguredMessage('项目对话 AI'), {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50371)
  }

  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  let contextBundle: {
    detail: Awaited<ReturnType<typeof getContestDetail>> | null
    injectedPrompt: string
    localContext: string
    knowledge: Awaited<ReturnType<typeof buildProjectKnowledgeLocalContext>>
  }
  const latestUserMessage = [...safeRequest.messages]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?.trim() || ''

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
      const knowledgeContext = await buildProjectKnowledgeLocalContext(db, {
        projectId: safeRequest.context.projectId || '',
        query: latestUserMessage,
        resources,
        contestName,
        trackName,
        major: safeRequest.context.major,
        limit: 6,
        event,
      })

      return {
        detail,
        injectedPrompt,
        localContext: knowledgeContext.summaryText,
        knowledge: {
          citations: knowledgeContext.citations,
          warning: knowledgeContext.warning,
          usedFallback: knowledgeContext.usedFallback,
        },
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
  const scopeProjectId = String(safeRequest.context.projectId || '').trim()
  const scopeMode = 'dialog_ask' as const

  const activeSession = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    if (safeRequest.sessionId) {
      const existing = await getAiChatSessionById(db, {
        workspaceId,
        sessionId: safeRequest.sessionId,
        projectId: scopeProjectId,
        mode: scopeMode,
        strictScope: Boolean(scopeProjectId),
      })
      if (!existing)
        throw new Error('SESSION_NOT_FOUND')

      await patchAiChatSessionContext(db, {
        workspaceId,
        sessionId: safeRequest.sessionId,
        projectId: scopeProjectId,
        mode: scopeMode,
        contestId: safeRequest.context.contestId,
        trackId: safeRequest.context.trackId,
        major: safeRequest.context.major,
      })
      return existing
    }

    const created = await createAiChatSession(db, {
      workspaceId,
      projectId: scopeProjectId,
      mode: scopeMode,
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
      const canUseWorkspace = await teamHasWorkspaceMembership(db, user, workspaceId)
      if (!canUseWorkspace)
        throw new Error('FORBIDDEN')

      return teamConsumeAiQuota(db, {
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

  let execution: Awaited<ReturnType<typeof runWithPlatformAiChannelFallback<{
    data: AiProjectChatResult
    fallbackUsed: boolean
    attempts: number
  }>>>

  try {
    execution = await runWithPlatformAiChannelFallback(runtime, 'project_chat', async ({ ai, prompt }) => {
      const nextAiConfig = {
        ...ai,
        temperature: effectiveAiSettings.temperature,
      }
      return runWithRetry({
        maxRetries: nextAiConfig.maxRetries,
        run: () => runProjectChatChain({
          request: safeRequest,
          ai: nextAiConfig,
          contestName: contest?.name,
          trackName: track?.name,
          injectedPrompt: buildMergedPrompt(prompt, contextBundle.injectedPrompt),
          localContext: contextBundle.localContext,
        }),
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 502)
    return fail(error instanceof Error ? error.message || '项目对话 AI 调用失败。' : '项目对话 AI 调用失败。', {
      startedAt,
      provider: effectiveAiConfig.provider,
      model: effectiveAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50271)
  }

  await withTransaction(event, async (db) => {
    const modeMetadata = {
      mode: scopeMode,
      sourceMode: 'project_chat',
      projectId: scopeProjectId,
    }

    if (latestUserMessage) {
      await appendAiChatMessage(db, {
        workspaceId,
        sessionId: activeSession.id,
        role: 'user',
        content: latestUserMessage,
        provider: execution.ai.provider,
        model: execution.ai.model,
        fallbackUsed: false,
        metadata: {
          ...modeMetadata,
          channelKey: execution.channel.key,
          providerId: execution.provider?.id || null,
        },
        createdByUserId: user.id,
      })
    }

    await appendAiChatMessage(db, {
      workspaceId,
      sessionId: activeSession.id,
      role: 'assistant',
      content: execution.data.data.assistantReply,
      provider: execution.ai.provider,
      model: execution.ai.model,
      fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
      metadata: {
        ...modeMetadata,
        channelKey: execution.channel.key,
        providerId: execution.provider?.id || null,
        attemptChain: execution.attemptChain,
        latencyMs: execution.latencyMs,
        knowledge: execution.data.data.knowledge || contextBundle.knowledge,
      },
      createdByUserId: user.id,
    })

    await patchAiChatSessionContext(db, {
      workspaceId,
      sessionId: activeSession.id,
      projectId: scopeProjectId,
      mode: scopeMode,
      contestId: safeRequest.context.contestId,
      trackId: safeRequest.context.trackId,
      major: safeRequest.context.major,
      title: execution.data.data.projectDraft.title,
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
        channelKey: execution.channel.key,
        providerId: execution.provider?.id || null,
        fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
        attempts: execution.attemptChain.length,
        attemptChain: execution.attemptChain,
        latencyMs: execution.latencyMs,
      },
    })
  })

  execution.data.data.sessionId = activeSession.id
  execution.data.data.knowledge = execution.data.data.knowledge || contextBundle.knowledge

  return ok(execution.data.data, {
    startedAt,
    provider: execution.ai.provider,
    model: execution.ai.model,
    fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
    attempts: execution.attemptChain.length,
  }, 'ok')
})
