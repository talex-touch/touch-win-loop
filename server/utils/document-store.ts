import type { Queryable } from '~~/server/utils/db'
import type {
  DocumentAnalysis,
  DocumentParseStatus,
  DocumentTaskStatus,
  ResourceDocument,
  ResourceDocumentTask,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ResourceDocumentRow {
  id: string
  contest_id: string
  resource_id: string
  object_key: string
  storage_provider: string
  file_name: string
  mime_type: string
  file_size: string
  page_count: number
  parse_status: DocumentParseStatus
  parse_error: string
  parser_provider: string
  parser_model: string
  analysis_json: unknown
  annotation_json: unknown
  created_at: string
  updated_at: string
}

interface ResourceDocumentTaskRow {
  id: string
  document_id: string
  status: DocumentTaskStatus
  attempt: number
  error_message: string
  result_payload: unknown
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

interface ResourceRefRow {
  id: string
  contest_id: string
  title: string
}

export interface DocumentTaskContext {
  task: ResourceDocumentTask
  document: ResourceDocument
  resource: {
    id: string
    contestId: string
    title: string
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function toDocumentAnalysis(value: unknown): DocumentAnalysis | null {
  const record = toRecord(value)
  if (Object.keys(record).length === 0)
    return null
  return record as unknown as DocumentAnalysis
}

function mapDocument(row: ResourceDocumentRow): ResourceDocument {
  return {
    id: row.id,
    contestId: row.contest_id,
    resourceId: row.resource_id,
    objectKey: row.object_key,
    storageProvider: row.storage_provider,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    pageCount: Number(row.page_count || 0),
    parseStatus: row.parse_status,
    parseError: row.parse_error || '',
    parserProvider: row.parser_provider || '',
    parserModel: row.parser_model || '',
    analysisJson: toDocumentAnalysis(row.analysis_json),
    annotationJson: toDocumentAnalysis(row.annotation_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTask(row: ResourceDocumentTaskRow): ResourceDocumentTask {
  return {
    id: row.id,
    documentId: row.document_id,
    status: row.status,
    attempt: Number(row.attempt || 0),
    errorMessage: row.error_message || '',
    resultPayload: toRecord(row.result_payload),
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createResourceDocumentWithTask(
  db: Queryable,
  input: {
    contestId: string
    resourceId: string
    objectKey: string
    storageProvider: string
    fileName: string
    mimeType: string
    fileSize: number
    pageCount: number
    actorUserId: string
  },
): Promise<{ document: ResourceDocument, task: ResourceDocumentTask }> {
  const documentId = randomUUID()
  const taskId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO contest_resource_documents (
      id,
      contest_id,
      resource_id,
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
      $1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', '', '', '', '{}'::JSONB, '{}'::JSONB, $10, $10, $11, $11
    )`,
    [
      documentId,
      input.contestId,
      input.resourceId,
      input.objectKey,
      input.storageProvider,
      input.fileName,
      input.mimeType,
      input.fileSize,
      input.pageCount,
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `INSERT INTO contest_resource_document_tasks (
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

  const [document, task] = await Promise.all([
    getResourceDocumentById(db, {
      documentId,
    }),
    getDocumentTaskById(db, {
      taskId,
    }),
  ])

  if (!document || !task)
    throw new Error('创建文档任务失败：记录不存在。')

  return { document, task }
}

export async function updateResourceSourceLinkByDocument(
  db: Queryable,
  input: {
    contestId: string
    resourceId: string
    url: string
    actorUserId: string
  },
): Promise<void> {
  await db.query(
    `UPDATE contest_resources
     SET url = $3,
         updated_by_user_id = $4,
         updated_at = NOW()
     WHERE id = $1
       AND contest_id = $2`,
    [input.resourceId, input.contestId, input.url, input.actorUserId],
  )
}

export async function getResourceDocumentById(
  db: Queryable,
  input: { documentId: string },
): Promise<ResourceDocument | null> {
  const result = await db.query<ResourceDocumentRow>(
    `SELECT
      id,
      contest_id,
      resource_id,
      object_key,
      storage_provider,
      file_name,
      mime_type,
      file_size::TEXT,
      page_count,
      parse_status,
      parse_error,
      parser_provider,
      parser_model,
      analysis_json,
      annotation_json,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_documents
     WHERE id = $1
     LIMIT 1`,
    [input.documentId],
  )
  return result.rows[0] ? mapDocument(result.rows[0]) : null
}

export async function getResourceDocumentByResourceId(
  db: Queryable,
  input: { contestId: string, resourceId: string },
): Promise<ResourceDocument | null> {
  const result = await db.query<ResourceDocumentRow>(
    `SELECT
      id,
      contest_id,
      resource_id,
      object_key,
      storage_provider,
      file_name,
      mime_type,
      file_size::TEXT,
      page_count,
      parse_status,
      parse_error,
      parser_provider,
      parser_model,
      analysis_json,
      annotation_json,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_documents
     WHERE contest_id = $1
       AND resource_id = $2
     LIMIT 1`,
    [input.contestId, input.resourceId],
  )
  return result.rows[0] ? mapDocument(result.rows[0]) : null
}

export async function getDocumentTaskById(
  db: Queryable,
  input: { taskId: string },
): Promise<ResourceDocumentTask | null> {
  const result = await db.query<ResourceDocumentTaskRow>(
    `SELECT
      id,
      document_id,
      status,
      attempt,
      error_message,
      result_payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_document_tasks
     WHERE id = $1
     LIMIT 1`,
    [input.taskId],
  )
  return result.rows[0] ? mapTask(result.rows[0]) : null
}

export async function getLatestDocumentTaskByDocumentId(
  db: Queryable,
  input: { documentId: string },
): Promise<ResourceDocumentTask | null> {
  const result = await db.query<ResourceDocumentTaskRow>(
    `SELECT
      id,
      document_id,
      status,
      attempt,
      error_message,
      result_payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_document_tasks
     WHERE document_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.documentId],
  )
  return result.rows[0] ? mapTask(result.rows[0]) : null
}

export async function saveDocumentAnnotation(
  db: Queryable,
  input: {
    documentId: string
    annotationJson: DocumentAnalysis
    actorUserId: string
  },
): Promise<ResourceDocument | null> {
  await db.query(
    `UPDATE contest_resource_documents
     SET annotation_json = $2::JSONB,
         updated_by_user_id = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [input.documentId, JSON.stringify(input.annotationJson), input.actorUserId],
  )
  return getResourceDocumentById(db, { documentId: input.documentId })
}

export async function enqueueDocumentTask(
  db: Queryable,
  input: {
    documentId: string
    actorUserId: string
  },
): Promise<ResourceDocumentTask> {
  const now = new Date().toISOString()
  const taskId = randomUUID()

  await db.query(
    `UPDATE contest_resource_documents
     SET parse_status = 'queued',
         parse_error = '',
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.documentId, input.actorUserId],
  )

  await db.query(
    `INSERT INTO contest_resource_document_tasks (
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
    [taskId, input.documentId, input.actorUserId, now],
  )

  const task = await getDocumentTaskById(db, {
    taskId,
  })
  if (!task)
    throw new Error('创建解析任务失败：任务不存在。')
  return task
}

export async function claimNextQueuedDocumentTask(
  db: Queryable,
): Promise<ResourceDocumentTask | null> {
  const result = await db.query<ResourceDocumentTaskRow>(
    `WITH picked AS (
      SELECT id
      FROM contest_resource_document_tasks
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE contest_resource_document_tasks t
    SET status = 'processing',
        attempt = t.attempt + 1,
        error_message = '',
        started_at = NOW(),
        finished_at = NULL,
        updated_at = NOW()
    FROM picked
    WHERE t.id = picked.id
    RETURNING
      t.id,
      t.document_id,
      t.status,
      t.attempt,
      t.error_message,
      t.result_payload,
      t.started_at::TEXT,
      t.finished_at::TEXT,
      t.created_at::TEXT,
      t.updated_at::TEXT`,
  )
  return result.rows[0] ? mapTask(result.rows[0]) : null
}

export async function setDocumentParseStatus(
  db: Queryable,
  input: {
    documentId: string
    parseStatus: DocumentParseStatus
    parseError?: string
    parserProvider?: string
    parserModel?: string
    analysisJson?: DocumentAnalysis
  },
): Promise<void> {
  await db.query(
    `UPDATE contest_resource_documents
     SET parse_status = $2,
         parse_error = $3,
         parser_provider = CASE WHEN $4::TEXT = '' THEN parser_provider ELSE $4 END,
         parser_model = CASE WHEN $5::TEXT = '' THEN parser_model ELSE $5 END,
         analysis_json = CASE WHEN $6::JSONB IS NULL THEN analysis_json ELSE $6::JSONB END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.documentId,
      input.parseStatus,
      input.parseError || '',
      input.parserProvider || '',
      input.parserModel || '',
      input.analysisJson ? JSON.stringify(input.analysisJson) : null,
    ],
  )
}

export async function updateDocumentPageCount(
  db: Queryable,
  input: {
    documentId: string
    pageCount: number
  },
): Promise<void> {
  await db.query(
    `UPDATE contest_resource_documents
     SET page_count = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.documentId, Math.max(0, Number(input.pageCount || 0))],
  )
}

export async function updateResourceDocumentFileAsset(
  db: Queryable,
  input: {
    documentId: string
    objectKey: string
    fileName: string
    mimeType: string
    fileSize: number
    actorUserId?: string
  },
): Promise<void> {
  await db.query(
    `UPDATE contest_resource_documents
     SET object_key = $2,
         file_name = $3,
         mime_type = $4,
         file_size = $5,
         updated_by_user_id = $6,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.documentId,
      input.objectKey,
      input.fileName,
      input.mimeType,
      Math.max(0, Number(input.fileSize || 0)),
      String(input.actorUserId || '').trim() || null,
    ],
  )
}

export async function listSucceededResourceDocumentsByContest(
  db: Queryable,
  input: {
    contestId: string
    limit?: number
  },
): Promise<ResourceDocument[]> {
  const limit = Math.max(1, Math.min(50, Number(input.limit || 8)))
  const result = await db.query<ResourceDocumentRow>(
    `SELECT
      id,
      contest_id,
      resource_id,
      object_key,
      storage_provider,
      file_name,
      mime_type,
      file_size::TEXT,
      page_count,
      parse_status,
      parse_error,
      parser_provider,
      parser_model,
      analysis_json,
      annotation_json,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resource_documents
     WHERE contest_id = $1
       AND parse_status = 'succeeded'
     ORDER BY updated_at DESC
     LIMIT $2`,
    [input.contestId, limit],
  )

  return result.rows.map(mapDocument)
}

export async function finishDocumentTaskSuccess(
  db: Queryable,
  input: {
    taskId: string
    documentId: string
    parserProvider: string
    parserModel: string
    analysisJson: DocumentAnalysis
    resultPayload?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE contest_resource_document_tasks
     SET status = 'succeeded',
         error_message = '',
         result_payload = $2::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.taskId, JSON.stringify(input.resultPayload || {})],
  )

  await setDocumentParseStatus(db, {
    documentId: input.documentId,
    parseStatus: 'succeeded',
    parseError: '',
    parserProvider: input.parserProvider,
    parserModel: input.parserModel,
    analysisJson: input.analysisJson,
  })
}

export async function finishDocumentTaskFailure(
  db: Queryable,
  input: {
    taskId: string
    documentId: string
    errorMessage: string
    resultPayload?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE contest_resource_document_tasks
     SET status = 'failed',
         error_message = $2,
         result_payload = $3::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.taskId, input.errorMessage, JSON.stringify(input.resultPayload || {})],
  )

  await setDocumentParseStatus(db, {
    documentId: input.documentId,
    parseStatus: 'failed',
    parseError: input.errorMessage,
  })
}

export async function getTaskContextById(
  db: Queryable,
  input: { taskId: string },
): Promise<DocumentTaskContext | null> {
  const task = await getDocumentTaskById(db, { taskId: input.taskId })
  if (!task)
    return null

  const document = await getResourceDocumentById(db, {
    documentId: task.documentId,
  })
  if (!document)
    return null

  const resourceResult = await db.query<ResourceRefRow>(
    `SELECT
      id,
      contest_id,
      title
     FROM contest_resources
     WHERE id = $1
     LIMIT 1`,
    [document.resourceId],
  )
  const row = resourceResult.rows[0]
  if (!row)
    return null

  return {
    task,
    document,
    resource: {
      id: row.id,
      contestId: row.contest_id,
      title: row.title,
    },
  }
}

export async function resetStaleDocumentTasks(
  db: Queryable,
  input: {
    staleMinutes: number
  },
): Promise<number> {
  const result = await db.query<{ id: string, document_id: string }>(
    `UPDATE contest_resource_document_tasks
     SET status = 'queued',
         error_message = '[worker] 检测到处理中断，已自动重试',
         updated_at = NOW()
     WHERE status = 'processing'
       AND (started_at IS NULL OR started_at < NOW() - ($1::TEXT || ' minutes')::INTERVAL)
     RETURNING id, document_id`,
    [String(Math.max(1, input.staleMinutes))],
  )

  const rowCount = Number(result.rowCount || 0)
  if (rowCount > 0) {
    const docIds = [...new Set(result.rows.map(row => row.document_id))]
    if (docIds.length > 0) {
      await db.query(
        `UPDATE contest_resource_documents
         SET parse_status = 'queued',
             parse_error = '[worker] 任务重置后等待重试',
             updated_at = NOW()
         WHERE id = ANY($1::TEXT[])`,
        [docIds],
      )
    }
  }

  return rowCount
}
