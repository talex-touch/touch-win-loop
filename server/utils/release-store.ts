import type { Queryable } from '~~/server/utils/db'
import type {
  Contest,
  ContestLevel,
  ContestReleaseContestSnapshot,
  ContestReleaseResourceSnapshot,
  ContestReleaseSnapshot,
  ContestReleaseTimelineSnapshot,
  ContestReleaseTrackSnapshot,
  ContestReleaseTrackTimelineSnapshot,
  PolicyLibraryItemSnapshot,
  PolicyLibraryReleaseSnapshot,
  PolicyLibraryItemStatus,
  ReleaseDiffSummary,
  ReleaseReviewAction,
  ReleaseReviewLog,
  ReleaseScopeKind,
  ReleaseVersion,
  ReleaseVersionDetail,
  ReleaseVersionStatus,
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
  TimelineNodeType,
} from '~~/shared/types/domain'
import { createHash, randomUUID } from 'node:crypto'
import {
  createAdminContest,
  createAdminResource,
  createAdminRubric,
  createAdminTrack,
  createAdminTrackTimeline,
  getContestDetail,
  listAdminResources,
  listAdminTrackTimelines,
  patchAdminContest,
  patchAdminResource,
  patchAdminRubric,
  patchAdminTrack,
  patchAdminTrackTimeline,
  recordContestAuditLog,
} from '~~/server/utils/contest-store'
import { getFeishuExternalRef, upsertFeishuExternalRef } from '~~/server/utils/feishu-integration-store'
import {
  createPolicyLibraryItem,
  listPolicyLibraryItems,
  patchPolicyLibraryItem,
} from '~~/server/utils/policy-store'
import {
  sanitizeContestReleaseResourceMetadata,
  sanitizeContestReleaseResourceSnapshot,
  sanitizeContestReleaseSnapshot,
} from '~~/server/utils/release-resource-metadata'

interface ReleaseVersionRow {
  id: string
  scope_kind: ReleaseScopeKind
  scope_id: string
  live_entity_id: string
  scope_title: string
  version_number: number | string
  status: ReleaseVersionStatus
  snapshot_json: unknown
  diff_summary_json: unknown
  sync_item_id: string | null
  sync_run_id: string | null
  first_review_by_user_id: string | null
  first_review_at: string | null
  second_review_claimed_by_user_id: string | null
  second_review_claimed_at: string | null
  second_review_by_user_id: string | null
  second_review_at: string | null
  rejected_by_user_id: string | null
  rejected_at: string | null
  reject_reason: string
  published_by_user_id: string | null
  published_at: string | null
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface ReleaseReviewLogRow {
  id: string
  release_version_id: string
  actor_user_id: string | null
  action: ReleaseReviewAction
  payload: unknown
  created_at: string
}

interface FeishuExternalRefRow {
  scope: 'contest' | 'track' | 'track_timeline' | 'resource' | 'policy'
  external_id: string
  entity_id: string
  metadata: unknown
}

const MANAGED_NOTE_PREFIX = '[飞书同步:'
const LEGACY_CONTEST_TIMELINE_PREFIX = 'legacy:contest:'
const DERIVED_CONTEST_TIMELINE_PREFIX = 'derived:contest:'
const LEGACY_TRACK_TIMELINE_PREFIX = 'legacy:track:'
const DERIVED_TRACK_TIMELINE_PREFIX = 'derived:track:'

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.map(item => normalizeText(item)).filter(Boolean)
  const text = normalizeText(value)
  return text ? [text] : []
}

function normalizeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.trunc(parsed)
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeReleaseDiffSummary(value: unknown): ReleaseDiffSummary {
  const source = parseJsonObject(value)
  return {
    createdCount: Math.max(0, normalizeInteger(source.createdCount)),
    updatedCount: Math.max(0, normalizeInteger(source.updatedCount)),
    removedCount: Math.max(0, normalizeInteger(source.removedCount)),
    changedExternalIds: normalizeStringArray(source.changedExternalIds),
  }
}

function createEmptyDiffSummary(): ReleaseDiffSummary {
  return {
    createdCount: 0,
    updatedCount: 0,
    removedCount: 0,
    changedExternalIds: [],
  }
}

function mapReleaseVersion(row: ReleaseVersionRow): ReleaseVersion {
  return {
    id: row.id,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    liveEntityId: normalizeText(row.live_entity_id) || null,
    scopeTitle: row.scope_title,
    versionNumber: normalizeInteger(row.version_number, 1),
    status: row.status,
    snapshot: parseJsonObject(row.snapshot_json),
    diffSummary: normalizeReleaseDiffSummary(row.diff_summary_json),
    syncItemId: row.sync_item_id,
    syncRunId: row.sync_run_id,
    firstReviewByUserId: row.first_review_by_user_id,
    firstReviewAt: row.first_review_at,
    secondReviewClaimedByUserId: row.second_review_claimed_by_user_id,
    secondReviewClaimedAt: row.second_review_claimed_at,
    secondReviewByUserId: row.second_review_by_user_id,
    secondReviewAt: row.second_review_at,
    rejectedByUserId: row.rejected_by_user_id,
    rejectedAt: row.rejected_at,
    rejectReason: row.reject_reason || null,
    publishedByUserId: row.published_by_user_id,
    publishedAt: row.published_at,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapReleaseReviewLog(row: ReleaseReviewLogRow): ReleaseReviewLog {
  return {
    id: row.id,
    releaseVersionId: row.release_version_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    payload: parseJsonObject(row.payload),
    createdAt: row.created_at,
  }
}

function toContestSnapshot(raw: unknown, contestExternalId: string): ContestReleaseSnapshot {
  const source = parseJsonObject(raw)
  return sanitizeContestReleaseSnapshot({
    contestExternalId: normalizeText(source.contestExternalId || contestExternalId) || contestExternalId,
    contest: source.contest && typeof source.contest === 'object'
      ? source.contest as ContestReleaseContestSnapshot
      : null,
    tracks: Array.isArray(source.tracks) ? source.tracks as ContestReleaseTrackSnapshot[] : [],
    timelines: Array.isArray(source.timelines) ? source.timelines as ContestReleaseTimelineSnapshot[] : [],
    trackTimelines: Array.isArray(source.trackTimelines) ? source.trackTimelines as ContestReleaseTrackTimelineSnapshot[] : [],
    resources: Array.isArray(source.resources) ? source.resources as ContestReleaseResourceSnapshot[] : [],
  })
}

function toPolicySnapshot(raw: unknown): PolicyLibraryReleaseSnapshot {
  const source = parseJsonObject(raw)
  return {
    items: Array.isArray(source.items) ? source.items as PolicyLibraryItemSnapshot[] : [],
  }
}

function extractManagedExternalId(note: string): string {
  const matched = normalizeText(note).match(/^\[飞书同步:([^\]]+)\]/)
  return matched?.[1] ? normalizeText(matched[1]) : ''
}

function stripManagedNotePrefix(note: string): string {
  const text = normalizeText(note)
  if (!text.startsWith(MANAGED_NOTE_PREFIX))
    return text
  return text.replace(/^\[飞书同步:[^\]]+\]\s*/, '').trim()
}

function buildManagedNote(externalId: string, note: string): string {
  const suffix = normalizeText(note)
  return suffix
    ? `[飞书同步:${externalId}] ${suffix}`
    : `[飞书同步:${externalId}]`
}

function isManagedContestTimelineNote(note: string): boolean {
  const normalized = normalizeText(note)
  return normalized.startsWith(MANAGED_NOTE_PREFIX)
    || normalized.startsWith('飞书同步报名时间：')
    || normalized.startsWith('飞书同步截止时间：')
    || normalized.startsWith('由飞书同步报名时间推断提交截止时间。')
}

function isManagedDerivedTrackTimelineNote(note: string): boolean {
  const externalId = extractManagedExternalId(note)
  return externalId.startsWith(DERIVED_TRACK_TIMELINE_PREFIX) || externalId.startsWith(LEGACY_TRACK_TIMELINE_PREFIX)
}

function buildTimelineExternalId(prefix: string, scopeExternalId: string, rawLine: string): string {
  const hash = createHash('sha1')
    .update(`${prefix}:${scopeExternalId}:${normalizeText(rawLine)}`)
    .digest('hex')
    .slice(0, 12)
  return `${prefix}${scopeExternalId}:${hash}`
}

