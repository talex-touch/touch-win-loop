import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAiChatSession } from '~~/server/utils/chat-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { hasWorkspaceMembership } from '~~/server/utils/platform-store'
import { toTeamChatSessionResponse } from '~~/server/utils/team-api-presenter'

interface CreateChatSessionBody {
  title?: string
  contestId?: string
  trackId?: string
  major?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<CreateChatSessionBody>(event)

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('teamId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40082)
  }

  const session = await withTransaction(event, async (db) => {
    const canUseWorkspace = await hasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    return createAiChatSession(db, {
      workspaceId,
      createdByUserId: user.id,
      title: body?.title,
      contestId: body?.contestId,
      trackId: body?.trackId,
      major: body?.major,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return null
    }
    throw error
  })

  if (!session) {
    return fail('当前用户无权在该 Team 创建会话。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40382)
  }

  return ok(toTeamChatSessionResponse(session), {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
