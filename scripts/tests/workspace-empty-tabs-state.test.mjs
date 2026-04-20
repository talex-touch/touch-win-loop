import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_MAIN_TABS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceMainTabs.ts')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')

it('关闭全部标签后保持空标签态，不再自动补 dashboard', async () => {
  const [tabsComposableSource, mainPanelSource, workspaceSource] = await Promise.all([
    readFile(WORKSPACE_MAIN_TABS_COMPOSABLE_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
  ])

  assert.match(tabsComposableSource, /const openTabs = ref<WorkspaceMainTab\[\]>\(\[\]\)/, 'tabs composable 初始状态仍会自动补 dashboard')
  assert.match(tabsComposableSource, /const activeTabId = ref<WorkspaceMainTabId \| ''>\(''\)/, 'tabs composable 初始激活态仍会自动补 dashboard')
  assert.doesNotMatch(tabsComposableSource, /const nextTabs = resolvedTabs\s*:\s*options\.fixedTabs\.filter\(tab => tab\.id === 'dashboard'\)/, 'tabs composable 仍会在 props 为空时补 dashboard')

  assert.doesNotMatch(mainPanelSource, /if \(nextTabIds\.length === 0\)[\s\S]*dashboard/, '主面板仍会在无标签页时本地补 dashboard')
  assert.doesNotMatch(mainPanelSource, /return \['dashboard'\]/, '主面板仍会把空 tabs 迁移回 dashboard')

  assert.match(workspaceSource, /const openMainTabs = ref<WorkspaceMainTabId\[\]>\(\[\]\)/, '项目页 openMainTabs 初始态仍会自动补 dashboard')
  assert.match(workspaceSource, /const activeMainTabId = ref<WorkspaceMainTabId \| ''>\(''\)/, '项目页 activeMainTabId 初始态仍会自动补 dashboard')
  assert.match(workspaceSource, /openMainTabs\.value = \[\]/, '项目页在项目清空时未保持空标签态')
  assert.match(workspaceSource, /activeMainTabId\.value = ''/, '项目页在项目清空时未清空激活标签')
  assert.match(workspaceSource, /openMainTabs\.value = nextOpenTabs/, '项目页资源清理后仍会强制补回 dashboard')
  assert.match(workspaceSource, /activeMainTabId\.value = openMainTabs\.value\[0\] \|\| ''/, '项目页无标签页时未保持空激活态')
})
