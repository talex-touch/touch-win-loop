import type { ContestFaqItem, ContestLevel, ContestVisibility } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAdminContest } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateContestBody {
  name?: string
  level?: ContestLevel
  organizer?: string
  coOrganizer?: string
  officialUrl?: string
  summary?: string
  participantRequirements?: string
  teamRule?: string
  currentSeason?: string
  disciplines?: string[]
  aliases?: string[]
  keywords?: string[]
  recommendedFor?: string[]
  faq?: string
  faqItems?: ContestFaqItem[]
  hotScore?: number
  visibility?: ContestVisibility
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<CreateContestBody>(event)

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增赛事。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40362)
  }

  const name = String(body?.name || '').trim()
  const level = body?.level
  const officialUrl = String(body?.officialUrl || '').trim()

  if (!name || !level || !officialUrl) {
    setResponseStatus(event, 400)
    return fail('name、level、officialUrl 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40062)
  }

  const created = await withTransaction(event, async (db) => {
    return createAdminContest(db, {
      actorUserId: user.id,
      name,
      level,
      organizer: body?.organizer,
      coOrganizer: body?.coOrganizer,
      officialUrl,
      summary: body?.summary,
      participantRequirements: body?.participantRequirements,
      teamRule: body?.teamRule,
      currentSeason: body?.currentSeason,
      disciplines: body?.disciplines,
      aliases: body?.aliases,
      keywords: body?.keywords,
      recommendedFor: body?.recommendedFor,
      faq: body?.faq,
      faqItems: body?.faqItems,
      hotScore: Number(body?.hotScore || 0),
      visibility: body?.visibility,
    })
  })

  return ok(created, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
