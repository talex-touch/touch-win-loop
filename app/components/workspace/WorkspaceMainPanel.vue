<script setup lang="ts">
import type { Awareness } from 'y-protocols/awareness'
import type { Doc as YDoc } from 'yjs'
import type {
  CollabPurpose,
  Contest,
  Project,
  ProjectInvitationSummary,
  ProjectMemberRole,
  ProjectMemberSummary,
  ProjectResourceShare,
  Resource,
  ResourcePreviewStatus,
  Track,
  WorkspaceType,
} from '~~/shared/types/domain'
import type { WorkspaceCollabAwarenessSelectionState, WorkspaceCollabCursorUser, WorkspaceCollabPresenceMember, WorkspaceCollabPresenceUser, WorkspaceCollabSelectionSummary } from '~/components/workspace/collab/presence'
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
  normalizeWorkspaceCollabPresenceActivityState,
  resolveWorkspaceCollabPresenceColor,
} from '~/components/workspace/collab/presence'
import {
  formatDateTime,
  formatEtaSeconds,
  getShareStatus,
  previewErrorMessage,
  previewStatusLabel,
  shareStatusBadgeClass,
  shareStatusLabel,
  shareVisibilityLabel,
  workspaceInvitationScopeLabel,
  workspaceInvitationStatusBadgeClass,
  workspaceInvitationStatusLabel,
  workspaceRoleLabel,
  workspaceTypeLabel,
} from '~/utils/workspace-main-panel-formatters'

const props = withDefaults(defineProps<{
  selectedContest?: Contest | null
  selectedTrack?: Track | null
  selectedTrackId?: string
  selectedContestId?: string
  contests?: Contest[]
  selectedResources?: Resource[]
  major?: string
  discipline?: string
  level?: string
  trackType?: string
  topK?: number
  openSettingsSignal?: number
  openMemberManagementSignal?: number
  openFlowSignal?: number
  openPreviewSignal?: number
  closePreviewSignal?: number
  flowResourceId?: string
  flowResourceTitle?: string
  previewResourceId?: string
  closingPreviewResourceId?: string
  previewResourceTitle?: string
  previewStatus?: WorkspacePreviewStatusPayload | null
  previewStatusLoading?: boolean
  previewMode?: WorkspacePreviewMode
  previewPdfUrl?: string
  previewSourceDownloadUrl?: string
  currentUserId?: string
  currentUserName?: string
  collabMarkdownDoc?: YDoc | null
  collabMarkdownAwareness?: Awareness | null
  collabDrawValue?: string
  collabDrawError?: string
  collabRevision?: number
  collabConnected?: boolean
  collabStatusText?: string
  collabPresenceMembers?: WorkspaceCollabPresenceMember[]
  mappingRows?: WorkspaceMappingRow[]
  keywordCloud?: WorkspaceKeyword[]
  trendBars?: number[]
  formState?: WorkspaceFormState
  formSubmitting?: boolean
  activeProject?: Project | null
  workspaceName?: string
  workspaceType?: WorkspaceType | ''
  workspaceMembers?: ProjectMemberSummary[]
  workspaceInvitations?: ProjectInvitationSummary[]
  workspaceMemberManagementLoading?: boolean
  workspaceCanManageMembers?: boolean
  workspaceCanEditMembers?: boolean
  workspaceMemberRoleUpdatingUserId?: string
  workspaceMemberRemovingUserId?: string
  workspaceInvitationRevokingId?: string
  workspaceCanManageBillingSeats?: boolean
  workspaceSeatUsed?: number
  workspaceSeatLimit?: number | null
  workspaceSupportsSeatAdd?: boolean
  workspaceInvitationSubmitting?: boolean
  workspaceInvitationLink?: string
  workspaceSeatLimitSaveLoading?: boolean
  workspaceSeatLimitError?: string
  workspaceSeatLimitUpdatedSignal?: number
  projectSettingsLoading?: boolean
  projectSettingsSaveState?: WorkspaceProjectSaveState
  projectSettingsCommon?: WorkspaceProjectCommonForm
  projectSettingsBindings?: WorkspaceProjectContestBindingForm[]
  projectSettingsCurrentContestId?: string
  projectSettingsAdaptation?: WorkspaceProjectAdaptationForm
  projectSettingsHasCurrentContest?: boolean
  projectResourceShares?: ProjectResourceShare[]
  projectResourceSharesLoading?: boolean
  toneMeta: Record<MappingTone, WorkspaceStatusToneMeta>
}>(), {
  selectedContest: null,
  selectedTrack: null,
  selectedTrackId: '',
  selectedContestId: '',
  contests: () => [],
  selectedResources: () => [],
  major: '',
  discipline: '',
  level: '',
  trackType: '',
  topK: 6,
  openSettingsSignal: 0,
  openMemberManagementSignal: 0,
  openFlowSignal: 0,
  openPreviewSignal: 0,
  closePreviewSignal: 0,
  flowResourceId: '',
  flowResourceTitle: '',
  previewResourceId: '',
  closingPreviewResourceId: '',
  previewResourceTitle: '',
  previewStatus: null,
  previewStatusLoading: false,
  previewMode: 'binary',
  previewPdfUrl: '',
  previewSourceDownloadUrl: '',
  currentUserId: '',
  currentUserName: '',
  collabMarkdownDoc: null,
  collabMarkdownAwareness: null,
  collabDrawValue: '{}',
  collabDrawError: '',
  collabRevision: 0,
  collabConnected: false,
  collabStatusText: '',
  collabPresenceMembers: () => [],
  mappingRows: () => [],
  keywordCloud: () => [],
  trendBars: () => [],
  formState: () => ({
    source: 'form',
    title: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
    summary: '',
  }),
  formSubmitting: false,
  activeProject: null,
  workspaceName: '',
  workspaceType: '',
  workspaceMembers: () => [],
  workspaceInvitations: () => [],
  workspaceMemberManagementLoading: false,
  workspaceCanManageMembers: false,
  workspaceCanEditMembers: false,
  workspaceMemberRoleUpdatingUserId: '',
  workspaceMemberRemovingUserId: '',
  workspaceInvitationRevokingId: '',
  workspaceCanManageBillingSeats: false,
  workspaceSeatUsed: 0,
  workspaceSeatLimit: null,
  workspaceSupportsSeatAdd: false,
  workspaceInvitationSubmitting: false,
  workspaceInvitationLink: '',
  workspaceSeatLimitSaveLoading: false,
  workspaceSeatLimitError: '',
  workspaceSeatLimitUpdatedSignal: 0,
  projectSettingsLoading: false,
  projectSettingsSaveState: 'idle',
  projectSettingsCommon: () => ({
    title: '',
    summary: '',
    icon: '',
    accentColor: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
  }),
  projectSettingsBindings: () => [],
  projectSettingsCurrentContestId: '',
  projectSettingsAdaptation: () => ({
    contestId: '',
    trackId: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
    summary: '',
  }),
  projectSettingsHasCurrentContest: false,
  projectResourceShares: () => [],
  projectResourceSharesLoading: false,
})

const emit = defineEmits<{
  'update:activeTabId': [value: WorkspaceMainTabId | '']
  'update:selectedTrackId': [value: string]
  'update:selectedContestId': [value: string]
  'update:major': [value: string]
  'update:discipline': [value: string]
  'update:level': [value: string]
  'update:trackType': [value: string]
  'update:topK': [value: number]
  'update:formState': [value: WorkspaceFormState]
  'submitProjectForContest': [value: { contestId: string, trackId: string }]
  'update:projectSettingsCommon': [value: WorkspaceProjectCommonForm]
  'update:projectSettingsBindings': [value: WorkspaceProjectContestBindingForm[]]
  'update:projectSettingsAdaptation': [value: WorkspaceProjectAdaptationForm]
  'saveProjectSettings': []
  'reloadWorkspaceMemberManagement': []
  'createWorkspaceInvitation': [value: { inviteeUsername: string, projectRole: ProjectMemberRole, expiresInDays: number }]
  'patchWorkspaceMemberRole': [value: { userId: string, role: 'manager' | 'editor' | 'viewer' }]
  'removeWorkspaceMember': [userId: string]
  'revokeWorkspaceInvitation': [invitationId: string]
  'copyWorkspaceInvitationLink': []
  'openWorkspaceSeatModal': []
  'saveWorkspaceSeatLimit': [seatLimit: number]
  'copyProjectResourceShare': [shareId: string]
  'revokeProjectResourceShare': [shareId: string]
  'loadContests': []
  'reconvertPreview': []
  'downloadPreviewSource': []
  'activatePreviewResource': [resourceId: string]
  'closePreviewResource': [resourceId: string]
  'update:collabDrawValue': [value: string]
  'updateCollabCursor': [value: { cursorX?: number, cursorY?: number }]
  'updateCollabSelectionStatus': [value: { line: number, column: number, selectionLength: number, selection: WorkspaceCollabSelectionSummary | null }]
}>()

