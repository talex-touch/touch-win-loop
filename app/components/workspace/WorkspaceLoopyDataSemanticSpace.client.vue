<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type {
  ApiResponse,
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeSemanticCluster,
  ProjectKnowledgeSemanticLayoutPayload,
  ProjectKnowledgeSemanticPoint,
} from '~~/shared/types/domain'
import { useApiEndpoint } from '~/composables/useApiEndpoint'

interface PlotPoint extends ProjectKnowledgeSemanticPoint {
  plotX: number
  plotY: number
  radius: number
  color: string
}

interface PlotCluster extends ProjectKnowledgeSemanticCluster {
  plotX: number
  plotY: number
  color: string
  haloRadius: number
}

const props = withDefaults(defineProps<{
  projectId?: string
  dashboard?: ProjectKnowledgeIndexDashboard | null
}>(), {
  projectId: '',
  dashboard: null,
})

const { endpoint } = useApiEndpoint()

const VIEWBOX_WIDTH = 980
const VIEWBOX_HEIGHT = 620
const PLOT_PADDING_X = 68
const PLOT_PADDING_Y = 54

const loading = ref(false)
const error = ref('')
const payload = ref<ProjectKnowledgeSemanticLayoutPayload | null>(null)
const hoveredPointId = ref('')
const selectedPointId = ref('')

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveAlgorithmLabel(value?: string | null): string {
  return String(value || '').trim().toLowerCase() === 'pca3d' ? 'PCA' : 'UMAP'
}

function resolveClusterColor(index: number, total: number): string {
  const safeTotal = Math.max(1, total)
  const ratio = safeTotal <= 1 ? 0.5 : index / (safeTotal - 1)
  const hue = 252 - (ratio * 56)
  const saturation = 88 - (ratio * 8)
  const lightness = 62 + (ratio * 12)
  return `hsl(${hue.toFixed(0)} ${saturation.toFixed(0)}% ${lightness.toFixed(0)}%)`
}

function resolvePointOpacity(point: ProjectKnowledgeSemanticPoint): number {
  if (point.embeddingStatus === 'native')
    return 0.92
  if (point.embeddingStatus === 'derived')
    return 0.76
  if (point.embeddingStatus === 'fallback')
    return 0.52
  if (point.embeddingStatus === 'failed')
    return 0.28
  return 0.2
}

function formatSimilarity(value: number): string {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized <= 0)
    return '0.00'
  return normalized.toFixed(2)
}

function resolveDensityLabel(value: number): string {
  if (value >= 0.78)
    return '高'
  if (value >= 0.52)
    return '中'
  return '低'
}

function clearActivePoint(): void {
  hoveredPointId.value = ''
  selectedPointId.value = ''
}

function handlePointEnter(pointId: string): void {
  if (selectedPointId.value)
    return
  hoveredPointId.value = pointId
}

function handlePointLeave(): void {
  if (selectedPointId.value)
    return
  hoveredPointId.value = ''
}

function handlePointSelect(pointId: string): void {
  const nextSelected = selectedPointId.value === pointId ? '' : pointId
  selectedPointId.value = nextSelected
  hoveredPointId.value = nextSelected
}

const clusterIndexMap = computed(() => {
  return new Map((payload.value?.clusters || []).map((cluster, index) => [cluster.id, index + 1]))
})

const clusterMap = computed(() => {
  return new Map((payload.value?.clusters || []).map(cluster => [cluster.id, cluster]))
})

const chartBounds = computed(() => {
  const points = payload.value?.points || []
  if (points.length === 0) {
    return {
      minX: -1,
      maxX: 1,
      minY: -1,
      maxY: 1,
    }
  }

  const valuesX = points.map(point => point.x)
  const valuesY = points.map(point => point.y)
  const rawMinX = Math.min(...valuesX)
  const rawMaxX = Math.max(...valuesX)
  const rawMinY = Math.min(...valuesY)
  const rawMaxY = Math.max(...valuesY)
  const rangeX = Math.max(1, rawMaxX - rawMinX)
  const rangeY = Math.max(1, rawMaxY - rawMinY)
  const paddingX = rangeX * 0.08
  const paddingY = rangeY * 0.08

  return {
    minX: rawMinX - paddingX,
    maxX: rawMaxX + paddingX,
    minY: rawMinY - paddingY,
    maxY: rawMaxY + paddingY,
  }
})

function projectPointX(value: number): number {
  const width = VIEWBOX_WIDTH - (PLOT_PADDING_X * 2)
  const minX = chartBounds.value.minX
  const maxX = chartBounds.value.maxX
  const ratio = (value - minX) / Math.max(maxX - minX, 1)
  return PLOT_PADDING_X + (clampNumber(ratio, 0, 1) * width)
}

