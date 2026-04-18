import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const WORKSPACE_RESOURCE_MANAGER_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const WORKSPACE_ANALYSIS_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAnalysisPanel.vue')
const WORKSPACE_PROJECT_CONFIG_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceProjectConfigPanel.vue')
const WORKSPACE_ISSUE_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceIssuePanel.vue')

it('WorkspaceLeftSidebar 已下沉为 rail + panel 壳层结构', async () => {
  const [
    sidebarSource,
    resourceManagerSource,
    analysisSource,
    projectConfigSource,
    issueSource,
  ] = await Promise.all([
    readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_RESOURCE_MANAGER_PANEL_FILE, 'utf8'),
    readFile(WORKSPACE_ANALYSIS_PANEL_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_CONFIG_PANEL_FILE, 'utf8'),
    readFile(WORKSPACE_ISSUE_PANEL_FILE, 'utf8'),
  ])

  assert.match(sidebarSource, /<WorkspaceResourceManagerPanel\b/, 'WorkspaceLeftSidebar 未接入 WorkspaceResourceManagerPanel')
  assert.match(sidebarSource, /<WorkspaceAnalysisPanel\b/, 'WorkspaceLeftSidebar 未接入 WorkspaceAnalysisPanel')
  assert.match(sidebarSource, /<WorkspaceProjectConfigPanel\b/, 'WorkspaceLeftSidebar 未接入 WorkspaceProjectConfigPanel')
  assert.match(sidebarSource, /<WorkspaceIssuePanel\b/, 'WorkspaceLeftSidebar 未接入 WorkspaceIssuePanel')

  assert.doesNotMatch(sidebarSource, /title="添加项目资源"/, 'WorkspaceLeftSidebar 仍内联资源库导入弹窗')
  assert.doesNotMatch(sidebarSource, /title="分享链接"/, 'WorkspaceLeftSidebar 仍内联分享弹窗')
  assert.doesNotMatch(sidebarSource, /title="删除项目资源"/, 'WorkspaceLeftSidebar 仍内联删除弹窗')
  assert.doesNotMatch(sidebarSource, /title="资源属性"/, 'WorkspaceLeftSidebar 仍内联资源详情弹窗')
  assert.doesNotMatch(sidebarSource, /AI 竞赛分析/, 'WorkspaceLeftSidebar 仍内联分析面板内容')
  assert.doesNotMatch(sidebarSource, /workspace-project-add-actions__menu/, 'WorkspaceLeftSidebar 仍内联资源管理器菜单实现')
  assert.doesNotMatch(sidebarSource, /workspace-issue-panel__header/, 'WorkspaceLeftSidebar 仍内联 issue 面板实现')

  assert.match(resourceManagerSource, /title="添加项目资源"/, 'WorkspaceResourceManagerPanel 缺少资源库导入弹窗')
  assert.match(resourceManagerSource, /title="分享链接"/, 'WorkspaceResourceManagerPanel 缺少分享弹窗')
  assert.match(resourceManagerSource, /title="删除项目资源"/, 'WorkspaceResourceManagerPanel 缺少删除弹窗')
  assert.match(resourceManagerSource, /title="资源属性"/, 'WorkspaceResourceManagerPanel 缺少资源详情弹窗')
  assert.match(resourceManagerSource, /<WorkspaceResourceUploadHint\b/, 'WorkspaceResourceManagerPanel 缺少上传提示组件')
  assert.match(analysisSource, /AI 竞赛分析/, 'WorkspaceAnalysisPanel 缺少分析视图承载')
  assert.match(projectConfigSource, /项目分析/, 'WorkspaceProjectConfigPanel 缺少项目分析视图承载')
  assert.match(issueSource, /Issue 中心/, 'WorkspaceIssuePanel 缺少 issue 视图承载')
})
