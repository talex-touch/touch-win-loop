<script setup lang="ts">
import type {
  ApiResponse,
  Contest,
  ProjectKnowledgeIndexSourceStatus,
  ProjectIssue,
  ProjectIssueReport,
  ProjectMemberSummary,
  ProjectResourceShareDurationPreset,
  ProjectResourceShareVisibility,
  Resource,
  ResourceCategory,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'
import type { ContextMenuItem, ContextMenuRequest } from '~/components/ui/context-menu'
import type { ProjectUploadTask } from '~/types/project-upload'
import type { WorkspaceLinkedContestResourceGroup } from '~/types/workspace'
import { formatFileSize, PROJECT_RESOURCE_UPLOAD_ACCEPT_ATTR } from '~~/shared/constants/project-resource-upload'
import {
  COLLAB_DESIGN_RESOURCE_LABEL,
  COLLAB_FREEFORM_RESOURCE_LABEL,
  COLLAB_NOTES_RESOURCE_LABEL,
  COLLAB_WORKFLOW_RESOURCE_LABEL,
} from '~~/shared/utils/collab-resource'
import {
  isProjectUploadTaskSidebarVisible,
  resolveProjectUploadTaskStatusText,
  resolveProjectUploadTaskTone,
} from '~/utils/project-upload'
import {
  canDuplicateResource,
  hasDownloadableSource,
  hasPreviewableSource,
  isCollabResource,
  resourceDisplayTitle,
  resourceIcon,
  resourceIconClass,
  resourceSourceLabel,
} from '~/utils/workspace-left-sidebar-helpers'
import type { WorkspaceOutlineNode, WorkspaceOutlineRow, WorkspaceOutlineSection } from '~/utils/workspace-outline'
import {
  buildWorkspaceOutlineNavigationHash,
  flattenWorkspaceOutlineRows,
} from '~/utils/workspace-outline'
import { useTransientHighlightSet } from '~/composables/useTransientHighlightSet'

type WorkspaceLeftModuleId = 'resource_manager' | 'analysis' | 'project_config' | 'issue_center'

interface WorkspaceLeftModule {
  id: WorkspaceLeftModuleId
  title: string
  icon: string
  hint: string
}

interface FilterPreset {
  id: string
  title: string
  level: string
  trackType: string
  topK: number
}

interface ResourceAttributeField {
  label: string
  value: string
}

interface ProjectResourceTreeNode {
  resource: Resource
  children: ProjectResourceTreeNode[]
}

interface ProjectResourceTreeRow {
  resource: Resource
  depth: number
  parentResourceId: string | null
  hasChildren: boolean
  expanded: boolean
}

type ResourceTreeDropPosition = 'before' | 'inside' | 'after' | 'root_end'
type ProjectResourceTypeFilterId = 'all' | 'meeting_notes' | 'meeting_recording' | 'notes' | 'design' | 'workflow' | 'upload' | 'library'

interface ProjectResourceTypeFilterOption {
  id: ProjectResourceTypeFilterId
  label: string
  icon: string
}

interface ShareProjectResourcePayload {
  resourceId: string
  visibility: ProjectResourceShareVisibility
  duration: ProjectResourceShareDurationPreset
}

interface WorkspaceLinkedContestResourceCategoryGroup {
  id: string
  label: string
  resources: Resource[]
}

interface WorkspaceLinkedContestResourceDisplayGroup extends WorkspaceLinkedContestResourceGroup {
  categories: WorkspaceLinkedContestResourceCategoryGroup[]
}

type ResourceSectionId = 'projectResources' | 'meetingNotes' | 'linkedContestResources' | 'outline'

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
  activeMainTabId?: string
  defenseActive?: boolean
  currentUserId?: string
  currentUsername?: string
  projectStorageLimitBytes?: number
  recyclePanelOpen?: boolean
  commandSignal?: number
  commandOutlineId?: string
}>(), {
  selectedResources: () => [],
  recycleResources: () => [],
  resourceLibrary: () => [],
  linkedContestResourceGroups: () => [],
  linkedContestBindingCount: 0,
  uploadTasks: () => [],
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
  activeMainTabId: '',
  defenseActive: false,
  currentUserId: '',
  currentUsername: '',
  projectStorageLimitBytes: 0,
  recyclePanelOpen: false,
  commandSignal: 0,
  commandOutlineId: '',
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
  'createCollabResource': [payload: { kind: 'markdown' | 'draw', purpose?: 'notes' | 'freeform' | 'design' | 'workflow', parentResourceId?: string | null }]
  'openDefenseMode': []
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
  'pauseUploadTask': [sessionId: string]
  'resumeUploadTask': [sessionId: string]
  'retryUploadTask': [sessionId: string]
  'cancelUploadTask': [sessionId: string]
  'rebindUploadTask': [sessionId: string]
  'locateOutlineItem': [node: WorkspaceOutlineNode]
  'requestContextMenu': [payload: ContextMenuRequest]
}>()

const LEFT_MODULE_STORAGE_KEY = 'workspace.leftSidebar.activeModule'

const levelLabels: Record<string, string> = {
  national: '国赛',
  provincial: '省赛',
  school: '校赛',
  industry: '行业赛',
}

const resourceCategoryOrder: ResourceCategory[] = [
  'basic_info',
  'timeline',
  'tracks',
  'track_details',
  'scoring',
  'templates',
  'submission_examples',
  'past_questions',
  'awarded_works',
  'faq',
  'judge_guidelines',
  'policy_notice',
  'compliance',
  'ai_prompts',
]

const resourceCategoryLabels: Record<ResourceCategory, string> = {
  basic_info: '基本信息',
  timeline: '时间轴',
  tracks: '赛道设置',
  scoring: '评分标准',
  past_questions: '往届真题',
  awarded_works: '获奖作品',
  templates: '论文/作品模板',
  faq: 'FAQ',
  judge_guidelines: '评委细则',
  track_details: '赛道详解',
  ai_prompts: 'AI 提示词',
  submission_examples: '材料示例',
  policy_notice: '政策通知',
  compliance: '合规与版权',
}

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

const filterPresets: FilterPreset[] = [
  {
    id: 'national-ai',
    title: '国赛 + AI',
    level: 'national',
    trackType: 'AI',
    topK: 6,
  },
  {
    id: 'industry-practice',
    title: '行业实战',
    level: 'industry',
    trackType: '工程落地',
    topK: 8,
  },
  {
    id: 'school-sprint',
    title: '校赛冲刺',
    level: 'school',
    trackType: '',
    topK: 5,
  },
]

const activeModule = ref<WorkspaceLeftModuleId>('resource_manager')
const recyclePanelOpen = computed(() => props.recyclePanelOpen)
const activeResourceId = ref('')
const renamingResourceId = ref('')
const renamingResourceDraft = ref('')
const activeOutlineId = ref('')
const pendingOutlineCommandId = ref('')
const resourceActionOpenId = ref('')
const outlineActionMenuOpenId = ref('')
const projectResourceBatchEditMode = ref(false)
const projectResourceBatchSelectedIds = ref<string[]>([])
const projectResourceBatchMenuOpen = ref(false)
const projectResourceAddMenuOpen = ref(false)
const projectResourceTypeFilter = ref<ProjectResourceTypeFilterId>('all')
const removeTargetResourceIds = ref<string[]>([])
const removeResourceModalVisible = ref(false)
const purgeTargetResourceId = ref('')
const purgeResourceModalVisible = ref(false)
const shareTargetResourceId = ref('')
const shareResourceModalVisible = ref(false)
const shareVisibility = ref<ProjectResourceShareVisibility>('public')
const shareDuration = ref<ProjectResourceShareDurationPreset>('7d')
const resourceDetailTargetId = ref('')
const resourceDetailModalVisible = ref(false)
const libraryModalKeyword = ref('')
const libraryModalVisible = ref(false)
const libraryImportParentResourceId = ref<string | null>(null)
const libraryListRef = ref<HTMLElement | null>(null)
const uploadParentResourceId = ref<string | null>(null)
const projectResourceUploadInputRef = ref<HTMLInputElement | null>(null)
const sidebarPanelRef = ref<HTMLElement | null>(null)
const treeExpanded = reactive<Record<string, boolean>>({})
const draggingResourceId = ref('')
const dragOverResourceId = ref('')
const dragOverPosition = ref<ResourceTreeDropPosition | ''>('')
const linkedCategoryExpanded = reactive<Record<string, boolean>>({})
const sectionExpanded = reactive<Record<ResourceSectionId, boolean>>({
  projectResources: true,
  meetingNotes: true,
  linkedContestResources: true,
  outline: true,
})

const showReason = ref(false)
const showAdminDetails = ref(false)

const suppressResourceSelection = computed(() => props.activeMainTabId === 'dashboard')

const visibleUploadTasks = computed(() => {
  return props.uploadTasks.filter(task => isProjectUploadTaskSidebarVisible(task))
})
const visibleRecycleResources = computed(() => props.recycleResources)
const visibleLibraryResources = computed(() => {
  const keyword = libraryModalKeyword.value.trim().toLowerCase()
  if (!keyword)
    return props.resourceLibrary

  return props.resourceLibrary
    .filter((item) => {
      const context = [item.title, item.summary, item.type, item.year].join(' ').toLowerCase()
      return context.includes(keyword)
    })
})
const outlineSections = computed(() => props.outlineSections)
const outlineRows = computed<WorkspaceOutlineRow[]>(() => flattenWorkspaceOutlineRows(outlineSections.value))
const outlineRowsBySectionId = computed(() => {
  const groups = new Map<WorkspaceOutlineSection['id'], WorkspaceOutlineRow[]>()
  for (const section of outlineSections.value)
    groups.set(section.id, [])

  for (const row of outlineRows.value) {
    const bucket = groups.get(row.sectionId)
    if (bucket)
      bucket.push(row)
    else
      groups.set(row.sectionId, [row])
  }

  return groups
})
const uploadTaskMap = computed(() => {
  const map = new Map<string, ProjectUploadTask>()
  for (const task of visibleUploadTasks.value) {
    const sessionId = String(task.sessionId || '').trim()
    if (sessionId)
      map.set(sessionId, task)
  }
  return map
})

function resolveOutlineSectionRows(sectionId: WorkspaceOutlineSection['id']): WorkspaceOutlineRow[] {
  return outlineRowsBySectionId.value.get(sectionId) || []
}

function resolveOutlineRowId(node: WorkspaceOutlineNode, sectionId: WorkspaceOutlineSection['id']): string {
  return `${sectionId}:${node.id}`
}

function resolveOutlineNodeIndent(depth: number): string {
  return `calc(var(--workspace-left-tree-row-padding-left, 10px) + ${resolveTreeDepthOffset(depth)})`
}

function resolveOutlineCommandRowId(commandId: string): string {
  const normalizedCommandId = String(commandId || '').trim()
  if (!normalizedCommandId)
    return ''

  const matchedRow = outlineRows.value.find((row) => {
    if (row.node.id === normalizedCommandId)
      return true
    if (row.node.locator.projectOutlineId === normalizedCommandId)
      return true
    if (row.node.locator.uploadSessionId === normalizedCommandId)
      return true
    return false
  })

  return matchedRow?.id || ''
}

function resolveOutlineUploadTask(node: WorkspaceOutlineNode): ProjectUploadTask | null {
  const sessionId = String(node.locator.uploadSessionId || '').trim()
  if (!sessionId)
    return null
  return uploadTaskMap.value.get(sessionId) || null
}

function outlineUploadTaskToneClass(node: WorkspaceOutlineNode): string {
  const task = resolveOutlineUploadTask(node)
  if (!task)
    return 'workspace-upload-task-item--running'
  return uploadTaskToneClass(task)
}

function outlineUploadTaskProgressStyle(node: WorkspaceOutlineNode): Record<string, string> {
  const task = resolveOutlineUploadTask(node)
  if (task)
    return uploadTaskProgressStyle(task)

  const safePercent = Math.max(0, Math.min(100, Math.round(Number(node.progressPercent || 0))))
  return {
    '--workspace-upload-progress-percent': `${safePercent}%`,
  }
}

function outlineUploadTaskIndeterminate(node: WorkspaceOutlineNode): boolean {
  return resolveOutlineUploadTask(node)?.status === 'finalizing'
}

