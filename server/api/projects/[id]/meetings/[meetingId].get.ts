import { setResponseStatus } from 'h3'
import { buildProjectMeetingJoinSession } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { getProjectMeetingDetail } from '~~/server/utils/project-meeting-store'

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
    }, 40094)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const visibleProject = await getVisibleProjectById(db, user, projectId)
      if (!visibleProject)
        throw new Error('PROJECT_NOT_FOUND')

      return buildProjectMeetingJoinSession(db, {
        projectId,
        meetingId,
        user,
        runtime,
      })
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
    if (error instanceof Error && (error.message === 'PROJECT_NOT_FOUND' || error.message === 'MEETING_NOT_FOUND')) {
      setResponseStatus(event, 404)
      return fail('会议不存在或无访问权限。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40494)
    }

    if (error instanceof Error && error.message === 'MEETING_ALREADY_ENDED') {
      const detail = await withTransaction(event, async (db) => {
        const visibleProject = await getVisibleProjectById(db, user, projectId)
        if (!visibleProject)
          throw new Error('PROJECT_NOT_FOUND')
        return getProjectMeetingDetail(db, {
          projectId,
          meetingId,
        })
      })
      if (!detail) {
        setResponseStatus(event, 404)
        return fail('会议不存在或无访问权限。', {
          startedAt,
          provider: runtime.ai.provider,
          model: runtime.ai.model,
          fallbackUsed: false,
          attempts: 1,
        }, 40495)
      }
      return ok({
        meeting: detail,
        joinToken: '',
        joinExpiresAt: '',
        joinUrl: '',
      }, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 'meeting ended')
    }

    throw error
  }
})