type WorkspaceFixedTabId = 'dashboard' | 'members' | 'flow' | 'settings'
type WorkspaceResourceTabId = `resource:${string}`
type WorkspaceMainTabId = WorkspaceFixedTabId | WorkspaceResourceTabId
type WorkspacePreviewMode = 'binary' | 'markdown' | 'draw'

interface WorkspaceMainTab {
  id: WorkspaceMainTabId
  kind: 'fixed' | 'resource'
  title: string
  icon: string
  closeable: boolean
  resourceId?: string
  previewMode?: WorkspacePreviewMode
}

interface LinkedContestEntry {
  contest: Contest
  track: Track | null
  binding: WorkspaceProjectContestBindingForm | null
}

interface WorkspacePreviewStatusPayload {
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

const fixedTabs: WorkspaceMainTab[] = [
  {
    id: 'dashboard',
    kind: 'fixed',
    title: '仪表盘',
    icon: 'space_dashboard',
    closeable: true,
  },
  {
    id: 'members',
    kind: 'fixed',
    title: '项目协作',
    icon: 'group',
    closeable: true,
  },
  {
    id: 'flow',
    kind: 'fixed',
    title: '流程画布',
    icon: 'flowsheet',
    closeable: true,
  },
  {
    id: 'settings',
    kind: 'fixed',
    title: '项目设置',
    icon: 'settings',
    closeable: true,
  },
]

const openTabs = ref<WorkspaceMainTab[]>(fixedTabs.filter(tab => tab.id === 'dashboard'))
const activeTabId = ref<WorkspaceMainTabId | ''>('dashboard')
const draggingTabId = ref<WorkspaceMainTabId | ''>('')
const dragOverTabId = ref<WorkspaceMainTabId | ''>('')
const tabContextMenuVisible = ref(false)
const tabContextMenuTabId = ref<WorkspaceMainTabId | ''>('')
const tabContextMenuPosition = reactive({ x: 0, y: 0 })

const hasActiveProject = computed(() => Boolean(props.activeProject?.id))

const projectSettingsContestOptions = computed<Contest[]>(() => {
  const dedupe = new Map<string, Contest>()
  for (const contest of props.contests)
    dedupe.set(contest.id, contest)

  if (props.selectedContest && !dedupe.has(props.selectedContest.id))
    dedupe.set(props.selectedContest.id, props.selectedContest)

  return [...dedupe.values()]
})

const projectSettingsSaveLabelMap: Record<WorkspaceProjectSaveState, string> = {
  idle: '尚未保存',
  saving: '保存中...',
  saved_auto: '草稿已缓存',
  saved_manual: '手动保存成功',
  conflict: '草稿冲突（请处理）',
  error: '保存失败（可重试）',
}

const projectSettingsSaveLabel = computed(() => {
  return projectSettingsSaveLabelMap[props.projectSettingsSaveState]
})

const projectSettingsSaveBadgeClass = computed(() => {
  if (props.projectSettingsSaveState === 'error')
    return 'text-rose-600 border-rose-200 bg-rose-50'
  if (props.projectSettingsSaveState === 'conflict')
    return 'text-amber-700 border-amber-200 bg-amber-50'
  return 'text-slate-600 border-slate-200 bg-white'
})

const projectSettingsContestName = computed(() => {
  const contestId = String(props.projectSettingsCurrentContestId || '').trim()
  if (!contestId)
    return ''
  return projectSettingsContestOptions.value.find(item => item.id === contestId)?.name || ''
})

const projectSettingsAddContestModalVisible = ref(false)
const projectSettingsAddContestModalContestId = ref('')
const projectSettingsAddContestModalTrackId = ref('')

const projectSettingsAddContestCandidates = computed<Contest[]>(() => {
  const usedContestIds = new Set(
    props.projectSettingsBindings.map(item => String(item.contestId || '').trim()).filter(Boolean),
  )
  return projectSettingsContestOptions.value.filter(item => !usedContestIds.has(item.id))
})

const projectSettingsAddContestModalTrackOptions = computed<Track[]>(() => {
  const contestId = String(projectSettingsAddContestModalContestId.value || '').trim()
  if (!contestId)
    return []
  return projectSettingsAddContestCandidates.value.find(item => item.id === contestId)?.tracks || []
})

const PROJECT_ROLE_OPTIONS: ProjectMemberRole[] = ['manager', 'editor', 'viewer']
type PatchableWorkspaceRole = 'manager' | 'editor' | 'viewer'

const workspaceMemberRoleDraftMap = reactive<Record<string, PatchableWorkspaceRole>>({})

function toPatchableWorkspaceRole(role: ProjectMemberRole): PatchableWorkspaceRole {
  if (role === 'manager' || role === 'editor')
    return role
  return 'viewer'
}

function workspaceMemberPrimaryRole(member: ProjectMemberSummary): ProjectMemberRole {
  if (member.role === 'owner')
    return 'owner'
  if (member.role === 'manager')
    return 'manager'
  if (member.role === 'editor')
    return 'editor'
  return 'viewer'
}

function ensureWorkspaceMemberRoleDraft(member: ProjectMemberSummary): PatchableWorkspaceRole {
  const userId = String(member.userId || '').trim()
  if (!userId)
    return 'viewer'

  const existing = workspaceMemberRoleDraftMap[userId]
  if (existing)
    return existing

  const role = toPatchableWorkspaceRole(workspaceMemberPrimaryRole(member))
  workspaceMemberRoleDraftMap[userId] = role
  return role
}

watch(() => props.workspaceMembers, (members) => {
  const activeUserIdSet = new Set((members || []).map(item => String(item.userId || '').trim()).filter(Boolean))
  for (const member of members || [])
    ensureWorkspaceMemberRoleDraft(member)
  for (const userId of Object.keys(workspaceMemberRoleDraftMap)) {
    if (!activeUserIdSet.has(userId))
      delete workspaceMemberRoleDraftMap[userId]
  }
}, { deep: true, immediate: true })

const workspaceInviteRoleOptions = computed<ProjectMemberRole[]>(() => {
  if (props.workspaceCanEditMembers)
    return PROJECT_ROLE_OPTIONS
  return ['viewer']
})
const workspaceInviteForm = reactive<{
  inviteeUsername: string
  role: ProjectMemberRole
  expiresInDays: number
}>({
  inviteeUsername: '',
  role: 'viewer',
  expiresInDays: 7,
})
const workspaceInviteModalVisible = ref(false)

watchEffect(() => {
  if (!workspaceInviteRoleOptions.value.includes(workspaceInviteForm.role))
    workspaceInviteForm.role = 'viewer'
})

const workspaceInviteProjectLabel = computed(() => {
  const projectTitle = String(props.activeProject?.title || '').trim()
  if (projectTitle)
    return `目标项目：${projectTitle}，项目权限按下方角色生效。`
  return '接受邀请后会自动获得当前项目权限。'
})

function createResourceTabId(resourceId: string): WorkspaceResourceTabId {
  return `resource:${resourceId}` as WorkspaceResourceTabId
}

function resolvePreviewModeFromResource(resource: Resource | null | undefined): WorkspacePreviewMode {
  const resourceKind = String(resource?.resourceKind || '').trim().toLowerCase()
  if (resourceKind === 'markdown' || resourceKind === 'draw')
    return resourceKind
  return 'binary'
}

function resolveCollabPurposeFromResource(resource: Resource | null | undefined): CollabPurpose | '' {
  const normalized = String(resource?.collabPurpose || '').trim().toLowerCase()
  if (normalized === 'workflow' || normalized === 'freeform' || normalized === 'notes')
    return normalized
  if (resource?.resourceKind === 'markdown')
    return 'notes'
  if (resource?.resourceKind === 'draw')
    return 'freeform'
  return ''
}

function normalizePreviewModeValue(value: unknown): WorkspacePreviewMode {
  const mode = String(value || 'binary').trim().toLowerCase()
  if (mode === 'markdown' || mode === 'draw')
    return mode
  return 'binary'
}

function resolveResourceTabTitle(mode: WorkspacePreviewMode, title: string, purpose: CollabPurpose | '' = ''): string {
  const normalizedTitle = String(title || '').trim()
  if (normalizedTitle)
    return normalizedTitle
  if (mode === 'markdown')
    return '协作文档'
  if (mode === 'draw' && purpose === 'workflow')
    return '流程画布'
  if (mode === 'draw')
    return '自由画布'
  return '资料预览'
}

function resolveResourceTabIcon(mode: WorkspacePreviewMode, purpose: CollabPurpose | '' = ''): string {
  if (mode === 'markdown')
    return 'edit_note'
  if (mode === 'draw' && purpose === 'workflow')
    return 'flowsheet'
  if (mode === 'draw')
    return 'draw'
  return 'description'
}

function buildResourceTab(resourceId: string, title: string, mode: WorkspacePreviewMode, purpose: CollabPurpose | '' = ''): WorkspaceMainTab {
  return {
    id: createResourceTabId(resourceId),
    kind: 'resource',
    title: resolveResourceTabTitle(mode, title, purpose),
    icon: resolveResourceTabIcon(mode, purpose),
    closeable: true,
    resourceId,
    previewMode: mode,
  }
}

function previewTabFromProps(): WorkspaceMainTab | null {
  const resourceId = String(props.previewResourceId || '').trim()
  if (!resourceId)
    return null
  const previewResource = props.selectedResources.find(resource => resource.id === resourceId) || null
  return buildResourceTab(
    resourceId,
    props.previewResourceTitle,
    normalizePreviewModeValue(props.previewMode),
    resolveCollabPurposeFromResource(previewResource),
  )
}

const activeTab = computed(() => {
  return openTabs.value.find(tab => tab.id === activeTabId.value) || null
})

const activeResourceTab = computed(() => {
  if (activeTab.value?.kind !== 'resource')
    return null
  return activeTab.value
})

const hasFlowResource = computed(() => Boolean(String(props.flowResourceId || '').trim()))
const flowPanelTitle = computed(() => String(props.flowResourceTitle || '').trim() || '流程画布')

const breadcrumbItems = computed(() => {
  if (activeResourceTab.value) {
    const title = activeResourceTab.value.title
    if (props.selectedContest?.name)
      return ['竞赛分析', props.selectedContest.name, title]
    return ['竞赛分析', title]
  }

  if (activeTabId.value === 'settings') {
    const base = ['竞赛分析']
    if (projectSettingsContestName.value)
      base.push(projectSettingsContestName.value)
    base.push('项目设置')
    return base
  }

  if (activeTabId.value === 'members')
    return ['竞赛分析', '项目协作']

  if (activeTabId.value === 'flow') {
    if (props.selectedContest?.name) {
      return [
        '竞赛分析',
        props.selectedContest.name,
        '流程画布',
      ]
    }
    return ['竞赛分析', '流程画布']
  }

  if (activeTabId.value === 'dashboard') {
    if (props.selectedContest?.name) {
      return [
        '竞赛分析',
        props.selectedContest.name,
        '仪表盘',
      ]
    }
    return ['竞赛分析', '仪表盘']
  }

  return ['WinLoop']
})

const linkedContestEntries = computed<LinkedContestEntry[]>(() => {
  const dedupe = new Set<string>()
  const result: LinkedContestEntry[] = []

  for (const binding of props.projectSettingsBindings) {
    const contestId = String(binding.contestId || '').trim()
    if (!contestId || dedupe.has(contestId))
      continue

    const contest = projectSettingsContestOptions.value.find(item => item.id === contestId)
    if (!contest)
      continue

    const track = contest.tracks.find(item => item.id === binding.trackId) || contest.tracks[0] || null
    dedupe.add(contestId)
    result.push({
      contest,
      track,
      binding,
    })
  }

  if (result.length > 0)
    return result

  if (props.selectedContest) {
    result.push({
      contest: props.selectedContest,
      track: props.selectedTrack || props.selectedContest.tracks[0] || null,
      binding: null,
    })
  }

  return result
})

function findFixedTab(tabId: WorkspaceFixedTabId): WorkspaceMainTab | undefined {
  return fixedTabs.find(tab => tab.id === tabId)
}

function ensureFixedTabOpen(tabId: WorkspaceFixedTabId, activate = true) {
  const existed = openTabs.value.some(tab => tab.id === tabId)
  if (!existed) {
    const target = findFixedTab(tabId)
    if (target)
      openTabs.value = [...openTabs.value, target]
  }

  if (activate)
    activeTabId.value = tabId
}

function ensurePreviewTabOpen(activate = true): WorkspaceMainTab | null {
  const previewTab = previewTabFromProps()
  if (!previewTab)
    return null

  const existingIndex = openTabs.value.findIndex(tab => tab.id === previewTab.id)
  if (existingIndex < 0) {
    openTabs.value = [...openTabs.value, previewTab]
  }
  else {
    const nextTabs = [...openTabs.value]
    nextTabs.splice(existingIndex, 1, {
      ...nextTabs[existingIndex],
      ...previewTab,
    })
    openTabs.value = nextTabs
  }

  if (activate)
    activeTabId.value = previewTab.id

  return previewTab
}

function closeTabContextMenu(): void {
  tabContextMenuVisible.value = false
  tabContextMenuTabId.value = ''
}

function emitActivatePreviewResource(resourceId: string): void {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId)
    return
  emit('activatePreviewResource', normalizedResourceId)
}

