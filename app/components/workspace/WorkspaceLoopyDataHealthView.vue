<script setup lang="ts">
import type { Project, ProjectKnowledgeIndexDashboard, ProjectKnowledgeIndexSourceStatus } from '~~/shared/types/domain'
import { formatWorkspaceDateTime as formatDateTime, formatEtaSeconds } from '~/utils/workspace-main-panel-formatters'

type ProjectKnowledgeReindexTarget = 'all' | 'stale' | 'failed'

const props = withDefaults(defineProps<{
  activeProject?: Project | null
  activeProjectId?: string
  dashboard?: ProjectKnowledgeIndexDashboard | null
  loading?: boolean
  error?: string
  reindexingTarget?: ProjectKnowledgeReindexTarget | ''
  retryingSourceId?: string
}>(), {
  activeProject: null,
  activeProjectId: '',
  dashboard: null,
  loading: false,
  error: '',
  reindexingTarget: '',
  retryingSourceId: '',
})

const emit = defineEmits<{
  reload: []
  reindexProjectKnowledge: [target: ProjectKnowledgeReindexTarget]
  reindexProjectKnowledgeSource: [resourceId: string]
}>()

const EMPTY_DASHBOARD: ProjectKnowledgeIndexDashboard = {
  summary: {
    projectId: '',
    totalResources: 0,
    indexableResources: 0,
    pendingCount: 0,
    readyCount: 0,
    processingCount: 0,
    queuedCount: 0,
    failedCount: 0,
    staleCount: 0,
    skippedCount: 0,
    overallProgressPercent: 0,
    etaSeconds: 0,
    estimatedFinishedAt: null,
    lastRefreshedAt: '',
  },
  runtime: {
    clientType: 'langchain',
    embeddingConfigured: false,
    embeddingClientType: 'openai-compatible',
    embeddingApiStyle: 'openai-compatible-text',
    embeddingProvider: 'unconfigured',
    embeddingModel: '',
    embeddingDimensions: 0,
  },
  worker: {
    started: false,
    enabled: false,
    ticking: false,
    lastError: '',
  },
  diagnostics: {
    candidateResourceCount: 0,
    sourceCount: 0,
    taskCount: 0,
    chunkCount: 0,
    realEmbeddedChunkCount: 0,
    fallbackEmbeddedChunkCount: 0,
    unknownEmbeddedChunkCount: 0,
    multimodalIndexedCount: 0,
    multimodalBlockedCount: 0,
    healthState: 'empty_project',
    healthMessage: '当前项目没有可索引的活跃资源。',
    embeddingHealthReason: '',
    issues: [],
  },
  analytics: {
    relationsUpdatedAt: null,
    snapshotUpdatedAt: null,
    semanticLayoutUpdatedAt: null,
    latestSnapshotType: null,
    relationsJobStatus: null,
    snapshotJobStatus: null,
    semanticLayoutJobStatus: null,
    staleKinds: ['relations', 'snapshot', 'semantic_layout'],
    allReady: false,
  },
  visuals: {
    stageFunnel: [],
    failureReasons: [],
    chunkKindDistribution: [],
    resourceKindDistribution: [],
    embeddingComposition: [],
    taskTrend: [],
    resourceStatusMatrix: {
      resourceKinds: [],
      statuses: [],
      cells: [],
    },
    topology: {
      nodes: [],
      links: [],
    },
    starfieldNodes: [],
    healthMatrix: [],
    pipelineMetrics: [],
    clusterMetrics: {
      clusterCompactness: 0,
      nearestNeighborConsistency: 0,
      crossModalAlignmentScore: 0,
    },
  },
  processing: [],
  recentCompleted: [],
  failed: [],
  sources: [],
  tasks: [],
}

const currentDashboard = computed(() => props.dashboard || EMPTY_DASHBOARD)
const summary = computed(() => currentDashboard.value.summary)
const diagnostics = computed(() => currentDashboard.value.diagnostics)
const runtime = computed(() => currentDashboard.value.runtime)
const worker = computed(() => currentDashboard.value.worker)
const visuals = computed(() => currentDashboard.value.visuals)
const analytics = computed(() => currentDashboard.value.analytics)
const hasActiveProject = computed(() => Boolean(props.activeProject?.id || props.activeProjectId))

const healthBadgeLabel = computed(() => {
  const state = diagnostics.value.healthState
  if (state === 'healthy')
    return '真实索引健康'
  if (state === 'fallback_only')
    return '需重建'
  if (state === 'missing_runtime')
    return '缺少运行时'
  if (state === 'worker_inactive')
    return 'Worker 未启动'
  if (state === 'queued_but_not_running')
    return '队列阻塞'
  if (state === 'partial')
    return '部分可用'
  return '空项目'
})

