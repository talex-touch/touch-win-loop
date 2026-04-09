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
  ChatMessage,
  Contest,
  ProjectIssue,
  ProjectIssueReport,
  Resource,
  Track,
  WorkspaceAiMode,
} from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  chatSessions?: AiChatSession[]
  activeChatSessionId?: string
  chatSessionsLoading?: boolean
  chatMessages?: ChatMessage[]
  chatInput?: string
  chatLoading?: boolean
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
  issueReportSubmitting?: boolean
  issueReportExporting?: boolean
}>(), {
  chatSessions: () => [],
  activeChatSessionId: '',
  chatSessionsLoading: false,
  chatMessages: () => [],
  chatInput: '',
  chatLoading: false,
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
  issueReportSubmitting: false,
  issueReportExporting: false,
})

const emit = defineEmits<{
  'update:chatInput': [value: string]
  'update:aiMode': [value: WorkspaceAiMode]
  'sendChat': []
  'switchChatSession': [sessionId: string]
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
}>()

const PRIMARY_MODES: Array<{ value: Exclude<WorkspaceAiMode, 'defense'>, label: string }> = [
  { value: 'dialog_ask', label: '对话询问' },
  { value: 'auto_optimize', label: '自动优化' },
  { value: 'issue_discovery', label: '寻疑发现' },
]

const inputPlaceholder = computed(() => {
  if (props.aiMode === 'auto_optimize')
    return '描述你想自动优化的目标，例如：统一摘要结构并补齐关键字段。'
  if (props.aiMode === 'issue_discovery')
    return '描述你希望重点扫描的风险，例如：评分映射、证据链、可行性。'
  if (props.aiMode === 'defense')
    return '输入答辩要点或追问，例如：请继续追问技术可行性。'
  return '请输入问题，AI 将仅做只读分析，不改动项目。'
})

const pendingChangeRequests = computed(() => {
  return props.changeRequests.filter(item => item.status === 'pending')
})

const aiRunning = computed(() => {
  return props.chatLoading
    || (props.aiMode === 'auto_optimize' && props.changeRequestsLoading)
    || (props.aiMode === 'issue_discovery' && props.issueLoading)
})

const aiRunningMarqueeText = computed(() => {
  if (props.aiMode === 'auto_optimize')
    return 'AI 正在生成优化提案，请稍候同步审批卡片'
  if (props.aiMode === 'issue_discovery')
    return 'AI 正在扫描问题与证据链，请稍候查看寻疑结果'
  if (props.aiMode === 'defense')
    return 'AI 正在模拟评委追问，请稍候生成答辩轮次'
  return 'AI 正在分析上下文、资料与问题，请稍候'
})

const issueReportStatusLabel = computed(() => {
  if (props.issueReport?.reviewSubmissionStatus === 'submitted')
    return '已提交评审'
  return '草稿'
})

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

function selectMode(mode: Exclude<WorkspaceAiMode, 'defense'>) {
  emit('update:aiMode', mode)
}

function modeSelectValue(): Exclude<WorkspaceAiMode, 'defense'> | '' {
  if (props.aiMode === 'defense')
    return ''
  return props.aiMode
}

function handleModeSelectChange(event: Event) {
  const value = String((event.target as HTMLSelectElement).value || '').trim()
  if (!value)
    return
  if (value === 'dialog_ask' || value === 'auto_optimize' || value === 'issue_discovery')
    selectMode(value)
}

function cyclePrimaryMode() {
  const currentIndex = PRIMARY_MODES.findIndex(item => item.value === props.aiMode)
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + 1) % PRIMARY_MODES.length
  emit('update:aiMode', PRIMARY_MODES[nextIndex]!.value)
}

function handleModeCycleHotkey(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !event.shiftKey)
    return
  event.preventDefault()
  cyclePrimaryMode()
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
</script>

