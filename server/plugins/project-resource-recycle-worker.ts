import { getDocumentStorage } from '~~/server/storage/document-storage'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  getProjectResourceRecycleWorkerState,
  pushProjectResourceRecycleWorkerRunRecord,
} from '~~/server/utils/project-resource-recycle-worker-state'
import {
  listUnreferencedUploadObjectKeys,
  purgeExpiredProjectResourcesFromRecycleBinGlobal,
} from '~~/server/utils/project-resource-store'

const WORKER_RUNTIME_STATE_KEY = Symbol.for('winloop.project-resource-recycle-worker.runtime.v1')

interface WorkerRuntimeState {
  booted: boolean
  timer: NodeJS.Timeout | null
}

function getWorkerRuntimeState(): WorkerRuntimeState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[WORKER_RUNTIME_STATE_KEY] as WorkerRuntimeState | undefined
  if (existing)
    return existing

  const created: WorkerRuntimeState = {
    booted: false,
    timer: null,
  }
  globalRef[WORKER_RUNTIME_STATE_KEY] = created
  return created
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return error.message || 'unknown error'
  return String(error)
}

function logWorkerError(stage: 'bootstrap' | 'tick', error: unknown): void {
  const prefix = stage === 'bootstrap'
    ? '[project-resource-recycle-worker] bootstrap failed:'
    : '[project-resource-recycle-worker] tick failed:'
  console.error(prefix, toErrorMessage(error))
}

async function runTick(): Promise<void> {
  const workerState = getProjectResourceRecycleWorkerState()
  if (workerState.ticking)
    return

  const runtime = readRuntimeSettings()
  workerState.enabled = runtime.resourceRecycle.enabled
  workerState.intervalMs = runtime.resourceRecycle.intervalMs
  workerState.retentionDays = runtime.resourceRecycle.retentionDays
  workerState.batchSize = runtime.resourceRecycle.batchSize

  if (!workerState.enabled)
    return

  workerState.ticking = true
  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()
  workerState.lastStartedAt = startedAt
  workerState.lastError = ''

  let totalPurged = 0
  let totalObjectDeleted = 0
  let success = false
  let errorMessage = ''

  try {
    const storage = getDocumentStorage()

    for (let round = 0; round < 5; round += 1) {
      const purged = await withTransaction(undefined, async (db) => {
        return purgeExpiredProjectResourcesFromRecycleBinGlobal(db, {
          retentionDays: runtime.resourceRecycle.retentionDays,
          limit: runtime.resourceRecycle.batchSize,
        })
      })

      if (purged.length === 0)
        break

      totalPurged += purged.length

      const uploadObjectKeys = purged
        .filter(item => item.source === 'upload' && item.objectKey)
        .map(item => item.objectKey)

      const deletableObjectKeys = uploadObjectKeys.length > 0
        ? await withTransaction(undefined, async db => listUnreferencedUploadObjectKeys(db, uploadObjectKeys))
        : []

      if (deletableObjectKeys.length > 0) {
        const deleteResults = await Promise.allSettled(deletableObjectKeys.map(objectKey => storage.deleteObject(objectKey)))
        totalObjectDeleted += deleteResults.filter(item => item.status === 'fulfilled').length
      }

      if (purged.length < runtime.resourceRecycle.batchSize)
        break
    }

    success = true
    if (totalPurged > 0) {
      console.warn(`[project-resource-recycle-worker] purged=${totalPurged} deleted_objects=${totalObjectDeleted}`)
    }
  }
  catch (error) {
    errorMessage = toErrorMessage(error)
    workerState.lastError = errorMessage
    logWorkerError('tick', error)
  }
  finally {
    const finishedAtMs = Date.now()
    const finishedAt = new Date(finishedAtMs).toISOString()

    workerState.ticking = false
    workerState.lastFinishedAt = finishedAt
    workerState.runCount += 1
    workerState.lastPurgedCount = totalPurged
    workerState.lastDeletedObjects = totalObjectDeleted
    workerState.totalPurgedCount += totalPurged
    workerState.totalDeletedObjects += totalObjectDeleted

    if (success) {
      workerState.successCount += 1
      workerState.lastSuccessAt = finishedAt
    }
    else {
      workerState.failureCount += 1
    }

    pushProjectResourceRecycleWorkerRunRecord(workerState, {
      id: `${startedAtMs}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAtMs - startedAtMs),
      purgedCount: totalPurged,
      deletedObjects: totalObjectDeleted,
      success,
      errorMessage,
    })
  }
}

export default defineNitroPlugin((nitroApp) => {
  const runtimeState = getWorkerRuntimeState()
  if (runtimeState.booted)
    return

  runtimeState.booted = true
  const workerState = getProjectResourceRecycleWorkerState()
  workerState.started = true
  const runtime = readRuntimeSettings()
  workerState.enabled = runtime.resourceRecycle.enabled
  workerState.intervalMs = runtime.resourceRecycle.intervalMs
  workerState.retentionDays = runtime.resourceRecycle.retentionDays
  workerState.batchSize = runtime.resourceRecycle.batchSize

  if (!workerState.enabled)
    return

  void runTick().catch((error) => {
    logWorkerError('bootstrap', error)
  })

  runtimeState.timer = setInterval(() => {
    void runTick()
  }, runtime.resourceRecycle.intervalMs)
  runtimeState.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (runtimeState.timer)
      clearInterval(runtimeState.timer)
    runtimeState.timer = null
    runtimeState.booted = false
    workerState.started = false
    workerState.ticking = false
  })
})