function projectPointY(value: number): number {
  const height = VIEWBOX_HEIGHT - (PLOT_PADDING_Y * 2)
  const minY = chartBounds.value.minY
  const maxY = chartBounds.value.maxY
  const ratio = (value - minY) / Math.max(maxY - minY, 1)
  return VIEWBOX_HEIGHT - PLOT_PADDING_Y - (clampNumber(ratio, 0, 1) * height)
}

const plotClusters = computed<PlotCluster[]>(() => {
  const clusters = payload.value?.clusters || []
  return clusters.map((cluster, index) => ({
    ...cluster,
    plotX: projectPointX(cluster.centroid.x),
    plotY: projectPointY(cluster.centroid.y),
    color: resolveClusterColor(index, clusters.length),
    haloRadius: clampNumber(40 + (Math.sqrt(cluster.nodeCount || 1) * 3.6), 52, 128),
  }))
})

const clusterColorMap = computed(() => {
  return new Map(plotClusters.value.map(cluster => [cluster.id, cluster.color]))
})

const plotPoints = computed<PlotPoint[]>(() => {
  return (payload.value?.points || []).map((point) => {
    return {
      ...point,
      plotX: projectPointX(point.x),
      plotY: projectPointY(point.y),
      radius: clampNumber(1.2 + (point.importance * 0.16), 1.6, 4.2),
      color: clusterColorMap.value.get(point.clusterId) || resolveClusterColor(0, 1),
    }
  })
})

const plotPointMap = computed(() => {
  return new Map(plotPoints.value.map(point => [point.id, point]))
})

const activePlotPoint = computed(() => {
  return plotPointMap.value.get(selectedPointId.value || hoveredPointId.value) || null
})

const activeCluster = computed(() => {
  if (!activePlotPoint.value)
    return null
  return clusterMap.value.get(activePlotPoint.value.clusterId) || null
})

const tooltipStyle = computed<CSSProperties>(() => {
  if (!activePlotPoint.value)
    return {}

  const leftPercent = clampNumber((activePlotPoint.value.plotX / VIEWBOX_WIDTH) * 100, 10, 90)
  const topPercent = clampNumber((activePlotPoint.value.plotY / VIEWBOX_HEIGHT) * 100, 12, 88)
  const placeLeft = leftPercent > 68

  return {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    transform: placeLeft ? 'translate(calc(-100% - 16px), -50%)' : 'translate(16px, -50%)',
  }
})

const algorithmLabel = computed(() => resolveAlgorithmLabel(payload.value?.layout?.algorithm))

const embeddingDimensionLabel = computed(() => {
  const dimensions = Math.max(0, Math.round(Number(props.dashboard?.runtime.embeddingDimensions || 0)))
  return `${dimensions} 维`
})

const metricCards = computed(() => {
  const summary = payload.value?.summary
  return [
    {
      label: '聚类数',
      value: (summary?.clusterCount || 0).toLocaleString('zh-CN'),
    },
    {
      label: '点数量',
      value: (summary?.pointCount || 0).toLocaleString('zh-CN'),
    },
    {
      label: '平均相似度',
      value: formatSimilarity(summary?.averageSimilarity || 0),
    },
    {
      label: '最大相似度',
      value: formatSimilarity(summary?.maxSimilarity || 0),
    },
  ]
})

async function loadLayout(): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  if (!projectId) {
    payload.value = null
    clearActivePoint()
    return
  }

  loading.value = true
  error.value = ''
  clearActivePoint()

  try {
    const query = new URLSearchParams({
      layoutType: 'chunk_space',
      level: 'chunk',
    })
    const response = await unsafeFetch<ApiResponse<ProjectKnowledgeSemanticLayoutPayload>>(
      `${endpoint(`/projects/${projectId}/knowledge/semantic-layout`)}?${query.toString()}`,
    )
    payload.value = response.data || null
  }
  catch (fetchError: any) {
    payload.value = null
    error.value = String(fetchError?.data?.message || '加载语义空间失败，请稍后重试。').trim() || '加载语义空间失败，请稍后重试。'
  }
  finally {
    loading.value = false
  }
}

watch(() => props.projectId, () => {
  void loadLayout()
}, { immediate: true })
</script>

