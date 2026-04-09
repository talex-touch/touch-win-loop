import type { ProjectMeetingMode } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { createProjectMeetingSession } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAiChatSession } from '~~/server/utils/chat-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { upsertProjectDefenseSessionState } from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

interface CreateDefenseRealtimeBody {
  title?: string
  mode?: ProjectMeetingMode
  personaIds?: string[]
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeMode(value: unknown): ProjectMeetingMode {
  return normalizeString(value).toLowerCase() === 'audio' ? 'audio' : 'video'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = await readBody<CreateDefenseRealtimeBody>(event).catch(() => ({} as CreateDefenseRealtimeBody))

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40105)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      const chatSession = await createAiChatSession(db, {
        workspaceId: access.workspaceId,
        projectId,
        mode: 'defense',
        createdByUserId: user.id,
        title: normalizeString(body?.title) || '答辩模拟 · 语音会话',
      })
      const meetingSession = await createProjectMeetingSession(db, {
        projectId,
        workspaceId: access.workspaceId,
        user,
        title: normalizeString(body?.title) || '答辩模拟 · 语音会话',
        mode: normalizeMode(body?.mode),
        runtime,
      })

      await upsertProjectDefenseSessionState(db, {
        sessionId: chatSession.id,
        projectId,
        workspaceId: access.workspaceId,
        currentStage: 'opening',
        turnCount: 0,
        selectedPersonaIds: Array.isArray(body?.personaIds) ? body.personaIds.map(item => normalizeString(item)).filter(Boolean) : [],
        summaryStatus: 'idle',
        linkedMeetingId: meetingSession.meeting.id,
        lastInputMode: 'audio',
        lastContextPack: {},
        lastScorecard: null,
      })

      return {
        sessionId: chatSession.id,
        meetingId: meetingSession.meeting.id,
        meeting: meetingSession.detail,
        joinToken: meetingSession.joinToken,
        joinExpiresAt: meetingSession.joinExpiresAt,
        joinUrl: meetingSession.joinUrl,
        selectedPersonaIds: Array.isArray(body?.personaIds) ? body.personaIds.map(item => normalizeString(item)).filter(Boolean) : [],
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
    if (error instanceof Error && error.message === 'LIVEKIT_CONFIG_MISSING') {
      setResponseStatus(event, 503)
      return fail('RTC 服务未完成配置，请先补齐会议服务参数。', {
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
