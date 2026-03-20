import type { Queryable } from '~~/server/utils/db'
import type { ContestSyncRun, ContestSyncRunStatus, ContestSyncSource } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { commitContestImportRows, previewContestImportCsv } from '~~/server/utils/contest-store'

interface ContestSyncSourceRow {
  id: string
  name: string
  source_type: 'csv_url'
  source_url: string
  is_active: boolean
  last_run_at: string | null
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

interface ContestSyncRunRow {
  id: string
  source_id: string
  source_name: string
  status: ContestSyncRunStatus
  started_at: string
  finished_at: string | null
  preview_total: number | string
  preview_valid: number | string
  preview_invalid: number | string
  created_count: number | string
  updated_count: number | string
  skipped_count: number | string
  error_count: number | string
  error_message: string
  created_by_user_id: string
  created_at: string
}

function mapSyncSource(row: ContestSyncSourceRow): ContestSyncSource {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    isActive: Boolean(row.is_active),
    lastRunAt: row.last_run_at,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSyncRun(row: ContestSyncRunRow): ContestSyncRun {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    previewTotal: Number(row.preview_total || 0),
    previewValid: Number(row.preview_valid || 0),
    previewInvalid: Number(row.preview_invalid || 0),
    createdCount: Number(row.created_count || 0),
    updatedCount: Number(row.updated_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    errorCount: Number(row.error_count || 0),
    errorMessage: row.error_message || '',
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  }
}

function normalizeSourceUrl(sourceUrl: string): string {
  const raw = String(sourceUrl || '').trim()
  if (!raw)
    throw new Error('SOURCE_URL_REQUIRED')

  let parsed: URL
  try {
    parsed = new URL(raw)
  }
  catch {
    throw new Error('SOURCE_URL_INVALID')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('SOURCE_URL_INVALID')

  return parsed.toString()
}

export async function listContestSyncSources(db: Queryable): Promise<ContestSyncSource[]> {
  const result = await db.query<ContestSyncSourceRow>(
    `SELECT
      id,
      name,
      source_type,
      source_url,
      is_active,
      last_run_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_sync_sources
     ORDER BY created_at DESC`,
  )

  return result.rows.map(mapSyncSource)
}

export async function createContestSyncSource(
  db: Queryable,
  input: {
    name: string
    sourceUrl: string
    actorUserId: string
    isActive?: boolean
  },
): Promise<ContestSyncSource> {
  const name = String(input.name || '').trim()
  if (!name)
    throw new Error('SOURCE_NAME_REQUIRED')

  const sourceUrl = normalizeSourceUrl(input.sourceUrl)

  const result = await db.query<ContestSyncSourceRow>(
    `INSERT INTO contest_sync_sources (
      id,
      name,
      source_type,
      source_url,
      is_active,
      last_run_at,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'csv_url', $3, $4, NULL, $5, $5, NOW(), NOW()
    )
    RETURNING
      id,
      name,
      source_type,
      source_url,
      is_active,
      last_run_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      name,
      sourceUrl,
      input.isActive !== false,
      input.actorUserId,
    ],
  )

  return mapSyncSource(result.rows[0]!)
}

export async function getContestSyncSourceById(
  db: Queryable,
  sourceId: string,
): Promise<ContestSyncSource | null> {
  const result = await db.query<ContestSyncSourceRow>(
    `SELECT
      id,
      name,
      source_type,
      source_url,
      is_active,
      last_run_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_sync_sources
     WHERE id = $1
     LIMIT 1`,
    [sourceId],
  )

  const row = result.rows[0]
  return row ? mapSyncSource(row) : null
}

export async function createContestSyncRun(
  db: Queryable,
  input: {
    sourceId: string
    createdByUserId: string
  },
): Promise<string> {
  const runId = randomUUID()
  await db.query(
    `INSERT INTO contest_sync_runs (
      id,
      source_id,
      status,
      started_at,
      finished_at,
      preview_total,
      preview_valid,
      preview_invalid,
      created_count,
      updated_count,
      skipped_count,
      error_count,
      error_message,
      created_by_user_id,
      created_at
    ) VALUES (
      $1, $2, 'running', NOW(), NULL, 0, 0, 0, 0, 0, 0, 0, '', $3, NOW()
    )`,
    [runId, input.sourceId, input.createdByUserId],
  )

  return runId
}

export async function completeContestSyncRun(
  db: Queryable,
  input: {
    runId: string
    sourceId: string
    status: ContestSyncRunStatus
    previewTotal?: number
    previewValid?: number
    previewInvalid?: number
    createdCount?: number
    updatedCount?: number
    skippedCount?: number
    errorCount?: number
    errorMessage?: string
  },
): Promise<void> {
  await db.query(
    `UPDATE contest_sync_runs
     SET
       status = $3,
       finished_at = NOW(),
       preview_total = $4,
       preview_valid = $5,
       preview_invalid = $6,
       created_count = $7,
       updated_count = $8,
       skipped_count = $9,
       error_count = $10,
       error_message = $11
     WHERE id = $1
       AND source_id = $2`,
    [
      input.runId,
      input.sourceId,
      input.status,
      Math.max(0, Number(input.previewTotal || 0)),
      Math.max(0, Number(input.previewValid || 0)),
      Math.max(0, Number(input.previewInvalid || 0)),
      Math.max(0, Number(input.createdCount || 0)),
      Math.max(0, Number(input.updatedCount || 0)),
      Math.max(0, Number(input.skippedCount || 0)),
      Math.max(0, Number(input.errorCount || 0)),
      String(input.errorMessage || '').slice(0, 800),
    ],
  )

  await db.query(
    `UPDATE contest_sync_sources
     SET last_run_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.sourceId],
  )
}

export async function listContestSyncRuns(
  db: Queryable,
  input: {
    sourceId?: string
    limit?: number
  } = {},
): Promise<ContestSyncRun[]> {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 30)))
  const result = await db.query<ContestSyncRunRow>(
    `SELECT
      r.id,
      r.source_id,
      s.name AS source_name,
      r.status,
      r.started_at::TEXT,
      r.finished_at::TEXT,
      r.preview_total,
      r.preview_valid,
      r.preview_invalid,
      r.created_count,
      r.updated_count,
      r.skipped_count,
      r.error_count,
      r.error_message,
      r.created_by_user_id,
      r.created_at::TEXT
     FROM contest_sync_runs r
     JOIN contest_sync_sources s ON s.id = r.source_id
     WHERE ($1::TEXT IS NULL OR r.source_id = $1)
     ORDER BY r.started_at DESC
     LIMIT $2`,
    [input.sourceId || null, limit],
  )

  return result.rows.map(mapSyncRun)
}

