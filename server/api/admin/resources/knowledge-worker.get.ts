import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { getProjectKnowledgeWorkerState } from '~~/server/utils/project-knowledge-worker-state'

type TaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'dead_letter' | 'cancelled'
type TaskStage = 'queued' | 'extracting' | 'chunking' | 'embedding' | 'finalizing'

interface OverviewRow {
  total_tasks: string
  succeeded_tasks: string
  failed_tasks: string
  queued_tasks: string
  processing_tasks: string
  avg_duration_ms: string
  p95_duration_ms: string
  retry_success_rate: string
  avg_stale_hours: string
}

interface QueueRow {
  queued_count: string
  processing_count: string
  failed_count: string
  stale_count: string
  oldest_queued_at: string | null
  oldest_queued_seconds: string
}

interface StageRow {
  stage: string
  count: string
}

interface ChunkKindRow {
  chunk_kind: string
  count: string
}

interface ErrorRow {
  error_text: string
  count: string
}

interface ProjectBacklogRow {
  project_id: string
  project_title: string | null
  backlog_count: string
  processing_count: string
  failed_count: string
  stale_count: string
}

interface FailureRow {
  task_id: string
  project_id: string
  project_title: string | null
  resource_id: string | null
  resource_title: string | null
  status: string
  stage: string
  error_message: string
  updated_at: string
}

interface TrendRow {
  day: string
  tasks: string
  succeeded: string
  failed: string
}

interface TaskCountRow {
  total: string
}

