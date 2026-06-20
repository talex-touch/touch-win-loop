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
const selectedFlowNodeId = ref('')
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

function resolveNodeColor(status: ProjectKnowledgeEmbeddingStatus): string {
  if (status === 'native')
    return '#0f9f62'
  if (status === 'derived')
    return '#0ea5e9'
  if (status === 'fallback')
    return '#d97706'
  if (status === 'failed')
    return '#d14b66'
  return '#6b7280'
}

function relationLabel(value: string): string {
  if (value === 'belongs_to')
    return '归属'
  if (value === 'derived_from')
    return '派生'
  if (value === 'similar_to')
    return '相似'
  if (value === 'aligned_to')
    return '对齐'
  if (value === 'references')
    return '引用'
  if (value === 'duplicated_with')
    return '重复'
  return value
}

function createSimulatedRelationsPayload(projectId: string): ProjectKnowledgeRelationsPayload {
  const now = new Date().toISOString()
  const sourceLabels = ['竞赛规则', '项目方案', '技术架构', '数据证据', '答辩脚本']
  const chunkLabels = [
    ['评分指标', '提交材料', '资格约束', '时间节点'],
    ['用户场景', '需求闭环', '价值假设', '交付路径'],
    ['RAG 编排', '多模态索引', '实时协同', '部署链路'],
    ['样本分布', '质量检查', '引用证据', '指标趋势'],
    ['评委问题', '风险追问', '演示路线', '复盘结论'],
  ]
  const statuses: ProjectKnowledgeEmbeddingStatus[] = ['native', 'derived', 'fallback', 'native', 'derived']
  const modalities: Array<ProjectKnowledgeModality | 'unknown'> = ['text', 'draw', 'image', 'text', 'audio']
  const nodes: ProjectKnowledgeRelationsPayload['nodes'] = []
  const relations: ProjectKnowledgeRelationsPayload['relations'] = []

  sourceLabels.forEach((label, sourceIndex) => {
    const sourceId = `sim-source-${sourceIndex + 1}`
    nodes.push({
      id: sourceId,
      nodeType: 'source',
      label,
      modality: modalities[sourceIndex] || 'unknown',
      embeddingStatus: statuses[sourceIndex] || 'native',
      provenanceSourceType: 'native',
      resourceKind: sourceIndex === 2 ? 'draw' : 'markdown',
      importance: 12 + sourceIndex,
      metadata: {
        simulated: true,
        resourceTitle: label,
        embeddingModel: 'dashscope-compatible-simulated',
      },
    })

    chunkLabels[sourceIndex]?.forEach((chunkLabel, chunkIndex) => {
      const chunkId = `sim-chunk-${sourceIndex + 1}-${chunkIndex + 1}`
      nodes.push({
        id: chunkId,
        nodeType: 'chunk',
        label: chunkLabel,
        modality: modalities[sourceIndex] || 'unknown',
        embeddingStatus: chunkIndex === 2 && sourceIndex === 0 ? 'fallback' : statuses[(sourceIndex + chunkIndex) % statuses.length] || 'native',
        provenanceSourceType: chunkIndex === 2 ? 'vision_summary' : 'native',
        resourceKind: 'markdown',
        sourceId,
        importance: 5 + chunkIndex,
        metadata: {
          simulated: true,
          resourceTitle: label,
          chunkKind: 'semantic',
          embeddingModel: 'dashscope-compatible-simulated',
        },
      })
      relations.push({
        id: `sim-belongs-${sourceIndex + 1}-${chunkIndex + 1}`,
        projectId: projectId || 'simulated-project',
        snapshotId: 'simulated-snapshot',
        sourceNodeType: 'source',
        sourceNodeId: sourceId,
        targetNodeType: 'chunk',
        targetNodeId: chunkId,
        relationType: 'belongs_to',
        score: 0.82 - (chunkIndex * 0.04),
        evidenceMetric: 'simulated_membership',
        evidenceModel: 'loopy_vue_flow_simulation',
        metadata: { simulated: true },
        createdAt: now,
        updatedAt: now,
      })
    })
  })

  for (let index = 0; index < sourceLabels.length; index += 1) {
    const next = (index + 1) % sourceLabels.length
    relations.push({
      id: `sim-source-aligned-${index + 1}`,
      projectId: projectId || 'simulated-project',
      snapshotId: 'simulated-snapshot',
      sourceNodeType: 'source',
      sourceNodeId: `sim-source-${index + 1}`,
      targetNodeType: 'source',
      targetNodeId: `sim-source-${next + 1}`,
      relationType: index % 2 === 0 ? 'aligned_to' : 'similar_to',
      score: 0.68 + (index * 0.03),
      evidenceMetric: 'simulated_semantic_bridge',
      evidenceModel: 'loopy_vue_flow_simulation',
      metadata: { simulated: true },
      createdAt: now,
      updatedAt: now,
    })
  }

  return {
    projectId: projectId || 'simulated-project',
    analytics: {
      relationsUpdatedAt: now,
      snapshotUpdatedAt: now,
      semanticLayoutUpdatedAt: now,
      latestSnapshotType: 'manual',
      relationsJobStatus: 'succeeded',
      snapshotJobStatus: 'succeeded',
      semanticLayoutJobStatus: 'succeeded',
      staleKinds: [],
      allReady: false,
    },
    nodes,
    relations,
  }
}

