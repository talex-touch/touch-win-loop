<script setup lang="ts">
import type {
  AiChatSession,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefensePersonaJudgeType,
  AiDefenseScorecard,
  AiDefenseSessionState,
  AiDefenseStage,
  AiDefenseSummary,
  AiProjectChangeRequest,
  AiWorkspaceDocumentAction,
  AiWorkspaceDocumentDraft,
  AiWorkspaceDocumentSelectionRange,
  AiWorkspaceSceneDraft,
  AiWorkspaceWorkflowDraft,
  ChatMessage,
  Contest,
  DefenseRealtimeMediaMode,
  DefenseRealtimeProvider,
  DefenseRealtimeSessionMeta,
  ProjectIssue,
  ProjectIssueReport,
  ProjectResourceCommentAnchor,
  ProjectResourceCommentThread,
  Resource,
  Track,
  WorkflowArchitectureView,
  WorkflowDraftAction,
  WorkflowLayoutPreset,
  WorkflowStylePreset,
  WorkspaceAiAssistantPreset,
  WorkspaceAiMode,
  WorkspaceContextualAssistantKey,
  WorkspaceTabSpacingPreset,
} from '~~/shared/types/domain'
import { buildAgentDocDraftKey } from '~~/shared/utils/agent-doc'
import { resolveWorkspaceStreamSystemMessageView } from '~~/shared/utils/workspace-ai-stream'
import { resolveWorkspaceTabDensityTokens } from '~~/shared/utils/workspace-tab-layout'
import UnifiedAvatar from '~/components/UnifiedAvatar.vue'
import { useTransientHighlightSet } from '~/composables/useTransientHighlightSet'
import { buildWorkflowDraftKey } from '~/utils/workspace-drawio'
import { buildSceneDraftKey } from '~/utils/workspace-scene'

type WorkspaceDefenseSidebarAiMode = Exclude<WorkspaceAiMode, 'document_assist' | 'contextual_agent'>
type WorkspaceProjectAssistantMode = 'contextual' | 'dialog_ask'
type WorkspaceWorkbenchMode = 'project' | 'defense' | 'final_review'
type WorkspaceRightSidebarView = 'ai' | 'comments'
type WorkspaceSessionVisualType = WorkspaceAiMode | 'final_review' | 'topic_proposal'
type AgentDocDraftStatus = 'pending' | 'superseded' | 'expired' | 'applied'
type DraftStatus = 'pending' | 'superseded' | 'expired' | 'applied' | 'discarded'
type AgentDocDiffRowKind = 'same' | 'change' | 'delete' | 'insert'

interface AgentDocDiffRow {
  key: string
  kind: AgentDocDiffRowKind
  leftLineNumber: string
  rightLineNumber: string
  leftText: string
  rightText: string
}

const props = withDefaults(defineProps<{
  chatSessions?: AiChatSession[]
  openChatSessionIds?: string[]
  activeChatSessionId?: string
  chatSessionsLoading?: boolean
  chatSessionsRefreshing?: boolean
  chatSessionDeletingId?: string
  chatMessages?: ChatMessage[]
  chatMessagesLoading?: boolean
  chatInput?: string
  chatLoading?: boolean
  chatInterrupting?: boolean
  workspacePreparing?: boolean
  currentUserName?: string
  currentUserAvatarUrl?: string | null
  workbenchMode?: WorkspaceWorkbenchMode
  projectAssistantMode?: WorkspaceProjectAssistantMode
  projectContextualAssistantLabel?: string
  projectContextualAssistantPreset?: WorkspaceAiAssistantPreset | ''
  projectContextualAssistantKey?: WorkspaceContextualAssistantKey | ''
  aiMode?: WorkspaceAiMode
  changeRequests?: AiProjectChangeRequest[]
  changeRequestsLoading?: boolean
  issueReport?: ProjectIssueReport | null
  projectIssues?: ProjectIssue[]
  issueLoading?: boolean
  changeActingIds?: string[]
  changeSecondConfirmIds?: string[]
  defenseRounds?: AiDefenseJudgeRound[]
  defenseScorecard?: AiDefenseScorecard | null
  defensePersonas?: AiDefensePersona[]
  defenseSessionMeta?: AiChatSession | null
  defenseSessionState?: AiDefenseSessionState | null
  defenseRealtimeState?: DefenseRealtimeSessionMeta | null
  defenseRealtimeLogs?: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    createdAt: string
  }>
  defenseStage?: AiDefenseStage
  defenseTurnCount?: number
  defenseSummary?: AiDefenseSummary | null
  defensePersonasLoading?: boolean
  defenseSummaryLoading?: boolean
  selectedContest?: Contest | null
  selectedTrack?: Track | null
  selectedResources?: Resource[]
  sidebarView?: WorkspaceRightSidebarView
  commentThreads?: ProjectResourceCommentThread[]
  activeCommentThreadId?: string
  commentDraftAnchor?: ProjectResourceCommentAnchor | null
  commentLoading?: boolean
  commentMutating?: boolean
  showCommentTab?: boolean
  documentResourceTitle?: string
  documentResourceId?: string
  documentMarkdownHash?: string
  documentSelectionText?: string
  documentSelectionRange?: AiWorkspaceDocumentSelectionRange | null
  appliedAgentDocDraftKeys?: string[]
  workflowResourceId?: string
  workflowResourceTitle?: string
  workflowHash?: string
  workflowPageCount?: number
  appliedWorkflowDraftKeys?: string[]
  discardedWorkflowDraftKeys?: string[]
  sceneResourceId?: string
  sceneResourceTitle?: string
  sceneHash?: string
  appliedSceneDraftKeys?: string[]
  discardedSceneDraftKeys?: string[]
  sceneGenerateAvailable?: boolean
  sceneGenerateDisabledReason?: string
  sceneCompleteAvailable?: boolean
  sceneCompleteDisabledReason?: string
  sceneRefineAvailable?: boolean
  sceneRefineDisabledReason?: string
  sceneRestyleAvailable?: boolean
  sceneRestyleDisabledReason?: string
  workflowGenerateAvailable?: boolean
  workflowGenerateDisabledReason?: string
  workflowCompleteAvailable?: boolean
  workflowCompleteDisabledReason?: string
  workflowRefineAvailable?: boolean
  workflowRefineDisabledReason?: string
  workflowRestyleAvailable?: boolean
  workflowRestyleDisabledReason?: string
  issueReportSubmitting?: boolean
  issueReportExporting?: boolean
  aiEnabled?: boolean
  aiDisabledReason?: string
  tabSpacingPreset?: WorkspaceTabSpacingPreset | ''
  collapsed?: boolean
}>(), {
  chatSessions: () => [],
  openChatSessionIds: () => [],
  activeChatSessionId: '',
  chatSessionsLoading: false,
  chatSessionsRefreshing: false,
  chatSessionDeletingId: '',
  chatMessages: () => [],
  chatMessagesLoading: false,
  chatInput: '',
  chatLoading: false,
  chatInterrupting: false,
  workspacePreparing: false,
  currentUserName: '',
  currentUserAvatarUrl: '',
  workbenchMode: 'project',
  projectAssistantMode: 'contextual',
  projectContextualAssistantLabel: '',
  projectContextualAssistantPreset: '',
  projectContextualAssistantKey: '',
  aiMode: 'dialog_ask',
  changeRequests: () => [],
  changeRequestsLoading: false,
  issueReport: null,
  projectIssues: () => [],
  issueLoading: false,
  changeActingIds: () => [],
  changeSecondConfirmIds: () => [],
  defenseRounds: () => [],
  defenseScorecard: null,
  defensePersonas: () => [],
  defenseSessionMeta: null,
  defenseSessionState: null,
  defenseRealtimeState: null,
  defenseRealtimeLogs: () => [],
  defenseStage: undefined,
  defenseTurnCount: 0,
  defenseSummary: null,
  defensePersonasLoading: false,
  defenseSummaryLoading: false,
  selectedContest: null,
  selectedTrack: null,
  selectedResources: () => [],
  sidebarView: 'ai',
  commentThreads: () => [],
  activeCommentThreadId: '',
  commentDraftAnchor: null,
  commentLoading: false,
  commentMutating: false,
  showCommentTab: true,
  documentResourceTitle: '',
  documentResourceId: '',
  documentMarkdownHash: '',
  documentSelectionText: '',
  documentSelectionRange: null,
  appliedAgentDocDraftKeys: () => [],
  workflowResourceId: '',
  workflowResourceTitle: '',
  workflowHash: '',
  workflowPageCount: 0,
  appliedWorkflowDraftKeys: () => [],
  discardedWorkflowDraftKeys: () => [],
  sceneResourceId: '',
  sceneResourceTitle: '',
  sceneHash: '',
  appliedSceneDraftKeys: () => [],
  discardedSceneDraftKeys: () => [],
  sceneGenerateAvailable: true,
  sceneGenerateDisabledReason: '',
  sceneCompleteAvailable: true,
  sceneCompleteDisabledReason: '',
  sceneRefineAvailable: true,
  sceneRefineDisabledReason: '',
  sceneRestyleAvailable: true,
  sceneRestyleDisabledReason: '',
  workflowGenerateAvailable: true,
  workflowGenerateDisabledReason: '',
  workflowCompleteAvailable: true,
  workflowCompleteDisabledReason: '',
  workflowRefineAvailable: true,
  workflowRefineDisabledReason: '',
  workflowRestyleAvailable: true,
  workflowRestyleDisabledReason: '',
  issueReportSubmitting: false,
  issueReportExporting: false,
  aiEnabled: true,
  aiDisabledReason: '',
  tabSpacingPreset: '',
  collapsed: false,
})

const emit = defineEmits<{
  'update:chatInput': [value: string]
  'update:aiMode': [value: WorkspaceAiMode]
  'update:projectAssistantMode': [value: WorkspaceProjectAssistantMode]
  'update:sidebarView': [value: WorkspaceRightSidebarView]
  'collapse': []
  'sendChat': []
  'interruptChat': []
  'switchChatSession': [sessionId: string]
  'deleteChatSession': [sessionId: string]
  'createChatSession': []
  'approveChange': [change: AiProjectChangeRequest]
  'rejectChange': [change: AiProjectChangeRequest]
  'importDefensePersonas': []
  'saveDefensePersona': [payload: {
    personaId?: string
    judgeType: AiDefensePersonaJudgeType
    name: string
    summary: string
    systemPrompt: string
    focusAreas: string[]
    enabled: boolean
  }]
  'deleteDefensePersona': [personaId: string]
  'generateDefenseSummary': []
  'startDefenseRealtime': []
  'updateDefenseRealtimeProvider': [provider: DefenseRealtimeProvider]
  'updateDefenseRealtimeMediaMode': [mode: DefenseRealtimeMediaMode]
  'toggleDefenseRealtimeAudio': [enabled: boolean]
  'toggleDefenseRealtimeVideo': [enabled: boolean]
  'interruptDefenseRealtime': []
  'reconnectDefenseRealtime': []
  'submitIssueReport': [reportId: string]
  'exportIssueReport': [reportId: string]
  'selectCommentThread': [threadId: string]
  'createCommentThread': [body: string]
  'replyCommentThread': [payload: { threadId: string, body: string }]
  'resolveCommentThread': [threadId: string]
  'reopenCommentThread': [threadId: string]
  'cancelCommentDraft': []
  'applyDocumentDraft': [draft: AiWorkspaceDocumentDraft]
  'requestWorkflowDraft': [payload: {
    action: WorkflowDraftAction
    template: 'flowchart' | 'mindmap' | 'er' | 'architecture'
    architectureView?: WorkflowArchitectureView
    stylePreset: WorkflowStylePreset
    layoutPreset: WorkflowLayoutPreset
  }]
  'applyWorkflowDraft': [draft: AiWorkspaceWorkflowDraft]
  'discardWorkflowDraft': [draft: AiWorkspaceWorkflowDraft]
  'requestSceneDraft': [payload: {
    action: WorkflowDraftAction
    template: 'flowchart' | 'mindmap' | 'er' | 'architecture'
    architectureView?: WorkflowArchitectureView
    stylePreset: WorkflowStylePreset
    layoutPreset: WorkflowLayoutPreset
  }]
  'applySceneDraft': [draft: AiWorkspaceSceneDraft]
  'discardSceneDraft': [draft: AiWorkspaceSceneDraft]
  'openResource': [resourceId: string]
}>()

const DEFENSE_MODES: Array<{ value: WorkspaceDefenseSidebarAiMode, label: string }> = [
  { value: 'defense', label: 'AgentDef 对答' },
  { value: 'dialog_ask', label: 'AgentDef 询问' },
  { value: 'auto_optimize', label: 'AgentDef 优化' },
  { value: 'issue_discovery', label: 'AgentDef 寻疑' },
]

const SESSION_VISUALS: Record<WorkspaceSessionVisualType, { icon: string, label: string, prefixes: string[] }> = {
  topic_proposal: {
    icon: 'lightbulb',
    label: '选题助手',
    prefixes: ['选题助手'],
  },
  dialog_ask: {
    icon: 'chat',
    label: '对话询问',
    prefixes: ['Loopy 对话'],
  },
  auto_optimize: {
    icon: 'auto_fix_high',
    label: '自动优化',
    prefixes: ['Loopy 自动优化'],
  },
  issue_discovery: {
    icon: 'search_insights',
    label: '寻疑发现',
    prefixes: ['Loopy 寻疑发现'],
  },
  defense: {
    icon: 'record_voice_over',
    label: 'AgentDef',
    prefixes: ['AgentDef', 'Loopy 答辩模拟', 'Loopy 答辩会话', '答辩模拟'],
  },
  document_assist: {
    icon: 'edit_document',
    label: 'AgentDoc',
    prefixes: ['Loopy AgentDoc', 'Loopy 文稿助手', 'Loopy 文档增强', 'AgentDoc', '文稿助手', '文档增强'],
  },
  contextual_agent: {
    icon: 'deployed_code',
    label: '上下文助手',
    prefixes: ['Loopy AgentProto', 'Loopy 设计助手', 'Loopy 上下文助手', 'AgentProto', '设计助手', '上下文助手'],
  },
  final_review: {
    icon: 'task_alt',
    label: '终审助手',
    prefixes: ['终审助手'],
  },
}

const inputPlaceholder = computed(() => {
  if (!props.aiEnabled)
    return String(props.aiDisabledReason || '').trim() || '当前 AI 未配置，已禁用当前模式。请先在后台完成模型与密钥配置。'
  if (props.aiMode === 'document_assist')
    return '描述你希望如何修改当前文档，AgentDoc 会自动判断意图并先生成待确认草案。'
  if (props.workbenchMode === 'defense' && props.aiMode === 'dialog_ask')
    return '向 AgentDef 追问当前答辩策略，例如：这轮应该先补哪条证据？'
  if (props.workbenchMode === 'project' && props.projectAssistantMode === 'contextual') {
    if (props.projectContextualAssistantPreset === 'design')
      return '可以先聊页面结构、交互目标或视觉问题；需要落地时再生成待确认结构草案。'
    if (props.projectContextualAssistantPreset === 'prototype' && props.projectContextualAssistantLabel === 'AgentProto')
      return '先随便聊流程/结构想法也可以；说“生成草案”或点上方动作时，AgentProto 再产出待确认草案。'
    if (props.projectContextualAssistantPreset === 'prototype')
      return '先聊原型页面、状态或交互路径；需要落地时再生成待确认草案。'
  }
  if (props.aiMode === 'auto_optimize')
    return '描述你希望生成哪些可审批提案，例如：补齐摘要与问题陈述。'
  if (props.aiMode === 'issue_discovery')
    return '描述你希望重点扫描的维度，例如：评分映射、证据链、量化指标、资料完整度。'
  if (props.aiMode === 'defense')
    return '输入给 AgentDef 的答辩指令，例如：请继续追问技术可行性。'
  if (props.workbenchMode === 'defense')
    return '继续输入问题，AgentDef 会基于当前答辩上下文给出建议。'
  return '请输入问题，AI 只做只读分析，不会写入项目。'
})

const WORKFLOW_TEMPLATE_OPTIONS: Array<{ value: 'flowchart' | 'mindmap' | 'er' | 'architecture', label: string }> = [
  { value: 'flowchart', label: '流程图' },
  { value: 'mindmap', label: '脑图' },
  { value: 'er', label: 'ER 图' },
  { value: 'architecture', label: '架构图' },
]

const WORKFLOW_ARCHITECTURE_VIEW_OPTIONS: Array<{ value: WorkflowArchitectureView, label: string }> = [
  { value: 'system_context', label: '系统上下文' },
  { value: 'container', label: '容器图' },
  { value: 'dependency_map', label: '依赖关系' },
]

const WORKFLOW_STYLE_PRESET_OPTIONS: Array<{ value: WorkflowStylePreset, label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'minimal', label: '极简' },
  { value: 'architecture', label: '架构' },
  { value: 'workflow', label: '流程' },
]

const WORKFLOW_LAYOUT_PRESET_OPTIONS: Array<{ value: WorkflowLayoutPreset, label: string }> = [
  { value: 'left_to_right', label: '从左到右' },
  { value: 'top_to_bottom', label: '从上到下' },
  { value: 'swimlane', label: '泳道' },
]

const workflowTemplate = ref<'flowchart' | 'mindmap' | 'er' | 'architecture'>('flowchart')
const workflowArchitectureView = ref<WorkflowArchitectureView>('system_context')
const workflowStylePreset = ref<WorkflowStylePreset>('default')
const workflowLayoutPreset = ref<WorkflowLayoutPreset>('left_to_right')
const showAgentProtoControls = computed(() => {
  return props.workbenchMode === 'project'
    && props.projectAssistantMode === 'contextual'
    && props.projectContextualAssistantKey === 'agent_proto'
})
const isAgentProtoWorkflowContext = computed(() => showAgentProtoControls.value && Boolean(String(props.workflowResourceId || '').trim()))
const isAgentProtoSceneContext = computed(() => showAgentProtoControls.value && !isAgentProtoWorkflowContext.value && Boolean(String(props.sceneResourceId || '').trim()))

const pendingChangeRequests = computed(() => {
  return props.changeRequests.filter(item => item.status === 'pending')
})

const visibleChatMessages = computed(() => {
  return props.chatMessages
})

