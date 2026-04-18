<script setup lang="ts">
import type {
  Project,
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeIndexSourceStatus,
  ProjectKnowledgeIndexTopologyNode,
} from '~~/shared/types/domain'
import { formatDateTime, formatEtaSeconds } from '~/utils/workspace-main-panel-formatters'

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
    embeddingConfigured: false,
    embeddingProvider: 'unconfigured',
    embeddingModel: '',
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
    healthState: 'empty_project',
    healthMessage: '当前项目没有可索引的活跃资源。',
    issues: [],
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
const hasActiveProject = computed(() => Boolean(props.activeProject?.id || props.activeProjectId))

const healthBadgeLabel = computed(() => {
  const state = diagnostics.value.healthState
  if (state === 'healthy')
    return '真实索引健康'
  if (state === 'fallback_only')
    return '降级可用'
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
    return 'loopy-data-health-badge loopy-data-health-badge--ready'
  if (state === 'fallback_only' || state === 'partial')
    return 'loopy-data-health-badge loopy-data-health-badge--warning'
  if (state === 'missing_runtime' || state === 'worker_inactive' || state === 'queued_but_not_running')
    return 'loopy-data-health-badge loopy-data-health-badge--error'
  return 'loopy-data-health-badge loopy-data-health-badge--idle'
})

const runtimeLabel = computed(() => {
  if (!runtime.value.embeddingConfigured)
    return 'Embedding 未配置'
  return `${runtime.value.embeddingProvider || 'provider'} / ${runtime.value.embeddingModel || 'model'}`
})

const workerLabel = computed(() => {
  if (!worker.value.enabled || !worker.value.started)
    return 'Worker 未启用'
  if (worker.value.ticking)
    return 'Worker 正在消费'
  if (worker.value.lastSuccessAt)
    return `最近成功 ${formatDateTime(worker.value.lastSuccessAt)}`
  return 'Worker 已启动，等待任务'
})

const summaryCards = computed(() => {
  return [
    { label: '候选资源', value: String(diagnostics.value.candidateResourceCount) },
    { label: 'Source', value: String(diagnostics.value.sourceCount) },
    { label: 'Task', value: String(diagnostics.value.taskCount) },
    { label: 'Chunk', value: String(diagnostics.value.chunkCount) },
    { label: '真实 Embedding', value: String(diagnostics.value.realEmbeddedChunkCount) },
    { label: 'Fallback Chunk', value: String(diagnostics.value.fallbackEmbeddedChunkCount) },
  ]
})

const stageFunnelMax = computed(() => Math.max(1, ...visuals.value.stageFunnel.map(item => item.count || 0)))
const failureReasonMax = computed(() => Math.max(1, ...visuals.value.failureReasons.map(item => item.count || 0)))
const resourceKindMax = computed(() => Math.max(1, ...visuals.value.resourceKindDistribution.map(item => item.count || 0)))
const chunkKindMax = computed(() => Math.max(1, ...visuals.value.chunkKindDistribution.map(item => item.count || 0)))
const embeddingCompositionMax = computed(() => Math.max(1, ...visuals.value.embeddingComposition.map(item => item.count || 0)))
const taskTrendMax = computed(() => Math.max(1, ...visuals.value.taskTrend.flatMap(item => [item.tasks, item.succeeded, item.failed])))

const matrixCellMap = computed(() => {
  const map = new Map<string, number>()
  for (const cell of visuals.value.resourceStatusMatrix.cells)
    map.set(`${cell.resourceKind}:${cell.status}`, cell.count)
  return map
})

function resolveMatrixCellCount(resourceKind: string, status: string): number {
  return matrixCellMap.value.get(`${resourceKind}:${status}`) || 0
}

function matrixCellClass(resourceKind: string, status: string): string {
  const count = resolveMatrixCellCount(resourceKind, status)
  if (count <= 0)
    return 'loopy-data-matrix__cell loopy-data-matrix__cell--empty'
  if (status === 'ready')
    return 'loopy-data-matrix__cell loopy-data-matrix__cell--ready'
  if (status === 'failed')
    return 'loopy-data-matrix__cell loopy-data-matrix__cell--failed'
  if (status === 'stale')
    return 'loopy-data-matrix__cell loopy-data-matrix__cell--stale'
  return 'loopy-data-matrix__cell loopy-data-matrix__cell--active'
}

