import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const RESOURCE_MANAGER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const PROJECT_SETTINGS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceProjectSettingsTab.vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const WORKSPACE_LOOPY_DATA_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLoopyDataTab.vue')
const LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')

describe('project knowledge index ui', () => {
  it('资源属性弹窗展示知识索引状态与重新索引入口', async () => {
    const source = await readFile(RESOURCE_MANAGER_FILE, 'utf8')

    assert.match(source, /title="资源属性"/, 'WorkspaceResourceManagerPanel 未将弹窗标题改为资源属性')
    assert.match(source, /知识索引/, 'WorkspaceResourceManagerPanel 缺少知识索引区块')
    assert.match(source, /重新索引/, 'WorkspaceResourceManagerPanel 缺少重新索引入口')
    assert.match(source, /activeProjectId\?: string/, 'WorkspaceResourceManagerPanel 缺少 activeProjectId 入参')
  })

  it('知识索引从项目设置迁移到独立 Loopy 数据工作台，并保留 activeProjectId 透传', async () => {
    const [settingsSource, mainPanelSource, loopyDataSource, sidebarSource, pageSource] = await Promise.all([
      readFile(PROJECT_SETTINGS_TAB_FILE, 'utf8'),
      readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
      readFile(WORKSPACE_LOOPY_DATA_TAB_FILE, 'utf8'),
      readFile(LEFT_SIDEBAR_FILE, 'utf8'),
      readFile(PROJECT_PAGE_FILE, 'utf8'),
    ])

    assert.doesNotMatch(settingsSource, /知识索引/, 'WorkspaceProjectSettingsTab 仍残留知识索引区块')
    assert.doesNotMatch(settingsSource, /workspace-settings-section-knowledge-index/, 'WorkspaceProjectSettingsTab 仍残留知识索引 section 锚点')
    assert.match(mainPanelSource, /id: 'loopy_data'/, 'WorkspaceMainPanel 未注册 Loopy 数据固定 Tab')
    assert.match(mainPanelSource, /v-else-if="activeTabId === 'loopy_data'"/, 'WorkspaceMainPanel 未渲染 Loopy 数据主面板')
    assert.match(loopyDataSource, /workspace-project-knowledge-index/, 'WorkspaceLoopyDataTab 缺少稳定测试锚点')
    assert.match(loopyDataSource, /最近完成/, 'WorkspaceLoopyDataTab 缺少最近完成列表')
    assert.match(loopyDataSource, /失败项/, 'WorkspaceLoopyDataTab 缺少失败项列表')
    assert.match(loopyDataSource, /完整状态表/, 'WorkspaceLoopyDataTab 缺少完整状态表')
    assert.match(sidebarSource, /activeProjectId\?: string/, 'WorkspaceLeftSidebar 缺少 activeProjectId 入参')
    assert.match(pageSource, /:active-project-id="activeProjectId"/, '项目工作区未向子组件透传 activeProjectId')
  })
})
