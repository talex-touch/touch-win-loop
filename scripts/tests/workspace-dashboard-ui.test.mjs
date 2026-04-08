import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DASHBOARD_PAGE_FILE = resolve(process.cwd(), 'app/pages/dashboard.vue')
const DASHBOARD_LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/dashboard.vue')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')
const TEAM_OVERVIEW_COMPONENT_FILE = resolve(process.cwd(), 'app/components/team/TeamProjectOverview.vue')
const TEAM_UI_FILE = resolve(process.cwd(), 'app/composables/team-ui.ts')
const DASHBOARD_WORKSPACE_FILE = resolve(process.cwd(), 'app/composables/useDashboardWorkspace.ts')
const LOOPY_DIALOG_FILE = resolve(process.cwd(), 'app/composables/useLoopyDialog.ts')
const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const PROJECT_BASIC_SETTINGS_EDITOR_FILE = resolve(process.cwd(), 'app/components/project/ProjectBasicSettingsEditor.vue')
const PROJECT_SETTINGS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/project-settings.ts')
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

it('项目卡展示图标徽标、底部摘要区、快捷操作区与稳定 display fallback', async () => {
  const source = await readFile(TEAM_OVERVIEW_COMPONENT_FILE, 'utf8')
  const teamUiSource = await readFile(TEAM_UI_FILE, 'utf8')
  const teamSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const workspaceSource = await readFile(PROJECT_WORKSPACE_FILE, 'utf8')

  assert.match(source, /data-testid="team-project-icon-badge"/, '项目卡缺少图标徽标')
  assert.match(source, /data-testid="team-project-member-summary-trigger"/, '项目卡缺少成员席位摘要触发器')
  assert.match(source, /data-testid="team-project-member-summary-popover"/, '项目卡缺少成员席位 popover')
  assert.match(source, /data-testid="team-project-contest-summary-trigger"/, '项目卡缺少比赛摘要触发器')
  assert.match(source, /data-testid="team-project-contest-summary-popover"/, '项目卡缺少比赛列表 popover')
  assert.match(source, /data-testid="team-project-updated-at-trigger"/, '项目卡缺少更新时间触发器')
  assert.match(source, /data-testid="team-project-updated-at-popover"/, '项目卡缺少更新时间 popover')
  assert.match(source, /data-testid="team-project-member-avatar-stack"/, '项目卡缺少头像叠层区域')
  assert.match(source, /暂未绑定比赛/, '项目卡缺少无比赛兜底文案')
  assert.match(source, /data-testid="team-project-action-trigger"/, '项目卡缺少三点操作区')
  assert.match(source, /详细信息/, '项目卡缺少详情快捷操作')
  assert.match(source, /项目设置/, '项目卡缺少项目设置快捷操作')
  assert.match(source, /成员管理/, '项目卡缺少成员管理快捷操作')
  assert.match(source, /归档/, '项目卡缺少归档快捷操作')
  assert.match(source, /border-t border-slate-100/, '归档操作前缺少分隔线')
  assert.match(source, /:disabled="!canManageActions"/, '项目卡未对受限动作做 disabled 控制')
  assert.match(teamSource, /:can-manage-actions="canManageProjectActions"/, 'Team dashboard 未向项目卡透传动作权限')
  assert.match(source, /project\.seatSummaryText/, '项目卡未展示底部席位摘要')
  assert.match(source, /data-testid="team-project-empty-state"/, '项目列表未提供紧凑空态')
  assert.match(teamUiSource, /memberPreview: TeamProjectCardMemberItem\[\]/, 'TeamProjectCardItem 缺少成员预览字段')
  assert.match(teamUiSource, /contestSummary: string/, 'TeamProjectCardItem 缺少比赛摘要字段')
  assert.match(teamUiSource, /seatSummaryText: string/, 'TeamProjectCardItem 缺少席位摘要字段')
  assert.match(teamUiSource, /formatRelativeUpdatedAt/, 'Team UI 缺少相对时间格式化工具')
  assert.match(teamUiSource, /resolveUserAvatarFallback/, 'Team UI 缺少头像回退工具')
  assert.match(teamUiSource, /resolveProjectDisplayConfig\(project\.display, `\$\{project\.id\}:\$\{project\.title\}`\)/, 'Team UI 未使用稳定 display fallback')
  assert.match(teamUiSource, /displayIcon: display\.icon/, 'Team UI 未下发项目展示图标')
  assert.match(teamSource, /@project-action="handleProjectAction"/, 'Team dashboard 未接收项目卡快捷操作事件')
  assert.match(teamSource, /data-testid="team-project-detail-modal"/, 'Team dashboard 缺少项目信息弹窗')
  assert.match(teamSource, /data-testid="team-project-settings-modal"/, 'Team dashboard 缺少项目设置弹窗')
  assert.match(teamSource, /data-testid="team-project-members-modal"/, 'Team dashboard 缺少成员管理弹窗')
  assert.match(teamSource, /<ProjectBasicSettingsEditor/, 'Team dashboard 项目设置弹窗未复用基础设置组件')
  assert.match(teamSource, /data-testid="team-project-settings-save-button"/, 'Team dashboard 项目设置弹窗缺少保存按钮')
  assert.match(teamSource, /data-testid="team-project-invite-submit-button"/, '成员管理弹窗缺少生成邀请链接按钮')
  assert.match(teamSource, /data-testid="team-project-invite-role-select"/, '成员管理弹窗缺少邀请角色选择')
  assert.match(teamSource, /data-testid="team-project-invite-expiry-select"/, '成员管理弹窗缺少邀请有效期选择')
  assert.match(teamSource, /data-testid="team-project-invite-copy-link-button"/, '成员管理弹窗缺少复制邀请链接按钮')
  assert.match(teamSource, /data-testid="team-project-member-role-select"/, '成员管理弹窗缺少成员角色选择器')
  assert.match(teamSource, /data-testid="team-project-member-role-update-button"/, '成员管理弹窗缺少成员角色更新按钮')
  assert.match(teamSource, /data-testid="team-project-member-remove-button"/, '成员管理弹窗缺少移出项目按钮')
  assert.match(teamSource, /openProjectDetailDialog\(payload\.project\.id\)/, '详细信息操作未改为 Team 页内弹窗')
  assert.match(teamSource, /openProjectProfileDialog\(payload\.project\.id\)/, '项目设置操作未改为 Team 页内设置弹窗')
  assert.match(teamSource, /openProjectMembersDialog\(payload\.project\.id\)/, '成员管理操作未改为 Team 页内弹窗')
  assert.match(teamSource, /endpoint\(`\/projects\/\$\{projectId\}\/settings`\)/, '项目设置弹窗未接入项目设置保存接口')
  assert.match(teamSource, /method: 'PATCH'/, '项目设置弹窗未使用 PATCH 保存设置')
  assert.match(teamSource, /buildProjectSettingsCommonPatch\(projectProfileForm\)/, '项目设置弹窗未复用通用 patch 构造')
  assert.match(teamSource, /mergeProjectIntoList\(response\.data\.project\)/, '项目设置保存后未回写 Team 页项目列表')
  assert.match(teamSource, /endpoint\(`\/projects\/\$\{projectId\}\/invitations`\)/, '成员管理弹窗未接入项目邀请创建接口')
  assert.match(teamSource, /projects\/\$\{projectId\}\/members/, '成员管理弹窗未拉取项目成员快照')
  assert.match(teamSource, /method: 'POST',[\s\S]*endpoint\(`\/projects\/\$\{projectId\}\/members`\)/, '成员管理弹窗未接入成员角色更新接口')
  assert.match(teamSource, /endpoint\(`\/projects\/\$\{projectId\}\/members\/\$\{normalizedUserId\}`\)/, '成员管理弹窗未命中成员移除接口路径')
  assert.match(teamSource, /method: 'DELETE'/, '成员管理弹窗未使用 DELETE 方法移除成员')
  assert.match(workspaceSource, /const panel = normalizeQueryParam\(route\.query\.panel\)\.toLowerCase\(\)/, '项目工作区未消费 panel query')
  assert.match(workspaceSource, /if \(panel === 'members'\)\s+openMemberManagementSignal\.value \+= 1/, '项目工作区未支持成员管理快捷打开')
  assert.match(workspaceSource, /openSettingsSignal\.value \+= 1/, '项目工作区未支持项目设置快捷打开')
})

