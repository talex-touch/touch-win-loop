<script setup lang="ts">
import type {
  AiChatMessage,
  AiChatSession,
  AiContestFilterResult,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefenseScorecard,
  AiDefenseSessionDetail,
  AiDefenseStage,
  AiDefenseStreamEvent,
  AiDefenseStreamEventType,
  AiDefenseSummary,
  AiProjectChangeRequest,
  AiWorkspaceRequest,
  AiWorkspaceResult,
  AiWorkspaceStreamEvent,
  AiWorkspaceStreamEventType,
  ApiResponse,
  ApproveChangeRequestPayload,
  AuthMeResult,
  AuthUser,
  ChatMessage,
  CollabPurpose,
  Contest,
  ContestDetailPayload,
  Project,
  ProjectContestAdaptation,
  ProjectInvitationSummary,
  ProjectIssue,
  ProjectIssueReport,
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingGuestShare,
  ProjectMeetingMode,
  ProjectMeetingUtterance,
  ProjectMemberManagementSnapshot,
  ProjectMemberRole,
  ProjectMemberSummary,
  ProjectOutlineNode,
  ProjectOutlineSnapshot,
  ProjectPayload,
  ProjectResourceShare,
  ProjectResourceShareDurationPreset,
  ProjectResourceShareVisibility,
  ProjectSeatQuota,
  ProjectSettingsDraft,
  ProjectSettingsDraftDevicePayload,
  ProjectSettingsDraftPayload,
  ProjectSettingsDraftUi,
  ProjectSettingsSnapshot,
  ProjectTopicBoard,
  ProjectTopicBoardCreateSeed,
  ProjectTopicBoardGenerateRequest,
  ProjectTopicBoardListResult,
  ProjectTopicBoardPatchRequest,
  ProjectWorkbenchMode,
  ProjectWorkspaceViewDeviceStatePayload,
  ProjectWorkspaceViewPreference,
  ProjectWorkspaceViewState,
  Resource,
  ResourcePreviewStatus,
  TeamLastProjectPreference,
  TopicProposalDecisionStatus,
  TopicProposalItem,
  WorkspaceAiMode,
  WorkspaceDisplayPreferenceSnapshot,
  WorkspaceFontSizePreset,
  WorkspaceMeetingCreateTabId,
  WorkspaceMemberRole,
  WorkspaceOpenTabState,
  WorkspaceTabSpacingPreset,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import type { CollabSnapshotPayload, WorkspaceRealtimeEnvelope } from '~/composables/useCollabSession'
import type { WorkspaceDisplayPreferencePatchPayload } from '~/composables/useWorkspaceDisplayPreferences'
import type {
  WorkspaceFormState,
  WorkspaceKeyword,
  WorkspaceLinkedContestResourceGroup,
  WorkspaceMappingRow,
  WorkspaceProjectAdaptationForm,
  WorkspaceProjectCommonForm,
  WorkspaceProjectContestBindingForm,
  WorkspaceProjectSaveState,
  WorkspaceTopicBoardDraft,
} from '~/types/workspace'
import type { WorkspaceMetaKActionId, WorkspaceMetaKItem, WorkspaceMetaKSection, WorkspaceMetaKSectionDefinition } from '~/utils/workspace-metak'
import { Message } from '@arco-design/web-vue'
import {
  formatFileSize,
  isProjectResourceUploadFileSupported,
  PROJECT_RESOURCE_STORAGE_LIMIT_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH,
} from '~~/shared/constants/project-resource-upload'
import { TOPIC_BOARD_CREATE_SEED_STORAGE_PREFIX } from '~~/shared/constants/topic-board'
import {
  buildProjectSettingsCommonPatch,
  cloneProjectCommonForm,
  createEmptyProjectCommonForm,
  createProjectCommonFormFromProject,
} from '~/composables/project-settings'
import { useCollabSession } from '~/composables/useCollabSession'
import {
  defaultWorkspaceDisplayPreferenceSnapshot,
  useWorkspaceDisplayPreferenceApi,
} from '~/composables/useWorkspaceDisplayPreferences'
import {
  buildWorkspaceMetaKSections,
  matchAndSortWorkspaceMetaKItems,
  resolveWorkspaceMetaKShortcutLabel,

} from '~/utils/workspace-metak'

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
const {
  loadWorkspaceSnapshot: loadWorkspaceDisplayPreferenceSnapshotByApi,
  patchWorkspaceUserOverride: patchWorkspaceDisplayUserOverrideByApi,
  patchWorkspaceTeamDefault: patchWorkspaceDisplayTeamDefaultByApi,
} = useWorkspaceDisplayPreferenceApi()

interface TopicBoardConfirmOptions {
  title: string
  content: string
  okText?: string
  cancelText?: string
}

interface TopicBoardConfirmState extends Required<TopicBoardConfirmOptions> {
  visible: boolean
  resolver: ((value: boolean) => void) | null
}

type DeviceRestoreChoice = 'sync' | 'keep'

interface DeviceRestoreConfirmState {
  visible: boolean
  title: string
  content: string
  resolver: ((value: DeviceRestoreChoice) => void) | null
}

interface HydratedProjectWorkspaceViewStateResult {
  state: ProjectWorkspaceViewState
  bundle: ProjectWorkspaceViewDeviceStatePayload | null
  hasManagedQuery: boolean
}

interface ProjectSettingsDraftHydrationResult {
  bundle: ProjectSettingsDraftDevicePayload | null
  localDraft: WorkspaceProjectSettingsDraftCache | null
  currentDraft: WorkspaceProjectSettingsDraftCache | null
  latestOtherDraft: WorkspaceProjectSettingsDraftCache | null
  appliedDraft: WorkspaceProjectSettingsDraftCache | null
  source: 'local' | 'current' | 'latest_other' | ''
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

const topicBoardConfirmState = reactive<TopicBoardConfirmState>({
  visible: false,
  title: '',
  content: '',
  okText: '确认',
  cancelText: '取消',
  resolver: null,
})

const deviceRestoreConfirmState = reactive<DeviceRestoreConfirmState>({
  visible: false,
  title: '',
  content: '',
  resolver: null,
})

function resolveTopicBoardConfirm(result: boolean) {
  const resolver = topicBoardConfirmState.resolver
  topicBoardConfirmState.visible = false
  topicBoardConfirmState.title = ''
  topicBoardConfirmState.content = ''
  topicBoardConfirmState.okText = '确认'
  topicBoardConfirmState.cancelText = '取消'
  topicBoardConfirmState.resolver = null
  resolver?.(result)
}

function askTopicBoardConfirm(options: TopicBoardConfirmOptions): Promise<boolean> {
  if (!import.meta.client)
    return Promise.resolve(true)

  if (topicBoardConfirmState.resolver)
    resolveTopicBoardConfirm(false)

  topicBoardConfirmState.visible = true
  topicBoardConfirmState.title = options.title
  topicBoardConfirmState.content = options.content
  topicBoardConfirmState.okText = options.okText || '确认'
  topicBoardConfirmState.cancelText = options.cancelText || '取消'

  return new Promise((resolve) => {
    topicBoardConfirmState.resolver = resolve
  })
}

function resolveDeviceRestoreConfirm(result: DeviceRestoreChoice) {
  const resolver = deviceRestoreConfirmState.resolver
  deviceRestoreConfirmState.visible = false
  deviceRestoreConfirmState.title = ''
  deviceRestoreConfirmState.content = ''
  deviceRestoreConfirmState.resolver = null
  resolver?.(result)
}

function askDeviceRestoreConfirm(title: string, content: string): Promise<DeviceRestoreChoice> {
  if (!import.meta.client)
    return Promise.resolve('keep')

  if (deviceRestoreConfirmState.resolver)
    resolveDeviceRestoreConfirm('keep')

  deviceRestoreConfirmState.visible = true
  deviceRestoreConfirmState.title = title
  deviceRestoreConfirmState.content = content

  return new Promise<DeviceRestoreChoice>((resolve) => {
    deviceRestoreConfirmState.resolver = resolve
  })
}

onBeforeUnmount(() => {
  if (topicBoardConfirmState.resolver)
    resolveTopicBoardConfirm(false)
})

function splitTopicBoardTags(text: string): string[] {
  return String(text || '')
    .split(/[\n,，、]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function createEmptyTopicBoardDraft(): WorkspaceTopicBoardDraft {
  return {
    discipline: '',
    topicType: '',
    expectedDifficulty: '',
    keywordsText: '',
    teamSkillTagsText: '',
    candidateCount: 3,
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

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function buildWorkspaceMetaKItemId(prefix: string, value: unknown): string {
  return `${prefix}:${normalizeString(value)}`
}

function buildWorkspaceMetaKKeywords(...parts: unknown[]): string[] {
  return parts
    .flatMap((part) => {
      if (Array.isArray(part))
        return part.map(item => normalizeString(item)).filter(Boolean)
      return normalizeString(part) ? [normalizeString(part)] : []
    })
}

function flattenProjectOutlineNodes(items: ProjectOutlineNode[]): ProjectOutlineNode[] {
  const result: ProjectOutlineNode[] = []
  const visit = (nodes: ProjectOutlineNode[]) => {
    for (const node of nodes) {
      result.push(node)
      if (node.children.length > 0)
        visit(node.children)
    }
  }
  visit(items)
  return result
}

function isWorkspaceMetaKEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  if (target.isContentEditable)
    return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .tiptap, .ProseMirror'))
}

function isWorkspaceMetaKHotkey(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'k')
    return false
  if (event.altKey || event.shiftKey)
    return false
  return event.metaKey || event.ctrlKey
}

function formatMetaKDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return ''

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function resolveMetaKResourceTitle(resource: Resource): string {
  const title = normalizeString(resource.title)
  if (title)
    return title
  if (resource.resourceKind === 'markdown')
    return '协作文档'
  if (resource.resourceKind === 'draw')
    return resource.collabPurpose === 'workflow' ? '流程画布' : '自由画布'
  return '未命名资源'
}

function resolveMetaKResourceIcon(resource: Resource): string {
  if (resource.resourceKind === 'markdown')
    return 'edit_note'
  if (resource.resourceKind === 'draw')
    return resource.collabPurpose === 'workflow' ? 'flowsheet' : 'draw'
  const typeText = normalizeString(resource.type).toLowerCase()
  if (typeText.includes('pdf'))
    return 'picture_as_pdf'
  if (typeText.includes('image'))
    return 'image'
  return 'description'
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

function toIssueReportMarkdownFileName(title: string): string {
  const normalized = String(title || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
  return `${normalized || 'issue-report'}.md`
}

function triggerBrowserDownloadFromBlob(blob: Blob, fileName: string): void {
  if (!import.meta.client)
    return

  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
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

interface WorkspaceMeetingCaptionItem {
  id: string
  text: string
  speakerName: string
  speakerLabel: string
  startedAtMs: number
  endedAtMs: number
  final: boolean
}

interface ProjectMeetingJoinSessionPayload {
  meeting: ProjectMeetingDetail
  rtcJoinToken?: string
  rtcJoinExpiresAt?: string
  rtcServerUrl?: string
  rtcJoinUrl?: string
  joinToken?: string
  joinExpiresAt?: string
  joinUrl?: string
}

interface ProjectMeetingCreatePayload {
  mode: ProjectMeetingMode
  title?: string
  invitedUserIds: string[]
  scheduledStartAt: string
  scheduledEndAt: string
}

interface DefenseRealtimeSessionPayload {
  sessionId: string
  meetingId: string
  meeting: ProjectMeetingDetail
  rtcJoinToken?: string
  rtcJoinExpiresAt?: string
  rtcServerUrl?: string
  rtcJoinUrl?: string
  joinToken: string
  joinExpiresAt: string
  joinUrl?: string
  selectedPersonaIds: string[]
}

type WorkspaceProjectSettingsDraftCache = ProjectSettingsDraftPayload
type WorkspaceMainTabId = WorkspaceOpenTabState
type WorkspaceMeetingTabId = `meeting:${string}`
type WorkspaceMeetingCreateLocalTabId = WorkspaceMeetingCreateTabId
type WorkspacePreviewMode = 'binary' | 'markdown' | 'draw'
type WorkspaceWorkbenchMode = ProjectWorkbenchMode
type WorkspacePrimaryAiMode = Exclude<WorkspaceAiMode, 'defense'>
type WorkspaceLeftSidebarCommandModuleId = 'resource_manager' | 'analysis'

const PROJECT_SETTINGS_DRAFT_PREFIX = 'workspace.projectSettingsDraft'
const PROJECT_SETTINGS_DRAFT_DEVICE_PREFIX = 'workspace.projectSettingsDraftDevice'
const PROJECT_VIEW_STATE_QUERY_KEYS = ['wb', 'tab', 'tabs', 'res', 'contest', 'track', 'session', 'meeting', 'ls', 'rs', 'panel'] as const
const RIGHT_SIDEBAR_BREAKPOINT_QUERY = '(min-width: 1280px)'
const WORKSPACE_MEMBER_MANAGE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']
const METAK_SECTION_DEFINITIONS: WorkspaceMetaKSectionDefinition[] = [
  { id: 'actions', title: '快捷命令', maxItems: 8 },
  { id: 'resources', title: '项目资源', maxItems: 8 },
  { id: 'meetings', title: '项目会议', maxItems: 6 },
  { id: 'issues', title: 'Issue', maxItems: 6 },
  { id: 'contests', title: '竞赛', maxItems: 6 },
  { id: 'outline', title: '结构大纲', maxItems: 6 },
  { id: 'workspaces', title: '空间切换', maxItems: 6 },
  { id: 'projects', title: '项目切换', maxItems: 6 },
]

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
const topicBoardDraft = reactive<WorkspaceTopicBoardDraft>(createEmptyTopicBoardDraft())
const topicBoardLoading = ref(false)
const topicBoardFetching = ref(false)
const topicBoardError = ref('')
const topicBoardSnapshot = ref<ProjectTopicBoard | null>(null)
const topicBoardHistory = ref<ProjectTopicBoard[]>([])
const topicBoardActioningCandidateId = ref('')
const topicBoardCreateSeedHandled = ref(false)
let topicBoardLoadRequestId = 0
let topicBoardWriteRequestId = 0

const contests = ref<Contest[]>([])
const contestCatalog = ref<Contest[]>([])
const resources = ref<Resource[]>([])
const recycleResources = ref<Resource[]>([])
const resourceLibrary = ref<Resource[]>([])
const projectResourceShares = ref<ProjectResourceShare[]>([])
const projectMeetings = ref<ProjectMeeting[]>([])
const activeMeetingId = ref('')
const activeMeetingDetail = ref<ProjectMeetingDetail | null>(null)
const activeMeetingUtterances = ref<ProjectMeetingUtterance[]>([])
const meetingLiveCaptions = ref<WorkspaceMeetingCaptionItem[]>([])
const workspaceMembers = ref<ProjectMemberSummary[]>([])
const workspaceInvitations = ref<ProjectInvitationSummary[]>([])
const projectOutlineSnapshot = ref<ProjectOutlineSnapshot | null>(null)
const selectedContestDetail = ref<ContestDetailPayload | null>(null)
const projects = ref<Project[]>([])
const allProjects = ref<Project[]>([])
const me = ref<AuthMeResult | null>(null)
const activeWorkspaceId = ref('')
const selectedContestId = ref('')
const selectedTrackId = ref('')

const openSettingsSignal = ref(0)
const openMemberManagementSignal = ref(0)
const openDisplayPreferencesSignal = ref(0)
const openFlowSignal = ref(0)
const openPreviewSignal = ref(0)
const closePreviewSignal = ref(0)
const accountCenterVisible = ref(false)
const leftSidebarCollapsed = ref(false)
const leftSidebarMetaKSignal = ref(0)
const leftSidebarMetaKModuleId = ref<WorkspaceLeftSidebarCommandModuleId | ''>('')
const leftSidebarMetaKOutlineId = ref('')
const rightSidebarUserCollapsed = ref(false)
const rightSidebarAutoCollapsed = ref(false)
const rightSidebarAutoRestorePending = ref(false)
const sidebarLayoutHydrating = ref(false)
const openMainTabs = ref<WorkspaceMainTabId[]>(['dashboard'])
const activeMainTabId = ref<WorkspaceMainTabId | ''>('dashboard')
const metaKOpen = ref(false)
const metaKQuery = ref('')
const metaKShortcutLabel = ref('⌘K')
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
const selectedContestDetailLoading = ref(false)
const projectSettingsSaveState = ref<WorkspaceProjectSaveState>('idle')
const workspaceDisplayPreferenceSnapshot = ref<WorkspaceDisplayPreferenceSnapshot>(defaultWorkspaceDisplayPreferenceSnapshot())
const workspaceDisplayPreferenceLoading = ref(false)
const workspaceDisplayPreferenceSavingScope = ref<'' | 'user' | 'team'>('')
const workspaceDisplayPreferenceError = ref('')
const meetingJoinUrl = ref('')
const meetingJoinToken = ref('')
const meetingJoinExpiresAt = ref('')
const meetingRtcServerUrl = ref('')
const activeMeetingGuestShare = ref<ProjectMeetingGuestShare | null>(null)
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
const workspaceDeviceId = ref('')

let projectSettingsDraftTimer: ReturnType<typeof setTimeout> | null = null
let projectSettingsDraftPersistSeq = 0
let projectWorkspaceViewPersistTimer: ReturnType<typeof setTimeout> | null = null
let projectOutlineGenerateTimer: ReturnType<typeof setTimeout> | null = null
let previewStatusPollTimer: ReturnType<typeof setInterval> | null = null
let realtimeProjectRefreshTimer: ReturnType<typeof setTimeout> | null = null
let meetingRealtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let fallbackResourceRefreshTimer: ReturnType<typeof setInterval> | null = null
let metaKRemoteSearchTimer: ReturnType<typeof setTimeout> | null = null
let metaKRemoteRequestSequence = 0
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
const projectMeetingsLoading = ref(false)
const meetingDetailLoading = ref(false)
const meetingGuestShareLoading = ref(false)
const workspaceMemberManagementLoading = ref(false)
const workspaceInvitationSubmitting = ref(false)
const workspaceMemberRoleUpdatingUserId = ref('')
const workspaceMemberRemovingUserId = ref('')
const workspaceInvitationRevokingId = ref('')
const resourceMutating = ref(false)
const meetingMutating = ref(false)

const chatMessages = ref<ChatMessage[]>([])
const chatSessions = ref<AiChatSession[]>([])
const activeChatSessionId = ref('')
const chatInput = ref('')
const chatMissingFields = ref<string[]>([])
const chatDraft = ref<ProjectPayload | null>(null)
const aiMode = ref<WorkspaceAiMode>('dialog_ask')
const workbenchMode = ref<WorkspaceWorkbenchMode>('project')
const lastPrimaryAiMode = ref<WorkspacePrimaryAiMode>('dialog_ask')
const aiChangeRequests = ref<AiProjectChangeRequest[]>([])
const aiChangeRequestsLoading = ref(false)
const aiChangeActingIds = ref<string[]>([])
const aiChangeSecondConfirmIds = ref<string[]>([])
const projectIssueReports = ref<ProjectIssueReport[]>([])
const projectIssues = ref<ProjectIssue[]>([])
const issueCenterLoading = ref(false)
const issueReportSubmitting = ref(false)
const issueReportExporting = ref(false)
const metaKRemoteLoading = ref(false)
const metaKRemoteLibraryItems = ref<WorkspaceMetaKItem[]>([])
const defenseRounds = ref<AiDefenseJudgeRound[]>([])
const defenseScorecard = ref<AiDefenseScorecard | null>(null)
const defensePersonas = ref<AiDefensePersona[]>([])
const defensePersonasLoading = ref(false)
const defenseSummary = ref<AiDefenseSummary | null>(null)
const defenseSummaryLoading = ref(false)
const defenseStage = ref<AiDefenseStage | undefined>(undefined)
const defenseTurnCount = ref(0)
const workspaceInvitationLink = ref('')
const workspaceSeatLimitSaveLoading = ref(false)
const workspaceSeatLimitError = ref('')
const workspaceSeatLimitUpdatedSignal = ref(0)
const projectSeatQuota = ref<ProjectSeatQuota | null>(null)
const rightSidebarCollapsed = computed(() => rightSidebarUserCollapsed.value || rightSidebarAutoCollapsed.value)
const projectWorkspaceViewHydrating = ref(false)
const projectWorkspaceModeHydrating = ref(false)
const projectWorkspaceViewReady = ref(false)
const workspaceBootstrapLoading = ref(false)

let workspaceBootstrapRequestId = 0

function getProjectSettingsDraftStorageKey(projectId: string): string {
  if (!import.meta.client)
    return ''
  const normalizedProjectId = String(projectId || '').trim()
  const userId = String(me.value?.user.id || '').trim()
  const deviceId = ensureWorkspaceDeviceId()
  if (!normalizedProjectId || !userId || !deviceId)
    return ''
  return `${PROJECT_SETTINGS_DRAFT_PREFIX}.${userId}.${deviceId}.${normalizedProjectId}`
}

function getLegacyProjectSettingsDraftStorageKey(projectId: string): string {
  if (!import.meta.client)
    return ''
  const normalizedProjectId = String(projectId || '').trim()
  const userId = String(me.value?.user.id || '').trim()
  if (!normalizedProjectId || !userId)
    return ''
  return `${PROJECT_SETTINGS_DRAFT_PREFIX}.${userId}.${normalizedProjectId}`
}

function getWorkspaceDeviceStorageKey(): string {
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

function createResourceTabId(resourceId: string): WorkspaceMainTabId {
  return `resource:${resourceId}` as WorkspaceMainTabId
}

function createMeetingTabId(meetingId: string): WorkspaceMeetingTabId {
  return `meeting:${meetingId}` as WorkspaceMeetingTabId
}

function createMeetingCreateTabId(mode: ProjectMeetingMode): WorkspaceMeetingCreateLocalTabId {
  return `meeting-create:${mode}` as WorkspaceMeetingCreateLocalTabId
}

function resolveMeetingIdFromTabId(tabId: string): string {
  return tabId.startsWith('meeting:') ? tabId.slice('meeting:'.length) : ''
}

function ensureWorkspaceMainTabOpen(tabId: WorkspaceMainTabId, options: { activate?: boolean } = {}): void {
  const normalizedTabId = normalizeString(tabId) as WorkspaceMainTabId
  if (!isWorkspaceMainTabId(normalizedTabId))
    return

  if (!openMainTabs.value.includes(normalizedTabId)) {
    openMainTabs.value = normalizeWorkspaceMainTabIds([...openMainTabs.value, normalizedTabId], {
      allowEmpty: true,
    })
  }

  if (options.activate !== false)
    activeMainTabId.value = normalizedTabId
}

function ensureMeetingDetailTabOpen(meetingId: string, options: { activate?: boolean } = {}): WorkspaceMeetingTabId | '' {
  const normalizedMeetingId = normalizeString(meetingId)
  if (!normalizedMeetingId)
    return ''

  const tabId = createMeetingTabId(normalizedMeetingId)
  ensureWorkspaceMainTabOpen(tabId, options)
  return tabId
}

function ensureMeetingCreateTabOpen(mode: ProjectMeetingMode, options: { activate?: boolean } = {}): WorkspaceMeetingCreateLocalTabId {
  const tabId = createMeetingCreateTabId(mode)
  ensureWorkspaceMainTabOpen(tabId, options)
  return tabId
}

function isWorkspaceMainTabId(value: string): value is WorkspaceMainTabId {
  return ['dashboard', 'meeting', 'members', 'flow', 'settings'].includes(value)
    || (value.startsWith('meeting:') && value.length > 'meeting:'.length)
    || value === 'meeting-create:audio'
    || value === 'meeting-create:video'
    || (value.startsWith('resource:') && value.length > 'resource:'.length)
}

function normalizeWorkspaceMainTabIds(
  value: WorkspaceOpenTabState[] | undefined,
  options: { allowEmpty?: boolean } = {},
): WorkspaceMainTabId[] {
  const normalized: WorkspaceMainTabId[] = []
  const used = new Set<string>()

  for (const item of value || []) {
    const tabId = normalizeString(item)
    if (!isWorkspaceMainTabId(tabId) || used.has(tabId))
      continue
    normalized.push(tabId)
    used.add(tabId)
    if (normalized.length >= 8)
      break
  }

  return normalized.length > 0 || options.allowEmpty ? normalized : ['dashboard']
}

function normalizeWorkspaceMainTabId(
  value: unknown,
  tabIds: WorkspaceMainTabId[],
  options: { fallbackTabId?: WorkspaceMainTabId | '' } = {},
): WorkspaceMainTabId | '' {
  const normalized = normalizeString(value)
  if (normalized && isWorkspaceMainTabId(normalized) && tabIds.includes(normalized))
    return normalized
  if (options.fallbackTabId && tabIds.includes(options.fallbackTabId))
    return options.fallbackTabId
  return tabIds[0] || ''
}

function createDefaultProjectWorkspaceViewState(): ProjectWorkspaceViewState {
  return {
    workbenchMode: 'project',
    mainTabs: ['dashboard'],
    activeMainTabId: 'dashboard',
    previewResourceId: '',
    selectedContestId: '',
    selectedTrackId: '',
    activeChatSessionId: '',
    activeMeetingId: '',
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: false,
  }
}

function normalizeProjectWorkspaceViewState(
  value: Partial<ProjectWorkspaceViewState> | null | undefined,
): ProjectWorkspaceViewState {
  const source = value || {}
  const allowEmptyMainTabs = Array.isArray(source.mainTabs)
  const mainTabs = normalizeWorkspaceMainTabIds(source.mainTabs, { allowEmpty: allowEmptyMainTabs })
  let previewResourceId = normalizeString(source.previewResourceId)
  let activeMeetingId = normalizeString(source.activeMeetingId)

  const requestedActiveTabId = normalizeString(source.activeMainTabId)
  if (!previewResourceId && requestedActiveTabId.startsWith('resource:'))
    previewResourceId = requestedActiveTabId.slice('resource:'.length)
  if (!activeMeetingId && requestedActiveTabId.startsWith('meeting:'))
    activeMeetingId = resolveMeetingIdFromTabId(requestedActiveTabId)

  if (previewResourceId) {
    const previewTabId = createResourceTabId(previewResourceId)
    if (!mainTabs.includes(previewTabId))
      mainTabs.push(previewTabId)
  }

  const normalizedMainTabs = normalizeWorkspaceMainTabIds(mainTabs, { allowEmpty: allowEmptyMainTabs })

  return {
    workbenchMode: source.workbenchMode === 'defense' ? 'defense' : 'project',
    mainTabs: normalizedMainTabs,
    activeMainTabId: normalizeWorkspaceMainTabId(source.activeMainTabId, normalizedMainTabs, {
      fallbackTabId: allowEmptyMainTabs ? '' : 'dashboard',
    }),
    previewResourceId,
    selectedContestId: normalizeString(source.selectedContestId),
    selectedTrackId: normalizeString(source.selectedTrackId),
    activeChatSessionId: normalizeString(source.activeChatSessionId),
    activeMeetingId,
    leftSidebarCollapsed: Boolean(source.leftSidebarCollapsed),
    rightSidebarCollapsed: Boolean(source.rightSidebarCollapsed),
  }
}

function isProjectWorkspaceViewStateEqual(
  left: ProjectWorkspaceViewState,
  right: ProjectWorkspaceViewState,
): boolean {
  return (
    left.workbenchMode === right.workbenchMode
    && left.activeMainTabId === right.activeMainTabId
    && left.previewResourceId === right.previewResourceId
    && left.selectedContestId === right.selectedContestId
    && left.selectedTrackId === right.selectedTrackId
    && left.activeChatSessionId === right.activeChatSessionId
    && left.activeMeetingId === right.activeMeetingId
    && left.leftSidebarCollapsed === right.leftSidebarCollapsed
    && left.rightSidebarCollapsed === right.rightSidebarCollapsed
    && left.mainTabs.length === right.mainTabs.length
    && left.mainTabs.every((item, index) => item === right.mainTabs[index])
  )
}

function buildProjectWorkspaceViewStateFromRefs(): ProjectWorkspaceViewState {
  return normalizeProjectWorkspaceViewState({
    workbenchMode: workbenchMode.value,
    mainTabs: openMainTabs.value,
    activeMainTabId: activeMainTabId.value,
    previewResourceId: previewResourceId.value,
    selectedContestId: selectedContestId.value,
    selectedTrackId: selectedTrackId.value,
    activeChatSessionId: activeChatSessionId.value,
    activeMeetingId: activeMeetingId.value,
    leftSidebarCollapsed: leftSidebarCollapsed.value,
    rightSidebarCollapsed: rightSidebarUserCollapsed.value,
  })
}

function sanitizeProjectWorkspaceViewState(
  value: ProjectWorkspaceViewState,
): ProjectWorkspaceViewState {
  const nextState = normalizeProjectWorkspaceViewState(value)
  const validResourceIdSet = new Set(resources.value.map(item => String(item.id || '').trim()).filter(Boolean))

  const nextTabs = nextState.mainTabs.filter((tabId) => {
    if (!tabId.startsWith('resource:'))
      return true
    return validResourceIdSet.has(tabId.slice('resource:'.length))
  })

  nextState.mainTabs = normalizeWorkspaceMainTabIds(nextTabs, { allowEmpty: true })

  if (nextState.previewResourceId && !validResourceIdSet.has(nextState.previewResourceId))
    nextState.previewResourceId = ''
  if (!nextState.activeMeetingId && nextState.activeMainTabId.startsWith('meeting:'))
    nextState.activeMeetingId = resolveMeetingIdFromTabId(nextState.activeMainTabId)

  if (nextState.activeMainTabId.startsWith('resource:')) {
    const resourceId = nextState.activeMainTabId.slice('resource:'.length)
    if (!validResourceIdSet.has(resourceId))
      nextState.activeMainTabId = 'dashboard'
  }

  nextState.activeMainTabId = normalizeWorkspaceMainTabId(nextState.activeMainTabId, nextState.mainTabs)

  return nextState
}

function parseProjectWorkspaceViewStateFromQuery(): {
  hasManagedQuery: boolean
  state: Partial<ProjectWorkspaceViewState>
} {
  const hasManagedQuery = PROJECT_VIEW_STATE_QUERY_KEYS.some(key => key in route.query)
  const hasManagedTabsQuery = ['tabs', 'tab', 'res', 'panel'].some(key => key in route.query)
  const tabs = normalizeQueryParam(route.query.tabs)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .filter(isWorkspaceMainTabId)
    .slice(0, 8)

  const panel = normalizeQueryParam(route.query.panel).toLowerCase()
  let legacyTabId: WorkspaceMainTabId | '' = ''
  if (panel === 'members' || panel === 'settings' || panel === 'meeting')
    legacyTabId = panel as WorkspaceMainTabId

  const activeMainTabId = normalizeString(route.query.tab) || legacyTabId
  const previewResourceId = normalizeString(route.query.res)
  const activeMeetingId = normalizeString(route.query.meeting)
    || resolveMeetingIdFromTabId(activeMainTabId)

  if (!previewResourceId && isWorkspaceMainTabId(activeMainTabId) && activeMainTabId.startsWith('resource:'))
    tabs.push(activeMainTabId)
  if (previewResourceId)
    tabs.push(createResourceTabId(previewResourceId))
  if (isWorkspaceMainTabId(activeMainTabId))
    tabs.push(activeMainTabId)

  return {
    hasManagedQuery,
    state: {
      workbenchMode: normalizeString(route.query.wb) === 'defense' ? 'defense' : 'project',
      mainTabs: hasManagedTabsQuery ? tabs : undefined,
      activeMainTabId: isWorkspaceMainTabId(activeMainTabId) ? activeMainTabId : '',
      previewResourceId,
      selectedContestId: normalizeString(route.query.contest),
      selectedTrackId: normalizeString(route.query.track),
      activeChatSessionId: normalizeString(route.query.session),
      activeMeetingId,
      leftSidebarCollapsed: isTruthyQueryFlag(route.query.ls),
      rightSidebarCollapsed: isTruthyQueryFlag(route.query.rs),
    },
  }
}

function buildProjectWorkspaceQueryFromState(state: ProjectWorkspaceViewState): Record<string, string> {
  const normalized = normalizeProjectWorkspaceViewState(state)
  const query: Record<string, string> = {}

  if (normalized.workbenchMode === 'defense')
    query.wb = normalized.workbenchMode
  if (normalized.mainTabs.length === 0)
    query.tabs = ''
  else if (normalized.mainTabs.length > 1 || normalized.mainTabs[0] !== 'dashboard')
    query.tabs = normalized.mainTabs.join(',')
  if (normalized.activeMainTabId && (normalized.activeMainTabId !== 'dashboard' || normalized.mainTabs.length > 1))
    query.tab = normalized.activeMainTabId
  if (normalized.previewResourceId)
    query.res = normalized.previewResourceId
  if (normalized.selectedContestId)
    query.contest = normalized.selectedContestId
  if (normalized.selectedTrackId)
    query.track = normalized.selectedTrackId
  if (normalized.activeChatSessionId)
    query.session = normalized.activeChatSessionId
  if (normalized.activeMeetingId)
    query.meeting = normalized.activeMeetingId
  if (normalized.leftSidebarCollapsed)
    query.ls = '1'
  if (normalized.rightSidebarCollapsed)
    query.rs = '1'

  return query
}

function buildProjectWorkspaceRouteQuery(state: ProjectWorkspaceViewState): Record<string, string> {
  const nextQuery: Record<string, string> = {}

  for (const [key, value] of Object.entries(route.query)) {
    if ((PROJECT_VIEW_STATE_QUERY_KEYS as readonly string[]).includes(key))
      continue
    const normalized = normalizeQueryParam(value)
    if (normalized)
      nextQuery[key] = normalized
  }

  return {
    ...nextQuery,
    ...buildProjectWorkspaceQueryFromState(state),
  }
}

function areRouteQueryRecordsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (leftKeys.length !== rightKeys.length)
    return false
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
}

async function fetchProjectWorkspaceViewPreference(projectId: string): Promise<ProjectWorkspaceViewDeviceStatePayload | null> {
  const normalizedProjectId = normalizeString(projectId)
  const deviceId = ensureWorkspaceDeviceId()
  if (!normalizedProjectId || !deviceId)
    return null

  const response = await unsafeFetch<ApiResponse<ProjectWorkspaceViewDeviceStatePayload>>(
    endpoint(`/projects/${normalizedProjectId}/view-state`),
    {
      query: {
        deviceId,
      },
    },
  )
  return response.data || null
}

async function persistProjectWorkspaceViewPreference(
  projectId: string,
  state: ProjectWorkspaceViewState,
): Promise<void> {
  const normalizedProjectId = normalizeString(projectId)
  const deviceId = ensureWorkspaceDeviceId()
  if (!normalizedProjectId || !deviceId)
    return

  await unsafeFetch<ApiResponse<ProjectWorkspaceViewPreference>>(
    endpoint(`/projects/${normalizedProjectId}/view-state`),
    {
      method: 'PUT',
      body: {
        payload: state,
        deviceId,
      },
    },
  )
}

async function persistTeamLastProjectPreference(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  const normalizedProjectId = normalizeString(projectId)
  if (!normalizedWorkspaceId || !normalizedProjectId)
    return

  await unsafeFetch<ApiResponse<TeamLastProjectPreference>>(
    endpoint(`/teams/${normalizedWorkspaceId}/last-project`),
    {
      method: 'PUT',
      body: {
        projectId: normalizedProjectId,
      },
    },
  )
}

async function replaceProjectWorkspaceRouteQueryIfNeeded(state: ProjectWorkspaceViewState): Promise<void> {
  const currentQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    const normalized = normalizeQueryParam(value)
    if (normalized)
      currentQuery[key] = normalized
  }

  const nextQuery = buildProjectWorkspaceRouteQuery(state)
  if (areRouteQueryRecordsEqual(currentQuery, nextQuery))
    return

  await navigateTo({
    path: workspaceDetailPath(routeWorkspaceId.value, routeProjectId.value),
    query: Object.keys(nextQuery).length > 0 ? nextQuery : undefined,
  }, { replace: true })
}

function clearProjectWorkspaceViewPersistTimer(): void {
  if (!projectWorkspaceViewPersistTimer)
    return
  clearTimeout(projectWorkspaceViewPersistTimer)
  projectWorkspaceViewPersistTimer = null
}

function applyProjectWorkspaceViewState(state: ProjectWorkspaceViewState): void {
  const normalized = sanitizeProjectWorkspaceViewState(state)
  const nextMeetingId = normalizeString(normalized.activeMeetingId)
  const meetingChanged = nextMeetingId !== normalizeString(activeMeetingId.value)

  projectWorkspaceViewHydrating.value = true
  try {
    projectWorkspaceModeHydrating.value = true
    if (normalized.workbenchMode === 'defense') {
      aiMode.value = 'defense'
      workbenchMode.value = 'defense'
    }
    else {
      const nextPrimaryMode = aiMode.value !== 'defense'
        ? aiMode.value as WorkspacePrimaryAiMode
        : (lastPrimaryAiMode.value || 'dialog_ask')
      aiMode.value = nextPrimaryMode
      lastPrimaryAiMode.value = nextPrimaryMode
      workbenchMode.value = 'project'
    }
    projectWorkspaceModeHydrating.value = false

    openMainTabs.value = [...normalized.mainTabs]
    activeMainTabId.value = normalized.activeMainTabId
    previewResourceId.value = normalized.previewResourceId
    selectedContestId.value = normalized.selectedContestId
    selectedTrackId.value = normalized.selectedTrackId
    activeChatSessionId.value = normalized.activeChatSessionId
    activeMeetingId.value = nextMeetingId
    leftSidebarCollapsed.value = normalized.leftSidebarCollapsed
    setRightSidebarUserCollapsed(normalized.rightSidebarCollapsed, { suppressPersist: true })

    if (meetingChanged) {
      activeMeetingDetail.value = null
      activeMeetingUtterances.value = []
      meetingLiveCaptions.value = []
      clearMeetingJoinSession()
    }
  }
  finally {
    projectWorkspaceModeHydrating.value = false
    projectWorkspaceViewHydrating.value = false
  }
}

async function hydrateProjectWorkspaceViewState(projectId: string): Promise<HydratedProjectWorkspaceViewStateResult> {
  const normalizedProjectId = normalizeString(projectId)
  if (!normalizedProjectId) {
    return {
      state: createDefaultProjectWorkspaceViewState(),
      bundle: null,
      hasManagedQuery: false,
    }
  }

  const queryResult = parseProjectWorkspaceViewStateFromQuery()
  let nextState = createDefaultProjectWorkspaceViewState()
  let bundle: ProjectWorkspaceViewDeviceStatePayload | null = null
  let currentState: ProjectWorkspaceViewState | null = null
  let latestOtherState: ProjectWorkspaceViewState | null = null

  try {
    bundle = await fetchProjectWorkspaceViewPreference(normalizedProjectId)
    currentState = bundle?.current?.payload
      ? normalizeProjectWorkspaceViewState(bundle.current.payload)
      : null
    latestOtherState = bundle?.latestOther?.payload
      ? normalizeProjectWorkspaceViewState(bundle.latestOther.payload)
      : null
  }
  catch {
    bundle = null
  }

  if (queryResult.hasManagedQuery) {
    nextState = normalizeProjectWorkspaceViewState(queryResult.state)
  }
  else if (currentState) {
    nextState = currentState
  }
  else if (bundle?.resolution.isNewDevice && latestOtherState) {
    nextState = latestOtherState
  }

  nextState = sanitizeProjectWorkspaceViewState(nextState)
  applyProjectWorkspaceViewState(nextState)
  projectWorkspaceViewReady.value = true
  await replaceProjectWorkspaceRouteQueryIfNeeded(nextState)

  if (queryResult.hasManagedQuery)
    scheduleProjectWorkspaceViewPersist()

  return {
    state: nextState,
    bundle,
    hasManagedQuery: queryResult.hasManagedQuery,
  }
}

function scheduleProjectWorkspaceViewPersist(): void {
  if (!projectWorkspaceViewReady.value || projectWorkspaceViewHydrating.value)
    return

  const workspaceId = normalizeString(activeWorkspaceId.value)
  const projectId = normalizeString(highlightedProjectId.value || routeProjectId.value)
  if (!workspaceId || !projectId)
    return

  const state = sanitizeProjectWorkspaceViewState(buildProjectWorkspaceViewStateFromRefs())
  clearProjectWorkspaceViewPersistTimer()
  projectWorkspaceViewPersistTimer = setTimeout(() => {
    projectWorkspaceViewPersistTimer = null
    void persistProjectWorkspaceViewPreference(projectId, state).catch(() => {})
    void persistTeamLastProjectPreference(workspaceId, projectId).catch(() => {})
  }, 300)
}

async function syncProjectWorkspaceViewState(): Promise<void> {
  if (!projectWorkspaceViewReady.value || projectWorkspaceViewHydrating.value)
    return

  const normalizedProjectId = normalizeString(highlightedProjectId.value || routeProjectId.value)
  if (!normalizedProjectId)
    return

  const currentState = buildProjectWorkspaceViewStateFromRefs()
  const normalizedState = sanitizeProjectWorkspaceViewState(currentState)
  if (!isProjectWorkspaceViewStateEqual(currentState, normalizedState)) {
    applyProjectWorkspaceViewState(normalizedState)
    return
  }

  await replaceProjectWorkspaceRouteQueryIfNeeded(normalizedState)
  scheduleProjectWorkspaceViewPersist()
}

function generateWorkspaceDeviceId(): string {
  if (import.meta.client && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `draft-device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function ensureWorkspaceDeviceId(): string {
  if (!import.meta.client)
    return ''
  if (workspaceDeviceId.value)
    return workspaceDeviceId.value

  const key = getWorkspaceDeviceStorageKey()
  if (!key)
    return ''

  try {
    const cached = String(localStorage.getItem(key) || '').trim()
    if (cached) {
      workspaceDeviceId.value = cached
      return cached
    }

    const created = generateWorkspaceDeviceId()
    localStorage.setItem(key, created)
    workspaceDeviceId.value = created
    return created
  }
  catch {
    const fallback = generateWorkspaceDeviceId()
    workspaceDeviceId.value = fallback
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
    if (!raw) {
      const legacyKey = getLegacyProjectSettingsDraftStorageKey(projectId)
      const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : ''
      if (!legacyRaw)
        return null

      const legacyParsed = JSON.parse(legacyRaw) as unknown
      const legacyNormalized = normalizeProjectSettingsDraftCachePayload(legacyParsed)
      if (!legacyNormalized)
        return null

      localStorage.setItem(key, JSON.stringify(legacyNormalized))
      localStorage.removeItem(legacyKey)
      return legacyNormalized
    }

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
  const legacyKey = getLegacyProjectSettingsDraftStorageKey(projectId)
  if (!key && !legacyKey)
    return

  try {
    if (key)
      localStorage.removeItem(key)
    if (legacyKey)
      localStorage.removeItem(legacyKey)
  }
  catch {
    // ignore local cache cleanup errors
  }
}

function resetChatState() {
  chatMessages.value = []
  chatDraft.value = null
  chatMissingFields.value = []
  defenseRounds.value = []
  defenseScorecard.value = null
  defenseSummary.value = null
  defenseStage.value = undefined
  defenseTurnCount.value = 0
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
const selectedTrackRubric = computed(() => {
  const detail = selectedContestDetail.value
  const trackId = String(selectedTrackId.value || '').trim()
  const rubricId = String(selectedTrack.value?.rubricId || '').trim()
  if (!detail || (!trackId && !rubricId))
    return null

  if (rubricId) {
    const matchedByRubricId = detail.rubrics.find(item => item.id === rubricId)
    if (matchedByRubricId)
      return matchedByRubricId
  }

  if (!trackId)
    return null

  return detail.rubrics.find(item => item.trackId === trackId) || null
})
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
const currentUserEmail = computed(() => {
  return String((me.value?.user as (AuthUser & { email?: string | null }) | undefined)?.email || '').trim()
})
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
const currentWorkspaceMeetingPlanTier = computed<'personal_team' | 'business_team'>(() => {
  const quotaPlanTier = currentWorkspace.value?.quota?.planTier
  if (quotaPlanTier === 'personal_team' || quotaPlanTier === 'business_team')
    return quotaPlanTier
  return currentWorkspace.value?.workspace.type === 'personal' ? 'personal_team' : 'business_team'
})
const currentUserSubtitle = computed(() => {
  return String(currentWorkspace.value?.workspace.name || '').trim()
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
const currentUserMeetingHostId = computed(() => String(me.value?.user.id || '').trim())
const activeMeetingIsHost = computed(() => {
  return Boolean(
    currentUserMeetingHostId.value
    && activeMeetingDetail.value
    && normalizeString(activeMeetingDetail.value.startedByUserId) === currentUserMeetingHostId.value,
  )
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
const workspaceEffectiveFontSizePreset = computed<WorkspaceFontSizePreset>(() => {
  return workspaceDisplayPreferenceSnapshot.value.effective.fontSizePreset || 'md'
})
const workspaceEffectiveTabSpacingPreset = computed<WorkspaceTabSpacingPreset>(() => {
  return workspaceDisplayPreferenceSnapshot.value.effective.tabSpacingPreset || 'default'
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
const currentCollabUserId = computed(() => String(me.value?.user.id || '').trim())
const currentCollabUsername = computed(() => String(me.value?.user.username || '').trim())
const collabSession = useCollabSession({
  workspaceRealtime,
  projectId: activeProjectId,
  resourceId: collabBindingResourceId,
  currentUserId: currentCollabUserId,
  currentUsername: currentCollabUsername,
  statusLine,
  fetchSnapshot: async resourceId => await fetchCollabSnapshot(resourceId),
})
const collabRevision = collabSession.revision
const collabMarkdownDoc = collabSession.markdownDoc
const collabMarkdownAwareness = collabSession.markdownAwareness
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

const selectedResources = computed(() => resources.value)
const projectOutlineItems = computed(() => projectOutlineSnapshot.value?.items || [])
const projectOutlineFlatItems = computed(() => flattenProjectOutlineNodes(projectOutlineItems.value))
const projectOutlineFirstLoadLoading = computed(() => {
  return projectOutlineLoading.value && !projectOutlineFirstLoaded.value
})
const latestIssueReport = computed(() => projectIssueReports.value[0] || null)
const metaKResourceTitleMap = computed(() => {
  return new Map(selectedResources.value.map(resource => [resource.id, resolveMetaKResourceTitle(resource)]))
})
const metaKCommandItems = computed<WorkspaceMetaKItem[]>(() => {
  return [
    {
      id: 'metak-command-open-resource-manager',
      sectionId: 'actions',
      type: 'command',
      title: '打开资源管理器',
      subtitle: '查看项目资源、结构大纲与系统资料库导入入口。',
      icon: 'folder_open',
      source: 'local',
      priority: 420,
      defaultVisible: true,
      actionId: 'open_resource_manager',
      keywords: buildWorkspaceMetaKKeywords('资源管理器', '资料', '文件', '大纲'),
    },
    {
      id: 'metak-command-open-analysis',
      sectionId: 'actions',
      type: 'command',
      title: '打开竞赛分析',
      subtitle: '切回左侧竞赛分析模块，继续筛选目标竞赛与赛道。',
      icon: 'manage_search',
      source: 'local',
      priority: 410,
      defaultVisible: true,
      actionId: 'open_analysis',
      keywords: buildWorkspaceMetaKKeywords('竞赛分析', '筛选', '赛道', '比赛'),
    },
    {
      id: 'metak-command-open-meeting',
      sectionId: 'actions',
      type: 'command',
      title: '打开项目会议',
      subtitle: '查看会议总览、会议详情、录制与纪要入口。',
      icon: 'video_call',
      source: 'local',
      priority: 400,
      defaultVisible: true,
      actionId: 'open_meeting',
      keywords: buildWorkspaceMetaKKeywords('会议', '语音会议', '视频会议', '纪要'),
    },
    {
      id: 'metak-command-open-issue-view',
      sectionId: 'actions',
      type: 'command',
      title: '打开 Issue 视图',
      subtitle: '切到右侧寻疑发现模式并展开 Issue 结果。',
      icon: 'bug_report',
      source: 'local',
      priority: 395,
      defaultVisible: true,
      actionId: 'open_issue_view',
      badge: aiMode.value === 'issue_discovery' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('issue', '寻疑', '问题', '风险'),
    },
    {
      id: 'metak-command-open-flow',
      sectionId: 'actions',
      type: 'command',
      title: '打开流程画布',
      subtitle: '进入 workflow 画布，继续梳理流程与终审路径。',
      icon: 'flowsheet',
      source: 'local',
      priority: 390,
      defaultVisible: true,
      actionId: 'open_flow',
      keywords: buildWorkspaceMetaKKeywords('流程', '画布', 'workflow', '终审'),
    },
    {
      id: 'metak-command-open-final-review',
      sectionId: 'actions',
      type: 'command',
      title: '打开终审',
      subtitle: '快速进入终审工作流入口。',
      icon: 'task_alt',
      source: 'local',
      priority: 380,
      defaultVisible: true,
      actionId: 'open_final_review',
      keywords: buildWorkspaceMetaKKeywords('终审', 'final review', '复核'),
    },
    {
      id: 'metak-command-open-workspace-home',
      sectionId: 'actions',
      type: 'command',
      title: '打开空间首页',
      subtitle: `返回 ${currentWorkspace.value?.workspace.name || '当前空间'} 的 Team 首页。`,
      icon: 'home_storage',
      source: 'local',
      priority: 360,
      defaultVisible: true,
      actionId: 'open_workspace_home',
      keywords: buildWorkspaceMetaKKeywords('空间首页', 'team', 'home'),
    },
    {
      id: 'metak-command-open-workspace-settings',
      sectionId: 'actions',
      type: 'command',
      title: '打开项目设置',
      subtitle: '进入项目设置固定页签，维护项目底座与绑定关系。',
      icon: 'settings',
      source: 'local',
      priority: 355,
      defaultVisible: true,
      actionId: 'open_workspace_settings',
      keywords: buildWorkspaceMetaKKeywords('项目设置', 'settings', '配置'),
    },
    {
      id: 'metak-command-open-member-management',
      sectionId: 'actions',
      type: 'command',
      title: '打开成员管理',
      subtitle: '查看成员、席位和邀请记录。',
      icon: 'group',
      source: 'local',
      priority: 350,
      defaultVisible: true,
      actionId: 'open_member_management',
      keywords: buildWorkspaceMetaKKeywords('成员', '邀请', '协作', 'seat'),
    },
    {
      id: 'metak-command-open-display-preferences',
      sectionId: 'actions',
      type: 'command',
      title: '打开显示偏好',
      subtitle: '调整字体大小、页签间距与工作区显示习惯。',
      icon: 'tune',
      source: 'local',
      priority: 340,
      defaultVisible: true,
      actionId: 'open_display_preferences',
      keywords: buildWorkspaceMetaKKeywords('显示偏好', '字体', 'tab spacing', '布局'),
    },
    {
      id: 'metak-command-open-account-center',
      sectionId: 'actions',
      type: 'command',
      title: '打开账号中心',
      subtitle: '查看个人资料与账号设置。',
      icon: 'account_circle',
      source: 'local',
      priority: 330,
      defaultVisible: true,
      actionId: 'open_account_center',
      keywords: buildWorkspaceMetaKKeywords('账号中心', 'profile', '账户'),
    },
    {
      id: 'metak-command-switch-workbench-project',
      sectionId: 'actions',
      type: 'command',
      title: '切换到项目工作台',
      subtitle: '回到项目推进主工作台。',
      icon: 'space_dashboard',
      source: 'local',
      priority: 320,
      defaultVisible: true,
      actionId: 'switch_workbench_project',
      badge: workbenchMode.value === 'project' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('项目工作台', 'project workbench'),
    },
    {
      id: 'metak-command-switch-workbench-defense',
      sectionId: 'actions',
      type: 'command',
      title: '切换到答辩工作台',
      subtitle: '进入答辩工作台与模拟答辩链路。',
      icon: 'record_voice_over',
      source: 'local',
      priority: 315,
      defaultVisible: true,
      actionId: 'switch_workbench_defense',
      badge: workbenchMode.value === 'defense' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('答辩工作台', 'defense', '答辩'),
    },
    {
      id: 'metak-command-switch-ai-dialog',
      sectionId: 'actions',
      type: 'command',
      title: '切换 AI 到对话询问',
      subtitle: '回到 Loopy 常规对话模式。',
      icon: 'chat',
      source: 'local',
      priority: 305,
      defaultVisible: true,
      actionId: 'switch_ai_dialog',
      badge: aiMode.value === 'dialog_ask' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('Loopy', '对话', 'dialog ask'),
    },
    {
      id: 'metak-command-switch-ai-optimize',
      sectionId: 'actions',
      type: 'command',
      title: '切换 AI 到自动优化',
      subtitle: '让右侧 AI 进入自动优化模式。',
      icon: 'auto_fix_high',
      source: 'local',
      priority: 300,
      defaultVisible: true,
      actionId: 'switch_ai_optimize',
      badge: aiMode.value === 'auto_optimize' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('自动优化', 'auto optimize'),
    },
    {
      id: 'metak-command-switch-ai-issue',
      sectionId: 'actions',
      type: 'command',
      title: '切换 AI 到寻疑发现',
      subtitle: '切到问题发现链路，查看证据与建议。',
      icon: 'search_insights',
      source: 'local',
      priority: 295,
      defaultVisible: true,
      actionId: 'switch_ai_issue',
      badge: aiMode.value === 'issue_discovery' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('寻疑发现', 'issue discovery', '问题发现'),
    },
    {
      id: 'metak-command-create-collab-markdown',
      sectionId: 'actions',
      type: 'command',
      title: '新建协作文档',
      subtitle: '创建 markdown 协作文档并直接打开。',
      icon: 'edit_document',
      source: 'local',
      priority: 290,
      defaultVisible: true,
      actionId: 'create_collab_markdown',
      keywords: buildWorkspaceMetaKKeywords('协作文档', 'markdown', 'notes'),
    },
    {
      id: 'metak-command-create-collab-draw',
      sectionId: 'actions',
      type: 'command',
      title: '新建自由画布',
      subtitle: '创建自由画布并直接打开。',
      icon: 'draw',
      source: 'local',
      priority: 285,
      defaultVisible: true,
      actionId: 'create_collab_draw',
      keywords: buildWorkspaceMetaKKeywords('自由画布', 'draw', 'canvas'),
    },
    {
      id: 'metak-command-create-meeting-audio',
      sectionId: 'actions',
      type: 'command',
      title: '发起语音会议',
      subtitle: '打开语音会议创建页。',
      icon: 'call',
      source: 'local',
      priority: 280,
      defaultVisible: true,
      actionId: 'create_meeting_audio',
      keywords: buildWorkspaceMetaKKeywords('语音会议', 'audio meeting'),
    },
    {
      id: 'metak-command-create-meeting-video',
      sectionId: 'actions',
      type: 'command',
      title: '发起视频会议',
      subtitle: '打开视频会议创建页。',
      icon: 'videocam',
      source: 'local',
      priority: 275,
      defaultVisible: true,
      actionId: 'create_meeting_video',
      keywords: buildWorkspaceMetaKKeywords('视频会议', 'video meeting'),
    },
  ]
})
const metaKResourceItems = computed<WorkspaceMetaKItem[]>(() => {
  return selectedResources.value.map((resource) => {
    const resourceTitle = resolveMetaKResourceTitle(resource)
    const sourceType = normalizeString(resource.type)
    const summary = normalizeString(resource.summary)
    return {
      id: buildWorkspaceMetaKItemId('resource', resource.id),
      sectionId: 'resources',
      type: 'resource',
      title: resourceTitle,
      subtitle: [sourceType, resource.year ? `${resource.year}` : '', summary].filter(Boolean).join(' · '),
      icon: resolveMetaKResourceIcon(resource),
      badge: resource.category || '',
      hint: resource.resourceKind === 'draw' || resource.resourceKind === 'markdown' ? '打开协作页' : '打开预览',
      keywords: buildWorkspaceMetaKKeywords(resource.title, resource.summary, resource.type, resource.category, resource.year),
      source: 'local',
      priority: 240,
      payload: {
        resourceId: resource.id,
      },
    }
  })
})
const metaKMeetingItems = computed<WorkspaceMetaKItem[]>(() => {
  return projectMeetings.value.map((meeting) => {
    const scheduleLabel = formatMetaKDateTime(meeting.scheduledStartAt || meeting.startedAt || meeting.updatedAt || '')
    return {
      id: buildWorkspaceMetaKItemId('meeting', meeting.id),
      sectionId: 'meetings',
      type: 'meeting',
      title: normalizeString(meeting.title) || '未命名会议',
      subtitle: [meeting.mode === 'audio' ? '语音会议' : '视频会议', meeting.status, scheduleLabel].filter(Boolean).join(' · '),
      icon: meeting.mode === 'audio' ? 'call' : 'videocam',
      badge: meeting.status,
      hint: '打开会议详情',
      keywords: buildWorkspaceMetaKKeywords(meeting.title, meeting.mode, meeting.status, scheduleLabel),
      source: 'local',
      priority: 220,
      payload: {
        meetingId: meeting.id,
      },
    }
  })
})
const metaKIssueItems = computed<WorkspaceMetaKItem[]>(() => {
  return projectIssues.value.map((issue) => {
    return {
      id: buildWorkspaceMetaKItemId('issue', issue.id),
      sectionId: 'issues',
      type: 'issue',
      title: normalizeString(issue.title) || '未命名 Issue',
      subtitle: [issue.severity, issue.status, normalizeString(issue.recommendation || issue.evidence)].filter(Boolean).join(' · '),
      icon: 'bug_report',
      badge: issue.severity,
      hint: '切到 Issue 视图',
      keywords: buildWorkspaceMetaKKeywords(issue.title, issue.severity, issue.status, issue.evidence, issue.recommendation),
      source: 'local',
      priority: 210,
      payload: {
        issueId: issue.id,
      },
    }
  })
})
const metaKContestItems = computed<WorkspaceMetaKItem[]>(() => {
  return contestSource.value.map((contest) => {
    return {
      id: buildWorkspaceMetaKItemId('contest', contest.id),
      sectionId: 'contests',
      type: 'contest',
      title: normalizeString(contest.name) || '未命名竞赛',
      subtitle: [contest.organizer, contest.registrationWindow, contest.tracks[0]?.name || ''].filter(Boolean).join(' · '),
      icon: 'emoji_events',
      badge: contest.id === selectedContestId.value ? '当前' : '',
      hint: '切到竞赛分析',
      keywords: buildWorkspaceMetaKKeywords(
        contest.name,
        contest.organizer,
        contest.registrationWindow,
        contest.keywords,
        contest.recommendedFor,
        contest.tracks.map(track => track.name),
      ),
      source: 'local',
      priority: 190,
      payload: {
        contestId: contest.id,
      },
    }
  })
})
const metaKOutlineItems = computed<WorkspaceMetaKItem[]>(() => {
  return projectOutlineFlatItems.value.map((item) => {
    const linkedResourceTitles = item.sourceResourceIds
      .map(resourceId => metaKResourceTitleMap.value.get(resourceId) || '')
      .filter(Boolean)
    return {
      id: buildWorkspaceMetaKItemId('outline', item.id),
      sectionId: 'outline',
      type: 'outline',
      title: normalizeString(item.title) || '未命名大纲节点',
      subtitle: linkedResourceTitles.length > 0
        ? linkedResourceTitles.slice(0, 2).join('、')
        : `L${Math.max(1, item.level + 1)} · 暂无关联资源`,
      icon: 'segment',
      hint: linkedResourceTitles.length > 0 ? '打开关联资源' : '定位到大纲',
      keywords: buildWorkspaceMetaKKeywords(item.title, linkedResourceTitles),
      source: 'local',
      priority: 180,
      payload: {
        outlineId: item.id,
        sourceResourceId: item.sourceResourceIds[0] || '',
      },
    }
  })
})
const metaKWorkspaceItems = computed<WorkspaceMetaKItem[]>(() => {
  return workspaceOptions.value.map((item) => {
    const workspaceName = normalizeString(item.workspace.name) || '未命名空间'
    return {
      id: buildWorkspaceMetaKItemId('workspace', item.workspace.id),
      sectionId: 'workspaces',
      type: 'workspace',
      title: workspaceName,
      subtitle: item.workspace.type === 'personal' ? '个人空间' : 'Team 空间',
      icon: item.workspace.type === 'personal' ? 'person' : 'groups',
      badge: item.workspace.id === activeWorkspaceId.value ? '当前' : '',
      hint: '切换空间',
      keywords: buildWorkspaceMetaKKeywords(
        workspaceName,
        item.workspace.type,
        item.workspace.teamProfile?.orgName,
        item.workspace.teamProfile?.orgCode,
      ),
      source: 'local',
      priority: 170,
      defaultVisible: true,
      payload: {
        workspaceId: item.workspace.id,
      },
    }
  })
})
const metaKProjectItems = computed<WorkspaceMetaKItem[]>(() => {
  const items = new Map<string, WorkspaceMetaKItem>()
  for (const project of [...recentQuickSwitchProjects.value, ...myQuickSwitchProjects.value]) {
    const badge = myQuickSwitchProjects.value.some(item => item.projectId === project.projectId)
      ? '我的'
      : '最近'
    items.set(project.projectId, {
      id: buildWorkspaceMetaKItemId('project', project.projectId),
      sectionId: 'projects',
      type: 'project',
      title: normalizeString(project.title) || '未命名项目',
      subtitle: [project.workspaceName, formatMetaKDateTime(project.updatedAt)].filter(Boolean).join(' · '),
      icon: 'dataset',
      badge: activeProjectId.value === project.projectId ? '当前' : badge,
      hint: '切换项目',
      keywords: buildWorkspaceMetaKKeywords(project.title, project.workspaceName),
      source: 'local',
      priority: 165,
      defaultVisible: true,
      payload: {
        projectId: project.projectId,
        workspaceId: project.workspaceId,
      },
    })
  }
  return [...items.values()]
})
const metaKLocalItems = computed<WorkspaceMetaKItem[]>(() => {
  return [
    ...metaKCommandItems.value,
    ...metaKResourceItems.value,
    ...metaKMeetingItems.value,
    ...metaKIssueItems.value,
    ...metaKContestItems.value,
    ...metaKOutlineItems.value,
    ...metaKWorkspaceItems.value,
    ...metaKProjectItems.value,
  ]
})
const metaKLocalSections = computed(() => {
  return buildWorkspaceMetaKSections({
    items: metaKLocalItems.value,
    query: metaKQuery.value,
    definitions: METAK_SECTION_DEFINITIONS,
  })
})
const metaKSections = computed<WorkspaceMetaKSection[]>(() => {
  const sections = [...metaKLocalSections.value]
  if (metaKQuery.value.trim() && (metaKRemoteLoading.value || metaKRemoteLibraryItems.value.length > 0)) {
    sections.push({
      id: 'library',
      title: '系统资料库',
      items: metaKRemoteLibraryItems.value,
      loading: metaKRemoteLoading.value,
    })
  }
  return sections
})
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

function clearMeetingRealtimeRefreshTimer(): void {
  if (!meetingRealtimeRefreshTimer)
    return
  clearTimeout(meetingRealtimeRefreshTimer)
  meetingRealtimeRefreshTimer = null
}

function clearMeetingJoinSession(): void {
  meetingJoinUrl.value = ''
  meetingJoinToken.value = ''
  meetingJoinExpiresAt.value = ''
  meetingRtcServerUrl.value = ''
}

function resetProjectMeetingState(): void {
  clearMeetingRealtimeRefreshTimer()
  projectMeetings.value = []
  activeMeetingId.value = ''
  activeMeetingDetail.value = null
  activeMeetingUtterances.value = []
  meetingLiveCaptions.value = []
  activeMeetingGuestShare.value = null
  clearMeetingJoinSession()
}

function buildMeetingCaptionKey(item: Pick<WorkspaceMeetingCaptionItem, 'speakerLabel' | 'startedAtMs'>): string {
  return `${String(item.speakerLabel || '').trim()}::${Math.max(0, Math.trunc(Number(item.startedAtMs || 0)))}`
}

function trimMeetingLiveCaptions(items: WorkspaceMeetingCaptionItem[]): WorkspaceMeetingCaptionItem[] {
  return [...items]
    .sort((left, right) => left.startedAtMs - right.startedAtMs)
    .slice(-20)
}

function buildMeetingCaptionItem(
  payload: Record<string, unknown>,
  final: boolean,
): WorkspaceMeetingCaptionItem | null {
  const rawText = normalizeString(payload.text)
  if (!rawText)
    return null

  const startedAtMs = Math.max(0, Math.trunc(Number(payload.startedAtMs || 0)))
  const endedAtMs = Math.max(startedAtMs, Math.trunc(Number(payload.endedAtMs || payload.startedAtMs || 0)))
  const speakerName = normalizeString(payload.speakerName) || normalizeString(payload.speakerLabel) || 'Speaker'
  const speakerLabel = normalizeString(payload.speakerLabel) || speakerName
  const participantIdentity = normalizeString(payload.participantIdentity)
  const utteranceId = normalizeString(payload.utteranceId)
  const id = utteranceId
    || (final
      ? `final:${speakerLabel}:${startedAtMs}:${endedAtMs}`
      : `partial:${participantIdentity || speakerLabel}:${startedAtMs}`)

  return {
    id,
    text: rawText,
    speakerName,
    speakerLabel,
    startedAtMs,
    endedAtMs,
    final,
  }
}

function upsertMeetingLiveCaption(item: WorkspaceMeetingCaptionItem): void {
  if (item.final) {
    const targetKey = buildMeetingCaptionKey(item)
    meetingLiveCaptions.value = trimMeetingLiveCaptions(
      meetingLiveCaptions.value.filter(existing => buildMeetingCaptionKey(existing) !== targetKey),
    )
    return
  }

  const targetKey = buildMeetingCaptionKey(item)
  const nextItems = meetingLiveCaptions.value.filter(existing => buildMeetingCaptionKey(existing) !== targetKey)
  nextItems.push(item)
  meetingLiveCaptions.value = trimMeetingLiveCaptions(nextItems)
}

function upsertProjectMeetingInList(meeting: ProjectMeeting): void {
  const normalizedMeetingId = normalizeString(meeting.id)
  if (!normalizedMeetingId)
    return

  const nextItems = [...projectMeetings.value]
  const existingIndex = nextItems.findIndex(item => item.id === normalizedMeetingId)
  if (existingIndex >= 0)
    nextItems.splice(existingIndex, 1, meeting)
  else
    nextItems.unshift(meeting)

  projectMeetings.value = nextItems
    .sort((left, right) => {
      const startedDiff = parseTimestamp(right.startedAt) - parseTimestamp(left.startedAt)
      if (startedDiff !== 0)
        return startedDiff
      return parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt)
    })
    .slice(0, 12)
}

function applyProjectMeetingSession(
  meeting: ProjectMeetingDetail | null,
  options: {
    joinUrl?: string
    joinToken?: string
    joinExpiresAt?: string
    rtcServerUrl?: string
    resetCaptions?: boolean
    preserveJoinSession?: boolean
  } = {},
): void {
  if (!meeting) {
    activeMeetingId.value = ''
    activeMeetingDetail.value = null
    activeMeetingUtterances.value = []
    if (options.resetCaptions !== false)
      meetingLiveCaptions.value = []
    activeMeetingGuestShare.value = null
    clearMeetingJoinSession()
    return
  }

  activeMeetingId.value = meeting.id
  activeMeetingDetail.value = meeting
  upsertProjectMeetingInList(meeting)
  if (!options.preserveJoinSession) {
    meetingJoinUrl.value = normalizeString(options.joinUrl)
    meetingJoinToken.value = normalizeString(options.joinToken)
    meetingJoinExpiresAt.value = normalizeString(options.joinExpiresAt)
    meetingRtcServerUrl.value = normalizeString(options.rtcServerUrl)
  }
  if (options.resetCaptions)
    meetingLiveCaptions.value = []
  syncMeetingGuestShareState(meeting)
}

async function loadProjectMeetingGuestShare(meetingId: string): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId || !activeMeetingIsHost.value) {
    activeMeetingGuestShare.value = null
    return
  }

  meetingGuestShareLoading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingGuestShare | null>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/guest-share`),
    )
    if (activeProjectId.value === projectId && activeMeetingId.value === targetMeetingId)
      activeMeetingGuestShare.value = response.data || null
  }
  catch {
    if (activeProjectId.value === projectId && activeMeetingId.value === targetMeetingId)
      activeMeetingGuestShare.value = null
  }
  finally {
    meetingGuestShareLoading.value = false
  }
}

function syncMeetingGuestShareState(meeting: ProjectMeetingDetail | null): void {
  if (!meeting) {
    activeMeetingGuestShare.value = null
    return
  }
  const currentUserId = currentUserMeetingHostId.value
  if (!currentUserId || normalizeString(meeting.startedByUserId) !== currentUserId || meeting.status === 'ended' || meeting.status === 'failed') {
    activeMeetingGuestShare.value = null
    return
  }
  void loadProjectMeetingGuestShare(meeting.id)
}

async function loadProjectMeetingUtterances(meetingId: string): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId) {
    activeMeetingUtterances.value = []
    return
  }

  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingUtterance[]>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/utterances`),
    )
    if (activeProjectId.value !== projectId || activeMeetingId.value !== targetMeetingId)
      return
    activeMeetingUtterances.value = Array.isArray(response.data) ? response.data : []
  }
  catch {
    if (activeProjectId.value === projectId && activeMeetingId.value === targetMeetingId)
      activeMeetingUtterances.value = []
  }
}

async function loadProjectMeetingDetail(
  meetingId: string,
  options: {
    resetCaptions?: boolean
    preserveJoinSession?: boolean
  } = {},
): Promise<ProjectMeetingDetail | null> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId) {
    applyProjectMeetingSession(null)
    return null
  }

  meetingDetailLoading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingDetail>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}`),
    )
    if (activeProjectId.value !== projectId || activeMeetingId.value !== targetMeetingId)
      return response.data || null

    applyProjectMeetingSession(response.data, {
      resetCaptions: options.resetCaptions,
      preserveJoinSession: options.preserveJoinSession !== false,
    })
    return response.data
  }
  catch (error) {
    if (activeProjectId.value === projectId && activeMeetingId.value === targetMeetingId) {
      activeMeetingDetail.value = null
      activeMeetingUtterances.value = []
      activeMeetingGuestShare.value = null
      clearMeetingJoinSession()
    }
    statusLine.value = resolveApiErrorMessage(error, '加载会议详情失败，请稍后重试。')
    return null
  }
  finally {
    if (activeProjectId.value === projectId && activeMeetingId.value === targetMeetingId)
      meetingDetailLoading.value = false
    else if (!activeProjectId.value)
      meetingDetailLoading.value = false
  }
}