interface TaskListRow {
  task_id: string
  project_id: string
  project_title: string | null
  resource_id: string | null
  resource_title: string | null
  source_status: string | null
  source_progress_percent: number
  source_eta_seconds: number
  task_type: string
  task_status: string
  task_stage: string
  attempt: number
  max_attempt: number
  error_message: string
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

function toSafeTaskStatus(raw: string): TaskStatus | '' {
  if (raw === 'queued' || raw === 'processing' || raw === 'succeeded' || raw === 'failed' || raw === 'dead_letter' || raw === 'cancelled')
    return raw
  return ''
}

function toSafeTaskStage(raw: string): TaskStage | '' {
  if (raw === 'queued' || raw === 'extracting' || raw === 'chunking' || raw === 'embedding' || raw === 'finalizing')
    return raw
  return ''
}

function toSuccessRate(succeeded: number, failed: number): number {
  const denominator = succeeded + failed
  if (denominator <= 0)
    return 0
  return Number(((succeeded / denominator) * 100).toFixed(2))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')

  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看知识索引监控。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40396)
  }

  const query = getQuery(event)
  const page = Math.max(1, Math.trunc(toNumber(readQueryText(query.page), 1)))
  const pageSize = Math.max(10, Math.min(100, Math.trunc(toNumber(readQueryText(query.pageSize), 20))))
  const offset = (page - 1) * pageSize
  const days = Math.max(1, Math.min(90, Math.trunc(toNumber(readQueryText(query.days), 14))))
  const taskStatus = toSafeTaskStatus(readQueryText(query.status))
  const taskStage = toSafeTaskStage(readQueryText(query.stage))
  const projectId = readQueryText(query.projectId)
  const q = readQueryText(query.q)

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

    if (projectId) {
      listValues.push(projectId)
      listWhere.push(`t.project_id = $${listValues.length}`)
    }

    if (q) {
      listValues.push(`%${q}%`)
      const qIdx = listValues.length
      listWhere.push(`(
        t.id ILIKE $${qIdx}
        OR t.project_id ILIKE $${qIdx}
        OR COALESCE(t.source_resource_id, '') ILIKE $${qIdx}
        OR COALESCE(p.title, '') ILIKE $${qIdx}
        OR COALESCE(pr.title, '') ILIKE $${qIdx}
        OR COALESCE(t.error_message, '') ILIKE $${qIdx}
      )`)
    }

    const listWhereSql = listWhere.join(' AND ')
    const worker = getProjectKnowledgeWorkerState()

    const [
      overviewResult,
      queueResult,
      stageResult,
      chunkKindResult,
      errorResult,
      backlogResult,
      failureResult,
      trendResult,
      taskCountResult,
      taskListResult,
    ] = await Promise.all([
      db.query<OverviewRow>(
        `WITH task_window AS (
           SELECT
             status,
             attempt,
             EXTRACT(
               EPOCH FROM COALESCE(finished_at, updated_at, created_at) - COALESCE(started_at, created_at)
             ) * 1000 AS duration_ms
           FROM project_knowledge_index_tasks
           WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
         ),
         duration_window AS (
           SELECT duration_ms
           FROM task_window
           WHERE duration_ms >= 0
         ),
         stale_window AS (
           SELECT AVG(EXTRACT(EPOCH FROM NOW() - updated_at) / 3600.0) AS avg_stale_hours
           FROM project_knowledge_sources
           WHERE status = 'stale'
         ),
         retry_window AS (
           SELECT
           COUNT(*) FILTER (WHERE attempt > 1 AND status = 'succeeded') AS retry_succeeded,
           COUNT(*) FILTER (WHERE attempt > 1 AND status IN ('succeeded', 'failed', 'dead_letter')) AS retry_finished
           FROM project_knowledge_index_tasks
           WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
         )
         SELECT
           COALESCE((SELECT COUNT(*) FROM task_window), 0)::BIGINT AS total_tasks,
           COALESCE((SELECT COUNT(*) FROM task_window WHERE status = 'succeeded'), 0)::BIGINT AS succeeded_tasks,
           COALESCE((SELECT COUNT(*) FROM task_window WHERE status IN ('failed', 'dead_letter')), 0)::BIGINT AS failed_tasks,
           COALESCE((SELECT COUNT(*) FROM task_window WHERE status = 'queued'), 0)::BIGINT AS queued_tasks,
           COALESCE((SELECT COUNT(*) FROM task_window WHERE status = 'processing'), 0)::BIGINT AS processing_tasks,
           COALESCE((SELECT AVG(duration_ms) FROM duration_window), 0)::DOUBLE PRECISION AS avg_duration_ms,
           COALESCE((SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM duration_window), 0)::DOUBLE PRECISION AS p95_duration_ms,
           CASE WHEN retry_window.retry_finished > 0 THEN (retry_window.retry_succeeded::DOUBLE PRECISION / retry_window.retry_finished::DOUBLE PRECISION) * 100 ELSE 0 END::DOUBLE PRECISION AS retry_success_rate,
           COALESCE(stale_window.avg_stale_hours, 0)::DOUBLE PRECISION AS avg_stale_hours
         FROM stale_window, retry_window`,
        [days],
      ),
      db.query<QueueRow>(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'queued')::BIGINT AS queued_count,
          COUNT(*) FILTER (WHERE status IN ('extracting', 'chunking', 'embedding'))::BIGINT AS processing_count,
          COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed_count,
          COUNT(*) FILTER (WHERE status = 'stale')::BIGINT AS stale_count,
          (MIN(updated_at) FILTER (WHERE status = 'queued'))::TEXT AS oldest_queued_at,
          COALESCE(EXTRACT(EPOCH FROM NOW() - MIN(updated_at) FILTER (WHERE status = 'queued')), 0)::DOUBLE PRECISION AS oldest_queued_seconds
         FROM project_knowledge_sources`,
      ),
      db.query<StageRow>(
        `SELECT
          stage,
          COUNT(*)::BIGINT AS count
         FROM project_knowledge_index_tasks
         WHERE status IN ('queued', 'processing')
         GROUP BY stage
         ORDER BY count DESC, stage ASC`,
      ),
      db.query<ChunkKindRow>(
        `SELECT
          chunk_kind,
          COUNT(*)::BIGINT AS count
         FROM project_knowledge_chunks
         GROUP BY chunk_kind
         ORDER BY count DESC, chunk_kind ASC`,
      ),
      db.query<ErrorRow>(
        `SELECT
          error_message AS error_text,
          COUNT(*)::BIGINT AS count
         FROM project_knowledge_index_tasks
         WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
           AND status IN ('failed', 'dead_letter')
           AND COALESCE(error_message, '') <> ''
         GROUP BY error_message
         ORDER BY count DESC, error_message ASC
         LIMIT 12`,
        [days],
      ),
      db.query<ProjectBacklogRow>(
        `SELECT
          s.project_id,
          p.title AS project_title,
          COUNT(*) FILTER (WHERE s.status IN ('queued', 'extracting', 'chunking', 'embedding', 'failed', 'stale'))::BIGINT AS backlog_count,
          COUNT(*) FILTER (WHERE s.status IN ('extracting', 'chunking', 'embedding'))::BIGINT AS processing_count,
          COUNT(*) FILTER (WHERE s.status = 'failed')::BIGINT AS failed_count,
          COUNT(*) FILTER (WHERE s.status = 'stale')::BIGINT AS stale_count
         FROM project_knowledge_sources s
         LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.status <> 'ready'
           AND s.status <> 'skipped'
         GROUP BY s.project_id, p.title
         HAVING COUNT(*) FILTER (WHERE s.status IN ('queued', 'extracting', 'chunking', 'embedding', 'failed', 'stale')) > 0
         ORDER BY backlog_count DESC, p.title ASC NULLS LAST
         LIMIT 12`,
      ),
      db.query<FailureRow>(
        `SELECT
          t.id AS task_id,
          t.project_id,
          p.title AS project_title,
          t.source_resource_id AS resource_id,
          pr.title AS resource_title,
          t.status,
          t.stage,
          t.error_message,
          t.updated_at::TEXT AS updated_at
         FROM project_knowledge_index_tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_resources pr ON pr.id = t.source_resource_id
         WHERE t.created_at >= NOW() - ($1::INT * INTERVAL '1 day')
           AND t.status IN ('failed', 'dead_letter')
         ORDER BY t.updated_at DESC
         LIMIT 12`,
        [days],
      ),
      db.query<TrendRow>(
        `SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
          COUNT(*)::BIGINT AS tasks,
          COUNT(*) FILTER (WHERE status = 'succeeded')::BIGINT AS succeeded,
          COUNT(*) FILTER (WHERE status IN ('failed', 'dead_letter'))::BIGINT AS failed
         FROM project_knowledge_index_tasks
         WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
         GROUP BY DATE_TRUNC('day', created_at)
         ORDER BY DATE_TRUNC('day', created_at) DESC
         LIMIT 14`,
        [days],
      ),
      db.query<TaskCountRow>(
        `SELECT COUNT(*)::BIGINT AS total
         FROM project_knowledge_index_tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_resources pr ON pr.id = t.source_resource_id
         WHERE ${listWhereSql}`,
        listValues,
      ),
      db.query<TaskListRow>(
        `SELECT
          t.id AS task_id,
          t.project_id,
          p.title AS project_title,
          t.source_resource_id AS resource_id,
          pr.title AS resource_title,
          s.status AS source_status,
          COALESCE(s.progress_percent, 0)::INTEGER AS source_progress_percent,
          COALESCE(s.eta_seconds, 0)::INTEGER AS source_eta_seconds,
          t.task_type,
          t.status AS task_status,
          t.stage AS task_stage,
          t.attempt,
          t.max_attempt,
          t.error_message,
          t.started_at::TEXT AS started_at,
          t.finished_at::TEXT AS finished_at,
          t.created_at::TEXT AS created_at,
          t.updated_at::TEXT AS updated_at,
          COALESCE(
            EXTRACT(EPOCH FROM COALESCE(t.finished_at, t.updated_at, t.created_at) - COALESCE(t.started_at, t.created_at)) * 1000,
            0
          )::DOUBLE PRECISION AS duration_ms,
          COALESCE(
            EXTRACT(EPOCH FROM NOW() - t.started_at) * 1000,
            0
          )::DOUBLE PRECISION AS running_duration_ms
         FROM project_knowledge_index_tasks t
         LEFT JOIN project_knowledge_sources s
           ON s.project_id = t.project_id
          AND s.scope_type = t.scope_type
          AND COALESCE(s.source_resource_id, '') = COALESCE(t.source_resource_id, '')
          AND COALESCE(s.linked_contest_resource_id, '') = COALESCE(t.linked_contest_resource_id, '')
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_resources pr ON pr.id = t.source_resource_id
         WHERE ${listWhereSql}
         ORDER BY t.updated_at DESC, t.created_at DESC
         LIMIT $${listValues.length + 1}
         OFFSET $${listValues.length + 2}`,
        [...listValues, pageSize, offset],
      ),
    ])

    const overview = overviewResult.rows[0] || {
      total_tasks: '0',
      succeeded_tasks: '0',
      failed_tasks: '0',
      queued_tasks: '0',
      processing_tasks: '0',
      avg_duration_ms: '0',
      p95_duration_ms: '0',
      retry_success_rate: '0',
      avg_stale_hours: '0',
    }
    const queue = queueResult.rows[0] || {
      queued_count: '0',
      processing_count: '0',
      failed_count: '0',
      stale_count: '0',
      oldest_queued_at: null,
      oldest_queued_seconds: '0',
    }

    return {
      worker,
      overview: {
        totalTasks: toNumber(overview.total_tasks),
        succeededTasks: toNumber(overview.succeeded_tasks),
        failedTasks: toNumber(overview.failed_tasks),
        queuedTasks: toNumber(overview.queued_tasks),
        processingTasks: toNumber(overview.processing_tasks),
        successRate: toSuccessRate(toNumber(overview.succeeded_tasks), toNumber(overview.failed_tasks)),
        avgDurationMs: toNumber(overview.avg_duration_ms),
        p95DurationMs: toNumber(overview.p95_duration_ms),
        retrySuccessRate: Number(toNumber(overview.retry_success_rate).toFixed(2)),
        avgStaleHours: Number(toNumber(overview.avg_stale_hours).toFixed(2)),
      },
      queue: {
        queuedCount: toNumber(queue.queued_count),
        processingCount: toNumber(queue.processing_count),
        failedCount: toNumber(queue.failed_count),
        staleCount: toNumber(queue.stale_count),
        oldestQueuedAt: queue.oldest_queued_at,
        oldestQueuedSeconds: toNumber(queue.oldest_queued_seconds),
      },
      stages: stageResult.rows.map(item => ({
        stage: item.stage,
        count: toNumber(item.count),
      })),
      chunkKinds: chunkKindResult.rows.map(item => ({
        chunkKind: item.chunk_kind,
        count: toNumber(item.count),
      })),
      topErrors: errorResult.rows.map(item => ({
        errorText: item.error_text,
        count: toNumber(item.count),
      })),
      projectBacklog: backlogResult.rows.map(item => ({
        projectId: item.project_id,
        projectTitle: String(item.project_title || '').trim() || '未命名项目',
        backlogCount: toNumber(item.backlog_count),
        processingCount: toNumber(item.processing_count),
        failedCount: toNumber(item.failed_count),
        staleCount: toNumber(item.stale_count),
      })),
      recentFailures: failureResult.rows.map(item => ({
        taskId: item.task_id,
        projectId: item.project_id,
        projectTitle: String(item.project_title || '').trim() || '未命名项目',
        resourceId: String(item.resource_id || '').trim(),
        resourceTitle: String(item.resource_title || '').trim() || '未命名资源',
        status: item.status,
        stage: item.stage,
        errorMessage: item.error_message,
        updatedAt: item.updated_at,
      })),
      trend: trendResult.rows
        .map(item => ({
          day: item.day,
          tasks: toNumber(item.tasks),
          succeeded: toNumber(item.succeeded),
          failed: toNumber(item.failed),
          successRate: toSuccessRate(toNumber(item.succeeded), toNumber(item.failed)),
        }))
        .reverse(),
      tasks: {
        page,
        pageSize,
        total: toNumber(taskCountResult.rows[0]?.total),
        items: taskListResult.rows.map(item => ({
          taskId: item.task_id,
          projectId: item.project_id,
          projectTitle: String(item.project_title || '').trim() || '未命名项目',
          resourceId: String(item.resource_id || '').trim(),
          resourceTitle: String(item.resource_title || '').trim() || '未命名资源',
          sourceStatus: String(item.source_status || '').trim(),
          sourceProgressPercent: toNumber(item.source_progress_percent),
          sourceEtaSeconds: toNumber(item.source_eta_seconds),
          taskType: item.task_type,
          taskStatus: item.task_status,
          taskStage: item.task_stage,
          attempt: toNumber(item.attempt),
          maxAttempt: toNumber(item.max_attempt),
          errorMessage: item.error_message,
          startedAt: item.started_at,
          finishedAt: item.finished_at,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          durationMs: toNumber(item.duration_ms),
          runningDurationMs: item.finished_at ? 0 : toNumber(item.running_duration_ms),
        })),
      },
    }
  })

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }, 'ok')
})
