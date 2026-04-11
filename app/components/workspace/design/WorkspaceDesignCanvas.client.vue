<script setup lang="ts">
import type { DesignFrameModel, DesignPageModel } from '~~/shared/types/domain'
import { computed, ref, watch } from 'vue'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const props = withDefaults(defineProps<{
  page?: DesignPageModel | null
  frames?: DesignFrameModel[]
  selectedFrameId?: string
  disabled?: boolean
}>(), {
  page: null,
  frames: () => [],
  selectedFrameId: '',
  disabled: false,
})

const emit = defineEmits<{
  'select-frame': [frameId: string]
  'open-frame': [frameId: string]
  'update-frame-position': [payload: { frameId: string, x: number, y: number }]
  'update-page-viewport': [payload: { x: number, y: number, zoom: number }]
}>()

const nodes = ref<any[]>([])

const defaultViewport = computed(() => {
  return {
    x: props.page?.viewport?.x || 0,
    y: props.page?.viewport?.y || 0,
    zoom: props.page?.viewport?.zoom || 1,
  }
})

watch(
  [() => props.frames, () => props.selectedFrameId, () => props.page?.id, () => props.disabled],
  () => {
    nodes.value = (props.frames || []).map((frame) => {
      return {
        id: frame.id,
        type: 'frame',
        position: { x: frame.x, y: frame.y },
        data: { frame },
        draggable: !props.disabled && !frame.locked,
        selectable: true,
        connectable: false,
        style: {
          width: `${frame.width}px`,
          height: `${frame.height}px`,
        },
      }
    })
  },
  { immediate: true, deep: true },
)

function handleNodeClick(payload: { node?: { id?: string } }): void {
  const frameId = String(payload?.node?.id || '').trim()
  if (!frameId)
    return
  emit('select-frame', frameId)
}

function handleNodeDoubleClick(payload: { node?: { id?: string } }): void {
  const frameId = String(payload?.node?.id || '').trim()
  if (!frameId)
    return
  emit('open-frame', frameId)
}

function handleNodeDragStop(payload: { node?: { id?: string, position?: { x?: number, y?: number } } }): void {
  const frameId = String(payload?.node?.id || '').trim()
  if (!frameId)
    return

  emit('update-frame-position', {
    frameId,
    x: Math.round(Number(payload?.node?.position?.x || 0)),
    y: Math.round(Number(payload?.node?.position?.y || 0)),
  })
}

function handleMoveEnd(payload: { flowTransform?: { x?: number, y?: number, zoom?: number } }): void {
  emit('update-page-viewport', {
    x: Math.round(Number(payload?.flowTransform?.x || 0)),
    y: Math.round(Number(payload?.flowTransform?.y || 0)),
    zoom: Number(payload?.flowTransform?.zoom || 1) || 1,
  })
}
</script>

<template>
  <div class="relative h-full min-h-[640px] overflow-hidden rounded-[32px] border border-slate-800 bg-[#020817] shadow-[0_36px_120px_rgba(2,6,23,0.35)]">
    <VueFlow
      :key="props.page?.id || 'page'"
      :nodes="nodes"
      :edges="[]"
      class="h-full w-full"
      :default-viewport="defaultViewport"
      :min-zoom="0.1"
      :max-zoom="2.5"
      :nodes-draggable="!props.disabled"
      :nodes-connectable="false"
      :elements-selectable="true"
      :pan-on-drag="true"
      :pan-on-scroll="true"
      :zoom-on-scroll="true"
      :select-nodes-on-drag="false"
      @node-click="handleNodeClick"
      @node-double-click="handleNodeDoubleClick"
      @node-drag-stop="handleNodeDragStop"
      @move-end="handleMoveEnd"
    >
      <Background :gap="28" pattern-color="#334155" />
      <MiniMap class="!bg-slate-900/90" />
      <Controls position="top-right" />

      <template #node-frame="nodeProps">
        <WorkspaceDesignFrameNode :frame="nodeProps.data.frame" :selected="nodeProps.selected" />
      </template>
    </VueFlow>

    <div v-if="!(props.frames || []).length" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/50 text-center">
      <h3 class="text-base font-semibold text-white">
        当前 Page 还没有 Frame
      </h3>
      <p class="max-w-sm text-sm leading-6 text-slate-400">
        在顶部工具栏插入 `freeform`、`template`、`device_mockup` 或 `diagram` Frame。
      </p>
    </div>
  </div>
</template>
