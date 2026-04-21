<script setup lang="ts">
import type { Project, ProjectKnowledgeIndexDashboard } from '~~/shared/types/domain'

type ProjectKnowledgeReindexTarget = 'all' | 'stale' | 'failed'
type LoopyWorkbenchView = 'overview' | 'health' | 'relations' | 'semantic'

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

const currentView = ref<LoopyWorkbenchView>('overview')

const viewMeta: Array<{ id: LoopyWorkbenchView, label: string, icon: string, description: string }> = [
  {
    id: 'overview',
    label: '主视图',
    icon: 'space_dashboard',
    description: '数据中心主工作面',
  },
  {
    id: 'health',
    label: '索引健康',
    icon: 'monitor_heart',
    description: '查看完整索引状态与失败项',
  },
  {
    id: 'relations',
    label: '关系探索',
    icon: 'account_tree',
    description: '查看 source / chunk 关系图',
  },
  {
    id: 'semantic',
    label: '语义空间',
    icon: 'scatter_plot',
    description: '查看 Embedding 空间分布',
  },
]
</script>

<template>
  <div
    data-testid="workspace-project-knowledge-index"
    class="loopy-workbench"
  >
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

    <header class="loopy-workbench__toolbar">
      <div class="loopy-workbench__toolbar-copy">
        <span class="loopy-workbench__eyebrow">Loopy Data Views</span>
        <h2 class="loopy-workbench__title">
          {{ currentView === 'overview' ? '继续深入分析' : '切换细化视图' }}
        </h2>
        <p class="loopy-workbench__subtitle">
          主视图负责落地与字段映射，下面三个细化视图继续承接索引健康、关系探索与语义空间。
        </p>
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
          <span class="loopy-workbench__switch-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
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

    <ClientOnly v-else-if="currentView === 'semantic'">
      <WorkspaceLoopyDataSemanticSpace
        :project-id="props.activeProjectId"
        :dashboard="props.dashboard"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
.loopy-workbench {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.loopy-workbench__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.loopy-workbench__toolbar-copy {
  min-width: 0;
}

.loopy-workbench__eyebrow {
  display: inline-block;
  color: #7a8faa;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.loopy-workbench__title {
  margin: 8px 0 0;
  color: #14253a;
  font-size: 20px;
  font-weight: 900;
}

.loopy-workbench__subtitle {
  max-width: 620px;
  margin: 8px 0 0;
  color: #607694;
  font-size: 12px;
  line-height: 1.7;
}

.loopy-workbench__switcher {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.loopy-workbench__switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  min-width: 150px;
  padding: 10px 14px;
  border: 1px solid #d9e5f3;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  color: #4f6788;
  text-align: left;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.loopy-workbench__switch:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(23, 37, 61, 0.08);
}

.loopy-workbench__switch[data-active='true'] {
  border-color: rgba(36, 92, 255, 0.26);
  background: rgba(36, 92, 255, 0.08);
  color: #173567;
}

.loopy-workbench__switch-icon {
  font-size: 19px;
}

.loopy-workbench__switch-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.loopy-workbench__switch-copy strong {
  font-size: 13px;
  font-weight: 800;
}

.loopy-workbench__switch-copy small {
  color: #7186a4;
  font-size: 10px;
  line-height: 1.45;
}

@media (max-width: 1240px) {
  .loopy-workbench__toolbar {
    flex-direction: column;
  }

  .loopy-workbench__switcher {
    justify-content: flex-start;
  }
}

@media (max-width: 780px) {
  .loopy-workbench__switch {
    width: 100%;
  }
}

:global(html.dark) .loopy-workbench__eyebrow {
  color: #8fa7c5;
}

:global(html.dark) .loopy-workbench__title {
  color: #edf4ff;
}

:global(html.dark) .loopy-workbench__subtitle,
:global(html.dark) .loopy-workbench__switch-copy small {
  color: #aec1dc;
}

:global(html.dark) .loopy-workbench__switch {
  border-color: rgba(82, 101, 130, 0.82);
  background: rgba(17, 25, 39, 0.72);
  color: #dfe9f8;
}

:global(html.dark) .loopy-workbench__switch[data-active='true'] {
  border-color: rgba(77, 126, 255, 0.4);
  background: rgba(36, 92, 255, 0.18);
  color: #f2f7ff;
}
</style>
