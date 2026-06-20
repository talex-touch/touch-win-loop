<script setup lang="ts">
import type { Project, ProjectKnowledgeIndexDashboard, Resource } from '~~/shared/types/domain'

type ProjectKnowledgeReindexTarget = 'all' | 'stale' | 'failed'
type LoopyWorkbenchView = 'overview' | 'health' | 'relations' | 'semantic' | 'workflows'

const props = withDefaults(defineProps<{
  activeProject?: Project | null
  activeProjectId?: string
  selectedResources?: Resource[]
  dashboard?: ProjectKnowledgeIndexDashboard | null
  loading?: boolean
  error?: string
  reindexingTarget?: ProjectKnowledgeReindexTarget | ''
  retryingSourceId?: string
}>(), {
  activeProject: null,
  activeProjectId: '',
  selectedResources: () => [],
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

const currentView = ref<LoopyWorkbenchView>('overview')

const viewMeta: Array<{ id: LoopyWorkbenchView, label: string, icon: string }> = [
  {
    id: 'overview',
    label: '主视图',
    icon: 'space_dashboard',
  },
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
  {
    id: 'workflows',
    label: '智能工作流',
    icon: 'account_tree',
  },
]
</script>

<template>
  <div
    data-testid="workspace-project-knowledge-index"
    class="loopy-workbench"
  >
    <header class="loopy-workbench__toolbar">
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

    <WorkspaceLoopyDataOverviewView
      v-if="currentView === 'overview'"
      :active-project="props.activeProject"
      :active-project-id="props.activeProjectId"
      :dashboard="props.dashboard"
      :loading="props.loading"
      :error="props.error"
      :reindexing-target="props.reindexingTarget"
      @reload="emit('reload')"
      @reindex-project-knowledge="emit('reindexProjectKnowledge', $event)"
    />

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

    <ClientOnly v-else-if="currentView === 'semantic'">
      <WorkspaceLoopyDataSemanticSpace
        :project-id="props.activeProjectId"
        :dashboard="props.dashboard"
      />
    </ClientOnly>

    <WorkspaceLoopyDataWorkflowsView
      v-else-if="currentView === 'workflows'"
      :active-project="props.activeProject"
      :active-project-id="props.activeProjectId"
      :selected-resources="props.selectedResources"
    />
  </div>
</template>

<style scoped>
.loopy-workbench {
  --wl-wb-gap-1: 0px;
  --wl-wb-gap-2: 0px;
  --wl-wb-gap-3: 0px;
  --wl-wb-gap-4: 0px;
  --wl-wb-gap-5: 0px;
  --wl-wb-gap-6: 0px;
  --wl-wb-shell-padding: 0px;
  --wl-wb-panel-padding: 0px;
  --wl-wb-card-padding: 0px;
  --wl-wb-shell-radius: 0px;
  --wl-wb-panel-radius: 0px;
  --wl-wb-card-radius: 0px;
  --wl-wb-shell-bg: transparent;
  --wl-wb-panel-bg: transparent;
  --wl-wb-card-bg: transparent;
  --wl-wb-shell-border: #dbe4ef;
  --wl-wb-panel-border: #dbe4ef;
  --wl-wb-shell-shadow: none;
  --wl-wb-control-height: 30px;
  --wl-wb-control-padding-x: 8px;
  --wl-wb-chip-height: 24px;
  --wl-wb-linear-border: #dbe4ef;
  --wl-wb-linear-border-soft: #eef3f8;
  --wl-wb-linear-text: #16263d;
  --wl-wb-linear-muted: #64748b;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  color: var(--wl-wb-linear-text);
}

.loopy-workbench__toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  gap: 0;
  border-bottom: 1px solid var(--wl-wb-linear-border);
}

.loopy-workbench__switcher {
  display: inline-flex;
  max-width: 100%;
  gap: 0;
  overflow-x: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  scroll-behavior: smooth;
  scrollbar-width: none;
}

.loopy-workbench__switcher::-webkit-scrollbar {
  display: none;
}

.loopy-workbench__switch {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #4f6788;
  text-align: center;
  white-space: nowrap;
  box-shadow: none;
  transition:
    background-color 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.loopy-workbench__switch:hover {
  background: transparent;
  color: #173567;
  transform: none;
}

.loopy-workbench__switch[data-active='true'] {
  background: transparent;
  color: #173567;
  box-shadow: inset 0 -2px 0 #173567;
}

.loopy-workbench__switch:focus-visible {
  outline: 2px solid rgba(36, 92, 255, 0.28);
  outline-offset: 2px;
}

.loopy-workbench__switch-icon {
  font-size: 16px;
}

.loopy-workbench__switch-label {
  font-size: var(--wl-wb-label-size, 12px);
  font-weight: 800;
}

.loopy-workbench :deep(.loopy-center),
.loopy-workbench :deep(.loopy-health),
.loopy-workbench :deep(.loopy-relations),
.loopy-workbench :deep(.loopy-embedding),
.loopy-workbench :deep(.workflow-workbench),
.loopy-workbench :deep(.loopy-detail) {
  gap: 0 !important;
  padding: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.loopy-workbench :deep(.loopy-center__layout),
.loopy-workbench :deep(.loopy-center__main),
.loopy-workbench :deep(.loopy-center__rail),
.loopy-workbench :deep(.loopy-health__hero),
.loopy-workbench :deep(.loopy-health__grid),
.loopy-workbench :deep(.loopy-health__freshness-grid),
.loopy-workbench :deep(.loopy-relations),
.loopy-workbench :deep(.workflow-workbench__layout) {
  gap: 0 !important;
}

.loopy-workbench :deep(.loopy-center__rail),
.loopy-workbench :deep(.loopy-relations__filters),
.loopy-workbench :deep(.loopy-detail) {
  border-left: 1px solid var(--wl-wb-linear-border) !important;
  padding-left: 12px !important;
}

.loopy-workbench :deep(.loopy-relations__graph-shell),
.loopy-workbench :deep(.loopy-embedding__scene-shell),
.loopy-workbench :deep(.loopy-embedding__empty) {
  border-radius: 0 !important;
}

.loopy-workbench :deep(.wl-section-card),
.loopy-workbench :deep(.loopy-center__entry-body),
.loopy-workbench :deep(.loopy-center__metric-card),
.loopy-workbench :deep(.loopy-center__cluster-card),
.loopy-workbench :deep(.loopy-center__surface),
.loopy-workbench :deep(.loopy-center__surface-row),
.loopy-workbench :deep(.loopy-center__insight-item),
.loopy-workbench :deep(.loopy-center__recommendation),
.loopy-workbench :deep(.loopy-center__contract-item),
.loopy-workbench :deep(.loopy-center__legend-item),
.loopy-workbench :deep(.loopy-health__hero-copy),
.loopy-workbench :deep(.loopy-health__hero-panel),
.loopy-workbench :deep(.loopy-health__card),
.loopy-workbench :deep(.loopy-health__summary-card),
.loopy-workbench :deep(.loopy-health__freshness-card),
.loopy-workbench :deep(.loopy-health__issue),
.loopy-workbench :deep(.loopy-health__pipeline-item),
.loopy-workbench :deep(.loopy-health__metric-chip),
.loopy-workbench :deep(.loopy-health__list-item),
.loopy-workbench :deep(.loopy-health__message),
.loopy-workbench :deep(.loopy-relations__filters),
.loopy-workbench :deep(.loopy-relations__graph-shell),
.loopy-workbench :deep(.loopy-relations__stats article),
.loopy-workbench :deep(.loopy-relations__node),
.loopy-workbench :deep(.loopy-embedding__scene-shell),
.loopy-workbench :deep(.loopy-embedding__metric-card),
.loopy-workbench :deep(.loopy-embedding__empty),
.loopy-workbench :deep(.loopy-embedding__tooltip),
.loopy-workbench :deep(.workflow-workbench__error),
.loopy-workbench :deep(.workflow-workbench__hint),
.loopy-workbench :deep(.loopy-detail),
.loopy-workbench :deep(.loopy-detail__hero),
.loopy-workbench :deep(.loopy-detail__meta-card),
.loopy-workbench :deep(.loopy-detail__section),
.loopy-workbench :deep(.loopy-detail__empty),
.loopy-workbench :deep(.loopy-detail__row) {
  margin: 0 !important;
  padding: 8px 0 !important;
  border: 0 !important;
  border-top: 1px solid var(--wl-wb-linear-border-soft) !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.loopy-workbench :deep(.loopy-center__hero),
.loopy-workbench :deep(.loopy-embedding__header),
.loopy-workbench :deep(.workflow-workbench__header) {
  margin: 0 !important;
  padding: 8px 0 !important;
  border-bottom: 1px solid var(--wl-wb-linear-border) !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.loopy-workbench :deep(.loopy-center__surface-head),
.loopy-workbench :deep(.loopy-health__card-head),
.loopy-workbench :deep(.loopy-health__progress-head),
.loopy-workbench :deep(.loopy-relations__filters-head),
.loopy-workbench :deep(.loopy-detail__section h4) {
  margin: 0 !important;
  padding: 8px 0 !important;
  border-bottom: 1px solid var(--wl-wb-linear-border-soft) !important;
  border-radius: 0 !important;
}

.loopy-workbench :deep(.loopy-center__main-pill),
.loopy-workbench :deep(.loopy-center__status-chip),
.loopy-workbench :deep(.loopy-center__entry-badge),
.loopy-workbench :deep(.loopy-health__badge),
.loopy-workbench :deep(.loopy-health__pill),
.loopy-workbench :deep(.loopy-health__action),
.loopy-workbench :deep(.loopy-health__inline-action),
.loopy-workbench :deep(.loopy-relations__button),
.loopy-workbench :deep(.loopy-relations__field select),
.loopy-workbench :deep(.loopy-embedding__control),
.loopy-workbench :deep(.loopy-embedding__legend-item),
.loopy-workbench :deep(.workflow-workbench__action),
.loopy-workbench :deep(.workflow-editor__primary),
.loopy-workbench :deep(.workflow-editor__secondary),
.loopy-workbench :deep(.workflow-editor__danger),
.loopy-workbench :deep(.workflow-editor__chip),
.loopy-workbench :deep(.workflow-editor__field input),
.loopy-workbench :deep(.workflow-editor__field textarea),
.loopy-workbench :deep(.workflow-editor__field select),
.loopy-workbench :deep(.workflow-editor__step-actions button),
.loopy-workbench :deep(.workflow-runs__review-actions button),
.loopy-workbench :deep(.workflow-runs__destructive-pill) {
  border-radius: 0 !important;
  box-shadow: none !important;
}

.loopy-workbench :deep(.workflow-workbench__layout) {
  gap: 18px !important;
}

.loopy-workbench :deep(.workflow-editor) {
  gap: 0 !important;
}

.loopy-workbench :deep(.workflow-runs) {
  gap: 10px !important;
}

.loopy-workbench :deep(.loopy-center__progress-track),
.loopy-workbench :deep(.loopy-health__progress-track),
.loopy-workbench :deep(.loopy-health__bar-track) {
  border-radius: 0 !important;
}

.loopy-workbench :deep(.loopy-center__progress-bar),
.loopy-workbench :deep(.loopy-health__progress-fill),
.loopy-workbench :deep(.loopy-health__bar-fill) {
  border-radius: 0 !important;
  background-image: none !important;
}

.loopy-workbench :deep(.loopy-health__matrix-cell),
.loopy-workbench :deep(.loopy-health__matrix-header) {
  border-radius: 0 !important;
}

.loopy-workbench :deep(.loopy-center__title),
.loopy-workbench :deep(.loopy-health__title),
.loopy-workbench :deep(.loopy-embedding__title-row h3),
.loopy-workbench :deep(.workflow-workbench__title) {
  margin: 0 !important;
  font-size: 18px !important;
  line-height: 1.25 !important;
}

.loopy-workbench :deep(.loopy-health--ops) {
  display: flex !important;
  flex-direction: column !important;
  gap: 16px !important;
  padding: 0 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__hero),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__grid),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__freshness-grid) {
  gap: 16px !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__hero-copy),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__hero-panel),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__card),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__summary-card),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__freshness-card),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__message) {
  padding: 16px !important;
  border: 1px solid #dbe7f3 !important;
  border-radius: 0 !important;
  background: #fff !important;
  box-shadow: none !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__hero-copy),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__hero-panel) {
  padding: 18px 20px !important;
  background: #fbfdff !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__summary-card) {
  min-height: 84px !important;
  padding: 14px 12px !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__freshness-card[data-tone='warning']) {
  background: #fff8ea !important;
  border-color: #f3dfb2 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__freshness-card[data-tone='ready']) {
  background: #f4fbf7 !important;
  border-color: #cfe9df !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__issue) {
  padding: 10px 14px !important;
  border: 1px solid transparent !important;
  border-radius: 0 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__issue[data-severity='error']) {
  background: #fff4f4 !important;
  color: #b45309 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__issue[data-severity='warning']) {
  background: #fff8ea !important;
  color: #a16207 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__issue[data-severity='info']) {
  background: #f4f9ff !important;
  color: #33557c !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__card-head),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__progress-head) {
  margin: 0 !important;
  padding: 0 0 10px !important;
  border-bottom: 1px solid var(--wl-wb-linear-border-soft) !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__title) {
  margin: 10px 0 0 !important;
  font-size: 20px !important;
  line-height: 1.35 !important;
  letter-spacing: 0 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__pipeline-item),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__metric-chip),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__list-item) {
  padding: 12px !important;
  border: 1px solid #dce7f4 !important;
  border-radius: 0 !important;
  background: #f8fbff !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__pipeline-item) {
  padding: 12px 0 !important;
  border-width: 0 0 1px !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__pipeline-item[data-status='success']) {
  background: #f4fbf7 !important;
  border-color: #d0eadf !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__pipeline-item[data-status='degraded']) {
  background: #fff8eb !important;
  border-color: #f1dfb1 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__pipeline-item[data-status='failed']),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__pipeline-item[data-status='blocked']) {
  background: #fff4f4 !important;
  border-color: #f0d0d0 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__list-item--failed) {
  background: #fff6f6 !important;
  border-color: #f0d3d3 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__progress-track),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__bar-track),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__progress-fill),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__bar-fill),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__matrix-cell),
.loopy-workbench :deep(.loopy-health--ops .loopy-health__matrix-header) {
  border-radius: 0 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__progress-fill) {
  background: #1d4f82 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__bar-fill) {
  background: #6f8fb0 !important;
}

.loopy-workbench :deep(.loopy-health--ops .loopy-health__bar-fill--rose) {
  background: #c35f70 !important;
}

.loopy-workbench :deep(.loopy-relations--floating) {
  gap: 0 !important;
  border: 1px solid var(--wl-wb-linear-border) !important;
  border-radius: 0 !important;
  background: #f8fbff !important;
  box-shadow: none !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-relations__graph-shell) {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-relations__panel) {
  border: 1px solid #dbe7f3 !important;
  border-radius: 14px !important;
  background: rgba(255, 255, 255, 0.94) !important;
  box-shadow: 0 12px 32px rgba(36, 73, 125, 0.08) !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__hero),
.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__meta-card),
.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__section),
.loopy-workbench :deep(.loopy-relations--floating .loopy-relations__stats article) {
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-relations__panel) {
  min-height: 0 !important;
  padding: 12px !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-relations__detail-panel) {
  padding: 10px 12px !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__hero),
