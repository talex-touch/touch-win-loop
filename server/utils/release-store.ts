import type { Queryable } from '~~/server/utils/db'
import type {
  AdminContestListItem,
  AdminReleaseQueueResult,
  ContestAuditAggregates,
  ContestLevel,
  ContestReleaseContestSnapshot,
  ContestReleaseResourceSnapshot,
  ContestReleaseSnapshot,
  ContestReleaseTimelineSnapshot,
  ContestReleaseTrackSnapshot,
  ContestReleaseTrackTimelineSnapshot,
  ContestStatus,
  ContestWorkflowTimelineItem,
  ContestWorkflowTimelineResult,
  ContestWorkflowTimelineSource,
  FeishuBitableSyncCleanupLegacySummary,
  FeishuBitableSyncItemEntityType,
  PolicyLibraryItemSnapshot,
  PolicyLibraryItemStatus,
  PolicyLibraryReleaseSnapshot,
  PublishCheckResult,
  ReleaseDiffSummary,
  ReleaseQueueActionableCounts,
  ReleaseQueueInsights,
  ReleaseQueueInsightsWindowDays,
  ReleaseQueueRecentReviewItem,
  ReleaseQueueReviewerRankingMode,
  ReleaseQueueReviewerStats,
  ReleaseQueueStatusStats,
  ReleaseReviewAction,
  ReleaseReviewLog,
  ReleaseScopeKind,
  ReleaseSyncSource,
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
  CONTEST_MANUAL_PRESERVED_FIELDS,
  mergeContestManualPreservedFields,
} from '~~/server/utils/release-contest-preservation'
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

interface ReleaseQueueStatsRow {
  status: ReleaseVersionStatus
  item_count: number | string
}

interface ReleaseQueueReviewerStatsRow {
  actor_user_id: string
  actor_name: string | null
  avatar_url: string | null
  first_review_approved_count: number | string
  second_review_claimed_count: number | string
  second_review_approved_count: number | string
  rejected_count: number | string
  published_count: number | string
  total_actions: number | string
  last_action_at: string | null
}

interface ReleaseQueueRecentReviewRow {
  id: string
  release_version_id: string
  scope_kind: ReleaseScopeKind
  scope_id: string
  scope_title: string
  version_number: number | string
  actor_user_id: string | null
  actor_name: string | null
  avatar_url: string | null
  action: ReleaseReviewAction
  created_at: string
}

interface ReleaseQueueCurrentUserRow {
  id: string
  username: string
  avatar_url: string | null
}

interface FeishuExternalRefRow {
  scope: 'contest' | 'track' | 'track_timeline' | 'resource' | 'policy'
  external_id: string
  entity_id: string
  metadata: unknown
}

interface ReleaseSnapshotOwnerRow {
  release_version_id: string
  release_status: ReleaseVersionStatus
  scope_id: string
  owner_sync_item_id: string | null
}

interface ContestAuditTimelineRow {
  id: string
  contest_id: string | null
  resource_id: string | null
  actor_user_id: string | null
  action: string
  payload: unknown
  created_at: string
}

export interface ReleaseVersionRefreshSource {
  syncItemId: string
  recordId: string
}

const MANAGED_NOTE_PREFIX = '[飞书同步:'
const LEGACY_CONTEST_TIMELINE_PREFIX = 'legacy:contest:'
const DERIVED_CONTEST_TIMELINE_PREFIX = 'derived:contest:'
const LEGACY_TRACK_TIMELINE_PREFIX = 'legacy:track:'
const DERIVED_TRACK_TIMELINE_PREFIX = 'derived:track:'
const MANUAL_TRACK_EXTERNAL_ID_PREFIX = 'manual:track:'
const MANUAL_CONTEST_TIMELINE_EXTERNAL_ID_PREFIX = 'manual:contest_timeline:'
const MANUAL_TRACK_TIMELINE_EXTERNAL_ID_PREFIX = 'manual:track_timeline:'
const MANUAL_RESOURCE_EXTERNAL_ID_PREFIX = 'manual:resource:'
const DEFAULT_RELEASE_QUEUE_STATUSES: ReleaseVersionStatus[] = [
  'pending_first_review',
  'pending_second_review',
  'approved',
  'rejected',
  'published',
  'superseded',
]

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

function joinUniqueTexts(values: unknown[]): string {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result.join('；')
}

function inferLatestTimelineSeason(timelines: Array<{ year?: unknown }>): string {
  const years = timelines
    .map(item => normalizeInteger(item.year, 0))
    .filter(year => year >= 1900)
  if (years.length === 0)
    return ''
  return String(Math.max(...years))
}

