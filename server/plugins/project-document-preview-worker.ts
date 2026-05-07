import { convertOfficeToPdfByOnlyOffice } from '~~/server/services/document/onlyoffice-converter'
import { buildDocumentObjectKey, selectDocumentWriteStorage } from '~~/server/storage/document-storage'
import { shouldSkipBackgroundWorkers } from '~~/server/utils/background-workers'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'
import {
  getProjectDocumentPreviewWorkerState,
  pushProjectDocumentPreviewWorkerRunRecord,
} from '~~/server/utils/project-document-preview-worker-state'
import { markProjectKnowledgeSourceStale } from '~~/server/utils/project-knowledge-store'
import { buildOnlyOfficeProjectSourceUrl } from '~~/server/utils/project-resource-access-url'
import {
  claimNextQueuedProjectDocumentTask,
  finishProjectDocumentTaskFailure,
  finishProjectDocumentTaskSuccess,
  getProjectDocumentByTaskId,
  isOnlyOfficeConvertible,
  resetStaleProjectDocumentTasks,
  setProjectDocumentPreviewState,
  updateProjectDocumentPreviewAsset,
  updateProjectDocumentTaskProgress,
} from '~~/server/utils/project-resource-document-store'
import { captureServerException } from '~~/server/utils/sentry'
import {
  buildOnlyOfficeUserFacingErrorMessage,
  parseOnlyOfficeConvertErrorMessage,
} from '~~/shared/constants/onlyoffice'

const WORKER_RUNTIME_STATE_KEY = Symbol.for('winloop.project-document-preview-worker.runtime.v1')

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

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return normalizeString(error.message) || 'unknown error'
  return normalizeString(error) || 'unknown error'
}

function redactUrl(rawUrl: string): string {
  const normalized = normalizeString(rawUrl)
  if (!normalized)
    return ''

  try {
    const parsed = new URL(normalized)
    if (parsed.searchParams.has('token'))
      parsed.searchParams.set('token', '[REDACTED]')
    return parsed.toString()
  }
  catch {
    return normalized.replace(/token=[^&]+/gi, 'token=[REDACTED]')
  }
}

function toUserFacingPreviewError(rawErrorMessage: string): string {
  const normalized = normalizeString(rawErrorMessage)
  if (!normalized)
    return '文件转换失败，请稍后重试。'
  if (normalized === 'ONLYOFFICE_CONVERT_UNSUPPORTED_TYPE')
    return '当前文件类型暂不支持转换预览，请下载源文件查看。'
  if (normalized === 'ONLYOFFICE_ENDPOINT_NOT_CONFIGURED')
    return '预览服务未配置（ONLYOFFICE endpoint 缺失），请联系管理员。'
  if (normalized === 'ONLYOFFICE_SOURCE_BASE_URL_NOT_CONFIGURED')
    return '预览服务缺少对外 sourceBaseURL，当前无法生成 ONLYOFFICE 可访问的源文件地址，请联系管理员配置 WINLOOP_PUBLIC_BASE_URL。'
  if (normalized.startsWith('ONLYOFFICE_CONVERT_TIMEOUT:'))
    return '文件转换超时，请稍后重试。'
  if (normalized.startsWith('ONLYOFFICE_CONVERT_HTTP_FAILED:'))
    return '转换服务请求失败，请稍后重试。'
  if (normalized.startsWith('ONLYOFFICE_CONVERT_DOWNLOAD_FAILED:'))
    return '转换完成后获取 PDF 失败，请稍后重试。'
  if (normalized === 'ONLYOFFICE_CONVERT_INVALID_RESPONSE')
    return '转换服务返回了无法识别的响应，请联系管理员检查服务。'
  if (normalized === 'ONLYOFFICE_CONVERT_MISSING_FILE_URL')
    return '转换服务未返回 PDF 地址，请联系管理员检查服务。'
  return buildOnlyOfficeUserFacingErrorMessage(normalized)
}

let lastSourceBaseGuardWarnAtMs = 0

function shouldPauseTaskConsumption(sourceBaseURL: string, onlyOfficeEndpoint: string): boolean {
  const normalizedEndpoint = normalizeString(onlyOfficeEndpoint)
  if (!normalizedEndpoint)
    return false
  return !normalizeString(sourceBaseURL)
}