.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__section) {
  padding: 10px 0 !important;
  border: 0 !important;
  border-bottom: 1px solid var(--wl-wb-linear-border-soft) !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__empty) {
  padding: 8px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__meta-card),
.loopy-workbench :deep(.loopy-relations--floating .loopy-relations__stats article) {
  padding: 9px 10px !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__meta-card:nth-child(even)) {
  border-left: 1px solid var(--wl-wb-linear-border-soft) !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-relations__filters-head),
.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__section h4) {
  padding: 0 !important;
  border-bottom: 0 !important;
}

.loopy-workbench :deep(.loopy-relations--floating .loopy-detail__row) {
  padding: 7px 0 !important;
  border-top: 1px solid var(--wl-wb-linear-border-soft) !important;
}

.loopy-workbench :deep(p),
.loopy-workbench :deep(dl),
.loopy-workbench :deep(ol),
.loopy-workbench :deep(ul) {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

@media (max-width: 1240px) {
  .loopy-workbench__switcher {
    width: 100%;
  }
}

:global(html.dark) .loopy-workbench__switcher {
  border-color: rgba(82, 101, 130, 0.82);
  background: transparent;
  box-shadow: none;
}

:global(html.dark) .loopy-workbench__switch[data-active='true'] {
  background: transparent;
  color: #f2f7ff;
}
</style>