<template>
  <section class="loopy-embedding" data-testid="workspace-loopy-semantic-space">
    <header class="loopy-embedding__header">
      <div class="loopy-embedding__title-wrap">
        <div class="loopy-embedding__title-row">
          <h3>Embedding 空间分布</h3>
          <span class="material-symbols-outlined loopy-embedding__title-icon">help</span>
        </div>
        <p class="loopy-embedding__subtitle">
          真实向量经降维后形成的聚类分布，悬停即可查看当前簇的数量、密度、主题和相似度。
        </p>
      </div>

      <div class="loopy-embedding__controls">
        <button type="button" class="loopy-embedding__control" disabled aria-disabled="true">
          <span>{{ algorithmLabel }}</span>
          <span class="material-symbols-outlined">expand_more</span>
        </button>
        <button type="button" class="loopy-embedding__control" disabled aria-disabled="true">
          <span>{{ embeddingDimensionLabel }}</span>
          <span class="material-symbols-outlined">expand_more</span>
        </button>
      </div>
    </header>

    <div
      v-if="payload && payload.layout && payload.summary.pointCount > 0"
      class="loopy-embedding__meta"
    >
      <span>布局状态 {{ payload.layout.status === 'degraded' ? '轻度退化' : '已就绪' }}</span>
      <span>已显示 {{ payload.selectionSummary.returnedPoints.toLocaleString('zh-CN') }} / {{ payload.summary.pointCount.toLocaleString('zh-CN') }}</span>
      <span>最近刷新 {{ payload.layout.updatedAt || payload.analytics.semanticLayoutUpdatedAt || '-' }}</span>
    </div>

    <div v-if="loading" class="loopy-embedding__empty">
      正在计算 Embedding 空间分布...
    </div>
    <div v-else-if="error" class="loopy-embedding__empty loopy-embedding__empty--error">
      {{ error }}
    </div>
    <div v-else-if="!payload || !payload.layout || plotPoints.length === 0" class="loopy-embedding__empty">
      当前还没有可用的 Embedding 空间分布。
    </div>
    <div
      v-else
      class="loopy-embedding__chart-shell"
      data-testid="workspace-loopy-semantic-space-chart"
      @click="clearActivePoint"
    >
      <div class="loopy-embedding__chart-glow loopy-embedding__chart-glow--left" />
      <div class="loopy-embedding__chart-glow loopy-embedding__chart-glow--right" />

      <svg
        class="loopy-embedding__chart"
        :viewBox="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`"
        role="img"
        aria-label="Embedding 空间分布散点图"
        @click="clearActivePoint"
      >
        <g class="loopy-embedding__halos">
          <circle
            v-for="cluster in plotClusters"
            :key="`halo-${cluster.id}`"
            :cx="cluster.plotX"
            :cy="cluster.plotY"
            :r="cluster.haloRadius"
            :fill="cluster.color"
            fill-opacity="0.14"
          />
        </g>

        <g class="loopy-embedding__points">
          <circle
            v-for="point in plotPoints"
            :key="point.id"
            :cx="point.plotX"
            :cy="point.plotY"
            :r="point.radius"
            :fill="point.color"
            :fill-opacity="resolvePointOpacity(point)"
            class="loopy-embedding__point"
            :class="{ 'is-active': activePlotPoint?.id === point.id }"
            @mouseenter.stop="handlePointEnter(point.id)"
            @mouseleave.stop="handlePointLeave"
            @click.stop="handlePointSelect(point.id)"
          />
        </g>

        <g v-if="activePlotPoint" class="loopy-embedding__focus">
          <circle
            :cx="activePlotPoint.plotX"
            :cy="activePlotPoint.plotY"
            :r="activePlotPoint.radius + 8"
            :stroke="activePlotPoint.color"
            stroke-width="1.6"
            fill="none"
            stroke-opacity="0.9"
          />
          <circle
            :cx="activePlotPoint.plotX"
            :cy="activePlotPoint.plotY"
            :r="activePlotPoint.radius + 13"
            :stroke="activePlotPoint.color"
            stroke-width="1"
            fill="none"
            stroke-opacity="0.24"
          />
        </g>
      </svg>

      <div
        v-if="activeCluster && activePlotPoint"
        class="loopy-embedding__tooltip"
        :style="tooltipStyle"
        @click.stop
      >
        <div class="loopy-embedding__tooltip-title">
          Cluster #{{ clusterIndexMap.get(activeCluster.id) || 1 }}
        </div>

        <div class="loopy-embedding__tooltip-grid">
          <div class="loopy-embedding__tooltip-row">
            <span>数量</span>
            <strong>{{ activeCluster.nodeCount.toLocaleString('zh-CN') }}</strong>
          </div>
          <div class="loopy-embedding__tooltip-row">
            <span>密度</span>
            <strong>{{ resolveDensityLabel(activeCluster.densityScore) }}</strong>
          </div>
          <div class="loopy-embedding__tooltip-row">
            <span>主题</span>
            <strong>{{ activeCluster.topicLabel || '未分类主题' }}</strong>
          </div>
          <div class="loopy-embedding__tooltip-row">
            <span>相似度</span>
            <strong>{{ formatSimilarity(activeCluster.similarityScore) }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="loopy-embedding__metrics">
      <article
        v-for="card in metricCards"
        :key="card.label"
        class="loopy-embedding__metric-card"
      >
        <strong>{{ card.value }}</strong>
        <span>{{ card.label }}</span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.loopy-embedding {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid #dce7f4;
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(126, 95, 255, 0.08), transparent 28%),
    radial-gradient(circle at top right, rgba(108, 212, 255, 0.12), transparent 34%),
    linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  padding: 18px;
  box-shadow: 0 14px 32px rgba(36, 73, 125, 0.06);
}

