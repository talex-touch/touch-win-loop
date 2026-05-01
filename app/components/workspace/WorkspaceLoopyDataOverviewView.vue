<script setup lang="ts">
import type { Project, ProjectKnowledgeIndexDashboard } from '~~/shared/types/domain'
import {
  buildLoopyOverviewContract,
  clampPercent,
  formatCompactNumber,
  formatPercent,
  resolveHealthLabel,
  resolveHealthTone,
} from '~/utils/loopy-data-center'
import { formatWorkspaceDateTime as formatDateTime, formatEtaSeconds } from '~/utils/workspace-main-panel-formatters'

type ProjectKnowledgeReindexTarget = 'all' | 'stale' | 'failed'

const props = withDefaults(defineProps<{
  activeProject?: Project | null
  activeProjectId?: string
  dashboard?: ProjectKnowledgeIndexDashboard | null
  loading?: boolean
  error?: string
  reindexingTarget?: ProjectKnowledgeReindexTarget | ''
}>(), {
  activeProject: null,
  activeProjectId: '',
  dashboard: null,
  loading: false,
  error: '',
  reindexingTarget: '',
})

const emit = defineEmits<{
  reload: []
  reindexProjectKnowledge: [target: ProjectKnowledgeReindexTarget]
}>()

const projectTitle = computed(() => {
  const normalized = String(props.activeProject?.title || '').trim()
  return normalized || '当前项目'
})

const hasActiveProject = computed(() => Boolean(props.activeProject?.id || props.activeProjectId))
const overview = computed(() => props.dashboard ? buildLoopyOverviewContract(props.dashboard) : null)

const healthLabel = computed(() => resolveHealthLabel(props.dashboard?.diagnostics.healthState))
const healthTone = computed(() => resolveHealthTone(props.dashboard?.diagnostics.healthState))
const progressPercent = computed(() => clampPercent(props.dashboard?.summary.overallProgressPercent))

function resolveQueueTone(status: string | null | undefined, stale: boolean): 'ready' | 'processing' | 'waiting' {
  const normalized = String(status || '').trim()
  if (normalized === 'processing')
    return 'processing'
  if (normalized === 'succeeded' && !stale)
    return 'ready'
  return 'waiting'
}

function resolveQueueStatusLabel(status: string | null | undefined, stale: boolean): string {
  const normalized = String(status || '').trim()
  if (normalized === 'processing')
    return '进行中'
  if (normalized === 'succeeded' && !stale)
    return '已就绪'
  if (normalized === 'failed')
    return '失败'
  if (normalized === 'cancelled')
    return '已取消'
  return stale ? '待刷新' : '等待中'
}

const heroMetrics = computed(() => {
  if (!props.dashboard) {
    return [
      { id: 'sources', label: '数据源', value: '-', note: '等待 dashboard', tone: 'neutral' },
      { id: 'chunks', label: '数据总量', value: '-', note: '等待 dashboard', tone: 'primary' },
      { id: 'embeddings', label: '向量数量', value: '-', note: '等待 dashboard', tone: 'primary' },
      { id: 'dimensions', label: '维度', value: '-', note: '等待 dashboard', tone: 'neutral' },
      { id: 'ready', label: '命中率', value: '-', note: '等待 dashboard', tone: 'warning' },
      { id: 'health', label: '健康状态', value: healthLabel.value, note: '等待健康诊断', tone: healthTone.value },
    ]
  }

  const dashboard = props.dashboard
  const embeddedPointCount = Math.max(
    0,
    (
      Number(dashboard.diagnostics.realEmbeddedChunkCount || 0)
      + Number(dashboard.diagnostics.fallbackEmbeddedChunkCount || 0)
      + Number(dashboard.diagnostics.unknownEmbeddedChunkCount || 0)
    ),
  )
  const readyRate = dashboard.summary.indexableResources > 0
    ? (dashboard.summary.readyCount / Math.max(1, dashboard.summary.indexableResources)) * 100
    : 0

  return [
    {
      id: 'sources',
      label: '数据源',
      value: formatCompactNumber(dashboard.diagnostics.candidateResourceCount || dashboard.summary.totalResources),
      note: `${formatCompactNumber(dashboard.summary.indexableResources)} 可索引`,
      tone: 'neutral',
    },
    {
      id: 'chunks',
      label: '数据总量',
      value: formatCompactNumber(dashboard.diagnostics.chunkCount),
      note: `${formatCompactNumber(dashboard.diagnostics.multimodalIndexedCount)} 多模态`,
      tone: 'primary',
    },
    {
      id: 'embeddings',
      label: '向量数量',
      value: formatCompactNumber(embeddedPointCount),
      note: `${formatCompactNumber(dashboard.diagnostics.realEmbeddedChunkCount)} 真实`,
      tone: embeddedPointCount > 0 ? 'primary' : 'warning',
    },
    {
      id: 'dimensions',
      label: '维度',
      value: dashboard.runtime.embeddingDimensions > 0 ? String(dashboard.runtime.embeddingDimensions) : '-',
      note: dashboard.runtime.embeddingModel || '待配置模型',
      tone: 'neutral',
    },
    {
      id: 'ready',
      label: '命中率',
      value: formatPercent(readyRate),
      note: `${formatCompactNumber(dashboard.summary.readyCount)}/${formatCompactNumber(dashboard.summary.indexableResources)} 已就绪`,
      tone: readyRate >= 80 ? 'success' : readyRate >= 45 ? 'warning' : 'danger',
    },
    {
      id: 'health',
      label: '健康状态',
      value: healthLabel.value,
      note: dashboard.diagnostics.embeddingHealthReason || dashboard.diagnostics.healthMessage || '等待诊断',
      tone: healthTone.value,
    },
  ]
})

