<script setup lang="ts">
import type { Awareness } from 'y-protocols/awareness'
import type { Doc as YDoc } from 'yjs'
import type {
  AiWorkspaceDocumentAction,
  AiWorkspaceDocumentDraft,
  AiWorkspaceInlineCompletionAcceptResult,
  AiWorkspaceInlineCompletionResult,
  CollabPurpose,
  Contest,
  DefenseRealtimeMediaMode,
  DefenseRealtimeProvider,
  DefenseRealtimeRuntimeOptions,
  DefenseRealtimeSessionMeta,
  Project,
  ProjectInvitationSummary,
  ProjectKnowledgeIndexDashboard,
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingGuestShare,
  ProjectMeetingMode,
  ProjectMeetingRuntimeHealth,
  ProjectMeetingUtterance,
  ProjectMemberRole,
  ProjectMemberSummary,
  ProjectResourceCommentAnchor,
  ProjectResourceCommentImageNodeAnchor,
  ProjectResourceCommentTextSelectionAnchor,
  ProjectResourceCommentThread,
  ProjectResourceShare,
  Resource,
  ResourcePreviewStatus,
  Track,
  WorkspaceDisplayPreferenceSnapshot,
  WorkspaceFontSizePreset,
  WorkspaceMeetingCreateTabId,
  WorkspaceOpenTabState,
  WorkspaceTabSpacingPreset,
  WorkspaceType,
} from '~~/shared/types/domain'
import type { WorkspaceCollabAwarenessSelectionState, WorkspaceCollabCursorUser, WorkspaceCollabPresenceMember, WorkspaceCollabPresenceUser, WorkspaceCollabSelectionSummary } from '~/components/workspace/collab/presence'
import type {
  NullableWorkspaceFontSizePreset,
  NullableWorkspaceTabSpacingPreset,
  WorkspaceDisplayPreferencePatchPayload,
} from '~/composables/useWorkspaceDisplayPreferences'
import type {
  WorkspaceMainTab,
} from '~/composables/useWorkspaceMainTabs'
import type { WorkspacePreviewMode } from '~/composables/useWorkspaceProjectResources'
import type { WorkspaceMainTabId } from '~/composables/useWorkspaceProjectShell'
import type { ContextMenuItem, ContextMenuRequest } from '~/types/ui-context-menu'
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
import type { CollabMarkdownHeadingAnchorItem } from '~/utils/collab-markdown-navigation'
import type { WorkspaceOutlineNode } from '~/utils/workspace-outline'
import { resolveCollabResourceDisplayLabel } from '~~/shared/utils/collab-resource'
import { resolveWorkspaceTabDensityTokens } from '~~/shared/utils/workspace-tab-layout'
import {
  normalizeWorkspaceCollabPresenceActivityState,
  resolveWorkspaceCollabPresenceColor,
} from '~/components/workspace/collab/presence'
import {
  defaultWorkspaceDisplayPreferenceSnapshot,
  normalizeWorkspaceFontSizeDraft,
  normalizeWorkspaceTabSpacingDraft,
  resolveWorkspaceDisplayPreferenceSourceLabel,
  resolveWorkspaceFontSizePresetLabel,
  resolveWorkspaceTabSpacingPresetLabel,
  WORKSPACE_FONT_SIZE_PRESET_OPTIONS,
  WORKSPACE_TAB_SPACING_PRESET_OPTIONS,
} from '~/composables/useWorkspaceDisplayPreferences'
import {
  useWorkspaceMainTabs,
} from '~/composables/useWorkspaceMainTabs'
import {
  isDeviceArrangementResource,
  resolveCollabPurpose,
  resolveCollabResourceLabel,
} from '~/utils/workspace-left-sidebar-helpers'
import {
  formatWorkspaceDateTime as formatDateTime,
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
  activeTabId?: WorkspaceOpenTabState | ''
  openTabs?: WorkspaceOpenTabState[]
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
  openLoopyDataSignal?: number
  openMemberManagementSignal?: number
  openDisplayPreferencesSignal?: number
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
  collabPreviewLoading?: boolean
  collabPreviewError?: string
  currentUserId?: string
  currentUserName?: string
  currentUserAvatarUrl?: string
  isPlatformAdminUser?: boolean
  collabResourceId?: string
  collabMarkdownDoc?: YDoc | null
  collabMarkdownAwareness?: Awareness | null
  collabDrawValue?: string
  collabDrawError?: string
  collabRevision?: number
  collabConnected?: boolean
  collabStatusText?: string
  collabPresenceMembers?: WorkspaceCollabPresenceMember[]
  inlineCompletionEnabled?: boolean
  inlineCompletionRequestHandler?: ((payload: {
    requestKey: string
    selectionRange: {
      anchorLine: number
      anchorColumn: number
      headLine: number
      headColumn: number
      isCollapsed: boolean
      selectionLength: number
    }
    signal?: AbortSignal
  }) => Promise<AiWorkspaceInlineCompletionResult | null>) | null
  inlineCompletionAcceptHandler?: ((payload: {
    requestKey: string
    suggestion: string
    selectionRange: {
      anchorLine: number
      anchorColumn: number
      headLine: number
      headColumn: number
      isCollapsed: boolean
      selectionLength: number
    }
  }) => Promise<AiWorkspaceInlineCompletionAcceptResult | null>) | null
  markdownImageUploadHandler?: ((file: File) => Promise<{ src: string, alt?: string, title?: string, resourceId?: string }>) | null
  imageUploadHandler?: ((file: File) => Promise<{ src: string, alt?: string, title?: string, resourceId?: string }>) | null
  commentThreads?: ProjectResourceCommentThread[]
  activeCommentThreadId?: string
  commentDraftAnchor?: ProjectResourceCommentAnchor | null
  commentLoading?: boolean
  commentMutating?: boolean
  mappingRows?: WorkspaceMappingRow[]
  mappingLoading?: boolean
  mappingRefreshing?: boolean
  keywordCloud?: WorkspaceKeyword[]
  trendBars?: number[]
  formState?: WorkspaceFormState
  formSubmitting?: boolean
  workspacePreparing?: boolean
  topicBoardFetching?: boolean
  activeProject?: Project | null
  activeProjectId?: string
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
  workspaceInvitationError?: string
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
  projectKnowledgeDashboard?: ProjectKnowledgeIndexDashboard | null
  projectKnowledgeLoading?: boolean
  projectKnowledgeError?: string
  projectKnowledgeReindexingTarget?: '' | 'all' | 'stale' | 'failed'
  projectKnowledgeRetryingSourceId?: string
  workspaceDisplayPreferences?: WorkspaceDisplayPreferenceSnapshot
  workspaceDisplayPreferencesLoading?: boolean
  workspaceDisplayPreferencesSavingScope?: '' | 'user' | 'team'
  workspaceDisplayPreferencesError?: string
  projectResourceShares?: ProjectResourceShare[]
  projectResourceSharesLoading?: boolean
  meetings?: ProjectMeeting[]
  activeMeetingId?: string
  activeMeeting?: ProjectMeetingDetail | null
  meetingUtterances?: ProjectMeetingUtterance[]
  meetingLiveCaptions?: WorkspaceMeetingCaptionItem[]
  meetingLoading?: boolean
  meetingDetailLoading?: boolean
  meetingRefreshing?: boolean
  meetingDetailRefreshing?: boolean
  meetingMutating?: boolean
  meetingJoinUrl?: string
  meetingJoinToken?: string
  meetingJoinExpiresAt?: string
  meetingRtcServerUrl?: string
  activeMeetingGuestShare?: ProjectMeetingGuestShare | null
  meetingGuestShareLoading?: boolean
  meetingPlanTier?: 'personal_team' | 'business_team' | null
  meetingRuntimeHealth?: ProjectMeetingRuntimeHealth | null
  defenseRealtimeState?: DefenseRealtimeSessionMeta | null
  defenseRealtimeOptions?: DefenseRealtimeRuntimeOptions | null
  defenseRealtimeLogs?: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    createdAt: string
  }>
  toneMeta: Record<MappingTone, WorkspaceStatusToneMeta>
}>(), {
  activeTabId: '',
  openTabs: () => [],
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
  openLoopyDataSignal: 0,
  openMemberManagementSignal: 0,
  openDisplayPreferencesSignal: 0,
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
  collabPreviewLoading: false,
  collabPreviewError: '',
  currentUserId: '',
  currentUserName: '',
  currentUserAvatarUrl: '',
  isPlatformAdminUser: false,
  collabResourceId: '',
  collabMarkdownDoc: null,
  collabMarkdownAwareness: null,
  collabDrawValue: '{}',
  collabDrawError: '',
  collabRevision: 0,
  collabConnected: false,
  collabStatusText: '',
  collabPresenceMembers: () => [],
  inlineCompletionEnabled: false,
  inlineCompletionRequestHandler: null,
  inlineCompletionAcceptHandler: null,
  markdownImageUploadHandler: null,
  imageUploadHandler: null,
  commentThreads: () => [],
  activeCommentThreadId: '',
  commentDraftAnchor: null,
  commentLoading: false,
  commentMutating: false,
  mappingRows: () => [],
  mappingLoading: false,
  mappingRefreshing: false,
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
  workspacePreparing: false,
  topicBoardFetching: false,
  activeProject: null,
  activeProjectId: '',
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
  workspaceInvitationError: '',
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
  projectKnowledgeDashboard: null,
  projectKnowledgeLoading: false,
  projectKnowledgeError: '',
  projectKnowledgeReindexingTarget: '',
  projectKnowledgeRetryingSourceId: '',
  workspaceDisplayPreferences: () => defaultWorkspaceDisplayPreferenceSnapshot(),
  workspaceDisplayPreferencesLoading: false,
  workspaceDisplayPreferencesSavingScope: '',
  workspaceDisplayPreferencesError: '',
  projectResourceShares: () => [],
  projectResourceSharesLoading: false,
  meetings: () => [],
  activeMeetingId: '',
  activeMeeting: null,
  meetingUtterances: () => [],
  meetingLiveCaptions: () => [],
  meetingLoading: false,
  meetingDetailLoading: false,
  meetingRefreshing: false,
  meetingDetailRefreshing: false,
  meetingMutating: false,
  meetingJoinUrl: '',
  meetingJoinToken: '',
  meetingJoinExpiresAt: '',
  meetingRtcServerUrl: '',
  activeMeetingGuestShare: null,
  meetingGuestShareLoading: false,
  meetingPlanTier: null,
  meetingRuntimeHealth: null,
  defenseRealtimeState: null,
  defenseRealtimeOptions: null,
  defenseRealtimeLogs: () => [],
})

