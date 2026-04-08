<script setup lang="ts">
import type {
  AiChatMessage,
  AiChatSession,
  AiContestFilterResult,
  AiDefenseJudgeRound,
  AiDefenseScorecard,
  AiDefenseStreamEvent,
  AiDefenseStreamEventType,
  AiProjectChangeRequest,
  AiWorkspaceRequest,
  AiWorkspaceResult,
  AiWorkspaceStreamEvent,
  AiWorkspaceStreamEventType,
  ApiResponse,
  ApproveChangeRequestPayload,
  AuthMeResult,
  ChatMessage,
  CollabPurpose,
  Contest,
  Project,
  ProjectContestAdaptation,
  ProjectInvitationSummary,
  ProjectIssue,
  ProjectIssueReport,
  ProjectMemberManagementSnapshot,
  ProjectMemberRole,
  ProjectMemberSummary,
  ProjectOutlineSnapshot,
  ProjectPayload,
  ProjectResourceShare,
  ProjectResourceShareDurationPreset,
  ProjectResourceShareVisibility,
  ProjectSeatQuota,
  ProjectSettingsDraft,
  ProjectSettingsDraftPayload,
  ProjectSettingsDraftUi,
  ProjectSettingsSnapshot,
  Resource,
  ResourcePreviewStatus,
  WorkspaceAiMode,
  WorkspaceMemberRole,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import type { CollabSnapshotPayload, WorkspaceRealtimeEnvelope } from '~/composables/useCollabSession'
import type {
  MappingTone,
  WorkspaceFormState,
  WorkspaceKeyword,
  WorkspaceLinkedContestResourceGroup,
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
import { useCollabSession } from '~/composables/useCollabSession'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: '项目工作区',
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

const { endpoint, resolveApiUrl, resolveAppUrl } = useApiEndpoint()
const authApiFetch = useAuthApiFetch()
const route = useRoute()
const workspaceRealtime = useWorkspaceRealtime()

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

function isTruthyQueryFlag(value: unknown): boolean {
  const normalized = normalizeQueryParam(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function teamDashboardPath(): string {
  return '/team'
}

function teamDetailPath(teamId: string): string {
  return `/team/${teamId}`
}

function teamProjectPath(teamId: string, projectId: string): string {
  return `/team/${teamId}/project/${projectId}`
}

function workspaceDetailPath(workspaceId: string, projectId = ''): string {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  const normalizedProjectId = String(projectId || '').trim()
  if (normalizedWorkspaceId && normalizedProjectId)
    return teamProjectPath(normalizedWorkspaceId, normalizedProjectId)
  return teamDetailPath(normalizedWorkspaceId)
}

async function ensureCanonicalWorkspaceProjectRoute(): Promise<boolean> {
  if (!route.path.startsWith('/workspace/'))
    return false

  const params = route.params as Record<string, string | string[] | undefined>
  const workspaceId = normalizeRouteParam(params.teamId || params.workspaceId)
  const projectId = normalizeRouteParam(params.projectId)
  if (!workspaceId || !projectId)
    return false

  await navigateTo({
    path: workspaceDetailPath(workspaceId, projectId),
    query: route.query,
  }, { replace: true })
  return true
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
  const sourceType = String(resource.sourceType || resource.source || '').trim()
  if (sourceType !== 'project_upload' && sourceType !== 'upload')
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

interface ResourcePreviewStatusPayload {
  documentId: string
  status: ResourcePreviewStatus
  stage: ResourcePreviewStatus
  progressPercent: number
  etaSeconds: number
  queuePosition: number
  attempt: number
  error: string
  previewUrl: string
  previewUrlExpiresAt: string
  sourceDownloadUrl: string
  sourceDownloadUrlExpiresAt: string
}

interface ProjectResourceShareCreatePayload {
  resourceId: string
  visibility: ProjectResourceShareVisibility
  duration: ProjectResourceShareDurationPreset
}

interface ProjectInvitationCreatePayload {
  inviteeUsername: string
  projectRole: ProjectMemberRole
  expiresInDays: number
}

interface ProjectMemberRolePatchPayload {
  userId: string
  role: 'manager' | 'editor' | 'viewer'
}

type WorkspaceProjectSettingsDraftCache = ProjectSettingsDraftPayload
type WorkspaceMainTabId = 'dashboard' | 'members' | 'flow' | 'settings' | `resource:${string}`
type WorkspacePreviewMode = 'binary' | 'markdown' | 'draw'

const PROJECT_SETTINGS_DRAFT_PREFIX = 'workspace.projectSettingsDraft'
const PROJECT_SETTINGS_DRAFT_DEVICE_PREFIX = 'workspace.projectSettingsDraftDevice'
const RIGHT_SIDEBAR_BREAKPOINT_QUERY = '(min-width: 1280px)'
const WORKSPACE_MEMBER_MANAGE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']

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
  return normalizeRouteParam(params.teamId || params.workspaceId)
})

const routeProjectId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  return normalizeRouteParam(params.projectId || '')
})

const highlightedProjectId = computed(() => routeProjectId.value || normalizeQueryParam(route.query.projectId))

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
const projectResourceShares = ref<ProjectResourceShare[]>([])
const workspaceMembers = ref<ProjectMemberSummary[]>([])
const workspaceInvitations = ref<ProjectInvitationSummary[]>([])
const projectOutlineSnapshot = ref<ProjectOutlineSnapshot | null>(null)
const projects = ref<Project[]>([])
const allProjects = ref<Project[]>([])
const me = ref<AuthMeResult | null>(null)
const activeWorkspaceId = ref('')
const selectedContestId = ref('')
const selectedTrackId = ref('')

const openSettingsSignal = ref(0)
const openMemberManagementSignal = ref(0)
const openFlowSignal = ref(0)
const openPreviewSignal = ref(0)
const closePreviewSignal = ref(0)
const leftSidebarCollapsed = ref(false)
const rightSidebarUserCollapsed = ref(false)
const rightSidebarAutoCollapsed = ref(false)
const rightSidebarAutoRestorePending = ref(false)
const sidebarLayoutHydrating = ref(false)
const activeMainTabId = ref<WorkspaceMainTabId | ''>('dashboard')
const headerSearch = ref('')
const aiReasoning = ref('')
const normalizedInfo = ref('')
const statusLine = ref('')
const flowResourceId = ref('')
const previewResourceId = ref('')
const collabBindingResourceId = ref('')
const closingPreviewResourceId = ref('')
const previewStatusLoading = ref(false)
const previewStatusPayload = ref<ResourcePreviewStatusPayload | null>(null)
const previewMode = ref<WorkspacePreviewMode>('binary')
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
let previewStatusPollTimer: ReturnType<typeof setInterval> | null = null
let realtimeProjectRefreshTimer: ReturnType<typeof setTimeout> | null = null
let fallbackResourceRefreshTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeRealtimeMessages: (() => void) | null = null
let rightSidebarBreakpointMediaQuery: MediaQueryList | null = null
let unsubscribeRightSidebarBreakpoint: (() => void) | null = null

const listLoading = ref(false)
const aiFiltering = ref(false)
const chatLoading = ref(false)
const chatSessionsLoading = ref(false)
const formSubmitting = ref(false)
const resourcesLoading = ref(false)
const resourceLibraryLoading = ref(false)
const projectOutlineLoading = ref(false)
const projectOutlineFirstLoaded = ref(false)
const projectResourceSharesLoading = ref(false)
const workspaceMemberManagementLoading = ref(false)
const workspaceInvitationSubmitting = ref(false)
const workspaceMemberRoleUpdatingUserId = ref('')
const workspaceMemberRemovingUserId = ref('')
const workspaceInvitationRevokingId = ref('')
const resourceMutating = ref(false)

const chatMessages = ref<ChatMessage[]>([defaultAssistantGreeting()])
const chatSessions = ref<AiChatSession[]>([])
const activeChatSessionId = ref('')
const chatInput = ref('')
const chatMissingFields = ref<string[]>([])
const chatDraft = ref<ProjectPayload | null>(null)
const aiMode = ref<WorkspaceAiMode>('dialog_ask')
const aiChangeRequests = ref<AiProjectChangeRequest[]>([])
const aiChangeRequestsLoading = ref(false)
const aiChangeActingIds = ref<string[]>([])
const aiChangeSecondConfirmIds = ref<string[]>([])
const projectIssueReports = ref<ProjectIssueReport[]>([])
const projectIssues = ref<ProjectIssue[]>([])
const issueCenterLoading = ref(false)
const defenseRounds = ref<AiDefenseJudgeRound[]>([])
const defenseScorecard = ref<AiDefenseScorecard | null>(null)
const workspaceInvitationLink = ref('')
const workspaceSeatLimitSaveLoading = ref(false)
const workspaceSeatLimitError = ref('')
const workspaceSeatLimitUpdatedSignal = ref(0)
const projectSeatQuota = ref<ProjectSeatQuota | null>(null)
const rightSidebarCollapsed = computed(() => rightSidebarUserCollapsed.value || rightSidebarAutoCollapsed.value)

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

function withSidebarLayoutHydrating<T>(callback: () => T): T {
  sidebarLayoutHydrating.value = true
  try {
    return callback()
  }
  finally {
    sidebarLayoutHydrating.value = false
  }
}

function applyRightSidebarAutoCollapse(nextCollapsed: boolean, nextRestorePending = rightSidebarAutoRestorePending.value): void {
  const normalizedCollapsed = Boolean(nextCollapsed)
  const normalizedRestorePending = Boolean(nextRestorePending)
  if (
    rightSidebarAutoCollapsed.value === normalizedCollapsed
    && rightSidebarAutoRestorePending.value === normalizedRestorePending
  ) {
    return
  }

  withSidebarLayoutHydrating(() => {
    rightSidebarAutoCollapsed.value = normalizedCollapsed
    rightSidebarAutoRestorePending.value = normalizedRestorePending
  })
}

function handleRightSidebarBreakpointChange(isWide: boolean): void {
  if (isWide) {
    if (rightSidebarAutoCollapsed.value || rightSidebarAutoRestorePending.value)
      applyRightSidebarAutoCollapse(false, false)
    return
  }

  if (rightSidebarCollapsed.value)
    return

  applyRightSidebarAutoCollapse(true, true)
}

function initializeRightSidebarBreakpointTracking(): void {
  if (!import.meta.client)
    return

  if (unsubscribeRightSidebarBreakpoint) {
    unsubscribeRightSidebarBreakpoint()
    unsubscribeRightSidebarBreakpoint = null
  }

  rightSidebarBreakpointMediaQuery = window.matchMedia(RIGHT_SIDEBAR_BREAKPOINT_QUERY)
  handleRightSidebarBreakpointChange(rightSidebarBreakpointMediaQuery.matches)

  const handleChange = (event: MediaQueryListEvent) => {
    handleRightSidebarBreakpointChange(event.matches)
  }

  if (typeof rightSidebarBreakpointMediaQuery.addEventListener === 'function') {
    rightSidebarBreakpointMediaQuery.addEventListener('change', handleChange)
    unsubscribeRightSidebarBreakpoint = () => {
      rightSidebarBreakpointMediaQuery?.removeEventListener('change', handleChange)
      rightSidebarBreakpointMediaQuery = null
    }
    return
  }

  rightSidebarBreakpointMediaQuery.addListener(handleChange)
  unsubscribeRightSidebarBreakpoint = () => {
    rightSidebarBreakpointMediaQuery?.removeListener(handleChange)
    rightSidebarBreakpointMediaQuery = null
  }
}

function setRightSidebarUserCollapsed(nextCollapsed: boolean, options: { suppressPersist?: boolean } = {}): void {
  const normalizedCollapsed = Boolean(nextCollapsed)
  const apply = () => {
    rightSidebarUserCollapsed.value = normalizedCollapsed
    rightSidebarAutoCollapsed.value = false
    rightSidebarAutoRestorePending.value = false
  }

  if (options.suppressPersist) {
    withSidebarLayoutHydrating(apply)
    return
  }

  apply()
}

function collapseRightSidebar(): void {
  setRightSidebarUserCollapsed(true)
}

function expandRightSidebar(): void {
  setRightSidebarUserCollapsed(false)
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
  defenseRounds.value = []
  defenseScorecard.value = null
}

function resolveWorkspaceOptions(auth: AuthMeResult | null): WorkspaceWithQuota[] {
  if (!auth)
    return []
  if (Array.isArray(auth.teams) && auth.teams.length > 0) {
    return auth.teams.map(item => ({
      workspace: item.team,
      quota: item.quota,
    }))
  }
  return auth.workspaces || []
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
const linkedContestResourceGroups = computed<WorkspaceLinkedContestResourceGroup[]>(() => {
  const resourcesByContestId = new Map<string, Resource[]>()

  for (const resource of resourceLibrary.value) {
    const contestId = String(resource.contestId || '').trim()
    if (!contestId)
      continue

    const existing = resourcesByContestId.get(contestId)
    if (existing) {
      existing.push(resource)
      continue
    }

    resourcesByContestId.set(contestId, [resource])
  }

  return [...projectSettingsBindings.value]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .reduce<WorkspaceLinkedContestResourceGroup[]>((groups, binding) => {
      const contestId = String(binding.contestId || '').trim()
      if (!contestId || groups.some(item => item.contestId === contestId))
        return groups

      const contest = contestMap.value.get(contestId)
      const track = contest?.tracks.find(item => item.id === binding.trackId) || contest?.tracks[0] || null

      groups.push({
        contestId,
        contestName: contest?.name || '已关联比赛',
        trackId: String(binding.trackId || '').trim(),
        trackName: track?.name || '',
        resources: resourcesByContestId.get(contestId) || [],
      })

      return groups
    }, [])
})
const projectSettingsHasCurrentContest = computed(() => {
  const contestId = String(projectSettingsCurrentContestId.value || '').trim()
  return Boolean(contestId && projectSettingsBindingMap.value.has(contestId))
})
const workspaceOptions = computed(() => resolveWorkspaceOptions(me.value))
const isAdminView = computed(() => Boolean(me.value?.user.isPlatformAdmin))
const workspaceNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const item of workspaceOptions.value)
    map.set(item.workspace.id, item.workspace.name)
  return map
})
const visibleWorkspaceIdSet = computed(() => {
  return new Set(workspaceOptions.value.map(item => item.workspace.id))
})
const currentWorkspace = computed(() => {
  return workspaceOptions.value.find(item => item.workspace.id === activeWorkspaceId.value) || null
})
const currentProjectMember = computed(() => {
  const userId = String(me.value?.user.id || '').trim()
  if (!userId)
    return null
  return workspaceMembers.value.find(item => item.userId === userId) || null
})
const currentProjectMemberRole = computed<ProjectMemberRole | ''>(() => {
  return currentProjectMember.value?.role || ''
})
const workspaceCanManageMembers = computed(() => {
  if (me.value?.user.isPlatformAdmin)
    return true

  const roles = currentWorkspace.value?.workspace.roles || []
  if (roles.some(role => WORKSPACE_MEMBER_MANAGE_ROLES.includes(role)))
    return true
  return currentProjectMemberRole.value === 'owner' || currentProjectMemberRole.value === 'manager'
})
const workspaceCanEditMembers = computed(() => {
  if (me.value?.user.isPlatformAdmin)
    return true
  const roles = currentWorkspace.value?.workspace.roles || []
  return roles.includes('owner') || roles.includes('admin')
})
const workspaceCanManageBillingSeats = computed(() => {
  return workspaceCanManageMembers.value
})
const workspaceSupportsSeatAdd = computed(() => {
  return Boolean(highlightedProjectId.value)
})
const workspaceSeatUsed = computed(() => {
  const quotaSeatUsed = Number(projectSeatQuota.value?.seatUsed || 0)
  if (Number.isFinite(quotaSeatUsed) && quotaSeatUsed > 0)
    return Math.max(0, Math.trunc(quotaSeatUsed))
  return Math.max(0, workspaceMembers.value.length)
})
const workspaceSeatLimit = computed<number | null>(() => {
  const raw = Number(projectSeatQuota.value?.seatLimit)
  if (!Number.isFinite(raw) || raw <= 0)
    return null
  return Math.max(1, Math.trunc(raw))
})
const quickSwitchSourceProjects = computed(() => {
  const source = allProjects.value.length > 0 ? allProjects.value : projects.value
  return source.filter((project) => {
    const teamId = String(project.teamId || project.workspaceId || '').trim()
    return Boolean(teamId && visibleWorkspaceIdSet.value.has(teamId))
  })
})
const sortedQuickSwitchProjects = computed(() => sortByUpdatedAtDesc(quickSwitchSourceProjects.value))

