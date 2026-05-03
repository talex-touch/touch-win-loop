import type { DefenseRealtimeNormalizedEvent, DefenseRealtimeSessionMeta } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getAiChatSessionById } from '~~/server/utils/chat-store'
import { withTransaction } from '~~/server/utils/db'
import {
  buildDefenseRealtimeEventKey,
  mergeDefenseRealtimeSessionMeta,
  normalizeDefenseRealtimeProvider,
  resolveDefenseRealtimeStage,
} from '~~/server/utils/defense-realtime'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import {
  createProjectDefenseTurns,
  getProjectDefenseSessionState,
  upsertProjectDefenseSessionState,
} from '~~/server/utils/project-defense-store'
import {
  appendProjectMeetingUtterance,
  getProjectMeetingParticipantByIdentity,
  upsertProjectMeetingParticipant,
} from '~~/server/utils/project-meeting-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

interface DefenseRealtimeEventsBody {
  event?: DefenseRealtimeNormalizedEvent
  events?: DefenseRealtimeNormalizedEvent[]
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeEvents(body: DefenseRealtimeEventsBody): DefenseRealtimeNormalizedEvent[] {
  const events = Array.isArray(body.events) ? body.events : body.event ? [body.event] : []
  return events.filter(item => item && typeof item === 'object')
}

function resolveRealtimeBillingConfig(runtime: ReturnType<typeof readRuntimeSettings>, provider: ReturnType<typeof normalizeDefenseRealtimeProvider>) {
  const registry = resolvePlatformAiRegistry(runtime)
  const voiceProvider = registry.providers.find(item => item.enabled && (
    provider === 'coze'
      ? item.type === 'coze-voice'
      : item.type === 'dashscope-bailian' && (item.capability === 'realtime' || item.capability === 'voice')
  ))
  return voiceProvider?.voice?.billing || null
}

function resolveElapsedBillingMinutes(startedAt: unknown): number {
  const timestamp = Date.parse(normalizeString(startedAt))
  if (!Number.isFinite(timestamp))
    return 0
  return Math.max(0, Math.ceil((Date.now() - timestamp) / 60000))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { runtime: aiRuntime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const sessionId = normalizeString(getRouterParam(event, 'sessionId'))
  const body = await readBody<DefenseRealtimeEventsBody>(event).catch(() => ({} as DefenseRealtimeEventsBody))

  if (!projectId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 sessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40108)
  }

  const events = normalizeEvents(body)
  if (events.length === 0) {
    setResponseStatus(event, 400)
    return fail('缺少 realtime event。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40109)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      const session = await getAiChatSessionById(db, {
        workspaceId: access.workspaceId,
        sessionId,
        projectId,
        mode: 'defense',
        strictScope: true,
      })
      if (!session)
        throw new Error('NOT_FOUND')

      const currentState = await getProjectDefenseSessionState(db, { sessionId })
      if (!currentState)
        throw new Error('NOT_FOUND')

      const meetingId = normalizeString(currentState.linkedMeetingId)
      if (!meetingId)
        throw new Error('NOT_FOUND')

      let nextRealtime = mergeDefenseRealtimeSessionMeta(currentState.realtime, {
        linkedMeetingId: meetingId,
      })
      let nextStage = currentState.currentStage
      let nextTurnCount = currentState.turnCount
      const persistedUtterances: string[] = []
      const createdTurnIds: string[] = []

      for (const item of events) {
        const provider = normalizeDefenseRealtimeProvider(item.provider || nextRealtime.provider)
        nextRealtime = mergeDefenseRealtimeSessionMeta(nextRealtime, {
          provider,
          transport: item.transport || nextRealtime.transport,
          connectionState: item.connectionState || nextRealtime.connectionState,
          providerSessionId: normalizeString(item.providerSessionId) || nextRealtime.providerSessionId,
          conversationId: normalizeString(item.conversationId) || nextRealtime.conversationId,
          lastProviderEventAt: normalizeString(item.createdAt) || new Date().toISOString(),
          latestSpeakerId: normalizeString(item.speakerId) || nextRealtime.latestSpeakerId,
          latestSpeakerLabel: normalizeString(item.speakerLabel) || nextRealtime.latestSpeakerLabel,
          latestLatencyMs: Number.isFinite(Number(item.latencyMs)) ? Math.max(0, Number(item.latencyMs)) : nextRealtime.latestLatencyMs,
          audioEnabled: item.audioEnabled === undefined ? nextRealtime.audioEnabled : Boolean(item.audioEnabled),
          videoEnabled: item.videoEnabled === undefined ? nextRealtime.videoEnabled : Boolean(item.videoEnabled),
          lastError: item.type === 'error'
            ? (normalizeString(item.errorMessage) || 'provider sidecar 异常')
            : nextRealtime.lastError,
          metadata: {
            ...(nextRealtime.metadata || {}),
            lastEventType: item.type,
          },
        })

        if (item.type === 'latency' && Number.isFinite(Number(item.latencyMs))) {
          nextRealtime = mergeDefenseRealtimeSessionMeta(nextRealtime, {
            latestLatencyMs: Math.max(0, Number(item.latencyMs)),
          })
          continue
        }

        if (item.stage)
          nextStage = item.stage
        if (Number.isFinite(Number(item.turnIndex)))
          nextTurnCount = Math.max(nextTurnCount, Math.trunc(Number(item.turnIndex)))

        const finalTranscript = item.type === 'user.transcript.final' || item.type === 'assistant.transcript.final'
        if (finalTranscript && normalizeString(item.text)) {
          const speakerLabel = normalizeString(item.speakerLabel)
            || (item.type === 'assistant.transcript.final' ? 'AgentDef' : '参赛队')
          const speakerName = normalizeString(item.speakerName) || speakerLabel
          const providerIdentity = normalizeString(item.speakerId)
            || `${provider}:${item.type.startsWith('assistant') ? 'assistant' : 'user'}`
          let participant = await getProjectMeetingParticipantByIdentity(db, {
            meetingId,
            providerIdentity,
          })
          if (!participant) {
            participant = await upsertProjectMeetingParticipant(db, {
              meetingId,
              projectId,
              providerIdentity,
              providerParticipantId: normalizeString(item.providerSessionId) || providerIdentity,
              displayName: speakerName,
              role: item.type.startsWith('assistant') ? 'guest' : 'member',
              metadata: {
                source: 'defense_realtime_sidecar',
                provider,
              },
            })
          }

          const utterance = await appendProjectMeetingUtterance(db, {
            meetingId,
            participantId: participant.id,
            speakerName,
            speakerLabel,
            startedAtMs: Math.max(0, nextTurnCount * 1000),
            endedAtMs: Math.max(0, nextTurnCount * 1000 + 900),
            text: normalizeString(item.text),
            language: 'zh-CN',
            confidence: item.type === 'assistant.transcript.final' ? 1 : 0.92,
            isFinal: true,
            providerEventKey: buildDefenseRealtimeEventKey(item),
          })
          persistedUtterances.push(utterance.id)

          if (item.type === 'assistant.transcript.final') {
            const turnIndex = Math.max(1, Math.trunc(Number(item.turnIndex || nextTurnCount || 1)))
            const createdTurns = await createProjectDefenseTurns(db, {
              sessionId,
              projectId,
              stage: item.stage || resolveDefenseRealtimeStage(nextStage, turnIndex),
              turnIndex,
              turns: [{
                personaId: normalizeString(item.speakerId) || null,
                judgeType: item.judgeType || 'custom',
                judgeName: speakerLabel,
                question: normalizeString(item.text),
                comment: normalizeString(item.metadata?.comment),
                followUp: normalizeString(item.metadata?.followUp),
                score: Number.isFinite(Number(item.metadata?.score)) ? Math.max(0, Math.min(100, Number(item.metadata?.score))) : 0,
                evidenceRefs: [],
                attachments: [],
                metadata: {
                  provider,
                  latencyMs: item.latencyMs,
                  eventId: item.eventId,
                },
              }],
            })
            nextTurnCount = Math.max(nextTurnCount, turnIndex)
            nextStage = item.stage || resolveDefenseRealtimeStage(nextStage, nextTurnCount)
            createdTurnIds.push(...createdTurns.map(turn => turn.id))
          }
        }

        if (item.type === 'error') {
          nextRealtime = mergeDefenseRealtimeSessionMeta(nextRealtime, {
            connectionState: 'error',
            lastError: normalizeString(item.errorMessage) || 'provider sidecar 异常',
          })
        }
      }

      const updatedState = await upsertProjectDefenseSessionState(db, {
        sessionId,
        projectId,
        workspaceId: access.workspaceId,
        currentStage: resolveDefenseRealtimeStage(nextStage, nextTurnCount),
        turnCount: nextTurnCount,
        selectedPersonaIds: currentState.selectedPersonaIds,
        summaryStatus: currentState.summaryStatus,
        summaryResourceId: currentState.summaryResourceId || null,
        linkedMeetingId: currentState.linkedMeetingId || null,
        lastInputMode: currentState.lastInputMode,
        lastContextPack: currentState.lastContextPack || {},
        lastScorecard: currentState.lastScorecard || null,
        realtime: nextRealtime as DefenseRealtimeSessionMeta,
      })

      const billingConfig = resolveRealtimeBillingConfig(aiRuntime, nextRealtime.provider)
      const startedAtForBilling = normalizeString(nextRealtime.metadata?.billingStartedAt)
      const billedMinutes = Math.max(0, Number(nextRealtime.metadata?.billedMinutes || 0))
      const elapsedMinutes = resolveElapsedBillingMinutes(startedAtForBilling)
      const unbilledMinutes = Math.max(0, elapsedMinutes - billedMinutes)
      if (billingConfig && unbilledMinutes > 0) {
        const activeJudgeCount = Math.max(1, currentState.selectedPersonaIds.length || 1)
        const judgeMultiplier = billingConfig.judgeMultiplierEnabled ? activeJudgeCount : 1
        const videoMultiplier = nextRealtime.mediaMode === 'audio_video' ? Math.max(1, Number(billingConfig.videoFrameMultiplier || 1)) : 1
        const units = Math.max(1, Math.ceil(
          unbilledMinutes
          * Math.max(0, Number(billingConfig.realtimeUnitsPerMinute || 1))
          * judgeMultiplier
          * videoMultiplier
          * Math.max(1, Number(billingConfig.providerMarkupMultiplier || 1)),
        ))
        const quota = await teamConsumeAiQuota(db, {
          workspaceId: access.workspaceId,
          userId: user.id,
          route: `/api/projects/${projectId}/defense/realtime/${nextRealtime.provider}/minute`,
          units,
        })
        if (!quota.allowed)
          throw new Error('QUOTA_EXCEEDED')
        nextRealtime = mergeDefenseRealtimeSessionMeta(nextRealtime, {
          metadata: {
            billedMinutes: billedMinutes + unbilledMinutes,
            billingUnits: Math.max(0, Number(nextRealtime.metadata?.billingUnits || 0)) + units,
          },
        })
        await upsertProjectDefenseSessionState(db, {
          sessionId,
          projectId,
          workspaceId: access.workspaceId,
          currentStage: updatedState.currentStage,
          turnCount: updatedState.turnCount,
          selectedPersonaIds: updatedState.selectedPersonaIds,
          summaryStatus: updatedState.summaryStatus,
          summaryResourceId: updatedState.summaryResourceId || null,
          linkedMeetingId: updatedState.linkedMeetingId || null,
          lastInputMode: updatedState.lastInputMode,
          lastContextPack: updatedState.lastContextPack || {},
          lastScorecard: updatedState.lastScorecard || null,
          realtime: nextRealtime as DefenseRealtimeSessionMeta,
        })
      }

      return {
        eventCount: events.length,
        utteranceIds: persistedUtterances,
        turnIds: createdTurnIds,
        state: updatedState,
      }
    })

    return ok(payload, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权写入答辩实时事件。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40407)
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('答辩实时会话不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40507)
    }
    if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return fail('当前工作空间 AI 配额不足，实时答辩已停止补扣。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 42995)
    }
    throw error
  }
})
