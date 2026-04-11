import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const LOGIN_ENDPOINT_FILE = resolve(process.cwd(), 'server/api/auth/login.post.ts')
const AUTH_META_ENDPOINT_FILE = resolve(process.cwd(), 'server/api/auth/meta.get.ts')
const AUTH_SESSIONS_ENDPOINT_FILE = resolve(process.cwd(), 'server/api/auth/sessions.get.ts')
const ADMIN_INTEGRATIONS_FILE = resolve(process.cwd(), 'app/pages/admin/integrations.vue')
const ADMIN_CASDOOR_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/casdoor.vue')
const ADMIN_OAUTH_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/oauth.vue')
const ADMIN_CASDOOR_CONFIG_GET_FILE = resolve(process.cwd(), 'server/api/admin/integrations/casdoor/config.get.ts')
const ADMIN_CASDOOR_CONFIG_PATCH_FILE = resolve(process.cwd(), 'server/api/admin/integrations/casdoor/config.patch.ts')
const ADMIN_OAUTH_CONFIG_GET_FILE = resolve(process.cwd(), 'server/api/admin/integrations/oauth/config.get.ts')
const ADMIN_OAUTH_CONFIG_PATCH_FILE = resolve(process.cwd(), 'server/api/admin/integrations/oauth/config.patch.ts')
const LOGIN_PAGE_FILE = resolve(process.cwd(), 'app/pages/login.vue')
const LOGIN_PAGE_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useLoginPage.ts')
const USER_AUTH_BINDINGS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useUserAuthBindings.ts')
const NUXT_CONFIG_FILE = resolve(process.cwd(), 'nuxt.config.ts')
const RUNTIME_SETTINGS_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/runtime-settings.vue')
const USER_SETTINGS_DIALOG_FILE = resolve(process.cwd(), 'app/components/UserSettingsDialog.vue')
const USER_SETTINGS_WORKSPACE_OVERVIEW_PANEL_FILE = resolve(process.cwd(), 'app/components/user-settings/UserSettingsWorkspaceOverviewPanel.vue')
const ADMIN_OAUTH_PAGE_COMPONENT_FILE = resolve(process.cwd(), 'app/components/admin/OauthIntegrationConfigPage.vue')
const DASHBOARD_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/dashboard/DashboardSidebar.vue')
const ADMIN_LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/admin.vue')
const USER_WORKSPACE_OVERVIEW_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useUserWorkspaceOverview.ts')
const USER_AI_USAGE_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useUserAiUsage.ts')
const USER_WORKSPACE_MEMBERSHIP_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useUserWorkspaceMembership.ts')
const USER_SESSION_HISTORY_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useUserSessionHistory.ts')

it('用户名密码登录在关闭注册时会阻止自动建号', async () => {
  const source = await readFile(LOGIN_ENDPOINT_FILE, 'utf8')

  assert.match(source, /if \(!runtime\.auth\.registrationEnabled\)\s+throw new Error\('AUTH_REGISTRATION_DISABLED'\)/, '登录接口未在创建账号前校验注册开关')
  assert.match(source, /平台暂未开放注册，请联系管理员开通账号或开启注册。/, '登录接口缺少注册关闭提示')
})

it('登录元信息接口会暴露注册开关和第三方 OAuth 可用状态', async () => {
  const source = await readFile(AUTH_META_ENDPOINT_FILE, 'utf8')

  assert.match(source, /registrationEnabled:\s*runtime\.auth\.registrationEnabled/, 'auth meta 未返回 registrationEnabled')
  assert.match(source, /enabled:\s*isCasdoorAuthEnabled\(casdoorConfig\)/, 'auth meta 未返回 OAuth 可用状态')
  assert.match(source, /displayName:\s*casdoorConfig\.displayName/, 'auth meta 未返回 OAuth 显示名称')
})

