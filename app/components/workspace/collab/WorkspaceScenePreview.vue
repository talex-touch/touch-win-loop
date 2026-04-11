<script setup lang="ts">
import type { SceneDocument, SceneNode } from '~~/shared/types/domain'
import { computed } from 'vue'
import {
  parseSceneDocumentString,
  renderCompositionAssetToSvg,
  sceneDocumentFromUnknown,
} from '~~/shared/utils/scene-document'

const props = defineProps<{
  sceneDocument?: SceneDocument | string | unknown
}>()

const normalizedDocument = computed(() => {
  if (typeof props.sceneDocument === 'string')
    return parseSceneDocumentString(props.sceneDocument)
  return sceneDocumentFromUnknown(props.sceneDocument, {
    fallbackDrawMode: 'diagram',
    fallbackSourceType: 'manual',
  })
})

const isComposition = computed(() => normalizedDocument.value.drawMode === 'composition')

const artboard = computed(() => {
  return normalizedDocument.value.sceneModel.artboards?.[0] || {
    width: 1600,
    height: 900,
    background: '#f8fafc',
  }
})

const svgMarkup = computed(() => {
  if (!isComposition.value)
    return ''
  return renderCompositionAssetToSvg(normalizedDocument.value)
})

const nodeMap = computed(() => {
  const map = new Map<string, SceneNode>()
  for (const node of normalizedDocument.value.sceneModel.nodes)
    map.set(node.id, node)
  return map
})

function centerX(node: SceneNode): number {
  return node.x + node.width / 2
}

function centerY(node: SceneNode): number {
  return node.y + node.height / 2
}
</script>

<template>
  <div class="bg-slate-50 h-full min-h-0 w-full overflow-auto">
    <div v-if="isComposition" class="flex min-h-full items-center justify-center p-6">
      <div class="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" v-html="svgMarkup" />
    </div>

    <div v-else-if="normalizedDocument.sceneModel.nodes.length > 0" class="h-full min-h-full p-4">
      <svg
        class="h-full min-h-[520px] w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
        :viewBox="`0 0 ${artboard.width} ${artboard.height}`"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect :width="artboard.width" :height="artboard.height" :fill="artboard.background || '#f8fafc'" />

        <g v-for="edge in normalizedDocument.sceneModel.edges" :key="edge.id">
          <line
            v-if="nodeMap.get(edge.source) && nodeMap.get(edge.target)"
            :x1="centerX(nodeMap.get(edge.source)!)"
            :y1="centerY(nodeMap.get(edge.source)!)"
            :x2="centerX(nodeMap.get(edge.target)!)"
            :y2="centerY(nodeMap.get(edge.target)!)"
            :stroke="edge.style === 'dashed' ? '#0f766e' : '#94a3b8'"
            :stroke-dasharray="edge.style === 'dashed' ? '10 8' : '0'"
            stroke-width="3"
          />
          <text
            v-if="edge.label && nodeMap.get(edge.source) && nodeMap.get(edge.target)"
            :x="(centerX(nodeMap.get(edge.source)!) + centerX(nodeMap.get(edge.target)!)) / 2"
            :y="(centerY(nodeMap.get(edge.source)!) + centerY(nodeMap.get(edge.target)!)) / 2 - 8"
            fill="#475569"
            font-size="16"
            font-weight="600"
            text-anchor="middle"
          >
            {{ edge.label }}
          </text>
        </g>

        <g v-for="node in normalizedDocument.sceneModel.nodes" :key="node.id">
          <rect
            :x="node.x"
            :y="node.y"
            :width="node.width"
            :height="node.height"
            :rx="node.shape === 'pill' ? node.height / 2 : 20"
            :ry="node.shape === 'pill' ? node.height / 2 : 20"
            :fill="node.type === 'table' ? '#ecfeff' : '#ffffff'"
            :stroke="node.type === 'table' ? '#0f766e' : '#cbd5e1'"
            stroke-width="3"
          />
          <text
            :x="node.x + 18"
            :y="node.y + 34"
            fill="#0f172a"
            font-size="20"
            font-weight="700"
          >
            {{ node.label }}
          </text>
          <text
            v-if="node.content"
            :x="node.x + 18"
            :y="node.y + 62"
            fill="#64748b"
            font-size="14"
            font-weight="500"
            style="white-space: pre-line"
          >
            {{ node.content }}
          </text>
        </g>
      </svg>
    </div>

    <div v-else class="flex min-h-full items-center justify-center p-6">
      <div class="max-w-md rounded-2xl border border-slate-300 border-dashed bg-white px-6 py-8 text-center shadow-sm">
        <div class="text-sm font-semibold text-slate-800">
          当前 SceneDocument 还没有可预览内容
        </div>
        <p class="mt-2 text-xs leading-6 text-slate-500">
          可以先导入 Mermaid、Markdown 大纲、DDL，或者在设计页上传截图生成设备边框预览。
        </p>
      </div>
    </div>
  </div>
</template>
