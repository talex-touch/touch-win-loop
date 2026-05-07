import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const SHARED_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const INTERNAL_TYPES_FILE = resolve(process.cwd(), 'internal/shared-types/domain-legacy.ts')
const FEISHU_CONFIG_STORE_FILE = resolve(process.cwd(), 'server/utils/feishu-integration-store.ts')
const WORKSPACE_STORE_FILE = resolve(process.cwd(), 'server/utils/workspace-integration-store.ts')
const FEISHU_CLIENT_FILE = resolve(process.cwd(), 'server/services/feishu/client.ts')
const WORKSPACE_AUTH_FILE = resolve(process.cwd(), 'server/services/feishu/workspace-auth.ts')
const FEISHU_EVENTS_FILE = resolve(process.cwd(), 'server/api/integrations/feishu/events.post.ts')
const IMPORTS_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/imports/index.post.ts')
const DIRECTORY_SEARCH_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/directory/search.get.ts')
const INSTALL_SESSION_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/install-session.post.ts')
const CLAIM_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/claim.post.ts')
const ADMIN_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue')
const THIRD_PARTY_PANEL_FILE = resolve(process.cwd(), 'app/components/user-settings/UserSettingsThirdPartyPlatformsPanel.vue')

describe('workspace Feishu marketplace auth closure contracts', () => {
  it('extends platform Feishu config with marketplace app url and app ticket status', async () => {
    const [sharedTypes, internalTypes, storeSource, adminPageSource] = await Promise.all([
      readFile(SHARED_TYPES_FILE, 'utf8'),
      readFile(INTERNAL_TYPES_FILE, 'utf8'),
      readFile(FEISHU_CONFIG_STORE_FILE, 'utf8'),
      readFile(ADMIN_PAGE_FILE, 'utf8'),
    ])

    for (const source of [sharedTypes, internalTypes]) {
      assert.match(source, /marketplaceAppUrl: string/, '公开飞书配置缺少 marketplaceAppUrl')
      assert.match(source, /appTicketConfigured: boolean/, '公开飞书配置缺少 appTicketConfigured')
      assert.match(source, /appTicketUpdatedAt: string/, '公开飞书配置缺少 appTicketUpdatedAt')
    }

    assert.match(storeSource, /appTicket: string/, '内部飞书配置缺少 appTicket')
    assert.match(storeSource, /appTicketUpdatedAt: string/, '内部飞书配置缺少 appTicketUpdatedAt')
    assert.match(storeSource, /updateFeishuMarketplaceAppTicket/, '缺少 app_ticket 事件持久化 helper')
    assert.match(storeSource, /encryptConfigSecret\(normalized\.appTicket\)/, 'app_ticket 需要按密钥字段加密落库')
    assert.match(adminPageSource, /marketplaceAppUrl/, '后台飞书配置页缺少商店安装地址配置')
    assert.match(adminPageSource, /appTicketConfigured/, '后台飞书配置页缺少 app_ticket 脱敏状态')
  })

  it('adds workspace install-session and claim APIs for marketplace tenant binding', async () => {
    const [installSource, claimSource, storeSource, authSource, clientSource] = await Promise.all([
      readFile(INSTALL_SESSION_API_FILE, 'utf8'),
      readFile(CLAIM_API_FILE, 'utf8'),
      readFile(WORKSPACE_STORE_FILE, 'utf8'),
      readFile(WORKSPACE_AUTH_FILE, 'utf8'),
      readFile(FEISHU_CLIENT_FILE, 'utf8'),
    ])

    assert.match(installSource, /teamHasWorkspaceRoles/, 'install-session 必须限制 workspace owner/admin')
    assert.match(installSource, /createFeishuWorkspaceInstallSession/, 'install-session 必须创建 pending connection')
    assert.match(installSource, /marketplaceAppUrl/, 'install-session 必须返回平台商店安装地址')
    assert.match(claimSource, /claimFeishuWorkspaceTenant/, 'claim API 必须认领 tenant_key')
    assert.match(claimSource, /getWorkspaceFeishuMarketplaceTenantAccessToken/, 'claim API 必须用 marketplace tenant token 做健康检查')
    assert.match(claimSource, /needs_reauth/, 'claim 失败必须把 connection 标记为 needs_reauth')
    assert.match(claimSource, /tenant_token_failed/, 'claim 失败必须写入 tokenHealth 诊断')
    assert.match(storeSource, /tokenHealth/, 'workspace connection capabilities 必须记录 tokenHealth')
    assert.match(authSource, /getFeishuMarketplaceAppAccessToken/, 'workspace auth helper 必须走 app_ticket -> app_access_token')
    assert.match(authSource, /getFeishuMarketplaceTenantAccessToken/, 'workspace auth helper 必须走 tenant_key -> tenant_access_token')
    assert.match(clientSource, /getFeishuMarketplaceAppAccessToken/, 'Feishu client 缺少 marketplace app token helper')
  })

  it('routes workspace import and directory through marketplace tenant token only', async () => {
    const [importsSource, directorySource] = await Promise.all([
      readFile(IMPORTS_API_FILE, 'utf8'),
      readFile(DIRECTORY_SEARCH_API_FILE, 'utf8'),
    ])

    assert.doesNotMatch(importsSource, /getFeishuTenantAccessToken/, 'workspace import 不得使用 internal tenant token')
    assert.match(importsSource, /getWorkspaceFeishuMarketplaceTenantAccessToken/, 'workspace import 必须使用 marketplace tenant token')
    assert.match(importsSource, /markFeishuWorkspaceConnectionTokenHealth/, 'workspace import token 失败必须更新连接诊断')
    assert.match(directorySource, /getWorkspaceFeishuMarketplaceTenantAccessToken/, 'workspace directory search 必须使用 marketplace tenant token')
    assert.match(directorySource, /listFeishuTenantDirectory/, 'workspace directory search 必须读取飞书远端通讯录')
  })

  it('handles app_ticket and tenant install events without mixing admin sync semantics', async () => {
    const eventsSource = await readFile(FEISHU_EVENTS_FILE, 'utf8')

    assert.match(eventsSource, /extractAppTicket/, '事件入口缺少 app_ticket 提取')
    assert.match(eventsSource, /updateFeishuMarketplaceAppTicket/, '事件入口未持久化 app_ticket')
    assert.match(eventsSource, /registerIntegrationEventDedup/, 'workspace 事件必须接入统一去重')
    assert.match(eventsSource, /updateFeishuWorkspaceConnectionStatusByTenantKey/, '安装/卸载事件必须按 tenant_key 更新 workspace connection')
    assert.match(eventsSource, /ignored_workspace_connection_not_found/, '找不到 workspace connection 时必须只记录诊断不自动建连接')
  })

  it('updates connector settings panel for install, claim, and token health diagnostics', async () => {
    const panelSource = await readFile(THIRD_PARTY_PANEL_FILE, 'utf8')

    assert.match(panelSource, /连接飞书租户/, '连接器面板缺少安装 CTA')
    assert.match(panelSource, /install-session/, '连接器面板缺少 install-session 调用')
    assert.match(panelSource, /integrations\/feishu\/claim/, '连接器面板缺少 tenant claim 调用')
    assert.match(panelSource, /tokenHealth/, '连接器面板缺少 token health 诊断展示')
    assert.match(panelSource, /canImportFeishuResource/, '未连接或 token 异常时必须禁用导入')
  })
})
