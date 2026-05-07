import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectResourceUploadSession,
  ProjectResourceUploadSessionStatus,
  ResourceAvailability,
  ResourceCategory,
  ResourcePreviewStatus,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ProjectResourceUploadSessionRow {
  id: string
  project_id: string
  parent_resource_id: string | null
  actor_user_id: string | null
  actor_username?: string | null
  actor_avatar_url?: string | null
  file_name: string
  mime_type: string
  file_size: number | string
  last_modified: number | string
  category: ResourceCategory
  access_level: ResourceAvailability
  title: string
  summary: string
  chunk_size: number | string
  chunk_count: number | string
  uploaded_bytes: number | string
  uploaded_chunk_count: number | string
  status: ProjectResourceUploadSessionStatus | string
  error_code: string | null
  error_message: string | null
  final_object_key: string | null
  final_storage_provider: string | null
  resource_id: string | null
  created_at: string
  updated_at: string
  expires_at: string
  completed_at: string | null
  preview_status?: string | null
}

interface ProjectResourceUploadChunkRow {
  session_id: string
  chunk_index: number | string
  chunk_size: number | string
  object_key: string
  checksum_sha256: string
  uploaded_at: string
}

interface NumberRow {
  value: string | number | null
}

const ACTIVE_UPLOAD_STATUSES: ProjectResourceUploadSessionStatus[] = [
  'queued',
  'uploading',
  'paused',
  'finalizing',
  'failed',
]

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toSafeInteger(value: unknown, fallback = 0): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return fallback
  return Math.max(0, Math.trunc(normalized))
}

function normalizeUploadStatus(value: unknown): ProjectResourceUploadSessionStatus {
  const normalized = normalizeString(value) as ProjectResourceUploadSessionStatus
  if (
    normalized === 'queued'
    || normalized === 'uploading'
    || normalized === 'paused'
    || normalized === 'finalizing'
    || normalized === 'completed'
    || normalized === 'failed'
    || normalized === 'canceled'
  ) {
    return normalized
  }
  return 'queued'
}

function normalizePreviewStatus(value: unknown): ResourcePreviewStatus | undefined {
  const normalized = normalizeString(value) as ResourcePreviewStatus
  if (
    normalized === 'queued'
    || normalized === 'converting'
    || normalized === 'finalizing'
    || normalized === 'succeeded'
    || normalized === 'failed'
  ) {
    return normalized
  }
  return undefined
}

