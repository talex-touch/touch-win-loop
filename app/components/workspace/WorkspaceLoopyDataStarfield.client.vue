<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ProjectKnowledgeIndexTopologyNode } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  nodes?: ProjectKnowledgeIndexTopologyNode[]
  healthMessage?: string
}>(), {
  nodes: () => [],
  healthMessage: '',
})

interface ProjectedStarNode extends ProjectKnowledgeIndexTopologyNode {
  style: CSSProperties
}

const hoveredNodeId = ref('')

function hashSeed(value: string): number {
  let hash = 0
  const normalized = String(value || '').trim()
  for (let index = 0; index < normalized.length; index += 1)
    hash = ((hash << 5) - hash) + normalized.charCodeAt(index)
  return Math.abs(hash)
}

function buildNodeStyle(node: ProjectKnowledgeIndexTopologyNode, index: number): CSSProperties {
  const seed = hashSeed(node.id || `${index}`)
  const x = ((seed % 1000) / 1000) * 86 + 7
  const y = ((Math.floor(seed / 13) % 1000) / 1000) * 74 + 10
  const driftX = (((Math.floor(seed / 17) % 1000) / 1000) * 16) - 8
  const driftY = (((Math.floor(seed / 29) % 1000) / 1000) * 18) - 9
  const scale = Number((0.62 + Math.min(1.28, (node.size || 1) / 4.2)).toFixed(2))
  const depth = Math.max(0.12, Math.min(0.92, Number(node.depth || 0.6)))
  const opacity = Number((0.38 + ((1 - depth) * 0.56)).toFixed(2))
  const delay = `-${(seed % 7000) / 1000}s`
  const duration = `${12 + (seed % 9)}s`
  return {
    'left': `${x}%`,
    'top': `${y}%`,
    '--star-scale': String(scale),
    '--star-depth': String(depth),
    '--star-opacity': String(opacity),
    '--star-drift-x': `${driftX}px`,
    '--star-drift-y': `${driftY}px`,
    '--star-delay': delay,
    '--star-duration': duration,
  } as CSSProperties
}

const projectedNodes = computed<ProjectedStarNode[]>(() => {
  return (props.nodes || []).slice(0, 36).map((node, index) => ({
    ...node,
    style: buildNodeStyle(node, index),
  }))
})

const hoveredNode = computed(() => {
  return projectedNodes.value.find(node => node.id === hoveredNodeId.value) || projectedNodes.value[0] || null
})

function nodeToneClass(node: ProjectKnowledgeIndexTopologyNode): string {
  if (node.fallbackOnly)
    return 'loopy-starfield__node loopy-starfield__node--fallback'
  if (node.status === 'ready')
    return 'loopy-starfield__node loopy-starfield__node--ready'
  if (node.status === 'failed')
    return 'loopy-starfield__node loopy-starfield__node--failed'
  if (node.status === 'stale')
    return 'loopy-starfield__node loopy-starfield__node--stale'
  if (node.status === 'queued' || node.status === 'pending')
    return 'loopy-starfield__node loopy-starfield__node--queued'
  return 'loopy-starfield__node loopy-starfield__node--processing'
}