function copyTextWithFallback(text: string): boolean {
  if (!import.meta.client || !text)
    return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  textarea.style.top = '-9999px'
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

async function writeTextToClipboard(text: string): Promise<boolean> {
  if (!text)
    return false

  if (import.meta.client && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch {
      // ignore clipboard permission errors and fallback to execCommand
    }
  }

  return copyTextWithFallback(text)
}

function buildOutlineItemShareUrl(node: WorkspaceOutlineNode): string {
  if (!import.meta.client)
    return ''

  const targetHash = buildWorkspaceOutlineNavigationHash(node)
  if (!targetHash)
    return ''

  const baseUrl = window.location.href.replace(/#.*$/, '')
  return `${baseUrl}${targetHash}`
}

async function copyOutlineItemLink(node: WorkspaceOutlineNode): Promise<void> {
  const shareUrl = buildOutlineItemShareUrl(node)
  if (!shareUrl) {
    Message.error('当前结构项暂不支持生成定位链接。')
    return
  }

  const copied = await writeTextToClipboard(shareUrl)
  if (copied)
    Message.success('定位链接已复制。')
  else
    Message.error('复制定位链接失败，请检查浏览器权限。')
}

async function copyOutlineItemLabel(node: WorkspaceOutlineNode): Promise<void> {
  const copied = await writeTextToClipboard(String(node.label || '').trim())
  if (copied)
    Message.success('结构标题已复制。')
  else
    Message.error('复制结构标题失败，请检查浏览器权限。')
}

function buildOutlineItemMenuItems(): ContextMenuItem[] {
  return [
    {
      key: 'copyLink',
      label: '复制定位链接',
      icon: 'link',
    },
    {
      key: 'copyLabel',
      label: '复制标题',
      icon: 'content_copy',
    },
    {
      key: 'locate',
      label: '定位到这里',
      icon: 'my_location',
      separatorBefore: true,
    },
  ]
}

function requestOutlineItemMenu(row: WorkspaceOutlineRow, anchorEl: HTMLElement | null): void {
  if (row.node.kind === 'upload_task')
    return

  outlineActionMenuOpenId.value = row.id
  emit('requestContextMenu', {
    source: 'workspace-outline-item',
    items: buildOutlineItemMenuItems(),
    anchorEl,
    restoreFocusEl: anchorEl,
    onSelect: (key) => {
      try {
        switch (key) {
          case 'copyLink':
            void copyOutlineItemLink(row.node)
            return
          case 'copyLabel':
            void copyOutlineItemLabel(row.node)
            return
          case 'locate':
            selectOutline(row)
        }
      }
      finally {
        closeInlineMenuMarkers()
      }
    },
    onClose: closeInlineMenuMarkers,
  })
}

function handleOutlineItemMenuTrigger(row: WorkspaceOutlineRow, event: MouseEvent): void {
  requestOutlineItemMenu(row, event.currentTarget instanceof HTMLElement ? event.currentTarget : null)
}

function selectOutline(row: WorkspaceOutlineRow) {
  activeOutlineId.value = row.id
  if (row.node.kind === 'upload_task')
    return
  emit('locateOutlineItem', row.node)
}

function resolveResourceCategoryLabel(category: string): string {
  const normalized = String(category || '').trim() as ResourceCategory
  return resourceCategoryLabels[normalized] || normalized || '未分类'
}

function normalizeProjectResourceMetadata(resource: Resource): Record<string, unknown> {
  const metadata = resource.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return {}
  return metadata as Record<string, unknown>
}

function isMeetingArtifactResource(resource: Resource): boolean {
  const metadata = normalizeProjectResourceMetadata(resource)
  if (metadata.meetingMemory === true)
    return true

  const artifactKind = String(metadata.artifactKind || '').trim().toLowerCase()
  return artifactKind === 'meeting_notes' || artifactKind === 'meeting_recording'
}

const meetingNoteResources = computed<Resource[]>(() => {
  return props.selectedResources.filter(isMeetingArtifactResource)
})

const projectPanelResources = computed<Resource[]>(() => {
  return props.selectedResources.filter(resource => !isMeetingArtifactResource(resource))
})

function resolveProjectResourceTypeFilterId(resource: Resource): Exclude<ProjectResourceTypeFilterId, 'all'> {
  const metadata = normalizeProjectResourceMetadata(resource)
  const artifactKind = String(metadata.artifactKind || '').trim().toLowerCase()
  if (artifactKind === 'meeting_recording')
    return 'meeting_recording'
  if (artifactKind === 'meeting_notes')
    return 'meeting_notes'

  const collabPurpose = String(resource.collabPurpose || '').trim().toLowerCase()
  if (collabPurpose === 'design')
    return 'design'
  if (collabPurpose === 'workflow')
    return 'workflow'
  if (collabPurpose === 'notes' || resource.resourceKind === 'markdown')
    return 'notes'

  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  if (source === 'library')
    return 'library'
  return 'upload'
}

const projectResourceTypeFilterDefinitions: ProjectResourceTypeFilterOption[] = [
  { id: 'all', label: '全部类型', icon: 'apps' },
  { id: 'notes', label: COLLAB_NOTES_RESOURCE_LABEL, icon: 'edit_note' },
  { id: 'design', label: '设计稿', icon: 'palette' },
  { id: 'workflow', label: '流程图', icon: 'flowsheet' },
  { id: 'upload', label: '上传文件', icon: 'upload_file' },
  { id: 'library', label: '导入资料', icon: 'library_add' },
]

const projectResourceTypeFilterOptions = computed<ProjectResourceTypeFilterOption[]>(() => {
  const presentFilterIds = new Set<Exclude<ProjectResourceTypeFilterId, 'all'>>()
  for (const resource of projectPanelResources.value)
    presentFilterIds.add(resolveProjectResourceTypeFilterId(resource))

  return projectResourceTypeFilterDefinitions.filter((item) => {
    if (item.id === 'all')
      return true
    return presentFilterIds.has(item.id)
  })
})

const projectResourceTypeFilterLabel = computed(() => {
  return projectResourceTypeFilterOptions.value.find(item => item.id === projectResourceTypeFilter.value)?.label || '全部类型'
})

const projectResourceFilterActive = computed(() => projectResourceTypeFilter.value !== 'all')

const projectResourceFilterButtonLabel = computed(() => {
  if (!projectResourceFilterActive.value)
    return '按类型筛选项目资料'
  return `按类型筛选项目资料，当前：${projectResourceTypeFilterLabel.value}`
})

const filteredProjectResources = computed<Resource[]>(() => {
  if (projectResourceTypeFilter.value === 'all')
    return projectPanelResources.value

  return projectPanelResources.value.filter(resource => resolveProjectResourceTypeFilterId(resource) === projectResourceTypeFilter.value)
})

function sortProjectResourcesByTreeOrder(left: Resource, right: Resource): number {
  const leftSort = Math.max(0, Number(left.sortOrder || 0))
  const rightSort = Math.max(0, Number(right.sortOrder || 0))
  if (leftSort !== rightSort)
    return leftSort - rightSort

  const leftCreatedAt = new Date(String(left.createdAt || '')).getTime()
  const rightCreatedAt = new Date(String(right.createdAt || '')).getTime()
  if (Number.isFinite(leftCreatedAt) && Number.isFinite(rightCreatedAt) && leftCreatedAt !== rightCreatedAt)
    return leftCreatedAt - rightCreatedAt

  return String(left.id || '').localeCompare(String(right.id || ''))
}

function buildProjectResourceTree(resources: Resource[]): ProjectResourceTreeNode[] {
  const nodeMap = new Map<string, ProjectResourceTreeNode>()
  for (const resource of resources) {
    const resourceId = String(resource.id || '').trim()
    if (!resourceId)
      continue
    nodeMap.set(resourceId, {
      resource,
      children: [],
    })
  }

  const roots: ProjectResourceTreeNode[] = []
  for (const resource of resources) {
    const resourceId = String(resource.id || '').trim()
    if (!resourceId)
      continue
    const node = nodeMap.get(resourceId)
    if (!node)
      continue
    const parentResourceId = String(resource.parentResourceId || '').trim()
    if (parentResourceId && parentResourceId !== resourceId) {
      const parentNode = nodeMap.get(parentResourceId)
      if (parentNode) {
        parentNode.children.push(node)
        continue
      }
    }
    roots.push(node)
  }

  const sortNodes = (nodes: ProjectResourceTreeNode[]) => {
    nodes.sort((left, right) => sortProjectResourcesByTreeOrder(left.resource, right.resource))
    nodes.forEach(node => sortNodes(node.children))
  }

  sortNodes(roots)
  return roots
}

function flattenProjectResourceTree(
  nodes: ProjectResourceTreeNode[],
  depth = 0,
  rows: ProjectResourceTreeRow[] = [],
): ProjectResourceTreeRow[] {
  for (const node of nodes) {
    const resourceId = String(node.resource.id || '').trim()
    const hasChildren = node.children.length > 0
    const expanded = hasChildren ? treeExpanded[resourceId] !== false : false
    rows.push({
      resource: node.resource,
      depth,
      parentResourceId: String(node.resource.parentResourceId || '').trim() || null,
      hasChildren,
      expanded,
    })
    if (hasChildren && expanded)
      flattenProjectResourceTree(node.children, depth + 1, rows)
  }
  return rows
}

function resolveTreeDepthOffset(depth: number): string {
  return `calc(var(--workspace-left-tree-root-offset, 0px) + var(--workspace-left-tree-indent-step, 14px) * ${Math.max(0, depth)})`
}

const projectResourceTree = computed<ProjectResourceTreeNode[]>(() => {
  return buildProjectResourceTree(filteredProjectResources.value)
})

const visibleResources = computed<ProjectResourceTreeRow[]>(() => {
  return flattenProjectResourceTree(projectResourceTree.value)
})

const meetingNoteResourceTree = computed<ProjectResourceTreeNode[]>(() => {
  return buildProjectResourceTree(meetingNoteResources.value)
})

const visibleMeetingNoteResources = computed<ProjectResourceTreeRow[]>(() => {
  return flattenProjectResourceTree(meetingNoteResourceTree.value)
})

const projectResourceMap = computed(() => {
  const map = new Map<string, Resource>()
  for (const resource of projectPanelResources.value) {
    const resourceId = String(resource.id || '').trim()
    if (resourceId)
      map.set(resourceId, resource)
  }
  return map
})

const projectResourceChildrenMap = computed(() => {
  const map = new Map<string, Resource[]>()
  const sortedResources = [...projectPanelResources.value].sort(sortProjectResourcesByTreeOrder)
  for (const resource of sortedResources) {
    const parentResourceId = String(resource.parentResourceId || '').trim() || '__root__'
    const existing = map.get(parentResourceId)
    if (existing)
      existing.push(resource)
    else
      map.set(parentResourceId, [resource])
  }
  return map
})

function sortResourcesByCategory(left: Resource, right: Resource): number {
  const leftCategory = String(left.category || '').trim() as ResourceCategory
  const rightCategory = String(right.category || '').trim() as ResourceCategory
  const leftOrder = resourceCategoryOrder.indexOf(leftCategory)
  const rightOrder = resourceCategoryOrder.indexOf(rightCategory)
  const normalizedLeftOrder = leftOrder >= 0 ? leftOrder : resourceCategoryOrder.length
  const normalizedRightOrder = rightOrder >= 0 ? rightOrder : resourceCategoryOrder.length
  if (normalizedLeftOrder !== normalizedRightOrder)
    return normalizedLeftOrder - normalizedRightOrder

  const leftYear = Number(left.year || 0)
  const rightYear = Number(right.year || 0)
  if (leftYear !== rightYear)
    return rightYear - leftYear

  return resourceDisplayTitle(left).localeCompare(resourceDisplayTitle(right), 'zh-CN')
}

function buildLinkedContestResourceCategories(resources: Resource[]): WorkspaceLinkedContestResourceCategoryGroup[] {
  const categoryMap = new Map<string, Resource[]>()

  for (const resource of [...resources].sort(sortResourcesByCategory)) {
    const category = String(resource.category || '').trim() || 'unknown'
    const existing = categoryMap.get(category)
    if (existing) {
      existing.push(resource)
      continue
    }
    categoryMap.set(category, [resource])
  }

  return [...categoryMap.entries()]
    .sort(([leftId], [rightId]) => {
      const leftOrder = resourceCategoryOrder.indexOf(leftId as ResourceCategory)
      const rightOrder = resourceCategoryOrder.indexOf(rightId as ResourceCategory)
      const normalizedLeftOrder = leftOrder >= 0 ? leftOrder : resourceCategoryOrder.length
      const normalizedRightOrder = rightOrder >= 0 ? rightOrder : resourceCategoryOrder.length
      if (normalizedLeftOrder !== normalizedRightOrder)
        return normalizedLeftOrder - normalizedRightOrder
      return leftId.localeCompare(rightId, 'zh-CN')
    })
    .map(([id, categoryResources]) => ({
      id,
      label: resolveResourceCategoryLabel(id),
      resources: categoryResources,
    }))
}

const linkedContestResourceGroups = computed<WorkspaceLinkedContestResourceDisplayGroup[]>(() => {
  return props.linkedContestResourceGroups.map(group => ({
    ...group,
    resources: Array.isArray(group.resources) ? group.resources : [],
    categories: buildLinkedContestResourceCategories(group.resources || []),
  }))
})

function flattenLinkedContestResourceIds(groups: Array<WorkspaceLinkedContestResourceGroup | WorkspaceLinkedContestResourceDisplayGroup>): string[] {
  return groups
    .flatMap(group => Array.isArray(group.resources) ? group.resources : [])
    .map(resource => String(resource.id || '').trim())
    .filter(Boolean)
}

const projectResourceSkeletonRows = [1, 2, 3, 4]
const resourceLibrarySkeletonRows = [1, 2, 3]
const outlineSkeletonRows = [1, 2, 3]

const recycleRetentionDays = 30
const projectResourcesHighlightInitialized = ref(false)
const resourceLibraryHighlightInitialized = ref(false)
const {
  isHighlighted: isProjectResourceHighlighted,
  queueHighlightedIds: queueProjectResourceHighlightedIds,
} = useTransientHighlightSet()
const {
  isHighlighted: isResourceLibraryHighlighted,
  queueHighlightedIds: queueResourceLibraryHighlightedIds,
} = useTransientHighlightSet()

const projectResourceIds = computed(() => {
  return filteredProjectResources.value
    .map(resource => String(resource.id || '').trim())
    .filter(Boolean)
})

const projectResourceBatchSelectedIdSet = computed(() => new Set(projectResourceBatchSelectedIds.value))

const projectResourceBatchSelectedCount = computed(() => projectResourceBatchSelectedIds.value.length)

const projectResourceBatchAllSelected = computed(() => {
  return projectResourceIds.value.length > 0 && projectResourceBatchSelectedIds.value.length === projectResourceIds.value.length
})

const removeTargetResourceCount = computed(() => removeTargetResourceIds.value.length)

const removeTargetResourceLabel = computed(() => {
  if (removeTargetResourceIds.value.length > 1)
    return `已选 ${removeTargetResourceIds.value.length} 个文件`
  if (!removeTargetResourceIds.value.length)
    return '该文件'
  const target = props.selectedResources.find(item => item.id === removeTargetResourceIds.value[0])
  return target ? resourceDisplayTitle(target) : '该文件'
})

const removeResourceModalMessage = computed(() => {
  if (removeTargetResourceIds.value.length > 1)
    return `确认删除已选的 ${removeTargetResourceIds.value.length} 个资源吗？`
  return `确认删除资源「${removeTargetResourceLabel.value}」吗？`
})

const purgeTargetResourceLabel = computed(() => {
  if (!purgeTargetResourceId.value)
    return '该文件'
  const target = props.recycleResources.find(item => item.id === purgeTargetResourceId.value)
  return target ? resourceDisplayTitle(target) : '该文件'
})

const shareTargetResourceLabel = computed(() => {
  if (!shareTargetResourceId.value)
    return '该文件'
  const target = props.selectedResources.find(item => item.id === shareTargetResourceId.value)
  return target ? resourceDisplayTitle(target) : '该文件'
})

const resourceDetailTarget = computed(() => {
  const targetResourceId = String(resourceDetailTargetId.value || '').trim()
  if (!targetResourceId)
    return null
  return props.selectedResources.find(item => item.id === targetResourceId) || null
})

const resourceKnowledgeLoading = ref(false)
const resourceKnowledgeRetrying = ref(false)
const resourceKnowledgeError = ref('')
const resourceKnowledgeStatus = ref<ProjectKnowledgeIndexSourceStatus | null>(null)
let resourceKnowledgePollingTimer: ReturnType<typeof setInterval> | null = null

const resourceDetailTitle = computed(() => {
  const target = resourceDetailTarget.value
  if (!target)
    return '未选择资源'
  return resourceDisplayTitle(target)
})

const resourceDetailRows = computed<ResourceAttributeField[]>(() => {
  const target = resourceDetailTarget.value
  if (!target)
    return []

  const uploadedAt = resolveResourceUploadedAt(target)
  const createdAt = String(target.createdAt || '').trim()
  const updatedAt = String(target.updatedAt || '').trim()

  return [
    {
      label: '占用空间',
      value: resourceStorageLabel(target),
    },
    {
      label: '占项目总容量',
      value: resourceProjectCapacityShareLabel(target),
    },
    {
      label: '上传者',
      value: resourceUploaderLabel(target),
    },
    {
      label: '上传时间',
      value: formatDateTime(uploadedAt),
    },
    {
      label: '创建时间',
      value: formatDateTime(createdAt),
    },
    {
      label: '更新时间',
      value: formatDateTime(updatedAt),
    },
    {
      label: '文件名',
      value: metadataFileName(target) || '-',
    },
    {
      label: 'MIME 类型',
      value: metadataMimeType(target) || '-',
    },
    {
      label: '来源',
      value: resourceSourceLabel(target),
    },
    {
      label: '访问权限',
      value: resourceAvailabilityLabel(target),
    },
    {
      label: '预览状态',
      value: resourcePreviewStatusLabel(target),
    },
    {
      label: '资源 ID',
      value: String(target.id || '-').trim() || '-',
    },
  ]
})

const resourceKnowledgeHeadline = computed(() => {
  const status = resourceKnowledgeStatus.value
  if (!status)
    return '可查看当前资源的索引状态、阶段、进度和错误信息。'
  if (status.status === 'ready')
    return '索引完成，可参与正式知识检索。'
  if (status.status === 'stale')
    return '内容已更新，等待重新索引。'
  if (status.status === 'failed')
    return '索引失败，可查看原因后重试。'
  if (status.status === 'queued')
    return '索引任务已进入队列，等待处理。'
  if (status.status === 'extracting' || status.status === 'chunking' || status.status === 'embedding')
    return '索引进行中，进度会随任务阶段自动刷新。'
  if (status.status === 'skipped')
    return '当前资源暂未纳入主索引。'
  return '等待索引任务启动。'
})

const resourceKnowledgeRows = computed<ResourceAttributeField[]>(() => {
  const status = resourceKnowledgeStatus.value
  if (!status)
    return []

  return [
    {
      label: '索引状态',
      value: knowledgeStatusLabel(status.status),
    },
    {
      label: '当前阶段',
      value: knowledgeStageLabel(status.currentStage || status.status),
    },
    {
      label: '当前进度',
      value: `${Math.max(0, Math.min(100, Math.round(Number(status.progressPercent || 0))))}%`,
    },
    {
      label: '预计剩余时间',
      value: formatDurationLabel(status.etaSeconds),
    },
    {
      label: '预计完成时间',
      value: formatDateTime(String(status.estimatedFinishedAt || '')),
    },
    {
      label: '已生成 Chunk 数',
      value: String(status.chunkTotal || 0),
    },
    {
      label: '已完成 Embedding 数',
      value: String(status.chunkIndexed || 0),
    },
    {
      label: '最后索引时间',
      value: formatDateTime(String(status.lastIndexedAt || '')),
    },
    {
      label: '索引版本',
      value: String(status.indexVersion || '-').trim() || '-',
    },
    {
      label: '最近错误阶段',
      value: knowledgeStageLabel(status.lastErrorStage),
    },
    {
      label: '最近错误原因',
      value: String(status.lastError || '-').trim() || '-',
    },
  ]
})

const hasReasoning = computed(() => Boolean(props.aiReasoning?.trim()))

const analysisStateLabel = computed(() => {
  if (props.aiFiltering)
    return '分析中'
  if (hasReasoning.value)
    return '分析完成'
  return '等待分析'
})

const configSummary = computed(() => {
  const chunks: string[] = []
  if (props.major.trim())
    chunks.push(`专业：${props.major.trim()}`)
  if (props.discipline.trim())
    chunks.push(`方向：${props.discipline.trim()}`)
  if (props.level.trim())
    chunks.push(`级别：${levelLabels[props.level] || props.level}`)
  if (props.trackType.trim())
    chunks.push(`赛道：${props.trackType.trim()}`)
  chunks.push(`返回：${props.topK}`)
  return chunks.join(' · ')
})

const compactHint = computed(() => {
  if (props.aiFiltering)
    return '正在执行筛选，请稍候。'

  const status = props.statusLine?.trim() || ''
  if (status.includes('失败') || status.includes('不可用'))
    return status

  if (hasReasoning.value)
    return '点击“展开原因”查看本次筛选依据。'

  return '点击“AI筛选竞赛”后可查看分析结果。'
})

const analysisSuggestions = computed(() => {
  const suggestions: string[] = []

  if (!props.selectedContestId)
    suggestions.push('先在“竞赛分析”中锁定至少 1 个目标竞赛与赛道。')

  if (!hasReasoning.value)
    suggestions.push('执行一次 AI 筛选，系统会输出可解释排序与推荐理由。')

  if (hasReasoning.value)
    suggestions.push('已得到 AI 分析结果，下一步建议进入“项目设置”补全项目底座与竞赛适配稿。')

  if (props.selectedResources.length === 0)
    suggestions.push('资料池当前为空，建议先在资源管理器补齐规则文档和往届样例。')

  if (suggestions.length === 0)
    suggestions.push('当前信息较完整，可直接进入 Dashboard 推进提交与终审准备。')

  return suggestions.slice(0, 4)
})

const latestIssueReport = computed(() => {
  return props.issueReports[0] || null
})

const visibleIssues = computed(() => {
  return props.projectIssues.slice(0, 20)
})

function issueSeverityLabel(value: string): string {
  if (value === 'critical')
    return '严重'
  if (value === 'high')
    return '高'
  if (value === 'low')
    return '低'
  return '中'
}

function issueSeverityClass(value: string): string {
  if (value === 'critical')
    return 'workspace-issue-tag workspace-issue-tag--critical'
  if (value === 'high')
    return 'workspace-issue-tag workspace-issue-tag--high'
  if (value === 'low')
    return 'workspace-issue-tag workspace-issue-tag--low'
  return 'workspace-issue-tag workspace-issue-tag--medium'
}

function switchModule(moduleId: string) {
  if (!isWorkspaceLeftModuleId(moduleId))
    return
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
  activeModule.value = moduleId
}

function enterProjectResourceBatchEditMode() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceBatchEditMode.value = true
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
}

function exitProjectResourceBatchEditMode(options: { keepSelection?: boolean } = {}) {
  projectResourceBatchEditMode.value = false
  projectResourceBatchMenuOpen.value = false
  resourceActionOpenId.value = ''
  if (!options.keepSelection)
    projectResourceBatchSelectedIds.value = []
}

function isProjectResourceBatchSelected(resourceId: string): boolean {
  const normalizedResourceId = String(resourceId || '').trim()
  return normalizedResourceId ? projectResourceBatchSelectedIdSet.value.has(normalizedResourceId) : false
}

function setProjectResourceBatchSelection(resourceId: string, selected: boolean) {
  if (!projectResourceBatchEditMode.value)
    return

  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId)
    return

  if (selected) {
    if (!projectResourceBatchSelectedIdSet.value.has(normalizedResourceId))
      projectResourceBatchSelectedIds.value = [...projectResourceBatchSelectedIds.value, normalizedResourceId]
    return
  }

  projectResourceBatchSelectedIds.value = projectResourceBatchSelectedIds.value.filter(item => item !== normalizedResourceId)
}

