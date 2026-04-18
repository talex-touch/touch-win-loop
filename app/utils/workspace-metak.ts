import { pinyin } from 'pinyin-pro'
import { formatWorkspaceShortcutLabel, isWorkspaceMacLikePlatform } from '~/utils/workspace-shortcuts'

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
    | 'switch_workbench_final_review'
    | 'switch_ai_dialog'
    | 'switch_ai_optimize'
    | 'switch_ai_issue'
    | 'create_collab_markdown'
    | 'create_collab_draw'
    | 'create_collab_workflow'
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

const workspaceMetaKPinyinCache = new Map<string, { full: string, initials: string }>()

function normalizeWorkspaceMetaKText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeWorkspaceMetaKCompactText(value: unknown): string {
  return normalizeWorkspaceMetaKText(value)
    .replace(/\s+/g, '')
}

function isWorkspaceMetaKLatinQuery(value: string): boolean {
  return /^[a-z0-9]+$/.test(value) && value.length >= 2
}

function buildWorkspaceMetaKPinyin(value: unknown): { full: string, initials: string } {
  const source = String(value || '')
  const cached = workspaceMetaKPinyinCache.get(source)
  if (cached)
    return cached

  if (!source.trim()) {
    const empty = { full: '', initials: '' }
    workspaceMetaKPinyinCache.set(source, empty)
    return empty
  }

  const resolved = {
    full: normalizeWorkspaceMetaKCompactText(pinyin(source, {
      toneType: 'none',
      nonZh: 'consecutive',
    })),
    initials: normalizeWorkspaceMetaKCompactText(pinyin(source, {
      toneType: 'none',
      pattern: 'first',
      nonZh: 'consecutive',
    })),
  }
  workspaceMetaKPinyinCache.set(source, resolved)
  return resolved
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
  titlePinyinFull: string
  titlePinyinInitials: string
  keywordPinyinFulls: string[]
  keywordPinyinInitials: string[]
  fullPinyinFull: string
  fullPinyinInitials: string
} {
  const title = normalizeWorkspaceMetaKText(item.title)
  const subtitle = normalizeWorkspaceMetaKText(item.subtitle)
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.map(keyword => normalizeWorkspaceMetaKText(keyword)).filter(Boolean)
    : []
  const titlePinyin = buildWorkspaceMetaKPinyin(item.title)
  const subtitlePinyin = buildWorkspaceMetaKPinyin(item.subtitle)
  const keywordPinyins = Array.isArray(item.keywords)
    ? item.keywords.map(keyword => buildWorkspaceMetaKPinyin(keyword)).filter(item => item.full || item.initials)
    : []
  return {
    title,
    subtitle,
    keywords,
    fullText: [title, subtitle, ...keywords].filter(Boolean).join(' '),
    titlePinyinFull: titlePinyin.full,
    titlePinyinInitials: titlePinyin.initials,
    keywordPinyinFulls: keywordPinyins.map(item => item.full).filter(Boolean),
    keywordPinyinInitials: keywordPinyins.map(item => item.initials).filter(Boolean),
    fullPinyinFull: [titlePinyin.full, subtitlePinyin.full, ...keywordPinyins.map(item => item.full)].filter(Boolean).join(''),
    fullPinyinInitials: [titlePinyin.initials, subtitlePinyin.initials, ...keywordPinyins.map(item => item.initials)].filter(Boolean).join(''),
  }
}

export function resolveWorkspaceMetaKShortcutLabel(platform?: string): string {
  return formatWorkspaceShortcutLabel({
    key: 'K',
    modifiers: ['mod'],
  }, platform)
}

export { isWorkspaceMacLikePlatform as isWorkspaceMetaKMacLikePlatform }

export function scoreWorkspaceMetaKItem(item: WorkspaceMetaKItem, query: string): number {
  const normalizedQuery = normalizeWorkspaceMetaKText(query)
  if (!normalizedQuery)
    return item.defaultVisible ? (item.priority || 0) : Number.NEGATIVE_INFINITY

  const compactQuery = normalizeWorkspaceMetaKCompactText(query)
  const canUsePinyin = isWorkspaceMetaKLatinQuery(compactQuery)
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
  else if (canUsePinyin && haystack.titlePinyinFull === compactQuery) {
    score += 980
  }
  else if (canUsePinyin && haystack.titlePinyinFull.startsWith(compactQuery)) {
    score += 880
  }
  else if (canUsePinyin && haystack.keywordPinyinFulls.some(keyword => keyword.startsWith(compactQuery))) {
    score += 800
  }
  else if (canUsePinyin && haystack.fullPinyinFull.includes(compactQuery)) {
    score += 700
  }
  else if (canUsePinyin && haystack.titlePinyinInitials === compactQuery) {
    score += 940
  }
  else if (canUsePinyin && haystack.titlePinyinInitials.startsWith(compactQuery)) {
    score += 840
  }
  else if (canUsePinyin && haystack.keywordPinyinInitials.some(keyword => keyword.startsWith(compactQuery))) {
    score += 760
  }
  else if (canUsePinyin && haystack.fullPinyinInitials.includes(compactQuery)) {
    score += 660
  }

  let matchedTerms = 0
  for (const term of queryTerms) {
    const compactTerm = normalizeWorkspaceMetaKCompactText(term)
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

    if (
      isWorkspaceMetaKLatinQuery(compactTerm)
      && (
        haystack.titlePinyinFull.includes(compactTerm)
        || haystack.keywordPinyinFulls.some(keyword => keyword.includes(compactTerm))
        || haystack.fullPinyinFull.includes(compactTerm)
        || haystack.titlePinyinInitials.includes(compactTerm)
        || haystack.keywordPinyinInitials.some(keyword => keyword.includes(compactTerm))
        || haystack.fullPinyinInitials.includes(compactTerm)
      )
    ) {
      matchedTerms += 1
      score += haystack.titlePinyinFull.startsWith(compactTerm) || haystack.titlePinyinInitials.startsWith(compactTerm) ? 32 : 18
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
