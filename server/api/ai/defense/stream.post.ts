import type {
  AiDefenseInputMode,
  AiDefenseRequest,
  AiDefenseResult,
  AiDefenseStage,
  AiDefenseStreamEvent,
  AiDefenseStreamEventType,
} from '~~/shared/types/domain'
import { createEventStream, setResponseStatus } from 'h3'
import { buildDefenseContextPack } from '~~/server/services/ai/defense-context'
import { runDefenseChain } from '~~/server/services/ai/defense-chain'
import { runDefenseFallback } from '~~/server/services/ai/fallback'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  appendAiChatMessage,
  createAiChatSession,
  getAiChatSessionById,
  patchAiChatSessionContext,
} from '~~/server/utils/chat-store'
import {
  createProjectDefenseTurns,
  getProjectDefenseSessionState,
  upsertProjectDefenseSessionState,
} from '~~/server/utils/project-defense-store'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
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

function normalizeStage(value: unknown): AiDefenseStage | undefined {
  const normalized = toText(value)
  if (normalized === 'opening' || normalized === 'qa' || normalized === 'rebuttal' || normalized === 'closing')
    return normalized
  return undefined
}

function normalizeInputMode(value: unknown): AiDefenseInputMode | undefined {
  const normalized = toText(value)
  if (normalized === 'text' || normalized === 'audio' || normalized === 'image' || normalized === 'video_frames' || normalized === 'mixed')
    return normalized
  return undefined
}

