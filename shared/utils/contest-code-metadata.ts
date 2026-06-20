import type { FeishuBitableSyncItemEntityType } from '../types/domain'

export type ContestCodeMetadata = Record<string, unknown>

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeYear(value: unknown): number | null {
  const year = Number(value || 0)
  if (!Number.isInteger(year) || year < 1900 || year > 2100)
    return null
  return year
}

function extractYearFromText(value: unknown): number | null {
  const matched = normalizeText(value).match(/\b(19|20)\d{2}\b/)
  return normalizeYear(matched?.[0])
}

function baseMetadata(entityType: FeishuBitableSyncItemEntityType, externalId: string): ContestCodeMetadata {
  return {
    codeParsed: false,
    codeType: entityType,
    externalId,
  }
}

export function deriveContestCodeMetadata(externalId: unknown): ContestCodeMetadata {
  const code = normalizeText(externalId)
  const metadata = baseMetadata('contest', code)
  const matched = code.match(/^(\d)(\d)(\d{2})$/)
  if (!matched) {
    return {
      ...metadata,
      codeParseReason: code ? 'CONTEST_CODE_FORMAT_UNMATCHED' : 'CONTEST_CODE_EMPTY',
    }
  }

  const levelLabels: Record<string, string> = {
    1: '国际',
    2: '国家',
    3: '省级/直辖市',
    4: '市级',
    5: '校级',
  }
  const recognitionLabels: Record<string, string> = {
    0: '教育部认定',
    1: '非教育部认定',
    2: '非教育部认定 A 类',
  }

  return {
    ...metadata,
    codeParsed: true,
    levelCode: matched[1],
    levelLabel: levelLabels[matched[1] || ''] || '未知级别',
    recognitionCode: matched[2],
    recognitionLabel: recognitionLabels[matched[2] || ''] || '未知认定类型',
    serial: matched[3],
  }
}

export function deriveTrackCodeMetadata(externalId: unknown): ContestCodeMetadata {
  const code = normalizeText(externalId)
  const metadata = baseMetadata('track', code)
  const matched = code.match(/^(\d{4})(\d{2})(\d{6})(\d{2})$/)
  if (!matched) {
    return {
      ...metadata,
      codeParseReason: code ? 'TRACK_CODE_FORMAT_UNMATCHED' : 'TRACK_CODE_EMPTY',
    }
  }

  const regionSegment = matched[3] || ''
  const regionType = regionSegment.startsWith('02')
    ? 'overseas'
    : regionSegment.startsWith('03')
      ? 'platform'
      : regionSegment.startsWith('01')
        ? 'domestic'
        : 'unknown'
  const year = normalizeYear(`20${matched[2]}`)

  return {
    ...metadata,
    codeParsed: true,
    contestCode: matched[1],
    year,
    shortYear: matched[2],
    regionSegment,
    regionType,
    provinceCode: regionType === 'domestic' ? regionSegment.slice(2, 4) : '',
    districtCode: regionType === 'overseas' ? regionSegment.slice(2, 6) : '',
    fileOrder: matched[4],
  }
}

export function deriveResourceCodeMetadata(externalId: unknown): ContestCodeMetadata {
  const code = normalizeText(externalId)
  const metadata = baseMetadata('resource', code)
  const matched = code.match(/^(\d{2})(\d{4})(\d{6})$/)
  if (!matched) {
    return {
      ...metadata,
      codeParseReason: code ? 'RESOURCE_CODE_FORMAT_UNMATCHED' : 'RESOURCE_CODE_EMPTY',
    }
  }

  const sourceLabels: Record<string, string> = {
    10: 'internal',
    20: 'external',
  }
  const year = normalizeYear(matched[2])

  return {
    ...metadata,
    codeParsed: true,
    sourceCode: matched[1],
    sourceCategory: sourceLabels[matched[1] || ''] || 'unknown',
    year,
    appCode: matched[2],
    serial: matched[3],
  }
}

export function derivePolicyCodeMetadata(externalId: unknown): ContestCodeMetadata {
  const code = normalizeText(externalId)
  const metadata = baseMetadata('policy', code)
  const matched = code.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{3})$/)
  if (!matched) {
    return {
      ...metadata,
      codeParseReason: code ? 'POLICY_CODE_FORMAT_UNMATCHED' : 'POLICY_CODE_EMPTY',
    }
  }

  const typeLabels: Record<string, string> = {
    '01': 'meeting',
    '02': 'policy',
  }
  const date = `${matched[1]}-${matched[2]}-${matched[3]}`

  return {
    ...metadata,
    codeParsed: true,
    date,
    year: normalizeYear(matched[1]),
    month: matched[2],
    day: matched[3],
    itemTypeCode: matched[4],
    itemType: typeLabels[matched[4] || ''] || 'unknown',
    serial: matched[5],
  }
}

export function deriveFeishuCodeMetadata(input: {
  entityType: FeishuBitableSyncItemEntityType
  externalId: unknown
  fields?: Record<string, unknown>
}): ContestCodeMetadata {
  const fields = input.fields || {}
  const base = (() => {
    if (input.entityType === 'contest')
      return deriveContestCodeMetadata(input.externalId)
    if (input.entityType === 'track')
      return deriveTrackCodeMetadata(input.externalId)
    if (input.entityType === 'resource')
      return deriveResourceCodeMetadata(input.externalId)
    if (input.entityType === 'policy')
      return derivePolicyCodeMetadata(input.externalId)
    return baseMetadata(input.entityType, normalizeText(input.externalId))
  })()

  const titleYear = extractYearFromText(fields.title)
  const explicitYear = normalizeYear(fields.year)
  return {
    ...base,
    ...(explicitYear ? { explicitYear } : {}),
    ...(titleYear ? { titleYear } : {}),
  }
}

export function resolveResourceYear(input: {
  explicitYear?: unknown
  externalId?: unknown
  title?: unknown
  trackMetadata?: ContestCodeMetadata | null
  fallbackYear?: number
}): { year: number, source: string } {
  const explicitYear = normalizeYear(input.explicitYear)
  if (explicitYear)
    return { year: explicitYear, source: 'explicit_year' }

  const resourceYear = normalizeYear(deriveResourceCodeMetadata(input.externalId).year)
  if (resourceYear)
    return { year: resourceYear, source: 'resource_code' }

  const titleYear = extractYearFromText(input.title)
  if (titleYear)
    return { year: titleYear, source: 'title' }

  const trackYear = normalizeYear(input.trackMetadata?.year)
  if (trackYear)
    return { year: trackYear, source: 'track_code' }

  return {
    year: normalizeYear(input.fallbackYear) || new Date().getFullYear(),
    source: 'fallback_current_year',
  }
}