function mapSession(row: ProjectResourceUploadSessionRow): ProjectResourceUploadSession {
  return {
    id: row.id,
    projectId: row.project_id,
    parentResourceId: normalizeString(row.parent_resource_id) || null,
    actorUserId: row.actor_user_id,
    actorUsername: normalizeString(row.actor_username) || undefined,
    actorAvatarUrl: normalizeString(row.actor_avatar_url) || null,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: toSafeInteger(row.file_size),
    lastModified: toSafeInteger(row.last_modified),
    category: row.category,
    accessLevel: row.access_level,
    title: row.title,
    summary: row.summary,
    chunkSize: toSafeInteger(row.chunk_size),
    chunkCount: Math.max(1, toSafeInteger(row.chunk_count, 1)),
    uploadedBytes: toSafeInteger(row.uploaded_bytes),
    uploadedChunkCount: toSafeInteger(row.uploaded_chunk_count),
    status: normalizeUploadStatus(row.status),
    errorCode: normalizeString(row.error_code) || undefined,
    errorMessage: normalizeString(row.error_message) || undefined,
    finalObjectKey: normalizeString(row.final_object_key) || undefined,
    finalStorageProvider: normalizeString(row.final_storage_provider) || undefined,
    resourceId: normalizeString(row.resource_id) || undefined,
    previewStatus: normalizePreviewStatus(row.preview_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
  }
}

export function buildProjectUploadChunkObjectKey(projectId: string, sessionId: string, chunkIndex: number): string {
  const safeProjectId = normalizeString(projectId) || 'unknown-project'
  const safeSessionId = normalizeString(sessionId) || randomUUID()
  const safeChunkIndex = Math.max(0, Math.trunc(Number(chunkIndex || 0)))
  return `uploads/project-${safeProjectId}/${safeSessionId}/chunks/${safeChunkIndex}`
}

export async function listProjectResourceUploadSessions(
  db: Queryable,
  input: {
    projectId: string
    limit?: number
  },
): Promise<ProjectResourceUploadSession[]> {
  const limit = Math.max(1, Math.min(100, toSafeInteger(input.limit, 50)))
  const result = await db.query<ProjectResourceUploadSessionRow>(
    `SELECT s.id,
            s.project_id,
            s.parent_resource_id,
            s.actor_user_id,
            u.username AS actor_username,
            u.avatar_url AS actor_avatar_url,
            s.file_name,
            s.mime_type,
            s.file_size,
            s.last_modified,
            s.category,
            s.access_level,
            s.title,
            s.summary,
            s.chunk_size,
            s.chunk_count,
            s.uploaded_bytes,
            s.uploaded_chunk_count,
            s.status,
            s.error_code,
            s.error_message,
            s.final_object_key,
            s.final_storage_provider,
            s.resource_id,
            s.created_at::TEXT,
            s.updated_at::TEXT,
            s.expires_at::TEXT,
            s.completed_at::TEXT,
            d.preview_status
       FROM project_resource_upload_sessions s
       LEFT JOIN users u
         ON u.id = s.actor_user_id
       LEFT JOIN project_resource_documents d
         ON d.project_resource_id = s.resource_id
      WHERE s.project_id = $1
        AND s.status <> 'canceled'
        AND (
          s.status IN ('queued', 'uploading', 'paused', 'finalizing', 'failed')
          OR s.updated_at >= NOW() - INTERVAL '7 days'
        )
      ORDER BY
        CASE
          WHEN s.status IN ('queued', 'uploading', 'paused', 'finalizing', 'failed') THEN 0
          ELSE 1
        END,
        s.updated_at DESC
      LIMIT $2`,
    [normalizeString(input.projectId), limit],
  )
  return result.rows.map(mapSession)
}

export async function getProjectResourceUploadReservedBytes(
  db: Queryable,
  input: {
    projectId: string
  },
): Promise<number> {
  const result = await db.query<NumberRow>(
    `SELECT COALESCE(SUM(file_size), 0) AS value
       FROM project_resource_upload_sessions
      WHERE project_id = $1
        AND status = ANY($2::TEXT[])
        AND expires_at > NOW()`,
    [normalizeString(input.projectId), ACTIVE_UPLOAD_STATUSES],
  )
  return toSafeInteger(result.rows[0]?.value)
}

export async function createProjectResourceUploadSessions(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    chunkSize: number
    expiresAt: string
    storageProvider?: string
    files: Array<{
      fileName: string
      mimeType: string
      fileSize: number
      lastModified: number
      category: ResourceCategory
      accessLevel: ResourceAvailability
      title?: string
      summary?: string
      parentResourceId?: string | null
    }>
  },
): Promise<ProjectResourceUploadSession[]> {
  const created: ProjectResourceUploadSession[] = []

  for (const file of input.files) {
    const sessionId = randomUUID()
    const chunkSize = Math.max(1, toSafeInteger(input.chunkSize, 1))
    const fileSize = Math.max(0, toSafeInteger(file.fileSize))
    const chunkCount = Math.max(1, Math.ceil(fileSize / chunkSize))
    const result = await db.query<ProjectResourceUploadSessionRow>(
      `INSERT INTO project_resource_upload_sessions (
        id,
        project_id,
        parent_resource_id,
        actor_user_id,
        file_name,
        mime_type,
        file_size,
        last_modified,
        category,
        access_level,
        title,
        summary,
        chunk_size,
        chunk_count,
        uploaded_bytes,
        uploaded_chunk_count,
        status,
        error_code,
        error_message,
        final_object_key,
        final_storage_provider,
        resource_id,
        expires_at,
        completed_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, 0, 0, 'queued', '', '', '', $15, NULL, $16, NULL, NOW(), NOW()
      )
      RETURNING
        id,
        project_id,
        parent_resource_id,
        actor_user_id,
        file_name,
        mime_type,
        file_size,
        last_modified,
        category,
        access_level,
        title,
        summary,
        chunk_size,
        chunk_count,
        uploaded_bytes,
        uploaded_chunk_count,
        status,
        error_code,
        error_message,
        final_object_key,
        final_storage_provider,
        resource_id,
        created_at::TEXT,
        updated_at::TEXT,
        expires_at::TEXT,
        completed_at::TEXT`,
      [
        sessionId,
        normalizeString(input.projectId),
        normalizeString(file.parentResourceId) || null,
        normalizeString(input.actorUserId),
        normalizeString(file.fileName),
        normalizeString(file.mimeType) || 'application/octet-stream',
        fileSize,
        toSafeInteger(file.lastModified),
        file.category,
        file.accessLevel,
        normalizeString(file.title),
        normalizeString(file.summary),
        chunkSize,
        chunkCount,
        normalizeString(input.storageProvider),
        input.expiresAt,
      ],
    )
    created.push(mapSession(result.rows[0]!))
  }

  return created
}

