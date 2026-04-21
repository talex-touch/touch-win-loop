<script setup lang="ts">
import type { Project, ProjectKnowledgeIndexDashboard } from '~~/shared/types/domain'
import { formatDateTime, formatEtaSeconds } from '~/utils/workspace-main-panel-formatters'

type ProjectKnowledgeReindexTarget = 'all' | 'stale' | 'failed'
type LoopyWorkbenchView = 'health' | 'relations' | 'semantic'

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

const currentView = ref<LoopyWorkbenchView>('health')
const viewMeta: Array<{ id: LoopyWorkbenchView, label: string, icon: string }> = [
  {
    id: 'health',
    label: '索引健康',
    icon: 'monitor_heart',
  },
  {
    id: 'relations',
    label: '关系探索',
    icon: 'account_tree',
  },
  {
    id: 'semantic',
    label: '语义空间',
    icon: 'scatter_plot',
  },
]

function clampPercent(value: number | string | null | undefined): number {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))))
}

function formatPercentLabel(value: number | string | null | undefined): string {
  return `${clampPercent(value)}%`
}

function formatCompactNumber(value: number | string | null | undefined): string {
  const normalized = Math.max(0, Number(value || 0))
  if (normalized >= 1000000)
    return `${(normalized / 1000000).toFixed(normalized >= 10000000 ? 1 : 2)}M`
  if (normalized >= 1000)
    return new Intl.NumberFormat('en-US').format(Math.round(normalized))
  return String(Math.round(normalized))
}

function resolveHealthLabel(state: string | null | undefined): string {
  const normalized = String(state || '').trim()
  if (normalized === 'healthy')
    return '健康'
  if (normalized === 'fallback_only')
    return '降级可用'
  if (normalized === 'missing_runtime')
    return '缺少运行时'
  if (normalized === 'worker_inactive')
    return 'Worker 未启动'
  if (normalized === 'queued_but_not_running')
    return '队列阻塞'
  if (normalized === 'partial')
    return '部分可用'
  return '空项目'
}

function resolveHealthTone(state: string | null | undefined): 'healthy' | 'warning' | 'danger' | 'idle' {
  const normalized = String(state || '').trim()
  if (normalized === 'healthy')
    return 'healthy'
  if (normalized === 'fallback_only' || normalized === 'partial')
    return 'warning'
  if (normalized === 'missing_runtime' || normalized === 'worker_inactive' || normalized === 'queued_but_not_running')
    return 'danger'
  return 'idle'
}

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

const hasActiveProject = computed(() => Boolean(props.activeProject?.id || props.activeProjectId))
const summary = computed(() => props.dashboard?.summary || null)
const runtime = computed(() => props.dashboard?.runtime || null)
const diagnostics = computed(() => props.dashboard?.diagnostics || null)
const analytics = computed(() => props.dashboard?.analytics || null)

const projectTitle = computed(() => {
  const normalized = String(props.activeProject?.title || '').trim()
  return normalized || '当前项目'
})

const progressPercent = computed(() => clampPercent(summary.value?.overallProgressPercent))
const healthTone = computed(() => resolveHealthTone(diagnostics.value?.healthState))
const healthLabel = computed(() => resolveHealthLabel(diagnostics.value?.healthState))
const embeddedPointCount = computed(() => {
  return Math.max(
    0,
    Number(diagnostics.value?.realEmbeddedChunkCount || 0)
    + Number(diagnostics.value?.fallbackEmbeddedChunkCount || 0)
    + Number(diagnostics.value?.unknownEmbeddedChunkCount || 0),
  )
})
const readyRate = computed(() => {
  const denominator = Math.max(0, Number(summary.value?.indexableResources || 0))
  if (denominator <= 0)
    return 0
  return (Math.max(0, Number(summary.value?.readyCount || 0)) / denominator) * 100
})