const visibleChatMessageEntries = computed(() => {
  const lastMessageIndex = Math.max(visibleChatMessages.value.length - 1, 0)
  return visibleChatMessages.value.map((message, index) => {
    const systemMessage = resolveWorkspaceStreamSystemMessageView(message)
    const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
      ? message.metadata as Record<string, unknown>
      : null
    return {
      id: `${message.role}-${systemMessage?.seq || 'na'}-${index}`,
      message,
      agentDocDraft: resolveAgentDocDraft(message),
      workflowDraft: resolveWorkflowDraft(message),
      sceneDraft: resolveSceneDraft(message),
      systemMessage,
      isLive: Boolean(systemMessage && props.chatLoading && index === lastMessageIndex),
      isCompletedSystem: Boolean(systemMessage && index < lastMessageIndex),
      isStreamingAssistant: Boolean(
        message.role === 'assistant'
        && metadata?.localOnly === true
        && String(metadata.streamState || '') === 'streaming',
      ),
    }
  })
})
const expandedSystemMessageIds = ref<string[]>([])
const enteringChatEntryIds = ref<string[]>([])
const highlightedUserChatEntryIds = ref<string[]>([])
const seenChatEntryIds = ref<string[]>([])
const shouldAnimateNewChatEntries = ref(false)
const chatEntryEnterTimers = new Map<string, ReturnType<typeof setTimeout>>()
const chatEntryHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>()
const currentUserDisplayName = computed(() => {
  const value = String(props.currentUserName || '').trim()
  return value || '你'
})
const assistantMessageHeaderLabel = computed(() => {
  if (props.workbenchMode === 'project') {
    if (props.projectAssistantMode === 'contextual') {
      const label = String(props.projectContextualAssistantLabel || '').trim()
      return label || 'Loopy'
    }
    return 'Loopy'
  }
  if (props.workbenchMode === 'final_review')
    return '终审助手'
  if (props.aiMode === 'document_assist')
    return 'AgentDoc'
  if (props.aiMode === 'auto_optimize')
    return '自动优化'
  if (props.aiMode === 'issue_discovery')
    return '寻疑发现'
  if (props.aiMode === 'defense' || props.workbenchMode === 'defense')
    return 'AgentDef'
  return 'Loopy'
})

const showChatSkeleton = computed(() => {
  return props.workspacePreparing || ((props.chatSessionsLoading || props.chatMessagesLoading) && visibleChatMessages.value.length === 0)
})

const showDialogAskEmpty = computed(() => {
  return !showChatSkeleton.value && props.aiMode === 'dialog_ask' && visibleChatMessages.value.length === 0
})
const chatScrollViewport = ref<HTMLElement | null>(null)
const chatShouldStickToBottom = ref(true)
const CHAT_AUTO_SCROLL_THRESHOLD_PX = 32
const latestVisibleChatEntrySignature = computed(() => {
  const lastEntry = visibleChatMessageEntries.value[visibleChatMessageEntries.value.length - 1]
  if (!lastEntry)
    return `${props.activeChatSessionId}:empty:${Number(props.chatMessagesLoading)}`

  return [
    props.activeChatSessionId,
    visibleChatMessageEntries.value.length,
    lastEntry.id,
    lastEntry.message.content,
    lastEntry.systemMessage?.title || '',
    lastEntry.systemMessage?.payloadSummary || '',
    lastEntry.isLive ? 'live' : 'idle',
  ].join('::')
})

function clearChatEntryTimer(timerMap: Map<string, ReturnType<typeof setTimeout>>, entryId: string): void {
  const timer = timerMap.get(entryId)
  if (!timer)
    return
  clearTimeout(timer)
  timerMap.delete(entryId)
}

function markVisibleChatEntriesAsSeen(): void {
  seenChatEntryIds.value = visibleChatMessageEntries.value.map(entry => entry.id)
}

function clearChatEntryVisualState(options: { resetSeen?: boolean } = {}): void {
  enteringChatEntryIds.value = []
  highlightedUserChatEntryIds.value = []
  shouldAnimateNewChatEntries.value = false
  for (const timer of chatEntryEnterTimers.values())
    clearTimeout(timer)
  for (const timer of chatEntryHighlightTimers.values())
    clearTimeout(timer)
  chatEntryEnterTimers.clear()
  chatEntryHighlightTimers.clear()
  if (options.resetSeen !== false)
    seenChatEntryIds.value = []
}

function scheduleChatEntryMotion(entryId: string, role: ChatMessage['role']): void {
  if (role !== 'user' && role !== 'assistant')
    return

  enteringChatEntryIds.value = [...new Set([...enteringChatEntryIds.value, entryId])]
  clearChatEntryTimer(chatEntryEnterTimers, entryId)
  chatEntryEnterTimers.set(entryId, setTimeout(() => {
    enteringChatEntryIds.value = enteringChatEntryIds.value.filter(id => id !== entryId)
    chatEntryEnterTimers.delete(entryId)
  }, role === 'assistant' ? 220 : 180))

  if (role !== 'user')
    return

  highlightedUserChatEntryIds.value = [...new Set([...highlightedUserChatEntryIds.value, entryId])]
  clearChatEntryTimer(chatEntryHighlightTimers, entryId)
  chatEntryHighlightTimers.set(entryId, setTimeout(() => {
    highlightedUserChatEntryIds.value = highlightedUserChatEntryIds.value.filter(id => id !== entryId)
    chatEntryHighlightTimers.delete(entryId)
  }, 680))
}

function isChatEntryEntering(entryId: string): boolean {
  return enteringChatEntryIds.value.includes(entryId)
}

function isUserChatEntryHighlighted(entryId: string): boolean {
  return highlightedUserChatEntryIds.value.includes(entryId)
}
const isDefenseWorkbench = computed(() => props.workbenchMode === 'defense')
const sessionEmptyText = computed(() => isDefenseWorkbench.value ? '暂无打开的 AgentDef 会话' : '暂无打开的会话')
const createSessionLabel = computed(() => isDefenseWorkbench.value ? '新建 AgentDef 会话' : '新建对话')
const defenseSessionTimingText = computed(() => {
  const startedAt = formatSessionDetailTime(props.defenseSessionMeta?.createdAt)
  const updatedAt = formatSessionDetailTime(
    props.defenseSessionState?.updatedAt
    || props.defenseSessionMeta?.updatedAt
    || props.defenseSessionMeta?.lastMessageAt,
  )
  if (!props.defenseSessionMeta && !props.defenseSessionState)
    return '尚未生成答辩会话时间轴。'
  return `开始：${startedAt} · 更新：${updatedAt}`
})
const defenseRealtimeRows = computed<Array<{ label: string, value: string }>>(() => {
  return [
    {
      label: 'Provider',
      value: props.defenseRealtimeState?.provider === 'coze' ? 'Coze' : '千问',
    },
    {
      label: '媒体',
      value: props.defenseRealtimeState?.mediaMode === 'audio' ? '仅音频' : '音视频理解',
    },
    {
      label: '连接态',
      value: defenseRealtimeConnectionLabel(props.defenseRealtimeState?.connectionState),
    },
    {
      label: '当前评委',
      value: String(props.defenseRealtimeState?.latestSpeakerLabel || '等待首句'),
    },
    {
      label: '延迟',
      value: props.defenseRealtimeState?.latestLatencyMs ? `${Math.round(props.defenseRealtimeState.latestLatencyMs)} ms` : '暂无',
    },
  ]
})

const defenseRealtimeSessionLocked = computed(() => {
  const connectionState = props.defenseRealtimeState?.connectionState
  return props.defenseRealtimeState?.bootstrapState === 'bootstrapping'
    || connectionState === 'bootstrapping'
    || connectionState === 'connecting'
    || connectionState === 'connected'
})

const defenseRealtimeCanInterrupt = computed(() => {
  const connectionState = props.defenseRealtimeState?.connectionState
  return connectionState === 'connecting' || connectionState === 'connected'
})

const defenseRealtimeVideoToggleDisabled = computed(() => props.defenseRealtimeState?.mediaMode === 'audio')

const issueReportStatusLabel = computed(() => {
  if (props.issueReport?.reviewSubmissionStatus === 'submitted')
    return '已提交评审'
  return '草稿'
})

const commentDraftText = ref('')
const commentReplyDraftMap = reactive<Record<string, string>>({})
const historyPopoverVisible = ref(false)

const showCommentsView = computed(() => props.showCommentTab && props.sidebarView === 'comments')
const showDocumentAssistView = computed(() => props.sidebarView === 'ai' && props.aiMode === 'document_assist')
const markdownSidebarEnabled = computed(() => {
  return Boolean(
    props.aiMode === 'document_assist'
    || (props.showCommentTab && (props.commentDraftAnchor || props.commentThreads.length > 0)),
  )
})
const showSessionHeaderCompact = computed(() => {
  return !showCommentsView.value && !showDocumentAssistView.value && !markdownSidebarEnabled.value
})
const showSessionHeaderFlush = computed(() => showDocumentAssistView.value)
function resolveWorkspaceRightSessionTabMetric(value: string, minimum: number): string {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed))
    return `${minimum}px`
  return `${Math.max(minimum, parsed)}px`
}

const workspaceRightSessionTabLayoutStyle = computed<Record<string, string>>(() => {
  const density = resolveWorkspaceTabDensityTokens(props.tabSpacingPreset || 'relaxed')
  return {
    '--workspace-right-session-strip-height': resolveWorkspaceRightSessionTabMetric(density.stripHeight, 40),
    '--workspace-right-session-tab-min-width': resolveWorkspaceRightSessionTabMetric(density.minWidth, 144),
    '--workspace-right-session-tab-padding-x': resolveWorkspaceRightSessionTabMetric(density.paddingX, 8),
    '--workspace-right-session-tab-gap': resolveWorkspaceRightSessionTabMetric(density.triggerGap, 6),
    '--workspace-right-session-tab-label-size': resolveWorkspaceRightSessionTabMetric(density.labelSize, 12),
    '--workspace-right-session-tab-icon-size': resolveWorkspaceRightSessionTabMetric(density.iconSize, 16),
    '--workspace-right-session-action-size': resolveWorkspaceRightSessionTabMetric(density.stripHeight, 40),
    '--workspace-right-session-action-icon-size': resolveWorkspaceRightSessionTabMetric(density.iconSize, 16),
    '--workspace-right-session-active-indicator-inset': resolveWorkspaceRightSessionTabMetric(density.activeIndicatorInset, 10),
    '--workspace-right-session-empty-padding-x': resolveWorkspaceRightSessionTabMetric(density.paddingX, 8),
    '--workspace-right-session-refresh-padding-x': resolveWorkspaceRightSessionTabMetric(density.paddingX, 8),
  }
})
const openChatSessions = computed(() => {
  const sessionMap = new Map(props.chatSessions.map(item => [item.id, item] as const))
  const openedSessions = props.openChatSessionIds
    .map(sessionId => sessionMap.get(sessionId) || null)
    .filter((session): session is AiChatSession => Boolean(session))

  if (
    props.activeChatSessionId
    && !props.openChatSessionIds.includes(props.activeChatSessionId)
    && sessionMap.has(props.activeChatSessionId)
  ) {
    const activeSession = sessionMap.get(props.activeChatSessionId)
    if (activeSession)
      openedSessions.push(activeSession)
  }

  return openedSessions
})
const sessionTabHighlightInitialized = ref(false)
const {
  isHighlighted: isChatSessionHighlighted,
  queueHighlightedIds: queueChatSessionHighlightedIds,
} = useTransientHighlightSet()

watch(openChatSessions, (nextSessions, previousSessions) => {
  if (!sessionTabHighlightInitialized.value) {
    sessionTabHighlightInitialized.value = true
    return
  }

  const previousSessionIdSet = new Set(
    (previousSessions || [])
      .map(session => String(session.id || '').trim())
      .filter(Boolean),
  )
  queueChatSessionHighlightedIds(
    nextSessions
      .map(session => String(session.id || '').trim())
      .filter(id => id && !previousSessionIdSet.has(id)),
  )
})
const activeCommentThread = computed(() => {
  const threadId = String(props.activeCommentThreadId || '').trim()
  if (!threadId)
    return null
  return props.commentThreads.find(item => item.id === threadId) || null
})
const aiDisabledNoticeText = computed(() => {
  const text = String(props.aiDisabledReason || '').trim()
  if (text)
    return text
  return '当前 AI 未配置，已禁用当前模式。请先在后台完成模型与密钥配置。'
})
const projectAssistantOptions = computed<Array<{ value: WorkspaceProjectAssistantMode, label: string }>>(() => {
  const options: Array<{ value: WorkspaceProjectAssistantMode, label: string }> = []
  if (props.projectContextualAssistantLabel) {
    options.push({
      value: 'contextual',
      label: props.projectContextualAssistantLabel,
    })
  }
  options.push({
    value: 'dialog_ask',
    label: '对话询问',
  })
  return options
})

watch(() => props.showCommentTab, (nextValue) => {
  if (!nextValue && props.sidebarView === 'comments')
    emit('update:sidebarView', 'ai')
})

function isChatViewportNearBottom(viewport: HTMLElement): boolean {
  const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
  return distanceToBottom <= CHAT_AUTO_SCROLL_THRESHOLD_PX
}

async function scrollChatViewportToBottom(force = false): Promise<void> {
  await nextTick()
  const viewport = chatScrollViewport.value
  if (!viewport)
    return
  if (!force && !chatShouldStickToBottom.value)
    return

  viewport.scrollTop = viewport.scrollHeight
  chatShouldStickToBottom.value = true
}

function handleChatViewportScroll(): void {
  const viewport = chatScrollViewport.value
  if (!viewport)
    return
  chatShouldStickToBottom.value = isChatViewportNearBottom(viewport)
}

watch(() => props.activeChatSessionId, async (nextId, previousId) => {
  if (nextId === previousId)
    return
  clearChatEntryVisualState()
  expandedSystemMessageIds.value = []
  chatShouldStickToBottom.value = true
  await scrollChatViewportToBottom(true)
  markVisibleChatEntriesAsSeen()
  shouldAnimateNewChatEntries.value = !props.chatMessagesLoading
})

watch(() => props.chatMessagesLoading, async (loading, previousLoading) => {
  if (loading) {
    clearChatEntryVisualState()
    return
  }
  if (loading || !previousLoading)
    return
  chatShouldStickToBottom.value = true
  await scrollChatViewportToBottom(true)
  markVisibleChatEntriesAsSeen()
  shouldAnimateNewChatEntries.value = true
})

watch(() => visibleChatMessageEntries.value.map(entry => entry.id), (nextIds) => {
  if (!shouldAnimateNewChatEntries.value || props.chatMessagesLoading)
    return

  const seenIds = new Set(seenChatEntryIds.value)
  const nextSeenIds = [...seenChatEntryIds.value]
  for (const entry of visibleChatMessageEntries.value) {
    if (seenIds.has(entry.id))
      continue
    seenIds.add(entry.id)
    nextSeenIds.push(entry.id)
    if (!entry.systemMessage)
      scheduleChatEntryMotion(entry.id, entry.message.role)
  }
  seenChatEntryIds.value = nextSeenIds.filter(id => nextIds.includes(id))
})

watch(latestVisibleChatEntrySignature, async () => {
  if (visibleChatMessageEntries.value.length === 0)
    return
  await scrollChatViewportToBottom()
})

onMounted(async () => {
  markVisibleChatEntriesAsSeen()
  await scrollChatViewportToBottom(true)
  shouldAnimateNewChatEntries.value = !props.chatMessagesLoading
})

onBeforeUnmount(() => {
  clearChatEntryVisualState()
})

function isSystemMessageExpanded(entryId: string): boolean {
  return expandedSystemMessageIds.value.includes(entryId)
}

function toggleSystemMessageExpanded(entryId: string): void {
  expandedSystemMessageIds.value = isSystemMessageExpanded(entryId)
    ? expandedSystemMessageIds.value.filter(id => id !== entryId)
    : [...expandedSystemMessageIds.value, entryId]
}

function resolveSystemMessageDetailTitle(input: { title: string, payloadSummary: string }): string {
  return input.title
}

function resolveSystemMessageDetailPayload(input: { title: string, payloadSummary: string }): string {
  return input.payloadSummary
}

function summarizeCommentAnchor(anchor: ProjectResourceCommentAnchor | null | undefined): string {
  if (!anchor)
    return '未指定锚点'
  if (anchor.type === 'image_node')
    return anchor.title || anchor.alt || '图片评论'
  return anchor.selectedTextPreview || anchor.headingText || `文本选区 ${anchor.anchorLine}:${anchor.anchorColumn}`
}

function requestShowAiView(): void {
  emit('update:sidebarView', 'ai')
}

function requestShowCommentsView(): void {
  if (!props.showCommentTab)
    return
  emit('update:sidebarView', 'comments')
}

function isWorkflowActionAvailable(action: WorkflowDraftAction): boolean {
  if (action === 'complete')
    return props.workflowCompleteAvailable
  if (action === 'refine')
    return props.workflowRefineAvailable
  if (action === 'restyle')
    return props.workflowRestyleAvailable
  return props.workflowGenerateAvailable
}

function resolveWorkflowActionUnavailableReason(action: WorkflowDraftAction): string {
  if (!props.aiEnabled)
    return aiDisabledNoticeText.value
  if (action === 'complete')
    return String(props.workflowCompleteDisabledReason || '').trim()
  if (action === 'refine')
    return String(props.workflowRefineDisabledReason || '').trim()
  if (action === 'restyle')
    return String(props.workflowRestyleDisabledReason || '').trim()
  return String(props.workflowGenerateDisabledReason || '').trim()
}

function isWorkflowActionDisabled(action: WorkflowDraftAction): boolean {
  return props.chatLoading || !props.aiEnabled || !isWorkflowActionAvailable(action)
}

function resolveWorkflowActionButtonTitle(action: WorkflowDraftAction): string {
  if (!isWorkflowActionDisabled(action))
    return ''
  if (props.chatLoading)
    return 'AI 运行中，请稍候。'
  return resolveWorkflowActionUnavailableReason(action)
}

function requestWorkflowDraft(action: WorkflowDraftAction): void {
  if (isWorkflowActionDisabled(action))
    return
  emit('requestWorkflowDraft', {
    action,
    template: workflowTemplate.value,
    architectureView: workflowTemplate.value === 'architecture' ? workflowArchitectureView.value : undefined,
    stylePreset: workflowStylePreset.value,
    layoutPreset: workflowLayoutPreset.value,
  })
}

