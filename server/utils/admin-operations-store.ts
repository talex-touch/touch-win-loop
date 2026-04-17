import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type {
  AdminContentAuditTrailItem,
  AdminContentGovernanceBacklogItem,
  AdminContentResourceRow,
  AdminContentSearchInsight,
  AdminContentTraceSnapshot,
  AdminEfficiencyFailureItem,
  AdminEfficiencySnapshot,
  AdminEfficiencySystemSnapshot,
  AdminOperationsBucket,
  AdminOperationsOverview,
  AdminOperationsTodoItem,
  AdminOperationsTrendPoint,
  AdminReportDatasetKey,
  AdminReportDatasetSchema,
  AdminReportFieldOption,
  AdminReportQuery,
  AdminReportResult,
  AdminReportResultColumn,
  AdminRevenuePlanDistribution,
  AdminRevenueSnapshot,
  AdminRevenueWorkspaceRow,
  AdminRiskAlert,
  AdminRiskSeverity,
  AdminRiskSnapshot,
  AdminUserSegmentRow,
  AdminUserSegmentSnapshot,
} from '~~/shared/types/admin-operations'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'
import { getProjectDocumentPreviewWorkerState } from '~~/server/utils/project-document-preview-worker-state'
import { getProjectKnowledgeWorkerState } from '~~/server/utils/project-knowledge-worker-state'
import { getProjectResourceRecycleWorkerState } from '~~/server/utils/project-resource-recycle-worker-state'

const PREVIEW_SUCCESS_RATE_RISK_THRESHOLD = 95
const PREVIEW_QUEUE_MINUTES_RISK_THRESHOLD = 30
const GOVERNANCE_BACKLOG_RISK_THRESHOLD = 30
const REPORT_DEFAULT_LIMIT = 200
const REPORT_MAX_LIMIT = 1000

interface CountRow {
  count: number
}

interface OverviewMetricsRow {
  total_users: number
  team_workspace_count: number
  project_count: number
  contest_count: number
  resource_count: number
  estimated_amount_cents: number
  governance_pending_count: number
  open_sync_issues: number
  sync_failed_runs_7d: number
}

interface OverviewTrendRow {
  day: string
  new_users: number
  active_users: number
  search_events: number
  governance_tasks: number
}

interface UserSnapshotRow {
  user_id: string
  username: string
  is_platform_admin: boolean
  is_disabled: boolean
  created_at: string
  platform_roles: string[] | null
  workspace_count: number
  team_workspace_count: number
  project_count: number
  completed_project_count: number
  in_progress_project_count: number
  draft_project_count: number
  active_session_count: number
  session_last_created_at: string | null
  ai_session_count_30d: number
  ai_session_count_7d: number
  ai_last_seen_at: string | null
  ai_message_count_30d: number
  ai_message_last_seen_at: string | null
  search_count_30d: number
  search_count_7d: number
  search_last_seen_at: string | null
}

interface ContentResourceQueryRow {
  resource_id: string
  contest_id: string
  contest_name: string
  title: string
  category: string
  status: string
  governance_status: string | null
  quality_score: number | null
  value_score: number | null
  hot_score: number | null
  search_count_30d: number | null
  click_count_30d: number | null
  updated_at: string
}

interface ContentSearchInsightRow {
  query: string
  search_count: number
  click_count: number
  zero_result_count: number
}

interface GovernanceBacklogRow {
  task_type: string
  status: string
  count: number
}

interface AuditTrailRow {
  id: string
  contest_id: string | null
  contest_name: string | null
  resource_id: string | null
  resource_title: string | null
  actor_username: string | null
  action: string
  created_at: string
}

interface ContentSummaryRow {
  contest_count: number
  resource_count: number
  analyzed_resource_count: number
  review_resource_count: number
  governance_pending_count: number
  search_count_30d: number
  click_count_30d: number
  audit_count_30d: number
  document_pending_count: number
  document_failed_count: number
}

interface ContentDistributionRow {
  key: string
  count: number
}

interface RevenueWorkspaceQueryRow {
  workspace_id: string
  workspace_name: string
  workspace_type: string
  owner_username: string
  member_count: number
  project_count: number
  seat_used: number
  seat_limit: number
  project_seat_used_total: number
  project_seat_limit_total: number
  extra_project_slots: number
  plan_id: string | null
  plan_code: string | null
  plan_name: string | null
  billing_cycle: string | null
  estimated_amount_cents: number
  billing_updated_at: string | null
}

interface PreviewMetricsRow {
  total_calls_24h: number
  succeeded_calls_24h: number
  failed_calls_24h: number
  queued_count: number
  processing_count: number
  oldest_queued_minutes: number
}

interface PreviewFailureRow {
  task_id: string
  created_at: string
  error_message: string
}

interface ProjectKnowledgeMetricsRow {
  succeeded_24h: number
  failed_24h: number
  queued_count: number
  processing_count: number
  stale_count: number
  latest_activity_at: string | null
}

interface ProjectKnowledgeFailureRow {
  task_id: string
  updated_at: string
  error_message: string
}

interface FeishuMetricsRow {
  run_count_7d: number
  success_count_7d: number
  failed_count_7d: number
  latest_run_at: string | null
  open_issue_count: number
  pending_task_count: number
}

interface FeishuFailureRow {
  run_id: string
  task_name: string
  started_at: string
  error_message: string
}

interface GovernanceMetricsRow {
  succeeded_24h: number
  failed_24h: number
  pending_count: number
  latest_activity_at: string | null
}

interface GovernanceFailureRow {
  task_id: string
  updated_at: string
  task_type: string
  error_message: string
}

interface AiMetricsRow {
  active_sessions_7d: number
  active_users_7d: number
  message_count_7d: number
  latest_activity_at: string | null
}

type ReportValue = string | number | boolean | null
type ReportRecord = Record<string, ReportValue>
type ReportFieldMap = Map<string, AdminReportFieldOption>

function normalizeReportRecord(input: object, extras: Record<string, ReportValue> = {}): ReportRecord {
  const record: ReportRecord = {}

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      record[key] = value.join(', ')
      continue
    }

    if (
      typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
      || value === null
    ) {
      record[key] = value
      continue
    }

    record[key] = value == null ? null : String(value)
  }

  for (const [key, value] of Object.entries(extras))
    record[key] = value

  return record
}

interface InternalUserRow extends AdminUserSegmentRow {
  aiSessionCount7d: number
  searchCount7d: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => normalizeString(item)).filter(Boolean)
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed))
    return parsed
  return fallback
}

function toBoolean(value: unknown): boolean {
  return value === true
}

function toIsoNow(): string {
  return new Date().toISOString()
}

function maxDateText(...values: Array<string | null | undefined>): string | null {
  let result = ''
  let resultTime = 0
  for (const value of values) {
    const text = normalizeString(value)
    if (!text)
      continue
    const time = new Date(text).getTime()
    if (!Number.isFinite(time))
      continue
    if (!result || time > resultTime) {
      result = text
      resultTime = time
    }
  }
  return result || null
}

function isWithinLastDays(value: string | null | undefined, days: number): boolean {
  const text = normalizeString(value)
  if (!text)
    return false
  const time = new Date(text).getTime()
  if (!Number.isFinite(time))
    return false
  return time >= Date.now() - days * 24 * 60 * 60 * 1000
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value))
    return 0
  const base = 10 ** digits
  return Math.round(value * base) / base
}

function toPercent(success: number, failed: number): number {
  const finished = Math.max(0, success) + Math.max(0, failed)
  if (finished <= 0)
    return 0
  return round((Math.max(0, success) / finished) * 100, 2)
}

function toYuan(cents: number): number {
  return round(Math.max(0, cents) / 100, 2)
}

function buildBuckets(entries: Array<{ key: string, label: string }>, rows: string[]): AdminOperationsBucket[] {
  const counts = new Map<string, number>()
  for (const row of rows)
    counts.set(row, (counts.get(row) || 0) + 1)

  const result: AdminOperationsBucket[] = []
  for (const entry of entries) {
    result.push({
      key: entry.key,
      label: entry.label,
      count: counts.get(entry.key) || 0,
    })
  }
  return result
}

function sortByDateDesc<T>(items: T[], selector: (item: T) => string | null | undefined): T[] {
  return [...items].sort((left, right) => {
    const leftTime = new Date(normalizeString(selector(left)) || 0).getTime()
    const rightTime = new Date(normalizeString(selector(right)) || 0).getTime()
    return rightTime - leftTime
  })
}

function sortAlerts(alerts: AdminRiskAlert[]): AdminRiskAlert[] {
  const severityOrder: Record<AdminRiskSeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }

  return [...alerts].sort((left, right) => {
    const severityDiff = severityOrder[right.severity] - severityOrder[left.severity]
    if (severityDiff !== 0)
      return severityDiff
    if (right.currentValue !== left.currentValue)
      return right.currentValue - left.currentValue
    return new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime()
  })
}

function escapeCsvCell(value: ReportValue): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n'))
    return text
  return `"${text.replaceAll('"', '""')}"`
}

function buildCsvFromResult(result: AdminReportResult): string {
  const headers = result.columns.map(column => escapeCsvCell(column.label))
  const lines = [headers.join(',')]
  for (const row of result.rows) {
    lines.push(result.columns.map(column => escapeCsvCell(row[column.key] ?? null)).join(','))
  }
  return `\uFEFF${lines.join('\n')}`
}

function classifyWorkspaceParticipation(workspaceCount: number): string {
  if (workspaceCount <= 0)
    return '未入组'
  if (workspaceCount === 1)
    return '单工作区'
  if (workspaceCount <= 3)
    return '2-3个工作区'
  return '4个以上工作区'
}

function classifyProjectMaturity(projectCount: number, inProgressCount: number, completedCount: number): string {
  if (projectCount <= 0)
    return '无项目'
  if (completedCount > 0)
    return '已完成'
  if (inProgressCount > 0)
    return '推进中'
  return '草稿中'
}

function classifyAiUsage(aiSessionCount30d: number, aiMessageCount30d: number): string {
  if (aiSessionCount30d <= 0 && aiMessageCount30d <= 0)
    return '未使用'
  if (aiMessageCount30d < 10)
    return '轻度'
  if (aiMessageCount30d < 50)
    return '中度'
  return '重度'
}

function classifySearchActivity(searchCount30d: number): string {
  if (searchCount30d <= 0)
    return '未搜索'
  if (searchCount30d < 10)
    return '低频'
  if (searchCount30d < 30)
    return '中频'
  return '高频'
}

function classifyPrimaryRole(isPlatformAdmin: boolean, roles: string[]): string {
  if (isPlatformAdmin)
    return 'platform_super_admin'
  if (roles.includes('contest_admin'))
    return 'contest_admin'
  if (roles.includes('pricing_admin'))
    return 'pricing_admin'
  return 'none'
}

