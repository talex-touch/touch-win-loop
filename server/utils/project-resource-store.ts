import type { Queryable } from '~~/server/utils/db'
import type {
  Resource,
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ProjectResourceRow {
  id: string
  project_id: string
  source: 'upload' | 'library'
  linked_contest_resource_id: string | null
  title: string
  mime_type: string
  category: ResourceCategory
  year: number
  source_link: string
  availability: ResourceAvailability
  summary: string
  content: string
  metadata: Record<string, unknown>
  status: ResourceStatus
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface ContestResourceRow {
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
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface ProjectUploadStorageUsageRow {
  used_bytes: string
}

interface ProjectResourceDocumentIdRow {
  id: string
}

interface ProjectExistsRow {
  id: string
}

export interface ProjectUploadedFileRef {
  objectKey: string
  fileName: string
  mimeType: string
}

export interface PurgedProjectResourceRef {
  resourceId: string
  source: 'upload' | 'library'
  objectKey: string
}

export const PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS = 30

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
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

function normalizeUploadTitle(fileName: string, inputTitle?: string): string {
  const trimmedInput = normalizeString(inputTitle)
  if (trimmedInput)
    return trimmedInput

  const base = normalizeString(fileName)
    .replace(/\.[^/.]+$/, '')
    .replace(/[（(]\d+[)）]\s*$/g, '')
    .replace(/[-_ ]?副本(?:\s*\d+)?$/g, '')
    .trim()

  if (base)
    return base

  return '上传资料'
}

function toResource(row: ProjectResourceRow): Resource {
  const metadata = parseResourceMetadata(row.metadata)
  const originContestId = normalizeString(metadata.originContestId)

  return {
    id: row.id,
    projectId: row.project_id,
    contestId: originContestId,
    title: row.title,
    type: row.category,
    year: Number(row.year || 0),
    sourceLink: row.source_link,
    availability: row.availability,
    sourceType: row.source,
    source: row.source,
    linkedContestResourceId: row.linked_contest_resource_id,
    summary: row.summary,
    content: row.content,
    metadata,
    category: row.category,
    copyrightNote: '',
    status: row.status,
    createdBy: row.created_by_user_id || undefined,
    updatedBy: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toLibraryResource(row: ContestResourceRow): Resource {
  const metadata = parseResourceMetadata(row.metadata)

  return {
    id: row.id,
    contestId: row.contest_id,
    title: row.title,
    type: row.category,
    year: Number(row.year || 0),
    sourceLink: row.url,
    availability: row.access_level,
    sourceType: row.source_type,
    source: 'library',
    linkedContestResourceId: row.id,
    summary: row.summary,
    content: row.content,
    metadata,
    category: row.category,
    copyrightNote: row.copyright_note,
    status: row.status,
    createdBy: row.created_by_user_id || undefined,
    updatedBy: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function ensureProjectExists(db: Queryable, projectId: string): Promise<void> {
  const result = await db.query<ProjectExistsRow>(
    `SELECT id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId],
  )

  if (!result.rows[0]?.id)
    throw new Error('PROJECT_NOT_FOUND')
}

export async function listProjectResources(
  db: Queryable,
  projectId: string,
): Promise<Resource[]> {
  const result = await db.query<ProjectResourceRow>(
    `SELECT
      id,
      project_id,
      source,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resources
     WHERE project_id = $1
       AND status = 'active'
     ORDER BY created_at DESC`,
    [projectId],
  )

  return result.rows.map(toResource)
}

export async function listProjectRecycleResources(
  db: Queryable,
  projectId: string,
): Promise<Resource[]> {
  const result = await db.query<ProjectResourceRow>(
    `SELECT
      id,
      project_id,
      source,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resources
     WHERE project_id = $1
       AND status = 'archived'
     ORDER BY updated_at DESC`,
    [projectId],
  )

  return result.rows.map(toResource)
}

export async function listProjectLibraryResources(
  db: Queryable,
  projectId: string,
): Promise<Resource[]> {
  const result = await db.query<ContestResourceRow>(
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
      r.created_by_user_id,
      r.updated_by_user_id,
      r.created_at::TEXT,
      r.updated_at::TEXT
     FROM contest_resources r
     WHERE r.status = 'active'
       AND COALESCE(r.source_type, '') <> 'project_upload'
       AND NOT EXISTS (
         SELECT 1
         FROM project_resources pr
         WHERE pr.project_id = $1
           AND pr.linked_contest_resource_id = r.id
           AND pr.status = 'active'
       )
     ORDER BY r.year DESC, r.created_at DESC
     LIMIT 80`,
    [projectId],
  )

  return result.rows.map(toLibraryResource)
}

export async function bindLibraryResourceToProject(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
  },
): Promise<Resource> {
  await ensureProjectExists(db, input.projectId)

  const existing = await db.query<ProjectResourceRow>(
    `SELECT
      id,
      project_id,
      source,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resources
     WHERE project_id = $1
       AND linked_contest_resource_id = $2
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const existingRow = existing.rows[0]
  if (existingRow) {
    if (existingRow.status === 'active')
      return toResource(existingRow)

    const now = new Date().toISOString()
    const restored = await db.query<ProjectResourceRow>(
      `UPDATE project_resources
       SET status = 'active',
           updated_by_user_id = $3,
           updated_at = $4
       WHERE id = $1
         AND project_id = $2
       RETURNING
         id,
         project_id,
         source,
         linked_contest_resource_id,
         title,
         mime_type,
         category,
         year,
         source_link,
         availability,
         summary,
         content,
         metadata,
         status,
         created_by_user_id,
         updated_by_user_id,
         created_at::TEXT,
         updated_at::TEXT`,
      [existingRow.id, input.projectId, input.actorUserId, now],
    )

    return toResource(restored.rows[0]!)
  }

  const resourceResult = await db.query<ContestResourceRow>(
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
      r.created_by_user_id,
      r.updated_by_user_id,
      r.created_at::TEXT,
      r.updated_at::TEXT
     FROM contest_resources r
     WHERE r.id = $1
       AND r.status = 'active'
       AND COALESCE(r.source_type, '') <> 'project_upload'
     LIMIT 1`,
    [input.resourceId],
  )

  const resourceRow = resourceResult.rows[0]
  if (!resourceRow)
    throw new Error('RESOURCE_NOT_FOUND')

  const now = new Date().toISOString()
  const projectResourceId = randomUUID()
  const metadata = {
    ...parseResourceMetadata(resourceRow.metadata),
    originContestId: normalizeString(resourceRow.contest_id),
    originResourceId: normalizeString(resourceRow.id),
    importedAt: now,
  }

  const inserted = await db.query<ProjectResourceRow>(
    `INSERT INTO project_resources (
      id,
      project_id,
      source,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'library', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB, 'active', $13, $13, $14, $14
    )
    RETURNING
      id,
      project_id,
      source,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      projectResourceId,
      input.projectId,
      resourceRow.id,
      resourceRow.title,
      normalizeString((resourceRow.metadata || {}).mimeType) || 'application/octet-stream',
      resourceRow.category,
      resourceRow.year,
      resourceRow.url,
      resourceRow.access_level,
      resourceRow.summary,
      resourceRow.content,
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )

  return toResource(inserted.rows[0]!)
}

export async function createProjectUploadedResource(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    fileName: string
    mimeType: string
    fileSize: number
    objectKey: string
    storageProvider?: string
    title?: string
    summary?: string
    accessLevel?: ResourceAvailability
    category?: ResourceCategory
  },
): Promise<Resource> {
  await ensureProjectExists(db, input.projectId)

  const resourceId = randomUUID()
  const now = new Date().toISOString()
  const title = normalizeUploadTitle(input.fileName, input.title)
  const sourceLink = `/api/projects/${input.projectId}/resources/${resourceId}/file`
  const metadata = {
    objectKey: normalizeString(input.objectKey),
    fileName: normalizeString(input.fileName),
    mimeType: normalizeString(input.mimeType) || 'application/octet-stream',
    fileSize: Number.isFinite(Number(input.fileSize)) ? Number(input.fileSize) : 0,
    storageProvider: normalizeString(input.storageProvider) || 'runtime',
    uploadedAt: now,
  }

  const result = await db.query<ProjectResourceRow>(
    `INSERT INTO project_resources (
      id,
      project_id,
      source,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'upload', NULL, $3, $4, $5, $6, $7, $8, $9, '', $10::JSONB, 'active', $11, $11, $12, $12
    )
    RETURNING
      id,
      project_id,
      source,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      resourceId,
      input.projectId,
      title,
      normalizeString(input.mimeType) || 'application/octet-stream',
      input.category || 'templates',
      new Date().getFullYear(),
      sourceLink,
      input.accessLevel || 'public',
      normalizeString(input.summary),
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )

  return toResource(result.rows[0]!)
}

export async function createProjectResourceDocumentWithTask(
  db: Queryable,
  input: {
    projectId: string
    projectResourceId: string
    objectKey: string
    storageProvider: string
    fileName: string
    mimeType: string
    fileSize: number
    actorUserId: string
  },
): Promise<{ documentId: string, taskId: string }> {
  const now = new Date().toISOString()
  const documentId = randomUUID()
  const taskId = randomUUID()

  await db.query<ProjectResourceDocumentIdRow>(
    `INSERT INTO project_resource_documents (
      id,
      project_id,
      project_resource_id,
      object_key,
      storage_provider,
      file_name,
      mime_type,
      file_size,
      page_count,
      parse_status,
      parse_error,
      parser_provider,
      parser_model,
      analysis_json,
      annotation_json,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, 0, 'queued', '', '', '', '{}'::JSONB, '{}'::JSONB, $9, $9, $10, $10
    )`,
    [
      documentId,
      input.projectId,
      input.projectResourceId,
      normalizeString(input.objectKey),
      normalizeString(input.storageProvider) || 'runtime',
      normalizeString(input.fileName),
      normalizeString(input.mimeType) || 'application/octet-stream',
      Math.max(0, Number(input.fileSize || 0)),
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `INSERT INTO project_resource_document_tasks (
      id,
      document_id,
      status,
      attempt,
      error_message,
      result_payload,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'queued', 0, '', '{}'::JSONB, $3, $3, $4, $4
    )`,
    [taskId, documentId, input.actorUserId, now],
  )

  return {
    documentId,
    taskId,
  }
}

export async function getProjectUploadedStorageUsageBytes(
  db: Queryable,
  projectId: string,
): Promise<number> {
  const result = await db.query<ProjectUploadStorageUsageRow>(
    `SELECT COALESCE(SUM(
      CASE
        WHEN COALESCE(metadata->>'fileSize', '') ~ '^[0-9]+$'
          THEN (metadata->>'fileSize')::BIGINT
        ELSE 0
      END
    ), 0)::TEXT AS used_bytes
     FROM project_resources
     WHERE project_id = $1
       AND status = 'active'
       AND source = 'upload'`,
    [projectId],
  )

  const usedBytes = Number(result.rows[0]?.used_bytes || 0)
  if (!Number.isFinite(usedBytes) || usedBytes <= 0)
    return 0
  return usedBytes
}

export async function getProjectUploadedFileRef(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectUploadedFileRef | null> {
  const result = await db.query<Pick<ProjectResourceRow, 'title' | 'mime_type' | 'metadata'>>(
    `SELECT
      title,
      mime_type,
      metadata
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
       AND source = 'upload'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  const metadata = parseResourceMetadata(row.metadata)
  const objectKey = normalizeString(metadata.objectKey)
  if (!objectKey)
    return null

  const fileName = normalizeString(metadata.fileName) || `${normalizeString(row.title) || 'resource'}.bin`
  const mimeType = normalizeString(row.mime_type) || normalizeString(metadata.mimeType) || 'application/octet-stream'

  return {
    objectKey,
    fileName,
    mimeType,
  }
}

export async function moveProjectResourceToRecycleBin(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
  },
): Promise<PurgedProjectResourceRef> {
  const now = new Date().toISOString()
  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'source' | 'metadata'>>(
    `UPDATE project_resources
     SET status = 'archived',
         updated_by_user_id = $3,
         updated_at = $4
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
     RETURNING id, source, metadata`,
    [input.projectId, input.resourceId, input.actorUserId, now],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('RESOURCE_NOT_FOUND')

  const metadata = parseResourceMetadata(row.metadata)

  return {
    resourceId: row.id,
    source: row.source,
    objectKey: row.source === 'upload' ? normalizeString(metadata.objectKey) : '',
  }
}

export async function restoreProjectResourceFromRecycleBin(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
  },
): Promise<Resource> {
  const now = new Date().toISOString()
  const result = await db.query<ProjectResourceRow>(
    `UPDATE project_resources
     SET status = 'active',
         updated_by_user_id = $3,
         updated_at = $4
     WHERE project_id = $1
       AND id = $2
       AND status = 'archived'
     RETURNING
       id,
       project_id,
       source,
       linked_contest_resource_id,
       title,
       mime_type,
       category,
       year,
       source_link,
       availability,
       summary,
       content,
       metadata,
       status,
       created_by_user_id,
       updated_by_user_id,
       created_at::TEXT,
       updated_at::TEXT`,
    [input.projectId, input.resourceId, input.actorUserId, now],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('RESOURCE_NOT_FOUND')

  return toResource(row)
}

export async function purgeProjectResourceFromRecycleBin(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<PurgedProjectResourceRef> {
  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'source' | 'metadata'>>(
    `DELETE FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'archived'
     RETURNING id, source, metadata`,
    [input.projectId, input.resourceId],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('RESOURCE_NOT_FOUND')

  const metadata = parseResourceMetadata(row.metadata)

  return {
    resourceId: row.id,
    source: row.source,
    objectKey: row.source === 'upload' ? normalizeString(metadata.objectKey) : '',
  }
}

export async function purgeExpiredProjectResourcesFromRecycleBin(
  db: Queryable,
  input: {
    projectId: string
    retentionDays?: number
  },
): Promise<PurgedProjectResourceRef[]> {
  const retentionDays = Math.max(1, Math.trunc(Number(input.retentionDays || PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS)))
  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'source' | 'metadata'>>(
    `DELETE FROM project_resources
     WHERE project_id = $1
       AND status = 'archived'
       AND updated_at <= (NOW() - ($2::TEXT || ' days')::INTERVAL)
     RETURNING id, source, metadata`,
    [input.projectId, retentionDays],
  )

  return result.rows.map((row) => {
    const metadata = parseResourceMetadata(row.metadata)
    return {
      resourceId: row.id,
      source: row.source,
      objectKey: row.source === 'upload' ? normalizeString(metadata.objectKey) : '',
    }
  })
}

export async function purgeExpiredProjectResourcesFromRecycleBinGlobal(
  db: Queryable,
  input?: {
    retentionDays?: number
    limit?: number
  },
): Promise<PurgedProjectResourceRef[]> {
  const retentionDays = Math.max(1, Math.trunc(Number(input?.retentionDays || PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS)))
  const limit = Math.max(20, Math.min(2000, Math.trunc(Number(input?.limit || 200))))
  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'source' | 'metadata'>>(
    `WITH expired AS (
      SELECT id
      FROM project_resources
      WHERE status = 'archived'
        AND updated_at <= (NOW() - ($1::TEXT || ' days')::INTERVAL)
      ORDER BY updated_at ASC
      LIMIT $2
    )
    DELETE FROM project_resources pr
    USING expired
    WHERE pr.id = expired.id
    RETURNING pr.id, pr.source, pr.metadata`,
    [retentionDays, limit],
  )

  return result.rows.map((row) => {
    const metadata = parseResourceMetadata(row.metadata)
    return {
      resourceId: row.id,
      source: row.source,
      objectKey: row.source === 'upload' ? normalizeString(metadata.objectKey) : '',
    }
  })
}
