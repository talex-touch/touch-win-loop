import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DESIGN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDesignPanel.vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const ADMIN_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/canvas-library.vue')
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

it('管理后台暴露画布资源库页面与创建发布能力', async () => {
  const [adminPageSource, adminSubnavSource] = await Promise.all([
    readFile(ADMIN_PAGE_FILE, 'utf8'),
    readFile(ADMIN_SUBNAV_FILE, 'utf8'),
  ])

  assert.match(adminSubnavSource, /to: '\/admin\/canvas-library'/, 'Admin 导航缺少画布资源库入口')
  assert.match(adminPageSource, /平台级画布资源库/, '管理页标题缺失')
  assert.match(adminPageSource, /"\/admin\/canvas-library\/items"/, '管理页未接入条目列表或创建接口')
  assert.match(adminPageSource, /"\/admin\/canvas-library\/assets\/upload"/, '管理页未接入素材上传接口')
  assert.match(adminPageSource, /创建后立即发布/, '管理页缺少立即发布开关')
  assert.match(adminPageSource, /device_shell/, '管理页缺少设备壳素材创建能力')
  assert.match(adminPageSource, /publishSelectedItem/, '管理页缺少发布动作')
  assert.match(adminPageSource, /archiveSelectedItem/, '管理页缺少归档动作')
})
