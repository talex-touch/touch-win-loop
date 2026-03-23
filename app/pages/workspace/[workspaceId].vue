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
  ProjectContestAdaptation,
  ProjectOutlineSnapshot,
  ProjectPayload,
  ProjectSettingsDraft,
  ProjectSettingsDraftPayload,
  ProjectSettingsSnapshot,
  Resource,
  TopicProposalItem,
  WorkspaceAiMode,
} from '~~/shared/types/domain'
import type {
  MappingTone,
  WorkspaceFormState,
  WorkspaceKeyword,
  WorkspaceMappingRow,
  WorkspaceProjectAdaptationForm,
  WorkspaceProjectCommonForm,
  WorkspaceProjectContestBindingForm,
  WorkspaceProjectSaveState,
  WorkspaceStatusToneMeta,
} from '~/types/workspace'
import {
  formatFileSize,
  isProjectResourceUploadFileSupported,
  PROJECT_RESOURCE_STORAGE_LIMIT_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH,
} from '~~/shared/constants/project-resource-upload'

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
const authApiFetch = useAuthApiFetch()
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

function createEmptyProjectCommonForm(): WorkspaceProjectCommonForm {
  return {
    title: '',
    summary: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
  }
}

function createProjectCommonFormFromProject(project: Project | null): WorkspaceProjectCommonForm {
  if (!project)
    return createEmptyProjectCommonForm()

  return {
    title: project.title || '',
    summary: project.summary || '',
    problemStatement: project.problemStatement || '',
    innovationPointsText: arrayToLines(project.innovationPoints),
    techRouteStepsText: arrayToLines(project.techRouteSteps),
    scoringMappingText: arrayToLines(project.scoringMapping),
    risksText: arrayToLines(project.risks),
    deliverablesText: arrayToLines(project.deliverables),
  }
}

function cloneProjectCommonForm(value: WorkspaceProjectCommonForm): WorkspaceProjectCommonForm {
  return {
    title: value.title,
    summary: value.summary,
    problemStatement: value.problemStatement,
    innovationPointsText: value.innovationPointsText,
    techRouteStepsText: value.techRouteStepsText,
    scoringMappingText: value.scoringMappingText,
    risksText: value.risksText,
    deliverablesText: value.deliverablesText,
  }
}

function createEmptyProjectAdaptationForm(contestId = '', trackId = ''): WorkspaceProjectAdaptationForm {
  return {
    contestId,
    trackId,
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
    summary: '',
  }
}

function createProjectAdaptationFormFromSnapshot(
  adaptation: ProjectContestAdaptation | null,
  project: Project | null,
  contestId: string,
  trackId: string,
): WorkspaceProjectAdaptationForm {
  if (!adaptation) {
    return {
      contestId,
      trackId,
      problemStatement: project?.problemStatement || '',
      innovationPointsText: arrayToLines(project?.innovationPoints),
      techRouteStepsText: arrayToLines(project?.techRouteSteps),
      scoringMappingText: arrayToLines(project?.scoringMapping),
      risksText: arrayToLines(project?.risks),
      deliverablesText: arrayToLines(project?.deliverables),
      summary: project?.summary || '',
    }
  }

  return {
    contestId,
    trackId,
    problemStatement: adaptation.problemStatement || '',
    innovationPointsText: arrayToLines(adaptation.innovationPoints),
    techRouteStepsText: arrayToLines(adaptation.techRouteSteps),
    scoringMappingText: arrayToLines(adaptation.scoringMapping),
    risksText: arrayToLines(adaptation.risks),
    deliverablesText: arrayToLines(adaptation.deliverables),
    summary: adaptation.summary || '',
  }
}

function cloneProjectAdaptationForm(value: WorkspaceProjectAdaptationForm): WorkspaceProjectAdaptationForm {
  return {
    contestId: value.contestId,
    trackId: value.trackId,
    problemStatement: value.problemStatement,
    innovationPointsText: value.innovationPointsText,
    techRouteStepsText: value.techRouteStepsText,
    scoringMappingText: value.scoringMappingText,
    risksText: value.risksText,
    deliverablesText: value.deliverablesText,
    summary: value.summary,
  }
}

function cloneProjectContestBindings(value: WorkspaceProjectContestBindingForm[]): WorkspaceProjectContestBindingForm[] {
  return value.map(item => ({
    contestId: item.contestId,
    trackId: item.trackId,
    sortOrder: item.sortOrder,
  }))
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

function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const maybeData = (error as { data?: { message?: string } }).data
    const message = String(maybeData?.message || '').trim()
    if (message)
      return message
  }

  if (error instanceof Error && error.message.trim())
    return error.message.trim()

  return fallback
}

function parseFileSizeFromResource(resource: Resource): number {
  if (String(resource.sourceType || '').trim() !== 'project_upload')
    return 0

  const metadata = resource.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return 0

  const rawSize = (metadata as Record<string, unknown>).fileSize
  const size = Number(rawSize)
  if (!Number.isFinite(size) || size <= 0)
    return 0
  return size
}

function validateUploadFiles(files: File[], usedBytes: number): string | null {
  if (!files.length)
    return '未检测到可上传文件。'

  if (files.length > PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH) {
    return `单次最多上传 ${PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH} 个文件。`
  }

  const invalidTypeFiles = files
    .filter(file => !isProjectResourceUploadFileSupported(file.name))
    .slice(0, 3)
    .map(file => file.name)

  if (invalidTypeFiles.length) {
    return `文件格式不支持：${invalidTypeFiles.join('、')}。`
  }

  const oversizeFile = files.find(file => file.size > PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)
  if (oversizeFile) {
    return `文件过大：${oversizeFile.name}，单文件上限 ${formatFileSize(PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)}。`
  }

  const incomingBytes = files.reduce((sum, file) => sum + Math.max(0, Number(file.size || 0)), 0)
  if (usedBytes + incomingBytes > PROJECT_RESOURCE_STORAGE_LIMIT_BYTES) {
    return `当前项目容量超限：上限 ${formatFileSize(PROJECT_RESOURCE_STORAGE_LIMIT_BYTES)}。`
  }

  return null
}

function resolveApiStatusCode(error: unknown): number {
  if (!error || typeof error !== 'object')
    return 0

  const statusCode = Number((error as { statusCode?: number }).statusCode || 0)
  if (Number.isFinite(statusCode) && statusCode > 0)
    return statusCode

  const responseStatus = Number((error as { response?: { status?: number } }).response?.status || 0)
  if (Number.isFinite(responseStatus) && responseStatus > 0)
    return responseStatus

  const dataStatus = Number((error as { data?: { statusCode?: number } }).data?.statusCode || 0)
  if (Number.isFinite(dataStatus) && dataStatus > 0)
    return dataStatus

  return 0
}

interface WorkspaceQuickSwitchProject {
  projectId: string
  workspaceId: string
  title: string
  workspaceName: string
  updatedAt: string
}

type WorkspaceProjectSettingsDraftCache = ProjectSettingsDraftPayload

const PROJECT_SETTINGS_DRAFT_PREFIX = 'workspace.projectSettingsDraft'
const PROJECT_SETTINGS_DRAFT_DEVICE_PREFIX = 'workspace.projectSettingsDraftDevice'

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
const contestCatalog = ref<Contest[]>([])
const resources = ref<Resource[]>([])
const recycleResources = ref<Resource[]>([])
const resourceLibrary = ref<Resource[]>([])
const projectOutlineSnapshot = ref<ProjectOutlineSnapshot | null>(null)
const projects = ref<Project[]>([])
const allProjects = ref<Project[]>([])
const me = ref<AuthMeResult | null>(null)
const activeWorkspaceId = ref('')
const selectedContestId = ref('')
const selectedTrackId = ref('')

