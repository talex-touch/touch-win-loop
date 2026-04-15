<script setup lang="ts">
import type {
  AiChatSession,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefensePersonaJudgeType,
  AiDefenseScorecard,
  AiDefenseStage,
  AiDefenseSummary,
  AiProjectChangeRequest,
  AiWorkspaceDocumentAction,
  AiWorkspaceDocumentDraft,
  AiWorkspaceDocumentSelectionRange,
  ChatMessage,
  Contest,
  ProjectIssue,
  ProjectIssueReport,
  ProjectResourceCommentAnchor,
  ProjectResourceCommentThread,
  Resource,
  Track,
  WorkspaceAiAssistantPreset,
  WorkspaceAiMode,
} from '~~/shared/types/domain'
import { buildAgentDocDraftKey } from '~~/shared/utils/agent-doc'
import UnifiedAvatar from '~/components/UnifiedAvatar.vue'

type WorkspaceDefenseSidebarAiMode = Exclude<WorkspaceAiMode, 'document_assist'>
type WorkspaceProjectAssistantMode = 'contextual' | 'dialog_ask'
type WorkspaceWorkbenchMode = 'project' | 'defense' | 'final_review'
type WorkspaceRightSidebarView = 'ai' | 'comments'
type WorkspaceSessionVisualType = WorkspaceAiMode | 'final_review' | 'topic_proposal'
type AgentDocDraftStatus = 'pending' | 'superseded' | 'expired' | 'applied'
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
  chatSessionDeletingId?: string
  chatMessages?: ChatMessage[]
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
  issueReportSubmitting?: boolean
  issueReportExporting?: boolean
  aiEnabled?: boolean
  aiDisabledReason?: string
  collapsed?: boolean
}>(), {
  chatSessions: () => [],
  openChatSessionIds: () => [],
  activeChatSessionId: '',
  chatSessionsLoading: false,
  chatSessionDeletingId: '',
  chatMessages: () => [],
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
  issueReportSubmitting: false,
  issueReportExporting: false,
  aiEnabled: true,
  aiDisabledReason: '',
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
  'submitIssueReport': [reportId: string]
  'exportIssueReport': [reportId: string]
  'selectCommentThread': [threadId: string]
  'createCommentThread': [body: string]
  'replyCommentThread': [payload: { threadId: string, body: string }]
  'resolveCommentThread': [threadId: string]
  'reopenCommentThread': [threadId: string]
  'cancelCommentDraft': []
  'applyDocumentDraft': [draft: AiWorkspaceDocumentDraft]
}>()

const DEFENSE_MODES: Array<{ value: WorkspaceDefenseSidebarAiMode, label: string }> = [
  { value: 'defense', label: '答辩模拟' },
  { value: 'dialog_ask', label: '对话询问' },
  { value: 'auto_optimize', label: '自动优化' },
  { value: 'issue_discovery', label: '寻疑发现' },
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
    label: '答辩模拟',
    prefixes: ['Loopy 答辩模拟', 'Loopy 答辩会话', '答辩模拟'],
  },
  document_assist: {
    icon: 'edit_document',
    label: 'AgentDoc',
    prefixes: ['Loopy AgentDoc', 'Loopy 文稿助手', 'Loopy 文档增强', 'AgentDoc', '文稿助手', '文档增强'],
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
  if (props.workbenchMode === 'project' && props.projectAssistantMode === 'contextual') {
    if (props.projectContextualAssistantPreset === 'design')
      return '描述当前页面结构或交互目标，例如：把评审首页拆成更清晰的页面层级，并说明关键交互。'
    if (props.projectContextualAssistantPreset === 'prototype')
      return '描述原型页面或交互路径，例如：梳理从首页到提交成功页的关键状态和跳转。'
  }
  if (props.aiMode === 'auto_optimize')
    return '描述你希望生成哪些可审批提案，例如：补齐摘要与问题陈述。'
  if (props.aiMode === 'issue_discovery')
    return '描述你希望重点扫描的维度，例如：评分映射、证据链、量化指标、资料完整度。'
  if (props.aiMode === 'defense')
    return '输入答辩要点或追问，例如：请继续追问技术可行性。'
  return '请输入问题，AI 只做只读分析，不会写入项目。'
})

const pendingChangeRequests = computed(() => {
  return props.changeRequests.filter(item => item.status === 'pending')
})

const visibleChatMessages = computed(() => {
  return props.chatMessages.filter(message => message.role !== 'system')
})

const visibleChatMessageEntries = computed(() => {
  return visibleChatMessages.value.map((message, index) => ({
    id: `${message.role}-${index}`,
    message,
    agentDocDraft: resolveAgentDocDraft(message),
  }))
})

