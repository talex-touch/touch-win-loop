import type { Queryable } from '~~/server/utils/db'
import type {
  AuthUser,
  BillingPlan,
  Contest,
  ContestAuditLog,
  ContestDetailPayload,
  ContestFaqItem,
  ContestFilterInput,
  ContestLevel,
  ContestStatus,
  ContestTimeline,
  ContestVisibility,
  DisciplineDictionaryItem,
  PlatformPermission,
  PlatformRole,
  PlatformRoleAssignment,
  PublishCheckResult,
  Resource,
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
  Rubric,
  RubricDimension,
  RubricScoringMode,
  TimelineNodeType,
  Track,
  WorkspaceBillingEstimate,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { listContests as listCatalogContests, listResources as listCatalogResources, listRubrics as listCatalogRubrics } from '~~/server/data/catalog'

const CONTEST_LIBRARY_MIGRATION_KEY = 'contest_library_seeded_v2'

const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  platform_super_admin: [
    'contest.read_internal',
    'contest.write',
    'contest.publish',
    'contest.archive',
    'pricing.write',
    'role.assign',
  ],
  contest_admin: [
    'contest.read_internal',
    'contest.write',
    'contest.publish',
    'contest.archive',
  ],
  pricing_admin: [
    'pricing.write',
  ],
}

const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'basic_info',
  'timeline',
  'tracks',
  'scoring',
  'past_questions',
  'awarded_works',
  'templates',
  'faq',
  'judge_guidelines',
  'track_details',
  'ai_prompts',
  'submission_examples',
  'policy_notice',
  'compliance',
]

const AUDIT_RETENTION_WINDOW = '7 days'
const AUDIT_DEDUP_WINDOW = '10 minutes'
const AUDIT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000
let lastAuditCleanupAt = 0

const DISCIPLINE_DICTIONARY: DisciplineDictionaryItem[] = [
  { code: 'philosophy', label: '哲学', sortOrder: 1, enabled: true },
  { code: 'economics', label: '经济学', sortOrder: 2, enabled: true },
  { code: 'law', label: '法学', sortOrder: 3, enabled: true },
  { code: 'education', label: '教育学', sortOrder: 4, enabled: true },
  { code: 'literature', label: '文学', sortOrder: 5, enabled: true },
  { code: 'history', label: '历史学', sortOrder: 6, enabled: true },
  { code: 'science', label: '理学', sortOrder: 7, enabled: true },
  { code: 'engineering', label: '工学', sortOrder: 8, enabled: true },
  { code: 'agronomy', label: '农学', sortOrder: 9, enabled: true },
  { code: 'medicine', label: '医学', sortOrder: 10, enabled: true },
  { code: 'management', label: '管理学', sortOrder: 11, enabled: true },
  { code: 'arts', label: '艺术学', sortOrder: 12, enabled: true },
  { code: 'interdisciplinary', label: '交叉学科', sortOrder: 13, enabled: true },
]

function normalizeCompareValue(value: unknown): string {
  return normalizeString(value).toLowerCase()
}

export function listDisciplineDictionary(): DisciplineDictionaryItem[] {
  return [...DISCIPLINE_DICTIONARY]
    .filter(item => item.enabled !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

const CONTEST_IMPORT_TEMPLATE_HEADERS = [
  '竞赛名称',
  '赛事级别',
  '官网地址',
  '主办单位',
  '协办单位',
  '当前届次',
  '学科门类',
  '赛事别名',
  '赛事关键词',
  '推荐人群',
  '赛事简介',
  '参赛对象',
  '组队规则',
  '报名时间',
  '比赛命题',
  '比赛流程',
  '评分标准',
  '获奖比例',
] as const

const CONTEST_IMPORT_HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', '竞赛名称', '赛事名称', '竞赛名称（必填）', '赛事名称（必填）', '名称'],
  level: ['level', '赛事级别', '竞赛级别', '级别', '赛事级别（可选）'],
  officialUrl: ['officialUrl', 'official_url', '官网地址', '官网链接', '官方网站', '官网', '赛事官网', '官网URL', '官网 URL'],
  organizer: ['organizer', '主办单位', '主办方', '主办', '主办单位（可选）'],
  coOrganizer: ['coOrganizer', 'co_organizer', '协办单位', '承办单位', '承办方', '协办单位（可选）'],
  currentSeason: ['currentSeason', 'current_season', '当前届次', '届次', '年份', '届次/年份'],
  disciplines: ['disciplines', '学科门类', '学科', '学科门类（可选）'],
  aliases: ['aliases', '赛事别名', '别名', '别名（可选）'],
  keywords: ['keywords', '赛事关键词', '关键词', '关键词（可选）'],
  recommendedFor: ['recommendedFor', 'recommended_for', '推荐人群', '适配人群', '推荐人群（可选）'],
  summary: ['summary', '赛事简介', '竞赛简介', '简介'],
  participantRequirements: ['participantRequirements', 'participant_requirements', '参赛对象', '参赛对象/限制', '参赛对象（可选）'],
  teamRule: ['teamRule', 'team_rule', '组队规则', '组队规则（可选）'],
  registrationWindow: ['registrationWindow', 'registration_window', '报名时间', '报名窗口', '报名时间（可选）'],
  contestProposition: ['contestProposition', '比赛命题', '赛事命题', '命题', '比赛命题（可选）'],
  contestProcess: ['contestProcess', '比赛流程', '竞赛流程', '流程', '比赛流程（可选）'],
  scoringCriteria: ['scoringCriteria', '评分标准', '评审标准', '评分标准（可选）'],
  awardRatio: ['awardRatio', '获奖比例', '获奖比例（可选）'],
}

const CONTEST_LEVEL_ALIASES: Record<string, ContestLevel> = {
  national: 'national',
  provincial: 'provincial',
  school: 'school',
  industry: 'industry',
  国家级: 'national',
  省级: 'provincial',
  校级: 'school',
  行业级: 'industry',
}

export interface ContestImportNormalizedRow {
  name: string
  level: ContestLevel
  officialUrl: string
  dedupKey: string | null
  action: 'create' | 'update'
  existingContestId?: string
  inferredYear: number
  inferredYearSource: 'registration_start' | 'registration_end' | 'current_season' | 'fallback_current_year'
  registrationText?: string
  registrationStartAt?: string | null
  registrationEndAt?: string | null
  contestProposition?: string
  contestProcess?: string
  scoringCriteria?: string
  awardRatio?: string
  organizer?: string
  coOrganizer?: string
  currentSeason?: string
  disciplines?: string[]
  aliases?: string[]
  keywords?: string[]
  recommendedFor?: string[]
  summary?: string
  participantRequirements?: string
  teamRule?: string
}

export interface ContestImportPreviewRow {
  rowNumber: number
  action: 'create' | 'update' | 'invalid'
  inferredYear: number | null
  inferredYearSource?: ContestImportNormalizedRow['inferredYearSource']
  targetContestId?: string
  suggestedExecute: boolean
  suggestedOverwriteMode: ContestImportOverwriteMode
  errors: string[]
  warnings: string[]
  structuredWarnings: string[]
  normalized: ContestImportNormalizedRow | null
}

export interface ContestImportPreviewResult {
  headers: string[]
  total: number
  validCount: number
  invalidCount: number
  defaultExecutionPlan: ContestImportExecutionPlan
  rows: ContestImportPreviewRow[]
}

export type ContestImportOverwriteMode = 'preserve_existing' | 'force_replace'

export interface ContestImportExecutionRowDecision {
  rowNumber: number
  execute?: boolean
  overwriteMode?: ContestImportOverwriteMode
}

export interface ContestImportExecutionPlan {
  defaultExecute?: boolean
  defaultOverwriteMode?: ContestImportOverwriteMode
  rowDecisions?: ContestImportExecutionRowDecision[]
}

export interface ContestImportCommitRowResult {
  rowNumber: number
  action: 'create' | 'update' | 'invalid'
  decision: 'executed' | 'skipped' | 'invalid' | 'error'
  overwriteMode: ContestImportOverwriteMode
  result: 'created' | 'updated' | 'skipped' | 'invalid' | 'error'
  contestId?: string
  message?: string
}

export interface ContestImportCommitResult {
  total: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  createdContestIds: string[]
  updatedContestIds: string[]
  errors: Array<{ rowNumber: number, message: string }>
  rowResults: ContestImportCommitRowResult[]
}

function escapeCsvCell(value: string): string {
  if (!value.includes(',') && !value.includes('"') && !value.includes('\n'))
    return value
  return `"${value.replaceAll('"', '""')}"`
}

function splitMultiValue(value: string): string[] {
  return value
    .split(/[|,，、;；\n]/g)
    .map(item => normalizeString(item))
    .filter(Boolean)
}

function parseCsvText(csvText: string): string[][] {
  const text = String(csvText || '').replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  const pushCell = () => {
    currentRow.push(currentCell)
    currentCell = ''
  }

  const pushRow = () => {
    if (currentRow.length === 0)
      return
    if (currentRow.every(cell => normalizeString(cell).length === 0)) {
      currentRow = []
      return
    }
    rows.push(currentRow.map(cell => cell.replace(/\r/g, '')))
    currentRow = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"'
        i++
      }
      else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      pushCell()
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      pushCell()
      pushRow()
      if (char === '\r' && next === '\n')
        i++
      continue
    }

    if (char === '\r' && inQuotes && next === '\n') {
      currentCell += '\n'
      i++
      continue
    }

    if (char === '\r' && inQuotes) {
      currentCell += '\n'
      continue
    }

    currentCell += char
  }

  pushCell()
  pushRow()
  return rows
}

function normalizeImportLevel(value: string): ContestLevel | null {
  const key = normalizeString(value)
  if (!key)
    return null
  return CONTEST_LEVEL_ALIASES[key] || null
}

function normalizeImportHeaderKey(value: string): string {
  return normalizeString(value).replace(/\s+/g, '').toLowerCase()
}

function buildImportHeaderIndex(headers: string[]): Map<string, number> {
  const source = new Map<string, number>()
  headers.forEach((header, index) => {
    const key = normalizeImportHeaderKey(header)
    if (!source.has(key))
      source.set(key, index)
  })

  const indexMap = new Map<string, number>()
  for (const [canonical, aliases] of Object.entries(CONTEST_IMPORT_HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = source.get(normalizeImportHeaderKey(alias))
      if (idx !== undefined) {
        indexMap.set(canonical, idx)
        break
      }
    }
  }

  return indexMap
}

function hasImportColumn(indexMap: Map<string, number>, key: string): boolean {
  return indexMap.has(key)
}

function readImportCell(cells: string[], indexMap: Map<string, number>, key: string): string {
  const idx = indexMap.get(key)
  if (idx === undefined)
    return ''
  return normalizeString(cells[idx] || '')
}

function readImportMultiValue(cells: string[], indexMap: Map<string, number>, key: string): string[] | undefined {
  if (!hasImportColumn(indexMap, key))
    return undefined
  return splitMultiValue(readImportCell(cells, indexMap, key))
}

function parseYearFromSeason(value: string): number | null {
  const hit = normalizeString(value).match(/\b(19|20)\d{2}\b/)
  if (!hit)
    return null
  const year = Number(hit[0])
  if (!Number.isFinite(year) || year < 1900)
    return null
  return year
}

function extractExplicitYearFromDateToken(token: string): number | null {
  const text = normalizeString(token)
    .replace(/[年/.]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
  const hit = text.match(/\b(19|20)\d{2}\b/)
  if (!hit)
    return null
  const year = Number(hit[0])
  if (!Number.isFinite(year) || year < 1900)
    return null
  return year
}

function parseDateTokenToIso(
  token: string,
  mode: 'start' | 'end',
  fallbackYear?: number,
): string | null {
  const text = normalizeString(token)
    .replace(/[年/.]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\s+/g, '')
  if (!text)
    return null

  const parts = text.split('-').filter(Boolean)
  let year = 0
  let month = 0
  let day = 0

  if (parts.length >= 3 && /^\d{4}$/.test(parts[0] || '')) {
    year = Number(parts[0])
    month = Number(parts[1])
    day = Number(parts[2])
  }
  else if (parts.length >= 2) {
    year = Number(fallbackYear || 0)
    month = Number(parts[0])
    day = Number(parts[1])
  }

  if (!Number.isFinite(year) || year < 1900 || !Number.isFinite(month) || !Number.isFinite(day))
    return null
  if (month < 1 || month > 12 || day < 1 || day > 31)
    return null

  const validate = new Date(Date.UTC(year, month - 1, day))
  if (validate.getUTCFullYear() !== year || validate.getUTCMonth() !== month - 1 || validate.getUTCDate() !== day)
    return null

  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  const timeText = mode === 'start' ? '00:00:00' : '23:59:59'
  return `${y}-${m}-${d}T${timeText}+08:00`
}

interface ImportRegistrationWindowResult {
  raw: string
  startAt: string | null
  endAt: string | null
  inferredYear: number
  inferredYearSource: ContestImportNormalizedRow['inferredYearSource']
  warnings: string[]
}

function parseImportRegistrationWindow(
  registrationText: string,
  currentSeason: string,
): ImportRegistrationWindowResult {
  const raw = normalizeString(registrationText)
  const seasonYear = parseYearFromSeason(currentSeason)
  const nowYear = new Date().getFullYear()
  const warnings: string[] = []

  const tokens = raw.match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}/g) || []
  const startToken = tokens[0] || ''
  const endToken = tokens[1] || ''

  const yearByStart = extractExplicitYearFromDateToken(startToken)
  const yearByEnd = extractExplicitYearFromDateToken(endToken)

  let inferredYearSource: ContestImportNormalizedRow['inferredYearSource'] = 'fallback_current_year'
  let inferredYear = nowYear
  if (yearByStart && yearByStart >= 1900) {
    inferredYear = yearByStart
    inferredYearSource = 'registration_start'
  }
  else if (yearByEnd && yearByEnd >= 1900) {
    inferredYear = yearByEnd
    inferredYearSource = 'registration_end'
  }
  else if (seasonYear && seasonYear >= 1900) {
    inferredYear = seasonYear
    inferredYearSource = 'current_season'
  }

  if (!raw) {
    return {
      raw,
      startAt: null,
      endAt: null,
      inferredYear,
      inferredYearSource,
      warnings,
    }
  }

  if (tokens.length === 0) {
    warnings.push('报名时间未识别到有效日期，已跳过时间轴写入。')
    return {
      raw,
      startAt: null,
      endAt: null,
      inferredYear,
      inferredYearSource,
      warnings,
    }
  }

  if (tokens.length === 1) {
    const endAt = parseDateTokenToIso(startToken, 'end', inferredYear)
    if (!endAt)
      warnings.push('报名时间日期解析失败，已跳过时间轴写入。')
    return {
      raw,
      startAt: null,
      endAt,
      inferredYear,
      inferredYearSource,
      warnings,
    }
  }

  const startAt = parseDateTokenToIso(startToken, 'start', inferredYear)
  const endAt = parseDateTokenToIso(endToken, 'end', inferredYear)
  if (!startAt && !endAt)
    warnings.push('报名时间区间解析失败，已跳过时间轴写入。')
  else if (!startAt || !endAt)
    warnings.push('报名时间区间解析不完整，仅写入可识别日期。')

  return {
    raw,
    startAt,
    endAt,
    inferredYear,
    inferredYearSource,
    warnings,
  }
}

