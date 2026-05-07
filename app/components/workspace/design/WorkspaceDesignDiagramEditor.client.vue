<script setup lang="ts">
import type { GraphSourceGroup, GraphSourceModel, SceneDocument } from '~~/shared/types/domain'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { computed, ref } from 'vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const props = withDefaults(defineProps<{
  graph?: GraphSourceModel | null
  scene?: SceneDocument | null
  selectedGroupId?: string
  selectedNodeId?: string
  selectedEdgeId?: string
  disabled?: boolean
}>(), {
  graph: null,
  scene: null,
  selectedGroupId: '',
  selectedNodeId: '',
  selectedEdgeId: '',
  disabled: false,
})
const emit = defineEmits<{
  'select-group': [groupId: string]
  'select-node': [nodeId: string]
  'select-edge': [edgeId: string]
  'connect-edge': [payload: { source?: string, target?: string }]
  'update-node-position': [payload: { nodeId: string, x: number, y: number }]
  'update-group-frame': [payload: { groupId: string, x?: number, y?: number, width?: number, height?: number }]
  'create-group': [layoutKind: 'container' | 'swimlane']
  'delete-group': [groupId: string]
  'create-node': []
  'add-child': [nodeId: string]
  'duplicate-node': [nodeId: string]
  'delete-node': [nodeId: string]
  'reverse-edge': [edgeId: string]
  'delete-edge': [edgeId: string]
  'clear-selection': []
}>()
const DRAG_GRID_SIZE = 24
const DRAG_ALIGN_THRESHOLD = 14

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

type DiagramDragAnchor = 'start' | 'center' | 'end'
interface DiagramDragFeedback {
  nodeId: string
  x: number
  y: number
  hints: string[]
}

const rootRef = ref<HTMLElement | null>(null)
const dragFeedback = ref<DiagramDragFeedback | null>(null)

const sceneNodeMap = computed(() => {
  return new Map((props.scene?.sceneModel?.nodes || []).map(node => [node.id, node]))
})

const flowKey = computed(() => {
  const groupKeys = (props.graph?.groups || []).map(group => group.id).join('|')
  const nodeKeys = (props.graph?.nodes || []).map(node => node.id).join('|')
  const edgeKeys = (props.graph?.edges || []).map(edge => edge.id).join('|')
  return `${normalizeString(props.graph?.diagramType)}::${groupKeys}::${nodeKeys}::${edgeKeys}`
})

const nodes = computed<any[]>(() => {
  const groupNodes = (props.graph?.groups || []).map((group, index) => {
    const sceneNode = sceneNodeMap.value.get(group.id)
    return {
      id: group.id,
      type: 'diagram-group',
      position: {
        x: sceneNode?.x || 48 + index * 40,
        y: sceneNode?.y || 48 + index * 24,
      },
      draggable: !props.disabled,
      selectable: true,
      connectable: false,
      zIndex: 0,
      data: {
        kind: 'group',
        group,
        sceneNode: sceneNode || null,
        disabled: props.disabled,
        onResizeGroup: (payload: { x?: number, y?: number, width?: number, height?: number }) => {
          emit('update-group-frame', {
            groupId: group.id,
            ...payload,
          })
        },
      },
      style: {
        width: `${sceneNode?.width || 320}px`,
        height: `${sceneNode?.height || 220}px`,
      },
    }
  })

  const graphNodes = (props.graph?.nodes || []).map((graphNode, index) => {
    const sceneNode = sceneNodeMap.value.get(graphNode.id)
    const width = sceneNode?.width || 180
    const height = sceneNode?.height || 64
    return {
      id: graphNode.id,
      type: 'diagram-node',
      position: {
        x: sceneNode?.x || 96,
        y: sceneNode?.y || 96 + index * 108,
      },
      draggable: !props.disabled,
      selectable: true,
      connectable: !props.disabled,
      zIndex: 10,
      data: {
        kind: 'node',
        graphNode,
        sceneNode: sceneNode || null,
      },
      style: {
        width: `${width}px`,
        height: `${height}px`,
      },
    }
  })
  return [...groupNodes, ...graphNodes]
})

const graphNodeCount = computed(() => (props.graph?.nodes || []).length)
const groupCount = computed(() => (props.graph?.groups || []).length)

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

const selectedGroup = computed<GraphSourceGroup | null>(() => {
  return (props.graph?.groups || []).find(group => group.id === props.selectedGroupId) || null
})

const selectedNode = computed(() => {
  return (props.graph?.nodes || []).find(node => node.id === props.selectedNodeId) || null
})

const selectedEdge = computed(() => {
  return (props.graph?.edges || []).find(edge => edge.id === props.selectedEdgeId) || null
})

