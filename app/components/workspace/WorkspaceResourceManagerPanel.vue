<script setup lang="ts">
import type {
  CollabPurpose,
  Contest,
  ProjectIssue,
  ProjectIssueReport,
  ProjectMemberSummary,
  ProjectOutlineNode,
  ProjectResourceShareDurationPreset,
  ProjectResourceShareVisibility,
  Resource,
  ResourceCategory,
} from '~~/shared/types/domain'
import type { ProjectUploadTask } from '~/types/project-upload'
import type { WorkspaceLinkedContestResourceGroup } from '~/types/workspace'
import { formatFileSize, PROJECT_RESOURCE_UPLOAD_ACCEPT_ATTR } from '~~/shared/constants/project-resource-upload'
import {
  isProjectUploadTaskSidebarVisible,
  resolveProjectUploadTaskStatusText,
  resolveProjectUploadTaskTone,
} from '~/utils/project-upload'

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

interface OutlineItem {
  id: string
  label: string
  level: number
  uploadTask?: ProjectUploadTask
  statusText?: string
  progressPercent?: number
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

type ResourceSectionId = 'projectResources' | 'linkedContestResources' | 'outline'

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
  'createCollabResource': [payload: { kind: 'markdown' | 'draw', parentResourceId?: string | null }]
  'openDefenseMode': []
  'reloadIssues': []
  'addResourceFromLibrary': [payload: { resourceId: string, parentResourceId?: string | null }]
  'patchProjectResourceTree': [payload: { items: Array<{ resourceId: string, parentResourceId: string | null, sortOrder: number }> }]
  'openResource': [resourceId: string]
  'downloadProjectResource': [resourceId: string]
  'copyProjectResourceName': [resourceId: string]
  'shareProjectResource': [payload: ShareProjectResourcePayload]
  'duplicateProjectResource': [resourceId: string]
  'removeProjectResource': [resourceId: string]
  'restoreProjectResource': [resourceId: string]
  'purgeProjectResource': [resourceId: string]
  'uploadResources': [payload: { files: File[], parentResourceId?: string | null }]
  'pauseUploadTask': [sessionId: string]
  'resumeUploadTask': [sessionId: string]
  'retryUploadTask': [sessionId: string]
  'cancelUploadTask': [sessionId: string]
  'rebindUploadTask': [sessionId: string]
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
const activeOutlineId = ref('')
const pendingOutlineCommandId = ref('')
const resourceActionOpenId = ref('')
const projectResourceAddMenuOpen = ref(false)
const removeTargetResourceId = ref('')
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
function resolveResourceCategoryLabel(category: string): string {
  const normalized = String(category || '').trim() as ResourceCategory
  return resourceCategoryLabels[normalized] || normalized || '未分类'
}

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
  return `calc(var(--workspace-left-tree-indent-step, 14px) * ${Math.max(0, depth)})`
}

const projectResourceTree = computed<ProjectResourceTreeNode[]>(() => {
  return buildProjectResourceTree(props.selectedResources)
})

const visibleResources = computed<ProjectResourceTreeRow[]>(() => {
  return flattenProjectResourceTree(projectResourceTree.value)
})

const projectResourceMap = computed(() => {
  const map = new Map<string, Resource>()
  for (const resource of props.selectedResources) {
    const resourceId = String(resource.id || '').trim()
    if (resourceId)
      map.set(resourceId, resource)
  }
  return map
})

const projectResourceChildrenMap = computed(() => {
  const map = new Map<string, Resource[]>()
  const sortedResources = [...props.selectedResources].sort(sortProjectResourcesByTreeOrder)
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

const projectResourceSkeletonRows = [1, 2, 3, 4]
const resourceLibrarySkeletonRows = [1, 2, 3]
const projectOutlineSkeletonRows = [1, 2, 3, 4, 5]

const recycleRetentionDays = 30

const removeTargetResourceLabel = computed(() => {
  if (!removeTargetResourceId.value)
    return '该文件'
  const target = props.selectedResources.find(item => item.id === removeTargetResourceId.value)
  return target ? resourceDisplayTitle(target) : '该文件'
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

function normalizeOutlineLabel(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[：:;；，。,、]+$/g, '')
    .trim()
}

function flattenProjectOutlineNodes(
  nodes: ProjectOutlineNode[],
  parentOrders: number[] = [],
): OutlineItem[] {
  const result: OutlineItem[] = []
  const sorted = [...nodes].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))

  for (const node of sorted) {
    const order = Math.max(1, Number(node.order || 1))
    const numberChain = [...parentOrders, order]
    const title = normalizeOutlineLabel(String(node.title || ''))
    if (!title)
      continue

    result.push({
      id: String(node.id || numberChain.join('.')),
      label: `${numberChain.join('.')} ${title}`,
      level: Math.max(0, numberChain.length - 1),
    })

    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...flattenProjectOutlineNodes(node.children, numberChain))
    }
  }

  return result
}

