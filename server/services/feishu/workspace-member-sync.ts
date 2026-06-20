import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type { WorkspaceFeishuDirectoryUserCandidate } from '~~/shared/types/domain'
import { listFeishuTenantDirectory } from '~~/server/services/feishu/client'
import { getWorkspaceFeishuMarketplaceTenantAccessToken } from '~~/server/services/feishu/workspace-auth'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import {
  getFeishuWorkspaceIntegrationSnapshot,
  markFeishuWorkspaceConnectionTokenHealth,
} from '~~/server/utils/workspace-integration-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return normalizeString(error.message) || '飞书通讯录拉取失败'
  return normalizeString(error) || '飞书通讯录拉取失败'
}

function toTokenHealth(error: unknown): 'missing_app_ticket' | 'missing_tenant_key' | 'tenant_token_failed' {
  const message = error instanceof Error ? error.message : String(error || '')
  if (message === 'FEISHU_MARKETPLACE_APP_TICKET_MISSING')
    return 'missing_app_ticket'
  if (message === 'FEISHU_WORKSPACE_TENANT_KEY_MISSING')
    return 'missing_tenant_key'
  return 'tenant_token_failed'
}

function normalizeFallbackCandidates(input?: WorkspaceFeishuDirectoryUserCandidate[]): WorkspaceFeishuDirectoryUserCandidate[] {
  if (!Array.isArray(input))
    return []
  return input
    .filter(candidate => normalizeString(candidate.unionId))
    .map(candidate => ({
      openId: normalizeString(candidate.openId),
      unionId: normalizeString(candidate.unionId),
      name: normalizeString(candidate.name),
      email: normalizeString(candidate.email),
      mobile: normalizeString(candidate.mobile),
      departmentIds: Array.isArray(candidate.departmentIds) ? candidate.departmentIds.map(normalizeString).filter(Boolean) : [],
      groupIds: Array.isArray(candidate.groupIds) ? candidate.groupIds.map(normalizeString).filter(Boolean) : [],
      avatarUrl: normalizeString(candidate.avatarUrl),
    }))
}

export async function resolveFeishuWorkspaceMemberSyncCandidates(
  event: H3Event,
  db: Queryable,
  input: {
    workspaceId: string
    actorUserId: string
    fallbackCandidates?: WorkspaceFeishuDirectoryUserCandidate[]
  },
): Promise<WorkspaceFeishuDirectoryUserCandidate[]> {
  const fallbackCandidates = normalizeFallbackCandidates(input.fallbackCandidates)
  if (fallbackCandidates.length > 0)
    return fallbackCandidates

  const snapshot = await getFeishuWorkspaceIntegrationSnapshot(db, input.workspaceId)
  if (!snapshot.connected || !snapshot.connection)
    throw new Error('WORKSPACE_FEISHU_NOT_CONNECTED')

  const config = await readFeishuIntegrationConfig(db)
  let tenantAccessToken = ''
  try {
    tenantAccessToken = await getWorkspaceFeishuMarketplaceTenantAccessToken({
      config,
      connection: snapshot.connection,
    })
  }
  catch (error) {
    const tokenHealth = toTokenHealth(error)
    const message = toErrorMessage(error)
    await markFeishuWorkspaceConnectionTokenHealth(db, {
      workspaceId: input.workspaceId,
      status: 'needs_reauth',
      tokenHealth,
      lastError: message,
      actorUserId: input.actorUserId,
    })
    throw new Error(`FEISHU_MEMBER_SYNC_TOKEN_FAILED:${message}`)
  }

  const directory = await listFeishuTenantDirectory({
    tenantAccessToken,
    maxUsers: 3000,
  })

  return directory.users.map(profile => ({
    openId: profile.openId,
    unionId: profile.unionId,
    name: profile.name || profile.enName || profile.unionId,
    email: profile.email,
    mobile: profile.mobile,
    departmentIds: directory.userDepartmentIds[profile.unionId] || [],
    groupIds: [],
    avatarUrl: profile.avatarUrl,
  }))
}