function formatDateTime(value?: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '-'
  const date = new Date(normalized)
  if (!Number.isFinite(date.getTime()))
    return normalized
  return date.toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="loopy-starfield">
    <UniverseBackground
      class-name="loopy-starfield__aurora"
      :color-stops="['#0d2032', '#142d46', '#39c2ff']"
      :amplitude="1.2"
      :blend="0.72"
      :speed="0.72"
      :intensity="0.95"
    />

    <div class="loopy-starfield__grain" />

    <div class="loopy-starfield__mesh">
      <button
        v-for="node in projectedNodes"
        :key="node.id"
        type="button"
        :class="nodeToneClass(node)"
        :style="node.style"
        @mouseenter="hoveredNodeId = node.id"
        @focus="hoveredNodeId = node.id"
      >
        <span class="loopy-starfield__node-core" />
        <span class="loopy-starfield__node-ring" />
      </button>
    </div>

    <div class="loopy-starfield__legend">
      <span class="loopy-starfield__legend-item"><i class="loopy-starfield__legend-dot loopy-starfield__legend-dot--ready" />真实索引</span>
      <span class="loopy-starfield__legend-item"><i class="loopy-starfield__legend-dot loopy-starfield__legend-dot--fallback" />Fallback</span>
      <span class="loopy-starfield__legend-item"><i class="loopy-starfield__legend-dot loopy-starfield__legend-dot--processing" />处理中</span>
      <span class="loopy-starfield__legend-item"><i class="loopy-starfield__legend-dot loopy-starfield__legend-dot--failed" />失败</span>
    </div>

    <div class="loopy-starfield__focus">
      <template v-if="hoveredNode">
        <div class="loopy-starfield__focus-label">
          {{ hoveredNode.label }}
        </div>
        <div class="loopy-starfield__focus-meta">
          <span>{{ hoveredNode.status || 'binding' }}</span>
          <span>{{ hoveredNode.progressPercent }}%</span>
          <span>Chunk {{ hoveredNode.chunkCount }}</span>
        </div>
        <div class="loopy-starfield__focus-subtitle">
          {{ hoveredNode.realEmbeddingReady ? '已产出真实 embedding' : hoveredNode.fallbackOnly ? '仅 fallback embedding' : '尚未形成真实 embedding' }}
        </div>
        <div class="loopy-starfield__focus-time">
          最近更新时间：{{ formatDateTime(hoveredNode.updatedAt) }}
        </div>
      </template>
      <template v-else>
        <div class="loopy-starfield__focus-label">
          {{ props.healthMessage || 'Loopy 数据状态星图' }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.loopy-starfield {
  position: relative;
  min-height: 380px;
  overflow: hidden;
  border: 1px solid rgba(164, 207, 255, 0.18);
  border-radius: 28px;
  background:
    radial-gradient(circle at 22% 18%, rgba(64, 181, 255, 0.22), transparent 42%),
    radial-gradient(circle at 80% 20%, rgba(134, 255, 215, 0.18), transparent 34%),
    linear-gradient(140deg, #081421 0%, #0f2233 48%, #0d1825 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.loopy-starfield__aurora {
  position: absolute;
  inset: 0;
  opacity: 0.6;
}

.loopy-starfield__grain {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 12% 22%, rgba(255, 255, 255, 0.12) 0 1px, transparent 1px),
    radial-gradient(circle at 72% 18%, rgba(255, 255, 255, 0.1) 0 1px, transparent 1px),
    radial-gradient(circle at 46% 68%, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px),
    radial-gradient(circle at 82% 74%, rgba(255, 255, 255, 0.12) 0 1px, transparent 1px);
  opacity: 0.7;
}

.loopy-starfield__mesh {
  position: absolute;
  inset: 0;
  perspective: 1200px;
  transform-style: preserve-3d;
}

.loopy-starfield__node {
  position: absolute;
  width: 18px;
  height: 18px;
  transform: translate3d(var(--star-drift-x), var(--star-drift-y), calc((1 - var(--star-depth)) * 120px))
    scale(var(--star-scale));
  opacity: var(--star-opacity);
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  animation: loopy-starfield-float var(--star-duration) ease-in-out infinite;
  animation-delay: var(--star-delay);
}

.loopy-starfield__node-core,
.loopy-starfield__node-ring {
  position: absolute;
  inset: 0;
  border-radius: 999px;
}

.loopy-starfield__node-core {
  box-shadow: 0 0 18px currentColor;
}

.loopy-starfield__node-ring {
  inset: -7px;
  border: 1px solid currentColor;
  opacity: 0.25;
}

.loopy-starfield__node--ready {
  color: #8effdd;
}

.loopy-starfield__node--fallback {
  color: #ffd36f;
}

.loopy-starfield__node--processing {
  color: #7ed4ff;
}

.loopy-starfield__node--queued {
  color: #c0d9ff;
}

.loopy-starfield__node--stale {
  color: #ffb681;
}

.loopy-starfield__node--failed {
  color: #ff8f8f;
}

.loopy-starfield__legend {
  position: absolute;
  left: 18px;
  bottom: 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: rgba(225, 240, 255, 0.82);
  font-size: 11px;
}

.loopy-starfield__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.loopy-starfield__legend-dot {
  display: inline-flex;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.loopy-starfield__legend-dot--ready {
  background: #8effdd;
}

.loopy-starfield__legend-dot--fallback {
  background: #ffd36f;
}

.loopy-starfield__legend-dot--processing {
  background: #7ed4ff;
}

.loopy-starfield__legend-dot--failed {
  background: #ff8f8f;
}

.loopy-starfield__focus {
  position: absolute;
  right: 18px;
  bottom: 18px;
  max-width: 240px;
  border: 1px solid rgba(159, 208, 255, 0.18);
  border-radius: 18px;
  background: rgba(8, 20, 34, 0.72);
  backdrop-filter: blur(16px);
  padding: 14px 16px;
  color: #f4fbff;
  box-shadow: 0 14px 34px rgba(4, 10, 20, 0.34);
}

.loopy-starfield__focus-label {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.loopy-starfield__focus-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  color: rgba(214, 232, 247, 0.86);
  font-size: 11px;
}

.loopy-starfield__focus-subtitle,
.loopy-starfield__focus-time {
  margin-top: 8px;
  color: rgba(214, 232, 247, 0.8);
  font-size: 11px;
  line-height: 1.45;
}

@keyframes loopy-starfield-float {
  0%,
  100% {
    transform: translate3d(var(--star-drift-x), var(--star-drift-y), calc((1 - var(--star-depth)) * 120px))
      scale(var(--star-scale));
  }
  50% {
    transform: translate3d(
        calc(var(--star-drift-x) * -0.35),
        calc(var(--star-drift-y) * -0.6),
        calc((1 - var(--star-depth)) * 156px)
      )
      scale(calc(var(--star-scale) * 1.08));
  }
}

@media (max-width: 960px) {
  .loopy-starfield {
    min-height: 320px;
  }

  .loopy-starfield__focus {
    left: 18px;
    right: 18px;
    max-width: none;
  }
}
</style>