export async function executeContestSyncImport(
  db: Queryable,
  input: {
    runId: string
    sourceId: string
    actorUserId: string
    csvText: string
  },
): Promise<ContestSyncRun> {
  const preview = await previewContestImportCsv(db, {
    csvText: input.csvText,
  })

  const commit = await commitContestImportRows(db, {
    actorUserId: input.actorUserId,
    rows: preview.rows,
    skipInvalid: true,
  })

  const errorCount = preview.invalidCount + commit.errors.length
  const hasMutations = commit.createdCount > 0 || commit.updatedCount > 0
  const hasErrors = errorCount > 0
  const status: ContestSyncRunStatus = hasErrors
    ? (hasMutations ? 'partial_success' : 'failed')
    : 'success'

  const errorMessage = commit.errors.slice(0, 5).map(item => `第 ${item.rowNumber} 行：${item.message}`).join('；')

  await completeContestSyncRun(db, {
    runId: input.runId,
    sourceId: input.sourceId,
    status,
    previewTotal: preview.total,
    previewValid: preview.validCount,
    previewInvalid: preview.invalidCount,
    createdCount: commit.createdCount,
    updatedCount: commit.updatedCount,
    skippedCount: commit.skippedCount,
    errorCount,
    errorMessage,
  })

  const runs = await listContestSyncRuns(db, {
    sourceId: input.sourceId,
    limit: 1,
  })

  return runs[0]!
}
