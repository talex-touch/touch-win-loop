<script setup lang="ts">
import type {
  Contest,
  ProjectIssue,
  ProjectIssueReport,
  ProjectMeeting,
  ProjectMeetingMode,
  ProjectMeetingRuntimeHealth,
  ProjectMemberSummary,
  ProjectResourceShareDurationPreset,
  ProjectResourceShareVisibility,
  Resource,
  WorkspaceTabSpacingPreset,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import type { ContextMenuRequest } from '~/components/ui/context-menu'
import type { ProjectUploadActivityItem, ProjectUploadSummary, ProjectUploadTask } from '~/types/project-upload'
import type { WorkspaceLinkedContestResourceGroup } from '~/types/workspace'
import type { WorkspaceOutlineNode, WorkspaceOutlineSection } from '~/utils/workspace-outline'
import { WORKSPACE_LEFT_SIDEBAR_RAIL_WIDTH } from '~~/shared/utils/workspace-layout'

type WorkspaceLeftModuleId = 'resource_manager' | 'meeting' | 'analysis' | 'project_config' | 'issue_center' | 'upload_center' | 'notification_center'
type WorkspaceLeftPanelContentId = WorkspaceLeftModuleId

interface WorkspaceLeftModule {
  id: WorkspaceLeftModuleId
  title: string
  icon: string
  hint: string
}

interface ShareProjectResourcePayload {
  resourceId: string
  visibility: ProjectResourceShareVisibility
  duration: ProjectResourceShareDurationPreset
}

const props = withDefaults(defineProps<{
  naturalQuery: string
  major: string
  discipline: string
  level: string
  trackType: string
  topK: number
  selectedContestId: string
  contests: Contest[]
  selectedResources?: Resource[]
  recycleResources?: Resource[]
  resourceLibrary?: Resource[]
  linkedContestResourceGroups?: WorkspaceLinkedContestResourceGroup[]
  linkedContestBindingCount?: number
  uploadTasks?: ProjectUploadTask[]
  uploadSummary?: ProjectUploadSummary | null
  uploadDrawerOpen?: boolean
  uploadActivityItems?: ProjectUploadActivityItem[]
  uploadHistoryLoaded?: boolean
  meetings?: ProjectMeeting[]
  activeMeetingId?: string
  meetingLoading?: boolean
  meetingRefreshing?: boolean
  meetingMutating?: boolean
  meetingRuntimeHealth?: ProjectMeetingRuntimeHealth | null
  projectMembers?: ProjectMemberSummary[]
  outlineSections?: WorkspaceOutlineSection[]
  issueReports?: ProjectIssueReport[]
  projectIssues?: ProjectIssue[]
  issueLoading?: boolean
  projectResourcesLoading?: boolean
  projectResourcesRefreshing?: boolean
  resourceLibraryLoading?: boolean
  resourceLibraryRefreshing?: boolean
  resourceMutating?: boolean
  hasActiveProject?: boolean
  activeProjectId?: string
  aiReasoning: string
  normalizedInfo?: string
  statusLine: string
  listLoading: boolean
  aiFiltering: boolean
  isAdminView?: boolean
  workspaceId?: string
  userEmail?: string
  userAvatarUrl?: string
  workspaceOptions?: WorkspaceWithQuota[]
  workspaceCanManageMembers?: boolean
  activeMainTabId?: string
  currentUserId?: string
  currentUsername?: string
  projectStorageLimitBytes?: number
  collapsed?: boolean
  tabSpacingPreset?: WorkspaceTabSpacingPreset | ''
  commandSignal?: number
  commandModuleId?: WorkspaceLeftPanelContentId | ''
  commandOutlineId?: string
}>(), {
  selectedResources: () => [],
  recycleResources: () => [],
  resourceLibrary: () => [],
  linkedContestResourceGroups: () => [],
  linkedContestBindingCount: 0,
  uploadTasks: () => [],
  uploadSummary: null,
  uploadDrawerOpen: false,
  uploadActivityItems: () => [],
  uploadHistoryLoaded: false,
  meetings: () => [],
  activeMeetingId: '',
  meetingLoading: false,
  meetingRefreshing: false,
  meetingMutating: false,
  meetingRuntimeHealth: null,
  projectMembers: () => [],
  outlineSections: () => [],
  issueReports: () => [],
  projectIssues: () => [],
  issueLoading: false,
  projectResourcesLoading: false,
  projectResourcesRefreshing: false,
  resourceLibraryLoading: false,
  resourceLibraryRefreshing: false,
  resourceMutating: false,
  hasActiveProject: false,
  activeProjectId: '',
  normalizedInfo: '',
  isAdminView: false,
  workspaceId: '',
  userEmail: '',
  userAvatarUrl: '',
  workspaceOptions: () => [],
  workspaceCanManageMembers: false,
  activeMainTabId: '',
  currentUserId: '',
  currentUsername: '',
  projectStorageLimitBytes: 0,
  collapsed: false,
  tabSpacingPreset: '',
  commandSignal: 0,
  commandModuleId: '',
  commandOutlineId: '',
})

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  'update:naturalQuery': [value: string]
  'update:major': [value: string]
  'update:discipline': [value: string]
  'update:level': [value: string]
  'update:trackType': [value: string]
  'update:topK': [value: number]
  'update:selectedContestId': [value: string]
  'loadContests': []
  'runAiFilter': []
  'toggleUploadDrawer': []
  'pauseUploadTask': [sessionId: string]
  'resumeUploadTask': [sessionId: string]
  'retryUploadTask': [sessionId: string]
  'cancelUploadTask': [sessionId: string]
  'rebindUploadTask': [sessionId: string]
  'pauseAllUploadTasks': []
  'resumeAllUploadTasks': []
  'clearCompletedUploadTasks': []
  'locateOutlineItem': [node: WorkspaceOutlineNode]
  'openMeetingPanel': []
  'openSettingsPanel': []
  'openMemberManagementPanel': []
  'openFlowPanel': []
  'switchWorkspace': [workspaceId: string]
  'openWorkspaceHome': []
  'openDisplayPreferences': []
  'openAccountCenter': []
  'createMeeting': [value: { mode: ProjectMeetingMode }]
  'selectMeeting': [meetingId: string]
  'createCollabResource': [payload: { kind: 'markdown' | 'draw', purpose?: 'notes' | 'freeform' | 'design' | 'workflow', parentResourceId?: string | null }]
  'reloadIssues': []
  'addResourceFromLibrary': [payload: { resourceId: string, parentResourceId?: string | null }]
  'patchProjectResourceTree': [payload: { items: Array<{ resourceId: string, parentResourceId: string | null, sortOrder: number }> }]
  'openResource': [resourceId: string]
  'renameProjectResource': [payload: { resourceId: string, title: string }]
  'downloadProjectResource': [resourceId: string]
  'copyProjectResourceName': [resourceId: string]
  'shareProjectResource': [payload: ShareProjectResourcePayload]
  'duplicateProjectResource': [resourceId: string]
  'removeProjectResource': [resourceId: string]
  'removeProjectResources': [resourceIds: string[]]
  'restoreProjectResource': [resourceId: string]
  'purgeProjectResource': [resourceId: string]
  'uploadResources': [payload: { files: File[], parentResourceId?: string | null }]
  'requestContextMenu': [payload: ContextMenuRequest]
}>()

