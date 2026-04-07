import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DASHBOARD_PAGE_FILE = resolve(process.cwd(), 'app/pages/dashboard.vue')
const DASHBOARD_LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/dashboard.vue')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')
const TEAM_OVERVIEW_COMPONENT_FILE = resolve(process.cwd(), 'app/components/team/TeamProjectOverview.vue')
const TEAM_UI_FILE = resolve(process.cwd(), 'app/composables/team-ui.ts')
const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const PROJECT_SETTINGS_PATCH_FILE = resolve(process.cwd(), 'server/api/projects/[id]/settings.patch.ts')
const PROJECT_SETTINGS_DRAFT_PATCH_FILE = resolve(process.cwd(), 'server/api/projects/[id]/settings-draft.patch.ts')

it('team dashboard 基于计费估算计算项目配额剩余值', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(
    source,
    /const remainingProjectSlots = computed\(\(\) => \{\s+return calculateRemainingProjectSlots\(\{/,
    '工作空间详情页未基于 billing estimate 计算剩余项目配额',
  )
  assert.match(
    source,
    /if \(workspaceBillingEstimate\.value && remainingProjectSlots\.value === 0\)\s+return '当前项目台项目数量已达上限，请先扩容项目配额。'/,
    'Team dashboard 未在前端兜底禁用已满配额的新建入口',
  )
  assert.match(
    source,
    /if \(!workspaceCanCreateProject\.value\)\s+return '当前为只读成员，不能新建项目。'/,
    'Team dashboard 未限制 member 只读新建权限',
  )
})

it('team dashboard 只保留轻量 summary 文案，不再展示 summary 小块', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /当前 Team 的项目与配额概览。/, 'Team dashboard 头部文案缺失')
  assert.doesNotMatch(source, /:summary-stats=/, 'Team dashboard 仍在挂载旧的大摘要卡')
  assert.doesNotMatch(source, /#summary/, 'Team dashboard 仍在渲染自定义 summary slot')
  assert.doesNotMatch(source, /:summary-text=/, 'Team dashboard 仍在展示可见项目提示')
  assert.doesNotMatch(source, /:primary-action-hint-text=/, 'Team dashboard 仍在展示只读成员提示')
})

it('项目卡展示图标徽标、席位进度条、快捷操作区与稳定 display fallback', async () => {
  const source = await readFile(TEAM_OVERVIEW_COMPONENT_FILE, 'utf8')
  const teamUiSource = await readFile(TEAM_UI_FILE, 'utf8')
  const teamSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const workspaceSource = await readFile(PROJECT_WORKSPACE_FILE, 'utf8')

  assert.match(source, /data-testid="team-project-icon-badge"/, '项目卡缺少图标徽标')
  assert.match(source, /data-testid="team-project-seat-bar"/, '项目卡缺少席位进度条')
  assert.match(source, /data-testid="team-project-action-trigger"/, '项目卡缺少三点操作区')
  assert.match(source, /详细信息/, '项目卡缺少详情快捷操作')
  assert.match(source, /项目设置/, '项目卡缺少项目设置快捷操作')
  assert.match(source, /成员管理/, '项目卡缺少成员管理快捷操作')
  assert.match(source, /归档/, '项目卡缺少归档快捷操作')
  assert.match(source, /border-t border-slate-100/, '归档操作前缺少分隔线')
  assert.match(source, /:disabled="!canManageActions"/, '项目卡未对受限动作做 disabled 控制')
  assert.match(teamSource, /:can-manage-actions="canManageProjectActions"/, 'Team dashboard 未向项目卡透传动作权限')
  assert.match(source, /剩余 \{\{ project\.projectSeatRemaining \}\} 个席位/, '项目卡未展示项目席位剩余值')
  assert.match(source, /data-testid="team-project-empty-state"/, '项目列表未提供紧凑空态')
  assert.match(teamUiSource, /seatProgressPercent\?: number/, 'TeamProjectCardItem 缺少席位进度百分比字段')
  assert.match(teamUiSource, /resolveProjectDisplayConfig\(project\.display, `\$\{project\.id\}:\$\{project\.title\}`\)/, 'Team UI 未使用稳定 display fallback')
  assert.match(teamUiSource, /displayIcon: display\.icon/, 'Team UI 未下发项目展示图标')
  assert.match(teamSource, /@project-action="handleProjectAction"/, 'Team dashboard 未接收项目卡快捷操作事件')
  assert.match(teamSource, /data-testid="team-project-detail-modal"/, 'Team dashboard 缺少项目信息弹窗')
  assert.match(teamSource, /data-testid="team-project-settings-modal"/, 'Team dashboard 缺少项目介绍弹窗')
  assert.match(teamSource, /data-testid="team-project-members-modal"/, 'Team dashboard 缺少成员管理弹窗')
  assert.match(teamSource, /data-testid="team-project-invite-submit-button"/, '成员管理弹窗缺少生成邀请链接按钮')
  assert.match(teamSource, /data-testid="team-project-invite-role-select"/, '成员管理弹窗缺少邀请角色选择')
  assert.match(teamSource, /data-testid="team-project-invite-expiry-select"/, '成员管理弹窗缺少邀请有效期选择')
  assert.match(teamSource, /data-testid="team-project-invite-copy-link-button"/, '成员管理弹窗缺少复制邀请链接按钮')
  assert.match(teamSource, /data-testid="team-project-member-role-select"/, '成员管理弹窗缺少成员角色选择器')
  assert.match(teamSource, /data-testid="team-project-member-role-update-button"/, '成员管理弹窗缺少成员角色更新按钮')
  assert.match(teamSource, /data-testid="team-project-member-remove-button"/, '成员管理弹窗缺少移出项目按钮')
  assert.match(teamSource, /openProjectDetailDialog\(payload\.project\.id\)/, '详细信息操作未改为 Team 页内弹窗')
  assert.match(teamSource, /openProjectProfileDialog\(payload\.project\.id\)/, '项目设置操作未改为 Team 页内介绍弹窗')
  assert.match(teamSource, /openProjectMembersDialog\(payload\.project\.id\)/, '成员管理操作未改为 Team 页内弹窗')
  assert.match(teamSource, /endpoint\(`\/projects\/\$\{projectId\}\/invitations`\)/, '成员管理弹窗未接入项目邀请创建接口')
  assert.match(teamSource, /projects\/\$\{projectId\}\/members/, '成员管理弹窗未拉取项目成员快照')
  assert.match(teamSource, /method: 'POST',[\s\S]*endpoint\(`\/projects\/\$\{projectId\}\/members`\)/, '成员管理弹窗未接入成员角色更新接口')
  assert.match(teamSource, /endpoint\(`\/projects\/\$\{projectId\}\/members\/\$\{normalizedUserId\}`\)/, '成员管理弹窗未命中成员移除接口路径')
  assert.match(teamSource, /method: 'DELETE'/, '成员管理弹窗未使用 DELETE 方法移除成员')
  assert.match(workspaceSource, /const panel = normalizeQueryParam\(route\.query\.panel\)\.toLowerCase\(\)/, '项目工作区未消费 panel query')
  assert.match(workspaceSource, /if \(panel === 'members'\)\s+openMemberManagementSignal\.value \+= 1/, '项目工作区未支持成员管理快捷打开')
  assert.match(workspaceSource, /openSettingsSignal\.value \+= 1/, '项目工作区未支持项目设置快捷打开')
})

it('平台首页与 Team 项目台共用同一概览骨架，但保留各自业务区块', async () => {
  const dashboardSource = await readFile(DASHBOARD_PAGE_FILE, 'utf8')
  const teamSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(dashboardSource, /<DashboardOverviewShell/, '平台首页未挂载共享概览骨架')
  assert.match(teamSource, /<DashboardOverviewShell/, 'Team 项目台未挂载共享概览骨架')
  assert.match(dashboardSource, /平台能力中心/, '平台首页缺少平台能力中心区块')
  assert.doesNotMatch(teamSource, /:summary-text=/, 'Team 项目台仍挂载 Team 专属 summary 文案')
  assert.doesNotMatch(teamSource, /平台能力中心/, 'Team 项目台意外混入平台能力中心文案')
})

it('team 项目台走 dashboard shell，只有项目工作区保持全屏', async () => {
  const layoutSource = await readFile(DASHBOARD_LAYOUT_FILE, 'utf8')

  assert.match(layoutSource, /return \/\^\\\/team\\\/\[\^\/\]\+\\\/project\\\/\[\^\/\]\+\$\/\.test\(normalizedPath\)/, 'dashboard layout 仍将 Team 项目台误判为全屏工作区')
  assert.doesNotMatch(layoutSource, /return \/\^\\\/team\\\/\[\^\/\]\+\(\?:\\\/project\\\/\[\^\/\]\+\)\?\$\/\.test\(normalizedPath\)/, 'dashboard layout 仍把 /team/:teamId 走成全屏')
  assert.match(layoutSource, /watch\(\(\) => route\.fullPath, async \(\) => \{[\s\S]*shellScrollRef\.value\.scrollTop = 0[\s\S]*\}\)/, 'dashboard layout 未在路由切换后重置 Team 页滚动位置')
})

it('项目设置支持 icon 与 accentColor 的保存和草稿缓存链路', async () => {
  const workspaceSource = await readFile(PROJECT_WORKSPACE_FILE, 'utf8')
  const panelSource = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')
  const settingsPatchSource = await readFile(PROJECT_SETTINGS_PATCH_FILE, 'utf8')
  const draftPatchSource = await readFile(PROJECT_SETTINGS_DRAFT_PATCH_FILE, 'utf8')

  assert.match(workspaceSource, /icon: project\.display\?\.icon \|\| ''/, '项目设置初始化未读取项目图标配置')
  assert.match(workspaceSource, /accentColor: project\.display\?\.accentColor \|\| ''/, '项目设置初始化未读取项目强调色配置')
  assert.match(workspaceSource, /icon: projectSettingsCommon\.icon\.trim\(\)/, '项目设置保存未提交图标字段')
  assert.match(workspaceSource, /accentColor: projectSettingsCommon\.accentColor\.trim\(\)/, '项目设置保存未提交强调色字段')
  assert.match(panelSource, /项目标识/, '项目设置面板缺少项目标识配置区')
  assert.match(panelSource, /恢复默认生成/, '项目设置面板缺少恢复默认生成入口')
  assert.match(panelSource, /selectProjectSettingsDisplayIcon/, '项目设置面板缺少图标选择逻辑')
  assert.match(panelSource, /selectProjectSettingsDisplayAccent/, '项目设置面板缺少颜色选择逻辑')
  assert.match(panelSource, /type="color"/, '项目设置面板缺少自定义颜色取色器')
  assert.match(panelSource, /projectSettingsUsingCustomAccent \? projectSettingsCustomAccentValue : '未启用自定义色'/, '项目设置面板缺少自定义颜色状态展示')
  assert.match(settingsPatchSource, /icon\?: string/, 'settings patch API 缺少 icon 字段')
  assert.match(settingsPatchSource, /accentColor\?: string/, 'settings patch API 缺少 accentColor 字段')
  assert.match(draftPatchSource, /icon: normalizePlainText\(source\.icon\)/, '草稿 patch API 未处理 icon 字段')
  assert.match(draftPatchSource, /accentColor: normalizePlainText\(source\.accentColor\)/, '草稿 patch API 未处理 accentColor 字段')
})