async function selectProjectMeeting(meetingId: string): Promise<void> {
  const targetMeetingId = normalizeString(meetingId)
  if (!targetMeetingId)
    return

  ensureMeetingDetailTabOpen(targetMeetingId)
  workspaceRealtime.subscribeMeeting(targetMeetingId)
  const isSwitchingMeeting = activeMeetingId.value !== targetMeetingId
  activeMeetingId.value = targetMeetingId
  if (isSwitchingMeeting) {
    activeMeetingDetail.value = null
    activeMeetingUtterances.value = []
    meetingLiveCaptions.value = []
    clearMeetingJoinSession()
  }

  await Promise.all([
    loadProjectMeetingDetail(targetMeetingId, { resetCaptions: isSwitchingMeeting, preserveJoinSession: false }),
    loadProjectMeetingUtterances(targetMeetingId),
  ])
}

async function loadProjectMeetings(
  options: {
    fallbackToFirst?: boolean
    preferredMeetingId?: string
    hydrateSelectedDetail?: boolean
  } = {},
): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    resetProjectMeetingState()
    return
  }

  projectMeetingsLoading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<{ items: ProjectMeeting[] }>>(
      endpoint(`/projects/${projectId}/meetings`),
    )
    if (activeProjectId.value !== projectId)
      return

    const items = Array.isArray(response.data?.items) ? response.data.items : []
    projectMeetings.value = items

    const preferredMeetingId = normalizeString(options.preferredMeetingId || activeMeetingId.value)
    const preferredMeeting = preferredMeetingId
      ? items.find(item => item.id === preferredMeetingId) || null
      : null
    if (preferredMeeting) {
      workspaceRealtime.subscribeMeeting(preferredMeeting.id)
      const isSwitchingMeeting = activeMeetingId.value !== preferredMeeting.id
      activeMeetingId.value = preferredMeeting.id
      if (isSwitchingMeeting) {
        activeMeetingDetail.value = null
        activeMeetingUtterances.value = []
        meetingLiveCaptions.value = []
        clearMeetingJoinSession()
      }

      if (options.hydrateSelectedDetail === false)
        return

      await Promise.all([
        loadProjectMeetingDetail(preferredMeeting.id, { resetCaptions: isSwitchingMeeting, preserveJoinSession: false }),
        loadProjectMeetingUtterances(preferredMeeting.id),
      ])
      return
    }

    const selectedMeetingStillExists = Boolean(
      activeMeetingId.value && items.some(item => item.id === activeMeetingId.value),
    )
    if (selectedMeetingStillExists)
      return

    if (options.fallbackToFirst !== false && items[0]?.id) {
      await selectProjectMeeting(items[0].id)
      return
    }

    applyProjectMeetingSession(null)
  }
  catch {
    if (activeProjectId.value === projectId)
      projectMeetings.value = []
  }
  finally {
    if (activeProjectId.value === projectId || !activeProjectId.value)
      projectMeetingsLoading.value = false
  }
}

