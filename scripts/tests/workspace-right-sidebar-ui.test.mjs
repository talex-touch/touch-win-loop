import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')
const WORKSPACE_HEADER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceHeader.vue')
const WORKSPACE_AI_TOGGLE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAiToggleButton.vue')
const WORKSPACE_LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const WORKSPACE_SIDEBAR_LAYOUT_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceSidebarLayout.ts')
const WORKSPACE_PROJECT_AI_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectAi.ts')
const WORKSPACE_PROJECT_SHELL_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectShell.ts')
const WORKSPACE_LAYOUT_UTIL_FILE = resolve(process.cwd(), 'shared/utils/workspace-layout.ts')

it('右栏采用三段式布局，底部输入区不再进入滚动容器', async () => {
  const source = await readFile(RIGHT_SIDEBAR_FILE, 'utf8')

  assert.match(
    source,
    /<aside[\s\S]*class="[^"]*flex[^"]*flex-col[^"]*h-full[^"]*min-h-0[^"]*"[\s\S]*<div[\s\S]*class="[^"]*shrink-0[^"]*space-y-2"[\s\S]*<div class="[^"]*flex-1[^"]*h-0[^"]*min-h-0[^"]*overflow-hidden"[\s\S]*<div class="workspace-chat-composer">/,
    '右栏未保持头部 / 中部滚动区 / 底部输入区的三段式结构',
  )
  assert.doesNotMatch(source, /xl:w-88/, '右栏内部根节点仍在使用固定桌面宽度，无法跟随外层拖拽')
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

it('右栏在 AgentProto workflow 场景提供操作条和 workflow 草案卡，并把 apply\/discard 事件透传给项目页', async () => {
  const [sidebarSource, workspaceSource] = await Promise.all([
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
  ])

  assert.match(sidebarSource, /workflowResourceId\?: string/, '右栏缺少当前 workflow 资源入参')
  assert.match(sidebarSource, /workflowHash\?: string/, '右栏缺少当前 workflow hash 入参')
  assert.match(sidebarSource, /workflowPageCount\?: number/, '右栏缺少当前 workflow 页数入参')
  assert.match(sidebarSource, /workflowGenerateAvailable\?: boolean/, '右栏缺少 workflow 生成动作可用态入参')
  assert.match(sidebarSource, /workflowGenerateDisabledReason\?: string/, '右栏缺少 workflow 生成动作禁用原因入参')
  assert.match(sidebarSource, /workflowCompleteAvailable\?: boolean/, '右栏缺少 workflow 补全动作可用态入参')
  assert.match(sidebarSource, /workflowCompleteDisabledReason\?: string/, '右栏缺少 workflow 补全动作禁用原因入参')
  assert.match(sidebarSource, /workflowRefineAvailable\?: boolean/, '右栏缺少 workflow 续改动作可用态入参')
  assert.match(sidebarSource, /workflowRefineDisabledReason\?: string/, '右栏缺少 workflow 续改动作禁用原因入参')
  assert.match(sidebarSource, /workflowRestyleAvailable\?: boolean/, '右栏缺少 workflow 调样式动作可用态入参')
  assert.match(sidebarSource, /workflowRestyleDisabledReason\?: string/, '右栏缺少 workflow 调样式动作禁用原因入参')
  assert.match(sidebarSource, /'requestWorkflowDraft': \[payload:/, '右栏缺少 workflow draft 请求事件')
  assert.match(sidebarSource, /'applyWorkflowDraft': \[draft: AiWorkspaceWorkflowDraft\]/, '右栏缺少 workflow apply 事件')
  assert.match(sidebarSource, /'discardWorkflowDraft': \[draft: AiWorkspaceWorkflowDraft\]/, '右栏缺少 workflow discard 事件')
  assert.match(sidebarSource, /workspace-workflow-toolbar/, '右栏缺少 AgentProto workflow 操作条')
  assert.match(sidebarSource, /data-testid="workspace-workflow-toolbar"/, '右栏 workflow 操作条缺少测试锚点')
  assert.match(sidebarSource, /function isWorkflowActionAvailable\(action: WorkflowDraftAction\): boolean \{/, '右栏缺少 workflow 动作可用态判断')
  assert.match(sidebarSource, /function resolveWorkflowActionUnavailableReason\(action: WorkflowDraftAction\): string \{/, '右栏缺少 workflow 动作禁用原因解析')
  assert.match(sidebarSource, /function isWorkflowActionDisabled\(action: WorkflowDraftAction\): boolean \{/, '右栏缺少 workflow 动作禁用态判断')
  assert.match(sidebarSource, /if \(isWorkflowActionDisabled\(action\)\)\s+return[\s\S]*emit\('requestWorkflowDraft', \{/, '右栏 workflow draft 触发入口未在禁用态提前返回')
  assert.match(sidebarSource, /AI 生成/, '右栏 workflow 操作条缺少 AI 生成功能')
  assert.match(sidebarSource, /AI 补全/, '右栏 workflow 操作条缺少 AI 补全功能')
  assert.match(sidebarSource, /AI 续改/, '右栏 workflow 操作条缺少 AI 续改功能')
  assert.match(sidebarSource, /调样式/, '右栏 workflow 操作条缺少调样式功能')
  assert.match(sidebarSource, /:disabled="isWorkflowActionDisabled\('generate'\)"/, '右栏 workflow 生成按钮未接入独立禁用态')
  assert.match(sidebarSource, /:disabled="isWorkflowActionDisabled\('complete'\)"/, '右栏 workflow 补全按钮未接入独立禁用态')
  assert.match(sidebarSource, /:disabled="isWorkflowActionDisabled\('refine'\)"/, '右栏 workflow 续改按钮未接入独立禁用态')
  assert.match(sidebarSource, /:disabled="isWorkflowActionDisabled\('restyle'\)"/, '右栏 workflow 调样式按钮未接入独立禁用态')
  assert.match(sidebarSource, /workspace-agent-doc-card workspace-agent-doc-card--workflow/, '右栏缺少 workflow 草案卡')
  assert.match(sidebarSource, /应用到当前流程画布/, '右栏 workflow 草案卡缺少应用按钮')
  assert.match(sidebarSource, /requestDiscardWorkflowDraft/, '右栏 workflow 草案卡缺少丢弃入口')
  assert.match(workspaceSource, /:workflow-resource-id="activeWorkflowResourceId"/, '项目页未向右栏透传 workflow 资源 id')
  assert.match(workspaceSource, /:workflow-hash="activeWorkflowHash"/, '项目页未向右栏透传 workflow hash')
  assert.match(workspaceSource, /:workflow-page-count="activeWorkflowPageCount"/, '项目页未向右栏透传 workflow 页数')
  assert.match(workspaceSource, /:workflow-generate-available="workflowGenerateAvailable"/, '项目页未向右栏透传 workflow 生成动作可用态')
  assert.match(workspaceSource, /:workflow-generate-disabled-reason="workflowGenerateDisabledReason"/, '项目页未向右栏透传 workflow 生成动作禁用原因')
  assert.match(workspaceSource, /:workflow-complete-available="workflowCompleteAvailable"/, '项目页未向右栏透传 workflow 补全动作可用态')
  assert.match(workspaceSource, /:workflow-complete-disabled-reason="workflowCompleteDisabledReason"/, '项目页未向右栏透传 workflow 补全动作禁用原因')
  assert.match(workspaceSource, /:workflow-refine-available="workflowRefineAvailable"/, '项目页未向右栏透传 workflow 续改动作可用态')
  assert.match(workspaceSource, /:workflow-refine-disabled-reason="workflowRefineDisabledReason"/, '项目页未向右栏透传 workflow 续改动作禁用原因')
  assert.match(workspaceSource, /:workflow-restyle-available="workflowRestyleAvailable"/, '项目页未向右栏透传 workflow 调样式动作可用态')
  assert.match(workspaceSource, /:workflow-restyle-disabled-reason="workflowRestyleDisabledReason"/, '项目页未向右栏透传 workflow 调样式动作禁用原因')
  assert.match(workspaceSource, /@request-workflow-draft="requestWorkflowDraftFromSidebar"/, '项目页未接入右栏 workflow draft 请求事件')
  assert.match(workspaceSource, /@apply-workflow-draft="applyWorkflowDraft"/, '项目页未接入右栏 workflow apply 事件')
  assert.match(workspaceSource, /@discard-workflow-draft="discardWorkflowDraft"/, '项目页未接入右栏 workflow discard 事件')
})

it('项目页会在切换会话与恢复历史消息时清空 workflow 草案本地状态，并按动作维度计算 AgentProto gating', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /function resetChatDraftArtifactState\(\): void \{[\s\S]*appliedAgentDocDraftKeys\.value = \[\][\s\S]*appliedWorkflowDraftKeys\.value = \[\][\s\S]*discardedWorkflowDraftKeys\.value = \[\][\s\S]*\}/, '项目页缺少统一的草案本地状态清理入口')
  assert.match(source, /function clearActiveChatArtifacts\(options:[\s\S]*resetChatDraftArtifactState\(\)/, '项目页切换会话或作用域时未清空 workflow 草案本地状态')
  assert.match(source, /chatMessages\.value = restoredMessages[\s\S]*resetChatDraftArtifactState\(\)[\s\S]*chatMessagesLoadedSessionId\.value = normalizedSessionId/, '项目页恢复历史消息后未重置 workflow 草案本地状态')
  assert.match(source, /const workflowGenerateAvailable = computed\(\(\) => !workflowCanvasUnavailableReason\.value && isAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\('generate'\)\)\)/, '项目页缺少 workflow 生成动作可用性计算')
  assert.match(source, /const workflowCompleteAvailable = computed\(\(\) => !workflowCanvasUnavailableReason\.value && isAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\('complete'\)\)\)/, '项目页缺少 workflow 补全动作可用性计算')
  assert.match(source, /const workflowRefineAvailable = computed\(\(\) => !workflowCanvasUnavailableReason\.value && isAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\('refine'\)\)\)/, '项目页缺少 workflow 续改动作可用性计算')
  assert.match(source, /const workflowRestyleAvailable = computed\(\(\) => !workflowCanvasUnavailableReason\.value && isAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\('restyle'\)\)\)/, '项目页缺少 workflow 调样式动作可用性计算')
  assert.match(source, /async function requestWorkflowDraftFromSidebar\(options: WorkflowDraftRequestOptions\): Promise<void> \{[\s\S]*if \(!ensureAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\(options\.action\)\)\)\s+return/, '项目页 workflow 草案请求入口未按动作 feature 前置 gating')
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
  assert.match(sidebarSource, /if \(!props\.aiEnabled\)\s+return String\(props\.aiDisabledReason \|\| ''\)\.trim\(\) \|\| '当前 AI 未配置，已禁用当前模式。请先在后台完成模型与密钥配置。'/, '右栏未在禁用态替换输入占位提示')
  assert.match(sidebarSource, /:disabled="!props\.aiEnabled"/, '右栏输入框或新建按钮未接入禁用态')
  assert.match(sidebarSource, /:disabled="props\.chatInterrupting \|\| \(!props\.aiEnabled && !chatLoading\)"/, '右栏发送按钮未在禁用态禁止发送')
  assert.match(sidebarSource, /documentResourceId\?: string/, '右栏缺少 AgentDoc 当前文档资源入参')
  assert.match(sidebarSource, /documentMarkdownHash\?: string/, '右栏缺少 AgentDoc 当前文档 hash 入参')
  assert.match(sidebarSource, /appliedAgentDocDraftKeys\?: string\[\]/, '右栏缺少 AgentDoc 已应用草案 key 入参')
  assert.match(sidebarSource, /'applyDocumentDraft': \[draft: AiWorkspaceDocumentDraft\]/, '右栏缺少 AgentDoc 草案应用事件')
  assert.match(sidebarSource, /workspace-agent-doc-card/, '右栏缺少 AgentDoc 草案卡样式')
  assert.match(sidebarSource, /function buildAgentDocDiffRows\(draft: AiWorkspaceDocumentDraft\): AgentDocDiffRow\[\] \{/, '右栏缺少 AgentDoc diff 生成逻辑')
  assert.match(sidebarSource, /function resolveAgentDocDraftStatus\(draft: AiWorkspaceDocumentDraft\): AgentDocDraftStatus \{/, '右栏缺少 AgentDoc 草案状态派生逻辑')
  assert.doesNotMatch(sidebarSource, /workspace-right-sidebar__doc-action/, '右栏仍保留旧的 AgentDoc 动作按钮样式')
  assert.doesNotMatch(sidebarSource, /workspace-right-sidebar__doc-apply/, '右栏仍保留旧的 AgentDoc 应用按钮')
  assert.match(sidebarSource, /:disabled="defenseSummaryLoading \|\| !props\.aiEnabled"/, '右栏答辩总结按钮未在禁用态关闭')
  assert.match(sidebarSource, /function handleCreateChatSession\(\): void \{[\s\S]*if \(!props\.aiEnabled\)\s+return[\s\S]*emit\('createChatSession'\)/, '右栏新建会话入口未在禁用态提前返回')
  assert.match(workspaceSource, /:ai-enabled="currentAiModeAvailable"/, '项目页未向右栏透传当前模式可用态')
  assert.match(workspaceSource, /:ai-disabled-reason="currentAiDisabledReason"/, '项目页未向右栏透传当前模式禁用原因')
  assert.match(workspaceSource, /:document-resource-id="documentAssistRequestState\.resourceId"/, '项目页未向右栏透传 AgentDoc 当前文档资源')
  assert.match(workspaceSource, /:document-markdown-hash="activeAgentDocDocumentHash"/, '项目页未向右栏透传 AgentDoc 当前文档 hash')
  assert.match(workspaceSource, /:applied-agent-doc-draft-keys="appliedAgentDocDraftKeys"/, '项目页未向右栏透传 AgentDoc 已应用草案 key')
})

it('右栏将 system 消息渲染为内联消息，并将 assistant 内容接到统一引用渲染组件', async () => {
  const [sidebarSource, workspaceSource] = await Promise.all([
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
  ])

  assert.match(sidebarSource, /resolveWorkspaceStreamSystemMessageView/, '右栏未接入 system 消息解析工具')
  assert.match(sidebarSource, /return props\.chatMessages/, '右栏仍在过滤 system 消息')
  assert.match(sidebarSource, /workspace-chat-system-message/, '右栏缺少流式 system 消息样式')
  assert.match(sidebarSource, /data-testid="workspace-chat-system-message"/, '右栏缺少 system 消息测试锚点')
  assert.match(sidebarSource, /resolveSystemMessageIcon\(entry\.systemMessage\.eventType, entry\.isCompletedSystem\)/, '右栏 system 消息未按完成态切换图标')
  assert.match(sidebarSource, /return 'check'/, '右栏 system 消息完成后未切换为 check 图标')
  assert.match(sidebarSource, /white-space:\s*nowrap/, '右栏 system 消息未收敛为单行')
  assert.match(sidebarSource, /workspace-chat-system-message--live \.workspace-chat-system-message__icon \{[\s\S]*animation:\s*workspace-chat-system-message-spin 1s linear infinite;/, '右栏运行中 system 消息图标未转动')
  assert.match(sidebarSource, /workspace-chat-system-message--live \.workspace-chat-system-message__summary::before \{[\s\S]*animation:\s*workspace-chat-system-message-shimmer 1\.9s ease-in-out infinite;/, '右栏运行中 system 消息缺少 shimmer 动效')
  assert.match(sidebarSource, /toggleSystemMessageExpanded\(entry\.id\)/, '右栏 system 消息缺少展开切换逻辑')
  assert.match(sidebarSource, /:aria-expanded="isSystemMessageExpanded\(entry\.id\) \? 'true' : 'false'"/, '右栏 system 消息缺少展开语义')
  assert.match(sidebarSource, /workspace-chat-system-message__detail/, '右栏缺少 system 消息展开详情区')
  assert.doesNotMatch(sidebarSource, /workspace-chat-system-card/, '右栏仍将 system 消息渲染为卡片')
  assert.match(sidebarSource, /workspace-chat-message__assistant-head/, '右栏未将 assistant 头像拆到独立一行')
  assert.match(sidebarSource, /workspace-chat-message__meta--user/, '右栏未为用户消息补齐页眉元信息')
  assert.match(sidebarSource, /const currentUserDisplayName = computed\(\(\) => \{/, '右栏缺少用户消息展示名计算逻辑')
  assert.match(sidebarSource, /workspace-chat-message__content--assistant/, '右栏 assistant 正文未切到无卡片内容层')
  assert.match(sidebarSource, /<WorkspaceAssistantMessageContent[\s\S]*:message="entry\.message"[\s\S]*@open-resource="emit\('openResource', \$event\)"/, '右栏未将 assistant 消息切到统一引用渲染组件')
  assert.match(sidebarSource, /'openResource': \[resourceId: string\]/, '右栏缺少引用打开资源事件')
  assert.doesNotMatch(sidebarSource, /return props\.chatMessages\.filter\(message => message\.role !== 'system'\)/, '右栏仍在剔除 system 消息')
  assert.match(workspaceSource, /createWorkspaceStreamSystemChatMessage/, '项目页未接入工作区流式 system 消息构造工具')
  assert.match(workspaceSource, /baseMessages\.push\(createWorkspaceStreamSystemChatMessage\(eventType, data, streamSystemSeq\)\)/, '项目页未在 progress\/tool 事件到达时插入 system 消息')
  assert.match(workspaceSource, /\.map\(item => \(\{[\s\S]*metadata: item\.metadata,[\s\S]*\}\)\) as ChatMessage\[\]/, '项目页恢复历史消息时未保留 system 元数据')
  assert.doesNotMatch(workspaceSource, /\.filter\(message => message\.role !== 'system'\)/, '项目页恢复历史消息时仍在过滤 system 消息')
})

it('右栏消息区会在贴底时自动跟随，并在切换会话后回到底部', async () => {
  const source = await readFile(RIGHT_SIDEBAR_FILE, 'utf8')

  assert.match(source, /const chatScrollViewport = ref<HTMLElement \| null>\(null\)/, '右栏缺少消息滚动容器引用')
  assert.match(source, /const chatShouldStickToBottom = ref\(true\)/, '右栏缺少贴底自动滚动状态')
  assert.match(source, /function handleChatViewportScroll\(\): void \{[\s\S]*chatShouldStickToBottom\.value = isChatViewportNearBottom\(viewport\)/, '右栏未在用户滚动时更新自动跟随状态')
  assert.match(source, /watch\(\(\) => props\.activeChatSessionId, async \(nextId, previousId\) => \{[\s\S]*chatShouldStickToBottom\.value = true[\s\S]*scrollChatViewportToBottom\(true\)/, '右栏切换会话后未强制回到底部')
  assert.match(source, /watch\(latestVisibleChatEntrySignature, async \(\) => \{[\s\S]*scrollChatViewportToBottom\(\)/, '右栏新消息到达时未在贴底状态自动跟随')
  assert.match(source, /ref="chatScrollViewport"/, '右栏模板未将滚动容器绑定到 chatScrollViewport')
  assert.match(source, /@scroll\.passive="handleChatViewportScroll"/, '右栏滚动容器未监听用户滚动')
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

it('项目页用 localOnly 本地消息工具隔离未完成工作台流式消息，避免污染下一轮模型输入', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /from '~~\/shared\/utils\/workspace-chat-local-state'/, '项目页未接入工作台本地消息状态工具')
  assert.match(source, /function createWorkspaceLocalChatRequestId\(\): string \{/, '项目页缺少工作台本地请求 id 生成器')
  assert.match(source, /messages: toWorkspaceModelMessages\(pendingMessages\),/, '项目页未在工作台请求前过滤 localOnly 消息')
  assert.match(source, /createWorkspaceLocalChatMessage\(\{[\s\S]*role: 'user'[\s\S]*localRequestId: workspaceLocalRequestId,[\s\S]*streamState: 'streaming'/, '项目页未将临时 user 消息标记为 localOnly + streaming')
  assert.match(source, /createWorkspaceLocalChatMessage\(\{[\s\S]*role: 'assistant'[\s\S]*localRequestId,[\s\S]*streamState: 'streaming'/, '项目页未将流式 assistant 消息标记为 localOnly + streaming')
  assert.match(source, /chatMessages\.value = finalizeWorkspaceLocalChatMessages\(chatMessages\.value, localRequestId\)/, '项目页未在 done 后清理当前轮 localOnly 标记')
  assert.match(source, /chatMessages\.value = markWorkspaceLocalChatMessagesAborted\(chatMessages\.value, workspaceLocalRequestId\)/, '项目页未在中断时把当前轮消息标记为 aborted')
  assert.match(source, /createWorkspaceLocalChatMessage\(\{[\s\S]*role: 'assistant'[\s\S]*content: errorText,[\s\S]*streamState: 'aborted'/, '项目页错误兜底 assistant 未标记为 localOnly + aborted')
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
  assert.match(source, /const createSessionLabel = computed\(\(\) => isDefenseWorkbench\.value \? '新建 AgentDef 会话' : '新建对话'\)/, '右栏缺少按工作台切换的新建会话语义')
  assert.match(source, /:aria-label="createSessionLabel"/, '右栏新建对话按钮缺少 icon-only 按钮语义标记')
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
  assert.match(source, /if \(title\.startsWith\('Loopy 文档增强'\)\)\s+return title\.replace\('Loopy 文档增强', 'Loopy AgentDoc'\)/, '右栏未将旧的文档增强会话标题归一化为 AgentDoc')
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
  assert.match(source, /openChatSessionIds,/, '项目页未从 AI composable 解构打开中的会话 tabs 状态')
  assert.match(source, /activeChatSessionId,/, '项目页未从 AI composable 解构当前激活会话 id')
  assert.match(source, /\} = useWorkspaceProjectAi\(\)/, '项目页未从 useWorkspaceProjectAi 获取会话 tabs 状态')
  assert.match(source, /function syncOpenChatSessionTabsInScope\(/, '项目页缺少打开中会话 tabs 作用域同步逻辑')
  assert.match(source, /:open-chat-session-ids="openChatSessionIds"/, '项目页未向右栏透传打开中的会话 tabs 列表')
  assert.match(
    source,
    /buildProjectApiRequestUrl\([\s\S]*endpoint\(`\/teams\/\$\{workspaceId\}\/chat\/sessions\/\$\{sessionId\}`\),[\s\S]*projectId,[\s\S]*mode: aiMode\.value[\s\S]*method: 'DELETE'/,
    '项目页删除会话请求未携带 projectId + mode 或未使用 Team 删除接口',
  )
  assert.match(
    source,
    /await loadChatSessions\(\{[\s\S]*preferredSessionId: activeChatSessionId\.value === sessionId \? '' : activeChatSessionId\.value,[\s\S]*autoCreate: false,[\s\S]*fallbackToFirst: true,[\s\S]*\}\)/,
    '项目页删除会话后未按预期回填剩余会话或空态',
  )
  assert.match(source, /statusLine\.value = '已删除会话。'/, '项目页删除会话成功后缺少状态提示')
  assert.match(source, /:chat-session-deleting-id="deletingChatSessionId"/, '项目页未向右栏透传会话删除中的状态')
  assert.match(source, /@delete-chat-session="deleteChatSession"/, '项目页未接入右栏会话删除事件')
})

it('右栏会话区拆分首屏 loading 与后台 refreshing，并在同会话刷新时保留旧消息', async () => {
  const [sidebarSource, workspaceSource] = await Promise.all([
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
  ])

  assert.match(sidebarSource, /chatSessionsRefreshing\?: boolean/, '右栏缺少会话后台刷新态入参')
  assert.match(sidebarSource, /chatMessagesLoading\?: boolean/, '右栏缺少消息首屏加载态入参')
  assert.match(sidebarSource, /showChatSkeleton = computed\(\(\) => \{[\s\S]*props\.chatSessionsLoading \|\| props\.chatMessagesLoading[\s\S]*visibleChatMessages\.value\.length === 0/, '右栏骨架仍未按消息是否已有内容做兜底')
  assert.match(sidebarSource, /workspace-right-sidebar__session-refreshing/, '右栏缺少会话区刷新提示')
  assert.match(sidebarSource, /useTransientHighlightSet/, '右栏缺少新增会话一次性高亮逻辑')
  assert.match(workspaceSource, /const chatSessionsLoadedScopeKey = ref\(''\)/, '项目页缺少会话列表作用域快照')
  assert.match(workspaceSource, /const chatMessagesLoadedSessionId = ref\(''\)/, '项目页缺少消息列表会话快照')
  assert.match(workspaceSource, /const chatSessionsFirstLoadLoading = computed\(\(\) => \{/, '项目页缺少会话首屏加载态计算')
  assert.match(workspaceSource, /const chatSessionsRefreshing = computed\(\(\) => \{/, '项目页缺少会话后台刷新态计算')
  assert.match(workspaceSource, /const chatMessagesFirstLoadLoading = computed\(\(\) => \{/, '项目页缺少消息首屏加载态计算')
  assert.match(workspaceSource, /chatSessionsLoadedScopeKey\.value = scopeKey/, '项目页未在会话列表成功返回后记录作用域快照')
  assert.match(workspaceSource, /chatMessagesLoadedSessionId\.value = normalizedSessionId/, '项目页未在消息成功返回后记录会话快照')
  assert.match(workspaceSource, /&& !sameScopeRefresh[\s\S]*resetChatScopeState\(\)/, '项目页未把会话清空限制在跨作用域失败场景')
  assert.match(workspaceSource, /if \(!sameSessionRefresh\) \{[\s\S]*clearActiveChatArtifacts\(\)/, '项目页切换会话时未清掉旧消息快照')
  assert.match(workspaceSource, /:chat-sessions-loading="chatSessionsFirstLoadLoading"/, '项目页未向右栏透传会话首屏加载态')
  assert.match(workspaceSource, /:chat-sessions-refreshing="chatSessionsRefreshing"/, '项目页未向右栏透传会话后台刷新态')
  assert.match(workspaceSource, /:chat-messages-loading="chatMessagesFirstLoadLoading"/, '项目页未向右栏透传消息首屏加载态')
})

it('项目页通过侧栏布局 composable 管理右栏手动收起态与断点自动收起态', async () => {
  const [workspaceSource, layoutSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_SIDEBAR_LAYOUT_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /import \{ useWorkspaceSidebarLayout \} from '~\/composables\/useWorkspaceSidebarLayout'/, '项目页未接入统一的侧栏布局 composable')
  assert.match(
    workspaceSource,
    /const \{[\s\S]*leftSidebarCollapsed,[\s\S]*leftSidebarWidth,[\s\S]*rightSidebarUserCollapsed,[\s\S]*rightSidebarWidth,[\s\S]*sidebarLayoutHydrating,[\s\S]*rightSidebarCollapsed,[\s\S]*initializeRightSidebarBreakpointTracking,[\s\S]*disposeRightSidebarBreakpointTracking,[\s\S]*setRightSidebarUserCollapsed,[\s\S]*setLeftSidebarWidth,[\s\S]*setRightSidebarWidth,[\s\S]*applySidebarLayoutState,[\s\S]*collapseRightSidebar,[\s\S]*expandRightSidebar,[\s\S]*\} = useWorkspaceSidebarLayout\(\)/,
    '项目页未从 composable 解构右栏布局状态机',
  )
  assert.match(layoutSource, /const leftSidebarWidth = ref\(normalizeWorkspaceLeftSidebarWidth\(null\)\)/, '侧栏布局 composable 缺少左栏宽度状态')
  assert.match(layoutSource, /const rightSidebarUserCollapsed = ref\(true\)/, '侧栏布局 composable 未将右栏默认设为收起')
  assert.match(layoutSource, /const rightSidebarWidth = ref\(normalizeWorkspaceRightSidebarWidth\(null\)\)/, '侧栏布局 composable 缺少右栏宽度状态')
  assert.match(layoutSource, /const rightSidebarAutoCollapsed = ref\(false\)/, '侧栏布局 composable 缺少右栏自动收起状态')
  assert.match(layoutSource, /const rightSidebarAutoRestorePending = ref\(false\)/, '侧栏布局 composable 缺少右栏自动恢复状态')
  assert.match(layoutSource, /const rightSidebarCollapsed = computed\(\(\) => rightSidebarUserCollapsed\.value \|\| rightSidebarAutoCollapsed\.value\)/, '侧栏布局 composable 未合成右栏最终收起态')
  assert.match(layoutSource, /function setLeftSidebarWidth\(nextWidth: number\): void \{\s+leftSidebarWidth\.value = normalizeWorkspaceLeftSidebarWidth\(nextWidth\)/, '侧栏布局 composable 缺少左栏宽度 setter')
  assert.match(layoutSource, /function setRightSidebarWidth\(nextWidth: number\): void \{\s+rightSidebarWidth\.value = normalizeWorkspaceRightSidebarWidth\(nextWidth\)/, '侧栏布局 composable 缺少右栏宽度 setter')
  assert.match(layoutSource, /DEFAULT_RIGHT_SIDEBAR_BREAKPOINT_QUERY = '\(min-width: 1280px\)'/, '侧栏布局 composable 未固定右栏窄屏断点')
  assert.match(layoutSource, /window\.matchMedia\(breakpointQuery\)/, '侧栏布局 composable 未监听右栏断点变化')
})

it('项目页将左右栏宽度持久化到视图状态，并在拖拽结束后再同步', async () => {
  const [workspaceSource, shellSource, leftSidebarSource, layoutUtilSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_SHELL_FILE, 'utf8'),
    readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_LAYOUT_UTIL_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /const workspaceSidebarResizeState = reactive<WorkspaceSidebarResizeState>\(\{\s+active: false,\s+side: '',\s+\}\)/, '项目页缺少统一的侧栏拖拽状态')
  assert.match(workspaceSource, /function startWorkspaceSidebarResize\(side: WorkspaceSidebarResizeSide, event: PointerEvent\): void \{/, '项目页缺少侧栏拖拽入口')
  assert.match(workspaceSource, /if \(workspaceSidebarResizeState\.active\)\s+return/, '项目页未在拖拽过程中暂停视图状态同步')
  assert.match(workspaceSource, /finishWorkspaceSidebarResize\(shouldPersist = true\): void \{[\s\S]*if \(shouldSync\) \{[\s\S]*void syncProjectWorkspaceViewState\(\)[\s\S]*scheduleWorkspaceDisplayWidthUserSync\(\)[\s\S]*\}/, '项目页未在拖拽完成后同时同步视图状态和个人宽度偏好')
  assert.match(workspaceSource, /WORKSPACE_LEFT_SIDEBAR_RAIL_WIDTH/, '项目页拖拽约束仍在使用左栏裸宽度常量')
  assert.match(workspaceSource, /setPointerCapture\(pointerId\)/, '项目页拖拽入口未接入 pointer capture')
  assert.match(workspaceSource, /releasePointerCapture\(pointerId\)/, '项目页拖拽 cleanup 未释放 pointer capture')
  assert.match(workspaceSource, /lostpointercapture/, '项目页拖拽 cleanup 未处理 lostpointercapture')
  assert.match(workspaceSource, /window\.addEventListener\('blur', handlePointerEnd, \{ once: true \}\)/, '项目页拖拽未处理窗口失焦')
  assert.match(workspaceSource, /await patchUserWorkspaceDisplayDefaultsByApi\(\{[\s\S]*leftSidebarWidth: payload\.leftSidebarWidth,[\s\S]*rightSidebarWidth: payload\.rightSidebarWidth,[\s\S]*\}\)/, '项目页未将左右栏宽度写入个人全局显示偏好')
  assert.match(workspaceSource, /await loadWorkspaceDisplayPreferenceSnapshot\(payload\.workspaceId, \{ silent: true \}\)/, '项目页宽度同步后未静默刷新当前工作区显示偏好快照')
  assert.match(workspaceSource, /pendingWorkspaceDisplayWidthSyncPayload = \{[\s\S]*leftSidebarWidth: leftSidebarWidth\.value,[\s\S]*rightSidebarWidth: rightSidebarWidth\.value,[\s\S]*\}/, '项目页未将当前左右栏宽度编入个人同步队列')
  assert.match(workspaceSource, /workspaceDisplayPreferenceWorkspaceId\.value !== String\(activeWorkspaceId\.value \|\| ''\)\.trim\(\)/, '项目页在恢复视图前未校验当前工作区显示偏好是否已就绪')
  assert.match(workspaceSource, /await loadWorkspaceDisplayPreferenceSnapshot\(activeWorkspaceId\.value\)/, '项目页在恢复视图前未补拉当前工作区显示偏好')
  assert.match(workspaceSource, /workspace-sidebar-resize-handle workspace-sidebar-resize-handle--left/, '项目页缺少左栏拖拽句柄')
  assert.match(workspaceSource, /workspace-sidebar-resize-handle workspace-sidebar-resize-handle--right/, '项目页缺少右栏拖拽句柄')
  assert.match(workspaceSource, /\.workspace-sidebar-resize-handle \{[\s\S]*width: 16px;[\s\S]*touch-action: none;/, '项目页未扩大句柄热区并关闭触摸默认行为')
  assert.match(workspaceSource, /\.workspace-sidebar-resize-handle--left \{[\s\S]*right: -8px;/, '项目页左侧句柄偏移未更新')
  assert.match(workspaceSource, /\.workspace-sidebar-resize-handle--right \{[\s\S]*left: -8px;/, '项目页右侧句柄偏移未更新')
  assert.match(workspaceSource, /\.workspace-right-dock \{[\s\S]*overflow: visible;/, '项目页右栏外层仍在裁切拖拽句柄')
  assert.match(workspaceSource, /\.workspace-right-dock__panel \{[\s\S]*overflow: hidden;/, '项目页右栏内容层未接管裁切')
  assert.match(workspaceSource, /\.workspace-shell--resizing[\s\S]*\.workspace-right-dock[\s\S]*transition: none !important;/, '项目页拖拽激活时未禁用右栏过渡')
  assert.match(workspaceSource, /\.workspace-shell--resizing[\s\S]*:deep\(\.workspace-left-dock\)[\s\S]*transition: none !important;/, '项目页拖拽激活时未禁用左栏过渡')
  assert.match(shellSource, /leftSidebarWidth: normalizeWorkspaceLeftSidebarWidth\(null\)/, '默认视图状态缺少左栏默认宽度')
  assert.match(shellSource, /rightSidebarWidth: normalizeWorkspaceRightSidebarWidth\(null\)/, '默认视图状态缺少右栏默认宽度')
  assert.match(shellSource, /defaultLeftSidebarWidth: Ref<number> \| ComputedRef<number>/, '项目视图状态 composable 未接收显示偏好的左栏默认宽度')
  assert.match(shellSource, /defaultRightSidebarWidth: Ref<number> \| ComputedRef<number>/, '项目视图状态 composable 未接收显示偏好的右栏默认宽度')
  assert.match(shellSource, /leftSidebarWidth: options\.defaultLeftSidebarWidth\.value,[\s\S]*rightSidebarWidth: options\.defaultRightSidebarWidth\.value/, '项目视图状态默认值未回落到个人显示偏好宽度')
  assert.match(shellSource, /leftSidebarWidth: normalizeWorkspaceLeftSidebarWidth\(source\.leftSidebarWidth\)/, '视图状态 normalize 未处理左栏宽度')
  assert.match(shellSource, /rightSidebarWidth: normalizeWorkspaceRightSidebarWidth\(source\.rightSidebarWidth\)/, '视图状态 normalize 未处理右栏宽度')
  assert.match(leftSidebarSource, /WORKSPACE_LEFT_SIDEBAR_RAIL_WIDTH/, '左栏样式未复用共享 rail 宽度常量')
  assert.match(leftSidebarSource, /--workspace-left-rail-width: v-bind\(leftSidebarRailWidthPx\);/, '左栏样式未由共享常量驱动 rail 宽度')
  assert.match(layoutUtilSource, /export const WORKSPACE_LEFT_SIDEBAR_RAIL_WIDTH = 56/, '缺少共享左栏 rail 宽度常量')
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
  assert.match(workspaceSource, /:workbench-switching="workbenchSwitching"/, '项目页未向头部透传工作台切换中状态')
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
  assert.match(headerSource, /workbenchSwitching\?: boolean/, 'WorkspaceHeader 缺少工作台切换中入参')
  assert.match(headerSource, /\(event: 'toggleAiSidebar'\): void/, 'WorkspaceHeader 缺少 AI 切换事件')
  assert.match(headerSource, /if \(props\.workbenchSwitching\)\s+return/, 'WorkspaceHeader 未在工作台切换时阻止重复点按 tabs')
  assert.match(headerSource, /:disabled="props\.workbenchSwitching"/, 'WorkspaceHeader 未在工作台切换时禁用 tabs')
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
  assert.match(workspaceSource, /const projectContextualAssistant = computed<WorkspaceProjectContextualAssistant \| null>\(\(\) => \{[\s\S]*if \(previewMode\.value === 'markdown'\) \{[\s\S]*label: 'AgentDoc'[\s\S]*if \(activePreviewResourcePurpose\.value === 'design'\) \{[\s\S]*label: '设计助手'[\s\S]*if \(activePreviewResourcePurpose\.value === 'workflow'\) \{[\s\S]*label: 'AgentProto'[\s\S]*return \{[\s\S]*label: '原型助手'/, '项目页未按 tab 类型解析 AgentDoc\/设计\/原型助手')
  assert.match(workspaceSource, /const projectResolvedAiMode = computed<WorkspacePrimaryAiMode>\(\(\) => \{[\s\S]*if \(projectAssistantMode\.value === 'dialog_ask'\)\s+return 'dialog_ask'[\s\S]*projectContextualAssistant\.value\?\.aiMode \|\| 'dialog_ask'/, '项目页未将研发侧显式对话覆盖到 contextual 助手之上')
  assert.match(workspaceSource, /async function updateWorkbenchMode\(nextMode: WorkspaceWorkbenchMode\)/, '项目页缺少头部工作台切换入口')
  assert.match(workspaceSource, /rememberPreFinalReviewWorkbenchState\(\)/, '进入终审工作台前未缓存普通工作区状态')
  assert.match(workspaceSource, /restorePreFinalReviewWorkbenchState\(\)/, '离开终审工作台时未恢复普通工作区状态')
  assert.match(workspaceSource, /function syncProjectWorkbenchAiMode\(\): void \{[\s\S]*if \(workbenchMode\.value !== 'project'\)\s+return[\s\S]*const nextMode = projectResolvedAiMode\.value[\s\S]*if \(aiMode\.value !== nextMode\)\s+aiMode\.value = nextMode/, '项目页未在研发工作台内按 contextual 助手同步底层 aiMode')
  assert.match(workspaceSource, /function updateProjectAssistantMode\(nextMode: WorkspaceProjectAssistantMode\): void \{[\s\S]*projectAssistantMode\.value = nextMode[\s\S]*if \(workbenchMode\.value === 'project'\)\s+syncProjectWorkbenchAiMode\(\)/, '项目页缺少研发工作台助手切换入口')
  assert.match(workspaceSource, /function updateDefenseWorkbenchAiMode\(nextMode: WorkspaceDefenseWorkbenchAiMode\): void \{[\s\S]*defenseWorkbenchAiMode\.value = nextMode[\s\S]*aiMode\.value = nextMode/, '项目页缺少答辩工作台模式切换入口')
  assert.match(workspaceSource, /const displayedWorkbenchMode = ref<WorkspaceWorkbenchMode>\(workbenchMode\.value\)/, '项目页缺少当前显示中的工作台场景状态')
  assert.match(workspaceSource, /const workbenchSwitchPhase = ref<WorkbenchSwitchPhase>\('idle'\)/, '项目页缺少工作台切换状态机阶段')
  assert.match(workspaceSource, /const workbenchSwitchProgress = ref\(0\)/, '项目页缺少工作台切换本地进度')
  assert.match(workspaceSource, /const workbenchSceneTransitionName = ref<WorkbenchSceneTransitionName>\('workspace-workbench-scene-forward'\)/, '项目页缺少工作台切换方向状态')
  assert.match(workspaceSource, /if \(workbenchSwitchPhase\.value !== 'idle'\)\s+return[\s\S]*workbenchSwitchTargetMode\.value = nextMode[\s\S]*workbenchSceneTransitionName\.value = resolveWorkbenchSceneTransitionDirection\(displayedWorkbenchMode\.value, nextMode\)[\s\S]*await runWorkbenchSwitchLoadingSequence\(\)[\s\S]*workbenchSwitchPhase\.value = 'animating'[\s\S]*displayedWorkbenchMode\.value = nextMode/, '项目页工作台切换未接入加载条后轮播的统一状态机')
  assert.match(workspaceSource, /@update:workbench-mode="updateWorkbenchMode"/, '工作区头部未接入工作台 tabs 事件')
  assert.match(workspaceSource, /data-testid="workspace-scene-shell"/, '项目页缺少统一工作台场景容器')
  assert.match(workspaceSource, /:project-assistant-mode="projectAssistantMode"/, '项目页未向右栏透传研发工作台助手状态')
  assert.match(workspaceSource, /@update:project-assistant-mode="updateProjectAssistantMode"/, '项目页未接入右栏研发工作台助手切换事件')
  assert.match(workspaceSource, /:workbench-mode="displayedWorkbenchMode"/, '项目页未按当前显示场景向右栏透传工作台模式')
  assert.match(workspaceSource, /:defense-session-meta="defenseSessionMetaSnapshot"/, '项目页未向右栏透传答辩会话 meta')
  assert.match(workspaceSource, /:defense-session-state="defenseSessionStateSnapshot"/, '项目页未向右栏透传答辩会话 state')
  assert.match(headerSource, /data-testid="workspace-header-workbench-tabs"/, '工作区头部缺少工作台 tabs 容器')
  assert.match(headerSource, /研发工作台/, '工作区头部缺少研发工作台入口')
  assert.match(headerSource, /答辩工作台/, '工作区头部缺少答辩工作台入口')
  assert.match(headerSource, /终审工作台/, '工作区头部缺少终审工作台入口')
  assert.doesNotMatch(headerSource, /项目工作台/, '工作区头部仍保留旧的项目工作台文案')
  assert.doesNotMatch(headerSource, />\s*终审\s*<\/button>/, '工作区头部仍保留独立终审按钮')
  assert.match(rightSidebarSource, /defenseSessionMeta\?: AiChatSession \| null/, '右栏缺少答辩会话 meta 入参')
  assert.match(rightSidebarSource, /defenseSessionState\?: AiDefenseSessionState \| null/, '右栏缺少答辩会话 state 入参')
  assert.match(rightSidebarSource, /const DEFENSE_MODES: Array<\{ value: WorkspaceDefenseSidebarAiMode, label: string \}> = \[[\s\S]*\{ value: 'defense', label: 'AgentDef 对答' \}[\s\S]*\{ value: 'dialog_ask', label: 'AgentDef 询问' \}[\s\S]*\{ value: 'auto_optimize', label: 'AgentDef 优化' \}[\s\S]*\{ value: 'issue_discovery', label: 'AgentDef 寻疑' \}[\s\S]*\]/, '右栏答辩工作台模式下拉未切到 AgentDef 语义')
  assert.match(rightSidebarSource, /const projectAssistantOptions = computed<Array<\{ value: WorkspaceProjectAssistantMode, label: string \}>>\(\(\) => \{[\s\S]*value: 'contextual'[\s\S]*value: 'dialog_ask'[\s\S]*label: '对话询问'/, '右栏研发工作台未限定为 contextual \/ 对话询问 两类入口')
  assert.match(rightSidebarSource, /当前为设计助手，只做只读分析，优先帮助你梳理页面层级、布局结构、视觉一致性和交互说明。/, '右栏缺少设计助手提示语')
  assert.match(rightSidebarSource, /当前为原型助手，只做只读分析，优先帮助你梳理页面流转、模块拆分、关键状态和交互路径。/, '右栏缺少原型助手提示语')
  assert.match(rightSidebarSource, /当前为 AgentDef 只读对话模式，会围绕比赛状态、评委追问和证据缺口给出下一步建议，不会直接改写项目数据。/, '右栏未切到 AgentDef 对话提示语')
  assert.match(rightSidebarSource, /暂无打开的 AgentDef 会话/, '右栏未切到 AgentDef 会话空态')
  assert.match(rightSidebarSource, /发送给 AgentDef/, '右栏发送按钮未切到 AgentDef 语义')
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
