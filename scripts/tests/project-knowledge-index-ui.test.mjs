import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const RESOURCE_MANAGER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const PROJECT_SETTINGS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceProjectSettingsTab.vue')
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

  it('项目设置页展示知识索引总览、列表与 activeProjectId 透传', async () => {
    const [settingsSource, sidebarSource, pageSource] = await Promise.all([
      readFile(PROJECT_SETTINGS_TAB_FILE, 'utf8'),
      readFile(LEFT_SIDEBAR_FILE, 'utf8'),
      readFile(PROJECT_PAGE_FILE, 'utf8'),
    ])

    assert.match(settingsSource, /知识索引/, 'WorkspaceProjectSettingsTab 缺少知识索引区块')
    assert.match(settingsSource, /最近完成/, 'WorkspaceProjectSettingsTab 缺少最近完成列表')
    assert.match(settingsSource, /失败项/, 'WorkspaceProjectSettingsTab 缺少失败项列表')
    assert.match(settingsSource, /完整状态表/, 'WorkspaceProjectSettingsTab 缺少完整状态表')
    assert.match(sidebarSource, /activeProjectId\?: string/, 'WorkspaceLeftSidebar 缺少 activeProjectId 入参')
    assert.match(pageSource, /:active-project-id="activeProjectId"/, '项目工作区未向子组件透传 activeProjectId')
  })
})
