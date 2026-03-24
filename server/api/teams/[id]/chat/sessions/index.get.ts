import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { listAiChatSessionsByWorkspace } from '~~/server/utils/chat-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { hasWorkspaceMembership } from '~~/server/utils/platform-store'
import { toTeamChatSessionResponse } from '~~/server/utils/team-api-presenter'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)
  const limit = Number(query.limit || 20)

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('teamId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40081)
  }

  const sessions = await withClient(event, async (db) => {
    const canUseWorkspace = await hasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    return listAiChatSessionsByWorkspace(db, {
      workspaceId,
      limit,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return null
    }
    throw error
  })

  if (!sessions) {
    return fail('当前用户无权访问该 Team 会话。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40381)
  }

  return ok(sessions.map(toTeamChatSessionResponse), {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
