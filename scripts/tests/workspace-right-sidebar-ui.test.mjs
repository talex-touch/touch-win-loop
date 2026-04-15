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
  assert.match(source, /workspace-chat-composer__input-shell--running/, '右栏输入框缺少运行中 glow 强化态')
  assert.match(source, /workspace-chat-composer__send-spark/, '右栏发送按钮缺少炫彩 spark 背景层')
  assert.match(source, /'interruptChat': \[\]/, '右栏缺少打断聊天事件')
  assert.match(source, /chatLoading \? emit\('interruptChat'\) : emit\('sendChat'\)/, '右栏发送按钮未在运行中切换为打断')
  assert.match(source, /chatLoading \? 'stop' : 'send'/, '右栏发送按钮未在运行中切换 stop 图标')
  assert.doesNotMatch(source, /workspace-right-sidebar-collapse-button/, '右栏仍保留内部收起按钮')
  assert.doesNotMatch(source, /已关联资料：/, '右栏底部仍保留资料关联提示')
  assert.doesNotMatch(source, /Shift\+Tab/, '右栏底部仍保留 Shift+Tab 提示')
  assert.match(source, /flex-wrap:\s*wrap/, '右栏底部元信息未允许换行')
  assert.match(source, /leading-5/, '右栏空态或提示卡未统一紧凑行高')
})

