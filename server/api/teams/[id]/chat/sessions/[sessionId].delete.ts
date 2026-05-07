import type { WorkspaceAiMode } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { deleteAiChatSession, getAiChatSessionById } from '~~/server/utils/chat-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'

function parseMode(value: unknown): WorkspaceAiMode | null {
  const text = String(value || '').trim()
  if (text === 'dialog_ask' || text === 'loopy_page' || text === 'auto_optimize' || text === 'issue_discovery' || text === 'defense' || text === 'document_assist' || text === 'contextual_agent')
    return text
  return null
}

function isWorkspaceOnlyMode(mode: WorkspaceAiMode | null): boolean {
  return mode === 'dialog_ask' || mode === 'loopy_page'
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

  if (!workspaceId || !sessionId || !mode || (!isWorkspaceOnlyMode(mode) && !projectId)) {
    setResponseStatus(event, 400)
    return fail('teamId、sessionId、mode 不能为空，且非只读模式必须传 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40086)
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

    const deleted = await deleteAiChatSession(db, {
      workspaceId,
      sessionId,
      projectId,
      mode,
      strictScope: true,
    })
    if (!deleted)
      throw new Error('SESSION_NOT_FOUND')

    return {
      sessionId,
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
    return fail('当前用户无权删除该 Team 会话。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40385)
  }

  if (payload === 'SESSION_NOT_FOUND') {
    return fail('会话不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40485)
  }

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
