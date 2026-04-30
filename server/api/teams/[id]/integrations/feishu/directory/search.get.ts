import { setResponseStatus } from 'h3'
import { listFeishuTenantDirectory } from '~~/server/services/feishu/client'
import { getWorkspaceFeishuMarketplaceTenantAccessToken } from '~~/server/services/feishu/workspace-auth'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import {
  getFeishuWorkspaceIntegrationSnapshot,
  markFeishuWorkspaceConnectionTokenHealth,
  recordWorkspaceIntegrationAuditLog,
} from '~~/server/utils/workspace-integration-store'

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
  const query = String(getQuery(event).q || '').trim().toLowerCase()

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40098)
  }

  try {
    const data = await withClient(event, async (db) => {
      const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canManage)
        throw new Error('FORBIDDEN')
      const [snapshot, config] = await Promise.all([
        getFeishuWorkspaceIntegrationSnapshot(db, workspaceId),
        readFeishuIntegrationConfig(db),
      ])
      return {
        snapshot,
        config,
      }
    })

    if (!data.snapshot.connected || !data.snapshot.connection) {
      return ok({
        candidates: [],
        diagnosticCode: 'feishu_workspace_not_connected',
        diagnosticMessage: '当前工作空间尚未连接飞书。',
      }, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    let tenantAccessToken = ''
    try {
      tenantAccessToken = await getWorkspaceFeishuMarketplaceTenantAccessToken({
        config: data.config,
        connection: data.snapshot.connection,
      })
    }
    catch (error) {
      const tokenHealth = toTokenHealth(error)
      await withClient(event, async (db) => {
        await markFeishuWorkspaceConnectionTokenHealth(db, {
          workspaceId,
          status: 'needs_reauth',
          tokenHealth,
          lastError: error instanceof Error ? error.message : String(error || tokenHealth),
          actorUserId: user.id,
        })
        await recordWorkspaceIntegrationAuditLog(db, {
          workspaceId,
          provider: 'feishu',
          connectionId: data.snapshot.connection?.id || null,
          actorUserId: user.id,
          action: 'feishu.directory.failed',
          status: 'error',
          summary: '飞书通讯录搜索失败：租户 token 不可用。',
          payload: {
            diagnosticCode: tokenHealth,
            message: error instanceof Error ? error.message : String(error || tokenHealth),
          },
        })
      })
      return ok({
        candidates: [],
        diagnosticCode: tokenHealth,
        diagnosticMessage: '飞书租户 token 健康检查失败。',
      }, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    const directory = await listFeishuTenantDirectory({
      tenantAccessToken,
      maxUsers: 200,
    }).catch(async (error) => {
      await withClient(event, async (db) => {
        await recordWorkspaceIntegrationAuditLog(db, {
          workspaceId,
          provider: 'feishu',
          connectionId: data.snapshot.connection?.id || null,
          actorUserId: user.id,
          action: 'feishu.directory.failed',
          status: 'error',
          summary: '飞书通讯录搜索失败。',
          payload: {
            diagnosticCode: 'directory_failed',
            message: error instanceof Error ? error.message : String(error || 'directory_failed'),
          },
        })
      })
      throw error
    })
    const candidates = directory.users
      .map(profile => ({
        unionId: profile.unionId,
        openId: profile.openId,
        name: profile.name || profile.enName || profile.unionId,
        email: profile.email,
        mobile: profile.mobile,
        avatarUrl: profile.avatarUrl,
        departmentIds: directory.userDepartmentIds[profile.unionId] || [],
        groupIds: [],
      }))
      .filter(candidate => candidate.unionId && (!query || candidate.name.toLowerCase().includes(query) || candidate.email.toLowerCase().includes(query)))

    return ok({
      candidates,
      diagnosticCode: 'ok',
      diagnosticMessage: '',
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('仅工作空间 owner/admin 可搜索飞书通讯录。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40398)
    }
    throw error
  }
})
