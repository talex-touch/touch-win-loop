import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const WORKSPACE_TAB_STRIP_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceTabStrip.vue')
const WORKSPACE_MEMBERS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMembersTab.vue')
const WORKSPACE_PROJECT_SETTINGS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceProjectSettingsTab.vue')
const WORKSPACE_RESOURCE_PREVIEW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourcePreviewTab.vue')
const WORKSPACE_MAIN_PANEL_CHROME_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelChrome.vue')
const WORKSPACE_MAIN_PANEL_EMPTY_STATE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelEmptyState.vue')
const WORKSPACE_DASHBOARD_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDashboardTab.vue')
const WORKSPACE_FLOW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFlowTab.vue')
const WORKSPACE_MAIN_TABS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceMainTabs.ts')
const UI_CONTEXT_MENU_FILE = resolve(process.cwd(), 'app/components/ui/UiContextMenu.vue')
const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')

it('workspaceMainPanel 已将标签条、成员、设置、预览视图拆成独立组件', async () => {
  const [
    mainPanelSource,
    tabStripSource,
    membersTabSource,
    projectSettingsTabSource,
    resourcePreviewTabSource,
    mainPanelChromeSource,
    mainPanelEmptyStateSource,
    dashboardTabSource,
    flowTabSource,
    workspaceMainTabsComposableSource,
    uiContextMenuSource,
    workspaceSource,
  ] = await Promise.all([
    readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
    readFile(WORKSPACE_TAB_STRIP_FILE, 'utf8'),
    readFile(WORKSPACE_MEMBERS_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_SETTINGS_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_RESOURCE_PREVIEW_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_CHROME_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_EMPTY_STATE_FILE, 'utf8'),
    readFile(WORKSPACE_DASHBOARD_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_FLOW_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_TABS_COMPOSABLE_FILE, 'utf8'),
    readFile(UI_CONTEXT_MENU_FILE, 'utf8'),
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
  ])

  assert.match(mainPanelSource, /<WorkspaceMainPanelChrome\b/, 'WorkspaceMainPanel 未接入顶部 chrome 组件')
  assert.match(mainPanelSource, /<WorkspaceDashboardTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceDashboardTab')
  assert.match(mainPanelSource, /<WorkspaceFlowTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceFlowTab')
  assert.match(mainPanelSource, /<WorkspaceMembersTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceMembersTab')
  assert.match(mainPanelSource, /<WorkspaceProjectSettingsTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceProjectSettingsTab')
  assert.match(mainPanelSource, /<WorkspaceResourcePreviewTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceResourcePreviewTab')
  assert.match(mainPanelSource, /<WorkspaceMainPanelEmptyState\b/, 'WorkspaceMainPanel 未接入空态组件')
  assert.match(mainPanelSource, /useWorkspaceMainTabs/, 'WorkspaceMainPanel 未接入标签状态 composable')
  assert.doesNotMatch(mainPanelSource, /watch\(openTabs,\s*\(nextTabs\)\s*=>[\s\S]*deep:\s*true,\s*immediate:\s*true[\s\S]*emit\('update:openTabs'/, 'WorkspaceMainPanel 仍对 openTabs 做 deep watch 回写，可能导致路由回环')

  assert.doesNotMatch(mainPanelSource, /data-testid="project-member-list"/, 'WorkspaceMainPanel 仍内联成员列表')
  assert.doesNotMatch(mainPanelSource, /data-testid="project-collab-panel"/, 'WorkspaceMainPanel 仍内联成员管理面板')
  assert.doesNotMatch(mainPanelSource, /项目协作管理/, 'WorkspaceMainPanel 仍内联成员管理标题块')
  assert.doesNotMatch(mainPanelSource, /项目通用设置/, 'WorkspaceMainPanel 仍内联项目通用设置区')
  assert.doesNotMatch(mainPanelSource, /分享链接管理/, 'WorkspaceMainPanel 仍内联分享链接管理区')
  assert.doesNotMatch(mainPanelSource, /workspace-tab-context-menu__item/, 'WorkspaceMainPanel 仍保留 tab context menu 的内联样式实现')
  assert.match(mainPanelSource, /'requestContextMenu': \[payload: ContextMenuRequest\]|requestContextMenu: \[payload: ContextMenuRequest\]/, 'WorkspaceMainPanel 缺少统一右键菜单请求事件')
  assert.match(mainPanelSource, /emit\('requestContextMenu', \{[\s\S]*source: 'workspace-tab'/, 'WorkspaceMainPanel 未将标签页右键菜单上抛到页面层')

  assert.doesNotMatch(tabStripSource, /<WorkspaceTabContextMenu\b/, 'WorkspaceTabStrip 仍在直接渲染旧标签页右键菜单')
  assert.match(tabStripSource, /aria-haspopup="menu"/, 'WorkspaceTabStrip 缺少菜单触发器无障碍声明')
  assert.match(mainPanelChromeSource, /<WorkspaceTabStrip\b/, 'WorkspaceMainPanelChrome 未接入 WorkspaceTabStrip')
  assert.match(workspaceMainTabsComposableSource, /export function areWorkspaceMainTabIdListsEqual/, 'useWorkspaceMainTabs 缺少 openTabs id 级别的相等性守卫')
  assert.match(workspaceMainTabsComposableSource, /if \(areWorkspaceMainTabIdListsEqual\(currentTabIds, nextTabIds\)\)\s*return/, 'useWorkspaceMainTabs 未阻止相同 tab ids 的重复回写')
  assert.match(workspaceMainTabsComposableSource, /watch\(\(\) => openTabs\.value\.map\(tab => tab\.id\)/, 'useWorkspaceMainTabs 应仅按 tab id 回写 openTabs')
  assert.match(uiContextMenuSource, /role="menu"/, 'UiContextMenu 缺少 menu role')
  assert.match(uiContextMenuSource, /@keydown="onMenuKeydown"/, 'UiContextMenu 缺少键盘导航入口')
  assert.match(workspaceSource, /<UiContextMenu/, '项目工作区未挂载统一右键菜单 primitive')
  assert.match(workspaceSource, /@request-context-menu="openWorkspaceContextMenu\(\$event\)"/, '项目工作区未接住子组件菜单请求')
  assert.match(workspaceSource, /function handleWorkspaceGlobalKeydown\(event: KeyboardEvent\): void/, '项目工作区缺少统一全局快捷键处理器')
  assert.match(workspaceSource, /function handleWorkspaceShellContextMenu\(event: MouseEvent\): void/, '项目工作区缺少工作区空白区右键兜底处理器')
  assert.match(mainPanelEmptyStateSource, /<WinLoopTextLogo\b/, 'WorkspaceMainPanelEmptyState 未收敛为独立 TextLogo 组件')
  assert.doesNotMatch(mainPanelEmptyStateSource, /从默认仪表盘继续当前项目/, 'WorkspaceMainPanelEmptyState 仍保留旧空态文案')
  assert.match(membersTabSource, /data-testid="project-member-list"/, 'WorkspaceMembersTab 缺少成员列表承载')
  assert.match(dashboardTabSource, /关联比赛提交区/, 'WorkspaceDashboardTab 缺少 dashboard 视图承载')
  assert.match(flowTabSource, /暂未初始化流程画布/, 'WorkspaceFlowTab 缺少流程画布空态')
  assert.match(projectSettingsTabSource, /分享链接管理/, 'WorkspaceProjectSettingsTab 缺少分享链接管理视图')
  assert.match(resourcePreviewTabSource, /<RichTextEditor\b/, 'WorkspaceResourcePreviewTab 缺少协作文档视图承载')
})