const showChatSkeleton = computed(() => {
  return props.workspacePreparing || (props.chatSessionsLoading && visibleChatMessages.value.length === 0)
})

const showDialogAskEmpty = computed(() => {
  return !showChatSkeleton.value && props.aiMode === 'dialog_ask' && visibleChatMessages.value.length === 0
})

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
  if (title.includes('答辩'))
    return 'defense'
  if (title.includes('自动优化'))
    return 'auto_optimize'
  if (title.includes('寻疑发现'))
    return 'issue_discovery'
  if (title.includes('AgentDoc') || title.includes('文稿助手') || title.includes('文档增强'))
    return 'document_assist'
  if (session.mode === 'auto_optimize' || session.mode === 'issue_discovery' || session.mode === 'defense' || session.mode === 'document_assist')
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

function resolveAgentDocDraftStatusLabel(status: AgentDocDraftStatus): string {
  if (status === 'applied')
    return '已应用'
  if (status === 'superseded')
    return '已被更新草案替代'
  if (status === 'expired')
    return '已过期，请重新生成'
  return '待确认，确认后才会替换当前文档内容'
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
    class="border-l border-slate-200 bg-white flex flex-col h-full min-h-0 w-full overflow-hidden xl:w-88"
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
              暂无打开的会话
            </div>
            <a-trigger
              v-for="session in openChatSessions"
              :key="session.id"
              class="workspace-right-sidebar__session-trigger"
              trigger="hover"
              position="bottom"
            >
              <button
                class="workspace-right-sidebar__session-tab"
                :class="{ 'workspace-right-sidebar__session-tab--active': session.id === activeChatSessionId }"
                :title="resolveSessionTitle(session)"
                type="button"
                @click="handleChatSessionSwitch(session.id)"
              >
                <span class="material-symbols-outlined workspace-right-sidebar__session-tab-icon">{{ resolveSessionTabIcon(session) }}</span>
                <span class="workspace-right-sidebar__session-tab-label">{{ resolveSessionTabLabel(session) }}</span>
              </button>

              <template #content>
                <div
                  class="workspace-right-sidebar__session-popover"
                  data-testid="workspace-right-sidebar-session-popover"
                >
                  <div class="workspace-right-sidebar__session-popover-title">
                    {{ resolveSessionTitle(session) }}
                  </div>
                  <div class="workspace-right-sidebar__session-popover-row">
                    <span>类型</span>
                    <span>{{ resolveSessionTypeLabel(session) }}</span>
                  </div>
                  <div class="workspace-right-sidebar__session-popover-row">
                    <span>消息</span>
                    <span>{{ session.messageCount }}</span>
                  </div>
                  <div class="workspace-right-sidebar__session-popover-row">
                    <span>最近更新</span>
                    <span>{{ formatSessionDetailTime(session.lastMessageAt || session.updatedAt) }}</span>
                  </div>
                </div>
              </template>
            </a-trigger>
          </div>

          <div class="workspace-right-sidebar__session-actions">
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
              title="新建对话"
              aria-label="新建对话"
              :disabled="!props.aiEnabled"
              @click="handleCreateChatSession"
            >
              <span class="material-symbols-outlined workspace-right-sidebar__session-create-icon">add</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="flex flex-1 flex-col h-0 min-h-0 overflow-hidden">
      <div class="no-scrollbar px-3.5 py-3 flex-1 h-0 min-h-0 overflow-y-auto">
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
                class="flex gap-2 items-start"
                :class="entry.message.role === 'user' ? 'justify-end' : ''"
              >
                <div
                  v-if="entry.message.role === 'assistant'"
                  class="text-white rounded bg-blue-600 flex shrink-0 h-6 w-6 items-center justify-center"
                >
                  <span class="material-symbols-outlined text-sm">smart_toy</span>
                </div>

                <div
                  class="flex flex-col gap-2 max-w-[86%]"
                  :class="entry.message.role === 'user' ? 'items-end' : 'items-start'"
                >
                  <div
                    class="text-[11px] leading-relaxed p-3 rounded-lg w-full whitespace-pre-wrap"
                    :class="entry.message.role === 'user'
                      ? 'bg-blue-50 border border-blue-100 text-blue-900 rounded-tr-none'
                      : 'bg-slate-100 text-slate-700 rounded-tl-none'"
                  >
                    {{ entry.message.content }}
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
                </div>

                <div
                  v-if="entry.message.role === 'user'"
                  class="flex shrink-0 h-6 w-6 items-center justify-center overflow-hidden"
                >
                  <UnifiedAvatar
                    :name="currentUserName"
                    :src="currentUserAvatarUrl"
                    :size="24"
                  />
                </div>
              </div>
            </div>

            <div v-if="showDialogAskEmpty" class="text-[11px] text-slate-500 leading-5 p-3 border border-slate-200 rounded border-dashed">
              当前会话还没有消息，直接发送问题开始对话。
            </div>

            <div v-if="aiMode === 'dialog_ask'" class="text-[11px] text-emerald-700 leading-5 p-3 border border-emerald-200 rounded bg-emerald-50">
              <template v-if="props.workbenchMode === 'project' && props.projectAssistantMode === 'contextual' && props.projectContextualAssistantPreset === 'design'">
                当前为设计助手，只做只读分析，优先帮助你梳理页面层级、布局结构、视觉一致性和交互说明。
              </template>
              <template v-else-if="props.workbenchMode === 'project' && props.projectAssistantMode === 'contextual' && props.projectContextualAssistantPreset === 'prototype'">
                当前为原型助手，只做只读分析，优先帮助你梳理页面流转、模块拆分、关键状态和交互路径。
              </template>
              <template v-else>
                当前为只读对话模式，只提供解释、澄清与下一步建议，不会写入项目。
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
                      答辩状态
                    </div>
                    <p class="text-[11px] text-slate-500 mt-1">
                      阶段：{{ defenseStageLabel(defenseStage) }} · 已完成 {{ defenseTurnCount }} 轮
                    </p>
                  </div>
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
                    语音答辩
                  </button>
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
                :aria-label="chatLoading ? '打断生成' : '发送消息'"
                :title="chatLoading ? '打断生成' : '发送消息'"
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
  gap: 12px;
  min-height: 100%;
}