function buildContestDedupKey(name: string, organizer: string, officialUrl: string): string | null {
  const nameKey = normalizeCompareValue(name)
  const organizerKey = normalizeCompareValue(organizer)
  const officialUrlKey = normalizeCompareValue(officialUrl)
  if (!nameKey || !organizerKey || !officialUrlKey)
    return null
  return `${nameKey}|${organizerKey}|${officialUrlKey}`
}

export function buildContestImportTemplateCsv(): string {
  const sample = [
    '全国大学生服务外包创新创业大赛',
    '国家级',
    'https://www.fwwb.org.cn/',
    '教育部高等学校软件工程专业教学指导委员会',
    '示例大学创新创业学院',
    '2026',
    '工学|管理学',
    '服务外包赛',
    '服务外包|软件工程|创新创业',
    '大二|大三|研究生',
    '面向服务外包领域的全国性创新竞赛。',
    '本科及以上在校生可参赛。',
    '2-5 人组队，可跨专业。',
    '2026/03/01 ~ 2026/04/15',
    '企业真实场景命题：数字供应链智能调度',
    '报名 -> 校赛初筛 -> 区域赛复评 -> 全国总决赛',
    '创新性(30%)|可行性(40%)|应用价值(30%)',
    '一等奖约 5%，二等奖约 15%，三等奖约 30%',
  ]
  return `${CONTEST_IMPORT_TEMPLATE_HEADERS.join(',')}\n${sample.map(escapeCsvCell).join(',')}\n`
}

export async function previewContestImportCsv(
  db: Queryable,
  input: {
    csvText: string
  },
): Promise<ContestImportPreviewResult> {
  await ensureContestLibrarySeeded(db)

  const matrix = parseCsvText(input.csvText)
  if (matrix.length === 0) {
    return {
      headers: [],
      total: 0,
      validCount: 0,
      invalidCount: 0,
      defaultExecutionPlan: {
        defaultExecute: true,
        defaultOverwriteMode: 'preserve_existing',
        rowDecisions: [],
      },
      rows: [],
    }
  }

  const headers = (matrix[0] || []).map(item => normalizeString(item))
  const headerIndex = buildImportHeaderIndex(headers)
  const rows = matrix.slice(1)
  const indexedRows: ContestImportPreviewRow[] = []
  const fileDedupKeys = new Map<string, number>()

  const dbRows = await db.query<{ id: string, name: string, organizer: string, official_url: string, status: ContestStatus }>(
    `SELECT id, name, organizer, official_url, status
     FROM contests
     WHERE status <> 'archived'`,
  )

  const existingByKey = new Map<string, { id: string }>()
  for (const row of dbRows.rows) {
    const key = buildContestDedupKey(row.name, row.organizer, row.official_url)
    if (key && !existingByKey.has(key))
      existingByKey.set(key, { id: row.id })
  }

  for (const [index, cells] of rows.entries()) {
    const rowNumber = index + 2
    const rowColumnCount = cells.length
    const headerColumnCount = headers.length
    const name = readImportCell(cells, headerIndex, 'name')
    const levelRaw = readImportCell(cells, headerIndex, 'level')
    const parsedLevel = normalizeImportLevel(levelRaw)
    const level: ContestLevel = parsedLevel || 'national'
    const officialUrl = readImportCell(cells, headerIndex, 'officialUrl')
    const organizer = readImportCell(cells, headerIndex, 'organizer')
    const coOrganizer = readImportCell(cells, headerIndex, 'coOrganizer')
    const currentSeason = readImportCell(cells, headerIndex, 'currentSeason')
    const disciplines = readImportMultiValue(cells, headerIndex, 'disciplines')
    const aliases = readImportMultiValue(cells, headerIndex, 'aliases')
    const keywords = readImportMultiValue(cells, headerIndex, 'keywords')
    const recommendedFor = readImportMultiValue(cells, headerIndex, 'recommendedFor')
    const summary = hasImportColumn(headerIndex, 'summary')
      ? readImportCell(cells, headerIndex, 'summary')
      : undefined
    const participantRequirements = hasImportColumn(headerIndex, 'participantRequirements')
      ? readImportCell(cells, headerIndex, 'participantRequirements')
      : undefined
    const teamRule = hasImportColumn(headerIndex, 'teamRule')
      ? readImportCell(cells, headerIndex, 'teamRule')
      : undefined
    const registrationText = hasImportColumn(headerIndex, 'registrationWindow')
      ? readImportCell(cells, headerIndex, 'registrationWindow')
      : ''
    const contestProposition = hasImportColumn(headerIndex, 'contestProposition')
      ? readImportCell(cells, headerIndex, 'contestProposition')
      : undefined
    const contestProcess = hasImportColumn(headerIndex, 'contestProcess')
      ? readImportCell(cells, headerIndex, 'contestProcess')
      : undefined
    const scoringCriteria = hasImportColumn(headerIndex, 'scoringCriteria')
      ? readImportCell(cells, headerIndex, 'scoringCriteria')
      : undefined
    const awardRatio = hasImportColumn(headerIndex, 'awardRatio')
      ? readImportCell(cells, headerIndex, 'awardRatio')
      : undefined
    const registration = parseImportRegistrationWindow(registrationText, currentSeason)

    const errors: string[] = []
    const warnings: string[] = []
    const structuredWarnings: string[] = []

    if (headerColumnCount > 0 && rowColumnCount < headerColumnCount) {
      errors.push(`CSV 列数不足：表头 ${headerColumnCount} 列，当前行仅 ${rowColumnCount} 列。请检查该行是否存在未正确闭合的引号或分隔符。`)
    }
    else if (headerColumnCount > 0 && rowColumnCount > headerColumnCount) {
      warnings.push(`CSV 列数超出：表头 ${headerColumnCount} 列，当前行 ${rowColumnCount} 列。超出列将被忽略。`)
    }

    if (!name)
      errors.push('name 不能为空。')
    if (!officialUrl)
      errors.push('officialUrl 不能为空。')
    if (!levelRaw)
      warnings.push('level 为空，已按 national 处理。')
    else if (!parsedLevel)
      warnings.push('level 非法，已按 national 处理。')

    if (!organizer)
      warnings.push('organizer 为空，后续发布前需要补充。')
    if (!registrationText)
      warnings.push('报名时间为空，时间轴将按届次/当前年份推断。')
    warnings.push(...registration.warnings)
    structuredWarnings.push(...registration.warnings)
    if (registration.inferredYearSource === 'fallback_current_year')
      structuredWarnings.push('年份无法从报名时间/届次解析，已回退当前年份。')

    const dedupKey = buildContestDedupKey(name, organizer, officialUrl)
    let action: ContestImportNormalizedRow['action'] = 'create'
    let existingContestId = ''
    if (dedupKey) {
      if (fileDedupKeys.has(dedupKey)) {
        errors.push(`导入文件内存在重复竞赛（名称+主办方+官网），首次出现于第 ${fileDedupKeys.get(dedupKey)} 行。`)
      }
      else {
        fileDedupKeys.set(dedupKey, rowNumber)
      }

      const existing = existingByKey.get(dedupKey)
      if (existing) {
        action = 'update'
        existingContestId = existing.id
      }
    }
    else {
      warnings.push('去重键不完整（名称+主办方+官网），建议补齐。')
    }

    const normalized: ContestImportNormalizedRow | null = !errors.length
      ? {
          name,
          level,
          officialUrl,
          dedupKey,
          action,
          existingContestId: existingContestId || undefined,
          inferredYear: registration.inferredYear,
          inferredYearSource: registration.inferredYearSource,
          registrationText: registration.raw || undefined,
          registrationStartAt: registration.startAt,
          registrationEndAt: registration.endAt,
          contestProposition,
          contestProcess,
          scoringCriteria,
          awardRatio,
          organizer,
          coOrganizer,
          currentSeason,
          disciplines,
          aliases,
          keywords,
          recommendedFor,
          summary,
          participantRequirements,
          teamRule,
        }
      : null

    indexedRows.push({
      rowNumber,
      action: normalized?.action || 'invalid',
      inferredYear: normalized?.inferredYear || null,
      inferredYearSource: normalized?.inferredYearSource,
      targetContestId: normalized?.existingContestId,
      suggestedExecute: errors.length === 0,
      suggestedOverwriteMode: 'preserve_existing',
      errors,
      warnings,
      structuredWarnings,
      normalized,
    })
  }

  const validCount = indexedRows.filter(row => row.errors.length === 0).length
  return {
    headers,
    total: indexedRows.length,
    validCount,
    invalidCount: indexedRows.length - validCount,
    defaultExecutionPlan: {
      defaultExecute: true,
      defaultOverwriteMode: 'preserve_existing',
      rowDecisions: indexedRows
        .filter(item => item.errors.length > 0)
        .map(item => ({
          rowNumber: item.rowNumber,
          execute: false,
        })),
    },
    rows: indexedRows,
  }
}

export async function commitContestImportRows(
  db: Queryable,
  input: {
    actorUserId: string
    rows: ContestImportPreviewRow[]
    skipInvalid?: boolean
    executionPlan?: ContestImportExecutionPlan
  },
): Promise<ContestImportCommitResult> {
  const skipInvalid = input.skipInvalid !== false
  const resolvedPlan = resolveContestImportExecutionPlan(input.rows, input.executionPlan, skipInvalid)
  const result: ContestImportCommitResult = {
    total: input.rows.length,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    createdContestIds: [],
    updatedContestIds: [],
    errors: [],
    rowResults: [],
  }

  for (const row of input.rows) {
    const rowDecision = resolvedPlan.rowDecisions.get(row.rowNumber) || {
      execute: resolvedPlan.defaultExecute,
      overwriteMode: resolvedPlan.defaultOverwriteMode,
    }

    if (row.errors.length > 0 || !row.normalized) {
      const invalidMessage = row.errors.join('；') || '该行数据无效。'
      if (rowDecision.execute && !skipInvalid) {
        result.errors.push({
          rowNumber: row.rowNumber,
          message: invalidMessage,
        })
        result.rowResults.push({
          rowNumber: row.rowNumber,
          action: row.action,
          decision: 'invalid',
          overwriteMode: rowDecision.overwriteMode,
          result: 'invalid',
          message: invalidMessage,
        })
        continue
      }
      result.skippedCount += 1
      result.rowResults.push({
        rowNumber: row.rowNumber,
        action: row.action,
        decision: 'skipped',
        overwriteMode: rowDecision.overwriteMode,
        result: 'invalid',
        message: invalidMessage,
      })
      continue
    }

    if (!rowDecision.execute) {
      result.skippedCount += 1
      result.rowResults.push({
        rowNumber: row.rowNumber,
        action: row.normalized.action,
        decision: 'skipped',
        overwriteMode: rowDecision.overwriteMode,
        result: 'skipped',
        contestId: row.normalized.existingContestId,
      })
      continue
    }

    try {
      let contestId = ''
      let operationResult: ContestImportCommitRowResult['result'] = 'created'
      if (row.normalized.action === 'update' && row.normalized.existingContestId) {
        const updated = await applyContestImportUpdate(db, {
          actorUserId: input.actorUserId,
          contestId: row.normalized.existingContestId,
          normalized: row.normalized,
          overwriteMode: rowDecision.overwriteMode,
        })
        if (updated) {
          contestId = updated.id
          result.updatedCount += 1
          result.updatedContestIds.push(updated.id)
          operationResult = 'updated'
        }
        else {
          const created = await createContestFromImport(db, input.actorUserId, row.normalized)
          contestId = created.id
          result.createdCount += 1
          result.createdContestIds.push(created.id)
          operationResult = 'created'
        }
      }
      else {
        const created = await createContestFromImport(db, input.actorUserId, row.normalized)
        contestId = created.id
        result.createdCount += 1
        result.createdContestIds.push(created.id)
        operationResult = 'created'
      }

      if (contestId) {
        await upsertImportTimelineNodes(db, {
          actorUserId: input.actorUserId,
          contestId,
          normalized: row.normalized,
          overwriteMode: rowDecision.overwriteMode,
        })
        await upsertImportResources(db, {
          actorUserId: input.actorUserId,
          contestId,
          contestName: row.normalized.name,
          officialUrl: row.normalized.officialUrl,
          normalized: row.normalized,
          overwriteMode: rowDecision.overwriteMode,
        })
      }

      result.rowResults.push({
        rowNumber: row.rowNumber,
        action: row.normalized.action,
        decision: 'executed',
        overwriteMode: rowDecision.overwriteMode,
        result: operationResult,
        contestId,
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '创建失败'
      result.errors.push({
        rowNumber: row.rowNumber,
        message,
      })
      result.rowResults.push({
        rowNumber: row.rowNumber,
        action: row.normalized.action,
        decision: 'error',
        overwriteMode: rowDecision.overwriteMode,
        result: 'error',
        contestId: row.normalized.existingContestId,
        message,
      })
    }
  }

  return result
}

interface ResolvedContestImportExecutionPlan {
  defaultExecute: boolean
  defaultOverwriteMode: ContestImportOverwriteMode
  rowDecisions: Map<number, { execute: boolean, overwriteMode: ContestImportOverwriteMode }>
}

function normalizeContestImportOverwriteMode(value: unknown): ContestImportOverwriteMode {
  return value === 'force_replace' ? 'force_replace' : 'preserve_existing'
}

function resolveContestImportExecutionPlan(
  rows: ContestImportPreviewRow[],
  executionPlan: ContestImportExecutionPlan | undefined,
  skipInvalid: boolean,
): ResolvedContestImportExecutionPlan {
  const defaultExecute = executionPlan?.defaultExecute !== false
  const defaultOverwriteMode = normalizeContestImportOverwriteMode(executionPlan?.defaultOverwriteMode)
  const rowDecisions = new Map<number, { execute: boolean, overwriteMode: ContestImportOverwriteMode }>()

  for (const row of rows) {
    rowDecisions.set(row.rowNumber, {
      execute: row.errors.length > 0 && skipInvalid ? false : defaultExecute,
      overwriteMode: defaultOverwriteMode,
    })
  }

  const sourceDecisions = Array.isArray(executionPlan?.rowDecisions) ? executionPlan?.rowDecisions || [] : []
  for (const decision of sourceDecisions) {
    const rowNumber = Number(decision?.rowNumber || 0)
    if (!Number.isFinite(rowNumber) || rowNumber <= 0 || !rowDecisions.has(rowNumber))
      continue
    const previous = rowDecisions.get(rowNumber)!
    rowDecisions.set(rowNumber, {
      execute: decision?.execute === undefined ? previous.execute : decision.execute !== false,
      overwriteMode: decision?.overwriteMode === undefined
        ? previous.overwriteMode
        : normalizeContestImportOverwriteMode(decision.overwriteMode),
    })
  }

  return {
    defaultExecute,
    defaultOverwriteMode,
    rowDecisions,
  }
}

function isBlankText(value: unknown): boolean {
  return !normalizeString(value)
}

async function createContestFromImport(
  db: Queryable,
  actorUserId: string,
  normalized: ContestImportNormalizedRow,
): Promise<Contest> {
  return createAdminContest(db, {
    actorUserId,
    name: normalized.name,
    level: normalized.level,
    organizer: normalized.organizer,
    coOrganizer: normalized.coOrganizer,
    officialUrl: normalized.officialUrl,
    summary: normalized.summary,
    participantRequirements: normalized.participantRequirements,
    teamRule: normalized.teamRule,
    currentSeason: normalizeString(normalized.currentSeason) || String(normalized.inferredYear),
    disciplines: normalized.disciplines,
    aliases: normalized.aliases,
    keywords: normalized.keywords,
    recommendedFor: normalized.recommendedFor,
    visibility: 'internal',
  })
}

function buildImportResourceSpecs(normalized: ContestImportNormalizedRow, contestName: string): Array<{
  key: 'contestProposition' | 'contestProcess' | 'scoringCriteria' | 'awardRatio'
  label: string
  category: ResourceCategory
  title: string
  content: string
}> {
  const baseName = normalizeString(contestName) || '赛事'
  const specs: Array<{
    key: 'contestProposition' | 'contestProcess' | 'scoringCriteria' | 'awardRatio'
    label: string
    category: ResourceCategory
    title: string
    content: string
  }> = []

  if (normalizeString(normalized.contestProposition)) {
    specs.push({
      key: 'contestProposition',
      label: '比赛命题',
      category: 'track_details',
      title: `${baseName} 比赛命题`,
      content: normalizeString(normalized.contestProposition),
    })
  }
  if (normalizeString(normalized.contestProcess)) {
    specs.push({
      key: 'contestProcess',
      label: '比赛流程',
      category: 'timeline',
      title: `${baseName} 比赛流程`,
      content: normalizeString(normalized.contestProcess),
    })
  }
  if (normalizeString(normalized.scoringCriteria)) {
    specs.push({
      key: 'scoringCriteria',
      label: '评分标准',
      category: 'scoring',
      title: `${baseName} 评分标准`,
      content: normalizeString(normalized.scoringCriteria),
    })
  }
  if (normalizeString(normalized.awardRatio)) {
    specs.push({
      key: 'awardRatio',
      label: '获奖比例',
      category: 'awarded_works',
      title: `${baseName} 获奖比例`,
      content: normalizeString(normalized.awardRatio),
    })
  }

  return specs
}

async function applyContestImportUpdate(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    normalized: ContestImportNormalizedRow
    overwriteMode: ContestImportOverwriteMode
  },
): Promise<Contest | null> {
  const detail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: true,
  })
  if (!detail)
    return null

  const contest = detail.contest
  const patch: {
    name?: string
    level?: ContestLevel
    organizer?: string
    coOrganizer?: string
    officialUrl?: string
    summary?: string
    participantRequirements?: string
    teamRule?: string
    currentSeason?: string
    disciplines?: string[]
    aliases?: string[]
    keywords?: string[]
    recommendedFor?: string[]
  } = {}

  const organizer = normalizeString(input.normalized.organizer)
  const coOrganizer = normalizeString(input.normalized.coOrganizer)

  patch.name = input.normalized.name
  patch.level = input.normalized.level
  if (organizer)
    patch.organizer = organizer
  if (coOrganizer)
    patch.coOrganizer = coOrganizer
  patch.officialUrl = input.normalized.officialUrl
  patch.currentSeason = normalizeString(input.normalized.currentSeason) || String(input.normalized.inferredYear)

  if (Array.isArray(input.normalized.disciplines) && input.normalized.disciplines.length > 0)
    patch.disciplines = input.normalized.disciplines
  if (Array.isArray(input.normalized.aliases) && input.normalized.aliases.length > 0)
    patch.aliases = input.normalized.aliases
  if (Array.isArray(input.normalized.keywords) && input.normalized.keywords.length > 0)
    patch.keywords = input.normalized.keywords
  if (Array.isArray(input.normalized.recommendedFor) && input.normalized.recommendedFor.length > 0)
    patch.recommendedFor = input.normalized.recommendedFor

  if (!isBlankText(input.normalized.summary) && (input.overwriteMode === 'force_replace' || isBlankText(contest.summary)))
    patch.summary = input.normalized.summary
  if (!isBlankText(input.normalized.participantRequirements) && (input.overwriteMode === 'force_replace' || isBlankText(contest.participantRequirements)))
    patch.participantRequirements = input.normalized.participantRequirements
  if (!isBlankText(input.normalized.teamRule) && (input.overwriteMode === 'force_replace' || isBlankText(contest.teamRule)))
    patch.teamRule = input.normalized.teamRule

  return patchAdminContest(db, {
    actorUserId: input.actorUserId,
    contestId: input.contestId,
    patch,
  })
}

