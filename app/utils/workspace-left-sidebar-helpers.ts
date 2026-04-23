import type {
  CollabPurpose,
  ProjectIssue,
  ProjectIssueReport,
  ProjectMemberSummary,
  ProjectOutlineNode,
  Resource,
  ResourceCategory,
} from '~~/shared/types/domain'
import type { ProjectUploadTask } from '~/types/project-upload'
import type { WorkspaceLinkedContestResourceGroup } from '~/types/workspace'
import { formatFileSize } from '~~/shared/constants/project-resource-upload'
import {
  COLLAB_GENERIC_RESOURCE_LABEL,
  resolveCollabResourceDisplayLabel,
} from '~~/shared/utils/collab-resource'
import {
  isProjectUploadTaskSidebarVisible,
  resolveProjectUploadTaskStatusText,
  resolveProjectUploadTaskTone,
} from '~/utils/project-upload'
import { formatWorkspaceDateTime } from '~/utils/workspace-main-panel-formatters'

export interface OutlineItem {
  id: string
  label: string
  level: number
  uploadTask?: ProjectUploadTask
  statusText?: string
  progressPercent?: number
}

export interface ResourceAttributeField {
  label: string
  value: string
}

export interface WorkspaceLinkedContestResourceCategoryGroup {
  id: string
  label: string
  resources: Resource[]
}

export interface WorkspaceLinkedContestResourceDisplayGroup extends WorkspaceLinkedContestResourceGroup {
  categories: WorkspaceLinkedContestResourceCategoryGroup[]
}