function isSceneActionAvailable(action: WorkflowDraftAction): boolean {
  if (action === 'complete')
    return props.sceneCompleteAvailable
  if (action === 'refine')
    return props.sceneRefineAvailable
  if (action === 'restyle')
    return props.sceneRestyleAvailable
  return props.sceneGenerateAvailable
}

function resolveSceneActionUnavailableReason(action: WorkflowDraftAction): string {
  if (!props.aiEnabled)
    return aiDisabledNoticeText.value
  if (action === 'complete')
    return String(props.sceneCompleteDisabledReason || '').trim()
  if (action === 'refine')
    return String(props.sceneRefineDisabledReason || '').trim()
  if (action === 'restyle')
    return String(props.sceneRestyleDisabledReason || '').trim()
  return String(props.sceneGenerateDisabledReason || '').trim()
}

function isSceneActionDisabled(action: WorkflowDraftAction): boolean {
  return props.chatLoading || !props.aiEnabled || !isSceneActionAvailable(action)
}

function resolveSceneActionButtonTitle(action: WorkflowDraftAction): string {
  if (!isSceneActionDisabled(action))
    return ''
  if (props.chatLoading)
    return 'AI 运行中，请稍候。'
  return resolveSceneActionUnavailableReason(action)
}

function requestSceneDraft(action: WorkflowDraftAction): void {
  if (isSceneActionDisabled(action))
    return
  emit('requestSceneDraft', {
    action,
    template: workflowTemplate.value,
    architectureView: workflowTemplate.value === 'architecture' ? workflowArchitectureView.value : undefined,
    stylePreset: workflowStylePreset.value,
    layoutPreset: workflowLayoutPreset.value,
  })
}

function isAgentProtoActionDisabled(action: WorkflowDraftAction): boolean {
  if (isAgentProtoWorkflowContext.value)
    return isWorkflowActionDisabled(action)
  if (isAgentProtoSceneContext.value)
    return isSceneActionDisabled(action)
  return true
}

function resolveAgentProtoActionButtonTitle(action: WorkflowDraftAction): string {
  if (isAgentProtoWorkflowContext.value)
    return resolveWorkflowActionButtonTitle(action)
  if (isAgentProtoSceneContext.value)
    return resolveSceneActionButtonTitle(action)
  return '当前没有可操作的 AgentProto 画布。'
}

function requestAgentProtoDraft(action: WorkflowDraftAction): void {
  if (isAgentProtoWorkflowContext.value) {
    requestWorkflowDraft(action)
    return
  }
  if (isAgentProtoSceneContext.value)
    requestSceneDraft(action)
}

function selectCommentThread(threadId: string): void {
  emit('selectCommentThread', threadId)
}

function submitCommentDraft(): void {
  const body = commentDraftText.value.trim()
  if (!body)
    return
  emit('createCommentThread', body)
  commentDraftText.value = ''
}

function submitCommentReply(threadId: string): void {
  const body = String(commentReplyDraftMap[threadId] || '').trim()
  if (!body)
    return
  emit('replyCommentThread', { threadId, body })
  commentReplyDraftMap[threadId] = ''
}

function resolveAgentDocActionLabel(action: AiWorkspaceDocumentAction): string {
  if (action === 'summarize')
    return '总结'
  if (action === 'rewrite')
    return '润写'
  if (action === 'continue')
    return '续写'
  if (action === 'expand')
    return '扩写'
  if (action === 'complete_context')
    return '补全上下文'
  if (action === 'restructure')
    return '整理结构'
  return 'AgentDoc'
}

function resolveWorkflowActionLabel(action: WorkflowDraftAction): string {
  if (action === 'complete')
    return 'AI 补全'
  if (action === 'refine')
    return 'AI 续改'
  if (action === 'restyle')
    return '调样式'
  return 'AI 生成'
}

function resolveWorkflowTemplateLabel(template: 'flowchart' | 'mindmap' | 'er' | 'architecture'): string {
  return WORKFLOW_TEMPLATE_OPTIONS.find(item => item.value === template)?.label || template
}

function resolveWorkflowArchitectureViewLabel(view: WorkflowArchitectureView): string {
  return WORKFLOW_ARCHITECTURE_VIEW_OPTIONS.find(item => item.value === view)?.label || view
}

function resolveWorkflowStylePresetLabel(preset: WorkflowStylePreset): string {
  return WORKFLOW_STYLE_PRESET_OPTIONS.find(item => item.value === preset)?.label || preset
}

function resolveWorkflowLayoutPresetLabel(preset: WorkflowLayoutPreset): string {
  return WORKFLOW_LAYOUT_PRESET_OPTIONS.find(item => item.value === preset)?.label || preset
}

function resolveSystemMessageIcon(eventType: 'progress' | 'tool', completed = false): string {
  if (completed)
    return 'check'
  if (eventType === 'tool')
    return 'terminal'
  return 'progress_activity'
}

function resolveSystemMessageText(input: { title: string, payloadSummary: string }): string {
  if (!input.payloadSummary)
    return input.title
  return `${input.title} · ${input.payloadSummary}`
}

function isChangeActing(changeId: string): boolean {
  return props.changeActingIds.includes(changeId)
}

function requiresSecondConfirm(change: AiProjectChangeRequest): boolean {
  if (!change.destructive)
    return false
  return props.changeSecondConfirmIds.includes(change.id)
}

function severityLabel(value: string): string {
  if (value === 'critical')
    return '严重'
  if (value === 'high')
    return '高'
  if (value === 'low')
    return '低'
  return '中'
}

function severityClass(value: string): string {
  if (value === 'critical')
    return 'workspace-issue-pill workspace-issue-pill--critical'
  if (value === 'high')
    return 'workspace-issue-pill workspace-issue-pill--high'
  if (value === 'low')
    return 'workspace-issue-pill workspace-issue-pill--low'
  return 'workspace-issue-pill workspace-issue-pill--medium'
}

function selectDefenseMode(mode: WorkspaceDefenseSidebarAiMode) {
  emit('update:aiMode', mode)
}

function selectProjectAssistantMode(mode: WorkspaceProjectAssistantMode) {
  emit('update:projectAssistantMode', mode)
}

function resolveEmbeddedModeOptions(): Array<{ value: WorkspaceDefenseSidebarAiMode | WorkspaceProjectAssistantMode, label: string }> {
  if (props.workbenchMode === 'project')
    return projectAssistantOptions.value
  return DEFENSE_MODES
}

function modeSelectValue(): WorkspaceDefenseSidebarAiMode | WorkspaceProjectAssistantMode | '' {
  if (props.workbenchMode === 'project') {
    if (props.projectAssistantMode === 'dialog_ask')
      return 'dialog_ask'
    return props.projectContextualAssistantLabel ? 'contextual' : 'dialog_ask'
  }
  if (props.aiMode === 'document_assist')
    return ''
  return props.aiMode as WorkspaceDefenseSidebarAiMode
}

function applyModeSelectValue(value: WorkspaceDefenseSidebarAiMode | WorkspaceProjectAssistantMode): void {
  if (!value)
    return

  if (props.workbenchMode === 'project') {
    if (value === 'contextual' || value === 'dialog_ask')
      selectProjectAssistantMode(value as WorkspaceProjectAssistantMode)
    return
  }
  if (value === 'defense' || value === 'dialog_ask' || value === 'auto_optimize' || value === 'issue_discovery')
    selectDefenseMode(value as WorkspaceDefenseSidebarAiMode)
}

function handleModeSelectChange(event: Event) {
  const value = String((event.target as HTMLSelectElement).value || '').trim()
  if (!value)
    return

  applyModeSelectValue(value as WorkspaceDefenseSidebarAiMode | WorkspaceProjectAssistantMode)
}

function cycleEmbeddedModeByShortcut(direction: 1 | -1): void {
  const options = resolveEmbeddedModeOptions()
  if (options.length < 2)
    return

  const currentValue = modeSelectValue()
  const currentIndex = options.findIndex(option => option.value === currentValue)
  const fallbackIndex = direction > 0 ? -1 : 0
  const nextIndex = (currentIndex >= 0 ? currentIndex : fallbackIndex) + direction
  const normalizedIndex = (nextIndex + options.length) % options.length
  const nextOption = options[normalizedIndex]
  if (!nextOption)
    return

  applyModeSelectValue(nextOption.value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function resolveSessionTitle(session: AiChatSession): string {
  const title = String(session.title || '').trim()
  if (!title)
    return '未命名会话'
  if (title.startsWith('Loopy 答辩模拟'))
    return title.replace('Loopy 答辩模拟', 'AgentDef')
  if (title.startsWith('Loopy 答辩会话'))
    return title.replace('Loopy 答辩会话', 'AgentDef')
  if (title.startsWith('答辩模拟'))
    return title.replace('答辩模拟', 'AgentDef')
  if (title.startsWith('Loopy 文稿助手'))
    return title.replace('Loopy 文稿助手', 'Loopy AgentDoc')
  if (title.startsWith('Loopy 文档增强'))
    return title.replace('Loopy 文档增强', 'Loopy AgentDoc')
  if (title.startsWith('文稿助手'))
    return title.replace('文稿助手', 'AgentDoc')
  if (title.startsWith('文档增强'))
    return title.replace('文档增强', 'AgentDoc')
  return title
}

function resolveSessionVisualType(session: AiChatSession): WorkspaceSessionVisualType {
  const title = resolveSessionTitle(session)

  if (title.includes('选题助手'))
    return 'topic_proposal'
  if (title.includes('终审助手'))
    return 'final_review'
  if (title.includes('AgentDef'))
    return 'defense'
  if (title.includes('答辩'))
    return 'defense'
  if (title.includes('自动优化'))
    return 'auto_optimize'
  if (title.includes('寻疑发现'))
    return 'issue_discovery'
  if (title.includes('AgentDoc') || title.includes('文稿助手') || title.includes('文档增强'))
    return 'document_assist'
  if (title.includes('AgentProto') || title.includes('设计助手') || title.includes('上下文助手'))
    return 'contextual_agent'
  if (session.mode === 'auto_optimize' || session.mode === 'issue_discovery' || session.mode === 'defense' || session.mode === 'document_assist' || session.mode === 'contextual_agent')
    return session.mode
  return 'dialog_ask'
}

function trimSessionTypePrefix(title: string, type: WorkspaceSessionVisualType): string {
  const prefixes = SESSION_VISUALS[type].prefixes
  for (const prefix of prefixes) {
    const pattern = new RegExp(`^(?:新建\\s*)?${escapeRegExp(prefix)}\\s*[·•|｜:：-]?\\s*`, 'u')
    const stripped = title.replace(pattern, '').trim()
    if (stripped)
      return stripped
  }

  return title
}

function truncateSessionTabLabel(title: string): string {
  const chars = Array.from(title)
  if (chars.length <= 8)
    return title
  return `${chars.slice(0, 8).join('')}…`
}

function resolveSessionTabLabel(session: AiChatSession): string {
  const fullTitle = resolveSessionTitle(session)
  const trimmedTitle = trimSessionTypePrefix(fullTitle, resolveSessionVisualType(session))
  return truncateSessionTabLabel(trimmedTitle || fullTitle)
}

function resolveSessionTabIcon(session: AiChatSession): string {
  return SESSION_VISUALS[resolveSessionVisualType(session)].icon
}

function resolveSessionTypeLabel(session: AiChatSession): string {
  return SESSION_VISUALS[resolveSessionVisualType(session)].label
}

function normalizeAgentDocText(value: string): string {
  return String(value || '').replace(/\r\n?/g, '\n')
}

function splitAgentDocLines(value: string): string[] {
  return normalizeAgentDocText(value).split('\n')
}

function isAgentDocDraft(value: unknown): value is AiWorkspaceDocumentDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.action === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.summary === 'string'
    && typeof candidate.resourceId === 'string'
    && typeof candidate.baseDocumentHash === 'string'
    && typeof candidate.applyMode === 'string'
    && typeof candidate.originalText === 'string'
    && typeof candidate.proposedText === 'string'
  )
}

function resolveAgentDocDraft(message: ChatMessage): AiWorkspaceDocumentDraft | null {
  const metadata = message.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null
  const draft = (metadata as Record<string, unknown>).agentDocDraft
  return isAgentDocDraft(draft) ? draft : null
}

function isWorkflowDraft(value: unknown): value is AiWorkspaceWorkflowDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.action === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.summary === 'string'
    && typeof candidate.resourceId === 'string'
    && typeof candidate.template === 'string'
    && typeof candidate.sourceFormat === 'string'
    && typeof candidate.sourceText === 'string'
    && typeof candidate.stylePreset === 'string'
    && typeof candidate.layoutPreset === 'string'
    && typeof candidate.baseWorkflowHash === 'string'
  )
}

function resolveWorkflowDraft(message: ChatMessage): AiWorkspaceWorkflowDraft | null {
  const metadata = message.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null
  const draft = (metadata as Record<string, unknown>).workflowDraft
  return isWorkflowDraft(draft) ? draft : null
}

function isSceneDraft(value: unknown): value is AiWorkspaceSceneDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.action === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.summary === 'string'
    && typeof candidate.resourceId === 'string'
    && typeof candidate.template === 'string'
    && typeof candidate.sourceFormat === 'string'
    && typeof candidate.sourceText === 'string'
    && typeof candidate.stylePreset === 'string'
    && typeof candidate.layoutPreset === 'string'
    && typeof candidate.baseSceneHash === 'string'
  )
}

function resolveSceneDraft(message: ChatMessage): AiWorkspaceSceneDraft | null {
  const metadata = message.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null
  const draft = (metadata as Record<string, unknown>).sceneDraft
  return isSceneDraft(draft) ? draft : null
}

const latestAgentDocDraftKeyByResource = computed(() => {
  const result = new Map<string, string>()
  for (const entry of visibleChatMessageEntries.value) {
    if (!entry.agentDocDraft)
      continue
    result.set(entry.agentDocDraft.resourceId, buildAgentDocDraftKey(entry.agentDocDraft))
  }
  return result
})

const appliedAgentDocDraftKeySet = computed(() => {
  return new Set((props.appliedAgentDocDraftKeys || []).map(item => String(item || '').trim()).filter(Boolean))
})

const latestWorkflowDraftKeyByResource = computed(() => {
  const result = new Map<string, string>()
  for (const entry of visibleChatMessageEntries.value) {
    if (!entry.workflowDraft)
      continue
    result.set(entry.workflowDraft.resourceId, buildWorkflowDraftKey(entry.workflowDraft))
  }
  return result
})

const latestSceneDraftKeyByResource = computed(() => {
  const result = new Map<string, string>()
  for (const entry of visibleChatMessageEntries.value) {
    if (!entry.sceneDraft)
      continue
    result.set(entry.sceneDraft.resourceId, buildSceneDraftKey(entry.sceneDraft))
  }
  return result
})

const appliedWorkflowDraftKeySet = computed(() => {
  return new Set((props.appliedWorkflowDraftKeys || []).map(item => String(item || '').trim()).filter(Boolean))
})

const discardedWorkflowDraftKeySet = computed(() => {
  return new Set((props.discardedWorkflowDraftKeys || []).map(item => String(item || '').trim()).filter(Boolean))
})

const appliedSceneDraftKeySet = computed(() => {
  return new Set((props.appliedSceneDraftKeys || []).map(item => String(item || '').trim()).filter(Boolean))
})

const discardedSceneDraftKeySet = computed(() => {
  return new Set((props.discardedSceneDraftKeys || []).map(item => String(item || '').trim()).filter(Boolean))
})

function resolveAgentDocDraftStatus(draft: AiWorkspaceDocumentDraft): AgentDocDraftStatus {
  const draftKey = buildAgentDocDraftKey(draft)
  if (appliedAgentDocDraftKeySet.value.has(draftKey))
    return 'applied'

  const latestDraftKey = latestAgentDocDraftKeyByResource.value.get(draft.resourceId)
  if (latestDraftKey && latestDraftKey !== draftKey)
    return 'superseded'

  if (
    draft.resourceId !== String(props.documentResourceId || '').trim()
    || draft.baseDocumentHash !== String(props.documentMarkdownHash || '').trim()
  ) {
    return 'expired'
  }

  return 'pending'
}

function resolveWorkflowDraftStatus(draft: AiWorkspaceWorkflowDraft): DraftStatus {
  const draftKey = buildWorkflowDraftKey(draft)
  if (discardedWorkflowDraftKeySet.value.has(draftKey))
    return 'discarded'
  if (appliedWorkflowDraftKeySet.value.has(draftKey))
    return 'applied'

  const latestDraftKey = latestWorkflowDraftKeyByResource.value.get(draft.resourceId)
  if (latestDraftKey && latestDraftKey !== draftKey)
    return 'superseded'

  if (
    draft.resourceId !== String(props.workflowResourceId || '').trim()
    || draft.baseWorkflowHash !== String(props.workflowHash || '').trim()
  ) {
    return 'expired'
  }

  return 'pending'
}

function resolveSceneDraftStatus(draft: AiWorkspaceSceneDraft): DraftStatus {
  const draftKey = buildSceneDraftKey(draft)
  if (discardedSceneDraftKeySet.value.has(draftKey))
    return 'discarded'
  if (appliedSceneDraftKeySet.value.has(draftKey))
    return 'applied'

  const latestDraftKey = latestSceneDraftKeyByResource.value.get(draft.resourceId)
  if (latestDraftKey && latestDraftKey !== draftKey)
    return 'superseded'

  if (
    draft.resourceId !== String(props.sceneResourceId || '').trim()
    || draft.baseSceneHash !== String(props.sceneHash || '').trim()
  ) {
    return 'expired'
  }

  return 'pending'
}

function resolveAgentDocDraftStatusLabel(status: AgentDocDraftStatus): string {
  if (status === 'applied')
    return '已应用'
  if (status === 'superseded')
    return '已被更新草案替代'
  if (status === 'expired')
    return '已过期，请重新生成'
  return '待确认，确认后才会替换当前文档内容'
}

function resolveWorkflowDraftStatusLabel(status: DraftStatus): string {
  if (status === 'applied')
    return '已应用'
  if (status === 'discarded')
    return '已丢弃'
  if (status === 'superseded')
    return '已被更新草案替代'
  if (status === 'expired')
    return '已过期，请重新生成'
  return '待确认，确认后才会替换当前流程画布'
}