function activateTab(tabId: WorkspaceMainTabId) {
  closeTabContextMenu()
  activeTabId.value = tabId
  const target = openTabs.value.find(tab => tab.id === tabId)
  if (target?.kind === 'resource' && target.resourceId)
    emitActivatePreviewResource(target.resourceId)
}

function resolveFallbackTab(closingSet: Set<WorkspaceMainTabId>, closingTabId: WorkspaceMainTabId): WorkspaceMainTab | null {
  const currentIndex = openTabs.value.findIndex(tab => tab.id === closingTabId)
  if (currentIndex < 0)
    return null

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = openTabs.value[index]
    if (candidate && !closingSet.has(candidate.id))
      return candidate
  }

  for (let index = currentIndex + 1; index < openTabs.value.length; index += 1) {
    const candidate = openTabs.value[index]
    if (candidate && !closingSet.has(candidate.id))
      return candidate
  }

  return null
}

function closeTabsByIds(
  tabIds: WorkspaceMainTabId[],
  options: { emitClosePreview?: boolean, emitActivate?: boolean } = {},
) {
  const existingTabIds = new Set(openTabs.value.map(tab => tab.id))
  const closingIds = [...new Set(tabIds)].filter(tabId => existingTabIds.has(tabId))
  if (closingIds.length === 0)
    return

  closeTabContextMenu()

  const closingSet = new Set<WorkspaceMainTabId>(closingIds)
  const currentActiveTabId = activeTabId.value
  const activeTabBeforeClose = currentActiveTabId
    ? openTabs.value.find(tab => tab.id === currentActiveTabId) || null
    : null
  const activeTabWillClose = Boolean(currentActiveTabId && closingSet.has(currentActiveTabId))
  const fallbackTab = activeTabWillClose && currentActiveTabId
    ? resolveFallbackTab(closingSet, currentActiveTabId)
    : null
  const currentPreviewResourceId = String(props.previewResourceId || '').trim()
  const currentPreviewTabId = currentPreviewResourceId
    ? createResourceTabId(currentPreviewResourceId)
    : null
  const hiddenPreviewTabWillClose = Boolean(
    currentPreviewTabId
    && closingSet.has(currentPreviewTabId)
    && activeTabBeforeClose?.id !== currentPreviewTabId,
  )

  openTabs.value = openTabs.value.filter(tab => !closingSet.has(tab.id))

  if (hiddenPreviewTabWillClose && options.emitClosePreview !== false && currentPreviewResourceId)
    emit('closePreviewResource', currentPreviewResourceId)

  if (!activeTabWillClose)
    return

  activeTabId.value = fallbackTab?.id || ''

  if (fallbackTab?.kind === 'resource' && fallbackTab.resourceId) {
    if (options.emitActivate !== false)
      emitActivatePreviewResource(fallbackTab.resourceId)
    return
  }

  if (activeTabBeforeClose?.kind === 'resource' && activeTabBeforeClose.resourceId && options.emitClosePreview !== false)
    emit('closePreviewResource', activeTabBeforeClose.resourceId)
}