export const resourceCategoryOrder: ResourceCategory[] = [
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

export const resourceCategoryLabels: Record<ResourceCategory, string> = {
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

const recycleRetentionDays = 30

function metadataRecord(resource: Resource): Record<string, unknown> {
  const metadata = resource.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return {}
  return metadata as Record<string, unknown>
}

function metadataFlag(resource: Resource | null | undefined, key: string): boolean {
  if (!resource)
    return false
  const metadata = metadataRecord(resource)
  const value = metadata[key]
  return value === true || String(value || '').trim().toLowerCase() === 'true'
}

function normalizeMetadataString(resource: Resource, key: string): string {
  const metadata = metadataRecord(resource)
  return String(metadata[key] || '').trim()
}

export function metadataFileName(resource: Resource): string {
  return normalizeMetadataString(resource, 'fileName')
}

export function metadataMimeType(resource: Resource): string {
  return normalizeMetadataString(resource, 'mimeType').toLowerCase()
}

export function metadataUploadedAt(resource: Resource): string {
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

export function metadataFileSize(resource: Resource): number {
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

export function resolveCollabPurpose(resource: Resource | null | undefined): CollabPurpose | '' {
  const normalized = String(resource?.collabPurpose || '').trim().toLowerCase()
  if (normalized === 'workflow' || normalized === 'freeform' || normalized === 'design' || normalized === 'notes')
    return normalized
  if (resource?.resourceKind === 'draw') {
    const drawMode = String(resource.drawMode || '').trim().toLowerCase()
    const fixedTab = String(resource.metadata?.fixedTab || '').trim().toLowerCase()
    if (drawMode === 'composition' || fixedTab === 'design')
      return 'design'
  }
  if (resource?.resourceKind === 'markdown')
    return 'notes'
  if (resource?.resourceKind === 'draw')
    return 'freeform'
  return ''
}

export function isDesignCanvasResource(resource: Resource | null | undefined): boolean {
  return resolveCollabPurpose(resource) === 'design'
}

export function isDeviceArrangementResource(resource: Resource | null | undefined): boolean {
  if (!resource)
    return false
  return metadataFlag(resource, 'deviceArrangement')
    || String(resource.metadata?.mimeType || '').trim().toLowerCase() === 'application/vnd.winloop.device-arrangement+json'
}

export function isLegacyDeviceArrangementResource(resource: Resource | null | undefined): boolean {
  if (!resource)
    return false
  if (isDeviceArrangementResource(resource))
    return false
  return resolveCollabPurpose(resource) === 'design'
    && resource.resourceKind === 'draw'
    && String(resource.metadata?.designMode || '').trim().toLowerCase() === 'device_arrangement'
}

export function resolveCollabResourceLabel(resource: Resource | null | undefined): string {
  if (!isCollabResource(resource))
    return COLLAB_GENERIC_RESOURCE_LABEL

  if (isDeviceArrangementResource(resource))
    return '设备排布'

  const kind = resource?.resourceKind === 'markdown' || resource?.resourceKind === 'draw'
    ? resource.resourceKind
    : ''
  return resolveCollabResourceDisplayLabel(resolveCollabPurpose(resource), kind)
}

export function resolveCollabResourceIcon(resource: Resource | null | undefined): string {
  if (isDeviceArrangementResource(resource))
    return 'devices'
  const purpose = resolveCollabPurpose(resource)
  if (purpose === 'workflow')
    return 'flowsheet'
  if (purpose === 'design')
    return 'palette'
  if (purpose === 'freeform')
    return 'draw'
  return 'edit_note'
}

export function resolveCollabResourceIconClass(resource: Resource | null | undefined): string {
  if (!isCollabResource(resource))
    return 'workspace-icon--doc'
  return 'workspace-icon--collab'
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

export function resourceDisplayTitle(resource: Resource): string {
  const title = String(resource.title || '').trim()
  if (title)
    return title

  const type = String(resource.type || 'doc').trim().toLowerCase()
  if (type)
    return `未命名文档.${type}`

  return '未命名文档'
}

export function isCollabResource(resource: Resource | null | undefined): boolean {
  const source = String(resource?.source || resource?.sourceType || '').trim().toLowerCase()
  const kind = String(resource?.resourceKind || '').trim().toLowerCase()
  return source === 'collab' || kind === 'markdown' || kind === 'draw'
}

export function resourceIcon(resource: Resource): string {
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  if (kind === 'draw' || kind === 'markdown' || source === 'collab')
    return resolveCollabResourceIcon(resource)

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

export function resourceIconClass(resource: Resource): string {
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  if (kind === 'draw' || kind === 'markdown' || source === 'collab')
    return resolveCollabResourceIconClass(resource)

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

export function hasDownloadableSource(resource: Resource): boolean {
  const sourceDownloadUrl = String(resource.sourceDownloadUrl || '').trim()
  const sourceLink = String(resource.sourceLink || '').trim()
  return Boolean(sourceDownloadUrl || sourceLink)
}

export function hasPreviewableSource(resource: Resource): boolean {
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

export function canDuplicateResource(resource: Resource): boolean {
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  const kind = String(resource.resourceKind || '').trim().toLowerCase()
  return source !== 'collab' && kind !== 'markdown' && kind !== 'draw'
}

export function resourceSourceLabel(resource: Resource): string {
  const source = String(resource.source || resource.sourceType || '').trim().toLowerCase()
  if (source === 'collab' || resource.resourceKind === 'markdown' || resource.resourceKind === 'draw')
    return resolveCollabResourceLabel(resource)
  if (source === 'upload' || source === 'project_upload')
    return '项目上传'
  if (source === 'library')
    return '系统资料库'
  return source || '-'
}

export function resourceAvailabilityLabel(resource: Resource): string {
  const availability = String(resource.availability || '').trim()
  if (availability === 'public')
    return '公开'
  if (availability === 'login_required')
    return '登录后可见'
  if (availability === 'unavailable')
    return '不可访问'
  return availability || '-'
}

export function resourcePreviewStatusLabel(resource: Resource): string {
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

function findProjectMemberName(userId: string, projectMembers: ProjectMemberSummary[]): string {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId)
    return ''
  const matched = projectMembers.find(member => String(member.userId || '').trim() === normalizedUserId)
  return String(matched?.username || '').trim()
}

export function resourceUploaderLabel(
  resource: Resource,
  options: {
    projectMembers?: ProjectMemberSummary[]
    currentUserId?: string
    currentUsername?: string
  } = {},
): string {
  const uploaderUserId = String(resource.uploaderUserId || resource.createdBy || '').trim()
  const createdBy = String(resource.createdBy || '').trim()
  const currentUserId = String(options.currentUserId || '').trim()

  const resolvedName = String(
    resource.uploaderUsername
    || findProjectMemberName(uploaderUserId || createdBy, options.projectMembers || [])
    || metadataUploader(resource)
    || '',
  ).trim()

  if (currentUserId && uploaderUserId && uploaderUserId === currentUserId) {
    const currentUsername = String(options.currentUsername || '').trim()
    const displayName = resolvedName || currentUsername || '我'
    return displayName === '我' ? displayName : `${displayName}（我）`
  }

  if (resolvedName)
    return resolvedName

  return uploaderUserId || createdBy || '-'
}

export function resourceStorageLabel(resource: Resource): string {
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

export function resourceProjectCapacityShareLabel(resource: Resource, projectStorageLimitBytes: number): string {
  const limitBytes = Math.max(0, Number(projectStorageLimitBytes || 0))
  const resourceSize = metadataFileSize(resource)
  if (resourceSize <= 0 || limitBytes <= 0)
    return '-'

  const percentage = (resourceSize / limitBytes) * 100
  return `${formatPercent(percentage)}（${formatFileSize(resourceSize)} / ${formatFileSize(limitBytes)}）`
}

export function resolveResourceDetailRows(
  resource: Resource | null,
  options: {
    projectMembers?: ProjectMemberSummary[]
    currentUserId?: string
    currentUsername?: string
    projectStorageLimitBytes?: number
  } = {},
): ResourceAttributeField[] {
  if (!resource)
    return []

  const uploadedAt = resolveResourceUploadedAt(resource)
  const createdAt = String(resource.createdAt || '').trim()
  const updatedAt = String(resource.updatedAt || '').trim()

  return [
    {
      label: '占用空间',
      value: resourceStorageLabel(resource),
    },
    {
      label: '占项目总容量',
      value: resourceProjectCapacityShareLabel(resource, Number(options.projectStorageLimitBytes || 0)),
    },
    {
      label: '上传者',
      value: resourceUploaderLabel(resource, options),
    },
    {
      label: '上传时间',
      value: formatWorkspaceDateTime(uploadedAt),
    },
    {
      label: '创建时间',
      value: formatWorkspaceDateTime(createdAt),
    },
    {
      label: '更新时间',
      value: formatWorkspaceDateTime(updatedAt),
    },
    {
      label: '文件名',
      value: metadataFileName(resource) || '-',
    },
    {
      label: 'MIME 类型',
      value: metadataMimeType(resource) || '-',
    },
    {
      label: '来源',
      value: resourceSourceLabel(resource),
    },
    {
      label: '访问权限',
      value: resourceAvailabilityLabel(resource),
    },
    {
      label: '预览状态',
      value: resourcePreviewStatusLabel(resource),
    },
    {
      label: '资源 ID',
      value: String(resource.id || '-').trim() || '-',
    },
  ]
}

export function resolveResourceCategoryLabel(category: string): string {
  const normalized = String(category || '').trim() as ResourceCategory
  return resourceCategoryLabels[normalized] || normalized || '未分类'
}

export function sortResourcesByCategory(left: Resource, right: Resource): number {
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

export function buildLinkedContestResourceDisplayGroups(groups: WorkspaceLinkedContestResourceGroup[]): WorkspaceLinkedContestResourceDisplayGroup[] {
  return groups.map(group => ({
    ...group,
    resources: Array.isArray(group.resources) ? group.resources : [],
    categories: buildLinkedContestResourceCategories(group.resources || []),
  }))
}

export function normalizeOutlineLabel(value: string): string {
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

    if (Array.isArray(node.children) && node.children.length > 0)
      result.push(...flattenProjectOutlineNodes(node.children, numberChain))
  }

  return result
}

function buildFallbackOutlineItems(resources: Resource[]): OutlineItem[] {
  const items: OutlineItem[] = []

  resources.forEach((resource, resourceIndex) => {
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
}

export function buildUploadOutlineItems(tasks: ProjectUploadTask[]): OutlineItem[] {
  return tasks.map(task => ({
    id: `upload-outline-${task.sessionId}`,
    label: task.fileName,
    level: 0,
    uploadTask: task,
    statusText: resolveProjectUploadTaskStatusText(task.status, task.needsFileRebind),
    progressPercent: task.status === 'finalizing' ? 100 : Math.max(0, Math.min(100, Number(task.progressPercent || 0))),
  }))
}

export function buildOutlineItems(projectOutline: ProjectOutlineNode[], visibleUploadTasks: ProjectUploadTask[], visibleResources: Resource[]): OutlineItem[] {
  const uploadItems = buildUploadOutlineItems(visibleUploadTasks)
  const backendItems = flattenProjectOutlineNodes(projectOutline)
  if (backendItems.length > 0)
    return [...uploadItems, ...backendItems]
  return [...uploadItems, ...buildFallbackOutlineItems(visibleResources)]
}

export function uploadTaskExtension(task: ProjectUploadTask): string {
  const fileName = String(task.fileName || '').trim().toLowerCase()
  const index = fileName.lastIndexOf('.')
  if (index < 0)
    return ''
  return fileName.slice(index + 1)
}

export function uploadTaskIcon(task: ProjectUploadTask): string {
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

export function uploadTaskIconClass(task: ProjectUploadTask): string {
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

export function uploadTaskStatusText(task: ProjectUploadTask): string {
  return resolveProjectUploadTaskStatusText(task.status, task.needsFileRebind)
}

export function uploadTaskMetaText(task: ProjectUploadTask): string {
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

export function uploadTaskToneClass(task: ProjectUploadTask): string {
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

export function uploadTaskProgressStyle(task: ProjectUploadTask): Record<string, string> {
  const progress = task.status === 'finalizing'
    ? 100
    : Math.max(0, Math.min(100, Number(task.progressPercent || 0)))
  return {
    '--upload-progress': `${progress}%`,
  }
}

export function canPauseUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'uploading' && !task.needsFileRebind
}

export function canResumeUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'paused' && !task.needsFileRebind
}

export function canRetryUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'failed' && !task.needsFileRebind
}

export function canCancelUploadTask(task: ProjectUploadTask): boolean {
  return task.status !== 'finalizing'
}

export function canRebindUploadTask(task: ProjectUploadTask): boolean {
  return task.needsFileRebind || task.status === 'failed'
}

export function resolveVisibleUploadTasks(tasks: ProjectUploadTask[]): ProjectUploadTask[] {
  return tasks.filter(task => isProjectUploadTaskSidebarVisible(task))
}

export function recycleDaysLeft(resource: Resource): number {
  const deletedAt = new Date(String(resource.deletedAt || resource.updatedAt || resource.createdAt || '')).getTime()
  if (!Number.isFinite(deletedAt))
    return recycleRetentionDays
  const oneDayMs = 24 * 60 * 60 * 1000
  const expiresAt = deletedAt + recycleRetentionDays * oneDayMs
  const remaining = Math.ceil((expiresAt - Date.now()) / oneDayMs)
  return Math.max(0, remaining)
}

export function recycleHint(resource: Resource): string {
  const leftDays = recycleDaysLeft(resource)
  if (leftDays <= 0)
    return '即将永久删除'
  return `预计 ${leftDays} 天后自动删除`
}

export function issueSeverityLabel(value: string): string {
  if (value === 'critical')
    return '严重'
  if (value === 'high')
    return '高'
  if (value === 'low')
    return '低'
  return '中'
}

export function issueSeverityClass(value: string): string {
  if (value === 'critical')
    return 'workspace-issue-tag workspace-issue-tag--critical'
  if (value === 'high')
    return 'workspace-issue-tag workspace-issue-tag--high'
  if (value === 'low')
    return 'workspace-issue-tag workspace-issue-tag--low'
  return 'workspace-issue-tag workspace-issue-tag--medium'
}

export function latestIssueReport(issueReports: ProjectIssueReport[]): ProjectIssueReport | null {
  return issueReports[0] || null
}

export function visibleIssues(projectIssues: ProjectIssue[]): ProjectIssue[] {
  return projectIssues.slice(0, 20)
}
