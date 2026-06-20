<script setup lang="ts">
import type {
  CompositionModel,
  DesignAssetModel,
  DesignElementModel,
  DesignFrameModel,
  DesignPageModel,
} from '~~/shared/types/domain'
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  isDesignFrameClipContentEnabled,
  isDeviceDesignFrameKind,
  isFlatDesignFrameKind,
  renderCompositionFramePreviewSvg,
  resolveDesignFrameSurfaceBackground,
  resolveDesignFrameSurfaceRadius,
} from '~~/shared/utils/scene-document'

const props = withDefaults(defineProps<{
  frame: DesignFrameModel
  deviceShellAsset?: DesignAssetModel | null
  previewFrames?: DesignFrameModel[]
  previewAssets?: DesignAssetModel[]
  selected?: boolean
  disabled?: boolean
  onResizePreview?: (patch: ResizePatch) => void
  onResizeCommit?: (patch: ResizePatch) => void
}>(), {
  deviceShellAsset: null,
  previewFrames: () => [],
  previewAssets: () => [],
  selected: false,
  disabled: false,
  onResizePreview: undefined,
  onResizeCommit: undefined,
})
const MIN_FRAME_WIDTH = 280
const MIN_FRAME_HEIGHT = 180

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type ResizePatch = Partial<{ x: number, y: number, width: number, height: number }>
interface ResizeSession {
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

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function findElement(type: DesignElementModel['type'], preferredId = ''): DesignElementModel | null {
  const elements = props.frame.elements || []
  return elements.find(element => element.id === preferredId)
    || elements.find(element => element.type === type)
    || null
}

const themeTokens = computed(() => {
  return {
    background: resolveDesignFrameSurfaceBackground(props.frame),
    surface: normalizeString(props.frame.themeTokens?.surface) || '#ffffff',
    accent: normalizeString(props.frame.themeTokens?.accent) || '#38bdf8',
    text: normalizeString(props.frame.themeTokens?.text) || '#0f172a',
    muted: normalizeString(props.frame.themeTokens?.muted) || '#94a3b8',
  }
})

const titleText = computed(() => normalizeString(findElement('text', 'title')?.text) || props.frame.name)
const subtitleText = computed(() => normalizeString(findElement('caption', 'subtitle')?.text))
const badgeText = computed(() => normalizeString(findElement('badge', 'badge')?.text))
const imageSrc = computed(() => normalizeString(findElement('image', 'hero-image')?.imageSrc))
const isDeviceFrame = computed(() => isDeviceDesignFrameKind(props.frame.kind))
const devicePreviewPage = computed<DesignPageModel>(() => ({
  id: props.frame.pageId,
  name: 'Preview',
  background: resolveDesignFrameSurfaceBackground(props.frame, normalizeString(themeTokens.value.background) || '#ffffff'),
  frameIds: (props.previewFrames?.length ? props.previewFrames : [props.frame]).map(frame => frame.id),
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
  metadata: {},
}))
const devicePreviewComposition = computed<CompositionModel | null>(() => {
  if (!isDeviceFrame.value)
    return null

  const previewFrames = props.previewFrames?.length
    ? props.previewFrames
    : [props.frame]
  const elements = previewFrames.flatMap((frame) => {
    return (frame.elements || []).map((element, index) => ({
      ...element,
      pageId: frame.pageId || props.frame.pageId,
      frameId: frame.id,
      zIndex: Number.isFinite(Number(element.zIndex)) ? Number(element.zIndex) : index,
    }))
  })
  return {
    kind: 'composition',
    templateKey: normalizeString(props.frame.templateKey) || 'device-showcase',
    pages: [devicePreviewPage.value],
    currentPageId: devicePreviewPage.value.id,
    frames: previewFrames,
    elements,
    assets: props.previewAssets?.length
      ? props.previewAssets
      : props.deviceShellAsset
        ? [props.deviceShellAsset]
        : [],
    slots: {},
    themeTokens: {
      ...themeTokens.value,
      ...(props.frame.themeTokens || {}),
    },
    layoutRules: {},
    allowedBlocks: [],
    exportPresets: ['svg'],
    aspectRatio: `${Math.max(1, Math.round(props.frame.width))}:${Math.max(1, Math.round(props.frame.height))}`,
    deviceFramePresetKey: props.frame.deviceFramePresetKey || 'iphone-16-pro',
    blocks: [],
    metadata: {},
  }
})
const deviceFramePreviewSvg = computed(() => {
  if (!devicePreviewComposition.value)
    return ''
  return renderCompositionFramePreviewSvg(devicePreviewComposition.value, props.frame.id)
})
const diagramStats = computed(() => {
  const embeddedScene = props.frame.embeddedScene
  return {
    drawMode: normalizeString(embeddedScene?.drawMode) || 'diagram',
    nodeCount: embeddedScene?.sceneModel?.nodes?.length || 0,
    edgeCount: embeddedScene?.sceneModel?.edges?.length || 0,
  }
})

const resizeSession = ref<ResizeSession | null>(null)

function normalizeResizePatch(frame: { x: number, y: number, width: number, height: number }): ResizePatch {
  return {
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    width: Math.max(MIN_FRAME_WIDTH, Math.round(frame.width)),
    height: Math.max(MIN_FRAME_HEIGHT, Math.round(frame.height)),
  }
}

function resolveFrame() {
  return {
    x: Math.round(props.frame.x),
    y: Math.round(props.frame.y),
    width: Math.max(MIN_FRAME_WIDTH, Math.round(props.frame.width)),
    height: Math.max(MIN_FRAME_HEIGHT, Math.round(props.frame.height)),
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

  if (width < MIN_FRAME_WIDTH) {
    if (session.direction.includes('w'))
      x -= MIN_FRAME_WIDTH - width
    width = MIN_FRAME_WIDTH
  }
  if (height < MIN_FRAME_HEIGHT) {
    if (session.direction.includes('n'))
      y -= MIN_FRAME_HEIGHT - height
    height = MIN_FRAME_HEIGHT
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
  props.onResizePreview?.(applyResizeDelta(resizeSession.value, event.clientX, event.clientY))
}

function handlePointerUp(event: PointerEvent): void {
  if (resizeSession.value)
    props.onResizeCommit?.(applyResizeDelta(resizeSession.value, event.clientX, event.clientY))
  stopResize()
}

function startResize(direction: ResizeDirection, event: PointerEvent): void {
  if (props.disabled)
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
  <article
    class="border h-full w-full relative overflow-hidden"
    :class="selected ? 'border-sky-400 ring-2 ring-sky-300/40' : 'border-slate-300'"
    :style="{
      backgroundColor: themeTokens.background,
      borderRadius: `${resolveDesignFrameSurfaceRadius(frame)}px`,
      overflow: isDesignFrameClipContentEnabled(frame) ? 'hidden' : 'visible',
      boxShadow: isFlatDesignFrameKind(frame.kind) ? 'none' : '0 30px 80px rgba(15, 23, 42, 0.2)',
    }"
  >
    <div
      class="inset-0 absolute"
      :style="{
        background: themeTokens.background,
      }"
    />
    <div class="flex flex-wrap gap-2 items-center left-5 top-4 absolute z-10">
      <span class="text-[10px] text-white/90 tracking-[0.18em] font-semibold px-2.5 py-1 border border-white/15 rounded-full bg-white/10 uppercase">
        {{ frame.kind }}
      </span>
      <span
        v-if="badgeText"
        class="text-[10px] font-semibold px-2.5 py-1 rounded-full"
        :style="{
          backgroundColor: `${themeTokens.accent}22`,
          color: themeTokens.accent,
        }"
      >
        {{ badgeText }}
      </span>
      <span
        v-if="frame.locked"
        class="text-[10px] text-amber-100 font-semibold px-2.5 py-1 border border-amber-200/40 rounded-full bg-amber-300/10"
      >
        Locked
      </span>
    </div>

