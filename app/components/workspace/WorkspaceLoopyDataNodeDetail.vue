<script setup lang="ts">
import type { ProjectKnowledgeNodeDetail } from '~~/shared/types/domain'
import { formatDateTime } from '~/utils/workspace-main-panel-formatters'

const props = withDefaults(defineProps<{
  detail?: ProjectKnowledgeNodeDetail | null
  loading?: boolean
  error?: string
  emptyLabel?: string
}>(), {
  detail: null,
  loading: false,
  error: '',
  emptyLabel: '选择一个节点查看详情',
})

function relationTitle(relation: { relationType: string, score: number, targetNodeId: string, sourceNodeId: string }): string {
  return `${relation.relationType} · ${(relation.score * 100).toFixed(0)}% · ${relation.targetNodeId || relation.sourceNodeId}`
}
</script>

<template>
  <aside class="loopy-detail">
    <div v-if="props.loading" class="loopy-detail__empty">
      正在加载详情...
    </div>
    <div v-else-if="props.error" class="loopy-detail__empty loopy-detail__empty--error">
      {{ props.error }}
    </div>
    <div v-else-if="!props.detail" class="loopy-detail__empty">
      {{ props.emptyLabel }}
    </div>
    <template v-else>
      <div class="loopy-detail__hero">
        <div class="loopy-detail__eyebrow">
          {{ props.detail.nodeType }} · {{ props.detail.embeddingStatus }}
        </div>
        <h3 class="loopy-detail__title">
          {{ props.detail.label }}
        </h3>
        <p class="loopy-detail__preview">
          {{ props.detail.contentPreview || '暂无内容预览' }}
        </p>
      </div>

      <div class="loopy-detail__meta-grid">
        <article class="loopy-detail__meta-card">
          <span>Embedding</span>
          <strong>{{ props.detail.embeddingProvider || '-' }} / {{ props.detail.embeddingModel || '-' }}</strong>
        </article>
        <article class="loopy-detail__meta-card">
          <span>维度 / 质量</span>
          <strong>{{ props.detail.embeddingDimensions || 0 }}d / {{ Math.round(props.detail.embeddingQualityScore * 100) }}%</strong>
        </article>
        <article class="loopy-detail__meta-card">
          <span>Confidence</span>
          <strong>{{ Math.round(props.detail.sourceConfidence * 100) }}%</strong>
        </article>
        <article class="loopy-detail__meta-card">
          <span>Neighborhood</span>
          <strong>{{ Math.round(props.detail.neighborhoodConsistency * 100) }}%</strong>
        </article>
      </div>

      <section class="loopy-detail__section">
        <h4>近邻</h4>
        <div v-if="props.detail.nearestNeighbors.length === 0" class="loopy-detail__empty">
          暂无同模态近邻。
        </div>
        <article v-for="relation in props.detail.nearestNeighbors" :key="relation.id" class="loopy-detail__row">
          <span>{{ relationTitle(relation) }}</span>
          <span>{{ relation.evidenceModel }}</span>
        </article>
      </section>

      <section class="loopy-detail__section">
        <h4>跨模态对齐</h4>
        <div v-if="props.detail.alignedNeighbors.length === 0" class="loopy-detail__empty">
          暂无跨模态对齐。
        </div>
        <article v-for="relation in props.detail.alignedNeighbors" :key="relation.id" class="loopy-detail__row">
          <span>{{ relationTitle(relation) }}</span>
          <span>{{ relation.evidenceModel }}</span>
        </article>
      </section>

      <section class="loopy-detail__section">
        <h4>Pipeline 日志</h4>
        <div v-if="props.detail.pipelineLog.length === 0" class="loopy-detail__empty">
          暂无任务日志。
        </div>
        <article v-for="log in props.detail.pipelineLog" :key="log.id" class="loopy-detail__row">
          <span>{{ log.taskType }} / {{ log.status }} / {{ log.stage }}</span>
          <span>{{ formatDateTime(log.updatedAt) }}</span>
        </article>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.loopy-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  border: 1px solid #dbe7f3;
  border-radius: 24px;
  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);
  padding: 18px;
}

.loopy-detail__hero,
.loopy-detail__meta-card,
.loopy-detail__section,
.loopy-detail__empty {
  border: 1px solid #dce7f4;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
}

.loopy-detail__hero,
.loopy-detail__section,
.loopy-detail__empty {
  padding: 14px;
}

.loopy-detail__eyebrow {
  color: #6980a0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.loopy-detail__title {
  margin: 10px 0 0;
  color: #16283f;
  font-size: 20px;
  line-height: 1.2;
}

.loopy-detail__preview {
  margin: 12px 0 0;
  color: #4f6585;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.loopy-detail__meta-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.loopy-detail__meta-card {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #6d82a1;
  font-size: 11px;
}

.loopy-detail__meta-card strong {
  color: #16283f;
  font-size: 13px;
}

.loopy-detail__section h4 {
  margin: 0 0 12px;
  color: #182c48;
  font-size: 12px;
  font-weight: 800;
}

.loopy-detail__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid #edf2f9;
  color: #536b8c;
  font-size: 11px;
}

.loopy-detail__row:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.loopy-detail__empty {
  color: #7186a4;
  font-size: 12px;
}

.loopy-detail__empty--error {
  color: #b45309;
  background: #fff6f6;
  border-color: #efd3d3;
}
</style>