function toggleProjectResourceBatchSelection(resourceId: string) {
  setProjectResourceBatchSelection(resourceId, !isProjectResourceBatchSelected(resourceId))
}

function toggleProjectResourceBatchSelectAll() {
  if (!projectResourceBatchEditMode.value)
    return

  if (projectResourceBatchAllSelected.value) {
    projectResourceBatchSelectedIds.value = []
    return
  }

  projectResourceBatchSelectedIds.value = [...projectResourceIds.value]
}

function clearProjectResourceBatchSelection() {
  projectResourceBatchSelectedIds.value = []
}

function syncProjectResourceBatchSelectionToCurrentFilter() {
  if (projectResourceBatchSelectedIds.value.length === 0)
    return

  const visibleIdSet = new Set(projectResourceIds.value)
  projectResourceBatchSelectedIds.value = projectResourceBatchSelectedIds.value.filter(item => visibleIdSet.has(item))
}

function syncActiveResourceToVisibleList(fallbackResources: Resource[] = props.selectedResources) {
  const allVisibleRows = [...visibleResources.value, ...visibleMeetingNoteResources.value]
  if (!fallbackResources.length || allVisibleRows.length === 0) {
    activeResourceId.value = ''
    return
  }

  if (suppressResourceSelection.value) {
    activeResourceId.value = ''
    return
  }

  const visibleResourceIds = new Set(
    allVisibleRows
      .map(row => String(row.resource.id || '').trim())
      .filter(Boolean),
  )
  if (activeResourceId.value && visibleResourceIds.has(activeResourceId.value))
    return

  activeResourceId.value = allVisibleRows[0]?.resource.id || fallbackResources[0]?.id || ''
}

function resetLibraryListScroll() {
  nextTick(() => {
    libraryListRef.value?.scrollTo({ top: 0 })
  })
}

function selectResource(resourceId: string) {
  activeResourceId.value = resourceId
  resourceActionOpenId.value = ''
}

function openResource(resource: Resource) {
  const resourceId = String(resource.id || '').trim()
  if (!resourceId)
    return
  selectResource(resourceId)

  if (isCollabResource(resource)) {
    emit('openResource', resourceId)
    return
  }

  const source = String(resource.source || resource.sourceType || '').trim()
  const kind = String(resource.resourceKind || '').trim()
  if (source === 'upload' || source === 'project_upload' || kind === 'binary')
    emit('openResource', resourceId)
}

function linkedCategoryStateKey(contestId: string, categoryId: string): string {
  return `${String(contestId || '').trim()}::${String(categoryId || '').trim()}`
}

function isLinkedCategoryExpanded(contestId: string, categoryId: string): boolean {
  return linkedCategoryExpanded[linkedCategoryStateKey(contestId, categoryId)] !== false
}

function toggleLinkedCategory(contestId: string, categoryId: string) {
  const stateKey = linkedCategoryStateKey(contestId, categoryId)
  linkedCategoryExpanded[stateKey] = !isLinkedCategoryExpanded(contestId, categoryId)
}

function toggleSection(sectionId: ResourceSectionId) {
  sectionExpanded[sectionId] = !sectionExpanded[sectionId]
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

function reloadIssueCenter() {
  emit('reloadIssues')
}

function openRecycleBinPanel() {
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
}

function onTopKInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  emit('update:topK', Number.isNaN(value) ? 1 : value)
}

function applyFilterPreset(preset: FilterPreset) {
  emit('update:level', preset.level)
  emit('update:trackType', preset.trackType)
  emit('update:topK', preset.topK)
}

function metadataRecord(resource: Resource): Record<string, unknown> {
  const metadata = resource.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return {}
  return metadata as Record<string, unknown>
}

function normalizeMetadataString(resource: Resource, key: string): string {
  const metadata = metadataRecord(resource)
  return String(metadata[key] || '').trim()
}

function metadataFileName(resource: Resource): string {
  return normalizeMetadataString(resource, 'fileName')
}

function metadataMimeType(resource: Resource): string {
  return normalizeMetadataString(resource, 'mimeType').toLowerCase()
}

function metadataUploadedAt(resource: Resource): string {
  return normalizeMetadataString(resource, 'uploadedAt')
}

function findProjectMemberName(userId: string): string {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId)
    return ''
  const matched = props.projectMembers.find(member => String(member.userId || '').trim() === normalizedUserId)
  return String(matched?.username || '').trim()
}

function metadataUploader(resource: Resource): string {
  const metadata = metadataRecord(resource)
  const candidates = [
    metadata.uploaderName,
    metadata.uploadedByName,
    metadata.uploader,
    metadata.uploadedBy,
  ]
  for (const item of candidates) {
    const value = String(item || '').trim()
    if (value)
      return value
  }
  return ''
}

function metadataFileSize(resource: Resource): number {
  const metadata = metadataRecord(resource)
  const fileSize = Number(metadata.fileSize)
  if (!Number.isFinite(fileSize) || fileSize <= 0)
    return 0
  return Math.max(0, Math.floor(fileSize))
}

function resourceAvailabilityLabel(resource: Resource): string {
  const availability = String(resource.availability || '').trim()
  if (availability === 'public')
    return '公开'
  if (availability === 'login_required')
    return '登录后可见'
  if (availability === 'unavailable')
    return '不可访问'
  return availability || '-'
}

function resourcePreviewStatusLabel(resource: Resource): string {
  const status = String(resource.previewStatus || '').trim()
  if (!status)
    return '未生成'
  if (status === 'queued')
    return '排队中'
  if (status === 'converting')
    return '转换中'
  if (status === 'finalizing')
    return '整理中'
  if (status === 'succeeded')
    return '可预览'
  if (status === 'failed')
    return '预览失败'
  return status
}

function resolveResourceUploadedAt(resource: Resource): string {
  const fromMetadata = metadataUploadedAt(resource)
  if (fromMetadata)
    return fromMetadata
  return String(resource.createdAt || '').trim()
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

function formatDurationLabel(value: number | string | null | undefined): string {
  const seconds = Math.max(0, Math.round(Number(value || 0)))
  if (!Number.isFinite(seconds) || seconds <= 0)
    return '-'
  if (seconds < 60)
    return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes < 60)
    return remainSeconds > 0 ? `${minutes} 分 ${remainSeconds} 秒` : `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return remainMinutes > 0 ? `${hours} 小时 ${remainMinutes} 分` : `${hours} 小时`
}

function knowledgeStatusLabel(status: string): string {
  const normalized = String(status || '').trim()
  if (!normalized)
    return '-'
  if (normalized === 'pending')
    return '待索引'
  if (normalized === 'queued')
    return '排队中'
  if (normalized === 'extracting')
    return '提取中'
  if (normalized === 'chunking')
    return '切块中'
  if (normalized === 'embedding')
    return '向量化中'
  if (normalized === 'ready')
    return '索引完成'
  if (normalized === 'failed')
    return '索引失败'
  if (normalized === 'stale')
    return '等待刷新'
  if (normalized === 'skipped')
    return '暂不索引'
  return normalized
}

function knowledgeStageLabel(stage: string | null | undefined): string {
  const normalized = String(stage || '').trim()
  if (!normalized)
    return '-'
  if (normalized === 'queued')
    return '排队中'
  if (normalized === 'extracting')
    return '提取中'
  if (normalized === 'chunking')
    return '切块中'
  if (normalized === 'embedding')
    return '向量化中'
  if (normalized === 'finalizing')
    return '收尾中'
  return knowledgeStatusLabel(normalized)
}

async function loadResourceKnowledgeStatus() {
  const projectId = String(props.activeProjectId || '').trim()
  const resourceId = String(resourceDetailTargetId.value || '').trim()
  if (!projectId || !resourceId) {
    resourceKnowledgeStatus.value = null
    resourceKnowledgeError.value = ''
    return
  }

  resourceKnowledgeLoading.value = true
  resourceKnowledgeError.value = ''
  try {
    const requestUrl: string = `/api/projects/${projectId}/resources/${resourceId}/knowledge/index-status`
    const response = await unsafeFetch(requestUrl) as ApiResponse<ProjectKnowledgeIndexSourceStatus>
    resourceKnowledgeStatus.value = response.data
  }
  catch (error: any) {
    resourceKnowledgeStatus.value = null
    resourceKnowledgeError.value = String(error?.data?.message || '加载索引状态失败，请稍后重试。').trim() || '加载索引状态失败，请稍后重试。'
  }
  finally {
    resourceKnowledgeLoading.value = false
  }
}

async function reindexResourceKnowledge() {
  const projectId = String(props.activeProjectId || '').trim()
  const resourceId = String(resourceDetailTargetId.value || '').trim()
  if (!projectId || !resourceId || resourceKnowledgeRetrying.value)
    return

  resourceKnowledgeRetrying.value = true
  try {
    const requestUrl: string = `/api/projects/${projectId}/resources/${resourceId}/knowledge/reindex`
    await unsafeFetch(requestUrl, {
      method: 'POST',
    })
    Message.success('已加入重新索引队列。')
    await loadResourceKnowledgeStatus()
  }
  catch (error: any) {
    Message.error(String(error?.data?.message || '重新索引失败，请稍后重试。').trim() || '重新索引失败，请稍后重试。')
  }
  finally {
    resourceKnowledgeRetrying.value = false
  }
}

function resourceUploaderLabel(resource: Resource): string {
  const uploaderUserId = String(resource.uploaderUserId || resource.createdBy || '').trim()
  const createdBy = String(resource.createdBy || '').trim()
  const currentUserId = String(props.currentUserId || '').trim()

  const resolvedName = String(
    resource.uploaderUsername
    || findProjectMemberName(uploaderUserId || createdBy)
    || metadataUploader(resource)
    || '',
  ).trim()

  if (currentUserId && uploaderUserId && uploaderUserId === currentUserId) {
    const currentUsername = String(props.currentUsername || '').trim()
    const displayName = resolvedName || currentUsername || '我'
    return displayName === '我' ? displayName : `${displayName}（我）`
  }

  if (resolvedName)
    return resolvedName

  return uploaderUserId || createdBy || '-'
}

function resourceStorageLabel(resource: Resource): string {
  const size = metadataFileSize(resource)
  if (size > 0)
    return formatFileSize(size)

  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  if (source === 'library')
    return '0 B（系统库引用）'

  return '未知'
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0)
    return '0%'

  const normalized = Math.max(0, value)
  if (normalized >= 10)
    return `${normalized.toFixed(1).replace(/\.0$/, '')}%`
  return `${normalized.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}

function resourceProjectCapacityShareLabel(resource: Resource): string {
  const limitBytes = Math.max(0, Number(props.projectStorageLimitBytes || 0))
  const resourceSize = metadataFileSize(resource)
  if (resourceSize <= 0 || limitBytes <= 0)
    return '-'

  const percentage = (resourceSize / limitBytes) * 100
  return `${formatPercent(percentage)}（${formatFileSize(resourceSize)} / ${formatFileSize(limitBytes)}）`
}

function uploadTaskExtension(task: ProjectUploadTask): string {
  const fileName = String(task.fileName || '').trim().toLowerCase()
  const index = fileName.lastIndexOf('.')
  if (index < 0)
    return ''
  return fileName.slice(index + 1)
}

function uploadTaskIcon(task: ProjectUploadTask): string {
  const extension = uploadTaskExtension(task)
  const mimeType = String(task.mimeType || '').trim().toLowerCase()
  if (extension === 'pdf' || mimeType.includes('pdf'))
    return 'picture_as_pdf'
  if (extension === 'doc' || extension === 'docx')
    return 'description'
  if (extension === 'xls' || extension === 'xlsx' || extension === 'csv')
    return 'table_chart'
  if (extension === 'ppt' || extension === 'pptx')
    return 'slideshow'
  if (extension === 'md' || extension === 'markdown' || extension === 'txt' || extension === 'json')
    return 'article'
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'webp')
    return 'image'
  return 'draft'
}