const progressDetails = computed(() => {
  if (!props.dashboard) {
    return [
      { label: '预计剩余', value: '-' },
      { label: '已处理', value: '-' },
      { label: '预计完成', value: '-' },
      { label: '最近更新', value: '-' },
    ]
  }

  return [
    {
      label: '预计剩余',
      value: formatEtaSeconds(Number(props.dashboard.summary.etaSeconds || 0)),
    },
    {
      label: '已处理',
      value: `${formatCompactNumber(props.dashboard.summary.readyCount || 0)}/${formatCompactNumber(props.dashboard.summary.indexableResources || 0)}`,
    },
    {
      label: '预计完成',
      value: formatDateTime(String(props.dashboard.summary.estimatedFinishedAt || '')),
    },
    {
      label: '最近更新',
      value: formatDateTime(String(props.dashboard.summary.lastRefreshedAt || '')),
    },
  ]
})

const heroQueueItems = computed(() => {
  if (!props.dashboard) {
    return [
      { label: '关系刷新', meta: '等待运行', tone: 'waiting', status: '等待中' },
      { label: '快照采集', meta: '暂无快照', tone: 'waiting', status: '等待中' },
      { label: '语义布局', meta: '等待布局', tone: 'waiting', status: '等待中' },
      { label: 'Analytics 就绪', meta: '等待刷新', tone: 'waiting', status: '待刷新' },
    ]
  }

  const snapshotType = props.dashboard.analytics.latestSnapshotType === 'manual'
    ? '手动'
    : props.dashboard.analytics.latestSnapshotType === 'hourly'
      ? '小时'
      : '未生成'

  return [
    {
      label: '关系刷新',
      meta: props.dashboard.analytics.relationsUpdatedAt
        ? `最近 ${formatDateTime(String(props.dashboard.analytics.relationsUpdatedAt))}`
        : '等待运行',
      tone: resolveQueueTone(
        props.dashboard.analytics.relationsJobStatus,
        props.dashboard.analytics.staleKinds.includes('relations'),
      ),
      status: resolveQueueStatusLabel(
        props.dashboard.analytics.relationsJobStatus,
        props.dashboard.analytics.staleKinds.includes('relations'),
      ),
    },
    {
      label: '快照采集',
      meta: snapshotType === '未生成' ? '暂无快照' : `${snapshotType} 快照`,
      tone: resolveQueueTone(
        props.dashboard.analytics.snapshotJobStatus,
        props.dashboard.analytics.staleKinds.includes('snapshot'),
      ),
      status: resolveQueueStatusLabel(
        props.dashboard.analytics.snapshotJobStatus,
        props.dashboard.analytics.staleKinds.includes('snapshot'),
      ),
    },
    {
      label: '语义布局',
      meta: props.dashboard.analytics.semanticLayoutUpdatedAt
        ? `最近 ${formatDateTime(String(props.dashboard.analytics.semanticLayoutUpdatedAt))}`
        : '等待布局',
      tone: resolveQueueTone(
        props.dashboard.analytics.semanticLayoutJobStatus,
        props.dashboard.analytics.staleKinds.includes('semantic_layout'),
      ),
      status: resolveQueueStatusLabel(
        props.dashboard.analytics.semanticLayoutJobStatus,
        props.dashboard.analytics.staleKinds.includes('semantic_layout'),
      ),
    },
    {
      label: 'Analytics 就绪',
      meta: Number(props.dashboard.summary.processingCount || 0) > 0
        ? `${formatCompactNumber(props.dashboard.summary.processingCount || 0)} 项处理中`
        : '等待刷新',
      tone: props.dashboard.analytics.allReady
        ? 'ready'
        : Number(props.dashboard.summary.processingCount || 0) > 0
          ? 'processing'
          : 'waiting',
      status: props.dashboard.analytics.allReady
        ? '已就绪'
        : Number(props.dashboard.summary.processingCount || 0) > 0
          ? '进行中'
          : '待刷新',
    },
  ]
})

const progressRingStyle = computed(() => ({
  '--loopy-progress-value': String(progressPercent.value),
}))

const stateBlock = computed(() => {
  if (!hasActiveProject.value) {
    return {
      tone: 'default' as const,
      title: '请选择项目',
      description: '数据中心依赖当前项目的知识索引与 analytics 快照，切换到项目后会自动读取真实数据。',
    }
  }

  if (props.loading && !props.dashboard) {
    return {
      tone: 'loading' as const,
      title: '正在加载数据中心',
      description: '正在读取知识索引 dashboard、relations freshness 与 semantic layout 概况。',
    }
  }

  if (props.error && !props.dashboard) {
    return {
      tone: 'error' as const,
      title: '数据中心加载失败',
      description: props.error,
    }
  }

  if (!props.dashboard) {
    return {
      tone: 'default' as const,
      title: '暂无可展示数据',
      description: '当前还没有返回 dashboard 快照，请稍后刷新或检查索引链路。',
    }
  }

  if ((props.dashboard.summary.totalResources || 0) <= 0) {
    return {
      tone: 'default' as const,
      title: '当前项目还没有可分析资源',
      description: '先上传文档、表格、图像或同步竞赛资料，数据中心主视图会自动把这些 source 映射进来。',
    }
  }

  return null
})

const analyticsReady = computed(() => Boolean(props.dashboard?.analytics.allReady))
</script>

