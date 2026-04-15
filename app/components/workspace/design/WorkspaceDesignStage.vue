<script setup lang="ts">
import type {
  DesignAssetModel,
  DesignElementModel,
  DesignFrameModel,
  DesignPageModel,
} from '~~/shared/types/domain'
import type { WorkspaceCollabCursorUser } from '~/components/workspace/collab/presence'
import type {
  DesignCanvasInteractionContext,
  DesignCanvasSelectionState,
} from '~~/app/composables/useDesignCanvasSelection'
import type { DesignEditorTool } from '~~/app/composables/useDesignToolController'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  createEmptyDesignCanvasSelectionState,
} from '~~/app/composables/useDesignCanvasSelection'
import {
  canDesignFrameCreateElements,
  isDesignFrameClipContentEnabled,
  resolveDesignElementAbsoluteRect,
  resolveDesignElementPresentation,
  resolveDesignFrameGridMetadata,
  resolveDesignFrameLayoutMetadata,
  resolveDesignFrameProjectionLayoutForFrames,
} from '~~/shared/utils/scene-document'
import WorkspaceDesignCanvas from './WorkspaceDesignCanvas.client.vue'

const POINTER_GESTURE_THRESHOLD = 4
const MIN_CANVAS_ZOOM = 0.1
const MAX_CANVAS_ZOOM = 2.5
const MIN_ELEMENT_WIDTH = 24
const MIN_ELEMENT_HEIGHT = 24
const ROTATE_HANDLE_OFFSET = 28
const RESIZE_HANDLE_SIZE = 12

const props = withDefaults(defineProps<{
  page?: DesignPageModel | null
  frames?: DesignFrameModel[]
  assets?: DesignAssetModel[]
  pageRootElements?: DesignElementModel[]
  frameElements?: Record<string, DesignElementModel[]>
  frameOwnerFrames?: Record<string, DesignFrameModel>
  themeTokens?: Record<string, string>
  activeTool?: DesignEditorTool
  selectionState?: DesignCanvasSelectionState
  interactionContext?: DesignCanvasInteractionContext
  remoteCursors?: WorkspaceCollabCursorUser[]
  viewportX?: number
  viewportY?: number
  viewportZoom?: number
  disabled?: boolean
}>(), {
  page: null,
  frames: () => [],
  assets: () => [],
  pageRootElements: () => [],
  frameElements: () => ({}),
  frameOwnerFrames: () => ({}),
  themeTokens: () => ({}),
  activeTool: 'select',
  selectionState: () => createEmptyDesignCanvasSelectionState(),
  interactionContext: () => ({
    effectiveTool: 'select',
    isTemporaryHandActive: false,
    isDeepSelectModifierPressed: false,
  }),
  remoteCursors: () => [],
  viewportX: 0,
  viewportY: 0,
  viewportZoom: 1,
  disabled: false,
})

const emit = defineEmits<{
  'update-selection': [payload: DesignCanvasSelectionState]
  'open-frame': [frameId: string]
  'duplicate-frame': []
  'delete-frame': []
  'update-frame-position': [payload: { frameId: string, x: number, y: number, historyMergeKey?: string }]
  'update-frame-positions': [payload: { positions: Array<{ frameId: string, x: number, y: number }>, historyMergeKey?: string }]
  'update-frame-size': [payload: { frameId: string, x?: number, y?: number, width?: number, height?: number, historyMergeKey?: string }]
  'viewport-change': [payload: { x: number, y: number, zoom: number }]
  updateCollabCursor: [value: { cursorX?: number, cursorY?: number }]
  'create-element': [payload: Partial<DesignElementModel>]
  'update-element': [payload: { elementId: string, patch: Partial<DesignElementModel>, historyMergeKey?: string }]
  'update-elements': [payload: { patches: Array<{ elementId: string, patch: Partial<DesignElementModel> }>, historyMergeKey?: string }]
  'node-double-click': [payload: { frameId: string, clientX: number, clientY: number }]
  'request-deep-selection': [payload: { ownerFrameId: string, ownerPageId: string, displayFrameId: string, ownerElementId?: string }]
}>()

type OverlayElementItem = {
  displayKey: string
  element: DesignElementModel
  ownerFrame: DesignFrameModel | null
  displayFrame: DesignFrameModel | null
  ownerFrameId: string
  displayFrameId: string
  rect: { x: number, y: number, width: number, height: number }
  clipped: boolean
}
type CreateDraft = {
  frameId?: string
  startX: number
  startY: number
  currentX: number
  currentY: number
  points?: Array<{ x: number, y: number }>
}
type ElementSelectionDraft = {
  startClientX: number
  startClientY: number
  currentClientX: number
  currentClientY: number
  selecting: boolean
  additive: boolean
  previewElementIds: string[]
}
type ElementDragDraft = {
  targetElementId: string
  displayFrameId: string
  startClientX: number
  startClientY: number
  dragging: boolean
  additive: boolean
  activeElementIds: string[]
  previewPatches: Record<string, { x: number, y: number }>
  startPositions: Record<string, { x: number, y: number }>
  editingFrameId: string
}
type ResizeHandleDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type ElementTransformDraft = {
  mode: 'resize' | 'rotate'
  targetElementId: string
  editingFrameId: string
  displayFrameId: string
  hasExceededThreshold: boolean
  preserveAspect: boolean
  handle?: ResizeHandleDirection
  startClientX: number
  startClientY: number
  startGeometry: {
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }
  startCenter: {
    x: number
    y: number
  }
  startPointerAngle?: number
  previewPatch: Partial<DesignElementModel>
}
type SvgStrokeLineCap = 'butt' | 'inherit' | 'round' | 'square'
type SvgStrokeLineJoin = 'arcs' | 'bevel' | 'inherit' | 'miter' | 'miter-clip' | 'round'
type TransformBadgeSnapshot = {
  style: Record<string, string>
  text: string
  status?: string
  fading: boolean
}

const viewport = ref({
  x: Number(props.viewportX || 0),
  y: Number(props.viewportY || 0),
  zoom: Number(props.viewportZoom || 1) || 1,
})
const overlayRootRef = ref<HTMLDivElement | null>(null)
const createDraft = ref<CreateDraft | null>(null)
const elementSelectionDraft = ref<ElementSelectionDraft | null>(null)
const elementDragDraft = ref<ElementDragDraft | null>(null)
const elementTransformDraft = ref<ElementTransformDraft | null>(null)
const transformBadgeGhost = ref<TransformBadgeSnapshot | null>(null)
let resizeBadgeGhostFadeTimer: ReturnType<typeof setTimeout> | null = null
let resizeBadgeGhostDisposeTimer: ReturnType<typeof setTimeout> | null = null

const resizeHandleDefinitions: Array<{
  direction: ResizeHandleDirection
  style: Record<string, string>
  cursor: string
}> = [
  { direction: 'nw', style: { left: `-${RESIZE_HANDLE_SIZE / 2}px`, top: `-${RESIZE_HANDLE_SIZE / 2}px` }, cursor: 'nwse-resize' },
  { direction: 'n', style: { left: '50%', top: `-${RESIZE_HANDLE_SIZE / 2}px`, transform: 'translateX(-50%)' }, cursor: 'ns-resize' },
  { direction: 'ne', style: { right: `-${RESIZE_HANDLE_SIZE / 2}px`, top: `-${RESIZE_HANDLE_SIZE / 2}px` }, cursor: 'nesw-resize' },
  { direction: 'e', style: { right: `-${RESIZE_HANDLE_SIZE / 2}px`, top: '50%', transform: 'translateY(-50%)' }, cursor: 'ew-resize' },
  { direction: 'se', style: { right: `-${RESIZE_HANDLE_SIZE / 2}px`, bottom: `-${RESIZE_HANDLE_SIZE / 2}px` }, cursor: 'nwse-resize' },
  { direction: 's', style: { left: '50%', bottom: `-${RESIZE_HANDLE_SIZE / 2}px`, transform: 'translateX(-50%)' }, cursor: 'ns-resize' },
  { direction: 'sw', style: { left: `-${RESIZE_HANDLE_SIZE / 2}px`, bottom: `-${RESIZE_HANDLE_SIZE / 2}px` }, cursor: 'nesw-resize' },
  { direction: 'w', style: { left: `-${RESIZE_HANDLE_SIZE / 2}px`, top: '50%', transform: 'translateY(-50%)' }, cursor: 'ew-resize' },
]

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function clampCanvasZoom(value: unknown): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue))
    return 1
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, numericValue))
}

function roundMetric(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0)
}

function rotateVector(x: number, y: number, angleInRadians: number): { x: number, y: number } {
  const cosine = Math.cos(angleInRadians)
  const sine = Math.sin(angleInRadians)
  return {
    x: x * cosine - y * sine,
    y: x * sine + y * cosine,
  }
}

