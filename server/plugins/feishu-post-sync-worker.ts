import {
  batchUpdateFeishuBitableRecords,
  getFeishuTenantAccessToken,
} from '~~/server/services/feishu/client'
import {
  analyzeFeishuEntity,
  createFeishuEmbedding,
} from '~~/server/services/feishu/post-sync-ai'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  claimNextQueuedFeishuPostSyncTask,
  completeFeishuPostSyncTask,
  failFeishuPostSyncTask,
  readFeishuIntegrationConfig,
  upsertFeishuEntityAnalysis,
  upsertFeishuSearchIndexDoc,
  upsertFeishuVectorChunk,
} from '~~/server/utils/feishu-integration-store'
import { captureServerException } from '~~/server/utils/sentry'

const FEISHU_POST_SYNC_WORKER_KEY = Symbol.for('winloop.feishu.post-sync-worker.runtime.v1')

interface WorkerRuntimeState {
  booted: boolean
  ticking: boolean
  timer: NodeJS.Timeout | null
}

function getWorkerRuntimeState(): WorkerRuntimeState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[FEISHU_POST_SYNC_WORKER_KEY] as WorkerRuntimeState | undefined
  if (existing)
    return existing

  const created: WorkerRuntimeState = {
    booted: false,
    ticking: false,
    timer: null,
  }
  globalRef[FEISHU_POST_SYNC_WORKER_KEY] = created
  return created
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw as Record<string, unknown>
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return String(error.message || 'unknown error')
  return String(error)
}

function resolveEmbeddingContent(payload: Record<string, unknown>): string {
  const recordFields = parseJsonObject(payload.recordFields)
  const candidates = [
    toText(recordFields.content),
    toText(recordFields.summary),
    toText(recordFields.title),
    toText(recordFields.name),
    JSON.stringify(recordFields),
  ].filter(Boolean)
  return candidates[0] || ''
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(item => toText(item)).filter(Boolean))]
  }
  const text = toText(raw)
  if (!text)
    return []
  return [...new Set(text.split(/[|,，、;；\n]/g).map(item => item.trim()).filter(Boolean))]
}

function sliceChunks(text: string, chunkSize = 1200, maxChunks = 8): string[] {
  const source = toText(text)
  if (!source)
    return []
  const chunks: string[] = []
  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize))
    if (chunks.length >= maxChunks)
      break
  }
  return chunks
}

function buildSearchDoc(payload: Record<string, unknown>): {
  title: string
  summary: string
  body: string
  keywords: string[]
} {
  const recordFields = parseJsonObject(payload.recordFields)
  const title = toText(recordFields.title || recordFields.name)
  const summary = toText(recordFields.summary)
  const body = toText(recordFields.content || recordFields.description || JSON.stringify(recordFields))
  const keywords = [
    ...toStringArray(recordFields.keywords),
    ...toStringArray(recordFields.tags),
    ...toStringArray(recordFields.category),
    ...toStringArray(recordFields.disciplines),
  ]
  return {
    title,
    summary,
    body,
    keywords: [...new Set(keywords.filter(Boolean))].slice(0, 24),
  }
}