function buildUploadOutlineItems(tasks: ProjectUploadTask[]): OutlineItem[] {
  return tasks.map(task => ({
    id: `upload-outline-${task.sessionId}`,
    label: task.fileName,
    level: 0,
    uploadTask: task,
    statusText: resolveProjectUploadTaskStatusText(task.status, task.needsFileRebind),
    progressPercent: task.status === 'finalizing' ? 100 : Math.max(0, Math.min(100, Number(task.progressPercent || 0))),
  }))
}

const outlineItems = computed<OutlineItem[]>(() => {
  const uploadItems = buildUploadOutlineItems(visibleUploadTasks.value)
  const backendItems = flattenProjectOutlineNodes(props.projectOutline)
  if (backendItems.length > 0)
    return [...uploadItems, ...backendItems]
  return uploadItems
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
  projectResourceAddMenuOpen.value = false
  activeModule.value = moduleId
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

function selectOutline(itemId: string) {
  activeOutlineId.value = itemId
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

function extractExtension(text: string): string {
  const value = String(text || '').trim().toLowerCase()
  const dotIndex = value.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === value.length - 1)
    return ''
  return value.slice(dotIndex + 1)
}

function resolveResourceExtension(resource: Resource): string {
  const fileName = metadataFileName(resource)
  const title = String(resource.title || '').trim()
  const sourceLink = String(resource.sourceLink || '').trim()
  return extractExtension(fileName) || extractExtension(title) || extractExtension(sourceLink)
}

function normalizeResourceType(resource: Resource): string {
  return String(resource.type || '').trim().toLowerCase()
}

function isCollabResource(resource: Resource): boolean {
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  return source === 'collab' || kind === 'markdown' || kind === 'draw'
}

function resolveCollabPurpose(resource: Resource | null | undefined): CollabPurpose | '' {
  const normalized = String(resource?.collabPurpose || '').trim().toLowerCase()
  if (normalized === 'workflow' || normalized === 'freeform' || normalized === 'notes')
    return normalized
  if (resource?.resourceKind === 'markdown')
    return 'notes'
  if (resource?.resourceKind === 'draw')
    return 'freeform'
  return ''
}

function resourceIcon(resource: Resource): string {
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  const purpose = resolveCollabPurpose(resource)
  if (kind === 'draw' && purpose === 'workflow')
    return 'flowsheet'
  if (kind === 'draw')
    return 'draw'
  if (kind === 'markdown')
    return 'edit_note'
  if (source === 'collab')
    return 'edit_note'

  const extension = resolveResourceExtension(resource)
  const mimeType = metadataMimeType(resource)
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

  const type = normalizeResourceType(resource)
  if (type.includes('pdf'))
    return 'picture_as_pdf'
  if (type.includes('tab') || type.includes('excel') || type.includes('sheet'))
    return 'table_chart'
  if (type.includes('doc') || type.includes('md') || type.includes('markdown'))
    return 'article'
  return 'draft'
}

function resourceIconClass(resource: Resource): string {
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  if (kind === 'draw' || kind === 'markdown' || source === 'collab')
    return 'workspace-icon--collab'

  const extension = resolveResourceExtension(resource)
  const mimeType = metadataMimeType(resource)
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

  const type = normalizeResourceType(resource)
  if (type.includes('pdf'))
    return 'workspace-icon--pdf'
  if (type.includes('tab') || type.includes('excel') || type.includes('sheet'))
    return 'workspace-icon--table'
  return 'workspace-icon--doc'
}

function resourceDisplayTitle(resource: Resource): string {
  const title = String(resource.title || '').trim()
  if (title)
    return title

  const type = String(resource.type || 'doc').trim().toLowerCase()
  if (type)
    return `未命名文档.${type}`

  return '未命名文档'
}

function hasDownloadableSource(resource: Resource): boolean {
  const sourceDownloadUrl = String(resource.sourceDownloadUrl || '').trim()
  const sourceLink = String(resource.sourceLink || '').trim()
  return Boolean(sourceDownloadUrl || sourceLink)
}

function hasPreviewableSource(resource: Resource): boolean {
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  if (source === 'collab' || kind === 'markdown' || kind === 'draw')
    return true
  if (source === 'upload' || source === 'project_upload')
    return true
  if (String(resource.documentId || '').trim())
    return true
  if (String(resource.previewUrl || '').trim())
    return true
  return false
}

function canDuplicateResource(resource: Resource): boolean {
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  return source !== 'collab' && kind !== 'markdown' && kind !== 'draw'
}

function resourceSourceLabel(resource: Resource): string {
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  if (source === 'collab') {
    const purpose = resolveCollabPurpose(resource)
    if (purpose === 'workflow')
      return '流程画布'
    if (purpose === 'freeform')
      return '自由画布'
    return '协作文档'
  }
  if (source === 'upload' || source === 'project_upload')
    return '项目上传'
  if (source === 'library')
    return '系统资料库'
  return source || '-'
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

function toggleProjectResourceAddMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = !projectResourceAddMenuOpen.value
}

function openCollaborativeDocFromMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  emit('createCollabResource', { kind: 'markdown', parentResourceId: null })
}

function openInfiniteCanvasFromMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  emit('createCollabResource', { kind: 'draw', parentResourceId: null })
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

function createChildCollaborativeDoc(resourceId: string) {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId || props.resourceMutating || !props.hasActiveProject)
    return
  resourceActionOpenId.value = ''
  emit('createCollabResource', {
    kind: 'markdown',
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
  if (props.resourceMutating || !props.hasActiveProject)
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
  if (!draggingResourceId.value || props.resourceMutating || !props.hasActiveProject)
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
  if (!draggingResourceId.value || props.resourceMutating || !props.hasActiveProject)
    return
  event.preventDefault()
  const payload = buildProjectResourceTreePatchPayload(draggingResourceId.value, resourceId, position)
  handleResourceDragEnd()
  if (!payload || payload.items.length === 0)
    return
  emit('patchProjectResourceTree', payload)
}

function toggleResourceActionMenu(resourceId: string) {
  if (!resourceId || props.resourceMutating || !props.hasActiveProject)
    return
  if (resourceActionOpenId.value === resourceId) {
    resourceActionOpenId.value = ''
    return
  }
  resourceActionOpenId.value = resourceId
}

function handleResourceItemContextMenu(resourceId: string, event: MouseEvent) {
  event.preventDefault()
  if (!resourceId || props.resourceMutating || !props.hasActiveProject)
    return
  activeResourceId.value = resourceId
  resourceActionOpenId.value = resourceId
}

function requestRemoveResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  resourceActionOpenId.value = ''
  removeTargetResourceId.value = targetResourceId
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
}

function closeResourceDetailPanel() {
  resourceDetailModalVisible.value = false
  resourceDetailTargetId.value = ''
}

function closeRemoveResourceModal() {
  if (props.resourceMutating)
    return
  removeResourceModalVisible.value = false
  removeTargetResourceId.value = ''
}

function confirmRemoveResource() {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  const targetResourceId = String(removeTargetResourceId.value || '').trim()
  if (!targetResourceId)
    return

  removeResourceModalVisible.value = false
  removeTargetResourceId.value = ''
  emit('removeProjectResource', targetResourceId)
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
  if (!resourceActionOpenId.value && !projectResourceAddMenuOpen.value)
    return

  const target = event.target as HTMLElement | null
  if (
    target?.closest('.workspace-resource-actions')
    || target?.closest('.workspace-recycle-item__actions')
    || target?.closest('.workspace-project-add-actions')
  ) {
    return
  }

  resourceActionOpenId.value = ''
  projectResourceAddMenuOpen.value = false
}

function closeResourceActionMenuByEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  resourceActionOpenId.value = ''
  projectResourceAddMenuOpen.value = false
}