const isSimulatedPayload = computed(() => Boolean(payload.value?.nodes.some(node => Boolean(node.metadata?.simulated))))

const visibleNodes = computed(() => {
  const items = (payload.value?.nodes || []).slice().sort((left, right) => right.importance - left.importance)
  return items.slice(0, 140)
})
const visibleNodeIdSet = computed(() => new Set(visibleNodes.value.map(item => item.id)))

const nodeDegreeMap = computed(() => {
  const map = new Map<string, number>()
  for (const relation of payload.value?.relations || []) {
    const sourceKey = `${relation.sourceNodeType}:${relation.sourceNodeId}`
    const targetKey = `${relation.targetNodeType}:${relation.targetNodeId}`
    map.set(sourceKey, (map.get(sourceKey) || 0) + 1)
    map.set(targetKey, (map.get(targetKey) || 0) + 1)
  }
  return map
})

const sourceIndexMap = computed(() => {
  const sourceNodes = visibleNodes.value.filter(node => node.nodeType === 'source')
  return new Map(sourceNodes.map((node, index) => [node.id, index]))
})

function resolveNodePosition(node: ProjectKnowledgeRelationsPayload['nodes'][number], index: number): { x: number, y: number } {
  const sourceNodes = visibleNodes.value.filter(item => item.nodeType === 'source')
  const sourceCount = Math.max(1, sourceNodes.length)
  if (node.nodeType === 'source') {
    const sourceIndex = sourceIndexMap.value.get(node.id) ?? index
    const angle = (sourceIndex / sourceCount) * Math.PI * 2 - Math.PI / 2
    return {
      x: 520 + Math.cos(angle) * 330,
      y: 330 + Math.sin(angle) * 230,
    }
  }

  const parentIndex = sourceIndexMap.value.get(node.sourceId || '') ?? (index % sourceCount)
  const siblingIndex = visibleNodes.value
    .filter(item => item.nodeType === 'chunk' && item.sourceId === node.sourceId)
    .findIndex(item => item.id === node.id)
  const angle = (parentIndex / sourceCount) * Math.PI * 2 - Math.PI / 2
  const spread = ((Math.max(0, siblingIndex) % 9) - 4) * 0.13
  const radius = 430 + ((Math.max(0, siblingIndex) % 3) * 42)
  return {
    x: 520 + Math.cos(angle + spread) * radius,
    y: 330 + Math.sin(angle + spread) * (radius * 0.7),
  }
}

const flowNodes = computed<Node[]>(() => {
  return visibleNodes.value.map((node, index) => {
    const flowId = `${node.nodeType}:${node.id}`
    const position = resolveNodePosition(node, index)
    const degree = nodeDegreeMap.value.get(flowId) || 0
    const statusColor = resolveNodeColor(node.embeddingStatus)
    return {
      id: flowId,
      type: 'default',
      position,
      data: {
        label: `${node.nodeType === 'source' ? '◆' : '●'} ${node.label}`,
      },
      class: [
        'loopy-relations__node',
        `loopy-relations__node--${node.embeddingStatus}`,
        node.nodeType === 'source' ? 'loopy-relations__node--source' : 'loopy-relations__node--chunk',
        selectedFlowNodeId.value === flowId ? 'loopy-relations__node--selected' : '',
      ].filter(Boolean).join(' '),
      style: {
        '--loopy-node-color': statusColor,
        '--loopy-node-size': `${Math.min(1.28, 0.86 + degree * 0.045)}`,
      } as Record<string, string>,
    }
  })
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
        label: relationLabel(relation.relationType),
        animated: relation.relationType === 'aligned_to' || relation.relationType === 'references',
        type: 'smoothstep',
        class: `loopy-relations__edge loopy-relations__edge--${isAligned ? 'aligned' : relation.relationType}`,
        style: {
          strokeWidth: Math.max(1.2, Math.min(4, relation.score * 3.2)),
        },
      }
    })
})