function isUserActive7d(user: InternalUserRow): boolean {
  return user.activeSessionCount > 0
    || user.aiSessionCount7d > 0
    || user.searchCount7d > 0
    || isWithinLastDays(user.lastSeenAt, 7)
}

async function loadOverviewMetrics(db: Queryable): Promise<OverviewMetricsRow> {
  const result = await db.query<OverviewMetricsRow>(
    `SELECT
      (SELECT COUNT(*)::INTEGER FROM users) AS total_users,
      (SELECT COUNT(*)::INTEGER FROM workspaces WHERE type = 'team') AS team_workspace_count,
      (SELECT COUNT(*)::INTEGER FROM projects) AS project_count,
      (SELECT COUNT(*)::INTEGER FROM contests) AS contest_count,
      (SELECT COUNT(*)::INTEGER FROM contest_resources) AS resource_count,
      (
        SELECT COALESCE(SUM(wb.estimated_amount_cents), 0)::INTEGER
        FROM workspace_billing wb
        JOIN workspaces w ON w.id = wb.workspace_id
        WHERE w.type = 'team'
      ) AS estimated_amount_cents,
      (
        SELECT COUNT(*)::INTEGER
        FROM contest_resource_governance_tasks
        WHERE status IN ('queued', 'processing', 'failed', 'dead_letter')
      ) AS governance_pending_count,
      (
        SELECT COUNT(*)::INTEGER
        FROM feishu_sync_issues
        WHERE status = 'open'
      ) AS open_sync_issues,
      (
        SELECT COUNT(*)::INTEGER
        FROM feishu_bitable_sync_item_runs
        WHERE status = 'failed'
          AND started_at >= NOW() - INTERVAL '7 days'
      ) AS sync_failed_runs_7d`,
  )

  return result.rows[0] || {
    total_users: 0,
    team_workspace_count: 0,
    project_count: 0,
    contest_count: 0,
    resource_count: 0,
    estimated_amount_cents: 0,
    governance_pending_count: 0,
    open_sync_issues: 0,
    sync_failed_runs_7d: 0,
  }
}

async function loadOverviewTrend(db: Queryable): Promise<AdminOperationsTrendPoint[]> {
  const result = await db.query<OverviewTrendRow>(
    `WITH days AS (
       SELECT generate_series(
         CURRENT_DATE - INTERVAL '6 days',
         CURRENT_DATE,
         INTERVAL '1 day'
       )::DATE AS day
     ),
     new_users AS (
       SELECT DATE(created_at) AS day, COUNT(*)::INTEGER AS count
       FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY DATE(created_at)
     ),
     active_users AS (
       SELECT DATE(activity_at) AS day, COUNT(DISTINCT user_id)::INTEGER AS count
       FROM (
         SELECT user_id, created_at AS activity_at
         FROM sessions
         WHERE revoked_at IS NULL
           AND created_at >= CURRENT_DATE - INTERVAL '6 days'
         UNION ALL
         SELECT created_by_user_id AS user_id, updated_at AS activity_at
         FROM ai_chat_sessions
         WHERE updated_at >= CURRENT_DATE - INTERVAL '6 days'
         UNION ALL
         SELECT user_id, created_at AS activity_at
         FROM contest_resource_search_events
         WHERE user_id IS NOT NULL
           AND created_at >= CURRENT_DATE - INTERVAL '6 days'
       ) source
       GROUP BY DATE(activity_at)
     ),
     search_events AS (
       SELECT DATE(created_at) AS day, COUNT(*)::INTEGER AS count
       FROM contest_resource_search_events
       WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY DATE(created_at)
     ),
     governance_tasks AS (
       SELECT DATE(created_at) AS day, COUNT(*)::INTEGER AS count
       FROM contest_resource_governance_tasks
       WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY DATE(created_at)
     )
     SELECT
       TO_CHAR(days.day, 'YYYY-MM-DD') AS day,
       COALESCE(new_users.count, 0) AS new_users,
       COALESCE(active_users.count, 0) AS active_users,
       COALESCE(search_events.count, 0) AS search_events,
       COALESCE(governance_tasks.count, 0) AS governance_tasks
     FROM days
     LEFT JOIN new_users ON new_users.day = days.day
     LEFT JOIN active_users ON active_users.day = days.day
     LEFT JOIN search_events ON search_events.day = days.day
     LEFT JOIN governance_tasks ON governance_tasks.day = days.day
     ORDER BY days.day ASC`,
  )

  return result.rows.map(row => ({
    date: row.day,
    newUsers: toNumber(row.new_users),
    activeUsers: toNumber(row.active_users),
    searchEvents: toNumber(row.search_events),
    governanceTasks: toNumber(row.governance_tasks),
  }))
}

async function loadUserRows(db: Queryable): Promise<InternalUserRow[]> {
  const result = await db.query<UserSnapshotRow>(
    `WITH role_agg AS (
       SELECT user_id, ARRAY_AGG(role ORDER BY role) AS platform_roles
       FROM platform_user_roles
       GROUP BY user_id
     ),
     workspace_agg AS (
       SELECT
         wm.user_id,
         COUNT(DISTINCT wm.workspace_id)::INTEGER AS workspace_count,
         COUNT(DISTINCT wm.workspace_id) FILTER (WHERE w.type = 'team')::INTEGER AS team_workspace_count
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE COALESCE(wm.is_enabled, TRUE) = TRUE
       GROUP BY wm.user_id
     ),
     project_link AS (
       SELECT p.id AS project_id, p.status, p.owner_user_id AS user_id
       FROM projects p
       UNION
       SELECT p.id AS project_id, p.status, p.creator_user_id AS user_id
       FROM projects p
       UNION
       SELECT pm.project_id, p.status, pm.user_id
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
     ),
     project_agg AS (
       SELECT
         user_id,
         COUNT(DISTINCT project_id)::INTEGER AS project_count,
         COUNT(DISTINCT project_id) FILTER (WHERE status = 'completed')::INTEGER AS completed_project_count,
         COUNT(DISTINCT project_id) FILTER (WHERE status = 'in_progress')::INTEGER AS in_progress_project_count,
         COUNT(DISTINCT project_id) FILTER (WHERE status = 'draft')::INTEGER AS draft_project_count
       FROM project_link
       WHERE user_id IS NOT NULL
         AND user_id <> ''
       GROUP BY user_id
     ),
     session_agg AS (
       SELECT
         user_id,
         COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at > NOW())::INTEGER AS active_session_count,
         MAX(created_at)::TEXT AS session_last_created_at
       FROM sessions
       GROUP BY user_id
     ),
     ai_session_agg AS (
       SELECT
         created_by_user_id AS user_id,
         COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days')::INTEGER AS ai_session_count_30d,
         COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days')::INTEGER AS ai_session_count_7d,
         MAX(updated_at)::TEXT AS ai_last_seen_at
       FROM ai_chat_sessions
       GROUP BY created_by_user_id
     ),
     ai_message_agg AS (
       SELECT
         created_by_user_id AS user_id,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::INTEGER AS ai_message_count_30d,
         MAX(created_at)::TEXT AS ai_message_last_seen_at
       FROM ai_chat_messages
       GROUP BY created_by_user_id
     ),
     search_agg AS (
       SELECT
         user_id,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::INTEGER AS search_count_30d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::INTEGER AS search_count_7d,
         MAX(created_at)::TEXT AS search_last_seen_at
       FROM contest_resource_search_events
       WHERE user_id IS NOT NULL
         AND user_id <> ''
       GROUP BY user_id
     )
     SELECT
       u.id AS user_id,
       u.username,
       u.is_platform_admin,
       u.is_disabled,
       u.created_at::TEXT AS created_at,
       role_agg.platform_roles,
       COALESCE(workspace_agg.workspace_count, 0) AS workspace_count,
       COALESCE(workspace_agg.team_workspace_count, 0) AS team_workspace_count,
       COALESCE(project_agg.project_count, 0) AS project_count,
       COALESCE(project_agg.completed_project_count, 0) AS completed_project_count,
       COALESCE(project_agg.in_progress_project_count, 0) AS in_progress_project_count,
       COALESCE(project_agg.draft_project_count, 0) AS draft_project_count,
       COALESCE(session_agg.active_session_count, 0) AS active_session_count,
       session_agg.session_last_created_at,
       COALESCE(ai_session_agg.ai_session_count_30d, 0) AS ai_session_count_30d,
       COALESCE(ai_session_agg.ai_session_count_7d, 0) AS ai_session_count_7d,
       ai_session_agg.ai_last_seen_at,
       COALESCE(ai_message_agg.ai_message_count_30d, 0) AS ai_message_count_30d,
       ai_message_agg.ai_message_last_seen_at,
       COALESCE(search_agg.search_count_30d, 0) AS search_count_30d,
       COALESCE(search_agg.search_count_7d, 0) AS search_count_7d,
       search_agg.search_last_seen_at
     FROM users u
     LEFT JOIN role_agg ON role_agg.user_id = u.id
     LEFT JOIN workspace_agg ON workspace_agg.user_id = u.id
     LEFT JOIN project_agg ON project_agg.user_id = u.id
     LEFT JOIN session_agg ON session_agg.user_id = u.id
     LEFT JOIN ai_session_agg ON ai_session_agg.user_id = u.id
     LEFT JOIN ai_message_agg ON ai_message_agg.user_id = u.id
     LEFT JOIN search_agg ON search_agg.user_id = u.id
     ORDER BY u.created_at DESC`,
  )

  return result.rows.map((row) => {
    const platformRoles = normalizeStringArray(row.platform_roles)
    const lastSeenAt = maxDateText(
      row.session_last_created_at,
      row.ai_last_seen_at,
      row.ai_message_last_seen_at,
      row.search_last_seen_at,
    )
    return {
      userId: row.user_id,
      username: normalizeString(row.username),
      accountStatus: toBoolean(row.is_disabled) ? 'disabled' : 'active',
      isPlatformAdmin: toBoolean(row.is_platform_admin),
      platformRoles,
      primaryRole: classifyPrimaryRole(toBoolean(row.is_platform_admin), platformRoles),
      workspaceCount: toNumber(row.workspace_count),
      teamWorkspaceCount: toNumber(row.team_workspace_count),
      projectCount: toNumber(row.project_count),
      completedProjectCount: toNumber(row.completed_project_count),
      activeSessionCount: toNumber(row.active_session_count),
      aiSessionCount30d: toNumber(row.ai_session_count_30d),
      aiMessageCount30d: toNumber(row.ai_message_count_30d),
      resourceSearchCount30d: toNumber(row.search_count_30d),
      workspaceParticipationBand: classifyWorkspaceParticipation(toNumber(row.workspace_count)),
      projectMaturityBand: classifyProjectMaturity(
        toNumber(row.project_count),
        toNumber(row.in_progress_project_count),
        toNumber(row.completed_project_count),
      ),
      aiUsageBand: classifyAiUsage(
        toNumber(row.ai_session_count_30d),
        toNumber(row.ai_message_count_30d),
      ),
      searchActivityBand: classifySearchActivity(toNumber(row.search_count_30d)),
      lastSeenAt,
      createdAt: row.created_at,
      detailPath: '/admin/users',
      aiSessionCount7d: toNumber(row.ai_session_count_7d),
      searchCount7d: toNumber(row.search_count_7d),
    }
  })
}