const openSettingsSignal = ref(0)
const openFlowSignal = ref(0)
const headerSearch = ref('')
const aiReasoning = ref('')
const normalizedInfo = ref('')
const statusLine = ref('')
const projectSettingsLoading = ref(false)
const projectSettingsSaveState = ref<WorkspaceProjectSaveState>('idle')
const projectSettingsCommon = reactive<WorkspaceProjectCommonForm>(createEmptyProjectCommonForm())
const projectSettingsBindings = ref<WorkspaceProjectContestBindingForm[]>([])
const projectSettingsCurrentContestId = ref('')
const projectSettingsAdaptation = reactive<WorkspaceProjectAdaptationForm>(createEmptyProjectAdaptationForm())
const projectSettingsAdaptationDrafts = ref<Record<string, WorkspaceProjectAdaptationForm>>({})
const projectSettingsHydrating = ref(false)
const projectSettingsCommonDirty = ref(false)
const projectSettingsBindingsDirty = ref(false)
const projectSettingsDirtyAdaptationContestIds = ref<string[]>([])
const projectSettingsDraftServerRevision = ref<number | null>(null)
const projectSettingsDraftDeviceId = ref('')

let projectSettingsDraftTimer: ReturnType<typeof setTimeout> | null = null
let projectSettingsDraftPersistSeq = 0
let projectOutlineGenerateTimer: ReturnType<typeof setTimeout> | null = null

const listLoading = ref(false)
const aiFiltering = ref(false)
const chatLoading = ref(false)
const chatSessionsLoading = ref(false)
const formSubmitting = ref(false)
const resourcesLoading = ref(false)
const resourceMutating = ref(false)

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

function getProjectSettingsDraftStorageKey(projectId: string): string {
  if (!import.meta.client)
    return ''
  const normalizedProjectId = String(projectId || '').trim()
  const userId = String(me.value?.user.id || '').trim()
  if (!normalizedProjectId || !userId)
    return ''
  return `${PROJECT_SETTINGS_DRAFT_PREFIX}.${userId}.${normalizedProjectId}`
}

function getProjectSettingsDraftDeviceStorageKey(): string {
  if (!import.meta.client)
    return ''
  const userId = String(me.value?.user.id || '').trim()
  if (!userId)
    return ''
  return `${PROJECT_SETTINGS_DRAFT_DEVICE_PREFIX}.${userId}`
}