<template>
  <section class="loopy-center">
    <div class="loopy-center__hero">
      <div class="loopy-center__hero-main">
        <div class="loopy-center__hero-copy">
          <div class="loopy-center__kicker-row">
            <span class="loopy-center__kicker">LOOPY 数据</span>
            <span class="loopy-center__project-chip">{{ projectTitle }}</span>
            <span class="loopy-center__health-chip" :data-tone="healthTone">
              {{ healthLabel }}
            </span>
          </div>

          <div class="loopy-center__title-wrap">
            <h2 class="loopy-center__title">
              连接数据，洞察语义，驱动智能
            </h2>
            <p class="loopy-center__subtitle">
              WinLoop 将多模态 embeddings、关系分析与索引健康收束在同一条知识链路里，让数据工作台直接承接后续语义与行动。
            </p>
          </div>

          <div class="loopy-center__hero-metric-grid">
            <article
              v-for="metric in heroMetrics"
              :key="metric.id"
              class="loopy-center__hero-metric-card"
              :data-tone="metric.tone"
            >
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
              <p>{{ metric.note }}</p>
            </article>
          </div>

          <div class="loopy-center__actions">
            <button
              class="loopy-center__action loopy-center__action--primary"
              type="button"
              :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
              @click="emit('reindexProjectKnowledge', 'all')"
            >
              {{ props.reindexingTarget === 'all' ? '重建中...' : '全量重建' }}
            </button>
            <button
              class="loopy-center__action"
              type="button"
              :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
              @click="emit('reindexProjectKnowledge', 'stale')"
            >
              {{ props.reindexingTarget === 'stale' ? '重建中...' : '重建 stale' }}
            </button>
            <button
              class="loopy-center__action"
              type="button"
              :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
              @click="emit('reindexProjectKnowledge', 'failed')"
            >
              {{ props.reindexingTarget === 'failed' ? '重建中...' : '重建 failed' }}
            </button>
            <button class="loopy-center__action" type="button" :disabled="props.loading" @click="emit('reload')">
              刷新诊断
            </button>
          </div>
        </div>

        <div class="loopy-center__visual">
          <div class="loopy-center__visual-stage">
            <video
              class="loopy-center__video-slot-media"
              src="/winloop-hero-video.mp4"
              poster="/winloop-hero-video-poster.png"
              autoplay
              muted
              loop
              playsinline
              preload="metadata"
            />
          </div>
        </div>
      </div>

      <aside class="loopy-center__hero-rail">
        <section class="loopy-center__hero-panel">
          <div class="loopy-center__hero-panel-head">
            <h3>整体进度</h3>
          </div>
          <div class="loopy-center__progress-layout">
            <div class="loopy-center__progress-ring" :style="progressRingStyle">
              <div class="loopy-center__progress-ring-inner">
                <strong>{{ formatPercent(progressPercent) }}</strong>
              </div>
            </div>

            <dl class="loopy-center__progress-meta">
              <div
                v-for="item in progressDetails"
                :key="item.label"
                class="loopy-center__progress-item"
              >
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="loopy-center__hero-panel">
          <div class="loopy-center__hero-panel-head">
            <h3>任务队列</h3>
          </div>
          <div class="loopy-center__queue">
            <article
              v-for="item in heroQueueItems"
              :key="item.label"
              class="loopy-center__queue-item"
              :data-tone="item.tone"
            >
              <div class="loopy-center__queue-item-main">
                <div class="loopy-center__queue-item-top">
                  <span class="loopy-center__queue-item-dot" />
                  <strong>{{ item.label }}</strong>
                </div>
                <p>{{ item.meta }}</p>
              </div>
              <div class="loopy-center__queue-item-side">
                <span>{{ item.status }}</span>
                <span class="material-symbols-outlined">chevron_right</span>
              </div>
            </article>
          </div>
        </section>
      </aside>
    </div>

    <div class="loopy-center__grid">
      <SectionCard
        class="loopy-center__entry"
        title="Embeddings 接入点"
        :description="overview?.entry.summary || '当前项目尚未返回 embeddings 接入点信息。'"
      >
        <div v-if="overview" class="loopy-center__entry-body">
          <div class="loopy-center__entry-badge" :data-tone="overview.entry.statusTone">
            <span class="loopy-center__entry-dot" />
            <span>{{ overview.entry.statusLabel }}</span>
          </div>

          <dl class="loopy-center__entry-grid">
            <div class="loopy-center__entry-field">
              <dt>Provider</dt>
              <dd>{{ overview.entry.provider }}</dd>
            </div>
            <div class="loopy-center__entry-field">
              <dt>Model</dt>
              <dd>{{ overview.entry.model }}</dd>
            </div>
            <div class="loopy-center__entry-field">
              <dt>Dimensions</dt>
              <dd>{{ overview.entry.dimensions }}</dd>
            </div>
            <div class="loopy-center__entry-field">
              <dt>Client</dt>
              <dd>{{ overview.entry.client }}</dd>
            </div>
            <div class="loopy-center__entry-field">
              <dt>API Style</dt>
              <dd>{{ overview.entry.apiStyle }}</dd>
            </div>
            <div class="loopy-center__entry-field">
              <dt>Last Healthy</dt>
              <dd>{{ overview.entry.freshness }}</dd>
            </div>
          </dl>

          <div class="loopy-center__entry-notice">
            {{ overview.entry.issue }}
          </div>
        </div>

        <StateBlock
          v-else
          centered
          tone="loading"
          title="等待 embeddings 契约"
          description="dashboard 返回后，这里会展示 provider、model、维度、协议类型和 freshness。"
        />
      </SectionCard>

      <div class="loopy-center__main">
        <SectionCard
          class="loopy-center__main-card"
          title="主工作面"
          description="以真实 source 状态作为中心表面，把资源、向量和异常统一映射到同一个操作视图。"
        >
          <template #actions>
            <div class="loopy-center__main-actions">
              <span class="loopy-center__main-pill" data-tone="primary">
                AI 检索策略已接入
              </span>
              <span class="loopy-center__main-pill" :data-tone="analyticsReady ? 'success' : 'warning'">
                {{ analyticsReady ? 'Analytics 已就绪' : 'Analytics 待刷新' }}
              </span>
              <span v-if="props.loading && props.dashboard" class="loopy-center__main-pill" data-tone="primary">
                正在刷新
              </span>
            </div>
          </template>

          <StateBlock
            v-if="stateBlock"
            centered
            :tone="stateBlock.tone"
            :title="stateBlock.title"
            :description="stateBlock.description"
          />

          <template v-else-if="overview">
            <div class="loopy-center__metric-grid">
              <article
                v-for="metric in overview.metrics"
                :key="metric.id"
                class="loopy-center__metric-card"
                :data-tone="metric.tone"
              >
                <span>{{ metric.label }}</span>
                <strong>{{ metric.value }}</strong>
                <p>{{ metric.note }}</p>
              </article>
            </div>

            <div class="loopy-center__surface">
              <div class="loopy-center__surface-head loopy-center__surface-grid">
                <span>资源 / Source</span>
                <span>索引覆盖</span>
                <span>Embeddings 接入</span>
                <span>异常 / 动作</span>
              </div>

              <article
                v-for="item in overview.sourceCards"
                :key="item.id"
                class="loopy-center__surface-row loopy-center__surface-grid"
              >
                <div class="loopy-center__source-meta">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.subtitle }}</span>
                  <time>{{ item.updatedAtLabel }}</time>
                </div>

                <div class="loopy-center__progress">
                  <div class="loopy-center__progress-track">
                    <span class="loopy-center__progress-bar" :style="{ width: `${item.progressPercent}%` }" />
                  </div>
                  <strong>{{ item.statusLabel }}</strong>
                  <span>{{ item.progressLabel }}</span>
                </div>

                <div class="loopy-center__status-block">
                  <span class="loopy-center__status-chip" :data-tone="item.embeddingTone">
                    {{ item.embeddingLabel }}
                  </span>
                  <p>{{ item.pipelineLabel }}</p>
                </div>

                <div class="loopy-center__issue-block">
                  <span class="loopy-center__status-chip" :data-tone="item.issueTone">
                    {{ item.issueTone === 'danger' ? '需处理' : item.issueTone === 'warning' ? '需关注' : '稳定' }}
                  </span>
                  <p>{{ item.issueLabel }}</p>
                </div>
              </article>

              <div v-if="overview.sourceCards.length === 0" class="loopy-center__inline-empty">
                当前没有 source 状态可供映射，通常意味着资源还没入索引或 dashboard 还未同步完成。
              </div>
            </div>
          </template>
        </SectionCard>

        <div class="loopy-center__lower">
          <SectionCard
            class="loopy-center__subcard"
            title="Embedding 构成"
            description="直接复用 dashboard.visuals.embeddingComposition，主视图和语义空间对向量构成都使用同一来源。"
          >
            <div v-if="overview && overview.composition.length > 0" class="loopy-center__insight-list">
              <article
                v-for="item in overview.composition"
                :key="item.id"
                class="loopy-center__insight-item"
                :data-tone="item.tone"
              >
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.note }}</span>
                </div>
                <b>{{ item.value }}</b>
              </article>
            </div>
            <div v-else class="loopy-center__inline-empty">
              当前还没有 embeddings composition 数据。
            </div>
          </SectionCard>

          <SectionCard
            class="loopy-center__subcard"
            title="Pipeline / Cluster 指标"
            description="下方指标继续复用 pipelineMetrics 和 clusterMetrics，避免另起一套展示口径。"
          >
            <div v-if="overview" class="loopy-center__stack">
              <div class="loopy-center__insight-list">
                <article
                  v-for="item in overview.pipeline"
                  :key="item.id"
                  class="loopy-center__insight-item"
                  :data-tone="item.tone"
                >
                  <div>
                    <strong>{{ item.label }}</strong>
                    <span>{{ item.note }}</span>
                  </div>
                  <b>{{ item.value }}</b>
                </article>
              </div>

              <div class="loopy-center__cluster-grid">
                <article
                  v-for="item in overview.clusters"
                  :key="item.id"
                  class="loopy-center__cluster-card"
                  :data-tone="item.tone"
                >
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                  <p>{{ item.note }}</p>
                </article>
              </div>
            </div>
            <div v-else class="loopy-center__inline-empty">
              dashboard 返回后这里会自动挂上 pipeline 与 cluster 指标。
            </div>
          </SectionCard>
        </div>
      </div>

      <div class="loopy-center__rail">
        <SectionCard
          class="loopy-center__rail-card"
          title="运行建议"
          description="优先展示当前主链路里的问题和下一步动作，减少“看到了红字但不知道该干嘛”。"
        >
          <div v-if="overview" class="loopy-center__recommendations">
            <article
              v-for="item in overview.recommendations"
              :key="item.id"
              class="loopy-center__recommendation"
              :data-tone="item.tone"
            >
              <strong>{{ item.title }}</strong>
              <p>{{ item.description }}</p>
            </article>
          </div>
          <div v-else class="loopy-center__inline-empty">
            等待 dashboard 返回后生成运行建议。
          </div>
        </SectionCard>

        <SectionCard
          class="loopy-center__rail-card"
          title="数据契约"
          description="把 embeddings 接入点、卡片 / 节点字段和状态态约定写死在这里，后续接真实数据时只要遵守契约即可。"
        >
          <div v-if="overview" class="loopy-center__contract-sections">
            <section
              v-for="section in overview.contractSections"
              :key="section.id"
              class="loopy-center__contract-section"
            >
              <h3>{{ section.title }}</h3>
              <article
                v-for="item in section.items"
                :key="`${section.id}-${item.label}`"
                class="loopy-center__contract-item"
              >
                <strong>{{ item.label }}</strong>
                <code>{{ item.source }}</code>
                <p>{{ item.note }}</p>
              </article>
            </section>

            <section class="loopy-center__contract-section">
              <h3>状态图例</h3>
              <div class="loopy-center__legend-list">
                <article
                  v-for="item in overview.stateLegends"
                  :key="item.id"
                  class="loopy-center__legend-item"
                  :data-tone="item.tone"
                >
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.description }}</p>
                </article>
              </div>
            </section>
          </div>
          <div v-else class="loopy-center__inline-empty">
            当前还没有可渲染的数据契约视图。
          </div>
        </SectionCard>
      </div>
    </div>
  </section>
