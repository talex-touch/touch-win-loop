import { runWorkflow } from '~~/server/services/workflow/workflow-orchestrator'
import { withTransaction } from '~~/server/utils/db'
import {
  claimNextDueFeishuBitableSyncItem,
  completeScheduledFeishuSyncItemExecution,
  getFeishuBitableSyncItemById,
  releaseFeishuSyncItemScheduleLock,
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

async function executeClaimedTask(input: {
  syncItemId: string
  actorUserId: string
  lockToken: string
}): Promise<void> {
  let lastError = ''

  try {
    await runWorkflow({
      providerName: 'feishu_bitable',
      syncItemId: input.syncItemId,
      actorUserId: input.actorUserId,
      triggerSource: 'scheduled',
    })
  }
  catch (error) {
    lastError = toErrorMessage(error)
    console.error('[feishu-bitable-scheduler-worker] task failed:', {
      syncItemId: input.syncItemId,
      error: lastError,
    })
  }

  let completed = false
  try {
    completed = await withTransaction(undefined, async (db) => {
      const latestTask = await getFeishuBitableSyncItemById(db, input.syncItemId)
      const nextRunAt = latestTask?.schedule.enabled
        ? computeNextScheduledRunAtOrNull(latestTask.schedule, { from: new Date() })
        : null
      return completeScheduledFeishuSyncItemExecution(db, {
        syncItemId: input.syncItemId,
        lockToken: input.lockToken,
        nextRunAt,
        lastError,
        lastRunAt: new Date().toISOString(),
      })
    })
  }
  catch (error) {
    console.error('[feishu-bitable-scheduler-worker] complete failed:', {
      syncItemId: input.syncItemId,
      error: toErrorMessage(error),
    })
  }

  if (!completed) {
    await withTransaction(undefined, async (db) => {
      await releaseFeishuSyncItemScheduleLock(db, {
        syncItemId: input.syncItemId,
        lockToken: input.lockToken,
      })
    }).catch((error) => {
      console.error('[feishu-bitable-scheduler-worker] release lock failed:', {
        syncItemId: input.syncItemId,
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
        return claimNextDueFeishuBitableSyncItem(db, {
          now: new Date(),
          lockTtlMs: runtime.feishuScheduler.lockTtlMs,
        })
      })
      if (!claimed)
        break

      const fallbackActorUserId = claimed.item.updatedByUserId
        || claimed.item.createdByUserId
      if (!fallbackActorUserId) {
        await withTransaction(undefined, async (db) => {
          await releaseFeishuSyncItemScheduleLock(db, {
            syncItemId: claimed.item.id,
            lockToken: claimed.lockToken,
          })
        })
        continue
      }

      await executeClaimedTask({
        syncItemId: claimed.item.id,
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
