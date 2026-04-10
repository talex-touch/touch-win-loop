export type WorkspaceMetaKItemType
  = | 'command'
    | 'resource'
    | 'outline'
    | 'meeting'
    | 'issue'
    | 'contest'
    | 'workspace'
    | 'project'
    | 'library_resource'

export type WorkspaceMetaKActionId
  = | 'open_workspace_home'
    | 'open_workspace_settings'
    | 'open_member_management'
    | 'open_display_preferences'
    | 'open_account_center'
    | 'open_resource_manager'
    | 'open_analysis'
    | 'open_meeting'
    | 'open_issue_view'
    | 'open_flow'
    | 'open_final_review'
    | 'switch_workbench_project'
    | 'switch_workbench_defense'
    | 'switch_ai_dialog'
    | 'switch_ai_optimize'
    | 'switch_ai_issue'
    | 'create_collab_markdown'
    | 'create_collab_draw'
    | 'create_meeting_audio'
    | 'create_meeting_video'

export type WorkspaceMetaKItemSource = 'local' | 'remote'

export interface WorkspaceMetaKItem {
  id: string
  sectionId: string
  type: WorkspaceMetaKItemType
  title: string
  subtitle?: string
  icon: string
  badge?: string
  hint?: string
  keywords?: string[]
  source: WorkspaceMetaKItemSource
  priority?: number
  defaultVisible?: boolean
  actionId?: WorkspaceMetaKActionId
  payload?: Record<string, unknown>
}

export interface WorkspaceMetaKSectionDefinition {
  id: string
  title: string
  maxItems?: number
}

export interface WorkspaceMetaKSection {
  id: string
  title: string
  items: WorkspaceMetaKItem[]
  loading?: boolean
}

function normalizeWorkspaceMetaKText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function tokenizeWorkspaceMetaKText(value: unknown): string[] {
  return normalizeWorkspaceMetaKText(value)
    .split(/\s+/)
    .filter(Boolean)
}

function buildWorkspaceMetaKHaystack(item: WorkspaceMetaKItem): {
  title: string
  subtitle: string
  keywords: string[]
  fullText: string
} {
  const title = normalizeWorkspaceMetaKText(item.title)
  const subtitle = normalizeWorkspaceMetaKText(item.subtitle)
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.map(keyword => normalizeWorkspaceMetaKText(keyword)).filter(Boolean)
    : []
  return {
    title,
    subtitle,
    keywords,
    fullText: [title, subtitle, ...keywords].filter(Boolean).join(' '),
  }
}

export function isWorkspaceMetaKMacLikePlatform(platform?: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(String(platform || '').trim())
}

export function resolveWorkspaceMetaKShortcutLabel(platform?: string): string {
  return isWorkspaceMetaKMacLikePlatform(platform) ? '⌘K' : 'Ctrl+K'
}

export function scoreWorkspaceMetaKItem(item: WorkspaceMetaKItem, query: string): number {
  const normalizedQuery = normalizeWorkspaceMetaKText(query)
  if (!normalizedQuery)
    return item.defaultVisible ? (item.priority || 0) : Number.NEGATIVE_INFINITY

  const haystack = buildWorkspaceMetaKHaystack(item)
  if (!haystack.fullText)
    return Number.NEGATIVE_INFINITY

  const queryTerms = tokenizeWorkspaceMetaKText(query)
  let score = 0

  if (haystack.title === normalizedQuery) {
    score += 1200
  }
  else if (haystack.title.startsWith(normalizedQuery)) {
    score += 1000
  }
  else if (haystack.keywords.some(keyword => keyword.startsWith(normalizedQuery))) {
    score += 860
  }
  else if (haystack.fullText.includes(normalizedQuery)) {
    score += 720
  }

  let matchedTerms = 0
  for (const term of queryTerms) {
    if (haystack.title.includes(term)) {
      matchedTerms += 1
      score += haystack.title.startsWith(term) ? 88 : 44
      continue
    }

    if (haystack.keywords.some(keyword => keyword.includes(term))) {
      matchedTerms += 1
      score += 36
      continue
    }

    if (haystack.subtitle.includes(term)) {
      matchedTerms += 1
      score += 24
      continue
    }
  }

  if (matchedTerms === 0)
    return Number.NEGATIVE_INFINITY

  if (matchedTerms === queryTerms.length)
    score += 120

  if (item.type === 'command')
    score += 48
  if (item.source === 'local')
    score += 18

  return score + (item.priority || 0)
}

export function matchAndSortWorkspaceMetaKItems(
  items: WorkspaceMetaKItem[],
  query: string,
): WorkspaceMetaKItem[] {
  return items
    .map(item => ({
      item,
      score: scoreWorkspaceMetaKItem(item, query),
    }))
    .filter(entry => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (right.score !== left.score)
        return right.score - left.score
      if (left.item.source !== right.item.source)
        return left.item.source === 'local' ? -1 : 1
      return left.item.title.localeCompare(right.item.title, 'zh-CN')
    })
    .map(entry => entry.item)
}

export function buildWorkspaceMetaKSections(input: {
  items: WorkspaceMetaKItem[]
  query: string
  definitions: WorkspaceMetaKSectionDefinition[]
}): WorkspaceMetaKSection[] {
  const matchedItems = matchAndSortWorkspaceMetaKItems(input.items, input.query)
  return input.definitions
    .map((definition) => {
      const sectionItems = matchedItems
        .filter(item => item.sectionId === definition.id)
        .slice(0, definition.maxItems || 8)

      return {
        id: definition.id,
        title: definition.title,
        items: sectionItems,
      } satisfies WorkspaceMetaKSection
    })
    .filter(section => section.items.length > 0)
}