const heroMetrics = computed(() => [
  {
    label: '数据源',
    value: formatCompactNumber(diagnostics.value?.candidateResourceCount || summary.value?.totalResources || 0),
    note: `${formatCompactNumber(summary.value?.indexableResources || 0)} 可索引`,
    tone: 'neutral',
  },
  {
    label: '数据总量',
    value: formatCompactNumber(diagnostics.value?.chunkCount || 0),
    note: `${formatCompactNumber(diagnostics.value?.multimodalIndexedCount || 0)} 多模态`,
    tone: 'accent',
  },
  {
    label: '向量数量',
    value: formatCompactNumber(embeddedPointCount.value),
    note: `${formatCompactNumber(diagnostics.value?.realEmbeddedChunkCount || 0)} 真实`,
    tone: 'accent',
  },
  {
    label: '维度',
    value: Number(runtime.value?.embeddingDimensions || 0) > 0 ? String(runtime.value?.embeddingDimensions || 0) : '-',
    note: runtime.value?.embeddingModel || '待配置模型',
    tone: 'neutral',
  },
  {
    label: '命中率',
    value: formatPercentLabel(readyRate.value),
    note: `${formatCompactNumber(summary.value?.readyCount || 0)}/${formatCompactNumber(summary.value?.indexableResources || 0)} 已就绪`,
    tone: 'accent',
  },
  {
    label: '健康状态',
    value: healthLabel.value,
    note: String(diagnostics.value?.embeddingHealthReason || diagnostics.value?.healthMessage || '等待诊断'),
    tone: healthTone.value,
  },
])

const progressRingStyle = computed(() => ({
  '--loopy-progress-value': String(progressPercent.value),
}))

const heroQueueItems = computed(() => {
  const snapshotType = analytics.value?.latestSnapshotType === 'manual'
    ? '手动'
    : analytics.value?.latestSnapshotType === 'hourly'
      ? '小时'
      : '未生成'

  return [
    {
      label: '关系刷新',
      meta: analytics.value?.relationsUpdatedAt ? `最近 ${formatDateTime(String(analytics.value.relationsUpdatedAt))}` : '等待运行',
      tone: resolveQueueTone(analytics.value?.relationsJobStatus, Boolean(analytics.value?.staleKinds.includes('relations'))),
      status: resolveQueueStatusLabel(analytics.value?.relationsJobStatus, Boolean(analytics.value?.staleKinds.includes('relations'))),
    },
    {
      label: '快照采集',
      meta: snapshotType === '未生成' ? '暂无快照' : `${snapshotType} 快照`,
      tone: resolveQueueTone(analytics.value?.snapshotJobStatus, Boolean(analytics.value?.staleKinds.includes('snapshot'))),
      status: resolveQueueStatusLabel(analytics.value?.snapshotJobStatus, Boolean(analytics.value?.staleKinds.includes('snapshot'))),
    },
    {
      label: '语义布局',
      meta: analytics.value?.semanticLayoutUpdatedAt ? `最近 ${formatDateTime(String(analytics.value?.semanticLayoutUpdatedAt))}` : '等待布局',
      tone: resolveQueueTone(analytics.value?.semanticLayoutJobStatus, Boolean(analytics.value?.staleKinds.includes('semantic_layout'))),
      status: resolveQueueStatusLabel(analytics.value?.semanticLayoutJobStatus, Boolean(analytics.value?.staleKinds.includes('semantic_layout'))),
    },
    {
      label: 'Analytics 就绪',
      meta: Number(summary.value?.processingCount || 0) > 0 ? `${formatCompactNumber(summary.value?.processingCount || 0)} 项处理中` : '等待刷新',
      tone: analytics.value?.allReady ? 'ready' : Number(summary.value?.processingCount || 0) > 0 ? 'processing' : 'waiting',
      status: analytics.value?.allReady ? '已就绪' : Number(summary.value?.processingCount || 0) > 0 ? '进行中' : '待刷新',
    },
  ]
})
</script>

