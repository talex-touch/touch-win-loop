import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const WORKSPACE_TAB_STRIP_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceTabStrip.vue')
const WORKSPACE_MEMBERS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMembersTab.vue')
const WORKSPACE_PROJECT_SETTINGS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceProjectSettingsTab.vue')
const WORKSPACE_RESOURCE_PREVIEW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourcePreviewTab.vue')
const WORKSPACE_TAB_CONTEXT_MENU_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceTabContextMenu.vue')
const WORKSPACE_MAIN_PANEL_CHROME_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelChrome.vue')
const WORKSPACE_MAIN_PANEL_EMPTY_STATE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelEmptyState.vue')
const WORKSPACE_DASHBOARD_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDashboardTab.vue')
const WORKSPACE_FLOW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFlowTab.vue')

it('WorkspaceMainPanel 已将标签条、成员、设置、预览视图拆成独立组件', async () => {
  const [
    mainPanelSource,
    tabStripSource,
    membersTabSource,
    projectSettingsTabSource,
    resourcePreviewTabSource,
    tabContextMenuSource,
    mainPanelChromeSource,
    mainPanelEmptyStateSource,
    dashboardTabSource,
    flowTabSource,
  ] = await Promise.all([
    readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
    readFile(WORKSPACE_TAB_STRIP_FILE, 'utf8'),
    readFile(WORKSPACE_MEMBERS_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_SETTINGS_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_RESOURCE_PREVIEW_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_TAB_CONTEXT_MENU_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_CHROME_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_EMPTY_STATE_FILE, 'utf8'),
    readFile(WORKSPACE_DASHBOARD_TAB_FILE, 'utf8'),
    readFile(WORKSPACE_FLOW_TAB_FILE, 'utf8'),
  ])

  assert.match(mainPanelSource, /<WorkspaceMainPanelChrome\b/, 'WorkspaceMainPanel 未接入顶部 chrome 组件')
  assert.match(mainPanelSource, /<WorkspaceDashboardTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceDashboardTab')
  assert.match(mainPanelSource, /<WorkspaceFlowTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceFlowTab')
  assert.match(mainPanelSource, /<WorkspaceMembersTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceMembersTab')
  assert.match(mainPanelSource, /<WorkspaceProjectSettingsTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceProjectSettingsTab')
  assert.match(mainPanelSource, /<WorkspaceResourcePreviewTab\b/, 'WorkspaceMainPanel 未接入 WorkspaceResourcePreviewTab')
  assert.match(mainPanelSource, /<WorkspaceMainPanelEmptyState\b/, 'WorkspaceMainPanel 未接入空态组件')

  assert.doesNotMatch(mainPanelSource, /data-testid="project-member-list"/, 'WorkspaceMainPanel 仍内联成员列表')
  assert.doesNotMatch(mainPanelSource, /data-testid="project-collab-panel"/, 'WorkspaceMainPanel 仍内联成员管理面板')
  assert.doesNotMatch(mainPanelSource, /项目协作管理/, 'WorkspaceMainPanel 仍内联成员管理标题块')
  assert.doesNotMatch(mainPanelSource, /项目通用设置/, 'WorkspaceMainPanel 仍内联项目通用设置区')
  assert.doesNotMatch(mainPanelSource, /分享链接管理/, 'WorkspaceMainPanel 仍内联分享链接管理区')
  assert.doesNotMatch(mainPanelSource, /workspace-tab-context-menu__item/, 'WorkspaceMainPanel 仍保留 tab context menu 的内联样式实现')

  assert.match(tabStripSource, /<WorkspaceTabContextMenu\b/, 'WorkspaceTabStrip 未接入 tab context menu 子组件')
  assert.match(tabContextMenuSource, /\.workspace-tab-context-menu/, 'WorkspaceTabContextMenu 缺少自身样式承载')
  assert.match(mainPanelChromeSource, /<WorkspaceTabStrip\b/, 'WorkspaceMainPanelChrome 未接入 WorkspaceTabStrip')
  assert.match(mainPanelEmptyStateSource, /当前没有打开的标签页/, 'WorkspaceMainPanelEmptyState 缺少空态文案')
  assert.match(membersTabSource, /data-testid="project-member-list"/, 'WorkspaceMembersTab 缺少成员列表承载')
  assert.match(dashboardTabSource, /关联比赛提交区/, 'WorkspaceDashboardTab 缺少 dashboard 视图承载')
  assert.match(flowTabSource, /暂未初始化流程画布/, 'WorkspaceFlowTab 缺少流程画布空态')
  assert.match(projectSettingsTabSource, /分享链接管理/, 'WorkspaceProjectSettingsTab 缺少分享链接管理视图')
  assert.match(resourcePreviewTabSource, /<RichTextEditor\b/, 'WorkspaceResourcePreviewTab 缺少协作文档视图承载')
})