const leftSidebarRailWidthPx = `${WORKSPACE_LEFT_SIDEBAR_RAIL_WIDTH}px`

const notificationCenter = useNotificationCenter()

const LEFT_MODULE_STORAGE_KEY = 'workspace.leftSidebar.activeModule'

const modules: WorkspaceLeftModule[] = [
  {
    id: 'resource_manager',
    title: '资源管理器',
    icon: 'description',
    hint: '项目资料与结构大纲',
  },
  {
    id: 'meeting',
    title: '项目会议',
    icon: 'video_call',
    hint: '发起会议与最近记录',
  },
  {
    id: 'analysis',
    title: '竞赛分析',
    icon: 'grid_view',
    hint: '筛选与排序',
  },
  {
    id: 'project_config',
    title: '项目分析',
    icon: 'manage_search',
    hint: '分析偏好与 AI 建议',
  },
  {
    id: 'issue_center',
    title: 'Issue',
    icon: 'bug_report',
    hint: '寻疑报告与问题清单',
  },
]
const moduleOrder: WorkspaceLeftModuleId[] = ['resource_manager', 'meeting', 'analysis', 'project_config', 'issue_center', 'upload_center', 'notification_center']

const activeModule = ref<WorkspaceLeftModuleId>('resource_manager')
const recyclePanelOpen = ref(false)
const panelContentTransitionKey = computed(() => {
  return recyclePanelOpen.value
    ? 'resource-manager:recycle'
    : activeModule.value
})
const panelContentTransitionName = ref<'workspace-left-panel-content-forward' | 'workspace-left-panel-content-backward'>('workspace-left-panel-content-forward')