function uploadTaskIconClass(task: ProjectUploadTask): string {
  const extension = uploadTaskExtension(task)
  const mimeType = String(task.mimeType || '').trim().toLowerCase()
  if (extension === 'pdf' || mimeType.includes('pdf'))
    return 'workspace-icon--pdf'
  if (extension === 'doc' || extension === 'docx')
    return 'workspace-icon--doc'
  if (extension === 'xls' || extension === 'xlsx' || extension === 'csv')
    return 'workspace-icon--table'
  if (extension === 'ppt' || extension === 'pptx')
    return 'workspace-icon--slide'
  if (extension === 'md' || extension === 'markdown' || extension === 'txt' || extension === 'json')
    return 'workspace-icon--text'
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'webp')
    return 'workspace-icon--image'
  return 'workspace-icon--doc'
}

function uploadTaskStatusText(task: ProjectUploadTask): string {
  return resolveProjectUploadTaskStatusText(task.status, task.needsFileRebind)
}

function uploadTaskMetaText(task: ProjectUploadTask): string {
  const uploadedText = formatFileSize(task.uploadedBytes)
  const totalText = formatFileSize(task.fileSize)
  const chunkText = `${Math.min(task.uploadedChunkCount, task.chunkCount)} / ${task.chunkCount} 分片`
  if (task.status === 'failed' && task.errorMessage)
    return `${chunkText} · ${task.errorMessage}`
  if (task.needsFileRebind)
    return `${chunkText} · 请重新选择原文件继续上传`
  if (task.status === 'finalizing')
    return `${uploadedText} / ${totalText} · 正在创建资源与预览`
  return `${uploadedText} / ${totalText} · ${chunkText}`
}

function uploadTaskToneClass(task: ProjectUploadTask): string {
  const tone = resolveProjectUploadTaskTone(task.status, task.needsFileRebind)
  if (tone === 'paused')
    return 'workspace-upload-tone--paused'
  if (tone === 'failed')
    return 'workspace-upload-tone--failed'
  if (tone === 'finalizing')
    return 'workspace-upload-tone--finalizing'
  if (tone === 'completed')
    return 'workspace-upload-tone--completed'
  return 'workspace-upload-tone--active'
}

function uploadTaskProgressStyle(task: ProjectUploadTask): Record<string, string> {
  const progress = task.status === 'finalizing'
    ? 100
    : Math.max(0, Math.min(100, Number(task.progressPercent || 0)))
  return {
    '--upload-progress': `${progress}%`,
  }
}

function canPauseUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'uploading' && !task.needsFileRebind
}

function canResumeUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'paused' && !task.needsFileRebind
}

function canRetryUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'failed' && !task.needsFileRebind
}

function canCancelUploadTask(task: ProjectUploadTask): boolean {
  return task.status !== 'finalizing'
}

function canRebindUploadTask(task: ProjectUploadTask): boolean {
  return task.needsFileRebind || task.status === 'failed'
}

function pauseUploadTask(sessionId: string) {
  emit('pauseUploadTask', sessionId)
}

function resumeUploadTask(sessionId: string) {
  emit('resumeUploadTask', sessionId)
}

function retryUploadTask(sessionId: string) {
  emit('retryUploadTask', sessionId)
}

function cancelUploadTask(sessionId: string) {
  emit('cancelUploadTask', sessionId)
}

function rebindUploadTask(sessionId: string) {
  emit('rebindUploadTask', sessionId)
}

function isWorkspaceLeftModuleId(value: string): value is WorkspaceLeftModuleId {
  return value === 'resource_manager'
    || value === 'analysis'
    || value === 'project_config'
    || value === 'issue_center'
}

function openLibraryModal(parentResourceId?: string | null) {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  libraryModalKeyword.value = ''
  libraryImportParentResourceId.value = String(parentResourceId || '').trim() || null
  libraryModalVisible.value = true
}

function openCollaborativeDocFromMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  emit('createCollabResource', { kind: 'markdown', purpose: 'notes', parentResourceId: null })
}

function openInfiniteCanvasFromMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  emit('createCollabResource', { kind: 'draw', purpose: 'freeform', parentResourceId: null })
}

function openDesignCanvasFromMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  emit('createCollabResource', { kind: 'draw', purpose: 'design', parentResourceId: null })
}

function openWorkflowCanvasFromMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  emit('createCollabResource', { kind: 'draw', purpose: 'workflow', parentResourceId: null })
}

function openLibraryFromMenu() {
  projectResourceAddMenuOpen.value = false
  openLibraryModal(null)
}

function openLocalUploadFromMenu(parentResourceId?: string | null) {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  uploadParentResourceId.value = String(parentResourceId || '').trim() || null
  nextTick(() => {
    projectResourceUploadInputRef.value?.click()
  })
}

function handleProjectResourceUploadInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  handleResourceUpload(target.files, uploadParentResourceId.value)
  target.value = ''
  uploadParentResourceId.value = null
}

function handleResourceUpload(
  files: FileList | File[] | null | undefined,
  parentResourceId?: string | null,
) {
  const normalizedFiles = Array.from(files || []).filter(file => file instanceof File)
  if (!normalizedFiles.length || props.resourceMutating || !props.hasActiveProject)
    return
  emit('uploadResources', {
    files: normalizedFiles,
    parentResourceId: String(parentResourceId || '').trim() || null,
  })
}

function addLibraryResource(resourceId: string) {
  if (!resourceId || props.resourceMutating || !props.hasActiveProject)
    return
  emit('addResourceFromLibrary', {
    resourceId,
    parentResourceId: libraryImportParentResourceId.value,
  })
  libraryModalVisible.value = false
  libraryImportParentResourceId.value = null
}

function toggleProjectResourceExpansion(resourceId: string) {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId)
    return
  treeExpanded[normalizedResourceId] = treeExpanded[normalizedResourceId] === false
}

function setProjectResourceTreeExpansion(expanded: boolean) {
  const walk = (nodes: ProjectResourceTreeNode[]) => {
    for (const node of nodes) {
      const resourceId = String(node.resource.id || '').trim()
      if (!resourceId)
        continue
      if (node.children.length > 0) {
        treeExpanded[resourceId] = expanded
        walk(node.children)
      }
    }
  }

  walk(projectResourceTree.value)
}

function createChildCollaborativeDoc(resourceId: string) {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || props.resourceMutating || !props.hasActiveProject)
    return
  resourceActionOpenId.value = ''
  emit('createCollabResource', {
    kind: 'markdown',
    purpose: 'notes',
    parentResourceId: normalizedResourceId,
  })
}

function createChildInfiniteCanvas(resourceId: string) {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || props.resourceMutating || !props.hasActiveProject)
    return
  resourceActionOpenId.value = ''
  emit('createCollabResource', {
    kind: 'draw',
    purpose: 'freeform',
    parentResourceId: normalizedResourceId,
  })
}

function createChildDesignCanvas(resourceId: string) {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || props.resourceMutating || !props.hasActiveProject)
    return
  resourceActionOpenId.value = ''
  emit('createCollabResource', {
    kind: 'draw',
    purpose: 'design',
    parentResourceId: normalizedResourceId,
  })
}

function createChildWorkflowCanvas(resourceId: string) {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || props.resourceMutating || !props.hasActiveProject)
    return
  resourceActionOpenId.value = ''
  emit('createCollabResource', {
    kind: 'draw',
    purpose: 'workflow',
    parentResourceId: normalizedResourceId,
  })
}

function openChildLibraryImport(resourceId: string) {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || props.resourceMutating || !props.hasActiveProject)
    return
  resourceActionOpenId.value = ''
  openLibraryModal(normalizedResourceId)
}

function openChildUpload(resourceId: string) {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || props.resourceMutating || !props.hasActiveProject)
    return
  resourceActionOpenId.value = ''
  openLocalUploadFromMenu(normalizedResourceId)
}

function closeInlineMenuMarkers(): void {
  resourceActionOpenId.value = ''
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
  outlineActionMenuOpenId.value = ''
}