it('右栏输入框支持通过 Shift+Tab 轮换右下角助手模式', async () => {
  const source = await readFile(RIGHT_SIDEBAR_FILE, 'utf8')

  assert.match(source, /function resolveEmbeddedModeOptions\(\): Array<\{ value: WorkspaceDefenseSidebarAiMode \| WorkspaceProjectAssistantMode, label: string \}> \{/, '右栏缺少内嵌模式选项解析函数')
  assert.match(source, /function applyModeSelectValue\(value: WorkspaceDefenseSidebarAiMode \| WorkspaceProjectAssistantMode\): void \{/, '右栏缺少统一的模式切换入口')
  assert.match(source, /function cycleEmbeddedModeByShortcut\(direction: 1 \| -1\): void \{/, '右栏缺少 Shift\+Tab 模式轮换逻辑')
  assert.match(source, /if \(event\.key === 'Tab' && event\.shiftKey && !event\.metaKey && !event\.ctrlKey && !event\.altKey\) \{[\s\S]*event\.preventDefault\(\)[\s\S]*cycleEmbeddedModeByShortcut\(-1\)[\s\S]*return[\s\S]*\}/, '右栏输入框未将 Shift\+Tab 接到右下角助手模式轮换')
})

it('右栏在 AI 未配置时展示禁用提示，并禁用当前模式输入与触发按钮', async () => {
  const [sidebarSource, workspaceSource] = await Promise.all([
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
  ])

  assert.match(sidebarSource, /aiEnabled\?: boolean/, '右栏缺少 AI 可用态入参')
  assert.match(sidebarSource, /aiDisabledReason\?: string/, '右栏缺少 AI 禁用原因入参')
  assert.match(sidebarSource, /workspace-right-sidebar__disabled-notice/, '右栏缺少未配置提示卡')
  assert.match(sidebarSource, /if \(!props\.aiEnabled\)\s+return aiDisabledNoticeText\.value/, '右栏未在禁用态替换输入占位提示')
  assert.match(sidebarSource, /:disabled="!props\.aiEnabled"/, '右栏输入框或新建按钮未接入禁用态')
  assert.match(sidebarSource, /:disabled="props\.chatInterrupting \|\| \(!props\.aiEnabled && !chatLoading\)"/, '右栏发送按钮未在禁用态禁止发送')
  assert.match(sidebarSource, /documentAssistActionStatus\?: Record<AiWorkspaceDocumentAction, DocumentAssistActionStatus>/, '右栏缺少文档动作级状态入参')
  assert.match(sidebarSource, /function documentAssistActionEnabled\(action: AiWorkspaceDocumentAction\): boolean \{/, '右栏缺少文档动作级可用性判断')
  assert.match(sidebarSource, /:disabled="props\.documentAssistRunning \|\| !documentAssistActionEnabled\('summarize'\)"/, '右栏文档总结动作未在单动作禁用态关闭')
  assert.match(sidebarSource, /:disabled="props\.documentAssistRunning \|\| !documentAssistActionEnabled\('rewrite'\)"/, '右栏文档润写动作未在单动作禁用态关闭')
  assert.match(sidebarSource, /:disabled="props\.documentAssistRunning \|\| !documentAssistActionEnabled\('expand'\)"/, '右栏文档扩写动作未在单动作禁用态关闭')
  assert.match(sidebarSource, /:disabled="props\.documentAssistRunning \|\| !documentAssistActionEnabled\('complete_context'\)"/, '右栏文档补全上下文动作未在单动作禁用态关闭')
  assert.match(sidebarSource, /:disabled="props\.documentAssistRunning \|\| !documentAssistActionEnabled\('restructure'\)"/, '右栏文档结构整理动作未在单动作禁用态关闭')
  assert.match(sidebarSource, /:disabled="defenseSummaryLoading \|\| !props\.aiEnabled"/, '右栏答辩总结按钮未在禁用态关闭')
  assert.match(sidebarSource, /function handleCreateChatSession\(\): void \{[\s\S]*if \(!props\.aiEnabled\)\s+return[\s\S]*emit\('createChatSession'\)/, '右栏新建会话入口未在禁用态提前返回')
  assert.match(workspaceSource, /:ai-enabled="currentAiModeAvailable"/, '项目页未向右栏透传当前模式可用态')
  assert.match(workspaceSource, /:ai-disabled-reason="currentAiDisabledReason"/, '项目页未向右栏透传当前模式禁用原因')
  assert.match(workspaceSource, /:document-assist-action-status="documentAssistActionStatusMap"/, '项目页未向右栏透传文档动作级状态')
})

it('项目页为聊天流式请求接入 AbortController，并把右栏打断事件连到中断入口', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /const activeChatStreamAbortController = ref<AbortController \| null>\(null\)/, '项目页缺少聊天流式请求 AbortController')
  assert.match(source, /signal,\s+headers:/, '项目页 AI 流式请求未透传 abort signal')
  assert.match(source, /function interruptChatMessage\(\): void \{[\s\S]*activeChatStreamAbortController\.value\.abort\(\)/, '项目页缺少聊天打断入口')
  assert.match(source, /if \(isAbortError\(error\)\) \{[\s\S]*statusLine\.value = '已打断当前 AI 运行。'/, '项目页未单独处理聊天中断状态')
  assert.match(source, /:chat-interrupting="chatInterrupting"/, '项目页未向右栏透传聊天打断态')
  assert.match(source, /@interrupt-chat="interruptChatMessage"/, '项目页未接入右栏打断事件')
})

it('右栏会话区改为横向 tabs，右侧常驻新建对话并按类型显示图标', async () => {
  const source = await readFile(RIGHT_SIDEBAR_FILE, 'utf8')

  assert.match(source, /openChatSessionIds\?: string\[\]/, '右栏缺少打开中的会话 tabs id 列表入参')
  assert.match(source, /const openChatSessions = computed\(\(\) => \{/, '右栏缺少基于打开中会话 id 的 tabs 计算逻辑')
  assert.match(source, /workspace-right-sidebar__session-strip/, '右栏会话区缺少 tabs 外层容器')
  assert.match(source, /data-testid="workspace-right-sidebar-session-tabs"/, '右栏会话区缺少 tabs 测试锚点')
  assert.match(source, /v-if="openChatSessions.length === 0"/, '右栏会话 tabs 空态仍未切到打开中的会话集合')
  assert.match(source, /v-for="session in openChatSessions"/, '右栏顶部 tabs 仍未切到打开中的会话集合')
  assert.match(source, /workspace-right-sidebar__session-tab--active/, '右栏会话 tabs 缺少激活态样式')
  assert.match(source, /<a-trigger[\s\S]*trigger="hover"[\s\S]*workspace-right-sidebar__session-popover/, '右栏会话 tabs 未在 hover 时展示详情浮层')
  assert.match(source, /workspace-right-sidebar__session-create/, '右栏会话区缺少常驻的新建对话按钮')
  assert.match(source, /aria-label="新建对话"/, '右栏新建对话按钮缺少 icon-only 按钮语义标记')
  assert.match(source, /handleCreateChatSession\(\)/, '右栏新建对话按钮未通过统一入口触发创建事件')
  assert.match(source, /historyPopoverVisible = ref\(false\)/, '右栏缺少历史记录 popover 可见态')
  assert.match(source, /workspace-right-sidebar__session-history-button/, '右栏会话区缺少历史记录按钮')
  assert.match(source, /data-testid="workspace-right-sidebar-session-history-button"/, '右栏历史记录按钮缺少测试锚点')
  assert.match(source, /data-testid="workspace-right-sidebar-session-history-popover"/, '右栏缺少历史记录 popover 测试锚点')
  assert.match(source, /workspace-right-sidebar__session-history-delete/, '右栏历史记录缺少删除按钮')
  assert.match(source, /data-testid="workspace-right-sidebar-session-history-delete"/, '右栏历史记录删除按钮缺少测试锚点')
  assert.match(source, /emit\('deleteChatSession', sessionId\)/, '右栏历史记录删除按钮未触发删除事件')
  assert.match(source, /resolveSessionTabIcon\(session\)/, '右栏会话 tabs 未为不同类型会话渲染图标')
  assert.match(source, /resolveSessionTypeLabel\(session\)/, '右栏会话浮层未展示会话类型')
  assert.match(source, /formatSessionDetailTime\(session\.lastMessageAt \|\| session\.updatedAt\)/, '右栏会话浮层未展示更新时间')
  assert.match(source, /if \(title\.startsWith\('Loopy 文档增强'\)\)\s+return title\.replace\('Loopy 文档增强', 'Loopy 文稿助手'\)/, '右栏未将旧的文档增强会话标题归一化为文稿助手')
  assert.match(source, /title\.includes\('选题助手'\)/, '右栏会话 tabs 未识别选题助手类型')
  assert.match(source, /resolveSessionTabLabel\(session\)/, '右栏会话 tabs 未渲染截断后的标题')
  assert.match(source, /chars\.slice\(0,\s*8\)/, '右栏会话标题未截断到前 8 个字')
  assert.match(source, /overflow-x:\s*auto/, '右栏会话 tabs 未开启横向滚动')
  assert.match(source, /scrollbar-width:\s*none/, '右栏会话 tabs 未隐藏 Firefox 横向滚动条')
  assert.match(source, /workspace-right-sidebar__session-tabs::-webkit-scrollbar[\s\S]*display:\s*none/, '右栏会话 tabs 未隐藏 WebKit 横向滚动条')
  assert.match(source, /border-radius:\s*0/, '右栏会话 tabs 仍保留圆角')
  assert.doesNotMatch(source, /workspace-right-sidebar__session-button/, '右栏仍保留旧的竖向会话卡片按钮')
  assert.doesNotMatch(source, /消息 \{\{ session\.messageCount \}\}/, '右栏会话 tabs 仍保留旧的消息计数副标题')
  assert.doesNotMatch(source, />\s*<span>新建对话<\/span>/, '右栏新建对话按钮仍保留文本标签')
})

it('项目页接入会话删除状态，并把右栏历史记录删除事件连到删除接口', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /const deletingChatSessionId = ref\(''\)/, '项目页缺少会话删除中的状态')
  assert.match(source, /async function deleteChatSession\(sessionId: string\)/, '项目页缺少删除会话入口')
  assert.match(source, /const MAX_OPEN_CHAT_SESSION_TABS = 8/, '项目页缺少打开中会话 tabs 上限约束')
  assert.match(source, /const \{\s*[\s\S]*openChatSessionIds,[\s\S]*activeChatSessionId,[\s\S]*\} = useWorkspaceProjectAi\(\)/, '项目页未从 AI composable 解构打开中的会话 tabs 状态')
  assert.match(source, /function syncOpenChatSessionTabsInScope\(/, '项目页缺少打开中会话 tabs 作用域同步逻辑')
  assert.match(source, /:open-chat-session-ids="openChatSessionIds"/, '项目页未向右栏透传打开中的会话 tabs 列表')
  assert.match(
    source,
    /buildProjectApiRequestUrl\([\s\S]*endpoint\(`\/teams\/\$\{workspaceId\}\/chat\/sessions\/\$\{sessionId\}`\),[\s\S]*projectId,[\s\S]*mode: aiMode\.value[\s\S]*method: 'DELETE'/,
    '项目页删除会话请求未携带 projectId + mode 或未使用 Team 删除接口',
  )
  assert.match(
    source,
    /await loadChatSessions\({[\s\S]*preferredSessionId: activeChatSessionId\.value === sessionId \? '' : activeChatSessionId\.value,[\s\S]*autoCreate: false,[\s\S]*fallbackToFirst: true,[\s\S]*}\)/,
    '项目页删除会话后未按预期回填剩余会话或空态',
  )
  assert.match(source, /statusLine\.value = '已删除会话。'/, '项目页删除会话成功后缺少状态提示')
  assert.match(source, /:chat-session-deleting-id="deletingChatSessionId"/, '项目页未向右栏透传会话删除中的状态')
  assert.match(source, /@delete-chat-session="deleteChatSession"/, '项目页未接入右栏会话删除事件')
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

it('项目页头部工作台改为研发/答辩/终审分流，右栏助手按工作台解耦', async () => {
  const [workspaceSource, projectAiSource, rightSidebarSource, headerSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_AI_FILE, 'utf8'),
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_HEADER_FILE, 'utf8'),
  ])

  assert.match(projectAiSource, /const workbenchMode = ref<WorkspaceWorkbenchMode>\('project'\)/, '项目 AI composable 缺少工作台模式状态')
  assert.match(projectAiSource, /const lastPrimaryAiMode = ref<WorkspacePrimaryAiMode>\('dialog_ask'\)/, '项目 AI composable 缺少最近一次主工作台模式缓存')
  assert.match(projectAiSource, /const projectAssistantMode = ref<WorkspaceProjectAssistantMode>\('contextual'\)/, '项目 AI composable 缺少研发侧 contextual 助手状态')
  assert.match(projectAiSource, /const defenseWorkbenchAiMode = ref<WorkspaceDefenseWorkbenchAiMode>\('defense'\)/, '项目 AI composable 缺少答辩工作台模式状态')
  assert.match(projectAiSource, /const finalReviewMaterialsOpen = ref\(false\)/, '项目 AI composable 缺少终审资料抽屉状态')
  assert.match(projectAiSource, /const finalReviewAssistantOpen = ref\(false\)/, '项目 AI composable 缺少终审助手抽屉状态')
  assert.match(workspaceSource, /type WorkspaceProjectAssistantMode = 'contextual' \| 'dialog_ask'/, '项目页缺少研发助手选择状态定义')
  assert.match(workspaceSource, /const projectContextualAssistant = computed<WorkspaceProjectContextualAssistant \| null>\(\(\) => \{[\s\S]*if \(previewMode\.value === 'markdown'\) \{[\s\S]*label: '文稿助手'[\s\S]*if \(activePreviewResourcePurpose\.value === 'design'\) \{[\s\S]*label: '设计助手'[\s\S]*if \(activePreviewResourcePurpose\.value !== 'workflow'\) \{[\s\S]*label: '原型助手'/, '项目页未按 tab 类型解析文稿\/设计\/原型助手')
  assert.match(workspaceSource, /const projectResolvedAiMode = computed<WorkspacePrimaryAiMode>\(\(\) => \{[\s\S]*if \(projectAssistantMode\.value === 'dialog_ask'\)\s+return 'dialog_ask'[\s\S]*projectContextualAssistant\.value\?\.aiMode \|\| 'dialog_ask'/, '项目页未将研发侧显式对话覆盖到 contextual 助手之上')
  assert.match(workspaceSource, /async function updateWorkbenchMode\(nextMode: WorkspaceWorkbenchMode\)/, '项目页缺少头部工作台切换入口')
  assert.match(workspaceSource, /rememberPreFinalReviewWorkbenchState\(\)/, '进入终审工作台前未缓存普通工作区状态')
  assert.match(workspaceSource, /restorePreFinalReviewWorkbenchState\(\)/, '离开终审工作台时未恢复普通工作区状态')
  assert.match(workspaceSource, /function syncProjectWorkbenchAiMode\(\): void \{[\s\S]*if \(workbenchMode\.value !== 'project'\)\s+return[\s\S]*const nextMode = projectResolvedAiMode\.value[\s\S]*if \(aiMode\.value !== nextMode\)\s+aiMode\.value = nextMode/, '项目页未在研发工作台内按 contextual 助手同步底层 aiMode')
  assert.match(workspaceSource, /function updateProjectAssistantMode\(nextMode: WorkspaceProjectAssistantMode\): void \{[\s\S]*projectAssistantMode\.value = nextMode[\s\S]*if \(workbenchMode\.value === 'project'\)\s+syncProjectWorkbenchAiMode\(\)/, '项目页缺少研发工作台助手切换入口')
  assert.match(workspaceSource, /function updateDefenseWorkbenchAiMode\(nextMode: WorkspaceDefenseWorkbenchAiMode\): void \{[\s\S]*defenseWorkbenchAiMode\.value = nextMode[\s\S]*aiMode\.value = nextMode/, '项目页缺少答辩工作台模式切换入口')
  assert.match(workspaceSource, /if \(nextMode === 'defense'\) \{[\s\S]*workbenchMode\.value = 'defense'[\s\S]*updateDefenseWorkbenchAiMode\('defense'\)[\s\S]*return/, '项目页从顶部进入答辩工作台时未默认回到答辩模拟')
  assert.match(workspaceSource, /if \(nextMode === 'final_review'\) \{[\s\S]*workbenchMode\.value = 'final_review'[\s\S]*aiMode\.value = 'dialog_ask'/, '项目页进入终审工作台后未切到终审助手的 dialog_ask 数据流')
  assert.match(workspaceSource, /@update:workbench-mode="updateWorkbenchMode"/, '工作区头部未接入工作台 tabs 事件')
  assert.match(workspaceSource, /:project-assistant-mode="projectAssistantMode"/, '项目页未向右栏透传研发工作台助手状态')
  assert.match(workspaceSource, /@update:project-assistant-mode="updateProjectAssistantMode"/, '项目页未接入右栏研发工作台助手切换事件')
  assert.match(headerSource, /data-testid="workspace-header-workbench-tabs"/, '工作区头部缺少工作台 tabs 容器')
  assert.match(headerSource, /研发工作台/, '工作区头部缺少研发工作台入口')
  assert.match(headerSource, /答辩工作台/, '工作区头部缺少答辩工作台入口')
  assert.match(headerSource, /终审工作台/, '工作区头部缺少终审工作台入口')
  assert.doesNotMatch(headerSource, /项目工作台/, '工作区头部仍保留旧的项目工作台文案')
  assert.doesNotMatch(headerSource, />\s*终审\s*<\/button>/, '工作区头部仍保留独立终审按钮')
  assert.match(rightSidebarSource, /const DEFENSE_MODES: Array<\{ value: WorkspaceDefenseSidebarAiMode, label: string \}> = \[[\s\S]*\{ value: 'defense', label: '答辩模拟' \}[\s\S]*\{ value: 'dialog_ask', label: '对话询问' \}[\s\S]*\{ value: 'auto_optimize', label: '自动优化' \}[\s\S]*\{ value: 'issue_discovery', label: '寻疑发现' \}[\s\S]*\]/, '右栏答辩工作台模式下拉未提供四个固定选项')
  assert.match(rightSidebarSource, /const projectAssistantOptions = computed<Array<\{ value: WorkspaceProjectAssistantMode, label: string \}>>\(\(\) => \{[\s\S]*value: 'contextual'[\s\S]*value: 'dialog_ask'[\s\S]*label: '对话询问'/, '右栏研发工作台未限定为 contextual \/ 对话询问 两类入口')
  assert.match(rightSidebarSource, /当前为设计助手，只做只读分析，优先帮助你梳理页面层级、布局结构、视觉一致性和交互说明。/, '右栏缺少设计助手提示语')
  assert.match(rightSidebarSource, /当前为原型助手，只做只读分析，优先帮助你梳理页面流转、模块拆分、关键状态和交互路径。/, '右栏缺少原型助手提示语')
  assert.match(rightSidebarSource, /if \(props\.workbenchMode === 'project'\) \{[\s\S]*if \(props\.projectAssistantMode === 'dialog_ask'\)\s+return 'dialog_ask'[\s\S]*return props\.projectContextualAssistantLabel \? 'contextual' : 'dialog_ask'/, '右栏研发工作台未支持手动切回对话询问')
  assert.doesNotMatch(rightSidebarSource, /:disabled="aiMode === 'defense'"/, '右栏仍把答辩工作台错误渲染成禁用态')
  assert.doesNotMatch(rightSidebarSource, /答辩工作台（顶部切换）/, '右栏仍保留旧的顶部切换提示文案')
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
