import type { AiDefenseSummaryType } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getLatestProjectDefenseSummary } from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSummaryType(value: unknown): AiDefenseSummaryType | undefined {
  const normalized = normalizeString(value)
  if (normalized === 'turn' || normalized === 'session')
    return normalized
  return undefined
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const sessionId = normalizeString(getRouterParam(event, 'sessionId'))
  const summaryType = normalizeSummaryType(getQuery(event).summaryType)

  if (!projectId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 sessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40103)
  }

  const summary = await withClient(event, async (db) => {
    const access = await resolveProjectRealtimeAccess(db, user, projectId)
    if (!access)
      return null

    return getLatestProjectDefenseSummary(db, {
      sessionId,
      summaryType,
    })
  })

  if (summary === null) {
    setResponseStatus(event, 404)
    return fail('答辩总结不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40502)
  }

  return ok({
    item: summary,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
