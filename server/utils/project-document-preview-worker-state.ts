export interface ProjectDocumentPreviewWorkerRunRecord {
  id: string
  startedAt: string
  finishedAt: string
  durationMs: number
  processedTaskCount: number
  succeededTaskCount: number
  failedTaskCount: number
  success: boolean
  errorMessage: string
}

export interface ProjectDocumentPreviewWorkerState {
  started: boolean
  enabled: boolean
  ticking: boolean
  intervalMs: number
  batchSize: number
  lastStartedAt: string
  lastFinishedAt: string
  lastSuccessAt: string
  lastError: string
  runCount: number
  successCount: number
  failureCount: number
  processedTaskCount: number
  succeededTaskCount: number
  failedTaskCount: number
  lastDurationMs: number
  recentRuns: ProjectDocumentPreviewWorkerRunRecord[]
}

const PROJECT_DOCUMENT_PREVIEW_WORKER_STATE_KEY = Symbol.for('winloop.project-document-preview-worker.state.v1')
const PROJECT_DOCUMENT_PREVIEW_WORKER_MAX_HISTORY = 30

function createDefaultState(): ProjectDocumentPreviewWorkerState {
  return {
    started: false,
    enabled: false,
    ticking: false,
    intervalMs: 0,
    batchSize: 0,
    lastStartedAt: '',
    lastFinishedAt: '',
    lastSuccessAt: '',
    lastError: '',
    runCount: 0,
    successCount: 0,
    failureCount: 0,
    processedTaskCount: 0,
    succeededTaskCount: 0,
    failedTaskCount: 0,
    lastDurationMs: 0,
    recentRuns: [],
  }
}

export function getProjectDocumentPreviewWorkerState(): ProjectDocumentPreviewWorkerState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[PROJECT_DOCUMENT_PREVIEW_WORKER_STATE_KEY] as ProjectDocumentPreviewWorkerState | undefined
  if (existing)
    return existing

  const created = createDefaultState()
  globalRef[PROJECT_DOCUMENT_PREVIEW_WORKER_STATE_KEY] = created
  return created
}

export function pushProjectDocumentPreviewWorkerRunRecord(
  state: ProjectDocumentPreviewWorkerState,
  record: ProjectDocumentPreviewWorkerRunRecord,
): void {
  state.recentRuns.unshift(record)
  if (state.recentRuns.length <= PROJECT_DOCUMENT_PREVIEW_WORKER_MAX_HISTORY)
    return
  state.recentRuns = state.recentRuns.slice(0, PROJECT_DOCUMENT_PREVIEW_WORKER_MAX_HISTORY)
}
