import type { TimelineNodeType } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAdminTimeline } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateTimelineBody {
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
  const body = await readBody<CreateTimelineBody>(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40071)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增时间轴。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40371)
  }

  if (!body?.nodeType) {
    setResponseStatus(event, 400)
    return fail('nodeType 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40072)
  }

  let timeline
  try {
    timeline = await withTransaction(event, async (db) => {
      return createAdminTimeline(db, {
        actorUserId: user.id,
        contestId,
        year: Number(body?.year || new Date().getFullYear()),
        nodeType: body.nodeType!,
        startAt: body?.startAt || null,
        endAt: body?.endAt || null,
        note: body?.note,
        sourceLink: body?.sourceLink,
      })
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
      }, 40971)
    }
    throw error
  }

  return ok(timeline, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
