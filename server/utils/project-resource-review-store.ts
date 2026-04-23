import type { Queryable } from '~~/server/utils/db'
import type {
  DocumentBBox,
  ProjectKnowledgeCitationLocator,
  ProjectResourceReviewFinding,
  ProjectResourceReviewJob,
  ProjectResourceReviewJobStatus,
  ProjectResourceReviewSeverity,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ReviewJobRow {
  id: string
  project_id: string
  project_resource_id: string
  document_id: string
  status: ProjectResourceReviewJobStatus
  prompt: string
  page_total: number
  page_reviewed: number
  result_summary: string
  error_message: string
  provider: string
  model: string
  created_by_user_id: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

interface ReviewFindingRow {
  id: string
  job_id: string
  project_id: string
  project_resource_id: string
  document_id: string
  page_number: number
  severity: ProjectResourceReviewSeverity
  category: string
  title: string
  comment: string
  quote: string
  source_block_ids: unknown
  locator_json: unknown
  bbox_json: unknown
  confidence: number
  created_at: string
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

function normalizeLocator(value: unknown, pageNumber: number): ProjectKnowledgeCitationLocator {
  const source = normalizeRecord(value)
  return {
    page: Math.max(1, Number(source.page || pageNumber)),
    section: normalizeString(source.section) || undefined,
    anchorId: normalizeString(source.anchorId) || undefined,
    nodeId: normalizeString(source.nodeId) || undefined,
    utteranceRange: normalizeString(source.utteranceRange) || undefined,
    label: normalizeString(source.label) || `第 ${Math.max(1, pageNumber)} 页`,
  }
}

function normalizeBbox(value: unknown): DocumentBBox | null {
  const source = normalizeRecord(value)
  const x = Number(source.x)
  const y = Number(source.y)
  const w = Number(source.w ?? source.width)
  const h = Number(source.h ?? source.height)
  if (![x, y, w, h].every(Number.isFinite))
    return null
  return { x, y, w, h }
}

function mapFinding(row: ReviewFindingRow): ProjectResourceReviewFinding {
  return {
    id: row.id,
    jobId: row.job_id,
    projectId: row.project_id,
    resourceId: row.project_resource_id,
    documentId: row.document_id,
    pageNumber: Math.max(1, Number(row.page_number || 1)),
    severity: row.severity || 'info',
    category: normalizeString(row.category),
    title: normalizeString(row.title),
    comment: normalizeString(row.comment),
    quote: normalizeString(row.quote),
    sourceBlockIds: normalizeStringArray(row.source_block_ids),
    locator: normalizeLocator(row.locator_json, Number(row.page_number || 1)),
    bbox: normalizeBbox(row.bbox_json),
    confidence: Math.max(0, Math.min(1, Number(row.confidence || 0))),
    createdAt: row.created_at,
  }
}

function mapJob(row: ReviewJobRow, findings: ProjectResourceReviewFinding[] = []): ProjectResourceReviewJob {
  return {
    id: row.id,
    projectId: row.project_id,
    resourceId: row.project_resource_id,
    documentId: row.document_id,
    status: row.status || 'queued',
    prompt: normalizeString(row.prompt),
    pageTotal: Math.max(0, Number(row.page_total || 0)),
    pageReviewed: Math.max(0, Number(row.page_reviewed || 0)),
    resultSummary: normalizeString(row.result_summary),
    errorMessage: normalizeString(row.error_message),
    provider: normalizeString(row.provider),
    model: normalizeString(row.model),
    createdByUserId: row.created_by_user_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    findings,
  }
}

async function listFindingsByJobId(db: Queryable, jobId: string): Promise<ProjectResourceReviewFinding[]> {
  const result = await db.query<ReviewFindingRow>(
    `SELECT
      id,
      job_id,
      project_id,
      project_resource_id,
      document_id,
      page_number,
      severity,
      category,
      title,
      comment,
      quote,
      source_block_ids,
      locator_json,
      bbox_json,
      confidence,
      created_at::TEXT
     FROM project_resource_review_findings
     WHERE job_id = $1
     ORDER BY page_number ASC, created_at ASC`,
    [jobId],
  )
  return result.rows.map(mapFinding)
}

export async function createProjectResourceReviewJob(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    documentId: string
    prompt?: string
    pageTotal: number
    actorUserId: string
  },
): Promise<ProjectResourceReviewJob> {
  const jobId = randomUUID()
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO project_resource_review_jobs (
      id,
      project_id,
      project_resource_id,
      document_id,
      status,
      prompt,
      page_total,
      page_reviewed,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, 'queued', $5, $6, 0, $7, $8, $8)`,
    [
      jobId,
      input.projectId,
      input.resourceId,
      input.documentId,
      normalizeString(input.prompt),
      Math.max(0, Math.trunc(Number(input.pageTotal || 0))),
      input.actorUserId,
      now,
    ],
  )
  const job = await getProjectResourceReviewJob(db, { projectId: input.projectId, resourceId: input.resourceId, jobId })
  if (!job)
    throw new Error('PROJECT_RESOURCE_REVIEW_JOB_CREATE_FAILED')
  return job
}

export async function getProjectResourceReviewJob(
  db: Queryable,
  input: { projectId: string, resourceId: string, jobId: string },
): Promise<ProjectResourceReviewJob | null> {
  const result = await db.query<ReviewJobRow>(
    `SELECT
      id,
      project_id,
      project_resource_id,
      document_id,
      status,
      prompt,
      page_total,
      page_reviewed,
      result_summary,
      error_message,
      provider,
      model,
      created_by_user_id,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resource_review_jobs
     WHERE project_id = $1
       AND project_resource_id = $2
       AND id = $3
     LIMIT 1`,
    [input.projectId, input.resourceId, input.jobId],
  )
  const row = result.rows[0]
  if (!row)
    return null
  const findings = await listFindingsByJobId(db, row.id)
  return mapJob(row, findings)
}

export async function getLatestProjectResourceReviewJob(
  db: Queryable,
  input: { projectId: string, resourceId: string },
): Promise<ProjectResourceReviewJob | null> {
  const result = await db.query<ReviewJobRow>(
    `SELECT
      id,
      project_id,
      project_resource_id,
      document_id,
      status,
      prompt,
      page_total,
      page_reviewed,
      result_summary,
      error_message,
      provider,
      model,
      created_by_user_id,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resource_review_jobs
     WHERE project_id = $1
       AND project_resource_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )
  const row = result.rows[0]
  if (!row)
    return null
  const findings = await listFindingsByJobId(db, row.id)
  return mapJob(row, findings)
}

export async function replaceProjectResourceReviewFindings(
  db: Queryable,
  input: {
    jobId: string
    projectId: string
    resourceId: string
    documentId: string
    findings: Array<{
      pageNumber: number
      severity: ProjectResourceReviewSeverity
      category: string
      title: string
      comment: string
      quote: string
      sourceBlockIds: string[]
      locator: ProjectKnowledgeCitationLocator
      bbox?: DocumentBBox | null
      confidence: number
    }>
  },
): Promise<void> {
  await db.query('DELETE FROM project_resource_review_findings WHERE job_id = $1', [input.jobId])
  for (const finding of input.findings) {
    await db.query(
      `INSERT INTO project_resource_review_findings (
        id,
        job_id,
        project_id,
        project_resource_id,
        document_id,
        page_number,
        severity,
        category,
        title,
        comment,
        quote,
        source_block_ids,
        locator_json,
        bbox_json,
        confidence,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12::JSONB, $13::JSONB, $14::JSONB, $15, NOW()
      )`,
      [
        randomUUID(),
        input.jobId,
        input.projectId,
        input.resourceId,
        input.documentId,
        Math.max(1, Math.trunc(Number(finding.pageNumber || 1))),
        finding.severity || 'info',
        normalizeString(finding.category),
        normalizeString(finding.title),
        normalizeString(finding.comment),
        normalizeString(finding.quote),
        JSON.stringify(finding.sourceBlockIds || []),
        JSON.stringify(finding.locator || {}),
        JSON.stringify(finding.bbox || {}),
        Math.max(0, Math.min(1, Number(finding.confidence || 0))),
      ],
    )
  }
}

export async function updateProjectResourceReviewJobState(
  db: Queryable,
  input: {
    jobId: string
    status: ProjectResourceReviewJobStatus
    pageReviewed?: number
    resultSummary?: string
    errorMessage?: string
    provider?: string
    model?: string
  },
): Promise<void> {
  await db.query(
    `UPDATE project_resource_review_jobs
     SET status = $2,
         page_reviewed = COALESCE($3, page_reviewed),
         result_summary = COALESCE($4, result_summary),
         error_message = COALESCE($5, error_message),
         provider = COALESCE($6, provider),
         model = COALESCE($7, model),
         started_at = CASE WHEN $2 = 'processing' THEN COALESCE(started_at, NOW()) ELSE started_at END,
         finished_at = CASE WHEN $2 IN ('succeeded', 'failed') THEN NOW() ELSE finished_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.jobId,
      input.status,
      input.pageReviewed ?? null,
      input.resultSummary ?? null,
      input.errorMessage ?? null,
      input.provider ?? null,
      input.model ?? null,
    ],
  )
}
