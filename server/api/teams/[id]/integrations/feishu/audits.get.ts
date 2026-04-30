import type { WorkspaceIntegrationAuditLog } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import { listWorkspaceIntegrationAuditLogs } from '~~/server/utils/workspace-integration-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const limit = Math.max(1, Math.min(50, Number(getQuery(event).limit || 20)))

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40105)
  }

  try {
    const items = await withClient(event, async (db) => {
      const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canManage)
        throw new Error('FORBIDDEN')
      return listWorkspaceIntegrationAuditLogs(db, {
        workspaceId,
        provider: 'feishu',
        limit,
      })
    })

    return ok<WorkspaceIntegrationAuditLog[]>(items, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('仅工作空间 owner/admin 可查看飞书第三方平台审计日志。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 403105)
    }
    throw error
  }
})