export function buildContestDerivedTimelineExternalId(contestExternalId: string, rawLine: string): string {
  return buildTimelineExternalId(DERIVED_CONTEST_TIMELINE_PREFIX, contestExternalId, rawLine)
}

export function buildTrackDerivedTimelineExternalId(trackExternalId: string, rawLine: string): string {
  return buildTimelineExternalId(DERIVED_TRACK_TIMELINE_PREFIX, trackExternalId, rawLine)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(item => stableSerialize(item)).join(',')}]`
  if (!value || typeof value !== 'object')
    return JSON.stringify(value)
  const source = value as Record<string, unknown>
  const keys = Object.keys(source).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableSerialize(source[key])}`).join(',')}}`
}

function computeListDiffSummary<T extends { externalId: string }>(base: T[], current: T[]): ReleaseDiffSummary {
  const createdIds: string[] = []
  const updatedIds: string[] = []
  const removedIds: string[] = []
  const baseMap = new Map(base.map(item => [item.externalId, item]))
  const currentMap = new Map(current.map(item => [item.externalId, item]))

  for (const [externalId, item] of currentMap) {
    const previous = baseMap.get(externalId)
    if (!previous) {
      createdIds.push(externalId)
      continue
    }
    if (stableSerialize(previous) !== stableSerialize(item))
      updatedIds.push(externalId)
  }

  for (const [externalId] of baseMap) {
    if (!currentMap.has(externalId))
      removedIds.push(externalId)
  }

  return {
    createdCount: createdIds.length,
    updatedCount: updatedIds.length,
    removedCount: removedIds.length,
    changedExternalIds: [...new Set([...createdIds, ...updatedIds, ...removedIds])],
  }
}

function mergeDiffSummaries(...items: ReleaseDiffSummary[]): ReleaseDiffSummary {
  return items.reduce<ReleaseDiffSummary>((result, item) => {
    result.createdCount += item.createdCount
    result.updatedCount += item.updatedCount
    result.removedCount += item.removedCount
    result.changedExternalIds = [...new Set([...result.changedExternalIds, ...item.changedExternalIds])]
    return result
  }, createEmptyDiffSummary())
}

function computeContestDiffSummary(base: ContestReleaseSnapshot, current: ContestReleaseSnapshot): ReleaseDiffSummary {
  const contestDiff = (() => {
    const previous = base.contest
    const next = current.contest
    if (!previous && !next)
      return createEmptyDiffSummary()
    if (!previous && next) {
      return {
        createdCount: 1,
        updatedCount: 0,
        removedCount: 0,
        changedExternalIds: [next.externalId],
      }
    }
    if (previous && !next) {
      return {
        createdCount: 0,
        updatedCount: 0,
        removedCount: 1,
        changedExternalIds: [previous.externalId],
      }
    }
    return stableSerialize(previous) === stableSerialize(next)
      ? createEmptyDiffSummary()
      : {
          createdCount: 0,
          updatedCount: 1,
          removedCount: 0,
          changedExternalIds: [next!.externalId],
        }
  })()

  return mergeDiffSummaries(
    contestDiff,
    computeListDiffSummary(base.tracks, current.tracks),
    computeListDiffSummary(base.timelines, current.timelines),
    computeListDiffSummary(base.trackTimelines, current.trackTimelines),
    computeListDiffSummary(base.resources, current.resources),
  )
}

function computePolicyDiffSummary(base: PolicyLibraryReleaseSnapshot, current: PolicyLibraryReleaseSnapshot): ReleaseDiffSummary {
  return computeListDiffSummary(base.items, current.items)
}

function upsertSnapshotItem<T extends { externalId: string }>(items: T[], item: T): { items: T[], existed: boolean } {
  const existed = items.some(current => current.externalId === item.externalId)
  const next = items.filter(current => current.externalId !== item.externalId)
  next.push(item)
  return { items: next, existed }
}

function createEmptyContestSnapshot(contestExternalId: string): ContestReleaseSnapshot {
  return {
    contestExternalId,
    contest: null,
    tracks: [],
    timelines: [],
    trackTimelines: [],
    resources: [],
  }
}

function createEmptyPolicySnapshot(): PolicyLibraryReleaseSnapshot {
  return {
    items: [],
  }
}

function buildContestLegacyTimelinePrefix(contestExternalId: string): string {
  return `${LEGACY_CONTEST_TIMELINE_PREFIX}${contestExternalId}:`
}

function buildContestDerivedTimelinePrefix(contestExternalId: string): string {
  return `${DERIVED_CONTEST_TIMELINE_PREFIX}${contestExternalId}:`
}

function buildTrackLegacyTimelinePrefix(trackExternalId: string): string {
  return `${LEGACY_TRACK_TIMELINE_PREFIX}${trackExternalId}:`
}

function buildTrackDerivedTimelinePrefix(trackExternalId: string): string {
  return `${DERIVED_TRACK_TIMELINE_PREFIX}${trackExternalId}:`
}

async function insertReleaseReviewLog(
  db: Queryable,
  input: {
    releaseVersionId: string
    actorUserId?: string | null
    action: ReleaseReviewAction
    payload?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `INSERT INTO release_review_logs (
      id,
      release_version_id,
      actor_user_id,
      action,
      payload,
      created_at
    ) VALUES ($1, $2, $3, $4, $5::JSONB, NOW())`,
    [
      randomUUID(),
      input.releaseVersionId,
      normalizeText(input.actorUserId) || null,
      input.action,
      JSON.stringify(parseJsonObject(input.payload)),
    ],
  )
}

async function listReleaseScopedVersions(
  db: Queryable,
  input: {
    scopeKind?: ReleaseScopeKind
    scopeId?: string
    liveEntityId?: string
    statuses?: ReleaseVersionStatus[]
    limit?: number
  } = {},
): Promise<ReleaseVersion[]> {
  const where: string[] = ['1=1']
  const values: unknown[] = []

  if (input.scopeKind) {
    values.push(input.scopeKind)
    where.push(`scope_kind = $${values.length}`)
  }

  if (normalizeText(input.scopeId)) {
    values.push(normalizeText(input.scopeId))
    where.push(`scope_id = $${values.length}`)
  }

  if (normalizeText(input.liveEntityId)) {
    values.push(normalizeText(input.liveEntityId))
    where.push(`live_entity_id = $${values.length}`)
  }

  if (input.statuses?.length) {
    values.push(input.statuses)
    where.push(`status = ANY($${values.length}::TEXT[])`)
  }

  const limit = Math.max(1, Math.min(200, normalizeInteger(input.limit || 50, 50)))
  values.push(limit)

  const result = await db.query<ReleaseVersionRow>(
    `SELECT
      id,
      scope_kind,
      scope_id,
      live_entity_id,
      scope_title,
      version_number,
      status,
      snapshot_json,
      diff_summary_json,
      sync_item_id,
      sync_run_id,
      first_review_by_user_id,
      first_review_at::TEXT,
      second_review_claimed_by_user_id,
      second_review_claimed_at::TEXT,
      second_review_by_user_id,
      second_review_at::TEXT,
      rejected_by_user_id,
      rejected_at::TEXT,
      reject_reason,
      published_by_user_id,
      published_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM release_versions
     WHERE ${where.join(' AND ')}
     ORDER BY version_number DESC, created_at DESC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows.map(mapReleaseVersion)
}

export async function listReleaseVersions(
  db: Queryable,
  input: {
    scopeKind?: ReleaseScopeKind
    scopeId?: string
    liveEntityId?: string
    statuses?: ReleaseVersionStatus[]
    limit?: number
  } = {},
): Promise<ReleaseVersion[]> {
  return listReleaseScopedVersions(db, input)
}

export async function listReleaseReviewLogs(
  db: Queryable,
  input: {
    releaseVersionId: string
  },
): Promise<ReleaseReviewLog[]> {
  const result = await db.query<ReleaseReviewLogRow>(
    `SELECT
      id,
      release_version_id,
      actor_user_id,
      action,
      payload,
      created_at::TEXT
     FROM release_review_logs
     WHERE release_version_id = $1
     ORDER BY created_at ASC`,
    [input.releaseVersionId],
  )
  return result.rows.map(mapReleaseReviewLog)
}

