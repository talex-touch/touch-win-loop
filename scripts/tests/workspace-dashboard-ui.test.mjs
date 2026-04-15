import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DASHBOARD_PAGE_FILE = resolve(process.cwd(), 'app/pages/dashboard.vue')
const DASHBOARD_LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/dashboard.vue')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')
const TEAM_OVERVIEW_COMPONENT_FILE = resolve(process.cwd(), 'app/components/team/TeamProjectOverview.vue')
const TEAM_CREATE_PROJECT_DIALOG_FILE = resolve(process.cwd(), 'app/components/team/TeamCreateProjectDialog.vue')
const TEAM_UI_FILE = resolve(process.cwd(), 'app/composables/team-ui.ts')
const DASHBOARD_WORKSPACE_FILE = resolve(process.cwd(), 'app/composables/useDashboardWorkspace.ts')
const LOOPY_DIALOG_FILE = resolve(process.cwd(), 'app/composables/useLoopyDialog.ts')
const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_HEADER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceHeader.vue')
const WORKSPACE_LEFT_RAIL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftRail.vue')
const WORKSPACE_USER_RAIL_MENU_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceUserRailMenu.vue')
const WORKSPACE_AI_TOGGLE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAiToggleButton.vue')
const WORKSPACE_DASHBOARD_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDashboardTab.vue')
const WORKSPACE_METAK_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMetaK.vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const WORKSPACE_MAIN_PANEL_CHROME_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelChrome.vue')
const WORKSPACE_MAIN_PANEL_EMPTY_STATE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelEmptyState.vue')
const WORKSPACE_SHELL_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectShell.ts')
const WORKSPACE_PROJECT_SETTINGS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceProjectSettingsTab.vue')
const WORKSPACE_LOADING_OVERLAY_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceShellLoadingOverlay.vue')
const WORKSPACE_STATUS_BAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceStatusBar.vue')
const WORKSPACE_TAB_STRIP_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceTabStrip.vue')
const UI_CONTEXT_MENU_FILE = resolve(process.cwd(), 'app/components/ui/UiContextMenu.vue')
const UNIFIED_AVATAR_FILE = resolve(process.cwd(), 'app/components/UnifiedAvatar.vue')
const USER_SETTINGS_DIALOG_FILE = resolve(process.cwd(), 'app/components/UserSettingsDialog.vue')
const PROJECT_BASIC_SETTINGS_EDITOR_FILE = resolve(process.cwd(), 'app/components/project/ProjectBasicSettingsEditor.vue')
const PROJECT_SETTINGS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/project-settings.ts')
const PROJECT_SETTINGS_PATCH_FILE = resolve(process.cwd(), 'server/api/projects/[id]/settings.patch.ts')
const PROJECT_SETTINGS_DRAFT_PATCH_FILE = resolve(process.cwd(), 'server/api/projects/[id]/settings-draft.patch.ts')
const PROJECT_QUICK_CREATE_FILE = resolve(process.cwd(), 'server/api/projects/quick.post.ts')
const PLATFORM_STORE_FILE = resolve(process.cwd(), 'server/utils/platform-store.ts')
const UNSAFE_FETCH_PLUGIN_FILE = resolve(process.cwd(), 'app/plugins/unsafe-fetch.ts')

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