function closeTab(tabId: WorkspaceMainTabId) {
  closeTabsByIds([tabId], {
    emitClosePreview: true,
    emitActivate: true,
  })
}

function closeResourceTabByResourceId(
  resourceId: string,
  options: { emitClosePreview?: boolean, emitActivate?: boolean } = {},
): void {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId)
    return
  closeTabsByIds([createResourceTabId(normalizedResourceId)], options)
}

function updateOpenResourceTabMetadata(): void {
  const previewTab = previewTabFromProps()
  const resourceMap = new Map(
    props.selectedResources.map(resource => [resource.id, resource] as const),
  )

  const nextTabs: WorkspaceMainTab[] = []
  let changed = false

  for (const tab of openTabs.value) {
    if (tab.kind !== 'resource' || !tab.resourceId) {
      nextTabs.push(tab)
      continue
    }

    if (previewTab && tab.id === previewTab.id) {
      if (
        tab.title !== previewTab.title
        || tab.icon !== previewTab.icon
        || tab.previewMode !== previewTab.previewMode
      ) {
        nextTabs.push(previewTab)
        changed = true
      }
      else {
        nextTabs.push(tab)
      }
      continue
    }

    const resource = resourceMap.get(tab.resourceId)
    if (!resource) {
      if (activeTabId.value === tab.id) {
        nextTabs.push(tab)
      }
      else {
        changed = true
      }
      continue
    }

    const nextMode = resolvePreviewModeFromResource(resource)
    const nextPurpose = resolveCollabPurposeFromResource(resource)
    const nextTitle = resolveResourceTabTitle(nextMode, resource.title, nextPurpose)
    const nextIcon = resolveResourceTabIcon(nextMode, nextPurpose)
    if (tab.title !== nextTitle || tab.icon !== nextIcon || tab.previewMode !== nextMode) {
      nextTabs.push({
        ...tab,
        title: nextTitle,
        icon: nextIcon,
        previewMode: nextMode,
      })
      changed = true
      continue
    }

    nextTabs.push(tab)
  }

  if (changed)
    openTabs.value = nextTabs
}

function openTabContextMenu(tabId: WorkspaceMainTabId, event: MouseEvent): void {
  event.preventDefault()
  tabContextMenuTabId.value = tabId
  tabContextMenuPosition.x = event.clientX
  tabContextMenuPosition.y = event.clientY
  tabContextMenuVisible.value = true
}

const tabContextMenuTab = computed(() => {
  return openTabs.value.find(tab => tab.id === tabContextMenuTabId.value) || null
})

const tabContextMenuIndex = computed(() => {
  if (!tabContextMenuTabId.value)
    return -1
  return openTabs.value.findIndex(tab => tab.id === tabContextMenuTabId.value)
})

const tabContextMenuLeftIds = computed<WorkspaceMainTabId[]>(() => {
  const index = tabContextMenuIndex.value
  if (index <= 0)
    return []
  return openTabs.value.slice(0, index).map(tab => tab.id)
})

const tabContextMenuRightIds = computed<WorkspaceMainTabId[]>(() => {
  const index = tabContextMenuIndex.value
  if (index < 0)
    return []
  return openTabs.value.slice(index + 1).map(tab => tab.id)
})

function closeTabsToLeft(): void {
  if (tabContextMenuLeftIds.value.length === 0)
    return
  closeTabsByIds(tabContextMenuLeftIds.value, {
    emitClosePreview: true,
    emitActivate: true,
  })
}

function closeTabsToRight(): void {
  if (tabContextMenuRightIds.value.length === 0)
    return
  closeTabsByIds(tabContextMenuRightIds.value, {
    emitClosePreview: true,
    emitActivate: true,
  })
}

function closeOtherTabs(): void {
  const currentTab = tabContextMenuTab.value
  if (!currentTab)
    return
  closeTabsByIds(
    openTabs.value
      .filter(tab => tab.id !== currentTab.id)
      .map(tab => tab.id),
    {
      emitClosePreview: true,
      emitActivate: true,
    },
  )
}

function closeAllTabs(): void {
  closeTabsByIds(openTabs.value.map(tab => tab.id), {
    emitClosePreview: true,
    emitActivate: true,
  })
}

function handleGlobalPointerDown(event: PointerEvent): void {
  if (!tabContextMenuVisible.value)
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('.workspace-tab-context-menu'))
    return
  closeTabContextMenu()
}

function handleGlobalEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape')
    closeTabContextMenu()
}

function moveTab(fromId: WorkspaceMainTabId, toId: WorkspaceMainTabId) {
  if (fromId === toId)
    return

  const nextTabs = [...openTabs.value]
  const fromIndex = nextTabs.findIndex(tab => tab.id === fromId)
  const toIndex = nextTabs.findIndex(tab => tab.id === toId)
  if (fromIndex < 0 || toIndex < 0)
    return

  const [moved] = nextTabs.splice(fromIndex, 1)
  if (!moved)
    return

  nextTabs.splice(toIndex, 0, moved)
  openTabs.value = nextTabs
}

function onTabDragStart(tabId: WorkspaceMainTabId) {
  draggingTabId.value = tabId
  dragOverTabId.value = ''
}

function onTabDragOver(tabId: WorkspaceMainTabId, event: DragEvent) {
  if (!draggingTabId.value || draggingTabId.value === tabId)
    return
  event.preventDefault()
  dragOverTabId.value = tabId
}

function onTabDrop(tabId: WorkspaceMainTabId, event: DragEvent) {
  event.preventDefault()
  const fromId = draggingTabId.value
  if (!fromId || fromId === tabId) {
    dragOverTabId.value = ''
    return
  }

  moveTab(fromId, tabId)
  dragOverTabId.value = ''
}

function onTabDragEnd() {
  draggingTabId.value = ''
  dragOverTabId.value = ''
}

function contestTracksByContestId(contestId: string): Track[] {
  if (!contestId)
    return []
  return projectSettingsContestOptions.value.find(item => item.id === contestId)?.tracks || []
}

function normalizeBindings(rows: WorkspaceProjectContestBindingForm[]): WorkspaceProjectContestBindingForm[] {
  const usedContestIds = new Set<string>()
  const normalized: WorkspaceProjectContestBindingForm[] = []

  for (const row of rows) {
    const contestId = String(row.contestId || '').trim()
    if (!contestId || usedContestIds.has(contestId))
      continue

    const tracks = contestTracksByContestId(contestId)
    const trackId = tracks.find(item => item.id === row.trackId)?.id || tracks[0]?.id || row.trackId || ''
    if (!trackId)
      continue

    usedContestIds.add(contestId)
    normalized.push({
      contestId,
      trackId,
      sortOrder: normalized.length,
    })
  }

  return normalized
}

function emitProjectSettingsCommon(next: WorkspaceProjectCommonForm) {
  emit('update:projectSettingsCommon', {
    ...next,
  })
}

function updateProjectSettingsCommonField(field: keyof WorkspaceProjectCommonForm, value: string) {
  emitProjectSettingsCommon({
    ...props.projectSettingsCommon,
    [field]: value,
  })
}

function emitProjectSettingsBindings(next: WorkspaceProjectContestBindingForm[]) {
  emit('update:projectSettingsBindings', normalizeBindings(next))
}

function addProjectSettingsBinding(contestId = '', trackId = ''): boolean {
  const existing = props.projectSettingsBindings
  const usedContestIds = new Set(existing.map(item => item.contestId))
  const normalizedContestId = String(contestId || '').trim()
  let preferredContest = projectSettingsContestOptions.value.find(item => item.id === normalizedContestId) || null
  if (!preferredContest || usedContestIds.has(preferredContest.id))
    preferredContest = projectSettingsContestOptions.value.find(item => !usedContestIds.has(item.id)) || null
  if (!preferredContest)
    return false

  const normalizedTrackId = String(trackId || '').trim()
  const resolvedTrackId = preferredContest.tracks.find(item => item.id === normalizedTrackId)?.id || preferredContest.tracks[0]?.id || ''
  if (!resolvedTrackId)
    return false

  const nextRows = [
    ...existing,
    {
      contestId: preferredContest.id,
      trackId: resolvedTrackId,
      sortOrder: existing.length,
    },
  ]
  emitProjectSettingsBindings(nextRows)

  if (!props.projectSettingsCurrentContestId)
    useBindingAsCurrentContest(preferredContest.id, resolvedTrackId)
  return true
}