it('平台首页改成纯 Loopy 问答页，侧边导航同步切换品牌', async () => {
  const dashboardSource = await readFile(DASHBOARD_PAGE_FILE, 'utf8')
  const dashboardWorkspaceSource = await readFile(DASHBOARD_WORKSPACE_FILE, 'utf8')
  const loopyDialogSource = await readFile(LOOPY_DIALOG_FILE, 'utf8')

  assert.match(dashboardSource, /data-testid="dashboard-loopy-home"/, '平台首页未切换为 Loopy 首页')
  assert.match(dashboardSource, /消息记录/, 'Loopy 首页左栏未切换为会话记录语义')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-session-list"/, 'Loopy 首页缺少会话记录列表')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-messages"/, 'Loopy 首页缺少消息滚动区')
  assert.match(dashboardSource, /dashboard-loopy-suggestion/, 'Loopy 首页缺少建议问题入口')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-composer"/, 'Loopy 首页缺少输入区')
  assert.match(dashboardSource, /class="mx-auto flex h-full min-h-0 max-w-7xl/, 'Loopy 首页根节点未占满 dashboard shell 可用高度')
  assert.match(dashboardSource, /class="flex-1 min-h-0 overflow-y-auto p-4"/, 'Loopy 首页左栏未改成内部滚动')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-messages"[\s\S]*class="flex-1 min-h-0 overflow-y-auto px-6 py-6"/, 'Loopy 首页右侧消息区未改成内部滚动')
  assert.match(dashboardSource, /await syncLoopyWorkspace\(nextWorkspaceId\)/, 'Loopy 首页未按工作空间级会话初始化')
  assert.doesNotMatch(dashboardSource, /<DashboardOverviewShell/, '平台首页仍在渲染旧概览骨架')
  assert.doesNotMatch(dashboardSource, /<DashboardPlatformPanel/, '平台首页仍在渲染平台能力中心')
  assert.doesNotMatch(dashboardSource, /<DashboardInsights/, '平台首页仍在渲染 AI 洞察')
  assert.doesNotMatch(dashboardSource, /<DashboardCompetitionFeed/, '平台首页仍在渲染赛事动态流')
  assert.doesNotMatch(dashboardSource, /<DashboardRightRail/, '平台首页仍在渲染右侧工作台区块')
  assert.doesNotMatch(dashboardSource, /AI 问答首页/, 'Loopy 首页仍保留旧的首页标题')
  assert.doesNotMatch(dashboardSource, /项目台上下文/, 'Loopy 首页仍保留 workspace 显式选择器')
  assert.doesNotMatch(dashboardSource, /项目上下文/, 'Loopy 首页仍保留项目显式选择器')
  assert.doesNotMatch(dashboardSource, /loopy-page-context-pill/, 'Loopy 首页仍保留 Team\/项目上下文 pill')
  assert.doesNotMatch(dashboardSource, /max-h-\[420px\]/, 'Loopy 首页左栏仍使用固定高度的临时滚动方案')
  assert.doesNotMatch(dashboardSource, /selectedProjectId|changeProject|loopyProjects/, 'Loopy 首页仍残留项目级会话状态')
  assert.match(loopyDialogSource, /projectId: ''[\s\S]*mode: 'dialog_ask'/, 'Loopy 对话 composable 未固定走 workspace 级 dialog_ask')
  assert.doesNotMatch(loopyDialogSource, /selectedProjectId|changeProject|requireProjectForSend|LOOPY_PROJECT_STORAGE_KEY_PREFIX/, 'Loopy 对话 composable 仍残留项目级逻辑')
  assert.match(dashboardWorkspaceSource, /label: 'Loopy'/, '侧边导航未将首页概览改名为 Loopy')
  assert.doesNotMatch(dashboardWorkspaceSource, /首页概览/, '侧边导航仍保留旧的首页概览命名')
})