async function processSingleTask(): Promise<'none' | 'success' | 'failure'> {
  const { runtime } = await readEffectivePlatformRuntimeSettings()

  const context = await withTransaction(undefined, async (db) => {
    const task = await claimNextQueuedProjectDocumentTask(db)
    if (!task)
      return null

    const context = await getProjectDocumentByTaskId(db, { taskId: task.id })
    if (!context)
      return null

    await setProjectDocumentPreviewState(db, {
      documentId: context.document.id,
      status: 'converting',
      stage: 'converting',
      progressPercent: 15,
      etaSeconds: 0,
      error: '',
      startedAt: new Date().toISOString(),
      finishedAt: null,
    })

    await updateProjectDocumentTaskProgress(db, {
      taskId: task.id,
      stage: 'converting',
      etaSeconds: 0,
      resultPayload: {
        attempt: task.attempt,
      },
    })

    return context
  })

  if (!context)
    return 'none'

  const retryLimit = Math.max(1, runtime.onlyOffice.retryLimit)
  const taskStartedAtMs = Date.now()
  let sourceUrl = ''

  console.warn('[project-document-preview-worker] task_started', {
    taskId: context.task.id,
    documentId: context.document.id,
    projectId: context.document.projectId,
    resourceId: context.document.projectResourceId,
    attempt: context.task.attempt,
    retryLimit,
    sourceFileName: context.document.sourceFileName || context.document.fileName,
    sourceMimeType: context.document.sourceMimeType || context.document.mimeType,
  })

  let taskResult: 'success' | 'failure' = 'failure'

  try {
    const sourceFileName = context.document.sourceFileName || context.document.fileName
    const sourceMimeType = context.document.sourceMimeType || context.document.mimeType
    if (!isOnlyOfficeConvertible(sourceFileName, sourceMimeType)) {
      throw new Error('ONLYOFFICE_CONVERT_UNSUPPORTED_TYPE')
    }

    const sourceAccess = buildOnlyOfficeProjectSourceUrl({
      projectId: context.document.projectId,
      resourceId: context.document.projectResourceId,
      ttlSeconds: 60 * 10,
    })
    sourceUrl = sourceAccess.url

    console.warn('[project-document-preview-worker] converting', {
      taskId: context.task.id,
      documentId: context.document.id,
      sourceBaseURL: runtime.onlyOffice.sourceBaseURL,
      onlyOfficeEndpoint: runtime.onlyOffice.endpoint,
      sourceUrl: redactUrl(sourceUrl),
      sourceUrlExpiresAt: sourceAccess.expiresAt,
    })

    const converted = await convertOfficeToPdfByOnlyOffice({
      fileName: sourceFileName,
      sourceUrl,
    })

    await withTransaction(undefined, async (db) => {
      await setProjectDocumentPreviewState(db, {
        documentId: context.document.id,
        status: 'finalizing',
        stage: 'finalizing',
        progressPercent: 92,
        etaSeconds: 2,
        error: '',
      })
      await updateProjectDocumentTaskProgress(db, {
        taskId: context.task.id,
        stage: 'finalizing',
        etaSeconds: 2,
      })
    })

    const previewObjectKey = buildDocumentObjectKey(`project-${context.document.projectId}`, converted.fileName)
    const storage = await selectDocumentWriteStorage({
      incomingBytes: converted.pdfBuffer.length,
      runtime,
    })
    await storage.putObject({
      key: previewObjectKey,
      body: converted.pdfBuffer,
    })

    await withTransaction(undefined, async (db) => {
      await updateProjectDocumentPreviewAsset(db, {
        documentId: context.document.id,
        previewObjectKey,
        previewStorageProvider: storage.channelId,
        previewFileName: converted.fileName,
        previewMimeType: 'application/pdf',
        previewFileSize: converted.pdfBuffer.length,
        pageCount: Math.max(0, context.document.pageCount || 0),
      })
      await finishProjectDocumentTaskSuccess(db, {
        taskId: context.task.id,
        documentId: context.document.id,
        resultPayload: {
          conversion: 'onlyoffice',
          percent: converted.percent,
          previewObjectKey,
          previewFileName: converted.fileName,
          previewSize: converted.pdfBuffer.length,
        },
      })
      await markProjectKnowledgeSourceStale(db, {
        projectId: context.document.projectId,
        resourceId: context.document.projectResourceId,
        autoEnqueue: true,
      })
    })

    console.warn('[project-document-preview-worker] task_succeeded', {
      taskId: context.task.id,
      documentId: context.document.id,
      durationMs: Date.now() - taskStartedAtMs,
      outputFileName: converted.fileName,
      outputFileSize: converted.pdfBuffer.length,
      percent: converted.percent,
    })
    taskResult = 'success'
  }
  catch (error) {
    const rawErrorMessage = toErrorMessage(error)
    const parsedOnlyOfficeError = parseOnlyOfficeConvertErrorMessage(rawErrorMessage)
    const errorMessage = toUserFacingPreviewError(rawErrorMessage)
    const requeue = context.task.attempt < retryLimit
    await withTransaction(undefined, async (db) => {
      await finishProjectDocumentTaskFailure(db, {
        taskId: context.task.id,
        documentId: context.document.id,
        errorMessage,
        requeue,
        resultPayload: {
          message: errorMessage,
          rawMessage: rawErrorMessage,
          provider: 'onlyoffice',
          onlyOfficeErrorCode: parsedOnlyOfficeError.code,
          onlyOfficeErrorDetail: parsedOnlyOfficeError.detail,
          attempt: context.task.attempt,
          retryLimit,
          requeue,
        },
      })
    })

    console.error('[project-document-preview-worker] task_failed', {
      taskId: context.task.id,
      documentId: context.document.id,
      projectId: context.document.projectId,
      resourceId: context.document.projectResourceId,
      attempt: context.task.attempt,
      retryLimit,
      requeue,
      durationMs: Date.now() - taskStartedAtMs,
      sourceBaseURL: runtime.onlyOffice.sourceBaseURL,
      sourceUrl: redactUrl(sourceUrl),
      onlyOfficeEndpoint: runtime.onlyOffice.endpoint,
      onlyOfficeErrorCode: parsedOnlyOfficeError.code,
      onlyOfficeErrorDetail: parsedOnlyOfficeError.detail,
      userFacingError: errorMessage,
      rawError: rawErrorMessage,
      errorStack: error instanceof Error ? normalizeString(error.stack) : '',
    })
    captureServerException(error, {
      module: 'project-document-preview-worker',
      projectId: context.document.projectId,
      taskId: context.task.id,
    })
  }

  return taskResult
}

