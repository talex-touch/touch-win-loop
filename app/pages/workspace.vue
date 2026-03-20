<script setup lang="ts">
import type {
  AiChatMessage,
  AiChatSession,
  AiContestFilterResult,
  AiProjectChatResult,
  ApiResponse,
  AuthMeResult,
  ChatMessage,
  Contest,
  Project,
  ProjectPayload,
  Resource,
} from '~~/shared/types/domain'
import type {
  MappingTone,
  WorkspaceFormState,
  WorkspaceKeyword,
  WorkspaceMappingRow,
  WorkspaceSidebarTab,
  WorkspaceStatusToneMeta,
} from '~/types/workspace'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: '竞赛分析工作台',
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@300;400;500;600;700&display=swap',
    },
  ],
})

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

function linesToArray(text: string): string[] {
  return text
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function arrayToLines(list: string[] | undefined): string {
  return (list || []).join('\n')
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function defaultAssistantGreeting(): ChatMessage {
  return {
    role: 'assistant',
    content: '你好，我是 WinLoop AI。先在左侧筛选竞赛，再告诉我你想做的项目方向，我会帮你生成可落地草案。',
  }
}

function toTone(score: number): MappingTone {
  if (score >= 75)
    return 'complete'
  if (score >= 40)
    return 'warning'
  return 'todo'
}

function includesText(source: string, keyword: string): boolean {
  return source.toLowerCase().includes(keyword.toLowerCase())
}

function resolveDefaultWorkspaceId(auth: AuthMeResult): string {
  const personal = auth.workspaces.find(item => item.workspace.type === 'personal' && item.workspace.ownerUserId === auth.user.id)
  return personal?.workspace.id || auth.workspaces[0]?.workspace.id || ''
}

const naturalQuery = ref('')
const major = ref('')
const discipline = ref('')
const level = ref('')
const trackType = ref('')
const topK = ref(6)

const contests = ref<Contest[]>([])
const resources = ref<Resource[]>([])
const projects = ref<Project[]>([])
const me = ref<AuthMeResult | null>(null)
const activeWorkspaceId = ref('')
const selectedContestId = ref('')
const selectedTrackId = ref('')

const sidebarTab = ref<WorkspaceSidebarTab>('chat')
const headerSearch = ref('')
const aiReasoning = ref('')
const normalizedInfo = ref('')
const statusLine = ref('')

const listLoading = ref(false)
const aiFiltering = ref(false)
const chatLoading = ref(false)
const chatSessionsLoading = ref(false)
const formSubmitting = ref(false)
const resourcesLoading = ref(false)

const chatMessages = ref<ChatMessage[]>([defaultAssistantGreeting()])
const chatSessions = ref<AiChatSession[]>([])
const activeChatSessionId = ref('')
const chatInput = ref('')
const chatMissingFields = ref<string[]>([])
const chatDraft = ref<ProjectPayload | null>(null)

function resetChatStateWithGreeting() {
  chatMessages.value = [defaultAssistantGreeting()]
  chatDraft.value = null
  chatMissingFields.value = []
}

const formState = reactive<WorkspaceFormState>({
  source: 'form',
  title: '',
  problemStatement: '',
  innovationPointsText: '',
  techRouteStepsText: '',
  scoringMappingText: '',
  risksText: '',
  deliverablesText: '',
  summary: '',
})

const selectedContest = computed(() => contests.value.find(contest => contest.id === selectedContestId.value) || null)
const selectedTrack = computed(() => selectedContest.value?.tracks.find(track => track.id === selectedTrackId.value) || null)
const workspaceOptions = computed(() => me.value?.workspaces || [])
const currentWorkspace = computed(() => {
  return workspaceOptions.value.find(item => item.workspace.id === activeWorkspaceId.value) || null
})

const filteredContests = computed(() => {
  const keyword = headerSearch.value.trim()
  if (!keyword)
    return contests.value

  return contests.value.filter((contest) => {
    const context = [
      contest.name,
      contest.organizer,
      ...contest.keywords,
      ...contest.recommendedFor,
      ...contest.tracks.map(track => track.name),
    ].join(' ')

    return includesText(context, keyword)
  })
})

const selectedResources = computed(() => resources.value.filter(item => item.contestId === selectedContestId.value))

const toneMeta: Record<MappingTone, WorkspaceStatusToneMeta> = {
  complete: {
    label: '已完备',
    badgeClass: 'bg-green-100 text-green-700',
    barClass: 'bg-green-500',
  },
  warning: {
    label: '缺失材料',
    badgeClass: 'bg-amber-100 text-amber-700',
    barClass: 'bg-amber-500',
  },
  todo: {
    label: '待处理',
    badgeClass: 'bg-slate-100 text-slate-500',
    barClass: 'bg-slate-300',
  },
}

const mappingRows = computed<WorkspaceMappingRow[]>(() => {
  const innovationCount = linesToArray(formState.innovationPointsText).length + (chatDraft.value?.innovationPoints.length || 0)
  const routeCount = linesToArray(formState.techRouteStepsText).length + (chatDraft.value?.techRouteSteps.length || 0)
  const scoringCount = linesToArray(formState.scoringMappingText).length + (chatDraft.value?.scoringMapping.length || 0)
  const deliverableCount = linesToArray(formState.deliverablesText).length + (chatDraft.value?.deliverables.length || 0)
  const impactSignal = /社会|可持续|公益|适老|普惠|impact/i.test(`${formState.summary} ${formState.problemStatement}`)

  const innovationScore = clamp(35 + innovationCount * 12 + routeCount * 6, 10, 98)
  const marketScore = clamp(28 + scoringCount * 10 + (selectedResources.value.length > 0 ? 12 : 0), 10, 96)
  const teamScore = clamp(40 + deliverableCount * 9 + routeCount * 7, 10, 100)
  const impactScore = clamp(impactSignal ? 74 : 18 + scoringCount * 4 + deliverableCount * 5, 5, 90)

  return [
    {
      id: 'innovation',
      metric: '技术创新性与前瞻性 (30%)',
      hint: '要求体现核心算法自主研发能力',
      score: innovationScore,
      ability: innovationCount > 0
        ? linesToArray(formState.innovationPointsText)[0] || '创新点已在草案中体现'
        : '待补充：核心算法、性能对比与可复现实验设计',
      tags: ['#创新能力', '#算法优化'],
      tone: toTone(innovationScore),
    },
    {
      id: 'market',
      metric: '商业落地与市场潜力 (20%)',
      hint: '需提供详实的市场调研数据支撑',
      score: marketScore,
      ability: linesToArray(formState.scoringMappingText)[0] || '待补充：用户场景拆解、市场对标和商业验证数据',
      tags: ['#场景落地', '#评审关注'],
      tone: toTone(marketScore),
    },
    {
      id: 'team',
      metric: '团队构成与分工 (15%)',
      hint: '跨学科背景及核心人员资历',
      score: teamScore,
      ability: linesToArray(formState.deliverablesText)[0] || '可展示交付物框架已初步形成',
      tags: ['#团队协同', '#交付闭环'],
      tone: toTone(teamScore),
    },
    {
      id: 'impact',
      metric: '社会价值与影响力 (15%)',
      hint: '需明确社会价值和长期影响路径',
      score: impactScore,
      ability: impactSignal ? '摘要中已包含社会价值路径，可继续补充量化指标' : '未映射：建议补充社会价值、可持续性或普惠性说明',
      tags: ['#社会价值', '#可持续'],
      tone: toTone(impactScore),
    },
  ]
})

const keywordCloud = computed<WorkspaceKeyword[]>(() => {
  const seed = selectedContest.value?.keywords.length
    ? [...selectedContest.value.keywords]
    : ['人工智能', '工程落地', '评分映射', '答辩策略', '项目管理']

  const majors = selectedContest.value?.recommendedFor || []
  const deliverables = selectedTrack.value?.deliverableTypes || []

  const words = [...seed, ...majors.slice(0, 2), ...deliverables.slice(0, 2)]
    .filter(Boolean)
    .slice(0, 8)

  return words.map((label, index) => ({
    label,
    count: clamp(42 - index * 4 + (major.value && includesText(label, major.value) ? 6 : 0), 8, 56),
    active: index % 3 === 0,
  }))
})

const trendBars = computed<number[]>(() => {
  const filledSignals = [
    formState.problemStatement,
    formState.innovationPointsText,
    formState.techRouteStepsText,
    formState.scoringMappingText,
    formState.risksText,
    formState.deliverablesText,
    formState.summary,
  ].filter(Boolean).length

  const userMessages = chatMessages.value.filter(item => item.role === 'user').length
  const last = clamp(38 + filledSignals * 7 + userMessages * 5, 22, 95)

  return [30, 45, 68, 82, last]
})

const tokenBalance = computed(() => {
  const quota = currentWorkspace.value?.quota
  if (quota)
    return Math.max(0, quota.aiQuotaTotal - quota.aiQuotaUsed)
  return 0
})

const aiBusy = computed(() => listLoading.value || aiFiltering.value || chatLoading.value || formSubmitting.value)

const statusCursor = computed(() => {
  const line = clamp(12 + chatMessages.value.length + (formState.problemStatement ? 3 : 0), 12, 96)
  const column = clamp((chatInput.value.length % 80) + 8, 8, 120)
  return {
    line,
    column,
  }
})

watch(selectedContestId, (contestId) => {
  const contest = contests.value.find(item => item.id === contestId)
  selectedTrackId.value = contest?.tracks[0]?.id || ''
})

watch([selectedContestId, selectedTrackId], () => {
  syncFormContestTrack()
})

async function loadAuthContext(): Promise<boolean> {
  try {
    const response = await $fetch<ApiResponse<AuthMeResult>>(endpoint('/auth/me'))
    me.value = response.data

    const hasCurrent = response.data.workspaces.some(item => item.workspace.id === activeWorkspaceId.value)
    if (!hasCurrent)
      activeWorkspaceId.value = resolveDefaultWorkspaceId(response.data)

    if (!activeWorkspaceId.value)
      statusLine.value = '当前账号未加入任何空间，请先创建 Team。'

    return true
  }
  catch {
    await navigateTo({
      path: '/login',
      query: { redirect: route.fullPath || '/workspace' },
    })
    return false
  }
}

async function logout() {
  try {
    await $fetch(endpoint('/auth/logout'), { method: 'POST' })
  }
  finally {
    await navigateTo('/login')
  }
}

async function loadContests() {
  listLoading.value = true
  statusLine.value = ''
  try {
    const response = await $fetch<ApiResponse<Contest[]>>(endpoint('/contests'), {
      query: {
        discipline: discipline.value,
        level: level.value,
        major: major.value,
        trackType: trackType.value,
      },
    })

    contests.value = response.data
    const firstContest = contests.value[0]
    if (!selectedContestId.value && firstContest)
      selectedContestId.value = firstContest.id

    if (selectedContestId.value) {
      const hit = contests.value.some(contest => contest.id === selectedContestId.value)
      if (!hit)
        selectedContestId.value = contests.value[0]?.id || ''
    }

    statusLine.value = `已加载 ${contests.value.length} 个竞赛`
  }
  catch {
    statusLine.value = '加载竞赛列表失败，请稍后重试。'
  }
  finally {
    listLoading.value = false
  }
}

async function loadResources() {
  resourcesLoading.value = true
  try {
    const response = await $fetch<ApiResponse<Resource[]>>(endpoint('/resources'))
    resources.value = response.data
  }
  catch {
    resources.value = []
  }
  finally {
    resourcesLoading.value = false
  }
}

async function loadProjects() {
  if (!activeWorkspaceId.value) {
    projects.value = []
    return
  }

  try {
    const response = await $fetch<ApiResponse<Project[]>>(endpoint('/projects'), {
      query: {
        workspaceId: activeWorkspaceId.value,
      },
    })
    projects.value = response.data
  }
  catch {
    projects.value = []
  }
}

async function loadChatMessages(sessionId: string) {
  if (!activeWorkspaceId.value || !sessionId) {
    resetChatStateWithGreeting()
    return
  }

  try {
    const response = await $fetch<ApiResponse<{ session: AiChatSession, messages: AiChatMessage[] }>>(
      endpoint(`/workspaces/${activeWorkspaceId.value}/chat/sessions/${sessionId}/messages`),
      {
        query: {
          limit: 200,
        },
      },
    )

    const restoredMessages = response.data.messages.map(item => ({
      role: item.role,
      content: item.content,
    })) as ChatMessage[]

    chatMessages.value = restoredMessages.length > 0
      ? restoredMessages
      : [defaultAssistantGreeting()]
  }
  catch {
    resetChatStateWithGreeting()
  }
}

async function createChatSession(preferredTitle = ''): Promise<string | null> {
  if (!activeWorkspaceId.value)
    return null

  try {
    const response = await $fetch<ApiResponse<AiChatSession>>(
      endpoint(`/workspaces/${activeWorkspaceId.value}/chat/sessions`),
      {
        method: 'POST',
        body: {
          title: preferredTitle || `${selectedContest.value?.name || 'AI 对话'}`,
          contestId: selectedContestId.value,
          trackId: selectedTrackId.value,
          major: major.value,
        },
      },
    )

    return response.data.id
  }
  catch {
    return null
  }
}

async function loadChatSessions(preferredSessionId = '') {
  if (!activeWorkspaceId.value) {
    chatSessions.value = []
    activeChatSessionId.value = ''
    resetChatStateWithGreeting()
    return
  }

  chatSessionsLoading.value = true
  try {
    const response = await $fetch<ApiResponse<AiChatSession[]>>(
      endpoint(`/workspaces/${activeWorkspaceId.value}/chat/sessions`),
      {
        query: {
          limit: 30,
        },
      },
    )
    chatSessions.value = response.data

    const nextSession = chatSessions.value.find(item => item.id === preferredSessionId)
      || chatSessions.value.find(item => item.id === activeChatSessionId.value)
      || chatSessions.value[0]

    if (!nextSession) {
      const createdId = await createChatSession()
      if (!createdId) {
        activeChatSessionId.value = ''
        resetChatStateWithGreeting()
        return
      }
      activeChatSessionId.value = createdId
      await loadChatSessions(createdId)
      return
    }

    activeChatSessionId.value = nextSession.id
    await loadChatMessages(nextSession.id)
  }
  catch {
    chatSessions.value = []
    activeChatSessionId.value = ''
    resetChatStateWithGreeting()
  }
  finally {
    chatSessionsLoading.value = false
  }
}

async function switchChatSession(sessionId: string) {
  if (!sessionId || sessionId === activeChatSessionId.value)
    return

  activeChatSessionId.value = sessionId
  await loadChatMessages(sessionId)
}

async function startNewChatSession() {
  const createdId = await createChatSession('新建 AI 对话')
  if (!createdId) {
    statusLine.value = '新建对话失败，请稍后重试。'
    return
  }

  await loadChatSessions(createdId)
  statusLine.value = '已创建新对话。'
}

function syncFormContestTrack() {
  if (!selectedContestId.value || !selectedTrackId.value)
    return

  if (!formState.title) {
    const contestName = selectedContest.value?.name || ''
    const trackName = selectedTrack.value?.name || ''
    formState.title = `${contestName} - ${trackName} 项目草案`
  }
}

async function runAiFilter() {
  if (!activeWorkspaceId.value) {
    statusLine.value = '请先选择一个空间。'
    return
  }

  aiFiltering.value = true
  statusLine.value = ''

  try {
    const response = await $fetch<ApiResponse<AiContestFilterResult>>(endpoint('/ai/contest-filter'), {
      method: 'POST',
      body: {
        workspaceId: activeWorkspaceId.value,
        query: naturalQuery.value,
        major: major.value,
        filters: {
          discipline: discipline.value,
          level: level.value,
          trackType: trackType.value,
        },
        topK: topK.value,
      },
    })

    contests.value = response.data.contests
    aiReasoning.value = response.data.reasoning
    normalizedInfo.value = JSON.stringify(response.data.normalizedFilters, null, 2)

    const firstContest = contests.value[0]
    if (firstContest)
      selectedContestId.value = firstContest.id

    statusLine.value = response.meta.fallbackUsed
      ? 'AI 调用失败，已启用规则兜底并返回结果。'
      : 'AI 已完成筛选并返回排序结果。'
  }
  catch {
    statusLine.value = 'AI 筛选失败，请检查服务状态。'
  }
  finally {
    aiFiltering.value = false
  }
}

function fillFormWithDraft(draft: ProjectPayload) {
  formState.source = 'chat'
  formState.title = draft.title
  formState.problemStatement = draft.problemStatement
  formState.innovationPointsText = arrayToLines(draft.innovationPoints)
  formState.techRouteStepsText = arrayToLines(draft.techRouteSteps)
  formState.scoringMappingText = arrayToLines(draft.scoringMapping)
  formState.risksText = arrayToLines(draft.risks)
  formState.deliverablesText = arrayToLines(draft.deliverables)
  formState.summary = draft.summary || ''
  sidebarTab.value = 'submit'
}

async function sendChatMessage() {
  if (!activeWorkspaceId.value) {
    statusLine.value = '请先选择一个空间。'
    return
  }

  const content = chatInput.value.trim()
  if (!content)
    return

  if (!activeChatSessionId.value) {
    const createdId = await createChatSession()
    if (!createdId) {
      statusLine.value = '创建对话会话失败，请稍后重试。'
      return
    }
    activeChatSessionId.value = createdId
  }

  const pendingMessages = [...chatMessages.value, { role: 'user' as const, content }]
  chatMessages.value = pendingMessages
  chatInput.value = ''
  chatLoading.value = true

  try {
    const response = await $fetch<ApiResponse<AiProjectChatResult>>(endpoint('/ai/project-chat'), {
      method: 'POST',
      body: {
        workspaceId: activeWorkspaceId.value,
        sessionId: activeChatSessionId.value,
        messages: pendingMessages,
        context: {
          workspaceId: activeWorkspaceId.value,
          contestId: selectedContestId.value,
          trackId: selectedTrackId.value,
          major: major.value,
        },
      },
    })

    chatMessages.value = [...pendingMessages, { role: 'assistant', content: response.data.assistantReply }]
    chatDraft.value = response.data.projectDraft
    chatMissingFields.value = response.data.missingFields
    activeChatSessionId.value = String(response.data.sessionId || activeChatSessionId.value)
    await loadChatSessions(activeChatSessionId.value)
    statusLine.value = response.meta.fallbackUsed
      ? '聊天结果来自兜底策略，可继续补充需求后重试。'
      : '聊天已生成结构化草案，可一键回填表单。'
  }
  catch {
    chatMessages.value = [...pendingMessages, { role: 'assistant', content: '聊天服务暂不可用，请稍后重试。' }]
    statusLine.value = '聊天接口调用失败。'
  }
  finally {
    chatLoading.value = false
  }
}

async function submitProject() {
  if (!activeWorkspaceId.value) {
    statusLine.value = '请先选择一个空间。'
    return
  }

  if (!selectedContestId.value || !selectedTrackId.value) {
    statusLine.value = '请先选择竞赛和赛道。'
    return
  }

  formSubmitting.value = true
  statusLine.value = ''

  try {
    const payload = {
      workspaceId: activeWorkspaceId.value,
      source: formState.source,
      title: formState.title.trim(),
      contestId: selectedContestId.value,
      trackId: selectedTrackId.value,
      problemStatement: formState.problemStatement.trim(),
      innovationPoints: linesToArray(formState.innovationPointsText),
      techRouteSteps: linesToArray(formState.techRouteStepsText),
      scoringMapping: linesToArray(formState.scoringMappingText),
      risks: linesToArray(formState.risksText),
      deliverables: linesToArray(formState.deliverablesText),
      summary: formState.summary.trim(),
    }

    const response = await $fetch<ApiResponse<Project>>(endpoint('/projects'), {
      method: 'POST',
      body: payload,
    })

    statusLine.value = `项目已创建：${response.data.title}`
    await loadProjects()
    sidebarTab.value = 'submit'
  }
  catch {
    statusLine.value = '项目创建失败，请检查字段是否完整。'
  }
  finally {
    formSubmitting.value = false
  }
}

function openProject(projectId: string) {
  navigateTo(`/projects/${projectId}`)
}

onMounted(async () => {
  const ok = await loadAuthContext()
  if (!ok)
    return

  await Promise.all([loadContests(), loadResources(), loadProjects(), loadChatSessions()])
  syncFormContestTrack()
})

watch(activeWorkspaceId, async (value, previous) => {
  if (!value || value === previous)
    return

  statusLine.value = `已切换到空间：${currentWorkspace.value?.workspace.name || value}`
  await Promise.all([loadProjects(), loadChatSessions()])
})
</script>

<template>
  <div class="workspace-shell text-slate-800 bg-white flex flex-col min-h-[680px] overflow-hidden">
    <WorkspaceHeader
      v-model="headerSearch"
      :contest-name="selectedContest?.name || '未选择竞赛'"
      :track-name="selectedTrack?.name || '未选择赛道'"
    />

    <div class="text-xs px-3 py-2 border-b border-slate-200 bg-slate-50 flex gap-2 items-center">
      <span class="text-slate-500">账号：{{ me?.user.username || '-' }}</span>
      <span class="text-slate-300">|</span>
      <span class="text-slate-500">空间：{{ currentWorkspace?.workspace.name || '-' }}</span>
      <span
        v-if="currentWorkspace?.quota"
        class="text-slate-500"
      >
        席位 {{ currentWorkspace.quota.seatUsed }}/{{ currentWorkspace.quota.seatLimit }}，
        AI {{ currentWorkspace.quota.aiQuotaUsed }}/{{ currentWorkspace.quota.aiQuotaTotal }}
      </span>
      <button class="text-slate-600 ml-auto hover:text-slate-900" @click="logout">
        退出登录
      </button>
    </div>

    <main class="flex flex-1 flex-col min-h-0 overflow-hidden xl:flex-row">
      <WorkspaceLeftSidebar
        v-model:natural-query="naturalQuery"
        v-model:major="major"
        v-model:discipline="discipline"
        v-model:level="level"
        v-model:track-type="trackType"
        v-model:top-k="topK"
        v-model:selected-contest-id="selectedContestId"
        v-model:active-workspace-id="activeWorkspaceId"
        :contests="filteredContests"
        :workspace-options="workspaceOptions"
        :username="me?.user.username || ''"
        :ai-reasoning="aiReasoning"
        :status-line="statusLine"
        :list-loading="listLoading"
        :ai-filtering="aiFiltering"
        :token-balance="tokenBalance"
        @load-contests="loadContests"
        @run-ai-filter="runAiFilter"
      />

      <WorkspaceMainPanel
        v-model:selected-track-id="selectedTrackId"
        :selected-contest="selectedContest"
        :selected-track="selectedTrack"
        :selected-resources="selectedResources"
        :mapping-rows="mappingRows"
        :keyword-cloud="keywordCloud"
        :trend-bars="trendBars"
        :tone-meta="toneMeta"
      />

      <WorkspaceRightSidebar
        v-model:sidebar-tab="sidebarTab"
        v-model:chat-input="chatInput"
        :chat-sessions="chatSessions"
        :active-chat-session-id="activeChatSessionId"
        :chat-sessions-loading="chatSessionsLoading"
        :chat-messages="chatMessages"
        :chat-loading="chatLoading"
        :chat-draft="chatDraft"
        :chat-missing-fields="chatMissingFields"
        :normalized-info="normalizedInfo"
        :selected-contest="selectedContest"
        :selected-track="selectedTrack"
        :selected-resources="selectedResources"
        :form-state="formState"
        :form-submitting="formSubmitting"
        :projects="projects"
        @update:form-state="Object.assign(formState, $event)"
        @send-chat="sendChatMessage"
        @switch-chat-session="switchChatSession"
        @create-chat-session="startNewChatSession"
        @fill-form="fillFormWithDraft"
        @submit-project="submitProject"
        @open-project="openProject"
      />
    </main>

    <WorkspaceStatusBar
      :status-line="statusLine"
      :loading="resourcesLoading"
      :ai-ready="!aiBusy"
      :line="statusCursor.line"
      :column="statusCursor.column"
    />
  </div>
</template>

<style scoped>
.workspace-shell {
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
</style>
