<script setup lang="ts">
import type {
  AiChatMessage,
  AiChatSession,
  AiContestFilterResult,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefenseScorecard,
  AiDefenseSessionDetail,
  AiDefenseSessionState,
  AiDefenseStage,
  AiDefenseStreamEvent,
  AiDefenseStreamEventType,
  AiDefenseSummary,
  AiDefenseTurn,
  AiProjectChangeRequest,
  AiWorkspaceDocumentAction,
  AiWorkspaceDocumentDraft,
  AiWorkspaceDocumentSelectionRange,
  AiWorkspaceInlineCompletionAcceptResult,
  AiWorkspaceInlineCompletionResult,
  AiWorkspaceRequest,
  AiWorkspaceResult,
  AiWorkspaceStreamEvent,
  AiWorkspaceStreamEventType,
  AiWorkspaceWorkflowDraft,
  ApiResponse,
  ApproveChangeRequestPayload,
  AuthMeResult,
  AuthUser,
  ChatMessage,
  CollabPurpose,
  Contest,
  ContestDetailPayload,
  DefenseRealtimeBootstrapPayload,
  DefenseRealtimeConnectionState,
  DefenseRealtimeMediaMode,
  DefenseRealtimeNormalizedEvent,
  DefenseRealtimeProvider,
  DefenseRealtimeSessionMeta,
  Project,
  ProjectInvitationSummary,
  ProjectIssue,
  ProjectIssueReport,
  ProjectMeetingDetail,
  ProjectMemberManagementSnapshot,
  ProjectMemberRole,
  ProjectMemberSummary,
  ProjectOutlineNode,
  ProjectOutlineSnapshot,
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
  ProjectWorkspaceAiTabsPreference,
  ProjectWorkspaceViewPreference,
  ProjectWorkspaceViewState,
  Resource,
  ResourcePreviewStatus,
  TopicProposalDecisionStatus,
  TopicProposalItem,
  WorkflowArchitectureView,
  WorkflowDraftAction,
  WorkflowLayoutPreset,
  WorkflowSnapshot,
  WorkflowStylePreset,
  WorkspaceAiAssistantPreset,
  WorkspaceAiMode,
  WorkspaceAiUsageHistory,
  WorkspaceBillingEstimate,
  WorkspaceFontSizePreset,
  WorkspaceMemberRole,
  WorkspaceOpenTabState,
  WorkspaceTabSpacingPreset,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import type { AiWorkspaceSceneDraft, WorkspaceContextualAssistantKey } from '~~/shared/types/domain-legacy'
import type { ContextMenuItem, ContextMenuRequest } from '~/components/ui/context-menu'
import type { CollabSnapshotPayload, WorkspaceRealtimeEnvelope } from '~/composables/useCollabSession'
import type { WorkspaceDisplayPreferencePatchPayload } from '~/composables/useWorkspaceDisplayPreferences'
import type { WorkspacePreviewMode } from '~/composables/useWorkspaceProjectResources'
import type {
  MappingTone,
  WorkspaceKeyword,
  WorkspaceLinkedContestResourceGroup,
  WorkspaceMappingRow,
  WorkspaceProjectAdaptationForm,
  WorkspaceProjectCommonForm,
  WorkspaceProjectContestBindingForm,
  WorkspaceProjectSaveState,
  WorkspaceStatusToneMeta,
} from '~/types/workspace'
import type { CollabMarkdownHeadingAnchorItem } from '~/utils/collab-markdown-navigation'
import type { DefenseRealtimeProviderBridge } from '~/utils/defense-realtime-bridge'
import type { DefenseRealtimeMediaController } from '~/utils/defense-realtime-media-controller'
import type { WorkspaceMetaKActionId, WorkspaceMetaKItem, WorkspaceMetaKSection, WorkspaceMetaKSectionDefinition } from '~/utils/workspace-metak'
import type {
  WorkspaceOutlineNode,
  WorkspaceOutlineSection,
} from '~/utils/workspace-outline'
import { Message } from '@arco-design/web-vue'
import {
  formatFileSize,
  isProjectResourceUploadFileSupported,
  PROJECT_RESOURCE_STORAGE_LIMIT_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES,
} from '~~/shared/constants/project-resource-upload'
import { TOPIC_BOARD_CREATE_SEED_STORAGE_PREFIX } from '~~/shared/constants/topic-board'
import {
  buildAgentDocDraftKey,
  computeAgentDocContentHash,
} from '~~/shared/utils/agent-doc'
import { syncMarkdownMirrorFromRichText } from '~~/shared/utils/collab-markdown-rich-text'
import {
  COLLAB_FREEFORM_RESOURCE_LABEL,
  COLLAB_NOTES_RESOURCE_LABEL,
  COLLAB_WORKFLOW_RESOURCE_LABEL,
  resolveCollabResourceDisplayLabel,
} from '~~/shared/utils/collab-resource'
import { createWorkspaceStreamSystemChatMessage } from '~~/shared/utils/workspace-ai-stream'
import {
  createWorkspaceLocalChatMessage,
  finalizeWorkspaceLocalChatMessages,
  markWorkspaceLocalChatMessagesAborted,
  toWorkspaceModelMessages,
} from '~~/shared/utils/workspace-chat-local-state'
import {
  MAX_WORKSPACE_LEFT_SIDEBAR_WIDTH,
  MAX_WORKSPACE_RIGHT_SIDEBAR_WIDTH,
  MIN_WORKSPACE_LEFT_SIDEBAR_WIDTH,
  MIN_WORKSPACE_MAIN_PANEL_WIDTH,
  MIN_WORKSPACE_RIGHT_SIDEBAR_WIDTH,
  normalizeWorkspaceLeftSidebarWidth,
  normalizeWorkspaceRightSidebarWidth,
  WORKSPACE_LEFT_SIDEBAR_RAIL_WIDTH,
} from '~~/shared/utils/workspace-layout'
import {
  buildProjectSettingsCommonPatch,
  cloneProjectCommonForm,
  createEmptyProjectCommonForm,
  createProjectCommonFormFromProject,
} from '~/composables/project-settings'
import {
  normalizeQueryValue as normalizeQueryParam,
  teamDashboardPath,
  teamDetailPath,
} from '~/composables/team-ui'
import { useCollabSession } from '~/composables/useCollabSession'
import {
  defaultWorkspaceDisplayPreferenceSnapshot,
  useWorkspaceDisplayPreferenceApi,
} from '~/composables/useWorkspaceDisplayPreferences'
import { useWorkspaceProjectAi } from '~/composables/useWorkspaceProjectAi'
import { useWorkspaceProjectComments } from '~/composables/useWorkspaceProjectComments'
import { useWorkspaceProjectKnowledge } from '~/composables/useWorkspaceProjectKnowledge'
import { useWorkspaceProjectMeetings } from '~/composables/useWorkspaceProjectMeetings'
import { useWorkspaceProjectResources } from '~/composables/useWorkspaceProjectResources'
import { useWorkspaceProjectRoute, workspaceDetailPath } from '~/composables/useWorkspaceProjectRoute'
import { useWorkspaceProjectSettings, useWorkspaceProjectSettingsStorage } from '~/composables/useWorkspaceProjectSettings'
import {
  createMeetingCreateTabId,
  createResourceTabId,
  isProjectWorkspaceViewStateEqual,
  normalizeProjectWorkspaceViewState,
  resolveMeetingIdFromTabId,
  sanitizeProjectWorkspaceViewState,
  useWorkspaceProjectShell,
  useWorkspaceProjectViewState,
  useWorkspaceProjectWorkbench,
} from '~/composables/useWorkspaceProjectShell'
import { useWorkspaceSidebarLayout } from '~/composables/useWorkspaceSidebarLayout'
import { resolveAuthDisplayMessage, resolveAuthRequestErrorInfo } from '~/utils/auth-request'
import {
  isCollabMarkdownHeadingAnchorHashForResource,
} from '~/utils/collab-markdown-navigation'
import { createDefenseRealtimeProviderBridge } from '~/utils/defense-realtime-bridge'
import { createDefenseRealtimeMediaController } from '~/utils/defense-realtime-media-controller'
import {
  isProjectUploadTaskSidebarVisible,
} from '~/utils/project-upload'
import {
  buildDrawioXmlFromWorkflowDraft,
  buildWorkflowDraftKey,
  createDefaultDrawioXml,
  parseDrawioXmlToWorkflowSnapshot,
  resolveDrawioCollabValue,
  serializeDrawioCollabValue,
} from '~/utils/workspace-drawio'
import {
  isDesignCanvasResource,
  resolveCollabPurpose,
  resolveCollabResourceIcon,
  resolveCollabResourceLabel,
} from '~/utils/workspace-left-sidebar-helpers'
import {
  buildWorkspaceMetaKSections,
  matchAndSortWorkspaceMetaKItems,
  resolveWorkspaceMetaKShortcutLabel,
} from '~/utils/workspace-metak'
import {
  buildDesignWorkspaceOutlineNodes,
  buildMarkdownWorkspaceOutlineNodes,
  buildProjectWorkspaceOutlineNodes,
  buildWorkflowWorkspaceOutlineNodes,
  parseWorkspaceOutlineNavigationHash,
  parseWorkspaceOutlineDesignDocument,
} from '~/utils/workspace-outline'
import {
  clamp,
  cloneProjectAdaptationForm,
  createEmptyProjectAdaptationForm,
  createProjectAdaptationFormFromSnapshot,
  linesToArray,
  parseFileSizeFromResource,
  resolveApiErrorMessage,
  resolveApiStatusCode,
  sortByUpdatedAtDesc,
  validateUploadFiles,
} from '~/utils/workspace-project-helpers'
import {
  buildFreeformCollabValueFromSceneDraft,
  buildSceneDraftKey,
  buildSceneDraftSource,
  computeSceneDocumentHash,
} from '~/utils/workspace-scene'
import { formatWorkspaceShortcutLabel } from '~/utils/workspace-shortcuts'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: '研发工作台',
  link: [
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
  patchUserDefaults: patchUserWorkspaceDisplayDefaultsByApi,
  patchWorkspaceUserOverride: patchWorkspaceDisplayUserOverrideByApi,
  patchWorkspaceTeamDefault: patchWorkspaceDisplayTeamDefaultByApi,
} = useWorkspaceDisplayPreferenceApi()
const {
  topicBoardConfirmState,
  deviceRestoreConfirmState,
  openSettingsSignal,
  openLoopyDataSignal,
  openMemberManagementSignal,
  openDisplayPreferencesSignal,
  openFlowSignal,
  openPreviewSignal,
  closePreviewSignal,
  accountCenterVisible,
  leftSidebarMetaKSignal,
  leftSidebarMetaKModuleId,
  leftSidebarMetaKOutlineId,
  metaKOpen,
  metaKQuery,
  metaKShortcutLabel,
  statusLine,
  resolveTopicBoardConfirm,
  askTopicBoardConfirm,
  resolveDeviceRestoreConfirm,
  askDeviceRestoreConfirm,
} = useWorkspaceProjectShell()

interface HydratedProjectWorkspaceViewStateResult {
  state: ProjectWorkspaceViewState
  bundle: {
    current?: ProjectWorkspaceViewPreference | null
    latestOther?: ProjectWorkspaceViewPreference | null
    personalAiTabs?: ProjectWorkspaceAiTabsPreference | null
    resolution: {
      isNewDevice: boolean
      isStaleDevice: boolean
    }
  } | null
  hasManagedQuery: boolean
  legacyDesignUnavailable: boolean
}

type CollabWorkspaceResource = Resource & (
  { source: 'collab' }
  | { resourceKind: 'markdown' | 'draw' }
)

type DeviceRestoreChoice = 'sync' | 'keep'

interface ProjectSettingsDraftHydrationResult {
  bundle: ProjectSettingsDraftDevicePayload | null
  localDraft: WorkspaceProjectSettingsDraftCache | null
  currentDraft: WorkspaceProjectSettingsDraftCache | null
  latestOtherDraft: WorkspaceProjectSettingsDraftCache | null
  appliedDraft: WorkspaceProjectSettingsDraftCache | null
  source: 'local' | 'current' | 'latest_other' | ''
}

type WorkspaceRightSidebarView = 'ai' | 'comments'

interface MarkdownDocumentAssistRequestState {
  resourceId: string
  resourceTitle: string
  markdown: string
  selectionText: string
  selectionRange: AiWorkspaceDocumentSelectionRange | null
}

interface WorkflowDraftRequestOptions {
  action: WorkflowDraftAction
  template: 'flowchart' | 'mindmap' | 'er' | 'architecture'
  architectureView?: WorkflowArchitectureView
  stylePreset: WorkflowStylePreset
  layoutPreset: WorkflowLayoutPreset
}

interface SceneDraftRequestOptions {
  action: WorkflowDraftAction
  template: 'flowchart' | 'mindmap' | 'er' | 'architecture'
  architectureView?: WorkflowArchitectureView
  stylePreset: WorkflowStylePreset
  layoutPreset: WorkflowLayoutPreset
}

interface AiRuntimeFeatureStatus {
  configured: boolean
  provider: string
  model: string
  reason: string
}

interface ProjectWorkspaceAiRuntimeStatus {
  workspaceDialogAsk: AiRuntimeFeatureStatus
  workspaceAutoOptimize: AiRuntimeFeatureStatus
  workspaceIssueDiscovery: AiRuntimeFeatureStatus
  documentAssist: AiRuntimeFeatureStatus
  documentSummarize: AiRuntimeFeatureStatus
  documentRewrite: AiRuntimeFeatureStatus
  documentContinue: AiRuntimeFeatureStatus
  documentExpand: AiRuntimeFeatureStatus
  documentCompleteContext: AiRuntimeFeatureStatus
  documentRestructure: AiRuntimeFeatureStatus
  canvasGenerate: AiRuntimeFeatureStatus
  canvasComplete: AiRuntimeFeatureStatus
  canvasRefine: AiRuntimeFeatureStatus
  defense: AiRuntimeFeatureStatus
  contestFilter: AiRuntimeFeatureStatus
  topicProposal: AiRuntimeFeatureStatus
  projectChat: AiRuntimeFeatureStatus
}

type ProjectWorkspaceAiFeatureKey = keyof ProjectWorkspaceAiRuntimeStatus
type DocumentAssistFeatureKey
  = 'documentSummarize'
    | 'documentRewrite'
    | 'documentContinue'
    | 'documentExpand'
    | 'documentCompleteContext'
    | 'documentRestructure'

const AI_RUNTIME_FEATURE_LABELS: Record<ProjectWorkspaceAiFeatureKey, string> = {
  workspaceDialogAsk: '工作台 AI',
  workspaceAutoOptimize: '工作台 AI',
  workspaceIssueDiscovery: '工作台 AI',
  documentAssist: 'AgentDoc AI',
  documentSummarize: '文稿总结 AI',
  documentRewrite: '文稿润写 AI',
  documentContinue: '文稿续写 AI',
  documentExpand: '文稿扩写 AI',
  documentCompleteContext: '文稿补全上下文 AI',
  documentRestructure: '文稿结构整理 AI',
  canvasGenerate: '画布生成 AI',
  canvasComplete: '画布补全 AI',
  canvasRefine: '画布续改 AI',
  defense: '答辩 AI',
  contestFilter: '赛事筛选 AI',
  topicProposal: '选题助手 AI',
  projectChat: '项目对话 AI',
}

const DOCUMENT_ASSIST_FEATURE_KEY_MAP: Record<AiWorkspaceDocumentAction, DocumentAssistFeatureKey> = {
  summarize: 'documentSummarize',
  rewrite: 'documentRewrite',
  continue: 'documentContinue',
  expand: 'documentExpand',
  complete_context: 'documentCompleteContext',
  restructure: 'documentRestructure',
}

function splitTopicBoardTags(text: string): string[] {
  return String(text || '')
    .split(/[\n,，、]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function cloneProjectContestBindings(value: WorkspaceProjectContestBindingForm[]): WorkspaceProjectContestBindingForm[] {
  return value.map(item => ({
    contestId: item.contestId,
    trackId: item.trackId,
    sortOrder: item.sortOrder,
  }))
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeWorkspaceContextualAssistantKey(value: unknown): WorkspaceContextualAssistantKey | '' {
  const normalized = normalizeString(value)
  if (normalized === 'agent_doc' || normalized === 'agent_proto' || normalized === 'design_assistant')
    return normalized
  return ''
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
  if (isCollabResource(resource))
    return resolveCollabResourceLabel(resource)
  return '未命名资源'
}

function resolveMetaKResourceIcon(resource: Resource): string {
  if (isCollabResource(resource))
    return resolveCollabResourceIcon(resource)
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
  provider: DefenseRealtimeProvider
  mediaMode: DefenseRealtimeMediaMode
  realtime?: DefenseRealtimeSessionMeta | null
}

interface DefenseRealtimeBootstrapResponse {
  bootstrap: DefenseRealtimeBootstrapPayload
  state: AiDefenseSessionState | null
  session: AiChatSession | null
}

type WorkspaceProjectSettingsDraftCache = ProjectSettingsDraftPayload
type WorkspaceMainTabId = WorkspaceOpenTabState
type WorkspaceWorkbenchMode = ProjectWorkbenchMode
type WorkspacePrimaryAiMode = Exclude<WorkspaceAiMode, 'defense'>
type WorkspaceProjectAssistantMode = 'contextual' | 'dialog_ask'
type WorkspaceDefenseWorkbenchAiMode = Exclude<WorkspaceAiMode, 'document_assist' | 'contextual_agent'>
type WorkbenchSwitchPhase = 'idle' | 'loading' | 'animating'
type WorkbenchSceneTransitionName = 'workspace-workbench-scene-forward' | 'workspace-workbench-scene-backward'
interface WorkspaceProjectContextualAssistant {
  key: WorkspaceContextualAssistantKey
  preset: WorkspaceAiAssistantPreset
  label: string
  aiMode: Extract<WorkspaceAiMode, 'contextual_agent' | 'document_assist'>
}
type WorkspaceLeftSidebarCommandModuleId = 'resource_manager' | 'analysis'
type FinalReviewChecklistStatus = 'pass' | 'warning' | 'missing'

interface FinalReviewChecklistItem {
  id: string
  title: string
  description: string
  status: FinalReviewChecklistStatus
  blocker?: boolean
}

const WORKSPACE_MEMBER_MANAGE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']
const WORKBENCH_MODE_ORDER: WorkspaceWorkbenchMode[] = ['project', 'defense', 'final_review']
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

const { routeWorkspaceId, routeProjectId, highlightedProjectId, ensureCanonicalWorkspaceProjectRoute } = useWorkspaceProjectRoute()
const {
  naturalQuery,
  major,
  discipline,
  level,
  trackType,
  topK,
  topicBoardDraft,
  topicBoardLoading,
  topicBoardFetching,
  topicBoardError,
  topicBoardSnapshot,
  topicBoardHistory,
  topicBoardActioningCandidateId,
  topicBoardCreateSeedHandled,
  contests,
  contestCatalog,
  aiReasoning,
  normalizedInfo,
  chatMessages,
  chatSessions,
  openChatSessionIds,
  activeChatSessionId,
  chatInput,
  chatMissingFields,
  chatDraft,
  aiMode,
  workbenchMode,
  lastPrimaryAiMode,
  projectAssistantMode,
  defenseWorkbenchAiMode,
  finalReviewMaterialsOpen,
  finalReviewAssistantOpen,
  preFinalReviewLeftCollapsed,
  preFinalReviewRightCollapsed,
  preFinalReviewActiveMainTabId,
  preFinalReviewOpenTabs,
  aiFiltering,
  chatLoading,
  chatInterrupting,
  chatSessionsLoading,
  formSubmitting,
  aiChangeRequests,
  aiChangeRequestsLoading,
  aiChangeActingIds,
  aiChangeSecondConfirmIds,
  projectIssueReports,
  projectIssues,
  issueCenterLoading,
  issueReportSubmitting,
  issueReportExporting,
  metaKRemoteLoading,
  defenseRounds,
  defenseTurns,
  defenseScorecard,
  defensePersonas,
  defensePersonasLoading,
  defenseSessionMeta,
  defenseSessionState,
  defenseSummary,
  defenseSummaryLoading,
  defenseStage,
  defenseTurnCount,
  formState,
  resetChatState,
} = useWorkspaceProjectAi()
let topicBoardLoadRequestId = 0
let topicBoardWriteRequestId = 0
let projectResourcePreviewRequestId = 0
let chatMessagesRequestId = 0
let chatSessionsRequestId = 0
let defenseSessionDetailRequestId = 0
const activeChatStreamAbortController = ref<AbortController | null>(null)
const deletingChatSessionId = ref('')
const chatMessagesLoading = ref(false)
const {
  resources,
  recycleResources,
  resourceLibrary,
  projectResourceShares,
  projectOutlineSnapshot,
  flowResourceId,
  previewResourceId,
  collabBindingResourceId,
  closingPreviewResourceId,
  previewStatusLoading,
  previewStatusPayload,
  previewMode,
  markdownDerivedTitleMap,
  resourcesLoading,
  resourceLibraryLoading,
  projectOutlineLoading,
  projectOutlineFirstLoaded,
  projectResourceSharesLoading,
  resourceMutating,
} = useWorkspaceProjectResources()
const collabPreviewLoading = ref(false)
const collabPreviewError = ref('')
const workspaceMembers = ref<ProjectMemberSummary[]>([])
const workspaceInvitations = ref<ProjectInvitationSummary[]>([])
const selectedContestDetail = ref<ContestDetailPayload | null>(null)
const projects = ref<Project[]>([])
const allProjects = ref<Project[]>([])
const me = ref<AuthMeResult | null>(null)
const activeWorkspaceId = ref('')
const selectedContestId = ref('')
const selectedTrackId = ref('')
const {
  leftSidebarCollapsed,
  leftSidebarWidth,
  rightSidebarUserCollapsed,
  rightSidebarWidth,
  sidebarLayoutHydrating,
  rightSidebarCollapsed,
  initializeRightSidebarBreakpointTracking,
  disposeRightSidebarBreakpointTracking,
  setRightSidebarUserCollapsed,
  setLeftSidebarWidth,
  setRightSidebarWidth,
  applySidebarLayoutState,
  collapseRightSidebar,
  expandRightSidebar,
} = useWorkspaceSidebarLayout()
const openMainTabs = ref<WorkspaceMainTabId[]>([])
const activeMainTabId = ref<WorkspaceMainTabId | ''>('')
const {
  rememberPreFinalReviewWorkbenchState,
  restorePreFinalReviewWorkbenchState,
  closeFinalReviewDrawers,
  toggleFinalReviewMaterialsDrawer,
  toggleRightSidebar,
  ensureWorkspaceMainTabOpen,
  ensureMeetingDetailTabOpen,
  ensureMeetingCreateTabOpen,
} = useWorkspaceProjectWorkbench({
  openMainTabs,
  activeMainTabId,
  leftSidebarCollapsed,
  rightSidebarCollapsed,
  setRightSidebarUserCollapsed,
  collapseRightSidebar,
  expandRightSidebar,
  workbenchMode,
  aiMode,
  lastPrimaryAiMode,
  finalReviewMaterialsOpen,
  finalReviewAssistantOpen,
  preFinalReviewLeftCollapsed,
  preFinalReviewRightCollapsed,
  preFinalReviewActiveMainTabId: preFinalReviewActiveMainTabId as typeof activeMainTabId,
  preFinalReviewOpenTabs: preFinalReviewOpenTabs as typeof openMainTabs,
})
const workspaceMainPanelRef = ref<{
  applyMarkdownDocumentDraft: (payload: AiWorkspaceDocumentDraft) => boolean
  applyMarkdownDocumentAssistResult: (payload: { action: AiWorkspaceDocumentAction, text: string }) => boolean
  openActiveSearch: () => boolean
  scrollToMarkdownCommentThread: (threadId: string) => void
  scrollToMarkdownHeadingAnchor: (anchorId: string) => boolean
  locateDesignOutlineItem: (node: WorkspaceOutlineNode) => boolean
  locateWorkflowOutlineItem: (node: WorkspaceOutlineNode) => boolean
  saveCurrentPanel: () => { handled: boolean, reason?: string }
  canCloseCurrentTab: () => boolean
  closeCurrentTab: () => { handled: boolean, reason?: string }
} | null>(null)
const rightSidebarView = ref<WorkspaceRightSidebarView>('ai')
const documentAssistRequestState = reactive<MarkdownDocumentAssistRequestState>({
  resourceId: '',
  resourceTitle: '',
  markdown: '',
  selectionText: '',
  selectionRange: null,
})
const appliedAgentDocDraftKeys = ref<string[]>([])

function clearLoadedScopeSnapshots(): void {
  resourcesLoadedProjectId.value = ''
  resourceLibraryLoadedProjectId.value = ''
  projectResourceSharesLoadedProjectId.value = ''
  selectedContestDetailContestId.value = ''
  mappingLoadedScopeKey.value = ''
  chatSessionsLoadedScopeKey.value = ''
  chatMessagesLoadedSessionId.value = ''
}

function resetChatDraftArtifactState(): void {
  appliedAgentDocDraftKeys.value = []
  appliedWorkflowDraftKeys.value = []
  discardedWorkflowDraftKeys.value = []
  appliedSceneDraftKeys.value = []
  discardedSceneDraftKeys.value = []
}

function clearActiveChatArtifacts(options: {
  preserveMessages?: boolean
} = {}): void {
  if (options.preserveMessages) {
    chatDraft.value = null
    chatMissingFields.value = []
    defenseRounds.value = []
    defenseTurns.value = []
    defenseScorecard.value = null
    defenseSessionMeta.value = null
    defenseSessionState.value = null
    defenseSummary.value = null
    defenseStage.value = undefined
    defenseTurnCount.value = 0
    resetDefenseRealtimeLocalState()
  }
  else {
    resetChatState()
    resetDefenseRealtimeLocalState()
  }
  resetChatDraftArtifactState()
}

function resetChatScopeState(): void {
  chatSessions.value = []
  openChatSessionIds.value = []
  activeChatSessionId.value = ''
  chatSessionsLoading.value = false
  chatMessagesLoading.value = false
  chatSessionsLoadedScopeKey.value = ''
  chatMessagesLoadedSessionId.value = ''
  clearActiveChatArtifacts()
}

const workflowSnapshotState = ref<WorkflowSnapshot | null>(null)
const workflowSnapshotSyncTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const workflowDrawioLegacyUnavailable = ref(false)
const workflowDrawioLegacyMessage = ref('')
const workflowCanvasRebuildConfirmVisible = ref(false)
const appliedWorkflowDraftKeys = ref<string[]>([])
const discardedWorkflowDraftKeys = ref<string[]>([])
const appliedSceneDraftKeys = ref<string[]>([])
const discardedSceneDraftKeys = ref<string[]>([])
const selectedContestDetailLoading = ref(false)
const resourcesLoadedProjectId = ref('')
const resourceLibraryLoadedProjectId = ref('')
const projectResourceSharesLoadedProjectId = ref('')
const selectedContestDetailContestId = ref('')
const mappingLoadedScopeKey = ref('')
const chatSessionsLoadedScopeKey = ref('')
const chatMessagesLoadedSessionId = ref('')
const {
  projectSettingsLoading,
  projectSettingsSaveState,
  workspaceDisplayPreferenceSnapshot,
  workspaceDisplayPreferenceLoading,
  workspaceDisplayPreferenceSavingScope,
  workspaceDisplayPreferenceError,
  projectSettingsCommon,
  projectSettingsBindings,
  projectSettingsCurrentContestId,
  projectSettingsAdaptation,
  projectSettingsAdaptationDrafts,
  projectSettingsHydrating,
  projectSettingsCommonDirty,
  projectSettingsBindingsDirty,
  projectSettingsDirtyAdaptationContestIds,
  projectSettingsDraftServerRevision,
  workspaceDeviceId,
} = useWorkspaceProjectSettings()
const workspaceDisplayPreferenceWorkspaceId = ref('')
const {
  ensureWorkspaceDeviceId,
  resetProjectSettingsDraftServerState,
  readProjectSettingsDraftCache,
  writeProjectSettingsDraftCache,
  clearProjectSettingsDraftCache,
} = useWorkspaceProjectSettingsStorage({
  currentUserId: computed(() => String(me.value?.user.id || '').trim()),
  workspaceDeviceId,
  projectSettingsDraftServerRevision,
  normalizeDraftCachePayload: normalizeProjectSettingsDraftCachePayload,
})
const workspaceEffectiveDefaultLeftSidebarWidth = computed(() => {
  return normalizeWorkspaceLeftSidebarWidth(workspaceDisplayPreferenceSnapshot.value.effective.leftSidebarWidth)
})
const workspaceEffectiveDefaultRightSidebarWidth = computed(() => {
  return normalizeWorkspaceRightSidebarWidth(workspaceDisplayPreferenceSnapshot.value.effective.rightSidebarWidth)
})
const {
  projectMeetings,
  projectMeetingsLoadedProjectId,
  meetingRuntimeHealth,
  activeMeetingId,
  activeMeetingDetail,
  activeMeetingUtterances,
  meetingLiveCaptions,
  projectMeetingsLoading,
  meetingDetailLoading,
  meetingDetailLoadedId,
  meetingGuestShareLoading,
  meetingMutating,
  meetingJoinUrl,
  meetingJoinToken,
  meetingJoinExpiresAt,
  meetingRtcServerUrl,
  activeMeetingGuestShare,
  clearMeetingRealtimeRefreshTimer,
  clearMeetingJoinSession,
  applyProjectMeetingSession,
  loadProjectMeetingUtterances,
  loadProjectMeetingDetail,
  selectProjectMeeting,
  loadProjectMeetings,
  createProjectMeeting,
  submitProjectMeetingCreate,
  joinProjectMeeting,
  startProjectMeeting,
  endProjectMeeting,
  createProjectMeetingGuestShare,
  regenerateProjectMeetingGuestShare,
  revokeProjectMeetingGuestShare,
  handleMeetingRealtimeEnvelope,
} = useWorkspaceProjectMeetings({
  activeProjectId: computed(() => {
    if (!highlightedProjectId.value)
      return ''
    const matched = projects.value.find(item => item.id === highlightedProjectId.value)
    return matched?.id || ''
  }),
  currentUserId: computed(() => String(me.value?.user.id || '').trim()),
  openMainTabs,
  ensureMeetingDetailTabOpen,
  ensureMeetingCreateTabOpen,
  createMeetingCreateTabId,
  subscribeMeeting: meetingId => workspaceRealtime.subscribeMeeting(meetingId),
  onStatusLine: (message) => {
    statusLine.value = message
  },
})
const {
  applyProjectWorkspaceViewState,
  projectWorkspaceViewHydrating,
  projectWorkspaceModeHydrating,
  projectWorkspaceViewReady,
  clearProjectWorkspaceViewPersistTimer,
  hydrateProjectWorkspaceViewState,
  syncProjectWorkspaceViewState,
} = useWorkspaceProjectViewState({
  activeWorkspaceId,
  routeWorkspaceId,
  routeProjectId,
  highlightedProjectId,
  resources,
  openMainTabs,
  activeMainTabId,
  previewResourceId,
  selectedContestId,
  selectedTrackId,
  openChatSessionIds,
  activeChatSessionId,
  activeMeetingId,
  activeMeetingDetail,
  activeMeetingUtterances,
  meetingLiveCaptions,
  leftSidebarCollapsed,
  leftSidebarWidth,
  defaultLeftSidebarWidth: workspaceEffectiveDefaultLeftSidebarWidth,
  rightSidebarUserCollapsed,
  rightSidebarWidth,
  defaultRightSidebarWidth: workspaceEffectiveDefaultRightSidebarWidth,
  projectAssistantMode,
  rightSidebarView,
  setRightSidebarUserCollapsed,
  workbenchMode,
  aiMode,
  lastPrimaryAiMode,
  rememberPreFinalReviewWorkbenchState,
  closeFinalReviewDrawers,
  clearMeetingJoinSession,
  ensureWorkspaceDeviceId,
})

let projectSettingsDraftTimer: ReturnType<typeof setTimeout> | null = null
let projectSettingsDraftPersistSeq = 0
let projectOutlineGenerateTimer: ReturnType<typeof setTimeout> | null = null
let previewStatusPollTimer: ReturnType<typeof setInterval> | null = null
let realtimeProjectRefreshTimer: ReturnType<typeof setTimeout> | null = null
let fallbackResourceRefreshTimer: ReturnType<typeof setInterval> | null = null
let metaKRemoteSearchTimer: ReturnType<typeof setTimeout> | null = null
let metaKRemoteRequestSequence = 0
let unsubscribeRealtimeMessages: (() => void) | null = null
let workspaceDisplayWidthSyncTimer: ReturnType<typeof setTimeout> | null = null
let workspaceDisplayWidthSyncRunning = false
let pendingWorkspaceDisplayWidthSyncPayload: {
  workspaceId: string
  leftSidebarWidth: number
  rightSidebarWidth: number
} | null = null

const listLoading = ref(false)
const workspaceMemberManagementLoading = ref(false)
const workspaceInvitationSubmitting = ref(false)
const workspaceMemberRoleUpdatingUserId = ref('')
const workspaceMemberRemovingUserId = ref('')
const workspaceInvitationRevokingId = ref('')
const metaKRemoteLibraryItems = ref<WorkspaceMetaKItem[]>([])
const workspaceInvitationLink = ref('')
const workspaceInvitationError = ref('')
const workspaceSeatLimitSaveLoading = ref(false)
const workspaceSeatLimitError = ref('')
const workspaceSeatLimitUpdatedSignal = ref(0)
const projectSeatQuota = ref<ProjectSeatQuota | null>(null)
const headerAiCollapsed = computed(() => {
  return workbenchMode.value === 'final_review'
    ? !finalReviewAssistantOpen.value
    : rightSidebarCollapsed.value
})
const displayedWorkbenchMode = ref<WorkspaceWorkbenchMode>(workbenchMode.value)
const workbenchSwitchPhase = ref<WorkbenchSwitchPhase>('idle')
const workbenchSwitchTargetMode = ref<WorkspaceWorkbenchMode | ''>('')
const workbenchSwitchProgress = ref(0)
const workbenchSceneTransitionName = ref<WorkbenchSceneTransitionName>('workspace-workbench-scene-forward')
const prefersReducedMotion = ref(false)
const workbenchSwitchLoading = computed(() => workbenchSwitchPhase.value === 'loading')
const workbenchSwitching = computed(() => workbenchSwitchPhase.value !== 'idle')
const workspaceSceneLayoutTestId = computed(() => {
  if (displayedWorkbenchMode.value === 'defense')
    return 'workspace-defense-layout'
  if (displayedWorkbenchMode.value === 'final_review')
    return 'workspace-final-review-layout'
  return 'workspace-project-layout'
})
let reducedMotionMediaQuery: MediaQueryList | null = null
let workbenchSceneTransitionResolver: (() => void) | null = null
const activeWorkbenchSwitchDelayIds = new Set<ReturnType<typeof setTimeout>>()
let activeWorkspaceSidebarResizeCleanup: (() => void) | null = null
const workspaceShellRef = ref<HTMLElement | null>(null)
const workspaceSidebarResizeState = reactive<WorkspaceSidebarResizeState>({
  active: false,
  side: '',
})

function isWorkspaceSidebarResizeAvailable(): boolean {
  if (!import.meta.client)
    return false
  if (displayedWorkbenchMode.value !== 'project')
    return false
  return window.matchMedia('(min-width: 1280px)').matches
}

function clampWorkspaceSidebarWidthForSide(side: WorkspaceSidebarResizeSide, nextWidth: number): number {
  const shellWidth = Math.max(0, workspaceShellRef.value?.clientWidth || 0)
  const otherWidth = side === 'left'
    ? (rightSidebarCollapsed.value ? 0 : rightSidebarWidth.value)
    : (leftSidebarCollapsed.value ? WORKSPACE_LEFT_SIDEBAR_RAIL_WIDTH : leftSidebarWidth.value)
  const minWidth = side === 'left'
    ? MIN_WORKSPACE_LEFT_SIDEBAR_WIDTH
    : MIN_WORKSPACE_RIGHT_SIDEBAR_WIDTH
  const maxWidth = side === 'left'
    ? MAX_WORKSPACE_LEFT_SIDEBAR_WIDTH
    : MAX_WORKSPACE_RIGHT_SIDEBAR_WIDTH
  const normalized = side === 'left'
    ? normalizeWorkspaceLeftSidebarWidth(nextWidth)
    : normalizeWorkspaceRightSidebarWidth(nextWidth)

  if (!shellWidth)
    return normalized

  const layoutMaxWidth = shellWidth - otherWidth - MIN_WORKSPACE_MAIN_PANEL_WIDTH
  const safeMaxWidth = Math.max(minWidth, Math.min(maxWidth, layoutMaxWidth))
  return Math.min(safeMaxWidth, Math.max(minWidth, normalized))
}

function finishWorkspaceSidebarResize(shouldPersist = true): void {
  activeWorkspaceSidebarResizeCleanup?.()
  activeWorkspaceSidebarResizeCleanup = null

  const shouldSync = workspaceSidebarResizeState.active && shouldPersist
  workspaceSidebarResizeState.active = false
  workspaceSidebarResizeState.side = ''

  if (shouldSync) {
    void syncProjectWorkspaceViewState()
    scheduleWorkspaceDisplayWidthUserSync()
  }
}

function startWorkspaceSidebarResize(side: WorkspaceSidebarResizeSide, event: PointerEvent): void {
  if (event.button !== 0)
    return
  if (!isWorkspaceSidebarResizeAvailable())
    return
  if (side === 'left' && leftSidebarCollapsed.value)
    return
  if (side === 'right' && rightSidebarCollapsed.value)
    return

  finishWorkspaceSidebarResize(false)
  event.preventDefault()

  const startClientX = event.clientX
  const startWidth = side === 'left' ? leftSidebarWidth.value : rightSidebarWidth.value
  const resizeHandle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const pointerId = event.pointerId
  workspaceSidebarResizeState.active = true
  workspaceSidebarResizeState.side = side

  try {
    resizeHandle?.setPointerCapture(pointerId)
  }
  catch {
  }

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const deltaX = moveEvent.clientX - startClientX
    const requestedWidth = side === 'left'
      ? startWidth + deltaX
      : startWidth - deltaX
    const nextWidth = clampWorkspaceSidebarWidthForSide(side, requestedWidth)
    if (side === 'left')
      setLeftSidebarWidth(nextWidth)
    else
      setRightSidebarWidth(nextWidth)
  }

  const handlePointerEnd = () => {
    finishWorkspaceSidebarResize(true)
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerEnd, { once: true })
  window.addEventListener('pointercancel', handlePointerEnd, { once: true })
  window.addEventListener('blur', handlePointerEnd, { once: true })
  resizeHandle?.addEventListener('lostpointercapture', handlePointerEnd, { once: true })
  activeWorkspaceSidebarResizeCleanup = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerEnd)
    window.removeEventListener('pointercancel', handlePointerEnd)
    window.removeEventListener('blur', handlePointerEnd)
    resizeHandle?.removeEventListener('lostpointercapture', handlePointerEnd)
    try {
      if (resizeHandle?.hasPointerCapture(pointerId))
        resizeHandle.releasePointerCapture(pointerId)
    }
    catch {
    }
  }
}

const workspaceBootstrapLoading = ref(false)
const workspaceCriticalLoading = workspaceBootstrapLoading
const workspaceBackgroundLoading = ref(false)
const activeTabReady = ref(false)
const aiRuntimeStatus = ref<ProjectWorkspaceAiRuntimeStatus | null>(null)
const aiRuntimeStatusLoaded = ref(false)
const aiRuntimeStatusLoading = ref(false)
const aiRuntimeStatusError = ref('')
const defenseRealtimeStarting = ref(false)
const defenseRealtimeProviderDraft = ref<DefenseRealtimeProvider>('qwen')
const defenseRealtimeMediaModeDraft = ref<DefenseRealtimeMediaMode>('audio_video')
const defenseRealtimeAudioEnabled = ref(true)
const defenseRealtimeVideoEnabled = ref(true)
const defenseRealtimeBootstrapState = ref<'idle' | 'bootstrapping' | 'ready' | 'error'>('idle')
const defenseRealtimeBootstrapPayload = ref<DefenseRealtimeBootstrapPayload | null>(null)
const defenseRealtimeLatestError = ref('')
const defenseRealtimeLatestSpeakerLabel = ref('')
const defenseRealtimeLatestLatencyMs = ref<number | null>(null)
const defenseRealtimeLogs = ref<Array<{
  id: string
  level: 'info' | 'warning' | 'error'
  message: string
  createdAt: string
}>>([])
let defenseRealtimeBridge: DefenseRealtimeProviderBridge | null = null
let defenseRealtimeBridgeCleanup: (() => void) | null = null
let defenseRealtimeMediaController: DefenseRealtimeMediaController | null = null
let defenseRealtimeEventFlushTimer: ReturnType<typeof setTimeout> | null = null
let defenseRealtimePendingEvents: DefenseRealtimeNormalizedEvent[] = []
const DEFENSE_REALTIME_DEFERRED_EVENT_TYPES = new Set<DefenseRealtimeNormalizedEvent['type']>([
  'user.transcript.partial',
  'assistant.transcript.delta',
  'latency',
])

let workspaceBootstrapRequestId = 0
const workspaceBootstrapStartedAt = ref(0)

type WorkspaceBootstrapMark = 'bootstrap:start' | 'bootstrap:shell-ready' | 'bootstrap:active-tab-ready' | 'bootstrap:overlay-hidden' | 'bootstrap:background-complete'
type WorkspaceBootstrapDeferredTaskId
  = 'resource-library'
    | 'resource-recycle'
    | 'resource-shares'
    | 'members'
    | 'outline'
    | 'settings'
    | 'contest-detail'
    | 'topic-boards'
    | 'ai-changes'
    | 'issues'
    | 'meetings'
    | 'chat-sessions'
    | 'defense-personas'

interface WorkspaceActiveTabLoadResult {
  deferredTaskIds: Set<WorkspaceBootstrapDeferredTaskId>
  draftHydrationResult: ProjectSettingsDraftHydrationResult | null
}

type WorkspaceEditableMenuAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'

interface WorkspaceTextControlContext {
  kind: 'text-control'
  field: HTMLInputElement | HTMLTextAreaElement
  canWrite: boolean
  hasSelection: boolean
  hasContent: boolean
}

interface WorkspaceRichTextContext {
  kind: 'rich-text'
  editorEl: HTMLElement
  canWrite: boolean
  hasSelection: boolean
  hasContent: boolean
}

type WorkspaceEditableContext = WorkspaceTextControlContext | WorkspaceRichTextContext
type WorkspaceSidebarResizeSide = 'left' | 'right'

interface WorkspaceSidebarResizeState {
  active: boolean
  side: WorkspaceSidebarResizeSide | ''
}

const workspacePlatform = ref('')
const workspaceContextMenu = reactive<{
  visible: boolean
  items: ContextMenuItem[]
  anchorPoint: { x: number, y: number } | null
  anchorEl: HTMLElement | null
  source: string
  restoreFocusEl: HTMLElement | null
}>({
  visible: false,
  items: [],
  anchorPoint: null,
  anchorEl: null,
  source: '',
  restoreFocusEl: null,
})

let workspaceContextMenuSelectHandler: ContextMenuRequest['onSelect'] | null = null
let workspaceContextMenuCloseHandler: ContextMenuRequest['onClose'] | null = null

function formatWorkspaceCommandShortcut(key: string, modifiers: Array<'mod' | 'shift' | 'alt'> = ['mod']): string {
  return formatWorkspaceShortcutLabel({
    key,
    modifiers,
  }, workspacePlatform.value)
}

function isWorkspaceSupportedTextField(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement)
    return true
  if (!(element instanceof HTMLInputElement))
    return false

  const normalizedType = String(element.type || 'text').trim().toLowerCase()
  return ['', 'text', 'search', 'tel', 'url', 'email', 'password'].includes(normalizedType)
}

function normalizeWorkspaceEventElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement)
    return target
  if (target instanceof Node)
    return target.parentElement
  return null
}

function resolveWorkspaceEditableContext(target: EventTarget | null): WorkspaceEditableContext | null {
  if (!import.meta.client)
    return null

  const sourceElement = normalizeWorkspaceEventElement(target)
  if (!sourceElement)
    return null

  const textField = sourceElement.closest('textarea, input')
  if (textField instanceof HTMLElement && isWorkspaceSupportedTextField(textField)) {
    const selectionStart = Number.isFinite(textField.selectionStart) ? Number(textField.selectionStart) : 0
    const selectionEnd = Number.isFinite(textField.selectionEnd) ? Number(textField.selectionEnd) : selectionStart
    return {
      kind: 'text-control',
      field: textField,
      canWrite: !textField.disabled && !textField.readOnly,
      hasSelection: selectionEnd > selectionStart,
      hasContent: textField.value.length > 0,
    }
  }

  const richTextRoot = sourceElement.closest('.ProseMirror, .tiptap, [contenteditable="true"]')
  if (!(richTextRoot instanceof HTMLElement))
    return null

  const selection = window.getSelection()
  const hasSelection = Boolean(
    selection
    && selection.rangeCount > 0
    && selection.anchorNode
    && selection.focusNode
    && richTextRoot.contains(selection.anchorNode)
    && richTextRoot.contains(selection.focusNode)
    && !selection.isCollapsed,
  )

  return {
    kind: 'rich-text',
    editorEl: richTextRoot,
    canWrite: richTextRoot.isContentEditable || richTextRoot.matches('.ProseMirror, .tiptap'),
    hasSelection,
    hasContent: Boolean(richTextRoot.textContent?.trim()),
  }
}

function buildEditableContextMenuItems(context: WorkspaceEditableContext): ContextMenuItem[] {
  return [
    {
      key: 'undo',
      label: '撤销',
      icon: 'undo',
      shortcutLabel: formatWorkspaceCommandShortcut('Z'),
      disabled: !context.canWrite,
    },
    {
      key: 'redo',
      label: '重做',
      icon: 'redo',
      shortcutLabel: formatWorkspaceCommandShortcut('Z', ['mod', 'shift']),
      disabled: !context.canWrite,
    },
    {
      key: 'cut',
      label: '剪切',
      icon: 'content_cut',
      shortcutLabel: formatWorkspaceCommandShortcut('X'),
      separatorBefore: true,
      disabled: !context.canWrite || !context.hasSelection,
    },
    {
      key: 'copy',
      label: '复制',
      icon: 'content_copy',
      shortcutLabel: formatWorkspaceCommandShortcut('C'),
      disabled: !context.hasSelection,
    },
    {
      key: 'paste',
      label: '粘贴',
      icon: 'content_paste',
      shortcutLabel: formatWorkspaceCommandShortcut('V'),
      disabled: !context.canWrite,
    },
    {
      key: 'selectAll',
      label: '全选',
      icon: 'select_all',
      shortcutLabel: formatWorkspaceCommandShortcut('A'),
      separatorBefore: true,
      disabled: !context.hasContent,
    },
  ]
}

function focusWorkspaceElement(element: HTMLElement | null): void {
  if (!element || !element.isConnected)
    return

  nextTick(() => {
    if (typeof element.focus === 'function')
      element.focus({ preventScroll: true })
  })
}

function closeWorkspaceContextMenu(options: { restoreFocus?: boolean, invokeCloseHandler?: boolean } = {}): void {
  const restoreFocus = options.restoreFocus !== false
  const invokeCloseHandler = options.invokeCloseHandler !== false
  const restoreFocusEl = workspaceContextMenu.restoreFocusEl
  const closeHandler = workspaceContextMenuCloseHandler

  workspaceContextMenu.visible = false
  workspaceContextMenu.items = []
  workspaceContextMenu.anchorPoint = null
  workspaceContextMenu.anchorEl = null
  workspaceContextMenu.source = ''
  workspaceContextMenu.restoreFocusEl = null
  workspaceContextMenuSelectHandler = null
  workspaceContextMenuCloseHandler = null

  if (invokeCloseHandler)
    closeHandler?.()
  if (restoreFocus)
    focusWorkspaceElement(restoreFocusEl)
}

function openWorkspaceContextMenu(request: ContextMenuRequest): void {
  if (resolveWorkspaceShellLoadingState() || !request.items.length)
    return

  closeWorkspaceContextMenu({
    restoreFocus: false,
  })

  workspaceContextMenu.visible = true
  workspaceContextMenu.items = request.items
  workspaceContextMenu.anchorPoint = request.anchorPoint || null
  workspaceContextMenu.anchorEl = request.anchorEl || null
  workspaceContextMenu.source = String(request.source || '').trim()
  workspaceContextMenu.restoreFocusEl = request.restoreFocusEl || request.anchorEl || null
  workspaceContextMenuSelectHandler = request.onSelect || null
  workspaceContextMenuCloseHandler = request.onClose || null
}

function normalizeWorkspaceCommandReason(reason: string, fallback: string): string {
  const normalized = String(reason || '').trim().replace(/[。！]+$/g, '')
  return normalized || fallback
}

function executeWorkspaceSaveCommand(): void {
  const panel = workspaceMainPanelRef.value
  if (!panel) {
    statusLine.value = '当前面板没有可保存内容'
    return
  }

  const result = panel.saveCurrentPanel()
  if (result.handled)
    return

  statusLine.value = normalizeWorkspaceCommandReason(result.reason || '', '当前面板没有可保存内容')
}

function executeWorkspaceCloseTabCommand(): void {
  const panel = workspaceMainPanelRef.value
  if (!panel) {
    statusLine.value = '当前标签不可关闭'
    return
  }

  const result = panel.closeCurrentTab()
  if (result.handled)
    return

  statusLine.value = normalizeWorkspaceCommandReason(result.reason || '', '当前标签不可关闭')
}

function buildBlankWorkspaceContextMenuItems(): ContextMenuItem[] {
  return [
    {
      key: 'openCommandPalette',
      label: '搜索/命令面板',
      icon: 'search',
      shortcutLabel: formatWorkspaceCommandShortcut('K'),
    },
    {
      key: 'saveCurrentPanel',
      label: '保存当前面板',
      icon: 'save',
      shortcutLabel: formatWorkspaceCommandShortcut('S'),
      disabled: !workspaceMainPanelRef.value,
    },
    {
      key: 'closeCurrentTab',
      label: '关闭当前标签',
      icon: 'close',
      shortcutLabel: formatWorkspaceCommandShortcut('W'),
      disabled: !workspaceMainPanelRef.value?.canCloseCurrentTab(),
    },
  ]
}

function openBlankWorkspaceContextMenu(options: {
  anchorPoint?: { x: number, y: number } | null
  anchorEl?: HTMLElement | null
  restoreFocusEl?: HTMLElement | null
} = {}): void {
  openWorkspaceContextMenu({
    source: 'workspace-blank',
    items: buildBlankWorkspaceContextMenuItems(),
    anchorPoint: options.anchorPoint || null,
    anchorEl: options.anchorEl || null,
    restoreFocusEl: options.restoreFocusEl || options.anchorEl || null,
    onSelect: (key) => {
      switch (key) {
        case 'openCommandPalette':
          openMetaK()
          return
        case 'saveCurrentPanel':
          executeWorkspaceSaveCommand()
          return
        case 'closeCurrentTab':
          executeWorkspaceCloseTabCommand()
      }
    },
  })
}

function focusWorkspaceRichEditor(editorEl: HTMLElement): void {
  if (editorEl.matches('.tiptap')) {
    const nestedEditor = editorEl.querySelector<HTMLElement>('.ProseMirror, [contenteditable="true"]')
    if (nestedEditor) {
      nestedEditor.focus({ preventScroll: true })
      return
    }
  }
  editorEl.focus({ preventScroll: true })
}

function dispatchWorkspaceTextFieldInput(field: HTMLInputElement | HTMLTextAreaElement): void {
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function resolveWorkspaceTextFieldSelection(field: HTMLInputElement | HTMLTextAreaElement): {
  start: number
  end: number
  text: string
} {
  const start = Math.max(0, Number(field.selectionStart) || 0)
  const end = Math.max(start, Number(field.selectionEnd) || start)
  return {
    start,
    end,
    text: field.value.slice(start, end),
  }
}

async function writeWorkspaceClipboardText(
  text: string,
  fallback?: () => boolean,
): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  }
  catch {
  }

  return fallback ? fallback() : false
}

async function readWorkspaceClipboardText(): Promise<string> {
  if (!navigator.clipboard?.readText)
    throw new Error('clipboard-unavailable')
  return navigator.clipboard.readText()
}

function executeWorkspaceRichTextCommand(command: string, editorEl: HTMLElement): boolean {
  focusWorkspaceRichEditor(editorEl)
  return document.execCommand(command)
}

async function executeEditableContextMenuAction(
  key: string,
  context: WorkspaceEditableContext,
): Promise<void> {
  const action = key as WorkspaceEditableMenuAction
  if (context.kind === 'text-control') {
    const field = context.field
    const selection = resolveWorkspaceTextFieldSelection(field)

    field.focus({ preventScroll: true })

    switch (action) {
      case 'undo':
        document.execCommand('undo')
        return
      case 'redo':
        document.execCommand('redo')
        return
      case 'cut': {
        const copied = await writeWorkspaceClipboardText(selection.text, () => {
          try {
            field.setSelectionRange(selection.start, selection.end)
          }
          catch {
          }
          return document.execCommand('copy')
        })
        if (!copied) {
          statusLine.value = '剪切失败，当前环境不支持访问剪贴板'
          return
        }
        field.setRangeText('', selection.start, selection.end, 'start')
        dispatchWorkspaceTextFieldInput(field)
        return
      }
      case 'copy': {
        const copied = await writeWorkspaceClipboardText(selection.text, () => {
          try {
            field.setSelectionRange(selection.start, selection.end)
          }
          catch {
          }
          return document.execCommand('copy')
        })
        if (!copied)
          statusLine.value = '复制失败，当前环境不支持访问剪贴板'
        return
      }
      case 'paste': {
        try {
          const text = await readWorkspaceClipboardText()
          field.setRangeText(text, selection.start, selection.end, 'end')
          dispatchWorkspaceTextFieldInput(field)
        }
        catch {
          statusLine.value = '粘贴失败，当前环境不支持读取剪贴板'
        }
        return
      }
      case 'selectAll':
        field.select()
        return
    }
  }

  const editorEl = context.editorEl
  switch (action) {
    case 'undo':
      executeWorkspaceRichTextCommand('undo', editorEl)
      return
    case 'redo':
      executeWorkspaceRichTextCommand('redo', editorEl)
      return
    case 'cut':
      if (!executeWorkspaceRichTextCommand('cut', editorEl))
        statusLine.value = '剪切失败，当前环境不支持访问剪贴板'
      return
    case 'copy':
      if (!executeWorkspaceRichTextCommand('copy', editorEl))
        statusLine.value = '复制失败，当前环境不支持访问剪贴板'
      return
    case 'paste':
      if (!executeWorkspaceRichTextCommand('paste', editorEl))
        statusLine.value = '粘贴失败，当前环境不支持读取剪贴板'
      return
    case 'selectAll':
      executeWorkspaceRichTextCommand('selectAll', editorEl)
  }
}

function hasBlockingWorkspaceDialogOpen(): boolean {
  if (!import.meta.client)
    return false
  if (metaKOpen.value || topicBoardConfirmState.visible || deviceRestoreConfirmState.visible || accountCenterVisible.value)
    return true
  return Boolean(document.querySelector('.arco-modal-container .arco-modal'))
}

async function handleWorkspaceContextMenuSelect(key: string): Promise<void> {
  const selectHandler = workspaceContextMenuSelectHandler
  closeWorkspaceContextMenu({
    invokeCloseHandler: false,
  })
  await selectHandler?.(key)
}

function isWorkspaceContextMenuHotkey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

function handleWorkspaceKeyboardContextMenu(event: KeyboardEvent): boolean {
  if (!import.meta.client || !isWorkspaceContextMenuHotkey(event))
    return false

  if (resolveWorkspaceShellLoadingState()) {
    event.preventDefault()
    closeWorkspaceContextMenu({
      restoreFocus: false,
    })
    return true
  }

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (!activeElement)
    return false

  const editableContext = resolveWorkspaceEditableContext(activeElement)
  if (editableContext) {
    event.preventDefault()
    openWorkspaceContextMenu({
      source: 'workspace-editable',
      items: buildEditableContextMenuItems(editableContext),
      anchorEl: activeElement,
      restoreFocusEl: activeElement,
      onSelect: key => executeEditableContextMenuAction(key, editableContext),
    })
    return true
  }

  if (!workspaceShellRef.value?.contains(activeElement))
    return false
  if (activeElement.closest('[data-context-menu-scope]'))
    return false

  event.preventDefault()
  openBlankWorkspaceContextMenu({
    anchorEl: activeElement,
    restoreFocusEl: activeElement,
  })
  return true
}

function handleWorkspaceGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && workspaceContextMenu.visible) {
    event.preventDefault()
    event.stopPropagation()
    closeWorkspaceContextMenu()
    return
  }

  if (event.isComposing || event.defaultPrevented)
    return

  if (handleWorkspaceKeyboardContextMenu(event))
    return

  if (isWorkspaceMetaKHotkey(event)) {
    if (isWorkspaceMetaKEditableTarget(event.target) || hasBlockingWorkspaceDialogOpen())
      return

    event.preventDefault()
    openMetaK()
    return
  }

  const normalizedKey = event.key.toLowerCase()
  if (!(event.metaKey || event.ctrlKey) || event.altKey)
    return

  if (normalizedKey === 's' && !event.shiftKey) {
    event.preventDefault()
    if (hasBlockingWorkspaceDialogOpen())
      return
    executeWorkspaceSaveCommand()
    return
  }

  if (normalizedKey === 'f' && !event.shiftKey) {
    event.preventDefault()
    if (hasBlockingWorkspaceDialogOpen())
      return

    const handled = workspaceMainPanelRef.value?.openActiveSearch() || false
    if (!handled)
      statusLine.value = '当前内容暂未提供搜索能力。'
    return
  }

  if (normalizedKey === 'w' && !event.shiftKey) {
    event.preventDefault()
    if (hasBlockingWorkspaceDialogOpen())
      return
    executeWorkspaceCloseTabCommand()
  }
}

