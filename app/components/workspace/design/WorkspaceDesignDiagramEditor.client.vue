<script setup lang="ts">
import type { GraphSourceModel, SceneDocument } from '~~/shared/types/domain'
import { computed, ref } from 'vue'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const props = withDefaults(defineProps<{
  graph?: GraphSourceModel | null
  scene?: SceneDocument | null
  selectedNodeId?: string
  selectedEdgeId?: string
  disabled?: boolean
}>(), {
  graph: null,
  scene: null,
  selectedNodeId: '',
  selectedEdgeId: '',
  disabled: false,
})

const emit = defineEmits<{
  'select-node': [nodeId: string]
  'select-edge': [edgeId: string]
  'connect-edge': [payload: { source?: string, target?: string }]
  'create-node': []
  'add-child': [nodeId: string]
  'duplicate-node': [nodeId: string]
  'delete-node': [nodeId: string]
  'reverse-edge': [edgeId: string]
  'delete-edge': [edgeId: string]
  'clear-selection': []
}>()

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

const rootRef = ref<HTMLElement | null>(null)

const flowKey = computed(() => {
  const nodeKeys = (props.graph?.nodes || []).map(node => node.id).join('|')
  const edgeKeys = (props.graph?.edges || []).map(edge => edge.id).join('|')
  return `${normalizeString(props.graph?.diagramType)}::${nodeKeys}::${edgeKeys}`
})

const nodes = computed<any[]>(() => {
  const sceneNodeMap = new Map((props.scene?.sceneModel?.nodes || []).map(node => [node.id, node]))
  return (props.graph?.nodes || []).map((graphNode, index) => {
    const sceneNode = sceneNodeMap.get(graphNode.id)
    const width = sceneNode?.width || 180
    const height = sceneNode?.height || 64
    return {
      id: graphNode.id,
      type: 'diagram-node',
      position: {
        x: sceneNode?.x || 96,
        y: sceneNode?.y || 96 + index * 108,
      },
      draggable: false,
      selectable: true,
      connectable: !props.disabled,
      data: {
        graphNode,
        sceneNode: sceneNode || null,
      },
      style: {
        width: `${width}px`,
        height: `${height}px`,
      },
    }
  })
})

const edges = computed<any[]>(() => {
  const nodeIds = new Set((props.graph?.nodes || []).map(node => node.id))
  return (props.graph?.edges || [])
    .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => {
      const selected = edge.id === props.selectedEdgeId
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: selected,
        selectable: true,
        style: {
          stroke: selected ? '#38bdf8' : '#64748b',
          strokeWidth: selected ? 2.5 : 1.6,
        },
        labelStyle: {
          fill: '#cbd5e1',
          fontWeight: 600,
        },
      }
    })
})

const selectedNode = computed(() => {
  return (props.graph?.nodes || []).find(node => node.id === props.selectedNodeId) || null
})

const selectedEdge = computed(() => {
  return (props.graph?.edges || []).find(edge => edge.id === props.selectedEdgeId) || null
})

const selectionLabel = computed(() => {
  if (selectedNode.value)
    return `Node · ${selectedNode.value.label || selectedNode.value.id}`
  if (selectedEdge.value)
    return `Edge · ${selectedEdge.value.source} → ${selectedEdge.value.target}`
  return 'Canvas Ready'
})

function handleNodeClick(payload: { node?: { id?: string } }): void {
  const nodeId = normalizeString(payload?.node?.id)
  if (!nodeId)
    return
  emit('select-node', nodeId)
}

function handleNodeDoubleClick(payload: { node?: { id?: string } }): void {
  const nodeId = normalizeString(payload?.node?.id)
  if (!nodeId)
    return
  emit('add-child', nodeId)
}

function handleEdgeClick(payload: { edge?: { id?: string } }): void {
  const edgeId = normalizeString(payload?.edge?.id)
  if (!edgeId)
    return
  emit('select-edge', edgeId)
}

function handleConnect(payload: { source?: string, target?: string }): void {
  emit('connect-edge', payload)
}

