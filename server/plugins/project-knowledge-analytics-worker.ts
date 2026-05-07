import { randomUUID } from 'node:crypto'
import { shouldSkipBackgroundWorkers } from '~~/server/utils/background-workers'
import { withClient, withTransaction } from '~~/server/utils/db'
import {
  claimNextProjectKnowledgeAnalyticsJob,
  completeProjectKnowledgeAnalyticsJobFailure,
  completeProjectKnowledgeAnalyticsJobSuccess,
  materializeProjectKnowledgeRelations,
  materializeProjectKnowledgeSemanticLayouts,
  materializeProjectKnowledgeSnapshot,
} from '~~/server/utils/project-knowledge-analytics-store'
import { captureServerException } from '~~/server/utils/sentry'

const PROJECT_KNOWLEDGE_ANALYTICS_WORKER_TIMER_KEY = Symbol.for('winloop.project-knowledge-analytics-worker.timer.v1')
const PROJECT_KNOWLEDGE_ANALYTICS_WORKER_STATE_KEY = Symbol.for('winloop.project-knowledge-analytics-worker.state.v1')
const PROJECT_KNOWLEDGE_ANALYTICS_WORKER_INTERVAL_MS = 6000
const PROJECT_KNOWLEDGE_ANALYTICS_WORKER_BATCH_SIZE = 1

interface WorkerTimerState {
  timer: NodeJS.Timeout | null
}

interface AnalyticsWorkerState {
  started: boolean
  ticking: boolean
  lastStartedAt: string
  lastFinishedAt: string
  lastSuccessAt: string
  lastError: string
  runCount: number
}

function getTimerState(): WorkerTimerState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[PROJECT_KNOWLEDGE_ANALYTICS_WORKER_TIMER_KEY] as WorkerTimerState | undefined
  if (existing)
    return existing
  const created: WorkerTimerState = { timer: null }
  globalRef[PROJECT_KNOWLEDGE_ANALYTICS_WORKER_TIMER_KEY] = created
  return created
}

function getWorkerState(): AnalyticsWorkerState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[PROJECT_KNOWLEDGE_ANALYTICS_WORKER_STATE_KEY] as AnalyticsWorkerState | undefined
  if (existing)
    return existing
  const created: AnalyticsWorkerState = {
    started: false,
    ticking: false,
    lastStartedAt: '',
    lastFinishedAt: '',
    lastSuccessAt: '',
    lastError: '',
    runCount: 0,
  }
  globalRef[PROJECT_KNOWLEDGE_ANALYTICS_WORKER_STATE_KEY] = created
  return created
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return error.message || 'unknown error'
  return String(error)
}

async function processSingleAnalyticsJob(): Promise<'idle' | 'succeeded' | 'failed'> {
  const job = await withTransaction(undefined, async db => claimNextProjectKnowledgeAnalyticsJob(db))
  if (!job)
    return 'idle'

  try {
    let resultJson: Record<string, unknown> = {}
    if (job.jobType === 'relations_refresh') {
      resultJson = await withClient(undefined, async db => materializeProjectKnowledgeRelations(db, {
        projectId: job.projectId,
      }))
    }
    else if (job.jobType === 'snapshot_capture') {
      resultJson = await withClient(undefined, async db => materializeProjectKnowledgeSnapshot(db, {
        projectId: job.projectId,
        snapshotType: job.snapshotType || 'manual',
      }))
    }
    else if (job.jobType === 'semantic_layout_refresh') {
      resultJson = await withClient(undefined, async db => materializeProjectKnowledgeSemanticLayouts(db, {
        projectId: job.projectId,
      }))
    }

    await withTransaction(undefined, async (db) => {
      await completeProjectKnowledgeAnalyticsJobSuccess(db, {
        jobId: job.id,
        resultJson,
      })
    })
    return 'succeeded'
  }
  catch (error) {
    const errorMessage = toErrorMessage(error)
    await withTransaction(undefined, async (db) => {
      await completeProjectKnowledgeAnalyticsJobFailure(db, {
        jobId: job.id,
        errorMessage,
        resultJson: {
          failedAt: new Date().toISOString(),
        },
      })
    })
    captureServerException(error, {
      module: 'project-knowledge-analytics-worker',
      taskId: job.id,
      projectId: job.projectId,
      traceId: randomUUID(),
    })
    return 'failed'
  }
}

function logWorkerError(error: unknown): void {
  const state = getWorkerState()
  state.lastError = toErrorMessage(error)
  console.error('[project-knowledge-analytics-worker] tick failed:', state.lastError)
  captureServerException(error, {
    module: 'project-knowledge-analytics-worker',
  })
}

async function runTick(): Promise<void> {
  const state = getWorkerState()
  if (state.ticking)
    return

  state.ticking = true
  state.lastStartedAt = new Date().toISOString()
  let processedCount = 0
  let hasFailure = false

  try {
    for (let index = 0; index < PROJECT_KNOWLEDGE_ANALYTICS_WORKER_BATCH_SIZE; index += 1) {
      const handled = await processSingleAnalyticsJob()
      if (handled === 'idle')
        break
      processedCount += 1
      hasFailure = hasFailure || handled === 'failed'
    }
  }
  catch (error) {
    hasFailure = true
    logWorkerError(error)
  }
  finally {
    const finishedAt = new Date().toISOString()
    state.lastFinishedAt = finishedAt
    state.runCount += 1
    if (!hasFailure && processedCount > 0) {
      state.lastSuccessAt = finishedAt
      state.lastError = ''
    }
    state.ticking = false
  }
}

export default defineNitroPlugin((nitroApp) => {
  if (shouldSkipBackgroundWorkers())
    return

  const state = getWorkerState()
  const timerState = getTimerState()
  if (state.started)
    return

  state.started = true
  timerState.timer = setInterval(() => {
    void runTick()
  }, PROJECT_KNOWLEDGE_ANALYTICS_WORKER_INTERVAL_MS)
  timerState.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (timerState.timer)
      clearInterval(timerState.timer)
    timerState.timer = null
    state.started = false
    state.ticking = false
  })
})
