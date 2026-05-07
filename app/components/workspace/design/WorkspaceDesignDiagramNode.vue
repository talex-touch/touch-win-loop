<script setup lang="ts">
import type { GraphSourceNode, SceneNode } from '~~/shared/types/domain'
import { Handle, Position } from '@vue-flow/core'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  data?: {
    graphNode?: GraphSourceNode
    sceneNode?: SceneNode | null
  }
  selected?: boolean
}>(), {
  data: () => ({}),
  selected: false,
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

const graphNode = computed(() => props.data?.graphNode || null)
const sceneNode = computed(() => props.data?.sceneNode || null)
const nodeLabel = computed(() => normalizeString(graphNode.value?.label) || normalizeString(sceneNode.value?.label) || 'Untitled node')
const nodeType = computed(() => normalizeString(graphNode.value?.type) || 'node')
</script>

<template>
  <div
    class="px-4 py-3 border rounded-[20px] bg-slate-950/96 h-full w-full cursor-pointer shadow-[0_18px_56px_rgba(15,23,42,0.22)] transition-colors relative"
    :class="selected ? 'border-sky-400 ring-2 ring-sky-300/30' : 'border-slate-700/80 hover:border-slate-500'"
  >
    <Handle
      type="target"
      :position="Position.Left"
      class="!border-2 !border-slate-950 !bg-sky-400 !h-3 !w-3"
    />
    <Handle
      type="source"
      :position="Position.Right"
      class="!border-2 !border-slate-950 !bg-sky-400 !h-3 !w-3"
    />

    <div class="text-[10px] text-slate-400 tracking-[0.16em] font-semibold px-2.5 py-1 border border-white/10 rounded-full bg-white/5 uppercase">
      {{ nodeType }}
    </div>
    <p class="text-sm text-slate-100 leading-6 font-semibold mt-3">
      {{ nodeLabel }}
    </p>
    <p class="text-[11px] text-slate-500 mt-2">
      {{ graphNode?.id || sceneNode?.id || 'node' }}
    </p>
  </div>
</template>
