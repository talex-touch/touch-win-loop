import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getAiChatSessionById, listAiChatMessagesBySession } from '~~/server/utils/chat-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { hasWorkspaceMembership } from '~~/server/utils/platform-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const sessionId = String(getRouterParam(event, 'sessionId') || '').trim()
  const query = getQuery(event)
  const limit = Number(query.limit || 200)

  if (!workspaceId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('workspaceId 或 sessionId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40083)
  }

  const payload = await withClient(event, async (db) => {
    const canUseWorkspace = await hasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    const session = await getAiChatSessionById(db, {
      workspaceId,
      sessionId,
    })
    if (!session)
      throw new Error('SESSION_NOT_FOUND')

    const messages = await listAiChatMessagesBySession(db, {
      workspaceId,
      sessionId,
      limit,
    })

    return {
      session,
      messages,
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return null
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return 'SESSION_NOT_FOUND'
    }
    throw error
  })

  if (!payload) {
    return fail('当前用户无权访问该空间会话消息。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40383)
  }

  if (payload === 'SESSION_NOT_FOUND') {
    return fail('会话不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40483)
  }

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