async function upsertImportTimelineNodes(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    normalized: ContestImportNormalizedRow
    overwriteMode: ContestImportOverwriteMode
  },
): Promise<void> {
  const year = Number(input.normalized.inferredYear || new Date().getFullYear())
  const startAt = input.normalized.registrationStartAt || null
  const endAt = input.normalized.registrationEndAt || null
  const hasTimelineValue = Boolean(startAt || endAt)
  if (!hasTimelineValue)
    return

  const sourceLink = normalizeString(input.normalized.officialUrl)
  const noteText = normalizeString(input.normalized.registrationText)
  const timelineRows = await loadTimelines(db, [input.contestId])
  const registration = timelineRows.find(row => row.year === year && row.node_type === 'registration')

  if (registration) {
    const patch: {
      startAt?: string | null
      endAt?: string | null
      note?: string
      sourceLink?: string
    } = {}
    if (startAt)
      patch.startAt = startAt
    if (endAt)
      patch.endAt = endAt
    if (noteText && (input.overwriteMode === 'force_replace' || !normalizeString(registration.note)))
      patch.note = `导入模板报名时间：${noteText}`
    if (sourceLink)
      patch.sourceLink = sourceLink

    await patchAdminTimeline(db, {
      actorUserId: input.actorUserId,
      contestId: input.contestId,
      timelineId: registration.id,
      patch,
    })
  }
  else {
    await createAdminTimeline(db, {
      actorUserId: input.actorUserId,
      contestId: input.contestId,
      year,
      nodeType: 'registration',
      startAt,
      endAt,
      note: noteText ? `导入模板报名时间：${noteText}` : '',
      sourceLink,
    })
  }

  if (!endAt)
    return

  const submission = timelineRows.find(row => row.year === year && row.node_type === 'submission')
  if (submission) {
    const patch: {
      endAt?: string | null
      sourceLink?: string
    } = {
      endAt,
    }
    if (sourceLink)
      patch.sourceLink = sourceLink
    await patchAdminTimeline(db, {
      actorUserId: input.actorUserId,
      contestId: input.contestId,
      timelineId: submission.id,
      patch,
    })
    return
  }

  await createAdminTimeline(db, {
    actorUserId: input.actorUserId,
    contestId: input.contestId,
    year,
    nodeType: 'submission',
    startAt: null,
    endAt,
    note: '由导入报名时间推断提交截止时间。',
    sourceLink,
  })
}

async function upsertImportResources(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    contestName: string
    officialUrl: string
    normalized: ContestImportNormalizedRow
    overwriteMode: ContestImportOverwriteMode
  },
): Promise<void> {
  const specs = buildImportResourceSpecs(input.normalized, input.contestName)
  if (specs.length === 0)
    return

  for (const spec of specs) {
    const result = await db.query<ResourceRow>(
      `SELECT
        id,
        contest_id,
        category,
        title,
        year,
        url,
        access_level,
        source_type,
        summary,
        content,
        metadata,
        copyright_note,
        status,
        created_at::TEXT,
        updated_at::TEXT
       FROM contest_resources
       WHERE contest_id = $1
         AND category = $2
         AND year = $3
         AND title = $4
         AND status <> 'archived'
       ORDER BY created_at ASC
       LIMIT 1`,
      [input.contestId, spec.category, input.normalized.inferredYear, spec.title],
    )

    const row = result.rows[0]
    if (!row) {
      await createAdminResource(db, {
        actorUserId: input.actorUserId,
        contestId: input.contestId,
        category: spec.category,
        title: spec.title,
        year: input.normalized.inferredYear,
        url: normalizeString(input.officialUrl),
        accessLevel: 'public',
        sourceType: 'import_csv',
        summary: `来源字段：${spec.label}`,
        content: spec.content,
        metadata: {
          importField: spec.key,
          importSource: 'contest_csv',
        },
        status: 'active',
      })
      continue
    }

    const resource = mapResource(row)
    const patch: {
      url?: string
      sourceType?: string
      summary?: string
      content?: string
      metadata?: Record<string, unknown>
    } = {}
    if (input.overwriteMode === 'force_replace') {
      patch.content = spec.content
      patch.summary = `来源字段：${spec.label}`
      patch.sourceType = 'import_csv'
      if (normalizeString(input.officialUrl))
        patch.url = normalizeString(input.officialUrl)
      patch.metadata = {
        ...(resource.metadata || {}),
        importField: spec.key,
        importSource: 'contest_csv',
      }
    }
    else {
      if (isBlankText(resource.content))
        patch.content = spec.content
      if (isBlankText(resource.summary))
        patch.summary = `来源字段：${spec.label}`
      if (isBlankText(resource.sourceLink) && normalizeString(input.officialUrl))
        patch.url = normalizeString(input.officialUrl)
      if (isBlankText(resource.sourceType))
        patch.sourceType = 'import_csv'
      if (!resource.metadata || Object.keys(resource.metadata || {}).length === 0) {
        patch.metadata = {
          importField: spec.key,
          importSource: 'contest_csv',
        }
      }
    }

    if (Object.keys(patch).length === 0)
      continue

    await patchAdminResource(db, {
      actorUserId: input.actorUserId,
      contestId: input.contestId,
      resourceId: resource.id,
      patch,
    })
  }
}

interface ContestRow {
  id: string
  name: string
  aliases: string[]
  level: ContestLevel
  disciplines: string[]
  organizer: string
  co_organizer: string
  official_url: string
  summary: string
  participant_requirements: string
  team_rule: string
  current_season: string
  status: ContestStatus
  visibility: ContestVisibility
  hot_score: number
  keywords: string[]
  recommended_for: string[]
  faq: string
  faq_items: ContestFaqItem[]
  created_at: string
  updated_at: string
}

interface TrackRow {
  id: string
  contest_id: string
  name: string
  summary: string
  suitable_majors: string[]
  deliverable_types: string[]
  rubric_id: string | null
  sort_order: number
  status: ContestStatus
}

interface TimelineRow {
  id: string
  contest_id: string
  year: number
  node_type: TimelineNodeType
  start_at: string | null
  end_at: string | null
  note: string
  source_link: string
}

interface RubricRow {
  id: string
  contest_id: string
  track_id: string
  scoring_mode: RubricScoringMode
  version: number
  dimensions: RubricDimension[]
  scoring_points: string[]
  deduction_items: string[]
  evidence_requirements: string[]
  status: ContestStatus
  created_at: string
  updated_at: string
}

interface ResourceRow {
  id: string
  contest_id: string
  category: ResourceCategory
  title: string
  year: number
  url: string
  access_level: ResourceAvailability
  source_type: string
  summary: string
  content: string
  metadata: Record<string, unknown>
  copyright_note: string
  status: ResourceStatus
  created_at: string
  updated_at: string
}

interface ContestAuditLogRow {
  id: string
  contest_id: string | null
  resource_id: string | null
  actor_user_id: string | null
  action: string
  payload: Record<string, unknown>
  created_at: string
}

type AiPromptTarget = 'contest_filter' | 'project_chat'

interface AiPromptSpec {
  target: AiPromptTarget
  priority: number
  enabled: boolean
  scope: 'contest' | 'track'
  trackId: string
  prompt: string
}

interface BillingPlanRow {
  id: string
  code: string
  name: string
  base_price_cents: number
  included_seats: number
  extra_seat_price_cents: number
  included_ai_quota: number
  is_active: boolean
  created_at: string
  updated_at: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => normalizeString(item)).filter(Boolean)
}

function parseResourceMetadata(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      return normalizeRecord(JSON.parse(value))
    }
    catch {
      return {}
    }
  }
  return normalizeRecord(value)
}

function normalizeFaqItems(value: unknown): ContestFaqItem[] {
  if (!Array.isArray(value))
    return []
  const items = value
    .map((item, index) => {
      const source = (item || {}) as Record<string, unknown>
      return {
        question: normalizeString(source.question),
        answer: normalizeString(source.answer),
        sortOrder: Number(source.sortOrder ?? index),
      }
    })
    .filter(item => item.question || item.answer)
  return items.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

function normalizeDimension(input: unknown): RubricDimension {
  const source = (input || {}) as Record<string, unknown>
  const rawWeight = source.weight
  const parsedWeight = rawWeight === undefined || rawWeight === null || rawWeight === ''
    ? undefined
    : Number(rawWeight)
  return {
    key: normalizeString(source.key) || randomUUID().slice(0, 8),
    name: normalizeString(source.name),
    weight: Number.isFinite(parsedWeight) ? parsedWeight : undefined,
    description: normalizeString(source.description),
    scoringPoint: normalizeString(source.scoringPoint),
    deductionPoint: normalizeString(source.deductionPoint),
    evidenceRequirement: normalizeString(source.evidenceRequirement),
  }
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (!key || seen.has(key))
      continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function mapTrack(row: TrackRow): Track {
  return {
    id: row.id,
    contestId: row.contest_id,
    name: row.name,
    summary: row.summary,
    suitableMajors: normalizeStringArray(row.suitable_majors),
    deliverableTypes: normalizeStringArray(row.deliverable_types),
    rubricId: row.rubric_id || null,
    sortOrder: Number(row.sort_order || 0),
    status: row.status,
  }
}

function mapTimeline(row: TimelineRow): ContestTimeline {
  return {
    id: row.id,
    contestId: row.contest_id,
    year: Number(row.year || 0),
    nodeType: row.node_type,
    startAt: row.start_at,
    endAt: row.end_at,
    note: row.note,
    sourceLink: row.source_link,
  }
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value)
    return ''
  return String(value).slice(0, 10)
}

function computeRegistrationWindow(timelines: ContestTimeline[]): string {
  const nodes = timelines
    .filter(item => item.nodeType === 'registration')
    .filter(item => item.startAt || item.endAt)

  if (nodes.length === 0)
    return ''

  const starts = nodes.map(item => item.startAt).filter(Boolean) as string[]
  const ends = nodes.map(item => item.endAt).filter(Boolean) as string[]
  const start = starts.sort()[0] || ''
  const end = ends.sort().slice(-1)[0] || ''

  if (start && end)
    return `${formatDateOnly(start)} ~ ${formatDateOnly(end)}`
  if (end)
    return `~ ${formatDateOnly(end)}`
  return `${formatDateOnly(start)} ~`
}

function computeSubmissionDeadline(timelines: ContestTimeline[]): string {
  const nodes = timelines
    .filter(item => item.nodeType === 'submission')
    .filter(item => item.endAt)
    .sort((a, b) => String(a.endAt).localeCompare(String(b.endAt)))

  return formatDateOnly(nodes[0]?.endAt)
}

function mapContest(row: ContestRow, tracks: Track[], timelines: ContestTimeline[]): Contest {
  const faqItems = normalizeFaqItems(row.faq_items)
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    organizer: row.organizer,
    registrationWindow: computeRegistrationWindow(timelines),
    submissionDeadline: computeSubmissionDeadline(timelines),
    recommendedFor: normalizeStringArray(row.recommended_for),
    keywords: normalizeStringArray(row.keywords),
    tracks: tracks.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    aliases: normalizeStringArray(row.aliases),
    disciplines: normalizeStringArray(row.disciplines),
    coOrganizer: row.co_organizer,
    officialUrl: row.official_url,
    summary: row.summary,
    participantRequirements: row.participant_requirements,
    teamRule: row.team_rule,
    currentSeason: row.current_season,
    status: row.status,
    visibility: row.visibility,
    hotScore: Number(row.hot_score || 0),
    faq: row.faq,
    faqItems,
    timelines,
  }
}

