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
  FeishuBitableSyncItemEntityType,
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
  TrackTimeline,
  WorkspaceBillingEstimate,
  WorkspaceBillingOrder,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { listContests as listCatalogContests, listResources as listCatalogResources, listRubrics as listCatalogRubrics } from '~~/server/data/catalog'
import { readPlatformRuntimeOverrides } from '~~/server/utils/platform-runtime-config-store'

const CONTEST_LIBRARY_MIGRATION_KEY = 'contest_library_seeded_v2'

const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  platform_super_admin: [
    'contest.read_internal',
    'contest.write',
    'contest.publish',
    'contest.archive',
    'pricing.write',
    'user.read',
    'user.write',
    'user.status.write',
    'user.security.write',
    'role.assign',
    'role.super.assign',
  ],
  user_admin: [
    'user.read',
    'user.write',
    'user.status.write',
    'user.security.write',
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

type ContestImportInferredYearSource
  = | 'registration_start'
    | 'registration_end'
    | 'submission_deadline'
    | 'current_season'
    | 'fallback_current_year'

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
  inferredYearSource: ContestImportInferredYearSource
  warnings: string[]
}

interface ContestSyncSubmissionDeadlineResult {
  raw: string
  endAt: string | null
  inferredYear: number
  inferredYearSource: 'submission_deadline' | 'current_season' | 'fallback_current_year'
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

  let inferredYearSource: ContestImportInferredYearSource = 'fallback_current_year'
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

function parseContestSyncSubmissionDeadline(
  submissionText: string,
  currentSeason: string,
): ContestSyncSubmissionDeadlineResult {
  const raw = normalizeString(submissionText)
  const seasonYear = parseYearFromSeason(currentSeason)
  const nowYear = new Date().getFullYear()
  const explicitYear = extractExplicitYearFromDateToken(raw)
  const warnings: string[] = []

  let inferredYearSource: ContestSyncSubmissionDeadlineResult['inferredYearSource'] = 'fallback_current_year'
  let inferredYear = nowYear
  if (explicitYear && explicitYear >= 1900) {
    inferredYear = explicitYear
    inferredYearSource = 'submission_deadline'
  }
  else if (seasonYear && seasonYear >= 1900) {
    inferredYear = seasonYear
    inferredYearSource = 'current_season'
  }

  if (!raw) {
    return {
      raw,
      endAt: null,
      inferredYear,
      inferredYearSource,
      warnings,
    }
  }

  const endAt = parseDateTokenToIso(raw, 'end', inferredYear)
  if (!endAt)
    warnings.push('截止时间日期解析失败，已跳过时间轴写入。')

  return {
    raw,
    endAt,
    inferredYear,
    inferredYearSource,
    warnings,
  }
}

async function loadContestCurrentSeason(db: Queryable, contestId: string): Promise<string> {
  const result = await db.query<{ current_season: string | null }>(
    `SELECT current_season
     FROM contests
     WHERE id = $1
     LIMIT 1`,
    [contestId],
  )

  return normalizeString(result.rows[0]?.current_season)
}

async function upsertContestTimelineNode(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    timelineRows: TimelineRow[]
    year: number
    nodeType: 'registration' | 'submission'
    startAt?: string | null
    endAt?: string | null
    note?: string
    sourceLink?: string
  },
): Promise<void> {
  const existing = input.timelineRows.find(row => row.year === input.year && row.node_type === input.nodeType)

  if (existing) {
    const patch: {
      startAt?: string | null
      endAt?: string | null
      note?: string
      sourceLink?: string
    } = {}
    if (input.startAt)
      patch.startAt = input.startAt
    if (input.endAt)
      patch.endAt = input.endAt
    if (input.note && !normalizeString(existing.note))
      patch.note = input.note
    if (input.sourceLink)
      patch.sourceLink = input.sourceLink

    if (Object.keys(patch).length === 0)
      return

    await patchAdminTimeline(db, {
      actorUserId: input.actorUserId,
      contestId: input.contestId,
      timelineId: existing.id,
      patch,
    })
    return
  }

  const created = await createAdminTimeline(db, {
    actorUserId: input.actorUserId,
    contestId: input.contestId,
    year: input.year,
    nodeType: input.nodeType,
    startAt: input.startAt,
    endAt: input.endAt,
    note: input.note,
    sourceLink: input.sourceLink,
  })

  input.timelineRows.push({
    id: created.id,
    contest_id: input.contestId,
    year: created.year,
    node_type: created.nodeType,
    business_node_label: created.businessNodeLabel || '',
    start_at: created.startAt,
    end_at: created.endAt,
    note: created.note,
    source_link: created.sourceLink,
  })
}

export async function syncContestDerivedTimelineNodes(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    officialUrl?: string
    registrationWindow?: string
    submissionDeadline?: string
  },
): Promise<void> {
  const currentSeason = await loadContestCurrentSeason(db, input.contestId)
  const registration = parseImportRegistrationWindow(input.registrationWindow || '', currentSeason)
  const submission = parseContestSyncSubmissionDeadline(input.submissionDeadline || '', currentSeason)
  const sourceLink = normalizeString(input.officialUrl)
  const timelineRows = await loadTimelines(db, [input.contestId])

  if (registration.startAt || registration.endAt) {
    await upsertContestTimelineNode(db, {
      actorUserId: input.actorUserId,
      contestId: input.contestId,
      timelineRows,
      year: Number(registration.inferredYear || new Date().getFullYear()),
      nodeType: 'registration',
      startAt: registration.startAt,
      endAt: registration.endAt,
      note: registration.raw ? `飞书同步报名时间：${registration.raw}` : '',
      sourceLink,
    })
  }

  const submissionEndAt = submission.endAt || (!submission.raw && registration.endAt ? registration.endAt : null)
  const submissionYear = submission.endAt
    ? Number(submission.inferredYear || new Date().getFullYear())
    : !submission.raw && registration.endAt
        ? Number(registration.inferredYear || new Date().getFullYear())
        : null

  if (!submissionEndAt || !submissionYear)
    return

  await upsertContestTimelineNode(db, {
    actorUserId: input.actorUserId,
    contestId: input.contestId,
    timelineRows,
    year: submissionYear,
    nodeType: 'submission',
    startAt: null,
    endAt: submissionEndAt,
    note: submission.raw ? `飞书同步截止时间：${submission.raw}` : '由飞书同步报名时间推断提交截止时间。',
    sourceLink,
  })
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
  cover_image_url: string
  location: string
  organizer: string
  undertaker: string
  participant_requirements: string
  team_rule: string
  award_ratio: string
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
  business_node_label: string
  start_at: string | null
  end_at: string | null
  note: string
  source_link: string
}