const selectionLabel = computed(() => {
  if (selectedGroup.value)
    return `Group · ${selectedGroup.value.label || selectedGroup.value.id}`
  if (selectedNode.value)
    return `Node · ${selectedNode.value.label || selectedNode.value.id}`
  if (selectedEdge.value)
    return `Edge · ${selectedEdge.value.source} → ${selectedEdge.value.target}`
  return 'Canvas Ready'
})

function describeAnchor(axis: 'x' | 'y', anchor: DiagramDragAnchor): string {
  if (axis === 'x')
    return anchor === 'start' ? 'left' : anchor === 'center' ? 'center' : 'right'
  return anchor === 'start' ? 'top' : anchor === 'center' ? 'middle' : 'bottom'
}

function resolveAnchorOffset(anchor: DiagramDragAnchor, size: number): number {
  if (anchor === 'center')
    return size / 2
  if (anchor === 'end')
    return size
  return 0
}

function snapToGrid(value: number): number {
  return Math.round(value / DRAG_GRID_SIZE) * DRAG_GRID_SIZE
}

function resolveNodeSceneFrame(nodeId: string, position?: { x?: number, y?: number }): {
  x: number
  y: number
  width: number
  height: number
} {
  const sceneNode = sceneNodeMap.value.get(nodeId)
  const resolvedX = Number(position?.x ?? sceneNode?.x ?? 96)
  const resolvedY = Number(position?.y ?? sceneNode?.y ?? 96)
  const resolvedWidth = Number(sceneNode?.width || 180)
  const resolvedHeight = Number(sceneNode?.height || 64)
  return {
    x: Number.isFinite(resolvedX) ? resolvedX : 96,
    y: Number.isFinite(resolvedY) ? resolvedY : 96,
    width: Number.isFinite(resolvedWidth) && resolvedWidth > 0 ? resolvedWidth : 180,
    height: Number.isFinite(resolvedHeight) && resolvedHeight > 0 ? resolvedHeight : 64,
  }
}

function emitNudgeSelection(deltaX: number, deltaY: number): void {
  if (selectedGroup.value) {
    const groupFrame = resolveNodeSceneFrame(selectedGroup.value.id)
    emit('update-group-frame', {
      groupId: selectedGroup.value.id,
      x: groupFrame.x + deltaX,
      y: groupFrame.y + deltaY,
    })
    return
  }

  if (selectedNode.value) {
    const nodeFrame = resolveNodeSceneFrame(selectedNode.value.id)
    emit('update-node-position', {
      nodeId: selectedNode.value.id,
      x: nodeFrame.x + deltaX,
      y: nodeFrame.y + deltaY,
    })
  }
}

