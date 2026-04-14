<script setup lang="ts">
import type { GraphSourceGroup, SceneNode } from '~~/shared/types/domain'
import { computed, onBeforeUnmount, ref } from 'vue'

const MIN_GROUP_WIDTH = 260
const MIN_GROUP_HEIGHT = 180

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type ResizePatch = Partial<{ x: number, y: number, width: number, height: number }>
type ResizeSession = {
  direction: ResizeDirection
  startClientX: number
  startClientY: number
  startFrame: {
    x: number
    y: number
    width: number
    height: number
  }
}

const props = withDefaults(defineProps<{
  data?: {
    group?: GraphSourceGroup
    sceneNode?: SceneNode | null
    disabled?: boolean
    onResizeGroup?: (patch: ResizePatch) => void
  }
  selected?: boolean
}>(), {
  data: () => ({}),
  selected: false,
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

const group = computed(() => props.data?.group || null)
const sceneNode = computed(() => props.data?.sceneNode || null)
const layoutKind = computed(() => normalizeString(group.value?.metadata?.layoutKind || sceneNode.value?.metadata?.layoutKind).toLowerCase() === 'swimlane' ? 'swimlane' : 'container')
const resizeSession = ref<ResizeSession | null>(null)

function resolveFrame() {
  return {
    x: Math.round(Number(sceneNode.value?.x || 0)),
    y: Math.round(Number(sceneNode.value?.y || 0)),
    width: Math.max(MIN_GROUP_WIDTH, Math.round(Number(sceneNode.value?.width || 320))),
    height: Math.max(MIN_GROUP_HEIGHT, Math.round(Number(sceneNode.value?.height || 220))),
  }
}

function normalizeResizePatch(frame: { x: number, y: number, width: number, height: number }): ResizePatch {
  return {
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    width: Math.max(MIN_GROUP_WIDTH, Math.round(frame.width)),
    height: Math.max(MIN_GROUP_HEIGHT, Math.round(frame.height)),
  }
}

function applyResizeDelta(session: ResizeSession, clientX: number, clientY: number): ResizePatch {
  const deltaX = clientX - session.startClientX
  const deltaY = clientY - session.startClientY
  let { x, y, width, height } = session.startFrame

  if (session.direction.includes('e'))
    width += deltaX
  if (session.direction.includes('s'))
    height += deltaY
  if (session.direction.includes('w')) {
    x += deltaX
    width -= deltaX
  }
  if (session.direction.includes('n')) {
    y += deltaY
    height -= deltaY
  }

  if (width < MIN_GROUP_WIDTH) {
    if (session.direction.includes('w'))
      x -= MIN_GROUP_WIDTH - width
    width = MIN_GROUP_WIDTH
  }
  if (height < MIN_GROUP_HEIGHT) {
    if (session.direction.includes('n'))
      y -= MIN_GROUP_HEIGHT - height
    height = MIN_GROUP_HEIGHT
  }

  return normalizeResizePatch({ x, y, width, height })
}

function stopResize(): void {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
  resizeSession.value = null
}

function handlePointerMove(event: PointerEvent): void {
  if (!resizeSession.value)
    return
  props.data?.onResizeGroup?.(applyResizeDelta(resizeSession.value, event.clientX, event.clientY))
}

function handlePointerUp(): void {
  stopResize()
}

function startResize(direction: ResizeDirection, event: PointerEvent): void {
  if (props.data?.disabled)
    return

  event.preventDefault()
  event.stopPropagation()
  resizeSession.value = {
    direction,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startFrame: resolveFrame(),
  }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
}

onBeforeUnmount(() => {
  if (resizeSession.value)
    stopResize()
})
</script>

<template>
  <div
    class="relative h-full w-full rounded-[26px] border border-sky-400/50 bg-sky-100/30 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)] transition-colors"
    :class="[
      layoutKind === 'swimlane' ? 'border-dashed' : '',
      selected ? 'ring-2 ring-sky-300/40' : 'hover:border-sky-300/70',
    ]"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="rounded-full border border-sky-500/20 bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-900">
        {{ layoutKind }}
      </div>
      <div class="text-[10px] font-semibold text-sky-900/70">
        {{ group?.childNodeIds?.length || 0 }} nodes
      </div>
    </div>
    <p class="mt-3 text-sm font-semibold text-sky-950">
      {{ group?.label || sceneNode?.label || 'Untitled Group' }}
    </p>
    <p class="mt-1 text-[11px] text-sky-900/70">
      {{ group?.id || sceneNode?.id || 'group' }}
    </p>

    <template v-if="selected && !data?.disabled">
      <button
        class="absolute -left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white bg-sky-500 shadow-sm cursor-w-resize"
        type="button"
        @pointerdown.stop.prevent="startResize('w', $event)"
      />
      <button
        class="absolute -right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white bg-sky-500 shadow-sm cursor-e-resize"
        type="button"
        @pointerdown.stop.prevent="startResize('e', $event)"
      />
      <button
        class="absolute left-1/2 -top-1.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-white bg-sky-500 shadow-sm cursor-n-resize"
        type="button"
        @pointerdown.stop.prevent="startResize('n', $event)"
      />
      <button
        class="absolute bottom-[-0.375rem] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-white bg-sky-500 shadow-sm cursor-s-resize"
        type="button"
        @pointerdown.stop.prevent="startResize('s', $event)"
      />
      <button
        class="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border border-white bg-sky-500 shadow-sm cursor-nw-resize"
        type="button"
        @pointerdown.stop.prevent="startResize('nw', $event)"
      />
      <button
        class="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border border-white bg-sky-500 shadow-sm cursor-ne-resize"
        type="button"
        @pointerdown.stop.prevent="startResize('ne', $event)"
      />
      <button
        class="absolute -bottom-1.5 -left-1.5 h-3.5 w-3.5 rounded-full border border-white bg-sky-500 shadow-sm cursor-sw-resize"
        type="button"
        @pointerdown.stop.prevent="startResize('sw', $event)"
      />
      <button
        class="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-full border border-white bg-sky-500 shadow-sm cursor-se-resize"
        type="button"
        @pointerdown.stop.prevent="startResize('se', $event)"
      />
    </template>
  </div>
</template>