interface TrackTimelineRow {
  id: string
  contest_id: string
  track_id: string
  year: number
  node_type: TimelineNodeType
  business_node_label: string
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

type AiPromptTarget = 'contest_filter' | 'project_chat' | 'topic_proposal' | 'review' | 'defense'

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
  plan_tier: 'personal_team' | 'business_team'
  base_price_cents: number
  included_seats: number
  extra_seat_price_cents: number
  included_ai_quota: number
  included_projects: number
  projects_unlimited: boolean
  extra_project_slot_price_cents: number
  default_project_seat_limit: number
  project_seat_price_cents: number
  min_charged_project_seats: number
  charge_all_project_seats: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

interface WorkspaceBillingOrderRow {
  id: string
  workspace_id: string
  plan_id: string
  plan_code: string
  plan_name: string
  billing_cycle: 'monthly' | 'quarterly' | 'yearly'
  amount_cents: number
  status: WorkspaceBillingOrder['status']
  provider: 'mock'
  estimate_json: unknown
  created_by_user_id: string | null
  paid_at: string | null
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

function joinUniqueStrings(values: unknown[]): string {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeString(value)
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result.join('；')
}

function inferLatestTimelineSeason(timelines: Array<{ year?: unknown }>): string {
  const years = timelines
    .map(item => Number(item.year || 0))
    .filter(year => Number.isFinite(year) && year >= 1900)
  if (years.length === 0)
    return ''
  return String(Math.max(...years))
}

function resolveContestPublishEffectiveMetadata(input: {
  contest: Contest
  timelines: ContestTimeline[]
  trackTimelines: Array<{ year?: unknown }>
}): {
  participantRequirements: string
  currentSeason: string
} {
  return {
    participantRequirements: normalizeString(input.contest.participantRequirements) || joinUniqueStrings((input.contest.tracks || []).map(item => item.participantRequirements)),
    currentSeason: normalizeString(input.contest.currentSeason)
      || inferLatestTimelineSeason([...input.timelines, ...input.trackTimelines]),
  }
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

async function assertTrackExistsForContest(db: Queryable, contestId: string, trackId: string): Promise<void> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM contest_tracks
     WHERE id = $1 AND contest_id = $2
     LIMIT 1`,
    [trackId, contestId],
  )
  if (!result.rows[0])
    throw new Error('TRACK_NOT_FOUND')
}

function mapTrack(row: TrackRow): Track {
  return {
    id: row.id,
    contestId: row.contest_id,
    name: row.name,
    summary: row.summary,
    coverImageUrl: row.cover_image_url,
    location: row.location,
    organizer: row.organizer,
    undertaker: row.undertaker,
    participantRequirements: row.participant_requirements,
    teamRule: row.team_rule,
    awardRatio: row.award_ratio,
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
    businessNodeLabel: row.business_node_label || '',
    startAt: row.start_at,
    endAt: row.end_at,
    note: row.note,
    sourceLink: row.source_link,
  }
}

function mapTrackTimeline(row: TrackTimelineRow): TrackTimeline {
  return {
    id: row.id,
    contestId: row.contest_id,
    trackId: row.track_id,
    year: Number(row.year || 0),
    nodeType: row.node_type,
    businessNodeLabel: row.business_node_label || '',
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
    planTier: row.plan_tier || 'business_team',
    basePriceCents: Number(row.base_price_cents || 0),
    includedSeats: Number(row.included_seats || 0),
    extraSeatPriceCents: Number(row.extra_seat_price_cents || 0),
    includedAiQuota: Number(row.included_ai_quota || 0),
    includedProjects: Math.max(0, Number(row.included_projects || 0)),
    projectsUnlimited: Boolean(row.projects_unlimited),
    extraProjectSlotPriceCents: Math.max(0, Number(row.extra_project_slot_price_cents || 0)),
    defaultProjectSeatLimit: Math.max(1, Number(row.default_project_seat_limit || 5)),
    projectSeatPriceCents: Math.max(0, Number(row.project_seat_price_cents || 0)),
    minChargedProjectSeats: Math.max(0, Number(row.min_charged_project_seats || 0)),
    chargeAllProjectSeats: Boolean(row.charge_all_project_seats),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapWorkspaceBillingOrder(row: WorkspaceBillingOrderRow): WorkspaceBillingOrder {
  const amountCents = Math.max(0, Number(row.amount_cents || 0))
  const estimate = normalizeRecord(row.estimate_json)
  return {
    id: row.id,
    teamId: row.workspace_id,
    workspaceId: row.workspace_id,
    planId: row.plan_id,
    planCode: normalizeString(row.plan_code),
    planName: normalizeString(row.plan_name),
    billingCycle: row.billing_cycle || 'monthly',
    amountCents,
    amountYuan: Number((amountCents / 100).toFixed(2)),
    status: row.status || 'pending',
    provider: 'mock',
    estimate: Object.keys(estimate).length > 0 ? estimate as unknown as WorkspaceBillingEstimate : null,
    createdByUserId: row.created_by_user_id,
    paidAt: row.paid_at,
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

export async function countPlatformSuperAdmins(db: Queryable): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(DISTINCT user_id)::TEXT AS count
     FROM platform_user_roles
     WHERE role = 'platform_super_admin'`,
  )
  return Number(result.rows[0]?.count || '0')
}

export async function setPlatformRolesByUserId(
  db: Queryable,
  input: {
    targetUserId: string
    roles: PlatformRole[]
    allowSuperAdminTransfer?: boolean
  },
): Promise<PlatformRoleAssignment | null> {
  const roles = dedupeBy(input.roles, item => item)
  const now = new Date().toISOString()
  const includesSuperAdmin = roles.includes('platform_super_admin')

  if (includesSuperAdmin && !input.allowSuperAdminTransfer)
    throw new Error('SUPER_ADMIN_ASSIGN_FORBIDDEN')

  const targetResult = await db.query<{ id: string, username: string }>(
    'SELECT id, username FROM users WHERE id = $1 LIMIT 1 FOR UPDATE',
    [input.targetUserId],
  )

  const user = targetResult.rows[0]
  if (!user)
    return null

  if (includesSuperAdmin) {
    await db.query(
      `DELETE FROM platform_user_roles
       WHERE role = 'platform_super_admin'
         AND user_id <> $1`,
      [input.targetUserId],
    )
  }

  await db.query('DELETE FROM platform_user_roles WHERE user_id = $1', [input.targetUserId])

  for (const role of roles) {
    await db.query(
      `INSERT INTO platform_user_roles (id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [randomUUID(), input.targetUserId, role, now],
    )
  }

  if (await countPlatformSuperAdmins(db) !== 1)
    throw new Error('UNIQUE_SUPER_ADMIN_REQUIRED')

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

async function isContestAutoSeedEnabled(db: Queryable): Promise<boolean> {
  try {
    const overrides = await readPlatformRuntimeOverrides(db)
    if (overrides.contest && Object.prototype.hasOwnProperty.call(overrides.contest, 'autoSeed'))
      return Boolean(overrides.contest.autoSeed)
  }
  catch {
    // ignore override read error and fallback to env
  }

  const raw = String(process.env.WINLOOP_CONTEST_AUTO_SEED || '').trim().toLowerCase()
  if (!raw)
    return false
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

export function listCatalogContestIds(): string[] {
  return listCatalogContests().map(item => item.id)
}

export async function ensureDefaultBillingPlans(db: Queryable): Promise<void> {
  const now = new Date().toISOString()
  const plans: Array<Omit<BillingPlan, 'createdAt' | 'updatedAt'>> = [
    {
      id: randomUUID(),
      code: 'personal-team',
      name: 'Personal Team',
      planTier: 'personal_team',
      basePriceCents: 0,
      includedSeats: 15,
      extraSeatPriceCents: 0,
      includedAiQuota: 100,
      includedProjects: 0,
      projectsUnlimited: true,
      extraProjectSlotPriceCents: 0,
      defaultProjectSeatLimit: 15,
      projectSeatPriceCents: 0,
      minChargedProjectSeats: 0,
      chargeAllProjectSeats: false,
      isActive: true,
    },
    {
      id: randomUUID(),
      code: 'business-team',
      name: 'Business Team',
      planTier: 'business_team',
      basePriceCents: 99900,
      includedSeats: 20,
      extraSeatPriceCents: 1000,
      includedAiQuota: 5000,
      includedProjects: 0,
      projectsUnlimited: true,
      extraProjectSlotPriceCents: 0,
      defaultProjectSeatLimit: 15,
      projectSeatPriceCents: 1000,
      minChargedProjectSeats: 3,
      chargeAllProjectSeats: true,
      isActive: true,
    },
  ]

  for (const plan of plans) {
    await db.query(
      `INSERT INTO billing_plans (
        id,
        code,
        name,
        plan_tier,
        base_price_cents,
        included_seats,
        extra_seat_price_cents,
        included_ai_quota,
        included_projects,
        projects_unlimited,
        extra_project_slot_price_cents,
        default_project_seat_limit,
        project_seat_price_cents,
        min_charged_project_seats,
        charge_all_project_seats,
        is_enabled,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $17
      )
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        plan_tier = EXCLUDED.plan_tier,
        base_price_cents = EXCLUDED.base_price_cents,
        included_seats = EXCLUDED.included_seats,
        extra_seat_price_cents = EXCLUDED.extra_seat_price_cents,
        included_ai_quota = EXCLUDED.included_ai_quota,
        included_projects = EXCLUDED.included_projects,
        projects_unlimited = EXCLUDED.projects_unlimited,
        extra_project_slot_price_cents = EXCLUDED.extra_project_slot_price_cents,
        default_project_seat_limit = EXCLUDED.default_project_seat_limit,
        project_seat_price_cents = EXCLUDED.project_seat_price_cents,
        min_charged_project_seats = EXCLUDED.min_charged_project_seats,
        charge_all_project_seats = EXCLUDED.charge_all_project_seats,
        is_enabled = EXCLUDED.is_enabled,
        updated_at = EXCLUDED.updated_at`,
      [
        plan.id,
        plan.code,
        plan.name,
        plan.planTier,
        plan.basePriceCents,
        plan.includedSeats,
        plan.extraSeatPriceCents,
        plan.includedAiQuota,
        plan.includedProjects,
        plan.projectsUnlimited,
        plan.extraProjectSlotPriceCents,
        plan.defaultProjectSeatLimit,
        plan.projectSeatPriceCents,
        plan.minChargedProjectSeats,
        plan.chargeAllProjectSeats,
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
  if (!forceSeed && !(await isContestAutoSeedEnabled(db))) {
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
        business_node_label,
        start_at,
        end_at,
        note,
        source_link,
        created_at,
        updated_at
      )
      SELECT $1, $2, $3, 'registration', '', $4, $5, '', '', $6, $6
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
        business_node_label,
        start_at,
        end_at,
        note,
        source_link,
        created_at,
        updated_at
      )
      SELECT $1, $2, $3, 'submission', '', NULL, $4, '', '', $5, $5
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
     WHERE (
       $1::BOOLEAN = TRUE
       OR (
         status = 'published'
         AND visibility = 'public'
         AND EXISTS (
           SELECT 1
           FROM release_versions rv
           WHERE rv.scope_kind = 'contest'
             AND rv.status = 'published'
             AND rv.live_entity_id = contests.id
         )
       )
     )
     ORDER BY updated_at DESC`,
    [includeInternal],
  )

  return result.rows
}

async function loadTracks(db: Queryable, contestIds: string[], includeInternal: boolean): Promise<TrackRow[]> {
  if (contestIds.length === 0)
    return []

  const result = await db.query<TrackRow>(
    `SELECT
      id,
      contest_id,
      name,
      summary,
      cover_image_url,
      location,
      organizer,
      undertaker,
      participant_requirements,
      team_rule,
      award_ratio,
      suitable_majors,
      deliverable_types,
      rubric_id,
      sort_order,
      status
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
    `SELECT id, contest_id, year, node_type, business_node_label, start_at::TEXT, end_at::TEXT, note, source_link
     FROM contest_timelines
     WHERE contest_id = ANY($1::TEXT[])
     ORDER BY year DESC, created_at ASC`,
    [contestIds],
  )

  return result.rows
}

async function loadTrackTimelines(db: Queryable, contestIds: string[]): Promise<TrackTimelineRow[]> {
  if (contestIds.length === 0)
    return []

  const result = await db.query<TrackTimelineRow>(
    `SELECT
      id,
      contest_id,
      track_id,
      year,
      node_type,
      business_node_label,
      start_at::TEXT,
      end_at::TEXT,
      note,
      source_link
     FROM contest_track_timelines
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
       AND (
         $2::BOOLEAN = TRUE
         OR (
           status = 'published'
           AND visibility = 'public'
           AND EXISTS (
             SELECT 1
             FROM release_versions rv
             WHERE rv.scope_kind = 'contest'
               AND rv.status = 'published'
               AND rv.live_entity_id = contests.id
           )
         )
       )
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

export async function getContestResourceById(
  db: Queryable,
  input: {
    contestId: string
    resourceId: string
    includeInternal: boolean
  },
): Promise<Resource | null> {
  await ensureContestLibrarySeeded(db)

  const where: string[] = ['contest_id = $1', 'id = $2']
  const values: unknown[] = [input.contestId, input.resourceId]

  if (!input.includeInternal)
    where.push(`status = 'active'`)

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
     LIMIT 1`,
    values,
  )

  return result.rows[0] ? mapResource(result.rows[0]) : null
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

async function assertFeishuSourceOfTruthPatchAllowed(
  db: Queryable,
  input: {
    scope: FeishuBitableSyncItemEntityType
    entityId: string
    bypass?: boolean
  },
): Promise<void> {
  if (input.bypass)
    return

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM feishu_external_refs
     WHERE provider = 'feishu_bitable'
       AND scope = $1
       AND entity_id = $2
     LIMIT 1`,
    [input.scope, input.entityId],
  )
  if (!result.rows[0]?.id)
    return

  throw new Error('FEISHU_SOURCE_OF_TRUTH_CONFLICT')
}

async function assertContestReleaseWorkflowPatchAllowed(
  db: Queryable,
  input: {
    contestId: string
    bypass?: boolean
  },
): Promise<void> {
  if (input.bypass)
    return

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM release_versions
     WHERE scope_kind = 'contest'
       AND status = 'published'
       AND live_entity_id = $1
     LIMIT 1`,
    [input.contestId],
  )
  if (!result.rows[0]?.id)
    return

  throw new Error('CONTEST_RELEASE_WORKFLOW_REQUIRED')
}

export async function patchAdminContest(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    bypassSourceOfTruthGuard?: boolean
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

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassSourceOfTruthGuard,
  })
  await assertFeishuSourceOfTruthPatchAllowed(db, {
    scope: 'contest',
    entityId: input.contestId,
    bypass: input.bypassSourceOfTruthGuard,
  })

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
  const trackTimelines = await loadTrackTimelines(db, [contest.id])
  const effectiveMetadata = resolveContestPublishEffectiveMetadata({
    contest,
    timelines: detail.timelines || [],
    trackTimelines,
  })

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

  const hasOfficialUrl = Boolean(normalizeString(contest.officialUrl))
  checks.push(hasOfficialUrl)
  if (!hasOfficialUrl)
    pushBlocker('CONTEST_OFFICIAL_URL_REQUIRED', '官网链接不能为空。', 'officialUrl')

  const hasSummary = Boolean(normalizeString(contest.summary))
  checks.push(hasSummary)
  if (!hasSummary)
    pushBlocker('CONTEST_SUMMARY_REQUIRED', '简介不能为空。', 'summary')

  const hasParticipantRequirements = Boolean(effectiveMetadata.participantRequirements)
  checks.push(hasParticipantRequirements)
  if (!hasParticipantRequirements)
    pushBlocker('CONTEST_PARTICIPANT_REQUIREMENTS_REQUIRED', '参赛对象/限制不能为空。', 'participantRequirements')

  const hasCurrentSeason = Boolean(effectiveMetadata.currentSeason)
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

  const hasTimelines = (detail.timelines || []).length > 0 || trackTimelines.length > 0
  checks.push(hasTimelines)
  if (!hasTimelines)
    pushBlocker('CONTEST_TIMELINES_REQUIRED', '至少需要 1 个时间节点。', 'timelines')

  const hasRubrics = (detail.rubrics || []).length > 0
  checks.push(hasRubrics)
  if (!hasRubrics)
    pushBlocker('CONTEST_RUBRICS_REQUIRED', '至少需要 1 条评分规则。', 'rubrics')

  const externalRefRows = await db.query<{ external_id: string }>(
    `SELECT external_id
     FROM feishu_external_refs
     WHERE provider = 'feishu_bitable'
       AND scope = 'contest'
       AND entity_id = $1
     LIMIT 1`,
    [input.contestId],
  )
  const contestExternalId = normalizeString(externalRefRows.rows[0]?.external_id)
  if (contestExternalId) {
    const duplicateExternalRefRows = await db.query<{ entity_id: string }>(
      `SELECT entity_id
       FROM feishu_external_refs
       WHERE provider = 'feishu_bitable'
         AND scope = 'contest'
         AND external_id = $1
         AND entity_id <> $2
       LIMIT 1`,
      [contestExternalId, input.contestId],
    )
    const duplicateExternalRef = duplicateExternalRefRows.rows[0]
    if (duplicateExternalRef?.entity_id) {
      pushBlocker(
        'CONTEST_DUPLICATED',
        `检测到重复竞赛（ID: ${duplicateExternalRef.entity_id}），请核对唯一编号/赛事名称。`,
        'externalId',
      )
    }
  }

  if (hasName) {
    const rows = await db.query<{ id: string, name: string }>(
      `SELECT id, name
       FROM contests
       WHERE id <> $1
         AND status <> 'archived'`,
      [input.contestId],
    )
    const duplicate = rows.rows.find(row => normalizeCompareValue(row.name) === normalizeCompareValue(contest.name))
    if (duplicate) {
      pushBlocker(
        'CONTEST_DUPLICATED',
        `检测到重复竞赛（ID: ${duplicate.id}），请核对唯一编号/赛事名称。`,
        'name',
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
    bypassSourceOfTruthGuard?: boolean
    name: string
    summary?: string
    coverImageUrl?: string
    location?: string
    organizer?: string
    undertaker?: string
    participantRequirements?: string
    teamRule?: string
    awardRatio?: string
    suitableMajors?: string[]
    deliverableTypes?: string[]
    rubricId?: string | null
    sortOrder?: number
    status?: ContestStatus
  },
): Promise<Track> {
  const trackId = randomUUID()
  const now = new Date().toISOString()

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassSourceOfTruthGuard,
  })

  await db.query(
    `INSERT INTO contest_tracks (
      id,
      contest_id,
      name,
      summary,
      cover_image_url,
      location,
      organizer,
      undertaker,
      participant_requirements,
      team_rule,
      award_ratio,
      suitable_majors,
      deliverable_types,
      rubric_id,
      sort_order,
      status,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::TEXT[], $13::TEXT[], $14, $15, $16, $17, $17
    )`,
    [
      trackId,
      input.contestId,
      normalizeString(input.name),
      normalizeString(input.summary),
      normalizeString(input.coverImageUrl),
      normalizeString(input.location),
      normalizeString(input.organizer),
      normalizeString(input.undertaker),
      normalizeString(input.participantRequirements),
      normalizeString(input.teamRule),
      normalizeString(input.awardRatio),
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
    `SELECT
      id,
      contest_id,
      name,
      summary,
      cover_image_url,
      location,
      organizer,
      undertaker,
      participant_requirements,
      team_rule,
      award_ratio,
      suitable_majors,
      deliverable_types,
      rubric_id,
      sort_order,
      status
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
    bypassSourceOfTruthGuard?: boolean
    patch: {
      name?: string
      summary?: string
      coverImageUrl?: string
      location?: string
      organizer?: string
      undertaker?: string
      participantRequirements?: string
      teamRule?: string
      awardRatio?: string
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
  if (input.patch.coverImageUrl !== undefined)
    addSet('cover_image_url', normalizeString(input.patch.coverImageUrl))
  if (input.patch.location !== undefined)
    addSet('location', normalizeString(input.patch.location))
  if (input.patch.organizer !== undefined)
    addSet('organizer', normalizeString(input.patch.organizer))
  if (input.patch.undertaker !== undefined)
    addSet('undertaker', normalizeString(input.patch.undertaker))
  if (input.patch.participantRequirements !== undefined)
    addSet('participant_requirements', normalizeString(input.patch.participantRequirements))
  if (input.patch.teamRule !== undefined)
    addSet('team_rule', normalizeString(input.patch.teamRule))
  if (input.patch.awardRatio !== undefined)
    addSet('award_ratio', normalizeString(input.patch.awardRatio))
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

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassSourceOfTruthGuard,
  })
  await assertFeishuSourceOfTruthPatchAllowed(db, {
    scope: 'track',
    entityId: input.trackId,
    bypass: input.bypassSourceOfTruthGuard,
  })

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
    `SELECT
      id,
      contest_id,
      name,
      summary,
      cover_image_url,
      location,
      organizer,
      undertaker,
      participant_requirements,
      team_rule,
      award_ratio,
      suitable_majors,
      deliverable_types,
      rubric_id,
      sort_order,
      status
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
    bypassReleaseWorkflowGuard?: boolean
    year: number
    nodeType: TimelineNodeType
    businessNodeLabel?: string
    startAt?: string | null
    endAt?: string | null
    note?: string
    sourceLink?: string
  },
): Promise<ContestTimeline> {
  const timelineId = randomUUID()
  const now = new Date().toISOString()

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassReleaseWorkflowGuard,
  })

  await db.query(
    `INSERT INTO contest_timelines (
      id,
      contest_id,
      year,
      node_type,
      business_node_label,
      start_at,
      end_at,
      note,
      source_link,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      timelineId,
      input.contestId,
      Number(input.year || new Date().getFullYear()),
      input.nodeType,
      normalizeString(input.businessNodeLabel),
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
    `SELECT id, contest_id, year, node_type, business_node_label, start_at::TEXT, end_at::TEXT, note, source_link
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
    bypassReleaseWorkflowGuard?: boolean
    patch: {
      year?: number
      nodeType?: TimelineNodeType
      businessNodeLabel?: string
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
  if (input.patch.businessNodeLabel !== undefined)
    addSet('business_node_label', normalizeString(input.patch.businessNodeLabel))
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

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassReleaseWorkflowGuard,
  })
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
    `SELECT id, contest_id, year, node_type, business_node_label, start_at::TEXT, end_at::TEXT, note, source_link
     FROM contest_timelines
     WHERE id = $1 AND contest_id = $2
     LIMIT 1`,
    [input.timelineId, input.contestId],
  )

  const row = result.rows[0]
  return row ? mapTimeline(row) : null
}

export async function listAdminTrackTimelines(db: Queryable, contestId: string): Promise<TrackTimeline[]> {
  const rows = await loadTrackTimelines(db, [contestId])
  return rows.map(mapTrackTimeline)
}

export async function createAdminTrackTimeline(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    bypassReleaseWorkflowGuard?: boolean
    trackId: string
    year: number
    nodeType: TimelineNodeType
    businessNodeLabel?: string
    startAt?: string | null
    endAt?: string | null
    note?: string
    sourceLink?: string
  },
): Promise<TrackTimeline> {
  await assertTrackExistsForContest(db, input.contestId, input.trackId)
  const timelineId = randomUUID()
  const now = new Date().toISOString()

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassReleaseWorkflowGuard,
  })

  await db.query(
    `INSERT INTO contest_track_timelines (
      id,
      contest_id,
      track_id,
      year,
      node_type,
      business_node_label,
      start_at,
      end_at,
      note,
      source_link,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
    [
      timelineId,
      input.contestId,
      input.trackId,
      Number(input.year || new Date().getFullYear()),
      input.nodeType,
      normalizeString(input.businessNodeLabel),
      input.startAt || null,
      input.endAt || null,
      normalizeString(input.note),
      normalizeString(input.sourceLink),
      now,
    ],
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'track_timeline.create',
    contestId: input.contestId,
    payload: {
      timelineId,
      trackId: input.trackId,
      nodeType: input.nodeType,
    },
  })

  const result = await db.query<TrackTimelineRow>(
    `SELECT
      id,
      contest_id,
      track_id,
      year,
      node_type,
      start_at::TEXT,
      end_at::TEXT,
      note,
      source_link
     FROM contest_track_timelines
     WHERE id = $1
     LIMIT 1`,
    [timelineId],
  )

  return mapTrackTimeline(result.rows[0]!)
}

export async function patchAdminTrackTimeline(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    trackTimelineId: string
    bypassReleaseWorkflowGuard?: boolean
    patch: {
      trackId?: string
      year?: number
      nodeType?: TimelineNodeType
      businessNodeLabel?: string
      startAt?: string | null
      endAt?: string | null
      note?: string
      sourceLink?: string
    }
  },
): Promise<TrackTimeline | null> {
  if (input.patch.trackId !== undefined)
    await assertTrackExistsForContest(db, input.contestId, input.patch.trackId)

  const values: unknown[] = [input.trackTimelineId, input.contestId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.trackId !== undefined)
    addSet('track_id', input.patch.trackId)
  if (input.patch.year !== undefined)
    addSet('year', Number(input.patch.year || new Date().getFullYear()))
  if (input.patch.nodeType !== undefined)
    addSet('node_type', input.patch.nodeType)
  if (input.patch.businessNodeLabel !== undefined)
    addSet('business_node_label', normalizeString(input.patch.businessNodeLabel))
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

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassReleaseWorkflowGuard,
  })
  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE contest_track_timelines
     SET ${sets.join(', ')}
     WHERE id = $1 AND contest_id = $2`,
    values,
  )

  await appendAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'track_timeline.patch',
    contestId: input.contestId,
    payload: {
      trackTimelineId: input.trackTimelineId,
      ...input.patch,
    },
  })

  const result = await db.query<TrackTimelineRow>(
    `SELECT
      id,
      contest_id,
      track_id,
      year,
      node_type,
      business_node_label,
      start_at::TEXT,
      end_at::TEXT,
      note,
      source_link
     FROM contest_track_timelines
     WHERE id = $1 AND contest_id = $2
     LIMIT 1`,
    [input.trackTimelineId, input.contestId],
  )

  const row = result.rows[0]
  return row ? mapTrackTimeline(row) : null
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
    bypassReleaseWorkflowGuard?: boolean
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

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassReleaseWorkflowGuard,
  })

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
    bypassReleaseWorkflowGuard?: boolean
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

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassReleaseWorkflowGuard,
  })
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
    bypassSourceOfTruthGuard?: boolean
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

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassSourceOfTruthGuard,
  })

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
    bypassSourceOfTruthGuard?: boolean
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

  await assertContestReleaseWorkflowPatchAllowed(db, {
    contestId: input.contestId,
    bypass: input.bypassSourceOfTruthGuard,
  })
  await assertFeishuSourceOfTruthPatchAllowed(db, {
    scope: 'resource',
    entityId: input.resourceId,
    bypass: input.bypassSourceOfTruthGuard,
  })

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

const AI_PROMPT_TARGETS: AiPromptTarget[] = ['contest_filter', 'project_chat', 'topic_proposal', 'review', 'defense']

function normalizeAiPromptTarget(value: unknown): AiPromptTarget | null {
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized)
    return null
  if (normalized === 'contest-filter')
    return 'contest_filter'
  if (normalized === 'project-chat')
    return 'project_chat'
  if (normalized === 'topic-proposal')
    return 'topic_proposal'
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
      plan_tier,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      included_projects,
      projects_unlimited,
      extra_project_slot_price_cents,
      default_project_seat_limit,
      project_seat_price_cents,
      min_charged_project_seats,
      charge_all_project_seats,
      is_enabled AS is_active,
      created_at::TEXT,
      updated_at::TEXT
     FROM billing_plans
     WHERE ($1::BOOLEAN = TRUE OR is_enabled = TRUE)
     ORDER BY is_enabled DESC, created_at ASC`,
    [includeInactive],
  )

  return result.rows.map(mapBillingPlan)
}

