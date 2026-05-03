import type {
  DefenseRealtimeMediaMode,
  DefenseRealtimeProvider,
  DefenseVoiceRuntimeSelection,
  ProjectMeetingMode,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { resolveMeetingRuntimeError } from '~~/server/services/meeting/meeting-runtime'
import { createProjectMeetingSession } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAiChatSession } from '~~/server/utils/chat-store'
import { withTransaction } from '~~/server/utils/db'
import {
  normalizeDefenseRealtimeMediaMode,
  normalizeDefenseRealtimeProvider,
} from '~~/server/utils/defense-realtime'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveMeetingRuntimeSettings } from '~~/server/utils/platform-meeting-config-store'
import { upsertProjectDefenseSessionState } from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

interface CreateDefenseRealtimeBody {
  title?: string
  mode?: ProjectMeetingMode
  personaIds?: string[]
  provider?: DefenseRealtimeProvider
  mediaMode?: DefenseRealtimeMediaMode
  voiceRuntimeProviderId?: string
  voiceRuntimeProfileId?: string
  asrProfileId?: string
  ttsProfileId?: string
  vadMode?: 'server_vad' | 'semantic_vad' | 'manual'
  voiceRuntimeSelections?: DefenseVoiceRuntimeSelection[]
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeMode(value: unknown): ProjectMeetingMode {
  return normalizeString(value).toLowerCase() === 'audio' ? 'audio' : 'video'
}

function normalizeVadMode(value: unknown): 'server_vad' | 'semantic_vad' | 'manual' {
  const normalized = normalizeString(value)
  if (normalized === 'manual' || normalized === 'semantic_vad')
    return normalized
  return 'server_vad'
}

function normalizeVoiceRuntimeSelections(value: unknown): DefenseVoiceRuntimeSelection[] {
  if (!Array.isArray(value))
    return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return null
      const record = item as Record<string, unknown>
      const personaId = normalizeString(record.personaId || record.persona_id)
      if (!personaId)
        return null
      return {
        personaId,
        agentId: normalizeString(record.agentId || record.agent_id) || undefined,
        voiceId: normalizeString(record.voiceId || record.voice_id) || undefined,
      }
    })
    .filter((item): item is DefenseVoiceRuntimeSelection => Boolean(item))
}

