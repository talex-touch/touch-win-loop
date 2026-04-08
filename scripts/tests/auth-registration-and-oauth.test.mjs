import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const LOGIN_ENDPOINT_FILE = resolve(process.cwd(), 'server/api/auth/login.post.ts')
const AUTH_META_ENDPOINT_FILE = resolve(process.cwd(), 'server/api/auth/meta.get.ts')
const AUTH_SESSIONS_ENDPOINT_FILE = resolve(process.cwd(), 'server/api/auth/sessions.get.ts')
const ADMIN_INTEGRATIONS_FILE = resolve(process.cwd(), 'app/pages/admin/integrations.vue')
const ADMIN_CASDOOR_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/casdoor.vue')
const ADMIN_CASDOOR_CONFIG_GET_FILE = resolve(process.cwd(), 'server/api/admin/integrations/casdoor/config.get.ts')
const ADMIN_CASDOOR_CONFIG_PATCH_FILE = resolve(process.cwd(), 'server/api/admin/integrations/casdoor/config.patch.ts')
const LOGIN_PAGE_FILE = resolve(process.cwd(), 'app/pages/login.vue')
const NUXT_CONFIG_FILE = resolve(process.cwd(), 'nuxt.config.ts')
const RUNTIME_SETTINGS_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/runtime-settings.vue')
const USER_SETTINGS_DIALOG_FILE = resolve(process.cwd(), 'app/components/UserSettingsDialog.vue')
const DASHBOARD_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/dashboard/DashboardSidebar.vue')
const ADMIN_LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/admin.vue')

it('用户名密码登录在关闭注册时会阻止自动建号', async () => {
  const source = await readFile(LOGIN_ENDPOINT_FILE, 'utf8')

  assert.match(source, /if \(!runtime\.auth\.registrationEnabled\)\s+throw new Error\('AUTH_REGISTRATION_DISABLED'\)/, '登录接口未在创建账号前校验注册开关')
  assert.match(source, /平台暂未开放注册，请联系管理员开通账号或开启注册。/, '登录接口缺少注册关闭提示')
})

it('登录元信息接口会暴露注册开关和 Casdoor 可用状态', async () => {
  const source = await readFile(AUTH_META_ENDPOINT_FILE, 'utf8')

  assert.match(source, /registrationEnabled:\s*runtime\.auth\.registrationEnabled/, 'auth meta 未返回 registrationEnabled')
  assert.match(source, /enabled:\s*isCasdoorAuthEnabled\(casdoorConfig\)/, 'auth meta 未返回 Casdoor 可用状态')
})

