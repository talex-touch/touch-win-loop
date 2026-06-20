<script setup lang="ts">
import type { Project, ProjectKnowledgeIndexDashboard } from '~~/shared/types/domain'
import { buildLoopyOverviewContract } from '~/utils/loopy-data-center'

type ProjectKnowledgeReindexTarget = 'all' | 'stale' | 'failed'
type LoopyOverviewDetailView = 'composition' | 'pipeline' | 'contract'

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

defineEmits<{
  reload: []
  reindexProjectKnowledge: [target: ProjectKnowledgeReindexTarget]
}>()

const hasActiveProject = computed(() => Boolean(props.activeProject?.id || props.activeProjectId))
const overview = computed(() => props.dashboard ? buildLoopyOverviewContract(props.dashboard) : null)

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
const detailView = ref<LoopyOverviewDetailView>('composition')
const detailTabs: Array<{ id: LoopyOverviewDetailView, label: string }> = [
  { id: 'composition', label: '向量构成' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'contract', label: '契约' },
]
</script>

<template>
  <section class="loopy-center">
    <div class="loopy-center__hero">
      <h2 class="loopy-center__title">
        连接数据，洞察语义，驱动智能
      </h2>
    </div>

    <div class="loopy-center__layout">
      <div class="loopy-center__main">
        <SectionCard
          class="loopy-center__main-card"
          title="Source 状态"
        >
          <template #actions>
            <div class="loopy-center__main-actions">
              <span class="loopy-center__main-pill" :data-tone="analyticsReady ? 'success' : 'warning'">
                {{ analyticsReady ? 'Analytics 就绪' : 'Analytics 待刷新' }}
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
              </article>
            </div>

            <div class="loopy-center__surface">
              <div class="loopy-center__surface-head loopy-center__surface-grid">
                <span>Source</span>
                <span>索引覆盖</span>
                <span>Embeddings 接入</span>
                <span>动作</span>
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

                <div class="loopy-center__status-block" :title="item.embeddingLabel">
                  <span class="loopy-center__status-chip" :data-tone="item.embeddingTone">
                    {{ item.embeddingTone === 'success' ? '可用' : item.embeddingTone === 'danger' ? '未就绪' : '等待中' }}
                  </span>
                  <p>{{ item.pipelineLabel }}</p>
                </div>

                <div class="loopy-center__issue-block" :title="item.issueLabel">
                  <span class="loopy-center__status-chip" :data-tone="item.issueTone">
                    {{ item.issueTone === 'danger' ? '需处理' : item.issueTone === 'warning' ? '需关注' : '稳定' }}
                  </span>
                </div>
              </article>

              <div v-if="overview.sourceCards.length === 0" class="loopy-center__inline-empty">
                当前没有 source 状态可供映射，通常意味着资源还没入索引或 dashboard 还未同步完成。
              </div>
            </div>
          </template>
        </SectionCard>

        <SectionCard class="loopy-center__detail-card" title="分析详情">
          <template #actions>
            <div class="loopy-center__detail-tabs" role="tablist" aria-label="Loopy 数据详情切换">
              <button
                v-for="tab in detailTabs"
                :key="tab.id"
                class="loopy-center__detail-tab"
                :data-active="detailView === tab.id"
                type="button"
                role="tab"
                :aria-selected="detailView === tab.id"
                @click="detailView = tab.id"
              >
                {{ tab.label }}
              </button>
            </div>
          </template>

          <div v-if="overview" class="loopy-center__detail-body">
            <div v-if="detailView === 'composition'" class="loopy-center__detail-grid">
              <div v-if="overview.composition.length > 0" class="loopy-center__insight-list">
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
                暂无向量构成数据。
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
                </article>
              </div>
            </div>

            <div v-else-if="detailView === 'pipeline'" class="loopy-center__insight-list">
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

            <div v-else class="loopy-center__contract-sections loopy-center__contract-sections--compact">
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
                </article>
              </section>
            </div>
          </div>
          <div v-else class="loopy-center__inline-empty">
            等待 dashboard。
          </div>
        </SectionCard>
      </div>

      <div class="loopy-center__rail">
        <SectionCard
          class="loopy-center__entry"
          title="接入点"
        >
          <div v-if="overview" class="loopy-center__entry-body">
            <div class="loopy-center__entry-head">
              <div class="loopy-center__entry-badge" :data-tone="overview.entry.statusTone">
                <span class="loopy-center__entry-dot" />
                <span>{{ overview.entry.statusLabel }}</span>
              </div>
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
                <dt>维度</dt>
                <dd>{{ overview.entry.dimensions }}</dd>
              </div>
              <div class="loopy-center__entry-field">
                <dt>Client</dt>
                <dd>{{ overview.entry.client }}</dd>
              </div>
            </dl>

            <div class="loopy-center__entry-notice">
              {{ overview.entry.summary }}
            </div>
          </div>

          <StateBlock
            v-else
            centered
            tone="loading"
            title="等待接入点"
            description="等待 dashboard。"
          />
        </SectionCard>

        <SectionCard
          class="loopy-center__rail-card"
          title="运行建议"
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
            等待 dashboard。
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
  gap: var(--dc-gap-4);
  padding: 0;
  background: transparent;
}