function mapRubric(row: RubricRow): Rubric {
  return {
    id: row.id,
    contestId: row.contest_id,
    trackId: row.track_id,
    scoringMode: row.scoring_mode || 'weighted',
    version: Number(row.version || 1),
    status: row.status,
    dimensions: Array.isArray(row.dimensions) ? row.dimensions : [],
    scoringPoints: normalizeStringArray(row.scoring_points),
    deductionItems: normalizeStringArray(row.deduction_items),
    evidenceRequirements: normalizeStringArray(row.evidence_requirements),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    contestId: row.contest_id,
    category: row.category,
    title: row.title,
    type: row.category,
    year: Number(row.year || 0),
    sourceLink: row.url,
    availability: row.access_level,
    sourceType: row.source_type,
    summary: row.summary,
    content: row.content,
    metadata: parseResourceMetadata(row.metadata),
    copyrightNote: row.copyright_note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapContestAuditLog(row: ContestAuditLogRow): ContestAuditLog {
  return {
    id: row.id,
    contestId: row.contest_id,
    resourceId: row.resource_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    payload: parseResourceMetadata(row.payload),
    createdAt: row.created_at,
  }
}

function mapBillingPlan(row: BillingPlanRow): BillingPlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    basePriceCents: Number(row.base_price_cents || 0),
    includedSeats: Number(row.included_seats || 0),
    extraSeatPriceCents: Number(row.extra_seat_price_cents || 0),
    includedAiQuota: Number(row.included_ai_quota || 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function resolvePermissionsFromRoles(roles: PlatformRole[]): PlatformPermission[] {
  const permissions = new Set<PlatformPermission>()
  for (const role of roles) {
    const list = PLATFORM_ROLE_PERMISSIONS[role] || []
    for (const item of list)
      permissions.add(item)
  }
  return [...permissions]
}

export async function listPlatformRolesByUserId(db: Queryable, userId: string): Promise<PlatformRole[]> {
  const result = await db.query<{ role: PlatformRole }>(
    `SELECT role
     FROM platform_user_roles
     WHERE user_id = $1`,
    [userId],
  )

  return dedupeBy(result.rows.map(row => row.role), item => item)
}

export async function resolvePlatformAccess(
  db: Queryable,
  user: AuthUser,
): Promise<{ roles: PlatformRole[], permissions: PlatformPermission[] }> {
  const roleSet = new Set<PlatformRole>()

  if (user.isPlatformAdmin)
    roleSet.add('platform_super_admin')

  const dbRoles = await listPlatformRolesByUserId(db, user.id)
  for (const role of dbRoles)
    roleSet.add(role)

  const roles = [...roleSet]
  const permissions = resolvePermissionsFromRoles(roles)

  return {
    roles,
    permissions,
  }
}

export async function hasPlatformPermission(
  db: Queryable,
  user: AuthUser,
  permission: PlatformPermission,
): Promise<boolean> {
  const access = await resolvePlatformAccess(db, user)
  return access.permissions.includes(permission)
}

export async function listPlatformRoleAssignments(db: Queryable): Promise<PlatformRoleAssignment[]> {
  const result = await db.query<{
    user_id: string
    username: string
    role: PlatformRole
    created_at: string
    updated_at: string
  }>(
    `SELECT pr.user_id, u.username, pr.role, pr.created_at::TEXT, pr.updated_at::TEXT
     FROM platform_user_roles pr
     JOIN users u ON u.id = pr.user_id
     ORDER BY u.username ASC, pr.updated_at DESC`,
  )

  const grouped = new Map<string, PlatformRoleAssignment>()

  for (const row of result.rows) {
    const key = row.user_id
    if (!grouped.has(key)) {
      grouped.set(key, {
        userId: row.user_id,
        username: row.username,
        roles: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    }

    const item = grouped.get(key)!
    if (!item.roles.includes(row.role))
      item.roles.push(row.role)
    if (String(row.updated_at) > String(item.updatedAt))
      item.updatedAt = row.updated_at
  }

  return [...grouped.values()]
}

export async function setPlatformRolesByUserId(
  db: Queryable,
  input: {
    targetUserId: string
    roles: PlatformRole[]
  },
): Promise<PlatformRoleAssignment | null> {
  const roles = dedupeBy(input.roles, item => item)
  const now = new Date().toISOString()

  await db.query('DELETE FROM platform_user_roles WHERE user_id = $1', [input.targetUserId])

  for (const role of roles) {
    await db.query(
      `INSERT INTO platform_user_roles (id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [randomUUID(), input.targetUserId, role, now],
    )
  }

  const result = await db.query<{ id: string, username: string }>(
    'SELECT id, username FROM users WHERE id = $1 LIMIT 1',
    [input.targetUserId],
  )

  const user = result.rows[0]
  if (!user)
    return null

  return {
    userId: user.id,
    username: user.username,
    roles,
    createdAt: now,
    updatedAt: now,
  }
}

function mapCatalogResourceTypeToCategory(type: string): ResourceCategory {
  const normalized = type.toLowerCase()
  if (normalized.includes('时间'))
    return 'timeline'
  if (normalized.includes('赛道'))
    return 'tracks'
  if (normalized.includes('评分'))
    return 'scoring'
  if (normalized.includes('真题'))
    return 'past_questions'
  if (normalized.includes('获奖'))
    return 'awarded_works'
  if (normalized.includes('模板'))
    return 'templates'
  if (normalized.includes('faq'))
    return 'faq'
  return 'basic_info'
}

async function writeMigrationFlag(db: Queryable, key: string): Promise<void> {
  await db.query(
    `INSERT INTO migrations_meta (key, value, updated_at)
     VALUES ($1, '1', NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key],
  )
}

async function hasMigrationFlag(db: Queryable, key: string): Promise<boolean> {
  const result = await db.query<{ value: string }>(
    'SELECT value FROM migrations_meta WHERE key = $1 LIMIT 1',
    [key],
  )

  return result.rows[0]?.value === '1'
}

async function deleteMigrationFlag(db: Queryable, key: string): Promise<void> {
  await db.query(
    'DELETE FROM migrations_meta WHERE key = $1',
    [key],
  )
}

function isContestAutoSeedEnabled(): boolean {
  const raw = String(process.env.WINLOOP_CONTEST_AUTO_SEED || '').trim().toLowerCase()
  if (!raw)
    return false
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

export function listCatalogContestIds(): string[] {
  return listCatalogContests().map(item => item.id)
}

export async function ensureDefaultBillingPlans(db: Queryable): Promise<void> {
  const existing = await db.query<{ count: string }>('SELECT COUNT(*)::TEXT AS count FROM billing_plans')
  const total = Number(existing.rows[0]?.count || '0')
  if (total > 0)
    return

  const now = new Date().toISOString()
  const plans: Array<Omit<BillingPlan, 'createdAt' | 'updatedAt'>> = [
    {
      id: randomUUID(),
      code: 'team-basic',
      name: '团队基础版',
      basePriceCents: 99900,
      includedSeats: 100,
      extraSeatPriceCents: 1000,
      includedAiQuota: 1000,
      isActive: true,
    },
    {
      id: randomUUID(),
      code: 'team-pro',
      name: '团队专业版',
      basePriceCents: 199900,
      includedSeats: 300,
      extraSeatPriceCents: 800,
      includedAiQuota: 5000,
      isActive: true,
    },
  ]

  for (const plan of plans) {
    await db.query(
      `INSERT INTO billing_plans (
        id,
        code,
        name,
        base_price_cents,
        included_seats,
        extra_seat_price_cents,
        included_ai_quota,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      ON CONFLICT (code) DO NOTHING`,
      [
        plan.id,
        plan.code,
        plan.name,
        plan.basePriceCents,
        plan.includedSeats,
        plan.extraSeatPriceCents,
        plan.includedAiQuota,
        plan.isActive,
        now,
      ],
    )
  }
}

export async function ensureContestLibrarySeeded(
  db: Queryable,
  input?: string | { actorUserId?: string, forceSeed?: boolean },
): Promise<void> {
  const actorUserId = typeof input === 'string' ? input : input?.actorUserId
  const forceSeed = typeof input === 'object' ? input?.forceSeed === true : false
  if (!forceSeed && !isContestAutoSeedEnabled()) {
    await ensureDefaultBillingPlans(db)
    return
  }

  if (await hasMigrationFlag(db, CONTEST_LIBRARY_MIGRATION_KEY)) {
    await ensureDefaultBillingPlans(db)
    return
  }

  const contests = listCatalogContests()
  const resources = listCatalogResources()
  const rubrics = listCatalogRubrics()
  const now = new Date().toISOString()

  for (const contest of contests) {
    const registrationWindow = String(contest.registrationWindow || '').split('~').map(item => item.trim())
    const regStart = registrationWindow[0] ? `${registrationWindow[0]}T00:00:00+08:00` : null
    const regEnd = registrationWindow[1] ? `${registrationWindow[1]}T23:59:59+08:00` : null
    const yearBySeason = Number(String(contest.currentSeason || '').match(/\d{4}/)?.[0] || '0')
    const yearByRegistration = Number(String(registrationWindow[0] || '').slice(0, 4))
    const seasonYear = yearByRegistration >= 2000 ? yearByRegistration : (yearBySeason >= 2000 ? yearBySeason : 2026)
    const status = contest.status || 'published'
    const visibility = contest.visibility || 'public'
    const hotScore = Number.isFinite(Number(contest.hotScore)) ? Number(contest.hotScore) : 60
    const summary = normalizeString(contest.summary) || contest.tracks.map(track => normalizeString(track.name)).join('；')

    await db.query(
      `INSERT INTO contests (
        id,
        name,
        aliases,
        level,
        disciplines,
        organizer,
        co_organizer,
        official_url,
        summary,
        participant_requirements,
        team_rule,
        current_season,
        status,
        visibility,
        hot_score,
        keywords,
        recommended_for,
        faq,
        faq_items,
        created_by_user_id,
        updated_by_user_id,
        published_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3::TEXT[], $4, $5::TEXT[], $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        $16::TEXT[], $17::TEXT[], $18, $19::JSONB, $20, $20, $21, $22, $22
      ) ON CONFLICT (id) DO NOTHING`,
      [
        contest.id,
        contest.name,
        normalizeStringArray(contest.aliases),
        contest.level,
        normalizeStringArray(contest.disciplines?.length ? contest.disciplines : contest.recommendedFor),
        normalizeString(contest.organizer),
        normalizeString(contest.coOrganizer),
        normalizeString(contest.officialUrl),
        summary,
        normalizeString(contest.participantRequirements),
        normalizeString(contest.teamRule),
        normalizeString(contest.currentSeason) || String(seasonYear),
        status,
        visibility,
        hotScore,
        normalizeStringArray(contest.keywords),
        normalizeStringArray(contest.recommendedFor),
        normalizeString(contest.faq),
        JSON.stringify([]),
        actorUserId || null,
        status === 'published' ? now : null,
        now,
      ],
    )

    for (const [index, track] of contest.tracks.entries()) {
      await db.query(
        `INSERT INTO contest_tracks (
          id,
          contest_id,
          name,
          summary,
          suitable_majors,
          deliverable_types,
          sort_order,
          status,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5::TEXT[], $6::TEXT[], $7, 'published', $8, $8
        ) ON CONFLICT (id) DO NOTHING`,
        [
          track.id,
          contest.id,
          track.name,
          track.summary,
          normalizeStringArray(track.suitableMajors),
          normalizeStringArray(track.deliverableTypes),
          index,
          now,
        ],
      )
    }

    await db.query(
      `INSERT INTO contest_timelines (
        id,
        contest_id,
        year,
        node_type,
        start_at,
        end_at,
        note,
        source_link,
        created_at,
        updated_at
      )
      SELECT $1, $2, $3, 'registration', $4, $5, '', '', $6, $6
      WHERE NOT EXISTS (
        SELECT 1
        FROM contest_timelines
        WHERE contest_id = $2
          AND year = $3
          AND node_type = 'registration'
      )`,
      [randomUUID(), contest.id, seasonYear, regStart, regEnd, now],
    )

    await db.query(
      `INSERT INTO contest_timelines (
        id,
        contest_id,
        year,
        node_type,
        start_at,
        end_at,
        note,
        source_link,
        created_at,
        updated_at
      )
      SELECT $1, $2, $3, 'submission', NULL, $4, '', '', $5, $5
      WHERE NOT EXISTS (
        SELECT 1
        FROM contest_timelines
        WHERE contest_id = $2
          AND year = $3
          AND node_type = 'submission'
      )`,
      [randomUUID(), contest.id, seasonYear, contest.submissionDeadline ? `${contest.submissionDeadline}T23:59:59+08:00` : null, now],
    )
  }

  for (const rubric of rubrics) {
    await db.query(
      `INSERT INTO contest_rubrics (
        id,
        contest_id,
        track_id,
        scoring_mode,
        version,
        dimensions,
        scoring_points,
        deduction_items,
        evidence_requirements,
        status,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, 'weighted', 1, $4::JSONB, '{}'::TEXT[], '{}'::TEXT[], '{}'::TEXT[],
        'published', $5, $5, $6, $6
      ) ON CONFLICT (contest_id, track_id, version) DO NOTHING`,
      [
        rubric.id,
        rubric.contestId,
        rubric.trackId,
        JSON.stringify(rubric.dimensions || []),
        actorUserId || null,
        now,
      ],
    )
  }

  for (const resource of resources) {
    await db.query(
      `INSERT INTO contest_resources (
        id,
        contest_id,
        category,
        title,
        year,
        url,
        access_level,
        source_type,
        summary,
        copyright_note,
        status,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $13
      ) ON CONFLICT (id) DO NOTHING`,
      [
        resource.id,
        resource.contestId,
        resource.category || mapCatalogResourceTypeToCategory(resource.type),
        resource.title,
        Number(resource.year || 2026),
        resource.sourceLink,
        resource.availability,
        normalizeString(resource.sourceType) || 'official',
        resource.summary,
        resource.copyrightNote,
        resource.status || 'active',
        actorUserId || null,
        now,
      ],
    )
  }

  await writeMigrationFlag(db, CONTEST_LIBRARY_MIGRATION_KEY)
  await ensureDefaultBillingPlans(db)
}

export async function resetCatalogContestSeedState(
  db: Queryable,
): Promise<{ deletedContestIds: string[] }> {
  const contestIds = listCatalogContestIds()
  if (contestIds.length > 0) {
    await db.query(
      'DELETE FROM contests WHERE id = ANY($1::TEXT[])',
      [contestIds],
    )
  }
  await deleteMigrationFlag(db, CONTEST_LIBRARY_MIGRATION_KEY)

  return {
    deletedContestIds: contestIds,
  }
}

async function loadContests(db: Queryable, includeInternal: boolean): Promise<ContestRow[]> {
  const result = await db.query<ContestRow>(
    `SELECT
      id,
      name,
      aliases,
      level,
      disciplines,
      organizer,
      co_organizer,
      official_url,
      summary,
      participant_requirements,
      team_rule,
      current_season,
      status,
      visibility,
      hot_score,
      keywords,
      recommended_for,
      faq,
      faq_items,
      created_at::TEXT,
      updated_at::TEXT
     FROM contests
     WHERE ($1::BOOLEAN = TRUE OR (status = 'published' AND visibility = 'public'))
     ORDER BY updated_at DESC`,
    [includeInternal],
  )

  return result.rows
}

async function loadTracks(db: Queryable, contestIds: string[], includeInternal: boolean): Promise<TrackRow[]> {
  if (contestIds.length === 0)
    return []

  const result = await db.query<TrackRow>(
    `SELECT id, contest_id, name, summary, suitable_majors, deliverable_types, rubric_id, sort_order, status
     FROM contest_tracks
     WHERE contest_id = ANY($1::TEXT[])
       AND ($2::BOOLEAN = TRUE OR status = 'published')
     ORDER BY sort_order ASC, created_at ASC`,
    [contestIds, includeInternal],
  )

  return result.rows
}

async function loadTimelines(db: Queryable, contestIds: string[]): Promise<TimelineRow[]> {
  if (contestIds.length === 0)
    return []

  const result = await db.query<TimelineRow>(
    `SELECT id, contest_id, year, node_type, start_at::TEXT, end_at::TEXT, note, source_link
     FROM contest_timelines
     WHERE contest_id = ANY($1::TEXT[])
     ORDER BY year DESC, created_at ASC`,
    [contestIds],
  )

  return result.rows
}

function isUpcomingDeadline(contest: Contest): boolean {
  if (!contest.submissionDeadline)
    return false

  const end = new Date(`${contest.submissionDeadline}T23:59:59+08:00`).getTime()
  const now = Date.now()
  const diff = end - now
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

function isRegistrationOpen(contest: Contest): boolean {
  const timeline = contest.timelines || []
  const registrationNodes = timeline.filter(item => item.nodeType === 'registration')

  if (registrationNodes.length === 0)
    return false

  const now = Date.now()
  return registrationNodes.some((node) => {
    const start = node.startAt ? new Date(node.startAt).getTime() : Number.MIN_SAFE_INTEGER
    const end = node.endAt ? new Date(node.endAt).getTime() : Number.MAX_SAFE_INTEGER
    return now >= start && now <= end
  })
}

function isEnded(contest: Contest): boolean {
  if (!contest.submissionDeadline)
    return false
  const end = new Date(`${contest.submissionDeadline}T23:59:59+08:00`).getTime()
  return Date.now() > end
}

function matchContestFilter(contest: Contest, filter: ContestFilterInput & {
  q?: string
  deliverableType?: string
  timelineStatus?: string
  keywordList?: string[]
}): boolean {
  const q = normalizeString(filter.q)
  if (q) {
    const context = [
      contest.name,
      contest.organizer,
      ...(contest.aliases || []),
      ...(contest.keywords || []),
      ...(contest.recommendedFor || []),
      ...(contest.tracks || []).map(item => item.name),
    ].join(' ').toLowerCase()
    if (!context.includes(q.toLowerCase()))
      return false
  }

  if (filter.level && contest.level !== filter.level)
    return false

  if (filter.discipline) {
    const value = filter.discipline.toLowerCase()
    const matched = [...(contest.disciplines || []), ...(contest.keywords || [])]
      .some(item => item.toLowerCase().includes(value))
    if (!matched)
      return false
  }

  if (filter.major) {
    const value = filter.major.toLowerCase()
    const matched = (contest.recommendedFor || []).some(item => item.toLowerCase().includes(value))
      || contest.tracks.some(track => track.suitableMajors.some(item => item.toLowerCase().includes(value)))
    if (!matched)
      return false
  }

  if (filter.trackType) {
    const value = filter.trackType.toLowerCase()
    const matched = contest.tracks.some(track =>
      track.name.toLowerCase().includes(value)
      || track.summary.toLowerCase().includes(value),
    )
    if (!matched)
      return false
  }

  if (filter.deliverableType) {
    const value = filter.deliverableType.toLowerCase()
    const matched = contest.tracks.some(track =>
      track.deliverableTypes.some(item => item.toLowerCase().includes(value)),
    )
    if (!matched)
      return false
  }

  if (filter.timelineStatus === 'registration_open' && !isRegistrationOpen(contest))
    return false
  if (filter.timelineStatus === 'upcoming_deadline' && !isUpcomingDeadline(contest))
    return false
  if (filter.timelineStatus === 'ended' && !isEnded(contest))
    return false

  if (filter.keywordList && filter.keywordList.length > 0) {
    const context = [contest.name, contest.organizer, ...(contest.keywords || []), ...(contest.recommendedFor || [])].join(' ').toLowerCase()
    const matched = filter.keywordList.some(item => context.includes(item.toLowerCase()))
    if (!matched)
      return false
  }

  return true
}

function sortContests(contests: Contest[], sort: string): Contest[] {
  const list = [...contests]

  if (sort === 'deadline') {
    return list.sort((a, b) => {
      const left = a.submissionDeadline ? new Date(`${a.submissionDeadline}T23:59:59+08:00`).getTime() : Number.MAX_SAFE_INTEGER
      const right = b.submissionDeadline ? new Date(`${b.submissionDeadline}T23:59:59+08:00`).getTime() : Number.MAX_SAFE_INTEGER
      return left - right
    })
  }

  if (sort === 'hot') {
    return list.sort((a, b) => Number(b.hotScore || 0) - Number(a.hotScore || 0))
  }

  return list.sort((a, b) => {
    const hotDelta = Number(b.hotScore || 0) - Number(a.hotScore || 0)
    if (hotDelta !== 0)
      return hotDelta
    return String(a.name).localeCompare(String(b.name))
  })
}

export async function listContestLibrary(
  db: Queryable,
  input: {
    includeInternal: boolean
    q?: string
    discipline?: string
    level?: ContestLevel | ''
    major?: string
    trackType?: string
    keyword?: string[]
    deliverableType?: string
    timelineStatus?: string
    sort?: string
    page?: number
    pageSize?: number
  },
): Promise<{ items: Contest[], total: number, page: number, pageSize: number }> {
  await ensureContestLibrarySeeded(db)

  const rows = await loadContests(db, input.includeInternal)
  const ids = rows.map(item => item.id)
  const tracks = await loadTracks(db, ids, input.includeInternal)
  const timelines = await loadTimelines(db, ids)

  const trackMap = new Map<string, Track[]>()
  for (const row of tracks) {
    const list = trackMap.get(row.contest_id) || []
    list.push(mapTrack(row))
    trackMap.set(row.contest_id, list)
  }

  const timelineMap = new Map<string, ContestTimeline[]>()
  for (const row of timelines) {
    const list = timelineMap.get(row.contest_id) || []
    list.push(mapTimeline(row))
    timelineMap.set(row.contest_id, list)
  }

  const contests = rows.map((row) => {
    return mapContest(
      row,
      trackMap.get(row.id) || [],
      timelineMap.get(row.id) || [],
    )
  })

  const filtered = contests.filter(contest =>
    matchContestFilter(contest, {
      q: input.q,
      discipline: input.discipline,
      level: input.level,
      major: input.major,
      trackType: input.trackType,
      keywordList: normalizeStringArray(input.keyword),
      deliverableType: input.deliverableType,
      timelineStatus: normalizeString(input.timelineStatus),
    }),
  )

  const sorted = sortContests(filtered, normalizeString(input.sort) || 'composite')

  const page = Math.max(1, Number(input.page || 1))
  const pageSize = Math.max(1, Math.min(100, Number(input.pageSize || 20)))
  const offset = (page - 1) * pageSize

  return {
    items: sorted.slice(offset, offset + pageSize),
    total: sorted.length,
    page,
    pageSize,
  }
}

export async function getContestDetail(
  db: Queryable,
  input: {
    contestId: string
    includeInternal: boolean
  },
): Promise<ContestDetailPayload | null> {
  await ensureContestLibrarySeeded(db)

  const rowResult = await db.query<ContestRow>(
    `SELECT
      id,
      name,
      aliases,
      level,
      disciplines,
      organizer,
      co_organizer,
      official_url,
      summary,
      participant_requirements,
      team_rule,
      current_season,
      status,
      visibility,
      hot_score,
      keywords,
      recommended_for,
      faq,
      faq_items,
      created_at::TEXT,
      updated_at::TEXT
     FROM contests
     WHERE id = $1
       AND ($2::BOOLEAN = TRUE OR (status = 'published' AND visibility = 'public'))
     LIMIT 1`,
    [input.contestId, input.includeInternal],
  )

  const row = rowResult.rows[0]
  if (!row)
    return null

  const tracks = (await loadTracks(db, [row.id], input.includeInternal)).map(mapTrack)
  const timelines = (await loadTimelines(db, [row.id])).map(mapTimeline)

  const rubricRows = await db.query<RubricRow>(
    `SELECT
      id,
      contest_id,
      track_id,
      scoring_mode,
      version,
      dimensions,
      scoring_points,
      deduction_items,
      evidence_requirements,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_rubrics
     WHERE contest_id = $1
       AND ($2::BOOLEAN = TRUE OR status = 'published')
     ORDER BY version DESC, updated_at DESC`,
    [row.id, input.includeInternal],
  )

  const statsRows = await db.query<{ category: ResourceCategory, count: string }>(
    `SELECT category, COUNT(*)::TEXT AS count
     FROM contest_resources
     WHERE contest_id = $1
       AND ($2::BOOLEAN = TRUE OR status = 'active')
     GROUP BY category`,
    [row.id, input.includeInternal],
  )

  const resourceStats = RESOURCE_CATEGORIES.map((category) => {
    const matched = statsRows.rows.find(row => row.category === category)
    return {
      category,
      count: Number(matched?.count || '0'),
    }
  })

  const contest = mapContest(row, tracks, timelines)

  return {
    contest,
    timelines,
    rubrics: rubricRows.rows.map(mapRubric),
    resourceStats,
  }
}

export async function listContestResourcesByContestId(
  db: Queryable,
  input: {
    contestId: string
    includeInternal: boolean
    category?: ResourceCategory | ''
    year?: number
    availability?: ResourceAvailability | ''
  },
): Promise<Resource[]> {
  await ensureContestLibrarySeeded(db)

  const where: string[] = ['contest_id = $1']
  const values: unknown[] = [input.contestId]

  if (!input.includeInternal)
    where.push(`status = 'active'`)

  if (input.category) {
    values.push(input.category)
    where.push(`category = $${values.length}`)
  }

  if (input.year) {
    values.push(input.year)
    where.push(`year = $${values.length}`)
  }

  if (input.availability) {
    values.push(input.availability)
    where.push(`access_level = $${values.length}`)
  }

  const result = await db.query<ResourceRow>(
    `SELECT
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resources
     WHERE ${where.join(' AND ')}
     ORDER BY year DESC, created_at DESC`,
    values,
  )

  return result.rows.map(mapResource)
}

export async function listAllResources(
  db: Queryable,
  input: {
    includeInternal: boolean
    contestId?: string
    category?: ResourceCategory | ''
    year?: number
    availability?: ResourceAvailability | ''
    type?: string
  },
): Promise<Resource[]> {
  await ensureContestLibrarySeeded(db)

  const where: string[] = ['1=1']
  const values: unknown[] = []

  if (!input.includeInternal)
    where.push(`r.status = 'active'`)

  if (input.contestId) {
    values.push(input.contestId)
    where.push(`r.contest_id = $${values.length}`)
  }

  if (input.category) {
    values.push(input.category)
    where.push(`r.category = $${values.length}`)
  }

  if (input.year) {
    values.push(input.year)
    where.push(`r.year = $${values.length}`)
  }

  if (input.availability) {
    values.push(input.availability)
    where.push(`r.access_level = $${values.length}`)
  }

  if (input.type) {
    values.push(input.type)
    where.push(`r.category = $${values.length}`)
  }

  const result = await db.query<ResourceRow>(
    `SELECT
      r.id,
      r.contest_id,
      r.category,
      r.title,
      r.year,
      r.url,
      r.access_level,
      r.source_type,
      r.summary,
      r.content,
      r.metadata,
      r.copyright_note,
      r.status,
      r.created_at::TEXT,
      r.updated_at::TEXT
     FROM contest_resources r
     JOIN contests c ON c.id = r.contest_id
     WHERE ${where.join(' AND ')}
       AND ($${values.length + 1}::BOOLEAN = TRUE OR (c.status = 'published' AND c.visibility = 'public'))
     ORDER BY r.year DESC, r.created_at DESC`,
    [...values, input.includeInternal],
  )

  return result.rows.map(mapResource)
}

async function cleanupExpiredAuditLogs(db: Queryable): Promise<void> {
  const now = Date.now()
  if (now - lastAuditCleanupAt < AUDIT_CLEANUP_INTERVAL_MS)
    return

  lastAuditCleanupAt = now
  await db.query(
    `DELETE FROM contest_audit_logs
     WHERE created_at < NOW() - INTERVAL '${AUDIT_RETENTION_WINDOW}'`,
  )
}

async function appendAuditLog(
  db: Queryable,
  input: {
    actorUserId: string
    action: string
    contestId?: string
    resourceId?: string
    payload?: Record<string, unknown>
  },
): Promise<void> {
  await cleanupExpiredAuditLogs(db)

  const action = normalizeString(input.action)
  const shouldDedup = action.startsWith('read.') || action.startsWith('ai.invoke.')
  if (shouldDedup) {
    const dedupResult = await db.query<{ id: string }>(
      `SELECT id
       FROM contest_audit_logs
       WHERE actor_user_id = $1
         AND action = $2
         AND COALESCE(contest_id, '') = COALESCE($3::TEXT, '')
         AND COALESCE(resource_id, '') = COALESCE($4::TEXT, '')
         AND created_at >= NOW() - INTERVAL '${AUDIT_DEDUP_WINDOW}'
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        normalizeString(input.actorUserId),
        action,
        normalizeString(input.contestId) || null,
        normalizeString(input.resourceId) || null,
      ],
    )

    if (dedupResult.rows.length > 0)
      return
  }

  await db.query(
    `INSERT INTO contest_audit_logs (id, contest_id, resource_id, actor_user_id, action, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::JSONB, NOW())`,
    [
      randomUUID(),
      normalizeString(input.contestId) || null,
      normalizeString(input.resourceId) || null,
      normalizeString(input.actorUserId) || null,
      action,
      JSON.stringify(normalizeRecord(input.payload)),
    ],
  )
}

export async function recordContestAuditLog(
  db: Queryable,
  input: {
    actorUserId: string
    action: string
    contestId?: string
    resourceId?: string
    payload?: Record<string, unknown>
  },
): Promise<void> {
  await appendAuditLog(db, input)
}

export async function listAdminContestAuditLogs(
  db: Queryable,
  input: {
    contestId: string
    page?: number
    pageSize?: number
    action?: string
  },
): Promise<{ items: ContestAuditLog[], total: number, page: number, pageSize: number }> {
  await cleanupExpiredAuditLogs(db)

  const page = Math.max(1, Number(input.page || 1))
  const pageSize = Math.max(1, Math.min(100, Number(input.pageSize || 20)))
  const offset = (page - 1) * pageSize

  const where: string[] = ['contest_id = $1']
  const values: unknown[] = [input.contestId]

  if (normalizeString(input.action)) {
    values.push(`%${normalizeString(input.action)}%`)
    where.push(`action ILIKE $${values.length}`)
  }

  const countResult = await db.query<{ total: string }>(
    `SELECT COUNT(*)::TEXT AS total
     FROM contest_audit_logs
     WHERE ${where.join(' AND ')}`,
    values,
  )

  values.push(pageSize)
  values.push(offset)
  const itemsResult = await db.query<ContestAuditLogRow>(
    `SELECT
      id,
      contest_id,
      resource_id,
      actor_user_id,
      action,
      payload,
      created_at::TEXT
     FROM contest_audit_logs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1}
     OFFSET $${values.length}`,
    values,
  )

  return {
    items: itemsResult.rows.map(mapContestAuditLog),
    total: Number(countResult.rows[0]?.total || '0'),
    page,
    pageSize,
  }
}

export async function listAdminContests(
  db: Queryable,
  input: {
    status?: ContestStatus | ''
    q?: string
  } = {},
): Promise<Contest[]> {
  await ensureContestLibrarySeeded(db)

  const where: string[] = ['1=1']
  const values: unknown[] = []

  if (input.status) {
    values.push(input.status)
    where.push(`status = $${values.length}`)
  }

  if (normalizeString(input.q)) {
    values.push(`%${normalizeString(input.q)}%`)
    const idx = values.length
    where.push(`(
      name ILIKE $${idx}
      OR organizer ILIKE $${idx}
      OR official_url ILIKE $${idx}
      OR summary ILIKE $${idx}
      OR array_to_string(aliases, ' ') ILIKE $${idx}
      OR array_to_string(keywords, ' ') ILIKE $${idx}
    )`)
  }

  const rows = await db.query<ContestRow>(
    `SELECT
      id,
      name,
      aliases,
      level,
      disciplines,
      organizer,
      co_organizer,
      official_url,
      summary,
      participant_requirements,
      team_rule,
      current_season,
      status,
      visibility,
      hot_score,
      keywords,
      recommended_for,
      faq,
      faq_items,
      created_at::TEXT,
      updated_at::TEXT
     FROM contests
     WHERE ${where.join(' AND ')}
     ORDER BY updated_at DESC`,
    values,
  )

  const ids = rows.rows.map(item => item.id)
  const tracks = await loadTracks(db, ids, true)
  const timelines = await loadTimelines(db, ids)

  const trackMap = new Map<string, Track[]>()
  for (const row of tracks) {
    const list = trackMap.get(row.contest_id) || []
    list.push(mapTrack(row))
    trackMap.set(row.contest_id, list)
  }

  const timelineMap = new Map<string, ContestTimeline[]>()
  for (const row of timelines) {
    const list = timelineMap.get(row.contest_id) || []
    list.push(mapTimeline(row))
    timelineMap.set(row.contest_id, list)
  }

  return rows.rows.map(row => mapContest(row, trackMap.get(row.id) || [], timelineMap.get(row.id) || []))
}

export async function createAdminContest(
  db: Queryable,
  input: {
    actorUserId: string
    name: string
    level: ContestLevel
    organizer?: string
    coOrganizer?: string
    officialUrl?: string
    summary?: string
    participantRequirements?: string
    teamRule?: string
    currentSeason?: string
    disciplines?: string[]
    aliases?: string[]
    keywords?: string[]
    recommendedFor?: string[]
    faq?: string
    faqItems?: ContestFaqItem[]
    hotScore?: number
    visibility?: ContestVisibility
  },
): Promise<Contest> {
  const now = new Date().toISOString()
  const contestId = randomUUID()
  const officialUrl = normalizeString(input.officialUrl)
  if (!officialUrl)
    throw new Error('CONTEST_OFFICIAL_URL_REQUIRED')

  await db.query(
    `INSERT INTO contests (
      id,
      name,
      aliases,
      level,
      disciplines,
      organizer,
      co_organizer,
      official_url,
      summary,
      participant_requirements,
      team_rule,
      current_season,
      status,
      visibility,
      hot_score,
      keywords,
      recommended_for,
      faq,
      faq_items,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3::TEXT[], $4, $5::TEXT[], $6, $7, $8, $9, $10, $11, $12,
      'draft', $13, $14, $15::TEXT[], $16::TEXT[], $17, $18::JSONB, $19, $19, $20, $20
    )`,
    [
      contestId,
      input.name,
      normalizeStringArray(input.aliases),
      input.level,
      normalizeStringArray(input.disciplines),
      normalizeString(input.organizer),
      normalizeString(input.coOrganizer),
      officialUrl,
      normalizeString(input.summary),
      normalizeString(input.participantRequirements),
      normalizeString(input.teamRule),
      normalizeString(input.currentSeason) || String(new Date().getFullYear()),
      input.visibility || 'internal',
      Number(input.hotScore || 0),
      normalizeStringArray(input.keywords),
      normalizeStringArray(input.recommendedFor),
      normalizeString(input.faq),
      JSON.stringify(normalizeFaqItems(input.faqItems)),
      input.actorUserId,
      now,
    ],
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'contest.create',
    contestId,
    payload: {
      name: input.name,
      level: input.level,
    },
  })

  const detail = await getContestDetail(db, {
    contestId,
    includeInternal: true,
  })

  if (!detail)
    throw new Error('CONTEST_CREATE_FAILED')

  return detail.contest
}

export async function patchAdminContest(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    patch: {
      name?: string
      level?: ContestLevel
      organizer?: string
      coOrganizer?: string
      officialUrl?: string
      summary?: string
      participantRequirements?: string
      teamRule?: string
      currentSeason?: string
      disciplines?: string[]
      aliases?: string[]
      keywords?: string[]
      recommendedFor?: string[]
      faq?: string
      faqItems?: ContestFaqItem[]
      hotScore?: number
      visibility?: ContestVisibility
    }
  },
): Promise<Contest | null> {
  const values: unknown[] = [input.contestId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.name !== undefined)
    addSet('name', normalizeString(input.patch.name))
  if (input.patch.level !== undefined)
    addSet('level', input.patch.level)
  if (input.patch.organizer !== undefined)
    addSet('organizer', normalizeString(input.patch.organizer))
  if (input.patch.coOrganizer !== undefined)
    addSet('co_organizer', normalizeString(input.patch.coOrganizer))
  if (input.patch.officialUrl !== undefined)
    addSet('official_url', normalizeString(input.patch.officialUrl))
  if (input.patch.summary !== undefined)
    addSet('summary', normalizeString(input.patch.summary))
  if (input.patch.participantRequirements !== undefined)
    addSet('participant_requirements', normalizeString(input.patch.participantRequirements))
  if (input.patch.teamRule !== undefined)
    addSet('team_rule', normalizeString(input.patch.teamRule))
  if (input.patch.currentSeason !== undefined)
    addSet('current_season', normalizeString(input.patch.currentSeason))
  if (input.patch.disciplines !== undefined)
    addSet('disciplines', normalizeStringArray(input.patch.disciplines))
  if (input.patch.aliases !== undefined)
    addSet('aliases', normalizeStringArray(input.patch.aliases))
  if (input.patch.keywords !== undefined)
    addSet('keywords', normalizeStringArray(input.patch.keywords))
  if (input.patch.recommendedFor !== undefined)
    addSet('recommended_for', normalizeStringArray(input.patch.recommendedFor))
  if (input.patch.faq !== undefined)
    addSet('faq', normalizeString(input.patch.faq))
  if (input.patch.faqItems !== undefined)
    addSet('faq_items', JSON.stringify(normalizeFaqItems(input.patch.faqItems)))
  if (input.patch.hotScore !== undefined)
    addSet('hot_score', Number(input.patch.hotScore || 0))
  if (input.patch.visibility !== undefined)
    addSet('visibility', input.patch.visibility)

  if (sets.length === 0)
    return getContestDetail(db, { contestId: input.contestId, includeInternal: true }).then(item => item?.contest || null)

  addSet('updated_by_user_id', input.actorUserId)
  sets.push(`updated_at = NOW()`)

  await db.query(
    `UPDATE contests
     SET ${sets.join(', ')}
     WHERE id = $1`,
    values,
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'contest.patch',
    contestId: input.contestId,
    payload: input.patch as Record<string, unknown>,
  })

  const detail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: true,
  })

  return detail?.contest || null
}

export async function getContestPublishCheck(
  db: Queryable,
  input: {
    contestId: string
  },
): Promise<PublishCheckResult | null> {
  await ensureContestLibrarySeeded(db)

  const detail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: true,
  })

  if (!detail)
    return null

  const blockers: PublishCheckResult['blockers'] = []
  const warnings: PublishCheckResult['warnings'] = []
  const contest = detail.contest

  const pushBlocker = (code: string, message: string, field?: string) => {
    blockers.push({ code, message, field, severity: 'blocker' })
  }

  const pushWarning = (code: string, message: string, field?: string) => {
    warnings.push({ code, message, field, severity: 'warning' })
  }

  const checks: boolean[] = []
  const hasName = Boolean(normalizeString(contest.name))
  checks.push(hasName)
  if (!hasName)
    pushBlocker('CONTEST_NAME_REQUIRED', '赛事名称不能为空。', 'name')

  const hasLevel = Boolean(normalizeString(contest.level))
  checks.push(hasLevel)
  if (!hasLevel)
    pushBlocker('CONTEST_LEVEL_REQUIRED', '赛事级别不能为空。', 'level')

  const hasOrganizer = Boolean(normalizeString(contest.organizer))
  checks.push(hasOrganizer)
  if (!hasOrganizer)
    pushBlocker('CONTEST_ORGANIZER_REQUIRED', '主办方不能为空。', 'organizer')

  const hasOfficialUrl = Boolean(normalizeString(contest.officialUrl))
  checks.push(hasOfficialUrl)
  if (!hasOfficialUrl)
    pushBlocker('CONTEST_OFFICIAL_URL_REQUIRED', '官网链接不能为空。', 'officialUrl')

  const hasSummary = Boolean(normalizeString(contest.summary))
  checks.push(hasSummary)
  if (!hasSummary)
    pushBlocker('CONTEST_SUMMARY_REQUIRED', '简介不能为空。', 'summary')

  const hasParticipantRequirements = Boolean(normalizeString(contest.participantRequirements))
  checks.push(hasParticipantRequirements)
  if (!hasParticipantRequirements)
    pushBlocker('CONTEST_PARTICIPANT_REQUIREMENTS_REQUIRED', '参赛对象/限制不能为空。', 'participantRequirements')

  const hasCurrentSeason = Boolean(normalizeString(contest.currentSeason))
  checks.push(hasCurrentSeason)
  if (!hasCurrentSeason)
    pushBlocker('CONTEST_CURRENT_SEASON_REQUIRED', '当前届次不能为空。', 'currentSeason')

  const disciplines = normalizeStringArray(contest.disciplines)
  const hasDisciplines = disciplines.length > 0
  checks.push(hasDisciplines)
  if (!hasDisciplines)
    pushBlocker('CONTEST_DISCIPLINES_REQUIRED', '学科门类至少填写 1 项。', 'disciplines')

  const hasTracks = (contest.tracks || []).length > 0
  checks.push(hasTracks)
  if (!hasTracks)
    pushBlocker('CONTEST_TRACKS_REQUIRED', '至少需要 1 个赛道。', 'tracks')

  const hasTimelines = (detail.timelines || []).length > 0
  checks.push(hasTimelines)
  if (!hasTimelines)
    pushBlocker('CONTEST_TIMELINES_REQUIRED', '至少需要 1 个时间节点。', 'timelines')

  const hasRubrics = (detail.rubrics || []).length > 0
  checks.push(hasRubrics)
  if (!hasRubrics)
    pushBlocker('CONTEST_RUBRICS_REQUIRED', '至少需要 1 条评分规则。', 'rubrics')

  const hasDedupKey = hasName && hasOrganizer && hasOfficialUrl
  if (!hasDedupKey) {
    pushWarning('CONTEST_DEDUPE_KEY_INCOMPLETE', '去重键不完整（名称+主办方+官网），发布前建议补全。', 'officialUrl')
  }
  else {
    const rows = await db.query<{ id: string, name: string, organizer: string, official_url: string }>(
      `SELECT id, name, organizer, official_url
       FROM contests
       WHERE id <> $1
         AND status <> 'archived'`,
      [input.contestId],
    )
    const targetKey = [
      normalizeCompareValue(contest.name),
      normalizeCompareValue(contest.organizer),
      normalizeCompareValue(contest.officialUrl),
    ].join('|')
    const duplicate = rows.rows.find((row) => {
      const rowKey = [
        normalizeCompareValue(row.name),
        normalizeCompareValue(row.organizer),
        normalizeCompareValue(row.official_url),
      ].join('|')
      return rowKey === targetKey
    })
    if (duplicate) {
      pushBlocker(
        'CONTEST_DUPLICATED',
        `检测到重复竞赛（ID: ${duplicate.id}），请核对名称/主办方/官网组合。`,
        'officialUrl',
      )
    }
  }

  const faqItems = normalizeFaqItems(contest.faqItems)
  if (faqItems.length === 0) {
    pushWarning('CONTEST_FAQ_ITEMS_EMPTY', '当前未配置结构化 FAQ 条目，建议补充。', 'faqItems')
  }
  else if (faqItems.some(item => !item.question || !item.answer)) {
    pushWarning('CONTEST_FAQ_ITEMS_INCOMPLETE', '存在 FAQ 条目未同时填写问题与答案。', 'faqItems')
  }

  const passedCount = checks.filter(Boolean).length
  const completion = Math.round((passedCount / checks.length) * 100)

  return {
    contestId: input.contestId,
    canPublish: blockers.length === 0,
    completion,
    blockers,
    warnings,
  }
}

export async function publishAdminContest(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
  },
): Promise<Contest | null> {
  const publishCheck = await getContestPublishCheck(db, { contestId: input.contestId })
  if (!publishCheck)
    return null
  if (!publishCheck.canPublish) {
    const error = new Error('PUBLISH_CHECK_FAILED')
    ;(error as Error & { publishCheck?: PublishCheckResult }).publishCheck = publishCheck
    throw error
  }

  await db.query(
    `UPDATE contests
     SET status = 'published',
         visibility = 'public',
         published_at = NOW(),
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.contestId, input.actorUserId],
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'contest.publish',
    contestId: input.contestId,
  })

  const detail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: true,
  })

  return detail?.contest || null
}

export async function archiveAdminContest(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
  },
): Promise<Contest | null> {
  await db.query(
    `UPDATE contests
     SET status = 'archived',
         visibility = 'internal',
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.contestId, input.actorUserId],
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'contest.archive',
    contestId: input.contestId,
  })

  const detail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: true,
  })

  return detail?.contest || null
}

export async function listAdminTracks(db: Queryable, contestId: string): Promise<Track[]> {
  const tracks = await loadTracks(db, [contestId], true)
  return tracks.map(mapTrack)
}

export async function createAdminTrack(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    name: string
    summary?: string
    suitableMajors?: string[]
    deliverableTypes?: string[]
    rubricId?: string | null
    sortOrder?: number
    status?: ContestStatus
  },
): Promise<Track> {
  const trackId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO contest_tracks (
      id,
      contest_id,
      name,
      summary,
      suitable_majors,
      deliverable_types,
      rubric_id,
      sort_order,
      status,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5::TEXT[], $6::TEXT[], $7, $8, $9, $10, $10
    )`,
    [
      trackId,
      input.contestId,
      normalizeString(input.name),
      normalizeString(input.summary),
      normalizeStringArray(input.suitableMajors),
      normalizeStringArray(input.deliverableTypes),
      normalizeString(input.rubricId) || null,
      Number(input.sortOrder || 0),
      input.status || 'draft',
      now,
    ],
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'track.create',
    contestId: input.contestId,
    payload: {
      trackId,
      name: input.name,
    },
  })

  const result = await db.query<TrackRow>(
    `SELECT id, contest_id, name, summary, suitable_majors, deliverable_types, rubric_id, sort_order, status
     FROM contest_tracks
     WHERE id = $1
     LIMIT 1`,
    [trackId],
  )

  return mapTrack(result.rows[0]!)
}

export async function patchAdminTrack(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    trackId: string
    patch: {
      name?: string
      summary?: string
      suitableMajors?: string[]
      deliverableTypes?: string[]
      rubricId?: string | null
      sortOrder?: number
      status?: ContestStatus
    }
  },
): Promise<Track | null> {
  const values: unknown[] = [input.trackId, input.contestId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.name !== undefined)
    addSet('name', normalizeString(input.patch.name))
  if (input.patch.summary !== undefined)
    addSet('summary', normalizeString(input.patch.summary))
  if (input.patch.suitableMajors !== undefined)
    addSet('suitable_majors', normalizeStringArray(input.patch.suitableMajors))
  if (input.patch.deliverableTypes !== undefined)
    addSet('deliverable_types', normalizeStringArray(input.patch.deliverableTypes))
  if (input.patch.rubricId !== undefined)
    addSet('rubric_id', normalizeString(input.patch.rubricId) || null)
  if (input.patch.sortOrder !== undefined)
    addSet('sort_order', Number(input.patch.sortOrder || 0))
  if (input.patch.status !== undefined)
    addSet('status', input.patch.status)

  if (sets.length === 0)
    return null

  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE contest_tracks
     SET ${sets.join(', ')}
     WHERE id = $1 AND contest_id = $2`,
    values,
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'track.patch',
    contestId: input.contestId,
    payload: {
      trackId: input.trackId,
      ...input.patch,
    },
  })

  const result = await db.query<TrackRow>(
    `SELECT id, contest_id, name, summary, suitable_majors, deliverable_types, rubric_id, sort_order, status
     FROM contest_tracks
     WHERE id = $1 AND contest_id = $2
     LIMIT 1`,
    [input.trackId, input.contestId],
  )

  const row = result.rows[0]
  return row ? mapTrack(row) : null
}

export async function listAdminTimelines(db: Queryable, contestId: string): Promise<ContestTimeline[]> {
  const rows = await loadTimelines(db, [contestId])
  return rows.map(mapTimeline)
}

export async function createAdminTimeline(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    year: number
    nodeType: TimelineNodeType
    startAt?: string | null
    endAt?: string | null
    note?: string
    sourceLink?: string
  },
): Promise<ContestTimeline> {
  const timelineId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO contest_timelines (
      id,
      contest_id,
      year,
      node_type,
      start_at,
      end_at,
      note,
      source_link,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [
      timelineId,
      input.contestId,
      Number(input.year || new Date().getFullYear()),
      input.nodeType,
      input.startAt || null,
      input.endAt || null,
      normalizeString(input.note),
      normalizeString(input.sourceLink),
      now,
    ],
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'timeline.create',
    contestId: input.contestId,
    payload: {
      timelineId,
      nodeType: input.nodeType,
    },
  })

  const result = await db.query<TimelineRow>(
    `SELECT id, contest_id, year, node_type, start_at::TEXT, end_at::TEXT, note, source_link
     FROM contest_timelines
     WHERE id = $1
     LIMIT 1`,
    [timelineId],
  )

  return mapTimeline(result.rows[0]!)
}

export async function patchAdminTimeline(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    timelineId: string
    patch: {
      year?: number
      nodeType?: TimelineNodeType
      startAt?: string | null
      endAt?: string | null
      note?: string
      sourceLink?: string
    }
  },
): Promise<ContestTimeline | null> {
  const values: unknown[] = [input.timelineId, input.contestId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.year !== undefined)
    addSet('year', Number(input.patch.year || new Date().getFullYear()))
  if (input.patch.nodeType !== undefined)
    addSet('node_type', input.patch.nodeType)
  if (input.patch.startAt !== undefined)
    addSet('start_at', input.patch.startAt || null)
  if (input.patch.endAt !== undefined)
    addSet('end_at', input.patch.endAt || null)
  if (input.patch.note !== undefined)
    addSet('note', normalizeString(input.patch.note))
  if (input.patch.sourceLink !== undefined)
    addSet('source_link', normalizeString(input.patch.sourceLink))

  if (sets.length === 0)
    return null

  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE contest_timelines
     SET ${sets.join(', ')}
     WHERE id = $1 AND contest_id = $2`,
    values,
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'timeline.patch',
    contestId: input.contestId,
    payload: {
      timelineId: input.timelineId,
      ...input.patch,
    },
  })

  const result = await db.query<TimelineRow>(
    `SELECT id, contest_id, year, node_type, start_at::TEXT, end_at::TEXT, note, source_link
     FROM contest_timelines
     WHERE id = $1 AND contest_id = $2
     LIMIT 1`,
    [input.timelineId, input.contestId],
  )

  const row = result.rows[0]
  return row ? mapTimeline(row) : null
}