function isWorkspaceLeftModuleId(value: string): value is WorkspaceLeftModuleId {
  return value === 'resource_manager'
    || value === 'meeting'
    || value === 'analysis'
    || value === 'project_config'
    || value === 'issue_center'
    || value === 'upload_center'
    || value === 'notification_center'
}

function syncPanelTransitionDirection(moduleId: string) {
  const currentIndex = moduleOrder.indexOf(activeModule.value)
  const nextIndex = moduleOrder.indexOf(moduleId as WorkspaceLeftModuleId)
  if (nextIndex < 0 || currentIndex < 0) {
    panelContentTransitionName.value = 'workspace-left-panel-content-forward'
    return
  }
  panelContentTransitionName.value = nextIndex >= currentIndex
    ? 'workspace-left-panel-content-forward'
    : 'workspace-left-panel-content-backward'
}

function switchModule(moduleId: string, options: { allowCollapse?: boolean } = {}) {
  if (!isWorkspaceLeftModuleId(moduleId))
    return
  closeRailOverlays()
  const allowCollapse = options.allowCollapse !== false
  if (allowCollapse && !props.collapsed && !recyclePanelOpen.value && activeModule.value === moduleId) {
    emit('update:collapsed', true)
    return
  }
  syncPanelTransitionDirection(moduleId)
  recyclePanelOpen.value = false
  activeModule.value = moduleId
  if (moduleId === 'meeting')
    emit('openMeetingPanel')
  if (props.collapsed)
    emit('update:collapsed', false)
}

function openMeetingPanel() {
  closeRailOverlays()
  emit('openMeetingPanel')
}

function createMeeting(mode: ProjectMeetingMode) {
  emit('createMeeting', { mode })
}

function openSettingsPanel() {
  closeRailOverlays()
  emit('openSettingsPanel')
}

function openMemberManagementPanel() {
  closeRailOverlays()
  emit('openMemberManagementPanel')
}

function openRecycleBinPanel(options: { allowCollapse?: boolean } = {}) {
  closeRailOverlays()
  const allowCollapse = options.allowCollapse !== false
  if (allowCollapse && !props.collapsed && recyclePanelOpen.value) {
    emit('update:collapsed', true)
    return
  }
  recyclePanelOpen.value = true
  if (props.collapsed)
    emit('update:collapsed', false)
}

function closeRailOverlays(options: { keepUpload?: boolean } = {}) {
  notificationCenter.closeDrawer()
  if (!options.keepUpload && props.uploadDrawerOpen)
    emit('toggleUploadDrawer')
}

function handleToggleUploadDrawer() {
  if (props.uploadDrawerOpen) {
    emit('toggleUploadDrawer')
    return
  }
  openUploadPanel({ allowCollapse: false })
}

function handleOpenNotifications() {
  switchModule('notification_center')
}

function openUploadPanel(options: { allowCollapse?: boolean, syncDrawer?: boolean } = {}) {
  closeRailOverlays({ keepUpload: true })
  const allowCollapse = options.allowCollapse !== false
  if (allowCollapse && !props.collapsed && !recyclePanelOpen.value && activeModule.value === 'upload_center') {
    emit('update:collapsed', true)
    if (props.uploadDrawerOpen && options.syncDrawer !== false)
      emit('toggleUploadDrawer')
    return
  }
  syncPanelTransitionDirection('upload_center')
  recyclePanelOpen.value = false
  activeModule.value = 'upload_center'
  if (props.collapsed)
    emit('update:collapsed', false)
  if (!props.uploadDrawerOpen && options.syncDrawer !== false)
    emit('toggleUploadDrawer')
}

watch(() => props.commandSignal, (next, previous) => {
  if (next === previous)
    return
  if (props.commandModuleId)
    switchModule(props.commandModuleId, { allowCollapse: false })
  if (props.collapsed)
    emit('update:collapsed', false)
})

watch(() => props.uploadDrawerOpen, (next, previous) => {
  if (next === previous)
    return
  if (next) {
    openUploadPanel({ allowCollapse: false, syncDrawer: false })
    return
  }
  if (!props.collapsed && !recyclePanelOpen.value && activeModule.value === 'upload_center')
    emit('update:collapsed', true)
}, { immediate: true })

onMounted(() => {
  if (!import.meta.client)
    return

  const saved = localStorage.getItem(LEFT_MODULE_STORAGE_KEY)
  if (saved === 'upload_center' && !props.uploadDrawerOpen)
    return
  if (saved && isWorkspaceLeftModuleId(saved))
    activeModule.value = saved
})

watch(activeModule, (value) => {
  if (!import.meta.client)
    return
  localStorage.setItem(LEFT_MODULE_STORAGE_KEY, value)
})
</script>

