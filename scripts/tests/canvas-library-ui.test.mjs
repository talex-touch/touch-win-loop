import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DESIGN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDesignPanel.vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const ADMIN_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/canvas-library.vue')
const ADMIN_ITEMS_COMPONENT_FILE = resolve(process.cwd(), 'app/components/admin/canvas-library/AdminCanvasLibraryItemsManager.vue')
const ADMIN_MOCKUP_COMPONENT_FILE = resolve(process.cwd(), 'app/components/admin/canvas-library/AdminCanvasLibraryMockupModelsManager.vue')
const ADMIN_SUBNAV_FILE = resolve(process.cwd(), 'app/components/admin/AdminSubnav.vue')

it('设计画布侧栏接入平台级资源库与管理员发布入口', async () => {
  const [designPanelSource, mainPanelSource] = await Promise.all([
    readFile(DESIGN_PANEL_FILE, 'utf8'),
    readFile(MAIN_PANEL_FILE, 'utf8'),
  ])

  assert.match(designPanelSource, /<span>资源库<\/span>/, '设计画布 assets 侧栏缺少资源库分区')
  assert.match(designPanelSource, /Templates<\/span>/, '设计画布资源库缺少 Templates 分组')
  assert.match(designPanelSource, /Assets<\/span>/, '设计画布资源库缺少 Assets 分组')
  assert.match(designPanelSource, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/design-library\/items/, '设计画布未接入项目侧资源库列表接口')
  assert.match(designPanelSource, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/design-library\/templates\/\$\{encodeURIComponent\(item\.id\)\}\/create-resource/, '设计画布未接入 scene template 创建设计资源接口')
  assert.match(designPanelSource, />发布到资源库<\/span>/, '设计画布缺少管理员发布入口')
  assert.match(designPanelSource, /"\/admin\/canvas-library\/from-design"/, '设计画布未接入从设计发布到资源库接口')
  assert.match(mainPanelSource, /@activate-resource="emitActivatePreviewResource\(\$event\)"/, '主面板未接住资源库导入后的资源激活事件')
})

it('管理后台把模板素材与 Mockup 型号都收进画布资源库，并使用 table CRUD 结构', async () => {
  const [adminPageSource, adminItemsSource, adminMockupSource, adminSubnavSource] = await Promise.all([
    readFile(ADMIN_PAGE_FILE, 'utf8'),
    readFile(ADMIN_ITEMS_COMPONENT_FILE, 'utf8'),
    readFile(ADMIN_MOCKUP_COMPONENT_FILE, 'utf8'),
    readFile(ADMIN_SUBNAV_FILE, 'utf8'),
  ])

  assert.match(adminSubnavSource, /to: '\/admin\/canvas-library'/, 'Admin 导航缺少画布资源库入口')
  assert.doesNotMatch(adminSubnavSource, /to: '\/admin\/mockups'/, 'Admin 导航不应再保留独立 Mockup 专项入口')
  assert.match(adminPageSource, /画布资源库/, '管理页标题缺失')
  assert.match(adminPageSource, /模板 \/ 素材/, '管理页缺少模板素材 tab')
  assert.match(adminPageSource, /Mockup 型号/, '管理页缺少 Mockup 型号 tab')
  assert.match(adminItemsSource, /<a-table/, '模板素材管理未改为标准 table CRUD')
  assert.match(adminItemsSource, /"\/admin\/canvas-library\/items"/, '模板素材管理未接入条目列表或创建接口')
  assert.match(adminItemsSource, /"\/admin\/canvas-library\/assets\/upload"/, '模板素材管理未接入素材上传接口')
  assert.match(adminItemsSource, /创建后立即发布/, '模板素材管理缺少立即发布开关')
  assert.match(adminItemsSource, /device_shell/, '模板素材管理缺少设备壳素材创建能力')
  assert.match(adminMockupSource, /<a-table/, 'Mockup 型号管理未改为标准 table CRUD')
  assert.match(adminMockupSource, /"\/admin\/mockups\/models"/, 'Mockup 型号管理未接入型号目录接口')
  assert.match(adminMockupSource, /去素材列表/, 'Mockup 型号管理缺少跳转到素材列表入口')
})