const healthBadgeClass = computed(() => {
  const state = diagnostics.value.healthState
  if (state === 'healthy')
    return 'loopy-health__badge loopy-health__badge--ready'
  if (state === 'fallback_only' || state === 'partial')
    return 'loopy-health__badge loopy-health__badge--warning'
  if (state === 'missing_runtime' || state === 'worker_inactive' || state === 'queued_but_not_running')
    return 'loopy-health__badge loopy-health__badge--error'
  return 'loopy-health__badge loopy-health__badge--idle'
})

const runtimeLabel = computed(() => {
  if (!runtime.value.embeddingConfigured)
    return 'Embedding 未配置'
  const clientLabel = runtime.value.clientType === 'bailian-native'
    ? '百炼原生 SDK'
    : runtime.value.clientType === 'coze-sdk'
      ? 'Coze SDK'
      : 'LangChain'
  const embeddingClientLabel = runtime.value.embeddingClientType === 'bailian-native' ? '百炼原生' : 'OpenAI 兼容'
  return `${clientLabel} · ${embeddingClientLabel} · ${runtime.value.embeddingProvider || 'provider'} / ${runtime.value.embeddingModel || 'model'} @ ${runtime.value.embeddingDimensions || 0}d`
})

const freshnessCards = computed(() => [
  {
    label: '关系刷新',
    value: formatDateTime(String(analytics.value.relationsUpdatedAt || '')),
    tone: analytics.value.staleKinds.includes('relations') ? 'warning' : 'ready',
  },
  {
    label: '快照采集',
    value: formatDateTime(String(analytics.value.snapshotUpdatedAt || '')),
    tone: analytics.value.staleKinds.includes('snapshot') ? 'warning' : 'ready',
  },
  {
    label: '语义布局',
    value: formatDateTime(String(analytics.value.semanticLayoutUpdatedAt || '')),
    tone: analytics.value.staleKinds.includes('semantic_layout') ? 'warning' : 'ready',
  },
  {
    label: 'Analytics 就绪',
    value: analytics.value.allReady ? '已就绪' : '待刷新',
    tone: analytics.value.allReady ? 'ready' : 'warning',
  },
])

const summaryCards = computed(() => {
  return [
    { label: '候选资源', value: String(diagnostics.value.candidateResourceCount) },
    { label: 'Source', value: String(diagnostics.value.sourceCount) },
    { label: 'Task', value: String(diagnostics.value.taskCount) },
    { label: 'Chunk', value: String(diagnostics.value.chunkCount) },
    { label: '真实 Embedding', value: String(diagnostics.value.realEmbeddedChunkCount) },
    { label: '历史 Fallback Chunk', value: String(diagnostics.value.fallbackEmbeddedChunkCount) },
    { label: '多模态资源', value: String(diagnostics.value.multimodalIndexedCount) },
    { label: '阻塞资源', value: String(diagnostics.value.multimodalBlockedCount) },
  ]
})

const stageFunnelMax = computed(() => Math.max(1, ...visuals.value.stageFunnel.map(item => item.count || 0)))
const failureReasonMax = computed(() => Math.max(1, ...visuals.value.failureReasons.map(item => item.count || 0)))
const taskTrendMax = computed(() => Math.max(1, ...visuals.value.taskTrend.flatMap(item => [item.tasks, item.succeeded, item.failed])))
const healthMatrixModalities = computed(() => {
  return [...new Set(visuals.value.healthMatrix.map(item => item.modality))].sort((left, right) => String(left).localeCompare(String(right)))
})
const healthMatrixStatuses = computed(() => ['native', 'derived', 'fallback', 'missing', 'failed'])
const healthMatrixMap = computed(() => {
  const map = new Map<string, number>()
  for (const cell of visuals.value.healthMatrix)
    map.set(`${cell.modality}:${cell.embeddingStatus}`, cell.count)
  return map
})
const resourceMatrixMap = computed(() => {
  const map = new Map<string, number>()
  for (const cell of visuals.value.resourceStatusMatrix.cells)
    map.set(`${cell.resourceKind}:${cell.status}`, cell.count)
  return map
})

function resolveHealthMatrixCount(modality: string, embeddingStatus: string): number {
  return healthMatrixMap.value.get(`${modality}:${embeddingStatus}`) || 0
}

function resolveResourceMatrixCount(resourceKind: string, status: string): number {
  return resourceMatrixMap.value.get(`${resourceKind}:${status}`) || 0
}

function matrixCellClass(count: number, tone: 'ready' | 'warning' | 'error' | 'idle'): string {
  if (count <= 0)
    return 'loopy-health__matrix-cell loopy-health__matrix-cell--empty'
  return `loopy-health__matrix-cell loopy-health__matrix-cell--${tone}`
}

function formatProgressPercent(value: number | string | null | undefined): string {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value || 0))))
  return `${percent}%`
}