function toQuickSwitchProject(project: Project): WorkspaceQuickSwitchProject {
  const teamId = String(project.teamId || project.workspaceId || '').trim()
  return {
    projectId: project.id,
    workspaceId: teamId,
    title: project.title || '未命名项目',
    workspaceName: workspaceNameMap.value.get(teamId) || teamId,
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
  if (!highlightedProjectId.value)
    return null
  const matched = projects.value.find(item => item.id === highlightedProjectId.value)
  return matched || null
})

const activeProjectId = computed(() => activeProject.value?.id || '')
const collabSession = useCollabSession({
  workspaceRealtime,
  projectId: activeProjectId,
  resourceId: collabBindingResourceId,
  statusLine,
  fetchSnapshot: async resourceId => await fetchCollabSnapshot(resourceId),
})
const collabRevision = collabSession.revision
const collabMarkdownDoc = collabSession.markdownDoc
const collabDrawValue = collabSession.drawValue
const collabDrawError = collabSession.drawError
const collabPresenceMembers = collabSession.presenceMembers
const collabConnected = collabSession.connected
const collabStatusText = collabSession.statusText

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
const projectOutlineFirstLoadLoading = computed(() => {
  return projectOutlineLoading.value && !projectOutlineFirstLoaded.value
})
const latestIssueReport = computed(() => projectIssueReports.value[0] || null)
const previewResource = computed(() => {
  const targetId = String(previewResourceId.value || '').trim()
  if (!targetId)
    return null
  return resources.value.find(item => item.id === targetId) || null
})
const flowResource = computed(() => {
  const targetId = String(flowResourceId.value || '').trim()
  if (!targetId)
    return null
  return resources.value.find(item => item.id === targetId) || null
})
const previewResourceTitle = computed(() => {
  const currentPreviewResource = previewResource.value
  const title = String(currentPreviewResource?.title || '').trim()
  if (title)
    return title
  if (isCollabResource(currentPreviewResource))
    return resolveCollabResourceLabel(currentPreviewResource)
  return '资料预览'
})
const flowResourceTitle = computed(() => {
  const title = String(flowResource.value?.title || '').trim()
  if (title)
    return title
  return '流程画布'
})
function resolveResourceSourceDownloadUrl(resource: Resource | null | undefined): string {
  const rawUrl = String(resource?.sourceDownloadUrl || resource?.sourceLink || '').trim()
  if (!rawUrl)
    return ''
  return resolveApiUrl(rawUrl)
}

function resolveProjectResourceShareUrl(rawUrl: string): string {
  const normalized = String(rawUrl || '').trim()
  if (!normalized)
    return ''

  const resolved = resolveApiUrl(normalized)
  return resolveAppUrl(resolved)
}

function resolveWorkspaceInvitationUrl(token: string): string {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken)
    return ''

  const path = `/invite/${encodeURIComponent(normalizedToken)}`
  return resolveAppUrl(path)
}

function resetWorkspaceMemberManagementState(): void {
  workspaceMembers.value = []
  workspaceInvitations.value = []
  workspaceMemberRoleUpdatingUserId.value = ''
  workspaceMemberRemovingUserId.value = ''
  workspaceInvitationRevokingId.value = ''
  projectSeatQuota.value = null
}

function applyWorkspaceMemberManagementSnapshot(snapshot: ProjectMemberManagementSnapshot): void {
  workspaceMembers.value = Array.isArray(snapshot.members) ? snapshot.members : []
  workspaceInvitations.value = Array.isArray(snapshot.invitations) ? snapshot.invitations : []
  projectSeatQuota.value = snapshot.seatQuota || null
}
const previewSourceDownloadUrl = computed(() => {
  const fromStatus = String(previewStatusPayload.value?.sourceDownloadUrl || '').trim()
  if (fromStatus)
    return resolveApiUrl(fromStatus)
  return resolveResourceSourceDownloadUrl(previewResource.value)
})
const previewPdfUrl = computed(() => {
  const fromStatus = String(previewStatusPayload.value?.previewUrl || '').trim()
  if (fromStatus)
    return resolveApiUrl(fromStatus)
  const projectId = String(activeProjectId.value || '').trim()
  const resourceId = String(previewResourceId.value || '').trim()
  if (!projectId || !resourceId)
    return ''
  return endpoint(`/projects/${projectId}/resources/${resourceId}/preview`)
})

