import { runWorkflow } from '~~/server/services/workflow/workflow-orchestrator'
import { withTransaction } from '~~/server/utils/db'
import {
  claimNextDueFeishuBitableSync,
  completeScheduledFeishuSyncExecution,
  getFeishuBitableSyncById,
  listFeishuBitableSyncItems,
  releaseFeishuSyncScheduleLock,
} from '~~/server/utils/feishu-integration-store'
import { computeNextScheduledRunAtOrNull } from '~~/server/utils/feishu-task-schedule'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

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
    const items = await withTransaction(undefined, async (db) => {
      return listFeishuBitableSyncItems(db, {
        syncId: input.syncId,
      })
    })
    if (!items.length) {
      lastError = '当前无已启用的子表同步项。'
    }
    else {
      const errors: string[] = []
      for (const item of items) {
        try {
          await runWorkflow({
            providerName: 'feishu_bitable',
            syncItemId: item.id,
            actorUserId: input.actorUserId,
            triggerSource: 'scheduled',
          })
        }
        catch (error) {
          const message = toErrorMessage(error)
          errors.push(`${item.name || item.id}: ${message}`)
          console.error('[feishu-bitable-scheduler-worker] sync item failed:', {
            syncId: input.syncId,
            syncItemId: item.id,
            error: message,
          })
        }
      }
      lastError = errors.slice(0, 3).join('；')
    }
  }
  catch (error) {
    lastError = toErrorMessage(error)
    console.error('[feishu-bitable-scheduler-worker] sync failed:', {
      syncId: input.syncId,
      error: lastError,
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
  const runtimeState = getWorkerRuntimeState()
  if (runtimeState.booted)
    return

  runtimeState.booted = true
  ensureTickTimer(60_000)

  void runTick().catch((error) => {
    console.error('[feishu-bitable-scheduler-worker] bootstrap failed:', toErrorMessage(error))
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
