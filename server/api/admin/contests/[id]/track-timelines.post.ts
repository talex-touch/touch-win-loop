import type { TimelineNodeType } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAdminTrackTimeline } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateTrackTimelineBody {
  trackId?: string
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
  const body = await readBody<CreateTrackTimelineBody>(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40075)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增赛道时间线。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40375)
  }

  if (!body?.trackId || !body?.nodeType) {
    setResponseStatus(event, 400)
    return fail('trackId 与 nodeType 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40076)
  }

  try {
    const timeline = await withTransaction(event, async (db) => {
      return createAdminTrackTimeline(db, {
        actorUserId: user.id,
        contestId,
        trackId: body.trackId!,
        year: Number(body?.year || new Date().getFullYear()),
        nodeType: body.nodeType!,
        startAt: body?.startAt || null,
        endAt: body?.endAt || null,
        note: body?.note,
        sourceLink: body?.sourceLink,
      })
    })

    return ok(timeline, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'TRACK_NOT_FOUND') {
      setResponseStatus(event, 400)
      return fail('trackId 不属于当前赛事。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40077)
    }
    throw error
  }
})