function validateRubricDimensions(dimensions: RubricDimension[], scoringMode: RubricScoringMode = 'weighted'): void {
  if (!Array.isArray(dimensions) || dimensions.length === 0)
    throw new Error('RUBRIC_DIMENSIONS_REQUIRED')

  const normalized = dimensions.map(item => normalizeDimension(item))
  const nameSet = new Set<string>()
  let totalWeight = 0

  for (const item of normalized) {
    const name = normalizeString(item.name)
    if (!name)
      throw new Error('RUBRIC_DIMENSION_NAME_REQUIRED')
    if (nameSet.has(name))
      throw new Error('RUBRIC_DIMENSION_NAME_DUPLICATED')
    nameSet.add(name)

    if (scoringMode === 'weighted') {
      const weight = Number(item.weight)
      if (!Number.isFinite(weight) || weight <= 0)
        throw new Error('RUBRIC_DIMENSION_WEIGHT_INVALID')
      totalWeight += weight
    }
    else if (item.weight !== undefined && (!Number.isFinite(Number(item.weight)) || Number(item.weight) < 0)) {
      throw new Error('RUBRIC_DIMENSION_WEIGHT_INVALID')
    }
  }

  if (scoringMode === 'weighted' && Math.round(totalWeight) !== 100)
    throw new Error('RUBRIC_WEIGHT_SUM_INVALID')
}

