import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectKnowledgeAnalyticsFreshness,
  ProjectKnowledgeAnalyticsJob,
  ProjectKnowledgeAnalyticsJobStatus,
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeExplorerPayload,
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeIndexTaskSnapshot,
  ProjectKnowledgeModality,
  ProjectKnowledgeNodeDetail,
  ProjectKnowledgeProvenanceSourceType,
  ProjectKnowledgeRelation,
  ProjectKnowledgeRelationNodeType,
  ProjectKnowledgeRelationsPayload,
  ProjectKnowledgeRelationType,
  ProjectKnowledgeSemanticCluster,
  ProjectKnowledgeSemanticLayout,
  ProjectKnowledgeSemanticLayoutAlgorithm,
  ProjectKnowledgeSemanticLayoutLevel,
  ProjectKnowledgeSemanticLayoutPayload,
  ProjectKnowledgeSemanticLayoutType,
  ProjectKnowledgeSemanticPoint,
  ProjectKnowledgeSnapshotType,
  ProjectKnowledgeTaskStage,
  ProjectKnowledgeTaskStatus,
  ProjectKnowledgeTaskType,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { PCA } from 'ml-pca'
import { UMAP } from 'umap-js'
import {
  buildProjectKnowledgeIndexDashboard,
  listProjectKnowledgeSearchChunks,
} from '~~/server/utils/project-knowledge-store'

interface ProjectKnowledgeAnalyticsJobRow {
  id: string
  project_id: string
  job_type: string
  status: string
  snapshot_type: string | null
  target_source_id: string | null
  payload_json: unknown
  result_json: unknown
  error_message: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

interface ProjectKnowledgeRelationRow {
  id: string
  project_id: string
  snapshot_id: string | null
  source_node_type: string
  source_node_id: string
  target_node_type: string
  target_node_id: string
  relation_type: string
  score: number | string
  evidence_metric: string
  evidence_model: string
  metadata: unknown
  created_at: string
  updated_at: string
}

interface ProjectKnowledgeLayoutRow {
  id: string
  project_id: string
  layout_type: string
  algorithm: string
  point_count: number | string
  cluster_count: number | string
  status: string
  metadata: unknown
  created_at: string
  updated_at: string
}

interface ProjectKnowledgePointRow {
  id: string
  layout_id: string
  node_type: string
  node_id: string
  level: string
  cluster_id: string
  modality: string
  embedding_status: string
  importance: number | string
  label: string
  x: number | string
  y: number | string
  z: number | string
  metadata: unknown
}

interface ProjectKnowledgeNodeTaskRow {
  id: string
  project_id: string
  scope_type: string
  source_resource_id: string | null
  linked_contest_resource_id: string | null
  task_type: string
  status: string
  stage: string
  attempt: number | string
  max_attempt: number | string
  progress_percent: number | string
  eta_seconds: number | string
  payload_json: unknown
  result_json: unknown
  error_message: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

interface FilterBag {
  nodeType?: ProjectKnowledgeRelationNodeType | ''
  modality?: Array<ProjectKnowledgeModality | 'unknown'>
  embeddingStatus?: ProjectKnowledgeEmbeddingStatus[]
  provenance?: ProjectKnowledgeProvenanceSourceType[]
  modelVersion?: string[]
  timeRangeDays?: number | null
}

type ChunkLike = Awaited<ReturnType<typeof listProjectKnowledgeSearchChunks>>[number]

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

function normalizeModality(value: unknown): ProjectKnowledgeModality | 'unknown' {
  const normalized = normalizeString(value)
  if (normalized === 'text' || normalized === 'image' || normalized === 'audio' || normalized === 'video' || normalized === 'draw')
    return normalized
  return 'unknown'
}

function normalizeEmbeddingStatus(value: unknown): ProjectKnowledgeEmbeddingStatus {
  const normalized = normalizeString(value)
  if (normalized === 'native' || normalized === 'derived' || normalized === 'fallback' || normalized === 'missing' || normalized === 'failed')
    return normalized
  return 'missing'
}

function normalizeProvenance(value: unknown): ProjectKnowledgeProvenanceSourceType | '' {
  const normalized = normalizeString(value)
  if (normalized === 'native' || normalized === 'ocr' || normalized === 'asr' || normalized === 'vision_summary' || normalized === 'fallback_template')
    return normalized
  return ''
}

function normalizeJobStatus(value: unknown): ProjectKnowledgeAnalyticsJobStatus | null {
  const normalized = normalizeString(value)
  if (normalized === 'pending' || normalized === 'processing' || normalized === 'succeeded' || normalized === 'failed' || normalized === 'cancelled')
    return normalized
  return null
}

function inferChunkEmbeddingStatus(metadata: Record<string, unknown>): ProjectKnowledgeEmbeddingStatus {
  const explicitStatus = normalizeEmbeddingStatus(metadata.embeddingStatus)
  if (explicitStatus !== 'missing')
    return explicitStatus
  if (metadata.embeddingFallbackUsed === true)
    return 'fallback'
  if (metadata.embeddingFallbackUsed === false) {
    const provenance = normalizeProvenance(metadata.provenanceSourceType)
    if (provenance === 'ocr' || provenance === 'asr' || provenance === 'vision_summary')
      return 'derived'
    return 'native'
  }
  return 'missing'
}

function cosineSimilarity(left: number[], right: number[]): number {
  const size = Math.min(left.length, right.length)
  if (size <= 0)
    return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] || 0
    const rightValue = right[index] || 0
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }
  if (leftNorm <= 0 || rightNorm <= 0)
    return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function averageVector(vectors: number[][]): number[] {
  if (vectors.length === 0)
    return []
  const size = Math.max(...vectors.map(item => item.length))
  const result = Array.from({ length: size }, () => 0)
  for (const vector of vectors) {
    for (let index = 0; index < size; index += 1)
      result[index] = (result[index] || 0) + (vector[index] || 0)
  }
  return result.map(value => value / vectors.length)
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatSemanticResourceKindLabel(resourceKind: unknown): string {
  const normalized = normalizeString(resourceKind)
  if (normalized === 'document')
    return '文档'
  if (normalized === 'markdown')
    return '文档'
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
  if (normalized === 'binary')
    return '资料'
  return ''
}

const SEMANTIC_TOPIC_STOPWORDS = new Set([
  'cluster',
  'chunk',
  'page',
  'section',
  'resource',
  'source',
  'docx',
  'pptx',
  'xlsx',
  'pdf',
  'md',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'mp3',
  'mp4',
  'mov',
  'avi',
  'section',
  '文档',
  '资料',
  '说明',
  '说明书',
  '项目',
  '方案',
  '版本',
  '最终版',
  '更新版',
  '副本',
])

function extractSemanticTopicTokens(text: string): string[] {
  const source = normalizeString(text)
  if (!source)
    return []

  const tokens: string[] = []
  const matches = source.match(/[A-Z][\w-]{2,}|[\u4E00-\u9FFF]{2,10}/gi) || []
  for (const token of matches) {
    const normalized = token.trim()
    const lowered = normalized.toLowerCase()
    if (!normalized || SEMANTIC_TOPIC_STOPWORDS.has(lowered))
      continue
    if (/^\d+$/.test(lowered))
      continue
    tokens.push(normalized)
  }
  return tokens
}

function deriveSemanticTopicLabel(clusterLabel: string, clusterChunks: ChunkLike[]): string {
  const tokenCount = new Map<string, number>()
  const resourceKindLabel = formatSemanticResourceKindLabel(clusterChunks[0]?.resourceKind)

  for (const text of [
    clusterLabel,
    ...clusterChunks.slice(0, 18).map(chunk => chunk.title || chunk.citationLabel || chunk.resourceTitle),
  ]) {
    for (const token of extractSemanticTopicTokens(text))
      tokenCount.set(token, (tokenCount.get(token) || 0) + 1)
  }

  const bestToken = [...tokenCount.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1])
        return right[1] - left[1]
      return right[0].length - left[0].length
    })[0]?.[0] || ''

  if (bestToken) {
    if (/文档|纪要|方案|说明|报告|清单|计划|设计|表格|视频|音频|图片/.test(bestToken))
      return bestToken
    if (resourceKindLabel)
      return `${bestToken}${resourceKindLabel}`
    return bestToken
  }

  if (resourceKindLabel)
    return resourceKindLabel

  return clusterLabel.slice(0, 10) || '未分类主题'
}