watch(() => props.selectedResources, (nextResources) => {
  if (resourceActionOpenId.value && !nextResources.some(item => item.id === resourceActionOpenId.value))
    resourceActionOpenId.value = ''
  if (removeTargetResourceId.value && !nextResources.some(item => item.id === removeTargetResourceId.value)) {
    removeTargetResourceId.value = ''
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

  if (suppressResourceSelection.value) {
    activeResourceId.value = ''
    return
  }

  const stillExists = nextResources.some(item => item.id === activeResourceId.value)
  if (stillExists)
    return

  activeResourceId.value = visibleResources.value[0]?.resource.id || nextResources[0]?.id || ''
}, { immediate: true, deep: true })

watch(suppressResourceSelection, (next) => {
  if (next) {
    activeResourceId.value = ''
    resourceActionOpenId.value = ''
    return
  }

  if (!props.selectedResources.length)
    return

  const stillExists = props.selectedResources.some(item => item.id === activeResourceId.value)
  if (stillExists)
    return

  activeResourceId.value = visibleResources.value[0]?.resource.id || props.selectedResources[0]?.id || ''
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
  if (next)
    return
  libraryModalKeyword.value = ''
  libraryImportParentResourceId.value = null
})

watch(outlineItems, (nextItems) => {
  if (!nextItems.length) {
    if (!pendingOutlineCommandId.value)
      activeOutlineId.value = ''
    return
  }

  if (pendingOutlineCommandId.value) {
    const pendingExists = nextItems.some(item => item.id === pendingOutlineCommandId.value)
    if (pendingExists) {
      activeOutlineId.value = pendingOutlineCommandId.value
      pendingOutlineCommandId.value = ''
      return
    }

    if (props.projectOutlineLoading)
      return

    pendingOutlineCommandId.value = ''
  }

  const stillExists = nextItems.some(item => item.id === activeOutlineId.value)
  if (stillExists)
    return

  activeOutlineId.value = nextItems[0]?.id || ''
}, { immediate: true })

watch(() => props.commandSignal, (next, previous) => {
  if (next === previous)
    return

  const outlineId = String(props.commandOutlineId || '').trim()
  if (!outlineId)
    return

  pendingOutlineCommandId.value = outlineId
  activeOutlineId.value = outlineId
  sectionExpanded.outline = true
}, { immediate: true })

watch(linkedContestResourceGroups, (groups) => {
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
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
  closeResourceDetailPanel()
  shareTargetResourceId.value = ''
  shareResourceModalVisible.value = false
  removeTargetResourceId.value = ''
  removeResourceModalVisible.value = false
  purgeTargetResourceId.value = ''
  purgeResourceModalVisible.value = false
})

watch(() => sectionExpanded.projectResources, (expanded) => {
  if (expanded)
    return
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
  shareTargetResourceId.value = ''
  shareResourceModalVisible.value = false
})

watch(() => props.resourceMutating, (next) => {
  if (!next)
    return
  projectResourceAddMenuOpen.value = false
  resourceActionOpenId.value = ''
})

onMounted(() => {
  if (!import.meta.client)
    return

  const saved = localStorage.getItem(LEFT_MODULE_STORAGE_KEY)
  if (!saved)
    return

  if (isWorkspaceLeftModuleId(saved))
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
                  <div class="workspace-tree-block__title-row">
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
                        type="button"
                        title="添加资源"
                        aria-label="添加资源"
                        :aria-expanded="projectResourceAddMenuOpen"
                        :disabled="resourceMutating || !hasActiveProject"
                        @click.stop="toggleProjectResourceAddMenu"
                      >
                        <span class="material-symbols-outlined">add</span>
                      </button>
                      <div
                        v-if="projectResourceAddMenuOpen"
                        class="workspace-project-add-actions__menu"
                        role="menu"
                      >
                        <button
                          class="workspace-project-add-actions__menu-item"
                          type="button"
                          :disabled="resourceMutating || !hasActiveProject"
                          @click.stop="openCollaborativeDocFromMenu"
                        >
                          新建协作文档
                        </button>
                        <button
                          class="workspace-project-add-actions__menu-item"
                          type="button"
                          :disabled="resourceMutating || !hasActiveProject"
                          @click.stop="openInfiniteCanvasFromMenu"
                        >
                          新建自由画布
                        </button>
                        <div class="workspace-project-add-actions__divider" />
                        <button
                          class="workspace-project-add-actions__menu-item"
                          type="button"
                          :disabled="resourceMutating || !hasActiveProject"
                          @click.stop="openLibraryFromMenu"
                        >
                          从系统资料库导入
                        </button>
                        <button
                          class="workspace-project-add-actions__menu-item"
                          type="button"
                          :disabled="resourceMutating || !hasActiveProject"
                          @click.stop="openLocalUploadFromMenu()"
                        >
                          从本地设备中上传
                        </button>
                      </div>
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
                          class="workspace-tree-dropzone"
                          :class="{ 'workspace-tree-dropzone--active': dragOverResourceId === row.resource.id && dragOverPosition === 'before' }"
                          :style="{ marginLeft: resolveTreeDepthOffset(row.depth) }"
                          @dragover="handleResourceDragOver(row.resource.id, 'before', $event)"
                          @dragleave="handleResourceDragLeave(row.resource.id, 'before')"
                          @drop="handleResourceDrop(row.resource.id, 'before', $event)"
                        />

                        <div
                          class="workspace-tree-item-row"
                          :class="{
                            'workspace-tree-item-row--active': !suppressResourceSelection && row.resource.id === activeResourceId,
                            'workspace-tree-item-row--menu-open': resourceActionOpenId === row.resource.id,
                            'workspace-tree-item-row--drop-inside': dragOverResourceId === row.resource.id && dragOverPosition === 'inside',
                          }"
                          @contextmenu="handleResourceItemContextMenu(row.resource.id, $event)"
                          @dragover="handleResourceDragOver(row.resource.id, 'inside', $event)"
                          @dragleave="handleResourceDragLeave(row.resource.id, 'inside')"
                          @drop="handleResourceDrop(row.resource.id, 'inside', $event)"
                        >
                          <div class="workspace-resource-tree-row__main" :style="{ paddingLeft: resolveTreeDepthOffset(row.depth) }">
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
                              draggable="true"
                              @dragstart="handleResourceDragStart(row.resource.id, $event)"
                              @dragend="handleResourceDragEnd"
                              @click="openResource(row.resource)"
                            >
                              <span class="material-symbols-outlined workspace-tree-item__icon" :class="resourceIconClass(row.resource)">
                                {{ resourceIcon(row.resource) }}
                              </span>
                              <span class="workspace-tree-item__label">{{ resourceDisplayTitle(row.resource) }}</span>
                            </button>
                          </div>

                          <div class="workspace-resource-actions">
                            <button
                              class="workspace-resource-actions__trigger"
                              type="button"
                              title="资源操作"
                              aria-label="资源操作"
                              :disabled="resourceMutating || !hasActiveProject"
                              @click.stop="toggleResourceActionMenu(row.resource.id)"
                            >
                              <span class="material-symbols-outlined">more_horiz</span>
                            </button>

                            <div
                              v-if="resourceActionOpenId === row.resource.id"
                              class="workspace-resource-actions__menu"
                              role="menu"
                            >
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject"
                                @click.stop="createChildCollaborativeDoc(row.resource.id)"
                              >
                                新建子协作文档
                              </button>
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject"
                                @click.stop="createChildInfiniteCanvas(row.resource.id)"
                              >
                                新建子自由画布
                              </button>
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject"
                                @click.stop="openChildUpload(row.resource.id)"
                              >
                                上传到此节点
                              </button>
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject"
                                @click.stop="openChildLibraryImport(row.resource.id)"
                              >
                                从系统资料库导入到此节点
                              </button>
                              <div class="workspace-resource-actions__divider" />
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject || !hasPreviewableSource(row.resource)"
                                @click.stop="requestPreviewResource(row.resource.id)"
                              >
                                预览
                              </button>
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject || !hasDownloadableSource(row.resource)"
                                @click.stop="requestShareResource(row.resource.id)"
                              >
                                分享链接
                              </button>
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject"
                                @click.stop="copyResourceName(row.resource.id)"
                              >
                                复制名称
                              </button>
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject || !canDuplicateResource(row.resource)"
                                @click.stop="createResourceDuplicate(row.resource.id)"
                              >
                                创建副本
                              </button>
                              <div class="workspace-resource-actions__divider" />
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject"
                                @click.stop="requestViewResourceDetails(row.resource.id)"
                              >
                                文档属性
                              </button>
                              <button
                                class="workspace-resource-actions__menu-item"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject || !hasDownloadableSource(row.resource)"
                                @click.stop="requestDownloadResource(row.resource.id)"
                              >
                                下载原文件
                              </button>
                              <div class="workspace-resource-actions__divider" />
                              <button
                                class="workspace-resource-actions__menu-item workspace-resource-actions__menu-item--danger"
                                type="button"
                                :disabled="resourceMutating || !hasActiveProject"
                                @click.stop="requestRemoveResource(row.resource.id)"
                              >
                                删除文件
                              </button>
                            </div>
                          </div>
                        </div>

                        <div
                          class="workspace-tree-dropzone"
                          :class="{ 'workspace-tree-dropzone--active': dragOverResourceId === row.resource.id && dragOverPosition === 'after' }"
                          :style="{ marginLeft: resolveTreeDepthOffset(row.depth) }"
                          @dragover="handleResourceDragOver(row.resource.id, 'after', $event)"
                          @dragleave="handleResourceDragLeave(row.resource.id, 'after')"
                          @drop="handleResourceDrop(row.resource.id, 'after', $event)"
                        />
                      </div>

                      <div
                        v-if="visibleResources.length > 0"
                        class="workspace-tree-dropzone workspace-tree-dropzone--tail"
                        :class="{ 'workspace-tree-dropzone--active': !dragOverResourceId && dragOverPosition === 'root_end' }"
                        @dragover="handleResourceDragOver(null, 'root_end', $event)"
                        @dragleave="handleResourceDragLeave(null, 'root_end')"
                        @drop="handleResourceDrop(null, 'root_end', $event)"
                      >
                        拖到此处可移动到根节点末尾
                      </div>
                      <p v-if="visibleUploadTasks.length === 0 && visibleResources.length === 0" class="workspace-empty-text">
                        暂无资源
                      </p>
                    </template>
                  </div>
                </section>

                <section class="workspace-tree-block">
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
                    <template v-if="projectOutlineLoading && outlineItems.length === 0">
                      <div
                        v-for="row in projectOutlineSkeletonRows"
                        :key="`outline-skeleton-${row}`"
                        class="workspace-outline-skeleton-row"
                        :class="{ 'workspace-outline-skeleton-row--child': row % 2 === 0 }"
                        aria-hidden="true"
                      >
                        <span class="workspace-outline-skeleton__dot workspace-skeleton" />
                        <div class="workspace-outline-skeleton workspace-skeleton" />
                      </div>
                    </template>
                    <template v-else>
                      <template
                        v-for="item in outlineItems"
                        :key="item.id"
                      >
                        <div
                          v-if="item.uploadTask"
                          class="workspace-outline-item workspace-outline-item--upload"
                          :class="[
                            item.level > 0 ? 'workspace-outline-item--child' : '',
                            uploadTaskToneClass(item.uploadTask),
                          ]"
                          :title="item.label"
                        >
                          <div class="workspace-outline-item__content">
                            <span class="workspace-outline-item__label">{{ item.label }}</span>
                            <span class="workspace-outline-item__meta">{{ item.statusText }}</span>
                          </div>
                          <span
                            class="workspace-upload-ring workspace-upload-ring--outline"
                            :class="[
                              uploadTaskToneClass(item.uploadTask),
                              item.uploadTask.status === 'finalizing' ? 'workspace-upload-ring--indeterminate' : '',
                            ]"
                            :style="uploadTaskProgressStyle(item.uploadTask)"
                            aria-hidden="true"
                          >
                            <span class="workspace-upload-ring__core" />
                          </span>
                        </div>
                        <button
                          v-else
                          class="workspace-outline-item"
                          :class="[
                            item.level > 0 ? 'workspace-outline-item--child' : '',
                            activeOutlineId === item.id ? 'workspace-outline-item--active' : '',
                          ]"
                          type="button"
                          :title="item.label"
                          @click="selectOutline(item.id)"
                        >
                          {{ item.label }}
                        </button>
                      </template>

                      <p v-if="outlineItems.length === 0" class="workspace-empty-text">
                        上传文件后自动生成大纲
                      </p>
                    </template>
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

                    <div class="workspace-library-list no-scrollbar">
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
                      确认删除资源「{{ removeTargetResourceLabel }}」吗？
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
                        {{ resourceMutating ? '删除中...' : '确认删除' }}
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
                  title="文档属性"
                  width="520px"
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