export async function createBillingPlan(
  db: Queryable,
  input: {
    code: string
    name: string
    planTier?: 'personal_team' | 'business_team'
    basePriceCents: number
    includedSeats: number
    extraSeatPriceCents: number
    includedAiQuota: number
    includedProjects?: number
    projectsUnlimited?: boolean
    extraProjectSlotPriceCents?: number
    defaultProjectSeatLimit?: number
    projectSeatPriceCents?: number
    minChargedProjectSeats?: number
    chargeAllProjectSeats?: boolean
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
      plan_tier,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      included_projects,
      projects_unlimited,
      extra_project_slot_price_cents,
      default_project_seat_limit,
      project_seat_price_cents,
      min_charged_project_seats,
      charge_all_project_seats,
      is_enabled,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15,
      $16, $17, $17
    )`,
    [
      planId,
      normalizeString(input.code),
      normalizeString(input.name),
      input.planTier || 'business_team',
      Math.max(0, Number(input.basePriceCents || 0)),
      Math.max(0, Number(input.includedSeats || 0)),
      Math.max(0, Number(input.extraSeatPriceCents || 0)),
      Math.max(0, Number(input.includedAiQuota || 0)),
      Math.max(0, Number(input.includedProjects || 0)),
      input.projectsUnlimited === true,
      Math.max(0, Number(input.extraProjectSlotPriceCents || 0)),
      Math.max(1, Number(input.defaultProjectSeatLimit || 5)),
      Math.max(0, Number(input.projectSeatPriceCents || 0)),
      Math.max(0, Number(input.minChargedProjectSeats || 0)),
      input.chargeAllProjectSeats === true,
      input.isActive !== false,
      now,
    ],
  )

  const result = await db.query<BillingPlanRow>(
    `SELECT
      id,
      code,
      name,
      plan_tier,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      included_projects,
      projects_unlimited,
      extra_project_slot_price_cents,
      default_project_seat_limit,
      project_seat_price_cents,
      min_charged_project_seats,
      charge_all_project_seats,
      is_enabled AS is_active,
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
      planTier?: 'personal_team' | 'business_team'
      basePriceCents?: number
      includedSeats?: number
      extraSeatPriceCents?: number
      includedAiQuota?: number
      includedProjects?: number
      projectsUnlimited?: boolean
      extraProjectSlotPriceCents?: number
      defaultProjectSeatLimit?: number
      projectSeatPriceCents?: number
      minChargedProjectSeats?: number
      chargeAllProjectSeats?: boolean
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
  if (input.patch.planTier !== undefined)
    addSet('plan_tier', input.patch.planTier)
  if (input.patch.basePriceCents !== undefined)
    addSet('base_price_cents', Math.max(0, Number(input.patch.basePriceCents || 0)))
  if (input.patch.includedSeats !== undefined)
    addSet('included_seats', Math.max(0, Number(input.patch.includedSeats || 0)))
  if (input.patch.extraSeatPriceCents !== undefined)
    addSet('extra_seat_price_cents', Math.max(0, Number(input.patch.extraSeatPriceCents || 0)))
  if (input.patch.includedAiQuota !== undefined)
    addSet('included_ai_quota', Math.max(0, Number(input.patch.includedAiQuota || 0)))
  if (input.patch.includedProjects !== undefined)
    addSet('included_projects', Math.max(0, Number(input.patch.includedProjects || 0)))
  if (input.patch.projectsUnlimited !== undefined)
    addSet('projects_unlimited', input.patch.projectsUnlimited)
  if (input.patch.extraProjectSlotPriceCents !== undefined)
    addSet('extra_project_slot_price_cents', Math.max(0, Number(input.patch.extraProjectSlotPriceCents || 0)))
  if (input.patch.defaultProjectSeatLimit !== undefined)
    addSet('default_project_seat_limit', Math.max(1, Number(input.patch.defaultProjectSeatLimit || 1)))
  if (input.patch.projectSeatPriceCents !== undefined)
    addSet('project_seat_price_cents', Math.max(0, Number(input.patch.projectSeatPriceCents || 0)))
  if (input.patch.minChargedProjectSeats !== undefined)
    addSet('min_charged_project_seats', Math.max(0, Number(input.patch.minChargedProjectSeats || 0)))
  if (input.patch.chargeAllProjectSeats !== undefined)
    addSet('charge_all_project_seats', input.patch.chargeAllProjectSeats)
  if (input.patch.isActive !== undefined)
    addSet('is_enabled', input.patch.isActive)

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
      plan_tier,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      included_projects,
      projects_unlimited,
      extra_project_slot_price_cents,
      default_project_seat_limit,
      project_seat_price_cents,
      min_charged_project_seats,
      charge_all_project_seats,
      is_enabled AS is_active,
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
): Promise<{ plan: BillingPlan | null, workspaceType: 'personal' | 'team' | null }> {
  const workspaceResult = await db.query<{ type: 'personal' | 'team' }>(
    `SELECT type
     FROM workspaces
     WHERE id = $1
     LIMIT 1`,
    [workspaceId],
  )

  const workspaceType = workspaceResult.rows[0]?.type || null
  if (!workspaceType)
    return { plan: null, workspaceType: null }

  const existing = await db.query<{
    plan_id: string | null
    billing_cycle: string
    extra_project_slots: number
  }>(
    `SELECT
      plan_id,
      billing_cycle,
      extra_project_slots
     FROM workspace_billing
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId],
  )

  const planId = existing.rows[0]?.plan_id || null

  if (planId) {
    const result = await db.query<BillingPlanRow>(
      `SELECT
        id,
        code,
        name,
        plan_tier,
        base_price_cents,
        included_seats,
        extra_seat_price_cents,
        included_ai_quota,
        included_projects,
        projects_unlimited,
        extra_project_slot_price_cents,
        default_project_seat_limit,
        project_seat_price_cents,
        min_charged_project_seats,
        charge_all_project_seats,
        is_enabled AS is_active,
        created_at::TEXT,
        updated_at::TEXT
       FROM billing_plans
       WHERE id = $1
       LIMIT 1`,
      [planId],
    )

    const row = result.rows[0]
    if (row)
      return { plan: mapBillingPlan(row), workspaceType }
  }

  const preferredPlanTier = workspaceType === 'personal' ? 'personal_team' : 'business_team'
  const firstActive = await db.query<BillingPlanRow>(
    `SELECT
      id,
      code,
      name,
      plan_tier,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      included_projects,
      projects_unlimited,
      extra_project_slot_price_cents,
      default_project_seat_limit,
      project_seat_price_cents,
      min_charged_project_seats,
      charge_all_project_seats,
      is_enabled AS is_active,
      created_at::TEXT,
      updated_at::TEXT
     FROM billing_plans
     WHERE is_enabled = TRUE
       AND plan_tier = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [preferredPlanTier],
  )

  const fallbackActive = firstActive.rows[0]
    ? null
    : await db.query<BillingPlanRow>(
        `SELECT
          id,
          code,
          name,
          plan_tier,
          base_price_cents,
          included_seats,
          extra_seat_price_cents,
          included_ai_quota,
          included_projects,
          projects_unlimited,
          extra_project_slot_price_cents,
          default_project_seat_limit,
          project_seat_price_cents,
          min_charged_project_seats,
          charge_all_project_seats,
          is_enabled AS is_active,
          created_at::TEXT,
          updated_at::TEXT
         FROM billing_plans
         WHERE is_enabled = TRUE
         ORDER BY created_at ASC
         LIMIT 1`,
      )

  const planRow = firstActive.rows[0] || fallbackActive?.rows[0]
  const plan = planRow ? mapBillingPlan(planRow) : null

  if (plan) {
    const billingCycle = existing.rows[0]?.billing_cycle || 'monthly'
    const extraProjectSlots = Math.max(0, Number(existing.rows[0]?.extra_project_slots || 0))
    await db.query(
      `INSERT INTO workspace_billing (
        workspace_id,
        plan_id,
        billing_cycle,
        extra_project_slots,
        estimated_amount_cents,
        snapshot_seat_used,
        snapshot_seat_limit,
        snapshot_ai_quota_total,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, 0, 0, 0, 0, NOW()
      )
      ON CONFLICT (workspace_id)
      DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        billing_cycle = EXCLUDED.billing_cycle,
        extra_project_slots = EXCLUDED.extra_project_slots,
        updated_at = EXCLUDED.updated_at`,
      [workspaceId, plan.id, billingCycle, extraProjectSlots],
    )
  }

  return {
    plan,
    workspaceType,
  }
}