    <template v-if="isDeviceFrame">
      <div
        class="pointer-events-none inset-0 absolute overflow-hidden"
        :style="{ background: 'transparent' }"
        v-html="deviceFramePreviewSvg"
      />
    </template>

    <template v-else-if="frame.kind === 'diagram'">
      <div class="p-6 pt-16 inset-0 absolute">
        <div class="gap-3 grid grid-cols-3">
          <div class="p-3 border border-white/10 rounded-2xl bg-white/10">
            <p class="text-[10px] text-white/50 tracking-[0.16em] font-semibold uppercase">
              Draw Mode
            </p>
            <p class="text-sm text-white font-semibold mt-2">
              {{ diagramStats.drawMode }}
            </p>
          </div>
          <div class="p-3 border border-white/10 rounded-2xl bg-white/10">
            <p class="text-[10px] text-white/50 tracking-[0.16em] font-semibold uppercase">
              Nodes
            </p>
            <p class="text-sm text-white font-semibold mt-2">
              {{ diagramStats.nodeCount }}
            </p>
          </div>
          <div class="p-3 border border-white/10 rounded-2xl bg-white/10">
            <p class="text-[10px] text-white/50 tracking-[0.16em] font-semibold uppercase">
              Edges
            </p>
            <p class="text-sm text-white font-semibold mt-2">
              {{ diagramStats.edgeCount }}
            </p>
          </div>
        </div>
        <div class="mt-5 p-5 border border-white/12 rounded-[24px] border-dashed bg-white/5">
          <h3 class="text-xl leading-tight font-semibold" :style="{ color: themeTokens.text }">
            {{ titleText }}
          </h3>
          <p class="text-sm leading-6 mt-3" :style="{ color: themeTokens.muted }">
            双击后进入图编辑态的下一步仍然走语义化结构，不把节点打散成普通自由对象。
          </p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="p-6 pt-16 inset-0 absolute">
        <h3 class="text-2xl leading-tight font-semibold max-w-[70%]" :style="{ color: themeTokens.text }">
          {{ titleText }}
        </h3>
        <p v-if="subtitleText" class="text-sm leading-6 mt-3 max-w-[76%]" :style="{ color: themeTokens.muted }">
          {{ subtitleText }}
        </p>
        <div class="mt-6 gap-4 grid grid-cols-[minmax(0,1fr),220px] h-[58%]">
          <div class="p-4 border border-white/10 rounded-[24px] bg-white/10">
            <div class="flex flex-col h-full justify-between">
              <div class="space-y-3">
                <div class="rounded-full bg-white/15 h-3 w-24" />
                <div class="rounded-full bg-white/10 h-3 w-full" />
                <div class="rounded-full bg-white/10 h-3 w-[82%]" />
              </div>
              <div class="flex gap-2">
                <span class="rounded-full bg-white/20 h-2.5 w-2.5" />
                <span class="rounded-full bg-white/20 h-2.5 w-2.5" />
                <span class="rounded-full bg-white/20 h-2.5 w-2.5" />
              </div>
            </div>
          </div>
          <div class="border border-white/10 rounded-[24px] bg-white/10 overflow-hidden">
            <img v-if="imageSrc" :src="imageSrc" alt="" class="h-full w-full object-cover">
            <div v-else class="text-sm text-white/50 font-medium flex h-full items-center justify-center">
              图片 / 形状
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-if="selected && !disabled">
      <button
        class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-w-resize shadow-sm top-1/2 absolute z-20 -translate-y-1/2 -left-1.5"
        type="button"
        @pointerdown.stop.prevent="startResize('w', $event)"
      />
      <button
        class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-e-resize shadow-sm top-1/2 absolute z-20 -translate-y-1/2 -right-1.5"
        type="button"
        @pointerdown.stop.prevent="startResize('e', $event)"
      />
      <button
        class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-n-resize shadow-sm left-1/2 absolute z-20 -translate-x-1/2 -top-1.5"
        type="button"
        @pointerdown.stop.prevent="startResize('n', $event)"
      />
      <button
        class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-s-resize shadow-sm bottom-[-0.375rem] left-1/2 absolute z-20 -translate-x-1/2"
        type="button"
        @pointerdown.stop.prevent="startResize('s', $event)"
      />
      <button
        class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-nw-resize shadow-sm absolute z-20 -left-1.5 -top-1.5"
        type="button"
        @pointerdown.stop.prevent="startResize('nw', $event)"
      />
      <button
        class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-ne-resize shadow-sm absolute z-20 -right-1.5 -top-1.5"
        type="button"
        @pointerdown.stop.prevent="startResize('ne', $event)"
      />
      <button
        class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-sw-resize shadow-sm absolute z-20 -bottom-1.5 -left-1.5"
        type="button"
        @pointerdown.stop.prevent="startResize('sw', $event)"
      />
      <button
        class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-se-resize shadow-sm absolute z-20 -bottom-1.5 -right-1.5"
        type="button"
        @pointerdown.stop.prevent="startResize('se', $event)"
      />
    </template>
  </article>
</template>