<template>
  <div
    data-testid="workspace-project-knowledge-index"
    class="space-y-5"
  >
    <section class="loopy-hero">
      <div class="loopy-hero__main">
        <div class="loopy-hero__copy">
          <div class="loopy-hero__meta-row">
            <span class="loopy-hero__eyebrow">LOOPY 数据</span>
            <span class="loopy-hero__project-chip">{{ projectTitle }}</span>
          </div>

          <WinLoopTextLogo class="loopy-hero__wordmark" />

          <div class="loopy-hero__headline-group">
            <h2 class="loopy-hero__title">
              连接数据，洞察语义，驱动智能
            </h2>
            <p class="loopy-hero__subtitle">
              多模态 embeddings、关系分析与索引健康统一收束在同一条知识链路。
            </p>
          </div>

          <div class="loopy-hero__metric-grid">
            <article
              v-for="metric in heroMetrics"
              :key="metric.label"
              class="loopy-hero__metric-card"
              :data-tone="metric.tone"
            >
              <span class="loopy-hero__metric-label">{{ metric.label }}</span>
              <strong class="loopy-hero__metric-value">{{ metric.value }}</strong>
              <span class="loopy-hero__metric-note">{{ metric.note }}</span>
            </article>
          </div>

          <div class="loopy-hero__actions">
            <button
              class="loopy-hero__action loopy-hero__action--primary"
              type="button"
              :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
              @click="emit('reindexProjectKnowledge', 'all')"
            >
              {{ props.reindexingTarget === 'all' ? '重建中...' : '全量重建' }}
            </button>
            <button
              class="loopy-hero__action"
              type="button"
              :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
              @click="emit('reindexProjectKnowledge', 'stale')"
            >
              {{ props.reindexingTarget === 'stale' ? '重建中...' : '重建 stale' }}
            </button>
            <button
              class="loopy-hero__action"
              type="button"
              :disabled="!hasActiveProject || props.loading || Boolean(props.reindexingTarget)"
              @click="emit('reindexProjectKnowledge', 'failed')"
            >
              {{ props.reindexingTarget === 'failed' ? '重建中...' : '重建 failed' }}
            </button>
            <button class="loopy-hero__action" type="button" :disabled="props.loading" @click="emit('reload')">
              刷新诊断
            </button>
          </div>
        </div>

        <div class="loopy-hero__visual">
          <div class="loopy-hero__visual-stage">
            <img
              class="loopy-hero__visual-image"
              src="/loopy-hero-placeholder.svg"
              alt=""
            >

            <div class="loopy-hero__video-slot" aria-hidden="true">
              <div class="loopy-hero__video-slot-screen">
                <div class="loopy-hero__video-slot-line loopy-hero__video-slot-line--primary" />
                <div class="loopy-hero__video-slot-line loopy-hero__video-slot-line--secondary" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="loopy-hero__aside">
        <section class="loopy-hero__panel">
          <div class="loopy-hero__panel-head">
            <h3>整体进度</h3>
          </div>
          <div class="loopy-hero__progress-layout">
            <div class="loopy-hero__progress-ring" :style="progressRingStyle">
              <div class="loopy-hero__progress-ring-inner">
                <strong>{{ formatPercentLabel(progressPercent) }}</strong>
              </div>
            </div>

            <dl class="loopy-hero__progress-meta">
              <div class="loopy-hero__progress-item">
                <dt>预计剩余</dt>
                <dd>{{ formatEtaSeconds(Number(summary?.etaSeconds || 0)) }}</dd>
              </div>
              <div class="loopy-hero__progress-item">
                <dt>已处理</dt>
                <dd>{{ formatCompactNumber(summary?.readyCount || 0) }}/{{ formatCompactNumber(summary?.indexableResources || 0) }}</dd>
              </div>
              <div class="loopy-hero__progress-item">
                <dt>预计完成</dt>
                <dd>{{ formatDateTime(String(summary?.estimatedFinishedAt || '')) }}</dd>
              </div>
              <div class="loopy-hero__progress-item">
                <dt>最近更新</dt>
                <dd>{{ formatDateTime(String(summary?.lastRefreshedAt || '')) }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="loopy-hero__panel">
          <div class="loopy-hero__panel-head">
            <h3>任务队列</h3>
          </div>
          <div class="loopy-hero__queue">
            <article
              v-for="item in heroQueueItems"
              :key="item.label"
              class="loopy-hero__queue-item"
              :data-tone="item.tone"
            >
              <div class="loopy-hero__queue-item-main">
                <div class="loopy-hero__queue-item-top">
                  <span class="loopy-hero__queue-item-dot" />
                  <strong>{{ item.label }}</strong>
                </div>
                <p>{{ item.meta }}</p>
              </div>
              <div class="loopy-hero__queue-item-side">
                <span class="loopy-hero__queue-status">{{ item.status }}</span>
                <span class="material-symbols-outlined">chevron_right</span>
              </div>
            </article>
          </div>
        </section>
      </aside>
    </section>

    <header class="loopy-workbench__toolbar">
      <div class="loopy-workbench__eyebrow">
        Loopy 数据
      </div>

      <div class="loopy-workbench__switcher" role="tablist" aria-label="Loopy 数据视图切换">
        <button
          v-for="item in viewMeta"
          :key="item.id"
          class="loopy-workbench__switch"
          :data-active="currentView === item.id"
          type="button"
          role="tab"
          :aria-selected="currentView === item.id"
          @click="currentView = item.id"
        >
          <span class="material-symbols-outlined loopy-workbench__switch-icon">{{ item.icon }}</span>
          <span class="loopy-workbench__switch-label">{{ item.label }}</span>
        </button>
      </div>
    </header>

    <WorkspaceLoopyDataHealthView
      v-if="currentView === 'health'"
      :active-project="props.activeProject"
      :active-project-id="props.activeProjectId"
      :dashboard="props.dashboard"
      :loading="props.loading"
      :error="props.error"
      :reindexing-target="props.reindexingTarget"
      :retrying-source-id="props.retryingSourceId"
      @reload="emit('reload')"
      @reindex-project-knowledge="emit('reindexProjectKnowledge', $event)"
      @reindex-project-knowledge-source="emit('reindexProjectKnowledgeSource', $event)"
    />

    <ClientOnly v-else-if="currentView === 'relations'">
      <WorkspaceLoopyDataRelationsView :project-id="props.activeProjectId" />
    </ClientOnly>

    <ClientOnly v-else>
      <WorkspaceLoopyDataSemanticSpace
        :project-id="props.activeProjectId"
        :dashboard="props.dashboard"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
.loopy-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 332px;
  gap: 14px;
  padding: 16px;
  border: 1px solid #dbe8f7;
  border-radius: 20px;
  background:
    radial-gradient(circle at 14% 14%, rgba(96, 169, 255, 0.13), transparent 26%),
    radial-gradient(circle at 58% 24%, rgba(133, 193, 255, 0.18), transparent 20%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(247, 251, 255, 0.96) 42%, rgba(242, 248, 255, 0.98));
  box-shadow: 0 24px 56px rgba(28, 61, 108, 0.08);
  overflow: hidden;
}