</template>

<style scoped>
.loopy-center {
  --dc-gap-1: var(--wl-wb-gap-1, 6px);
  --dc-gap-2: var(--wl-wb-gap-2, 8px);
  --dc-gap-3: var(--wl-wb-gap-3, 10px);
  --dc-gap-4: var(--wl-wb-gap-4, 12px);
  --dc-gap-5: var(--wl-wb-gap-5, 14px);
  --dc-gap-6: var(--wl-wb-gap-6, 18px);
  --dc-shell-padding: var(--wl-wb-shell-padding, 14px);
  --dc-panel-padding: var(--wl-wb-panel-padding, 12px);
  --dc-card-padding: var(--wl-wb-card-padding, 10px);
  --dc-shell-radius: var(--wl-wb-shell-radius, 18px);
  --dc-panel-radius: var(--wl-wb-panel-radius, 15px);
  --dc-card-radius: var(--wl-wb-card-radius, 12px);
  --dc-control-height: var(--wl-wb-control-height, 34px);
  --dc-control-padding-x: var(--wl-wb-control-padding-x, 14px);
  --dc-chip-height: var(--wl-wb-chip-height, 28px);
  --dc-progress-size: var(--wl-wb-progress-size, 98px);
  --dc-progress-inset: var(--wl-wb-progress-inner-inset, 10px);
  --dc-caption-size: var(--wl-wb-caption-size, 11px);
  --dc-label-size: var(--wl-wb-label-size, 12px);
  --dc-body-size: var(--wl-wb-body-size, 13px);
  --dc-title-size: var(--wl-wb-title-size, 28px);
  --dc-metric-size: var(--wl-wb-metric-value-size, 19px);
  --dc-panel-title-size: var(--wl-wb-panel-title-size, 16px);
  --dc-bg: var(--wl-wb-shell-bg);
  --dc-surface: var(--wl-wb-panel-bg, rgba(255, 255, 255, 0.94));
  --dc-surface-soft: var(--wl-wb-card-bg, rgba(244, 248, 255, 0.92));
  --dc-border: var(--wl-wb-shell-border, rgba(210, 223, 242, 0.92));
  --dc-border-strong: var(--wl-wb-panel-border, rgba(181, 201, 232, 0.98));
  --dc-text: #17253b;
  --dc-text-soft: #5b7193;
  --dc-text-faint: #8295b1;
  --dc-primary: #245cff;
  --dc-primary-soft: rgba(36, 92, 255, 0.12);
  --dc-success: #0f9f62;
  --dc-success-soft: rgba(15, 159, 98, 0.12);
  --dc-warning: #b7791f;
  --dc-warning-soft: rgba(183, 121, 31, 0.12);
  --dc-danger: #d14b66;
  --dc-danger-soft: rgba(209, 75, 102, 0.12);
  --dc-shadow: var(--wl-wb-shell-shadow, none);
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-5);
  padding: var(--dc-shell-padding);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-shell-radius);
  background: var(--dc-bg);
  box-shadow: var(--dc-shadow);
}

