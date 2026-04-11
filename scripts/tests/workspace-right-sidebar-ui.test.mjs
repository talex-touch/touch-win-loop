import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')
const WORKSPACE_HEADER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceHeader.vue')
const WORKSPACE_AI_TOGGLE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAiToggleButton.vue')

it('右栏采用三段式布局，底部输入区不再进入滚动容器', async () => {
  const source = await readFile(RIGHT_SIDEBAR_FILE, 'utf8')

  assert.match(
    source,
    /<aside[\s\S]*class="[^"]*flex[^"]*flex-col[^"]*h-full[^"]*min-h-0[^"]*"[\s\S]*<div class="[^"]*shrink-0[^"]*space-y-2"[\s\S]*<div class="[^"]*flex-1[^"]*h-0[^"]*min-h-0[^"]*overflow-y-auto"[\s\S]*<div class="workspace-chat-composer">/,
    '右栏未保持头部 / 中部滚动区 / 底部输入区的三段式结构',
  )
  assert.doesNotMatch(source, /position:\s*sticky/, '右栏底部输入区仍依赖 sticky 定位')
  assert.doesNotMatch(source, /mt-auto/, '右栏布局仍依赖 mt-auto 顶开输入区')
  assert.doesNotMatch(source, /pb-36/, '右栏滚动区仍依赖底部补白占位')
})

it('右栏内容区与底部元信息支持紧凑显示和换行', async () => {
  const source = await readFile(RIGHT_SIDEBAR_FILE, 'utf8')

  assert.match(source, /workspace-chat-scroll-content/, '右栏缺少统一的滚动内容容器')
  assert.match(source, /workspace-chat-messages/, '右栏缺少独立消息列表容器')
  assert.match(source, /workspace-chat-composer__meta/, '右栏底部缺少独立元信息容器')
  assert.match(source, /workspace-chat-composer__send-spark/, '右栏发送按钮缺少炫彩 spark 背景层')
  assert.doesNotMatch(source, /workspace-right-sidebar-collapse-button/, '右栏仍保留内部收起按钮')
  assert.match(source, /flex-wrap:\s*wrap/, '右栏底部元信息未允许换行')
  assert.match(source, /leading-5/, '右栏空态或提示卡未统一紧凑行高')
})

it('项目页将右栏手动收起态与断点自动收起态分离', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /const rightSidebarUserCollapsed = ref\(false\)/, '项目页缺少右栏手动收起状态')
  assert.match(source, /const rightSidebarAutoCollapsed = ref\(false\)/, '项目页缺少右栏自动收起状态')
  assert.match(source, /const rightSidebarAutoRestorePending = ref\(false\)/, '项目页缺少右栏自动恢复状态')
  assert.match(source, /const rightSidebarCollapsed = computed\(\(\) => rightSidebarUserCollapsed\.value \|\| rightSidebarAutoCollapsed\.value\)/, '项目页未合成右栏最终收起态')
  assert.match(source, /RIGHT_SIDEBAR_BREAKPOINT_QUERY = '\(min-width: 1280px\)'/, '项目页未固定右栏窄屏断点')
  assert.match(source, /window\.matchMedia\(RIGHT_SIDEBAR_BREAKPOINT_QUERY\)/, '项目页未监听右栏断点变化')
})

