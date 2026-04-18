import type { ComputedRef, Ref } from 'vue'
import type {
  ApiResponse,
  ProjectMeetingDetail,
  ProjectMeetingMode,
  ProjectMeetingUtterance,
  ProjectWorkbenchMode,
  ProjectWorkspaceAssistantMode,
  ProjectWorkspaceAiTabsPreference,
  ProjectWorkspaceRightSidebarView,
  ProjectWorkspaceViewDeviceStatePayload,
  ProjectWorkspaceViewPreference,
  ProjectWorkspaceViewState,
  Resource,
  TeamLastProjectPreference,
  WorkspaceAiMode,
  WorkspaceMeetingCreateTabId,
  WorkspaceOpenTabState,
} from '~~/shared/types/domain'
import { onBeforeUnmount, reactive, ref } from 'vue'
import {
  normalizeWorkspaceLeftSidebarWidth,
  normalizeWorkspaceRightSidebarWidth,
} from '~~/shared/utils/workspace-layout'
import { normalizeQueryValue as normalizeQueryParam } from '~/composables/team-ui'
import { useApiEndpoint } from '~/composables/useApiEndpoint'
import { workspaceDetailPath } from '~/composables/useWorkspaceProjectRoute'
import { isDesignCanvasResource } from '~/utils/workspace-left-sidebar-helpers'

export interface TopicBoardConfirmOptions {
  title: string
  content: string
  okText?: string
  cancelText?: string
}

interface TopicBoardConfirmState extends Required<TopicBoardConfirmOptions> {
  visible: boolean
  resolver: ((value: boolean) => void) | null
}

export type DeviceRestoreChoice = 'sync' | 'keep'
export type WorkspaceLeftSidebarCommandModuleId = 'resource_manager' | 'analysis'
export type WorkspaceMainTabId = WorkspaceOpenTabState
export type WorkspaceMeetingTabId = `meeting:${string}`
export type WorkspaceMeetingCreateLocalTabId = WorkspaceMeetingCreateTabId
export type WorkspaceWorkbenchMode = ProjectWorkbenchMode
export type WorkspacePrimaryAiMode = Exclude<WorkspaceAiMode, 'defense'>

interface DeviceRestoreConfirmState {
  visible: boolean
  title: string
  content: string
  resolver: ((value: DeviceRestoreChoice) => void) | null
}

interface UseWorkspaceProjectWorkbenchOptions {
  openMainTabs: Ref<WorkspaceMainTabId[]>
  activeMainTabId: Ref<WorkspaceMainTabId | ''>
  leftSidebarCollapsed: Ref<boolean>
  rightSidebarCollapsed: Ref<boolean> | ComputedRef<boolean>
  setRightSidebarUserCollapsed: (nextCollapsed: boolean, options?: { suppressPersist?: boolean }) => void
  collapseRightSidebar: () => void
  expandRightSidebar: () => void
  workbenchMode: Ref<WorkspaceWorkbenchMode>
  aiMode: Ref<WorkspaceAiMode>
  lastPrimaryAiMode: Ref<WorkspacePrimaryAiMode>
  finalReviewMaterialsOpen: Ref<boolean>
  finalReviewAssistantOpen: Ref<boolean>
  preFinalReviewLeftCollapsed: Ref<boolean>
  preFinalReviewRightCollapsed: Ref<boolean>
  preFinalReviewActiveMainTabId: Ref<WorkspaceMainTabId | ''>
  preFinalReviewOpenTabs: Ref<WorkspaceMainTabId[]>
}

export interface HydratedProjectWorkspaceViewStateResult {
  state: ProjectWorkspaceViewState
  bundle: ProjectWorkspaceViewDeviceStatePayload | null
  hasManagedQuery: boolean
  legacyDesignUnavailable: boolean
}