export async function getReleaseVersionById(
  db: Queryable,
  releaseVersionId: string,
): Promise<ReleaseVersion | null> {
  const result = await db.query<ReleaseVersionRow>(
    `SELECT
      id,
      scope_kind,
      scope_id,
      live_entity_id,
      scope_title,
      version_number,
      status,
      snapshot_json,
      diff_summary_json,
      sync_item_id,
      sync_run_id,
      first_review_by_user_id,
      first_review_at::TEXT,
      second_review_claimed_by_user_id,
      second_review_claimed_at::TEXT,
      second_review_by_user_id,
      second_review_at::TEXT,
      rejected_by_user_id,
      rejected_at::TEXT,
      reject_reason,
      published_by_user_id,
      published_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM release_versions
     WHERE id = $1
     LIMIT 1`,
    [releaseVersionId],
  )
  return result.rows[0] ? mapReleaseVersion(result.rows[0]) : null
}

export async function getReleaseVersionDetail(
  db: Queryable,
  releaseVersionId: string,
): Promise<ReleaseVersionDetail | null> {
  const version = await getReleaseVersionById(db, releaseVersionId)
  if (!version)
    return null
  return {
    version,
    logs: await listReleaseReviewLogs(db, { releaseVersionId }),
  }
}

export async function listContestReleaseVersions(
  db: Queryable,
  input: {
    contestExternalId?: string
    contestId?: string
    limit?: number
  } = {},
): Promise<ReleaseVersion[]> {
  const scopeId = normalizeText(input.contestExternalId)
  if (scopeId) {
    return listReleaseScopedVersions(db, {
      scopeKind: 'contest',
      scopeId,
      limit: input.limit,
    })
  }

  const contestId = normalizeText(input.contestId)
  if (!contestId)
    return []

  const refResult = await db.query<{ external_id: string }>(
    `SELECT external_id
     FROM feishu_external_refs
     WHERE provider = 'feishu_bitable'
       AND scope = 'contest'
       AND entity_id = $1
     LIMIT 1`,
    [contestId],
  )
  const externalId = normalizeText(refResult.rows[0]?.external_id)

  return listReleaseScopedVersions(db, {
    scopeKind: 'contest',
    scopeId: externalId,
    liveEntityId: contestId,
    limit: input.limit,
  })
}

export async function listPolicyReleaseVersions(
  db: Queryable,
  input: {
    limit?: number
  } = {},
): Promise<ReleaseVersion[]> {
  return listReleaseScopedVersions(db, {
    scopeKind: 'policy_library',
    scopeId: 'policy_library',
    limit: input.limit,
  })
}

export async function listReleaseQueue(
  db: Queryable,
  input: {
    scopeKind?: ReleaseScopeKind
    statuses?: ReleaseVersionStatus[]
    limit?: number
  } = {},
): Promise<ReleaseVersion[]> {
  const statuses = input.statuses?.length
    ? input.statuses
    : ['pending_first_review', 'pending_second_review', 'approved']
  return listReleaseScopedVersions(db, {
    scopeKind: input.scopeKind,
    statuses,
    limit: input.limit || 100,
  })
}

async function getLatestPublishedVersion(
  db: Queryable,
  input: {
    scopeKind: ReleaseScopeKind
    scopeId: string
  },
): Promise<ReleaseVersion | null> {
  const items = await listReleaseScopedVersions(db, {
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    statuses: ['published'],
    limit: 1,
  })
  return items[0] || null
}

async function loadContestScopedRefs(
  db: Queryable,
  input: {
    contestId: string
    contestExternalId: string
  },
): Promise<FeishuExternalRefRow[]> {
  const result = await db.query<FeishuExternalRefRow>(
    `SELECT scope, external_id, entity_id, metadata
     FROM feishu_external_refs
     WHERE provider = 'feishu_bitable'
       AND (
         (scope = 'contest' AND external_id = $1)
         OR (
           scope IN ('track', 'track_timeline', 'resource')
           AND metadata->>'contestId' = $2
         )
       )`,
    [input.contestExternalId, input.contestId],
  )
  return result.rows
}

async function buildContestLiveBaseSnapshot(
  db: Queryable,
  contestExternalId: string,
): Promise<{ snapshot: ContestReleaseSnapshot, liveEntityId: string | null }> {
  const contestRef = await getFeishuExternalRef(db, {
    scope: 'contest',
    externalId: contestExternalId,
  })
  const contestId = normalizeText(contestRef?.entityId)
  if (!contestId)
    return {
      snapshot: createEmptyContestSnapshot(contestExternalId),
      liveEntityId: null,
    }

  const detail = await getContestDetail(db, {
    contestId,
    includeInternal: true,
  })
  if (!detail) {
    return {
      snapshot: createEmptyContestSnapshot(contestExternalId),
      liveEntityId: contestId,
    }
  }

  const [resources, trackTimelines, refs] = await Promise.all([
    listAdminResources(db, { contestId, status: '' }),
    listAdminTrackTimelines(db, contestId),
    loadContestScopedRefs(db, {
      contestId,
      contestExternalId,
    }),
  ])

  const trackRefById = new Map<string, FeishuExternalRefRow>()
  const trackExternalIdByTrackId = new Map<string, string>()
  const resourceRefById = new Map<string, FeishuExternalRefRow>()
  const trackTimelineRefById = new Map<string, FeishuExternalRefRow>()
  for (const row of refs) {
    if (row.scope === 'track') {
      trackRefById.set(row.entity_id, row)
      trackExternalIdByTrackId.set(row.entity_id, row.external_id)
    }
    else if (row.scope === 'resource') {
      resourceRefById.set(row.entity_id, row)
    }
    else if (row.scope === 'track_timeline') {
      trackTimelineRefById.set(row.entity_id, row)
    }
  }

  const rubricByTrackId = new Map(detail.rubrics.map(item => [item.trackId, item]))
  const contestSnapshot: ContestReleaseContestSnapshot = {
    liveId: detail.contest.id,
    externalId: contestExternalId,
    name: detail.contest.name,
    level: detail.contest.level as ContestLevel,
    officialUrl: detail.contest.officialUrl || '',
    summary: detail.contest.summary || '',
    disciplines: detail.contest.disciplines || [],
    keywords: detail.contest.keywords || [],
    recommendedFor: detail.contest.recommendedFor || [],
  }

  const tracks: ContestReleaseTrackSnapshot[] = detail.contest.tracks
    .filter(item => trackRefById.has(item.id))
    .map((item) => {
      const ref = trackRefById.get(item.id)!
      const rubric = rubricByTrackId.get(item.id)
      return {
        liveId: item.id,
        externalId: ref.external_id,
        contestExternalId,
        name: item.name,
        summary: item.summary || '',
        coverImageUrl: item.coverImageUrl || '',
        location: item.location || '',
        organizer: item.organizer || '',
        undertaker: item.undertaker || '',
        participantRequirements: item.participantRequirements || '',
        teamRule: item.teamRule || '',
        awardRatio: item.awardRatio || '',
        suitableMajors: item.suitableMajors || [],
        deliverableTypes: item.deliverableTypes || [],
        sortOrder: normalizeInteger(item.sortOrder),
        evidenceRequirements: rubric?.evidenceRequirements || [],
        scoringPoints: rubric?.scoringPoints || [],
        deductionItems: rubric?.deductionItems || [],
      }
    })

  const timelines: ContestReleaseTimelineSnapshot[] = detail.timelines
    .filter(item => isManagedContestTimelineNote(item.note))
    .map((item, index) => {
      const externalId = extractManagedExternalId(item.note)
        || `${buildContestLegacyTimelinePrefix(contestExternalId)}${item.nodeType}:${item.year}:${index}`
      return {
        externalId,
        year: normalizeInteger(item.year, new Date().getFullYear()),
        nodeType: item.nodeType as TimelineNodeType,
        startAt: item.startAt || null,
        endAt: item.endAt || null,
        note: stripManagedNotePrefix(item.note),
        sourceLink: item.sourceLink || '',
      }
    })

  const snapshotTrackTimelines: ContestReleaseTrackTimelineSnapshot[] = []
  for (const [index, item] of trackTimelines.entries()) {
    const ref = trackTimelineRefById.get(item.id)
    const trackExternalId = trackExternalIdByTrackId.get(item.trackId) || ''
    if (!trackExternalId)
      continue
    const derivedManaged = isManagedDerivedTrackTimelineNote(item.note)
    if (!ref && !derivedManaged)
      continue

    snapshotTrackTimelines.push({
      externalId: ref?.external_id
        || extractManagedExternalId(item.note)
        || `${buildTrackLegacyTimelinePrefix(trackExternalId)}${item.nodeType}:${item.year}:${index}`,
      trackExternalId,
      trackLiveId: item.trackId,
      year: normalizeInteger(item.year, new Date().getFullYear()),
      nodeType: item.nodeType as TimelineNodeType,
      startAt: item.startAt || null,
      endAt: item.endAt || null,
      note: stripManagedNotePrefix(item.note),
      sourceLink: item.sourceLink || '',
    })
  }

  const snapshotResources: ContestReleaseResourceSnapshot[] = resources
    .filter(item => resourceRefById.has(item.id))
    .map((item) => {
      const ref = resourceRefById.get(item.id)!
      const metadata = sanitizeContestReleaseResourceMetadata(item.metadata)
      const trackId = normalizeText(metadata.trackId)
      return {
        liveId: item.id,
        externalId: ref.external_id,
        contestExternalId,
        trackExternalId: trackId ? (trackExternalIdByTrackId.get(trackId) || '') : '',
        trackLiveId: trackId || null,
        title: item.title,
        category: (item.category || 'basic_info') as ResourceCategory,
        url: item.sourceLink,
        year: normalizeInteger(item.year, new Date().getFullYear()),
        summary: item.summary || '',
        content: item.content || '',
        sourceType: item.sourceType || 'feishu_bitable',
        accessLevel: (item.availability || 'public') as ResourceAvailability,
        status: (item.status || 'active') as ResourceStatus,
        metadata,
      }
    })

  return {
    snapshot: {
      contestExternalId,
      contest: contestSnapshot,
      tracks,
      timelines,
      trackTimelines: snapshotTrackTimelines,
      resources: snapshotResources,
    },
    liveEntityId: contestId,
  }
}

