export interface ProjectResourceRecycleWorkerRunRecord {
  id: string
  startedAt: string
  finishedAt: string
  durationMs: number
  purgedCount: number
  deletedObjects: number
  success: boolean
  errorMessage: string
}

export interface ProjectResourceRecycleWorkerState {
  started: boolean
  enabled: boolean
  ticking: boolean
  intervalMs: number
  retentionDays: number
  batchSize: number
  lastStartedAt: string
  lastFinishedAt: string
  lastSuccessAt: string
  lastError: string
  runCount: number
  successCount: number
  failureCount: number
  totalPurgedCount: number
  totalDeletedObjects: number
  lastPurgedCount: number
  lastDeletedObjects: number
  recentRuns: ProjectResourceRecycleWorkerRunRecord[]
}

const PROJECT_RESOURCE_RECYCLE_WORKER_STATE_KEY = Symbol.for('winloop.project-resource-recycle-worker.state.v1')
const PROJECT_RESOURCE_RECYCLE_WORKER_MAX_HISTORY = 20

function createDefaultState(): ProjectResourceRecycleWorkerState {
  return {
    started: false,
    enabled: false,
    ticking: false,
    intervalMs: 0,
    retentionDays: 30,
    batchSize: 200,
    lastStartedAt: '',
    lastFinishedAt: '',
    lastSuccessAt: '',
    lastError: '',
    runCount: 0,
    successCount: 0,
    failureCount: 0,
    totalPurgedCount: 0,
    totalDeletedObjects: 0,
    lastPurgedCount: 0,
    lastDeletedObjects: 0,
    recentRuns: [],
  }
}

export function getProjectResourceRecycleWorkerState(): ProjectResourceRecycleWorkerState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[PROJECT_RESOURCE_RECYCLE_WORKER_STATE_KEY] as ProjectResourceRecycleWorkerState | undefined
  if (existing)
    return existing

  const created = createDefaultState()
  globalRef[PROJECT_RESOURCE_RECYCLE_WORKER_STATE_KEY] = created
  return created
}

export function pushProjectResourceRecycleWorkerRunRecord(
  state: ProjectResourceRecycleWorkerState,
  record: ProjectResourceRecycleWorkerRunRecord,
): void {
  state.recentRuns.unshift(record)
  if (state.recentRuns.length <= PROJECT_RESOURCE_RECYCLE_WORKER_MAX_HISTORY)
    return
  state.recentRuns = state.recentRuns.slice(0, PROJECT_RESOURCE_RECYCLE_WORKER_MAX_HISTORY)
}