export async function getProjectResourceUploadSessionById(
  db: Queryable,
  input: {
    projectId: string
    sessionId: string
    forUpdate?: boolean
  },
): Promise<ProjectResourceUploadSession | null> {
  const result = await db.query<ProjectResourceUploadSessionRow>(
    `SELECT s.id,
            s.project_id,
            s.parent_resource_id,
            s.actor_user_id,
            u.username AS actor_username,
            u.avatar_url AS actor_avatar_url,
            s.file_name,
            s.mime_type,
            s.file_size,
            s.last_modified,
            s.category,
            s.access_level,
            s.title,
            s.summary,
            s.chunk_size,
            s.chunk_count,
            s.uploaded_bytes,
            s.uploaded_chunk_count,
            s.status,
            s.error_code,
            s.error_message,
            s.final_object_key,
            s.final_storage_provider,
            s.resource_id,
            s.created_at::TEXT,
            s.updated_at::TEXT,
            s.expires_at::TEXT,
            s.completed_at::TEXT,
            d.preview_status
       FROM project_resource_upload_sessions s
       LEFT JOIN users u
         ON u.id = s.actor_user_id
       LEFT JOIN project_resource_documents d
         ON d.project_resource_id = s.resource_id
      WHERE s.project_id = $1
        AND s.id = $2
      LIMIT 1
      ${input.forUpdate ? 'FOR UPDATE OF s' : ''}`,
    [normalizeString(input.projectId), normalizeString(input.sessionId)],
  )
  return result.rows[0] ? mapSession(result.rows[0]) : null
}

export async function listProjectResourceUploadChunkRows(
  db: Queryable,
  input: {
    sessionId: string
  },
): Promise<ProjectResourceUploadChunkRow[]> {
  const result = await db.query<ProjectResourceUploadChunkRow>(
    `SELECT session_id,
            chunk_index,
            chunk_size,
            object_key,
            checksum_sha256,
            uploaded_at::TEXT
       FROM project_resource_upload_chunks
      WHERE session_id = $1
      ORDER BY chunk_index ASC`,
    [normalizeString(input.sessionId)],
  )
  return result.rows
}