.loopy-center :deep(.wl-section-card) {
  padding: var(--dc-panel-padding);
  border-radius: var(--dc-panel-radius);
  border-color: var(--dc-border);
  background: var(--dc-surface);
  box-shadow: none;
}

.loopy-center :deep(.wl-section-card__head) {
  gap: var(--dc-gap-3);
  margin-bottom: var(--dc-gap-4);
}

.loopy-center :deep(.wl-section-card__title) {
  font-size: var(--dc-panel-title-size);
  font-weight: 800;
}

.loopy-center :deep(.wl-section-card__description) {
  font-size: var(--dc-caption-size);
}

.loopy-center__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(304px, 340px);
  gap: var(--dc-gap-4);
  align-items: start;
}

.loopy-center__hero-main {
  display: grid;
  grid-template-columns: minmax(520px, 1.08fr) minmax(300px, 0.92fr);
  gap: var(--dc-gap-4);
  min-width: 0;
}

.loopy-center__hero-copy,
.loopy-center__visual,
.loopy-center__hero-rail,
.loopy-center__hero-panel {
  position: relative;
  min-width: 0;
}

.loopy-center__hero-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--dc-gap-4);
}

.loopy-center__kicker-row {
  display: flex;
  align-items: center;
  gap: var(--dc-gap-3);
  flex-wrap: wrap;
}

.loopy-center__kicker {
  color: var(--dc-text-faint);
  font-size: var(--dc-body-size);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.loopy-center__project-chip,
.loopy-center__health-chip {
  display: inline-flex;
  align-items: center;
  min-height: var(--dc-chip-height);
  padding: 0 var(--dc-gap-4);
  border: 1px solid var(--dc-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  font-weight: 700;
}

.loopy-center__project-chip {
  max-width: min(320px, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loopy-center__health-chip[data-tone='success'] {
  border-color: rgba(15, 159, 98, 0.28);
  background: var(--dc-success-soft);
  color: var(--dc-success);
}

.loopy-center__health-chip[data-tone='warning'] {
  border-color: rgba(183, 121, 31, 0.28);
  background: var(--dc-warning-soft);
  color: var(--dc-warning);
}

.loopy-center__health-chip[data-tone='danger'] {
  border-color: rgba(209, 75, 102, 0.28);
  background: var(--dc-danger-soft);
  color: var(--dc-danger);
}

.loopy-center__title {
  margin: 0;
  color: var(--dc-text);
  font-size: var(--dc-title-size);
  font-weight: 900;
  line-height: 1.08;
  letter-spacing: 0;
}

.loopy-center__subtitle {
  max-width: 540px;
  margin: var(--dc-gap-2) 0 0;
  color: var(--dc-text-soft);
  font-size: var(--dc-body-size);
  line-height: 1.5;
}

.loopy-center__hero-metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--dc-gap-2);
}

.loopy-center__hero-metric-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--dc-gap-1);
  min-height: 68px;
  padding: var(--dc-card-padding);
  border: 1px solid var(--dc-border-strong);
  border-radius: var(--dc-card-radius);
  background: var(--dc-surface);
}

.loopy-center__hero-metric-card span {
  display: block;
  color: var(--dc-text-faint);
  font-size: var(--dc-caption-size);
  font-weight: 700;
}

.loopy-center__hero-metric-card strong {
  display: block;
  color: var(--dc-text);
  font-size: clamp(17px, 1.3vw, var(--dc-metric-size));
  font-weight: 900;
  line-height: 1;
}

.loopy-center__hero-metric-card p {
  margin: 0;
  color: var(--dc-text-soft);
  font-size: 10px;
  line-height: 1.35;
}