async function loadContentResources(db: Queryable): Promise<AdminContentResourceRow[]> {
  const result = await db.query<ContentResourceQueryRow>(
    `WITH search_metrics AS (
       SELECT
         resource_id,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::INTEGER AS search_count_30d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND clicked = TRUE)::INTEGER AS click_count_30d
       FROM contest_resource_search_events
       WHERE resource_id IS NOT NULL
       GROUP BY resource_id
     )
     SELECT
       r.id AS resource_id,
       r.contest_id,
       c.name AS contest_name,
       r.title,
       r.category,
       r.status,
       p.governance_status,
       p.quality_score,
       p.value_score,
       p.hot_score,
       sm.search_count_30d,
       sm.click_count_30d,
       r.updated_at::TEXT AS updated_at
     FROM contest_resources r
     JOIN contests c ON c.id = r.contest_id
     LEFT JOIN contest_resource_profiles p ON p.resource_id = r.id
     LEFT JOIN search_metrics sm ON sm.resource_id = r.id
     ORDER BY
       COALESCE(sm.click_count_30d, 0) DESC,
       COALESCE(sm.search_count_30d, 0) DESC,
       COALESCE(p.hot_score, 0) DESC,
       r.updated_at DESC`,
  )

  return result.rows.map(row => ({
    resourceId: row.resource_id,
    contestId: row.contest_id,
    contestName: normalizeString(row.contest_name),
    title: normalizeString(row.title),
    category: normalizeString(row.category),
    status: normalizeString(row.status) || 'active',
    governanceStatus: normalizeString(row.governance_status) || 'pending',
    qualityScore: toNumber(row.quality_score),
    valueScore: toNumber(row.value_score),
    hotScore: toNumber(row.hot_score),
    searchCount30d: toNumber(row.search_count_30d),
    clickCount30d: toNumber(row.click_count_30d),
    updatedAt: row.updated_at,
    detailPath: '/admin/resources',
  }))
}

async function loadContentSummary(db: Queryable): Promise<ContentSummaryRow> {
  const result = await db.query<ContentSummaryRow>(
    `SELECT
      (SELECT COUNT(*)::INTEGER FROM contests) AS contest_count,
      (SELECT COUNT(*)::INTEGER FROM contest_resources) AS resource_count,
      (SELECT COUNT(*)::INTEGER FROM contest_resource_profiles) AS analyzed_resource_count,
      (
        SELECT COUNT(*)::INTEGER
        FROM contest_resource_profiles
        WHERE governance_status = 'review'
      ) AS review_resource_count,
      (
        SELECT COUNT(*)::INTEGER
        FROM contest_resource_governance_tasks
        WHERE status IN ('queued', 'processing', 'failed', 'dead_letter')
      ) AS governance_pending_count,
      (
        SELECT COUNT(*)::INTEGER
        FROM contest_resource_search_events
        WHERE created_at >= NOW() - INTERVAL '30 days'
      ) AS search_count_30d,
      (
        SELECT COUNT(*)::INTEGER
        FROM contest_resource_search_events
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND clicked = TRUE
      ) AS click_count_30d,
      (
        SELECT COUNT(*)::INTEGER
        FROM contest_audit_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
      ) AS audit_count_30d,
      (
        SELECT COUNT(*)::INTEGER
        FROM project_resource_documents
        WHERE preview_status IN ('queued', 'converting', 'finalizing')
      ) AS document_pending_count,
      (
        SELECT COUNT(*)::INTEGER
        FROM project_resource_documents
        WHERE preview_status = 'failed'
      ) AS document_failed_count`,
  )

  return result.rows[0] || {
    contest_count: 0,
    resource_count: 0,
    analyzed_resource_count: 0,
    review_resource_count: 0,
    governance_pending_count: 0,
    search_count_30d: 0,
    click_count_30d: 0,
    audit_count_30d: 0,
    document_pending_count: 0,
    document_failed_count: 0,
  }
}

async function loadContentDistribution(db: Queryable, field: 'category' | 'governance_status'): Promise<AdminOperationsBucket[]> {
  const result = await db.query<ContentDistributionRow>(
    field === 'category'
      ? `SELECT category AS key, COUNT(*)::INTEGER AS count
         FROM contest_resources
         GROUP BY category
         ORDER BY count DESC, category ASC`
      : `SELECT COALESCE(governance_status, 'pending') AS key, COUNT(*)::INTEGER AS count
         FROM contest_resource_profiles
         GROUP BY COALESCE(governance_status, 'pending')
         ORDER BY count DESC, key ASC`,
  )

  return result.rows.map(row => ({
    key: normalizeString(row.key),
    label: normalizeString(row.key),
    count: toNumber(row.count),
  }))
}

async function loadContentSearchInsights(db: Queryable): Promise<AdminContentSearchInsight[]> {
  const result = await db.query<ContentSearchInsightRow>(
    `SELECT
      query,
      COUNT(*)::INTEGER AS search_count,
      COUNT(*) FILTER (WHERE clicked = TRUE)::INTEGER AS click_count,
      COUNT(*) FILTER (WHERE result_count = 0)::INTEGER AS zero_result_count
     FROM contest_resource_search_events
     WHERE created_at >= NOW() - INTERVAL '30 days'
     GROUP BY query
     HAVING TRIM(query) <> ''
     ORDER BY search_count DESC, click_count DESC
     LIMIT 12`,
  )

  return result.rows.map(row => ({
    query: normalizeString(row.query),
    searchCount: toNumber(row.search_count),
    clickCount: toNumber(row.click_count),
    zeroResultCount: toNumber(row.zero_result_count),
    ctr: row.search_count > 0 ? round((toNumber(row.click_count) / toNumber(row.search_count)) * 100, 2) : 0,
  }))
}

async function loadGovernanceBacklog(db: Queryable): Promise<AdminContentGovernanceBacklogItem[]> {
  const result = await db.query<GovernanceBacklogRow>(
    `SELECT
      task_type,
      status,
      COUNT(*)::INTEGER AS count
     FROM contest_resource_governance_tasks
     WHERE status IN ('queued', 'processing', 'failed', 'dead_letter')
     GROUP BY task_type, status
     ORDER BY count DESC, task_type ASC, status ASC`,
  )

  return result.rows.map(row => ({
    taskType: normalizeString(row.task_type),
    status: normalizeString(row.status),
    count: toNumber(row.count),
  }))
}

async function loadRecentAudits(db: Queryable): Promise<AdminContentAuditTrailItem[]> {
  const result = await db.query<AuditTrailRow>(
    `SELECT
      l.id,
      l.contest_id,
      c.name AS contest_name,
      l.resource_id,
      r.title AS resource_title,
      u.username AS actor_username,
      l.action,
      l.created_at::TEXT AS created_at
     FROM contest_audit_logs l
     LEFT JOIN contests c ON c.id = l.contest_id
     LEFT JOIN contest_resources r ON r.id = l.resource_id
     LEFT JOIN users u ON u.id = l.actor_user_id
     ORDER BY l.created_at DESC
     LIMIT 12`,
  )

  return result.rows.map(row => ({
    id: row.id,
    contestId: row.contest_id,
    contestName: normalizeString(row.contest_name) || '-',
    resourceId: row.resource_id,
    resourceTitle: normalizeString(row.resource_title) || '-',
    actorUsername: normalizeString(row.actor_username) || '-',
    action: normalizeString(row.action),
    createdAt: row.created_at,
    detailPath: row.contest_id ? `/admin/contests/${row.contest_id}/audit` : '/admin/resources',
  }))
}

async function loadRevenueWorkspaceRows(db: Queryable): Promise<AdminRevenueWorkspaceRow[]> {
  const result = await db.query<RevenueWorkspaceQueryRow>(
    `WITH member_counts AS (
       SELECT workspace_id, COUNT(DISTINCT user_id)::INTEGER AS member_count
       FROM workspace_members
       WHERE COALESCE(is_enabled, TRUE) = TRUE
       GROUP BY workspace_id
     ),
     project_counts AS (
       SELECT workspace_id, COUNT(*)::INTEGER AS project_count
       FROM projects
       GROUP BY workspace_id
     ),
     project_seat AS (
       SELECT
         workspace_id,
         COALESCE(SUM(seat_used), 0)::INTEGER AS project_seat_used_total,
         COALESCE(SUM(seat_limit), 0)::INTEGER AS project_seat_limit_total
       FROM project_seat_quotas
       GROUP BY workspace_id
     )
     SELECT
       w.id AS workspace_id,
       w.name AS workspace_name,
       w.type AS workspace_type,
       owner.username AS owner_username,
       COALESCE(member_counts.member_count, 0) AS member_count,
       COALESCE(project_counts.project_count, 0) AS project_count,
       COALESCE(tq.seat_used, wb.snapshot_seat_used, 0)::INTEGER AS seat_used,
       COALESCE(tq.seat_limit, wb.snapshot_seat_limit, 0)::INTEGER AS seat_limit,
       COALESCE(project_seat.project_seat_used_total, 0) AS project_seat_used_total,
       COALESCE(project_seat.project_seat_limit_total, 0) AS project_seat_limit_total,
       COALESCE(wb.extra_project_slots, 0)::INTEGER AS extra_project_slots,
       wb.plan_id,
       bp.code AS plan_code,
       bp.name AS plan_name,
       wb.billing_cycle,
       COALESCE(wb.estimated_amount_cents, 0)::INTEGER AS estimated_amount_cents,
       wb.updated_at::TEXT AS billing_updated_at
     FROM workspaces w
     JOIN users owner ON owner.id = w.owner_user_id
     LEFT JOIN member_counts ON member_counts.workspace_id = w.id
     LEFT JOIN project_counts ON project_counts.workspace_id = w.id
     LEFT JOIN project_seat ON project_seat.workspace_id = w.id
     LEFT JOIN team_quotas tq ON tq.workspace_id = w.id
     LEFT JOIN workspace_billing wb ON wb.workspace_id = w.id
     LEFT JOIN billing_plans bp ON bp.id = wb.plan_id
     WHERE w.type = 'team'
     ORDER BY w.updated_at DESC`,
  )

  return result.rows.map((row) => {
    const seatUsed = toNumber(row.seat_used)
    const seatLimit = toNumber(row.seat_limit)
    const projectSeatUsedTotal = toNumber(row.project_seat_used_total)
    const projectSeatLimitTotal = toNumber(row.project_seat_limit_total)
    const estimatedAmountCents = toNumber(row.estimated_amount_cents)
    const hasPlan = Boolean(normalizeString(row.plan_id))
    const isSeatOverLimit = seatLimit > 0 && seatUsed > seatLimit
    const isProjectSeatOverLimit = projectSeatLimitTotal > 0 && projectSeatUsedTotal > projectSeatLimitTotal

    return {
      workspaceId: row.workspace_id,
      workspaceName: normalizeString(row.workspace_name),
      workspaceType: normalizeString(row.workspace_type),
      ownerUsername: normalizeString(row.owner_username),
      memberCount: toNumber(row.member_count),
      projectCount: toNumber(row.project_count),
      seatUsed,
      seatLimit,
      projectSeatUsedTotal,
      projectSeatLimitTotal,
      extraProjectSlots: toNumber(row.extra_project_slots),
      planId: normalizeString(row.plan_id) || null,
      planCode: normalizeString(row.plan_code) || 'unassigned',
      planName: normalizeString(row.plan_name) || '未配置套餐',
      billingCycle: normalizeString(row.billing_cycle) || 'monthly',
      estimatedAmountCents,
      estimatedAmountYuan: toYuan(estimatedAmountCents),
      billingUpdatedAt: normalizeString(row.billing_updated_at) || null,
      hasPlan,
      isSeatOverLimit,
      isProjectSeatOverLimit,
      detailPath: '/admin/organizations',
    }
  })
}