it('登录页提供第三方 OAuth 入口并根据注册开关切换文案', async () => {
  const [pageSource, composableSource] = await Promise.all([
    readFile(LOGIN_PAGE_FILE, 'utf8'),
    readFile(LOGIN_PAGE_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(pageSource, /useLoginPage\(/, '登录页未抽离登录逻辑 composable')
  assert.match(pageSource, /import UniverseBackground/, '登录页未恢复 UniverseBackground 背景层')
  assert.match(pageSource, /<UniverseBackground\b/, '登录页未渲染 UniverseBackground 背景层')
  assert.doesNotMatch(pageSource, /<PageShell size="auth"/, '登录页不应再完全复用统一 auth shell')
  assert.match(pageSource, /登录 WinLoop/, '登录页未恢复独立标题')
  assert.match(pageSource, /已有关联账号需合并|已有账号需合并时/, '登录页未恢复账号合并提示')
  assert.match(composableSource, /manualOauthLogin/, '登录页未接入第三方 OAuth 登录动作')
  assert.match(composableSource, /\/auth\/oauth\/authorize\?redirect=/, '登录页未跳转 OAuth authorize 接口')
  assert.match(composableSource, /DEFAULT_OAUTH_DISPLAY_NAME/, '登录页未提供默认 OAuth 显示名称')
  assert.match(composableSource, /registrationEnabled\.value\s*\?\s*'首次登录将自动注册/, '登录页未按注册开关切换提示文案')
})

it('登录页保持独立玻璃卡片布局并内联表单入口', async () => {
  const pageSource = await readFile(LOGIN_PAGE_FILE, 'utf8')

  assert.match(pageSource, /rounded-\[32px\]/, '登录页未保持独立玻璃卡片布局')
  assert.match(pageSource, /data-testid="login-username-input"/, '登录页未内联用户名输入框')
  assert.match(pageSource, /data-testid="login-password-input"/, '登录页未内联密码输入框')
  assert.match(pageSource, /data-testid="login-submit-button"/, '登录页未内联登录提交按钮')
  assert.doesNotMatch(pageSource, /<LoginTextIcon/, '登录页不应继续依赖 TextIcon 组件')
  assert.doesNotMatch(pageSource, /<LoginFooterBar/, '登录页不应继续依赖底部 FooterBar 组件')
  assert.doesNotMatch(pageSource, /<LoginOauthActions/, '登录页不应继续依赖独立 OAuth 动作组件')
  assert.doesNotMatch(pageSource, /<LoginCredentialForm/, '登录页不应继续依赖独立凭证表单组件')
})

it('后台运行设置页支持切换 auth.registrationEnabled', async () => {
  const source = await readFile(RUNTIME_SETTINGS_PAGE_FILE, 'utf8')

  assert.match(source, /auth:\s*\{\s*registrationEnabled:/, '运行设置页表单未声明 auth.registrationEnabled')
  assert.match(source, /允许首次登录自动注册本地账号/, '运行设置页未展示注册开关文案')
  assert.match(source, /authRegistration/, '运行设置页未展示 authRegistration 配置来源')
})

it('共享个人设置弹框提供第三方 OAuth 绑定状态与绑定入口', async () => {
  const [dialogSource, bindingsSource] = await Promise.all([
    readFile(USER_SETTINGS_DIALOG_FILE, 'utf8'),
    readFile(USER_AUTH_BINDINGS_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(dialogSource, /第三方 OAuth 身份绑定/, '共享个人设置弹框缺少第三方 OAuth 绑定说明')
  assert.match(bindingsSource, /startOauthBind/, '共享个人设置弹框未接入 OAuth 绑定动作')
  assert.match(bindingsSource, /\/auth\/oauth\/bind-status/, '共享个人设置弹框未读取 OAuth 绑定状态')
})

it('共享个人设置弹框按个人信息与工作空间分组，并展示头像上传与空间改名入口', async () => {
  const [dialogSource, workspaceOverviewSource, workspaceOverviewComposableSource, aiUsageComposableSource, workspaceMembershipComposableSource, sessionHistoryComposableSource] = await Promise.all([
    readFile(USER_SETTINGS_DIALOG_FILE, 'utf8'),
    readFile(USER_SETTINGS_WORKSPACE_OVERVIEW_PANEL_FILE, 'utf8'),
    readFile(USER_WORKSPACE_OVERVIEW_COMPOSABLE_FILE, 'utf8'),
    readFile(USER_AI_USAGE_COMPOSABLE_FILE, 'utf8'),
    readFile(USER_WORKSPACE_MEMBERSHIP_COMPOSABLE_FILE, 'utf8'),
    readFile(USER_SESSION_HISTORY_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(dialogSource, /label: '个人信息'/, '共享个人设置弹框缺少个人信息分组或 tab')
  assert.match(dialogSource, /label: '工作空间'/, '共享个人设置弹框缺少工作空间分组')
  assert.match(dialogSource, /label: '工作空间概览'/, '共享个人设置弹框未将概览改为工作空间概览')
  assert.match(dialogSource, /AI 配额/, '共享个人设置弹框缺少 AI 配额 tab 或区块')
  assert.match(workspaceOverviewSource, /工作空间 ID/, '工作空间概览面板缺少工作空间 ID 行')
  assert.match(workspaceOverviewSource, /工作空间名称/, '工作空间概览面板缺少工作空间名称行')
  assert.match(workspaceOverviewSource, /工作空间类型/, '工作空间概览面板缺少工作空间类型行')
  assert.match(workspaceOverviewSource, /工作空间席位管理/, '工作空间概览面板缺少工作空间席位管理行')
  assert.match(dialogSource, /工作空间成员/, '共享个人设置弹框缺少工作空间成员区块')
  assert.match(dialogSource, /const currentUserId = computed/, '共享个人设置弹框未接入用户 ID 数据')
  assert.doesNotMatch(dialogSource, /账号绑定摘要/, '共享个人设置弹框不应再显示个人信息绑定摘要区块')
  assert.doesNotMatch(dialogSource, /管理页/, '共享个人设置弹框不应再展示平台管理员标签')
  assert.match(dialogSource, /编辑资料/, '共享个人设置弹框缺少资料编辑入口')
  assert.match(dialogSource, /logoutConfirmVisible/, '共享个人设置弹框未接入退出登录二次确认状态')
  assert.match(dialogSource, /confirmLogout/, '共享个人设置弹框未接入退出登录确认动作')
  assert.match(dialogSource, /当前仅支持修改头像，用户名暂不支持编辑。/, '共享个人设置弹框缺少资料编辑子弹窗说明')
  assert.doesNotMatch(dialogSource, /重置头像/, '共享个人设置弹框不应再显示重置头像入口')
  assert.doesNotMatch(dialogSource, /当前使用默认字母头像。/, '共享个人设置弹框不应再显示头像来源文案')
  assert.match(workspaceOverviewComposableSource, /升级到 Business/, '工作空间概览未接入工作空间升级入口')
  assert.match(workspaceOverviewComposableSource, /saveWorkspaceName/, '工作空间概览未接入工作空间名称保存动作')
  assert.match(workspaceOverviewComposableSource, /copyWorkspaceId/, '工作空间概览未接入工作空间 UUID 复制能力')
  assert.match(dialogSource, /workspaceInvitationDialogVisible/, '共享个人设置弹框未接入二级邀请弹框状态')
  assert.match(aiUsageComposableSource, /\/teams\/\$\{normalizedWorkspaceId\}\/ai\/usage\?page=\$\{page\}&pageSize=10/, '共享个人设置弹框未读取工作空间 AI 配额消耗接口')
  assert.match(workspaceMembershipComposableSource, /\/teams\/\$\{normalizedWorkspaceId\}\/members/, '共享个人设置弹框未读取工作空间成员接口')
  assert.match(workspaceMembershipComposableSource, /\/teams\/\$\{normalizedWorkspaceId\}\/members\/\$\{member\.userId\}\/role/, '共享个人设置弹框未接入工作空间成员权限调整接口')
  assert.match(workspaceMembershipComposableSource, /\/teams\/\$\{normalizedWorkspaceId\}\/invitations/, '共享个人设置弹框未接入工作空间邀请接口')
  assert.match(dialogSource, /\/auth\/avatar/, '共享个人设置弹框未接入头像上传或重置接口')
  assert.match(workspaceOverviewComposableSource, /`\/teams\/\$\{normalizedWorkspaceId\}`/, '共享个人设置弹框未接入工作空间改名接口')
  assert.match(sessionHistoryComposableSource, /\/auth\/sessions\?limit=10/, '共享个人设置弹框未读取个人登录历史接口')
})

it('个人登录历史接口返回当前用户的 session 列表', async () => {
  const source = await readFile(AUTH_SESSIONS_ENDPOINT_FILE, 'utf8')

  assert.match(source, /FROM sessions s/, '登录历史接口未读取 sessions 表')
  assert.match(source, /WHERE s\.user_id = \$1/, '登录历史接口未按当前用户过滤 session')
  assert.match(source, /status:\s*isCurrent/, '登录历史接口未生成 session 状态')
})

it('dashboard 与 admin 都接入共享个人设置弹框', async () => {
  const [dashboardSource, adminSource] = await Promise.all([
    readFile(DASHBOARD_SIDEBAR_FILE, 'utf8'),
    readFile(ADMIN_LAYOUT_FILE, 'utf8'),
  ])

  assert.match(dashboardSource, /<UserSettingsDialog/, 'DashboardSidebar 未接入共享个人设置弹框')
  assert.match(dashboardSource, /:user-id="props\.analystUserId"/, 'DashboardSidebar 未向共享个人设置弹框透传用户 ID')
  assert.match(adminSource, /<UserSettingsDialog/, 'admin 布局未接入共享个人设置弹框')
  assert.match(adminSource, /:user-id="userId"/, 'admin 布局未向共享个人设置弹框透传用户 ID')
})

it('集成中心提供 OAuth \/ OIDC 配置入口和后台配置 API', async () => {
  const [integrationsSource, pageSource, oauthComponentSource, aliasPageSource, getSource, patchSource, aliasGetSource, aliasPatchSource] = await Promise.all([
    readFile(ADMIN_INTEGRATIONS_FILE, 'utf8'),
    readFile(ADMIN_OAUTH_PAGE_FILE, 'utf8'),
    readFile(ADMIN_OAUTH_PAGE_COMPONENT_FILE, 'utf8'),
    readFile(ADMIN_CASDOOR_PAGE_FILE, 'utf8'),
    readFile(ADMIN_CASDOOR_CONFIG_GET_FILE, 'utf8'),
    readFile(ADMIN_CASDOOR_CONFIG_PATCH_FILE, 'utf8'),
    readFile(ADMIN_OAUTH_CONFIG_GET_FILE, 'utf8'),
    readFile(ADMIN_OAUTH_CONFIG_PATCH_FILE, 'utf8'),
  ])

  assert.match(integrationsSource, /name:\s*'OAuth \/ OIDC'/, '集成中心未展示 OAuth \/ OIDC 卡片')
  assert.match(integrationsSource, /\/admin\/integrations\/oauth/, '集成中心未链接到 OAuth \/ OIDC 配置页')
  assert.match(oauthComponentSource, /OAuth \/ OIDC 集成/, '未创建 OAuth \/ OIDC 集成配置页')
  assert.match(pageSource, /AdminOauthIntegrationConfigPage/, 'OAuth \/ OIDC 页面未接入配置组件')
  assert.match(aliasPageSource, /navigateTo\('\/admin\/integrations\/oauth'/, '旧 Casdoor 页面未跳转到 OAuth \/ OIDC 页面')
  assert.match(oauthComponentSource, /显示名称/, 'OAuth \/ OIDC 集成配置页缺少显示名称字段')
  assert.match(oauthComponentSource, /protocolMode/, 'OAuth \/ OIDC 集成配置页缺少协议模式字段')
  assert.match(oauthComponentSource, /OIDC discovery/, 'OAuth \/ OIDC 集成配置页缺少 OIDC discovery 模式')
  assert.match(oauthComponentSource, /OAuth2 手动端点/, 'OAuth \/ OIDC 集成配置页缺少手动端点模式')
  assert.match(oauthComponentSource, /Authorize Endpoint/, 'OAuth \/ OIDC 集成配置页缺少 Authorize Endpoint 字段')
  assert.match(oauthComponentSource, /Token Endpoint/, 'OAuth \/ OIDC 集成配置页缺少 Token Endpoint 字段')
  assert.match(oauthComponentSource, /Userinfo Endpoint/, 'OAuth \/ OIDC 集成配置页缺少 Userinfo Endpoint 字段')
  assert.match(getSource, /readCasdoorIntegrationConfig/, 'Casdoor 配置读取接口未接入 store')
  assert.match(patchSource, /writeCasdoorIntegrationConfig/, 'Casdoor 配置保存接口未接入 store')
  assert.match(aliasGetSource, /server\/api\/admin\/integrations\/casdoor\/config\.get/, 'OAuth \/ OIDC 读取别名未指向现有实现')
  assert.match(aliasPatchSource, /server\/api\/admin\/integrations\/casdoor\/config\.patch/, 'OAuth \/ OIDC 保存别名未指向现有实现')
  assert.match(patchSource, /body\.displayName/, 'OAuth \/ OIDC 配置保存接口未接收显示名称')
  assert.match(patchSource, /body\.protocolMode/, 'OAuth \/ OIDC 配置保存接口未接收协议模式')
  assert.match(patchSource, /body\.authorizeEndpoint/, 'OAuth \/ OIDC 配置保存接口未接收 authorize endpoint')
  assert.match(patchSource, /body\.tokenEndpoint/, 'OAuth \/ OIDC 配置保存接口未接收 token endpoint')
  assert.match(patchSource, /body\.userinfoEndpoint/, 'OAuth \/ OIDC 配置保存接口未接收 userinfo endpoint')
})

it('casdoor 配置改为集成中心托管，不再依赖专用环境变量', async () => {
  const source = await readFile(NUXT_CONFIG_FILE, 'utf8')

  assert.doesNotMatch(source, /WINLOOP_CASDOOR_/, 'nuxt 配置仍依赖 WINLOOP_CASDOOR_* 环境变量')
})
