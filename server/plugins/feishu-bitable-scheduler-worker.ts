import { runFeishuBitableSync } from '~~/server/services/feishu/bitable-sync-runner'
import { shouldSkipBackgroundWorkers } from '~~/server/utils/background-workers'
import { withTransaction } from '~~/server/utils/db'
import {
  claimNextDueFeishuBitableSync,
  completeScheduledFeishuSyncExecution,
  getFeishuBitableSyncById,
  releaseFeishuSyncScheduleLock,
} from '~~/server/utils/feishu-integration-store'
import { computeNextScheduledRunAtOrNull } from '~~/server/utils/feishu-task-schedule'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'
import { captureServerException } from '~~/server/utils/sentry'

const WORKER_RUNTIME_STATE_KEY = Symbol.for('winloop.feishu-bitable-scheduler-worker.runtime.v1')

interface WorkerRuntimeState {
  booted: boolean
  ticking: boolean
  timer: NodeJS.Timeout | null
  intervalMs: number
}

function getWorkerRuntimeState(): WorkerRuntimeState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[WORKER_RUNTIME_STATE_KEY] as WorkerRuntimeState | undefined
  if (existing)
    return existing

  const created: WorkerRuntimeState = {
    booted: false,
    ticking: false,
    timer: null,
    intervalMs: 0,
  }
  globalRef[WORKER_RUNTIME_STATE_KEY] = created
  return created
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return String(error.message || 'unknown error')
  return String(error)
}

function ensureTickTimer(intervalMs: number): void {
  const runtimeState = getWorkerRuntimeState()
  const nextInterval = Math.max(15_000, Math.min(24 * 60 * 60 * 1000, Math.round(Number(intervalMs) || 60_000)))

  if (runtimeState.timer && runtimeState.intervalMs === nextInterval)
    return

  if (runtimeState.timer)
    clearInterval(runtimeState.timer)

  runtimeState.intervalMs = nextInterval
  runtimeState.timer = setInterval(() => {
    void runTick().catch((error) => {
      console.error('[feishu-bitable-scheduler-worker] tick failed:', toErrorMessage(error))
      captureServerException(error, {
        module: 'feishu-bitable-scheduler-worker',
      })
    })
  }, nextInterval)
  runtimeState.timer.unref?.()
}

async function executeClaimedSync(input: {
  syncId: string
  actorUserId: string
  lockToken: string
}): Promise<void> {
  let lastError = ''

  try {
    const summary = await runFeishuBitableSync(undefined, {
      syncId: input.syncId,
      actorUserId: input.actorUserId,
      triggerSource: 'scheduled',
      onItemError(error, item) {
        const message = toErrorMessage(error)
        console.error('[feishu-bitable-scheduler-worker] sync item failed:', {
          syncId: input.syncId,
          syncItemId: item.id,
          error: message,
        })
        captureServerException(error, {
          module: 'feishu-bitable-scheduler-worker',
        })
      },
    })
    lastError = summary.errors.slice(0, 3).join('；')
  }
  catch (error) {
    lastError = toErrorMessage(error)
    console.error('[feishu-bitable-scheduler-worker] sync failed:', {
      syncId: input.syncId,
      error: lastError,
    })
    captureServerException(error, {
      module: 'feishu-bitable-scheduler-worker',
    })
  }

  let completed = false
  try {
    completed = await withTransaction(undefined, async (db) => {
      const latestSync = await getFeishuBitableSyncById(db, input.syncId)
      const nextRunAt = latestSync?.schedule.enabled
        ? computeNextScheduledRunAtOrNull(latestSync.schedule, { from: new Date() })
        : null
      return completeScheduledFeishuSyncExecution(db, {
        syncId: input.syncId,
        lockToken: input.lockToken,
        nextRunAt,
        lastError,
        lastRunAt: new Date().toISOString(),
      })
    })
  }
  catch (error) {
    console.error('[feishu-bitable-scheduler-worker] complete failed:', {
      syncId: input.syncId,
      error: toErrorMessage(error),
    })
    captureServerException(error, {
      module: 'feishu-bitable-scheduler-worker',
    })
  }

  if (!completed) {
    await withTransaction(undefined, async (db) => {
      await releaseFeishuSyncScheduleLock(db, {
        syncId: input.syncId,
        lockToken: input.lockToken,
      })
    }).catch((error) => {
      console.error('[feishu-bitable-scheduler-worker] release lock failed:', {
        syncId: input.syncId,
        error: toErrorMessage(error),
      })
      captureServerException(error, {
        module: 'feishu-bitable-scheduler-worker',
      })
    })
  }
}

async function runTick(): Promise<void> {
  const runtimeState = getWorkerRuntimeState()
  if (runtimeState.ticking)
    return

  runtimeState.ticking = true
  try {
    const { runtime } = await readEffectivePlatformRuntimeSettings()
    ensureTickTimer(runtime.feishuScheduler.intervalMs)

    if (!runtime.feishuScheduler.enabled)
      return

    for (let round = 0; round < runtime.feishuScheduler.batchSize; round += 1) {
      const claimed = await withTransaction(undefined, async (db) => {
        return claimNextDueFeishuBitableSync(db, {
          now: new Date(),
          lockTtlMs: runtime.feishuScheduler.lockTtlMs,
        })
      })
      if (!claimed)
        break

      const fallbackActorUserId = claimed.sync.updatedByUserId
        || claimed.sync.createdByUserId
      if (!fallbackActorUserId) {
        await withTransaction(undefined, async (db) => {
          await releaseFeishuSyncScheduleLock(db, {
            syncId: claimed.sync.id,
            lockToken: claimed.lockToken,
          })
        })
        continue
      }

      await executeClaimedSync({
        syncId: claimed.sync.id,
        actorUserId: fallbackActorUserId,
        lockToken: claimed.lockToken,
      })
    }
  }
  finally {
    runtimeState.ticking = false
  }
}

export default defineNitroPlugin((nitroApp) => {
  if (shouldSkipBackgroundWorkers())
    return

  const runtimeState = getWorkerRuntimeState()
  if (runtimeState.booted)
    return

  runtimeState.booted = true
  ensureTickTimer(60_000)

  void runTick().catch((error) => {
    console.error('[feishu-bitable-scheduler-worker] bootstrap failed:', toErrorMessage(error))
    captureServerException(error, {
      module: 'feishu-bitable-scheduler-worker',
    })
  })

  nitroApp.hooks.hookOnce('close', () => {
    if (runtimeState.timer)
      clearInterval(runtimeState.timer)
    runtimeState.timer = null
    runtimeState.booted = false
    runtimeState.ticking = false
    runtimeState.intervalMs = 0
  })
})