async function ensureWorkspaceProjectSeatQuotas(
  db: Queryable,
  workspaceId: string,
  defaultProjectSeatLimit: number,
): Promise<void> {
  const normalizedDefaultSeatLimit = Math.max(1, Math.trunc(Number(defaultProjectSeatLimit || 1)))
  await db.query(
    `INSERT INTO project_seat_quotas (
      project_id,
      workspace_id,
      seat_limit,
      seat_used,
      updated_at
    )
    SELECT
      p.id,
      p.workspace_id,
      $2,
      COALESCE(member_count.used, 0),
      NOW()
    FROM projects p
    LEFT JOIN project_seat_quotas psq ON psq.project_id = p.id
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT pm.user_id)::INTEGER AS used
      FROM project_members pm
      WHERE pm.project_id = p.id
    ) member_count ON TRUE
    WHERE p.workspace_id = $1
      AND psq.project_id IS NULL
    ON CONFLICT (project_id)
    DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      seat_used = EXCLUDED.seat_used,
      updated_at = EXCLUDED.updated_at`,
    [workspaceId, normalizedDefaultSeatLimit],
  )

  await db.query(
    `UPDATE project_seat_quotas psq
     SET seat_used = member_count.used,
         updated_at = NOW()
     FROM (
       SELECT p.id AS project_id, COALESCE(COUNT(DISTINCT pm.user_id), 0)::INTEGER AS used
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.workspace_id = $1
       GROUP BY p.id
     ) member_count
     WHERE psq.project_id = member_count.project_id`,
    [workspaceId],
  )
}