function syncProjectSettingsAddContestModalSelection() {
  const candidates = projectSettingsAddContestCandidates.value
  const contestId = String(projectSettingsAddContestModalContestId.value || '').trim()
  const selectedContest = candidates.find(item => item.id === contestId) || candidates[0] || null

  projectSettingsAddContestModalContestId.value = selectedContest?.id || ''

  const trackId = String(projectSettingsAddContestModalTrackId.value || '').trim()
  const nextTrackId = selectedContest?.tracks.find(item => item.id === trackId)?.id || selectedContest?.tracks[0]?.id || ''
  projectSettingsAddContestModalTrackId.value = nextTrackId
}

function requestProjectSettingsContestReload() {
  emit('loadContests')
}

function openContestCatalogPage() {
  void navigateTo('/contests')
}

function confirmProjectSettingsAddContestModal() {
  const didAdd = addProjectSettingsBinding(
    projectSettingsAddContestModalContestId.value,
    projectSettingsAddContestModalTrackId.value,
  )
  if (!didAdd) {
    requestProjectSettingsContestReload()
    return
  }
  projectSettingsAddContestModalVisible.value = false
}

function onAddProjectSettingsBinding() {
  projectSettingsAddContestModalVisible.value = true
  syncProjectSettingsAddContestModalSelection()
  if (projectSettingsContestOptions.value.length === 0)
    requestProjectSettingsContestReload()
}

function removeProjectSettingsBinding(index: number) {
  if (props.projectSettingsBindings.length <= 1)
    return

  const target = props.projectSettingsBindings[index]
  if (!target)
    return

  const nextRows = props.projectSettingsBindings.filter((_, rowIndex) => rowIndex !== index)
  emitProjectSettingsBindings(nextRows)

  if (target.contestId === props.projectSettingsCurrentContestId) {
    const fallback = nextRows[0]
    if (fallback)
      useBindingAsCurrentContest(fallback.contestId, fallback.trackId)
  }
}

function updateProjectSettingsBindingContest(index: number, contestId: string) {
  const normalizedContestId = String(contestId || '').trim()
  const nextRows = [...props.projectSettingsBindings]
  const currentRow = nextRows[index]
  if (!currentRow || !normalizedContestId)
    return

  const tracks = contestTracksByContestId(normalizedContestId)
  const nextTrackId = tracks.find(item => item.id === currentRow.trackId)?.id || tracks[0]?.id || ''

  nextRows[index] = {
    contestId: normalizedContestId,
    trackId: nextTrackId,
    sortOrder: index,
  }

  emitProjectSettingsBindings(nextRows)

  if (currentRow.contestId === props.projectSettingsCurrentContestId)
    useBindingAsCurrentContest(normalizedContestId, nextTrackId)
}

function updateProjectSettingsBindingTrack(index: number, trackId: string) {
  const normalizedTrackId = String(trackId || '').trim()
  const nextRows = [...props.projectSettingsBindings]
  const currentRow = nextRows[index]
  if (!currentRow || !normalizedTrackId)
    return

  nextRows[index] = {
    ...currentRow,
    trackId: normalizedTrackId,
    sortOrder: index,
  }

  emitProjectSettingsBindings(nextRows)

  if (currentRow.contestId === props.projectSettingsCurrentContestId)
    emit('update:selectedTrackId', normalizedTrackId)
}

function useBindingAsCurrentContest(contestId: string, trackId: string) {
  const normalizedContestId = String(contestId || '').trim()
  const normalizedTrackId = String(trackId || '').trim()
  if (!normalizedContestId)
    return
  emit('update:selectedContestId', normalizedContestId)
  if (normalizedTrackId)
    emit('update:selectedTrackId', normalizedTrackId)
}

function emitProjectSettingsAdaptation(next: WorkspaceProjectAdaptationForm) {
  emit('update:projectSettingsAdaptation', {
    ...next,
  })
}

function updateProjectSettingsAdaptationField(field: keyof WorkspaceProjectAdaptationForm, value: string) {
  emitProjectSettingsAdaptation({
    ...props.projectSettingsAdaptation,
    contestId: props.projectSettingsCurrentContestId || props.projectSettingsAdaptation.contestId,
    [field]: value,
  })
}

function updateFormField(field: keyof WorkspaceFormState, value: string) {
  emit('update:formState', {
    ...props.formState,
    [field]: value,
  })
}

function submitProjectForContest(contestId: string, trackId: string) {
  const normalizedContestId = String(contestId || '').trim()
  const normalizedTrackId = String(trackId || '').trim()
  if (!normalizedContestId || !normalizedTrackId)
    return

  useBindingAsCurrentContest(normalizedContestId, normalizedTrackId)
  emit('submitProjectForContest', {
    contestId: normalizedContestId,
    trackId: normalizedTrackId,
  })
}

const normalizedPreviewMode = computed<WorkspacePreviewMode>(() => {
  return normalizePreviewModeValue(props.previewMode)
})

const activePreviewMode = computed<WorkspacePreviewMode>(() => {
  return activeResourceTab.value?.previewMode || normalizedPreviewMode.value
})

const isMarkdownPreviewActive = computed(() => {
  return Boolean(activeResourceTab.value && activePreviewMode.value === 'markdown')
})

const collabConnectionText = computed(() => {
  const customText = String(props.collabStatusText || '').trim()
  if (customText)
    return customText
  return props.collabConnected ? '实时连接中' : '离线编辑（待重连）'
})

const workspaceMemberMap = computed(() => {
  const map = new Map<string, ProjectMemberSummary>()
  for (const member of props.workspaceMembers) {
    const userId = String(member.userId || '').trim()
    if (!userId)
      continue
    map.set(userId, member)
  }
  return map
})

const markdownLocalSelectionStatus = ref<{
  line: number
  column: number
  selectionLength: number
  selection: WorkspaceCollabSelectionSummary | null
}>({
  line: 1,
  column: 1,
  selectionLength: 0,
  selection: null,
})

const markdownRemoteSelectionStates = ref<WorkspaceCollabAwarenessSelectionState[]>([])

const collabCurrentUser = computed(() => {
  const userId = String(props.currentUserId || '').trim()
  const userName = String(props.currentUserName || '').trim()
  if (!userId || !userName)
    return null

  return {
    id: userId,
    name: userName,
    color: resolveWorkspaceCollabPresenceColor(userId),
  }
})

const markdownRemoteSelectionMap = computed(() => {
  const map = new Map<number, WorkspaceCollabSelectionSummary | null>()
  for (const item of markdownRemoteSelectionStates.value) {
    if (!Number.isInteger(Number(item.awarenessClientId)))
      continue
    map.set(Math.trunc(Number(item.awarenessClientId)), item.selection)
  }
  return map
})

