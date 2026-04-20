import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  DocumentAnalysis,
  ProjectKnowledgeAnalyticsFreshness,
  ProjectKnowledgeAnalyticsJobStatus,
  ProjectKnowledgeChunkKind,
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeIndexDiagnosticIssue,
  ProjectKnowledgeIndexDiagnostics,
  ProjectKnowledgeIndexHealthState,
  ProjectKnowledgeIndexRuntimeStatus,
  ProjectKnowledgeIndexSourceStatus,
  ProjectKnowledgeIndexSummary,
  ProjectKnowledgeIndexTaskSnapshot,
  ProjectKnowledgeIndexTaskTrendPoint,
  ProjectKnowledgeIndexTopologyLink,
  ProjectKnowledgeIndexTopologyNode,
  ProjectKnowledgeIndexVisualCountItem,
  ProjectKnowledgeIndexVisuals,
  ProjectKnowledgeIndexWorkerStatus,
  ProjectKnowledgeModality,
  ProjectKnowledgePipelineStageMetric,
  ProjectKnowledgeScopeType,
  ProjectKnowledgeSourceStatus,
  ProjectKnowledgeTaskStage,
  ProjectKnowledgeTaskStatus,
  ProjectKnowledgeTaskType,
  ResourceKind,
} from '~~/shared/types/domain'
import { createHash, randomUUID } from 'node:crypto'
import { isAiRuntimeConfigured, normalizeAiRuntimeProvider } from '~~/server/utils/ai-runtime'
import {
  normalizePlatformAiClientType,
  normalizeProjectKnowledgeEmbeddingApiStyle,
} from '~~/server/utils/platform-ai-client'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { getProjectKnowledgeWorkerState } from '~~/server/utils/project-knowledge-worker-state'

export const PROJECT_KNOWLEDGE_INDEX_VERSION = 'project-knowledge-v2-multimodal'

const PROJECT_KNOWLEDGE_VECTOR_MODE_KEY = Symbol.for('winloop.project-knowledge.vector.mode.v1')
const PROCESSING_SOURCE_STATUS_SET = new Set<ProjectKnowledgeSourceStatus>(['extracting', 'chunking', 'embedding'])

type ProjectResourceSource = 'upload' | 'library' | 'collab'
type ProjectKnowledgeVectorMode = 'vector' | 'json'

interface ProjectKnowledgeCandidateRow {
  project_id: string
  source_resource_id: string
  linked_contest_resource_id: string | null
  title: string
  summary: string
  content: string
  metadata: unknown
  source: ProjectResourceSource
  resource_kind: ResourceKind
  mime_type: string
  source_link: string
  updated_at: string
  created_at: string
  collab_revision: number | null
  analysis_json: unknown
  document_updated_at: string | null
  page_count: number | null
}

interface ProjectKnowledgeSourceRow {
  id: string
  scope_type: ProjectKnowledgeScopeType
  project_id: string
  source_resource_id: string | null
  linked_contest_resource_id: string | null
  status: ProjectKnowledgeSourceStatus
  progress_percent: number
  eta_seconds: number
  chunk_total: number
  chunk_indexed: number
  source_hash: string
  index_version: string
  last_indexed_at: string | null
  last_error: string
  last_error_stage: string
  last_task_id: string
  created_at: string
  updated_at: string
}

interface ProjectKnowledgeTaskRow {
  id: string
  project_id: string
  scope_type: ProjectKnowledgeScopeType
  source_resource_id: string | null
  linked_contest_resource_id: string | null
  task_type: ProjectKnowledgeTaskType
  status: ProjectKnowledgeTaskStatus
  stage: ProjectKnowledgeTaskStage
  attempt: number
  max_attempt: number
  progress_percent: number
  eta_seconds: number
  payload_json: unknown
  result_json: unknown
  error_message: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

interface ProjectKnowledgeSourceSnapshotRow extends ProjectKnowledgeSourceRow {
  resource_title: string
  resource_kind: ResourceKind
  resource_source: ProjectResourceSource
  task_id: string | null
  task_task_type: ProjectKnowledgeTaskType | null
  task_status: ProjectKnowledgeTaskStatus | null
  task_stage: ProjectKnowledgeTaskStage | null
  task_attempt: number | null
  task_max_attempt: number | null
  task_progress_percent: number | null
  task_eta_seconds: number | null
  task_payload_json: unknown
  task_result_json: unknown
  task_error_message: string | null
  task_started_at: string | null
  task_finished_at: string | null
  task_created_at: string | null
  task_updated_at: string | null
}

interface ProjectKnowledgeSearchChunkRow {
  id: string
  source_id: string
  project_id: string
  scope_type: ProjectKnowledgeScopeType
  source_resource_id: string | null
  linked_contest_resource_id: string | null
  chunk_index: number
  chunk_kind: ProjectKnowledgeChunkKind
  title: string
  content: string
  citation_label: string
  page_number: number | null
  section_label: string
  source_hash: string
  index_version: string
  metadata: unknown
  updated_at: string
  source_status: ProjectKnowledgeSourceStatus
  resource_title: string
  resource_kind: ResourceKind
  resource_source: ProjectResourceSource
  embedding_text: string | null
  embedding_json: unknown
}

interface ProjectKnowledgeChunkStatsRow {
  source_id: string
  chunk_count: string
  real_chunk_count: string
  fallback_chunk_count: string
  unknown_chunk_count: string
  multimodal_chunk_count: string
}

interface ProjectKnowledgeTaskCountRow {
  count: string
}

interface ProjectKnowledgeChunkKindCountRow {
  chunk_kind: string
  count: string
}

interface ProjectKnowledgeFailureReasonRow {
  error_text: string
  count: string
}

interface ProjectKnowledgeHealthMatrixRow {
  modality: string
  embedding_status: string
  count: string
}

interface ProjectKnowledgeTaskTrendRow {
  day: string
  tasks: string
  succeeded: string
  failed: string
}

interface ProjectKnowledgeAnalyticsFreshnessRow {
  kind: 'relations' | 'snapshot' | 'semantic_layout'
  updated_at: string | null
  job_status: string | null
  snapshot_type: string | null
}

interface ContestResourceLabelRow {
  id: string
  title: string
}

interface ProjectKnowledgeAggregateChunkStats {
  chunkCount: number
  realEmbeddedChunkCount: number
  fallbackEmbeddedChunkCount: number
  unknownEmbeddedChunkCount: number
  multimodalEmbeddedChunkCount: number
}

interface ProjectKnowledgeSourceChunkStats extends ProjectKnowledgeAggregateChunkStats {}

export interface ProjectKnowledgeTaskContext {
  task: ProjectKnowledgeIndexTaskSnapshot
  source: ProjectKnowledgeIndexSourceStatus
  resource: {
    id: string
    projectId: string
    title: string
    summary: string
    content: string
    metadata: Record<string, unknown>
    resourceKind: ResourceKind
    source: ProjectResourceSource
    linkedContestResourceId?: string | null
    mimeType: string
    sourceLink: string
    updatedAt: string
    collabRevision?: number | null
  }
  documentAnalysis: DocumentAnalysis | null
  processedSourceHash: string
}

export interface ProjectKnowledgeChunkWriteInput {
  chunkIndex: number
  chunkKind: ProjectKnowledgeChunkKind
  title?: string
  content: string
  citationLabel?: string
  pageNumber?: number | null
  sectionLabel?: string
  metadata?: Record<string, unknown>
  embedding: number[]
}

export interface ProjectKnowledgeSearchChunk {
  id: string
  sourceId: string
  projectId: string
  scopeType: ProjectKnowledgeScopeType
  sourceResourceId?: string | null
  linkedContestResourceId?: string | null
  resourceTitle: string
  resourceKind: ResourceKind
  resourceSource: ProjectResourceSource
  sourceStatus: ProjectKnowledgeSourceStatus
  chunkIndex: number
  chunkKind: ProjectKnowledgeChunkKind
  title: string
  content: string
  citationLabel: string
  pageNumber?: number | null
  sectionLabel?: string
  sourceHash: string
  indexVersion: string
  metadata: Record<string, unknown>
  embedding: number[]
  updatedAt: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => Number(item))
    .filter(item => Number.isFinite(item))
}

function normalizeEmbeddingText(value: string | null): number[] {
  const normalized = normalizeString(value)
  if (!normalized)
    return []
  try {
    return normalizeNumberArray(JSON.parse(normalized))
  }
  catch {
    return []
  }
}

function stableNormalizeValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(item => stableNormalizeValue(item))
  if (!value || typeof value !== 'object')
    return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableNormalizeValue(child)]),
  )
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalizeValue(value))
}

function buildSourceEntityKey(scopeType: ProjectKnowledgeScopeType, sourceResourceId?: string | null, linkedContestResourceId?: string | null): string {
  return [scopeType, normalizeString(sourceResourceId), normalizeString(linkedContestResourceId)].join(':')
}

function buildEtaFinishedAt(etaSeconds: number): string | null {
  const safeEta = Math.max(0, Math.round(normalizeNumber(etaSeconds, 0)))
  if (safeEta <= 0)
    return null
  return new Date(Date.now() + safeEta * 1000).toISOString()
}

function formatResourceKindLabel(resourceKind: ResourceKind | '' | null | undefined): string {
  const normalized = normalizeString(resourceKind)
  if (normalized === 'document')
    return '文档'
  if (normalized === 'markdown')
    return 'Markdown'
  if (normalized === 'image')
    return '图片'
  if (normalized === 'audio')
    return '音频'
  if (normalized === 'video')
    return '视频'
  if (normalized === 'draw')
    return '画布'
  if (normalized === 'link')
    return '链接'
  return normalized || '未分类'
}

function toCountItem(label: string, count: number): ProjectKnowledgeIndexVisualCountItem {
  return {
    label,
    count: Math.max(0, Math.round(normalizeNumber(count, 0))),
  }
}

function normalizeTaskPayload(value: unknown): Record<string, unknown> {
  return normalizeRecord(value)
}

function normalizeDocumentAnalysis(value: unknown): DocumentAnalysis | null {
  const record = normalizeRecord(value)
  if (Object.keys(record).length === 0)
    return null
  return record as unknown as DocumentAnalysis
}

function isProcessingSourceStatus(status: ProjectKnowledgeSourceStatus): boolean {
  return PROCESSING_SOURCE_STATUS_SET.has(status)
}

function normalizeEmbeddingApiStyle(value: unknown): 'openai-compatible-text' | 'bailian-multimodal' {
  return normalizeProjectKnowledgeEmbeddingApiStyle(value)
}

function buildProjectKnowledgeEmbeddingConfigSignature(runtime: RuntimeSettings): Record<string, unknown> {
  return {
    clientType: normalizePlatformAiClientType(runtime.ai.clientType),
    embeddingApiStyle: normalizeEmbeddingApiStyle(runtime.ai.embeddingApiStyle),
    embeddingProvider: normalizeAiRuntimeProvider(runtime.ai.provider),
    embeddingModel: normalizeString(runtime.ai.embeddingModel || runtime.ai.model),
    embeddingDimensions: Math.max(0, normalizeNumber(runtime.ai.embeddingDimensions, 0)),
  }
}

