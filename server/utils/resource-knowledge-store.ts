import type { Queryable } from '~~/server/utils/db'
import type {
  Contest,
  DocumentAnalysis,
  Resource,
  ResourceAvailability,
  ResourceCategory,
  ResourceGovernanceTask,
  ResourceGovernanceTaskStatus,
  ResourceGovernanceTaskType,
  ResourceKnowledgeGovernanceStatus,
  ResourceKnowledgeOverview,
  ResourceKnowledgeProfile,
  ResourceQualityIssue,
  ResourceRelation,
  ResourceRelationType,
  ResourceSearchEvent,
  ResourceSearchSort,
  ResourceStatus,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { buildDemandInsights, filterAndSortResources } from '~~/server/services/resource-knowledge'
import {
  getContestDetail,
  listAdminResources,
  listAllResources,
  listContestResourcesByContestId,
} from '~~/server/utils/contest-store'

interface ResourceKnowledgeProfileRow {
  resource_id: string
  contest_id: string
  predicted_category: string
  category_confidence: number
  ai_tags: string[] | null
  major_tags: string[] | null
  stage_tags: string[] | null
  quality_score: number
  value_score: number
  hot_score: number
  quality_issues: unknown
  governance_status: ResourceKnowledgeGovernanceStatus
  analysis_version: string
  manual_overrides: unknown
  component_scores: unknown
  analysis_payload: unknown
  last_analyzed_at: string | null
  created_at: string
  updated_at: string
}

interface ResourceRelationRow {
  id: string
  contest_id: string
  source_resource_id: string
  target_resource_id: string
  relation_type: ResourceRelationType
  weight: number
  reason: string
  target_title: string | null
  target_category: ResourceCategory | null
  created_at: string
  updated_at: string
}

interface ResourceSearchEventRow {
  id: string
  contest_id: string
  resource_id: string | null
  query: string
  filters_json: unknown
  result_count: number
  clicked: boolean
  session_id: string
  workspace_id: string | null
  user_id: string | null
  created_at: string
  updated_at: string
}

interface ResourceGovernanceTaskRow {
  id: string
  contest_id: string
  resource_id: string | null
  task_type: ResourceGovernanceTaskType
  status: ResourceGovernanceTaskStatus
  attempt: number
  max_attempt: number
  next_run_at: string
  error_message: string
  payload: unknown
  result_payload: unknown
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

interface ResourceDocumentAnalysisRow {
  resource_id: string
  analysis_json: unknown
}

interface ResourceSearchMetricRow {
  resource_id: string | null
  search_count_7d: string
  click_count_7d: string
  search_count_30d: string
  click_count_30d: string
}

interface KnowledgeContestSummaryRow {
  contest_id: string
  contest_name: string
  total_resources: string
  analyzed_resources: string
  review_resources: string
  suggested_invalid_resources: string
  suggested_archive_resources: string
  avg_quality_score: string
  avg_value_score: string
  avg_hot_score: string
  pending_tasks: string
}

export interface ResourceKnowledgeSearchMetrics {
  searchCount7d: number
  clickCount7d: number
  searchCount30d: number
  clickCount30d: number
}

export interface ResourceKnowledgeContext {
  contest: Contest
  resource: Resource
  documentAnalysis: DocumentAnalysis | null
  existingProfile: ResourceKnowledgeProfile | null
  searchMetrics: ResourceKnowledgeSearchMetrics
}

export interface ResourceKnowledgeDetail {
  contest: Contest
  resource: Resource
  profile: ResourceKnowledgeProfile | null
  relations: ResourceRelation[]
  governanceTasks: ResourceGovernanceTask[]
  documentAnalysis: DocumentAnalysis | null
  searchMetrics: ResourceKnowledgeSearchMetrics
}

export interface KnowledgeContestSummary {
  contestId: string
  contestName: string
  totalResources: number
  analyzedResources: number
  reviewResources: number
  suggestedInvalidResources: number
  suggestedArchiveResources: number
  avgQualityScore: number
  avgValueScore: number
  avgHotScore: number
  pendingTasks: number
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

function toDocumentAnalysis(value: unknown): DocumentAnalysis | null {
  const record = normalizeRecord(value)
  if (Object.keys(record).length === 0)
    return null
  return record as unknown as DocumentAnalysis
}

function toQualityIssues(value: unknown): ResourceQualityIssue[] {
  if (!Array.isArray(value))
    return []
  const issues: ResourceQualityIssue[] = []
  for (const item of value) {
    const issue = normalizeRecord(item)
    const code = normalizeString(issue.code)
    const message = normalizeString(issue.message)
    if (!code || !message)
      continue
    const severity = normalizeString(issue.severity) as ResourceQualityIssue['severity']
    issues.push({
      code,
      message,
      severity: severity === 'error' || severity === 'warning' || severity === 'info' ? severity : 'info',
      field: normalizeString(issue.field) || undefined,
      scoreImpact: Number.isFinite(Number(issue.scoreImpact)) ? Number(issue.scoreImpact) : undefined,
    })
  }
  return issues
}

function normalizeCategory(value: unknown): ResourceCategory | '' {
  return normalizeString(value) as ResourceCategory | ''
}

function toProfile(row: ResourceKnowledgeProfileRow, relatedResources: ResourceRelation[] = []): ResourceKnowledgeProfile {
  return {
    resourceId: row.resource_id,
    contestId: row.contest_id,
    predictedCategory: normalizeCategory(row.predicted_category),
    categoryConfidence: Number(row.category_confidence || 0),
    aiTags: normalizeStringArray(row.ai_tags),
    majorTags: normalizeStringArray(row.major_tags),
    stageTags: normalizeStringArray(row.stage_tags),
    qualityScore: Number(row.quality_score || 0),
    valueScore: Number(row.value_score || 0),
    hotScore: Number(row.hot_score || 0),
    governanceStatus: row.governance_status || 'pending',
    qualityIssues: toQualityIssues(row.quality_issues),
    relatedResources,
    analysisVersion: normalizeString(row.analysis_version) || 'v1',
    manualOverrides: normalizeRecord(row.manual_overrides),
    componentScores: Object.fromEntries(
      Object.entries(normalizeRecord(row.component_scores)).map(([key, value]) => [key, Number(value || 0)]),
    ),
    analysisPayload: normalizeRecord(row.analysis_payload),
    lastAnalyzedAt: row.last_analyzed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRelation(row: ResourceRelationRow): ResourceRelation {
  return {
    id: row.id,
    contestId: row.contest_id,
    sourceResourceId: row.source_resource_id,
    targetResourceId: row.target_resource_id,
    relationType: row.relation_type,
    weight: Number(row.weight || 0),
    reason: normalizeString(row.reason),
    targetTitle: normalizeString(row.target_title) || undefined,
    targetCategory: row.target_category || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toSearchEvent(row: ResourceSearchEventRow): ResourceSearchEvent {
  return {
    id: row.id,
    contestId: row.contest_id,
    resourceId: row.resource_id,
    query: normalizeString(row.query),
    filters: normalizeRecord(row.filters_json),
    resultCount: Number(row.result_count || 0),
    clicked: Boolean(row.clicked),
    sessionId: normalizeString(row.session_id),
    workspaceId: row.workspace_id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toTask(row: ResourceGovernanceTaskRow): ResourceGovernanceTask {
  return {
    id: row.id,
    contestId: row.contest_id,
    resourceId: row.resource_id,
    taskType: row.task_type,
    status: row.status,
    attempt: Number(row.attempt || 0),
    maxAttempt: Number(row.max_attempt || 0),
    payload: normalizeRecord(row.payload),
    resultPayload: normalizeRecord(row.result_payload),
    errorMessage: normalizeString(row.error_message),
    nextRunAt: row.next_run_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMetricMap(rows: ResourceSearchMetricRow[]): Map<string, ResourceKnowledgeSearchMetrics> {
  const map = new Map<string, ResourceKnowledgeSearchMetrics>()
  for (const row of rows) {
    const resourceId = normalizeString(row.resource_id)
    if (!resourceId)
      continue
    map.set(resourceId, {
      searchCount7d: Number(row.search_count_7d || 0),
      clickCount7d: Number(row.click_count_7d || 0),
      searchCount30d: Number(row.search_count_30d || 0),
      clickCount30d: Number(row.click_count_30d || 0),
    })
  }
  return map
}

function emptyMetrics(): ResourceKnowledgeSearchMetrics {
  return {
    searchCount7d: 0,
    clickCount7d: 0,
    searchCount30d: 0,
    clickCount30d: 0,
  }
}

export async function getResourceKnowledgeProfileByResourceId(
  db: Queryable,
  input: {
    contestId?: string
    resourceId: string
  },
): Promise<ResourceKnowledgeProfile | null> {
  const values: unknown[] = [input.resourceId]
  let contestSql = ''
  if (input.contestId) {
    values.push(input.contestId)
    contestSql = ` AND contest_id = $${values.length}`
  }

  const result = await db.query<ResourceKnowledgeProfileRow>(
    `SELECT
      resource_id,
      contest_id,
      predicted_category,
      category_confidence,
      ai_tags,
      major_tags,
      stage_tags,
      quality_score,
      value_score,
      hot_score,
      quality_issues,
      governance_status,
      analysis_version,
      manual_overrides,
      component_scores,
      analysis_payload,
      last_analyzed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_profiles
     WHERE resource_id = $1${contestSql}
     LIMIT 1`,
    values,
  )

  const row = result.rows[0]
  if (!row)
    return null

  const relations = await listResourceRelationsBySource(db, {
    contestId: row.contest_id,
    sourceResourceId: row.resource_id,
    limit: 6,
  })

  return toProfile(row, relations)
}

export async function listResourceKnowledgeProfilesByContest(
  db: Queryable,
  input: {
    contestId: string
    resourceIds?: string[]
  },
): Promise<ResourceKnowledgeProfile[]> {
  const resourceIds = [...new Set((input.resourceIds || []).map(item => normalizeString(item)).filter(Boolean))]
  const values: unknown[] = [input.contestId]
  let whereSql = 'contest_id = $1'
  if (resourceIds.length > 0) {
    values.push(resourceIds)
    whereSql += ` AND resource_id = ANY($${values.length}::TEXT[])`
  }

  const result = await db.query<ResourceKnowledgeProfileRow>(
    `SELECT
      resource_id,
      contest_id,
      predicted_category,
      category_confidence,
      ai_tags,
      major_tags,
      stage_tags,
      quality_score,
      value_score,
      hot_score,
      quality_issues,
      governance_status,
      analysis_version,
      manual_overrides,
      component_scores,
      analysis_payload,
      last_analyzed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_profiles
     WHERE ${whereSql}
     ORDER BY updated_at DESC`,
    values,
  )

  const relationMap = await listResourceRelationsForSources(db, {
    contestId: input.contestId,
    sourceResourceIds: result.rows.map(row => row.resource_id),
  })

  return result.rows.map(row => toProfile(row, relationMap.get(row.resource_id) || []))
}

export async function upsertResourceKnowledgeProfile(
  db: Queryable,
  input: {
    contestId: string
    resourceId: string
    actorUserId?: string | null
    profile: {
      predictedCategory?: ResourceCategory | ''
      categoryConfidence: number
      aiTags: string[]
      majorTags: string[]
      stageTags: string[]
      qualityScore: number
      valueScore: number
      hotScore: number
      qualityIssues: ResourceQualityIssue[]
      governanceStatus: ResourceKnowledgeGovernanceStatus
      analysisVersion: string
      manualOverrides?: Record<string, unknown>
      componentScores?: Record<string, number>
      analysisPayload?: Record<string, unknown>
    }
  },
): Promise<ResourceKnowledgeProfile> {
  const actorUserId = normalizeString(input.actorUserId) || null
  await db.query(
    `INSERT INTO contest_resource_profiles (
      resource_id,
      contest_id,
      predicted_category,
      category_confidence,
      ai_tags,
      major_tags,
      stage_tags,
      quality_score,
      value_score,
      hot_score,
      quality_issues,
      governance_status,
      analysis_version,
      manual_overrides,
      component_scores,
      analysis_payload,
      last_analyzed_at,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5::TEXT[], $6::TEXT[], $7::TEXT[], $8, $9, $10,
      $11::JSONB, $12, $13, $14::JSONB, $15::JSONB, $16::JSONB, NOW(), $17, $17, NOW(), NOW()
    )
    ON CONFLICT (resource_id) DO UPDATE SET
      contest_id = EXCLUDED.contest_id,
      predicted_category = EXCLUDED.predicted_category,
      category_confidence = EXCLUDED.category_confidence,
      ai_tags = EXCLUDED.ai_tags,
      major_tags = EXCLUDED.major_tags,
      stage_tags = EXCLUDED.stage_tags,
      quality_score = EXCLUDED.quality_score,
      value_score = EXCLUDED.value_score,
      hot_score = EXCLUDED.hot_score,
      quality_issues = EXCLUDED.quality_issues,
      governance_status = EXCLUDED.governance_status,
      analysis_version = EXCLUDED.analysis_version,
      manual_overrides = EXCLUDED.manual_overrides,
      component_scores = EXCLUDED.component_scores,
      analysis_payload = EXCLUDED.analysis_payload,
      last_analyzed_at = NOW(),
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = NOW()`,
    [
      input.resourceId,
      input.contestId,
      normalizeCategory(input.profile.predictedCategory),
      Math.max(0, Math.min(1, Number(input.profile.categoryConfidence || 0))),
      normalizeStringArray(input.profile.aiTags),
      normalizeStringArray(input.profile.majorTags),
      normalizeStringArray(input.profile.stageTags),
      Math.max(0, Number(input.profile.qualityScore || 0)),
      Math.max(0, Number(input.profile.valueScore || 0)),
      Math.max(0, Number(input.profile.hotScore || 0)),
      JSON.stringify(input.profile.qualityIssues || []),
      input.profile.governanceStatus || 'pending',
      normalizeString(input.profile.analysisVersion) || 'v1',
      JSON.stringify(normalizeRecord(input.profile.manualOverrides)),
      JSON.stringify(normalizeRecord(input.profile.componentScores)),
      JSON.stringify(normalizeRecord(input.profile.analysisPayload)),
      actorUserId,
    ],
  )

  const saved = await getResourceKnowledgeProfileByResourceId(db, {
    contestId: input.contestId,
    resourceId: input.resourceId,
  })
  if (!saved)
    throw new Error('RESOURCE_KNOWLEDGE_PROFILE_UPSERT_FAILED')
  return saved
}

export async function upsertResourceKnowledgeManualOverrides(
  db: Queryable,
  input: {
    contestId: string
    resourceId: string
    manualOverrides: Record<string, unknown>
    actorUserId?: string | null
  },
): Promise<ResourceKnowledgeProfile> {
  const actorUserId = normalizeString(input.actorUserId) || null
  await db.query(
    `INSERT INTO contest_resource_profiles (
      resource_id,
      contest_id,
      manual_overrides,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3::JSONB, $4, $4, NOW(), NOW()
    )
    ON CONFLICT (resource_id) DO UPDATE SET
      manual_overrides = $3::JSONB,
      updated_by_user_id = $4,
      updated_at = NOW()`,
    [
      input.resourceId,
      input.contestId,
      JSON.stringify(normalizeRecord(input.manualOverrides)),
      actorUserId,
    ],
  )

  const saved = await getResourceKnowledgeProfileByResourceId(db, {
    contestId: input.contestId,
    resourceId: input.resourceId,
  })
  if (!saved)
    throw new Error('RESOURCE_KNOWLEDGE_MANUAL_OVERRIDE_UPSERT_FAILED')
  return saved
}

export async function listResourceRelationsBySource(
  db: Queryable,
  input: {
    contestId: string
    sourceResourceId: string
    limit?: number
  },
): Promise<ResourceRelation[]> {
  const limit = Math.max(1, Math.min(20, Number(input.limit || 6)))
  const result = await db.query<ResourceRelationRow>(
    `SELECT
      rel.id,
      rel.contest_id,
      rel.source_resource_id,
      rel.target_resource_id,
      rel.relation_type,
      rel.weight,
      rel.reason,
      target.title AS target_title,
      target.category AS target_category,
      rel.created_at::TEXT,
      rel.updated_at::TEXT
     FROM contest_resource_relations rel
     JOIN contest_resources target ON target.id = rel.target_resource_id
     WHERE rel.contest_id = $1
       AND rel.source_resource_id = $2
     ORDER BY rel.weight DESC, rel.updated_at DESC
     LIMIT $3`,
    [input.contestId, input.sourceResourceId, limit],
  )

  return result.rows.map(toRelation)
}

export async function listResourceRelationsForSources(
  db: Queryable,
  input: {
    contestId: string
    sourceResourceIds: string[]
  },
): Promise<Map<string, ResourceRelation[]>> {
  const sourceResourceIds = [...new Set((input.sourceResourceIds || []).map(item => normalizeString(item)).filter(Boolean))]
  const map = new Map<string, ResourceRelation[]>()
  if (sourceResourceIds.length === 0)
    return map

  const result = await db.query<ResourceRelationRow>(
    `SELECT
      rel.id,
      rel.contest_id,
      rel.source_resource_id,
      rel.target_resource_id,
      rel.relation_type,
      rel.weight,
      rel.reason,
      target.title AS target_title,
      target.category AS target_category,
      rel.created_at::TEXT,
      rel.updated_at::TEXT
     FROM contest_resource_relations rel
     JOIN contest_resources target ON target.id = rel.target_resource_id
     WHERE rel.contest_id = $1
       AND rel.source_resource_id = ANY($2::TEXT[])
     ORDER BY rel.source_resource_id ASC, rel.weight DESC, rel.updated_at DESC`,
    [input.contestId, sourceResourceIds],
  )

  for (const row of result.rows) {
    const sourceResourceId = row.source_resource_id
    const current = map.get(sourceResourceId) || []
    if (current.length < 6)
      current.push(toRelation(row))
    map.set(sourceResourceId, current)
  }

  return map
}

export async function replaceResourceRelations(
  db: Queryable,
  input: {
    contestId: string
    sourceResourceId: string
    relations: ResourceRelation[]
  },
): Promise<ResourceRelation[]> {
  await db.query(
    `DELETE FROM contest_resource_relations
     WHERE contest_id = $1
       AND source_resource_id = $2`,
    [input.contestId, input.sourceResourceId],
  )

  if (input.relations.length > 0) {
    const values: unknown[] = []
    const rowsSql = input.relations.map((relation, index) => {
      const offset = index * 7
      values.push(
        relation.id || randomUUID(),
        input.contestId,
        input.sourceResourceId,
        relation.targetResourceId,
        relation.relationType,
        Math.max(0, Number(relation.weight || 0)),
        normalizeString(relation.reason),
      )
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, NOW(), NOW())`
    })

    await db.query(
      `INSERT INTO contest_resource_relations (
        id,
        contest_id,
        source_resource_id,
        target_resource_id,
        relation_type,
        weight,
        reason,
        created_at,
        updated_at
      ) VALUES ${rowsSql.join(', ')}`,
      values,
    )
  }

  return listResourceRelationsBySource(db, {
    contestId: input.contestId,
    sourceResourceId: input.sourceResourceId,
    limit: 6,
  })
}

export async function recordResourceSearchEvent(
  db: Queryable,
  input: {
    contestId: string
    resourceId?: string | null
    query?: string
    filters?: Record<string, unknown>
    resultCount?: number
    clicked?: boolean
    sessionId?: string
    workspaceId?: string | null
    userId?: string | null
  },
): Promise<ResourceSearchEvent> {
  const eventId = randomUUID()
  const sessionId = normalizeString(input.sessionId) || randomUUID()
  const parsedResultCount = Number(input.resultCount)
  const normalizedResultCount = Number.isFinite(parsedResultCount)
    ? Math.max(0, Math.floor(parsedResultCount))
    : 0
  await db.query(
    `INSERT INTO contest_resource_search_events (
      id,
      contest_id,
      resource_id,
      query,
      filters_json,
      result_count,
      clicked,
      session_id,
      workspace_id,
      user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5::JSONB, $6, $7, $8, $9, $10, NOW(), NOW()
    )`,
    [
      eventId,
      input.contestId,
      normalizeString(input.resourceId) || null,
      normalizeString(input.query),
      JSON.stringify(normalizeRecord(input.filters)),
      normalizedResultCount,
      Boolean(input.clicked),
      sessionId,
      normalizeString(input.workspaceId) || null,
      normalizeString(input.userId) || null,
    ],
  )

  const result = await db.query<ResourceSearchEventRow>(
    `SELECT
      id,
      contest_id,
      resource_id,
      query,
      filters_json,
      result_count,
      clicked,
      session_id,
      workspace_id,
      user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_search_events
     WHERE id = $1
     LIMIT 1`,
    [eventId],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('RESOURCE_SEARCH_EVENT_CREATE_FAILED')
  return toSearchEvent(row)
}

export async function listResourceSearchEvents(
  db: Queryable,
  input: {
    contestId: string
    limit?: number
    days?: number
  },
): Promise<ResourceSearchEvent[]> {
  const values: unknown[] = [input.contestId]
  const where: string[] = ['contest_id = $1']
  if (input.days) {
    values.push(String(Math.max(1, Number(input.days))))
    where.push(`created_at >= NOW() - ($${values.length}::TEXT || ' days')::INTERVAL`)
  }
  values.push(Math.max(1, Math.min(500, Number(input.limit || 200))))

  const result = await db.query<ResourceSearchEventRow>(
    `SELECT
      id,
      contest_id,
      resource_id,
      query,
      filters_json,
      result_count,
      clicked,
      session_id,
      workspace_id,
      user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_search_events
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows.map(toSearchEvent)
}

export async function getResourceSearchEventSummary(
  db: Queryable,
  input: {
    contestId: string
    days?: number
  },
): Promise<{
  searchCount: number
  clickCount: number
  zeroResultCount: number
}> {
  const values: unknown[] = [input.contestId]
  const where: string[] = ['contest_id = $1']
  if (input.days) {
    values.push(String(Math.max(1, Number(input.days))))
    where.push(`created_at >= NOW() - ($${values.length}::TEXT || ' days')::INTERVAL`)
  }

  const result = await db.query<{
    search_count: number
    click_count: number
    zero_result_count: number
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE clicked = FALSE) AS search_count,
      COUNT(*) FILTER (WHERE clicked = TRUE) AS click_count,
      COUNT(*) FILTER (WHERE clicked = FALSE AND result_count = 0) AS zero_result_count
     FROM contest_resource_search_events
     WHERE ${where.join(' AND ')}`,
    values,
  )

  return {
    searchCount: Number(result.rows[0]?.search_count || 0),
    clickCount: Number(result.rows[0]?.click_count || 0),
    zeroResultCount: Number(result.rows[0]?.zero_result_count || 0),
  }
}

export async function buildResourceSearchMetricsMap(
  db: Queryable,
  input: {
    contestId: string
    resourceIds?: string[]
  },
): Promise<Map<string, ResourceKnowledgeSearchMetrics>> {
  const resourceIds = [...new Set((input.resourceIds || []).map(item => normalizeString(item)).filter(Boolean))]
  const values: unknown[] = [input.contestId]
  let resourceSql = ''
  if (resourceIds.length > 0) {
    values.push(resourceIds)
    resourceSql = ` AND resource_id = ANY($${values.length}::TEXT[])`
  }

  const result = await db.query<ResourceSearchMetricRow>(
    `SELECT
      resource_id,
      COUNT(*) FILTER (WHERE clicked = FALSE AND created_at >= NOW() - INTERVAL '7 days')::TEXT AS search_count_7d,
      COUNT(*) FILTER (WHERE clicked = TRUE AND created_at >= NOW() - INTERVAL '7 days')::TEXT AS click_count_7d,
      COUNT(*) FILTER (WHERE clicked = FALSE AND created_at >= NOW() - INTERVAL '30 days')::TEXT AS search_count_30d,
      COUNT(*) FILTER (WHERE clicked = TRUE AND created_at >= NOW() - INTERVAL '30 days')::TEXT AS click_count_30d
     FROM contest_resource_search_events
     WHERE contest_id = $1
       AND resource_id IS NOT NULL${resourceSql}
     GROUP BY resource_id`,
    values,
  )

  return toMetricMap(result.rows)
}

export async function listResourceDemandInsights(
  db: Queryable,
  input: {
    contestId: string
    limit?: number
    days?: number
  },
) {
  const events = await listResourceSearchEvents(db, {
    contestId: input.contestId,
    limit: Math.max(50, Number(input.limit || 200)) * 5,
    days: input.days || 30,
  })

  return buildDemandInsights(events, Math.max(1, Math.min(50, Number(input.limit || 20))))
}

export async function enqueueResourceGovernanceTask(
  db: Queryable,
  input: {
    contestId: string
    resourceId?: string | null
    taskType: ResourceGovernanceTaskType
    actorUserId?: string | null
    payload?: Record<string, unknown>
    nextRunAt?: string
    maxAttempt?: number
    force?: boolean
  },
): Promise<ResourceGovernanceTask> {
  const normalizedResourceId = normalizeString(input.resourceId) || null

  if (!input.force) {
    const existing = await db.query<ResourceGovernanceTaskRow>(
      `SELECT
        id,
        contest_id,
        resource_id,
        task_type,
        status,
        attempt,
        max_attempt,
        next_run_at::TEXT,
        error_message,
        payload,
        result_payload,
        started_at::TEXT,
        finished_at::TEXT,
        created_at::TEXT,
        updated_at::TEXT
       FROM contest_resource_governance_tasks
       WHERE contest_id = $1
         AND COALESCE(resource_id, '') = COALESCE($2::TEXT, '')
         AND task_type = $3
         AND status IN ('queued', 'processing', 'failed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        input.contestId,
        normalizedResourceId,
        input.taskType,
      ],
    )

    if (existing.rows[0])
      return toTask(existing.rows[0])
  }

  const taskId = randomUUID()
  const actorUserId = normalizeString(input.actorUserId) || null
  const nextRunAt = normalizeString(input.nextRunAt)
  let existingTask: ResourceGovernanceTask | null = null

  await db.query(
    `INSERT INTO contest_resource_governance_tasks (
      id,
      contest_id,
      resource_id,
      task_type,
      status,
      attempt,
      max_attempt,
      next_run_at,
      error_message,
      payload,
      result_payload,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, 'queued', 0, $5, COALESCE($6::TIMESTAMPTZ, NOW()), '', $7::JSONB, '{}'::JSONB, $8, $8, NOW(), NOW()
    )`,
    [
      taskId,
      input.contestId,
      normalizedResourceId,
      input.taskType,
      Math.max(1, Number(input.maxAttempt || 6)),
      nextRunAt || null,
      JSON.stringify(normalizeRecord(input.payload)),
      actorUserId,
    ],
  )
    .catch(async (error) => {
      if ((error as { code?: string })?.code !== '23505' || input.force)
        throw error

      const existing = await db.query<ResourceGovernanceTaskRow>(
        `SELECT
        id,
        contest_id,
        resource_id,
        task_type,
        status,
        attempt,
        max_attempt,
        next_run_at::TEXT,
        error_message,
        payload,
        result_payload,
        started_at::TEXT,
        finished_at::TEXT,
        created_at::TEXT,
        updated_at::TEXT
       FROM contest_resource_governance_tasks
       WHERE contest_id = $1
         AND COALESCE(resource_id, '') = COALESCE($2::TEXT, '')
         AND task_type = $3
         AND status IN ('queued', 'processing', 'failed')
       ORDER BY created_at DESC
       LIMIT 1`,
        [
          input.contestId,
          normalizedResourceId,
          input.taskType,
        ],
      )

      if (existing.rows[0]) {
        existingTask = toTask(existing.rows[0])
        return
      }

      throw error
    })

  if (existingTask)
    return existingTask

  const created = await getResourceGovernanceTaskById(db, { taskId })
  if (!created)
    throw new Error('RESOURCE_GOVERNANCE_TASK_ENQUEUE_FAILED')
  return created
}

export async function getResourceGovernanceTaskById(
  db: Queryable,
  input: { taskId: string },
): Promise<ResourceGovernanceTask | null> {
  const result = await db.query<ResourceGovernanceTaskRow>(
    `SELECT
      id,
      contest_id,
      resource_id,
      task_type,
      status,
      attempt,
      max_attempt,
      next_run_at::TEXT,
      error_message,
      payload,
      result_payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_governance_tasks
     WHERE id = $1
     LIMIT 1`,
    [input.taskId],
  )

  return result.rows[0] ? toTask(result.rows[0]) : null
}

export async function listResourceGovernanceTasks(
  db: Queryable,
  input: {
    contestId: string
    status?: ResourceGovernanceTaskStatus | ''
    taskType?: ResourceGovernanceTaskType | ''
    resourceId?: string
    limit?: number
  },
): Promise<ResourceGovernanceTask[]> {
  const values: unknown[] = [input.contestId]
  const where: string[] = ['contest_id = $1']
  if (input.status) {
    values.push(input.status)
    where.push(`status = $${values.length}`)
  }
  if (input.taskType) {
    values.push(input.taskType)
    where.push(`task_type = $${values.length}`)
  }
  if (input.resourceId) {
    values.push(input.resourceId)
    where.push(`resource_id = $${values.length}`)
  }
  values.push(Math.max(1, Math.min(200, Number(input.limit || 50))))

  const result = await db.query<ResourceGovernanceTaskRow>(
    `SELECT
      id,
      contest_id,
      resource_id,
      task_type,
      status,
      attempt,
      max_attempt,
      next_run_at::TEXT,
      error_message,
      payload,
      result_payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_governance_tasks
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows.map(toTask)
}

export async function claimNextQueuedResourceGovernanceTask(
  db: Queryable,
): Promise<ResourceGovernanceTask | null> {
  const result = await db.query<ResourceGovernanceTaskRow>(
    `WITH picked AS (
      SELECT id
      FROM contest_resource_governance_tasks
      WHERE status IN ('queued', 'failed')
        AND next_run_at <= NOW()
      ORDER BY next_run_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE contest_resource_governance_tasks task
    SET status = 'processing',
        attempt = task.attempt + 1,
        error_message = '',
        started_at = NOW(),
        finished_at = NULL,
        updated_at = NOW()
    FROM picked
    WHERE task.id = picked.id
    RETURNING
      task.id,
      task.contest_id,
      task.resource_id,
      task.task_type,
      task.status,
      task.attempt,
      task.max_attempt,
      task.next_run_at::TEXT,
      task.error_message,
      task.payload,
      task.result_payload,
      task.started_at::TEXT,
      task.finished_at::TEXT,
      task.created_at::TEXT,
      task.updated_at::TEXT`,
  )

  return result.rows[0] ? toTask(result.rows[0]) : null
}

export async function finishResourceGovernanceTaskSuccess(
  db: Queryable,
  input: {
    taskId: string
    resultPayload?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE contest_resource_governance_tasks
     SET status = 'succeeded',
         error_message = '',
         result_payload = $2::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.taskId, JSON.stringify(normalizeRecord(input.resultPayload))],
  )
}

export async function finishResourceGovernanceTaskFailure(
  db: Queryable,
  input: {
    taskId: string
    attempt: number
    maxAttempt: number
    errorMessage: string
    resultPayload?: Record<string, unknown>
  },
): Promise<void> {
  const nextStatus: ResourceGovernanceTaskStatus = input.attempt >= input.maxAttempt ? 'dead_letter' : 'failed'
  const nextRunAtSql = nextStatus === 'dead_letter'
    ? 'next_run_at'
    : `NOW() + (LEAST(60, GREATEST(2, $4))::TEXT || ' minutes')::INTERVAL`

  await db.query(
    `UPDATE contest_resource_governance_tasks
     SET status = $2,
         error_message = $3,
         result_payload = $5::JSONB,
         next_run_at = ${nextRunAtSql},
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.taskId,
      nextStatus,
      normalizeString(input.errorMessage) || 'unknown error',
      Math.max(2, Number(input.attempt || 1) * 2),
      JSON.stringify(normalizeRecord(input.resultPayload)),
    ],
  )
}

export async function resetStaleResourceGovernanceTasks(
  db: Queryable,
  input: {
    staleMinutes: number
  },
): Promise<number> {
  const result = await db.query<{ id: string }>(
    `UPDATE contest_resource_governance_tasks
     SET status = 'queued',
         error_message = '[worker] processing timeout, requeued automatically',
         updated_at = NOW()
     WHERE status = 'processing'
       AND (started_at IS NULL OR started_at < NOW() - ($1::TEXT || ' minutes')::INTERVAL)
     RETURNING id`,
    [String(Math.max(1, Number(input.staleMinutes || 15)))],
  )

  return Number(result.rowCount || 0)
}

export async function listResourceDocumentAnalyses(
  db: Queryable,
  input: {
    contestId: string
    resourceIds?: string[]
  },
): Promise<Map<string, DocumentAnalysis | null>> {
  const resourceIds = [...new Set((input.resourceIds || []).map(item => normalizeString(item)).filter(Boolean))]
  const values: unknown[] = [input.contestId]
  let resourceSql = ''
  if (resourceIds.length > 0) {
    values.push(resourceIds)
    resourceSql = ` AND resource_id = ANY($${values.length}::TEXT[])`
  }

  const result = await db.query<ResourceDocumentAnalysisRow>(
    `SELECT DISTINCT ON (resource_id)
      resource_id,
      analysis_json
     FROM contest_resource_documents
     WHERE contest_id = $1${resourceSql}
     ORDER BY resource_id ASC, (analysis_json IS NULL) ASC, updated_at DESC`,
    values,
  )

  const map = new Map<string, DocumentAnalysis | null>()
  for (const row of result.rows)
    map.set(row.resource_id, toDocumentAnalysis(row.analysis_json))
  return map
}

export async function getResourceKnowledgeContext(
  db: Queryable,
  input: {
    contestId: string
    resourceId: string
  },
): Promise<ResourceKnowledgeContext | null> {
  const detail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: true,
  })
  if (!detail)
    return null

  const resources = await listAdminResources(db, {
    contestId: input.contestId,
  })
  const resource = resources.find(item => item.id === input.resourceId)
  if (!resource)
    return null

  const [documentMap, existingProfile, searchMetricsMap] = await Promise.all([
    listResourceDocumentAnalyses(db, {
      contestId: input.contestId,
      resourceIds: [input.resourceId],
    }),
    getResourceKnowledgeProfileByResourceId(db, {
      contestId: input.contestId,
      resourceId: input.resourceId,
    }),
    buildResourceSearchMetricsMap(db, {
      contestId: input.contestId,
      resourceIds: [input.resourceId],
    }),
  ])

  return {
    contest: detail.contest,
    resource,
    documentAnalysis: documentMap.get(input.resourceId) || null,
    existingProfile,
    searchMetrics: searchMetricsMap.get(input.resourceId) || emptyMetrics(),
  }
}

export async function getResourceKnowledgeDetail(
  db: Queryable,
  input: {
    contestId: string
    resourceId: string
  },
): Promise<ResourceKnowledgeDetail | null> {
  const context = await getResourceKnowledgeContext(db, input)
  if (!context)
    return null

  const [relations, governanceTasks] = await Promise.all([
    listResourceRelationsBySource(db, {
      contestId: input.contestId,
      sourceResourceId: input.resourceId,
      limit: 6,
    }),
    listResourceGovernanceTasks(db, {
      contestId: input.contestId,
      resourceId: input.resourceId,
      limit: 20,
    }),
  ])

  const resource = context.existingProfile
    ? {
        ...context.resource,
        aiProfile: {
          resourceId: context.existingProfile.resourceId,
          predictedCategory: context.existingProfile.predictedCategory,
          categoryConfidence: context.existingProfile.categoryConfidence,
          aiTags: context.existingProfile.aiTags,
          majorTags: context.existingProfile.majorTags,
          stageTags: context.existingProfile.stageTags,
          qualityScore: context.existingProfile.qualityScore,
          valueScore: context.existingProfile.valueScore,
          hotScore: context.existingProfile.hotScore,
          governanceStatus: context.existingProfile.governanceStatus,
          qualityIssues: context.existingProfile.qualityIssues,
          relatedResources: relations,
        },
      }
    : context.resource

  return {
    contest: context.contest,
    resource,
    profile: context.existingProfile,
    relations,
    governanceTasks,
    documentAnalysis: context.documentAnalysis,
    searchMetrics: context.searchMetrics,
  }
}

export async function attachKnowledgeToResources(
  db: Queryable,
  input: {
    contestId: string
    resources: Resource[]
  },
): Promise<Resource[]> {
  const resourceIds = [...new Set(input.resources.map(item => normalizeString(item.id)).filter(Boolean))]
  if (resourceIds.length === 0)
    return input.resources

  const [profiles, relationMap] = await Promise.all([
    listResourceKnowledgeProfilesByContest(db, {
      contestId: input.contestId,
      resourceIds,
    }),
    listResourceRelationsForSources(db, {
      contestId: input.contestId,
      sourceResourceIds: resourceIds,
    }),
  ])

  const profileMap = new Map(profiles.map(item => [item.resourceId, item]))
  return input.resources.map((resource) => {
    const profile = profileMap.get(resource.id)
    if (!profile)
      return resource
    return {
      ...resource,
      aiProfile: {
        resourceId: profile.resourceId,
        predictedCategory: profile.predictedCategory,
        categoryConfidence: profile.categoryConfidence,
        aiTags: profile.aiTags,
        majorTags: profile.majorTags,
        stageTags: profile.stageTags,
        qualityScore: profile.qualityScore,
        valueScore: profile.valueScore,
        hotScore: profile.hotScore,
        governanceStatus: profile.governanceStatus,
        qualityIssues: profile.qualityIssues,
        relatedResources: relationMap.get(resource.id) || profile.relatedResources || [],
      },
    }
  })
}

async function resolveContestIdByResourceId(
  db: Queryable,
  resourceId: string,
): Promise<string> {
  const result = await db.query<{ contest_id: string }>(
    `SELECT contest_id
     FROM contest_resources
     WHERE id = $1
     LIMIT 1`,
    [resourceId],
  )
  return normalizeString(result.rows[0]?.contest_id)
}

export async function listContestResourcesWithKnowledge(
  db: Queryable,
  input: {
    contestId: string
    includeInternal?: boolean
    status?: ResourceStatus | ''
    category?: ResourceCategory | ''
    year?: number
    availability?: ResourceAvailability | ''
    query?: string
    tags?: string[]
    sort?: ResourceSearchSort
    minQuality?: number
    relatedTo?: string
  },
): Promise<Resource[]> {
  const useAdminList = Boolean(input.includeInternal) && Boolean(input.status)
  const baseResources = useAdminList
    ? await listAdminResources(db, {
        contestId: input.contestId,
        status: input.status,
        category: input.category,
      })
    : await listContestResourcesByContestId(db, {
        contestId: input.contestId,
        includeInternal: Boolean(input.includeInternal),
        category: input.category,
        year: input.year,
        availability: input.availability,
      })

  let resources = await attachKnowledgeToResources(db, {
    contestId: input.contestId,
    resources: baseResources,
  })

  const relatedTo = normalizeString(input.relatedTo)
  if (relatedTo) {
    const relations = await listResourceRelationsBySource(db, {
      contestId: input.contestId,
      sourceResourceId: relatedTo,
      limit: 12,
    })
    const relationIds = new Set(relations.map(item => item.targetResourceId))
    resources = resources.filter(item => relationIds.has(item.id))
  }

  return filterAndSortResources({
    items: resources,
    query: input.query,
    tags: input.tags,
    minQuality: input.minQuality,
    sort: input.sort,
  })
}

export async function listGlobalResourcesWithKnowledge(
  db: Queryable,
  input: {
    includeInternal: boolean
    contestId?: string
    category?: ResourceCategory | ''
    year?: number
    availability?: ResourceAvailability | ''
    type?: string
    query?: string
    tags?: string[]
    sort?: ResourceSearchSort
    minQuality?: number
    relatedTo?: string
  },
): Promise<Resource[]> {
  let resources = await listAllResources(db, {
    includeInternal: input.includeInternal,
    contestId: input.contestId,
    category: input.category,
    year: input.year,
    availability: input.availability,
    type: input.type,
  })

  const contestIds = [...new Set(resources.map(item => normalizeString(item.contestId)).filter(Boolean))]
  const groups = new Map<string, Resource[]>()
  for (const resource of resources) {
    const current = groups.get(resource.contestId) || []
    current.push(resource)
    groups.set(resource.contestId, current)
  }

  const hydrated = await Promise.all(
    contestIds.map(async (contestId) => {
      const items = groups.get(contestId) || []
      return attachKnowledgeToResources(db, {
        contestId,
        resources: items,
      })
    }),
  )

  resources = hydrated.flat()

  const relatedTo = normalizeString(input.relatedTo)
  if (relatedTo) {
    const relationContestId = await resolveContestIdByResourceId(db, relatedTo)
    if (relationContestId) {
      const relations = await listResourceRelationsBySource(db, {
        contestId: relationContestId,
        sourceResourceId: relatedTo,
        limit: 12,
      })
      const relationIds = new Set(relations.map(item => item.targetResourceId))
      resources = resources.filter(item => relationIds.has(item.id))
    }
    else {
      resources = []
    }
  }

  return filterAndSortResources({
    items: resources,
    query: input.query,
    tags: input.tags,
    minQuality: input.minQuality,
    sort: input.sort,
  })
}

export async function getContestKnowledgeOverview(
  db: Queryable,
  input: {
    contestId: string
  },
): Promise<ResourceKnowledgeOverview | null> {
  const detail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: true,
  })
  if (!detail)
    return null

  const [resources, pendingTasks, demandInsights] = await Promise.all([
    listContestResourcesWithKnowledge(db, {
      contestId: input.contestId,
      includeInternal: true,
    }),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM contest_resource_governance_tasks
       WHERE contest_id = $1
         AND status IN ('queued', 'processing', 'failed')`,
      [input.contestId],
    ),
    listResourceDemandInsights(db, {
      contestId: input.contestId,
      limit: 10,
      days: 30,
    }),
  ])

  const analyzedResources = resources.filter(item => item.aiProfile)
  const average = (values: number[]) => values.length > 0
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
    : 0

  const categoryStats = detail.resourceStats.map((item) => {
    const categoryResources = analyzedResources.filter(resource => resource.category === item.category)
    return {
      category: item.category,
      count: item.count,
      avgQualityScore: average(categoryResources.map(resource => Number(resource.aiProfile?.qualityScore || 0))),
      avgValueScore: average(categoryResources.map(resource => Number(resource.aiProfile?.valueScore || 0))),
      avgHotScore: average(categoryResources.map(resource => Number(resource.aiProfile?.hotScore || 0))),
    }
  })

  const pickTopResources = (field: 'qualityScore' | 'valueScore' | 'hotScore') => {
    return [...analyzedResources]
      .sort((left, right) => Number(right.aiProfile?.[field] || 0) - Number(left.aiProfile?.[field] || 0))
      .slice(0, 5)
  }

  return {
    contestId: input.contestId,
    summary: {
      totalResources: resources.length,
      analyzedResources: analyzedResources.length,
      healthyResources: analyzedResources.filter(item => item.aiProfile?.governanceStatus === 'healthy').length,
      reviewResources: analyzedResources.filter(item => item.aiProfile?.governanceStatus === 'review').length,
      suggestedInvalidResources: analyzedResources.filter(item => item.aiProfile?.governanceStatus === 'suggested_invalid').length,
      suggestedArchiveResources: analyzedResources.filter(item => item.aiProfile?.governanceStatus === 'suggested_archive').length,
      pendingTasks: Number(pendingTasks.rows[0]?.count || 0),
      avgQualityScore: average(analyzedResources.map(item => Number(item.aiProfile?.qualityScore || 0))),
      avgValueScore: average(analyzedResources.map(item => Number(item.aiProfile?.valueScore || 0))),
      avgHotScore: average(analyzedResources.map(item => Number(item.aiProfile?.hotScore || 0))),
    },
    categoryStats,
    topQualityResources: pickTopResources('qualityScore'),
    topValueResources: pickTopResources('valueScore'),
    topHotResources: pickTopResources('hotScore'),
    demandInsights,
  }
}

export async function listKnowledgeContestSummaries(
  db: Queryable,
): Promise<KnowledgeContestSummary[]> {
  const result = await db.query<KnowledgeContestSummaryRow>(
    `SELECT
      c.id AS contest_id,
      c.name AS contest_name,
      COUNT(r.id)::TEXT AS total_resources,
      COUNT(p.resource_id)::TEXT AS analyzed_resources,
      COUNT(p.resource_id) FILTER (WHERE p.governance_status = 'review')::TEXT AS review_resources,
      COUNT(p.resource_id) FILTER (WHERE p.governance_status = 'suggested_invalid')::TEXT AS suggested_invalid_resources,
      COUNT(p.resource_id) FILTER (WHERE p.governance_status = 'suggested_archive')::TEXT AS suggested_archive_resources,
      COALESCE(ROUND(AVG(p.quality_score)::NUMERIC, 1), 0)::TEXT AS avg_quality_score,
      COALESCE(ROUND(AVG(p.value_score)::NUMERIC, 1), 0)::TEXT AS avg_value_score,
      COALESCE(ROUND(AVG(p.hot_score)::NUMERIC, 1), 0)::TEXT AS avg_hot_score,
      (
        SELECT COUNT(*)::TEXT
        FROM contest_resource_governance_tasks task
        WHERE task.contest_id = c.id
          AND task.status IN ('queued', 'processing', 'failed')
      ) AS pending_tasks
     FROM contests c
     LEFT JOIN contest_resources r ON r.contest_id = c.id
     LEFT JOIN contest_resource_profiles p ON p.resource_id = r.id
     GROUP BY c.id, c.name
     HAVING COUNT(r.id) > 0
     ORDER BY c.updated_at DESC, total_resources DESC`,
  )

  return result.rows.map(row => ({
    contestId: row.contest_id,
    contestName: row.contest_name,
    totalResources: Number(row.total_resources || 0),
    analyzedResources: Number(row.analyzed_resources || 0),
    reviewResources: Number(row.review_resources || 0),
    suggestedInvalidResources: Number(row.suggested_invalid_resources || 0),
    suggestedArchiveResources: Number(row.suggested_archive_resources || 0),
    avgQualityScore: Number(row.avg_quality_score || 0),
    avgValueScore: Number(row.avg_value_score || 0),
    avgHotScore: Number(row.avg_hot_score || 0),
    pendingTasks: Number(row.pending_tasks || 0),
  }))
}
