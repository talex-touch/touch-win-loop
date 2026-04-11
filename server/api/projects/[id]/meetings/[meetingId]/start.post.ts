import { setResponseStatus } from 'h3'
import { resolveMeetingRuntimeError } from '~~/server/services/meeting/meeting-runtime'
import { startProjectMeetingSession } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readEffectiveMeetingRuntimeSettings } from '~~/server/utils/platform-meeting-config-store'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { runtime } = await readEffectiveMeetingRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const meetingId = normalizeString(getRouterParam(event, 'meetingId'))

  if (!projectId || !meetingId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 meetingId。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40107)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const visibleProject = await getVisibleProjectById(db, user, projectId)
      if (!visibleProject)
        throw new Error('PROJECT_NOT_FOUND')

      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      return startProjectMeetingSession(db, {
        projectId,
        meetingId,
        user,
        runtime,
      })
    })

    await Promise.allSettled([
      emitRealtimeEvent({
        type: 'meeting.state.updated',
        workspaceId: payload.meeting.workspaceId,
        projectId,
        payload: {
          meetingId,
        },
      }),
      emitRealtimeEvent({
        type: 'meeting.participant.updated',
        workspaceId: payload.meeting.workspaceId,
        projectId,
        payload: {
          meetingId,
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
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('会议不存在或无访问权限。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40498)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权启动该会议。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40395)
    }

    if (error instanceof Error && error.message === 'MEETING_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('会议不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40499)
    }

    if (error instanceof Error && error.message === 'MEETING_CANNOT_START') {
      setResponseStatus(event, 409)
      return fail('当前会议不是可启动的预约会议。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40907)
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
      }, 50395)
    }

    throw error
  }
})
