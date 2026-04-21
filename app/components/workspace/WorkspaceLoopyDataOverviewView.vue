<script setup lang="ts">
import type { Project, ProjectKnowledgeIndexDashboard } from '~~/shared/types/domain'
import {
  buildLoopyOverviewContract,
  clampPercent,
  formatPercent,
  resolveHealthLabel,
  resolveHealthTone,
} from '~/utils/loopy-data-center'
import { formatEtaSeconds, formatWorkspaceDateTime as formatDateTime } from '~/utils/workspace-main-panel-formatters'

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

const summaryMeta = computed(() => {
  if (!props.dashboard)
    return []

  return [
    {
      label: '总进度',
      value: formatPercent(progressPercent.value),
    },
    {
      label: '预计剩余',
      value: formatEtaSeconds(Number(props.dashboard.summary.etaSeconds || 0)),
    },
    {
      label: '最近刷新',
      value: formatDateTime(String(props.dashboard.summary.lastRefreshedAt || '')),
    },
  ]
})

const topFreshness = computed(() => {
  if (!props.dashboard)
    return []

  return [
    {
      label: 'Relations',
      value: props.dashboard.analytics.relationsUpdatedAt
        ? formatDateTime(String(props.dashboard.analytics.relationsUpdatedAt))
        : '待生成',
      stale: props.dashboard.analytics.staleKinds.includes('relations'),
    },
    {
      label: 'Snapshot',
      value: props.dashboard.analytics.snapshotUpdatedAt
        ? formatDateTime(String(props.dashboard.analytics.snapshotUpdatedAt))
        : '待生成',
      stale: props.dashboard.analytics.staleKinds.includes('snapshot'),
    },
    {
      label: 'Semantic',
      value: props.dashboard.analytics.semanticLayoutUpdatedAt
        ? formatDateTime(String(props.dashboard.analytics.semanticLayoutUpdatedAt))
        : '待生成',
      stale: props.dashboard.analytics.staleKinds.includes('semantic_layout'),
    },
  ]
})

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
    <header class="loopy-center__header">
      <div class="loopy-center__header-main">
        <div class="loopy-center__kicker-row">
          <span class="loopy-center__kicker">Data Center</span>
          <span class="loopy-center__project-chip">{{ projectTitle }}</span>
          <span class="loopy-center__health-chip" :data-tone="healthTone">
            {{ healthLabel }}
          </span>
        </div>

        <div class="loopy-center__title-wrap">
          <h2 class="loopy-center__title">
            数据中心主视图
          </h2>
          <p class="loopy-center__subtitle">
            参考最新工作台结构收口成真实可接数版本，主区直接复用 dashboard / source / analytics 字段，不再依赖单张静态参考图。
          </p>
        </div>
      </div>

      <div class="loopy-center__header-side">
        <div class="loopy-center__summary-strip">
          <article
            v-for="item in summaryMeta"
            :key="item.label"
            class="loopy-center__summary-item"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>

        <div class="loopy-center__freshness">
          <article
            v-for="item in topFreshness"
            :key="item.label"
            class="loopy-center__freshness-item"
            :data-stale="item.stale"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>
      </div>
    </header>

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
              刷新
            </button>
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
  --dc-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(245, 249, 255, 0.98));
  --dc-surface: rgba(255, 255, 255, 0.88);
  --dc-surface-soft: rgba(244, 248, 255, 0.92);
  --dc-border: rgba(210, 223, 242, 0.92);
  --dc-border-strong: rgba(181, 201, 232, 0.98);
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
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--dc-border);
  border-radius: 24px;
  background: var(--dc-bg);
  box-shadow: 0 24px 54px rgba(23, 37, 61, 0.08);
}

.loopy-center__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.loopy-center__header-main,
.loopy-center__header-side {
  min-width: 0;
}

.loopy-center__header-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loopy-center__kicker-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.loopy-center__kicker {
  color: var(--dc-text-faint);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.loopy-center__project-chip,
.loopy-center__health-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--dc-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--dc-text-soft);
  font-size: 12px;
  font-weight: 700;
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
  font-size: clamp(26px, 2vw, 34px);
  font-weight: 900;
  line-height: 1.06;
  letter-spacing: -0.04em;
}

.loopy-center__subtitle {
  max-width: 760px;
  margin: 8px 0 0;
  color: var(--dc-text-soft);
  font-size: 13px;
  line-height: 1.7;
}

.loopy-center__header-side {
  width: min(100%, 380px);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.loopy-center__summary-strip,
.loopy-center__freshness {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.loopy-center__summary-item,
.loopy-center__freshness-item {
  padding: 12px;
  border: 1px solid var(--dc-border);
  border-radius: 16px;
  background: var(--dc-surface);
}

.loopy-center__summary-item span,
.loopy-center__freshness-item span {
  display: block;
  color: var(--dc-text-faint);
  font-size: 11px;
  font-weight: 700;
}

.loopy-center__summary-item strong,
.loopy-center__freshness-item strong {
  display: block;
  margin-top: 8px;
  color: var(--dc-text);
  font-size: 12px;
  line-height: 1.5;
}

.loopy-center__freshness-item[data-stale='true'] {
  border-color: rgba(183, 121, 31, 0.3);
  background: var(--dc-warning-soft);
}

.loopy-center__grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: 14px;
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
  gap: 14px;
  min-width: 0;
}

.loopy-center__rail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.loopy-center__entry-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.loopy-center__entry-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
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
  gap: 10px;
}

