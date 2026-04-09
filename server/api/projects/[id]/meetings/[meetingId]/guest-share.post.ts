import { setResponseStatus } from 'h3'
import { getOrCreateProjectMeetingGuestShare } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const meetingId = normalizeString(getRouterParam(event, 'meetingId'))
  const body = await readBody<{ regenerate?: boolean }>(event).catch(() => ({}))

  if (!projectId || !meetingId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 meetingId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40113)
  }

  try {
    const share = await withTransaction(event, async (db) => {
      const visibleProject = await getVisibleProjectById(db, user, projectId)
      if (!visibleProject)
        throw new Error('PROJECT_NOT_FOUND')

      return getOrCreateProjectMeetingGuestShare(db, {
        projectId,
        meetingId,
        user,
        regenerate: Boolean(body?.regenerate),
      })
    })

    return ok(share, {
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
      }, 40417)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('仅主持人可管理外部分享链接。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40317)
    }

    if (error instanceof Error && error.message === 'MEETING_SHARE_UNAVAILABLE') {
      setResponseStatus(event, 409)
      return fail('会议已结束或不可分享，无法生成外部链接。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40917)
    }

    throw error
  }
})