function logWorkerError(stage: 'bootstrap' | 'tick', error: unknown): void {
  const prefix = stage === 'bootstrap'
    ? '[project-document-preview-worker] bootstrap failed:'
    : '[project-document-preview-worker] tick failed:'
  console.error(prefix, toErrorMessage(error))
  captureServerException(error, {
    module: 'project-document-preview-worker',
  })
}

async function runTick(): Promise<void> {
  const state = getProjectDocumentPreviewWorkerState()
  if (state.ticking)
    return

  const { runtime } = await readEffectivePlatformRuntimeSettings()
  state.enabled = Boolean(runtime.onlyOffice.workerEnabled)
  state.intervalMs = Math.max(1000, runtime.onlyOffice.workerIntervalMs)
  const batchSize = Math.max(1, runtime.onlyOffice.workerBatchSize)
  state.batchSize = batchSize

  if (!state.enabled)
    return

  if (shouldPauseTaskConsumption(runtime.onlyOffice.sourceBaseURL, runtime.onlyOffice.endpoint)) {
    const warningMessage = 'ONLYOFFICE sourceBaseURL 未配置，已暂停任务消费。请设置 WINLOOP_PUBLIC_BASE_URL，确保 worker 能生成可被 ONLYOFFICE 访问的绝对地址。'
    state.lastError = warningMessage
    const now = Date.now()
    if (now - lastSourceBaseGuardWarnAtMs >= 60_000) {
      lastSourceBaseGuardWarnAtMs = now
      console.warn('[project-document-preview-worker] source_base_unresolved', {
        sourceBaseURL: runtime.onlyOffice.sourceBaseURL,
        onlyOfficeEndpoint: runtime.onlyOffice.endpoint,
        warningMessage,
      })
    }
    return
  }

  state.ticking = true
  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()
  state.lastStartedAt = startedAt
  state.lastError = ''

  let processedTaskCount = 0
  let succeededTaskCount = 0
  let failedTaskCount = 0
  let success = false
  let errorMessage = ''

  try {
    for (let index = 0; index < batchSize; index += 1) {
      const taskResult = await processSingleTask()
      if (taskResult === 'none')
        break
      processedTaskCount += 1
      if (taskResult === 'success')
        succeededTaskCount += 1
      else
        failedTaskCount += 1
    }
    success = true
  }
  catch (error) {
    errorMessage = toErrorMessage(error)
    state.lastError = errorMessage
    logWorkerError('tick', error)
  }
  finally {
    const finishedAtMs = Date.now()
    const finishedAt = new Date(finishedAtMs).toISOString()

    state.ticking = false
    state.lastFinishedAt = finishedAt
    state.lastDurationMs = Math.max(0, finishedAtMs - startedAtMs)
    state.runCount += 1
    state.processedTaskCount += processedTaskCount
    state.succeededTaskCount += succeededTaskCount
    state.failedTaskCount += failedTaskCount

    if (success) {
      state.successCount += 1
      state.lastSuccessAt = finishedAt
    }
    else {
      state.failureCount += 1
    }

    pushProjectDocumentPreviewWorkerRunRecord(state, {
      id: `${startedAtMs}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt,
      finishedAt,
      durationMs: state.lastDurationMs,
      processedTaskCount,
      succeededTaskCount,
      failedTaskCount,
      success,
      errorMessage,
    })
  }
}

export default defineNitroPlugin((nitroApp) => {
  if (shouldSkipBackgroundWorkers())
    return

  const runtimeState = getWorkerRuntimeState()
  if (runtimeState.booted)
    return
  runtimeState.booted = true

  const state = getProjectDocumentPreviewWorkerState()
  state.started = true
  void withClient(undefined, async (db) => {
    await resetStaleProjectDocumentTasks(db, {
      staleMinutes: 15,
    })
  }).catch((error) => {
    logWorkerError('bootstrap', error)
  })

  runtimeState.timer = setInterval(() => {
    void runTick()
  }, 5000)
  runtimeState.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (runtimeState.timer)
      clearInterval(runtimeState.timer)
    runtimeState.timer = null
    runtimeState.booted = false
    state.started = false
    state.ticking = false
  })

  void runTick().catch((error) => {
    logWorkerError('bootstrap', error)
  })
})
