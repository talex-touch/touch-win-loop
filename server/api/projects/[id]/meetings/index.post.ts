import type { ProjectMeetingMode } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { createProjectMeetingRecord } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

interface CreateMeetingBody {
  title?: string
  mode?: ProjectMeetingMode
  invitedUserIds?: string[]
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeMeetingMode(value: unknown): ProjectMeetingMode {
  return normalizeString(value).toLowerCase() === 'audio' ? 'audio' : 'video'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = await readBody<CreateMeetingBody>(event).catch(() => ({} as CreateMeetingBody))

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const visibleProject = await getVisibleProjectById(db, user, projectId)
      if (!visibleProject)
        throw new Error('PROJECT_NOT_FOUND')

      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      return createProjectMeetingRecord(db, {
        projectId,
        workspaceId: access.workspaceId,
        user,
        title: normalizeString(body?.title),
        mode: normalizeMeetingMode(body?.mode),
        invitedUserIds: Array.isArray(body?.invitedUserIds)
          ? body.invitedUserIds.map(item => normalizeString(item)).filter(Boolean)
          : [],
        scheduledStartAt: normalizeString(body?.scheduledStartAt) || null,
        scheduledEndAt: normalizeString(body?.scheduledEndAt) || null,
        runtime,
      })
    })

    await emitRealtimeEvent({
      type: 'meeting.state.updated',
      workspaceId: payload.meeting.workspaceId,
      projectId,
      payload: {
        meetingId: payload.meeting.id,
      },
    }).catch(() => {})

    return ok(payload.detail, {
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
      return fail('项目不存在或无访问权限。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40493)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权发起会议。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40393)
    }

    if (error instanceof Error && error.message === 'MEETING_INVITEE_NOT_PROJECT_MEMBER') {
      setResponseStatus(event, 400)
      return fail('参会人只能选择当前项目成员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40096)
    }

    if (error instanceof Error && error.message === 'MEETING_INVALID_SCHEDULE') {
      setResponseStatus(event, 400)
      return fail('会议时间无效，结束时间必须晚于开始时间。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40097)
    }

    if (error instanceof Error && error.message === 'MEETING_DURATION_EXCEEDED') {
      setResponseStatus(event, 400)
      return fail('会议时长超过当前工作区套餐上限。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40098)
    }

    if (error instanceof Error && error.message === 'LIVEKIT_CONFIG_MISSING') {
      setResponseStatus(event, 503)
      return fail('RTC 服务未完成配置，请先补齐会议服务参数。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 50393)
    }

    throw error
  }
})
