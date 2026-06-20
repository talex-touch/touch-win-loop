import type { Queryable } from '~~/server/utils/db'
import type {
  BillingUsageEvent,
  BillingUsageEventCode,
  BillingUsageEventResult,
  BillingUsageEventSummaryRow,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface BillingUsageEventRow {
  id: string
  workspace_id: string
  workspace_name?: string | null
  project_id: string | null
  contest_id: string | null
  track_id: string | null
  project_resource_id: string | null
  contest_resource_id: string | null
  report_id: string | null
  actor_user_id: string | null
  actor_username?: string | null
  event_code: BillingUsageEventCode
  result: BillingUsageEventResult
  source_route: string
  meta: unknown
  created_at: string
}

interface BillingUsageSummaryRow {
  workspace_id: string
  workspace_name?: string | null
  event_code: BillingUsageEventCode
  result: BillingUsageEventResult
  total: string
}

export interface RecordBillingUsageEventInput {
  workspaceId: string
  projectId?: string | null
  contestId?: string | null
  trackId?: string | null
  projectResourceId?: string | null
  contestResourceId?: string | null
  reportId?: string | null
  actorUserId?: string | null
  eventCode: BillingUsageEventCode
  result: BillingUsageEventResult
  sourceRoute: string
  meta?: Record<string, unknown>
  createdAt?: string
}

export interface BillingUsageEventFilters {
  from?: string | null
  to?: string | null
  workspaceId?: string | null
  actorUserId?: string | null
  eventCode?: BillingUsageEventCode | null
  result?: BillingUsageEventResult | null
}

export interface ListBillingUsageEventsInput extends BillingUsageEventFilters {
  page?: number
  pageSize?: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeNullableText(value: unknown): string | null {
  const normalized = normalizeString(value)
  return normalized || null
}

function normalizePositiveInt(
  value: unknown,
  fallback: number,
  options?: {
    min?: number
    max?: number
  },
): number {
  const parsed = Number.parseInt(normalizeString(value), 10)
  if (Number.isNaN(parsed))
    return fallback

  const min = options?.min ?? Number.MIN_SAFE_INTEGER
  const max = options?.max ?? Number.MAX_SAFE_INTEGER
  return Math.min(max, Math.max(min, parsed))
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
      return {}
    }
    catch {
      return {}
    }
  }
  if (typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  return {}
}

function mapBillingUsageEvent(row: BillingUsageEventRow): BillingUsageEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: normalizeString(row.workspace_name) || undefined,
    projectId: normalizeNullableText(row.project_id),
    contestId: normalizeNullableText(row.contest_id),
    trackId: normalizeNullableText(row.track_id),
    projectResourceId: normalizeNullableText(row.project_resource_id),
    contestResourceId: normalizeNullableText(row.contest_resource_id),
    reportId: normalizeNullableText(row.report_id),
    actorUserId: normalizeNullableText(row.actor_user_id),
    actorUsername: normalizeString(row.actor_username) || undefined,
    eventCode: row.event_code,
    result: row.result,
    sourceRoute: normalizeString(row.source_route),
    meta: normalizeRecord(row.meta),
    createdAt: row.created_at,
  }
}

function mapBillingUsageSummaryRow(row: BillingUsageSummaryRow): BillingUsageEventSummaryRow {
  return {
    workspaceId: row.workspace_id,
    workspaceName: normalizeString(row.workspace_name) || undefined,
    eventCode: row.event_code,
    result: row.result,
    total: Math.max(0, Number(row.total || 0)),
  }
}

function appendFilter(
  clauses: string[],
  values: unknown[],
  sql: string,
  value: unknown,
): void {
  values.push(value)
  clauses.push(sql.replace('?', `$${values.length}`))
}

function buildFilterState(input: BillingUsageEventFilters, options?: { summarySuccessOnly?: boolean }) {
  const clauses: string[] = []
  const values: unknown[] = []

  const from = normalizeString(input.from)
  if (from)
    appendFilter(clauses, values, 'e.created_at >= ?::TIMESTAMPTZ', from)

  const to = normalizeString(input.to)
  if (to)
    appendFilter(clauses, values, 'e.created_at <= ?::TIMESTAMPTZ', to)

  const workspaceId = normalizeString(input.workspaceId)
  if (workspaceId)
    appendFilter(clauses, values, 'e.workspace_id = ?', workspaceId)

  const actorUserId = normalizeString(input.actorUserId)
  if (actorUserId)
    appendFilter(clauses, values, 'e.actor_user_id = ?', actorUserId)

  const eventCode = normalizeString(input.eventCode)
  if (eventCode)
    appendFilter(clauses, values, 'e.event_code = ?', eventCode)

  const summaryResult = normalizeString(input.result || (options?.summarySuccessOnly ? 'success' : ''))
  if (summaryResult)
    appendFilter(clauses, values, 'e.result = ?', summaryResult)

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  }
}