.loopy-center :deep(.wl-section-card) {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.loopy-center :deep(.wl-section-card__head) {
  gap: var(--dc-gap-3);
  margin-bottom: var(--dc-gap-2);
}

.loopy-center :deep(.wl-section-card__title) {
  font-size: var(--dc-body-size);
  font-weight: 800;
}

.loopy-center :deep(.wl-section-card__description) {
  display: none;
  font-size: var(--dc-caption-size);
}

.loopy-center__hero {
  min-width: 0;
  padding-top: 1px;
}

.loopy-center__title {
  margin: 0;
  color: var(--dc-text);
  font-size: clamp(21px, var(--dc-title-size), 24px);
  font-weight: 900;
  line-height: 1.14;
  letter-spacing: 0;
}

.loopy-center__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: var(--dc-gap-5);
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
  min-width: 0;
  padding-left: var(--dc-gap-4);
  border-left: 1px solid rgba(218, 228, 242, 0.72);
}

.loopy-center__entry-body {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-3);
}

.loopy-center__entry-head {
  display: flex;
  align-items: center;
  gap: var(--dc-gap-2);
}

.loopy-center__entry-summary {
  display: none;
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  line-height: 1.45;
}

.loopy-center__entry-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--dc-gap-2);
  min-height: 24px;
  padding: 0 var(--dc-gap-2);
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
  gap: 0;
}

.loopy-center__entry-field {
  padding: var(--dc-gap-2) 0;
  border: 0;
  border-bottom: 1px solid rgba(218, 228, 242, 0.78);
  border-radius: 0;
  background: transparent;
}

.loopy-center__entry-field:first-child {
  padding-top: 0;
}

.loopy-center__entry-field:last-child {
  padding-bottom: 0;
  border-bottom: 0;
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
  padding: var(--dc-gap-2) 0 0;
  border: 0;
  border-top: 1px dashed rgba(181, 201, 232, 0.72);
  border-radius: 0;
  background: transparent;
  color: var(--dc-text-soft);
  font-size: var(--dc-label-size);
  line-height: 1.6;
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
  min-height: 24px;
  padding: 0 var(--dc-gap-2);
  border-radius: 999px;
  border: 0;
  background: rgba(237, 243, 251, 0.82);
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  font-weight: 800;
}

.loopy-center__main-pill[data-tone='success'],
.loopy-center__status-chip[data-tone='success'] {
  background: var(--dc-success-soft);
  color: var(--dc-success);
}

.loopy-center__main-pill[data-tone='warning'],
.loopy-center__status-chip[data-tone='warning'] {
  background: var(--dc-warning-soft);
  color: var(--dc-warning);
}

.loopy-center__main-pill[data-tone='danger'],
.loopy-center__status-chip[data-tone='danger'] {
  background: var(--dc-danger-soft);
  color: var(--dc-danger);
}

.loopy-center__main-pill[data-tone='primary'],
.loopy-center__status-chip[data-tone='primary'] {
  background: var(--dc-primary-soft);
  color: var(--dc-primary);
}

.loopy-center__metric-grid {
  display: grid;
  gap: 0;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border: 1px solid rgba(218, 228, 242, 0.7);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.38);
}

.loopy-center__metric-card,
.loopy-center__cluster-card {
  padding: var(--dc-gap-2) var(--dc-gap-3);
  border: 0;
  border-right: 1px solid rgba(218, 228, 242, 0.7);
  border-radius: 0;
  background: transparent;
}

.loopy-center__metric-card:last-child {
  border-right: 0;
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
  margin-top: var(--dc-gap-2);
  color: var(--dc-text);
  font-size: var(--dc-metric-size);
  font-weight: 900;
  line-height: 1;
}

.loopy-center__metric-card[data-tone],
.loopy-center__cluster-card[data-tone] {
  background: transparent;
}

.loopy-center__cluster-card p {
  margin: var(--dc-gap-1) 0 0;
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  line-height: 1.55;
}