.loopy-center__entry-field {
  padding: 10px 12px;
  border: 1px solid var(--dc-border);
  border-radius: 14px;
  background: var(--dc-surface-soft);
}

.loopy-center__entry-field dt {
  color: var(--dc-text-faint);
  font-size: 11px;
  font-weight: 700;
}

.loopy-center__entry-field dd {
  margin: 6px 0 0;
  color: var(--dc-text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.loopy-center__entry-notice,
.loopy-center__inline-empty {
  padding: 12px 14px;
  border: 1px dashed var(--dc-border-strong);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.52);
  color: var(--dc-text-soft);
  font-size: 12px;
  line-height: 1.7;
}

.loopy-center__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.loopy-center__action {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--dc-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  color: var(--dc-text-soft);
  font-size: 12px;
  font-weight: 800;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.loopy-center__action:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(23, 37, 61, 0.08);
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
  gap: 8px;
}

.loopy-center__main-pill,
.loopy-center__status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--dc-border);
  background: rgba(255, 255, 255, 0.72);
  color: var(--dc-text-soft);
  font-size: 11px;
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
  gap: 10px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.loopy-center__metric-card,
.loopy-center__cluster-card {
  padding: 12px;
  border: 1px solid var(--dc-border);
  border-radius: 16px;
  background: var(--dc-surface-soft);
}

.loopy-center__metric-card span,
.loopy-center__cluster-card span {
  display: block;
  color: var(--dc-text-faint);
  font-size: 11px;
  font-weight: 700;
}

.loopy-center__metric-card strong,
.loopy-center__cluster-card strong {
  display: block;
  margin-top: 10px;
  color: var(--dc-text);
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
}

.loopy-center__metric-card p,
.loopy-center__cluster-card p {
  margin: 8px 0 0;
  color: var(--dc-text-soft);
  font-size: 11px;
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
  margin-top: 14px;
  border: 1px solid var(--dc-border);
  border-radius: 18px;
  overflow: hidden;
}

.loopy-center__surface-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.9fr) minmax(220px, 0.9fr) minmax(240px, 1fr);
  gap: 12px;
}

.loopy-center__surface-head {
  padding: 12px 14px;
  background: rgba(244, 248, 255, 0.84);
  color: var(--dc-text-faint);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.loopy-center__surface-row {
  padding: 14px;
  align-items: center;
  border-top: 1px solid var(--dc-border);
  background: rgba(255, 255, 255, 0.62);
}

.loopy-center__source-meta strong,
.loopy-center__progress strong {
  display: block;
  color: var(--dc-text);
  font-size: 13px;
  font-weight: 800;
}

.loopy-center__source-meta span,
.loopy-center__source-meta time,
.loopy-center__progress span,
.loopy-center__status-block p,
.loopy-center__issue-block p {
  display: block;
  margin-top: 6px;
  color: var(--dc-text-soft);
  font-size: 11px;
  line-height: 1.55;
}

.loopy-center__progress-track {
  overflow: hidden;
  width: 100%;
  height: 7px;
  margin-bottom: 8px;
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
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.loopy-center__stack,
.loopy-center__recommendations,
.loopy-center__contract-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loopy-center__insight-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loopy-center__insight-item,
.loopy-center__recommendation,
.loopy-center__contract-item,
.loopy-center__legend-item {
  padding: 12px;
  border: 1px solid var(--dc-border);
  border-radius: 14px;
  background: var(--dc-surface-soft);
}

.loopy-center__insight-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.loopy-center__insight-item strong,
.loopy-center__recommendation strong,
.loopy-center__contract-item strong,
.loopy-center__legend-item strong {
  display: block;
  color: var(--dc-text);
  font-size: 12px;
  font-weight: 800;
}

.loopy-center__insight-item span,
.loopy-center__recommendation p,
.loopy-center__contract-item p,
.loopy-center__legend-item p {
  display: block;
  margin-top: 6px;
  color: var(--dc-text-soft);
  font-size: 11px;
  line-height: 1.6;
}

.loopy-center__insight-item b {
  color: var(--dc-text);
  font-size: 14px;
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
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.loopy-center__contract-section h3 {
  margin: 0 0 10px;
  color: var(--dc-text);
  font-size: 13px;
  font-weight: 900;
}

.loopy-center__contract-item code {
  display: block;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(21, 32, 49, 0.06);
  color: var(--dc-text);
  font-family: var(--wl-font-mono);
  font-size: 10px;
  line-height: 1.6;
  word-break: break-word;
}

.loopy-center__legend-list {
  display: grid;
  gap: 8px;
}

.loopy-center__legend-item[data-tone='loading'] {
  background: rgba(36, 92, 255, 0.06);
}

@media (max-width: 1520px) {
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
  .loopy-center__header {
    flex-direction: column;
  }

  .loopy-center__header-side {
    width: 100%;
  }

  .loopy-center__grid {
    grid-template-columns: 1fr;
  }

  .loopy-center__rail {
    grid-template-columns: 1fr;
  }

  .loopy-center__metric-grid,
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
  .loopy-center {
    padding: 14px;
    border-radius: 20px;
  }

  .loopy-center__summary-strip,
  .loopy-center__freshness,
  .loopy-center__metric-grid,
  .loopy-center__lower,
  .loopy-center__cluster-grid {
    grid-template-columns: 1fr;
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
  box-shadow: 0 24px 54px rgba(3, 6, 11, 0.42);
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