it('项目草稿只持久化右栏手动收起态，断点自动收起不入草稿', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(
    source,
    /ui:\s*\{\s*leftSidebarCollapsed: leftSidebarCollapsed\.value,\s*rightSidebarCollapsed: rightSidebarUserCollapsed\.value,\s*\}/,
    '项目草稿仍在持久化右栏自动收起态',
  )
  assert.match(source, /function collapseRightSidebar\(\): void \{\s+setRightSidebarUserCollapsed\(true\)/, '右栏收起按钮未走手动状态入口')
  assert.match(source, /function expandRightSidebar\(\): void \{\s+setRightSidebarUserCollapsed\(false\)/, '右栏展开按钮未走手动状态入口')
})

it('项目页通过头部 AI 按钮切换右栏展开收起，并清理旧 hover handle 与浮动按钮', async () => {
  const [workspaceSource, headerSource, aiToggleSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_HEADER_FILE, 'utf8'),
    readFile(WORKSPACE_AI_TOGGLE_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /function toggleRightSidebar\(\): void \{/, '项目页缺少统一的右栏切换入口')
  assert.match(workspaceSource, /:ai-collapsed="rightSidebarCollapsed"/, '项目页未向头部透传右栏收起态')
  assert.match(workspaceSource, /@toggle-ai-sidebar="toggleRightSidebar"/, '项目页未将头部 AI 按钮接入右栏切换逻辑')
  assert.match(workspaceSource, /class="workspace-right-dock"/, '项目页缺少右栏 dock 容器')
  assert.match(workspaceSource, /workspace-right-dock__panel--hidden/, '项目页缺少右栏 panel 隐藏态类')
  assert.match(workspaceSource, /\.workspace-right-dock\s*\{[\s\S]*transition:[\s\S]*flex-basis 0\.22s ease/, '项目页未给右栏 dock 配置宽度过渡动画')
  assert.match(workspaceSource, /\.workspace-right-dock--collapsed\s*\{[\s\S]*flex-basis:\s*0[\s\S]*width:\s*0[\s\S]*min-width:\s*0[\s\S]*max-width:\s*0/, '项目页右栏收起后仍在占用布局宽度')
  assert.match(workspaceSource, /\.workspace-right-dock__panel--hidden\s*\{[\s\S]*opacity:\s*0[\s\S]*transform:\s*translateX\(18px\) scale\(0\.985\)/, '项目页未给右栏 panel 配置淡出位移动画')
  assert.doesNotMatch(workspaceSource, /workspace-right-sidebar-expand-button/, '项目页仍保留旧的浮动展开按钮')
  assert.doesNotMatch(workspaceSource, /workspace-right-dock__collapsed-toggle/, '项目页仍保留旧的浮动展开按钮样式')
  assert.doesNotMatch(workspaceSource, /workspace-side-handle--right/, '项目页仍残留旧的右侧 hover handle 类名')
  assert.doesNotMatch(workspaceSource, /workspace-side-toggle/, '项目页仍残留旧的右侧 hover toggle 样式')

  assert.match(headerSource, /aiCollapsed\?: boolean/, 'WorkspaceHeader 缺少 AI 收起态入参')
  assert.match(headerSource, /\(event: 'toggleAiSidebar'\): void/, 'WorkspaceHeader 缺少 AI 切换事件')
  assert.match(headerSource, /<WorkspaceAiToggleButton/, 'WorkspaceHeader 未挂载独立 AI 按钮组件')
  assert.doesNotMatch(headerSource, /workspace-header-user-trigger/, 'WorkspaceHeader 仍保留旧头像入口')

  assert.match(aiToggleSource, /data-testid="workspace-header-ai-toggle"/, '独立 AI 按钮组件缺少测试锚点')
  assert.match(aiToggleSource, /collapsed\?: boolean/, '独立 AI 按钮组件缺少收起态入参')
  assert.match(aiToggleSource, /workspace-ai-toggle--active/, '独立 AI 按钮组件缺少展开态样式')
  assert.match(aiToggleSource, /workspace-ai-toggle__spark/, '独立 AI 按钮缺少炫彩 spark 背景层')
  assert.match(aiToggleSource, /M23 18v2h-2v1h-1v2h-2/, '独立 AI 按钮组件未使用指定 SVG 图形')
})

it('项目页头部工作台 tabs 与右栏答辩模式共用同一套状态', async () => {
  const workspaceSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const rightSidebarSource = await readFile(RIGHT_SIDEBAR_FILE, 'utf8')
  const headerSource = await readFile(WORKSPACE_HEADER_FILE, 'utf8')

  assert.match(workspaceSource, /const workbenchMode = ref<WorkspaceWorkbenchMode>\('project'\)/, '项目页缺少工作台模式状态')
  assert.match(workspaceSource, /const lastPrimaryAiMode = ref<WorkspacePrimaryAiMode>\('dialog_ask'\)/, '项目页缺少最近一次主工作台模式缓存')
  assert.match(workspaceSource, /function updateWorkbenchMode\(nextMode: WorkspaceWorkbenchMode\)/, '项目页缺少头部工作台切换入口')
  assert.match(workspaceSource, /@update:workbench-mode="updateWorkbenchMode"/, '工作区头部未接入工作台 tabs 事件')
  assert.match(headerSource, /data-testid="workspace-header-workbench-tabs"/, '工作区头部缺少工作台 tabs 容器')
  assert.match(headerSource, /项目工作台/, '工作区头部缺少项目工作台入口')
  assert.match(headerSource, /答辩工作台/, '工作区头部缺少答辩工作台入口')
  assert.match(workspaceSource, /if \(next === 'defense'\) \{\s+workbenchMode\.value = 'defense'/, 'aiMode 切换到答辩时未同步工作台 tabs')
  assert.match(workspaceSource, /lastPrimaryAiMode\.value = next/, '返回项目工作台前未缓存最近一次主模式')
  assert.match(rightSidebarSource, /:disabled="aiMode === 'defense'"/, '右栏模式下拉在答辩工作台仍可直接切换')
  assert.match(rightSidebarSource, /答辩工作台（顶部切换）/, '右栏答辩态缺少顶部切换提示')
})

it('右栏移除固定 mock 头像与默认欢迎语，空白期改成骨骼屏和真实头像组件', async () => {
  const [workspaceSource, rightSidebarSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /:workspace-preparing="workspacePreparing"/, '项目页未向右栏透传准备态')
  assert.match(workspaceSource, /:current-user-name="me\?\.user\.username \|\| ''"/, '项目页未向右栏透传当前用户名')
  assert.match(workspaceSource, /:current-user-avatar-url="me\?\.user\.avatarUrl \|\| ''"/, '项目页未向右栏透传当前用户头像')
  assert.match(rightSidebarSource, /workspacePreparing\?: boolean/, '右栏缺少准备态入参')
  assert.match(rightSidebarSource, /currentUserAvatarUrl\?: string \| null/, '右栏缺少真实头像入参')
  assert.match(rightSidebarSource, /<UnifiedAvatar/, '右栏未改为统一头像组件')
  assert.match(rightSidebarSource, /showChatSkeleton = computed\(\(\) => \{/, '右栏缺少聊天骨骼屏逻辑')
  assert.doesNotMatch(rightSidebarSource, /googleusercontent\.com\/aida-public/, '右栏仍保留固定外链 mock 头像')
})

it('项目页左侧不再依赖 hover handle，leftSidebarCollapsed 仅控制 panel 折叠', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /:collapsed="leftSidebarCollapsed"/, '项目页未将左栏折叠态透传给 WorkspaceLeftSidebar')
  assert.match(source, /@update:collapsed="leftSidebarCollapsed = \$event"/, '项目页未接收左栏折叠态更新事件')
  assert.doesNotMatch(source, /workspace-side-handle--left/, '项目页仍保留旧的左侧 hover handle')
  assert.doesNotMatch(source, /v-if="!leftSidebarCollapsed" class="workspace-side-anchor workspace-side-anchor--left"/, '项目页仍在通过卸载整块左栏处理折叠')
})
