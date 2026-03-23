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

function calcResourceMatchScore(resource: Resource, keywords: string[]): number {
  if (keywords.length === 0)
    return 0

  const target = [
    resource.title,
    resource.summary,
    resource.content,
    resource.category,
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
  if (normalizeString(resource.linkedContestResourceId))
    return 'library'
  return 'upload'
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
    return `${index + 1}. [${source}/${category}] ${normalizeString(resource.title) || '未命名资料'}（${resource.year || 0}）\n${summaryText}`
  })

  return `项目资料池摘要（共 ${resources.length} 条，展示 ${ranked.length} 条）：\n${lines.join('\n')}`
}
