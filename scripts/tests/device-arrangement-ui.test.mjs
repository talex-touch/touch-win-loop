import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const RESOURCE_MANAGER_FILE = resolve(
  process.cwd(),
  'app/components/workspace/WorkspaceResourceManagerPanel.vue',
)
const LEFT_SIDEBAR_FILE = resolve(
  process.cwd(),
  'app/components/workspace/WorkspaceLeftSidebar.vue',
)
const PROJECT_PAGE_FILE = resolve(
  process.cwd(),
  'app/pages/team/[teamId]/project/[projectId].vue',
)
const DESIGN_PANEL_FILE = resolve(
  process.cwd(),
  'app/components/workspace/WorkspaceDesignPanel.vue',
)
const DESIGN_INSPECTOR_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignInspector.vue',
)
const DEVICE_SIDEBAR_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDeviceArrangementSidebar.vue',
)
const DEVICE_DIALOG_FILE = resolve(
  process.cwd(),
  'app/components/workspace/WorkspaceDeviceArrangementCreateDialog.vue',
)
const DEVICE_ASSET_HELPER_FILE = resolve(
  process.cwd(),
  'app/utils/device-arrangement-assets.ts',
)

it('资源管理器直接创建设备排布资源，并在设计资源里持久化初始文档', async () => {
  const [resourceManager, leftSidebar, projectPage, sidebar, dialog] = await Promise.all([
    readFile(RESOURCE_MANAGER_FILE, 'utf8'),
    readFile(LEFT_SIDEBAR_FILE, 'utf8'),
    readFile(PROJECT_PAGE_FILE, 'utf8'),
    readFile(DEVICE_SIDEBAR_FILE, 'utf8'),
    readFile(DEVICE_DIALOG_FILE, 'utf8'),
  ])

  assert.match(resourceManager, /新建设备排布/, '资源新建菜单缺少设备排布入口')
  assert.match(resourceManager, /buildDeviceArrangementSceneDocument/, '资源管理器未为设备排布生成初始文档')
  assert.match(resourceManager, /serializeSceneDocument/, '资源管理器未序列化设备排布初始文档')
  assert.match(resourceManager, /designMode: 'device_arrangement'/, '资源管理器未以设备排布模式创建设计资源')
  assert.match(leftSidebar, /designMode\?: 'blank' \| 'device_arrangement'/, '左侧栏事件类型未扩展 designMode')
  assert.match(projectPage, /title: requestedTitle \|\| \(designMode === 'device_arrangement' \? '设备排布' : '设计稿'\)/, '创建协作资源时未使用设备排布标题')
  assert.match(projectPage, /updateCollabDrawContent\(initialDrawValue\)/, '创建设备排布后未写入初始 draw 内容')
  assert.match(sidebar, /workspace-design-sidebar-arrangement/, '设计画布缺少设备排布持久化侧栏')
  assert.match(sidebar, /改动会直接写回当前设计资源/, '设备排布侧栏未声明持久化语义')
  assert.match(dialog, /\/projects\/\$\{projectId\}\/mockups\/catalog/, '设备排布向导未请求项目 mockup catalog')
  assert.match(dialog, /data-testid="workspace-device-arrangement-upload"/, '设备排布向导缺少上传入口')
  assert.match(dialog, /data-testid="workspace-device-arrangement-device-select"/, '设备排布向导缺少设备选择器')
  assert.match(dialog, /data-testid="workspace-device-arrangement-layout"/, '设备排布向导缺少布局预设')
  assert.match(dialog, /data-testid="workspace-device-arrangement-export-size"/, '设备排布向导缺少导出尺寸预设')
  assert.match(dialog, /buildDeviceArrangementSceneDocument/, '设备排布向导未使用统一 scene 构建函数')
})