.loopy-center__hero-metric-card[data-tone='success'] {
  background: rgba(15, 159, 98, 0.08);
  border-color: rgba(15, 159, 98, 0.24);
}

.loopy-center__hero-metric-card[data-tone='warning'] {
  background: rgba(183, 121, 31, 0.08);
  border-color: rgba(183, 121, 31, 0.24);
}

.loopy-center__hero-metric-card[data-tone='danger'] {
  background: rgba(209, 75, 102, 0.08);
  border-color: rgba(209, 75, 102, 0.24);
}

.loopy-center__hero-metric-card[data-tone='primary'] {
  background: rgba(36, 92, 255, 0.08);
  border-color: rgba(36, 92, 255, 0.22);
}

.loopy-center__visual {
  min-height: 236px;
  display: flex;
  align-items: stretch;
}

.loopy-center__visual-stage {
  position: relative;
  width: 100%;
  min-height: 236px;
  border: 1px solid var(--dc-border-strong);
  border-radius: var(--dc-panel-radius);
  overflow: hidden;
  background: var(--wl-wb-stage-bg);
}

.loopy-center__video-slot-media {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.loopy-center__hero-rail {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-3);
}

.loopy-center__hero-panel {
  padding: var(--dc-panel-padding);
  border: 1px solid var(--dc-border-strong);
  border-radius: var(--dc-panel-radius);
  background: var(--dc-surface);
}

.loopy-center__hero-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--dc-gap-4);
}

.loopy-center__hero-panel-head h3 {
  margin: 0;
  color: var(--dc-text);
  font-size: var(--dc-panel-title-size);
  font-weight: 900;
}

.loopy-center__progress-layout {
  display: grid;
  grid-template-columns: var(--dc-progress-size) minmax(0, 1fr);
  gap: var(--dc-gap-4);
  align-items: center;
}

.loopy-center__progress-ring {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--dc-progress-size);
  aspect-ratio: 1;
  border-radius: 999px;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.94) 56%, transparent 57%),
    conic-gradient(
      #3f76ff 0 calc(var(--loopy-progress-value) * 1%),
      rgba(216, 226, 240, 0.9) calc(var(--loopy-progress-value) * 1%) 100%
    );
}

.loopy-center__progress-ring::after {
  content: '';
  position: absolute;
  inset: var(--dc-progress-inset);
  border-radius: 999px;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(223, 232, 243, 0.88);
}

.loopy-center__progress-ring-inner {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: calc(var(--dc-progress-size) - (var(--dc-progress-inset) * 4));
  height: calc(var(--dc-progress-size) - (var(--dc-progress-inset) * 4));
  border-radius: 999px;
}

.loopy-center__progress-ring-inner strong {
  color: var(--dc-text);
  font-size: calc(var(--dc-title-size) - 8px);
  font-weight: 900;
  letter-spacing: -0.04em;
}

.loopy-center__progress-meta {
  display: grid;
  gap: var(--dc-gap-2);
  margin: 0;
}

.loopy-center__progress-item {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: var(--dc-gap-3);
  align-items: start;
}

.loopy-center__progress-item dt {
  color: var(--dc-text-faint);
  font-size: var(--dc-caption-size);
  font-weight: 700;
}

.loopy-center__progress-item dd {
  margin: 0;
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  font-weight: 700;
  line-height: 1.45;
  word-break: break-word;
}

.loopy-center__queue {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-1);
}

.loopy-center__queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dc-gap-4);
  min-height: 44px;
  padding: var(--dc-gap-2) 0;
  border-bottom: 1px solid rgba(230, 236, 245, 0.92);
}

.loopy-center__queue-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.loopy-center__queue-item-main {
  min-width: 0;
}

.loopy-center__queue-item-top {
  display: flex;
  align-items: center;
  gap: var(--dc-gap-2);
  color: var(--dc-text);
  font-size: var(--dc-body-size);
}

.loopy-center__queue-item-main p {
  margin: 2px 0 0;
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  line-height: 1.45;
}

.loopy-center__queue-item-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(198, 210, 229, 0.92);
}

.loopy-center__queue-item[data-tone='ready'] .loopy-center__queue-item-dot {
  background: #4a7cff;
  box-shadow: 0 0 0 3px rgba(74, 124, 255, 0.12);
}

.loopy-center__queue-item[data-tone='processing'] .loopy-center__queue-item-dot {
  background: #50c7f1;
  box-shadow: 0 0 0 3px rgba(80, 199, 241, 0.12);
}

.loopy-center__queue-item-side {
  display: inline-flex;
  align-items: center;
  gap: var(--dc-gap-1);
  color: var(--dc-text-faint);
  font-size: var(--dc-caption-size);
  font-weight: 800;
  white-space: nowrap;
}

.loopy-center__grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: var(--dc-gap-5);
}

.loopy-center__entry,
.loopy-center__main-card,
.loopy-center__subcard,
.loopy-center__rail-card {
  background: var(--dc-surface);
  border-color: var(--dc-border);
}

.loopy-center__main {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-5);
  min-width: 0;
}

.loopy-center__rail {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-5);
}

.loopy-center__entry-body {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-5);
}

.loopy-center__entry-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--dc-gap-2);
  min-height: var(--dc-control-height);
  padding: 0 var(--dc-gap-4);
  border-radius: 999px;
  font-size: var(--dc-label-size);
  font-weight: 800;
  width: fit-content;
  border: 1px solid var(--dc-border);
  color: var(--dc-text-soft);
  background: rgba(255, 255, 255, 0.68);
}

.loopy-center__entry-badge[data-tone='success'] {
  border-color: rgba(15, 159, 98, 0.3);
  background: var(--dc-success-soft);
  color: var(--dc-success);
}

.loopy-center__entry-badge[data-tone='warning'] {
  border-color: rgba(183, 121, 31, 0.3);
  background: var(--dc-warning-soft);
  color: var(--dc-warning);
}