async function handleEmbeddingUpsert(
  task: {
    id: string
    syncItemId: string | null
    runId: string | null
    scope: 'contest' | 'track' | 'track_timeline' | 'resource'
    entityId: string
    externalId: string
    sourceHash: string
    payload: Record<string, unknown>
  },
): Promise<void> {
  const content = resolveEmbeddingContent(task.payload)
  const chunks = sliceChunks(content)
  if (!chunks.length) {
    await withTransaction(undefined, async (db) => {
      await completeFeishuPostSyncTask(db, {
        taskId: task.id,
        payload: {
          ...task.payload,
          completedAt: new Date().toISOString(),
          embeddingSkipped: true,
          reason: 'EMPTY_CONTENT',
        },
      })
    })
    return
  }

  let lastDimensions = 0
  let fallbackUsedCount = 0
  await withTransaction(undefined, async (db) => {
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const embedding = await createFeishuEmbedding({
        text: chunk,
      })
      lastDimensions = embedding.embedding.length
      if (embedding.fallbackUsed)
        fallbackUsedCount += 1

      await upsertFeishuVectorChunk(db, {
        scope: task.scope,
        entityId: task.entityId,
        chunkIndex,
        content: chunk,
        embedding: embedding.embedding,
        sourceHash: task.sourceHash,
        metadata: {
          syncItemId: task.syncItemId,
          runId: task.runId,
          externalId: task.externalId,
          provider: embedding.provider,
          model: embedding.model,
          fallbackUsed: embedding.fallbackUsed,
        },
      })
    }

    await completeFeishuPostSyncTask(db, {
      taskId: task.id,
      payload: {
        ...task.payload,
        completedAt: new Date().toISOString(),
        chunkCount: chunks.length,
        embeddingDimensions: lastDimensions,
        fallbackChunks: fallbackUsedCount,
      },
    })
  })
}

async function handleSearchIndexRefresh(
  task: {
    id: string
    syncItemId: string | null
    runId: string | null
    scope: 'contest' | 'track' | 'track_timeline' | 'resource'
    entityId: string
    externalId: string
    sourceHash: string
    payload: Record<string, unknown>
  },
): Promise<void> {
  const doc = buildSearchDoc(task.payload)
  await withTransaction(undefined, async (db) => {
    await upsertFeishuSearchIndexDoc(db, {
      scope: task.scope,
      entityId: task.entityId,
      externalId: task.externalId,
      syncItemId: task.syncItemId,
      runId: task.runId,
      sourceHash: task.sourceHash,
      title: doc.title,
      summary: doc.summary,
      body: doc.body,
      keywords: doc.keywords,
      metadata: {
        recordId: toText(task.payload.recordId),
      },
    })
    await completeFeishuPostSyncTask(db, {
      taskId: task.id,
      payload: {
        ...task.payload,
        completedAt: new Date().toISOString(),
        indexedKeywords: doc.keywords.length,
      },
    })
  })
}

async function handleEntityAnalysis(
  task: {
    id: string
    syncItemId: string | null
    runId: string | null
    scope: 'contest' | 'track' | 'track_timeline' | 'resource'
    entityId: string
    externalId: string
    sourceHash: string
    payload: Record<string, unknown>
  },
): Promise<void> {
  const searchDoc = buildSearchDoc(task.payload)
  const text = [searchDoc.title, searchDoc.summary, searchDoc.body]
    .map(item => toText(item))
    .filter(Boolean)
    .join('\n')
  const analysis = await analyzeFeishuEntity({
    scope: task.scope,
    text,
  })

  await withTransaction(undefined, async (db) => {
    await upsertFeishuEntityAnalysis(db, {
      scope: task.scope,
      entityId: task.entityId,
      externalId: task.externalId,
      syncItemId: task.syncItemId,
      runId: task.runId,
      sourceHash: task.sourceHash,
      provider: analysis.provider,
      model: analysis.model,
      analysis: {
        summary: analysis.summary,
        keywords: analysis.keywords,
        risks: analysis.risks,
        suggestedActions: analysis.suggestedActions,
        qualityScore: analysis.qualityScore,
        fallbackUsed: analysis.fallbackUsed,
      },
    })
    await completeFeishuPostSyncTask(db, {
      taskId: task.id,
      payload: {
        ...task.payload,
        completedAt: new Date().toISOString(),
        analysisSummary: analysis.summary,
        qualityScore: analysis.qualityScore,
        fallbackUsed: analysis.fallbackUsed,
      },
    })
  })
}