function buildProjectKnowledgeSourceHash(row: ProjectKnowledgeCandidateRow, runtime: RuntimeSettings): string {
  const payload = {
    projectId: normalizeString(row.project_id),
    sourceResourceId: normalizeString(row.source_resource_id),
    linkedContestResourceId: normalizeString(row.linked_contest_resource_id),
    title: normalizeString(row.title),
    summary: normalizeString(row.summary),
    content: normalizeString(row.content),
    metadata: normalizeRecord(row.metadata),
    source: normalizeString(row.source),
    resourceKind: normalizeString(row.resource_kind),
    mimeType: normalizeString(row.mime_type),
    sourceLink: normalizeString(row.source_link),
    updatedAt: normalizeString(row.updated_at),
    createdAt: normalizeString(row.created_at),
    collabRevision: normalizeNumber(row.collab_revision, 0),
    pageCount: normalizeNumber(row.page_count, 0),
    documentUpdatedAt: normalizeString(row.document_updated_at),
    analysis: normalizeRecord(row.analysis_json),
    embeddingConfig: buildProjectKnowledgeEmbeddingConfigSignature(runtime),
  }
  return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

function inferScopeType(_row: ProjectKnowledgeCandidateRow): ProjectKnowledgeScopeType {
  return 'project_resource'
}

function buildTaskSnapshot(row: ProjectKnowledgeTaskRow, resourceTitle = ''): ProjectKnowledgeIndexTaskSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    scopeType: row.scope_type,
    sourceResourceId: row.source_resource_id,
    linkedContestResourceId: row.linked_contest_resource_id,
    taskType: row.task_type,
    status: row.status,
    stage: row.stage,
    attempt: Math.max(0, normalizeNumber(row.attempt, 0)),
    maxAttempt: Math.max(1, normalizeNumber(row.max_attempt, 1)),
    progressPercent: Math.max(0, Math.min(100, Math.round(normalizeNumber(row.progress_percent, 0)))),
    etaSeconds: Math.max(0, Math.round(normalizeNumber(row.eta_seconds, 0))),
    payloadJson: normalizeTaskPayload(row.payload_json),
    resultJson: normalizeTaskPayload(row.result_json),
    errorMessage: normalizeString(row.error_message),
    resourceTitle: normalizeString(resourceTitle) || undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildTaskSnapshotFromSourceRow(row: ProjectKnowledgeSourceSnapshotRow): ProjectKnowledgeIndexTaskSnapshot | null {
  if (!normalizeString(row.task_id))
    return null
  return {
    id: normalizeString(row.task_id),
    projectId: row.project_id,
    scopeType: row.scope_type,
    sourceResourceId: row.source_resource_id,
    linkedContestResourceId: row.linked_contest_resource_id,
    taskType: (row.task_task_type || 'upsert') as ProjectKnowledgeTaskType,
    status: (row.task_status || 'queued') as ProjectKnowledgeTaskStatus,
    stage: (row.task_stage || 'queued') as ProjectKnowledgeTaskStage,
    attempt: Math.max(0, normalizeNumber(row.task_attempt, 0)),
    maxAttempt: Math.max(1, normalizeNumber(row.task_max_attempt, 1)),
    progressPercent: Math.max(0, Math.min(100, Math.round(normalizeNumber(row.task_progress_percent, 0)))),
    etaSeconds: Math.max(0, Math.round(normalizeNumber(row.task_eta_seconds, 0))),
    payloadJson: normalizeTaskPayload(row.task_payload_json),
    resultJson: normalizeTaskPayload(row.task_result_json),
    errorMessage: normalizeString(row.task_error_message),
    resourceTitle: normalizeString(row.resource_title) || undefined,
    startedAt: row.task_started_at,
    finishedAt: row.task_finished_at,
    createdAt: normalizeString(row.task_created_at),
    updatedAt: normalizeString(row.task_updated_at),
  }
}

function buildSourceSnapshot(row: ProjectKnowledgeSourceSnapshotRow): ProjectKnowledgeIndexSourceStatus {
  const lastTask = buildTaskSnapshotFromSourceRow(row)
  const etaSeconds = Math.max(0, Math.round(normalizeNumber(row.eta_seconds, 0)))
  return {
    id: row.id,
    scopeType: row.scope_type,
    projectId: row.project_id,
    sourceResourceId: row.source_resource_id,
    linkedContestResourceId: row.linked_contest_resource_id,
    resourceTitle: normalizeString(row.resource_title) || '未命名资源',
    resourceKind: row.resource_kind || '',
    resourceSource: row.resource_source || '',
    status: row.status,
    currentStage: lastTask?.stage || '',
    currentTaskStatus: lastTask?.status || '',
    progressPercent: Math.max(0, Math.min(100, Math.round(normalizeNumber(row.progress_percent, 0)))),
    etaSeconds,
    estimatedFinishedAt: buildEtaFinishedAt(etaSeconds),
    chunkTotal: Math.max(0, Math.round(normalizeNumber(row.chunk_total, 0))),
    chunkIndexed: Math.max(0, Math.round(normalizeNumber(row.chunk_indexed, 0))),
    sourceHash: normalizeString(row.source_hash),
    indexVersion: normalizeString(row.index_version),
    lastIndexedAt: row.last_indexed_at,
    lastError: normalizeString(row.last_error),
    lastErrorStage: (normalizeString(row.last_error_stage) || '') as ProjectKnowledgeIndexSourceStatus['lastErrorStage'],
    lastTaskId: normalizeString(row.last_task_id) || undefined,
    updatedAt: row.updated_at,
    lastTask,
  }
}

function contributionForSummary(source: ProjectKnowledgeIndexSourceStatus): number {
  if (source.status === 'ready' || source.status === 'skipped')
    return 100
  if (source.status === 'stale')
    return 0
  return Math.max(0, Math.min(100, Math.round(normalizeNumber(source.progressPercent, 0))))
}

function estimateRunningEtaSeconds(source: ProjectKnowledgeIndexSourceStatus): number {
  if (source.etaSeconds > 0)
    return source.etaSeconds
  const startedAtMs = source.lastTask?.startedAt ? new Date(source.lastTask.startedAt).getTime() : 0
  const progressPercent = Math.max(1, Math.min(99, Math.round(normalizeNumber(source.progressPercent, 0))))
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0)
    return Math.max(15, 120 - progressPercent)
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAtMs) / 1000))
  const totalSeconds = Math.round(elapsedSeconds * (100 / progressPercent))
  return Math.max(1, totalSeconds - elapsedSeconds)
}

const VISUAL_SOURCE_STATUS_ORDER: ProjectKnowledgeSourceStatus[] = [
  'pending',
  'queued',
  'extracting',
  'chunking',
  'embedding',
  'ready',
  'failed',
  'stale',
  'skipped',
]

function formatChunkKindLabel(chunkKind: string): string {
  const normalized = normalizeString(chunkKind)
  if (normalized === 'document_page')
    return '文档页'
  if (normalized === 'document_section')
    return '文档章节'
  if (normalized === 'markdown_section')
    return 'Markdown 分段'
  if (normalized === 'draw_summary')
    return '画布摘要'
  if (normalized === 'resource_summary')
    return '资源摘要'
  if (normalized === 'image_summary')
    return '图片摘要'
  if (normalized === 'image_ocr')
    return '图片 OCR'
  if (normalized === 'meeting_notes')
    return '会议纪要'
  if (normalized === 'meeting_transcript')
    return '会议转写'
  return normalized || '未分类 Chunk'
}

function normalizeProjectKnowledgeEmbeddingStatus(value: unknown): ProjectKnowledgeEmbeddingStatus {
  const normalized = normalizeString(value)
  if (normalized === 'native' || normalized === 'derived' || normalized === 'fallback' || normalized === 'missing' || normalized === 'failed')
    return normalized
  return 'missing'
}

function normalizeProjectKnowledgeModality(value: unknown): ProjectKnowledgeModality | 'unknown' {
  const normalized = normalizeString(value)
  if (normalized === 'text' || normalized === 'image' || normalized === 'audio' || normalized === 'video' || normalized === 'draw')
    return normalized
  return 'unknown'
}

function buildEmptyProjectKnowledgeAnalyticsFreshness(): ProjectKnowledgeAnalyticsFreshness {
  return {
    relationsUpdatedAt: null,
    snapshotUpdatedAt: null,
    semanticLayoutUpdatedAt: null,
    latestSnapshotType: null,
    relationsJobStatus: null,
    snapshotJobStatus: null,
    semanticLayoutJobStatus: null,
    staleKinds: ['relations', 'snapshot', 'semantic_layout'],
    allReady: false,
  }
}

async function buildProjectKnowledgeRuntimeStatus(): Promise<ProjectKnowledgeIndexRuntimeStatus> {
  const { runtime } = await readEffectiveRuntimeSettings()
  const embeddingModel = normalizeString(runtime.ai.embeddingModel || runtime.ai.model)
  const embeddingApiStyle = normalizeEmbeddingApiStyle(runtime.ai.embeddingApiStyle)
  return {
    clientType: normalizePlatformAiClientType(runtime.ai.clientType),
    embeddingConfigured: Boolean(embeddingModel)
      && isAiRuntimeConfigured({
        provider: runtime.ai.provider,
        baseURL: runtime.ai.baseURL,
        apiKey: runtime.ai.apiKey,
        model: embeddingModel,
      }),
    embeddingClientType: embeddingApiStyle === 'bailian-multimodal' ? 'bailian-native' : 'openai-compatible',
    embeddingApiStyle,
    embeddingProvider: normalizeAiRuntimeProvider(runtime.ai.provider),
    embeddingModel,
    embeddingDimensions: Math.max(0, normalizeNumber(runtime.ai.embeddingDimensions, 0)),
  }
}

function buildProjectKnowledgeWorkerStatus(): ProjectKnowledgeIndexWorkerStatus {
  const state = getProjectKnowledgeWorkerState()
  return {
    started: Boolean(state.started),
    enabled: Boolean(state.enabled),
    ticking: Boolean(state.ticking),
    lastStartedAt: normalizeString(state.lastStartedAt) || undefined,
    lastFinishedAt: normalizeString(state.lastFinishedAt) || undefined,
    lastSuccessAt: normalizeString(state.lastSuccessAt) || undefined,
    lastError: normalizeString(state.lastError),
  }
}

function resolveSourceChunkStats(
  chunkStatsBySourceId: Map<string, ProjectKnowledgeSourceChunkStats>,
  sourceId: string,
): ProjectKnowledgeSourceChunkStats {
  return chunkStatsBySourceId.get(sourceId) || {
    chunkCount: 0,
    realEmbeddedChunkCount: 0,
    fallbackEmbeddedChunkCount: 0,
    unknownEmbeddedChunkCount: 0,
    multimodalEmbeddedChunkCount: 0,
  }
}

function buildProjectKnowledgeHealth(
  input: {
    summary: ProjectKnowledgeIndexSummary
    candidateResourceCount: number
    runtime: ProjectKnowledgeIndexRuntimeStatus
    worker: ProjectKnowledgeIndexWorkerStatus
    chunkStats: ProjectKnowledgeAggregateChunkStats
  },
): {
  healthState: ProjectKnowledgeIndexHealthState
  healthMessage: string
  issues: ProjectKnowledgeIndexDiagnosticIssue[]
} {
  const issues: ProjectKnowledgeIndexDiagnosticIssue[] = []
  const backlogCount = input.summary.pendingCount + input.summary.queuedCount + input.summary.processingCount + input.summary.staleCount
  const hasRealEmbeddings = input.chunkStats.realEmbeddedChunkCount > 0
  const fallbackOnly = input.chunkStats.chunkCount > 0
    && input.chunkStats.realEmbeddedChunkCount === 0
    && input.chunkStats.fallbackEmbeddedChunkCount > 0

  if (input.candidateResourceCount === 0) {
    return {
      healthState: 'empty_project',
      healthMessage: '当前项目没有可索引的活跃资源。',
      issues: [
        {
          code: 'no_active_resource',
          severity: 'info',
          message: '项目内暂时没有活跃资源，Loopy 数据工作台已就绪但没有索引对象。',
        },
      ],
    }
  }

  if (!input.runtime.embeddingConfigured) {
    issues.push({
      code: 'embedding_runtime_missing',
      severity: 'error',
      message: 'Embedding 运行时未配置，当前无法产出真实向量。',
    })
  }

  if (!input.worker.enabled || !input.worker.started) {
    issues.push({
      code: 'worker_inactive',
      severity: 'error',
      message: '知识索引 Worker 未启用或未启动，排队任务不会被实际消费。',
    })
  }

  if (backlogCount > 0 && input.worker.enabled && input.worker.started && !input.worker.ticking && !input.worker.lastSuccessAt) {
    issues.push({
      code: 'worker_backlog_stalled',
      severity: 'warning',
      message: '存在排队任务，但 Worker 最近没有成功消费记录。',
    })
  }

  if (fallbackOnly) {
    issues.push({
      code: 'fallback_only',
      severity: 'warning',
      message: '当前仅生成 deterministic fallback embedding，索引处于降级可用状态。',
    })
  }

  if (input.summary.failedCount > 0) {
    issues.push({
      code: 'failed_sources',
      severity: 'error',
      message: `存在 ${input.summary.failedCount} 个失败资源，需要重试或修复原始内容。`,
    })
  }

  if (input.summary.staleCount > 0) {
    issues.push({
      code: 'stale_sources',
      severity: 'warning',
      message: `存在 ${input.summary.staleCount} 个待刷新资源，当前索引与最新内容可能不一致。`,
    })
  }

  if (input.chunkStats.unknownEmbeddedChunkCount > 0) {
    issues.push({
      code: 'unknown_embedding_provenance',
      severity: 'info',
      message: `存在 ${input.chunkStats.unknownEmbeddedChunkCount} 个历史 Chunk 尚未标注 embedding provenance。`,
    })
  }

  if (input.chunkStats.chunkCount === 0) {
    issues.push({
      code: 'no_chunks',
      severity: 'warning',
      message: '当前还没有产出任何 Chunk，说明索引尚未真正完成。',
    })
  }

  if (!input.runtime.embeddingConfigured && !hasRealEmbeddings) {
    return {
      healthState: 'missing_runtime',
      healthMessage: '真实索引未建立：Embedding 配置缺失，当前无法产出真实向量。',
      issues,
    }
  }

  if ((!input.worker.enabled || !input.worker.started) && backlogCount > 0) {
    return {
      healthState: 'worker_inactive',
      healthMessage: '真实索引未建立：知识索引 Worker 未启动，排队任务不会被消费。',
      issues,
    }
  }

  if (backlogCount > 0 && input.worker.enabled && input.worker.started && !input.worker.ticking && !input.worker.lastSuccessAt) {
    return {
      healthState: 'queued_but_not_running',
      healthMessage: 'Worker 已启动，但最近没有消费 queued 任务。',
      issues,
    }
  }

  if (fallbackOnly) {
    return {
      healthState: 'fallback_only',
      healthMessage: '当前只有 fallback embedding，索引为降级可用，不算真实索引健康。',
      issues,
    }
  }

  if (hasRealEmbeddings && backlogCount === 0 && input.summary.failedCount === 0) {
    return {
      healthState: 'healthy',
      healthMessage: '真实 embedding 已产出，当前索引状态健康。',
      issues,
    }
  }

  return {
    healthState: 'partial',
    healthMessage: hasRealEmbeddings
      ? '真实 embedding 已部分产出，但仍有排队、失败或待刷新资源。'
      : '索引流程已启动，但尚未形成完整的真实 embedding 产出。',
    issues,
  }
}