function meanDistance2d(
  points: Array<{ x: number, y: number }>,
  centroid: { x: number, y: number },
): number {
  if (points.length === 0)
    return 0
  const totalDistance = points.reduce((sum, point) => {
    return sum + Math.hypot(point.x - centroid.x, point.y - centroid.y)
  }, 0)
  return totalDistance / points.length
}

function hashNoise(value: string, axis: number): number {
  const seed = `${value}:${axis}`
  let hash = 0
  for (let index = 0; index < seed.length; index += 1)
    hash = ((hash << 5) - hash) + seed.charCodeAt(index)
  const normalized = Math.abs(hash % 1000) / 1000
  return (normalized - 0.5) * 2
}

function reduceVectorsTo3d(vectors: number[][]): {
  algorithm: ProjectKnowledgeSemanticLayoutAlgorithm
  coordinates: Array<[number, number, number]>
} {
  if (vectors.length === 0) {
    return {
      algorithm: 'pca3d',
      coordinates: [],
    }
  }

  if (vectors.length <= 3) {
    const padded = vectors.map((vector, index) => [
      vector[0] || (index * 0.25),
      vector[1] || 0,
      vector[2] || 0,
    ] as [number, number, number])
    return {
      algorithm: 'pca3d',
      coordinates: padded,
    }
  }

  try {
    const umap = new UMAP({
      nComponents: 3,
      nNeighbors: Math.max(2, Math.min(12, vectors.length - 1)),
      minDist: 0.18,
    })
    const fitted = umap.fit(vectors)
    return {
      algorithm: 'umap3d',
      coordinates: fitted.map(point => [
        normalizeNumber(point[0], 0),
        normalizeNumber(point[1], 0),
        normalizeNumber(point[2], 0),
      ] as [number, number, number]),
    }
  }
  catch {
    const pca = new PCA(vectors)
    const predicted = pca.predict(vectors, { nComponents: Math.min(3, vectors[0]?.length || 3) })
    const rows = typeof (predicted as any)?.to2DArray === 'function'
      ? (predicted as any).to2DArray() as number[][]
      : []
    return {
      algorithm: 'pca3d',
      coordinates: rows.map(point => [
        normalizeNumber(point[0], 0),
        normalizeNumber(point[1], 0),
        normalizeNumber(point[2], 0),
      ] as [number, number, number]),
    }
  }
}

