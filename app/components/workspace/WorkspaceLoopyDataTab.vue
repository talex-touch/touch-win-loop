<script setup lang="ts">
import type { Project, ProjectKnowledgeIndexDashboard } from '~~/shared/types/domain'

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
</script>

<template>
  <div
    data-testid="workspace-project-knowledge-index"
    class="space-y-4"
  >
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
.loopy-workbench__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
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

@media (max-width: 1400px) {
  .loopy-workbench__toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 640px) {
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
