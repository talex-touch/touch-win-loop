import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')
const WORKSPACE_HEADER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceHeader.vue')
const WORKSPACE_AI_TOGGLE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAiToggleButton.vue')
const WORKSPACE_SIDEBAR_LAYOUT_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceSidebarLayout.ts')
const WORKSPACE_PROJECT_AI_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectAi.ts')
const WORKSPACE_PROJECT_SHELL_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectShell.ts')

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

it('右栏输入框将模式切换内嵌到底部工具带，并移除冗余资料提示', async () => {
  const source = await readFile(RIGHT_SIDEBAR_FILE, 'utf8')

  assert.match(source, /workspace-chat-scroll-content/, '右栏缺少统一的滚动内容容器')
  assert.match(source, /workspace-chat-messages/, '右栏缺少独立消息列表容器')
  assert.match(source, /workspace-chat-composer__toolbar/, '右栏输入框内缺少模式工具带')
  assert.match(source, /workspace-chat-composer__mode-pill/, '右栏输入框内缺少模式胶囊')
  assert.match(source, /workspace-mode-select--embedded/, '右栏模式选择未内嵌到输入框内部')
  assert.match(source, /workspace-chat-composer__send-spark/, '右栏发送按钮缺少炫彩 spark 背景层')
  assert.doesNotMatch(source, /workspace-right-sidebar-collapse-button/, '右栏仍保留内部收起按钮')
  assert.doesNotMatch(source, /已关联资料：/, '右栏底部仍保留资料关联提示')
  assert.doesNotMatch(source, /Shift\+Tab/, '右栏底部仍保留 Shift+Tab 提示')
  assert.match(source, /flex-wrap:\s*wrap/, '右栏底部元信息未允许换行')
  assert.match(source, /leading-5/, '右栏空态或提示卡未统一紧凑行高')
})

it('项目页通过侧栏布局 composable 管理右栏手动收起态与断点自动收起态', async () => {
  const [workspaceSource, layoutSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_SIDEBAR_LAYOUT_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /import \{ useWorkspaceSidebarLayout \} from '~\/composables\/useWorkspaceSidebarLayout'/, '项目页未接入统一的侧栏布局 composable')
  assert.match(
    workspaceSource,
    /const \{\s*leftSidebarCollapsed,\s*rightSidebarUserCollapsed,\s*sidebarLayoutHydrating,\s*rightSidebarCollapsed,\s*initializeRightSidebarBreakpointTracking,\s*disposeRightSidebarBreakpointTracking,\s*setRightSidebarUserCollapsed,\s*applySidebarLayoutState,\s*collapseRightSidebar,\s*expandRightSidebar,\s*\} = useWorkspaceSidebarLayout\(\)/,
    '项目页未从 composable 解构右栏布局状态机',
  )
  assert.match(layoutSource, /const rightSidebarUserCollapsed = ref\(true\)/, '侧栏布局 composable 未将右栏默认设为收起')
  assert.match(layoutSource, /const rightSidebarAutoCollapsed = ref\(false\)/, '侧栏布局 composable 缺少右栏自动收起状态')
  assert.match(layoutSource, /const rightSidebarAutoRestorePending = ref\(false\)/, '侧栏布局 composable 缺少右栏自动恢复状态')
  assert.match(layoutSource, /const rightSidebarCollapsed = computed\(\(\) => rightSidebarUserCollapsed\.value \|\| rightSidebarAutoCollapsed\.value\)/, '侧栏布局 composable 未合成右栏最终收起态')
  assert.match(layoutSource, /DEFAULT_RIGHT_SIDEBAR_BREAKPOINT_QUERY = '\(min-width: 1280px\)'/, '侧栏布局 composable 未固定右栏窄屏断点')
  assert.match(layoutSource, /window\.matchMedia\(breakpointQuery\)/, '侧栏布局 composable 未监听右栏断点变化')
})

it('项目草稿只持久化右栏手动收起态，断点自动收起不入草稿', async () => {
  const [workspaceSource, layoutSource, shellSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_SIDEBAR_LAYOUT_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_SHELL_FILE, 'utf8'),
  ])

  assert.match(
    workspaceSource,
    /ui:\s*\{\s*leftSidebarCollapsed: leftSidebarCollapsed\.value,\s*rightSidebarCollapsed: rightSidebarUserCollapsed\.value,\s*\}/,
    '项目草稿仍在持久化右栏自动收起态',
  )
  assert.match(shellSource, /setRightSidebarUserCollapsed\(normalized\.rightSidebarCollapsed, \{ suppressPersist: true \}\)/, '项目页恢复视图状态时未抑制右栏手动态持久化')
  assert.match(workspaceSource, /applySidebarLayoutState\(draft\.ui\)/, '项目页未通过侧栏布局 composable 应用草稿中的左右栏状态')
  assert.match(layoutSource, /function collapseRightSidebar\(\): void \{\s+setRightSidebarUserCollapsed\(true\)/, '右栏收起入口未走手动状态 setter')
  assert.match(layoutSource, /function expandRightSidebar\(\): void \{\s+setRightSidebarUserCollapsed\(false\)/, '右栏展开入口未走手动状态 setter')
})