function isCollabResource(resource: Resource | null | undefined): resource is Resource {
  if (!resource)
    return false
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  if (kind === 'markdown' || kind === 'draw')
    return true
  return String(resource.source || '').trim().toLowerCase() === 'collab'
}

function resolveCollabPurpose(resource: Resource | null | undefined): CollabPurpose | '' {
  if (!isCollabResource(resource))
    return ''

  const normalized = String(resource.collabPurpose || '').trim().toLowerCase()
  if (normalized === 'workflow' || normalized === 'freeform' || normalized === 'notes')
    return normalized
  return resource.resourceKind === 'markdown' ? 'notes' : 'freeform'
}

function isWorkflowCanvasResource(resource: Resource | null | undefined): resource is Resource {
  return isCollabResource(resource)
    && resource.resourceKind === 'draw'
    && resolveCollabPurpose(resource) === 'workflow'
}

function resolveCollabResourceLabel(resource: Resource | null | undefined): string {
  if (!isCollabResource(resource))
    return '协作内容'

  const purpose = resolveCollabPurpose(resource)
  if (purpose === 'workflow')
    return '流程画布'
  if (purpose === 'freeform')
    return '自由画布'
  return '协作文档'
}

function disposeCollabDocBinding(leaveRoom = true): void {
  collabSession.dispose(leaveRoom)
  collabBindingResourceId.value = ''
}

function applyCollabSnapshot(snapshot: CollabSnapshotPayload): void {
  collabSession.applySnapshot(snapshot)
}

function scheduleRealtimeProjectRefresh(): void {
  if (realtimeProjectRefreshTimer)
    return

  realtimeProjectRefreshTimer = setTimeout(() => {
    realtimeProjectRefreshTimer = null
    void (async () => {
      await refreshProjectResourceContext()
      await loadProjectOutline()
    })()
  }, 300)
}

function clearRealtimeProjectRefreshTimer(): void {
  if (!realtimeProjectRefreshTimer)
    return
  clearTimeout(realtimeProjectRefreshTimer)
  realtimeProjectRefreshTimer = null
}

function clearFallbackResourceRefreshTimer(): void {
  if (!fallbackResourceRefreshTimer)
    return
  clearInterval(fallbackResourceRefreshTimer)
  fallbackResourceRefreshTimer = null
}

function startFallbackResourceRefreshTimer(): void {
  clearFallbackResourceRefreshTimer()
  if (!activeProjectId.value || workspaceRealtime.connected.value)
    return

  fallbackResourceRefreshTimer = setInterval(() => {
    void (async () => {
      await refreshProjectResourceContext()
      await loadProjectOutline()
    })()
  }, 30_000)
}

function syncFallbackResourceRefreshTimer(): void {
  if (!activeProjectId.value || workspaceRealtime.connected.value) {
    clearFallbackResourceRefreshTimer()
    return
  }
  startFallbackResourceRefreshTimer()
}

function handleRealtimeEnvelope(message: WorkspaceRealtimeEnvelope): void {
  const messageType = String(message.type || '').trim()
  if (!messageType)
    return

  if (messageType === 'error') {
    const payload = message.payload || {}
    const code = String(payload.code || '').trim().toUpperCase()
    const text = String(payload.message || '').trim()
    if (code === 'WS_UNAUTHORIZED' || code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'WS_FORBIDDEN') {
      statusLine.value = text || '实时连接鉴权失败，请重新登录后重试。'
      return
    }
    if (text)
      statusLine.value = text
    return
  }

  if (messageType === 'project.resources.changed' || messageType === 'project.outline.changed') {
    const workspaceId = String(message.workspaceId || '').trim()
    const projectId = String(message.projectId || '').trim()
    if (workspaceId && workspaceId !== activeWorkspaceId.value)
      return
    if (projectId && projectId !== activeProjectId.value)
      return
    scheduleRealtimeProjectRefresh()
    return
  }

  collabSession.handleRealtimeEnvelope(message)
}

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
    applySidebarLayoutState({
      leftSidebarCollapsed: false,
      rightSidebarCollapsed: false,
    })
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
  const normalizeDraftBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean')
      return value
    if (typeof value === 'number')
      return value !== 0
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      return normalized === '1' || normalized === 'true' || normalized === 'yes'
    }
    return false
  }
  const normalizeUi = (value: unknown): ProjectSettingsDraftUi => {
    const uiSource = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
    return {
      leftSidebarCollapsed: normalizeDraftBoolean(uiSource.leftSidebarCollapsed),
      rightSidebarCollapsed: normalizeDraftBoolean(uiSource.rightSidebarCollapsed),
    }
  }
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
    ui: normalizeUi(source.ui),
  }
}