.loopy-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.56), transparent 22%, transparent 78%, rgba(255, 255, 255, 0.32)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.3), transparent 24%);
  pointer-events: none;
}

.loopy-hero__main {
  display: grid;
  grid-template-columns: minmax(620px, 1.06fr) minmax(340px, 0.94fr);
  gap: 14px;
  min-width: 0;
  align-items: stretch;
}

.loopy-hero__copy,
.loopy-hero__visual,
.loopy-hero__aside,
.loopy-hero__panel {
  position: relative;
  z-index: 1;
}

.loopy-hero__copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  min-width: 0;
}

.loopy-hero__meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.loopy-hero__eyebrow {
  color: #6983aa;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.loopy-hero__project-chip {
  display: inline-flex;
  align-items: center;
  max-width: min(100%, 320px);
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(178, 202, 234, 0.8);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #5a7398;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loopy-hero__wordmark {
  --winloop-text-logo-width: clamp(152px, 12vw, 198px);
}

.loopy-hero__headline-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.loopy-hero__title {
  margin: 0;
  color: #1d2d48;
  font-size: clamp(22px, 1.9vw, 32px);
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1.08;
}

.loopy-hero__subtitle {
  max-width: 560px;
  margin: 0;
  color: #60779c;
  font-size: 13px;
  line-height: 1.58;
}

