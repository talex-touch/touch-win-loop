<script setup lang="ts">
import type { GraphSourceNode, SceneNode } from '~~/shared/types/domain'
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

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
    class="relative h-full w-full cursor-pointer rounded-[20px] border bg-slate-950/96 px-4 py-3 shadow-[0_18px_56px_rgba(15,23,42,0.22)] transition-colors"
    :class="selected ? 'border-sky-400 ring-2 ring-sky-300/30' : 'border-slate-700/80 hover:border-slate-500'"
  >
    <Handle
      type="target"
      :position="Position.Left"
      class="!h-3 !w-3 !border-2 !border-slate-950 !bg-sky-400"
    />
    <Handle
      type="source"
      :position="Position.Right"
      class="!h-3 !w-3 !border-2 !border-slate-950 !bg-sky-400"
    />

    <div class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
      {{ nodeType }}
    </div>
    <p class="mt-3 text-sm font-semibold leading-6 text-slate-100">
      {{ nodeLabel }}
    </p>
    <p class="mt-2 text-[11px] text-slate-500">
      {{ graphNode?.id || sceneNode?.id || 'node' }}
    </p>
  </div>
</template>