export async function listAdminRubrics(db: Queryable, contestId: string): Promise<Rubric[]> {
  const result = await db.query<RubricRow>(
    `SELECT
      id,
      contest_id,
      track_id,
      scoring_mode,
      version,
      dimensions,
      scoring_points,
      deduction_items,
      evidence_requirements,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_rubrics
     WHERE contest_id = $1
     ORDER BY updated_at DESC`,
    [contestId],
  )

  return result.rows.map(mapRubric)
}

export async function createAdminRubric(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    trackId: string
    scoringMode?: RubricScoringMode
    version?: number
    dimensions: RubricDimension[]
    scoringPoints?: string[]
    deductionItems?: string[]
    evidenceRequirements?: string[]
    status?: ContestStatus
  },
): Promise<Rubric> {
  const scoringMode: RubricScoringMode = input.scoringMode || 'weighted'
  validateRubricDimensions(input.dimensions, scoringMode)

  const rubricId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO contest_rubrics (
      id,
      contest_id,
      track_id,
      scoring_mode,
      version,
      dimensions,
      scoring_points,
      deduction_items,
      evidence_requirements,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::JSONB, $7::TEXT[], $8::TEXT[], $9::TEXT[],
      $10, $11, $11, $12, $12
    )`,
    [
      rubricId,
      input.contestId,
      input.trackId,
      scoringMode,
      Number(input.version || 1),
      JSON.stringify(input.dimensions.map(item => normalizeDimension(item))),
      normalizeStringArray(input.scoringPoints),
      normalizeStringArray(input.deductionItems),
      normalizeStringArray(input.evidenceRequirements),
      input.status || 'draft',
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `UPDATE contest_tracks
     SET rubric_id = $1,
         updated_at = NOW()
     WHERE id = $2
       AND contest_id = $3`,
    [rubricId, input.trackId, input.contestId],
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'rubric.create',
    contestId: input.contestId,
    payload: {
      rubricId,
      trackId: input.trackId,
    },
  })

  const result = await db.query<RubricRow>(
    `SELECT
      id,
      contest_id,
      track_id,
      scoring_mode,
      version,
      dimensions,
      scoring_points,
      deduction_items,
      evidence_requirements,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_rubrics
     WHERE id = $1
     LIMIT 1`,
    [rubricId],
  )

  return mapRubric(result.rows[0]!)
}

export async function patchAdminRubric(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    rubricId: string
    patch: {
      trackId?: string
      scoringMode?: RubricScoringMode
      version?: number
      dimensions?: RubricDimension[]
      scoringPoints?: string[]
      deductionItems?: string[]
      evidenceRequirements?: string[]
      status?: ContestStatus
    }
  },
): Promise<Rubric | null> {
  if (input.patch.dimensions) {
    let scoringModeForValidation: RubricScoringMode | undefined = input.patch.scoringMode
    if (!scoringModeForValidation) {
      const modeResult = await db.query<{ scoring_mode: RubricScoringMode }>(
        `SELECT scoring_mode
         FROM contest_rubrics
         WHERE id = $1 AND contest_id = $2
         LIMIT 1`,
        [input.rubricId, input.contestId],
      )
      scoringModeForValidation = modeResult.rows[0]?.scoring_mode || 'weighted'
    }
    validateRubricDimensions(input.patch.dimensions, scoringModeForValidation)
  }

  const values: unknown[] = [input.rubricId, input.contestId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.trackId !== undefined)
    addSet('track_id', input.patch.trackId)
  if (input.patch.scoringMode !== undefined)
    addSet('scoring_mode', input.patch.scoringMode)
  if (input.patch.version !== undefined)
    addSet('version', Number(input.patch.version || 1))
  if (input.patch.dimensions !== undefined)
    addSet('dimensions', JSON.stringify(input.patch.dimensions.map(item => normalizeDimension(item))))
  if (input.patch.scoringPoints !== undefined)
    addSet('scoring_points', normalizeStringArray(input.patch.scoringPoints))
  if (input.patch.deductionItems !== undefined)
    addSet('deduction_items', normalizeStringArray(input.patch.deductionItems))
  if (input.patch.evidenceRequirements !== undefined)
    addSet('evidence_requirements', normalizeStringArray(input.patch.evidenceRequirements))
  if (input.patch.status !== undefined)
    addSet('status', input.patch.status)

  if (sets.length === 0)
    return null

  addSet('updated_by_user_id', input.actorUserId)
  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE contest_rubrics
     SET ${sets.join(', ')}
     WHERE id = $1 AND contest_id = $2`,
    values,
  )

  if (input.patch.trackId) {
    await db.query(
      `UPDATE contest_tracks
       SET rubric_id = $1,
           updated_at = NOW()
       WHERE id = $2
         AND contest_id = $3`,
      [input.rubricId, input.patch.trackId, input.contestId],
    )
  }

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'rubric.patch',
    contestId: input.contestId,
    payload: {
      rubricId: input.rubricId,
      ...input.patch,
    },
  })

  const result = await db.query<RubricRow>(
    `SELECT
      id,
      contest_id,
      track_id,
      scoring_mode,
      version,
      dimensions,
      scoring_points,
      deduction_items,
      evidence_requirements,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_rubrics
     WHERE id = $1 AND contest_id = $2
     LIMIT 1`,
    [input.rubricId, input.contestId],
  )

  const row = result.rows[0]
  return row ? mapRubric(row) : null
}

