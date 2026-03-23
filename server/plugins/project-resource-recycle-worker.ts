import { getDocumentStorage } from '~~/server/storage/document-storage'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { purgeExpiredProjectResourcesFromRecycleBinGlobal } from '~~/server/utils/project-resource-store'

const WORKER_STATE_KEY = Symbol.for('winloop.project-resource-recycle-worker.state')

interface WorkerState {
  started: boolean
  timer: NodeJS.Timeout | null
  ticking: boolean
}

function getWorkerState(): WorkerState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[WORKER_STATE_KEY] as WorkerState | undefined
  if (existing)
    return existing

  const created: WorkerState = {
    started: false,
    timer: null,
    ticking: false,
  }
  globalRef[WORKER_STATE_KEY] = created
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

async function runTick(state: WorkerState): Promise<void> {
  if (state.ticking)
    return

  state.ticking = true
  try {
    const runtime = readRuntimeSettings()
    if (!runtime.resourceRecycle.enabled)
      return

    const storage = getDocumentStorage()
    let totalPurged = 0
    let totalObjectDeleted = 0

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

      if (uploadObjectKeys.length > 0) {
        const deleteResults = await Promise.allSettled(uploadObjectKeys.map(objectKey => storage.deleteObject(objectKey)))
        totalObjectDeleted += deleteResults.filter(item => item.status === 'fulfilled').length
      }

      if (purged.length < runtime.resourceRecycle.batchSize)
        break
    }

    if (totalPurged > 0) {
      console.warn(`[project-resource-recycle-worker] purged=${totalPurged} deleted_objects=${totalObjectDeleted}`)
    }
  }
  catch (error) {
    logWorkerError('tick', error)
  }
  finally {
    state.ticking = false
  }
}

export default defineNitroPlugin((nitroApp) => {
  const state = getWorkerState()
  if (state.started)
    return

  state.started = true

  const runtime = readRuntimeSettings()
  if (!runtime.resourceRecycle.enabled)
    return

  void runTick(state).catch((error) => {
    logWorkerError('bootstrap', error)
  })

  state.timer = setInterval(() => {
    void runTick(state)
  }, runtime.resourceRecycle.intervalMs)
  state.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (state.timer)
      clearInterval(state.timer)
    state.timer = null
    state.started = false
  })
})
