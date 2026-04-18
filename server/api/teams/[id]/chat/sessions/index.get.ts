import type { WorkspaceAiMode } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { listAiChatSessionsByWorkspace } from '~~/server/utils/chat-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamChatSessionResponse } from '~~/server/utils/team-api-presenter'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'

function parseMode(value: unknown): WorkspaceAiMode | null {
  const text = String(value || '').trim()
  if (text === 'dialog_ask' || text === 'auto_optimize' || text === 'issue_discovery' || text === 'defense' || text === 'document_assist' || text === 'contextual_agent')
    return text
  return null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)
  const projectId = String(query.projectId || '').trim()
  const mode = parseMode(query.mode)
  const limit = Number(query.limit || 20)

  if (!workspaceId || !mode || (mode !== 'dialog_ask' && !projectId)) {
    setResponseStatus(event, 400)
    return fail('teamId、mode 不能为空，且非只读模式必须传 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40081)
  }

  const sessions = await withClient(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    return listAiChatSessionsByWorkspace(db, {
      workspaceId,
      projectId,
      mode,
      strictScope: true,
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
