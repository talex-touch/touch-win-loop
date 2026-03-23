<script setup lang="ts">
import type {
  Contest,
  ProjectIssue,
  ProjectIssueReport,
  ProjectOutlineNode,
  ProjectResourceShareDurationPreset,
  ProjectResourceShareVisibility,
  Resource,
} from '~~/shared/types/domain'
import { formatFileSize, PROJECT_RESOURCE_UPLOAD_ACCEPT_ATTR } from '~~/shared/constants/project-resource-upload'

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
}

interface ResourceAttributeField {
  label: string
  value: string
}

interface ShareProjectResourcePayload {
  resourceId: string
  visibility: ProjectResourceShareVisibility
  duration: ProjectResourceShareDurationPreset
}

type ResourceSectionId = 'projectResources' | 'systemLibrary' | 'outline'

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
}>()

const LEFT_MODULE_STORAGE_KEY = 'workspace.leftSidebar.activeModule'

const levelLabels: Record<string, string> = {
  national: '国赛',
  provincial: '省赛',
  school: '校赛',
  industry: '行业赛',
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
const recyclePanelOpen = ref(false)
const activeResourceId = ref('')
const activeOutlineId = ref('')
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
const projectResourceUploadInputRef = ref<HTMLInputElement | null>(null)
const sidebarPanelRef = ref<HTMLElement | null>(null)
const sectionExpanded = reactive<Record<ResourceSectionId, boolean>>({
  projectResources: true,
  systemLibrary: true,
  outline: true,
})

const showReason = ref(false)
const showAdminDetails = ref(false)

const suppressResourceSelection = computed(() => props.activeMainTabId === 'dashboard')

const visibleResources = computed(() => props.selectedResources.slice(0, 10))
const visibleRecycleResources = computed(() => props.recycleResources.slice(0, 20))
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

const projectResourceSkeletonRows = [1, 2, 3, 4]
const resourceLibrarySkeletonRows = [1, 2, 3]
const projectOutlineSkeletonRows = [1, 2, 3, 4, 5]

const recycleRetentionDays = 30

const removeTargetResourceLabel = computed(() => {
  if (!removeTargetResourceId.value)
    return '该文件'
  const target = visibleResources.value.find(item => item.id === removeTargetResourceId.value)
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
  const target = visibleResources.value.find(item => item.id === shareTargetResourceId.value)
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

function stripOutlineHeadingPrefix(value: string): string {
  return normalizeOutlineLabel(value)
    .replace(/^#{1,6}\s+/, '')
    .replace(/^第[一二三四五六七八九十百千\d]+[章节部分篇]\s*/, '')
    .replace(/^\d+(?:\.\d+){0,3}[、.．\s]+/, '')
    .replace(/^[一二三四五六七八九十]+[、.．\s]+/, '')
    .replace(/^[（(]?[一二三四五六七八九十\d]+[)）][、.．\s]*/, '')
    .replace(/^[-*•]\s+/, '')
    .trim()
}

function isHeadingLine(line: string): boolean {
  if (!line)
    return false

  return /^#{1,6}\s+/.test(line)
    || /^\d+(?:\.\d+){0,3}[、.．\s]+/.test(line)
    || /^[一二三四五六七八九十]+[、.．\s]+/.test(line)
    || /^第[一二三四五六七八九十百千\d]+[章节部分篇]\s*/.test(line)
    || /^[（(]?[一二三四五六七八九十\d]+[)）][、.．\s]*/.test(line)
    || /^[-*•]\s+/.test(line)
}

function extractResourceOutlineChildren(resource: Resource): string[] {
  const source = [resource.summary, resource.content].map(value => String(value || '').trim()).filter(Boolean).join('\n')
  if (!source)
    return []

  const title = normalizeOutlineLabel(resourceDisplayTitle(resource))
  const titleKey = title.toLowerCase()
  const dedupe = new Set<string>()
  const result: string[] = []
  const lines = source
    .split(/\r?\n+/)
    .map(item => normalizeOutlineLabel(item))
    .filter(Boolean)

  for (const line of lines) {
    if (result.length >= 4)
      break
    if (line.length < 2 || line.length > 48)
      continue
    if (!isHeadingLine(line))
      continue

    const normalized = stripOutlineHeadingPrefix(line)
    const dedupeKey = normalized.toLowerCase()
    if (!normalized || normalized === title || dedupeKey === titleKey || dedupe.has(dedupeKey))
      continue
    if (normalized.length > 36)
      continue

    dedupe.add(dedupeKey)
    result.push(normalized)
  }

  return result
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

const fallbackOutlineItems = computed<OutlineItem[]>(() => {
  const items: OutlineItem[] = []

  visibleResources.value.forEach((resource, resourceIndex) => {
    const topIndex = resourceIndex + 1
    const topId = `resource-${resource.id || topIndex}`
    const topLabel = normalizeOutlineLabel(resourceDisplayTitle(resource)) || `资料 ${topIndex}`

    items.push({
      id: topId,
      label: `${topIndex}. ${topLabel}`,
      level: 0,
    })

    const children = extractResourceOutlineChildren(resource)
    children.forEach((childLabel, childIndex) => {
      items.push({
        id: `${topId}-child-${childIndex + 1}`,
        label: `${topIndex}.${childIndex + 1} ${childLabel}`,
        level: 1,
      })
    })
  })

  return items
})

const outlineItems = computed<OutlineItem[]>(() => {
  const backendItems = flattenProjectOutlineNodes(props.projectOutline)
  if (backendItems.length > 0)
    return backendItems
  return fallbackOutlineItems.value
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
  recyclePanelOpen.value = false
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

function toggleSection(sectionId: ResourceSectionId) {
  sectionExpanded[sectionId] = !sectionExpanded[sectionId]
}

function openSettingsPanel() {
  emit('openSettingsPanel')
}

function openDefenseMode() {
  emit('openDefenseMode')
}

function reloadIssueCenter() {
  emit('reloadIssues')
}

function openRecycleBinPanel() {
  recyclePanelOpen.value = true
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

function resourceIcon(resource: Resource): string {
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
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
  if (source === 'collab')
    return '协作资源'
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
  const fromMetadata = metadataUploader(resource)
  if (fromMetadata)
    return fromMetadata

  const createdBy = String(resource.createdBy || '').trim()
  if (!createdBy)
    return '-'

  const currentUserId = String(props.currentUserId || '').trim()
  if (currentUserId && createdBy === currentUserId) {
    const currentUsername = String(props.currentUsername || '').trim()
    return currentUsername ? `${currentUsername}（我）` : '我'
  }

  return createdBy
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

function isWorkspaceLeftModuleId(value: string): value is WorkspaceLeftModuleId {
  return value === 'resource_manager'
    || value === 'analysis'
    || value === 'project_config'
    || value === 'issue_center'
}

function openLibraryModal() {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  libraryModalKeyword.value = ''
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
  emit('createCollabResource', 'markdown')
}

function openInfiniteCanvasFromMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  emit('createCollabResource', 'draw')
}

function openLibraryFromMenu() {
  projectResourceAddMenuOpen.value = false
  openLibraryModal()
}

function openLocalUploadFromMenu() {
  if (props.resourceMutating || !props.hasActiveProject)
    return
  projectResourceAddMenuOpen.value = false
  nextTick(() => {
    projectResourceUploadInputRef.value?.click()
  })
}

function handleProjectResourceUploadInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  handleResourceUpload(target.files)
  target.value = ''
}

function handleResourceUpload(files: FileList | File[] | null | undefined) {
  const normalizedFiles = Array.from(files || []).filter(file => file instanceof File)
  if (!normalizedFiles.length || props.resourceMutating || !props.hasActiveProject)
    return
  emit('uploadResources', normalizedFiles)
}

function addLibraryResource(resourceId: string) {
  if (!resourceId || props.resourceMutating || !props.hasActiveProject)
    return
  emit('addResourceFromLibrary', resourceId)
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

  activeResourceId.value = nextResources[0]?.id || ''
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

  activeResourceId.value = props.selectedResources[0]?.id || ''
}, { immediate: true })

watch(() => props.recycleResources, (nextResources) => {
  if (purgeTargetResourceId.value && !nextResources.some(item => item.id === purgeTargetResourceId.value)) {
    purgeTargetResourceId.value = ''
    purgeResourceModalVisible.value = false
  }
}, { immediate: true, deep: true })

watch(outlineItems, (nextItems) => {
  if (!nextItems.length) {
    activeOutlineId.value = ''
    return
  }

  const stillExists = nextItems.some(item => item.id === activeOutlineId.value)
  if (stillExists)
    return

  activeOutlineId.value = nextItems[0]?.id || ''
}, { immediate: true })

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
  <aside ref="sidebarPanelRef" class="workspace-left-dock">
    <WorkspaceLeftRail
      :items="modules"
      :active-id="activeModule"
      :recycle-active="recyclePanelOpen"
      :defense-active="defenseActive"
      @select="switchModule"
      @open-defense="openDefenseMode"
      @open-recycle-bin="openRecycleBinPanel"
      @open-settings="openSettingsPanel"
    />

    <section class="workspace-left-panel">
      <div class="workspace-left-panel__body no-scrollbar">
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

        <template v-else-if="activeModule === 'resource_manager'">
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
                    新建无边画布
                  </button>
                  <div class="workspace-project-add-actions__divider" />
                  <button
                    class="workspace-project-add-actions__menu-item"
                    type="button"
                    :disabled="resourceMutating || !hasActiveProject"
                    @click.stop="openLibraryFromMenu"
                  >
                    从系统资源库导入
                  </button>
                  <button
                    class="workspace-project-add-actions__menu-item"
                    type="button"
                    :disabled="resourceMutating || !hasActiveProject"
                    @click.stop="openLocalUploadFromMenu"
                  >
                    从本地设备中上传
                  </button>
                </div>
              </div>
            </div>

            <div v-show="sectionExpanded.projectResources">
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
                  v-for="resource in visibleResources"
                  :key="resource.id"
                  class="workspace-tree-item-row"
                  :class="{
                    'workspace-tree-item-row--active': !suppressResourceSelection && resource.id === activeResourceId,
                    'workspace-tree-item-row--menu-open': resourceActionOpenId === resource.id,
                  }"
                  @contextmenu="handleResourceItemContextMenu(resource.id, $event)"
                >
                  <button
                    class="workspace-tree-item"
                    :class="{ 'workspace-tree-item--active': !suppressResourceSelection && resource.id === activeResourceId }"
                    :title="resourceDisplayTitle(resource)"
                    type="button"
                    @click="openResource(resource)"
                  >
                    <span class="material-symbols-outlined workspace-tree-item__icon" :class="resourceIconClass(resource)">
                      {{ resourceIcon(resource) }}
                    </span>
                    <span class="workspace-tree-item__label">{{ resourceDisplayTitle(resource) }}</span>
                  </button>

                  <div class="workspace-resource-actions">
                    <button
                      class="workspace-resource-actions__trigger"
                      type="button"
                      title="资源操作"
                      aria-label="资源操作"
                      :disabled="resourceMutating || !hasActiveProject"
                      @click.stop="toggleResourceActionMenu(resource.id)"
                    >
                      <span class="material-symbols-outlined">more_horiz</span>
                    </button>

                    <div
                      v-if="resourceActionOpenId === resource.id"
                      class="workspace-resource-actions__menu"
                      role="menu"
                    >
                      <button
                        class="workspace-resource-actions__menu-item"
                        type="button"
                        :disabled="resourceMutating || !hasActiveProject || !hasPreviewableSource(resource)"
                        @click.stop="requestPreviewResource(resource.id)"
                      >
                        预览
                      </button>
                      <button
                        class="workspace-resource-actions__menu-item"
                        type="button"
                        :disabled="resourceMutating || !hasActiveProject || !hasDownloadableSource(resource)"
                        @click.stop="requestShareResource(resource.id)"
                      >
                        分享链接
                      </button>
                      <button
                        class="workspace-resource-actions__menu-item"
                        type="button"
                        :disabled="resourceMutating || !hasActiveProject"
                        @click.stop="copyResourceName(resource.id)"
                      >
                        复制名称
                      </button>
                      <button
                        class="workspace-resource-actions__menu-item"
                        type="button"
                        :disabled="resourceMutating || !hasActiveProject || !canDuplicateResource(resource)"
                        @click.stop="createResourceDuplicate(resource.id)"
                      >
                        创建副本
                      </button>
                      <div class="workspace-resource-actions__divider" />
                      <button
                        class="workspace-resource-actions__menu-item"
                        type="button"
                        :disabled="resourceMutating || !hasActiveProject"
                        @click.stop="requestViewResourceDetails(resource.id)"
                      >
                        文档属性
                      </button>
                      <button
                        class="workspace-resource-actions__menu-item"
                        type="button"
                        :disabled="resourceMutating || !hasActiveProject || !hasDownloadableSource(resource)"
                        @click.stop="requestDownloadResource(resource.id)"
                      >
                        下载原文件
                      </button>
                      <div class="workspace-resource-actions__divider" />
                      <button
                        class="workspace-resource-actions__menu-item workspace-resource-actions__menu-item--danger"
                        type="button"
                        :disabled="resourceMutating || !hasActiveProject"
                        @click.stop="requestRemoveResource(resource.id)"
                      >
                        删除文件
                      </button>
                    </div>
                  </div>
                </div>

                <p v-if="visibleResources.length === 0" class="workspace-empty-text">
                  暂无资源
                </p>
              </template>
            </div>
          </section>

          <section class="workspace-tree-block">
            <button
              class="workspace-tree-block__title"
              type="button"
              :aria-expanded="sectionExpanded.systemLibrary"
              @click="toggleSection('systemLibrary')"
            >
              <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.systemLibrary }">
                keyboard_arrow_down
              </span>
              <span>系统资料库</span>
            </button>

            <div v-show="sectionExpanded.systemLibrary" class="workspace-tree-block__content">
              <template v-if="resourceLibraryLoading">
                <div
                  v-for="row in resourceLibrarySkeletonRows"
                  :key="`library-skeleton-${row}`"
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
              <p v-else class="workspace-empty-text">
                暂无资源
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
              <template v-if="projectOutlineLoading">
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
                <button
                  v-for="item in outlineItems"
                  :key="item.id"
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
        <template v-else-if="activeModule === 'analysis'">
          <section class="workspace-card">
            <h3>AI 竞赛分析</h3>
            <textarea
              :value="naturalQuery"
              class="workspace-textarea"
              placeholder="例：计算机专业，偏 AI + 工程落地，优先国赛。"
              @input="emit('update:naturalQuery', ($event.target as HTMLTextAreaElement).value)"
            />

            <div class="workspace-config-summary">
              {{ configSummary }}
            </div>

            <div class="workspace-action-row">
              <button
                class="workspace-btn workspace-btn--ghost"
                :disabled="listLoading"
                @click="emit('loadContests')"
              >
                {{ listLoading ? '加载中...' : '结构化筛选' }}
              </button>

              <button
                class="workspace-btn workspace-btn--primary"
                :disabled="aiFiltering"
                @click="emit('runAiFilter')"
              >
                {{ aiFiltering ? 'AI处理中...' : 'AI筛选竞赛' }}
              </button>
            </div>

            <div class="workspace-analysis-status">
              <div class="workspace-analysis-status__head">
                <span>分析状态</span>
                <span class="workspace-pill" :class="{ 'workspace-pill--done': hasReasoning && !aiFiltering }">
                  {{ analysisStateLabel }}
                </span>
              </div>
              <p>{{ compactHint }}</p>

              <button
                v-if="hasReasoning"
                class="workspace-inline-action"
                type="button"
                @click="showReason = !showReason"
              >
                {{ showReason ? '收起原因' : '展开原因' }}
              </button>

              <pre v-if="showReason" class="workspace-log-text">{{ aiReasoning }}</pre>

              <template v-if="isAdminView">
                <button
                  class="workspace-inline-action workspace-inline-action--dark"
                  type="button"
                  @click="showAdminDetails = !showAdminDetails"
                >
                  {{ showAdminDetails ? '收起详情' : '查看详情' }}
                </button>

                <div v-if="showAdminDetails" class="workspace-admin-detail">
                  <div>
                    <div class="workspace-admin-detail__label">
                      运行状态
                    </div>
                    <div>{{ statusLine || '-' }}</div>
                  </div>
                  <div>
                    <div class="workspace-admin-detail__label">
                      标准化筛选参数
                    </div>
                    <pre>{{ normalizedInfo || '{ }' }}</pre>
                  </div>
                </div>
              </template>
            </div>
          </section>

          <section class="workspace-card">
            <h3>竞赛清单（{{ contests.length }}）</h3>
            <div class="workspace-contest-list no-scrollbar">
              <button
                v-for="contest in contests"
                :key="contest.id"
                class="workspace-contest-item"
                :class="{ 'workspace-contest-item--active': contest.id === selectedContestId }"
                type="button"
                @click="emit('update:selectedContestId', contest.id)"
              >
                <div class="workspace-contest-item__name">
                  {{ contest.name }}
                </div>
                <div class="workspace-contest-item__meta">
                  {{ levelLabels[contest.level] || contest.level }} · {{ contest.registrationWindow }}
                </div>
              </button>
            </div>
          </section>
        </template>

        <template v-else-if="activeModule === 'project_config'">
          <section class="workspace-card">
            <h3>项目分析</h3>
            <ul class="workspace-suggestion-list">
              <li
                v-for="(item, index) in analysisSuggestions"
                :key="`suggestion-${index}-${item}`"
              >
                {{ item }}
              </li>
            </ul>
          </section>

          <section class="workspace-card">
            <h3>分析参数</h3>
            <div class="workspace-form-grid">
              <input
                :value="major"
                class="workspace-input"
                placeholder="专业"
                @input="emit('update:major', ($event.target as HTMLInputElement).value)"
              >
              <input
                :value="discipline"
                class="workspace-input"
                placeholder="学科/方向"
                @input="emit('update:discipline', ($event.target as HTMLInputElement).value)"
              >
              <select
                :value="level"
                class="workspace-input"
                @change="emit('update:level', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  级别（全部）
                </option>
                <option value="national">
                  national
                </option>
                <option value="provincial">
                  provincial
                </option>
                <option value="school">
                  school
                </option>
                <option value="industry">
                  industry
                </option>
              </select>
              <input
                :value="trackType"
                class="workspace-input"
                placeholder="赛道偏好"
                @input="emit('update:trackType', ($event.target as HTMLInputElement).value)"
              >
            </div>

            <div class="workspace-topk-row">
              <label>返回条数</label>
              <input
                :value="topK"
                class="workspace-input workspace-input--small"
                max="20"
                min="1"
                type="number"
                @input="onTopKInput"
              >
            </div>
          </section>

          <section class="workspace-card">
            <h3>快速配置模板</h3>
            <div class="workspace-preset-list">
              <button
                v-for="preset in filterPresets"
                :key="preset.id"
                class="workspace-preset-item"
                type="button"
                @click="applyFilterPreset(preset)"
              >
                {{ preset.title }}：{{ levelLabels[preset.level] || preset.level }} / {{ preset.topK }} 条
              </button>
            </div>
            <button
              class="workspace-btn workspace-btn--primary"
              :disabled="aiFiltering"
              @click="emit('runAiFilter')"
            >
              以当前配置执行 AI 分析
            </button>
          </section>
        </template>

        <template v-else>
          <section class="workspace-card">
            <div class="workspace-issue-panel__header">
              <h3>Issue 中心</h3>
              <button
                class="workspace-btn workspace-btn--ghost"
                :disabled="issueLoading"
                type="button"
                @click="reloadIssueCenter"
              >
                {{ issueLoading ? '刷新中...' : '刷新' }}
              </button>
            </div>
            <p class="workspace-issue-panel__hint">
              自动汇总寻疑报告与结构化问题项，便于统一跟踪风险与改进动作。
            </p>

            <div v-if="latestIssueReport" class="workspace-issue-report-card">
              <div class="workspace-issue-report-card__title">
                {{ latestIssueReport.title }}
              </div>
              <p>{{ latestIssueReport.summary || '暂无摘要。' }}</p>
              <div class="workspace-issue-report-card__meta">
                更新时间：{{ formatDateTime(latestIssueReport.updatedAt || latestIssueReport.createdAt) }}
              </div>
            </div>
            <div v-else class="workspace-empty-text">
              尚未生成 issue 报告，先在右侧切到“寻疑发现”执行一次扫描。
            </div>
          </section>

          <section class="workspace-card">
            <h3>问题条目（{{ visibleIssues.length }}）</h3>
            <div v-if="visibleIssues.length === 0" class="workspace-empty-text">
              暂无问题条目。
            </div>
            <div v-else class="workspace-issue-list no-scrollbar">
              <article
                v-for="issue in visibleIssues"
                :key="issue.id"
                class="workspace-issue-item"
              >
                <div class="workspace-issue-item__head">
                  <span class="workspace-issue-item__title">{{ issue.title }}</span>
                  <span :class="issueSeverityClass(issue.severity)">
                    {{ issueSeverityLabel(issue.severity) }}
                  </span>
                </div>
                <p class="workspace-issue-item__line">
                  证据：{{ issue.evidence || '暂无' }}
                </p>
                <p class="workspace-issue-item__line workspace-issue-item__line--suggestion">
                  建议：{{ issue.recommendation || '暂无' }}
                </p>
                <p class="workspace-issue-item__meta">
                  状态：{{ issue.status }} · {{ formatDateTime(issue.updatedAt || issue.createdAt) }}
                </p>
              </article>
            </div>
          </section>
        </template>
      </div>

      <WorkspaceResourceUploadHint
        v-if="activeModule === 'resource_manager' && !recyclePanelOpen"
        class="workspace-left-panel__footer"
        :busy="resourceMutating"
        :disabled="!hasActiveProject || resourceMutating"
        @select-files="handleResourceUpload"
      />
    </section>
  </aside>
</template>

<style scoped>
.workspace-left-dock {
  border-right: 1px solid #d3d8e4;
  background: #ffffff;
  display: flex;
  flex-shrink: 0;
  min-height: 0;
  width: 100%;
}

@media (min-width: 1280px) {
  .workspace-left-dock {
    width: 362px;
  }
}

.workspace-left-panel {
  background: #ffffff;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.workspace-left-panel__body {
  padding: 10px 0 14px;
  overflow-y: auto;
  flex: 1;
}

.workspace-left-panel__footer {
  padding: 8px 12px 12px;
  border-top: 1px solid #e2e8f2;
  background: #ffffff;
  flex-shrink: 0;
}

.workspace-tree-block {
  margin-bottom: 8px;
}

.workspace-tree-block--recycle-panel {
  margin-bottom: 0;
}

.workspace-recycle-panel__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px 0;
  color: #5b6f92;
}

.workspace-recycle-panel__header .material-symbols-outlined {
  font-size: 18px;
}

.workspace-recycle-panel__header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.workspace-recycle-panel__hint {
  margin: 4px 14px 8px;
  font-size: 11px;
  line-height: 1.4;
  color: #8b98ad;
}

.workspace-tree-block__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 10px;
}

.workspace-project-add-actions {
  position: relative;
}

.workspace-project-add-actions__input {
  display: none;
}

.workspace-tree-block__title {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #7888a2;
  padding: 4px 14px;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
}

.workspace-tree-block__title:hover {
  color: #556888;
}

.workspace-tree-block__title .material-symbols-outlined {
  font-size: 18px;
  transition: transform 0.2s ease;
}

.workspace-tree-block__arrow--collapsed {
  transform: rotate(-90deg);
}

.workspace-tree-block__title-action {
  border: 1px solid #d3dbe8;
  background: #ffffff;
  color: #43629c;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.workspace-tree-block__title-action:hover:enabled {
  background: #edf3ff;
}

.workspace-tree-block__title-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.workspace-tree-block__title-action .material-symbols-outlined {
  font-size: 16px;
}

.workspace-project-add-actions__menu {
  position: absolute;
  top: 30px;
  right: 0;
  min-width: 168px;
  border: 1px solid #d6deec;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(31, 45, 70, 0.14);
  padding: 4px;
  z-index: 24;
}

.workspace-project-add-actions__menu-item {
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #475977;
  min-height: 30px;
  font-size: 12px;
  text-align: left;
  padding: 6px 8px;
  cursor: pointer;
}

.workspace-project-add-actions__menu-item:hover:enabled {
  background: #edf2fb;
}

.workspace-project-add-actions__menu-item:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.workspace-project-add-actions__divider {
  height: 1px;
  background: #e6ecf6;
  margin: 4px 6px;
}

.workspace-tree-block__content {
  padding-bottom: 6px;
}

.workspace-skeleton {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  background: #e7edf7;
}

.workspace-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.82), transparent);
  animation: workspace-skeleton-shimmer 1.2s ease-in-out infinite;
}