function focusCanvas(): void {
  rootRef.value?.focus()
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.disabled)
    return

  const key = normalizeString(event.key).toLowerCase()
  const metaOrCtrl = event.metaKey || event.ctrlKey

  if ((key === 'backspace' || key === 'delete') && (selectedNode.value || selectedEdge.value)) {
    event.preventDefault()
    if (selectedNode.value)
      emit('delete-node', selectedNode.value.id)
    else if (selectedEdge.value)
      emit('delete-edge', selectedEdge.value.id)
    return
  }

  if ((key === 'enter' || key === 'tab') && selectedNode.value) {
    event.preventDefault()
    emit('add-child', selectedNode.value.id)
    return
  }

  if (key === 'n' && !metaOrCtrl) {
    event.preventDefault()
    emit('create-node')
    return
  }

  if (metaOrCtrl && key === 'd' && selectedNode.value) {
    event.preventDefault()
    emit('duplicate-node', selectedNode.value.id)
    return
  }

  if (key === 'r' && selectedEdge.value) {
    event.preventDefault()
    emit('reverse-edge', selectedEdge.value.id)
    return
  }

  if (key === 'escape' && (selectedNode.value || selectedEdge.value)) {
    event.preventDefault()
    emit('clear-selection')
  }
}
</script>

<template>
  <div
    ref="rootRef"
    class="relative h-full w-full outline-none"
    tabindex="0"
    @keydown="handleKeydown"
    @mousedown="focusCanvas"
  >
    <div class="absolute left-3 top-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/92 px-3 py-2 shadow-[0_20px_48px_rgba(2,6,23,0.32)]">
      <span class="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
        {{ selectionLabel }}
      </span>
      <span class="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-slate-400">
        {{ nodes.length }} nodes
      </span>
      <span class="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-slate-400">
        {{ edges.length }} edges
      </span>
      <button
        class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
        type="button"
        @click.stop="emit('create-node')"
      >
        New Node
      </button>
      <template v-if="selectedNode">
        <button
          class="rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-900/40"
          type="button"
          @click.stop="emit('add-child', selectedNode.id)"
        >
          Add Child
        </button>
        <button
          class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
          type="button"
          @click.stop="emit('duplicate-node', selectedNode.id)"
        >
          Duplicate
        </button>
        <button
          class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
          type="button"
          @click.stop="emit('delete-node', selectedNode.id)"
        >
          Delete
        </button>
      </template>
      <template v-else-if="selectedEdge">
        <button
          class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
          type="button"
          @click.stop="emit('reverse-edge', selectedEdge.id)"
        >
          Reverse
        </button>
        <button
          class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
          type="button"
          @click.stop="emit('delete-edge', selectedEdge.id)"
        >
          Delete
        </button>
      </template>
      <button
        v-if="selectedNode || selectedEdge"
        class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-slate-800"
        type="button"
        @click.stop="emit('clear-selection')"
      >
        Clear
      </button>
    </div>

    <VueFlow
      :key="flowKey"
      :nodes="nodes"
      :edges="edges"
      class="h-full w-full"
      :min-zoom="0.35"
      :max-zoom="2.2"
      :nodes-draggable="false"
      :nodes-connectable="!props.disabled"
      :elements-selectable="true"
      :pan-on-drag="true"
      :pan-on-scroll="true"
      :zoom-on-scroll="true"
      :select-nodes-on-drag="false"
      :fit-view-on-init="true"
      @node-click="handleNodeClick"
      @node-double-click="handleNodeDoubleClick"
      @edge-click="handleEdgeClick"
      @connect="handleConnect"
      @pane-click="emit('clear-selection'); focusCanvas()"
    >
      <Background :gap="24" pattern-color="#1e293b" />
      <MiniMap class="!bg-slate-900/90" />
      <Controls position="top-right" />

      <template #node-diagram-node="nodeProps">
        <WorkspaceDesignDiagramNode :data="nodeProps.data" :selected="nodeProps.selected" />
      </template>
    </VueFlow>

    <div
      v-if="nodes.length"
      class="absolute bottom-3 left-3 z-10 rounded-full border border-slate-800 bg-slate-950/88 px-3 py-1.5 text-[11px] font-semibold text-slate-400 shadow-[0_12px_32px_rgba(2,6,23,0.28)]"
    >
      快捷键: `N` 新建, `Enter/Tab` 添加子节点, `Delete` 删除, `Cmd/Ctrl + D` 复制, `R` 反转边
    </div>

    <div
      v-if="!nodes.length"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/60 text-center"
    >
      <p class="text-sm font-semibold text-slate-100">
        当前 graph 还没有节点
      </p>
      <p class="max-w-xs text-xs leading-6 text-slate-400">
        先新增节点，或从源码区导入 Mermaid / DDL / Outline，再在这里继续连线和选中编辑。
      </p>
    </div>
  </div>
</template>