function generateProjectSettingsDraftDeviceId(): string {
  if (import.meta.client && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `draft-device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function ensureProjectSettingsDraftDeviceId(): string {
  if (!import.meta.client)
    return ''
  if (projectSettingsDraftDeviceId.value)
    return projectSettingsDraftDeviceId.value

  const key = getProjectSettingsDraftDeviceStorageKey()
  if (!key)
    return ''

  try {
    const cached = String(localStorage.getItem(key) || '').trim()
    if (cached) {
      projectSettingsDraftDeviceId.value = cached
      return cached
    }

    const created = generateProjectSettingsDraftDeviceId()
    localStorage.setItem(key, created)
    projectSettingsDraftDeviceId.value = created
    return created
  }
  catch {
    const fallback = generateProjectSettingsDraftDeviceId()
    projectSettingsDraftDeviceId.value = fallback
    return fallback
  }
}

function resetProjectSettingsDraftServerState() {
  projectSettingsDraftServerRevision.value = null
}

function readProjectSettingsDraftCache(projectId: string): WorkspaceProjectSettingsDraftCache | null {
  const key = getProjectSettingsDraftStorageKey(projectId)
  if (!key)
    return null

  try {
    const raw = localStorage.getItem(key)
    if (!raw)
      return null

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object')
      return null

    return normalizeProjectSettingsDraftCachePayload(parsed)
  }
  catch {
    return null
  }
}

function writeProjectSettingsDraftCache(projectId: string, payload: WorkspaceProjectSettingsDraftCache): boolean {
  const key = getProjectSettingsDraftStorageKey(projectId)
  if (!key)
    return false

  try {
    const normalized = normalizeProjectSettingsDraftCachePayload(payload)
    if (!normalized)
      return false
    localStorage.setItem(key, JSON.stringify(normalized))
    return true
  }
  catch {
    return false
  }
}

function clearProjectSettingsDraftCache(projectId: string): void {
  const key = getProjectSettingsDraftStorageKey(projectId)
  if (!key)
    return

  try {
    localStorage.removeItem(key)
  }
  catch {
    // ignore local cache cleanup errors
  }
}

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

const contestSource = computed(() => {
  return contestCatalog.value.length > 0 ? contestCatalog.value : contests.value
})
const selectedContest = computed(() => contestSource.value.find(contest => contest.id === selectedContestId.value) || null)
const selectedTrack = computed(() => selectedContest.value?.tracks.find(track => track.id === selectedTrackId.value) || null)
const contestMap = computed(() => {
  const map = new Map<string, Contest>()
  for (const contest of contestSource.value)
    map.set(contest.id, contest)
  return map
})
const projectSettingsBindingMap = computed(() => {
  const map = new Map<string, WorkspaceProjectContestBindingForm>()
  for (const binding of projectSettingsBindings.value)
    map.set(binding.contestId, binding)
  return map
})
const projectSettingsHasCurrentContest = computed(() => {
  const contestId = String(projectSettingsCurrentContestId.value || '').trim()
  return Boolean(contestId && projectSettingsBindingMap.value.has(contestId))
})
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

const activeProjectId = computed(() => activeProject.value?.id || '')

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

const selectedResources = computed(() => resources.value)
const projectOutlineItems = computed(() => projectOutlineSnapshot.value?.items || [])

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

const projectUploadStorageUsedBytes = computed(() => {
  return selectedResources.value.reduce((sum, resource) => sum + parseFileSizeFromResource(resource), 0)
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

function mergeProjectIntoCollections(project: Project) {
  const merge = (list: Project[]): Project[] => {
    const index = list.findIndex(item => item.id === project.id)
    if (index < 0)
      return list

    const next = [...list]
    next[index] = project
    return next
  }

  projects.value = merge(projects.value)
  allProjects.value = merge(allProjects.value)
}

function resetProjectSettingsState(project: Project | null) {
  projectSettingsHydrating.value = true
  try {
    Object.assign(projectSettingsCommon, createProjectCommonFormFromProject(project))
    projectSettingsBindings.value = []
    projectSettingsCurrentContestId.value = ''
    Object.assign(projectSettingsAdaptation, createEmptyProjectAdaptationForm())
    projectSettingsAdaptationDrafts.value = {}
    projectSettingsCommonDirty.value = false
    projectSettingsBindingsDirty.value = false
    projectSettingsDirtyAdaptationContestIds.value = []
    projectSettingsSaveState.value = 'idle'
    projectSettingsDraftPersistSeq += 1
    resetProjectSettingsDraftServerState()
  }
  finally {
    projectSettingsHydrating.value = false
  }
}

function clearProjectSettingsAutoTimers() {
  if (!projectSettingsDraftTimer)
    return
  clearTimeout(projectSettingsDraftTimer)
  projectSettingsDraftTimer = null
}

function markProjectSettingsAdaptationDirty(contestId: string) {
  const normalizedContestId = String(contestId || '').trim()
  if (!normalizedContestId)
    return
  if (projectSettingsDirtyAdaptationContestIds.value.includes(normalizedContestId))
    return
  projectSettingsDirtyAdaptationContestIds.value = [
    ...projectSettingsDirtyAdaptationContestIds.value,
    normalizedContestId,
  ]
}

function clearProjectSettingsAdaptationDirty(contestId: string) {
  const normalizedContestId = String(contestId || '').trim()
  if (!normalizedContestId)
    return
  projectSettingsDirtyAdaptationContestIds.value = projectSettingsDirtyAdaptationContestIds.value
    .filter(item => item !== normalizedContestId)
}

function isProjectSettingsAdaptationDirty(contestId: string): boolean {
  const normalizedContestId = String(contestId || '').trim()
  if (!normalizedContestId)
    return false
  return projectSettingsDirtyAdaptationContestIds.value.includes(normalizedContestId)
}

function upsertProjectSettingsAdaptationDraft(form: WorkspaceProjectAdaptationForm) {
  const contestId = String(form.contestId || '').trim()
  if (!contestId)
    return
  projectSettingsAdaptationDrafts.value = {
    ...projectSettingsAdaptationDrafts.value,
    [contestId]: cloneProjectAdaptationForm(form),
  }
}

function buildProjectSettingsCommonPatch() {
  return {
    title: projectSettingsCommon.title.trim(),
    summary: projectSettingsCommon.summary.trim(),
    problemStatement: projectSettingsCommon.problemStatement.trim(),
    innovationPoints: linesToArray(projectSettingsCommon.innovationPointsText),
    techRouteSteps: linesToArray(projectSettingsCommon.techRouteStepsText),
    scoringMapping: linesToArray(projectSettingsCommon.scoringMappingText),
    risks: linesToArray(projectSettingsCommon.risksText),
    deliverables: linesToArray(projectSettingsCommon.deliverablesText),
  }
}

function buildProjectSettingsAdaptationPatch(form: WorkspaceProjectAdaptationForm) {
  return {
    problemStatement: form.problemStatement.trim(),
    innovationPoints: linesToArray(form.innovationPointsText),
    techRouteSteps: linesToArray(form.techRouteStepsText),
    scoringMapping: linesToArray(form.scoringMappingText),
    risks: linesToArray(form.risksText),
    deliverables: linesToArray(form.deliverablesText),
    summary: form.summary.trim(),
  }
}

function normalizeProjectSettingsBindings(
  rows: WorkspaceProjectContestBindingForm[],
): WorkspaceProjectContestBindingForm[] {
  const uniqueContestIds = new Set<string>()
  const normalized: WorkspaceProjectContestBindingForm[] = []

  for (const row of rows) {
    const contestId = String(row.contestId || '').trim()
    if (!contestId || uniqueContestIds.has(contestId))
      continue

    const contest = contestMap.value.get(contestId)
    const rawTrackId = String(row.trackId || '').trim()
    const resolvedTrackId = contest
      ? (contest.tracks.find(track => track.id === rawTrackId)?.id || contest.tracks[0]?.id || '')
      : rawTrackId

    if (!resolvedTrackId)
      continue

    uniqueContestIds.add(contestId)
    normalized.push({
      contestId,
      trackId: resolvedTrackId,
      sortOrder: normalized.length,
    })
  }

  return normalized
}

function ensureProjectSettingsCurrentContest(preferredContestId = ''): string {
  const preferred = String(preferredContestId || '').trim()
  const current = String(projectSettingsCurrentContestId.value || '').trim()
  const selected = String(selectedContestId.value || '').trim()
  const available = projectSettingsBindings.value

  const fallbackContestId = (
    (preferred && available.some(item => item.contestId === preferred) && preferred)
    || (current && available.some(item => item.contestId === current) && current)
    || (selected && available.some(item => item.contestId === selected) && selected)
    || (available[0]?.contestId || '')
  )

  projectSettingsCurrentContestId.value = fallbackContestId
  return fallbackContestId
}

function syncProjectSettingsAdaptationFormByContest(contestId: string) {
  const normalizedContestId = String(contestId || '').trim()
  if (!normalizedContestId) {
    projectSettingsHydrating.value = true
    try {
      Object.assign(projectSettingsAdaptation, createEmptyProjectAdaptationForm())
    }
    finally {
      projectSettingsHydrating.value = false
    }
    return
  }

  const binding = projectSettingsBindingMap.value.get(normalizedContestId)
  if (!binding) {
    projectSettingsHydrating.value = true
    try {
      Object.assign(projectSettingsAdaptation, createEmptyProjectAdaptationForm())
    }
    finally {
      projectSettingsHydrating.value = false
    }
    return
  }

  const existing = projectSettingsAdaptationDrafts.value[normalizedContestId]
  const nextDraft = existing
    ? {
        ...existing,
        contestId: normalizedContestId,
        trackId: binding.trackId,
      }
    : createProjectAdaptationFormFromSnapshot(
        null,
        activeProject.value,
        normalizedContestId,
        binding.trackId,
      )

  upsertProjectSettingsAdaptationDraft(nextDraft)

  projectSettingsHydrating.value = true
  try {
    Object.assign(projectSettingsAdaptation, cloneProjectAdaptationForm(nextDraft))
  }
  finally {
    projectSettingsHydrating.value = false
  }
}

function applyProjectSettingsSnapshot(snapshot: ProjectSettingsSnapshot, preferredContestId = '') {
  projectSettingsHydrating.value = true
  try {
    mergeProjectIntoCollections(snapshot.project)
    Object.assign(projectSettingsCommon, createProjectCommonFormFromProject(snapshot.project))

    const normalizedBindings = normalizeProjectSettingsBindings(
      snapshot.contestBindings.map(item => ({
        contestId: item.contestId,
        trackId: item.trackId,
        sortOrder: item.sortOrder,
      })),
    )

    projectSettingsBindings.value = normalizedBindings

    const allowedContestIds = new Set(normalizedBindings.map(item => item.contestId))
    const keptDrafts: Record<string, WorkspaceProjectAdaptationForm> = {}
    for (const [contestId, draft] of Object.entries(projectSettingsAdaptationDrafts.value)) {
      if (allowedContestIds.has(contestId))
        keptDrafts[contestId] = draft
    }
    projectSettingsAdaptationDrafts.value = keptDrafts

    const adaptationContestId = String(snapshot.currentContestId || '').trim()
    if (adaptationContestId) {
      const adaptationBinding = projectSettingsBindingMap.value.get(adaptationContestId)
      const nextAdaptation = createProjectAdaptationFormFromSnapshot(
        snapshot.currentAdaptation,
        snapshot.project,
        adaptationContestId,
        adaptationBinding?.trackId || '',
      )
      upsertProjectSettingsAdaptationDraft(nextAdaptation)
    }

    const nextContestId = ensureProjectSettingsCurrentContest(preferredContestId || adaptationContestId)
    if (nextContestId)
      selectedContestId.value = nextContestId
    else if (!normalizedBindings.length)
      selectedContestId.value = ''

    const selectedBinding = projectSettingsBindingMap.value.get(nextContestId)
    if (selectedBinding)
      selectedTrackId.value = selectedBinding.trackId

    syncProjectSettingsAdaptationFormByContest(nextContestId)

    projectSettingsCommonDirty.value = false
    projectSettingsBindingsDirty.value = false
    if (nextContestId)
      clearProjectSettingsAdaptationDirty(nextContestId)
  }
  finally {
    projectSettingsHydrating.value = false
  }
}

function normalizeProjectSettingsDraftCachePayload(input: unknown): WorkspaceProjectSettingsDraftCache | null {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return null

  const source = input as Record<string, unknown>
  const normalizedBindings = normalizeProjectSettingsBindings(Array.isArray(source.bindings)
    ? source.bindings as WorkspaceProjectContestBindingForm[]
    : [])
  const allowedContestIds = new Set(normalizedBindings.map(item => item.contestId))
  const adaptationDrafts: Record<string, WorkspaceProjectAdaptationForm> = {}
  const adaptationSource = source.adaptationDrafts && typeof source.adaptationDrafts === 'object' && !Array.isArray(source.adaptationDrafts)
    ? source.adaptationDrafts as Record<string, unknown>
    : {}

  for (const [contestId, rawValue] of Object.entries(adaptationSource)) {
    const normalizedContestId = String(contestId || '').trim()
    if (!normalizedContestId || !allowedContestIds.has(normalizedContestId))
      continue

    const record = rawValue && typeof rawValue === 'object'
      ? rawValue as Record<string, unknown>
      : {}
    const binding = normalizedBindings.find(item => item.contestId === normalizedContestId)
    adaptationDrafts[normalizedContestId] = cloneProjectAdaptationForm({
      contestId: normalizedContestId,
      trackId: binding?.trackId || String(record.trackId || '').trim(),
      problemStatement: String(record.problemStatement || ''),
      innovationPointsText: String(record.innovationPointsText || ''),
      techRouteStepsText: String(record.techRouteStepsText || ''),
      scoringMappingText: String(record.scoringMappingText || ''),
      risksText: String(record.risksText || ''),
      deliverablesText: String(record.deliverablesText || ''),
      summary: String(record.summary || ''),
    })
  }

  const commonSource = source.common && typeof source.common === 'object' && !Array.isArray(source.common)
    ? source.common as Record<string, unknown>
    : {}
  const currentContestIdRaw = String(source.currentContestId || '').trim()
  const currentContestId = currentContestIdRaw && allowedContestIds.has(currentContestIdRaw)
    ? currentContestIdRaw
    : (normalizedBindings[0]?.contestId || '')

  return {
    updatedAt: String(source.updatedAt || '').trim() || new Date().toISOString(),
    deviceId: String(source.deviceId || '').trim() || undefined,
    common: {
      title: String(commonSource.title || ''),
      summary: String(commonSource.summary || ''),
      problemStatement: String(commonSource.problemStatement || ''),
      innovationPointsText: String(commonSource.innovationPointsText || ''),
      techRouteStepsText: String(commonSource.techRouteStepsText || ''),
      scoringMappingText: String(commonSource.scoringMappingText || ''),
      risksText: String(commonSource.risksText || ''),
      deliverablesText: String(commonSource.deliverablesText || ''),
    },
    bindings: normalizedBindings,
    currentContestId,
    adaptationDrafts,
  }
}

function serializeProjectSettingsDraftCachePayload(payload: WorkspaceProjectSettingsDraftCache): string {
  const adaptationEntries = Object.keys(payload.adaptationDrafts || {})
    .sort((left, right) => left.localeCompare(right))
    .map((contestId) => {
      const item = payload.adaptationDrafts[contestId]
      if (!item) {
        return [
          contestId,
          createEmptyProjectAdaptationForm(contestId, ''),
        ] as const
      }
      return [
        contestId,
        {
          contestId: item.contestId,
          trackId: item.trackId,
          problemStatement: item.problemStatement,
          innovationPointsText: item.innovationPointsText,
          techRouteStepsText: item.techRouteStepsText,
          scoringMappingText: item.scoringMappingText,
          risksText: item.risksText,
          deliverablesText: item.deliverablesText,
          summary: item.summary,
        },
      ]
    })

  const comparable = {
    common: payload.common,
    bindings: [...payload.bindings].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder)
        return left.sortOrder - right.sortOrder
      return left.contestId.localeCompare(right.contestId)
    }),
    currentContestId: payload.currentContestId,
    adaptationDrafts: Object.fromEntries(adaptationEntries),
  }

  return JSON.stringify(comparable)
}

function isProjectSettingsDraftCacheEqual(
  left: WorkspaceProjectSettingsDraftCache,
  right: WorkspaceProjectSettingsDraftCache,
): boolean {
  return serializeProjectSettingsDraftCachePayload(left) === serializeProjectSettingsDraftCachePayload(right)
}

function buildProjectSettingsDraftCachePayload(): WorkspaceProjectSettingsDraftCache {
  const currentContestId = String(projectSettingsCurrentContestId.value || selectedContestId.value || '').trim()
  const nextAdaptationDrafts = { ...projectSettingsAdaptationDrafts.value }
  if (currentContestId) {
    nextAdaptationDrafts[currentContestId] = cloneProjectAdaptationForm({
      ...projectSettingsAdaptation,
      contestId: currentContestId,
      trackId: projectSettingsBindingMap.value.get(currentContestId)?.trackId || projectSettingsAdaptation.trackId,
    })
  }

  return {
    updatedAt: new Date().toISOString(),
    deviceId: ensureProjectSettingsDraftDeviceId() || undefined,
    common: cloneProjectCommonForm(projectSettingsCommon),
    bindings: cloneProjectContestBindings(projectSettingsBindings.value),
    currentContestId,
    adaptationDrafts: nextAdaptationDrafts,
  }
}

function applyProjectSettingsDraftCachePayload(
  payload: WorkspaceProjectSettingsDraftCache,
  saveState: WorkspaceProjectSaveState,
): boolean {
  const draft = normalizeProjectSettingsDraftCachePayload(payload)
  if (!draft)
    return false

  const hasCommonDraft = Object.values(draft.common).some(value => String(value || '').trim().length > 0)
  const normalizedBindings = normalizeProjectSettingsBindings(Array.isArray(draft.bindings) ? draft.bindings : [])
  const allowedContestIds = new Set(normalizedBindings.map(item => item.contestId))
  const nextAdaptationDrafts: Record<string, WorkspaceProjectAdaptationForm> = {}

  for (const [contestId, form] of Object.entries(draft.adaptationDrafts || {})) {
    if (!allowedContestIds.has(contestId))
      continue
    const binding = normalizedBindings.find(item => item.contestId === contestId)
    nextAdaptationDrafts[contestId] = cloneProjectAdaptationForm({
      contestId,
      trackId: binding?.trackId || form.trackId,
      problemStatement: String(form.problemStatement || ''),
      innovationPointsText: String(form.innovationPointsText || ''),
      techRouteStepsText: String(form.techRouteStepsText || ''),
      scoringMappingText: String(form.scoringMappingText || ''),
      risksText: String(form.risksText || ''),
      deliverablesText: String(form.deliverablesText || ''),
      summary: String(form.summary || ''),
    })
  }

  const hasDraftContent = hasCommonDraft || normalizedBindings.length > 0 || Object.keys(nextAdaptationDrafts).length > 0
  if (!hasDraftContent)
    return false

  projectSettingsHydrating.value = true
  try {
    Object.assign(projectSettingsCommon, createEmptyProjectCommonForm(), draft.common || {})

    if (normalizedBindings.length > 0)
      projectSettingsBindings.value = normalizedBindings

    projectSettingsAdaptationDrafts.value = nextAdaptationDrafts

    const preferredContestId = String(draft.currentContestId || '').trim()
    const nextContestId = ensureProjectSettingsCurrentContest(preferredContestId)
    if (nextContestId)
      selectedContestId.value = nextContestId

    const selectedBinding = projectSettingsBindingMap.value.get(nextContestId)
    if (selectedBinding)
      selectedTrackId.value = selectedBinding.trackId

    syncProjectSettingsAdaptationFormByContest(nextContestId)

    projectSettingsCommonDirty.value = hasCommonDraft
    projectSettingsBindingsDirty.value = normalizedBindings.length > 0
    projectSettingsDirtyAdaptationContestIds.value = Object.keys(nextAdaptationDrafts)
    projectSettingsSaveState.value = saveState
  }
  finally {
    projectSettingsHydrating.value = false
  }
  return true
}

function applyProjectSettingsDraftServerRecord(record: ProjectSettingsDraft | null): WorkspaceProjectSettingsDraftCache | null {
  if (!record) {
    resetProjectSettingsDraftServerState()
    return null
  }

  projectSettingsDraftServerRevision.value = Number(record.revision || 0) || null

  const normalized = normalizeProjectSettingsDraftCachePayload(record.payload)
  if (!normalized)
    return null

  return {
    ...normalized,
    updatedAt: normalized.updatedAt || String(record.updatedAt || ''),
    deviceId: normalized.deviceId || String(record.deviceId || ''),
  }
}

async function fetchProjectSettingsDraftFromServer(projectId: string): Promise<WorkspaceProjectSettingsDraftCache | null> {
  const response = await $fetch<ApiResponse<ProjectSettingsDraft | null>>(endpoint(`/projects/${projectId}/settings-draft`))
  return applyProjectSettingsDraftServerRecord(response.data)
}

function pickProjectSettingsDraftForHydration(
  localDraft: WorkspaceProjectSettingsDraftCache | null,
  serverDraft: WorkspaceProjectSettingsDraftCache | null,
): { draft: WorkspaceProjectSettingsDraftCache | null, source: 'local' | 'server' | '', hasConflict: boolean } {
  if (!localDraft && !serverDraft)
    return { draft: null, source: '', hasConflict: false }
  if (localDraft && !serverDraft)
    return { draft: localDraft, source: 'local', hasConflict: false }
  if (!localDraft && serverDraft)
    return { draft: serverDraft, source: 'server', hasConflict: false }

  const left = localDraft!
  const right = serverDraft!
  const localTime = parseTimestamp(left.updatedAt)
  const serverTime = parseTimestamp(right.updatedAt)
  const source: 'local' | 'server' = localTime >= serverTime ? 'local' : 'server'
  const draft = source === 'local' ? left : right
  const samePayload = isProjectSettingsDraftCacheEqual(left, right)
  const localDeviceId = String(left.deviceId || '').trim()
  const serverDeviceId = String(right.deviceId || '').trim()
  const hasConflict = !samePayload && (
    (localDeviceId && serverDeviceId && localDeviceId !== serverDeviceId)
    || (localTime > 0 && serverTime > 0 && localTime !== serverTime)
  )

  return {
    draft,
    source,
    hasConflict,
  }
}

async function loadProjectSettings(preferredContestId = '') {
  if (!activeProjectId.value) {
    resetProjectSettingsState(null)
    return
  }

  const activeId = activeProjectId.value
  projectSettingsLoading.value = true

  try {
    const response = await $fetch<ApiResponse<ProjectSettingsSnapshot>>(
      endpoint(`/projects/${activeId}/settings`),
      {
        query: preferredContestId
          ? { contestId: preferredContestId }
          : undefined,
      },
    )

    if (activeProjectId.value !== activeId)
      return

    applyProjectSettingsSnapshot(response.data, preferredContestId)

    const localDraft = readProjectSettingsDraftCache(activeId)
    let serverDraft: WorkspaceProjectSettingsDraftCache | null = null
    try {
      serverDraft = await fetchProjectSettingsDraftFromServer(activeId)
    }
    catch {
      resetProjectSettingsDraftServerState()
    }

    if (activeProjectId.value !== activeId)
      return

    const picked = pickProjectSettingsDraftForHydration(localDraft, serverDraft)
    if (!picked.draft)
      return

    const applied = applyProjectSettingsDraftCachePayload(
      picked.draft,
      picked.hasConflict ? 'conflict' : 'saved_auto',
    )
    if (!applied)
      return

    if (picked.source === 'server')
      writeProjectSettingsDraftCache(activeId, picked.draft)

    if (picked.hasConflict) {
      statusLine.value = picked.source === 'local'
        ? '检测到多端草稿差异，已优先使用本地较新草稿。'
        : '检测到多端草稿差异，已优先使用云端较新草稿。'
      return
    }

    statusLine.value = picked.source === 'server'
      ? '已恢复云端草稿（未提交）。'
      : '已恢复本地草稿（未提交）。'
  }
  catch (error) {
    if (activeProjectId.value !== activeId)
      return

    resetProjectSettingsState(activeProject.value)
    projectSettingsSaveState.value = 'error'
    statusLine.value = resolveApiErrorMessage(error, '加载项目设置失败，请稍后重试。')
  }
  finally {
    if (activeProjectId.value === activeId)
      projectSettingsLoading.value = false
  }
}

async function refreshProjectSettingsDraftServerRevision(projectId: string): Promise<void> {
  try {
    await fetchProjectSettingsDraftFromServer(projectId)
  }
  catch {
    // ignore refresh failures
  }
}

async function persistProjectSettingsDraftToServer(
  projectId: string,
  payload: WorkspaceProjectSettingsDraftCache,
  persistSeq: number,
): Promise<'success' | 'conflict' | 'error' | 'stale'> {
  const expectedRevision = projectSettingsDraftServerRevision.value
  const deviceId = ensureProjectSettingsDraftDeviceId()
  const requestPayload: WorkspaceProjectSettingsDraftCache = {
    ...payload,
    deviceId: payload.deviceId || deviceId || undefined,
  }

  try {
    const response = await $fetch<ApiResponse<ProjectSettingsDraft>>(
      endpoint(`/projects/${projectId}/settings-draft`),
      {
        method: 'PATCH',
        body: {
          payload: requestPayload,
          expectedRevision,
          deviceId,
        },
      },
    )

    if (activeProjectId.value !== projectId || persistSeq !== projectSettingsDraftPersistSeq)
      return 'stale'

    applyProjectSettingsDraftServerRecord(response.data)
    return 'success'
  }
  catch (error) {
    if (activeProjectId.value !== projectId || persistSeq !== projectSettingsDraftPersistSeq)
      return 'stale'

    if (resolveApiStatusCode(error) === 409) {
      await refreshProjectSettingsDraftServerRevision(projectId)
      if (activeProjectId.value === projectId && persistSeq === projectSettingsDraftPersistSeq) {
        projectSettingsSaveState.value = 'conflict'
        statusLine.value = '检测到多设备草稿冲突，已保留本地编辑。请再次保存或刷新后处理。'
      }
      return 'conflict'
    }

    return 'error'
  }
}

async function persistProjectSettingsDraftCache() {
  if (projectSettingsHydrating.value || !activeProjectId.value)
    return

  const projectId = activeProjectId.value
  const persistSeq = ++projectSettingsDraftPersistSeq
  const payload = buildProjectSettingsDraftCachePayload()
  const localSuccess = writeProjectSettingsDraftCache(projectId, payload)
  const serverResult = await persistProjectSettingsDraftToServer(projectId, payload, persistSeq)

  if (activeProjectId.value !== projectId || persistSeq !== projectSettingsDraftPersistSeq)
    return

  if (serverResult === 'conflict')
    return

  if (!localSuccess && serverResult !== 'success') {
    projectSettingsSaveState.value = 'error'
    statusLine.value = '草稿缓存失败（可重试）'
    return
  }

  projectSettingsSaveState.value = 'saved_auto'

  if (localSuccess && serverResult === 'success') {
    statusLine.value = '草稿已缓存（本地 + 云端，未提交）'
    return
  }
  if (localSuccess && serverResult === 'error') {
    statusLine.value = '草稿已本地缓存，云端同步失败（稍后重试）'
    return
  }
  if (!localSuccess && serverResult === 'success') {
    statusLine.value = '草稿已云端缓存，本地写入失败（可重试）'
    return
  }

  statusLine.value = '草稿已自动缓存（未提交）'
}

function scheduleProjectSettingsDraftPersist() {
  if (projectSettingsHydrating.value || !activeProjectId.value)
    return

  if (projectSettingsDraftTimer)
    clearTimeout(projectSettingsDraftTimer)

  projectSettingsDraftTimer = setTimeout(() => {
    projectSettingsDraftTimer = null
    void persistProjectSettingsDraftCache()
  }, 1200)
}

async function clearProjectSettingsDraftOnServer(projectId: string): Promise<'cleared' | 'none' | 'conflict' | 'error'> {
  const expectedRevision = projectSettingsDraftServerRevision.value
  if (!expectedRevision)
    return 'none'

  try {
    await $fetch<ApiResponse<ProjectSettingsDraft | null>>(
      endpoint(`/projects/${projectId}/settings-draft`),
      {
        method: 'DELETE',
        body: {
          expectedRevision,
        },
      },
    )
    resetProjectSettingsDraftServerState()
    return 'cleared'
  }
  catch (error) {
    if (resolveApiStatusCode(error) === 409) {
      await refreshProjectSettingsDraftServerRevision(projectId)
      return 'conflict'
    }
    return 'error'
  }
}

async function flushProjectSettingsSave(): Promise<boolean> {
  if (!activeProjectId.value)
    return true

  if (!projectSettingsCommonDirty.value && !projectSettingsBindingsDirty.value)
    return true

  projectSettingsSaveState.value = 'saving'
  statusLine.value = '保存中...'

  try {
    const body: Record<string, unknown> = {
      currentContestId: projectSettingsCurrentContestId.value || selectedContestId.value || '',
    }

    if (projectSettingsCommonDirty.value)
      body.common = buildProjectSettingsCommonPatch()
    if (projectSettingsBindingsDirty.value)
      body.contestBindings = cloneProjectContestBindings(projectSettingsBindings.value)

    const response = await $fetch<ApiResponse<ProjectSettingsSnapshot>>(
      endpoint(`/projects/${activeProjectId.value}/settings`),
      {
        method: 'PATCH',
        body,
      },
    )

    applyProjectSettingsSnapshot(response.data, projectSettingsCurrentContestId.value || selectedContestId.value)
    projectSettingsSaveState.value = 'saved_manual'
    statusLine.value = '手动保存成功'
    return true
  }
  catch (error) {
    projectSettingsSaveState.value = 'error'
    statusLine.value = `${resolveApiErrorMessage(error, '保存失败')}（可重试）`
    return false
  }
}

async function flushProjectAdaptationSave(
  contestId: string,
): Promise<boolean> {
  const normalizedContestId = String(contestId || '').trim()
  if (!activeProjectId.value || !normalizedContestId)
    return true

  if (!isProjectSettingsAdaptationDirty(normalizedContestId))
    return true

  const draft = projectSettingsAdaptationDrafts.value[normalizedContestId]
  if (!draft)
    return true

  const preferredContestId = String(projectSettingsCurrentContestId.value || selectedContestId.value || '').trim()
  projectSettingsSaveState.value = 'saving'
  statusLine.value = '保存中...'

  try {
    const response = await $fetch<ApiResponse<ProjectSettingsSnapshot>>(
      endpoint(`/projects/${activeProjectId.value}/adaptations/${normalizedContestId}`),
      {
        method: 'PATCH',
        body: buildProjectSettingsAdaptationPatch(draft),
      },
    )

    applyProjectSettingsSnapshot(response.data, preferredContestId)
    clearProjectSettingsAdaptationDirty(normalizedContestId)
    projectSettingsSaveState.value = 'saved_manual'
    statusLine.value = '手动保存成功'
    return true
  }
  catch (error) {
    projectSettingsSaveState.value = 'error'
    statusLine.value = `${resolveApiErrorMessage(error, '保存失败')}（可重试）`
    return false
  }
}

async function saveProjectSettingsManually() {
  clearProjectSettingsAutoTimers()

  const commonSaved = await flushProjectSettingsSave()
  if (!commonSaved)
    return

  const pendingContestIds = [...projectSettingsDirtyAdaptationContestIds.value]
  for (const contestId of pendingContestIds) {
    const saved = await flushProjectAdaptationSave(contestId)
    if (!saved)
      return
  }

  const projectId = activeProjectId.value
  if (projectId)
    clearProjectSettingsDraftCache(projectId)

  const clearResult = projectId
    ? await clearProjectSettingsDraftOnServer(projectId)
    : 'none'

  if (clearResult === 'conflict') {
    projectSettingsSaveState.value = 'conflict'
    statusLine.value = '项目已保存，但检测到其他设备有更新草稿，云端缓存未清除。'
    return
  }

  if (clearResult === 'error') {
    projectSettingsSaveState.value = 'error'
    statusLine.value = '项目已保存，但清理云端草稿失败（可重试）。'
    return
  }

  await generateProjectOutline('settings_saved', true)
  projectSettingsSaveState.value = 'saved_manual'
  statusLine.value = '手动保存成功，结构大纲已刷新。'
}

function onProjectSettingsCommonChange(next: WorkspaceProjectCommonForm) {
  if (projectSettingsHydrating.value)
    return
  Object.assign(projectSettingsCommon, cloneProjectCommonForm(next))
  projectSettingsCommonDirty.value = true
  scheduleProjectSettingsDraftPersist()
}

function onProjectSettingsBindingsChange(next: WorkspaceProjectContestBindingForm[]) {
  if (projectSettingsHydrating.value)
    return

  const normalized = normalizeProjectSettingsBindings(next)
  projectSettingsBindings.value = normalized
  projectSettingsBindingsDirty.value = true

  const allowedContestIds = new Set(normalized.map(item => item.contestId))
  const keptDrafts: Record<string, WorkspaceProjectAdaptationForm> = {}
  for (const [contestId, draft] of Object.entries(projectSettingsAdaptationDrafts.value)) {
    if (!allowedContestIds.has(contestId))
      continue
    const binding = normalized.find(item => item.contestId === contestId)
    keptDrafts[contestId] = {
      ...draft,
      trackId: binding?.trackId || draft.trackId,
    }
  }
  projectSettingsAdaptationDrafts.value = keptDrafts
  projectSettingsDirtyAdaptationContestIds.value = projectSettingsDirtyAdaptationContestIds.value
    .filter(contestId => allowedContestIds.has(contestId))

  const nextContestId = ensureProjectSettingsCurrentContest(selectedContestId.value)
  if (nextContestId)
    selectedContestId.value = nextContestId
  else if (!normalized.length)
    selectedContestId.value = ''

  const binding = projectSettingsBindingMap.value.get(nextContestId)
  selectedTrackId.value = binding?.trackId || ''
  syncProjectSettingsAdaptationFormByContest(nextContestId)
  scheduleProjectSettingsDraftPersist()
}

function onProjectSettingsAdaptationChange(next: WorkspaceProjectAdaptationForm) {
  if (projectSettingsHydrating.value)
    return

  const contestId = String(next.contestId || projectSettingsCurrentContestId.value || '').trim()
  if (!contestId)
    return

  const binding = projectSettingsBindingMap.value.get(contestId)
  if (!binding)
    return

  const nextDraft: WorkspaceProjectAdaptationForm = {
    ...cloneProjectAdaptationForm(next),
    contestId,
    trackId: binding.trackId,
  }

  projectSettingsHydrating.value = true
  try {
    Object.assign(projectSettingsAdaptation, nextDraft)
  }
  finally {
    projectSettingsHydrating.value = false
  }

  upsertProjectSettingsAdaptationDraft(nextDraft)
  markProjectSettingsAdaptationDirty(contestId)
  scheduleProjectSettingsDraftPersist()
}

watch(selectedContestId, (contestId) => {
  if (projectSettingsHydrating.value) {
    syncFormContestTrack()
    return
  }

  const normalizedContestId = String(contestId || '').trim()
  if (!normalizedContestId) {
    selectedTrackId.value = ''
    projectSettingsCurrentContestId.value = ''
    syncProjectSettingsAdaptationFormByContest('')
    syncFormContestTrack()
    return
  }

  const binding = projectSettingsBindingMap.value.get(normalizedContestId)
  const contest = contestMap.value.get(normalizedContestId)
  selectedTrackId.value = binding?.trackId || contest?.tracks[0]?.id || ''

  if (!binding) {
    projectSettingsCurrentContestId.value = ''
    syncProjectSettingsAdaptationFormByContest('')
    syncFormContestTrack()
    return
  }

  const hasExistingDraft = Boolean(projectSettingsAdaptationDrafts.value[normalizedContestId])
  projectSettingsCurrentContestId.value = normalizedContestId
  syncProjectSettingsAdaptationFormByContest(normalizedContestId)
  if (!hasExistingDraft && activeProjectId.value)
    void loadProjectSettings(normalizedContestId)
  syncFormContestTrack()
})

watch([selectedContestId, selectedTrackId], () => {
  syncFormContestTrack()
  if (projectSettingsHydrating.value)
    return
  if (!activeProjectId.value)
    return
  scheduleProjectOutlineGenerate('contest_track_switched')
})

async function loadAuthContext(): Promise<boolean> {
  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
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
    ensureProjectSettingsDraftDeviceId()

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

async function loadContestCatalog() {
  try {
    const response = await $fetch<ApiResponse<Contest[]>>(endpoint('/contests'))
    contestCatalog.value = response.data
  }
  catch {
    if (contestCatalog.value.length === 0)
      contestCatalog.value = contests.value
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
    const catalogMap = new Map<string, Contest>()
    for (const contest of contestCatalog.value)
      catalogMap.set(contest.id, contest)
    for (const contest of response.data)
      catalogMap.set(contest.id, contest)
    contestCatalog.value = [...catalogMap.values()]

    const firstContest = contests.value[0]
    if (!selectedContestId.value && firstContest)
      selectedContestId.value = firstContest.id

    if (selectedContestId.value) {
      const hit = contestCatalog.value.some(contest => contest.id === selectedContestId.value)
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

async function loadProjectResources() {
  resourcesLoading.value = true
  if (!activeProjectId.value) {
    resources.value = []
    resourcesLoading.value = false
    return
  }

  try {
    const response = await $fetch<ApiResponse<Resource[]>>(endpoint(`/projects/${activeProjectId.value}/resources`))
    resources.value = response.data
  }
  catch {
    resources.value = []
  }
  finally {
    resourcesLoading.value = false
  }
}

async function loadProjectResourceLibrary() {
  if (!activeProjectId.value) {
    resourceLibrary.value = []
    return
  }

  try {
    const response = await $fetch<ApiResponse<Resource[]>>(endpoint(`/projects/${activeProjectId.value}/resources/library`))
    resourceLibrary.value = response.data
  }
  catch {
    resourceLibrary.value = []
  }
}

async function loadProjectRecycleResources() {
  if (!activeProjectId.value) {
    recycleResources.value = []
    return
  }

  try {
    const response = await $fetch<ApiResponse<Resource[]>>(endpoint(`/projects/${activeProjectId.value}/resources/recycle`))
    recycleResources.value = response.data
  }
  catch {
    recycleResources.value = []
  }
}

async function refreshProjectResourceContext() {
  await Promise.all([
    loadProjectResources(),
    loadProjectResourceLibrary(),
    loadProjectRecycleResources(),
  ])
}

function buildProjectOutlineContextPayload() {
  return {
    contestId: selectedContestId.value,
    trackId: selectedTrackId.value,
    major: major.value,
    discipline: discipline.value,
    level: level.value,
    trackType: trackType.value,
  }
}

function clearProjectOutlineGenerateTimer() {
  if (!projectOutlineGenerateTimer)
    return
  clearTimeout(projectOutlineGenerateTimer)
  projectOutlineGenerateTimer = null
}

async function loadProjectOutline() {
  const projectId = activeProjectId.value
  if (!projectId) {
    projectOutlineSnapshot.value = null
    return
  }

  try {
    const response = await $fetch<ApiResponse<ProjectOutlineSnapshot>>(endpoint(`/projects/${projectId}/outline`), {
      query: buildProjectOutlineContextPayload(),
    })
    if (activeProjectId.value !== projectId)
      return
    projectOutlineSnapshot.value = response.data
  }
  catch {
    if (activeProjectId.value === projectId)
      projectOutlineSnapshot.value = null
  }
}

async function generateProjectOutline(reason: string, silent = false) {
  const projectId = activeProjectId.value
  if (!projectId)
    return

  try {
    const response = await $fetch<ApiResponse<ProjectOutlineSnapshot>>(endpoint(`/projects/${projectId}/outline/generate`), {
      method: 'POST',
      body: {
        reason,
        context: buildProjectOutlineContextPayload(),
      },
    })
    if (activeProjectId.value !== projectId)
      return
    projectOutlineSnapshot.value = response.data
    if (!silent)
      statusLine.value = '结构大纲已更新。'
  }
  catch (error) {
    if (silent || activeProjectId.value !== projectId)
      return
    statusLine.value = resolveApiErrorMessage(error, '结构大纲生成失败，请稍后重试。')
  }
}

function scheduleProjectOutlineGenerate(reason: string) {
  if (!activeProjectId.value)
    return

  clearProjectOutlineGenerateTimer()
  projectOutlineGenerateTimer = setTimeout(() => {
    projectOutlineGenerateTimer = null
    void generateProjectOutline(reason, true)
  }, 2000)
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

async function addResourceFromLibrary(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!activeProjectId.value || !targetResourceId)
    return

  resourceMutating.value = true
  try {
    await $fetch(endpoint(`/projects/${activeProjectId.value}/resources/library`), {
      method: 'POST',
      body: {
        resourceId: targetResourceId,
      },
    })
    await refreshProjectResourceContext()
    await generateProjectOutline('library_add_success', true)
    statusLine.value = '已从系统库添加资源，并刷新结构大纲。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '添加资源失败，请稍后重试。')
  }
  finally {
    resourceMutating.value = false
  }
}

async function removeProjectResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!activeProjectId.value || !targetResourceId)
    return

  const target = resources.value.find(item => item.id === targetResourceId)
  const targetTitle = target?.title ? `「${target.title}」` : '资源'

  resourceMutating.value = true
  try {
    await $fetch(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}`), {
      method: 'DELETE',
    })
    await refreshProjectResourceContext()
    await generateProjectOutline('resource_delete_success', true)
    statusLine.value = `${targetTitle} 已移入项目回收站，结构大纲已刷新。`
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '删除资源失败，请稍后重试。')
  }
  finally {
    resourceMutating.value = false
  }
}