function applySidebarLayoutState(value: ProjectSettingsDraftUi | null | undefined): void {
  const nextLeftCollapsed = Boolean(value?.leftSidebarCollapsed)
  const nextRightCollapsed = Boolean(value?.rightSidebarCollapsed)
  if (
    leftSidebarCollapsed.value === nextLeftCollapsed
    && rightSidebarUserCollapsed.value === nextRightCollapsed
  ) {
    return
  }

  withSidebarLayoutHydrating(() => {
    leftSidebarCollapsed.value = nextLeftCollapsed
    rightSidebarUserCollapsed.value = nextRightCollapsed
  })
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
    ui: {
      leftSidebarCollapsed: Boolean(payload.ui?.leftSidebarCollapsed),
      rightSidebarCollapsed: Boolean(payload.ui?.rightSidebarCollapsed),
    },
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
    ui: {
      leftSidebarCollapsed: leftSidebarCollapsed.value,
      rightSidebarCollapsed: rightSidebarUserCollapsed.value,
    },
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

  applySidebarLayoutState(draft.ui)
  const hasLayoutDraft = Boolean(draft.ui?.leftSidebarCollapsed || draft.ui?.rightSidebarCollapsed)
  const hasDraftContent = hasCommonDraft || normalizedBindings.length > 0 || Object.keys(nextAdaptationDrafts).length > 0 || hasLayoutDraft
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
      await navigateTo(teamDashboardPath(), { replace: true })
      return false
    }

    const hasCurrent = resolveWorkspaceOptions(response.data).some(item => item.workspace.id === targetWorkspaceId)
    if (!hasCurrent) {
      await navigateTo({
        path: teamDashboardPath(),
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
      query: { redirect: route.fullPath || teamDashboardPath() },
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
  resourceLibraryLoading.value = true
  if (!activeProjectId.value) {
    resourceLibrary.value = []
    resourceLibraryLoading.value = false
    return
  }

  try {
    const response = await $fetch<ApiResponse<Resource[]>>(endpoint(`/projects/${activeProjectId.value}/resources/library`))
    resourceLibrary.value = response.data
  }
  catch {
    resourceLibrary.value = []
  }
  finally {
    resourceLibraryLoading.value = false
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

async function loadProjectResourceShares() {
  projectResourceSharesLoading.value = true
  if (!activeProjectId.value) {
    projectResourceShares.value = []
    projectResourceSharesLoading.value = false
    return
  }

  try {
    const response = await $fetch<ApiResponse<ProjectResourceShare[]>>(endpoint(`/projects/${activeProjectId.value}/resources/shares`))
    projectResourceShares.value = response.data.map(item => ({
      ...item,
      shareUrl: resolveProjectResourceShareUrl(String(item.shareUrl || '').trim()),
    }))
  }
  catch {
    projectResourceShares.value = []
  }
  finally {
    projectResourceSharesLoading.value = false
  }
}

async function refreshProjectResourceContext() {
  await Promise.all([
    loadProjectResources(),
    loadProjectResourceLibrary(),
    loadProjectRecycleResources(),
    loadProjectResourceShares(),
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
  projectOutlineLoading.value = true
  const projectId = activeProjectId.value
  if (!projectId) {
    projectOutlineSnapshot.value = null
    projectOutlineLoading.value = false
    projectOutlineFirstLoaded.value = false
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
  finally {
    if (activeProjectId.value === projectId) {
      projectOutlineLoading.value = false
      projectOutlineFirstLoaded.value = true
    }
    else if (!activeProjectId.value) {
      projectOutlineLoading.value = false
      projectOutlineFirstLoaded.value = false
    }
  }
}

async function loadAiChangeRequests() {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    aiChangeRequests.value = []
    return
  }

  aiChangeRequestsLoading.value = true
  try {
    const response = await $fetch<ApiResponse<AiProjectChangeRequest[]>>(endpoint(`/projects/${projectId}/ai/changes`), {
      query: {
        statuses: 'pending,approved,rejected,failed',
        limit: 100,
      },
    })
    if (activeProjectId.value !== projectId)
      return
    aiChangeRequests.value = response.data
    const pendingIds = new Set(
      response.data
        .filter(item => item.status === 'pending')
        .map(item => item.id),
    )
    aiChangeSecondConfirmIds.value = aiChangeSecondConfirmIds.value
      .filter(item => pendingIds.has(item))
  }
  catch {
    if (activeProjectId.value === projectId) {
      aiChangeRequests.value = []
      aiChangeSecondConfirmIds.value = []
    }
  }
  finally {
    if (activeProjectId.value === projectId)
      aiChangeRequestsLoading.value = false
  }
}

interface ProjectIssuesBundle {
  reports: ProjectIssueReport[]
  issues: ProjectIssue[]
}

async function loadProjectIssues() {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    projectIssueReports.value = []
    projectIssues.value = []
    return
  }

  issueCenterLoading.value = true
  try {
    const response = await $fetch<ApiResponse<ProjectIssuesBundle>>(endpoint(`/projects/${projectId}/issues`), {
      query: {
        statuses: 'open,in_progress,resolved,ignored',
        reportLimit: 20,
        issueLimit: 200,
      },
    })
    if (activeProjectId.value !== projectId)
      return
    projectIssueReports.value = response.data.reports || []
    projectIssues.value = response.data.issues || []
  }
  catch {
    if (activeProjectId.value === projectId) {
      projectIssueReports.value = []
      projectIssues.value = []
    }
  }
  finally {
    if (activeProjectId.value === projectId)
      issueCenterLoading.value = false
  }
}

function setAiChangeActing(changeId: string, active: boolean) {
  const normalizedId = String(changeId || '').trim()
  if (!normalizedId)
    return
  if (active) {
    if (!aiChangeActingIds.value.includes(normalizedId))
      aiChangeActingIds.value = [...aiChangeActingIds.value, normalizedId]
    return
  }
  aiChangeActingIds.value = aiChangeActingIds.value.filter(item => item !== normalizedId)
}

async function approveAiChange(change: AiProjectChangeRequest) {
  const projectId = String(activeProjectId.value || '').trim()
  const changeId = String(change.id || '').trim()
  if (!projectId || !changeId)
    return

  const requiresSecondConfirm = change.destructive && !aiChangeSecondConfirmIds.value.includes(changeId)
  if (requiresSecondConfirm) {
    aiChangeSecondConfirmIds.value = [...aiChangeSecondConfirmIds.value, changeId]
    statusLine.value = '该提案包含破坏性操作，请再次点击“通过”确认执行。'
    return
  }

  setAiChangeActing(changeId, true)
  try {
    const payload: ApproveChangeRequestPayload = {
      destructiveConfirm: Boolean(change.destructive),
    }
    await $fetch<ApiResponse<AiProjectChangeRequest>>(endpoint(`/projects/${projectId}/ai/changes/${changeId}/approve`), {
      method: 'POST',
      body: payload,
    })
    aiChangeSecondConfirmIds.value = aiChangeSecondConfirmIds.value.filter(item => item !== changeId)
    statusLine.value = `变更已通过：${change.title}`
    await Promise.all([
      loadAiChangeRequests(),
      loadProjectIssues(),
      refreshProjectResourceContext(),
      loadProjectSettings(selectedContestId.value),
      loadProjectOutline(),
    ])
  }
  catch (error) {
    const statusCode = resolveApiStatusCode(error)
    if (statusCode === 409 && change.destructive) {
      if (!aiChangeSecondConfirmIds.value.includes(changeId))
        aiChangeSecondConfirmIds.value = [...aiChangeSecondConfirmIds.value, changeId]
      statusLine.value = '破坏性提案需要二次确认，请再次点击“通过”。'
      return
    }
    aiChangeSecondConfirmIds.value = aiChangeSecondConfirmIds.value.filter(item => item !== changeId)
    statusLine.value = resolveApiErrorMessage(error, '审批通过失败，请稍后重试。')
  }
  finally {
    setAiChangeActing(changeId, false)
  }
}

async function rejectAiChange(change: AiProjectChangeRequest) {
  const projectId = String(activeProjectId.value || '').trim()
  const changeId = String(change.id || '').trim()
  if (!projectId || !changeId)
    return

  setAiChangeActing(changeId, true)
  try {
    await $fetch<ApiResponse<AiProjectChangeRequest>>(endpoint(`/projects/${projectId}/ai/changes/${changeId}/reject`), {
      method: 'POST',
      body: {},
    })
    aiChangeSecondConfirmIds.value = aiChangeSecondConfirmIds.value.filter(item => item !== changeId)
    statusLine.value = `已拒绝变更：${change.title}`
    await loadAiChangeRequests()
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '拒绝变更失败，请稍后重试。')
  }
  finally {
    setAiChangeActing(changeId, false)
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
        teamId: activeWorkspaceId.value,
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

async function loadWorkspaceMemberManagement() {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    resetWorkspaceMemberManagementState()
    return
  }

  workspaceMemberManagementLoading.value = true
  try {
    const response = await $fetch<ApiResponse<ProjectMemberManagementSnapshot>>(endpoint(`/projects/${projectId}/members`))
    if (activeProjectId.value !== projectId)
      return
    applyWorkspaceMemberManagementSnapshot(response.data)
  }
  catch {
    if (activeProjectId.value === projectId)
      resetWorkspaceMemberManagementState()
  }
  finally {
    if (activeProjectId.value === projectId || !activeProjectId.value)
      workspaceMemberManagementLoading.value = false
  }
}

function openWorkspaceSeatModal() {
  workspaceSeatLimitError.value = ''
}

async function saveWorkspaceSeatLimit(seatLimit: number) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    workspaceSeatLimitError.value = '请先选择项目。'
    return
  }

  if (!workspaceCanManageBillingSeats.value) {
    workspaceSeatLimitError.value = '当前账号无项目席位管理权限。'
    return
  }

  workspaceSeatLimitSaveLoading.value = true
  workspaceSeatLimitError.value = ''
  try {
    await $fetch<ApiResponse<ProjectSeatQuota>>(endpoint(`/projects/${projectId}/seats`), {
      method: 'PATCH',
      body: {
        seatLimit: Math.max(1, Math.trunc(Number(seatLimit || 1))),
      },
    })

    if (activeProjectId.value !== projectId)
      return

    await loadWorkspaceMemberManagement()
    workspaceSeatLimitUpdatedSignal.value += 1
    statusLine.value = '项目席位已更新。'
  }
  catch (error) {
    workspaceSeatLimitError.value = resolveApiErrorMessage(error, '更新项目席位失败。')
    statusLine.value = workspaceSeatLimitError.value
  }
  finally {
    workspaceSeatLimitSaveLoading.value = false
  }
}

async function createWorkspaceInvitation(payload: ProjectInvitationCreatePayload) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    statusLine.value = '请先选择一个项目。'
    return
  }

  if (!workspaceCanManageMembers.value) {
    statusLine.value = '当前账号无项目邀请权限。'
    return
  }

  workspaceInvitationSubmitting.value = true
  try {
    const response = await $fetch<ApiResponse<{ token: string, snapshot: ProjectMemberManagementSnapshot }>>(endpoint(`/projects/${projectId}/invitations`), {
      method: 'POST',
      body: {
        inviteeUsername: String(payload.inviteeUsername || '').trim() || undefined,
        projectRole: payload.projectRole,
        expiresInDays: Math.max(1, Math.min(30, Number(payload.expiresInDays || 7))),
      },
    })

    const token = String(response.data.token || '').trim()
    workspaceInvitationLink.value = resolveWorkspaceInvitationUrl(token)
    applyWorkspaceMemberManagementSnapshot(response.data.snapshot)
    statusLine.value = '项目邀请已生成，可复制邀请链接发送给协作者。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '创建项目邀请失败，请稍后重试。')
  }
  finally {
    workspaceInvitationSubmitting.value = false
  }
}

async function consumeJoinedProjectNotice() {
  if (!isTruthyQueryFlag(route.query.joined))
    return

  statusLine.value = '已加入当前 Team 和项目，可立即开始协作。'

  const nextQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'joined')
      continue

    const normalized = normalizeQueryParam(value)
    if (normalized)
      nextQuery[key] = normalized
  }

  await navigateTo({
    path: workspaceDetailPath(routeWorkspaceId.value, routeProjectId.value),
    query: Object.keys(nextQuery).length > 0 ? nextQuery : undefined,
  }, { replace: true })
}

async function patchWorkspaceMemberRole(payload: ProjectMemberRolePatchPayload) {
  const projectId = String(activeProjectId.value || '').trim()
  const userId = String(payload.userId || '').trim()
  if (!projectId || !userId)
    return
  if (!workspaceCanEditMembers.value) {
    statusLine.value = '当前账号无高级项目角色管理权限。'
    return
  }

  workspaceMemberRoleUpdatingUserId.value = userId
  try {
    const response = await $fetch<ApiResponse<ProjectMemberManagementSnapshot>>(
      endpoint(`/projects/${projectId}/members`),
      {
        method: 'POST',
        body: {
          userId,
          role: payload.role,
        },
      },
    )
    applyWorkspaceMemberManagementSnapshot(response.data)
    statusLine.value = '项目成员角色已更新。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '更新项目成员角色失败，请稍后重试。')
  }
  finally {
    if (workspaceMemberRoleUpdatingUserId.value === userId)
      workspaceMemberRoleUpdatingUserId.value = ''
  }
}

async function removeWorkspaceMember(userId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  const normalizedUserId = String(userId || '').trim()
  if (!projectId || !normalizedUserId)
    return
  if (!workspaceCanManageMembers.value) {
    statusLine.value = '当前账号无项目成员移除权限。'
    return
  }

  workspaceMemberRemovingUserId.value = normalizedUserId
  try {
    const response = await $fetch<ApiResponse<ProjectMemberManagementSnapshot>>(
      endpoint(`/projects/${projectId}/members/${normalizedUserId}`),
      { method: 'DELETE' },
    )
    applyWorkspaceMemberManagementSnapshot(response.data)
    statusLine.value = '项目成员已移除。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '移除项目成员失败，请稍后重试。')
  }
  finally {
    if (workspaceMemberRemovingUserId.value === normalizedUserId)
      workspaceMemberRemovingUserId.value = ''
  }
}

async function revokeWorkspaceInvitation(invitationId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  const normalizedInvitationId = String(invitationId || '').trim()
  if (!projectId || !normalizedInvitationId)
    return
  if (!workspaceCanManageMembers.value) {
    statusLine.value = '当前账号无项目邀请撤销权限。'
    return
  }

  workspaceInvitationRevokingId.value = normalizedInvitationId
  try {
    const response = await $fetch<ApiResponse<ProjectMemberManagementSnapshot & { revoked?: boolean }>>(
      endpoint(`/projects/${projectId}/invitations/${normalizedInvitationId}/revoke`),
      { method: 'POST' },
    )
    applyWorkspaceMemberManagementSnapshot(response.data)
    statusLine.value = response.data.revoked ? '项目邀请已撤销。' : '该项目邀请已失效，无需重复撤销。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '撤销项目邀请失败，请稍后重试。')
  }
  finally {
    if (workspaceInvitationRevokingId.value === normalizedInvitationId)
      workspaceInvitationRevokingId.value = ''
  }
}