it('项目页通过头部 AI 按钮切换右栏或终审助手，并清理旧 hover handle 与浮动按钮', async () => {
  const [workspaceSource, shellSource, headerSource, aiToggleSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_SHELL_FILE, 'utf8'),
    readFile(WORKSPACE_HEADER_FILE, 'utf8'),
    readFile(WORKSPACE_AI_TOGGLE_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /const headerAiCollapsed = computed\(\(\) => \{[\s\S]*workbenchMode\.value === 'final_review'[\s\S]*!finalReviewAssistantOpen\.value[\s\S]*rightSidebarCollapsed\.value/, '项目页未为 header AI 按钮区分终审助手与常规右栏收起态')
  assert.match(shellSource, /function toggleRightSidebar\(\): void \{[\s\S]*if \(options\.workbenchMode\.value === 'final_review'\) \{[\s\S]*toggleFinalReviewAssistantDrawer\(\)[\s\S]*return[\s\S]*\}/, '项目页未在终审工作台下把 header AI 按钮重定向到终审助手抽屉')
  assert.match(workspaceSource, /:ai-collapsed="headerAiCollapsed"/, '项目页未向头部透传统一的 AI 收起态')
  assert.match(workspaceSource, /@toggle-ai-sidebar="toggleRightSidebar"/, '项目页未将头部 AI 按钮接入统一切换逻辑')
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

it('项目页头部工作台 tabs 与答辩模式仍共用状态，终审工作台改走独立驾驶舱', async () => {
  const [workspaceSource, projectAiSource, rightSidebarSource, headerSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_AI_FILE, 'utf8'),
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_HEADER_FILE, 'utf8'),
  ])

  assert.match(projectAiSource, /const workbenchMode = ref<WorkspaceWorkbenchMode>\('project'\)/, '项目 AI composable 缺少工作台模式状态')
  assert.match(projectAiSource, /const lastPrimaryAiMode = ref<WorkspacePrimaryAiMode>\('dialog_ask'\)/, '项目 AI composable 缺少最近一次主工作台模式缓存')
  assert.match(projectAiSource, /const finalReviewMaterialsOpen = ref\(false\)/, '项目 AI composable 缺少终审资料抽屉状态')
  assert.match(projectAiSource, /const finalReviewAssistantOpen = ref\(false\)/, '项目 AI composable 缺少终审助手抽屉状态')
  assert.match(workspaceSource, /async function updateWorkbenchMode\(nextMode: WorkspaceWorkbenchMode\)/, '项目页缺少头部工作台切换入口')
  assert.match(workspaceSource, /rememberPreFinalReviewWorkbenchState\(\)/, '进入终审工作台前未缓存普通工作区状态')
  assert.match(workspaceSource, /restorePreFinalReviewWorkbenchState\(\)/, '离开终审工作台时未恢复普通工作区状态')
  assert.match(workspaceSource, /if \(nextMode === 'final_review'\) \{[\s\S]*workbenchMode\.value = 'final_review'[\s\S]*aiMode\.value = 'dialog_ask'/, '项目页进入终审工作台后未切到终审助手的 dialog_ask 数据流')
  assert.match(workspaceSource, /if \(next === 'defense'\) \{\s+workbenchMode\.value = 'defense'/, 'aiMode 切换到答辩时未同步工作台 tabs')
  assert.match(workspaceSource, /if \(workbenchMode\.value !== 'final_review'\) \{\s+workbenchMode\.value = 'project'\s+lastPrimaryAiMode\.value = next\s+\}/, '项目页在终审工作台下仍会把最近主模式缓存覆盖掉')
  assert.match(workspaceSource, /@update:workbench-mode="updateWorkbenchMode"/, '工作区头部未接入工作台 tabs 事件')
  assert.match(headerSource, /data-testid="workspace-header-workbench-tabs"/, '工作区头部缺少工作台 tabs 容器')
  assert.match(headerSource, /项目工作台/, '工作区头部缺少项目工作台入口')
  assert.match(headerSource, /答辩工作台/, '工作区头部缺少答辩工作台入口')
  assert.match(headerSource, /终审工作台/, '工作区头部缺少终审工作台入口')
  assert.doesNotMatch(headerSource, />\s*终审\s*<\/button>/, '工作区头部仍保留独立终审按钮')
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
