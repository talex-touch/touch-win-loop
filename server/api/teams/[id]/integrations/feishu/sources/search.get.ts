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
  const query = String(getQuery(event).q || '').trim().toLowerCase()

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40101)
  }

  try {
    const data = await withClient(event, async (db) => {
      const canAccess = await teamHasWorkspaceMembership(db, user, workspaceId)
      if (!canAccess)
        throw new Error('FORBIDDEN')
      const snapshot = await getFeishuWorkspaceIntegrationSnapshot(db, workspaceId)
      const sources = snapshot.externalResources
        .map(ref => ({
          type: ref.externalType,
          token: ref.externalToken,
          title: String(ref.metadata.sourceTitle || ref.externalToken),
          originalUrl: ref.externalUrl,
          resourceId: ref.resourceId,
          updatedAt: ref.updatedAt,
        }))
        .filter(source => !query || source.title.toLowerCase().includes(query) || source.token.toLowerCase().includes(query))
      return {
        sources,
        connected: snapshot.connected,
      }
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
      return fail('当前用户无权搜索飞书数据源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40401)
    }
    throw error
  }
})