function buildTaskTrendSeries(rows: ProjectKnowledgeTaskTrendRow[], windowDays = 10): ProjectKnowledgeIndexTaskTrendPoint[] {
  const rowMap = new Map(rows.map(row => [normalizeString(row.day), row]))
  const result: ProjectKnowledgeIndexTaskTrendPoint[] = []
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const day = new Date()
    day.setUTCHours(0, 0, 0, 0)
    day.setUTCDate(day.getUTCDate() - offset)
    const key = day.toISOString().slice(0, 10)
    const row = rowMap.get(key)
    const tasks = Math.max(0, Math.round(normalizeNumber(row?.tasks, 0)))
    const succeeded = Math.max(0, Math.round(normalizeNumber(row?.succeeded, 0)))
    const failed = Math.max(0, Math.round(normalizeNumber(row?.failed, 0)))
    result.push({
      day: key,
      tasks,
      succeeded,
      failed,
      successRate: tasks > 0 ? Math.max(0, Math.min(100, Math.round((succeeded / tasks) * 100))) : 0,
    })
  }
  return result
}

function buildResourceKindDistribution(sources: ProjectKnowledgeIndexSourceStatus[]): ProjectKnowledgeIndexVisualCountItem[] {
  const counts = new Map<string, number>()
  for (const source of sources) {
    const label = formatResourceKindLabel(source.resourceKind)
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => toCountItem(label, count))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function buildResourceStatusMatrix(sources: ProjectKnowledgeIndexSourceStatus[]): ProjectKnowledgeIndexVisuals['resourceStatusMatrix'] {
  const resourceKinds = [...new Set(sources.map(item => formatResourceKindLabel(item.resourceKind)))].sort((left, right) => left.localeCompare(right))
  const statuses = VISUAL_SOURCE_STATUS_ORDER.filter(status => sources.some(item => item.status === status))
  return {
    resourceKinds,
    statuses,
    cells: resourceKinds.flatMap((resourceKind) => {
      return statuses.map(status => ({
        resourceKind,
        status,
        count: sources.filter(item => formatResourceKindLabel(item.resourceKind) === resourceKind && item.status === status).length,
      }))
    }),
  }
}

function buildEmbeddingComposition(
  sources: ProjectKnowledgeIndexSourceStatus[],
  chunkStatsBySourceId: Map<string, ProjectKnowledgeSourceChunkStats>,
): ProjectKnowledgeIndexVisualCountItem[] {
  let realReadySourceCount = 0
  let fallbackOnlySourceCount = 0
  let noChunkSourceCount = 0
  let unknownSourceCount = 0

  for (const source of sources) {
    const stats = resolveSourceChunkStats(chunkStatsBySourceId, source.id)
    if (stats.chunkCount <= 0) {
      noChunkSourceCount += 1
      continue
    }
    if (stats.realEmbeddedChunkCount > 0) {
      realReadySourceCount += 1
      continue
    }
    if (stats.fallbackEmbeddedChunkCount > 0) {
      fallbackOnlySourceCount += 1
      continue
    }
    unknownSourceCount += 1
  }

  const result = [
    toCountItem('真实 Embedding 资源', realReadySourceCount),
    toCountItem('Fallback 资源', fallbackOnlySourceCount),
    toCountItem('无 Chunk 资源', noChunkSourceCount),
  ]
  if (unknownSourceCount > 0)
    result.push(toCountItem('历史 Chunk（待判定）', unknownSourceCount))
  return result.filter(item => item.count > 0)
}

function buildPipelineMetrics(input: {
  candidateResourceCount: number
  sourceCount: number
  readyCount: number
  processingCount: number
  queuedCount: number
  failedCount: number
  staleCount: number
  chunkCount: number
  realEmbeddedChunkCount: number
  fallbackEmbeddedChunkCount: number
  healthState: ProjectKnowledgeIndexHealthState
  runtime: ProjectKnowledgeIndexRuntimeStatus
  analytics: ProjectKnowledgeAnalyticsFreshness
}): ProjectKnowledgePipelineStageMetric[] {
  const baseQuality = input.chunkCount > 0
    ? Number(((input.realEmbeddedChunkCount / Math.max(1, input.chunkCount)) * 0.9 + (input.fallbackEmbeddedChunkCount / Math.max(1, input.chunkCount)) * 0.35).toFixed(4))
    : 0
  const normalizeStageStatus = (
    stage: ProjectKnowledgePipelineStageMetric['stage'],
  ): ProjectKnowledgePipelineStageMetric['status'] => {
    if (stage === 'embed') {
      if (!input.runtime.embeddingConfigured)
        return 'blocked'
      if (input.failedCount > 0 && input.realEmbeddedChunkCount === 0 && input.fallbackEmbeddedChunkCount === 0)
        return 'failed'
      if (input.fallbackEmbeddedChunkCount > 0 && input.realEmbeddedChunkCount === 0)
        return 'degraded'
      if (input.processingCount > 0 || input.queuedCount > 0)
        return 'running'
      return input.realEmbeddedChunkCount > 0 ? 'success' : 'pending'
    }
    if (stage === 'index') {
      if (input.failedCount > 0 && input.readyCount === 0)
        return 'failed'
      if (input.processingCount > 0 || input.queuedCount > 0 || input.staleCount > 0)
        return input.readyCount > 0 ? 'running' : 'pending'
      return input.readyCount > 0 ? 'success' : 'pending'
    }
    if (stage === 'relate') {
      if (input.analytics.relationsJobStatus === 'processing')
        return 'running'
      if (input.analytics.staleKinds.includes('relations'))
        return input.chunkCount > 0 ? 'degraded' : 'pending'
      return input.chunkCount > 0 ? 'success' : 'pending'
    }
    if (input.failedCount > 0 && input.chunkCount === 0)
      return 'failed'
    if (input.processingCount > 0 || input.queuedCount > 0)
      return 'running'
    if (input.candidateResourceCount <= 0)
      return 'pending'
    return input.sourceCount > 0 ? 'success' : 'pending'
  }

  const stageModel = `${input.runtime.embeddingProvider || 'provider'}:${input.runtime.embeddingModel || 'model'}`
  const latencySeed = Math.max(40, input.candidateResourceCount * 28)
  const stages: ProjectKnowledgePipelineStageMetric['stage'][] = ['ingest', 'normalize', 'parse', 'chunk', 'annotate', 'embed', 'validate', 'index', 'relate']
  return stages.map((stage, index) => {
    const status = normalizeStageStatus(stage)
    const outputCount = stage === 'chunk' || stage === 'annotate' || stage === 'embed' || stage === 'validate'
      ? input.chunkCount
      : stage === 'index' || stage === 'relate'
        ? input.readyCount
        : input.sourceCount
    const errorCount = stage === 'embed' || stage === 'validate' || stage === 'index' ? input.failedCount : 0
    const fallbackUsed = stage === 'embed' || stage === 'validate'
      ? input.fallbackEmbeddedChunkCount > 0
      : false
    const qualityScore = stage === 'embed' || stage === 'validate' || stage === 'relate'
      ? baseQuality
      : input.healthState === 'healthy'
        ? 1
        : input.healthState === 'partial'
          ? 0.56
          : input.healthState === 'fallback_only'
            ? 0.35
            : 0
    return {
      stage,
      status,
      inputCount: input.candidateResourceCount,
      outputCount,
      errorCount,
      latencyMs: latencySeed + (index * 36),
      modelName: stage === 'embed' || stage === 'validate' || stage === 'relate' ? stageModel : 'pipeline',
      fallbackUsed,
      qualityScore: Number(Math.max(0, Math.min(1, qualityScore)).toFixed(4)),
    }
  })
}

async function buildProjectKnowledgeHealthMatrix(
  db: Queryable,
  projectId: string,
): Promise<ProjectKnowledgeIndexVisuals['healthMatrix']> {
  const result = await db.query<ProjectKnowledgeHealthMatrixRow>(
    `SELECT
      COALESCE(NULLIF(metadata ->> 'modality', ''), 'unknown') AS modality,
      CASE
        WHEN COALESCE(NULLIF(metadata ->> 'embeddingStatus', ''), '') <> '' THEN metadata ->> 'embeddingStatus'
        WHEN metadata ? 'embeddingFallbackUsed' AND COALESCE((metadata ->> 'embeddingFallbackUsed')::BOOLEAN, FALSE) = TRUE THEN 'fallback'
        WHEN metadata ? 'embeddingFallbackUsed' AND COALESCE((metadata ->> 'embeddingFallbackUsed')::BOOLEAN, FALSE) = FALSE THEN 'native'
        ELSE 'missing'
      END AS embedding_status,
      COUNT(*)::TEXT AS count
     FROM project_knowledge_chunks
     WHERE project_id = $1
     GROUP BY 1, 2
     ORDER BY 1 ASC, 2 ASC`,
    [projectId],
  )

  return result.rows.map(row => ({
    modality: normalizeProjectKnowledgeModality(row.modality),
    embeddingStatus: normalizeProjectKnowledgeEmbeddingStatus(row.embedding_status),
    count: Math.max(0, Math.round(normalizeNumber(row.count, 0))),
  }))
}

async function getProjectKnowledgeAnalyticsFreshness(
  db: Queryable,
  projectId: string,
): Promise<ProjectKnowledgeAnalyticsFreshness> {
  const result = await db.query<ProjectKnowledgeAnalyticsFreshnessRow>(
    `WITH latest_jobs AS (
      SELECT DISTINCT ON (job_type)
        job_type,
        status,
        updated_at::TEXT AS updated_at,
        snapshot_type
      FROM project_knowledge_analytics_jobs
      WHERE project_id = $1
      ORDER BY job_type, updated_at DESC, created_at DESC
    ),
    latest_snapshot AS (
      SELECT snapshot_type, captured_at::TEXT AS captured_at
      FROM project_knowledge_index_snapshots
      WHERE project_id = $1
      ORDER BY captured_at DESC, created_at DESC
      LIMIT 1
    ),
    relations_state AS (
      SELECT
        'relations'::TEXT AS kind,
        MAX(updated_at)::TEXT AS updated_at,
        (SELECT status FROM latest_jobs WHERE job_type = 'relations_refresh' LIMIT 1) AS job_status,
        NULL::TEXT AS snapshot_type
      FROM project_knowledge_relations
      WHERE project_id = $1
    ),
    snapshot_state AS (
      SELECT
        'snapshot'::TEXT AS kind,
        (SELECT captured_at FROM latest_snapshot LIMIT 1) AS updated_at,
        (SELECT status FROM latest_jobs WHERE job_type = 'snapshot_capture' LIMIT 1) AS job_status,
        (SELECT snapshot_type FROM latest_snapshot LIMIT 1) AS snapshot_type
    ),
    semantic_state AS (
      SELECT
        'semantic_layout'::TEXT AS kind,
        MAX(updated_at)::TEXT AS updated_at,
        (SELECT status FROM latest_jobs WHERE job_type = 'semantic_layout_refresh' LIMIT 1) AS job_status,
        NULL::TEXT AS snapshot_type
      FROM project_knowledge_semantic_layouts
      WHERE project_id = $1
    )
    SELECT * FROM relations_state
    UNION ALL
    SELECT * FROM snapshot_state
    UNION ALL
    SELECT * FROM semantic_state`,
    [projectId],
  )

  const freshness = buildEmptyProjectKnowledgeAnalyticsFreshness()
  for (const row of result.rows) {
    const kind = row.kind
    const jobStatus = normalizeString(row.job_status) as ProjectKnowledgeAnalyticsJobStatus | ''
    const updatedAt = normalizeString(row.updated_at) || null
    if (kind === 'relations') {
      freshness.relationsUpdatedAt = updatedAt
      freshness.relationsJobStatus = (jobStatus || null) as ProjectKnowledgeAnalyticsJobStatus | null
    }
    else if (kind === 'snapshot') {
      freshness.snapshotUpdatedAt = updatedAt
      freshness.snapshotJobStatus = (jobStatus || null) as ProjectKnowledgeAnalyticsJobStatus | null
      freshness.latestSnapshotType = (normalizeString(row.snapshot_type) || null) as ProjectKnowledgeAnalyticsFreshness['latestSnapshotType']
    }
    else if (kind === 'semantic_layout') {
      freshness.semanticLayoutUpdatedAt = updatedAt
      freshness.semanticLayoutJobStatus = (jobStatus || null) as ProjectKnowledgeAnalyticsJobStatus | null
    }
  }

  const staleKinds: ProjectKnowledgeAnalyticsFreshness['staleKinds'] = []
  if (!freshness.relationsUpdatedAt || freshness.relationsJobStatus === 'pending' || freshness.relationsJobStatus === 'processing' || freshness.relationsJobStatus === 'failed')
    staleKinds.push('relations')
  if (!freshness.snapshotUpdatedAt || freshness.snapshotJobStatus === 'pending' || freshness.snapshotJobStatus === 'processing' || freshness.snapshotJobStatus === 'failed')
    staleKinds.push('snapshot')
  if (!freshness.semanticLayoutUpdatedAt || freshness.semanticLayoutJobStatus === 'pending' || freshness.semanticLayoutJobStatus === 'processing' || freshness.semanticLayoutJobStatus === 'failed')
    staleKinds.push('semantic_layout')

  freshness.staleKinds = staleKinds
  freshness.allReady = staleKinds.length === 0
  return freshness
}

function buildSourceVisualNode(
  source: ProjectKnowledgeIndexSourceStatus,
  stats: ProjectKnowledgeSourceChunkStats,
): ProjectKnowledgeIndexTopologyNode {
  const chunkCount = Math.max(
    stats.chunkCount,
    Math.max(0, Math.round(normalizeNumber(source.chunkIndexed || source.chunkTotal, 0))),
  )
  const realEmbeddingReady = stats.realEmbeddedChunkCount > 0
  const fallbackOnly = !realEmbeddingReady && stats.fallbackEmbeddedChunkCount > 0
  const size = Number((1.1 + Math.min(4.8, Math.log2(chunkCount + 1) * 1.35)).toFixed(2))
  let depth = 0.62
  if (source.status === 'ready' && realEmbeddingReady)
    depth = 0.18
  else if (source.status === 'ready' && fallbackOnly)
    depth = 0.36
  else if (source.status === 'failed')
    depth = 0.9
  else if (source.status === 'stale')
    depth = 0.72
  else if (source.status === 'queued' || source.status === 'pending')
    depth = 0.78

  return {
    id: `source:${source.id}`,
    label: source.resourceTitle,
    nodeType: 'source',
    status: source.status,
    resourceKind: source.resourceKind,
    progressPercent: Math.max(0, Math.min(100, Math.round(normalizeNumber(source.progressPercent, 0)))),
    chunkCount,
    updatedAt: normalizeString(source.lastIndexedAt) || source.updatedAt,
    size,
    depth,
    realEmbeddingReady,
    fallbackOnly,
  }
}

function buildTopologyVisuals(
  sources: ProjectKnowledgeIndexSourceStatus[],
  chunkStatsBySourceId: Map<string, ProjectKnowledgeSourceChunkStats>,
  contestResourceTitles: Map<string, string>,
): Pick<ProjectKnowledgeIndexVisuals, 'topology' | 'starfieldNodes'> {
  const sourceNodes = sources.map((source) => {
    const stats = resolveSourceChunkStats(chunkStatsBySourceId, source.id)
    return buildSourceVisualNode(source, stats)
  })

  const bindingNodes = new Map<string, ProjectKnowledgeIndexTopologyNode>()
  const links: ProjectKnowledgeIndexTopologyLink[] = []

  for (const source of sources) {
    const linkedContestResourceId = normalizeString(source.linkedContestResourceId)
    if (!linkedContestResourceId)
      continue
    const bindingNodeId = `binding:${linkedContestResourceId}`
    if (!bindingNodes.has(bindingNodeId)) {
      bindingNodes.set(bindingNodeId, {
        id: bindingNodeId,
        label: contestResourceTitles.get(linkedContestResourceId) || '关联题库资源',
        nodeType: 'binding',
        progressPercent: 100,
        chunkCount: 0,
        updatedAt: source.updatedAt,
        size: 1,
        depth: 0.12,
      })
    }
    links.push({
      sourceId: `source:${source.id}`,
      targetId: bindingNodeId,
    })
  }

  return {
    topology: {
      nodes: [...sourceNodes, ...bindingNodes.values()],
      links,
    },
    starfieldNodes: sourceNodes,
  }
}

async function resolveProjectKnowledgeVectorMode(db: Queryable): Promise<ProjectKnowledgeVectorMode> {
  const globalRef = globalThis as Record<symbol, unknown>
  const cached = globalRef[PROJECT_KNOWLEDGE_VECTOR_MODE_KEY] as ProjectKnowledgeVectorMode | undefined
  if (cached)
    return cached

  const result = await db.query<{ has_embedding: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'project_knowledge_chunks'
        AND column_name = 'embedding'
    ) AS has_embedding`,
  )
  const mode: ProjectKnowledgeVectorMode = result.rows[0]?.has_embedding ? 'vector' : 'json'
  globalRef[PROJECT_KNOWLEDGE_VECTOR_MODE_KEY] = mode
  return mode
}

async function listProjectKnowledgeCandidateRows(
  db: Queryable,
  input: {
    projectId: string
    resourceIds?: string[]
  },
): Promise<ProjectKnowledgeCandidateRow[]> {
  const resourceIds = [...new Set((input.resourceIds || []).map(item => normalizeString(item)).filter(Boolean))]
  const values: unknown[] = [input.projectId]
  let resourceSql = ''
  if (resourceIds.length > 0) {
    values.push(resourceIds)
    resourceSql = ` AND pr.id = ANY($${values.length}::TEXT[])`
  }

  const result = await db.query<ProjectKnowledgeCandidateRow>(
    `SELECT
      pr.project_id,
      pr.id AS source_resource_id,
      pr.linked_contest_resource_id,
      pr.title,
      pr.summary,
      pr.content,
      pr.metadata,
      pr.source,
      pr.resource_kind,
      pr.mime_type,
      pr.source_link,
      pr.updated_at::TEXT,
      pr.created_at::TEXT,
      prc.revision AS collab_revision,
      prd.analysis_json,
      prd.updated_at::TEXT AS document_updated_at,
      prd.page_count
     FROM project_resources pr
     LEFT JOIN project_resource_collab_docs prc
       ON prc.resource_id = pr.id
      AND prc.project_id = pr.project_id
     LEFT JOIN project_resource_documents prd
       ON prd.project_resource_id = pr.id
     WHERE pr.project_id = $1
       AND pr.status = 'active'${resourceSql}
     ORDER BY pr.updated_at DESC, pr.created_at DESC, pr.id ASC`,
    values,
  )

  return result.rows
}

async function listProjectKnowledgeSourceRows(
  db: Queryable,
  input: {
    projectId: string
    resourceIds?: string[]
  },
): Promise<ProjectKnowledgeSourceRow[]> {
  const resourceIds = [...new Set((input.resourceIds || []).map(item => normalizeString(item)).filter(Boolean))]
  const values: unknown[] = [input.projectId]
  let resourceSql = ''
  if (resourceIds.length > 0) {
    values.push(resourceIds)
    resourceSql = ` AND COALESCE(source_resource_id, '') = ANY($${values.length}::TEXT[])`
  }

  const result = await db.query<ProjectKnowledgeSourceRow>(
    `SELECT
      id,
      scope_type,
      project_id,
      source_resource_id,
      linked_contest_resource_id,
      status,
      progress_percent,
      eta_seconds,
      chunk_total,
      chunk_indexed,
      source_hash,
      index_version,
      last_indexed_at::TEXT,
      last_error,
      last_error_stage,
      last_task_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_knowledge_sources
     WHERE project_id = $1${resourceSql}
     ORDER BY updated_at DESC, created_at DESC`,
    values,
  )

  return result.rows
}

async function listProjectKnowledgeSourceSnapshots(
  db: Queryable,
  input: {
    projectId: string
    resourceId?: string
  },
): Promise<ProjectKnowledgeIndexSourceStatus[]> {
  const resourceId = normalizeString(input.resourceId)
  const values: unknown[] = [input.projectId]
  let resourceSql = ''
  if (resourceId) {
    values.push(resourceId)
    resourceSql = ` AND pr.id = $${values.length}`
  }

  const result = await db.query<ProjectKnowledgeSourceSnapshotRow>(
    `SELECT
      s.id,
      s.scope_type,
      s.project_id,
      s.source_resource_id,
      s.linked_contest_resource_id,
      s.status,
      s.progress_percent,
      s.eta_seconds,
      s.chunk_total,
      s.chunk_indexed,
      s.source_hash,
      s.index_version,
      s.last_indexed_at::TEXT,
      s.last_error,
      s.last_error_stage,
      s.last_task_id,
      s.created_at::TEXT,
      s.updated_at::TEXT,
      pr.title AS resource_title,
      pr.resource_kind,
      pr.source AS resource_source,
      t.id AS task_id,
      t.task_type AS task_task_type,
      t.status AS task_status,
      t.stage AS task_stage,
      t.attempt AS task_attempt,
      t.max_attempt AS task_max_attempt,
      t.progress_percent AS task_progress_percent,
      t.eta_seconds AS task_eta_seconds,
      t.payload_json AS task_payload_json,
      t.result_json AS task_result_json,
      t.error_message AS task_error_message,
      t.started_at::TEXT AS task_started_at,
      t.finished_at::TEXT AS task_finished_at,
      t.created_at::TEXT AS task_created_at,
      t.updated_at::TEXT AS task_updated_at
     FROM project_knowledge_sources s
     JOIN project_resources pr
       ON pr.id = s.source_resource_id
      AND pr.project_id = s.project_id
      AND pr.status = 'active'
     LEFT JOIN project_knowledge_index_tasks t
       ON t.id = NULLIF(s.last_task_id, '')
     WHERE s.project_id = $1${resourceSql}
     ORDER BY pr.updated_at DESC, pr.created_at DESC, pr.id ASC`,
    values,
  )

  return result.rows.map(buildSourceSnapshot)
}

async function listContestResourceTitlesByIds(
  db: Queryable,
  contestResourceIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(contestResourceIds.map(item => normalizeString(item)).filter(Boolean))]
  if (ids.length === 0)
    return new Map()

  const result = await db.query<ContestResourceLabelRow>(
    `SELECT id, title
     FROM contest_resources
     WHERE id = ANY($1::TEXT[])`,
    [ids],
  )

  return new Map(result.rows.map(row => [row.id, normalizeString(row.title) || '关联题库资源']))
}

async function getProjectKnowledgeTaskCount(
  db: Queryable,
  projectId: string,
): Promise<number> {
  const result = await db.query<ProjectKnowledgeTaskCountRow>(
    `SELECT COUNT(*)::TEXT AS count
     FROM project_knowledge_index_tasks
     WHERE project_id = $1`,
    [projectId],
  )
  return Math.max(0, Math.round(normalizeNumber(result.rows[0]?.count, 0)))
}

async function getProjectKnowledgeAggregateChunkStats(
  db: Queryable,
  projectId: string,
): Promise<ProjectKnowledgeAggregateChunkStats> {
  const result = await db.query<ProjectKnowledgeChunkStatsRow>(
    `SELECT
      '' AS source_id,
      COUNT(*)::TEXT AS chunk_count,
      COUNT(*) FILTER (
        WHERE metadata ? 'embeddingFallbackUsed'
          AND COALESCE((metadata ->> 'embeddingFallbackUsed')::BOOLEAN, FALSE) = FALSE
      )::TEXT AS real_chunk_count,
      COUNT(*) FILTER (
        WHERE metadata ? 'embeddingFallbackUsed'
          AND COALESCE((metadata ->> 'embeddingFallbackUsed')::BOOLEAN, FALSE) = TRUE
      )::TEXT AS fallback_chunk_count,
      COUNT(*) FILTER (
        WHERE NOT (metadata ? 'embeddingFallbackUsed')
      )::TEXT AS unknown_chunk_count,
      COUNT(*) FILTER (
        WHERE COALESCE(metadata ->> 'embeddingApiStyle', '') = 'bailian-multimodal'
          AND COALESCE((metadata ->> 'embeddingFallbackUsed')::BOOLEAN, FALSE) = FALSE
      )::TEXT AS multimodal_chunk_count
     FROM project_knowledge_chunks
     WHERE project_id = $1`,
    [projectId],
  )

  const row = result.rows[0]
  return {
    chunkCount: Math.max(0, Math.round(normalizeNumber(row?.chunk_count, 0))),
    realEmbeddedChunkCount: Math.max(0, Math.round(normalizeNumber(row?.real_chunk_count, 0))),
    fallbackEmbeddedChunkCount: Math.max(0, Math.round(normalizeNumber(row?.fallback_chunk_count, 0))),
    unknownEmbeddedChunkCount: Math.max(0, Math.round(normalizeNumber(row?.unknown_chunk_count, 0))),
    multimodalEmbeddedChunkCount: Math.max(0, Math.round(normalizeNumber(row?.multimodal_chunk_count, 0))),
  }
}

async function listProjectKnowledgeSourceChunkStats(
  db: Queryable,
  projectId: string,
): Promise<Map<string, ProjectKnowledgeSourceChunkStats>> {
  const result = await db.query<ProjectKnowledgeChunkStatsRow>(
    `SELECT
      source_id,
      COUNT(*)::TEXT AS chunk_count,
      COUNT(*) FILTER (
        WHERE metadata ? 'embeddingFallbackUsed'
          AND COALESCE((metadata ->> 'embeddingFallbackUsed')::BOOLEAN, FALSE) = FALSE
      )::TEXT AS real_chunk_count,
      COUNT(*) FILTER (
        WHERE metadata ? 'embeddingFallbackUsed'
          AND COALESCE((metadata ->> 'embeddingFallbackUsed')::BOOLEAN, FALSE) = TRUE
      )::TEXT AS fallback_chunk_count,
      COUNT(*) FILTER (
        WHERE NOT (metadata ? 'embeddingFallbackUsed')
      )::TEXT AS unknown_chunk_count,
      COUNT(*) FILTER (
        WHERE COALESCE(metadata ->> 'embeddingApiStyle', '') = 'bailian-multimodal'
          AND COALESCE((metadata ->> 'embeddingFallbackUsed')::BOOLEAN, FALSE) = FALSE
      )::TEXT AS multimodal_chunk_count
     FROM project_knowledge_chunks
     WHERE project_id = $1
     GROUP BY source_id`,
    [projectId],
  )

  return new Map(result.rows.map((row) => {
    return [row.source_id, {
      chunkCount: Math.max(0, Math.round(normalizeNumber(row.chunk_count, 0))),
      realEmbeddedChunkCount: Math.max(0, Math.round(normalizeNumber(row.real_chunk_count, 0))),
      fallbackEmbeddedChunkCount: Math.max(0, Math.round(normalizeNumber(row.fallback_chunk_count, 0))),
      unknownEmbeddedChunkCount: Math.max(0, Math.round(normalizeNumber(row.unknown_chunk_count, 0))),
      multimodalEmbeddedChunkCount: Math.max(0, Math.round(normalizeNumber(row.multimodal_chunk_count, 0))),
    }]
  }))
}

async function listProjectKnowledgeChunkKindCounts(
  db: Queryable,
  projectId: string,
): Promise<ProjectKnowledgeChunkKindCountRow[]> {
  const result = await db.query<ProjectKnowledgeChunkKindCountRow>(
    `SELECT
      COALESCE(NULLIF(chunk_kind, ''), 'unknown') AS chunk_kind,
      COUNT(*)::TEXT AS count
     FROM project_knowledge_chunks
     WHERE project_id = $1
     GROUP BY COALESCE(NULLIF(chunk_kind, ''), 'unknown')
     ORDER BY COUNT(*) DESC, chunk_kind ASC`,
    [projectId],
  )
  return result.rows
}

async function listProjectKnowledgeFailureReasonCounts(
  db: Queryable,
  projectId: string,
): Promise<ProjectKnowledgeFailureReasonRow[]> {
  const result = await db.query<ProjectKnowledgeFailureReasonRow>(
    `SELECT
      COALESCE(NULLIF(error_message, ''), '未知错误') AS error_text,
      COUNT(*)::TEXT AS count
     FROM project_knowledge_index_tasks
     WHERE project_id = $1
       AND status = 'failed'
     GROUP BY COALESCE(NULLIF(error_message, ''), '未知错误')
     ORDER BY COUNT(*) DESC, error_text ASC
     LIMIT 8`,
    [projectId],
  )
  return result.rows
}

async function listProjectKnowledgeTaskTrendRows(
  db: Queryable,
  projectId: string,
  windowDays = 10,
): Promise<ProjectKnowledgeTaskTrendRow[]> {
  const safeWindowDays = Math.max(3, Math.min(30, Math.round(normalizeNumber(windowDays, 10))))
  const result = await db.query<ProjectKnowledgeTaskTrendRow>(
    `SELECT
      TO_CHAR(DATE_TRUNC('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*)::TEXT AS tasks,
      COUNT(*) FILTER (WHERE status = 'succeeded')::TEXT AS succeeded,
     COUNT(*) FILTER (WHERE status = 'failed')::TEXT AS failed
     FROM project_knowledge_index_tasks
     WHERE project_id = $1
       AND created_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
     GROUP BY TO_CHAR(DATE_TRUNC('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
     ORDER BY day ASC`,
    [projectId, safeWindowDays - 1],
  )
  return result.rows
}

async function getProjectKnowledgeSourceRowByEntity(
  db: Queryable,
  input: {
    projectId: string
    scopeType: ProjectKnowledgeScopeType
    sourceResourceId?: string | null
    linkedContestResourceId?: string | null
  },
): Promise<ProjectKnowledgeSourceRow | null> {
  const result = await db.query<ProjectKnowledgeSourceRow>(
    `SELECT
      id,
      scope_type,
      project_id,
      source_resource_id,
      linked_contest_resource_id,
      status,
      progress_percent,
      eta_seconds,
      chunk_total,
      chunk_indexed,
      source_hash,
      index_version,
      last_indexed_at::TEXT,
      last_error,
      last_error_stage,
      last_task_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_knowledge_sources
     WHERE project_id = $1
       AND scope_type = $2
       AND COALESCE(source_resource_id, '') = COALESCE($3::TEXT, '')
       AND COALESCE(linked_contest_resource_id, '') = COALESCE($4::TEXT, '')
     LIMIT 1`,
    [
      input.projectId,
      input.scopeType,
      normalizeString(input.sourceResourceId) || null,
      normalizeString(input.linkedContestResourceId) || null,
    ],
  )
  return result.rows[0] || null
}

async function getProjectKnowledgeTaskRowById(
  db: Queryable,
  input: { taskId: string },
): Promise<ProjectKnowledgeTaskRow | null> {
  const result = await db.query<ProjectKnowledgeTaskRow>(
    `SELECT
      id,
      project_id,
      scope_type,
      source_resource_id,
      linked_contest_resource_id,
      task_type,
      status,
      stage,
      attempt,
      max_attempt,
      progress_percent,
      eta_seconds,
      payload_json,
      result_json,
      error_message,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_knowledge_index_tasks
     WHERE id = $1
     LIMIT 1`,
    [input.taskId],
  )
  return result.rows[0] || null
}

async function getActiveProjectKnowledgeTaskRow(
  db: Queryable,
  input: {
    projectId: string
    scopeType: ProjectKnowledgeScopeType
    sourceResourceId?: string | null
    linkedContestResourceId?: string | null
  },
): Promise<ProjectKnowledgeTaskRow | null> {
  const result = await db.query<ProjectKnowledgeTaskRow>(
    `SELECT
      id,
      project_id,
      scope_type,
      source_resource_id,
      linked_contest_resource_id,
      task_type,
      status,
      stage,
      attempt,
      max_attempt,
      progress_percent,
      eta_seconds,
      payload_json,
      result_json,
      error_message,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_knowledge_index_tasks
     WHERE project_id = $1
       AND scope_type = $2
       AND COALESCE(source_resource_id, '') = COALESCE($3::TEXT, '')
       AND COALESCE(linked_contest_resource_id, '') = COALESCE($4::TEXT, '')
       AND status IN ('queued', 'processing')
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      input.projectId,
      input.scopeType,
      normalizeString(input.sourceResourceId) || null,
      normalizeString(input.linkedContestResourceId) || null,
    ],
  )
  return result.rows[0] || null
}

async function getRecentSucceededAverageDurationSeconds(db: Queryable, projectId: string): Promise<number> {
  const result = await db.query<{ avg_seconds: string }>(
    `SELECT COALESCE(AVG(duration_seconds), 0)::TEXT AS avg_seconds
     FROM (
       SELECT EXTRACT(EPOCH FROM (finished_at - started_at)) AS duration_seconds
       FROM project_knowledge_index_tasks
       WHERE project_id = $1
         AND status = 'succeeded'
         AND started_at IS NOT NULL
         AND finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 20
     ) t`,
    [projectId],
  )
  const avgSeconds = normalizeNumber(result.rows[0]?.avg_seconds, 0)
  if (avgSeconds > 0)
    return Math.max(5, Math.round(avgSeconds))
  return 45
}

async function internalEnqueueProjectKnowledgeIndexTask(
  db: Queryable,
  input: {
    source: ProjectKnowledgeSourceRow
    taskType: ProjectKnowledgeTaskType
    maxAttempt?: number
    payloadJson?: Record<string, unknown>
    preserveStaleStatus?: boolean
  },
): Promise<ProjectKnowledgeTaskRow> {
  const taskId = randomUUID()
  let existingTask: ProjectKnowledgeTaskRow | null = null

  await db.query(
    `INSERT INTO project_knowledge_index_tasks (
      id,
      project_id,
      scope_type,
      source_resource_id,
      linked_contest_resource_id,
      task_type,
      status,
      stage,
      attempt,
      max_attempt,
      progress_percent,
      eta_seconds,
      payload_json,
      result_json,
      error_message,
      started_at,
      finished_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'queued', 'queued', 0, $7, 0, 0, $8::JSONB, '{}'::JSONB, '', NULL, NULL, NOW(), NOW()
    )
    ON CONFLICT DO NOTHING`,
    [
      taskId,
      input.source.project_id,
      input.source.scope_type,
      input.source.source_resource_id,
      input.source.linked_contest_resource_id,
      input.taskType,
      Math.max(1, Math.round(normalizeNumber(input.maxAttempt, 3))),
      JSON.stringify({
        sourceHash: input.source.source_hash,
        indexVersion: normalizeString(input.source.index_version) || PROJECT_KNOWLEDGE_INDEX_VERSION,
        ...normalizeRecord(input.payloadJson),
      }),
    ],
  )

  existingTask = await getActiveProjectKnowledgeTaskRow(db, {
    projectId: input.source.project_id,
    scopeType: input.source.scope_type,
    sourceResourceId: input.source.source_resource_id,
    linkedContestResourceId: input.source.linked_contest_resource_id,
  })

  const task = existingTask || await getProjectKnowledgeTaskRowById(db, { taskId })
  if (!task)
    throw new Error('PROJECT_KNOWLEDGE_TASK_ENQUEUE_FAILED')

  const preserveStaleStatus = Boolean(input.preserveStaleStatus && input.source.status === 'stale')
  await db.query(
    `UPDATE project_knowledge_sources
     SET status = CASE WHEN $2 THEN status ELSE 'queued' END,
         progress_percent = CASE WHEN $2 THEN progress_percent ELSE 0 END,
         eta_seconds = CASE WHEN $2 THEN eta_seconds ELSE 0 END,
         last_task_id = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [input.source.id, preserveStaleStatus, task.id],
  )

  return task
}

export async function syncProjectKnowledgeSourcesForProject(
  db: Queryable,
  input: {
    projectId: string
    resourceIds?: string[]
    autoEnqueue?: boolean
  },
): Promise<ProjectKnowledgeIndexSourceStatus[]> {
  const { runtime } = await readEffectiveRuntimeSettings()
  const candidates = await listProjectKnowledgeCandidateRows(db, {
    projectId: input.projectId,
    resourceIds: input.resourceIds,
  })
  const existingRows = await listProjectKnowledgeSourceRows(db, {
    projectId: input.projectId,
    resourceIds: input.resourceIds,
  })
  const existingMap = new Map(existingRows.map(row => [buildSourceEntityKey(row.scope_type, row.source_resource_id, row.linked_contest_resource_id), row]))
  const autoEnqueue = input.autoEnqueue !== false

  for (const candidate of candidates) {
    const scopeType = inferScopeType(candidate)
    const sourceKey = buildSourceEntityKey(scopeType, candidate.source_resource_id, candidate.linked_contest_resource_id)
    const existing = existingMap.get(sourceKey) || null
    const sourceHash = buildProjectKnowledgeSourceHash(candidate, runtime)
    const now = new Date().toISOString()

    if (!existing) {
      const sourceId = randomUUID()
      await db.query(
        `INSERT INTO project_knowledge_sources (
          id,
          project_id,
          scope_type,
          source_resource_id,
          linked_contest_resource_id,
          status,
          progress_percent,
          eta_seconds,
          chunk_total,
          chunk_indexed,
          source_hash,
          index_version,
          last_indexed_at,
          last_error,
          last_error_stage,
          last_task_id,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'pending', 0, 0, 0, 0, $6, $7, NULL, '', '', '', $8, $8
        )
        ON CONFLICT DO NOTHING`,
        [
          sourceId,
          input.projectId,
          scopeType,
          candidate.source_resource_id,
          candidate.linked_contest_resource_id,
          sourceHash,
          PROJECT_KNOWLEDGE_INDEX_VERSION,
          now,
        ],
      )

      const created = await getProjectKnowledgeSourceRowByEntity(db, {
        projectId: input.projectId,
        scopeType,
        sourceResourceId: candidate.source_resource_id,
        linkedContestResourceId: candidate.linked_contest_resource_id,
      })
      if (created && autoEnqueue)
        await internalEnqueueProjectKnowledgeIndexTask(db, { source: created, taskType: 'upsert' })
      continue
    }

    const hashChanged = normalizeString(existing.source_hash) !== sourceHash
    const versionChanged = normalizeString(existing.index_version) !== PROJECT_KNOWLEDGE_INDEX_VERSION
    let nextStatus = existing.status
    let nextProgressPercent = Math.max(0, Math.min(100, Math.round(normalizeNumber(existing.progress_percent, 0))))
    let nextEtaSeconds = Math.max(0, Math.round(normalizeNumber(existing.eta_seconds, 0)))
    let nextChunkTotal = Math.max(0, Math.round(normalizeNumber(existing.chunk_total, 0)))
    let nextChunkIndexed = Math.max(0, Math.round(normalizeNumber(existing.chunk_indexed, 0)))

    if (hashChanged || versionChanged) {
      if (!isProcessingSourceStatus(existing.status) && existing.status !== 'queued') {
        if (existing.status === 'ready') {
          nextStatus = 'stale'
        }
        else {
          nextStatus = 'pending'
          nextProgressPercent = 0
          nextEtaSeconds = 0
          nextChunkTotal = 0
          nextChunkIndexed = 0
        }
      }
    }

    await db.query(
      `UPDATE project_knowledge_sources
       SET linked_contest_resource_id = $2,
           status = $3,
           progress_percent = $4,
           eta_seconds = $5,
           chunk_total = $6,
           chunk_indexed = $7,
           source_hash = $8,
           index_version = $9,
           updated_at = $10
       WHERE id = $1`,
      [
        existing.id,
        candidate.linked_contest_resource_id,
        nextStatus,
        nextProgressPercent,
        nextEtaSeconds,
        nextChunkTotal,
        nextChunkIndexed,
        sourceHash,
        PROJECT_KNOWLEDGE_INDEX_VERSION,
        now,
      ],
    )

    if (!autoEnqueue)
      continue

    const refreshed = await getProjectKnowledgeSourceRowByEntity(db, {
      projectId: input.projectId,
      scopeType,
      sourceResourceId: candidate.source_resource_id,
      linkedContestResourceId: candidate.linked_contest_resource_id,
    })
    if (!refreshed)
      continue

    if (!hashChanged && !versionChanged && refreshed.status !== 'pending' && refreshed.status !== 'stale')
      continue

    await internalEnqueueProjectKnowledgeIndexTask(db, {
      source: refreshed,
      taskType: hashChanged || versionChanged ? 'reindex' : 'upsert',
      preserveStaleStatus: refreshed.status === 'stale',
    })
  }

  return listProjectKnowledgeSourceSnapshots(db, {
    projectId: input.projectId,
    resourceId: normalizeString(input.resourceIds?.[0]),
  })
}

export async function scheduleProjectKnowledgeSourceUpsert(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectKnowledgeIndexSourceStatus | null> {
  const snapshots = await syncProjectKnowledgeSourcesForProject(db, {
    projectId: input.projectId,
    resourceIds: [input.resourceId],
    autoEnqueue: true,
  })
  return snapshots[0] || null
}

export async function markProjectKnowledgeSourceStale(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    autoEnqueue?: boolean
  },
): Promise<ProjectKnowledgeIndexSourceStatus | null> {
  const snapshots = await syncProjectKnowledgeSourcesForProject(db, {
    projectId: input.projectId,
    resourceIds: [input.resourceId],
    autoEnqueue: input.autoEnqueue !== false,
  })
  return snapshots[0] || null
}

export async function enqueueProjectKnowledgeIndexTask(
  db: Queryable,
  input: {
    projectId: string
    sourceResourceId: string
    taskType: ProjectKnowledgeTaskType
    maxAttempt?: number
    payloadJson?: Record<string, unknown>
    preserveStaleStatus?: boolean
  },
): Promise<ProjectKnowledgeIndexTaskSnapshot> {
  await syncProjectKnowledgeSourcesForProject(db, {
    projectId: input.projectId,
    resourceIds: [input.sourceResourceId],
    autoEnqueue: false,
  })
  const source = await getProjectKnowledgeSourceRowByEntity(db, {
    projectId: input.projectId,
    scopeType: 'project_resource',
    sourceResourceId: input.sourceResourceId,
  })
  if (!source)
    throw new Error('PROJECT_KNOWLEDGE_SOURCE_NOT_FOUND')

  const task = await internalEnqueueProjectKnowledgeIndexTask(db, {
    source,
    taskType: input.taskType,
    maxAttempt: input.maxAttempt,
    payloadJson: input.payloadJson,
    preserveStaleStatus: input.preserveStaleStatus,
  })
  const snapshots = await listProjectKnowledgeSourceSnapshots(db, {
    projectId: input.projectId,
    resourceId: input.sourceResourceId,
  })
  return snapshots[0]?.lastTask || buildTaskSnapshot(task)
}

export async function getProjectKnowledgeSourceStatusByResourceId(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectKnowledgeIndexSourceStatus | null> {
  await syncProjectKnowledgeSourcesForProject(db, {
    projectId: input.projectId,
    resourceIds: [input.resourceId],
    autoEnqueue: true,
  })
  const snapshots = await listProjectKnowledgeSourceSnapshots(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
  })
  return snapshots[0] || null
}

export async function buildProjectKnowledgeIndexDashboard(
  db: Queryable,
  input: {
    projectId: string
    syncSources?: boolean
  },
): Promise<ProjectKnowledgeIndexDashboard> {
  if (input.syncSources !== false) {
    await syncProjectKnowledgeSourcesForProject(db, {
      projectId: input.projectId,
      autoEnqueue: true,
    })
  }

  const [
    candidateRows,
    sources,
    avgSucceededSeconds,
    taskCount,
    chunkStats,
    chunkStatsBySourceId,
    chunkKindRows,
    failureReasonRows,
    taskTrendRows,
    healthMatrix,
    analytics,
  ] = await Promise.all([
    listProjectKnowledgeCandidateRows(db, {
      projectId: input.projectId,
    }),
    listProjectKnowledgeSourceSnapshots(db, {
      projectId: input.projectId,
    }),
    getRecentSucceededAverageDurationSeconds(db, input.projectId),
    getProjectKnowledgeTaskCount(db, input.projectId),
    getProjectKnowledgeAggregateChunkStats(db, input.projectId),
    listProjectKnowledgeSourceChunkStats(db, input.projectId),
    listProjectKnowledgeChunkKindCounts(db, input.projectId),
    listProjectKnowledgeFailureReasonCounts(db, input.projectId),
    listProjectKnowledgeTaskTrendRows(db, input.projectId),
    buildProjectKnowledgeHealthMatrix(db, input.projectId),
    getProjectKnowledgeAnalyticsFreshness(db, input.projectId),
  ])

  const totalResources = sources.length
  const indexableResources = sources.filter(item => item.status !== 'skipped').length
  const pendingCount = sources.filter(item => item.status === 'pending').length
  const readyCount = sources.filter(item => item.status === 'ready').length
  const processingCount = sources.filter(item => PROCESSING_SOURCE_STATUS_SET.has(item.status)).length
  const queuedCount = sources.filter(item => item.status === 'queued').length
  const failedCount = sources.filter(item => item.status === 'failed').length
  const staleCount = sources.filter(item => item.status === 'stale').length
  const skippedCount = sources.filter(item => item.status === 'skipped').length

  const totalContribution = indexableResources > 0
    ? sources
        .filter(item => item.status !== 'skipped')
        .reduce((sum, item) => sum + contributionForSummary(item), 0)
    : 100
  const overallProgressPercent = indexableResources > 0
    ? Math.max(0, Math.min(100, Math.round(totalContribution / indexableResources)))
    : 100

  const processingEtaSeconds = sources
    .filter(item => item.status === 'extracting' || item.status === 'chunking' || item.status === 'embedding')
    .reduce((sum, item) => sum + estimateRunningEtaSeconds(item), 0)
  const queuedBacklogCount = pendingCount + queuedCount + staleCount
  const etaSeconds = processingEtaSeconds + queuedBacklogCount * avgSucceededSeconds

  const processing = sources
    .filter(item => item.status === 'queued' || item.status === 'extracting' || item.status === 'chunking' || item.status === 'embedding')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const recentCompleted = sources
    .filter(item => item.status === 'ready')
    .sort((left, right) => normalizeString(right.lastIndexedAt).localeCompare(normalizeString(left.lastIndexedAt)))
    .slice(0, 12)
  const failed = sources
    .filter(item => item.status === 'failed')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 12)
  const tasks = sources
    .map(item => item.lastTask)
    .filter((item): item is ProjectKnowledgeIndexTaskSnapshot => Boolean(item))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 40)

  const summary: ProjectKnowledgeIndexSummary = {
    projectId: input.projectId,
    totalResources,
    indexableResources,
    pendingCount,
    readyCount,
    processingCount,
    queuedCount,
    failedCount,
    staleCount,
    skippedCount,
    overallProgressPercent,
    etaSeconds,
    estimatedFinishedAt: etaSeconds > 0 ? buildEtaFinishedAt(etaSeconds) : (indexableResources > 0 && readyCount + skippedCount === indexableResources ? new Date().toISOString() : null),
    lastRefreshedAt: new Date().toISOString(),
  }

  const runtime = await buildProjectKnowledgeRuntimeStatus()
  const worker = buildProjectKnowledgeWorkerStatus()
  const health = buildProjectKnowledgeHealth({
    summary,
    candidateResourceCount: candidateRows.length,
    runtime,
    worker,
    chunkStats,
  })
  const contestResourceTitles = await listContestResourceTitlesByIds(
    db,
    sources.map(item => normalizeString(item.linkedContestResourceId)),
  )
  const topologyVisuals = buildTopologyVisuals(sources, chunkStatsBySourceId, contestResourceTitles)
  const clusterCompactnessValue = chunkStats.chunkCount > 0
    ? ((chunkStats.realEmbeddedChunkCount / Math.max(1, chunkStats.chunkCount)) * 0.78)
    + ((readyCount / Math.max(1, indexableResources || totalResources || 1)) * 0.22)
    : 0
  const nearestNeighborConsistencyValue = healthMatrix.length > 0
    ? healthMatrix.reduce((sum, item) => {
      const weight = item.embeddingStatus === 'native'
        ? 1
        : item.embeddingStatus === 'derived'
          ? 0.82
          : item.embeddingStatus === 'fallback'
            ? 0.35
            : 0
      return sum + (item.count * weight)
    }, 0) / Math.max(1, healthMatrix.reduce((sum, item) => sum + item.count, 0))
    : 0
  const crossModalAlignmentValue = sources.length > 0
    ? (chunkStats.multimodalEmbeddedChunkCount / Math.max(1, chunkStats.chunkCount))
    * (chunkStats.realEmbeddedChunkCount > 0 ? 1 : 0.4)
    : 0
  const clusterMetrics = {
    clusterCompactness: Number(Math.max(0, Math.min(1, clusterCompactnessValue)).toFixed(4)),
    nearestNeighborConsistency: Number(Math.max(0, Math.min(1, nearestNeighborConsistencyValue)).toFixed(4)),
    crossModalAlignmentScore: Number(Math.max(0, Math.min(1, crossModalAlignmentValue)).toFixed(4)),
  }
  const visuals: ProjectKnowledgeIndexVisuals = {
    stageFunnel: [
      toCountItem('待索引', pendingCount),
      toCountItem('排队中', queuedCount),
      toCountItem('处理中', processingCount),
      toCountItem('索引完成', readyCount),
      toCountItem('索引失败', failedCount),
      toCountItem('待刷新', staleCount),
    ],
    failureReasons: failureReasonRows.map(row => toCountItem(normalizeString(row.error_text) || '未知错误', normalizeNumber(row.count, 0))),
    chunkKindDistribution: chunkKindRows.map(row => toCountItem(formatChunkKindLabel(row.chunk_kind), normalizeNumber(row.count, 0))),
    resourceKindDistribution: buildResourceKindDistribution(sources),
    embeddingComposition: buildEmbeddingComposition(sources, chunkStatsBySourceId),
    taskTrend: buildTaskTrendSeries(taskTrendRows),
    resourceStatusMatrix: buildResourceStatusMatrix(sources),
    topology: topologyVisuals.topology,
    starfieldNodes: topologyVisuals.starfieldNodes,
    healthMatrix,
    pipelineMetrics: buildPipelineMetrics({
      candidateResourceCount: candidateRows.length,
      sourceCount: sources.length,
      readyCount,
      processingCount,
      queuedCount,
      failedCount,
      staleCount,
      chunkCount: chunkStats.chunkCount,
      realEmbeddedChunkCount: chunkStats.realEmbeddedChunkCount,
      fallbackEmbeddedChunkCount: chunkStats.fallbackEmbeddedChunkCount,
      healthState: health.healthState,
      runtime,
      analytics,
    }),
    clusterMetrics,
  }
  const multimodalIndexedCount = sources.filter((source) => {
    const stats = resolveSourceChunkStats(chunkStatsBySourceId, source.id)
    return stats.multimodalEmbeddedChunkCount > 0
  }).length
  const multimodalBlockedCount = sources.filter((source) => {
    return source.status === 'failed' && normalizeString(source.lastError).includes('BAILIAN_MULTIMODAL')
  }).length
  const embeddingHealthReason = health.issues.find(issue => issue.severity !== 'info')?.code || (health.healthState === 'healthy' ? '' : health.healthState)
  const diagnostics: ProjectKnowledgeIndexDiagnostics = {
    candidateResourceCount: candidateRows.length,
    sourceCount: sources.length,
    taskCount,
    chunkCount: chunkStats.chunkCount,
    realEmbeddedChunkCount: chunkStats.realEmbeddedChunkCount,
    fallbackEmbeddedChunkCount: chunkStats.fallbackEmbeddedChunkCount,
    unknownEmbeddedChunkCount: chunkStats.unknownEmbeddedChunkCount,
    multimodalIndexedCount,
    multimodalBlockedCount,
    healthState: health.healthState,
    healthMessage: health.healthMessage,
    embeddingHealthReason: embeddingHealthReason || undefined,
    issues: health.issues,
  }

  return {
    summary,
    runtime,
    worker,
    diagnostics,
    analytics,
    visuals,
    processing,
    recentCompleted,
    failed,
    sources,
    tasks,
  }
}

export async function reindexProjectKnowledgeSources(
  db: Queryable,
  input: {
    projectId: string
    target: 'all' | 'stale' | 'failed'
  },
): Promise<{ queuedCount: number, dashboard: ProjectKnowledgeIndexDashboard }> {
  await syncProjectKnowledgeSourcesForProject(db, {
    projectId: input.projectId,
    autoEnqueue: false,
  })
  const sources = await listProjectKnowledgeSourceSnapshots(db, {
    projectId: input.projectId,
  })
  const targets = sources.filter((source) => {
    if (source.status === 'skipped')
      return false
    if (input.target === 'all')
      return true
    if (input.target === 'stale')
      return source.status === 'stale'
    return source.status === 'failed'
  })

  let queuedCount = 0
  for (const source of targets) {
    if (!normalizeString(source.sourceResourceId))
      continue
    await enqueueProjectKnowledgeIndexTask(db, {
      projectId: input.projectId,
      sourceResourceId: source.sourceResourceId!,
      taskType: 'reindex',
      preserveStaleStatus: source.status === 'stale',
      payloadJson: {
        trigger: 'manual_project_reindex',
        target: input.target,
      },
    })
    queuedCount += 1
  }

  const dashboard = await buildProjectKnowledgeIndexDashboard(db, {
    projectId: input.projectId,
    syncSources: false,
  })
  return {
    queuedCount,
    dashboard,
  }
}

export async function reindexProjectKnowledgeSourceByResourceId(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectKnowledgeIndexSourceStatus | null> {
  await enqueueProjectKnowledgeIndexTask(db, {
    projectId: input.projectId,
    sourceResourceId: input.resourceId,
    taskType: 'reindex',
    payloadJson: {
      trigger: 'manual_resource_reindex',
    },
  })
  return getProjectKnowledgeSourceStatusByResourceId(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
  })
}

export async function claimNextQueuedProjectKnowledgeIndexTask(
  db: Queryable,
): Promise<ProjectKnowledgeIndexTaskSnapshot | null> {
  const result = await db.query<ProjectKnowledgeTaskRow>(
    `WITH picked AS (
      SELECT id
      FROM project_knowledge_index_tasks
      WHERE status IN ('queued', 'failed')
        AND attempt < max_attempt
      ORDER BY CASE WHEN status = 'queued' THEN 0 ELSE 1 END ASC, updated_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE project_knowledge_index_tasks t
    SET status = 'processing',
        stage = 'extracting',
        attempt = t.attempt + 1,
        progress_percent = GREATEST(t.progress_percent, 10),
        eta_seconds = CASE WHEN t.eta_seconds > 0 THEN t.eta_seconds ELSE 120 END,
        error_message = '',
        started_at = NOW(),
        finished_at = NULL,
        updated_at = NOW()
    FROM picked
    WHERE t.id = picked.id
    RETURNING
      t.id,
      t.project_id,
      t.scope_type,
      t.source_resource_id,
      t.linked_contest_resource_id,
      t.task_type,
      t.status,
      t.stage,
      t.attempt,
      t.max_attempt,
      t.progress_percent,
      t.eta_seconds,
      t.payload_json,
      t.result_json,
      t.error_message,
      t.started_at::TEXT,
      t.finished_at::TEXT,
      t.created_at::TEXT,
      t.updated_at::TEXT`,
  )
  const row = result.rows[0]
  if (!row)
    return null

  await db.query(
    `UPDATE project_knowledge_sources
     SET status = 'extracting',
         progress_percent = GREATEST(progress_percent, 10),
         eta_seconds = CASE WHEN eta_seconds > 0 THEN eta_seconds ELSE 120 END,
         last_task_id = $2,
         updated_at = NOW()
     WHERE project_id = $1
       AND scope_type = $3
       AND COALESCE(source_resource_id, '') = COALESCE($4::TEXT, '')
       AND COALESCE(linked_contest_resource_id, '') = COALESCE($5::TEXT, '')`,
    [
      row.project_id,
      row.id,
      row.scope_type,
      row.source_resource_id,
      row.linked_contest_resource_id,
    ],
  )

  return buildTaskSnapshot(row)
}

export async function getProjectKnowledgeTaskContext(
  db: Queryable,
  input: { taskId: string },
): Promise<ProjectKnowledgeTaskContext | null> {
  const task = await getProjectKnowledgeTaskRowById(db, {
    taskId: input.taskId,
  })
  if (!task)
    return null

  const snapshots = await listProjectKnowledgeSourceSnapshots(db, {
    projectId: task.project_id,
    resourceId: normalizeString(task.source_resource_id),
  })
  const source = snapshots[0] || null
  if (!source || !normalizeString(source.sourceResourceId))
    return null

  const candidates = await listProjectKnowledgeCandidateRows(db, {
    projectId: task.project_id,
    resourceIds: [source.sourceResourceId!],
  })
  const candidate = candidates[0]
  if (!candidate)
    return null

  const { runtime } = await readEffectiveRuntimeSettings()
  return {
    task: source.lastTask || buildTaskSnapshot(task, source.resourceTitle),
    source,
    resource: {
      id: candidate.source_resource_id,
      projectId: candidate.project_id,
      title: normalizeString(candidate.title),
      summary: normalizeString(candidate.summary),
      content: normalizeString(candidate.content),
      metadata: normalizeRecord(candidate.metadata),
      resourceKind: candidate.resource_kind,
      source: candidate.source,
      linkedContestResourceId: candidate.linked_contest_resource_id,
      mimeType: normalizeString(candidate.mime_type),
      sourceLink: normalizeString(candidate.source_link),
      updatedAt: normalizeString(candidate.updated_at),
      collabRevision: candidate.collab_revision,
    },
    documentAnalysis: normalizeDocumentAnalysis(candidate.analysis_json),
    processedSourceHash: buildProjectKnowledgeSourceHash(candidate, runtime),
  }
}

export async function updateProjectKnowledgeTaskProgress(
  db: Queryable,
  input: {
    taskId: string
    status?: ProjectKnowledgeSourceStatus
    stage: ProjectKnowledgeTaskStage
    progressPercent: number
    etaSeconds: number
    chunkTotal?: number
    chunkIndexed?: number
    resultJson?: Record<string, unknown>
  },
): Promise<void> {
  const task = await getProjectKnowledgeTaskRowById(db, {
    taskId: input.taskId,
  })
  if (!task)
    return

  const progressPercent = Math.max(0, Math.min(100, Math.round(normalizeNumber(input.progressPercent, 0))))
  const etaSeconds = Math.max(0, Math.round(normalizeNumber(input.etaSeconds, 0)))
  const nextStatus = input.status || (input.stage === 'extracting' ? 'extracting' : input.stage === 'chunking' ? 'chunking' : 'embedding')

  await db.query(
    `UPDATE project_knowledge_index_tasks
     SET stage = $2,
         progress_percent = $3,
         eta_seconds = $4,
         result_json = CASE WHEN $5::JSONB IS NULL THEN result_json ELSE $5::JSONB END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.taskId,
      input.stage,
      progressPercent,
      etaSeconds,
      input.resultJson ? JSON.stringify(input.resultJson) : null,
    ],
  )

  await db.query(
    `UPDATE project_knowledge_sources
     SET status = $2,
         progress_percent = $3,
         eta_seconds = $4,
         chunk_total = CASE WHEN $5::INT IS NULL THEN chunk_total ELSE $5::INT END,
         chunk_indexed = CASE WHEN $6::INT IS NULL THEN chunk_indexed ELSE $6::INT END,
         last_task_id = $7,
         updated_at = NOW()
     WHERE project_id = $1
       AND scope_type = $8
       AND COALESCE(source_resource_id, '') = COALESCE($9::TEXT, '')
       AND COALESCE(linked_contest_resource_id, '') = COALESCE($10::TEXT, '')`,
    [
      task.project_id,
      nextStatus,
      progressPercent,
      etaSeconds,
      input.chunkTotal === undefined ? null : Math.max(0, Math.round(normalizeNumber(input.chunkTotal, 0))),
      input.chunkIndexed === undefined ? null : Math.max(0, Math.round(normalizeNumber(input.chunkIndexed, 0))),
      task.id,
      task.scope_type,
      task.source_resource_id,
      task.linked_contest_resource_id,
    ],
  )
}

export async function replaceProjectKnowledgeChunks(
  db: Queryable,
  input: {
    sourceId: string
    projectId: string
    scopeType: ProjectKnowledgeScopeType
    sourceResourceId?: string | null
    linkedContestResourceId?: string | null
    sourceHash: string
    indexVersion: string
    chunks: ProjectKnowledgeChunkWriteInput[]
  },
): Promise<void> {
  const mode = await resolveProjectKnowledgeVectorMode(db)
  await db.query(
    `DELETE FROM project_knowledge_chunks
     WHERE source_id = $1`,
    [input.sourceId],
  )

  for (const chunk of input.chunks) {
    if (!normalizeString(chunk.content))
      continue
    const id = randomUUID()
    if (mode === 'vector') {
      await db.query(
        `INSERT INTO project_knowledge_chunks (
          id,
          project_id,
          source_id,
          scope_type,
          source_resource_id,
          linked_contest_resource_id,
          chunk_index,
          chunk_kind,
          title,
          content,
          citation_label,
          page_number,
          section_label,
          source_hash,
          index_version,
          metadata,
          embedding,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::JSONB, $17::vector, NOW(), NOW()
        )`,
        [
          id,
          input.projectId,
          input.sourceId,
          input.scopeType,
          normalizeString(input.sourceResourceId) || null,
          normalizeString(input.linkedContestResourceId) || null,
          Math.max(0, Math.round(normalizeNumber(chunk.chunkIndex, 0))),
          chunk.chunkKind,
          normalizeString(chunk.title),
          normalizeString(chunk.content),
          normalizeString(chunk.citationLabel),
          chunk.pageNumber == null ? null : Math.max(1, Math.round(normalizeNumber(chunk.pageNumber, 1))),
          normalizeString(chunk.sectionLabel),
          normalizeString(input.sourceHash),
          normalizeString(input.indexVersion) || PROJECT_KNOWLEDGE_INDEX_VERSION,
          JSON.stringify(normalizeRecord(chunk.metadata)),
          `[${normalizeNumberArray(chunk.embedding).join(',')}]`,
        ],
      )
      continue
    }

    await db.query(
      `INSERT INTO project_knowledge_chunks (
        id,
        project_id,
        source_id,
        scope_type,
        source_resource_id,
        linked_contest_resource_id,
        chunk_index,
        chunk_kind,
        title,
        content,
        citation_label,
        page_number,
        section_label,
        source_hash,
        index_version,
        metadata,
        embedding_json,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::JSONB, $17::JSONB, NOW(), NOW()
      )`,
      [
        id,
        input.projectId,
        input.sourceId,
        input.scopeType,
        normalizeString(input.sourceResourceId) || null,
        normalizeString(input.linkedContestResourceId) || null,
        Math.max(0, Math.round(normalizeNumber(chunk.chunkIndex, 0))),
        chunk.chunkKind,
        normalizeString(chunk.title),
        normalizeString(chunk.content),
        normalizeString(chunk.citationLabel),
        chunk.pageNumber == null ? null : Math.max(1, Math.round(normalizeNumber(chunk.pageNumber, 1))),
        normalizeString(chunk.sectionLabel),
        normalizeString(input.sourceHash),
        normalizeString(input.indexVersion) || PROJECT_KNOWLEDGE_INDEX_VERSION,
        JSON.stringify(normalizeRecord(chunk.metadata)),
        JSON.stringify(normalizeNumberArray(chunk.embedding)),
      ],
    )
  }
}

export async function completeProjectKnowledgeTaskSuccess(
  db: Queryable,
  input: {
    taskId: string
    processedSourceHash: string
    chunkTotal: number
    chunkIndexed: number
    resultJson?: Record<string, unknown>
  },
): Promise<{ needsRequeue: boolean }> {
  const task = await getProjectKnowledgeTaskRowById(db, {
    taskId: input.taskId,
  })
  if (!task)
    return { needsRequeue: false }

  const source = await getProjectKnowledgeSourceRowByEntity(db, {
    projectId: task.project_id,
    scopeType: task.scope_type,
    sourceResourceId: task.source_resource_id,
    linkedContestResourceId: task.linked_contest_resource_id,
  })
  if (!source)
    return { needsRequeue: false }

  const currentSourceHash = normalizeString(source.source_hash)
  const needsRequeue = Boolean(currentSourceHash && currentSourceHash !== normalizeString(input.processedSourceHash))

  await db.query(
    `UPDATE project_knowledge_index_tasks
     SET status = 'succeeded',
         stage = 'finalizing',
         progress_percent = 100,
         eta_seconds = 0,
         error_message = '',
         result_json = $2::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.taskId,
      JSON.stringify({
        ...normalizeRecord(input.resultJson),
        chunkTotal: Math.max(0, Math.round(normalizeNumber(input.chunkTotal, 0))),
        chunkIndexed: Math.max(0, Math.round(normalizeNumber(input.chunkIndexed, 0))),
        processedSourceHash: normalizeString(input.processedSourceHash),
        needsRequeue,
      }),
    ],
  )

  await db.query(
    `UPDATE project_knowledge_sources
     SET status = $2,
         progress_percent = CASE WHEN $2 = 'ready' THEN 100 ELSE progress_percent END,
         eta_seconds = 0,
         chunk_total = $3,
         chunk_indexed = $4,
         last_indexed_at = NOW(),
         last_error = '',
         last_error_stage = '',
         last_task_id = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [
      source.id,
      needsRequeue ? 'stale' : 'ready',
      Math.max(0, Math.round(normalizeNumber(input.chunkTotal, 0))),
      Math.max(0, Math.round(normalizeNumber(input.chunkIndexed, 0))),
      input.taskId,
    ],
  )

  if (needsRequeue) {
    const refreshed = await getProjectKnowledgeSourceRowByEntity(db, {
      projectId: task.project_id,
      scopeType: task.scope_type,
      sourceResourceId: task.source_resource_id,
      linkedContestResourceId: task.linked_contest_resource_id,
    })
    if (refreshed) {
      await internalEnqueueProjectKnowledgeIndexTask(db, {
        source: refreshed,
        taskType: 'reindex',
        preserveStaleStatus: true,
        payloadJson: {
          trigger: 'stale_after_processing',
        },
      })
    }
  }

  return { needsRequeue }
}

export async function completeProjectKnowledgeTaskFailure(
  db: Queryable,
  input: {
    taskId: string
    errorMessage: string
    resultJson?: Record<string, unknown>
  },
): Promise<{ status: ProjectKnowledgeTaskStatus | null }> {
  const task = await getProjectKnowledgeTaskRowById(db, {
    taskId: input.taskId,
  })
  if (!task)
    return { status: null }

  const nextStatus: ProjectKnowledgeTaskStatus = task.attempt >= task.max_attempt ? 'dead_letter' : 'failed'
  const safeErrorMessage = normalizeString(input.errorMessage) || 'unknown error'

  await db.query(
    `UPDATE project_knowledge_index_tasks
     SET status = $2,
         eta_seconds = 0,
         error_message = $3,
         result_json = $4::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.taskId,
      nextStatus,
      safeErrorMessage,
      JSON.stringify({
        ...normalizeRecord(input.resultJson),
        errorMessage: safeErrorMessage,
      }),
    ],
  )

  await db.query(
    `UPDATE project_knowledge_sources
     SET status = 'failed',
         eta_seconds = 0,
         last_error = $2,
         last_error_stage = $3,
         last_task_id = $4,
         updated_at = NOW()
     WHERE project_id = $1
       AND scope_type = $5
       AND COALESCE(source_resource_id, '') = COALESCE($6::TEXT, '')
       AND COALESCE(linked_contest_resource_id, '') = COALESCE($7::TEXT, '')`,
    [
      task.project_id,
      safeErrorMessage,
      task.stage,
      task.id,
      task.scope_type,
      task.source_resource_id,
      task.linked_contest_resource_id,
    ],
  )

  return {
    status: nextStatus,
  }
}

export async function cancelProjectKnowledgeTask(
  db: Queryable,
  input: {
    taskId: string
    resultJson?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE project_knowledge_index_tasks
     SET status = 'cancelled',
         eta_seconds = 0,
         result_json = $2::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.taskId, JSON.stringify(normalizeRecord(input.resultJson))],
  )
}

export async function resetStaleProjectKnowledgeTasks(
  db: Queryable,
  input: {
    staleMinutes: number
  },
): Promise<number> {
  const staleMinutes = Math.max(1, Math.round(normalizeNumber(input.staleMinutes, 20)))
  const result = await db.query<ProjectKnowledgeTaskRow>(
    `UPDATE project_knowledge_index_tasks
     SET status = 'queued',
         stage = 'queued',
         progress_percent = 0,
         eta_seconds = 0,
         error_message = '[worker] 检测到索引处理中断，已自动重排',
         started_at = NULL,
         finished_at = NULL,
         updated_at = NOW()
     WHERE status = 'processing'
       AND (started_at IS NULL OR started_at < NOW() - ($1::TEXT || ' minutes')::INTERVAL)
     RETURNING
      id,
      project_id,
      scope_type,
      source_resource_id,
      linked_contest_resource_id,
      task_type,
      status,
      stage,
      attempt,
      max_attempt,
      progress_percent,
      eta_seconds,
      payload_json,
      result_json,
      error_message,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [String(staleMinutes)],
  )

  for (const row of result.rows) {
    await db.query(
      `UPDATE project_knowledge_sources
       SET status = CASE WHEN status = 'stale' THEN 'stale' ELSE 'queued' END,
           progress_percent = CASE WHEN status = 'stale' THEN progress_percent ELSE 0 END,
           eta_seconds = 0,
           last_error = '[worker] 检测到索引处理中断，已自动重排',
           last_error_stage = '',
           last_task_id = $2,
           updated_at = NOW()
       WHERE project_id = $1
         AND scope_type = $3
         AND COALESCE(source_resource_id, '') = COALESCE($4::TEXT, '')
         AND COALESCE(linked_contest_resource_id, '') = COALESCE($5::TEXT, '')`,
      [
        row.project_id,
        row.id,
        row.scope_type,
        row.source_resource_id,
        row.linked_contest_resource_id,
      ],
    )
  }

  return Math.max(0, result.rowCount || 0)
}

export async function listProjectKnowledgeSearchChunks(
  db: Queryable,
  input: {
    projectId: string
    includeStale?: boolean
  },
): Promise<ProjectKnowledgeSearchChunk[]> {
  const mode = await resolveProjectKnowledgeVectorMode(db)
  const statusList = input.includeStale ? ['ready', 'stale'] : ['ready']
  const embeddingSql = mode === 'vector'
    ? `pkc.embedding::TEXT AS embedding_text, NULL::JSONB AS embedding_json`
    : `NULL::TEXT AS embedding_text, pkc.embedding_json AS embedding_json`

  const result = await db.query<ProjectKnowledgeSearchChunkRow>(
    `SELECT
      pkc.id,
      pkc.source_id,
      pkc.project_id,
      pkc.scope_type,
      pkc.source_resource_id,
      pkc.linked_contest_resource_id,
      pkc.chunk_index,
      pkc.chunk_kind,
      pkc.title,
      pkc.content,
      pkc.citation_label,
      pkc.page_number,
      pkc.section_label,
      pkc.source_hash,
      pkc.index_version,
      pkc.metadata,
      pkc.updated_at::TEXT,
      pks.status AS source_status,
      pr.title AS resource_title,
      pr.resource_kind,
      pr.source AS resource_source,
      ${embeddingSql}
     FROM project_knowledge_chunks pkc
     JOIN project_knowledge_sources pks
       ON pks.id = pkc.source_id
      AND pks.project_id = pkc.project_id
     JOIN project_resources pr
       ON pr.id = pkc.source_resource_id
      AND pr.project_id = pkc.project_id
      AND pr.status = 'active'
     WHERE pkc.project_id = $1
       AND pks.status = ANY($2::TEXT[])
     ORDER BY pkc.updated_at DESC, pkc.chunk_index ASC`,
    [input.projectId, statusList],
  )

  return result.rows.map((row) => {
    const embedding = mode === 'vector'
      ? normalizeEmbeddingText(row.embedding_text)
      : normalizeNumberArray(row.embedding_json)
    return {
      id: row.id,
      sourceId: row.source_id,
      projectId: row.project_id,
      scopeType: row.scope_type,
      sourceResourceId: row.source_resource_id,
      linkedContestResourceId: row.linked_contest_resource_id,
      resourceTitle: normalizeString(row.resource_title) || '未命名资源',
      resourceKind: row.resource_kind,
      resourceSource: row.resource_source,
      sourceStatus: row.source_status,
      chunkIndex: Math.max(0, Math.round(normalizeNumber(row.chunk_index, 0))),
      chunkKind: row.chunk_kind,
      title: normalizeString(row.title),
      content: normalizeString(row.content),
      citationLabel: normalizeString(row.citation_label),
      pageNumber: row.page_number == null ? null : Math.max(1, Math.round(normalizeNumber(row.page_number, 1))),
      sectionLabel: normalizeString(row.section_label),
      sourceHash: normalizeString(row.source_hash),
      indexVersion: normalizeString(row.index_version),
      metadata: normalizeRecord(row.metadata),
      embedding,
      updatedAt: row.updated_at,
    }
  })
}