async function buildPolicyLiveBaseSnapshot(
  db: Queryable,
): Promise<{ snapshot: PolicyLibraryReleaseSnapshot, liveEntityId: string | null }> {
  const [items, refsResult] = await Promise.all([
    listPolicyLibraryItems(db),
    db.query<FeishuExternalRefRow>(
      `SELECT scope, external_id, entity_id, metadata
       FROM feishu_external_refs
       WHERE provider = 'feishu_bitable'
         AND scope = 'policy'`,
    ),
  ])

  const refByEntityId = new Map<string, FeishuExternalRefRow>()
  for (const row of refsResult.rows)
    refByEntityId.set(row.entity_id, row)

  return {
    snapshot: {
      items: items
        .filter(item => refByEntityId.has(item.id))
        .map((item) => {
          const ref = refByEntityId.get(item.id)!
          return {
            liveId: item.id,
            externalId: ref.external_id,
            meetingName: item.meetingName,
            summary: item.summary || '',
            conferenceDate: item.conferenceDate || '',
            importance: item.importance || '',
            officialMaterial: item.officialMaterial || '',
            officialMaterialLink: item.officialMaterialLink || '',
            wechatMaterial: item.wechatMaterial || '',
            wechatMaterialLink: item.wechatMaterialLink || '',
            weiboMaterial: item.weiboMaterial || '',
            weiboMaterialLink: item.weiboMaterialLink || '',
            douyinMaterial: item.douyinMaterial || '',
            douyinMaterialLink: item.douyinMaterialLink || '',
            xiaohongshuMaterial: item.xiaohongshuMaterial || '',
            xiaohongshuMaterialLink: item.xiaohongshuMaterialLink || '',
            metadata: parseJsonObject(item.metadata),
            status: (item.status || 'active') as PolicyLibraryItemStatus,
          }
        }),
    },
    liveEntityId: 'policy_library',
  }
}

async function loadBaseSnapshot(
  db: Queryable,
  input: {
    scopeKind: ReleaseScopeKind
    scopeId: string
  },
): Promise<{
  contestSnapshot?: ContestReleaseSnapshot
  policySnapshot?: PolicyLibraryReleaseSnapshot
  liveEntityId: string | null
}> {
  const latestPublished = await getLatestPublishedVersion(db, input)
  if (latestPublished) {
    return {
      contestSnapshot: input.scopeKind === 'contest'
        ? toContestSnapshot(latestPublished.snapshot, input.scopeId)
        : undefined,
      policySnapshot: input.scopeKind === 'policy_library'
        ? toPolicySnapshot(latestPublished.snapshot)
        : undefined,
      liveEntityId: normalizeText(latestPublished.liveEntityId) || null,
    }
  }

  if (input.scopeKind === 'contest') {
    const result = await buildContestLiveBaseSnapshot(db, input.scopeId)
    return {
      contestSnapshot: result.snapshot,
      liveEntityId: result.liveEntityId,
    }
  }

  const result = await buildPolicyLiveBaseSnapshot(db)
  return {
    policySnapshot: result.snapshot,
    liveEntityId: result.liveEntityId,
  }
}

async function getOrCreateWorkingReleaseVersion(
  db: Queryable,
  input: {
    actorUserId: string
    scopeKind: ReleaseScopeKind
    scopeId: string
    scopeTitle: string
    syncItemId: string
    syncRunId: string
  },
): Promise<ReleaseVersion> {
  const existingResult = await db.query<ReleaseVersionRow>(
    `SELECT
      id,
      scope_kind,
      scope_id,
      live_entity_id,
      scope_title,
      version_number,
      status,
      snapshot_json,
      diff_summary_json,
      sync_item_id,
      sync_run_id,
      first_review_by_user_id,
      first_review_at::TEXT,
      second_review_claimed_by_user_id,
      second_review_claimed_at::TEXT,
      second_review_by_user_id,
      second_review_at::TEXT,
      rejected_by_user_id,
      rejected_at::TEXT,
      reject_reason,
      published_by_user_id,
      published_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM release_versions
     WHERE scope_kind = $1
       AND scope_id = $2
       AND sync_run_id = $3
     ORDER BY version_number DESC
     LIMIT 1`,
    [input.scopeKind, input.scopeId, input.syncRunId],
  )
  if (existingResult.rows[0])
    return mapReleaseVersion(existingResult.rows[0])

  const latestVersionResult = await db.query<{ version_number: string }>(
    `SELECT COALESCE(MAX(version_number), 0)::TEXT AS version_number
     FROM release_versions
     WHERE scope_kind = $1
       AND scope_id = $2`,
    [input.scopeKind, input.scopeId],
  )
  const versionNumber = normalizeInteger(latestVersionResult.rows[0]?.version_number, 0) + 1
  const base = await loadBaseSnapshot(db, {
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
  })
  const versionId = randomUUID()
  const snapshot = input.scopeKind === 'contest'
    ? base.contestSnapshot || createEmptyContestSnapshot(input.scopeId)
    : base.policySnapshot || createEmptyPolicySnapshot()

  await db.query(
    `UPDATE release_versions
     SET status = 'superseded',
         superseded_by_version_id = $1,
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE scope_kind = $3
       AND scope_id = $4
       AND status IN ('pending_first_review', 'pending_second_review', 'approved')`,
    [versionId, input.actorUserId, input.scopeKind, input.scopeId],
  )

  await db.query(
    `INSERT INTO release_versions (
      id,
      scope_kind,
      scope_id,
      live_entity_id,
      scope_title,
      version_number,
      status,
      snapshot_json,
      diff_summary_json,
      sync_item_id,
      sync_run_id,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'pending_first_review', $7::JSONB, $8::JSONB, $9, $10, $11, $11, NOW(), NOW()
    )`,
    [
      versionId,
      input.scopeKind,
      input.scopeId,
      normalizeText(base.liveEntityId) || '',
      normalizeText(input.scopeTitle) || normalizeText(input.scopeId),
      versionNumber,
      JSON.stringify(snapshot),
      JSON.stringify(createEmptyDiffSummary()),
      input.syncItemId,
      input.syncRunId,
      input.actorUserId,
    ],
  )

  await insertReleaseReviewLog(db, {
    releaseVersionId: versionId,
    actorUserId: input.actorUserId,
    action: 'sync_generated',
    payload: {
      syncItemId: input.syncItemId,
      syncRunId: input.syncRunId,
      scopeKind: input.scopeKind,
      scopeId: input.scopeId,
      versionNumber,
    },
  })

  return getReleaseVersionById(db, versionId).then(item => item!)
}