function scheduleMeetingRealtimeRefresh(options: {
  meetingId?: string
  refreshUtterances?: boolean
} = {}): void {
  const targetMeetingId = normalizeString(options.meetingId || activeMeetingId.value)
  clearMeetingRealtimeRefreshTimer()
  meetingRealtimeRefreshTimer = setTimeout(() => {
    meetingRealtimeRefreshTimer = null
    void loadProjectMeetings({ fallbackToFirst: false })
    if (targetMeetingId && targetMeetingId === activeMeetingId.value) {
      void loadProjectMeetingDetail(targetMeetingId)
      if (options.refreshUtterances)
        void loadProjectMeetingUtterances(targetMeetingId)
    }
  }, 250)
}

async function createProjectMeeting(payload: { mode: ProjectMeetingMode }): Promise<void> {
  ensureMeetingCreateTabOpen(payload.mode)
  statusLine.value = `${payload.mode === 'audio' ? '语音' : '视频'}会议创建页已打开。`
}

async function submitProjectMeetingCreate(payload: ProjectMeetingCreatePayload): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId || meetingMutating.value)
    return

  meetingMutating.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingJoinSessionPayload>>(
      endpoint(`/projects/${projectId}/meetings`),
      {
        method: 'POST',
        body: payload,
      },
    )

    const targetMeeting = response.data.meeting
    activeMeetingUtterances.value = []
    applyProjectMeetingSession(targetMeeting, {
      joinUrl: response.data.rtcJoinUrl || response.data.joinUrl,
      joinToken: response.data.rtcJoinToken || response.data.joinToken,
      joinExpiresAt: response.data.rtcJoinExpiresAt || response.data.joinExpiresAt,
      rtcServerUrl: response.data.rtcServerUrl,
      resetCaptions: true,
    })
    ensureMeetingDetailTabOpen(targetMeeting.id)
    workspaceRealtime.subscribeMeeting(targetMeeting.id)
    openMainTabs.value = normalizeWorkspaceMainTabIds(
      openMainTabs.value.filter(tabId => tabId !== createMeetingCreateTabId(payload.mode)),
      { allowEmpty: true },
    )
    if (targetMeeting.status !== 'scheduled')
      await loadProjectMeetingUtterances(targetMeeting.id)
    statusLine.value = `${payload.mode === 'audio' ? '语音' : '视频'}会议已创建。`
    Message.success('会议已创建。')
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '创建会议失败，请稍后重试。')
    statusLine.value = message
    Message.error(message)
  }
  finally {
    meetingMutating.value = false
  }
}