function resolveSceneDraftStatusLabel(status: DraftStatus): string {
  if (status === 'applied')
    return '已应用'
  if (status === 'discarded')
    return '已丢弃'
  if (status === 'superseded')
    return '已被更新草案替代'
  if (status === 'expired')
    return '已过期，请重新生成'
  return '待确认，确认后才会替换当前自由画布'
}

function resolveWorkflowDraftBlockedReason(draft: AiWorkspaceWorkflowDraft): string {
  if (resolveWorkflowDraftStatus(draft) !== 'pending')
    return ''
  if (Math.max(0, Number(props.workflowPageCount || 0)) > 1)
    return '多页流程资源当前仅支持预览，不支持直接应用。'
  return ''
}

function resolveSceneDraftBlockedReason(draft: AiWorkspaceSceneDraft): string {
  if (resolveSceneDraftStatus(draft) !== 'pending')
    return ''
  return ''
}

function buildFallbackAgentDocDiffRows(leftLines: string[], rightLines: string[]): AgentDocDiffRow[] {
  const rows: AgentDocDiffRow[] = []
  const rowCount = Math.max(leftLines.length, rightLines.length)
  for (let index = 0; index < rowCount; index += 1) {
    const leftText = leftLines[index] ?? ''
    const rightText = rightLines[index] ?? ''
    rows.push({
      key: `fallback-${index}`,
      kind: leftText === rightText ? 'same' : (leftText && rightText ? 'change' : (leftText ? 'delete' : 'insert')),
      leftLineNumber: leftLines[index] !== undefined ? String(index + 1) : '',
      rightLineNumber: rightLines[index] !== undefined ? String(index + 1) : '',
      leftText,
      rightText,
    })
  }
  return rows
}

function buildAgentDocDiffRows(draft: AiWorkspaceDocumentDraft): AgentDocDiffRow[] {
  const leftLines = splitAgentDocLines(draft.originalText)
  const rightLines = splitAgentDocLines(draft.proposedText)
  if (leftLines.length * rightLines.length > 60000)
    return buildFallbackAgentDocDiffRows(leftLines, rightLines)

  const lcs = Array.from(
    { length: leftLines.length + 1 },
    () => Array.from({ length: rightLines.length + 1 }).fill(0),
  ) as number[][]
  for (let leftIndex = 1; leftIndex <= leftLines.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= rightLines.length; rightIndex += 1) {
      const currentRow = lcs[leftIndex]
      const previousRow = lcs[leftIndex - 1]
      if (!currentRow || !previousRow)
        continue
      if (leftLines[leftIndex - 1] === rightLines[rightIndex - 1])
        currentRow[rightIndex] = previousRow[rightIndex - 1] ?? 0
      else
        currentRow[rightIndex] = Math.max(previousRow[rightIndex] ?? 0, currentRow[rightIndex - 1] ?? 0)
    }
  }

  const operations: Array<{ type: 'same' | 'delete' | 'insert', text: string }> = []
  let leftIndex = leftLines.length
  let rightIndex = rightLines.length

  while (leftIndex > 0 || rightIndex > 0) {
    const leftText = leftLines[leftIndex - 1]
    const rightText = rightLines[rightIndex - 1]
    if (leftIndex > 0 && rightIndex > 0 && leftText === rightText) {
      operations.unshift({ type: 'same', text: leftText || '' })
      leftIndex -= 1
      rightIndex -= 1
      continue
    }
    if (rightIndex > 0 && (leftIndex === 0 || (lcs[leftIndex]?.[rightIndex - 1] || 0) >= (lcs[leftIndex - 1]?.[rightIndex] || 0))) {
      operations.unshift({ type: 'insert', text: rightText || '' })
      rightIndex -= 1
      continue
    }
    operations.unshift({ type: 'delete', text: leftText || '' })
    leftIndex -= 1
  }

  const rows: AgentDocDiffRow[] = []
  let nextLeftLineNumber = 1
  let nextRightLineNumber = 1
  let operationIndex = 0

  while (operationIndex < operations.length) {
    const operation = operations[operationIndex]
    if (!operation) {
      operationIndex += 1
      continue
    }

    if (operation.type === 'same') {
      rows.push({
        key: `same-${operationIndex}`,
        kind: 'same',
        leftLineNumber: String(nextLeftLineNumber),
        rightLineNumber: String(nextRightLineNumber),
        leftText: operation.text,
        rightText: operation.text,
      })
      nextLeftLineNumber += 1
      nextRightLineNumber += 1
      operationIndex += 1
      continue
    }

    const deletedLines: string[] = []
    const insertedLines: string[] = []
    while (operationIndex < operations.length && operations[operationIndex]?.type !== 'same') {
      const blockOperation = operations[operationIndex]
      if (blockOperation?.type === 'delete')
        deletedLines.push(blockOperation.text)
      else if (blockOperation?.type === 'insert')
        insertedLines.push(blockOperation.text)
      operationIndex += 1
    }

    const rowCount = Math.max(deletedLines.length, insertedLines.length)
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const leftText = deletedLines[rowIndex] ?? ''
      const rightText = insertedLines[rowIndex] ?? ''
      rows.push({
        key: `change-${operationIndex}-${rowIndex}`,
        kind: leftText && rightText ? 'change' : (leftText ? 'delete' : 'insert'),
        leftLineNumber: deletedLines[rowIndex] !== undefined ? String(nextLeftLineNumber++) : '',
        rightLineNumber: insertedLines[rowIndex] !== undefined ? String(nextRightLineNumber++) : '',
        leftText,
        rightText,
      })
    }
  }

  return rows
}

function resolveAgentDocDiffClass(kind: AgentDocDiffRowKind): string {
  if (kind === 'change')
    return 'workspace-agent-doc-card__diff-row--change'
  if (kind === 'delete')
    return 'workspace-agent-doc-card__diff-row--delete'
  if (kind === 'insert')
    return 'workspace-agent-doc-card__diff-row--insert'
  return ''
}

function requestApplyAgentDocDraft(draft: AiWorkspaceDocumentDraft): void {
  if (resolveAgentDocDraftStatus(draft) !== 'pending')
    return
  emit('applyDocumentDraft', draft)
}

function requestApplyWorkflowDraft(draft: AiWorkspaceWorkflowDraft): void {
  if (resolveWorkflowDraftStatus(draft) !== 'pending')
    return
  if (resolveWorkflowDraftBlockedReason(draft))
    return
  emit('applyWorkflowDraft', draft)
}

function requestDiscardWorkflowDraft(draft: AiWorkspaceWorkflowDraft): void {
  if (resolveWorkflowDraftStatus(draft) === 'applied')
    return
  emit('discardWorkflowDraft', draft)
}

function requestApplySceneDraft(draft: AiWorkspaceSceneDraft): void {
  if (resolveSceneDraftStatus(draft) !== 'pending')
    return
  if (resolveSceneDraftBlockedReason(draft))
    return
  emit('applySceneDraft', draft)
}

function requestDiscardSceneDraft(draft: AiWorkspaceSceneDraft): void {
  if (resolveSceneDraftStatus(draft) === 'applied')
    return
  emit('discardSceneDraft', draft)
}

function formatSessionDetailTime(value: string | null | undefined): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '暂无'

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime()))
    return normalized

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function setHistoryPopoverVisible(visible: boolean): void {
  historyPopoverVisible.value = visible
}

function handleChatSessionSwitch(sessionId: string): void {
  historyPopoverVisible.value = false
  emit('switchChatSession', sessionId)
}

function handleCreateChatSession(): void {
  if (!props.aiEnabled)
    return
  historyPopoverVisible.value = false
  emit('createChatSession')
}

function handleDeleteChatSession(sessionId: string): void {
  emit('deleteChatSession', sessionId)
}

function defenseStageLabel(stage: AiDefenseStage | undefined): string {
  if (stage === 'opening')
    return '开场'
  if (stage === 'qa')
    return '问答'
  if (stage === 'rebuttal')
    return '反驳'
  if (stage === 'closing')
    return '收束'
  return '未开始'
}

function defenseRealtimeConnectionLabel(state?: DefenseRealtimeSessionMeta['connectionState']): string {
  if (state === 'bootstrapping')
    return '握手中'
  if (state === 'connecting')
    return '连接中'
  if (state === 'connected')
    return '已连接'
  if (state === 'interrupted')
    return '已中断'
  if (state === 'error')
    return '异常'
  if (state === 'closed')
    return '已关闭'
  return '待机'
}

function handleDefenseRealtimeProviderChange(event: Event): void {
  const value = String((event.target as HTMLSelectElement | null)?.value || 'qwen').trim()
  emit('updateDefenseRealtimeProvider', value === 'coze' ? 'coze' : 'qwen')
}

function handleDefenseRealtimeMediaModeChange(event: Event): void {
  const value = String((event.target as HTMLSelectElement | null)?.value || 'audio_video').trim()
  emit('updateDefenseRealtimeMediaMode', value === 'audio' ? 'audio' : 'audio_video')
}

const defensePersonaFormVisible = ref(false)
const defensePersonaEditingId = ref('')
const defensePersonaForm = reactive<{
  judgeType: AiDefensePersonaJudgeType
  name: string
  summary: string
  systemPrompt: string
  focusAreasText: string
  enabled: boolean
}>({
  judgeType: 'custom',
  name: '',
  summary: '',
  systemPrompt: '',
  focusAreasText: '',
  enabled: true,
})

function resetDefensePersonaForm() {
  defensePersonaEditingId.value = ''
  defensePersonaForm.judgeType = 'custom'
  defensePersonaForm.name = ''
  defensePersonaForm.summary = ''
  defensePersonaForm.systemPrompt = ''
  defensePersonaForm.focusAreasText = ''
  defensePersonaForm.enabled = true
}

function openCreateDefensePersonaForm() {
  resetDefensePersonaForm()
  defensePersonaFormVisible.value = true
}

function openEditDefensePersonaForm(persona: AiDefensePersona) {
  defensePersonaEditingId.value = persona.id
  defensePersonaForm.judgeType = persona.judgeType
  defensePersonaForm.name = persona.name
  defensePersonaForm.summary = persona.summary
  defensePersonaForm.systemPrompt = persona.systemPrompt
  defensePersonaForm.focusAreasText = (persona.focusAreas || []).join('\n')
  defensePersonaForm.enabled = persona.enabled
  defensePersonaFormVisible.value = true
}

function submitDefensePersonaForm() {
  const name = defensePersonaForm.name.trim()
  const systemPrompt = defensePersonaForm.systemPrompt.trim()
  if (!name || !systemPrompt)
    return
  emit('saveDefensePersona', {
    personaId: defensePersonaEditingId.value || undefined,
    judgeType: defensePersonaForm.judgeType,
    name,
    summary: defensePersonaForm.summary.trim(),
    systemPrompt,
    focusAreas: defensePersonaForm.focusAreasText
      .split(/\n+/)
      .map(item => item.trim())
      .filter(Boolean),
    enabled: defensePersonaForm.enabled,
  })
  defensePersonaFormVisible.value = false
  resetDefensePersonaForm()
}

function quickToggleDefensePersona(persona: AiDefensePersona) {
  emit('saveDefensePersona', {
    personaId: persona.id,
    judgeType: persona.judgeType,
    name: persona.name,
    summary: persona.summary,
    systemPrompt: persona.systemPrompt,
    focusAreas: persona.focusAreas || [],
    enabled: !persona.enabled,
  })
}

function requestSubmitIssueReport() {
  const reportId = String(props.issueReport?.id || '').trim()
  if (!reportId || props.issueReportSubmitting)
    return
  emit('submitIssueReport', reportId)
}

function requestExportIssueReport() {
  const reportId = String(props.issueReport?.id || '').trim()
  if (!reportId || props.issueReportExporting)
    return
  emit('exportIssueReport', reportId)
}

function handleChatComposerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (event.isComposing || (event as KeyboardEvent & { keyCode?: number }).keyCode === 229)
      return

    event.preventDefault()
    cycleEmbeddedModeByShortcut(-1)
    return
  }

  if (!props.aiEnabled)
    return
  if (event.key !== 'Enter')
    return
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)
    return
  if (event.isComposing || (event as KeyboardEvent & { keyCode?: number }).keyCode === 229)
    return
  if (props.chatLoading || props.chatInterrupting)
    return

  event.preventDefault()
  emit('sendChat')
}
</script>

