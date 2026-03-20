import type { ContestFaqItem, ContestLevel, ContestVisibility } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { patchAdminContest } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchContestBody {
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
  const contestId = getRouterParam(event, 'id') || ''
  const body = await readBody<PatchContestBody>(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40063)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑赛事。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40363)
  }

  const patched = await withTransaction(event, async (db) => {
    return patchAdminContest(db, {
      actorUserId: user.id,
      contestId,
      patch: {
        name: body?.name,
        level: body?.level,
        organizer: body?.organizer,
        coOrganizer: body?.coOrganizer,
        officialUrl: body?.officialUrl,
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
        hotScore: body?.hotScore,
        visibility: body?.visibility,
      },
    })
  })

  if (!patched) {
    setResponseStatus(event, 404)
    return fail('contest not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40463)
  }

  return ok(patched, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