@keyframes workspace-skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}

.workspace-tree-item-row {
  position: relative;
}

.workspace-tree-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 42px 0 14px;
  color: #4f5f7f;
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: background-color 0.2s ease;
}

.workspace-tree-item:hover {
  background: #f3f6fb;
}

.workspace-tree-item--active {
  background: #edf3ff;
  color: #2f4368;
}

.workspace-tree-item-row--skeleton .workspace-tree-item--skeleton {
  cursor: default;
  pointer-events: none;
}

.workspace-tree-item--skeleton {
  gap: 10px;
  align-items: center;
}

.workspace-tree-item__icon-skeleton {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  flex-shrink: 0;
}

.workspace-tree-item__content-skeleton {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.workspace-tree-item__label-skeleton {
  height: 11px;
  width: 78%;
}

.workspace-tree-item__meta-skeleton {
  height: 8px;
  width: 48%;
  border-radius: 999px;
}

.workspace-tree-item__action-skeleton {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  flex-shrink: 0;
}

.workspace-tree-item-row--skeleton:nth-child(2n) .workspace-tree-item__label-skeleton {
  width: 66%;
}

.workspace-tree-item-row--skeleton:nth-child(3n) .workspace-tree-item__label-skeleton {
  width: 72%;
}

.workspace-tree-item-row--skeleton:nth-child(2n) .workspace-tree-item__meta-skeleton {
  width: 40%;
}

.workspace-tree-item__icon {
  font-size: 18px;
  width: 18px;
  height: 18px;
  line-height: 18px;
}

.workspace-tree-item__label {
  font-size: 12px;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-resource-actions {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  z-index: 10;
}

.workspace-resource-actions__trigger {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #7f8ba0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.workspace-tree-item-row:hover .workspace-resource-actions__trigger,
.workspace-tree-item-row--menu-open .workspace-resource-actions__trigger {
  opacity: 1;
  pointer-events: auto;
}

.workspace-resource-actions__trigger:hover:enabled {
  background: #e9effa;
  color: #3f5d96;
}

.workspace-resource-actions__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.workspace-resource-actions__trigger .material-symbols-outlined {
  font-size: 16px;
}

.workspace-resource-actions__menu {
  position: absolute;
  top: 28px;
  right: 0;
  min-width: 136px;
  border: 1px solid #d6deec;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(31, 45, 70, 0.14);
  padding: 4px;
  z-index: 20;
}

.workspace-resource-actions__divider {
  height: 1px;
  background: #e6ecf6;
  margin: 4px 6px;
}

.workspace-resource-actions__menu-item {
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #475977;
  height: 30px;
  font-size: 12px;
  text-align: left;
  padding: 0 8px;
  cursor: pointer;
}

.workspace-resource-actions__menu-item:hover:enabled {
  background: #edf2fb;
}

.workspace-resource-actions__menu-item--danger {
  color: #cb3b3b;
}

.workspace-resource-actions__menu-item--danger:hover:enabled {
  background: #fff0f0;
}

.workspace-resource-actions__menu-item:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.workspace-recycle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
}

.workspace-recycle-item:hover {
  background: #f7f9fd;
}

.workspace-recycle-item__content {
  min-width: 0;
  flex: 1;
}

.workspace-recycle-item__title {
  font-size: 12px;
  color: #52617c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-recycle-item__meta {
  margin-top: 2px;
  font-size: 10px;
  color: #8d99ae;
}

.workspace-recycle-item__actions {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.workspace-recycle-item__action {
  border: 1px solid #d4dce9;
  border-radius: 6px;
  background: #ffffff;
  color: #4a5f84;
  height: 24px;
  min-width: 56px;
  padding: 0 8px;
  font-size: 11px;
  cursor: pointer;
}

.workspace-recycle-item__action--ghost:hover:enabled {
  background: #edf3ff;
}

.workspace-recycle-item__action--danger {
  color: #c74343;
  border-color: #efc0c0;
}

.workspace-recycle-item__action--danger:hover:enabled {
  background: #fff4f4;
}

.workspace-recycle-item__action:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.workspace-icon--doc {
  color: #3d6cdd;
}

.workspace-icon--table {
  color: #7b879f;
}

.workspace-icon--pdf {
  color: #f04d4d;
}

.workspace-icon--slide {
  color: #f97316;
}

.workspace-icon--text {
  color: #0f766e;
}

.workspace-icon--image {
  color: #7c3aed;
}

.workspace-icon--collab {
  color: #0f766e;
}

.workspace-library-skeleton-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
}

.workspace-library-skeleton-item__left {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.workspace-library-skeleton-item__icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}

.workspace-library-skeleton-item__content {
  min-width: 0;
  flex: 1;
}

.workspace-library-skeleton-item__title {
  height: 11px;
  width: 64%;
}

.workspace-library-skeleton-item__meta {
  margin-top: 6px;
  height: 8px;
  width: 40%;
  border-radius: 999px;
}

.workspace-library-skeleton-item__action {
  width: 36px;
  height: 18px;
  border-radius: 6px;
  flex-shrink: 0;
}

.workspace-library-skeleton-item:nth-child(2n) .workspace-library-skeleton-item__title {
  width: 58%;
}

.workspace-library-skeleton-item:nth-child(3n) .workspace-library-skeleton-item__meta {
  width: 34%;
}

.workspace-outline-skeleton-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
}

.workspace-outline-skeleton-row--child {
  padding-left: 36px;
}

.workspace-outline-skeleton__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.workspace-outline-skeleton {
  height: 10px;
  width: 76%;
  border-radius: 999px;
}

.workspace-outline-skeleton-row:nth-child(2n) .workspace-outline-skeleton {
  width: 62%;
}

.workspace-outline-skeleton-row:nth-child(3n) .workspace-outline-skeleton {
  width: 70%;
}

.workspace-outline-item {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1.28;
  text-align: left;
  color: #6f7e98;
  padding: 9px 14px;
  cursor: pointer;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-outline-item:hover {
  background: #f3f6fb;
}

.workspace-outline-item--child {
  padding-left: 36px;
  font-size: 12px;
}

.workspace-outline-item--active {
  background: #edf3ff;
  color: #1f2f4d;
  font-weight: 600;
}

.workspace-outline-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 3px;
  background: #2f6af2;
}

.workspace-empty-text {
  margin: 6px 0 0;
  color: #9ba7bc;
  font-size: 12px;
  text-align: center;
}

.workspace-library-search {
  width: 100%;
  border: 1px solid #d5dce9;
  border-radius: 8px;
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  color: #344866;
  background: #ffffff;
  outline: none;
}

.workspace-library-search:focus {
  border-color: #2f6af2;
  box-shadow: 0 0 0 2px rgba(47, 106, 242, 0.14);
}

.workspace-library-list {
  max-height: 196px;
  overflow-y: auto;
}

.workspace-library-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-library-modal .workspace-library-list {
  border: 1px solid #dbe2ef;
  border-radius: 8px;
  max-height: 300px;
}

.workspace-empty-text--modal {
  margin: 0;
}

.workspace-library-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px;
}