async function copyWorkspaceInvitationLink() {
  const link = String(workspaceInvitationLink.value || '').trim()
  if (!link) {
    statusLine.value = '暂无可复制的邀请链接。'
    return
  }

  if (!import.meta.client || !navigator?.clipboard?.writeText) {
    statusLine.value = `邀请链接：${link}`
    return
  }

  try {
    await navigator.clipboard.writeText(link)
    statusLine.value = '邀请链接已复制。'
  }
  catch {
    statusLine.value = `复制失败，请手动复制：${link}`
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

async function createCollabResource(kind: 'markdown' | 'draw') {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId)
    return

  resourceMutating.value = true
  const resourceLabel = kind === 'draw' ? '自由画布' : '协作文档'
  try {
    const response = await $fetch<ApiResponse<{ resource: Resource, snapshot: CollabSnapshotPayload }>>(endpoint(`/projects/${projectId}/resources/collab`), {
      method: 'POST',
      body: {
        kind,
      },
    })

    await refreshProjectResourceContext()

    const createdResource = response.data?.resource
    const snapshot = response.data?.snapshot
    if (createdResource?.id) {
      await openProjectCollabResource(createdResource.id, snapshot || null, {
        surface: 'preview',
      })
      statusLine.value = kind === 'draw'
        ? '已创建自由画布，协作模式已打开。'
        : '已创建协作文档，协作模式已打开。'
      return
    }

    statusLine.value = `${resourceLabel}已创建。`
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, `创建${resourceLabel}失败，请稍后重试。`)
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
  const isRemovingPreviewResource = previewResourceId.value === targetResourceId

  resourceMutating.value = true
  try {
    await $fetch(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}`), {
      method: 'DELETE',
    })
    if (isRemovingPreviewResource)
      closeProjectResourcePreview()
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

async function duplicateProjectResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!activeProjectId.value || !targetResourceId)
    return

  resourceMutating.value = true
  try {
    const response = await $fetch<ApiResponse<Resource>>(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}/duplicate`), {
      method: 'POST',
    })
    await refreshProjectResourceContext()
    await generateProjectOutline('resource_duplicate_success', true)
    const duplicatedTitle = String(response.data?.title || '').trim()
    statusLine.value = duplicatedTitle
      ? `已创建副本：${duplicatedTitle}`
      : '已创建文件副本。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '创建副本失败，请稍后重试。')
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

function clearPreviewStatusPolling() {
  if (!previewStatusPollTimer)
    return
  clearInterval(previewStatusPollTimer)
  previewStatusPollTimer = null
}

function updateCollabDrawContent(value: string): void {
  collabSession.updateDraw(String(value || ''))
}

async function fetchCollabSnapshot(resourceId: string): Promise<CollabSnapshotPayload | null> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetResourceId = String(resourceId || '').trim()
  if (!projectId || !targetResourceId)
    return null

  const targetResource = resources.value.find(item => item.id === targetResourceId) || null
  const resourceLabel = resolveCollabResourceLabel(targetResource)

  try {
    const response = await $fetch<ApiResponse<CollabSnapshotPayload>>(endpoint(`/projects/${projectId}/resources/${targetResourceId}/collab`))
    return response.data
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, `读取${resourceLabel}失败，请稍后重试。`)
    return null
  }
}

interface OpenPreviewOptions {
  openTab?: boolean
}

interface OpenCollabOptions extends OpenPreviewOptions {
  surface?: 'preview' | 'flow'
}

async function bindCollabResource(
  resourceId: string,
  snapshot?: CollabSnapshotPayload | null,
): Promise<CollabSnapshotPayload | null> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetResourceId = String(resourceId || '').trim()
  if (!projectId || !targetResourceId)
    return null

  const targetSnapshot = snapshot || await fetchCollabSnapshot(targetResourceId)
  if (!targetSnapshot)
    return null

  disposeCollabDocBinding(true)
  collabBindingResourceId.value = targetResourceId
  applyCollabSnapshot(targetSnapshot)
  collabSession.activateRoom()
  return targetSnapshot
}

async function openProjectCollabResource(
  resourceId: string,
  snapshot?: CollabSnapshotPayload | null,
  options: OpenCollabOptions = {},
): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetResourceId = String(resourceId || '').trim()
  if (!projectId || !targetResourceId)
    return

  const targetSnapshot = await bindCollabResource(targetResourceId, snapshot)
  if (!targetSnapshot)
    return

  clearPreviewStatusPolling()
  previewStatusPayload.value = null
  previewStatusLoading.value = false
  if (options.surface === 'flow') {
    flowResourceId.value = targetResourceId
    if (options.openTab !== false)
      openFlowSignal.value += 1
    return
  }

  previewMode.value = targetSnapshot.kind
  previewResourceId.value = targetResourceId
  closingPreviewResourceId.value = ''
  if (options.openTab !== false)
    openPreviewSignal.value += 1
}

async function ensureWorkflowCanvas(options: OpenPreviewOptions = {}): Promise<boolean> {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId)
    return false

  try {
    const response = await $fetch<ApiResponse<{ resource: Resource, snapshot: CollabSnapshotPayload }>>(endpoint(`/projects/${projectId}/resources/collab`), {
      method: 'POST',
      body: {
        kind: 'draw',
        purpose: 'workflow',
      },
    })

    await refreshProjectResourceContext()
    await openProjectCollabResource(response.data.resource.id, response.data.snapshot || null, {
      openTab: options.openTab,
      surface: 'flow',
    })
    return true
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '打开流程画布失败，请稍后重试。')
    return false
  }
}

async function fetchResourcePreviewStatus(resourceId: string, silent = false) {
  const projectId = String(activeProjectId.value || '').trim()
  const targetResourceId = String(resourceId || '').trim()
  if (!projectId || !targetResourceId)
    return

  if (!silent)
    previewStatusLoading.value = true

  try {
    const response = await $fetch<ApiResponse<ResourcePreviewStatusPayload>>(endpoint(`/projects/${projectId}/resources/${targetResourceId}/preview-status`))
    previewStatusPayload.value = response.data

    if (response.data.status === 'succeeded' || response.data.status === 'failed')
      clearPreviewStatusPolling()
  }
  catch (error) {
    if (!silent)
      statusLine.value = resolveApiErrorMessage(error, '获取预览状态失败。')
  }
  finally {
    if (!silent)
      previewStatusLoading.value = false
  }
}

function startPreviewStatusPolling(resourceId: string) {
  clearPreviewStatusPolling()
  previewStatusPollTimer = setInterval(() => {
    void fetchResourcePreviewStatus(resourceId, true)
  }, 2000)
}

async function openProjectResourcePreview(resourceId: string, options: OpenPreviewOptions = {}) {
  const targetResource = resources.value.find(item => item.id === resourceId) || null
  if (isCollabResource(targetResource)) {
    await openProjectCollabResource(resourceId, undefined, options)
    return
  }

  const targetResourceId = String(resourceId || '').trim()
  if (!activeProjectId.value || !targetResourceId)
    return

  disposeCollabDocBinding(true)
  previewMode.value = 'binary'
  previewResourceId.value = targetResourceId
  closingPreviewResourceId.value = ''
  if (options.openTab !== false)
    openPreviewSignal.value += 1
  previewStatusPayload.value = null

  await fetchResourcePreviewStatus(targetResourceId)
  const currentStatus = ((previewStatusPayload.value as any)?.status || '') as ResourcePreviewStatus | ''
  if (currentStatus !== 'succeeded' && currentStatus !== 'failed')
    startPreviewStatusPolling(targetResourceId)
}

async function activateProjectResourceTab(resourceId: string): Promise<void> {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId)
    return
  await openProjectResourcePreview(targetResourceId, { openTab: false })
}

function closeProjectResourcePreview(resourceId = previewResourceId.value) {
  const targetResourceId = String(resourceId || '').trim()
  const activeResourceId = String(previewResourceId.value || '').trim()
  if (!targetResourceId || targetResourceId !== activeResourceId)
    return

  const preserveFlowBinding = targetResourceId === String(flowResourceId.value || '').trim()
    && activeMainTabId.value === 'flow'

  closingPreviewResourceId.value = targetResourceId
  if (!preserveFlowBinding)
    disposeCollabDocBinding(true)
  previewMode.value = 'binary'
  previewStatusPayload.value = null
  previewStatusLoading.value = false
  previewResourceId.value = ''
  clearPreviewStatusPolling()
  closePreviewSignal.value += 1
}

function downloadProjectResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId)
    return

  const targetResource = resources.value.find(item => item.id === targetResourceId)
  const targetUrl = resolveResourceSourceDownloadUrl(targetResource)
  if (!targetUrl) {
    statusLine.value = '当前资源缺少可下载原文件地址。'
    return
  }

  if (import.meta.client)
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
}

function copyTextWithFallback(text: string): boolean {
  if (!import.meta.client || !text)
    return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  }
  catch {
    copied = false
  }
  document.body.removeChild(textarea)
  return copied
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text)
    return false

  if (import.meta.client && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch {
      // ignore clipboard permissions errors and fallback to execCommand
    }
  }

  return copyTextWithFallback(text)
}

async function copyProjectResourceName(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId)
    return

  const targetResource = resources.value.find(item => item.id === targetResourceId)
  const targetName = String(targetResource?.title || '').trim()
  if (!targetName) {
    statusLine.value = '资源名称为空，无法复制。'
    return
  }

  const copied = await copyTextToClipboard(targetName)
  statusLine.value = copied
    ? '文件名已复制。'
    : `文件名：${targetName}`
}

async function shareProjectResource(payload: ProjectResourceShareCreatePayload) {
  const projectId = String(activeProjectId.value || '').trim()
  const targetResourceId = String(payload?.resourceId || '').trim()
  const visibility = payload?.visibility
  const duration = payload?.duration
  if (!projectId || !targetResourceId || !visibility || !duration)
    return

  try {
    const response = await $fetch<ApiResponse<ProjectResourceShare>>(endpoint(`/projects/${projectId}/resources/${targetResourceId}/shares`), {
      method: 'POST',
      body: {
        visibility,
        duration,
      },
    })

    const share = response.data
    const shareUrl = resolveProjectResourceShareUrl(String(share?.shareUrl || '').trim())
    await loadProjectResourceShares()

    if (!shareUrl) {
      statusLine.value = '分享链接已创建，请在项目设置中查看。'
      return
    }

    const copied = await copyTextToClipboard(shareUrl)
    statusLine.value = copied
      ? '分享链接已生成并复制。'
      : `分享链接：${shareUrl}`
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '创建分享链接失败，请稍后重试。')
  }
}

async function copyProjectResourceShare(shareId: string) {
  const targetShareId = String(shareId || '').trim()
  if (!targetShareId)
    return

  const target = projectResourceShares.value.find(item => item.id === targetShareId)
  const shareUrl = resolveProjectResourceShareUrl(String(target?.shareUrl || '').trim())
  if (!shareUrl) {
    statusLine.value = '分享链接不存在，或已失效。'
    return
  }

  const copied = await copyTextToClipboard(shareUrl)
  statusLine.value = copied
    ? '分享链接已复制。'
    : `分享链接：${shareUrl}`
}