async function restoreProjectResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!activeProjectId.value || !targetResourceId)
    return

  resourceMutating.value = true
  try {
    await $fetch(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}/restore`), {
      method: 'POST',
    })
    await refreshProjectResourceContext()
    await generateProjectOutline('resource_restore_success', true)
    statusLine.value = '资源已从回收站恢复，结构大纲已刷新。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '恢复资源失败，请稍后重试。')
  }
  finally {
    resourceMutating.value = false
  }
}

async function purgeProjectResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!activeProjectId.value || !targetResourceId)
    return

  resourceMutating.value = true
  try {
    await $fetch(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}/purge`), {
      method: 'DELETE',
    })
    await refreshProjectResourceContext()
    statusLine.value = '资源已彻底删除并释放存储空间。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '彻底删除资源失败，请稍后重试。')
  }
  finally {
    resourceMutating.value = false
  }
}

async function uploadResourcesToProject(files: File[]) {
  if (!activeProjectId.value)
    return

  const normalizedFiles = Array.from(files || []).filter(file => file instanceof File)
  const validationError = validateUploadFiles(normalizedFiles, projectUploadStorageUsedBytes.value)
  if (validationError) {
    statusLine.value = validationError
    return
  }

  resourceMutating.value = true
  const formData = new FormData()
  normalizedFiles.forEach((file) => {
    formData.append('file', file, file.name)
  })

  try {
    const response = await $fetch<ApiResponse<{ uploadedCount?: number }>>(endpoint(`/projects/${activeProjectId.value}/resources/upload`), {
      method: 'POST',
      body: formData,
    })
    await refreshProjectResourceContext()
    await generateProjectOutline('upload_success', true)
    const uploadedCount = Math.max(0, Number(response.data?.uploadedCount || normalizedFiles.length))
    statusLine.value = `上传成功：${uploadedCount} 个文件，结构大纲已刷新。`
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '上传资源失败，请稍后重试。')
  }
  finally {
    resourceMutating.value = false
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
    const catalogMap = new Map<string, Contest>()
    for (const contest of contestCatalog.value)
      catalogMap.set(contest.id, contest)
    for (const contest of response.data.contests)
      catalogMap.set(contest.id, contest)
    contestCatalog.value = [...catalogMap.values()]

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
        projectId: activeProjectId.value,
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
        projectId: activeProjectId.value,
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
        projectId: activeProjectId.value,
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

async function submitProject(target?: { contestId?: string, trackId?: string }) {
  if (!activeWorkspaceId.value) {
    statusLine.value = '请先选择一个空间。'
    return
  }

  const contestId = String(target?.contestId || selectedContestId.value || '').trim()
  const trackId = String(target?.trackId || selectedTrackId.value || '').trim()

  if (!contestId || !trackId) {
    statusLine.value = '请先选择竞赛和赛道。'
    return
  }

  formSubmitting.value = true
  statusLine.value = ''

  try {
    const contestIds = projectSettingsBindings.value.length > 0
      ? projectSettingsBindings.value.map(item => String(item.contestId || '').trim()).filter(Boolean)
      : []

    if (!contestIds.includes(contestId))
      contestIds.unshift(contestId)

    const payload = {
      workspaceId: activeWorkspaceId.value,
      source: formState.source,
      title: formState.title.trim(),
      contestId,
      trackId,
      contestIds,
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
  }
  catch {
    statusLine.value = '项目创建失败，请检查字段是否完整。'
  }
  finally {
    formSubmitting.value = false
  }
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

function openFinalReviewFromHeader() {
  openFlowSignal.value += 1
  statusLine.value = '已打开申报流程梳理，可按流程推进终审。'
}

function openSettingsFromLeftSidebar() {
  openSettingsSignal.value += 1
  statusLine.value = '已打开项目设置页，可在中间区域配置项目底座与竞赛适配稿。'
}

onMounted(async () => {
  const ok = await loadAuthContext()
  if (!ok)
    return

  await Promise.all([loadContestCatalog(), loadContests(), loadProjects(), loadQuickSwitchProjects(), loadChatSessions()])
  await refreshProjectResourceContext()
  await loadProjectOutline()
  await loadProjectSettings(selectedContestId.value)
  syncFormContestTrack()
  if (highlightedProjectId.value) {
    const target = projects.value.find(item => item.id === highlightedProjectId.value)
    if (target)
      statusLine.value = `已定位项目：${target.title}`
  }
})

onBeforeUnmount(() => {
  clearProjectSettingsAutoTimers()
  clearProjectOutlineGenerateTimer()
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
  await Promise.all([loadContestCatalog(), loadProjects(), loadQuickSwitchProjects(), loadChatSessions()])
  await refreshProjectResourceContext()
  await loadProjectOutline()
  await loadProjectSettings(selectedContestId.value)
  if (highlightedProjectId.value) {
    const target = projects.value.find(item => item.id === highlightedProjectId.value)
    if (target)
      statusLine.value = `已定位项目：${target.title}`
  }
})

watch(activeProjectId, async (next, previous) => {
  if (next === previous)
    return

  clearProjectSettingsAutoTimers()
  clearProjectOutlineGenerateTimer()
  await refreshProjectResourceContext()
  if (!next) {
    projectOutlineSnapshot.value = null
    resetProjectSettingsState(null)
    return
  }
  resetProjectSettingsState(activeProject.value)
  await loadProjectOutline()
  await loadProjectSettings(selectedContestId.value)
})
</script>

<template>
  <div class="workspace-shell text-slate-800 bg-white flex flex-col h-full min-h-0 overflow-hidden">
    <WorkspaceHeader
      v-model="headerSearch"
      :project-name="headerProjectName"
      :my-projects="myQuickSwitchProjects"
      :recent-projects="recentQuickSwitchProjects"
      @final-review="openFinalReviewFromHeader"
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
        :selected-resources="selectedResources"
        :recycle-resources="recycleResources"
        :resource-library="resourceLibrary"
        :project-outline="projectOutlineItems"
        :resource-mutating="resourceMutating"
        :has-active-project="Boolean(activeProjectId)"
        :ai-reasoning="aiReasoning"
        :normalized-info="normalizedInfo"
        :status-line="statusLine"
        :list-loading="listLoading"
        :ai-filtering="aiFiltering"
        :is-admin-view="isAdminView"
        @load-contests="loadContests"
        @run-ai-filter="runAiFilter"
        @open-settings-panel="openSettingsFromLeftSidebar"
        @add-resource-from-library="addResourceFromLibrary"
        @remove-project-resource="removeProjectResource"
        @restore-project-resource="restoreProjectResource"
        @purge-project-resource="purgeProjectResource"
        @upload-resources="uploadResourcesToProject"
      />

      <WorkspaceMainPanel
        v-model:selected-track-id="selectedTrackId"
        v-model:major="major"
        v-model:discipline="discipline"
        v-model:level="level"
        v-model:track-type="trackType"
        v-model:top-k="topK"
        v-model:selected-contest-id="selectedContestId"
        :selected-contest="selectedContest"
        :selected-track="selectedTrack"
        :contests="contestSource"
        :active-project="activeProject"
        :open-settings-signal="openSettingsSignal"
        :open-flow-signal="openFlowSignal"
        :selected-resources="selectedResources"
        :mapping-rows="mappingRows"
        :keyword-cloud="keywordCloud"
        :trend-bars="trendBars"
        :form-state="formState"
        :form-submitting="formSubmitting"
        :tone-meta="toneMeta"
        :project-settings-loading="projectSettingsLoading"
        :project-settings-save-state="projectSettingsSaveState"
        :project-settings-common="projectSettingsCommon"
        :project-settings-bindings="projectSettingsBindings"
        :project-settings-current-contest-id="projectSettingsCurrentContestId"
        :project-settings-adaptation="projectSettingsAdaptation"
        :project-settings-has-current-contest="projectSettingsHasCurrentContest"
        @update:form-state="Object.assign(formState, $event)"
        @submit-project-for-contest="submitProject"
        @update:project-settings-common="onProjectSettingsCommonChange"
        @update:project-settings-bindings="onProjectSettingsBindingsChange"
        @update:project-settings-adaptation="onProjectSettingsAdaptationChange"
        @save-project-settings="saveProjectSettingsManually"
      />

      <WorkspaceRightSidebar
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
        :selected-contest="selectedContest"
        :selected-track="selectedTrack"
        :selected-resources="selectedResources"
        @send-chat="sendChatMessage"
        @switch-chat-session="switchChatSession"
        @create-chat-session="startNewChatSession"
        @fill-form="fillFormWithDraft"
        @apply-topic-proposal="applyTopicProposal"
      />
    </main>

    <WorkspaceStatusBar
      :status-line="statusLine"
      :loading="resourcesLoading"
      :ai-ready="!aiBusy"
      ai-model-label="由后端配置"
      :token-balance="tokenBalance"
      :project-storage-used-bytes="projectUploadStorageUsedBytes"
      :project-storage-limit-bytes="PROJECT_RESOURCE_STORAGE_LIMIT_BYTES"
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