it('原 dashboard 业务模块已整页迁入 Team 项目台', async () => {
  const teamSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(teamSource, /<DashboardOverviewShell/, 'Team 项目台缺少概览骨架')
  assert.match(teamSource, /data-testid="team-dashboard-integrated-panels"/, 'Team 项目台缺少整合后的业务区块容器')
  assert.match(teamSource, /<DashboardPlatformPanel/, 'Team 项目台未接入平台能力中心')
  assert.match(teamSource, /<DashboardInsights/, 'Team 项目台未接入 AI 洞察')
  assert.match(teamSource, /<DashboardCompetitionFeed/, 'Team 项目台未接入赛事动态流')
  assert.match(teamSource, /<DashboardRightRail/, 'Team 项目台未接入右侧工作台区块')
  assert.match(teamSource, /:portal-cards="portalCards"/, 'Team 项目台未向平台能力中心注入 portal cards')
  assert.match(teamSource, /:quick-actions="teamQuickActions"/, 'Team 项目台未向右侧栏注入 Team 快捷操作')
  assert.match(teamSource, /:skill-metrics="skillMetrics"/, 'Team 项目台未透传个人竞争力分析数据')
  assert.match(teamSource, /:schedule-items="scheduleItems"/, 'Team 项目台未透传本周日程数据')
})

