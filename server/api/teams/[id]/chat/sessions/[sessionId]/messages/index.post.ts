import type { ChatMessage, WorkspaceAiMode } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { appendAiChatMessage, getAiChatSessionById, patchAiChatSessionContext } from '~~/server/utils/chat-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamChatMessageResponse } from '~~/server/utils/team-api-presenter'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'

interface CreateChatMessageBody {
  role?: ChatMessage['role']
  content?: string
  provider?: string
  model?: string
  fallbackUsed?: boolean
  context?: {
    contestId?: string
    trackId?: string
    major?: string
    title?: string
  }
}

function parseMode(value: unknown): WorkspaceAiMode | null {
  const text = String(value || '').trim()
  if (text === 'dialog_ask' || text === 'auto_optimize' || text === 'issue_discovery' || text === 'defense')
    return text
  return null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const sessionId = String(getRouterParam(event, 'sessionId') || '').trim()
  const query = getQuery(event)
  const projectId = String(query.projectId || '').trim()
  const mode = parseMode(query.mode)
  const body = await readBody<CreateChatMessageBody>(event)
  const role = body?.role || 'user'
  const content = String(body?.content || '').trim()

  if (!workspaceId || !sessionId || !mode || !content || (mode !== 'dialog_ask' && !projectId)) {
    setResponseStatus(event, 400)
    return fail('teamId、sessionId、mode、content 不能为空，且非只读模式必须传 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40084)
  }

  if (!['system', 'assistant', 'user'].includes(role)) {
    setResponseStatus(event, 400)
    return fail('role 非法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40085)
  }

  const payload = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    const session = await getAiChatSessionById(db, {
      workspaceId,
      sessionId,
      projectId,
      mode,
      strictScope: true,
    })
    if (!session)
      throw new Error('SESSION_NOT_FOUND')

    await patchAiChatSessionContext(db, {
      workspaceId,
      sessionId,
      projectId,
      mode,
      contestId: body?.context?.contestId,
      trackId: body?.context?.trackId,
      major: body?.context?.major,
      title: body?.context?.title,
    })

    const message = await appendAiChatMessage(db, {
      workspaceId,
      sessionId,
      role,
      content,
      provider: String(body?.provider || runtime.ai.provider),
      model: String(body?.model || runtime.ai.model),
      fallbackUsed: Boolean(body?.fallbackUsed),
      createdByUserId: user.id,
    })

    return {
      sessionId,
      message,
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
    return fail('当前用户无权访问该 Team 会话。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40384)
  }

  if (payload === 'SESSION_NOT_FOUND') {
    return fail('会话不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40484)
  }

  return ok({
    sessionId: payload.sessionId,
    message: toTeamChatMessageResponse(payload.message),
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
