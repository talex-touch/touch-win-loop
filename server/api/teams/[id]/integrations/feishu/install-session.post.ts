import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import { createFeishuWorkspaceInstallSession } from '~~/server/utils/workspace-integration-store'

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
    }, 40103)
  }

  try {
    const data = await withTransaction(event, async (db) => {
      const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canManage)
        throw new Error('FORBIDDEN')

      const config = await readFeishuIntegrationConfig(db)
      if (!config.enabled || !config.marketplaceAppUrl)
        throw new Error('FEISHU_MARKETPLACE_APP_URL_MISSING')

      return createFeishuWorkspaceInstallSession(db, {
        workspaceId,
        actorUserId: user.id,
        marketplaceAppUrl: config.marketplaceAppUrl,
        externalAppId: config.appId,
        appTicketConfigured: Boolean(config.appTicket),
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
      return fail('仅工作空间 owner/admin 可安装飞书第三方平台。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 403103)
    }
    if (error instanceof Error && error.message === 'FEISHU_MARKETPLACE_APP_URL_MISSING') {
      setResponseStatus(event, 409)
      return fail('平台尚未配置飞书商店应用安装地址。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 409103)
    }
    throw error
  }
})
