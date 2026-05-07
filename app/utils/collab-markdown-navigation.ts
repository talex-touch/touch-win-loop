import type { CollabMarkdownHeadingLevel } from '~~/shared/utils/collab-rich-text-schema'

export interface CollabMarkdownHeadingItem {
  pos: number
  level: CollabMarkdownHeadingLevel
  text: string
  nodeSize: number
}

export interface CollabMarkdownHeadingAnchorItem extends CollabMarkdownHeadingItem {
  occurrence: number
  anchorId: string
}

export interface CollabMarkdownHeadingSectionRange {
  headingPos: number
  from: number
  to: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizePositiveInteger(value: unknown, fallback = 1): number {
  const parsed = Math.max(1, Math.trunc(Number(value) || 0))
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeCollabMarkdownHeadingSlug(value: string): string {
  const normalized = normalizeString(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return normalized || 'section'
}

export function buildCollabMarkdownHeadingAnchorId(resourceId: string, headingText: string, occurrence = 1): string {
  const normalizedResourceId = normalizeString(resourceId)
  if (!normalizedResourceId)
    return ''

  const slug = normalizeCollabMarkdownHeadingSlug(headingText)
  return `md-${normalizedResourceId}-${slug}-${normalizePositiveInteger(occurrence)}`
}

export function attachCollabMarkdownHeadingAnchors(
  items: CollabMarkdownHeadingItem[],
  resourceId: string,
): CollabMarkdownHeadingAnchorItem[] {
  const normalizedResourceId = normalizeString(resourceId)
  const counts = new Map<string, number>()

  return items.map((item) => {
    const slug = normalizeCollabMarkdownHeadingSlug(item.text)
    const occurrence = (counts.get(slug) || 0) + 1
    counts.set(slug, occurrence)

    return {
      ...item,
      occurrence,
      anchorId: normalizedResourceId
        ? buildCollabMarkdownHeadingAnchorId(normalizedResourceId, item.text, occurrence)
        : '',
    }
  })
}

export function buildCollabMarkdownHeadingSectionRanges(
  items: CollabMarkdownHeadingItem[],
  docContentSize: number,
): CollabMarkdownHeadingSectionRange[] {
  const ranges: CollabMarkdownHeadingSectionRange[] = []
  const documentEnd = Math.max(0, Math.trunc(Number(docContentSize) || 0))

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item)
      continue

    const from = item.pos + Math.max(0, Math.trunc(Number(item.nodeSize) || 0))
    let to = documentEnd

    for (let cursor = index + 1; cursor < items.length; cursor += 1) {
      const nextItem = items[cursor]
      if (!nextItem)
        continue

      if (nextItem.level <= item.level) {
        to = nextItem.pos
        break
      }
    }

    if (to > from) {
      ranges.push({
        headingPos: item.pos,
        from,
        to,
      })
    }
  }

  return ranges
}

export function resolveCollabMarkdownCollapsedHeadingAncestors(
  ranges: CollabMarkdownHeadingSectionRange[],
  targetPos: number,
): number[] {
  const normalizedTargetPos = Math.max(0, Math.trunc(Number(targetPos) || 0))
  return ranges
    .filter(range => normalizedTargetPos >= range.from && normalizedTargetPos < range.to)
    .map(range => range.headingPos)
}

export function isCollabMarkdownHeadingAnchorHashForResource(hash: string, resourceId: string): boolean {
  const normalizedHash = normalizeString(hash).replace(/^#/, '')
  const normalizedResourceId = normalizeString(resourceId)
  if (!normalizedHash || !normalizedResourceId)
    return false
  return normalizedHash.startsWith(`md-${normalizedResourceId}-`)
}
