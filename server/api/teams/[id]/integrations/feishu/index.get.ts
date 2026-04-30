import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { getFeishuWorkspaceIntegrationSnapshot } from '~~/server/utils/workspace-integration-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40095)
  }

  try {
    const data = await withClient(event, async (db) => {
      const canAccess = await teamHasWorkspaceMembership(db, user, workspaceId)
      if (!canAccess)
        throw new Error('FORBIDDEN')
      return getFeishuWorkspaceIntegrationSnapshot(db, workspaceId)
    })

    return ok(data, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权查看该工作空间飞书连接。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40395)
    }
    throw error
  }
})
