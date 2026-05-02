import type { TimelineNodeType } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { patchAdminTrackTimeline } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchTrackTimelineBody {
  trackTimelineId?: string
  trackId?: string
  year?: number
  nodeType?: TimelineNodeType
  businessNodeLabel?: string
  startAt?: string | null
  endAt?: string | null
  note?: string
  sourceLink?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = getRouterParam(event, 'id') || ''
  const body = await readBody<PatchTrackTimelineBody>(event)

  if (!contestId || !body?.trackTimelineId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 trackTimelineId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40078)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑赛道时间线。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40378)
  }

  try {
    const timeline = await withTransaction(event, async (db) => {
      return patchAdminTrackTimeline(db, {
        actorUserId: user.id,
        contestId,
        trackTimelineId: body.trackTimelineId!,
        patch: {
          trackId: body?.trackId,
          year: body?.year,
          nodeType: body?.nodeType,
          businessNodeLabel: body?.businessNodeLabel,
          startAt: body?.startAt,
          endAt: body?.endAt,
          note: body?.note,
          sourceLink: body?.sourceLink,
        },
      })
    })

    if (!timeline) {
      setResponseStatus(event, 404)
      return fail('track timeline not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40478)
    }

    return ok(timeline, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'CONTEST_RELEASE_WORKFLOW_REQUIRED') {
      setResponseStatus(event, 409)
      return fail('当前赛事已接入版本流，请通过“审核/版本”生成新版本后再发布。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40978)
    }
    if (error instanceof Error && error.message === 'TRACK_NOT_FOUND') {
      setResponseStatus(event, 400)
      return fail('trackId 不属于当前赛事。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40079)
    }
    throw error
  }
})
