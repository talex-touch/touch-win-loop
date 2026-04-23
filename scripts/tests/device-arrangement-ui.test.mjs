import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const RESOURCE_MANAGER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
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

  assert.match(projectPage, /async function createDeviceArrangement\(\): Promise<void> \{/, '项目页缺少独立设备排布创建入口')
  assert.match(projectPage, /endpoint\(`\/projects\/\$\{projectId\}\/device-arrangements`\)/, '项目页未调用设备排布创建 API')
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

it('独立设备排布编辑器提供模板、手动 transform、批量导出与截图资产化', async () => {
  const [devicePanel, helper, projectPage, sidebarHelper] = await Promise.all([
    readFile(DEVICE_PANEL_FILE, 'utf8'),
    readFile(DEVICE_HELPER_FILE, 'utf8'),
    readFile(PROJECT_PAGE_FILE, 'utf8'),
    readFile(SIDEBAR_HELPER_FILE, 'utf8'),
  ])

  assert.match(devicePanel, /data-testid="workspace-device-arrangement-panel"/, '独立设备排布编辑器缺少根 data-testid')
  assert.match(devicePanel, /DEVICE_ARRANGEMENT_TEMPLATE_PRESETS/, '独立设备排布编辑器未接入模板预设')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-manual-transform"/, '独立设备排布编辑器缺少手动 transform 控件')
  assert.match(devicePanel, /data-testid="workspace-device-arrangement-batch-export"/, '独立设备排布编辑器缺少批量导出区域')
  assert.match(devicePanel, /function handlePaste\(event: ClipboardEvent\): void \{/, '独立设备排布编辑器缺少粘贴截图入口')
  assert.match(devicePanel, /@paste="handlePaste"/, '独立设备排布编辑器未在根面板接入粘贴事件')
  assert.match(devicePanel, /uploadDeviceArrangementScreenshotAsset/, '独立设备排布编辑器未接入截图资产化')
  assert.match(devicePanel, /mockups\/catalog/, '独立设备排布编辑器未请求 mockup catalog')
  assert.match(devicePanel, /saveDocument/, '独立设备排布编辑器缺少保存入口')

  assert.match(helper, /\/projects\/\$\{projectId\}\/resources\/upload/, '设备排布截图未复用项目资源上传接口')
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
