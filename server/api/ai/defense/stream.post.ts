import type {
  AiChatSession,
  AiDefenseInputMode,
  AiDefenseRequest,
  AiDefenseResult,
  AiDefenseStage,
  AiDefenseStreamEvent,
  AiDefenseStreamEventType,
} from '~~/shared/types/domain'
import { createEventStream, setResponseStatus } from 'h3'
import { runDefenseChain } from '~~/server/services/ai/defense-chain'
import { buildDefenseContextPack } from '~~/server/services/ai/defense-context'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordBillingUsageEventSafely } from '~~/server/utils/billing-usage-tracker'
import {
  appendAiChatMessage,
  createAiChatSession,
  getAiChatSessionById,
  patchAiChatSessionContext,
} from '~~/server/utils/chat-store'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { buildMergedPrompt, resolveAiRuntimeForChannel, runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import {
  createProjectDefenseTurns,
  getProjectDefenseSessionState,
  upsertProjectDefenseSessionState,
} from '~~/server/utils/project-defense-store'
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
    messages: Array.isArray(body?.messages) ? body.messages : [],
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

interface DefensePreparedFailureState {
  sessionId: string
  shouldRecordStart: boolean
  createdNewSession: boolean
}

type DefensePreparedResult
  = {
    kind: 'success'
    sessionId: string
    remainingQuota: number | null
    shouldRecordStart: boolean
    createdNewSession: boolean
    existingState: Awaited<ReturnType<typeof getProjectDefenseSessionState>>
  }
  | {
    kind: 'forbidden'
  }
  | {
    kind: 'session_not_found'
  }
  | {
    kind: 'quota_exceeded'
    failureState: DefensePreparedFailureState | null
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

  if (!isAiRuntimeConfigured(channelAiConfig)) {
    setResponseStatus(event, 503)
    return fail(buildAiNotConfiguredMessage('答辩模拟 AI'), {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50374)
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

  const contextPack = await withClient(event, async (db) => {
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
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return null
    }
    throw error
  })

  if (!contextPack) {
    return fail('project not found', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40478)
  }

  const recordDefenseUsage = async (
    result: 'success' | 'failed',
    meta?: Record<string, unknown>,
  ): Promise<void> => {
    await withClient(event, async (db) => {
      await recordBillingUsageEventSafely(db, {
        workspaceId,
        projectId: scopeProjectId || null,
        contestId: request.context.contestId || null,
        trackId: request.context.trackId || null,
        actorUserId: user.id,
        eventCode: 'ai.defense.start',
        result,
        sourceRoute: '/api/ai/defense/stream',
        meta: {
          sessionId: toText(meta?.sessionId) || null,
          fallbackUsed: Boolean(meta?.fallbackUsed),
          attempts: Number(meta?.attempts || 1),
          channelKey: channelRuntime.key,
          isNewSession: Boolean(meta?.isNewSession),
          ...meta,
        },
      })
    }).catch(() => undefined)
  }

  let preparedForFailure: DefensePreparedFailureState | null = null

  const prepared: DefensePreparedResult = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    let existingSession: AiChatSession | null = null
    let createdNewSession = false
    let existingMessageCount = 0

    if (request.sessionId) {
      existingSession = await getAiChatSessionById(db, {
        workspaceId,
        sessionId: request.sessionId,
        projectId: scopeProjectId,
        mode: scopeMode,
        strictScope: Boolean(scopeProjectId),
      })
      if (!existingSession)
        throw new Error('SESSION_NOT_FOUND')
      existingMessageCount = existingSession.messageCount || 0
    }
    else {
      existingSession = await createAiChatSession(db, {
        workspaceId,
        projectId: scopeProjectId,
        mode: scopeMode,
        createdByUserId: user.id,
        title: buildSessionTitle(contextPack.contestName, contextPack.trackName),
        contestId: request.context.contestId,
        trackId: request.context.trackId,
        major: request.context.major,
      })
      createdNewSession = true
    }

    if (!existingSession)
      throw new Error('SESSION_NOT_FOUND')

    const shouldRecordStart = createdNewSession || existingMessageCount === 0

    await patchAiChatSessionContext(db, {
      workspaceId,
      sessionId: existingSession.id,
      projectId: scopeProjectId,
      mode: scopeMode,
      contestId: request.context.contestId,
      trackId: request.context.trackId,
      major: request.context.major,
      title: buildSessionTitle(contextPack.contestName, contextPack.trackName),
    })

    preparedForFailure = {
      sessionId: existingSession.id,
      shouldRecordStart,
      createdNewSession,
    }

    const quota = await teamConsumeAiQuota(db, {
      workspaceId,
      userId: user.id,
      route: '/api/ai/defense/stream',
      units: 1,
    })
    if (!quota.allowed)
      throw new Error('QUOTA_EXCEEDED')

    return {
      kind: 'success' as const,
      sessionId: existingSession.id,
      remainingQuota: quota.remaining,
      shouldRecordStart,
      createdNewSession,
      existingState: await getProjectDefenseSessionState(db, {
        sessionId: existingSession.id,
      }),
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return { kind: 'forbidden' as const }
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return { kind: 'session_not_found' as const }
    }
    if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return {
        kind: 'quota_exceeded' as const,
        failureState: preparedForFailure,
      }
    }
    throw error
  })

  if (prepared.kind === 'forbidden') {
    return fail('当前用户无权使用该空间。', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40375)
  }
  if (prepared.kind === 'session_not_found') {
    return fail('会话不存在，请刷新后重试。', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40475)
  }
  if (prepared.kind === 'quota_exceeded') {
    const failureState = prepared.failureState
    if (failureState?.shouldRecordStart) {
      await recordDefenseUsage('failed', {
        sessionId: failureState.sessionId,
        isNewSession: failureState.createdNewSession,
        isFirstSessionMessage: true,
        reason: 'QUOTA_EXCEEDED',
      })
    }
    return fail('Team AI 配额不足，请扩容或等待重置。', {
      startedAt,
      provider: channelAiConfig.provider,
      model: channelAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42975)
  }

  const stage = request.stageHint
    || prepared.existingState?.currentStage
    || deriveStageFromTurnCount(prepared.existingState?.turnCount || 0)
  const turnIndex = Math.max(1, (prepared.existingState?.turnCount || 0) + 1)

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
    let usageRecorded = !prepared.shouldRecordStart

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

      const effectiveRequest: AiDefenseRequest = {
        ...request,
        stageHint: stage,
      }

      const execution = await runWithPlatformAiChannelFallback(runtime, 'defense', async ({ ai, prompt }) => {
        const nextAiConfig = {
          ...ai,
          temperature: Number.isFinite(Number(request.aiOptions?.temperature))
            ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
            : ai.temperature,
        }

        return runWithRetry<AiDefenseResult>({
          maxRetries: nextAiConfig.maxRetries,
          run: () => runDefenseChain({
            request: effectiveRequest,
            ai: nextAiConfig,
            contestName: contextPack.contestName,
            trackName: contextPack.trackName,
            injectedPrompt: buildMergedPrompt(prompt, contextPack.promptText),
            rubricDigest: contextPack.rubricDigest,
            promptContextText: contextPack.promptContextText,
            evidenceRefs: contextPack.evidenceRefs,
            personas: contextPack.personas,
            stage,
            turnIndex,
          }),
        })
      })

      const result: AiDefenseResult = {
        ...execution.data.data,
        sessionId: prepared.sessionId,
        stage,
        turnIndex,
        summaryStatus: 'queued',
        selectedPersonaIds: execution.data.data.selectedPersonaIds || contextPack.personas.map(item => item.id),
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
            provider: execution.ai.provider,
            model: execution.ai.model,
            fallbackUsed: false,
            metadata: {
              ...modeMetadata,
              channelKey: execution.channel.key,
              providerId: execution.provider?.id || null,
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
          provider: execution.ai.provider,
          model: execution.ai.model,
          fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
          metadata: {
            ...modeMetadata,
            channelKey: execution.channel.key,
            providerId: execution.provider?.id || null,
            attemptChain: execution.attemptChain,
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
            channelKey: execution.channel.key,
            providerId: execution.provider?.id || null,
            fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
            attempts: execution.attemptChain.length,
            attemptChain: execution.attemptChain,
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

      if (prepared.shouldRecordStart) {
        await recordDefenseUsage('success', {
          sessionId: prepared.sessionId,
          fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
          attempts: execution.attemptChain.length,
          isNewSession: prepared.createdNewSession,
          isFirstSessionMessage: true,
        })
        usageRecorded = true
      }

      await pushEvent('done', {
        result,
        meta: {
          attempts: execution.attemptChain.length,
          fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
          latencyMs: Date.now() - startedAt,
        },
      })
    }
    catch (error) {
      if (!usageRecorded && prepared.shouldRecordStart) {
        await recordDefenseUsage('failed', {
          sessionId: prepared.sessionId,
          isNewSession: prepared.createdNewSession,
          isFirstSessionMessage: true,
          reason: 'CHAIN_EXECUTION_FAILED',
          error: toErrorMessage(error),
        })
      }

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