function normalizeRequest(body: Partial<AiDefenseRequest> | null | undefined, workspaceId: string): AiDefenseRequest {
  const personaIds = Array.isArray(body?.personaIds)
    ? body.personaIds.map(item => toText(item)).filter(Boolean)
    : undefined
  return {
    teamId: workspaceId,
    workspaceId,
    sessionId: toText(body?.sessionId),
    clientTurnId: toText(body?.clientTurnId) || undefined,
    meetingId: toText(body?.meetingId) || undefined,
    personaIds,
    stageHint: normalizeStage(body?.stageHint),
    inputMode: normalizeInputMode(body?.inputMode) || 'text',
    attachments: Array.isArray(body?.attachments) ? body.attachments : [],
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

function deriveStageFromTurnCount(turnCount: number): AiDefenseStage {
  if (turnCount <= 0)
    return 'opening'
  if (turnCount <= 2)
    return 'qa'
  if (turnCount <= 4)
    return 'rebuttal'
  return 'closing'
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
  const scopeProjectId = toText(request.context.projectId)
  const scopeMode = 'defense' as const
  const latestUserMessage = [...request.messages]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?.trim() || ''

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
        title: buildSessionTitle('', ''),
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
      existingState: await getProjectDefenseSessionState(db, {
        sessionId: session.id,
      }),
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

  let contextPack
  try {
    contextPack = await withClient(event, async (db) => {
      return buildDefenseContextPack({
        db,
        user,
        workspaceId,
        projectId: scopeProjectId,
        contestId: request.context.contestId,
        trackId: request.context.trackId,
        major: request.context.major,
        latestUserMessage,
        personaIds: request.personaIds,
        attachments: request.attachments,
        includeInternal,
      })
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

  const stage = request.stageHint
    || prepared.existingState?.currentStage
    || deriveStageFromTurnCount(prepared.existingState?.turnCount || 0)
  const turnIndex = Math.max(1, (prepared.existingState?.turnCount || 0) + 1)

  await withTransaction(event, async (db) => {
    await patchAiChatSessionContext(db, {
      workspaceId,
      sessionId: prepared.sessionId,
      projectId: scopeProjectId,
      mode: scopeMode,
      contestId: request.context.contestId,
      trackId: request.context.trackId,
      major: request.context.major,
      title: buildSessionTitle(contextPack.contestName, contextPack.trackName),
    })
  })

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
        message: '已建立答辩会话，正在组织评委团与证据包...',
        sessionId: prepared.sessionId,
      })
      await pushEvent('stage', {
        stage,
        turnIndex,
      })

      if (contextPack.evidenceRefs.length > 0) {
        await pushEvent('evidence', {
          evidenceRefs: contextPack.evidenceRefs,
        })
      }

      const effectiveAiConfig = {
        ...channelAiConfig,
        temperature: Number.isFinite(Number(request.aiOptions?.temperature))
          ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
          : channelAiConfig.temperature,
      }
      const mergedInjectedPrompt = buildMergedPrompt(channelRuntime.prompt, contextPack.promptText)
      const effectiveRequest: AiDefenseRequest = {
        ...request,
        stageHint: stage,
      }

      const onlyFallback = effectiveAiConfig.provider === 'mock' || !effectiveAiConfig.apiKey
      const execution = onlyFallback
        ? {
            data: runDefenseFallback(effectiveRequest),
            fallbackUsed: true,
            attempts: 1,
          }
        : await runWithRetry<AiDefenseResult>({
            maxRetries: effectiveAiConfig.maxRetries,
            run: () => runDefenseChain({
              request: effectiveRequest,
              ai: effectiveAiConfig,
              contestName: contextPack.contestName,
              trackName: contextPack.trackName,
              injectedPrompt: mergedInjectedPrompt,
              rubricDigest: contextPack.rubricDigest,
              promptContextText: contextPack.promptContextText,
              evidenceRefs: contextPack.evidenceRefs,
              personas: contextPack.personas,
              stage,
              turnIndex,
            }),
            fallback: () => runDefenseFallback(effectiveRequest),
          })

      const result: AiDefenseResult = {
        ...execution.data,
        sessionId: prepared.sessionId,
        stage,
        turnIndex,
        summaryStatus: 'queued',
        selectedPersonaIds: execution.data.selectedPersonaIds || contextPack.personas.map(item => item.id),
      }

      for (const round of result.rounds)
        await pushEvent('judge', { round })

      await pushEvent('score', {
        scorecard: result.scorecard,
      })

      for (const chunk of chunkText(result.assistantReply))
        await pushEvent('delta', { text: chunk })

      await withTransaction(event, async (db) => {
        const modeMetadata = {
          mode: scopeMode,
          projectId: scopeProjectId,
          stage,
          turnIndex,
          inputMode: request.inputMode || 'text',
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
              attachments: request.attachments || [],
              clientTurnId: request.clientTurnId || null,
              meetingId: request.meetingId || null,
            },
            createdByUserId: user.id,
          })
        }

        await appendAiChatMessage(db, {
          workspaceId,
          sessionId: prepared.sessionId,
          role: 'assistant',
          content: result.assistantReply,
          provider: effectiveAiConfig.provider,
          model: effectiveAiConfig.model,
          fallbackUsed: execution.fallbackUsed,
          metadata: {
            ...modeMetadata,
            channelKey: channelRuntime.key,
            providerId: channelRuntime.provider?.id || null,
            scorecard: result.scorecard,
            evidenceRefs: result.evidenceRefs || [],
          },
          createdByUserId: user.id,
        })

        if (scopeProjectId) {
          await createProjectDefenseTurns(db, {
            sessionId: prepared.sessionId,
            projectId: scopeProjectId,
            stage,
            turnIndex,
            turns: result.rounds.map(round => ({
              personaId: round.personaId || null,
              judgeType: round.judgeType,
              judgeName: round.judge,
              question: round.question,
              comment: round.comment,
              followUp: round.followUp,
              score: round.score,
              evidenceRefs: round.evidenceRefs,
              attachments: request.attachments || [],
              metadata: {
                inputMode: request.inputMode || 'text',
                meetingId: request.meetingId || null,
                clientTurnId: request.clientTurnId || null,
              },
            })),
          })

          await upsertProjectDefenseSessionState(db, {
            sessionId: prepared.sessionId,
            projectId: scopeProjectId,
            workspaceId,
            currentStage: result.nextStage || stage,
            turnCount: turnIndex,
            selectedPersonaIds: result.selectedPersonaIds || [],
            summaryStatus: 'queued',
            summaryResourceId: prepared.existingState?.summaryResourceId || null,
            linkedMeetingId: request.meetingId || prepared.existingState?.linkedMeetingId || null,
            lastInputMode: request.inputMode || 'text',
            lastContextPack: {
              contestName: contextPack.contestName,
              trackName: contextPack.trackName,
              rubricDigest: contextPack.rubricDigest,
              evidenceRefs: contextPack.evidenceRefs.slice(0, 8),
            },
            lastScorecard: result.scorecard,
          })
        }

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
            stage,
            turnIndex,
          },
        })
      })

      await pushEvent('summary', {
        status: 'queued',
        sessionId: prepared.sessionId,
      })
      await pushEvent('done', {
        result,
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