it('team 项目台走 dashboard shell，只有项目工作区保持全屏', async () => {
  const layoutSource = await readFile(DASHBOARD_LAYOUT_FILE, 'utf8')

  assert.match(layoutSource, /return \/\^\\\/team\\\/\[\^\/\]\+\\\/project\\\/\[\^\/\]\+\$\/\.test\(normalizedPath\)/, 'dashboard layout 仍将 Team 项目台误判为全屏工作区')
  assert.doesNotMatch(layoutSource, /return \/\^\\\/team\\\/\[\^\/\]\+\(\?:\\\/project\\\/\[\^\/\]\+\)\?\$\/\.test\(normalizedPath\)/, 'dashboard layout 仍把 /team/:teamId 走成全屏')
  assert.match(layoutSource, /watch\(\(\) => route\.fullPath, async \(\) => \{[\s\S]*shellScrollRef\.value\.scrollTop = 0[\s\S]*\}\)/, 'dashboard layout 未在路由切换后重置 Team 页滚动位置')
})

it('项目基础设置编辑器被抽成公共组件，并沿用 icon 与 accentColor 保存链路', async () => {
  const workspaceSource = await readFile(PROJECT_WORKSPACE_FILE, 'utf8')
  const panelSource = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')
  const editorSource = await readFile(PROJECT_BASIC_SETTINGS_EDITOR_FILE, 'utf8')
  const composableSource = await readFile(PROJECT_SETTINGS_COMPOSABLE_FILE, 'utf8')
  const settingsPatchSource = await readFile(PROJECT_SETTINGS_PATCH_FILE, 'utf8')
  const draftPatchSource = await readFile(PROJECT_SETTINGS_DRAFT_PATCH_FILE, 'utf8')

  assert.match(panelSource, /<ProjectBasicSettingsEditor/, '工作区项目设置面板未复用公共基础设置组件')
  assert.match(editorSource, /项目标识/, '基础设置公共组件缺少项目标识配置区')
  assert.match(editorSource, /恢复默认生成/, '基础设置公共组件缺少恢复默认生成入口')
  assert.match(editorSource, /selectProjectSettingsDisplayIcon/, '基础设置公共组件缺少图标选择逻辑')
  assert.match(editorSource, /selectProjectSettingsDisplayAccent/, '基础设置公共组件缺少颜色选择逻辑')
  assert.match(editorSource, /type="color"/, '基础设置公共组件缺少自定义颜色取色器')
  assert.match(editorSource, /projectSettingsUsingCustomAccent \? projectSettingsCustomAccentValue : '未启用自定义色'/, '基础设置公共组件缺少自定义颜色状态展示')
  assert.match(editorSource, /data-testid="project-basic-settings-editor"/, '基础设置公共组件缺少稳定测试标识')
  assert.match(composableSource, /export function createProjectCommonFormFromProject/, '项目设置公共工具缺少表单初始化方法')
  assert.match(composableSource, /icon: project\.display\?\.icon \|\| ''/, '项目设置公共工具未读取项目图标配置')
  assert.match(composableSource, /accentColor: project\.display\?\.accentColor \|\| ''/, '项目设置公共工具未读取项目强调色配置')
  assert.match(composableSource, /export function buildProjectSettingsCommonPatch/, '项目设置公共工具缺少通用 patch 构造方法')
  assert.match(composableSource, /icon: form\.icon\.trim\(\)/, '项目设置公共工具未提交图标字段')
  assert.match(composableSource, /accentColor: form\.accentColor\.trim\(\)/, '项目设置公共工具未提交强调色字段')
  assert.match(workspaceSource, /buildProjectSettingsCommonPatch\(projectSettingsCommon\)/, '项目工作区未复用公共 patch 构造')
  assert.match(settingsPatchSource, /icon\?: string/, 'settings patch API 缺少 icon 字段')
  assert.match(settingsPatchSource, /accentColor\?: string/, 'settings patch API 缺少 accentColor 字段')
  assert.match(draftPatchSource, /icon: normalizePlainText\(source\.icon\)/, '草稿 patch API 未处理 icon 字段')
  assert.match(draftPatchSource, /accentColor: normalizePlainText\(source\.accentColor\)/, '草稿 patch API 未处理 accentColor 字段')
})