function formatDurationLabel(value: number | string | null | undefined): string {
  const seconds = Math.max(0, Math.round(Number(value || 0)))
  if (!Number.isFinite(seconds) || seconds <= 0)
    return '-'
  if (seconds < 60)
    return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes < 60)
    return remainSeconds > 0 ? `${minutes} 分 ${remainSeconds} 秒` : `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return remainMinutes > 0 ? `${hours} 小时 ${remainMinutes} 分` : `${hours} 小时`
}

function knowledgeStatusLabel(status: string): string {
  const normalized = String(status || '').trim()
  if (!normalized)
    return '-'
  if (normalized === 'pending')
    return '待索引'
  if (normalized === 'queued')
    return '排队中'
  if (normalized === 'extracting')
    return '提取中'
  if (normalized === 'chunking')
    return '切块中'
  if (normalized === 'embedding')
    return '向量化中'
  if (normalized === 'ready')
    return '索引完成'
  if (normalized === 'failed')
    return '索引失败'
  if (normalized === 'stale')
    return '等待刷新'
  if (normalized === 'skipped')
    return '暂不索引'
  return normalized
}

function knowledgeStageLabel(stage: string | null | undefined): string {
  const normalized = String(stage || '').trim()
  if (!normalized)
    return '-'
  if (normalized === 'finalizing')
    return '收尾中'
  return knowledgeStatusLabel(normalized)
}

function resolveSourceError(source: ProjectKnowledgeIndexSourceStatus): string {
  const errorText = String(source.lastError || source.lastTask?.errorMessage || '').trim()
  return errorText || '暂无错误详情'
}

const taskTrendPolyline = computed(() => {
  const items = visuals.value.taskTrend
  if (items.length === 0)
    return ''
  return items.map((item, index) => {
    const x = items.length <= 1 ? 0 : (index / Math.max(1, items.length - 1)) * 100
    const y = 100 - ((item.tasks || 0) / taskTrendMax.value) * 100
    return `${x},${y}`
  }).join(' ')
})

const taskTrendSucceededPolyline = computed(() => {
  const items = visuals.value.taskTrend
  if (items.length === 0)
    return ''
  return items.map((item, index) => {
    const x = items.length <= 1 ? 0 : (index / Math.max(1, items.length - 1)) * 100
    const y = 100 - ((item.succeeded || 0) / taskTrendMax.value) * 100
    return `${x},${y}`
  }).join(' ')
})

const taskTrendFailedPolyline = computed(() => {
  const items = visuals.value.taskTrend
  if (items.length === 0)
    return ''
  return items.map((item, index) => {
    const x = items.length <= 1 ? 0 : (index / Math.max(1, items.length - 1)) * 100
    const y = 100 - ((item.failed || 0) / taskTrendMax.value) * 100
    return `${x},${y}`
  }).join(' ')
})
</script>

<template>
  <div class="loopy-health space-y-5">
    <div class="loopy-health__hero">
      <div class="loopy-health__hero-copy">
        <span :class="healthBadgeClass">
          {{ healthBadgeLabel }}
        </span>
        <h2 class="loopy-health__title">
          {{ diagnostics.healthMessage }}
        </h2>
        <p class="loopy-health__subtitle">
          这里专门回答“系统哪里坏了、坏到什么程度”。3D 语义空间已经被拆到单独子视图，健康页只保留真实诊断。
        </p>

        <div class="loopy-health__pill-row">
          <span class="loopy-health__pill">{{ runtimeLabel }}</span>
          <span class="loopy-health__pill">
            {{ worker.ticking ? 'Worker 正在消费队列' : worker.lastSuccessAt ? `最近成功 ${formatDateTime(worker.lastSuccessAt)}` : 'Worker 等待中' }}
          </span>
          <span class="loopy-health__pill">
            当前快照 {{ analytics.latestSnapshotType === 'hourly' ? 'hourly' : analytics.latestSnapshotType === 'manual' ? 'manual' : '未生成' }}
          </span>
        </div>

        <div class="loopy-health__actions">
          <button
            class="loopy-health__action loopy-health__action--primary"
            type="button"
            :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
            @click="emit('reindexProjectKnowledge', 'all')"
          >
            {{ props.reindexingTarget === 'all' ? '重建中...' : '全量重建' }}
          </button>
          <button
            class="loopy-health__action"
            type="button"
            :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
            @click="emit('reindexProjectKnowledge', 'stale')"
          >
            {{ props.reindexingTarget === 'stale' ? '重建中...' : '重建 stale' }}
          </button>
          <button
            class="loopy-health__action"
            type="button"
            :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
            @click="emit('reindexProjectKnowledge', 'failed')"
          >
            {{ props.reindexingTarget === 'failed' ? '重建中...' : '重建 failed' }}
          </button>
          <button class="loopy-health__action" type="button" :disabled="props.loading" @click="emit('reload')">
            刷新诊断
          </button>
        </div>
      </div>

      <div class="loopy-health__hero-panel">
        <div class="loopy-health__progress-head">
          <span>整体进度</span>
          <span>{{ formatProgressPercent(summary.overallProgressPercent) }}</span>
        </div>
        <div class="loopy-health__progress-track">
          <div class="loopy-health__progress-fill" :style="{ width: formatProgressPercent(summary.overallProgressPercent) }" />
        </div>
        <div class="loopy-health__progress-meta">
          <span>预计剩余 {{ formatEtaSeconds(summary.etaSeconds) }}</span>
          <span>预计完成 {{ formatDateTime(String(summary.estimatedFinishedAt || '')) }}</span>
          <span>最近刷新 {{ formatDateTime(String(summary.lastRefreshedAt || '')) }}</span>
        </div>

        <div class="loopy-health__freshness-grid">
          <article v-for="card in freshnessCards" :key="card.label" class="loopy-health__freshness-card" :data-tone="card.tone">
            <div class="loopy-health__freshness-label">
              {{ card.label }}
            </div>
            <div class="loopy-health__freshness-value">
              {{ card.value || '-' }}
            </div>
          </article>
        </div>
      </div>
    </div>

    <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-8">
      <article v-for="card in summaryCards" :key="card.label" class="loopy-health__summary-card">
        <div class="loopy-health__summary-label">
          {{ card.label }}
        </div>
        <div class="loopy-health__summary-value">
          {{ card.value }}
        </div>
      </article>
    </div>

    <section v-if="props.loading" class="loopy-health__message">
      正在加载 Loopy 数据诊断...
    </section>
    <section v-else-if="!hasActiveProject" class="loopy-health__message">
      当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
    </section>
    <section v-else-if="props.error" class="loopy-health__message loopy-health__message--error">
      {{ props.error }}
    </section>

    <template v-else>
      <section class="gap-3 grid">
        <article
          v-for="issue in diagnostics.issues"
          :key="issue.code"
          class="loopy-health__issue"
          :data-severity="issue.severity"
        >
          <span class="material-symbols-outlined text-[16px]">
            {{ issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info' }}
          </span>
          <span>{{ issue.message }}</span>
        </article>
      </section>

      <div class="loopy-health__grid loopy-health__grid--3">
        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>健康矩阵</h3>
            <span>{{ healthMatrixModalities.length }} x {{ healthMatrixStatuses.length }}</span>
          </div>
          <div class="loopy-health__matrix" :style="{ gridTemplateColumns: `120px repeat(${healthMatrixStatuses.length}, minmax(0, 1fr))` }">
            <div class="loopy-health__matrix-header" />
            <div v-for="status in healthMatrixStatuses" :key="status" class="loopy-health__matrix-header">
              {{ status }}
            </div>
            <template v-for="modality in healthMatrixModalities" :key="modality">
              <div class="loopy-health__matrix-header loopy-health__matrix-header--side">
                {{ modality }}
              </div>
              <div
                v-for="status in healthMatrixStatuses"
                :key="`${modality}-${status}`"
                :class="matrixCellClass(resolveHealthMatrixCount(modality, status), status === 'native' || status === 'derived' ? 'ready' : status === 'fallback' ? 'warning' : status === 'failed' ? 'error' : 'idle')"
              >
                {{ resolveHealthMatrixCount(modality, status) }}
              </div>
            </template>
          </div>
        </section>

        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>阶段漏斗</h3>
            <span>{{ visuals.stageFunnel.length }} 个阶段</span>
          </div>
          <div class="space-y-3">
            <div v-for="item in visuals.stageFunnel" :key="item.label" class="loopy-health__bar-row">
              <div class="loopy-health__bar-label">
                {{ item.label }}
              </div>
              <div class="loopy-health__bar-track">
                <div class="loopy-health__bar-fill" :style="{ width: `${(item.count / stageFunnelMax) * 100}%` }" />
              </div>
              <div class="loopy-health__bar-value">
                {{ item.count }}
              </div>
            </div>
          </div>
        </section>

        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>Pipeline 质量</h3>
            <span>{{ visuals.pipelineMetrics.length }} 段</span>
          </div>
          <div class="space-y-2">
            <article v-for="metric in visuals.pipelineMetrics" :key="metric.stage" class="loopy-health__pipeline-item" :data-status="metric.status">
              <div class="loopy-health__pipeline-top">
                <strong>{{ metric.stage }}</strong>
                <span>{{ metric.status }}</span>
              </div>
              <div class="loopy-health__pipeline-meta">
                <span>{{ metric.outputCount }}/{{ metric.inputCount }}</span>
                <span>质量 {{ Math.round(metric.qualityScore * 100) }}%</span>
                <span>{{ metric.modelName }}</span>
              </div>
            </article>
          </div>
        </section>

        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>最近任务趋势</h3>
            <span>{{ visuals.taskTrend.length }} 天</span>
          </div>
          <div v-if="visuals.taskTrend.length > 0" class="loopy-health__trend">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="loopy-health__trend-svg">
              <polyline class="loopy-health__trend-line loopy-health__trend-line--all" :points="taskTrendPolyline" />
              <polyline class="loopy-health__trend-line loopy-health__trend-line--ok" :points="taskTrendSucceededPolyline" />
              <polyline class="loopy-health__trend-line loopy-health__trend-line--fail" :points="taskTrendFailedPolyline" />
            </svg>
            <div class="loopy-health__trend-legend">
              <span>总任务</span>
              <span>成功</span>
              <span>失败</span>
            </div>
          </div>
          <div v-else class="loopy-health__empty">
            暂无任务趋势数据。
          </div>
        </section>

        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>失败原因排行</h3>
            <span>{{ visuals.failureReasons.length }} 条</span>
          </div>
          <div v-if="visuals.failureReasons.length > 0" class="space-y-3">
            <div v-for="item in visuals.failureReasons" :key="item.label" class="loopy-health__bar-row">
              <div class="loopy-health__bar-label loopy-health__bar-label--wide">
                {{ item.label }}
              </div>
              <div class="loopy-health__bar-track">
                <div class="loopy-health__bar-fill loopy-health__bar-fill--rose" :style="{ width: `${(item.count / failureReasonMax) * 100}%` }" />
              </div>
              <div class="loopy-health__bar-value">
                {{ item.count }}
              </div>
            </div>
          </div>
          <div v-else class="loopy-health__empty">
            当前没有失败任务。
          </div>
        </section>

        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>资源状态矩阵</h3>
            <span>{{ visuals.resourceStatusMatrix.resourceKinds.length }} x {{ visuals.resourceStatusMatrix.statuses.length }}</span>
          </div>
          <div class="loopy-health__matrix" :style="{ gridTemplateColumns: `120px repeat(${visuals.resourceStatusMatrix.statuses.length}, minmax(0, 1fr))` }">
            <div class="loopy-health__matrix-header" />
            <div v-for="status in visuals.resourceStatusMatrix.statuses" :key="status" class="loopy-health__matrix-header">
              {{ knowledgeStatusLabel(status) }}
            </div>
            <template v-for="resourceKind in visuals.resourceStatusMatrix.resourceKinds" :key="resourceKind">
              <div class="loopy-health__matrix-header loopy-health__matrix-header--side">
                {{ resourceKind }}
              </div>
              <div
                v-for="status in visuals.resourceStatusMatrix.statuses"
                :key="`${resourceKind}-${status}`"
                :class="matrixCellClass(resolveResourceMatrixCount(resourceKind, status), status === 'ready' ? 'ready' : status === 'failed' ? 'error' : status === 'stale' ? 'warning' : 'idle')"
              >
                {{ resolveResourceMatrixCount(resourceKind, status) }}
              </div>
            </template>
          </div>
        </section>
      </div>

      <section class="loopy-health__card">
        <div class="loopy-health__card-head">
          <h3>Cluster 指标</h3>
          <span>来自最近 analytics</span>
        </div>
        <div class="gap-3 grid md:grid-cols-3">
          <article class="loopy-health__metric-chip">
            <span>Cluster Compactness</span>
            <strong>{{ Math.round(visuals.clusterMetrics.clusterCompactness * 100) }}%</strong>
          </article>
          <article class="loopy-health__metric-chip">
            <span>Nearest Neighbor</span>
            <strong>{{ Math.round(visuals.clusterMetrics.nearestNeighborConsistency * 100) }}%</strong>
          </article>
          <article class="loopy-health__metric-chip">
            <span>Cross-modal Alignment</span>
            <strong>{{ Math.round(visuals.clusterMetrics.crossModalAlignmentScore * 100) }}%</strong>
          </article>
        </div>
      </section>

      <div class="gap-4 grid xl:grid-cols-3">
        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>正在处理</h3>
            <span>{{ currentDashboard.processing.length }} 项</span>
          </div>
          <div class="space-y-2">
            <article v-for="source in currentDashboard.processing" :key="source.id" class="loopy-health__list-item">
              <div class="text-slate-800 font-semibold truncate">
                {{ source.resourceTitle }}
              </div>
              <div class="text-xs text-slate-500 mt-1">
                {{ knowledgeStageLabel(source.currentStage || source.status) }} · {{ formatProgressPercent(source.progressPercent) }} · ETA {{ formatDurationLabel(source.etaSeconds) }}
              </div>
            </article>
            <div v-if="currentDashboard.processing.length === 0" class="loopy-health__empty">
              当前没有正在处理的索引任务。
            </div>
          </div>
        </section>

        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>最近完成</h3>
            <span>{{ currentDashboard.recentCompleted.length }} 项</span>
          </div>
          <div class="space-y-2">
            <article v-for="source in currentDashboard.recentCompleted" :key="source.id" class="loopy-health__list-item">
              <div class="text-slate-800 font-semibold truncate">
                {{ source.resourceTitle }}
              </div>
              <div class="text-xs text-slate-500 mt-1">
                完成于 {{ formatDateTime(String(source.lastIndexedAt || '')) }} · Chunk {{ source.chunkIndexed || source.chunkTotal || 0 }}
              </div>
            </article>
            <div v-if="currentDashboard.recentCompleted.length === 0" class="loopy-health__empty">
              暂无最近完成记录。
            </div>
          </div>
        </section>

        <section class="loopy-health__card">
          <div class="loopy-health__card-head">
            <h3>失败项</h3>
            <span>{{ currentDashboard.failed.length }} 项</span>
          </div>
          <div class="space-y-2">
            <article v-for="source in currentDashboard.failed" :key="source.id" class="loopy-health__list-item loopy-health__list-item--failed">
              <div class="flex gap-3 items-start justify-between">
                <div class="min-w-0">
                  <div class="text-rose-700 font-semibold truncate">
                    {{ source.resourceTitle }}
                  </div>
                  <div class="text-xs text-rose-600 mt-1">
                    {{ knowledgeStageLabel(source.lastErrorStage || source.currentStage || source.status) }} · {{ resolveSourceError(source) }}
                  </div>
                </div>
                <button
                  class="loopy-health__inline-action"
                  type="button"
                  :disabled="!source.sourceResourceId || props.retryingSourceId === source.sourceResourceId"
                  @click="emit('reindexProjectKnowledgeSource', source.sourceResourceId || '')"
                >
                  {{ props.retryingSourceId === source.sourceResourceId ? '重试中...' : '重试' }}
                </button>
              </div>
            </article>
            <div v-if="currentDashboard.failed.length === 0" class="loopy-health__empty">
              当前没有失败项。
            </div>
          </div>
        </section>
      </div>

      <section class="loopy-health__card">
        <div class="loopy-health__card-head">
          <h3>完整状态表</h3>
          <span>{{ currentDashboard.sources.length }} 条</span>
        </div>
        <div class="overflow-x-auto">
          <table class="loopy-health__table">
            <thead>
              <tr>
                <th>资源</th>
                <th>状态</th>
                <th>阶段</th>
                <th>进度</th>
                <th>ETA</th>
                <th>Chunk</th>
                <th>最后完成</th>
                <th>错误</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="source in currentDashboard.sources" :key="source.id">
                <td>{{ source.resourceTitle }}</td>
                <td>{{ knowledgeStatusLabel(source.status) }}</td>
                <td>{{ knowledgeStageLabel(source.currentStage || source.status) }}</td>
                <td>{{ formatProgressPercent(source.progressPercent) }}</td>
                <td>{{ formatDurationLabel(source.etaSeconds) }}</td>
                <td>{{ source.chunkIndexed || source.chunkTotal || 0 }}</td>
                <td>{{ formatDateTime(String(source.lastIndexedAt || '')) }}</td>
                <td class="max-w-[260px]">
                  {{ source.status === 'failed' ? resolveSourceError(source) : '-' }}
                </td>
                <td>
                  <button
                    class="loopy-health__inline-action"
                    type="button"
                    :disabled="!source.sourceResourceId || props.retryingSourceId === source.sourceResourceId"
                    @click="emit('reindexProjectKnowledgeSource', source.sourceResourceId || '')"
                  >
                    {{ props.retryingSourceId === source.sourceResourceId ? '处理中...' : '重新索引' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.loopy-health {
  --loopy-health-gap-1: var(--wl-wb-gap-1, 6px);
  --loopy-health-gap-2: var(--wl-wb-gap-2, 8px);
  --loopy-health-gap-3: var(--wl-wb-gap-3, 10px);
  --loopy-health-gap-4: var(--wl-wb-gap-4, 12px);
  --loopy-health-gap-5: var(--wl-wb-gap-5, 14px);
  --loopy-health-panel-padding: var(--wl-wb-panel-padding, 12px);
  --loopy-health-card-padding: var(--wl-wb-card-padding, 10px);
  --loopy-health-shell-radius: var(--wl-wb-shell-radius, 18px);
  --loopy-health-panel-radius: var(--wl-wb-panel-radius, 15px);
  --loopy-health-card-radius: var(--wl-wb-card-radius, 12px);
  --loopy-health-control-height: var(--wl-wb-control-height, 34px);
  --loopy-health-control-padding-x: var(--wl-wb-control-padding-x, 14px);
  --loopy-health-chip-height: var(--wl-wb-chip-height, 28px);
  --loopy-health-caption-size: var(--wl-wb-caption-size, 11px);
  --loopy-health-label-size: var(--wl-wb-label-size, 12px);
  --loopy-health-body-size: var(--wl-wb-body-size, 13px);
  --loopy-health-title-size: var(--wl-wb-title-size, 28px);
  --loopy-health-panel-title-size: var(--wl-wb-panel-title-size, 16px);
}

.loopy-health__hero {
  display: grid;
  gap: var(--loopy-health-gap-4);
  grid-template-columns: minmax(0, 1.18fr) minmax(320px, 0.82fr);
}

.loopy-health__hero-copy,
.loopy-health__hero-panel,
.loopy-health__card,
.loopy-health__summary-card,
.loopy-health__message {
  border: 1px solid #dbe7f3;
  border-radius: var(--loopy-health-panel-radius);
  background: #fff;
  box-shadow: none;
}

.loopy-health__hero-copy {
  padding: calc(var(--loopy-health-panel-padding) + var(--loopy-health-gap-4));
  background:
    radial-gradient(circle at top left, rgba(73, 164, 255, 0.13), transparent 32%),
    linear-gradient(150deg, #ffffff 0%, #f7fbff 52%, #f4f9ff 100%);
}

.loopy-health__hero-panel {
  padding: calc(var(--loopy-health-panel-padding) + var(--loopy-health-gap-2));
  background:
    radial-gradient(circle at top right, rgba(19, 171, 182, 0.12), transparent 28%),
    linear-gradient(160deg, #fdfefe 0%, #f6fbff 100%);
}

.loopy-health__badge {
  display: inline-flex;
  align-items: center;
  min-height: var(--loopy-health-chip-height);
  padding: 0 var(--loopy-health-gap-4);
  border-radius: 999px;
  font-size: var(--loopy-health-caption-size);
  font-weight: 800;
}

.loopy-health__badge--ready {
  background: #eafbf3;
  color: #0f8a57;
}
.loopy-health__badge--warning {
  background: #fff6e3;
  color: #a16207;
}
.loopy-health__badge--error {
  background: #fff0f0;
  color: #b45309;
}
.loopy-health__badge--idle {
  background: #eef5ff;
  color: #436487;
}

.loopy-health__title {
  margin: calc(var(--loopy-health-gap-4) + var(--loopy-health-gap-1)) 0 0;
  color: #13253d;
  font-size: calc(var(--loopy-health-title-size) + 2px);
  line-height: 1.12;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.loopy-health__subtitle {
  margin: var(--loopy-health-gap-4) 0 0;
  color: #5e7396;
  font-size: var(--loopy-health-body-size);
  line-height: 1.6;
}

.loopy-health__pill-row,
.loopy-health__actions,
.loopy-health__progress-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--loopy-health-gap-3);
}

.loopy-health__pill {
  display: inline-flex;
  align-items: center;
  min-height: var(--loopy-health-control-height);
  padding: 0 var(--loopy-health-gap-4);
  border: 1px solid #dbe7f3;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #365072;
  font-size: var(--loopy-health-label-size);
  font-weight: 600;
}

.loopy-health__pill-row {
  margin-top: calc(var(--loopy-health-gap-5) + var(--loopy-health-gap-1));
}
.loopy-health__actions {
  margin-top: calc(var(--loopy-health-gap-5) + var(--loopy-health-gap-2));
}

.loopy-health__action {
  min-height: var(--loopy-health-control-height);
  padding: 0 var(--loopy-health-control-padding-x);
  border: 1px solid #d6e4f3;
  border-radius: 999px;
  background: #fff;
  color: #355274;
  font-size: var(--loopy-health-label-size);
  font-weight: 700;
}

.loopy-health__action--primary {
  border-color: #0d2d4c;
  background: #0f2235;
  color: #f9fcff;
}

.loopy-health__progress-head,
.loopy-health__progress-meta,
.loopy-health__card-head,
.loopy-health__bar-row,
.loopy-health__pipeline-top,
.loopy-health__pipeline-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.loopy-health__progress-head {
  font-size: var(--loopy-health-label-size);
  font-weight: 700;
  color: #203655;
}

.loopy-health__progress-track {
  height: 10px;
  margin-top: var(--loopy-health-gap-3);
  border-radius: 999px;
  background: #dfebf8;
  overflow: hidden;
}

.loopy-health__progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #41a6ff, #76f0ff);
}

.loopy-health__progress-meta {
  margin-top: var(--loopy-health-gap-4);
  color: #567092;
  font-size: var(--loopy-health-label-size);
}

.loopy-health__freshness-grid {
  display: grid;
  gap: var(--loopy-health-gap-3);
  margin-top: calc(var(--loopy-health-gap-5) + var(--loopy-health-gap-1));
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.loopy-health__freshness-card {
  padding: var(--loopy-health-card-padding);
  border-radius: var(--loopy-health-card-radius);
  border: 1px solid #dce8f5;
  background: rgba(255, 255, 255, 0.82);
}

.loopy-health__freshness-card[data-tone='warning'] {
  background: #fff8ea;
  border-color: #f3dfb2;
}
.loopy-health__freshness-card[data-tone='ready'] {
  background: #f4fbf7;
  border-color: #cfe9df;
}

.loopy-health__freshness-label,
.loopy-health__summary-label,
.loopy-health__card-head span,
.loopy-health__bar-label,
.loopy-health__matrix-header,
.loopy-health__pipeline-meta,
.loopy-health__empty,
.loopy-health__message {
  color: #6c83a3;
  font-size: var(--loopy-health-label-size);
}

.loopy-health__freshness-value,
.loopy-health__summary-value,
.loopy-health__metric-chip strong {
  color: #14263e;
  font-weight: 800;
}

.loopy-health__summary-card {
  padding: calc(var(--loopy-health-card-padding) + var(--loopy-health-gap-2));
}
.loopy-health__summary-value {
  margin-top: var(--loopy-health-gap-2);
  font-size: calc(var(--loopy-health-title-size) - 6px);
  letter-spacing: -0.02em;
}
.loopy-health__message {
  padding: calc(var(--loopy-health-panel-padding) + var(--loopy-health-gap-2));
}
.loopy-health__message--error {
  background: #fff6f6;
  color: #b45309;
  border-color: #f0d2d2;
}

.loopy-health__issue {
  display: flex;
  align-items: center;
  gap: var(--loopy-health-gap-3);
  border-radius: var(--loopy-health-card-radius);
  padding: var(--loopy-health-card-padding) var(--loopy-health-gap-5);
  font-size: var(--loopy-health-label-size);
  font-weight: 600;
}

.loopy-health__issue[data-severity='error'] {
  background: #fff4f4;
  color: #b45309;
}
.loopy-health__issue[data-severity='warning'] {
  background: #fff8ea;
  color: #a16207;
}
.loopy-health__issue[data-severity='info'] {
  background: #f4f9ff;
  color: #33557c;
}

.loopy-health__grid {
  display: grid;
  gap: var(--loopy-health-gap-4);
}
.loopy-health__grid--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.loopy-health__card {
  padding: calc(var(--loopy-health-panel-padding) + var(--loopy-health-gap-2));
}

.loopy-health__card-head h3 {
  margin: 0;
  color: #182c48;
  font-size: var(--loopy-health-body-size);
  font-weight: 800;
}

.loopy-health__matrix {
  display: grid;
  gap: 8px;
}

.loopy-health__matrix-header {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 12px;
  background: #f5f8fc;
  font-weight: 700;
}

.loopy-health__matrix-header--side {
  justify-content: flex-start;
  padding: 0 10px;
}

.loopy-health__matrix-cell {
  min-height: 34px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.loopy-health__matrix-cell--empty {
  background: #f7f9fc;
  color: #93a4bf;
}
.loopy-health__matrix-cell--ready {
  background: #ebfaf2;
  color: #137e55;
}
.loopy-health__matrix-cell--warning {
  background: #fff7e8;
  color: #a16207;
}
.loopy-health__matrix-cell--error {
  background: #fff1f1;
  color: #b45309;
}
.loopy-health__matrix-cell--idle {
  background: #eef5ff;
  color: #46688e;
}

.loopy-health__bar-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 32px;
}

.loopy-health__bar-label--wide {
  width: 110px;
}

.loopy-health__bar-track {
  height: 10px;
  border-radius: 999px;
  background: #ecf2fa;
  overflow: hidden;
}

.loopy-health__bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #46a7ff, #7ae7ff);
}

.loopy-health__bar-fill--rose {
  background: linear-gradient(90deg, #ff7d8b, #ffb2ba);
}

.loopy-health__pipeline-item {
  padding: 12px;
  border-radius: 16px;
  border: 1px solid #dce7f4;
  background: #f8fbff;
}

.loopy-health__pipeline-item[data-status='success'] {
  border-color: #d0eadf;
  background: #f4fbf7;
}
.loopy-health__pipeline-item[data-status='degraded'] {
  border-color: #f1dfb1;
  background: #fff8eb;
}
.loopy-health__pipeline-item[data-status='failed'],
.loopy-health__pipeline-item[data-status='blocked'] {
  border-color: #f0d0d0;
  background: #fff4f4;
}

.loopy-health__trend {
  display: grid;
  gap: 10px;
}
.loopy-health__trend-svg {
  width: 100%;
  height: 180px;
  border-radius: 18px;
  background: linear-gradient(180deg, #f8fbff, #ffffff);
}
.loopy-health__trend-line {
  fill: none;
  stroke-width: 2.2;
}
.loopy-health__trend-line--all {
  stroke: #3b82f6;
}
.loopy-health__trend-line--ok {
  stroke: #10b981;
}
.loopy-health__trend-line--fail {
  stroke: #fb7185;
}
.loopy-health__trend-legend {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: #6980a0;
}

.loopy-health__metric-chip,
.loopy-health__list-item {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid #dce7f4;
  background: #f8fbff;
}

.loopy-health__metric-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.loopy-health__list-item--failed {
  background: #fff6f6;
  border-color: #f0d3d3;
}

.loopy-health__inline-action {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #d8e6f2;
  background: #fff;
  color: #355274;
  font-size: 12px;
  font-weight: 700;
}

.loopy-health__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.loopy-health__table th,
.loopy-health__table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e8eef7;
  text-align: left;
  vertical-align: top;
}

.loopy-health__table th {
  color: #6d82a1;
  font-size: 11px;
}

@media (max-width: 1280px) {
  .loopy-health__hero,
  .loopy-health__grid--3 {
    grid-template-columns: 1fr;
  }
}
</style>