it('登录页提供 Casdoor OAuth 入口并根据注册开关切换文案', async () => {
  const source = await readFile(LOGIN_PAGE_FILE, 'utf8')

  assert.match(source, /manualCasdoorLogin/, '登录页未接入 Casdoor 登录动作')
  assert.match(source, /\/auth\/casdoor\/authorize\?redirect=/, '登录页未跳转 Casdoor authorize 接口')
  assert.match(source, /registrationEnabled \? '首次登录将自动注册/, '登录页未按注册开关切换提示文案')
})

it('后台运行设置页支持切换 auth.registrationEnabled', async () => {
  const source = await readFile(RUNTIME_SETTINGS_PAGE_FILE, 'utf8')

  assert.match(source, /auth:\s*\{\s*registrationEnabled:/, '运行设置页表单未声明 auth.registrationEnabled')
  assert.match(source, /允许首次登录自动注册本地账号/, '运行设置页未展示注册开关文案')
  assert.match(source, /authRegistration/, '运行设置页未展示 authRegistration 配置来源')
})

it('共享个人设置弹框提供 Casdoor 绑定状态与绑定入口', async () => {
  const source = await readFile(USER_SETTINGS_DIALOG_FILE, 'utf8')

  assert.match(source, /Casdoor 账号/, '共享个人设置弹框缺少 Casdoor 账号区块')
  assert.match(source, /startCasdoorBind/, '共享个人设置弹框未接入 Casdoor 绑定动作')
  assert.match(source, /\/auth\/casdoor\/bind-status/, '共享个人设置弹框未读取 Casdoor 绑定状态')
})

it('共享个人设置弹框按个人信息与工作空间分组，并展示头像上传与空间改名入口', async () => {
  const source = await readFile(USER_SETTINGS_DIALOG_FILE, 'utf8')

  assert.match(source, /label: '个人信息'/, '共享个人设置弹框缺少个人信息分组或 tab')
  assert.match(source, /label: '工作空间'/, '共享个人设置弹框缺少工作空间分组')
  assert.match(source, /label: '工作空间概览'/, '共享个人设置弹框未将概览改为工作空间概览')
  assert.match(source, /AI 配额/, '共享个人设置弹框缺少 AI 配额 tab 或区块')
  assert.match(source, /工作空间 ID/, '共享个人设置弹框缺少工作空间 ID 行')
  assert.match(source, /工作空间名称/, '共享个人设置弹框缺少工作空间名称行')
  assert.match(source, /工作空间类型/, '共享个人设置弹框缺少工作空间类型行')
  assert.match(source, /工作空间席位管理/, '共享个人设置弹框缺少工作空间席位管理行')
  assert.match(source, /工作空间成员/, '共享个人设置弹框缺少工作空间成员区块')
  assert.doesNotMatch(source, /账号绑定摘要/, '共享个人设置弹框不应再显示个人信息绑定摘要区块')
  assert.match(source, /编辑资料/, '共享个人设置弹框缺少资料编辑入口')
  assert.match(source, /当前仅支持修改头像，用户名暂不支持编辑。/, '共享个人设置弹框缺少资料编辑子弹窗说明')
  assert.doesNotMatch(source, /重置头像/, '共享个人设置弹框不应再显示重置头像入口')
  assert.doesNotMatch(source, /当前使用默认字母头像。/, '共享个人设置弹框不应再显示头像来源文案')
  assert.match(source, /升级到 Business/, '共享个人设置弹框缺少工作空间升级入口')
  assert.match(source, /saveWorkspaceName/, '共享个人设置弹框未接入工作空间名称保存动作')
  assert.match(source, /copyWorkspaceId/, '共享个人设置弹框未接入工作空间 UUID 复制能力')
  assert.match(source, /workspaceInvitationDialogVisible/, '共享个人设置弹框未接入二级邀请弹框状态')
  assert.match(source, /\/teams\/\$\{normalizedWorkspaceId\}\/ai\/usage\?page=\$\{page\}&pageSize=10/, '共享个人设置弹框未读取工作空间 AI 配额消耗接口')
  assert.match(source, /\/teams\/\$\{normalizedWorkspaceId\}\/members/, '共享个人设置弹框未读取工作空间成员接口')
  assert.match(source, /\/teams\/\$\{normalizedWorkspaceId\}\/members\/\$\{member\.userId\}\/role/, '共享个人设置弹框未接入工作空间成员权限调整接口')
  assert.match(source, /\/teams\/\$\{normalizedWorkspaceId\}\/invitations/, '共享个人设置弹框未接入工作空间邀请接口')
  assert.match(source, /\/auth\/avatar/, '共享个人设置弹框未接入头像上传或重置接口')
  assert.match(source, /`\/teams\/\$\{normalizedWorkspaceId\}`/, '共享个人设置弹框未接入工作空间改名接口')
  assert.match(source, /\/auth\/sessions\?limit=10/, '共享个人设置弹框未读取个人登录历史接口')
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
  assert.match(adminSource, /<UserSettingsDialog/, 'admin 布局未接入共享个人设置弹框')
})

it('集成中心提供 Casdoor 配置入口和后台配置 API', async () => {
  const [integrationsSource, pageSource, getSource, patchSource] = await Promise.all([
    readFile(ADMIN_INTEGRATIONS_FILE, 'utf8'),
    readFile(ADMIN_CASDOOR_PAGE_FILE, 'utf8'),
    readFile(ADMIN_CASDOOR_CONFIG_GET_FILE, 'utf8'),
    readFile(ADMIN_CASDOOR_CONFIG_PATCH_FILE, 'utf8'),
  ])

  assert.match(integrationsSource, /name:\s*'Casdoor'/, '集成中心未展示 Casdoor 卡片')
  assert.match(integrationsSource, /\/admin\/integrations\/casdoor/, '集成中心未链接到 Casdoor 配置页')
  assert.match(pageSource, /Casdoor 集成/, '未创建 Casdoor 集成配置页')
  assert.match(getSource, /readCasdoorIntegrationConfig/, 'Casdoor 配置读取接口未接入 store')
  assert.match(patchSource, /writeCasdoorIntegrationConfig/, 'Casdoor 配置保存接口未接入 store')
})

it('casdoor 配置改为集成中心托管，不再依赖专用环境变量', async () => {
  const source = await readFile(NUXT_CONFIG_FILE, 'utf8')

  assert.doesNotMatch(source, /WINLOOP_CASDOOR_/, 'nuxt 配置仍依赖 WINLOOP_CASDOOR_* 环境变量')
})
