import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { getProjectDocumentPreviewWorkerState } from '~~/server/utils/project-document-preview-worker-state'

type TaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
type PreviewStatus = 'queued' | 'converting' | 'finalizing' | 'succeeded' | 'failed'

interface TaskCountRow {
  total: string
}

interface OverviewRow {
  total_calls: string
  succeeded_calls: string
  failed_calls: string
  queued_calls: string
  processing_calls: string
  avg_attempt: string
  retried_calls: string
  avg_duration_ms: string
  p95_duration_ms: string
}

interface QueueRow {
  queued_count: string
  processing_count: string
  oldest_queued_at: string | null
  oldest_queued_seconds: string
}

interface StageRow {
  stage: string
  count: string
}

interface ProviderRow {
  provider: string
  count: string
}

interface ErrorRow {
  error_text: string
  count: string
}

interface TrendRow {
  day: string
  calls: string
  succeeded: string
  failed: string
}

interface TaskListRow {
  task_id: string
  document_id: string
  project_id: string
  project_title: string
  workspace_id: string
  workspace_name: string | null
  resource_id: string
  resource_title: string
  source_file_name: string
  source_mime_type: string
  preview_status: string
  preview_stage: string
  preview_progress_percent: number
  preview_eta_seconds: number
  task_type: string
  provider: string
  task_status: string
  task_stage: string
  attempt: number
  error_message: string
  result_payload: unknown
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  duration_ms: string
  running_duration_ms: string
}

function readQueryText(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed))
    return parsed
  return fallback
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
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

function readRecordText(record: Record<string, unknown>, key: string): string {
  return String(record[key] || '').trim()
}

function toSafeTaskStatus(raw: string): TaskStatus | '' {
  if (raw === 'queued' || raw === 'processing' || raw === 'succeeded' || raw === 'failed')
    return raw
  return ''
}

function toSafePreviewStatus(raw: string): PreviewStatus | '' {
  if (raw === 'queued' || raw === 'converting' || raw === 'finalizing' || raw === 'succeeded' || raw === 'failed')
    return raw
  return ''
}

