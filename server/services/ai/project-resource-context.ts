import type { Queryable } from '~~/server/utils/db'
import type { AuthUser, Resource } from '~~/shared/types/domain'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { listProjectResources } from '~~/server/utils/project-resource-store'

interface LoadProjectResourceContextInput {
  workspaceId: string
  projectId?: string
}

interface BuildProjectResourceLocalContextInput {
  contestName?: string
  trackName?: string
  major?: string
  limit?: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    const normalized = normalizeString(value).toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }
  return false
}

function splitKeywords(value: string): string[] {
  return normalizeString(value)
    .split(/[\s,，。.!！?？;；:：/\\|\-]+/)
    .map(item => item.trim().toLowerCase())
    .filter(item => item.length >= 2)
}

function summarizeText(value: unknown, max = 180): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ')
  if (!normalized)
    return ''
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, max)}...`
}

function flattenMetadataText(value: unknown): string {
  if (value == null)
    return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return normalizeString(value)
  if (Array.isArray(value))
    return value.map(item => flattenMetadataText(item)).filter(Boolean).join(' ')
  if (typeof value === 'object')
    return Object.values(value as Record<string, unknown>).map(item => flattenMetadataText(item)).filter(Boolean).join(' ')
  return ''
}

function calcResourceMatchScore(resource: Resource, keywords: string[]): number {
  if (keywords.length === 0)
    return 0

  const target = [
    resource.title,
    resource.summary,
    resource.content,
    resource.category,
    resource.resourceKind,
    resource.collabPurpose,
    resource.drawMode,
    resource.sceneSourceType,
    resource.templateKey,
    flattenMetadataText(resource.metadata),
  ]
    .map(item => normalizeString(item).toLowerCase())
    .join(' ')

  if (!target)
    return 0

  let matched = 0
  for (const keyword of keywords) {
    if (target.includes(keyword))
      matched += 1
  }

  return matched / keywords.length
}

function normalizeResourceSource(resource: Resource): string {
  if (resource.source === 'upload')
    return 'upload'
  if (resource.source === 'library')
    return 'library'
  if (resource.source === 'collab')
    return 'collab'
  if (resource.source === 'external')
    return 'external'
  if (normalizeString(resource.linkedContestResourceId))
    return 'library'
  return 'upload'
}

function resolveResourceMimeType(resource: Resource): string {
  const metadata = normalizeRecord(resource.metadata)
  const metadataMimeType = normalizeString(metadata.mimeType || metadata.mime_type || metadata.contentType)
  if (metadataMimeType)
    return metadataMimeType.toLowerCase()

  const type = normalizeString(resource.type)
  if (type.includes('/'))
    return type.toLowerCase()
  return ''
}

function resolveResourceFileName(resource: Resource): string {
  const metadata = normalizeRecord(resource.metadata)
  return normalizeString(metadata.fileName || metadata.filename || metadata.name || resource.title)
}

function resolveResourceExtension(resource: Resource): string {
  const fileName = resolveResourceFileName(resource).toLowerCase()
  const matched = fileName.match(/\.([a-z0-9]+)$/)
  return matched?.[1] || ''
}

function resolveMediaKind(resource: Resource): string {
  const mimeType = resolveResourceMimeType(resource)
  const extension = resolveResourceExtension(resource)

  if (mimeType.includes('device-arrangement'))
    return 'device_arrangement'
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension))
    return 'image'
  if (mimeType.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv'].includes(extension))
    return 'video'
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac'].includes(extension))
    return 'audio'
  if (mimeType === 'application/pdf' || extension === 'pdf')
    return 'pdf'
  if (
    mimeType.includes('wordprocessingml')
    || mimeType.includes('msword')
    || ['doc', 'docx'].includes(extension)
  ) {
    return 'document'
  }
  if (
    mimeType.includes('spreadsheetml')
    || mimeType.includes('excel')
    || ['xls', 'xlsx', 'csv'].includes(extension)
  ) {
    return 'spreadsheet'
  }
  if (
    mimeType.includes('presentationml')
    || mimeType.includes('powerpoint')
    || ['ppt', 'pptx'].includes(extension)
  ) {
    return 'presentation'
  }
  if (mimeType.startsWith('text/') || ['txt', 'md', 'markdown'].includes(extension))
    return 'text'
  return resource.resourceKind || 'binary'
}

function isDeviceArrangementResource(resource: Resource): boolean {
  const metadata = normalizeRecord(resource.metadata)
  return normalizeBoolean(metadata.deviceArrangement)
    || normalizeString(metadata.designMode).toLowerCase() === 'device_arrangement'
    || resolveResourceMimeType(resource).includes('device-arrangement')
    || normalizeString(resource.sourceLink).includes('/device-arrangements/')
}

function buildResourceCapabilityTags(resource: Resource): string[] {
  const metadata = normalizeRecord(resource.metadata)
  const source = normalizeResourceSource(resource)
  const mediaKind = resolveMediaKind(resource)
  const resourceKind = normalizeString(resource.resourceKind || metadata.resourceKind || mediaKind || 'binary')
  const collabPurpose = normalizeString(resource.collabPurpose || metadata.collabPurpose)
  const drawMode = normalizeString(resource.drawMode || metadata.drawMode)
  const sceneSourceType = normalizeString(resource.sceneSourceType || metadata.sceneSourceType || metadata.sourceType)
  const mimeType = resolveResourceMimeType(resource)
  const tags: string[] = [
    `source=${source}`,
    `resourceKind=${resourceKind}`,
    `media=${mediaKind}`,
  ]

  if (mimeType)
    tags.push(`mime=${mimeType}`)
  if (collabPurpose)
    tags.push(`collabPurpose=${collabPurpose}`)
  if (drawMode)
    tags.push(`drawMode=${drawMode}`)
  if (sceneSourceType)
    tags.push(`sceneSourceType=${sceneSourceType}`)
  if (resource.templateKey)
    tags.push(`template=${resource.templateKey}`)
  if (resource.documentId)
    tags.push('document=available')
  if (resource.previewStatus)
    tags.push(`previewStatus=${resource.previewStatus}`)
  if (resource.previewUrl)
    tags.push('previewUrl=available')

  if (isDeviceArrangementResource(resource))
    tags.push('device_arrangement', '设备排布文档', '可用于生成设计排布/原型草案')
  if (resourceKind === 'markdown')
    tags.push(collabPurpose === 'notes' ? '协作笔记/AgentDoc 文档' : 'Markdown 文档', '可生成文档草案')
  if (resourceKind === 'draw' && collabPurpose === 'workflow')
    tags.push('AgentProto workflow 画布', '可生成 workflow 草案')
  if (resourceKind === 'draw' && collabPurpose === 'design')
    tags.push('设计画布', 'Mockup/设备排布候选', '可生成 scene 草案')
  if (resourceKind === 'draw' && collabPurpose !== 'workflow' && collabPurpose !== 'design')
    tags.push('自由画布/原型画布', '可生成 scene 草案')
  if (sceneSourceType === 'image_mockup')
    tags.push('image_mockup')
  if (mediaKind === 'image')
    tags.push('图片/OCR/视觉投影候选')
  if (mediaKind === 'video')
    tags.push('视频/视觉投影候选')
  if (mediaKind === 'audio')
    tags.push('音频/会议转写候选')
  if (mediaKind === 'pdf')
    tags.push('PDF/分页解析候选')
  if (resource.aiProfile?.governanceStatus)
    tags.push(`knowledgeGovernance=${resource.aiProfile.governanceStatus}`)
  if (resource.aiProfile?.aiTags?.length)
    tags.push(`aiTags=${resource.aiProfile.aiTags.slice(0, 4).join(',')}`)

  return [...new Set(tags.filter(Boolean))]
}

export async function loadVisibleProjectResourcesForAi(
  db: Queryable,
  user: AuthUser,
  input: LoadProjectResourceContextInput,
): Promise<Resource[]> {
  const workspaceId = normalizeString(input.workspaceId)
  const projectId = normalizeString(input.projectId)
  if (!projectId)
    return []

  const visibleProject = await getVisibleProjectById(db, user, projectId)
  if (!visibleProject || normalizeString(visibleProject.workspaceId) !== workspaceId)
    throw new Error('PROJECT_NOT_FOUND')

  return listProjectResources(db, projectId)
}

export function buildProjectResourceLocalContext(
  resources: Resource[],
  input: BuildProjectResourceLocalContextInput,
): string {
  if (resources.length === 0)
    return '项目资料池暂无可用资料。'

  const keywords = [
    ...splitKeywords(input.contestName || ''),
    ...splitKeywords(input.trackName || ''),
    ...splitKeywords(input.major || ''),
  ]

  const limit = Math.max(3, Math.min(16, Number(input.limit || 10)))

  const ranked = [...resources]
    .map((resource) => {
      return {
        resource,
        matchScore: calcResourceMatchScore(resource, keywords),
      }
    })
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore)
        return right.matchScore - left.matchScore
      return normalizeString(right.resource.updatedAt).localeCompare(normalizeString(left.resource.updatedAt))
    })
    .slice(0, limit)

  const lines = ranked.map(({ resource }, index) => {
    const category = normalizeString(resource.category || resource.type || 'templates')
    const source = normalizeResourceSource(resource)
    const summary = summarizeText(resource.summary || resource.content || '')
    const summaryText = summary || '暂无摘要'
    const capabilityTags = buildResourceCapabilityTags(resource)
    const resourceId = normalizeString(resource.id)
    return [
      `${index + 1}. [${source}/${category}] ${normalizeString(resource.title) || '未命名资料'}（${resource.year || 0}）`,
      resourceId ? `资源ID：${resourceId}` : '',
      `多模态描述符：${capabilityTags.join('；') || '暂无'}`,
      `摘要：${summaryText}`,
    ].filter(Boolean).join('\n')
  })

  return `项目多模态资源摘要（共 ${resources.length} 条，展示 ${ranked.length} 条）：\n${lines.join('\n')}`
}