function buildSimulatedNodeDetail(
  nodeId: string,
  selectedNodeType: ProjectKnowledgeRelationNodeType,
): ProjectKnowledgeNodeDetail | null {
  const currentPayload = payload.value
  if (!currentPayload)
    return null

  const node = currentPayload.nodes.find(item => item.id === nodeId && item.nodeType === selectedNodeType)
  if (!node?.metadata?.simulated)
    return null

  const nodeRelations = currentPayload.relations
    .filter((relation) => {
      return (relation.sourceNodeType === selectedNodeType && relation.sourceNodeId === nodeId)
        || (relation.targetNodeType === selectedNodeType && relation.targetNodeId === nodeId)
    })
    .sort((left, right) => right.score - left.score)
  const now = currentPayload.analytics.relationsUpdatedAt || new Date().toISOString()
  const relatedLabels = nodeRelations
    .slice(0, 3)
    .map((relation) => {
      const neighborId = relation.sourceNodeId === nodeId ? relation.targetNodeId : relation.sourceNodeId
      return currentPayload.nodes.find(item => item.id === neighborId)?.label || neighborId
    })
    .filter(Boolean)
    .join('、')

  return {
    nodeId: node.id,
    nodeType: node.nodeType,
    label: node.label,
    contentPreview: relatedLabels
      ? `${node.label} 是本地模拟语义图谱节点，已关联 ${relatedLabels}。`
      : `${node.label} 是本地模拟语义图谱节点。`,
    modality: node.modality,
    embeddingStatus: node.embeddingStatus,
    embeddingProvider: 'newapi',
    embeddingModel: String(node.metadata.embeddingModel || 'dashscope-compatible-simulated'),
    embeddingDimensions: 1024,
    embeddingQualityScore: Math.min(0.98, Math.max(0.72, node.importance / 18)),
    provenanceSourceType: node.provenanceSourceType || '',
    sourceConfidence: 0.92,
    neighborhoodConsistency: Math.min(0.96, Math.max(0.7, nodeRelations.length / 6)),
    metadata: node.metadata,
    pipelineLog: [
      {
        id: `sim-task-${node.id}`,
        projectId: currentPayload.projectId,
        scopeType: 'project_resource',
        sourceResourceId: node.nodeType === 'source' ? node.id : node.sourceId || null,
        linkedContestResourceId: null,
        taskType: 'upsert',
        status: 'succeeded',
        stage: 'finalizing',
        attempt: 1,
        maxAttempt: 1,
        progressPercent: 100,
        etaSeconds: 0,
        payloadJson: { simulated: true },
        resultJson: { relationCount: nodeRelations.length },
        errorMessage: '',
        resourceTitle: node.label,
        startedAt: now,
        finishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    nearestNeighbors: nodeRelations.filter(item => item.relationType === 'similar_to').slice(0, 8),
    alignedNeighbors: nodeRelations.filter(item => item.relationType === 'aligned_to').slice(0, 8),
  }
}

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
    const nextPayload = response.data || null
    if (nextPayload && nextPayload.relations.length > 0) {
      payload.value = nextPayload
      return
    }
    payload.value = createSimulatedRelationsPayload(projectId)
  }
  catch {
    payload.value = createSimulatedRelationsPayload(projectId)
  }
  finally {
    loading.value = false
  }
}

async function loadNodeDetail(nodeId: string, selectedNodeType: ProjectKnowledgeRelationNodeType): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  if (!projectId || !nodeId)
    return
  const simulatedDetail = buildSimulatedNodeDetail(nodeId, selectedNodeType)
  if (simulatedDetail) {
    detail.value = simulatedDetail
    detailError.value = ''
    detailLoading.value = false
    return
  }

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
  selectedFlowNodeId.value = String(event.node.id || '')
  if ((selectedNodeType === 'source' || selectedNodeType === 'chunk') && nodeId)
    void loadNodeDetail(nodeId, selectedNodeType)
}

