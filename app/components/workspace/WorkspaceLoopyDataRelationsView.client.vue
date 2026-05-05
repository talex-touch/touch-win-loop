<script setup lang="ts">
import type { Edge, Node, NodeMouseEvent } from '@vue-flow/core'
import type {
  ApiResponse,
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeModality,
  ProjectKnowledgeNodeDetail,
  ProjectKnowledgeRelationNodeType,
  ProjectKnowledgeRelationsPayload,
} from '~~/shared/types/domain'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { computed, ref, watch } from 'vue'
import WorkspaceLoopyDataNodeDetail from '~/components/workspace/WorkspaceLoopyDataNodeDetail.vue'
import { useApiEndpoint } from '~/composables/useApiEndpoint'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'

const props = defineProps<{
  projectId?: string
}>()

const { endpoint } = useApiEndpoint()
const loading = ref(false)
const error = ref('')
const payload = ref<ProjectKnowledgeRelationsPayload | null>(null)
const detail = ref<ProjectKnowledgeNodeDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const nodeType = ref<ProjectKnowledgeRelationNodeType | ''>('')
const modality = ref<ProjectKnowledgeModality | 'unknown' | ''>('')
const embeddingStatus = ref<ProjectKnowledgeEmbeddingStatus | ''>('')
const nodeTypeOptions = [
  { value: '', label: '全部' },
  { value: 'source', label: 'Source' },
  { value: 'chunk', label: 'Chunk' },
] as const
const modalityOptions = [
  { value: '', label: '全部' },
  { value: 'text', label: 'text' },
  { value: 'image', label: 'image' },
  { value: 'audio', label: 'audio' },
  { value: 'video', label: 'video' },
  { value: 'draw', label: 'draw' },
  { value: 'unknown', label: 'unknown' },
] as const
const embeddingStatusOptions = [
  { value: '', label: '全部' },
  { value: 'native', label: 'native' },
  { value: 'derived', label: 'derived' },
  { value: 'fallback', label: 'fallback' },
  { value: 'missing', label: 'missing' },
  { value: 'failed', label: 'failed' },
] as const

const visibleNodes = computed(() => {
  const items = (payload.value?.nodes || []).slice().sort((left, right) => right.importance - left.importance)
  return items.slice(0, 140)
})
const visibleNodeIdSet = computed(() => new Set(visibleNodes.value.map(item => item.id)))

const flowNodes = computed<Node[]>(() => {
  const sourceNodes = visibleNodes.value.filter(node => node.nodeType === 'source')
  const chunkNodes = visibleNodes.value.filter(node => node.nodeType === 'chunk')
  return [
    ...sourceNodes.map((node, index) => ({
      id: `source:${node.id}`,
      type: 'default',
      position: { x: 30, y: 40 + (index * 88) },
      data: { label: node.label },
      class: `loopy-relations__node loopy-relations__node--${node.embeddingStatus}`,
    })),
    ...chunkNodes.map((node, index) => ({
      id: `chunk:${node.id}`,
      type: 'default',
      position: { x: 420, y: 40 + (index * 62) },
      data: { label: node.label },
      class: `loopy-relations__node loopy-relations__node--${node.embeddingStatus}`,
    })),
  ]
})

const flowEdges = computed<Edge[]>(() => {
  return (payload.value?.relations || [])
    .filter((relation) => {
      return visibleNodeIdSet.value.has(relation.sourceNodeId) && visibleNodeIdSet.value.has(relation.targetNodeId)
    })
    .slice(0, 220)
    .map((relation) => {
      const isAligned = relation.relationType === 'aligned_to'
      return {
        id: relation.id,
        source: `${relation.sourceNodeType}:${relation.sourceNodeId}`,
        target: `${relation.targetNodeType}:${relation.targetNodeId}`,
        label: relation.relationType,
        animated: relation.relationType === 'aligned_to' || relation.relationType === 'references',
        class: `loopy-relations__edge loopy-relations__edge--${isAligned ? 'aligned' : relation.relationType}`,
      }
    })
})

async function loadRelations(): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  if (!projectId) {
    payload.value = null
    return
  }

  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (nodeType.value)
      params.set('nodeType', nodeType.value)
    if (modality.value)
      params.set('modality', modality.value)
    if (embeddingStatus.value)
      params.set('embeddingStatus', embeddingStatus.value)
    const response = await unsafeFetch<ApiResponse<ProjectKnowledgeRelationsPayload>>(
      `${endpoint(`/projects/${projectId}/knowledge/relations`)}${params.toString() ? `?${params.toString()}` : ''}`,
    )
    payload.value = response.data || null
  }
  catch (fetchError: any) {
    error.value = String(fetchError?.data?.message || '加载关系探索失败，请稍后重试。').trim() || '加载关系探索失败，请稍后重试。'
  }
  finally {
    loading.value = false
  }
}

async function loadNodeDetail(nodeId: string, selectedNodeType: ProjectKnowledgeRelationNodeType): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  if (!projectId || !nodeId)
    return
  detailLoading.value = true
  detailError.value = ''
  try {
    const query = new URLSearchParams({
      nodeId,
      nodeType: selectedNodeType,
    })
    const response = await unsafeFetch<ApiResponse<ProjectKnowledgeNodeDetail>>(
      `${endpoint(`/projects/${projectId}/knowledge/node-detail`)}?${query.toString()}`,
    )
    detail.value = response.data || null
  }
  catch (fetchError: any) {
    detail.value = null
    detailError.value = String(fetchError?.data?.message || '加载节点详情失败，请稍后重试。').trim() || '加载节点详情失败，请稍后重试。'
  }
  finally {
    detailLoading.value = false
  }
}