export async function listAdminResources(
  db: Queryable,
  input: {
    contestId: string
    status?: ResourceStatus | ''
    category?: ResourceCategory | ''
  },
): Promise<Resource[]> {
  const where: string[] = ['contest_id = $1']
  const values: unknown[] = [input.contestId]

  if (input.status) {
    values.push(input.status)
    where.push(`status = $${values.length}`)
  }

  if (input.category) {
    values.push(input.category)
    where.push(`category = $${values.length}`)
  }

  const result = await db.query<ResourceRow>(
    `SELECT
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resources
     WHERE ${where.join(' AND ')}
     ORDER BY year DESC, updated_at DESC`,
    values,
  )

  return result.rows.map(mapResource)
}

export async function createAdminResource(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    category: ResourceCategory
    title: string
    year: number
    url?: string
    accessLevel?: ResourceAvailability
    sourceType?: string
    summary?: string
    content?: string
    metadata?: Record<string, unknown>
    copyrightNote?: string
    status?: ResourceStatus
  },
): Promise<Resource> {
  const resourceId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO contest_resources (
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB, $12, $13, $14, $14, $15, $15
    )`,
    [
      resourceId,
      input.contestId,
      input.category,
      normalizeString(input.title),
      Number(input.year || new Date().getFullYear()),
      normalizeString(input.url),
      input.accessLevel || 'public',
      normalizeString(input.sourceType) || 'official',
      normalizeString(input.summary),
      normalizeString(input.content),
      JSON.stringify(parseResourceMetadata(input.metadata)),
      normalizeString(input.copyrightNote),
      input.status || 'active',
      input.actorUserId,
      now,
    ],
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'resource.create',
    contestId: input.contestId,
    resourceId,
  })

  const result = await db.query<ResourceRow>(
    `SELECT
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resources
     WHERE id = $1
     LIMIT 1`,
    [resourceId],
  )

  return mapResource(result.rows[0]!)
}

export async function patchAdminResource(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    resourceId: string
    patch: {
      category?: ResourceCategory
      title?: string
      year?: number
      url?: string
      accessLevel?: ResourceAvailability
      sourceType?: string
      summary?: string
      content?: string
      metadata?: Record<string, unknown>
      copyrightNote?: string
      status?: ResourceStatus
    }
  },
): Promise<Resource | null> {
  const values: unknown[] = [input.resourceId, input.contestId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.category !== undefined)
    addSet('category', input.patch.category)
  if (input.patch.title !== undefined)
    addSet('title', normalizeString(input.patch.title))
  if (input.patch.year !== undefined)
    addSet('year', Number(input.patch.year || new Date().getFullYear()))
  if (input.patch.url !== undefined)
    addSet('url', normalizeString(input.patch.url))
  if (input.patch.accessLevel !== undefined)
    addSet('access_level', input.patch.accessLevel)
  if (input.patch.sourceType !== undefined)
    addSet('source_type', normalizeString(input.patch.sourceType))
  if (input.patch.summary !== undefined)
    addSet('summary', normalizeString(input.patch.summary))
  if (input.patch.content !== undefined)
    addSet('content', normalizeString(input.patch.content))
  if (input.patch.metadata !== undefined)
    addSet('metadata', JSON.stringify(parseResourceMetadata(input.patch.metadata)))
  if (input.patch.copyrightNote !== undefined)
    addSet('copyright_note', normalizeString(input.patch.copyrightNote))
  if (input.patch.status !== undefined)
    addSet('status', input.patch.status)

  if (sets.length === 0)
    return null

  addSet('updated_by_user_id', input.actorUserId)
  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE contest_resources
     SET ${sets.join(', ')}
     WHERE id = $1 AND contest_id = $2`,
    values,
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'resource.patch',
    contestId: input.contestId,
    resourceId: input.resourceId,
    payload: input.patch as Record<string, unknown>,
  })

  const result = await db.query<ResourceRow>(
    `SELECT
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resources
     WHERE id = $1 AND contest_id = $2
     LIMIT 1`,
    [input.resourceId, input.contestId],
  )

  const row = result.rows[0]
  return row ? mapResource(row) : null
}

