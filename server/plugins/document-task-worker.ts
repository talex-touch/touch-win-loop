import { analyzePdfBufferWithDocAi } from '~~/server/services/document/analysis'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { withClient, withTransaction } from '~~/server/utils/db'
import {
  claimNextQueuedDocumentTask,
  finishDocumentTaskFailure,
  finishDocumentTaskSuccess,
  getTaskContextById,
  resetStaleDocumentTasks,
  setDocumentParseStatus,
  updateDocumentPageCount,
} from '~~/server/utils/document-store'
import { readRuntimeSettings } from '~~/server/utils/env'

const WORKER_STATE_KEY = Symbol.for('winloop.document-worker.state')

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

async function processSingleTask(): Promise<boolean> {
  const runtime = readRuntimeSettings()
  const storage = getDocumentStorage()

  const context = await withTransaction(undefined, async (db) => {
    const task = await claimNextQueuedDocumentTask(db)
    if (!task)
      return null

    await setDocumentParseStatus(db, {
      documentId: task.documentId,
      parseStatus: 'processing',
      parseError: '',
    })

    return getTaskContextById(db, {
      taskId: task.id,
    })
  })

  if (!context)
    return false

  try {
    const buffer = await storage.getObjectBuffer(context.document.objectKey)
    const parsed = await analyzePdfBufferWithDocAi(buffer, {
      fileName: context.document.fileName,
      runtime,
    })

    await withTransaction(undefined, async (db) => {
      await updateDocumentPageCount(db, {
        documentId: context.document.id,
        pageCount: parsed.pageCount,
      })
      await finishDocumentTaskSuccess(db, {
        taskId: context.task.id,
        documentId: context.document.id,
        parserProvider: runtime.docAi.provider,
        parserModel: runtime.docAi.model,
        analysisJson: parsed.analysis,
        resultPayload: {
          source: parsed.analysis.source,
          pageCount: parsed.pageCount,
        },
      })
    })
  }
  catch (error) {
    const errorMessage = toErrorMessage(error)
    await withTransaction(undefined, async (db) => {
      await finishDocumentTaskFailure(db, {
        taskId: context.task.id,
        documentId: context.document.id,
        errorMessage,
        resultPayload: {
          message: errorMessage,
        },
      })
    })
  }

  return true
}

async function runTick(state: WorkerState): Promise<void> {
  if (state.ticking)
    return

  state.ticking = true
  try {
    let count = 0
    while (count < 2) {
      const hasTask = await processSingleTask()
      if (!hasTask)
        break
      count += 1
    }
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
  void withClient(undefined, async (db) => {
    await resetStaleDocumentTasks(db, {
      staleMinutes: 15,
    })
  })

  const intervalMs = 2500
  state.timer = setInterval(() => {
    void runTick(state)
  }, intervalMs)
  state.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (state.timer)
      clearInterval(state.timer)
    state.timer = null
    state.started = false
  })
})