const collabPresenceUsers = computed<WorkspaceCollabPresenceUser[]>(() => {
  const merged = new Map<string, WorkspaceCollabPresenceUser & {
    selectionActivityRank: number
    selectionUpdatedAtMs: number
  }>()
  const currentUserId = String(props.currentUserId || '').trim()
  for (const member of props.collabPresenceMembers) {
    const userId = String(member.userId || '').trim()
    const username = String(member.username || '').trim()
    if (!userId || !username)
      continue

    const activityState = normalizeWorkspaceCollabPresenceActivityState(member.activityState)
    const existing = merged.get(userId)
    const projectMember = workspaceMemberMap.value.get(userId)
    const updatedAt = String(member.updatedAt || '').trim()

    if (!existing) {
      merged.set(userId, {
        userId,
        username,
        avatarUrl: projectMember?.avatarUrl || null,
        role: projectMember?.role || '',
        colorToken: resolveWorkspaceCollabPresenceColor(userId),
        activityState,
        updatedAt,
        peerCount: 1,
        isCurrentUser: userId === currentUserId,
        selection: isMarkdownPreviewActive.value && userId === currentUserId ? markdownLocalSelectionStatus.value.selection : null,
        selectionActivityRank: isMarkdownPreviewActive.value && userId === currentUserId && markdownLocalSelectionStatus.value.selection ? 1 : -1,
        selectionUpdatedAtMs: Number.isFinite(Date.parse(updatedAt || '')) ? Date.parse(updatedAt || '') : -1,
      })
      if (isMarkdownPreviewActive.value && userId !== currentUserId && Number.isInteger(Number(member.awarenessClientId))) {
        const remoteSelection = markdownRemoteSelectionMap.value.get(Math.trunc(Number(member.awarenessClientId)))
        if (remoteSelection) {
          const created = merged.get(userId)
          if (created) {
            created.selection = remoteSelection
            created.selectionActivityRank = activityState === 'active' ? 1 : 0
            created.selectionUpdatedAtMs = Number.isFinite(Date.parse(updatedAt || '')) ? Date.parse(updatedAt || '') : -1
          }
        }
      }
      continue
    }

    existing.peerCount += 1
    existing.activityState = existing.activityState === 'active' || activityState === 'active'
      ? 'active'
      : 'background'
    if (!existing.avatarUrl && projectMember?.avatarUrl)
      existing.avatarUrl = projectMember.avatarUrl
    if (!existing.role && projectMember?.role)
      existing.role = projectMember.role

    const nextUpdatedAtMs = Date.parse(updatedAt || '')
    const currentUpdatedAtMs = Date.parse(existing.updatedAt || '')
    if (Number.isFinite(nextUpdatedAtMs) && (!Number.isFinite(currentUpdatedAtMs) || nextUpdatedAtMs > currentUpdatedAtMs))
      existing.updatedAt = updatedAt

    const candidateSelection = !isMarkdownPreviewActive.value
      ? null
      : userId === currentUserId
        ? markdownLocalSelectionStatus.value.selection
        : (Number.isInteger(Number(member.awarenessClientId))
            ? markdownRemoteSelectionMap.value.get(Math.trunc(Number(member.awarenessClientId))) || null
            : null)
    const candidateRank = activityState === 'active' ? 1 : 0
    if (
      candidateSelection
      && (
        existing.selectionActivityRank < candidateRank
        || (existing.selectionActivityRank === candidateRank && (!Number.isFinite(existing.selectionUpdatedAtMs) || nextUpdatedAtMs > existing.selectionUpdatedAtMs))
      )
    ) {
      existing.selection = candidateSelection
      existing.selectionActivityRank = candidateRank
      existing.selectionUpdatedAtMs = Number.isFinite(nextUpdatedAtMs) ? nextUpdatedAtMs : existing.selectionUpdatedAtMs
    }
  }

  return [...merged.values()].sort((left, right) => {
    if (left.activityState !== right.activityState)
      return left.activityState === 'active' ? -1 : 1

    const rightUpdatedAt = Date.parse(String(right.updatedAt || ''))
    const leftUpdatedAt = Date.parse(String(left.updatedAt || ''))
    if (Number.isFinite(rightUpdatedAt) && Number.isFinite(leftUpdatedAt) && rightUpdatedAt !== leftUpdatedAt)
      return rightUpdatedAt - leftUpdatedAt

    return left.username.localeCompare(right.username, 'zh-CN')
  })
})

const collabPresenceCursors = computed<WorkspaceCollabCursorUser[]>(() => {
  const merged = new Map<string, WorkspaceCollabCursorUser & { updatedAtMs: number }>()
  const currentUserId = String(props.currentUserId || '').trim()

  for (const member of props.collabPresenceMembers) {
    const userId = String(member.userId || '').trim()
    if (!userId || userId === currentUserId)
      continue
    if (normalizeWorkspaceCollabPresenceActivityState(member.activityState) !== 'active')
      continue

    const cursorX = Number(member.cursorX)
    const cursorY = Number(member.cursorY)
    if (!Number.isFinite(cursorX) || !Number.isFinite(cursorY))
      continue

    const user = collabPresenceUsers.value.find(item => item.userId === userId)
    if (!user)
      continue

    const updatedAtMs = Date.parse(String(member.updatedAt || ''))
    const existing = merged.get(userId)
    if (existing && Number.isFinite(existing.updatedAtMs) && Number.isFinite(updatedAtMs) && existing.updatedAtMs >= updatedAtMs)
      continue

    merged.set(userId, {
      userId,
      username: user.username,
      colorToken: user.colorToken,
      cursorX,
      cursorY,
      updatedAtMs,
    })
  }

  return [...merged.values()]
    .map(({ updatedAtMs: _updatedAtMs, ...cursor }) => cursor)
    .sort((left, right) => left.username.localeCompare(right.username, 'zh-CN'))
})

const canSubmitWorkspaceInvitation = computed(() => {
  return props.workspaceCanManageMembers && !props.workspaceInvitationSubmitting
})

const canEditWorkspaceMembers = computed(() => {
  return props.workspaceCanEditMembers
})

const workspaceInviteUnavailableMessage = computed(() => {
  return '当前角色无项目协作邀请权限，仅可查看成员与待处理邀请。'
})

const workspaceSeatModalVisible = ref(false)
const workspaceSeatLimitDraft = ref<number | null>(null)

const normalizedWorkspaceSeatUsed = computed(() => {
  return Math.max(0, Math.trunc(Number(props.workspaceSeatUsed || 0)))
})

const normalizedWorkspaceSeatLimit = computed<number | null>(() => {
  const raw = Number(props.workspaceSeatLimit)
  if (!Number.isFinite(raw) || raw <= 0)
    return null
  return Math.max(1, Math.trunc(raw))
})

const workspaceCanAddSeat = computed(() => {
  return props.workspaceSupportsSeatAdd && props.workspaceCanManageBillingSeats
})

const workspaceSeatSummaryText = computed(() => {
  return '每个项目最多支持 15 个协作席位，接受邀请时会同时加入当前空间与项目。'
})

const workspaceSeatDraftTooSmall = computed(() => {
  const draft = Number(workspaceSeatLimitDraft.value || 0)
  if (!Number.isFinite(draft))
    return true
  return Math.max(1, Math.trunc(draft)) < normalizedWorkspaceSeatUsed.value
})

const workspaceSeatDraftTooLarge = computed(() => {
  const draft = Number(workspaceSeatLimitDraft.value || 0)
  if (!Number.isFinite(draft))
    return true
  return Math.max(1, Math.trunc(draft)) > 15
})

const canSubmitWorkspaceSeatLimit = computed(() => {
  if (!workspaceCanAddSeat.value || props.workspaceSeatLimitSaveLoading)
    return false
  const draft = Number(workspaceSeatLimitDraft.value || 0)
  if (!Number.isFinite(draft) || draft <= 0)
    return false
  return !workspaceSeatDraftTooSmall.value && !workspaceSeatDraftTooLarge.value
})

function openWorkspaceInviteModal(): void {
  if (!props.workspaceCanManageMembers)
    return
  workspaceInviteModalVisible.value = true
}

function closeWorkspaceInviteModal(): void {
  workspaceInviteModalVisible.value = false
}

function openWorkspaceSeatModal(): void {
  if (!workspaceCanAddSeat.value)
    return

  workspaceSeatLimitDraft.value = normalizedWorkspaceSeatLimit.value || Math.max(1, normalizedWorkspaceSeatUsed.value || 1)
  workspaceSeatModalVisible.value = true
  emit('openWorkspaceSeatModal')
}

function closeWorkspaceSeatModal(): void {
  workspaceSeatModalVisible.value = false
}

function submitWorkspaceSeatLimit(): void {
  const draft = Number(workspaceSeatLimitDraft.value || 0)
  if (!Number.isFinite(draft))
    return
  emit('saveWorkspaceSeatLimit', Math.max(1, Math.trunc(draft)))
}

function onCollabDrawModelUpdate(value: string): void {
  emit('update:collabDrawValue', value)
}

function onCollabCursorUpdate(value: { cursorX?: number, cursorY?: number }): void {
  emit('updateCollabCursor', value)
}