function isKeyboardContextMenuEvent(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

function buildProjectResourceAddMenuItems(): ContextMenuItem[] {
  const disabled = props.resourceMutating || !props.hasActiveProject
  return [
    {
      key: 'createMarkdown',
      label: `新建${COLLAB_NOTES_RESOURCE_LABEL}`,
      icon: 'edit_note',
      disabled,
    },
    {
      key: 'createCanvas',
      label: `新建${COLLAB_FREEFORM_RESOURCE_LABEL}`,
      icon: 'draw',
      disabled,
    },
    {
      key: 'createDesignCanvas',
      label: `新建${COLLAB_DESIGN_RESOURCE_LABEL}`,
      icon: 'palette',
      disabled,
    },
    {
      key: 'createWorkflowCanvas',
      label: `新建${COLLAB_WORKFLOW_RESOURCE_LABEL}`,
      icon: 'flowsheet',
      disabled,
    },
    {
      key: 'importLibrary',
      label: '从系统资料库导入',
      icon: 'library_add',
      separatorBefore: true,
      disabled,
    },
    {
      key: 'uploadLocal',
      label: '从本地设备中上传',
      icon: 'upload_file',
      disabled,
    },
  ]
}

function buildProjectResourceBatchMenuItems(): ContextMenuItem[] {
  const disabled = props.resourceMutating || !props.hasActiveProject
  const empty = filteredProjectResources.value.length === 0
  return [
    {
      key: projectResourceBatchEditMode.value ? 'exitBatchEdit' : 'enterBatchEdit',
      label: projectResourceBatchEditMode.value ? '退出批量编辑' : '进入批量编辑',
      icon: projectResourceBatchEditMode.value ? 'close' : 'check_box',
      disabled,
    },
    {
      key: 'uploadLocal',
      label: '批量上传文件',
      icon: 'upload_file',
      separatorBefore: true,
      disabled,
    },
    {
      key: 'importLibrary',
      label: '批量导入资料库',
      icon: 'library_add',
      disabled,
    },
    {
      key: 'expandAll',
      label: '全部展开',
      icon: 'unfold_more',
      separatorBefore: true,
      disabled: empty,
    },
    {
      key: 'collapseAll',
      label: '全部折叠',
      icon: 'unfold_less',
      disabled: empty,
    },
  ]
}

function buildProjectResourceFilterMenuItems(): ContextMenuItem[] {
  return projectResourceTypeFilterOptions.value.map(option => ({
    key: option.id,
    label: option.label,
    icon: option.icon,
    checked: option.id === projectResourceTypeFilter.value,
  }))
}

function requestProjectResourceFilterMenu(anchorEl: HTMLElement | null): void {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
  emit('requestContextMenu', {
    source: 'workspace-resource-filter',
    items: buildProjectResourceFilterMenuItems(),
    anchorEl,
    restoreFocusEl: anchorEl,
    onSelect: (key) => {
      try {
        const nextFilter = projectResourceTypeFilterOptions.value.find(item => item.id === key)
        if (nextFilter)
          projectResourceTypeFilter.value = nextFilter.id
      }
      finally {
        closeInlineMenuMarkers()
      }
    },
    onClose: closeInlineMenuMarkers,
  })
}

function requestProjectResourceBatchMenu(anchorEl: HTMLElement | null): void {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  projectResourceBatchMenuOpen.value = true
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
  emit('requestContextMenu', {
    source: 'workspace-resource-batch',
    items: buildProjectResourceBatchMenuItems(),
    anchorEl,
    restoreFocusEl: anchorEl,
    onSelect: (key) => {
      try {
        switch (key) {
          case 'enterBatchEdit':
            enterProjectResourceBatchEditMode()
            return
          case 'exitBatchEdit':
            exitProjectResourceBatchEditMode()
            return
          case 'uploadLocal':
            openLocalUploadFromMenu()
            return
          case 'importLibrary':
            openLibraryFromMenu()
            return
          case 'expandAll':
            sectionExpanded.projectResources = true
            setProjectResourceTreeExpansion(true)
            return
          case 'collapseAll':
            sectionExpanded.projectResources = true
            setProjectResourceTreeExpansion(false)
        }
      }
      finally {
        closeInlineMenuMarkers()
      }
    },
    onClose: closeInlineMenuMarkers,
  })
}

function requestProjectResourceAddMenu(anchorEl: HTMLElement | null): void {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = true
  resourceActionOpenId.value = ''
  emit('requestContextMenu', {
    source: 'workspace-resource-add',
    items: buildProjectResourceAddMenuItems(),
    anchorEl,
    restoreFocusEl: anchorEl,
    onSelect: (key) => {
      try {
        switch (key) {
          case 'createMarkdown':
            openCollaborativeDocFromMenu()
            return
          case 'createCanvas':
            openInfiniteCanvasFromMenu()
            return
          case 'createDesignCanvas':
            openDesignCanvasFromMenu()
            return
          case 'createWorkflowCanvas':
            openWorkflowCanvasFromMenu()
            return
          case 'importLibrary':
            openLibraryFromMenu()
            return
          case 'uploadLocal':
            openLocalUploadFromMenu()
        }
      }
      finally {
        closeInlineMenuMarkers()
      }
    },
    onClose: closeInlineMenuMarkers,
  })
}

function requestProjectResourceAddMenuByKeyboard(event: KeyboardEvent): void {
  if (!isKeyboardContextMenuEvent(event))
    return
  event.preventDefault()
  requestProjectResourceAddMenu(event.currentTarget instanceof HTMLElement ? event.currentTarget : null)
}

function requestProjectResourceFilterMenuByKeyboard(event: KeyboardEvent): void {
  if (!isKeyboardContextMenuEvent(event))
    return
  event.preventDefault()
  requestProjectResourceFilterMenu(event.currentTarget instanceof HTMLElement ? event.currentTarget : null)
}

function requestProjectResourceBatchMenuByKeyboard(event: KeyboardEvent): void {
  if (!isKeyboardContextMenuEvent(event))
    return
  event.preventDefault()
  requestProjectResourceBatchMenu(event.currentTarget instanceof HTMLElement ? event.currentTarget : null)
}

function handleProjectResourcePrimaryAction(resource: Resource) {
  if (projectResourceBatchEditMode.value) {
    toggleProjectResourceBatchSelection(String(resource.id || ''))
    return
  }

  openResource(resource)
}

function focusRenamingResourceInput(resourceId: string): void {
  nextTick(() => {
    const target = document.querySelector<HTMLInputElement>(`[data-resource-rename-id="${resourceId}"]`)
    target?.focus()
    target?.select()
  })
}

function startRenamingResource(resourceId: string): void {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  const resource = props.selectedResources.find(item => item.id === normalizedResourceId)
  if (!resource)
    return

  resourceActionOpenId.value = ''
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
  renamingResourceId.value = normalizedResourceId
  renamingResourceDraft.value = resourceDisplayTitle(resource)
  focusRenamingResourceInput(normalizedResourceId)
}

function cancelRenamingResource(): void {
  if (!renamingResourceId.value)
    return
  renamingResourceId.value = ''
  renamingResourceDraft.value = ''
}

function submitRenamingResource(): void {
  const normalizedResourceId = String(renamingResourceId.value || '').trim()
  if (!normalizedResourceId)
    return

  const resource = props.selectedResources.find(item => item.id === normalizedResourceId)
  const nextTitle = renamingResourceDraft.value.trim()
  const currentTitle = resource ? resourceDisplayTitle(resource) : ''
  cancelRenamingResource()

  if (!resource || !nextTitle || nextTitle === currentTitle)
    return

  emit('renameProjectResource', {
    resourceId: normalizedResourceId,
    title: nextTitle,
  })
}

function requestBatchRemoveResources() {
  if (
    props.resourceMutating
    || !props.hasActiveProject
    || projectResourceBatchSelectedIds.value.length === 0
  ) {
    return
  }

  removeTargetResourceIds.value = [...projectResourceBatchSelectedIds.value]
  removeResourceModalVisible.value = true
}

function buildResourceActionMenuItems(resource: Resource): ContextMenuItem[] {
  const disabled = props.resourceMutating || !props.hasActiveProject
  return [
    {
      key: 'createMarkdownChild',
      label: `新建子${COLLAB_NOTES_RESOURCE_LABEL}`,
      icon: 'edit_note',
      disabled,
    },
    {
      key: 'createCanvasChild',
      label: `新建子${COLLAB_FREEFORM_RESOURCE_LABEL}`,
      icon: 'draw',
      disabled,
    },
    {
      key: 'createDesignCanvasChild',
      label: `新建子${COLLAB_DESIGN_RESOURCE_LABEL}`,
      icon: 'palette',
      disabled,
    },
    {
      key: 'createWorkflowCanvasChild',
      label: `新建子${COLLAB_WORKFLOW_RESOURCE_LABEL}`,
      icon: 'flowsheet',
      disabled,
    },
    {
      key: 'uploadChild',
      label: '上传到此节点',
      icon: 'upload_file',
      disabled,
    },
    {
      key: 'importLibraryChild',
      label: '从系统资料库导入到此节点',
      icon: 'library_add',
      disabled,
    },
    {
      key: 'preview',
      label: '预览',
      icon: 'preview',
      separatorBefore: true,
      disabled: disabled || !hasPreviewableSource(resource),
    },
    {
      key: 'share',
      label: '分享链接',
      icon: 'link',
      disabled: disabled || !hasDownloadableSource(resource),
    },
    {
      key: 'rename',
      label: '改名',
      icon: 'drive_file_rename_outline',
      separatorBefore: true,
      disabled,
    },
    {
      key: 'copyName',
      label: '复制名称',
      icon: 'content_copy',
      disabled,
    },
    {
      key: 'duplicate',
      label: '创建副本',
      icon: 'file_copy',
      disabled: disabled || !canDuplicateResource(resource),
    },
    {
      key: 'details',
      label: '资源属性',
      icon: 'info',
      separatorBefore: true,
      disabled,
    },
    {
      key: 'download',
      label: '下载原文件',
      icon: 'download',
      disabled: disabled || !hasDownloadableSource(resource),
    },
    {
      key: 'remove',
      label: '删除文件',
      icon: 'delete',
      tone: 'danger',
      separatorBefore: true,
      disabled,
    },
  ]
}

function requestResourceActionMenu(resourceId: string, optionsOverrides: {
  anchorPoint?: { x: number, y: number }
  anchorEl?: HTMLElement | null
  restoreFocusEl?: HTMLElement | null
} = {}): void {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || projectResourceBatchEditMode.value || props.resourceMutating || !props.hasActiveProject)
    return

  const resource = props.selectedResources.find(item => item.id === normalizedResourceId)
  if (!resource)
    return

  activeResourceId.value = normalizedResourceId
  resourceActionOpenId.value = normalizedResourceId
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false

  emit('requestContextMenu', {
    source: 'workspace-resource-item',
    items: buildResourceActionMenuItems(resource),
    anchorPoint: optionsOverrides.anchorPoint || null,
    anchorEl: optionsOverrides.anchorEl || null,
    restoreFocusEl: optionsOverrides.restoreFocusEl || optionsOverrides.anchorEl || null,
    onSelect: (key) => {
      try {
        switch (key) {
          case 'createMarkdownChild':
            createChildCollaborativeDoc(normalizedResourceId)
            return
          case 'createCanvasChild':
            createChildInfiniteCanvas(normalizedResourceId)
            return
          case 'createDesignCanvasChild':
            createChildDesignCanvas(normalizedResourceId)
            return
          case 'createWorkflowCanvasChild':
            createChildWorkflowCanvas(normalizedResourceId)
            return
          case 'uploadChild':
            openChildUpload(normalizedResourceId)
            return
          case 'importLibraryChild':
            openChildLibraryImport(normalizedResourceId)
            return
          case 'preview':
            requestPreviewResource(normalizedResourceId)
            return
          case 'share':
            requestShareResource(normalizedResourceId)
            return
          case 'rename':
            startRenamingResource(normalizedResourceId)
            return
          case 'copyName':
            copyResourceName(normalizedResourceId)
            return
          case 'duplicate':
            createResourceDuplicate(normalizedResourceId)
            return
          case 'details':
            requestViewResourceDetails(normalizedResourceId)
            return
          case 'download':
            requestDownloadResource(normalizedResourceId)
            return
          case 'remove':
            requestRemoveResource(normalizedResourceId)
        }
      }
      finally {
        closeInlineMenuMarkers()
      }
    },
    onClose: closeInlineMenuMarkers,
  })
}

function requestResourceActionMenuByKeyboard(resourceId: string, event: KeyboardEvent): void {
  if (!isKeyboardContextMenuEvent(event))
    return
  event.preventDefault()
  requestResourceActionMenu(resourceId, {
    anchorEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    restoreFocusEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  })
}

function collectDraggedResourceSubtreeIds(resourceId: string): Set<string> {
  const normalizedResourceId = String(resourceId || '').trim()
  const collected = new Set<string>()
  if (!normalizedResourceId)
    return collected

  const queue = [normalizedResourceId]
  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || collected.has(currentId))
      continue
    collected.add(currentId)
    const children = projectResourceChildrenMap.value.get(currentId) || []
    for (const child of children) {
      const childId = String(child.id || '').trim()
      if (childId)
        queue.push(childId)
    }
  }

  return collected
}

function buildProjectResourceTreePatchPayload(
  draggedResourceId: string,
  targetResourceId: string | null,
  position: ResourceTreeDropPosition,
): { items: Array<{ resourceId: string, parentResourceId: string | null, sortOrder: number }> } | null {
  const normalizedDraggedId = String(draggedResourceId || '').trim()
  if (!normalizedDraggedId)
    return null

  const draggedResource = projectResourceMap.value.get(normalizedDraggedId)
  if (!draggedResource)
    return null

  const draggedParentResourceId = String(draggedResource.parentResourceId || '').trim() || null
  const draggedSubtreeIds = collectDraggedResourceSubtreeIds(normalizedDraggedId)
  const normalizedTargetId = String(targetResourceId || '').trim()

  if (normalizedTargetId && draggedSubtreeIds.has(normalizedTargetId))
    return null

  let nextParentResourceId: string | null = draggedParentResourceId
  let nextSiblingResourceIds: string[] = []

  if (position === 'root_end') {
    nextParentResourceId = null
    nextSiblingResourceIds = (projectResourceChildrenMap.value.get('__root__') || [])
      .map(resource => String(resource.id || '').trim())
      .filter(Boolean)
      .filter(resourceId => resourceId !== normalizedDraggedId)
    nextSiblingResourceIds.push(normalizedDraggedId)
  }
  else {
    const targetResource = normalizedTargetId ? projectResourceMap.value.get(normalizedTargetId) : null
    if (!targetResource)
      return null

    if (position === 'inside') {
      nextParentResourceId = normalizedTargetId
      nextSiblingResourceIds = (projectResourceChildrenMap.value.get(normalizedTargetId) || [])
        .map(resource => String(resource.id || '').trim())
        .filter(Boolean)
        .filter(resourceId => resourceId !== normalizedDraggedId)
      nextSiblingResourceIds.push(normalizedDraggedId)
    }
    else {
      nextParentResourceId = String(targetResource.parentResourceId || '').trim() || null
      nextSiblingResourceIds = (projectResourceChildrenMap.value.get(nextParentResourceId || '__root__') || [])
        .map(resource => String(resource.id || '').trim())
        .filter(Boolean)
        .filter(resourceId => resourceId !== normalizedDraggedId)

      const targetIndex = nextSiblingResourceIds.indexOf(normalizedTargetId)
      if (targetIndex < 0)
        return null

      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
      nextSiblingResourceIds.splice(insertIndex, 0, normalizedDraggedId)
    }
  }

  const affectedParentIds = new Set<string>([
    draggedParentResourceId || '__root__',
    nextParentResourceId || '__root__',
  ])

  const items: Array<{ resourceId: string, parentResourceId: string | null, sortOrder: number }> = []
  for (const parentKey of affectedParentIds) {
    const siblingParentResourceId = parentKey === '__root__' ? null : parentKey
    const siblingResourceIds = parentKey === (nextParentResourceId || '__root__')
      ? nextSiblingResourceIds
      : (projectResourceChildrenMap.value.get(parentKey) || [])
          .map(resource => String(resource.id || '').trim())
          .filter(Boolean)
          .filter(resourceId => resourceId !== normalizedDraggedId)

    siblingResourceIds.forEach((resourceId, index) => {
      items.push({
        resourceId,
        parentResourceId: siblingParentResourceId,
        sortOrder: index,
      })
    })
  }

  return {
    items,
  }
}

function handleResourceDragStart(resourceId: string, event: DragEvent) {
  if (projectResourceBatchEditMode.value || props.resourceMutating || !props.hasActiveProject)
    return
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId)
    return
  draggingResourceId.value = normalizedResourceId
  dragOverResourceId.value = ''
  dragOverPosition.value = ''
  event.dataTransfer?.setData('text/plain', normalizedResourceId)
  if (event.dataTransfer)
    event.dataTransfer.effectAllowed = 'move'
}

function handleResourceDragOver(resourceId: string | null, position: ResourceTreeDropPosition, event: DragEvent) {
  if (projectResourceBatchEditMode.value || !draggingResourceId.value || props.resourceMutating || !props.hasActiveProject)
    return
  event.preventDefault()
  dragOverResourceId.value = String(resourceId || '').trim()
  dragOverPosition.value = position
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
}

function handleResourceDragLeave(resourceId: string | null, position: ResourceTreeDropPosition) {
  if (dragOverResourceId.value !== String(resourceId || '').trim() || dragOverPosition.value !== position)
    return
  dragOverResourceId.value = ''
  dragOverPosition.value = ''
}

function handleResourceDragEnd() {
  draggingResourceId.value = ''
  dragOverResourceId.value = ''
  dragOverPosition.value = ''
}

function handleResourceDrop(resourceId: string | null, position: ResourceTreeDropPosition, event: DragEvent) {
  if (projectResourceBatchEditMode.value || !draggingResourceId.value || props.resourceMutating || !props.hasActiveProject)
    return
  event.preventDefault()
  const payload = buildProjectResourceTreePatchPayload(draggingResourceId.value, resourceId, position)
  handleResourceDragEnd()
  if (!payload || payload.items.length === 0)
    return
  emit('patchProjectResourceTree', payload)
}

function toggleResourceActionMenu(resourceId: string, anchorEl: HTMLElement | null = null) {
  requestResourceActionMenu(resourceId, {
    anchorEl,
    restoreFocusEl: anchorEl,
  })
}

function handleResourceItemContextMenu(resourceId: string, event: MouseEvent) {
  if (projectResourceBatchEditMode.value) {
    event.preventDefault()
    return
  }
  event.preventDefault()
  requestResourceActionMenu(resourceId, {
    anchorPoint: {
      x: event.clientX,
      y: event.clientY,
    },
    restoreFocusEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  })
}

function requestRemoveResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  resourceActionOpenId.value = ''
  removeTargetResourceIds.value = [targetResourceId]
  removeResourceModalVisible.value = true
}

function requestDownloadResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  resourceActionOpenId.value = ''
  emit('downloadProjectResource', targetResourceId)
}

function requestPreviewResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  resourceActionOpenId.value = ''
  activeResourceId.value = targetResourceId
  emit('openResource', targetResourceId)
}

function requestShareResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  resourceActionOpenId.value = ''
  shareTargetResourceId.value = targetResourceId
  shareVisibility.value = 'public'
  shareDuration.value = '7d'
  shareResourceModalVisible.value = true
}

function closeShareResourceModal(force = false) {
  if (props.resourceMutating && !force)
    return
  shareResourceModalVisible.value = false
  shareTargetResourceId.value = ''
}

function confirmShareResource() {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  const targetResourceId = String(shareTargetResourceId.value || '').trim()
  if (!targetResourceId)
    return

  const visibility = shareVisibility.value
  const duration = shareDuration.value
  shareResourceModalVisible.value = false
  shareTargetResourceId.value = ''
  emit('shareProjectResource', {
    resourceId: targetResourceId,
    visibility,
    duration,
  })
}

function copyResourceName(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  resourceActionOpenId.value = ''
  emit('copyProjectResourceName', targetResourceId)
}

