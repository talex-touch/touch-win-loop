import { setResponseStatus } from 'h3'
import { getWorkspaceFeishuMarketplaceTenantAccessToken } from '~~/server/services/feishu/workspace-auth'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import {
  claimFeishuWorkspaceTenant,
  markFeishuWorkspaceConnectionTokenHealth,
} from '~~/server/utils/workspace-integration-store'

interface ClaimFeishuWorkspaceTenantBody {
  tenantKey?: string
  tenantName?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toTokenHealth(error: unknown): 'missing_app_ticket' | 'missing_tenant_key' | 'tenant_token_failed' {
  const message = error instanceof Error ? error.message : String(error || '')
  if (message === 'FEISHU_MARKETPLACE_APP_TICKET_MISSING')
    return 'missing_app_ticket'
  if (message === 'FEISHU_WORKSPACE_TENANT_KEY_MISSING')
    return 'missing_tenant_key'
  return 'tenant_token_failed'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<ClaimFeishuWorkspaceTenantBody>(event).catch(() => ({}))
  const tenantKey = normalizeString(body?.tenantKey)

  if (!workspaceId || !tenantKey) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId 或 tenantKey。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40104)
  }

  const canManage = await withClient(event, async (db) => {
    return teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
  })
  if (!canManage) {
    setResponseStatus(event, 403)
    return fail('仅工作空间 owner/admin 可认领飞书租户。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 403104)
  }

  const config = await withClient(event, db => readFeishuIntegrationConfig(db))
  try {
    await getWorkspaceFeishuMarketplaceTenantAccessToken({
      config,
      tenantKey,
    })
  }
  catch (error) {
    const tokenHealth = toTokenHealth(error)
    await withTransaction(event, async (db) => {
      await markFeishuWorkspaceConnectionTokenHealth(db, {
        workspaceId,
        status: 'needs_reauth',
        tokenHealth,
        lastError: error instanceof Error ? error.message : String(error || 'tenant_token_failed'),
        actorUserId: user.id,
      })
    })

    setResponseStatus(event, 409)
    return fail('飞书租户 token 健康检查失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      tokenHealth,
    }, 409104)
  }

  const snapshot = await withTransaction(event, async (db) => {
    return claimFeishuWorkspaceTenant(db, {
      workspaceId,
      actorUserId: user.id,
      tenantKey,
      tenantName: body?.tenantName,
      externalAppId: config.appId,
    })
  })

  return ok(snapshot, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
  })
})