<template>
  <aside
    class="workspace-right-sidebar border-l border-slate-200 bg-white flex flex-col h-full min-h-0 w-full overflow-hidden"
    :style="workspaceRightSessionTabLayoutStyle"
    :tabindex="props.collapsed ? -1 : 0"
  >
    <div
      class="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/72 shrink-0 space-y-2"
      :class="{
        'workspace-right-sidebar__header--compact': showSessionHeaderCompact,
        'workspace-right-sidebar__header--flush': showSessionHeaderFlush,
      }"
    >
      <div
        v-if="showCommentsView"
        class="workspace-right-sidebar__context-chip"
      >
        <template v-if="showCommentsView">
          文档评论（{{ props.commentThreads.length }}）
        </template>
      </div>

      <div v-if="markdownSidebarEnabled && props.showCommentTab" class="p-1 border border-slate-200 rounded-lg bg-white flex gap-1">
        <button
          class="workspace-right-sidebar__switch-pill"
          :class="{ 'workspace-right-sidebar__switch-pill--active': !showCommentsView }"
          type="button"
          @click="requestShowAiView"
        >
          <span class="material-symbols-outlined text-sm">smart_toy</span>
          <span>AI</span>
        </button>
        <button
          class="workspace-right-sidebar__switch-pill"
          :class="{ 'workspace-right-sidebar__switch-pill--active': showCommentsView }"
          type="button"
          @click="requestShowCommentsView"
        >
          <span class="material-symbols-outlined text-sm">comment</span>
          <span>评论</span>
        </button>
      </div>

      <template v-if="showCommentsView">
        <div class="text-[11px] text-slate-500 leading-5">
          <template v-if="props.commentDraftAnchor">
            当前将基于“{{ summarizeCommentAnchor(props.commentDraftAnchor) }}”创建新线程。
          </template>
          <template v-else-if="activeCommentThread">
            当前线程：{{ activeCommentThread.summaryText || summarizeCommentAnchor(activeCommentThread.anchor) }}
          </template>
          <template v-else>
            选择文内评论标记，或先在正文里选区后发起评论。
          </template>
        </div>
      </template>

      <template v-else>
        <div v-if="props.workspacePreparing || chatSessionsLoading" class="space-y-2" aria-hidden="true">
          <div class="rounded bg-slate-100 h-7 animate-pulse" />
          <div class="rounded bg-slate-100 h-7 animate-pulse" />
        </div>
        <div v-else class="workspace-right-sidebar__session-strip">
          <div
            class="workspace-right-sidebar__session-tabs"
            data-testid="workspace-right-sidebar-session-tabs"
          >
            <div
              v-if="openChatSessions.length === 0"
              class="workspace-right-sidebar__session-empty"
            >
              {{ sessionEmptyText }}
            </div>
            <div
              v-for="session in openChatSessions"
              :key="session.id"
              class="workspace-right-sidebar__session-trigger"
            >
              <button
                class="workspace-right-sidebar__session-tab"
                :class="{
                  'workspace-right-sidebar__session-tab--active': session.id === activeChatSessionId,
                  'workspace-right-sidebar__session-tab--fresh': isChatSessionHighlighted(session.id),
                }"
                :title="resolveSessionTitle(session)"
                type="button"
                @click="handleChatSessionSwitch(session.id)"
              >
                <span class="material-symbols-outlined workspace-right-sidebar__session-tab-icon">{{ resolveSessionTabIcon(session) }}</span>
                <span class="workspace-right-sidebar__session-tab-label">{{ resolveSessionTabLabel(session) }}</span>
              </button>
            </div>
          </div>

          <div class="workspace-right-sidebar__session-actions">
            <div v-if="props.chatSessionsRefreshing" class="workspace-right-sidebar__session-refreshing">
              <span class="workspace-right-sidebar__session-refreshing-dot" aria-hidden="true" />
              <span>刷新中</span>
            </div>
            <a-trigger
              class="workspace-right-sidebar__session-history-trigger"
              trigger="click"
              position="bottom"
              :popup-visible="historyPopoverVisible"
              @popup-visible-change="setHistoryPopoverVisible"
            >
              <button
                class="workspace-right-sidebar__session-action workspace-right-sidebar__session-history-button"
                data-testid="workspace-right-sidebar-session-history-button"
                type="button"
                title="会话历史"
                aria-label="会话历史"
                @click.stop
              >
                <span class="material-symbols-outlined workspace-right-sidebar__session-action-icon">history</span>
              </button>

              <template #content>
                <div
                  class="workspace-right-sidebar__session-history-popover"
                  data-testid="workspace-right-sidebar-session-history-popover"
                >
                  <div class="workspace-right-sidebar__session-history-heading">
                    历史记录
                  </div>
                  <div v-if="chatSessions.length === 0" class="workspace-right-sidebar__session-history-empty">
                    暂无历史记录
                  </div>
                  <div v-else class="workspace-right-sidebar__session-history-list">
                    <div
                      v-for="session in chatSessions"
                      :key="`history-${session.id}`"
                      class="workspace-right-sidebar__session-history-row"
                      :class="{ 'workspace-right-sidebar__session-history-row--active': session.id === activeChatSessionId }"
                    >
                      <button
                        class="workspace-right-sidebar__session-history-entry"
                        type="button"
                        :title="resolveSessionTitle(session)"
                        @click="handleChatSessionSwitch(session.id)"
                      >
                        <span class="material-symbols-outlined workspace-right-sidebar__session-history-icon">{{ resolveSessionTabIcon(session) }}</span>
                        <span class="workspace-right-sidebar__session-history-copy">
                          <span class="workspace-right-sidebar__session-history-title">{{ resolveSessionTitle(session) }}</span>
                          <span class="workspace-right-sidebar__session-history-meta">
                            {{ resolveSessionTypeLabel(session) }} · {{ formatSessionDetailTime(session.lastMessageAt || session.updatedAt) }}
                          </span>
                        </span>
                      </button>
                      <button
                        class="workspace-right-sidebar__session-history-delete"
                        data-testid="workspace-right-sidebar-session-history-delete"
                        type="button"
                        :title="props.chatSessionDeletingId === session.id ? '删除中' : '删除会话'"
                        :aria-label="props.chatSessionDeletingId === session.id ? '删除中' : '删除会话'"
                        :disabled="props.chatSessionDeletingId === session.id"
                        @click.stop="handleDeleteChatSession(session.id)"
                      >
                        <span class="material-symbols-outlined workspace-right-sidebar__session-history-delete-icon">
                          {{ props.chatSessionDeletingId === session.id ? 'hourglass_top' : 'delete' }}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </a-trigger>

            <button
              class="workspace-right-sidebar__session-action workspace-right-sidebar__session-create"
              type="button"
              :title="createSessionLabel"
              :aria-label="createSessionLabel"
              :disabled="!props.aiEnabled"
              @click="handleCreateChatSession"
            >
              <span class="material-symbols-outlined workspace-right-sidebar__session-create-icon">add</span>
            </button>
          </div>
        </div>

        <div
          v-if="showAgentProtoControls"
          class="workspace-workflow-toolbar"
          data-testid="workspace-workflow-toolbar"
        >
          <div class="workspace-workflow-toolbar__actions">
            <button
              class="workspace-workflow-toolbar__action"
              type="button"
              :disabled="isAgentProtoActionDisabled('generate')"
              :title="resolveAgentProtoActionButtonTitle('generate') || undefined"
              @click="requestAgentProtoDraft('generate')"
            >
              AI 生成
            </button>
            <button
              class="workspace-workflow-toolbar__action"
              type="button"
              :disabled="isAgentProtoActionDisabled('complete')"
              :title="resolveAgentProtoActionButtonTitle('complete') || undefined"
              @click="requestAgentProtoDraft('complete')"
            >
              AI 补全
            </button>
            <button
              class="workspace-workflow-toolbar__action"
              type="button"
              :disabled="isAgentProtoActionDisabled('refine')"
              :title="resolveAgentProtoActionButtonTitle('refine') || undefined"
              @click="requestAgentProtoDraft('refine')"
            >
              AI 续改
            </button>
            <button
              class="workspace-workflow-toolbar__action"
              type="button"
              :disabled="isAgentProtoActionDisabled('restyle')"
              :title="resolveAgentProtoActionButtonTitle('restyle') || undefined"
              @click="requestAgentProtoDraft('restyle')"
            >
              调样式
            </button>
          </div>

          <div class="workspace-workflow-toolbar__filters">
            <label class="workspace-workflow-toolbar__field">
              <span>图类型</span>
              <select v-model="workflowTemplate" class="workspace-workflow-toolbar__select">
                <option
                  v-for="option in WORKFLOW_TEMPLATE_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label v-if="workflowTemplate === 'architecture'" class="workspace-workflow-toolbar__field">
              <span>架构视图</span>
              <select v-model="workflowArchitectureView" class="workspace-workflow-toolbar__select">
                <option
                  v-for="option in WORKFLOW_ARCHITECTURE_VIEW_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="workspace-workflow-toolbar__field">
              <span>样式</span>
              <select v-model="workflowStylePreset" class="workspace-workflow-toolbar__select">
                <option
                  v-for="option in WORKFLOW_STYLE_PRESET_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="workspace-workflow-toolbar__field">
              <span>布局</span>
              <select v-model="workflowLayoutPreset" class="workspace-workflow-toolbar__select">
                <option
                  v-for="option in WORKFLOW_LAYOUT_PRESET_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>
        </div>
      </template>
    </div>

    <div class="flex flex-1 flex-col h-0 min-h-0 overflow-hidden">
      <div
        ref="chatScrollViewport"
        class="no-scrollbar px-3.5 py-3 flex-1 h-0 min-h-0 overflow-y-auto"
        @scroll.passive="handleChatViewportScroll"
      >
        <template v-if="showCommentsView">
          <div class="space-y-3">
            <div v-if="props.commentLoading && props.commentThreads.length === 0" class="space-y-2" aria-hidden="true">
              <div class="rounded bg-slate-100 h-16 animate-pulse" />
              <div class="rounded bg-slate-100 h-16 animate-pulse" />
            </div>
            <div v-else-if="props.commentThreads.length === 0 && !props.commentDraftAnchor" class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed">
              当前文档还没有评论线程。
            </div>
            <div
              v-for="thread in props.commentThreads"
              :key="thread.id"
              class="p-3 border rounded-lg bg-white transition-colors"
              :class="thread.id === props.activeCommentThreadId ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200'"
            >
              <button
                class="text-left w-full"
                type="button"
                @click="selectCommentThread(thread.id)"
              >
                <div class="flex gap-3 items-start justify-between">
                  <div class="min-w-0">
                    <div class="text-[11px] text-slate-800 font-semibold truncate">
                      {{ thread.summaryText || summarizeCommentAnchor(thread.anchor) }}
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1">
                      {{ thread.createdByUsername || thread.createdByUserId }} · {{ thread.updatedAt || thread.createdAt }}
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1 flex gap-1 items-center">
                      <span class="material-symbols-outlined text-[12px]" aria-hidden="true">place</span>
                      <span class="truncate">{{ summarizeCommentAnchor(thread.anchor) }}</span>
                    </div>
                  </div>
                  <span
                    class="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                    :class="thread.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'"
                  >
                    {{ thread.status === 'resolved' ? '已解决' : '进行中' }}
                  </span>
                </div>
              </button>

              <div class="mt-3 space-y-2">
                <div
                  v-for="message in thread.messages"
                  :key="message.id"
                  class="px-3 py-2 border border-slate-200 rounded bg-slate-50"
                >
                  <div class="text-[10px] text-slate-500">
                    {{ message.createdByUsername || message.createdByUserId }} · {{ message.createdAt }}
                  </div>
                  <div class="text-[11px] text-slate-700 mt-1 whitespace-pre-wrap">
                    {{ message.body }}
                  </div>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  class="text-[11px] text-slate-700 font-semibold px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100"
                  type="button"
                  @click="selectCommentThread(thread.id)"
                >
                  定位正文
                </button>
                <button
                  v-if="thread.status !== 'resolved'"
                  class="text-[11px] text-emerald-700 font-semibold px-2.5 py-1 border border-emerald-200 rounded bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60"
                  :disabled="props.commentMutating"
                  type="button"
                  @click="emit('resolveCommentThread', thread.id)"
                >
                  解决
                </button>
                <button
                  v-else
                  class="text-[11px] text-slate-700 font-semibold px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-60"
                  :disabled="props.commentMutating"
                  type="button"
                  @click="emit('reopenCommentThread', thread.id)"
                >
                  重新打开
                </button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="workspace-chat-scroll-content">
            <div
              v-if="!props.aiEnabled"
              class="workspace-right-sidebar__disabled-notice text-[11px] text-amber-700 leading-5 p-3 border border-amber-200 rounded bg-amber-50"
            >
              {{ aiDisabledNoticeText }}
            </div>
            <div v-if="showChatSkeleton" class="workspace-chat-messages" aria-hidden="true">
              <div
                v-for="index in 4"
                :key="`workspace-chat-skeleton-${index}`"
                class="flex gap-2 items-start"
                :class="index % 2 === 0 ? '' : 'justify-end'"
              >
                <div v-if="index % 2 === 0" class="rounded bg-slate-200 shrink-0 h-6 w-6 animate-pulse" />
                <div
                  class="rounded-lg bg-slate-100 animate-pulse"
                  :class="index % 2 === 0 ? 'h-14 w-4/5 rounded-tl-none' : 'h-12 w-3/5 rounded-tr-none'"
                />
                <div v-if="index % 2 === 1" class="rounded-full bg-slate-200 shrink-0 h-6 w-6 animate-pulse" />
              </div>
            </div>
            <div v-else class="workspace-chat-messages">
              <div
                v-for="entry in visibleChatMessageEntries"
                :key="entry.id"
                class="workspace-chat-entry"
                :class="{
                  'workspace-chat-entry--user': entry.message.role === 'user',
                  'workspace-chat-entry--assistant': entry.message.role === 'assistant',
                  'workspace-chat-entry--system': Boolean(entry.systemMessage),
                  'workspace-chat-entry--entering': isChatEntryEntering(entry.id),
                  'workspace-chat-entry--recent-user': entry.message.role === 'user' && isUserChatEntryHighlighted(entry.id),
                  'workspace-chat-entry--streaming-assistant': entry.isStreamingAssistant,
                }"
              >
                <div
                  v-if="entry.systemMessage"
                  class="workspace-chat-system-message"
                  :class="{
                    'workspace-chat-system-message--live': entry.isLive,
                    'workspace-chat-system-message--expanded': isSystemMessageExpanded(entry.id),
                  }"
                  data-testid="workspace-chat-system-message"
                  :title="resolveSystemMessageText(entry.systemMessage)"
                >
                  <button
                    class="workspace-chat-system-message__summary"
                    type="button"
                    :aria-expanded="isSystemMessageExpanded(entry.id) ? 'true' : 'false'"
                    @click="toggleSystemMessageExpanded(entry.id)"
                  >
                    <span class="material-symbols-outlined workspace-chat-system-message__icon">
                      {{ resolveSystemMessageIcon(entry.systemMessage.eventType, entry.isCompletedSystem) }}
                    </span>
                    <div class="workspace-chat-system-message__text">
                      {{ resolveSystemMessageText(entry.systemMessage) }}
                    </div>
                    <span class="material-symbols-outlined workspace-chat-system-message__chevron">
                      chevron_right
                    </span>
                  </button>
                  <div
                    v-if="isSystemMessageExpanded(entry.id)"
                    class="workspace-chat-system-message__detail"
                  >
                    <div class="workspace-chat-system-message__detail-title">
                      {{ resolveSystemMessageDetailTitle(entry.systemMessage) }}
                    </div>
                    <pre
                      v-if="resolveSystemMessageDetailPayload(entry.systemMessage)"
                      class="workspace-chat-system-message__detail-payload"
                    >{{ resolveSystemMessageDetailPayload(entry.systemMessage) }}</pre>
                  </div>
                </div>

                <template v-else>
                  <div
                    class="workspace-chat-message"
                    :class="entry.message.role === 'user' ? 'workspace-chat-message--user' : 'workspace-chat-message--assistant'"
                  >
                    <div
                      v-if="entry.message.role === 'assistant'"
                      class="workspace-chat-message__assistant-head"
                    >
                      <div class="workspace-chat-message__assistant-icon">
                        <span class="material-symbols-outlined text-sm">smart_toy</span>
                      </div>
                      <div class="workspace-chat-message__meta">
                        <div class="workspace-chat-message__title">
                          {{ assistantMessageHeaderLabel }}
                        </div>
                      </div>
                    </div>
                    <div
                      v-else
                      class="workspace-chat-message__user-head"
                    >
                      <div class="workspace-chat-message__meta workspace-chat-message__meta--user">
                        <div class="workspace-chat-message__title">
                          {{ currentUserDisplayName }}
                        </div>
                      </div>
                      <UnifiedAvatar
                        :name="currentUserName"
                        :src="currentUserAvatarUrl"
                        :size="24"
                      />
                    </div>

                    <div
                      class="workspace-chat-message__content"
                      :class="entry.message.role === 'user'
                        ? 'workspace-chat-message__content--user'
                        : 'workspace-chat-message__content--assistant'"
                    >
                      <template v-if="entry.message.role === 'user'">
                        {{ entry.message.content }}
                      </template>
                      <WorkspaceAssistantMessageContent
                        v-else
                        :message="entry.message"
                        @open-resource="emit('openResource', $event)"
                      />
                    </div>

                    <div
                      v-if="entry.message.role === 'assistant' && entry.agentDocDraft"
                      class="workspace-agent-doc-card"
                    >
                      <div class="workspace-agent-doc-card__header">
                        <div class="workspace-agent-doc-card__header-copy">
                          <div class="workspace-agent-doc-card__eyebrow">
                            AgentDoc 草案
                          </div>
                          <div class="workspace-agent-doc-card__title">
                            {{ entry.agentDocDraft.title || '待确认修改' }}
                          </div>
                          <div v-if="entry.agentDocDraft.summary" class="workspace-agent-doc-card__summary">
                            {{ entry.agentDocDraft.summary }}
                          </div>
                        </div>
                        <div class="workspace-agent-doc-card__meta">
                          <span class="workspace-agent-doc-card__action">
                            {{ resolveAgentDocActionLabel(entry.agentDocDraft.action) }}
                          </span>
                          <span
                            class="workspace-agent-doc-card__status"
                            :class="`workspace-agent-doc-card__status--${resolveAgentDocDraftStatus(entry.agentDocDraft)}`"
                          >
                            {{ resolveAgentDocDraftStatusLabel(resolveAgentDocDraftStatus(entry.agentDocDraft)) }}
                          </span>
                        </div>
                      </div>

                      <div class="workspace-agent-doc-card__diff">
                        <div class="workspace-agent-doc-card__diff-header">
                          <span>改前</span>
                          <span>改后</span>
                        </div>
                        <div class="workspace-agent-doc-card__diff-body">
                          <div
                            v-for="row in buildAgentDocDiffRows(entry.agentDocDraft)"
                            :key="row.key"
                            class="workspace-agent-doc-card__diff-row"
                            :class="resolveAgentDocDiffClass(row.kind)"
                          >
                            <div class="workspace-agent-doc-card__diff-side">
                              <span class="workspace-agent-doc-card__diff-line-number">{{ row.leftLineNumber || ' ' }}</span>
                              <pre class="workspace-agent-doc-card__diff-text">{{ row.leftText || ' ' }}</pre>
                            </div>
                            <div class="workspace-agent-doc-card__diff-side">
                              <span class="workspace-agent-doc-card__diff-line-number">{{ row.rightLineNumber || ' ' }}</span>
                              <pre class="workspace-agent-doc-card__diff-text">{{ row.rightText || ' ' }}</pre>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="workspace-agent-doc-card__footer">
                        <button
                          class="workspace-agent-doc-card__apply"
                          type="button"
                          :disabled="resolveAgentDocDraftStatus(entry.agentDocDraft) !== 'pending'"
                          @click="requestApplyAgentDocDraft(entry.agentDocDraft)"
                        >
                          确认替换
                        </button>
                      </div>
                    </div>

                    <div
                      v-if="entry.message.role === 'assistant' && entry.workflowDraft"
                      class="workspace-agent-doc-card workspace-agent-doc-card--workflow"
                    >
                      <div class="workspace-agent-doc-card__header">
                        <div class="workspace-agent-doc-card__header-copy">
                          <div class="workspace-agent-doc-card__eyebrow">
                            AgentProto 草案
                          </div>
                          <div class="workspace-agent-doc-card__title">
                            {{ entry.workflowDraft.title || '待确认流程草案' }}
                          </div>
                          <div v-if="entry.workflowDraft.summary" class="workspace-agent-doc-card__summary">
                            {{ entry.workflowDraft.summary }}
                          </div>
                        </div>
                        <div class="workspace-agent-doc-card__meta">
                          <span class="workspace-agent-doc-card__action">
                            {{ resolveWorkflowActionLabel(entry.workflowDraft.action) }}
                          </span>
                          <span
                            class="workspace-agent-doc-card__status"
                            :class="`workspace-agent-doc-card__status--${resolveWorkflowDraftStatus(entry.workflowDraft)}`"
                          >
                            {{ resolveWorkflowDraftStatusLabel(resolveWorkflowDraftStatus(entry.workflowDraft)) }}
                          </span>
                        </div>
                      </div>

                      <div class="workspace-workflow-draft-card__body">
                        <div class="workspace-workflow-draft-card__meta-grid">
                          <span>图类型：{{ resolveWorkflowTemplateLabel(entry.workflowDraft.template) }}</span>
                          <span>样式：{{ resolveWorkflowStylePresetLabel(entry.workflowDraft.stylePreset) }}</span>
                          <span>布局：{{ resolveWorkflowLayoutPresetLabel(entry.workflowDraft.layoutPreset) }}</span>
                          <span v-if="entry.workflowDraft.template === 'architecture' && entry.workflowDraft.architectureView">
                            视图：{{ resolveWorkflowArchitectureViewLabel(entry.workflowDraft.architectureView) }}
                          </span>
                        </div>
                        <div v-if="resolveWorkflowDraftBlockedReason(entry.workflowDraft)" class="workspace-workflow-draft-card__hint">
                          {{ resolveWorkflowDraftBlockedReason(entry.workflowDraft) }}
                        </div>
                      </div>

                      <div class="workspace-agent-doc-card__footer">
                        <button
                          class="workspace-agent-doc-card__apply"
                          type="button"
                          :disabled="resolveWorkflowDraftStatus(entry.workflowDraft) !== 'pending' || Boolean(resolveWorkflowDraftBlockedReason(entry.workflowDraft))"
                          @click="requestApplyWorkflowDraft(entry.workflowDraft)"
                        >
                          应用到当前流程画布
                        </button>
                        <button
                          class="workspace-agent-doc-card__ghost"
                          type="button"
                          :disabled="resolveWorkflowDraftStatus(entry.workflowDraft) === 'applied'"
                          @click="requestDiscardWorkflowDraft(entry.workflowDraft)"
                        >
                          丢弃
                        </button>
                      </div>
                    </div>

                    <div
                      v-if="entry.message.role === 'assistant' && entry.sceneDraft"
                      class="workspace-agent-doc-card workspace-agent-doc-card--workflow"
                    >
                      <div class="workspace-agent-doc-card__header">
                        <div class="workspace-agent-doc-card__header-copy">
                          <div class="workspace-agent-doc-card__eyebrow">
                            AgentProto 草案
                          </div>
                          <div class="workspace-agent-doc-card__title">
                            {{ entry.sceneDraft.title || '待确认自由画布草案' }}
                          </div>
                          <div v-if="entry.sceneDraft.summary" class="workspace-agent-doc-card__summary">
                            {{ entry.sceneDraft.summary }}
                          </div>
                        </div>
                        <div class="workspace-agent-doc-card__meta">
                          <span class="workspace-agent-doc-card__action">
                            {{ resolveWorkflowActionLabel(entry.sceneDraft.action) }}
                          </span>
                          <span
                            class="workspace-agent-doc-card__status"
                            :class="`workspace-agent-doc-card__status--${resolveSceneDraftStatus(entry.sceneDraft)}`"
                          >
                            {{ resolveSceneDraftStatusLabel(resolveSceneDraftStatus(entry.sceneDraft)) }}
                          </span>
                        </div>
                      </div>

                      <div class="workspace-workflow-draft-card__body">
                        <div class="workspace-workflow-draft-card__meta-grid">
                          <span>图类型：{{ resolveWorkflowTemplateLabel(entry.sceneDraft.template) }}</span>
                          <span>样式：{{ resolveWorkflowStylePresetLabel(entry.sceneDraft.stylePreset) }}</span>
                          <span>布局：{{ resolveWorkflowLayoutPresetLabel(entry.sceneDraft.layoutPreset) }}</span>
                          <span v-if="entry.sceneDraft.template === 'architecture' && entry.sceneDraft.architectureView">
                            视图：{{ resolveWorkflowArchitectureViewLabel(entry.sceneDraft.architectureView) }}
                          </span>
                        </div>
                        <div v-if="resolveSceneDraftBlockedReason(entry.sceneDraft)" class="workspace-workflow-draft-card__hint">
                          {{ resolveSceneDraftBlockedReason(entry.sceneDraft) }}
                        </div>
                      </div>

                      <div class="workspace-agent-doc-card__footer">
                        <button
                          class="workspace-agent-doc-card__apply"
                          type="button"
                          :disabled="resolveSceneDraftStatus(entry.sceneDraft) !== 'pending' || Boolean(resolveSceneDraftBlockedReason(entry.sceneDraft))"
                          @click="requestApplySceneDraft(entry.sceneDraft)"
                        >
                          应用到当前自由画布
                        </button>
                        <button
                          class="workspace-agent-doc-card__ghost"
                          type="button"
                          :disabled="resolveSceneDraftStatus(entry.sceneDraft) === 'applied'"
                          @click="requestDiscardSceneDraft(entry.sceneDraft)"
                        >
                          丢弃
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div v-if="showDialogAskEmpty" class="text-[11px] text-slate-500 leading-5 p-3 border border-slate-200 rounded border-dashed">
              {{ props.workbenchMode === 'defense' ? '当前 AgentDef 还没有消息，直接发送问题开始当前答辩会话。' : '当前会话还没有消息，直接发送问题开始对话。' }}
            </div>

            <div v-if="aiMode === 'dialog_ask'" class="text-[11px] text-emerald-700 leading-5 p-3 border border-emerald-200 rounded bg-emerald-50">
              <template v-if="props.workbenchMode === 'defense'">
                当前为 AgentDef 只读对话模式，会围绕比赛状态、评委追问和证据缺口给出下一步建议，不会直接改写项目数据。
              </template>
              <template v-else>
                当前为只读对话模式，只提供解释、澄清与下一步建议，不会写入项目。
              </template>
            </div>

            <div v-if="aiMode === 'contextual_agent'" class="text-[11px] text-sky-700 leading-5 p-3 border border-sky-200 rounded bg-sky-50">
              <template v-if="props.workbenchMode === 'project' && props.projectContextualAssistantKey === 'agent_proto'">
                当前为 AgentProto，可以先聊想法，也可以用上方动作生成待确认草案；应用前会再次确认。
              </template>
              <template v-else-if="props.workbenchMode === 'project' && props.projectContextualAssistantKey === 'design_assistant'">
                当前为设计助手，可以先聊结构、层级和交互；需要落地时再生成待确认结构源草案。
              </template>
              <template v-else>
                当前为上下文助手，可以先自由补充上下文；明确执行动作时再生成待确认草案。
              </template>
            </div>

            <div v-if="aiMode === 'auto_optimize'" class="space-y-2">
              <div class="text-[11px] text-amber-700 leading-5 p-3 border border-amber-200 rounded bg-amber-50">
                当前模式只生成待审批提案，不会自动执行项目修改。
              </div>
              <div class="flex items-center justify-between">
                <div class="text-xs text-slate-700 font-semibold">
                  待审批变更（{{ pendingChangeRequests.length }}）
                </div>
                <span v-if="changeRequestsLoading" class="text-[10px] text-slate-500">刷新中...</span>
              </div>
              <div v-if="pendingChangeRequests.length === 0" class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed">
                暂无待审批提案。发送请求后，AI 只会生成可审批提案，不会自动执行。
              </div>
              <div
                v-for="change in pendingChangeRequests"
                :key="change.id"
                class="p-3 border border-slate-200 rounded bg-slate-50"
              >
                <div class="flex gap-2 items-start justify-between">
                  <div class="text-xs text-slate-800 leading-5 font-semibold">
                    {{ change.title }}
                  </div>
                  <span
                    v-if="change.destructive"
                    class="text-[10px] text-rose-600 px-1.5 py-0.5 border border-rose-200 rounded bg-rose-50"
                  >
                    破坏性
                  </span>
                </div>
                <div class="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap">
                  {{ change.summary }}
                </div>
                <div class="text-[10px] text-slate-500 mt-1">
                  类型：{{ change.changeType }}
                </div>
                <div class="mt-2 flex gap-2 items-center">
                  <button
                    class="text-[11px] text-emerald-700 px-2 py-1 border border-emerald-300 rounded bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60"
                    :disabled="isChangeActing(change.id)"
                    @click="emit('approveChange', change)"
                  >
                    {{ isChangeActing(change.id)
                      ? '处理中...'
                      : (requiresSecondConfirm(change) ? '再次确认通过' : '通过') }}
                  </button>
                  <button
                    class="text-[11px] text-slate-700 px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-60"
                    :disabled="isChangeActing(change.id)"
                    @click="emit('rejectChange', change)"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            </div>

            <div v-if="aiMode === 'issue_discovery'" class="space-y-2">
              <div class="text-[11px] text-amber-700 leading-5 p-3 border border-amber-200 rounded bg-amber-50">
                当前模式固定从评分映射、证据链、量化指标、资料完整度四个维度扫描问题。
              </div>
              <div class="flex items-center justify-between">
                <div class="text-xs text-slate-700 font-semibold">
                  寻疑结果
                </div>
                <span v-if="issueLoading" class="text-[10px] text-slate-500">刷新中...</span>
              </div>

              <div v-if="issueReport" class="p-3 border border-amber-200 rounded bg-amber-50">
                <div class="text-xs text-amber-800 font-semibold">
                  {{ issueReport.title }}
                </div>
                <div class="text-[11px] text-amber-700 mt-1 whitespace-pre-wrap">
                  {{ issueReport.summary }}
                </div>
                <div class="workspace-issue-report-meta">
                  <span class="workspace-issue-report-status">
                    {{ issueReportStatusLabel }}
                  </span>
                  <span v-if="issueReport.reviewSubmittedAt">
                    提交时间：{{ issueReport.reviewSubmittedAt }}
                  </span>
                  <span v-if="issueReport.reviewSubmittedByUserId">
                    提交人：{{ issueReport.reviewSubmittedByUsername || issueReport.reviewSubmittedByUserId }}
                  </span>
                </div>
                <div class="workspace-issue-report-actions">
                  <button
                    class="workspace-issue-report-btn workspace-issue-report-btn--primary"
                    type="button"
                    :disabled="issueReportSubmitting || issueReport.reviewSubmissionStatus === 'submitted'"
                    @click="requestSubmitIssueReport"
                  >
                    {{ issueReportSubmitting
                      ? '提交中...'
                      : (issueReport.reviewSubmissionStatus === 'submitted' ? '已提交评审' : '提交评审') }}
                  </button>
                  <button
                    class="workspace-issue-report-btn workspace-issue-report-btn--ghost"
                    type="button"
                    :disabled="issueReportExporting"
                    @click="requestExportIssueReport"
                  >
                    {{ issueReportExporting ? '导出中...' : '导出 Markdown' }}
                  </button>
                </div>
              </div>

              <div
                v-for="issue in projectIssues.slice(0, 8)"
                :key="issue.id"
                class="p-3 border border-slate-200 rounded bg-white"
              >
                <div class="flex gap-2 items-center justify-between">
                  <div class="text-[11px] text-slate-800 leading-5 font-semibold">
                    {{ issue.title }}
                  </div>
                  <span :class="severityClass(issue.severity)">
                    {{ severityLabel(issue.severity) }}
                  </span>
                </div>
                <div class="text-[11px] text-slate-600 mt-1">
                  证据：{{ issue.evidence || '暂无' }}
                </div>
                <div class="text-[11px] text-emerald-700 mt-1">
                  建议：{{ issue.recommendation || '暂无' }}
                </div>
              </div>

              <div v-if="projectIssues.length === 0" class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed">
                暂无 issue 条目。执行一次“寻疑发现”后会生成结构化报告，并仅记录高置信问题。
              </div>
            </div>

            <div v-if="aiMode === 'defense'" class="space-y-2">
              <div class="p-3 border border-slate-200 rounded bg-slate-50">
                <div class="flex gap-2 items-center justify-between">
                  <div>
                    <div class="text-xs text-slate-700 font-semibold">
                      AgentDef 状态
                    </div>
                    <p class="text-[11px] text-slate-500 mt-1">
                      阶段：{{ defenseStageLabel(defenseStage) }} · 已完成 {{ defenseTurnCount }} 轮
                    </p>
                    <p class="text-[11px] text-slate-500 mt-1">
                      {{ defenseSessionTimingText }}
                    </p>
                  </div>
                  <div class="flex gap-2 items-center">
                    <button
                      class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100 disabled:opacity-60"
                      :disabled="defenseSummaryLoading || !props.aiEnabled"
                      @click="emit('generateDefenseSummary')"
                    >
                      {{ defenseSummaryLoading ? '生成中...' : '生成总结' }}
                    </button>
                    <button
                      class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100 disabled:opacity-60"
                      :disabled="!props.aiEnabled"
                      @click="emit('startDefenseRealtime')"
                    >
                      实时答辩
                    </button>
                  </div>
                </div>
              </div>

              <div class="p-3 border border-slate-200 rounded bg-white space-y-3">
                <div class="flex gap-2 items-center justify-between">
                  <div class="text-xs text-slate-700 font-semibold">
                    Provider 诊断
                  </div>
                  <div class="flex gap-2 items-center">
                    <button
                      class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100 disabled:opacity-60"
                      type="button"
                      :disabled="!defenseRealtimeCanInterrupt"
                      @click="emit('interruptDefenseRealtime')"
                    >
                      中断
                    </button>
                    <button
                      class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100 disabled:opacity-60"
                      type="button"
                      :disabled="props.defenseRealtimeState?.bootstrapState === 'bootstrapping'"
                      @click="emit('reconnectDefenseRealtime')"
                    >
                      重连
                    </button>
                  </div>
                </div>

                <div class="gap-2 grid grid-cols-2">
                  <label class="space-y-1">
                    <span class="text-[11px] text-slate-500">Provider</span>
                    <select
                      class="text-[11px] text-slate-700 px-2 border border-slate-200 rounded bg-white h-8 w-full"
                      :value="props.defenseRealtimeState?.provider || 'qwen'"
                      :disabled="defenseRealtimeSessionLocked"
                      @change="handleDefenseRealtimeProviderChange"
                    >
                      <option value="qwen">
                        千问
                      </option>
                      <option value="coze">
                        Coze
                      </option>
                    </select>
                  </label>
                  <label class="space-y-1">
                    <span class="text-[11px] text-slate-500">媒体模式</span>
                    <select
                      class="text-[11px] text-slate-700 px-2 border border-slate-200 rounded bg-white h-8 w-full"
                      :value="props.defenseRealtimeState?.mediaMode || 'audio_video'"
                      :disabled="defenseRealtimeSessionLocked"
                      @change="handleDefenseRealtimeMediaModeChange"
                    >
                      <option value="audio_video">
                        音视频理解
                      </option>
                      <option value="audio">
                        仅音频
                      </option>
                    </select>
                  </label>
                </div>

                <div class="flex gap-2">
                  <button
                    class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100 disabled:opacity-60"
                    type="button"
                    @click="emit('toggleDefenseRealtimeAudio', !(props.defenseRealtimeState?.audioEnabled !== false))"
                  >
                    麦克风 {{ props.defenseRealtimeState?.audioEnabled !== false ? '开' : '关' }}
                  </button>
                  <button
                    class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100 disabled:opacity-60"
                    type="button"
                    :disabled="defenseRealtimeVideoToggleDisabled"
                    @click="emit('toggleDefenseRealtimeVideo', !(props.defenseRealtimeState?.videoEnabled === true))"
                  >
                    摄像头 {{ props.defenseRealtimeState?.videoEnabled === true ? '开' : '关' }}
                  </button>
                </div>

                <div class="gap-2 grid grid-cols-2">
                  <div
                    v-for="item in defenseRealtimeRows"
                    :key="item.label"
                    class="p-2 border border-slate-200 rounded bg-slate-50"
                  >
                    <div class="text-[10px] text-slate-400 tracking-[0.12em] uppercase">
                      {{ item.label }}
                    </div>
                    <div class="text-[11px] text-slate-700 mt-1">
                      {{ item.value }}
                    </div>
                  </div>
                </div>

                <div v-if="props.defenseRealtimeState?.lastError" class="text-[11px] text-amber-700 p-2 border border-amber-200 rounded bg-amber-50">
                  token / room / 设备链路异常：{{ props.defenseRealtimeState.lastError }}
                </div>

                <div class="space-y-1">
                  <div class="text-[11px] text-slate-500">
                    Provider 日志
                  </div>
                  <div v-if="props.defenseRealtimeLogs.length === 0" class="text-[11px] text-slate-500 p-2 border border-slate-200 rounded border-dashed">
                    还没有 provider 日志，等待 bootstrap、连接或首句发言。
                  </div>
                  <div v-else class="space-y-1">
                    <div
                      v-for="item in props.defenseRealtimeLogs.slice(-4)"
                      :key="item.id"
                      class="text-[11px] text-slate-600 p-2 border border-slate-200 rounded bg-slate-50"
                    >
                      {{ item.message }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="p-3 border border-slate-200 rounded bg-white space-y-2">
                <div class="flex gap-2 items-center justify-between">
                  <div class="text-xs text-slate-700 font-semibold">
                    评委人设
                  </div>
                  <div class="flex gap-2 items-center">
                    <button
                      class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100"
                      @click="emit('importDefensePersonas')"
                    >
                      导入比赛预设
                    </button>
                    <button
                      class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100"
                      @click="openCreateDefensePersonaForm"
                    >
                      新建
                    </button>
                  </div>
                </div>

                <div v-if="defensePersonasLoading" class="text-[11px] text-slate-500">
                  人设加载中...
                </div>
                <div v-else-if="defensePersonas.length === 0" class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed">
                  当前项目还没有答辩人设。可先导入比赛预设，再按项目需要调整。
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="persona in defensePersonas"
                    :key="persona.id"
                    class="p-3 border border-slate-200 rounded bg-slate-50/60"
                  >
                    <div class="flex gap-2 items-start justify-between">
                      <div>
                        <div class="text-[11px] text-slate-800 font-semibold">
                          {{ persona.name }}
                        </div>
                        <div class="text-[10px] text-slate-500 mt-1">
                          {{ persona.judgeType }} · {{ persona.enabled ? '已启用' : '已停用' }}
                        </div>
                      </div>
                      <div class="flex gap-1 items-center">
                        <button
                          class="text-[10px] px-2 border border-slate-300 rounded bg-white h-6 hover:bg-slate-100"
                          @click="quickToggleDefensePersona(persona)"
                        >
                          {{ persona.enabled ? '停用' : '启用' }}
                        </button>
                        <button
                          class="text-[10px] px-2 border border-slate-300 rounded bg-white h-6 hover:bg-slate-100"
                          @click="openEditDefensePersonaForm(persona)"
                        >
                          编辑
                        </button>
                        <button
                          class="text-[10px] text-rose-600 px-2 border border-rose-200 rounded bg-white h-6 hover:bg-rose-50"
                          @click="emit('deleteDefensePersona', persona.id)"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <p v-if="persona.summary" class="text-[11px] text-slate-600 mt-2">
                      {{ persona.summary }}
                    </p>
                    <p v-if="persona.focusAreas.length > 0" class="text-[10px] text-slate-500 mt-1">
                      关注点：{{ persona.focusAreas.join('、') }}
                    </p>
                  </div>
                </div>

                <div v-if="defensePersonaFormVisible" class="p-3 border border-blue-200 rounded bg-blue-50/60 space-y-2">
                  <div class="flex gap-2 items-center justify-between">
                    <div class="text-[11px] text-slate-800 font-semibold">
                      {{ defensePersonaEditingId ? '编辑人设' : '新建人设' }}
                    </div>
                    <button
                      class="text-[10px] px-2 border border-slate-300 rounded bg-white h-6 hover:bg-slate-100"
                      @click="defensePersonaFormVisible = false"
                    >
                      取消
                    </button>
                  </div>
                  <select v-model="defensePersonaForm.judgeType" class="text-[11px] px-2 py-1.5 border border-slate-200 rounded bg-white w-full">
                    <option value="technical">
                      technical
                    </option>
                    <option value="business">
                      business
                    </option>
                    <option value="expression">
                      expression
                    </option>
                    <option value="custom">
                      custom
                    </option>
                  </select>
                  <input v-model="defensePersonaForm.name" class="text-[11px] px-2 py-1.5 border border-slate-200 rounded bg-white w-full" placeholder="人设名称">
                  <textarea v-model="defensePersonaForm.summary" class="text-[11px] px-2 py-1.5 border border-slate-200 rounded bg-white h-16 w-full resize-none" placeholder="一句话说明评委关注点" />
                  <textarea v-model="defensePersonaForm.systemPrompt" class="text-[11px] px-2 py-1.5 border border-slate-200 rounded bg-white h-28 w-full resize-none" placeholder="系统提示词" />
                  <textarea v-model="defensePersonaForm.focusAreasText" class="text-[11px] px-2 py-1.5 border border-slate-200 rounded bg-white h-16 w-full resize-none" placeholder="关注点，每行一个" />
                  <label class="text-[11px] text-slate-600 flex gap-2 items-center">
                    <input v-model="defensePersonaForm.enabled" type="checkbox">
                    新建后立即启用
                  </label>
                  <button
                    class="text-[11px] text-white font-semibold px-3 border border-blue-500 rounded bg-blue-600 h-8 hover:bg-blue-500 disabled:opacity-60"
                    :disabled="!defensePersonaForm.name.trim() || !defensePersonaForm.systemPrompt.trim()"
                    @click="submitDefensePersonaForm"
                  >
                    保存人设
                  </button>
                </div>
              </div>

              <div v-if="defenseScorecard" class="p-3 border border-slate-200 rounded bg-slate-50">
                <div class="text-xs text-slate-700 font-semibold">
                  答辩评分
                </div>
                <p class="text-[11px] text-slate-600 mt-1">
                  技术 {{ defenseScorecard.technical }} / 业务 {{ defenseScorecard.business }} / 表达 {{ defenseScorecard.expression }} / 总分 {{ defenseScorecard.total }}
                </p>
                <p class="text-[11px] text-slate-500 mt-1">
                  {{ defenseScorecard.summary }}
                </p>
                <p v-if="defenseScorecard.materialGaps.length > 0" class="text-[11px] text-amber-700 mt-1">
                  材料缺口：{{ defenseScorecard.materialGaps.join('、') }}
                </p>
                <p v-if="defenseScorecard.actionItems.length > 0" class="text-[11px] text-emerald-700 mt-1">
                  改进动作：{{ defenseScorecard.actionItems.join('、') }}
                </p>
              </div>

              <div v-if="defenseSummary" class="p-3 border border-slate-200 rounded bg-white">
                <div class="text-xs text-slate-700 font-semibold">
                  会话总结
                </div>
                <p class="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap">
                  {{ defenseSummary.summary }}
                </p>
                <p v-if="defenseSummary.actionItems.length > 0" class="text-[11px] text-emerald-700 mt-2">
                  动作：{{ defenseSummary.actionItems.join('；') }}
                </p>
                <p v-if="defenseSummary.evidenceGaps.length > 0" class="text-[11px] text-amber-700 mt-1">
                  证据缺口：{{ defenseSummary.evidenceGaps.join('；') }}
                </p>
              </div>
              <div
                v-for="(round, index) in defenseRounds"
                :key="`${round.judge}-${index}`"
                class="p-3 border border-slate-200 rounded bg-white"
              >
                <p class="text-xs text-slate-700 font-semibold">
                  {{ round.judge }} 评委（{{ round.score }}）
                </p>
                <p class="text-[11px] text-slate-700 mt-1">
                  问题：{{ round.question }}
                </p>
                <p class="text-[11px] text-slate-500 mt-1">
                  追问：{{ round.followUp }}
                </p>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="workspace-chat-composer">
        <template v-if="showCommentsView">
          <div
            v-if="props.commentDraftAnchor"
            class="space-y-3"
          >
            <div class="text-[11px] text-slate-600">
              新线程将锚定到：{{ summarizeCommentAnchor(props.commentDraftAnchor) }}
            </div>
            <textarea
              v-model="commentDraftText"
              class="text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-50 h-24 w-full resize-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              placeholder="输入评论内容"
            />
            <div class="flex gap-2 items-center justify-between">
              <button
                class="text-[11px] font-semibold px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100"
                type="button"
                @click="emit('cancelCommentDraft')"
              >
                取消
              </button>
              <button
                class="text-[11px] text-white font-semibold px-3 py-1.5 border border-blue-600 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                :disabled="props.commentMutating || !commentDraftText.trim()"
                type="button"
                @click="submitCommentDraft"
              >
                {{ props.commentMutating ? '创建中...' : '创建评论' }}
              </button>
            </div>
          </div>

          <div
            v-else-if="activeCommentThread"
            class="space-y-3"
          >
            <div class="flex gap-2 items-center justify-between">
              <div class="text-[11px] text-slate-600 min-w-0">
                回复线程：{{ activeCommentThread.summaryText || summarizeCommentAnchor(activeCommentThread.anchor) }}
              </div>
              <button
                class="text-[11px] text-slate-700 font-semibold px-2.5 py-1 border border-slate-300 rounded bg-white shrink-0 hover:bg-slate-100"
                type="button"
                @click="selectCommentThread(activeCommentThread.id)"
              >
                定位正文
              </button>
            </div>
            <textarea
              v-model="commentReplyDraftMap[activeCommentThread.id]"
              class="text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-50 h-24 w-full resize-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              placeholder="输入回复内容"
            />
            <button
              class="text-[11px] text-white font-semibold px-3 py-1.5 border border-blue-600 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
              :disabled="props.commentMutating || !String(commentReplyDraftMap[activeCommentThread.id] || '').trim()"
              type="button"
              @click="submitCommentReply(activeCommentThread.id)"
            >
              {{ props.commentMutating ? '发送中...' : '发送回复' }}
            </button>
          </div>

          <div v-else class="text-[11px] text-slate-500">
            选择一个线程查看详情，或先在正文里发起新评论。
          </div>
        </template>

        <template v-else>
          <div
            class="workspace-chat-composer__input-shell"
            :class="{ 'workspace-chat-composer__input-shell--running': chatLoading }"
          >
            <textarea
              :value="chatInput"
              class="workspace-chat-composer__textarea"
              :placeholder="inputPlaceholder"
              :disabled="!props.aiEnabled"
              @input="emit('update:chatInput', ($event.target as HTMLTextAreaElement).value)"
              @keydown="handleChatComposerKeydown"
            />
            <div class="workspace-chat-composer__footer">
              <div class="workspace-chat-composer__toolbar">
                <label
                  class="workspace-chat-composer__mode-pill"
                >
                  <span class="workspace-chat-composer__mode-icon material-symbols-outlined" aria-hidden="true">
                    auto_awesome
                  </span>
                  <select
                    data-testid="workspace-right-sidebar-mode-select"
                    class="workspace-mode-select workspace-mode-select--embedded"
                    :value="modeSelectValue()"
                    @change="handleModeSelectChange"
                  >
                    <option
                      v-for="mode in props.workbenchMode === 'project' ? projectAssistantOptions : DEFENSE_MODES"
                      :key="mode.value"
                      :value="mode.value"
                    >
                      {{ mode.label }}
                    </option>
                  </select>
                  <span class="workspace-chat-composer__mode-chevron material-symbols-outlined" aria-hidden="true">
                    expand_more
                  </span>
                </label>
              </div>
              <button
                class="workspace-chat-composer__send"
                :class="{ 'workspace-chat-composer__send--running': chatLoading }"
                :disabled="props.chatInterrupting || (!props.aiEnabled && !chatLoading)"
                :aria-label="chatLoading ? (props.workbenchMode === 'defense' ? '打断 AgentDef' : '打断生成') : (props.workbenchMode === 'defense' ? '发送给 AgentDef' : '发送消息')"
                :title="chatLoading ? (props.workbenchMode === 'defense' ? '打断 AgentDef' : '打断生成') : (props.workbenchMode === 'defense' ? '发送给 AgentDef' : '发送消息')"
                @click="chatLoading ? emit('interruptChat') : emit('sendChat')"
              >
                <span class="workspace-chat-composer__send-spark" aria-hidden="true" />
                <span class="workspace-chat-composer__send-icon material-symbols-outlined">
                  {{ chatLoading ? 'stop' : 'send' }}
                </span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.workspace-right-sidebar {
  --workspace-right-font-2xs: var(--wl-ws-font-2xs, 10px);
  --workspace-right-font-xs: var(--wl-ws-font-xs, 11px);
  --workspace-right-font-sm: var(--wl-ws-font-sm, 12px);
  --workspace-right-font-md: var(--wl-ws-font-md, 13px);
  --workspace-right-space-1: var(--wl-ws-space-1, 4px);
  --workspace-right-space-1_5: var(--wl-ws-space-1_5, 6px);
  --workspace-right-space-2: var(--wl-ws-space-2, 8px);
  --workspace-right-space-2_5: var(--wl-ws-space-2_5, 10px);
  --workspace-right-space-3: var(--wl-ws-space-3, 12px);
  --workspace-right-space-3_5: var(--wl-ws-space-3_5, 14px);
  --workspace-right-space-4: var(--wl-ws-space-4, 16px);
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.workspace-chat-scroll-content {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-right-space-3);
  min-height: 100%;
}

.workspace-right-sidebar__switch-pill {
  display: inline-flex;
  min-width: 0;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: var(--workspace-right-space-1_5);
  height: 30px;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: var(--workspace-right-font-xs);
  font-weight: 600;
}

.workspace-right-sidebar__switch-pill--active {
  background: #eff6ff;
  color: #1d4ed8;
}

.workspace-right-sidebar__context-chip {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 26px;
  padding: 0 var(--workspace-right-space-2_5);
  border: 1px solid #dce5f1;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #516277;
  font-size: var(--workspace-right-font-2xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.workspace-right-sidebar__header--compact {
  padding: 0;
}

.workspace-right-sidebar__header--compact > :not([hidden]) ~ :not([hidden]) {
  margin-top: 0 !important;
}

.workspace-right-sidebar__header--flush {
  padding: 0;
  background: #fff;
}

.workspace-right-sidebar__header--flush > :not([hidden]) ~ :not([hidden]) {
  margin-top: 0 !important;
}

.workspace-right-sidebar__session-strip {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: var(--workspace-right-session-strip-height, 40px);
  background: #fff;
}

.workspace-right-sidebar__session-tabs {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: stretch;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.workspace-right-sidebar__session-tabs::-webkit-scrollbar {
  display: none;
}

.workspace-right-sidebar__session-empty {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 var(--workspace-right-session-empty-padding-x, var(--workspace-right-space-3));
  border-right: 1px solid #e2e8f0;
  background: #fff;
  color: #94a3b8;
  font-size: var(--workspace-right-session-tab-label-size, var(--workspace-right-font-xs));
  font-weight: 700;
  white-space: nowrap;
}

.workspace-right-sidebar__session-trigger {
  display: flex;
  flex: 0 0 auto;
  min-width: max-content;
  height: 100%;
  border-right: 1px solid #e2e8f0;
}

.workspace-right-sidebar__session-tab {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--workspace-right-session-tab-gap, var(--workspace-right-space-1_5));
  min-width: var(--workspace-right-session-tab-min-width, 132px);
  height: 100%;
  padding: 0 var(--workspace-right-session-tab-padding-x, var(--workspace-right-space-3_5));
  border: none;
  border-radius: 0;
  background: #fff;
  color: #475569;
  white-space: nowrap;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.workspace-right-sidebar__session-tab:hover {
  background: #f8fafc;
}

.workspace-right-sidebar__session-tab--active {
  background: #f8fafc;
  color: #1d4ed8;
}

.workspace-right-sidebar__session-tab--fresh {
  animation: workspace-right-sidebar-session-fresh 1.35s ease-out;
}

.workspace-right-sidebar__session-tab::after {
  content: '';
  position: absolute;
  right: var(--workspace-right-session-active-indicator-inset, var(--workspace-right-space-3));
  bottom: 0;
  left: var(--workspace-right-session-active-indicator-inset, var(--workspace-right-space-3));
  height: 2px;
  background: #3b82f6;
  opacity: 0;
  transform: scaleX(0.55);
  transform-origin: center;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.workspace-right-sidebar__session-tab--active::after {
  opacity: 1;
  transform: scaleX(1);
}

.workspace-right-sidebar__session-tab-icon {
  font-size: var(--workspace-right-session-tab-icon-size, 16px);
  color: inherit;
}

.workspace-right-sidebar__session-tab-label {
  font-size: var(--workspace-right-session-tab-label-size, var(--workspace-right-font-xs));
  font-weight: 600;
  line-height: 1;
}

.workspace-right-sidebar__session-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  height: 100%;
}

.workspace-right-sidebar__session-refreshing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 var(--workspace-right-session-refresh-padding-x, 12px);
  border-left: 1px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  font-size: var(--workspace-right-session-tab-label-size, var(--workspace-right-font-xs));
  font-weight: 700;
  white-space: nowrap;
}

.workspace-right-sidebar__session-refreshing-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #3b82f6;
  animation: workspace-right-sidebar-refresh-pulse 1s ease-in-out infinite;
}

.workspace-right-sidebar__session-history-trigger {
  display: flex;
  height: 100%;
}

.workspace-right-sidebar__session-action {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--workspace-right-session-action-size, 40px);
  height: 100%;
  padding: 0;
  border: none;
  border-left: 1px solid #e2e8f0;
  border-radius: 0;
  background: #fff;
  color: #64748b;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.workspace-right-sidebar__session-action:hover {
  background: #f8fafc;
}

.workspace-right-sidebar__session-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.workspace-right-sidebar__session-action:disabled:hover {
  background: #fff;
}

.workspace-right-sidebar__session-history-button:hover {
  color: #0f172a;
}

.workspace-right-sidebar__session-action-icon,
.workspace-right-sidebar__session-create-icon {
  font-size: var(--workspace-right-session-action-icon-size, 16px);
}

.workspace-right-sidebar__session-create {
  color: #1d4ed8;
}

.workspace-right-sidebar__session-create:hover {
  color: #1d4ed8;
}

.workspace-right-sidebar__session-history-popover {
  width: 300px;
  border: 1px solid #e2e8f0;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.99);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}

.workspace-right-sidebar__session-history-heading {
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  color: #0f172a;
  font-size: var(--workspace-right-font-xs);
  font-weight: 700;
  line-height: 1.4;
}

.workspace-right-sidebar__session-history-empty {
  padding: 14px 12px;
  color: #94a3b8;
  font-size: var(--workspace-right-font-xs);
  line-height: 1.5;
}

@keyframes workspace-right-sidebar-refresh-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.92);
  }

  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes workspace-right-sidebar-session-fresh {
  0% {
    background: rgba(59, 130, 246, 0.16);
  }

  100% {
    background: #fff;
  }
}

