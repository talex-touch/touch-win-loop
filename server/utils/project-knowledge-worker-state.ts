export interface ProjectKnowledgeWorkerRunRecord {
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

export interface ProjectKnowledgeWorkerState {
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
  recentRuns: ProjectKnowledgeWorkerRunRecord[]
}

const PROJECT_KNOWLEDGE_WORKER_STATE_KEY = Symbol.for('winloop.project-knowledge-worker.state.v2')
const PROJECT_KNOWLEDGE_WORKER_MAX_HISTORY = 30

function createDefaultState(): ProjectKnowledgeWorkerState {
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

export function getProjectKnowledgeWorkerState(): ProjectKnowledgeWorkerState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[PROJECT_KNOWLEDGE_WORKER_STATE_KEY] as ProjectKnowledgeWorkerState | undefined
  if (existing)
    return existing

  const created = createDefaultState()
  globalRef[PROJECT_KNOWLEDGE_WORKER_STATE_KEY] = created
  return created
}

export function pushProjectKnowledgeWorkerRunRecord(
  state: ProjectKnowledgeWorkerState,
  record: ProjectKnowledgeWorkerRunRecord,
): void {
  state.recentRuns.unshift(record)
  if (state.recentRuns.length <= PROJECT_KNOWLEDGE_WORKER_MAX_HISTORY)
    return
  state.recentRuns = state.recentRuns.slice(0, PROJECT_KNOWLEDGE_WORKER_MAX_HISTORY)
}