export async function upsertProjectResourceUploadChunk(
  db: Queryable,
  input: {
    sessionId: string
    chunkIndex: number
    chunkSize: number
    objectKey: string
    checksumSha256: string
  },
): Promise<ProjectResourceUploadSession> {
  await db.query(
    `INSERT INTO project_resource_upload_chunks (
      session_id,
      chunk_index,
      chunk_size,
      object_key,
      checksum_sha256,
      uploaded_at
    ) VALUES (
      $1, $2, $3, $4, $5, NOW()
    )
    ON CONFLICT (session_id, chunk_index)
    DO UPDATE SET
      chunk_size = EXCLUDED.chunk_size,
      object_key = EXCLUDED.object_key,
      checksum_sha256 = EXCLUDED.checksum_sha256,
      uploaded_at = NOW()`,
    [
      normalizeString(input.sessionId),
      Math.max(0, toSafeInteger(input.chunkIndex)),
      Math.max(0, toSafeInteger(input.chunkSize)),
      normalizeString(input.objectKey),
      normalizeString(input.checksumSha256),
    ],
  )

  const result = await db.query<ProjectResourceUploadSessionRow>(
    `UPDATE project_resource_upload_sessions session
        SET uploaded_bytes = stats.total_bytes,
            uploaded_chunk_count = stats.total_chunks,
            status = CASE
              WHEN session.status IN ('queued', 'failed') THEN 'uploading'
              ELSE session.status
            END,
            error_code = '',
            error_message = '',
            updated_at = NOW()
       FROM (
         SELECT session_id,
                COALESCE(SUM(chunk_size), 0) AS total_bytes,
                COUNT(*) AS total_chunks
           FROM project_resource_upload_chunks
          WHERE session_id = $1
          GROUP BY session_id
       ) AS stats
      WHERE session.id = stats.session_id
      RETURNING
        session.id,
        session.project_id,
        session.parent_resource_id,
        session.actor_user_id,
        session.file_name,
        session.mime_type,
        session.file_size,
        session.last_modified,
        session.category,
        session.access_level,
        session.title,
        session.summary,
        session.chunk_size,
        session.chunk_count,
        session.uploaded_bytes,
        session.uploaded_chunk_count,
        session.status,
        session.error_code,
        session.error_message,
        session.final_object_key,
        session.final_storage_provider,
        session.resource_id,
        session.created_at::TEXT,
        session.updated_at::TEXT,
        session.expires_at::TEXT,
        session.completed_at::TEXT`,
    [normalizeString(input.sessionId)],
  )

  return mapSession(result.rows[0]!)
}

export async function updateProjectResourceUploadSessionStatus(
  db: Queryable,
  input: {
    projectId: string
    sessionId: string
    fromStatuses?: ProjectResourceUploadSessionStatus[]
    toStatus: ProjectResourceUploadSessionStatus
    clearError?: boolean
  },
): Promise<ProjectResourceUploadSession | null> {
  const values: unknown[] = [
    normalizeString(input.projectId),
    normalizeString(input.sessionId),
    input.toStatus,
  ]

  let fromSql = ''
  if (input.fromStatuses?.length) {
    values.push(input.fromStatuses)
    fromSql = ` AND status = ANY($${values.length}::TEXT[])`
  }

  const result = await db.query<ProjectResourceUploadSessionRow>(
    `UPDATE project_resource_upload_sessions
        SET status = $3,
            error_code = CASE WHEN ${input.clearError ? 'TRUE' : 'FALSE'} THEN '' ELSE error_code END,
            error_message = CASE WHEN ${input.clearError ? 'TRUE' : 'FALSE'} THEN '' ELSE error_message END,
            updated_at = NOW()
      WHERE project_id = $1
        AND id = $2
        ${fromSql}
      RETURNING
        id,
        project_id,
        parent_resource_id,
        actor_user_id,
        file_name,
        mime_type,
        file_size,
        last_modified,
        category,
        access_level,
        title,
        summary,
        chunk_size,
        chunk_count,
        uploaded_bytes,
        uploaded_chunk_count,
        status,
        error_code,
        error_message,
        final_object_key,
        final_storage_provider,
        resource_id,
        created_at::TEXT,
        updated_at::TEXT,
        expires_at::TEXT,
        completed_at::TEXT`,
    values,
  )
  return result.rows[0] ? mapSession(result.rows[0]) : null
}

