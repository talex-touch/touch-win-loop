<script setup lang="ts">
import type {
  Contest,
  ProjectIssue,
  ProjectIssueReport,
  ProjectMemberSummary,
  ProjectOutlineNode,
  ProjectResourceShareDurationPreset,
  ProjectResourceShareVisibility,
  Resource,
} from '~~/shared/types/domain'
import type { ProjectUploadTask } from '~/types/project-upload'
import type { WorkspaceLinkedContestResourceGroup } from '~/types/workspace'

type WorkspaceLeftModuleId = 'resource_manager' | 'analysis' | 'project_config' | 'issue_center'

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
  projectMembers?: ProjectMemberSummary[]
  projectOutline?: ProjectOutlineNode[]
  issueReports?: ProjectIssueReport[]
  projectIssues?: ProjectIssue[]
  issueLoading?: boolean
  projectResourcesLoading?: boolean
  resourceLibraryLoading?: boolean
  projectOutlineLoading?: boolean
  resourceMutating?: boolean
  hasActiveProject?: boolean
  aiReasoning: string
  normalizedInfo?: string
  statusLine: string
  listLoading: boolean
  aiFiltering: boolean
  isAdminView?: boolean
  activeMainTabId?: string
  defenseActive?: boolean
  currentUserId?: string
  currentUsername?: string
  projectStorageLimitBytes?: number
}>(), {
  selectedResources: () => [],
  recycleResources: () => [],
  resourceLibrary: () => [],
  linkedContestResourceGroups: () => [],
  linkedContestBindingCount: 0,
  uploadTasks: () => [],
  projectMembers: () => [],
  projectOutline: () => [],
  issueReports: () => [],
  projectIssues: () => [],
  issueLoading: false,
  projectResourcesLoading: false,
  resourceLibraryLoading: false,
  projectOutlineLoading: false,
  resourceMutating: false,
  hasActiveProject: false,
  normalizedInfo: '',
  isAdminView: false,
  activeMainTabId: '',
  defenseActive: false,
  currentUserId: '',
  currentUsername: '',
  projectStorageLimitBytes: 0,
})

const emit = defineEmits<{
  'update:naturalQuery': [value: string]
  'update:major': [value: string]
  'update:discipline': [value: string]
  'update:level': [value: string]
  'update:trackType': [value: string]
  'update:topK': [value: number]
  'update:selectedContestId': [value: string]
  'loadContests': []
  'runAiFilter': []
  'openSettingsPanel': []
  'openMemberManagementPanel': []
  'openFlowPanel': []
  'createCollabResource': [kind: 'markdown' | 'draw']
  'openDefenseMode': []
  'reloadIssues': []
  'addResourceFromLibrary': [resourceId: string]
  'openResource': [resourceId: string]
  'downloadProjectResource': [resourceId: string]
  'copyProjectResourceName': [resourceId: string]
  'shareProjectResource': [payload: ShareProjectResourcePayload]
  'duplicateProjectResource': [resourceId: string]
  'removeProjectResource': [resourceId: string]
  'restoreProjectResource': [resourceId: string]
  'purgeProjectResource': [resourceId: string]
  'uploadResources': [files: File[]]
  'pauseUploadTask': [sessionId: string]
  'resumeUploadTask': [sessionId: string]
  'retryUploadTask': [sessionId: string]
  'cancelUploadTask': [sessionId: string]
  'rebindUploadTask': [sessionId: string]
}>()

const LEFT_MODULE_STORAGE_KEY = 'workspace.leftSidebar.activeModule'

const modules: WorkspaceLeftModule[] = [
  {
    id: 'resource_manager',
    title: '资源管理器',
    icon: 'description',
    hint: '项目资料与结构大纲',
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

const activeModule = ref<WorkspaceLeftModuleId>('resource_manager')
const recyclePanelOpen = ref(false)

function isWorkspaceLeftModuleId(value: string): value is WorkspaceLeftModuleId {
  return value === 'resource_manager'
    || value === 'analysis'
    || value === 'project_config'
    || value === 'issue_center'
}

function switchModule(moduleId: string) {
  if (!isWorkspaceLeftModuleId(moduleId))
    return
  recyclePanelOpen.value = false
  activeModule.value = moduleId
}

function openSettingsPanel() {
  emit('openSettingsPanel')
}

function openMemberManagementPanel() {
  emit('openMemberManagementPanel')
}

function openDefenseMode() {
  emit('openDefenseMode')
}

function openRecycleBinPanel() {
  recyclePanelOpen.value = true
}

onMounted(() => {
  if (!import.meta.client)
    return

  const saved = localStorage.getItem(LEFT_MODULE_STORAGE_KEY)
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
  <aside class="workspace-left-dock">
    <WorkspaceLeftRail
      :items="modules"
      :active-id="activeModule"
      :recycle-active="recyclePanelOpen"
      :defense-active="props.defenseActive"
      :member-management-active="props.activeMainTabId === 'members'"
      @select="switchModule"
      @open-defense="openDefenseMode"
      @open-recycle-bin="openRecycleBinPanel"
      @open-member-management="openMemberManagementPanel"
      @open-settings="openSettingsPanel"
    />

    <section class="workspace-left-panel">
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
        @open-resource="emit('openResource', $event)"
        @download-project-resource="emit('downloadProjectResource', $event)"
        @copy-project-resource-name="emit('copyProjectResourceName', $event)"
        @share-project-resource="emit('shareProjectResource', $event)"
        @duplicate-project-resource="emit('duplicateProjectResource', $event)"
        @remove-project-resource="emit('removeProjectResource', $event)"
        @restore-project-resource="emit('restoreProjectResource', $event)"
        @purge-project-resource="emit('purgeProjectResource', $event)"
        @upload-resources="emit('uploadResources', $event)"
        @pause-upload-task="emit('pauseUploadTask', $event)"
        @resume-upload-task="emit('resumeUploadTask', $event)"
        @retry-upload-task="emit('retryUploadTask', $event)"
        @cancel-upload-task="emit('cancelUploadTask', $event)"
        @rebind-upload-task="emit('rebindUploadTask', $event)"
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
        v-else
        :issue-reports="props.issueReports"
        :project-issues="props.projectIssues"
        :issue-loading="props.issueLoading"
        @reload-issues="emit('reloadIssues')"
      />
    </section>
  </aside>
</template>