.loopy-hero__metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.loopy-hero__metric-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 76px;
  padding: 10px 12px 10px;
  border: 1px solid rgba(224, 234, 248, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 28px rgba(40, 74, 121, 0.06);
}

.loopy-hero__metric-card[data-tone='accent'] {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 251, 255, 0.94));
}

.loopy-hero__metric-card[data-tone='healthy'] {
  background: linear-gradient(180deg, rgba(245, 255, 250, 0.98), rgba(236, 253, 244, 0.92));
}

.loopy-hero__metric-card[data-tone='warning'] {
  background: linear-gradient(180deg, rgba(255, 251, 240, 0.98), rgba(255, 245, 218, 0.94));
}

.loopy-hero__metric-card[data-tone='danger'] {
  background: linear-gradient(180deg, rgba(255, 245, 245, 0.98), rgba(255, 234, 234, 0.94));
}

.loopy-hero__metric-label {
  color: #6b84a7;
  font-size: 11px;
  font-weight: 700;
}

.loopy-hero__metric-value {
  color: #1f3354;
  font-size: clamp(17px, 1.4vw, 20px);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
}

.loopy-hero__metric-card[data-tone='healthy'] .loopy-hero__metric-value {
  color: #15875c;
}

.loopy-hero__metric-card[data-tone='warning'] .loopy-hero__metric-value {
  color: #b67a12;
}

.loopy-hero__metric-card[data-tone='danger'] .loopy-hero__metric-value {
  color: #c5515a;
}

.loopy-hero__metric-note {
  display: block;
  color: #7f95b5;
  font-size: 10px;
  line-height: 1.35;
}

.loopy-hero__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.loopy-hero__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid #d2e0f3;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: #51709b;
  font-size: 13px;
  font-weight: 800;
  box-shadow: 0 12px 24px rgba(45, 76, 123, 0.05);
  transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, color 0.18s ease;
}

.loopy-hero__action:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 28px rgba(45, 76, 123, 0.08);
}

.loopy-hero__action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.loopy-hero__action--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4174ff, #2d5ce6);
  color: #ffffff;
  box-shadow: 0 16px 32px rgba(44, 93, 230, 0.24);
}

.loopy-hero__visual {
  min-height: 258px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loopy-hero__visual-stage {
  position: relative;
  width: 100%;
  min-height: 258px;
  height: 100%;
  border: 1px solid rgba(222, 234, 248, 0.92);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(243, 248, 255, 0.96));
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.loopy-hero__visual-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.loopy-hero__video-slot {
  position: absolute;
  left: 50%;
  bottom: 12px;
  width: min(44%, 248px);
  height: 62px;
  padding: 8px;
  border: 1px solid rgba(125, 178, 255, 0.44);
  border-radius: 24px;
  background: rgba(225, 239, 255, 0.42);
  box-shadow:
    0 16px 34px rgba(85, 146, 245, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.56);
  backdrop-filter: blur(16px);
  transform: translateX(-50%);
}

.loopy-hero__video-slot-screen {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 0 18px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(182, 213, 255, 0.34), rgba(168, 204, 255, 0.2));
}

.loopy-hero__video-slot-line {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(135, 182, 255, 0.58), rgba(184, 216, 255, 0.36));
}

.loopy-hero__video-slot-line--primary {
  width: 84%;
}

.loopy-hero__video-slot-line--secondary {
  width: 66%;
}

.loopy-hero__aside {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.loopy-hero__panel {
  padding: 14px;
  border: 1px solid rgba(219, 232, 247, 0.98);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 30px rgba(36, 67, 112, 0.06);
}

.loopy-hero__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.loopy-hero__panel-head h3 {
  margin: 0;
  color: #213758;
  font-size: 17px;
  font-weight: 900;
}

.loopy-hero__progress-layout {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.loopy-hero__progress-ring {
  position: relative;
  display: grid;
  place-items: center;
  width: 110px;
  aspect-ratio: 1;
  border-radius: 999px;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.94) 56%, transparent 57%),
    conic-gradient(
      #3f76ff 0 calc(var(--loopy-progress-value) * 1%),
      rgba(216, 226, 240, 0.9) calc(var(--loopy-progress-value) * 1%) 100%
    );
}

