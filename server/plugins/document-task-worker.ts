import { analyzePdfBufferWithDocAi } from '~~/server/services/document/analysis'
import { convertWordBufferToPdf, isPdfDocument, isWordDocument } from '~~/server/services/document/convert'
import { buildDocumentObjectKey, getDocumentStorageByChannel, selectDocumentWriteStorage } from '~~/server/storage/document-storage'
import { shouldSkipBackgroundWorkers } from '~~/server/utils/background-workers'
import { withClient, withTransaction } from '~~/server/utils/db'
import {
  claimNextQueuedDocumentTask,
  finishDocumentTaskFailure,
  finishDocumentTaskSuccess,
  getTaskContextById,
  resetStaleDocumentTasks,
  setDocumentParseStatus,
  updateDocumentPageCount,
  updateResourceDocumentFileAsset,
} from '~~/server/utils/document-store'
import { resolvePlatformAiDocumentRuntime } from '~~/server/utils/platform-ai-channels'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'
import { enqueueResourceGovernanceTask } from '~~/server/utils/resource-knowledge-store'
import { captureServerException } from '~~/server/utils/sentry'

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
  const runtime = (await readEffectivePlatformRuntimeSettings()).runtime
  const documentRuntime = resolvePlatformAiDocumentRuntime(runtime)

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
    const sourceStorage = getDocumentStorageByChannel(context.document.storageProvider || 'local', runtime)
    const sourceBuffer = await sourceStorage.getObjectBuffer(context.document.objectKey)
    let parseBuffer = sourceBuffer
    let parseFileName = context.document.fileName
    let conversionPayload: Record<string, unknown> | null = null

    if (isWordDocument({ fileName: context.document.fileName, mimeType: context.document.mimeType })) {
      const converted = await convertWordBufferToPdf({
        fileName: context.document.fileName,
        sourceBuffer,
      })

      const convertedObjectKey = buildDocumentObjectKey(context.resource.contestId, converted.fileName)
      const storage = await selectDocumentWriteStorage({
        incomingBytes: converted.pdfBuffer.length,
        runtime,
      })
      await storage.putObject({
        key: convertedObjectKey,
        body: converted.pdfBuffer,
      })

      await withTransaction(undefined, async (db) => {
        await updateResourceDocumentFileAsset(db, {
          documentId: context.document.id,
          objectKey: convertedObjectKey,
          storageProvider: storage.channelId,
          fileName: converted.fileName,
          mimeType: 'application/pdf',
          fileSize: converted.pdfBuffer.length,
        })
      })

      parseBuffer = converted.pdfBuffer
      parseFileName = converted.fileName
      conversionPayload = {
        sourceFileName: context.document.fileName,
        sourceObjectKey: context.document.objectKey,
        convertedFileName: converted.fileName,
        convertedObjectKey,
      }
    }

    if (!isPdfDocument({ fileName: parseFileName, mimeType: context.document.mimeType })) {
      throw new Error('DOCUMENT_TYPE_NOT_SUPPORTED')
    }

    const parsed = await analyzePdfBufferWithDocAi(parseBuffer, {
      fileName: parseFileName,
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
        parserProvider: documentRuntime.provider,
        parserModel: documentRuntime.model,
        analysisJson: parsed.analysis,
        resultPayload: {
          source: parsed.analysis.source,
          pageCount: parsed.pageCount,
          conversion: conversionPayload,
        },
      })
      await enqueueResourceGovernanceTask(db, {
        contestId: context.resource.contestId,
        resourceId: context.resource.id,
        taskType: 'profile_analyze',
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
    captureServerException(error, {
      module: 'document-worker',
      taskId: context.task.id,
    })
  }

  return true
}

function logWorkerError(stage: 'bootstrap' | 'tick', error: unknown): void {
  const prefix = stage === 'bootstrap' ? '[document-worker] bootstrap failed:' : '[document-worker] tick failed:'
  console.error(prefix, toErrorMessage(error))
  captureServerException(error, {
    module: 'document-worker',
  })
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
  catch (error) {
    logWorkerError('tick', error)
  }
  finally {
    state.ticking = false
  }
}

export default defineNitroPlugin((nitroApp) => {
  if (shouldSkipBackgroundWorkers())
    return

  const state = getWorkerState()
  if (state.started)
    return

  state.started = true
  void withClient(undefined, async (db) => {
    await resetStaleDocumentTasks(db, {
      staleMinutes: 15,
    })
  }).catch((error) => {
    logWorkerError('bootstrap', error)
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