const emit = defineEmits<{
  'update:activeTabId': [value: WorkspaceMainTabId | '']
  'update:openTabs': [value: WorkspaceMainTabId[]]
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
  'reloadProjectKnowledge': []
  'reindexProjectKnowledge': [target: 'all' | 'stale' | 'failed']
  'reindexProjectKnowledgeSource': [resourceId: string]
  'saveWorkspaceDisplayUserOverride': [value: WorkspaceDisplayPreferencePatchPayload]
  'saveWorkspaceDisplayTeamDefault': [value: WorkspaceDisplayPreferencePatchPayload]
  'reloadWorkspaceMemberManagement': []
  'createWorkspaceInvitation': [value: { inviteeUsername: string, projectRole: ProjectMemberRole, expiresInDays: number }]
  'patchWorkspaceMemberRole': [value: { userId: string, role: 'manager' | 'editor' | 'viewer' }]
  'removeWorkspaceMember': [userId: string]
  'revokeWorkspaceInvitation': [invitationId: string]
  'copyWorkspaceInvitationLink': []
  'prepareWorkspaceInvitation': []
  'openWorkspaceSeatModal': []
  'saveWorkspaceSeatLimit': [seatLimit: number]
  'copyProjectResourceShare': [shareId: string]
  'revokeProjectResourceShare': [shareId: string]
  'createMeeting': [value: { mode: ProjectMeetingMode }]
  'quickCreateMeeting': [value: WorkspaceMeetingCreatePayload]
  'submitMeetingCreate': [value: WorkspaceMeetingCreatePayload]
  'refreshMeetings': []
  'joinMeeting': [meetingId: string]
  'startMeeting': [meetingId: string]
  'endMeeting': [meetingId: string]
  'createMeetingGuestShare': [meetingId: string]
  'regenerateMeetingGuestShare': [meetingId: string]
  'revokeMeetingGuestShare': [meetingId: string]
  'selectMeeting': [meetingId: string]
  'openMeetingResource': [resourceId: string]
  'startDefenseRealtimeSidecar': []
  'updateDefenseRealtimeProvider': [provider: DefenseRealtimeProvider]
  'updateDefenseRealtimeMediaMode': [mode: DefenseRealtimeMediaMode]
  'toggleDefenseRealtimeAudio': [enabled: boolean]
  'toggleDefenseRealtimeVideo': [enabled: boolean]
  'interruptDefenseRealtime': []
  'reconnectDefenseRealtime': []
  'openResource': [resourceId: string]
  'loadContests': []
  'reconvertPreview': []
  'downloadPreviewSource': []
  'activatePreviewResource': [resourceId: string]
  'closePreviewResource': [resourceId: string]
  'update:collabDrawValue': [value: string]
  'requestWorkflowCanvasRebuild': []
  'updateCollabCursor': [value: { cursorX?: number, cursorY?: number }]
  'updateCollabSelectionStatus': [value: { line: number, column: number, selectionLength: number, selection: WorkspaceCollabSelectionSummary | null }]
  'markdownPrimaryHeadingChange': [value: string]
  'markdownOutlineChange': [value: CollabMarkdownHeadingAnchorItem[]]
  'markdownCreateCommentFromSelection': [value: ProjectResourceCommentTextSelectionAnchor]
  'markdownCreateCommentFromImage': [value: ProjectResourceCommentImageNodeAnchor]
  'markdownOpenCommentThread': [threadId: string]
  'markdownRequestImageAction': [value: {
    resourceId?: string | null
    src: string
    mode: 'open_resource' | 'delete_node' | 'delete_and_recycle'
  }]
  'markdownCancelCommentDraft': []
  'markdownReplyCommentThread': [value: { threadId: string, body: string }]
  'markdownResolveCommentThread': [threadId: string]
  'markdownReopenCommentThread': [threadId: string]
  'markdownCreateCommentThread': [body: string]
  'requestContextMenu': [payload: ContextMenuRequest]
}>()

type WorkspaceMeetingTabId = `meeting:${string}`
type WorkspaceResourceTabId = `resource:${string}`

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

interface WorkspaceMeetingCaptionItem {
  id: string
  text: string
  speakerName: string
  speakerLabel: string
  startedAtMs: number
  endedAtMs: number
  final: boolean
}

interface WorkspaceMeetingCreatePayload {
  mode: ProjectMeetingMode
  title?: string
  invitedUserIds: string[]
  scheduledStartAt: string
  scheduledEndAt: string
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
    id: 'meeting',
    kind: 'fixed',
    title: '项目会议',
    icon: 'video_call',
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
  {
    id: 'loopy_data',
    kind: 'fixed',
    title: 'Loopy 数据',
    icon: 'database',
    closeable: true,
  },
]

type WorkspaceSettingsSecondaryTabId = 'project' | 'myDisplay' | 'teamDefault'
type WorkspaceSettingsGroupId = 'workspace' | 'personal'
type WorkspaceSettingsSectionId = 'projectOverview'
  | 'contestBindings'
  | 'contestAdaptation'
  | 'resourceShares'
  | 'teamDefault'
  | 'displayPreferences'
type WorkspaceProjectPanelSectionId = 'projectOverview'
  | 'contestBindings'
  | 'contestAdaptation'
  | 'resourceShares'

interface WorkspaceSettingsGroupItem {
  id: WorkspaceSettingsGroupId
  label: string
  description: string
}

interface WorkspaceSettingsSectionItem {
  id: WorkspaceSettingsSectionId
  groupId: WorkspaceSettingsGroupId
  domId: string
  label: string
  icon: string
  description: string
  legacyTabId?: WorkspaceSettingsSecondaryTabId
  testId: string
}

const workspaceSettingsGroups: WorkspaceSettingsGroupItem[] = [
  { id: 'workspace', label: 'Workspace', description: '项目底座、共享配置与团队默认统一在这里维护。' },
  { id: 'personal', label: 'Personal', description: '只影响当前工作区的个人显示偏好。' },
]
const workspaceSettingsSections: WorkspaceSettingsSectionItem[] = [
  {
    id: 'projectOverview',
    groupId: 'workspace',
    domId: 'workspace-settings-section-project-overview',
    label: '项目基础信息',
    icon: 'settings',
    description: '维护项目标题、摘要、标识与基础陈述。',
    legacyTabId: 'project',
    testId: 'workspace-settings-nav-project-overview',
  },
  {
    id: 'contestBindings',
    groupId: 'workspace',
    domId: 'workspace-settings-section-contest-bindings',
    label: '竞赛与赛道绑定',
    icon: 'trophy',
    description: '整理项目参与的竞赛与赛道，并指定当前竞赛。',
    testId: 'workspace-settings-nav-contest-bindings',
  },
  {
    id: 'contestAdaptation',
    groupId: 'workspace',
    domId: 'workspace-settings-section-contest-adaptation',
    label: '当前竞赛适配稿',
    icon: 'task',
    description: '围绕当前竞赛补齐终审与答辩底稿。',
    testId: 'workspace-settings-nav-contest-adaptation',
  },
  {
    id: 'resourceShares',
    groupId: 'workspace',
    domId: 'workspace-settings-section-resource-shares',
    label: '资源共享',
    icon: 'share',
    description: '集中查看分享链接状态与资源分发情况。',
    testId: 'workspace-settings-nav-resource-shares',
  },
  {
    id: 'teamDefault',
    groupId: 'workspace',
    domId: 'workspace-settings-section-team-default',
    label: '团队默认显示偏好',
    icon: 'groups',
    description: '配置新成员进入当前工作区时的默认显示方案。',
    legacyTabId: 'teamDefault',
    testId: 'workspace-settings-nav-team-default',
  },
  {
    id: 'displayPreferences',
    groupId: 'personal',
    domId: 'workspace-settings-section-display-preferences',
    label: '显示偏好',
    icon: 'tune',
    description: '为当前工作区保存个人字号与标签边距偏好。',
    legacyTabId: 'myDisplay',
    testId: 'workspace-settings-nav-display-preferences',
  },
]
const WORKSPACE_SETTINGS_SECONDARY_TAB_TEST_IDS: Record<WorkspaceSettingsSecondaryTabId, string> = {
  project: 'workspace-settings-tab-project',
  myDisplay: 'workspace-settings-tab-myDisplay',
  teamDefault: 'workspace-settings-tab-teamDefault',
}
const WORKSPACE_SETTINGS_GROUP_TEST_IDS: Record<WorkspaceSettingsGroupId, string> = {
  workspace: 'workspace-settings-group-workspace',
  personal: 'workspace-settings-group-personal',
}
const settingsPrimaryGroup = ref<WorkspaceSettingsGroupId>('workspace')
const settingsActiveSectionId = ref<WorkspaceSettingsSectionId>('projectOverview')
const workspaceMainBodyRef = ref<HTMLElement | null>(null)
const WORKSPACE_FONT_SIZE_PRESET_ORDER: WorkspaceFontSizePreset[] = WORKSPACE_FONT_SIZE_PRESET_OPTIONS.map(item => item.value)
const WORKSPACE_TAB_SPACING_PRESET_ORDER: WorkspaceTabSpacingPreset[] = WORKSPACE_TAB_SPACING_PRESET_OPTIONS.map(item => item.value)
const userWorkspaceDisplayFontSizeDraft = ref<NullableWorkspaceFontSizePreset>('')
const userWorkspaceDisplayTabSpacingDraft = ref<NullableWorkspaceTabSpacingPreset>('')
const teamWorkspaceDisplayFontSizeDraft = ref<NullableWorkspaceFontSizePreset>('')
const teamWorkspaceDisplayTabSpacingDraft = ref<NullableWorkspaceTabSpacingPreset>('')
const workspaceDisplayFontSizeSelectOptions = computed(() => [
  { value: '', label: '跟随系统默认' },
  ...WORKSPACE_FONT_SIZE_PRESET_OPTIONS.map(option => ({
    value: option.value,
    label: option.label,
  })),
])
const workspaceDisplayTabSpacingSelectOptions = computed(() => [
  { value: '', label: '跟随系统默认' },
  ...WORKSPACE_TAB_SPACING_PRESET_OPTIONS.map(option => ({
    value: option.value,
    label: option.label,
  })),
])

function migrateLegacyTabIdFromProps(tabId: WorkspaceMainTabId | '' | undefined): WorkspaceMainTabId | '' {
  const normalizedTabId = String(tabId || '').trim()
  if (!normalizedTabId)
    return ''
  return normalizedTabId as WorkspaceMainTabId
}

function migrateLegacyOpenTabsFromProps(tabIds: WorkspaceMainTabId[] | undefined): WorkspaceMainTabId[] {
  const nextTabIds: WorkspaceMainTabId[] = []
  const used = new Set<string>()

  for (const item of tabIds || []) {
    const normalizedTabId = String(item || '').trim()
    if (!normalizedTabId)
      continue
    const migratedTabId = normalizedTabId
    if (!migratedTabId || used.has(migratedTabId))
      continue
    nextTabIds.push(migratedTabId as WorkspaceMainTabId)
    used.add(migratedTabId)
  }

  return nextTabIds
}

const migratedPropOpenTabs = computed<WorkspaceMainTabId[]>(() => {
  return migrateLegacyOpenTabsFromProps(props.openTabs)
})

const migratedPropActiveTabId = computed<WorkspaceMainTabId | ''>(() => {
  const migratedActiveTabId = migrateLegacyTabIdFromProps(props.activeTabId)
  if (migratedActiveTabId)
    return migratedActiveTabId
  return migratedPropOpenTabs.value[0] || ''
})
const resourcePreviewTabRef = ref<{
  applyDocumentDraft: (payload: AiWorkspaceDocumentDraft) => boolean
  applyDocumentAssistResult: (payload: { action: AiWorkspaceDocumentAction, text: string }) => boolean
  openSearch: () => boolean
  scrollToCommentThread: (threadId: string) => void
  scrollToHeadingAnchor: (anchorId: string) => boolean
} | null>(null)
const designPanelRef = ref<{
  locateOutlineItem: (node: WorkspaceOutlineNode) => boolean
} | null>(null)
const flowTabRef = ref<{
  locateOutlineItem: (node: WorkspaceOutlineNode) => boolean
} | null>(null)