.loopy-center__entry-badge[data-tone='danger'] {
  border-color: rgba(209, 75, 102, 0.3);
  background: var(--dc-danger-soft);
  color: var(--dc-danger);
}

.loopy-center__entry-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}

.loopy-center__entry-grid {
  display: grid;
  gap: var(--dc-gap-3);
}

.loopy-center__entry-field {
  padding: var(--dc-card-padding);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-card-radius);
  background: var(--dc-surface-soft);
}

.loopy-center__entry-field dt {
  color: var(--dc-text-faint);
  font-size: var(--dc-caption-size);
  font-weight: 700;
}

.loopy-center__entry-field dd {
  margin: var(--dc-gap-1) 0 0;
  color: var(--dc-text);
  font-size: var(--dc-body-size);
  font-weight: 700;
  line-height: 1.5;
}

.loopy-center__entry-notice,
.loopy-center__inline-empty {
  padding: var(--dc-card-padding) var(--dc-gap-5);
  border: 1px dashed var(--dc-border-strong);
  border-radius: var(--dc-card-radius);
  background: rgba(255, 255, 255, 0.52);
  color: var(--dc-text-soft);
  font-size: var(--dc-label-size);
  line-height: 1.6;
}

.loopy-center__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dc-gap-2);
}

.loopy-center__action {
  min-height: var(--dc-control-height);
  padding: 0 var(--dc-control-padding-x);
  border: 1px solid var(--dc-border);
  border-radius: calc(var(--dc-card-radius) - 1px);
  background: rgba(255, 255, 255, 0.8);
  color: var(--dc-text-soft);
  font-size: var(--dc-label-size);
  font-weight: 800;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;
}

.loopy-center__action:hover:not(:disabled) {
  border-color: rgba(127, 155, 207, 0.82);
  background: rgba(248, 251, 255, 0.98);
}

.loopy-center__action:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.loopy-center__action--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #3367ff, #245cff);
  color: #fff;
}

.loopy-center__main-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--dc-gap-2);
}

.loopy-center__main-pill,
.loopy-center__status-chip {
  display: inline-flex;
  align-items: center;
  min-height: var(--dc-chip-height);
  padding: 0 var(--dc-gap-3);
  border-radius: 999px;
  border: 1px solid var(--dc-border);
  background: rgba(255, 255, 255, 0.72);
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  font-weight: 800;
}

.loopy-center__main-pill[data-tone='success'],
.loopy-center__status-chip[data-tone='success'] {
  border-color: rgba(15, 159, 98, 0.3);
  background: var(--dc-success-soft);
  color: var(--dc-success);
}

.loopy-center__main-pill[data-tone='warning'],
.loopy-center__status-chip[data-tone='warning'] {
  border-color: rgba(183, 121, 31, 0.3);
  background: var(--dc-warning-soft);
  color: var(--dc-warning);
}

.loopy-center__main-pill[data-tone='danger'],
.loopy-center__status-chip[data-tone='danger'] {
  border-color: rgba(209, 75, 102, 0.3);
  background: var(--dc-danger-soft);
  color: var(--dc-danger);
}

.loopy-center__main-pill[data-tone='primary'],
.loopy-center__status-chip[data-tone='primary'] {
  border-color: rgba(36, 92, 255, 0.3);
  background: var(--dc-primary-soft);
  color: var(--dc-primary);
}

.loopy-center__metric-grid {
  display: grid;
  gap: var(--dc-gap-3);
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.loopy-center__metric-card,
.loopy-center__cluster-card {
  padding: var(--dc-card-padding);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-card-radius);
  background: var(--dc-surface-soft);
}

.loopy-center__metric-card span,
.loopy-center__cluster-card span {
  display: block;
  color: var(--dc-text-faint);
  font-size: var(--dc-caption-size);
  font-weight: 700;
}

.loopy-center__metric-card strong,
.loopy-center__cluster-card strong {
  display: block;
  margin-top: var(--dc-gap-3);
  color: var(--dc-text);
  font-size: var(--dc-metric-size);
  font-weight: 900;
  line-height: 1;
}

.loopy-center__metric-card p,
.loopy-center__cluster-card p {
  margin: var(--dc-gap-2) 0 0;
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  line-height: 1.55;
}

.loopy-center__metric-card[data-tone='success'],
.loopy-center__cluster-card[data-tone='success'] {
  border-color: rgba(15, 159, 98, 0.26);
  background: rgba(15, 159, 98, 0.08);
}

.loopy-center__metric-card[data-tone='warning'],
.loopy-center__cluster-card[data-tone='warning'] {
  border-color: rgba(183, 121, 31, 0.26);
  background: rgba(183, 121, 31, 0.08);
}

.loopy-center__metric-card[data-tone='danger'],
.loopy-center__cluster-card[data-tone='danger'] {
  border-color: rgba(209, 75, 102, 0.26);
  background: rgba(209, 75, 102, 0.08);
}

.loopy-center__metric-card[data-tone='primary'] {
  border-color: rgba(36, 92, 255, 0.24);
  background: rgba(36, 92, 255, 0.08);
}

.loopy-center__surface {
  margin-top: var(--dc-gap-5);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-panel-radius);
  overflow: hidden;
}

.loopy-center__surface-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.9fr) minmax(220px, 0.9fr) minmax(240px, 1fr);
  gap: 12px;
}

.loopy-center__surface-head {
  padding: var(--dc-card-padding) var(--dc-gap-5);
  background: rgba(244, 248, 255, 0.84);
  color: var(--dc-text-faint);
  font-size: var(--dc-caption-size);
  font-weight: 800;
  letter-spacing: 0.03em;
}

.loopy-center__surface-row {
  padding: var(--dc-gap-5);
  align-items: center;
  border-top: 1px solid var(--dc-border);
  background: rgba(255, 255, 255, 0.62);
}

.loopy-center__source-meta strong,
.loopy-center__progress strong {
  display: block;
  color: var(--dc-text);
  font-size: var(--dc-body-size);
  font-weight: 800;
}

