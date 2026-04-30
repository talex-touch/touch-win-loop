import type { WorkspaceFeishuDirectoryUserCandidate } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import { previewFeishuWorkspaceMemberSync } from '~~/server/utils/workspace-integration-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<{ candidates?: WorkspaceFeishuDirectoryUserCandidate[] }>(event)

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40099)
  }

  try {
    const data = await withClient(event, async (db) => {
      const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canManage)
        throw new Error('FORBIDDEN')
      return previewFeishuWorkspaceMemberSync(db, {
        workspaceId,
        candidates: body?.candidates || [],
      })
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
      return fail('仅工作空间 owner/admin 可预览飞书成员同步。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40399)
    }
    throw error
  }
})
