import type { TimelineNodeType } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { patchAdminTimeline } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchTimelineBody {
  timelineId?: string
  year?: number
  nodeType?: TimelineNodeType
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
  const body = await readBody<PatchTimelineBody>(event)

  if (!contestId || !body?.timelineId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 timelineId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40073)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑时间轴。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40373)
  }

  const timeline = await withTransaction(event, async (db) => {
    return patchAdminTimeline(db, {
      actorUserId: user.id,
      contestId,
      timelineId: body.timelineId!,
      patch: {
        year: body?.year,
        nodeType: body?.nodeType,
        startAt: body?.startAt,
        endAt: body?.endAt,
        note: body?.note,
        sourceLink: body?.sourceLink,
      },
    })
  })

  if (!timeline) {
    setResponseStatus(event, 404)
    return fail('timeline not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40473)
  }

  return ok(timeline, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