const {
  openTabs,
  activeTabId,
  hasOpenTabs,
  draggingTabId: _draggingTabId,
  dragOverTabId,
  tabContextMenuVisible,
  tabContextMenuPosition,
  tabContextMenuTab,
  tabContextMenuLeftIds,
  tabContextMenuRightIds,
  ensureFixedTabOpen,
  ensurePreviewTabOpen,
  closeTabContextMenu,
  activateTab,
  closeTab,
  closeResourceTabByResourceId,
  closeTabsToLeft,
  closeTabsToRight,
  closeOtherTabs,
  closeAllTabs,
  openTabContextMenu,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
  onTabDragEnd,
} = useWorkspaceMainTabs({
  fixedTabs,
  propOpenTabs: () => migratedPropOpenTabs.value,
  propActiveTabId: () => migratedPropActiveTabId.value,
  previewResourceId: () => String(props.previewResourceId || '').trim(),
  resolveTabFromId,
  resolvePreviewTab: previewTabFromProps,
  onActivateResource: emitActivatePreviewResource,
  onClosePreviewResource: resourceId => emit('closePreviewResource', resourceId),
  emitUpdateOpenTabs: tabIds => emit('update:openTabs', tabIds),
  emitUpdateActiveTabId: tabId => emit('update:activeTabId', tabId),
})

const markdownImageUploadHandler = computed(() => props.markdownImageUploadHandler || props.imageUploadHandler)
const visibleWorkspaceSettingsSections = computed<WorkspaceSettingsSectionItem[]>(() => {
  return workspaceSettingsSections.filter((item) => {
    if (item.id === 'teamDefault')
      return props.workspaceDisplayPreferences.canManageTeamDefault
    return true
  })
})
const workspaceSettingsSectionsByGroup = computed<Record<WorkspaceSettingsGroupId, WorkspaceSettingsSectionItem[]>>(() => {
  return {
    workspace: visibleWorkspaceSettingsSections.value.filter(item => item.groupId === 'workspace'),
    personal: visibleWorkspaceSettingsSections.value.filter(item => item.groupId === 'personal'),
  }
})
const activeWorkspaceSettingsGroup = computed<WorkspaceSettingsGroupItem | null>(() => {
  return workspaceSettingsGroups.find(item => item.id === settingsPrimaryGroup.value) || null
})
const activeWorkspaceSettingsSection = computed<WorkspaceSettingsSectionItem | null>(() => {
  return visibleWorkspaceSettingsSections.value.find(item => item.id === settingsActiveSectionId.value) || visibleWorkspaceSettingsSections.value[0] || null
})
const activeWorkspaceProjectSectionId = computed<WorkspaceProjectPanelSectionId | ''>(() => {
  const activeSectionId = settingsActiveSectionId.value
  if (activeSectionId === 'displayPreferences' || activeSectionId === 'teamDefault')
    return ''
  return activeSectionId
})
const isDisplayPreferencesSectionActive = computed(() => settingsActiveSectionId.value === 'displayPreferences')
const isTeamDefaultSectionActive = computed(() => settingsActiveSectionId.value === 'teamDefault')
const recommendedWorkspaceDisplayTagText = computed(() => {
  return '研发工作台推荐'
})
const workspaceMainTabLayoutStyle = computed<Record<string, string | undefined>>(() => {
  const density = resolveWorkspaceTabDensityTokens(props.workspaceDisplayPreferences.effective.tabSpacingPreset || 'relaxed')
  return {
    '--workspace-main-tab-min-width': density.minWidth,
    '--workspace-main-tab-padding-x': density.paddingX,
    '--workspace-main-tab-gap': density.gap,
    '--workspace-main-tab-trigger-gap': density.triggerGap,
    '--workspace-main-tab-close-padding': density.closePadding,
    '--workspace-main-tab-close-button-size': density.closeButtonSize,
    '--workspace-main-tab-active-indicator-inset': density.activeIndicatorInset,
    '--workspace-main-tab-strip-height': density.stripHeight,
    '--workspace-main-tab-label-size': density.labelSize,
    '--workspace-main-tab-icon-size': density.iconSize,
    '--workspace-main-tab-close-icon-size': density.closeIconSize,
    '--workspace-main-breadcrumb-padding-x': density.breadcrumbPaddingX,
    '--workspace-main-breadcrumb-padding-y': density.breadcrumbPaddingY,
  }
})

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

function findWorkspaceSettingsSection(sectionId: WorkspaceSettingsSectionId): WorkspaceSettingsSectionItem | null {
  return visibleWorkspaceSettingsSections.value.find(item => item.id === sectionId) || null
}

function resolveWorkspaceSettingsDefaultSection(groupId: WorkspaceSettingsGroupId): WorkspaceSettingsSectionId {
  return workspaceSettingsSectionsByGroup.value[groupId][0]?.id || visibleWorkspaceSettingsSections.value[0]?.id || 'projectOverview'
}

function syncWorkspaceSettingsSectionFromScroll(): void {
  // Settings now uses explicit sidebar navigation instead of scroll spy syncing.
}

function scrollToWorkspaceSettingsSection(
  _sectionId: WorkspaceSettingsSectionId,
  behavior: ScrollBehavior = 'smooth',
): void {
  if (!import.meta.client || activeTabId.value !== 'settings')
    return

  const container = workspaceMainBodyRef.value
  if (!container)
    return

  container.scrollTo({
    top: 0,
    behavior,
  })
}

function activateWorkspaceSettingsSection(
  sectionId: WorkspaceSettingsSectionId,
  options: { behavior?: ScrollBehavior } = {},
): void {
  const nextSection = findWorkspaceSettingsSection(sectionId)
  if (!nextSection)
    return

  settingsActiveSectionId.value = nextSection.id
  settingsPrimaryGroup.value = nextSection.groupId

  void nextTick(() => {
    scrollToWorkspaceSettingsSection(nextSection.id, options.behavior || 'smooth')
    syncWorkspaceSettingsSectionFromScroll()
  })
}

function onWorkspaceMainBodyScroll(): void {
  // Settings panels switch via navbar selection, so scroll no longer drives active state.
}

function normalizeWorkspaceTabSpacingSliderIndex(value: WorkspaceTabSpacingPreset | null | undefined): number {
  const matchedIndex = WORKSPACE_TAB_SPACING_PRESET_ORDER.findIndex(item => item === value)
  return matchedIndex >= 0 ? matchedIndex : Math.max(0, WORKSPACE_TAB_SPACING_PRESET_ORDER.indexOf('relaxed'))
}

function normalizeWorkspaceFontSizeSliderIndex(value: WorkspaceFontSizePreset | null | undefined): number {
  const matchedIndex = WORKSPACE_FONT_SIZE_PRESET_ORDER.findIndex(item => item === value)
  return matchedIndex >= 0 ? matchedIndex : Math.max(0, WORKSPACE_FONT_SIZE_PRESET_ORDER.indexOf('lg'))
}

function applyWorkspaceDisplayPreferenceDrafts(snapshot: WorkspaceDisplayPreferenceSnapshot): void {
  userWorkspaceDisplayFontSizeDraft.value = normalizeWorkspaceFontSizeDraft(snapshot.workspaceOverride?.fontSizePreset)
  userWorkspaceDisplayTabSpacingDraft.value = normalizeWorkspaceTabSpacingDraft(snapshot.workspaceOverride?.tabSpacingPreset)
  teamWorkspaceDisplayFontSizeDraft.value = normalizeWorkspaceFontSizeDraft(snapshot.teamDefault?.fontSizePreset)
  teamWorkspaceDisplayTabSpacingDraft.value = normalizeWorkspaceTabSpacingDraft(snapshot.teamDefault?.tabSpacingPreset)
}

const workspaceDisplayRecommendedFontSizePreset = computed<WorkspaceFontSizePreset>(() => {
  if (props.workspaceDisplayPreferences.userDefault?.fontSizePreset)
    return props.workspaceDisplayPreferences.userDefault.fontSizePreset
  if (props.workspaceType === 'team' && props.workspaceDisplayPreferences.teamDefault?.fontSizePreset)
    return props.workspaceDisplayPreferences.teamDefault.fontSizePreset
  return 'lg'
})

const workspaceDisplayRecommendedTabSpacingPreset = computed<WorkspaceTabSpacingPreset>(() => {
  if (props.workspaceDisplayPreferences.userDefault?.tabSpacingPreset)
    return props.workspaceDisplayPreferences.userDefault.tabSpacingPreset
  if (props.workspaceType === 'team' && props.workspaceDisplayPreferences.teamDefault?.tabSpacingPreset)
    return props.workspaceDisplayPreferences.teamDefault.tabSpacingPreset
  return 'relaxed'
})

const workspaceDisplayRecommendedTabSpacingLabel = computed(() => {
  return resolveWorkspaceTabSpacingPresetLabel(workspaceDisplayRecommendedTabSpacingPreset.value)
})

const userWorkspaceDisplayPreviewFontSizePreset = computed<WorkspaceFontSizePreset>(() => {
  return userWorkspaceDisplayFontSizeDraft.value || workspaceDisplayRecommendedFontSizePreset.value
})

const userWorkspaceDisplayPreviewTabSpacingPreset = computed<WorkspaceTabSpacingPreset>(() => {
  return userWorkspaceDisplayTabSpacingDraft.value || workspaceDisplayRecommendedTabSpacingPreset.value
})

const userWorkspaceDisplayPreviewTabSpacingLabel = computed(() => {
  return resolveWorkspaceTabSpacingPresetLabel(userWorkspaceDisplayPreviewTabSpacingPreset.value)
})

const userWorkspaceDisplaySliderValue = computed(() => {
  return normalizeWorkspaceFontSizeSliderIndex(userWorkspaceDisplayPreviewFontSizePreset.value)
})

const userWorkspaceDisplaySliderProgress = computed(() => {
  return resolveWorkspaceDisplaySliderProgress(userWorkspaceDisplaySliderValue.value, WORKSPACE_FONT_SIZE_PRESET_ORDER.length)
})

const userWorkspaceDisplayTabSpacingSliderValue = computed(() => {
  return normalizeWorkspaceTabSpacingSliderIndex(userWorkspaceDisplayPreviewTabSpacingPreset.value)
})

const userWorkspaceDisplayTabSpacingSliderProgress = computed(() => {
  return resolveWorkspaceDisplaySliderProgress(userWorkspaceDisplayTabSpacingSliderValue.value, WORKSPACE_TAB_SPACING_PRESET_ORDER.length)
})

const teamWorkspaceDisplayTabSpacingSliderValue = computed(() => {
  return normalizeWorkspaceTabSpacingSliderIndex(teamWorkspaceDisplayTabSpacingDraft.value || undefined)
})

const teamWorkspaceDisplayTabSpacingSliderProgress = computed(() => {
  return resolveWorkspaceDisplaySliderProgress(teamWorkspaceDisplayTabSpacingSliderValue.value, WORKSPACE_TAB_SPACING_PRESET_ORDER.length)
})