.workspace-right-sidebar__switch-pill {
  display: inline-flex;
  min-width: 0;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: 11px;
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
  padding: 0 10px;
  border: 1px solid #dce5f1;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #516277;
  font-size: 10px;
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
  height: 40px;
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
  padding: 0 12px;
  border-right: 1px solid #e2e8f0;
  background: #fff;
  color: #94a3b8;
  font-size: 10px;
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
  gap: 6px;
  min-width: 132px;
  height: 100%;
  padding: 0 14px;
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

.workspace-right-sidebar__session-tab::after {
  content: '';
  position: absolute;
  right: 12px;
  bottom: 0;
  left: 12px;
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
  font-size: 16px;
  color: inherit;
}

.workspace-right-sidebar__session-tab-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.workspace-right-sidebar__session-popover {
  width: 220px;
  padding: 10px 11px;
  border: 1px solid #e2e8f0;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}

.workspace-right-sidebar__session-popover-title {
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
  word-break: break-word;
}

.workspace-right-sidebar__session-popover-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;
  color: #64748b;
  font-size: 10px;
  line-height: 1.5;
}

.workspace-right-sidebar__session-popover-row span:last-child {
  color: #334155;
  text-align: right;
  word-break: break-word;
}

.workspace-right-sidebar__session-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  height: 100%;
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
  width: 40px;
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
  font-size: 16px;
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
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
}

.workspace-right-sidebar__session-history-empty {
  padding: 14px 12px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.5;
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
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-right-sidebar__session-history-meta {
  overflow: hidden;
  color: #64748b;
  font-size: 10px;
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
  gap: 12px;
}

.workspace-chat-composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  padding: 0 12px 14px;
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
  font-size: 12px;
  line-height: 1.55;
  padding: 15px 15px 6px;
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
  gap: 12px;
  padding: 0 12px 12px;
  position: relative;
  z-index: 1;
}

.workspace-chat-composer__toolbar {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
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
  font-size: 11px;
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
  font-size: 11px;
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
  gap: 12px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid #e5edf7;
}

.workspace-agent-doc-card__header-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.workspace-agent-doc-card__eyebrow {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.workspace-agent-doc-card__title {
  margin-top: 4px;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

.workspace-agent-doc-card__summary {
  margin-top: 6px;
  color: #475569;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.workspace-agent-doc-card__meta {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.workspace-agent-doc-card__action,
.workspace-agent-doc-card__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 10px;
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
  font-size: 10px;
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
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 1.6;
  text-align: right;
}

.workspace-agent-doc-card__diff-text {
  margin: 0;
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 10px;
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
  font-size: 11px;
  font-weight: 700;
}

.workspace-agent-doc-card__apply:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-issue-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 10px;
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
  font-size: 10px;
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
  font-size: 11px;
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