export async function markProjectResourceUploadSessionFailed(
  db: Queryable,
  input: {
    projectId: string
    sessionId: string
    errorCode?: string
    errorMessage: string
  },
): Promise<ProjectResourceUploadSession | null> {
  const result = await db.query<ProjectResourceUploadSessionRow>(
    `UPDATE project_resource_upload_sessions
        SET status = 'failed',
            error_code = $3,
            error_message = $4,
            updated_at = NOW()
      WHERE project_id = $1
        AND id = $2
      RETURNING
        id,
        project_id,
        parent_resource_id,
        actor_user_id,
        file_name,
        mime_type,
        file_size,
        last_modified,
        category,
        access_level,
        title,
        summary,
        chunk_size,
        chunk_count,
        uploaded_bytes,
        uploaded_chunk_count,
        status,
        error_code,
        error_message,
        final_object_key,
        final_storage_provider,
        resource_id,
        created_at::TEXT,
        updated_at::TEXT,
        expires_at::TEXT,
        completed_at::TEXT`,
    [
      normalizeString(input.projectId),
      normalizeString(input.sessionId),
      normalizeString(input.errorCode),
      normalizeString(input.errorMessage),
    ],
  )
  return result.rows[0] ? mapSession(result.rows[0]) : null
}

export async function markProjectResourceUploadSessionCompleted(
  db: Queryable,
  input: {
    projectId: string
    sessionId: string
    resourceId: string
    finalObjectKey: string
    finalStorageProvider: string
  },
): Promise<ProjectResourceUploadSession | null> {
  const result = await db.query<ProjectResourceUploadSessionRow>(
    `UPDATE project_resource_upload_sessions
        SET status = 'completed',
            resource_id = $3,
            final_object_key = $4,
            final_storage_provider = $5,
            error_code = '',
            error_message = '',
            completed_at = NOW(),
            updated_at = NOW()
      WHERE project_id = $1
        AND id = $2
      RETURNING
        id,
        project_id,
        parent_resource_id,
        actor_user_id,
        file_name,
        mime_type,
        file_size,
        last_modified,
        category,
        access_level,
        title,
        summary,
        chunk_size,
        chunk_count,
        uploaded_bytes,
        uploaded_chunk_count,
        status,
        error_code,
        error_message,
        final_object_key,
        final_storage_provider,
        resource_id,
        created_at::TEXT,
        updated_at::TEXT,
        expires_at::TEXT,
        completed_at::TEXT`,
    [
      normalizeString(input.projectId),
      normalizeString(input.sessionId),
      normalizeString(input.resourceId),
      normalizeString(input.finalObjectKey),
      normalizeString(input.finalStorageProvider),
    ],
  )
  return result.rows[0] ? mapSession(result.rows[0]) : null
}

export async function expireProjectResourceUploadSessions(
  db: Queryable,
  input: {
    projectId: string
  },
): Promise<string[]> {
  const expired = await db.query<{ id: string }>(
    `SELECT id
       FROM project_resource_upload_sessions
      WHERE project_id = $1
        AND status = ANY($2::TEXT[])
        AND expires_at <= NOW()`,
    [normalizeString(input.projectId), ACTIVE_UPLOAD_STATUSES],
  )
  const sessionIds = expired.rows.map(row => normalizeString(row.id)).filter(Boolean)
  if (!sessionIds.length)
    return []

  const chunkRows = await db.query<{ object_key: string }>(
    `SELECT object_key
       FROM project_resource_upload_chunks
      WHERE session_id = ANY($1::TEXT[])`,
    [sessionIds],
  )

  await db.query(
    `UPDATE project_resource_upload_sessions
        SET status = 'canceled',
            error_code = 'SESSION_EXPIRED',
            error_message = '上传会话已过期，请重新发起上传。',
            updated_at = NOW()
      WHERE id = ANY($1::TEXT[])`,
    [sessionIds],
  )

  return chunkRows.rows
    .map(row => normalizeString(row.object_key))
    .filter(Boolean)
}
