import type { Queryable } from '~~/server/utils/db'
import type { DocumentAnalysis } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { buildProjectResourceSignedUrls } from '~~/server/utils/project-resource-access-url'

export type ProjectPreviewStatus = 'queued' | 'converting' | 'finalizing' | 'succeeded' | 'failed'
export type ProjectPreviewStage = ProjectPreviewStatus
export type ProjectDocumentTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed'

interface ProjectResourceDocumentRow {
  id: string
  project_id: string
  project_resource_id: string
  object_key: string
  source_object_key: string
  preview_object_key: string
  storage_provider: string
  source_storage_provider: string
  preview_storage_provider: string
  file_name: string
  source_file_name: string
  preview_file_name: string
  mime_type: string
  source_mime_type: string
  preview_mime_type: string
  file_size: string
  source_file_size: string
  preview_file_size: string
  page_count: number
  parse_status: 'queued' | 'processing' | 'succeeded' | 'failed'
  parse_error: string
  preview_status: ProjectPreviewStatus
  preview_stage: ProjectPreviewStage
  preview_progress_percent: number
  preview_eta_seconds: number
  preview_error: string
  queued_at: string | null
  started_at: string | null
  finished_at: string | null
  last_attempt_duration_ms: number
  total_attempt_duration_ms: number
  created_at: string
  updated_at: string
}

interface ProjectResourceDocumentTaskRow {
  id: string
  document_id: string
  task_type: string
  provider: string
  stage: ProjectPreviewStage
  eta_seconds: number
  status: ProjectDocumentTaskStatus
  attempt: number
  error_message: string
  result_payload: unknown
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface ProjectResourceDocument {
  id: string
  projectId: string
  projectResourceId: string
  objectKey: string
  sourceObjectKey: string
  previewObjectKey: string
  storageProvider: string
  sourceStorageProvider: string
  previewStorageProvider: string
  fileName: string
  sourceFileName: string
  previewFileName: string
  mimeType: string
  sourceMimeType: string
  previewMimeType: string
  fileSize: number
  sourceFileSize: number
  previewFileSize: number
  pageCount: number
  previewStatus: ProjectPreviewStatus
  previewStage: ProjectPreviewStage
  previewProgressPercent: number
  previewEtaSeconds: number
  previewError: string
  parseStatus: 'queued' | 'processing' | 'succeeded' | 'failed'
  parseError: string
  queuedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  lastAttemptDurationMs: number
  totalAttemptDurationMs: number
  createdAt: string
  updatedAt: string
}

export interface ProjectResourceDocumentTask {
  id: string
  documentId: string
  taskType: string
  provider: string
  stage: ProjectPreviewStage
  etaSeconds: number
  status: ProjectDocumentTaskStatus
  attempt: number
  errorMessage: string
  resultPayload: Record<string, unknown>
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectPreviewStatusPayload {
  documentId: string
  status: ProjectPreviewStatus
  stage: ProjectPreviewStage
  progressPercent: number
  etaSeconds: number
  queuePosition: number
  attempt: number
  error: string
  previewUrl: string
  previewUrlExpiresAt: string
  sourceDownloadUrl: string
  sourceDownloadUrlExpiresAt: string
}

export interface ProjectFileRef {
  objectKey: string
  storageProvider: string
  fileName: string
  mimeType: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeDocumentAnalysis(value: unknown): DocumentAnalysis | null {
  const source = normalizeRecord(value)
  const pages = Array.isArray(source.pages) ? source.pages : []
  if (pages.length === 0)
    return null
  return {
    version: normalizeString(source.version) || 'v1',
    source: normalizeString(source.source) || 'unknown',
    pages: pages.map((pageItem, index) => {
      const page = normalizeRecord(pageItem)
      return {
        page: Math.max(1, toNumber(page.page, index + 1)),
        width: Math.max(0, toNumber(page.width, 1)),
        height: Math.max(0, toNumber(page.height, 1)),
        blocks: Array.isArray(page.blocks) ? page.blocks as DocumentAnalysis['pages'][number]['blocks'] : [],
        fields: Array.isArray(page.fields) ? page.fields as DocumentAnalysis['pages'][number]['fields'] : [],
      }
    }),
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed))
    return parsed
  return fallback
}

function toLegacyParseStatus(status: ProjectPreviewStatus): 'queued' | 'processing' | 'succeeded' | 'failed' {
  if (status === 'converting' || status === 'finalizing')
    return 'processing'
  return status
}

function isPdfByNameOrMime(fileName: string, mimeType: string): boolean {
  const normalizedName = normalizeString(fileName).toLowerCase()
  if (normalizedName.endsWith('.pdf'))
    return true
  return normalizeString(mimeType).toLowerCase().includes('pdf')
}

const IMAGE_PREVIEW_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.svg',
  '.avif',
  '.heic',
  '.heif',
])