async function processSingleTask(): Promise<boolean> {
  const task = await withTransaction(undefined, async (db) => {
    return claimNextQueuedFeishuPostSyncTask(db)
  })
  if (!task)
    return false

  try {
    const payload = parseJsonObject(task.payload)
    if (task.taskType === 'embedding_upsert') {
      await handleEmbeddingUpsert({
        ...task,
        payload,
      })
      return true
    }

    if (task.taskType === 'search_index_refresh') {
      await handleSearchIndexRefresh({
        ...task,
        payload,
      })
      return true
    }

    if (task.taskType === 'entity_analysis') {
      await handleEntityAnalysis({
        ...task,
        payload,
      })
      return true
    }

    if (task.taskType === 'writeback_retry') {
      const appToken = toText(payload.appToken)
      const tableId = toText(payload.tableId)
      const records = Array.isArray(payload.records)
        ? payload.records
            .map((item) => {
              const recordRaw = parseJsonObject(item)
              return {
                recordId: toText(recordRaw.recordId),
                fields: parseJsonObject(recordRaw.fields),
              }
            })
            .filter(item => item.recordId && Object.keys(item.fields).length > 0)
        : []
      if (!appToken || !tableId || records.length === 0)
        throw new Error('WRITEBACK_RETRY_PAYLOAD_INVALID')

      const config = await withClient(undefined, async db => readFeishuIntegrationConfig(db))
      if (!config.enabled)
        throw new Error('FEISHU_INTEGRATION_DISABLED')
      const tenantAccessToken = await getFeishuTenantAccessToken(config)
      await batchUpdateFeishuBitableRecords({
        tenantAccessToken,
        appToken,
        tableId,
        records,
      })
      await withTransaction(undefined, async (db) => {
        await completeFeishuPostSyncTask(db, {
          taskId: task.id,
          payload: {
            ...payload,
            completedAt: new Date().toISOString(),
            retriedRecords: records.length,
          },
        })
      })
      return true
    }

    await withTransaction(undefined, async (db) => {
      await completeFeishuPostSyncTask(db, {
        taskId: task.id,
        payload: {
          ...payload,
          completedAt: new Date().toISOString(),
          handledAs: task.taskType,
        },
      })
    })
  }
  catch (error) {
    await withTransaction(undefined, async (db) => {
      await failFeishuPostSyncTask(db, {
        taskId: task.id,
        errorMessage: toErrorMessage(error),
        payload: {
          ...(parseJsonObject(task.payload)),
          failedAt: new Date().toISOString(),
          lastError: toErrorMessage(error),
        },
      })
    })
    captureServerException(error, {
      module: 'feishu-post-sync-worker',
      taskId: task.id,
    })
  }

  return true
}

async function runTick(): Promise<void> {
  const runtimeState = getWorkerRuntimeState()
  if (runtimeState.ticking)
    return

  runtimeState.ticking = true
  try {
    const runtime = readRuntimeSettings()
    const batchSize = Math.max(1, Math.min(100, runtime.feishuScheduler.batchSize))
    for (let index = 0; index < batchSize; index += 1) {
      const processed = await processSingleTask()
      if (!processed)
        break
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
  const runtime = readRuntimeSettings()
  const intervalMs = Math.max(10_000, Math.min(60_000, runtime.feishuScheduler.intervalMs))

  void runTick().catch((error) => {
    console.error('[feishu-post-sync-worker] bootstrap failed:', toErrorMessage(error))
    captureServerException(error, {
      module: 'feishu-post-sync-worker',
    })
  })

  runtimeState.timer = setInterval(() => {
    void runTick().catch((error) => {
      console.error('[feishu-post-sync-worker] tick failed:', toErrorMessage(error))
      captureServerException(error, {
        module: 'feishu-post-sync-worker',
      })
    })
  }, intervalMs)
  runtimeState.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (runtimeState.timer)
      clearInterval(runtimeState.timer)
    runtimeState.timer = null
    runtimeState.booted = false
    runtimeState.ticking = false
  })
})