function resolveDragAssist(nodeId: string, position?: { x?: number, y?: number }): DiagramDragFeedback | null {
  const normalizedNodeId = normalizeString(nodeId)
  if (!normalizedNodeId)
    return null

  const currentFrame = resolveNodeSceneFrame(normalizedNodeId, position)
  let nextX = snapToGrid(currentFrame.x)
  let nextY = snapToGrid(currentFrame.y)
  const hints: string[] = [`栅格吸附 ${DRAG_GRID_SIZE}px`]

  const candidates = (props.scene?.sceneModel?.nodes || []).filter(node => node.id !== normalizedNodeId)
  const xAnchors: DiagramDragAnchor[] = ['start', 'center', 'end']
  const yAnchors: DiagramDragAnchor[] = ['start', 'center', 'end']

  let bestXMatch: { delta: number, value: number, label: string, anchor: DiagramDragAnchor } | null = null
  let bestYMatch: { delta: number, value: number, label: string, anchor: DiagramDragAnchor } | null = null

  for (const candidate of candidates) {
    const candidateLabel = normalizeString(candidate.label) || candidate.id
    const candidateXAnchors = {
      start: candidate.x,
      center: candidate.x + candidate.width / 2,
      end: candidate.x + candidate.width,
    }
    const candidateYAnchors = {
      start: candidate.y,
      center: candidate.y + candidate.height / 2,
      end: candidate.y + candidate.height,
    }

    for (const anchor of xAnchors) {
      const draggedValue = nextX + resolveAnchorOffset(anchor, currentFrame.width)
      for (const targetAnchor of xAnchors) {
        const candidateValue = candidateXAnchors[targetAnchor]
        const delta = Math.abs(draggedValue - candidateValue)
        if (delta > DRAG_ALIGN_THRESHOLD)
          continue
        if (!bestXMatch || delta < bestXMatch.delta) {
          bestXMatch = {
            delta,
            value: candidateValue,
            label: candidateLabel,
            anchor: targetAnchor,
          }
        }
      }
    }

    for (const anchor of yAnchors) {
      const draggedValue = nextY + resolveAnchorOffset(anchor, currentFrame.height)
      for (const targetAnchor of yAnchors) {
        const candidateValue = candidateYAnchors[targetAnchor]
        const delta = Math.abs(draggedValue - candidateValue)
        if (delta > DRAG_ALIGN_THRESHOLD)
          continue
        if (!bestYMatch || delta < bestYMatch.delta) {
          bestYMatch = {
            delta,
            value: candidateValue,
            label: candidateLabel,
            anchor: targetAnchor,
          }
        }
      }
    }
  }

  if (bestXMatch) {
    const xAnchor = xAnchors.reduce((matchedAnchor, anchor) => {
      const draggedValue = nextX + resolveAnchorOffset(anchor, currentFrame.width)
      const currentDelta = Math.abs(draggedValue - bestXMatch!.value)
      const matchedValue = nextX + resolveAnchorOffset(matchedAnchor, currentFrame.width)
      return currentDelta < Math.abs(matchedValue - bestXMatch!.value) ? anchor : matchedAnchor
    }, 'start' as DiagramDragAnchor)
    nextX = Math.round(bestXMatch.value - resolveAnchorOffset(xAnchor, currentFrame.width))
    hints.push(`X 对齐 · ${bestXMatch.label} ${describeAnchor('x', bestXMatch.anchor)}`)
  }

  if (bestYMatch) {
    const yAnchor = yAnchors.reduce((matchedAnchor, anchor) => {
      const draggedValue = nextY + resolveAnchorOffset(anchor, currentFrame.height)
      const currentDelta = Math.abs(draggedValue - bestYMatch!.value)
      const matchedValue = nextY + resolveAnchorOffset(matchedAnchor, currentFrame.height)
      return currentDelta < Math.abs(matchedValue - bestYMatch!.value) ? anchor : matchedAnchor
    }, 'start' as DiagramDragAnchor)
    nextY = Math.round(bestYMatch.value - resolveAnchorOffset(yAnchor, currentFrame.height))
    hints.push(`Y 对齐 · ${bestYMatch.label} ${describeAnchor('y', bestYMatch.anchor)}`)
  }

  return {
    nodeId: normalizedNodeId,
    x: Math.round(nextX),
    y: Math.round(nextY),
    hints,
  }
}

function setDragFeedback(nodeId: string, position?: { x?: number, y?: number }): DiagramDragFeedback | null {
  const nextFeedback = resolveDragAssist(nodeId, position)
  dragFeedback.value = nextFeedback
  return nextFeedback
}

function clearDragFeedback(): void {
  dragFeedback.value = null
}

function handleNodeClick(payload: { node?: { id?: string, data?: { kind?: string } } }): void {
  const kind = normalizeString(payload?.node?.data?.kind)
  if (kind === 'group') {
    const groupId = normalizeString(payload?.node?.id)
    if (groupId)
      emit('select-group', groupId)
    return
  }
  const nodeId = normalizeString(payload?.node?.id)
  if (!nodeId)
    return
  emit('select-node', nodeId)
}