export async function upsertContestReleaseDraft(
  db: Queryable,
  input: {
    actorUserId: string
    syncItemId: string
    syncRunId: string
    contestExternalId: string
    scopeTitle?: string
    entityType: 'contest' | 'track' | 'track_timeline' | 'resource'
    contest?: ContestReleaseContestSnapshot | null
    track?: ContestReleaseTrackSnapshot | null
    timelines?: ContestReleaseTimelineSnapshot[]
    trackTimelines?: ContestReleaseTrackTimelineSnapshot[]
    resource?: ContestReleaseResourceSnapshot | null
  },
): Promise<{ version: ReleaseVersion, existed: boolean }> {
  const scopeId = normalizeText(input.contestExternalId)
  const version = await getOrCreateWorkingReleaseVersion(db, {
    actorUserId: input.actorUserId,
    scopeKind: 'contest',
    scopeId,
    scopeTitle: normalizeText(input.scopeTitle) || scopeId,
    syncItemId: input.syncItemId,
    syncRunId: input.syncRunId,
  })
  const base = (await loadBaseSnapshot(db, {
    scopeKind: 'contest',
    scopeId,
  })).contestSnapshot || createEmptyContestSnapshot(scopeId)
  const current = toContestSnapshot(version.snapshot, scopeId)

  let existed = false
  let nextScopeTitle = normalizeText(version.scopeTitle) || scopeId

  if (input.entityType === 'contest') {
    existed = Boolean(current.contest)
    current.contest = input.contest || null
    current.timelines = [
      ...current.timelines.filter(item =>
        !item.externalId.startsWith(buildContestDerivedTimelinePrefix(scopeId))
        && !item.externalId.startsWith(buildContestLegacyTimelinePrefix(scopeId)),
      ),
      ...(input.timelines || []),
    ]
    if (input.contest?.name)
      nextScopeTitle = input.contest.name
  }

  if (input.entityType === 'track' && input.track) {
    const trackResult = upsertSnapshotItem(current.tracks, input.track)
    current.tracks = trackResult.items
    existed = trackResult.existed
    current.trackTimelines = [
      ...current.trackTimelines.filter(item =>
        item.trackExternalId !== input.track!.externalId
        || (
          !item.externalId.startsWith(buildTrackDerivedTimelinePrefix(input.track!.externalId))
          && !item.externalId.startsWith(buildTrackLegacyTimelinePrefix(input.track!.externalId))
        ),
      ),
      ...(input.trackTimelines || []),
    ]
  }

  if (input.entityType === 'track_timeline' && input.trackTimelines?.[0]) {
    const timelineResult = upsertSnapshotItem(current.trackTimelines, input.trackTimelines[0])
    current.trackTimelines = timelineResult.items
    existed = timelineResult.existed
  }

  if (input.entityType === 'resource' && input.resource) {
    const resourceResult = upsertSnapshotItem(current.resources, sanitizeContestReleaseResourceSnapshot(input.resource))
    current.resources = resourceResult.items
    existed = resourceResult.existed
  }

  current.tracks.sort((left, right) => normalizeInteger(left.sortOrder) - normalizeInteger(right.sortOrder))

  const sanitizedCurrent = sanitizeContestReleaseSnapshot(current)
  const diffSummary = computeContestDiffSummary(base, sanitizedCurrent)
  await db.query(
    `UPDATE release_versions
     SET scope_title = $2,
         snapshot_json = $3::JSONB,
         diff_summary_json = $4::JSONB,
         updated_by_user_id = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [
      version.id,
      nextScopeTitle,
      JSON.stringify(sanitizedCurrent),
      JSON.stringify(diffSummary),
      input.actorUserId,
    ],
  )

  return {
    version: (await getReleaseVersionById(db, version.id))!,
    existed,
  }
}

export async function upsertPolicyLibraryReleaseDraft(
  db: Queryable,
  input: {
    actorUserId: string
    syncItemId: string
    syncRunId: string
    scopeTitle?: string
    item: PolicyLibraryItemSnapshot
  },
): Promise<{ version: ReleaseVersion, existed: boolean }> {
  const scopeId = 'policy_library'
  const version = await getOrCreateWorkingReleaseVersion(db, {
    actorUserId: input.actorUserId,
    scopeKind: 'policy_library',
    scopeId,
    scopeTitle: normalizeText(input.scopeTitle) || '政策库',
    syncItemId: input.syncItemId,
    syncRunId: input.syncRunId,
  })
  const base = (await loadBaseSnapshot(db, {
    scopeKind: 'policy_library',
    scopeId,
  })).policySnapshot || createEmptyPolicySnapshot()
  const current = toPolicySnapshot(version.snapshot)
  const merged = upsertSnapshotItem(current.items, input.item)
  current.items = merged.items
  const diffSummary = computePolicyDiffSummary(base, current)

  await db.query(
    `UPDATE release_versions
     SET scope_title = $2,
         snapshot_json = $3::JSONB,
         diff_summary_json = $4::JSONB,
         updated_by_user_id = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [
      version.id,
      normalizeText(input.scopeTitle) || '政策库',
      JSON.stringify(current),
      JSON.stringify(diffSummary),
      input.actorUserId,
    ],
  )

  return {
    version: (await getReleaseVersionById(db, version.id))!,
    existed: merged.existed,
  }
}

export async function claimRandomPendingSecondReviewRelease(
  db: Queryable,
  input: {
    actorUserId: string
    scopeKind?: ReleaseScopeKind
  },
): Promise<ReleaseVersion | null> {
  const values: unknown[] = [input.actorUserId]
  let scopeFilter = ''
  if (input.scopeKind) {
    values.push(input.scopeKind)
    scopeFilter = `AND scope_kind = $${values.length}`
  }

  const result = await db.query<ReleaseVersionRow>(
    `WITH picked AS (
      SELECT id
      FROM release_versions
      WHERE status = 'pending_second_review'
        AND COALESCE(first_review_by_user_id, '') <> $1
        AND COALESCE(second_review_claimed_by_user_id, '') = ''
        ${scopeFilter}
      ORDER BY RANDOM()
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE release_versions AS rv
    SET second_review_claimed_by_user_id = $1,
        second_review_claimed_at = NOW(),
        updated_by_user_id = $1,
        updated_at = NOW()
    FROM picked
    WHERE rv.id = picked.id
    RETURNING
      rv.id,
      rv.scope_kind,
      rv.scope_id,
      rv.live_entity_id,
      rv.scope_title,
      rv.version_number,
      rv.status,
      rv.snapshot_json,
      rv.diff_summary_json,
      rv.sync_item_id,
      rv.sync_run_id,
      rv.first_review_by_user_id,
      rv.first_review_at::TEXT,
      rv.second_review_claimed_by_user_id,
      rv.second_review_claimed_at::TEXT,
      rv.second_review_by_user_id,
      rv.second_review_at::TEXT,
      rv.rejected_by_user_id,
      rv.rejected_at::TEXT,
      rv.reject_reason,
      rv.published_by_user_id,
      rv.published_at::TEXT,
      rv.created_by_user_id,
      rv.updated_by_user_id,
      rv.created_at::TEXT,
      rv.updated_at::TEXT`,
    values,
  )
  const row = result.rows[0]
  if (!row)
    return null

  await insertReleaseReviewLog(db, {
    releaseVersionId: row.id,
    actorUserId: input.actorUserId,
    action: 'second_review_claimed',
    payload: {},
  })

  return mapReleaseVersion(row)
}

async function getLockedReleaseVersion(db: Queryable, releaseVersionId: string): Promise<ReleaseVersionRow | null> {
  const result = await db.query<ReleaseVersionRow>(
    `SELECT
      id,
      scope_kind,
      scope_id,
      live_entity_id,
      scope_title,
      version_number,
      status,
      snapshot_json,
      diff_summary_json,
      sync_item_id,
      sync_run_id,
      first_review_by_user_id,
      first_review_at::TEXT,
      second_review_claimed_by_user_id,
      second_review_claimed_at::TEXT,
      second_review_by_user_id,
      second_review_at::TEXT,
      rejected_by_user_id,
      rejected_at::TEXT,
      reject_reason,
      published_by_user_id,
      published_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM release_versions
     WHERE id = $1
     FOR UPDATE`,
    [releaseVersionId],
  )
  return result.rows[0] || null
}

