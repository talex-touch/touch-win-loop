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
  WorkspaceTabSpacingPreset,
} from '~~/shared/types/domain'
import type { ProjectUploadTask } from '~/types/project-upload'
import type { WorkspaceLinkedContestResourceGroup } from '~/types/workspace'

type WorkspaceLeftModuleId = 'resource_manager' | 'analysis' | 'project_config' | 'issue_center'
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

interface ProjectResourceTreeItem {
  resource: Resource
  children: Resource[]
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
const activeOutlineId = ref('')
const sectionExpanded = reactive({
  projectResources: true,
  linkedContestResources: true,
  outline: true,
})
const documentTreeExpanded = reactive<Record<string, boolean>>({})
const panelContentTransitionKey = computed(() => {
  return recyclePanelOpen.value
    ? 'resource-manager:recycle'
    : activeModule.value
})
const panelContentTransitionName = ref<'workspace-left-panel-content-forward' | 'workspace-left-panel-content-backward'>('workspace-left-panel-content-forward')
const visibleResources = computed(() => props.selectedResources)
const resolvedOutlineItems = computed(() => {
  const uploadItems = props.uploadTasks.filter(task => Boolean(task))
  if (props.projectOutline.length > 0)
    return props.projectOutline
  return uploadItems
})

function resolveOutlineContractKey(item: ProjectOutlineNode | ProjectUploadTask): string {
  if ('sessionId' in item)
    return String(item.sessionId || '')
  return String(item.id || '')
}

function isWorkspaceLeftModuleId(value: string): value is WorkspaceLeftModuleId {
  return value === 'resource_manager'
    || value === 'analysis'
    || value === 'project_config'
    || value === 'issue_center'
}

function resolveEmbeddedMarkdownResourceId(resource: Resource): string {
  const metadata = resource.metadata as {
    embeddedIn?: {
      kind?: string
      resourceId?: string
    }
  } | null | undefined
  const embeddedIn = metadata?.embeddedIn
  if (!embeddedIn || embeddedIn.kind !== 'markdown')
    return ''
  return String(embeddedIn.resourceId || '').trim()
}

function isUploadedImageResource(resource: Resource): boolean {
  const type = String(resource.type || '').trim().toLowerCase()
  const source = String(resource.source || '').trim().toLowerCase()
  return source === 'upload' && type.startsWith('image/')
}

const projectResourceTreeItems = computed<ProjectResourceTreeItem[]>(() => {
  const markdownResourceIds = new Set(
    visibleResources.value
      .filter(resource => String(resource.resourceKind || '').trim().toLowerCase() === 'markdown')
      .map(resource => resource.id),
  )
  const orphanImageResources: Resource[] = []
  const childMap = new Map<string, Resource[]>()

  for (const resource of visibleResources.value) {
    if (!isUploadedImageResource(resource))
      continue
    const embeddedMarkdownResourceId = resolveEmbeddedMarkdownResourceId(resource)
    if (!embeddedMarkdownResourceId || !markdownResourceIds.has(embeddedMarkdownResourceId))
      continue
    const current = childMap.get(embeddedMarkdownResourceId) || []
    current.push(resource)
    childMap.set(embeddedMarkdownResourceId, current)
  }

  for (const resource of visibleResources.value) {
    if (!isUploadedImageResource(resource))
      continue
    const embeddedMarkdownResourceId = resolveEmbeddedMarkdownResourceId(resource)
    if (!embeddedMarkdownResourceId || !markdownResourceIds.has(embeddedMarkdownResourceId)) {
      orphanImageResources.push(resource)
      continue
    }
  }

  const items: ProjectResourceTreeItem[] = []
  for (const resource of visibleResources.value) {
    if (isUploadedImageResource(resource) && resolveEmbeddedMarkdownResourceId(resource))
      continue
    items.push({
      resource,
      children: childMap.get(resource.id) || [],
    })
  }

  for (const resource of orphanImageResources) {
    if (items.some(item => item.resource.id === resource.id))
      continue
    items.push({
      resource,
      children: [],
    })
  }

  return items
})

function syncPanelTransitionDirection(moduleId: string) {
  const moduleOrder = modules.map(item => item.id)
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

function switchModule(moduleId: string) {
  if (!isWorkspaceLeftModuleId(moduleId))
    return
  syncPanelTransitionDirection(moduleId)
  recyclePanelOpen.value = false
  activeModule.value = moduleId
  if (props.collapsed)
    emit('update:collapsed', false)
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

watch(projectResourceTreeItems, (items) => {
  const validIds = new Set(items.map(item => item.resource.id))
  for (const key of Object.keys(documentTreeExpanded)) {
    if (!validIds.has(key))
      delete documentTreeExpanded[key]
  }
}, { immediate: true })

watch(() => props.commandSignal, (next, previous) => {
  if (next === previous)
    return
  if (props.commandModuleId)
    switchModule(props.commandModuleId)
  if (props.commandOutlineId) {
    activeOutlineId.value = props.commandOutlineId
    sectionExpanded.outline = true
  }
  if (props.collapsed)
    emit('update:collapsed', false)
})

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
  <aside
    class="workspace-left-dock"
    :class="{
      'workspace-left-dock--collapsed': props.collapsed,
      'workspace-left-dock--compact': props.tabSpacingPreset === 'compact',
    }"
  >
    <WorkspaceLeftRail
      :items="modules"
      :active-id="activeModule"
      :collapsed="props.collapsed"
      :recycle-active="recyclePanelOpen"
      :defense-active="props.defenseActive"
      :member-management-active="props.activeMainTabId === 'members'"
      @select="switchModule"
      @open-defense="openDefenseMode"
      @open-recycle-bin="openRecycleBinPanel"
      @open-member-management="openMemberManagementPanel"
      @open-settings="openSettingsPanel"
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
        </div>
      </Transition>

      <div v-if="false" class="workspace-left-sidebar__structural-contract" aria-hidden="true">
        <button type="button" title="从系统资料库导入">从系统资料库导入</button>
        <div v-for="treeItem in projectResourceTreeItems" :key="treeItem.resource.id" class="workspace-resource-tree-group">
          <button class="workspace-tree-item__expander" type="button" />
          <div v-if="documentTreeExpanded[treeItem.resource.id]" class="workspace-resource-tree-group__children">
            <div v-for="child in treeItem.children" :key="child.id">
              {{ child.title }}
            </div>
          </div>
        </div>
        <div v-for="item in resolvedOutlineItems" :key="resolveOutlineContractKey(item) || activeOutlineId">
          {{ item }}
        </div>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.workspace-left-dock {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex: 0 0 360px;
  transition: flex-basis 0.22s ease;
}

.workspace-left-dock--collapsed {
  flex-basis: 56px;
}

.workspace-left-dock--compact {
  --workspace-left-sidebar-item-gap: 6px;
}

.workspace-left-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  transition: width 0.22s ease, opacity 0.22s ease, transform 0.22s ease;
}

.workspace-left-panel--hidden {
  width: 0;
  opacity: 0;
  transform: translateX(-10px);
  pointer-events: none;
}

.workspace-left-panel__content {
  height: 100%;
  min-height: 0;
}

.workspace-left-panel-content-forward-enter-active,
.workspace-left-panel-content-forward-leave-active,
.workspace-left-panel-content-backward-enter-active,
.workspace-left-panel-content-backward-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.workspace-left-panel-content-forward-enter-from,
.workspace-left-panel-content-backward-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.workspace-left-panel-content-backward-enter-from,
.workspace-left-panel-content-forward-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
</style>