.workspace-right-sidebar__session-history-list {
  max-height: 320px;
  overflow-y: auto;
}

.workspace-right-sidebar__session-history-row {
  display: flex;
  align-items: stretch;
  min-width: 0;
  border-top: 1px solid #f1f5f9;
}

.workspace-right-sidebar__session-history-row:first-child {
  border-top: none;
}

.workspace-right-sidebar__session-history-row--active {
  background: #f8fafc;
}

.workspace-right-sidebar__session-history-entry {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #0f172a;
  text-align: left;
  transition: background-color 0.18s ease;
}

.workspace-right-sidebar__session-history-entry:hover {
  background: #f8fafc;
}

.workspace-right-sidebar__session-history-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  font-size: 16px;
  color: #64748b;
}

.workspace-right-sidebar__session-history-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 3px;
}

.workspace-right-sidebar__session-history-title {
  overflow: hidden;
  color: #0f172a;
  font-size: var(--workspace-right-font-xs);
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-right-sidebar__session-history-meta {
  overflow: hidden;
  color: #64748b;
  font-size: var(--workspace-right-font-2xs);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-right-sidebar__session-history-delete {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  padding: 0;
  border: none;
  border-left: 1px solid #f1f5f9;
  border-radius: 0;
  background: transparent;
  color: #94a3b8;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.workspace-right-sidebar__session-history-delete:hover:not(:disabled) {
  background: #fff1f2;
  color: #dc2626;
}

.workspace-right-sidebar__session-history-delete:disabled {
  cursor: wait;
  opacity: 0.72;
}

.workspace-right-sidebar__session-history-delete-icon {
  font-size: 16px;
}

.workspace-chat-messages {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-right-space-2_5);
}

.workspace-chat-entry {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-right-space-2);
  min-width: 0;
}

