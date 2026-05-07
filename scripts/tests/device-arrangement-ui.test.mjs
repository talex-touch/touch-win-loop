import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const RESOURCE_MANAGER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const MAIN_PANEL_CHROME_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelChrome.vue')
const DESIGN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDesignPanel.vue')
const ACTION_MENUS_FILE = resolve(process.cwd(), 'app/components/workspace/design/WorkspaceDesignSidebarActionMenus.vue')
const SIDEBAR_TABS_FILE = resolve(process.cwd(), 'app/components/workspace/design/WorkspaceDesignSidebarTabs.vue')
const DEVICE_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDeviceArrangementPanel.vue')
const DEVICE_HELPER_FILE = resolve(process.cwd(), 'app/utils/device-arrangement-assets.ts')
const SIDEBAR_HELPER_FILE = resolve(process.cwd(), 'app/utils/workspace-left-sidebar-helpers.ts')

it('资源管理器把设备排布作为独立资源创建，不再走设计画布初始 scene', async () => {
  const [resourceManager, leftSidebar, projectPage] = await Promise.all([
    readFile(RESOURCE_MANAGER_FILE, 'utf8'),
    readFile(LEFT_SIDEBAR_FILE, 'utf8'),
    readFile(PROJECT_PAGE_FILE, 'utf8'),
  ])

  assert.match(resourceManager, /新建设备排布/, '资源新建菜单缺少设备排布入口')
  assert.match(resourceManager, /emit\('createDeviceArrangement'\)/, '资源管理器未发出独立设备排布事件')
  assert.doesNotMatch(resourceManager, /buildDeviceArrangementSceneDocument/, '资源管理器仍在构建设计画布 scene')
  assert.doesNotMatch(resourceManager, /designMode: 'device_arrangement'/, '资源管理器仍在以设计画布模式创建设备排布')

  assert.match(leftSidebar, /'createDeviceArrangement': \[\]/, '左侧栏未透传独立设备排布事件')
  assert.match(leftSidebar, /@create-device-arrangement="emit\('createDeviceArrangement'\)"/, '左侧栏未转发设备排布新建事件')
  assert.doesNotMatch(leftSidebar, /designMode\?: 'blank' \| 'device_arrangement'/, '左侧栏仍保留旧的 designMode 设备排布语义')

  assert.match(projectPage, /async function createDeviceArrangement\(payload: \{ title\?: string, document\?: Record<string, unknown> \} = \{\}\): Promise<void> \{/, '项目页缺少支持初始文档的独立设备排布创建入口')
  assert.match(projectPage, /endpoint\(`\/projects\/\$\{projectId\}\/device-arrangements`\)/, '项目页未调用设备排布创建 API')
  assert.match(projectPage, /title: String\(payload\.title \|\| ''\)\.trim\(\) \|\| '设备排布'/, '项目页创建设备排布时未透传标题 payload')
  assert.match(projectPage, /document: payload\.document/, '项目页创建设备排布时未透传初始文档 payload')
  assert.match(projectPage, /await openProjectResourcePreview\(createdResourceId, \{\s*forceReload: true,\s*resourceHint: createdResource,\s*\}\)/, '项目页创建设备排布后未直接打开新资源')
  assert.doesNotMatch(projectPage, /updateCollabDrawContent\(initialDrawValue\)/, '项目页仍在写入旧的设备排布 draw 初始内容')
})

it('主面板挂载独立设备排布编辑器，旧设计画布不再承载设备排布 sidebar / insert', async () => {
  const [mainPanel, designPanel, actionMenus, sidebarTabs] = await Promise.all([
    readFile(MAIN_PANEL_FILE, 'utf8'),
    readFile(DESIGN_PANEL_FILE, 'utf8'),
    readFile(ACTION_MENUS_FILE, 'utf8'),
    readFile(SIDEBAR_TABS_FILE, 'utf8'),
  ])

  assert.match(mainPanel, /isActiveDeviceArrangementResource/, '主面板未识别设备排布资源')
  assert.match(mainPanel, /<WorkspaceDeviceArrangementPanel/, '主面板未挂载独立设备排布编辑器')
  assert.match(mainPanel, /isDeviceArrangementResource/, '主面板未按资源 metadata 判定设备排布')

  assert.doesNotMatch(designPanel, /WorkspaceDeviceArrangementSidebar/, '设计画布仍挂载设备排布侧栏')
  assert.doesNotMatch(designPanel, /WorkspaceDeviceArrangementCreateDialog/, '设计画布仍挂载设备排布插入弹层')
  assert.doesNotMatch(designPanel, /insertDeviceArrangementFromDialog/, '设计画布仍支持插入设备排布')
  assert.doesNotMatch(designPanel, /show-arrangement/, '设计画布仍向侧栏 tabs 暴露设备排布 tab')
  assert.doesNotMatch(actionMenus, />\s*设备排布\s*<\/span>/, '设计画布 Action 菜单仍保留设备排布入口')
  assert.doesNotMatch(sidebarTabs, /showArrangement/, '设计侧栏 tabs 仍保留设备排布开关')
})

it('独立设备排布编辑器提供 shots.so 式设备数量、边框库、图片与导出闭环', async () => {
  const [devicePanel, helper, projectPage, sidebarHelper, mainPanel, mainPanelChrome] = await Promise.all([
    readFile(DEVICE_PANEL_FILE, 'utf8'),
    readFile(DEVICE_HELPER_FILE, 'utf8'),
    readFile(PROJECT_PAGE_FILE, 'utf8'),
    readFile(SIDEBAR_HELPER_FILE, 'utf8'),
    readFile(MAIN_PANEL_FILE, 'utf8'),
    readFile(MAIN_PANEL_CHROME_FILE, 'utf8'),
  ])

  assert.match(devicePanel, /data-testid="workspace-device-arrangement-panel"/, '独立设备排布编辑器缺少根 data-testid')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-workbench"/, '独立设备排布编辑器缺少模板工作台')
  assert.match(devicePanel, /grid-template-columns: 304px minmax\(0, 1fr\) 328px/, '设备排布工作台未保持左设备库、中预览、右图片三栏')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-layout-panel"/, '独立设备排布编辑器缺少设备数量选择面板')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-layout-presets"/, '独立设备排布编辑器缺少布局预设列表')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-mockup-library"/, '独立设备排布编辑器缺少设备资源库')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-device-category"/, '独立设备排布编辑器缺少设备分类选择')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-device-choice"/, '独立设备排布编辑器缺少设备边框选择')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-details"/, '独立设备排布编辑器缺少详情面板')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-image-panel"/, '独立设备排布编辑器缺少右侧图片面板')
  assert.match(devicePanel, /Mockup Library/, '独立设备排布编辑器未按 shots.so 风格暴露 Mockup Library')
  assert.match(devicePanel, /Frame/, '独立设备排布编辑器缺少 Mockup\/Frame 模式入口')
  assert.match(devicePanel, /Drop or Paste/, '独立设备排布编辑器缺少中心画布导入空态')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-checkerboard"/, '独立设备排布编辑器缺少棋盘画布背景')
  assert.match(devicePanel, /background-size: 32px 32px/, '独立设备排布编辑器未使用棋盘背景')
  assert.match(devicePanel, /DEVICE_ARRANGEMENT_TEMPLATE_PRESETS/, '独立设备排布编辑器未保留风格预设')
  assert.match(devicePanel, /selectedDefaultDevicePresetKey/, '独立设备排布编辑器未保存默认设备边框选择')
  assert.match(devicePanel, /selectedDeviceCategoryKey/, '独立设备排布编辑器未保存设备分类选择')
  assert.match(devicePanel, /filteredDeviceChoices/, '独立设备排布编辑器未按分类筛选设备边框')
  assert.match(devicePanel, /function updateDefaultDeviceChoice/, '独立设备排布编辑器缺少设备边框应用动作')
  assert.match(devicePanel, /resolveDevicePresetPatch/, '独立设备排布编辑器未统一设备边框应用逻辑')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-dropzone"/, '独立设备排布编辑器缺少拖拽导入区域')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-image-card"/, '独立设备排布编辑器缺少截图列表')
  assert.match(devicePanel, /class="workspace-device-arrangement-panel__preview-device"/, '独立设备排布编辑器缺少 DOM 图片预览设备')
  assert.match(devicePanel, /createAutomaticLayoutDocument/, '独立设备排布编辑器未统一走自动排版文档')
  assert.match(devicePanel, /resetItemManualTransform/, '独立设备排布编辑器未清理手动位置参数')
  assert.match(devicePanel, /localScreenshotSrcByItemId/, '独立设备排布编辑器未保留本地截图预览源')
  assert.match(devicePanel, /materializeImageSrc/, '独立设备排布编辑器导出前未把图片资源内联化')
  assert.match(devicePanel, /credentials: 'include'/, '独立设备排布编辑器读取图片资源时未携带登录态')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-batch-export"/, '独立设备排布编辑器缺少批量导出区域')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-export-actions"/, '独立设备排布编辑器缺少明确导出动作区')
  assert.match(devicePanel, /saveStateChange/, '独立设备排布编辑器未向外层上报 dirty/save 状态')
  assert.match(devicePanel, /AUTO_SAVE_DEBOUNCE_MS/, '独立设备排布编辑器未配置自动保存 debounce')
  assert.match(devicePanel, /scheduleAutoSave/, '独立设备排布编辑器未在文档变化后自动保存')
  assert.match(devicePanel, /lockSessionId/, '独立设备排布编辑器未维护编辑锁 session')
  assert.match(devicePanel, /LOCK_HEARTBEAT_MS/, '独立设备排布编辑器缺少编辑锁心跳')
  assert.match(devicePanel, /releaseEditLock/, '独立设备排布编辑器卸载时未释放编辑锁')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-lock-blocked"/, '独立设备排布编辑器缺少被占用状态')
  assert.match(devicePanel, /:disabled="!canEdit"/, '独立设备排布编辑器未在被占用时禁用编辑控件')
  assert.doesNotMatch(devicePanel, /data-testid="workspace-device-arrangement-dirty-state"/, '独立设备排布编辑器仍在面板内部显示 dirty/save 状态')
  assert.doesNotMatch(devicePanel, /@click="saveDocument"/, '独立设备排布编辑器仍暴露手动保存按钮')
  assert.match(mainPanel, /:breadcrumb-save-state="breadcrumbSaveState"/, '主面板未把设备排布保存状态传给面包屑')
  assert.match(mainPanel, /@save-state-change="onDeviceArrangementSaveStateChange"/, '主面板未接收设备排布保存状态')
  assert.match(mainPanel, /label: '已占用'/, '面包屑未展示设备排布占用状态')
  assert.match(mainPanelChrome, /data-testid="workspace-main-breadcrumb-save-state"/, '面包屑缺少保存状态徽标')
  assert.match(mainPanelChrome, /workspace-main-breadcrumb__save-state--blocked/, '面包屑缺少占用状态样式')
  assert.match(devicePanel, /function handlePaste\(event: ClipboardEvent\): void \{/, '独立设备排布编辑器缺少粘贴截图入口')
  assert.match(devicePanel, /@paste="handlePaste"/, '独立设备排布编辑器未在根面板接入粘贴事件')
  assert.match(devicePanel, /@dragover="handleDragOver"/, '独立设备排布编辑器未接入拖拽截图入口')
  assert.match(devicePanel, /function duplicateItem\(/, '独立设备排布编辑器缺少图片复制动作')
  assert.doesNotMatch(devicePanel, /data-testid="workspace-device-arrangement-manual-transform"/, '独立设备排布编辑器仍暴露位置/缩放/旋转精调')
  assert.doesNotMatch(devicePanel, /function beginItemInteraction\(/, '独立设备排布编辑器仍保留自由拖拽交互')
  assert.doesNotMatch(devicePanel, /function moveItemLayer\(/, '独立设备排布编辑器仍保留图层顺序调整')
  assert.doesNotMatch(devicePanel, /data-testid="workspace-device-arrangement-interaction-layer"/, '独立设备排布编辑器仍保留 SVG 交互层')
  assert.match(devicePanel, /uploadDeviceArrangementScreenshotAsset/, '独立设备排布编辑器未接入截图资产化')
  assert.match(devicePanel, /parentResourceId: props\.resourceId/, '设备排布截图上传未默认挂到当前设备排布节点下')
  assert.match(devicePanel, /mockups\/catalog/, '独立设备排布编辑器未请求 mockup catalog')
  assert.match(devicePanel, /DEVICE_ARRANGEMENT_BUILTIN_DEVICE_PRESETS/, '独立设备排布编辑器未提供内置设备兜底')
  assert.match(devicePanel, /saveDocument/, '独立设备排布编辑器缺少自动保存入口')
  assert.match(devicePanel, /overflow: hidden;/, '设备排布中间画布视口不应滚动')
  assert.match(devicePanel, /--device-arrangement-canvas-ratio/, '设备排布中间画布未按可用空间等比缩放')
  assert.match(devicePanel, /PNG 导出被浏览器拦截/, 'PNG 导出失败未给跨源污染提示')

  assert.match(helper, /\/projects\/\$\{projectId\}\/resources\/upload/, '设备排布截图未复用项目资源上传接口')
  assert.match(helper, /formData\.set\('parentResourceId', parentResourceId\)/, '设备排布截图上传未把父资源写入表单')
  assert.match(helper, /\/projects\/\$\{projectId\}\/resources\/\$\{resourceId\}\/file/, '设备排布截图未使用稳定资源文件地址')
  assert.match(sidebarHelper, /if \(isDeviceArrangementResource\(resource\)\)\s+return false/, '设备排布仍被视为可下载原文件')

  assert.match(projectPage, /device-arrangement-migration/, '项目页未接入旧设备排布迁移 API')
  assert.match(projectPage, /isLegacyDeviceArrangementResource/, '项目页未识别旧设备排布资源')
  assert.match(projectPage, /resolveApiStatusCode\(error\)/, '项目页未区分旧设备排布迁移的 409 回退')
  assert.match(projectPage, /statusCode === 409/, '项目页未把非设备排布设计稿静默回退')
  assert.match(projectPage, /isLegacyDeviceArrangementResource\(targetResource\) \|\| isDesignCanvasResource\(targetResource\)/, '项目页未对历史设计稿尝试旧设备排布迁移')
  assert.match(projectPage, /if \(isDeviceArrangementResource\(resource\)\)\s+return ''/, '设备排布下载地址仍回落到 sourceLink API')
  assert.match(projectPage, /resourceHint\?: Resource \| null/, '预览打开链路未支持新建设备排布的 resource hint')
  assert.match(projectPage, /resourceHint: createdResource/, '创建设备排布后未把创建回执透传给打开链路')
  assert.match(projectPage, /return \{ resourceId: migratedResourceId, surface: 'binary' \}/, '旧设备排布迁移后未切到新资源打开')
})