function normalizeRotation(value: number): number {
  const normalized = Math.round(Number.isFinite(value) ? value : 0)
  const wrapped = normalized % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function clearResizeBadgeGhostTimers(): void {
  if (resizeBadgeGhostFadeTimer) {
    clearTimeout(resizeBadgeGhostFadeTimer)
    resizeBadgeGhostFadeTimer = null
  }
  if (resizeBadgeGhostDisposeTimer) {
    clearTimeout(resizeBadgeGhostDisposeTimer)
    resizeBadgeGhostDisposeTimer = null
  }
}

function queueResizeBadgeFade(snapshot: Omit<TransformBadgeSnapshot, 'fading'>): void {
  clearResizeBadgeGhostTimers()
  transformBadgeGhost.value = {
    ...snapshot,
    fading: false,
  }
  resizeBadgeGhostFadeTimer = setTimeout(() => {
    if (!transformBadgeGhost.value)
      return
    transformBadgeGhost.value = {
      ...transformBadgeGhost.value,
      fading: true,
    }
    resizeBadgeGhostFadeTimer = null
  }, 16)
  resizeBadgeGhostDisposeTimer = setTimeout(() => {
    transformBadgeGhost.value = null
    resizeBadgeGhostDisposeTimer = null
  }, 200)
}

function createElementSelectionState(
  elementIds: string[],
  options: {
    primaryElementId?: string
    editingFrameId?: string
    displayFrameId?: string
  } = {},
): DesignCanvasSelectionState {
  return {
    scope: elementIds.length > 0 ? 'element' : 'none',
    editingFrameId: normalizeString(options.editingFrameId),
    displayFrameId: normalizeString(options.displayFrameId) || normalizeString(options.editingFrameId),
    frameIds: [],
    primaryFrameId: '',
    elementIds: [...elementIds],
    primaryElementId: normalizeString(options.primaryElementId) || elementIds[0] || '',
  }
}

function createClearedSelectionState(preserveEditingFrameId = false): DesignCanvasSelectionState {
  return {
    ...createEmptyDesignCanvasSelectionState(),
    editingFrameId: preserveEditingFrameId ? normalizeString(props.selectionState.editingFrameId) : '',
    displayFrameId: preserveEditingFrameId ? normalizeString(props.selectionState.displayFrameId) : '',
  }
}

function resolveOverlayDisplayKey(elementId: string, displayFrameId = ''): string {
  return `${normalizeString(displayFrameId) || '__page__'}::${normalizeString(elementId)}`
}

function resolveSelectionDisplayFrameId(): string {
  return normalizeString(props.selectionState.displayFrameId)
    || normalizeString(props.selectionState.editingFrameId)
}

function clearTransientOverlayDrafts(): void {
  createDraft.value = null
  elementSelectionDraft.value = null
  elementDragDraft.value = null
  elementTransformDraft.value = null
  clearResizeBadgeGhostTimers()
  transformBadgeGhost.value = null
}

const isHandModeActive = computed(() => props.interactionContext.effectiveTool === 'hand')
const deepSelectionEnabled = computed(() => {
  return props.activeTool === 'select'
    && !props.disabled
    && !isHandModeActive.value
    && Boolean(normalizeString(props.selectionState.editingFrameId) || props.interactionContext.isDeepSelectModifierPressed)
})
const overlayCapturesCanvasPointer = computed(() => {
  if (props.disabled || isHandModeActive.value)
    return false
  if (props.activeTool !== 'select')
    return true
  return deepSelectionEnabled.value || Boolean(createDraft.value || elementSelectionDraft.value || elementDragDraft.value || elementTransformDraft.value)
})
const createDraftRectStyle = computed<Record<string, string> | null>(() => {
  const draft = createDraft.value
  if (!draft || props.activeTool === 'pencil')
    return null

  const start = resolveFlowPointFromContainerPoint({
    x: draft.startX,
    y: draft.startY,
    frameId: draft.frameId,
  })
  const current = resolveFlowPointFromContainerPoint({
    x: draft.currentX,
    y: draft.currentY,
    frameId: draft.frameId,
  })
  return {
    left: `${Math.min(start.x, current.x) * viewport.value.zoom + viewport.value.x}px`,
    top: `${Math.min(start.y, current.y) * viewport.value.zoom + viewport.value.y}px`,
    width: `${Math.max(1, Math.abs(current.x - start.x)) * viewport.value.zoom}px`,
    height: `${Math.max(1, Math.abs(current.y - start.y)) * viewport.value.zoom}px`,
    borderRadius: props.activeTool === 'ellipse' ? '999px' : '16px',
  }
})
const createDraftPathPoints = computed(() => {
  const draft = createDraft.value
  if (!draft?.points?.length || props.activeTool !== 'pencil')
    return ''

  return draft.points
    .map(point => resolveFlowPointFromContainerPoint({
      x: point.x,
      y: point.y,
      frameId: draft.frameId,
    }))
    .map(point => `${point.x * viewport.value.zoom + viewport.value.x},${point.y * viewport.value.zoom + viewport.value.y}`)
    .join(' ')
})

const frameMap = computed(() => {
  return new Map((props.frames || []).map(frame => [frame.id, frame]))
})
const frameOwnerFrameMap = computed(() => {
  const nextMap = new Map<string, DesignFrameModel>()
  for (const frame of props.frames || [])
    nextMap.set(frame.id, props.frameOwnerFrames?.[frame.id] || frame)
  for (const [displayFrameId, ownerFrame] of Object.entries(props.frameOwnerFrames || {})) {
    if (!normalizeString(displayFrameId) || !ownerFrame)
      continue
    nextMap.set(displayFrameId, ownerFrame)
  }
  return nextMap
})
const frameProjectionLayoutMap = computed(() => {
  return new Map(
    (props.frames || []).flatMap((frame) => {
      const ownerFrame = frameOwnerFrameMap.value.get(frame.id) || frame
      const layout = resolveDesignFrameProjectionLayoutForFrames(frame, ownerFrame, {
        assets: props.assets,
        outerRect: {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
        },
      })
      return layout ? [[frame.id, layout] as const] : []
    }),
  )
})

const overlayElements = computed<OverlayElementItem[]>(() => {
  const pageElements = (props.pageRootElements || []).map((element) => {
    return {
      displayKey: resolveOverlayDisplayKey(element.id),
      element,
      ownerFrame: null,
      displayFrame: null,
      ownerFrameId: '',
      displayFrameId: '',
      rect: resolveDesignElementAbsoluteRect(element),
      clipped: false,
    }
  })
  const frameChildren = Object.entries(props.frameElements || {}).flatMap(([frameId, elements]) => {
    const displayFrame = frameMap.value.get(frameId) || null
    if (!displayFrame)
      return []
    const ownerFrame = frameOwnerFrameMap.value.get(frameId) || displayFrame
    return elements.map((element) => {
      return {
        displayKey: resolveOverlayDisplayKey(element.id, displayFrame.id),
        element,
        ownerFrame,
        displayFrame,
        ownerFrameId: normalizeString(element.frameId) || normalizeString(ownerFrame?.id),
        displayFrameId: normalizeString(displayFrame.id),
        rect: resolveDesignElementAbsoluteRect(element, ownerFrame),
        clipped: isDesignFrameClipContentEnabled(displayFrame),
      }
    })
  })

  return [...pageElements, ...frameChildren]
    .filter(item => !item.element.hidden)
    .sort((left, right) => {
      const zIndexDelta = Number(left.element.zIndex || 0) - Number(right.element.zIndex || 0)
      if (zIndexDelta !== 0)
        return zIndexDelta
      return normalizeString(left.displayKey).localeCompare(normalizeString(right.displayKey))
    })
})

const overlayElementsByElementId = computed(() => {
  const nextMap = new Map<string, OverlayElementItem[]>()
  for (const item of overlayElements.value) {
    const elementId = normalizeString(item.element.id)
    if (!elementId)
      continue
    const currentItems = nextMap.get(elementId) || []
    currentItems.push(item)
    nextMap.set(elementId, currentItems)
  }
  return nextMap
})

function resolveOverlayElement(
  elementId: string,
  displayFrameId = resolveSelectionDisplayFrameId(),
): OverlayElementItem | null {
  const items = overlayElementsByElementId.value.get(normalizeString(elementId)) || []
  if (!items.length)
    return null

  const normalizedDisplayFrameId = normalizeString(displayFrameId)
  if (normalizedDisplayFrameId) {
    return items.find(item => item.displayFrameId === normalizedDisplayFrameId)
      || items.find(item => item.ownerFrameId === normalizedDisplayFrameId)
      || items[0]
      || null
  }

  const editingFrameId = normalizeString(props.selectionState.editingFrameId)
  if (editingFrameId)
    return items.find(item => item.ownerFrameId === editingFrameId) || items[0] || null

  return items[0] || null
}

const selectableOverlayElements = computed(() => {
  return overlayElements.value.filter(item => canInteractWithOverlayElement(item))
})

const previewSelectedElementDisplayKeySet = computed(() => {
  const selectedKeys = new Set(
    (props.selectionState.elementIds || [])
      .map(elementId => resolveOverlayElement(elementId, resolveSelectionDisplayFrameId())?.displayKey || '')
      .filter(Boolean),
  )
  if (elementSelectionDraft.value?.selecting) {
    selectedKeys.clear()
    for (const elementId of elementSelectionDraft.value.previewElementIds) {
      const item = resolveOverlayElement(elementId, resolveSelectionDisplayFrameId())
      if (item)
        selectedKeys.add(item.displayKey)
    }
  }
  if (elementDragDraft.value?.dragging) {
    selectedKeys.clear()
    for (const elementId of elementDragDraft.value.activeElementIds) {
      const item = resolveOverlayElement(elementId, elementDragDraft.value.displayFrameId)
      if (item)
        selectedKeys.add(item.displayKey)
    }
  }
  return selectedKeys
})

watch(
  () => [props.viewportX, props.viewportY, props.viewportZoom] as const,
  ([nextX, nextY, nextZoom]) => {
    viewport.value = {
      x: Number(nextX || 0),
      y: Number(nextY || 0),
      zoom: Number(nextZoom || 1) || 1,
    }
  },
  { immediate: true },
)

watch(
  () => [props.selectionState.editingFrameId, props.selectionState.displayFrameId, props.selectionState.scope] as const,
  () => {
    if (props.selectionState.scope !== 'element' && !normalizeString(props.selectionState.editingFrameId)) {
      elementDragDraft.value = null
      elementTransformDraft.value = null
    }
  },
)

function toScreenRect(item: OverlayElementItem, overridePosition?: { x: number, y: number }) {
  const geometry = resolveElementAbsoluteGeometry(item)
  const rectX = overridePosition?.x ?? geometry.x
  const rectY = overridePosition?.y ?? geometry.y
  return {
    left: rectX * viewport.value.zoom + viewport.value.x,
    top: rectY * viewport.value.zoom + viewport.value.y,
    width: geometry.width * viewport.value.zoom,
    height: geometry.height * viewport.value.zoom,
  }
}

function toFlowPoint(event: PointerEvent) {
  const rootRect = overlayRootRef.value?.getBoundingClientRect()
  const relativeX = event.clientX - (rootRect?.left || 0)
  const relativeY = event.clientY - (rootRect?.top || 0)
  return {
    x: (relativeX - viewport.value.x) / viewport.value.zoom,
    y: (relativeY - viewport.value.y) / viewport.value.zoom,
  }
}

function resolveFrameContentLayout(frame: DesignFrameModel | null | undefined) {
  if (!frame)
    return null
  return frameProjectionLayoutMap.value.get(frame.id) || null
}

function resolveFlowPointFromContainerPoint(point: {
  x: number
  y: number
  frameId?: string
}) {
  const frame = normalizeString(point.frameId)
    ? frameMap.value.get(normalizeString(point.frameId)) || null
    : null
  const contentLayout = resolveFrameContentLayout(frame)
  if (frame && contentLayout) {
    return {
      x: contentLayout.contentRect.x + point.x * contentLayout.contentScale,
      y: contentLayout.contentRect.y + point.y * contentLayout.contentScale,
    }
  }
  if (frame) {
    return {
      x: frame.x + point.x,
      y: frame.y + point.y,
    }
  }
  return {
    x: point.x,
    y: point.y,
  }
}

function toContainerPoint(flowPoint: { x: number, y: number }) {
  const editingFrameId = normalizeString(props.selectionState.editingFrameId)
  const displayFrameId = resolveSelectionDisplayFrameId()
  const displayFrame = displayFrameId
    ? frameMap.value.get(displayFrameId) || null
    : editingFrameId
      ? frameMap.value.get(editingFrameId) || null
      : null
  const ownerFrame = displayFrame
    ? frameOwnerFrameMap.value.get(displayFrame.id) || displayFrame
    : editingFrameId
      ? frameMap.value.get(editingFrameId) || null
      : null
  if (!ownerFrame || !canDesignFrameCreateElements(ownerFrame)) {
    return {
      x: flowPoint.x,
      y: flowPoint.y,
      frameId: undefined,
    }
  }
  const contentLayout = resolveFrameContentLayout(displayFrame || ownerFrame)
  if (contentLayout) {
    return {
      x: (flowPoint.x - contentLayout.contentRect.x) / contentLayout.contentScale,
      y: (flowPoint.y - contentLayout.contentRect.y) / contentLayout.contentScale,
      frameId: normalizeString(displayFrame?.id) || normalizeString(ownerFrame.id),
    }
  }
  return {
    x: flowPoint.x - (displayFrame?.x ?? ownerFrame.x),
    y: flowPoint.y - (displayFrame?.y ?? ownerFrame.y),
    frameId: normalizeString(displayFrame?.id) || normalizeString(ownerFrame.id),
  }
}

function resolveElementLocalGeometry(item: OverlayElementItem): {
  x: number
  y: number
  width: number
  height: number
  rotation: number
} {
  return {
    x: Number(item.element.x || 0),
    y: Number(item.element.y || 0),
    width: Math.max(MIN_ELEMENT_WIDTH, Number(item.element.width || item.rect.width || MIN_ELEMENT_WIDTH)),
    height: Math.max(MIN_ELEMENT_HEIGHT, Number(item.element.height || item.rect.height || MIN_ELEMENT_HEIGHT)),
    rotation: Number(item.element.rotation || 0),
  }
}

function resolveElementPreviewPatch(item: OverlayElementItem): Partial<DesignElementModel> {
  const dragPatch = elementDragDraft.value?.previewPatches[item.element.id] || {}
  const transformPatch = elementTransformDraft.value?.targetElementId === item.element.id
    ? elementTransformDraft.value.previewPatch
    : {}
  return {
    ...dragPatch,
    ...transformPatch,
  }
}

function resolveElementThemeTokens(item: OverlayElementItem): Record<string, string> {
  return {
    background: props.page?.background || '#0b1220',
    accent: '#38bdf8',
    text: '#0f172a',
    muted: '#94a3b8',
    ...(props.themeTokens || {}),
    ...(item.ownerFrame?.themeTokens || {}),
    ...(item.displayFrame?.themeTokens || {}),
  }
}

function resolvePreviewElement(item: OverlayElementItem): DesignElementModel {
  return {
    ...item.element,
    ...resolveElementPreviewPatch(item),
  }
}

function resolveElementPresentationForOverlay(item: OverlayElementItem) {
  const previewElement = resolvePreviewElement(item)
  const contentScale = resolveElementContentScale(item)
  const presentation = resolveDesignElementPresentation(
    previewElement,
    resolveElementThemeTokens(item),
  )
  return {
    ...presentation,
    x: presentation.x * contentScale,
    y: presentation.y * contentScale,
    width: presentation.width * contentScale,
    height: presentation.height * contentScale,
    borderRadius: presentation.borderRadius * contentScale,
    strokeWidth: presentation.strokeWidth * contentScale,
    fontSize: presentation.fontSize * contentScale,
    lineHeight: presentation.lineHeight * contentScale,
  }
}

function resolveElementContentScale(item: OverlayElementItem): number {
  return resolveFrameContentLayout(item.displayFrame)?.contentScale || 1
}

function resolvePathWorldPoints(item: OverlayElementItem): Array<{ x: number, y: number }> {
  const points = resolvePreviewElement(item).points || []
  if (!points.length)
    return []

  const contentLayout = resolveFrameContentLayout(item.displayFrame)
  const contentScale = contentLayout?.contentScale || 1
  const offsetX = contentLayout
    ? contentLayout.contentRect.x
    : item.displayFrame
      ? item.displayFrame.x
      : 0
  const offsetY = contentLayout
    ? contentLayout.contentRect.y
    : item.displayFrame
      ? item.displayFrame.y
      : 0
  return points.map(point => ({
    x: offsetX + point.x * contentScale,
    y: offsetY + point.y * contentScale,
  }))
}

function isElementInAutoLayoutFrame(item: OverlayElementItem): boolean {
  return Boolean(item.ownerFrame && resolveDesignFrameLayoutMetadata(item.ownerFrame.metadata?.layout).mode === 'auto')
}

function canDragOverlayElement(item: OverlayElementItem): boolean {
  return canInteractWithOverlayElement(item)
    && !isElementInAutoLayoutFrame(item)
    && item.element.type !== 'path'
}

function canTransformOverlayElement(item: OverlayElementItem): boolean {
  return canDragOverlayElement(item)
}

function resolveElementAbsoluteGeometry(item: OverlayElementItem): {
  x: number
  y: number
  width: number
  height: number
  rotation: number
} {
  const previewPatch = resolveElementPreviewPatch(item)
  const localGeometry = resolveElementLocalGeometry(item)
  const previewElement = resolvePreviewElement(item)
  const contentLayout = resolveFrameContentLayout(item.displayFrame)
  const contentScale = contentLayout?.contentScale || 1
  if (previewElement.type === 'path') {
    const worldPoints = resolvePathWorldPoints(item)
    if (worldPoints.length > 0) {
      const xs = worldPoints.map(point => point.x)
      const ys = worldPoints.map(point => point.y)
      const presentation = resolveElementPresentationForOverlay(item)
      const strokePadding = Math.max(1, presentation.strokeWidth) / 2
      return {
        x: Math.min(...xs) - strokePadding,
        y: Math.min(...ys) - strokePadding,
        width: Math.max(MIN_ELEMENT_WIDTH, Math.max(...xs) - Math.min(...xs) + strokePadding * 2),
        height: Math.max(MIN_ELEMENT_HEIGHT, Math.max(...ys) - Math.min(...ys) + strokePadding * 2),
        rotation: 0,
      }
    }
  }
  if (item.displayFrame && contentLayout) {
    return {
      x: contentLayout.contentRect.x + Number(previewPatch.x ?? localGeometry.x) * contentScale,
      y: contentLayout.contentRect.y + Number(previewPatch.y ?? localGeometry.y) * contentScale,
      width: Math.max(MIN_ELEMENT_WIDTH, Number(previewPatch.width ?? localGeometry.width) * contentScale),
      height: Math.max(MIN_ELEMENT_HEIGHT, Number(previewPatch.height ?? localGeometry.height) * contentScale),
      rotation: Number(previewPatch.rotation ?? localGeometry.rotation),
    }
  }
  return {
    x: previewPatch.x !== undefined
      ? (item.displayFrame ? Number(previewPatch.x) + item.displayFrame.x : Number(previewPatch.x))
      : item.rect.x,
    y: previewPatch.y !== undefined
      ? (item.displayFrame ? Number(previewPatch.y) + item.displayFrame.y : Number(previewPatch.y))
      : item.rect.y,
    width: Math.max(MIN_ELEMENT_WIDTH, Number(previewPatch.width ?? localGeometry.width)),
    height: Math.max(MIN_ELEMENT_HEIGHT, Number(previewPatch.height ?? localGeometry.height)),
    rotation: Number(previewPatch.rotation ?? localGeometry.rotation),
  }
}

function resolveElementStyle(item: OverlayElementItem) {
  const presentation = resolveElementPresentationForOverlay(item)
  const geometry = resolveElementAbsoluteGeometry(item)
  const rect = {
    left: geometry.x * viewport.value.zoom + viewport.value.x,
    top: geometry.y * viewport.value.zoom + viewport.value.y,
    width: geometry.width * viewport.value.zoom,
    height: geometry.height * viewport.value.zoom,
  }
  const isSelected = previewSelectedElementDisplayKeySet.value.has(item.displayKey)
  const baseStyle: Record<string, string> = {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${Math.max(rect.width, 8)}px`,
    height: `${Math.max(rect.height, 8)}px`,
    opacity: String(Math.max(0, Math.min(1, presentation.opacity * (item.element.locked ? 0.72 : 1)))),
    transform: geometry.rotation ? `rotate(${geometry.rotation}deg)` : 'none',
    transformOrigin: 'center center',
    overflow: 'visible',
  }

  if (isSelected) {
    if (selectedTransformTarget.value?.item.displayKey === item.displayKey) {
      baseStyle.outline = 'none'
      baseStyle.boxShadow = 'none'
    }
    else {
      baseStyle.outline = '1.5px solid rgba(47, 107, 255, 0.9)'
      baseStyle.outlineOffset = '1px'
      baseStyle.boxShadow = 'none'
    }
  }
  return baseStyle
}

function resolveElementTextStyle(item: OverlayElementItem): Record<string, string> {
  const presentation = resolveElementPresentationForOverlay(item)
  return {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: item.element.type === 'badge' ? 'center' : 'flex-start',
    justifyContent: presentation.textAlign === 'center'
      ? 'center'
      : presentation.textAlign === 'right'
        ? 'flex-end'
        : 'flex-start',
    padding: item.element.type === 'badge'
      ? `${Math.max(4, Math.round(6 * viewport.value.zoom))}px ${Math.max(8, Math.round(12 * viewport.value.zoom))}px`
      : '0',
    borderRadius: `${Math.max(0, Math.round(presentation.borderRadius * viewport.value.zoom))}px`,
    background: item.element.type === 'badge' ? presentation.fill : 'transparent',
    color: presentation.color,
    fontSize: `${Math.max(11, Math.round(presentation.fontSize * viewport.value.zoom))}px`,
    fontWeight: String(presentation.fontWeight),
    lineHeight: `${Math.max(14, Math.round(presentation.lineHeight * viewport.value.zoom))}px`,
    textAlign: presentation.textAlign,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxShadow: presentation.shadow || 'none',
  }
}

function resolveElementSvgViewBox(item: OverlayElementItem): string {
  const geometry = resolveElementAbsoluteGeometry(item)
  return `0 0 ${Math.max(1, geometry.width)} ${Math.max(1, geometry.height)}`
}

function resolveElementSvgStyle(item: OverlayElementItem): Record<string, string> {
  const presentation = resolveElementPresentationForOverlay(item)
  return {
    overflow: 'visible',
    filter: presentation.shadow ? `drop-shadow(${presentation.shadow})` : 'none',
  }
}

function resolvePathSvgPoints(item: OverlayElementItem): string {
  const worldPoints = resolvePathWorldPoints(item)
  const geometry = resolveElementAbsoluteGeometry(item)
  if (!worldPoints.length)
    return ''
  return worldPoints
    .map(point => `${point.x - geometry.x},${point.y - geometry.y}`)
    .join(' ')
}

function resolveOverlayStrokeLineCap(item: OverlayElementItem): SvgStrokeLineCap {
  const value = resolveElementPresentationForOverlay(item).strokeLineCap
  return value === 'butt' || value === 'inherit' || value === 'square'
    ? value
    : 'round'
}

function resolveOverlayStrokeLineJoin(item: OverlayElementItem): SvgStrokeLineJoin {
  const value = resolveElementPresentationForOverlay(item).strokeLineJoin
  return value === 'arcs'
    || value === 'bevel'
    || value === 'inherit'
    || value === 'miter'
    || value === 'miter-clip'
    ? value
    : 'round'
}

const selectedTransformTarget = computed(() => {
  if (props.selectionState.scope !== 'element' || props.selectionState.elementIds.length !== 1)
    return null

  const targetElementId = normalizeString(props.selectionState.primaryElementId) || normalizeString(props.selectionState.elementIds[0])
  const item = resolveOverlayElement(targetElementId, resolveSelectionDisplayFrameId())
  if (!item || !canTransformOverlayElement(item))
    return null

  const geometry = resolveElementAbsoluteGeometry(item)
  return {
    item,
    elementId: targetElementId,
    geometry,
  }
})

const selectedTransformBoxStyle = computed<Record<string, string> | null>(() => {
  const target = selectedTransformTarget.value
  if (!target)
    return null

  return {
    left: `${target.geometry.x * viewport.value.zoom + viewport.value.x}px`,
    top: `${target.geometry.y * viewport.value.zoom + viewport.value.y}px`,
    width: `${Math.max(target.geometry.width * viewport.value.zoom, 8)}px`,
    height: `${Math.max(target.geometry.height * viewport.value.zoom, 8)}px`,
    transform: target.geometry.rotation ? `rotate(${target.geometry.rotation}deg)` : 'none',
    transformOrigin: 'center center',
  }
})

const rotateHandleStyle = computed<Record<string, string> | null>(() => {
  if (!selectedTransformTarget.value)
    return null
  return {
    top: `-${ROTATE_HANDLE_OFFSET}px`,
    left: '50%',
    transform: 'translateX(-50%)',
  }
})

const selectedTransformSizeBadgeStyle = computed<Record<string, string> | null>(() => {
  const target = selectedTransformTarget.value
  if (!target)
    return null

  return {
    left: `${(target.geometry.x + target.geometry.width / 2) * viewport.value.zoom + viewport.value.x}px`,
    top: `${(target.geometry.y + target.geometry.height) * viewport.value.zoom + viewport.value.y + 30}px`,
    transform: 'translate3d(-50%, 0, 0)',
    whiteSpace: 'nowrap',
    width: 'max-content',
    maxWidth: 'none',
    writingMode: 'horizontal-tb',
  }
})

const selectedTransformSizeMetrics = computed(() => {
  const target = selectedTransformTarget.value
  if (!target)
    return null
  return {
    width: `${roundMetric(target.geometry.width)}`,
    height: `${roundMetric(target.geometry.height)}`,
  }
})
const selectedTransformAngleLabel = computed(() => {
  const target = selectedTransformTarget.value
  if (!target)
    return ''
  return `${normalizeRotation(target.geometry.rotation)}°`
})
const liveTransformBadge = computed<null | {
  style: Record<string, string>
  text: string
  status?: string
}>(() => {
  const draft = elementTransformDraft.value
  if (!draft?.hasExceededThreshold || !selectedTransformSizeBadgeStyle.value)
    return null

  if (draft.mode === 'resize' && selectedTransformSizeMetrics.value) {
    return {
      style: selectedTransformSizeBadgeStyle.value,
      text: `${selectedTransformSizeMetrics.value.width} × ${selectedTransformSizeMetrics.value.height}`,
      status: draft.preserveAspect ? '等比' : undefined,
    }
  }

  if (draft.mode === 'rotate' && selectedTransformAngleLabel.value) {
    return {
      style: selectedTransformSizeBadgeStyle.value,
      text: selectedTransformAngleLabel.value,
    }
  }

  return null
})

const visibleFrameGrids = computed(() => {
  return (props.frames || [])
    .map((frame) => {
      const grid = resolveDesignFrameGridMetadata(frame.metadata?.grid)
      if (!grid.visible || frame.kind === 'diagram')
        return null

      const contentWidth = Math.max(0, frame.width - grid.margin * 2)
      const contentHeight = Math.max(0, frame.height - grid.margin * 2)
      const columnWidth = Math.max(0, (contentWidth - grid.gutter * Math.max(0, grid.columns - 1)) / grid.columns)
      const rowHeight = Math.max(0, (contentHeight - grid.gutter * Math.max(0, grid.rows - 1)) / grid.rows)
      const columnGuides = Array.from({ length: grid.columns + 1 }, (_, index) => {
        if (index === 0)
          return frame.x + grid.margin
        if (index === grid.columns)
          return frame.x + frame.width - grid.margin
        return frame.x + grid.margin + index * columnWidth + (index - 1) * grid.gutter
      })
      const rowGuides = Array.from({ length: grid.rows + 1 }, (_, index) => {
        if (index === 0)
          return frame.y + grid.margin
        if (index === grid.rows)
          return frame.y + frame.height - grid.margin
        return frame.y + grid.margin + index * rowHeight + (index - 1) * grid.gutter
      })
      return {
        frame,
        columnGuides,
        rowGuides,
      }
    })
    .filter((value): value is { frame: DesignFrameModel, columnGuides: number[], rowGuides: number[] } => Boolean(value))
})

function canInteractWithOverlayElement(item: OverlayElementItem): boolean {
  if (props.activeTool !== 'select' || props.disabled || isHandModeActive.value || item.element.locked)
    return false

  const editingFrameId = normalizeString(props.selectionState.editingFrameId)
  const activeDisplayFrameId = resolveSelectionDisplayFrameId()
  if (editingFrameId)
    return item.ownerFrameId === editingFrameId
      && item.displayFrameId === (activeDisplayFrameId || editingFrameId)

  if (props.interactionContext.isDeepSelectModifierPressed)
    return true

  return !item.ownerFrameId
}

function resolveTopmostFrameElementAtClientPoint(
  frameId: string,
  clientX: number,
  clientY: number,
): OverlayElementItem | null {
  const normalizedFrameId = normalizeString(frameId)
  if (!normalizedFrameId)
    return null

  const candidates = overlayElements.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      return !item.element.locked
        && item.displayFrameId === normalizedFrameId
    })
    .sort((left, right) => {
      const zIndexDelta = Number(right.item.element.zIndex || 0) - Number(left.item.element.zIndex || 0)
      if (zIndexDelta !== 0)
        return zIndexDelta
      return left.index - right.index
    })

  for (const { item } of candidates) {
    const rect = toScreenRect(item)
    const right = rect.left + rect.width
    const bottom = rect.top + rect.height
    if (clientX >= rect.left && clientX <= right && clientY >= rect.top && clientY <= bottom)
      return item
  }
  return null
}

function handleCanvasNodeDoubleClick(payload: {
  frameId: string
  clientX: number
  clientY: number
}): void {
  const frameId = normalizeString(payload.frameId)
  const displayFrame = frameMap.value.get(frameId) || null
  const ownerFrame = frameOwnerFrameMap.value.get(frameId) || displayFrame
  if (!displayFrame || !ownerFrame || !canDesignFrameCreateElements(ownerFrame))
    return

  clearTransientOverlayDrafts()

  const hitItem = resolveTopmostFrameElementAtClientPoint(
    frameId,
    payload.clientX,
    payload.clientY,
  )
  if (hitItem) {
    emit('request-deep-selection', {
      ownerFrameId: hitItem.ownerFrameId || ownerFrame.id,
      ownerPageId: normalizeString(hitItem.ownerFrame?.pageId) || normalizeString(ownerFrame.pageId),
      displayFrameId: hitItem.displayFrameId || displayFrame.id,
      ownerElementId: hitItem.element.id,
    })
    return
  }

  emit('request-deep-selection', {
    ownerFrameId: ownerFrame.id,
    ownerPageId: normalizeString(ownerFrame.pageId),
    displayFrameId: displayFrame.id,
  })
}

function normalizeWheelDelta(delta: number, deltaMode: number): number {
  if (deltaMode === 1)
    return delta * 16
  if (deltaMode === 2)
    return delta * 120
  return delta
}

function handleOverlayWheel(event: WheelEvent): void {
  if (props.disabled || !overlayRootRef.value)
    return

  event.preventDefault()
  event.stopPropagation()

  const currentViewport = viewport.value
  const rootRect = overlayRootRef.value.getBoundingClientRect()
  const normalizedDeltaX = normalizeWheelDelta(event.deltaX, event.deltaMode)
  const normalizedDeltaY = normalizeWheelDelta(event.deltaY, event.deltaMode)
  const zoomGesture = Boolean(event.ctrlKey || event.metaKey)

  if (!zoomGesture) {
    handleViewportChange({
      x: roundMetric(currentViewport.x - normalizedDeltaX),
      y: roundMetric(currentViewport.y - normalizedDeltaY),
      zoom: currentViewport.zoom,
    })
    return
  }

  const nextZoom = clampCanvasZoom(currentViewport.zoom * Math.exp(-normalizedDeltaY * 0.0025))
  if (Math.abs(nextZoom - currentViewport.zoom) < 0.0001)
    return

  const pointerX = event.clientX - rootRect.left
  const pointerY = event.clientY - rootRect.top
  const flowX = (pointerX - currentViewport.x) / currentViewport.zoom
  const flowY = (pointerY - currentViewport.y) / currentViewport.zoom

  handleViewportChange({
    x: roundMetric(pointerX - flowX * nextZoom),
    y: roundMetric(pointerY - flowY * nextZoom),
    zoom: Number(nextZoom.toFixed(4)),
  })
}

function handleViewportChange(payload: { x: number, y: number, zoom: number }): void {
  viewport.value = payload
  emit('viewport-change', payload)
}

function applyElementResizeDelta(
  draft: ElementTransformDraft,
  event: PointerEvent,
): Partial<DesignElementModel> {
  const handle = draft.handle
  if (!handle)
    return {}

  const targetItem = resolveOverlayElement(draft.targetElementId, draft.displayFrameId)
  const contentScale = Math.max(0.0001, targetItem ? resolveElementContentScale(targetItem) : 1)
  const rotationInRadians = (draft.startGeometry.rotation * Math.PI) / 180
  const pointerDelta = {
    x: (event.clientX - draft.startClientX) / viewport.value.zoom / contentScale,
    y: (event.clientY - draft.startClientY) / viewport.value.zoom / contentScale,
  }
  const localDelta = rotateVector(pointerDelta.x, pointerDelta.y, -rotationInRadians)

  let left = -draft.startGeometry.width / 2
  let right = draft.startGeometry.width / 2
  let top = -draft.startGeometry.height / 2
  let bottom = draft.startGeometry.height / 2

  if (handle.includes('e'))
    right += localDelta.x
  if (handle.includes('s'))
    bottom += localDelta.y
  if (handle.includes('w'))
    left += localDelta.x
  if (handle.includes('n'))
    top += localDelta.y

  if (right - left < MIN_ELEMENT_WIDTH) {
    if (handle.includes('w'))
      left = right - MIN_ELEMENT_WIDTH
    else if (handle.includes('e'))
      right = left + MIN_ELEMENT_WIDTH
    else {
      const centerX = (left + right) / 2
      left = centerX - MIN_ELEMENT_WIDTH / 2
      right = centerX + MIN_ELEMENT_WIDTH / 2
    }
  }
  if (bottom - top < MIN_ELEMENT_HEIGHT) {
    if (handle.includes('n'))
      top = bottom - MIN_ELEMENT_HEIGHT
    else if (handle.includes('s'))
      bottom = top + MIN_ELEMENT_HEIGHT
    else {
      const centerY = (top + bottom) / 2
      top = centerY - MIN_ELEMENT_HEIGHT / 2
      bottom = centerY + MIN_ELEMENT_HEIGHT / 2
    }
  }

  const preserveAspect = Boolean(event.ctrlKey || event.metaKey)
  if (preserveAspect) {
    const startWidth = Math.max(MIN_ELEMENT_WIDTH, draft.startGeometry.width)
    const startHeight = Math.max(MIN_ELEMENT_HEIGHT, draft.startGeometry.height)
    const aspectRatio = startWidth / startHeight
    const horizontalOnly = handle === 'e' || handle === 'w'
    const verticalOnly = handle === 'n' || handle === 's'
    let nextWidth = right - left
    let nextHeight = bottom - top

    if (horizontalOnly) {
      nextWidth = Math.max(MIN_ELEMENT_WIDTH, nextWidth)
      nextHeight = Math.max(MIN_ELEMENT_HEIGHT, nextWidth / aspectRatio)
      if (handle === 'w')
        left = right - nextWidth
      else
        right = left + nextWidth
      top = -nextHeight / 2
      bottom = nextHeight / 2
    }
    else if (verticalOnly) {
      nextHeight = Math.max(MIN_ELEMENT_HEIGHT, nextHeight)
      nextWidth = Math.max(MIN_ELEMENT_WIDTH, nextHeight * aspectRatio)
      if (handle === 'n')
        top = bottom - nextHeight
      else
        bottom = top + nextHeight
      left = -nextWidth / 2
      right = nextWidth / 2
    }
    else {
      const scaleX = nextWidth / startWidth
      const scaleY = nextHeight / startHeight
      const uniformScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY
      nextWidth = Math.max(MIN_ELEMENT_WIDTH, startWidth * uniformScale)
      nextHeight = Math.max(MIN_ELEMENT_HEIGHT, startHeight * uniformScale)
      if (handle.includes('w'))
        left = right - nextWidth
      else
        right = left + nextWidth
      if (handle.includes('n'))
        top = bottom - nextHeight
      else
        bottom = top + nextHeight
    }
  }

  const nextWidth = Math.max(MIN_ELEMENT_WIDTH, right - left)
  const nextHeight = Math.max(MIN_ELEMENT_HEIGHT, bottom - top)
  const centerOffsetLocal = {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
  }
  const centerOffsetWorld = rotateVector(centerOffsetLocal.x, centerOffsetLocal.y, rotationInRadians)
  const nextCenter = {
    x: draft.startCenter.x + centerOffsetWorld.x,
    y: draft.startCenter.y + centerOffsetWorld.y,
  }
  const nextX = nextCenter.x - nextWidth / 2
  const nextY = nextCenter.y - nextHeight / 2

  return {
    x: roundMetric(nextX),
    y: roundMetric(nextY),
    width: roundMetric(nextWidth),
    height: roundMetric(nextHeight),
  }
}

function applyElementRotationDelta(
  draft: ElementTransformDraft,
  event: PointerEvent,
): Partial<DesignElementModel> {
  const currentPointer = toFlowPoint(event)
  const nextPointerAngle = Math.atan2(currentPointer.y - draft.startCenter.y, currentPointer.x - draft.startCenter.x)
  const startPointerAngle = draft.startPointerAngle ?? nextPointerAngle
  const rotationDelta = ((nextPointerAngle - startPointerAngle) * 180) / Math.PI
  return {
    rotation: normalizeRotation(draft.startGeometry.rotation + rotationDelta),
  }
}

function resolveSelectionDraftMatches(draft: ElementSelectionDraft): string[] {
  const left = Math.min(draft.startClientX, draft.currentClientX)
  const top = Math.min(draft.startClientY, draft.currentClientY)
  const right = Math.max(draft.startClientX, draft.currentClientX)
  const bottom = Math.max(draft.startClientY, draft.currentClientY)
  return selectableOverlayElements.value
    .filter((item) => {
      const screenRect = toScreenRect(item)
      const itemRight = screenRect.left + screenRect.width
      const itemBottom = screenRect.top + screenRect.height
      return screenRect.left < right
        && itemRight > left
        && screenRect.top < bottom
        && itemBottom > top
    })
    .map(item => item.element.id)
}

function handleOverlayPanePointerDown(event: PointerEvent): void {
  const flowPoint = toFlowPoint(event)
  const containerPoint = toContainerPoint(flowPoint)
  if (props.activeTool === 'pencil') {
    createDraft.value = {
      frameId: containerPoint.frameId,
      startX: containerPoint.x,
      startY: containerPoint.y,
      currentX: containerPoint.x,
      currentY: containerPoint.y,
      points: [{ x: containerPoint.x, y: containerPoint.y }],
    }
    return
  }
  if (props.activeTool === 'rectangle' || props.activeTool === 'ellipse' || props.activeTool === 'arrow' || props.activeTool === 'text') {
    createDraft.value = {
      frameId: containerPoint.frameId,
      startX: containerPoint.x,
      startY: containerPoint.y,
      currentX: containerPoint.x,
      currentY: containerPoint.y,
    }
    return
  }
  if (props.activeTool !== 'select' || !deepSelectionEnabled.value)
    return

  elementSelectionDraft.value = {
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    selecting: false,
    additive: Boolean(event.shiftKey),
    previewElementIds: [],
  }
}

function emitCreateElementFromDraft(): void {
  if (!createDraft.value || !props.page)
    return
  const frame = normalizeString(props.selectionState.editingFrameId)
    ? (props.frames || []).find(item => item.id === props.selectionState.editingFrameId) || null
    : null
  const minX = Math.min(createDraft.value.startX, createDraft.value.currentX)
  const minY = Math.min(createDraft.value.startY, createDraft.value.currentY)
  const width = Math.max(1, Math.abs(createDraft.value.currentX - createDraft.value.startX))
  const height = Math.max(1, Math.abs(createDraft.value.currentY - createDraft.value.startY))
  if (props.activeTool === 'pencil') {
    emit('create-element', {
      type: 'path',
      pageId: props.page.id,
      frameId: frame?.id,
      x: minX,
      y: minY,
      width,
      height,
      points: createDraft.value.points,
      style: {
        stroke: '#0f172a',
        strokeWidth: 3,
      },
    })
    createDraft.value = null
    return
  }

  if (props.activeTool === 'text') {
    emit('create-element', {
      type: 'text',
      pageId: props.page.id,
      frameId: frame?.id,
      x: createDraft.value.startX,
      y: createDraft.value.startY,
      width: Math.max(width, 160),
      height: Math.max(height, 40),
      text: '新建文本',
      style: {
        fontSize: 28,
        fontWeight: 700,
        color: '#0f172a',
      },
    })
    createDraft.value = null
    return
  }

  emit('create-element', {
    type: 'shape',
    shapeKind: props.activeTool === 'ellipse' ? 'ellipse' : props.activeTool === 'arrow' ? 'arrow' : 'rectangle',
    pageId: props.page.id,
    frameId: frame?.id,
    x: minX,
    y: minY,
    width,
    height,
    style: {
      fill: props.activeTool === 'arrow' ? 'transparent' : 'rgba(148, 163, 184, 0.18)',
      stroke: '#334155',
      strokeWidth: 2,
    },
  })
  createDraft.value = null
}

function handleOverlayPointerMove(event: PointerEvent): void {
  if (createDraft.value) {
    const flowPoint = toFlowPoint(event)
    const containerPoint = toContainerPoint(flowPoint)
    createDraft.value = {
      ...createDraft.value,
      currentX: containerPoint.x,
      currentY: containerPoint.y,
      points: props.activeTool === 'pencil'
        ? [...(createDraft.value.points || []), { x: containerPoint.x, y: containerPoint.y }]
        : createDraft.value.points,
    }
    return
  }

  if (elementTransformDraft.value) {
    const preserveAspect = Boolean(event.ctrlKey || event.metaKey)
    const hasExceededThreshold = elementTransformDraft.value.hasExceededThreshold || (
      Math.abs(event.clientX - elementTransformDraft.value.startClientX) > POINTER_GESTURE_THRESHOLD
      || Math.abs(event.clientY - elementTransformDraft.value.startClientY) > POINTER_GESTURE_THRESHOLD
    )
    elementTransformDraft.value = {
      ...elementTransformDraft.value,
      hasExceededThreshold,
      preserveAspect: elementTransformDraft.value.mode === 'resize' ? preserveAspect : false,
      previewPatch: elementTransformDraft.value.mode === 'resize'
        ? applyElementResizeDelta(elementTransformDraft.value, event)
        : applyElementRotationDelta(elementTransformDraft.value, event),
    }
    return
  }

  if (elementSelectionDraft.value) {
    const deltaX = Math.abs(event.clientX - elementSelectionDraft.value.startClientX)
    const deltaY = Math.abs(event.clientY - elementSelectionDraft.value.startClientY)
    const selecting = deltaX > POINTER_GESTURE_THRESHOLD || deltaY > POINTER_GESTURE_THRESHOLD
    const nextDraft: ElementSelectionDraft = {
      ...elementSelectionDraft.value,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      selecting,
      previewElementIds: [],
    }
    if (selecting)
      nextDraft.previewElementIds = resolveSelectionDraftMatches(nextDraft)
    elementSelectionDraft.value = nextDraft
    return
  }

  if (!elementDragDraft.value)
    return

  const draft = elementDragDraft.value
  const deltaX = (event.clientX - draft.startClientX) / viewport.value.zoom
  const deltaY = (event.clientY - draft.startClientY) / viewport.value.zoom
  if (!draft.dragging) {
    if (draft.additive || (Math.abs(deltaX) <= POINTER_GESTURE_THRESHOLD / viewport.value.zoom && Math.abs(deltaY) <= POINTER_GESTURE_THRESHOLD / viewport.value.zoom))
      return

    const currentElementIds = props.selectionState.scope === 'element'
      ? props.selectionState.elementIds
      : []
    const shouldDragCurrentSelection = currentElementIds.includes(draft.targetElementId)
    const activeElementIds = shouldDragCurrentSelection
      ? selectableOverlayElements.value
          .map(item => item.element.id)
          .filter(elementId => currentElementIds.includes(elementId))
      : [draft.targetElementId]
    const startPositions = Object.fromEntries(activeElementIds.map((elementId) => {
      const element = resolveOverlayElement(elementId, draft.displayFrameId)?.element
      return [elementId, {
        x: Number(element?.x || 0),
        y: Number(element?.y || 0),
      }]
    }))

    elementDragDraft.value = {
      ...draft,
      dragging: true,
      activeElementIds,
      startPositions,
    }
  }

  if (!elementDragDraft.value?.dragging)
    return

  elementDragDraft.value = {
    ...elementDragDraft.value,
    previewPatches: Object.fromEntries(elementDragDraft.value.activeElementIds.map((elementId) => {
      const position = elementDragDraft.value?.startPositions[elementId]
      const item = resolveOverlayElement(elementId, elementDragDraft.value?.displayFrameId) || null
      const contentScale = Math.max(0.0001, item ? resolveElementContentScale(item) : 1)
      return [
        elementId,
        {
          x: Number(position?.x || 0) + deltaX / contentScale,
          y: Number(position?.y || 0) + deltaY / contentScale,
        },
      ]
    })),
  }
}

function handleOverlayPointerUp(): void {
  if (createDraft.value) {
    emitCreateElementFromDraft()
    return
  }

  if (elementTransformDraft.value) {
    const draft = elementTransformDraft.value
    const badgeSnapshot = liveTransformBadge.value
    if (draft.hasExceededThreshold && badgeSnapshot) {
      queueResizeBadgeFade({
        style: { ...badgeSnapshot.style },
        text: badgeSnapshot.text,
        status: badgeSnapshot.status,
      })
    }
    const hasPatch = Object.keys(draft.previewPatch).length > 0
    if (hasPatch) {
      emit('update-element', {
        elementId: draft.targetElementId,
        patch: draft.previewPatch,
        historyMergeKey: draft.mode === 'resize' ? 'element-resize' : 'element-rotate',
      })
    }
    elementTransformDraft.value = null
    return
  }

  if (elementSelectionDraft.value) {
    const draft = elementSelectionDraft.value
    if (draft.selecting) {
      const nextIds = draft.additive
        ? [...new Set([...(props.selectionState.scope === 'element' ? props.selectionState.elementIds : []), ...draft.previewElementIds])]
        : draft.previewElementIds
      emit('update-selection', createElementSelectionState(nextIds, {
        primaryElementId: nextIds[nextIds.length - 1] || '',
        editingFrameId: normalizeString(props.selectionState.editingFrameId),
        displayFrameId: resolveSelectionDisplayFrameId(),
      }))
    }
    else {
      emit('update-selection', createClearedSelectionState(Boolean(props.selectionState.editingFrameId)))
    }
    elementSelectionDraft.value = null
    return
  }

  if (!elementDragDraft.value)
    return

  const draft = elementDragDraft.value
  if (draft.dragging && draft.activeElementIds.length) {
    emit('update-elements', {
      patches: draft.activeElementIds.map((elementId) => ({
        elementId,
        patch: {
          x: draft.previewPatches[elementId]?.x ?? draft.startPositions[elementId]?.x ?? 0,
          y: draft.previewPatches[elementId]?.y ?? draft.startPositions[elementId]?.y ?? 0,
        },
      })),
      historyMergeKey: 'element-drag',
    })
      emit('update-selection', createElementSelectionState(draft.activeElementIds, {
        primaryElementId: draft.targetElementId,
        editingFrameId: draft.editingFrameId,
        displayFrameId: draft.displayFrameId,
      }))
    elementDragDraft.value = null
    return
  }

  if (draft.additive) {
    const currentIds = props.selectionState.scope === 'element'
      ? props.selectionState.elementIds
      : []
    const nextIds = currentIds.includes(draft.targetElementId)
      ? currentIds.filter(elementId => elementId !== draft.targetElementId)
      : [...currentIds, draft.targetElementId]
    emit('update-selection', createElementSelectionState(nextIds, {
      primaryElementId: draft.targetElementId,
      editingFrameId: draft.editingFrameId,
      displayFrameId: draft.displayFrameId,
    }))
  }
  else {
    emit('update-selection', createElementSelectionState([draft.targetElementId], {
      primaryElementId: draft.targetElementId,
      editingFrameId: draft.editingFrameId,
      displayFrameId: draft.displayFrameId,
    }))
  }
  elementDragDraft.value = null
}

function handleElementDragStart(event: PointerEvent, item: OverlayElementItem): void {
  if (!canDragOverlayElement(item))
    return
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  elementDragDraft.value = {
    targetElementId: item.element.id,
    displayFrameId: item.displayFrameId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    dragging: false,
    additive: Boolean(event.shiftKey),
    activeElementIds: [],
    previewPatches: {},
    startPositions: {},
    editingFrameId: item.ownerFrameId || normalizeString(props.selectionState.editingFrameId),
  }
}

function handleElementClick(event: MouseEvent, item: OverlayElementItem): void {
  if (!canInteractWithOverlayElement(item))
    return

  const targetElementId = normalizeString(item.element.id)
  if (!targetElementId)
    return

  const currentIds = props.selectionState.scope === 'element'
    ? props.selectionState.elementIds
    : []
  const nextIds = event.shiftKey
    ? currentIds.includes(targetElementId)
      ? currentIds.filter(elementId => elementId !== targetElementId)
      : [...currentIds, targetElementId]
    : [targetElementId]

  emit('update-selection', createElementSelectionState(nextIds, {
    primaryElementId: targetElementId,
    editingFrameId: item.ownerFrameId || normalizeString(props.selectionState.editingFrameId),
    displayFrameId: item.displayFrameId,
  }))
}

function handleElementResizeHandlePointerDown(
  event: PointerEvent,
  handle: ResizeHandleDirection,
): void {
  const target = selectedTransformTarget.value
  if (!target)
    return

  event.preventDefault()
  event.stopPropagation()
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  clearResizeBadgeGhostTimers()
  transformBadgeGhost.value = null

  const localGeometry = resolveElementLocalGeometry(target.item)
  const absoluteGeometry = resolveElementAbsoluteGeometry(target.item)
  elementTransformDraft.value = {
    mode: 'resize',
    targetElementId: target.elementId,
    editingFrameId: target.item.ownerFrameId || normalizeString(props.selectionState.editingFrameId),
    displayFrameId: target.item.displayFrameId,
    hasExceededThreshold: false,
    preserveAspect: Boolean(event.ctrlKey || event.metaKey),
    handle,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startGeometry: localGeometry,
    startCenter: {
      x: absoluteGeometry.x + absoluteGeometry.width / 2,
      y: absoluteGeometry.y + absoluteGeometry.height / 2,
    },
    previewPatch: {},
  }
}

function handleElementRotateHandlePointerDown(event: PointerEvent): void {
  const target = selectedTransformTarget.value
  if (!target)
    return

  event.preventDefault()
  event.stopPropagation()
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  clearResizeBadgeGhostTimers()
  transformBadgeGhost.value = null

  const localGeometry = resolveElementLocalGeometry(target.item)
  const absoluteGeometry = resolveElementAbsoluteGeometry(target.item)
  const pointer = toFlowPoint(event)
  elementTransformDraft.value = {
    mode: 'rotate',
    targetElementId: target.elementId,
    editingFrameId: target.item.ownerFrameId || normalizeString(props.selectionState.editingFrameId),
    displayFrameId: target.item.displayFrameId,
    hasExceededThreshold: false,
    preserveAspect: false,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startGeometry: localGeometry,
    startCenter: {
      x: absoluteGeometry.x + absoluteGeometry.width / 2,
      y: absoluteGeometry.y + absoluteGeometry.height / 2,
    },
    startPointerAngle: Math.atan2(
      pointer.y - (absoluteGeometry.y + absoluteGeometry.height / 2),
      pointer.x - (absoluteGeometry.x + absoluteGeometry.width / 2),
    ),
    previewPatch: {},
  }
}

onBeforeUnmount(() => {
  clearResizeBadgeGhostTimers()
})
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-hidden" data-testid="workspace-design-stage">
    <WorkspaceDesignCanvas
      :page="props.page"
      :frames="props.frames"
      :assets="props.assets"
      :selection-state="props.selectionState"
      :interaction-context="props.interactionContext"
      :remote-cursors="props.remoteCursors"
      :viewport-x="props.viewportX"
      :viewport-y="props.viewportY"
      :viewport-zoom="props.viewportZoom"
      :disabled="props.disabled || !['select', 'hand'].includes(props.interactionContext.effectiveTool)"
      @update-selection="emit('update-selection', $event)"
      @open-frame="emit('open-frame', $event)"
      @duplicate-frame="emit('duplicate-frame')"
      @delete-frame="emit('delete-frame')"
      @update-frame-position="emit('update-frame-position', $event)"
      @update-frame-positions="emit('update-frame-positions', $event)"
      @update-frame-size="emit('update-frame-size', $event)"
      @viewport-change="handleViewportChange"
      @update-collab-cursor="emit('updateCollabCursor', $event)"
      @node-double-click="handleCanvasNodeDoubleClick"
    />

    <div
      ref="overlayRootRef"
      class="absolute inset-0 z-10 overflow-hidden"
      :class="overlayCapturesCanvasPointer ? 'pointer-events-auto' : 'pointer-events-none'"
      @pointerdown="handleOverlayPanePointerDown"
      @pointermove="handleOverlayPointerMove"
      @pointerup="handleOverlayPointerUp"
      @pointercancel="handleOverlayPointerUp"
      @wheel.capture.prevent="handleOverlayWheel"
    >
      <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <g v-for="grid in visibleFrameGrids" :key="`grid-${grid.frame.id}`">
          <rect
            :x="grid.frame.x * viewport.zoom + viewport.x"
            :y="grid.frame.y * viewport.zoom + viewport.y"
            :width="grid.frame.width * viewport.zoom"
            :height="grid.frame.height * viewport.zoom"
            rx="12"
            ry="12"
            fill="none"
            stroke="rgba(56, 189, 248, 0.14)"
            stroke-width="1"
          />
          <line
            v-for="guide in grid.columnGuides"
            :key="`column-${grid.frame.id}-${guide}`"
            :x1="guide * viewport.zoom + viewport.x"
            :x2="guide * viewport.zoom + viewport.x"
            :y1="grid.frame.y * viewport.zoom + viewport.y"
            :y2="(grid.frame.y + grid.frame.height) * viewport.zoom + viewport.y"
            stroke="rgba(56, 189, 248, 0.22)"
            stroke-dasharray="4 4"
            stroke-width="1"
          />
          <line
            v-for="guide in grid.rowGuides"
            :key="`row-${grid.frame.id}-${guide}`"
            :x1="grid.frame.x * viewport.zoom + viewport.x"
            :x2="(grid.frame.x + grid.frame.width) * viewport.zoom + viewport.x"
            :y1="guide * viewport.zoom + viewport.y"
            :y2="guide * viewport.zoom + viewport.y"
            stroke="rgba(56, 189, 248, 0.18)"
            stroke-dasharray="4 4"
            stroke-width="1"
          />
        </g>
      </svg>

      <div
        v-for="item in overlayElements"
        :key="item.displayKey"
        class="absolute select-none"
        :class="[
          canInteractWithOverlayElement(item) ? 'pointer-events-auto' : 'pointer-events-none',
        ]"
        :style="resolveElementStyle(item)"
        @pointerdown.stop="handleElementDragStart($event, item)"
        @click.stop="handleElementClick($event, item)"
        @wheel.prevent.stop="handleOverlayWheel"
      >
        <div
          v-if="item.element.type === 'text' || item.element.type === 'caption' || item.element.type === 'badge'"
          class="h-full w-full"
          :style="resolveElementTextStyle(item)"
        >
          {{ item.element.text }}
        </div>

        <svg
          v-else
          class="h-full w-full"
          :viewBox="resolveElementSvgViewBox(item)"
          preserveAspectRatio="none"
          :style="resolveElementSvgStyle(item)"
        >
          <template v-if="item.element.type === 'shape'">
            <ellipse
              v-if="resolveElementPresentationForOverlay(item).shapeKind === 'ellipse' || resolveElementPresentationForOverlay(item).shapeKind === 'circle'"
              :cx="resolveElementPresentationForOverlay(item).width / 2"
              :cy="resolveElementPresentationForOverlay(item).height / 2"
              :rx="resolveElementPresentationForOverlay(item).width / 2"
              :ry="resolveElementPresentationForOverlay(item).height / 2"
              :fill="resolveElementPresentationForOverlay(item).fill"
              :stroke="resolveElementPresentationForOverlay(item).stroke"
              :stroke-width="resolveElementPresentationForOverlay(item).strokeWidth"
            />
            <g v-else-if="resolveElementPresentationForOverlay(item).shapeKind === 'arrow'">
              <line
                x1="0"
                :y1="resolveElementPresentationForOverlay(item).height / 2"
                :x2="resolveElementPresentationForOverlay(item).width"
                :y2="resolveElementPresentationForOverlay(item).height / 2"
                :stroke="resolveElementPresentationForOverlay(item).stroke"
                :stroke-width="resolveElementPresentationForOverlay(item).strokeWidth"
                stroke-linecap="round"
              />
              <path
                :d="`M ${resolveElementPresentationForOverlay(item).width - Math.max(12, Math.min(32, resolveElementPresentationForOverlay(item).height * 0.35))} ${resolveElementPresentationForOverlay(item).height / 2 - Math.max(12, Math.min(32, resolveElementPresentationForOverlay(item).height * 0.35)) * 0.7} L ${resolveElementPresentationForOverlay(item).width} ${resolveElementPresentationForOverlay(item).height / 2} L ${resolveElementPresentationForOverlay(item).width - Math.max(12, Math.min(32, resolveElementPresentationForOverlay(item).height * 0.35))} ${resolveElementPresentationForOverlay(item).height / 2 + Math.max(12, Math.min(32, resolveElementPresentationForOverlay(item).height * 0.35)) * 0.7}`"
                fill="none"
                :stroke="resolveElementPresentationForOverlay(item).stroke"
                :stroke-width="resolveElementPresentationForOverlay(item).strokeWidth"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </g>
            <rect
              v-else
              x="0"
              y="0"
              :width="resolveElementPresentationForOverlay(item).width"
              :height="resolveElementPresentationForOverlay(item).height"
              :rx="resolveElementPresentationForOverlay(item).borderRadius"
              :ry="resolveElementPresentationForOverlay(item).borderRadius"
              :fill="resolveElementPresentationForOverlay(item).fill"
              :stroke="resolveElementPresentationForOverlay(item).stroke"
              :stroke-width="resolveElementPresentationForOverlay(item).strokeWidth"
            />
          </template>

          <template v-else-if="item.element.type === 'image'">
            <image
              v-if="item.element.imageSrc"
              :href="item.element.imageSrc"
              x="0"
              y="0"
              :width="resolveElementPresentationForOverlay(item).width"
              :height="resolveElementPresentationForOverlay(item).height"
              preserveAspectRatio="xMidYMid slice"
            />
            <g v-else>
              <rect
                x="0"
                y="0"
                :width="resolveElementPresentationForOverlay(item).width"
                :height="resolveElementPresentationForOverlay(item).height"
                :rx="resolveElementPresentationForOverlay(item).borderRadius"
                :ry="resolveElementPresentationForOverlay(item).borderRadius"
                fill="#cbd5e1"
              />
              <text
                x="18"
                y="34"
                fill="#475569"
                font-size="16"
                font-weight="600"
              >
                待上传图片
              </text>
            </g>
          </template>

          <polyline
            v-else-if="item.element.type === 'path'"
            :points="resolvePathSvgPoints(item)"
            fill="none"
            :stroke="resolveElementPresentationForOverlay(item).stroke"
            :stroke-width="resolveElementPresentationForOverlay(item).strokeWidth"
            :stroke-linecap="resolveOverlayStrokeLineCap(item)"
            :stroke-linejoin="resolveOverlayStrokeLineJoin(item)"
          />
        </svg>
      </div>

      <div
        v-if="selectedTransformBoxStyle"
        class="absolute pointer-events-none"
        :style="selectedTransformBoxStyle"
        @wheel.prevent.stop="handleOverlayWheel"
      >
        <div class="absolute inset-0 rounded-[2px] border border-[#2f6bff]" />
        <div class="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 -translate-y-full bg-[#2f6bff]/70" />
        <button
          class="absolute rounded-full border border-[#2f6bff] bg-white pointer-events-auto"
          :style="{
            ...(rotateHandleStyle || {}),
            width: `${RESIZE_HANDLE_SIZE}px`,
            height: `${RESIZE_HANDLE_SIZE}px`,
          }"
          type="button"
          title="旋转"
          @pointerdown.stop.prevent="handleElementRotateHandlePointerDown"
        />
        <button
          v-for="handle in resizeHandleDefinitions"
          :key="handle.direction"
          class="absolute rounded-[2px] border border-[#2f6bff] bg-white pointer-events-auto"
          :style="{
            ...handle.style,
            cursor: handle.cursor,
            width: `${RESIZE_HANDLE_SIZE}px`,
            height: `${RESIZE_HANDLE_SIZE}px`,
          }"
          :title="`调整大小 ${handle.direction}`"
          type="button"
          @pointerdown.stop.prevent="handleElementResizeHandlePointerDown($event, handle.direction)"
        />
      </div>

      <div
        v-if="liveTransformBadge"
        class="absolute inline-flex items-center gap-1 rounded-[7px] border border-[#2f6bff]/18 bg-[#2f6bff] px-1.5 py-[3px] text-[8px] font-semibold leading-none text-white shadow-[0_4px_12px_rgba(47,107,255,0.16)] whitespace-nowrap min-w-max pointer-events-none"
        :style="liveTransformBadge.style"
      >
        <span>{{ liveTransformBadge.text }}</span>
        <span
          v-if="liveTransformBadge.status"
          class="rounded-full border border-white/18 bg-white/14 px-1 py-[1px] text-[7px] font-semibold leading-none text-white/92"
        >
          {{ liveTransformBadge.status }}
        </span>
      </div>

      <div
        v-if="transformBadgeGhost"
        class="absolute inline-flex items-center gap-1 rounded-[7px] border border-[#2f6bff]/18 bg-[#2f6bff] px-1.5 py-[3px] text-[8px] font-semibold leading-none text-white shadow-[0_4px_12px_rgba(47,107,255,0.16)] whitespace-nowrap min-w-max pointer-events-none transition-opacity duration-150 ease-out"
        :class="transformBadgeGhost.fading ? 'opacity-0' : 'opacity-100'"
        :style="transformBadgeGhost.style"
      >
        <span>{{ transformBadgeGhost.text }}</span>
        <span
          v-if="transformBadgeGhost.status"
          class="rounded-full border border-white/18 bg-white/14 px-1 py-[1px] text-[7px] font-semibold leading-none text-white/92"
        >
          {{ transformBadgeGhost.status }}
        </span>
      </div>

      <div
        v-if="createDraftRectStyle"
        class="pointer-events-none absolute border-2 border-dashed border-sky-500/80 bg-sky-200/10"
        :style="createDraftRectStyle"
      />

      <div
        v-else-if="elementSelectionDraft?.selecting"
        class="pointer-events-none absolute border-2 border-dashed border-sky-500/80 bg-sky-200/10"
        :style="{
          left: `${Math.min(elementSelectionDraft.startClientX, elementSelectionDraft.currentClientX) - (overlayRootRef?.getBoundingClientRect().left || 0)}px`,
          top: `${Math.min(elementSelectionDraft.startClientY, elementSelectionDraft.currentClientY) - (overlayRootRef?.getBoundingClientRect().top || 0)}px`,
          width: `${Math.max(1, Math.abs(elementSelectionDraft.currentClientX - elementSelectionDraft.startClientX))}px`,
          height: `${Math.max(1, Math.abs(elementSelectionDraft.currentClientY - elementSelectionDraft.startClientY))}px`,
          borderRadius: '16px',
        }"
      />

      <svg v-if="createDraftPathPoints" class="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <polyline
          :points="createDraftPathPoints"
          fill="none"
          stroke="#0f172a"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </div>
</template>