it('team dashboard 仅在主数据加载成功后渲染整合面板', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /const loading = ref\(true\)/, 'Team dashboard 首屏未默认进入 loading，容易先渲染空面板')
  assert.match(source, /const shouldRenderIntegratedPanels = computed\(\(\) => !loading\.value && !errorText\.value\)/, 'Team dashboard 缺少整合面板错误边界')
  assert.match(source, /<section\s+v-if="shouldRenderIntegratedPanels"[\s\S]*data-testid="team-dashboard-integrated-panels"/, 'Team dashboard 未在加载失败时隐藏整合面板')
  assert.match(source, /const legacyProjectId = normalizeQueryValue\(route\.query\.projectId\)/, 'Team dashboard 缺少 legacy projectId 兼容跳转')
  assert.doesNotMatch(source, /endpoint\(`\/teams\/\$\{workspaceId\}\/last-project`\)/, 'Team dashboard 仍会按最近项目自动跳转进项目工作区')
  assert.match(source, /const \[projectsResult, contestsResult\] = await Promise\.allSettled\(\[/, 'Team dashboard 仍会因 contests 预加载失败而整体报错')
  assert.match(source, /if \(projectsResult\.status !== 'fulfilled'\)\s+throw projectsResult\.reason/, 'Team dashboard 未将 projects 作为唯一必需主数据源')
  assert.match(source, /console\.error\('\[team-dashboard\] preload contests failed'/, 'Team dashboard 未记录 contests 降级日志')
  assert.match(source, /console\.error\('\[team-dashboard\] loadWorkspaceDashboard failed'/, 'Team dashboard 未记录主加载失败日志')
  assert.match(source, /error\?\.response\?\._data\?\.message/, 'Team dashboard 未透传响应体中的后端错误消息')
})

it('unsafeFetch 默认透传认证上下文', async () => {
  const source = await readFile(UNSAFE_FETCH_PLUGIN_FILE, 'utf8')

  assert.match(source, /globalThis\.unsafeFetch = \(\(request, options = \{\}\) => \{/, 'unsafeFetch 未包装统一请求入口')
  assert.match(source, /credentials: options\?\.credentials \?\? 'include'/, 'unsafeFetch 未默认包含认证凭据，跨域或代理场景下会丢失登录态')
})

it('项目卡展示图标徽标、底部摘要区、快捷操作区与稳定 display fallback', async () => {
  const source = await readFile(TEAM_OVERVIEW_COMPONENT_FILE, 'utf8')
  const teamUiSource = await readFile(TEAM_UI_FILE, 'utf8')
  const teamSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const workspaceShellSource = await readFile(WORKSPACE_SHELL_COMPOSABLE_FILE, 'utf8')

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
  assert.match(teamSource, /Message\.success\('项目设置已保存。'\)/, 'Team 项目设置保存后未触发全局成功消息')
  assert.match(teamSource, /endpoint\(`\/projects\/\$\{projectId\}\/invitations`\)/, '成员管理弹窗未接入项目邀请创建接口')
  assert.match(teamSource, /projects\/\$\{projectId\}\/members/, '成员管理弹窗未拉取项目成员快照')
  assert.match(teamSource, /method: 'POST',[\s\S]*endpoint\(`\/projects\/\$\{projectId\}\/members`\)/, '成员管理弹窗未接入成员角色更新接口')
  assert.match(teamSource, /endpoint\(`\/projects\/\$\{projectId\}\/members\/\$\{normalizedUserId\}`\)/, '成员管理弹窗未命中成员移除接口路径')
  assert.match(teamSource, /method: 'DELETE'/, '成员管理弹窗未使用 DELETE 方法移除成员')
  assert.match(workspaceShellSource, /const panel = normalizeQueryParam\(route\.query\.panel\)\.toLowerCase\(\)/, '项目工作区未消费 panel query')
  assert.match(workspaceShellSource, /if \(panel === 'members' \|\| panel === 'settings' \|\| panel === 'meeting' \|\| panel === 'flow'\)\s+legacyTabId = panel/, '项目工作区未兼容标准 legacy panel query')
  assert.match(workspaceShellSource, /else if \(panel === 'design'\)\s+legacyTabId = 'design'/, '项目工作区未保留 legacy design panel 迁移入口')
  assert.match(workspaceShellSource, /migrateLegacyDesignWorkspaceState\(/, '项目工作区未执行 legacy design 链接迁移')
})

it('平台首页改成纯 Loopy 问答页，侧边导航同步切换品牌', async () => {
  const dashboardSource = await readFile(DASHBOARD_PAGE_FILE, 'utf8')
  const dashboardWorkspaceSource = await readFile(DASHBOARD_WORKSPACE_FILE, 'utf8')
  const loopyDialogSource = await readFile(LOOPY_DIALOG_FILE, 'utf8')

  assert.match(dashboardSource, /data-testid="dashboard-loopy-home"/, '平台首页未切换为 Loopy 首页')
  assert.doesNotMatch(dashboardSource, /消息记录/, 'Loopy 首页仍保留旧的左栏标题')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-session-list"/, 'Loopy 首页缺少会话记录列表')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-messages"/, 'Loopy 首页缺少消息滚动区')
  assert.match(dashboardSource, /dashboard-loopy-suggestion/, 'Loopy 首页缺少建议问题入口')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-composer"/, 'Loopy 首页缺少输入区')
  assert.match(dashboardSource, /loopy-page-session__meta/, 'Loopy 首页左栏未补充会话元信息')
  assert.match(dashboardSource, /buildDialogTitlePreview/, 'Loopy 首页未提供首条用户消息的即时标题预览')
  assert.match(dashboardSource, /class="[^"]*flex[^"]*h-full[^"]*min-h-0[^"]*w-full[^"]*min-w-0/, 'Loopy 首页根节点未占满 dashboard shell 可用宽高')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-session-list"[\s\S]*class="[^"]*p-2\.5[^"]*flex-1[^"]*min-h-0[^"]*overflow-y-auto/, 'Loopy 首页左栏未改成更紧凑内部滚动')
  assert.match(dashboardSource, /data-testid="dashboard-loopy-messages"[\s\S]*class="[^"]*px-3[^"]*py-3[^"]*flex-1[^"]*min-h-0[^"]*overflow-y-auto/, 'Loopy 首页右侧消息区未改成更紧凑内部滚动')
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
  const projectSettingsTabSource = await readFile(WORKSPACE_PROJECT_SETTINGS_TAB_FILE, 'utf8')
  const editorSource = await readFile(PROJECT_BASIC_SETTINGS_EDITOR_FILE, 'utf8')
  const composableSource = await readFile(PROJECT_SETTINGS_COMPOSABLE_FILE, 'utf8')
  const settingsPatchSource = await readFile(PROJECT_SETTINGS_PATCH_FILE, 'utf8')
  const draftPatchSource = await readFile(PROJECT_SETTINGS_DRAFT_PATCH_FILE, 'utf8')

  assert.match(projectSettingsTabSource, /<ProjectBasicSettingsEditor/, '工作区项目设置面板未复用公共基础设置组件')
  assert.match(editorSource, /项目标识/, '基础设置公共组件缺少项目标识配置区')
  assert.doesNotMatch(editorSource, /恢复默认生成/, '基础设置公共组件不应再展示恢复默认入口')
  assert.match(editorSource, /selectProjectSettingsDisplayIcon/, '基础设置公共组件缺少图标选择逻辑')
  assert.match(editorSource, /selectProjectSettingsDisplayAccent/, '基础设置公共组件缺少颜色选择逻辑')
  assert.match(editorSource, /type="color"/, '基础设置公共组件缺少自定义颜色取色器')
  assert.match(editorSource, /后续可扩展图标库 \/ emoji。/, '基础设置公共组件缺少图标扩展提示')
  assert.match(editorSource, /后续可继续扩展更多颜色。/, '基础设置公共组件缺少颜色扩展提示')
  assert.match(editorSource, /projectSettingsUsingCustomAccent \? projectSettingsCustomAccentValue : '未启用自定义色'/, '基础设置公共组件缺少自定义颜色状态展示')
  assert.match(editorSource, /data-testid="project-basic-settings-editor"/, '基础设置公共组件缺少稳定测试标识')
  assert.match(composableSource, /export function createProjectCommonFormFromProject/, '项目设置公共工具缺少表单初始化方法')
  assert.match(composableSource, /icon: project\.display\?\.icon \|\| ''/, '项目设置公共工具未读取项目图标配置')
  assert.match(composableSource, /accentColor: project\.display\?\.accentColor \|\| ''/, '项目设置公共工具未读取项目强调色配置')
  assert.match(composableSource, /export function buildProjectSettingsCommonPatch/, '项目设置公共工具缺少通用 patch 构造方法')
  assert.match(composableSource, /icon: form\.icon\.trim\(\)/, '项目设置公共工具未提交图标字段')
  assert.match(composableSource, /accentColor: form\.accentColor\.trim\(\)/, '项目设置公共工具未提交强调色字段')
  assert.match(workspaceSource, /buildProjectSettingsCommonPatch\(projectSettingsCommon\)/, '项目工作区未复用公共 patch 构造')
  assert.match(workspaceSource, /Message\.success\('项目设置已保存。'\)/, '项目工作区手动保存后未触发全局成功消息')
  assert.match(settingsPatchSource, /icon\?: string/, 'settings patch API 缺少 icon 字段')
  assert.match(settingsPatchSource, /accentColor\?: string/, 'settings patch API 缺少 accentColor 字段')
  assert.match(draftPatchSource, /icon: normalizePlainText\(source\.icon\)/, '草稿 patch API 未处理 icon 字段')
  assert.match(draftPatchSource, /accentColor: normalizePlainText\(source\.accentColor\)/, '草稿 patch API 未处理 accentColor 字段')
})

it('项目工作区头像菜单已迁移到左下角 rail，头部改为 AI 按钮入口', async () => {
  const [workspaceSource, headerSource, leftRailSource, userRailMenuSource, aiToggleSource, panelSource, avatarSource, dialogSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_HEADER_FILE, 'utf8'),
    readFile(WORKSPACE_LEFT_RAIL_FILE, 'utf8'),
    readFile(WORKSPACE_USER_RAIL_MENU_FILE, 'utf8'),
    readFile(WORKSPACE_AI_TOGGLE_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
    readFile(UNIFIED_AVATAR_FILE, 'utf8'),
    readFile(USER_SETTINGS_DIALOG_FILE, 'utf8'),
  ])

  assert.match(avatarSource, /resolveAvatarFallbackValue/, '统一头像组件未复用统一 fallback 逻辑')
  assert.match(avatarSource, /size\?: number/, '统一头像组件缺少 size 入参')
  assert.match(avatarSource, /class="unified-avatar"/, '统一头像组件缺少稳定根节点类名')

  assert.match(leftRailSource, /<WorkspaceUserRailMenu/, 'WorkspaceLeftRail 未挂载头像菜单组件')
  assert.match(leftRailSource, /workspace-left-rail__footer-divider/, 'WorkspaceLeftRail 未在设置与头像菜单之间添加分割线')
  assert.match(userRailMenuSource, /switchWorkspace: \[workspaceId: string\]/, '左下角头像菜单未声明空间切换事件')
  assert.match(userRailMenuSource, /openAccountCenter: \[\]/, '左下角头像菜单未声明账号中心事件')
  assert.match(userRailMenuSource, /data-testid="workspace-left-rail-user-trigger"/, '左下角头像菜单缺少头像触发器测试锚点')
  assert.match(userRailMenuSource, /data-testid="workspace-left-rail-user-popover"/, '左下角头像菜单缺少 popover 测试锚点')
  assert.match(userRailMenuSource, /data-testid="workspace-left-rail-user-workspace-item"/, '左下角头像菜单缺少空间切换项测试锚点')
  assert.match(userRailMenuSource, /data-testid="workspace-left-rail-user-action-display-preferences"/, '左下角头像菜单缺少显示偏好快捷操作锚点')
  assert.match(userRailMenuSource, /data-testid="workspace-left-rail-user-action-account-center"/, '左下角头像菜单缺少账号中心快捷操作锚点')
  assert.match(userRailMenuSource, /<Teleport to="body">[\s\S]*data-testid="workspace-left-rail-user-popover"/, '左下角头像菜单浮层未通过 Teleport 挂到 body')
  assert.match(userRailMenuSource, /background: #ffffff;/, '左下角头像菜单浮层仍使用半透明背景，容易与内容叠色')
  assert.match(userRailMenuSource, /\.workspace-user-rail-menu \{[\s\S]*z-index: 200;/, '左下角头像菜单根层级不足，仍可能被 rail aside 遮挡')
  assert.match(userRailMenuSource, /\.workspace-user-rail-menu__popover \{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*4000;/, '左下角头像菜单浮层未提升为固定定位顶层弹层')
  assert.match(userRailMenuSource, /<UnifiedAvatar/, '左下角头像菜单未复用统一头像组件')
  assert.match(userRailMenuSource, /快速切换空间/, '左下角头像菜单未展示空间切换区块')
  assert.match(userRailMenuSource, /workspaceCanManageMembers\?: boolean/, '左下角头像菜单缺少成员管理权限入参')

  assert.match(headerSource, /<WorkspaceAiToggleButton/, 'WorkspaceHeader 未将原头像位替换为独立 AI 按钮组件')
  assert.match(headerSource, /aiCollapsed\?: boolean/, 'WorkspaceHeader 缺少 AI 收起态入参')
  assert.match(headerSource, /\(event: 'toggleAiSidebar'\): void/, 'WorkspaceHeader 缺少 AI 切换事件')
  assert.match(headerSource, /终审工作台/, 'WorkspaceHeader 未将终审并入工作台 tabs')
  assert.doesNotMatch(headerSource, /\(event: 'finalReview'\): void/, 'WorkspaceHeader 仍保留旧的独立终审事件')
  assert.doesNotMatch(headerSource, /workspace-header-user-trigger/, 'WorkspaceHeader 仍保留旧头像触发器')
  assert.match(aiToggleSource, /data-testid="workspace-header-ai-toggle"/, '独立 AI 按钮组件缺少测试锚点')

  assert.match(panelSource, /openDisplayPreferencesSignal\?: number/, 'WorkspaceMainPanel 缺少显示偏好 signal 入参')
  assert.match(panelSource, /watch\(\(\) => props\.openDisplayPreferencesSignal, \(next, previous\) => \{[\s\S]*ensureFixedTabOpen\('settings', true\)[\s\S]*selectSettingsSecondaryTab\('myDisplay'\)/, 'WorkspaceMainPanel 未把显示偏好 signal 定向到个人设置 tab')

  assert.match(workspaceSource, /:workspace-options="workspaceOptions"/, '项目工作区未向左下角头像菜单透传工作区列表')
  assert.match(workspaceSource, /:workspace-can-manage-members="workspaceCanManageMembers"/, '项目工作区未向左下角头像菜单透传成员管理权限')
  assert.match(workspaceSource, /@switch-workspace="switchWorkspaceFromHeader"/, '项目工作区未接住左下角头像菜单的空间切换事件')
  assert.match(workspaceSource, /@open-display-preferences="openDisplayPreferencesFromHeader"/, '项目工作区未接住左下角头像菜单的显示偏好事件')
  assert.match(workspaceSource, /@open-account-center="openAccountCenterFromHeader"/, '项目工作区未接住左下角头像菜单的账号中心事件')
  assert.match(workspaceSource, /const headerAiCollapsed = computed\(\(\) => \{[\s\S]*workbenchMode\.value === 'final_review'[\s\S]*!finalReviewAssistantOpen\.value[\s\S]*rightSidebarCollapsed\.value/, '项目工作区未根据工作台模式计算头部 AI 收起态')
  assert.match(workspaceSource, /:ai-collapsed="headerAiCollapsed"/, '项目工作区未向 WorkspaceHeader 透传头部 AI 收起态')
  assert.match(workspaceSource, /@toggle-ai-sidebar="toggleRightSidebar"/, '项目工作区未将头部 AI 按钮接入右栏切换逻辑')
  assert.doesNotMatch(workspaceSource, /@final-review="openFinalReviewFromHeader"/, '项目工作区仍在使用旧的独立终审头部事件')
  assert.match(workspaceSource, /:open-display-preferences-signal="openDisplayPreferencesSignal"/, '项目工作区未向主面板透传显示偏好 signal')
  assert.match(workspaceSource, /<UserSettingsDialog/, '项目工作区未挂载共享账号中心弹窗')
  assert.match(workspaceSource, /v-model:visible="accountCenterVisible"/, '项目工作区账号中心弹窗未绑定显示状态')
  assert.match(workspaceSource, /:active-workspace-id="activeWorkspaceId"/, '项目工作区账号中心弹窗未透传当前工作区')
  assert.match(workspaceSource, /@workspace-updated="onWorkspaceUpdatedFromAccountCenter"/, '项目工作区未处理账号中心的工作区更新事件')
  assert.match(workspaceSource, /@user-updated="onUserUpdatedFromAccountCenter"/, '项目工作区未处理账号中心的用户更新事件')
  assert.match(dialogSource, /type UserSettingsTabId = 'profile' \| 'displayPreferences'/, '账号中心弹窗定义异常，无法复用现有个人设置能力')
})

it('项目工作区头部 MetaK 已替代伪搜索框，并接入命令面板弹层', async () => {
  const [workspaceSource, headerSource, metaKSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_HEADER_FILE, 'utf8'),
    readFile(WORKSPACE_METAK_FILE, 'utf8'),
  ])

  assert.match(headerSource, /\(event: 'openMetaK'\): void/, 'WorkspaceHeader 未声明打开 MetaK 事件')
  assert.match(headerSource, /metaKShortcutLabel\?: string/, 'WorkspaceHeader 缺少 MetaK 快捷键标签入参')
  assert.match(headerSource, /data-testid="workspace-header-metak-trigger"/, 'WorkspaceHeader 缺少 MetaK 触发器测试锚点')
  assert.match(headerSource, /搜索命令、资源、会议或项目/, 'WorkspaceHeader 未更新为真实 MetaK 文案')
  assert.doesNotMatch(headerSource, /update:modelValue/, 'WorkspaceHeader 仍保留旧的输入型 v-model 搜索链路')

  assert.match(workspaceSource, /:meta-k-shortcut-label="metaKShortcutLabel"/, '项目工作区未向 WorkspaceHeader 透传 MetaK 快捷键标签')
  assert.match(workspaceSource, /@open-meta-k="openMetaK"/, '项目工作区未接住顶部 MetaK 打开事件')
  assert.match(workspaceSource, /<WorkspaceMetaK/, '项目工作区未挂载 MetaK 命令面板')
  assert.match(workspaceSource, /:visible="metaKOpen"/, 'MetaK 面板未绑定显示状态')
  assert.match(workspaceSource, /@execute="executeMetaKItem"/, 'MetaK 面板未接入执行分发逻辑')
  assert.doesNotMatch(workspaceSource, /v-model="headerSearch"/, '项目工作区仍在通过头部搜索框直接驱动 contest filter')
  assert.doesNotMatch(workspaceSource, /filteredContests/, '项目工作区仍保留旧的头部竞赛过滤结果')

  assert.match(metaKSource, /data-testid="workspace-metak"/, 'WorkspaceMetaK 缺少稳定根锚点')
  assert.match(metaKSource, /data-testid="workspace-metak-search-input"/, 'WorkspaceMetaK 缺少搜索输入锚点')
  assert.match(metaKSource, /data-testid="workspace-metak-item"/, 'WorkspaceMetaK 缺少结果项锚点')
})

it('项目主面板在无标签页时隐藏上方 chrome，并改成全幅默认仪表盘空态', async () => {
  const [source, chromeSource, tabStripSource, uiContextMenuSource, emptyStateSource, workspaceSource, workspaceShellSource] = await Promise.all([
    readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_CHROME_FILE, 'utf8'),
    readFile(WORKSPACE_TAB_STRIP_FILE, 'utf8'),
    readFile(UI_CONTEXT_MENU_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_EMPTY_STATE_FILE, 'utf8'),
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_SHELL_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(source, /const \{[\s\S]*hasOpenTabs,[\s\S]*\} = useWorkspaceMainTabs\(/, '项目主面板未复用 composable 暴露的标签页存在状态')
  assert.doesNotMatch(source, /data-testid="workspace-close-all-tabs-button"/, '项目主面板仍保留显式的关闭全部标签按钮')
  assert.match(source, /<div[\s\S]*v-if="hasOpenTabs"[\s\S]*class="workspace-main-tab-strip-shell border-b border-slate-200 bg-white flex[\s\S]*items-center relative"/, '无标签页时顶部标签条仍未隐藏')
  assert.match(tabStripSource, /workspace-main-tab-scroll/, '顶部标签条缺少独立横向滚动容器')
  assert.match(chromeSource, /workspace-main-breadcrumb__scroll/, '面包屑横条缺少独立横向滚动容器')
  assert.match(tabStripSource, /workspace-main-tab-list/, '顶部标签条未为新增\/删除提供轻量过渡组')
  assert.match(tabStripSource, /name="workspace-main-tab-list"/, '顶部标签条未恢复历史 TransitionGroup 命名')
  assert.match(tabStripSource, /workspace-main-tab-list-enter-active/, '顶部标签条缺少进入离开动效')
  assert.match(tabStripSource, /workspace-main-tab-list-move/, '顶部标签条缺少 reorder move 动效')
  assert.match(tabStripSource, /workspace-main-tab--active::after/, '顶部标签条选中态缺少轻量高亮动效')
  assert.match(tabStripSource, /workspace-main-tab__trigger/, '顶部标签条未恢复 trigger 间距承载')
  assert.match(tabStripSource, /workspace-main-tab__close-icon/, '顶部标签条未恢复 close icon 尺寸承载')
  assert.match(tabStripSource, /workspace-main-tab-strip-height/, '顶部标签条未提供可压缩高度变量')
  assert.match(tabStripSource, /scrollbar-width: none;/, '顶部标签条横向滚动仍会暴露滚动条')
  assert.match(chromeSource, /workspace-main-breadcrumb\s*\{[\s\S]*workspace-main-breadcrumb-padding-x/, 'breadcrumb 未恢复横向间距变量接入')
  assert.match(chromeSource, /workspace-main-breadcrumb\s*\{[\s\S]*workspace-main-breadcrumb-padding-y/, 'breadcrumb 未恢复纵向间距变量接入')
  assert.match(uiContextMenuSource, /class="wl-context-menu"/, '统一右键菜单 primitive 缺少根样式类')
  assert.match(uiContextMenuSource, /fallbackPlacements: \['top-start', 'bottom-end', 'top-end'\]/, '统一右键菜单缺少边缘翻转策略')
  assert.match(uiContextMenuSource, /document\.addEventListener\('pointerdown', onDocumentPointerDown\)/, '统一右键菜单缺少外部点击关闭')
  assert.match(source, /v-if="hasOpenTabs"[\s\S]*breadcrumbItems/, '无标签页时面包屑横条仍未隐藏')
  assert.doesNotMatch(source, />\s*打开仪表盘\s*</, '顶部旧的打开仪表盘入口仍残留在主面板 chrome')
  assert.match(emptyStateSource, /workspace-main-empty-state/, '无标签页时未渲染新的全幅空态')
  assert.match(emptyStateSource, /<WinLoopTextLogo\b/, '无标签页空态未接入独立 TextLogo 组件')
  assert.doesNotMatch(emptyStateSource, /workspace-main-empty-state__watermark/, '无标签页空态仍保留旧水印结构')
  assert.doesNotMatch(emptyStateSource, /workspace-main-empty-state__card/, '无标签页空态仍保留旧卡片容器')
  assert.doesNotMatch(emptyStateSource, /workspace-main-empty-state__button/, '无标签页空态仍保留旧按钮')
  assert.doesNotMatch(emptyStateSource, /打开默认仪表盘/, '无标签页空态仍保留默认仪表盘 CTA')
  assert.doesNotMatch(emptyStateSource, /从默认仪表盘继续当前项目/, '无标签页空态仍保留旧标题文案')
  assert.match(workspaceShellSource, /if \(normalized\.mainTabs\.length === 0\)\s+query\.tabs = ''/, '项目页未把“无标签页”状态同步到路由视图状态')
  assert.match(workspaceSource, /const openMainTabs = ref<WorkspaceMainTabId\[\]>\(\[\]\)/, '项目页 openMainTabs 初始状态仍会自动补 dashboard')
  assert.match(workspaceSource, /const activeMainTabId = ref<WorkspaceMainTabId \| ''>\(''\)/, '项目页 activeMainTabId 初始状态仍会自动补 dashboard')
  assert.match(workspaceSource, /openMainTabs\.value = nextOpenTabs/, '项目页资源清理后仍会在无标签页时补回 dashboard')
  assert.match(workspaceSource, /activeMainTabId\.value = openMainTabs\.value\[0\] \|\| ''/, '项目页无标签页时仍未将激活标签清空')
  assert.match(workspaceSource, /function handleWorkspaceGlobalKeydown\(event: KeyboardEvent\): void/, '项目页未合并工作区全局快捷键处理器')
  assert.match(workspaceSource, /function handleWorkspaceShellContextMenu\(event: MouseEvent\): void/, '项目页缺少工作区空白区右键兜底菜单')
  assert.match(workspaceSource, /function buildEditableContextMenuItems\(context: WorkspaceEditableContext\): ContextMenuItem\[\]/, '项目页未为可编辑区域构建专用右键菜单')
  assert.match(workspaceSource, /formatWorkspaceShortcutLabel\(/, '项目页未复用统一快捷键格式化工具')
  assert.match(workspaceSource, /<UiContextMenu[\s\S]*@select="handleWorkspaceContextMenuSelect"/, '项目页未将统一右键菜单挂到页面层')
})

it('项目工作区视图状态同步包含打开中的 AI 会话 tabs 列表', async () => {
  const [workspaceSource, workspaceShellSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_SHELL_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /openChatSessionIds,/, '项目页未持有打开中的 AI 会话 tabs 状态')
  assert.match(workspaceSource, /useWorkspaceProjectViewState\(\{[\s\S]*openChatSessionIds,[\s\S]*activeChatSessionId,[\s\S]*\}\)/, '项目页未将打开中的 AI 会话 tabs 状态接入视图状态同步 composable')
  assert.match(workspaceShellSource, /openChatSessionIds: Ref<string\[\]>/, '工作区视图状态 composable 缺少打开中的 AI 会话 tabs 入参')
  assert.match(workspaceShellSource, /openChatSessionIds: \[\],\s+activeChatSessionId: ''/, '默认工作区视图状态未初始化 AI 会话 tabs 列表')
  assert.match(workspaceShellSource, /function normalizeOpenChatSessionIds\(value: unknown\): string\[\]/, '工作区视图状态 composable 缺少 AI 会话 tabs 列表归一化逻辑')
  assert.match(workspaceShellSource, /const openChatSessionIds = normalizeOpenChatSessionIds\(source\.openChatSessionIds\)/, '工作区视图状态未归一化打开中的 AI 会话 tabs 列表')
  assert.match(workspaceShellSource, /if \(activeChatSessionId && !openChatSessionIds\.includes\(activeChatSessionId\)\)\s+openChatSessionIds\.push\(activeChatSessionId\)/, '工作区视图状态未确保激活会话属于打开中的 tabs 列表')
  assert.match(workspaceShellSource, /query\.sessions = normalized\.openChatSessionIds\.join\(','\)/, '工作区路由 query 未同步打开中的 AI 会话 tabs 列表')
  assert.match(workspaceShellSource, /openChatSessionIds: normalizeOpenChatSessionIds\(chatSessionItems\)/, '工作区路由 query 未恢复打开中的 AI 会话 tabs 列表')
  assert.match(workspaceShellSource, /options\.openChatSessionIds\.value = \[\.\.\.normalized\.openChatSessionIds\]/, '工作区视图状态 hydration 未回填打开中的 AI 会话 tabs 列表')
})

it('项目仪表盘移除本地 mock 分析数据，并接入准备态与真实规则加载链路', async () => {
  const [workspaceSource, panelSource, dashboardTabSource, statusBarSource, loadingOverlaySource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
    readFile(WORKSPACE_DASHBOARD_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_STATUS_BAR_FILE, 'utf8'),
    readFile(WORKSPACE_LOADING_OVERLAY_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /const selectedContestDetail = ref<ContestDetailPayload \| null>\(null\)/, '项目页缺少竞赛详情真实数据容器')
  assert.match(workspaceSource, /const selectedTrackRubric = computed\(\(\) => \{/, '项目页未根据竞赛详情解析当前赛道规则')
  assert.match(workspaceSource, /async function loadSelectedContestDetail\(contestId = selectedContestId\.value\)/, '项目页缺少竞赛详情加载方法')
  assert.match(workspaceSource, /const workspaceBootstrapLoading = ref\(false\)/, '项目页缺少工作区首屏准备态标记')
  assert.match(workspaceSource, /const workspacePreparing = computed\(\(\) => \{/, '项目页缺少工作区准备态计算')
  assert.match(workspaceSource, /const workspaceShellLoading = computed\(\(\) => \{/, '项目页缺少工作区首屏渲染门禁')
  assert.match(workspaceSource, /:mapping-loading="selectedContestDetailLoading"/, '项目页未向主面板透传规则加载态')
  assert.match(workspaceSource, /:workspace-preparing="workspacePreparing"/, '项目页未向主面板透传准备态')
  assert.match(workspaceSource, /:upload-summary="projectUploadSummary"/, '项目页未向左侧 aside 透传上传摘要')
  assert.match(workspaceSource, /:upload-drawer-open="uploadDrawerOpen"/, '项目页未向左侧 aside 透传上传抽屉状态')
  assert.match(workspaceSource, /@toggle-upload-drawer="openUploadDrawer"/, '项目页未将左侧上传入口接入抽屉切换逻辑')
  assert.doesNotMatch(statusBarSource, /<button[\s\S]*class="workspace-upload-tray"/, 'WorkspaceStatusBar 仍保留底部上传入口')
  assert.doesNotMatch(statusBarSource, /<section[\s\S]*class="workspace-upload-drawer"/, 'WorkspaceStatusBar 仍保留底部上传抽屉')
  assert.match(workspaceSource, /:topic-board-fetching="topicBoardFetching"/, '项目页未向主面板透传选题板拉取态')
  assert.match(workspaceSource, /<WorkspaceShellLoadingOverlay[\s\S]*v-if="workspaceShellLoading"/, '项目页缺少独立工作区加载遮罩')
  assert.match(loadingOverlaySource, /label: 'WinLoop 工作区加载中'/, '工作区加载遮罩缺少默认文案')
  assert.match(loadingOverlaySource, /z-index:\s*520/, '工作区加载遮罩层级不足，仍会露出角落控件')
  assert.match(loadingOverlaySource, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.64\)/, '工作区加载遮罩未保留半透明覆盖层')
  assert.doesNotMatch(loadingOverlaySource, /workspace-shell-loading-overlay__panel/, '工作区加载遮罩仍保留卡片式容器')
  assert.doesNotMatch(workspaceSource, /workspace-preparing-overlay__label">正在准备工作区</, '项目页仍保留旧的覆盖层准备态文案')
  assert.doesNotMatch(workspaceSource, /workspace-preparing-overlay__title">WinLooooop</, '项目页仍保留旧的覆盖层标题')
  assert.doesNotMatch(workspaceSource, /defaultAssistantGreeting/, '项目页仍保留右栏默认欢迎语 mock')
  assert.doesNotMatch(workspaceSource, /clamp\(35 \+ innovationCount \* 12 \+ routeCount \* 6, 10, 98\)/, '项目页仍在本地拼装核心指标 mock 分数')
  assert.doesNotMatch(workspaceSource, /return \[30, 45, 68, 82, last\]/, '项目页仍在本地拼装趋势柱状图 mock 数据')

  assert.match(panelSource, /workspacePreparing\?: boolean/, '主面板缺少工作区准备态入参')
  assert.match(panelSource, /mappingLoading\?: boolean/, '主面板缺少规则加载态入参')
  assert.match(panelSource, /topicBoardFetching\?: boolean/, '主面板缺少选题板拉取态入参')
  assert.match(dashboardTabSource, /title: '查看核心指标要求'/, '仪表盘仍在使用旧的“完成对标”假完成文案')
  assert.match(dashboardTabSource, /等待赛道评分规则返回。/, '仪表盘缺少真实规则等待文案')
  assert.match(dashboardTabSource, /暂无赛道评分规则，待竞赛详情返回后展示真实指标要求。/, '仪表盘缺少真实规则空态')
  assert.match(dashboardTabSource, /\{\{\s*row\.scoreLabel\s*\}\}/, '仪表盘未展示真实规则权重标签')
  assert.match(dashboardTabSource, /\{\{\s*row\.supportingNote\s*\}\}/, '仪表盘未展示真实证据要求')
  assert.doesNotMatch(dashboardTabSource, /toneMeta\[row\.tone\]/, '仪表盘仍依赖 mock toneMeta 渲染指标状态')
  assert.doesNotMatch(dashboardTabSource, /\{\{\s*word\.label\s*\}\}\s*\(\{\{\s*word\.count\s*\}\}\)/, '仪表盘仍强制展示词云 mock 计数')

  assert.match(statusBarSource, /line\?: number \| null/, '状态栏未允许行号为空')
  assert.match(statusBarSource, /column\?: number \| null/, '状态栏未允许列号为空')
  assert.match(statusBarSource, /v-if="normalizedCursorLine !== null && normalizedCursorColumn !== null"/, '状态栏仍在无真实光标时展示伪行列值')
})

it('项目页按真实 AI 配置态禁用功能，并将底部运行状态收口到右下角', async () => {
  const [workspaceSource, statusBarSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_STATUS_BAR_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /const aiRuntimeStatusLoaded = ref\(false\)/, '项目页缺少 AI 配置态加载标记')
  assert.match(workspaceSource, /async function loadAiRuntimeStatus\(\): Promise<void> \{/, '项目页缺少 AI 配置态加载方法')
  assert.match(workspaceSource, /endpoint\('\/user\/ai\/runtime'\)/, '项目页未请求用户侧 AI 运行时状态接口')
  assert.match(workspaceSource, /function ensureAiFeatureAvailable\(key: ProjectWorkspaceAiFeatureKey, message = ''\): boolean \{/, '项目页缺少 AI 可用性前置拦截')
  assert.match(workspaceSource, /if \(!ensureAiFeatureAvailable\('contestFilter'\)\)\s+return/, '赛事筛选入口未前置拦截未配置态')
  assert.match(workspaceSource, /if \(!ensureAiFeatureAvailable\('topicProposal'\)\)\s+return/, '选题板入口未前置拦截未配置态')
  assert.match(workspaceSource, /const DOCUMENT_ASSIST_FEATURE_KEY_MAP: Record<AiWorkspaceDocumentAction, DocumentAssistFeatureKey> = \{/, '项目页缺少文档动作到 AI feature 的映射表')
  assert.match(workspaceSource, /const documentAssistActionStatusMap = computed<Record<AiWorkspaceDocumentAction, AiRuntimeFeatureStatus>>\(\(\) => \{/, '项目页缺少文档动作级运行时状态计算')
  assert.match(workspaceSource, /if \(aiMode\.value === 'document_assist'\) \{[\s\S]*documentAssistRequestState\.resourceId = activeMarkdownResourceId\.value[\s\S]*documentAssistRequestState\.markdown = getActiveMarkdownMirror\(\)[\s\S]*\}/, '项目页未在 AgentDoc 发送前同步当前文档上下文')
  assert.match(workspaceSource, /assistantMetadata = result\.documentDraft\s*\?\s*\{\s*agentDocDraft: result\.documentDraft\s*\}\s*:\s*undefined/, '项目页未把 AgentDoc 草案写入消息元数据')
  assert.match(workspaceSource, /statusLine\.value = result\.documentDraft[\s\S]*\? 'AgentDoc 已生成待确认的文档草案。'[\s\S]*: 'AgentDoc 已完成，本次未生成可安全应用的文档草案。'/, '项目页未按 AgentDoc 草案结果更新完成态文案')
  assert.doesNotMatch(workspaceSource, /function buildDocumentAssistUserPrompt\(action: AiWorkspaceDocumentAction, extraInstruction = ''\): string \{/, '项目页仍保留旧的文档动作提示词拼装逻辑')
  assert.doesNotMatch(workspaceSource, /submitDocumentAssistFromComposer/, '项目页仍保留旧的文档动作发送分支')
  assert.match(workspaceSource, /if \(!ensureAiFeatureAvailable\('defense'\)\)\s+return/, '答辩 AI 入口未前置拦截未配置态')
  assert.match(workspaceSource, /:ai-model-label="currentAiModelLabel"/, '项目页未向状态栏透传当前模式模型状态')
  assert.match(workspaceSource, /:ai-status-label="aiStatusLabel"/, '项目页未向状态栏透传真实 AI 状态文案')
  assert.match(workspaceSource, /:ai-status-tone="aiStatusTone"/, '项目页未向状态栏透传真实 AI 状态色调')
  assert.match(workspaceSource, /:ai-credits-used="aiCreditsUsed"/, '项目页未向状态栏透传 AI 已用 credits')
  assert.match(workspaceSource, /:ai-credits-total="aiCreditsTotal"/, '项目页未向状态栏透传 AI 总 credits')
  assert.match(workspaceSource, /:ai-credits-remaining="aiCreditsRemaining"/, '项目页未向状态栏透传 AI 剩余 credits')
  assert.match(workspaceSource, /:ai-billing-label="aiBillingLabel"/, '项目页未向状态栏透传 AI 计费说明')

  assert.match(statusBarSource, /aiStatusLabel\?: string/, '状态栏缺少 AI 状态文案入参')
  assert.match(statusBarSource, /aiStatusTone\?: 'ready' \| 'running' \| 'missing' \| 'checking' \| 'error'/, '状态栏缺少 AI 状态色调入参')
  assert.match(statusBarSource, /workspace-status-ai/, '状态栏缺少统一 AI 状态样式')
  assert.match(statusBarSource, /<span>Space: 4<\/span>[\s\S]*workspace-status-ai/, '状态栏未将 AI 状态项放到右下角尾部')
  assert.match(statusBarSource, /workspace-status-ai-anchor/, '状态栏缺少 AI 状态悬浮入口')
  assert.match(statusBarSource, /workspace-status-ai__tooltip/, '状态栏缺少 AI 状态悬浮详情')
  assert.match(statusBarSource, /当前状态/, '状态栏悬浮详情缺少当前状态')
  assert.match(statusBarSource, /使用模型/, '状态栏悬浮详情缺少模型信息')
  assert.match(statusBarSource, /剩余 credits/, '状态栏悬浮详情缺少剩余 credits')
  assert.doesNotMatch(statusBarSource, /<span>模型: \{\{ aiModelLabel \}\}<\/span>/, '状态栏左侧仍单独展示模型信息')
  assert.doesNotMatch(statusBarSource, /Token: \{\{ tokenBalance\.toLocaleString\('zh-CN'\) \}\}/, '状态栏左侧仍保留旧 Token 文案')
  assert.doesNotMatch(statusBarSource, /<span>AI运行状态<\/span>/, '状态栏左侧仍保留固定 AI 运行状态文案')
  assert.doesNotMatch(statusBarSource, /Analysis Ready|AI Working/, '状态栏右侧仍保留旧的英文假状态文案')
})

it('team 创建弹窗复用基础设置编辑器，并支持仅创建与复选框竞赛列表', async () => {
  const teamSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const dialogSource = await readFile(TEAM_CREATE_PROJECT_DIALOG_FILE, 'utf8')
  const quickCreateSource = await readFile(PROJECT_QUICK_CREATE_FILE, 'utf8')
  const platformStoreSource = await readFile(PLATFORM_STORE_FILE, 'utf8')

  assert.match(teamSource, /const createForm = reactive<WorkspaceProjectCommonForm & \{/, 'Team 页创建表单未复用 WorkspaceProjectCommonForm 基础结构')
  assert.match(teamSource, /contestIds: string\[\]/, 'Team 页创建表单缺少竞赛勾选字段')
  assert.match(teamSource, /topicBoardSeed: ProjectTopicBoardCreateSeed/, 'Team 页创建表单缺少选题板草稿字段')
  assert.match(teamSource, /\.\.\.createEmptyProjectCommonForm\(\)/, 'Team 页创建表单未复用通用空表单初始化')
  assert.match(teamSource, /const createDialogTitle = computed\(\(\) => \{[\s\S]*在「\$\{activeWorkspaceName\.value\}」团队创建项目[\s\S]*在「\$\{activeWorkspaceName\.value\}」项目台创建项目/, 'Team 页未基于当前工作区动态计算创建标题')
  assert.match(teamSource, /const createDialogHelperText = computed\(\(\) => \{/, 'Team 页缺少创建弹窗辅助文案')
  assert.doesNotMatch(teamSource, /dialog-title="在当前 Team 创建项目"/, 'Team 页仍在使用旧的静态创建标题')
  assert.match(teamSource, /Message\.success\('项目已创建。'\)/, '仅创建成功后缺少原地成功反馈')
  assert.match(teamSource, /icon: icon \|\| undefined/, 'quick create 前端未提交 icon 字段')
  assert.match(teamSource, /accentColor: accentColor \|\| undefined/, 'quick create 前端未提交 accentColor 字段')

  assert.match(dialogSource, /<ProjectBasicSettingsEditor/, 'Team 创建弹窗未复用基础设置编辑器')
  assert.match(dialogSource, /title-input-test-id="team-create-project-title-input"/, 'Team 创建弹窗未透传标题输入测试标识')
  assert.match(dialogSource, /summary-input-test-id="team-create-project-summary-input"/, 'Team 创建弹窗未透传简介输入测试标识')
  assert.match(dialogSource, /data-testid="team-create-project-stay-submit-button"/, 'Team 创建弹窗缺少仅创建按钮')
  assert.match(dialogSource, /创建并进入研发工作台/, 'Team 创建弹窗缺少进入工作区按钮')
  assert.match(dialogSource, /暂无竞赛可选，可稍后在项目设置中补充。/, 'Team 创建弹窗缺少竞赛空态提示')
  assert.match(dialogSource, /type="checkbox"/, 'Team 创建弹窗未改为复选框竞赛列表')
  assert.doesNotMatch(dialogSource, /selectedOptions/, 'Team 创建弹窗仍残留原生多选 select 逻辑')
  assert.doesNotMatch(dialogSource, /multiple/, 'Team 创建弹窗仍在使用原生 multiple select')

  assert.match(quickCreateSource, /icon\?: string/, 'quick create API 缺少 icon 入参')
  assert.match(quickCreateSource, /accentColor\?: string/, 'quick create API 缺少 accentColor 入参')
  assert.match(quickCreateSource, /const display = normalizeProjectDisplayConfig\(\{/, 'quick create API 未归一化 display 配置')
  assert.match(quickCreateSource, /display,/, 'quick create API 未向创建链路透传 display')

  assert.match(platformStoreSource, /display\?: ProjectDisplayConfig \| null/, '项目创建存储输入缺少 display 字段')
  assert.match(platformStoreSource, /const metadata = display \? \{ display \} : \{\}/, '项目创建存储未生成 metadata.display')
  assert.match(platformStoreSource, /JSON\.stringify\(metadata\)/, '项目创建存储未写入 metadata JSON')
})