export async function markResourceInvalid(
  db: Queryable,
  input: {
    actorUserId: string
    resourceId: string
    reason?: string
  },
): Promise<Resource | null> {
  await db.query(
    `UPDATE contest_resources
     SET status = 'invalid',
         summary = CASE
           WHEN $2::TEXT = '' THEN summary
           ELSE CONCAT(summary, '\\n[失效说明] ', $2)
         END,
         updated_by_user_id = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [input.resourceId, normalizeString(input.reason), input.actorUserId],
  )

  const result = await db.query<ResourceRow>(
    `SELECT
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resources
     WHERE id = $1
     LIMIT 1`,
    [input.resourceId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'resource.mark_invalid',
    contestId: row.contest_id,
    resourceId: row.id,
    payload: {
      reason: normalizeString(input.reason),
    },
  })

  return mapResource(row)
}

const AI_PROMPT_TARGETS: AiPromptTarget[] = ['contest_filter', 'project_chat']

function normalizeAiPromptTarget(value: unknown): AiPromptTarget | null {
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized)
    return null
  if (normalized === 'project-chat')
    return 'project_chat'
  const matched = AI_PROMPT_TARGETS.find(item => item === normalized)
  return matched || null
}

function toAiPromptSpec(row: ResourceRow): AiPromptSpec | null {
  const metadata = parseResourceMetadata(row.metadata)
  const target = normalizeAiPromptTarget(metadata.target || metadata.scene || metadata.channel)
  if (!target)
    return null

  const prompt = normalizeString(metadata.prompt || row.content || row.summary)
  if (!prompt)
    return null

  const explicitScope = normalizeString(metadata.scope).toLowerCase()
  const trackId = normalizeString(metadata.trackId || metadata.track_id)
  const scope = explicitScope === 'track' || trackId ? 'track' : 'contest'
  const priority = Number(metadata.priority || 0)

  return {
    target,
    prompt,
    trackId,
    scope,
    priority: Number.isFinite(priority) ? priority : 0,
    enabled: metadata.enabled !== false,
  }
}

export async function resolveAiPromptText(
  db: Queryable,
  input: {
    contestId?: string
    trackId?: string
    target: AiPromptTarget
  },
): Promise<string> {
  const contestId = normalizeString(input.contestId)
  if (!contestId)
    return ''

  const result = await db.query<ResourceRow>(
    `SELECT
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resources
     WHERE contest_id = $1
       AND category = 'ai_prompts'
       AND status = 'active'
     ORDER BY updated_at DESC, year DESC`,
    [contestId],
  )

  const specs = result.rows
    .map(toAiPromptSpec)
    .filter((item): item is AiPromptSpec => Boolean(item))
    .filter(item => item.enabled && item.target === input.target)

  if (specs.length === 0)
    return ''

  const contestPrompts = specs
    .filter(item => item.scope === 'contest')
    .sort((a, b) => b.priority - a.priority)
    .map(item => item.prompt)

  const trackId = normalizeString(input.trackId)
  const trackPrompts = specs
    .filter(item => item.scope === 'track' && trackId && item.trackId === trackId)
    .sort((a, b) => b.priority - a.priority)
    .map(item => item.prompt)

  return [...contestPrompts, ...trackPrompts]
    .filter(Boolean)
    .join('\n\n')
}

export async function listBillingPlans(db: Queryable, includeInactive = true): Promise<BillingPlan[]> {
  await ensureDefaultBillingPlans(db)

  const result = await db.query<BillingPlanRow>(
    `SELECT
      id,
      code,
      name,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      is_active,
      created_at::TEXT,
      updated_at::TEXT
     FROM billing_plans
     WHERE ($1::BOOLEAN = TRUE OR is_active = TRUE)
     ORDER BY is_active DESC, created_at ASC`,
    [includeInactive],
  )

  return result.rows.map(mapBillingPlan)
}

export async function createBillingPlan(
  db: Queryable,
  input: {
    code: string
    name: string
    basePriceCents: number
    includedSeats: number
    extraSeatPriceCents: number
    includedAiQuota: number
    isActive?: boolean
  },
): Promise<BillingPlan> {
  const now = new Date().toISOString()
  const planId = randomUUID()

  await db.query(
    `INSERT INTO billing_plans (
      id,
      code,
      name,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $9
    )`,
    [
      planId,
      normalizeString(input.code),
      normalizeString(input.name),
      Math.max(0, Number(input.basePriceCents || 0)),
      Math.max(0, Number(input.includedSeats || 0)),
      Math.max(0, Number(input.extraSeatPriceCents || 0)),
      Math.max(0, Number(input.includedAiQuota || 0)),
      input.isActive !== false,
      now,
    ],
  )

  const result = await db.query<BillingPlanRow>(
    `SELECT
      id,
      code,
      name,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      is_active,
      created_at::TEXT,
      updated_at::TEXT
     FROM billing_plans
     WHERE id = $1
     LIMIT 1`,
    [planId],
  )

  return mapBillingPlan(result.rows[0]!)
}

export async function patchBillingPlan(
  db: Queryable,
  input: {
    planId: string
    patch: {
      code?: string
      name?: string
      basePriceCents?: number
      includedSeats?: number
      extraSeatPriceCents?: number
      includedAiQuota?: number
      isActive?: boolean
    }
  },
): Promise<BillingPlan | null> {
  const values: unknown[] = [input.planId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.code !== undefined)
    addSet('code', normalizeString(input.patch.code))
  if (input.patch.name !== undefined)
    addSet('name', normalizeString(input.patch.name))
  if (input.patch.basePriceCents !== undefined)
    addSet('base_price_cents', Math.max(0, Number(input.patch.basePriceCents || 0)))
  if (input.patch.includedSeats !== undefined)
    addSet('included_seats', Math.max(0, Number(input.patch.includedSeats || 0)))
  if (input.patch.extraSeatPriceCents !== undefined)
    addSet('extra_seat_price_cents', Math.max(0, Number(input.patch.extraSeatPriceCents || 0)))
  if (input.patch.includedAiQuota !== undefined)
    addSet('included_ai_quota', Math.max(0, Number(input.patch.includedAiQuota || 0)))
  if (input.patch.isActive !== undefined)
    addSet('is_active', input.patch.isActive)

  if (sets.length === 0)
    return null

  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE billing_plans
     SET ${sets.join(', ')}
     WHERE id = $1`,
    values,
  )

  const result = await db.query<BillingPlanRow>(
    `SELECT
      id,
      code,
      name,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      is_active,
      created_at::TEXT,
      updated_at::TEXT
     FROM billing_plans
     WHERE id = $1
     LIMIT 1`,
    [input.planId],
  )

  const row = result.rows[0]
  return row ? mapBillingPlan(row) : null
}

async function resolveWorkspacePlan(
  db: Queryable,
  workspaceId: string,
): Promise<BillingPlan | null> {
  const existing = await db.query<{
    plan_id: string | null
  }>(
    'SELECT plan_id FROM workspace_billing WHERE workspace_id = $1 LIMIT 1',
    [workspaceId],
  )

  const planId = existing.rows[0]?.plan_id || null

  if (planId) {
    const result = await db.query<BillingPlanRow>(
      `SELECT
        id,
        code,
        name,
        base_price_cents,
        included_seats,
        extra_seat_price_cents,
        included_ai_quota,
        is_active,
        created_at::TEXT,
        updated_at::TEXT
       FROM billing_plans
       WHERE id = $1
       LIMIT 1`,
      [planId],
    )

    const row = result.rows[0]
    return row ? mapBillingPlan(row) : null
  }

  const firstActive = await db.query<BillingPlanRow>(
    `SELECT
      id,
      code,
      name,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      is_active,
      created_at::TEXT,
      updated_at::TEXT
     FROM billing_plans
     WHERE is_active = TRUE
     ORDER BY created_at ASC
     LIMIT 1`,
  )

  const plan = firstActive.rows[0] ? mapBillingPlan(firstActive.rows[0]) : null

  if (plan) {
    await db.query(
      `INSERT INTO workspace_billing (
        workspace_id,
        plan_id,
        billing_cycle,
        estimated_amount_cents,
        snapshot_seat_used,
        snapshot_seat_limit,
        snapshot_ai_quota_total,
        updated_at
      ) VALUES (
        $1, $2, 'monthly', 0, 0, 0, 0, NOW()
      )
      ON CONFLICT (workspace_id)
      DO UPDATE SET plan_id = EXCLUDED.plan_id, updated_at = EXCLUDED.updated_at`,
      [workspaceId, plan.id],
    )
  }

  return plan
}

export async function estimateWorkspaceBilling(
  db: Queryable,
  input: {
    workspaceId: string
  },
): Promise<WorkspaceBillingEstimate | null> {
  await ensureDefaultBillingPlans(db)

  const quotaResult = await db.query<{
    seat_used: number
    seat_limit: number
    ai_quota_total: number
  }>(
    `SELECT seat_used, seat_limit, ai_quota_total
     FROM team_quotas
     WHERE workspace_id = $1
     LIMIT 1`,
    [input.workspaceId],
  )

  const quota = quotaResult.rows[0]
  if (!quota)
    return null

  const plan = await resolveWorkspacePlan(db, input.workspaceId)

  const seatUsed = Number(quota.seat_used || 0)
  const includedSeats = Number(plan?.includedSeats || 0)
  const extraSeats = Math.max(0, seatUsed - includedSeats)
  const basePriceCents = Number(plan?.basePriceCents || 0)
  const extraSeatPriceCents = Number(plan?.extraSeatPriceCents || 0)
  const estimatedAmountCents = basePriceCents + extraSeats * extraSeatPriceCents
  const aiQuotaTotal = Number(quota.ai_quota_total || 0)
  const includedAiQuota = Number(plan?.includedAiQuota || 0)

  await db.query(
    `INSERT INTO workspace_billing (
      workspace_id,
      plan_id,
      billing_cycle,
      estimated_amount_cents,
      snapshot_seat_used,
      snapshot_seat_limit,
      snapshot_ai_quota_total,
      updated_at
    ) VALUES (
      $1,
      $2,
      'monthly',
      $3,
      $4,
      $5,
      $6,
      NOW()
    )
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      estimated_amount_cents = EXCLUDED.estimated_amount_cents,
      snapshot_seat_used = EXCLUDED.snapshot_seat_used,
      snapshot_seat_limit = EXCLUDED.snapshot_seat_limit,
      snapshot_ai_quota_total = EXCLUDED.snapshot_ai_quota_total,
      updated_at = EXCLUDED.updated_at`,
    [
      input.workspaceId,
      plan?.id || null,
      estimatedAmountCents,
      seatUsed,
      Number(quota.seat_limit || 0),
      aiQuotaTotal,
    ],
  )

  const billingResult = await db.query<{
    billing_cycle: string
    updated_at: string
  }>(
    `SELECT billing_cycle, updated_at::TEXT
     FROM workspace_billing
     WHERE workspace_id = $1
     LIMIT 1`,
    [input.workspaceId],
  )

  return {
    workspaceId: input.workspaceId,
    planId: plan?.id || null,
    planCode: plan?.code || null,
    billingCycle: (billingResult.rows[0]?.billing_cycle || 'monthly') as 'monthly',
    seatUsed,
    includedSeats,
    extraSeats,
    basePriceCents,
    extraSeatPriceCents,
    estimatedAmountCents,
    estimatedAmountYuan: Number((estimatedAmountCents / 100).toFixed(2)),
    aiQuotaTotal,
    includedAiQuota,
    updatedAt: billingResult.rows[0]?.updated_at || new Date().toISOString(),
  }
}

export async function setWorkspaceBillingPlan(
  db: Queryable,
  input: {
    workspaceId: string
    planId: string
    billingCycle?: 'monthly' | 'quarterly' | 'yearly'
  },
): Promise<void> {
  await db.query(
    `INSERT INTO workspace_billing (
      workspace_id,
      plan_id,
      billing_cycle,
      estimated_amount_cents,
      snapshot_seat_used,
      snapshot_seat_limit,
      snapshot_ai_quota_total,
      updated_at
    ) VALUES ($1, $2, $3, 0, 0, 0, 0, NOW())
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      billing_cycle = EXCLUDED.billing_cycle,
      updated_at = EXCLUDED.updated_at`,
    [input.workspaceId, input.planId, input.billingCycle || 'monthly'],
  )
}

export async function getPublishedRubricByTrack(
  db: Queryable,
  input: {
    contestId: string
    trackId: string
  },
): Promise<Rubric | null> {
  await ensureContestLibrarySeeded(db)

  const result = await db.query<RubricRow>(
    `SELECT
      id,
      contest_id,
      track_id,
      scoring_mode,
      version,
      dimensions,
      scoring_points,
      deduction_items,
      evidence_requirements,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_rubrics
     WHERE contest_id = $1
       AND track_id = $2
       AND status = 'published'
     ORDER BY version DESC, updated_at DESC
     LIMIT 1`,
    [input.contestId, input.trackId],
  )

  const row = result.rows[0]
  return row ? mapRubric(row) : null
}