<template>
  <aside
    class="border-l border-slate-200 bg-white flex shrink-0 flex-col h-full min-h-0 w-full overflow-hidden xl:w-88"
    tabindex="0"
    @keydown.capture="handleModeCycleHotkey"
  >
    <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/70 shrink-0 space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-xs text-slate-800 font-semibold">
          Loopy 会话（{{ chatSessions.length }}）
        </div>
        <button
          class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100"
          @click="emit('createChatSession')"
        >
          新建
        </button>
      </div>
      <div v-if="chatSessionsLoading" class="text-[11px] text-slate-500 leading-5">
        会话加载中...
      </div>
      <div v-else-if="chatSessions.length === 0" class="text-[11px] text-slate-400 leading-5">
        暂无会话，点击“新建”开始 Loopy 对话。
      </div>
      <div v-else class="pr-1 max-h-32 overflow-y-auto space-y-1">
        <button
          v-for="session in chatSessions"
          :key="session.id"
          class="px-2 py-1.5 text-left border rounded w-full"
          :class="session.id === activeChatSessionId ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
          @click="emit('switchChatSession', session.id)"
        >
          <div class="text-[11px] text-slate-700 font-semibold truncate">
            {{ session.title || 'Loopy 对话' }}
          </div>
          <div class="text-[10px] text-slate-500 mt-1">
            消息 {{ session.messageCount }} · {{ session.lastMessageAt || session.updatedAt }}
          </div>
        </button>
      </div>
    </div>

    <div class="flex flex-1 flex-col h-0 min-h-0 overflow-hidden">
      <div class="no-scrollbar p-4 flex-1 h-0 min-h-0 overflow-y-auto">
        <div class="workspace-chat-scroll-content">
          <div class="workspace-chat-messages">
            <div
              v-for="(message, index) in chatMessages"
              :key="`${message.role}-${index}`"
              class="flex gap-2 items-start"
              :class="message.role === 'user' ? 'justify-end' : ''"
            >
              <div
                v-if="message.role === 'assistant'"
                class="text-white rounded bg-blue-600 flex shrink-0 h-6 w-6 items-center justify-center"
              >
                <span class="material-symbols-outlined text-sm">smart_toy</span>
              </div>

              <div
                v-else-if="message.role === 'system'"
                class="text-slate-700 border border-slate-300 rounded bg-slate-200 flex shrink-0 h-6 w-6 items-center justify-center"
              >
                <span class="text-[9px] font-semibold">SYS</span>
              </div>

              <div
                class="text-[11px] leading-relaxed p-3 rounded-lg max-w-[86%] whitespace-pre-wrap"
                :class="message.role === 'user'
                  ? 'bg-blue-50 border border-blue-100 text-blue-900 rounded-tr-none'
                  : message.role === 'system'
                    ? 'bg-slate-50 border border-slate-200 text-slate-600 rounded-tl-sm'
                    : 'bg-slate-100 text-slate-700 rounded-tl-none'"
              >
                <div v-if="message.role === 'system'" class="text-[10px] text-slate-500 tracking-wide font-semibold mb-1">
                  SYSTEM
                </div>
                {{ message.content }}
              </div>

              <div
                v-if="message.role === 'user'"
                class="rounded bg-slate-200 flex shrink-0 h-6 w-6 items-center justify-center overflow-hidden"
              >
                <img
                  alt="avatar"
                  class="h-full w-full object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCpeK3ZzVd7LtrOg5h6iFhJ5azRbuUFRmmaMGNaVkipoRx2KeXJvGzjOem-njmZ1X2K7E5eZq7iEGey_U1YoWT2pMOklyV-WBBdEXaeAsz-Gr76uirUlHq69Ry0Fs7j56my_Rkzmsqgd-IwpFzP7GnGQQLMOQ5ow_q8rIICxDOttJQY_PinNCZcLPjEAJaTIm6TZKjFhUquEDOc_dJHU_4nZZUHpVc9q77XvmnEtM5aBVMhBO4J0oNIfiA6rLO49eLZ9IVEQs_CTyPt"
                >
              </div>
            </div>
          </div>

          <div v-if="aiMode === 'dialog_ask'" class="text-[11px] text-emerald-700 leading-5 p-3 border border-emerald-200 rounded bg-emerald-50">
            当前为只读对话模式，不会触发任何项目写入动作。
          </div>

          <div v-if="aiMode === 'auto_optimize'" class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="text-xs text-slate-700 font-semibold">
                待审批变更（{{ pendingChangeRequests.length }}）
              </div>
              <span v-if="changeRequestsLoading" class="text-[10px] text-slate-500">刷新中...</span>
            </div>
            <div v-if="pendingChangeRequests.length === 0" class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed">
              暂无待审批提案，发送优化请求后会自动生成。
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
              暂无 issue 条目，执行一次“寻疑发现”后会自动落地。
            </div>
          </div>

          <div v-if="aiMode === 'defense'" class="space-y-2">
            <div class="p-3 border border-slate-200 rounded bg-slate-50">
              <div class="flex items-center justify-between gap-2">
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
                  :disabled="defenseSummaryLoading"
                  @click="emit('generateDefenseSummary')"
                >
                  {{ defenseSummaryLoading ? '生成中...' : '生成总结' }}
                </button>
                <button
                  class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100"
                  @click="emit('startDefenseRealtime')"
                >
                  语音答辩
                </button>
              </div>
            </div>

            <div class="p-3 border border-slate-200 rounded bg-white space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="text-xs text-slate-700 font-semibold">
                  评委人设
                </div>
                <div class="flex items-center gap-2">
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
              <div v-else-if="defensePersonas.length === 0" class="text-[11px] text-slate-500 border border-dashed border-slate-200 rounded p-3">
                当前项目还没有答辩人设。可先导入比赛预设，再按项目需要调整。
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="persona in defensePersonas"
                  :key="persona.id"
                  class="border border-slate-200 rounded p-3 bg-slate-50/60"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <div class="text-[11px] text-slate-800 font-semibold">
                        {{ persona.name }}
                      </div>
                      <div class="text-[10px] text-slate-500 mt-1">
                        {{ persona.judgeType }} · {{ persona.enabled ? '已启用' : '已停用' }}
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        class="text-[10px] px-2 h-6 border border-slate-300 rounded bg-white hover:bg-slate-100"
                        @click="quickToggleDefensePersona(persona)"
                      >
                        {{ persona.enabled ? '停用' : '启用' }}
                      </button>
                      <button
                        class="text-[10px] px-2 h-6 border border-slate-300 rounded bg-white hover:bg-slate-100"
                        @click="openEditDefensePersonaForm(persona)"
                      >
                        编辑
                      </button>
                      <button
                        class="text-[10px] px-2 h-6 border border-rose-200 text-rose-600 rounded bg-white hover:bg-rose-50"
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

              <div v-if="defensePersonaFormVisible" class="border border-blue-200 rounded p-3 bg-blue-50/60 space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-[11px] text-slate-800 font-semibold">
                    {{ defensePersonaEditingId ? '编辑人设' : '新建人设' }}
                  </div>
                  <button
                    class="text-[10px] px-2 h-6 border border-slate-300 rounded bg-white hover:bg-slate-100"
                    @click="defensePersonaFormVisible = false"
                  >
                    取消
                  </button>
                </div>
                <select v-model="defensePersonaForm.judgeType" class="w-full text-[11px] border border-slate-200 rounded px-2 py-1.5 bg-white">
                  <option value="technical">technical</option>
                  <option value="business">business</option>
                  <option value="expression">expression</option>
                  <option value="custom">custom</option>
                </select>
                <input v-model="defensePersonaForm.name" class="w-full text-[11px] border border-slate-200 rounded px-2 py-1.5 bg-white" placeholder="人设名称" />
                <textarea v-model="defensePersonaForm.summary" class="w-full text-[11px] border border-slate-200 rounded px-2 py-1.5 bg-white h-16 resize-none" placeholder="一句话说明评委关注点" />
                <textarea v-model="defensePersonaForm.systemPrompt" class="w-full text-[11px] border border-slate-200 rounded px-2 py-1.5 bg-white h-28 resize-none" placeholder="系统提示词" />
                <textarea v-model="defensePersonaForm.focusAreasText" class="w-full text-[11px] border border-slate-200 rounded px-2 py-1.5 bg-white h-16 resize-none" placeholder="关注点，每行一个" />
                <label class="flex items-center gap-2 text-[11px] text-slate-600">
                  <input v-model="defensePersonaForm.enabled" type="checkbox">
                  新建后立即启用
                </label>
                <button
                  class="text-[11px] font-semibold px-3 border border-blue-500 text-white rounded bg-blue-600 h-8 hover:bg-blue-500 disabled:opacity-60"
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
      </div>

      <div class="workspace-chat-composer">
        <div v-if="aiRunning" class="workspace-ai-marquee" aria-live="polite">
          <div class="workspace-ai-marquee__track">
            <span>{{ aiRunningMarqueeText }}</span>
            <span>{{ aiRunningMarqueeText }}</span>
          </div>
        </div>

        <div class="relative">
          <textarea
            :value="chatInput"
            class="text-xs p-2.5 pr-10 border border-slate-200 rounded-lg bg-slate-50 h-24 w-full resize-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            :placeholder="inputPlaceholder"
            @input="emit('update:chatInput', ($event.target as HTMLTextAreaElement).value)"
          />
          <button
            class="text-white p-1.5 rounded-md bg-blue-600 bottom-2 right-2 absolute hover:bg-blue-500 disabled:opacity-60"
            :disabled="chatLoading"
            @click="emit('sendChat')"
          >
            <span class="material-symbols-outlined text-sm">{{ chatLoading ? 'hourglass_top' : 'send' }}</span>
          </button>
        </div>

        <div class="workspace-chat-composer__meta">
          <div class="workspace-chat-composer__meta-text">
            已关联资料：{{ selectedResources.length }} · Shift+Tab 切换模式
          </div>
          <select
            data-testid="workspace-right-sidebar-mode-select"
            class="workspace-mode-select shrink-0"
            :value="modeSelectValue()"
            :disabled="aiMode === 'defense'"
            @change="handleModeSelectChange"
          >
            <option v-if="aiMode === 'defense'" value="" disabled>
              答辩工作台（顶部切换）
            </option>
            <option
              v-for="mode in PRIMARY_MODES"
              :key="mode.value"
              :value="mode.value"
            >
              {{ mode.label }}
            </option>
          </select>
        </div>
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
  padding: 12px 16px 16px;
  border-top: 1px solid #e2e8f0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, #ffffff 18px);
}

