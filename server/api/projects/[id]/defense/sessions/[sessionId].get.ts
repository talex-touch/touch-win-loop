import type { AiDefenseSessionDetail } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getAiChatSessionById } from '~~/server/utils/chat-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  buildDefenseJudgeRoundsFromTurns,
  getLatestProjectDefenseSummary,
  getProjectDefenseSessionState,
  listProjectDefensePersonas,
  listProjectDefenseTurnsBySession,
} from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const sessionId = normalizeString(getRouterParam(event, 'sessionId'))

  if (!projectId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 sessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40102)
  }

  const detail = await withClient(event, async (db) => {
    const access = await resolveProjectRealtimeAccess(db, user, projectId)
    if (!access)
      return null

    const session = await getAiChatSessionById(db, {
      workspaceId: access.workspaceId,
      sessionId,
      projectId,
      mode: 'defense',
      strictScope: true,
    })
    if (!session)
      return 'NOT_FOUND' as const

    const state = await getProjectDefenseSessionState(db, { sessionId })
    const turns = await listProjectDefenseTurnsBySession(db, { sessionId })
    const payload: AiDefenseSessionDetail = {
      session,
      state,
      personas: await listProjectDefensePersonas(db, { projectId }),
      turns,
      latestRounds: buildDefenseJudgeRoundsFromTurns(turns, {
        turnIndex: state?.turnCount || null,
      }),
      latestSummary: await getLatestProjectDefenseSummary(db, {
        sessionId,
        summaryType: 'session',
      }),
    }
    return payload
  })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('项目不存在或无访问权限。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40500)
  }

  if (detail === 'NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('答辩会话不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40501)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