export async function recordBillingUsageEvent(
  db: Queryable,
  input: RecordBillingUsageEventInput,
): Promise<BillingUsageEvent> {
  const result = await db.query<BillingUsageEventRow>(
    `INSERT INTO billing_usage_events (
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      project_resource_id,
      contest_resource_id,
      report_id,
      actor_user_id,
      event_code,
      result,
      source_route,
      meta,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB, COALESCE($14::TIMESTAMPTZ, NOW())
    )
    RETURNING
      id,
      workspace_id,
      NULL::TEXT AS workspace_name,
      project_id,
      contest_id,
      track_id,
      project_resource_id,
      contest_resource_id,
      report_id,
      actor_user_id,
      NULL::TEXT AS actor_username,
      event_code,
      result,
      source_route,
      meta,
      created_at::TEXT`,
    [
      randomUUID(),
      normalizeString(input.workspaceId),
      normalizeNullableText(input.projectId),
      normalizeNullableText(input.contestId),
      normalizeNullableText(input.trackId),
      normalizeNullableText(input.projectResourceId),
      normalizeNullableText(input.contestResourceId),
      normalizeNullableText(input.reportId),
      normalizeNullableText(input.actorUserId),
      input.eventCode,
      input.result,
      normalizeString(input.sourceRoute),
      JSON.stringify(input.meta || {}),
      normalizeString(input.createdAt) || null,
    ],
  )

  return mapBillingUsageEvent(result.rows[0]!)
}

export async function listBillingUsageEvents(
  db: Queryable,
  input: ListBillingUsageEventsInput,
): Promise<{ items: BillingUsageEvent[], total: number, page: number, pageSize: number }> {
  const page = normalizePositiveInt(input.page, 1, { min: 1 })
  const pageSize = normalizePositiveInt(input.pageSize, 20, { min: 1, max: 200 })
  const offset = (page - 1) * pageSize
  const filterState = buildFilterState(input)

  const countResult = await db.query<{ total: string }>(
    `SELECT COUNT(*)::TEXT AS total
     FROM billing_usage_events e
     ${filterState.whereSql}`,
    filterState.values,
  )
  const total = Math.max(0, Number(countResult.rows[0]?.total || 0))

  const itemValues = [...filterState.values, pageSize, offset]
  const result = await db.query<BillingUsageEventRow>(
    `SELECT
      e.id,
      e.workspace_id,
      w.name AS workspace_name,
      e.project_id,
      e.contest_id,
      e.track_id,
      e.project_resource_id,
      e.contest_resource_id,
      e.report_id,
      e.actor_user_id,
      u.username AS actor_username,
      e.event_code,
      e.result,
      e.source_route,
      e.meta,
      e.created_at::TEXT
     FROM billing_usage_events e
     LEFT JOIN workspaces w
       ON w.id = e.workspace_id
     LEFT JOIN users u
       ON u.id = e.actor_user_id
     ${filterState.whereSql}
     ORDER BY e.created_at DESC
     LIMIT $${itemValues.length - 1}
     OFFSET $${itemValues.length}`,
    itemValues,
  )

  return {
    items: result.rows.map(mapBillingUsageEvent),
    total,
    page,
    pageSize,
  }
}

export async function summarizeBillingUsageEvents(
  db: Queryable,
  input: BillingUsageEventFilters,
  options?: {
    successOnly?: boolean
  },
): Promise<BillingUsageEventSummaryRow[]> {
  const filterState = buildFilterState(input, {
    summarySuccessOnly: options?.successOnly !== false,
  })

  const result = await db.query<BillingUsageSummaryRow>(
    `SELECT
      e.workspace_id,
      w.name AS workspace_name,
      e.event_code,
      e.result,
      COUNT(*)::TEXT AS total
     FROM billing_usage_events e
     LEFT JOIN workspaces w
       ON w.id = e.workspace_id
     ${filterState.whereSql}
     GROUP BY e.workspace_id, w.name, e.event_code, e.result
     ORDER BY e.workspace_id ASC, e.event_code ASC, e.result ASC`,
    filterState.values,
  )

  return result.rows.map(mapBillingUsageSummaryRow)
}