function createResourceDuplicate(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  resourceActionOpenId.value = ''
  emit('duplicateProjectResource', targetResourceId)
}

function requestViewResourceDetails(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId)
    return

  resourceActionOpenId.value = ''
  resourceDetailTargetId.value = targetResourceId
  resourceDetailModalVisible.value = true
  void loadResourceKnowledgeStatus()
}

function closeResourceDetailPanel() {
  resourceDetailModalVisible.value = false
  resourceDetailTargetId.value = ''
  resourceKnowledgeStatus.value = null
  resourceKnowledgeError.value = ''
}

function stopResourceKnowledgePolling() {
  if (!resourceKnowledgePollingTimer)
    return
  clearInterval(resourceKnowledgePollingTimer)
  resourceKnowledgePollingTimer = null
}

function startResourceKnowledgePolling() {
  if (!import.meta.client || resourceKnowledgePollingTimer)
    return
  resourceKnowledgePollingTimer = setInterval(() => {
    if (!resourceDetailModalVisible.value || resourceKnowledgeLoading.value)
      return
    void loadResourceKnowledgeStatus()
  }, 5000)
}

const shouldPollResourceKnowledge = computed(() => {
  if (!resourceDetailModalVisible.value)
    return false
  const status = String(resourceKnowledgeStatus.value?.status || '').trim()
  return status === 'pending'
    || status === 'queued'
    || status === 'extracting'
    || status === 'chunking'
    || status === 'embedding'
})

watch(
  () => [resourceDetailModalVisible.value, resourceDetailTargetId.value, props.activeProjectId],
  ([visible]) => {
    if (!visible)
      return
    void loadResourceKnowledgeStatus()
  },
)

watch(shouldPollResourceKnowledge, (next) => {
  if (next) {
    startResourceKnowledgePolling()
    return
  }
  stopResourceKnowledgePolling()
}, { immediate: true })

function closeRemoveResourceModal() {
  if (props.resourceMutating)
    return
  removeResourceModalVisible.value = false
  removeTargetResourceIds.value = []
}

function confirmRemoveResource() {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  const targetResourceIds = [...new Set(removeTargetResourceIds.value.map(item => String(item || '').trim()).filter(Boolean))]
  if (targetResourceIds.length === 0)
    return

  removeResourceModalVisible.value = false
  removeTargetResourceIds.value = []
  if (targetResourceIds.length === 1) {
    const targetResourceId = String(targetResourceIds[0] || '').trim()
    if (targetResourceId)
      emit('removeProjectResource', targetResourceId)
    return
  }
  emit('removeProjectResources', targetResourceIds)
}

function restoreRecycleResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  emit('restoreProjectResource', targetResourceId)
}

function requestPurgeRecycleResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  purgeTargetResourceId.value = targetResourceId
  purgeResourceModalVisible.value = true
}

function closePurgeResourceModal() {
  if (props.resourceMutating)
    return
  purgeResourceModalVisible.value = false
  purgeTargetResourceId.value = ''
}

function confirmPurgeResource() {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  const targetResourceId = String(purgeTargetResourceId.value || '').trim()
  if (!targetResourceId)
    return

  purgeResourceModalVisible.value = false
  purgeTargetResourceId.value = ''
  emit('purgeProjectResource', targetResourceId)
}

function recycleDaysLeft(resource: Resource): number {
  const deletedAt = new Date(String(resource.updatedAt || resource.createdAt || '')).getTime()
  if (!Number.isFinite(deletedAt) || deletedAt <= 0)
    return recycleRetentionDays

  const oneDayMs = 24 * 60 * 60 * 1000
  const expiresAt = deletedAt + recycleRetentionDays * oneDayMs
  const leftMs = expiresAt - Date.now()
  if (leftMs <= 0)
    return 0
  return Math.ceil(leftMs / oneDayMs)
}

function recycleHint(resource: Resource): string {
  const leftDays = recycleDaysLeft(resource)
  if (leftDays <= 0)
    return '即将自动清理'
  return `${leftDays} 天后自动清理`
}

function closeResourceActionMenuByOutside(event: PointerEvent) {
  if (!resourceActionOpenId.value && !projectResourceBatchMenuOpen.value && !projectResourceAddMenuOpen.value)
    return

  const target = event.target as HTMLElement | null
  if (
    target?.closest('.wl-context-menu')
    || target?.closest('.workspace-resource-actions')
    || target?.closest('.workspace-recycle-item__actions')
    || target?.closest('.workspace-project-add-actions')
  ) {
    return
  }

  resourceActionOpenId.value = ''
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
}

function closeResourceActionMenuByEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  if (renamingResourceId.value) {
    cancelRenamingResource()
    return
  }
  resourceActionOpenId.value = ''
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
}

watch(() => props.selectedResources, (nextResources, previousResources) => {
  if (!projectResourcesHighlightInitialized.value) {
    projectResourcesHighlightInitialized.value = true
  }
  else if (props.projectResourcesRefreshing) {
    const previousResourceIdSet = new Set(
      (previousResources || [])
        .map(item => String(item.id || '').trim())
        .filter(Boolean),
    )
    queueProjectResourceHighlightedIds(
      nextResources
        .map(item => String(item.id || '').trim())
        .filter(id => id && !previousResourceIdSet.has(id)),
    )
  }

  const nextResourceIds = new Set(
    nextResources
      .map(item => String(item.id || '').trim())
      .filter(Boolean),
  )
  if (resourceActionOpenId.value && !nextResources.some(item => item.id === resourceActionOpenId.value))
    resourceActionOpenId.value = ''
  if (renamingResourceId.value && !nextResources.some(item => item.id === renamingResourceId.value))
    cancelRenamingResource()
  if (projectResourceBatchSelectedIds.value.length > 0) {
    projectResourceBatchSelectedIds.value = projectResourceBatchSelectedIds.value.filter(item => nextResourceIds.has(item))
    syncProjectResourceBatchSelectionToCurrentFilter()
  }
  if (removeTargetResourceIds.value.length > 0) {
    removeTargetResourceIds.value = removeTargetResourceIds.value.filter(item => nextResourceIds.has(item))
  }
  if (removeResourceModalVisible.value && removeTargetResourceIds.value.length === 0) {
    removeResourceModalVisible.value = false
  }
  if (resourceDetailTargetId.value && !nextResources.some(item => item.id === resourceDetailTargetId.value))
    closeResourceDetailPanel()
  if (shareTargetResourceId.value && !nextResources.some(item => item.id === shareTargetResourceId.value))
    closeShareResourceModal(true)

  if (!nextResources.length) {
    activeResourceId.value = ''
    return
  }

  syncActiveResourceToVisibleList(nextResources)
}, { immediate: true, deep: true })

watch(suppressResourceSelection, (next) => {
  if (next) {
    activeResourceId.value = ''
    resourceActionOpenId.value = ''
    return
  }

  if (!props.selectedResources.length)
    return

  syncActiveResourceToVisibleList(props.selectedResources)
}, { immediate: true })

watch(projectResourceTypeFilter, () => {
  syncProjectResourceBatchSelectionToCurrentFilter()
  syncActiveResourceToVisibleList(props.selectedResources)
})

watch(projectResourceTypeFilterOptions, (nextOptions) => {
  if (nextOptions.some(item => item.id === projectResourceTypeFilter.value))
    return
  projectResourceTypeFilter.value = 'all'
}, { immediate: true })

watch(projectResourceTree, (nextTree) => {
  const activeIds = new Set<string>()
  const walk = (nodes: ProjectResourceTreeNode[]) => {
    for (const node of nodes) {
      const resourceId = String(node.resource.id || '').trim()
      if (!resourceId)
        continue
      activeIds.add(resourceId)
      if (node.children.length > 0) {
        if (!(resourceId in treeExpanded))
          treeExpanded[resourceId] = true
        walk(node.children)
      }
    }
  }

  walk(nextTree)

  for (const resourceId of Object.keys(treeExpanded)) {
    if (!activeIds.has(resourceId))
      delete treeExpanded[resourceId]
  }
}, { immediate: true, deep: true })

watch(() => props.recycleResources, (nextResources) => {
  if (purgeTargetResourceId.value && !nextResources.some(item => item.id === purgeTargetResourceId.value)) {
    purgeTargetResourceId.value = ''
    purgeResourceModalVisible.value = false
  }
}, { immediate: true, deep: true })

watch(libraryModalVisible, (next) => {
  if (next) {
    resetLibraryListScroll()
    return
  }
  libraryModalKeyword.value = ''
  libraryImportParentResourceId.value = null
  resetLibraryListScroll()
})

watch(libraryModalKeyword, () => {
  if (!libraryModalVisible.value)
    return
  resetLibraryListScroll()
})

watch(outlineRows, (nextRows) => {
  if (!nextRows.length) {
    if (!pendingOutlineCommandId.value)
      activeOutlineId.value = ''
    return
  }

  if (pendingOutlineCommandId.value) {
    const pendingRowId = resolveOutlineCommandRowId(pendingOutlineCommandId.value)
    if (pendingRowId) {
      activeOutlineId.value = pendingRowId
      pendingOutlineCommandId.value = ''
      return
    }

    if (outlineSections.value.some(section => section.loading))
      return

    pendingOutlineCommandId.value = ''
  }

  const stillExists = nextRows.some(row => row.id === activeOutlineId.value)
  if (stillExists)
    return

  activeOutlineId.value = nextRows[0]?.id || ''
}, { immediate: true })

watch(() => props.commandSignal, (next, previous) => {
  if (next === previous)
    return

  const outlineId = String(props.commandOutlineId || '').trim()
  if (!outlineId)
    return

  pendingOutlineCommandId.value = outlineId
  const rowId = resolveOutlineCommandRowId(outlineId)
  if (rowId)
    activeOutlineId.value = rowId
  sectionExpanded.outline = true
}, { immediate: true })

watch(linkedContestResourceGroups, (groups, previousGroups) => {
  if (!resourceLibraryHighlightInitialized.value) {
    resourceLibraryHighlightInitialized.value = true
  }
  else if (props.resourceLibraryRefreshing) {
    const previousResourceIdSet = new Set(flattenLinkedContestResourceIds(previousGroups || []))
    queueResourceLibraryHighlightedIds(
      flattenLinkedContestResourceIds(groups).filter(id => !previousResourceIdSet.has(id)),
    )
  }

  const activeKeys = new Set<string>()
  for (const group of groups) {
    for (const category of group.categories) {
      const stateKey = linkedCategoryStateKey(group.contestId, category.id)
      activeKeys.add(stateKey)
      if (!(stateKey in linkedCategoryExpanded))
        linkedCategoryExpanded[stateKey] = true
    }
  }

  for (const stateKey of Object.keys(linkedCategoryExpanded)) {
    if (!activeKeys.has(stateKey))
      delete linkedCategoryExpanded[stateKey]
  }
}, { immediate: true, deep: true })

watch(() => props.aiFiltering, (next) => {
  if (!next)
    return
  showReason.value = false
  showAdminDetails.value = false
})

watch(hasReasoning, (next) => {
  if (next)
    return
  showReason.value = false
})

watch(() => props.hasActiveProject, (next) => {
  if (next)
    return
  libraryModalVisible.value = false
  libraryImportParentResourceId.value = null
  uploadParentResourceId.value = null
  projectResourceBatchEditMode.value = false
  projectResourceBatchSelectedIds.value = []
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
  closeResourceDetailPanel()
  shareTargetResourceId.value = ''
  shareResourceModalVisible.value = false
  removeTargetResourceIds.value = []
  removeResourceModalVisible.value = false
  purgeTargetResourceId.value = ''
  purgeResourceModalVisible.value = false
})

watch(() => sectionExpanded.projectResources, (expanded) => {
  if (expanded)
    return
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
  shareTargetResourceId.value = ''
  shareResourceModalVisible.value = false
})

watch(() => props.resourceMutating, (next) => {
  if (!next)
    return
  projectResourceBatchMenuOpen.value = false
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
})

onMounted(() => {
  if (!import.meta.client)
    return

  const saved = localStorage.getItem(LEFT_MODULE_STORAGE_KEY)
  if (saved && isWorkspaceLeftModuleId(saved))
    activeModule.value = saved

  document.addEventListener('pointerdown', closeResourceActionMenuByOutside)
  document.addEventListener('keydown', closeResourceActionMenuByEscape)
})

watch(activeModule, (value) => {
  if (!import.meta.client)
    return
  localStorage.setItem(LEFT_MODULE_STORAGE_KEY, value)
})

onBeforeUnmount(() => {
  if (!import.meta.client)
    return
  stopResourceKnowledgePolling()
  document.removeEventListener('pointerdown', closeResourceActionMenuByOutside)
  document.removeEventListener('keydown', closeResourceActionMenuByEscape)
})
</script>

