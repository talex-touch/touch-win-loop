import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectExportArtifact,
  ProjectExportBundleManifest,
  ProjectExportJob,
  ProjectExportJobStatus,
  ProjectExportJobTrigger,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ProjectExportJobRow {
  id: string
  project_id: string
  workspace_id: string
  profile_id: string | null
  trigger: ProjectExportJobTrigger
  status: ProjectExportJobStatus
  attempt: string | number
  parent_job_id: string | null
  error_message: string
  manifest_json: Record<string, unknown> | null
  artifacts_json: unknown
  started_by_user_id: string | null
  started_at: string | null
  finished_at: string | null
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

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeArtifact(value: unknown): ProjectExportArtifact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const record = value as Record<string, unknown>
  const id = normalizeString(record.id)
  const kind = normalizeString(record.kind)
  const title = normalizeString(record.title)
  const fileName = normalizeString(record.fileName)
  const mimeType = normalizeString(record.mimeType)
  if (!id || !kind || !title || !fileName || !mimeType)
    return null
  return {
    id,
    kind: kind as ProjectExportArtifact['kind'],
    title,
    fileName,
    mimeType,
    size: Math.max(0, Math.trunc(toNumber(record.size, 0))),
    resourceId: normalizeString(record.resourceId) || null,
    objectKey: normalizeString(record.objectKey) || null,
    downloadPath: normalizeString(record.downloadPath) || null,
  }
}

function normalizeArtifacts(value: unknown): ProjectExportArtifact[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(normalizeArtifact)
    .filter((item): item is ProjectExportArtifact => Boolean(item))
}

function normalizeManifest(value: unknown): ProjectExportBundleManifest | null {
  const record = normalizeRecord(value)
  const id = normalizeString(record.id)
  const projectId = normalizeString(record.projectId)
  const generatedAt = normalizeString(record.generatedAt)
  const knowledgeSummary = normalizeString(record.knowledgeSummary)
  const profileRecord = normalizeRecord(record.profile)
  const profileId = normalizeString(profileRecord.id)
  const profileTitle = normalizeString(profileRecord.title)
  if (!id || !projectId || !generatedAt || !knowledgeSummary || !profileId || !profileTitle)
    return null
  return {
    id,
    projectId,
    contestId: normalizeString(record.contestId) || null,
    profile: {
      id: profileId,
      title: profileTitle,
      contestId: normalizeString(profileRecord.contestId) || null,
      summary: normalizeString(profileRecord.summary),
      sections: Array.isArray(profileRecord.sections)
        ? profileRecord.sections.map(item => normalizeString(item)).filter(Boolean)
        : [],
      artifactKinds: Array.isArray(profileRecord.artifactKinds)
        ? profileRecord.artifactKinds.map(item => normalizeString(item) as ProjectExportArtifact['kind']).filter(Boolean)
        : [],
    },
    generatedAt,
    artifacts: normalizeArtifacts(record.artifacts),
    knowledgeSummary,
  }
}