.workspace-chat-entry--user {
  align-items: flex-end;
}

.workspace-chat-entry--entering.workspace-chat-entry--assistant {
  animation: workspace-chat-assistant-enter 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.workspace-chat-entry--entering.workspace-chat-entry--user {
  animation: workspace-chat-user-enter 0.18s cubic-bezier(0.2, 0.9, 0.2, 1) both;
}

.workspace-chat-system-message {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-right-space-1_5);
  min-width: 0;
  color: #64748b;
  font-size: var(--workspace-right-font-xs);
}

.workspace-chat-system-message__summary {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--workspace-right-space-2);
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  overflow: hidden;
  text-align: left;
}

.workspace-chat-system-message__summary::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(191, 219, 254, 0) 34%,
    rgba(191, 219, 254, 0.36) 50%,
    rgba(191, 219, 254, 0) 66%,
    rgba(255, 255, 255, 0) 100%
  );
  opacity: 0;
  pointer-events: none;
  transform: translateX(-130%);
}

.workspace-chat-system-message__summary:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.22);
  outline-offset: 3px;
  border-radius: 8px;
}

.workspace-chat-system-message--live .workspace-chat-system-message__summary::before {
  opacity: 1;
  animation: workspace-chat-system-message-shimmer 1.9s ease-in-out infinite;
}

.workspace-chat-system-message--live .workspace-chat-system-message__text {
  color: #334155;
}

.workspace-chat-system-message__icon {
  flex: 0 0 auto;
  color: #10b981;
  font-size: 15px;
}

.workspace-chat-system-message--live .workspace-chat-system-message__icon {
  color: #2563eb;
  animation: workspace-chat-system-message-spin 1s linear infinite;
}

.workspace-chat-system-message__text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: #475569;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.workspace-chat-system-message__chevron {
  flex: 0 0 auto;
  color: #94a3b8;
  font-size: 16px;
  transition: transform 0.18s ease;
}

.workspace-chat-system-message--expanded .workspace-chat-system-message__chevron {
  transform: rotate(90deg);
}

@keyframes workspace-chat-system-message-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes workspace-chat-system-message-shimmer {
  0% {
    opacity: 0;
    transform: translateX(-130%);
  }

  18% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateX(130%);
  }
}

.workspace-chat-system-message__detail {
  margin-left: calc(15px + var(--workspace-right-space-2));
  padding-left: var(--workspace-right-space-2_5);
  border-left: 2px solid #dbeafe;
  display: flex;
  flex-direction: column;
  gap: var(--workspace-right-space-1_5);
}

.workspace-chat-system-message__detail-title {
  color: #334155;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.workspace-chat-system-message__detail-payload {
  margin: 0;
  padding: var(--workspace-right-space-2) var(--workspace-right-space-2_5);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  color: #334155;
  font-size: var(--workspace-right-font-2xs);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.workspace-chat-message {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-right-space-2);
  min-width: 0;
  width: 100%;
}

