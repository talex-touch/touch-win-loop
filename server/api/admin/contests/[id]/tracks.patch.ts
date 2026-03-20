import type { ContestStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { patchAdminTrack } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchTrackBody {
  trackId?: string
  name?: string
  summary?: string
  suitableMajors?: string[]
  deliverableTypes?: string[]
  rubricId?: string | null
  sortOrder?: number
  status?: ContestStatus
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = getRouterParam(event, 'id') || ''
  const body = await readBody<PatchTrackBody>(event)

  if (!contestId || !body?.trackId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 trackId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40069)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑赛道。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40369)
  }

  const track = await withTransaction(event, async (db) => {
    return patchAdminTrack(db, {
      actorUserId: user.id,
      contestId,
      trackId: body.trackId!,
      patch: {
        name: body?.name,
        summary: body?.summary,
        suitableMajors: body?.suitableMajors,
        deliverableTypes: body?.deliverableTypes,
        rubricId: body?.rubricId,
        sortOrder: body?.sortOrder,
        status: body?.status,
      },
    })
  })

  if (!track) {
    setResponseStatus(event, 404)
    return fail('track not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40469)
  }

  return ok(track, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