function handleWorkspaceShellContextMenu(event: MouseEvent): void {
  if (event.defaultPrevented)
    return

  if (workbenchSwitchPhase.value !== 'idle') {
    event.preventDefault()
    event.stopPropagation()
    closeWorkspaceContextMenu({
      restoreFocus: false,
    })
    return
  }

  if (resolveWorkspaceShellLoadingState()) {
    event.preventDefault()
    event.stopPropagation()
    closeWorkspaceContextMenu({
      restoreFocus: false,
    })
    return
  }

  const editableContext = resolveWorkspaceEditableContext(event.target)
  if (editableContext) {
    event.preventDefault()
    openWorkspaceContextMenu({
      source: 'workspace-editable',
      items: buildEditableContextMenuItems(editableContext),
      anchorPoint: {
        x: event.clientX,
        y: event.clientY,
      },
      restoreFocusEl: normalizeWorkspaceEventElement(event.target),
      onSelect: key => executeEditableContextMenuAction(key, editableContext),
    })
    return
  }

  event.preventDefault()
  openBlankWorkspaceContextMenu({
    anchorPoint: {
      x: event.clientX,
      y: event.clientY,
    },
    restoreFocusEl: normalizeWorkspaceEventElement(event.target),
  })
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

const contestSource = computed(() => {
  return contestCatalog.value.length > 0 ? contestCatalog.value : contests.value
})
const selectedContest = computed(() => contestSource.value.find(contest => contest.id === selectedContestId.value) || null)
const selectedTrack = computed(() => selectedContest.value?.tracks.find(track => track.id === selectedTrackId.value) || null)
const selectedTrackRubric = computed(() => {
  const contestId = normalizeString(selectedContestId.value)
  if (!contestId || selectedContestDetailContestId.value !== contestId)
    return null

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
const defenseContestTimelines = computed(() => {
  return selectedContestDetail.value?.timelines || selectedContest.value?.timelines || []
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
const workspaceBillingEstimate = ref<WorkspaceBillingEstimate | null>(null)
const workspaceAiUsageTotalUnits = ref<number | null>(null)
let workspaceBillingEstimateSeq = 0
let workspaceAiUsageSummarySeq = 0
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
  return workspaceDisplayPreferenceSnapshot.value.effective.fontSizePreset || 'lg'
})
const workspaceEffectiveTabSpacingPreset = computed<WorkspaceTabSpacingPreset>(() => {
  return workspaceDisplayPreferenceSnapshot.value.effective.tabSpacingPreset || 'relaxed'
})
const workspaceShellStyle = computed(() => {
  return {
    '--workspace-left-sidebar-width': `${leftSidebarWidth.value}px`,
    '--workspace-right-sidebar-width': `${rightSidebarWidth.value}px`,
  }
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
const activeProjectScopeId = computed(() => normalizeString(activeProjectId.value))
const {
  dashboard: projectKnowledgeDashboard,
  summary: projectKnowledgeSummary,
  runtime: projectKnowledgeRuntime,
  worker: projectKnowledgeWorker,
  diagnostics: projectKnowledgeDiagnostics,
  loading: projectKnowledgeLoading,
  error: projectKnowledgeError,
  reindexingTarget: projectKnowledgeReindexingTarget,
  retryingSourceId: projectKnowledgeRetryingSourceId,
  hasActiveWork: projectKnowledgeHasActiveWork,
  reload: reloadProjectKnowledge,
  reindexProjectKnowledge,
  reindexKnowledgeSource,
} = useWorkspaceProjectKnowledge(activeProjectId)
const loopyDataRuntimeLabel = computed(() => {
  if (!projectKnowledgeRuntime.value.embeddingConfigured)
    return 'Embedding 未配置'
  return `${projectKnowledgeRuntime.value.embeddingProvider || 'provider'} / ${projectKnowledgeRuntime.value.embeddingModel || 'model'}`
})
const projectResourcesFirstLoadLoading = computed(() => {
  return resourcesLoading.value && resourcesLoadedProjectId.value !== activeProjectScopeId.value
})
const projectResourcesRefreshing = computed(() => {
  return resourcesLoading.value && Boolean(activeProjectScopeId.value) && resourcesLoadedProjectId.value === activeProjectScopeId.value
})
const resourceLibraryFirstLoadLoading = computed(() => {
  return resourceLibraryLoading.value && resourceLibraryLoadedProjectId.value !== activeProjectScopeId.value
})
const resourceLibraryRefreshing = computed(() => {
  return resourceLibraryLoading.value && Boolean(activeProjectScopeId.value) && resourceLibraryLoadedProjectId.value === activeProjectScopeId.value
})
const projectResourceSharesFirstLoadLoading = computed(() => {
  return projectResourceSharesLoading.value && projectResourceSharesLoadedProjectId.value !== activeProjectScopeId.value
})
const projectResourceSharesRefreshing = computed(() => {
  return projectResourceSharesLoading.value && Boolean(activeProjectScopeId.value) && projectResourceSharesLoadedProjectId.value === activeProjectScopeId.value
})
const chatSessionsScopeKey = computed(() => {
  const workspaceId = normalizeString(activeWorkspaceId.value)
  const projectId = activeProjectScopeId.value
  const mode = normalizeString(aiMode.value)
  if (!workspaceId || !projectId || !mode)
    return ''
  return `${workspaceId}:${projectId}:${mode}`
})
const chatSessionsFirstLoadLoading = computed(() => {
  return chatSessionsLoading.value && chatSessionsLoadedScopeKey.value !== chatSessionsScopeKey.value
})
const chatSessionsRefreshing = computed(() => {
  return chatSessionsLoading.value && Boolean(chatSessionsScopeKey.value) && chatSessionsLoadedScopeKey.value === chatSessionsScopeKey.value
})
const chatMessagesFirstLoadLoading = computed(() => {
  const sessionId = normalizeString(activeChatSessionId.value)
  return chatMessagesLoading.value && chatMessagesLoadedSessionId.value !== sessionId
})
const mappingScopeKey = computed(() => {
  const contestId = normalizeString(selectedContestId.value)
  const trackId = normalizeString(selectedTrackId.value)
  if (!contestId || !trackId)
    return ''
  return `${contestId}:${trackId}`
})
const mappingFirstLoadLoading = computed(() => {
  return selectedContestDetailLoading.value && mappingLoadedScopeKey.value !== mappingScopeKey.value
})
const mappingRefreshing = computed(() => {
  return selectedContestDetailLoading.value && Boolean(mappingScopeKey.value) && mappingLoadedScopeKey.value === mappingScopeKey.value
})
const projectMeetingsFirstLoadLoading = computed(() => {
  return projectMeetingsLoading.value && projectMeetingsLoadedProjectId.value !== activeProjectScopeId.value
})
const projectMeetingsRefreshing = computed(() => {
  return projectMeetingsLoading.value && Boolean(activeProjectScopeId.value) && projectMeetingsLoadedProjectId.value === activeProjectScopeId.value
})
const meetingDetailDisplayLoading = computed(() => {
  const meetingId = normalizeString(activeMeetingId.value)
  return meetingDetailLoading.value && meetingDetailLoadedId.value !== meetingId
})
const meetingDetailRefreshing = computed(() => {
  const meetingId = normalizeString(activeMeetingId.value)
  return meetingDetailLoading.value && Boolean(meetingId) && meetingDetailLoadedId.value === meetingId && Boolean(activeMeetingDetail.value)
})

function beginWorkspaceBootstrapTrace(projectId: string, requestId: number): void {
  workspaceBootstrapStartedAt.value = Date.now()
  emitWorkspaceBootstrapTrace('bootstrap:start', projectId, requestId)
}

function isCurrentWorkspaceBootstrapRequest(projectId: string, requestId: number): boolean {
  return workspaceBootstrapRequestId === requestId && activeProjectId.value === projectId
}

function emitWorkspaceBootstrapTrace(
  mark: WorkspaceBootstrapMark,
  projectId = String(activeProjectId.value || '').trim(),
  requestId = workspaceBootstrapRequestId,
  extra: Record<string, unknown> = {},
): void {
  if (!projectId || requestId <= 0 || workspaceBootstrapStartedAt.value <= 0)
    return

  const elapsedMs = Math.max(0, Date.now() - workspaceBootstrapStartedAt.value)
  console.warn('[workspace-bootstrap]', {
    mark,
    projectId,
    requestId,
    elapsedMs,
    ...extra,
  })
}

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

const toneMeta: Record<MappingTone, WorkspaceStatusToneMeta> = {
  critical: {
    label: '高风险',
    badgeClass: 'bg-rose-50 text-rose-700',
    barClass: 'bg-rose-500',
  },
  high: {
    label: '需补强',
    badgeClass: 'bg-amber-50 text-amber-700',
    barClass: 'bg-amber-500',
  },
  warning: {
    label: '需补强',
    badgeClass: 'bg-amber-50 text-amber-700',
    barClass: 'bg-amber-500',
  },
  medium: {
    label: '可推进',
    badgeClass: 'bg-sky-50 text-sky-700',
    barClass: 'bg-sky-500',
  },
  low: {
    label: '较稳妥',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    barClass: 'bg-emerald-500',
  },
  complete: {
    label: '较稳妥',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    barClass: 'bg-emerald-500',
  },
  todo: {
    label: '待处理',
    badgeClass: 'bg-slate-100 text-slate-600',
    barClass: 'bg-slate-400',
  },
}

const selectedResources = computed(() => {
  const titleOverrides = markdownDerivedTitleMap.value
  return resources.value.map((resource) => {
    const nextTitle = normalizeString(titleOverrides[resource.id])
    if (!nextTitle || nextTitle === normalizeString(resource.title))
      return resource
    return {
      ...resource,
      title: nextTitle,
    }
  })
})
const activePreviewResource = computed(() => {
  const resourceId = normalizeString(previewResourceId.value)
  if (!resourceId)
    return null
  return selectedResources.value.find(item => item.id === resourceId) || null
})
const activeResourceWorkspaceTabId = computed(() => {
  const tabId = normalizeString(activeMainTabId.value)
  return tabId.startsWith('resource:') ? tabId : ''
})
const activePreviewResourcePurpose = computed(() => {
  if (!activeResourceWorkspaceTabId.value)
    return ''
  return resolveCollabPurpose(activePreviewResource.value)
})
const currentAssistantResource = computed(() => {
  if (normalizeString(activeMainTabId.value) === 'flow') {
    const targetFlowResourceId = normalizeString(flowResourceId.value)
    return targetFlowResourceId
      ? resources.value.find(item => item.id === targetFlowResourceId) || null
      : null
  }
  if (activeResourceWorkspaceTabId.value)
    return activePreviewResource.value
  return null
})
const currentAssistantPreviewMode = computed<WorkspacePreviewMode | ''>(() => {
  if (normalizeString(activeMainTabId.value) === 'flow')
    return 'draw'
  return activeResourceWorkspaceTabId.value ? previewMode.value : ''
})
const currentAssistantResourcePurpose = computed<CollabPurpose | ''>(() => {
  if (normalizeString(activeMainTabId.value) === 'flow')
    return 'workflow'
  return activeResourceWorkspaceTabId.value ? activePreviewResourcePurpose.value : ''
})
const projectContextualAssistant = computed<WorkspaceProjectContextualAssistant | null>(() => {
  if (normalizeString(activeMainTabId.value) === 'flow') {
    return {
      key: 'agent_proto',
      preset: 'prototype',
      label: 'AgentProto',
      aiMode: 'contextual_agent',
    }
  }

  if (!activeResourceWorkspaceTabId.value)
    return null

  if (previewMode.value === 'markdown') {
    return {
      key: 'agent_doc',
      preset: 'document',
      label: 'AgentDoc',
      aiMode: 'document_assist',
    }
  }

  if (previewMode.value !== 'draw')
    return null

  if (activePreviewResourcePurpose.value === 'design') {
    return {
      key: 'design_assistant',
      preset: 'design',
      label: '设计助手',
      aiMode: 'contextual_agent',
    }
  }

  if (activePreviewResourcePurpose.value === 'workflow') {
    return {
      key: 'agent_proto',
      preset: 'prototype',
      label: 'AgentProto',
      aiMode: 'contextual_agent',
    }
  }

  return {
    key: 'agent_proto',
    preset: 'prototype',
    label: 'AgentProto',
    aiMode: 'contextual_agent',
  }
})
const projectResolvedAiMode = computed<WorkspacePrimaryAiMode>(() => {
  if (projectAssistantMode.value === 'dialog_ask')
    return 'dialog_ask'
  return projectContextualAssistant.value?.aiMode || 'dialog_ask'
})
const currentWorkspaceAssistantPreset = computed<WorkspaceAiAssistantPreset>(() => {
  if (workbenchMode.value === 'project' && projectAssistantMode.value === 'contextual')
    return projectContextualAssistant.value?.preset || 'default'
  if (aiMode.value === 'document_assist')
    return 'document'
  return 'default'
})
const currentWorkspaceAssistantLabel = computed(() => {
  if (workbenchMode.value === 'project') {
    if (projectAssistantMode.value === 'contextual')
      return projectContextualAssistant.value?.label || '对话询问'
    return '对话询问'
  }
  if (aiMode.value === 'defense')
    return '答辩模拟'
  if (aiMode.value === 'auto_optimize')
    return '自动优化'
  if (aiMode.value === 'issue_discovery')
    return '寻疑发现'
  if (aiMode.value === 'document_assist')
    return 'AgentDoc'
  return '对话询问'
})
const currentWorkspaceAssistantContext = computed(() => {
  return {
    assistantPreset: currentWorkspaceAssistantPreset.value,
    assistantLabel: currentWorkspaceAssistantLabel.value,
    contextualAssistantKey: workbenchMode.value === 'project' && projectAssistantMode.value === 'contextual'
      ? normalizeWorkspaceContextualAssistantKey(projectContextualAssistant.value?.key)
      : '',
    activeTabId: normalizeString(activeMainTabId.value),
    previewMode: currentAssistantPreviewMode.value,
    resourcePurpose: currentAssistantResourcePurpose.value,
  }
})
const activeWorkflowResourceId = computed(() => {
  if (currentAssistantResourcePurpose.value !== 'workflow')
    return ''
  return normalizeString(currentAssistantResource.value?.id)
})
const activeWorkflowResourceTitle = computed(() => {
  if (!activeWorkflowResourceId.value)
    return ''
  return normalizeString(currentAssistantResource.value?.title) || COLLAB_WORKFLOW_RESOURCE_LABEL
})
const activeWorkflowSnapshot = computed(() => {
  if (!activeWorkflowResourceId.value)
    return null
  if (normalizeString(collabBindingResourceId.value) !== activeWorkflowResourceId.value)
    return null
  return workflowSnapshotState.value
})
const activeWorkflowHash = computed(() => {
  return activeWorkflowSnapshot.value?.hash || ''
})
const activeWorkflowPageCount = computed(() => {
  return Math.max(0, Number(activeWorkflowSnapshot.value?.pageCount || 0))
})
const workflowCanvasUnavailableReason = computed(() => {
  if (!activeWorkflowResourceId.value)
    return '当前没有可用的流程画布，暂时无法生成 AgentProto 草案。'
  if (workflowDrawioLegacyUnavailable.value)
    return '当前流程画布为旧版数据，暂不支持在 draw.io 中直接加载/生成，请重建流程画布。'
  if (!activeWorkflowSnapshot.value)
    return '流程画布快照尚未同步完成，请稍后再试。'
  return ''
})
const activeAgentProtoSceneResourceId = computed(() => {
  if (currentWorkspaceAssistantPreset.value !== 'prototype')
    return ''
  if (currentAssistantPreviewMode.value !== 'draw')
    return ''
  if (currentAssistantResourcePurpose.value === 'workflow')
    return ''
  return normalizeString(currentAssistantResource.value?.id)
})
const activeAgentProtoSceneResourceTitle = computed(() => {
  if (!activeAgentProtoSceneResourceId.value)
    return ''
  return normalizeString(currentAssistantResource.value?.title) || COLLAB_FREEFORM_RESOURCE_LABEL
})
const activeAgentProtoSceneHash = computed(() => {
  if (!activeAgentProtoSceneResourceId.value)
    return ''
  if (normalizeString(collabBindingResourceId.value) !== activeAgentProtoSceneResourceId.value)
    return ''
  return computeSceneDocumentHash(collabDrawValue.value || '')
})
const sceneCanvasUnavailableReason = computed(() => {
  if (!activeAgentProtoSceneResourceId.value)
    return `当前没有可用的${COLLAB_FREEFORM_RESOURCE_LABEL}，暂时无法生成 AgentProto 草案。`
  if (normalizeString(collabBindingResourceId.value) !== activeAgentProtoSceneResourceId.value)
    return '当前自由画布尚未完成同步，请稍后再试。'
  return ''
})
const activeAgentDocDocumentHash = computed(() => {
  if (!documentAssistRequestState.resourceId)
    return ''
  return computeAgentDocContentHash(documentAssistRequestState.markdown)
})
const activeMarkdownResourceId = computed(() => {
  if (previewMode.value !== 'markdown')
    return ''
  return normalizeString(previewResourceId.value)
})
const activeMarkdownOutlineItems = ref<CollabMarkdownHeadingAnchorItem[]>([])
const activeMarkdownResourceTitle = computed(() => {
  const resourceId = activeMarkdownResourceId.value
  if (!resourceId)
    return ''
  const derivedTitle = normalizeString(markdownDerivedTitleMap.value[resourceId])
  if (derivedTitle)
    return derivedTitle
  const currentPreviewResource = selectedResources.value.find(item => item.id === resourceId) || null
  return normalizeString(currentPreviewResource?.title) || COLLAB_NOTES_RESOURCE_LABEL
})
const activeDesignResourceId = computed(() => {
  if (currentAssistantPreviewMode.value !== 'draw')
    return ''
  if (currentAssistantResourcePurpose.value !== 'design')
    return ''
  const resourceId = normalizeString(currentAssistantResource.value?.id)
  if (!resourceId)
    return ''
  if (normalizeString(collabBindingResourceId.value) !== resourceId)
    return ''
  return resourceId
})
const activeDesignOutlineDocument = computed(() => {
  if (!activeDesignResourceId.value)
    return null
  return parseWorkspaceOutlineDesignDocument(collabDrawValue.value || '')
})
const {
  markdownCommentThreads,
  activeMarkdownCommentThreadId,
  markdownCommentDraftAnchor,
  markdownCommentLoading,
  markdownCommentMutating,
  clearMarkdownCommentPolling,
  loadMarkdownCommentThreads,
  startMarkdownCommentPolling,
  handleMarkdownCreateCommentFromSelection,
  handleMarkdownCreateCommentFromImage,
  handleMarkdownOpenCommentThread,
  cancelMarkdownCommentDraft,
  createMarkdownCommentThread,
  replyMarkdownCommentThread,
  resolveMarkdownCommentThread,
  reopenMarkdownCommentThread,
} = useWorkspaceProjectComments({
  activeProjectId,
  activeMarkdownResourceId,
  currentUserId: computed(() => normalizeString(me.value?.user.id)),
  currentUsername: computed(() => normalizeString(me.value?.user.username)),
  currentUserAvatarUrl: computed(() => me.value?.user.avatarUrl || null),
  onStatusLine: (message) => {
    statusLine.value = message
  },
  onScrollToThread: threadId => workspaceMainPanelRef.value?.scrollToMarkdownCommentThread(threadId),
})
const projectOutlineItems = computed(() => projectOutlineSnapshot.value?.items || [])
const projectOutlineFlatItems = computed(() => flattenProjectOutlineNodes(projectOutlineItems.value))
const projectOutlineFirstLoadLoading = computed(() => {
  return projectOutlineLoading.value && !projectOutlineFirstLoaded.value
})
const visibleProjectOutlineUploadTasks = computed(() => {
  return projectUploadTasks.value.filter(task => isProjectUploadTaskSidebarVisible(task))
})
const currentContentOutlineSection = computed<WorkspaceOutlineSection>(() => {
  if (normalizeString(activeMainTabId.value) === 'flow' || activeWorkflowResourceId.value) {
    const items = activeWorkflowResourceId.value && activeWorkflowSnapshot.value
      ? buildWorkflowWorkspaceOutlineNodes({
          resourceId: activeWorkflowResourceId.value,
          snapshot: activeWorkflowSnapshot.value,
        })
      : []
    return {
      id: 'current_content',
      title: '当前内容结构',
      surface: 'workflow',
      loading: Boolean(activeWorkflowResourceId.value) && !activeWorkflowSnapshot.value && collabPreviewLoading.value,
      emptyText: workflowCanvasUnavailableReason.value || '当前流程画布暂无可展示的大纲',
      items,
    }
  }

  if (activeMarkdownResourceId.value) {
    return {
      id: 'current_content',
      title: '当前内容结构',
      surface: 'notes',
      loading: collabPreviewLoading.value && activeMarkdownOutlineItems.value.length === 0,
      emptyText: '当前文档暂无标题结构',
      items: buildMarkdownWorkspaceOutlineNodes({
        resourceId: activeMarkdownResourceId.value,
        headings: activeMarkdownOutlineItems.value,
      }),
    }
  }

  if (currentAssistantResourcePurpose.value === 'design' || activeDesignResourceId.value) {
    const items = activeDesignResourceId.value && activeDesignOutlineDocument.value
      ? buildDesignWorkspaceOutlineNodes({
          resourceId: activeDesignResourceId.value,
          document: activeDesignOutlineDocument.value,
        })
      : []
    return {
      id: 'current_content',
      title: '当前内容结构',
      surface: 'design',
      loading: Boolean(currentAssistantResource.value?.id) && !activeDesignOutlineDocument.value && collabPreviewLoading.value,
      emptyText: '当前设计稿暂无可展示的大纲',
      items,
    }
  }

  return {
    id: 'current_content',
    title: '当前内容结构',
    surface: 'none',
    loading: false,
    emptyText: '打开妙想文档、设计稿或流程画布后显示内容结构',
    items: [],
  }
})
const projectStructureOutlineSection = computed<WorkspaceOutlineSection>(() => {
  return {
    id: 'project_structure',
    title: '项目结构',
    surface: 'project',
    loading: projectOutlineFirstLoadLoading.value,
    emptyText: '上传文件或生成结构大纲后显示项目结构',
    items: buildProjectWorkspaceOutlineNodes({
      projectOutline: projectOutlineItems.value,
      uploadTasks: visibleProjectOutlineUploadTasks.value,
    }),
  }
})
const workspaceOutlineSections = computed<WorkspaceOutlineSection[]>(() => {
  return [
    currentContentOutlineSection.value,
    projectStructureOutlineSection.value,
  ]
})
const latestIssueReport = computed(() => projectIssueReports.value[0] || null)
const defenseSessionMetaSnapshot = computed(() => {
  const activeSessionId = normalizeString(activeChatSessionId.value)
  if (defenseSessionMeta.value && normalizeString(defenseSessionMeta.value.id) === activeSessionId)
    return defenseSessionMeta.value
  if (!activeSessionId)
    return defenseSessionMeta.value
  return chatSessions.value.find(item => normalizeString(item.id) === activeSessionId) || defenseSessionMeta.value || null
})
const defenseSessionStateSnapshot = computed<AiDefenseSessionState | null>(() => {
  const activeSessionId = normalizeString(activeChatSessionId.value || defenseSessionState.value?.sessionId)
  if (!activeSessionId)
    return null

  const base = defenseSessionState.value
  const fallbackTimestamp = defenseSessionMetaSnapshot.value?.updatedAt
    || defenseSessionMetaSnapshot.value?.lastMessageAt
    || defenseSessionMetaSnapshot.value?.createdAt
    || new Date().toISOString()
  const realtimeBase = base?.realtime || null
  const realtimeProvider = realtimeBase?.provider || defenseRealtimeProviderDraft.value
  const realtimeMediaMode = realtimeBase?.mediaMode || defenseRealtimeMediaModeDraft.value
  const realtimeTransport = realtimeBase?.transport || (realtimeProvider === 'coze' ? 'rtc_sidecar' : 'websocket')

  return {
    sessionId: activeSessionId,
    projectId: normalizeString(activeProjectId.value || base?.projectId),
    workspaceId: normalizeString(activeWorkspaceId.value || base?.workspaceId),
    currentStage: base?.currentStage || defenseStage.value || 'opening',
    turnCount: Math.max(base?.turnCount || 0, defenseTurnCount.value || 0),
    selectedPersonaIds: base?.selectedPersonaIds?.length
      ? base.selectedPersonaIds
      : defensePersonas.value.filter(item => item.enabled).map(item => item.id),
    summaryStatus: base?.summaryStatus || (defenseSummaryLoading.value
      ? 'processing'
      : (defenseSummary.value ? 'completed' : 'idle')),
    summaryResourceId: base?.summaryResourceId || defenseSummary.value?.resourceId || null,
    linkedMeetingId: base?.linkedMeetingId || normalizeString(activeMeetingDetail.value?.id) || null,
    lastInputMode: base?.lastInputMode || (normalizeString(activeMeetingDetail.value?.id) ? 'audio' : 'text'),
    lastContextPack: base?.lastContextPack,
    lastScorecard: defenseScorecard.value || base?.lastScorecard || null,
    realtime: {
      provider: realtimeProvider,
      mediaMode: realtimeMediaMode,
      transport: realtimeTransport,
      connectionState: realtimeBase?.connectionState || 'idle',
      bootstrapState: realtimeBase?.bootstrapState || defenseRealtimeBootstrapState.value,
      providerSessionId: realtimeBase?.providerSessionId || null,
      conversationId: realtimeBase?.conversationId || null,
      linkedMeetingId: base?.linkedMeetingId || normalizeString(activeMeetingDetail.value?.id) || null,
      lastProviderEventAt: realtimeBase?.lastProviderEventAt || null,
      latestSpeakerId: realtimeBase?.latestSpeakerId || null,
      latestSpeakerLabel: realtimeBase?.latestSpeakerLabel || defenseRealtimeLatestSpeakerLabel.value || null,
      latestLatencyMs: realtimeBase?.latestLatencyMs ?? defenseRealtimeLatestLatencyMs.value ?? null,
      audioEnabled: realtimeBase?.audioEnabled ?? defenseRealtimeAudioEnabled.value,
      videoEnabled: realtimeBase?.videoEnabled ?? (realtimeMediaMode === 'audio_video' ? defenseRealtimeVideoEnabled.value : false),
      lastError: realtimeBase?.lastError || defenseRealtimeLatestError.value || null,
      metadata: realtimeBase?.metadata || {},
    },
    createdAt: base?.createdAt || defenseSessionMetaSnapshot.value?.createdAt || fallbackTimestamp,
    updatedAt: base?.updatedAt
      || defenseSessionMetaSnapshot.value?.updatedAt
      || defenseSessionMetaSnapshot.value?.lastMessageAt
      || fallbackTimestamp,
  }
})
const defenseRealtimeSessionMetaSnapshot = computed<DefenseRealtimeSessionMeta | null>(() => {
  return defenseSessionStateSnapshot.value?.realtime || null
})
const defenseLinkedMeeting = computed(() => {
  const linkedMeetingId = normalizeString(defenseSessionStateSnapshot.value?.linkedMeetingId)
  if (!linkedMeetingId)
    return null
  if (normalizeString(activeMeetingDetail.value?.id) === linkedMeetingId)
    return activeMeetingDetail.value
  return projectMeetings.value.find(item => normalizeString(item.id) === linkedMeetingId) || null
})

function appendDefenseRealtimeLog(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
): void {
  const text = normalizeString(message)
  if (!text)
    return
  defenseRealtimeLogs.value = [
    ...defenseRealtimeLogs.value.slice(-23),
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      level,
      message: text,
      createdAt: new Date().toISOString(),
    },
  ]
}

function syncDefenseRealtimeDraftState(state: AiDefenseSessionState | null | undefined): void {
  const realtime = state?.realtime
  if (!realtime)
    return

  defenseRealtimeProviderDraft.value = realtime.provider
  defenseRealtimeMediaModeDraft.value = realtime.mediaMode
  defenseRealtimeAudioEnabled.value = realtime.audioEnabled ?? true
  defenseRealtimeVideoEnabled.value = realtime.videoEnabled ?? realtime.mediaMode === 'audio_video'
  defenseRealtimeBootstrapState.value = realtime.bootstrapState || 'idle'
  defenseRealtimeLatestError.value = normalizeString(realtime.lastError)
  defenseRealtimeLatestSpeakerLabel.value = normalizeString(realtime.latestSpeakerLabel)
  defenseRealtimeLatestLatencyMs.value = realtime.latestLatencyMs ?? null
}

function patchDefenseRealtimeState(
  patch: Partial<DefenseRealtimeSessionMeta>,
  options: { syncDrafts?: boolean } = {},
): void {
  const base = defenseSessionStateSnapshot.value
  if (!base)
    return

  const nextRealtime: DefenseRealtimeSessionMeta = {
    ...(base.realtime || {
      provider: defenseRealtimeProviderDraft.value,
      mediaMode: defenseRealtimeMediaModeDraft.value,
      transport: defenseRealtimeProviderDraft.value === 'coze' ? 'rtc_sidecar' : 'websocket',
      connectionState: 'idle' as DefenseRealtimeConnectionState,
      bootstrapState: defenseRealtimeBootstrapState.value,
      linkedMeetingId: base.linkedMeetingId || null,
      latestLatencyMs: null,
      audioEnabled: defenseRealtimeAudioEnabled.value,
      videoEnabled: defenseRealtimeVideoEnabled.value,
      metadata: {},
    }),
    ...patch,
    metadata: {
      ...(base.realtime?.metadata || {}),
      ...((patch.metadata && typeof patch.metadata === 'object' && !Array.isArray(patch.metadata)) ? patch.metadata : {}),
    },
  }

  defenseSessionState.value = {
    ...base,
    realtime: nextRealtime,
    updatedAt: new Date().toISOString(),
  }

  if (options.syncDrafts !== false)
    syncDefenseRealtimeDraftState(defenseSessionState.value)
}

function normalizeDefenseLatestRound(round: AiDefenseJudgeRound): AiDefenseJudgeRound {
  const fallbackTurnIndex = Math.max(1, defenseTurnCount.value + 1)
  return {
    ...round,
    stage: round.stage || defenseStage.value || defenseSessionStateSnapshot.value?.currentStage || 'opening',
    turnIndex: Number.isFinite(Number(round.turnIndex))
      ? Math.max(1, Math.trunc(Number(round.turnIndex)))
      : fallbackTurnIndex,
    createdAt: normalizeString(round.createdAt) || new Date().toISOString(),
  }
}

function setDefenseLatestRounds(rounds: AiDefenseJudgeRound[]): void {
  defenseRounds.value = rounds.map(normalizeDefenseLatestRound)
}

function upsertDefenseLatestRound(round: AiDefenseJudgeRound): void {
  const normalizedRound = normalizeDefenseLatestRound(round)
  const targetTurnIndex = normalizedRound.turnIndex || 1
  const nextRounds = defenseRounds.value
    .filter((item) => {
      const itemTurnIndex = Number.isFinite(Number(item.turnIndex))
        ? Math.max(1, Math.trunc(Number(item.turnIndex)))
        : targetTurnIndex
      if (itemTurnIndex !== targetTurnIndex)
        return false
      return !(
        normalizeString(item.judge) === normalizeString(normalizedRound.judge)
        && normalizeString(item.question) === normalizeString(normalizedRound.question)
      )
    })

  defenseRounds.value = [...nextRounds, normalizedRound]
}

function appendDefenseTimelineTurn(input: {
  turnIndex?: number | null
  stage?: AiDefenseStage
  personaId?: string | null
  judgeType?: AiDefenseJudgeRound['judgeType']
  judgeName?: string | null
  question?: string | null
  comment?: string | null
  followUp?: string | null
  score?: number | null
  evidenceRefs?: AiDefenseTurn['evidenceRefs']
  createdAt?: string | null
  metadata?: Record<string, unknown>
}): void {
  const sessionId = normalizeString(activeChatSessionId.value || defenseSessionMetaSnapshot.value?.id)
  const projectId = normalizeString(activeProjectId.value || defenseSessionStateSnapshot.value?.projectId)
  const judgeName = normalizeString(input.judgeName)
  const question = normalizeString(input.question)
  if (!sessionId || !projectId || !judgeName || !question)
    return

  const turnIndex = Number.isFinite(Number(input.turnIndex))
    ? Math.max(1, Math.trunc(Number(input.turnIndex)))
    : Math.max(1, defenseTurnCount.value + 1)
  const createdAt = normalizeString(input.createdAt) || new Date().toISOString()
  const duplicate = defenseTurns.value.some(item =>
    item.turnIndex === turnIndex
    && normalizeString(item.judgeName) === judgeName
    && normalizeString(item.question) === question,
  )
  if (duplicate)
    return

  defenseTurns.value = [
    ...defenseTurns.value,
    {
      id: `live-${turnIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      projectId,
      stage: input.stage || defenseStage.value || defenseSessionStateSnapshot.value?.currentStage || 'opening',
      turnIndex,
      personaId: normalizeString(input.personaId) || null,
      judgeType: input.judgeType || 'custom',
      judgeName,
      question,
      comment: normalizeString(input.comment),
      followUp: normalizeString(input.followUp),
      score: Number.isFinite(Number(input.score)) ? Math.max(0, Math.min(100, Number(input.score))) : 0,
      evidenceRefs: input.evidenceRefs || [],
      attachments: [],
      metadata: input.metadata || {},
      createdAt,
    },
  ].sort((left, right) => {
    if (left.turnIndex !== right.turnIndex)
      return left.turnIndex - right.turnIndex
    return new Date(String(left.createdAt || '')).getTime() - new Date(String(right.createdAt || '')).getTime()
  })
}

function isDefenseRealtimeSessionLocked(): boolean {
  if (defenseRealtimeBootstrapState.value === 'bootstrapping')
    return true
  const connectionState = defenseRealtimeSessionMetaSnapshot.value?.connectionState
  return connectionState === 'bootstrapping' || connectionState === 'connecting' || connectionState === 'connected'
}

function clearDefenseRealtimeEventFlushTimer(): void {
  if (defenseRealtimeEventFlushTimer) {
    clearTimeout(defenseRealtimeEventFlushTimer)
    defenseRealtimeEventFlushTimer = null
  }
}

async function postDefenseRealtimeEvents(payloads: DefenseRealtimeNormalizedEvent[]): Promise<void> {
  const projectId = normalizeString(activeProjectId.value)
  const sessionId = normalizeString(payloads[0]?.sessionId || activeChatSessionId.value)
  if (!projectId || !sessionId || payloads.length === 0)
    return

  await unsafeFetch(
    endpoint(`/projects/${projectId}/defense/realtime-sessions/${sessionId}/events`),
    {
      method: 'POST',
      body: {
        events: payloads,
      },
    },
  )
}

function scheduleDefenseRealtimeEventFlush(): void {
  if (defenseRealtimeEventFlushTimer)
    return
  defenseRealtimeEventFlushTimer = setTimeout(() => {
    defenseRealtimeEventFlushTimer = null
    void flushDefenseRealtimeEventQueue()
  }, 500)
}

async function flushDefenseRealtimeEventQueue(): Promise<void> {
  clearDefenseRealtimeEventFlushTimer()
  if (defenseRealtimePendingEvents.length === 0)
    return

  const payloads = defenseRealtimePendingEvents
  defenseRealtimePendingEvents = []
  try {
    await postDefenseRealtimeEvents(payloads)
  }
  catch {
    appendDefenseRealtimeLog('实时事件批量回写失败，当前仅保留本地状态。', 'warning')
  }
}

async function enqueueDefenseRealtimeEvent(payload: DefenseRealtimeNormalizedEvent): Promise<void> {
  if (DEFENSE_REALTIME_DEFERRED_EVENT_TYPES.has(payload.type)) {
    defenseRealtimePendingEvents.push(payload)
    scheduleDefenseRealtimeEventFlush()
    return
  }

  await flushDefenseRealtimeEventQueue()
  try {
    await postDefenseRealtimeEvents([payload])
  }
  catch {
    appendDefenseRealtimeLog('实时事件回写失败，当前仅保留本地状态。', 'warning')
  }
}

async function teardownDefenseRealtimeBridge(options: { resetBootstrap?: boolean } = {}): Promise<void> {
  clearDefenseRealtimeEventFlushTimer()
  const bridge = defenseRealtimeBridge
  const cleanup = defenseRealtimeBridgeCleanup
  const mediaController = defenseRealtimeMediaController
  defenseRealtimeBridge = null
  defenseRealtimeBridgeCleanup = null
  defenseRealtimeMediaController = null

  if (bridge) {
    try {
      await bridge.disconnect()
    }
    catch {
      appendDefenseRealtimeLog('provider sidecar 断开时发生异常，已忽略。', 'warning')
    }
  }
  await Promise.resolve()
  await flushDefenseRealtimeEventQueue()
  if (cleanup)
    cleanup()
  if (mediaController) {
    try {
      await mediaController.stop()
    }
    catch {
      appendDefenseRealtimeLog('本地媒体设备释放失败，已忽略。', 'warning')
    }
  }
  if (options.resetBootstrap !== false)
    defenseRealtimeBootstrapState.value = 'idle'
}

async function handleDefenseRealtimeBridgeEvent(payload: DefenseRealtimeNormalizedEvent): Promise<void> {
  if (payload.speakerLabel)
    defenseRealtimeLatestSpeakerLabel.value = payload.speakerLabel
  if (Number.isFinite(Number(payload.latencyMs)))
    defenseRealtimeLatestLatencyMs.value = Math.max(0, Number(payload.latencyMs))
  if (payload.type === 'error') {
    defenseRealtimeLatestError.value = normalizeString(payload.errorMessage) || 'provider sidecar 异常'
    appendDefenseRealtimeLog(defenseRealtimeLatestError.value, 'error')
  }
  else if (payload.type === 'assistant.transcript.final') {
    if (payload.stage)
      defenseStage.value = payload.stage
    if (Number.isFinite(Number(payload.turnIndex)))
      defenseTurnCount.value = Math.max(defenseTurnCount.value, Math.trunc(Number(payload.turnIndex)))
    const latestRound: AiDefenseJudgeRound = {
      judge: normalizeString(payload.speakerLabel) || normalizeString(payload.speakerName) || 'AgentDef',
      judgeType: payload.judgeType || 'custom',
      personaId: normalizeString(payload.speakerId) || null,
      stage: payload.stage,
      turnIndex: payload.turnIndex,
      question: normalizeString(payload.text),
      score: Number.isFinite(Number(payload.metadata?.score)) ? Number(payload.metadata?.score) : 0,
      comment: normalizeString(payload.metadata?.comment),
      followUp: normalizeString(payload.metadata?.followUp),
      evidenceRefs: [],
      createdAt: payload.createdAt,
    }
    upsertDefenseLatestRound(latestRound)
    appendDefenseTimelineTurn({
      turnIndex: payload.turnIndex,
      stage: payload.stage,
      personaId: payload.speakerId || null,
      judgeType: payload.judgeType || 'custom',
      judgeName: payload.speakerLabel || payload.speakerName || 'AgentDef',
      question: payload.text,
      comment: normalizeString(payload.metadata?.comment),
      followUp: normalizeString(payload.metadata?.followUp),
      score: Number.isFinite(Number(payload.metadata?.score)) ? Number(payload.metadata?.score) : 0,
      createdAt: payload.createdAt,
      metadata: payload.metadata,
    })
    appendDefenseRealtimeLog(`评委发言：${normalizeString(payload.speakerLabel) || 'AgentDef'} 已完成一段输出。`)
  }
  else if (payload.type === 'session.state') {
    if (payload.connectionState === 'connected')
      defenseRealtimeLatestError.value = ''
    appendDefenseRealtimeLog(`实时链路状态：${normalizeString(payload.connectionState) || 'idle'}`)
  }

  patchDefenseRealtimeState({
    provider: payload.provider,
    transport: payload.transport || defenseRealtimeSessionMetaSnapshot.value?.transport || (payload.provider === 'coze' ? 'rtc_sidecar' : 'websocket'),
    connectionState: payload.connectionState || defenseRealtimeSessionMetaSnapshot.value?.connectionState || 'idle',
    providerSessionId: normalizeString(payload.providerSessionId) || defenseRealtimeSessionMetaSnapshot.value?.providerSessionId || null,
    conversationId: normalizeString(payload.conversationId) || defenseRealtimeSessionMetaSnapshot.value?.conversationId || null,
    lastProviderEventAt: payload.createdAt,
    latestSpeakerId: normalizeString(payload.speakerId) || defenseRealtimeSessionMetaSnapshot.value?.latestSpeakerId || null,
    latestSpeakerLabel: normalizeString(payload.speakerLabel) || defenseRealtimeLatestSpeakerLabel.value || null,
    latestLatencyMs: Number.isFinite(Number(payload.latencyMs))
      ? Math.max(0, Number(payload.latencyMs))
      : defenseRealtimeLatestLatencyMs.value,
    audioEnabled: payload.audioEnabled ?? defenseRealtimeAudioEnabled.value,
    videoEnabled: payload.videoEnabled ?? defenseRealtimeVideoEnabled.value,
    lastError: payload.type === 'error'
      ? (normalizeString(payload.errorMessage) || defenseRealtimeLatestError.value || null)
      : (payload.type === 'session.state' && payload.connectionState === 'connected'
          ? null
          : defenseRealtimeSessionMetaSnapshot.value?.lastError || null),
    bootstrapState: defenseRealtimeBootstrapState.value,
  })

  await enqueueDefenseRealtimeEvent(payload)
}

async function bootstrapDefenseRealtimeSidecar(sessionId: string): Promise<void> {
  const projectId = normalizeString(activeProjectId.value)
  const targetSessionId = normalizeString(sessionId || activeChatSessionId.value)
  if (!projectId || !targetSessionId)
    return

  defenseRealtimeBootstrapState.value = 'bootstrapping'
  defenseRealtimeLatestError.value = ''
  appendDefenseRealtimeLog('正在向服务端申请 provider sidecar 握手信息。')

  const response = await unsafeFetch<ApiResponse<DefenseRealtimeBootstrapResponse>>(
    endpoint(`/projects/${projectId}/defense/realtime-sessions/${targetSessionId}/bootstrap`),
    {
      method: 'POST',
    },
  )
  const bootstrap = response.data.bootstrap
  defenseRealtimeBootstrapPayload.value = bootstrap
  if (response.data.state)
    defenseSessionState.value = response.data.state
  syncDefenseRealtimeDraftState(response.data.state)
  patchDefenseRealtimeState({
    provider: bootstrap.provider,
    mediaMode: bootstrap.mediaMode,
    transport: bootstrap.transport,
    bootstrapState: 'ready',
    connectionState: 'bootstrapping',
    linkedMeetingId: bootstrap.meetingId,
    audioEnabled: defenseRealtimeAudioEnabled.value,
    videoEnabled: bootstrap.mediaMode === 'audio_video' ? defenseRealtimeVideoEnabled.value : false,
  })

  try {
    await teardownDefenseRealtimeBridge({ resetBootstrap: false })
    const mediaController = createDefenseRealtimeMediaController({
      previewElementId: 'workspace-defense-realtime-preview',
      targetSampleRate: 16000,
      frameIntervalMs: bootstrap.qwen?.frameIntervalMs || 1000,
    })
    defenseRealtimeMediaController = mediaController
    await mediaController.start({
      mode: bootstrap.mediaMode,
    })
    await mediaController.setAudioEnabled(defenseRealtimeAudioEnabled.value)
    if (bootstrap.mediaMode === 'audio_video')
      await mediaController.setVideoEnabled(defenseRealtimeVideoEnabled.value)
    else
      defenseRealtimeVideoEnabled.value = false

    defenseRealtimeBridge = createDefenseRealtimeProviderBridge(bootstrap.provider, bootstrap)
    defenseRealtimeBridgeCleanup = defenseRealtimeBridge.onEvent((event) => {
      void handleDefenseRealtimeBridgeEvent(event)
    })
    defenseRealtimeBootstrapState.value = 'ready'
    await defenseRealtimeBridge.bootstrap()
    await defenseRealtimeBridge.connect(mediaController)
  }
  catch (error) {
    await teardownDefenseRealtimeBridge({ resetBootstrap: false })
    defenseRealtimeBootstrapState.value = 'error'
    defenseRealtimeLatestError.value = resolveApiErrorMessage(error, '实时答辩 sidecar 启动失败，请检查设备权限、Token 或 Provider 配置。')
    appendDefenseRealtimeLog(defenseRealtimeLatestError.value, 'error')
    patchDefenseRealtimeState({
      connectionState: 'error',
      bootstrapState: 'error',
      lastError: defenseRealtimeLatestError.value,
    })
    throw error
  }
}

function updateDefenseRealtimeProvider(provider: DefenseRealtimeProvider): void {
  if (isDefenseRealtimeSessionLocked()) {
    const message = '当前实时答辩已激活，需先结束当前答辩后再切换 Provider。'
    appendDefenseRealtimeLog(message, 'warning')
    statusLine.value = message
    return
  }
  defenseRealtimeProviderDraft.value = provider
  patchDefenseRealtimeState({
    provider,
    transport: provider === 'coze' ? 'rtc_sidecar' : 'websocket',
  })
}

function updateDefenseRealtimeMediaMode(mode: DefenseRealtimeMediaMode): void {
  if (isDefenseRealtimeSessionLocked()) {
    const message = '当前实时答辩已激活，媒体模式会在下一次启动时生效。'
    appendDefenseRealtimeLog(message, 'warning')
    statusLine.value = message
    return
  }
  defenseRealtimeMediaModeDraft.value = mode
  if (mode === 'audio')
    defenseRealtimeVideoEnabled.value = false
  patchDefenseRealtimeState({
    mediaMode: mode,
    videoEnabled: mode === 'audio' ? false : defenseRealtimeVideoEnabled.value,
  })
}

async function setDefenseRealtimeAudioEnabled(enabled: boolean): Promise<void> {
  defenseRealtimeAudioEnabled.value = enabled
  patchDefenseRealtimeState({
    audioEnabled: enabled,
  })
  if (defenseRealtimeMediaController)
    await defenseRealtimeMediaController.setAudioEnabled(enabled).catch(() => {})
  if (defenseRealtimeBridge)
    await defenseRealtimeBridge.setAudioEnabled(enabled)
}

async function setDefenseRealtimeVideoEnabled(enabled: boolean): Promise<void> {
  if (enabled && defenseRealtimeMediaModeDraft.value === 'audio') {
    const message = '当前媒体模式为仅音频，请切到音视频理解后再开启摄像头。'
    defenseRealtimeLatestError.value = message
    appendDefenseRealtimeLog(message, 'warning')
    statusLine.value = message
    return
  }
  defenseRealtimeVideoEnabled.value = enabled
  patchDefenseRealtimeState({
    videoEnabled: enabled,
  })
  if (defenseRealtimeMediaController) {
    await defenseRealtimeMediaController.setVideoEnabled(enabled).catch((error) => {
      const message = error instanceof Error ? error.message : '摄像头状态更新失败。'
      defenseRealtimeLatestError.value = message
      appendDefenseRealtimeLog(message, 'warning')
    })
  }
  if (defenseRealtimeBridge)
    await defenseRealtimeBridge.setVideoEnabled(enabled)
}

async function interruptDefenseRealtime(): Promise<void> {
  if (!defenseRealtimeBridge)
    return
  await defenseRealtimeBridge.interrupt()
}

async function reconnectDefenseRealtime(): Promise<void> {
  const sessionId = normalizeString(activeChatSessionId.value || defenseSessionStateSnapshot.value?.sessionId)
  if (!sessionId)
    return
  await bootstrapDefenseRealtimeSidecar(sessionId)
}

function resetDefenseRealtimeLocalState(): void {
  clearDefenseRealtimeEventFlushTimer()
  defenseRealtimePendingEvents = []
  defenseRealtimeProviderDraft.value = 'qwen'
  defenseRealtimeMediaModeDraft.value = 'audio_video'
  defenseRealtimeAudioEnabled.value = true
  defenseRealtimeVideoEnabled.value = true
  defenseRealtimeBootstrapState.value = 'idle'
  defenseRealtimeBootstrapPayload.value = null
  defenseRealtimeLatestError.value = ''
  defenseRealtimeLatestSpeakerLabel.value = ''
  defenseRealtimeLatestLatencyMs.value = null
  defenseRealtimeLogs.value = []
}

async function handleEndProjectMeeting(meetingId: string): Promise<void> {
  const targetMeetingId = normalizeString(meetingId)
  const linkedMeetingId = normalizeString(defenseSessionStateSnapshot.value?.linkedMeetingId)
  if (targetMeetingId && linkedMeetingId && targetMeetingId === linkedMeetingId)
    await teardownDefenseRealtimeBridge()
  await endProjectMeeting(meetingId)
}

const finalReviewActiveShares = computed(() => {
  return projectResourceShares.value.filter(item => !String(item.revokedAt || '').trim())
})
const finalReviewOpenIssues = computed(() => {
  const severityRank: Record<ProjectIssue['severity'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }
  return projectIssues.value
    .filter(item => (item.severity === 'critical' || item.severity === 'high') && item.status !== 'resolved' && item.status !== 'ignored')
    .sort((left, right) => {
      const rankDiff = severityRank[left.severity] - severityRank[right.severity]
      if (rankDiff !== 0)
        return rankDiff
      return parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt)
    })
})
const finalReviewUnresolvedIssueCount = computed(() => {
  return projectIssues.value.filter(item => item.status !== 'resolved' && item.status !== 'ignored').length
})

const finalReviewEvidenceGaps = computed(() => {
  const used = new Set<string>()
  return mappingRows.value.reduce<string[]>((list, row) => {
    const note = normalizeString(row.supportingNote)
    if (!note || used.has(note))
      return list
    used.add(note)
    list.push(note)
    return list
  }, [])
})

const finalReviewChecklistItems = computed<FinalReviewChecklistItem[]>(() => {
  const hasContestAndTrack = Boolean(selectedContest.value) && Boolean(selectedTrack.value)
  const hasMappingRows = mappingRows.value.length > 0
  const hasResources = selectedResources.value.length > 0
  const hasCoreDraftFields = Boolean(
    normalizeString(formState.title)
    && normalizeString(formState.problemStatement)
    && normalizeString(formState.summary),
  )
  const hasIssueReport = Boolean(latestIssueReport.value)
  const hasOpenCriticalIssue = projectIssues.value.some(item => item.severity === 'critical' && item.status === 'open')
  const hasActiveShare = finalReviewActiveShares.value.length > 0

  return [
    {
      id: 'contest-track',
      title: '已选择竞赛与赛道',
      description: hasContestAndTrack
        ? `${selectedContest.value?.name || '当前竞赛'} / ${selectedTrack.value?.name || '当前赛道'}`
        : '需要先明确终审提交对应的竞赛和赛道。',
      status: hasContestAndTrack ? 'pass' : 'missing',
      blocker: true,
    },
    {
      id: 'mapping',
      title: '已生成指标对标',
      description: hasMappingRows
        ? `当前已有 ${mappingRows.value.length} 条指标对标结果。`
        : '需要至少完成一轮 rubric 对标，明确评审维度与证据要求。',
      status: hasMappingRows ? 'pass' : 'missing',
      blocker: true,
    },
    {
      id: 'resources',
      title: '已关联项目资料',
      description: hasResources
        ? `当前已关联 ${selectedResources.value.length} 份项目资料。`
        : '终审材料还没有挂到研发工作台，无法形成证据链。',
      status: hasResources ? 'pass' : 'missing',
      blocker: true,
    },
    {
      id: 'draft-fields',
      title: '已补齐核心草案字段',
      description: hasCoreDraftFields
        ? '标题、问题定义和摘要都已具备。'
        : '标题、问题定义和摘要至少有一项仍为空。',
      status: hasCoreDraftFields ? 'pass' : 'missing',
      blocker: true,
    },
    {
      id: 'issue-report',
      title: '已生成终审问题报告',
      description: hasIssueReport
        ? `当前使用的问题报告：${latestIssueReport.value?.title || '终审问题报告'}`
        : '建议先产出一轮终审问题报告，再进入风险收敛。',
      status: hasIssueReport ? 'pass' : 'missing',
      blocker: true,
    },
    {
      id: 'critical-issues',
      title: '高危问题已清空',
      description: hasOpenCriticalIssue
        ? '仍存在 open 状态的 critical issue，需要优先清空。'
        : '当前不存在 open 状态的 critical issue。',
      status: hasOpenCriticalIssue ? 'warning' : 'pass',
      blocker: true,
    },
    {
      id: 'share-link',
      title: '已生成评审共享链接',
      description: hasActiveShare
        ? `当前已有 ${finalReviewActiveShares.value.length} 条可用共享链接。`
        : '暂无评审共享链接，建议在送审前补齐。',
      status: hasActiveShare ? 'pass' : 'warning',
      blocker: false,
    },
  ]
})

const finalReviewReadinessPercent = computed(() => {
  const weights: Record<FinalReviewChecklistStatus, number> = {
    pass: 1,
    warning: 0.55,
    missing: 0,
  }
  if (finalReviewChecklistItems.value.length === 0)
    return 0
  const total = finalReviewChecklistItems.value.reduce((sum, item) => sum + weights[item.status], 0)
  return Math.round((total / finalReviewChecklistItems.value.length) * 100)
})
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
      title: '切换到研发工作台',
      subtitle: '回到研发推进主工作台。',
      icon: 'space_dashboard',
      source: 'local',
      priority: 320,
      defaultVisible: true,
      actionId: 'switch_workbench_project',
      badge: workbenchMode.value === 'project' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('研发工作台', 'project workbench', '研发'),
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
      id: 'metak-command-switch-workbench-final-review',
      sectionId: 'actions',
      type: 'command',
      title: '切换到终审工作台',
      subtitle: '进入终审流程工作台，继续推进复核链路。',
      icon: 'task_alt',
      source: 'local',
      priority: 310,
      defaultVisible: true,
      actionId: 'switch_workbench_final_review',
      badge: workbenchMode.value === 'final_review' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('终审工作台', '终审', 'final review', '复核'),
    },
    {
      id: 'metak-command-switch-ai-dialog',
      sectionId: 'actions',
      type: 'command',
      title: '切换 AI 到对话询问',
      subtitle: '切到当前工作台的默认对话模式。',
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
      subtitle: '切到答辩工作台的自动优化模式。',
      icon: 'auto_fix_high',
      source: 'local',
      priority: 300,
      defaultVisible: true,
      actionId: 'switch_ai_optimize',
      badge: workbenchMode.value === 'defense' && aiMode.value === 'auto_optimize' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('自动优化', 'auto optimize'),
    },
    {
      id: 'metak-command-switch-ai-issue',
      sectionId: 'actions',
      type: 'command',
      title: '切换 AI 到寻疑发现',
      subtitle: '切到答辩工作台的寻疑发现模式。',
      icon: 'search_insights',
      source: 'local',
      priority: 295,
      defaultVisible: true,
      actionId: 'switch_ai_issue',
      badge: workbenchMode.value === 'defense' && aiMode.value === 'issue_discovery' ? '当前' : '',
      keywords: buildWorkspaceMetaKKeywords('寻疑发现', 'issue discovery', '问题发现'),
    },
    {
      id: 'metak-command-create-collab-markdown',
      sectionId: 'actions',
      type: 'command',
      title: `新建${COLLAB_NOTES_RESOURCE_LABEL}`,
      subtitle: `创建 markdown ${COLLAB_NOTES_RESOURCE_LABEL}并直接打开。`,
      icon: 'edit_document',
      source: 'local',
      priority: 290,
      defaultVisible: true,
      actionId: 'create_collab_markdown',
      keywords: buildWorkspaceMetaKKeywords(COLLAB_NOTES_RESOURCE_LABEL, '协作文档', 'markdown', 'notes'),
    },
    {
      id: 'metak-command-create-collab-draw',
      sectionId: 'actions',
      type: 'command',
      title: `新建${COLLAB_FREEFORM_RESOURCE_LABEL}`,
      subtitle: `创建${COLLAB_FREEFORM_RESOURCE_LABEL}并直接打开。`,
      icon: 'draw',
      source: 'local',
      priority: 285,
      defaultVisible: true,
      actionId: 'create_collab_draw',
      keywords: buildWorkspaceMetaKKeywords(COLLAB_FREEFORM_RESOURCE_LABEL, '自由画布', 'draw', 'canvas'),
    },
    {
      id: 'metak-command-create-collab-workflow',
      sectionId: 'actions',
      type: 'command',
      title: `新建${COLLAB_WORKFLOW_RESOURCE_LABEL}`,
      subtitle: `创建${COLLAB_WORKFLOW_RESOURCE_LABEL}并直接打开 AgentProto 梳理。`,
      icon: 'flowsheet',
      source: 'local',
      priority: 282,
      defaultVisible: true,
      actionId: 'create_collab_workflow',
      keywords: buildWorkspaceMetaKKeywords(COLLAB_WORKFLOW_RESOURCE_LABEL, 'workflow', '流程', 'agentproto'),
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
  const resourceId = String(currentPreviewResource?.id || '').trim()
  const derivedTitle = normalizeString(markdownDerivedTitleMap.value[resourceId])
  if (derivedTitle)
    return derivedTitle
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
  workspaceInvitationError.value = ''
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

function isCollabResource(resource: Resource | null | undefined): resource is CollabWorkspaceResource {
  if (!resource)
    return false
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  if (kind === 'markdown' || kind === 'draw')
    return true
  return String(resource.source || '').trim().toLowerCase() === 'collab'
}

function isWorkflowCanvasResource(resource: Resource | null | undefined): resource is Resource {
  return isCollabResource(resource)
    && resource.resourceKind === 'draw'
    && resolveCollabPurpose(resource) === 'workflow'
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
    handleMeetingRealtimeEnvelope(messageType, payload)
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
      const tone: MappingTone = normalizedWeight >= 75
        ? 'low'
        : normalizedWeight >= 50
          ? 'medium'
          : normalizedWeight >= 25
            ? 'high'
            : 'critical'
      const tags = [
        String(dimension.scoringPoint || '').trim(),
        String(dimension.evidenceRequirement || '').trim(),
      ].filter(Boolean)

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
        tone,
        tags,
      }
    })
    .filter(row => row.metric.trim())
})

watch([mappingScopeKey, selectedContestDetail, selectedContestDetailContestId], ([scopeKey, detail, detailContestId]) => {
  if (!scopeKey || !detail)
    return
  if (detailContestId !== normalizeString(selectedContestId.value))
    return
  mappingLoadedScopeKey.value = scopeKey
}, { immediate: true })

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

function formatAiQuotaResetCycleLabel(value: string | null | undefined): string {
  if (value === 'quarterly')
    return '每季度'
  if (value === 'yearly')
    return '每年'
  return '每月'
}

const currentWorkspaceQuota = computed(() => currentWorkspace.value?.quota || null)

const aiCreditsUsed = computed(() => {
  const quota = currentWorkspaceQuota.value
  return Math.max(
    0,
    Number(quota?.aiQuotaUsed || 0),
    Number(workspaceAiUsageTotalUnits.value || 0),
  )
})

const aiCreditsTotal = computed(() => {
  const quota = currentWorkspaceQuota.value
  const estimate = workspaceBillingEstimate.value
  return Math.max(
    0,
    Number(quota?.aiQuotaTotal || 0),
    Number(estimate?.aiQuotaTotal || 0),
    Number(estimate?.includedAiQuota || 0),
    aiCreditsUsed.value,
  )
})

const aiCreditsRemaining = computed(() => {
  if (aiCreditsTotal.value <= 0)
    return 0
  return Math.max(0, aiCreditsTotal.value - aiCreditsUsed.value)
})

const aiQuotaResetCycle = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota?.resetCycle)
    return quota.resetCycle
  if (workspaceBillingEstimate.value?.billingCycle)
    return workspaceBillingEstimate.value.billingCycle
  return ''
})

const hasAiCreditsConfigured = computed(() => {
  return aiCreditsTotal.value > 0 || aiCreditsUsed.value > 0
})

const aiCreditsUsageText = computed(() => {
  if (!hasAiCreditsConfigured.value)
    return '未配置'
  return `${aiCreditsUsed.value.toLocaleString('zh-CN')} / ${aiCreditsTotal.value.toLocaleString('zh-CN')} credits`
})

const aiCreditsRemainingText = computed(() => {
  if (!hasAiCreditsConfigured.value)
    return '未配置'
  return `${aiCreditsRemaining.value.toLocaleString('zh-CN')} credits`
})

const aiCreditsTooltipLabel = computed(() => {
  if (hasAiCreditsConfigured.value) {
    const cycleText = formatAiQuotaResetCycleLabel(aiQuotaResetCycle.value)
    return `按 credits 配额计费 · ${cycleText}重置`
  }
  return '按 credits 配额计费'
})

const aiBillingLabel = computed(() => {
  return aiCreditsTooltipLabel.value
})

function patchWorkspaceQuotaUsage<T extends {
  quota: {
    aiQuotaTotal: number
    aiQuotaUsed: number
    updatedAt: string
  } | null
}>(items: T[], resolveWorkspaceId: (item: T) => string, input: {
  workspaceId: string
  consumedUnits: number
  remainingQuota: number | null
}): T[] {
  return items.map((item) => {
    if (resolveWorkspaceId(item) !== input.workspaceId || !item.quota)
      return item

    const nextUsed = input.remainingQuota === null
      ? Math.max(0, item.quota.aiQuotaUsed + input.consumedUnits)
      : Math.max(0, item.quota.aiQuotaTotal - input.remainingQuota)

    return {
      ...item,
      quota: {
        ...item.quota,
        aiQuotaUsed: nextUsed,
        updatedAt: new Date().toISOString(),
      },
    }
  })
}

function applyInlineCompletionQuotaResult(result: AiWorkspaceInlineCompletionAcceptResult): void {
  const workspaceId = normalizeString(activeWorkspaceId.value)
  if (!me.value || !workspaceId)
    return

  me.value = {
    ...me.value,
    teams: patchWorkspaceQuotaUsage(me.value.teams, item => String(item.team.id || '').trim(), {
      workspaceId,
      consumedUnits: result.consumedUnits,
      remainingQuota: result.remainingQuota,
    }),
    workspaces: patchWorkspaceQuotaUsage(me.value.workspaces, item => String(item.workspace.id || '').trim(), {
      workspaceId,
      consumedUnits: result.consumedUnits,
      remainingQuota: result.remainingQuota,
    }),
  }

  if (workspaceAiUsageTotalUnits.value !== null)
    workspaceAiUsageTotalUnits.value = Math.max(0, workspaceAiUsageTotalUnits.value + result.consumedUnits)
}

const projectUploadStorageUsedBytes = computed(() => {
  return selectedResources.value.reduce((sum, resource) => sum + parseFileSizeFromResource(resource), 0)
})

function getAiFeatureStatus(key: ProjectWorkspaceAiFeatureKey): AiRuntimeFeatureStatus | null {
  return aiRuntimeStatus.value?.[key] || null
}

function resolveDocumentAssistFeatureKey(action: AiWorkspaceDocumentAction): DocumentAssistFeatureKey {
  return DOCUMENT_ASSIST_FEATURE_KEY_MAP[action]
}

function resolveAiFeatureKeyForMode(mode: WorkspaceAiMode): ProjectWorkspaceAiFeatureKey {
  if (mode === 'auto_optimize')
    return 'workspaceAutoOptimize'
  if (mode === 'issue_discovery')
    return 'workspaceIssueDiscovery'
  if (mode === 'document_assist')
    return 'documentAssist'
  if (mode === 'defense')
    return 'defense'
  return 'workspaceDialogAsk'
}

function resolveWorkflowDraftFeatureKey(action: WorkflowDraftAction): ProjectWorkspaceAiFeatureKey {
  if (action === 'complete')
    return 'canvasComplete'
  if (action === 'refine')
    return 'canvasRefine'
  if (action === 'restyle')
    return 'workspaceDialogAsk'
  return 'canvasGenerate'
}

function buildAiUnavailableMessage(key: ProjectWorkspaceAiFeatureKey): string {
  return String(getAiFeatureStatus(key)?.reason || '').trim() || `${AI_RUNTIME_FEATURE_LABELS[key]} 未配置，请先在后台完成模型与密钥配置后再试。`
}

function isAiFeatureAvailable(key: ProjectWorkspaceAiFeatureKey): boolean {
  if (!aiRuntimeStatusLoaded.value)
    return true
  return Boolean(getAiFeatureStatus(key)?.configured)
}

function ensureAiFeatureAvailable(key: ProjectWorkspaceAiFeatureKey, message = ''): boolean {
  if (isAiFeatureAvailable(key))
    return true
  statusLine.value = message || buildAiUnavailableMessage(key)
  return false
}

const documentAssistActionStatusMap = computed<Record<AiWorkspaceDocumentAction, AiRuntimeFeatureStatus>>(() => {
  const fallback = {
    configured: true,
    provider: '',
    model: '',
    reason: '',
  }

  return {
    summarize: getAiFeatureStatus(resolveDocumentAssistFeatureKey('summarize')) || fallback,
    rewrite: getAiFeatureStatus(resolveDocumentAssistFeatureKey('rewrite')) || fallback,
    continue: getAiFeatureStatus(resolveDocumentAssistFeatureKey('continue')) || fallback,
    expand: getAiFeatureStatus(resolveDocumentAssistFeatureKey('expand')) || fallback,
    complete_context: getAiFeatureStatus(resolveDocumentAssistFeatureKey('complete_context')) || fallback,
    restructure: getAiFeatureStatus(resolveDocumentAssistFeatureKey('restructure')) || fallback,
  }
})

const currentAiFeatureKey = computed<ProjectWorkspaceAiFeatureKey>(() => {
  return resolveAiFeatureKeyForMode(aiMode.value)
})
const currentAiFeatureStatus = computed(() => {
  return getAiFeatureStatus(currentAiFeatureKey.value)
})
const currentAiModeAvailable = computed(() => {
  if (aiMode.value === 'document_assist')
    return Object.values(documentAssistActionStatusMap.value).some(item => item.configured)
  return isAiFeatureAvailable(currentAiFeatureKey.value)
})
const currentAiDisabledReason = computed(() => {
  if (currentAiModeAvailable.value)
    return ''
  if (aiMode.value === 'document_assist')
    return 'AgentDoc 未配置，请先在后台完成至少一个文档场景的模型与密钥配置后再试。'
  if (workbenchMode.value === 'project' && projectAssistantMode.value === 'contextual' && projectContextualAssistant.value) {
    return String(currentAiFeatureStatus.value?.reason || '').trim()
      || `${projectContextualAssistant.value.label} 未配置，请先在后台完成模型与密钥配置后再试。`
  }
  return buildAiUnavailableMessage(currentAiFeatureKey.value)
})
const workflowGenerateAvailable = computed(() => !workflowCanvasUnavailableReason.value && isAiFeatureAvailable(resolveWorkflowDraftFeatureKey('generate')))
const workflowGenerateDisabledReason = computed(() => {
  if (workflowCanvasUnavailableReason.value)
    return workflowCanvasUnavailableReason.value
  if (workflowGenerateAvailable.value)
    return ''
  return buildAiUnavailableMessage(resolveWorkflowDraftFeatureKey('generate'))
})
const workflowCompleteAvailable = computed(() => !workflowCanvasUnavailableReason.value && isAiFeatureAvailable(resolveWorkflowDraftFeatureKey('complete')))
const workflowCompleteDisabledReason = computed(() => {
  if (workflowCanvasUnavailableReason.value)
    return workflowCanvasUnavailableReason.value
  if (workflowCompleteAvailable.value)
    return ''
  return buildAiUnavailableMessage(resolveWorkflowDraftFeatureKey('complete'))
})
const workflowRefineAvailable = computed(() => !workflowCanvasUnavailableReason.value && isAiFeatureAvailable(resolveWorkflowDraftFeatureKey('refine')))
const workflowRefineDisabledReason = computed(() => {
  if (workflowCanvasUnavailableReason.value)
    return workflowCanvasUnavailableReason.value
  if (workflowRefineAvailable.value)
    return ''
  return buildAiUnavailableMessage(resolveWorkflowDraftFeatureKey('refine'))
})
const workflowRestyleAvailable = computed(() => !workflowCanvasUnavailableReason.value && isAiFeatureAvailable(resolveWorkflowDraftFeatureKey('restyle')))
const workflowRestyleDisabledReason = computed(() => {
  if (workflowCanvasUnavailableReason.value)
    return workflowCanvasUnavailableReason.value
  if (workflowRestyleAvailable.value)
    return ''
  return buildAiUnavailableMessage(resolveWorkflowDraftFeatureKey('restyle'))
})
const sceneGenerateAvailable = computed(() => !sceneCanvasUnavailableReason.value && isAiFeatureAvailable(resolveWorkflowDraftFeatureKey('generate')))
const sceneGenerateDisabledReason = computed(() => {
  if (sceneCanvasUnavailableReason.value)
    return sceneCanvasUnavailableReason.value
  if (sceneGenerateAvailable.value)
    return ''
  return buildAiUnavailableMessage(resolveWorkflowDraftFeatureKey('generate'))
})
const sceneCompleteAvailable = computed(() => !sceneCanvasUnavailableReason.value && isAiFeatureAvailable(resolveWorkflowDraftFeatureKey('complete')))
const sceneCompleteDisabledReason = computed(() => {
  if (sceneCanvasUnavailableReason.value)
    return sceneCanvasUnavailableReason.value
  if (sceneCompleteAvailable.value)
    return ''
  return buildAiUnavailableMessage(resolveWorkflowDraftFeatureKey('complete'))
})
const sceneRefineAvailable = computed(() => !sceneCanvasUnavailableReason.value && isAiFeatureAvailable(resolveWorkflowDraftFeatureKey('refine')))
const sceneRefineDisabledReason = computed(() => {
  if (sceneCanvasUnavailableReason.value)
    return sceneCanvasUnavailableReason.value
  if (sceneRefineAvailable.value)
    return ''
  return buildAiUnavailableMessage(resolveWorkflowDraftFeatureKey('refine'))
})
const sceneRestyleAvailable = computed(() => !sceneCanvasUnavailableReason.value && isAiFeatureAvailable(resolveWorkflowDraftFeatureKey('restyle')))
const sceneRestyleDisabledReason = computed(() => {
  if (sceneCanvasUnavailableReason.value)
    return sceneCanvasUnavailableReason.value
  if (sceneRestyleAvailable.value)
    return ''
  return buildAiUnavailableMessage(resolveWorkflowDraftFeatureKey('restyle'))
})
const currentAiModelLabel = computed(() => {
  if (aiRuntimeStatusLoading.value)
    return '状态检查中'
  if (aiRuntimeStatusError.value)
    return '状态未知'
  if (!aiRuntimeStatusLoaded.value)
    return '等待检查'
  if (!currentAiFeatureStatus.value?.configured)
    return '未配置'
  return String(currentAiFeatureStatus.value.model || '').trim() || '已配置'
})
const aiRuntimeBusy = computed(() => {
  return aiFiltering.value
    || chatLoading.value
    || topicBoardLoading.value
    || defenseSummaryLoading.value
    || defenseRealtimeStarting.value
})
const aiStatusLabel = computed(() => {
  if (aiRuntimeBusy.value)
    return 'AI 运行中'
  if (aiRuntimeStatusLoading.value)
    return 'AI 状态检查中'
  if (aiRuntimeStatusError.value)
    return 'AI 状态检查失败'
  if (!aiRuntimeStatusLoaded.value)
    return 'AI 状态待确认'
  return currentAiModeAvailable.value ? 'AI 已配置' : 'AI 未配置'
})
const aiStatusTone = computed<'ready' | 'running' | 'missing' | 'checking' | 'error'>(() => {
  if (aiRuntimeBusy.value)
    return 'running'
  if (aiRuntimeStatusLoading.value)
    return 'checking'
  if (aiRuntimeStatusError.value)
    return 'error'
  if (!aiRuntimeStatusLoaded.value)
    return 'checking'
  return currentAiModeAvailable.value ? 'ready' : 'missing'
})

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
    && (workspaceCriticalLoading.value || workspaceBackgroundLoading.value)
    && !hasWorkspaceBootstrapData.value
})
function resolveWorkspaceShellLoadingState(): boolean {
  if (!me.value)
    return true
  if (!activeWorkspaceId.value)
    return true
  if (!highlightedProjectId.value)
    return false
  if (workspaceCriticalLoading.value)
    return true
  if (!projectWorkspaceViewReady.value)
    return true
  return !activeTabReady.value
}

const workspaceShellLoading = computed(() => {
  return resolveWorkspaceShellLoadingState()
})
const workspaceShellLoadingProgress = computed(() => {
  if (!me.value)
    return 6
  if (!activeWorkspaceId.value)
    return 12
  if (!highlightedProjectId.value)
    return 100
  if (activeTabReady.value)
    return 100
  if (projectWorkspaceViewReady.value)
    return 74
  if (projectWorkspaceModeHydrating.value || projectWorkspaceViewHydrating.value)
    return 52
  if (workspaceCriticalLoading.value)
    return 28
  return 16
})

function resolveWorkbenchModeOrderIndex(mode: WorkspaceWorkbenchMode): number {
  const index = WORKBENCH_MODE_ORDER.indexOf(mode)
  return index >= 0 ? index : 0
}

function resolveWorkbenchSceneTransitionDirection(
  currentMode: WorkspaceWorkbenchMode,
  nextMode: WorkspaceWorkbenchMode,
): WorkbenchSceneTransitionName {
  return resolveWorkbenchModeOrderIndex(nextMode) >= resolveWorkbenchModeOrderIndex(currentMode)
    ? 'workspace-workbench-scene-forward'
    : 'workspace-workbench-scene-backward'
}

function resolveWorkbenchSceneTransitionDuration(): number {
  return prefersReducedMotion.value ? 160 : 320
}

function clearWorkbenchSwitchDelays(): void {
  activeWorkbenchSwitchDelayIds.forEach(timeoutId => clearTimeout(timeoutId))
  activeWorkbenchSwitchDelayIds.clear()
}

function resolveWorkbenchSceneTransition(): void {
  const resolver = workbenchSceneTransitionResolver
  workbenchSceneTransitionResolver = null
  resolver?.()
}

function waitForWorkbenchDelay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      activeWorkbenchSwitchDelayIds.delete(timeoutId)
      resolve()
    }, durationMs)
    activeWorkbenchSwitchDelayIds.add(timeoutId)
  })
}

function waitForWorkbenchSceneTransitionEnd(): Promise<void> {
  let settled = false
  const finish = () => {
    if (settled)
      return
    settled = true
    resolveWorkbenchSceneTransition()
  }

  return new Promise((resolve) => {
    workbenchSceneTransitionResolver = () => {
      if (settled)
        return
      settled = true
      workbenchSceneTransitionResolver = null
      resolve()
    }
    void waitForWorkbenchDelay(resolveWorkbenchSceneTransitionDuration() + 80).then(() => {
      finish()
      resolve()
    })
  })
}

async function runWorkbenchSwitchLoadingSequence(): Promise<void> {
  workbenchSwitchPhase.value = 'loading'
  workbenchSwitchProgress.value = 12
  await waitForWorkbenchDelay(90)
  workbenchSwitchProgress.value = 38
  await waitForWorkbenchDelay(140)
  workbenchSwitchProgress.value = 72
  await waitForWorkbenchDelay(130)
  workbenchSwitchProgress.value = 100
  await waitForWorkbenchDelay(60)
}

function handleWorkbenchSceneTransitionAfterEnter(): void {
  if (workbenchSwitchPhase.value !== 'animating')
    return
  resolveWorkbenchSceneTransition()
}

function handleReducedMotionPreferenceChange(event: MediaQueryListEvent): void {
  prefersReducedMotion.value = event.matches
}

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
      leftSidebarCollapsed: true,
      rightSidebarCollapsed: true,
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
  return sanitizeProjectWorkspaceViewState(normalizeProjectWorkspaceViewState(record.payload), resources.value)
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
  catch (error) {
    const info = resolveAuthRequestErrorInfo(error)
    if (!info.isUnauthorized) {
      statusLine.value = resolveAuthDisplayMessage(error, '登录态校验失败，请稍后重试。')
      return false
    }

    await navigateTo({
      path: '/login',
      query: { redirect: route.fullPath || teamDashboardPath() },
    })
    return false
  }
}

async function loadWorkspaceBillingEstimate(workspaceId = activeWorkspaceId.value): Promise<void> {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  if (!normalizedWorkspaceId) {
    workspaceBillingEstimate.value = null
    return
  }

  const requestSeq = ++workspaceBillingEstimateSeq
  try {
    const response = await authApiFetch<ApiResponse<WorkspaceBillingEstimate>>(`/teams/${normalizedWorkspaceId}/billing/estimate`)
    if (requestSeq !== workspaceBillingEstimateSeq || normalizeString(activeWorkspaceId.value) !== normalizedWorkspaceId)
      return
    workspaceBillingEstimate.value = response.data
  }
  catch {
    if (requestSeq === workspaceBillingEstimateSeq && normalizeString(activeWorkspaceId.value) === normalizedWorkspaceId)
      workspaceBillingEstimate.value = null
  }
}

async function loadWorkspaceAiUsageSummary(workspaceId = activeWorkspaceId.value): Promise<void> {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  if (!normalizedWorkspaceId) {
    workspaceAiUsageTotalUnits.value = null
    return
  }

  const requestSeq = ++workspaceAiUsageSummarySeq
  try {
    const response = await authApiFetch<ApiResponse<WorkspaceAiUsageHistory>>(`/teams/${normalizedWorkspaceId}/ai/usage?page=1&pageSize=1`)
    if (requestSeq !== workspaceAiUsageSummarySeq || normalizeString(activeWorkspaceId.value) !== normalizedWorkspaceId)
      return
    workspaceAiUsageTotalUnits.value = Math.max(0, Number(response.data?.totalUnits || 0))
  }
  catch {
    if (requestSeq === workspaceAiUsageSummarySeq && normalizeString(activeWorkspaceId.value) === normalizedWorkspaceId)
      workspaceAiUsageTotalUnits.value = null
  }
}

async function loadAiRuntimeStatus(): Promise<void> {
  aiRuntimeStatusLoading.value = true
  aiRuntimeStatusError.value = ''

  try {
    const response = await unsafeFetch<ApiResponse<ProjectWorkspaceAiRuntimeStatus>>(endpoint('/user/ai/runtime'))
    aiRuntimeStatus.value = response.data
    aiRuntimeStatusLoaded.value = true
  }
  catch (error) {
    aiRuntimeStatus.value = null
    aiRuntimeStatusLoaded.value = false
    aiRuntimeStatusError.value = resolveApiErrorMessage(error, 'AI 状态检查失败，请稍后重试。')
    console.error('[workspace-ai-runtime] load failed', error)
  }
  finally {
    aiRuntimeStatusLoading.value = false
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

function clearWorkspaceDisplayWidthSyncTimer(): void {
  if (!workspaceDisplayWidthSyncTimer)
    return
  clearTimeout(workspaceDisplayWidthSyncTimer)
  workspaceDisplayWidthSyncTimer = null
}

async function flushWorkspaceDisplayWidthUserSync(): Promise<void> {
  if (workspaceDisplayWidthSyncRunning || !pendingWorkspaceDisplayWidthSyncPayload)
    return

  const payload = pendingWorkspaceDisplayWidthSyncPayload
  pendingWorkspaceDisplayWidthSyncPayload = null
  workspaceDisplayWidthSyncRunning = true

  try {
    await patchUserWorkspaceDisplayDefaultsByApi({
      leftSidebarWidth: payload.leftSidebarWidth,
      rightSidebarWidth: payload.rightSidebarWidth,
    })
    if (activeWorkspaceId.value === payload.workspaceId)
      await loadWorkspaceDisplayPreferenceSnapshot(payload.workspaceId, { silent: true })
  }
  catch {
  }
  finally {
    workspaceDisplayWidthSyncRunning = false
    if (pendingWorkspaceDisplayWidthSyncPayload)
      void flushWorkspaceDisplayWidthUserSync()
  }
}

function scheduleWorkspaceDisplayWidthUserSync(): void {
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  if (!workspaceId)
    return

  pendingWorkspaceDisplayWidthSyncPayload = {
    workspaceId,
    leftSidebarWidth: leftSidebarWidth.value,
    rightSidebarWidth: rightSidebarWidth.value,
  }
  clearWorkspaceDisplayWidthSyncTimer()
  workspaceDisplayWidthSyncTimer = setTimeout(() => {
    workspaceDisplayWidthSyncTimer = null
    void flushWorkspaceDisplayWidthUserSync()
  }, 180)
}

function resetWorkspaceDisplayPreferenceState(): void {
  workspaceDisplayPreferenceSnapshot.value = defaultWorkspaceDisplayPreferenceSnapshot()
  workspaceDisplayPreferenceLoading.value = false
  workspaceDisplayPreferenceSavingScope.value = ''
  workspaceDisplayPreferenceError.value = ''
  workspaceDisplayPreferenceWorkspaceId.value = ''
}

async function loadWorkspaceDisplayPreferenceSnapshot(
  workspaceId = activeWorkspaceId.value,
  options: { silent?: boolean } = {},
): Promise<void> {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    resetWorkspaceDisplayPreferenceState()
    return
  }

  if (!options.silent) {
    workspaceDisplayPreferenceLoading.value = true
    workspaceDisplayPreferenceError.value = ''
  }
  try {
    const snapshot = await loadWorkspaceDisplayPreferenceSnapshotByApi(normalizedWorkspaceId)
    if (activeWorkspaceId.value !== normalizedWorkspaceId)
      return
    workspaceDisplayPreferenceSnapshot.value = snapshot
    workspaceDisplayPreferenceWorkspaceId.value = normalizedWorkspaceId
  }
  catch (error) {
    if (activeWorkspaceId.value !== normalizedWorkspaceId)
      return
    if (options.silent)
      return
    workspaceDisplayPreferenceSnapshot.value = defaultWorkspaceDisplayPreferenceSnapshot()
    workspaceDisplayPreferenceWorkspaceId.value = normalizedWorkspaceId
    workspaceDisplayPreferenceError.value = resolveApiErrorMessage(error, '加载工作区显示偏好失败，请稍后重试。')
  }
  finally {
    if (!options.silent && activeWorkspaceId.value === normalizedWorkspaceId)
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
      leftSidebarWidth: payload.leftSidebarWidth,
      rightSidebarWidth: payload.rightSidebarWidth,
    }
    const snapshot = await patchWorkspaceDisplayUserOverrideByApi(workspaceId, nextPayload)
    if (activeWorkspaceId.value !== workspaceId)
      return
    workspaceDisplayPreferenceSnapshot.value = snapshot
    workspaceDisplayPreferenceWorkspaceId.value = workspaceId
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
      leftSidebarWidth: payload.leftSidebarWidth,
      rightSidebarWidth: payload.rightSidebarWidth,
    }
    const snapshot = await patchWorkspaceDisplayTeamDefaultByApi(workspaceId, nextPayload)
    if (activeWorkspaceId.value !== workspaceId)
      return
    workspaceDisplayPreferenceSnapshot.value = snapshot
    workspaceDisplayPreferenceWorkspaceId.value = workspaceId
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
  const sameContestRefresh = selectedContestDetailContestId.value === normalizedContestId

  if (!normalizedContestId) {
    selectedContestDetail.value = null
    selectedContestDetailContestId.value = ''
    selectedContestDetailLoading.value = false
    return
  }

  if (!sameContestRefresh) {
    selectedContestDetail.value = null
    selectedContestDetailContestId.value = ''
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
    selectedContestDetailContestId.value = normalizedContestId
  }
  catch {
    if (requestId !== selectedContestDetailRequestId || normalizedContestId !== String(selectedContestId.value || '').trim())
      return
    if (!sameContestRefresh) {
      selectedContestDetail.value = null
      selectedContestDetailContestId.value = ''
    }
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
  const projectId = String(activeProjectId.value || '').trim()
  const sameProjectRefresh = resourcesLoadedProjectId.value === projectId
  resourcesLoading.value = true
  if (!projectId) {
    resources.value = []
    resourcesLoadedProjectId.value = ''
    resourcesLoading.value = false
    return
  }

  try {
    const response = await unsafeFetch<ApiResponse<Resource[]>>(endpoint(`/projects/${projectId}/resources`))
    if (activeProjectId.value === projectId) {
      resources.value = response.data
      resourcesLoadedProjectId.value = projectId
    }
  }
  catch {
    if (activeProjectId.value === projectId && !sameProjectRefresh) {
      resources.value = []
      resourcesLoadedProjectId.value = ''
    }
  }
  finally {
    if (activeProjectId.value === projectId || !activeProjectId.value)
      resourcesLoading.value = false
  }
}

async function loadProjectResourceLibrary() {
  const projectId = String(activeProjectId.value || '').trim()
  const sameProjectRefresh = resourceLibraryLoadedProjectId.value === projectId
  resourceLibraryLoading.value = true
  if (!projectId) {
    resourceLibrary.value = []
    resourceLibraryLoadedProjectId.value = ''
    resourceLibraryLoading.value = false
    return
  }

  try {
    const response = await unsafeFetch<ApiResponse<Resource[]>>(endpoint(`/projects/${projectId}/resources/library`))
    if (activeProjectId.value === projectId) {
      resourceLibrary.value = response.data
      resourceLibraryLoadedProjectId.value = projectId
    }
  }
  catch {
    if (activeProjectId.value === projectId && !sameProjectRefresh) {
      resourceLibrary.value = []
      resourceLibraryLoadedProjectId.value = ''
    }
  }
  finally {
    if (activeProjectId.value === projectId || !activeProjectId.value)
      resourceLibraryLoading.value = false
  }
}

async function loadProjectRecycleResources() {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId) {
    recycleResources.value = []
    return
  }

  try {
    const response = await unsafeFetch<ApiResponse<Resource[]>>(endpoint(`/projects/${projectId}/resources/recycle`))
    if (activeProjectId.value === projectId)
      recycleResources.value = response.data
  }
  catch {
    if (activeProjectId.value === projectId)
      recycleResources.value = []
  }
}

async function loadProjectResourceShares() {
  const projectId = String(activeProjectId.value || '').trim()
  const sameProjectRefresh = projectResourceSharesLoadedProjectId.value === projectId
  projectResourceSharesLoading.value = true
  if (!projectId) {
    projectResourceShares.value = []
    projectResourceSharesLoadedProjectId.value = ''
    projectResourceSharesLoading.value = false
    return
  }

  try {
    const response = await unsafeFetch<ApiResponse<ProjectResourceShare[]>>(endpoint(`/projects/${projectId}/resources/shares`))
    if (activeProjectId.value === projectId) {
      projectResourceShares.value = response.data.map(item => ({
        ...item,
        shareUrl: resolveProjectResourceShareUrl(String(item.shareUrl || '').trim()),
      }))
      projectResourceSharesLoadedProjectId.value = projectId
    }
  }
  catch {
    if (activeProjectId.value === projectId && !sameProjectRefresh) {
      projectResourceShares.value = []
      projectResourceSharesLoadedProjectId.value = ''
    }
  }
  finally {
    if (activeProjectId.value === projectId || !activeProjectId.value)
      projectResourceSharesLoading.value = false
  }
}

async function refreshProjectCriticalResourceContext() {
  await loadProjectResources()
}

async function refreshProjectDeferredResourceContext(options: {
  includeLibrary?: boolean
  includeRecycle?: boolean
  includeShares?: boolean
} = {}) {
  const {
    includeLibrary = true,
    includeRecycle = true,
    includeShares = true,
  } = options
  const tasks: Promise<unknown>[] = []

  if (includeLibrary)
    tasks.push(loadProjectResourceLibrary())
  if (includeRecycle)
    tasks.push(loadProjectRecycleResources())
  if (includeShares)
    tasks.push(loadProjectResourceShares())

  await Promise.all(tasks)
}

async function refreshProjectResourceContext(options: {
  includeLibrary?: boolean
  includeRecycle?: boolean
  includeShares?: boolean
} = {}) {
  await refreshProjectCriticalResourceContext()
  await refreshProjectDeferredResourceContext(options)
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
  workspaceInvitationError.value = ''
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
    workspaceInvitationError.value = ''
    statusLine.value = '项目邀请已生成，可复制邀请链接发送给协作者。'
  }
  catch (error) {
    workspaceInvitationError.value = resolveApiErrorMessage(error, '创建项目邀请失败，请稍后重试。')
    statusLine.value = workspaceInvitationError.value
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

async function addResourceFromLibrary(resourceInput: string | { resourceId: string, parentResourceId?: string | null }) {
  const targetResourceId = typeof resourceInput === 'string'
    ? String(resourceInput || '').trim()
    : String(resourceInput.resourceId || '').trim()
  const parentResourceId = typeof resourceInput === 'string'
    ? ''
    : String(resourceInput.parentResourceId || '').trim()
  if (!activeProjectId.value || !targetResourceId)
    return

  resourceMutating.value = true
  try {
    await unsafeFetch(endpoint(`/projects/${activeProjectId.value}/resources/library`), {
      method: 'POST',
      body: {
        resourceId: targetResourceId,
        parentResourceId: parentResourceId || undefined,
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

async function createCollabResource(
  resourceInput:
    | 'markdown'
    | 'draw'
    | { kind: 'markdown' | 'draw', purpose?: 'notes' | 'freeform' | 'design' | 'workflow', parentResourceId?: string | null },
) {
  const projectId = String(activeProjectId.value || '').trim()
  const kind = typeof resourceInput === 'string' ? resourceInput : resourceInput.kind
  const purpose = typeof resourceInput === 'string'
    ? (kind === 'draw' ? 'freeform' : 'notes')
    : (resourceInput.purpose || (kind === 'draw' ? 'freeform' : 'notes'))
  const parentResourceId = typeof resourceInput === 'string'
    ? ''
    : String(resourceInput.parentResourceId || '').trim()
  if (!projectId)
    return

  resourceMutating.value = true
  const resourceLabel = resolveCollabResourceDisplayLabel(purpose, kind)
  try {
    const response = await unsafeFetch<ApiResponse<{ resource: Resource, snapshot: CollabSnapshotPayload }>>(endpoint(`/projects/${projectId}/resources/collab`), {
      method: 'POST',
      body: {
        kind,
        purpose,
        ...(purpose === 'design'
          ? {
              title: '设计稿',
              drawMode: 'composition',
              sceneSourceType: 'image_mockup',
              templateKey: 'device-showcase',
              editorEngine: 'canvaskit_wasm',
            }
          : {}),
        parentResourceId: parentResourceId || undefined,
      },
    })

    await refreshProjectResourceContext()

    const createdResource = response.data?.resource
    const snapshot = response.data?.snapshot
    if (createdResource?.id) {
      await openProjectCollabResource(createdResource.id, snapshot || null, {
        surface: purpose === 'design'
          ? 'design'
          : purpose === 'workflow'
            ? 'flow'
            : 'preview',
      })
      statusLine.value = `已创建${resourceLabel}，协作模式已打开。`
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

async function renameProjectResource(payload: { resourceId: string, title: string }) {
  const projectId = String(activeProjectId.value || '').trim()
  const resourceId = String(payload.resourceId || '').trim()
  const title = String(payload.title || '').trim()
  if (!projectId || !resourceId || !title)
    return

  resourceMutating.value = true
  try {
    await unsafeFetch<ApiResponse<Resource>>(endpoint(`/projects/${projectId}/resources/${resourceId}`), {
      method: 'PATCH',
      body: {
        title,
      },
    })
    await refreshProjectResourceContext()
    statusLine.value = `已更新资源名称：${title}`
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '更新资源名称失败，请稍后重试。')
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

async function removeProjectResources(resourceIds: string[]) {
  const projectId = String(activeProjectId.value || '').trim()
  const normalizedResourceIds = [...new Set(resourceIds.map(item => String(item || '').trim()).filter(Boolean))]
  if (!projectId || normalizedResourceIds.length === 0)
    return

  resourceMutating.value = true
  try {
    const results = await Promise.allSettled(
      normalizedResourceIds.map(resourceId => unsafeFetch(endpoint(`/projects/${projectId}/resources/${resourceId}`), {
        method: 'DELETE',
      })),
    )
    const succeededIds = results.flatMap((result, index) => result.status === 'fulfilled' ? [normalizedResourceIds[index]] : [])
    const failedCount = normalizedResourceIds.length - succeededIds.length

    if (succeededIds.length > 0) {
      if (previewResourceId.value && succeededIds.includes(previewResourceId.value))
        closeProjectResourcePreview()
      await refreshProjectResourceContext()
      await generateProjectOutline('resource_delete_success', true)
    }

    if (failedCount === 0) {
      statusLine.value = `已将 ${succeededIds.length} 个资源移入项目回收站，结构大纲已刷新。`
      return
    }

    if (succeededIds.length > 0) {
      statusLine.value = `已将 ${succeededIds.length} 个资源移入项目回收站，另有 ${failedCount} 个删除失败。`
      return
    }

    const firstRejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    statusLine.value = resolveApiErrorMessage(
      firstRejected?.reason,
      '批量删除资源失败，请稍后重试。',
    )
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

async function patchProjectResourceTree(payload: {
  items: Array<{ resourceId: string, parentResourceId: string | null, sortOrder: number }>
}) {
  const projectId = String(activeProjectId.value || '').trim()
  if (!projectId || !Array.isArray(payload.items) || payload.items.length === 0)
    return

  resourceMutating.value = true
  try {
    await unsafeFetch(endpoint(`/projects/${projectId}/resources/tree`), {
      method: 'PATCH',
      body: {
        items: payload.items,
      },
    })
    await refreshProjectResourceContext()
    await generateProjectOutline('resource_tree_patch_success', true)
    statusLine.value = '项目资料树已更新。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '更新项目资料树失败，请稍后重试。')
  }
  finally {
    resourceMutating.value = false
  }
}

async function uploadResourcesToProject(resourceInput: File[] | { files: File[], parentResourceId?: string | null }) {
  const files = Array.isArray(resourceInput) ? resourceInput : resourceInput.files
  const parentResourceId = Array.isArray(resourceInput)
    ? ''
    : String(resourceInput.parentResourceId || '').trim()
  if (!activeProjectId.value)
    return

  try {
    await projectUploadManager.enqueueFiles(files, {
      parentResourceId: parentResourceId || undefined,
    })
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

    try {
      await refreshProjectResourceContext()
    }
    catch (refreshError) {
      console.warn('[project-workspace] refresh project resources after markdown image upload failed', refreshError)
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

function requestWorkflowCanvasRebuild(): void {
  if (!activeWorkflowResourceId.value) {
    statusLine.value = '当前没有可用的流程画布，无法执行重建。'
    return
  }
  workflowCanvasRebuildConfirmVisible.value = true
}

function cancelWorkflowCanvasRebuild(): void {
  workflowCanvasRebuildConfirmVisible.value = false
}

function confirmWorkflowCanvasRebuild(): void {
  if (!activeWorkflowResourceId.value) {
    workflowCanvasRebuildConfirmVisible.value = false
    statusLine.value = '当前没有可用的流程画布，无法执行重建。'
    return
  }

  const pageName = activeWorkflowResourceTitle.value || COLLAB_WORKFLOW_RESOURCE_LABEL
  const xml = createDefaultDrawioXml(pageName)
  workflowCanvasRebuildConfirmVisible.value = false
  updateCollabDrawContent(serializeDrawioCollabValue(xml))
  workflowDrawioLegacyUnavailable.value = false
  workflowDrawioLegacyMessage.value = ''
  workflowSnapshotState.value = parseDrawioXmlToWorkflowSnapshot(xml)
  appliedWorkflowDraftKeys.value = []
  discardedWorkflowDraftKeys.value = []
  statusLine.value = '已重建流程画布，可继续在 draw.io 中编辑或生成 AgentProto 草案。'
}

function updateCollabCursor(value: { cursorX?: number, cursorY?: number }): void {
  collabSession.updatePresenceCursor(value.cursorX, value.cursorY)
}

function updateCollabSelectionStatus(value: {
  line: number
  column: number
  selectionLength: number
  selection?: {
    anchorLine: number
    anchorColumn: number
    headLine: number
    headColumn: number
    isCollapsed: boolean
    selectionLength: number
    selectedText?: string
    selectedTextPreview?: string
  } | null
}): void {
  collabSelectionStatus.value = {
    line: Math.max(1, Math.trunc(Number(value.line) || 1)),
    column: Math.max(1, Math.trunc(Number(value.column) || 1)),
    selectionLength: Math.max(0, Math.trunc(Number(value.selectionLength) || 0)),
  }

  if (!activeMarkdownResourceId.value)
    return

  const selection = value.selection || null
  syncDocumentAssistRequestState({
    selectionText: String(selection?.selectedText || '').trim(),
    selectionRange: selection
      ? {
          anchorLine: selection.anchorLine,
          anchorColumn: selection.anchorColumn,
          headLine: selection.headLine,
          headColumn: selection.headColumn,
          isCollapsed: selection.isCollapsed,
          selectionLength: selection.selectionLength,
        }
      : null,
  })
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
  requestId?: number
  forceReload?: boolean
}

interface OpenCollabOptions extends OpenPreviewOptions {
  surface?: 'preview' | 'flow' | 'design'
}

type ProjectResourceOpenSurface = NonNullable<OpenCollabOptions['surface']> | 'binary'

interface ProjectResourceOpenTarget {
  resourceId: string
  surface: ProjectResourceOpenSurface
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

  if (options.surface === 'flow') {
    const targetSnapshot = await bindCollabResource(targetResourceId, snapshot)
    if (!targetSnapshot)
      return

    clearPreviewStatusPolling()
    previewStatusPayload.value = null
    previewStatusLoading.value = false
    flowResourceId.value = targetResourceId
    if (workbenchMode.value === 'project')
      updateProjectAssistantMode('contextual')
    if (options.openTab !== false)
      openFlowSignal.value += 1
    return
  }

  const requestId = Number(options.requestId || ++projectResourcePreviewRequestId)
  const targetResource = resources.value.find(item => item.id === targetResourceId) || null
  const targetPreviewMode = options.surface === 'design' || targetResource?.resourceKind === 'draw'
    ? 'draw'
    : 'markdown'
  const targetTabId = createResourceTabId(targetResourceId)

  if (
    options.forceReload !== true
    && previewResourceId.value === targetResourceId
    && activeMainTabId.value === targetTabId
    && collabBindingResourceId.value === targetResourceId
    && !collabPreviewLoading.value
  ) {
    return
  }

  clearPreviewStatusPolling()
  previewStatusPayload.value = null
  previewStatusLoading.value = false
  collabPreviewError.value = ''
  collabPreviewLoading.value = true
  disposeCollabDocBinding(true)
  previewMode.value = targetPreviewMode
  previewResourceId.value = targetResourceId
  closingPreviewResourceId.value = ''
  if (options.openTab !== false)
    openPreviewSignal.value += 1

  try {
    const targetSnapshot = snapshot || await fetchCollabSnapshot(targetResourceId)
    if (
      requestId !== projectResourcePreviewRequestId
      || previewResourceId.value !== targetResourceId
    ) {
      return
    }

    if (!targetSnapshot) {
      collabPreviewError.value = 'WinLoop 暂时无法加载该资料，请重试。'
      return
    }

    await bindCollabResource(targetResourceId, targetSnapshot)
    if (
      requestId !== projectResourcePreviewRequestId
      || previewResourceId.value !== targetResourceId
    ) {
      return
    }

    previewMode.value = targetSnapshot.kind
  }
  finally {
    if (
      requestId === projectResourcePreviewRequestId
      && previewResourceId.value === targetResourceId
    ) {
      collabPreviewLoading.value = false
    }
  }
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
        ensurePrimary: true,
      },
    })

    await refreshProjectCriticalResourceContext()
    void refreshProjectDeferredResourceContext()
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

function removeProjectResourceOpenTab(resourceId: string): void {
  const targetResourceId = normalizeString(resourceId)
  if (!targetResourceId)
    return
  const targetTabId = createResourceTabId(targetResourceId)
  if (!openMainTabs.value.includes(targetTabId))
    return
  openMainTabs.value = openMainTabs.value.filter(tabId => tabId !== targetTabId)
}

async function resolveProjectResourceOpenTarget(resourceId: string): Promise<ProjectResourceOpenTarget | null> {
  const targetResourceId = normalizeString(resourceId)
  if (!targetResourceId)
    return null

  const targetResource = resources.value.find(item => item.id === targetResourceId) || null
  if (!targetResource)
    return { resourceId: targetResourceId, surface: 'binary' }

  if (isWorkflowCanvasResource(targetResource))
    return { resourceId: targetResourceId, surface: 'flow' }

  if (isDesignCanvasResource(targetResource))
    return { resourceId: targetResourceId, surface: 'design' }

  if (isCollabResource(targetResource))
    return { resourceId: targetResourceId, surface: 'preview' }

  return { resourceId: targetResourceId, surface: 'binary' }
}

async function fetchResourcePreviewStatus(
  resourceId: string,
  silent = false,
  options: { requestId?: number } = {},
) {
  const projectId = String(activeProjectId.value || '').trim()
  const targetResourceId = String(resourceId || '').trim()
  const requestId = Number(options.requestId || 0)
  if (!projectId || !targetResourceId)
    return

  if (!silent)
    previewStatusLoading.value = true

  try {
    const response = await unsafeFetch<ApiResponse<ResourcePreviewStatusPayload>>(endpoint(`/projects/${projectId}/resources/${targetResourceId}/preview-status`))

    if (
      (requestId && requestId !== projectResourcePreviewRequestId)
      || previewResourceId.value !== targetResourceId
      || previewMode.value !== 'binary'
    ) {
      return
    }

    previewStatusPayload.value = response.data

    if (response.data.status === 'succeeded' || response.data.status === 'failed')
      clearPreviewStatusPolling()
  }
  catch (error) {
    if (
      (requestId && requestId !== projectResourcePreviewRequestId)
      || previewResourceId.value !== targetResourceId
      || previewMode.value !== 'binary'
    ) {
      return
    }

    if (!silent)
      statusLine.value = resolveApiErrorMessage(error, '获取预览状态失败。')
  }
  finally {
    if (
      !silent
      && (!requestId || requestId === projectResourcePreviewRequestId)
      && previewResourceId.value === targetResourceId
      && previewMode.value === 'binary'
    ) {
      previewStatusLoading.value = false
    }
  }
}

function startPreviewStatusPolling(resourceId: string, requestId = projectResourcePreviewRequestId) {
  clearPreviewStatusPolling()
  previewStatusPollTimer = setInterval(() => {
    if (
      requestId !== projectResourcePreviewRequestId
      || previewResourceId.value !== resourceId
      || previewMode.value !== 'binary'
    ) {
      clearPreviewStatusPolling()
      return
    }
    void fetchResourcePreviewStatus(resourceId, true, { requestId })
  }, 2000)
}

async function openProjectResourcePreview(resourceId: string, options: OpenPreviewOptions = {}) {
  const targetResourceId = String(resourceId || '').trim()
  if (!activeProjectId.value || !targetResourceId)
    return

  const target = await resolveProjectResourceOpenTarget(targetResourceId)
  if (!target)
    return

  if (target.surface === 'flow') {
    await openProjectCollabResource(target.resourceId, undefined, {
      ...options,
      openTab: true,
      surface: target.surface,
    })
    removeProjectResourceOpenTab(targetResourceId)
    return
  }

  if (target.surface === 'preview' || target.surface === 'design') {
    await openProjectCollabResource(target.resourceId, undefined, {
      ...options,
      surface: target.surface,
    })
    return
  }

  const requestId = Number(options.requestId || ++projectResourcePreviewRequestId)
  const resolvedResourceId = target.resourceId
  const targetTabId = createResourceTabId(resolvedResourceId)

  if (
    options.forceReload !== true
    && previewResourceId.value === resolvedResourceId
    && activeMainTabId.value === targetTabId
    && previewMode.value === 'binary'
    && !previewStatusLoading.value
  ) {
    return
  }

  collabPreviewLoading.value = false
  collabPreviewError.value = ''
  clearPreviewStatusPolling()
  disposeCollabDocBinding(true)
  previewMode.value = 'binary'
  previewResourceId.value = resolvedResourceId
  closingPreviewResourceId.value = ''
  if (options.openTab !== false)
    openPreviewSignal.value += 1
  previewStatusPayload.value = null

  await fetchResourcePreviewStatus(resolvedResourceId, false, { requestId })
  if (
    requestId !== projectResourcePreviewRequestId
    || previewResourceId.value !== resolvedResourceId
  ) {
    return
  }

  const currentStatus = ((previewStatusPayload.value as any)?.status || '') as ResourcePreviewStatus | ''
  if (currentStatus !== 'succeeded' && currentStatus !== 'failed')
    startPreviewStatusPolling(resolvedResourceId, requestId)
}

function findMarkdownResourceByAnchorHash(hash: string): Resource | null {
  const normalizedHash = String(hash || '').trim()
  if (!normalizedHash)
    return null

  return resources.value.find((resource) => {
    return resource.resourceKind === 'markdown' && isCollabMarkdownHeadingAnchorHashForResource(normalizedHash, resource.id)
  }) || null
}

async function resolveMarkdownAnchorNavigation(hash = route.hash): Promise<void> {
  const normalizedHash = String(hash || '').trim()
  if (!normalizedHash)
    return

  const targetMarkdownResource = findMarkdownResourceByAnchorHash(normalizedHash)
  if (!targetMarkdownResource)
    return

  const targetTabId = createResourceTabId(targetMarkdownResource.id)
  if (previewResourceId.value !== targetMarkdownResource.id || activeMainTabId.value !== targetTabId)
    await openProjectResourcePreview(targetMarkdownResource.id)

  const anchorId = normalizedHash.replace(/^#/, '')
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await nextTick()
    const handled = workspaceMainPanelRef.value?.scrollToMarkdownHeadingAnchor(anchorId)
    if (handled)
      return
    await new Promise(resolve => setTimeout(resolve, 48))
  }
}

async function resolveWorkspaceOutlineHashNavigation(hash = route.hash): Promise<void> {
  const normalizedHash = String(hash || '').trim()
  if (!normalizedHash)
    return

  const outlineNode = parseWorkspaceOutlineNavigationHash(normalizedHash)
  if (outlineNode) {
    await locateWorkspaceOutlineItem(outlineNode)
    return
  }

  await resolveMarkdownAnchorNavigation(normalizedHash)
}

function handleMarkdownOutlineChange(items: CollabMarkdownHeadingAnchorItem[]): void {
  if (!activeMarkdownResourceId.value) {
    activeMarkdownOutlineItems.value = []
    return
  }
  activeMarkdownOutlineItems.value = Array.isArray(items) ? items : []
}

async function locateWorkspaceOutlineItem(node: WorkspaceOutlineNode): Promise<void> {
  const locator = node.locator
  switch (locator.surface) {
    case 'notes': {
      const resourceId = normalizeString(locator.resourceId)
      const anchorId = normalizeString(locator.anchorId)
      if (!resourceId || !anchorId) {
        statusLine.value = '当前文档大纲缺少可定位锚点。'
        return
      }

      await openProjectResourcePreview(resourceId)
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await nextTick()
        const handled = workspaceMainPanelRef.value?.scrollToMarkdownHeadingAnchor(anchorId)
        if (handled) {
          statusLine.value = `已定位文档标题：${node.label}`
          return
        }
        await new Promise(resolve => setTimeout(resolve, 48))
      }

      statusLine.value = `已切到文档：${node.label}`
      return
    }
    case 'design': {
      const resourceId = normalizeString(locator.resourceId)
      if (!resourceId) {
        statusLine.value = '当前设计稿大纲缺少可定位资源。'
        return
      }

      await openProjectResourcePreview(resourceId)
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await nextTick()
        const handled = workspaceMainPanelRef.value?.locateDesignOutlineItem(node)
        if (handled) {
          statusLine.value = `已定位设计稿：${node.label}`
          return
        }
        await new Promise(resolve => setTimeout(resolve, 48))
      }

      statusLine.value = `已切到设计稿：${node.label}`
      return
    }
    case 'workflow': {
      const resourceId = normalizeString(locator.resourceId || activeWorkflowResourceId.value || flowResourceId.value)
      if (resourceId)
        await activateProjectResourceTab(resourceId)

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await nextTick()
        const handled = workspaceMainPanelRef.value?.locateWorkflowOutlineItem(node)
        if (handled) {
          statusLine.value = `已定位流程画布：${node.label}`
          return
        }
        await new Promise(resolve => setTimeout(resolve, 64))
      }

      statusLine.value = `已切到流程画布：${node.label}`
      return
    }
    case 'project':
      statusLine.value = `已定位项目结构：${node.label}`
      return
    default:
      statusLine.value = `已定位结构项：${node.label}`
  }
}

async function activateProjectResourceTab(resourceId: string): Promise<void> {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId)
    return

  const target = await resolveProjectResourceOpenTarget(targetResourceId)
  if (!target)
    return

  if (target.surface === 'flow') {
    if (activeMainTabId.value === 'flow')
      return
    await openProjectCollabResource(target.resourceId, undefined, {
      openTab: true,
      surface: target.surface,
    })
    removeProjectResourceOpenTab(targetResourceId)
    return
  }

  const targetTabId = createResourceTabId(target.resourceId)
  previewResourceId.value = target.resourceId
  closingPreviewResourceId.value = ''

  if (activeMainTabId.value === targetTabId)
    return

  activeMainTabId.value = targetTabId
}

function closeProjectResourcePreview(resourceId = previewResourceId.value) {
  const targetResourceId = String(resourceId || '').trim()
  const activeResourceId = String(previewResourceId.value || '').trim()
  if (!targetResourceId || targetResourceId !== activeResourceId)
    return

  const preserveFlowBinding = targetResourceId === String(flowResourceId.value || '').trim()
    && activeMainTabId.value === 'flow'

  projectResourcePreviewRequestId += 1
  closingPreviewResourceId.value = targetResourceId
  if (!preserveFlowBinding)
    disposeCollabDocBinding(true)
  collabPreviewLoading.value = false
  collabPreviewError.value = ''
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

function getActiveMarkdownMirror(): string {
  const doc = collabMarkdownDoc.value
  if (doc) {
    try {
      return String(syncMarkdownMirrorFromRichText(doc).markdown || '').trim()
    }
    catch {
      // 保持降级到资源镜像
    }
  }

  return normalizeString(previewResource.value?.content)
}

function canUseInlineCompletion(): boolean {
  const workspaceId = normalizeString(activeWorkspaceId.value)
  const projectId = normalizeString(activeProjectId.value)
  const resourceId = activeMarkdownResourceId.value
  if (!workspaceId || !projectId || !resourceId)
    return false
  if (previewMode.value !== 'markdown' || activePreviewResourcePurpose.value !== 'notes')
    return false
  if (!isAiFeatureAvailable('documentContinue'))
    return false
  return aiCreditsRemaining.value >= 1
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function logInlineCompletionDebug(event: string, payload?: Record<string, unknown>): void {
  console.warn('[inline-completion]', {
    event,
    workspaceId: normalizeString(activeWorkspaceId.value),
    projectId: normalizeString(activeProjectId.value),
    resourceId: activeMarkdownResourceId.value,
    ...(payload || {}),
  })
}

async function requestInlineCompletion(payload: {
  requestKey: string
  selectionRange: AiWorkspaceDocumentSelectionRange
  signal?: AbortSignal
}): Promise<AiWorkspaceInlineCompletionResult | null> {
  if (!canUseInlineCompletion())
    return null

  try {
    logInlineCompletionDebug('request-dispatched', {
      requestKey: payload.requestKey,
      selectionRange: payload.selectionRange,
    })

    const response = await fetch(endpoint('/ai/workspace/document-completion'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        teamId: activeWorkspaceId.value,
        workspaceId: activeWorkspaceId.value,
        projectId: normalizeString(activeProjectId.value),
        context: {
          teamId: activeWorkspaceId.value,
          workspaceId: activeWorkspaceId.value,
          projectId: normalizeString(activeProjectId.value),
          resourceId: activeMarkdownResourceId.value,
          resourceTitle: activeMarkdownResourceTitle.value,
          markdown: getActiveMarkdownMirror(),
          selectionRange: payload.selectionRange,
        },
      }),
      signal: payload.signal,
    })

    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    if (!response.ok) {
      const data = await response.json().catch(() => null) as ApiResponse<AiWorkspaceInlineCompletionResult> | null
      logInlineCompletionDebug('request-response-error', {
        requestKey: payload.requestKey,
        status: response.status,
        message: String(data?.message || response.statusText || 'UNKNOWN_ERROR'),
      })
      return null
    }

    if (!contentType.includes('text/event-stream')) {
      const data = await response.json().catch(() => null) as ApiResponse<AiWorkspaceInlineCompletionResult> | null
      if (!data || data.code !== 0) {
        logInlineCompletionDebug('request-response-error', {
          requestKey: payload.requestKey,
          status: response.status,
          message: String(data?.message || 'UNKNOWN_ERROR'),
        })
        return null
      }

      logInlineCompletionDebug('request-response-success', {
        requestKey: payload.requestKey,
        suggestionLength: String(data.data?.suggestion || '').length,
        transport: 'json',
      })
      return data.data
    }

    if (!response.body) {
      logInlineCompletionDebug('request-response-error', {
        requestKey: payload.requestKey,
        status: response.status,
        message: 'MISSING_STREAM_BODY',
      })
      return null
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: AiWorkspaceInlineCompletionResult | null = null
    let finalSuggestion = ''
    let streamErrorMessage = ''
    const applyInlineCompletionSseBlock = (rawBlock: string): void => {
      const parsed = parseSseBlock(rawBlock)
      if (!parsed)
        return

      let payloadData: Record<string, unknown> = {}
      try {
        payloadData = JSON.parse(parsed.dataText || '{}') as Record<string, unknown>
      }
      catch {
        payloadData = {}
      }

      const eventType = String(payloadData.event || parsed.eventType || 'message')
      const data = toJsonPayload(payloadData.data)

      if (eventType === 'heartbeat')
        return

      if (eventType === 'done') {
        const result = toJsonPayload(data.result)
        finalSuggestion = String(result.suggestion || '')
        finalResult = {
          suggestion: finalSuggestion,
        }
        return
      }

      if (eventType === 'error')
        streamErrorMessage = String(data.message || 'UNKNOWN_ERROR')
    }

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
        applyInlineCompletionSseBlock(block)
      }
    }

    buffer += decoder.decode()
    while (true) {
      const separatorIndex = buffer.indexOf('\n\n')
      if (separatorIndex < 0)
        break

      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      applyInlineCompletionSseBlock(block)
    }
    applyInlineCompletionSseBlock(buffer)

    if (streamErrorMessage) {
      logInlineCompletionDebug('request-response-error', {
        requestKey: payload.requestKey,
        status: response.status,
        message: streamErrorMessage,
        transport: 'sse',
      })
      return null
    }

    logInlineCompletionDebug('request-response-success', {
      requestKey: payload.requestKey,
      suggestionLength: finalSuggestion.length,
      transport: 'sse',
    })
    return finalResult
  }
  catch (error) {
    if (isAbortError(error)) {
      logInlineCompletionDebug('request-aborted', {
        requestKey: payload.requestKey,
        reason: payload.signal?.reason ?? 'AbortError',
      })
      throw error
    }

    logInlineCompletionDebug('request-network-error', {
      requestKey: payload.requestKey,
      message: error instanceof Error ? (error.message || error.name || 'UNKNOWN_ERROR') : 'UNKNOWN_ERROR',
    })
    return null
  }
}

async function acceptInlineCompletion(_payload: {
  requestKey: string
  suggestion: string
  selectionRange: AiWorkspaceDocumentSelectionRange
}): Promise<AiWorkspaceInlineCompletionAcceptResult | null> {
  if (!canUseInlineCompletion())
    throw new Error('当前文档自动补齐不可用。')

  const response = await fetch(endpoint('/ai/workspace/document-completion/accept'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      teamId: activeWorkspaceId.value,
      workspaceId: activeWorkspaceId.value,
      projectId: normalizeString(activeProjectId.value),
      resourceId: activeMarkdownResourceId.value,
    }),
  })

  const data = await response.json().catch(() => null) as ApiResponse<AiWorkspaceInlineCompletionAcceptResult> | null
  if (!response.ok || !data || data.code !== 0) {
    const message = resolveApiErrorMessage(data?.message || response.statusText || '自动补齐扣费失败，请稍后重试。', '自动补齐扣费失败，请稍后重试。')
    statusLine.value = message
    throw new Error(message)
  }

  applyInlineCompletionQuotaResult(data.data)
  return data.data
}

function handleMarkdownPrimaryHeadingChange(title: string): void {
  const resourceId = activeMarkdownResourceId.value
  const normalizedTitle = normalizeString(title)
  if (!resourceId)
    return

  if (!normalizedTitle) {
    if (!Object.prototype.hasOwnProperty.call(markdownDerivedTitleMap.value, resourceId))
      return

    const nextTitleMap = { ...markdownDerivedTitleMap.value }
    delete nextTitleMap[resourceId]
    markdownDerivedTitleMap.value = nextTitleMap
    return
  }

  if (markdownDerivedTitleMap.value[resourceId] === normalizedTitle)
    return

  markdownDerivedTitleMap.value = {
    ...markdownDerivedTitleMap.value,
    [resourceId]: normalizedTitle,
  }
}

function syncDocumentAssistRequestState(payload: {
  selectionText: string
  selectionRange: AiWorkspaceDocumentSelectionRange | null
}): void {
  documentAssistRequestState.resourceId = activeMarkdownResourceId.value
  documentAssistRequestState.resourceTitle = activeMarkdownResourceTitle.value
  documentAssistRequestState.markdown = getActiveMarkdownMirror()
  documentAssistRequestState.selectionText = String(payload.selectionText || '').trim()
  documentAssistRequestState.selectionRange = payload.selectionRange || null
}

function clearWorkflowSnapshotSyncTimer(): void {
  if (!workflowSnapshotSyncTimer.value)
    return
  clearTimeout(workflowSnapshotSyncTimer.value)
  workflowSnapshotSyncTimer.value = null
}

function syncWorkflowSnapshotNow(): void {
  if (!activeWorkflowResourceId.value || normalizeString(collabBindingResourceId.value) !== activeWorkflowResourceId.value) {
    workflowDrawioLegacyUnavailable.value = false
    workflowDrawioLegacyMessage.value = ''
    workflowSnapshotState.value = null
    return
  }

  try {
    const resolvedDrawio = resolveDrawioCollabValue(
      collabDrawValue.value || '',
      activeWorkflowResourceTitle.value || COLLAB_WORKFLOW_RESOURCE_LABEL,
    )
    workflowDrawioLegacyUnavailable.value = resolvedDrawio.status === 'legacy_unavailable'
    workflowDrawioLegacyMessage.value = resolvedDrawio.message
    workflowSnapshotState.value = resolvedDrawio.status === 'ready'
      ? parseDrawioXmlToWorkflowSnapshot(resolvedDrawio.xml)
      : null
  }
  catch (error) {
    console.warn('[workspace-project] parse workflow snapshot failed', error)
    workflowDrawioLegacyUnavailable.value = false
    workflowDrawioLegacyMessage.value = ''
    workflowSnapshotState.value = null
  }
}

function scheduleWorkflowSnapshotSync(): void {
  clearWorkflowSnapshotSyncTimer()
  workflowSnapshotSyncTimer.value = setTimeout(() => {
    syncWorkflowSnapshotNow()
  }, 360)
}

watch(
  [
    () => collabDrawValue.value,
    () => activeWorkflowResourceId.value,
    () => collabBindingResourceId.value,
  ],
  () => {
    if (!activeWorkflowResourceId.value) {
      clearWorkflowSnapshotSyncTimer()
      workflowDrawioLegacyUnavailable.value = false
      workflowDrawioLegacyMessage.value = ''
      workflowSnapshotState.value = null
      return
    }
    scheduleWorkflowSnapshotSync()
  },
  { immediate: true },
)

function applyAgentDocDraft(draft: AiWorkspaceDocumentDraft): void {
  const applied = workspaceMainPanelRef.value?.applyMarkdownDocumentDraft(draft) || false
  if (!applied) {
    statusLine.value = '当前文档已变化，无法应用该 AgentDoc 草案，请重新生成。'
    return
  }

  const draftKey = buildAgentDocDraftKey(draft)
  if (!appliedAgentDocDraftKeys.value.includes(draftKey))
    appliedAgentDocDraftKeys.value = [...appliedAgentDocDraftKeys.value, draftKey]
  documentAssistRequestState.markdown = getActiveMarkdownMirror()
  statusLine.value = 'AgentDoc 草案已应用到文档。'
}

function buildDefaultWorkflowPrompt(options: WorkflowDraftRequestOptions): string {
  if (options.action === 'complete')
    return `请基于当前流程画布补全一版完整的${options.template}草案。`
  if (options.action === 'refine')
    return `请基于当前流程画布续改并重构一版完整的${options.template}草案。`
  if (options.action === 'restyle')
    return `请只调整当前流程画布的全局样式与布局，使用 ${options.stylePreset} + ${options.layoutPreset} 预设。`
  if (options.template === 'architecture' && options.architectureView)
    return `请生成一版 ${options.architectureView} 视图的架构图草案。`
  return `请生成一版完整的${options.template}草案。`
}

function buildDefaultScenePrompt(options: SceneDraftRequestOptions): string {
  if (options.action === 'complete')
    return `请基于当前自由画布补全一版完整的${options.template}草案。`
  if (options.action === 'refine')
    return `请基于当前自由画布续改并重构一版完整的${options.template}草案。`
  if (options.action === 'restyle')
    return `请只调整当前自由画布的全局样式与布局，使用 ${options.stylePreset} + ${options.layoutPreset} 预设。`
  if (options.template === 'architecture' && options.architectureView)
    return `请生成一版 ${options.architectureView} 视图的架构图草案。`
  return `请生成一版完整的${options.template}草案。`
}

function applyWorkflowDraft(draft: AiWorkspaceWorkflowDraft): void {
  if (!activeWorkflowResourceId.value || activeWorkflowResourceId.value !== normalizeString(draft.resourceId)) {
    statusLine.value = '当前未定位到对应的流程画布，无法应用该 AgentProto 草案。'
    return
  }

  if (!activeWorkflowSnapshot.value) {
    statusLine.value = workflowDrawioLegacyUnavailable.value
      ? workflowDrawioLegacyMessage.value || workflowCanvasUnavailableReason.value
      : '当前流程画布快照不可用，请等待画布同步后再试。'
    return
  }

  if (!activeWorkflowSnapshot.value.isSinglePage) {
    statusLine.value = '多页流程资源当前只支持预览草案，不支持直接应用。'
    return
  }

  if (draft.baseWorkflowHash !== activeWorkflowHash.value) {
    statusLine.value = '当前流程画布已变化，无法应用该 AgentProto 草案，请重新生成。'
    return
  }

  const xml = buildDrawioXmlFromWorkflowDraft(draft, {
    baseSnapshot: activeWorkflowSnapshot.value,
    pageName: activeWorkflowResourceTitle.value || draft.resourceTitle || draft.title,
  })
  updateCollabDrawContent(serializeDrawioCollabValue(xml))

  const draftKey = buildWorkflowDraftKey(draft)
  if (!appliedWorkflowDraftKeys.value.includes(draftKey))
    appliedWorkflowDraftKeys.value = [...appliedWorkflowDraftKeys.value, draftKey]
  discardedWorkflowDraftKeys.value = discardedWorkflowDraftKeys.value.filter(item => item !== draftKey)
  statusLine.value = 'AgentProto 草案已应用到当前流程画布。'
}

function discardWorkflowDraft(draft: AiWorkspaceWorkflowDraft): void {
  const draftKey = buildWorkflowDraftKey(draft)
  if (!discardedWorkflowDraftKeys.value.includes(draftKey))
    discardedWorkflowDraftKeys.value = [...discardedWorkflowDraftKeys.value, draftKey]
  statusLine.value = '已丢弃当前 AgentProto 草案。'
}

async function applySceneDraft(draft: AiWorkspaceSceneDraft): Promise<void> {
  if (!activeAgentProtoSceneResourceId.value || activeAgentProtoSceneResourceId.value !== normalizeString(draft.resourceId)) {
    statusLine.value = '当前未定位到对应的自由画布，无法应用该 AgentProto 草案。'
    return
  }

  if (normalizeString(collabBindingResourceId.value) !== activeAgentProtoSceneResourceId.value) {
    statusLine.value = '当前自由画布尚未完成同步，请稍后再试。'
    return
  }

  if (draft.baseSceneHash !== activeAgentProtoSceneHash.value) {
    statusLine.value = '当前自由画布已变化，无法应用该 AgentProto 草案，请重新生成。'
    return
  }

  const runtimeConfig = useRuntimeConfig()
  const nextValue = await buildFreeformCollabValueFromSceneDraft({
    draft,
    currentRawValue: collabDrawValue.value || '',
    licenseKey: String(runtimeConfig.public?.tldraw?.licenseKey || ''),
  })
  if (!nextValue) {
    statusLine.value = '当前 AgentProto 草案无法转换为可编辑画布，请重新生成。'
    return
  }

  updateCollabDrawContent(nextValue)

  const draftKey = buildSceneDraftKey(draft)
  if (!appliedSceneDraftKeys.value.includes(draftKey))
    appliedSceneDraftKeys.value = [...appliedSceneDraftKeys.value, draftKey]
  discardedSceneDraftKeys.value = discardedSceneDraftKeys.value.filter(item => item !== draftKey)
  statusLine.value = 'AgentProto 草案已应用到当前自由画布。'
}

function discardSceneDraft(draft: AiWorkspaceSceneDraft): void {
  const draftKey = buildSceneDraftKey(draft)
  if (!discardedSceneDraftKeys.value.includes(draftKey))
    discardedSceneDraftKeys.value = [...discardedSceneDraftKeys.value, draftKey]
  statusLine.value = '已丢弃当前 AgentProto 自由画布草案。'
}

async function requestWorkflowDraftFromSidebar(options: WorkflowDraftRequestOptions): Promise<void> {
  if (workflowCanvasUnavailableReason.value) {
    statusLine.value = workflowCanvasUnavailableReason.value
    return
  }

  if (!ensureAiFeatureAvailable(resolveWorkflowDraftFeatureKey(options.action)))
    return

  if (!activeWorkflowResourceId.value) {
    statusLine.value = '当前没有可用的流程画布，暂时无法生成 AgentProto 草案。'
    return
  }

  if (!activeWorkflowSnapshot.value) {
    statusLine.value = workflowDrawioLegacyUnavailable.value
      ? workflowDrawioLegacyMessage.value || workflowCanvasUnavailableReason.value
      : '流程画布快照尚未同步完成，请稍后再试。'
    return
  }

  const content = chatInput.value.trim() || buildDefaultWorkflowPrompt(options)
  await sendChatMessage({
    content,
    workflowRequest: options,
  })
}

async function requestSceneDraftFromSidebar(options: SceneDraftRequestOptions): Promise<void> {
  if (sceneCanvasUnavailableReason.value) {
    statusLine.value = sceneCanvasUnavailableReason.value
    return
  }

  if (!ensureAiFeatureAvailable(resolveWorkflowDraftFeatureKey(options.action)))
    return

  if (!activeAgentProtoSceneResourceId.value) {
    statusLine.value = `当前没有可用的${COLLAB_FREEFORM_RESOURCE_LABEL}，暂时无法生成 AgentProto 草案。`
    return
  }

  if (normalizeString(collabBindingResourceId.value) !== activeAgentProtoSceneResourceId.value) {
    statusLine.value = '当前自由画布尚未完成同步，请稍后再试。'
    return
  }

  const content = chatInput.value.trim() || buildDefaultScenePrompt(options)
  await sendChatMessage({
    content,
    sceneRequest: options,
  })
}

async function handleMarkdownImageAction(payload: {
  resourceId?: string | null
  src: string
  mode: 'open_resource' | 'delete_node' | 'delete_and_recycle'
}): Promise<void> {
  if (payload.mode === 'open_resource') {
    const resourceId = normalizeString(payload.resourceId)
    if (!resourceId)
      return
    await openProjectResourcePreview(resourceId)
    statusLine.value = '已在项目资料中打开图片资源。'
    return
  }

  if (payload.mode !== 'delete_and_recycle')
    return

  const projectId = normalizeString(activeProjectId.value)
  const resourceId = normalizeString(payload.resourceId)
  if (!projectId || !resourceId)
    return

  resourceMutating.value = true
  try {
    await authApiFetch<ApiResponse<{ resourceId: string, recycle: boolean }>>(
      `/projects/${projectId}/resources/${resourceId}/recycle-from-markdown`,
      {
        method: 'POST',
        body: {
          src: payload.src,
        },
      },
    )
    await refreshProjectResourceContext()
    statusLine.value = '图片资源已移入项目回收站。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, '回收图片资源失败，请稍后重试。')
  }
  finally {
    resourceMutating.value = false
  }
}

async function loadChatMessages(sessionId: string) {
  const projectId = String(activeProjectId.value || '').trim()
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  const mode = aiMode.value
  const normalizedSessionId = normalizeString(sessionId)
  const requestId = ++chatMessagesRequestId
  const sameSessionRefresh = chatMessagesLoadedSessionId.value === normalizedSessionId
  if (!workspaceId || !projectId || !normalizedSessionId) {
    chatMessagesLoading.value = false
    chatMessagesLoadedSessionId.value = ''
    clearActiveChatArtifacts()
    return
  }

  chatMessagesLoading.value = true
  if (!sameSessionRefresh) {
    chatMessagesLoadedSessionId.value = ''
    clearActiveChatArtifacts()
  }

  try {
    const data = await requestProjectApi<{ session: AiChatSession, messages: AiChatMessage[] }>(
      endpoint(`/teams/${workspaceId}/chat/sessions/${normalizedSessionId}/messages`),
      {
        projectId,
        mode,
        limit: 200,
      },
      '会话消息加载失败。',
    )
    if (
      requestId !== chatMessagesRequestId
      || activeProjectId.value !== projectId
      || String(activeWorkspaceId.value || '').trim() !== workspaceId
      || aiMode.value !== mode
      || activeChatSessionId.value !== normalizedSessionId
    ) {
      return
    }

    const restoredMessages = data.messages
      .map(item => ({
        role: item.role,
        content: item.content,
        metadata: item.metadata,
      })) as ChatMessage[]

    chatMessages.value = restoredMessages
    chatDraft.value = null
    chatMissingFields.value = []
    resetChatDraftArtifactState()
    chatMessagesLoadedSessionId.value = normalizedSessionId

    if (mode === 'defense') {
      defenseSessionMeta.value = data.session
      await loadDefenseSessionDetail(normalizedSessionId, {
        preserveExisting: sameSessionRefresh,
      })
      return
    }

    defenseSessionMeta.value = null
    defenseSessionState.value = null
    defenseRounds.value = []
    defenseTurns.value = []
    defenseScorecard.value = null
    defenseSummary.value = null
    defenseStage.value = undefined
    defenseTurnCount.value = 0
    resetDefenseRealtimeLocalState()
  }
  catch {
    if (
      requestId === chatMessagesRequestId
      && activeProjectId.value === projectId
      && String(activeWorkspaceId.value || '').trim() === workspaceId
      && aiMode.value === mode
      && activeChatSessionId.value === normalizedSessionId
    ) {
      if (!sameSessionRefresh) {
        chatMessagesLoadedSessionId.value = ''
        clearActiveChatArtifacts()
      }
    }
  }
  finally {
    if (
      requestId === chatMessagesRequestId
      && activeProjectId.value === projectId
      && String(activeWorkspaceId.value || '').trim() === workspaceId
      && aiMode.value === mode
      && activeChatSessionId.value === normalizedSessionId
    ) {
      chatMessagesLoading.value = false
    }
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
    if (activeProjectId.value === projectId)
      defensePersonas.value = response.data.items
  }
  catch {
    if (activeProjectId.value === projectId)
      defensePersonas.value = []
  }
  finally {
    if (activeProjectId.value === projectId || !activeProjectId.value)
      defensePersonasLoading.value = false
  }
}

async function loadDefenseSessionDetail(sessionId: string, options: {
  preserveExisting?: boolean
} = {}) {
  const projectId = String(activeProjectId.value || '').trim()
  const requestId = ++defenseSessionDetailRequestId
  const preserveExisting = options.preserveExisting !== false
  if (!projectId || !sessionId) {
    defenseSessionMeta.value = null
    defenseSessionState.value = null
    defenseRounds.value = []
    defenseTurns.value = []
    defenseScorecard.value = null
    defenseSummary.value = null
    defenseStage.value = undefined
    defenseTurnCount.value = 0
    resetDefenseRealtimeLocalState()
    return
  }

  try {
    const response = await unsafeFetch<ApiResponse<AiDefenseSessionDetail>>(
      endpoint(`/projects/${projectId}/defense/sessions/${sessionId}`),
    )
    if (
      requestId !== defenseSessionDetailRequestId
      || activeProjectId.value !== projectId
      || activeChatSessionId.value !== sessionId
    ) {
      return
    }
    const detail = response.data
    defenseSessionMeta.value = detail.session || null
    defenseSessionState.value = detail.state || null
    defensePersonas.value = detail.personas || []
    defenseTurns.value = detail.turns || []
    defenseSummary.value = detail.latestSummary || null
    defenseStage.value = detail.state?.currentStage
    defenseTurnCount.value = detail.state?.turnCount || 0
    defenseScorecard.value = detail.state?.lastScorecard || null
    syncDefenseRealtimeDraftState(detail.state)
    defenseRounds.value = detail.latestRounds || []
  }
  catch {
    if (
      requestId === defenseSessionDetailRequestId
      && activeProjectId.value === projectId
      && activeChatSessionId.value === sessionId
      && !preserveExisting
    ) {
      defenseSessionMeta.value = null
      defenseSessionState.value = null
      defenseRounds.value = []
      defenseTurns.value = []
      defenseScorecard.value = null
      defenseSummary.value = null
      defenseStage.value = undefined
      defenseTurnCount.value = 0
      resetDefenseRealtimeLocalState()
    }
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
  if (!ensureAiFeatureAvailable('defense'))
    return

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
  if (!ensureAiFeatureAvailable('defense'))
    return
  if (!projectId || meetingMutating.value || defenseRealtimeStarting.value) {
    if (!projectId)
      statusLine.value = '请先选择项目。'
    return
  }

  defenseRealtimeStarting.value = true
  meetingMutating.value = true
  try {
    const enabledPersonaIds = defensePersonas.value
      .filter(item => item.enabled)
      .map(item => item.id)
    const provider = defenseRealtimeProviderDraft.value
    const mediaMode = defenseRealtimeMediaModeDraft.value
    const response = await unsafeFetch<ApiResponse<DefenseRealtimeSessionPayload>>(
      endpoint(`/projects/${projectId}/defense/realtime-sessions`),
      {
        method: 'POST',
        body: {
          mode: mediaMode === 'audio' ? 'audio' : 'video',
          personaIds: enabledPersonaIds,
          provider,
          mediaMode,
        },
      },
    )
    ensureOpenChatSessionTab(response.data.sessionId)
    activeChatSessionId.value = response.data.sessionId
    defenseStage.value = 'opening'
    defenseTurnCount.value = 0
    activeMeetingUtterances.value = []
    defenseRealtimeBootstrapPayload.value = null
    defenseRealtimeLatestError.value = ''
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
    patchDefenseRealtimeState({
      provider,
      mediaMode,
      transport: provider === 'coze' ? 'rtc_sidecar' : 'websocket',
      connectionState: 'bootstrapping',
      bootstrapState: 'bootstrapping',
      linkedMeetingId: response.data.meeting.id,
      audioEnabled: defenseRealtimeAudioEnabled.value,
      videoEnabled: mediaMode === 'audio_video' ? defenseRealtimeVideoEnabled.value : false,
    })
    await bootstrapDefenseRealtimeSidecar(response.data.sessionId)
    statusLine.value = `已发起${provider === 'coze' ? ' Coze ' : '千问 '}实时答辩会话，正在接入${mediaMode === 'audio' ? '音频' : '音视频'} sidecar。`
  }
  catch (error) {
    defenseRealtimeBootstrapState.value = 'error'
    defenseRealtimeLatestError.value = resolveApiErrorMessage(error, '发起实时答辩失败，请稍后重试。')
    appendDefenseRealtimeLog(defenseRealtimeLatestError.value, 'error')
    statusLine.value = defenseRealtimeLatestError.value
  }
  finally {
    defenseRealtimeStarting.value = false
    meetingMutating.value = false
  }
}

const MAX_OPEN_CHAT_SESSION_TABS = 8

function normalizeOpenChatSessionIdList(value: string[]): string[] {
  const normalized: string[] = []
  const used = new Set<string>()

  for (const item of value) {
    const sessionId = normalizeString(item)
    if (!sessionId || used.has(sessionId))
      continue
    normalized.push(sessionId)
    used.add(sessionId)
  }

  return normalized.slice(-MAX_OPEN_CHAT_SESSION_TABS)
}

function setOpenChatSessionTabs(value: string[]): void {
  openChatSessionIds.value = normalizeOpenChatSessionIdList(value)
}

function ensureOpenChatSessionTab(sessionId: string): void {
  const normalizedSessionId = normalizeString(sessionId)
  if (!normalizedSessionId || openChatSessionIds.value.includes(normalizedSessionId))
    return

  setOpenChatSessionTabs([
    ...openChatSessionIds.value,
    normalizedSessionId,
  ])
}

function removeOpenChatSessionTab(sessionId: string): void {
  const normalizedSessionId = normalizeString(sessionId)
  if (!normalizedSessionId)
    return

  setOpenChatSessionTabs(openChatSessionIds.value.filter(item => item !== normalizedSessionId))
}

function syncOpenChatSessionTabsInScope(
  sessions: AiChatSession[],
  options: {
    preferredSessionId?: string
  } = {},
): string[] {
  const availableSessionIdSet = new Set(
    sessions.map(item => normalizeString(item.id)).filter(Boolean),
  )
  const nextOpenSessionIds = normalizeOpenChatSessionIdList(
    openChatSessionIds.value.filter(item => availableSessionIdSet.has(item)),
  )
  const preferredSessionId = normalizeString(options.preferredSessionId)
  const activeSessionId = normalizeString(activeChatSessionId.value)

  if (preferredSessionId && availableSessionIdSet.has(preferredSessionId) && !nextOpenSessionIds.includes(preferredSessionId))
    nextOpenSessionIds.push(preferredSessionId)
  if (activeSessionId && availableSessionIdSet.has(activeSessionId) && !nextOpenSessionIds.includes(activeSessionId))
    nextOpenSessionIds.push(activeSessionId)

  const normalizedOpenSessionIds = normalizeOpenChatSessionIdList(nextOpenSessionIds)
  openChatSessionIds.value = normalizedOpenSessionIds
  return normalizedOpenSessionIds
}

function buildSessionTitleByMode(): string {
  const contestName = selectedContest.value?.name || '未选择竞赛'
  const trackName = selectedTrack.value?.name || '未选择赛道'

  if (workbenchMode.value === 'final_review')
    return `终审助手 · ${contestName} · ${trackName}`
  if (aiMode.value === 'auto_optimize')
    return `Loopy 自动优化 · ${contestName} · ${trackName}`
  if (aiMode.value === 'issue_discovery')
    return `Loopy 寻疑发现 · ${contestName} · ${trackName}`
  if (aiMode.value === 'defense')
    return `Loopy 答辩模拟 · ${contestName} · ${trackName}`
  if (aiMode.value === 'document_assist')
    return `AgentDoc · ${activeMarkdownResourceTitle.value || contestName} · ${trackName}`
  if (aiMode.value === 'contextual_agent')
    return `${currentWorkspaceAssistantLabel.value || '上下文助手'} · ${contestName} · ${trackName}`
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
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  const mode = aiMode.value
  const scopeKey = `${workspaceId}:${projectId}:${mode}`
  const requestId = ++chatSessionsRequestId
  const sameScopeRefresh = chatSessionsLoadedScopeKey.value === scopeKey
  if (!workspaceId || !projectId) {
    resetChatScopeState()
    return
  }

  chatSessionsLoading.value = true
  try {
    const data = await requestProjectApi<AiChatSession[]>(
      endpoint(`/teams/${workspaceId}/chat/sessions`),
      {
        projectId,
        mode,
        limit: 30,
      },
      '会话列表加载失败。',
    )
    if (
      requestId !== chatSessionsRequestId
      || activeProjectId.value !== projectId
      || String(activeWorkspaceId.value || '').trim() !== workspaceId
      || aiMode.value !== mode
    ) {
      return
    }
    chatSessions.value = data
    chatSessionsLoadedScopeKey.value = scopeKey
    const openSessionIdsInScope = syncOpenChatSessionTabsInScope(chatSessions.value, {
      preferredSessionId: options.preferredSessionId,
    })

    const preferredSessionId = normalizeString(options.preferredSessionId)
    const fallbackToFirst = options.fallbackToFirst !== false
    const nextSession = (
      (preferredSessionId ? chatSessions.value.find(item => item.id === preferredSessionId) : null)
      || chatSessions.value.find(item => item.id === activeChatSessionId.value)
      || openSessionIdsInScope
        .map(sessionId => chatSessions.value.find(item => item.id === sessionId) || null)
        .find(Boolean)
        || (fallbackToFirst ? chatSessions.value[0] : null)
    )

    if (!nextSession) {
      if (options.autoCreate === false) {
        openChatSessionIds.value = []
        activeChatSessionId.value = ''
        chatMessagesLoadedSessionId.value = ''
        clearActiveChatArtifacts()
        return
      }

      const createdId = await createChatSession()
      if (!createdId) {
        openChatSessionIds.value = []
        activeChatSessionId.value = ''
        chatMessagesLoadedSessionId.value = ''
        clearActiveChatArtifacts()
        return
      }
      ensureOpenChatSessionTab(createdId)
      activeChatSessionId.value = createdId
      await loadChatSessions({
        preferredSessionId: createdId,
      })
      return
    }

    ensureOpenChatSessionTab(nextSession.id)
    activeChatSessionId.value = nextSession.id
    await loadChatMessages(nextSession.id)
  }
  catch {
    if (
      requestId === chatSessionsRequestId
      && activeProjectId.value === projectId
      && String(activeWorkspaceId.value || '').trim() === workspaceId
      && aiMode.value === mode
      && !sameScopeRefresh
    ) {
      resetChatScopeState()
    }
  }
  finally {
    if (requestId === chatSessionsRequestId)
      chatSessionsLoading.value = false
  }
}

async function switchChatSession(sessionId: string) {
  if (!sessionId)
    return

  ensureOpenChatSessionTab(sessionId)
  if (sessionId === activeChatSessionId.value)
    return

  activeChatSessionId.value = sessionId
  await loadChatMessages(sessionId)
}

async function deleteChatSession(sessionId: string) {
  const workspaceId = String(activeWorkspaceId.value || '').trim()
  const projectId = String(activeProjectId.value || '').trim()
  if (!workspaceId || !projectId || !sessionId || deletingChatSessionId.value)
    return

  const previousOpenChatSessionIds = [...openChatSessionIds.value]
  deletingChatSessionId.value = sessionId
  removeOpenChatSessionTab(sessionId)
  try {
    await unsafeFetch<ApiResponse<{ sessionId: string }>>(
      buildProjectApiRequestUrl(
        endpoint(`/teams/${workspaceId}/chat/sessions/${sessionId}`),
        {
          projectId,
          mode: aiMode.value,
        },
      ),
      {
        method: 'DELETE',
      },
    )

    await loadChatSessions({
      preferredSessionId: activeChatSessionId.value === sessionId ? '' : activeChatSessionId.value,
      autoCreate: false,
      fallbackToFirst: true,
    })
    statusLine.value = '已删除会话。'
  }
  catch (error) {
    openChatSessionIds.value = previousOpenChatSessionIds
    statusLine.value = resolveApiErrorMessage(error, '删除会话失败，请稍后重试。')
  }
  finally {
    if (deletingChatSessionId.value === sessionId)
      deletingChatSessionId.value = ''
  }
}

async function startNewChatSession() {
  if (!ensureAiFeatureAvailable(resolveAiFeatureKeyForMode(aiMode.value)))
    return

  let modeTitle = '新建 Loopy 对话'
  if (workbenchMode.value === 'final_review')
    modeTitle = '新建终审助手会话'
  if (aiMode.value === 'defense')
    modeTitle = '新建 Loopy 答辩会话'
  else if (aiMode.value === 'auto_optimize')
    modeTitle = '新建 Loopy 自动优化会话'
  else if (aiMode.value === 'issue_discovery')
    modeTitle = '新建 Loopy 寻疑发现会话'
  else if (aiMode.value === 'document_assist')
    modeTitle = '新建 AgentDoc 会话'
  else if (aiMode.value === 'contextual_agent')
    modeTitle = `新建 ${currentWorkspaceAssistantLabel.value || '上下文助手'} 会话`
  const createdId = await createChatSession(modeTitle)
  if (!createdId) {
    statusLine.value = '新建 Loopy 会话失败，请稍后重试。'
    return
  }

  await loadChatSessions({
    preferredSessionId: createdId,
  })
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
  if (!ensureAiFeatureAvailable('contestFilter'))
    return

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

    statusLine.value = 'AI 已完成筛选并返回排序结果。'
  }
  catch (error) {
    statusLine.value = resolveApiErrorMessage(error, 'AI 筛选失败，请检查服务状态。')
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
  if (!ensureAiFeatureAvailable('topicProposal'))
    return

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
    statusLine.value = '选题板已生成，可继续设主推、写入草案或发送到右侧 AI。'
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
  if (!ensureAiFeatureAvailable('workspaceDialogAsk'))
    return

  expandRightSidebar()
  workbenchMode.value = 'project'
  updateProjectAssistantMode('dialog_ask')
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

function createWorkspaceLocalChatRequestId(): string {
  return `workspace-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function sendWorkspaceAiMessage(
  pendingMessages: ChatMessage[],
  localRequestId: string,
  workflowRequest: WorkflowDraftRequestOptions | null,
  sceneRequest: SceneDraftRequestOptions | null,
  signal?: AbortSignal,
) {
  const runningMode = aiMode.value
  chatDraft.value = null
  chatMissingFields.value = []
  defenseRounds.value = []
  defenseScorecard.value = null
  const baseMessages = [...pendingMessages]
  let assistantBuffer = ''
  let assistantMetadata: ChatMessage['metadata'] | undefined
  let streamSystemSeq = 0
  const sceneDraftSource = sceneRequest && activeAgentProtoSceneResourceId.value
    ? buildSceneDraftSource({
        rawValue: collabDrawValue.value || '',
        template: sceneRequest.template,
        architectureView: sceneRequest.template === 'architecture'
          ? (sceneRequest.architectureView || 'system_context')
          : undefined,
      })
    : null

  const renderStreamMessages = () => {
    const nextMessages: ChatMessage[] = [...baseMessages]
    if (assistantBuffer) {
      nextMessages.push(createWorkspaceLocalChatMessage({
        role: 'assistant',
        content: assistantBuffer,
        localRequestId,
        streamState: 'streaming',
        metadata: assistantMetadata,
      }))
    }
    chatMessages.value = nextMessages
  }

  const requestBody: AiWorkspaceRequest = {
    teamId: activeWorkspaceId.value,
    workspaceId: activeWorkspaceId.value,
    projectId: activeProjectId.value,
    sessionId: activeChatSessionId.value,
    mode: runningMode,
    messages: toWorkspaceModelMessages(pendingMessages),
    context: {
      teamId: activeWorkspaceId.value,
      workspaceId: activeWorkspaceId.value,
      projectId: activeProjectId.value,
      projectTitle: headerProjectName.value,
      contestId: selectedContestId.value,
      trackId: selectedTrackId.value,
      major: major.value,
      resourceId: currentAssistantResource.value?.id || '',
      resourceTitle: currentAssistantResource.value?.title || '',
      markdown: runningMode === 'document_assist' ? documentAssistRequestState.markdown : '',
      selectionText: runningMode === 'document_assist' ? documentAssistRequestState.selectionText : '',
      selectionRange: runningMode === 'document_assist' ? documentAssistRequestState.selectionRange : null,
      assistantPreset: currentWorkspaceAssistantContext.value.assistantPreset,
      assistantLabel: currentWorkspaceAssistantContext.value.assistantLabel,
      contextualAssistantKey: currentWorkspaceAssistantContext.value.contextualAssistantKey,
      activeTabId: currentWorkspaceAssistantContext.value.activeTabId,
      previewMode: currentWorkspaceAssistantContext.value.previewMode,
      resourcePurpose: currentWorkspaceAssistantContext.value.resourcePurpose,
      workflowSnapshot: currentWorkspaceAssistantContext.value.resourcePurpose === 'workflow'
        ? activeWorkflowSnapshot.value
        : null,
      workflowAction: workflowRequest?.action,
      workflowTemplate: workflowRequest?.template,
      workflowArchitectureView: workflowRequest?.template === 'architecture'
        ? workflowRequest.architectureView
        : undefined,
      workflowStylePreset: workflowRequest?.stylePreset,
      workflowLayoutPreset: workflowRequest?.layoutPreset,
      sceneHash: sceneRequest ? activeAgentProtoSceneHash.value : '',
      sceneSourceText: sceneRequest ? (sceneDraftSource?.sourceText || '') : '',
      sceneSourceFormat: sceneRequest ? (sceneDraftSource?.sourceFormat || undefined) : undefined,
      sceneAction: sceneRequest?.action,
      sceneTemplate: sceneRequest?.template,
      sceneArchitectureView: sceneRequest?.template === 'architecture'
        ? sceneRequest.architectureView
        : undefined,
      sceneStylePreset: sceneRequest?.stylePreset,
      sceneLayoutPreset: sceneRequest?.layoutPreset,
    },
  }

  const response = await fetch(endpoint('/ai/workspace/stream'), {
    method: 'POST',
    credentials: 'include',
    signal,
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
        streamSystemSeq += 1
        baseMessages.push(createWorkspaceStreamSystemChatMessage(eventType, data, streamSystemSeq))
        renderStreamMessages()
        statusLine.value = String(data.message || 'AI 处理中...')
        if (data.sessionId) {
          ensureOpenChatSessionTab(String(data.sessionId))
          activeChatSessionId.value = String(data.sessionId)
        }
        continue
      }

      if (eventType === 'tool') {
        streamSystemSeq += 1
        baseMessages.push(createWorkspaceStreamSystemChatMessage(eventType, data, streamSystemSeq))
        renderStreamMessages()
        const name = String(data.name || '').trim()
        if (name)
          statusLine.value = `AI 正在调用工具：${name}`
        else
          statusLine.value = 'AI 正在调用工具...'
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
        assistantMetadata = {
          ...(result.documentDraft
            ? { agentDocDraft: result.documentDraft }
            : {}),
          ...(result.workflowDraft
            ? { workflowDraft: result.workflowDraft }
            : {}),
          ...(result.sceneDraft
            ? { sceneDraft: result.sceneDraft }
            : {}),
          ...(result.knowledge
            ? { knowledge: result.knowledge }
            : {}),
        }
        if (Object.keys(assistantMetadata).length === 0)
          assistantMetadata = undefined
        renderStreamMessages()
        chatMessages.value = finalizeWorkspaceLocalChatMessages(chatMessages.value, localRequestId)

        if (result.sessionId) {
          ensureOpenChatSessionTab(String(result.sessionId))
          activeChatSessionId.value = String(result.sessionId)
        }

        if (runningMode === 'auto_optimize') {
          const createdCount = Array.isArray(result.proposals) ? result.proposals.length : 0
          statusLine.value = createdCount > 0
            ? `已生成 ${createdCount} 条待审批提案，尚未自动执行。`
            : '自动优化已完成，当前没有生成安全提案。'
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
            ? `寻疑扫描完成，记录 ${issues.length} 条高置信问题。`
            : '寻疑扫描完成，当前未发现高置信问题。'
        }
        else if (runningMode === 'document_assist') {
          statusLine.value = result.documentDraft
            ? 'AgentDoc 已生成待确认的文档草案。'
            : 'AgentDoc 已完成，本次未生成可安全应用的文档草案。'
        }
        else if (result.workflowDraft) {
          statusLine.value = 'AgentProto 已生成待确认的流程草案。'
        }
        else if (result.sceneDraft) {
          statusLine.value = 'AgentProto 已生成待确认的自由画布草案。'
        }
        else {
          statusLine.value = runningMode === 'contextual_agent'
            ? '上下文助手已完成，本次未生成可安全应用的草案。'
            : '只读对话完成，项目未发生写入。'
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

async function sendDefenseMessage(pendingMessages: ChatMessage[], signal?: AbortSignal) {
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
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      teamId: activeWorkspaceId.value,
      workspaceId: activeWorkspaceId.value,
      sessionId: activeChatSessionId.value,
      personaIds: enabledPersonaIds,
      inputMode: 'text',
      messages: toWorkspaceModelMessages(pendingMessages),
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
        if (data.sessionId) {
          ensureOpenChatSessionTab(String(data.sessionId))
          activeChatSessionId.value = String(data.sessionId)
        }
        continue
      }
      if (eventType === 'stage') {
        const nextTurnIndex = Number(data.turnIndex || 0)
        if (data.stage)
          defenseStage.value = String(data.stage) as AiDefenseStage
        if (Number.isFinite(nextTurnIndex))
          defenseTurnCount.value = Math.max(defenseTurnCount.value, nextTurnIndex - 1)
        continue
      }
      if (eventType === 'judge') {
        const round = data.round as AiDefenseJudgeRound | undefined
        if (round) {
          upsertDefenseLatestRound(round)
          appendDefenseTimelineTurn({
            turnIndex: round.turnIndex,
            stage: round.stage,
            personaId: round.personaId || null,
            judgeType: round.judgeType,
            judgeName: round.judge,
            question: round.question,
            comment: round.comment,
            followUp: round.followUp,
            score: round.score,
            evidenceRefs: round.evidenceRefs,
            createdAt: round.createdAt,
            metadata: {
              source: 'defense_stream',
            },
          })
        }
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
          setDefenseLatestRounds(result.rounds as AiDefenseJudgeRound[])
        const scorecard = result.scorecard as AiDefenseScorecard | undefined
        if (scorecard)
          defenseScorecard.value = scorecard
        if (Array.isArray(result.missingFields))
          chatMissingFields.value = result.missingFields.map(item => String(item))
        if (result.sessionId) {
          ensureOpenChatSessionTab(String(result.sessionId))
          activeChatSessionId.value = String(result.sessionId)
        }
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

async function sendChatMessage(payload?: {
  content?: string
  workflowRequest?: WorkflowDraftRequestOptions | null
  sceneRequest?: SceneDraftRequestOptions | null
}) {
  if (chatLoading.value) {
    interruptChatMessage()
    return
  }
  if (!ensureAiFeatureAvailable(resolveAiFeatureKeyForMode(aiMode.value)))
    return

  if (!activeWorkspaceId.value) {
    statusLine.value = '请先选择一个空间。'
    return
  }

  if (!activeProjectId.value) {
    statusLine.value = '请先选择一个项目。'
    return
  }

  if (aiMode.value === 'document_assist') {
    if (!activeMarkdownResourceId.value) {
      statusLine.value = '当前没有可编辑文档，暂时无法使用 AgentDoc。'
      return
    }
    documentAssistRequestState.resourceId = activeMarkdownResourceId.value
    documentAssistRequestState.resourceTitle = activeMarkdownResourceTitle.value
    documentAssistRequestState.markdown = getActiveMarkdownMirror()
    if (!documentAssistRequestState.markdown) {
      statusLine.value = '当前文档内容为空，暂时无法生成 AgentDoc 草案。'
      return
    }
  }

  const content = String(payload?.content || chatInput.value).trim()
  if (!content)
    return

  if (!activeChatSessionId.value) {
    const createdId = await createChatSession()
    if (!createdId) {
      statusLine.value = '创建对话会话失败，请稍后重试。'
      return
    }
    ensureOpenChatSessionTab(createdId)
    activeChatSessionId.value = createdId
  }

  const sessionInScope = chatSessions.value.some(item => item.id === activeChatSessionId.value)
  if (!sessionInScope) {
    const recreatedId = await createChatSession()
    if (!recreatedId) {
      statusLine.value = '当前会话不属于该项目作用域，且重建失败。'
      return
    }
    ensureOpenChatSessionTab(recreatedId)
    activeChatSessionId.value = recreatedId
    await loadChatSessions({
      preferredSessionId: recreatedId,
    })
  }

  const workspaceLocalRequestId = aiMode.value === 'defense'
    ? ''
    : createWorkspaceLocalChatRequestId()
  const pendingUserMessage = aiMode.value === 'defense'
    ? { role: 'user' as const, content }
    : createWorkspaceLocalChatMessage({
        role: 'user',
        content,
        localRequestId: workspaceLocalRequestId,
        streamState: 'streaming',
      })
  const pendingMessages = [...chatMessages.value, pendingUserMessage]
  chatMessages.value = pendingMessages
  chatInput.value = ''
  chatLoading.value = true
  chatInterrupting.value = false
  const abortController = new AbortController()
  activeChatStreamAbortController.value = abortController
  let streamFailed = false
  let streamInterrupted = false

  try {
    if (aiMode.value === 'defense') {
      await sendDefenseMessage(pendingMessages, abortController.signal)
    }
    else {
      await sendWorkspaceAiMessage(
        pendingMessages,
        workspaceLocalRequestId,
        payload?.workflowRequest || null,
        payload?.sceneRequest || null,
        abortController.signal,
      )
    }
  }
  catch (error) {
    if (isAbortError(error)) {
      streamInterrupted = true
      if (workspaceLocalRequestId)
        chatMessages.value = markWorkspaceLocalChatMessagesAborted(chatMessages.value, workspaceLocalRequestId)
      statusLine.value = '已打断当前 AI 运行。'
    }
    else {
      streamFailed = true
    }
    if (streamInterrupted)
      return
    const message = error instanceof Error ? error.message : 'AI 调用失败。'
    const errorText = message || '聊天服务暂不可用，请稍后重试。'
    const existingMessages = workspaceLocalRequestId
      ? markWorkspaceLocalChatMessagesAborted(chatMessages.value, workspaceLocalRequestId)
      : [...chatMessages.value]
    const lastMessage = existingMessages[existingMessages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content !== errorText) {
      chatMessages.value = workspaceLocalRequestId
        ? [...existingMessages, createWorkspaceLocalChatMessage({
            role: 'assistant',
            content: errorText,
            localRequestId: workspaceLocalRequestId,
            streamState: 'aborted',
          })]
        : [...existingMessages, { role: 'assistant', content: errorText }]
    }
    else {
      chatMessages.value = existingMessages
    }
    statusLine.value = errorText
  }
  finally {
    chatLoading.value = false
    chatInterrupting.value = false
    activeChatStreamAbortController.value = null
    if (!streamFailed && !streamInterrupted) {
      await loadChatSessions({
        preferredSessionId: activeChatSessionId.value,
      })
    }
  }
}

function interruptChatMessage(): void {
  if (!chatLoading.value || !activeChatStreamAbortController.value || chatInterrupting.value)
    return
  chatInterrupting.value = true
  statusLine.value = '正在打断当前 AI 运行...'
  activeChatStreamAbortController.value.abort()
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

function syncProjectWorkbenchAiMode(): void {
  if (workbenchMode.value !== 'project')
    return

  const nextMode = projectResolvedAiMode.value
  if (aiMode.value !== nextMode)
    aiMode.value = nextMode

  lastPrimaryAiMode.value = nextMode
}

function updateProjectAssistantMode(nextMode: WorkspaceProjectAssistantMode): void {
  rightSidebarView.value = 'ai'
  projectAssistantMode.value = nextMode
  if (workbenchMode.value === 'project')
    syncProjectWorkbenchAiMode()
}

function updateDefenseWorkbenchAiMode(nextMode: WorkspaceDefenseWorkbenchAiMode): void {
  rightSidebarView.value = 'ai'
  defenseWorkbenchAiMode.value = nextMode
  aiMode.value = nextMode
}

async function updateWorkbenchMode(nextMode: WorkspaceWorkbenchMode) {
  if (workbenchSwitchPhase.value !== 'idle')
    return
  if (nextMode === workbenchMode.value)
    return

  workbenchSwitchTargetMode.value = nextMode
  workbenchSceneTransitionName.value = resolveWorkbenchSceneTransitionDirection(displayedWorkbenchMode.value, nextMode)

  if (nextMode === 'defense') {
    if (workbenchMode.value === 'final_review')
      restorePreFinalReviewWorkbenchState()
    closeFinalReviewDrawers()
    workbenchMode.value = 'defense'
    updateDefenseWorkbenchAiMode('defense')
  }
  else if (nextMode === 'final_review') {
    if (workbenchMode.value !== 'final_review') {
      rememberPreFinalReviewWorkbenchState()
    }
    if (workbenchMode.value === 'project')
      lastPrimaryAiMode.value = projectResolvedAiMode.value
    closeFinalReviewDrawers()
    workbenchMode.value = 'final_review'
    aiMode.value = 'dialog_ask'
    statusLine.value = '已切到终审工作台，当前进入终审驾驶舱。'
  }
  else {
    if (workbenchMode.value === 'final_review')
      restorePreFinalReviewWorkbenchState()
    closeFinalReviewDrawers()
    workbenchMode.value = 'project'
    syncProjectWorkbenchAiMode()
  }

  try {
    await runWorkbenchSwitchLoadingSequence()
    workbenchSwitchPhase.value = 'animating'
    const sceneTransitionPromise = waitForWorkbenchSceneTransitionEnd()
    displayedWorkbenchMode.value = nextMode
    await nextTick()
    await sceneTransitionPromise
  }
  finally {
    workbenchSwitchPhase.value = 'idle'
    workbenchSwitchTargetMode.value = ''
    workbenchSwitchProgress.value = 0
  }
}

function updateWorkspaceAiMode(nextMode: WorkspaceAiMode) {
  rightSidebarView.value = 'ai'
  if (workbenchMode.value === 'project') {
    updateProjectAssistantMode(nextMode === 'dialog_ask' ? 'dialog_ask' : 'contextual')
    return
  }
  if (workbenchMode.value === 'final_review' && nextMode !== 'defense') {
    aiMode.value = 'dialog_ask'
    return
  }
  if (nextMode === 'document_assist')
    return
  updateDefenseWorkbenchAiMode(nextMode as WorkspaceDefenseWorkbenchAiMode)
}

async function openFinalReviewFlowFromWorkbench(): Promise<void> {
  await updateWorkbenchMode('project')
  const opened = await ensureWorkflowCanvas()
  if (opened)
    statusLine.value = '已打开终审流程，当前回到研发工作台查看流程画布。'
}

async function openProjectSettingsFromFinalReview(): Promise<void> {
  await updateWorkbenchMode('project')
  openSettingsSignal.value += 1
  statusLine.value = '已打开项目设置，可继续补齐终审底座。'
}

async function openDashboardFromFinalReview(): Promise<void> {
  await updateWorkbenchMode('project')
  ensureWorkspaceMainTabOpen('dashboard')
  statusLine.value = '已打开仪表盘对标视图。'
}

function openMaterialsDrawerFromFinalReview(): void {
  finalReviewMaterialsOpen.value = true
}

async function openResourceFromFinalReview(resourceId: string): Promise<void> {
  const normalizedResourceId = normalizeString(resourceId)
  if (!normalizedResourceId)
    return

  await updateWorkbenchMode('project')
  await openProjectResourcePreview(normalizedResourceId)
}

async function switchToDefenseWorkbenchFromFinalReview(): Promise<void> {
  await updateWorkbenchMode('defense')
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

function openLoopyDataPanel() {
  openLoopyDataSignal.value += 1
  statusLine.value = '已打开 Loopy 数据工作台，可查看真实索引诊断与重建入口。'
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
  closeWorkspaceContextMenu({
    restoreFocus: false,
  })
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
      await updateWorkbenchMode('defense')
      updateDefenseWorkbenchAiMode('issue_discovery')
      statusLine.value = '已切到 Issue 视图。'
      return
    case 'open_flow':
      await openFlowFromLeftSidebar()
      return
    case 'open_final_review':
      await updateWorkbenchMode('final_review')
      return
    case 'switch_workbench_project':
      await updateWorkbenchMode('project')
      statusLine.value = '已切回研发工作台。'
      return
    case 'switch_workbench_defense':
      await updateWorkbenchMode('defense')
      statusLine.value = '已切到答辩工作台。'
      return
    case 'switch_workbench_final_review':
      await updateWorkbenchMode('final_review')
      return
    case 'switch_ai_dialog':
      expandRightSidebar()
      if (workbenchMode.value === 'defense')
        updateDefenseWorkbenchAiMode('dialog_ask')
      else
        updateProjectAssistantMode('dialog_ask')
      statusLine.value = '已切到 AI 对话模式。'
      return
    case 'switch_ai_optimize':
      expandRightSidebar()
      await updateWorkbenchMode('defense')
      updateDefenseWorkbenchAiMode('auto_optimize')
      statusLine.value = '已切到 AI 自动优化模式。'
      return
    case 'switch_ai_issue':
      expandRightSidebar()
      await updateWorkbenchMode('defense')
      updateDefenseWorkbenchAiMode('issue_discovery')
      statusLine.value = '已切到 AI 寻疑发现模式。'
      return
    case 'create_collab_markdown':
      await createCollabResource('markdown')
      return
    case 'create_collab_draw':
      await createCollabResource('draw')
      return
    case 'create_collab_workflow':
      await createCollabResource({ kind: 'draw', purpose: 'workflow' })
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
      await updateWorkbenchMode('defense')
      updateDefenseWorkbenchAiMode('issue_discovery')
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

onMounted(async () => {
  if (import.meta.client) {
    workspacePlatform.value = window.navigator.platform
    metaKShortcutLabel.value = resolveWorkspaceMetaKShortcutLabel(window.navigator.platform)
    document.addEventListener('keydown', handleWorkspaceGlobalKeydown)
    reducedMotionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.value = reducedMotionMediaQuery.matches
    if (typeof reducedMotionMediaQuery.addEventListener === 'function')
      reducedMotionMediaQuery.addEventListener('change', handleReducedMotionPreferenceChange)
    else
      reducedMotionMediaQuery.addListener(handleReducedMotionPreferenceChange)
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
    loadAiRuntimeStatus(),
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
  void teardownDefenseRealtimeBridge()
  clearWorkflowSnapshotSyncTimer()
  clearProjectSettingsAutoTimers()
  clearProjectWorkspaceViewPersistTimer()
  clearProjectOutlineGenerateTimer()
  clearPreviewStatusPolling()
  clearMarkdownCommentPolling()
  clearRealtimeProjectRefreshTimer()
  clearMeetingRealtimeRefreshTimer()
  clearFallbackResourceRefreshTimer()
  clearWorkspaceDisplayWidthSyncTimer()
  if (pendingWorkspaceDisplayWidthSyncPayload)
    void flushWorkspaceDisplayWidthUserSync()
  disposeRightSidebarBreakpointTracking()
  finishWorkspaceSidebarResize(false)
  if (unsubscribeRealtimeMessages) {
    unsubscribeRealtimeMessages()
    unsubscribeRealtimeMessages = null
  }
  disposeCollabDocBinding(true)
  workspaceRealtime.disconnect()
  closeWorkspaceContextMenu({
    restoreFocus: false,
  })
  if (import.meta.client)
    document.removeEventListener('keydown', handleWorkspaceGlobalKeydown)
  if (reducedMotionMediaQuery) {
    if (typeof reducedMotionMediaQuery.removeEventListener === 'function')
      reducedMotionMediaQuery.removeEventListener('change', handleReducedMotionPreferenceChange)
    else
      reducedMotionMediaQuery.removeListener(handleReducedMotionPreferenceChange)
  }
  reducedMotionMediaQuery = null
  clearWorkbenchSwitchDelays()
  resolveWorkbenchSceneTransition()
  clearMetaKRemoteSearchTimer()
})

watch(defenseSessionState, (nextValue) => {
  syncDefenseRealtimeDraftState(nextValue)
}, { deep: true })

watch(activeChatSessionId, (nextValue, previousValue) => {
  if (nextValue === previousValue)
    return
  defenseRealtimeBootstrapPayload.value = null
  if (!nextValue)
    resetDefenseRealtimeLocalState()
  if (previousValue)
    void teardownDefenseRealtimeBridge()
})

watch(workbenchMode, (nextValue, previousValue) => {
  if (nextValue === previousValue)
    return
  if (previousValue === 'defense' && nextValue !== 'defense')
    void teardownDefenseRealtimeBridge()
})

watch(activeWorkspaceId, async (value, previous) => {
  if (!value || value === previous)
    return

  workspaceRealtime.subscribeWorkspace(value)
  workspaceDisplayPreferenceError.value = ''

  if (value !== routeWorkspaceId.value)
    await navigateTo(workspaceDetailPath(value), { replace: true })
})

watch(activeWorkspaceId, (value) => {
  const normalizedWorkspaceId = normalizeString(value)
  if (!normalizedWorkspaceId) {
    workspaceBillingEstimate.value = null
    workspaceAiUsageTotalUnits.value = null
    return
  }

  void loadWorkspaceBillingEstimate(normalizedWorkspaceId)
  void loadWorkspaceAiUsageSummary(normalizedWorkspaceId)
}, { immediate: true })

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
  workspaceInvitationError.value = ''
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
  activeTabReady.value = false
  workspaceBootstrapLoading.value = Boolean(next)
  workspaceBackgroundLoading.value = Boolean(next)
  selectedContestDetailRequestId += 1
  chatSessionsRequestId += 1
  chatMessagesRequestId += 1
  defenseSessionDetailRequestId += 1
  clearLoadedScopeSnapshots()
  disposeCollabDocBinding(true)
  resources.value = []
  resourceLibrary.value = []
  recycleResources.value = []
  projectResourceShares.value = []
  resourcesLoading.value = false
  resourceLibraryLoading.value = false
  projectResourceSharesLoading.value = false
  flowResourceId.value = ''
  projectOutlineSnapshot.value = null
  selectedContestDetail.value = null
  selectedContestDetailLoading.value = false
  aiChangeRequests.value = []
  projectIssueReports.value = []
  projectIssues.value = []
  projectMeetings.value = []
  projectMeetingsLoading.value = false
  projectMeetingsLoadedProjectId.value = ''
  meetingRuntimeHealth.value = null
  activeMeetingDetail.value = null
  meetingDetailLoading.value = false
  meetingDetailLoadedId.value = ''
  activeMeetingUtterances.value = []
  meetingLiveCaptions.value = []
  activeMeetingGuestShare.value = null
  clearMeetingJoinSession()
  resetWorkspaceMemberManagementState()
  workspaceInvitationLink.value = ''
  chatSessions.value = []
  chatMessages.value = []
  chatSessionsLoading.value = false
  chatMessagesLoading.value = false
  chatSessionsLoadedScopeKey.value = ''
  chatMessagesLoadedSessionId.value = ''
  clearActiveChatArtifacts()
  defensePersonas.value = []
  closeProjectResourcePreview()
  projectAssistantMode.value = 'contextual'
  defenseWorkbenchAiMode.value = 'defense'
  if (next) {
    workspaceRealtime.subscribeProject(next)
    beginWorkspaceBootstrapTrace(next, requestId)
  }
  if (!next) {
    resetProjectSettingsState(null)
    topicBoardSnapshot.value = null
    topicBoardHistory.value = []
    topicBoardCreateSeedHandled.value = false
    openMainTabs.value = []
    activeMainTabId.value = ''
    activeTabReady.value = false
    workspaceBackgroundLoading.value = false
    workspaceBootstrapLoading.value = false
    workspaceBootstrapStartedAt.value = 0
    return
  }

  try {
    syncFallbackResourceRefreshTimer()
    resetProjectSettingsState(activeProject.value)
    await refreshProjectCriticalResourceContext()
    if (!isCurrentWorkspaceBootstrapRequest(next, requestId))
      return
    if (
      activeWorkspaceId.value
      && workspaceDisplayPreferenceWorkspaceId.value !== String(activeWorkspaceId.value || '').trim()
    ) {
      await loadWorkspaceDisplayPreferenceSnapshot(activeWorkspaceId.value)
      if (!isCurrentWorkspaceBootstrapRequest(next, requestId))
        return
    }

    const restoredViewState = await hydrateProjectWorkspaceViewState(next)
    if (!isCurrentWorkspaceBootstrapRequest(next, requestId))
      return
    if (workbenchMode.value === 'project')
      syncProjectWorkbenchAiMode()
    if (restoredViewState.legacyDesignUnavailable)
      statusLine.value = '旧设计入口已不可用，已返回项目仪表盘。'

    const selectedContestIdFromState = String(restoredViewState.state.selectedContestId || '').trim()
    emitWorkspaceBootstrapTrace('bootstrap:shell-ready', next, requestId, {
      activeTabId: normalizeString(activeMainTabId.value),
    })

    const activeTabLoadResult = await loadActiveWorkspaceCriticalTabData(
      next,
      restoredViewState,
      selectedContestIdFromState,
    )
    if (!isCurrentWorkspaceBootstrapRequest(next, requestId))
      return

    activeTabReady.value = true
    emitWorkspaceBootstrapTrace('bootstrap:active-tab-ready', next, requestId, {
      activeTabId: normalizeString(activeMainTabId.value),
    })

    if (activeTabLoadResult.draftHydrationResult)
      await resolveProjectDeviceRestore(next, restoredViewState, activeTabLoadResult.draftHydrationResult)
    if (!isCurrentWorkspaceBootstrapRequest(next, requestId))
      return

    workspaceBootstrapLoading.value = false
    await nextTick()
    if (!workspaceShellLoading.value) {
      emitWorkspaceBootstrapTrace('bootstrap:overlay-hidden', next, requestId, {
        activeTabId: normalizeString(activeMainTabId.value),
      })
    }

    void runWorkspaceBackgroundBootstrap(
      next,
      requestId,
      restoredViewState,
      selectedContestIdFromState,
      activeTabLoadResult.deferredTaskIds,
    )
  }
  catch (error) {
    if (!isCurrentWorkspaceBootstrapRequest(next, requestId))
      return
    activeTabReady.value = true
    workspaceBackgroundLoading.value = false
    workspaceBootstrapLoading.value = false
    statusLine.value = resolveApiErrorMessage(error, '工作区加载失败，请稍后重试。')
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

  const visibleResourceIds = new Set(nextResources.map(resource => resource.id))
  const nextOpenTabs = openMainTabs.value.filter((tabId) => {
    if (!tabId.startsWith('resource:'))
      return true
    return visibleResourceIds.has(tabId.slice('resource:'.length))
  })
  const tabStateChanged = nextOpenTabs.length !== openMainTabs.value.length
    || nextOpenTabs.some((tabId, index) => tabId !== openMainTabs.value[index])
  const previewResourceMissing = Boolean(previewResourceId.value && !visibleResourceIds.has(previewResourceId.value))
  if (previewResourceMissing)
    closeProjectResourcePreview(previewResourceId.value)
  if (tabStateChanged) {
    openMainTabs.value = nextOpenTabs
    if (!openMainTabs.value.includes(activeMainTabId.value as typeof openMainTabs.value[number]))
      activeMainTabId.value = openMainTabs.value[0] || ''
  }

  if (projectWorkspaceViewReady.value)
    void syncProjectWorkspaceViewState()
  if (activeMainTabId.value && !workspaceCriticalLoading.value)
    void syncActiveMainTabCollabBinding(activeMainTabId.value)
}, { deep: true })

watch(activeMarkdownResourceId, async (nextResourceId, previousResourceId) => {
  if (nextResourceId === previousResourceId)
    return

  activeMarkdownOutlineItems.value = []
  clearMarkdownCommentPolling()
  markdownCommentThreads.value = []
  activeMarkdownCommentThreadId.value = ''
  markdownCommentDraftAnchor.value = null
  documentAssistRequestState.resourceId = nextResourceId
  documentAssistRequestState.resourceTitle = nextResourceId
    ? activeMarkdownResourceTitle.value
    : ''
  documentAssistRequestState.markdown = nextResourceId
    ? getActiveMarkdownMirror()
    : ''
  documentAssistRequestState.selectionText = ''
  documentAssistRequestState.selectionRange = null

  if (!nextResourceId) {
    if (rightSidebarView.value === 'comments')
      rightSidebarView.value = 'ai'
    return
  }

  if (rightSidebarView.value === 'comments')
    rightSidebarView.value = 'ai'

  await loadMarkdownCommentThreads()
  startMarkdownCommentPolling()
}, { immediate: true })

watch(resources, () => {
  if (!route.hash)
    return
  void resolveWorkspaceOutlineHashNavigation(route.hash)
}, { deep: true })

watch(activeMarkdownResourceTitle, (nextTitle) => {
  if (!documentAssistRequestState.resourceId)
    return
  documentAssistRequestState.resourceTitle = nextTitle
})

watch(collabMarkdownDoc, () => {
  if (!documentAssistRequestState.resourceId)
    return
  documentAssistRequestState.markdown = getActiveMarkdownMirror()
}, { deep: true })

watch(() => route.hash, (nextHash, previousHash) => {
  if (!nextHash || nextHash === previousHash)
    return
  void resolveWorkspaceOutlineHashNavigation(nextHash)
}, { immediate: true })

async function syncActiveMainTabCollabBinding(nextTabId = activeMainTabId.value): Promise<void> {
  if (!nextTabId)
    return

  if (nextTabId === 'flow') {
    const targetResourceId = String(flowResourceId.value || '').trim()
    if (workbenchMode.value === 'project')
      updateProjectAssistantMode('contextual')
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

  const target = await resolveProjectResourceOpenTarget(targetResourceId)
  if (!target || (target.surface !== 'preview' && target.surface !== 'design'))
    return

  await openProjectCollabResource(target.resourceId, undefined, {
    openTab: false,
    surface: target.surface,
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

async function loadActiveWorkspaceCriticalTabData(
  projectId: string,
  restoredViewState: HydratedProjectWorkspaceViewStateResult,
  selectedContestIdFromState: string,
): Promise<WorkspaceActiveTabLoadResult> {
  const tabId = normalizeString(activeMainTabId.value)
  const result: WorkspaceActiveTabLoadResult = {
    deferredTaskIds: new Set<WorkspaceBootstrapDeferredTaskId>(),
    draftHydrationResult: null,
  }

  if (!projectId || !tabId || activeProjectId.value !== projectId || tabId === 'dashboard')
    return result

  if (tabId === 'members') {
    result.deferredTaskIds.add('members')
    await loadWorkspaceMemberManagement()
    return result
  }

  if (tabId === 'settings') {
    result.deferredTaskIds.add('settings')
    result.deferredTaskIds.add('resource-shares')
    const [draftHydrationResult] = await Promise.all([
      loadProjectSettings(selectedContestIdFromState),
      loadProjectResourceShares(),
    ])
    result.draftHydrationResult = draftHydrationResult
    return result
  }

  if (tabId === 'meeting') {
    result.deferredTaskIds.add('meetings')
    await loadProjectMeetings({
      fallbackToFirst: false,
      preferredMeetingId: restoredViewState.state.activeMeetingId,
      hydrateSelectedDetail: false,
    })
    return result
  }

  if (tabId.startsWith('meeting-create:')) {
    result.deferredTaskIds.add('members')
    result.deferredTaskIds.add('meetings')
    await Promise.all([
      loadWorkspaceMemberManagement(),
      loadProjectMeetings({
        fallbackToFirst: false,
        preferredMeetingId: restoredViewState.state.activeMeetingId,
        hydrateSelectedDetail: false,
      }),
    ])
    return result
  }

  if (tabId.startsWith('meeting:')) {
    result.deferredTaskIds.add('meetings')
    await loadProjectMeetings({
      fallbackToFirst: false,
      preferredMeetingId: resolveMeetingIdFromTabId(tabId),
      hydrateSelectedDetail: true,
    })
    return result
  }

  if (tabId === 'flow') {
    const workflowResource = resources.value.find(item => isWorkflowCanvasResource(item)) || null
    if (workflowResource && (!flowResourceId.value || !resources.value.some(item => item.id === flowResourceId.value)))
      flowResourceId.value = workflowResource.id
    await syncActiveMainTabCollabBinding(tabId)
    return result
  }

  if (tabId.startsWith('resource:')) {
    const resourceId = tabId.slice('resource:'.length) || normalizeString(previewResourceId.value)
    if (resourceId)
      await openProjectResourcePreview(resourceId, { openTab: false })
  }

  return result
}

function buildWorkspaceBackgroundBootstrapTasks(
  restoredViewState: HydratedProjectWorkspaceViewStateResult,
  selectedContestIdFromState: string,
  skippedTaskIds: Set<WorkspaceBootstrapDeferredTaskId>,
) {
  const tasks: Array<{
    id: WorkspaceBootstrapDeferredTaskId
    run: () => Promise<unknown>
  }> = [
    {
      id: 'resource-library',
      run: () => loadProjectResourceLibrary(),
    },
    {
      id: 'resource-recycle',
      run: () => loadProjectRecycleResources(),
    },
    {
      id: 'resource-shares',
      run: () => loadProjectResourceShares(),
    },
    {
      id: 'members',
      run: () => loadWorkspaceMemberManagement(),
    },
    {
      id: 'outline',
      run: () => loadProjectOutline(),
    },
    {
      id: 'settings',
      run: () => loadProjectSettings(selectedContestIdFromState),
    },
    {
      id: 'contest-detail',
      run: () => loadSelectedContestDetail(selectedContestIdFromState),
    },
    {
      id: 'topic-boards',
      run: () => loadTopicBoards(),
    },
    {
      id: 'ai-changes',
      run: () => loadAiChangeRequests(),
    },
    {
      id: 'issues',
      run: () => loadProjectIssues(),
    },
    {
      id: 'meetings',
      run: () => loadProjectMeetings({
        fallbackToFirst: false,
        preferredMeetingId: restoredViewState.state.activeMeetingId,
        hydrateSelectedDetail: false,
      }),
    },
    {
      id: 'chat-sessions',
      run: () => loadChatSessions({
        preferredSessionId: restoredViewState.state.activeChatSessionId,
        autoCreate: false,
        fallbackToFirst: !restoredViewState.state.activeChatSessionId,
      }),
    },
    {
      id: 'defense-personas',
      run: () => loadDefensePersonas(),
    },
  ]

  return tasks.filter(task => !skippedTaskIds.has(task.id))
}

async function runWorkspaceBackgroundBootstrap(
  projectId: string,
  requestId: number,
  restoredViewState: HydratedProjectWorkspaceViewStateResult,
  selectedContestIdFromState: string,
  skippedTaskIds: Set<WorkspaceBootstrapDeferredTaskId>,
): Promise<void> {
  const tasks = buildWorkspaceBackgroundBootstrapTasks(
    restoredViewState,
    selectedContestIdFromState,
    skippedTaskIds,
  )
  let draftHydrationResult: ProjectSettingsDraftHydrationResult | null = null

  if (tasks.length === 0) {
    if (!isCurrentWorkspaceBootstrapRequest(projectId, requestId))
      return
    await consumeTopicBoardCreateSeed()
    if (isCurrentWorkspaceBootstrapRequest(projectId, requestId)) {
      workspaceBackgroundLoading.value = false
      emitWorkspaceBootstrapTrace('bootstrap:background-complete', projectId, requestId)
    }
    return
  }

  try {
    await Promise.allSettled(tasks.map(async (task) => {
      const taskResult = await task.run()
      if (task.id === 'settings')
        draftHydrationResult = (taskResult || null) as ProjectSettingsDraftHydrationResult | null
    }))

    if (!isCurrentWorkspaceBootstrapRequest(projectId, requestId))
      return

    if (draftHydrationResult)
      await resolveProjectDeviceRestore(projectId, restoredViewState, draftHydrationResult)
    if (!isCurrentWorkspaceBootstrapRequest(projectId, requestId))
      return

    await consumeTopicBoardCreateSeed()
    if (isCurrentWorkspaceBootstrapRequest(projectId, requestId))
      emitWorkspaceBootstrapTrace('bootstrap:background-complete', projectId, requestId)
  }
  finally {
    if (isCurrentWorkspaceBootstrapRequest(projectId, requestId))
      workspaceBackgroundLoading.value = false
  }
}

watch([activeProjectId, activeMainTabId], async ([projectId, nextTabId], [previousProjectId, previousTabId]) => {
  if (!projectId)
    return
  if (workspaceCriticalLoading.value)
    return
  if (projectId === previousProjectId && nextTabId === previousTabId)
    return
  await syncActiveMainTabMeetingSelection(nextTabId)
}, { immediate: true })

watch(activeMainTabId, async (next, previous) => {
  if (next === previous)
    return
  if (workspaceCriticalLoading.value)
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
    openChatSessionIds,
    activeChatSessionId,
    activeMeetingId,
    projectAssistantMode,
    rightSidebarView,
    leftSidebarWidth,
    rightSidebarWidth,
    leftSidebarCollapsed,
    rightSidebarUserCollapsed,
  ],
  () => {
    if (!activeProjectId.value || projectWorkspaceViewHydrating.value)
      return
    if (workspaceSidebarResizeState.active)
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

watch(projectResolvedAiMode, (next, previous) => {
  if (next === previous)
    return
  if (projectWorkspaceModeHydrating.value)
    return
  if (workbenchMode.value !== 'project')
    return
  if (aiMode.value !== next)
    aiMode.value = next
  else
    lastPrimaryAiMode.value = next
})

watch(aiMode, async (next, previous) => {
  if (next === previous)
    return

  if (projectWorkspaceModeHydrating.value)
    return

  if (workbenchMode.value === 'defense' && next !== 'document_assist')
    defenseWorkbenchAiMode.value = next as WorkspaceDefenseWorkbenchAiMode

  if (workbenchMode.value === 'project' && next !== 'defense')
    lastPrimaryAiMode.value = next as WorkspacePrimaryAiMode

  if (!activeWorkspaceId.value || !activeProjectId.value) {
    chatSessionsRequestId += 1
    chatMessagesRequestId += 1
    defenseSessionDetailRequestId += 1
    resetChatScopeState()
    return
  }

  chatSessionsRequestId += 1
  chatMessagesRequestId += 1
  defenseSessionDetailRequestId += 1
  resetChatScopeState()
  if (next === 'defense')
    await loadDefensePersonas()
  if (!isAiFeatureAvailable(resolveAiFeatureKeyForMode(next))) {
    await loadChatSessions({
      autoCreate: false,
      fallbackToFirst: false,
    })
    statusLine.value = currentAiDisabledReason.value || buildAiUnavailableMessage(resolveAiFeatureKeyForMode(next))
    return
  }
  await loadChatSessions()
})

watch(() => workspaceRealtime.connected.value, () => {
  syncFallbackResourceRefreshTimer()
})

watch(workbenchMode, (next, previous) => {
  if (next === previous)
    return
  if (workbenchSwitchPhase.value !== 'idle' || workbenchSwitchTargetMode.value)
    return
  displayedWorkbenchMode.value = next
}, { immediate: true })

watch(() => workspaceShellLoading.value, (loading) => {
  if (!loading || !workspaceContextMenu.visible)
    return

  closeWorkspaceContextMenu({
    restoreFocus: false,
  })
})

watch(() => workbenchSwitchLoading.value, (loading) => {
  if (!loading || !workspaceContextMenu.visible)
    return

  closeWorkspaceContextMenu({
    restoreFocus: false,
  })
})
</script>

<template>
  <div
    ref="workspaceShellRef"
    class="workspace-shell wl-workspace-font-scope text-slate-800 bg-white h-full min-h-0 overflow-hidden"
    :class="{ 'workspace-shell--resizing': workspaceSidebarResizeState.active }"
    :data-workspace-font-size="workspaceEffectiveFontSizePreset"
    :data-workspace-spacing="workspaceEffectiveTabSpacingPreset"
    :aria-busy="workspaceShellLoading ? 'true' : 'false'"
    :style="workspaceShellStyle"
    @contextmenu="handleWorkspaceShellContextMenu"
  >
    <WorkspaceHeader
      :project-name="headerProjectName"
      :my-projects="myQuickSwitchProjects"
      :recent-projects="recentQuickSwitchProjects"
      :workbench-mode="workbenchMode"
      :workbench-switching="workbenchSwitching"
      :meta-k-shortcut-label="metaKShortcutLabel"
      :ai-collapsed="headerAiCollapsed"
      @update:workbench-mode="updateWorkbenchMode"
      @open-meta-k="openMetaK"
      @quick-switch-project="switchProjectFromHeader"
      @toggle-ai-sidebar="toggleRightSidebar"
    />

    <section
      data-testid="workspace-scene-shell"
      :data-active-scene="workspaceSceneLayoutTestId"
      class="workspace-scene-shell flex flex-1 min-h-0 overflow-hidden"
      :class="{ 'workspace-scene-shell--switching': workbenchSwitching }"
    >
      <Transition
        :name="workbenchSceneTransitionName"
        mode="out-in"
        @after-enter="handleWorkbenchSceneTransitionAfterEnter"
      >
        <main
          v-if="displayedWorkbenchMode !== 'final_review'"
          :key="displayedWorkbenchMode"
          :data-testid="displayedWorkbenchMode === 'defense' ? 'workspace-defense-layout' : 'workspace-project-layout'"
          class="workspace-workbench-scene workspace-layout flex flex-1 min-h-0 items-stretch overflow-hidden xl:flex-row"
        >
          <template v-if="displayedWorkbenchMode === 'project'">
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
                :style="{ '--workspace-left-dock-width': `${leftSidebarWidth}px` }"
                :contests="contestSource"
                :selected-resources="selectedResources"
                :recycle-resources="recycleResources"
                :resource-library="resourceLibrary"
                :linked-contest-resource-groups="linkedContestResourceGroups"
                :linked-contest-binding-count="projectSettingsBindings.length"
                :upload-tasks="projectUploadTasks"
                :upload-summary="projectUploadSummary"
                :upload-drawer-open="uploadDrawerOpen"
                :upload-activity-items="projectUploadActivityItems"
                :upload-history-loaded="projectUploadHistoryLoaded"
                :meetings="projectMeetings"
                :active-meeting-id="activeMeetingId"
                :meeting-loading="projectMeetingsFirstLoadLoading"
                :meeting-refreshing="projectMeetingsRefreshing"
                :meeting-mutating="meetingMutating"
                :meeting-runtime-health="meetingRuntimeHealth"
                :project-members="workspaceMembers"
                :outline-sections="workspaceOutlineSections"
                :issue-reports="projectIssueReports"
                :project-issues="projectIssues"
                :issue-loading="issueCenterLoading"
                :project-resources-loading="projectResourcesFirstLoadLoading"
                :project-resources-refreshing="projectResourcesRefreshing"
                :resource-library-loading="resourceLibraryFirstLoadLoading"
                :resource-library-refreshing="resourceLibraryRefreshing"
                :resource-mutating="resourceMutating"
                :has-active-project="Boolean(activeProjectId)"
                :active-project-id="activeProjectId"
                :ai-reasoning="aiReasoning"
                :normalized-info="normalizedInfo"
                :status-line="statusLine"
                :list-loading="listLoading"
                :ai-filtering="aiFiltering"
                :is-admin-view="isAdminView"
                :active-main-tab-id="activeMainTabId"
                :user-email="currentUserEmail"
                :user-avatar-url="me?.user.avatarUrl || ''"
                :workspace-options="workspaceOptions"
                :workspace-can-manage-members="workspaceCanManageMembers"
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
                @switch-workspace="switchWorkspaceFromHeader"
                @open-workspace-home="openWorkspaceHomeFromHeader"
                @open-display-preferences="openDisplayPreferencesFromHeader"
                @open-account-center="openAccountCenterFromHeader"
                @toggle-upload-drawer="openUploadDrawer"
                @create-meeting="createProjectMeeting"
                @select-meeting="selectProjectMeeting"
                @create-collab-resource="createCollabResource"
                @reload-issues="loadProjectIssues"
                @open-resource="openProjectResourcePreview"
                @rename-project-resource="renameProjectResource"
                @download-project-resource="downloadProjectResource"
                @copy-project-resource-name="copyProjectResourceName"
                @share-project-resource="shareProjectResource"
                @duplicate-project-resource="duplicateProjectResource"
                @add-resource-from-library="addResourceFromLibrary"
                @patch-project-resource-tree="patchProjectResourceTree"
                @remove-project-resource="removeProjectResource"
                @remove-project-resources="removeProjectResources"
                @restore-project-resource="restoreProjectResource"
                @purge-project-resource="purgeProjectResource"
                @upload-resources="uploadResourcesToProject"
                @pause-upload-task="pauseUploadTask"
                @resume-upload-task="resumeUploadTask"
                @retry-upload-task="retryUploadTask"
                @cancel-upload-task="cancelUploadTask"
                @rebind-upload-task="requestRebindUploadTask"
                @pause-all-upload-tasks="pauseAllUploadTasks"
                @resume-all-upload-tasks="resumeAllUploadTasks"
                @clear-completed-upload-tasks="clearCompletedUploadTasks"
                @locate-outline-item="locateWorkspaceOutlineItem"
                @update:collapsed="leftSidebarCollapsed = $event"
                @request-context-menu="openWorkspaceContextMenu($event)"
              />

              <button
                v-if="!leftSidebarCollapsed"
                class="workspace-sidebar-resize-handle workspace-sidebar-resize-handle--left"
                type="button"
                aria-label="调整左侧边栏宽度"
                title="拖拽调整左侧边栏宽度"
                @pointerdown="startWorkspaceSidebarResize('left', $event)"
              >
                <span class="workspace-sidebar-resize-handle__thumb" aria-hidden="true" />
              </button>
            </div>

            <WorkspaceMainPanel
              ref="workspaceMainPanelRef"
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
              :active-project-id="activeProjectId"
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
              :workspace-invitation-error="workspaceInvitationError"
              :workspace-seat-limit-save-loading="workspaceSeatLimitSaveLoading"
              :workspace-seat-limit-error="workspaceSeatLimitError"
              :workspace-seat-limit-updated-signal="workspaceSeatLimitUpdatedSignal"
              :open-settings-signal="openSettingsSignal"
              :open-loopy-data-signal="openLoopyDataSignal"
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
              :current-user-avatar-url="me?.user.avatarUrl || ''"
              :is-platform-admin-user="Boolean(me?.user.isPlatformAdmin)"
              :collab-resource-id="collabBindingResourceId"
              :collab-markdown-doc="collabMarkdownDoc"
              :collab-markdown-awareness="collabMarkdownAwareness"
              :collab-draw-value="collabDrawValue"
              :collab-draw-error="collabDrawError"
              :collab-revision="collabRevision"
              :collab-connected="collabConnected"
              :collab-status-text="collabStatusText"
              :collab-preview-loading="collabPreviewLoading"
              :collab-preview-error="collabPreviewError"
              :collab-presence-members="collabPresenceMembers"
              :inline-completion-enabled="canUseInlineCompletion()"
              :inline-completion-request-handler="requestInlineCompletion"
              :inline-completion-accept-handler="acceptInlineCompletion"
              :comment-threads="markdownCommentThreads"
              :active-comment-thread-id="activeMarkdownCommentThreadId"
              :comment-draft-anchor="markdownCommentDraftAnchor"
              :comment-loading="markdownCommentLoading"
              :comment-mutating="markdownCommentMutating"
              :selected-resources="selectedResources"
              :mapping-rows="mappingRows"
              :mapping-loading="mappingFirstLoadLoading"
              :mapping-refreshing="mappingRefreshing"
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
              :project-knowledge-dashboard="projectKnowledgeDashboard"
              :project-knowledge-loading="projectKnowledgeLoading"
              :project-knowledge-error="projectKnowledgeError"
              :project-knowledge-reindexing-target="projectKnowledgeReindexingTarget"
              :project-knowledge-retrying-source-id="projectKnowledgeRetryingSourceId"
              :workspace-display-preferences="workspaceDisplayPreferenceSnapshot"
              :workspace-display-preferences-loading="workspaceDisplayPreferenceLoading"
              :workspace-display-preferences-saving-scope="workspaceDisplayPreferenceSavingScope"
              :workspace-display-preferences-error="workspaceDisplayPreferenceError"
              :project-resource-shares="projectResourceShares"
              :project-resource-shares-loading="projectResourceSharesFirstLoadLoading"
              :meetings="projectMeetings"
              :active-meeting-id="activeMeetingId"
              :active-meeting="activeMeetingDetail"
              :meeting-utterances="activeMeetingUtterances"
              :meeting-live-captions="meetingLiveCaptions"
              :meeting-loading="projectMeetingsFirstLoadLoading"
              :meeting-refreshing="projectMeetingsRefreshing"
              :meeting-detail-loading="meetingDetailDisplayLoading"
              :meeting-detail-refreshing="meetingDetailRefreshing"
              :meeting-mutating="meetingMutating"
              :meeting-join-url="meetingJoinUrl"
              :meeting-join-token="meetingJoinToken"
              :meeting-join-expires-at="meetingJoinExpiresAt"
              :meeting-rtc-server-url="meetingRtcServerUrl"
              :active-meeting-guest-share="activeMeetingGuestShare"
              :meeting-guest-share-loading="meetingGuestShareLoading"
              :meeting-plan-tier="currentWorkspaceMeetingPlanTier"
              :meeting-runtime-health="meetingRuntimeHealth"
              :defense-realtime-state="defenseRealtimeSessionMetaSnapshot"
              :defense-realtime-logs="defenseRealtimeLogs"
              :tone-meta="toneMeta"
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
              @reload-project-knowledge="reloadProjectKnowledge"
              @reindex-project-knowledge="reindexProjectKnowledge"
              @reindex-project-knowledge-source="reindexKnowledgeSource"
              @save-workspace-display-user-override="saveWorkspaceDisplayUserOverride"
              @save-workspace-display-team-default="saveWorkspaceDisplayTeamDefault"
              @reload-workspace-member-management="loadWorkspaceMemberManagement"
              @create-workspace-invitation="createWorkspaceInvitation"
              @prepare-workspace-invitation="workspaceInvitationError = ''"
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
              @end-meeting="handleEndProjectMeeting"
              @create-meeting-guest-share="createProjectMeetingGuestShare"
              @regenerate-meeting-guest-share="regenerateProjectMeetingGuestShare"
              @revoke-meeting-guest-share="revokeProjectMeetingGuestShare"
              @select-meeting="selectProjectMeeting"
              @open-meeting-resource="openProjectResourcePreview"
              @open-resource="openProjectResourcePreview"
              @reconvert-preview="reconvertProjectResourcePreview"
              @download-preview-source="downloadPreviewSource"
              @activate-preview-resource="activateProjectResourceTab"
              @close-preview-resource="closeProjectResourcePreview"
              @update:collab-draw-value="updateCollabDrawContent"
              @request-workflow-canvas-rebuild="requestWorkflowCanvasRebuild"
              @update-collab-cursor="updateCollabCursor"
              @update-collab-selection-status="updateCollabSelectionStatus"
              @markdown-primary-heading-change="handleMarkdownPrimaryHeadingChange"
              @markdown-outline-change="handleMarkdownOutlineChange"
              @markdown-create-comment-from-selection="handleMarkdownCreateCommentFromSelection"
              @markdown-create-comment-from-image="handleMarkdownCreateCommentFromImage"
              @markdown-open-comment-thread="handleMarkdownOpenCommentThread"
              @markdown-request-image-action="handleMarkdownImageAction"
              @markdown-cancel-comment-draft="cancelMarkdownCommentDraft"
              @markdown-reply-comment-thread="replyMarkdownCommentThread"
              @markdown-resolve-comment-thread="resolveMarkdownCommentThread"
              @markdown-reopen-comment-thread="reopenMarkdownCommentThread"
              @markdown-create-comment-thread="createMarkdownCommentThread"
              @request-context-menu="openWorkspaceContextMenu($event)"
            />
          </template>

          <template v-else>
            <section class="workspace-defense-shell flex flex-1 min-h-0 min-w-0 overflow-hidden">
              <div class="workspace-defense-shell__sidebar">
                <WorkspaceDefenseSidebar
                  :contest-name="selectedContest?.name || ''"
                  :track-name="selectedTrack?.name || ''"
                  :session-meta="defenseSessionMetaSnapshot"
                  :session-state="defenseSessionStateSnapshot"
                  :personas="defensePersonas"
                  :rounds="defenseRounds"
                  :linked-meeting="defenseLinkedMeeting"
                  :meeting-runtime-health="meetingRuntimeHealth"
                />
              </div>

              <div class="workspace-defense-shell__stage">
                <WorkspaceDefenseWorkbench
                  :contest-name="selectedContest?.name || ''"
                  :track-name="selectedTrack?.name || ''"
                  :contest="selectedContest"
                  :contest-timelines="defenseContestTimelines"
                  :session-meta="defenseSessionMetaSnapshot"
                  :session-state="defenseSessionStateSnapshot"
                  :personas="defensePersonas"
                  :realtime-state="defenseRealtimeSessionMetaSnapshot"
                  :realtime-logs="defenseRealtimeLogs"
                  :scorecard="defenseScorecard"
                  :summary="defenseSummary"
                  :rounds="defenseRounds"
                  :turns="defenseTurns"
                  :linked-meeting="defenseLinkedMeeting"
                  :meeting-runtime-health="meetingRuntimeHealth"
                  :selected-resource-count="selectedResources.length"
                  @open-agent-def="expandRightSidebar"
                  @start-realtime="startDefenseRealtime"
                  @update-realtime-provider="updateDefenseRealtimeProvider"
                  @update-realtime-media-mode="updateDefenseRealtimeMediaMode"
                  @toggle-realtime-audio="setDefenseRealtimeAudioEnabled"
                  @toggle-realtime-video="setDefenseRealtimeVideoEnabled"
                  @interrupt-realtime="interruptDefenseRealtime"
                  @reconnect-realtime="reconnectDefenseRealtime"
                  @generate-summary="generateDefenseSummary"
                />
              </div>
            </section>
          </template>

          <div
            class="workspace-right-dock"
            :class="{ 'workspace-right-dock--collapsed': rightSidebarCollapsed }"
            :style="{ '--workspace-right-dock-width': `${rightSidebarWidth}px` }"
          >
            <button
              v-if="!rightSidebarCollapsed"
              class="workspace-sidebar-resize-handle workspace-sidebar-resize-handle--right"
              type="button"
              aria-label="调整右侧 AI 栏宽度"
              title="拖拽调整右侧 AI 栏宽度"
              @pointerdown="startWorkspaceSidebarResize('right', $event)"
            >
              <span class="workspace-sidebar-resize-handle__thumb" aria-hidden="true" />
            </button>
            <div
              class="workspace-right-dock__panel"
              :class="{ 'workspace-right-dock__panel--hidden': rightSidebarCollapsed }"
              :aria-hidden="rightSidebarCollapsed ? 'true' : 'false'"
            >
              <WorkspaceRightSidebar
                v-model:chat-input="chatInput"
                :workbench-mode="displayedWorkbenchMode"
                :project-assistant-mode="projectAssistantMode"
                :project-contextual-assistant-label="projectContextualAssistant?.label || ''"
                :project-contextual-assistant-preset="projectContextualAssistant?.preset || ''"
                :project-contextual-assistant-key="projectContextualAssistant?.key || ''"
                :ai-mode="aiMode"
                :sidebar-view="rightSidebarView"
                :tab-spacing-preset="workspaceEffectiveTabSpacingPreset"
                class="min-h-0 overflow-hidden"
                :chat-sessions="chatSessions"
                :open-chat-session-ids="openChatSessionIds"
                :active-chat-session-id="activeChatSessionId"
                :chat-sessions-loading="chatSessionsFirstLoadLoading"
                :chat-sessions-refreshing="chatSessionsRefreshing"
                :chat-session-deleting-id="deletingChatSessionId"
                :chat-messages="chatMessages"
                :chat-messages-loading="chatMessagesFirstLoadLoading"
                :chat-loading="chatLoading"
                :chat-interrupting="chatInterrupting"
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
                :defense-session-meta="defenseSessionMetaSnapshot"
                :defense-session-state="defenseSessionStateSnapshot"
                :defense-realtime-state="defenseRealtimeSessionMetaSnapshot"
                :defense-realtime-logs="defenseRealtimeLogs"
                :defense-stage="defenseStage"
                :defense-turn-count="defenseTurnCount"
                :defense-summary="defenseSummary"
                :defense-personas-loading="defensePersonasLoading"
                :defense-summary-loading="defenseSummaryLoading"
                :selected-contest="selectedContest"
                :selected-track="selectedTrack"
                :selected-resources="selectedResources"
                :comment-threads="markdownCommentThreads"
                :active-comment-thread-id="activeMarkdownCommentThreadId"
                :comment-draft-anchor="markdownCommentDraftAnchor"
                :comment-loading="markdownCommentLoading"
                :comment-mutating="markdownCommentMutating"
                :show-comment-tab="!isMarkdownWorkspaceTabActive"
                :document-resource-title="activeMarkdownResourceTitle"
                :document-selection-text="documentAssistRequestState.selectionText"
                :document-selection-range="documentAssistRequestState.selectionRange"
                :document-resource-id="documentAssistRequestState.resourceId"
                :document-markdown-hash="activeAgentDocDocumentHash"
                :applied-agent-doc-draft-keys="appliedAgentDocDraftKeys"
                :workflow-resource-id="activeWorkflowResourceId"
                :workflow-resource-title="activeWorkflowResourceTitle"
                :workflow-hash="activeWorkflowHash"
                :workflow-page-count="activeWorkflowPageCount"
                :applied-workflow-draft-keys="appliedWorkflowDraftKeys"
                :discarded-workflow-draft-keys="discardedWorkflowDraftKeys"
                :scene-resource-id="activeAgentProtoSceneResourceId"
                :scene-resource-title="activeAgentProtoSceneResourceTitle"
                :scene-hash="activeAgentProtoSceneHash"
                :applied-scene-draft-keys="appliedSceneDraftKeys"
                :discarded-scene-draft-keys="discardedSceneDraftKeys"
                :scene-generate-available="sceneGenerateAvailable"
                :scene-generate-disabled-reason="sceneGenerateDisabledReason"
                :scene-complete-available="sceneCompleteAvailable"
                :scene-complete-disabled-reason="sceneCompleteDisabledReason"
                :scene-refine-available="sceneRefineAvailable"
                :scene-refine-disabled-reason="sceneRefineDisabledReason"
                :scene-restyle-available="sceneRestyleAvailable"
                :scene-restyle-disabled-reason="sceneRestyleDisabledReason"
                :workflow-generate-available="workflowGenerateAvailable"
                :workflow-generate-disabled-reason="workflowGenerateDisabledReason"
                :workflow-complete-available="workflowCompleteAvailable"
                :workflow-complete-disabled-reason="workflowCompleteDisabledReason"
                :workflow-refine-available="workflowRefineAvailable"
                :workflow-refine-disabled-reason="workflowRefineDisabledReason"
                :workflow-restyle-available="workflowRestyleAvailable"
                :workflow-restyle-disabled-reason="workflowRestyleDisabledReason"
                :ai-enabled="currentAiModeAvailable"
                :ai-disabled-reason="currentAiDisabledReason"
                :collapsed="rightSidebarCollapsed"
                @update:project-assistant-mode="updateProjectAssistantMode"
                @update:sidebar-view="rightSidebarView = $event"
                @send-chat="sendChatMessage"
                @interrupt-chat="interruptChatMessage"
                @update:ai-mode="updateWorkspaceAiMode"
                @collapse="collapseRightSidebar"
                @switch-chat-session="switchChatSession"
                @delete-chat-session="deleteChatSession"
                @create-chat-session="startNewChatSession"
                @approve-change="approveAiChange"
                @reject-change="rejectAiChange"
                @import-defense-personas="importDefensePersonas"
                @save-defense-persona="saveDefensePersona"
                @delete-defense-persona="deleteDefensePersona"
                @generate-defense-summary="generateDefenseSummary"
                @start-defense-realtime="startDefenseRealtime"
                @update-defense-realtime-provider="updateDefenseRealtimeProvider"
                @update-defense-realtime-media-mode="updateDefenseRealtimeMediaMode"
                @toggle-defense-realtime-audio="setDefenseRealtimeAudioEnabled"
                @toggle-defense-realtime-video="setDefenseRealtimeVideoEnabled"
                @interrupt-defense-realtime="interruptDefenseRealtime"
                @reconnect-defense-realtime="reconnectDefenseRealtime"
                @submit-issue-report="submitIssueReport"
                @export-issue-report="exportIssueReport"
                @create-comment-thread="createMarkdownCommentThread"
                @reply-comment-thread="replyMarkdownCommentThread"
                @resolve-comment-thread="resolveMarkdownCommentThread"
                @reopen-comment-thread="reopenMarkdownCommentThread"
                @select-comment-thread="handleMarkdownOpenCommentThread"
                @cancel-comment-draft="cancelMarkdownCommentDraft"
                @apply-document-draft="applyAgentDocDraft"
                @request-workflow-draft="requestWorkflowDraftFromSidebar"
                @apply-workflow-draft="applyWorkflowDraft"
                @discard-workflow-draft="discardWorkflowDraft"
                @request-scene-draft="requestSceneDraftFromSidebar"
                @apply-scene-draft="applySceneDraft"
                @discard-scene-draft="discardSceneDraft"
                @open-resource="openProjectResourcePreview"
              />
            </div>
          </div>
        </main>

        <main
          v-else
          :key="displayedWorkbenchMode"
          data-testid="workspace-final-review-layout"
          class="workspace-workbench-scene workspace-final-review-shell flex flex-1 min-h-0 overflow-hidden"
        >
          <button
            data-testid="workspace-final-review-materials-trigger"
            class="workspace-final-review-edge workspace-final-review-edge--left"
            :class="{ 'workspace-final-review-edge--active': finalReviewMaterialsOpen }"
            type="button"
            title="打开终审资料抽屉"
            @click="toggleFinalReviewMaterialsDrawer"
          >
            <span class="material-symbols-outlined workspace-final-review-edge__icon">folder_open</span>
            <span class="workspace-final-review-edge__label">资料</span>
          </button>

          <section class="workspace-final-review-stage">
            <WorkspaceFinalReviewWorkbench
              :contest-name="selectedContest?.name || ''"
              :track-name="selectedTrack?.name || ''"
              :readiness-percent="finalReviewReadinessPercent"
              :resource-count="selectedResources.length"
              :active-share-count="finalReviewActiveShares.length"
              :unresolved-issue-count="finalReviewUnresolvedIssueCount"
              :checklist-items="finalReviewChecklistItems"
              :risk-summary="latestIssueReport?.summary || ''"
              :open-issues="finalReviewOpenIssues"
              :evidence-gaps="finalReviewEvidenceGaps"
              :resources="selectedResources"
              :shares="finalReviewActiveShares"
              :draft-title="formState.title"
              :draft-problem-statement="formState.problemStatement"
              :draft-summary="formState.summary"
              @open-final-review-flow="openFinalReviewFlowFromWorkbench"
              @open-project-settings="openProjectSettingsFromFinalReview"
              @open-dashboard="openDashboardFromFinalReview"
              @open-materials="openMaterialsDrawerFromFinalReview"
              @switch-defense="switchToDefenseWorkbenchFromFinalReview"
            />
          </section>

          <button
            data-testid="workspace-final-review-assistant-trigger"
            class="workspace-final-review-edge workspace-final-review-edge--right"
            :class="{ 'workspace-final-review-edge--active': finalReviewAssistantOpen }"
            type="button"
            title="打开终审助手抽屉"
            @click="toggleRightSidebar"
          >
            <span class="material-symbols-outlined workspace-final-review-edge__icon">auto_awesome</span>
            <span class="workspace-final-review-edge__label">助手</span>
          </button>

          <WorkspaceFinalReviewMaterialsDrawer
            :open="finalReviewMaterialsOpen"
            :resources="selectedResources"
            :shares="finalReviewActiveShares"
            :resources-loading="projectResourcesFirstLoadLoading"
            :resources-refreshing="projectResourcesRefreshing"
            :shares-loading="projectResourceSharesFirstLoadLoading"
            :shares-refreshing="projectResourceSharesRefreshing"
            @close="finalReviewMaterialsOpen = false"
            @open-resource="openResourceFromFinalReview"
          />

          <WorkspaceFinalReviewSidebar
            v-model:chat-input="chatInput"
            :open="finalReviewAssistantOpen"
            :chat-messages="chatMessages"
            :chat-loading="chatLoading"
            :current-user-name="me?.user.username || ''"
            :current-user-avatar-url="me?.user.avatarUrl || ''"
            :risk-summary="latestIssueReport?.summary || ''"
            :open-issues="finalReviewOpenIssues"
            @close="finalReviewAssistantOpen = false"
            @open-resource="openResourceFromFinalReview"
            @send-chat="sendChatMessage"
          />
        </main>
      </Transition>

      <Transition name="workspace-scene-loading-overlay">
        <WorkspaceShellLoadingOverlay
          v-if="workbenchSwitchLoading"
          :progress="workbenchSwitchProgress"
        />
      </Transition>
    </section>

    <WorkspaceStatusBar
      :status-line="statusLine"
      :loading="resourcesLoading"
      :ai-model-label="currentAiModelLabel"
      :ai-status-label="aiStatusLabel"
      :ai-status-tone="aiStatusTone"
      :ai-credits-used="aiCreditsUsed"
      :ai-credits-total="aiCreditsTotal"
      :ai-credits-remaining="aiCreditsRemaining"
      :ai-credits-usage-text="aiCreditsUsageText"
      :ai-credits-remaining-text="aiCreditsRemainingText"
      :ai-billing-label="aiBillingLabel"
      :project-storage-used-bytes="projectUploadStorageUsedBytes"
      :project-storage-limit-bytes="PROJECT_RESOURCE_STORAGE_LIMIT_BYTES"
      :line="statusCursor.line"
      :column="statusCursor.column"
      :selection-length="statusCursor.selectionLength"
      :has-active-project="Boolean(activeProjectId)"
      :loopy-data-progress-percent="projectKnowledgeSummary.overallProgressPercent"
      :loopy-data-health-state="projectKnowledgeDiagnostics.healthState"
      :loopy-data-health-message="projectKnowledgeDiagnostics.healthMessage"
      :loopy-data-runtime-label="loopyDataRuntimeLabel"
      :loopy-data-source-count="projectKnowledgeDiagnostics.sourceCount"
      :loopy-data-task-count="projectKnowledgeDiagnostics.taskCount"
      :loopy-data-chunk-count="projectKnowledgeDiagnostics.chunkCount"
      :loopy-data-last-success-at="projectKnowledgeWorker.lastSuccessAt || ''"
      :loopy-data-last-error="projectKnowledgeWorker.lastError || ''"
      :loopy-data-has-active-work="projectKnowledgeHasActiveWork"
      :loopy-data-disabled="!activeProjectId"
      @open-loopy-data="openLoopyDataPanel"
    />

    <Transition name="workspace-shell-loading-overlay">
      <WorkspaceShellLoadingOverlay
        v-if="workspaceShellLoading"
        :progress="workspaceShellLoadingProgress"
      />
    </Transition>

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

    <a-modal
      v-model:visible="workflowCanvasRebuildConfirmVisible"
      title="确认重建流程画布？"
      width="460px"
      :footer="false"
      :mask-closable="false"
      @cancel="cancelWorkflowCanvasRebuild"
    >
      <div class="space-y-4">
        <p class="text-sm text-slate-600 leading-6 m-0 whitespace-pre-line">
          这会用新的默认 draw.io 流程画布覆盖当前 workflow 资源；旧版自由绘制数据不会自动迁移。
        </p>

        <div class="flex gap-2 justify-end">
          <a-button @click="cancelWorkflowCanvasRebuild">
            取消
          </a-button>
          <a-button type="primary" @click="confirmWorkflowCanvasRebuild">
            重建流程画布
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

    <UiContextMenu
      :visible="workspaceContextMenu.visible"
      :items="workspaceContextMenu.items"
      :anchor-point="workspaceContextMenu.anchorPoint"
      :anchor-el="workspaceContextMenu.anchorEl"
      :font-size-preset="workspaceEffectiveFontSizePreset"
      :spacing-preset="workspaceEffectiveTabSpacingPreset"
      @select="handleWorkspaceContextMenuSelect"
      @close="closeWorkspaceContextMenu()"
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
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  position: relative;
  isolation: isolate;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
}

.workspace-shell--resizing {
  user-select: none;
  cursor: col-resize;
}

.workspace-shell--resizing .workspace-right-dock,
.workspace-shell--resizing .workspace-right-dock__panel,
.workspace-shell--resizing :deep(.workspace-left-dock),
.workspace-shell--resizing :deep(.workspace-left-panel) {
  transition: none !important;
}

.workspace-scene-shell {
  position: relative;
  min-width: 0;
  isolation: isolate;
}

.workspace-scene-shell--switching {
  pointer-events: none;
}

.workspace-workbench-scene {
  min-width: 0;
  min-height: 0;
  position: relative;
}

.workspace-workbench-scene-forward-enter-active,
.workspace-workbench-scene-forward-leave-active,
.workspace-workbench-scene-backward-enter-active,
.workspace-workbench-scene-backward-leave-active {
  transition:
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.workspace-workbench-scene-forward-enter-from {
  opacity: 1;
  transform: translateX(100%);
}

.workspace-workbench-scene-forward-leave-to {
  opacity: 1;
  transform: translateX(-100%);
}

.workspace-workbench-scene-backward-enter-from {
  opacity: 1;
  transform: translateX(-100%);
}

.workspace-workbench-scene-backward-leave-to {
  opacity: 1;
  transform: translateX(100%);
}

.workspace-workbench-scene-forward-enter-to,
.workspace-workbench-scene-forward-leave-from,
.workspace-workbench-scene-backward-enter-to,
.workspace-workbench-scene-backward-leave-from {
  opacity: 1;
  transform: translateX(0);
}

.workspace-layout {
  min-width: 0;
  position: relative;
}

.workspace-defense-shell {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background:
    radial-gradient(circle at top left, rgba(239, 204, 84, 0.14), transparent 28%),
    linear-gradient(180deg, #f6f8fc 0%, #eef3fb 100%);
}

.workspace-defense-shell__sidebar {
  flex: 0 0 360px;
  width: 360px;
  min-width: 320px;
  max-width: 380px;
  border-right: 1px solid rgba(213, 223, 238, 0.94);
  overflow: hidden;
}

.workspace-defense-shell__stage {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.workspace-final-review-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.14), transparent 26%),
    linear-gradient(180deg, #f8fbff 0%, #f4f8ff 100%);
}

.workspace-final-review-stage {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 20px 68px;
}

.workspace-final-review-edge {
  position: absolute;
  top: 50%;
  z-index: 18;
  width: 42px;
  min-height: 112px;
  border: 1px solid rgba(205, 217, 235, 0.96);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: #3b5479;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transform: translateY(-50%);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;
}

.workspace-final-review-edge:hover {
  border-color: #b6c9e7;
  background: rgba(255, 255, 255, 0.98);
  color: #24497f;
}

.workspace-final-review-edge--active {
  border-color: #8fb1e8;
  background: #eef4ff;
  color: #1d4ed8;
}

.workspace-final-review-edge--left {
  left: 12px;
}

.workspace-final-review-edge--right {
  right: 12px;
}

.workspace-final-review-edge__icon {
  font-size: 20px;
  line-height: 1;
  font-variation-settings:
    'FILL' 0,
    'wght' 320,
    'opsz' 24;
}

.workspace-final-review-edge__label {
  color: currentColor;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  writing-mode: vertical-rl;
}

.workspace-side-anchor {
  position: relative;
  display: flex;
  flex-shrink: 0;
  min-height: 0;
  overflow: visible;
}

.workspace-sidebar-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 20;
  width: 16px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.workspace-sidebar-resize-handle--left {
  right: -8px;
}

.workspace-sidebar-resize-handle--right {
  left: -8px;
}

.workspace-sidebar-resize-handle__thumb {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 72px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.24);
  transform: translate(-50%, -50%);
  transition:
    background-color 0.18s ease,
    box-shadow 0.18s ease;
}

.workspace-sidebar-resize-handle:hover .workspace-sidebar-resize-handle__thumb,
.workspace-sidebar-resize-handle:focus-visible .workspace-sidebar-resize-handle__thumb,
.workspace-shell--resizing .workspace-sidebar-resize-handle__thumb {
  background: rgba(59, 130, 246, 0.48);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
}

@media (max-width: 1279px) {
  .workspace-defense-shell {
    flex-direction: column;
  }

  .workspace-defense-shell__sidebar {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    max-width: none;
    border-right: none;
    border-bottom: 1px solid rgba(213, 223, 238, 0.94);
  }

  .workspace-defense-shell__stage {
    padding: 16px;
  }

  .workspace-sidebar-resize-handle {
    display: none;
  }
}

.workspace-right-dock {
  position: relative;
  display: flex;
  flex: 0 0 var(--workspace-right-dock-width, 22rem);
  width: var(--workspace-right-dock-width, 22rem);
  min-width: var(--workspace-right-dock-width, 22rem);
  max-width: var(--workspace-right-dock-width, 22rem);
  min-height: 0;
  align-items: stretch;
  justify-content: flex-end;
  overflow: visible;
  transition:
    width 0.22s ease,
    min-width 0.22s ease,
    max-width 0.22s ease,
    flex-basis 0.22s ease;
}

.workspace-right-dock--collapsed {
  flex-basis: 0;
  width: 0;
  min-width: 0;
  max-width: 0;
}

.workspace-right-dock__panel {
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  opacity: 1;
  transform: translateX(0) scale(1);
  transform-origin: right center;
  transition:
    opacity 0.18s ease,
    transform 0.22s ease,
    visibility 0.22s linear;
}

.workspace-right-dock__panel--hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateX(18px) scale(0.985);
}

:deep(.workspace-shell-loading-overlay-enter-active),
:deep(.workspace-shell-loading-overlay-leave-active) {
  transition:
    opacity 0.26s ease,
    backdrop-filter 0.18s ease,
    -webkit-backdrop-filter 0.18s ease;
}

:deep(.workspace-shell-loading-overlay-enter-from),
:deep(.workspace-shell-loading-overlay-leave-to) {
  opacity: 0;
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
}

:deep(.workspace-shell-loading-overlay-enter-to),
:deep(.workspace-shell-loading-overlay-leave-from) {
  opacity: 1;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

:deep(.workspace-scene-loading-overlay-enter-active),
:deep(.workspace-scene-loading-overlay-leave-active) {
  transition:
    opacity 0.18s ease,
    backdrop-filter 0.18s ease,
    -webkit-backdrop-filter 0.18s ease;
}

:deep(.workspace-scene-loading-overlay-enter-from),
:deep(.workspace-scene-loading-overlay-leave-to) {
  opacity: 0;
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
}

:deep(.workspace-scene-loading-overlay-enter-to),
:deep(.workspace-scene-loading-overlay-leave-from) {
  opacity: 1;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

@media (max-width: 960px) {
  .workspace-final-review-stage {
    padding: 18px 58px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-workbench-scene-forward-enter-active,
  .workspace-workbench-scene-forward-leave-active,
  .workspace-workbench-scene-backward-enter-active,
  .workspace-workbench-scene-backward-leave-active {
    transition:
      opacity 0.16s ease,
      transform 0.16s ease;
  }

  .workspace-workbench-scene-forward-enter-from,
  .workspace-workbench-scene-forward-leave-to,
  .workspace-workbench-scene-backward-enter-from,
  .workspace-workbench-scene-backward-leave-to {
    opacity: 0;
    transform: translateX(0);
  }
}
</style>