.workspace-chat-message--assistant {
  align-items: flex-start;
}

.workspace-chat-message--user {
  align-items: flex-end;
}

.workspace-chat-message__assistant-head {
  display: flex;
  align-items: center;
  gap: var(--workspace-right-space-2);
  width: 100%;
}

.workspace-chat-message__user-head {
  display: flex;
  align-items: center;
  gap: var(--workspace-right-space-2);
  justify-content: flex-end;
  width: 100%;
}

.workspace-chat-message__assistant-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
}

.workspace-chat-message__meta {
  display: flex;
  min-width: 0;
  align-items: center;
}

.workspace-chat-message__meta--user {
  justify-content: flex-end;
}

.workspace-chat-message__title {
  min-width: 0;
  color: #64748b;
  font-size: var(--workspace-right-font-xs);
  font-weight: 600;
  line-height: 1.4;
}

.workspace-chat-message__content {
  min-width: 0;
  font-size: var(--workspace-right-font-xs);
  line-height: 1.7;
  word-break: break-word;
}

.workspace-chat-message__content--assistant {
  position: relative;
  width: 100%;
  padding: 0;
  color: #334155;
}

.workspace-chat-message__content--user {
  position: relative;
  max-width: 86%;
  padding: var(--workspace-right-space-2) var(--workspace-right-space-2_5);
  border: 1px solid #dbeafe;
  border-radius: 12px 12px 0 12px;
  background: #eff6ff;
  color: #1e3a8a;
  overflow: hidden;
  white-space: pre-wrap;
}

.workspace-chat-entry--recent-user .workspace-chat-message__content--user {
  animation: workspace-chat-user-highlight 0.68s ease-out both;
}

.workspace-chat-message__content--assistant::before {
  content: '';
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: calc(-1 * var(--workspace-right-space-2));
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    rgba(96, 165, 250, 0.95) 0%,
    rgba(56, 189, 248, 0.85) 52%,
    rgba(147, 197, 253, 0.55) 100%
  );
  opacity: 0;
  transform: scaleY(0.55);
  transform-origin: center;
}

.workspace-chat-entry--streaming-assistant .workspace-chat-message__content--assistant::before {
  opacity: 1;
  animation: workspace-chat-assistant-stream 1.5s ease-in-out infinite;
}

@keyframes workspace-chat-user-enter {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes workspace-chat-assistant-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes workspace-chat-user-highlight {
  0% {
    background: #dbeafe;
    box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.24);
  }

  55% {
    background: #eff6ff;
    box-shadow: 0 0 0 10px rgba(96, 165, 250, 0);
  }

  100% {
    background: #eff6ff;
    box-shadow: 0 0 0 0 rgba(96, 165, 250, 0);
  }
}

@keyframes workspace-chat-assistant-stream {
  0% {
    opacity: 0.35;
    transform: scaleY(0.55);
    filter: saturate(0.92);
  }

  50% {
    opacity: 1;
    transform: scaleY(1);
    filter: saturate(1.08);
  }

  100% {
    opacity: 0.42;
    transform: scaleY(0.62);
    filter: saturate(0.96);
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-chat-entry--entering.workspace-chat-entry--assistant,
  .workspace-chat-entry--entering.workspace-chat-entry--user,
  .workspace-chat-entry--recent-user .workspace-chat-message__content--user,
  .workspace-chat-entry--streaming-assistant .workspace-chat-message__content--assistant::before,
  .workspace-chat-system-message--live .workspace-chat-system-message__icon,
  .workspace-chat-system-message--live .workspace-chat-system-message__summary::before {
    animation: none !important;
  }

  .workspace-chat-message__content--assistant::before,
  .workspace-chat-system-message__summary::before {
    opacity: 0 !important;
  }
}

.workspace-chat-composer {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-right-space-2_5);
  flex-shrink: 0;
  padding: 0 var(--workspace-right-space-3) var(--workspace-right-space-3_5);
  border-top: none;
  background: transparent;
}

.workspace-chat-composer__input-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: visible;
  isolation: isolate;
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.06);
}

.workspace-chat-composer__input-shell--running {
  box-shadow:
    0 18px 38px rgba(15, 23, 42, 0.08),
    0 0 18px rgba(96, 165, 250, 0.18),
    0 0 40px rgba(244, 114, 182, 0.12);
}

.workspace-chat-composer__input-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background: linear-gradient(
    110deg,
    rgba(96, 165, 250, 0.96) 0%,
    rgba(129, 140, 248, 0.92) 18%,
    rgba(244, 114, 182, 0.88) 36%,
    rgba(251, 191, 36, 0.92) 52%,
    rgba(96, 165, 250, 0.96) 68%,
    rgba(129, 140, 248, 0.92) 84%,
    rgba(244, 114, 182, 0.88) 100%
  );
  background-size: 240% 240%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.88;
  animation: workspace-composer-border-flow 7.5s linear infinite;
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
}

.workspace-chat-composer__input-shell--running::before {
  opacity: 0.98;
  animation-duration: 5.4s;
}

.workspace-chat-composer__input-shell::after {
  content: '';
  position: absolute;
  inset: -14px;
  border-radius: 38px;
  background: linear-gradient(
    110deg,
    rgba(96, 165, 250, 0.42) 0%,
    rgba(129, 140, 248, 0.38) 18%,
    rgba(244, 114, 182, 0.34) 36%,
    rgba(251, 191, 36, 0.38) 52%,
    rgba(96, 165, 250, 0.42) 68%,
    rgba(129, 140, 248, 0.38) 84%,
    rgba(244, 114, 182, 0.34) 100%
  );
  background-size: 240% 240%;
  filter: blur(22px);
  opacity: 0.34;
  pointer-events: none;
  z-index: -1;
  animation: workspace-composer-border-flow 9.5s linear infinite reverse;
}

.workspace-chat-composer__input-shell--running::after {
  inset: -18px;
  opacity: 0.5;
  filter: blur(28px);
  animation-duration: 6.6s;
}

.workspace-chat-composer__input-shell:focus-within {
  box-shadow: 0 18px 36px rgba(37, 99, 235, 0.08);
}

.workspace-chat-composer__input-shell:focus-within::after {
  opacity: 0.42;
  filter: blur(24px);
}

.workspace-chat-composer__input-shell--running:focus-within {
  box-shadow:
    0 20px 40px rgba(37, 99, 235, 0.1),
    0 0 22px rgba(96, 165, 250, 0.22),
    0 0 48px rgba(244, 114, 182, 0.14);
}

.workspace-chat-composer__input-shell--running:focus-within::after {
  opacity: 0.58;
  filter: blur(30px);
}

.workspace-chat-composer__textarea {
  width: 100%;
  min-height: 92px;
  max-height: 188px;
  resize: none;
  border: none;
  background: transparent;
  color: #0f172a;
  font-size: var(--workspace-right-font-sm);
  line-height: 1.55;
  padding: calc(var(--workspace-right-space-4) - 1px) calc(var(--workspace-right-space-4) - 1px)
    var(--workspace-right-space-1_5);
  outline: none;
  overflow-y: auto;
  position: relative;
  z-index: 1;
}

.workspace-chat-composer__textarea::placeholder {
  color: #8ea0ba;
}

.workspace-chat-composer__textarea:focus {
  box-shadow: none;
}

.workspace-chat-composer__textarea:disabled {
  cursor: not-allowed;
  color: #94a3b8;
}

.workspace-chat-composer__footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--workspace-right-space-3);
  padding: 0 var(--workspace-right-space-3) var(--workspace-right-space-3);
  position: relative;
  z-index: 1;
}

.workspace-chat-composer__toolbar {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--workspace-right-space-2);
}

.workspace-chat-composer__mode-pill {
  position: relative;
  display: inline-flex;
  min-width: 134px;
  max-width: 100%;
  height: 34px;
  align-items: center;
  border: 1px solid rgba(196, 208, 255, 0.85);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 18px rgba(99, 102, 241, 0.05);
}

.workspace-chat-composer__mode-pill--disabled {
  opacity: 0.72;
}

.workspace-chat-composer__mode-icon,
.workspace-chat-composer__mode-chevron {
  position: absolute;
  top: 50%;
  pointer-events: none;
  transform: translateY(-50%);
}

.workspace-chat-composer__mode-icon {
  left: 12px;
  color: #6d5ef1;
  font-size: 16px;
}

.workspace-chat-composer__mode-chevron {
  right: 10px;
  color: #6b7a90;
  font-size: 15px;
}

@keyframes workspace-composer-border-flow {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.workspace-mode-select {
  min-width: 118px;
  height: 24px;
  border: 1px solid #d9e1ef;
  border-radius: 6px;
  background: #f8fafc;
  color: #395077;
  font-size: var(--workspace-right-font-xs);
  padding: 0 24px 0 8px;
  outline: none;
}

.workspace-mode-select--embedded {
  width: 100%;
  height: 100%;
  min-width: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #23314f;
  font-size: var(--workspace-right-font-xs);
  font-weight: 700;
  padding: 0 28px 0 34px;
  appearance: none;
}

.workspace-chat-composer__send {
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 999px;
  background: linear-gradient(135deg, #4f46e5 0%, #2563eb 48%, #f59e0b 100%);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  box-shadow:
    0 16px 30px rgba(79, 70, 229, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.38);
  transition:
    opacity 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
}

.workspace-chat-composer__send--running {
  box-shadow:
    0 16px 30px rgba(79, 70, 229, 0.28),
    0 0 18px rgba(96, 165, 250, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.38);
}

.workspace-chat-composer__send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.workspace-chat-composer__send:not(:disabled):hover {
  border-color: rgba(255, 255, 255, 0.56);
  box-shadow: 0 18px 34px rgba(79, 70, 229, 0.28);
  filter: saturate(1.06);
}

.workspace-chat-composer__send:focus-visible {
  outline: 2px solid #cddcf7;
  outline-offset: 2px;
}

.workspace-chat-composer__send-spark {
  position: absolute;
  inset: -18%;
  background:
    radial-gradient(circle at 28% 28%, rgba(255, 217, 125, 0.96) 0%, rgba(255, 217, 125, 0) 34%),
    radial-gradient(circle at 74% 24%, rgba(129, 214, 255, 0.92) 0%, rgba(129, 214, 255, 0) 34%),
    radial-gradient(circle at 68% 76%, rgba(176, 132, 255, 0.9) 0%, rgba(176, 132, 255, 0) 32%),
    conic-gradient(
      from 0deg,
      rgba(255, 208, 91, 0.2),
      rgba(96, 165, 250, 0.48),
      rgba(129, 140, 248, 0.32),
      rgba(255, 208, 91, 0.2)
    );
  filter: blur(8px);
  opacity: 0.95;
  animation: workspace-ai-send-spark 4.8s linear infinite;
  z-index: 0;
}

.workspace-chat-composer__send-icon {
  position: relative;
  z-index: 1;
  font-size: 17px;
  line-height: 1;
  font-variation-settings:
    'FILL' 0,
    'wght' 360,
    'opsz' 20;
}

@keyframes workspace-ai-send-spark {
  from {
    transform: rotate(0deg) scale(1);
  }
  50% {
    transform: rotate(180deg) scale(1.05);
  }
  to {
    transform: rotate(360deg) scale(1);
  }
}

.workspace-mode-select:focus {
  border-color: #86aefb;
  box-shadow: 0 0 0 1px #86aefb;
}

.workspace-mode-select--embedded:focus {
  border-color: transparent;
  box-shadow: none;
}

.workspace-mode-select:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.workspace-agent-doc-card {
  width: 100%;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.workspace-agent-doc-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--workspace-right-space-3);
  padding: var(--workspace-right-space-3) var(--workspace-right-space-3) var(--workspace-right-space-2_5);
  border-bottom: 1px solid #e5edf7;
}

.workspace-agent-doc-card__header-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.workspace-agent-doc-card__eyebrow {
  color: #64748b;
  font-size: var(--workspace-right-font-2xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.workspace-agent-doc-card__title {
  margin-top: var(--workspace-right-space-1);
  color: #0f172a;
  font-size: var(--workspace-right-font-sm);
  font-weight: 700;
  line-height: 1.5;
}

.workspace-agent-doc-card__summary {
  margin-top: var(--workspace-right-space-1_5);
  color: #475569;
  font-size: var(--workspace-right-font-xs);
  line-height: 1.6;
  white-space: pre-wrap;
}

.workspace-agent-doc-card__meta {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--workspace-right-space-1_5);
}

.workspace-agent-doc-card__action,
.workspace-agent-doc-card__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: var(--workspace-right-font-2xs);
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
}

.workspace-agent-doc-card__action {
  border: 1px solid #dbeafe;
  background: #eff6ff;
  color: #1d4ed8;
}

.workspace-agent-doc-card__status {
  border: 1px solid #dbe4f0;
  background: #f8fafc;
  color: #64748b;
}

.workspace-agent-doc-card__status--pending {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.workspace-agent-doc-card__status--applied {
  border-color: #bbf7d0;
  background: #dcfce7;
  color: #166534;
}

.workspace-agent-doc-card__status--superseded,
.workspace-agent-doc-card__status--expired {
  border-color: #fde68a;
  background: #fef3c7;
  color: #92400e;
}

.workspace-agent-doc-card__status--discarded {
  border-color: #d1d5db;
  background: #f3f4f6;
  color: #4b5563;
}

.workspace-agent-doc-card__diff {
  background: #f8fafc;
}

.workspace-agent-doc-card__diff-header {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border-bottom: 1px solid #e5edf7;
}

.workspace-agent-doc-card__diff-header span {
  padding: 10px 12px;
  color: #64748b;
  font-size: var(--workspace-right-font-2xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.workspace-agent-doc-card__diff-header span:last-child {
  border-left: 1px solid #e5edf7;
}

.workspace-agent-doc-card__diff-body {
  max-height: 280px;
  overflow: auto;
}

.workspace-agent-doc-card__diff-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
}

.workspace-agent-doc-card__diff-row + .workspace-agent-doc-card__diff-row {
  border-top: 1px solid #edf2f7;
}

.workspace-agent-doc-card__diff-side {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  padding: 8px 12px;
}

.workspace-agent-doc-card__diff-side:last-child {
  border-left: 1px solid #e5edf7;
}

.workspace-agent-doc-card__diff-line-number {
  color: #94a3b8;
  font-size: var(--workspace-right-font-2xs);
  font-variant-numeric: tabular-nums;
  line-height: 1.6;
  text-align: right;
}

.workspace-agent-doc-card__diff-text {
  margin: 0;
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: var(--workspace-right-font-2xs);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.workspace-agent-doc-card__diff-row--change .workspace-agent-doc-card__diff-side {
  background: rgba(254, 240, 138, 0.16);
}

.workspace-agent-doc-card__diff-row--delete .workspace-agent-doc-card__diff-side:first-child {
  background: rgba(254, 226, 226, 0.45);
}

.workspace-agent-doc-card__diff-row--insert .workspace-agent-doc-card__diff-side:last-child {
  background: rgba(220, 252, 231, 0.52);
}

.workspace-agent-doc-card__footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px;
  border-top: 1px solid #e5edf7;
  background: #ffffff;
}

.workspace-agent-doc-card__apply {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #2563eb;
  border-radius: 10px;
  background: #2563eb;
  color: #ffffff;
  font-size: var(--workspace-right-font-xs);
  font-weight: 700;
}

.workspace-agent-doc-card__apply:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-agent-doc-card__ghost {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  color: #334155;
  font-size: var(--workspace-right-font-xs);
  font-weight: 700;
}

.workspace-agent-doc-card__ghost:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-agent-doc-card--workflow .workspace-agent-doc-card__footer {
  gap: 8px;
  justify-content: flex-end;
}

.workspace-workflow-draft-card__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid #e5edf7;
  background: #f8fafc;
}

.workspace-workflow-draft-card__meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  color: #334155;
  font-size: var(--workspace-right-font-2xs);
  line-height: 1.6;
}

.workspace-workflow-draft-card__hint {
  padding: 8px 10px;
  border: 1px solid #fde68a;
  border-radius: 10px;
  background: #fefce8;
  color: #92400e;
  font-size: var(--workspace-right-font-2xs);
  line-height: 1.6;
}

.workspace-workflow-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #e5edf7;
}

.workspace-workflow-toolbar__actions,
.workspace-workflow-toolbar__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-workflow-toolbar__action {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #ffffff;
  color: #0f172a;
  font-size: var(--workspace-right-font-xs);
  font-weight: 700;
}

.workspace-workflow-toolbar__action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-workflow-toolbar__field {
  display: flex;
  min-width: 0;
  flex: 1 1 132px;
  flex-direction: column;
  gap: 4px;
  color: #64748b;
  font-size: var(--workspace-right-font-2xs);
  font-weight: 600;
}

.workspace-workflow-toolbar__select {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font-size: var(--workspace-right-font-xs);
}

.workspace-issue-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: var(--workspace-right-font-2xs);
  line-height: 1;
  padding: 3px 7px;
}

.workspace-issue-pill--critical {
  border-color: #fecaca;
  color: #b91c1c;
  background: #fee2e2;
}

.workspace-issue-pill--high {
  border-color: #fed7aa;
  color: #b45309;
  background: #ffedd5;
}

.workspace-issue-pill--medium {
  border-color: #fde68a;
  color: #92400e;
  background: #fef3c7;
}

.workspace-issue-pill--low {
  border-color: #bbf7d0;
  color: #166534;
  background: #dcfce7;
}

.workspace-issue-report-meta {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #8a631d;
  font-size: var(--workspace-right-font-2xs);
}

.workspace-issue-report-status {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(146, 64, 14, 0.12);
  color: #92400e;
  font-weight: 700;
}

.workspace-issue-report-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.workspace-issue-report-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: var(--workspace-right-font-xs);
  font-weight: 600;
  cursor: pointer;
}

.workspace-issue-report-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.workspace-issue-report-btn--primary {
  background: #d97706;
  color: #ffffff;
}

.workspace-issue-report-btn--primary:hover:enabled {
  background: #b96504;
}

.workspace-issue-report-btn--ghost {
  border-color: #f5d8a6;
  background: #fff9ed;
  color: #9a620e;
}

.workspace-issue-report-btn--ghost:hover:enabled {
  background: #fff2d7;
}
</style>