function resolveContestReleaseEffectiveMetadata(snapshot: ContestReleaseSnapshot): {
  participantRequirements: string
  currentSeason: string
} {
  const contest = snapshot.contest
  return {
    participantRequirements: normalizeText(contest?.participantRequirements) || joinUniqueTexts(snapshot.tracks.map(item => item.participantRequirements)),
    currentSeason: normalizeText(contest?.currentSeason)
      || inferLatestTimelineSeason([...snapshot.timelines, ...snapshot.trackTimelines]),
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeReleaseSyncSource(value: unknown): ReleaseSyncSource | undefined {
  const source = parseJsonObject(value)
  const syncItemId = normalizeText(source.syncItemId)
  if (!syncItemId)
    return undefined
  return {
    syncItemId,
    syncRunId: normalizeText(source.syncRunId) || null,
    recordId: normalizeText(source.recordId) || null,
    preservedFields: normalizeStringArray(source.preservedFields),
  }
}

function buildReleaseSyncSource(input: {
  syncItemId: string
  syncRunId?: string | null
  recordId?: string | null
  preservedFields?: string[]
}): ReleaseSyncSource {
  const preservedFields = normalizeStringArray(input.preservedFields)
  const source: ReleaseSyncSource = {
    syncItemId: normalizeText(input.syncItemId),
    syncRunId: normalizeText(input.syncRunId) || null,
    recordId: normalizeText(input.recordId) || null,
  }
  if (preservedFields.length > 0)
    source.preservedFields = preservedFields
  return source
}

function attachReleaseSyncSource<T extends { syncSource?: ReleaseSyncSource }>(
  item: T,
  input: {
    syncItemId: string
    syncRunId?: string | null
    recordId?: string | null
    preservedFields?: string[]
  },
): T {
  return {
    ...item,
    syncSource: buildReleaseSyncSource(input),
  }
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

function hasReleaseDiffSummaryChanges(summary: ReleaseDiffSummary): boolean {
  return summary.createdCount > 0
    || summary.updatedCount > 0
    || summary.removedCount > 0
    || summary.changedExternalIds.length > 0
}

function normalizeCompareValue(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

interface SyncPreservationSummaryItem {
  label: string
  value: string
  source: 'Feishu 原值' | '本地沿用' | '本地沿用/兜底'
  reason: string
}

interface ContestSyncPreservationSummary {
  feishu: SyncPreservationSummaryItem[]
  preserved: SyncPreservationSummaryItem[]
  fallbacks: SyncPreservationSummaryItem[]
}

const CONTEST_FEISHU_SYNC_FIELD_LABELS: Array<[keyof ContestReleaseContestSnapshot, string]> = [
  ['name', '赛事名称'],
  ['level', '赛事级别'],
  ['officialUrl', '官网地址'],
  ['summary', '竞赛简介'],
  ['disciplines', '学科门类'],
  ['keywords', '关键词'],
  ['recommendedFor', '适配人群'],
]

const CONTEST_MANUAL_FIELD_LABELS: Record<string, string> = {
  organizer: '主办方',
  coOrganizer: '协办/承办',
  participantRequirements: '参赛对象',
  teamRule: '组队规则',
  currentSeason: '当前届次',
}

function normalizeSummaryValue(value: unknown): string {
  if (Array.isArray(value))
    return value.map(item => normalizeText(item)).filter(Boolean).join('、')
  return normalizeText(value)
}

function isTrackTimelineForSnapshotTrack(
  timeline: ContestReleaseTrackTimelineSnapshot,
  track: ContestReleaseTrackSnapshot,
): boolean {
  const trackExternalId = normalizeText(track.externalId)
  const trackLiveId = normalizeText(track.liveId)
  const timelineExternalId = normalizeText(timeline.externalId)
  const timelineTrackExternalId = normalizeText(timeline.trackExternalId)
  const timelineTrackLiveId = normalizeText(timeline.trackLiveId)
  return Boolean(
    (trackExternalId && timelineTrackExternalId === trackExternalId)
    || (trackLiveId && timelineTrackLiveId === trackLiveId)
    || (trackExternalId && timelineExternalId.startsWith(buildTrackDerivedTimelinePrefix(trackExternalId)))
    || (trackExternalId && timelineExternalId.startsWith(buildTrackLegacyTimelinePrefix(trackExternalId))),
  )
}

function buildContestSyncPreservationSummary(version: ReleaseVersion): ContestSyncPreservationSummary | null {
  if (version.scopeKind !== 'contest')
    return null

  const snapshot = toContestSnapshot(version.snapshot, version.scopeId)
  const summary: ContestSyncPreservationSummary = {
    feishu: [],
    preserved: [],
    fallbacks: [],
  }
  const contest = snapshot.contest
  const preservedFields = new Set(contest?.syncSource?.preservedFields || [])
  const contestRecord = (contest || {}) as Record<string, unknown>

  for (const [field, label] of CONTEST_FEISHU_SYNC_FIELD_LABELS) {
    if (preservedFields.has(field))
      continue
    const value = normalizeSummaryValue(contestRecord[field])
    if (!value)
      continue
    summary.feishu.push({
      label,
      value,
      source: 'Feishu 原值',
      reason: '来自 Feishu 竞赛库映射字段。',
    })
  }

  for (const field of CONTEST_MANUAL_PRESERVED_FIELDS) {
    if (!preservedFields.has(field))
      continue
    const value = normalizeSummaryValue(contestRecord[field])
    if (!value)
      continue
    summary.preserved.push({
      label: CONTEST_MANUAL_FIELD_LABELS[field] || field,
      value,
      source: '本地沿用',
      reason: 'Feishu 竞赛库没有写回该字段，本次同步沿用现有版本值。',
    })
  }

  for (const track of snapshot.tracks) {
    const trackName = normalizeText(track.name) || normalizeText(track.externalId) || '未命名赛道'
    const coverValue = normalizeSummaryValue(track.coverImageUrl)
    if (coverValue) {
      summary.feishu.push({
        label: `赛道封面 · ${trackName}`,
        value: coverValue,
        source: 'Feishu 原值',
        reason: '来自 Feishu 赛道库 coverImageUrl；若只有附件名，前端会提示缺少可访问图片地址。',
      })
    }

    const matchedTimelines = snapshot.trackTimelines.filter(item => isTrackTimelineForSnapshotTrack(item, track))
    if (matchedTimelines.length > 0) {
      const fromCurrentSync = matchedTimelines.some(item =>
        normalizeText(item.syncSource?.syncRunId) && normalizeText(item.syncSource?.syncRunId) === normalizeText(track.syncSource?.syncRunId),
      )
      const target = fromCurrentSync ? summary.feishu : summary.fallbacks
      target.push({
        label: `赛道时间节点 · ${trackName}`,
        value: `${matchedTimelines.length} 个结构化节点`,
        source: fromCurrentSync ? 'Feishu 原值' : '本地沿用/兜底',
        reason: fromCurrentSync
          ? '由本次 Feishu 赛道时间文本或赛道时间线记录解析得到。'
          : '本次赛道同步未提供新的结构化节点，沿用当前快照中可匹配的赛道时间线。',
      })
    }
    else {
      const timelineText = normalizeSummaryValue(track.timelineText)
      if (timelineText) {
        summary.fallbacks.push({
          label: `赛道时间节点 · ${trackName}`,
          value: timelineText,
          source: '本地沿用/兜底',
          reason: '未匹配到结构化赛道时间节点，审核表单回退展示赛道 timelineText 原文。',
        })
      }
    }
  }

  if (!summary.feishu.length && !summary.preserved.length && !summary.fallbacks.length)
    return null
  return summary
}

function workflowTimelineSourceFromReleaseAction(action: ReleaseReviewAction): ContestWorkflowTimelineSource {
  if (action === 'sync_generated' || action === 'sync_draft_overwritten')
    return 'feishu'
  if (action === 'manual_generated')
    return 'manual'
  if (action === 'published')
    return 'publish'
  return 'review'
}

function workflowTimelineTitleFromReleaseAction(action: ReleaseReviewAction): string {
  if (action === 'sync_generated')
    return '飞书同步生成新版本'
  if (action === 'manual_generated')
    return '人工编辑生成新版本'
  if (action === 'sync_draft_overwritten')
    return '飞书同步覆盖待审草稿'
  if (action === 'first_review_approved')
    return '初审通过'
  if (action === 'second_review_claimed')
    return '领取二审任务'
  if (action === 'second_review_approved')
    return '二审通过'
  if (action === 'rejected')
    return '版本被驳回'
  if (action === 'reset_to_first_review')
    return '重新提交初审'
  return '版本发布'
}

function buildReleaseTimelineDescription(
  log: ReleaseReviewLog,
  version: ReleaseVersion,
): string {
  const payload = parseJsonObject(log.payload)
  const parts: string[] = []
  const sourceModule = normalizeText(payload.sourceModule)
  const syncItemId = normalizeText(payload.syncItemId || version.syncItemId)
  const syncRunId = normalizeText(payload.syncRunId || version.syncRunId)
  const recordId = normalizeText(payload.recordId)
  if (log.action === 'manual_generated' && sourceModule)
    parts.push(`模块 ${sourceModule}`)
  if (syncItemId)
    parts.push(`同步项 ${syncItemId}`)
  if (syncRunId)
    parts.push(`批次 ${syncRunId}`)
  if (recordId)
    parts.push(`记录 ${recordId}`)
  if (log.action === 'rejected' && normalizeText(payload.reason))
    parts.push(`原因：${normalizeText(payload.reason)}`)
  if (log.action === 'reset_to_first_review')
    parts.push('从已驳回退回待初审')
  if (log.action === 'published' && normalizeText(payload.liveEntityId))
    parts.push(`上线实体 ${normalizeText(payload.liveEntityId)}`)
  return parts.join(' / ')
}

function mapReleaseLogToWorkflowTimelineItem(
  log: ReleaseReviewLog,
  version: ReleaseVersion,
): ContestWorkflowTimelineItem {
  const payload = parseJsonObject(log.payload)
  const syncPreservationSummary = log.action === 'sync_generated' || log.action === 'sync_draft_overwritten'
    ? buildContestSyncPreservationSummary(version)
    : null
  const timelinePayload = syncPreservationSummary
    ? { ...payload, syncPreservationSummary }
    : payload
  return {
    id: `release-log:${log.id}`,
    source: workflowTimelineSourceFromReleaseAction(log.action),
    action: log.action,
    title: workflowTimelineTitleFromReleaseAction(log.action),
    description: buildReleaseTimelineDescription(log, version) || undefined,
    actorUserId: log.actorUserId || null,
    contestId: normalizeText(version.liveEntityId) || null,
    versionId: version.id,
    versionNumber: version.versionNumber,
    syncItemId: normalizeText(payload.syncItemId || version.syncItemId) || null,
    syncRunId: normalizeText(payload.syncRunId || version.syncRunId) || null,
    recordId: normalizeText(payload.recordId) || null,
    payload: timelinePayload,
    createdAt: log.createdAt,
  }
}

function workflowTimelineSourceFromAuditAction(action: string): ContestWorkflowTimelineSource {
  const normalized = normalizeText(action)
  if (normalized.startsWith('repair.'))
    return 'repair'
  if (normalized === 'release.publish' || normalized === 'contest.publish')
    return 'publish'
  return 'manual'
}

function workflowTimelineTitleFromAuditAction(action: string): string {
  const normalized = normalizeText(action)
  if (normalized === 'contest.create')
    return '创建赛事'
  if (normalized === 'contest.patch')
    return '更新赛事主信息'
  if (normalized === 'track.create')
    return '创建赛道'
  if (normalized === 'track.patch')
    return '更新赛道'
  if (normalized === 'resource.create')
    return '创建资料'
  if (normalized === 'resource.patch')
    return '更新资料'
  if (normalized === 'release.publish')
    return '版本发布到线上'
  if (normalized === 'contest.publish')
    return '赛事直接发布'
  return normalized || '人工操作'
}

function buildAuditTimelineDescription(action: string, payload: Record<string, unknown>): string {
  const message = normalizeText(payload.message)
  if (message)
    return message
  if (normalizeText(action) === 'release.publish') {
    const versionNumber = normalizeInteger(payload.versionNumber, 0)
    const parts = [
      versionNumber > 0 ? `版本 V${versionNumber}` : '',
      normalizeText(payload.syncRunId) ? `批次 ${normalizeText(payload.syncRunId)}` : '',
    ].filter(Boolean)
    return parts.join(' / ')
  }
  return ''
}

function mapAuditRowToWorkflowTimelineItem(row: ContestAuditTimelineRow): ContestWorkflowTimelineItem {
  const payload = parseJsonObject(row.payload)
  return {
    id: `contest-audit:${row.id}`,
    source: workflowTimelineSourceFromAuditAction(row.action),
    action: normalizeText(row.action),
    title: workflowTimelineTitleFromAuditAction(row.action),
    description: buildAuditTimelineDescription(row.action, payload) || undefined,
    actorUserId: row.actor_user_id,
    contestId: row.contest_id,
    resourceId: row.resource_id,
    versionId: normalizeText(payload.releaseVersionId) || null,
    versionNumber: normalizeInteger(payload.versionNumber, 0) || null,
    syncItemId: normalizeText(payload.syncItemId) || null,
    syncRunId: normalizeText(payload.syncRunId) || null,
    recordId: normalizeText(payload.recordId) || null,
    payload,
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

function releaseSyncSourceScore(source: ReleaseSyncSource, version: ReleaseVersion): number {
  let score = 0
  if (normalizeText(source.syncItemId) && normalizeText(source.syncItemId) === normalizeText(version.syncItemId))
    score += 4
  if (normalizeText(source.syncRunId) && normalizeText(source.syncRunId) === normalizeText(version.syncRunId))
    score += 2
  return score
}

function collectReleaseVersionSyncSources(version: ReleaseVersion): ReleaseSyncSource[] {
  if (version.scopeKind === 'contest') {
    const snapshot = toContestSnapshot(version.snapshot, version.scopeId)
    return [
      snapshot.contest?.syncSource,
      ...snapshot.tracks.map(item => item.syncSource),
      ...snapshot.trackTimelines.map(item => item.syncSource),
      ...snapshot.resources.map(item => item.syncSource),
    ].filter((item): item is ReleaseSyncSource => Boolean(item))
  }

  const snapshot = toPolicySnapshot(version.snapshot)
  return snapshot.items
    .map(item => item.syncSource)
    .filter((item): item is ReleaseSyncSource => Boolean(item))
}

export function resolveReleaseVersionRefreshSource(version: ReleaseVersion): ReleaseVersionRefreshSource | null {
  const fallbackSyncItemId = normalizeText(version.syncItemId)
  const candidates = collectReleaseVersionSyncSources(version)
    .map((source, index) => ({
      syncItemId: normalizeText(source.syncItemId) || fallbackSyncItemId,
      recordId: normalizeText(source.recordId),
      score: releaseSyncSourceScore(source, version),
      index,
    }))
    .filter(item => item.syncItemId && item.recordId)
    .sort((left, right) => right.score - left.score || left.index - right.index)

  const selected = candidates[0]
  return selected
    ? {
        syncItemId: selected.syncItemId,
        recordId: selected.recordId,
      }
    : null
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

function buildManualTrackExternalId(trackId: string): string {
  return `${MANUAL_TRACK_EXTERNAL_ID_PREFIX}${normalizeText(trackId)}`
}

function buildManualContestTimelineExternalId(timelineId: string): string {
  return `${MANUAL_CONTEST_TIMELINE_EXTERNAL_ID_PREFIX}${normalizeText(timelineId)}`
}

function buildManualTrackTimelineExternalId(timelineId: string): string {
  return `${MANUAL_TRACK_TIMELINE_EXTERNAL_ID_PREFIX}${normalizeText(timelineId)}`
}

function buildManualResourceExternalId(resourceId: string): string {
  return `${MANUAL_RESOURCE_EXTERNAL_ID_PREFIX}${normalizeText(resourceId)}`
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
    includeSnapshot?: boolean
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
  const snapshotSelect = input.includeSnapshot === false
    ? `'{}'::JSONB AS snapshot_json`
    : 'snapshot_json'

  const result = await db.query<ReleaseVersionRow>(
    `SELECT
      id,
      scope_kind,
      scope_id,
      live_entity_id,
      scope_title,
      version_number,
      status,
      ${snapshotSelect},
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
  const logs = await listReleaseReviewLogs(db, { releaseVersionId })
  return {
    version,
    logs,
    publishCheck: version.scopeKind === 'contest'
      ? await getContestReleasePublishCheck(db, { version })
      : null,
    workflowTimeline: logs.map(log => mapReleaseLogToWorkflowTimelineItem(log, version)),
  }
}

export async function patchContestReleaseTrackTimelines(
  db: Queryable,
  input: {
    actorUserId: string
    releaseVersionId: string
    trackExternalId: string
    trackTimelines: ContestReleaseTrackTimelineSnapshot[]
  },
): Promise<ReleaseVersionDetail> {
  const row = await getLockedReleaseVersion(db, input.releaseVersionId)
  if (!row)
    throw new Error('RELEASE_VERSION_NOT_FOUND')
  if (row.scope_kind !== 'contest')
    throw new Error('RELEASE_SCOPE_INVALID')
  if (row.status !== 'pending_first_review')
    throw new Error('RELEASE_TRACK_TIMELINE_PATCH_STATUS_INVALID')

  const snapshot = toContestSnapshot(row.snapshot_json, row.scope_id)
  const trackExternalId = normalizeText(input.trackExternalId)
  const track = snapshot.tracks.find(item => normalizeText(item.externalId) === trackExternalId)
  if (!track)
    throw new Error('RELEASE_TRACK_NOT_FOUND')

  const allowedNodeTypes = new Set<TimelineNodeType>(['registration', 'submission', 'preliminary', 'final', 'other'])
  const normalizedTimelines = input.trackTimelines.map((item, index) => {
    const nodeType = allowedNodeTypes.has(item.nodeType) ? item.nodeType : 'other'
    const externalId = normalizeText(item.externalId) || `${buildTrackDerivedTimelinePrefix(trackExternalId)}manual:${index}:${normalizeText(item.businessNodeLabel || item.note) || randomUUID()}`
    return {
      ...item,
      externalId,
      trackExternalId,
      trackLiveId: track.liveId || item.trackLiveId || null,
      year: normalizeInteger(item.year, new Date().getFullYear()),
      nodeType,
      businessNodeLabel: normalizeText(item.businessNodeLabel),
      recognitionStatus: 'manual_adjusted' as const,
      startAt: normalizeText(item.startAt) || null,
      endAt: normalizeText(item.endAt) || null,
      note: normalizeText(item.note),
      sourceLink: normalizeText(item.sourceLink),
      syncSource: item.syncSource || track.syncSource,
    }
  })

  snapshot.trackTimelines = [
    ...snapshot.trackTimelines.filter(item => !isTrackTimelineForSnapshotTrack(item, track)),
    ...normalizedTimelines,
  ]
  const sanitizedSnapshot = sanitizeContestReleaseSnapshot(snapshot)
  const base = (await loadBaseSnapshot(db, {
    scopeKind: 'contest',
    scopeId: row.scope_id,
  })).contestSnapshot || createEmptyContestSnapshot(row.scope_id)
  const diffSummary = computeContestDiffSummary(base, sanitizedSnapshot)

  await db.query(
    `UPDATE release_versions
     SET snapshot_json = $2::JSONB,
         diff_summary_json = $3::JSONB,
         updated_by_user_id = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.releaseVersionId,
      JSON.stringify(sanitizedSnapshot),
      JSON.stringify(diffSummary),
      input.actorUserId,
    ],
  )

  await insertReleaseReviewLog(db, {
    releaseVersionId: input.releaseVersionId,
    actorUserId: input.actorUserId,
    action: 'manual_generated',
    payload: {
      scope: 'track_timeline',
      trackExternalId,
      changedCount: normalizedTimelines.length,
      reason: '赛道确认表单人工修正结构化节点。',
    },
  })

  const detail = await getReleaseVersionDetail(db, input.releaseVersionId)
  if (!detail)
    throw new Error('RELEASE_VERSION_NOT_FOUND')
  return detail
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
  const statuses: ReleaseVersionStatus[] = input.statuses?.length
    ? input.statuses
    : DEFAULT_RELEASE_QUEUE_STATUSES
  return listReleaseScopedVersions(db, {
    scopeKind: input.scopeKind,
    statuses,
    limit: input.limit || 100,
  })
}

function createEmptyReleaseQueueStatusStats(): ReleaseQueueStatusStats {
  return {
    pendingFirst: 0,
    pendingSecond: 0,
    approved: 0,
    rejected: 0,
    published: 0,
    superseded: 0,
    total: 0,
  }
}

function mapReleaseQueueReviewerStats(row: ReleaseQueueReviewerStatsRow): ReleaseQueueReviewerStats {
  return {
    userId: normalizeText(row.actor_user_id),
    actorName: normalizeText(row.actor_name) || normalizeText(row.actor_user_id) || '未知管理员',
    avatarUrl: normalizeText(row.avatar_url) || null,
    firstReviewApprovedCount: Math.max(0, normalizeInteger(row.first_review_approved_count)),
    secondReviewClaimedCount: Math.max(0, normalizeInteger(row.second_review_claimed_count)),
    secondReviewApprovedCount: Math.max(0, normalizeInteger(row.second_review_approved_count)),
    rejectedCount: Math.max(0, normalizeInteger(row.rejected_count)),
    publishedCount: Math.max(0, normalizeInteger(row.published_count)),
    totalActions: Math.max(0, normalizeInteger(row.total_actions)),
    lastActionAt: normalizeText(row.last_action_at) || null,
  }
}

function mapReleaseQueueRecentReviewItem(row: ReleaseQueueRecentReviewRow): ReleaseQueueRecentReviewItem {
  return {
    id: row.id,
    releaseVersionId: row.release_version_id,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    scopeTitle: row.scope_title,
    versionNumber: Math.max(1, normalizeInteger(row.version_number, 1)),
    actorUserId: normalizeText(row.actor_user_id),
    actorName: normalizeText(row.actor_name) || normalizeText(row.actor_user_id) || '未知管理员',
    avatarUrl: normalizeText(row.avatar_url) || null,
    action: row.action,
    createdAt: row.created_at,
  }
}

function createZeroReleaseQueueReviewerStats(row: ReleaseQueueCurrentUserRow): ReleaseQueueReviewerStats {
  return {
    userId: row.id,
    actorName: normalizeText(row.username) || row.id,
    avatarUrl: normalizeText(row.avatar_url) || null,
    firstReviewApprovedCount: 0,
    secondReviewClaimedCount: 0,
    secondReviewApprovedCount: 0,
    rejectedCount: 0,
    publishedCount: 0,
    totalActions: 0,
    lastActionAt: null,
  }
}

function applyReleaseQueueStatusCount(
  stats: ReleaseQueueStatusStats,
  status: ReleaseVersionStatus,
  count: number,
): void {
  if (status === 'pending_first_review')
    stats.pendingFirst = count
  else if (status === 'pending_second_review')
    stats.pendingSecond = count
  else if (status === 'approved')
    stats.approved = count
  else if (status === 'rejected')
    stats.rejected = count
  else if (status === 'published')
    stats.published = count
  else if (status === 'superseded')
    stats.superseded = count
}

async function countReleaseQueueStatusStats(
  db: Queryable,
  input: {
    scopeKind?: ReleaseScopeKind
    statuses: ReleaseVersionStatus[]
  },
): Promise<ReleaseQueueStatusStats> {
  const where: string[] = ['1=1']
  const values: unknown[] = []

  if (input.scopeKind) {
    values.push(input.scopeKind)
    where.push(`scope_kind = $${values.length}`)
  }

  if (input.statuses.length) {
    values.push(input.statuses)
    where.push(`status = ANY($${values.length}::TEXT[])`)
  }

  const result = await db.query<ReleaseQueueStatsRow>(
    `SELECT status, COUNT(*)::INT AS item_count
     FROM release_versions
     WHERE ${where.join(' AND ')}
     GROUP BY status`,
    values,
  )

  const stats = createEmptyReleaseQueueStatusStats()
  for (const row of result.rows) {
    const count = Math.max(0, Number(row.item_count || 0) || 0)
    applyReleaseQueueStatusCount(stats, row.status, count)
    stats.total += count
  }
  return stats
}

export async function listReleaseQueueInsights(
  db: Queryable,
  input: {
    actorUserId?: string
    scopeKind?: ReleaseScopeKind
    recentLimit?: number
    reviewerLimit?: number
    windowDays?: ReleaseQueueInsightsWindowDays
    rankingMode?: ReleaseQueueReviewerRankingMode
    canWriteCurrentUser?: boolean
    canPublishCurrentUser?: boolean
  } = {},
): Promise<ReleaseQueueInsights> {
  const reviewActions: ReleaseReviewAction[] = [
    'first_review_approved',
    'second_review_claimed',
    'second_review_approved',
    'rejected',
    'reset_to_first_review',
    'published',
  ]
  const where: string[] = [`l.action = ANY($1::TEXT[])`]
  const values: unknown[] = [reviewActions]
  const rankingMode = input.rankingMode || 'total_actions'
  const windowDays = input.windowDays === 7 || input.windowDays === 30 ? input.windowDays : 0
  const rankingOrderSql = rankingMode === 'second_review_approved'
    ? 'ORDER BY second_review_approved_count DESC, total_actions DESC, published_count DESC, MAX(l.created_at) DESC'
    : rankingMode === 'published'
      ? 'ORDER BY published_count DESC, total_actions DESC, second_review_approved_count DESC, MAX(l.created_at) DESC'
      : 'ORDER BY total_actions DESC, published_count DESC, second_review_approved_count DESC, MAX(l.created_at) DESC'
  const currentUserId = normalizeText(input.actorUserId)
  const canWriteCurrentUser = Boolean(input.canWriteCurrentUser)
  const canPublishCurrentUser = Boolean(input.canPublishCurrentUser)

  if (input.scopeKind) {
    values.push(input.scopeKind)
    where.push(`rv.scope_kind = $${values.length}`)
  }

  if (windowDays > 0) {
    values.push(windowDays)
    where.push(`l.created_at >= NOW() - ($${values.length}::INT * INTERVAL '1 day')`)
  }

  const reviewerLimit = Math.max(1, Math.min(20, normalizeInteger(input.reviewerLimit || 8, 8)))
  const recentLimit = Math.max(1, Math.min(20, normalizeInteger(input.recentLimit || 8, 8)))

  const [reviewersResult, recentResult, currentUserResult, actionableResult] = await Promise.all([
    db.query<ReleaseQueueReviewerStatsRow>(
      `SELECT
        l.actor_user_id,
        u.username AS actor_name,
        u.avatar_url,
        SUM(CASE WHEN l.action = 'first_review_approved' THEN 1 ELSE 0 END)::INT AS first_review_approved_count,
        SUM(CASE WHEN l.action = 'second_review_claimed' THEN 1 ELSE 0 END)::INT AS second_review_claimed_count,
        SUM(CASE WHEN l.action = 'second_review_approved' THEN 1 ELSE 0 END)::INT AS second_review_approved_count,
        SUM(CASE WHEN l.action = 'rejected' THEN 1 ELSE 0 END)::INT AS rejected_count,
        SUM(CASE WHEN l.action = 'published' THEN 1 ELSE 0 END)::INT AS published_count,
        COUNT(*)::INT AS total_actions,
        MAX(l.created_at)::TEXT AS last_action_at
       FROM release_review_logs l
       JOIN release_versions rv ON rv.id = l.release_version_id
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE ${where.join(' AND ')}
         AND COALESCE(l.actor_user_id, '') <> ''
       GROUP BY l.actor_user_id, u.username, u.avatar_url
       ${rankingOrderSql}
       LIMIT ${reviewerLimit}`,
      values,
    ),
    db.query<ReleaseQueueRecentReviewRow>(
      `SELECT
        l.id,
        l.release_version_id,
        rv.scope_kind,
        rv.scope_id,
        rv.scope_title,
        rv.version_number,
        l.actor_user_id,
        u.username AS actor_name,
        u.avatar_url,
        l.action,
        l.created_at::TEXT
       FROM release_review_logs l
       JOIN release_versions rv ON rv.id = l.release_version_id
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT ${recentLimit}`,
      values,
    ),
    currentUserId
      ? db.query<ReleaseQueueCurrentUserRow>(
          `SELECT id, username, avatar_url
           FROM users
           WHERE id = $1
           LIMIT 1`,
          [currentUserId],
        )
      : Promise.resolve({ rows: [] } as { rows: ReleaseQueueCurrentUserRow[] }),
    currentUserId
      ? db.query<{
          pending_first_count: number | string
          claimed_second_count: number | string
          ready_to_publish_count: number | string
        }>(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'pending_first_review')::INT AS pending_first_count,
            COUNT(*) FILTER (WHERE status = 'pending_second_review' AND second_review_claimed_by_user_id = $1)::INT AS claimed_second_count,
            COUNT(*) FILTER (WHERE status = 'approved')::INT AS ready_to_publish_count
           FROM release_versions
           WHERE ($2::TEXT = '' OR scope_kind = $2)`,
          [currentUserId, input.scopeKind || ''],
        )
      : Promise.resolve({ rows: [] } as { rows: Array<Record<string, unknown>> }),
  ])

  const reviewers = reviewersResult.rows.map(mapReleaseQueueReviewerStats)
  const recentReviews = recentResult.rows.map(mapReleaseQueueRecentReviewItem)
  let currentUser: ReleaseQueueReviewerStats | null = null
  if (currentUserId) {
    currentUser = reviewers.find(item => item.userId === currentUserId)
      || (currentUserResult.rows[0] ? createZeroReleaseQueueReviewerStats(currentUserResult.rows[0]) : null)
  }
  const actionableRow = actionableResult.rows[0] as {
    pending_first_count?: number | string
    claimed_second_count?: number | string
    ready_to_publish_count?: number | string
  } | undefined
  const actionable: ReleaseQueueActionableCounts | null = currentUserId
    ? {
        pendingFirstCount: canWriteCurrentUser ? Math.max(0, normalizeInteger(actionableRow?.pending_first_count)) : 0,
        claimedSecondCount: canWriteCurrentUser ? Math.max(0, normalizeInteger(actionableRow?.claimed_second_count)) : 0,
        readyToPublishCount: canPublishCurrentUser ? Math.max(0, normalizeInteger(actionableRow?.ready_to_publish_count)) : 0,
      }
    : null

  return {
    windowDays,
    rankingMode,
    currentUser,
    actionable,
    reviewers,
    recentReviews,
  }
}

export async function listReleaseQueueResult(
  db: Queryable,
  input: {
    actorUserId?: string
    scopeKind?: ReleaseScopeKind
    statuses?: ReleaseVersionStatus[]
    limit?: number
    windowDays?: ReleaseQueueInsightsWindowDays
    rankingMode?: ReleaseQueueReviewerRankingMode
    canWriteCurrentUser?: boolean
    canPublishCurrentUser?: boolean
  } = {},
): Promise<AdminReleaseQueueResult> {
  const statuses: ReleaseVersionStatus[] = input.statuses?.length
    ? input.statuses
    : DEFAULT_RELEASE_QUEUE_STATUSES
  const limit = Math.max(1, Math.min(500, normalizeInteger(input.limit || 100, 100)))

  const [items, stats, insights] = await Promise.all([
    listReleaseScopedVersions(db, {
      scopeKind: input.scopeKind,
      statuses,
      limit,
      includeSnapshot: false,
    }),
    countReleaseQueueStatusStats(db, {
      scopeKind: input.scopeKind,
      statuses,
    }),
    listReleaseQueueInsights(db, {
      actorUserId: input.actorUserId,
      scopeKind: input.scopeKind,
      windowDays: input.windowDays,
      rankingMode: input.rankingMode,
      canWriteCurrentUser: input.canWriteCurrentUser,
      canPublishCurrentUser: input.canPublishCurrentUser,
    }),
  ])

  return {
    items,
    total: stats.total,
    limit,
    stats,
    insights,
  }
}

export async function listContestAuditAggregates(
  db: Queryable,
  input: {
    versions: ReleaseVersion[]
    actorUserId?: string
    recentLimit?: number
    reviewerLimit?: number
    windowDays?: ReleaseQueueInsightsWindowDays
    rankingMode?: ReleaseQueueReviewerRankingMode
  },
): Promise<ContestAuditAggregates> {
  const reviewActions: ReleaseReviewAction[] = [
    'first_review_approved',
    'second_review_claimed',
    'second_review_approved',
    'rejected',
    'reset_to_first_review',
    'published',
  ]
  const rankingMode = input.rankingMode || 'total_actions'
  const windowDays = input.windowDays === 7 || input.windowDays === 30 ? input.windowDays : 0
  const currentUserId = normalizeText(input.actorUserId)
  const versionIds = input.versions.map(item => item.id).filter(Boolean)
  const reviewerLimit = Math.max(1, Math.min(20, normalizeInteger(input.reviewerLimit || 8, 8)))
  const recentLimit = Math.max(1, Math.min(20, normalizeInteger(input.recentLimit || 8, 8)))
  const rankingOrderSql = rankingMode === 'second_review_approved'
    ? 'ORDER BY second_review_approved_count DESC, total_actions DESC, published_count DESC, MAX(l.created_at) DESC'
    : rankingMode === 'published'
      ? 'ORDER BY published_count DESC, total_actions DESC, second_review_approved_count DESC, MAX(l.created_at) DESC'
      : 'ORDER BY total_actions DESC, published_count DESC, second_review_approved_count DESC, MAX(l.created_at) DESC'

  const emptyCurrentUserResult = currentUserId
    ? await db.query<ReleaseQueueCurrentUserRow>(
        `SELECT id, username, avatar_url
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [currentUserId],
      )
    : { rows: [] as ReleaseQueueCurrentUserRow[] }

  if (versionIds.length === 0) {
    return {
      windowDays,
      rankingMode,
      currentUser: emptyCurrentUserResult.rows[0] ? createZeroReleaseQueueReviewerStats(emptyCurrentUserResult.rows[0]) : null,
      reviewers: [],
      recentReviews: [],
    }
  }

  const where: string[] = [
    'l.action = ANY($1::TEXT[])',
    'rv.id = ANY($2::TEXT[])',
  ]
  const values: unknown[] = [reviewActions, versionIds]

  if (windowDays > 0) {
    values.push(windowDays)
    where.push(`l.created_at >= NOW() - ($${values.length}::INT * INTERVAL '1 day')`)
  }

  const reviewerStatsSql = `SELECT
        l.actor_user_id,
        u.username AS actor_name,
        u.avatar_url,
        SUM(CASE WHEN l.action = 'first_review_approved' THEN 1 ELSE 0 END)::INT AS first_review_approved_count,
        SUM(CASE WHEN l.action = 'second_review_claimed' THEN 1 ELSE 0 END)::INT AS second_review_claimed_count,
        SUM(CASE WHEN l.action = 'second_review_approved' THEN 1 ELSE 0 END)::INT AS second_review_approved_count,
        SUM(CASE WHEN l.action = 'rejected' THEN 1 ELSE 0 END)::INT AS rejected_count,
        SUM(CASE WHEN l.action = 'published' THEN 1 ELSE 0 END)::INT AS published_count,
        COUNT(*)::INT AS total_actions,
        MAX(l.created_at)::TEXT AS last_action_at
       FROM release_review_logs l
       JOIN release_versions rv ON rv.id = l.release_version_id
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE ${where.join(' AND ')}
         AND COALESCE(l.actor_user_id, '') <> ''`

  const [reviewersResult, recentResult, currentUserStatsResult] = await Promise.all([
    db.query<ReleaseQueueReviewerStatsRow>(
      `${reviewerStatsSql}
       GROUP BY l.actor_user_id, u.username, u.avatar_url
       ${rankingOrderSql}
       LIMIT ${reviewerLimit}`,
      values,
    ),
    db.query<ReleaseQueueRecentReviewRow>(
      `SELECT
        l.id,
        l.release_version_id,
        rv.scope_kind,
        rv.scope_id,
        rv.scope_title,
        rv.version_number,
        l.actor_user_id,
        u.username AS actor_name,
        u.avatar_url,
        l.action,
        l.created_at::TEXT
       FROM release_review_logs l
       JOIN release_versions rv ON rv.id = l.release_version_id
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT ${recentLimit}`,
      values,
    ),
    currentUserId
      ? db.query<ReleaseQueueReviewerStatsRow>(
          `${reviewerStatsSql}
           AND l.actor_user_id = $${values.length + 1}
           GROUP BY l.actor_user_id, u.username, u.avatar_url
           LIMIT 1`,
          [...values, currentUserId],
        )
      : Promise.resolve({ rows: [] } as { rows: ReleaseQueueReviewerStatsRow[] }),
  ])

  const currentUser = currentUserStatsResult.rows[0]
    ? mapReleaseQueueReviewerStats(currentUserStatsResult.rows[0])
    : emptyCurrentUserResult.rows[0]
      ? createZeroReleaseQueueReviewerStats(emptyCurrentUserResult.rows[0])
      : null

  return {
    windowDays,
    rankingMode,
    currentUser,
    reviewers: reviewersResult.rows.map(mapReleaseQueueReviewerStats),
    recentReviews: recentResult.rows.map(mapReleaseQueueRecentReviewItem),
  }
}

function matchAdminContestListQuery(item: AdminContestListItem, query: string): boolean {
  const normalized = normalizeText(query).toLowerCase()
  if (!normalized)
    return true
  const haystack = [
    item.name,
    item.organizer || '',
    item.coOrganizer || '',
    item.officialUrl || '',
    item.scopeId,
  ].join(' ').toLowerCase()
  return haystack.includes(normalized)
}

export async function listAdminContestReleaseOverview(
  db: Queryable,
  input: {
    status?: ContestStatus | ''
    q?: string
  } = {},
): Promise<AdminContestListItem[]> {
  const [liveContests, contestRefs, allContestVersions] = await Promise.all([
    listAdminContests(db, {}),
    db.query<{ entity_id: string, external_id: string }>(
      `SELECT entity_id, external_id
       FROM feishu_external_refs
       WHERE provider = 'feishu_bitable'
         AND scope = 'contest'`,
    ),
    listReleaseVersions(db, {
      scopeKind: 'contest',
      limit: 5000,
    }),
  ])

  const externalIdByContestId = new Map<string, string>()
  for (const row of contestRefs.rows) {
    const entityId = normalizeText(row.entity_id)
    const externalId = normalizeText(row.external_id)
    if (entityId && externalId)
      externalIdByContestId.set(entityId, externalId)
  }

  const latestVersionByScopeId = new Map<string, ReleaseVersion>()
  const latestPublishedVersionByScopeId = new Map<string, ReleaseVersion>()
  const latestVersionByLiveEntityId = new Map<string, ReleaseVersion>()
  const latestPublishedVersionByLiveEntityId = new Map<string, ReleaseVersion>()

  for (const version of allContestVersions) {
    if (!latestVersionByScopeId.has(version.scopeId))
      latestVersionByScopeId.set(version.scopeId, version)
    const liveEntityId = normalizeText(version.liveEntityId)
    if (liveEntityId && !latestVersionByLiveEntityId.has(liveEntityId))
      latestVersionByLiveEntityId.set(liveEntityId, version)
    if (version.status !== 'published')
      continue
    if (!latestPublishedVersionByScopeId.has(version.scopeId))
      latestPublishedVersionByScopeId.set(version.scopeId, version)
    if (liveEntityId && !latestPublishedVersionByLiveEntityId.has(liveEntityId))
      latestPublishedVersionByLiveEntityId.set(liveEntityId, version)
  }

  const itemMap = new Map<string, AdminContestListItem>()
  for (const contest of liveContests) {
    const scopeId = externalIdByContestId.get(contest.id)
      || latestVersionByLiveEntityId.get(contest.id)?.scopeId
      || contest.id
    const latestVersion = latestVersionByScopeId.get(scopeId) || latestVersionByLiveEntityId.get(contest.id) || null
    const latestPublished = latestPublishedVersionByScopeId.get(scopeId) || latestPublishedVersionByLiveEntityId.get(contest.id) || null
    const snapshotContest = latestVersion?.scopeKind === 'contest'
      ? toContestSnapshot(latestVersion.snapshot, latestVersion.scopeId).contest
      : null

    itemMap.set(scopeId, {
      id: contest.id,
      scopeId,
      externalId: scopeId,
      name: normalizeText(snapshotContest?.name) || contest.name,
      officialUrl: normalizeText(snapshotContest?.officialUrl) || contest.officialUrl || '',
      organizer: normalizeText(snapshotContest?.organizer) || contest.organizer || '',
      coOrganizer: normalizeText(snapshotContest?.coOrganizer) || contest.coOrganizer || '',
      level: (snapshotContest?.level || contest.level || '') as ContestLevel | '',
      liveStatus: (contest.status || '') as ContestStatus | '',
      visibility: contest.visibility || '',
      latestReleaseStatus: latestVersion?.status || '',
      latestReleaseVersionId: latestVersion?.id || null,
      latestPublishedVersionId: latestPublished?.id || null,
      latestVersionNumber: latestVersion?.versionNumber || null,
      latestPublishedVersionNumber: latestPublished?.versionNumber || null,
      hasPublishBlockers: false,
      latestSyncAt: latestVersion?.updatedAt || latestVersion?.createdAt || null,
      latestPublishedAt: latestPublished?.publishedAt || latestPublished?.updatedAt || null,
    })
  }

  for (const [scopeId, latestVersion] of latestVersionByScopeId) {
    if (itemMap.has(scopeId))
      continue
    const snapshot = toContestSnapshot(latestVersion.snapshot, latestVersion.scopeId)
    const contest = snapshot.contest
    const latestPublished = latestPublishedVersionByScopeId.get(scopeId) || null
    itemMap.set(scopeId, {
      id: normalizeText(latestVersion.liveEntityId) || null,
      scopeId,
      externalId: scopeId,
      name: normalizeText(contest?.name) || normalizeText(latestVersion.scopeTitle) || scopeId,
      officialUrl: normalizeText(contest?.officialUrl) || '',
      organizer: normalizeText(contest?.organizer) || '',
      coOrganizer: normalizeText(contest?.coOrganizer) || '',
      level: (contest?.level || '') as ContestLevel | '',
      liveStatus: '',
      visibility: contest?.visibility || '',
      latestReleaseStatus: latestVersion.status,
      latestReleaseVersionId: latestVersion.id,
      latestPublishedVersionId: latestPublished?.id || null,
      latestVersionNumber: latestVersion.versionNumber,
      latestPublishedVersionNumber: latestPublished?.versionNumber || null,
      hasPublishBlockers: false,
      latestSyncAt: latestVersion.updatedAt || latestVersion.createdAt,
      latestPublishedAt: latestPublished?.publishedAt || latestPublished?.updatedAt || null,
    })
  }

  let items = Array.from(itemMap.values())
  if (input.status)
    items = items.filter(item => item.liveStatus === input.status)
  if (normalizeText(input.q))
    items = items.filter(item => matchAdminContestListQuery(item, input.q || ''))

  const blockerFlags = await Promise.all(items.map(async (item) => {
    const latestVersion = latestVersionByScopeId.get(item.scopeId)
    if (!latestVersion || latestVersion.status === 'published' || latestVersion.status === 'superseded')
      return [item.scopeId, false] as const
    const publishCheck = await getContestReleasePublishCheck(db, { version: latestVersion })
    return [item.scopeId, Boolean(publishCheck && !publishCheck.canPublish)] as const
  }))
  const blockerMap = new Map(blockerFlags)

  items = items
    .map(item => ({
      ...item,
      hasPublishBlockers: blockerMap.get(item.scopeId) || false,
    }))
    .sort((left, right) => {
      const rightTime = new Date(right.latestSyncAt || right.latestPublishedAt || 0).getTime()
      const leftTime = new Date(left.latestSyncAt || left.latestPublishedAt || 0).getTime()
      if (rightTime !== leftTime)
        return rightTime - leftTime
      return String(left.name).localeCompare(String(right.name), 'zh-CN')
    })

  return items
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

function hasReleaseRubrics(snapshot: ContestReleaseSnapshot): boolean {
  return snapshot.tracks.some(track =>
    (track.evidenceRequirements || []).length > 0
    || (track.scoringPoints || []).length > 0
    || (track.deductionItems || []).length > 0,
  )
}

function normalizeSnapshotFaqItems(value: unknown): Array<{ question: string, answer: string }> {
  if (!Array.isArray(value))
    return []
  return value
    .map((item) => {
      const raw = parseJsonObject(item)
      return {
        question: normalizeText(raw.question),
        answer: normalizeText(raw.answer),
      }
    })
    .filter(item => item.question || item.answer)
}

export async function getContestReleasePublishCheck(
  db: Queryable,
  input: {
    version: ReleaseVersion
  },
): Promise<PublishCheckResult | null> {
  if (input.version.scopeKind !== 'contest')
    return null

  const snapshot = toContestSnapshot(input.version.snapshot, input.version.scopeId)
  const contest = snapshot.contest
  if (!contest) {
    return {
      contestId: normalizeText(input.version.liveEntityId) || input.version.scopeId,
      canPublish: false,
      completion: 0,
      blockers: [{
        code: 'CONTEST_SNAPSHOT_REQUIRED',
        message: '当前版本缺少竞赛主快照，无法发布。',
        field: 'contest',
        severity: 'blocker',
      }],
      warnings: [],
    }
  }

  const blockers: PublishCheckResult['blockers'] = []
  const warnings: PublishCheckResult['warnings'] = []
  const checks: boolean[] = []

  const pushBlocker = (code: string, message: string, field?: string) => {
    blockers.push({ code, message, field, severity: 'blocker' })
  }

  const pushWarning = (code: string, message: string, field?: string) => {
    warnings.push({ code, message, field, severity: 'warning' })
  }

  const effectiveMetadata = resolveContestReleaseEffectiveMetadata(snapshot)
  const hasName = Boolean(normalizeText(contest.name))
  checks.push(hasName)
  if (!hasName)
    pushBlocker('CONTEST_NAME_REQUIRED', '赛事名称不能为空。', 'name')

  const hasLevel = Boolean(normalizeText(contest.level))
  checks.push(hasLevel)
  if (!hasLevel)
    pushBlocker('CONTEST_LEVEL_REQUIRED', '赛事级别不能为空。', 'level')

  const hasOfficialUrl = Boolean(normalizeText(contest.officialUrl))
  checks.push(hasOfficialUrl)
  if (!hasOfficialUrl)
    pushBlocker('CONTEST_OFFICIAL_URL_REQUIRED', '官网链接不能为空。', 'officialUrl')

  const hasSummary = Boolean(normalizeText(contest.summary))
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

  const hasDisciplines = normalizeStringArray(contest.disciplines).length > 0
  checks.push(hasDisciplines)
  if (!hasDisciplines)
    pushBlocker('CONTEST_DISCIPLINES_REQUIRED', '学科门类至少填写 1 项。', 'disciplines')

  const hasTracks = snapshot.tracks.length > 0
  checks.push(hasTracks)
  if (!hasTracks)
    pushBlocker('CONTEST_TRACKS_REQUIRED', '至少需要 1 个赛道。', 'tracks')

  const hasTimelines = snapshot.timelines.length > 0 || snapshot.trackTimelines.length > 0
  checks.push(hasTimelines)
  if (!hasTimelines)
    pushBlocker('CONTEST_TIMELINES_REQUIRED', '至少需要 1 个时间节点。', 'timelines')

  const hasRubrics = hasReleaseRubrics(snapshot)
  checks.push(hasRubrics)
  if (!hasRubrics)
    pushBlocker('CONTEST_RUBRICS_REQUIRED', '至少需要 1 条评分规则。', 'rubrics')

  const contestExternalId = normalizeText(contest.externalId) || normalizeText(input.version.scopeId)
  const currentContestId = normalizeText(input.version.liveEntityId) || normalizeText(contest.liveId)
  const existingExternalRef = contestExternalId
    ? await getFeishuExternalRef(db, {
        scope: 'contest',
        externalId: contestExternalId,
      })
    : null
  const existingExternalRefContestId = normalizeText(existingExternalRef?.entityId)
  if (existingExternalRefContestId && currentContestId && existingExternalRefContestId !== currentContestId) {
    pushBlocker(
      'CONTEST_DUPLICATED',
      `检测到重复竞赛（ID: ${existingExternalRefContestId}），请核对唯一编号/赛事名称。`,
      'externalId',
    )
  }

  if (hasName) {
    const compareContestId = currentContestId || existingExternalRefContestId
    const rows = await db.query<{ id: string, name: string }>(
      `SELECT id, name
       FROM contests
       WHERE status <> 'archived'
         AND id <> $1`,
      [compareContestId || ''],
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

  const faqItems = normalizeSnapshotFaqItems(contest.faqItems)
  if (faqItems.length === 0) {
    pushWarning('CONTEST_FAQ_ITEMS_EMPTY', '当前未配置结构化 FAQ 条目，建议补充。', 'faqItems')
  }
  else if (faqItems.some(item => !item.question || !item.answer)) {
    pushWarning('CONTEST_FAQ_ITEMS_INCOMPLETE', '存在 FAQ 条目未同时填写问题与答案。', 'faqItems')
  }

  const passedCount = checks.filter(Boolean).length
  const completion = Math.round((passedCount / checks.length) * 100)

  return {
    contestId: normalizeText(input.version.liveEntityId) || normalizeText(contest.liveId) || input.version.scopeId,
    canPublish: blockers.length === 0,
    completion,
    blockers,
    warnings,
  }
}

export async function listContestWorkflowTimeline(
  db: Queryable,
  input: {
    contestId: string
    actorUserId?: string
    page?: number
    pageSize?: number
    action?: string
    windowDays?: ReleaseQueueInsightsWindowDays
    rankingMode?: ReleaseQueueReviewerRankingMode
  },
): Promise<ContestWorkflowTimelineResult> {
  const page = Math.max(1, normalizeInteger(input.page || 1, 1))
  const pageSize = Math.max(1, Math.min(100, normalizeInteger(input.pageSize || 20, 20)))
  const actionFilter = normalizeText(input.action).toLowerCase()

  const [auditResult, versions] = await Promise.all([
    db.query<ContestAuditTimelineRow>(
      `SELECT
        id,
        contest_id,
        resource_id,
        actor_user_id,
        action,
        payload,
        created_at::TEXT
       FROM contest_audit_logs
       WHERE contest_id = $1
         AND action NOT ILIKE 'read.%'
       ORDER BY created_at DESC`,
      [input.contestId],
    ),
    listContestReleaseVersions(db, { contestId: input.contestId, limit: 200 }),
  ])

  const versionIds = versions.map(item => item.id)
  const versionMap = new Map(versions.map(item => [item.id, item]))
  const [releaseLogResult, aggregates] = await Promise.all([
    versionIds.length
      ? db.query<ReleaseReviewLogRow>(
          `SELECT
          id,
          release_version_id,
          actor_user_id,
          action,
          payload,
          created_at::TEXT
         FROM release_review_logs
         WHERE release_version_id = ANY($1::TEXT[])
         ORDER BY created_at DESC`,
          [versionIds],
        )
      : Promise.resolve({ rows: [] as ReleaseReviewLogRow[] }),
    listContestAuditAggregates(db, {
      versions,
      actorUserId: input.actorUserId,
      windowDays: input.windowDays,
      rankingMode: input.rankingMode,
    }),
  ])

  const items = [
    ...auditResult.rows.map(mapAuditRowToWorkflowTimelineItem),
    ...releaseLogResult.rows
      .map(mapReleaseReviewLog)
      .map((log) => {
        const version = versionMap.get(log.releaseVersionId)
        return version ? mapReleaseLogToWorkflowTimelineItem(log, version) : null
      })
      .filter(Boolean) as ContestWorkflowTimelineItem[],
  ]
    .filter((item) => {
      if (!actionFilter)
        return true
      const haystack = [
        item.action,
        item.title,
        item.description || '',
        item.source,
        item.syncItemId || '',
        item.syncRunId || '',
      ].join(' ').toLowerCase()
      return haystack.includes(actionFilter)
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  const offset = (page - 1) * pageSize
  return {
    aggregates,
    items: items.slice(offset, offset + pageSize),
    total: items.length,
    page,
    pageSize,
  }
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
  input: {
    contestExternalId: string
    contestId?: string | null
    includeUnmanaged?: boolean
  },
): Promise<{ snapshot: ContestReleaseSnapshot, liveEntityId: string | null }> {
  const contestExternalId = normalizeText(input.contestExternalId)
  const contestRef = contestExternalId
    ? await getFeishuExternalRef(db, {
        scope: 'contest',
        externalId: contestExternalId,
      })
    : null
  const contestId = normalizeText(input.contestId) || normalizeText(contestRef?.entityId)
  const includeUnmanaged = Boolean(input.includeUnmanaged)
  if (!contestId) {
    return {
      snapshot: createEmptyContestSnapshot(contestExternalId),
      liveEntityId: null,
    }
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
    externalId: contestExternalId || detail.contest.id,
    name: detail.contest.name,
    level: detail.contest.level as ContestLevel,
    organizer: detail.contest.organizer || '',
    coOrganizer: detail.contest.coOrganizer || '',
    officialUrl: detail.contest.officialUrl || '',
    summary: detail.contest.summary || '',
    participantRequirements: detail.contest.participantRequirements || '',
    teamRule: detail.contest.teamRule || '',
    currentSeason: detail.contest.currentSeason || '',
    disciplines: detail.contest.disciplines || [],
    aliases: detail.contest.aliases || [],
    keywords: detail.contest.keywords || [],
    recommendedFor: detail.contest.recommendedFor || [],
    faq: detail.contest.faq || '',
    faqItems: detail.contest.faqItems || [],
    hotScore: Number(detail.contest.hotScore || 0),
    visibility: detail.contest.visibility || 'internal',
  }

  const tracks: ContestReleaseTrackSnapshot[] = detail.contest.tracks
    .filter(item => includeUnmanaged || trackRefById.has(item.id))
    .map((item) => {
      const ref = trackRefById.get(item.id)
      const trackExternalId = ref?.external_id || buildManualTrackExternalId(item.id)
      const rubric = rubricByTrackId.get(item.id)
      return {
        liveId: item.id,
        externalId: trackExternalId,
        contestExternalId: contestExternalId || detail.contest.id,
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
    .filter(item => includeUnmanaged || isManagedContestTimelineNote(item.note))
    .map((item, index) => {
      const externalId = extractManagedExternalId(item.note)
        || (isManagedContestTimelineNote(item.note)
          ? `${buildContestLegacyTimelinePrefix(contestExternalId || detail.contest.id)}${item.nodeType}:${item.year}:${index}`
          : buildManualContestTimelineExternalId(item.id))
      return {
        externalId,
        year: normalizeInteger(item.year, new Date().getFullYear()),
        nodeType: item.nodeType as TimelineNodeType,
        businessNodeLabel: item.businessNodeLabel || '',
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
    if (!trackExternalId && !includeUnmanaged)
      continue
    const derivedManaged = isManagedDerivedTrackTimelineNote(item.note)

    snapshotTrackTimelines.push({
      externalId: ref?.external_id
        || extractManagedExternalId(item.note)
        || (derivedManaged
          ? `${buildTrackLegacyTimelinePrefix(trackExternalId || buildManualTrackExternalId(item.trackId))}${item.nodeType}:${item.year}:${index}`
          : buildManualTrackTimelineExternalId(item.id)),
      trackExternalId: trackExternalId || buildManualTrackExternalId(item.trackId),
      trackLiveId: item.trackId,
      year: normalizeInteger(item.year, new Date().getFullYear()),
      nodeType: item.nodeType as TimelineNodeType,
      businessNodeLabel: item.businessNodeLabel || '',
      startAt: item.startAt || null,
      endAt: item.endAt || null,
      note: stripManagedNotePrefix(item.note),
      sourceLink: item.sourceLink || '',
    })
  }

  const snapshotResources: ContestReleaseResourceSnapshot[] = resources
    .filter(item => includeUnmanaged || resourceRefById.has(item.id))
    .map((item) => {
      const ref = resourceRefById.get(item.id)
      const metadata = sanitizeContestReleaseResourceMetadata(item.metadata)
      const trackId = normalizeText(metadata.trackId)
      return {
        liveId: item.id,
        externalId: ref?.external_id || buildManualResourceExternalId(item.id),
        contestExternalId: contestExternalId || detail.contest.id,
        trackExternalId: trackId ? (trackExternalIdByTrackId.get(trackId) || buildManualTrackExternalId(trackId)) : '',
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
      contestExternalId: contestExternalId || detail.contest.id,
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
    const result = await buildContestLiveBaseSnapshot(db, {
      contestExternalId: input.scopeId,
    })
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

async function resolveContestReleaseScope(
  db: Queryable,
  contestId: string,
): Promise<{ scopeId: string, latestVersion: ReleaseVersion | null }> {
  const versionStatuses: ReleaseVersionStatus[] = [
    'pending_first_review',
    'pending_second_review',
    'approved',
    'rejected',
    'published',
  ]

  const latestByLive = await listReleaseScopedVersions(db, {
    scopeKind: 'contest',
    liveEntityId: contestId,
    statuses: versionStatuses,
    limit: 1,
  })
  if (latestByLive[0]) {
    return {
      scopeId: latestByLive[0].scopeId,
      latestVersion: latestByLive[0],
    }
  }

  const refResult = await db.query<{ external_id: string }>(
    `SELECT external_id
     FROM feishu_external_refs
     WHERE provider = 'feishu_bitable'
       AND scope = 'contest'
       AND entity_id = $1
     LIMIT 1`,
    [contestId],
  )
  const scopeId = normalizeText(refResult.rows[0]?.external_id) || contestId
  const latestByScope = await listReleaseScopedVersions(db, {
    scopeKind: 'contest',
    scopeId,
    statuses: versionStatuses,
    limit: 1,
  })
  return {
    scopeId,
    latestVersion: latestByScope[0] || null,
  }
}

export async function createContestManualReleaseDraft(
  db: Queryable,
  input: {
    actorUserId: string
    contestId: string
    sourceModule?: string
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
      faqItems?: Array<{ question?: string, answer?: string, sortOrder?: number }>
      hotScore?: number
      visibility?: 'internal' | 'public'
    }
  },
): Promise<{
  version: ReleaseVersion | null
  scopeId: string
  unchanged: boolean
}> {
  const liveDetail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: true,
  })
  if (!liveDetail)
    throw new Error('CONTEST_NOT_FOUND')

  const { scopeId, latestVersion } = await resolveContestReleaseScope(db, input.contestId)
  const current = latestVersion
    ? toContestSnapshot(latestVersion.snapshot, scopeId)
    : (await buildContestLiveBaseSnapshot(db, {
        contestExternalId: scopeId,
        contestId: input.contestId,
        includeUnmanaged: true,
      })).snapshot

  if (!current.contest) {
    const liveBase = await buildContestLiveBaseSnapshot(db, {
      contestExternalId: scopeId,
      contestId: input.contestId,
      includeUnmanaged: true,
    })
    current.contest = liveBase.snapshot.contest
    current.tracks = liveBase.snapshot.tracks
    current.timelines = liveBase.snapshot.timelines
    current.trackTimelines = liveBase.snapshot.trackTimelines
    current.resources = liveBase.snapshot.resources
  }

  const next = toContestSnapshot(current, scopeId)
  const contest = next.contest || {
    liveId: input.contestId,
    externalId: scopeId,
    name: liveDetail.contest.name,
    level: liveDetail.contest.level as ContestLevel,
    officialUrl: liveDetail.contest.officialUrl || '',
    summary: liveDetail.contest.summary || '',
    disciplines: liveDetail.contest.disciplines || [],
    aliases: liveDetail.contest.aliases || [],
    keywords: liveDetail.contest.keywords || [],
    recommendedFor: liveDetail.contest.recommendedFor || [],
    faq: liveDetail.contest.faq || '',
    faqItems: liveDetail.contest.faqItems || [],
    hotScore: Number(liveDetail.contest.hotScore || 0),
    visibility: liveDetail.contest.visibility || 'internal',
  }

  if (input.patch.name !== undefined)
    contest.name = normalizeText(input.patch.name)
  if (input.patch.level !== undefined)
    contest.level = input.patch.level
  if (input.patch.organizer !== undefined)
    contest.organizer = normalizeText(input.patch.organizer)
  if (input.patch.coOrganizer !== undefined)
    contest.coOrganizer = normalizeText(input.patch.coOrganizer)
  if (input.patch.officialUrl !== undefined)
    contest.officialUrl = normalizeText(input.patch.officialUrl)
  if (input.patch.summary !== undefined)
    contest.summary = normalizeText(input.patch.summary)
  if (input.patch.participantRequirements !== undefined)
    contest.participantRequirements = normalizeText(input.patch.participantRequirements)
  if (input.patch.teamRule !== undefined)
    contest.teamRule = normalizeText(input.patch.teamRule)
  if (input.patch.currentSeason !== undefined)
    contest.currentSeason = normalizeText(input.patch.currentSeason)
  if (input.patch.disciplines !== undefined)
    contest.disciplines = normalizeStringArray(input.patch.disciplines)
  if (input.patch.aliases !== undefined)
    contest.aliases = normalizeStringArray(input.patch.aliases)
  if (input.patch.keywords !== undefined)
    contest.keywords = normalizeStringArray(input.patch.keywords)
  if (input.patch.recommendedFor !== undefined)
    contest.recommendedFor = normalizeStringArray(input.patch.recommendedFor)
  if (input.patch.faq !== undefined)
    contest.faq = normalizeText(input.patch.faq)
  if (input.patch.faqItems !== undefined) {
    contest.faqItems = (input.patch.faqItems || [])
      .map((item, index) => ({
        question: normalizeText(item.question),
        answer: normalizeText(item.answer),
        sortOrder: normalizeInteger(item.sortOrder, index),
      }))
      .filter(item => item.question || item.answer)
  }
  if (input.patch.hotScore !== undefined)
    contest.hotScore = Math.max(0, normalizeInteger(input.patch.hotScore, 0))
  if (input.patch.visibility !== undefined)
    contest.visibility = input.patch.visibility

  contest.liveId = input.contestId
  contest.externalId = scopeId
  next.contest = contest

  const sanitizedNext = sanitizeContestReleaseSnapshot(next)
  const diffSummary = computeContestDiffSummary(current, sanitizedNext)
  if (!hasReleaseDiffSummaryChanges(diffSummary)) {
    return {
      version: null,
      scopeId,
      unchanged: true,
    }
  }

  const createdVersion = await createWorkingReleaseVersion(db, {
    actorUserId: input.actorUserId,
    scopeKind: 'contest',
    scopeId,
    scopeTitle: normalizeText(contest.name) || normalizeText(latestVersion?.scopeTitle) || scopeId,
    syncItemId: `manual:contest:${input.contestId}`,
    syncRunId: `manual:${randomUUID()}`,
    liveEntityId: input.contestId,
    snapshot: sanitizedNext,
    diffSummary,
    reviewAction: 'manual_generated',
    reviewPayload: {
      contestId: input.contestId,
      sourceModule: normalizeText(input.sourceModule) || 'overview',
    },
  })

  return {
    version: createdVersion,
    scopeId,
    unchanged: false,
  }
}

async function findSyncRunScopedReleaseVersion(
  db: Queryable,
  input: {
    scopeKind: ReleaseScopeKind
    scopeId: string
    syncRunId: string
  },
): Promise<ReleaseVersion | null> {
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
    [input.scopeKind, input.scopeId, normalizeText(input.syncRunId)],
  )
  return existingResult.rows[0] ? mapReleaseVersion(existingResult.rows[0]) : null
}

async function getLatestMergeableContestReleaseDraft(
  db: Queryable,
  input: {
    scopeId: string
  },
): Promise<ReleaseVersion | null> {
  const items = await listReleaseScopedVersions(db, {
    scopeKind: 'contest',
    scopeId: input.scopeId,
    statuses: ['pending_first_review'],
    limit: 1,
  })
  return items[0] || null
}

async function createWorkingReleaseVersion(
  db: Queryable,
  input: {
    actorUserId: string
    scopeKind: ReleaseScopeKind
    scopeId: string
    scopeTitle: string
    syncItemId: string
    syncRunId: string
    liveEntityId?: string | null
    snapshot: ContestReleaseSnapshot | PolicyLibraryReleaseSnapshot
    diffSummary: ReleaseDiffSummary
    reviewAction?: ReleaseReviewAction
    reviewPayload?: Record<string, unknown>
  },
): Promise<ReleaseVersion> {
  const latestVersionResult = await db.query<{ version_number: string }>(
    `SELECT COALESCE(MAX(version_number), 0)::TEXT AS version_number
     FROM release_versions
     WHERE scope_kind = $1
       AND scope_id = $2`,
    [input.scopeKind, input.scopeId],
  )
  const versionNumber = normalizeInteger(latestVersionResult.rows[0]?.version_number, 0) + 1
  const versionId = randomUUID()

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
      normalizeText(input.liveEntityId) || '',
      normalizeText(input.scopeTitle) || normalizeText(input.scopeId),
      versionNumber,
      JSON.stringify(input.snapshot),
      JSON.stringify(input.diffSummary),
      input.syncItemId,
      input.syncRunId,
      input.actorUserId,
    ],
  )

  await db.query(
    `UPDATE release_versions
     SET status = 'superseded',
         superseded_by_version_id = $1,
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE scope_kind = $3
       AND scope_id = $4
       AND status <> 'published'
       AND status <> 'superseded'
       AND id <> $1`,
    [versionId, input.actorUserId, input.scopeKind, input.scopeId],
  )

  await insertReleaseReviewLog(db, {
    releaseVersionId: versionId,
    actorUserId: input.actorUserId,
    action: input.reviewAction || 'sync_generated',
    payload: {
      syncItemId: input.syncItemId,
      syncRunId: input.syncRunId,
      scopeKind: input.scopeKind,
      scopeId: input.scopeId,
      versionNumber,
      ...parseJsonObject(input.reviewPayload),
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
    recordId?: string
    contestExternalId: string
    scopeTitle?: string
    entityType: 'contest' | 'track' | 'track_timeline' | 'resource'
    contest?: ContestReleaseContestSnapshot | null
    track?: ContestReleaseTrackSnapshot | null
    timelines?: ContestReleaseTimelineSnapshot[]
    trackTimelines?: ContestReleaseTrackTimelineSnapshot[]
    resource?: ContestReleaseResourceSnapshot | null
  },
): Promise<{ version: ReleaseVersion | null, existed: boolean }> {
  const scopeId = normalizeText(input.contestExternalId)
  const existingVersion = await findSyncRunScopedReleaseVersion(db, {
    scopeKind: 'contest',
    scopeId,
    syncRunId: input.syncRunId,
  })
  const mergeBaseVersion = existingVersion
    ? null
    : await getLatestMergeableContestReleaseDraft(db, {
        scopeId,
      })
  const baseResult = await loadBaseSnapshot(db, {
    scopeKind: 'contest',
    scopeId,
  })
  const base = mergeBaseVersion
    ? toContestSnapshot(mergeBaseVersion.snapshot, scopeId)
    : (baseResult.contestSnapshot || createEmptyContestSnapshot(scopeId))
  const current = existingVersion
    ? toContestSnapshot(existingVersion.snapshot, scopeId)
    : toContestSnapshot(base, scopeId)

  let existed = false
  let nextScopeTitle = normalizeText(existingVersion?.scopeTitle)
    || normalizeText(mergeBaseVersion?.scopeTitle)
    || normalizeText(input.scopeTitle)
    || scopeId
  const syncSource = {
    syncItemId: input.syncItemId,
    syncRunId: input.syncRunId,
    recordId: input.recordId,
  }

  if (input.entityType === 'contest') {
    existed = Boolean(base.contest)
    const mergedContest = input.contest
      ? mergeContestManualPreservedFields(input.contest, current.contest || base.contest)
      : null
    const preservedContestFields = mergedContest?.preservedFields || []
    current.contest = mergedContest
      ? attachReleaseSyncSource(mergedContest.contest, {
          ...syncSource,
          preservedFields: preservedContestFields,
        })
      : null
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
    const trackResult = upsertSnapshotItem(current.tracks, attachReleaseSyncSource(input.track, syncSource))
    current.tracks = trackResult.items
    existed = trackResult.existed
    if ((input.trackTimelines || []).length > 0) {
      current.trackTimelines = [
        ...current.trackTimelines.filter(item =>
          item.trackExternalId !== input.track!.externalId
          || (
            !item.externalId.startsWith(buildTrackDerivedTimelinePrefix(input.track!.externalId))
            && !item.externalId.startsWith(buildTrackLegacyTimelinePrefix(input.track!.externalId))
          ),
        ),
        ...(input.trackTimelines || []).map(item => attachReleaseSyncSource(item, syncSource)),
      ]
    }
  }

  if (input.entityType === 'track_timeline' && input.trackTimelines?.[0]) {
    const timelineResult = upsertSnapshotItem(current.trackTimelines, attachReleaseSyncSource(input.trackTimelines[0], syncSource))
    current.trackTimelines = timelineResult.items
    existed = timelineResult.existed
  }

  if (input.entityType === 'resource' && input.resource) {
    const resourceResult = upsertSnapshotItem(
      current.resources,
      sanitizeContestReleaseResourceSnapshot(attachReleaseSyncSource(input.resource, syncSource)),
    )
    current.resources = resourceResult.items
    existed = resourceResult.existed
  }

  current.tracks.sort((left, right) => normalizeInteger(left.sortOrder) - normalizeInteger(right.sortOrder))

  const sanitizedCurrent = sanitizeContestReleaseSnapshot(current)
  const diffSummary = computeContestDiffSummary(base, sanitizedCurrent)
  if (!existingVersion && !hasReleaseDiffSummaryChanges(diffSummary)) {
    return {
      version: null,
      existed,
    }
  }

  if (existingVersion) {
    await db.query(
      `UPDATE release_versions
       SET scope_title = $2,
           snapshot_json = $3::JSONB,
           diff_summary_json = $4::JSONB,
           sync_item_id = $5,
           sync_run_id = $6,
           updated_by_user_id = $7,
           updated_at = NOW()
       WHERE id = $1`,
      [
        existingVersion.id,
        nextScopeTitle,
        JSON.stringify(sanitizedCurrent),
        JSON.stringify(diffSummary),
        input.syncItemId,
        input.syncRunId,
        input.actorUserId,
      ],
    )
    return {
      version: (await getReleaseVersionById(db, existingVersion.id))!,
      existed,
    }
  }

  const createdVersion = await createWorkingReleaseVersion(db, {
    actorUserId: input.actorUserId,
    scopeKind: 'contest',
    scopeId,
    scopeTitle: nextScopeTitle,
    syncItemId: input.syncItemId,
    syncRunId: input.syncRunId,
    liveEntityId: normalizeText(mergeBaseVersion?.liveEntityId) || baseResult.liveEntityId,
    snapshot: sanitizedCurrent,
    diffSummary,
  })

  return {
    version: createdVersion,
    existed,
  }
}

export async function upsertPolicyLibraryReleaseDraft(
  db: Queryable,
  input: {
    actorUserId: string
    syncItemId: string
    syncRunId: string
    recordId?: string
    scopeTitle?: string
    item: PolicyLibraryItemSnapshot
  },
): Promise<{ version: ReleaseVersion | null, existed: boolean }> {
  const scopeId = 'policy_library'
  const existingVersion = await findSyncRunScopedReleaseVersion(db, {
    scopeKind: 'policy_library',
    scopeId,
    syncRunId: input.syncRunId,
  })
  const baseResult = await loadBaseSnapshot(db, {
    scopeKind: 'policy_library',
    scopeId,
  })
  const base = baseResult.policySnapshot || createEmptyPolicySnapshot()
  const current = existingVersion
    ? toPolicySnapshot(existingVersion.snapshot)
    : toPolicySnapshot(base)
  const merged = upsertSnapshotItem(current.items, attachReleaseSyncSource(input.item, {
    syncItemId: input.syncItemId,
    syncRunId: input.syncRunId,
    recordId: input.recordId,
  }))
  current.items = merged.items
  const diffSummary = computePolicyDiffSummary(base, current)

  if (!existingVersion && !hasReleaseDiffSummaryChanges(diffSummary)) {
    return {
      version: null,
      existed: merged.existed,
    }
  }

  if (existingVersion) {
    await db.query(
      `UPDATE release_versions
       SET scope_title = $2,
           snapshot_json = $3::JSONB,
           diff_summary_json = $4::JSONB,
           sync_item_id = $5,
           sync_run_id = $6,
           updated_by_user_id = $7,
           updated_at = NOW()
       WHERE id = $1`,
      [
        existingVersion.id,
        normalizeText(input.scopeTitle) || '政策库',
        JSON.stringify(current),
        JSON.stringify(diffSummary),
        input.syncItemId,
        input.syncRunId,
        input.actorUserId,
      ],
    )
    return {
      version: (await getReleaseVersionById(db, existingVersion.id))!,
      existed: merged.existed,
    }
  }

  const createdVersion = await createWorkingReleaseVersion(db, {
    actorUserId: input.actorUserId,
    scopeKind: 'policy_library',
    scopeId,
    scopeTitle: normalizeText(input.scopeTitle) || '政策库',
    syncItemId: input.syncItemId,
    syncRunId: input.syncRunId,
    liveEntityId: baseResult.liveEntityId,
    snapshot: current,
    diffSummary,
  })

  return {
    version: createdVersion,
    existed: merged.existed,
  }
}

function createEmptyLegacyReleaseSummary(): FeishuBitableSyncCleanupLegacySummary {
  return {
    total: 0,
    contest: 0,
    track: 0,
    trackTimeline: 0,
    resource: 0,
    policy: 0,
  }
}

function finalizeLegacyReleaseSummary(
  summary: FeishuBitableSyncCleanupLegacySummary,
): FeishuBitableSyncCleanupLegacySummary {
  summary.total = summary.contest + summary.track + summary.trackTimeline + summary.resource + summary.policy
  return summary
}

function publishedReleaseScopeKind(
  entityType: FeishuBitableSyncItemEntityType,
): ReleaseScopeKind | null {
  if (entityType === 'contest' || entityType === 'track' || entityType === 'track_timeline' || entityType === 'resource')
    return 'contest'
  if (entityType === 'policy')
    return 'policy_library'
  return null
}

async function listManagedReleaseDraftVersions(
  db: Queryable,
  entityType: FeishuBitableSyncItemEntityType,
): Promise<ReleaseVersion[]> {
  const scopeKind = publishedReleaseScopeKind(entityType)
  if (!scopeKind)
    return []
  return listReleaseScopedVersions(db, {
    scopeKind,
    statuses: ['pending_first_review', 'pending_second_review', 'approved', 'rejected'],
    limit: 200,
  })
}

async function countPublishedManagedReleaseEntities(
  db: Queryable,
  entityType: FeishuBitableSyncItemEntityType,
): Promise<number> {
  if (entityType === 'contest') {
    const result = await db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM release_versions
       WHERE scope_kind = 'contest'
         AND status = 'published'
         AND snapshot_json -> 'contest' IS NOT NULL
         AND snapshot_json -> 'contest' <> 'null'::JSONB`,
    )
    return Math.max(0, Number(result.rows[0]?.item_count || 0) || 0)
  }
  if (entityType === 'track') {
    const result = await db.query<{ item_count: string }>(
      `SELECT COALESCE(SUM(jsonb_array_length(
        CASE
          WHEN jsonb_typeof(snapshot_json -> 'tracks') = 'array'
            THEN snapshot_json -> 'tracks'
          ELSE '[]'::JSONB
        END
      )), 0)::TEXT AS item_count
       FROM release_versions
       WHERE scope_kind = 'contest'
         AND status = 'published'`,
    )
    return Math.max(0, Number(result.rows[0]?.item_count || 0) || 0)
  }
  if (entityType === 'track_timeline') {
    const result = await db.query<{ item_count: string }>(
      `SELECT COALESCE(SUM(jsonb_array_length(
        CASE
          WHEN jsonb_typeof(snapshot_json -> 'trackTimelines') = 'array'
            THEN snapshot_json -> 'trackTimelines'
          ELSE '[]'::JSONB
        END
      )), 0)::TEXT AS item_count
       FROM release_versions
       WHERE scope_kind = 'contest'
         AND status = 'published'`,
    )
    return Math.max(0, Number(result.rows[0]?.item_count || 0) || 0)
  }
  if (entityType === 'resource') {
    const result = await db.query<{ item_count: string }>(
      `SELECT COALESCE(SUM(jsonb_array_length(
        CASE
          WHEN jsonb_typeof(snapshot_json -> 'resources') = 'array'
            THEN snapshot_json -> 'resources'
          ELSE '[]'::JSONB
        END
      )), 0)::TEXT AS item_count
       FROM release_versions
       WHERE scope_kind = 'contest'
         AND status = 'published'`,
    )
    return Math.max(0, Number(result.rows[0]?.item_count || 0) || 0)
  }
  if (entityType === 'policy') {
    const result = await db.query<{ item_count: string }>(
      `SELECT COALESCE(SUM(jsonb_array_length(
        CASE
          WHEN jsonb_typeof(snapshot_json -> 'items') = 'array'
            THEN snapshot_json -> 'items'
          ELSE '[]'::JSONB
        END
      )), 0)::TEXT AS item_count
       FROM release_versions
       WHERE scope_kind = 'policy_library'
         AND status = 'published'`,
    )
    return Math.max(0, Number(result.rows[0]?.item_count || 0) || 0)
  }
  return 0
}

export async function findReleaseSnapshotOwnerByExternalId(
  db: Queryable,
  input: {
    entityType: 'contest' | 'track' | 'track_timeline' | 'resource' | 'policy'
    externalId: string
  },
): Promise<{
  releaseVersionId: string
  releaseStatus: ReleaseVersionStatus
  scopeId: string
  syncItemId: string
} | null> {
  const externalId = normalizeText(input.externalId)
  if (!externalId)
    return null

  let query = ''
  if (input.entityType === 'contest') {
    query = `SELECT
      rv.id AS release_version_id,
      rv.status AS release_status,
      rv.scope_id,
      NULLIF(rv.snapshot_json -> 'contest' -> 'syncSource' ->> 'syncItemId', '') AS owner_sync_item_id
    FROM release_versions rv
    WHERE rv.scope_kind = 'contest'
      AND rv.status NOT IN ('published', 'superseded', 'rejected')
      AND rv.snapshot_json -> 'contest' ->> 'externalId' = $1
    ORDER BY rv.updated_at DESC, rv.created_at DESC
    LIMIT 1`
  }
  else if (input.entityType === 'track') {
    query = `SELECT
      rv.id AS release_version_id,
      rv.status AS release_status,
      rv.scope_id,
      NULLIF(track_item.item -> 'syncSource' ->> 'syncItemId', '') AS owner_sync_item_id
    FROM release_versions rv
    JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(rv.snapshot_json -> 'tracks') = 'array'
          THEN rv.snapshot_json -> 'tracks'
        ELSE '[]'::JSONB
      END
    ) AS track_item(item) ON TRUE
    WHERE rv.scope_kind = 'contest'
      AND rv.status NOT IN ('published', 'superseded', 'rejected')
      AND track_item.item ->> 'externalId' = $1
    ORDER BY rv.updated_at DESC, rv.created_at DESC
    LIMIT 1`
  }
  else if (input.entityType === 'track_timeline') {
    query = `SELECT
      rv.id AS release_version_id,
      rv.status AS release_status,
      rv.scope_id,
      NULLIF(timeline_item.item -> 'syncSource' ->> 'syncItemId', '') AS owner_sync_item_id
    FROM release_versions rv
    JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(rv.snapshot_json -> 'trackTimelines') = 'array'
          THEN rv.snapshot_json -> 'trackTimelines'
        ELSE '[]'::JSONB
      END
    ) AS timeline_item(item) ON TRUE
    WHERE rv.scope_kind = 'contest'
      AND rv.status NOT IN ('published', 'superseded', 'rejected')
      AND timeline_item.item ->> 'externalId' = $1
    ORDER BY rv.updated_at DESC, rv.created_at DESC
    LIMIT 1`
  }
  else if (input.entityType === 'resource') {
    query = `SELECT
      rv.id AS release_version_id,
      rv.status AS release_status,
      rv.scope_id,
      NULLIF(resource_item.item -> 'syncSource' ->> 'syncItemId', '') AS owner_sync_item_id
    FROM release_versions rv
    JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(rv.snapshot_json -> 'resources') = 'array'
          THEN rv.snapshot_json -> 'resources'
        ELSE '[]'::JSONB
      END
    ) AS resource_item(item) ON TRUE
    WHERE rv.scope_kind = 'contest'
      AND rv.status NOT IN ('published', 'superseded', 'rejected')
      AND resource_item.item ->> 'externalId' = $1
    ORDER BY rv.updated_at DESC, rv.created_at DESC
    LIMIT 1`
  }
  else {
    query = `SELECT
      rv.id AS release_version_id,
      rv.status AS release_status,
      rv.scope_id,
      NULLIF(policy_item.item -> 'syncSource' ->> 'syncItemId', '') AS owner_sync_item_id
    FROM release_versions rv
    JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(rv.snapshot_json -> 'items') = 'array'
          THEN rv.snapshot_json -> 'items'
        ELSE '[]'::JSONB
      END
    ) AS policy_item(item) ON TRUE
    WHERE rv.scope_kind = 'policy_library'
      AND rv.status NOT IN ('published', 'superseded', 'rejected')
      AND policy_item.item ->> 'externalId' = $1
    ORDER BY rv.updated_at DESC, rv.created_at DESC
    LIMIT 1`
  }

  const result = await db.query<ReleaseSnapshotOwnerRow>(query, [externalId])
  const row = result.rows[0]
  if (!row?.owner_sync_item_id)
    return null

  return {
    releaseVersionId: row.release_version_id,
    releaseStatus: row.release_status,
    scopeId: row.scope_id,
    syncItemId: row.owner_sync_item_id,
  }
}

export async function previewFeishuManagedReleaseDraftCleanup(
  db: Queryable,
  input: {
    syncItemId: string
    entityType: FeishuBitableSyncItemEntityType
  },
): Promise<{
  unpublishedReleaseDrafts: number
  legacyReleaseCleanup: FeishuBitableSyncCleanupLegacySummary
  publishedContestDataCount: number
  publishedPolicyDataCount: number
}> {
  const syncItemId = normalizeText(input.syncItemId)
  const legacyReleaseCleanup = createEmptyLegacyReleaseSummary()
  if (!syncItemId || input.entityType === 'persona') {
    return {
      unpublishedReleaseDrafts: 0,
      legacyReleaseCleanup,
      publishedContestDataCount: 0,
      publishedPolicyDataCount: 0,
    }
  }

  let unpublishedReleaseDrafts = 0
  const versions = await listManagedReleaseDraftVersions(db, input.entityType)
  for (const version of versions) {
    if (version.scopeKind === 'contest') {
      const snapshot = toContestSnapshot(version.snapshot, version.scopeId)
      if (input.entityType === 'contest') {
        const owner = normalizeReleaseSyncSource(snapshot.contest?.syncSource)
        if (snapshot.contest && owner?.syncItemId === syncItemId)
          unpublishedReleaseDrafts += 1
        else if (snapshot.contest && !owner)
          legacyReleaseCleanup.contest += 1
        continue
      }
      if (input.entityType === 'track') {
        for (const item of snapshot.tracks) {
          const owner = normalizeReleaseSyncSource(item.syncSource)
          if (owner?.syncItemId === syncItemId)
            unpublishedReleaseDrafts += 1
          else if (!owner)
            legacyReleaseCleanup.track += 1
        }
        continue
      }
      if (input.entityType === 'track_timeline') {
        for (const item of snapshot.trackTimelines) {
          const owner = normalizeReleaseSyncSource(item.syncSource)
          if (owner?.syncItemId === syncItemId)
            unpublishedReleaseDrafts += 1
          else if (!owner)
            legacyReleaseCleanup.trackTimeline += 1
        }
        continue
      }
      if (input.entityType === 'resource') {
        for (const item of snapshot.resources) {
          const owner = normalizeReleaseSyncSource(item.syncSource)
          if (owner?.syncItemId === syncItemId)
            unpublishedReleaseDrafts += 1
          else if (!owner)
            legacyReleaseCleanup.resource += 1
        }
      }
      continue
    }

    if (input.entityType !== 'policy')
      continue
    const snapshot = toPolicySnapshot(version.snapshot)
    for (const item of snapshot.items) {
      const owner = normalizeReleaseSyncSource(item.syncSource)
      if (owner?.syncItemId === syncItemId)
        unpublishedReleaseDrafts += 1
      else if (!owner)
        legacyReleaseCleanup.policy += 1
    }
  }

  finalizeLegacyReleaseSummary(legacyReleaseCleanup)

  return {
    unpublishedReleaseDrafts: unpublishedReleaseDrafts + legacyReleaseCleanup.total,
    legacyReleaseCleanup,
    publishedContestDataCount: await countPublishedManagedReleaseEntities(db, 'contest'),
    publishedPolicyDataCount: await countPublishedManagedReleaseEntities(db, 'policy'),
  }
}

export async function cleanupFeishuManagedReleaseDrafts(
  db: Queryable,
  input: {
    actorUserId: string
    syncItemId: string
    entityType: FeishuBitableSyncItemEntityType
    preserveExternalIds?: string[]
  },
): Promise<{
  unpublishedReleaseDrafts: number
  legacyReleaseCleanup: FeishuBitableSyncCleanupLegacySummary
  publishedContestDataCount: number
  publishedPolicyDataCount: number
  legacyForceCleared: boolean
}> {
  const syncItemId = normalizeText(input.syncItemId)
  const preserveExternalIds = new Set((input.preserveExternalIds || []).map(item => normalizeText(item)).filter(Boolean))
  const legacyReleaseCleanup = createEmptyLegacyReleaseSummary()
  if (!syncItemId || input.entityType === 'persona') {
    return {
      unpublishedReleaseDrafts: 0,
      legacyReleaseCleanup,
      publishedContestDataCount: 0,
      publishedPolicyDataCount: 0,
      legacyForceCleared: false,
    }
  }

  let unpublishedReleaseDrafts = 0
  const versions = await listManagedReleaseDraftVersions(db, input.entityType)
  for (const version of versions) {
    let changed = false

    if (version.scopeKind === 'contest') {
      const current = toContestSnapshot(version.snapshot, version.scopeId)
      if (input.entityType === 'contest') {
        const contestExternalId = normalizeText(current.contest?.externalId)
        const owner = normalizeReleaseSyncSource(current.contest?.syncSource)
        const removeManaged = Boolean(current.contest && owner?.syncItemId === syncItemId && !preserveExternalIds.has(contestExternalId))
        const removeLegacy = Boolean(current.contest && !owner)
        if (removeManaged || removeLegacy) {
          if (removeLegacy)
            legacyReleaseCleanup.contest += 1
          unpublishedReleaseDrafts += 1
          current.contest = null
          current.timelines = current.timelines.filter(item =>
            !item.externalId.startsWith(buildContestDerivedTimelinePrefix(current.contestExternalId))
            && !item.externalId.startsWith(buildContestLegacyTimelinePrefix(current.contestExternalId)),
          )
          changed = true
        }
      }
      else if (input.entityType === 'track') {
        const removedTrackExternalIds = new Set<string>()
        current.tracks = current.tracks.filter((item) => {
          const owner = normalizeReleaseSyncSource(item.syncSource)
          const removeManaged = owner?.syncItemId === syncItemId && !preserveExternalIds.has(item.externalId)
          const removeLegacy = !owner
          if (!removeManaged && !removeLegacy)
            return true
          if (removeLegacy)
            legacyReleaseCleanup.track += 1
          unpublishedReleaseDrafts += 1
          removedTrackExternalIds.add(item.externalId)
          changed = true
          return false
        })
        if (removedTrackExternalIds.size > 0) {
          current.trackTimelines = current.trackTimelines.filter((item) => {
            if (!removedTrackExternalIds.has(item.trackExternalId))
              return true
            return !item.externalId.startsWith(buildTrackDerivedTimelinePrefix(item.trackExternalId))
              && !item.externalId.startsWith(buildTrackLegacyTimelinePrefix(item.trackExternalId))
          })
        }
      }
      else if (input.entityType === 'track_timeline') {
        current.trackTimelines = current.trackTimelines.filter((item) => {
          const owner = normalizeReleaseSyncSource(item.syncSource)
          const removeManaged = owner?.syncItemId === syncItemId && !preserveExternalIds.has(item.externalId)
          const removeLegacy = !owner
          if (!removeManaged && !removeLegacy)
            return true
          if (removeLegacy)
            legacyReleaseCleanup.trackTimeline += 1
          unpublishedReleaseDrafts += 1
          changed = true
          return false
        })
      }
      else if (input.entityType === 'resource') {
        current.resources = current.resources.filter((item) => {
          const owner = normalizeReleaseSyncSource(item.syncSource)
          const removeManaged = owner?.syncItemId === syncItemId && !preserveExternalIds.has(item.externalId)
          const removeLegacy = !owner
          if (!removeManaged && !removeLegacy)
            return true
          if (removeLegacy)
            legacyReleaseCleanup.resource += 1
          unpublishedReleaseDrafts += 1
          changed = true
          return false
        })
      }

      if (changed) {
        const sanitizedCurrent = sanitizeContestReleaseSnapshot(current)
        const base = (await loadBaseSnapshot(db, {
          scopeKind: 'contest',
          scopeId: version.scopeId,
        })).contestSnapshot || createEmptyContestSnapshot(version.scopeId)
        const diffSummary = computeContestDiffSummary(base, sanitizedCurrent)
        await db.query(
          `UPDATE release_versions
           SET snapshot_json = $2::JSONB,
               diff_summary_json = $3::JSONB,
               updated_by_user_id = $4,
               updated_at = NOW()
           WHERE id = $1`,
          [
            version.id,
            JSON.stringify(sanitizedCurrent),
            JSON.stringify(diffSummary),
            input.actorUserId,
          ],
        )
      }
      continue
    }

    if (input.entityType !== 'policy')
      continue
    const current = toPolicySnapshot(version.snapshot)
    current.items = current.items.filter((item) => {
      const owner = normalizeReleaseSyncSource(item.syncSource)
      const removeManaged = owner?.syncItemId === syncItemId && !preserveExternalIds.has(item.externalId)
      const removeLegacy = !owner
      if (!removeManaged && !removeLegacy)
        return true
      if (removeLegacy)
        legacyReleaseCleanup.policy += 1
      unpublishedReleaseDrafts += 1
      changed = true
      return false
    })

    if (!changed)
      continue

    const base = (await loadBaseSnapshot(db, {
      scopeKind: 'policy_library',
      scopeId: version.scopeId,
    })).policySnapshot || createEmptyPolicySnapshot()
    const diffSummary = computePolicyDiffSummary(base, current)
    await db.query(
      `UPDATE release_versions
       SET snapshot_json = $2::JSONB,
           diff_summary_json = $3::JSONB,
           updated_by_user_id = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [
        version.id,
        JSON.stringify(current),
        JSON.stringify(diffSummary),
        input.actorUserId,
      ],
    )
  }

  finalizeLegacyReleaseSummary(legacyReleaseCleanup)

  return {
    unpublishedReleaseDrafts,
    legacyReleaseCleanup,
    publishedContestDataCount: await countPublishedManagedReleaseEntities(db, 'contest'),
    publishedPolicyDataCount: await countPublishedManagedReleaseEntities(db, 'policy'),
    legacyForceCleared: legacyReleaseCleanup.total > 0,
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

export async function resetRejectedReleaseToFirstReview(
  db: Queryable,
  input: {
    actorUserId: string
    releaseVersionId: string
  },
): Promise<ReleaseVersion> {
  const row = await getLockedReleaseVersion(db, input.releaseVersionId)
  if (!row)
    throw new Error('RELEASE_VERSION_NOT_FOUND')
  if (row.status !== 'rejected')
    throw new Error('RELEASE_RESET_TO_FIRST_REVIEW_STATUS_INVALID')

  await db.query(
    `UPDATE release_versions
     SET status = 'pending_first_review',
         first_review_by_user_id = NULL,
         first_review_at = NULL,
         second_review_claimed_by_user_id = NULL,
         second_review_claimed_at = NULL,
         second_review_by_user_id = NULL,
         second_review_at = NULL,
         rejected_by_user_id = NULL,
         rejected_at = NULL,
         reject_reason = '',
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.releaseVersionId, input.actorUserId],
  )
  await insertReleaseReviewLog(db, {
    releaseVersionId: input.releaseVersionId,
    actorUserId: input.actorUserId,
    action: 'reset_to_first_review',
    payload: {
      fromStatus: 'rejected',
      toStatus: 'pending_first_review',
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
      bypassReleaseWorkflowGuard: true,
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
    bypassReleaseWorkflowGuard: true,
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

  const effectiveMetadata = resolveContestReleaseEffectiveMetadata(snapshot)
  if (snapshot.contest) {
    if (contestId) {
      const liveContestBeforePublish = await getContestDetail(db, {
        contestId,
        includeInternal: true,
      })
      const liveContest = liveContestBeforePublish?.contest
      const patched = await patchAdminContest(db, {
        actorUserId: input.actorUserId,
        contestId,
        bypassSourceOfTruthGuard: true,
        patch: {
          name: snapshot.contest.name,
          level: snapshot.contest.level,
          officialUrl: normalizeText(snapshot.contest.officialUrl),
          summary: normalizeText(snapshot.contest.summary),
          participantRequirements: effectiveMetadata.participantRequirements || normalizeText(liveContest?.participantRequirements),
          currentSeason: effectiveMetadata.currentSeason || normalizeText(liveContest?.currentSeason),
          disciplines: snapshot.contest.disciplines || [],
          aliases: snapshot.contest.aliases || [],
          keywords: snapshot.contest.keywords || [],
          recommendedFor: snapshot.contest.recommendedFor || [],
          faq: normalizeText(snapshot.contest.faq),
          faqItems: snapshot.contest.faqItems || [],
          hotScore: Number(snapshot.contest.hotScore || 0),
          visibility: snapshot.contest.visibility || 'internal',
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
        participantRequirements: effectiveMetadata.participantRequirements,
        currentSeason: effectiveMetadata.currentSeason,
        disciplines: snapshot.contest.disciplines || [],
        aliases: snapshot.contest.aliases || [],
        keywords: snapshot.contest.keywords || [],
        recommendedFor: snapshot.contest.recommendedFor || [],
        faq: normalizeText(snapshot.contest.faq),
        faqItems: snapshot.contest.faqItems || [],
        hotScore: Number(snapshot.contest.hotScore || 0),
        visibility: snapshot.contest.visibility || 'internal',
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
        bypassSourceOfTruthGuard: true,
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
        bypassReleaseWorkflowGuard: true,
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
        business_node_label,
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
        normalizeInteger(timeline.year, new Date().getFullYear()),
        timeline.nodeType,
        normalizeText(timeline.businessNodeLabel),
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
        bypassReleaseWorkflowGuard: true,
        patch: {
          trackId,
          year: normalizeInteger(timeline.year, new Date().getFullYear()),
          nodeType: timeline.nodeType,
          businessNodeLabel: normalizeText(timeline.businessNodeLabel),
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
        bypassReleaseWorkflowGuard: true,
        trackId,
        year: normalizeInteger(timeline.year, new Date().getFullYear()),
        nodeType: timeline.nodeType,
        businessNodeLabel: normalizeText(timeline.businessNodeLabel),
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
        business_node_label,
        start_at,
        end_at,
        note,
        source_link,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      [
        randomUUID(),
        contestId,
        trackId,
        normalizeInteger(timeline.year, new Date().getFullYear()),
        timeline.nodeType,
        normalizeText(timeline.businessNodeLabel),
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
        bypassSourceOfTruthGuard: true,
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
      syncItemId: normalizeText(input.version.syncItemId) || null,
      syncRunId: normalizeText(input.version.syncRunId) || null,
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
    const publishCheck = await getContestReleasePublishCheck(db, { version })
    if (!publishCheck?.canPublish) {
      const error = new Error('RELEASE_PUBLISH_CHECK_FAILED')
      ;(error as Error & { publishCheck?: PublishCheckResult | null }).publishCheck = publishCheck
      throw error
    }
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