watch(() => [props.projectId, nodeType.value, modality.value, embeddingStatus.value], () => {
  detail.value = null
  detailError.value = ''
  selectedFlowNodeId.value = ''
  void loadRelations()
}, { immediate: true })
</script>

<template>
  <div class="loopy-relations loopy-relations--floating">
    <section class="loopy-relations__graph-shell" aria-label="语义关系画布">
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
        :default-viewport="{ x: 0, y: 0, zoom: 0.84 }"
        :min-zoom="0.32"
        :max-zoom="1.6"
        @node-click="handleNodeClick"
      >
        <Background pattern-color="#cbd7e7" :gap="20" />
        <Controls />
        <MiniMap />
      </VueFlow>
    </section>

    <aside class="loopy-relations__filters loopy-relations__panel">
      <div class="loopy-relations__filters-head">
        <h3>语义关系图谱</h3>
        <button class="loopy-relations__button" type="button" :disabled="loading" @click="loadRelations">
          刷新
        </button>
      </div>
      <p class="loopy-relations__hint">
        Vue Flow 径向图谱支持拖拽、缩放、迷你地图与节点详情；没有真实关系时自动进入模拟图谱。
      </p>
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
          <strong>{{ isSimulatedPayload ? 'mock' : payload?.analytics.allReady ? 'ready' : 'stale' }}</strong>
        </article>
      </div>
    </aside>

    <WorkspaceLoopyDataNodeDetail
      class="loopy-relations__detail-panel loopy-relations__panel"
      :detail="detail"
      :loading="detailLoading"
      :error="detailError"
      empty-label="点击图中的 source / chunk 节点查看右侧详情"
    />
  </div>
</template>

<style scoped>
.loopy-relations {
  position: relative;
  min-height: clamp(620px, calc(100vh - 180px), 820px);
  overflow: hidden;
  border: 1px solid #dbe7f3;
  border-radius: 22px;
  background: #f8fbff;
}

.loopy-relations__panel {
  position: absolute;
  top: 20px;
  z-index: 5;
  border: 1px solid #dbe7f3;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 48px rgba(36, 73, 125, 0.12);
  backdrop-filter: blur(16px);
}

.loopy-relations__filters {
  left: 20px;
  width: 240px;
  max-height: calc(100% - 40px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
}

.loopy-relations__detail-panel {
  right: 20px;
  width: 340px;
  min-height: 0;
  max-height: calc(100% - 40px);
  overflow: auto;
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

.loopy-relations__hint {
  margin: 0;
  color: #5f7899;
  font-size: 12px;
  line-height: 1.6;
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
  position: absolute;
  inset: 0;
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
  transform: scale(var(--loopy-node-size, 1));
  border-radius: 16px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--loopy-node-color, #5b6f8d) 34%, #dce7f4);
  background: #fff;
  color: #18304a;
  font-size: 12px;
  box-shadow: 0 10px 26px rgba(31, 71, 122, 0.08);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

:deep(.loopy-relations__node:hover),
:deep(.loopy-relations__node--selected) {
  transform: scale(calc(var(--loopy-node-size, 1) + 0.08));
  border-color: var(--loopy-node-color, #3b82f6);
  box-shadow: 0 16px 34px rgba(31, 71, 122, 0.16);
}

:deep(.loopy-relations__node--source) {
  min-width: 150px;
  border-radius: 22px;
  font-weight: 800;
}

:deep(.loopy-relations__node--chunk) {
  min-width: 118px;
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

:deep(.loopy-relations__edge--similar_to path) {
  stroke: #7c3aed;
}

:deep(.loopy-relations__edge--belongs_to path) {
  stroke: #64748b;
}

:deep(.vue-flow__edge-text) {
  fill: #48617f;
  font-size: 10px;
  font-weight: 800;
}

@media (max-width: 1440px) {
  .loopy-relations {
    min-height: 720px;
  }

  .loopy-relations__filters {
    width: 220px;
  }

  .loopy-relations__detail-panel {
    width: 300px;
  }
}

@media (max-width: 960px) {
  .loopy-relations {
    min-height: 980px;
  }

  .loopy-relations__panel {
    left: 14px;
    right: 14px;
    width: auto;
    max-height: none;
  }

  .loopy-relations__filters {
    top: 14px;
  }

  .loopy-relations__detail-panel {
    top: auto;
    bottom: 14px;
  }
}
</style>
