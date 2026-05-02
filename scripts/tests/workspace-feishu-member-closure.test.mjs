import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const DOMAIN_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const STORE_FILE = resolve(process.cwd(), 'server/utils/workspace-integration-store.ts')
const MEMBER_SYNC_PREVIEW_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/member-sync/preview.post.ts')
const MEMBER_SYNC_RUN_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/member-sync/run.post.ts')
const MEMBER_SYNC_SERVICE_FILE = resolve(process.cwd(), 'server/services/feishu/workspace-member-sync.ts')
const FEISHU_AUTH_FILE = resolve(process.cwd(), 'server/services/feishu/auth.ts')
const PANEL_FILE = resolve(process.cwd(), 'app/components/user-settings/UserSettingsThirdPartyPlatformsPanel.vue')

describe('workspace Feishu member and login closure contracts', () => {
  it('extends member sync diagnostics and auto-join store surface', async () => {
    const [domainSource, storeSource] = await Promise.all([
      readFile(DOMAIN_FILE, 'utf8'),
      readFile(STORE_FILE, 'utf8'),
    ])

    assert.match(domainSource, /WorkspaceFeishuMemberSyncDiagnosticCode/, '缺少成员同步诊断 code 类型')
    assert.match(domainSource, /seat_limit_exceeded/, '诊断类型缺少席位不足')
    assert.match(domainSource, /email_conflict/, '诊断类型缺少邮箱冲突')
    assert.match(domainSource, /not_whitelisted/, '诊断类型缺少白名单未命中')
    assert.match(domainSource, /roleMappingAppliedCount/, '同步结果缺少角色映射应用数量')
    assert.match(domainSource, /seatFailedCount/, '同步结果缺少席位失败数量')

    assert.match(storeSource, /export async function applyFeishuWorkspaceAutoJoin/, '缺少飞书登录自动加入 helper')
    assert.match(storeSource, /auto_login_enabled = TRUE/, '自动加入必须只处理启用 autoLogin 的策略')
    assert.match(storeSource, /status = 'connected'/, '自动加入必须只处理已连接租户')
    assert.match(storeSource, /teamEnsureWorkspaceMember/, '自动加入必须复用 workspace membership 写入')
    assert.match(storeSource, /seat_limit_exceeded/, '自动加入必须捕获席位不足诊断')
    assert.match(storeSource, /not_whitelisted/, '自动加入必须记录未命中诊断')
  })

  it('makes member sync APIs server-authoritative through marketplace tenant token', async () => {
    const [previewSource, runSource, serviceSource] = await Promise.all([
      readFile(MEMBER_SYNC_PREVIEW_API_FILE, 'utf8'),
      readFile(MEMBER_SYNC_RUN_API_FILE, 'utf8'),
      readFile(MEMBER_SYNC_SERVICE_FILE, 'utf8'),
    ])
    const combined = `${previewSource}\n${runSource}\n${serviceSource}`

    assert.match(combined, /resolveFeishuWorkspaceMemberSyncCandidates/, '成员同步 API 必须服务端解析通讯录 candidates')
    assert.match(combined, /getWorkspaceFeishuMarketplaceTenantAccessToken/, '成员同步必须使用 workspace marketplace tenant token')
    assert.match(combined, /listFeishuTenantDirectory/, '成员同步必须由服务端拉取飞书通讯录')
    assert.match(combined, /markFeishuWorkspaceConnectionTokenHealth/, 'token 异常必须写回 connection 诊断')
    assert.match(combined, /body\?\.candidates/, 'API 仍需保留 candidates 降级输入')
    assert.doesNotMatch(combined, /body\?\.candidates \|\| \[\]/, 'API 不应再把前端 candidates 当作唯一来源')
  })

  it('keeps platform login separate from connector member sync UI', async () => {
    const [authSource, panelSource] = await Promise.all([
      readFile(FEISHU_AUTH_FILE, 'utf8'),
      readFile(PANEL_FILE, 'utf8'),
    ])

    assert.doesNotMatch(authSource, /applyFeishuWorkspaceAutoJoin/, '飞书登录链路不应再触发 workspace 自动加入')
    assert.match(authSource, /loginWithExternalAuthProfile/, '飞书登录应复用统一第三方身份登录服务')
    assert.doesNotMatch(authSource, /fs_/, '飞书登录不应再在登录链路生成 fs_ 用户名')

    assert.match(panelSource, /directoryCandidates/, '连接器面板缺少通讯录候选状态')
    assert.match(panelSource, /selectedFeishuUnionIds/, '连接器面板缺少用户白名单选择')
    assert.match(panelSource, /selectedFeishuDepartmentIds/, '连接器面板缺少部门白名单选择')
    assert.match(panelSource, /roleMappingDrafts/, '连接器面板缺少用户角色映射')
    assert.match(panelSource, /member-sync\/run/, '连接器面板缺少执行成员同步动作')
    assert.match(panelSource, /canSyncFeishuMembers/, '连接异常时必须禁用成员同步')
    assert.doesNotMatch(panelSource, /成员白名单 unionId/, '面板不应继续要求手写 unionId')
  })
})