.loopy-center__surface {
  margin-top: var(--dc-gap-4);
  overflow: visible;
}

.loopy-center__surface-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.32fr) minmax(140px, 0.66fr) minmax(132px, 0.56fr) minmax(104px, 0.42fr);
  gap: var(--dc-gap-3);
}

.loopy-center__surface-head {
  padding: 0 0 var(--dc-gap-2);
  border-bottom: 1px solid rgba(218, 228, 242, 0.78);
  background: transparent;
  color: var(--dc-text-faint);
  font-size: var(--dc-caption-size);
  font-weight: 800;
  letter-spacing: 0.03em;
}

.loopy-center__surface-row {
  padding: var(--dc-gap-3) 0;
  align-items: center;
  border-top: 0;
  border-bottom: 1px solid rgba(218, 228, 242, 0.64);
  background: transparent;
  transition:
    background-color 0.16s ease,
    transform 0.16s ease;
}

.loopy-center__surface-row:last-child {
  border-bottom: 0;
}

.loopy-center__surface-row:hover {
  background: rgba(248, 251, 255, 0.58);
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

.loopy-center__status-block p,
.loopy-center__issue-block p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loopy-center__progress-track {
  overflow: hidden;
  width: 100%;
  height: 5px;
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

.loopy-center__detail-tabs {
  display: inline-flex;
  gap: 3px;
  padding: 2px;
  border: 0;
  border-radius: 10px;
  background: rgba(244, 248, 255, 0.72);
}

.loopy-center__detail-tab {
  min-height: 26px;
  padding: 0 var(--dc-gap-3);
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dc-text-soft);
  font-size: var(--dc-caption-size);
  font-weight: 800;
}

.loopy-center__detail-tab[data-active='true'] {
  background: #ffffff;
  color: var(--dc-text);
  box-shadow: 0 1px 5px rgba(26, 47, 83, 0.09);
}

.loopy-center__detail-body {
  min-width: 0;
}

.loopy-center__detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.72fr);
  gap: var(--dc-gap-3);
}

.loopy-center__recommendations,
.loopy-center__contract-sections {
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-2);
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
  padding: var(--dc-gap-2) 0;
  border: 0;
  border-bottom: 1px solid rgba(218, 228, 242, 0.78);
  border-radius: 0;
  background: transparent;
}

.loopy-center__insight-item:last-child,
.loopy-center__recommendation:last-child,
.loopy-center__contract-item:last-child,
.loopy-center__legend-item:last-child {
  border-bottom: 0;
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

.loopy-center__recommendation p,
.loopy-center__contract-item p,
.loopy-center__legend-item p {
  display: none;
}

.loopy-center__insight-item b {
  color: var(--dc-text);
  font-size: var(--dc-body-size);
  font-weight: 900;
  white-space: nowrap;
}

.loopy-center__cluster-grid {
  display: grid;
  gap: var(--dc-gap-2);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.loopy-center__cluster-card {
  border-right: 0;
  border-bottom: 1px solid rgba(218, 228, 242, 0.78);
  border-radius: 0;
}

.loopy-center__contract-sections--compact {
  display: grid;
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
  line-height: 1.45;
  word-break: break-word;
}

@media (max-width: 1520px) {
  .loopy-center__surface-grid {
    grid-template-columns: minmax(0, 1.1fr) minmax(150px, 0.7fr) minmax(160px, 0.78fr) minmax(160px, 0.8fr);
  }
}

@media (max-width: 1240px) {
  .loopy-center__layout {
    grid-template-columns: 1fr;
  }

  .loopy-center__rail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding-left: 0;
    border-left: 0;
  }

  .loopy-center__metric-grid,
  .loopy-center__cluster-grid,
  .loopy-center__contract-sections--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .loopy-center__detail-grid,
  .loopy-center__surface-grid {
    grid-template-columns: 1fr;
  }

  .loopy-center__surface-head {
    display: none;
  }
}

@media (max-width: 900px) {
  .loopy-center__metric-grid,
  .loopy-center__rail,
  .loopy-center__cluster-grid,
  .loopy-center__contract-sections--compact {
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
  box-shadow: none;
}

:global(html.dark) .loopy-center__entry-badge,
:global(html.dark) .loopy-center__main-pill,
:global(html.dark) .loopy-center__status-chip {
  background: rgba(13, 18, 28, 0.72);
}

:global(html.dark) .loopy-center__contract-item code {
  background: rgba(255, 255, 255, 0.06);
  color: #f2f7ff;
}
</style>