function handleNodeClick(event: NodeMouseEvent): void {
  const [selectedNodeType, nodeId] = String(event.node.id || '').split(':')
  if ((selectedNodeType === 'source' || selectedNodeType === 'chunk') && nodeId)
    void loadNodeDetail(nodeId, selectedNodeType)
}

watch(() => [props.projectId, nodeType.value, modality.value, embeddingStatus.value], () => {
  detail.value = null
  detailError.value = ''
  void loadRelations()
}, { immediate: true })
</script>

<template>
  <div class="loopy-relations">
    <aside class="loopy-relations__filters">
      <div class="loopy-relations__filters-head">
        <h3>关系探索</h3>
        <button class="loopy-relations__button" type="button" :disabled="loading" @click="loadRelations">
          刷新
        </button>
      </div>
      <label class="loopy-relations__field">
        <span>节点类型</span>
        <UiSelect v-model="nodeType" :options="nodeTypeOptions" size="xs" aria-label="节点类型" class="w-full" />
      </label>
      <label class="loopy-relations__field">
        <span>模态</span>
        <UiSelect v-model="modality" :options="modalityOptions" size="xs" aria-label="模态" class="w-full" />
      </label>
      <label class="loopy-relations__field">
        <span>Embedding 状态</span>
        <UiSelect v-model="embeddingStatus" :options="embeddingStatusOptions" size="xs" aria-label="Embedding 状态" class="w-full" />
      </label>

      <div class="loopy-relations__stats">
        <article>
          <span>节点</span>
          <strong>{{ payload?.nodes.length || 0 }}</strong>
        </article>
        <article>
          <span>关系</span>
          <strong>{{ payload?.relations.length || 0 }}</strong>
        </article>
        <article>
          <span>Analytics</span>
          <strong>{{ payload?.analytics.allReady ? 'ready' : 'stale' }}</strong>
        </article>
      </div>
    </aside>

    <section class="loopy-relations__graph-shell">
      <div v-if="loading" class="loopy-relations__empty">
        正在加载关系图...
      </div>
      <div v-else-if="error" class="loopy-relations__empty loopy-relations__empty--error">
        {{ error }}
      </div>
      <div v-else-if="!payload || payload.relations.length === 0" class="loopy-relations__empty">
        当前没有可展示的关系数据。
      </div>
      <VueFlow
        v-else
        class="loopy-relations__graph"
        :nodes="flowNodes"
        :edges="flowEdges"
        :fit-view-on-init="true"
        :nodes-draggable="true"
        :elements-selectable="true"
        @node-click="handleNodeClick"
      >
        <Background />
        <Controls />
        <MiniMap />
      </VueFlow>
    </section>

    <WorkspaceLoopyDataNodeDetail
      :detail="detail"
      :loading="detailLoading"
      :error="detailError"
      empty-label="点击图中的 source / chunk 节点查看右侧详情"
    />
  </div>
</template>

<style scoped>
.loopy-relations {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 320px;
  gap: 16px;
  min-height: 720px;
}

.loopy-relations__filters,
.loopy-relations__graph-shell {
  border: 1px solid #dbe7f3;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(36, 73, 125, 0.05);
}

.loopy-relations__filters {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.loopy-relations__filters-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.loopy-relations__filters-head h3 {
  margin: 0;
  color: #182c48;
  font-size: 14px;
  font-weight: 800;
}

.loopy-relations__button,
.loopy-relations__field select {
  min-height: 34px;
  border: 1px solid #d6e4f3;
  border-radius: 12px;
  background: #fff;
  color: #355274;
  font-size: 12px;
}

.loopy-relations__button {
  padding: 0 12px;
  font-weight: 700;
}

.loopy-relations__field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #5d7698;
}

.loopy-relations__field select {
  width: 100%;
  padding: 0 10px;
}

.loopy-relations__stats {
  display: grid;
  gap: 10px;
  margin-top: auto;
}

.loopy-relations__stats article {
  padding: 12px;
  border: 1px solid #dce7f4;
  border-radius: 16px;
  background: #f8fbff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #6980a0;
  font-size: 12px;
}

.loopy-relations__stats strong {
  color: #16283f;
  font-size: 14px;
}

.loopy-relations__graph-shell {
  min-height: 720px;
  overflow: hidden;
}

.loopy-relations__graph,
.loopy-relations__empty {
  width: 100%;
  height: 100%;
}

.loopy-relations__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b82a2;
  font-size: 13px;
}

.loopy-relations__empty--error {
  color: #b45309;
}

:deep(.loopy-relations__node) {
  border-radius: 18px;
  padding: 10px 12px;
  border: 1px solid #dce7f4;
  background: #fff;
  color: #18304a;
  font-size: 12px;
  box-shadow: 0 10px 26px rgba(31, 71, 122, 0.08);
}

:deep(.loopy-relations__node--native),
:deep(.loopy-relations__node--derived) {
  border-color: #cfe9df;
  background: #f4fbf7;
}
:deep(.loopy-relations__node--fallback) {
  border-color: #f3ddad;
  background: #fff8eb;
}
:deep(.loopy-relations__node--failed) {
  border-color: #efc9c9;
  background: #fff4f4;
}

:deep(.loopy-relations__edge--aligned path) {
  stroke: #00a6d6;
  stroke-dasharray: 6 4;
}

@media (max-width: 1440px) {
  .loopy-relations {
    grid-template-columns: 1fr;
  }

  .loopy-relations__graph-shell {
    min-height: 540px;
  }
}
</style>
