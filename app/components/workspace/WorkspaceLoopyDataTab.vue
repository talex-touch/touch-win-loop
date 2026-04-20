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
const viewMeta: Array<{ id: LoopyWorkbenchView, label: string, description: string }> = [
  {
    id: 'health',
    label: '索引健康',
    description: '回答系统哪里坏了、坏到什么程度。',
  },
  {
    id: 'relations',
    label: '关系探索',
    description: '回答文档、Chunk、跨模态对象怎么连。',
  },
  {
    id: 'semantic',
    label: '语义空间',
    description: '回答真实 embedding 空间是否成立。',
  },
]
</script>

<template>
  <div
    data-testid="workspace-project-knowledge-index"
    class="space-y-5"
  >
    <header class="loopy-workbench__header">
      <div>
        <div class="loopy-workbench__eyebrow">
          Loopy 数据
        </div>
        <h2 class="loopy-workbench__title">
          状态、结构、语义三层工作台
        </h2>
        <p class="loopy-workbench__subtitle">
          健康页只看诊断，关系页只看连接，3D 页只看真实降维后的语义空间。
        </p>
      </div>

      <div class="loopy-workbench__tabs">
        <button
          v-for="item in viewMeta"
          :key="item.id"
          class="loopy-workbench__tab"
          :data-active="currentView === item.id"
          type="button"
          @click="currentView = item.id"
        >
          <span class="loopy-workbench__tab-label">{{ item.label }}</span>
          <span class="loopy-workbench__tab-desc">{{ item.description }}</span>
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
      <WorkspaceLoopyDataSemanticSpace :project-id="props.activeProjectId" />
    </ClientOnly>
  </div>
</template>

<style scoped>
.loopy-workbench__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.loopy-workbench__eyebrow {
  color: #6b83a4;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.loopy-workbench__title {
  margin: 10px 0 0;
  color: #152842;
  font-size: 30px;
  line-height: 1.12;
  letter-spacing: -0.02em;
}

.loopy-workbench__subtitle {
  margin: 12px 0 0;
  color: #5e7396;
  font-size: 13px;
  line-height: 1.7;
}

.loopy-workbench__tabs {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-width: 680px;
}

.loopy-workbench__tab {
  display: grid;
  gap: 8px;
  min-height: 96px;
  padding: 16px;
  border: 1px solid #dce7f4;
  border-radius: 22px;
  background: linear-gradient(180deg, #fff, #f8fbff);
  color: #4f6788;
  text-align: left;
  box-shadow: 0 12px 28px rgba(36, 73, 125, 0.05);
}

.loopy-workbench__tab[data-active='true'] {
  border-color: #0f2235;
  background:
    radial-gradient(circle at top right, rgba(70, 170, 255, 0.16), transparent 34%),
    linear-gradient(180deg, #13253a, #18324d);
  color: #e8f3ff;
}

.loopy-workbench__tab-label {
  font-size: 16px;
  font-weight: 800;
}

.loopy-workbench__tab-desc {
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1400px) {
  .loopy-workbench__header {
    flex-direction: column;
  }

  .loopy-workbench__tabs {
    min-width: 0;
    width: 100%;
    grid-template-columns: 1fr;
  }
}
</style>