<template>
  <div class="workspace-left-panel__feature workspace-resource-manager-panel">
    <div class="workspace-left-panel__body workspace-resource-manager-panel__body no-scrollbar">
      <template v-if="recyclePanelOpen">
        <section class="workspace-tree-block workspace-tree-block--recycle-panel">
          <header class="workspace-recycle-panel__header">
            <span class="material-symbols-outlined">delete</span>
            <h3>项目回收站</h3>
          </header>
          <p class="workspace-recycle-panel__hint">
            删除后文件默认保留 30 天，你可在此恢复文件或彻底删除。
          </p>

          <div
            v-for="resource in visibleRecycleResources"
            :key="`recycle-${resource.id}`"
            class="workspace-recycle-item"
          >
            <div class="workspace-recycle-item__content">
              <div class="workspace-recycle-item__title" :title="resourceDisplayTitle(resource)">
                {{ resourceDisplayTitle(resource) }}
              </div>
              <div class="workspace-recycle-item__meta">
                {{ recycleHint(resource) }}
              </div>
            </div>

            <div class="workspace-recycle-item__actions">
              <button
                class="workspace-recycle-item__action workspace-recycle-item__action--ghost"
                type="button"
                :disabled="resourceMutating || !hasActiveProject"
                @click="restoreRecycleResource(resource.id)"
              >
                恢复
              </button>
              <button
                class="workspace-recycle-item__action workspace-recycle-item__action--danger"
                type="button"
                :disabled="resourceMutating || !hasActiveProject"
                @click="requestPurgeRecycleResource(resource.id)"
              >
                彻底删除
              </button>
            </div>
          </div>

          <p v-if="visibleRecycleResources.length === 0" class="workspace-empty-text">
            暂无已删除文件
          </p>
        </section>
      </template>

      <template v-else>
        <section class="workspace-tree-block">
          <div class="workspace-tree-block__title-row workspace-tree-block__title-row--sticky">
            <button
              class="workspace-tree-block__title"
              type="button"
              :aria-expanded="sectionExpanded.projectResources"
              @click="toggleSection('projectResources')"
            >
              <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.projectResources }">
                keyboard_arrow_down
              </span>
              <span>项目资料</span>
            </button>
            <div class="workspace-project-add-actions">
              <input
                ref="projectResourceUploadInputRef"
                class="workspace-project-add-actions__input"
                type="file"
                multiple
                :accept="PROJECT_RESOURCE_UPLOAD_ACCEPT_ATTR"
                @change="handleProjectResourceUploadInputChange"
              >
              <button
                class="workspace-tree-block__title-action"
                :class="{ 'workspace-tree-block__title-action--active': projectResourceBatchEditMode }"
                type="button"
                title="批量管理"
                aria-label="批量管理"
                aria-haspopup="menu"
                :aria-expanded="projectResourceBatchMenuOpen"
                data-context-menu-scope="resource-batch"
                :disabled="resourceMutating || !hasActiveProject"
                @click.stop="requestProjectResourceBatchMenu($event.currentTarget as HTMLElement | null)"
                @keydown="requestProjectResourceBatchMenuByKeyboard"
              >
                <span class="material-symbols-outlined">checklist</span>
              </button>
              <button
                class="workspace-resource-filter"
                :class="{
                  'workspace-resource-filter--active': projectResourceFilterActive,
                  'workspace-resource-filter--with-label': projectResourceFilterActive,
                }"
                type="button"
                :title="projectResourceFilterButtonLabel"
                :aria-label="projectResourceFilterButtonLabel"
                aria-haspopup="menu"
                :disabled="resourceMutating || !hasActiveProject || projectResourceTypeFilterOptions.length <= 1"
                @click.stop="requestProjectResourceFilterMenu($event.currentTarget as HTMLElement | null)"
                @keydown="requestProjectResourceFilterMenuByKeyboard"
              >
                <span class="material-symbols-outlined">filter_alt</span>
                <span v-if="projectResourceFilterActive" class="workspace-resource-filter__label">{{ projectResourceTypeFilterLabel }}</span>
              </button>
              <button
                class="workspace-tree-block__title-action"
                type="button"
                title="添加资源"
                aria-label="添加资源"
                aria-haspopup="menu"
                :aria-expanded="projectResourceAddMenuOpen"
                data-context-menu-scope="resource-add"
                :disabled="resourceMutating || !hasActiveProject"
                @click.stop="requestProjectResourceAddMenu($event.currentTarget as HTMLElement | null)"
                @keydown="requestProjectResourceAddMenuByKeyboard"
              >
                <span class="material-symbols-outlined">add</span>
              </button>
            </div>
            <span v-if="projectResourcesRefreshing" class="workspace-tree-block__refresh-indicator">
              <span class="workspace-tree-block__refresh-indicator-dot" aria-hidden="true" />
              <span>刷新中</span>
            </span>
          </div>

          <div v-if="projectResourceBatchEditMode && sectionExpanded.projectResources" class="workspace-resource-batch-toolbar">
            <div class="workspace-resource-batch-toolbar__summary">
              批量编辑中，已选 {{ projectResourceBatchSelectedCount }} 项<span v-if="projectResourceFilterActive"> · 当前筛选：{{ projectResourceTypeFilterLabel }}</span>
            </div>
            <div class="workspace-resource-batch-toolbar__actions">
              <button
                class="workspace-resource-batch-toolbar__action"
                type="button"
                :disabled="resourceMutating || projectResourceIds.length === 0"
                @click="toggleProjectResourceBatchSelectAll"
              >
                {{ projectResourceBatchAllSelected ? '取消全选' : '全选全部' }}
              </button>
              <button
                class="workspace-resource-batch-toolbar__action"
                type="button"
                :disabled="resourceMutating || projectResourceBatchSelectedCount === 0"
                @click="clearProjectResourceBatchSelection"
              >
                清空选择
              </button>
              <button
                class="workspace-resource-batch-toolbar__action workspace-resource-batch-toolbar__action--danger"
                type="button"
                :disabled="resourceMutating || projectResourceBatchSelectedCount === 0"
                @click="requestBatchRemoveResources"
              >
                批量删除
              </button>
              <button
                class="workspace-resource-batch-toolbar__action"
                type="button"
                :disabled="resourceMutating"
                @click="exitProjectResourceBatchEditMode()"
              >
                完成
              </button>
            </div>
          </div>

          <div v-show="sectionExpanded.projectResources">
            <div
              v-for="task in visibleUploadTasks"
              :key="task.sessionId"
              class="workspace-tree-item-row workspace-tree-item-row--upload"
            >
              <div class="workspace-upload-task-item" :class="uploadTaskToneClass(task)">
                <span class="material-symbols-outlined workspace-tree-item__icon" :class="uploadTaskIconClass(task)">
                  {{ uploadTaskIcon(task) }}
                </span>
                <div class="workspace-upload-task-item__content">
                  <div class="workspace-upload-task-item__header">
                    <span class="workspace-tree-item__label">{{ task.fileName }}</span>
                    <span class="workspace-upload-task-item__status">{{ uploadTaskStatusText(task) }}</span>
                  </div>
                  <div class="workspace-upload-task-item__meta" :title="uploadTaskMetaText(task)">
                    {{ uploadTaskMetaText(task) }}
                  </div>
                </div>
                <span
                  class="workspace-upload-ring"
                  :class="[
                    uploadTaskToneClass(task),
                    task.status === 'finalizing' ? 'workspace-upload-ring--indeterminate' : '',
                  ]"
                  :style="uploadTaskProgressStyle(task)"
                  aria-hidden="true"
                >
                  <span class="workspace-upload-ring__core" />
                </span>
                <div class="workspace-upload-task-item__actions">
                  <button
                    v-if="canPauseUploadTask(task)"
                    class="workspace-upload-task-item__action"
                    type="button"
                    @click="pauseUploadTask(task.sessionId)"
                  >
                    暂停
                  </button>
                  <button
                    v-if="canResumeUploadTask(task)"
                    class="workspace-upload-task-item__action"
                    type="button"
                    @click="resumeUploadTask(task.sessionId)"
                  >
                    继续
                  </button>
                  <button
                    v-if="canRetryUploadTask(task)"
                    class="workspace-upload-task-item__action"
                    type="button"
                    @click="retryUploadTask(task.sessionId)"
                  >
                    重试
                  </button>
                  <button
                    v-if="canRebindUploadTask(task)"
                    class="workspace-upload-task-item__action"
                    type="button"
                    @click="rebindUploadTask(task.sessionId)"
                  >
                    绑定文件
                  </button>
                  <button
                    v-if="canCancelUploadTask(task)"
                    class="workspace-upload-task-item__action workspace-upload-task-item__action--danger"
                    type="button"
                    @click="cancelUploadTask(task.sessionId)"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>

            <template v-if="projectResourcesLoading">
              <div
                v-for="row in projectResourceSkeletonRows"
                :key="`resource-skeleton-${row}`"
                class="workspace-tree-item-row workspace-tree-item-row--skeleton"
                aria-hidden="true"
              >
                <div class="workspace-tree-item workspace-tree-item--skeleton">
                  <span class="workspace-tree-item__icon-skeleton workspace-skeleton" />
                  <span class="workspace-tree-item__content-skeleton">
                    <span class="workspace-tree-item__label-skeleton workspace-skeleton" />
                    <span class="workspace-tree-item__meta-skeleton workspace-skeleton" />
                  </span>
                  <span class="workspace-tree-item__action-skeleton workspace-skeleton" />
                </div>
              </div>
            </template>
            <template v-else>
              <div
                v-for="row in visibleResources"
                :key="row.resource.id"
                class="workspace-resource-tree-entry"
              >
                <div
                  v-if="!projectResourceBatchEditMode"
                  class="workspace-tree-dropzone"
                  :class="{ 'workspace-tree-dropzone--active': dragOverResourceId === row.resource.id && dragOverPosition === 'before' }"
                  :style="{ marginLeft: resolveTreeDepthOffset(row.depth) }"
                  @dragover="handleResourceDragOver(row.resource.id, 'before', $event)"
                  @dragleave="handleResourceDragLeave(row.resource.id, 'before')"
                  @drop="handleResourceDrop(row.resource.id, 'before', $event)"
                />

                <WorkspaceSidebarTreeRow
                  :active="!projectResourceBatchEditMode && !suppressResourceSelection && row.resource.id === activeResourceId"
                  :batch-selected="projectResourceBatchEditMode && isProjectResourceBatchSelected(row.resource.id)"
                  :menu-open="resourceActionOpenId === row.resource.id"
                  :drop-inside="dragOverResourceId === row.resource.id && dragOverPosition === 'inside'"
                  :fresh="isProjectResourceHighlighted(row.resource.id)"
                  :padding-left="resolveTreeDepthOffset(row.depth)"
                  @contextmenu="handleResourceItemContextMenu(row.resource.id, $event)"
                  @dragover="handleResourceDragOver(row.resource.id, 'inside', $event)"
                  @dragleave="handleResourceDragLeave(row.resource.id, 'inside')"
                  @drop="handleResourceDrop(row.resource.id, 'inside', $event)"
                >
                  <label v-if="projectResourceBatchEditMode" class="workspace-tree-item__checkbox" :title="`选择 ${resourceDisplayTitle(row.resource)}`">
                    <input
                      class="workspace-tree-item__checkbox-input"
                      type="checkbox"
                      :checked="isProjectResourceBatchSelected(row.resource.id)"
                      @click.stop
                      @change="setProjectResourceBatchSelection(row.resource.id, ($event.target as HTMLInputElement).checked)"
                    >
                  </label>
                  <button
                    class="workspace-tree-item__expander"
                    :class="{ 'workspace-tree-item__expander--placeholder': !row.hasChildren }"
                    type="button"
                    :disabled="!row.hasChildren"
                    @click.stop="toggleProjectResourceExpansion(row.resource.id)"
                  >
                    <span v-if="row.hasChildren" class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !row.expanded }">
                      keyboard_arrow_down
                    </span>
                  </button>

                  <div
                    v-if="renamingResourceId === row.resource.id"
                    class="workspace-tree-item workspace-tree-item--active"
                  >
                    <span class="material-symbols-outlined workspace-tree-item__icon" :class="resourceIconClass(row.resource)">
                      {{ resourceIcon(row.resource) }}
                    </span>
                    <input
                      v-model="renamingResourceDraft"
                      :data-resource-rename-id="row.resource.id"
                      class="text-[12px] text-slate-700 font-medium px-2 py-1 outline-none border border-blue-200 rounded-lg bg-white flex-1 min-w-0 ring-0 focus:border-blue-400"
                      type="text"
                      @blur="submitRenamingResource"
                      @click.stop
                      @keydown.enter.prevent="submitRenamingResource"
                      @keydown.esc.prevent="cancelRenamingResource"
                    >
                  </div>
                  <button
                    v-else
                    class="workspace-tree-item"
                    :class="{ 'workspace-tree-item--active': !projectResourceBatchEditMode && !suppressResourceSelection && row.resource.id === activeResourceId }"
                    :title="resourceDisplayTitle(row.resource)"
                    type="button"
                    aria-haspopup="menu"
                    :aria-expanded="resourceActionOpenId === row.resource.id ? 'true' : 'false'"
                    data-context-menu-scope="resource"
                    :data-context-resource-id="row.resource.id"
                    :draggable="!projectResourceBatchEditMode"
                    @dragstart="handleResourceDragStart(row.resource.id, $event)"
                    @dragend="handleResourceDragEnd"
                    @click="handleProjectResourcePrimaryAction(row.resource)"
                    @dblclick.stop.prevent="startRenamingResource(row.resource.id)"
                    @keydown="requestResourceActionMenuByKeyboard(row.resource.id, $event)"
                  >
                    <span class="material-symbols-outlined workspace-tree-item__icon" :class="resourceIconClass(row.resource)">
                      {{ resourceIcon(row.resource) }}
                    </span>
                    <span class="workspace-tree-item__label">{{ resourceDisplayTitle(row.resource) }}</span>
                  </button>

                  <template v-if="!projectResourceBatchEditMode" #actions>
                    <button
                      class="workspace-resource-actions__trigger"
                      type="button"
                      title="资源操作"
                      aria-label="资源操作"
                      aria-haspopup="menu"
                      :aria-expanded="resourceActionOpenId === row.resource.id ? 'true' : 'false'"
                      :disabled="resourceMutating || !hasActiveProject"
                      @click.stop="toggleResourceActionMenu(row.resource.id, $event.currentTarget as HTMLElement | null)"
                      @keydown="requestResourceActionMenuByKeyboard(row.resource.id, $event)"
                    >
                      <span class="material-symbols-outlined">more_horiz</span>
                    </button>
                  </template>
                </WorkspaceSidebarTreeRow>

                <div
                  v-if="!projectResourceBatchEditMode"
                  class="workspace-tree-dropzone"
                  :class="{ 'workspace-tree-dropzone--active': dragOverResourceId === row.resource.id && dragOverPosition === 'after' }"
                  :style="{ marginLeft: resolveTreeDepthOffset(row.depth) }"
                  @dragover="handleResourceDragOver(row.resource.id, 'after', $event)"
                  @dragleave="handleResourceDragLeave(row.resource.id, 'after')"
                  @drop="handleResourceDrop(row.resource.id, 'after', $event)"
                />
              </div>

              <p v-if="visibleUploadTasks.length === 0 && visibleResources.length === 0" class="workspace-empty-text">
                {{ projectResourceFilterActive ? `当前筛选（${projectResourceTypeFilterLabel}）暂无资源` : '暂无资源' }}
              </p>
            </template>
          </div>
        </section>

        <section class="workspace-tree-block">
          <div class="workspace-tree-block__title-row workspace-tree-block__title-row--sticky">
            <button
              class="workspace-tree-block__title"
              type="button"
              :aria-expanded="sectionExpanded.meetingNotes"
              @click="toggleSection('meetingNotes')"
            >
              <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.meetingNotes }">
                keyboard_arrow_down
              </span>
              <span>会议纪要</span>
            </button>
          </div>

          <div v-show="sectionExpanded.meetingNotes">
            <div
              v-for="row in visibleMeetingNoteResources"
              :key="`meeting-${row.resource.id}`"
              class="workspace-resource-tree-entry"
            >
              <WorkspaceSidebarTreeRow
                :active="!suppressResourceSelection && row.resource.id === activeResourceId"
                :fresh="isProjectResourceHighlighted(row.resource.id)"
                :padding-left="resolveTreeDepthOffset(row.depth)"
              >
                <button
                  class="workspace-tree-item__expander"
                  :class="{ 'workspace-tree-item__expander--placeholder': !row.hasChildren }"
                  type="button"
                  :disabled="!row.hasChildren"
                  @click.stop="toggleProjectResourceExpansion(row.resource.id)"
                >
                  <span v-if="row.hasChildren" class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !row.expanded }">
                    keyboard_arrow_down
                  </span>
                </button>

                <button
                  class="workspace-tree-item"
                  :class="{ 'workspace-tree-item--active': !suppressResourceSelection && row.resource.id === activeResourceId }"
                  :title="resourceDisplayTitle(row.resource)"
                  type="button"
                  @click="openResource(row.resource)"
                >
                  <span class="material-symbols-outlined workspace-tree-item__icon" :class="resourceIconClass(row.resource)">
                    {{ resourceIcon(row.resource) }}
                  </span>
                  <span class="workspace-tree-item__label">{{ resourceDisplayTitle(row.resource) }}</span>
                </button>
              </WorkspaceSidebarTreeRow>
            </div>

            <p v-if="visibleMeetingNoteResources.length === 0" class="workspace-empty-text">
              暂无会议纪要
            </p>
          </div>
        </section>

        <section class="workspace-tree-block">
          <div class="workspace-tree-block__title-row workspace-tree-block__title-row--sticky">
            <button
              class="workspace-tree-block__title"
              type="button"
              :aria-expanded="sectionExpanded.linkedContestResources"
              @click="toggleSection('linkedContestResources')"
            >
              <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.linkedContestResources }">
                keyboard_arrow_down
              </span>
              <span>关联比赛资料</span>
            </button>
            <span v-if="resourceLibraryRefreshing" class="workspace-tree-block__refresh-indicator">
              <span class="workspace-tree-block__refresh-indicator-dot" aria-hidden="true" />
              <span>刷新中</span>
            </span>
          </div>

          <div v-show="sectionExpanded.linkedContestResources" class="workspace-tree-block__content">
            <template v-if="resourceLibraryLoading">
              <div
                v-for="row in resourceLibrarySkeletonRows"
                :key="`linked-library-skeleton-${row}`"
                class="workspace-library-skeleton-item"
                aria-hidden="true"
              >
                <div class="workspace-library-skeleton-item__left">
                  <span class="workspace-library-skeleton-item__icon workspace-skeleton" />
                  <div class="workspace-library-skeleton-item__content">
                    <div class="workspace-library-skeleton-item__title workspace-skeleton" />
                    <div class="workspace-library-skeleton-item__meta workspace-skeleton" />
                  </div>
                </div>
                <span class="workspace-library-skeleton-item__action workspace-skeleton" />
              </div>
            </template>
            <template v-else-if="linkedContestResourceGroups.length > 0">
              <div
                v-for="group in linkedContestResourceGroups"
                :key="group.contestId"
                class="workspace-linked-library-group"
              >
                <div class="workspace-linked-library-group__header">
                  <div class="workspace-linked-library-group__title">
                    {{ group.contestName }}
                  </div>
                  <div class="workspace-linked-library-group__meta">
                    {{ group.trackName || '未匹配赛道' }} · {{ group.resources.length }} 份待导入资料
                  </div>
                </div>

                <div
                  v-for="category in group.categories"
                  :key="`${group.contestId}-${category.id}`"
                  class="workspace-linked-library-category"
                >
                  <button
                    class="workspace-linked-library-category__toggle"
                    type="button"
                    :aria-expanded="isLinkedCategoryExpanded(group.contestId, category.id)"
                    @click="toggleLinkedCategory(group.contestId, category.id)"
                  >
                    <span
                      class="material-symbols-outlined"
                      :class="{ 'workspace-tree-block__arrow--collapsed': !isLinkedCategoryExpanded(group.contestId, category.id) }"
                    >
                      keyboard_arrow_down
                    </span>
                    <span class="workspace-linked-library-category__title">{{ category.label }}</span>
                    <span class="workspace-linked-library-category__count">{{ category.resources.length }}</span>
                  </button>

                  <div v-show="isLinkedCategoryExpanded(group.contestId, category.id)">
                    <div
                      v-for="item in category.resources"
                      :key="item.id"
                      class="workspace-library-item"
                      :class="{ 'workspace-library-item--fresh': isResourceLibraryHighlighted(item.id) }"
                    >
                      <div class="workspace-library-item__content">
                        <div class="workspace-library-item__title">
                          {{ resourceDisplayTitle(item) }}
                        </div>
                        <div class="workspace-library-item__meta">
                          {{ item.type }} · {{ item.year }}
                        </div>
                      </div>
                      <button
                        class="workspace-library-item__add"
                        type="button"
                        :disabled="resourceMutating || !hasActiveProject"
                        @click="addLibraryResource(item.id)"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </div>

                <p v-if="group.resources.length === 0" class="workspace-empty-text">
                  当前比赛暂无待导入资料
                </p>
              </div>
            </template>
            <p v-else class="workspace-empty-text">
              {{ linkedContestBindingCount > 0 ? '当前关联比赛暂无可导入资料' : '请先在项目设置中关联比赛' }}
            </p>
          </div>
        </section>

        <section class="workspace-tree-block">
          <button
            class="workspace-tree-block__title"
            type="button"
            :aria-expanded="sectionExpanded.outline"
            @click="toggleSection('outline')"
          >
            <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.outline }">
              keyboard_arrow_down
            </span>
            <span>结构大纲</span>
          </button>

          <div v-show="sectionExpanded.outline">
            <div
              v-for="section in outlineSections"
              :key="section.id"
              class="workspace-outline-section"
            >
              <div class="workspace-outline-section__title">
                {{ section.title }}
              </div>

              <template v-if="section.loading && resolveOutlineSectionRows(section.id).length === 0">
                <div
                  v-for="row in outlineSkeletonRows"
                  :key="`${section.id}-outline-skeleton-${row}`"
                  class="workspace-outline-skeleton-row"
                  :class="{ 'workspace-outline-skeleton-row--child': row % 2 === 0 }"
                  aria-hidden="true"
                >
                  <span class="workspace-outline-skeleton__dot workspace-skeleton" />
                  <div class="workspace-outline-skeleton workspace-skeleton" />
                </div>
              </template>
              <template v-else-if="resolveOutlineSectionRows(section.id).length > 0">
                <template
                  v-for="row in resolveOutlineSectionRows(section.id)"
                  :key="row.id"
                >
                  <div
                    v-if="row.node.kind === 'upload_task'"
                    class="workspace-outline-item workspace-outline-item--upload"
                    :class="outlineUploadTaskToneClass(row.node)"
                    :style="{ paddingLeft: resolveOutlineNodeIndent(row.node.depth) }"
                    :title="row.node.label"
                  >
                    <div class="workspace-tree-item__content">
                      <span class="workspace-tree-item__label">{{ row.node.label }}</span>
                      <span class="workspace-tree-item__meta">{{ row.node.statusText || '处理中' }}</span>
                    </div>
                    <span
                      class="workspace-upload-ring workspace-upload-ring--outline"
                      :class="[
                        outlineUploadTaskToneClass(row.node),
                        outlineUploadTaskIndeterminate(row.node) ? 'workspace-upload-ring--indeterminate' : '',
                      ]"
                      :style="outlineUploadTaskProgressStyle(row.node)"
                      aria-hidden="true"
                    >
                      <span class="workspace-upload-ring__core" />
                    </span>
                  </div>
                  <WorkspaceSidebarTreeRow
                    v-else
                    :active="activeOutlineId === row.id"
                    :menu-open="outlineActionMenuOpenId === row.id"
                    :padding-left="resolveOutlineNodeIndent(row.node.depth)"
                  >
                    <button
                      class="workspace-tree-item workspace-tree-item--stacked"
                      :class="{ 'workspace-tree-item--active': activeOutlineId === row.id }"
                      type="button"
                      :title="row.node.meta ? `${row.node.label} · ${row.node.meta}` : row.node.label"
                      @click="selectOutline(row)"
                    >
                      <span class="workspace-tree-item__lead-spacer" aria-hidden="true" />
                      <span class="workspace-tree-item__content">
                        <span class="workspace-tree-item__label">{{ row.node.label }}</span>
                        <span v-if="row.node.meta" class="workspace-tree-item__meta">
                          {{ row.node.meta }}
                        </span>
                      </span>
                    </button>

                    <template #actions>
                      <button
                        class="workspace-resource-actions__trigger"
                        type="button"
                        :aria-label="`复制 ${row.node.label} 的定位链接`"
                        :title="`复制 ${row.node.label} 的定位链接`"
                        data-testid="workspace-outline-item-link-trigger"
                        @click.stop="void copyOutlineItemLink(row.node)"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">link</span>
                      </button>
                      <button
                        class="workspace-resource-actions__trigger"
                        type="button"
                        :aria-label="`${row.node.label} 的更多操作`"
                        title="更多操作"
                        data-testid="workspace-outline-item-menu-trigger"
                        @click.stop="handleOutlineItemMenuTrigger(row, $event)"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>
                      </button>
                    </template>
                  </WorkspaceSidebarTreeRow>
                </template>
              </template>
              <p v-else class="workspace-empty-text workspace-empty-text--outline">
                {{ section.emptyText }}
              </p>
            </div>
          </div>
        </section>

        <a-modal
          v-model:visible="libraryModalVisible"
          title="添加项目资源"
          width="560px"
          :footer="false"
          :esc-to-close="!resourceMutating"
          :mask-closable="!resourceMutating"
        >
          <div class="workspace-library-modal">
            <input
              v-model="libraryModalKeyword"
              class="workspace-library-search"
              placeholder="搜索系统库资源"
              type="text"
            >

            <div ref="libraryListRef" class="workspace-library-list no-scrollbar">
              <div
                v-for="item in visibleLibraryResources"
                :key="item.id"
                class="workspace-library-item"
              >
                <div class="workspace-library-item__content">
                  <div class="workspace-library-item__title">
                    {{ resourceDisplayTitle(item) }}
                  </div>
                  <div class="workspace-library-item__meta">
                    {{ item.type }} · {{ item.year }}
                  </div>
                </div>
                <button
                  class="workspace-library-item__add"
                  type="button"
                  :disabled="resourceMutating || !hasActiveProject"
                  @click="addLibraryResource(item.id)"
                >
                  添加
                </button>
              </div>
            </div>

            <p v-if="visibleLibraryResources.length === 0" class="workspace-empty-text workspace-empty-text--modal">
              暂无资源
            </p>
          </div>
        </a-modal>

        <a-modal
          v-model:visible="shareResourceModalVisible"
          title="分享链接"
          width="480px"
          :footer="false"
          :esc-to-close="!resourceMutating"
          :mask-closable="!resourceMutating"
        >
          <div class="workspace-share-modal">
            <p class="workspace-share-modal__target">
              文件：{{ shareTargetResourceLabel }}
            </p>

            <label class="workspace-share-modal__field">
              <span>可见范围</span>
              <select
                v-model="shareVisibility"
                class="workspace-share-modal__select"
                :disabled="resourceMutating"
              >
                <option value="public">
                  公开可见
                </option>
                <option value="workspace">
                  组织内成员可见
                </option>
              </select>
            </label>

            <label class="workspace-share-modal__field">
              <span>有效期</span>
              <select
                v-model="shareDuration"
                class="workspace-share-modal__select"
                :disabled="resourceMutating"
              >
                <option value="1h">
                  1h
                </option>
                <option value="1d">
                  1d
                </option>
                <option value="3d">
                  3d
                </option>
                <option value="7d">
                  7d
                </option>
                <option value="1mon">
                  1mon
                </option>
              </select>
            </label>

            <div class="workspace-share-modal__actions">
              <button
                class="workspace-delete-modal__btn workspace-delete-modal__btn--ghost"
                type="button"
                :disabled="resourceMutating"
                @click="closeShareResourceModal()"
              >
                取消
              </button>
              <button
                class="workspace-delete-modal__btn workspace-share-modal__btn--primary"
                type="button"
                :disabled="resourceMutating"
                @click="confirmShareResource"
              >
                {{ resourceMutating ? '生成中...' : '生成分享链接' }}
              </button>
            </div>
          </div>
        </a-modal>

        <a-modal
          v-model:visible="removeResourceModalVisible"
          title="删除项目资源"
          width="460px"
          :footer="false"
          :esc-to-close="!resourceMutating"
          :mask-closable="!resourceMutating"
        >
          <div class="workspace-delete-modal">
            <p>
              {{ removeResourceModalMessage }}
            </p>
            <p class="workspace-delete-modal__hint">
              删除后文件将移入项目回收站，30 天后自动清理；你也可在回收站手动彻底删除。
            </p>

            <div class="workspace-delete-modal__actions">
              <button
                class="workspace-delete-modal__btn workspace-delete-modal__btn--ghost"
                type="button"
                :disabled="resourceMutating"
                @click="closeRemoveResourceModal"
              >
                取消
              </button>
              <button
                class="workspace-delete-modal__btn workspace-delete-modal__btn--danger"
                type="button"
                :disabled="resourceMutating"
                @click="confirmRemoveResource"
              >
                {{ resourceMutating ? '删除中...' : removeTargetResourceCount > 1 ? '确认批量删除' : '确认删除' }}
              </button>
            </div>
          </div>
        </a-modal>

        <a-modal
          v-model:visible="purgeResourceModalVisible"
          title="彻底删除资源"
          width="460px"
          :footer="false"
          :esc-to-close="!resourceMutating"
          :mask-closable="!resourceMutating"
        >
          <div class="workspace-delete-modal">
            <p>
              确认彻底删除「{{ purgeTargetResourceLabel }}」吗？
            </p>
            <p class="workspace-delete-modal__hint">
              彻底删除后将立即释放存储空间，且无法恢复。
            </p>

            <div class="workspace-delete-modal__actions">
              <button
                class="workspace-delete-modal__btn workspace-delete-modal__btn--ghost"
                type="button"
                :disabled="resourceMutating"
                @click="closePurgeResourceModal"
              >
                取消
              </button>
              <button
                class="workspace-delete-modal__btn workspace-delete-modal__btn--danger"
                type="button"
                :disabled="resourceMutating"
                @click="confirmPurgeResource"
              >
                {{ resourceMutating ? '删除中...' : '确认彻底删除' }}
              </button>
            </div>
          </div>
        </a-modal>

        <a-modal
          v-model:visible="resourceDetailModalVisible"
          title="资源属性"
          width="620px"
          :footer="false"
          :esc-to-close="true"
          :mask-closable="true"
          @cancel="closeResourceDetailPanel"
        >
          <div class="workspace-resource-detail">
            <div class="workspace-resource-detail__title" :title="resourceDetailTitle">
              {{ resourceDetailTitle }}
            </div>

            <a-descriptions :column="1" bordered size="small">
              <a-descriptions-item v-for="item in resourceDetailRows" :key="item.label" :label="item.label">
                <span class="workspace-resource-detail__value" :title="item.value">{{ item.value }}</span>
              </a-descriptions-item>
            </a-descriptions>

            <div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-slate-800">
                    知识索引
                  </div>
                  <div class="mt-1 text-xs text-slate-500">
                    {{ resourceKnowledgeHeadline }}
                  </div>
                </div>

                <a-button
                  size="mini"
                  type="outline"
                  :loading="resourceKnowledgeRetrying"
                  :disabled="!props.activeProjectId || resourceKnowledgeLoading"
                  @click="reindexResourceKnowledge"
                >
                  {{ resourceKnowledgeRetrying ? '重新索引中...' : '重新索引' }}
                </a-button>
              </div>

              <div v-if="resourceKnowledgeLoading" class="text-xs text-slate-500">
                正在加载索引状态...
              </div>

              <div v-else-if="resourceKnowledgeError" class="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                {{ resourceKnowledgeError }}
              </div>

              <a-descriptions v-else-if="resourceKnowledgeStatus" :column="1" bordered size="small">
                <a-descriptions-item v-for="item in resourceKnowledgeRows" :key="item.label" :label="item.label">
                  <span class="workspace-resource-detail__value" :title="item.value">{{ item.value }}</span>
                </a-descriptions-item>
              </a-descriptions>

              <div v-else class="text-xs text-slate-500">
                当前资源暂未返回索引快照。
              </div>
            </div>

            <div class="workspace-resource-detail__actions">
              <a-button size="small" @click="closeResourceDetailPanel">
                关闭
              </a-button>
            </div>
          </div>
        </a-modal>
      </template>
    </div>

    <WorkspaceResourceUploadHint
      v-if="!recyclePanelOpen"
      class="workspace-left-panel__footer"
      :busy="resourceMutating"
      :disabled="!hasActiveProject || resourceMutating"
      @select-files="handleResourceUpload"
    />
  </div>
</template>
