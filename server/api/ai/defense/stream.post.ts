import type {
  AiDefenseRequest,
  AiDefenseResult,
  AiDefenseStreamEvent,
  AiDefenseStreamEventType,
} from '~~/shared/types/domain'
import { createEventStream, setResponseStatus } from 'h3'
import { runDefenseChain } from '~~/server/services/ai/defense-chain'
import { runDefenseFallback } from '~~/server/services/ai/fallback'
import { buildProjectResourceLocalContext, loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { fail } from '~~/server/utils/api'
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
import { runWithRetry } from '~~/server/utils/retry'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRequest(body: Partial<AiDefenseRequest> | null | undefined, workspaceId: string): AiDefenseRequest {
  return {
    teamId: workspaceId,
    workspaceId,
    sessionId: toText(body?.sessionId),
    messages: Array.isArray(body?.messages) ? body!.messages! : [],
    aiOptions: {
      reasoningEnabled: typeof body?.aiOptions?.reasoningEnabled === 'boolean' ? body.aiOptions.reasoningEnabled : undefined,
      networkEnabled: typeof body?.aiOptions?.networkEnabled === 'boolean' ? body.aiOptions.networkEnabled : undefined,
      temperature: Number.isFinite(Number(body?.aiOptions?.temperature)) ? Number(body?.aiOptions?.temperature) : undefined,
    },
    context: {
      teamId: workspaceId,
      workspaceId,
      projectId: toText(body?.context?.projectId),
      contestId: toText(body?.context?.contestId),
      trackId: toText(body?.context?.trackId),
      major: toText(body?.context?.major),
    },
  }
}

function buildSessionTitle(contestName: string, trackName: string): string {
  const left = contestName.trim()
  const right = trackName.trim()
  if (left && right)
    return `答辩模拟 · ${left} · ${right}`
  if (left)
    return `答辩模拟 · ${left}`
  return '答辩模拟'
}

function chunkText(text: string, chunkSize = 28): string[] {
  const normalized = String(text || '')
  if (!normalized)
    return []
  const chunks: string[] = []
  for (let i = 0; i < normalized.length; i += chunkSize)
    chunks.push(normalized.slice(i, i + chunkSize))
  return chunks
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message || 'UNKNOWN_ERROR'
  return 'UNKNOWN_ERROR'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const channelRuntime = resolveAiRuntimeForChannel(runtime, 'defense')
  const channelAiConfig = channelRuntime.ai
  const { user } = await requireAuth(event)
  const rawBody = await readBody<Partial<AiDefenseRequest>>(event).catch(() => ({} as Partial<AiDefenseRequest>))
  const workspaceId = toText(rawBody?.teamId || rawBody?.workspaceId || rawBody?.context?.teamId || rawBody?.context?.workspaceId)
  const request = normalizeRequest(rawBody, workspaceId)

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用答辩模拟时必须传 teamId。', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40074)
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
      const detail = request.context.contestId
        ? await getContestDetail(db, {
            contestId: request.context.contestId || '',
            includeInternal,
          })
        : null
      const injectedPrompt = request.context.contestId
        ? await resolveAiPromptText(db, {
            contestId: request.context.contestId,
            trackId: request.context.trackId,
            target: 'defense',
          })
        : ''

      const resources = await loadVisibleProjectResourcesForAi(db, user, {
        workspaceId,
        projectId: request.context.projectId,
      })
      const contestName = detail?.contest?.name || ''
      const trackName = detail?.contest?.tracks.find(item => item.id === request.context.trackId)?.name || ''
      const localContext = buildProjectResourceLocalContext(resources, {
        contestName,
        trackName,
        major: request.context.major,
        limit: 8,
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
      }, 40478)
    }
    throw error
  }

  const contest = contextBundle.detail?.contest
  const track = contest?.tracks.find(item => item.id === request.context.trackId)
  const scopeProjectId = String(request.context.projectId || '').trim()
  const scopeMode = 'defense' as const

  const prepared = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    let session = request.sessionId
      ? await getAiChatSessionById(db, {
          workspaceId,
          sessionId: request.sessionId,
          projectId: scopeProjectId,
          mode: scopeMode,
          strictScope: Boolean(scopeProjectId),
        })
      : null

    if (!session) {
      session = await createAiChatSession(db, {
        workspaceId,
        projectId: scopeProjectId,
        mode: scopeMode,
        createdByUserId: user.id,
        title: buildSessionTitle(contest?.name || '', track?.name || ''),
        contestId: request.context.contestId,
        trackId: request.context.trackId,
        major: request.context.major,
      })
    }

    if (!session)
      throw new Error('SESSION_NOT_FOUND')

    await patchAiChatSessionContext(db, {
      workspaceId,
      sessionId: session.id,
      projectId: scopeProjectId,
      mode: scopeMode,
      contestId: request.context.contestId,
      trackId: request.context.trackId,
      major: request.context.major,
      title: buildSessionTitle(contest?.name || '', track?.name || ''),
    })

    const quota = await teamConsumeAiQuota(db, {
      workspaceId,
      userId: user.id,
      route: '/api/ai/defense/stream',
      units: 1,
    })
    if (!quota.allowed)
      throw new Error('QUOTA_EXCEEDED')

    return {
      sessionId: session.id,
      remainingQuota: quota.remaining,
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return null
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return 'SESSION_NOT_FOUND'
    }
    if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return 'QUOTA_EXCEEDED'
    }
    throw error
  })

  if (!prepared) {
    return fail('当前用户无权使用该空间。', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40375)
  }
  if (prepared === 'SESSION_NOT_FOUND') {
    return fail('会话不存在，请刷新后重试。', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40475)
  }
  if (prepared === 'QUOTA_EXCEEDED') {
    return fail('Team AI 额度不足，请扩容或等待重置。', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42975)
  }

  const stream = createEventStream(event)
  const pushEvent = async (eventType: AiDefenseStreamEventType, data: Record<string, unknown>) => {
    const payload: AiDefenseStreamEvent = {
      event: eventType,
      data,
    }
    await stream.push({
      event: eventType,
      data: JSON.stringify(payload),
    })
  }

  const run = async () => {
    try {
      await pushEvent('progress', {
        message: '已建立答辩会话，正在生成评委问题...',
        sessionId: prepared.sessionId,
      })

      const effectiveAiConfig = {
        ...channelAiConfig,
        temperature: Number.isFinite(Number(request.aiOptions?.temperature))
          ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
          : channelAiConfig.temperature,
      }
      const mergedInjectedPrompt = buildMergedPrompt(channelRuntime.prompt, contextBundle.injectedPrompt)

      const onlyFallback = effectiveAiConfig.provider === 'mock' || !effectiveAiConfig.apiKey
      const execution = onlyFallback
        ? {
            data: runDefenseFallback(request),
            fallbackUsed: true,
            attempts: 1,
          }
        : await runWithRetry<AiDefenseResult>({
            maxRetries: effectiveAiConfig.maxRetries,
            run: () => runDefenseChain({
              request,
              ai: effectiveAiConfig,
              contestName: contest?.name,
              trackName: track?.name,
              injectedPrompt: mergedInjectedPrompt,
              localContext: contextBundle.localContext,
            }),
            fallback: () => runDefenseFallback(request),
          })

      for (const round of execution.data.rounds)
        await pushEvent('judge', { round })

      await pushEvent('score', {
        scorecard: execution.data.scorecard,
      })

      for (const chunk of chunkText(execution.data.assistantReply))
        await pushEvent('delta', { text: chunk })

      const latestUserMessage = [...request.messages]
        .reverse()
        .find(message => message.role === 'user')
        ?.content
        ?.trim() || ''

      await withTransaction(event, async (db) => {
        const modeMetadata = {
          mode: scopeMode,
          projectId: scopeProjectId,
        }

        if (latestUserMessage) {
          await appendAiChatMessage(db, {
            workspaceId,
            sessionId: prepared.sessionId,
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
          sessionId: prepared.sessionId,
          role: 'assistant',
          content: execution.data.assistantReply,
          provider: effectiveAiConfig.provider,
          model: effectiveAiConfig.model,
          fallbackUsed: execution.fallbackUsed,
          metadata: {
            ...modeMetadata,
            channelKey: channelRuntime.key,
            providerId: channelRuntime.provider?.id || null,
          },
          createdByUserId: user.id,
        })

        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'ai.invoke.defense',
          contestId: request.context.contestId,
          payload: {
            route: '/api/ai/defense/stream',
            workspaceId,
            sessionId: prepared.sessionId,
            projectId: request.context.projectId,
            trackId: request.context.trackId,
            channelKey: channelRuntime.key,
            providerId: channelRuntime.provider?.id || null,
            fallbackUsed: execution.fallbackUsed,
            attempts: execution.attempts,
            latencyMs: Date.now() - startedAt,
            remainingQuota: prepared.remainingQuota,
          },
        })
      })

      await pushEvent('done', {
        result: {
          ...execution.data,
          sessionId: prepared.sessionId,
        },
        meta: {
          attempts: execution.attempts,
          fallbackUsed: execution.fallbackUsed,
          latencyMs: Date.now() - startedAt,
        },
      })
    }
    catch (error) {
      const message = toErrorMessage(error)
      await pushEvent('error', { message })
    }
    finally {
      await stream.close()
    }
  }

  void run()
  return stream.send()
})