function toSuccessRate(succeeded: number, failed: number): number {
  const finished = succeeded + failed
  if (finished <= 0)
    return 0
  return Number(((succeeded / finished) * 100).toFixed(2))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')

  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看文档转换监控。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  const query = getQuery(event)
  const page = Math.max(1, Math.trunc(toNumber(readQueryText(query.page), 1)))
  const pageSize = Math.max(10, Math.min(100, Math.trunc(toNumber(readQueryText(query.pageSize), 20))))
  const offset = (page - 1) * pageSize
  const days = Math.max(1, Math.min(90, Math.trunc(toNumber(readQueryText(query.days), 7))))
  const taskStatus = toSafeTaskStatus(readQueryText(query.status))
  const taskStage = toSafePreviewStatus(readQueryText(query.stage))
  const previewStatus = toSafePreviewStatus(readQueryText(query.previewStatus))
  const provider = readQueryText(query.provider)
  const q = readQueryText(query.q)
  const projectId = readQueryText(query.projectId)
  const resourceId = readQueryText(query.resourceId)
  const documentId = readQueryText(query.documentId)

  const payload = await withClient(event, async (db) => {
    const listWhere: string[] = [`t.created_at >= NOW() - ($1::INT * INTERVAL '1 day')`]
    const listValues: unknown[] = [days]

    if (taskStatus) {
      listValues.push(taskStatus)
      listWhere.push(`t.status = $${listValues.length}`)
    }

    if (taskStage) {
      listValues.push(taskStage)
      listWhere.push(`t.stage = $${listValues.length}`)
    }

    if (previewStatus) {
      listValues.push(previewStatus)
      listWhere.push(`d.preview_status = $${listValues.length}`)
    }

    if (provider) {
      listValues.push(provider)
      listWhere.push(`t.provider = $${listValues.length}`)
    }

    if (projectId) {
      listValues.push(projectId)
      listWhere.push(`d.project_id = $${listValues.length}`)
    }

    if (resourceId) {
      listValues.push(resourceId)
      listWhere.push(`d.project_resource_id = $${listValues.length}`)
    }

    if (documentId) {
      listValues.push(documentId)
      listWhere.push(`d.id = $${listValues.length}`)
    }

    if (q) {
      listValues.push(`%${q}%`)
      const qIdx = listValues.length
      listWhere.push(`(
        t.id ILIKE $${qIdx}
        OR t.document_id ILIKE $${qIdx}
        OR d.project_resource_id ILIKE $${qIdx}
        OR d.project_id ILIKE $${qIdx}
        OR p.title ILIKE $${qIdx}
        OR pr.title ILIKE $${qIdx}
        OR d.source_file_name ILIKE $${qIdx}
        OR COALESCE(t.error_message, '') ILIKE $${qIdx}
        OR COALESCE(t.result_payload->>'rawMessage', '') ILIKE $${qIdx}
        OR COALESCE(t.result_payload->>'message', '') ILIKE $${qIdx}
      )`)
    }

    const listWhereClause = listWhere.join(' AND ')

    const countResult = await db.query<TaskCountRow>(
      `SELECT COUNT(*)::TEXT AS total
       FROM project_resource_document_tasks t
       JOIN project_resource_documents d ON d.id = t.document_id
       JOIN project_resources pr ON pr.id = d.project_resource_id
       JOIN projects p ON p.id = d.project_id
       WHERE ${listWhereClause}`,
      listValues,
    )

    const listQueryValues = [...listValues, pageSize, offset]
    const listResult = await db.query<TaskListRow>(
      `SELECT
        t.id AS task_id,
        t.document_id,
        d.project_id,
        p.title AS project_title,
        p.workspace_id,
        w.name AS workspace_name,
        d.project_resource_id AS resource_id,
        pr.title AS resource_title,
        d.source_file_name,
        d.source_mime_type,
        d.preview_status,
        d.preview_stage,
        d.preview_progress_percent,
        d.preview_eta_seconds,
        t.task_type,
        t.provider,
        t.status AS task_status,
        t.stage AS task_stage,
        t.attempt,
        t.error_message,
        t.result_payload,
        t.started_at::TEXT,
        t.finished_at::TEXT,
        t.created_at::TEXT,
        t.updated_at::TEXT,
        CASE
          WHEN t.started_at IS NOT NULL AND t.finished_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (t.finished_at - t.started_at)) * 1000)::BIGINT::TEXT
          ELSE '0'
        END AS duration_ms,
        CASE
          WHEN t.started_at IS NOT NULL AND t.finished_at IS NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - t.started_at)) * 1000)::BIGINT::TEXT
          ELSE '0'
        END AS running_duration_ms
       FROM project_resource_document_tasks t
       JOIN project_resource_documents d ON d.id = t.document_id
       JOIN project_resources pr ON pr.id = d.project_resource_id
       JOIN projects p ON p.id = d.project_id
       LEFT JOIN workspaces w ON w.id = p.workspace_id
       WHERE ${listWhereClause}
       ORDER BY t.created_at DESC
       LIMIT $${listQueryValues.length - 1}
       OFFSET $${listQueryValues.length}`,
      listQueryValues,
    )

    const overviewResult = await db.query<OverviewRow>(
      `SELECT
        COUNT(*)::TEXT AS total_calls,
        COUNT(*) FILTER (WHERE status = 'succeeded')::TEXT AS succeeded_calls,
        COUNT(*) FILTER (WHERE status = 'failed')::TEXT AS failed_calls,
        COUNT(*) FILTER (WHERE status = 'queued')::TEXT AS queued_calls,
        COUNT(*) FILTER (WHERE status = 'processing')::TEXT AS processing_calls,
        COALESCE(AVG(attempt), 0)::TEXT AS avg_attempt,
        COUNT(*) FILTER (WHERE attempt > 1)::TEXT AS retried_calls,
        COALESCE(AVG(
          CASE
            WHEN started_at IS NOT NULL AND finished_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
            ELSE NULL
          END
        ), 0)::TEXT AS avg_duration_ms,
        COALESCE(
          PERCENTILE_CONT(0.95) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
          ) FILTER (WHERE started_at IS NOT NULL AND finished_at IS NOT NULL),
          0
        )::TEXT AS p95_duration_ms
       FROM project_resource_document_tasks
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')`,
      [days],
    )

    const queueResult = await db.query<QueueRow>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::TEXT AS queued_count,
        COUNT(*) FILTER (WHERE status = 'processing')::TEXT AS processing_count,
        MIN(created_at) FILTER (WHERE status = 'queued')::TEXT AS oldest_queued_at,
        COALESCE(
          EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status = 'queued'))),
          0
        )::TEXT AS oldest_queued_seconds
       FROM project_resource_document_tasks`,
    )

    const stageResult = await db.query<StageRow>(
      `SELECT stage, COUNT(*)::TEXT AS count
       FROM project_resource_document_tasks
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
       GROUP BY stage
       ORDER BY COUNT(*) DESC, stage ASC`,
      [days],
    )

    const providerResult = await db.query<ProviderRow>(
      `SELECT COALESCE(NULLIF(provider, ''), 'unknown') AS provider, COUNT(*)::TEXT AS count
       FROM project_resource_document_tasks
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
       GROUP BY provider
       ORDER BY COUNT(*) DESC, provider ASC`,
      [days],
    )

    const errorResult = await db.query<ErrorRow>(
      `SELECT
        COALESCE(
          NULLIF(error_message, ''),
          NULLIF(result_payload->>'rawMessage', ''),
          NULLIF(result_payload->>'message', ''),
          'unknown'
        ) AS error_text,
        COUNT(*)::TEXT AS count
       FROM project_resource_document_tasks
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
         AND (
           status = 'failed'
           OR COALESCE(error_message, '') <> ''
           OR COALESCE(result_payload->>'rawMessage', '') <> ''
           OR COALESCE(result_payload->>'message', '') <> ''
         )
       GROUP BY 1
       ORDER BY COUNT(*) DESC, 1 ASC
       LIMIT 10`,
      [days],
    )

    const trendLimit = Math.max(7, Math.min(90, days))
    const trendResult = await db.query<TrendRow>(
      `SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
        COUNT(*)::TEXT AS calls,
        COUNT(*) FILTER (WHERE status = 'succeeded')::TEXT AS succeeded,
        COUNT(*) FILTER (WHERE status = 'failed')::TEXT AS failed
       FROM project_resource_document_tasks
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
       GROUP BY 1
       ORDER BY day DESC
       LIMIT $2`,
      [days, trendLimit],
    )

    const overview = overviewResult.rows[0] || {
      total_calls: '0',
      succeeded_calls: '0',
      failed_calls: '0',
      queued_calls: '0',
      processing_calls: '0',
      avg_attempt: '0',
      retried_calls: '0',
      avg_duration_ms: '0',
      p95_duration_ms: '0',
    }
    const queue = queueResult.rows[0] || {
      queued_count: '0',
      processing_count: '0',
      oldest_queued_at: null,
      oldest_queued_seconds: '0',
    }

    const totalCalls = Math.max(0, toNumber(overview.total_calls, 0))
    const succeededCalls = Math.max(0, toNumber(overview.succeeded_calls, 0))
    const failedCalls = Math.max(0, toNumber(overview.failed_calls, 0))

    return {
      overview: {
        days,
        totalCalls,
        succeededCalls,
        failedCalls,
        queuedCalls: Math.max(0, toNumber(overview.queued_calls, 0)),
        processingCalls: Math.max(0, toNumber(overview.processing_calls, 0)),
        successRate: toSuccessRate(succeededCalls, failedCalls),
        avgAttempt: Number(toNumber(overview.avg_attempt, 0).toFixed(2)),
        retriedCalls: Math.max(0, toNumber(overview.retried_calls, 0)),
        avgDurationMs: Math.max(0, Math.round(toNumber(overview.avg_duration_ms, 0))),
        p95DurationMs: Math.max(0, Math.round(toNumber(overview.p95_duration_ms, 0))),
      },
      queue: {
        queuedCount: Math.max(0, toNumber(queue.queued_count, 0)),
        processingCount: Math.max(0, toNumber(queue.processing_count, 0)),
        oldestQueuedAt: queue.oldest_queued_at || '',
        oldestQueuedSeconds: Math.max(0, Math.round(toNumber(queue.oldest_queued_seconds, 0))),
      },
      stages: stageResult.rows.map(row => ({
        stage: String(row.stage || '').trim() || 'unknown',
        count: Math.max(0, toNumber(row.count, 0)),
      })),
      providers: providerResult.rows.map(row => ({
        provider: String(row.provider || '').trim() || 'unknown',
        count: Math.max(0, toNumber(row.count, 0)),
      })),
      topErrors: errorResult.rows.map(row => ({
        errorText: String(row.error_text || '').trim() || 'unknown',
        count: Math.max(0, toNumber(row.count, 0)),
      })),
      trend: trendResult.rows.map((row) => {
        const succeeded = Math.max(0, toNumber(row.succeeded, 0))
        const failed = Math.max(0, toNumber(row.failed, 0))
        return {
          day: String(row.day || '').trim(),
          calls: Math.max(0, toNumber(row.calls, 0)),
          succeeded,
          failed,
          successRate: toSuccessRate(succeeded, failed),
        }
      }),
      tasks: {
        page,
        pageSize,
        total: Math.max(0, toNumber(countResult.rows[0]?.total, 0)),
        items: listResult.rows.map((row) => {
          const resultPayload = toRecord(row.result_payload)
          const rawMessage = readRecordText(resultPayload, 'rawMessage')
          const resultMessage = readRecordText(resultPayload, 'message')
          return {
            taskId: row.task_id,
            documentId: row.document_id,
            projectId: row.project_id,
            projectTitle: row.project_title || '',
            workspaceId: row.workspace_id || '',
            workspaceName: row.workspace_name || '',
            resourceId: row.resource_id,
            resourceTitle: row.resource_title || '',
            sourceFileName: row.source_file_name || '',
            sourceMimeType: row.source_mime_type || '',
            previewStatus: row.preview_status || 'queued',
            previewStage: row.preview_stage || 'queued',
            previewProgressPercent: Math.max(0, Math.min(100, toNumber(row.preview_progress_percent, 0))),
            previewEtaSeconds: Math.max(0, toNumber(row.preview_eta_seconds, 0)),
            taskType: row.task_type || '',
            provider: row.provider || '',
            taskStatus: row.task_status || 'queued',
            taskStage: row.task_stage || 'queued',
            attempt: Math.max(0, toNumber(row.attempt, 0)),
            errorMessage: row.error_message || resultMessage || rawMessage,
            rawErrorMessage: rawMessage,
            resultMessage,
            onlyOfficeErrorCode: toNumber(resultPayload.onlyOfficeErrorCode, 0),
            onlyOfficeErrorDetail: readRecordText(resultPayload, 'onlyOfficeErrorDetail'),
            startedAt: row.started_at || '',
            finishedAt: row.finished_at || '',
            createdAt: row.created_at || '',
            updatedAt: row.updated_at || '',
            durationMs: Math.max(0, toNumber(row.duration_ms, 0)),
            runningDurationMs: Math.max(0, toNumber(row.running_duration_ms, 0)),
          }
        }),
      },
      filters: {
        days,
        page,
        pageSize,
        status: taskStatus,
        stage: taskStage,
        previewStatus,
        provider,
        q,
        projectId,
        resourceId,
        documentId,
      },
    }
  })

  const workerState = getProjectDocumentPreviewWorkerState()
  return ok({
    worker: {
      started: workerState.started,
      enabled: workerState.enabled,
      ticking: workerState.ticking,
      intervalMs: workerState.intervalMs,
      batchSize: workerState.batchSize,
      runCount: workerState.runCount,
      successCount: workerState.successCount,
      failureCount: workerState.failureCount,
      processedTaskCount: workerState.processedTaskCount,
      succeededTaskCount: workerState.succeededTaskCount,
      failedTaskCount: workerState.failedTaskCount,
      lastStartedAt: workerState.lastStartedAt,
      lastFinishedAt: workerState.lastFinishedAt,
      lastSuccessAt: workerState.lastSuccessAt,
      lastDurationMs: workerState.lastDurationMs,
      lastError: workerState.lastError,
      recentRuns: workerState.recentRuns,
      endpointConfigured: Boolean(String(runtime.onlyOffice.endpoint || '').trim()),
      sourceBaseURL: runtime.onlyOffice.sourceBaseURL,
      timeoutMs: runtime.onlyOffice.timeoutMs,
      retryLimit: runtime.onlyOffice.retryLimit,
    },
    ...payload,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