function onMarkdownSelectionChange(value: {
  line: number
  column: number
  selectionLength: number
  anchorLine: number
  anchorColumn: number
  headLine: number
  headColumn: number
  isCollapsed: boolean
  selectedTextPreview: string
}): void {
  const selection: WorkspaceCollabSelectionSummary = {
    anchorLine: value.anchorLine,
    anchorColumn: value.anchorColumn,
    headLine: value.headLine,
    headColumn: value.headColumn,
    isCollapsed: value.isCollapsed,
    selectionLength: value.selectionLength,
    selectedTextPreview: value.selectedTextPreview,
  }

  markdownLocalSelectionStatus.value = {
    line: Math.max(1, Math.trunc(Number(value.line) || 1)),
    column: Math.max(1, Math.trunc(Number(value.column) || 1)),
    selectionLength: Math.max(0, Math.trunc(Number(value.selectionLength) || 0)),
    selection,
  }

  emit('updateCollabSelectionStatus', {
    line: markdownLocalSelectionStatus.value.line,
    column: markdownLocalSelectionStatus.value.column,
    selectionLength: markdownLocalSelectionStatus.value.selectionLength,
    selection,
  })
}

function onMarkdownRemotePresenceChange(value: WorkspaceCollabAwarenessSelectionState[]): void {
  markdownRemoteSelectionStates.value = Array.isArray(value) ? value : []
}

function workspaceMemberRoleSummary(member: ProjectMemberSummary): string {
  return workspaceRoleLabel(workspaceMemberPrimaryRole(member))
}

function revokeWorkspaceInvitation(invitationId: string): void {
  const normalizedInvitationId = String(invitationId || '').trim()
  if (!normalizedInvitationId || !props.workspaceCanManageMembers)
    return
  emit('revokeWorkspaceInvitation', normalizedInvitationId)
}

function submitWorkspaceInvitation(): void {
  emit('createWorkspaceInvitation', {
    inviteeUsername: workspaceInviteForm.inviteeUsername.trim(),
    projectRole: workspaceInviteForm.role,
    expiresInDays: Math.max(1, Math.min(30, Number(workspaceInviteForm.expiresInDays || 7))),
  })
}

function submitWorkspaceMemberRole(member: ProjectMemberSummary): void {
  const userId = String(member.userId || '').trim()
  if (!userId || !canEditWorkspaceMembers.value)
    return
  const primaryRole = workspaceMemberPrimaryRole(member)
  if (primaryRole === 'owner')
    return

  const nextRole = ensureWorkspaceMemberRoleDraft(member)
  emit('patchWorkspaceMemberRole', {
    userId,
    role: nextRole,
  })
}

function canRemoveWorkspaceMember(member: ProjectMemberSummary): boolean {
  if (!props.workspaceCanManageMembers)
    return false
  const primaryRole = workspaceMemberPrimaryRole(member)
  if (primaryRole === 'owner')
    return false
  if (props.workspaceCanEditMembers)
    return true
  return primaryRole === 'viewer'
}

function removeWorkspaceMember(member: ProjectMemberSummary): void {
  const userId = String(member.userId || '').trim()
  if (!userId || !canRemoveWorkspaceMember(member))
    return
  emit('removeWorkspaceMember', userId)
}

watch(projectSettingsAddContestCandidates, () => {
  if (!projectSettingsAddContestModalVisible.value)
    return
  syncProjectSettingsAddContestModalSelection()
})

watch(projectSettingsAddContestModalContestId, () => {
  if (!projectSettingsAddContestModalVisible.value)
    return
  syncProjectSettingsAddContestModalSelection()
})

watch(() => props.workspaceInvitationLink, (next, previous) => {
  if (!next || next === previous)
    return
  workspaceInviteForm.inviteeUsername = ''
})

watch(() => props.openSettingsSignal, (next, previous) => {
  if (next === previous)
    return
  ensureFixedTabOpen('settings', true)
})

watch(() => props.openMemberManagementSignal, (next, previous) => {
  if (next === previous)
    return
  ensureFixedTabOpen('members', true)
})

watch(() => props.openFlowSignal, (next, previous) => {
  if (next === previous)
    return
  ensureFixedTabOpen('flow', true)
})

watch(() => props.openPreviewSignal, (next, previous) => {
  if (next === previous)
    return
  ensurePreviewTabOpen(true)
})

watch(() => props.closePreviewSignal, (next, previous) => {
  if (next === previous)
    return
  closeResourceTabByResourceId(props.closingPreviewResourceId, {
    emitClosePreview: false,
    emitActivate: true,
  })
})

watch(
  [
    () => props.previewResourceId,
    () => props.previewResourceTitle,
    () => props.previewMode,
  ],
  () => {
    updateOpenResourceTabMetadata()
  },
)

watch(() => props.selectedResources, () => {
  updateOpenResourceTabMetadata()
}, { deep: true })

onMounted(() => {
  document.addEventListener('pointerdown', handleGlobalPointerDown)
  document.addEventListener('keydown', handleGlobalEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalPointerDown)
  document.removeEventListener('keydown', handleGlobalEscape)
})

watch(() => props.workspaceSeatLimitUpdatedSignal, (next, previous) => {
  if (next === previous)
    return
  workspaceSeatModalVisible.value = false
})

watch(activeTabId, (next) => {
  emit('update:activeTabId', next)
}, { immediate: true })
</script>