function resolveRealtimeStartupUnits(runtime: ReturnType<typeof readRuntimeSettings>, provider: DefenseRealtimeProvider): number {
  const registry = resolvePlatformAiRegistry(runtime)
  const voiceProvider = registry.providers.find(item => item.enabled && (
    provider === 'coze'
      ? item.type === 'coze-voice'
      : item.type === 'dashscope-bailian' && (item.capability === 'realtime' || item.capability === 'voice')
  ))
  const billing = voiceProvider?.voice?.billing
  const multiplier = Math.max(1, Number(billing?.providerMarkupMultiplier || 1))
  return Math.max(1, Math.ceil(Number(billing?.realtimeStartupUnits || 2) * multiplier))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { runtime: aiRuntime } = await readEffectiveRuntimeSettings(event)
  const { runtime } = await readEffectiveMeetingRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = await readBody<CreateDefenseRealtimeBody>(event).catch(() => ({} as CreateDefenseRealtimeBody))

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40105)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      const provider = normalizeDefenseRealtimeProvider(body?.provider)
      const mediaMode = normalizeDefenseRealtimeMediaMode(body?.mediaMode)
      const meetingMode = normalizeMode(body?.mode ?? (mediaMode === 'audio' ? 'audio' : 'video'))
      const selectedPersonaIds = Array.isArray(body?.personaIds) ? body.personaIds.map(item => normalizeString(item)).filter(Boolean) : []
      const voiceRuntimeSelections = normalizeVoiceRuntimeSelections(body?.voiceRuntimeSelections)
      const voiceRuntimeProviderId = normalizeString(body?.voiceRuntimeProviderId)
      const voiceRuntimeProfileId = normalizeString(body?.voiceRuntimeProfileId)
      const asrProfileId = normalizeString(body?.asrProfileId)
      const ttsProfileId = normalizeString(body?.ttsProfileId)
      const vadMode = normalizeVadMode(body?.vadMode)
      const startupUnits = resolveRealtimeStartupUnits(aiRuntime, provider)
      const quota = await teamConsumeAiQuota(db, {
        workspaceId: access.workspaceId,
        userId: user.id,
        route: `/api/projects/${projectId}/defense/realtime/${provider}/start`,
        units: startupUnits,
      })
      if (!quota.allowed)
        throw new Error('QUOTA_EXCEEDED')

      const chatSession = await createAiChatSession(db, {
        workspaceId: access.workspaceId,
        projectId,
        mode: 'defense',
        createdByUserId: user.id,
        title: normalizeString(body?.title) || `答辩模拟 · ${meetingMode === 'audio' ? '语音' : '音视频'}会话`,
      })
      const meetingSession = await createProjectMeetingSession(db, {
        projectId,
        workspaceId: access.workspaceId,
        user,
        title: normalizeString(body?.title) || `答辩模拟 · ${meetingMode === 'audio' ? '语音' : '音视频'}会话`,
        mode: meetingMode,
        runtime,
      })

      await upsertProjectDefenseSessionState(db, {
        sessionId: chatSession.id,
        projectId,
        workspaceId: access.workspaceId,
        currentStage: 'opening',
        turnCount: 0,
        selectedPersonaIds,
        summaryStatus: 'idle',
        linkedMeetingId: meetingSession.meeting.id,
        lastInputMode: mediaMode === 'audio' ? 'audio' : 'mixed',
        lastContextPack: {},
        lastScorecard: null,
        realtime: {
          provider,
          mediaMode,
          transport: provider === 'coze' ? 'rtc_sidecar' : 'websocket',
          connectionState: 'bootstrapping',
          bootstrapState: 'idle',
          linkedMeetingId: meetingSession.meeting.id,
          audioEnabled: true,
          videoEnabled: mediaMode === 'audio_video',
          metadata: {
            voiceRuntimeProviderId,
            voiceRuntimeProfileId,
            asrProfileId,
            ttsProfileId,
            vadMode,
            voiceRuntimeSelections,
            billingStartedAt: new Date().toISOString(),
            billedMinutes: 0,
            billingUnits: startupUnits,
          },
        },
      })

      return {
        sessionId: chatSession.id,
        meetingId: meetingSession.meeting.id,
        meeting: meetingSession.meeting,
        rtcJoinToken: meetingSession.rtcJoinToken,
        rtcJoinExpiresAt: meetingSession.rtcJoinExpiresAt,
        rtcServerUrl: meetingSession.rtcServerUrl,
        rtcJoinUrl: meetingSession.rtcJoinUrl,
        joinToken: meetingSession.joinToken,
        joinExpiresAt: meetingSession.joinExpiresAt,
        joinUrl: meetingSession.joinUrl,
        selectedPersonaIds,
        provider,
        mediaMode,
        workspaceId: access.workspaceId,
      }
    })

    await Promise.allSettled([
      emitRealtimeEvent({
        type: 'meeting.state.updated',
        workspaceId: payload.workspaceId,
        projectId,
        payload: {
          meetingId: payload.meetingId,
        },
      }),
      emitRealtimeEvent({
        type: 'meeting.participant.updated',
        workspaceId: payload.workspaceId,
        projectId,
        payload: {
          meetingId: payload.meetingId,
        },
      }),
    ])

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
      return fail('当前用户无权发起答辩实时会话。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40404)
    }
    if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return fail('当前工作空间 AI 配额不足，无法发起实时答辩。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 42994)
    }
    const runtimeError = resolveMeetingRuntimeError(error)
    if (runtimeError) {
      setResponseStatus(event, runtimeError.status)
      return fail(runtimeError.message, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 50394)
    }
    throw error
  }
})