async function loadPreviewMetrics(db: Queryable): Promise<PreviewMetricsRow> {
  const result = await db.query<PreviewMetricsRow>(
    `WITH task_window AS (
       SELECT status
       FROM project_resource_document_tasks
       WHERE created_at >= NOW() - INTERVAL '24 hours'
     ),
     queue AS (
       SELECT
         COUNT(*) FILTER (WHERE preview_status = 'queued')::INTEGER AS queued_count,
         COUNT(*) FILTER (WHERE preview_status IN ('converting', 'finalizing'))::INTEGER AS processing_count,
         COALESCE(
           EXTRACT(EPOCH FROM NOW() - MIN(COALESCE(queued_at, created_at))) / 60,
           0
         )::DOUBLE PRECISION AS oldest_queued_minutes
       FROM project_resource_documents
       WHERE preview_status = 'queued'
     )
     SELECT
       COUNT(*)::INTEGER AS total_calls_24h,
       COUNT(*) FILTER (WHERE status = 'succeeded')::INTEGER AS succeeded_calls_24h,
       COUNT(*) FILTER (WHERE status = 'failed')::INTEGER AS failed_calls_24h,
       COALESCE(MAX(queue.queued_count), 0)::INTEGER AS queued_count,
       COALESCE(MAX(queue.processing_count), 0)::INTEGER AS processing_count,
       COALESCE(MAX(queue.oldest_queued_minutes), 0)::DOUBLE PRECISION AS oldest_queued_minutes
     FROM task_window, queue`,
  )

  return result.rows[0] || {
    total_calls_24h: 0,
    succeeded_calls_24h: 0,
    failed_calls_24h: 0,
    queued_count: 0,
    processing_count: 0,
    oldest_queued_minutes: 0,
  }
}

async function loadPreviewFailures(db: Queryable): Promise<PreviewFailureRow[]> {
  const result = await db.query<PreviewFailureRow>(
    `SELECT
      id AS task_id,
      created_at::TEXT AS created_at,
      error_message
     FROM project_resource_document_tasks
     WHERE status = 'failed'
     ORDER BY created_at DESC
     LIMIT 6`,
  )
  return result.rows
}

async function loadProjectKnowledgeMetrics(db: Queryable): Promise<ProjectKnowledgeMetricsRow> {
  const result = await db.query<ProjectKnowledgeMetricsRow>(
    `WITH task_window AS (
       SELECT status
       FROM project_knowledge_index_tasks
       WHERE created_at >= NOW() - INTERVAL '24 hours'
     ),
     queue AS (
       SELECT
         COUNT(*) FILTER (WHERE status = 'queued')::INTEGER AS queued_count,
         COUNT(*) FILTER (WHERE status IN ('extracting', 'chunking', 'embedding'))::INTEGER AS processing_count,
         COUNT(*) FILTER (WHERE status = 'stale')::INTEGER AS stale_count,
         MAX(updated_at)::TEXT AS latest_activity_at
       FROM project_knowledge_sources
     )
     SELECT
       COUNT(*) FILTER (WHERE status = 'succeeded')::INTEGER AS succeeded_24h,
       COUNT(*) FILTER (WHERE status IN ('failed', 'dead_letter'))::INTEGER AS failed_24h,
       COALESCE(MAX(queue.queued_count), 0)::INTEGER AS queued_count,
       COALESCE(MAX(queue.processing_count), 0)::INTEGER AS processing_count,
       COALESCE(MAX(queue.stale_count), 0)::INTEGER AS stale_count,
       MAX(queue.latest_activity_at) AS latest_activity_at
     FROM task_window, queue`,
  )

  return result.rows[0] || {
    succeeded_24h: 0,
    failed_24h: 0,
    queued_count: 0,
    processing_count: 0,
    stale_count: 0,
    latest_activity_at: null,
  }
}

async function loadProjectKnowledgeFailures(db: Queryable): Promise<ProjectKnowledgeFailureRow[]> {
  const result = await db.query<ProjectKnowledgeFailureRow>(
    `SELECT
      id AS task_id,
      updated_at::TEXT AS updated_at,
      error_message
     FROM project_knowledge_index_tasks
     WHERE status IN ('failed', 'dead_letter')
     ORDER BY updated_at DESC
     LIMIT 6`,
  )
  return result.rows
}

async function loadArchivedResourceCount(db: Queryable): Promise<number> {
  const result = await db.query<CountRow>(
    `SELECT COUNT(*)::INTEGER AS count
     FROM project_resources
     WHERE status = 'archived'`,
  )
  return toNumber(result.rows[0]?.count)
}

async function loadFeishuMetrics(db: Queryable): Promise<FeishuMetricsRow> {
  const result = await db.query<FeishuMetricsRow>(
    `SELECT
      (
        SELECT COUNT(*)::INTEGER
        FROM feishu_bitable_sync_item_runs
        WHERE started_at >= NOW() - INTERVAL '7 days'
      ) AS run_count_7d,
      (
        SELECT COUNT(*)::INTEGER
        FROM feishu_bitable_sync_item_runs
        WHERE started_at >= NOW() - INTERVAL '7 days'
          AND status IN ('success', 'partial_success')
      ) AS success_count_7d,
      (
        SELECT COUNT(*)::INTEGER
        FROM feishu_bitable_sync_item_runs
        WHERE started_at >= NOW() - INTERVAL '7 days'
          AND status = 'failed'
      ) AS failed_count_7d,
      (
        SELECT MAX(started_at)::TEXT
        FROM feishu_bitable_sync_item_runs
      ) AS latest_run_at,
      (
        SELECT COUNT(*)::INTEGER
        FROM feishu_sync_issues
        WHERE status = 'open'
      ) AS open_issue_count,
      (
        SELECT COUNT(*)::INTEGER
        FROM feishu_post_sync_tasks
        WHERE status IN ('queued', 'processing', 'failed', 'dead_letter')
      ) AS pending_task_count`,
  )

  return result.rows[0] || {
    run_count_7d: 0,
    success_count_7d: 0,
    failed_count_7d: 0,
    latest_run_at: null,
    open_issue_count: 0,
    pending_task_count: 0,
  }
}

async function loadFeishuFailures(db: Queryable): Promise<FeishuFailureRow[]> {
  const result = await db.query<FeishuFailureRow>(
    `SELECT
      r.id AS run_id,
      i.name AS task_name,
      r.started_at::TEXT AS started_at,
      r.error_message
     FROM feishu_bitable_sync_item_runs r
     JOIN feishu_bitable_sync_items i ON i.id = r.sync_item_id
     WHERE r.status = 'failed'
     ORDER BY r.started_at DESC
     LIMIT 6`,
  )
  return result.rows
}

async function loadGovernanceMetrics(db: Queryable): Promise<GovernanceMetricsRow> {
  const result = await db.query<GovernanceMetricsRow>(
    `SELECT
      COUNT(*) FILTER (
        WHERE status = 'succeeded'
          AND COALESCE(finished_at, updated_at, created_at) >= NOW() - INTERVAL '24 hours'
      )::INTEGER AS succeeded_24h,
      COUNT(*) FILTER (
        WHERE status = 'failed'
          AND COALESCE(finished_at, updated_at, created_at) >= NOW() - INTERVAL '24 hours'
      )::INTEGER AS failed_24h,
      COUNT(*) FILTER (WHERE status IN ('queued', 'processing', 'failed', 'dead_letter'))::INTEGER AS pending_count,
      MAX(COALESCE(finished_at, started_at, updated_at, created_at))::TEXT AS latest_activity_at
     FROM contest_resource_governance_tasks`,
  )

  return result.rows[0] || {
    succeeded_24h: 0,
    failed_24h: 0,
    pending_count: 0,
    latest_activity_at: null,
  }
}

async function loadGovernanceFailures(db: Queryable): Promise<GovernanceFailureRow[]> {
  const result = await db.query<GovernanceFailureRow>(
    `SELECT
      id AS task_id,
      updated_at::TEXT AS updated_at,
      task_type,
      error_message
     FROM contest_resource_governance_tasks
     WHERE status = 'failed'
     ORDER BY updated_at DESC
     LIMIT 6`,
  )
  return result.rows
}

async function loadAiMetrics(db: Queryable): Promise<AiMetricsRow> {
  const result = await db.query<AiMetricsRow>(
    `SELECT
      COUNT(DISTINCT s.id) FILTER (WHERE s.updated_at >= NOW() - INTERVAL '7 days')::INTEGER AS active_sessions_7d,
      COUNT(DISTINCT s.created_by_user_id) FILTER (WHERE s.updated_at >= NOW() - INTERVAL '7 days')::INTEGER AS active_users_7d,
      COUNT(m.id) FILTER (WHERE m.created_at >= NOW() - INTERVAL '7 days')::INTEGER AS message_count_7d,
      GREATEST(
        COALESCE(MAX(s.updated_at), TO_TIMESTAMP(0)),
        COALESCE(MAX(m.created_at), TO_TIMESTAMP(0))
      )::TEXT AS latest_activity_at
     FROM ai_chat_sessions s
     LEFT JOIN ai_chat_messages m ON m.session_id = s.id`,
  )

  return result.rows[0] || {
    active_sessions_7d: 0,
    active_users_7d: 0,
    message_count_7d: 0,
    latest_activity_at: null,
  }
}

