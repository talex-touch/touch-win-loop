import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { getProjectResourceRecycleWorkerState } from '~~/server/utils/project-resource-recycle-worker-state'

interface RecycleBinOverviewRow {
  archived_count: string
  archived_upload_count: string
  oldest_archived_at: string | null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看回收站清理任务状态。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40394)
  }

  const workerState = getProjectResourceRecycleWorkerState()
  const recycleBinOverview = await withClient(event, async (db) => {
    const result = await db.query<RecycleBinOverviewRow>(
      `SELECT
        COUNT(*)::TEXT AS archived_count,
        COUNT(*) FILTER (WHERE source = 'upload')::TEXT AS archived_upload_count,
        MIN(updated_at)::TEXT AS oldest_archived_at
       FROM project_resources
       WHERE status = 'archived'`,
    )
    return result.rows[0] || {
      archived_count: '0',
      archived_upload_count: '0',
      oldest_archived_at: null,
    }
  })

  return ok({
    worker: {
      started: workerState.started,
      enabled: workerState.enabled,
      ticking: workerState.ticking,
      intervalMs: workerState.intervalMs,
      retentionDays: workerState.retentionDays,
      batchSize: workerState.batchSize,
      lastStartedAt: workerState.lastStartedAt,
      lastFinishedAt: workerState.lastFinishedAt,
      lastSuccessAt: workerState.lastSuccessAt,
      lastError: workerState.lastError,
      runCount: workerState.runCount,
      successCount: workerState.successCount,
      failureCount: workerState.failureCount,
      totalPurgedCount: workerState.totalPurgedCount,
      totalDeletedObjects: workerState.totalDeletedObjects,
      lastPurgedCount: workerState.lastPurgedCount,
      lastDeletedObjects: workerState.lastDeletedObjects,
    },
    recycleBin: {
      archivedCount: Number(recycleBinOverview.archived_count || '0'),
      archivedUploadCount: Number(recycleBinOverview.archived_upload_count || '0'),
      oldestArchivedAt: recycleBinOverview.oldest_archived_at || '',
    },
    recentRuns: workerState.recentRuns.map(item => ({
      id: item.id,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      durationMs: item.durationMs,
      purgedCount: item.purgedCount,
      deletedObjects: item.deletedObjects,
      success: item.success,
      errorMessage: item.errorMessage,
    })),
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