.loopy-embedding__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.loopy-embedding__title-wrap {
  min-width: 0;
}

.loopy-embedding__title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.loopy-embedding__title-row h3 {
  margin: 0;
  color: #1b2e49;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.loopy-embedding__title-icon {
  color: #91a3bf;
  font-size: 18px;
}

.loopy-embedding__subtitle {
  margin: 10px 0 0;
  color: #607694;
  font-size: 13px;
  line-height: 1.7;
}

.loopy-embedding__controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.loopy-embedding__control {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid #dbe7f3;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  color: #33506f;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
  cursor: default;
}

.loopy-embedding__control .material-symbols-outlined {
  color: #7f93ac;
  font-size: 18px;
}

.loopy-embedding__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  color: #6d82a1;
  font-size: 12px;
}

.loopy-embedding__chart-shell,
.loopy-embedding__empty {
  position: relative;
  overflow: hidden;
  min-height: 560px;
  border: 1px solid #dce7f4;
  border-radius: 24px;
  background:
    radial-gradient(circle at 50% 44%, rgba(255, 255, 255, 0.96), rgba(245, 249, 255, 0.98)),
    linear-gradient(180deg, #fbfdff 0%, #f4f8ff 100%);
}

.loopy-embedding__chart-glow {
  position: absolute;
  width: 280px;
  height: 280px;
  border-radius: 999px;
  filter: blur(28px);
  opacity: 0.45;
  pointer-events: none;
}

.loopy-embedding__chart-glow--left {
  left: -24px;
  top: 88px;
  background: rgba(124, 102, 255, 0.18);
}

.loopy-embedding__chart-glow--right {
  right: 18px;
  top: 56px;
  background: rgba(100, 210, 255, 0.2);
}

.loopy-embedding__chart {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 560px;
}

.loopy-embedding__point {
  cursor: pointer;
  transition:
    transform 120ms ease,
    fill-opacity 120ms ease,
    opacity 120ms ease;
}

.loopy-embedding__point.is-active {
  fill-opacity: 1;
}

.loopy-embedding__tooltip {
  position: absolute;
  z-index: 3;
  width: min(248px, calc(100% - 28px));
  padding: 18px 18px 16px;
  border: 1px solid rgba(225, 232, 242, 0.98);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 20px 40px rgba(48, 76, 122, 0.14);
  backdrop-filter: blur(18px);
}

.loopy-embedding__tooltip-title {
  color: #213551;
  font-size: 18px;
  font-weight: 800;
}

.loopy-embedding__tooltip-grid {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

.loopy-embedding__tooltip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #6d84a3;
  font-size: 13px;
}

.loopy-embedding__tooltip-row strong {
  color: #1d324e;
  font-size: 14px;
  font-weight: 700;
  text-align: right;
}

.loopy-embedding__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7084a1;
  font-size: 13px;
}

.loopy-embedding__empty--error {
  color: #b45309;
}

.loopy-embedding__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.loopy-embedding__metric-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 108px;
  padding: 18px 18px 16px;
  border: 1px solid #dce7f4;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
}

.loopy-embedding__metric-card strong {
  color: #1d304c;
  font-size: 36px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.loopy-embedding__metric-card span {
  color: #7085a3;
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 1200px) {
  .loopy-embedding__header {
    flex-direction: column;
  }

  .loopy-embedding__controls {
    width: 100%;
  }

  .loopy-embedding__control {
    flex: 1 1 0;
    justify-content: space-between;
  }

  .loopy-embedding__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .loopy-embedding {
    padding: 14px;
  }

  .loopy-embedding__title-row h3 {
    font-size: 24px;
  }

  .loopy-embedding__chart-shell,
  .loopy-embedding__empty {
    min-height: 420px;
  }

  .loopy-embedding__chart {
    height: 420px;
  }

  .loopy-embedding__tooltip {
    width: min(220px, calc(100% - 24px));
    padding: 16px;
  }

  .loopy-embedding__metric-card strong {
    font-size: 30px;
  }
}

@media (max-width: 560px) {
  .loopy-embedding__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