function toFailureItemList(items: AdminEfficiencyFailureItem[]): AdminEfficiencyFailureItem[] {
  return sortByDateDesc(items, item => item.occurredAt).slice(0, 12)
}

async function buildRiskSnapshot(db: Queryable, event?: H3Event): Promise<AdminRiskSnapshot> {
  const now = toIsoNow()
  const [
    previewMetrics,
    revenueWorkspaces,
    feishuMetrics,
    governanceMetrics,
  ] = await Promise.all([
    loadPreviewMetrics(db),
    loadRevenueWorkspaceRows(db),
    loadFeishuMetrics(db),
    loadGovernanceMetrics(db),
  ])

  const recycleWorker = getProjectResourceRecycleWorkerState()
  const { runtime } = await readEffectivePlatformRuntimeSettings(event)

  const alerts: AdminRiskAlert[] = []
  const previewSuccessRate = toPercent(previewMetrics.succeeded_calls_24h, previewMetrics.failed_calls_24h)
  const previewBacklogMinutes = round(toNumber(previewMetrics.oldest_queued_minutes), 2)
  const noPlanWorkspaces = revenueWorkspaces.filter(item => !item.hasPlan)
  const overSeatWorkspaces = revenueWorkspaces.filter(item => item.isSeatOverLimit || item.isProjectSeatOverLimit)

  if (previewMetrics.total_calls_24h > 0 && previewSuccessRate < PREVIEW_SUCCESS_RATE_RISK_THRESHOLD) {
    alerts.push({
      id: 'preview-success-rate',
      key: 'preview_success_rate_low',
      severity: 'critical',
      source: 'document_preview',
      title: '文档预览 24h 成功率低于阈值',
      description: `近 24 小时文档预览成功率为 ${previewSuccessRate}% ，低于 ${PREVIEW_SUCCESS_RATE_RISK_THRESHOLD}% 阈值。`,
      currentValue: previewSuccessRate,
      threshold: PREVIEW_SUCCESS_RATE_RISK_THRESHOLD,
      detectedAt: now,
      detailPath: '/admin/resource-preview-worker',
    })
  }

  if (previewBacklogMinutes > PREVIEW_QUEUE_MINUTES_RISK_THRESHOLD) {
    alerts.push({
      id: 'preview-queue-timeout',
      key: 'preview_queue_timeout',
      severity: 'high',
      source: 'document_preview',
      title: '文档预览排队时间超过阈值',
      description: `当前最老排队任务等待 ${previewBacklogMinutes} 分钟，已超过 ${PREVIEW_QUEUE_MINUTES_RISK_THRESHOLD} 分钟阈值。`,
      currentValue: previewBacklogMinutes,
      threshold: PREVIEW_QUEUE_MINUTES_RISK_THRESHOLD,
      detectedAt: now,
      detailPath: '/admin/resource-preview-worker',
    })
  }

  const recycleLatestRun = recycleWorker.recentRuns[0]
  if ((recycleLatestRun && !recycleLatestRun.success) || (!recycleLatestRun && normalizeString(recycleWorker.lastError))) {
    alerts.push({
      id: 'recycle-worker-error',
      key: 'recycle_worker_failed',
      severity: 'high',
      source: 'resource_recycle',
      title: '资源回收 Worker 最近一次运行失败',
      description: normalizeString(recycleLatestRun?.errorMessage || recycleWorker.lastError) || '最近一次回收任务执行失败。',
      currentValue: 1,
      threshold: 0,
      detectedAt: normalizeString(recycleLatestRun?.finishedAt || recycleWorker.lastFinishedAt) || now,
      detailPath: '/admin/resource-recycle-worker',
    })
  }

  if (feishuMetrics.failed_count_7d > 0 || feishuMetrics.open_issue_count > 0) {
    alerts.push({
      id: 'feishu-sync-risk',
      key: 'feishu_sync_failed_or_open_issue',
      severity: feishuMetrics.open_issue_count > 0 ? 'high' : 'medium',
      source: 'feishu_sync',
      title: '飞书同步存在失败运行或开放 issue',
      description: `近 7 天失败运行 ${feishuMetrics.failed_count_7d} 次，当前开放 issue ${feishuMetrics.open_issue_count} 条。`,
      currentValue: feishuMetrics.failed_count_7d + feishuMetrics.open_issue_count,
      threshold: 0,
      detectedAt: normalizeString(feishuMetrics.latest_run_at) || now,
      detailPath: '/admin/integrations/feishu',
    })
  }

  if (governanceMetrics.pending_count > GOVERNANCE_BACKLOG_RISK_THRESHOLD) {
    alerts.push({
      id: 'governance-backlog',
      key: 'governance_backlog_high',
      severity: 'medium',
      source: 'resource_governance',
      title: '资源治理待处理任务积压',
      description: `当前待处理治理任务 ${governanceMetrics.pending_count} 条，已超过 ${GOVERNANCE_BACKLOG_RISK_THRESHOLD} 条阈值。`,
      currentValue: governanceMetrics.pending_count,
      threshold: GOVERNANCE_BACKLOG_RISK_THRESHOLD,
      detectedAt: normalizeString(governanceMetrics.latest_activity_at) || now,
      detailPath: '/admin/resources',
    })
  }

  if (noPlanWorkspaces.length > 0) {
    alerts.push({
      id: 'workspace-no-plan',
      key: 'workspace_missing_plan',
      severity: 'high',
      source: 'workspace_billing',
      title: '存在未绑定套餐的工作区',
      description: `当前共有 ${noPlanWorkspaces.length} 个团队工作区未绑定套餐。`,
      currentValue: noPlanWorkspaces.length,
      threshold: 0,
      detectedAt: now,
      detailPath: '/admin/organizations',
    })
  }

  if (overSeatWorkspaces.length > 0) {
    alerts.push({
      id: 'workspace-over-seat',
      key: 'workspace_seat_over_limit',
      severity: 'high',
      source: 'workspace_billing',
      title: '存在席位或项目配额超限的工作区',
      description: `当前共有 ${overSeatWorkspaces.length} 个团队工作区出现团队席位或项目席位超限。`,
      currentValue: overSeatWorkspaces.length,
      threshold: 0,
      detectedAt: now,
      detailPath: '/admin/organizations',
    })
  }

  const configIssues: string[] = []
  if (!normalizeString(runtime.pg.url))
    configIssues.push('PostgreSQL 未配置')
  if (!normalizeString(runtime.redis.url))
    configIssues.push('Redis 未配置')
  if (!normalizeString(runtime.onlyOffice.endpoint))
    configIssues.push('OnlyOffice endpoint 未配置')
  if (runtime.feishuScheduler.enabled && runtime.feishuScheduler.lockTtlMs < runtime.feishuScheduler.intervalMs) {
    configIssues.push('飞书调度锁 TTL 小于轮询间隔')
  }

  if (configIssues.length > 0) {
    alerts.push({
      id: 'runtime-config-risk',
      key: 'runtime_config_abnormal',
      severity: 'medium',
      source: 'runtime_health',
      title: '健康检查或运行配置存在异常',
      description: configIssues.join('；'),
      currentValue: configIssues.length,
      threshold: 0,
      detectedAt: now,
      detailPath: '/admin/runtime-settings',
    })
  }

  const sortedAlerts = sortAlerts(alerts)
  return {
    generatedAt: now,
    summary: {
      total: sortedAlerts.length,
      critical: sortedAlerts.filter(item => item.severity === 'critical').length,
      high: sortedAlerts.filter(item => item.severity === 'high').length,
      medium: sortedAlerts.filter(item => item.severity === 'medium').length,
      low: sortedAlerts.filter(item => item.severity === 'low').length,
    },
    alerts: sortedAlerts,
  }
}

function buildOverviewTodos(payload: {
  riskCount: number
  governancePendingCount: number
  noPlanWorkspaceCount: number
  overSeatWorkspaceCount: number
  syncIssueCount: number
  previewQueuedCount: number
}): AdminOperationsTodoItem[] {
  return [
    {
      key: 'risk-alerts',
      label: '未闭环风险',
      count: payload.riskCount,
      tone: payload.riskCount > 0 ? 'danger' : 'success',
      description: '查看风险监控页并回跳到对应管理页面处理。',
      detailPath: '/admin/operations?tab=risks',
    },
    {
      key: 'governance-backlog',
      label: '待处理治理任务',
      count: payload.governancePendingCount,
      tone: payload.governancePendingCount > 0 ? 'warning' : 'success',
      description: '资源治理任务积压可直接回到资料治理页深查。',
      detailPath: '/admin/resources',
    },
    {
      key: 'workspace-plan-gap',
      label: '无套餐工作区',
      count: payload.noPlanWorkspaceCount,
      tone: payload.noPlanWorkspaceCount > 0 ? 'warning' : 'success',
      description: '经营对账视图会列出所有未配置套餐的团队工作区。',
      detailPath: '/admin/organizations',
    },
    {
      key: 'workspace-over-seat',
      label: '超限工作区',
      count: payload.overSeatWorkspaceCount,
      tone: payload.overSeatWorkspaceCount > 0 ? 'warning' : 'success',
      description: '席位或项目配额超限时需要回到组织和计费页处理。',
      detailPath: '/admin/organizations',
    },
    {
      key: 'sync-issues',
      label: '同步异常',
      count: payload.syncIssueCount,
      tone: payload.syncIssueCount > 0 ? 'warning' : 'success',
      description: '飞书同步运行失败或开放 issue 需要尽快闭环。',
      detailPath: '/admin/integrations/feishu',
    },
    {
      key: 'preview-queue',
      label: '预览排队任务',
      count: payload.previewQueuedCount,
      tone: payload.previewQueuedCount > 0 ? 'info' : 'success',
      description: '文档预览排队过长时需要检查 Worker 和 OnlyOffice。',
      detailPath: '/admin/resource-preview-worker',
    },
  ]
}