.workspace-chat-composer__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.workspace-chat-composer__meta-text {
  min-width: 0;
  flex: 1 1 140px;
  color: #94a3b8;
  font-size: 10px;
  line-height: 1.4;
}

.workspace-ai-marquee {
  margin-bottom: 10px;
  overflow: hidden;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  background: linear-gradient(90deg, #eff6ff 0%, #eef2ff 100%);
  color: #1d4ed8;
  font-size: 11px;
  white-space: nowrap;
}

.workspace-ai-marquee__track {
  display: inline-flex;
  min-width: 200%;
  gap: 48px;
  padding: 7px 0;
  animation: workspace-ai-marquee 12s linear infinite;
}

.workspace-ai-marquee__track span {
  padding-left: 18px;
  font-weight: 600;
}

@keyframes workspace-ai-marquee {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-50%, 0, 0);
  }
}

.workspace-mode-select {
  min-width: 124px;
  height: 26px;
  border: 1px solid #d9e1ef;
  border-radius: 6px;
  background: #f8fafc;
  color: #395077;
  font-size: 11px;
  padding: 0 24px 0 8px;
  outline: none;
}

.workspace-mode-select:focus {
  border-color: #86aefb;
  box-shadow: 0 0 0 1px #86aefb;
}

.workspace-mode-select:disabled {
  opacity: 0.65;
  cursor: not-allowed;
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