.loopy-center__source-meta span,
.loopy-center__source-meta time,
.loopy-center__progress span,
.loopy-center__status-block p,
.loopy-center__issue-block p {
  display: block;
  margin-top: var(--dc-gap-1);
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  line-height: 1.55;
}

.loopy-center__progress-track {
  overflow: hidden;
  width: 100%;
  height: 7px;
  margin-bottom: var(--dc-gap-2);
  border-radius: 999px;
  background: rgba(197, 211, 232, 0.58);
}

.loopy-center__progress-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #245cff, #6aa1ff);
}

.loopy-center__status-block,
.loopy-center__issue-block {
  min-width: 0;
}

.loopy-center__lower {
  display: grid;
  gap: var(--dc-gap-5);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.loopy-center__stack,
.loopy-center__recommendations,
.loopy-center__contract-sections {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-4);
}

.loopy-center__insight-list {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-2);
}

.loopy-center__insight-item,
.loopy-center__recommendation,
.loopy-center__contract-item,
.loopy-center__legend-item {
  padding: var(--dc-card-padding);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-card-radius);
  background: var(--dc-surface-soft);
}

.loopy-center__insight-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dc-gap-3);
}

.loopy-center__insight-item strong,
.loopy-center__recommendation strong,
.loopy-center__contract-item strong,
.loopy-center__legend-item strong {
  display: block;
  color: var(--dc-text);
  font-size: var(--dc-label-size);
  font-weight: 800;
}

.loopy-center__insight-item span,
.loopy-center__recommendation p,
.loopy-center__contract-item p,
.loopy-center__legend-item p {
  display: block;
  margin-top: var(--dc-gap-1);
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  line-height: 1.6;
}

.loopy-center__insight-item b {
  color: var(--dc-text);
  font-size: var(--dc-body-size);
  font-weight: 900;
  white-space: nowrap;
}

.loopy-center__insight-item[data-tone='success'],
.loopy-center__recommendation[data-tone='success'] {
  border-color: rgba(15, 159, 98, 0.26);
  background: rgba(15, 159, 98, 0.08);
}

.loopy-center__insight-item[data-tone='warning'],
.loopy-center__recommendation[data-tone='warning'],
.loopy-center__legend-item[data-tone='warning'] {
  border-color: rgba(183, 121, 31, 0.26);
  background: rgba(183, 121, 31, 0.08);
}

.loopy-center__insight-item[data-tone='danger'],
.loopy-center__recommendation[data-tone='danger'],
.loopy-center__legend-item[data-tone='error'] {
  border-color: rgba(209, 75, 102, 0.26);
  background: rgba(209, 75, 102, 0.08);
}

.loopy-center__insight-item[data-tone='primary'],
.loopy-center__recommendation[data-tone='primary'] {
  border-color: rgba(36, 92, 255, 0.24);
  background: rgba(36, 92, 255, 0.08);
}

.loopy-center__cluster-grid {
  display: grid;
  gap: var(--dc-gap-2);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.loopy-center__contract-section h3 {
  margin: 0 0 var(--dc-gap-3);
  color: var(--dc-text);
  font-size: var(--dc-body-size);
  font-weight: 900;
}

.loopy-center__contract-item code {
  display: block;
  margin-top: var(--dc-gap-2);
  padding: var(--dc-gap-2) var(--dc-gap-3);
  border-radius: var(--dc-card-radius);
  background: rgba(21, 32, 49, 0.06);
  color: var(--dc-text);
  font-family: var(--wl-font-mono);
  font-size: 10px;
  line-height: 1.6;
  word-break: break-word;
}

.loopy-center__legend-list {
  display: grid;
  gap: var(--dc-gap-2);
}

.loopy-center__legend-item[data-tone='loading'] {
  background: rgba(36, 92, 255, 0.06);
}

@media (max-width: 1520px) {
  .loopy-center__hero {
    grid-template-columns: 1fr;
  }

  .loopy-center__grid {
    grid-template-columns: 300px minmax(0, 1fr);
  }

  .loopy-center__rail {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1240px) {
  .loopy-center__hero-main {
    grid-template-columns: 1fr;
  }

  .loopy-center__grid {
    grid-template-columns: 1fr;
  }

  .loopy-center__rail {
    grid-template-columns: 1fr;
  }

  .loopy-center__metric-grid,
  .loopy-center__hero-metric-grid,
  .loopy-center__lower,
  .loopy-center__cluster-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .loopy-center__surface-grid {
    grid-template-columns: 1fr;
  }

  .loopy-center__surface-head {
    display: none;
  }
}

@media (max-width: 900px) {
  .loopy-center__progress-layout {
    grid-template-columns: 1fr;
    justify-items: flex-start;
  }

  .loopy-center__visual {
    min-height: 220px;
  }

  .loopy-center__hero-metric-grid,
  .loopy-center__metric-grid,
  .loopy-center__lower,
  .loopy-center__cluster-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .loopy-center__queue-item {
    align-items: flex-start;
  }
}

:global(html.dark) .loopy-center {
  --dc-bg: linear-gradient(180deg, rgba(13, 18, 28, 0.98), rgba(17, 25, 39, 0.98));
  --dc-surface: rgba(17, 25, 39, 0.88);
  --dc-surface-soft: rgba(24, 35, 53, 0.92);
  --dc-border: rgba(67, 86, 117, 0.82);
  --dc-border-strong: rgba(90, 113, 150, 0.9);
  --dc-text: #eef5ff;
  --dc-text-soft: #b4c3da;
  --dc-text-faint: #8da2c0;
  box-shadow: none;
}

:global(html.dark) .loopy-center__project-chip,
:global(html.dark) .loopy-center__health-chip,
:global(html.dark) .loopy-center__entry-badge,
:global(html.dark) .loopy-center__main-pill,
:global(html.dark) .loopy-center__status-chip,
:global(html.dark) .loopy-center__action {
  background: rgba(13, 18, 28, 0.72);
}

:global(html.dark) .loopy-center__contract-item code {
  background: rgba(255, 255, 255, 0.06);
  color: #f2f7ff;
}
</style>
