import type { TimelineNodeType } from '~~/shared/types/domain'

export interface ParsedTimelineTextLine {
  rawLine: string
  nodeType: TimelineNodeType
  businessNodeLabel: string
  recognitionStatus: 'auto_recognized' | 'needs_confirmation'
  startAt: string | null
  endAt: string | null
  year: number
}

function toText(raw: unknown): string {
  if (typeof raw === 'string')
    return raw.trim()
  if (typeof raw === 'number' || typeof raw === 'boolean')
    return String(raw).trim()
  return ''
}

function formatTimelineDateToIso(value: string, mode: 'start' | 'end'): string | null {
  const normalized = toText(value)
    .replace(/[年/.]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\s+/g, '')
  const matched = normalized.match(/^(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})$/)
  if (!matched?.groups)
    return null
  const year = Number(matched.groups.year)
  const month = Number(matched.groups.month)
  const day = Number(matched.groups.day)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null
  const time = mode === 'start' ? '00:00:00' : '23:59:59'
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${time}+08:00`
}

function mapTimelineNodeType(raw: string): TimelineNodeType | null {
  const value = String(raw || '').trim().toLowerCase()
  if (!value)
    return null
  if (value === 'registration' || value.includes('报名'))
    return 'registration'
  if (value === 'submission' || value.includes('提交') || value.includes('截止'))
    return 'submission'
  if (value === 'preliminary' || value.includes('初赛') || value.includes('初审') || value.includes('预赛'))
    return 'preliminary'
  if (value === 'final' || value.includes('决赛') || value.includes('终审') || value.includes('答辩'))
    return 'final'
  if (value === 'other' || value.includes('其他'))
    return 'other'
  return null
}

function parseTimelineNodeTypeFromLabel(value: string): TimelineNodeType {
  return mapTimelineNodeType(value) || 'other'
}

function inferTimelineBusinessNodeLabel(value: string, nodeType: TimelineNodeType): string {
  const text = toText(value)
  const dictionary: Array<{ label: string, keywords: string[] }> = [
    { label: '命题征集', keywords: ['命题征集', '企业命题', '命题'] },
    { label: '报名', keywords: ['报名', '注册'] },
    { label: '作品提交', keywords: ['作品提交', '材料提交', '对策提交', '方案提交', '提交'] },
    { label: '校赛', keywords: ['校赛', '校内赛', '校园赛'] },
    { label: '省赛', keywords: ['省赛', '省级赛', '区域赛'] },
    { label: '国赛', keywords: ['国赛', '全国赛'] },
    { label: '总决赛', keywords: ['总决赛', '决赛'] },
    { label: '答辩', keywords: ['答辩', '路演'] },
  ]
  const matched = dictionary.find(item => item.keywords.some(keyword => text.includes(keyword)))
  if (matched)
    return matched.label
  if (nodeType === 'registration')
    return '报名'
  if (nodeType === 'submission')
    return '作品提交'
  if (nodeType === 'preliminary')
    return '初赛'
  if (nodeType === 'final')
    return '决赛'
  const compact = text
    .replace(/\d{4}\s*年/g, '')
    .replace(/\d{1,2}\s*月(\s*\d{1,2}\s*日?)?/g, '')
    .replace(/\d{4}([./-])\d{1,2}\1\d{1,2}/g, '')
    .replace(/[：:，,。.、\-至到前截\s]/g, '')
    .trim()
  return compact.length >= 2 && compact.length <= 12 ? compact : ''
}

function splitTimelineTextSegments(raw: string): string[] {
  return toText(raw)
    .split(/[\r\n；;]+/)
    .map(item => item.trim().replace(/^[，,。.、]+|[，,。.、]+$/g, '').trim())
    .filter(Boolean)
}

function inferTimelineYearFromText(value: string): number {
  const matched = value.match(/\b(20\d{2}|21\d{2})\b/)
  const year = Number(matched?.[1] || 0)
  return Number.isInteger(year) && year >= 2000 && year <= 2100
    ? year
    : new Date().getFullYear()
}

function explicitTimelineYearFromText(value: string): number | null {
  const matched = value.match(/\b(20\d{2}|21\d{2})\b/)
  const year = Number(matched?.[1] || 0)
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null
}

function collectExplicitTimelineDateTokens(value: string): string[] {
  const text = toText(value)
  const dateMatches: Array<{ index: number, token: string }> = []
  const seen = new Set<string>()
  const pushToken = (token: string, index: number | undefined) => {
    const normalized = toText(token)
    if (!normalized || seen.has(normalized))
      return
    seen.add(normalized)
    dateMatches.push({
      index: Number.isFinite(index) ? Number(index) : text.indexOf(token),
      token: normalized,
    })
  }
  for (const match of text.matchAll(/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/g))
    pushToken(match[0], match.index)
  for (const match of text.matchAll(/\d{4}([./-])\d{1,2}\1\d{1,2}/g))
    pushToken(match[0], match.index)
  return dateMatches.sort((left, right) => left.index - right.index).map(item => item.token)
}

function parseTimelineMonthDayRange(value: string, fallbackYear: number): { startAt: string | null, endAt: string | null, year: number } | null {
  const text = toText(value)
  const yearMatch = text.match(/(20\d{2}|21\d{2})\s*年/)
  const year = Number(yearMatch?.[1] || fallbackYear || new Date().getFullYear())
  let match = text.match(/(?:20\d{2}|21\d{2})?\s*年?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*[-~至到]\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
  if (match) {
    return {
      year,
      startAt: formatTimelineDateToIso(`${year}-${match[1]}-${match[2]}`, 'start'),
      endAt: formatTimelineDateToIso(`${year}-${match[3]}-${match[4]}`, 'end'),
    }
  }
  match = text.match(/(?:20\d{2}|21\d{2})?\s*年?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*日/)
  if (match) {
    return {
      year,
      startAt: formatTimelineDateToIso(`${year}-${match[1]}-${match[2]}`, 'start'),
      endAt: formatTimelineDateToIso(`${year}-${match[1]}-${match[3]}`, 'end'),
    }
  }
  match = text.match(/(?:20\d{2}|21\d{2})?\s*年?\s*(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*月/)
  if (match) {
    return {
      year,
      startAt: formatTimelineDateToIso(`${year}-${match[1]}-1`, 'start'),
      endAt: formatTimelineDateToIso(`${year}-${match[2]}-${new Date(Date.UTC(year, Number(match[2]), 0)).getUTCDate()}`, 'end'),
    }
  }
  return null
}

function hasDeadlineSemantics(value: string): boolean {
  return /截止|截至|之前|前|24[:：]?00/.test(toText(value))
}

export function parseTimelineTextLines(raw: string): ParsedTimelineTextLine[] {
  const lines = splitTimelineTextSegments(raw)
  const result: ParsedTimelineTextLine[] = []
  let currentYear = inferTimelineYearFromText(toText(raw))
  for (const line of lines) {
    const colonIndex = line.search(/[:：]/)
    const label = colonIndex >= 0 ? line.slice(0, colonIndex).trim() : ''
    const body = colonIndex >= 0 ? line.slice(colonIndex + 1).trim() : line
    const nodeType = hasDeadlineSemantics(line)
      ? 'submission'
      : label
        ? parseTimelineNodeTypeFromLabel(label)
        : parseTimelineNodeTypeFromLabel(line)
    const tokens = collectExplicitTimelineDateTokens(body)
    const first = tokens[0] || ''
    const second = tokens[1] || ''
    const firstStart = first ? formatTimelineDateToIso(first, 'start') : null
    const firstEnd = first ? formatTimelineDateToIso(first, 'end') : null
    const secondEnd = second ? formatTimelineDateToIso(second, 'end') : null
    const explicitYear = first ? Number(first.replace(/[./]/g, '-').slice(0, 4)) : explicitTimelineYearFromText(line)
    if (Number.isFinite(explicitYear))
      currentYear = Number(explicitYear)
    const monthDayRange = parseTimelineMonthDayRange(line, currentYear)
    const startAt = monthDayRange ? monthDayRange.startAt : second ? firstStart : (nodeType === 'registration' && !hasDeadlineSemantics(line) ? firstStart : null)
    const endAt = monthDayRange ? monthDayRange.endAt : second ? secondEnd : firstEnd
    result.push({
      rawLine: line,
      nodeType,
      businessNodeLabel: inferTimelineBusinessNodeLabel(line, nodeType),
      recognitionStatus: startAt || endAt ? 'auto_recognized' : 'needs_confirmation',
      startAt,
      endAt,
      year: monthDayRange?.year || (Number.isFinite(explicitYear) ? Number(explicitYear) : currentYear || new Date().getFullYear()),
    })
  }
  return result
}