const userWorkspaceDisplaySourceSummary = computed(() => {
  return `${resolveWorkspaceDisplayPreferenceSourceLabel(props.workspaceDisplayPreferences.sources.fontSizePreset)} / ${resolveWorkspaceDisplayPreferenceSourceLabel(props.workspaceDisplayPreferences.sources.tabSpacingPreset)}`
})

const workspaceDisplayEffectiveSummary = computed(() => {
  return `${resolveWorkspaceFontSizePresetLabel(props.workspaceDisplayPreferences.effective.fontSizePreset)} / ${resolveWorkspaceTabSpacingPresetLabel(props.workspaceDisplayPreferences.effective.tabSpacingPreset)}`
})

const userWorkspaceDisplayChanged = computed(() => {
  return userWorkspaceDisplayFontSizeDraft.value !== normalizeWorkspaceFontSizeDraft(props.workspaceDisplayPreferences.workspaceOverride?.fontSizePreset)
    || userWorkspaceDisplayTabSpacingDraft.value !== normalizeWorkspaceTabSpacingDraft(props.workspaceDisplayPreferences.workspaceOverride?.tabSpacingPreset)
})

const teamWorkspaceDisplayChanged = computed(() => {
  return teamWorkspaceDisplayFontSizeDraft.value !== normalizeWorkspaceFontSizeDraft(props.workspaceDisplayPreferences.teamDefault?.fontSizePreset)
    || teamWorkspaceDisplayTabSpacingDraft.value !== normalizeWorkspaceTabSpacingDraft(props.workspaceDisplayPreferences.teamDefault?.tabSpacingPreset)
})

function updateUserWorkspaceDisplayTabSpacingDraft(value: string | number): void {
  const index = Math.max(0, Math.min(WORKSPACE_TAB_SPACING_PRESET_ORDER.length - 1, Number(value)))
  userWorkspaceDisplayTabSpacingDraft.value = WORKSPACE_TAB_SPACING_PRESET_ORDER[index] || 'relaxed'
}

function resolveWorkspaceDisplaySliderProgress(value: number, total: number): string {
  const maxIndex = Math.max(1, total - 1)
  const normalizedValue = Number.isFinite(value) ? Math.min(maxIndex, Math.max(0, value)) : 0
  return `${(normalizedValue / maxIndex) * 100}%`
}

function updateUserWorkspaceDisplayFontSizeDraft(value: string | number): void {
  const index = Math.max(0, Math.min(WORKSPACE_FONT_SIZE_PRESET_ORDER.length - 1, Number(value)))
  userWorkspaceDisplayFontSizeDraft.value = WORKSPACE_FONT_SIZE_PRESET_ORDER[index] || 'lg'
}

function updateTeamWorkspaceDisplayTabSpacingDraft(value: string | number): void {
  const index = Math.max(0, Math.min(WORKSPACE_TAB_SPACING_PRESET_ORDER.length - 1, Number(value)))
  teamWorkspaceDisplayTabSpacingDraft.value = WORKSPACE_TAB_SPACING_PRESET_ORDER[index] || 'relaxed'
}

function resolveWorkspaceDisplaySliderStopLeft(index: number, total: number): string {
  const lastIndex = Math.max(0, total - 1)
  if (index <= 0)
    return '4px'
  if (index >= lastIndex)
    return 'calc(100% - 4px)'
  return `${(index / lastIndex) * 100}%`
}

function resolveWorkspaceDisplaySliderGridStyle(total: number): Record<string, string> {
  return {
    gridTemplateColumns: `repeat(${Math.max(1, total)}, minmax(0, 1fr))`,
  }
}

function restoreRecommendedWorkspaceDisplay(): void {
  userWorkspaceDisplayFontSizeDraft.value = workspaceDisplayRecommendedFontSizePreset.value
  userWorkspaceDisplayTabSpacingDraft.value = workspaceDisplayRecommendedTabSpacingPreset.value
}

function saveWorkspaceDisplayUserOverride(): void {
  emit('saveWorkspaceDisplayUserOverride', {
    fontSizePreset: userWorkspaceDisplayFontSizeDraft.value || null,
    tabSpacingPreset: userWorkspaceDisplayTabSpacingDraft.value || null,
  })
}

function saveWorkspaceDisplayTeamDefault(): void {
  emit('saveWorkspaceDisplayTeamDefault', {
    fontSizePreset: teamWorkspaceDisplayFontSizeDraft.value || null,
    tabSpacingPreset: teamWorkspaceDisplayTabSpacingDraft.value || null,
  })
}

function createResourceTabId(resourceId: string): WorkspaceResourceTabId {
  return `resource:${resourceId}` as WorkspaceResourceTabId
}

function createMeetingTabId(meetingId: string): WorkspaceMeetingTabId {
  return `meeting:${meetingId}` as WorkspaceMeetingTabId
}

function resolveMeetingIdFromTabId(tabId: string): string {
  return tabId.startsWith('meeting:') ? tabId.slice('meeting:'.length) : ''
}

function isMeetingCreateTabId(tabId: string): tabId is WorkspaceMeetingCreateTabId {
  return tabId.startsWith('meeting-create:')
    && (tabId === 'meeting-create:audio' || tabId === 'meeting-create:video')
}

function resolveMeetingCreateModeFromTabId(tabId: string): ProjectMeetingMode | '' {
  if (tabId === 'meeting-create:audio')
    return 'audio'
  if (tabId === 'meeting-create:video')
    return 'video'
  return ''
}

function resolveMeetingTitleById(meetingId: string): string {
  const normalizedMeetingId = String(meetingId || '').trim()
  if (!normalizedMeetingId)
    return '会议详情'

  if (props.activeMeeting?.id === normalizedMeetingId)
    return String(props.activeMeeting.title || '').trim() || '会议详情'

  return props.meetings.find(item => item.id === normalizedMeetingId)?.title || '会议详情'
}

function buildMeetingTab(meetingId: string): WorkspaceMainTab | null {
  const normalizedMeetingId = String(meetingId || '').trim()
  if (!normalizedMeetingId)
    return null

  const meeting = props.meetings.find(item => item.id === normalizedMeetingId)
  return {
    id: createMeetingTabId(normalizedMeetingId),
    kind: 'meeting',
    title: resolveMeetingTitleById(normalizedMeetingId),
    icon: meeting?.mode === 'audio' ? 'call' : 'videocam',
    closeable: true,
    meetingId: normalizedMeetingId,
    meetingMode: meeting?.mode === 'audio' ? 'audio' : 'video',
  }
}

function buildMeetingCreateTab(mode: ProjectMeetingMode): WorkspaceMainTab {
  return {
    id: `meeting-create:${mode}` as WorkspaceMeetingCreateTabId,
    kind: 'meeting_create',
    title: mode === 'audio' ? '新建语音会议' : '新建视频会议',
    icon: mode === 'audio' ? 'call' : 'videocam',
    closeable: true,
    meetingMode: mode,
  }
}

function resolveTabFromId(tabId: WorkspaceMainTabId): WorkspaceMainTab | null {
  const normalizedTabId = String(tabId || '').trim() as WorkspaceMainTabId
  if (!normalizedTabId)
    return null

  const fixedTab = fixedTabs.find(tab => tab.id === normalizedTabId)
  if (fixedTab)
    return fixedTab

  if (normalizedTabId.startsWith('resource:')) {
    const resourceId = normalizedTabId.slice('resource:'.length)
    const resource = props.selectedResources.find(item => item.id === resourceId) || null
    return buildResourceTab(
      resourceId,
      resource?.title || '',
      resolvePreviewModeFromResource(resource),
      resolveCollabPurposeFromResource(resource),
      resource,
    )
  }

  if (normalizedTabId.startsWith('meeting:'))
    return buildMeetingTab(resolveMeetingIdFromTabId(normalizedTabId))

  if (isMeetingCreateTabId(normalizedTabId))
    return buildMeetingCreateTab(resolveMeetingCreateModeFromTabId(normalizedTabId) || 'video')

  return null
}

function resolvePreviewModeFromResource(resource: Resource | null | undefined): WorkspacePreviewMode {
  const resourceKind = String(resource?.resourceKind || '').trim().toLowerCase()
  if (resourceKind === 'markdown' || resourceKind === 'draw')
    return resourceKind
  return 'binary'
}

function resolveCollabPurposeFromResource(resource: Resource | null | undefined): CollabPurpose | '' {
  return resolveCollabPurpose(resource)
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
    return resolveCollabResourceDisplayLabel('notes', 'markdown')
  if (mode === 'draw')
    return resolveCollabResourceDisplayLabel(purpose, 'draw')
  return '资料预览'
}

function resolveResourceTabIcon(mode: WorkspacePreviewMode, purpose: CollabPurpose | '' = '', resource?: Resource | null): string {
  if (mode === 'binary' && isDeviceArrangementResource(resource))
    return 'devices'
  if (mode === 'markdown')
    return 'edit_note'
  if (mode === 'draw' && purpose === 'workflow')
    return 'flowsheet'
  if (mode === 'draw' && purpose === 'design')
    return 'palette'
  if (mode === 'draw')
    return 'draw'
  return 'description'
}

