import type {
  ProjectWorkspaceViewState,
  Resource,
  WorkspaceOpenTabState,
} from '~~/shared/types/domain'

export type WorkspaceProjectPageBootstrapDeferredTaskId
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

export interface WorkspaceProjectPageBootstrapTask {
  id: WorkspaceProjectPageBootstrapDeferredTaskId
  run: () => Promise<unknown>
}

export interface WorkspaceProjectPageBootstrapTaskOptions {
  restoredViewState: {
    state: Pick<ProjectWorkspaceViewState, 'activeMeetingId' | 'activeChatSessionId'>
  }
  selectedContestIdFromState: string
  skippedTaskIds: Set<WorkspaceProjectPageBootstrapDeferredTaskId>
  loadProjectResourceLibrary: () => Promise<unknown>
  loadProjectRecycleResources: () => Promise<unknown>
  loadProjectResourceShares: () => Promise<unknown>
  loadWorkspaceMemberManagement: () => Promise<unknown>
  loadProjectOutline: () => Promise<unknown>
  loadProjectSettings: (selectedContestId: string) => Promise<unknown>
  loadSelectedContestDetail: (selectedContestId: string) => Promise<unknown>
  loadTopicBoards: () => Promise<unknown>
  loadAiChangeRequests: () => Promise<unknown>
  loadProjectIssues: () => Promise<unknown>
  loadProjectMeetings: (options: {
    fallbackToFirst: boolean
    preferredMeetingId?: string
    hydrateSelectedDetail: boolean
  }) => Promise<unknown>
  loadChatSessions: (options: {
    preferredSessionId: string
    autoCreate: boolean
    fallbackToFirst: boolean
  }) => Promise<unknown>
  loadDefensePersonas: () => Promise<unknown>
}

export function buildWorkspaceBackgroundBootstrapTasks(
  options: WorkspaceProjectPageBootstrapTaskOptions,
): WorkspaceProjectPageBootstrapTask[] {
  const tasks: WorkspaceProjectPageBootstrapTask[] = [
    {
      id: 'resource-library',
      run: () => options.loadProjectResourceLibrary(),
    },
    {
      id: 'resource-recycle',
      run: () => options.loadProjectRecycleResources(),
    },
    {
      id: 'resource-shares',
      run: () => options.loadProjectResourceShares(),
    },
    {
      id: 'members',
      run: () => options.loadWorkspaceMemberManagement(),
    },
    {
      id: 'outline',
      run: () => options.loadProjectOutline(),
    },
    {
      id: 'settings',
      run: () => options.loadProjectSettings(options.selectedContestIdFromState),
    },
    {
      id: 'contest-detail',
      run: () => options.loadSelectedContestDetail(options.selectedContestIdFromState),
    },
    {
      id: 'topic-boards',
      run: () => options.loadTopicBoards(),
    },
    {
      id: 'ai-changes',
      run: () => options.loadAiChangeRequests(),
    },
    {
      id: 'issues',
      run: () => options.loadProjectIssues(),
    },
    {
      id: 'meetings',
      run: () => options.loadProjectMeetings({
        fallbackToFirst: false,
        preferredMeetingId: options.restoredViewState.state.activeMeetingId,
        hydrateSelectedDetail: false,
      }),
    },
    {
      id: 'chat-sessions',
      run: () => options.loadChatSessions({
        preferredSessionId: options.restoredViewState.state.activeChatSessionId,
        autoCreate: false,
        fallbackToFirst: !options.restoredViewState.state.activeChatSessionId,
      }),
    },
    {
      id: 'defense-personas',
      run: () => options.loadDefensePersonas(),
    },
  ]

  return tasks.filter(task => !options.skippedTaskIds.has(task.id))
}

export interface WorkspaceResourceTabSyncOptions {
  resources: Resource[]
  flowResourceId: string
  collabBindingResourceId: string
  activeMainTabId: WorkspaceOpenTabState | ''
  openMainTabs: WorkspaceOpenTabState[]
  previewResourceId: string
  isWorkflowCanvasResource: (resource: Resource) => boolean
}

export interface WorkspaceResourceTabSyncResult {
  nextFlowResourceId: string
  disposeCollabBinding: boolean
  nextOpenMainTabs: WorkspaceOpenTabState[]
  nextActiveMainTabId: WorkspaceOpenTabState | ''
  tabStateChanged: boolean
  previewResourceMissing: boolean
}

export function resolveWorkspaceResourceTabSyncState(
  options: WorkspaceResourceTabSyncOptions,
): WorkspaceResourceTabSyncResult {
  let nextFlowResourceId = options.flowResourceId
  const workflowResource = options.resources.find(resource => options.isWorkflowCanvasResource(resource)) || null
  if (workflowResource && !nextFlowResourceId)
    nextFlowResourceId = workflowResource.id

  let disposeCollabBinding = false
  const visibleResourceIds = new Set(options.resources.map(resource => resource.id))
  if (nextFlowResourceId && !visibleResourceIds.has(nextFlowResourceId)) {
    disposeCollabBinding = options.collabBindingResourceId === nextFlowResourceId
      && options.activeMainTabId === 'flow'
    nextFlowResourceId = ''
  }

  const nextOpenMainTabs = options.openMainTabs.filter((tabId) => {
    if (!tabId.startsWith('resource:'))
      return true
    return visibleResourceIds.has(tabId.slice('resource:'.length))
  })

  const tabStateChanged = nextOpenMainTabs.length !== options.openMainTabs.length
    || nextOpenMainTabs.some((tabId, index) => tabId !== options.openMainTabs[index])
  const previewResourceMissing = Boolean(options.previewResourceId && !visibleResourceIds.has(options.previewResourceId))
  const nextActiveMainTabId = options.activeMainTabId && nextOpenMainTabs.includes(options.activeMainTabId)
    ? options.activeMainTabId
    : nextOpenMainTabs[0] || ''

  return {
    nextFlowResourceId,
    disposeCollabBinding,
    nextOpenMainTabs,
    nextActiveMainTabId,
    tabStateChanged,
    previewResourceMissing,
  }
}

export function shouldSyncWorkspaceMeetingSelection(options: {
  projectId: string
  nextTabId: WorkspaceOpenTabState | ''
  previousProjectId?: string
  previousTabId?: WorkspaceOpenTabState | ''
  workspaceCriticalLoading: boolean
}): boolean {
  if (!options.projectId)
    return false
  if (options.workspaceCriticalLoading)
    return false
  return options.projectId !== options.previousProjectId
    || options.nextTabId !== options.previousTabId
}

export function shouldSyncWorkspaceCollabBinding(options: {
  nextTabId: WorkspaceOpenTabState | ''
  previousTabId?: WorkspaceOpenTabState | ''
  workspaceCriticalLoading: boolean
}): boolean {
  if (options.nextTabId === options.previousTabId)
    return false
  return !options.workspaceCriticalLoading
}

export function shouldPersistWorkspaceViewState(options: {
  activeProjectId: string
  projectWorkspaceViewHydrating: boolean
  sidebarResizeActive: boolean
}): boolean {
  if (!options.activeProjectId || options.projectWorkspaceViewHydrating)
    return false
  return !options.sidebarResizeActive
}