<template>
  <section class="workspace-main-panel bg-slate-50 flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
    <WorkspaceMainPanelChrome
      :open-tabs="openTabs"
      :active-tab-id="activeTabId"
      :drag-over-tab-id="dragOverTabId"
      :tab-context-menu-visible="tabContextMenuVisible"
      :tab-context-menu-position="tabContextMenuPosition"
      :context-tab-id="tabContextMenuTab?.id || ''"
      :can-close-context-tab="Boolean(tabContextMenuTab?.closeable && tabContextMenuTab?.id)"
      :can-close-tabs-to-left="tabContextMenuLeftIds.length > 0"
      :can-close-tabs-to-right="tabContextMenuRightIds.length > 0"
      :can-close-other-tabs="openTabs.length > 1"
      :can-close-all-tabs="openTabs.length > 0"
      :breadcrumb-items="breadcrumbItems"
      @activate-tab="activateTab($event as WorkspaceMainTabId)"
      @close-tab="closeTab($event as WorkspaceMainTabId)"
      @open-tab-context-menu="openTabContextMenu($event.tabId as WorkspaceMainTabId, $event.event)"
      @close-tab-context-menu="closeTabContextMenu"
      @close-tabs-to-left="closeTabsToLeft"
      @close-tabs-to-right="closeTabsToRight"
      @close-other-tabs="closeOtherTabs"
      @close-all-tabs="closeAllTabs"
      @drag-start="onTabDragStart($event as WorkspaceMainTabId)"
      @drag-over="onTabDragOver($event.tabId as WorkspaceMainTabId, $event.event)"
      @drop="onTabDrop($event.tabId as WorkspaceMainTabId, $event.event)"
      @drag-end="onTabDragEnd"
      @open-dashboard="ensureFixedTabOpen('dashboard', true)"
    />

    <div
      class="flex-1 h-0 min-h-0"
      :class="activeResourceTab ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden p-4 md:p-6'"
    >
      <WorkspaceDashboardTab
        v-if="activeTabId === 'dashboard'"
        :selected-contest="selectedContest"
        :selected-track="selectedTrack"
        :selected-track-id="selectedTrackId"
        :selected-contest-id="selectedContestId"
        :mapping-rows="mappingRows"
        :keyword-cloud="keywordCloud"
        :trend-bars="trendBars"
        :linked-contest-entries="linkedContestEntries"
        :selected-resources="selectedResources"
        :material-coverage="Math.min(selectedResources.length * 20, 100)"
        :form-state="formState"
        :form-submitting="formSubmitting"
        :tone-meta="toneMeta"
        @update-selected-track-id="emit('update:selectedTrackId', $event)"
        @use-binding-as-current-contest="useBindingAsCurrentContest($event.contestId, $event.trackId)"
        @update-form-field="updateFormField($event.field, $event.value)"
        @submit-project-for-contest="submitProjectForContest($event.contestId, $event.trackId)"
      />

      <WorkspaceFlowTab
        v-else-if="activeTabId === 'flow'"
        :has-flow-resource="hasFlowResource"
        :flow-panel-title="flowPanelTitle"
        :flow-resource-id="props.flowResourceId"
        :collab-revision="collabRevision"
        :collab-connected="collabConnected"
        :collab-connection-text="collabConnectionText"
        :collab-presence-users="collabPresenceUsers"
        :collab-presence-cursors="collabPresenceCursors"
        :collab-draw-value="collabDrawValue"
        :collab-draw-error="collabDrawError"
        @update-collab-draw-value="onCollabDrawModelUpdate"
        @update-collab-cursor="onCollabCursorUpdate"
      />

      <WorkspaceMembersTab
        v-else-if="activeTabId === 'members'"
        :workspace-name="workspaceName"
        :workspace-type="workspaceType"
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
        :workspace-member-role-draft-map="workspaceMemberRoleDraftMap"
        :project-role-options="PROJECT_ROLE_OPTIONS"
        :workspace-type-label="workspaceTypeLabel"
        :workspace-member-role-summary="workspaceMemberRoleSummary"
        :workspace-invitation-status-label="workspaceInvitationStatusLabel"
        :workspace-invitation-status-badge-class="workspaceInvitationStatusBadgeClass"
        :workspace-invitation-scope-label="workspaceInvitationScopeLabel"
        :workspace-role-label="workspaceRoleLabel"
        :can-remove-workspace-member="canRemoveWorkspaceMember"
        :format-date-time="formatDateTime"
        @open-workspace-invite-modal="openWorkspaceInviteModal"
        @reload-workspace-member-management="emit('reloadWorkspaceMemberManagement')"
        @open-workspace-seat-modal="openWorkspaceSeatModal"
        @update-workspace-member-role-draft="workspaceMemberRoleDraftMap[$event.userId] = $event.role"
        @submit-workspace-member-role="submitWorkspaceMemberRole"
        @remove-workspace-member="removeWorkspaceMember"
        @revoke-workspace-invitation="revokeWorkspaceInvitation"
      />

      <WorkspaceProjectSettingsTab
        v-else-if="activeTabId === 'settings'"
        :active-project="activeProject"
        :contests="projectSettingsContestOptions"
        :project-settings-loading="projectSettingsLoading"
        :project-settings-save-state="projectSettingsSaveState"
        :project-settings-common="projectSettingsCommon"
        :project-settings-bindings="projectSettingsBindings"
        :project-settings-current-contest-id="projectSettingsCurrentContestId"
        :project-settings-adaptation="projectSettingsAdaptation"
        :project-settings-has-current-contest="projectSettingsHasCurrentContest"
        :project-resource-shares="projectResourceShares"
        :project-resource-shares-loading="projectResourceSharesLoading"
        :project-settings-save-label="projectSettingsSaveLabel"
        :project-settings-save-badge-class="projectSettingsSaveBadgeClass"
        :project-settings-contest-name="projectSettingsContestName"
        :contest-tracks-by-contest-id="contestTracksByContestId"
        :share-visibility-label="shareVisibilityLabel"
        :share-status-label="shareStatusLabel"
        :share-status-badge-class="shareStatusBadgeClass"
        :get-share-status="getShareStatus"
        :format-date-time="formatDateTime"
        @emit-project-settings-common="emitProjectSettingsCommon"
        @update-project-settings-common-field="updateProjectSettingsCommonField($event.field, $event.value)"
        @save-project-settings="emit('saveProjectSettings')"
        @add-project-settings-binding="onAddProjectSettingsBinding"
        @update-project-settings-binding-contest="updateProjectSettingsBindingContest($event.index, $event.contestId)"
        @update-project-settings-binding-track="updateProjectSettingsBindingTrack($event.index, $event.trackId)"
        @use-binding-as-current-contest="useBindingAsCurrentContest($event.contestId, $event.trackId)"
        @remove-project-settings-binding="removeProjectSettingsBinding"
        @update-project-settings-adaptation-field="updateProjectSettingsAdaptationField($event.field, $event.value)"
        @copy-project-resource-share="emit('copyProjectResourceShare', $event)"
        @revoke-project-resource-share="emit('revokeProjectResourceShare', $event)"
      />

      <WorkspaceResourcePreviewTab
        v-else-if="activeResourceTab"
        :active-resource-tab="activeResourceTab"
        :active-preview-mode="activePreviewMode"
        :preview-resource-id="props.previewResourceId"
        :preview-status="previewStatus"
        :preview-status-loading="previewStatusLoading"
        :preview-pdf-url="previewPdfUrl"
        :collab-revision="collabRevision"
        :collab-connected="collabConnected"
        :collab-connection-text="collabConnectionText"
        :collab-markdown-doc="collabMarkdownDoc"
        :collab-markdown-awareness="collabMarkdownAwareness"
        :collab-current-user="collabCurrentUser"
        :collab-presence-users="collabPresenceUsers"
        :collab-presence-cursors="collabPresenceCursors"
        :collab-draw-value="collabDrawValue"
        :collab-draw-error="collabDrawError"
        :preview-status-label="previewStatusLabel"
        :format-eta-seconds="formatEtaSeconds"
        :preview-error-message="previewErrorMessage"
        @reconvert-preview="emit('reconvertPreview')"
        @update-collab-draw-value="onCollabDrawModelUpdate"
        @update-collab-cursor="onCollabCursorUpdate"
        @markdown-selection-change="onMarkdownSelectionChange"
        @markdown-remote-presence-change="onMarkdownRemotePresenceChange"
      />

      <WorkspaceMainPanelEmptyState v-else />
    </div>

    <WorkspaceInviteModal
      :visible="workspaceInviteModalVisible"
      :workspace-can-manage-members="workspaceCanManageMembers"
      :workspace-invitation-submitting="workspaceInvitationSubmitting"
      :workspace-invite-project-label="workspaceInviteProjectLabel"
      :workspace-invitation-link="workspaceInvitationLink"
      :workspace-invite-unavailable-message="workspaceInviteUnavailableMessage"
      :can-submit-workspace-invitation="canSubmitWorkspaceInvitation"
      :invitee-username="workspaceInviteForm.inviteeUsername"
      :invite-role="workspaceInviteForm.role"
      :invite-expires-in-days="workspaceInviteForm.expiresInDays"
      :workspace-invite-role-options="workspaceInviteRoleOptions"
      :workspace-role-label="workspaceRoleLabel"
      @close="closeWorkspaceInviteModal"
      @copy-link="emit('copyWorkspaceInvitationLink')"
      @submit-invitation="submitWorkspaceInvitation"
      @update-invitee-username="workspaceInviteForm.inviteeUsername = $event"
      @update-invite-role="workspaceInviteForm.role = $event"
      @update-invite-expires-in-days="workspaceInviteForm.expiresInDays = $event"
    />

    <WorkspaceSeatModal
      :visible="workspaceSeatModalVisible"
      :normalized-workspace-seat-used="normalizedWorkspaceSeatUsed"
      :normalized-workspace-seat-limit="normalizedWorkspaceSeatLimit"
      :workspace-seat-summary-text="workspaceSeatSummaryText"
      :workspace-seat-limit-draft="workspaceSeatLimitDraft"
      :workspace-seat-draft-too-small="workspaceSeatDraftTooSmall"
      :workspace-seat-draft-too-large="workspaceSeatDraftTooLarge"
      :workspace-seat-limit-error="workspaceSeatLimitError"
      :workspace-seat-limit-save-loading="workspaceSeatLimitSaveLoading"
      :can-submit-workspace-seat-limit="canSubmitWorkspaceSeatLimit"
      @close="closeWorkspaceSeatModal"
      @submit-seat-limit="submitWorkspaceSeatLimit"
      @update-workspace-seat-limit-draft="workspaceSeatLimitDraft = $event"
    />

    <WorkspaceAddContestBindingModal
      :visible="projectSettingsAddContestModalVisible"
      :project-settings-contest-options="projectSettingsContestOptions"
      :project-settings-add-contest-candidates="projectSettingsAddContestCandidates"
      :project-settings-add-contest-modal-track-options="projectSettingsAddContestModalTrackOptions"
      :project-settings-add-contest-modal-contest-id="projectSettingsAddContestModalContestId"
      :project-settings-add-contest-modal-track-id="projectSettingsAddContestModalTrackId"
      @close="projectSettingsAddContestModalVisible = false"
      @open-contest-catalog-page="openContestCatalogPage"
      @request-project-settings-contest-reload="requestProjectSettingsContestReload"
      @update-project-settings-add-contest-modal-contest-id="projectSettingsAddContestModalContestId = $event"
      @update-project-settings-add-contest-modal-track-id="projectSettingsAddContestModalTrackId = $event"
      @confirm-project-settings-add-contest-modal="confirmProjectSettingsAddContestModal"
    />
  </section>
</template>