export async function approveReleaseVersion(
  db: Queryable,
  input: {
    actorUserId: string
    releaseVersionId: string
    stage: 'first' | 'second'
  },
): Promise<ReleaseVersion> {
  const row = await getLockedReleaseVersion(db, input.releaseVersionId)
  if (!row)
    throw new Error('RELEASE_VERSION_NOT_FOUND')

  if (input.stage === 'first') {
    if (row.status !== 'pending_first_review')
      throw new Error('RELEASE_FIRST_REVIEW_STATUS_INVALID')

    await db.query(
      `UPDATE release_versions
       SET status = 'pending_second_review',
           first_review_by_user_id = $2,
           first_review_at = NOW(),
           updated_by_user_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [input.releaseVersionId, input.actorUserId],
    )
    await insertReleaseReviewLog(db, {
      releaseVersionId: input.releaseVersionId,
      actorUserId: input.actorUserId,
      action: 'first_review_approved',
      payload: {},
    })
  }
  else {
    if (row.status !== 'pending_second_review')
      throw new Error('RELEASE_SECOND_REVIEW_STATUS_INVALID')
    if (normalizeText(row.first_review_by_user_id) === normalizeText(input.actorUserId))
      throw new Error('RELEASE_SECOND_REVIEWER_CONFLICT')
    if (!normalizeText(row.second_review_claimed_by_user_id))
      throw new Error('RELEASE_SECOND_REVIEW_NOT_CLAIMED')
    if (normalizeText(row.second_review_claimed_by_user_id) !== normalizeText(input.actorUserId))
      throw new Error('RELEASE_SECOND_REVIEW_ALREADY_CLAIMED')

    await db.query(
      `UPDATE release_versions
       SET status = 'approved',
           second_review_claimed_by_user_id = $2,
           second_review_claimed_at = COALESCE(second_review_claimed_at, NOW()),
           second_review_by_user_id = $2,
           second_review_at = NOW(),
           updated_by_user_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [input.releaseVersionId, input.actorUserId],
    )
    await insertReleaseReviewLog(db, {
      releaseVersionId: input.releaseVersionId,
      actorUserId: input.actorUserId,
      action: 'second_review_approved',
      payload: {},
    })
  }

  return getReleaseVersionById(db, input.releaseVersionId).then(item => item!)
}