function isImageByNameOrMime(fileName: string, mimeType: string): boolean {
  const normalizedMime = normalizeString(mimeType).toLowerCase()
  if (normalizedMime.startsWith('image/'))
    return true

  const normalizedName = normalizeString(fileName).toLowerCase()
  const dotIndex = normalizedName.lastIndexOf('.')
  const extension = dotIndex >= 0 ? normalizedName.slice(dotIndex) : ''
  return IMAGE_PREVIEW_EXTENSIONS.has(extension)
}

const ONLYOFFICE_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
])

export function isOnlyOfficeConvertible(fileName: string, mimeType: string): boolean {
  const normalizedName = normalizeString(fileName).toLowerCase()
  const dotIndex = normalizedName.lastIndexOf('.')
  const extension = dotIndex >= 0 ? normalizedName.slice(dotIndex) : ''
  if (ONLYOFFICE_EXTENSIONS.has(extension))
    return true

  const normalizedMime = normalizeString(mimeType).toLowerCase()
  return normalizedMime.includes('word')
    || normalizedMime.includes('excel')
    || normalizedMime.includes('spreadsheet')
    || normalizedMime.includes('presentation')
    || normalizedMime.includes('powerpoint')
    || normalizedMime.includes('officedocument')
}

function mapDocument(row: ProjectResourceDocumentRow): ProjectResourceDocument {
  const document: ProjectResourceDocument = {
    id: row.id,
    projectId: row.project_id,
    projectResourceId: row.project_resource_id,
    objectKey: row.object_key,
    sourceObjectKey: row.source_object_key,
    previewObjectKey: row.preview_object_key,
    storageProvider: row.storage_provider,
    sourceStorageProvider: row.source_storage_provider,
    previewStorageProvider: row.preview_storage_provider,
    fileName: row.file_name,
    sourceFileName: row.source_file_name,
    previewFileName: row.preview_file_name,
    mimeType: row.mime_type,
    sourceMimeType: row.source_mime_type,
    previewMimeType: row.preview_mime_type,
    fileSize: toNumber(row.file_size, 0),
    sourceFileSize: toNumber(row.source_file_size, 0),
    previewFileSize: toNumber(row.preview_file_size, 0),
    pageCount: Math.max(0, toNumber(row.page_count, 0)),
    previewStatus: row.preview_status,
    previewStage: row.preview_stage,
    previewProgressPercent: Math.max(0, Math.min(100, toNumber(row.preview_progress_percent, 0))),
    previewEtaSeconds: Math.max(0, toNumber(row.preview_eta_seconds, 0)),
    previewError: normalizeString(row.preview_error),
    parseStatus: row.parse_status,
    parseError: normalizeString(row.parse_error),
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    lastAttemptDurationMs: Math.max(0, toNumber(row.last_attempt_duration_ms, 0)),
    totalAttemptDurationMs: Math.max(0, toNumber(row.total_attempt_duration_ms, 0)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  if (!isImageByNameOrMime(document.sourceFileName || document.fileName, document.sourceMimeType || document.mimeType))
    return document

  return {
    ...document,
    previewObjectKey: normalizeString(document.previewObjectKey) || normalizeString(document.sourceObjectKey) || normalizeString(document.objectKey),
    previewStorageProvider: normalizeString(document.previewStorageProvider || document.sourceStorageProvider || document.storageProvider) || 'local',
    previewFileName: normalizeString(document.previewFileName || document.sourceFileName || document.fileName) || 'image',
    previewMimeType: normalizeString(document.previewMimeType).startsWith('image/')
      ? normalizeString(document.previewMimeType)
      : (normalizeString(document.sourceMimeType || document.mimeType) || 'application/octet-stream'),
    previewFileSize: document.previewFileSize > 0
      ? document.previewFileSize
      : Math.max(0, document.sourceFileSize || document.fileSize),
    previewStatus: 'succeeded',
    previewStage: 'succeeded',
    previewProgressPercent: 100,
    previewEtaSeconds: 0,
    previewError: '',
  }
}

function mapTask(row: ProjectResourceDocumentTaskRow): ProjectResourceDocumentTask {
  return {
    id: row.id,
    documentId: row.document_id,
    taskType: normalizeString(row.task_type) || 'convert_preview_pdf',
    provider: normalizeString(row.provider) || 'onlyoffice',
    stage: row.stage,
    etaSeconds: Math.max(0, toNumber(row.eta_seconds, 0)),
    status: row.status,
    attempt: Math.max(0, toNumber(row.attempt, 0)),
    errorMessage: normalizeString(row.error_message),
    resultPayload: normalizeRecord(row.result_payload),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createProjectPreviewDocumentWithTask(
  db: Queryable,
  input: {
    projectId: string
    projectResourceId: string
    sourceObjectKey: string
    sourceStorageProvider: string
    sourceFileName: string
    sourceMimeType: string
    sourceFileSize: number
    actorUserId: string
  },
): Promise<{ document: ProjectResourceDocument, task: ProjectResourceDocumentTask | null }> {
  const now = new Date().toISOString()
  const documentId = randomUUID()
  const sourceFileName = normalizeString(input.sourceFileName)
  const sourceMimeType = normalizeString(input.sourceMimeType) || 'application/octet-stream'
  const sourceFileSize = Math.max(0, toNumber(input.sourceFileSize, 0))
  const sourceObjectKey = normalizeString(input.sourceObjectKey)
  const sourceStorageProvider = normalizeString(input.sourceStorageProvider) || 'local'

  const isPdf = isPdfByNameOrMime(sourceFileName, sourceMimeType)
  const isImage = isImageByNameOrMime(sourceFileName, sourceMimeType)
  const canConvert = isOnlyOfficeConvertible(sourceFileName, sourceMimeType)

  const previewStatus: ProjectPreviewStatus = isPdf || isImage
    ? 'succeeded'
    : canConvert
      ? 'queued'
      : 'failed'
  const previewStage: ProjectPreviewStage = previewStatus
  const previewProgressPercent = previewStatus === 'succeeded' || previewStatus === 'failed' ? 100 : 0
  const previewError = canConvert || isPdf || isImage ? '' : 'UNSUPPORTED_CONVERSION_TYPE'

  const previewObjectKey = isPdf || isImage ? sourceObjectKey : ''
  const previewStorageProvider = isPdf || isImage ? sourceStorageProvider : sourceStorageProvider
  const previewFileName = isPdf || isImage ? sourceFileName : ''
  const previewMimeType = isPdf
    ? 'application/pdf'
    : isImage
      ? sourceMimeType
      : 'application/pdf'
  const previewFileSize = isPdf || isImage ? sourceFileSize : 0

  await db.query(
    `INSERT INTO project_resource_documents (
      id,
      project_id,
      project_resource_id,
      object_key,
      source_object_key,
      preview_object_key,
      storage_provider,
      source_storage_provider,
      preview_storage_provider,
      file_name,
      source_file_name,
      preview_file_name,
      mime_type,
      source_mime_type,
      preview_mime_type,
      file_size,
      source_file_size,
      preview_file_size,
      page_count,
      parse_status,
      parse_error,
      preview_status,
      preview_stage,
      preview_progress_percent,
      preview_eta_seconds,
      preview_error,
      queued_at,
      started_at,
      finished_at,
      parser_provider,
      parser_model,
      analysis_json,
      annotation_json,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15,
      $16, $17, $18, 0, $19, $20, $21, $22, $23, 0, $24,
      $25, NULL, $26, '', '', '{}'::JSONB, '{}'::JSONB, $27, $27, $28, $28
    )`,
    [
      documentId,
      input.projectId,
      input.projectResourceId,
      sourceObjectKey,
      sourceObjectKey,
      previewObjectKey,
      sourceStorageProvider,
      sourceStorageProvider,
      previewStorageProvider,
      sourceFileName,
      sourceFileName,
      previewFileName,
      sourceMimeType,
      sourceMimeType,
      previewMimeType,
      sourceFileSize,
      sourceFileSize,
      previewFileSize,
      toLegacyParseStatus(previewStatus),
      previewError,
      previewStatus,
      previewStage,
      previewProgressPercent,
      previewError,
      previewStatus === 'queued' ? now : null,
      previewStatus === 'succeeded' || previewStatus === 'failed' ? now : null,
      input.actorUserId,
      now,
    ],
  )

  let task: ProjectResourceDocumentTask | null = null
  if (previewStatus === 'queued') {
    const taskId = randomUUID()
    await db.query(
      `INSERT INTO project_resource_document_tasks (
        id,
        document_id,
        task_type,
        provider,
        stage,
        eta_seconds,
        status,
        attempt,
        error_message,
        result_payload,
        started_at,
        finished_at,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, 'convert_preview_pdf', 'onlyoffice', 'queued', 0, 'queued', 0, '', '{}'::JSONB, NULL, NULL, $3, $3, $4, $4
      )`,
      [taskId, documentId, input.actorUserId, now],
    )
    task = await getProjectDocumentTaskById(db, { taskId })
  }

  const document = await getProjectResourceDocumentById(db, { documentId })
  if (!document)
    throw new Error('PROJECT_RESOURCE_DOCUMENT_CREATE_FAILED')

  return { document, task }
}

export async function getProjectResourceDocumentById(
  db: Queryable,
  input: { documentId: string },
): Promise<ProjectResourceDocument | null> {
  const result = await db.query<ProjectResourceDocumentRow>(
    `SELECT
      id,
      project_id,
      project_resource_id,
      object_key,
      source_object_key,
      preview_object_key,
      storage_provider,
      source_storage_provider,
      preview_storage_provider,
      file_name,
      source_file_name,
      preview_file_name,
      mime_type,
      source_mime_type,
      preview_mime_type,
      file_size::TEXT,
      source_file_size::TEXT,
      preview_file_size::TEXT,
      page_count,
      parse_status,
      parse_error,
      preview_status,
      preview_stage,
      preview_progress_percent,
      preview_eta_seconds,
      preview_error,
      queued_at::TEXT,
      started_at::TEXT,
      finished_at::TEXT,
      last_attempt_duration_ms,
      total_attempt_duration_ms,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resource_documents
     WHERE id = $1
     LIMIT 1`,
    [input.documentId],
  )

  return result.rows[0] ? mapDocument(result.rows[0]) : null
}

export async function getProjectResourceDocumentByResourceId(
  db: Queryable,
  input: { projectId: string, resourceId: string },
): Promise<ProjectResourceDocument | null> {
  const result = await db.query<ProjectResourceDocumentRow>(
    `SELECT
      id,
      project_id,
      project_resource_id,
      object_key,
      source_object_key,
      preview_object_key,
      storage_provider,
      source_storage_provider,
      preview_storage_provider,
      file_name,
      source_file_name,
      preview_file_name,
      mime_type,
      source_mime_type,
      preview_mime_type,
      file_size::TEXT,
      source_file_size::TEXT,
      preview_file_size::TEXT,
      page_count,
      parse_status,
      parse_error,
      preview_status,
      preview_stage,
      preview_progress_percent,
      preview_eta_seconds,
      preview_error,
      queued_at::TEXT,
      started_at::TEXT,
      finished_at::TEXT,
      last_attempt_duration_ms,
      total_attempt_duration_ms,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resource_documents
     WHERE project_id = $1
       AND project_resource_id = $2
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  return result.rows[0] ? mapDocument(result.rows[0]) : null
}

export async function getProjectResourceDocumentAnalysisByResourceId(
  db: Queryable,
  input: { projectId: string, resourceId: string },
): Promise<{ document: ProjectResourceDocument, analysis: DocumentAnalysis | null } | null> {
  const result = await db.query<ProjectResourceDocumentRow & { analysis_json: unknown }>(
    `SELECT
      id,
      project_id,
      project_resource_id,
      object_key,
      source_object_key,
      preview_object_key,
      storage_provider,
      source_storage_provider,
      preview_storage_provider,
      file_name,
      source_file_name,
      preview_file_name,
      mime_type,
      source_mime_type,
      preview_mime_type,
      file_size::TEXT,
      source_file_size::TEXT,
      preview_file_size::TEXT,
      page_count,
      parse_status,
      parse_error,
      preview_status,
      preview_stage,
      preview_progress_percent,
      preview_eta_seconds,
      preview_error,
      queued_at::TEXT,
      started_at::TEXT,
      finished_at::TEXT,
      last_attempt_duration_ms,
      total_attempt_duration_ms,
      created_at::TEXT,
      updated_at::TEXT,
      analysis_json
     FROM project_resource_documents
     WHERE project_id = $1
       AND project_resource_id = $2
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  return {
    document: mapDocument(row),
    analysis: normalizeDocumentAnalysis(row.analysis_json),
  }
}

export async function updateProjectResourceDocumentAnalysis(
  db: Queryable,
  input: {
    documentId: string
    analysis: DocumentAnalysis
    pageCount: number
    actorUserId: string
  },
): Promise<void> {
  await db.query(
    `UPDATE project_resource_documents
     SET analysis_json = $2::JSONB,
         page_count = $3,
         parse_status = 'succeeded',
         parse_error = '',
         updated_by_user_id = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.documentId,
      JSON.stringify(input.analysis),
      Math.max(0, Math.trunc(Number(input.pageCount || input.analysis.pages.length || 0))),
      input.actorUserId,
    ],
  )
}

export async function getProjectDocumentTaskById(
  db: Queryable,
  input: { taskId: string },
): Promise<ProjectResourceDocumentTask | null> {
  const result = await db.query<ProjectResourceDocumentTaskRow>(
    `SELECT
      id,
      document_id,
      task_type,
      provider,
      stage,
      eta_seconds,
      status,
      attempt,
      error_message,
      result_payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resource_document_tasks
     WHERE id = $1
     LIMIT 1`,
    [input.taskId],
  )
  return result.rows[0] ? mapTask(result.rows[0]) : null
}

export async function getLatestProjectDocumentTaskByDocumentId(
  db: Queryable,
  input: { documentId: string },
): Promise<ProjectResourceDocumentTask | null> {
  const result = await db.query<ProjectResourceDocumentTaskRow>(
    `SELECT
      id,
      document_id,
      task_type,
      provider,
      stage,
      eta_seconds,
      status,
      attempt,
      error_message,
      result_payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resource_document_tasks
     WHERE document_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.documentId],
  )
  return result.rows[0] ? mapTask(result.rows[0]) : null
}

export async function claimNextQueuedProjectDocumentTask(
  db: Queryable,
): Promise<ProjectResourceDocumentTask | null> {
  const result = await db.query<ProjectResourceDocumentTaskRow>(
    `WITH picked AS (
      SELECT id
      FROM project_resource_document_tasks
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE project_resource_document_tasks t
    SET status = 'processing',
        stage = 'converting',
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
      t.task_type,
      t.provider,
      t.stage,
      t.eta_seconds,
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

export async function setProjectDocumentPreviewState(
  db: Queryable,
  input: {
    documentId: string
    status: ProjectPreviewStatus
    stage: ProjectPreviewStage
    progressPercent: number
    etaSeconds?: number
    error?: string
    startedAt?: string | null
    finishedAt?: string | null
  },
): Promise<void> {
  const progressPercent = Math.max(0, Math.min(100, Math.round(toNumber(input.progressPercent, 0))))
  const etaSeconds = Math.max(0, Math.round(toNumber(input.etaSeconds, 0)))
  const status = input.status
  const stage = input.stage
  const error = normalizeString(input.error)

  await db.query(
    `UPDATE project_resource_documents
     SET preview_status = $2,
         preview_stage = $3,
         preview_progress_percent = $4,
         preview_eta_seconds = $5,
         preview_error = $6,
         parse_status = $7,
         parse_error = $8,
         started_at = CASE WHEN $9::TIMESTAMPTZ IS NULL THEN started_at ELSE $9::TIMESTAMPTZ END,
         finished_at = CASE WHEN $10::TIMESTAMPTZ IS NULL THEN finished_at ELSE $10::TIMESTAMPTZ END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.documentId,
      status,
      stage,
      progressPercent,
      etaSeconds,
      error,
      toLegacyParseStatus(status),
      error,
      input.startedAt || null,
      input.finishedAt || null,
    ],
  )
}

export async function updateProjectDocumentPreviewAsset(
  db: Queryable,
  input: {
    documentId: string
    previewObjectKey: string
    previewStorageProvider: string
    previewFileName: string
    previewMimeType: string
    previewFileSize: number
    pageCount: number
    actorUserId?: string
  },
): Promise<void> {
  await db.query(
    `UPDATE project_resource_documents
     SET preview_object_key = $2,
         preview_storage_provider = $3,
         preview_file_name = $4,
         preview_mime_type = $5,
         preview_file_size = $6,
         page_count = $7,
         object_key = $2,
         storage_provider = $3,
         file_name = $4,
         mime_type = $5,
         file_size = $6,
         updated_by_user_id = $8,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.documentId,
      normalizeString(input.previewObjectKey),
      normalizeString(input.previewStorageProvider) || 'local',
      normalizeString(input.previewFileName),
      normalizeString(input.previewMimeType) || 'application/pdf',
      Math.max(0, toNumber(input.previewFileSize, 0)),
      Math.max(0, Math.round(toNumber(input.pageCount, 0))),
      normalizeString(input.actorUserId) || null,
    ],
  )
}

export async function updateProjectDocumentTaskProgress(
  db: Queryable,
  input: {
    taskId: string
    stage: ProjectPreviewStage
    etaSeconds: number
    resultPayload?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE project_resource_document_tasks
     SET stage = $2,
         eta_seconds = $3,
         result_payload = CASE WHEN $4::JSONB IS NULL THEN result_payload ELSE $4::JSONB END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.taskId,
      input.stage,
      Math.max(0, Math.round(toNumber(input.etaSeconds, 0))),
      input.resultPayload ? JSON.stringify(input.resultPayload) : null,
    ],
  )
}

export async function finishProjectDocumentTaskSuccess(
  db: Queryable,
  input: {
    taskId: string
    documentId: string
    resultPayload?: Record<string, unknown>
  },
): Promise<void> {
  const durationResult = await db.query<{ duration_ms: string }>(
    `SELECT GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, NOW()))) * 1000)::BIGINT::TEXT AS duration_ms
     FROM project_resource_document_tasks
     WHERE id = $1
     LIMIT 1`,
    [input.taskId],
  )
  const durationMs = Math.max(0, toNumber(durationResult.rows[0]?.duration_ms, 0))

  await db.query(
    `UPDATE project_resource_document_tasks
     SET status = 'succeeded',
         stage = 'succeeded',
         eta_seconds = 0,
         error_message = '',
         result_payload = $2::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.taskId, JSON.stringify(input.resultPayload || {})],
  )

  await db.query(
    `UPDATE project_resource_documents
     SET preview_status = 'succeeded',
         preview_stage = 'succeeded',
         preview_progress_percent = 100,
         preview_eta_seconds = 0,
         preview_error = '',
         parse_status = 'succeeded',
         parse_error = '',
         finished_at = NOW(),
         last_attempt_duration_ms = $2,
         total_attempt_duration_ms = COALESCE(total_attempt_duration_ms, 0) + $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.documentId, durationMs],
  )
}

export async function finishProjectDocumentTaskFailure(
  db: Queryable,
  input: {
    taskId: string
    documentId: string
    errorMessage: string
    requeue: boolean
    resultPayload?: Record<string, unknown>
  },
): Promise<void> {
  const safeMessage = normalizeString(input.errorMessage) || 'unknown error'
  if (input.requeue) {
    await db.query(
      `UPDATE project_resource_document_tasks
       SET status = 'queued',
           stage = 'queued',
           eta_seconds = 0,
           error_message = $2,
           result_payload = $3::JSONB,
           started_at = NULL,
           finished_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [input.taskId, safeMessage, JSON.stringify(input.resultPayload || { message: safeMessage })],
    )

    await db.query(
      `UPDATE project_resource_documents
       SET preview_status = 'queued',
           preview_stage = 'queued',
           preview_progress_percent = 0,
           preview_eta_seconds = 0,
           preview_error = $2,
           parse_status = 'queued',
           parse_error = $2,
           queued_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [input.documentId, safeMessage],
    )
    return
  }

  await db.query(
    `UPDATE project_resource_document_tasks
     SET status = 'failed',
         stage = 'failed',
         eta_seconds = 0,
         error_message = $2,
         result_payload = $3::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.taskId, safeMessage, JSON.stringify(input.resultPayload || { message: safeMessage })],
  )

  await db.query(
    `UPDATE project_resource_documents
     SET preview_status = 'failed',
         preview_stage = 'failed',
         preview_progress_percent = 100,
         preview_eta_seconds = 0,
         preview_error = $2,
         parse_status = 'failed',
         parse_error = $2,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.documentId, safeMessage],
  )
}

export async function resetStaleProjectDocumentTasks(
  db: Queryable,
  input: { staleMinutes: number },
): Promise<number> {
  const staleMinutes = Math.max(1, Math.round(toNumber(input.staleMinutes, 10)))
  const result = await db.query<{ document_id: string }>(
    `UPDATE project_resource_document_tasks
     SET status = 'queued',
         stage = 'queued',
         eta_seconds = 0,
         error_message = '[worker] 检测到处理中断，已自动重试',
         started_at = NULL,
         finished_at = NULL,
         updated_at = NOW()
     WHERE status = 'processing'
       AND (started_at IS NULL OR started_at < NOW() - ($1::TEXT || ' minutes')::INTERVAL)
     RETURNING document_id`,
    [String(staleMinutes)],
  )

  const rowCount = Math.max(0, toNumber(result.rowCount, 0))
  if (rowCount <= 0)
    return 0

  const docIds = [...new Set(result.rows.map(item => normalizeString(item.document_id)).filter(Boolean))]
  if (docIds.length > 0) {
    await db.query(
      `UPDATE project_resource_documents
       SET preview_status = 'queued',
           preview_stage = 'queued',
           preview_progress_percent = 0,
           preview_eta_seconds = 0,
           preview_error = '[worker] 任务重置后等待重试',
           parse_status = 'queued',
           parse_error = '[worker] 任务重置后等待重试',
           queued_at = NOW(),
           started_at = NULL,
           finished_at = NULL,
           updated_at = NOW()
       WHERE id = ANY($1::TEXT[])`,
      [docIds],
    )
  }

  return rowCount
}

export async function enqueueProjectDocumentReconvert(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
  },
): Promise<{ document: ProjectResourceDocument, task: ProjectResourceDocumentTask | null }> {
  const document = await getProjectResourceDocumentByResourceId(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
  })
  if (!document)
    throw new Error('DOCUMENT_NOT_FOUND')

  if (isPdfByNameOrMime(document.sourceFileName, document.sourceMimeType) || isImageByNameOrMime(document.sourceFileName, document.sourceMimeType)) {
    await setProjectDocumentPreviewState(db, {
      documentId: document.id,
      status: 'succeeded',
      stage: 'succeeded',
      progressPercent: 100,
      etaSeconds: 0,
      error: '',
      finishedAt: new Date().toISOString(),
    })
    const refreshed = await getProjectResourceDocumentById(db, { documentId: document.id })
    if (!refreshed)
      throw new Error('DOCUMENT_NOT_FOUND')
    return { document: refreshed, task: null }
  }

  const now = new Date().toISOString()
  const taskId = randomUUID()
  await db.query(
    `INSERT INTO project_resource_document_tasks (
      id,
      document_id,
      task_type,
      provider,
      stage,
      eta_seconds,
      status,
      attempt,
      error_message,
      result_payload,
      started_at,
      finished_at,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'convert_preview_pdf', 'onlyoffice', 'queued', 0, 'queued', 0, '', '{}'::JSONB, NULL, NULL, $3, $3, $4, $4
    )`,
    [taskId, document.id, input.actorUserId, now],
  )

  await setProjectDocumentPreviewState(db, {
    documentId: document.id,
    status: 'queued',
    stage: 'queued',
    progressPercent: 0,
    etaSeconds: 0,
    error: '',
    startedAt: null,
    finishedAt: null,
  })

  await db.query(
    `UPDATE project_resource_documents
     SET queued_at = NOW(),
         started_at = NULL,
         finished_at = NULL,
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [document.id, input.actorUserId],
  )

  const latestDocument = await getProjectResourceDocumentById(db, {
    documentId: document.id,
  })
  const latestTask = await getProjectDocumentTaskById(db, { taskId })
  if (!latestDocument)
    throw new Error('DOCUMENT_NOT_FOUND')

  return {
    document: latestDocument,
    task: latestTask,
  }
}