export async function estimateWorkspaceBilling(
  db: Queryable,
  input: {
    workspaceId: string
  },
): Promise<WorkspaceBillingEstimate | null> {
  await ensureDefaultBillingPlans(db)

  const resolved = await resolveWorkspacePlan(db, input.workspaceId)
  const plan = resolved.plan
  const workspaceType = resolved.workspaceType
  if (!workspaceType)
    return null

  const workspaceMemberStats = await db.query<{
    seat_used: string
  }>(
    `SELECT COUNT(DISTINCT wm.user_id)::TEXT AS seat_used
     FROM workspace_members wm
     WHERE wm.workspace_id = $1
       AND wm.is_enabled = TRUE`,
    [input.workspaceId],
  )

  const teamQuotaResult = await db.query<{
    seat_limit: number
    ai_quota_total: number
  }>(
    `SELECT
      seat_limit,
      ai_quota_total
     FROM team_quotas
     WHERE workspace_id = $1
     LIMIT 1`,
    [input.workspaceId],
  )

  const seatUsed = Math.max(0, Number(workspaceMemberStats.rows[0]?.seat_used || '0'))
  const planTier = plan?.planTier || (workspaceType === 'personal' ? 'personal_team' : 'business_team')
  const includedProjects = Math.max(0, Number(plan?.includedProjects || 0))
  const projectsUnlimited = plan?.projectsUnlimited ?? true
  const extraProjectSlotPriceCents = Math.max(0, Number(plan?.extraProjectSlotPriceCents || 0))
  const defaultProjectSeatLimit = Math.max(1, Number(plan?.defaultProjectSeatLimit || 15))
  const projectSeatPriceCents = Math.max(0, Number(plan?.projectSeatPriceCents || 0))
  const minChargedProjectSeats = Math.max(0, Number(plan?.minChargedProjectSeats || 0))
  const chargeAllProjectSeats = Boolean(plan?.chargeAllProjectSeats)

  await ensureWorkspaceProjectSeatQuotas(db, input.workspaceId, defaultProjectSeatLimit)

  const projectCountResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count
     FROM projects
     WHERE workspace_id = $1`,
    [input.workspaceId],
  )
  const projectCount = Math.max(0, Number(projectCountResult.rows[0]?.count || '0'))

  const projectSeatRows = await db.query<{
    seat_limit: number
    seat_used: number
  }>(
    `SELECT seat_limit, seat_used
     FROM project_seat_quotas
     WHERE workspace_id = $1`,
    [input.workspaceId],
  )

  const projectSeatLimitTotal = projectSeatRows.rows.reduce((sum, row) => {
    return sum + Math.max(1, Number(row.seat_limit || 1))
  }, 0)
  const projectSeatUsedTotal = projectSeatRows.rows.reduce((sum, row) => {
    return sum + Math.max(0, Number(row.seat_used || 0))
  }, 0)

  const chargedProjectSeatsTotal = projectSeatRows.rows.reduce((sum, row) => {
    const seatUsedForProject = Math.max(0, Number(row.seat_used || 0))
    if (!chargeAllProjectSeats)
      return sum + seatUsedForProject
    return sum + Math.max(seatUsedForProject, minChargedProjectSeats)
  }, 0)

  const billingResult = await db.query<{
    billing_cycle: string
    extra_project_slots: number
    updated_at: string
  }>(
    `SELECT
      billing_cycle,
      extra_project_slots,
      updated_at::TEXT
     FROM workspace_billing
     WHERE workspace_id = $1
     LIMIT 1`,
    [input.workspaceId],
  )

  const billingCycle = (billingResult.rows[0]?.billing_cycle || 'monthly') as 'monthly' | 'quarterly' | 'yearly'
  const extraProjectSlots = Math.max(0, Number(billingResult.rows[0]?.extra_project_slots || 0))
  const extraProjects = projectsUnlimited ? 0 : Math.max(0, projectCount - includedProjects - extraProjectSlots)
  const projectExtraAmountCents = extraProjects * extraProjectSlotPriceCents
  const projectSeatAmountCents = chargedProjectSeatsTotal * projectSeatPriceCents

  const includedSeats = Number(plan?.includedSeats || 0)
  const extraSeats = Math.max(0, seatUsed - includedSeats)
  const basePriceCents = Number(plan?.basePriceCents || 0)
  const extraSeatPriceCents = Number(plan?.extraSeatPriceCents || 0)
  const estimatedAmountCents = basePriceCents
    + extraSeats * extraSeatPriceCents
    + projectExtraAmountCents
    + projectSeatAmountCents
  const aiQuotaTotal = Math.max(
    Number(teamQuotaResult.rows[0]?.ai_quota_total || 0),
    Number(plan?.includedAiQuota || 0),
  )
  const includedAiQuota = Number(plan?.includedAiQuota || 0)

  await db.query(
    `INSERT INTO workspace_billing (
      workspace_id,
      plan_id,
      billing_cycle,
      extra_project_slots,
      estimated_amount_cents,
      snapshot_seat_used,
      snapshot_seat_limit,
      snapshot_ai_quota_total,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      NOW()
    )
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      billing_cycle = EXCLUDED.billing_cycle,
      extra_project_slots = EXCLUDED.extra_project_slots,
      estimated_amount_cents = EXCLUDED.estimated_amount_cents,
      snapshot_seat_used = EXCLUDED.snapshot_seat_used,
      snapshot_seat_limit = EXCLUDED.snapshot_seat_limit,
      snapshot_ai_quota_total = EXCLUDED.snapshot_ai_quota_total,
      updated_at = EXCLUDED.updated_at`,
    [
      input.workspaceId,
      plan?.id || null,
      billingCycle,
      extraProjectSlots,
      estimatedAmountCents,
      seatUsed,
      Math.max(Number(teamQuotaResult.rows[0]?.seat_limit || 0), seatUsed),
      aiQuotaTotal,
    ],
  )

  return {
    teamId: input.workspaceId,
    workspaceId: input.workspaceId,
    planId: plan?.id || null,
    planCode: plan?.code || null,
    planTier,
    billingCycle,
    seatUsed,
    includedSeats,
    extraSeats,
    basePriceCents,
    extraSeatPriceCents,
    projectCount,
    includedProjects,
    projectsUnlimited,
    extraProjectSlots,
    extraProjects,
    projectSeatLimitTotal,
    projectSeatUsedTotal,
    chargedProjectSeatsTotal,
    defaultProjectSeatLimit,
    projectSeatPriceCents,
    minChargedProjectSeats,
    chargeAllProjectSeats,
    projectExtraAmountCents,
    projectSeatAmountCents,
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

async function getActiveBillingPlanById(db: Queryable, planId: string): Promise<BillingPlan | null> {
  await ensureDefaultBillingPlans(db)
  const result = await db.query<BillingPlanRow>(
    `SELECT
      id,
      code,
      name,
      plan_tier,
      base_price_cents,
      included_seats,
      extra_seat_price_cents,
      included_ai_quota,
      included_projects,
      projects_unlimited,
      extra_project_slot_price_cents,
      default_project_seat_limit,
      project_seat_price_cents,
      min_charged_project_seats,
      charge_all_project_seats,
      is_enabled AS is_active,
      created_at::TEXT,
      updated_at::TEXT
     FROM billing_plans
     WHERE id = $1
       AND is_enabled = TRUE
     LIMIT 1`,
    [planId],
  )
  return result.rows[0] ? mapBillingPlan(result.rows[0]) : null
}

export async function createWorkspaceBillingMockCheckout(
  db: Queryable,
  input: {
    workspaceId: string
    planId: string
    billingCycle?: 'monthly' | 'quarterly' | 'yearly'
    actorUserId: string
  },
): Promise<{ order: WorkspaceBillingOrder, estimate: WorkspaceBillingEstimate }> {
  const plan = await getActiveBillingPlanById(db, input.planId)
  if (!plan)
    throw new Error('BILLING_PLAN_NOT_FOUND')

  const billingCycle = input.billingCycle || 'monthly'
  await setWorkspaceBillingPlan(db, {
    workspaceId: input.workspaceId,
    planId: plan.id,
    billingCycle,
  })
  const estimate = await estimateWorkspaceBilling(db, { workspaceId: input.workspaceId })
  if (!estimate)
    throw new Error('WORKSPACE_BILLING_ESTIMATE_NOT_FOUND')

  const now = new Date().toISOString()
  const orderId = randomUUID()
  await db.query(
    `INSERT INTO workspace_billing_orders (
      id,
      workspace_id,
      plan_id,
      billing_cycle,
      amount_cents,
      status,
      provider,
      estimate_json,
      created_by_user_id,
      paid_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      'paid', 'mock', $6::JSONB, $7,
      $8, $8, $8
    )`,
    [
      orderId,
      input.workspaceId,
      plan.id,
      billingCycle,
      Math.max(0, Number(estimate.estimatedAmountCents || 0)),
      JSON.stringify(estimate),
      input.actorUserId,
      now,
    ],
  )

  const order = await getWorkspaceBillingOrderById(db, {
    workspaceId: input.workspaceId,
    orderId,
  })
  if (!order)
    throw new Error('WORKSPACE_BILLING_ORDER_NOT_FOUND')

  return { order, estimate }
}

export async function getWorkspaceBillingOrderById(
  db: Queryable,
  input: { workspaceId: string, orderId: string },
): Promise<WorkspaceBillingOrder | null> {
  const result = await db.query<WorkspaceBillingOrderRow>(
    `SELECT
      o.id,
      o.workspace_id,
      o.plan_id,
      p.code AS plan_code,
      p.name AS plan_name,
      o.billing_cycle,
      o.amount_cents,
      o.status,
      o.provider,
      o.estimate_json,
      o.created_by_user_id,
      o.paid_at::TEXT,
      o.created_at::TEXT,
      o.updated_at::TEXT
     FROM workspace_billing_orders o
     JOIN billing_plans p ON p.id = o.plan_id
     WHERE o.workspace_id = $1
       AND o.id = $2
     LIMIT 1`,
    [input.workspaceId, input.orderId],
  )
  return result.rows[0] ? mapWorkspaceBillingOrder(result.rows[0]) : null
}

export async function listWorkspaceBillingOrders(
  db: Queryable,
  input: { workspaceId: string, limit?: number },
): Promise<WorkspaceBillingOrder[]> {
  const result = await db.query<WorkspaceBillingOrderRow>(
    `SELECT
      o.id,
      o.workspace_id,
      o.plan_id,
      p.code AS plan_code,
      p.name AS plan_name,
      o.billing_cycle,
      o.amount_cents,
      o.status,
      o.provider,
      o.estimate_json,
      o.created_by_user_id,
      o.paid_at::TEXT,
      o.created_at::TEXT,
      o.updated_at::TEXT
     FROM workspace_billing_orders o
     JOIN billing_plans p ON p.id = o.plan_id
     WHERE o.workspace_id = $1
     ORDER BY o.created_at DESC
     LIMIT $2`,
    [input.workspaceId, Math.max(1, Math.min(50, Number(input.limit || 10)))],
  )
  return result.rows.map(mapWorkspaceBillingOrder)
}

export async function patchWorkspaceBillingAddons(
  db: Queryable,
  input: {
    workspaceId: string
    extraProjectSlots: number
  },
): Promise<WorkspaceBillingEstimate | null> {
  await ensureDefaultBillingPlans(db)

  const resolved = await resolveWorkspacePlan(db, input.workspaceId)
  if (!resolved.workspaceType)
    return null

  const existing = await db.query<{
    plan_id: string | null
    billing_cycle: 'monthly' | 'quarterly' | 'yearly' | null
  }>(
    `SELECT
      plan_id,
      billing_cycle
     FROM workspace_billing
     WHERE workspace_id = $1
     LIMIT 1`,
    [input.workspaceId],
  )

  const planId = existing.rows[0]?.plan_id || resolved.plan?.id || null
  const billingCycle = existing.rows[0]?.billing_cycle || 'monthly'
  const extraProjectSlots = Math.max(0, Math.trunc(Number(input.extraProjectSlots || 0)))

  await db.query(
    `INSERT INTO workspace_billing (
      workspace_id,
      plan_id,
      billing_cycle,
      extra_project_slots,
      estimated_amount_cents,
      snapshot_seat_used,
      snapshot_seat_limit,
      snapshot_ai_quota_total,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, 0, 0, 0, 0, NOW()
    )
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      billing_cycle = EXCLUDED.billing_cycle,
      extra_project_slots = EXCLUDED.extra_project_slots,
      updated_at = EXCLUDED.updated_at`,
    [input.workspaceId, planId, billingCycle, extraProjectSlots],
  )

  return estimateWorkspaceBilling(db, { workspaceId: input.workspaceId })
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
