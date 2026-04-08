<script setup lang="ts">
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
import { buildOnlyOfficeUserFacingErrorMessage } from '~~/shared/constants/onlyoffice'
import RichTextEditor from '~/components/editor/RichTextEditor.vue'
import CollabPresencePanel from '~/components/workspace/collab/CollabPresencePanel.vue'
import WorkspaceTldrawCanvas from '~/components/workspace/collab/WorkspaceTldrawCanvas.client.vue'

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
  collabMarkdownDoc?: YDoc | null
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
  collabMarkdownDoc: null,
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

interface WorkspaceCollabPresenceMember {
  peerId: string
  userId: string
  username: string
  cursorX?: number
  cursorY?: number
  updatedAt?: string
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

const materialCoverage = computed(() => Math.min(props.selectedResources.length * 20, 100))

const dashboardGuide = computed(() => {
  return [
    {
      id: 'contest',
      title: '锁定竞赛与赛道',
      done: Boolean(props.selectedContest && props.selectedTrack),
      doneText: `${props.selectedContest?.name || ''} / ${props.selectedTrack?.name || ''}`,
      todoText: '请先在左侧完成竞赛筛选并选择赛道。',
    },
    {
      id: 'resource',
      title: '补齐申报资料',
      done: props.selectedResources.length > 0,
      doneText: `已归档 ${props.selectedResources.length} 份资料`,
      todoText: '资料池为空，建议先补齐规则文档和样例。',
    },
    {
      id: 'mapping',
      title: '完成核心指标对标',
      done: props.mappingRows.length > 0,
      doneText: `已生成 ${props.mappingRows.length} 条映射指标`,
      todoText: '尚未生成映射指标。',
    },
    {
      id: 'submit',
      title: '按比赛提交草案',
      done: Boolean(props.formState.title.trim()),
      doneText: '草案标题已填写，可进入关联比赛提交。',
      todoText: '请先完善项目草案字段。',
    },
  ]
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

function previewStatusLabel(status: ResourcePreviewStatus | ''): string {
  if (status === 'queued')
    return '排队中'
  if (status === 'converting')
    return '转换中'
  if (status === 'finalizing')
    return '收尾处理中'
  if (status === 'succeeded')
    return '已完成'
  if (status === 'failed')
    return '转换失败'
  return '等待中'
}

function formatEtaSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(Number(seconds || 0)))
  if (safe <= 0)
    return '即将完成'
  if (safe < 60)
    return `约 ${safe} 秒`
  const minutes = Math.ceil(safe / 60)
  if (minutes < 60)
    return `约 ${minutes} 分钟`
  const hours = Math.ceil(minutes / 60)
  return `约 ${hours} 小时`
}

function previewErrorMessage(rawMessage: string): string {
  const normalized = String(rawMessage || '').trim()
  if (!normalized)
    return ''
  if (normalized.startsWith('ONLYOFFICE_CONVERT_'))
    return buildOnlyOfficeUserFacingErrorMessage(normalized)
  return normalized
}

const normalizedPreviewMode = computed<WorkspacePreviewMode>(() => {
  return normalizePreviewModeValue(props.previewMode)
})

const activePreviewMode = computed<WorkspacePreviewMode>(() => {
  return activeResourceTab.value?.previewMode || normalizedPreviewMode.value
})

const collabConnectionText = computed(() => {
  const customText = String(props.collabStatusText || '').trim()
  if (customText)
    return customText
  return props.collabConnected ? '实时连接中' : '离线编辑（待重连）'
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

function workspaceTypeLabel(value: WorkspaceType | ''): string {
  if (value === 'personal')
    return '个人项目台'
  if (value === 'team')
    return 'Team 项目台'
  return '项目台'
}

function workspaceRoleLabel(role: ProjectMemberRole): string {
  if (role === 'owner')
    return '所有者'
  if (role === 'manager')
    return '管理者'
  if (role === 'editor')
    return '编辑者'
  return '查看者'
}

function workspaceMemberRoleSummary(member: ProjectMemberSummary): string {
  return workspaceRoleLabel(workspaceMemberPrimaryRole(member))
}

function workspaceInvitationStatus(invitation: ProjectInvitationSummary): 'pending' | 'expired' | 'accepted' {
  if (String(invitation.acceptedAt || '').trim())
    return 'accepted'
  if (invitation.isExpired)
    return 'expired'
  return 'pending'
}

function workspaceInvitationStatusLabel(invitation: ProjectInvitationSummary): string {
  const status = workspaceInvitationStatus(invitation)
  if (status === 'accepted')
    return '已接受'
  if (status === 'expired')
    return '已过期'
  return '待接受'
}

function workspaceInvitationStatusBadgeClass(invitation: ProjectInvitationSummary): string {
  const status = workspaceInvitationStatus(invitation)
  if (status === 'accepted')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'expired')
    return 'border-rose-200 bg-rose-50 text-rose-600'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function workspaceInvitationScopeLabel(invitation: ProjectInvitationSummary): string {
  const projectTitle = String(invitation.projectTitle || '').trim()
  const roleLabel = workspaceRoleLabel(invitation.projectRole || 'viewer')
  if (projectTitle)
    return `加入项目：${projectTitle} · 项目角色：${roleLabel}`
  return `项目角色：${roleLabel}`
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

function formatDateTime(value: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '-'

  const date = new Date(normalized)
  if (!Number.isFinite(date.getTime()))
    return normalized

  return date.toLocaleString('zh-CN', { hour12: false })
}

function shareVisibilityLabel(value: string): string {
  if (value === 'workspace')
    return '组织内成员可见'
  return '公开可见'
}

function getShareStatus(share: ProjectResourceShare): 'active' | 'expired' | 'revoked' {
  if (String(share.revokedAt || '').trim())
    return 'revoked'

  const expiresAtMs = new Date(String(share.expiresAt || '')).getTime()
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now())
    return 'expired'
  return 'active'
}

function shareStatusLabel(share: ProjectResourceShare): string {
  const status = getShareStatus(share)
  if (status === 'revoked')
    return '已失效'
  if (status === 'expired')
    return '已过期'
  return '生效中'
}

function shareStatusBadgeClass(share: ProjectResourceShare): string {
  const status = getShareStatus(share)
  if (status === 'revoked')
    return 'text-rose-600 border-rose-200 bg-rose-50'
  if (status === 'expired')
    return 'text-amber-700 border-amber-200 bg-amber-50'
  return 'text-emerald-700 border-emerald-200 bg-emerald-50'
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
  <section class="bg-slate-50 flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
    <div class="border-b border-slate-200 bg-white flex shrink-0 h-10 items-center relative">
      <template v-if="openTabs.length > 0">
        <div
          v-for="tab in openTabs"
          :key="tab.id"
          class="px-2 border-r border-slate-200 flex gap-1 h-full min-w-[170px] items-center"
          :class="[
            tab.id === activeTabId ? 'bg-slate-50' : 'bg-white',
            dragOverTabId === tab.id ? 'ring-1 ring-inset ring-blue-300' : '',
          ]"
          draggable="true"
          @dragstart="onTabDragStart(tab.id)"
          @dragover="onTabDragOver(tab.id, $event)"
          @drop="onTabDrop(tab.id, $event)"
          @dragend="onTabDragEnd"
          @contextmenu.prevent="openTabContextMenu(tab.id, $event)"
        >
          <button
            class="text-xs text-left flex flex-1 gap-2 h-full min-w-0 items-center"
            :class="tab.id === activeTabId ? 'text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'"
            type="button"
            @click="activateTab(tab.id)"
          >
            <span class="material-symbols-outlined text-sm" :class="tab.id === activeTabId ? 'text-blue-500' : 'text-slate-400'">{{ tab.icon }}</span>
            <span class="truncate">{{ tab.title }}</span>
          </button>

          <button
            v-if="tab.closeable"
            class="text-slate-400 p-1 rounded hover:text-slate-600 hover:bg-slate-100"
            type="button"
            @click.stop="closeTab(tab.id)"
          >
            <span class="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      </template>

      <div v-else class="px-3 flex w-full items-center justify-between">
        <span class="text-[11px] text-slate-500 font-medium">WinLoop</span>
        <button
          class="text-[11px] font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50"
          type="button"
          @click="ensureFixedTabOpen('dashboard', true)"
        >
          打开仪表盘
        </button>
      </div>

      <div
        v-if="tabContextMenuVisible"
        class="workspace-tab-context-menu"
        :style="{
          left: `${tabContextMenuPosition.x}px`,
          top: `${tabContextMenuPosition.y}px`,
        }"
      >
        <button
          v-if="tabContextMenuTab?.closeable"
          class="workspace-tab-context-menu__item"
          type="button"
          @click="closeTab(tabContextMenuTab.id)"
        >
          关闭当前
        </button>
        <button
          class="workspace-tab-context-menu__item"
          type="button"
          :disabled="tabContextMenuLeftIds.length === 0"
          @click="closeTabsToLeft"
        >
          关闭左侧所有
        </button>
        <button
          class="workspace-tab-context-menu__item"
          type="button"
          :disabled="tabContextMenuRightIds.length === 0"
          @click="closeTabsToRight"
        >
          关闭右侧所有
        </button>
        <button
          class="workspace-tab-context-menu__item"
          type="button"
          :disabled="openTabs.length <= 1"
          @click="closeOtherTabs"
        >
          关闭其他
        </button>
        <button
          class="workspace-tab-context-menu__item workspace-tab-context-menu__item--danger"
          type="button"
          :disabled="openTabs.length === 0"
          @click="closeAllTabs"
        >
          关闭所有
        </button>
      </div>
    </div>

    <div class="text-[11px] text-slate-400 px-4 py-2 border-b border-slate-200 bg-white flex gap-2 items-center">
      <template v-for="(item, index) in breadcrumbItems" :key="`breadcrumb-${index}-${item}`">
        <span :class="index === breadcrumbItems.length - 1 ? 'text-slate-600 font-medium' : ''">
          {{ item }}
        </span>
        <span v-if="index < breadcrumbItems.length - 1" class="material-symbols-outlined text-[12px]">chevron_right</span>
      </template>
    </div>

    <div
      class="flex-1 h-0 min-h-0"
      :class="activeResourceTab ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden p-4 md:p-6'"
    >
      <div v-if="activeTabId === 'dashboard'" class="mx-auto max-w-5xl space-y-4">
        <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex gap-3 items-center">
            <span class="material-symbols-outlined text-xl text-blue-600">space_dashboard</span>
            <div>
              <h2 class="text-sm font-bold">
                WinLoop 仪表盘
              </h2>
              <div class="text-[11px] text-slate-500 mt-0.5">
                以“竞赛锁定 → 指标对标 → 关联比赛提交 → 终审”为主线推进项目落地。
              </div>
            </div>
          </div>

          <ol class="divide-slate-200 divide-y">
            <li
              v-for="(step, index) in dashboardGuide"
              :key="step.id"
              class="p-4 flex gap-3 items-start"
            >
              <span
                class="text-[11px] font-bold rounded-full flex h-5 w-5 items-center justify-center"
                :class="step.done ? 'text-emerald-700 bg-emerald-50' : 'text-blue-600 bg-blue-50'"
              >
                {{ index + 1 }}
              </span>
              <div>
                <div class="text-xs text-slate-800 font-semibold">
                  {{ step.title }}
                </div>
                <p class="text-[11px] mt-1" :class="step.done ? 'text-emerald-600' : 'text-amber-600'">
                  {{ step.done ? step.doneText : step.todoText }}
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div class="flex gap-3 items-center">
              <span class="material-symbols-outlined text-xl text-blue-600">account_tree</span>
              <div>
                <h2 class="text-sm font-bold">
                  核心指标对标
                </h2>
                <div class="text-[11px] text-slate-500 mt-0.5">
                  {{ selectedTrack?.summary || '请选择竞赛与赛道，开始对标分析。' }}
                </div>
              </div>
            </div>
            <div class="flex gap-2 items-center">
              <select
                class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 min-w-46 focus:border-blue-500"
                :value="selectedTrackId"
                @change="emit('update:selectedTrackId', ($event.target as HTMLSelectElement).value)"
              >
                <option value="" disabled>
                  选择赛道
                </option>
                <option v-for="track in selectedContest?.tracks || []" :key="track.id" :value="track.id">
                  {{ track.name }}
                </option>
              </select>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="text-xs text-left min-w-180 w-full border-collapse">
              <thead>
                <tr class="text-slate-500 bg-slate-50/60">
                  <th class="font-semibold px-4 py-2 border-b border-slate-200">
                    要求指标 (竞赛要求)
                  </th>
                  <th class="font-semibold px-4 py-2 text-center border-b border-slate-200">
                    关联度
                  </th>
                  <th class="font-semibold px-4 py-2 border-b border-slate-200">
                    对应项目能力点
                  </th>
                  <th class="font-semibold px-4 py-2 border-b border-slate-200">
                    佐证材料状态
                  </th>
                </tr>
              </thead>
              <tbody class="divide-slate-200 divide-y">
                <tr
                  v-for="row in mappingRows"
                  :key="row.id"
                  class="transition-colors hover:bg-blue-50/40"
                >
                  <td class="px-4 py-3.5">
                    <div class="text-slate-900 font-medium">
                      {{ row.metric }}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1">
                      {{ row.hint }}
                    </div>
                  </td>
                  <td class="px-4 py-3.5 text-center">
                    <span class="rounded-full bg-slate-100 h-1.5 w-20 inline-block overflow-hidden">
                      <span
                        class="h-full block"
                        :class="toneMeta[row.tone].barClass"
                        :style="{ width: `${row.score}%` }"
                      />
                    </span>
                  </td>
                  <td class="px-4 py-3.5">
                    <div class="text-slate-700">
                      {{ row.ability }}
                    </div>
                    <div class="text-[10px] text-blue-600 font-medium mt-1">
                      <span v-for="tag in row.tags" :key="`${row.id}-${tag}`" class="mr-2">{{ tag }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3.5">
                    <span
                      class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      :class="toneMeta[row.tone].badgeClass"
                    >
                      {{ toneMeta[row.tone].label }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="gap-4 grid grid-cols-1 md:grid-cols-2">
          <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
            <div class="mb-4 flex gap-2 items-center">
              <span class="material-symbols-outlined text-sm text-blue-500">hub</span>
              <span class="text-xs text-slate-500 tracking-wider font-bold uppercase">核心词云图</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="word in keywordCloud"
                :key="word.label"
                class="text-[10px] px-2 py-1 rounded"
                :class="word.active ? 'bg-blue-50 text-blue-600 font-bold' : 'bg-slate-50 text-slate-600'"
              >
                {{ word.label }} ({{ word.count }})
              </span>
            </div>
          </div>

          <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
            <div class="mb-4 flex gap-2 items-center">
              <span class="material-symbols-outlined text-sm text-green-500">show_chart</span>
              <span class="text-xs text-slate-500 tracking-wider font-bold uppercase">竞争力评估趋势</span>
            </div>
            <div class="flex gap-1.5 h-16 items-end">
              <div
                v-for="(height, index) in trendBars"
                :key="`trend-${index}`"
                class="rounded-t flex-1 transition-all"
                :class="index === trendBars.length - 1 ? 'bg-blue-500 animate-pulse' : 'bg-blue-200'"
                :style="{ height: `${height}%` }"
              />
            </div>
          </div>
        </div>

        <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex gap-3 items-center">
            <span class="material-symbols-outlined text-xl text-indigo-600">checklist</span>
            <div>
              <h2 class="text-sm font-bold">
                关联比赛提交区
              </h2>
              <div class="text-[11px] text-slate-500 mt-0.5">
                规则详情与提交表单按比赛内聚，右侧只保留智能辅助。
              </div>
            </div>
          </div>

          <div class="p-4 space-y-4">
            <article
              v-for="entry in linkedContestEntries"
              :key="entry.contest.id"
              class="border border-slate-200 rounded-lg bg-white"
            >
              <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div class="text-xs text-slate-800 font-semibold">
                    {{ entry.contest.name }}
                  </div>
                  <div class="text-[11px] text-slate-500 mt-0.5">
                    {{ entry.track?.name || '未匹配赛道' }} · {{ entry.contest.registrationWindow || '报名窗口待补充' }}
                  </div>
                </div>
                <button
                  class="text-[11px] font-semibold px-2.5 py-1 border rounded transition-colors"
                  :class="entry.contest.id === selectedContestId ? 'text-blue-700 border-blue-200 bg-blue-50' : 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50'"
                  type="button"
                  @click="useBindingAsCurrentContest(entry.contest.id, entry.track?.id || '')"
                >
                  {{ entry.contest.id === selectedContestId ? '当前比赛' : '设为当前比赛' }}
                </button>
              </div>

              <div class="p-4 space-y-3">
                <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
                  <div class="p-3 border border-slate-200 rounded bg-slate-50">
                    <div class="text-[11px] text-slate-700 font-semibold">
                      规则详情
                    </div>
                    <p class="text-[11px] text-slate-600 mt-1">
                      参赛要求：{{ entry.contest.participantRequirements || '暂无明确描述' }}
                    </p>
                    <p class="text-[11px] text-slate-600 mt-1">
                      组队规则：{{ entry.contest.teamRule || '暂无明确描述' }}
                    </p>
                    <p class="text-[11px] text-slate-500 mt-1">
                      报名窗口：{{ entry.contest.registrationWindow || '—' }}
                    </p>
                    <p class="text-[11px] text-slate-500 mt-1">
                      提交截止：{{ entry.contest.submissionDeadline || '—' }}
                    </p>
                  </div>
                  <div class="p-3 border border-slate-200 rounded bg-slate-50">
                    <div class="text-[11px] text-slate-700 font-semibold">
                      资料齐备度
                    </div>
                    <div class="mt-2 rounded-full bg-slate-100 h-2 overflow-hidden">
                      <span
                        class="bg-blue-500 h-full block"
                        :style="{ width: `${materialCoverage}%` }"
                      />
                    </div>
                    <p class="text-[11px] text-slate-500 mt-2">
                      当前进度：{{ materialCoverage }}%
                    </p>
                    <p class="text-[11px] text-slate-500 mt-1">
                      已关联资料：{{ selectedResources.length }} 份
                    </p>
                  </div>
                </div>

                <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
                  <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                    <span class="block">项目标题</span>
                    <input
                      :value="formState.title"
                      class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                      placeholder="输入项目标题"
                      @input="updateFormField('title', ($event.target as HTMLInputElement).value)"
                    >
                  </label>

                  <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                    <span class="block">问题陈述</span>
                    <textarea
                      :value="formState.problemStatement"
                      class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                      @input="updateFormField('problemStatement', ($event.target as HTMLTextAreaElement).value)"
                    />
                  </label>

                  <label class="text-xs text-slate-600 block space-y-1">
                    <span class="block">创新点（每行一条）</span>
                    <textarea
                      :value="formState.innovationPointsText"
                      class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                      @input="updateFormField('innovationPointsText', ($event.target as HTMLTextAreaElement).value)"
                    />
                  </label>

                  <label class="text-xs text-slate-600 block space-y-1">
                    <span class="block">技术路线（每行一条）</span>
                    <textarea
                      :value="formState.techRouteStepsText"
                      class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                      @input="updateFormField('techRouteStepsText', ($event.target as HTMLTextAreaElement).value)"
                    />
                  </label>

                  <label class="text-xs text-slate-600 block space-y-1">
                    <span class="block">评分映射（每行一条）</span>
                    <textarea
                      :value="formState.scoringMappingText"
                      class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                      @input="updateFormField('scoringMappingText', ($event.target as HTMLTextAreaElement).value)"
                    />
                  </label>

                  <label class="text-xs text-slate-600 block space-y-1">
                    <span class="block">风险项（每行一条）</span>
                    <textarea
                      :value="formState.risksText"
                      class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                      @input="updateFormField('risksText', ($event.target as HTMLTextAreaElement).value)"
                    />
                  </label>

                  <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                    <span class="block">交付物（每行一条）</span>
                    <textarea
                      :value="formState.deliverablesText"
                      class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                      @input="updateFormField('deliverablesText', ($event.target as HTMLTextAreaElement).value)"
                    />
                  </label>

                  <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                    <span class="block">摘要</span>
                    <textarea
                      :value="formState.summary"
                      class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                      @input="updateFormField('summary', ($event.target as HTMLTextAreaElement).value)"
                    />
                  </label>
                </div>

                <button
                  class="text-xs text-white font-semibold rounded bg-blue-600 h-9 w-full hover:bg-blue-500 disabled:opacity-60"
                  :disabled="!entry.track?.id || formSubmitting"
                  @click="submitProjectForContest(entry.contest.id, entry.track?.id || '')"
                >
                  {{ formSubmitting ? '提交中...' : `提交到 ${entry.contest.name}` }}
                </button>
              </div>
            </article>

            <div v-if="linkedContestEntries.length === 0" class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed">
              暂无关联比赛，请先在左侧选择比赛，或在“项目设置”中添加竞赛绑定。
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeTabId === 'flow'" class="h-full min-h-0 w-full">
        <div class="bg-white flex flex-col h-full min-h-0 overflow-hidden">
          <div class="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
            <div class="text-xs text-slate-600">
              {{ flowPanelTitle }}
              <span class="text-slate-400 ml-2">rev {{ hasFlowResource ? Math.max(0, Number(collabRevision || 0)) : 0 }}</span>
            </div>
            <div
              class="text-[11px]"
              :class="hasFlowResource ? (collabConnected ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-400'"
            >
              {{ hasFlowResource ? collabConnectionText : '待初始化' }}
            </div>
          </div>

          <div v-if="hasFlowResource" class="grid grid-cols-1 h-full md:grid-cols-[1fr,220px]">
            <div class="flex flex-col h-full">
              <WorkspaceTldrawCanvas
                :key="props.flowResourceId || 'flow-canvas'"
                class="h-full min-h-0 w-full"
                :model-value="collabDrawValue"
                :persistence-key="`workspace-flow-${props.flowResourceId || 'default'}`"
                :readonly="false"
                @update:model-value="onCollabDrawModelUpdate"
              />
              <p v-if="collabDrawError" class="text-[11px] text-rose-600 px-4 py-2 border-t border-rose-100 bg-rose-50">
                {{ collabDrawError }}
              </p>
            </div>
            <CollabPresencePanel :members="collabPresenceMembers" />
          </div>

          <div v-else class="px-6 bg-slate-50 flex flex-1 items-center justify-center">
            <div class="px-6 py-8 text-center border border-slate-300 rounded-xl border-dashed bg-white max-w-md">
              <span class="material-symbols-outlined text-3xl text-blue-600">flowsheet</span>
              <h3 class="text-sm text-slate-800 font-semibold mt-3">
                暂未初始化流程画布
              </h3>
              <p class="text-[12px] text-slate-500 leading-6 mt-2">
                从左侧“流程”入口进入时，系统会自动为当前项目创建并打开唯一的主流程画布。
              </p>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeTabId === 'members'" class="mx-auto max-w-5xl space-y-4">
        <section class="p-4 border border-slate-200 rounded-lg bg-white" data-testid="project-collab-panel">
          <div class="mb-3 flex flex-wrap gap-3 items-start justify-between">
            <div class="flex gap-3 items-center">
              <span class="material-symbols-outlined text-xl text-blue-600">group</span>
              <div>
                <h3 class="text-xs text-slate-700 font-semibold">
                  项目协作管理
                </h3>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  所属 Team：{{ workspaceName || '当前 Team' }} · {{ workspaceTypeLabel(workspaceType) }}
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 items-center">
              <button
                data-testid="project-collab-open-invite-button"
                class="text-[11px] text-white font-semibold px-3 py-1.5 rounded bg-slate-900 transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                type="button"
                :disabled="!workspaceCanManageMembers || workspaceInvitationSubmitting"
                @click="openWorkspaceInviteModal"
              >
                {{ workspaceInvitationSubmitting ? '生成中...' : '生成邀请链接' }}
              </button>
              <button
                class="text-[11px] font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
                :disabled="workspaceMemberManagementLoading"
                @click="emit('reloadWorkspaceMemberManagement')"
              >
                刷新
              </button>
            </div>
          </div>

          <div class="mb-3">
            <article class="p-3 border border-slate-200 rounded bg-slate-50/60">
              <p class="text-[11px] text-slate-600 font-semibold">
                项目席位概览
              </p>
              <p class="text-sm text-slate-800 font-bold mt-1">
                {{ normalizedWorkspaceSeatUsed }} / {{ normalizedWorkspaceSeatLimit ?? '--' }}
              </p>
              <p class="text-[11px] text-slate-500 mt-1">
                {{ workspaceSeatSummaryText }}
              </p>

              <div class="mt-2 flex flex-wrap gap-2 items-center">
                <button
                  v-if="workspaceCanAddSeat"
                  class="text-[11px] text-white font-semibold px-3 py-1.5 rounded bg-slate-900 transition-colors hover:bg-slate-700"
                  type="button"
                  @click="openWorkspaceSeatModal"
                >
                  调整项目席位
                </button>
                <span
                  v-else
                  class="text-[11px] text-slate-600 px-2.5 py-1 border border-slate-200 rounded bg-slate-100"
                >
                  仅具备项目管理权限的成员可调整席位
                </span>
              </div>
            </article>
          </div>

          <div v-if="workspaceMemberManagementLoading" class="text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
            正在加载项目协作成员...
          </div>

          <template v-else>
            <div class="gap-3 grid grid-cols-1 xl:grid-cols-[1.2fr,1fr]">
              <section class="border border-slate-200 rounded bg-slate-50/40">
                <div class="text-[11px] text-slate-600 font-semibold px-3 py-2 border-b border-slate-200 bg-white">
                  项目成员（{{ workspaceMembers.length }}）
                </div>

                <div v-if="workspaceMembers.length === 0" class="text-[11px] text-slate-500 px-3 py-3">
                  当前项目暂无成员记录。
                </div>

                <div v-else class="divide-slate-200 divide-y" data-testid="project-member-list">
                  <article
                    v-for="member in workspaceMembers"
                    :key="member.userId"
                    data-testid="project-member-item"
                    :data-user-id="member.userId"
                    :data-username="member.username"
                    class="px-3 py-2.5"
                  >
                    <div class="flex flex-wrap gap-2 items-center justify-between">
                      <p class="text-xs text-slate-800 font-semibold">
                        {{ member.username }}
                      </p>
                      <p class="text-[11px] text-slate-500">
                        加入于 {{ formatDateTime(member.createdAt) }}
                      </p>
                    </div>
                    <p class="text-[11px] text-slate-600 mt-1" data-testid="project-member-role-summary">
                      {{ workspaceMemberRoleSummary(member) }}
                    </p>
                    <p v-if="member.addedByUsername" class="text-[11px] text-slate-500 mt-1">
                      添加人：{{ member.addedByUsername }}
                    </p>
                    <div
                      v-if="canEditWorkspaceMembers && workspaceMemberPrimaryRole(member) !== 'owner'"
                      class="mt-2 flex flex-wrap gap-2 items-center"
                    >
                      <select
                        v-model="workspaceMemberRoleDraftMap[member.userId]"
                        data-testid="project-member-role-select"
                        class="text-[11px] px-2 outline-none border border-slate-200 rounded bg-white h-7 focus:border-blue-500"
                      >
                        <option
                          v-for="role in PROJECT_ROLE_OPTIONS"
                          :key="`member-role-option-${member.userId}-${role}`"
                          :value="role"
                        >
                          {{ workspaceRoleLabel(role) }}
                        </option>
                      </select>
                      <button
                        data-testid="project-member-role-update-button"
                        class="text-[11px] font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        type="button"
                        :disabled="workspaceMemberRoleUpdatingUserId === member.userId || workspaceMemberRemovingUserId === member.userId"
                        @click="submitWorkspaceMemberRole(member)"
                      >
                        {{ workspaceMemberRoleUpdatingUserId === member.userId ? '更新中...' : '更新项目角色' }}
                      </button>
                    </div>
                    <div
                      v-if="canRemoveWorkspaceMember(member)"
                      class="mt-2 flex flex-wrap gap-2 items-center"
                    >
                      <button
                        data-testid="project-member-remove-button"
                        class="text-[11px] text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        type="button"
                        :disabled="workspaceMemberRoleUpdatingUserId === member.userId || workspaceMemberRemovingUserId === member.userId"
                        @click="removeWorkspaceMember(member)"
                      >
                        {{ workspaceMemberRemovingUserId === member.userId ? '移除中...' : '移出项目' }}
                      </button>
                    </div>
                  </article>
                </div>
              </section>

              <section>
                <div class="border border-slate-200 rounded bg-white">
                  <div class="text-[11px] text-slate-600 font-semibold px-3 py-2 border-b border-slate-200 bg-slate-50">
                    待处理邀请（{{ workspaceInvitations.length }}）
                  </div>

                  <div v-if="workspaceInvitations.length === 0" class="text-[11px] text-slate-500 px-3 py-3">
                    暂无待处理邀请。
                  </div>

                  <div v-else class="divide-slate-200 divide-y" data-testid="project-invitation-list">
                    <article
                      v-for="invitation in workspaceInvitations"
                      :key="invitation.id"
                      data-testid="project-invitation-item"
                      :data-invitation-id="invitation.id"
                      class="px-3 py-2.5"
                    >
                      <div class="flex flex-wrap gap-2 items-center justify-between">
                        <p class="text-xs text-slate-800 font-semibold">
                          {{ invitation.inviteeUsername || '通用邀请（未绑定用户）' }}
                        </p>
                        <span
                          class="text-[10px] font-semibold px-2 py-0.5 border rounded-full"
                          :class="workspaceInvitationStatusBadgeClass(invitation)"
                        >
                          {{ workspaceInvitationStatusLabel(invitation) }}
                        </span>
                      </div>
                      <p class="text-[11px] text-slate-600 mt-1">
                        {{ workspaceRoleLabel(invitation.projectRole || 'viewer') }} · 发起人 {{ invitation.invitedByUsername }}
                      </p>
                      <p class="text-[11px] text-slate-500 mt-1">
                        {{ workspaceInvitationScopeLabel(invitation) }}
                      </p>
                      <p class="text-[11px] text-slate-500 mt-1">
                        过期时间：{{ formatDateTime(invitation.expiresAt) }}
                      </p>
                      <button
                        v-if="workspaceCanManageMembers && workspaceInvitationStatus(invitation) === 'pending'"
                        class="text-[11px] text-rose-600 font-semibold mt-2 px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        type="button"
                        :disabled="workspaceInvitationRevokingId === invitation.id"
                        @click="revokeWorkspaceInvitation(invitation.id)"
                      >
                        {{ workspaceInvitationRevokingId === invitation.id ? '撤销中...' : '撤销邀请' }}
                      </button>
                    </article>
                  </div>
                </div>
              </section>
            </div>
          </template>
        </section>
      </div>

      <div v-else-if="activeTabId === 'settings'" class="mx-auto max-w-5xl space-y-4">
        <section class="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="flex gap-3 items-center">
              <span class="material-symbols-outlined text-xl text-blue-600">settings</span>
              <div>
                <h2 class="text-sm font-bold">
                  项目通用设置
                </h2>
                <div class="text-[11px] text-slate-500 mt-0.5">
                  项目通用信息
                </div>
              </div>
            </div>

            <div class="flex gap-2 items-center">
              <span
                class="text-[11px] font-medium px-2 py-1 border rounded"
                :class="projectSettingsSaveBadgeClass"
              >
                {{ projectSettingsSaveLabel }}
              </span>
              <button
                class="text-[11px] text-white font-semibold px-3 py-1.5 rounded bg-slate-900 transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                type="button"
                :disabled="!hasActiveProject || projectSettingsLoading"
                @click="emit('saveProjectSettings')"
              >
                立即保存
              </button>
            </div>
          </div>

          <div class="p-4">
            <div v-if="projectSettingsLoading" class="text-xs text-slate-500 p-3 border border-slate-200 rounded bg-slate-50">
              正在加载项目设置...
            </div>

            <div v-else-if="!hasActiveProject" class="text-xs text-slate-500 p-3 border border-slate-200 rounded bg-slate-50">
              当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
            </div>

            <div v-else class="space-y-3">
              <ProjectBasicSettingsEditor
                :model-value="projectSettingsCommon"
                :project="activeProject"
                :disabled="projectSettingsLoading"
                @update:model-value="emitProjectSettingsCommon"
              />

              <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
                <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                  <span class="block">问题陈述</span>
                  <textarea
                    :value="projectSettingsCommon.problemStatement"
                    class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                    @input="updateProjectSettingsCommonField('problemStatement', ($event.target as HTMLTextAreaElement).value)"
                  />
                </label>

                <label class="text-xs text-slate-600 block space-y-1">
                  <span class="block">创新点（每行一条）</span>
                  <textarea
                    :value="projectSettingsCommon.innovationPointsText"
                    class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                    @input="updateProjectSettingsCommonField('innovationPointsText', ($event.target as HTMLTextAreaElement).value)"
                  />
                </label>
                <label class="text-xs text-slate-600 block space-y-1">
                  <span class="block">技术路线（每行一条）</span>
                  <textarea
                    :value="projectSettingsCommon.techRouteStepsText"
                    class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                    @input="updateProjectSettingsCommonField('techRouteStepsText', ($event.target as HTMLTextAreaElement).value)"
                  />
                </label>
                <label class="text-xs text-slate-600 block space-y-1">
                  <span class="block">评分映射（每行一条）</span>
                  <textarea
                    :value="projectSettingsCommon.scoringMappingText"
                    class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                    @input="updateProjectSettingsCommonField('scoringMappingText', ($event.target as HTMLTextAreaElement).value)"
                  />
                </label>
                <label class="text-xs text-slate-600 block space-y-1">
                  <span class="block">风险项（每行一条）</span>
                  <textarea
                    :value="projectSettingsCommon.risksText"
                    class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                    @input="updateProjectSettingsCommonField('risksText', ($event.target as HTMLTextAreaElement).value)"
                  />
                </label>
                <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                  <span class="block">交付物（每行一条）</span>
                  <textarea
                    :value="projectSettingsCommon.deliverablesText"
                    class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                    @input="updateProjectSettingsCommonField('deliverablesText', ($event.target as HTMLTextAreaElement).value)"
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <template v-if="!projectSettingsLoading && hasActiveProject">
          <section class="p-4 border border-slate-200 rounded-lg bg-white">
            <div class="mb-3 flex gap-2 items-center justify-between">
              <h3 class="text-xs text-slate-700 font-semibold">
                竞赛与赛道绑定
              </h3>
              <button
                class="text-[11px] font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                type="button"
                @click="onAddProjectSettingsBinding"
              >
                添加竞赛
              </button>
            </div>

            <div class="space-y-2">
              <div
                v-for="(binding, index) in projectSettingsBindings"
                :key="`binding-${binding.contestId}-${index}`"
                class="gap-2 grid grid-cols-1 items-center md:grid-cols-[1fr,1fr,auto,auto]"
              >
                <select
                  :value="binding.contestId"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  @change="updateProjectSettingsBindingContest(index, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="" disabled>
                    选择竞赛
                  </option>
                  <option v-for="contest in projectSettingsContestOptions" :key="contest.id" :value="contest.id">
                    {{ contest.name }}
                  </option>
                </select>

                <select
                  :value="binding.trackId"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  @change="updateProjectSettingsBindingTrack(index, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="" disabled>
                    选择赛道
                  </option>
                  <option v-for="track in contestTracksByContestId(binding.contestId)" :key="track.id" :value="track.id">
                    {{ track.name }}
                  </option>
                </select>

                <button
                  class="text-[11px] font-semibold px-2.5 py-1 border rounded transition-colors"
                  :class="binding.contestId === projectSettingsCurrentContestId ? 'text-blue-700 border-blue-200 bg-blue-50' : 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50'"
                  type="button"
                  @click="useBindingAsCurrentContest(binding.contestId, binding.trackId)"
                >
                  {{ binding.contestId === projectSettingsCurrentContestId ? '当前竞赛' : '设为当前' }}
                </button>

                <button
                  class="text-[11px] text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  type="button"
                  :disabled="projectSettingsBindings.length <= 1"
                  @click="removeProjectSettingsBinding(index)"
                >
                  删除
                </button>
              </div>

              <p v-if="projectSettingsBindings.length === 0" class="text-[11px] text-slate-500">
                {{ projectSettingsContestOptions.length > 0 ? '暂无竞赛绑定，请先添加至少一个竞赛并指定赛道。' : '暂无可用竞赛，点击“添加竞赛”可在弹窗中刷新并绑定。' }}
              </p>
            </div>
          </section>

          <section v-if="projectSettingsHasCurrentContest" class="p-4 border border-slate-200 rounded-lg bg-white">
            <h3 class="text-xs text-slate-700 font-semibold mb-3">
              当前竞赛适配稿
              <span class="text-slate-400 font-normal ml-1">
                {{ projectSettingsContestName || projectSettingsCurrentContestId }}
              </span>
            </h3>
            <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
              <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                <span class="block">问题陈述</span>
                <textarea
                  :value="projectSettingsAdaptation.problemStatement"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                  @input="updateProjectSettingsAdaptationField('problemStatement', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <label class="text-xs text-slate-600 block space-y-1">
                <span class="block">创新点（每行一条）</span>
                <textarea
                  :value="projectSettingsAdaptation.innovationPointsText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                  @input="updateProjectSettingsAdaptationField('innovationPointsText', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <label class="text-xs text-slate-600 block space-y-1">
                <span class="block">技术路线（每行一条）</span>
                <textarea
                  :value="projectSettingsAdaptation.techRouteStepsText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                  @input="updateProjectSettingsAdaptationField('techRouteStepsText', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <label class="text-xs text-slate-600 block space-y-1">
                <span class="block">评分映射（每行一条）</span>
                <textarea
                  :value="projectSettingsAdaptation.scoringMappingText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                  @input="updateProjectSettingsAdaptationField('scoringMappingText', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <label class="text-xs text-slate-600 block space-y-1">
                <span class="block">风险项（每行一条）</span>
                <textarea
                  :value="projectSettingsAdaptation.risksText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                  @input="updateProjectSettingsAdaptationField('risksText', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                <span class="block">交付物（每行一条）</span>
                <textarea
                  :value="projectSettingsAdaptation.deliverablesText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                  @input="updateProjectSettingsAdaptationField('deliverablesText', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                <span class="block">摘要</span>
                <textarea
                  :value="projectSettingsAdaptation.summary"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                  @input="updateProjectSettingsAdaptationField('summary', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
            </div>
          </section>

          <section class="p-4 border border-slate-200 rounded-lg bg-white">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-xs text-slate-700 font-semibold">
                分享链接管理
              </h3>
              <span class="text-[11px] text-slate-500">
                共 {{ projectResourceShares.length }} 条
              </span>
            </div>

            <div v-if="projectResourceSharesLoading" class="text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
              正在加载分享链接...
            </div>

            <div v-else-if="projectResourceShares.length === 0" class="text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
              暂无分享链接，可在左侧文件菜单点击“分享链接”创建。
            </div>

            <div v-else class="space-y-2">
              <article
                v-for="share in projectResourceShares"
                :key="share.id"
                class="px-3 py-2 border border-slate-200 rounded"
              >
                <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div class="min-w-0">
                    <p class="text-xs text-slate-700 font-semibold truncate">
                      {{ share.resourceTitle || share.resourceId }}
                    </p>
                    <p class="text-[11px] text-slate-500 mt-1 break-all">
                      {{ share.shareUrl }}
                    </p>
                    <p class="text-[11px] text-slate-500 mt-1">
                      {{ shareVisibilityLabel(share.visibility) }} · {{ share.duration }} · 到期 {{ formatDateTime(share.expiresAt) }}
                    </p>
                  </div>
                  <div class="flex gap-2 items-center">
                    <span
                      class="text-[10px] font-semibold px-2 py-0.5 border rounded-full"
                      :class="shareStatusBadgeClass(share)"
                    >
                      {{ shareStatusLabel(share) }}
                    </span>
                    <button
                      class="text-[11px] font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50"
                      type="button"
                      @click="emit('copyProjectResourceShare', share.id)"
                    >
                      复制链接
                    </button>
                    <button
                      class="text-[11px] text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      type="button"
                      :disabled="getShareStatus(share) === 'revoked'"
                      @click="emit('revokeProjectResourceShare', share.id)"
                    >
                      失效
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </template>
      </div>

      <div v-else-if="activeResourceTab" class="h-full min-h-0 w-full">
        <div class="bg-white flex flex-col h-full min-h-0 overflow-hidden">
          <div class="bg-slate-50 flex-1 min-h-0">
            <template v-if="activePreviewMode === 'markdown'">
              <div class="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                <div class="text-xs text-slate-600">
                  {{ activeResourceTab.title }}
                  <span class="text-slate-400 ml-2">rev {{ Math.max(0, Number(collabRevision || 0)) }}</span>
                </div>
                <div class="text-[11px]" :class="collabConnected ? 'text-emerald-600' : 'text-amber-600'">
                  {{ collabConnectionText }}
                </div>
              </div>
              <div class="grid grid-cols-1 h-full xl:grid-cols-[minmax(0,1fr),220px]">
                <div class="border-b border-slate-200 bg-white min-h-0 xl:border-b-0 xl:border-r">
                  <RichTextEditor
                    :doc="collabMarkdownDoc"
                    :editable="true"
                    placeholder="输入正文或标题，协作文档会实时同步"
                    :heading-levels="[1, 2, 3]"
                  />
                </div>
                <CollabPresencePanel :members="collabPresenceMembers" />
              </div>
            </template>

            <template v-else-if="activePreviewMode === 'draw'">
              <div class="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                <div class="text-xs text-slate-600">
                  {{ activeResourceTab.title }}
                  <span class="text-slate-400 ml-2">rev {{ Math.max(0, Number(collabRevision || 0)) }}</span>
                </div>
                <div class="text-[11px]" :class="collabConnected ? 'text-emerald-600' : 'text-amber-600'">
                  {{ collabConnectionText }}
                </div>
              </div>
              <div class="grid grid-cols-1 h-full md:grid-cols-[1fr,220px]">
                <div class="flex flex-col h-full">
                  <WorkspaceTldrawCanvas
                    :key="props.previewResourceId || activeResourceTab.id"
                    class="h-full min-h-0 w-full"
                    :model-value="collabDrawValue"
                    :persistence-key="`workspace-collab-${props.previewResourceId || activeResourceTab.id}`"
                    :readonly="false"
                    @update:model-value="onCollabDrawModelUpdate"
                  />
                  <p v-if="collabDrawError" class="text-[11px] text-rose-600 px-4 py-2 border-t border-rose-100 bg-rose-50">
                    {{ collabDrawError }}
                  </p>
                </div>
                <CollabPresencePanel :members="collabPresenceMembers" />
              </div>
            </template>

            <template v-else>
              <div v-if="previewStatusLoading && !previewStatus" class="text-sm text-slate-500 flex h-full items-center justify-center">
                正在获取预览状态...
              </div>

              <template v-else-if="previewStatus?.status === 'succeeded'">
                <iframe
                  class="border-0 bg-white h-full w-full"
                  :src="previewPdfUrl"
                  title="资料预览"
                />
              </template>

              <div v-else class="px-6 flex flex-col h-full items-center justify-center">
                <p class="text-base text-slate-700 font-semibold">
                  {{ previewStatus ? previewStatusLabel(previewStatus.status) : '等待预览状态' }}
                </p>
                <p v-if="previewStatus && previewStatus.status !== 'failed'" class="text-sm text-slate-500 mt-2">
                  预计剩余：{{ formatEtaSeconds(previewStatus.etaSeconds) }}
                  <template v-if="previewStatus.queuePosition > 0">
                    （当前队列位置：{{ previewStatus.queuePosition }}）
                  </template>
                </p>
                <p v-if="previewStatus?.error" class="text-xs text-rose-600 mt-2 text-center max-w-2xl">
                  {{ previewErrorMessage(previewStatus.error) }}
                </p>
                <button
                  v-if="previewStatus?.status === 'failed'"
                  class="text-xs text-rose-700 font-semibold mt-4 px-3 py-1.5 border border-rose-200 rounded bg-rose-50 transition-colors hover:bg-rose-100"
                  type="button"
                  @click="emit('reconvertPreview')"
                >
                  重新转换
                </button>

                <div class="mt-5 rounded-full bg-slate-200 h-2 max-w-xl w-full overflow-hidden">
                  <div
                    class="rounded-full h-full transition-all duration-300 ease-out from-blue-600 to-cyan-500 bg-gradient-to-r"
                    :style="{ width: `${Math.max(0, Math.min(100, Number(previewStatus?.progressPercent || 0)))}%` }"
                  />
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-else class="mx-auto max-w-5xl space-y-4">
        <div class="p-6 text-center border border-slate-200 rounded-lg bg-white shadow-sm">
          <div class="text-sm text-slate-700 font-semibold">
            WinLoop
          </div>
          <div class="text-xs text-slate-500 mt-2">
            当前没有打开的标签页，可点击上方“打开仪表盘”继续。
          </div>
        </div>
      </div>
    </div>

    <a-modal
      v-model:visible="workspaceInviteModalVisible"
      title="邀请协作者"
      data-testid="project-invite-modal"
      width="560px"
      :footer="false"
      :esc-to-close="true"
      :mask-closable="true"
    >
      <div class="space-y-3">
        <div class="text-[11px] text-slate-500 p-2 border border-slate-200 rounded bg-slate-50">
          <p class="m-0">
            接受邀请后会先加入当前空间，再加入当前项目。
          </p>
          <p class="m-0 mt-1">
            {{ workspaceInviteProjectLabel }}
          </p>
        </div>

        <template v-if="workspaceCanManageMembers">
          <label class="text-[11px] text-slate-600 block space-y-1">
            <span class="block">邀请用户名（可选）</span>
            <input
              v-model="workspaceInviteForm.inviteeUsername"
              data-testid="project-invite-username-input"
              class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              placeholder="留空时生成通用邀请"
            >
          </label>

          <div class="gap-2 grid grid-cols-2">
            <label class="text-[11px] text-slate-600 block space-y-1">
              <span class="block">项目角色</span>
              <select
                v-model="workspaceInviteForm.role"
                data-testid="project-invite-role-select"
                class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              >
                <option
                  v-for="role in workspaceInviteRoleOptions"
                  :key="`workspace-role-option-${role}`"
                  :value="role"
                >
                  {{ workspaceRoleLabel(role) }}
                </option>
              </select>
            </label>

            <label class="text-[11px] text-slate-600 block space-y-1">
              <span class="block">有效期</span>
              <select
                v-model.number="workspaceInviteForm.expiresInDays"
                data-testid="project-invite-expiry-select"
                class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              >
                <option :value="1">
                  1 天
                </option>
                <option :value="3">
                  3 天
                </option>
                <option :value="7">
                  7 天
                </option>
                <option :value="14">
                  14 天
                </option>
                <option :value="30">
                  30 天
                </option>
              </select>
            </label>
          </div>

          <div v-if="workspaceInvitationLink" class="text-[11px] text-slate-600 px-2.5 py-2 border border-slate-200 rounded bg-slate-50">
            <p class="text-slate-700 font-semibold">
              最新邀请链接
            </p>
            <p class="mt-1 break-all" data-testid="project-invite-link">
              {{ workspaceInvitationLink }}
            </p>
            <button
              data-testid="project-invite-copy-link-button"
              class="text-[11px] font-semibold mt-2 px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50"
              type="button"
              @click="emit('copyWorkspaceInvitationLink')"
            >
              复制邀请链接
            </button>
          </div>

          <div class="flex gap-2 justify-end">
            <a-button size="small" @click="closeWorkspaceInviteModal">
              关闭
            </a-button>
            <a-button
              size="small"
              type="primary"
              data-testid="project-invite-submit-button"
              :loading="workspaceInvitationSubmitting"
              :disabled="!canSubmitWorkspaceInvitation"
              @click="submitWorkspaceInvitation"
            >
              生成邀请链接
            </a-button>
          </div>
        </template>

        <template v-else>
          <p class="text-[11px] text-amber-700 px-2.5 py-2 border border-amber-200 rounded bg-amber-50">
            {{ workspaceInviteUnavailableMessage }}
          </p>
          <div class="flex justify-end">
            <a-button size="small" @click="closeWorkspaceInviteModal">
              关闭
            </a-button>
          </div>
        </template>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="workspaceSeatModalVisible"
      title="调整项目席位"
      width="560px"
      :footer="false"
    >
      <div class="text-[11px] space-y-3">
        <div class="p-2 border border-slate-200 rounded bg-slate-50">
          <p class="text-[11px] text-slate-800 font-semibold m-0">
            当前项目席位
          </p>
          <p class="text-[12px] text-slate-700 m-0 mt-1">
            {{ normalizedWorkspaceSeatUsed }} / {{ normalizedWorkspaceSeatLimit ?? '--' }}
          </p>
          <p class="text-[11px] text-slate-500 m-0 mt-1">
            {{ workspaceSeatSummaryText }}
          </p>
        </div>

        <label class="text-[11px] text-slate-600 block space-y-1">
          <span class="block">目标席位上限</span>
          <a-input-number
            v-model="workspaceSeatLimitDraft"
            :min="1"
            :max="15"
            :step="1"
            :precision="0"
            size="small"
            class="w-full"
            placeholder="输入新的项目席位上限"
          />
        </label>

        <p v-if="workspaceSeatDraftTooSmall" class="text-amber-700 p-2 border border-amber-200 rounded bg-amber-50">
          项目席位上限不能小于当前已使用席位（{{ normalizedWorkspaceSeatUsed }}）。
        </p>

        <p v-if="workspaceSeatDraftTooLarge" class="text-amber-700 p-2 border border-amber-200 rounded bg-amber-50">
          每个项目最多支持 15 个协作席位。
        </p>

        <p v-if="workspaceSeatLimitError" class="text-rose-600 p-2 border border-rose-200 rounded bg-rose-50">
          {{ workspaceSeatLimitError }}
        </p>

        <div class="flex gap-2 justify-end">
          <a-button size="small" @click="closeWorkspaceSeatModal">
            取消
          </a-button>
          <a-button
            size="small"
            type="primary"
            :loading="workspaceSeatLimitSaveLoading"
            :disabled="!canSubmitWorkspaceSeatLimit"
            @click="submitWorkspaceSeatLimit"
          >
            保存席位
          </a-button>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="projectSettingsAddContestModalVisible"
      title="添加竞赛绑定"
      width="520px"
      :footer="false"
      :esc-to-close="true"
      :mask-closable="true"
    >
      <div class="space-y-3">
        <p class="text-xs text-slate-500">
          先选择竞赛和赛道，再确认添加到当前项目绑定列表。
        </p>

        <template v-if="projectSettingsContestOptions.length === 0">
          <a-alert type="warning">
            当前暂无可用竞赛，请先刷新竞赛列表。
          </a-alert>
          <div class="flex gap-2 justify-end">
            <a-button
              size="small"
              @click="projectSettingsAddContestModalVisible = false"
            >
              关闭
            </a-button>
            <a-button
              size="small"
              type="outline"
              @click="openContestCatalogPage"
            >
              查看竞赛列表
            </a-button>
            <a-button
              size="small"
              type="primary"
              @click="requestProjectSettingsContestReload"
            >
              刷新竞赛列表
            </a-button>
          </div>
        </template>

        <template v-else-if="projectSettingsAddContestCandidates.length === 0">
          <a-alert type="info">
            当前可用竞赛都已完成绑定，无需重复添加。
          </a-alert>
          <div class="flex justify-end">
            <a-button
              size="small"
              @click="projectSettingsAddContestModalVisible = false"
            >
              知道了
            </a-button>
          </div>
        </template>

        <template v-else>
          <label class="text-xs text-slate-600 block">
            <span class="mb-1 block">竞赛</span>
            <a-select
              v-model="projectSettingsAddContestModalContestId"
              class="w-full"
              size="small"
              placeholder="请选择竞赛"
            >
              <a-option v-for="contest in projectSettingsAddContestCandidates" :key="contest.id" :value="contest.id">
                {{ contest.name }}
              </a-option>
            </a-select>
          </label>

          <label class="text-xs text-slate-600 block">
            <span class="mb-1 block">赛道</span>
            <a-select
              v-model="projectSettingsAddContestModalTrackId"
              class="w-full"
              size="small"
              placeholder="请选择赛道"
            >
              <a-option v-for="track in projectSettingsAddContestModalTrackOptions" :key="track.id" :value="track.id">
                {{ track.name }}
              </a-option>
            </a-select>
          </label>

          <div class="flex gap-2 justify-end">
            <a-button
              size="small"
              @click="projectSettingsAddContestModalVisible = false"
            >
              取消
            </a-button>
            <a-button
              size="small"
              type="primary"
              :disabled="!projectSettingsAddContestModalContestId || !projectSettingsAddContestModalTrackId"
              @click="confirmProjectSettingsAddContestModal"
            >
              确认添加
            </a-button>
          </div>
        </template>
      </div>
    </a-modal>
  </section>
</template>

<style scoped>
.workspace-tab-context-menu {
  position: fixed;
  z-index: 40;
  min-width: 168px;
  overflow: hidden;
  border: 1px solid #d9e1ef;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.16);
}

.workspace-tab-context-menu__item {
  width: 100%;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  color: #334155;
  font-size: 12px;
  text-align: left;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.workspace-tab-context-menu__item:hover:enabled {
  background: #f8fafc;
  color: #0f172a;
}

.workspace-tab-context-menu__item:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

.workspace-tab-context-menu__item--danger {
  color: #dc2626;
}

.workspace-tab-context-menu__item--danger:hover:enabled {
  background: #fff1f2;
  color: #b91c1c;
}
</style>
