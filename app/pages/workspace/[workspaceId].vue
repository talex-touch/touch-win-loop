<script setup lang="ts">
import type {
  AiChatMessage,
  AiChatSession,
  AiContestFilterResult,
  AiDefenseJudgeRound,
  AiDefenseScorecard,
  AiDefenseStreamEvent,
  AiDefenseStreamEventType,
  AiProjectChatResult,
  AiTopicProposalResult,
  ApiResponse,
  AuthMeResult,
  ChatMessage,
  Contest,
  Project,
  ProjectPayload,
  Resource,
  TopicProposalItem,
  WorkspaceAiMode,
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

function normalizeRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function normalizeQueryParam(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  if (value === null || value === undefined)
    return ''
  return String(value).trim()
}

function workspaceDetailPath(workspaceId: string): string {
  return `/workspace/${workspaceId}`
}

interface WorkspaceQuickSwitchProject {
  projectId: string
  workspaceId: string
  title: string
  workspaceName: string
  updatedAt: string
}

function parseTimestamp(value: string): number {
  const time = new Date(value).getTime()
  if (Number.isNaN(time))
    return 0
  return time
}

function sortByUpdatedAtDesc(items: Project[]): Project[] {
  return [...items].sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt))
}

const routeWorkspaceId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  return normalizeRouteParam(params.workspaceId)
})

const highlightedProjectId = computed(() => normalizeQueryParam(route.query.projectId))

const naturalQuery = ref('')
const major = ref('')
const discipline = ref('')
const level = ref('')
const trackType = ref('')
const topK = ref(6)

const contests = ref<Contest[]>([])
const resources = ref<Resource[]>([])
const projects = ref<Project[]>([])
const allProjects = ref<Project[]>([])
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
const aiMode = ref<WorkspaceAiMode>('project_chat')
const topicProposals = ref<TopicProposalItem[]>([])
const defenseRounds = ref<AiDefenseJudgeRound[]>([])
const defenseScorecard = ref<AiDefenseScorecard | null>(null)

function resetChatStateWithGreeting() {
  chatMessages.value = [defaultAssistantGreeting()]
  chatDraft.value = null
  chatMissingFields.value = []
  topicProposals.value = []
  defenseRounds.value = []
  defenseScorecard.value = null
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
const isAdminView = computed(() => Boolean(me.value?.user.isPlatformAdmin))
const workspaceNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const item of workspaceOptions.value)
    map.set(item.workspace.id, item.workspace.name)
  return map
})
const currentWorkspace = computed(() => {
  return workspaceOptions.value.find(item => item.workspace.id === activeWorkspaceId.value) || null
})
const quickSwitchSourceProjects = computed(() => {
  if (allProjects.value.length > 0)
    return allProjects.value
  return projects.value
})
const sortedQuickSwitchProjects = computed(() => sortByUpdatedAtDesc(quickSwitchSourceProjects.value))

function toQuickSwitchProject(project: Project): WorkspaceQuickSwitchProject {
  return {
    projectId: project.id,
    workspaceId: project.workspaceId,
    title: project.title || '未命名项目',
    workspaceName: workspaceNameMap.value.get(project.workspaceId) || project.workspaceId,
    updatedAt: project.updatedAt,
  }
}

const myQuickSwitchProjects = computed<WorkspaceQuickSwitchProject[]>(() => {
  const userId = me.value?.user.id || ''
  if (!userId)
    return []
  return sortedQuickSwitchProjects.value
    .filter(item => item.ownerUserId === userId)
    .slice(0, 8)
    .map(toQuickSwitchProject)
})

const recentQuickSwitchProjects = computed<WorkspaceQuickSwitchProject[]>(() => {
  return sortedQuickSwitchProjects.value
    .slice(0, 8)
    .map(toQuickSwitchProject)
})

const activeProject = computed(() => {
  if (highlightedProjectId.value) {
    const matched = projects.value.find(item => item.id === highlightedProjectId.value)
    if (matched)
      return matched
  }
  return projects.value[0] || null
})