function buildEmptyAnalyticsFreshness(): ProjectKnowledgeAnalyticsFreshness {
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

async function loadAnalyticsFreshness(db: Queryable, projectId: string): Promise<ProjectKnowledgeAnalyticsFreshness> {
  const freshness = buildEmptyAnalyticsFreshness()
  const [snapshotResult, relationResult, layoutResult, jobResult] = await Promise.all([
    db.query<{ snapshot_type: string, captured_at: string }>(
      `SELECT snapshot_type, captured_at::TEXT
       FROM project_knowledge_index_snapshots
       WHERE project_id = $1
       ORDER BY captured_at DESC, created_at DESC
       LIMIT 1`,
      [projectId],
    ),
    db.query<{ updated_at: string }>(
      `SELECT MAX(updated_at)::TEXT AS updated_at
       FROM project_knowledge_relations
       WHERE project_id = $1`,
      [projectId],
    ),
    db.query<{ updated_at: string }>(
      `SELECT MAX(updated_at)::TEXT AS updated_at
       FROM project_knowledge_semantic_layouts
       WHERE project_id = $1`,
      [projectId],
    ),
    db.query<{ job_type: string, status: string }>(
      `SELECT DISTINCT ON (job_type) job_type, status
       FROM project_knowledge_analytics_jobs
       WHERE project_id = $1
       ORDER BY job_type, updated_at DESC, created_at DESC`,
      [projectId],
    ),
  ])

  freshness.snapshotUpdatedAt = normalizeString(snapshotResult.rows[0]?.captured_at) || null
  freshness.latestSnapshotType = (normalizeString(snapshotResult.rows[0]?.snapshot_type) || null) as ProjectKnowledgeSnapshotType | null
  freshness.relationsUpdatedAt = normalizeString(relationResult.rows[0]?.updated_at) || null
  freshness.semanticLayoutUpdatedAt = normalizeString(layoutResult.rows[0]?.updated_at) || null

  for (const row of jobResult.rows) {
    const status = normalizeJobStatus(row.status)
    if (row.job_type === 'relations_refresh')
      freshness.relationsJobStatus = status
    else if (row.job_type === 'snapshot_capture')
      freshness.snapshotJobStatus = status
    else if (row.job_type === 'semantic_layout_refresh')
      freshness.semanticLayoutJobStatus = status
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

function buildAnalyticsJob(row: ProjectKnowledgeAnalyticsJobRow): ProjectKnowledgeAnalyticsJob {
  return {
    id: row.id,
    projectId: row.project_id,
    jobType: normalizeString(row.job_type) as ProjectKnowledgeAnalyticsJob['jobType'],
    status: normalizeString(row.status) as ProjectKnowledgeAnalyticsJobStatus,
    snapshotType: (normalizeString(row.snapshot_type) || null) as ProjectKnowledgeSnapshotType | null,
    targetSourceId: normalizeString(row.target_source_id) || null,
    payloadJson: normalizeRecord(row.payload_json),
    resultJson: normalizeRecord(row.result_json),
    errorMessage: normalizeString(row.error_message),
    startedAt: normalizeString(row.started_at) || null,
    finishedAt: normalizeString(row.finished_at) || null,
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  }
}

function buildRelation(row: ProjectKnowledgeRelationRow): ProjectKnowledgeRelation {
  return {
    id: row.id,
    projectId: row.project_id,
    snapshotId: normalizeString(row.snapshot_id) || null,
    sourceNodeType: normalizeString(row.source_node_type) as ProjectKnowledgeRelationNodeType,
    sourceNodeId: normalizeString(row.source_node_id),
    targetNodeType: normalizeString(row.target_node_type) as ProjectKnowledgeRelationNodeType,
    targetNodeId: normalizeString(row.target_node_id),
    relationType: normalizeString(row.relation_type) as ProjectKnowledgeRelationType,
    score: normalizeNumber(row.score, 0),
    evidenceMetric: normalizeString(row.evidence_metric),
    evidenceModel: normalizeString(row.evidence_model),
    metadata: normalizeRecord(row.metadata),
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  }
}

function buildLayout(row: ProjectKnowledgeLayoutRow): ProjectKnowledgeSemanticLayout {
  return {
    id: row.id,
    projectId: row.project_id,
    layoutType: normalizeString(row.layout_type) as ProjectKnowledgeSemanticLayoutType,
    algorithm: normalizeString(row.algorithm) as ProjectKnowledgeSemanticLayoutAlgorithm,
    pointCount: Math.max(0, Math.round(normalizeNumber(row.point_count, 0))),
    clusterCount: Math.max(0, Math.round(normalizeNumber(row.cluster_count, 0))),
    status: normalizeString(row.status) as ProjectKnowledgeSemanticLayout['status'],
    metadata: normalizeRecord(row.metadata),
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  }
}

function buildPoint(row: ProjectKnowledgePointRow): ProjectKnowledgeSemanticPoint {
  return {
    id: row.id,
    layoutId: row.layout_id,
    nodeType: normalizeString(row.node_type) as ProjectKnowledgeSemanticPoint['nodeType'],
    nodeId: normalizeString(row.node_id),
    level: normalizeString(row.level) as ProjectKnowledgeSemanticLayoutLevel,
    x: normalizeNumber(row.x, 0),
    y: normalizeNumber(row.y, 0),
    z: normalizeNumber(row.z, 0),
    clusterId: normalizeString(row.cluster_id),
    modality: normalizeModality(row.modality),
    embeddingStatus: normalizeEmbeddingStatus(row.embedding_status),
    importance: normalizeNumber(row.importance, 0),
    label: normalizeString(row.label),
    metadata: normalizeRecord(row.metadata),
  }
}

function buildTaskSnapshot(row: ProjectKnowledgeNodeTaskRow): ProjectKnowledgeIndexTaskSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    scopeType: normalizeString(row.scope_type) as ProjectKnowledgeIndexTaskSnapshot['scopeType'],
    sourceResourceId: normalizeString(row.source_resource_id) || null,
    linkedContestResourceId: normalizeString(row.linked_contest_resource_id) || null,
    taskType: normalizeString(row.task_type) as ProjectKnowledgeTaskType,
    status: normalizeString(row.status) as ProjectKnowledgeTaskStatus,
    stage: normalizeString(row.stage) as ProjectKnowledgeTaskStage,
    attempt: Math.max(0, Math.round(normalizeNumber(row.attempt, 0))),
    maxAttempt: Math.max(1, Math.round(normalizeNumber(row.max_attempt, 1))),
    progressPercent: Math.max(0, Math.min(100, Math.round(normalizeNumber(row.progress_percent, 0)))),
    etaSeconds: Math.max(0, Math.round(normalizeNumber(row.eta_seconds, 0))),
    payloadJson: normalizeRecord(row.payload_json),
    resultJson: normalizeRecord(row.result_json),
    errorMessage: normalizeString(row.error_message),
    startedAt: normalizeString(row.started_at) || null,
    finishedAt: normalizeString(row.finished_at) || null,
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  }
}

function chunkMetadata(chunk: ChunkLike): Record<string, unknown> {
  return normalizeRecord(chunk.metadata)
}

function chunkModality(chunk: ChunkLike): ProjectKnowledgeModality | 'unknown' {
  return normalizeModality(chunkMetadata(chunk).modality)
}

function chunkProvenance(chunk: ChunkLike): ProjectKnowledgeProvenanceSourceType | '' {
  return normalizeProvenance(chunkMetadata(chunk).provenanceSourceType)
}

function chunkEmbeddingStatus(chunk: ChunkLike): ProjectKnowledgeEmbeddingStatus {
  return inferChunkEmbeddingStatus(chunkMetadata(chunk))
}

function chunkModel(chunk: ChunkLike): string {
  return normalizeString(chunkMetadata(chunk).embeddingModel)
}

function buildChunkFilterNode(chunk: ChunkLike): ProjectKnowledgeRelationsPayload['nodes'][number] {
  return {
    id: chunk.id,
    nodeType: 'chunk',
    label: chunk.title || chunk.citationLabel || chunk.resourceTitle,
    modality: chunkModality(chunk),
    embeddingStatus: chunkEmbeddingStatus(chunk),
    provenanceSourceType: chunkProvenance(chunk),
    resourceKind: normalizeString(chunk.resourceKind),
    sourceId: chunk.sourceId,
    importance: Math.max(1, Math.log2(Math.max(chunk.content.length, 24))),
    metadata: {
      embeddingModel: chunkModel(chunk),
    },
  }
}

function projectPointToAnchor(input: {
  id: string
  base: [number, number, number]
  anchor?: [number, number, number] | null
  scale?: number
}): [number, number, number] {
  const scale = normalizeNumber(input.scale, 1)
  const anchor = input.anchor || [0, 0, 0]
  return [
    anchor[0] + (input.base[0] * scale) + (hashNoise(input.id, 0) * 0.18),
    anchor[1] + (input.base[1] * scale) + (hashNoise(input.id, 1) * 0.18),
    anchor[2] + (input.base[2] * scale) + (hashNoise(input.id, 2) * 0.18),
  ]
}

async function getLatestSnapshotId(db: Queryable, projectId: string): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM project_knowledge_index_snapshots
     WHERE project_id = $1
     ORDER BY captured_at DESC, created_at DESC
     LIMIT 1`,
    [projectId],
  )
  return normalizeString(result.rows[0]?.id) || null
}

async function upsertAnalyticsJob(
  db: Queryable,
  input: {
    projectId: string
    jobType: ProjectKnowledgeAnalyticsJob['jobType']
    snapshotType?: ProjectKnowledgeSnapshotType | null
    targetSourceId?: string | null
    payloadJson?: Record<string, unknown>
  },
): Promise<void> {
  const existing = await db.query<{ id: string }>(
    `SELECT id
     FROM project_knowledge_analytics_jobs
     WHERE project_id = $1
       AND job_type = $2
       AND COALESCE(target_source_id, '') = COALESCE($3::TEXT, '')
       AND COALESCE(snapshot_type, '') = COALESCE($4::TEXT, '')
       AND status IN ('pending', 'processing')
     LIMIT 1`,
    [
      input.projectId,
      input.jobType,
      normalizeString(input.targetSourceId) || null,
      normalizeString(input.snapshotType) || null,
    ],
  )
  if (existing.rows[0]?.id)
    return

  await db.query(
    `INSERT INTO project_knowledge_analytics_jobs (
      id,
      project_id,
      job_type,
      status,
      snapshot_type,
      target_source_id,
      payload_json,
      result_json,
      error_message,
      started_at,
      finished_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, 'pending', $4, $5, $6::JSONB, '{}'::JSONB, '', NULL, NULL, NOW(), NOW()
    )`,
    [
      randomUUID(),
      input.projectId,
      input.jobType,
      normalizeString(input.snapshotType) || null,
      normalizeString(input.targetSourceId) || null,
      JSON.stringify(normalizeRecord(input.payloadJson)),
    ],
  )
}

export async function scheduleProjectKnowledgeAnalyticsRefresh(
  db: Queryable,
  input: {
    projectId: string
    snapshotType?: ProjectKnowledgeSnapshotType | null
    targetSourceId?: string | null
  },
): Promise<void> {
  const snapshotType = (normalizeString(input.snapshotType) || 'manual') as ProjectKnowledgeSnapshotType
  const payloadJson = {
    trigger: 'knowledge_index_refresh',
    targetSourceId: normalizeString(input.targetSourceId) || undefined,
  }

  await upsertAnalyticsJob(db, {
    projectId: input.projectId,
    jobType: 'relations_refresh',
    targetSourceId: input.targetSourceId,
    payloadJson,
  })
  await upsertAnalyticsJob(db, {
    projectId: input.projectId,
    jobType: 'snapshot_capture',
    snapshotType,
    targetSourceId: input.targetSourceId,
    payloadJson,
  })
  await upsertAnalyticsJob(db, {
    projectId: input.projectId,
    jobType: 'semantic_layout_refresh',
    targetSourceId: input.targetSourceId,
    payloadJson,
  })
}

export async function claimNextProjectKnowledgeAnalyticsJob(
  db: Queryable,
): Promise<ProjectKnowledgeAnalyticsJob | null> {
  const result = await db.query<ProjectKnowledgeAnalyticsJobRow>(
    `WITH picked AS (
      SELECT id
      FROM project_knowledge_analytics_jobs
      WHERE status = 'pending'
      ORDER BY updated_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE project_knowledge_analytics_jobs j
    SET status = 'processing',
        error_message = '',
        started_at = NOW(),
        finished_at = NULL,
        updated_at = NOW()
    FROM picked
    WHERE j.id = picked.id
    RETURNING
      j.id,
      j.project_id,
      j.job_type,
      j.status,
      j.snapshot_type,
      j.target_source_id,
      j.payload_json,
      j.result_json,
      j.error_message,
      j.started_at::TEXT,
      j.finished_at::TEXT,
      j.created_at::TEXT,
      j.updated_at::TEXT`,
  )
  const row = result.rows[0]
  return row ? buildAnalyticsJob(row) : null
}

export async function completeProjectKnowledgeAnalyticsJobSuccess(
  db: Queryable,
  input: {
    jobId: string
    resultJson?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE project_knowledge_analytics_jobs
     SET status = 'succeeded',
         result_json = $2::JSONB,
         error_message = '',
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.jobId, JSON.stringify(normalizeRecord(input.resultJson))],
  )
}

export async function completeProjectKnowledgeAnalyticsJobFailure(
  db: Queryable,
  input: {
    jobId: string
    errorMessage: string
    resultJson?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE project_knowledge_analytics_jobs
     SET status = 'failed',
         result_json = $2::JSONB,
         error_message = $3,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.jobId,
      JSON.stringify(normalizeRecord(input.resultJson)),
      normalizeString(input.errorMessage) || 'unknown error',
    ],
  )
}

export async function getProjectKnowledgeAnalyticsFreshness(
  db: Queryable,
  input: { projectId: string },
): Promise<ProjectKnowledgeAnalyticsFreshness> {
  return loadAnalyticsFreshness(db, input.projectId)
}

export async function materializeProjectKnowledgeRelations(
  db: Queryable,
  input: { projectId: string },
): Promise<{ relationCount: number }> {
  const [dashboard, chunks, snapshotId] = await Promise.all([
    buildProjectKnowledgeIndexDashboard(db, {
      projectId: input.projectId,
      syncSources: false,
    }),
    listProjectKnowledgeSearchChunks(db, {
      projectId: input.projectId,
      includeStale: true,
    }),
    getLatestSnapshotId(db, input.projectId),
  ])

  const relations: Array<Omit<ProjectKnowledgeRelation, 'createdAt' | 'updatedAt'>> = []
  const sourceById = new Map(dashboard.sources.map(source => [source.id, source]))

  for (const chunk of chunks) {
    relations.push({
      id: randomUUID(),
      projectId: input.projectId,
      snapshotId,
      sourceNodeType: 'chunk',
      sourceNodeId: chunk.id,
      targetNodeType: 'source',
      targetNodeId: chunk.sourceId,
      relationType: 'belongs_to',
      score: 1,
      evidenceMetric: 'ownership',
      evidenceModel: 'project_knowledge_source',
      metadata: {
        sourceResourceId: chunk.sourceResourceId,
        chunkKind: chunk.chunkKind,
      },
    })

    const provenance = chunkProvenance(chunk)
    if (provenance && provenance !== 'native') {
      relations.push({
        id: randomUUID(),
        projectId: input.projectId,
        snapshotId,
        sourceNodeType: 'chunk',
        sourceNodeId: chunk.id,
        targetNodeType: 'source',
        targetNodeId: chunk.sourceId,
        relationType: 'derived_from',
        score: normalizeNumber(chunkMetadata(chunk).confidence, 0.72),
        evidenceMetric: 'projection',
        evidenceModel: provenance,
        metadata: {
          provenanceSourceType: provenance,
          projectionType: normalizeString(chunkMetadata(chunk).projectionType),
        },
      })
    }
  }

  const comparableChunks = chunks.filter(chunk => chunk.embedding.length > 0 && chunkEmbeddingStatus(chunk) !== 'missing' && chunkEmbeddingStatus(chunk) !== 'failed')
  for (const chunk of comparableChunks) {
    const sameModality: Array<{ target: ChunkLike, score: number }> = []
    const crossModality: Array<{ target: ChunkLike, score: number }> = []
    for (const candidate of comparableChunks) {
      if (candidate.id === chunk.id)
        continue
      const score = cosineSimilarity(chunk.embedding, candidate.embedding)
      if (!Number.isFinite(score))
        continue
      if (chunkModality(candidate) === chunkModality(chunk))
        sameModality.push({ target: candidate, score })
      else
        crossModality.push({ target: candidate, score })
    }
    sameModality
      .sort((left, right) => right.score - left.score)
      .slice(0, 2)
      .forEach(({ target, score }) => {
        relations.push({
          id: randomUUID(),
          projectId: input.projectId,
          snapshotId,
          sourceNodeType: 'chunk',
          sourceNodeId: chunk.id,
          targetNodeType: 'chunk',
          targetNodeId: target.id,
          relationType: 'similar_to',
          score,
          evidenceMetric: 'cosine',
          evidenceModel: chunkModel(chunk) || 'embedding',
          metadata: {
            modality: chunkModality(chunk),
            targetModality: chunkModality(target),
          },
        })
      })
    crossModality
      .sort((left, right) => right.score - left.score)
      .slice(0, 2)
      .forEach(({ target, score }) => {
        relations.push({
          id: randomUUID(),
          projectId: input.projectId,
          snapshotId,
          sourceNodeType: 'chunk',
          sourceNodeId: chunk.id,
          targetNodeType: 'chunk',
          targetNodeId: target.id,
          relationType: 'aligned_to',
          score,
          evidenceMetric: 'cosine',
          evidenceModel: chunkModel(chunk) || 'embedding',
          metadata: {
            modality: chunkModality(chunk),
            targetModality: chunkModality(target),
          },
        })
      })
  }

  const sourceVectors = dashboard.sources.map((source) => {
    const sourceChunks = comparableChunks.filter(chunk => chunk.sourceId === source.id)
    return {
      source,
      vector: averageVector(sourceChunks.map(chunk => chunk.embedding)),
    }
  }).filter(item => item.vector.length > 0)

  for (let leftIndex = 0; leftIndex < sourceVectors.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sourceVectors.length; rightIndex += 1) {
      const left = sourceVectors[leftIndex]
      const right = sourceVectors[rightIndex]
      if (!left || !right)
        continue
      const score = cosineSimilarity(left.vector, right.vector)
      if (score < 0.97)
        continue
      relations.push({
        id: randomUUID(),
        projectId: input.projectId,
        snapshotId,
        sourceNodeType: 'source',
        sourceNodeId: left.source.id,
        targetNodeType: 'source',
        targetNodeId: right.source.id,
        relationType: 'duplicated_with',
        score,
        evidenceMetric: 'cosine',
        evidenceModel: 'source_centroid',
        metadata: {
          leftTitle: left.source.resourceTitle,
          rightTitle: right.source.resourceTitle,
        },
      })
    }
  }

  const sourceGroups = new Map<string, string[]>()
  for (const source of dashboard.sources) {
    const key = normalizeString(source.linkedContestResourceId)
    if (!key)
      continue
    const bucket = sourceGroups.get(key) || []
    bucket.push(source.id)
    sourceGroups.set(key, bucket)
  }
  for (const sourceIds of sourceGroups.values()) {
    if (sourceIds.length <= 1)
      continue
    for (let index = 0; index < sourceIds.length; index += 1) {
      const current = sourceIds[index]
      const next = sourceIds[(index + 1) % sourceIds.length]
      if (!current || !next || current === next)
        continue
      relations.push({
        id: randomUUID(),
        projectId: input.projectId,
        snapshotId,
        sourceNodeType: 'source',
        sourceNodeId: current,
        targetNodeType: 'source',
        targetNodeId: next,
        relationType: 'references',
        score: 1,
        evidenceMetric: 'linked_contest_resource',
        evidenceModel: 'project_resource_binding',
        metadata: {
          sharedBinding: sourceById.get(current)?.linkedContestResourceId || '',
        },
      })
    }
  }

  await db.query(
    `DELETE FROM project_knowledge_relations
     WHERE project_id = $1`,
    [input.projectId],
  )

  for (const relation of relations) {
    await db.query(
      `INSERT INTO project_knowledge_relations (
        id,
        project_id,
        snapshot_id,
        source_node_type,
        source_node_id,
        target_node_type,
        target_node_id,
        relation_type,
        score,
        evidence_metric,
        evidence_model,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB, NOW(), NOW()
      )`,
      [
        relation.id,
        relation.projectId,
        relation.snapshotId,
        relation.sourceNodeType,
        relation.sourceNodeId,
        relation.targetNodeType,
        relation.targetNodeId,
        relation.relationType,
        relation.score,
        relation.evidenceMetric,
        relation.evidenceModel,
        JSON.stringify(relation.metadata),
      ],
    )
  }

  return {
    relationCount: relations.length,
  }
}

export async function materializeProjectKnowledgeSnapshot(
  db: Queryable,
  input: {
    projectId: string
    snapshotType: ProjectKnowledgeSnapshotType
  },
): Promise<{ snapshotId: string, dashboard: ProjectKnowledgeIndexDashboard }> {
  const dashboard = await buildProjectKnowledgeIndexDashboard(db, {
    projectId: input.projectId,
    syncSources: false,
  })
  const snapshotId = randomUUID()
  await db.query(
    `INSERT INTO project_knowledge_index_snapshots (
      id,
      project_id,
      snapshot_type,
      summary_json,
      diagnostics_json,
      visuals_json,
      captured_at,
      created_at
    ) VALUES (
      $1, $2, $3, $4::JSONB, $5::JSONB, $6::JSONB, NOW(), NOW()
    )`,
    [
      snapshotId,
      input.projectId,
      input.snapshotType,
      JSON.stringify(dashboard.summary),
      JSON.stringify(dashboard.diagnostics),
      JSON.stringify(dashboard.visuals),
    ],
  )
  return { snapshotId, dashboard }
}

function buildChunkNeighborhoodConsistency(chunks: ChunkLike[], targetChunk: ChunkLike): number {
  if (targetChunk.embedding.length === 0)
    return chunkEmbeddingStatus(targetChunk) === 'fallback' ? 0.24 : 0
  const ranked = chunks
    .filter(chunk => chunk.id !== targetChunk.id && chunk.embedding.length > 0)
    .map(chunk => ({
      chunk,
      score: cosineSimilarity(targetChunk.embedding, chunk.embedding),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
  if (ranked.length === 0)
    return 0
  const average = ranked.reduce((sum, item) => sum + Math.max(0, item.score), 0) / ranked.length
  const statusWeight = chunkEmbeddingStatus(targetChunk) === 'fallback'
    ? 0.4
    : chunkEmbeddingStatus(targetChunk) === 'derived'
      ? 0.86
      : 1
  return Number(Math.max(0, Math.min(1, average * statusWeight)).toFixed(4))
}

async function refreshChunkQualityMetadata(
  db: Queryable,
  chunks: ChunkLike[],
): Promise<void> {
  for (const chunk of chunks) {
    const metadata = chunkMetadata(chunk)
    const sourceConfidence = Math.max(0, Math.min(1, normalizeNumber(metadata.sourceConfidence ?? metadata.confidence, 0)))
    const stageSuccessRatio = Math.max(0, Math.min(1, normalizeNumber(metadata.stageSuccessRatio, 1)))
    const modalitySupportWeight = Math.max(0, Math.min(1, normalizeNumber(metadata.modalitySupportWeight, 0)))
    const neighborhoodConsistency = buildChunkNeighborhoodConsistency(chunks, chunk)
    const embeddingQualityScore = Number(Math.max(0, Math.min(1, sourceConfidence * stageSuccessRatio * modalitySupportWeight * neighborhoodConsistency)).toFixed(4))

    await db.query(
      `UPDATE project_knowledge_chunks
       SET metadata = COALESCE(metadata, '{}'::JSONB) || $2::JSONB,
           updated_at = NOW()
       WHERE id = $1`,
      [
        chunk.id,
        JSON.stringify({
          neighborhoodConsistency,
          embeddingQualityScore,
        }),
      ],
    )
  }
}

export async function materializeProjectKnowledgeSemanticLayouts(
  db: Queryable,
  input: { projectId: string },
): Promise<{ layoutCount: number }> {
  const [dashboard, chunks, snapshotId] = await Promise.all([
    buildProjectKnowledgeIndexDashboard(db, {
      projectId: input.projectId,
      syncSources: false,
    }),
    listProjectKnowledgeSearchChunks(db, {
      projectId: input.projectId,
      includeStale: true,
    }),
    getLatestSnapshotId(db, input.projectId),
  ])

  const fitChunks = chunks.filter((chunk) => {
    const status = chunkEmbeddingStatus(chunk)
    return chunk.embedding.length > 0 && status !== 'fallback' && status !== 'missing' && status !== 'failed'
  })
  const reduced = reduceVectorsTo3d(fitChunks.map(chunk => chunk.embedding))
  const fitCoordinateMap = new Map<string, [number, number, number]>()
  fitChunks.forEach((chunk, index) => {
    fitCoordinateMap.set(chunk.id, reduced.coordinates[index] || [0, 0, 0])
  })

  const sourceChunksMap = new Map<string, ChunkLike[]>()
  for (const chunk of chunks) {
    const bucket = sourceChunksMap.get(chunk.sourceId) || []
    bucket.push(chunk)
    sourceChunksMap.set(chunk.sourceId, bucket)
  }

  const sourceCentroidMap = new Map<string, [number, number, number]>()
  for (const source of dashboard.sources) {
    const sourceChunks = sourceChunksMap.get(source.id) || []
    const fittedSourceChunks = sourceChunks.filter(chunk => fitCoordinateMap.has(chunk.id))
    if (fittedSourceChunks.length > 0) {
      const centroid = averageVector(fittedSourceChunks.map(chunk => fitCoordinateMap.get(chunk.id) || [0, 0, 0]))
      sourceCentroidMap.set(source.id, [
        normalizeNumber(centroid[0], 0),
        normalizeNumber(centroid[1], 0),
        normalizeNumber(centroid[2], 0),
      ])
      continue
    }
    sourceCentroidMap.set(source.id, [
      hashNoise(source.id, 0) * 2.2,
      hashNoise(source.id, 1) * 1.6,
      hashNoise(source.id, 2) * 1.2,
    ])
  }

  const modalityAnchors: Record<string, [number, number, number]> = {
    text: [-4.8, 0, 0],
    image: [0, 0, 0],
    audio: [4.8, 0.6, -0.6],
    video: [7.2, -0.8, 0.6],
    draw: [-7.2, 1.2, 0.8],
    unknown: [0, 0, 0],
  }

  const buildLayoutPayload = (layoutType: ProjectKnowledgeSemanticLayoutType) => {
    const points: Array<Omit<ProjectKnowledgeSemanticPoint, 'id' | 'layoutId'>> = []

    for (const source of dashboard.sources) {
      const sourceChunks = sourceChunksMap.get(source.id) || []
      const modalityStats = new Map<string, number>()
      for (const chunk of sourceChunks)
        modalityStats.set(chunkModality(chunk), (modalityStats.get(chunkModality(chunk)) || 0) + 1)
      const sourceModality = [...modalityStats.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || 'unknown'
      const sourceStatus = sourceChunks.some(chunk => chunkEmbeddingStatus(chunk) === 'native')
        ? 'native'
        : sourceChunks.some(chunk => chunkEmbeddingStatus(chunk) === 'derived')
          ? 'derived'
          : sourceChunks.some(chunk => chunkEmbeddingStatus(chunk) === 'fallback')
            ? 'fallback'
            : 'missing'
      let sourcePosition = sourceCentroidMap.get(source.id) || [0, 0, 0]
      if (layoutType === 'multimodal_bridge')
        sourcePosition = projectPointToAnchor({ id: source.id, base: sourcePosition, anchor: modalityAnchors[sourceModality], scale: 0.72 })
      else if (layoutType === 'document_galaxy')
        sourcePosition = projectPointToAnchor({ id: source.id, base: sourcePosition, scale: 1.18 })

      points.push({
        nodeType: 'source',
        nodeId: source.id,
        level: 'document',
        x: sourcePosition[0],
        y: sourcePosition[1],
        z: sourcePosition[2],
        clusterId: source.id,
        modality: normalizeModality(sourceModality),
        embeddingStatus: sourceStatus,
        importance: Math.max(1, sourceChunks.length),
        label: source.resourceTitle,
        metadata: {
          sourceId: source.id,
          resourceTitle: source.resourceTitle,
          resourceKind: source.resourceKind,
          chunkCount: sourceChunks.length,
        },
      })

      for (const chunk of sourceChunks) {
        const status = chunkEmbeddingStatus(chunk)
        const basePosition = fitCoordinateMap.get(chunk.id)
          || sourceCentroidMap.get(source.id)
          || [0, 0, 0]
        let position = projectPointToAnchor({
          id: chunk.id,
          base: basePosition,
          anchor: layoutType === 'multimodal_bridge'
            ? modalityAnchors[chunkModality(chunk)]
            : sourceCentroidMap.get(source.id) || [0, 0, 0],
          scale: layoutType === 'document_galaxy' ? 0.28 : 0.92,
        })
        if (layoutType === 'chunk_space' && fitCoordinateMap.has(chunk.id))
          position = fitCoordinateMap.get(chunk.id) || position
        points.push({
          nodeType: 'chunk',
          nodeId: chunk.id,
          level: 'chunk',
          x: position[0],
          y: position[1],
          z: position[2],
          clusterId: source.id,
          modality: chunkModality(chunk),
          embeddingStatus: status,
          importance: Math.max(0.5, Math.min(8, Math.log2(Math.max(chunk.content.length, 12)))),
          label: chunk.title || chunk.citationLabel || `${source.resourceTitle}/${chunk.chunkIndex + 1}`,
          metadata: {
            sourceId: source.id,
            resourceTitle: source.resourceTitle,
            chunkIndex: chunk.chunkIndex,
            chunkKind: chunk.chunkKind,
            embeddingModel: chunkModel(chunk),
            provenanceSourceType: chunkProvenance(chunk),
            degradedProjection: !fitCoordinateMap.has(chunk.id),
          },
        })
      }

      points.push({
        nodeType: 'cluster',
        nodeId: `cluster:${source.id}`,
        level: 'cluster',
        x: sourcePosition[0],
        y: sourcePosition[1],
        z: sourcePosition[2],
        clusterId: source.id,
        modality: normalizeModality(sourceModality),
        embeddingStatus: sourceStatus,
        importance: Math.max(2, sourceChunks.length),
        label: `${source.resourceTitle} cluster`,
        metadata: {
          sourceId: source.id,
          resourceTitle: source.resourceTitle,
          chunkCount: sourceChunks.length,
        },
      })
    }

    return {
      points,
      status: reduced.algorithm === 'pca3d' || chunks.some(chunk => !fitCoordinateMap.has(chunk.id))
        ? 'degraded'
        : 'ready' as ProjectKnowledgeSemanticLayout['status'],
    }
  }

  await refreshChunkQualityMetadata(db, chunks)
  await db.query(
    `DELETE FROM project_knowledge_semantic_layouts
     WHERE project_id = $1`,
    [input.projectId],
  )

  const layoutTypes: ProjectKnowledgeSemanticLayoutType[] = ['chunk_space', 'document_galaxy', 'multimodal_bridge']
  for (const layoutType of layoutTypes) {
    const layoutId = randomUUID()
    const payload = buildLayoutPayload(layoutType)
    const clusters = payload.points.filter(point => point.level === 'cluster')
    await db.query(
      `INSERT INTO project_knowledge_semantic_layouts (
        id,
        project_id,
        snapshot_id,
        layout_type,
        algorithm,
        status,
        point_count,
        cluster_count,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, NOW(), NOW()
      )`,
      [
        layoutId,
        input.projectId,
        snapshotId,
        layoutType,
        reduced.algorithm,
        payload.status,
        payload.points.length,
        clusters.length,
        JSON.stringify({
          fitPointCount: fitChunks.length,
          degradedPointCount: payload.points.filter(point => Boolean(point.metadata.degradedProjection)).length,
        }),
      ],
    )

    for (const point of payload.points) {
      await db.query(
        `INSERT INTO project_knowledge_semantic_points (
          id,
          layout_id,
          project_id,
          node_type,
          node_id,
          level,
          cluster_id,
          modality,
          embedding_status,
          importance,
          label,
          x,
          y,
          z,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::JSONB, NOW(), NOW()
        )`,
        [
          randomUUID(),
          layoutId,
          input.projectId,
          point.nodeType,
          point.nodeId,
          point.level,
          point.clusterId,
          point.modality,
          point.embeddingStatus,
          point.importance,
          point.label,
          point.x,
          point.y,
          point.z,
          JSON.stringify(point.metadata),
        ],
      )
    }
  }

  return {
    layoutCount: layoutTypes.length,
  }
}

export async function ensureProjectKnowledgeAnalyticsMaterialized(
  db: Queryable,
  input: { projectId: string },
): Promise<ProjectKnowledgeAnalyticsFreshness> {
  const freshness = await loadAnalyticsFreshness(db, input.projectId)
  if (freshness.staleKinds.includes('relations'))
    await materializeProjectKnowledgeRelations(db, { projectId: input.projectId })
  if (freshness.staleKinds.includes('snapshot'))
    await materializeProjectKnowledgeSnapshot(db, { projectId: input.projectId, snapshotType: 'manual' })
  if (freshness.staleKinds.includes('semantic_layout'))
    await materializeProjectKnowledgeSemanticLayouts(db, { projectId: input.projectId })
  return loadAnalyticsFreshness(db, input.projectId)
}

async function buildFilterOptions(
  dashboard: ProjectKnowledgeIndexDashboard,
  chunks: ChunkLike[],
): Promise<ProjectKnowledgeExplorerPayload['filters']> {
  const modalities = [...new Set(chunks.map(chunk => chunkModality(chunk)))].sort((left, right) => left.localeCompare(right))
  const embeddingStatuses = [...new Set(chunks.map(chunk => chunkEmbeddingStatus(chunk)))]
  const provenanceSourceTypes = [...new Set(chunks.map(chunk => chunkProvenance(chunk)).filter(Boolean))] as ProjectKnowledgeProvenanceSourceType[]
  const models = [...new Set(chunks.map(chunk => chunkModel(chunk)).filter(Boolean))].sort((left, right) => left.localeCompare(right))
  const resourceKinds = [...new Set(dashboard.sources.map(source => normalizeString(source.resourceKind)).filter(Boolean))].sort((left, right) => left.localeCompare(right))
  return {
    modalities,
    embeddingStatuses,
    provenanceSourceTypes,
    models,
    resourceKinds,
  }
}

export async function buildProjectKnowledgeExplorerPayload(
  db: Queryable,
  input: { projectId: string },
): Promise<ProjectKnowledgeExplorerPayload> {
  const [analytics, dashboard, chunks] = await Promise.all([
    ensureProjectKnowledgeAnalyticsMaterialized(db, { projectId: input.projectId }),
    buildProjectKnowledgeIndexDashboard(db, {
      projectId: input.projectId,
      syncSources: false,
    }),
    listProjectKnowledgeSearchChunks(db, {
      projectId: input.projectId,
      includeStale: true,
    }),
  ])

  return {
    summary: dashboard.summary,
    diagnostics: dashboard.diagnostics,
    analytics,
    visuals: dashboard.visuals,
    filters: await buildFilterOptions(dashboard, chunks),
  }
}

function matchNodeFilters(
  node: ProjectKnowledgeRelationsPayload['nodes'][number],
  filters: FilterBag,
  updatedAt?: string,
): boolean {
  if (filters.nodeType && node.nodeType !== filters.nodeType)
    return false
  if (filters.modality && filters.modality.length > 0 && !filters.modality.includes(node.modality))
    return false
  if (filters.embeddingStatus && filters.embeddingStatus.length > 0 && !filters.embeddingStatus.includes(node.embeddingStatus))
    return false
  if (filters.provenance && filters.provenance.length > 0 && !filters.provenance.includes(node.provenanceSourceType || '' as ProjectKnowledgeProvenanceSourceType))
    return false
  if (filters.modelVersion && filters.modelVersion.length > 0 && !filters.modelVersion.includes(normalizeString(node.metadata.embeddingModel)))
    return false
  if (filters.timeRangeDays && updatedAt) {
    const threshold = Date.now() - (filters.timeRangeDays * 24 * 60 * 60 * 1000)
    if (new Date(updatedAt).getTime() < threshold)
      return false
  }
  return true
}

export async function buildProjectKnowledgeRelationsPayload(
  db: Queryable,
  input: {
    projectId: string
    nodeType?: ProjectKnowledgeRelationNodeType | ''
    modality?: Array<ProjectKnowledgeModality | 'unknown'>
    embeddingStatus?: ProjectKnowledgeEmbeddingStatus[]
    provenance?: ProjectKnowledgeProvenanceSourceType[]
    modelVersion?: string[]
    timeRangeDays?: number | null
  },
): Promise<ProjectKnowledgeRelationsPayload> {
  const filters: FilterBag = {
    nodeType: input.nodeType,
    modality: input.modality,
    embeddingStatus: input.embeddingStatus,
    provenance: input.provenance,
    modelVersion: input.modelVersion,
    timeRangeDays: input.timeRangeDays,
  }
  const [analytics, dashboard, chunks, relationsResult] = await Promise.all([
    ensureProjectKnowledgeAnalyticsMaterialized(db, { projectId: input.projectId }),
    buildProjectKnowledgeIndexDashboard(db, {
      projectId: input.projectId,
      syncSources: false,
    }),
    listProjectKnowledgeSearchChunks(db, {
      projectId: input.projectId,
      includeStale: true,
    }),
    db.query<ProjectKnowledgeRelationRow>(
      `SELECT
        id,
        project_id,
        snapshot_id,
        source_node_type,
        source_node_id,
        target_node_type,
        target_node_id,
        relation_type,
        score,
        evidence_metric,
        evidence_model,
        metadata,
        created_at::TEXT,
        updated_at::TEXT
       FROM project_knowledge_relations
       WHERE project_id = $1
       ORDER BY score DESC, updated_at DESC`,
      [input.projectId],
    ),
  ])

  const nodeMap = new Map<string, ProjectKnowledgeRelationsPayload['nodes'][number]>()
  for (const source of dashboard.sources) {
    const sourceChunks = chunks.filter(chunk => chunk.sourceId === source.id)
    const modality = sourceChunks[0] ? chunkModality(sourceChunks[0]) : 'unknown'
    const embeddingStatus = sourceChunks.some(chunk => chunkEmbeddingStatus(chunk) === 'native')
      ? 'native'
      : sourceChunks.some(chunk => chunkEmbeddingStatus(chunk) === 'derived')
        ? 'derived'
        : sourceChunks.some(chunk => chunkEmbeddingStatus(chunk) === 'fallback')
          ? 'fallback'
          : 'missing'
    nodeMap.set(`source:${source.id}`, {
      id: source.id,
      nodeType: 'source',
      label: source.resourceTitle,
      modality,
      embeddingStatus,
      provenanceSourceType: sourceChunks[0] ? chunkProvenance(sourceChunks[0]) : '',
      resourceKind: normalizeString(source.resourceKind),
      importance: Math.max(1, sourceChunks.length),
      metadata: {
        resourceTitle: source.resourceTitle,
        resourceKind: source.resourceKind,
        embeddingModel: sourceChunks[0] ? chunkModel(sourceChunks[0]) : '',
      },
    })
  }
  for (const chunk of chunks) {
    nodeMap.set(`chunk:${chunk.id}`, {
      id: chunk.id,
      nodeType: 'chunk',
      label: chunk.title || chunk.citationLabel || `${chunk.resourceTitle}/${chunk.chunkIndex + 1}`,
      modality: chunkModality(chunk),
      embeddingStatus: chunkEmbeddingStatus(chunk),
      provenanceSourceType: chunkProvenance(chunk),
      resourceKind: normalizeString(chunk.resourceKind),
      sourceId: chunk.sourceId,
      importance: Math.max(1, Math.min(9, Math.log2(Math.max(chunk.content.length, 4)))),
      metadata: {
        resourceTitle: chunk.resourceTitle,
        chunkKind: chunk.chunkKind,
        embeddingModel: chunkModel(chunk),
      },
    })
  }

  const relations = relationsResult.rows
    .map(buildRelation)
    .filter((relation) => {
      const sourceNode = nodeMap.get(`${relation.sourceNodeType}:${relation.sourceNodeId}`)
      const targetNode = nodeMap.get(`${relation.targetNodeType}:${relation.targetNodeId}`)
      if (!sourceNode || !targetNode)
        return false
      return matchNodeFilters(sourceNode, filters, relation.updatedAt)
        && matchNodeFilters(targetNode, filters, relation.updatedAt)
    })

  const includedNodeKeys = new Set<string>()
  for (const relation of relations) {
    includedNodeKeys.add(`${relation.sourceNodeType}:${relation.sourceNodeId}`)
    includedNodeKeys.add(`${relation.targetNodeType}:${relation.targetNodeId}`)
  }

  return {
    projectId: input.projectId,
    analytics,
    nodes: [...includedNodeKeys].map(key => nodeMap.get(key)).filter((item): item is ProjectKnowledgeRelationsPayload['nodes'][number] => Boolean(item)),
    relations,
  }
}

export async function buildProjectKnowledgeSemanticLayoutPayload(
  db: Queryable,
  input: {
    projectId: string
    layoutType: ProjectKnowledgeSemanticLayoutType
    level: ProjectKnowledgeSemanticLayoutLevel
    modality?: Array<ProjectKnowledgeModality | 'unknown'>
    embeddingStatus?: ProjectKnowledgeEmbeddingStatus[]
    provenance?: ProjectKnowledgeProvenanceSourceType[]
    modelVersion?: string[]
    timeRangeDays?: number | null
  },
): Promise<ProjectKnowledgeSemanticLayoutPayload> {
  const filters: FilterBag = {
    modality: input.modality,
    embeddingStatus: input.embeddingStatus,
    provenance: input.provenance,
    modelVersion: input.modelVersion,
    timeRangeDays: input.timeRangeDays,
  }
  const emptySummary: ProjectKnowledgeSemanticLayoutPayload['summary'] = {
    clusterCount: 0,
    pointCount: 0,
    averageSimilarity: 0,
    maxSimilarity: 0,
  }
  const [analytics, chunks, layoutResult] = await Promise.all([
    ensureProjectKnowledgeAnalyticsMaterialized(db, { projectId: input.projectId }),
    listProjectKnowledgeSearchChunks(db, {
      projectId: input.projectId,
      includeStale: true,
    }),
    db.query<ProjectKnowledgeLayoutRow>(
      `SELECT
        id,
        project_id,
        layout_type,
        algorithm,
        point_count,
        cluster_count,
        status,
        metadata,
        created_at::TEXT,
        updated_at::TEXT
       FROM project_knowledge_semantic_layouts
       WHERE project_id = $1
         AND layout_type = $2
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [input.projectId, input.layoutType],
    ),
  ])

  const row = layoutResult.rows[0]
  if (!row) {
    return {
      projectId: input.projectId,
      analytics,
      layout: null,
      summary: emptySummary,
      clusters: [],
      points: [],
      selectionSummary: {
        totalPoints: 0,
        returnedPoints: 0,
        level: input.level,
        layoutType: input.layoutType,
      },
    }
  }

  const layout = buildLayout(row)
  const pointsResult = await db.query<ProjectKnowledgePointRow>(
    `SELECT
      id,
      layout_id,
      node_type,
      node_id,
      level,
      cluster_id,
      modality,
      embedding_status,
      importance,
      label,
      x,
      y,
      z,
      metadata
     FROM project_knowledge_semantic_points
     WHERE layout_id = $1
     ORDER BY importance DESC, updated_at DESC`,
    [layout.id],
  )

  const allPoints = pointsResult.rows.map(buildPoint)
  const filteredPoints = allPoints.filter((point) => {
    if (point.level !== input.level)
      return false
    const node = {
      id: point.nodeId,
      nodeType: point.nodeType === 'cluster' ? 'source' : point.nodeType,
      label: point.label,
      modality: point.modality,
      embeddingStatus: point.embeddingStatus,
      provenanceSourceType: normalizeProvenance(point.metadata.provenanceSourceType),
      importance: point.importance,
      metadata: point.metadata,
    } as ProjectKnowledgeRelationsPayload['nodes'][number]
    return matchNodeFilters(node, filters, layout.updatedAt)
  })
  const filteredChunks = chunks.filter(chunk => matchNodeFilters(buildChunkFilterNode(chunk), filters, chunk.updatedAt || layout.updatedAt))
  const filteredChunkById = new Map(filteredChunks.map(chunk => [chunk.id, chunk]))
  const filteredPointsByCluster = new Map<string, ProjectKnowledgeSemanticPoint[]>()
  for (const point of filteredPoints) {
    const bucket = filteredPointsByCluster.get(point.clusterId) || []
    bucket.push(point)
    filteredPointsByCluster.set(point.clusterId, bucket)
  }

  const globalPlotPoints = filteredPoints.map(point => ({
    x: point.x,
    y: point.y,
  }))
  const globalCentroid = globalPlotPoints.length > 0
    ? {
        x: globalPlotPoints.reduce((sum, point) => sum + point.x, 0) / globalPlotPoints.length,
        y: globalPlotPoints.reduce((sum, point) => sum + point.y, 0) / globalPlotPoints.length,
      }
    : { x: 0, y: 0 }
  const globalMeanRadius = Math.max(0.0001, meanDistance2d(globalPlotPoints, globalCentroid))

  const limit = input.level === 'chunk' ? 9000 : input.level === 'document' ? 400 : 160
  const points = filteredPoints.slice(0, limit)
  const clusters = allPoints
    .filter(point => point.level === 'cluster')
    .map<ProjectKnowledgeSemanticCluster | null>((point) => {
      const clusterPoints = filteredPointsByCluster.get(point.clusterId) || []
      if (clusterPoints.length === 0)
        return null

      const clusterChunks = clusterPoints
        .map(item => filteredChunkById.get(item.nodeId))
        .filter((chunk): chunk is ChunkLike => Boolean(chunk))
      const clusterEmbeddings = clusterChunks
        .filter(chunk => chunk.embedding.length > 0 && chunkEmbeddingStatus(chunk) !== 'missing' && chunkEmbeddingStatus(chunk) !== 'failed')
        .map(chunk => chunk.embedding)
      const clusterCentroid = {
        x: clusterPoints.reduce((sum, item) => sum + item.x, 0) / clusterPoints.length,
        y: clusterPoints.reduce((sum, item) => sum + item.y, 0) / clusterPoints.length,
      }
      const clusterMeanRadius = meanDistance2d(clusterPoints, clusterCentroid)
      const densityScore = clusterPoints.length <= 1
        ? 1
        : clampNumber(1 - (clusterMeanRadius / Math.max(globalMeanRadius * 1.45, 0.0001)), 0.12, 0.98)

      let similarityScore = 0
      if (clusterEmbeddings.length >= 2) {
        const centroidVector = averageVector(clusterEmbeddings)
        const totalSimilarity = clusterEmbeddings.reduce((sum, vector) => sum + cosineSimilarity(vector, centroidVector), 0)
        similarityScore = clampNumber(totalSimilarity / clusterEmbeddings.length, 0, 0.999)
      }
      else if (clusterEmbeddings.length === 1) {
        similarityScore = clampNumber(0.72 + (densityScore * 0.22), 0, 0.98)
      }
      else {
        similarityScore = clampNumber(densityScore * 0.84, 0, 0.95)
      }

      return {
        id: point.clusterId,
        label: point.label.replace(/\s+cluster$/i, ''),
        nodeCount: clusterPoints.length,
        modality: clusterPoints.length > 0 && clusterPoints.every(item => item.modality === clusterPoints[0]?.modality)
          ? clusterPoints[0]!.modality
          : 'mixed',
        embeddingStatus: point.embeddingStatus,
        densityScore: Number(densityScore.toFixed(4)),
        topicLabel: deriveSemanticTopicLabel(point.label.replace(/\s+cluster$/i, ''), clusterChunks),
        similarityScore: Number(similarityScore.toFixed(4)),
        centroid: {
          x: point.x,
          y: point.y,
          z: point.z,
        },
      }
    })
    .filter((cluster): cluster is ProjectKnowledgeSemanticCluster => Boolean(cluster))

  const totalClusterNodes = clusters.reduce((sum, cluster) => sum + cluster.nodeCount, 0)
  const averageSimilarity = totalClusterNodes > 0
    ? clusters.reduce((sum, cluster) => sum + (cluster.similarityScore * cluster.nodeCount), 0) / totalClusterNodes
    : 0
  const maxSimilarity = clusters.reduce((max, cluster) => Math.max(max, cluster.similarityScore), 0)
  const summary: ProjectKnowledgeSemanticLayoutPayload['summary'] = {
    clusterCount: clusters.length,
    pointCount: filteredPoints.length,
    averageSimilarity: Number(averageSimilarity.toFixed(4)),
    maxSimilarity: Number(maxSimilarity.toFixed(4)),
  }

  return {
    projectId: input.projectId,
    analytics,
    layout,
    summary,
    clusters,
    points,
    selectionSummary: {
      totalPoints: filteredPoints.length,
      returnedPoints: points.length,
      level: input.level,
      layoutType: input.layoutType,
    },
  }
}

