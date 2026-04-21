import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const RESOURCE_MANAGER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const PROJECT_SETTINGS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceProjectSettingsTab.vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const WORKSPACE_LOOPY_DATA_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLoopyDataTab.vue')
const WORKSPACE_LOOPY_DATA_OVERVIEW_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLoopyDataOverviewView.vue')
const WORKSPACE_LOOPY_DATA_HEALTH_VIEW_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLoopyDataHealthView.vue')
const WORKSPACE_LOOPY_DATA_SEMANTIC_SPACE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLoopyDataSemanticSpace.client.vue')
const LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const LOOPY_DATA_CENTER_UTILS_FILE = resolve(process.cwd(), 'app/utils/loopy-data-center.ts')

describe('project knowledge index ui', () => {
  it('资源属性弹窗展示知识索引状态与重新索引入口', async () => {
    const source = await readFile(RESOURCE_MANAGER_FILE, 'utf8')

    assert.match(source, /title="资源属性"/, 'WorkspaceResourceManagerPanel 未将弹窗标题改为资源属性')
    assert.match(source, /知识索引/, 'WorkspaceResourceManagerPanel 缺少知识索引区块')
    assert.match(source, /重新索引/, 'WorkspaceResourceManagerPanel 缺少重新索引入口')
    assert.match(source, /activeProjectId\?: string/, 'WorkspaceResourceManagerPanel 缺少 activeProjectId 入参')
  })

  it('知识索引从项目设置迁移到独立 Loopy 数据工作台，并保留 activeProjectId 透传', async () => {
    const [settingsSource, mainPanelSource, loopyDataSource, loopyOverviewSource, loopyHealthSource, semanticSpaceSource, loopyDataUtilsSource, sidebarSource, pageSource] = await Promise.all([
      readFile(PROJECT_SETTINGS_TAB_FILE, 'utf8'),
      readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
      readFile(WORKSPACE_LOOPY_DATA_TAB_FILE, 'utf8'),
      readFile(WORKSPACE_LOOPY_DATA_OVERVIEW_FILE, 'utf8'),
      readFile(WORKSPACE_LOOPY_DATA_HEALTH_VIEW_FILE, 'utf8'),
      readFile(WORKSPACE_LOOPY_DATA_SEMANTIC_SPACE_FILE, 'utf8'),
      readFile(LOOPY_DATA_CENTER_UTILS_FILE, 'utf8'),
      readFile(LEFT_SIDEBAR_FILE, 'utf8'),
      readFile(PROJECT_PAGE_FILE, 'utf8'),
    ])

    assert.doesNotMatch(settingsSource, /知识索引/, 'WorkspaceProjectSettingsTab 仍残留知识索引区块')
    assert.doesNotMatch(settingsSource, /workspace-settings-section-knowledge-index/, 'WorkspaceProjectSettingsTab 仍残留知识索引 section 锚点')
    assert.match(mainPanelSource, /id: 'loopy_data'/, 'WorkspaceMainPanel 未注册 Loopy 数据固定 Tab')
    assert.match(mainPanelSource, /v-else-if="activeTabId === 'loopy_data'"/, 'WorkspaceMainPanel 未渲染 Loopy 数据主面板')
    assert.match(loopyDataSource, /workspace-project-knowledge-index/, 'WorkspaceLoopyDataTab 缺少稳定测试锚点')
    assert.match(loopyDataSource, /WorkspaceLoopyDataOverviewView/, 'WorkspaceLoopyDataTab 未挂载数据中心主视图')
    assert.match(loopyDataSource, /主视图/, 'WorkspaceLoopyDataTab 缺少主视图入口')
    assert.match(loopyDataSource, /索引健康/, 'WorkspaceLoopyDataTab 缺少索引健康子视图入口')
    assert.match(loopyDataSource, /关系探索/, 'WorkspaceLoopyDataTab 缺少关系探索子视图入口')
    assert.match(loopyDataSource, /语义空间/, 'WorkspaceLoopyDataTab 缺少语义空间子视图入口')
    assert.match(loopyOverviewSource, /Embeddings 接入点/, 'WorkspaceLoopyDataOverviewView 缺少 embeddings 接入点区块')
    assert.match(loopyOverviewSource, /数据契约/, 'WorkspaceLoopyDataOverviewView 缺少数据契约区块')
    assert.match(loopyOverviewSource, /状态图例/, 'WorkspaceLoopyDataOverviewView 缺少状态图例区块')
    assert.match(loopyOverviewSource, /运行建议/, 'WorkspaceLoopyDataOverviewView 缺少运行建议区块')
    assert.match(loopyOverviewSource, /winloop-hero-video\.mp4/, 'WorkspaceLoopyDataOverviewView 未接入 WinLoop 主视觉视频')
    assert.match(loopyOverviewSource, /var\(--wl-wb-shell-padding/, 'WorkspaceLoopyDataOverviewView 未消费工作台全局 token')
    assert.match(loopyDataSource, /WorkspaceLoopyDataHealthView/, 'WorkspaceLoopyDataTab 未挂载健康视图')
    assert.match(loopyDataSource, /WorkspaceLoopyDataRelationsView/, 'WorkspaceLoopyDataTab 未挂载关系视图')
    assert.match(loopyDataSource, /WorkspaceLoopyDataSemanticSpace/, 'WorkspaceLoopyDataTab 未挂载语义空间视图')
    assert.match(loopyDataUtilsSource, /export interface LoopyEmbeddingEntryContract/, '数据中心缺少 embeddings 接入点契约定义')
    assert.match(loopyDataUtilsSource, /export interface LoopySourceCardContract/, '数据中心缺少 source 卡片契约定义')
    assert.match(loopyDataUtilsSource, /export interface LoopyRelationNodeContract/, '数据中心缺少关系节点契约定义')
    assert.match(loopyDataUtilsSource, /export function buildLoopyOverviewContract/, '数据中心缺少主视图字段映射函数')
    assert.match(loopyHealthSource, /完整状态表/, 'WorkspaceLoopyDataHealthView 缺少完整状态表')
    assert.match(loopyHealthSource, /失败项/, 'WorkspaceLoopyDataHealthView 缺少失败项列表')
    assert.match(semanticSpaceSource, /Embedding 空间分布/, 'WorkspaceLoopyDataSemanticSpace 未渲染新标题')
    assert.match(semanticSpaceSource, /聚类数/, 'WorkspaceLoopyDataSemanticSpace 缺少聚类数指标卡')
    assert.match(semanticSpaceSource, /平均相似度/, 'WorkspaceLoopyDataSemanticSpace 缺少平均相似度指标卡')
    assert.match(semanticSpaceSource, /最大相似度/, 'WorkspaceLoopyDataSemanticSpace 缺少最大相似度指标卡')
    assert.match(semanticSpaceSource, /layoutType: 'chunk_space'/, 'WorkspaceLoopyDataSemanticSpace 未固定请求 chunk_space 布局')
    assert.match(semanticSpaceSource, /level: 'chunk'/, 'WorkspaceLoopyDataSemanticSpace 未固定请求 chunk 级别')
    assert.doesNotMatch(semanticSpaceSource, /OrbitControls|THREE/, 'WorkspaceLoopyDataSemanticSpace 仍残留 3D 依赖')
    assert.doesNotMatch(semanticSpaceSource, /WorkspaceLoopyDataNodeDetail/, 'WorkspaceLoopyDataSemanticSpace 仍残留右侧详情栏')
    assert.match(sidebarSource, /activeProjectId\?: string/, 'WorkspaceLeftSidebar 缺少 activeProjectId 入参')
    assert.match(pageSource, /:active-project-id="activeProjectId"/, '项目工作区未向子组件透传 activeProjectId')
  })
})