<template>
  <aside
    class="workspace-left-dock"
    :class="{
      'workspace-left-dock--collapsed': props.collapsed,
      'workspace-left-dock--ultra-compact': props.tabSpacingPreset === 'ultra_compact',
      'workspace-left-dock--compact': props.tabSpacingPreset === 'compact',
      'workspace-left-dock--default': !props.tabSpacingPreset || props.tabSpacingPreset === 'default',
      'workspace-left-dock--relaxed': props.tabSpacingPreset === 'relaxed',
      'workspace-left-dock--spacious': props.tabSpacingPreset === 'spacious',
    }"
  >
    <WorkspaceLeftRail
      :items="modules"
      :active-id="activeModule"
      :workspace-id="props.workspaceId"
      :collapsed="props.collapsed"
      :recycle-active="recyclePanelOpen"
      :user-name="props.currentUsername"
      :user-email="props.userEmail"
      :user-avatar-url="props.userAvatarUrl"
      :workspace-options="props.workspaceOptions"
      :workspace-can-manage-members="props.workspaceCanManageMembers"
      :has-active-project="props.hasActiveProject"
      :upload-summary="props.uploadSummary"
      :upload-active="!props.collapsed && !recyclePanelOpen && activeModule === 'upload_center'"
      :notification-active="!props.collapsed && !recyclePanelOpen && activeModule === 'notification_center'"
      @select="switchModule"
      @toggle-upload-drawer="handleToggleUploadDrawer"
      @open-recycle-bin="openRecycleBinPanel"
      @open-member-management="openMemberManagementPanel"
      @open-notifications="handleOpenNotifications"
      @open-settings="openSettingsPanel"
      @switch-workspace="emit('switchWorkspace', $event)"
      @open-workspace-home="emit('openWorkspaceHome')"
      @open-display-preferences="emit('openDisplayPreferences')"
      @open-account-center="emit('openAccountCenter')"
    />

    <section
      class="workspace-left-panel"
      :class="{ 'workspace-left-panel--hidden': props.collapsed }"
    >
      <Transition :name="panelContentTransitionName" mode="out-in">
        <div :key="panelContentTransitionKey" class="workspace-left-panel__content">
          <WorkspaceResourceManagerPanel
            v-if="recyclePanelOpen || activeModule === 'resource_manager'"
            v-bind="props"
            :recycle-panel-open="recyclePanelOpen"
            @update:natural-query="emit('update:naturalQuery', $event)"
            @update:major="emit('update:major', $event)"
            @update:discipline="emit('update:discipline', $event)"
            @update:level="emit('update:level', $event)"
            @update:track-type="emit('update:trackType', $event)"
            @update:top-k="emit('update:topK', $event)"
            @update:selected-contest-id="emit('update:selectedContestId', $event)"
            @load-contests="emit('loadContests')"
            @run-ai-filter="emit('runAiFilter')"
            @create-collab-resource="emit('createCollabResource', $event)"
            @reload-issues="emit('reloadIssues')"
            @add-resource-from-library="emit('addResourceFromLibrary', $event)"
            @patch-project-resource-tree="emit('patchProjectResourceTree', $event)"
            @open-resource="emit('openResource', $event)"
            @rename-project-resource="emit('renameProjectResource', $event)"
            @download-project-resource="emit('downloadProjectResource', $event)"
            @copy-project-resource-name="emit('copyProjectResourceName', $event)"
            @share-project-resource="emit('shareProjectResource', $event)"
            @duplicate-project-resource="emit('duplicateProjectResource', $event)"
            @remove-project-resource="emit('removeProjectResource', $event)"
            @remove-project-resources="emit('removeProjectResources', $event)"
            @restore-project-resource="emit('restoreProjectResource', $event)"
            @purge-project-resource="emit('purgeProjectResource', $event)"
            @upload-resources="emit('uploadResources', $event)"
            @request-context-menu="emit('requestContextMenu', $event)"
            @pause-upload-task="emit('pauseUploadTask', $event)"
            @resume-upload-task="emit('resumeUploadTask', $event)"
            @retry-upload-task="emit('retryUploadTask', $event)"
            @cancel-upload-task="emit('cancelUploadTask', $event)"
            @rebind-upload-task="emit('rebindUploadTask', $event)"
            @locate-outline-item="emit('locateOutlineItem', $event)"
          />

          <WorkspaceMeetingSidebarPanel
            v-else-if="activeModule === 'meeting'"
            :meetings="props.meetings"
            :active-meeting-id="props.activeMeetingId"
            :loading="props.meetingLoading"
            :refreshing="props.meetingRefreshing"
            :mutating="props.meetingMutating"
            :runtime-health="props.meetingRuntimeHealth"
            @open-meeting-overview="openMeetingPanel"
            @create-meeting="createMeeting($event.mode)"
            @select-meeting="emit('selectMeeting', $event)"
          />

          <WorkspaceAnalysisPanel
            v-else-if="activeModule === 'analysis'"
            :natural-query="props.naturalQuery"
            :major="props.major"
            :discipline="props.discipline"
            :level="props.level"
            :track-type="props.trackType"
            :top-k="props.topK"
            :selected-contest-id="props.selectedContestId"
            :contests="props.contests"
            :ai-reasoning="props.aiReasoning"
            :normalized-info="props.normalizedInfo"
            :status-line="props.statusLine"
            :list-loading="props.listLoading"
            :ai-filtering="props.aiFiltering"
            :is-admin-view="props.isAdminView"
            @update-natural-query="emit('update:naturalQuery', $event)"
            @update-selected-contest-id="emit('update:selectedContestId', $event)"
            @load-contests="emit('loadContests')"
            @run-ai-filter="emit('runAiFilter')"
          />

          <WorkspaceProjectConfigPanel
            v-else-if="activeModule === 'project_config'"
            :major="props.major"
            :discipline="props.discipline"
            :level="props.level"
            :track-type="props.trackType"
            :top-k="props.topK"
            :ai-filtering="props.aiFiltering"
            :selected-contest-id="props.selectedContestId"
            :ai-reasoning="props.aiReasoning"
            :selected-resources-count="props.selectedResources.length"
            @update-major="emit('update:major', $event)"
            @update-discipline="emit('update:discipline', $event)"
            @update-level="emit('update:level', $event)"
            @update-track-type="emit('update:trackType', $event)"
            @update-top-k="emit('update:topK', $event)"
            @run-ai-filter="emit('runAiFilter')"
          />

          <WorkspaceIssuePanel
            v-else-if="activeModule === 'issue_center'"
            :issue-reports="props.issueReports"
            :project-issues="props.projectIssues"
            :issue-loading="props.issueLoading"
            @reload-issues="emit('reloadIssues')"
          />

          <WorkspaceUploadPanel
            v-else-if="activeModule === 'upload_center'"
            :upload-summary="props.uploadSummary"
            :upload-activity-items="props.uploadActivityItems"
            :upload-history-loaded="props.uploadHistoryLoaded"
            @pause-upload-task="emit('pauseUploadTask', $event)"
            @resume-upload-task="emit('resumeUploadTask', $event)"
            @retry-upload-task="emit('retryUploadTask', $event)"
            @cancel-upload-task="emit('cancelUploadTask', $event)"
            @rebind-upload-task="emit('rebindUploadTask', $event)"
            @pause-all-upload-tasks="emit('pauseAllUploadTasks')"
            @resume-all-upload-tasks="emit('resumeAllUploadTasks')"
            @clear-completed-upload-tasks="emit('clearCompletedUploadTasks')"
          />

          <WorkspaceNotificationPanel
            v-else
            :workspace-id="props.workspaceId"
            :active="!props.collapsed && !recyclePanelOpen && activeModule === 'notification_center'"
          />
        </div>
      </Transition>
    </section>
  </aside>
</template>

<style scoped>
.workspace-left-dock {
  --workspace-left-rail-width: v-bind(leftSidebarRailWidthPx);
  --workspace-left-dock-width: 360px;
  --workspace-left-panel-width: calc(var(--workspace-left-dock-width) - var(--workspace-left-rail-width));
  display: flex;
  min-height: 0;
  min-width: 0;
  flex: 0 0 var(--workspace-left-dock-width);
  transition: flex-basis 0.22s ease;
}

.workspace-left-dock--collapsed {
  flex-basis: var(--workspace-left-rail-width);
}

.workspace-left-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  transition:
    width 0.22s ease,
    opacity 0.22s ease,
    transform 0.22s ease;
}

.workspace-left-panel--hidden {
  width: 0;
  opacity: 0;
  transform: translateX(-10px);
  pointer-events: none;
}

.workspace-left-panel__content {
  display: flex;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.workspace-left-panel-content-forward-enter-active,
.workspace-left-panel-content-forward-leave-active,
.workspace-left-panel-content-backward-enter-active,
.workspace-left-panel-content-backward-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.workspace-left-panel-content-forward-enter-from,
.workspace-left-panel-content-backward-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.workspace-left-panel-content-backward-enter-from,
.workspace-left-panel-content-forward-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