async function listPipelineTasksForNode(
  db: Queryable,
  input: {
    projectId: string
    sourceResourceId?: string | null
    linkedContestResourceId?: string | null
  },
): Promise<ProjectKnowledgeIndexTaskSnapshot[]> {
  const result = await db.query<ProjectKnowledgeNodeTaskRow>(
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
       AND COALESCE(source_resource_id, '') = COALESCE($2::TEXT, '')
       AND COALESCE(linked_contest_resource_id, '') = COALESCE($3::TEXT, '')
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 8`,
    [
      input.projectId,
      normalizeString(input.sourceResourceId) || null,
      normalizeString(input.linkedContestResourceId) || null,
    ],
  )
  return result.rows.map(buildTaskSnapshot)
}

export async function buildProjectKnowledgeNodeDetail(
  db: Queryable,
  input: {
    projectId: string
    nodeId: string
    nodeType: ProjectKnowledgeRelationNodeType
  },
): Promise<ProjectKnowledgeNodeDetail | null> {
  const [dashboard, chunks, relationsResult] = await Promise.all([
    buildProjectKnowledgeIndexDashboard(db, {
      projectId: input.projectId,
      syncSources: false,
    }),
    listProjectKnowledgeSearchChunks(db, {
      projectId: input.projectId,
      includeStale: true,
    }),
    db.query<ProjectKnowledgeRelationRow>(
      `SELECT
        id,
        project_id,
        snapshot_id,
        source_node_type,
        source_node_id,
        target_node_type,
        target_node_id,
        relation_type,
        score,
        evidence_metric,
        evidence_model,
        metadata,
        created_at::TEXT,
        updated_at::TEXT
       FROM project_knowledge_relations
       WHERE project_id = $1
         AND (
           (source_node_type = $2 AND source_node_id = $3)
           OR (target_node_type = $2 AND target_node_id = $3)
         )
       ORDER BY score DESC, updated_at DESC
       LIMIT 24`,
      [input.projectId, input.nodeType, input.nodeId],
    ),
  ])

  const nodeRelations = relationsResult.rows.map(buildRelation)
  const nearestNeighbors = nodeRelations.filter(item => item.relationType === 'similar_to').slice(0, 8)
  const alignedNeighbors = nodeRelations.filter(item => item.relationType === 'aligned_to').slice(0, 8)

  if (input.nodeType === 'chunk') {
    const chunk = chunks.find(item => item.id === input.nodeId)
    if (!chunk)
      return null
    const metadata = chunkMetadata(chunk)
    const pipelineLog = await listPipelineTasksForNode(db, {
      projectId: input.projectId,
      sourceResourceId: chunk.sourceResourceId,
      linkedContestResourceId: chunk.linkedContestResourceId,
    })
    return {
      nodeId: chunk.id,
      nodeType: 'chunk',
      label: chunk.title || chunk.citationLabel || `${chunk.resourceTitle}/${chunk.chunkIndex + 1}`,
      contentPreview: chunk.content.slice(0, 600),
      modality: chunkModality(chunk),
      embeddingStatus: chunkEmbeddingStatus(chunk),
      embeddingProvider: normalizeString(metadata.embeddingProvider),
      embeddingModel: normalizeString(metadata.embeddingModel),
      embeddingDimensions: Math.max(0, Math.round(normalizeNumber(metadata.embeddingDimensions, chunk.embedding.length))),
      embeddingQualityScore: Math.max(0, normalizeNumber(metadata.embeddingQualityScore, 0)),
      provenanceSourceType: chunkProvenance(chunk),
      sourceConfidence: Math.max(0, normalizeNumber(metadata.sourceConfidence ?? metadata.confidence, 0)),
      neighborhoodConsistency: Math.max(0, normalizeNumber(metadata.neighborhoodConsistency, 0)),
      metadata,
      pipelineLog,
      nearestNeighbors,
      alignedNeighbors,
    }
  }

  const source = dashboard.sources.find(item => item.id === input.nodeId)
  if (!source)
    return null
  const sourceChunks = chunks.filter(item => item.sourceId === source.id)
  const bestChunk = sourceChunks.find(chunk => chunkEmbeddingStatus(chunk) === 'native')
    || sourceChunks.find(chunk => chunkEmbeddingStatus(chunk) === 'derived')
    || sourceChunks[0]
  const bestMetadata = bestChunk ? chunkMetadata(bestChunk) : {}
  const pipelineLog = await listPipelineTasksForNode(db, {
    projectId: input.projectId,
    sourceResourceId: source.sourceResourceId,
    linkedContestResourceId: source.linkedContestResourceId,
  })

  return {
    nodeId: source.id,
    nodeType: 'source',
    label: source.resourceTitle,
    contentPreview: sourceChunks.slice(0, 3).map(item => item.content).join('\n\n').slice(0, 800),
    modality: bestChunk ? chunkModality(bestChunk) : 'unknown',
    embeddingStatus: bestChunk ? chunkEmbeddingStatus(bestChunk) : 'missing',
    embeddingProvider: normalizeString(bestMetadata.embeddingProvider),
    embeddingModel: normalizeString(bestMetadata.embeddingModel),
    embeddingDimensions: Math.max(0, Math.round(normalizeNumber(bestMetadata.embeddingDimensions, bestChunk?.embedding.length || 0))),
    embeddingQualityScore: Math.max(0, normalizeNumber(bestMetadata.embeddingQualityScore, 0)),
    provenanceSourceType: bestChunk ? chunkProvenance(bestChunk) : '',
    sourceConfidence: Math.max(0, normalizeNumber(bestMetadata.sourceConfidence ?? bestMetadata.confidence, 0)),
    neighborhoodConsistency: Math.max(0, normalizeNumber(bestMetadata.neighborhoodConsistency, 0)),
    metadata: {
      resourceKind: source.resourceKind,
      resourceSource: source.resourceSource,
      chunkCount: sourceChunks.length,
      sourceHash: source.sourceHash,
      ...bestMetadata,
    },
    pipelineLog,
    nearestNeighbors,
    alignedNeighbors,
  }
}