it('设计画布支持设备排布独立 tab、插入设备排布，并使用页面级导出设置', async () => {
  const [designPanel, inspector, sidebarTabs] = await Promise.all([
    readFile(DESIGN_PANEL_FILE, 'utf8'),
    readFile(DESIGN_INSPECTOR_FILE, 'utf8'),
    readFile(resolve(process.cwd(), 'app/components/workspace/design/WorkspaceDesignSidebarTabs.vue'), 'utf8'),
  ])

  assert.match(designPanel, />\s*插入设备排布\s*<\/span>/, '设计画布 Action 菜单缺少插入设备排布入口')
  assert.match(designPanel, /insertDeviceArrangementFromDialog/, '设计画布未接入设备排布插入处理')
  assert.match(designPanel, /isDeviceArrangementDocument/, '设计画布未识别设备排布文档模式')
  assert.match(designPanel, /WorkspaceDeviceArrangementSidebar/, '设计画布未挂载设备排布独立 tab 内容')
  assert.match(sidebarTabs, /showArrangement/, '设计侧栏 tabs 未支持设备排布独立 tab')
  assert.match(sidebarTabs, /label: 'Arrange'/, '设计侧栏缺少设备排布 tab')
  assert.match(designPanel, /resolvePageExportBackgroundMode/, 'Page SVG 导出未读取页面背景模式')
  assert.match(designPanel, /resolvePageExportScale\(currentPage\.value\)/, 'Page PNG 导出未读取页面倍率')
  assert.match(inspector, /壳状态/, 'Inspector 设备选择区缺少壳状态')
  assert.match(inspector, /导出宽度/, 'Inspector Page 导出缺少固定宽度')
  assert.match(inspector, /导出高度/, 'Inspector Page 导出缺少固定高度')
  assert.match(inspector, /背景模式/, 'Inspector Page 导出缺少背景模式')
  assert.match(inspector, /compact-label">\s*R\s*<\/span>/, 'Inspector Frame 几何区缺少 rotation 控制')
})

it('设备排布侧栏支持实时预览、内置模版与逐截图设备选择', async () => {
  const sidebar = await readFile(DEVICE_SIDEBAR_FILE, 'utf8')

  assert.match(sidebar, /renderCompositionAssetToSvg/, '设备排布侧栏未生成实时 SVG 预览')
  assert.match(sidebar, /data-testid="workspace-device-arrangement-preview"/, '设备排布侧栏缺少实时预览区域')
  assert.match(sidebar, /DEVICE_ARRANGEMENT_TEMPLATE_PRESETS/, '设备排布侧栏未内置排布模版')
  assert.match(sidebar, /data-testid="workspace-device-arrangement-templates"/, '设备排布侧栏缺少模版区')
  assert.match(sidebar, /data-testid="workspace-device-arrangement-item-device-select"/, '设备排布侧栏未提供逐截图设备选择')
  assert.match(sidebar, /applyDefaultDeviceToAll/, '设备排布侧栏缺少批量应用默认设备能力')
  assert.match(sidebar, /data-testid="workspace-device-arrangement-apply-all-devices"/, '设备排布侧栏缺少批量套用入口')
  assert.match(sidebar, /deviceChoiceKey/, '设备排布侧栏未为截图持久化独立设备选择状态')
  assert.match(sidebar, /data-testid="workspace-device-arrangement-effects"/, '设备排布侧栏缺少阴影、间距和倾斜快捷设置')
})

it('设备排布插入弹层复用逐截图设备、内置模版与效果预设', async () => {
  const dialog = await readFile(DEVICE_DIALOG_FILE, 'utf8')

  assert.match(dialog, /DEVICE_ARRANGEMENT_TEMPLATE_PRESETS/, '设备排布弹层未复用内置排布模版')
  assert.match(dialog, /data-testid="workspace-device-arrangement-templates"/, '设备排布弹层缺少模版区')
  assert.match(dialog, /data-testid="workspace-device-arrangement-item-device-select"/, '设备排布弹层未提供逐截图设备选择')
  assert.match(dialog, /data-testid="workspace-device-arrangement-apply-all-devices"/, '设备排布弹层缺少批量套用入口')
  assert.match(dialog, /data-testid="workspace-device-arrangement-effects"/, '设备排布弹层缺少效果快捷设置')
})

it('设备排布截图优先资产化，并在失败时回退内嵌图片', async () => {
  const [sidebar, dialog, helper] = await Promise.all([
    readFile(DEVICE_SIDEBAR_FILE, 'utf8'),
    readFile(DEVICE_DIALOG_FILE, 'utf8'),
    readFile(DEVICE_ASSET_HELPER_FILE, 'utf8'),
  ])

  assert.match(helper, /\/projects\/\$\{projectId\}\/resources\/upload/, '设备排布截图未复用项目资源上传接口')
  assert.match(helper, /\/projects\/\$\{projectId\}\/resources\/\$\{resourceId\}\/file/, '设备排布截图未使用稳定资源文件地址')
  assert.match(sidebar, /uploadDeviceArrangementScreenshotAsset/, '设备排布侧栏未接入截图资产化')
  assert.match(dialog, /uploadDeviceArrangementScreenshotAsset/, '设备排布弹层未接入截图资产化')
  assert.match(sidebar, /已临时使用内嵌图片/, '设备排布侧栏缺少资产化失败回退提示')
  assert.match(dialog, /已临时使用内嵌图片/, '设备排布弹层缺少资产化失败回退提示')
})