async function getQueuePositionByDocumentId(
  db: Queryable,
  input: { documentId: string },
): Promise<number> {
  const currentTaskResult = await db.query<{ created_at: string }>(
    `SELECT created_at::TEXT
     FROM project_resource_document_tasks
     WHERE document_id = $1
       AND status = 'queued'
     ORDER BY created_at ASC
     LIMIT 1`,
    [input.documentId],
  )

  const createdAt = normalizeString(currentTaskResult.rows[0]?.created_at)
  if (!createdAt)
    return 0

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count
     FROM project_resource_document_tasks
     WHERE status = 'queued'
       AND created_at <= $1::TIMESTAMPTZ`,
    [createdAt],
  )
  return Math.max(0, toNumber(countResult.rows[0]?.count, 0))
}

async function getRecentAverageDurationSeconds(db: Queryable, limit = 30): Promise<number> {
  const result = await db.query<{ avg_seconds: string }>(
    `SELECT COALESCE(AVG(duration_seconds), 0)::TEXT AS avg_seconds
     FROM (
       SELECT EXTRACT(EPOCH FROM (finished_at - started_at)) AS duration_seconds
       FROM project_resource_document_tasks
       WHERE status = 'succeeded'
         AND started_at IS NOT NULL
         AND finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT $1
     ) t`,
    [Math.max(5, Math.min(100, limit))],
  )
  const avg = toNumber(result.rows[0]?.avg_seconds, 0)
  if (!Number.isFinite(avg) || avg <= 0)
    return 25
  return avg
}

function estimateRunningEtaSeconds(input: {
  progressPercent: number
  startedAt: string | null
}): number {
  const progress = Math.max(1, Math.min(99, Math.round(toNumber(input.progressPercent, 0))))
  const startedAtMs = input.startedAt ? new Date(input.startedAt).getTime() : 0
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0)
    return 5

  const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAtMs) / 1000))
  const estimatedTotal = Math.round(elapsedSeconds * (100 / progress))
  return Math.max(1, estimatedTotal - elapsedSeconds)
}

export async function buildProjectPreviewStatusPayload(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectPreviewStatusPayload | null> {
  const document = await getProjectResourceDocumentByResourceId(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
  })
  if (!document)
    return null

  const latestTask = await getLatestProjectDocumentTaskByDocumentId(db, {
    documentId: document.id,
  })

  let queuePosition = 0
  let etaSeconds = Math.max(0, document.previewEtaSeconds)

  if (document.previewStatus === 'queued') {
    queuePosition = await getQueuePositionByDocumentId(db, {
      documentId: document.id,
    })
    const averageDuration = await getRecentAverageDurationSeconds(db, 30)
    const effectivePosition = Math.max(1, queuePosition)
    etaSeconds = Math.max(1, Math.round(averageDuration * effectivePosition))
  }
  else if (document.previewStatus === 'converting' || document.previewStatus === 'finalizing') {
    etaSeconds = estimateRunningEtaSeconds({
      progressPercent: document.previewProgressPercent,
      startedAt: document.startedAt,
    })
  }

  const signedUrls = buildProjectResourceSignedUrls({
    projectId: document.projectId,
    resourceId: document.projectResourceId,
  })

  return {
    documentId: document.id,
    status: document.previewStatus,
    stage: document.previewStage,
    progressPercent: document.previewProgressPercent,
    etaSeconds,
    queuePosition,
    attempt: latestTask?.attempt || 0,
    error: normalizeString(document.previewError),
    previewUrl: signedUrls.previewUrl,
    previewUrlExpiresAt: signedUrls.previewUrlExpiresAt,
    sourceDownloadUrl: signedUrls.sourceDownloadUrl,
    sourceDownloadUrlExpiresAt: signedUrls.sourceDownloadUrlExpiresAt,
  }
}

export async function getProjectResourceSourceFileRef(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectFileRef | null> {
  const document = await getProjectResourceDocumentByResourceId(db, input)
  if (!document)
    return null

  const objectKey = normalizeString(document.sourceObjectKey || document.objectKey)
  if (!objectKey)
    return null

  return {
    objectKey,
    storageProvider: normalizeString(document.sourceStorageProvider || document.storageProvider) || 'local',
    fileName: normalizeString(document.sourceFileName || document.fileName) || 'resource.bin',
    mimeType: normalizeString(document.sourceMimeType || document.mimeType) || 'application/octet-stream',
  }
}

export async function getProjectResourcePreviewFileRef(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectFileRef | null> {
  const document = await getProjectResourceDocumentByResourceId(db, input)
  if (!document || document.previewStatus !== 'succeeded')
    return null

  const objectKey = normalizeString(document.previewObjectKey)
  if (!objectKey)
    return null

  return {
    objectKey,
    storageProvider: normalizeString(document.previewStorageProvider || document.storageProvider) || 'local',
    fileName: normalizeString(document.previewFileName) || 'preview.pdf',
    mimeType: normalizeString(document.previewMimeType) || 'application/pdf',
  }
}

export async function getProjectDocumentByTaskId(
  db: Queryable,
  input: { taskId: string },
): Promise<{ task: ProjectResourceDocumentTask, document: ProjectResourceDocument } | null> {
  const task = await getProjectDocumentTaskById(db, input)
  if (!task)
    return null

  const document = await getProjectResourceDocumentById(db, {
    documentId: task.documentId,
  })
  if (!document)
    return null

  return { task, document }
}