export async function getAdminOperationsOverview(db: Queryable, event?: H3Event): Promise<AdminOperationsOverview> {
  const [overviewMetrics, trend, users, risks, revenueRows, previewMetrics] = await Promise.all([
    loadOverviewMetrics(db),
    loadOverviewTrend(db),
    loadUserRows(db),
    buildRiskSnapshot(db, event),
    loadRevenueWorkspaceRows(db),
    loadPreviewMetrics(db),
  ])

  const activeUsers7d = users.filter(isUserActive7d).length
  const disabledUsers = users.filter(item => item.accountStatus === 'disabled').length
  const noPlanWorkspaceCount = revenueRows.filter(item => !item.hasPlan).length
  const overSeatWorkspaceCount = revenueRows.filter(item => item.isSeatOverLimit || item.isProjectSeatOverLimit).length

  return {
    generatedAt: toIsoNow(),
    cards: [
      { key: 'total-users', label: '用户总量', value: overviewMetrics.total_users, tone: 'neutral', detailPath: '/admin/users' },
      { key: 'active-users', label: '活跃用户(7天)', value: activeUsers7d, tone: 'info', detailPath: '/admin/operations?tab=users' },
      { key: 'team-workspaces', label: '团队工作区数', value: overviewMetrics.team_workspace_count, tone: 'neutral', detailPath: '/admin/organizations' },
      { key: 'project-count', label: '项目数', value: overviewMetrics.project_count, tone: 'neutral' },
      { key: 'contest-count', label: '竞赛数', value: overviewMetrics.contest_count, tone: 'neutral', detailPath: '/admin/contests' },
      { key: 'resource-count', label: '资源数', value: overviewMetrics.resource_count, tone: 'neutral', detailPath: '/admin/resources' },
      { key: 'estimated-revenue', label: '计费估算总额(元)', value: toYuan(overviewMetrics.estimated_amount_cents), tone: 'success', detailPath: '/admin/operations?tab=revenue' },
      { key: 'risk-count', label: '未闭环风险数', value: risks.summary.total, tone: risks.summary.total > 0 ? 'danger' : 'success', detailPath: '/admin/operations?tab=risks' },
      { key: 'sync-failures', label: '同步失败数(7天)', value: overviewMetrics.sync_failed_runs_7d, tone: overviewMetrics.sync_failed_runs_7d > 0 ? 'warning' : 'success', detailPath: '/admin/integrations/feishu' },
      { key: 'governance-pending', label: '待处理治理任务', value: overviewMetrics.governance_pending_count, tone: overviewMetrics.governance_pending_count > 0 ? 'warning' : 'success', detailPath: '/admin/resources' },
      { key: 'disabled-users', label: '停用账号数', value: disabledUsers, tone: disabledUsers > 0 ? 'warning' : 'success', detailPath: '/admin/users' },
      { key: 'open-sync-issues', label: '开放同步 Issue', value: overviewMetrics.open_sync_issues, tone: overviewMetrics.open_sync_issues > 0 ? 'warning' : 'success', detailPath: '/admin/integrations/feishu' },
    ],
    trend,
    todos: buildOverviewTodos({
      riskCount: risks.summary.total,
      governancePendingCount: overviewMetrics.governance_pending_count,
      noPlanWorkspaceCount,
      overSeatWorkspaceCount,
      syncIssueCount: overviewMetrics.open_sync_issues + overviewMetrics.sync_failed_runs_7d,
      previewQueuedCount: previewMetrics.queued_count,
    }),
  }
}

export async function getAdminOperationsUsers(db: Queryable): Promise<AdminUserSegmentSnapshot> {
  const rows = await loadUserRows(db)
  const sortedRows = sortByDateDesc(rows, item => item.lastSeenAt || item.createdAt)

  return {
    generatedAt: toIsoNow(),
    summary: {
      totalUsers: rows.length,
      activeUsers7d: rows.filter(isUserActive7d).length,
      disabledUsers: rows.filter(item => item.accountStatus === 'disabled').length,
      platformAdmins: rows.filter(item => item.isPlatformAdmin).length,
      newUsers30d: rows.filter(item => isWithinLastDays(item.createdAt, 30)).length,
    },
    dimensions: {
      accountStatus: buildBuckets([{ key: 'active', label: 'active' }, { key: 'disabled', label: 'disabled' }], rows.map(item => item.accountStatus)),
      platformRole: buildBuckets([
        { key: 'platform_super_admin', label: 'platform_super_admin' },
        { key: 'contest_admin', label: 'contest_admin' },
        { key: 'pricing_admin', label: 'pricing_admin' },
        { key: 'none', label: 'none' },
      ], rows.map(item => item.primaryRole)),
      workspaceParticipation: buildBuckets([
        { key: '未入组', label: '未入组' },
        { key: '单工作区', label: '单工作区' },
        { key: '2-3个工作区', label: '2-3个工作区' },
        { key: '4个以上工作区', label: '4个以上工作区' },
      ], rows.map(item => item.workspaceParticipationBand)),
      projectMaturity: buildBuckets([
        { key: '无项目', label: '无项目' },
        { key: '草稿中', label: '草稿中' },
        { key: '推进中', label: '推进中' },
        { key: '已完成', label: '已完成' },
      ], rows.map(item => item.projectMaturityBand)),
      aiUsage: buildBuckets([
        { key: '未使用', label: '未使用' },
        { key: '轻度', label: '轻度' },
        { key: '中度', label: '中度' },
        { key: '重度', label: '重度' },
      ], rows.map(item => item.aiUsageBand)),
      resourceSearchActivity: buildBuckets([
        { key: '未搜索', label: '未搜索' },
        { key: '低频', label: '低频' },
        { key: '中频', label: '中频' },
        { key: '高频', label: '高频' },
      ], rows.map(item => item.searchActivityBand)),
    },
    users: sortedRows.map(({ aiSessionCount7d: _ai, searchCount7d: _search, ...rest }) => rest),
  }
}

export async function getAdminOperationsContent(db: Queryable): Promise<AdminContentTraceSnapshot> {
  const [summary, categoryDistribution, governanceDistribution, resources, searchInsights, governanceBacklog, recentAudits] = await Promise.all([
    loadContentSummary(db),
    loadContentDistribution(db, 'category'),
    loadContentDistribution(db, 'governance_status'),
    loadContentResources(db),
    loadContentSearchInsights(db),
    loadGovernanceBacklog(db),
    loadRecentAudits(db),
  ])

  return {
    generatedAt: toIsoNow(),
    summary: {
      contestCount: summary.contest_count,
      resourceCount: summary.resource_count,
      analyzedResourceCount: summary.analyzed_resource_count,
      reviewResourceCount: summary.review_resource_count,
      governancePendingCount: summary.governance_pending_count,
      searchCount30d: summary.search_count_30d,
      clickCount30d: summary.click_count_30d,
      auditCount30d: summary.audit_count_30d,
      documentPendingCount: summary.document_pending_count,
      documentFailedCount: summary.document_failed_count,
    },
    categoryDistribution,
    governanceDistribution,
    resources: resources.slice(0, 50),
    searchInsights,
    governanceBacklog,
    recentAudits,
  }
}

export async function getAdminOperationsRevenue(db: Queryable): Promise<AdminRevenueSnapshot> {
  const workspaces = await loadRevenueWorkspaceRows(db)
  const planMap = new Map<string, AdminRevenuePlanDistribution>()
  let latestBillingUpdateAt: string | null = null

  for (const workspace of workspaces) {
    const key = workspace.planCode
    const current = planMap.get(key) || {
      planCode: workspace.planCode,
      planName: workspace.planName,
      workspaceCount: 0,
      estimatedAmountCents: 0,
      estimatedAmountYuan: 0,
    }
    current.workspaceCount += 1
    current.estimatedAmountCents += workspace.estimatedAmountCents
    current.estimatedAmountYuan = toYuan(current.estimatedAmountCents)
    planMap.set(key, current)
    latestBillingUpdateAt = maxDateText(latestBillingUpdateAt, workspace.billingUpdatedAt)
  }

  const estimatedAmountCents = workspaces.reduce((sum, item) => sum + item.estimatedAmountCents, 0)
  return {
    generatedAt: toIsoNow(),
    summary: {
      teamWorkspaceCount: workspaces.length,
      planBoundWorkspaceCount: workspaces.filter(item => item.hasPlan).length,
      noPlanWorkspaceCount: workspaces.filter(item => !item.hasPlan).length,
      overSeatWorkspaceCount: workspaces.filter(item => item.isSeatOverLimit || item.isProjectSeatOverLimit).length,
      estimatedAmountCents,
      estimatedAmountYuan: toYuan(estimatedAmountCents),
      totalSeatUsed: workspaces.reduce((sum, item) => sum + item.seatUsed, 0),
      totalSeatLimit: workspaces.reduce((sum, item) => sum + item.seatLimit, 0),
      totalProjectSeatUsed: workspaces.reduce((sum, item) => sum + item.projectSeatUsedTotal, 0),
      totalProjectSeatLimit: workspaces.reduce((sum, item) => sum + item.projectSeatLimitTotal, 0),
      latestBillingUpdateAt,
    },
    planDistribution: [...planMap.values()].sort((left, right) => right.workspaceCount - left.workspaceCount),
    workspaces,
  }
}