.loopy-hero__progress-ring::after {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(223, 232, 243, 0.88);
}

.loopy-hero__progress-ring-inner {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border-radius: 999px;
}

.loopy-hero__progress-ring-inner strong {
  color: #20355a;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.loopy-hero__progress-meta {
  display: grid;
  gap: 8px;
  margin: 0;
}

.loopy-hero__progress-item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.loopy-hero__progress-item dt {
  color: #7c90ae;
  font-size: 12px;
  font-weight: 700;
}

.loopy-hero__progress-item dd {
  margin: 0;
  color: #445d83;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
  word-break: break-word;
}

.loopy-hero__queue {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.loopy-hero__queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 50px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(230, 236, 245, 0.92);
}

.loopy-hero__queue-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.loopy-hero__queue-item-main {
  min-width: 0;
}

.loopy-hero__queue-item-top {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #243a5c;
  font-size: 14px;
}

.loopy-hero__queue-item-main p {
  margin: 4px 0 0;
  color: #7f92ae;
  font-size: 11px;
  line-height: 1.5;
}

.loopy-hero__queue-item-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #d6dfea;
}

.loopy-hero__queue-item[data-tone='ready'] .loopy-hero__queue-item-dot {
  background: #4a7cff;
  box-shadow: 0 0 0 4px rgba(74, 124, 255, 0.12);
}

.loopy-hero__queue-item[data-tone='processing'] .loopy-hero__queue-item-dot {
  background: #50c7f1;
  box-shadow: 0 0 0 4px rgba(80, 199, 241, 0.12);
}

.loopy-hero__queue-item-side {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #6b83a4;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.loopy-workbench__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 2px;
}

.loopy-workbench__eyebrow {
  color: #6b83a4;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.loopy-workbench__switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid #dce7f4;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 20px rgba(36, 73, 125, 0.05);
}

.loopy-workbench__switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #536b8c;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.loopy-workbench__switch[data-active='true'] {
  background: linear-gradient(180deg, #18314d, #11243b);
  color: #f4f8ff;
  box-shadow: 0 10px 22px rgba(17, 36, 59, 0.18);
}

.loopy-workbench__switch-icon {
  font-size: 18px;
}

.loopy-workbench__switch-label {
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 1360px) {
  .loopy-hero {
    grid-template-columns: 1fr;
  }

  .loopy-hero__aside {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1200px) {
  .loopy-hero__main {
    grid-template-columns: 1fr;
  }

  .loopy-hero__metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .loopy-hero__visual {
    min-height: 248px;
  }
}

@media (max-width: 1400px) {
  .loopy-workbench__toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 980px) {
  .loopy-hero {
    padding: 18px;
    border-radius: 22px;
  }

  .loopy-hero__metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .loopy-hero__aside {
    grid-template-columns: 1fr;
  }

  .loopy-hero__progress-layout {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .loopy-hero__progress-meta {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .loopy-hero__title {
    font-size: 28px;
  }

  .loopy-hero__subtitle {
    font-size: 14px;
    line-height: 1.7;
  }

  .loopy-hero__metric-grid {
    grid-template-columns: 1fr;
  }

  .loopy-hero__action {
    width: 100%;
  }

  .loopy-hero__visual {
    min-height: 220px;
  }

  .loopy-hero__visual-stage {
    min-height: 220px;
  }

  .loopy-hero__video-slot {
    width: min(60%, 240px);
    height: 56px;
  }

  .loopy-workbench__switcher {
    width: 100%;
    flex-wrap: wrap;
    border-radius: 22px;
  }

  .loopy-workbench__switch {
    flex: 1 1 calc(50% - 6px);
    justify-content: center;
  }

  .loopy-workbench__switch:last-child {
    flex-basis: 100%;
  }
}
</style>
