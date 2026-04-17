import { setResponseStatus } from 'h3'
import { resolveMeetingRuntimeError } from '~~/server/services/meeting/meeting-runtime'
import { buildProjectMeetingJoinSession } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getAiChatSessionById } from '~~/server/utils/chat-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readEffectiveMeetingRuntimeSettings } from '~~/server/utils/platform-meeting-config-store'
import { getProjectDefenseSessionState } from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { runtime } = await readEffectiveMeetingRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const sessionId = normalizeString(getRouterParam(event, 'sessionId'))

  if (!projectId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 sessionId。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40106)
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

      const state = await getProjectDefenseSessionState(db, { sessionId })
      const meetingId = normalizeString(state?.linkedMeetingId)
      if (!meetingId)
        throw new Error('NOT_FOUND')

      const meeting = await buildProjectMeetingJoinSession(db, {
        projectId,
        meetingId,
        user,
        runtime,
      })

      return {
        sessionId,
        meetingId,
        meeting: meeting.meeting,
        joinToken: meeting.joinToken,
        joinExpiresAt: meeting.joinExpiresAt,
        joinUrl: meeting.joinUrl,
        selectedPersonaIds: state?.selectedPersonaIds || [],
        provider: state?.realtime?.provider || 'qwen',
        mediaMode: state?.realtime?.mediaMode || 'audio_video',
        realtime: state?.realtime || null,
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
      return fail('当前用户无权访问答辩实时会话。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40405)
    }
    if (error instanceof Error && (error.message === 'NOT_FOUND' || error.message === 'MEETING_NOT_FOUND')) {
      setResponseStatus(event, 404)
      return fail('答辩实时会话不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40505)
    }
    if (error instanceof Error && error.message === 'MEETING_ALREADY_ENDED') {
      setResponseStatus(event, 409)
      return fail('该实时答辩会议已结束。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40905)
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
      }, 50397)
    }

    throw error
  }
})