function buildResourceTab(resourceId: string, title: string, mode: WorkspacePreviewMode, purpose: CollabPurpose | '' = '', resource?: Resource | null): WorkspaceMainTab {
  return {
    id: createResourceTabId(resourceId),
    kind: 'resource',
    title: resolveResourceTabTitle(mode, title, purpose),
    icon: resolveResourceTabIcon(mode, purpose, resource),
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
    previewResource,
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

const activeResource = computed(() => {
  const resourceId = String(activeResourceTab.value?.resourceId || '').trim()
  if (!resourceId)
    return null
  return props.selectedResources.find(resource => resource.id === resourceId) || null
})

const hasFlowResource = computed(() => Boolean(String(props.flowResourceId || '').trim()))
const flowPanelTitle = computed(() => String(props.flowResourceTitle || '').trim() || '流程画布')
const activeDesignResourceId = computed(() => {
  return activeResourceTab.value?.previewMode === 'draw' && resolveCollabPurpose(activeResource.value) === 'design'
    ? String(activeResourceTab.value.resourceId || '').trim()
    : ''
})
const isActiveDesignResource = computed(() => Boolean(activeDesignResourceId.value))
const activeDesignPanelTitle = computed(() => String(activeResourceTab.value?.title || '').trim() || '设计稿')
const activeDeviceArrangementResourceId = computed(() => {
  return activeResourceTab.value?.previewMode === 'binary' && isDeviceArrangementResource(activeResource.value)
    ? String(activeResourceTab.value.resourceId || '').trim()
    : ''
})
const isActiveDeviceArrangementResource = computed(() => Boolean(activeDeviceArrangementResourceId.value))
const deviceArrangementSaveState = ref({ dirty: false, saving: false, blocked: false })
type BreadcrumbSaveTone = 'blocked' | 'dirty' | 'saved' | 'saving'
const breadcrumbSaveState = computed(() => {
  if (!isActiveDeviceArrangementResource.value)
    return null
  if (deviceArrangementSaveState.value.blocked)
    return { label: '已占用', tone: 'blocked' as BreadcrumbSaveTone }
  if (deviceArrangementSaveState.value.saving)
    return { label: '保存中', tone: 'saving' as BreadcrumbSaveTone }
  if (deviceArrangementSaveState.value.dirty)
    return { label: '未保存', tone: 'dirty' as BreadcrumbSaveTone }
  return { label: '已保存', tone: 'saved' as BreadcrumbSaveTone }
})

const breadcrumbItems = computed(() => {
  if (activeResourceTab.value) {
    const title = activeResourceTab.value.title
    if (activeResourceTab.value.previewMode === 'markdown')
      return ['项目资料', title]
    if (activeResourceTab.value.previewMode === 'draw')
      return [resolveCollabResourceLabel(activeResource.value), title]
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

  if (activeTabId.value === 'meeting')
    return ['竞赛分析', '项目会议']

  if (activeTabId.value.startsWith('meeting:')) {
    return ['竞赛分析', '项目会议', resolveMeetingTitleById(resolveMeetingIdFromTabId(activeTabId.value))]
  }

  if (isMeetingCreateTabId(activeTabId.value)) {
    return ['竞赛分析', '项目会议', resolveMeetingCreateModeFromTabId(activeTabId.value) === 'audio' ? '新建语音会议' : '新建视频会议']
  }

  if (activeTabId.value === 'members')
    return ['竞赛分析', '项目协作']

  if (activeTabId.value === 'flow')
    return ['竞赛分析', '流程画布']

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

interface WorkspaceTabContextSnapshot {
  tab: WorkspaceMainTab
  leftIds: WorkspaceMainTabId[]
  rightIds: WorkspaceMainTabId[]
}

interface WorkspacePanelCommandResult {
  handled: boolean
  reason?: string
}

function buildTabContextSnapshot(tabId: WorkspaceMainTabId): WorkspaceTabContextSnapshot | null {
  const normalizedTabId = String(tabId || '').trim() as WorkspaceMainTabId
  if (!normalizedTabId)
    return null

  const index = openTabs.value.findIndex(tab => tab.id === normalizedTabId)
  if (index < 0)
    return null

  const tab = openTabs.value[index]
  if (!tab)
    return null

  return {
    tab,
    leftIds: openTabs.value.slice(0, index).map(item => item.id),
    rightIds: openTabs.value.slice(index + 1).map(item => item.id),
  }
}

function buildTabContextMenuItems(snapshot: WorkspaceTabContextSnapshot): ContextMenuItem[] {
  return [
    {
      key: 'closeSelf',
      label: '关闭标签页',
      icon: 'close',
      disabled: !snapshot.tab.closeable,
    },
    {
      key: 'closeLeft',
      label: '关闭左侧标签页',
      icon: 'keyboard_double_arrow_left',
      disabled: snapshot.leftIds.length === 0,
    },
    {
      key: 'closeRight',
      label: '关闭右侧标签页',
      icon: 'keyboard_double_arrow_right',
      disabled: snapshot.rightIds.length === 0,
    },
    {
      key: 'closeOthers',
      label: '关闭其他标签页',
      icon: 'tab_close_right',
      disabled: openTabs.value.length <= 1,
    },
    {
      key: 'closeAll',
      label: '关闭全部标签页',
      icon: 'tab_close',
      tone: 'danger',
      separatorBefore: true,
      disabled: openTabs.value.length === 0,
    },
  ]
}

function requestTabContextMenu(payload: {
  tabId: string
  anchorPoint?: { x: number, y: number }
  anchorEl?: HTMLElement | null
  restoreFocusEl?: HTMLElement | null
}): void {
  const normalizedTabId = String(payload.tabId || '').trim() as WorkspaceMainTabId
  if (!normalizedTabId)
    return

  const snapshot = buildTabContextSnapshot(normalizedTabId)
  if (!snapshot)
    return

  openTabContextMenu(normalizedTabId, {
    position: payload.anchorPoint || null,
  })

  emit('requestContextMenu', {
    source: 'workspace-tab',
    items: buildTabContextMenuItems(snapshot),
    anchorPoint: payload.anchorPoint || null,
    anchorEl: payload.anchorEl || null,
    restoreFocusEl: payload.restoreFocusEl || null,
    onSelect: (key) => {
      try {
        switch (key) {
          case 'closeSelf':
            if (snapshot.tab.closeable)
              closeTab(snapshot.tab.id)
            return
          case 'closeLeft':
            if (snapshot.leftIds.length > 0)
              closeTabsToLeft()
            return
          case 'closeRight':
            if (snapshot.rightIds.length > 0)
              closeTabsToRight()
            return
          case 'closeOthers':
            if (openTabs.value.length > 1)
              closeOtherTabs()
            return
          case 'closeAll':
            if (openTabs.value.length > 0)
              closeAllTabs()
        }
      }
      finally {
        closeTabContextMenu()
      }
    },
    onClose: () => {
      closeTabContextMenu()
    },
  })
}

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

function emitActivatePreviewResource(resourceId: string): void {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId)
    return
  emit('activatePreviewResource', normalizedResourceId)
}
function updateOpenTabMetadata(): void {
  const previewTab = previewTabFromProps()
  const resourceMap = new Map(
    props.selectedResources.map(resource => [resource.id, resource] as const),
  )

  const nextTabs: WorkspaceMainTab[] = []
  let changed = false

  for (const tab of openTabs.value) {
    if (tab.kind === 'meeting' && tab.meetingId) {
      const nextMeetingTab = buildMeetingTab(tab.meetingId)
      const meetingTabChanged = Boolean(
        nextMeetingTab
        && (
          tab.title !== nextMeetingTab.title
          || tab.icon !== nextMeetingTab.icon
          || tab.meetingMode !== nextMeetingTab.meetingMode
        ),
      )
      if (meetingTabChanged && nextMeetingTab) {
        nextTabs.push(nextMeetingTab)
        changed = true
        continue
      }
    }

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

const showBreadcrumbPresence = computed(() => {
  if (collabPresenceUsers.value.length === 0)
    return false
  if (activeTabId.value === 'flow')
    return true
  return Boolean(activeResourceTab.value && (activePreviewMode.value === 'markdown' || activePreviewMode.value === 'draw'))
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
  emit('prepareWorkspaceInvitation')
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

function onDeviceArrangementSaveStateChange(payload: { dirty: boolean, saving: boolean, blocked?: boolean }): void {
  deviceArrangementSaveState.value = {
    dirty: Boolean(payload.dirty),
    saving: Boolean(payload.saving),
    blocked: Boolean(payload.blocked),
  }
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
  selectedText?: string
  selectedTextPreview: string
}): void {
  const selection: WorkspaceCollabSelectionSummary = {
    anchorLine: value.anchorLine,
    anchorColumn: value.anchorColumn,
    headLine: value.headLine,
    headColumn: value.headColumn,
    isCollapsed: value.isCollapsed,
    selectionLength: value.selectionLength,
    selectedText: value.selectedText,
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

function saveCurrentPanel(): WorkspacePanelCommandResult {
  if (activeTabId.value !== 'settings')
    return { handled: false, reason: '当前面板没有可保存内容。' }

  if (settingsActiveSectionId.value === 'displayPreferences') {
    if (props.workspaceDisplayPreferencesSavingScope === 'user')
      return { handled: false, reason: '当前面板正在保存中。' }
    if (!userWorkspaceDisplayChanged.value)
      return { handled: false, reason: '当前面板没有待保存内容。' }
    saveWorkspaceDisplayUserOverride()
    return { handled: true }
  }

  if (settingsActiveSectionId.value === 'teamDefault') {
    if (!props.workspaceDisplayPreferences.canManageTeamDefault)
      return { handled: false, reason: '当前账号无权保存团队默认显示偏好。' }
    if (props.workspaceDisplayPreferencesSavingScope === 'team')
      return { handled: false, reason: '当前面板正在保存中。' }
    if (!teamWorkspaceDisplayChanged.value)
      return { handled: false, reason: '当前面板没有待保存内容。' }

    saveWorkspaceDisplayTeamDefault()
    return { handled: true }
  }

  emit('saveProjectSettings')
  return { handled: true }
}

function canCloseCurrentTab(): boolean {
  return Boolean(activeTab.value?.closeable && activeTab.value?.id)
}

function closeCurrentTab(): WorkspacePanelCommandResult {
  const currentTab = activeTab.value
  if (!currentTab?.id)
    return { handled: false, reason: '当前没有可关闭的标签。' }
  if (!currentTab.closeable)
    return { handled: false, reason: '当前标签不可关闭。' }

  closeTab(currentTab.id)
  return { handled: true }
}

defineExpose({
  applyMarkdownDocumentDraft(payload: AiWorkspaceDocumentDraft) {
    return resourcePreviewTabRef.value?.applyDocumentDraft(payload) || false
  },
  applyMarkdownDocumentAssistResult(payload: { action: AiWorkspaceDocumentAction, text: string }) {
    return resourcePreviewTabRef.value?.applyDocumentAssistResult(payload) || false
  },
  openActiveSearch() {
    return resourcePreviewTabRef.value?.openSearch() || false
  },
  scrollToMarkdownCommentThread(threadId: string) {
    resourcePreviewTabRef.value?.scrollToCommentThread(threadId)
  },
  scrollToMarkdownHeadingAnchor(anchorId: string) {
    return resourcePreviewTabRef.value?.scrollToHeadingAnchor(anchorId) || false
  },
  locateDesignOutlineItem(node: WorkspaceOutlineNode) {
    return designPanelRef.value?.locateOutlineItem(node) || false
  },
  locateWorkflowOutlineItem(node: WorkspaceOutlineNode) {
    return flowTabRef.value?.locateOutlineItem(node) || false
  },
  saveCurrentPanel,
  canCloseCurrentTab,
  closeCurrentTab,
})

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

watch(() => props.workspaceDisplayPreferences, (snapshot) => {
  applyWorkspaceDisplayPreferenceDrafts(snapshot)
  if (activeTabId.value === 'settings')
    void nextTick(() => syncWorkspaceSettingsSectionFromScroll())
}, { deep: true, immediate: true })

watch(visibleWorkspaceSettingsSections, (sections) => {
  if (!sections.length)
    return

  if (!sections.some(item => item.id === settingsActiveSectionId.value)) {
    const fallbackSectionId = resolveWorkspaceSettingsDefaultSection(settingsPrimaryGroup.value)
    settingsActiveSectionId.value = fallbackSectionId
    settingsPrimaryGroup.value = findWorkspaceSettingsSection(fallbackSectionId)?.groupId || 'workspace'
  }

  if (activeTabId.value === 'settings')
    void nextTick(() => syncWorkspaceSettingsSectionFromScroll())
}, { immediate: true })

watch(() => activeTabId.value, (next) => {
  if (next !== 'settings')
    return
  void nextTick(() => syncWorkspaceSettingsSectionFromScroll())
})

watch(() => props.openSettingsSignal, (next, previous) => {
  if (next === previous)
    return
  ensureFixedTabOpen('settings', true)
  activateWorkspaceSettingsSection('projectOverview', { behavior: 'auto' })
})

watch(() => props.openLoopyDataSignal, (next, previous) => {
  if (next === previous)
    return
  ensureFixedTabOpen('loopy_data', true)
})

watch(() => props.openDisplayPreferencesSignal, (next, previous) => {
  if (next === previous)
    return
  ensureFixedTabOpen('settings', true)
  activateWorkspaceSettingsSection('displayPreferences', { behavior: 'auto' })
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
    updateOpenTabMetadata()
  },
)

watch(() => props.selectedResources, () => {
  updateOpenTabMetadata()
}, { deep: true })

watch(
  [
    () => props.meetings,
    () => props.activeMeeting?.id,
    () => props.activeMeeting?.title,
    () => props.activeMeeting?.mode,
  ],
  () => {
    updateOpenTabMetadata()
  },
  { deep: true },
)

watch(() => props.workspaceSeatLimitUpdatedSignal, (next, previous) => {
  if (next === previous)
    return
  workspaceSeatModalVisible.value = false
})
</script>

<template>
  <section class="workspace-main-panel bg-slate-50 flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
    <div
      v-if="hasOpenTabs"
      class="workspace-main-tab-strip-shell border-b border-slate-200 bg-white flex shrink-0 min-w-0 w-full items-center relative"
      :style="workspaceMainTabLayoutStyle"
    >
      <WorkspaceMainPanelChrome
        class="flex-1 min-w-0"
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
        :breadcrumb-save-state="breadcrumbSaveState"
        :collab-presence-users="showBreadcrumbPresence ? collabPresenceUsers : []"
        @activate-tab="activateTab($event as WorkspaceMainTabId)"
        @close-tab="closeTab($event as WorkspaceMainTabId)"
        @open-tab-context-menu="requestTabContextMenu($event)"
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
    </div>

    <div
      ref="workspaceMainBodyRef"
      class="flex-1 h-0 min-h-0"
      :class="activeResourceTab || activeTabId === 'flow' ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden p-4 md:p-6'"
      @scroll="onWorkspaceMainBodyScroll"
    >
      <WorkspaceDashboardTab
        v-if="activeTabId === 'dashboard'"
        :selected-contest="selectedContest"
        :selected-track="selectedTrack"
        :selected-track-id="selectedTrackId"
        :selected-contest-id="selectedContestId"
        :mapping-rows="mappingRows"
        :mapping-loading="mappingLoading"
        :mapping-refreshing="mappingRefreshing"
        :keyword-cloud="keywordCloud"
        :trend-bars="trendBars"
        :linked-contest-entries="linkedContestEntries"
        :selected-resources="selectedResources"
        :material-coverage="Math.min(selectedResources.length * 20, 100)"
        :form-state="formState"
        :form-submitting="formSubmitting"
        :workspace-preparing="workspacePreparing"
        :topic-board-fetching="topicBoardFetching"
        :tone-meta="toneMeta"
        @update-selected-track-id="emit('update:selectedTrackId', $event)"
        @use-binding-as-current-contest="useBindingAsCurrentContest($event.contestId, $event.trackId)"
        @update-form-field="updateFormField($event.field, $event.value)"
        @submit-project-for-contest="submitProjectForContest($event.contestId, $event.trackId)"
      />

      <WorkspaceMeetingOverviewPanel
        v-else-if="activeTabId === 'meeting'"
        :meetings="props.meetings"
        :loading="props.meetingLoading"
        :refreshing="props.meetingRefreshing"
        @refresh-meetings="emit('refreshMeetings')"
        @open-meeting="emit('selectMeeting', $event)"
        @open-resource="emit('openMeetingResource', $event)"
      />

      <WorkspaceMeetingCreatePanel
        v-else-if="activeTabId === 'meeting-create:audio' || activeTabId === 'meeting-create:video'"
        :mode="activeTabId === 'meeting-create:audio' ? 'audio' : 'video'"
        :project-members="props.workspaceMembers"
        :current-user-id="props.currentUserId"
        :workspace-type="props.workspaceType"
        :meeting-plan-tier="props.meetingPlanTier"
        :runtime-health="props.meetingRuntimeHealth"
        :mutating="props.meetingMutating"
        @quick-create="emit('quickCreateMeeting', $event)"
        @submit-create="emit('submitMeetingCreate', $event)"
        @open-meeting-overview="ensureFixedTabOpen('meeting')"
      />

      <WorkspaceMeetingPanel
        v-else-if="activeTabId.startsWith('meeting:')"
        :active-meeting="props.activeMeeting"
        :utterances="props.meetingUtterances"
        :live-captions="props.meetingLiveCaptions"
        :detail-loading="props.meetingDetailLoading"
        :refreshing="props.meetingDetailRefreshing"
        :mutating="props.meetingMutating"
        :join-url="props.meetingJoinUrl"
        :join-token="props.meetingJoinToken"
        :join-expires-at="props.meetingJoinExpiresAt"
        :rtc-server-url="props.meetingRtcServerUrl"
        :guest-share="props.activeMeetingGuestShare"
        :guest-share-loading="props.meetingGuestShareLoading"
        :current-user-id="props.currentUserId"
        :workspace-type="props.workspaceType"
        :meeting-plan-tier="props.meetingPlanTier"
        :defense-realtime-state="props.defenseRealtimeState"
        :defense-realtime-options="props.defenseRealtimeOptions"
        :defense-realtime-logs="props.defenseRealtimeLogs"
        @join-meeting="emit('joinMeeting', $event)"
        @start-meeting="emit('startMeeting', $event)"
        @end-meeting="emit('endMeeting', $event)"
        @open-resource="emit('openMeetingResource', $event)"
        @create-guest-share="emit('createMeetingGuestShare', $event)"
        @regenerate-guest-share="emit('regenerateMeetingGuestShare', $event)"
        @revoke-guest-share="emit('revokeMeetingGuestShare', $event)"
        @start-defense-realtime-sidecar="emit('startDefenseRealtimeSidecar')"
        @update-defense-realtime-provider="emit('updateDefenseRealtimeProvider', $event)"
        @update-defense-realtime-media-mode="emit('updateDefenseRealtimeMediaMode', $event)"
        @toggle-defense-realtime-audio="emit('toggleDefenseRealtimeAudio', $event)"
        @toggle-defense-realtime-video="emit('toggleDefenseRealtimeVideo', $event)"
        @interrupt-defense-realtime="emit('interruptDefenseRealtime')"
        @reconnect-defense-realtime="emit('reconnectDefenseRealtime')"
      />

      <WorkspaceFlowTab
        v-else-if="activeTabId === 'flow'"
        ref="flowTabRef"
        :project-id="props.activeProjectId"
        :has-flow-resource="hasFlowResource"
        :flow-panel-title="flowPanelTitle"
        :flow-resource-id="props.flowResourceId"
        :font-size-preset="props.workspaceDisplayPreferences.effective.fontSizePreset || ''"
        :tab-spacing-preset="props.workspaceDisplayPreferences.effective.tabSpacingPreset || ''"
        :collab-revision="collabRevision"
        :collab-connected="collabConnected"
        :collab-connection-text="collabConnectionText"
        :collab-presence-users="collabPresenceUsers"
        :collab-presence-cursors="collabPresenceCursors"
        :collab-draw-value="collabDrawValue"
        :collab-draw-error="collabDrawError"
        @update-collab-draw-value="onCollabDrawModelUpdate"
        @request-workflow-canvas-rebuild="emit('requestWorkflowCanvasRebuild')"
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
        @update-workspace-member-role-draft="workspaceMemberRoleDraftMap[$event.userId] = toPatchableWorkspaceRole($event.role)"
        @submit-workspace-member-role="submitWorkspaceMemberRole"
        @remove-workspace-member="removeWorkspaceMember"
        @revoke-workspace-invitation="revokeWorkspaceInvitation"
      />

      <WorkspaceLoopyDataTab
        v-else-if="activeTabId === 'loopy_data'"
        :active-project="activeProject"
        :active-project-id="props.activeProjectId"
        :selected-resources="props.selectedResources"
        :dashboard="props.projectKnowledgeDashboard"
        :loading="props.projectKnowledgeLoading"
        :error="props.projectKnowledgeError"
        :reindexing-target="props.projectKnowledgeReindexingTarget"
        :retrying-source-id="props.projectKnowledgeRetryingSourceId"
        @reload="emit('reloadProjectKnowledge')"
        @reindex-project-knowledge="emit('reindexProjectKnowledge', $event)"
        @reindex-project-knowledge-source="emit('reindexProjectKnowledgeSource', $event)"
      />

      <section
        v-else-if="activeTabId === 'settings'"
        class="w-full"
      >
        <div class="workspace-settings-shell">
          <aside class="workspace-settings-sidebar">
            <div class="workspace-settings-sidebar__inner">
              <div class="space-y-1">
                <p class="text-[11px] text-slate-400 tracking-[0.16em] font-semibold uppercase">
                  Settings
                </p>
                <h2 class="text-lg text-slate-900 font-semibold">
                  项目设置
                </h2>
                <p class="text-xs text-slate-500 leading-5">
                  左侧导航切换设置项，右侧只展示当前选中的面板。
                </p>
              </div>

              <section
                v-for="group in workspaceSettingsGroups"
                v-show="workspaceSettingsSectionsByGroup[group.id].length > 0"
                :key="group.id"
                :data-testid="WORKSPACE_SETTINGS_GROUP_TEST_IDS[group.id]"
                class="space-y-2"
              >
                <p class="text-[11px] text-slate-400 tracking-[0.16em] font-semibold uppercase">
                  {{ group.label }}
                </p>
                <div class="space-y-1">
                  <button
                    v-for="item in workspaceSettingsSectionsByGroup[group.id]"
                    :key="item.id"
                    :data-testid="item.legacyTabId ? WORKSPACE_SETTINGS_SECONDARY_TAB_TEST_IDS[item.legacyTabId] : item.testId"
                    class="workspace-settings-sidebar__item"
                    :class="settingsActiveSectionId === item.id ? 'workspace-settings-sidebar__item--active' : ''"
                    type="button"
                    @click="activateWorkspaceSettingsSection(item.id, { behavior: 'auto' })"
                  >
                    <span class="workspace-settings-sidebar__item-indicator" />
                    <span class="min-w-0 truncate">{{ item.label }}</span>
                  </button>
                </div>
              </section>
            </div>
          </aside>

          <div class="min-w-0 space-y-4">
            <section class="border border-slate-200 rounded-2xl bg-white overflow-hidden lg:hidden">
              <div class="px-4 py-4 border-b border-slate-200 bg-slate-50/80">
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="group in workspaceSettingsGroups"
                    :key="`workspace-settings-mobile-group-${group.id}`"
                    class="text-xs font-semibold px-3 py-1.5 border rounded-full transition-colors"
                    :class="settingsPrimaryGroup === group.id
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
                    type="button"
                    @click="activateWorkspaceSettingsSection(resolveWorkspaceSettingsDefaultSection(group.id), { behavior: 'auto' })"
                  >
                    {{ group.label }}
                  </button>
                </div>
                <div class="pt-3 flex flex-wrap gap-2">
                  <button
                    v-for="item in workspaceSettingsSectionsByGroup[settingsPrimaryGroup]"
                    :key="`workspace-settings-mobile-item-${item.id}`"
                    class="text-xs font-semibold px-3 py-1.5 border rounded-full transition-colors"
                    :class="settingsActiveSectionId === item.id
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
                    type="button"
                    @click="activateWorkspaceSettingsSection(item.id, { behavior: 'auto' })"
                  >
                    {{ item.label }}
                  </button>
                </div>
              </div>
            </section>

            <section class="border border-slate-200 rounded-2xl bg-white overflow-hidden">
              <div class="px-5 py-4 border-b border-slate-200 bg-slate-50/80">
                <p class="text-[10px] text-slate-400 tracking-[0.16em] font-semibold uppercase">
                  {{ activeWorkspaceSettingsGroup?.label || 'Workspace' }}
                </p>
                <div class="mt-1 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 class="text-sm text-slate-900 font-semibold">
                      {{ activeWorkspaceSettingsSection?.label || '设置' }}
                    </h2>
                    <p class="text-xs text-slate-500 leading-5 mt-1">
                      {{ activeWorkspaceSettingsSection?.description || '管理项目配置与当前工作区显示偏好。' }}
                    </p>
                  </div>
                  <div class="text-xs text-slate-500">
                    {{ activeWorkspaceSettingsGroup?.description || '设置中心' }}
                  </div>
                </div>
              </div>
            </section>

            <section
              v-show="isDisplayPreferencesSectionActive"
              id="workspace-settings-section-display-preferences"
              data-testid="user-settings-display-preferences-tab"
              class="border border-slate-200 rounded-2xl bg-white overflow-hidden"
              @focusin.capture="settingsPrimaryGroup = 'personal'; settingsActiveSectionId = 'displayPreferences'"
              @pointerdown.capture="settingsPrimaryGroup = 'personal'; settingsActiveSectionId = 'displayPreferences'"
            >
              <div class="px-5 py-4 border-b border-slate-200 bg-slate-50/80">
                <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 class="text-sm text-slate-900 font-semibold">
                      我的显示偏好
                    </h3>
                    <p class="text-xs text-slate-500 leading-5 mt-1">
                      保存后仅影响当前工作区，不会覆盖团队默认。
                    </p>
                  </div>
                  <div class="text-xs text-slate-500">
                    当前生效：{{ workspaceDisplayEffectiveSummary }}
                  </div>
                </div>
              </div>

              <div class="px-5 py-5 space-y-4" data-testid="user-settings-display-preferences-panel">
                <div v-if="props.workspaceDisplayPreferencesError" class="text-xs text-rose-600 px-4 py-3 border border-rose-200 rounded-2xl bg-rose-50">
                  {{ props.workspaceDisplayPreferencesError }}
                </div>

                <div v-if="props.workspaceDisplayPreferencesLoading" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
                  正在加载显示偏好...
                </div>

                <template v-else>
                  <section class="p-4 border border-slate-200 rounded-2xl bg-slate-50/70 space-y-4">
                    <div>
                      <h4 class="text-sm text-slate-900 font-semibold">
                        外观设置
                      </h4>
                      <p class="text-[11px] text-slate-500 mt-1">
                        当前生效：{{ workspaceDisplayEffectiveSummary }}
                      </p>
                    </div>

                    <div class="space-y-3">
                      <div class="text-xs text-slate-600 flex items-center justify-between">
                        <span>字体大小</span>
                      </div>

                      <div class="workspace-display-slider-shell">
                        <div class="workspace-display-slider-track" aria-hidden="true">
                          <div
                            class="workspace-display-slider-track__fill"
                            :style="{ width: userWorkspaceDisplaySliderProgress }"
                          />
                          <span
                            v-for="(option, index) in WORKSPACE_FONT_SIZE_PRESET_OPTIONS"
                            :key="`workspace-display-user-track-stop-${option.value}`"
                            class="workspace-display-slider-track__stop"
                            :class="userWorkspaceDisplayPreviewFontSizePreset === option.value
                              ? 'workspace-display-slider-track__stop--active'
                              : ''"
                            :style="{ left: resolveWorkspaceDisplaySliderStopLeft(index, WORKSPACE_FONT_SIZE_PRESET_OPTIONS.length) }"
                          />
                        </div>
                        <input
                          data-testid="workspace-display-user-font-size-select"
                          class="workspace-display-slider"
                          type="range"
                          min="0"
                          :max="Math.max(0, WORKSPACE_FONT_SIZE_PRESET_OPTIONS.length - 1)"
                          step="1"
                          :value="userWorkspaceDisplaySliderValue"
                          @input="updateUserWorkspaceDisplayFontSizeDraft(($event.target as HTMLInputElement).value)"
                        >
                      </div>

                      <div class="gap-2 grid" :style="resolveWorkspaceDisplaySliderGridStyle(WORKSPACE_FONT_SIZE_PRESET_OPTIONS.length)">
                        <span
                          v-for="option in WORKSPACE_FONT_SIZE_PRESET_OPTIONS"
                          :key="`workspace-display-user-label-${option.value}`"
                          class="workspace-display-slider-label text-[11px] font-medium text-center transition-colors"
                          :class="userWorkspaceDisplayPreviewFontSizePreset === option.value
                            ? 'text-blue-700'
                            : 'text-slate-500'"
                        >
                          <span>{{ option.label }}</span>
                          <span
                            v-if="option.value === workspaceDisplayRecommendedFontSizePreset"
                            class="workspace-display-slider-label__tag-wrap"
                          >
                            <span
                              data-testid="workspace-display-recommended-tag"
                              class="workspace-display-slider-label__tag"
                              tabindex="0"
                            >
                              推荐
                            </span>
                            <span class="workspace-display-slider-label__tooltip">
                              {{ recommendedWorkspaceDisplayTagText }}
                            </span>
                          </span>
                        </span>
                      </div>

                      <span class="text-[11px] text-slate-500 block">
                        当前来源：{{ userWorkspaceDisplaySourceSummary }}
                      </span>
                    </div>

                    <div class="space-y-3">
                      <div class="text-xs text-slate-600 flex items-center justify-between">
                        <span>标签边距</span>
                        <span class="text-[11px] text-slate-400">当前预览：{{ userWorkspaceDisplayPreviewTabSpacingLabel }}</span>
                      </div>

                      <div class="workspace-display-slider-shell">
                        <div class="workspace-display-slider-track" aria-hidden="true">
                          <div
                            class="workspace-display-slider-track__fill"
                            :style="{ width: userWorkspaceDisplayTabSpacingSliderProgress }"
                          />
                          <span
                            v-for="(option, index) in WORKSPACE_TAB_SPACING_PRESET_OPTIONS"
                            :key="`workspace-display-user-tab-spacing-track-stop-${option.value}`"
                            class="workspace-display-slider-track__stop"
                            :class="userWorkspaceDisplayPreviewTabSpacingPreset === option.value
                              ? 'workspace-display-slider-track__stop--active'
                              : ''"
                            :style="{ left: resolveWorkspaceDisplaySliderStopLeft(index, WORKSPACE_TAB_SPACING_PRESET_OPTIONS.length) }"
                          />
                        </div>
                        <input
                          data-testid="workspace-display-user-tab-spacing-select"
                          class="workspace-display-slider"
                          type="range"
                          min="0"
                          :max="Math.max(0, WORKSPACE_TAB_SPACING_PRESET_OPTIONS.length - 1)"
                          step="1"
                          :value="userWorkspaceDisplayTabSpacingSliderValue"
                          @input="updateUserWorkspaceDisplayTabSpacingDraft(($event.target as HTMLInputElement).value)"
                        >
                      </div>

                      <div class="gap-2 grid" :style="resolveWorkspaceDisplaySliderGridStyle(WORKSPACE_TAB_SPACING_PRESET_OPTIONS.length)">
                        <span
                          v-for="option in WORKSPACE_TAB_SPACING_PRESET_OPTIONS"
                          :key="`workspace-display-user-tab-spacing-label-${option.value}`"
                          class="workspace-display-slider-label text-[11px] font-medium text-center transition-colors"
                          :class="userWorkspaceDisplayPreviewTabSpacingPreset === option.value
                            ? 'text-blue-700'
                            : 'text-slate-500'"
                        >
                          <span>{{ option.label }}</span>
                          <span
                            v-if="option.value === workspaceDisplayRecommendedTabSpacingPreset"
                            class="workspace-display-slider-label__tag-wrap"
                          >
                            <span class="workspace-display-slider-label__tag" tabindex="0">
                              推荐
                            </span>
                            <span class="workspace-display-slider-label__tooltip">
                              {{ recommendedWorkspaceDisplayTagText }}
                            </span>
                          </span>
                        </span>
                      </div>

                      <span class="text-[11px] text-slate-500 block">
                        较小档位会逐步压缩顶部标签页的横向边距和最小宽度，并同步压缩左侧资源列表密度；默认档对应当前标准密度。推荐：{{ workspaceDisplayRecommendedTabSpacingLabel }}。
                      </span>
                    </div>

                    <div class="flex flex-wrap gap-2 justify-end">
                      <button
                        class="text-[11px] font-semibold px-3 py-1.5 border border-slate-200 rounded-full bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        type="button"
                        :disabled="props.workspaceDisplayPreferencesSavingScope === 'user'"
                        @click="restoreRecommendedWorkspaceDisplay"
                      >
                        还原为工作区推荐设置
                      </button>
                      <button
                        class="text-[11px] text-white font-semibold px-3 py-1.5 rounded-full bg-slate-900 transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        type="button"
                        :disabled="props.workspaceDisplayPreferencesSavingScope === 'user' || !userWorkspaceDisplayChanged"
                        @click="saveWorkspaceDisplayUserOverride"
                      >
                        {{ props.workspaceDisplayPreferencesSavingScope === 'user' ? '保存中...' : '保存个人设置' }}
                      </button>
                    </div>
                  </section>
                </template>
              </div>
            </section>

            <div v-show="Boolean(activeWorkspaceProjectSectionId)" class="space-y-4">
              <WorkspaceProjectSettingsTab
                :active-project="activeProject"
                :active-project-id="props.activeProjectId"
                :active-settings-section-id="activeWorkspaceProjectSectionId"
                :font-size-preset="props.workspaceDisplayPreferences.effective.fontSizePreset || ''"
                :tab-spacing-preset="props.workspaceDisplayPreferences.effective.tabSpacingPreset || ''"
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
            </div>

            <section
              v-show="isTeamDefaultSectionActive && props.workspaceDisplayPreferences.canManageTeamDefault"
              id="workspace-settings-section-team-default"
              data-testid="workspace-settings-section-team-default"
              class="border border-slate-200 rounded-2xl bg-white overflow-hidden"
              @focusin.capture="settingsPrimaryGroup = 'workspace'; settingsActiveSectionId = 'teamDefault'"
              @pointerdown.capture="settingsPrimaryGroup = 'workspace'; settingsActiveSectionId = 'teamDefault'"
            >
              <div class="px-5 py-4 border-b border-slate-200 bg-slate-50/80">
                <div class="flex gap-3">
                  <span class="material-symbols-outlined text-xl text-slate-700 mt-0.5">groups</span>
                  <div>
                    <h3 class="text-sm text-slate-900 font-semibold">
                      团队默认显示偏好
                    </h3>
                    <p class="text-xs text-slate-500 leading-5 mt-1">
                      新成员首次进入当前工作区时，将优先继承这里的默认设置。
                    </p>
                  </div>
                </div>
              </div>

              <div class="px-5 py-5 space-y-4">
                <div class="gap-4 grid md:grid-cols-2">
                  <label class="text-xs text-slate-600 block space-y-1.5">
                    <span class="text-slate-700 font-semibold">默认字号</span>
                    <UiSelect
                      :model-value="teamWorkspaceDisplayFontSizeDraft"
                      :options="workspaceDisplayFontSizeSelectOptions"
                      aria-label="团队默认字号"
                      class="w-full"
                      @change="value => teamWorkspaceDisplayFontSizeDraft = normalizeWorkspaceFontSizeDraft(String(value))"
                    />
                  </label>

                  <label class="text-xs text-slate-600 block space-y-1.5">
                    <span class="text-slate-700 font-semibold">默认标签边距</span>
                    <UiSelect
                      :model-value="teamWorkspaceDisplayTabSpacingDraft"
                      :options="workspaceDisplayTabSpacingSelectOptions"
                      aria-label="团队默认标签边距"
                      class="w-full"
                      @change="value => teamWorkspaceDisplayTabSpacingDraft = normalizeWorkspaceTabSpacingDraft(String(value))"
                    />
                  </label>
                </div>

                <div class="space-y-2">
                  <div class="rounded-full bg-slate-200 h-2 overflow-hidden">
                    <div class="rounded-full bg-blue-500 h-full transition-all" :style="{ width: teamWorkspaceDisplayTabSpacingSliderProgress }" />
                  </div>
                  <input
                    :value="teamWorkspaceDisplayTabSpacingSliderValue"
                    class="w-full"
                    :max="Math.max(0, WORKSPACE_TAB_SPACING_PRESET_OPTIONS.length - 1)"
                    min="0"
                    step="1"
                    type="range"
                    @input="updateTeamWorkspaceDisplayTabSpacingDraft(($event.target as HTMLInputElement).value)"
                  >
                </div>

                <div class="flex justify-end">
                  <button
                    class="text-xs text-white font-semibold px-3.5 py-2 rounded-full bg-slate-900 transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    type="button"
                    :disabled="props.workspaceDisplayPreferencesLoading || props.workspaceDisplayPreferencesSavingScope === 'team' || !teamWorkspaceDisplayChanged"
                    @click="saveWorkspaceDisplayTeamDefault"
                  >
                    保存团队默认
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <WorkspaceDesignPanel
        v-else-if="isActiveDesignResource"
        ref="designPanelRef"
        class="h-full min-h-0 w-full"
        :design-resource-id="activeDesignResourceId"
        :bound-resource-id="props.collabResourceId"
        :project-id="props.activeProjectId"
        :workspace-id="props.activeProject?.teamId || props.activeProject?.workspaceId || ''"
        :current-user-id="props.currentUserId"
        :is-platform-admin-user="props.isPlatformAdminUser"
        :design-panel-title="activeDesignPanelTitle"
        :has-design-resource="isActiveDesignResource"
        :collab-revision="collabRevision"
        :collab-connected="collabConnected"
        :collab-connection-text="collabConnectionText"
        :collab-presence-cursors="collabPresenceCursors"
        :model-value="props.collabDrawValue"
        :collab-draw-error="collabDrawError"
        :design-editor-engine="activeResource?.editorEngine || ''"
        :font-size-preset="props.workspaceDisplayPreferences.effective.fontSizePreset || ''"
        :tab-spacing-preset="props.workspaceDisplayPreferences.effective.tabSpacingPreset || ''"
        @update:model-value="onCollabDrawModelUpdate"
        @update-collab-cursor="onCollabCursorUpdate"
        @activate-resource="emitActivatePreviewResource($event)"
        @open-resource="emit('openResource', $event)"
      />

      <WorkspaceDeviceArrangementPanel
        v-else-if="isActiveDeviceArrangementResource"
        class="h-full min-h-0 w-full"
        :project-id="props.activeProjectId"
        :resource-id="activeDeviceArrangementResourceId"
        :resource-title="activeResource?.title || '设备排布'"
        @save-state-change="onDeviceArrangementSaveStateChange"
      />

      <WorkspaceResourcePreviewTab
        v-else-if="activeResourceTab"
        ref="resourcePreviewTabRef"
        :active-resource-tab="activeResourceTab"
        :active-preview-mode="activePreviewMode"
        :font-size-preset="props.workspaceDisplayPreferences.effective.fontSizePreset || ''"
        :tab-spacing-preset="props.workspaceDisplayPreferences.effective.tabSpacingPreset || ''"
        :preview-resource-id="props.previewResourceId"
        :project-id="props.activeProjectId"
        :preview-status="previewStatus"
        :preview-status-loading="previewStatusLoading"
        :preview-pdf-url="previewPdfUrl"
        :collab-preview-loading="props.collabPreviewLoading"
        :collab-preview-error="props.collabPreviewError"
        :current-user-id="props.currentUserId"
        :current-user-name="props.currentUserName"
        :current-user-avatar-url="props.currentUserAvatarUrl"
        :collab-revision="collabRevision"
        :collab-connected="collabConnected"
        :collab-connection-text="collabConnectionText"
        :collab-markdown-doc="collabMarkdownDoc"
        :collab-markdown-awareness="collabMarkdownAwareness"
        :collab-current-user="collabCurrentUser"
        :collab-presence-users="collabPresenceUsers"
        :collab-presence-cursors="collabPresenceCursors"
        :inline-completion-enabled="props.inlineCompletionEnabled"
        :inline-completion-request-handler="props.inlineCompletionRequestHandler"
        :inline-completion-accept-handler="props.inlineCompletionAcceptHandler"
        :image-upload-handler="markdownImageUploadHandler"
        :comment-threads="commentThreads"
        :active-comment-thread-id="activeCommentThreadId"
        :comment-draft-anchor="activePreviewMode === 'markdown' ? props.commentDraftAnchor : null"
        :comment-loading="activePreviewMode === 'markdown' ? props.commentLoading : false"
        :comment-mutating="activePreviewMode === 'markdown' ? props.commentMutating : false"
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
        @markdown-primary-heading-change="emit('markdownPrimaryHeadingChange', $event)"
        @markdown-outline-change="emit('markdownOutlineChange', $event)"
        @markdown-create-comment-from-selection="emit('markdownCreateCommentFromSelection', $event)"
        @markdown-create-comment-from-image="emit('markdownCreateCommentFromImage', $event)"
        @markdown-open-comment-thread="emit('markdownOpenCommentThread', $event)"
        @markdown-request-image-action="emit('markdownRequestImageAction', $event)"
        @markdown-cancel-comment-draft="emit('markdownCancelCommentDraft')"
        @markdown-reply-comment-thread="emit('markdownReplyCommentThread', $event)"
        @markdown-resolve-comment-thread="emit('markdownResolveCommentThread', $event)"
        @markdown-reopen-comment-thread="emit('markdownReopenCommentThread', $event)"
        @markdown-create-comment-thread="emit('markdownCreateCommentThread', $event)"
      />

      <WorkspaceMainPanelEmptyState v-else />
    </div>

    <WorkspaceInviteModal
      :visible="workspaceInviteModalVisible"
      :workspace-can-manage-members="workspaceCanManageMembers"
      :workspace-invitation-submitting="workspaceInvitationSubmitting"
      :workspace-invite-project-label="workspaceInviteProjectLabel"
      :workspace-invitation-link="workspaceInvitationLink"
      :workspace-invitation-error="workspaceInvitationError"
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

<style scoped>
.workspace-display-slider-shell {
  position: relative;
  height: 22px;
  padding: 0 10px;
  box-sizing: border-box;
}

.workspace-display-slider-track {
  position: absolute;
  top: 50%;
  right: 10px;
  left: 10px;
  height: 8px;
  overflow: hidden;
  border-radius: var(--wl-radius-pill);
  background: var(--wl-border);
  pointer-events: none;
  transform: translateY(-50%);
}

.workspace-display-slider-track__fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--wl-primary-500);
}

.workspace-display-slider-track__stop {
  position: absolute;
  top: 50%;
  z-index: 1;
  width: 6px;
  height: 6px;
  border-radius: var(--wl-radius-pill);
  background: rgb(255 255 255 / 0.82);
  transform: translate(-50%, -50%);
}

.workspace-display-slider-track__stop--active {
  width: 8px;
  height: 8px;
  background: var(--wl-surface);
}

.workspace-display-slider {
  appearance: none;
  position: relative;
  z-index: 2;
  display: block;
  width: 100%;
  height: 22px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.workspace-display-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: 4px;
  border: 2px solid var(--wl-primary-500);
  border-radius: var(--wl-radius-pill);
  background: var(--wl-surface);
  box-shadow: 0 0 0 2px rgb(255 255 255 / 0.92);
}

.workspace-display-slider::-webkit-slider-runnable-track {
  height: 22px;
  background: transparent;
}

.workspace-display-slider::-moz-range-track {
  height: 22px;
  background: transparent;
}

.workspace-display-slider::-moz-range-progress {
  height: 22px;
  background: transparent;
}

.workspace-display-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid var(--wl-primary-500);
  border-radius: var(--wl-radius-pill);
  background: var(--wl-surface);
  box-shadow: 0 0 0 2px rgb(255 255 255 / 0.92);
}

.workspace-display-slider-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.workspace-display-slider-label__tag-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.workspace-display-slider-label__tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  height: 18px;
  border: 1px solid var(--wl-primary-100);
  border-radius: var(--wl-radius-pill);
  background: var(--wl-primary-050);
  color: var(--wl-primary-500);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.workspace-display-slider-label__tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  z-index: 6;
  padding: 6px 8px;
  border-radius: var(--wl-radius-sm);
  background: rgb(15 23 42 / 0.92);
  color: var(--wl-surface);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(4px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.workspace-display-slider-label__tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: rgb(15 23 42 / 0.92);
  transform: translateX(-50%) rotate(45deg);
}

.workspace-display-slider-label__tag-wrap:hover .workspace-display-slider-label__tooltip,
.workspace-display-slider-label__tag-wrap:focus-within .workspace-display-slider-label__tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.workspace-settings-shell {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}

.workspace-settings-sidebar {
  display: none;
}

.workspace-settings-sidebar__inner {
  display: grid;
  gap: 1.25rem;
}

.workspace-settings-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-width: 0;
  padding: 0.625rem 0.875rem;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: rgb(71 85 105);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.workspace-settings-sidebar__item:hover {
  background: rgb(248 250 252);
  color: rgb(15 23 42);
}

.workspace-settings-sidebar__item-indicator {
  display: inline-flex;
  width: 3px;
  align-self: stretch;
  border-radius: 999px;
  background: transparent;
  transition: background-color 0.16s ease;
}

.workspace-settings-sidebar__item--active {
  background: rgb(239 246 255);
  color: rgb(37 99 235);
}

.workspace-settings-sidebar__item--active .workspace-settings-sidebar__item-indicator {
  background: rgb(37 99 235);
}

@media (min-width: 1024px) {
  .workspace-settings-shell {
    align-items: start;
    grid-template-columns: 232px minmax(0, 1fr);
  }

  .workspace-settings-sidebar {
    display: block;
    position: sticky;
    top: 0;
    align-self: start;
  }
}
</style>