.workspace-library-item:hover {
  background: #f5f8ff;
}

.workspace-library-item__content {
  min-width: 0;
  flex: 1;
}

.workspace-library-item__title {
  font-size: 12px;
  color: #415474;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-library-item__meta {
  margin-top: 2px;
  color: #8694ac;
  font-size: 10px;
}

.workspace-library-item__add {
  border: 1px solid #c9d3e6;
  background: #ffffff;
  color: #3f5f9f;
  border-radius: 7px;
  height: 26px;
  min-width: 48px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.workspace-library-item__add:hover:enabled {
  background: #edf3ff;
}

.workspace-library-item__add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.workspace-share-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-share-modal__target {
  margin: 0;
  color: #415373;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

.workspace-share-modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #667794;
}

.workspace-share-modal__select {
  width: 100%;
  min-height: 34px;
  border: 1px solid #d5ddea;
  border-radius: 8px;
  background: #ffffff;
  color: #415373;
  font-size: 12px;
  padding: 0 10px;
  outline: none;
}

.workspace-share-modal__select:focus {
  border-color: #7ba0e8;
}

.workspace-share-modal__actions {
  margin-top: 4px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.workspace-share-modal__btn--primary {
  border-color: #4f7ddf;
  background: #3d6ddd;
  color: #ffffff;
}

.workspace-share-modal__btn--primary:hover:enabled {
  background: #3565d4;
}

.workspace-delete-modal {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-delete-modal p {
  margin: 0;
  color: #405272;
  font-size: 13px;
  line-height: 1.5;
}

.workspace-delete-modal__hint {
  color: #7b89a0 !important;
  font-size: 12px !important;
}

.workspace-delete-modal__actions {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.workspace-delete-modal__btn {
  border: 1px solid #d4dbe8;
  border-radius: 8px;
  min-width: 86px;
  height: 34px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.workspace-delete-modal__btn--ghost {
  background: #ffffff;
  color: #405272;
}

.workspace-delete-modal__btn--ghost:hover:enabled {
  background: #f4f7fc;
}

.workspace-delete-modal__btn--danger {
  border-color: #dd5a5a;
  background: #e55252;
  color: #ffffff;
}

.workspace-delete-modal__btn--danger:hover:enabled {
  background: #d84b4b;
}

.workspace-delete-modal__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.workspace-resource-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-resource-detail__title {
  margin: 0;
  color: #344866;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  word-break: break-all;
}

.workspace-resource-detail__value {
  color: #415373;
  word-break: break-all;
}

.workspace-resource-detail__actions {
  display: flex;
  justify-content: flex-end;
}

.workspace-card {
  margin: 0 12px 12px;
  border: 1px solid #d5dbe8;
  border-radius: 10px;
  background: #ffffff;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-card h3 {
  margin: 0;
  color: #3b4a66;
  font-size: 13px;
  font-weight: 700;
}

.workspace-suggestion-list {
  margin: 0;
  padding: 0 0 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #4b5a75;
  font-size: 12px;
  line-height: 1.5;
}

.workspace-textarea {
  border: 1px solid #d8deea;
  border-radius: 8px;
  padding: 10px;
  min-height: 100px;
  resize: vertical;
  font-size: 12px;
  color: #344866;
  outline: none;
}

.workspace-textarea:focus {
  border-color: #2f6af2;
  box-shadow: 0 0 0 2px rgba(47, 106, 242, 0.15);
}

.workspace-config-summary {
  font-size: 11px;
  color: #60708e;
  padding: 8px;
  border: 1px solid #dde3ee;
  border-radius: 8px;
  background: #f5f7fb;
}

.workspace-action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-btn {
  height: 34px;
  border-radius: 8px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.workspace-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.workspace-btn--ghost {
  border: 1px solid #ced6e4;
  background: #ffffff;
  color: #3f506f;
}

.workspace-btn--ghost:hover:enabled {
  background: #f5f8ff;
}

.workspace-btn--primary {
  background: #2f6af2;
  color: #ffffff;
}

.workspace-btn--primary:hover:enabled {
  background: #2456cb;
}

.workspace-analysis-status {
  border: 1px solid #dde3ee;
  border-radius: 8px;
  background: #f7f9fc;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-analysis-status__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #5e6f8d;
}

.workspace-pill {
  padding: 2px 6px;
  border-radius: 999px;
  background: #e5eaf3;
  color: #5e6f8d;
  font-size: 10px;
  font-weight: 700;
}

.workspace-pill--done {
  background: #d9f4e6;
  color: #1f8f5f;
}

.workspace-analysis-status p {
  margin: 0;
  color: #6a7a96;
  font-size: 11px;
}

.workspace-inline-action {
  border: none;
  background: transparent;
  color: #2f6af2;
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.workspace-inline-action--dark {
  color: #42516f;
}

.workspace-log-text {
  margin: 0;
  border: 1px solid #dbe2ef;
  border-radius: 6px;
  background: #ffffff;
  padding: 8px;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: #445273;
}

.workspace-admin-detail {
  border: 1px solid #dbe2ef;
  border-radius: 6px;
  background: #ffffff;
  padding: 8px;
  font-size: 11px;
  color: #425172;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-admin-detail__label {
  color: #7a88a1;
  font-size: 10px;
  margin-bottom: 2px;
}

.workspace-admin-detail pre {
  margin: 0;
  white-space: pre-wrap;
}

.workspace-contest-list {
  max-height: 230px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-contest-item {
  width: 100%;
  border: 1px solid #d8dfec;
  border-radius: 8px;
  background: #f8faff;
  padding: 8px;
  text-align: left;
  cursor: pointer;
}

.workspace-contest-item--active {
  border-color: #7ca3f8;
  background: #ebf2ff;
}

.workspace-contest-item__name {
  font-size: 12px;
  font-weight: 600;
  color: #3a4c6d;
}

.workspace-contest-item__meta {
  margin-top: 4px;
  font-size: 10px;
  color: #7483a0;
}

.workspace-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-input {
  width: 100%;
  border: 1px solid #d5dce9;
  border-radius: 8px;
  height: 34px;
  padding: 0 10px;
  font-size: 12px;
  color: #344866;
  background: #ffffff;
  outline: none;
}

.workspace-input:focus {
  border-color: #2f6af2;
  box-shadow: 0 0 0 2px rgba(47, 106, 242, 0.14);
}

.workspace-input--small {
  width: 84px;
}

.workspace-topk-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.workspace-topk-row label {
  color: #627492;
  font-size: 11px;
}

.workspace-preset-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-preset-item {
  width: 100%;
  border: 1px solid #d8dfea;
  border-radius: 8px;
  background: #f7f9fd;
  color: #475b7e;
  font-size: 11px;
  text-align: left;
  padding: 7px 8px;
  cursor: pointer;
}

.workspace-preset-item:hover {
  background: #edf3ff;
}

.workspace-issue-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workspace-issue-panel__hint {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #667790;
}

.workspace-issue-report-card {
  margin-top: 8px;
  border: 1px solid #fde7b1;
  border-radius: 8px;
  background: #fffbeb;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-issue-report-card__title {
  font-size: 12px;
  font-weight: 700;
  color: #7a4f0f;
}

.workspace-issue-report-card p {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #8a631d;
}

.workspace-issue-report-card__meta {
  font-size: 10px;
  color: #a17a37;
}

.workspace-issue-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-issue-item {
  border: 1px solid #dce3f0;
  border-radius: 8px;
  background: #ffffff;
  padding: 10px;
}

.workspace-issue-item__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.workspace-issue-item__title {
  font-size: 12px;
  font-weight: 600;
  color: #344a6c;
  line-height: 1.5;
}

.workspace-issue-item__line {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #5b6f90;
}

.workspace-issue-item__line--suggestion {
  color: #156f4f;
}

.workspace-issue-item__meta {
  margin: 6px 0 0;
  font-size: 10px;
  color: #8392a8;
}

.workspace-issue-tag {
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 10px;
  line-height: 1;
  padding: 3px 7px;
  white-space: nowrap;
}

.workspace-issue-tag--critical {
  border-color: #fecaca;
  color: #b91c1c;
  background: #fee2e2;
}

.workspace-issue-tag--high {
  border-color: #fed7aa;
  color: #b45309;
  background: #ffedd5;
}

.workspace-issue-tag--medium {
  border-color: #fde68a;
  color: #92400e;
  background: #fef3c7;
}

.workspace-issue-tag--low {
  border-color: #bbf7d0;
  color: #166534;
  background: #dcfce7;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