export async function getAdminOperationsEfficiency(db: Queryable): Promise<AdminEfficiencySnapshot> {
  const [
    previewMetrics,
    previewFailures,
    projectKnowledgeMetrics,
    projectKnowledgeFailures,
    archivedCount,
    feishuMetrics,
    feishuFailures,
    governanceMetrics,
    governanceFailures,
    aiMetrics,
  ] = await Promise.all([
    loadPreviewMetrics(db),
    loadPreviewFailures(db),
    loadProjectKnowledgeMetrics(db),
    loadProjectKnowledgeFailures(db),
    loadArchivedResourceCount(db),
    loadFeishuMetrics(db),
    loadFeishuFailures(db),
    loadGovernanceMetrics(db),
    loadGovernanceFailures(db),
    loadAiMetrics(db),
  ])

  const previewWorker = getProjectDocumentPreviewWorkerState()
  const knowledgeWorker = getProjectKnowledgeWorkerState()
  const recycleWorker = getProjectResourceRecycleWorkerState()
  const previewSuccessRate24h = toPercent(previewMetrics.succeeded_calls_24h, previewMetrics.failed_calls_24h)
  const previewBacklog = previewMetrics.queued_count + previewMetrics.processing_count
  const knowledgeSuccessRate24h = toPercent(projectKnowledgeMetrics.succeeded_24h, projectKnowledgeMetrics.failed_24h)
  const knowledgeBacklog = projectKnowledgeMetrics.queued_count + projectKnowledgeMetrics.processing_count + projectKnowledgeMetrics.stale_count
  const feishuSuccessRate7d = toPercent(feishuMetrics.success_count_7d, feishuMetrics.failed_count_7d)
  const governanceSuccessRate24h = toPercent(governanceMetrics.succeeded_24h, governanceMetrics.failed_24h)
  const recycleSuccessRate = recycleWorker.runCount > 0
    ? round((recycleWorker.successCount / recycleWorker.runCount) * 100, 2)
    : 0

  const systems: AdminEfficiencySystemSnapshot[] = [
    {
      key: 'preview-worker',
      label: '文档预览 Worker',
      health: previewSuccessRate24h < PREVIEW_SUCCESS_RATE_RISK_THRESHOLD || toNumber(previewMetrics.oldest_queued_minutes) > PREVIEW_QUEUE_MINUTES_RISK_THRESHOLD
        ? 'critical'
        : previewBacklog > 0 ? 'warning' : 'healthy',
      throughput: previewMetrics.total_calls_24h,
      throughputLabel: '24h 调用数',
      successRate: previewSuccessRate24h,
      backlog: previewBacklog,
      lastRunAt: normalizeString(previewWorker.lastFinishedAt || previewWorker.lastStartedAt) || null,
      lastResult: previewWorker.runCount > 0 ? `累计运行 ${previewWorker.runCount} 次` : '尚无运行记录',
      lastError: normalizeString(previewWorker.lastError),
      detailPath: '/admin/resource-preview-worker',
    },
    {
      key: 'knowledge-worker',
      label: '知识索引 Worker',
      health: projectKnowledgeMetrics.failed_24h > 0
        ? 'critical'
        : knowledgeBacklog > 0 ? 'warning' : knowledgeWorker.runCount > 0 ? 'healthy' : 'idle',
      throughput: projectKnowledgeMetrics.succeeded_24h + projectKnowledgeMetrics.failed_24h,
      throughputLabel: '24h 完成数',
      successRate: knowledgeSuccessRate24h,
      backlog: knowledgeBacklog,
      lastRunAt: normalizeString(knowledgeWorker.lastFinishedAt || knowledgeWorker.lastStartedAt || projectKnowledgeMetrics.latest_activity_at) || null,
      lastResult: knowledgeWorker.runCount > 0 ? `累计运行 ${knowledgeWorker.runCount} 次` : '尚无运行记录',
      lastError: normalizeString(knowledgeWorker.lastError),
      detailPath: '/admin/resource-knowledge-worker',
    },
    {
      key: 'resource-recycle-worker',
      label: '资源回收 Worker',
      health: recycleWorker.recentRuns[0] && !recycleWorker.recentRuns[0]?.success ? 'warning' : recycleWorker.runCount > 0 ? 'healthy' : 'idle',
      throughput: recycleWorker.totalPurgedCount,
      throughputLabel: '累计回收数',
      successRate: recycleSuccessRate,
      backlog: archivedCount,
      lastRunAt: normalizeString(recycleWorker.lastFinishedAt || recycleWorker.lastStartedAt) || null,
      lastResult: recycleWorker.runCount > 0 ? `累计运行 ${recycleWorker.runCount} 次` : '尚无运行记录',
      lastError: normalizeString(recycleWorker.lastError),
      detailPath: '/admin/resource-recycle-worker',
    },
    {
      key: 'feishu-sync',
      label: '飞书同步调度',
      health: feishuMetrics.failed_count_7d > 0 || feishuMetrics.open_issue_count > 0 ? 'warning' : feishuMetrics.run_count_7d > 0 ? 'healthy' : 'idle',
      throughput: feishuMetrics.run_count_7d,
      throughputLabel: '7天运行数',
      successRate: feishuSuccessRate7d,
      backlog: feishuMetrics.open_issue_count + feishuMetrics.pending_task_count,
      lastRunAt: normalizeString(feishuMetrics.latest_run_at) || null,
      lastResult: feishuMetrics.run_count_7d > 0 ? `7天失败 ${feishuMetrics.failed_count_7d} 次` : '近 7 天无运行',
      lastError: normalizeString(feishuFailures[0]?.error_message),
      detailPath: '/admin/integrations/feishu',
    },
    {
      key: 'resource-governance',
      label: '资源治理任务',
      health: governanceMetrics.pending_count > GOVERNANCE_BACKLOG_RISK_THRESHOLD ? 'warning' : governanceMetrics.pending_count > 0 ? 'warning' : 'healthy',
      throughput: governanceMetrics.succeeded_24h + governanceMetrics.failed_24h,
      throughputLabel: '24h 完成数',
      successRate: governanceSuccessRate24h,
      backlog: governanceMetrics.pending_count,
      lastRunAt: normalizeString(governanceMetrics.latest_activity_at) || null,
      lastResult: governanceMetrics.pending_count > 0 ? `待处理 ${governanceMetrics.pending_count} 条` : '当前无积压',
      lastError: normalizeString(governanceFailures[0]?.error_message),
      detailPath: '/admin/resources',
    },
    {
      key: 'ai-usage',
      label: 'AI 会话活跃度',
      health: aiMetrics.active_sessions_7d > 0 ? 'healthy' : 'idle',
      throughput: aiMetrics.message_count_7d,
      throughputLabel: '7天消息数',
      successRate: aiMetrics.active_sessions_7d > 0 ? 100 : 0,
      backlog: 0,
      lastRunAt: normalizeString(aiMetrics.latest_activity_at) || null,
      lastResult: `7天活跃会话 ${aiMetrics.active_sessions_7d} 个，活跃用户 ${aiMetrics.active_users_7d} 人`,
      lastError: '',
      detailPath: '/admin/users',
    },
  ]

  const recentFailures = toFailureItemList([
    ...previewFailures.map<AdminEfficiencyFailureItem>(item => ({
      id: `preview-${item.task_id}`,
      source: '文档预览',
      title: '文档预览任务失败',
      occurredAt: item.created_at,
      reason: normalizeString(item.error_message) || 'unknown error',
      detailPath: '/admin/resource-preview-worker',
    })),
    ...projectKnowledgeFailures.map<AdminEfficiencyFailureItem>(item => ({
      id: `knowledge-${item.task_id}`,
      source: '知识索引',
      title: '知识索引任务失败',
      occurredAt: item.updated_at,
      reason: normalizeString(item.error_message) || 'unknown error',
      detailPath: '/admin/resource-knowledge-worker',
    })),
    ...feishuFailures.map<AdminEfficiencyFailureItem>(item => ({
      id: `feishu-${item.run_id}`,
      source: '飞书同步',
      title: normalizeString(item.task_name) || '飞书同步运行失败',
      occurredAt: item.started_at,
      reason: normalizeString(item.error_message) || 'unknown error',
      detailPath: '/admin/integrations/feishu',
    })),
    ...governanceFailures.map<AdminEfficiencyFailureItem>(item => ({
      id: `governance-${item.task_id}`,
      source: '资源治理',
      title: normalizeString(item.task_type) || '治理任务失败',
      occurredAt: item.updated_at,
      reason: normalizeString(item.error_message) || 'unknown error',
      detailPath: '/admin/resources',
    })),
    ...recycleWorker.recentRuns
      .filter(item => !item.success)
      .map<AdminEfficiencyFailureItem>(item => ({
        id: `recycle-${item.id}`,
        source: '资源回收',
        title: '资源回收运行失败',
        occurredAt: item.finishedAt || item.startedAt,
        reason: normalizeString(item.errorMessage) || 'unknown error',
        detailPath: '/admin/resource-recycle-worker',
      })),
  ])

  return {
    generatedAt: toIsoNow(),
    summary: {
      previewSuccessRate24h,
      previewQueuedCount: previewMetrics.queued_count,
      previewOldestQueuedMinutes: round(toNumber(previewMetrics.oldest_queued_minutes), 2),
      feishuRunCount7d: feishuMetrics.run_count_7d,
      feishuSuccessRate7d,
      governancePendingCount: governanceMetrics.pending_count,
      aiActiveSessions7d: aiMetrics.active_sessions_7d,
    },
    systems,
    recentFailures,
  }
}

export async function getAdminOperationsRisks(db: Queryable, event?: H3Event): Promise<AdminRiskSnapshot> {
  return buildRiskSnapshot(db, event)
}