interface UseWorkspaceProjectViewStateOptions {
  activeWorkspaceId: Ref<string> | ComputedRef<string>
  routeWorkspaceId: Ref<string> | ComputedRef<string>
  routeProjectId: Ref<string> | ComputedRef<string>
  highlightedProjectId: Ref<string> | ComputedRef<string>
  resources: Ref<Resource[]> | ComputedRef<Resource[]>
  openMainTabs: Ref<WorkspaceMainTabId[]>
  activeMainTabId: Ref<WorkspaceMainTabId | ''>
  previewResourceId: Ref<string>
  selectedContestId: Ref<string>
  selectedTrackId: Ref<string>
  openChatSessionIds: Ref<string[]>
  activeChatSessionId: Ref<string>
  activeMeetingId: Ref<string>
  activeMeetingDetail: Ref<ProjectMeetingDetail | null>
  activeMeetingUtterances: Ref<ProjectMeetingUtterance[]>
  meetingLiveCaptions: Ref<unknown[]>
  leftSidebarCollapsed: Ref<boolean>
  leftSidebarWidth: Ref<number>
  defaultLeftSidebarWidth: Ref<number> | ComputedRef<number>
  rightSidebarUserCollapsed: Ref<boolean>
  rightSidebarWidth: Ref<number>
  defaultRightSidebarWidth: Ref<number> | ComputedRef<number>
  projectAssistantMode: Ref<ProjectWorkspaceAssistantMode>
  rightSidebarView: Ref<ProjectWorkspaceRightSidebarView>
  setRightSidebarUserCollapsed: (nextCollapsed: boolean, options?: { suppressPersist?: boolean }) => void
  workbenchMode: Ref<WorkspaceWorkbenchMode>
  aiMode: Ref<WorkspaceAiMode>
  lastPrimaryAiMode: Ref<WorkspacePrimaryAiMode>
  rememberPreFinalReviewWorkbenchState: (payload?: {
    leftSidebarCollapsed?: boolean
    rightSidebarCollapsed?: boolean
    activeMainTabId?: WorkspaceMainTabId | ''
    openMainTabs?: WorkspaceMainTabId[]
  }) => void
  closeFinalReviewDrawers: () => void
  clearMeetingJoinSession: () => void
  ensureWorkspaceDeviceId: () => string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function parseTimestamp(value: unknown): number {
  const timestamp = Date.parse(normalizeString(value))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function listRawWorkspaceTabIds(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => normalizeString(item))
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeOpenChatSessionIds(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  const normalized: string[] = []
  const used = new Set<string>()
  for (const item of value) {
    const sessionId = normalizeString(item)
    if (!sessionId || used.has(sessionId))
      continue
    normalized.push(sessionId)
    used.add(sessionId)
  }

  return normalized.slice(-8)
}

function resolveLegacyDesignResourceId(
  resources: Resource[],
  preferredResourceId: unknown,
): string {
  const preferredId = normalizeString(preferredResourceId)
  if (preferredId) {
    const preferredResource = resources.find(item => normalizeString(item.id) === preferredId) || null
    if (isDesignCanvasResource(preferredResource))
      return preferredId
  }

  const legacyDesignResource = [...resources]
    .filter(resource => isDesignCanvasResource(resource))
    .sort((left, right) => {
      const leftCreatedAt = parseTimestamp(left.createdAt)
      const rightCreatedAt = parseTimestamp(right.createdAt)
      if (leftCreatedAt !== rightCreatedAt)
        return leftCreatedAt - rightCreatedAt
      return normalizeString(left.id).localeCompare(normalizeString(right.id))
    })
    .at(0) || null

  return legacyDesignResource?.id || ''
}

function migrateLegacyDesignWorkspaceState(
  value: Partial<ProjectWorkspaceViewState> | Record<string, unknown> | null | undefined,
  resources: Resource[],
): {
  state: Partial<ProjectWorkspaceViewState>
  legacyDesignUnavailable: boolean
} {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {}
  const rawTabIds = listRawWorkspaceTabIds(source.mainTabs)
  const requestedActiveTabId = normalizeString(source.activeMainTabId).toLowerCase()
  const hasLegacyDesignTab = rawTabIds.includes('design')
  const requestedActiveLegacyDesign = requestedActiveTabId === 'design'

  if (!hasLegacyDesignTab && !requestedActiveLegacyDesign) {
    return {
      state: source as Partial<ProjectWorkspaceViewState>,
      legacyDesignUnavailable: false,
    }
  }

  const mappedDesignResourceId = resolveLegacyDesignResourceId(resources, source.previewResourceId)
  const nextTabIds = rawTabIds.filter(tabId => tabId !== 'design' && isWorkspaceMainTabId(tabId))

  if (hasLegacyDesignTab && mappedDesignResourceId) {
    nextTabIds.push(createResourceTabId(mappedDesignResourceId))
  }

  const nextState: Partial<ProjectWorkspaceViewState> = {
    ...(source as Partial<ProjectWorkspaceViewState>),
    mainTabs: normalizeWorkspaceMainTabIds(nextTabIds as WorkspaceOpenTabState[], {
      allowEmpty: true,
    }),
  }

  if (!requestedActiveLegacyDesign) {
    return {
      state: nextState,
      legacyDesignUnavailable: false,
    }
  }

  if (mappedDesignResourceId) {
    nextState.activeMainTabId = createResourceTabId(mappedDesignResourceId)
    nextState.previewResourceId = mappedDesignResourceId
    return {
      state: nextState,
      legacyDesignUnavailable: false,
    }
  }

  nextState.activeMainTabId = 'dashboard'
  nextState.previewResourceId = ''
  nextState.mainTabs = normalizeWorkspaceMainTabIds([
    'dashboard',
    ...nextTabIds as WorkspaceOpenTabState[],
  ], {
    allowEmpty: true,
  })

  return {
    state: nextState,
    legacyDesignUnavailable: true,
  }
}

export function createResourceTabId(resourceId: string): WorkspaceMainTabId {
  return `resource:${resourceId}` as WorkspaceMainTabId
}

export function createMeetingTabId(meetingId: string): WorkspaceMeetingTabId {
  return `meeting:${meetingId}` as WorkspaceMeetingTabId
}

export function createMeetingCreateTabId(mode: ProjectMeetingMode): WorkspaceMeetingCreateLocalTabId {
  return `meeting-create:${mode}` as WorkspaceMeetingCreateLocalTabId
}

export function resolveMeetingIdFromTabId(tabId: string): string {
  return tabId.startsWith('meeting:') ? tabId.slice('meeting:'.length) : ''
}

export function isWorkspaceMainTabId(value: string): value is WorkspaceMainTabId {
  return ['dashboard', 'meeting', 'members', 'flow', 'settings', 'loopy_data'].includes(value)
    || (value.startsWith('meeting:') && value.length > 'meeting:'.length)
    || value === 'meeting-create:audio'
    || value === 'meeting-create:video'
    || (value.startsWith('resource:') && value.length > 'resource:'.length)
}

export function normalizeWorkspaceMainTabIds(
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

export function normalizeWorkspaceMainTabId(
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

export function normalizeProjectWorkbenchMode(value: unknown): WorkspaceWorkbenchMode {
  const normalized = normalizeString(value)
  if (normalized === 'defense' || normalized === 'final_review')
    return normalized
  return 'project'
}

function normalizeProjectWorkspaceAssistantMode(value: unknown): ProjectWorkspaceAssistantMode {
  return normalizeString(value) === 'dialog_ask' ? 'dialog_ask' : 'contextual'
}

function normalizeProjectWorkspaceRightSidebarView(value: unknown): ProjectWorkspaceRightSidebarView {
  return normalizeString(value) === 'comments' ? 'comments' : 'ai'
}

export function createDefaultProjectWorkspaceViewState(): ProjectWorkspaceViewState {
  return {
    workbenchMode: 'project',
    mainTabs: ['dashboard'],
    activeMainTabId: 'dashboard',
    previewResourceId: '',
    selectedContestId: '',
    selectedTrackId: '',
    openChatSessionIds: [],
    activeChatSessionId: '',
    activeMeetingId: '',
    projectAssistantMode: 'contextual',
    rightSidebarView: 'ai',
    leftSidebarWidth: normalizeWorkspaceLeftSidebarWidth(null),
    rightSidebarWidth: normalizeWorkspaceRightSidebarWidth(null),
    leftSidebarCollapsed: true,
    rightSidebarCollapsed: true,
  }
}

function applyPersonalAiTabsFallback(
  state: ProjectWorkspaceViewState,
  personalAiTabs: ProjectWorkspaceAiTabsPreference | null | undefined,
): ProjectWorkspaceViewState {
  if (!personalAiTabs)
    return state
  if (state.openChatSessionIds.length > 0 || state.activeChatSessionId)
    return state

  return normalizeProjectWorkspaceViewState({
    ...state,
    openChatSessionIds: personalAiTabs.payload.openChatSessionIds,
    activeChatSessionId: personalAiTabs.payload.activeChatSessionId,
  })
}

export function normalizeProjectWorkspaceViewState(
  value: Partial<ProjectWorkspaceViewState> | null | undefined,
): ProjectWorkspaceViewState {
  const source = value || {}
  const allowEmptyMainTabs = Array.isArray(source.mainTabs)
  const mainTabs = normalizeWorkspaceMainTabIds(source.mainTabs, { allowEmpty: allowEmptyMainTabs })
  let previewResourceId = normalizeString(source.previewResourceId)
  let activeMeetingId = normalizeString(source.activeMeetingId)
  const activeChatSessionId = normalizeString(source.activeChatSessionId)
  const openChatSessionIds = normalizeOpenChatSessionIds(source.openChatSessionIds)

  const requestedActiveTabId = normalizeString(source.activeMainTabId)
  if (!previewResourceId && requestedActiveTabId.startsWith('resource:'))
    previewResourceId = requestedActiveTabId.slice('resource:'.length)
  if (!activeMeetingId && requestedActiveTabId.startsWith('meeting:'))
    activeMeetingId = resolveMeetingIdFromTabId(requestedActiveTabId)

  if (activeChatSessionId && !openChatSessionIds.includes(activeChatSessionId))
    openChatSessionIds.push(activeChatSessionId)

  if (previewResourceId) {
    const previewTabId = createResourceTabId(previewResourceId)
    if (!mainTabs.includes(previewTabId))
      mainTabs.push(previewTabId)
  }

  const normalizedMainTabs = normalizeWorkspaceMainTabIds(mainTabs, { allowEmpty: allowEmptyMainTabs })

  return {
    workbenchMode: normalizeProjectWorkbenchMode(source.workbenchMode),
    mainTabs: normalizedMainTabs,
    activeMainTabId: normalizeWorkspaceMainTabId(source.activeMainTabId, normalizedMainTabs, {
      fallbackTabId: allowEmptyMainTabs ? '' : 'dashboard',
    }),
    previewResourceId,
    selectedContestId: normalizeString(source.selectedContestId),
    selectedTrackId: normalizeString(source.selectedTrackId),
    openChatSessionIds: normalizeOpenChatSessionIds(openChatSessionIds),
    activeChatSessionId,
    activeMeetingId,
    projectAssistantMode: normalizeProjectWorkspaceAssistantMode(source.projectAssistantMode),
    rightSidebarView: normalizeProjectWorkspaceRightSidebarView(source.rightSidebarView),
    leftSidebarWidth: normalizeWorkspaceLeftSidebarWidth(source.leftSidebarWidth),
    rightSidebarWidth: normalizeWorkspaceRightSidebarWidth(source.rightSidebarWidth),
    leftSidebarCollapsed: Boolean(source.leftSidebarCollapsed),
    rightSidebarCollapsed: Boolean(source.rightSidebarCollapsed),
  }
}

export function sanitizeProjectWorkspaceViewState(
  value: ProjectWorkspaceViewState,
  resources: Resource[],
): ProjectWorkspaceViewState {
  const nextState = normalizeProjectWorkspaceViewState(value)
  const validResourceIdSet = new Set(resources.map(item => normalizeString(item.id)).filter(Boolean))

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

export function isProjectWorkspaceViewStateEqual(
  left: ProjectWorkspaceViewState,
  right: ProjectWorkspaceViewState,
): boolean {
  return (
    left.workbenchMode === right.workbenchMode
    && left.activeMainTabId === right.activeMainTabId
    && left.previewResourceId === right.previewResourceId
    && left.selectedContestId === right.selectedContestId
    && left.selectedTrackId === right.selectedTrackId
    && left.openChatSessionIds.length === right.openChatSessionIds.length
    && left.openChatSessionIds.every((item, index) => item === right.openChatSessionIds[index])
    && left.activeChatSessionId === right.activeChatSessionId
    && left.activeMeetingId === right.activeMeetingId
    && left.projectAssistantMode === right.projectAssistantMode
    && left.rightSidebarView === right.rightSidebarView
    && left.leftSidebarWidth === right.leftSidebarWidth
    && left.rightSidebarWidth === right.rightSidebarWidth
    && left.leftSidebarCollapsed === right.leftSidebarCollapsed
    && left.rightSidebarCollapsed === right.rightSidebarCollapsed
    && left.mainTabs.length === right.mainTabs.length
    && left.mainTabs.every((item, index) => item === right.mainTabs[index])
  )
}

const PROJECT_VIEW_STATE_QUERY_KEYS = ['wb', 'tab', 'tabs', 'res', 'contest', 'track', 'sessions', 'session', 'meeting', 'ls', 'rs', 'panel'] as const

function readString(source: Ref<string> | ComputedRef<string>): string {
  return normalizeString(source.value)
}

function isTruthyQueryFlag(value: unknown): boolean {
  const normalized = normalizeQueryParam(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export function useWorkspaceProjectWorkbench(options: UseWorkspaceProjectWorkbenchOptions) {
  function rememberPreFinalReviewWorkbenchState(payload: {
    leftSidebarCollapsed?: boolean
    rightSidebarCollapsed?: boolean
    activeMainTabId?: WorkspaceMainTabId | ''
    openMainTabs?: WorkspaceMainTabId[]
  } = {}): void {
    options.preFinalReviewLeftCollapsed.value = payload.leftSidebarCollapsed ?? options.leftSidebarCollapsed.value
    options.preFinalReviewRightCollapsed.value = payload.rightSidebarCollapsed ?? options.rightSidebarCollapsed.value
    options.preFinalReviewOpenTabs.value = normalizeWorkspaceMainTabIds(
      payload.openMainTabs ?? options.openMainTabs.value,
      { allowEmpty: true },
    )
    options.preFinalReviewActiveMainTabId.value = normalizeWorkspaceMainTabId(
      payload.activeMainTabId ?? options.activeMainTabId.value,
      options.preFinalReviewOpenTabs.value,
      {
        fallbackTabId: options.preFinalReviewOpenTabs.value[0] || '',
      },
    )
  }

  function restorePreFinalReviewWorkbenchState(payload: { suppressPersist?: boolean } = {}): void {
    options.openMainTabs.value = normalizeWorkspaceMainTabIds(options.preFinalReviewOpenTabs.value, { allowEmpty: true })
    options.activeMainTabId.value = normalizeWorkspaceMainTabId(
      options.preFinalReviewActiveMainTabId.value,
      options.openMainTabs.value,
      {
        fallbackTabId: options.openMainTabs.value[0] || '',
      },
    )
    options.leftSidebarCollapsed.value = options.preFinalReviewLeftCollapsed.value
    options.setRightSidebarUserCollapsed(options.preFinalReviewRightCollapsed.value, {
      suppressPersist: payload.suppressPersist,
    })
  }

  function closeFinalReviewDrawers(): void {
    options.finalReviewMaterialsOpen.value = false
    options.finalReviewAssistantOpen.value = false
  }

  function toggleFinalReviewMaterialsDrawer(): void {
    options.finalReviewMaterialsOpen.value = !options.finalReviewMaterialsOpen.value
  }

  function toggleFinalReviewAssistantDrawer(): void {
    options.finalReviewAssistantOpen.value = !options.finalReviewAssistantOpen.value
  }

  function toggleRightSidebar(): void {
    if (options.workbenchMode.value === 'final_review') {
      toggleFinalReviewAssistantDrawer()
      return
    }

    if (options.rightSidebarCollapsed.value) {
      options.expandRightSidebar()
      return
    }
    options.collapseRightSidebar()
  }

  function ensureWorkspaceMainTabOpen(tabId: WorkspaceMainTabId, payload: { activate?: boolean } = {}): void {
    const normalizedTabId = normalizeString(tabId) as WorkspaceMainTabId
    if (!isWorkspaceMainTabId(normalizedTabId))
      return

    if (!options.openMainTabs.value.includes(normalizedTabId)) {
      options.openMainTabs.value = normalizeWorkspaceMainTabIds([...options.openMainTabs.value, normalizedTabId], {
        allowEmpty: true,
      })
    }

    if (payload.activate !== false)
      options.activeMainTabId.value = normalizedTabId
  }

  function ensureMeetingDetailTabOpen(meetingId: string, payload: { activate?: boolean } = {}): WorkspaceMeetingTabId | '' {
    const normalizedMeetingId = normalizeString(meetingId)
    if (!normalizedMeetingId)
      return ''

    const tabId = createMeetingTabId(normalizedMeetingId)
    ensureWorkspaceMainTabOpen(tabId, payload)
    return tabId
  }

  function ensureMeetingCreateTabOpen(mode: ProjectMeetingMode, payload: { activate?: boolean } = {}): WorkspaceMeetingCreateLocalTabId {
    const tabId = createMeetingCreateTabId(mode)
    ensureWorkspaceMainTabOpen(tabId, payload)
    return tabId
  }

  return {
    rememberPreFinalReviewWorkbenchState,
    restorePreFinalReviewWorkbenchState,
    closeFinalReviewDrawers,
    toggleFinalReviewMaterialsDrawer,
    toggleFinalReviewAssistantDrawer,
    toggleRightSidebar,
    ensureWorkspaceMainTabOpen,
    ensureMeetingDetailTabOpen,
    ensureMeetingCreateTabOpen,
  }
}

export function useWorkspaceProjectViewState(options: UseWorkspaceProjectViewStateOptions) {
  const route = useRoute()
  const { endpoint } = useApiEndpoint()

  const projectWorkspaceViewHydrating = ref(false)
  const projectWorkspaceModeHydrating = ref(false)
  const projectWorkspaceViewReady = ref(false)

  let projectWorkspaceViewPersistTimer: ReturnType<typeof setTimeout> | null = null

  function buildDefaultProjectWorkspaceViewState(): ProjectWorkspaceViewState {
    return normalizeProjectWorkspaceViewState({
      ...createDefaultProjectWorkspaceViewState(),
      leftSidebarWidth: options.defaultLeftSidebarWidth.value,
      rightSidebarWidth: options.defaultRightSidebarWidth.value,
    })
  }

  function buildProjectWorkspaceViewStateFromRefs(): ProjectWorkspaceViewState {
    return normalizeProjectWorkspaceViewState({
      workbenchMode: options.workbenchMode.value,
      mainTabs: options.openMainTabs.value,
      activeMainTabId: options.activeMainTabId.value,
      previewResourceId: options.previewResourceId.value,
      selectedContestId: options.selectedContestId.value,
      selectedTrackId: options.selectedTrackId.value,
      openChatSessionIds: options.openChatSessionIds.value,
      activeChatSessionId: options.activeChatSessionId.value,
      activeMeetingId: options.activeMeetingId.value,
      projectAssistantMode: options.projectAssistantMode.value,
      rightSidebarView: options.rightSidebarView.value,
      leftSidebarWidth: options.leftSidebarWidth.value,
      rightSidebarWidth: options.rightSidebarWidth.value,
      leftSidebarCollapsed: options.leftSidebarCollapsed.value,
      rightSidebarCollapsed: options.rightSidebarUserCollapsed.value,
    })
  }

  function sanitizeViewState(
    value: ProjectWorkspaceViewState,
  ): ProjectWorkspaceViewState {
    return sanitizeProjectWorkspaceViewState(value, options.resources.value)
  }

  function parseProjectWorkspaceViewStateFromQuery(): {
    hasManagedQuery: boolean
    state: Partial<ProjectWorkspaceViewState>
    legacyDesignUnavailable: boolean
  } {
    const hasManagedQuery = PROJECT_VIEW_STATE_QUERY_KEYS.some(key => key in route.query)
    const hasManagedTabsQuery = ['tabs', 'tab', 'res', 'panel'].some(key => key in route.query)
    const chatSessionItems = normalizeQueryParam(route.query.sessions)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 8)
    const tabItems = normalizeQueryParam(route.query.tabs)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 8)

    const panel = normalizeQueryParam(route.query.panel).toLowerCase()
    let legacyTabId = ''
    if (panel === 'members' || panel === 'settings' || panel === 'meeting' || panel === 'flow')
      legacyTabId = panel
    else if (panel === 'design')
      legacyTabId = 'design'

    const rawActiveMainTabId = normalizeString(route.query.tab) || legacyTabId
    const rawPreviewResourceId = normalizeString(route.query.res)
    const migrated = migrateLegacyDesignWorkspaceState({
      mainTabs: hasManagedTabsQuery ? tabItems : undefined,
      activeMainTabId: rawActiveMainTabId,
      previewResourceId: rawPreviewResourceId,
    }, options.resources.value)
    const activeMainTabId = normalizeString(migrated.state.activeMainTabId)
    const previewResourceId = normalizeString(migrated.state.previewResourceId)
    const tabs = normalizeWorkspaceMainTabIds(
      (migrated.state.mainTabs as WorkspaceOpenTabState[] | undefined) || [],
      { allowEmpty: true },
    )
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
      legacyDesignUnavailable: migrated.legacyDesignUnavailable,
      state: {
        workbenchMode: normalizeProjectWorkbenchMode(route.query.wb),
        mainTabs: hasManagedTabsQuery ? normalizeWorkspaceMainTabIds(tabs, { allowEmpty: true }) : undefined,
        activeMainTabId: isWorkspaceMainTabId(activeMainTabId) ? activeMainTabId : '',
        previewResourceId,
        selectedContestId: normalizeString(route.query.contest),
        selectedTrackId: normalizeString(route.query.track),
        openChatSessionIds: normalizeOpenChatSessionIds(chatSessionItems),
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

    if (normalized.workbenchMode !== 'project')
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
    if (normalized.openChatSessionIds.length > 0)
      query.sessions = normalized.openChatSessionIds.join(',')
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
    const deviceId = options.ensureWorkspaceDeviceId()
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
    const deviceId = options.ensureWorkspaceDeviceId()
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
      path: workspaceDetailPath(readString(options.routeWorkspaceId), readString(options.routeProjectId)),
      query: Object.keys(nextQuery).length > 0 ? nextQuery : undefined,
      hash: route.hash || undefined,
    }, { replace: true })
  }

  function clearProjectWorkspaceViewPersistTimer(): void {
    if (!projectWorkspaceViewPersistTimer)
      return
    clearTimeout(projectWorkspaceViewPersistTimer)
    projectWorkspaceViewPersistTimer = null
  }

  function applyProjectWorkspaceViewState(state: ProjectWorkspaceViewState): void {
    const normalized = sanitizeViewState(state)
    const nextMeetingId = normalizeString(normalized.activeMeetingId)
    const meetingChanged = nextMeetingId !== normalizeString(options.activeMeetingId.value)

    projectWorkspaceViewHydrating.value = true
    try {
      projectWorkspaceModeHydrating.value = true
      if (normalized.workbenchMode === 'defense') {
        options.closeFinalReviewDrawers()
        options.workbenchMode.value = 'defense'
        options.aiMode.value = 'defense'
      }
      else if (normalized.workbenchMode === 'final_review') {
        const nextPrimaryMode = options.aiMode.value !== 'defense'
          ? options.aiMode.value as WorkspacePrimaryAiMode
          : (options.lastPrimaryAiMode.value || 'dialog_ask')
        options.lastPrimaryAiMode.value = nextPrimaryMode
        options.workbenchMode.value = 'final_review'
        options.aiMode.value = 'dialog_ask'
      }
      else {
        const nextPrimaryMode = options.aiMode.value !== 'defense'
          ? options.aiMode.value as WorkspacePrimaryAiMode
          : (options.lastPrimaryAiMode.value || 'dialog_ask')
        options.closeFinalReviewDrawers()
        options.aiMode.value = nextPrimaryMode
        options.lastPrimaryAiMode.value = nextPrimaryMode
        options.workbenchMode.value = 'project'
      }
      projectWorkspaceModeHydrating.value = false

      options.openMainTabs.value = [...normalized.mainTabs]
      options.activeMainTabId.value = normalized.activeMainTabId
      options.previewResourceId.value = normalized.previewResourceId
      options.selectedContestId.value = normalized.selectedContestId
      options.selectedTrackId.value = normalized.selectedTrackId
      options.openChatSessionIds.value = [...normalized.openChatSessionIds]
      options.activeChatSessionId.value = normalized.activeChatSessionId
      options.activeMeetingId.value = nextMeetingId
      options.projectAssistantMode.value = normalized.projectAssistantMode
      options.rightSidebarView.value = normalized.rightSidebarView
      options.leftSidebarWidth.value = normalized.leftSidebarWidth
      options.rightSidebarWidth.value = normalized.rightSidebarWidth
      options.leftSidebarCollapsed.value = normalized.leftSidebarCollapsed
      options.setRightSidebarUserCollapsed(normalized.rightSidebarCollapsed, { suppressPersist: true })

      if (normalized.workbenchMode === 'final_review') {
        options.rememberPreFinalReviewWorkbenchState({
          leftSidebarCollapsed: normalized.leftSidebarCollapsed,
          rightSidebarCollapsed: normalized.rightSidebarCollapsed,
          activeMainTabId: normalized.activeMainTabId,
          openMainTabs: normalized.mainTabs,
        })
        options.closeFinalReviewDrawers()
      }

      if (meetingChanged) {
        options.activeMeetingDetail.value = null
        options.activeMeetingUtterances.value = []
        options.meetingLiveCaptions.value = []
        options.clearMeetingJoinSession()
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
        state: buildDefaultProjectWorkspaceViewState(),
        bundle: null,
        hasManagedQuery: false,
        legacyDesignUnavailable: false,
      }
    }

    const queryResult = parseProjectWorkspaceViewStateFromQuery()
    let nextState = buildDefaultProjectWorkspaceViewState()
    let bundle: ProjectWorkspaceViewDeviceStatePayload | null = null
    let currentState: ProjectWorkspaceViewState | null = null
    let latestOtherState: ProjectWorkspaceViewState | null = null
    let currentStateLegacyDesignUnavailable = false
    let latestOtherStateLegacyDesignUnavailable = false

    try {
      bundle = await fetchProjectWorkspaceViewPreference(normalizedProjectId)
      if (bundle?.current?.payload) {
        const migratedCurrentState = migrateLegacyDesignWorkspaceState(bundle.current.payload, options.resources.value)
        currentStateLegacyDesignUnavailable = migratedCurrentState.legacyDesignUnavailable
        currentState = applyPersonalAiTabsFallback(
          normalizeProjectWorkspaceViewState(migratedCurrentState.state),
          bundle.personalAiTabs,
        )
      }
      if (bundle?.latestOther?.payload) {
        const migratedLatestOtherState = migrateLegacyDesignWorkspaceState(bundle.latestOther.payload, options.resources.value)
        latestOtherStateLegacyDesignUnavailable = migratedLatestOtherState.legacyDesignUnavailable
        latestOtherState = applyPersonalAiTabsFallback(
          normalizeProjectWorkspaceViewState(migratedLatestOtherState.state),
          bundle.personalAiTabs,
        )
      }
    }
    catch {
      bundle = null
    }

    let legacyDesignUnavailable = queryResult.legacyDesignUnavailable
    nextState = applyPersonalAiTabsFallback(nextState, bundle?.personalAiTabs)
    if (queryResult.hasManagedQuery) {
      nextState = applyPersonalAiTabsFallback(
        normalizeProjectWorkspaceViewState(queryResult.state),
        bundle?.personalAiTabs,
      )
    }
    else if (currentState) {
      nextState = currentState
      legacyDesignUnavailable = currentStateLegacyDesignUnavailable
    }
    else if (bundle?.resolution.isNewDevice && latestOtherState) {
      nextState = latestOtherState
      legacyDesignUnavailable = latestOtherStateLegacyDesignUnavailable
    }

    nextState = sanitizeViewState(nextState)
    applyProjectWorkspaceViewState(nextState)
    projectWorkspaceViewReady.value = true
    await replaceProjectWorkspaceRouteQueryIfNeeded(nextState)

    if (queryResult.hasManagedQuery)
      scheduleProjectWorkspaceViewPersist()

    return {
      state: nextState,
      bundle,
      hasManagedQuery: queryResult.hasManagedQuery,
      legacyDesignUnavailable,
    }
  }

  function scheduleProjectWorkspaceViewPersist(): void {
    if (!projectWorkspaceViewReady.value || projectWorkspaceViewHydrating.value)
      return

    const workspaceId = readString(options.activeWorkspaceId)
    const projectId = readString(options.highlightedProjectId) || readString(options.routeProjectId)
    if (!workspaceId || !projectId)
      return

    const state = sanitizeViewState(buildProjectWorkspaceViewStateFromRefs())
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

    const normalizedProjectId = readString(options.highlightedProjectId) || readString(options.routeProjectId)
    if (!normalizedProjectId)
      return

    const currentState = buildProjectWorkspaceViewStateFromRefs()
    const normalizedState = sanitizeViewState(currentState)
    if (!isProjectWorkspaceViewStateEqual(currentState, normalizedState)) {
      applyProjectWorkspaceViewState(normalizedState)
      return
    }

    await replaceProjectWorkspaceRouteQueryIfNeeded(normalizedState)
    scheduleProjectWorkspaceViewPersist()
  }

  onBeforeUnmount(() => {
    clearProjectWorkspaceViewPersistTimer()
  })

  return {
    applyProjectWorkspaceViewState,
    projectWorkspaceViewHydrating,
    projectWorkspaceModeHydrating,
    projectWorkspaceViewReady,
    clearProjectWorkspaceViewPersistTimer,
    hydrateProjectWorkspaceViewState,
    scheduleProjectWorkspaceViewPersist,
    syncProjectWorkspaceViewState,
  }
}

export function useWorkspaceProjectShell() {
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

  const openSettingsSignal = ref(0)
  const openLoopyDataSignal = ref(0)
  const openMemberManagementSignal = ref(0)
  const openDisplayPreferencesSignal = ref(0)
  const openFlowSignal = ref(0)
  const openPreviewSignal = ref(0)
  const closePreviewSignal = ref(0)
  const accountCenterVisible = ref(false)
  const leftSidebarMetaKSignal = ref(0)
  const leftSidebarMetaKModuleId = ref<WorkspaceLeftSidebarCommandModuleId | ''>('')
  const leftSidebarMetaKOutlineId = ref('')
  const metaKOpen = ref(false)
  const metaKQuery = ref('')
  const metaKShortcutLabel = ref('⌘K')
  const statusLine = ref('')

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
    if (deviceRestoreConfirmState.resolver)
      resolveDeviceRestoreConfirm('keep')
  })

  return {
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
  }
}