function hashSeed(value: string): number {
  let hash = 0
  const normalized = String(value || '').trim()
  for (let index = 0; index < normalized.length; index += 1)
    hash = ((hash << 5) - hash) + normalized.charCodeAt(index)
  return Math.abs(hash)
}

const topologyNodeLayout = computed(() => {
  return visuals.value.topology.nodes.map((node, index) => {
    const seed = hashSeed(node.id || `${index}`)
    return {
      ...node,
      x: 40 + ((seed % 1000) / 1000) * 520,
      y: 30 + ((Math.floor(seed / 19) % 1000) / 1000) * 220,
    }
  })
})

const topologyNodeMap = computed(() => {
  return new Map(topologyNodeLayout.value.map(node => [node.id, node]))
})

function resolveTopologyNode(id: string): (ProjectKnowledgeIndexTopologyNode & { x: number, y: number }) | null {
  return topologyNodeMap.value.get(id) || null
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
</script>

<template>
  <div
    data-testid="workspace-project-knowledge-index"
    class="space-y-5"
  >
    <div class="loopy-data-hero">
      <div class="loopy-data-hero__content">
        <span :class="healthBadgeClass">
          {{ healthBadgeLabel }}
        </span>
        <h2 class="loopy-data-hero__title">
          {{ diagnostics.healthMessage }}
        </h2>
        <p class="loopy-data-hero__subtitle">
          如果当前没有真实索引，这里会直接说明是缺少 embedding runtime、worker 不工作、只有 fallback，还是根本还没产出 chunk。
        </p>

        <div class="loopy-data-hero__meta">
          <span class="loopy-data-pill">
            <span class="material-symbols-outlined text-[14px]">memory</span>
            {{ runtimeLabel }}
          </span>
          <span class="loopy-data-pill">
            <span class="material-symbols-outlined text-[14px]">settings_slow_motion</span>
            {{ workerLabel }}
          </span>
        </div>

        <div class="loopy-data-hero__actions">
          <button
            class="loopy-data-action loopy-data-action--primary"
            type="button"
            :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
            @click="emit('reindexProjectKnowledge', 'all')"
          >
            {{ props.reindexingTarget === 'all' ? '重建中...' : '全量重建' }}
          </button>
          <button
            class="loopy-data-action"
            type="button"
            :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
            @click="emit('reindexProjectKnowledge', 'stale')"
          >
            {{ props.reindexingTarget === 'stale' ? '重建中...' : '重建 stale' }}
          </button>
          <button
            class="loopy-data-action"
            type="button"
            :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
            @click="emit('reindexProjectKnowledge', 'failed')"
          >
            {{ props.reindexingTarget === 'failed' ? '重建中...' : '重建 failed' }}
          </button>
          <button
            class="loopy-data-action"
            type="button"
            :disabled="props.loading"
            @click="emit('reload')"
          >
            刷新诊断
          </button>
        </div>

        <div class="loopy-data-progress">
          <div class="loopy-data-progress__header">
            <span>整体进度</span>
            <span>{{ formatProgressPercent(summary.overallProgressPercent) }}</span>
          </div>
          <div class="loopy-data-progress__track">
            <div class="loopy-data-progress__fill" :style="{ width: formatProgressPercent(summary.overallProgressPercent) }" />
          </div>
          <div class="loopy-data-progress__meta">
            <span>预计剩余 {{ formatEtaSeconds(summary.etaSeconds) }}</span>
            <span>预计完成 {{ formatDateTime(String(summary.estimatedFinishedAt || '')) }}</span>
            <span>最近刷新 {{ formatDateTime(String(summary.lastRefreshedAt || '')) }}</span>
          </div>
        </div>
      </div>

      <WorkspaceLoopyDataStarfield
        class="min-h-[380px]"
        :nodes="visuals.starfieldNodes"
        :health-message="diagnostics.healthMessage"
      />
    </div>

    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <article
        v-for="card in summaryCards"
        :key="card.label"
        class="loopy-data-summary-card"
      >
        <div class="loopy-data-summary-card__label">
          {{ card.label }}
        </div>
        <div class="loopy-data-summary-card__value">
          {{ card.value }}
        </div>
      </article>
    </div>

    <section
      v-if="props.loading"
      class="loopy-data-message"
    >
      正在加载 Loopy 数据诊断...
    </section>

    <section
      v-else-if="!hasActiveProject"
      class="loopy-data-message"
    >
      当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
    </section>

    <section
      v-else-if="props.error"
      class="loopy-data-message loopy-data-message--error"
    >
      {{ props.error }}
    </section>

    <template v-else>
      <section class="loopy-data-issues">
        <article
          v-for="issue in diagnostics.issues"
          :key="issue.code"
          class="loopy-data-issue"
          :class="issue.severity === 'error' ? 'loopy-data-issue--error' : issue.severity === 'warning' ? 'loopy-data-issue--warning' : 'loopy-data-issue--info'"
        >
          <span class="material-symbols-outlined text-[16px]">
            {{ issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info' }}
          </span>
          <span>{{ issue.message }}</span>
        </article>
      </section>

      <div class="loopy-data-chart-grid">
        <section class="loopy-data-chart-card">
          <div class="loopy-data-chart-card__header">
            <h3>阶段漏斗</h3>
            <span>{{ visuals.stageFunnel.length }} 个阶段</span>
          </div>
          <div class="space-y-3">
            <div v-for="item in visuals.stageFunnel" :key="item.label" class="loopy-data-bar-row">
              <div class="loopy-data-bar-row__label">
                {{ item.label }}
              </div>
              <div class="loopy-data-bar-row__track">
                <div class="loopy-data-bar-row__fill loopy-data-bar-row__fill--blue" :style="{ width: `${(item.count / stageFunnelMax) * 100}%` }" />
              </div>
              <div class="loopy-data-bar-row__value">
                {{ item.count }}
              </div>
            </div>
          </div>
        </section>

        <section class="loopy-data-chart-card">
          <div class="loopy-data-chart-card__header">
            <h3>最近任务趋势</h3>
            <span>{{ visuals.taskTrend.length }} 天</span>
          </div>
          <div v-if="visuals.taskTrend.length > 0" class="loopy-data-trend">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="loopy-data-trend__svg">
              <polyline class="loopy-data-trend__line loopy-data-trend__line--all" :points="taskTrendPolyline" />
              <polyline class="loopy-data-trend__line loopy-data-trend__line--success" :points="taskTrendSucceededPolyline" />
              <polyline class="loopy-data-trend__line loopy-data-trend__line--failed" :points="taskTrendFailedPolyline" />
            </svg>
            <div class="loopy-data-trend__legend">
              <span>总任务</span>
              <span>成功</span>
              <span>失败</span>
            </div>
            <div class="loopy-data-trend__ticks">
              <span v-for="item in visuals.taskTrend" :key="item.day">{{ item.day.slice(5) }}</span>
            </div>
          </div>
          <div v-else class="loopy-data-empty">
            暂无任务趋势数据。
          </div>
        </section>

        <section class="loopy-data-chart-card">
          <div class="loopy-data-chart-card__header">
            <h3>失败原因排行</h3>
            <span>{{ visuals.failureReasons.length }} 条</span>
          </div>
          <div v-if="visuals.failureReasons.length > 0" class="space-y-3">
            <div v-for="item in visuals.failureReasons" :key="item.label" class="loopy-data-bar-row">
              <div class="loopy-data-bar-row__label loopy-data-bar-row__label--wide">
                {{ item.label }}
              </div>
              <div class="loopy-data-bar-row__track">
                <div class="loopy-data-bar-row__fill loopy-data-bar-row__fill--rose" :style="{ width: `${(item.count / failureReasonMax) * 100}%` }" />
              </div>
              <div class="loopy-data-bar-row__value">
                {{ item.count }}
              </div>
            </div>
          </div>
          <div v-else class="loopy-data-empty">
            当前没有失败任务。
          </div>
        </section>

        <section class="loopy-data-chart-card">
          <div class="loopy-data-chart-card__header">
            <h3>资源类型占比</h3>
            <span>{{ visuals.resourceKindDistribution.length }} 类</span>
          </div>
          <div class="space-y-3">
            <div v-for="item in visuals.resourceKindDistribution" :key="item.label" class="loopy-data-bar-row">
              <div class="loopy-data-bar-row__label">
                {{ item.label }}
              </div>
              <div class="loopy-data-bar-row__track">
                <div class="loopy-data-bar-row__fill loopy-data-bar-row__fill--emerald" :style="{ width: `${(item.count / resourceKindMax) * 100}%` }" />
              </div>
              <div class="loopy-data-bar-row__value">
                {{ item.count }}
              </div>
            </div>
          </div>
        </section>

        <section class="loopy-data-chart-card">
          <div class="loopy-data-chart-card__header">
            <h3>索引产出构成</h3>
            <span>{{ visuals.embeddingComposition.length }} 类</span>
          </div>
          <div class="space-y-3">
            <div v-for="item in visuals.embeddingComposition" :key="item.label" class="loopy-data-bar-row">
              <div class="loopy-data-bar-row__label">
                {{ item.label }}
              </div>
              <div class="loopy-data-bar-row__track">
                <div class="loopy-data-bar-row__fill loopy-data-bar-row__fill--amber" :style="{ width: `${(item.count / embeddingCompositionMax) * 100}%` }" />
              </div>
              <div class="loopy-data-bar-row__value">
                {{ item.count }}
              </div>
            </div>
          </div>
        </section>

        <section class="loopy-data-chart-card">
          <div class="loopy-data-chart-card__header">
            <h3>Chunk Kind 分布</h3>
            <span>{{ visuals.chunkKindDistribution.length }} 类</span>
          </div>
          <div class="space-y-3">
            <div v-for="item in visuals.chunkKindDistribution" :key="item.label" class="loopy-data-bar-row">
              <div class="loopy-data-bar-row__label">
                {{ item.label }}
              </div>
              <div class="loopy-data-bar-row__track">
                <div class="loopy-data-bar-row__fill loopy-data-bar-row__fill--cyan" :style="{ width: `${(item.count / chunkKindMax) * 100}%` }" />
              </div>
              <div class="loopy-data-bar-row__value">
                {{ item.count }}
              </div>
            </div>
          </div>
        </section>

        <section class="loopy-data-chart-card loopy-data-chart-card--wide">
          <div class="loopy-data-chart-card__header">
            <h3>资源状态矩阵</h3>
            <span>{{ visuals.resourceStatusMatrix.resourceKinds.length }} x {{ visuals.resourceStatusMatrix.statuses.length }}</span>
          </div>
          <div class="loopy-data-matrix">
            <div class="loopy-data-matrix__corner" />
            <div
              v-for="status in visuals.resourceStatusMatrix.statuses"
              :key="`status-${status}`"
              class="loopy-data-matrix__header"
            >
              {{ knowledgeStatusLabel(status) }}
            </div>
            <template v-for="resourceKind in visuals.resourceStatusMatrix.resourceKinds" :key="`row-${resourceKind}`">
              <div class="loopy-data-matrix__header loopy-data-matrix__header--side">
                {{ resourceKind }}
              </div>
              <div
                v-for="status in visuals.resourceStatusMatrix.statuses"
                :key="`${resourceKind}-${status}`"
                :class="matrixCellClass(resourceKind, status)"
              >
                {{ resolveMatrixCellCount(resourceKind, status) }}
              </div>
            </template>
          </div>
        </section>

        <section class="loopy-data-chart-card loopy-data-chart-card--wide">
          <div class="loopy-data-chart-card__header">
            <h3>项目资源拓扑</h3>
            <span>{{ visuals.topology.nodes.length }} 节点</span>
          </div>
          <div class="loopy-data-topology">
            <svg viewBox="0 0 600 280" class="loopy-data-topology__svg">
              <line
                v-for="link in visuals.topology.links"
                :key="`${link.sourceId}-${link.targetId}`"
                :x1="resolveTopologyNode(link.sourceId)?.x || 0"
                :y1="resolveTopologyNode(link.sourceId)?.y || 0"
                :x2="resolveTopologyNode(link.targetId)?.x || 0"
                :y2="resolveTopologyNode(link.targetId)?.y || 0"
                class="loopy-data-topology__link"
              />
              <g v-for="node in topologyNodeLayout" :key="node.id" :transform="`translate(${node.x}, ${node.y})`">
                <circle
                  :r="node.nodeType === 'binding' ? 7 : Math.max(8, Math.min(18, 6 + node.size * 1.8))"
                  :class="node.nodeType === 'binding'
                    ? 'loopy-data-topology__node loopy-data-topology__node--binding'
                    : node.fallbackOnly
                      ? 'loopy-data-topology__node loopy-data-topology__node--fallback'
                      : node.status === 'ready'
                        ? 'loopy-data-topology__node loopy-data-topology__node--ready'
                        : node.status === 'failed'
                          ? 'loopy-data-topology__node loopy-data-topology__node--failed'
                          : 'loopy-data-topology__node loopy-data-topology__node--active'"
                />
                <text class="loopy-data-topology__label" x="12" y="4">
                  {{ node.label }}
                </text>
              </g>
            </svg>
          </div>
        </section>
      </div>

      <div class="grid gap-4 xl:grid-cols-3">
        <section class="loopy-data-list-card">
          <div class="loopy-data-list-card__header">
            <h3>正在处理</h3>
            <span>{{ currentDashboard.processing.length }} 项</span>
          </div>
          <div class="space-y-2">
            <article
              v-for="source in currentDashboard.processing"
              :key="source.id"
              class="loopy-data-list-card__item"
            >
              <div class="text-xs text-slate-800 font-semibold truncate" :title="source.resourceTitle">
                {{ source.resourceTitle }}
              </div>
              <div class="text-xs text-slate-500 mt-1">
                {{ knowledgeStageLabel(source.currentStage || source.status) }} · {{ formatProgressPercent(source.progressPercent) }} · ETA {{ formatDurationLabel(source.etaSeconds) }}
              </div>
            </article>
            <div v-if="currentDashboard.processing.length === 0" class="loopy-data-empty">
              当前没有正在处理的索引任务。
            </div>
          </div>
        </section>

        <section class="loopy-data-list-card">
          <div class="loopy-data-list-card__header">
            <h3>最近完成</h3>
            <span>{{ currentDashboard.recentCompleted.length }} 项</span>
          </div>
          <div class="space-y-2">
            <article
              v-for="source in currentDashboard.recentCompleted"
              :key="source.id"
              class="loopy-data-list-card__item"
            >
              <div class="text-xs text-slate-800 font-semibold truncate" :title="source.resourceTitle">
                {{ source.resourceTitle }}
              </div>
              <div class="text-xs text-slate-500 mt-1">
                完成于 {{ formatDateTime(String(source.lastIndexedAt || '')) }} · Chunk {{ source.chunkIndexed || source.chunkTotal || 0 }}
              </div>
            </article>
            <div v-if="currentDashboard.recentCompleted.length === 0" class="loopy-data-empty">
              暂无最近完成记录。
            </div>
          </div>
        </section>

        <section class="loopy-data-list-card" data-testid="workspace-project-knowledge-failed-list">
          <div class="loopy-data-list-card__header">
            <h3>失败项</h3>
            <span>{{ currentDashboard.failed.length }} 项</span>
          </div>
          <div class="space-y-2">
            <article
              v-for="source in currentDashboard.failed"
              :key="source.id"
              class="loopy-data-list-card__item loopy-data-list-card__item--failed"
            >
              <div class="flex gap-3 items-start justify-between">
                <div class="min-w-0">
                  <div class="text-xs text-rose-700 font-semibold truncate" :title="source.resourceTitle">
                    {{ source.resourceTitle }}
                  </div>
                  <div class="text-xs text-rose-600 mt-1">
                    {{ knowledgeStageLabel(source.lastErrorStage || source.currentStage || source.status) }} · {{ resolveSourceError(source) }}
                  </div>
                </div>
                <button
                  class="loopy-data-inline-action loopy-data-inline-action--danger"
                  type="button"
                  :disabled="!source.sourceResourceId || props.retryingSourceId === source.sourceResourceId"
                  @click="emit('reindexProjectKnowledgeSource', source.sourceResourceId || '')"
                >
                  {{ props.retryingSourceId === source.sourceResourceId ? '重试中...' : '重试' }}
                </button>
              </div>
            </article>
            <div v-if="currentDashboard.failed.length === 0" class="loopy-data-empty">
              当前没有失败项。
            </div>
          </div>
        </section>
      </div>

      <section
        class="loopy-data-table-card"
        data-testid="workspace-project-knowledge-source-table"
      >
        <div class="loopy-data-table-card__header">
          <h3>完整状态表</h3>
          <span>{{ currentDashboard.sources.length }} 条</span>
        </div>
        <div class="overflow-x-auto">
          <table class="loopy-data-table">
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
                <td>
                  <div class="text-slate-700 font-medium max-w-[220px] truncate" :title="source.resourceTitle">
                    {{ source.resourceTitle }}
                  </div>
                </td>
                <td>{{ knowledgeStatusLabel(source.status) }}</td>
                <td>{{ knowledgeStageLabel(source.currentStage || source.status) }}</td>
                <td>{{ formatProgressPercent(source.progressPercent) }}</td>
                <td>{{ formatDurationLabel(source.etaSeconds) }}</td>
                <td>{{ source.chunkIndexed || source.chunkTotal || 0 }}</td>
                <td>{{ formatDateTime(String(source.lastIndexedAt || '')) }}</td>
                <td class="max-w-[220px]">
                  <span class="line-clamp-2" :title="resolveSourceError(source)">
                    {{ source.status === 'failed' ? resolveSourceError(source) : '-' }}
                  </span>
                </td>
                <td class="text-right">
                  <button
                    class="loopy-data-inline-action"
                    type="button"
                    :disabled="!source.sourceResourceId || props.retryingSourceId === source.sourceResourceId"
                    @click="emit('reindexProjectKnowledgeSource', source.sourceResourceId || '')"
                  >
                    {{ props.retryingSourceId === source.sourceResourceId ? '处理中...' : '重新索引' }}
                  </button>
                </td>
              </tr>
              <tr v-if="currentDashboard.sources.length === 0">
                <td colspan="9" class="text-center text-slate-500 py-6">
                  当前项目暂无知识索引源。
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
.loopy-data-hero {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
}

.loopy-data-hero__content {
  border: 1px solid #dbe7f3;
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(73, 164, 255, 0.14), transparent 34%),
    linear-gradient(160deg, #ffffff 0%, #f7fbff 52%, #f4f9ff 100%);
  padding: 28px;
  box-shadow: 0 18px 44px rgba(34, 78, 140, 0.08);
}

.loopy-data-health-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.loopy-data-health-badge--ready {
  background: #eafbf3;
  color: #0f8a57;
}

.loopy-data-health-badge--warning {
  background: #fff6e3;
  color: #a16207;
}

.loopy-data-health-badge--error {
  background: #fff0f0;
  color: #b45309;
}

.loopy-data-health-badge--idle {
  background: #eef5ff;
  color: #436487;
}

.loopy-data-hero__title {
  margin: 16px 0 0;
  color: #13253d;
  font-size: 30px;
  line-height: 1.14;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.loopy-data-hero__subtitle {
  margin: 12px 0 0;
  color: #5e7396;
  font-size: 13px;
  line-height: 1.65;
}

.loopy-data-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.loopy-data-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #dbe7f3;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #365072;
  font-size: 12px;
  font-weight: 600;
}

.loopy-data-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

.loopy-data-action {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #d6e4f3;
  border-radius: 999px;
  background: #ffffff;
  color: #355274;
  font-size: 12px;
  font-weight: 700;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.loopy-data-action:hover {
  background: #f2f8ff;
}

.loopy-data-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.loopy-data-action--primary {
  border-color: #0d2d4c;
  background: #0f2235;
  color: #f9fcff;
}

.loopy-data-action--primary:hover {
  background: #18304a;
}

.loopy-data-progress {
  margin-top: 22px;
  border: 1px solid #d8e5f2;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.72);
  padding: 16px;
}

.loopy-data-progress__header,
.loopy-data-progress__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #567092;
  font-size: 12px;
}

.loopy-data-progress__header {
  color: #203655;
  font-weight: 700;
}

.loopy-data-progress__track {
  height: 9px;
  margin-top: 10px;
  border-radius: 999px;
  background: #dfebf8;
  overflow: hidden;
}

.loopy-data-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #41a6ff, #76f0ff);
}

.loopy-data-progress__meta {
  margin-top: 12px;
}

.loopy-data-summary-card,
.loopy-data-chart-card,
.loopy-data-list-card,
.loopy-data-table-card,
.loopy-data-message {
  border: 1px solid #dbe7f3;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(38, 76, 132, 0.05);
}

.loopy-data-summary-card {
  padding: 16px;
}

.loopy-data-summary-card__label {
  color: #6980a0;
  font-size: 12px;
}

.loopy-data-summary-card__value {
  margin-top: 8px;
  color: #152740;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.loopy-data-message {
  padding: 18px 20px;
  color: #566f91;
  font-size: 13px;
}

.loopy-data-message--error {
  border-color: #f0d2d2;
  background: #fff6f6;
  color: #b45309;
}

.loopy-data-issues {
  display: grid;
  gap: 10px;
}

.loopy-data-issue {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 18px;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
}

.loopy-data-issue--error {
  background: #fff4f4;
  color: #b45309;
}

.loopy-data-issue--warning {
  background: #fff8ea;
  color: #a16207;
}

.loopy-data-issue--info {
  background: #f4f9ff;
  color: #33557c;
}

.loopy-data-chart-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.loopy-data-chart-card {
  padding: 18px;
}

.loopy-data-chart-card--wide {
  grid-column: span 3;
}

.loopy-data-chart-card__header,
.loopy-data-list-card__header,
.loopy-data-table-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.loopy-data-chart-card__header h3,
.loopy-data-list-card__header h3,
.loopy-data-table-card__header h3 {
  margin: 0;
  color: #182c48;
  font-size: 13px;
  font-weight: 800;
}

.loopy-data-chart-card__header span,
.loopy-data-list-card__header span,
.loopy-data-table-card__header span {
  color: #7085a4;
  font-size: 11px;
}

.loopy-data-bar-row {
  display: grid;
  gap: 10px;
  grid-template-columns: 92px minmax(0, 1fr) 28px;
  align-items: center;
}

.loopy-data-bar-row__label {
  color: #536b8c;
  font-size: 11px;
  font-weight: 600;
}

.loopy-data-bar-row__label--wide {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loopy-data-bar-row__track {
  height: 8px;
  border-radius: 999px;
  background: #e6eff8;
  overflow: hidden;
}

.loopy-data-bar-row__fill {
  height: 100%;
  border-radius: 999px;
}

.loopy-data-bar-row__fill--blue {
  background: linear-gradient(90deg, #4995ff, #72cbff);
}

.loopy-data-bar-row__fill--rose {
  background: linear-gradient(90deg, #f47c7c, #ffb0a0);
}

.loopy-data-bar-row__fill--emerald {
  background: linear-gradient(90deg, #4ec7b2, #79ebc9);
}

.loopy-data-bar-row__fill--amber {
  background: linear-gradient(90deg, #f2af36, #ffd67a);
}

.loopy-data-bar-row__fill--cyan {
  background: linear-gradient(90deg, #3cc6ff, #6af2ff);
}

.loopy-data-bar-row__value {
  color: #22324d;
  font-size: 11px;
  font-weight: 700;
  text-align: right;
}

.loopy-data-trend {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.loopy-data-trend__svg {
  width: 100%;
  height: 170px;
  border-radius: 16px;
  background:
    linear-gradient(to top, rgba(71, 132, 223, 0.08) 1px, transparent 1px) 0 0 / 100% 25%,
    linear-gradient(to right, rgba(71, 132, 223, 0.05) 1px, transparent 1px) 0 0 / 12.5% 100%,
    linear-gradient(180deg, #fbfdff 0%, #f3f8ff 100%);
}

.loopy-data-trend__line {
  fill: none;
  stroke-width: 2.4;
  vector-effect: non-scaling-stroke;
}

.loopy-data-trend__line--all {
  stroke: #3b82f6;
}

.loopy-data-trend__line--success {
  stroke: #10b981;
}

.loopy-data-trend__line--failed {
  stroke: #f97316;
}

.loopy-data-trend__legend,
.loopy-data-trend__ticks {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #7085a4;
  font-size: 11px;
}

.loopy-data-matrix {
  display: grid;
  gap: 8px;
  grid-template-columns: 140px repeat(auto-fit, minmax(84px, 1fr));
  align-items: stretch;
}

.loopy-data-matrix__corner,
.loopy-data-matrix__header,
.loopy-data-matrix__cell {
  border-radius: 14px;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px;
  font-size: 11px;
}

.loopy-data-matrix__corner,
.loopy-data-matrix__header {
  background: #f5f9ff;
  color: #546c8f;
  font-weight: 700;
}

.loopy-data-matrix__header--side {
  justify-content: flex-start;
  text-align: left;
}

.loopy-data-matrix__cell--empty {
  background: #f8fbff;
  color: #adc0da;
}

.loopy-data-matrix__cell--ready {
  background: #ebfbf3;
  color: #0f8a57;
  font-weight: 700;
}

.loopy-data-matrix__cell--failed {
  background: #fff1f1;
  color: #b45309;
  font-weight: 700;
}

.loopy-data-matrix__cell--stale {
  background: #fff8ea;
  color: #a16207;
  font-weight: 700;
}

.loopy-data-matrix__cell--active {
  background: #eef6ff;
  color: #2457aa;
  font-weight: 700;
}

.loopy-data-topology {
  overflow: hidden;
  border-radius: 18px;
  background:
    radial-gradient(circle at 20% 18%, rgba(75, 168, 255, 0.12), transparent 34%),
    linear-gradient(155deg, #fbfdff 0%, #f2f7ff 100%);
}

.loopy-data-topology__svg {
  width: 100%;
  height: 280px;
}

.loopy-data-topology__link {
  stroke: rgba(83, 126, 183, 0.28);
  stroke-width: 1.2;
}

.loopy-data-topology__node {
  stroke: rgba(255, 255, 255, 0.9);
  stroke-width: 2;
}

.loopy-data-topology__node--binding {
  fill: #c4d6f1;
}

.loopy-data-topology__node--ready {
  fill: #39caa5;
}

.loopy-data-topology__node--fallback {
  fill: #f2b24a;
}

.loopy-data-topology__node--failed {
  fill: #ea7d7d;
}

.loopy-data-topology__node--active {
  fill: #4ca2ff;
}

.loopy-data-topology__label {
  fill: #385374;
  font-size: 10px;
  font-weight: 600;
}

.loopy-data-list-card {
  padding: 18px;
}

.loopy-data-list-card__item {
  border: 1px solid #dde8f5;
  border-radius: 16px;
  background: #f8fbff;
  padding: 12px 14px;
}

.loopy-data-list-card__item--failed {
  border-color: #f1d3d3;
  background: #fff8f8;
}

.loopy-data-empty {
  color: #7085a4;
  font-size: 12px;
}

.loopy-data-inline-action {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid #d6e4f3;
  border-radius: 999px;
  background: #ffffff;
  color: #355274;
  font-size: 11px;
  font-weight: 700;
}

.loopy-data-inline-action--danger {
  border-color: #efcccc;
  color: #b45309;
}

.loopy-data-inline-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.loopy-data-table-card {
  overflow: hidden;
}

.loopy-data-table-card__header {
  padding: 18px 20px 0;
}

.loopy-data-table {
  min-width: 100%;
  border-collapse: collapse;
  color: #536b8c;
  font-size: 12px;
}

.loopy-data-table thead {
  background: #f7fbff;
}

.loopy-data-table th,
.loopy-data-table td {
  padding: 11px 16px;
  border-top: 1px solid #e0ebf7;
  text-align: left;
  vertical-align: top;
}

.loopy-data-table th {
  color: #6980a0;
  font-weight: 700;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .loopy-data-hero {
    grid-template-columns: 1fr;
  }

  .loopy-data-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .loopy-data-chart-card--wide {
    grid-column: span 2;
  }
}

@media (max-width: 760px) {
  .loopy-data-hero__content {
    padding: 22px;
  }

  .loopy-data-hero__title {
    font-size: 24px;
  }

  .loopy-data-chart-grid {
    grid-template-columns: 1fr;
  }

  .loopy-data-chart-card--wide {
    grid-column: span 1;
  }

  .loopy-data-bar-row {
    grid-template-columns: 84px minmax(0, 1fr) 24px;
  }

  .loopy-data-matrix {
    grid-template-columns: 110px repeat(auto-fit, minmax(70px, 1fr));
  }
}
</style>