async function joinProjectMeeting(meetingId: string): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId || meetingMutating.value)
    return

  meetingMutating.value = true
  try {
    ensureMeetingDetailTabOpen(targetMeetingId)
    workspaceRealtime.subscribeMeeting(targetMeetingId)
    activeMeetingId.value = targetMeetingId
    const response = await unsafeFetch<ApiResponse<ProjectMeetingJoinSessionPayload>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/join`),
      {
        method: 'POST',
      },
    )
    applyProjectMeetingSession(response.data.meeting, {
      joinUrl: response.data.rtcJoinUrl || response.data.joinUrl,
      joinToken: response.data.rtcJoinToken || response.data.joinToken,
      joinExpiresAt: response.data.rtcJoinExpiresAt || response.data.joinExpiresAt,
      rtcServerUrl: response.data.rtcServerUrl,
      resetCaptions: false,
    })
    if (response.data.meeting)
      await loadProjectMeetingUtterances(targetMeetingId)
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '加入会议失败，请稍后重试。')
    statusLine.value = message
    Message.error(message)
  }
  finally {
    meetingMutating.value = false
  }
}

async function startProjectMeeting(meetingId: string): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId || meetingMutating.value)
    return

  meetingMutating.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingJoinSessionPayload>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/start`),
      {
        method: 'POST',
      },
    )
    applyProjectMeetingSession(response.data.meeting, {
      joinUrl: response.data.rtcJoinUrl || response.data.joinUrl,
      joinToken: response.data.rtcJoinToken || response.data.joinToken,
      joinExpiresAt: response.data.rtcJoinExpiresAt || response.data.joinExpiresAt,
      rtcServerUrl: response.data.rtcServerUrl,
      resetCaptions: true,
    })
    ensureMeetingDetailTabOpen(targetMeetingId)
    workspaceRealtime.subscribeMeeting(targetMeetingId)
    await loadProjectMeetingUtterances(targetMeetingId)
    statusLine.value = '会议已启动。'
    Message.success('会议已启动。')
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '启动会议失败，请稍后重试。')
    statusLine.value = message
    Message.error(message)
  }
  finally {
    meetingMutating.value = false
  }
}

async function endProjectMeeting(meetingId: string): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId || meetingMutating.value)
    return

  meetingMutating.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingDetail>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/end`),
      {
        method: 'POST',
      },
    )

    upsertProjectMeetingInList(response.data)
    if (activeMeetingId.value === targetMeetingId) {
      applyProjectMeetingSession(response.data, {
        resetCaptions: false,
      })
      clearMeetingJoinSession()
      activeMeetingGuestShare.value = null
      await loadProjectMeetingUtterances(targetMeetingId)
    }

    statusLine.value = '会议已结束，系统正在整理录制与纪要。'
    Message.success('会议已结束。')
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '结束会议失败，请稍后重试。')
    statusLine.value = message
    Message.error(message)
  }
  finally {
    meetingMutating.value = false
  }
}

async function createProjectMeetingGuestShare(meetingId: string): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId || meetingGuestShareLoading.value)
    return

  meetingGuestShareLoading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingGuestShare>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/guest-share`),
      {
        method: 'POST',
      },
    )
    if (activeMeetingId.value === targetMeetingId)
      activeMeetingGuestShare.value = response.data
    statusLine.value = '外部分享链接已生成。'
    Message.success('外部分享链接已生成。')
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '生成外部分享链接失败，请稍后重试。')
    statusLine.value = message
    Message.error(message)
  }
  finally {
    meetingGuestShareLoading.value = false
  }
}

async function regenerateProjectMeetingGuestShare(meetingId: string): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId || meetingGuestShareLoading.value)
    return

  meetingGuestShareLoading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingGuestShare>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/guest-share`),
      {
        method: 'POST',
        body: {
          regenerate: true,
        },
      },
    )
    if (activeMeetingId.value === targetMeetingId)
      activeMeetingGuestShare.value = response.data
    statusLine.value = '外部分享链接已重新生成，旧链接已失效。'
    Message.success('外部分享链接已重新生成。')
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '重新生成外部分享链接失败，请稍后重试。')
    statusLine.value = message
    Message.error(message)
  }
  finally {
    meetingGuestShareLoading.value = false
  }
}

async function revokeProjectMeetingGuestShare(meetingId: string): Promise<void> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetMeetingId = normalizeString(meetingId)
  if (!projectId || !targetMeetingId || meetingGuestShareLoading.value)
    return

  meetingGuestShareLoading.value = true
  try {
    await unsafeFetch<ApiResponse<ProjectMeetingGuestShare | null>>(
      endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/guest-share`),
      {
        method: 'DELETE',
      },
    )
    if (activeMeetingId.value === targetMeetingId)
      activeMeetingGuestShare.value = null
    statusLine.value = '外部分享链接已撤销。'
    Message.success('外部分享链接已撤销。')
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '撤销外部分享链接失败，请稍后重试。')
    statusLine.value = message
    Message.error(message)
  }
  finally {
    meetingGuestShareLoading.value = false
  }
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
    refreshProjectUploadActivities()
    scheduleRealtimeProjectRefresh()
    return
  }

  if (
    messageType === 'meeting.state.updated'
    || messageType === 'meeting.participant.updated'
    || messageType === 'meeting.share.updated'
    || messageType === 'meeting.caption.partial'
    || messageType === 'meeting.caption.final'
    || messageType === 'meeting.summary.ready'
  ) {
    const workspaceId = String(message.workspaceId || '').trim()
    const projectId = String(message.projectId || '').trim()
    if (workspaceId && workspaceId !== activeWorkspaceId.value)
      return
    if (projectId && projectId !== activeProjectId.value)
      return

    const payload = message.payload && typeof message.payload === 'object'
      ? message.payload as Record<string, unknown>
      : {}
    const meetingId = normalizeString(payload.meetingId)

    if (messageType === 'meeting.caption.partial' || messageType === 'meeting.caption.final') {
      if (meetingId && activeMeetingId.value && meetingId !== activeMeetingId.value)
        return

      const caption = buildMeetingCaptionItem(payload, messageType === 'meeting.caption.final')
      if (!caption)
        return

      upsertMeetingLiveCaption(caption)
      if (messageType === 'meeting.caption.final' && meetingId)
        scheduleMeetingRealtimeRefresh({ meetingId, refreshUtterances: true })
      return
    }

    if (messageType === 'meeting.summary.ready') {
      statusLine.value = '会议纪要已就绪，资源区会自动补齐录制与纪要。'
      scheduleMeetingRealtimeRefresh({
        meetingId: meetingId || activeMeetingId.value,
      })
      return
    }

    scheduleMeetingRealtimeRefresh({
      meetingId: meetingId || activeMeetingId.value,
    })
    return
  }

  collabSession.handleRealtimeEnvelope(message)
}

const mappingRows = computed<WorkspaceMappingRow[]>(() => {
  const rubric = selectedTrackRubric.value
  if (!rubric)
    return []

  return rubric.dimensions
    .map((dimension, index) => {
      const weight = Number(dimension.weight)
      const normalizedWeight = Number.isFinite(weight) && weight > 0
        ? clamp(weight, 0, 100)
        : 0

      return {
        id: String(dimension.key || `${rubric.id}-${index + 1}`).trim() || `${rubric.id}-${index + 1}`,
        metric: normalizedWeight > 0 ? `${dimension.name} (${normalizedWeight}%)` : dimension.name,
        hint: String(dimension.description || '').trim() || '暂无指标说明',
        score: normalizedWeight,
        scoreLabel: normalizedWeight > 0 ? `${normalizedWeight}%` : '未标注',
        ability: String(dimension.scoringPoint || '').trim()
          || String(dimension.description || '').trim()
          || '暂无评分要点',
        supportingNote: String(dimension.evidenceRequirement || '').trim()
          || String(dimension.deductionPoint || '').trim()
          || '暂无明确证据要求',
      }
    })
    .filter(row => row.metric.trim())
})

const activeTopicBoardCandidate = computed(() => {
  const board = topicBoardSnapshot.value
  if (!board || board.candidates.length === 0)
    return null
  const selectedCandidateId = String(board.selectedCandidateId || '').trim()
  return board.candidates.find(item => item.candidateId === selectedCandidateId)?.payload
    || board.candidates[0]?.payload
    || null
})

const keywordCloud = computed<WorkspaceKeyword[]>(() => {
  if (!topicBoardSnapshot.value || !activeTopicBoardCandidate.value)
    return []

  const board = topicBoardSnapshot.value
  const candidate = activeTopicBoardCandidate.value
  const seen = new Set<string>()

  return [
    ...board.input.keywords.map(label => ({ label, active: true })),
    ...candidate.trendSignals.map(item => ({ label: item.label, active: true })),
    ...candidate.requiredSkills.map(label => ({ label, active: false })),
    { label: candidate.recommendedTrackName, active: false },
  ]
    .map(item => ({
      label: String(item.label || '').trim(),
      active: item.active,
    }))
    .filter((item) => {
      if (!item.label || seen.has(item.label))
        return false
      seen.add(item.label)
      return true
    })
    .slice(0, 8)
})