async function revokeProjectResourceShare(shareId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  const targetShareId = String(shareId || '').trim()
  if (!projectId || !targetShareId)
    return

  try {
    await $fetch(endpoint(`/projects/${projectId}/resources/shares/${targetShareId}`), {
      method: 'DELETE',
    })
    await loadProjectResourceShares()
    statusLine.value = '分享链接已失效。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '失效分享链接失败，请稍后重试。')
  }
}

async function downloadPreviewSource() {
  const projectId = String(activeProjectId.value || '').trim()
  const resourceId = String(previewResourceId.value || '').trim()
  if (!projectId || !resourceId)
    return

  const popup = import.meta.client
    ? window.open('', '_blank', 'noopener,noreferrer')
    : null

  await fetchResourcePreviewStatus(resourceId, true).catch(() => undefined)
  const target = String(previewSourceDownloadUrl.value || '').trim()
  if (!target) {
    popup?.close()
    statusLine.value = '当前资源缺少可下载源文件地址。'
    return
  }

  if (popup) {
    popup.location.href = target
    return
  }

  if (import.meta.client)
    window.open(target, '_blank', 'noopener,noreferrer')
}

async function reconvertProjectResourcePreview() {
  const projectId = String(activeProjectId.value || '').trim()
  const resourceId = String(previewResourceId.value || '').trim()
  if (!projectId || !resourceId)
    return

  previewStatusLoading.value = true
  try {
    await $fetch(endpoint(`/projects/${projectId}/resources/${resourceId}/reconvert`), {
      method: 'POST',
    })
    statusLine.value = '已重新加入转换队列。'
    await fetchResourcePreviewStatus(resourceId, true)
    startPreviewStatusPolling(resourceId)
    await refreshProjectResourceContext()
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '重新转换失败，请稍后重试。')
  }
  finally {
    previewStatusLoading.value = false
  }
}