export async function rejectReleaseVersion(
  db: Queryable,
  input: {
    actorUserId: string
    releaseVersionId: string
    reason?: string
  },
): Promise<ReleaseVersion> {
  const row = await getLockedReleaseVersion(db, input.releaseVersionId)
  if (!row)
    throw new Error('RELEASE_VERSION_NOT_FOUND')
  if (!['pending_first_review', 'pending_second_review', 'approved'].includes(row.status))
    throw new Error('RELEASE_REJECT_STATUS_INVALID')
  if (row.status === 'pending_second_review') {
    if (normalizeText(row.first_review_by_user_id) === normalizeText(input.actorUserId))
      throw new Error('RELEASE_SECOND_REVIEWER_CONFLICT')
    if (!normalizeText(row.second_review_claimed_by_user_id))
      throw new Error('RELEASE_SECOND_REVIEW_NOT_CLAIMED')
    if (normalizeText(row.second_review_claimed_by_user_id) !== normalizeText(input.actorUserId))
      throw new Error('RELEASE_SECOND_REVIEW_ALREADY_CLAIMED')
  }

  await db.query(
    `UPDATE release_versions
     SET status = 'rejected',
         rejected_by_user_id = $2,
         rejected_at = NOW(),
         reject_reason = $3,
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.releaseVersionId, input.actorUserId, normalizeText(input.reason)],
  )
  await insertReleaseReviewLog(db, {
    releaseVersionId: input.releaseVersionId,
    actorUserId: input.actorUserId,
    action: 'rejected',
    payload: {
      reason: normalizeText(input.reason),
    },
  })

  return getReleaseVersionById(db, input.releaseVersionId).then(item => item!)
}

async function syncTrackRubricBySnapshot(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    trackId: string
    rubricId?: string | null
    track: ContestReleaseTrackSnapshot
  },
): Promise<string | null> {
  const evidenceRequirements = input.track.evidenceRequirements || []
  const scoringPoints = input.track.scoringPoints || []
  const deductionItems = input.track.deductionItems || []
  const hasRubricContent = evidenceRequirements.length > 0 || scoringPoints.length > 0 || deductionItems.length > 0

  if (!input.rubricId && !hasRubricContent)
    return null

  if (input.rubricId) {
    const patched = await patchAdminRubric(db, {
      actorUserId: input.actorUserId,
      contestId: input.contestId,
      rubricId: input.rubricId,
      patch: {
        scoringPoints,
        deductionItems,
        evidenceRequirements,
        status: 'published',
      },
    })
    return patched?.id || input.rubricId
  }

  const created = await createAdminRubric(db, {
    actorUserId: input.actorUserId,
    contestId: input.contestId,
    trackId: input.trackId,
    dimensions: [{
      key: 'overall',
      name: '综合评估',
      weight: 100,
      description: '飞书同步发布自动创建的默认维度。',
    }],
    scoringPoints,
    deductionItems,
    evidenceRequirements,
    status: 'published',
  })
  return created.id
}

async function publishContestRelease(
  db: Queryable,
  input: {
    actorUserId: string
    version: ReleaseVersion
  },
): Promise<{ liveEntityId: string, snapshot: ContestReleaseSnapshot }> {
  const snapshot = toContestSnapshot(input.version.snapshot, input.version.scopeId)
  let contestId = normalizeText(input.version.liveEntityId || '') || normalizeText(snapshot.contest?.liveId || '')
  if (!contestId) {
    const contestRef = await getFeishuExternalRef(db, {
      scope: 'contest',
      externalId: input.version.scopeId,
    })
    contestId = normalizeText(contestRef?.entityId)
  }

  if (snapshot.contest) {
    if (contestId) {
      const patched = await patchAdminContest(db, {
        actorUserId: input.actorUserId,
        contestId,
        bypassSourceOfTruthGuard: true,
        patch: {
          name: snapshot.contest.name,
          level: snapshot.contest.level,
          officialUrl: normalizeText(snapshot.contest.officialUrl),
          summary: normalizeText(snapshot.contest.summary),
          disciplines: snapshot.contest.disciplines || [],
          keywords: snapshot.contest.keywords || [],
          recommendedFor: snapshot.contest.recommendedFor || [],
        },
      })
      contestId = normalizeText(patched?.id || contestId)
    }
    else {
      const created = await createAdminContest(db, {
        actorUserId: input.actorUserId,
        name: snapshot.contest.name,
        level: snapshot.contest.level,
        officialUrl: normalizeText(snapshot.contest.officialUrl),
        summary: normalizeText(snapshot.contest.summary),
        disciplines: snapshot.contest.disciplines || [],
        keywords: snapshot.contest.keywords || [],
        recommendedFor: snapshot.contest.recommendedFor || [],
      })
      contestId = created.id
    }
    snapshot.contest.liveId = contestId
    await upsertFeishuExternalRef(db, {
      syncItemId: normalizeText(input.version.syncItemId) || input.version.id,
      scope: 'contest',
      externalId: input.version.scopeId,
      entityId: contestId,
    })
  }

  if (!contestId)
    throw new Error('RELEASE_CONTEST_LIVE_ENTITY_REQUIRED')

  const currentRefs = await loadContestScopedRefs(db, {
    contestId,
    contestExternalId: input.version.scopeId,
  })
  const trackRefByExternalId = new Map<string, FeishuExternalRefRow>()
  const resourceRefByExternalId = new Map<string, FeishuExternalRefRow>()
  const directTrackTimelineRefByExternalId = new Map<string, FeishuExternalRefRow>()
  for (const row of currentRefs) {
    if (row.scope === 'track')
      trackRefByExternalId.set(row.external_id, row)
    else if (row.scope === 'resource')
      resourceRefByExternalId.set(row.external_id, row)
    else if (row.scope === 'track_timeline')
      directTrackTimelineRefByExternalId.set(row.external_id, row)
  }

  const liveDetail = await getContestDetail(db, {
    contestId,
    includeInternal: true,
  })
  const rubricIdByTrackId = new Map<string, string>()
  if (liveDetail) {
    for (const track of liveDetail.contest.tracks)
      rubricIdByTrackId.set(track.id, normalizeText(track.rubricId) || '')
  }

  const trackIdByExternalId = new Map<string, string>()
  for (const track of snapshot.tracks) {
    const existingRef = trackRefByExternalId.get(track.externalId)
    let trackId = normalizeText(track.liveId || '') || normalizeText(existingRef?.entity_id)
    if (trackId) {
      const patched = await patchAdminTrack(db, {
        actorUserId: input.actorUserId,
        contestId,
        trackId,
        bypassSourceOfTruthGuard: true,
        patch: {
          name: track.name,
          summary: normalizeText(track.summary),
          coverImageUrl: normalizeText(track.coverImageUrl),
          location: normalizeText(track.location),
          organizer: normalizeText(track.organizer),
          undertaker: normalizeText(track.undertaker),
          participantRequirements: normalizeText(track.participantRequirements),
          teamRule: normalizeText(track.teamRule),
          awardRatio: normalizeText(track.awardRatio),
          suitableMajors: track.suitableMajors || [],
          deliverableTypes: track.deliverableTypes || [],
          sortOrder: normalizeInteger(track.sortOrder),
          status: 'published',
        },
      })
      trackId = normalizeText(patched?.id || trackId)
    }
    else {
      const created = await createAdminTrack(db, {
        actorUserId: input.actorUserId,
        contestId,
        name: track.name,
        summary: normalizeText(track.summary),
        coverImageUrl: normalizeText(track.coverImageUrl),
        location: normalizeText(track.location),
        organizer: normalizeText(track.organizer),
        undertaker: normalizeText(track.undertaker),
        participantRequirements: normalizeText(track.participantRequirements),
        teamRule: normalizeText(track.teamRule),
        awardRatio: normalizeText(track.awardRatio),
        suitableMajors: track.suitableMajors || [],
        deliverableTypes: track.deliverableTypes || [],
        sortOrder: normalizeInteger(track.sortOrder),
        status: 'published',
      })
      trackId = created.id
    }

    const rubricId = await syncTrackRubricBySnapshot(db, {
      actorUserId: input.actorUserId,
      contestId,
      trackId,
      rubricId: rubricIdByTrackId.get(trackId) || null,
      track,
    })
    if (rubricId)
      rubricIdByTrackId.set(trackId, rubricId)

    await upsertFeishuExternalRef(db, {
      syncItemId: normalizeText(input.version.syncItemId) || input.version.id,
      scope: 'track',
      externalId: track.externalId,
      entityId: trackId,
      metadata: {
        contestId,
      },
    })
    track.liveId = trackId
    trackIdByExternalId.set(track.externalId, trackId)
  }

  const activeTrackExternalIds = new Set(snapshot.tracks.map(item => item.externalId))
  for (const [externalId, ref] of trackRefByExternalId) {
    if (activeTrackExternalIds.has(externalId))
      continue
    const trackId = normalizeText(ref.entity_id)
    if (!trackId)
      continue
    await patchAdminTrack(db, {
      actorUserId: input.actorUserId,
      contestId,
      trackId,
      bypassSourceOfTruthGuard: true,
      patch: {
        status: 'archived',
      },
    })
    const archivedRubricId = rubricIdByTrackId.get(trackId)
    if (archivedRubricId) {
      await patchAdminRubric(db, {
        actorUserId: input.actorUserId,
        contestId,
        rubricId: archivedRubricId,
        patch: {
          status: 'archived',
        },
      })
    }
  }

  await db.query(
    `DELETE FROM contest_timelines
     WHERE contest_id = $1
       AND (
         note LIKE '[飞书同步:%'
         OR note LIKE '飞书同步报名时间：%'
         OR note LIKE '飞书同步截止时间：%'
         OR note LIKE '由飞书同步报名时间推断提交截止时间。%'
       )`,
    [contestId],
  )
  for (const timeline of snapshot.timelines) {
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        randomUUID(),
        contestId,
        normalizeInteger(timeline.year, new Date().getFullYear()),
        timeline.nodeType,
        timeline.startAt || null,
        timeline.endAt || null,
        buildManagedNote(timeline.externalId, timeline.note),
        normalizeText(timeline.sourceLink),
      ],
    )
  }

  const directTrackTimelines = snapshot.trackTimelines.filter(item => !item.externalId.startsWith(DERIVED_TRACK_TIMELINE_PREFIX))
  const derivedTrackTimelines = snapshot.trackTimelines.filter(item => item.externalId.startsWith(DERIVED_TRACK_TIMELINE_PREFIX))

  const activeDirectTrackTimelineExternalIds = new Set(directTrackTimelines.map(item => item.externalId))
  for (const [externalId, ref] of directTrackTimelineRefByExternalId) {
    if (activeDirectTrackTimelineExternalIds.has(externalId))
      continue
    await db.query(
      `DELETE FROM contest_track_timelines
       WHERE id = $1`,
      [ref.entity_id],
    )
    await db.query(
      `DELETE FROM feishu_external_refs
       WHERE provider = 'feishu_bitable'
         AND scope = 'track_timeline'
         AND external_id = $1`,
      [externalId],
    )
  }

  for (const timeline of directTrackTimelines) {
    const trackId = trackIdByExternalId.get(timeline.trackExternalId) || normalizeText(timeline.trackLiveId)
    if (!trackId)
      throw new Error(`RELEASE_TRACK_TIMELINE_TRACK_NOT_FOUND:${timeline.trackExternalId}`)

    const existingRef = directTrackTimelineRefByExternalId.get(timeline.externalId)
    let timelineId = normalizeText(existingRef?.entity_id)
    if (timelineId) {
      const patched = await patchAdminTrackTimeline(db, {
        actorUserId: input.actorUserId,
        contestId,
        trackTimelineId: timelineId,
        patch: {
          trackId,
          year: normalizeInteger(timeline.year, new Date().getFullYear()),
          nodeType: timeline.nodeType,
          startAt: timeline.startAt || null,
          endAt: timeline.endAt || null,
          note: buildManagedNote(timeline.externalId, timeline.note),
          sourceLink: normalizeText(timeline.sourceLink),
        },
      })
      timelineId = normalizeText(patched?.id || timelineId)
    }
    else {
      const created = await createAdminTrackTimeline(db, {
        actorUserId: input.actorUserId,
        contestId,
        trackId,
        year: normalizeInteger(timeline.year, new Date().getFullYear()),
        nodeType: timeline.nodeType,
        startAt: timeline.startAt || null,
        endAt: timeline.endAt || null,
        note: buildManagedNote(timeline.externalId, timeline.note),
        sourceLink: normalizeText(timeline.sourceLink),
      })
      timelineId = created.id
    }

    await upsertFeishuExternalRef(db, {
      syncItemId: normalizeText(input.version.syncItemId) || input.version.id,
      scope: 'track_timeline',
      externalId: timeline.externalId,
      entityId: timelineId,
      metadata: {
        contestId,
        trackId,
      },
    })
  }

  await db.query(
    `DELETE FROM contest_track_timelines
     WHERE contest_id = $1
       AND note LIKE '[飞书同步:derived:track:%'`,
    [contestId],
  )
  for (const timeline of derivedTrackTimelines) {
    const trackId = trackIdByExternalId.get(timeline.trackExternalId) || normalizeText(timeline.trackLiveId)
    if (!trackId)
      throw new Error(`RELEASE_TRACK_TIMELINE_TRACK_NOT_FOUND:${timeline.trackExternalId}`)

    await db.query(
      `INSERT INTO contest_track_timelines (
        id,
        contest_id,
        track_id,
        year,
        node_type,
        start_at,
        end_at,
        note,
        source_link,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [
        randomUUID(),
        contestId,
        trackId,
        normalizeInteger(timeline.year, new Date().getFullYear()),
        timeline.nodeType,
        timeline.startAt || null,
        timeline.endAt || null,
        buildManagedNote(timeline.externalId, timeline.note),
        normalizeText(timeline.sourceLink),
      ],
    )
  }

  const activeResourceExternalIds = new Set(snapshot.resources.map(item => item.externalId))
  for (const resource of snapshot.resources) {
    const existingRef = resourceRefByExternalId.get(resource.externalId)
    const trackId = resource.trackExternalId ? (trackIdByExternalId.get(resource.trackExternalId) || '') : ''
    const metadata = {
      ...sanitizeContestReleaseResourceMetadata(resource.metadata),
      trackId,
      source: 'feishu_bitable',
      releaseVersionId: input.version.id,
    }

    let resourceId = normalizeText(resource.liveId || '') || normalizeText(existingRef?.entity_id)
    if (resourceId) {
      const patched = await patchAdminResource(db, {
        actorUserId: input.actorUserId,
        contestId,
        resourceId,
        bypassSourceOfTruthGuard: true,
        patch: {
          category: (resource.category || 'basic_info') as ResourceCategory,
          title: resource.title,
          year: resource.year,
          url: normalizeText(resource.url),
          accessLevel: (resource.accessLevel || 'public') as ResourceAvailability,
          sourceType: normalizeText(resource.sourceType) || 'feishu_bitable',
          summary: normalizeText(resource.summary),
          content: normalizeText(resource.content),
          metadata,
          status: (resource.status || 'active') as ResourceStatus,
        },
      })
      resourceId = normalizeText(patched?.id || resourceId)
    }
    else {
      const created = await createAdminResource(db, {
        actorUserId: input.actorUserId,
        contestId,
        category: (resource.category || 'basic_info') as ResourceCategory,
        title: resource.title,
        year: normalizeInteger(resource.year, new Date().getFullYear()),
        url: normalizeText(resource.url),
        accessLevel: (resource.accessLevel || 'public') as ResourceAvailability,
        sourceType: normalizeText(resource.sourceType) || 'feishu_bitable',
        summary: normalizeText(resource.summary),
        content: normalizeText(resource.content),
        metadata,
        status: (resource.status || 'active') as ResourceStatus,
      })
      resourceId = created.id
    }

    await upsertFeishuExternalRef(db, {
      syncItemId: normalizeText(input.version.syncItemId) || input.version.id,
      scope: 'resource',
      externalId: resource.externalId,
      entityId: resourceId,
      metadata: {
        contestId,
        trackId,
      },
    })
    resource.liveId = resourceId
    resource.trackLiveId = trackId || null
  }

  for (const [externalId, ref] of resourceRefByExternalId) {
    if (activeResourceExternalIds.has(externalId))
      continue
    const resourceId = normalizeText(ref.entity_id)
    if (!resourceId)
      continue
    await patchAdminResource(db, {
      actorUserId: input.actorUserId,
      contestId,
      resourceId,
      bypassSourceOfTruthGuard: true,
      patch: {
        status: 'archived',
      },
    })
  }

  await db.query(
    `UPDATE contests
     SET status = 'published',
         visibility = 'public',
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [contestId, input.actorUserId],
  )

  await recordContestAuditLog(db, {
    actorUserId: input.actorUserId,
    contestId,
    action: 'release.publish',
    payload: {
      releaseVersionId: input.version.id,
      versionNumber: input.version.versionNumber,
      trackCount: snapshot.tracks.length,
      timelineCount: snapshot.timelines.length,
      trackTimelineCount: snapshot.trackTimelines.length,
      resourceCount: snapshot.resources.length,
    },
  })

  return {
    liveEntityId: contestId,
    snapshot,
  }
}

async function publishPolicyRelease(
  db: Queryable,
  input: {
    actorUserId: string
    version: ReleaseVersion
  },
): Promise<{ liveEntityId: string, snapshot: PolicyLibraryReleaseSnapshot }> {
  const snapshot = toPolicySnapshot(input.version.snapshot)
  const refResult = await db.query<FeishuExternalRefRow>(
    `SELECT scope, external_id, entity_id, metadata
     FROM feishu_external_refs
     WHERE provider = 'feishu_bitable'
       AND scope = 'policy'`,
    [],
  )
  const refByExternalId = new Map<string, FeishuExternalRefRow>()
  for (const row of refResult.rows)
    refByExternalId.set(row.external_id, row)

  const activeExternalIds = new Set(snapshot.items.map(item => item.externalId))
  for (const item of snapshot.items) {
    const existingRef = refByExternalId.get(item.externalId)
    let policyId = normalizeText(item.liveId || '') || normalizeText(existingRef?.entity_id)
    if (policyId) {
      const patched = await patchPolicyLibraryItem(db, {
        actorUserId: input.actorUserId,
        policyId,
        patch: {
          meetingName: item.meetingName,
          summary: normalizeText(item.summary),
          conferenceDate: normalizeText(item.conferenceDate),
          importance: normalizeText(item.importance),
          officialMaterial: normalizeText(item.officialMaterial),
          officialMaterialLink: normalizeText(item.officialMaterialLink),
          wechatMaterial: normalizeText(item.wechatMaterial),
          wechatMaterialLink: normalizeText(item.wechatMaterialLink),
          weiboMaterial: normalizeText(item.weiboMaterial),
          weiboMaterialLink: normalizeText(item.weiboMaterialLink),
          douyinMaterial: normalizeText(item.douyinMaterial),
          douyinMaterialLink: normalizeText(item.douyinMaterialLink),
          xiaohongshuMaterial: normalizeText(item.xiaohongshuMaterial),
          xiaohongshuMaterialLink: normalizeText(item.xiaohongshuMaterialLink),
          metadata: parseJsonObject(item.metadata),
          status: (item.status || 'active') as PolicyLibraryItemStatus,
        },
      })
      policyId = normalizeText(patched?.id || policyId)
    }
    else {
      const created = await createPolicyLibraryItem(db, {
        actorUserId: input.actorUserId,
        meetingName: item.meetingName,
        summary: normalizeText(item.summary),
        conferenceDate: normalizeText(item.conferenceDate),
        importance: normalizeText(item.importance),
        officialMaterial: normalizeText(item.officialMaterial),
        officialMaterialLink: normalizeText(item.officialMaterialLink),
        wechatMaterial: normalizeText(item.wechatMaterial),
        wechatMaterialLink: normalizeText(item.wechatMaterialLink),
        weiboMaterial: normalizeText(item.weiboMaterial),
        weiboMaterialLink: normalizeText(item.weiboMaterialLink),
        douyinMaterial: normalizeText(item.douyinMaterial),
        douyinMaterialLink: normalizeText(item.douyinMaterialLink),
        xiaohongshuMaterial: normalizeText(item.xiaohongshuMaterial),
        xiaohongshuMaterialLink: normalizeText(item.xiaohongshuMaterialLink),
        metadata: parseJsonObject(item.metadata),
        status: (item.status || 'active') as PolicyLibraryItemStatus,
      })
      policyId = created.id
    }

    await upsertFeishuExternalRef(db, {
      syncItemId: normalizeText(input.version.syncItemId) || input.version.id,
      scope: 'policy',
      externalId: item.externalId,
      entityId: policyId,
    })
    item.liveId = policyId
  }

  for (const [externalId, ref] of refByExternalId) {
    if (activeExternalIds.has(externalId))
      continue
    const policyId = normalizeText(ref.entity_id)
    if (!policyId)
      continue
    await patchPolicyLibraryItem(db, {
      actorUserId: input.actorUserId,
      policyId,
      patch: {
        status: 'archived',
      },
    })
  }

  return {
    liveEntityId: 'policy_library',
    snapshot,
  }
}

export async function publishReleaseVersion(
  db: Queryable,
  input: {
    actorUserId: string
    releaseVersionId: string
  },
): Promise<ReleaseVersion> {
  const locked = await getLockedReleaseVersion(db, input.releaseVersionId)
  if (!locked)
    throw new Error('RELEASE_VERSION_NOT_FOUND')
  if (locked.status !== 'approved')
    throw new Error('RELEASE_PUBLISH_STATUS_INVALID')

  const version = mapReleaseVersion(locked)
  let liveEntityId = normalizeText(version.liveEntityId) || ''
  let nextSnapshot: Record<string, unknown> = version.snapshot

  if (version.scopeKind === 'contest') {
    const published = await publishContestRelease(db, {
      actorUserId: input.actorUserId,
      version,
    })
    liveEntityId = published.liveEntityId
    nextSnapshot = published.snapshot as unknown as Record<string, unknown>
  }
  else {
    const published = await publishPolicyRelease(db, {
      actorUserId: input.actorUserId,
      version,
    })
    liveEntityId = published.liveEntityId
    nextSnapshot = published.snapshot as unknown as Record<string, unknown>
  }

  await db.query(
    `UPDATE release_versions
     SET status = 'superseded',
         superseded_by_version_id = $1,
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE scope_kind = $3
       AND scope_id = $4
       AND status = 'published'
       AND id <> $1`,
    [version.id, input.actorUserId, version.scopeKind, version.scopeId],
  )

  await db.query(
    `UPDATE release_versions
     SET status = 'published',
         live_entity_id = $2,
         snapshot_json = $3::JSONB,
         published_by_user_id = $4,
         published_at = NOW(),
         updated_by_user_id = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [
      version.id,
      liveEntityId,
      JSON.stringify(nextSnapshot),
      input.actorUserId,
    ],
  )

  await insertReleaseReviewLog(db, {
    releaseVersionId: version.id,
    actorUserId: input.actorUserId,
    action: 'published',
    payload: {
      liveEntityId,
    },
  })

  return getReleaseVersionById(db, version.id).then(item => item!)
}