function getReportSchemaDatasets(): AdminReportDatasetSchema[] {
  return [
    {
      key: 'users',
      label: '用户',
      dimensions: [
        { key: 'username', label: '用户名', type: 'string' },
        { key: 'accountStatus', label: '账号状态', type: 'string' },
        { key: 'primaryRole', label: '平台角色', type: 'string' },
        { key: 'workspaceParticipationBand', label: '工作区参与度', type: 'string' },
        { key: 'projectMaturityBand', label: '项目成熟度', type: 'string' },
        { key: 'aiUsageBand', label: 'AI 使用度', type: 'string' },
        { key: 'searchActivityBand', label: '资料搜索活跃度', type: 'string' },
        { key: 'isPlatformAdmin', label: '平台管理员', type: 'boolean' },
      ],
      metrics: [
        { key: 'rowCount', label: '用户数', type: 'number', aggregation: 'sum' },
        { key: 'workspaceCount', label: '工作区数', type: 'number', aggregation: 'sum' },
        { key: 'projectCount', label: '项目数', type: 'number', aggregation: 'sum' },
        { key: 'activeSessionCount', label: '活跃会话数', type: 'number', aggregation: 'sum' },
        { key: 'aiSessionCount30d', label: '30天 AI 会话数', type: 'number', aggregation: 'sum' },
        { key: 'aiMessageCount30d', label: '30天 AI 消息数', type: 'number', aggregation: 'sum' },
        { key: 'resourceSearchCount30d', label: '30天资源搜索数', type: 'number', aggregation: 'sum' },
      ],
      filters: [
        { key: 'username', label: '用户名', type: 'string', operators: ['contains', 'eq'] },
        { key: 'accountStatus', label: '账号状态', type: 'string', operators: ['eq'] },
        { key: 'primaryRole', label: '平台角色', type: 'string', operators: ['eq'] },
        { key: 'workspaceParticipationBand', label: '工作区参与度', type: 'string', operators: ['eq'] },
        { key: 'projectMaturityBand', label: '项目成熟度', type: 'string', operators: ['eq'] },
      ],
      defaultDimensions: ['accountStatus', 'primaryRole'],
      defaultMetrics: ['rowCount', 'projectCount'],
    },
    {
      key: 'content',
      label: '内容',
      dimensions: [
        { key: 'contestName', label: '竞赛', type: 'string' },
        { key: 'category', label: '资源分类', type: 'string' },
        { key: 'status', label: '资源状态', type: 'string' },
        { key: 'governanceStatus', label: '治理状态', type: 'string' },
      ],
      metrics: [
        { key: 'rowCount', label: '资源数', type: 'number', aggregation: 'sum' },
        { key: 'qualityScore', label: '质量分', type: 'number', aggregation: 'avg' },
        { key: 'valueScore', label: '价值分', type: 'number', aggregation: 'avg' },
        { key: 'hotScore', label: '热度分', type: 'number', aggregation: 'avg' },
        { key: 'searchCount30d', label: '30天搜索数', type: 'number', aggregation: 'sum' },
        { key: 'clickCount30d', label: '30天点击数', type: 'number', aggregation: 'sum' },
      ],
      filters: [
        { key: 'contestName', label: '竞赛', type: 'string', operators: ['contains', 'eq'] },
        { key: 'category', label: '资源分类', type: 'string', operators: ['eq'] },
        { key: 'status', label: '资源状态', type: 'string', operators: ['eq'] },
        { key: 'governanceStatus', label: '治理状态', type: 'string', operators: ['eq'] },
      ],
      defaultDimensions: ['category', 'governanceStatus'],
      defaultMetrics: ['rowCount', 'searchCount30d'],
    },
    {
      key: 'revenue',
      label: '营收',
      dimensions: [
        { key: 'workspaceName', label: '工作区', type: 'string' },
        { key: 'planCode', label: '套餐编码', type: 'string' },
        { key: 'billingCycle', label: '计费周期', type: 'string' },
        { key: 'hasPlan', label: '是否有套餐', type: 'boolean' },
        { key: 'isSeatOverLimit', label: '团队席位超限', type: 'boolean' },
        { key: 'isProjectSeatOverLimit', label: '项目席位超限', type: 'boolean' },
      ],
      metrics: [
        { key: 'rowCount', label: '工作区数', type: 'number', aggregation: 'sum' },
        { key: 'memberCount', label: '成员数', type: 'number', aggregation: 'sum' },
        { key: 'projectCount', label: '项目数', type: 'number', aggregation: 'sum' },
        { key: 'seatUsed', label: '已用团队席位', type: 'number', aggregation: 'sum' },
        { key: 'seatLimit', label: '团队席位上限', type: 'number', aggregation: 'sum' },
        { key: 'projectSeatUsedTotal', label: '已用项目席位', type: 'number', aggregation: 'sum' },
        { key: 'projectSeatLimitTotal', label: '项目席位上限', type: 'number', aggregation: 'sum' },
        { key: 'estimatedAmountYuan', label: '估算金额(元)', type: 'number', aggregation: 'sum' },
      ],
      filters: [
        { key: 'workspaceName', label: '工作区', type: 'string', operators: ['contains', 'eq'] },
        { key: 'planCode', label: '套餐编码', type: 'string', operators: ['eq'] },
        { key: 'billingCycle', label: '计费周期', type: 'string', operators: ['eq'] },
        { key: 'hasPlan', label: '是否有套餐', type: 'boolean', operators: ['eq'] },
        { key: 'isSeatOverLimit', label: '团队席位超限', type: 'boolean', operators: ['eq'] },
      ],
      defaultDimensions: ['planCode', 'billingCycle'],
      defaultMetrics: ['rowCount', 'estimatedAmountYuan'],
    },
    {
      key: 'efficiency',
      label: '效能',
      dimensions: [
        { key: 'label', label: '系统', type: 'string' },
        { key: 'health', label: '健康度', type: 'string' },
      ],
      metrics: [
        { key: 'rowCount', label: '系统数', type: 'number', aggregation: 'sum' },
        { key: 'throughput', label: '吞吐', type: 'number', aggregation: 'sum' },
        { key: 'successRate', label: '成功率', type: 'number', aggregation: 'avg' },
        { key: 'backlog', label: '积压量', type: 'number', aggregation: 'sum' },
      ],
      filters: [
        { key: 'label', label: '系统', type: 'string', operators: ['contains', 'eq'] },
        { key: 'health', label: '健康度', type: 'string', operators: ['eq'] },
      ],
      defaultDimensions: ['label', 'health'],
      defaultMetrics: ['throughput', 'successRate'],
    },
    {
      key: 'risks',
      label: '风险',
      dimensions: [
        { key: 'severity', label: '级别', type: 'string' },
        { key: 'source', label: '来源', type: 'string' },
        { key: 'title', label: '规则', type: 'string' },
      ],
      metrics: [
        { key: 'rowCount', label: '风险数', type: 'number', aggregation: 'sum' },
        { key: 'currentValue', label: '当前值', type: 'number', aggregation: 'sum' },
        { key: 'threshold', label: '阈值', type: 'number', aggregation: 'max' },
      ],
      filters: [
        { key: 'severity', label: '级别', type: 'string', operators: ['eq'] },
        { key: 'source', label: '来源', type: 'string', operators: ['eq'] },
        { key: 'title', label: '规则', type: 'string', operators: ['contains', 'eq'] },
      ],
      defaultDimensions: ['severity', 'source'],
      defaultMetrics: ['rowCount', 'currentValue'],
    },
  ]
}

export async function getAdminOperationsReportSchema(): Promise<{ datasets: AdminReportDatasetSchema[] }> {
  return {
    datasets: getReportSchemaDatasets(),
  }
}

async function loadReportRecords(db: Queryable, dataset: AdminReportDatasetKey, event?: H3Event): Promise<ReportRecord[]> {
  if (dataset === 'users') {
    const snapshot = await getAdminOperationsUsers(db)
    return snapshot.users.map(item => normalizeReportRecord(item, { rowCount: 1 }))
  }

  if (dataset === 'content') {
    const resources = await loadContentResources(db)
    return resources.map(item => normalizeReportRecord(item, { rowCount: 1 }))
  }

  if (dataset === 'revenue') {
    const snapshot = await getAdminOperationsRevenue(db)
    return snapshot.workspaces.map(item => normalizeReportRecord(item, { rowCount: 1 }))
  }

  if (dataset === 'efficiency') {
    const snapshot = await getAdminOperationsEfficiency(db)
    return snapshot.systems.map(item => normalizeReportRecord(item, { rowCount: 1 }))
  }

  const snapshot = await getAdminOperationsRisks(db, event)
  return snapshot.alerts.map(item => normalizeReportRecord(item, { rowCount: 1 }))
}

function matchesFilter(record: ReportRecord, field: AdminReportFieldOption, operator: string, rawValue: ReportValue): boolean {
  const current = record[field.key]
  if (operator === 'eq')
    return String(current ?? '') === String(rawValue ?? '')

  if (operator === 'contains')
    return String(current ?? '').toLowerCase().includes(String(rawValue ?? '').toLowerCase())

  if (field.type === 'number') {
    const currentNumber = Number(current || 0)
    const target = Number(rawValue || 0)
    if (operator === 'gte')
      return currentNumber >= target
    if (operator === 'lte')
      return currentNumber <= target
  }

  return true
}

function buildFieldMaps(dataset: AdminReportDatasetSchema): {
  dimensions: ReportFieldMap
  metrics: ReportFieldMap
  filters: ReportFieldMap
} {
  return {
    dimensions: new Map(dataset.dimensions.map(item => [item.key, item])),
    metrics: new Map(dataset.metrics.map(item => [item.key, item])),
    filters: new Map(dataset.filters.map(item => [item.key, item])),
  }
}

export async function queryAdminOperationsReport(
  db: Queryable,
  input: AdminReportQuery,
  event?: H3Event,
): Promise<AdminReportResult> {
  const datasets = getReportSchemaDatasets()
  const dataset = datasets.find(item => item.key === input.dataset)
  if (!dataset)
    throw new Error('ADMIN_REPORT_DATASET_NOT_SUPPORTED')

  const fieldMaps = buildFieldMaps(dataset)
  const dimensions = (input.dimensions || []).filter(key => fieldMaps.dimensions.has(key))
  const metrics = (input.metrics || []).filter(key => fieldMaps.metrics.has(key))
  const selectedDimensions = dimensions.length > 0 ? dimensions : dataset.defaultDimensions
  const selectedMetrics = metrics.length > 0 ? metrics : dataset.defaultMetrics
  const rawRecords = await loadReportRecords(db, dataset.key, event)

  const filteredRecords = rawRecords.filter((record) => {
    return (input.filters || []).every((filter) => {
      const field = fieldMaps.filters.get(filter.field) || fieldMaps.dimensions.get(filter.field) || fieldMaps.metrics.get(filter.field)
      if (!field)
        return true
      return matchesFilter(record, field, filter.operator, filter.value)
    })
  })

  const grouped = new Map<string, {
    dimensions: ReportRecord
    metrics: Record<string, { sum: number, count: number, max: number }>
  }>()

  for (const record of filteredRecords) {
    const dimensionRecord: ReportRecord = {}
    for (const key of selectedDimensions)
      dimensionRecord[key] = record[key] ?? null
    const groupKey = JSON.stringify(selectedDimensions.map(key => record[key] ?? null))
    const current = grouped.get(groupKey) || {
      dimensions: dimensionRecord,
      metrics: {},
    }

    for (const key of selectedMetrics) {
      const field = fieldMaps.metrics.get(key)
      if (!field)
        continue
      const metricState = current.metrics[key] || { sum: 0, count: 0, max: Number.NEGATIVE_INFINITY }
      const rawValue = Number(record[key] || 0)
      if (field.aggregation === 'max') {
        metricState.max = Math.max(metricState.max, rawValue)
      }
      else if (field.aggregation === 'avg') {
        metricState.sum += rawValue
        metricState.count += 1
      }
      else {
        metricState.sum += rawValue
        metricState.count += 1
        metricState.max = Math.max(metricState.max, rawValue)
      }
      current.metrics[key] = metricState
    }

    grouped.set(groupKey, current)
  }

  const rows = [...grouped.values()].map((group) => {
    const row: ReportRecord = { ...group.dimensions }
    for (const key of selectedMetrics) {
      const field = fieldMaps.metrics.get(key)
      const metricState = group.metrics[key] || { sum: 0, count: 0, max: 0 }
      if (!field) {
        row[key] = 0
        continue
      }
      if (field.aggregation === 'avg')
        row[key] = metricState.count > 0 ? round(metricState.sum / metricState.count, 2) : 0
      else if (field.aggregation === 'max')
        row[key] = metricState.max === Number.NEGATIVE_INFINITY ? 0 : round(metricState.max, 2)
      else
        row[key] = round(metricState.sum, 2)
    }
    return row
  })

  const sortMetric = selectedMetrics[0]
  const sortDimension = selectedDimensions[0]

  if (sortMetric) {
    rows.sort((left, right) => Number(right[sortMetric] || 0) - Number(left[sortMetric] || 0))
  }
  else if (sortDimension) {
    rows.sort((left, right) => String(left[sortDimension] || '').localeCompare(String(right[sortDimension] || '')))
  }

  const limit = Math.max(1, Math.min(REPORT_MAX_LIMIT, Math.trunc(Number(input.limit || REPORT_DEFAULT_LIMIT))))
  const slicedRows = rows.slice(0, limit)
  const columns: AdminReportResultColumn[] = [
    ...selectedDimensions.map((key) => {
      const field = fieldMaps.dimensions.get(key)!
      return {
        key,
        label: field.label,
        kind: 'dimension' as const,
        type: field.type,
      }
    }),
    ...selectedMetrics.map((key) => {
      const field = fieldMaps.metrics.get(key)!
      return {
        key,
        label: field.label,
        kind: 'metric' as const,
        type: field.type,
      }
    }),
  ]

  return {
    generatedAt: toIsoNow(),
    dataset: dataset.key,
    columns,
    rows: slicedRows,
    total: rows.length,
  }
}

export async function exportAdminOperationsReportCsv(
  db: Queryable,
  input: AdminReportQuery,
  event?: H3Event,
): Promise<{ fileName: string, csv: string }> {
  const result = await queryAdminOperationsReport(db, input, event)
  return {
    fileName: `admin-operations-${result.dataset}-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: buildCsvFromResult(result),
  }
}
