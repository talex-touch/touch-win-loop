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
  display: flex;
  flex-direction: column;
  gap: var(--wl-wb-gap-3, 10px);
}

.loopy-workbench__toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  gap: var(--wl-wb-gap-2, 8px);
}

.loopy-workbench__switcher {
  display: inline-flex;
  max-width: 100%;
  gap: 3px;
  overflow-x: auto;
  padding: 3px;
  border: 0;
  border-radius: 12px;
  background: rgba(238, 244, 252, 0.76);
  box-shadow: inset 0 0 0 1px rgba(214, 225, 240, 0.68);
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
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
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
  background: rgba(255, 255, 255, 0.72);
  transform: translateY(-1px);
}

.loopy-workbench__switch[data-active='true'] {
  background: #ffffff;
  color: #173567;
  box-shadow: 0 1px 7px rgba(26, 47, 83, 0.11);
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

@media (max-width: 1240px) {
  .loopy-workbench__switcher {
    width: 100%;
  }
}

:global(html.dark) .loopy-workbench__switcher {
  border-color: rgba(82, 101, 130, 0.82);
  background: rgba(17, 25, 39, 0.72);
  box-shadow: inset 0 0 0 1px rgba(82, 101, 130, 0.7);
}

:global(html.dark) .loopy-workbench__switch[data-active='true'] {
  background: rgba(36, 92, 255, 0.18);
  color: #f2f7ff;
}
</style>
