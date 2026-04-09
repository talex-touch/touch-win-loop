import { setResponseStatus } from 'h3'
import { joinProjectMeetingSession } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const meetingId = normalizeString(getRouterParam(event, 'meetingId'))

  if (!projectId || !meetingId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 meetingId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40108)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const visibleProject = await getVisibleProjectById(db, user, projectId)
      if (!visibleProject)
        throw new Error('PROJECT_NOT_FOUND')

      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      return joinProjectMeetingSession(db, {
        projectId,
        meetingId,
        user,
        runtime,
      })
    })

    await emitRealtimeEvent({
      type: 'meeting.participant.updated',
      workspaceId: payload.meeting.workspaceId,
      projectId,
      payload: {
        meetingId,
      },
    }).catch(() => {})

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
      }, 40506)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权加入该会议。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40396)
    }

    if (error instanceof Error && error.message === 'MEETING_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('会议不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40507)
    }

    if (error instanceof Error && error.message === 'MEETING_NOT_STARTED') {
      setResponseStatus(event, 409)
      return fail('会议尚未开始，请等待主持人启动。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40908)
    }

    if (error instanceof Error && error.message === 'MEETING_ALREADY_ENDED') {
      setResponseStatus(event, 409)
      return fail('会议已结束，无法继续加入。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40909)
    }

    throw error
  }
})