const headerProjectName = computed(() => {
  if (activeProject.value?.title)
    return activeProject.value.title
  if (formState.title.trim())
    return formState.title.trim()
  return currentWorkspace.value?.workspace.name || '未命名项目'
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
    const targetWorkspaceId = routeWorkspaceId.value

    if (!targetWorkspaceId) {
      await navigateTo('/workspace', { replace: true })
      return false
    }

    const hasCurrent = response.data.workspaces.some(item => item.workspace.id === targetWorkspaceId)
    if (!hasCurrent) {
      await navigateTo({
        path: '/workspace',
        query: { deniedWorkspaceId: targetWorkspaceId },
      }, { replace: true })
      return false
    }

    activeWorkspaceId.value = targetWorkspaceId

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

async function loadQuickSwitchProjects() {
  try {
    const response = await $fetch<ApiResponse<Project[]>>(endpoint('/projects'))
    allProjects.value = response.data
  }
  catch {
    allProjects.value = []
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

    chatDraft.value = null
    chatMissingFields.value = []
    topicProposals.value = []
    defenseRounds.value = []
    defenseScorecard.value = null
    chatMessages.value = restoredMessages.length > 0
      ? restoredMessages
      : [defaultAssistantGreeting()]
  }
  catch {
    resetChatStateWithGreeting()
  }
}

function buildSessionTitleByMode(): string {
  const contestName = selectedContest.value?.name || '未选择竞赛'
  const trackName = selectedTrack.value?.name || '未选择赛道'

  if (aiMode.value === 'topic_proposal')
    return `选题助手 · ${contestName} · ${trackName}`
  if (aiMode.value === 'defense')
    return `答辩模拟 · ${contestName} · ${trackName}`
  return `${contestName} · ${trackName}`
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
          title: preferredTitle || buildSessionTitleByMode(),
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
  const modeTitle = aiMode.value === 'topic_proposal'
    ? '新建选题会话'
    : aiMode.value === 'defense'
      ? '新建答辩会话'
      : '新建 AI 对话'
  const createdId = await createChatSession(modeTitle)
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

function topicProposalToDraft(item: TopicProposalItem): ProjectPayload {
  return {
    title: item.title,
    contestId: selectedContestId.value,
    trackId: selectedTrackId.value,
    problemStatement: item.reason,
    innovationPoints: item.innovationPoints,
    techRouteSteps: item.techRouteSteps,
    scoringMapping: item.scoringMapping,
    risks: item.risks,
    deliverables: ['方案书', '演示 PPT', '答辩问题清单'],
    summary: item.reason,
  }
}

function applyTopicProposal(item: TopicProposalItem) {
  fillFormWithDraft(topicProposalToDraft(item))
}

function parseSseBlock(rawBlock: string): { eventType: string, dataText: string } | null {
  const block = rawBlock.trim()
  if (!block)
    return null

  const lines = block.split('\n').map(line => line.replace(/\r$/, ''))
  let eventType = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:'))
      eventType = line.slice(6).trim()
    else if (line.startsWith('data:'))
      dataLines.push(line.slice(5).trimStart())
  }

  return {
    eventType,
    dataText: dataLines.join('\n'),
  }
}

function toJsonPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

async function sendProjectChatMessage(pendingMessages: ChatMessage[]) {
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
  topicProposals.value = []
  defenseRounds.value = []
  defenseScorecard.value = null
  activeChatSessionId.value = String(response.data.sessionId || activeChatSessionId.value)
  await loadChatSessions(activeChatSessionId.value)
  statusLine.value = response.meta.fallbackUsed
    ? '聊天结果来自兜底策略，可继续补充需求后重试。'
    : '聊天已生成结构化草案，可一键回填表单。'
}

async function sendTopicProposalMessage(pendingMessages: ChatMessage[]) {
  const response = await $fetch<ApiResponse<AiTopicProposalResult>>(endpoint('/ai/topic-proposal'), {
    method: 'POST',
    body: {
      workspaceId: activeWorkspaceId.value,
      sessionId: activeChatSessionId.value,
      messages: pendingMessages,
      topK: 3,
      context: {
        workspaceId: activeWorkspaceId.value,
        contestId: selectedContestId.value,
        trackId: selectedTrackId.value,
        major: major.value,
      },
    },
  })

  chatMessages.value = [...pendingMessages, { role: 'assistant', content: response.data.assistantReply }]
  topicProposals.value = response.data.proposals || []
  chatMissingFields.value = response.data.missingFields
  chatDraft.value = null
  defenseRounds.value = []
  defenseScorecard.value = null
  activeChatSessionId.value = String(response.data.sessionId || activeChatSessionId.value)
  await loadChatSessions(activeChatSessionId.value)
  statusLine.value = response.meta.fallbackUsed
    ? '选题结果来自兜底策略，建议继续补充上下文。'
    : `已生成 ${topicProposals.value.length} 个候选命题，可一键回填草案。`
}

async function sendDefenseMessage(pendingMessages: ChatMessage[]) {
  chatDraft.value = null
  topicProposals.value = []
  chatMissingFields.value = []
  defenseRounds.value = []
  defenseScorecard.value = null
  let assistantText = ''

  const response = await fetch(endpoint('/ai/defense/stream'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workspaceId: activeWorkspaceId.value,
      sessionId: activeChatSessionId.value,
      messages: pendingMessages,
      context: {
        workspaceId: activeWorkspaceId.value,
        contestId: selectedContestId.value,
        trackId: selectedTrackId.value,
        major: major.value,
      },
    }),
  })

  if (!response.ok) {
    const fallbackMessage = `请求失败：HTTP ${response.status}`
    const data = await response.json().catch(() => null) as ApiResponse<null> | null
    throw new Error(String(data?.message || fallbackMessage))
  }

  if (!response.body)
    throw new Error('未收到可读取的流式响应。')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const separatorIndex = buffer.indexOf('\n\n')
      if (separatorIndex < 0)
        break

      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const parsed = parseSseBlock(block)
      if (!parsed)
        continue

      const payload = parsed.dataText
        ? JSON.parse(parsed.dataText) as AiDefenseStreamEvent
        : null
      const eventType = (payload?.event || parsed.eventType) as AiDefenseStreamEventType
      const data = toJsonPayload(payload?.data)

      if (eventType === 'progress') {
        statusLine.value = String(data.message || '答辩模拟处理中...')
        if (data.sessionId)
          activeChatSessionId.value = String(data.sessionId)
        continue
      }
      if (eventType === 'judge') {
        const round = data.round as AiDefenseJudgeRound | undefined
        if (round)
          defenseRounds.value = [...defenseRounds.value, round]
        continue
      }
      if (eventType === 'score') {
        const scorecard = data.scorecard as AiDefenseScorecard | undefined
        if (scorecard)
          defenseScorecard.value = scorecard
        continue
      }
      if (eventType === 'delta') {
        assistantText += String(data.text || '')
        chatMessages.value = [...pendingMessages, { role: 'assistant', content: assistantText }]
        continue
      }
      if (eventType === 'done') {
        const result = toJsonPayload(data.result)
        assistantText = String(result.assistantReply || assistantText)
        chatMessages.value = [...pendingMessages, { role: 'assistant', content: assistantText }]
        if (Array.isArray(result.rounds))
          defenseRounds.value = result.rounds as AiDefenseJudgeRound[]
        const scorecard = result.scorecard as AiDefenseScorecard | undefined
        if (scorecard)
          defenseScorecard.value = scorecard
        if (Array.isArray(result.missingFields))
          chatMissingFields.value = result.missingFields.map(item => String(item))
        if (result.sessionId)
          activeChatSessionId.value = String(result.sessionId)
        statusLine.value = '模拟答辩完成，可继续追问下一轮。'
        continue
      }
      if (eventType === 'error')
        throw new Error(String(data.message || '模拟答辩失败。'))
    }
  }

  buffer += decoder.decode()
  const tail = parseSseBlock(buffer)
  if (tail?.dataText) {
    const payload = JSON.parse(tail.dataText) as AiDefenseStreamEvent
    if (payload.event === 'error')
      throw new Error(String(toJsonPayload(payload.data).message || '模拟答辩失败。'))
  }
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
    if (aiMode.value === 'topic_proposal')
      await sendTopicProposalMessage(pendingMessages)
    else if (aiMode.value === 'defense')
      await sendDefenseMessage(pendingMessages)
    else
      await sendProjectChatMessage(pendingMessages)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '聊天接口调用失败。'
    chatMessages.value = [...pendingMessages, { role: 'assistant', content: message || '聊天服务暂不可用，请稍后重试。' }]
    statusLine.value = message || '聊天接口调用失败。'
  }
  finally {
    chatLoading.value = false
    await loadChatSessions(activeChatSessionId.value)
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
      contestIds: selectedContestId.value ? [selectedContestId.value] : [],
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
    await Promise.all([loadProjects(), loadQuickSwitchProjects()])
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

async function switchProjectFromHeader(payload: { projectId: string, workspaceId: string }) {
  const target = quickSwitchSourceProjects.value.find(item => item.id === payload.projectId)
  if (target)
    statusLine.value = `已定位项目：${target.title}`

  await navigateTo({
    path: workspaceDetailPath(payload.workspaceId),
    query: {
      projectId: payload.projectId,
    },
  })
}

onMounted(async () => {
  const ok = await loadAuthContext()
  if (!ok)
    return

  await Promise.all([loadContests(), loadResources(), loadProjects(), loadQuickSwitchProjects(), loadChatSessions()])
  syncFormContestTrack()
  if (highlightedProjectId.value) {
    const target = projects.value.find(item => item.id === highlightedProjectId.value)
    if (target)
      statusLine.value = `已定位项目：${target.title}`
  }
})

watch(activeWorkspaceId, async (value, previous) => {
  if (!value || value === previous)
    return

  if (value !== routeWorkspaceId.value)
    await navigateTo(workspaceDetailPath(value), { replace: true })
})

watch(routeWorkspaceId, async (value, previous) => {
  if (!value || value === previous)
    return

  if (!me.value) {
    activeWorkspaceId.value = value
    return
  }

  const hasCurrent = me.value.workspaces.some(item => item.workspace.id === value)
  if (!hasCurrent) {
    await navigateTo({
      path: '/workspace',
      query: { deniedWorkspaceId: value },
    }, { replace: true })
    return
  }

  if (activeWorkspaceId.value !== value)
    activeWorkspaceId.value = value

  statusLine.value = `已切换到空间：${currentWorkspace.value?.workspace.name || value}`
  await Promise.all([loadProjects(), loadQuickSwitchProjects(), loadChatSessions()])
  if (highlightedProjectId.value) {
    const target = projects.value.find(item => item.id === highlightedProjectId.value)
    if (target)
      statusLine.value = `已定位项目：${target.title}`
  }
})
</script>

<template>
  <div class="workspace-shell text-slate-800 bg-white flex flex-col h-full min-h-0 overflow-hidden">
    <WorkspaceHeader
      v-model="headerSearch"
      :project-name="headerProjectName"
      :contest-name="selectedContest?.name || '未选择竞赛'"
      :track-name="selectedTrack?.name || '未选择赛道'"
      :my-projects="myQuickSwitchProjects"
      :recent-projects="recentQuickSwitchProjects"
      @quick-switch-project="switchProjectFromHeader"
    />

    <main class="flex flex-1 flex-col min-h-0 overflow-hidden xl:flex-row">
      <WorkspaceLeftSidebar
        v-model:natural-query="naturalQuery"
        v-model:major="major"
        v-model:discipline="discipline"
        v-model:level="level"
        v-model:track-type="trackType"
        v-model:top-k="topK"
        v-model:selected-contest-id="selectedContestId"
        :contests="filteredContests"
        :ai-reasoning="aiReasoning"
        :normalized-info="normalizedInfo"
        :status-line="statusLine"
        :list-loading="listLoading"
        :ai-filtering="aiFiltering"
        :is-admin-view="isAdminView"
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
        v-model:ai-mode="aiMode"
        :chat-sessions="chatSessions"
        :active-chat-session-id="activeChatSessionId"
        :chat-sessions-loading="chatSessionsLoading"
        :chat-messages="chatMessages"
        :chat-loading="chatLoading"
        :chat-draft="chatDraft"
        :chat-missing-fields="chatMissingFields"
        :topic-proposals="topicProposals"
        :defense-rounds="defenseRounds"
        :defense-scorecard="defenseScorecard"
        :normalized-info="normalizedInfo"
        :selected-contest="selectedContest"
        :selected-track="selectedTrack"
        :selected-resources="selectedResources"
        :form-state="formState"
        :form-submitting="formSubmitting"
        :projects="projects"
        :is-admin-view="isAdminView"
        @update:form-state="Object.assign(formState, $event)"
        @send-chat="sendChatMessage"
        @switch-chat-session="switchChatSession"
        @create-chat-session="startNewChatSession"
        @fill-form="fillFormWithDraft"
        @apply-topic-proposal="applyTopicProposal"
        @submit-project="submitProject"
        @open-project="openProject"
      />
    </main>

    <WorkspaceStatusBar
      :status-line="statusLine"
      :loading="resourcesLoading"
      :ai-ready="!aiBusy"
      ai-model-label="由后端配置"
      :token-balance="tokenBalance"
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
