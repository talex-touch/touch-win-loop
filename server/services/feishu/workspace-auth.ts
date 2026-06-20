import type { FeishuIntegrationConfigInternal } from '~~/server/utils/feishu-integration-store'
import type { WorkspaceIntegrationConnection } from '~~/shared/types/domain'
import {
  getFeishuMarketplaceAppAccessToken,
  getFeishuMarketplaceTenantAccessToken,
} from '~~/server/services/feishu/client'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export async function getWorkspaceFeishuMarketplaceTenantAccessToken(input: {
  config: FeishuIntegrationConfigInternal
  connection?: Pick<WorkspaceIntegrationConnection, 'tenantKey'> | null
  tenantKey?: string
}): Promise<string> {
  const tenantKey = normalizeString(input.tenantKey) || normalizeString(input.connection?.tenantKey)
  if (!input.config.enabled)
    throw new Error('FEISHU_PLATFORM_APP_DISABLED')
  if (!input.config.appId || !input.config.appSecret)
    throw new Error('FEISHU_MARKETPLACE_APP_CONFIG_INCOMPLETE')
  if (!input.config.appTicket)
    throw new Error('FEISHU_MARKETPLACE_APP_TICKET_MISSING')
  if (!tenantKey)
    throw new Error('FEISHU_WORKSPACE_TENANT_KEY_MISSING')

  const appAccessToken = await getFeishuMarketplaceAppAccessToken({
    appId: input.config.appId,
    appSecret: input.config.appSecret,
    appTicket: input.config.appTicket,
  })
  return getFeishuMarketplaceTenantAccessToken({
    appAccessToken,
    tenantKey,
  })
}