function mapJob(row: ProjectExportJobRow): ProjectExportJob {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    profileId: normalizeString(row.profile_id) || null,
    trigger: row.trigger,
    status: row.status,
    attempt: Math.max(1, Math.trunc(toNumber(row.attempt, 1))),
    parentJobId: normalizeString(row.parent_job_id) || null,
    errorMessage: normalizeString(row.error_message),
    manifest: normalizeManifest(row.manifest_json),
    artifacts: normalizeArtifacts(row.artifacts_json),
    startedByUserId: normalizeString(row.started_by_user_id) || null,
    startedAt: normalizeString(row.started_at) || null,
    finishedAt: normalizeString(row.finished_at) || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getJobById(db: Queryable, jobId: string): Promise<ProjectExportJob | null> {
  const result = await db.query<ProjectExportJobRow>(
    `SELECT
      id,
      project_id,
      workspace_id,
      profile_id,
      trigger,
      status,
      attempt,
      parent_job_id,
      error_message,
      manifest_json,
      artifacts_json,
      started_by_user_id,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_export_jobs
     WHERE id = $1
     LIMIT 1`,
    [jobId],
  )
  const row = result.rows[0]
  return row ? mapJob(row) : null
}

export async function createProjectExportJob(
  db: Queryable,
  input: {
    projectId: string
    workspaceId: string
    profileId?: string | null
    trigger?: ProjectExportJobTrigger
    attempt?: number
    parentJobId?: string | null
    startedByUserId?: string | null
  },
): Promise<ProjectExportJob> {
  const id = randomUUID()
  await db.query(
    `INSERT INTO project_export_jobs (
      id,
      project_id,
      workspace_id,
      profile_id,
      trigger,
      status,
      attempt,
      parent_job_id,
      error_message,
      manifest_json,
      artifacts_json,
      started_by_user_id,
      started_at,
      finished_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, 'processing', $6, $7, '', '{}'::JSONB, '[]'::JSONB, $8, NOW(), NULL, NOW(), NOW()
    )`,
    [
      id,
      input.projectId,
      input.workspaceId,
      normalizeString(input.profileId) || null,
      input.trigger || 'manual',
      Math.max(1, Math.trunc(toNumber(input.attempt, 1))),
      normalizeString(input.parentJobId) || null,
      normalizeString(input.startedByUserId) || null,
    ],
  )
  const created = await getJobById(db, id)
  if (!created)
    throw new Error('PROJECT_EXPORT_JOB_CREATE_FAILED')
  return created
}

export async function finishProjectExportJobSuccess(
  db: Queryable,
  input: {
    jobId: string
    manifest: ProjectExportBundleManifest
    artifacts: ProjectExportArtifact[]
  },
): Promise<ProjectExportJob> {
  await db.query(
    `UPDATE project_export_jobs
     SET status = 'succeeded',
         error_message = '',
         manifest_json = $2::JSONB,
         artifacts_json = $3::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.jobId,
      JSON.stringify(input.manifest),
      JSON.stringify(input.artifacts),
    ],
  )
  const updated = await getJobById(db, input.jobId)
  if (!updated)
    throw new Error('PROJECT_EXPORT_JOB_NOT_FOUND')
  return updated
}

export async function finishProjectExportJobFailure(
  db: Queryable,
  input: {
    jobId: string
    errorMessage: string
  },
): Promise<ProjectExportJob> {
  await db.query(
    `UPDATE project_export_jobs
     SET status = 'failed',
         error_message = $2,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.jobId, normalizeString(input.errorMessage) || 'PROJECT_EXPORT_FAILED'],
  )
  const updated = await getJobById(db, input.jobId)
  if (!updated)
    throw new Error('PROJECT_EXPORT_JOB_NOT_FOUND')
  return updated
}

export async function getProjectExportJobById(
  db: Queryable,
  input: {
    projectId: string
    jobId: string
  },
): Promise<ProjectExportJob | null> {
  const result = await db.query<ProjectExportJobRow>(
    `SELECT
      id,
      project_id,
      workspace_id,
      profile_id,
      trigger,
      status,
      attempt,
      parent_job_id,
      error_message,
      manifest_json,
      artifacts_json,
      started_by_user_id,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_export_jobs
     WHERE project_id = $1
       AND id = $2
     LIMIT 1`,
    [input.projectId, input.jobId],
  )
  const row = result.rows[0]
  return row ? mapJob(row) : null
}

export async function listProjectExportJobs(
  db: Queryable,
  input: {
    projectId: string
    limit?: number
  },
): Promise<ProjectExportJob[]> {
  const limit = Math.max(1, Math.min(20, Math.trunc(toNumber(input.limit, 8))))
  const result = await db.query<ProjectExportJobRow>(
    `SELECT
      id,
      project_id,
      workspace_id,
      profile_id,
      trigger,
      status,
      attempt,
      parent_job_id,
      error_message,
      manifest_json,
      artifacts_json,
      started_by_user_id,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_export_jobs
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [input.projectId, limit],
  )
  return result.rows.map(mapJob)
}