function handleNodeDoubleClick(payload: { node?: { id?: string, data?: { kind?: string } } }): void {
  if (normalizeString(payload?.node?.data?.kind) === 'group')
    return
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

function handleNodeDragStart(payload: { node?: { id?: string, position?: { x?: number, y?: number }, data?: { kind?: string } } }): void {
  const kind = normalizeString(payload?.node?.data?.kind)
  const nodeId = normalizeString(payload?.node?.id)
  if (!nodeId)
    return
  if (kind === 'group')
    emit('select-group', nodeId)
  else
    emit('select-node', nodeId)
  setDragFeedback(nodeId, payload?.node?.position)
}

function handleNodeDrag(payload: { node?: { id?: string, position?: { x?: number, y?: number }, data?: { kind?: string } } }): void {
  const nodeId = normalizeString(payload?.node?.id)
  if (!nodeId)
    return
  setDragFeedback(nodeId, payload?.node?.position)
}

function handleNodeDragStop(payload: { node?: { id?: string, position?: { x?: number, y?: number }, data?: { kind?: string } } }): void {
  const nodeId = normalizeString(payload?.node?.id)
  if (!nodeId)
    return

  const nextFeedback = setDragFeedback(nodeId, payload?.node?.position)
  if (normalizeString(payload?.node?.data?.kind) === 'group') {
    emit('update-group-frame', {
      groupId: nodeId,
      x: nextFeedback?.x ?? Math.round(Number(payload?.node?.position?.x || 0)),
      y: nextFeedback?.y ?? Math.round(Number(payload?.node?.position?.y || 0)),
    })
    clearDragFeedback()
    return
  }

  emit('update-node-position', {
    nodeId,
    x: nextFeedback?.x ?? Math.round(Number(payload?.node?.position?.x || 0)),
    y: nextFeedback?.y ?? Math.round(Number(payload?.node?.position?.y || 0)),
  })
  clearDragFeedback()
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

  if ((key === 'backspace' || key === 'delete') && (selectedGroup.value || selectedNode.value || selectedEdge.value)) {
    event.preventDefault()
    if (selectedGroup.value)
      emit('delete-group', selectedGroup.value.id)
    else if (selectedNode.value)
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

  if (key.startsWith('arrow') && (selectedGroup.value || selectedNode.value)) {
    event.preventDefault()
    const step = event.shiftKey ? DRAG_GRID_SIZE : 8
    if (key === 'arrowleft')
      emitNudgeSelection(-step, 0)
    else if (key === 'arrowright')
      emitNudgeSelection(step, 0)
    else if (key === 'arrowup')
      emitNudgeSelection(0, -step)
    else if (key === 'arrowdown')
      emitNudgeSelection(0, step)
    return
  }

  if (key === 'escape' && (selectedGroup.value || selectedNode.value || selectedEdge.value)) {
    event.preventDefault()
    clearDragFeedback()
    emit('clear-selection')
  }
}
</script>

<template>
  <div
    ref="rootRef"
    class="outline-none h-full w-full relative"
    tabindex="0"
    @keydown="handleKeydown"
    @mousedown="focusCanvas"
  >
    <div class="px-3 py-2 border border-slate-800 rounded-2xl bg-slate-950/92 flex flex-wrap gap-2 max-w-[calc(100%-5rem)] shadow-[0_20px_48px_rgba(2,6,23,0.32)] items-center left-3 top-3 absolute z-10">
      <span class="text-[10px] text-slate-300 tracking-[0.16em] font-semibold px-2.5 py-1 border border-slate-700 rounded-full bg-slate-900 uppercase">
        {{ selectionLabel }}
      </span>
      <span class="text-[10px] text-slate-400 font-semibold px-2.5 py-1 border border-slate-800 rounded-full bg-slate-900">
        {{ graphNodeCount }} nodes
      </span>
      <span class="text-[10px] text-slate-400 font-semibold px-2.5 py-1 border border-slate-800 rounded-full bg-slate-900">
        {{ groupCount }} groups
      </span>
      <span class="text-[10px] text-slate-400 font-semibold px-2.5 py-1 border border-slate-800 rounded-full bg-slate-900">
        {{ edges.length }} edges
      </span>
      <button
        class="text-[11px] text-sky-200 font-semibold px-3 py-1.5 border border-sky-800 rounded-full bg-sky-950/40 transition-colors hover:bg-sky-900/40"
        type="button"
        @click.stop="emit('create-group', 'container')"
      >
        New Group
      </button>
      <button
        class="text-[11px] text-sky-200 font-semibold px-3 py-1.5 border border-sky-800 rounded-full bg-sky-950/40 transition-colors hover:bg-sky-900/40"
        type="button"
        @click.stop="emit('create-group', 'swimlane')"
      >
        New Lane
      </button>
      <button
        class="text-[11px] text-slate-100 font-semibold px-3 py-1.5 border border-slate-700 rounded-full bg-slate-900 transition-colors hover:bg-slate-800"
        type="button"
        @click.stop="emit('create-node')"
      >
        New Node
      </button>
      <template v-if="selectedGroup">
        <button
          class="text-[11px] text-rose-300 font-semibold px-3 py-1.5 border border-rose-900/80 rounded-full bg-rose-950/60 transition-colors hover:bg-rose-900/60"
          type="button"
          @click.stop="emit('delete-group', selectedGroup.id)"
        >
          Delete Group
        </button>
      </template>
      <template v-else-if="selectedNode">
        <button
          class="text-[11px] text-emerald-300 font-semibold px-3 py-1.5 border border-emerald-800 rounded-full bg-emerald-950/40 transition-colors hover:bg-emerald-900/40"
          type="button"
          @click.stop="emit('add-child', selectedNode.id)"
        >
          Add Child
        </button>
        <button
          class="text-[11px] text-slate-100 font-semibold px-3 py-1.5 border border-slate-700 rounded-full bg-slate-900 transition-colors hover:bg-slate-800"
          type="button"
          @click.stop="emit('duplicate-node', selectedNode.id)"
        >
          Duplicate
        </button>
        <button
          class="text-[11px] text-rose-300 font-semibold px-3 py-1.5 border border-rose-900/80 rounded-full bg-rose-950/60 transition-colors hover:bg-rose-900/60"
          type="button"
          @click.stop="emit('delete-node', selectedNode.id)"
        >
          Delete
        </button>
      </template>
      <template v-else-if="selectedEdge">
        <button
          class="text-[11px] text-slate-100 font-semibold px-3 py-1.5 border border-slate-700 rounded-full bg-slate-900 transition-colors hover:bg-slate-800"
          type="button"
          @click.stop="emit('reverse-edge', selectedEdge.id)"
        >
          Reverse
        </button>
        <button
          class="text-[11px] text-rose-300 font-semibold px-3 py-1.5 border border-rose-900/80 rounded-full bg-rose-950/60 transition-colors hover:bg-rose-900/60"
          type="button"
          @click.stop="emit('delete-edge', selectedEdge.id)"
        >
          Delete
        </button>
      </template>
      <button
        v-if="selectedGroup || selectedNode || selectedEdge"
        class="text-[11px] text-slate-300 font-semibold px-3 py-1.5 border border-slate-700 rounded-full bg-slate-900 transition-colors hover:bg-slate-800"
        type="button"
        @click.stop="clearDragFeedback(); emit('clear-selection')"
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
      :nodes-draggable="!props.disabled"
      :nodes-connectable="!props.disabled"
      :elements-selectable="true"
      :pan-on-drag="true"
      :pan-on-scroll="true"
      :zoom-on-scroll="true"
      :select-nodes-on-drag="false"
      :fit-view-on-init="true"
      @node-click="handleNodeClick"
      @node-double-click="handleNodeDoubleClick"
      @node-drag-start="handleNodeDragStart"
      @node-drag="handleNodeDrag"
      @node-drag-stop="handleNodeDragStop"
      @edge-click="handleEdgeClick"
      @connect="handleConnect"
      @pane-click="clearDragFeedback(); emit('clear-selection'); focusCanvas()"
    >
      <Background :gap="24" pattern-color="#1e293b" />
      <MiniMap class="!bg-slate-900/90" />
      <Controls position="top-right" />

      <template #node-diagram-node="nodeProps">
        <WorkspaceDesignDiagramNode :data="nodeProps.data" :selected="nodeProps.selected" />
      </template>
      <template #node-diagram-group="nodeProps">
        <WorkspaceDesignDiagramGroupNode :data="nodeProps.data" :selected="nodeProps.selected" />
      </template>
    </VueFlow>

    <div
      v-if="dragFeedback"
      class="text-[11px] text-slate-300 px-3 py-2 border border-slate-800 rounded-2xl bg-slate-950/92 min-w-[220px] shadow-[0_18px_48px_rgba(2,6,23,0.3)] bottom-3 right-3 absolute z-10"
    >
      <div class="flex gap-3 items-center justify-between">
        <span class="text-slate-100 font-semibold">Drag · {{ dragFeedback.nodeId }}</span>
        <span class="text-sky-200 font-semibold px-2 py-0.5 border border-sky-800 rounded-full bg-sky-950/40">X {{ dragFeedback.x }} / Y {{ dragFeedback.y }}</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <span
          v-for="hint in dragFeedback.hints"
          :key="`${dragFeedback.nodeId}-${hint}`"
          class="text-[10px] text-slate-300 font-semibold px-2 py-1 border border-slate-800 rounded-full bg-slate-900"
        >
          {{ hint }}
        </span>
      </div>
    </div>

    <div
      v-if="nodes.length"
      class="text-[11px] text-slate-400 font-semibold px-3 py-1.5 border border-slate-800 rounded-full bg-slate-950/88 shadow-[0_12px_32px_rgba(2,6,23,0.28)] bottom-3 left-3 absolute z-10"
    >
      快捷键: `N` 新建, `Enter/Tab` 添加子节点, `Delete` 删除, `Cmd/Ctrl + D` 复制, `R` 反转边, `Arrow` 微调, `Shift + Arrow` 栅格步进
    </div>

    <div
      v-if="!nodes.length"
      class="text-center bg-slate-950/60 flex flex-col gap-2 items-center inset-0 justify-center absolute"
    >
      <p class="text-sm text-slate-100 font-semibold">
        当前 graph 还没有节点
      </p>
      <p class="text-xs text-slate-400 leading-6 max-w-xs">
        先新增节点，或从源码区导入 Mermaid / DDL / Outline，再在这里继续连线和选中编辑。
      </p>
    </div>
  </div>
</template>
