import type { ContestStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAdminTrack } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateTrackBody {
  name?: string
  summary?: string
  coverImageUrl?: string
  location?: string
  organizer?: string
  undertaker?: string
  participantRequirements?: string
  teamRule?: string
  awardRatio?: string
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
  const body = await readBody<CreateTrackBody>(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40067)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增赛道。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40367)
  }

  const name = String(body?.name || '').trim()
  if (!name) {
    setResponseStatus(event, 400)
    return fail('赛道名称不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40068)
  }

  const track = await withTransaction(event, async (db) => {
    return createAdminTrack(db, {
      actorUserId: user.id,
      contestId,
      name,
      summary: body?.summary,
      coverImageUrl: body?.coverImageUrl,
      location: body?.location,
      organizer: body?.organizer,
      undertaker: body?.undertaker,
      participantRequirements: body?.participantRequirements,
      teamRule: body?.teamRule,
      awardRatio: body?.awardRatio,
      suitableMajors: body?.suitableMajors,
      deliverableTypes: body?.deliverableTypes,
      rubricId: body?.rubricId,
      sortOrder: Number(body?.sortOrder || 0),
      status: body?.status,
    })
  })

  return ok(track, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