const trendBars = computed<number[]>(() => {
  if (!activeTopicBoardCandidate.value)
    return []

  const scores = activeTopicBoardCandidate.value.compareScores
  return [
    scores.contestFit,
    scores.noveltySimilarity,
    scores.evidenceReadiness,
    scores.trendHeat,
    scores.teamMatch,
  ].map(value => clamp(value, 0, 100))
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

const aiBusy = computed(() => listLoading.value || aiFiltering.value || chatLoading.value || formSubmitting.value || topicBoardLoading.value)
const hasWorkspaceBootstrapData = computed(() => {
  return Boolean(selectedContest.value)
    || Boolean(selectedTrack.value)
    || resources.value.length > 0
    || resourceLibrary.value.length > 0
    || projectOutlineItems.value.length > 0
    || workspaceMembers.value.length > 0
    || projectMeetings.value.length > 0
    || chatSessions.value.length > 0
    || Boolean(topicBoardSnapshot.value)
    || projectIssueReports.value.length > 0
    || projectIssues.value.length > 0
    || projectResourceShares.value.length > 0
})
const workspacePreparing = computed(() => {
  return Boolean(activeProjectId.value)
    && workspaceBootstrapLoading.value
    && !hasWorkspaceBootstrapData.value
})

const collabSelectionStatus = ref({
  line: 1,
  column: 1,
  selectionLength: 0,
})

const isMarkdownWorkspaceTabActive = computed(() => {
  return activeMainTabId.value.startsWith('resource:') && previewMode.value === 'markdown'
})

const statusCursor = computed(() => {
  if (isMarkdownWorkspaceTabActive.value) {
    return {
      line: collabSelectionStatus.value.line,
      column: collabSelectionStatus.value.column,
      selectionLength: collabSelectionStatus.value.selectionLength,
    }
  }

  return {
    line: null,
    column: null,
    selectionLength: 0,
  }
})

const rebindUploadInputRef = ref<HTMLInputElement | null>(null)
const pendingRebindSessionId = ref('')
const currentUploadActorUserId = computed(() => String(me.value?.user.id || '').trim())
const currentUploadActorUsername = computed(() => String(me.value?.user.username || '').trim())
const currentUploadActorAvatarUrl = computed(() => String(me.value?.user.avatarUrl || '').trim() || null)

const projectUploadManager = useProjectUploadManager({
  projectId: activeProjectId,
  endpoint,
  currentUserId: currentUploadActorUserId,
  currentUsername: currentUploadActorUsername,
  currentUserAvatarUrl: currentUploadActorAvatarUrl,
  realtimeConnected: workspaceRealtime.connected,
  getUsedBytes: () => projectUploadStorageUsedBytes.value,
  validateFiles: validateUploadFiles,
  onStatusLine: (text) => {
    statusLine.value = text
  },
  onRequireRefresh: async () => {
    await refreshProjectResourceContext()
    await loadProjectOutline()
  },
})

const projectUploadTasks = projectUploadManager.tasks
const projectUploadSummary = projectUploadManager.summary
const projectUploadActivityItems = projectUploadManager.activityItems
const projectUploadHistoryLoaded = projectUploadManager.projectSessionHistoryLoaded
const uploadDrawerOpen = projectUploadManager.drawerOpen

function refreshProjectUploadActivities() {
  void projectUploadManager.refreshProjectSessions()
}

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
      icon: String(commonSource.icon || ''),
      accentColor: String(commonSource.accentColor || ''),
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
    deviceId: ensureWorkspaceDeviceId() || undefined,
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

function normalizeProjectSettingsDraftServerRecord(
  record: ProjectSettingsDraft | null,
  options: { updateServerState?: boolean } = {},
): WorkspaceProjectSettingsDraftCache | null {
  if (!record) {
    if (options.updateServerState)
      resetProjectSettingsDraftServerState()
    return null
  }

  if (options.updateServerState)
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

async function fetchProjectSettingsDraftFromServer(projectId: string): Promise<ProjectSettingsDraftDevicePayload | null> {
  const deviceId = ensureWorkspaceDeviceId()
  if (!projectId || !deviceId)
    return null

  const response = await unsafeFetch<ApiResponse<ProjectSettingsDraftDevicePayload>>(
    endpoint(`/projects/${projectId}/settings-draft`),
    {
      query: {
        deviceId,
      },
    },
  )
  const bundle = response.data || null
  normalizeProjectSettingsDraftServerRecord(bundle?.current || null, { updateServerState: true })
  return bundle
}

function pickProjectSettingsDraftForHydration(
  localDraft: WorkspaceProjectSettingsDraftCache | null,
  bundle: ProjectSettingsDraftDevicePayload | null,
): ProjectSettingsDraftHydrationResult {
  const currentDraft = normalizeProjectSettingsDraftServerRecord(bundle?.current || null, { updateServerState: true })
  const latestOtherDraft = normalizeProjectSettingsDraftServerRecord(bundle?.latestOther || null)
  const currentDeviceDraft = localDraft || currentDraft

  if (currentDeviceDraft) {
    return {
      bundle,
      localDraft,
      currentDraft,
      latestOtherDraft,
      appliedDraft: currentDeviceDraft,
      source: localDraft ? 'local' : 'current',
    }
  }

  if (bundle?.resolution.isNewDevice && latestOtherDraft) {
    return {
      bundle,
      localDraft,
      currentDraft,
      latestOtherDraft,
      appliedDraft: latestOtherDraft,
      source: 'latest_other',
    }
  }

  return {
    bundle,
    localDraft,
    currentDraft,
    latestOtherDraft,
    appliedDraft: null,
    source: '',
  }
}

async function loadProjectSettings(preferredContestId = ''): Promise<ProjectSettingsDraftHydrationResult> {
  if (!activeProjectId.value) {
    resetProjectSettingsState(null)
    return {
      bundle: null,
      localDraft: null,
      currentDraft: null,
      latestOtherDraft: null,
      appliedDraft: null,
      source: '',
    }
  }

  const activeId = activeProjectId.value
  projectSettingsLoading.value = true

  try {
    const response = await unsafeFetch<ApiResponse<ProjectSettingsSnapshot>>(
      endpoint(`/projects/${activeId}/settings`),
      {
        query: preferredContestId
          ? { contestId: preferredContestId }
          : undefined,
      },
    )

    if (activeProjectId.value !== activeId) {
      return {
        bundle: null,
        localDraft: null,
        currentDraft: null,
        latestOtherDraft: null,
        appliedDraft: null,
        source: '',
      }
    }

    applyProjectSettingsSnapshot(response.data, preferredContestId)

    const localDraft = readProjectSettingsDraftCache(activeId)
    let bundle: ProjectSettingsDraftDevicePayload | null = null
    try {
      bundle = await fetchProjectSettingsDraftFromServer(activeId)
    }
    catch {
      resetProjectSettingsDraftServerState()
    }

    if (activeProjectId.value !== activeId) {
      return {
        bundle: null,
        localDraft: null,
        currentDraft: null,
        latestOtherDraft: null,
        appliedDraft: null,
        source: '',
      }
    }

    const picked = pickProjectSettingsDraftForHydration(localDraft, bundle)
    if (!picked.appliedDraft)
      return picked

    const applied = applyProjectSettingsDraftCachePayload(
      picked.appliedDraft,
      'saved_auto',
    )
    if (!applied)
      return picked

    if (picked.source === 'current' || picked.source === 'latest_other')
      writeProjectSettingsDraftCache(activeId, picked.appliedDraft)

    if (picked.source === 'latest_other') {
      statusLine.value = '已从最近设备恢复草稿（未提交）。'
    }
    else if (picked.source === 'current') {
      statusLine.value = '已恢复云端草稿（未提交）。'
    }
    else if (picked.source === 'local') {
      statusLine.value = '已恢复本地草稿（未提交）。'
    }

    return picked
  }
  catch (error) {
    if (activeProjectId.value !== activeId) {
      return {
        bundle: null,
        localDraft: null,
        currentDraft: null,
        latestOtherDraft: null,
        appliedDraft: null,
        source: '',
      }
    }

    resetProjectSettingsState(activeProject.value)
    projectSettingsSaveState.value = 'error'
    statusLine.value = resolveApiErrorMessage(error, '加载项目设置失败，请稍后重试。')
    return {
      bundle: null,
      localDraft: null,
      currentDraft: null,
      latestOtherDraft: null,
      appliedDraft: null,
      source: '',
    }
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
  const deviceId = ensureWorkspaceDeviceId()
  const requestPayload: WorkspaceProjectSettingsDraftCache = {
    ...payload,
    deviceId: payload.deviceId || deviceId || undefined,
  }

  try {
    const response = await unsafeFetch<ApiResponse<ProjectSettingsDraft>>(
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

    normalizeProjectSettingsDraftServerRecord(response.data, { updateServerState: true })
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

async function persistResolvedProjectSettingsDraft(
  projectId: string,
  payload: WorkspaceProjectSettingsDraftCache,
  options: { silent?: boolean } = {},
): Promise<void> {
  const normalizedPayload = normalizeProjectSettingsDraftCachePayload(payload)
  if (!normalizedPayload)
    return

  const persistSeq = ++projectSettingsDraftPersistSeq
  const localSuccess = writeProjectSettingsDraftCache(projectId, normalizedPayload)
  const serverResult = await persistProjectSettingsDraftToServer(projectId, normalizedPayload, persistSeq)

  if (activeProjectId.value !== projectId || persistSeq !== projectSettingsDraftPersistSeq)
    return

  if (serverResult === 'conflict')
    return

  if (!localSuccess && serverResult !== 'success') {
    projectSettingsSaveState.value = 'error'
    if (!options.silent)
      statusLine.value = '草稿缓存失败（可重试）'
    return
  }

  projectSettingsSaveState.value = 'saved_auto'

  if (localSuccess && serverResult === 'success') {
    if (!options.silent)
      statusLine.value = '草稿已缓存（本地 + 云端，未提交）'
    return
  }
  if (localSuccess && serverResult === 'error') {
    if (!options.silent)
      statusLine.value = '草稿已本地缓存，云端同步失败（稍后重试）'
    return
  }
  if (!localSuccess && serverResult === 'success') {
    if (!options.silent)
      statusLine.value = '草稿已云端缓存，本地写入失败（可重试）'
    return
  }

  if (!options.silent)
    statusLine.value = '草稿已自动缓存（未提交）'
}

async function persistProjectSettingsDraftCache(options: { silent?: boolean } = {}) {
  if (projectSettingsHydrating.value || !activeProjectId.value)
    return

  await persistResolvedProjectSettingsDraft(
    activeProjectId.value,
    buildProjectSettingsDraftCachePayload(),
    options,
  )
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
  const deviceId = ensureWorkspaceDeviceId()
  if (!expectedRevision || !deviceId)
    return 'none'

  try {
    await unsafeFetch<ApiResponse<ProjectSettingsDraft | null>>(
      endpoint(`/projects/${projectId}/settings-draft`),
      {
        method: 'DELETE',
        body: {
          expectedRevision,
          deviceId,
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

function resolveWorkspaceViewPreferenceState(record: ProjectWorkspaceViewPreference | null | undefined): ProjectWorkspaceViewState | null {
  if (!record?.payload)
    return null
  return sanitizeProjectWorkspaceViewState(normalizeProjectWorkspaceViewState(record.payload))
}

function buildDeviceRestorePromptContent(options: { view: boolean, draft: boolean }): string {
  if (options.view && options.draft) {
    return '另一台设备存在较新的工作上下文，包括工作区位置和项目设置草稿。\n\n你可以同步最新设备，或继续保留本设备当前内容。'
  }
  if (options.view) {
    return '另一台设备存在较新的工作区位置，包括当前工作台、打开的标签页、会话或会议定位。\n\n你可以同步最新设备，或继续保留本设备当前位置。'
  }
  return '另一台设备存在较新的项目设置草稿。\n\n你可以同步最新设备的草稿，或继续保留本设备当前草稿。'
}

async function resolveProjectDeviceRestore(
  projectId: string,
  restoredViewState: HydratedProjectWorkspaceViewStateResult,
  draftResult: ProjectSettingsDraftHydrationResult,
): Promise<void> {
  if (!projectId || activeProjectId.value !== projectId)
    return

  const currentViewState = resolveWorkspaceViewPreferenceState(restoredViewState.bundle?.current || null)
  const latestOtherViewState = resolveWorkspaceViewPreferenceState(restoredViewState.bundle?.latestOther || null)
  const viewNeedsPrompt = Boolean(
    restoredViewState.bundle?.resolution.isStaleDevice
    && !restoredViewState.hasManagedQuery
    && currentViewState
    && latestOtherViewState
    && !isProjectWorkspaceViewStateEqual(currentViewState, latestOtherViewState),
  )

  const currentDraftBaseline = draftResult.localDraft || draftResult.currentDraft
  const latestOtherDraft = draftResult.latestOtherDraft
  const draftNeedsPrompt = Boolean(
    draftResult.bundle?.resolution.isStaleDevice
    && currentDraftBaseline
    && latestOtherDraft
    && !isProjectSettingsDraftCacheEqual(currentDraftBaseline, latestOtherDraft),
  )

  let choice: DeviceRestoreChoice = 'keep'
  if (viewNeedsPrompt || draftNeedsPrompt) {
    choice = await askDeviceRestoreConfirm(
      '同步最近设备的工作上下文？',
      buildDeviceRestorePromptContent({ view: viewNeedsPrompt, draft: draftNeedsPrompt }),
    )
    if (activeProjectId.value !== projectId)
      return
  }

  if (choice === 'sync') {
    if (viewNeedsPrompt && latestOtherViewState) {
      applyProjectWorkspaceViewState(latestOtherViewState)
      projectSettingsCurrentContestId.value = String(latestOtherViewState.selectedContestId || '').trim()
      syncProjectSettingsAdaptationFormByContest(projectSettingsCurrentContestId.value)
      const syncedPreviewResourceId = normalizeString(latestOtherViewState.previewResourceId)
      if (syncedPreviewResourceId && resources.value.some(item => item.id === syncedPreviewResourceId))
        await openProjectResourcePreview(syncedPreviewResourceId, { openTab: false })
    }

    if (draftNeedsPrompt && latestOtherDraft) {
      const applied = applyProjectSettingsDraftCachePayload(latestOtherDraft, 'saved_auto')
      if (applied)
        writeProjectSettingsDraftCache(projectId, latestOtherDraft)
    }

    statusLine.value = '已同步最近设备的工作上下文。'
  }
  else if (viewNeedsPrompt || draftNeedsPrompt) {
    statusLine.value = '已保留当前设备的工作上下文。'
  }

  await syncProjectWorkspaceViewState()

  const draftToPersist = (choice === 'sync' && draftNeedsPrompt && latestOtherDraft)
    || draftResult.localDraft
    || draftResult.currentDraft
    || (draftResult.source === 'latest_other' ? draftResult.appliedDraft : null)
  if (draftToPersist)
    await persistResolvedProjectSettingsDraft(projectId, draftToPersist, { silent: true })
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
      body.common = buildProjectSettingsCommonPatch(projectSettingsCommon)
    if (projectSettingsBindingsDirty.value)
      body.contestBindings = cloneProjectContestBindings(projectSettingsBindings.value)

    const response = await unsafeFetch<ApiResponse<ProjectSettingsSnapshot>>(
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
    Message.error(resolveApiErrorMessage(error, '保存失败'))
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
    const response = await unsafeFetch<ApiResponse<ProjectSettingsSnapshot>>(
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
    Message.error(resolveApiErrorMessage(error, '保存失败'))
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
    Message.warning('项目已保存，但检测到其他设备有更新草稿，云端缓存未清除。')
    return
  }

  if (clearResult === 'error') {
    projectSettingsSaveState.value = 'error'
    statusLine.value = '项目已保存，但清理云端草稿失败（可重试）。'
    Message.error('项目已保存，但清理云端草稿失败（可重试）。')
    return
  }

  await generateProjectOutline('settings_saved', true)
  projectSettingsSaveState.value = 'saved_manual'
  statusLine.value = '手动保存成功，结构大纲已刷新。'
  Message.success('项目设置已保存。')
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
    selectedContestDetail.value = null
    selectedContestDetailLoading.value = false
    selectedTrackId.value = ''
    projectSettingsCurrentContestId.value = ''
    syncProjectSettingsAdaptationFormByContest('')
    syncFormContestTrack()
    return
  }

  void loadSelectedContestDetail(normalizedContestId)

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
    ensureWorkspaceDeviceId()

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
    const data = await requestProjectApi<Contest[]>(
      endpoint('/contests'),
      {},
      '竞赛目录加载失败。',
    )
    contestCatalog.value = data
  }
  catch {
    if (contestCatalog.value.length === 0)
      contestCatalog.value = contests.value
  }
}

function resetWorkspaceDisplayPreferenceState(): void {
  workspaceDisplayPreferenceSnapshot.value = defaultWorkspaceDisplayPreferenceSnapshot()
  workspaceDisplayPreferenceLoading.value = false
  workspaceDisplayPreferenceSavingScope.value = ''
  workspaceDisplayPreferenceError.value = ''
}

async function loadWorkspaceDisplayPreferenceSnapshot(workspaceId = activeWorkspaceId.value): Promise<void> {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    resetWorkspaceDisplayPreferenceState()
    return
  }

  workspaceDisplayPreferenceLoading.value = true
  workspaceDisplayPreferenceError.value = ''
  try {
    const snapshot = await loadWorkspaceDisplayPreferenceSnapshotByApi(normalizedWorkspaceId)
    if (activeWorkspaceId.value !== normalizedWorkspaceId)
      return
    workspaceDisplayPreferenceSnapshot.value = snapshot
  }
  catch (error) {
    if (activeWorkspaceId.value !== normalizedWorkspaceId)
      return
    workspaceDisplayPreferenceSnapshot.value = defaultWorkspaceDisplayPreferenceSnapshot()
    workspaceDisplayPreferenceError.value = resolveApiErrorMessage(error, '加载工作区显示偏好失败，请稍后重试。')
  }
  finally {
    if (activeWorkspaceId.value === normalizedWorkspaceId)
      workspaceDisplayPreferenceLoading.value = false
  }
}

async function saveWorkspaceDisplayUserOverride(payload: WorkspaceDisplayPreferencePatchPayload): Promise<void> {
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  if (!workspaceId || workspaceDisplayPreferenceSavingScope.value)
    return

  workspaceDisplayPreferenceSavingScope.value = 'user'
  workspaceDisplayPreferenceError.value = ''
  try {
    const nextPayload: WorkspaceDisplayPreferencePatchPayload = {
      fontSizePreset: payload.fontSizePreset,
      tabSpacingPreset: payload.tabSpacingPreset,
    }
    const snapshot = await patchWorkspaceDisplayUserOverrideByApi(workspaceId, nextPayload)
    if (activeWorkspaceId.value !== workspaceId)
      return
    workspaceDisplayPreferenceSnapshot.value = snapshot
    statusLine.value = '当前工作区显示偏好已保存。'
    Message.success('当前工作区显示偏好已保存。')
  }
  catch (error) {
    if (activeWorkspaceId.value !== workspaceId)
      return
    const message = resolveApiErrorMessage(error, '保存当前工作区显示偏好失败，请稍后重试。')
    workspaceDisplayPreferenceError.value = message
    statusLine.value = message
    Message.error(message)
  }
  finally {
    if (activeWorkspaceId.value === workspaceId)
      workspaceDisplayPreferenceSavingScope.value = ''
  }
}

async function saveWorkspaceDisplayTeamDefault(payload: WorkspaceDisplayPreferencePatchPayload): Promise<void> {
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  if (!workspaceId || workspaceDisplayPreferenceSavingScope.value)
    return

  workspaceDisplayPreferenceSavingScope.value = 'team'
  workspaceDisplayPreferenceError.value = ''
  try {
    const nextPayload: WorkspaceDisplayPreferencePatchPayload = {
      fontSizePreset: payload.fontSizePreset,
      tabSpacingPreset: payload.tabSpacingPreset,
    }
    const snapshot = await patchWorkspaceDisplayTeamDefaultByApi(workspaceId, nextPayload)
    if (activeWorkspaceId.value !== workspaceId)
      return
    workspaceDisplayPreferenceSnapshot.value = snapshot
    statusLine.value = '团队默认显示偏好已保存。'
    Message.success('团队默认显示偏好已保存。')
  }
  catch (error) {
    if (activeWorkspaceId.value !== workspaceId)
      return
    const message = resolveApiErrorMessage(error, '保存团队默认显示偏好失败，请稍后重试。')
    workspaceDisplayPreferenceError.value = message
    statusLine.value = message
    Message.error(message)
  }
  finally {
    if (activeWorkspaceId.value === workspaceId)
      workspaceDisplayPreferenceSavingScope.value = ''
  }
}

let selectedContestDetailRequestId = 0

async function loadSelectedContestDetail(contestId = selectedContestId.value) {
  const normalizedContestId = String(contestId || '').trim()
  const requestId = ++selectedContestDetailRequestId

  if (!normalizedContestId) {
    selectedContestDetail.value = null
    selectedContestDetailLoading.value = false
    return
  }

  selectedContestDetailLoading.value = true
  try {
    const data = await requestProjectApi<ContestDetailPayload>(
      endpoint(`/contests/${normalizedContestId}`),
      {},
      '竞赛详情加载失败。',
    )
    if (requestId !== selectedContestDetailRequestId || normalizedContestId !== String(selectedContestId.value || '').trim())
      return
    selectedContestDetail.value = data
  }
  catch {
    if (requestId !== selectedContestDetailRequestId || normalizedContestId !== String(selectedContestId.value || '').trim())
      return
    selectedContestDetail.value = null
  }
  finally {
    if (requestId === selectedContestDetailRequestId && normalizedContestId === String(selectedContestId.value || '').trim())
      selectedContestDetailLoading.value = false
  }
}

async function loadContests() {
  listLoading.value = true
  statusLine.value = ''
  try {
    const data = await requestProjectApi<Contest[]>(
      endpoint('/contests'),
      {
        discipline: discipline.value,
        level: level.value,
        major: major.value,
        trackType: trackType.value,
      },
      '竞赛列表加载失败。',
    )

    contests.value = data
    const catalogMap = new Map<string, Contest>()
    for (const contest of contestCatalog.value)
      catalogMap.set(contest.id, contest)
    for (const contest of data)
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
    const response = await unsafeFetch<ApiResponse<Resource[]>>(endpoint(`/projects/${activeProjectId.value}/resources`))
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
    const response = await unsafeFetch<ApiResponse<Resource[]>>(endpoint(`/projects/${activeProjectId.value}/resources/library`))
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
    const response = await unsafeFetch<ApiResponse<Resource[]>>(endpoint(`/projects/${activeProjectId.value}/resources/recycle`))
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
    const response = await unsafeFetch<ApiResponse<ProjectResourceShare[]>>(endpoint(`/projects/${activeProjectId.value}/resources/shares`))
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
    const response = await unsafeFetch<ApiResponse<ProjectOutlineSnapshot>>(endpoint(`/projects/${projectId}/outline`), {
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
    const response = await unsafeFetch<ApiResponse<AiProjectChangeRequest[]>>(endpoint(`/projects/${projectId}/ai/changes`), {
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
    const response = await unsafeFetch<ApiResponse<ProjectIssuesBundle>>(endpoint(`/projects/${projectId}/issues`), {
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

async function submitIssueReport(reportId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  const normalizedReportId = String(reportId || '').trim()
  if (!projectId || !normalizedReportId || issueReportSubmitting.value)
    return

  issueReportSubmitting.value = true
  try {
    const response = await unsafeFetch<ApiResponse<{ report: ProjectIssueReport, justSubmitted: boolean }>>(
      endpoint(`/projects/${projectId}/issues/${normalizedReportId}/submit`),
      {
        method: 'POST',
      },
    )

    await loadProjectIssues()
    statusLine.value = response.data.justSubmitted
      ? '评审报告已提交。'
      : '评审报告已提交，无需重复操作。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '提交评审失败，请稍后重试。')
  }
  finally {
    issueReportSubmitting.value = false
  }
}

async function exportIssueReport(reportId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  const normalizedReportId = String(reportId || '').trim()
  if (!projectId || !normalizedReportId || issueReportExporting.value || !import.meta.client)
    return

  issueReportExporting.value = true
  try {
    const response = await fetch(endpoint(`/projects/${projectId}/issues/${normalizedReportId}/export`), {
      credentials: 'include',
    })

    if (!response.ok) {
      let errorMessage = '导出评审报告失败，请稍后重试。'
      try {
        const payload = (await response.json()) as { message?: string }
        const message = String(payload?.message || '').trim()
        if (message)
          errorMessage = message
      }
      catch {
        const text = String(await response.text().catch(() => '') || '').trim()
        if (text)
          errorMessage = text
      }
      throw new Error(errorMessage)
    }

    const blob = await response.blob()
    const report = projectIssueReports.value.find(item => item.id === normalizedReportId) || latestIssueReport.value
    triggerBrowserDownloadFromBlob(
      blob,
      toIssueReportMarkdownFileName(report?.title || 'issue-report'),
    )
    statusLine.value = '评审报告已导出。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '导出评审报告失败，请稍后重试。')
  }
  finally {
    issueReportExporting.value = false
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
    await unsafeFetch<ApiResponse<AiProjectChangeRequest>>(endpoint(`/projects/${projectId}/ai/changes/${changeId}/approve`), {
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
    await unsafeFetch<ApiResponse<AiProjectChangeRequest>>(endpoint(`/projects/${projectId}/ai/changes/${changeId}/reject`), {
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
    const response = await unsafeFetch<ApiResponse<ProjectOutlineSnapshot>>(endpoint(`/projects/${projectId}/outline/generate`), {
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
    const response = await unsafeFetch<ApiResponse<Project[]>>(endpoint('/projects'), {
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
    const response = await unsafeFetch<ApiResponse<Project[]>>(endpoint('/projects'))
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
    const response = await unsafeFetch<ApiResponse<ProjectMemberManagementSnapshot>>(endpoint(`/projects/${projectId}/members`))
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
    await unsafeFetch<ApiResponse<ProjectSeatQuota>>(endpoint(`/projects/${projectId}/seats`), {
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
    const response = await unsafeFetch<ApiResponse<{ token: string, snapshot: ProjectMemberManagementSnapshot }>>(endpoint(`/projects/${projectId}/invitations`), {
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
    const response = await unsafeFetch<ApiResponse<ProjectMemberManagementSnapshot>>(
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
    const response = await unsafeFetch<ApiResponse<ProjectMemberManagementSnapshot>>(
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
    const response = await unsafeFetch<ApiResponse<ProjectMemberManagementSnapshot & { revoked?: boolean }>>(
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
    await unsafeFetch(endpoint(`/projects/${activeProjectId.value}/resources/library`), {
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
    const response = await unsafeFetch<ApiResponse<{ resource: Resource, snapshot: CollabSnapshotPayload }>>(endpoint(`/projects/${projectId}/resources/collab`), {
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
    await unsafeFetch(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}`), {
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
    await unsafeFetch(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}/restore`), {
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
    await unsafeFetch(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}/purge`), {
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
    const response = await unsafeFetch<ApiResponse<Resource>>(endpoint(`/projects/${activeProjectId.value}/resources/${targetResourceId}/duplicate`), {
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

  try {
    await projectUploadManager.enqueueFiles(files)
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '上传资源失败，请稍后重试。')
  }
}

async function uploadMarkdownImage(file: File): Promise<{
  src: string
  alt?: string
  title?: string
  resourceId?: string
}> {
  const projectId = String(activeProjectId.value || '').trim()
  const hostMarkdownResourceId = String(previewResourceId.value || '').trim()
  const mimeType = String(file?.type || '').trim()

  if (!projectId) {
    const message = '请先选择一个项目。'
    statusLine.value = message
    throw new Error(message)
  }

  if (!hostMarkdownResourceId) {
    const message = '当前文档未就绪，暂时无法上传图片。'
    statusLine.value = message
    throw new Error(message)
  }

  if (!mimeType.startsWith('image/')) {
    const message = '当前仅支持上传图片文件。'
    statusLine.value = message
    throw new Error(message)
  }

  if (!isProjectResourceUploadFileSupported(file.name)) {
    const message = '图片格式不支持，请更换后重试。'
    statusLine.value = message
    throw new Error(message)
  }

  if (file.size > PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES) {
    const message = `图片过大，单文件上限 ${formatFileSize(PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)}。`
    statusLine.value = message
    throw new Error(message)
  }

  const formData = new FormData()
  formData.append('category', 'basic_info')
  formData.append('accessLevel', 'login_required')
  formData.append('hostMarkdownResourceId', hostMarkdownResourceId)
  formData.append('file', file)

  try {
    const response = await authApiFetch<ApiResponse<{
      resources: Resource[]
    }>>(`/projects/${projectId}/resources/upload`, {
      method: 'POST',
      body: formData,
    })
    const resource = response.data?.resources?.[0] || null
    if (!resource?.id) {
      const message = '图片上传成功，但资源回执缺失。'
      statusLine.value = message
      throw new Error(message)
    }

    const fallbackTitle = String(file.name || '').trim() || '图片'
    const resolvedTitle = String(resource.title || '').trim() || fallbackTitle
    statusLine.value = `图片已上传：${resolvedTitle}`
    return {
      src: endpoint(`/projects/${projectId}/resources/${resource.id}/file`),
      alt: resolvedTitle,
      title: resolvedTitle,
      resourceId: resource.id,
    }
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '上传图片失败，请稍后重试。')
    statusLine.value = message
    throw error instanceof Error ? error : new Error(message)
  }
}

function openUploadDrawer() {
  projectUploadManager.toggleDrawer()
}

async function pauseUploadTask(sessionId: string) {
  await projectUploadManager.pauseTask(sessionId)
}

async function resumeUploadTask(sessionId: string) {
  await projectUploadManager.resumeTask(sessionId)
}

async function retryUploadTask(sessionId: string) {
  await projectUploadManager.retryTask(sessionId)
}

async function cancelUploadTask(sessionId: string) {
  await projectUploadManager.cancelTask(sessionId)
}

function clearCompletedUploadTasks() {
  projectUploadManager.clearCompletedTasks()
}

function requestRebindUploadTask(sessionId: string) {
  pendingRebindSessionId.value = String(sessionId || '').trim()
  if (!pendingRebindSessionId.value)
    return
  nextTick(() => {
    rebindUploadInputRef.value?.click()
  })
}

async function handleRebindUploadInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = Array.from(target.files || []).find(item => item instanceof File)
  const sessionId = pendingRebindSessionId.value
  target.value = ''
  pendingRebindSessionId.value = ''
  if (!file || !sessionId)
    return

  try {
    await projectUploadManager.rebindTaskFile(sessionId, file)
    projectUploadManager.openDrawer('auto')
    statusLine.value = `已重新绑定文件：${file.name}。`
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '重新绑定上传文件失败，请稍后重试。')
  }
}

async function pauseAllUploadTasks() {
  const targets = projectUploadTasks.value.filter(task => task.status === 'uploading')
  await Promise.allSettled(targets.map(task => projectUploadManager.pauseTask(task.sessionId)))
}

async function resumeAllUploadTasks() {
  const targets = projectUploadTasks.value.filter((task) => {
    return (task.status === 'paused' || task.status === 'failed') && !task.needsFileRebind
  })
  await Promise.allSettled(targets.map(task => projectUploadManager.resumeTask(task.sessionId)))
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

function updateCollabCursor(value: { cursorX?: number, cursorY?: number }): void {
  collabSession.updatePresenceCursor(value.cursorX, value.cursorY)
}

function updateCollabSelectionStatus(value: { line: number, column: number, selectionLength: number }): void {
  collabSelectionStatus.value = {
    line: Math.max(1, Math.trunc(Number(value.line) || 1)),
    column: Math.max(1, Math.trunc(Number(value.column) || 1)),
    selectionLength: Math.max(0, Math.trunc(Number(value.selectionLength) || 0)),
  }
}

async function fetchCollabSnapshot(resourceId: string): Promise<CollabSnapshotPayload | null> {
  const projectId = String(activeProjectId.value || '').trim()
  const targetResourceId = String(resourceId || '').trim()
  if (!projectId || !targetResourceId)
    return null

  const targetResource = resources.value.find(item => item.id === targetResourceId) || null
  const resourceLabel = resolveCollabResourceLabel(targetResource)

  try {
    const response = await unsafeFetch<ApiResponse<CollabSnapshotPayload>>(endpoint(`/projects/${projectId}/resources/${targetResourceId}/collab`))
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
    const response = await unsafeFetch<ApiResponse<{ resource: Resource, snapshot: CollabSnapshotPayload }>>(endpoint(`/projects/${projectId}/resources/collab`), {
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
    const response = await unsafeFetch<ApiResponse<ResourcePreviewStatusPayload>>(endpoint(`/projects/${projectId}/resources/${targetResourceId}/preview-status`))
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
    const response = await unsafeFetch<ApiResponse<ProjectResourceShare>>(endpoint(`/projects/${projectId}/resources/${targetResourceId}/shares`), {
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
    await unsafeFetch(endpoint(`/projects/${projectId}/resources/shares/${targetShareId}`), {
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
    await unsafeFetch(endpoint(`/projects/${projectId}/resources/${resourceId}/reconvert`), {
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

function buildProjectApiRequestUrl(path: string, query: Record<string, string | number>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    search.set(key, String(value))
  const queryText = search.toString()
  return queryText ? `${path}?${queryText}` : path
}

async function requestProjectApi<T>(path: string, query: Record<string, string | number>, fallbackMessage: string): Promise<T> {
  const response = await fetch(buildProjectApiRequestUrl(path, query), {
    credentials: 'include',
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw new Error(String(payload?.message || fallbackMessage))
  return payload.data
}

async function loadChatMessages(sessionId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!activeWorkspaceId.value || !projectId || !sessionId) {
    resetChatState()
    return
  }

  try {
    const data = await requestProjectApi<{ session: AiChatSession, messages: AiChatMessage[] }>(
      endpoint(`/teams/${activeWorkspaceId.value}/chat/sessions/${sessionId}/messages`),
      {
        projectId,
        mode: aiMode.value,
        limit: 200,
      },
      '会话消息加载失败。',
    )

    const restoredMessages = data.messages.map(item => ({
      role: item.role,
      content: item.content,
    })) as ChatMessage[]

    chatDraft.value = null
    chatMissingFields.value = []
    defenseRounds.value = []
    defenseScorecard.value = null
    defenseSummary.value = null
    defenseStage.value = undefined
    defenseTurnCount.value = 0
    chatMessages.value = restoredMessages

    if (aiMode.value === 'defense')
      await loadDefenseSessionDetail(sessionId)
  }
  catch {
    resetChatState()
  }
}

async function loadDefensePersonas() {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    defensePersonas.value = []
    return
  }

  defensePersonasLoading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<{ items: AiDefensePersona[] }>>(
      endpoint(`/projects/${projectId}/defense/personas`),
    )
    defensePersonas.value = response.data.items
  }
  catch {
    defensePersonas.value = []
  }
  finally {
    defensePersonasLoading.value = false
  }
}

async function loadDefenseSessionDetail(sessionId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId || !sessionId) {
    defenseRounds.value = []
    defenseSummary.value = null
    defenseStage.value = undefined
    defenseTurnCount.value = 0
    return
  }

  try {
    const response = await unsafeFetch<ApiResponse<AiDefenseSessionDetail>>(
      endpoint(`/projects/${projectId}/defense/sessions/${sessionId}`),
    )
    const detail = response.data
    defensePersonas.value = detail.personas || []
    defenseSummary.value = detail.latestSummary || null
    defenseStage.value = detail.state?.currentStage
    defenseTurnCount.value = detail.state?.turnCount || 0
    defenseScorecard.value = detail.state?.lastScorecard || defenseScorecard.value
    if (detail.turns.length > 0) {
      const latestTurnIndex = detail.state?.turnCount || detail.turns[detail.turns.length - 1]?.turnIndex || 0
      defenseRounds.value = detail.turns
        .filter(item => item.turnIndex === latestTurnIndex)
        .map(item => ({
          judge: item.judgeName,
          judgeType: item.judgeType,
          personaId: item.personaId || undefined,
          question: item.question,
          score: item.score,
          comment: item.comment,
          followUp: item.followUp,
          evidenceRefs: item.evidenceRefs,
        }))
    }
    else {
      defenseRounds.value = []
    }
  }
  catch {
    defenseRounds.value = []
    defenseScorecard.value = null
    defenseSummary.value = null
    defenseStage.value = undefined
    defenseTurnCount.value = 0
  }
}

async function importDefensePersonas() {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId || !selectedContestId.value) {
    statusLine.value = '请先选择竞赛，再导入答辩人设。'
    return
  }

  try {
    await unsafeFetch(endpoint(`/projects/${projectId}/defense/personas/import`), {
      method: 'POST',
      body: {
        contestId: selectedContestId.value,
        trackId: selectedTrackId.value,
      },
    })
    await loadDefensePersonas()
    statusLine.value = '已导入比赛预设人设。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '导入答辩人设失败，请稍后重试。')
  }
}

async function saveDefensePersona(payload: {
  personaId?: string
  judgeType: AiDefensePersona['judgeType']
  name: string
  summary: string
  systemPrompt: string
  focusAreas: string[]
  enabled: boolean
}) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    statusLine.value = '请先选择项目。'
    return
  }

  try {
    if (payload.personaId) {
      await unsafeFetch(endpoint(`/projects/${projectId}/defense/personas/${payload.personaId}`), {
        method: 'PATCH',
        body: payload,
      })
    }
    else {
      await unsafeFetch(endpoint(`/projects/${projectId}/defense/personas`), {
        method: 'POST',
        body: payload,
      })
    }
    await loadDefensePersonas()
    statusLine.value = '答辩人设已保存。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '保存答辩人设失败，请稍后重试。')
  }
}

async function deleteDefensePersona(personaId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId || !personaId)
    return

  try {
    await unsafeFetch(endpoint(`/projects/${projectId}/defense/personas/${personaId}`), {
      method: 'DELETE',
    })
    await loadDefensePersonas()
    statusLine.value = '答辩人设已删除。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '删除答辩人设失败，请稍后重试。')
  }
}

async function generateDefenseSummary() {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId || !activeChatSessionId.value) {
    statusLine.value = '请先完成至少一轮答辩，再生成总结。'
    return
  }

  defenseSummaryLoading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<{ item: AiDefenseSummary }>>(
      endpoint(`/projects/${projectId}/defense/sessions/${activeChatSessionId.value}/summary`),
      {
        method: 'POST',
        body: {
          summaryType: 'session',
        },
      },
    )
    defenseSummary.value = response.data.item
    await loadDefenseSessionDetail(activeChatSessionId.value)
    statusLine.value = '答辩总结已生成。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '生成答辩总结失败，请稍后重试。')
  }
  finally {
    defenseSummaryLoading.value = false
  }
}

async function startDefenseRealtime() {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId || meetingMutating.value) {
    if (!projectId)
      statusLine.value = '请先选择项目。'
    return
  }

  meetingMutating.value = true
  try {
    const enabledPersonaIds = defensePersonas.value
      .filter(item => item.enabled)
      .map(item => item.id)
    const response = await unsafeFetch<ApiResponse<DefenseRealtimeSessionPayload>>(
      endpoint(`/projects/${projectId}/defense/realtime-sessions`),
      {
        method: 'POST',
        body: {
          mode: 'audio',
          personaIds: enabledPersonaIds,
        },
      },
    )
    activeChatSessionId.value = response.data.sessionId
    defenseStage.value = 'opening'
    defenseTurnCount.value = 0
    activeMeetingUtterances.value = []
    applyProjectMeetingSession(response.data.meeting, {
      joinUrl: response.data.rtcJoinUrl || response.data.joinUrl,
      joinToken: response.data.rtcJoinToken || response.data.joinToken,
      joinExpiresAt: response.data.rtcJoinExpiresAt || response.data.joinExpiresAt,
      rtcServerUrl: response.data.rtcServerUrl,
      resetCaptions: true,
    })
    ensureMeetingDetailTabOpen(response.data.meeting.id)
    workspaceRealtime.subscribeMeeting(response.data.meeting.id)
    await loadChatSessions({
      preferredSessionId: response.data.sessionId,
    })
    statusLine.value = '已发起语音答辩会话，正在进入会议面板。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '发起语音答辩失败，请稍后重试。')
  }
  finally {
    meetingMutating.value = false
  }
}

function buildSessionTitleByMode(): string {
  const contestName = selectedContest.value?.name || '未选择竞赛'
  const trackName = selectedTrack.value?.name || '未选择赛道'

  if (aiMode.value === 'auto_optimize')
    return `Loopy 自动优化 · ${contestName} · ${trackName}`
  if (aiMode.value === 'issue_discovery')
    return `Loopy 寻疑发现 · ${contestName} · ${trackName}`
  if (aiMode.value === 'defense')
    return `Loopy 答辩模拟 · ${contestName} · ${trackName}`
  return `Loopy 对话 · ${contestName} · ${trackName}`
}

async function createChatSession(preferredTitle = ''): Promise<string | null> {
  const projectId = String(activeProjectId.value || '').trim()
  if (!activeWorkspaceId.value || !projectId)
    return null

  try {
    const response = await unsafeFetch<ApiResponse<AiChatSession>>(
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

async function loadChatSessions(options: {
  preferredSessionId?: string
  autoCreate?: boolean
  fallbackToFirst?: boolean
} = {}) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!activeWorkspaceId.value || !projectId) {
    chatSessions.value = []
    activeChatSessionId.value = ''
    resetChatState()
    return
  }

  chatSessionsLoading.value = true
  try {
    const data = await requestProjectApi<AiChatSession[]>(
      endpoint(`/teams/${activeWorkspaceId.value}/chat/sessions`),
      {
        projectId,
        mode: aiMode.value,
        limit: 30,
      },
      '会话列表加载失败。',
    )
    chatSessions.value = data

    const preferredSessionId = normalizeString(options.preferredSessionId)
    const fallbackToFirst = options.fallbackToFirst !== false
    const nextSession = (
      (preferredSessionId ? chatSessions.value.find(item => item.id === preferredSessionId) : null)
      || chatSessions.value.find(item => item.id === activeChatSessionId.value)
      || (fallbackToFirst ? chatSessions.value[0] : null)
    )

    if (!nextSession) {
      if (options.autoCreate === false) {
        activeChatSessionId.value = ''
        resetChatState()
        return
      }

      const createdId = await createChatSession()
      if (!createdId) {
        activeChatSessionId.value = ''
        resetChatState()
        return
      }
      activeChatSessionId.value = createdId
      await loadChatSessions({
        preferredSessionId: createdId,
      })
      return
    }

    activeChatSessionId.value = nextSession.id
    await loadChatMessages(nextSession.id)
  }
  catch {
    chatSessions.value = []
    activeChatSessionId.value = ''
    resetChatState()
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
  let modeTitle = '新建 Loopy 对话'
  if (aiMode.value === 'defense')
    modeTitle = '新建 Loopy 答辩会话'
  else if (aiMode.value === 'auto_optimize')
    modeTitle = '新建 Loopy 自动优化会话'
  else if (aiMode.value === 'issue_discovery')
    modeTitle = '新建 Loopy 寻疑发现会话'
  const createdId = await createChatSession(modeTitle)
  if (!createdId) {
    statusLine.value = '新建 Loopy 会话失败，请稍后重试。'
    return
  }

  await loadChatSessions({
    preferredSessionId: createdId,
  })
  statusLine.value = '已创建新的 Loopy 会话。'
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
    const response = await unsafeFetch<ApiResponse<AiContestFilterResult>>(endpoint('/ai/contest-filter'), {
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

function buildTopicBoardInput(source: ProjectTopicBoardCreateSeed['source'] = 'workspace_dashboard'): ProjectTopicBoardGenerateRequest['input'] {
  return {
    contestId: String(selectedContestId.value || '').trim(),
    trackId: String(selectedTrackId.value || '').trim(),
    major: major.value.trim(),
    discipline: topicBoardDraft.discipline.trim() || discipline.value.trim(),
    topicType: topicBoardDraft.topicType.trim() || trackType.value.trim(),
    expectedDifficulty: topicBoardDraft.expectedDifficulty.trim() || level.value.trim(),
    keywords: splitTopicBoardTags(topicBoardDraft.keywordsText),
    teamSkillTags: splitTopicBoardTags(topicBoardDraft.teamSkillTagsText),
    candidateCount: clamp(Math.round(Number(topicBoardDraft.candidateCount || 3)), 3, 5),
    source,
  }
}

function syncTopicBoardDraftFromSeed(seed: ProjectTopicBoardCreateSeed) {
  topicBoardDraft.discipline = String(seed.discipline || '').trim()
  topicBoardDraft.topicType = String(seed.topicType || '').trim()
  topicBoardDraft.expectedDifficulty = String(seed.expectedDifficulty || '').trim()
  topicBoardDraft.keywordsText = (seed.keywords || []).join('\n')
  topicBoardDraft.teamSkillTagsText = (seed.teamSkillTags || []).join('\n')
  topicBoardDraft.candidateCount = clamp(Math.round(Number(seed.candidateCount || 3)), 3, 5)
}

function findTopicBoardCandidate(candidateId: string): TopicProposalItem | null {
  const normalizedCandidateId = String(candidateId || '').trim()
  if (!normalizedCandidateId)
    return null
  return topicBoardSnapshot.value?.candidates.find(item => item.candidateId === normalizedCandidateId)?.payload || null
}

function isCurrentTopicBoardScope(projectId: string, workspaceId = ''): boolean {
  const currentProjectId = String(activeProjectId.value || '').trim()
  if (projectId !== currentProjectId)
    return false

  if (!workspaceId)
    return true

  return workspaceId === String(activeWorkspaceId.value || '').trim()
}

async function loadTopicBoards() {
  const requestId = ++topicBoardLoadRequestId
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    topicBoardFetching.value = false
    topicBoardSnapshot.value = null
    topicBoardHistory.value = []
    return
  }
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  topicBoardFetching.value = true

  try {
    const response = await unsafeFetch<ApiResponse<ProjectTopicBoardListResult>>(endpoint(`/projects/${projectId}/topic-boards`))
    if (requestId !== topicBoardLoadRequestId || !isCurrentTopicBoardScope(projectId, workspaceId))
      return
    topicBoardSnapshot.value = response.data.latestBoard
    topicBoardHistory.value = response.data.history
    topicBoardError.value = ''
  }
  catch {
    if (requestId !== topicBoardLoadRequestId || !isCurrentTopicBoardScope(projectId, workspaceId))
      return
    topicBoardSnapshot.value = null
    topicBoardHistory.value = []
  }
  finally {
    if (requestId === topicBoardLoadRequestId && isCurrentTopicBoardScope(projectId, workspaceId))
      topicBoardFetching.value = false
  }
}

async function generateTopicBoard(source: ProjectTopicBoardCreateSeed['source'] = 'workspace_dashboard') {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    statusLine.value = '请先选择一个项目。'
    return
  }

  const workspaceId = String(activeWorkspaceId.value || '').trim()
  if (!workspaceId) {
    statusLine.value = '请先选择一个空间。'
    return
  }

  const input = buildTopicBoardInput(source)
  if (!input.contestId || !input.trackId) {
    statusLine.value = '请先锁定竞赛与赛道，再生成选题板。'
    return
  }

  activeMainTabId.value = 'dashboard'
  const requestId = ++topicBoardWriteRequestId
  topicBoardLoading.value = true
  topicBoardError.value = ''

  try {
    const response = await unsafeFetch<ApiResponse<ProjectTopicBoard>>(endpoint(`/projects/${projectId}/topic-boards/generate`), {
      method: 'POST',
      body: {
        input,
      } satisfies ProjectTopicBoardGenerateRequest,
    })
    if (requestId !== topicBoardWriteRequestId || !isCurrentTopicBoardScope(projectId, workspaceId))
      return

    topicBoardSnapshot.value = response.data
    topicBoardHistory.value = [response.data, ...topicBoardHistory.value.filter(item => item.id !== response.data.id)].slice(0, 5)
    statusLine.value = response.meta.fallbackUsed
      ? '选题板已生成，当前为内部资料/规则兜底结果。'
      : '选题板已生成，可继续设主推、写入草案或发送到右侧 AI。'
  }
  catch (error) {
    const message = resolveApiErrorMessage(error, '生成选题板失败，请稍后重试。')
    if (requestId !== topicBoardWriteRequestId || !isCurrentTopicBoardScope(projectId, workspaceId))
      return
    topicBoardError.value = message
    statusLine.value = message
  }
  finally {
    if (requestId === topicBoardWriteRequestId)
      topicBoardLoading.value = false
  }
}

async function patchTopicBoard(payload: ProjectTopicBoardPatchRequest) {
  const requestId = ++topicBoardWriteRequestId
  const boardId = String(topicBoardSnapshot.value?.id || '').trim()
  const projectId = String(activeProjectId.value || '').trim()
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  if (!boardId || !projectId)
    return

  const response = await unsafeFetch<ApiResponse<ProjectTopicBoard>>(endpoint(`/projects/${projectId}/topic-boards/${boardId}`), {
    method: 'PATCH',
    body: payload,
  })
  if (requestId !== topicBoardWriteRequestId || !isCurrentTopicBoardScope(projectId, workspaceId))
    return

  topicBoardSnapshot.value = response.data
  topicBoardHistory.value = topicBoardHistory.value.map(item => item.id === response.data.id ? response.data : item)
}

async function updateTopicBoardCandidateStatus(candidateId: string, decisionStatus: TopicProposalDecisionStatus) {
  const normalizedCandidateId = String(candidateId || '').trim()
  if (!normalizedCandidateId)
    return

  topicBoardActioningCandidateId.value = normalizedCandidateId
  try {
    await patchTopicBoard({
      candidateUpdates: [
        {
          candidateId: normalizedCandidateId,
          decisionStatus,
        },
      ],
    })
    statusLine.value = decisionStatus === 'shortlisted'
      ? '已加入短名单。'
      : decisionStatus === 'rejected'
        ? '已标记为淘汰。'
        : '候选题状态已更新。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '更新候选题状态失败。')
  }
  finally {
    topicBoardActioningCandidateId.value = ''
  }
}

async function selectTopicBoardCandidate(candidateId: string) {
  const normalizedCandidateId = String(candidateId || '').trim()
  if (!normalizedCandidateId)
    return

  topicBoardActioningCandidateId.value = normalizedCandidateId
  try {
    await patchTopicBoard({
      selectedCandidateId: normalizedCandidateId,
    })
    statusLine.value = '已更新主推题。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '更新主推题失败。')
  }
  finally {
    topicBoardActioningCandidateId.value = ''
  }
}

function buildTopicBoardChatPrompt(candidate: TopicProposalItem): string {
  return [
    `请围绕候选题《${candidate.title}》继续深挖，并按当前项目上下文输出下一步建议。`,
    `主推理由：${candidate.reason}`,
    candidate.innovationPoints.length > 0 ? `创新点：${candidate.innovationPoints.join('；')}` : '',
    candidate.contestFitReasons.length > 0 ? `竞赛适配：${candidate.contestFitReasons.join('；')}` : '',
    candidate.requiredSkills.length > 0 ? `所需技能：${candidate.requiredSkills.join('、')}` : '',
    candidate.teamGapNotes.length > 0 ? `能力缺口：${candidate.teamGapNotes.join('；')}` : '',
    candidate.evidenceRefs.length > 0 ? `证据摘要：${candidate.evidenceRefs.map(item => `${item.sourceLabel}-${item.title}`).join('；')}` : '',
  ].filter(Boolean).join('\n')
}

async function sendTopicBoardCandidateToChat(candidateId: string) {
  const candidate = findTopicBoardCandidate(candidateId)
  const projectId = String(activeProjectId.value || '').trim()
  if (!candidate || !projectId || !activeWorkspaceId.value)
    return

  expandRightSidebar()
  aiMode.value = 'dialog_ask'
  await nextTick()
  await loadChatSessions()
  if (!isCurrentTopicBoardScope(projectId) || aiMode.value !== 'dialog_ask')
    return
  chatInput.value = buildTopicBoardChatPrompt(candidate)
  await nextTick()
  await sendChatMessage()
}

function hasExistingFormDraftContent(): boolean {
  return Boolean(
    formState.title
    || formState.problemStatement
    || formState.innovationPointsText
    || formState.techRouteStepsText
    || formState.scoringMappingText
    || formState.risksText
    || formState.deliverablesText
    || formState.summary,
  )
}

function resolveTopicBoardDraftDeliverables(): string[] {
  const contestId = String(projectSettingsCurrentContestId.value || selectedContestId.value || '').trim()
  const contest = contestMap.value.get(contestId) || selectedContest.value
  const trackId = String(projectSettingsBindingMap.value.get(contestId)?.trackId || selectedTrackId.value || '').trim()
  const track = (trackId && contest?.tracks.find(item => item.id === trackId)) || selectedTrack.value || null

  if (track?.deliverableTypes?.length)
    return [...track.deliverableTypes]

  return ['项目方案书', '演示材料', '答辩问题清单']
}

function buildTopicBoardDraftContent(candidate: TopicProposalItem): WorkspaceProjectCommonForm {
  return {
    title: candidate.title,
    icon: '',
    accentColor: '',
    problemStatement: candidate.reason,
    innovationPointsText: candidate.innovationPoints.join('\n'),
    techRouteStepsText: candidate.techRouteSteps.join('\n'),
    scoringMappingText: [
      ...candidate.scoringMapping,
      ...candidate.contestFitReasons.map(item => `适配说明 -> ${item}`),
    ].join('\n'),
    risksText: [...candidate.risks, ...candidate.teamGapNotes].join('\n'),
    deliverablesText: resolveTopicBoardDraftDeliverables().join('\n'),
    summary: [
      candidate.reason,
      candidate.evidenceRefs[0]?.summary || '',
    ].filter(Boolean).join(' '),
  }
}

function syncTopicBoardCandidateToProjectSettings(candidate: TopicProposalItem): {
  draftContent: WorkspaceProjectCommonForm
  syncedAdaptation: boolean
} {
  const draftContent = buildTopicBoardDraftContent(candidate)

  Object.assign(projectSettingsCommon, cloneProjectCommonForm(draftContent))
  projectSettingsCommonDirty.value = true

  const contestId = String(projectSettingsCurrentContestId.value || selectedContestId.value || '').trim()
  const binding = projectSettingsBindingMap.value.get(contestId)
  let syncedAdaptation = false

  if (contestId && binding) {
    const adaptationDraft: WorkspaceProjectAdaptationForm = {
      contestId,
      trackId: binding.trackId,
      problemStatement: draftContent.problemStatement,
      innovationPointsText: draftContent.innovationPointsText,
      techRouteStepsText: draftContent.techRouteStepsText,
      scoringMappingText: draftContent.scoringMappingText,
      risksText: draftContent.risksText,
      deliverablesText: draftContent.deliverablesText,
      summary: draftContent.summary,
    }

    projectSettingsHydrating.value = true
    try {
      Object.assign(projectSettingsAdaptation, cloneProjectAdaptationForm(adaptationDraft))
    }
    finally {
      projectSettingsHydrating.value = false
    }

    upsertProjectSettingsAdaptationDraft(adaptationDraft)
    markProjectSettingsAdaptationDirty(contestId)
    syncedAdaptation = true
  }

  scheduleProjectSettingsDraftPersist()

  return {
    draftContent,
    syncedAdaptation,
  }
}

async function applyTopicBoardCandidateToForm(candidateId: string) {
  const candidate = findTopicBoardCandidate(candidateId)
  if (!candidate)
    return

  if (hasExistingFormDraftContent() && import.meta.client) {
    const confirmed = await askTopicBoardConfirm({
      title: '覆盖当前项目草案',
      content: '当前项目草案已有内容，继续写入会覆盖现有字段，是否继续？',
      okText: '继续写入',
    })
    if (!confirmed)
      return
  }

  const { draftContent, syncedAdaptation } = syncTopicBoardCandidateToProjectSettings(candidate)

  Object.assign(formState, {
    source: 'form',
    ...draftContent,
  })

  statusLine.value = syncedAdaptation
    ? '已写入项目草案，并同步到项目设置草稿。'
    : '已写入项目草案，并同步到项目通用设置草稿。'

  if (!import.meta.client)
    return

  const shouldSave = await askTopicBoardConfirm({
    title: '立即保存项目设置',
    content: syncedAdaptation
      ? '已同步到项目设置草稿，是否立即保存到项目设置？'
      : '已同步到项目通用设置草稿，是否立即保存到项目设置？',
    okText: '立即保存',
  })
  if (!shouldSave)
    return

  await saveProjectSettingsManually()
}

async function consumeTopicBoardCreateSeed() {
  if (!import.meta.client || topicBoardCreateSeedHandled.value)
    return

  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId || !selectedContestId.value || !selectedTrackId.value)
    return

  const storageKey = `${TOPIC_BOARD_CREATE_SEED_STORAGE_PREFIX}${projectId}`
  const raw = window.sessionStorage.getItem(storageKey)
  if (!raw)
    return

  topicBoardCreateSeedHandled.value = true
  window.sessionStorage.removeItem(storageKey)

  try {
    const seed = JSON.parse(raw) as ProjectTopicBoardCreateSeed
    syncTopicBoardDraftFromSeed(seed)
    if (!topicBoardSnapshot.value && seed.autoGenerate !== false)
      await generateTopicBoard(seed.source || 'project_create')
  }
  catch {
    // ignore malformed seed
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
  defenseSummary.value = null
  let assistantText = ''
  const enabledPersonaIds = defensePersonas.value
    .filter(item => item.enabled)
    .map(item => item.id)

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
      personaIds: enabledPersonaIds,
      inputMode: 'text',
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
      if (eventType === 'stage') {
        if (data.stage)
          defenseStage.value = String(data.stage) as AiDefenseStage
        if (Number.isFinite(Number(data.turnIndex)))
          defenseTurnCount.value = Math.max(defenseTurnCount.value, Number(data.turnIndex || 0) - 1)
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
      if (eventType === 'summary') {
        statusLine.value = '答辩轮次已完成，正在准备总结...'
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
        if (result.stage)
          defenseStage.value = String(result.stage) as AiDefenseStage
        if (Number.isFinite(Number(result.turnIndex)))
          defenseTurnCount.value = Number(result.turnIndex)
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

  if (activeChatSessionId.value)
    await loadDefenseSessionDetail(activeChatSessionId.value)

  if (activeChatSessionId.value)
    await generateDefenseSummary()
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
    await loadChatSessions({
      preferredSessionId: recreatedId,
    })
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
    if (!streamFailed) {
      await loadChatSessions({
        preferredSessionId: activeChatSessionId.value,
      })
    }
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

    const response = await unsafeFetch<ApiResponse<Project>>(endpoint('/projects'), {
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

function switchWorkspaceFromHeader(workspaceId: string): void {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId || normalizedWorkspaceId === activeWorkspaceId.value)
    return

  activeWorkspaceId.value = normalizedWorkspaceId
}

function updateWorkbenchMode(nextMode: WorkspaceWorkbenchMode) {
  if (nextMode === 'defense') {
    aiMode.value = 'defense'
    return
  }

  aiMode.value = lastPrimaryAiMode.value || 'dialog_ask'
}

function updateWorkspaceAiMode(nextMode: WorkspaceAiMode) {
  aiMode.value = nextMode
}

async function openFinalReviewFromHeader() {
  const opened = await ensureWorkflowCanvas()
  if (opened)
    statusLine.value = '已打开流程画布，可按流程继续推进终审。'
}

async function openWorkspaceHomeFromHeader() {
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  if (!workspaceId)
    return

  statusLine.value = `正在打开空间首页：${currentWorkspace.value?.workspace.name || workspaceId}`
  await navigateTo(teamDetailPath(workspaceId))
}

function openDisplayPreferencesFromHeader() {
  openDisplayPreferencesSignal.value += 1
  statusLine.value = '已打开设置页，可调整当前工作区显示偏好。'
}

function openAccountCenterFromHeader() {
  accountCenterVisible.value = true
}

function onUserUpdatedFromAccountCenter(user: AuthUser) {
  if (!me.value) {
    return
  }

  me.value = {
    ...me.value,
    user: {
      ...me.value.user,
      ...user,
    },
  }
}

function onWorkspaceUpdatedFromAccountCenter(payload: { workspaceId: string, name: string }) {
  if (!me.value)
    return

  me.value = {
    ...me.value,
    teams: (me.value.teams || []).map((item) => {
      if (item.team.id !== payload.workspaceId)
        return item

      return {
        ...item,
        team: {
          ...item.team,
          name: payload.name,
        },
      }
    }),
    workspaces: (me.value.workspaces || []).map((item) => {
      if (item.workspace.id !== payload.workspaceId)
        return item

      return {
        ...item,
        workspace: {
          ...item.workspace,
          name: payload.name,
        },
      }
    }),
  }
}

function openSettingsFromLeftSidebar() {
  openSettingsSignal.value += 1
  statusLine.value = '已打开设置页，可配置项目底座并管理项目协作邀请。'
}

function openMemberManagementFromLeftSidebar() {
  openMemberManagementSignal.value += 1
  statusLine.value = '已打开项目协作，可查看成员、席位并发起邀请。'
}

function openMeetingFromLeftSidebar() {
  ensureWorkspaceMainTabOpen('meeting')
  statusLine.value = '已打开项目会议总览，可查看最近会议、录制与纪要入口。'
}

async function openFlowFromLeftSidebar() {
  const opened = await ensureWorkflowCanvas()
  if (opened)
    statusLine.value = '已打开流程画布，可继续协作梳理项目流程。'
}

function clearMetaKRemoteSearchTimer(): void {
  if (!metaKRemoteSearchTimer)
    return
  clearTimeout(metaKRemoteSearchTimer)
  metaKRemoteSearchTimer = null
}

function resetMetaKRemoteState(): void {
  metaKRemoteLoading.value = false
  metaKRemoteLibraryItems.value = []
}

function setLeftSidebarMetaKCommand(
  moduleId: WorkspaceLeftSidebarCommandModuleId,
  outlineId = '',
): void {
  leftSidebarCollapsed.value = false
  leftSidebarMetaKModuleId.value = moduleId
  leftSidebarMetaKOutlineId.value = normalizeString(outlineId)
  leftSidebarMetaKSignal.value += 1
}

function closeMetaK(): void {
  metaKOpen.value = false
  metaKQuery.value = ''
  clearMetaKRemoteSearchTimer()
  metaKRemoteRequestSequence += 1
  resetMetaKRemoteState()
}

function openMetaK(): void {
  metaKOpen.value = true
}

function buildMetaKRemoteLibraryItems(resources: Resource[], query: string): WorkspaceMetaKItem[] {
  const items = resources.map((resource) => {
    const resourceTitle = resolveMetaKResourceTitle(resource)
    return {
      id: buildWorkspaceMetaKItemId('library', resource.id),
      sectionId: 'library',
      type: 'library_resource',
      title: resourceTitle,
      subtitle: [normalizeString(resource.type), normalizeString(resource.summary)].filter(Boolean).join(' · '),
      icon: resolveMetaKResourceIcon(resource),
      badge: resource.category || '',
      hint: '添加到项目',
      keywords: buildWorkspaceMetaKKeywords(resource.title, resource.summary, resource.type, resource.category, resource.year),
      source: 'remote',
      priority: 120,
      payload: {
        resourceId: resource.id,
      },
    } satisfies WorkspaceMetaKItem
  })

  return matchAndSortWorkspaceMetaKItems(items, query).slice(0, 8)
}

async function loadMetaKRemoteLibraryItems(query: string): Promise<void> {
  const projectId = normalizeString(activeProjectId.value)
  const normalizedQuery = normalizeString(query)
  if (!projectId || !normalizedQuery) {
    resetMetaKRemoteState()
    return
  }

  const requestId = ++metaKRemoteRequestSequence
  metaKRemoteLoading.value = true

  try {
    const response = await unsafeFetch<ApiResponse<Resource[]>>(
      buildProjectApiRequestUrl(
        endpoint(`/projects/${projectId}/resources/library`),
        {
          q: normalizedQuery,
          limit: 8,
        },
      ),
    )

    if (
      requestId !== metaKRemoteRequestSequence
      || !metaKOpen.value
      || normalizeString(activeProjectId.value) !== projectId
      || normalizeString(metaKQuery.value) !== normalizedQuery
    ) {
      return
    }

    metaKRemoteLibraryItems.value = buildMetaKRemoteLibraryItems(
      Array.isArray(response.data) ? response.data : [],
      normalizedQuery,
    )
  }
  catch {
    if (
      requestId !== metaKRemoteRequestSequence
      || !metaKOpen.value
      || normalizeString(activeProjectId.value) !== projectId
      || normalizeString(metaKQuery.value) !== normalizedQuery
    ) {
      return
    }
    metaKRemoteLibraryItems.value = []
  }
  finally {
    if (
      requestId === metaKRemoteRequestSequence
      && metaKOpen.value
      && normalizeString(activeProjectId.value) === projectId
      && normalizeString(metaKQuery.value) === normalizedQuery
    ) {
      metaKRemoteLoading.value = false
    }
  }
}

function scheduleMetaKRemoteLibrarySearch(query: string): void {
  const normalizedQuery = normalizeString(query)
  clearMetaKRemoteSearchTimer()
  metaKRemoteRequestSequence += 1

  if (!normalizedQuery) {
    resetMetaKRemoteState()
    return
  }

  metaKRemoteSearchTimer = setTimeout(() => {
    metaKRemoteSearchTimer = null
    void loadMetaKRemoteLibraryItems(normalizedQuery)
  }, 180)
}

async function executeMetaKCommandAction(actionId: WorkspaceMetaKActionId): Promise<void> {
  switch (actionId) {
    case 'open_workspace_home':
      await openWorkspaceHomeFromHeader()
      return
    case 'open_workspace_settings':
      openSettingsFromLeftSidebar()
      return
    case 'open_member_management':
      openMemberManagementFromLeftSidebar()
      return
    case 'open_display_preferences':
      openDisplayPreferencesFromHeader()
      return
    case 'open_account_center':
      openAccountCenterFromHeader()
      return
    case 'open_resource_manager':
      setLeftSidebarMetaKCommand('resource_manager')
      statusLine.value = '已打开资源管理器。'
      return
    case 'open_analysis':
      setLeftSidebarMetaKCommand('analysis')
      statusLine.value = '已切到竞赛分析，可继续筛选竞赛与赛道。'
      return
    case 'open_meeting':
      openMeetingFromLeftSidebar()
      return
    case 'open_issue_view':
      expandRightSidebar()
      updateWorkspaceAiMode('issue_discovery')
      statusLine.value = '已切到 Issue 视图。'
      return
    case 'open_flow':
      await openFlowFromLeftSidebar()
      return
    case 'open_final_review':
      await openFinalReviewFromHeader()
      return
    case 'switch_workbench_project':
      updateWorkbenchMode('project')
      statusLine.value = '已切回项目工作台。'
      return
    case 'switch_workbench_defense':
      updateWorkbenchMode('defense')
      statusLine.value = '已切到答辩工作台。'
      return
    case 'switch_ai_dialog':
      expandRightSidebar()
      updateWorkspaceAiMode('dialog_ask')
      statusLine.value = '已切到 AI 对话模式。'
      return
    case 'switch_ai_optimize':
      expandRightSidebar()
      updateWorkspaceAiMode('auto_optimize')
      statusLine.value = '已切到 AI 自动优化模式。'
      return
    case 'switch_ai_issue':
      expandRightSidebar()
      updateWorkspaceAiMode('issue_discovery')
      statusLine.value = '已切到 AI 寻疑发现模式。'
      return
    case 'create_collab_markdown':
      await createCollabResource('markdown')
      return
    case 'create_collab_draw':
      await createCollabResource('draw')
      return
    case 'create_meeting_audio':
      await createProjectMeeting({ mode: 'audio' })
      return
    case 'create_meeting_video':
      await createProjectMeeting({ mode: 'video' })
  }
}

async function executeMetaKItem(item: WorkspaceMetaKItem): Promise<void> {
  closeMetaK()

  if (item.actionId) {
    await executeMetaKCommandAction(item.actionId)
    return
  }

  switch (item.type) {
    case 'resource': {
      const resourceId = normalizeString(item.payload?.resourceId)
      if (resourceId)
        await openProjectResourcePreview(resourceId)
      return
    }
    case 'meeting': {
      const meetingId = normalizeString(item.payload?.meetingId)
      if (meetingId)
        await selectProjectMeeting(meetingId)
      return
    }
    case 'issue':
      expandRightSidebar()
      updateWorkspaceAiMode('issue_discovery')
      statusLine.value = `已定位 Issue：${item.title}`
      return
    case 'contest': {
      const contestId = normalizeString(item.payload?.contestId)
      if (!contestId)
        return
      selectedContestId.value = contestId
      setLeftSidebarMetaKCommand('analysis')
      statusLine.value = `已切到竞赛：${item.title}`
      return
    }
    case 'outline': {
      const outlineId = normalizeString(item.payload?.outlineId)
      const sourceResourceId = normalizeString(item.payload?.sourceResourceId)
      setLeftSidebarMetaKCommand('resource_manager', outlineId)
      if (sourceResourceId) {
        await openProjectResourcePreview(sourceResourceId)
      }
      else {
        statusLine.value = `已定位大纲节点：${item.title}`
      }
      return
    }
    case 'workspace': {
      const workspaceId = normalizeString(item.payload?.workspaceId)
      if (!workspaceId)
        return
      statusLine.value = `已切换到空间：${item.title}`
      switchWorkspaceFromHeader(workspaceId)
      return
    }
    case 'project': {
      const projectId = normalizeString(item.payload?.projectId)
      const workspaceId = normalizeString(item.payload?.workspaceId)
      if (!projectId || !workspaceId)
        return
      await switchProjectFromHeader({
        projectId,
        workspaceId,
      })
      return
    }
    case 'command':
      return
    case 'library_resource': {
      const resourceId = normalizeString(item.payload?.resourceId)
      if (!resourceId)
        return
      await addResourceFromLibrary(resourceId)
      setLeftSidebarMetaKCommand('resource_manager')
      break
    }
  }
}

function onMetaKGlobalKeydown(event: KeyboardEvent): void {
  if (!isWorkspaceMetaKHotkey(event))
    return
  if (isWorkspaceMetaKEditableTarget(event.target))
    return

  event.preventDefault()
  openMetaK()
}

onMounted(async () => {
  if (import.meta.client) {
    metaKShortcutLabel.value = resolveWorkspaceMetaKShortcutLabel(window.navigator.platform)
    document.addEventListener('keydown', onMetaKGlobalKeydown)
  }

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

  await Promise.all([
    loadContestCatalog(),
    loadContests(),
    loadProjects(),
    loadQuickSwitchProjects(),
    loadWorkspaceDisplayPreferenceSnapshot(),
  ])
  if (activeWorkspaceId.value)
    workspaceRealtime.subscribeWorkspace(activeWorkspaceId.value)
  if (highlightedProjectId.value) {
    const target = projects.value.find(item => item.id === highlightedProjectId.value)
    if (target)
      statusLine.value = `已定位项目：${target.title}`
  }
  await consumeJoinedProjectNotice()
})

onBeforeUnmount(() => {
  clearProjectSettingsAutoTimers()
  clearProjectWorkspaceViewPersistTimer()
  clearProjectOutlineGenerateTimer()
  clearPreviewStatusPolling()
  clearRealtimeProjectRefreshTimer()
  clearMeetingRealtimeRefreshTimer()
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
  if (import.meta.client)
    document.removeEventListener('keydown', onMetaKGlobalKeydown)
  clearMetaKRemoteSearchTimer()
})

watch(activeWorkspaceId, async (value, previous) => {
  if (!value || value === previous)
    return

  workspaceRealtime.subscribeWorkspace(value)
  workspaceDisplayPreferenceError.value = ''

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
  workspaceDisplayPreferenceError.value = ''

  statusLine.value = `已切换到空间：${currentWorkspace.value?.workspace.name || value}`
  await Promise.all([
    loadContestCatalog(),
    loadProjects(),
    loadQuickSwitchProjects(),
    loadWorkspaceDisplayPreferenceSnapshot(value),
  ])
  if (highlightedProjectId.value) {
    const target = projects.value.find(item => item.id === highlightedProjectId.value)
    if (target)
      statusLine.value = `已定位项目：${target.title}`
  }
})

watch(activeProjectId, async (next, previous) => {
  if (next === previous)
    return

  const requestId = ++workspaceBootstrapRequestId
  clearProjectSettingsAutoTimers()
  clearProjectOutlineGenerateTimer()
  clearRealtimeProjectRefreshTimer()
  clearMeetingRealtimeRefreshTimer()
  clearFallbackResourceRefreshTimer()
  clearProjectWorkspaceViewPersistTimer()
  projectOutlineFirstLoaded.value = false
  topicBoardLoading.value = false
  topicBoardFetching.value = false
  topicBoardActioningCandidateId.value = ''
  projectWorkspaceViewReady.value = false
  workspaceBootstrapLoading.value = Boolean(next)
  closeProjectResourcePreview()
  if (next)
    workspaceRealtime.subscribeProject(next)
  await refreshProjectResourceContext()
  if (!next) {
    disposeCollabDocBinding(true)
    flowResourceId.value = ''
    projectOutlineSnapshot.value = null
    resetProjectSettingsState(null)
    topicBoardSnapshot.value = null
    topicBoardHistory.value = []
    topicBoardCreateSeedHandled.value = false
    aiChangeRequests.value = []
    projectIssueReports.value = []
    projectIssues.value = []
    resetProjectMeetingState()
    resetWorkspaceMemberManagementState()
    chatSessions.value = []
    activeChatSessionId.value = ''
    defensePersonas.value = []
    selectedContestDetail.value = null
    selectedContestDetailLoading.value = false
    openMainTabs.value = ['dashboard']
    activeMainTabId.value = 'dashboard'
    resetChatState()
    workspaceBootstrapLoading.value = false
    return
  }
  try {
    syncFallbackResourceRefreshTimer()
    resetProjectSettingsState(activeProject.value)
    const restoredViewState = await hydrateProjectWorkspaceViewState(next)
    const selectedContestIdFromState = String(restoredViewState.state.selectedContestId || '').trim()
    const [
      ,
      ,
      draftHydrationResult,
    ] = await Promise.all([
      loadWorkspaceMemberManagement(),
      loadProjectOutline(),
      loadProjectSettings(selectedContestIdFromState),
      loadSelectedContestDetail(selectedContestIdFromState),
      loadTopicBoards(),
      loadAiChangeRequests(),
      loadProjectIssues(),
      loadProjectMeetings({
        fallbackToFirst: false,
        preferredMeetingId: restoredViewState.state.activeMeetingId,
        hydrateSelectedDetail: false,
      }),
      loadChatSessions({
        preferredSessionId: restoredViewState.state.activeChatSessionId,
        autoCreate: false,
        fallbackToFirst: !restoredViewState.state.activeChatSessionId,
      }),
      loadDefensePersonas(),
    ])
    const restoredPreviewResourceId = normalizeString(previewResourceId.value)
    if (restoredPreviewResourceId && resources.value.some(item => item.id === restoredPreviewResourceId))
      await openProjectResourcePreview(restoredPreviewResourceId, { openTab: false })
    await resolveProjectDeviceRestore(next, restoredViewState, draftHydrationResult)
    await consumeTopicBoardCreateSeed()
  }
  finally {
    if (requestId === workspaceBootstrapRequestId && activeProjectId.value === next)
      workspaceBootstrapLoading.value = false
  }
})

watch(metaKOpen, (next) => {
  if (next)
    return
  clearMetaKRemoteSearchTimer()
  metaKRemoteRequestSequence += 1
  resetMetaKRemoteState()
})

watch(metaKQuery, (nextQuery) => {
  if (!metaKOpen.value)
    return
  scheduleMetaKRemoteLibrarySearch(nextQuery)
})

watch([activeProjectId, selectedContestId, selectedTrackId], async () => {
  await consumeTopicBoardCreateSeed()
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

  if (projectWorkspaceViewReady.value)
    void syncProjectWorkspaceViewState()
  if (activeMainTabId.value)
    void syncActiveMainTabCollabBinding(activeMainTabId.value)
}, { deep: true })

async function syncActiveMainTabCollabBinding(nextTabId = activeMainTabId.value): Promise<void> {
  if (!nextTabId)
    return

  if (nextTabId === 'flow') {
    const targetResourceId = String(flowResourceId.value || '').trim()
    if (!targetResourceId || collabBindingResourceId.value === targetResourceId)
      return
    await openProjectCollabResource(targetResourceId, undefined, {
      openTab: false,
      surface: 'flow',
    })
    return
  }

  if (!nextTabId.startsWith('resource:'))
    return

  const targetResourceId = nextTabId.slice('resource:'.length) || String(previewResourceId.value || '').trim()
  if (!targetResourceId || collabBindingResourceId.value === targetResourceId)
    return

  const targetResource = resources.value.find(item => item.id === targetResourceId) || null
  if (!isCollabResource(targetResource))
    return

  await openProjectCollabResource(targetResourceId, undefined, {
    openTab: false,
    surface: 'preview',
  })
}

async function syncActiveMainTabMeetingSelection(nextTabId = activeMainTabId.value): Promise<void> {
  const targetMeetingId = resolveMeetingIdFromTabId(String(nextTabId || ''))
  if (!targetMeetingId || targetMeetingId === activeMeetingId.value)
    return

  workspaceRealtime.subscribeMeeting(targetMeetingId)
  const isSwitchingMeeting = activeMeetingId.value !== targetMeetingId
  activeMeetingId.value = targetMeetingId
  if (isSwitchingMeeting) {
    activeMeetingDetail.value = null
    activeMeetingUtterances.value = []
    meetingLiveCaptions.value = []
    clearMeetingJoinSession()
  }

  await Promise.all([
    loadProjectMeetingDetail(targetMeetingId, { resetCaptions: isSwitchingMeeting, preserveJoinSession: false }),
    loadProjectMeetingUtterances(targetMeetingId),
  ])
}

watch([activeProjectId, activeMainTabId], async ([projectId, nextTabId], [previousProjectId, previousTabId]) => {
  if (!projectId)
    return
  if (projectId === previousProjectId && nextTabId === previousTabId)
    return
  await syncActiveMainTabMeetingSelection(nextTabId)
}, { immediate: true })

watch(activeMainTabId, async (next, previous) => {
  if (next === previous)
    return
  await syncActiveMainTabCollabBinding(next)
})

watch(
  [
    workbenchMode,
    openMainTabs,
    activeMainTabId,
    previewResourceId,
    selectedContestId,
    selectedTrackId,
    activeChatSessionId,
    activeMeetingId,
    leftSidebarCollapsed,
    rightSidebarUserCollapsed,
  ],
  () => {
    if (!activeProjectId.value || projectWorkspaceViewHydrating.value)
      return
    void syncProjectWorkspaceViewState()
  },
  { deep: true },
)

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

  if (projectWorkspaceModeHydrating.value) {
    if (next === 'defense')
      workbenchMode.value = 'defense'
    else
      workbenchMode.value = 'project'
    return
  }

  if (next === 'defense') {
    workbenchMode.value = 'defense'
  }
  else {
    workbenchMode.value = 'project'
    lastPrimaryAiMode.value = next
  }

  if (!activeWorkspaceId.value || !activeProjectId.value) {
    chatSessions.value = []
    activeChatSessionId.value = ''
    resetChatState()
    return
  }

  activeChatSessionId.value = ''
  resetChatState()
  if (next === 'defense')
    await loadDefensePersonas()
  await loadChatSessions()
})

watch(() => workspaceRealtime.connected.value, () => {
  syncFallbackResourceRefreshTimer()
})
</script>

<template>
  <div
    class="workspace-shell wl-workspace-font-scope text-slate-800 bg-white h-full min-h-0 overflow-hidden"
    :data-workspace-font-size="workspaceEffectiveFontSizePreset"
  >
    <WorkspaceHeader
      :project-name="headerProjectName"
      :workspace-id="activeWorkspaceId"
      :user-name="me?.user.username || ''"
      :user-email="currentUserEmail"
      :user-avatar-url="me?.user.avatarUrl || ''"
      :workspace-options="workspaceOptions"
      :workspace-can-manage-members="workspaceCanManageMembers"
      :my-projects="myQuickSwitchProjects"
      :recent-projects="recentQuickSwitchProjects"
      :workbench-mode="workbenchMode"
      :meta-k-shortcut-label="metaKShortcutLabel"
      @update:workbench-mode="updateWorkbenchMode"
      @final-review="openFinalReviewFromHeader"
      @open-meta-k="openMetaK"
      @quick-switch-project="switchProjectFromHeader"
      @switch-workspace="switchWorkspaceFromHeader"
      @open-workspace-home="openWorkspaceHomeFromHeader"
      @open-workspace-settings="openSettingsFromLeftSidebar"
      @open-display-preferences="openDisplayPreferencesFromHeader"
      @open-member-management="openMemberManagementFromLeftSidebar"
      @open-account-center="openAccountCenterFromHeader"
    />

    <main class="workspace-layout flex flex-1 min-h-0 items-stretch overflow-hidden xl:flex-row">
      <div class="workspace-side-anchor workspace-side-anchor--left">
        <WorkspaceLeftSidebar
          v-model:natural-query="naturalQuery"
          v-model:major="major"
          v-model:discipline="discipline"
          v-model:level="level"
          v-model:track-type="trackType"
          v-model:top-k="topK"
          v-model:selected-contest-id="selectedContestId"
          class="min-h-0 overflow-hidden"
          :contests="contestSource"
          :selected-resources="selectedResources"
          :recycle-resources="recycleResources"
          :resource-library="resourceLibrary"
          :linked-contest-resource-groups="linkedContestResourceGroups"
          :linked-contest-binding-count="projectSettingsBindings.length"
          :upload-tasks="projectUploadTasks"
          :meetings="projectMeetings"
          :active-meeting-id="activeMeetingId"
          :meeting-loading="projectMeetingsLoading"
          :meeting-mutating="meetingMutating"
          :project-members="workspaceMembers"
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
          :current-user-id="me?.user.id || ''"
          :current-username="me?.user.username || ''"
          :project-storage-limit-bytes="PROJECT_RESOURCE_STORAGE_LIMIT_BYTES"
          :topic-board-draft="topicBoardDraft"
          :topic-board-loading="topicBoardLoading"
          :topic-board-current-summary="topicBoardSnapshot?.boardSummary || ''"
          :topic-board-history-count="topicBoardHistory.length"
          :workspace-id="activeWorkspaceId"
          :tab-spacing-preset="workspaceEffectiveTabSpacingPreset"
          :collapsed="leftSidebarCollapsed"
          :command-signal="leftSidebarMetaKSignal"
          :command-module-id="leftSidebarMetaKModuleId"
          :command-outline-id="leftSidebarMetaKOutlineId"
          @load-contests="loadContests"
          @run-ai-filter="runAiFilter"
          @update:topic-board-draft="Object.assign(topicBoardDraft, $event)"
          @generate-topic-board="generateTopicBoard('workspace_sidebar')"
          @open-meeting-panel="openMeetingFromLeftSidebar"
          @open-settings-panel="openSettingsFromLeftSidebar"
          @open-member-management-panel="openMemberManagementFromLeftSidebar"
          @open-flow-panel="openFlowFromLeftSidebar"
          @create-meeting="createProjectMeeting"
          @select-meeting="selectProjectMeeting"
          @create-collab-resource="createCollabResource"
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
          @pause-upload-task="pauseUploadTask"
          @resume-upload-task="resumeUploadTask"
          @retry-upload-task="retryUploadTask"
          @cancel-upload-task="cancelUploadTask"
          @rebind-upload-task="requestRebindUploadTask"
          @update:collapsed="leftSidebarCollapsed = $event"
        />
      </div>

      <WorkspaceMainPanel
        v-model:active-tab-id="activeMainTabId"
        v-model:open-tabs="openMainTabs"
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
        :open-display-preferences-signal="openDisplayPreferencesSignal"
        :open-flow-signal="openFlowSignal"
        :open-preview-signal="openPreviewSignal"
        :close-preview-signal="closePreviewSignal"
        :flow-resource-id="flowResourceId"
        :flow-resource-title="flowResourceTitle"
        :preview-resource-id="previewResourceId"
        :closing-preview-resource-id="closingPreviewResourceId"
        :preview-resource-title="previewResourceTitle"
        :markdown-image-upload-handler="uploadMarkdownImage"
        :preview-status="previewStatusPayload"
        :preview-status-loading="previewStatusLoading"
        :preview-mode="previewMode"
        :preview-pdf-url="previewPdfUrl"
        :preview-source-download-url="previewSourceDownloadUrl"
        :current-user-id="me?.user.id || ''"
        :current-user-name="me?.user.username || ''"
        :collab-markdown-doc="collabMarkdownDoc"
        :collab-markdown-awareness="collabMarkdownAwareness"
        :collab-draw-value="collabDrawValue"
        :collab-draw-error="collabDrawError"
        :collab-revision="collabRevision"
        :collab-connected="collabConnected"
        :collab-status-text="collabStatusText"
        :collab-presence-members="collabPresenceMembers"
        :selected-resources="selectedResources"
        :mapping-rows="mappingRows"
        :mapping-loading="selectedContestDetailLoading"
        :keyword-cloud="keywordCloud"
        :trend-bars="trendBars"
        :form-state="formState"
        :form-submitting="formSubmitting"
        :workspace-preparing="workspacePreparing"
        :topic-board="topicBoardSnapshot"
        :topic-board-fetching="topicBoardFetching"
        :topic-board-loading="topicBoardLoading"
        :topic-board-actioning-candidate-id="topicBoardActioningCandidateId"
        :project-settings-loading="projectSettingsLoading"
        :project-settings-save-state="projectSettingsSaveState"
        :project-settings-common="projectSettingsCommon"
        :project-settings-bindings="projectSettingsBindings"
        :project-settings-current-contest-id="projectSettingsCurrentContestId"
        :project-settings-adaptation="projectSettingsAdaptation"
        :project-settings-has-current-contest="projectSettingsHasCurrentContest"
        :workspace-display-preferences="workspaceDisplayPreferenceSnapshot"
        :workspace-display-preferences-loading="workspaceDisplayPreferenceLoading"
        :workspace-display-preferences-saving-scope="workspaceDisplayPreferenceSavingScope"
        :workspace-display-preferences-error="workspaceDisplayPreferenceError"
        :project-resource-shares="projectResourceShares"
        :project-resource-shares-loading="projectResourceSharesLoading"
        :meetings="projectMeetings"
        :active-meeting-id="activeMeetingId"
        :active-meeting="activeMeetingDetail"
        :meeting-utterances="activeMeetingUtterances"
        :meeting-live-captions="meetingLiveCaptions"
        :meeting-loading="projectMeetingsLoading"
        :meeting-detail-loading="meetingDetailLoading"
        :meeting-mutating="meetingMutating"
        :meeting-join-url="meetingJoinUrl"
        :meeting-join-token="meetingJoinToken"
        :meeting-join-expires-at="meetingJoinExpiresAt"
        :meeting-rtc-server-url="meetingRtcServerUrl"
        :active-meeting-guest-share="activeMeetingGuestShare"
        :meeting-guest-share-loading="meetingGuestShareLoading"
        :meeting-plan-tier="currentWorkspaceMeetingPlanTier"
        @update:form-state="Object.assign(formState, $event)"
        @submit-project-for-contest="submitProject"
        @generate-topic-board="generateTopicBoard('workspace_dashboard')"
        @update-topic-board-candidate-status="updateTopicBoardCandidateStatus($event.candidateId, $event.decisionStatus)"
        @select-topic-board-candidate="selectTopicBoardCandidate"
        @send-topic-board-candidate-to-chat="sendTopicBoardCandidateToChat"
        @apply-topic-board-candidate-to-form="applyTopicBoardCandidateToForm"
        @update:project-settings-common="onProjectSettingsCommonChange"
        @update:project-settings-bindings="onProjectSettingsBindingsChange"
        @update:project-settings-adaptation="onProjectSettingsAdaptationChange"
        @load-contests="loadContests"
        @save-project-settings="saveProjectSettingsManually"
        @save-workspace-display-user-override="saveWorkspaceDisplayUserOverride"
        @save-workspace-display-team-default="saveWorkspaceDisplayTeamDefault"
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
        @create-meeting="createProjectMeeting"
        @quick-create-meeting="submitProjectMeetingCreate"
        @submit-meeting-create="submitProjectMeetingCreate"
        @refresh-meetings="loadProjectMeetings"
        @join-meeting="joinProjectMeeting"
        @start-meeting="startProjectMeeting"
        @end-meeting="endProjectMeeting"
        @create-meeting-guest-share="createProjectMeetingGuestShare"
        @regenerate-meeting-guest-share="regenerateProjectMeetingGuestShare"
        @revoke-meeting-guest-share="revokeProjectMeetingGuestShare"
        @select-meeting="selectProjectMeeting"
        @open-meeting-resource="openProjectResourcePreview"
        @reconvert-preview="reconvertProjectResourcePreview"
        @download-preview-source="downloadPreviewSource"
        @activate-preview-resource="activateProjectResourceTab"
        @close-preview-resource="closeProjectResourcePreview"
        @update:collab-draw-value="updateCollabDrawContent"
        @update-collab-cursor="updateCollabCursor"
        @update-collab-selection-status="updateCollabSelectionStatus"
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
          :ai-mode="aiMode"
          class="min-h-0 overflow-hidden"
          :chat-sessions="chatSessions"
          :active-chat-session-id="activeChatSessionId"
          :chat-sessions-loading="chatSessionsLoading"
          :chat-messages="chatMessages"
          :chat-loading="chatLoading"
          :workspace-preparing="workspacePreparing"
          :current-user-name="me?.user.username || ''"
          :current-user-avatar-url="me?.user.avatarUrl || ''"
          :change-requests="aiChangeRequests"
          :change-requests-loading="aiChangeRequestsLoading"
          :change-acting-ids="aiChangeActingIds"
          :change-second-confirm-ids="aiChangeSecondConfirmIds"
          :issue-report="latestIssueReport"
          :project-issues="projectIssues"
          :issue-loading="issueCenterLoading"
          :issue-report-submitting="issueReportSubmitting"
          :issue-report-exporting="issueReportExporting"
          :defense-rounds="defenseRounds"
          :defense-scorecard="defenseScorecard"
          :defense-personas="defensePersonas"
          :defense-stage="defenseStage"
          :defense-turn-count="defenseTurnCount"
          :defense-summary="defenseSummary"
          :defense-personas-loading="defensePersonasLoading"
          :defense-summary-loading="defenseSummaryLoading"
          :selected-contest="selectedContest"
          :selected-track="selectedTrack"
          :selected-resources="selectedResources"
          @send-chat="sendChatMessage"
          @update:ai-mode="updateWorkspaceAiMode"
          @switch-chat-session="switchChatSession"
          @create-chat-session="startNewChatSession"
          @approve-change="approveAiChange"
          @reject-change="rejectAiChange"
          @import-defense-personas="importDefensePersonas"
          @save-defense-persona="saveDefensePersona"
          @delete-defense-persona="deleteDefensePersona"
          @generate-defense-summary="generateDefenseSummary"
          @start-defense-realtime="startDefenseRealtime"
          @submit-issue-report="submitIssueReport"
          @export-issue-report="exportIssueReport"
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
      <div v-if="workspacePreparing" class="workspace-preparing-overlay" aria-live="polite">
        <div class="workspace-preparing-overlay__panel">
          <span class="workspace-preparing-overlay__label">正在准备工作区</span>
          <strong class="workspace-preparing-overlay__title">WinLooooop</strong>
        </div>
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
      :selection-length="statusCursor.selectionLength"
      :has-active-project="Boolean(activeProjectId)"
      :upload-summary="projectUploadSummary"
      :upload-drawer-open="uploadDrawerOpen"
      :upload-tasks="projectUploadTasks"
      :upload-activity-items="projectUploadActivityItems"
      :upload-history-loaded="projectUploadHistoryLoaded"
      @toggle-upload-drawer="openUploadDrawer"
      @pause-upload-task="pauseUploadTask"
      @resume-upload-task="resumeUploadTask"
      @retry-upload-task="retryUploadTask"
      @cancel-upload-task="cancelUploadTask"
      @rebind-upload-task="requestRebindUploadTask"
      @pause-all-upload-tasks="pauseAllUploadTasks"
      @resume-all-upload-tasks="resumeAllUploadTasks"
      @clear-completed-upload-tasks="clearCompletedUploadTasks"
    />
    <input
      ref="rebindUploadInputRef"
      class="hidden"
      type="file"
      @change="handleRebindUploadInputChange"
    >

    <a-modal
      v-model:visible="topicBoardConfirmState.visible"
      :title="topicBoardConfirmState.title"
      width="420px"
      :footer="false"
      :mask-closable="false"
      @cancel="resolveTopicBoardConfirm(false)"
    >
      <div class="space-y-4">
        <p class="text-sm text-slate-600 leading-6 m-0 whitespace-pre-line">
          {{ topicBoardConfirmState.content }}
        </p>

        <div class="flex gap-2 justify-end">
          <a-button @click="resolveTopicBoardConfirm(false)">
            {{ topicBoardConfirmState.cancelText }}
          </a-button>
          <a-button type="primary" @click="resolveTopicBoardConfirm(true)">
            {{ topicBoardConfirmState.okText }}
          </a-button>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="deviceRestoreConfirmState.visible"
      :title="deviceRestoreConfirmState.title"
      width="460px"
      :footer="false"
      :mask-closable="false"
      @cancel="resolveDeviceRestoreConfirm('keep')"
    >
      <div class="space-y-4">
        <p class="text-sm text-slate-600 leading-6 m-0 whitespace-pre-line">
          {{ deviceRestoreConfirmState.content }}
        </p>

        <div class="flex gap-2 justify-end">
          <a-button @click="resolveDeviceRestoreConfirm('keep')">
            保留本设备
          </a-button>
          <a-button type="primary" @click="resolveDeviceRestoreConfirm('sync')">
            同步最新设备
          </a-button>
        </div>
      </div>
    </a-modal>

    <WorkspaceMetaK
      :visible="metaKOpen"
      :query="metaKQuery"
      :sections="metaKSections"
      :shortcut-label="metaKShortcutLabel"
      @update:query="metaKQuery = $event"
      @close="closeMetaK"
      @execute="executeMetaKItem"
    />

    <UserSettingsDialog
      v-model:visible="accountCenterVisible"
      :user-name="me?.user.username || ''"
      :user-id="me?.user.id || ''"
      :user-email="currentUserEmail"
      :user-avatar-url="me?.user.avatarUrl || ''"
      :user-subtitle="currentUserSubtitle"
      :show-admin-badge="isAdminView"
      :is-platform-admin-user="Boolean(me?.user.isPlatformAdmin)"
      :workspace-options="workspaceOptions"
      :active-workspace-id="activeWorkspaceId"
      @user-updated="onUserUpdatedFromAccountCenter"
      @workspace-updated="onWorkspaceUpdatedFromAccountCenter"
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

.workspace-side-handle--right:hover .workspace-side-toggle,
.workspace-side-toggle:focus-visible {
  background: #f3f6fc;
}

.workspace-side-handle--right:hover .workspace-side-toggle,
.workspace-side-handle--right .workspace-side-toggle:focus-visible {
  border-left-color: #d3d8e4;
}

.workspace-side-toggle:focus-visible {
  outline: 2px solid #2f6af2;
  outline-offset: -2px;
}

.workspace-side-handle--right:hover .material-symbols-outlined,
.workspace-side-toggle:focus-visible .material-symbols-outlined {
  opacity: 1;
  color: #2f6af2;
}

.workspace-preparing-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.workspace-preparing-overlay__panel {
  min-width: 260px;
  padding: 18px 22px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.workspace-preparing-overlay__label {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.workspace-preparing-overlay__title {
  color: #0f172a;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.06em;
}
</style>
