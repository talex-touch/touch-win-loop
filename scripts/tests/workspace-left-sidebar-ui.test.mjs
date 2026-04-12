import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const WORKSPACE_RESOURCE_MANAGER_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const WORKSPACE_LEFT_RAIL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftRail.vue')
const WORKSPACE_UPLOAD_ASIDE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceUploadAside.vue')
const WORKSPACE_LEFT_SIDEBAR_STYLE_FILE = resolve(process.cwd(), 'app/assets/styles/workspace-left-sidebar.css')

it('左栏始终保留 WorkspaceLeftRail，并通过 collapsed 控制右侧 panel', async () => {
  const [source, railSource, styleSource] = await Promise.all([
    readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_LEFT_RAIL_FILE, 'utf8'),
    readFile(WORKSPACE_LEFT_SIDEBAR_STYLE_FILE, 'utf8'),
  ])

  assert.match(source, /collapsed\?: boolean/, 'WorkspaceLeftSidebar 缺少 collapsed prop')
  assert.match(source, /tabSpacingPreset\?: WorkspaceTabSpacingPreset \| ''/, 'WorkspaceLeftSidebar 缺少标签边距预设入参')
  assert.match(source, /'update:collapsed': \[value: boolean\]/, 'WorkspaceLeftSidebar 缺少折叠态更新事件')
  assert.match(source, /<WorkspaceLeftRail/, 'WorkspaceLeftSidebar 缺少常驻 left rail')
  assert.match(source, /:collapsed="props\.collapsed"/, 'WorkspaceLeftSidebar 未向 left rail 透传折叠态')
  assert.match(source, /<Transition :name="panelContentTransitionName" mode="out-in">/, 'WorkspaceLeftSidebar 缺少按方向切换的左侧模块内容过渡')
  assert.match(source, /panelContentTransitionKey/, 'WorkspaceLeftSidebar 缺少左侧模块内容切换 key')
  assert.match(source, /panelContentTransitionName = ref<'workspace-left-panel-content-forward' \| 'workspace-left-panel-content-backward'>/, 'WorkspaceLeftSidebar 缺少左侧模块内容切换方向状态')
  assert.match(source, /syncPanelTransitionDirection\(moduleId\)/, 'WorkspaceLeftSidebar 未在模块切换时同步动画方向')
  assert.match(source, /workspace-left-panel-content-forward-enter-from/, 'WorkspaceLeftSidebar 缺少左侧模块正向切换动画')
  assert.match(source, /workspace-left-panel-content-backward-enter-from/, 'WorkspaceLeftSidebar 缺少左侧模块反向切换动画')
  assert.match(source, /\.workspace-left-panel-content-forward-enter-from,[\s\S]*transform: translateY\(10px\);/, 'WorkspaceLeftSidebar 左栏正向切换仍不是纵向进入动画')
  assert.match(source, /\.workspace-left-panel-content-backward-enter-from,[\s\S]*transform: translateY\(-10px\);/, 'WorkspaceLeftSidebar 左栏反向切换仍不是纵向进入动画')
  assert.doesNotMatch(source, /\.workspace-left-panel-content-forward-enter-from,[\s\S]*translateX\(/, 'WorkspaceLeftSidebar 左栏正向切换仍保留横向位移')
  assert.doesNotMatch(source, /\.workspace-left-panel-content-backward-enter-from,[\s\S]*translateX\(/, 'WorkspaceLeftSidebar 左栏反向切换仍保留横向位移')
  assert.match(source, /:class="\{ 'workspace-left-panel--hidden': props\.collapsed \}"/, 'WorkspaceLeftSidebar 未改成 class 驱动的左侧 panel 折叠动画')
  assert.match(source, /workspace-left-dock--collapsed/, 'WorkspaceLeftSidebar 缺少折叠宽度样式')
  assert.match(source, /flex-basis: 56px;/, 'WorkspaceLeftSidebar 缺少外层 dock 收缩过渡宽度')
  assert.match(source, /workspace-left-dock--compact/, 'WorkspaceLeftSidebar 未为紧凑标签边距提供列表压缩样式')
  assert.match(source, /workspace-left-dock--default/, 'WorkspaceLeftSidebar 未为默认标签边距提供左栏密度类')
  assert.match(source, /workspace-left-dock--relaxed/, 'WorkspaceLeftSidebar 未为宽松标签边距提供左栏密度类')
  assert.match(source, /workspace-left-panel--hidden/, 'WorkspaceLeftSidebar 缺少左侧 panel 收起状态类')
  assert.match(source, /width: 0;/, 'WorkspaceLeftSidebar 缺少左侧 panel 宽度收起动画')
  assert.match(source, /opacity: 0;/, 'WorkspaceLeftSidebar 缺少左侧 panel 透明度收起动画')
  assert.match(source, /transform: translateX\(-10px\);/, 'WorkspaceLeftSidebar 缺少左侧 panel 位移动画')
  assert.match(source, /function switchModule\(moduleId: string, options: \{ allowCollapse\?: boolean \} = \{\}\)/, 'WorkspaceLeftSidebar 未给左栏 tab 提供可控的折叠切换入口')
  assert.match(source, /allowCollapse && !props\.collapsed && !recyclePanelOpen\.value && activeModule\.value === moduleId[\s\S]*emit\('update:collapsed', true\)/, 'WorkspaceLeftSidebar 点击当前左栏 tab 时仍不会收起 panel')
  assert.match(source, /function openRecycleBinPanel\(options: \{ allowCollapse\?: boolean \} = \{\}\)/, 'WorkspaceLeftSidebar 未给回收站入口提供折叠切换入口')
  assert.match(source, /allowCollapse && !props\.collapsed && recyclePanelOpen\.value[\s\S]*emit\('update:collapsed', true\)/, 'WorkspaceLeftSidebar 点击当前回收站入口时仍不会收起 panel')
  assert.match(source, /switchModule\(props\.commandModuleId, \{ allowCollapse: false \}\)/, 'WorkspaceLeftSidebar 在命令面板触发时仍可能误收起左栏')
  assert.match(styleSource, /\.workspace-left-dock--compact \{[\s\S]*--workspace-left-tree-row-min-height:\s*32px;[\s\S]*--workspace-left-tree-indent-step:\s*12px;/, '紧凑档未压缩左栏树行高和缩进')
  assert.match(styleSource, /\.workspace-left-dock--default \{[\s\S]*--workspace-left-tree-row-min-height:\s*36px;[\s\S]*--workspace-left-tree-indent-step:\s*14px;/, '默认档缺少左栏树密度基线')
  assert.match(styleSource, /\.workspace-left-dock--relaxed \{[\s\S]*--workspace-left-tree-row-min-height:\s*40px;[\s\S]*--workspace-left-tree-indent-step:\s*18px;/, '宽松档未放大左栏树行高和缩进')
  assert.match(styleSource, /min-height:\s*var\(--workspace-left-upload-row-min-height\);/, '上传行未接入左栏密度变量')
  assert.match(styleSource, /padding:\s*var\(--workspace-left-recycle-row-padding-y\)\s+var\(--workspace-left-recycle-row-padding-x\);/, '回收站行未接入左栏密度变量')
  assert.match(styleSource, /padding:\s*var\(--workspace-left-library-row-padding-y\)\s+var\(--workspace-left-library-row-padding-x\);/, '资料库行未接入左栏密度变量')
  assert.match(railSource, /workspace-left-rail__item--active': !props\.collapsed && item\.id === props\.activeId/, 'left rail 在折叠态仍显示顶部模块选中标识')
})

it('资源管理器删除独立系统资料库分组，只保留导入入口', async () => {
  const source = await readFile(WORKSPACE_RESOURCE_MANAGER_PANEL_FILE, 'utf8')

  assert.match(source, /从系统资料库导入/, '资源添加菜单未保留系统资料库导入入口')
  assert.match(source, /openLibraryModal/, '资源管理器未通过导入弹窗统一承接系统资料库入口')
  assert.doesNotMatch(source, /toggleSection\('systemLibrary'\)|sectionExpanded\.systemLibrary/, '资源管理器仍保留独立系统资料库分组')
})

it('项目资料区在 ResourceManagerPanel 内改为完整树，并支持拖拽排序', async () => {
  const source = await readFile(WORKSPACE_RESOURCE_MANAGER_PANEL_FILE, 'utf8')

  assert.match(source, /interface ProjectResourceTreeNode \{/, '资源管理器未定义树节点结构')
  assert.match(source, /const projectResourceTree = computed<ProjectResourceTreeNode\[\]>\(\(\) => \{/, '资源管理器未构建真实项目资料树')
  assert.match(source, /const visibleResources = computed<ProjectResourceTreeRow\[\]>\(\(\) => \{/, '资源管理器未将树拍平成可视行')
  assert.doesNotMatch(source, /selectedResources\.slice\(0,\s*10\)/, '资源管理器仍然截断前 10 个资源')
  assert.match(source, /createChildCollaborativeDoc/, '资源管理器未提供子协作文档创建动作')
  assert.match(source, /openChildUpload/, '资源管理器未提供上传到指定节点动作')
  assert.match(source, /buildProjectResourceTreePatchPayload/, '资源管理器未构建拖拽排序 payload')
  assert.match(source, /handleResourceDrop/, '资源管理器未处理树节点拖拽落点')
  assert.match(source, /workspace-tree-dropzone/, '资源管理器未渲染拖拽落点区域')
  assert.match(source, /function resolveTreeDepthOffset\(depth: number\): string \{[\s\S]*--workspace-left-tree-indent-step/, '资源管理器未将树缩进接入左栏密度变量')
  assert.doesNotMatch(source, /Math\.max\(0, row\.depth\) \* 14/, '资源管理器仍写死树缩进像素值')
})

it('左栏结构大纲不再用本地推断结果充当真实大纲', async () => {
  const [sidebarSource, resourceManagerSource] = await Promise.all([
    readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_RESOURCE_MANAGER_PANEL_FILE, 'utf8'),
  ])

  assert.doesNotMatch(sidebarSource, /workspace-left-sidebar__structural-contract|v-if="false"/, 'WorkspaceLeftSidebar 仍保留旧的占位结构契约')
  assert.doesNotMatch(resourceManagerSource, /const fallbackOutlineItems = computed<OutlineItem\[\]>\(\(\) => \{/, '资源管理器仍保留本地推断大纲 fallback')
  assert.doesNotMatch(resourceManagerSource, /extractResourceOutlineChildren/, '资源管理器仍在从资源正文推断假大纲')
  assert.match(resourceManagerSource, /return uploadItems/, '资源管理器在无后端大纲时未回退到仅展示真实上传任务')
})

it('left rail 图标收窄并改成轻量 popover 名称提示', async () => {
  const source = await readFile(WORKSPACE_LEFT_RAIL_FILE, 'utf8')

  assert.match(source, /font-variation-settings:\s*'FILL' 0,\s*'wght' 320,\s*'opsz' 24/, 'left rail 图标未改成轻字重')
  assert.match(source, /workspace-left-rail__popover/, 'left rail 缺少轻量 popover 名称层')
  assert.match(source, /workspace-left-rail__footer-divider/, 'left rail 未在设置与头像菜单之间加入分割线')
  assert.match(source, /<WorkspaceUserRailMenu/, 'left rail 底部缺少头像菜单入口')
  assert.doesNotMatch(source, /workspace-left-rail__item--active::before/, 'left rail 仍保留旧的粗高亮指示条')
  assert.doesNotMatch(source, /record_voice_over/, 'left rail 底部仍保留模拟答辩按钮')
})

it('上传入口已迁移到左侧 rail，并从左侧 aside 打开上传管理', async () => {
  const [sidebarSource, railSource, uploadSource] = await Promise.all([
    readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_LEFT_RAIL_FILE, 'utf8'),
    readFile(WORKSPACE_UPLOAD_ASIDE_FILE, 'utf8'),
  ])

  assert.match(sidebarSource, /uploadSummary\?: ProjectUploadSummary \| null/, 'WorkspaceLeftSidebar 缺少上传摘要入参')
  assert.match(sidebarSource, /uploadDrawerOpen\?: boolean/, 'WorkspaceLeftSidebar 缺少上传抽屉打开态入参')
  assert.match(sidebarSource, /uploadActivityItems\?: ProjectUploadActivityItem\[\]/, 'WorkspaceLeftSidebar 缺少上传活动列表入参')
  assert.match(sidebarSource, /@toggle-upload-drawer="emit\('toggleUploadDrawer'\)"/, 'WorkspaceLeftSidebar 未转发上传抽屉切换事件')
  assert.match(railSource, /<WorkspaceUploadAside/, 'WorkspaceLeftRail 未挂载上传 aside 组件')
  assert.match(uploadSource, /data-testid="workspace-left-rail-upload-button"/, '左 rail 上传入口缺少测试锚点')
  assert.match(uploadSource, /data-testid="workspace-left-upload-drawer"/, '左侧上传抽屉缺少测试锚点')
  assert.match(uploadSource, /<aside[\s\S]*class="workspace-upload-drawer workspace-upload-drawer--aside"/, '上传管理未使用 aside 语义容器')
  assert.match(uploadSource, /workspace-upload-drawer--aside/, '上传管理未改成左侧 aside 形态')
  assert.match(uploadSource, /\.workspace-upload-drawer--aside \{[\s\S]*top:\s*0;[\s\S]*bottom:\s*0;[\s\S]*left:\s*100%;/, '上传管理未贴左 rail 展开成真正侧边 aside')
  assert.match(uploadSource, /\.workspace-upload-drawer--aside \{[\s\S]*border-radius:\s*0 20px 20px 0;/, '上传管理 aside 缺少贴边抽屉圆角')
  assert.doesNotMatch(uploadSource, /max-height:\s*min\(72vh,\s*720px\)/, '上传管理仍在使用浮层卡片高度限制')
})
