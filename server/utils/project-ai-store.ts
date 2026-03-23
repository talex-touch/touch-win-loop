import type { Queryable } from '~~/server/utils/db'
import type {
  AiProjectChangeRequest,
  AiProjectChangeStatus,
  AiProjectChangeType,
  ProjectIssue,
  ProjectIssueReport,
  ProjectIssueSeverity,
  ProjectIssueStatus,
  WorkspaceAiMode,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface AiProjectChangeRequestRow {
  id: string
  workspace_id: string
  project_id: string
  session_id: string
  mode: WorkspaceAiMode
  change_type: AiProjectChangeType
  title: string
  summary: string
  destructive: boolean
  payload: unknown
  status: AiProjectChangeStatus
  created_by_user_id: string
  approved_by_user_id: string | null
  approved_at: string | null
  rejected_by_user_id: string | null
  rejected_at: string | null
  rejected_reason: string
  executed_result: unknown
  failed_reason: string
  created_at: string
  updated_at: string
}

interface ProjectIssueReportRow {
  id: string
  workspace_id: string
  project_id: string
  session_id: string
  source_mode: WorkspaceAiMode
  title: string
  summary: string
  markdown: string
  created_by_user_id: string
  created_at: string
  updated_at: string
}

interface ProjectIssueRow {
  id: string
  workspace_id: string
  project_id: string
  report_id: string
  title: string
  severity: ProjectIssueSeverity
  evidence: string
  recommendation: string
  status: ProjectIssueStatus
  created_by_user_id: string
  created_at: string
  updated_at: string
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

function mapAiProjectChangeRequest(row: AiProjectChangeRequestRow): AiProjectChangeRequest {
  const payload = normalizeRecord(row.payload)
  const executedResult = normalizeRecord(row.executed_result)
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    sessionId: row.session_id,
    mode: row.mode,
    changeType: row.change_type,
    title: row.title,
    summary: row.summary,
    destructive: Boolean(row.destructive),
    payload,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    approvedByUserId: row.approved_by_user_id || undefined,
    approvedAt: row.approved_at || undefined,
    rejectedByUserId: row.rejected_by_user_id || undefined,
    rejectedAt: row.rejected_at || undefined,
    rejectedReason: row.rejected_reason || undefined,
    executedResult: Object.keys(executedResult).length > 0 ? executedResult : undefined,
    failedReason: row.failed_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProjectIssueReport(row: ProjectIssueReportRow): ProjectIssueReport {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    sessionId: row.session_id,
    sourceMode: row.source_mode,
    title: row.title,
    summary: row.summary,
    markdown: row.markdown,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProjectIssue(row: ProjectIssueRow): ProjectIssue {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    reportId: row.report_id,
    title: row.title,
    severity: row.severity,
    evidence: row.evidence,
    recommendation: row.recommendation,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createAiProjectChangeRequests(
  db: Queryable,
  input: {
    workspaceId: string
    projectId: string
    sessionId: string
    mode: WorkspaceAiMode
    createdByUserId: string
    changes: Array<{
      changeType: AiProjectChangeType
      title: string
      summary: string
      destructive?: boolean
      payload?: Record<string, unknown>
    }>
  },
): Promise<AiProjectChangeRequest[]> {
  if (!Array.isArray(input.changes) || input.changes.length === 0)
    return []

  const created: AiProjectChangeRequest[] = []
  for (const item of input.changes) {
    const result = await db.query<AiProjectChangeRequestRow>(
      `INSERT INTO ai_project_change_requests (
        id,
        workspace_id,
        project_id,
        session_id,
        mode,
        change_type,
        title,
        summary,
        destructive,
        payload,
        status,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, 'pending', $11, NOW(), NOW()
      )
      RETURNING
        id,
        workspace_id,
        project_id,
        session_id,
        mode,
        change_type,
        title,
        summary,
        destructive,
        payload,
        status,
        created_by_user_id,
        approved_by_user_id,
        approved_at::TEXT,
        rejected_by_user_id,
        rejected_at::TEXT,
        rejected_reason,
        executed_result,
        failed_reason,
        created_at::TEXT,
        updated_at::TEXT`,
      [
        randomUUID(),
        input.workspaceId,
        input.projectId,
        input.sessionId,
        input.mode,
        item.changeType,
        String(item.title || '').trim() || 'AI 建议变更',
        String(item.summary || '').trim(),
        Boolean(item.destructive),
        JSON.stringify(item.payload || {}),
        input.createdByUserId,
      ],
    )
    created.push(mapAiProjectChangeRequest(result.rows[0]!))
  }

  return created
}

export async function listAiProjectChangeRequestsByProject(
  db: Queryable,
  input: {
    projectId: string
    statuses?: AiProjectChangeStatus[]
    limit?: number
  },
): Promise<AiProjectChangeRequest[]> {
  const statuses = Array.isArray(input.statuses) && input.statuses.length > 0
    ? input.statuses
    : ['pending', 'approved', 'rejected', 'failed']
  const limit = Math.max(1, Math.min(200, Number(input.limit || 50)))

  const result = await db.query<AiProjectChangeRequestRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      session_id,
      mode,
      change_type,
      title,
      summary,
      destructive,
      payload,
      status,
      created_by_user_id,
      approved_by_user_id,
      approved_at::TEXT,
      rejected_by_user_id,
      rejected_at::TEXT,
      rejected_reason,
      executed_result,
      failed_reason,
      created_at::TEXT,
      updated_at::TEXT
     FROM ai_project_change_requests
     WHERE project_id = $1
       AND status = ANY($2::TEXT[])
     ORDER BY created_at DESC
     LIMIT $3`,
    [input.projectId, statuses, limit],
  )

  return result.rows.map(mapAiProjectChangeRequest)
}

export async function getAiProjectChangeRequestById(
  db: Queryable,
  input: {
    projectId: string
    changeId: string
  },
): Promise<AiProjectChangeRequest | null> {
  const result = await db.query<AiProjectChangeRequestRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      session_id,
      mode,
      change_type,
      title,
      summary,
      destructive,
      payload,
      status,
      created_by_user_id,
      approved_by_user_id,
      approved_at::TEXT,
      rejected_by_user_id,
      rejected_at::TEXT,
      rejected_reason,
      executed_result,
      failed_reason,
      created_at::TEXT,
      updated_at::TEXT
     FROM ai_project_change_requests
     WHERE project_id = $1
       AND id = $2
     LIMIT 1`,
    [input.projectId, input.changeId],
  )
  const row = result.rows[0]
  return row ? mapAiProjectChangeRequest(row) : null
}

export async function markAiProjectChangeRequestApproved(
  db: Queryable,
  input: {
    projectId: string
    changeId: string
    actorUserId: string
    executedResult?: Record<string, unknown>
  },
): Promise<AiProjectChangeRequest | null> {
  const result = await db.query<AiProjectChangeRequestRow>(
    `UPDATE ai_project_change_requests
     SET status = 'approved',
         approved_by_user_id = $3,
         approved_at = NOW(),
         executed_result = $4::JSONB,
         failed_reason = '',
         updated_at = NOW()
     WHERE project_id = $1
       AND id = $2
     RETURNING
       id,
       workspace_id,
       project_id,
       session_id,
       mode,
       change_type,
       title,
       summary,
       destructive,
       payload,
       status,
       created_by_user_id,
       approved_by_user_id,
       approved_at::TEXT,
       rejected_by_user_id,
       rejected_at::TEXT,
       rejected_reason,
       executed_result,
       failed_reason,
       created_at::TEXT,
       updated_at::TEXT`,
    [input.projectId, input.changeId, input.actorUserId, JSON.stringify(input.executedResult || {})],
  )
  const row = result.rows[0]
  return row ? mapAiProjectChangeRequest(row) : null
}

export async function markAiProjectChangeRequestRejected(
  db: Queryable,
  input: {
    projectId: string
    changeId: string
    actorUserId: string
    reason?: string
  },
): Promise<AiProjectChangeRequest | null> {
  const result = await db.query<AiProjectChangeRequestRow>(
    `UPDATE ai_project_change_requests
     SET status = 'rejected',
         rejected_by_user_id = $3,
         rejected_at = NOW(),
         rejected_reason = $4,
         updated_at = NOW()
     WHERE project_id = $1
       AND id = $2
     RETURNING
       id,
       workspace_id,
       project_id,
       session_id,
       mode,
       change_type,
       title,
       summary,
       destructive,
       payload,
       status,
       created_by_user_id,
       approved_by_user_id,
       approved_at::TEXT,
       rejected_by_user_id,
       rejected_at::TEXT,
       rejected_reason,
       executed_result,
       failed_reason,
       created_at::TEXT,
       updated_at::TEXT`,
    [input.projectId, input.changeId, input.actorUserId, String(input.reason || '').trim()],
  )
  const row = result.rows[0]
  return row ? mapAiProjectChangeRequest(row) : null
}

export async function markAiProjectChangeRequestFailed(
  db: Queryable,
  input: {
    projectId: string
    changeId: string
    failedReason: string
  },
): Promise<AiProjectChangeRequest | null> {
  const result = await db.query<AiProjectChangeRequestRow>(
    `UPDATE ai_project_change_requests
     SET status = 'failed',
         failed_reason = $3,
         updated_at = NOW()
     WHERE project_id = $1
       AND id = $2
     RETURNING
       id,
       workspace_id,
       project_id,
       session_id,
       mode,
       change_type,
       title,
       summary,
       destructive,
       payload,
       status,
       created_by_user_id,
       approved_by_user_id,
       approved_at::TEXT,
       rejected_by_user_id,
       rejected_at::TEXT,
       rejected_reason,
       executed_result,
       failed_reason,
       created_at::TEXT,
       updated_at::TEXT`,
    [input.projectId, input.changeId, String(input.failedReason || '').trim()],
  )
  const row = result.rows[0]
  return row ? mapAiProjectChangeRequest(row) : null
}

export async function createProjectIssueReportWithIssues(
  db: Queryable,
  input: {
    workspaceId: string
    projectId: string
    sessionId: string
    sourceMode: WorkspaceAiMode
    title: string
    summary: string
    markdown: string
    createdByUserId: string
    issues: Array<{
      title: string
      severity: ProjectIssueSeverity
      evidence: string
      recommendation: string
      status?: ProjectIssueStatus
    }>
  },
): Promise<{ report: ProjectIssueReport, issues: ProjectIssue[] }> {
  const reportResult = await db.query<ProjectIssueReportRow>(
    `INSERT INTO project_issue_reports (
      id,
      workspace_id,
      project_id,
      session_id,
      source_mode,
      title,
      summary,
      markdown,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
    )
    RETURNING
      id,
      workspace_id,
      project_id,
      session_id,
      source_mode,
      title,
      summary,
      markdown,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      input.workspaceId,
      input.projectId,
      input.sessionId,
      input.sourceMode,
      String(input.title || '').trim() || 'AI 寻疑报告',
      String(input.summary || '').trim(),
      String(input.markdown || '').trim(),
      input.createdByUserId,
    ],
  )
  const report = mapProjectIssueReport(reportResult.rows[0]!)

  const createdIssues: ProjectIssue[] = []
  for (const item of input.issues) {
    const issueResult = await db.query<ProjectIssueRow>(
      `INSERT INTO project_issues (
        id,
        workspace_id,
        project_id,
        report_id,
        title,
        severity,
        evidence,
        recommendation,
        status,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
      )
      RETURNING
        id,
        workspace_id,
        project_id,
        report_id,
        title,
        severity,
        evidence,
        recommendation,
        status,
        created_by_user_id,
        created_at::TEXT,
        updated_at::TEXT`,
      [
        randomUUID(),
        input.workspaceId,
        input.projectId,
        report.id,
        String(item.title || '').trim() || '未命名问题',
        item.severity,
        String(item.evidence || '').trim(),
        String(item.recommendation || '').trim(),
        item.status || 'open',
        input.createdByUserId,
      ],
    )
    createdIssues.push(mapProjectIssue(issueResult.rows[0]!))
  }

  return {
    report,
    issues: createdIssues,
  }
}

export async function listProjectIssueReportsByProject(
  db: Queryable,
  input: {
    projectId: string
    limit?: number
  },
): Promise<ProjectIssueReport[]> {
  const limit = Math.max(1, Math.min(100, Number(input.limit || 20)))
  const result = await db.query<ProjectIssueReportRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      session_id,
      source_mode,
      title,
      summary,
      markdown,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_issue_reports
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [input.projectId, limit],
  )
  return result.rows.map(mapProjectIssueReport)
}

export async function listProjectIssuesByProject(
  db: Queryable,
  input: {
    projectId: string
    statuses?: ProjectIssueStatus[]
    limit?: number
  },
): Promise<ProjectIssue[]> {
  const statuses = Array.isArray(input.statuses) && input.statuses.length > 0
    ? input.statuses
    : ['open', 'in_progress', 'resolved', 'ignored']
  const limit = Math.max(1, Math.min(500, Number(input.limit || 200)))
  const result = await db.query<ProjectIssueRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      report_id,
      title,
      severity,
      evidence,
      recommendation,
      status,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_issues
     WHERE project_id = $1
       AND status = ANY($2::TEXT[])
     ORDER BY created_at DESC
     LIMIT $3`,
    [input.projectId, statuses, limit],
  )
  return result.rows.map(mapProjectIssue)
}