async function loadChatMessages(sessionId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!activeWorkspaceId.value || !projectId || !sessionId) {
    resetChatStateWithGreeting()
    return
  }

  try {
    const response = await $fetch<ApiResponse<{ session: AiChatSession, messages: AiChatMessage[] }>>(
      endpoint(`/teams/${activeWorkspaceId.value}/chat/sessions/${sessionId}/messages`),
      {
        query: {
          projectId,
          mode: aiMode.value,
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

  if (aiMode.value === 'auto_optimize')
    return `自动优化 · ${contestName} · ${trackName}`
  if (aiMode.value === 'issue_discovery')
    return `寻疑发现 · ${contestName} · ${trackName}`
  if (aiMode.value === 'defense')
    return `答辩模拟 · ${contestName} · ${trackName}`
  return `对话询问 · ${contestName} · ${trackName}`
}

async function createChatSession(preferredTitle = ''): Promise<string | null> {
  const projectId = String(activeProjectId.value || '').trim()
  if (!activeWorkspaceId.value || !projectId)
    return null

  try {
    const response = await $fetch<ApiResponse<AiChatSession>>(
      endpoint(`/teams/${activeWorkspaceId.value}/chat/sessions`),
      {
        method: 'POST',
        body: {
          projectId,
          mode: aiMode.value,
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
  const projectId = String(activeProjectId.value || '').trim()
  if (!activeWorkspaceId.value || !projectId) {
    chatSessions.value = []
    activeChatSessionId.value = ''
    resetChatStateWithGreeting()
    return
  }

  chatSessionsLoading.value = true
  try {
    const response = await $fetch<ApiResponse<AiChatSession[]>>(
      endpoint(`/teams/${activeWorkspaceId.value}/chat/sessions`),
      {
        query: {
          projectId,
          mode: aiMode.value,
          limit: 30,
        },
      },
    )
    chatSessions.value = response.data

    const nextSession = chatSessions.value.find(item => item.id === preferredSessionId) || chatSessions.value.find(item => item.id === activeChatSessionId.value) || chatSessions.value[0]

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
  let modeTitle = '新建 AI 对话'
  if (aiMode.value === 'defense')
    modeTitle = '新建答辩会话'
  else if (aiMode.value === 'auto_optimize')
    modeTitle = '新建自动优化会话'
  else if (aiMode.value === 'issue_discovery')
    modeTitle = '新建寻疑发现会话'
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
        teamId: activeWorkspaceId.value,
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

function toModelMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role,
      content: message.content,
    }))
}

function summarizeToolPayload(payload: unknown, maxLength = 120): string {
  if (payload === null || payload === undefined)
    return ''

  const normalized = typeof payload === 'string'
    ? payload.trim()
    : (() => {
        try {
          return JSON.stringify(payload)
        }
        catch {
          return ''
        }
      })()

  if (!normalized || normalized === '{}' || normalized === '[]')
    return ''

  if (normalized.length <= maxLength)
    return normalized
  return `${normalized.slice(0, maxLength)}...`
}

function buildWorkspaceSystemMessage(eventType: 'progress' | 'tool', data: Record<string, unknown>): ChatMessage {
  if (eventType === 'progress') {
    const message = String(data.message || 'AI 处理中...').trim() || 'AI 处理中...'
    return {
      role: 'system',
      content: `进度：${message}`,
    }
  }

  const toolName = String(data.name || '').trim() || 'unknown_tool'
  const summary = summarizeToolPayload(data.payload)
  return {
    role: 'system',
    content: summary
      ? `工具：${toolName} · ${summary}`
      : `工具：${toolName}`,
  }
}

async function sendWorkspaceAiMessage(pendingMessages: ChatMessage[]) {
  const runningMode = aiMode.value
  chatDraft.value = null
  chatMissingFields.value = []
  defenseRounds.value = []
  defenseScorecard.value = null
  const baseMessages = [...pendingMessages]
  const streamSystemMessages: ChatMessage[] = []
  let assistantBuffer = ''

  const renderStreamMessages = () => {
    const nextMessages: ChatMessage[] = [...baseMessages, ...streamSystemMessages]
    if (assistantBuffer)
      nextMessages.push({ role: 'assistant', content: assistantBuffer })
    chatMessages.value = nextMessages
  }

  const requestBody: AiWorkspaceRequest = {
    teamId: activeWorkspaceId.value,
    workspaceId: activeWorkspaceId.value,
    projectId: activeProjectId.value,
    sessionId: activeChatSessionId.value,
    mode: runningMode,
    messages: toModelMessages(pendingMessages),
    context: {
      teamId: activeWorkspaceId.value,
      workspaceId: activeWorkspaceId.value,
      projectId: activeProjectId.value,
      contestId: selectedContestId.value,
      trackId: selectedTrackId.value,
      major: major.value,
    },
  }

  const response = await fetch(endpoint('/ai/workspace/stream'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
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
        ? JSON.parse(parsed.dataText) as AiWorkspaceStreamEvent
        : null
      const eventType = (payload?.event || parsed.eventType) as AiWorkspaceStreamEventType
      const data = toJsonPayload(payload?.data)

      if (eventType === 'progress') {
        statusLine.value = String(data.message || 'AI 处理中...')
        if (data.sessionId)
          activeChatSessionId.value = String(data.sessionId)
        streamSystemMessages.push(buildWorkspaceSystemMessage('progress', data))
        renderStreamMessages()
        continue
      }

      if (eventType === 'tool') {
        const name = String(data.name || '').trim()
        if (name)
          statusLine.value = `AI 正在调用工具：${name}`
        else
          statusLine.value = 'AI 正在调用工具...'
        streamSystemMessages.push(buildWorkspaceSystemMessage('tool', data))
        renderStreamMessages()
        continue
      }

      if (eventType === 'delta') {
        assistantBuffer += String(data.text || '')
        renderStreamMessages()
        continue
      }

      if (eventType === 'done') {
        const result = toJsonPayload(data.result) as Partial<AiWorkspaceResult>
        assistantBuffer = String(result.assistantReply || assistantBuffer)
        renderStreamMessages()

        if (result.sessionId)
          activeChatSessionId.value = String(result.sessionId)

        if (runningMode === 'auto_optimize') {
          const createdCount = Array.isArray(result.proposals) ? result.proposals.length : 0
          statusLine.value = createdCount > 0
            ? `已生成 ${createdCount} 条待审批变更。`
            : '自动优化已完成，暂未生成可审批提案。'
        }
        else if (runningMode === 'issue_discovery') {
          const report = result.report as ProjectIssueReport | null | undefined
          const issues = Array.isArray(result.issues) ? result.issues as ProjectIssue[] : []
          if (report) {
            projectIssueReports.value = [
              report,
              ...projectIssueReports.value.filter(item => item.id !== report.id),
            ]
          }
          if (issues.length > 0) {
            const merged = [...issues, ...projectIssues.value]
            const dedupe = new Map<string, ProjectIssue>()
            for (const item of merged)
              dedupe.set(item.id, item)
            projectIssues.value = [...dedupe.values()]
          }
          statusLine.value = issues.length > 0
            ? `寻疑扫描完成，发现 ${issues.length} 条问题。`
            : '寻疑扫描完成。'
        }
        else {
          statusLine.value = '只读对话完成。'
        }
        continue
      }

      if (eventType === 'error')
        throw new Error(String(data.message || '工作台 AI 调用失败。'))
    }
  }

  buffer += decoder.decode()
  const tail = parseSseBlock(buffer)
  if (tail?.dataText) {
    const payload = JSON.parse(tail.dataText) as AiWorkspaceStreamEvent
    if (payload.event === 'error')
      throw new Error(String(toJsonPayload(payload.data).message || '工作台 AI 调用失败。'))
  }

  if (runningMode === 'auto_optimize')
    await loadAiChangeRequests()
  if (runningMode === 'issue_discovery')
    await loadProjectIssues()
}

async function sendDefenseMessage(pendingMessages: ChatMessage[]) {
  chatDraft.value = null
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
      teamId: activeWorkspaceId.value,
      workspaceId: activeWorkspaceId.value,
      sessionId: activeChatSessionId.value,
      messages: toModelMessages(pendingMessages),
      context: {
        teamId: activeWorkspaceId.value,
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

  if (!activeProjectId.value) {
    statusLine.value = '请先选择一个项目。'
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

  const sessionInScope = chatSessions.value.some(item => item.id === activeChatSessionId.value)
  if (!sessionInScope) {
    const recreatedId = await createChatSession()
    if (!recreatedId) {
      statusLine.value = '当前会话不属于该项目作用域，且重建失败。'
      return
    }
    activeChatSessionId.value = recreatedId
    await loadChatSessions(recreatedId)
  }

  const pendingMessages = [...chatMessages.value, { role: 'user' as const, content }]
  chatMessages.value = pendingMessages
  chatInput.value = ''
  chatLoading.value = true
  let streamFailed = false

  try {
    if (aiMode.value === 'defense')
      await sendDefenseMessage(pendingMessages)
    else
      await sendWorkspaceAiMessage(pendingMessages)
  }
  catch (error) {
    streamFailed = true
    const message = error instanceof Error ? error.message : 'AI 调用失败。'
    const errorText = message || '聊天服务暂不可用，请稍后重试。'
    const existingMessages = [...chatMessages.value]
    const lastMessage = existingMessages[existingMessages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content !== errorText) {
      chatMessages.value = [...existingMessages, { role: 'assistant', content: errorText }]
    }
    statusLine.value = errorText
  }
  finally {
    chatLoading.value = false
    if (!streamFailed)
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
      teamId: activeWorkspaceId.value,
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

  await navigateTo(workspaceDetailPath(payload.workspaceId, payload.projectId))
}

async function openFinalReviewFromHeader() {
  const opened = await ensureWorkflowCanvas()
  if (opened)
    statusLine.value = '已打开流程画布，可按流程继续推进终审。'
}

function openSettingsFromLeftSidebar() {
  openSettingsSignal.value += 1
  statusLine.value = '已打开设置页，可配置项目底座并管理项目协作邀请。'
}

function openMemberManagementFromLeftSidebar() {
  openMemberManagementSignal.value += 1
  statusLine.value = '已打开项目协作，可查看成员、席位并发起邀请。'
}

async function openFlowFromLeftSidebar() {
  const opened = await ensureWorkflowCanvas()
  if (opened)
    statusLine.value = '已打开流程画布，可继续协作梳理项目流程。'
}

function openDefenseFromLeftSidebar() {
  aiMode.value = 'defense'
  statusLine.value = '已切换到答辩模拟模式，可直接发起多评委追问。'
}

onMounted(async () => {
  const canonicalRedirected = await ensureCanonicalWorkspaceProjectRoute()
  if (canonicalRedirected)
    return

  const ok = await loadAuthContext()
  if (!ok)
    return

  initializeRightSidebarBreakpointTracking()
  workspaceRealtime.connect()
  if (unsubscribeRealtimeMessages)
    unsubscribeRealtimeMessages()
  unsubscribeRealtimeMessages = workspaceRealtime.onMessage(handleRealtimeEnvelope)
  if (activeWorkspaceId.value)
    workspaceRealtime.subscribeWorkspace(activeWorkspaceId.value)

  await Promise.all([loadContestCatalog(), loadContests(), loadProjects(), loadQuickSwitchProjects(), loadChatSessions(), loadWorkspaceMemberManagement()])
  if (activeWorkspaceId.value)
    workspaceRealtime.subscribeWorkspace(activeWorkspaceId.value)
  if (activeProjectId.value)
    workspaceRealtime.subscribeProject(activeProjectId.value)
  await refreshProjectResourceContext()
  await loadProjectOutline()
  await loadProjectSettings(selectedContestId.value)
  await Promise.all([loadAiChangeRequests(), loadProjectIssues()])
  syncFallbackResourceRefreshTimer()
  syncFormContestTrack()
  if (highlightedProjectId.value) {
    const target = projects.value.find(item => item.id === highlightedProjectId.value)
    if (target)
      statusLine.value = `已定位项目：${target.title}`
  }
  await consumeJoinedProjectNotice()
})

onBeforeUnmount(() => {
  clearProjectSettingsAutoTimers()
  clearProjectOutlineGenerateTimer()
  clearPreviewStatusPolling()
  clearRealtimeProjectRefreshTimer()
  clearFallbackResourceRefreshTimer()
  if (unsubscribeRightSidebarBreakpoint) {
    unsubscribeRightSidebarBreakpoint()
    unsubscribeRightSidebarBreakpoint = null
  }
  if (unsubscribeRealtimeMessages) {
    unsubscribeRealtimeMessages()
    unsubscribeRealtimeMessages = null
  }
  disposeCollabDocBinding(true)
  workspaceRealtime.disconnect()
})

watch(activeWorkspaceId, async (value, previous) => {
  if (!value || value === previous)
    return

  workspaceRealtime.subscribeWorkspace(value)

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

  const hasCurrent = resolveWorkspaceOptions(me.value).some(item => item.workspace.id === value)
  if (!hasCurrent) {
    await navigateTo({
      path: teamDashboardPath(),
      query: { deniedWorkspaceId: value },
    }, { replace: true })
    return
  }

  if (activeWorkspaceId.value !== value)
    activeWorkspaceId.value = value
  workspaceRealtime.subscribeWorkspace(value)
  workspaceInvitationLink.value = ''
  projectSeatQuota.value = null
  workspaceSeatLimitError.value = ''

  statusLine.value = `已切换到空间：${currentWorkspace.value?.workspace.name || value}`
  await Promise.all([loadContestCatalog(), loadProjects(), loadQuickSwitchProjects(), loadChatSessions(), loadWorkspaceMemberManagement()])
  await refreshProjectResourceContext()
  await loadProjectOutline()
  await loadProjectSettings(selectedContestId.value)
  await Promise.all([loadAiChangeRequests(), loadProjectIssues()])
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
  clearRealtimeProjectRefreshTimer()
  clearFallbackResourceRefreshTimer()
  projectOutlineFirstLoaded.value = false
  closeProjectResourcePreview()
  if (next)
    workspaceRealtime.subscribeProject(next)
  await refreshProjectResourceContext()
  if (!next) {
    disposeCollabDocBinding(true)
    flowResourceId.value = ''
    projectOutlineSnapshot.value = null
    resetProjectSettingsState(null)
    aiChangeRequests.value = []
    projectIssueReports.value = []
    projectIssues.value = []
    resetWorkspaceMemberManagementState()
    chatSessions.value = []
    activeChatSessionId.value = ''
    resetChatStateWithGreeting()
    return
  }
  syncFallbackResourceRefreshTimer()
  resetProjectSettingsState(activeProject.value)
  await Promise.all([
    loadWorkspaceMemberManagement(),
    loadProjectOutline(),
    loadProjectSettings(selectedContestId.value),
    loadAiChangeRequests(),
    loadProjectIssues(),
    loadChatSessions(),
  ])
})

watch(resources, (nextResources) => {
  const workflowResource = nextResources.find(item => isWorkflowCanvasResource(item)) || null
  if (workflowResource && !flowResourceId.value)
    flowResourceId.value = workflowResource.id

  if (flowResourceId.value && !nextResources.some(item => item.id === flowResourceId.value)) {
    const shouldDispose = collabBindingResourceId.value === flowResourceId.value && activeMainTabId.value === 'flow'
    flowResourceId.value = ''
    if (shouldDispose)
      disposeCollabDocBinding(true)
  }
}, { deep: true })

watch(activeMainTabId, async (next, previous) => {
  if (next === previous)
    return

  if (next === 'flow') {
    const targetResourceId = String(flowResourceId.value || '').trim()
    if (!targetResourceId)
      return
    if (collabBindingResourceId.value === targetResourceId)
      return
    await openProjectCollabResource(targetResourceId, undefined, {
      openTab: false,
      surface: 'flow',
    })
    return
  }

  if (!next.startsWith('resource:'))
    return

  const targetResourceId = String(previewResourceId.value || '').trim()
  if (!targetResourceId || collabBindingResourceId.value === targetResourceId)
    return

  const targetResource = resources.value.find(item => item.id === targetResourceId) || null
  if (!isCollabResource(targetResource))
    return

  await openProjectCollabResource(targetResourceId, undefined, {
    openTab: false,
    surface: 'preview',
  })
})

watch([leftSidebarCollapsed, rightSidebarCollapsed], ([nextLeft, nextRight], [prevLeft, prevRight]) => {
  if (nextLeft === prevLeft && nextRight === prevRight)
    return
  if (sidebarLayoutHydrating.value || !activeProjectId.value)
    return
  scheduleProjectSettingsDraftPersist()
})

watch(aiMode, async (next, previous) => {
  if (next === previous)
    return

  if (!activeWorkspaceId.value || !activeProjectId.value) {
    chatSessions.value = []
    activeChatSessionId.value = ''
    resetChatStateWithGreeting()
    return
  }

  activeChatSessionId.value = ''
  resetChatStateWithGreeting()
  await loadChatSessions()
})

watch(() => workspaceRealtime.connected.value, () => {
  syncFallbackResourceRefreshTimer()
})
</script>

<template>
  <div class="workspace-shell text-slate-800 bg-white h-full min-h-0 overflow-hidden">
    <WorkspaceHeader
      v-model="headerSearch"
      :project-name="headerProjectName"
      :my-projects="myQuickSwitchProjects"
      :recent-projects="recentQuickSwitchProjects"
      @final-review="openFinalReviewFromHeader"
      @quick-switch-project="switchProjectFromHeader"
    />

    <main class="workspace-layout flex flex-1 min-h-0 items-stretch overflow-hidden xl:flex-row">
      <div v-if="!leftSidebarCollapsed" class="workspace-side-anchor workspace-side-anchor--left">
        <WorkspaceLeftSidebar
          v-model:natural-query="naturalQuery"
          v-model:major="major"
          v-model:discipline="discipline"
          v-model:level="level"
          v-model:track-type="trackType"
          v-model:top-k="topK"
          v-model:selected-contest-id="selectedContestId"
          class="min-h-0 overflow-hidden"
          :contests="filteredContests"
          :selected-resources="selectedResources"
          :recycle-resources="recycleResources"
          :resource-library="resourceLibrary"
          :linked-contest-resource-groups="linkedContestResourceGroups"
          :linked-contest-binding-count="projectSettingsBindings.length"
          :project-outline="projectOutlineItems"
          :issue-reports="projectIssueReports"
          :project-issues="projectIssues"
          :issue-loading="issueCenterLoading"
          :project-resources-loading="resourcesLoading"
          :resource-library-loading="resourceLibraryLoading"
          :project-outline-loading="projectOutlineFirstLoadLoading"
          :resource-mutating="resourceMutating"
          :has-active-project="Boolean(activeProjectId)"
          :ai-reasoning="aiReasoning"
          :normalized-info="normalizedInfo"
          :status-line="statusLine"
          :list-loading="listLoading"
          :ai-filtering="aiFiltering"
          :is-admin-view="isAdminView"
          :active-main-tab-id="activeMainTabId"
          :defense-active="aiMode === 'defense'"
          :current-user-id="me?.user.id || ''"
          :current-username="me?.user.username || ''"
          :project-storage-limit-bytes="PROJECT_RESOURCE_STORAGE_LIMIT_BYTES"
          @load-contests="loadContests"
          @run-ai-filter="runAiFilter"
          @open-settings-panel="openSettingsFromLeftSidebar"
          @open-member-management-panel="openMemberManagementFromLeftSidebar"
          @open-flow-panel="openFlowFromLeftSidebar"
          @create-collab-resource="createCollabResource"
          @open-defense-mode="openDefenseFromLeftSidebar"
          @reload-issues="loadProjectIssues"
          @open-resource="openProjectResourcePreview"
          @download-project-resource="downloadProjectResource"
          @copy-project-resource-name="copyProjectResourceName"
          @share-project-resource="shareProjectResource"
          @duplicate-project-resource="duplicateProjectResource"
          @add-resource-from-library="addResourceFromLibrary"
          @remove-project-resource="removeProjectResource"
          @restore-project-resource="restoreProjectResource"
          @purge-project-resource="purgeProjectResource"
          @upload-resources="uploadResourcesToProject"
        />
        <div class="workspace-side-handle workspace-side-handle--left workspace-side-handle--left-expanded">
          <button
            class="workspace-side-toggle"
            type="button"
            title="收起左侧栏"
            aria-label="收起左侧栏"
            @click="leftSidebarCollapsed = true"
          >
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
        </div>
      </div>
      <div v-else class="workspace-side-handle workspace-side-handle--left workspace-side-handle--left-collapsed">
        <button
          class="workspace-side-toggle"
          type="button"
          title="展开左侧栏"
          aria-label="展开左侧栏"
          @click="leftSidebarCollapsed = false"
        >
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <WorkspaceMainPanel
        v-model:selected-track-id="selectedTrackId"
        v-model:major="major"
        v-model:discipline="discipline"
        v-model:level="level"
        v-model:track-type="trackType"
        v-model:top-k="topK"
        v-model:selected-contest-id="selectedContestId"
        class="min-h-0 overflow-hidden"
        :selected-contest="selectedContest"
        :selected-track="selectedTrack"
        :contests="contestSource"
        :active-project="activeProject"
        :workspace-name="currentWorkspace?.workspace.name || ''"
        :workspace-type="currentWorkspace?.workspace.type || ''"
        :workspace-members="workspaceMembers"
        :workspace-invitations="workspaceInvitations"
        :workspace-member-management-loading="workspaceMemberManagementLoading"
        :workspace-can-manage-members="workspaceCanManageMembers"
        :workspace-can-edit-members="workspaceCanEditMembers"
        :workspace-member-role-updating-user-id="workspaceMemberRoleUpdatingUserId"
        :workspace-member-removing-user-id="workspaceMemberRemovingUserId"
        :workspace-invitation-revoking-id="workspaceInvitationRevokingId"
        :workspace-can-manage-billing-seats="workspaceCanManageBillingSeats"
        :workspace-seat-used="workspaceSeatUsed"
        :workspace-seat-limit="workspaceSeatLimit"
        :workspace-supports-seat-add="workspaceSupportsSeatAdd"
        :workspace-invitation-submitting="workspaceInvitationSubmitting"
        :workspace-invitation-link="workspaceInvitationLink"
        :workspace-seat-limit-save-loading="workspaceSeatLimitSaveLoading"
        :workspace-seat-limit-error="workspaceSeatLimitError"
        :workspace-seat-limit-updated-signal="workspaceSeatLimitUpdatedSignal"
        :open-settings-signal="openSettingsSignal"
        :open-member-management-signal="openMemberManagementSignal"
        :open-flow-signal="openFlowSignal"
        :open-preview-signal="openPreviewSignal"
        :close-preview-signal="closePreviewSignal"
        :flow-resource-id="flowResourceId"
        :flow-resource-title="flowResourceTitle"
        :preview-resource-id="previewResourceId"
        :closing-preview-resource-id="closingPreviewResourceId"
        :preview-resource-title="previewResourceTitle"
        :preview-status="previewStatusPayload"
        :preview-status-loading="previewStatusLoading"
        :preview-mode="previewMode"
        :preview-pdf-url="previewPdfUrl"
        :preview-source-download-url="previewSourceDownloadUrl"
        :collab-markdown-doc="collabMarkdownDoc"
        :collab-draw-value="collabDrawValue"
        :collab-draw-error="collabDrawError"
        :collab-revision="collabRevision"
        :collab-connected="collabConnected"
        :collab-status-text="collabStatusText"
        :collab-presence-members="collabPresenceMembers"
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
        :project-resource-shares="projectResourceShares"
        :project-resource-shares-loading="projectResourceSharesLoading"
        @update:active-tab-id="activeMainTabId = $event"
        @update:form-state="Object.assign(formState, $event)"
        @submit-project-for-contest="submitProject"
        @update:project-settings-common="onProjectSettingsCommonChange"
        @update:project-settings-bindings="onProjectSettingsBindingsChange"
        @update:project-settings-adaptation="onProjectSettingsAdaptationChange"
        @load-contests="loadContests"
        @save-project-settings="saveProjectSettingsManually"
        @reload-workspace-member-management="loadWorkspaceMemberManagement"
        @create-workspace-invitation="createWorkspaceInvitation"
        @patch-workspace-member-role="patchWorkspaceMemberRole"
        @remove-workspace-member="removeWorkspaceMember"
        @revoke-workspace-invitation="revokeWorkspaceInvitation"
        @copy-workspace-invitation-link="copyWorkspaceInvitationLink"
        @open-workspace-seat-modal="openWorkspaceSeatModal"
        @save-workspace-seat-limit="saveWorkspaceSeatLimit"
        @copy-project-resource-share="copyProjectResourceShare"
        @revoke-project-resource-share="revokeProjectResourceShare"
        @reconvert-preview="reconvertProjectResourcePreview"
        @download-preview-source="downloadPreviewSource"
        @activate-preview-resource="activateProjectResourceTab"
        @close-preview-resource="closeProjectResourcePreview"
        @update:collab-draw-value="updateCollabDrawContent"
      />

      <div v-if="!rightSidebarCollapsed" class="workspace-side-anchor workspace-side-anchor--right">
        <div class="workspace-side-handle workspace-side-handle--right workspace-side-handle--right-expanded">
          <button
            class="workspace-side-toggle"
            type="button"
            title="收起右侧栏"
            aria-label="收起右侧栏"
            @click="collapseRightSidebar"
          >
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <WorkspaceRightSidebar
          v-model:chat-input="chatInput"
          v-model:ai-mode="aiMode"
          class="min-h-0 overflow-hidden"
          :chat-sessions="chatSessions"
          :active-chat-session-id="activeChatSessionId"
          :chat-sessions-loading="chatSessionsLoading"
          :chat-messages="chatMessages"
          :chat-loading="chatLoading"
          :change-requests="aiChangeRequests"
          :change-requests-loading="aiChangeRequestsLoading"
          :change-acting-ids="aiChangeActingIds"
          :change-second-confirm-ids="aiChangeSecondConfirmIds"
          :issue-report="latestIssueReport"
          :project-issues="projectIssues"
          :issue-loading="issueCenterLoading"
          :defense-rounds="defenseRounds"
          :defense-scorecard="defenseScorecard"
          :selected-contest="selectedContest"
          :selected-track="selectedTrack"
          :selected-resources="selectedResources"
          @send-chat="sendChatMessage"
          @switch-chat-session="switchChatSession"
          @create-chat-session="startNewChatSession"
          @approve-change="approveAiChange"
          @reject-change="rejectAiChange"
        />
      </div>
      <div v-else class="workspace-side-handle workspace-side-handle--right workspace-side-handle--right-collapsed">
        <button
          class="workspace-side-toggle"
          type="button"
          title="展开右侧栏"
          aria-label="展开右侧栏"
          @click="expandRightSidebar"
        >
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
      </div>
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
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
}

.workspace-layout {
  min-width: 0;
  position: relative;
}

.workspace-side-anchor {
  position: relative;
  display: flex;
  flex-shrink: 0;
  min-height: 0;
  overflow: visible;
}

.workspace-side-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 22px;
  z-index: 30;
  pointer-events: auto;
}

.workspace-side-handle--left-expanded {
  right: 0;
  transform: translateX(50%);
}

.workspace-side-handle--left-collapsed {
  left: 0;
  transform: none;
}

.workspace-side-handle--right-expanded {
  left: 0;
  transform: translateX(-50%);
}

.workspace-side-handle--right-collapsed {
  right: 0;
  transform: none;
}

.workspace-side-toggle {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  color: #8a99b2;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.workspace-side-handle--left .workspace-side-toggle {
  border-right: 1px solid transparent;
}

.workspace-side-handle--right .workspace-side-toggle {
  border-left: 1px solid transparent;
}

.workspace-side-toggle .material-symbols-outlined {
  font-size: 16px;
  line-height: 1;
  opacity: 0;
  transition:
    opacity 0.16s ease,
    color 0.2s ease;
}

.workspace-side-handle:hover .workspace-side-toggle,
.workspace-side-toggle:focus-visible {
  background: #f3f6fc;
}

.workspace-side-handle--left:hover .workspace-side-toggle,
.workspace-side-handle--left .workspace-side-toggle:focus-visible {
  border-right-color: #d3d8e4;
}

.workspace-side-handle--right:hover .workspace-side-toggle,
.workspace-side-handle--right .workspace-side-toggle:focus-visible {
  border-left-color: #d3d8e4;
}

.workspace-side-toggle:focus-visible {
  outline: 2px solid #2f6af2;
  outline-offset: -2px;
}

.workspace-side-handle:hover .material-symbols-outlined,
.workspace-side-toggle:focus-visible .material-symbols-outlined {
  opacity: 1;
  color: #2f6af2;
}
</style>
