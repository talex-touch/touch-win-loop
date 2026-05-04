<script setup lang="ts">
import type {
  DesignCanvasInteractionContext,
  DesignCanvasSelectionState,
} from '~~/app/composables/useDesignCanvasSelection'
import type { DesignEditorTool } from '~~/app/composables/useDesignToolController'
import type {
  CompositionModel,
  DesignAssetModel,
  DesignElementModel,
  DesignFrameModel,
  DesignPageModel,
} from '~~/shared/types/domain'
import type { WorkspaceCollabCursorUser } from '~/components/workspace/collab/presence'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createEmptyDesignCanvasSelectionState,
} from '~~/app/composables/useDesignCanvasSelection'
import {
  canDesignFrameContainElements,
  canDesignFrameCreateElements,
  isDesignFrameClipContentEnabled,
  isFlatDesignFrameKind,
  renderCompositionFramePreviewSvg,
  resolveDesignElementAbsoluteRect,
  resolveDesignElementPresentation,
  resolveDesignFrameGridMetadata,
  resolveDesignFrameProjectionLayoutForFrames,
  resolveDesignFrameSurfaceRadius,
  resolveDesignPageWorkspaceBackground,
} from '~~/shared/utils/scene-document'
import { resolveWorkspaceCollabPresenceInitial } from '~/components/workspace/collab/presence'
import WorkspaceDesignCanvasCollabOverlay from './WorkspaceDesignCanvasCollabOverlay.vue'

// Contract anchors for source-level regression tests after eslint normalization:
// type CreateElementSession = {
// type TextEditSession = {
// type CreateSessionFrameContext = {
// type SelectionDraft = {
// type ElementRotationSession = {
// type MockupScreenDragSession = {
// type FrameDragSession = {
// type FrameResizeSession = {
// type FrameDragFeedback = {
// type PendingImagePlacement = {
// type GroupEditSession = {
// type ElementGuideOverlay = {
// type AutoLayoutReorderSession = {

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
  mockupScreenEditingFrameId?: string
  pendingImagePlacement?: PendingImagePlacement | null
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
  mockupScreenEditingFrameId: '',
  pendingImagePlacement: null,
  disabled: false,
})
const emit = defineEmits<{
  'update-selection': [payload: DesignCanvasSelectionState]
  'open-frame': [frameId: string]
  'duplicate-frame': []
  'delete-frame': []
  'duplicate-element': []
  'delete-element': []
  'update-frame-position': [payload: { frameId: string, x: number, y: number, historyMergeKey?: string }]
  'update-frame-positions': [payload: { positions: Array<{ frameId: string, x: number, y: number }>, historyMergeKey?: string }]
  'update-frame-size': [payload: { frameId: string, x?: number, y?: number, width?: number, height?: number, historyMergeKey?: string }]
  'viewport-change': [payload: { x: number, y: number, zoom: number }]
  'updateCollabCursor': [value: { cursorX?: number, cursorY?: number }]
  'create-element': [payload: Partial<DesignElementModel>]
  'update-element': [payload: { elementId: string, patch: Partial<DesignElementModel>, historyMergeKey?: string }]
  'update-elements': [payload: { patches: Array<{ elementId: string, patch: Partial<DesignElementModel> }>, historyMergeKey?: string }]
  'node-double-click': [payload: { frameId: string, clientX: number, clientY: number }]
  'request-deep-selection': [payload: { ownerFrameId: string, ownerPageId: string, displayFrameId: string, ownerElementId?: string }]
  'edit-mockup-screen': [payload: { frameId: string }]
  'update-mockup-screen-transform': [payload: { frameId: string, offsetX: number, offsetY: number, historyMergeKey?: string }]
  'clear-pending-image-placement': []
}>()
const MIN_CANVAS_ZOOM = 0.1
const MAX_CANVAS_ZOOM = 2.5
const EMPTY_STAGE_WIDTH = 1600
const EMPTY_STAGE_HEIGHT = 900
const EXPORT_PADDING = 80
const CURSOR_LABEL_COLLAPSE_DISTANCE = 72
const PAN_GESTURE_THRESHOLD = 4
const CANVAS_ZOOM_STEP = 0.1
const CANVAS_NUDGE_STEP = 8
const CANVAS_GRID_NUDGE_STEP = 24
const MIN_ZOOM_PERCENT = MIN_CANVAS_ZOOM * 100
const MAX_ZOOM_PERCENT = MAX_CANVAS_ZOOM * 100
const QUICK_ZOOM_PRESETS = [50, 75, 100, 125, 150, 200]
const CANVAS_CONTROL_WIDTH = 200
const CANVAS_MINIMAP_HEIGHT = 136
const CANVAS_RESTING_CONTROL_WIDTH = 128
const CANVAS_COLLAPSED_CONTROL_WIDTH = 92
const CANVAS_EXPANDED_CONTROL_HEIGHT = 40
const CANVAS_RESTING_CONTROL_HEIGHT = 12
const CANVAS_COLLAPSED_CONTROL_HEIGHT = 8
const CANVAS_RESTING_CONTROL_HIT_HEIGHT = 28
const CANVAS_COLLAPSED_CONTROL_HIT_HEIGHT = 24
const CANVAS_EXPANDED_CONTROL_GAP = 12
const CANVAS_RESTING_CONTROL_GAP = 10
const CANVAS_COLLAPSED_CONTROL_GAP = 8
const CANVAS_RESTING_MINIMAP_HEIGHT = Math.round(
  CANVAS_MINIMAP_HEIGHT * (CANVAS_RESTING_CONTROL_WIDTH / CANVAS_CONTROL_WIDTH),
)
const CANVAS_COLLAPSED_MINIMAP_HEIGHT = Math.round(
  CANVAS_MINIMAP_HEIGHT * (CANVAS_COLLAPSED_CONTROL_WIDTH / CANVAS_CONTROL_WIDTH),
)
const ZOOM_CONTROL_COLLAPSE_DELAY = 1400
const ZOOM_CONTROL_DEEP_COLLAPSE_DELAY = 12 * 60 * 1000
const MINIMAP_PADDING = 10
const MINIMAP_WORLD_PADDING = 80
const TEXT_EDITOR_MIN_WIDTH = 160
const TEXT_EDITOR_MIN_HEIGHT = 40
const ROTATE_HANDLE_OFFSET = 28
const ELEMENT_SNAP_GRID_SIZE = 8
const ELEMENT_SNAP_THRESHOLD = 8
const FRAME_DRAG_GRID_SIZE = 24
const FRAME_DRAG_ALIGN_THRESHOLD = 16
const MIN_FRAME_WIDTH = 280
const MIN_FRAME_HEIGHT = 180

interface ViewportState {
  x: number
  y: number
  zoom: number
}

interface WorldBounds {
  x: number
  y: number
  width: number
  height: number
}

interface RemoteScreenCursor {
  userId: string
  username: string
  colorToken: string
  screenX: number
  screenY: number
  label: string
}

interface PanSession {
  pointerId: number
  startClientX: number
  startClientY: number
  startViewportX: number
  startViewportY: number
  moved: boolean
}

type FrameDragAnchor = 'start' | 'center' | 'end'

interface FrameDragItem {
  frameId: string
  label: string
  startX: number
  startY: number
  width: number
  height: number
}

interface FrameDragFeedback {
  frameId: string
  label: string
  x: number
  y: number
  hints: string[]
}

interface FrameDragSession {
  pointerId: number
  primaryFrameId: string
  startClientX: number
  startClientY: number
  moved: boolean
  historyMergeKey: string
  items: FrameDragItem[]
  previewPositions: Record<string, { x: number, y: number }>
}

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface ElementDragItem {
  elementId: string
  type: DesignElementModel['type']
  startX: number
  startY: number
  startPoints: Array<{ x: number, y: number }> | null
  startWorldX: number
  startWorldY: number
  startWorldRect: {
    x: number
    y: number
    width: number
    height: number
  }
  startWorldPoints: Array<{ x: number, y: number }> | null
  preferredFrameId: string
}

interface ElementHitItem {
  element: DesignElementModel
  displayFrame: DesignFrameModel | null
  ownerFrame: DesignFrameModel | null
  displayFrameId: string
  ownerFrameId: string
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
}

interface PendingImagePlacement {
  src: string
  name: string
  intrinsicWidth: number
  intrinsicHeight: number
  assetId?: string
  mimeType?: string
}

interface ElementDragSession {
  pointerId: number
  startClientX: number
  startClientY: number
  startZoom: number
  moved: boolean
  historyMergeKey: string
  primaryElementId: string
  guideSource: {
    label: string
    x: number
    y: number
    width: number
    height: number
    parentId?: string
  }
  isMultiSelect: boolean
  items: ElementDragItem[]
  previewPatches: Record<string, Partial<DesignElementModel>>
}

interface ElementResizeSession {
  pointerId: number
  direction: ResizeDirection
  startClientX: number
  startClientY: number
  startZoom: number
  moved: boolean
  historyMergeKey: string
  item: {
    elementId: string
    label: string
    type: DesignElementModel['type']
    x: number
    y: number
    width: number
    height: number
  }
  previewPatch: Partial<DesignElementModel> | null
}

interface FrameResizeSession {
  pointerId: number
  frameId: string
  direction: ResizeDirection
  startClientX: number
  startClientY: number
  moved: boolean
  historyMergeKey: string
  startBox: {
    x: number
    y: number
    width: number
    height: number
  }
  previewBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

type CreateElementTool = 'pencil' | 'rectangle' | 'ellipse' | 'arrow' | 'text' | 'image'

interface CreateElementSession {
  pointerId: number
  tool: CreateElementTool
  ownerFrameId: string
  displayFrameId: string
  displayFrameX: number
  displayFrameY: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  moved: boolean
  points?: Array<{ x: number, y: number }>
  imagePlacement?: PendingImagePlacement | null
}

interface CreateSessionFrameContext {
  ownerFrameId: string
  displayFrameId: string
  displayFrameX: number
  displayFrameY: number
  localX: number
  localY: number
  scope: 'frame' | 'page_root'
}

interface TextEditSession {
  elementId: string
  ownerFrameId: string
  displayFrameId: string
  draftText: string
  originalText: string
  selectAllOnOpen: boolean
}

interface SelectionDraft {
  pointerId: number
  startClientX: number
  startClientY: number
  currentClientX: number
  currentClientY: number
  selecting: boolean
  additive: boolean
  previewElementIds: string[]
}

interface ElementRotationSession {
  pointerId: number
  elementId: string
  startClientX: number
  startClientY: number
  startPointerAngle: number
  startRotation: number
  previewRotation: number
  startCenterX: number
  startCenterY: number
  moved: boolean
  historyMergeKey: string
}

interface GroupEditSession {
  groupId: string
  ownerFrameId: string
  displayFrameId: string
}

interface ElementGuideOverlay {
  label: string
  x: number
  y: number
  verticalGuideX?: number
  horizontalGuideY?: number
  hints: string[]
}

interface AutoLayoutReorderSession {
  pointerId: number
  elementId: string
  ownerFrameId: string
  displayFrameId: string
  parentId?: string
  direction: 'horizontal' | 'vertical'
  startClientX: number
  startClientY: number
  moved: boolean
  fromIndex: number
  targetIndex: number
  indicator: {
    left: number
    top: number
    width: number
    height: number
  } | null
}

interface MockupScreenDragSession {
  pointerId: number
  frameId: string
  startClientX: number
  startClientY: number
  scale: number
  startOffsetX: number
  startOffsetY: number
  previewOffsetX: number
  previewOffsetY: number
  moved: boolean
}

interface RootClientSize {
  width: number
  height: number
}

interface MinimapMetrics {
  scale: number
  contentX: number
  contentY: number
  contentWidth: number
  contentHeight: number
}

interface MinimapFrameItem {
  id: string
  label: string
  style: Record<string, string>
  state: 'default' | 'selected' | 'editing'
}

interface PageRootElementPreviewItem {
  key: string
  element: DesignElementModel
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
}

type ZoomControlState = 'expanded' | 'resting' | 'dormant'

const rootRef = ref<HTMLDivElement | null>(null)
const minimapRef = ref<HTMLDivElement | null>(null)
const textEditorRef = ref<HTMLTextAreaElement | null>(null)
const viewport = ref<ViewportState>({
  x: Number(props.viewportX || 0),
  y: Number(props.viewportY || 0),
  zoom: clampCanvasZoom(props.viewportZoom),
})
const transientElementPatches = ref<Record<string, Partial<DesignElementModel>>>({})
const transientFramePatches = ref<Record<string, Partial<DesignFrameModel>>>({})
const rootClientSize = ref<RootClientSize>({
  width: 0,
  height: 0,
})
const localPointerScreen = ref<{ x: number, y: number } | null>(null)
const panSession = ref<PanSession | null>(null)
const frameDragSession = ref<FrameDragSession | null>(null)
const frameResizeSession = ref<FrameResizeSession | null>(null)
const frameDragFeedback = ref<FrameDragFeedback | null>(null)
const elementDragSession = ref<ElementDragSession | null>(null)
const elementResizeSession = ref<ElementResizeSession | null>(null)
const elementRotationSession = ref<ElementRotationSession | null>(null)
const createElementSession = ref<CreateElementSession | null>(null)
const selectionDraft = ref<SelectionDraft | null>(null)
const textEditSession = ref<TextEditSession | null>(null)
const groupEditSession = ref<GroupEditSession | null>(null)
const elementGuideOverlay = ref<ElementGuideOverlay | null>(null)
const pendingCreatedTextEdit = ref<null | {
  ownerFrameId: string
  displayFrameId: string
  selectAllOnOpen: boolean
}>(null)
const autoLayoutReorderSession = ref<AutoLayoutReorderSession | null>(null)
const mockupScreenDragSession = ref<MockupScreenDragSession | null>(null)
const suppressBackgroundClick = ref(false)
const zoomControlState = ref<ZoomControlState>('expanded')
const zoomControlHovering = ref(false)

let rootResizeObserver: ResizeObserver | null = null
let activeMinimapPointerId: number | null = null
let zoomControlRestingTimer: ReturnType<typeof setTimeout> | null = null
let zoomControlDormantTimer: ReturnType<typeof setTimeout> | null = null
let suppressElementClick = false
let suppressFrameClick = false
let transientElementPatchFrame: number | null = null
let transientFramePatchFrame: number | null = null
let pendingTransientElementPatches: Record<string, Partial<DesignElementModel>> | null = null
let pendingTransientFramePatches: Record<string, Partial<DesignFrameModel>> | null = null

function cloneDesignElementPoints(points: DesignElementModel['points']) {
  return points?.map(point => ({ ...point }))
}

function mergeElementPreviewPatch(
  element: DesignElementModel,
  patch: Partial<DesignElementModel> | undefined,
): DesignElementModel {
  if (!patch)
    return element

  return {
    ...element,
    ...patch,
    points: patch.points ? cloneDesignElementPoints(patch.points) : element.points,
    style: patch.style
      ? {
          ...(element.style || {}),
          ...patch.style,
        }
      : element.style,
    metadata: patch.metadata
      ? {
          ...(element.metadata || {}),
          ...patch.metadata,
        }
      : element.metadata,
  }
}

function mergeFramePreviewPatch(
  frame: DesignFrameModel,
  patch: Partial<DesignFrameModel> | undefined,
): DesignFrameModel {
  if (!patch)
    return frame

  return {
    ...frame,
    ...patch,
    themeTokens: patch.themeTokens
      ? {
          ...(frame.themeTokens || {}),
          ...patch.themeTokens,
        }
      : frame.themeTokens,
    metadata: patch.metadata
      ? {
          ...(frame.metadata || {}),
          ...patch.metadata,
          device: patch.metadata.device
            ? {
                ...(frame.metadata?.device || {}),
                ...patch.metadata.device,
                screenTransform: patch.metadata.device.screenTransform
                  ? {
                      ...(frame.metadata?.device?.screenTransform || {}),
                      ...patch.metadata.device.screenTransform,
                    }
                  : frame.metadata?.device?.screenTransform,
              }
            : frame.metadata?.device,
        }
      : frame.metadata,
  }
}

function flushTransientElementPatches(): void {
  if (transientElementPatchFrame !== null) {
    cancelAnimationFrame(transientElementPatchFrame)
    transientElementPatchFrame = null
  }
  transientElementPatches.value = pendingTransientElementPatches || {}
  pendingTransientElementPatches = null
}

function flushTransientFramePatches(): void {
  if (transientFramePatchFrame !== null) {
    cancelAnimationFrame(transientFramePatchFrame)
    transientFramePatchFrame = null
  }
  transientFramePatches.value = pendingTransientFramePatches || {}
  pendingTransientFramePatches = null
}

function scheduleTransientElementPatches(
  patches: Record<string, Partial<DesignElementModel>>,
): void {
  pendingTransientElementPatches = patches
  if (transientElementPatchFrame !== null)
    return
  transientElementPatchFrame = window.requestAnimationFrame(() => {
    transientElementPatchFrame = null
    transientElementPatches.value = pendingTransientElementPatches || {}
    pendingTransientElementPatches = null
  })
}

function scheduleTransientFramePatches(
  patches: Record<string, Partial<DesignFrameModel>>,
): void {
  pendingTransientFramePatches = patches
  if (transientFramePatchFrame !== null)
    return
  transientFramePatchFrame = window.requestAnimationFrame(() => {
    transientFramePatchFrame = null
    transientFramePatches.value = pendingTransientFramePatches || {}
    pendingTransientFramePatches = null
  })
}

function clearTransientElementPatches(): void {
  pendingTransientElementPatches = null
  if (transientElementPatchFrame !== null) {
    cancelAnimationFrame(transientElementPatchFrame)
    transientElementPatchFrame = null
  }
  transientElementPatches.value = {}
}

function clearTransientFramePatches(): void {
  pendingTransientFramePatches = null
  if (transientFramePatchFrame !== null) {
    cancelAnimationFrame(transientFramePatchFrame)
    transientFramePatchFrame = null
  }
  transientFramePatches.value = {}
}

const resolvedPageId = computed(() => {
  return normalizeString(props.page?.id) || normalizeString(props.frames[0]?.pageId) || 'page-1'
})

const normalizedFrames = computed<DesignFrameModel[]>(() => {
  const nextFrames: DesignFrameModel[] = []
  const seenIds = new Set<string>()
  for (const frame of props.frames || []) {
    const frameId = normalizeString(frame.id)
    if (!frameId || seenIds.has(frameId))
      continue
    seenIds.add(frameId)
    nextFrames.push(
      mergeFramePreviewPatch(frame, transientFramePatches.value[frameId]),
    )
  }
  return nextFrames
})

const previewPageRootElements = computed<DesignElementModel[]>(() => {
  const nextElements: DesignElementModel[] = []
  const seenIds = new Set<string>()

  for (const element of props.pageRootElements || []) {
    const elementId = normalizeString(element.id)
    if (!elementId || seenIds.has(elementId))
      continue
    seenIds.add(elementId)
    nextElements.push(
      mergeElementPreviewPatch(
        element,
        transientElementPatches.value[elementId],
      ),
    )
  }

  return nextElements
})

const previewFrameElementsById = computed<Record<string, DesignElementModel[]>>(() => {
  return Object.fromEntries(
    normalizedFrames.value.map((frame) => {
      const frameElements = props.frameElements[frame.id] || frame.elements || []
      return [
        frame.id,
        frameElements
          .map((element) => {
            const elementId = normalizeString(element.id)
            return mergeElementPreviewPatch(
              {
                ...element,
                pageId: normalizeString(element.pageId) || frame.pageId,
                frameId: normalizeString(element.frameId) || frame.id,
              },
              transientElementPatches.value[elementId],
            )
          })
          .filter(element => Boolean(normalizeString(element.id))),
      ] as const
    }),
  )
})

const compositionElements = computed<DesignElementModel[]>(() => {
  const nextElements: DesignElementModel[] = []
  const seenIds = new Set<string>()

  for (const element of previewPageRootElements.value) {
    const elementId = normalizeString(element.id)
    if (!elementId || seenIds.has(elementId))
      continue
    seenIds.add(elementId)
    nextElements.push(element)
  }

  for (const frame of normalizedFrames.value) {
    const frameElements = previewFrameElementsById.value[frame.id] || []
    for (const element of frameElements) {
      const elementId = normalizeString(element.id)
      if (!elementId || seenIds.has(elementId))
        continue
      seenIds.add(elementId)
      nextElements.push(element)
    }
  }

  return nextElements
})

const compositionModel = computed<CompositionModel>(() => {
  const pageFrameIds = normalizedFrames.value
    .filter(frame => normalizeString(frame.pageId) === resolvedPageId.value)
    .map(frame => frame.id)
  const workspaceBackground = resolveDesignPageWorkspaceBackground(props.page)

  return {
    kind: 'composition',
    templateKey: normalizeString(normalizedFrames.value[0]?.templateKey) || 'device-showcase',
    pages: [{
      id: resolvedPageId.value,
      name: normalizeString(props.page?.name) || 'Canvas',
      background: workspaceBackground,
      frameIds: pageFrameIds,
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
      },
      metadata: props.page?.metadata || {},
    }],
    currentPageId: resolvedPageId.value,
    frames: normalizedFrames.value,
    elements: compositionElements.value,
    assets: props.assets || [],
    slots: {},
    themeTokens: props.themeTokens || {},
    layoutRules: {},
    allowedBlocks: [],
    exportPresets: ['svg'],
    aspectRatio: '16:9',
    deviceFramePresetKey: normalizeString(
      normalizedFrames.value.find(frame => normalizeString(frame.deviceFramePresetKey))?.deviceFramePresetKey,
    ) || 'iphone-16-pro',
    blocks: [],
    metadata: {},
  }
})

const workspaceBackground = computed(() => resolveDesignPageWorkspaceBackground(props.page))

const pageRootThemeTokens = computed<Record<string, string>>(() => {
  return {
    background: normalizeString(props.themeTokens?.background) || '#ffffff',
    surface: normalizeString(props.themeTokens?.surface) || '#ffffff',
    accent: normalizeString(props.themeTokens?.accent) || '#38bdf8',
    text: normalizeString(props.themeTokens?.text) || '#0f172a',
    muted: normalizeString(props.themeTokens?.muted) || '#94a3b8',
  }
})

const pageRootElementPreviewItems = computed<PageRootElementPreviewItem[]>(() => {
  return previewPageRootElements.value
    .filter(element => !element.hidden)
    .map((element, index) => {
      const rect = resolveDesignElementAbsoluteRect(element)
      return {
        key: normalizeString(element.id) || `page-root-${index + 1}`,
        element,
        rect: {
          x: rect.x,
          y: rect.y,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        },
      }
    })
    .sort((left, right) => Number(left.element.zIndex || 0) - Number(right.element.zIndex || 0))
})

const pageRootElementHitItems = computed<ElementHitItem[]>(() => {
  return pageRootElementPreviewItems.value.map((item) => {
    return {
      element: item.element,
      displayFrame: null,
      ownerFrame: null,
      displayFrameId: '',
      ownerFrameId: '',
      rect: {
        x: item.rect.x,
        y: item.rect.y,
        width: item.rect.width,
        height: item.rect.height,
      },
    }
  })
})

const globalFrameElementHitItems = computed<ElementHitItem[]>(() => {
  if (normalizeString(props.selectionState.editingFrameId))
    return []

  return normalizedFrames.value.flatMap((displayFrame) => {
    const ownerFrame = props.frameOwnerFrames[displayFrame.id] || displayFrame
    if (!canDesignFrameContainElements(ownerFrame))
      return []
    return resolveFrameElementHitItems(displayFrame, ownerFrame)
  })
})

function isRectFullyInsideFrame(
  rect: { x: number, y: number, width: number, height: number },
  frame: DesignFrameModel,
): boolean {
  return rect.x >= frame.x
    && rect.y >= frame.y
    && rect.x + rect.width <= frame.x + Math.max(1, frame.width)
    && rect.y + rect.height <= frame.y + Math.max(1, frame.height)
}

function resolveAutoAttachFrameForWorldRect(
  rect: { x: number, y: number, width: number, height: number },
  preferredFrameId = '',
): DesignFrameModel | null {
  const normalizedPreferredFrameId = normalizeString(preferredFrameId)
  if (normalizedPreferredFrameId) {
    const preferredFrame = normalizedFrames.value.find(frame => frame.id === normalizedPreferredFrameId) || null
    if (preferredFrame && canDesignFrameContainElements(preferredFrame) && isRectFullyInsideFrame(rect, preferredFrame))
      return preferredFrame
  }

  for (let index = normalizedFrames.value.length - 1; index >= 0; index -= 1) {
    const frame = normalizedFrames.value[index]
    if (!frame || !canDesignFrameContainElements(frame))
      continue
    if (normalizedPreferredFrameId && frame.id === normalizedPreferredFrameId)
      continue
    if (isRectFullyInsideFrame(rect, frame))
      return frame
  }

  return null
}

const overflowFrameElementHitItems = computed<ElementHitItem[]>(() => {
  if (normalizeString(props.selectionState.editingFrameId))
    return []

  const items = normalizedFrames.value.flatMap((displayFrame) => {
    const ownerFrame = props.frameOwnerFrames[displayFrame.id] || displayFrame
    if (!canDesignFrameContainElements(ownerFrame) || isDesignFrameClipContentEnabled(displayFrame))
      return []

    return resolveFrameElementHitItems(displayFrame, ownerFrame)
      .filter((item) => {
        return !item.element.hidden
          && !item.element.locked
          && !isRectFullyInsideFrame(item.rect, displayFrame)
      })
  })

  const interactiveElementIds = new Set(
    items
      .map(item => item.element)
      .filter((element) => {
        const parentId = normalizeString(element.parentId)
        return !parentId || !items.some(candidate => candidate.element.id === parentId)
      })
      .map(element => element.id),
  )

  return items
    .filter(item => interactiveElementIds.has(item.element.id))
    .sort((left, right) => Number(left.element.zIndex || 0) - Number(right.element.zIndex || 0))
})

const pageRenderBounds = computed<WorldBounds>(() => {
  const frameBounds = normalizedFrames.value.map((frame) => {
    return {
      x: frame.x,
      y: frame.y,
      width: Math.max(1, frame.width),
      height: Math.max(1, frame.height),
    }
  })
  const pageElementBounds = pageRootElementPreviewItems.value.map(item => item.rect)
  const contentBounds = [...frameBounds, ...pageElementBounds]

  if (contentBounds.length === 0) {
    return {
      x: -Math.round(EMPTY_STAGE_WIDTH * 0.18),
      y: -Math.round(EMPTY_STAGE_HEIGHT * 0.18),
      width: EMPTY_STAGE_WIDTH,
      height: EMPTY_STAGE_HEIGHT,
    }
  }

  const minX = Math.min(...contentBounds.map(item => item.x))
  const minY = Math.min(...contentBounds.map(item => item.y))
  const maxX = Math.max(...contentBounds.map(item => item.x + Math.max(1, item.width)))
  const maxY = Math.max(...contentBounds.map(item => item.y + Math.max(1, item.height)))
  const exportWidth = Math.max(1, maxX - minX)
  const exportHeight = Math.max(1, maxY - minY)

  return {
    x: Math.round(minX - EXPORT_PADDING),
    y: Math.round(minY - EXPORT_PADDING),
    width: Math.max(EMPTY_STAGE_WIDTH, Math.round(exportWidth + EXPORT_PADDING * 2)),
    height: Math.max(EMPTY_STAGE_HEIGHT, Math.round(exportHeight + EXPORT_PADDING * 2)),
  }
})

const stageContentBoundsStyle = computed<Record<string, string>>(() => {
  return {
    left: `${pageRenderBounds.value.x}px`,
    top: `${pageRenderBounds.value.y}px`,
    width: `${pageRenderBounds.value.width}px`,
    height: `${pageRenderBounds.value.height}px`,
  }
})

const framePreviewMarkupById = computed(() => {
  return new Map(
    normalizedFrames.value.map(frame => [frame.id, renderCompositionFramePreviewSvg(compositionModel.value, frame.id)] as const),
  )
})

const viewportLayerStyle = computed<Record<string, string>>(() => {
  return {
    transform: `translate(${viewport.value.x}px, ${viewport.value.y}px) scale(${viewport.value.zoom})`,
    transformOrigin: '0 0',
  }
})

const zoomPercent = computed(() => {
  const rawValue = Math.round(clampCanvasZoom(viewport.value.zoom) * 100)
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, rawValue))
})

const zoomDisplayText = computed(() => `${zoomPercent.value}%`)

const nextQuickZoomPreset = computed<number>(() => {
  const matchedPresetIndex = QUICK_ZOOM_PRESETS.findIndex(preset => preset === zoomPercent.value)
  if (matchedPresetIndex >= 0)
    return QUICK_ZOOM_PRESETS[(matchedPresetIndex + 1) % QUICK_ZOOM_PRESETS.length] ?? 100
  const nextHigherPreset = QUICK_ZOOM_PRESETS.find(preset => preset > zoomPercent.value)
  return nextHigherPreset ?? QUICK_ZOOM_PRESETS[0] ?? 100
})

const zoomRatio = computed(() => {
  return Math.min(
    1,
    Math.max(
      0,
      (zoomPercent.value - MIN_ZOOM_PERCENT) / (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT),
    ),
  )
})

const zoomRangeStyle = computed<Record<string, string>>(() => {
  const progress = Math.round(zoomRatio.value * 100)
  return {
    background: `linear-gradient(90deg, rgba(226,232,240,0.92) 0%, rgba(226,232,240,0.92) ${progress}%, rgba(248,250,252,1) ${progress}%, rgba(248,250,252,1) 100%)`,
  }
})

const zoomCollapsedIndicatorStyle = computed<Record<string, string>>(() => {
  const trackWidth = Math.max(0, zoomChromeMetrics.value.controlWidth - 2)
  const minimumWidth = zoomChromeMetrics.value.collapsedIndicatorWidth
  const rawWidth = Math.round(zoomRatio.value * trackWidth)
  const width = Math.min(trackWidth, Math.max(minimumWidth, rawWidth))
  return {
    width: `${width}px`,
  }
})

const zoomChromeMetrics = computed(() => {
  const controlWidth = zoomControlState.value === 'dormant'
    ? CANVAS_COLLAPSED_CONTROL_WIDTH
    : zoomControlState.value === 'resting'
      ? CANVAS_RESTING_CONTROL_WIDTH
      : CANVAS_CONTROL_WIDTH
  const controlHeight = zoomControlState.value === 'dormant'
    ? CANVAS_COLLAPSED_CONTROL_HEIGHT
    : zoomControlState.value === 'resting'
      ? CANVAS_RESTING_CONTROL_HEIGHT
      : CANVAS_EXPANDED_CONTROL_HEIGHT
  const controlHitHeight = zoomControlState.value === 'dormant'
    ? CANVAS_COLLAPSED_CONTROL_HIT_HEIGHT
    : zoomControlState.value === 'resting'
      ? CANVAS_RESTING_CONTROL_HIT_HEIGHT
      : CANVAS_EXPANDED_CONTROL_HEIGHT
  const controlGap = zoomControlState.value === 'dormant'
    ? CANVAS_COLLAPSED_CONTROL_GAP
    : zoomControlState.value === 'resting'
      ? CANVAS_RESTING_CONTROL_GAP
      : CANVAS_EXPANDED_CONTROL_GAP
  const minimapHeight = zoomControlState.value === 'dormant'
    ? CANVAS_COLLAPSED_MINIMAP_HEIGHT
    : zoomControlState.value === 'resting'
      ? CANVAS_RESTING_MINIMAP_HEIGHT
      : CANVAS_MINIMAP_HEIGHT
  const collapsedTrackHeight = zoomControlState.value === 'dormant'
    ? 3
    : zoomControlState.value === 'resting'
      ? 4
      : 8
  const collapsedIndicatorWidth = zoomControlState.value === 'dormant'
    ? 8
    : zoomControlState.value === 'resting'
      ? 12
      : 14
  const collapsedIndicatorHeight = zoomControlState.value === 'dormant'
    ? 6
    : zoomControlState.value === 'resting'
      ? 8
      : 12

  return {
    controlWidth,
    controlHeight,
    controlHitHeight,
    controlGap,
    minimapHeight,
    collapsedTrackHeight,
    collapsedIndicatorWidth,
    collapsedIndicatorHeight,
  }
})

const canvasChromeStyle = computed<Record<string, string>>(() => {
  return {
    '--workspace-design-control-width': `${zoomChromeMetrics.value.controlWidth}px`,
    '--workspace-design-control-height': `${zoomChromeMetrics.value.controlHeight}px`,
    '--workspace-design-control-hit-height': `${zoomChromeMetrics.value.controlHitHeight}px`,
    '--workspace-design-control-gap': `${zoomChromeMetrics.value.controlGap}px`,
    '--workspace-design-minimap-height': `${zoomChromeMetrics.value.minimapHeight}px`,
    '--workspace-design-control-radius': zoomControlState.value === 'dormant'
      ? '3px'
      : zoomControlState.value === 'resting'
        ? '4px'
        : '14px',
    '--workspace-design-collapsed-track-height': `${zoomChromeMetrics.value.collapsedTrackHeight}px`,
    '--workspace-design-collapsed-track-radius': zoomControlState.value === 'dormant'
      ? '1px'
      : zoomControlState.value === 'resting'
        ? '1px'
        : '2px',
    '--workspace-design-collapsed-indicator-width': `${zoomChromeMetrics.value.collapsedIndicatorWidth}px`,
    '--workspace-design-collapsed-indicator-height': `${zoomChromeMetrics.value.collapsedIndicatorHeight}px`,
    '--workspace-design-collapsed-indicator-radius': zoomControlState.value === 'dormant'
      ? '1px'
      : zoomControlState.value === 'resting'
        ? '1px'
        : '2px',
    '--workspace-design-minimap-radius': zoomControlState.value === 'dormant'
      ? '7px'
      : zoomControlState.value === 'resting'
        ? '8px'
        : '14px',
  }
})

const visibleWorldBounds = computed<WorldBounds>(() => {
  const zoom = clampCanvasZoom(viewport.value.zoom)
  const width = rootClientSize.value.width > 0
    ? rootClientSize.value.width / zoom
    : pageRenderBounds.value.width
  const height = rootClientSize.value.height > 0
    ? rootClientSize.value.height / zoom
    : pageRenderBounds.value.height

  return {
    x: roundMetric(-viewport.value.x / zoom),
    y: roundMetric(-viewport.value.y / zoom),
    width: roundMetric(Math.max(1, width)),
    height: roundMetric(Math.max(1, height)),
  }
})

const minimapWorldBounds = computed<WorldBounds>(() => {
  const bounds = [pageRenderBounds.value, visibleWorldBounds.value]
  const minX = Math.min(...bounds.map(bound => bound.x))
  const minY = Math.min(...bounds.map(bound => bound.y))
  const maxX = Math.max(...bounds.map(bound => bound.x + bound.width))
  const maxY = Math.max(...bounds.map(bound => bound.y + bound.height))
  return {
    x: minX - MINIMAP_WORLD_PADDING,
    y: minY - MINIMAP_WORLD_PADDING,
    width: Math.max(1, maxX - minX + MINIMAP_WORLD_PADDING * 2),
    height: Math.max(1, maxY - minY + MINIMAP_WORLD_PADDING * 2),
  }
})

const minimapMetrics = computed<MinimapMetrics>(() => {
  const worldBounds = minimapWorldBounds.value
  const minimapWidth = zoomChromeMetrics.value.controlWidth
  const minimapHeight = zoomChromeMetrics.value.minimapHeight
  const availableWidth = Math.max(1, minimapWidth - MINIMAP_PADDING * 2)
  const availableHeight = Math.max(1, minimapHeight - MINIMAP_PADDING * 2)
  const scale = Math.min(availableWidth / worldBounds.width, availableHeight / worldBounds.height)
  const contentWidth = worldBounds.width * scale
  const contentHeight = worldBounds.height * scale
  return {
    scale,
    contentX: (minimapWidth - contentWidth) / 2,
    contentY: (minimapHeight - contentHeight) / 2,
    contentWidth,
    contentHeight,
  }
})

const minimapPageStyle = computed<Record<string, string>>(() => {
  return resolveMinimapRectStyle(pageRenderBounds.value)
})

const minimapViewportStyle = computed<Record<string, string>>(() => {
  return resolveMinimapRectStyle(visibleWorldBounds.value)
})

const minimapFrameItems = computed<MinimapFrameItem[]>(() => {
  return normalizedFrames.value.map((frame) => {
    const state: MinimapFrameItem['state'] = props.selectionState.frameIds.includes(frame.id)
      ? 'selected'
      : normalizeString(props.selectionState.editingFrameId) === frame.id || normalizeString(props.selectionState.displayFrameId) === frame.id
        ? 'editing'
        : 'default'

    return {
      id: frame.id,
      label: frame.name || frame.id,
      style: resolveMinimapRectStyle({
        x: frame.x,
        y: frame.y,
        width: Math.max(1, frame.width),
        height: Math.max(1, frame.height),
      }),
      state,
    }
  })
})

const frameSelectionEnabled = computed(() => {
  return !props.disabled
    && props.interactionContext.effectiveTool === 'select'
    && props.selectionState.scope !== 'element'
    && !normalizeString(props.selectionState.editingFrameId)
    && !normalizeString(props.mockupScreenEditingFrameId)
})

const elementSelectionEnabled = computed(() => {
  return !props.disabled
    && props.interactionContext.effectiveTool === 'select'
    && !normalizeString(props.mockupScreenEditingFrameId)
    && (
      Boolean(normalizeString(props.selectionState.editingFrameId))
      || pageRootElementHitItems.value.length > 0
      || globalFrameElementHitItems.value.length > 0
    )
})

const currentEditingDisplayFrameId = computed(() => {
  return normalizeString(props.selectionState.displayFrameId)
    || normalizeString(props.selectionState.editingFrameId)
})

const currentEditingDisplayFrame = computed(() => {
  const frameId = currentEditingDisplayFrameId.value
  if (!frameId)
    return null
  return normalizedFrames.value.find(frame => frame.id === frameId) || null
})

const currentEditingOwnerFrame = computed(() => {
  const displayFrameId = currentEditingDisplayFrameId.value
  const ownerFrameId = normalizeString(props.selectionState.editingFrameId)
  if (displayFrameId && props.frameOwnerFrames[displayFrameId]) {
    return mergeFramePreviewPatch(
      props.frameOwnerFrames[displayFrameId]!,
      transientFramePatches.value[normalizeString(props.frameOwnerFrames[displayFrameId]?.id)],
    ) || null
  }
  if (ownerFrameId) {
    const visibleOwnerFrame = normalizedFrames.value.find(frame => frame.id === ownerFrameId)
    if (visibleOwnerFrame)
      return visibleOwnerFrame
    const rawOwnerFrame = props.frameOwnerFrames[ownerFrameId]
    return rawOwnerFrame
      ? mergeFramePreviewPatch(
          rawOwnerFrame,
          transientFramePatches.value[ownerFrameId],
        )
      : null
  }
  return currentEditingDisplayFrame.value
})

const activeMockupScreenEditingLayout = computed(() => {
  const displayFrameId = normalizeString(props.mockupScreenEditingFrameId)
  if (!displayFrameId)
    return null

  const displayFrame = normalizedFrames.value.find(frame => frame.id === displayFrameId) || null
  const rawOwnerFrame = props.frameOwnerFrames[displayFrameId] || displayFrame
  const ownerFrame = rawOwnerFrame
    ? mergeFramePreviewPatch(
        rawOwnerFrame,
        transientFramePatches.value[normalizeString(rawOwnerFrame.id)],
      )
    : null
  if (!displayFrame || !ownerFrame || displayFrame.kind !== 'device_mockup')
    return null

  const layout = resolveDesignFrameProjectionLayoutForFrames(
    displayFrame,
    ownerFrame,
    {
      assets: props.assets,
      outerRect: {
        x: displayFrame.x,
        y: displayFrame.y,
        width: displayFrame.width,
        height: displayFrame.height,
      },
    },
  )
  if (!layout?.surfaceLayout)
    return null

  return {
    displayFrame,
    ownerFrame,
    screenRect: layout.surfaceLayout.screenRect,
  }
})

const pendingImagePlacementState = computed<PendingImagePlacement | null>(() => {
  const source = props.pendingImagePlacement
  if (!source?.src)
    return null
  return {
    src: source.src,
    name: normalizeString(source.name) || '图片',
    intrinsicWidth: Math.max(1, Math.round(Number(source.intrinsicWidth || 1))),
    intrinsicHeight: Math.max(1, Math.round(Number(source.intrinsicHeight || 1))),
    assetId: normalizeString(source.assetId) || undefined,
    mimeType: normalizeString(source.mimeType) || undefined,
  }
})

const allEditingElementHitItems = computed<ElementHitItem[]>(() => {
  const displayFrame = currentEditingDisplayFrame.value
  const ownerFrame = currentEditingOwnerFrame.value
  const elementItems = displayFrame && ownerFrame
    ? resolveFrameElementHitItems(displayFrame, ownerFrame)
    : [...pageRootElementHitItems.value, ...globalFrameElementHitItems.value]

  return elementItems
    .filter(item => !item.element.hidden && !item.element.locked)
    .sort((left, right) => {
      const leftFrameIndex = left.displayFrameId
        ? normalizedFrames.value.findIndex(frame => frame.id === left.displayFrameId)
        : Number.MAX_SAFE_INTEGER
      const rightFrameIndex = right.displayFrameId
        ? normalizedFrames.value.findIndex(frame => frame.id === right.displayFrameId)
        : Number.MAX_SAFE_INTEGER
      if (leftFrameIndex !== rightFrameIndex)
        return leftFrameIndex - rightFrameIndex
      return Number(left.element.zIndex || 0) - Number(right.element.zIndex || 0)
    })
})

const editingElementHitItems = computed<ElementHitItem[]>(() => {
  const groupId = normalizeString(groupEditSession.value?.groupId)
  if (!groupId) {
    const interactiveElementIds = new Set(
      allEditingElementHitItems.value
        .map(item => item.element)
        .filter((element) => {
          const parentId = normalizeString(element.parentId)
          return !parentId || !allEditingElementHitItems.value.some(candidate => candidate.element.id === parentId)
        })
        .map(element => element.id),
    )
    return allEditingElementHitItems.value.filter(item => interactiveElementIds.has(item.element.id))
  }

  return allEditingElementHitItems.value.filter((item) => {
    return normalizeString(item.element.parentId) === groupId
  })
})

const primaryEditingElementHitItem = computed<ElementHitItem | null>(() => {
  const primaryElementId = normalizeString(props.selectionState.primaryElementId)
  if (!primaryElementId)
    return null
  return editingElementHitItems.value.find(item => item.element.id === primaryElementId) || null
})

const currentEditingOwnerFrameAutoLayout = computed(() => {
  return resolveFrameUsesAutoLayout(currentEditingOwnerFrame.value)
})

const elementDragEnabled = computed(() => {
  return elementSelectionEnabled.value
    && !currentEditingOwnerFrame.value?.locked
    && !currentEditingOwnerFrameAutoLayout.value
    && !textEditSession.value
    && !pendingImagePlacementState.value
})

const elementResizeEnabled = computed(() => {
  return elementDragEnabled.value
    && !createElementEnabled.value
    && props.selectionState.elementIds.length === 1
    && Boolean(primaryEditingElementHitItem.value)
    && primaryEditingElementHitItem.value?.element.type !== 'path'
    && primaryEditingElementHitItem.value?.element.type !== 'group'
})

const activeCreateElementTool = computed<CreateElementTool | null>(() => {
  if (props.disabled || props.interactionContext.effectiveTool === 'hand')
    return null
  if (props.activeTool === 'pencil' || props.activeTool === 'rectangle' || props.activeTool === 'ellipse' || props.activeTool === 'arrow' || props.activeTool === 'text')
    return props.activeTool
  return null
})

const createElementEnabled = computed(() => {
  return Boolean(
    activeCreateElementTool.value
    && normalizeString(props.selectionState.editingFrameId)
    && currentEditingOwnerFrame.value
    && currentEditingDisplayFrame.value
    && !currentEditingOwnerFrame.value.locked
    && !currentEditingOwnerFrameAutoLayout.value
    && !normalizeString(props.mockupScreenEditingFrameId)
    && canDesignFrameCreateElements(currentEditingOwnerFrame.value),
  )
})

const selectionDraftRectStyle = computed<Record<string, string> | null>(() => {
  const draft = selectionDraft.value
  const rect = rootRef.value?.getBoundingClientRect()
  if (!draft || !draft.selecting || !rect)
    return null

  const left = Math.min(draft.startClientX, draft.currentClientX) - rect.left
  const top = Math.min(draft.startClientY, draft.currentClientY) - rect.top
  const width = Math.max(1, Math.abs(draft.currentClientX - draft.startClientX))
  const height = Math.max(1, Math.abs(draft.currentClientY - draft.startClientY))
  return {
    left: `${roundMetric(left)}px`,
    top: `${roundMetric(top)}px`,
    width: `${roundMetric(width)}px`,
    height: `${roundMetric(height)}px`,
    borderRadius: '16px',
  }
})

const elementGuideOverlayChipStyle = computed<Record<string, string> | null>(() => {
  const overlay = elementGuideOverlay.value
  const frame = currentEditingDisplayFrame.value
  if (!overlay || !frame)
    return null
  return {
    left: `${roundMetric(frame.x + overlay.x)}px`,
    top: `${roundMetric(frame.y + overlay.y - 36)}px`,
  }
})

const elementGuideVerticalStyle = computed<Record<string, string> | null>(() => {
  const overlay = elementGuideOverlay.value
  const frame = currentEditingDisplayFrame.value
  if (!overlay || !frame || overlay.verticalGuideX === undefined)
    return null
  return {
    left: `${roundMetric(overlay.verticalGuideX)}px`,
    top: `${roundMetric(frame.y)}px`,
    height: `${roundMetric(frame.height)}px`,
  }
})

const elementGuideHorizontalStyle = computed<Record<string, string> | null>(() => {
  const overlay = elementGuideOverlay.value
  const frame = currentEditingDisplayFrame.value
  if (!overlay || !frame || overlay.horizontalGuideY === undefined)
    return null
  return {
    left: `${roundMetric(frame.x)}px`,
    top: `${roundMetric(overlay.horizontalGuideY)}px`,
    width: `${roundMetric(frame.width)}px`,
  }
})

const autoLayoutInsertionIndicatorStyle = computed<Record<string, string> | null>(() => {
  const indicator = autoLayoutReorderSession.value?.indicator
  if (!indicator)
    return null
  return {
    left: `${roundMetric(indicator.left)}px`,
    top: `${roundMetric(indicator.top)}px`,
    width: `${roundMetric(indicator.width)}px`,
    height: `${roundMetric(indicator.height)}px`,
  }
})

const textEditTargetItem = computed<ElementHitItem | null>(() => {
  const elementId = normalizeString(textEditSession.value?.elementId)
  if (!elementId)
    return null
  return allEditingElementHitItems.value.find(item => item.element.id === elementId) || null
})

const textEditStyle = computed<Record<string, string> | null>(() => {
  const session = textEditSession.value
  const item = textEditTargetItem.value
  if (!session || !item)
    return null

  const rect = resolveElementScreenRect(item)
  const fontSize = Math.max(12, Number(item.element.style?.fontSize || 28) * viewport.value.zoom)
  const lineHeight = Math.round(fontSize * 1.35)
  return {
    left: `${roundMetric(rect.left)}px`,
    top: `${roundMetric(rect.top)}px`,
    width: `${roundMetric(Math.max(TEXT_EDITOR_MIN_WIDTH * viewport.value.zoom, rect.width))}px`,
    height: `${roundMetric(Math.max(TEXT_EDITOR_MIN_HEIGHT * viewport.value.zoom, rect.height))}px`,
    fontSize: `${roundMetric(fontSize)}px`,
    lineHeight: `${lineHeight}px`,
    fontWeight: `${Math.max(400, Number(item.element.style?.fontWeight || 500))}`,
    color: resolveThemeColor(item.element.style?.color, '#0f172a'),
    textAlign: normalizeString(item.element.style?.textAlign).toLowerCase() || 'left',
    borderRadius: `${Math.max(12, Number(item.element.style?.borderRadius || (item.element.type === 'badge' ? 18 : 14)) * viewport.value.zoom)}px`,
  }
})

const elementTransformTarget = computed(() => {
  if (
    !elementDragEnabled.value
    || createElementEnabled.value
    || textEditSession.value
    || props.selectionState.elementIds.length !== 1
    || !primaryEditingElementHitItem.value
    || primaryEditingElementHitItem.value.element.type === 'path'
    || primaryEditingElementHitItem.value.element.type === 'group'
  ) {
    return null
  }

  const item = primaryEditingElementHitItem.value
  return {
    item,
    geometry: resolveElementWorldGeometry(item),
  }
})

const elementTransformBoxStyle = computed<Record<string, string> | null>(() => {
  const target = elementTransformTarget.value
  if (!target)
    return null

  return {
    left: `${roundMetric(target.geometry.x)}px`,
    top: `${roundMetric(target.geometry.y)}px`,
    width: `${roundMetric(target.geometry.width)}px`,
    height: `${roundMetric(target.geometry.height)}px`,
    transform: target.geometry.rotation ? `rotate(${target.geometry.rotation}deg)` : 'none',
    transformOrigin: 'center center',
    zIndex: String(120 + Math.max(0, Math.round(Number(target.item.element.zIndex) || 0))),
  }
})

const rotateHandleStyle = computed<Record<string, string> | null>(() => {
  if (!elementTransformTarget.value)
    return null
  return {
    top: `-${ROTATE_HANDLE_OFFSET}px`,
    left: '50%',
    transform: 'translateX(-50%)',
  }
})

const activeMockupScreenRectStyle = computed<Record<string, string> | null>(() => {
  const layout = activeMockupScreenEditingLayout.value
  if (!layout)
    return null
  return {
    left: `${roundMetric(layout.screenRect.x)}px`,
    top: `${roundMetric(layout.screenRect.y)}px`,
    width: `${roundMetric(Math.max(1, layout.screenRect.width))}px`,
    height: `${roundMetric(Math.max(1, layout.screenRect.height))}px`,
  }
})

const visibleFrameGrids = computed(() => {
  const visibleBounds = visibleWorldBounds.value
  return normalizedFrames.value
    .map((frame) => {
      const grid = resolveDesignFrameGridMetadata(frame.metadata?.grid)
      if (!grid.visible || frame.kind === 'diagram')
        return null

      const frameBox = resolveFramePreviewBox(frame)
      const frameRight = frameBox.x + frameBox.width
      const frameBottom = frameBox.y + frameBox.height
      const visibleRight = visibleBounds.x + visibleBounds.width
      const visibleBottom = visibleBounds.y + visibleBounds.height
      if (
        frameRight < visibleBounds.x
        || frameBottom < visibleBounds.y
        || frameBox.x > visibleRight
        || frameBox.y > visibleBottom
      ) {
        return null
      }

      const contentWidth = Math.max(0, frameBox.width - grid.margin * 2)
      const contentHeight = Math.max(0, frameBox.height - grid.margin * 2)
      const columnWidth = Math.max(0, (contentWidth - grid.gutter * Math.max(0, grid.columns - 1)) / grid.columns)
      const rowHeight = Math.max(0, (contentHeight - grid.gutter * Math.max(0, grid.rows - 1)) / grid.rows)
      const columnGuides = Array.from({ length: grid.columns + 1 }, (_, index) => {
        if (index === 0)
          return frameBox.x + grid.margin
        if (index === grid.columns)
          return frameBox.x + frameBox.width - grid.margin
        return frameBox.x + grid.margin + index * columnWidth + (index - 1) * grid.gutter
      })
      const rowGuides = Array.from({ length: grid.rows + 1 }, (_, index) => {
        if (index === 0)
          return frameBox.y + grid.margin
        if (index === grid.rows)
          return frameBox.y + frameBox.height - grid.margin
        return frameBox.y + grid.margin + index * rowHeight + (index - 1) * grid.gutter
      })
      return {
        frame,
        frameBox,
        columnGuides,
        rowGuides,
      }
    })
    .filter((value): value is {
      frame: DesignFrameModel
      frameBox: { x: number, y: number, width: number, height: number }
      columnGuides: number[]
      rowGuides: number[]
    } => Boolean(value))
})

const frameResizeTarget = computed(() => {
  if (
    props.disabled
    || props.interactionContext.effectiveTool !== 'select'
    || props.selectionState.scope !== 'frame'
    || props.selectionState.frameIds.length !== 1
    || Boolean(normalizeString(props.selectionState.editingFrameId))
    || Boolean(props.mockupScreenEditingFrameId)
    || Boolean(activeCreateElementTool.value)
    || Boolean(textEditSession.value)
    || Boolean(frameDragSession.value)
  ) {
    return null
  }

  const frame = normalizedFrames.value.find(item => item.id === normalizeString(props.selectionState.primaryFrameId))
    || normalizedFrames.value.find(item => props.selectionState.frameIds.includes(item.id))
    || null
  if (!frame)
    return null
  if (frame.locked)
    return null

  return {
    frame,
    box: resolveFramePreviewBox(frame),
  }
})

const frameResizeOutlineStyle = computed<Record<string, string> | null>(() => {
  const target = frameResizeTarget.value
  if (!target)
    return null

  return resolveFrameResizeHandleStyle(target.box)
})

const createElementPreviewRectStyle = computed<Record<string, string> | null>(() => {
  const session = createElementSession.value
  if (!session || session.tool === 'pencil' || session.tool === 'arrow')
    return null

  const minX = Math.min(session.startX, session.currentX)
  const minY = Math.min(session.startY, session.currentY)
  const width = Math.max(1, Math.abs(session.currentX - session.startX))
  const height = Math.max(1, Math.abs(session.currentY - session.startY))

  return {
    left: `${roundMetric(session.displayFrameX + minX)}px`,
    top: `${roundMetric(session.displayFrameY + minY)}px`,
    width: `${roundMetric(width)}px`,
    height: `${roundMetric(height)}px`,
    borderRadius: session.tool === 'ellipse' ? '999px' : '16px',
  }
})

const createElementPreviewArrow = computed(() => {
  const session = createElementSession.value
  if (!session || session.tool !== 'arrow')
    return null

  const minX = Math.min(session.startX, session.currentX)
  const minY = Math.min(session.startY, session.currentY)
  const width = Math.max(12, Math.abs(session.currentX - session.startX))
  const height = Math.max(12, Math.abs(session.currentY - session.startY))
  const startX = session.startX - minX
  const startY = session.startY - minY
  const endX = session.currentX - minX
  const endY = session.currentY - minY
  const angle = Math.atan2(endY - startY, endX - startX)
  const arrowSize = Math.max(12, Math.min(28, Math.max(width, height) * 0.18))
  const leftX = endX - Math.cos(angle - Math.PI / 6) * arrowSize
  const leftY = endY - Math.sin(angle - Math.PI / 6) * arrowSize
  const rightX = endX - Math.cos(angle + Math.PI / 6) * arrowSize
  const rightY = endY - Math.sin(angle + Math.PI / 6) * arrowSize

  return {
    style: {
      left: `${roundMetric(session.displayFrameX + minX)}px`,
      top: `${roundMetric(session.displayFrameY + minY)}px`,
      width: `${roundMetric(width)}px`,
      height: `${roundMetric(height)}px`,
    },
    line: {
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
    },
    head: `${leftX},${leftY} ${endX},${endY} ${rightX},${rightY}`,
  }
})

const createElementPreviewPath = computed(() => {
  const session = createElementSession.value
  if (!session?.points?.length || session.tool !== 'pencil')
    return null

  const xs = session.points.map(point => point.x)
  const ys = session.points.map(point => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const padding = 6
  const width = Math.max(12, maxX - minX + padding * 2)
  const height = Math.max(12, maxY - minY + padding * 2)

  return {
    style: {
      left: `${roundMetric(session.displayFrameX + minX - padding)}px`,
      top: `${roundMetric(session.displayFrameY + minY - padding)}px`,
      width: `${roundMetric(width)}px`,
      height: `${roundMetric(height)}px`,
    },
    points: session.points
      .map(point => `${roundMetric(point.x - minX + padding)},${roundMetric(point.y - minY + padding)}`)
      .join(' '),
  }
})

const stageCursorClass = computed(() => {
  if (frameResizeSession.value)
    return 'cursor-default'
  if (frameDragSession.value)
    return 'cursor-grabbing'
  if (mockupScreenDragSession.value)
    return 'cursor-grabbing'
  if (activeMockupScreenEditingLayout.value)
    return 'cursor-grab'
  if (elementRotationSession.value)
    return 'cursor-grabbing'
  if (elementDragSession.value)
    return 'cursor-grabbing'
  if (activeCreateElementTool.value || pendingImagePlacementState.value)
    return 'cursor-crosshair'
  if (props.interactionContext.effectiveTool === 'hand')
    return panSession.value ? 'cursor-grabbing' : 'cursor-grab'
  return 'cursor-default'
})

const remoteScreenCursors = computed<RemoteScreenCursor[]>(() => {
  const cursors = props.remoteCursors.flatMap((cursor) => {
    const screenX = Number(cursor.cursorX) * viewport.value.zoom + viewport.value.x
    const screenY = Number(cursor.cursorY) * viewport.value.zoom + viewport.value.y
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY))
      return []

    return [{
      userId: cursor.userId,
      username: cursor.username,
      colorToken: cursor.colorToken,
      screenX,
      screenY,
      label: cursor.username,
    }]
  })

  return cursors.map((cursor, index) => {
    const cursorPoint = { x: cursor.screenX, y: cursor.screenY }
    const isNearLocalPointer = Boolean(
      localPointerScreen.value && isScreenPointNear(cursorPoint, localPointerScreen.value),
    )
    const isNearAnotherCursor = cursors.some((candidate, candidateIndex) => {
      if (candidateIndex === index)
        return false
      return isScreenPointNear(cursorPoint, {
        x: candidate.screenX,
        y: candidate.screenY,
      })
    })

    return {
      ...cursor,
      label: isNearLocalPointer || isNearAnotherCursor
        ? resolveWorkspaceCollabPresenceInitial(cursor.username)
        : cursor.username,
    }
  })
})

watch(
  () => [props.viewportX, props.viewportY, props.viewportZoom] as const,
  ([x, y, zoom]) => {
    if (panSession.value)
      return
    viewport.value = {
      x: Number(x || 0),
      y: Number(y || 0),
      zoom: clampCanvasZoom(zoom),
    }
  },
  { immediate: true },
)

watch(createElementEnabled, (enabled) => {
  if (!enabled && createElementSession.value) {
    stopCreateElementSession(createElementSession.value.pointerId)
    suppressBackgroundClick.value = false
  }
})

watch(
  () => pendingImagePlacementState.value?.src || '',
  (nextSrc) => {
    if (nextSrc)
      return
    if (createElementSession.value?.tool === 'image')
      stopCreateElementSession(createElementSession.value.pointerId)
  },
)

watch(frameSelectionEnabled, (enabled) => {
  if (enabled)
    return
  stopFrameDrag()
  stopFrameResize()
  clearFrameDragFeedback()
  suppressFrameClick = false
})

watch(
  () => textEditSession.value?.elementId || '',
  async (elementId) => {
    if (!elementId)
      return
    await nextTick()
    const textarea = textEditorRef.value
    if (!textarea)
      return
    textarea.focus()
    if (textEditSession.value?.selectAllOnOpen)
      textarea.select()
    else
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  },
)

watch(
  () => [pendingCreatedTextEdit.value, props.selectionState.primaryElementId, props.selectionState.scope] as const,
  () => {
    const pending = pendingCreatedTextEdit.value
    const item = primaryEditingElementHitItem.value
    if (!pending || props.selectionState.scope !== 'element' || !item)
      return
    if (item.element.type !== 'text' || item.ownerFrameId !== pending.ownerFrameId || item.displayFrameId !== pending.displayFrameId)
      return
    pendingCreatedTextEdit.value = null
    openTextEditSession(item, {
      selectAllOnOpen: pending.selectAllOnOpen,
    })
  },
)

watch(
  () => textEditTargetItem.value,
  (item) => {
    if (!textEditSession.value)
      return
    if (!item)
      textEditSession.value = null
  },
)

watch(
  () => groupEditSession.value?.groupId || '',
  (groupId) => {
    if (!groupId)
      return
    const exists = allEditingElementHitItems.value.some(item => item.element.id === groupId)
    if (!exists)
      groupEditSession.value = null
  },
)

watch(
  () => props.mockupScreenEditingFrameId,
  () => {
    if (!normalizeString(props.mockupScreenEditingFrameId)) {
      stopMockupScreenDragSession()
      return
    }
    stopFrameDrag()
    stopFrameResize()
    clearFrameDragFeedback()
    stopElementDrag()
    stopElementResize()
    stopElementRotation()
    stopCreateElementSession()
    stopAutoLayoutReorderSession()
    stopSelectionDraft()
    closeTextEditSession({ commit: true })
    closeGroupEditSession()
    clearElementGuideOverlay()
  },
)

onMounted(() => {
  updateRootClientSize()
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })
  if (typeof ResizeObserver === 'undefined' || !rootRef.value)
    return

  rootResizeObserver = new ResizeObserver(() => {
    updateRootClientSize()
  })
  rootResizeObserver.observe(rootRef.value)
})

onBeforeUnmount(() => {
  rootResizeObserver?.disconnect()
  rootResizeObserver = null
  activeMinimapPointerId = null
  clearZoomControlTimers()
  stopFrameDrag()
  stopFrameResize()
  clearFrameDragFeedback()
  stopMockupScreenDragSession()
  stopSelectionDraft()
  stopCreateElementSession()
  stopAutoLayoutReorderSession()
  stopElementRotation()
  stopElementDrag()
  stopElementResize()
  closeTextEditSession({ commit: false })
  closeGroupEditSession()
  clearElementGuideOverlay()
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function clampCanvasZoom(value: unknown): number {
  const zoom = Number(value)
  if (!Number.isFinite(zoom))
    return 1
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom))
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function roundMetric(value: number): number {
  return Number(value.toFixed(2))
}

function normalizeRotation(value: number): number {
  const normalized = Math.round(Number.isFinite(value) ? value : 0)
  const wrapped = normalized % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function resolveThemeColor(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return fallback
  return normalizeString(props.themeTokens[normalized]) || normalized || fallback
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  if (target.isContentEditable)
    return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function isScreenPointNear(source: { x: number, y: number }, target: { x: number, y: number }): boolean {
  return Math.hypot(source.x - target.x, source.y - target.y) <= CURSOR_LABEL_COLLAPSE_DISTANCE
}

function focusCanvas(): void {
  rootRef.value?.focus()
}

function updateRootClientSize(): void {
  const rect = rootRef.value?.getBoundingClientRect()
  rootClientSize.value = {
    width: rect ? Math.max(0, rect.width) : 0,
    height: rect ? Math.max(0, rect.height) : 0,
  }
}

function clearZoomControlTimers(): void {
  if (zoomControlRestingTimer) {
    clearTimeout(zoomControlRestingTimer)
    zoomControlRestingTimer = null
  }
  if (zoomControlDormantTimer) {
    clearTimeout(zoomControlDormantTimer)
    zoomControlDormantTimer = null
  }
}

function revealZoomControl(options?: {
  collapseAfterIdle?: boolean
  delay?: number
  deepDelay?: number
  ignoreHover?: boolean
}): void {
  zoomControlState.value = 'expanded'
  clearZoomControlTimers()
  if (!options?.collapseAfterIdle)
    return

  zoomControlRestingTimer = setTimeout(() => {
    if (zoomControlHovering.value && !options.ignoreHover)
      return
    zoomControlState.value = 'resting'
    zoomControlRestingTimer = null
  }, options.delay ?? ZOOM_CONTROL_COLLAPSE_DELAY)

  zoomControlDormantTimer = setTimeout(() => {
    if (zoomControlHovering.value && !options.ignoreHover)
      return
    zoomControlState.value = 'dormant'
    zoomControlDormantTimer = null
  }, options.deepDelay ?? ZOOM_CONTROL_DEEP_COLLAPSE_DELAY)
}

function handleZoomControlPointerEnter(): void {
  zoomControlHovering.value = true
  revealZoomControl()
}

function handleZoomControlPointerMove(): void {
  if (zoomControlState.value === 'expanded')
    return
  zoomControlHovering.value = true
  revealZoomControl({ collapseAfterIdle: true })
}

function handleZoomControlPointerLeave(): void {
  zoomControlHovering.value = false
  revealZoomControl({
    collapseAfterIdle: true,
    delay: 260,
    deepDelay: ZOOM_CONTROL_DEEP_COLLAPSE_DELAY,
  })
}

function handleZoomControlFocusIn(): void {
  revealZoomControl()
}

function handleZoomControlShellClick(): void {
  if (zoomControlState.value === 'expanded')
    return
  zoomControlHovering.value = true
  revealZoomControl({ collapseAfterIdle: true })
}

function handleZoomControlFocusOut(event: FocusEvent): void {
  const currentTarget = event.currentTarget
  const relatedTarget = event.relatedTarget
  if (
    currentTarget instanceof HTMLElement
    && relatedTarget instanceof Node
    && currentTarget.contains(relatedTarget)
  ) {
    return
  }
  zoomControlHovering.value = false
  revealZoomControl({
    collapseAfterIdle: true,
    delay: 260,
    deepDelay: ZOOM_CONTROL_DEEP_COLLAPSE_DELAY,
  })
}

function resolveViewportCenterWorld(): { x: number, y: number } {
  const zoom = clampCanvasZoom(viewport.value.zoom)
  if (rootClientSize.value.width > 0 && rootClientSize.value.height > 0) {
    return {
      x: roundMetric((rootClientSize.value.width / 2 - viewport.value.x) / zoom),
      y: roundMetric((rootClientSize.value.height / 2 - viewport.value.y) / zoom),
    }
  }

  return {
    x: roundMetric(pageRenderBounds.value.x + pageRenderBounds.value.width / 2),
    y: roundMetric(pageRenderBounds.value.y + pageRenderBounds.value.height / 2),
  }
}

function resolveViewportFromCenter(centerX: number, centerY: number, zoom: number): ViewportState {
  const nextZoom = clampCanvasZoom(zoom)
  if (rootClientSize.value.width <= 0 || rootClientSize.value.height <= 0) {
    return {
      x: viewport.value.x,
      y: viewport.value.y,
      zoom: nextZoom,
    }
  }

  return {
    x: roundMetric(rootClientSize.value.width / 2 - centerX * nextZoom),
    y: roundMetric(rootClientSize.value.height / 2 - centerY * nextZoom),
    zoom: nextZoom,
  }
}

function resolveMinimapRectStyle(bounds: WorldBounds): Record<string, string> {
  const minimapBounds = minimapWorldBounds.value
  const metrics = minimapMetrics.value
  const left = metrics.contentX + (bounds.x - minimapBounds.x) * metrics.scale
  const top = metrics.contentY + (bounds.y - minimapBounds.y) * metrics.scale
  const width = Math.max(2, bounds.width * metrics.scale)
  const height = Math.max(2, bounds.height * metrics.scale)
  return {
    left: `${roundMetric(left)}px`,
    top: `${roundMetric(top)}px`,
    width: `${roundMetric(width)}px`,
    height: `${roundMetric(height)}px`,
  }
}

function resolvePageRootElementPresentation(item: PageRootElementPreviewItem) {
  return resolveDesignElementPresentation(item.element, pageRootThemeTokens.value)
}

function resolvePageRootElementStyle(item: PageRootElementPreviewItem): Record<string, string> {
  const presentation = resolvePageRootElementPresentation(item)
  const opacity = Math.max(0, Math.min(1, presentation.opacity * (item.element.locked ? 0.72 : 1)))
  return {
    left: `${item.rect.x}px`,
    top: `${item.rect.y}px`,
    width: `${Math.max(1, item.rect.width)}px`,
    height: `${Math.max(1, item.rect.height)}px`,
    opacity: String(opacity),
    transform: presentation.rotation ? `rotate(${presentation.rotation}deg)` : 'none',
    transformOrigin: 'center center',
    overflow: 'visible',
    zIndex: String(Math.max(1, 30 + Math.round(Number(item.element.zIndex) || 0))),
  }
}

function resolvePageRootElementTextStyle(item: PageRootElementPreviewItem): Record<string, string> {
  const presentation = resolvePageRootElementPresentation(item)
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
    padding: item.element.type === 'badge' ? '6px 12px' : '0',
    borderRadius: `${Math.max(0, Math.round(presentation.borderRadius))}px`,
    background: item.element.type === 'badge' ? presentation.fill : 'transparent',
    color: presentation.color,
    fontSize: `${Math.max(11, Math.round(presentation.fontSize))}px`,
    fontWeight: String(presentation.fontWeight),
    lineHeight: `${Math.max(14, Math.round(presentation.lineHeight))}px`,
    textAlign: presentation.textAlign,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxShadow: presentation.shadow || 'none',
  }
}

function resolvePageRootElementSvgViewBox(item: PageRootElementPreviewItem): string {
  return `0 0 ${Math.max(1, item.rect.width)} ${Math.max(1, item.rect.height)}`
}

function resolvePageRootElementSvgStyle(item: PageRootElementPreviewItem): Record<string, string> {
  const presentation = resolvePageRootElementPresentation(item)
  return {
    overflow: 'visible',
    filter: presentation.shadow ? `drop-shadow(${presentation.shadow})` : 'none',
  }
}

function resolvePageRootPathStrokeLineCap(
  item: PageRootElementPreviewItem,
): 'round' | 'square' | 'inherit' | 'butt' | undefined {
  const strokeLineCap = resolvePageRootElementPresentation(item).strokeLineCap
  return strokeLineCap === 'round' || strokeLineCap === 'square' || strokeLineCap === 'inherit' || strokeLineCap === 'butt'
    ? strokeLineCap
    : undefined
}

function resolvePageRootPathStrokeLineJoin(
  item: PageRootElementPreviewItem,
): 'round' | 'inherit' | 'bevel' | 'miter' | undefined {
  const strokeLineJoin = resolvePageRootElementPresentation(item).strokeLineJoin
  return strokeLineJoin === 'round' || strokeLineJoin === 'inherit' || strokeLineJoin === 'bevel' || strokeLineJoin === 'miter'
    ? strokeLineJoin
    : undefined
}

function resolvePageRootPathSvgPoints(item: PageRootElementPreviewItem): string {
  const points = item.element.points || []
  if (!points.length)
    return ''
  return points
    .map(point => `${roundMetric(point.x - item.rect.x)},${roundMetric(point.y - item.rect.y)}`)
    .join(' ')
}

function resolveFrameSurfaceStyle(frame: DesignFrameModel): Record<string, string> {
  const previewBox = resolveFramePreviewBox(frame)
  const borderRadius = resolveDesignFrameSurfaceRadius(frame)
  return {
    left: `${roundMetric(previewBox.x)}px`,
    top: `${roundMetric(previewBox.y)}px`,
    width: `${roundMetric(Math.max(1, previewBox.width))}px`,
    height: `${roundMetric(Math.max(1, previewBox.height))}px`,
    zIndex: '24',
    borderRadius: `${borderRadius}px`,
    overflow: isDesignFrameClipContentEnabled(frame) ? 'hidden' : 'visible',
    boxShadow: isFlatDesignFrameKind(frame.kind) ? 'none' : '0 24px 64px rgba(15, 23, 42, 0.12)',
  }
}

function resolveFrameTitleStyle(frame: DesignFrameModel): Record<string, string> {
  const previewBox = resolveFramePreviewBox(frame)
  const isSelected = props.selectionState.frameIds.includes(frame.id)
  const isEditingFrame = normalizeString(props.selectionState.editingFrameId) === frame.id
  const isDisplayFrame = normalizeString(props.selectionState.displayFrameId) === frame.id
  return {
    left: `${roundMetric(previewBox.x + 4)}px`,
    top: `${roundMetric(Math.max(8, previewBox.y - 18))}px`,
    maxWidth: `${roundMetric(Math.max(120, previewBox.width - 8))}px`,
    zIndex: isSelected || isEditingFrame || isDisplayFrame ? '117' : '40',
    color: isSelected || isEditingFrame || isDisplayFrame ? '#0369a1' : '#475569',
  }
}

function resolveFrameAnchorOffset(anchor: FrameDragAnchor, size: number): number {
  if (anchor === 'center')
    return size / 2
  if (anchor === 'end')
    return size
  return 0
}

function describeFrameAnchor(axis: 'x' | 'y', anchor: FrameDragAnchor): string {
  if (axis === 'x')
    return anchor === 'start' ? 'left' : anchor === 'center' ? 'center' : 'right'
  return anchor === 'start' ? 'top' : anchor === 'center' ? 'middle' : 'bottom'
}

function snapFrameToGrid(value: number): number {
  return Math.round(value / FRAME_DRAG_GRID_SIZE) * FRAME_DRAG_GRID_SIZE
}

function resolveFrameBox(
  frameId: string,
  position?: { x?: number, y?: number },
): {
  x: number
  y: number
  width: number
  height: number
} {
  const frame = normalizedFrames.value.find(item => item.id === normalizeString(frameId)) || null
  const resolvedX = Number(position?.x ?? frame?.x ?? 0)
  const resolvedY = Number(position?.y ?? frame?.y ?? 0)
  const resolvedWidth = Number(frame?.width || MIN_FRAME_WIDTH)
  const resolvedHeight = Number(frame?.height || MIN_FRAME_HEIGHT)
  return {
    x: Number.isFinite(resolvedX) ? resolvedX : 0,
    y: Number.isFinite(resolvedY) ? resolvedY : 0,
    width: Number.isFinite(resolvedWidth) && resolvedWidth > 0 ? resolvedWidth : MIN_FRAME_WIDTH,
    height: Number.isFinite(resolvedHeight) && resolvedHeight > 0 ? resolvedHeight : MIN_FRAME_HEIGHT,
  }
}

function resolveFramePreviewBox(frame: DesignFrameModel): {
  x: number
  y: number
  width: number
  height: number
} {
  const resizeSession = frameResizeSession.value
  if (resizeSession?.frameId === frame.id)
    return resizeSession.previewBox

  const dragPosition = frameDragSession.value?.previewPositions[frame.id]
  return resolveFrameBox(frame.id, dragPosition)
}

function resolveFrameDragAssist(
  frameId: string,
  position?: { x?: number, y?: number },
  excludedFrameIds: string[] = [],
): FrameDragFeedback | null {
  const normalizedFrameId = normalizeString(frameId)
  if (!normalizedFrameId)
    return null

  const currentBox = resolveFrameBox(normalizedFrameId, position)
  let nextX = snapFrameToGrid(currentBox.x)
  let nextY = snapFrameToGrid(currentBox.y)
  const hints: string[] = [`栅格吸附 ${FRAME_DRAG_GRID_SIZE}px`]
  const xAnchors: FrameDragAnchor[] = ['start', 'center', 'end']
  const yAnchors: FrameDragAnchor[] = ['start', 'center', 'end']
  const excludedFrameIdSet = new Set(excludedFrameIds.map(id => normalizeString(id)).filter(Boolean))
  let bestXMatch: {
    delta: number
    value: number
    label: string
    anchor: FrameDragAnchor
  } | null = null
  let bestYMatch: {
    delta: number
    value: number
    label: string
    anchor: FrameDragAnchor
  } | null = null

  for (const candidate of normalizedFrames.value) {
    if (candidate.id === normalizedFrameId || excludedFrameIdSet.has(candidate.id))
      continue

    const candidateLabel = normalizeString(candidate.name) || candidate.id
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
      const draggedValue = nextX + resolveFrameAnchorOffset(anchor, currentBox.width)
      for (const targetAnchor of xAnchors) {
        const candidateValue = candidateXAnchors[targetAnchor]
        const delta = Math.abs(draggedValue - candidateValue)
        if (delta > FRAME_DRAG_ALIGN_THRESHOLD)
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
      const draggedValue = nextY + resolveFrameAnchorOffset(anchor, currentBox.height)
      for (const targetAnchor of yAnchors) {
        const candidateValue = candidateYAnchors[targetAnchor]
        const delta = Math.abs(draggedValue - candidateValue)
        if (delta > FRAME_DRAG_ALIGN_THRESHOLD)
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
      const draggedValue = nextX + resolveFrameAnchorOffset(anchor, currentBox.width)
      const matchedValue = nextX + resolveFrameAnchorOffset(matchedAnchor, currentBox.width)
      return Math.abs(draggedValue - bestXMatch!.value) < Math.abs(matchedValue - bestXMatch!.value)
        ? anchor
        : matchedAnchor
    }, 'start' as FrameDragAnchor)
    nextX = roundMetric(bestXMatch.value - resolveFrameAnchorOffset(xAnchor, currentBox.width))
    hints.push(`X 对齐 · ${bestXMatch.label} ${describeFrameAnchor('x', bestXMatch.anchor)}`)
  }

  if (bestYMatch) {
    const yAnchor = yAnchors.reduce((matchedAnchor, anchor) => {
      const draggedValue = nextY + resolveFrameAnchorOffset(anchor, currentBox.height)
      const matchedValue = nextY + resolveFrameAnchorOffset(matchedAnchor, currentBox.height)
      return Math.abs(draggedValue - bestYMatch!.value) < Math.abs(matchedValue - bestYMatch!.value)
        ? anchor
        : matchedAnchor
    }, 'start' as FrameDragAnchor)
    nextY = roundMetric(bestYMatch.value - resolveFrameAnchorOffset(yAnchor, currentBox.height))
    hints.push(`Y 对齐 · ${bestYMatch.label} ${describeFrameAnchor('y', bestYMatch.anchor)}`)
  }

  const frame = normalizedFrames.value.find(item => item.id === normalizedFrameId) || null
  return {
    frameId: normalizedFrameId,
    label: normalizeString(frame?.name) || normalizedFrameId,
    x: roundMetric(nextX),
    y: roundMetric(nextY),
    hints,
  }
}

function setFrameDragFeedback(
  session: FrameDragSession,
  deltaX: number,
  deltaY: number,
): FrameDragFeedback | null {
  const primaryItem = session.items.find(item => item.frameId === session.primaryFrameId) || session.items[0] || null
  if (!primaryItem) {
    frameDragFeedback.value = null
    return null
  }

  const feedback = resolveFrameDragAssist(
    primaryItem.frameId,
    {
      x: primaryItem.startX + deltaX,
      y: primaryItem.startY + deltaY,
    },
    session.items.map(item => item.frameId),
  )
  const adjustedDeltaX = (feedback?.x ?? roundMetric(primaryItem.startX + deltaX)) - primaryItem.startX
  const adjustedDeltaY = (feedback?.y ?? roundMetric(primaryItem.startY + deltaY)) - primaryItem.startY
  frameDragSession.value = {
    ...session,
    previewPositions: Object.fromEntries(
      session.items.map(item => [
        item.frameId,
        {
          x: roundMetric(item.startX + adjustedDeltaX),
          y: roundMetric(item.startY + adjustedDeltaY),
        },
      ]),
    ),
  }
  frameDragFeedback.value = feedback
  return feedback
}

function clearFrameDragFeedback(): void {
  frameDragFeedback.value = null
}

function resolveFrameResizeHandleStyle(box: {
  x: number
  y: number
  width: number
  height: number
}): Record<string, string> {
  return {
    left: `${roundMetric(box.x)}px`,
    top: `${roundMetric(box.y)}px`,
    width: `${roundMetric(box.width)}px`,
    height: `${roundMetric(box.height)}px`,
    zIndex: '118',
  }
}

function resolveFrameHitBoxStyle(frame: DesignFrameModel): Record<string, string> {
  const previewBox = resolveFramePreviewBox(frame)
  const isSelected = props.selectionState.frameIds.includes(frame.id)
  const isEditingFrame = normalizeString(props.selectionState.editingFrameId) === frame.id
  const isDisplayFrame = normalizeString(props.selectionState.displayFrameId) === frame.id
  const isDraggingFrame = frameDragSession.value?.items.some(item => item.frameId === frame.id)
  const cursor = activeCreateElementTool.value || pendingImagePlacementState.value
    ? 'crosshair'
    : props.interactionContext.effectiveTool === 'hand'
      ? (panSession.value ? 'grabbing' : 'grab')
      : frameSelectionEnabled.value
        ? (isDraggingFrame ? 'grabbing' : frame.locked ? 'pointer' : 'grab')
        : 'default'

  return {
    left: `${roundMetric(previewBox.x)}px`,
    top: `${roundMetric(previewBox.y)}px`,
    width: `${roundMetric(Math.max(1, previewBox.width))}px`,
    height: `${roundMetric(Math.max(1, previewBox.height))}px`,
    zIndex: isSelected || isEditingFrame || isDisplayFrame ? '116' : '32',
    borderWidth: isSelected || isEditingFrame || isDisplayFrame ? '2px' : '1px',
    borderColor: isSelected || isEditingFrame || isDisplayFrame ? '#38bdf8' : 'rgba(148, 163, 184, 0.32)',
    backgroundColor: isSelected || isEditingFrame || isDisplayFrame ? 'rgba(56, 189, 248, 0.03)' : 'transparent',
    borderRadius: `${resolveDesignFrameSurfaceRadius(frame)}px`,
    cursor,
    boxShadow: isSelected
      ? '0 0 0 1px rgba(56, 189, 248, 0.9), 0 0 0 4px rgba(56, 189, 248, 0.14), 0 16px 40px rgba(15, 23, 42, 0.12)'
      : isEditingFrame || isDisplayFrame
        ? '0 0 0 1px rgba(56, 189, 248, 0.35), 0 10px 28px rgba(15, 23, 42, 0.1)'
        : 'none',
  }
}

function resolveElementHitItemsForFrame(
  displayFrame: DesignFrameModel,
  ownerFrame: DesignFrameModel,
): ElementHitItem[] {
  const elements = previewFrameElementsById.value[displayFrame.id] || []
  return elements.map((element) => {
    const absoluteRect = resolveDesignElementAbsoluteRect(element, displayFrame)
    const width = Math.max(12, absoluteRect.width)
    const height = Math.max(12, absoluteRect.height)
    return {
      element,
      displayFrame,
      ownerFrame,
      displayFrameId: displayFrame.id,
      ownerFrameId: ownerFrame.id,
      rect: {
        x: absoluteRect.x - Math.max(0, width - absoluteRect.width) / 2,
        y: absoluteRect.y - Math.max(0, height - absoluteRect.height) / 2,
        width,
        height,
      },
    }
  })
}

function resolveFrameElementHitItems(
  displayFrame: DesignFrameModel,
  ownerFrame: DesignFrameModel,
): ElementHitItem[] {
  return resolveElementHitItemsForFrame(displayFrame, ownerFrame)
}

function resolveElementHitBoxStyle(item: ElementHitItem): Record<string, string> {
  const isSelected = props.selectionState.elementIds.includes(item.element.id)
  const isPrimary = normalizeString(props.selectionState.primaryElementId) === item.element.id
  const frameLayerOffset = item.displayFrameId
    ? Math.max(0, normalizedFrames.value.findIndex(frame => frame.id === item.displayFrameId)) * 100
    : 0
  const layerBase = normalizeString(item.ownerFrameId) ? 118 + frameLayerOffset : 180
  const canMove = elementDragEnabled.value
    || (elementSelectionEnabled.value
      && resolveFrameUsesAutoLayout(item.ownerFrame)
      && item.element.type !== 'group'
      && !pendingImagePlacementState.value)
  return {
    left: `${item.rect.x}px`,
    top: `${item.rect.y}px`,
    width: `${item.rect.width}px`,
    height: `${item.rect.height}px`,
    zIndex: String(layerBase + Math.max(0, Math.round(Number(item.element.zIndex) || 0))),
    borderColor: isSelected ? '#0ea5e9' : 'transparent',
    boxShadow: isPrimary
      ? '0 0 0 2px rgba(14, 165, 233, 0.35)'
      : isSelected
        ? '0 0 0 1px rgba(14, 165, 233, 0.24)'
        : 'none',
    backgroundColor: isSelected ? 'rgba(14, 165, 233, 0.08)' : 'transparent',
    transform: Number(item.element.rotation || 0) ? `rotate(${Number(item.element.rotation || 0)}deg)` : 'none',
    transformOrigin: 'center center',
    cursor: canMove ? 'move' : 'default',
  }
}

function resolveOverflowElementHitBoxStyle(item: ElementHitItem): Record<string, string> {
  const frameLayerOffset = item.displayFrameId
    ? Math.max(0, normalizedFrames.value.findIndex(frame => frame.id === item.displayFrameId)) * 100
    : 0
  return {
    left: `${item.rect.x}px`,
    top: `${item.rect.y}px`,
    width: `${item.rect.width}px`,
    height: `${item.rect.height}px`,
    zIndex: String(117 + frameLayerOffset + Math.max(0, Math.round(Number(item.element.zIndex) || 0))),
    transform: Number(item.element.rotation || 0) ? `rotate(${Number(item.element.rotation || 0)}deg)` : 'none',
    transformOrigin: 'center center',
    cursor: 'pointer',
  }
}

function handleOverflowElementPointerDown(): void {
  focusCanvas()
  suppressBackgroundClick.value = true
  suppressFrameClick = true
}

function resolveElementWorldGeometry(item: ElementHitItem): {
  x: number
  y: number
  width: number
  height: number
  rotation: number
} {
  return {
    x: roundMetric((item.displayFrame?.x || 0) + Number(item.element.x || 0)),
    y: roundMetric((item.displayFrame?.y || 0) + Number(item.element.y || 0)),
    width: Math.max(12, Number(item.element.width || item.rect.width || 12)),
    height: Math.max(12, Number(item.element.height || item.rect.height || 12)),
    rotation: Number(item.element.rotation || 0),
  }
}

function resolveElementScreenRect(item: ElementHitItem): {
  left: number
  top: number
  width: number
  height: number
} {
  const geometry = resolveElementWorldGeometry(item)
  return {
    left: geometry.x * viewport.value.zoom + viewport.value.x,
    top: geometry.y * viewport.value.zoom + viewport.value.y,
    width: Math.max(1, geometry.width * viewport.value.zoom),
    height: Math.max(1, geometry.height * viewport.value.zoom),
  }
}

function resolveFrameUsesAutoLayout(frame: DesignFrameModel | null | undefined): boolean {
  const metadata = frame?.metadata as Record<string, unknown> | undefined
  const layout = metadata?.layout as Record<string, unknown> | undefined
  return normalizeString(layout?.mode) === 'auto'
}

function resolveCreateSessionFrameContextForFrame(
  displayFrame: DesignFrameModel,
  ownerFrame: DesignFrameModel,
  options: {
    worldX: number
    worldY: number
    requireInsideDisplayFrame?: boolean
    allowAutoLayout?: boolean
  },
): CreateSessionFrameContext | null {
  if (
    Boolean(ownerFrame.locked)
    || (!options.allowAutoLayout && resolveFrameUsesAutoLayout(ownerFrame))
    || !canDesignFrameCreateElements(ownerFrame)
  ) {
    return null
  }

  const localX = roundMetric(options.worldX - displayFrame.x)
  const localY = roundMetric(options.worldY - displayFrame.y)
  const isInsideDisplayFrame = options.worldX >= displayFrame.x
    && options.worldX <= displayFrame.x + Math.max(1, displayFrame.width)
    && options.worldY >= displayFrame.y
    && options.worldY <= displayFrame.y + Math.max(1, displayFrame.height)

  if (options.requireInsideDisplayFrame !== false && !isInsideDisplayFrame)
    return null

  return {
    ownerFrameId: ownerFrame.id,
    displayFrameId: displayFrame.id,
    displayFrameX: displayFrame.x,
    displayFrameY: displayFrame.y,
    localX,
    localY,
    scope: 'frame',
  }
}

function resolveCreateSessionFrameContext(options: {
  worldX: number
  worldY: number
  requireInsideDisplayFrame?: boolean
  allowAutoLayout?: boolean
}): CreateSessionFrameContext | null {
  const allowAutoLayout = options.allowAutoLayout === true
  if (currentEditingOwnerFrame.value && currentEditingDisplayFrame.value) {
    if (!allowAutoLayout && !createElementEnabled.value)
      return null

    return resolveCreateSessionFrameContextForFrame(
      currentEditingDisplayFrame.value,
      currentEditingOwnerFrame.value,
      options,
    )
  }

  if (props.disabled || normalizeString(props.mockupScreenEditingFrameId))
    return null

  return {
    ownerFrameId: '',
    displayFrameId: '',
    displayFrameX: 0,
    displayFrameY: 0,
    localX: roundMetric(options.worldX),
    localY: roundMetric(options.worldY),
    scope: 'page_root',
  }
}

function emitFrameEditingSelection(context: CreateSessionFrameContext): void {
  emit('update-selection', {
    scope: 'none',
    editingFrameId: context.ownerFrameId,
    displayFrameId: context.displayFrameId,
    frameIds: [],
    primaryFrameId: '',
    elementIds: [],
    primaryElementId: '',
  })
}

function emitFrameSelection(frameIds: string[], primaryFrameId: string): void {
  emit('update-selection', {
    scope: frameIds.length > 0 ? 'frame' : 'none',
    editingFrameId: '',
    displayFrameId: '',
    frameIds,
    primaryFrameId: frameIds.length > 0 ? primaryFrameId : '',
    elementIds: [],
    primaryElementId: '',
  })
}

function beginCreateElementSession(
  context: CreateSessionFrameContext,
  tool: CreateElementTool,
  event: PointerEvent,
  options: {
    imagePlacement?: PendingImagePlacement | null
  } = {},
): void {
  focusCanvas()
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })
  emitPointerCursor(event.clientX, event.clientY)
  event.preventDefault()
  suppressBackgroundClick.value = true
  rootRef.value?.setPointerCapture?.(event.pointerId)
  createElementSession.value = {
    pointerId: event.pointerId,
    tool,
    ownerFrameId: context.ownerFrameId,
    displayFrameId: context.displayFrameId,
    displayFrameX: context.displayFrameX,
    displayFrameY: context.displayFrameY,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: context.localX,
    startY: context.localY,
    currentX: context.localX,
    currentY: context.localY,
    moved: false,
    imagePlacement: options.imagePlacement || null,
    points: tool === 'pencil'
      ? [{ x: context.localX, y: context.localY }]
      : undefined,
  }
}

function emitCreateElementFromSession(session: CreateElementSession): void {
  const minX = Math.min(session.startX, session.currentX)
  const minY = Math.min(session.startY, session.currentY)
  const width = Math.max(1, Math.abs(session.currentX - session.startX))
  const height = Math.max(1, Math.abs(session.currentY - session.startY))
  const ownerFrame = normalizedFrames.value.find(frame => frame.id === session.ownerFrameId) || null
  const ownerFrameAutoLayout = resolveFrameUsesAutoLayout(ownerFrame)
  const targetFrameId = normalizeString(session.ownerFrameId) || undefined

  if (session.tool === 'image' && session.imagePlacement?.src) {
    emit('create-element', {
      type: 'image',
      pageId: resolvedPageId.value,
      frameId: targetFrameId,
      x: ownerFrameAutoLayout ? 0 : minX,
      y: ownerFrameAutoLayout ? 0 : minY,
      width: Math.max(1, session.moved ? width : session.imagePlacement.intrinsicWidth),
      height: Math.max(1, session.moved ? height : session.imagePlacement.intrinsicHeight),
      imageSrc: session.imagePlacement.src,
      metadata: session.imagePlacement.assetId
        ? {
            assetId: session.imagePlacement.assetId,
          }
        : undefined,
    })
    emit('clear-pending-image-placement')
    return
  }

  if (session.tool === 'pencil') {
    if (!session.points?.length || session.points.length < 2)
      return

    emit('create-element', {
      type: 'path',
      pageId: resolvedPageId.value,
      frameId: targetFrameId,
      x: minX,
      y: minY,
      width,
      height,
      points: session.points,
      style: {
        stroke: '#0f172a',
        strokeWidth: 3,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      },
    })
    return
  }

  if (session.tool === 'text') {
    pendingCreatedTextEdit.value = {
      ownerFrameId: session.ownerFrameId,
      displayFrameId: session.displayFrameId,
      selectAllOnOpen: true,
    }
    emit('create-element', {
      type: 'text',
      pageId: resolvedPageId.value,
      frameId: targetFrameId,
      x: minX,
      y: minY,
      width: Math.max(160, width),
      height: Math.max(40, height),
      text: '新建文本',
      style: {
        fontSize: 28,
        fontWeight: 700,
        color: '#0f172a',
      },
    })
    return
  }

  emit('create-element', {
    type: 'shape',
    shapeKind: session.tool === 'ellipse' ? 'ellipse' : session.tool === 'arrow' ? 'arrow' : 'rectangle',
    pageId: resolvedPageId.value,
    frameId: targetFrameId,
    x: minX,
    y: minY,
    width: Math.max(session.tool === 'arrow' ? 24 : 12, width),
    height: Math.max(session.tool === 'arrow' ? 24 : 12, height),
    style: {
      fill: session.tool === 'arrow' ? 'transparent' : 'rgba(148, 163, 184, 0.18)',
      stroke: '#334155',
      strokeWidth: 2,
    },
  })
}

function emitClearedElementSelection(): void {
  const preserveEditingFrameId = normalizeString(props.selectionState.editingFrameId)
  emit('update-selection', {
    scope: 'none',
    editingFrameId: preserveEditingFrameId,
    displayFrameId: normalizeString(props.selectionState.displayFrameId) || preserveEditingFrameId,
    frameIds: [],
    primaryFrameId: '',
    elementIds: [],
    primaryElementId: '',
  })
}

function emitElementSelection(item: ElementHitItem | null, elementIds: string[], options?: {
  primaryElementId?: string
}): void {
  if (!item) {
    emitClearedElementSelection()
    return
  }

  emit('update-selection', {
    scope: elementIds.length > 0 ? 'element' : 'none',
    editingFrameId: item.ownerFrameId,
    displayFrameId: item.displayFrameId,
    frameIds: [],
    primaryFrameId: '',
    elementIds,
    primaryElementId: elementIds.length > 0 ? (normalizeString(options?.primaryElementId) || elementIds[elementIds.length - 1] || '') : '',
  })
}

function resolveSelectionDraftMatches(draft: SelectionDraft): string[] {
  const left = Math.min(draft.startClientX, draft.currentClientX)
  const top = Math.min(draft.startClientY, draft.currentClientY)
  const right = Math.max(draft.startClientX, draft.currentClientX)
  const bottom = Math.max(draft.startClientY, draft.currentClientY)
  return editingElementHitItems.value
    .filter((item) => {
      const rect = resolveElementScreenRect(item)
      const itemRight = rect.left + rect.width
      const itemBottom = rect.top + rect.height
      return rect.left < right
        && itemRight > left
        && rect.top < bottom
        && itemBottom > top
    })
    .map(item => item.element.id)
}

function resolveMockupScreenTransform(frame: DesignFrameModel | null | undefined): {
  scale: number
  offsetX: number
  offsetY: number
} {
  return {
    scale: Number(frame?.metadata?.device?.screenTransform?.scale || 1),
    offsetX: Number(frame?.metadata?.device?.screenTransform?.offsetX || 0),
    offsetY: Number(frame?.metadata?.device?.screenTransform?.offsetY || 0),
  }
}

function openTextEditSession(item: ElementHitItem, options?: {
  selectAllOnOpen?: boolean
}): void {
  if (item.element.type !== 'text' && item.element.type !== 'caption' && item.element.type !== 'badge')
    return
  textEditSession.value = {
    elementId: item.element.id,
    ownerFrameId: item.ownerFrameId,
    displayFrameId: item.displayFrameId,
    draftText: item.element.text || '',
    originalText: item.element.text || '',
    selectAllOnOpen: options?.selectAllOnOpen !== false,
  }
}

function closeTextEditSession(options?: {
  commit?: boolean
}): void {
  const session = textEditSession.value
  textEditSession.value = null
  if (!session || !options?.commit)
    return
  if (session.draftText === session.originalText)
    return
  emit('update-element', {
    elementId: session.elementId,
    patch: {
      text: session.draftText,
    },
    historyMergeKey: 'element-text-edit',
  })
}

function resolveElementDragPatch(
  item: ElementDragItem,
  deltaX: number,
  deltaY: number,
): Partial<DesignElementModel> {
  const offsetX = Math.round(deltaX)
  const offsetY = Math.round(deltaY)
  const nextWorldRect = {
    x: Math.round(item.startWorldRect.x + offsetX),
    y: Math.round(item.startWorldRect.y + offsetY),
    width: Math.max(1, Math.round(item.startWorldRect.width)),
    height: Math.max(1, Math.round(item.startWorldRect.height)),
  }
  const targetFrame = resolveAutoAttachFrameForWorldRect(nextWorldRect, item.preferredFrameId)
  const frameOffsetX = targetFrame?.x || 0
  const frameOffsetY = targetFrame?.y || 0

  if (item.type === 'path' && item.startWorldPoints) {
    return {
      frameId: targetFrame ? targetFrame.id : '',
      points: item.startWorldPoints.map(point => ({
        x: Math.round(point.x + offsetX - frameOffsetX),
        y: Math.round(point.y + offsetY - frameOffsetY),
      })),
    }
  }

  return {
    frameId: targetFrame ? targetFrame.id : '',
    x: Math.round(item.startWorldX + offsetX - frameOffsetX),
    y: Math.round(item.startWorldY + offsetY - frameOffsetY),
  }
}

function resolveElementLabel(element: DesignElementModel): string {
  const explicitName = normalizeString(element.metadata?.name)
  if (explicitName)
    return explicitName
  if (normalizeString(element.text))
    return normalizeString(element.text).slice(0, 24)
  if (element.type === 'shape' && normalizeString(element.shapeKind))
    return normalizeString(element.shapeKind)
  return element.type
}

function clearElementGuideOverlay(): void {
  elementGuideOverlay.value = null
}

function resolveGroupChildHitItems(groupId: string): ElementHitItem[] {
  const normalizedGroupId = normalizeString(groupId)
  if (!normalizedGroupId)
    return []
  return allEditingElementHitItems.value.filter((item) => {
    return normalizeString(item.element.parentId) === normalizedGroupId
  })
}

function resolveExpandedDragItems(items: ElementHitItem[]): ElementDragItem[] {
  const dragItems: ElementDragItem[] = []
  const seenElementIds = new Set<string>()

  items.forEach((candidate) => {
    const expandedItems = candidate.element.type === 'group'
      ? resolveGroupChildHitItems(candidate.element.id)
      : [candidate]
    expandedItems.forEach((item) => {
      if (seenElementIds.has(item.element.id))
        return
      seenElementIds.add(item.element.id)
      const absoluteRect = resolveDesignElementAbsoluteRect(item.element, item.displayFrame)
      dragItems.push({
        elementId: item.element.id,
        type: item.element.type,
        startX: item.element.x,
        startY: item.element.y,
        startPoints: Array.isArray(item.element.points)
          ? item.element.points.map(point => ({
              x: Number(point.x) || 0,
              y: Number(point.y) || 0,
            }))
          : null,
        startWorldX: absoluteRect.x,
        startWorldY: absoluteRect.y,
        startWorldRect: {
          x: absoluteRect.x,
          y: absoluteRect.y,
          width: Math.max(1, absoluteRect.width),
          height: Math.max(1, absoluteRect.height),
        },
        startWorldPoints: Array.isArray(item.element.points)
          ? item.element.points.map(point => ({
              x: Math.round((Number(point.x) || 0) + (item.displayFrame?.x || 0)),
              y: Math.round((Number(point.y) || 0) + (item.displayFrame?.y || 0)),
            }))
          : null,
        preferredFrameId: normalizeString(item.ownerFrameId),
      })
    })
  })

  return dragItems
}

function resolveElementGuideAdjustment(
  session: ElementDragSession,
  deltaX: number,
  deltaY: number,
): { deltaX: number, deltaY: number } {
  const source = session.guideSource
  const snappedGridX = Math.round((source.x + deltaX) / ELEMENT_SNAP_GRID_SIZE) * ELEMENT_SNAP_GRID_SIZE
  const snappedGridY = Math.round((source.y + deltaY) / ELEMENT_SNAP_GRID_SIZE) * ELEMENT_SNAP_GRID_SIZE
  let nextX = snappedGridX
  let nextY = snappedGridY
  const hints = [`栅格吸附 ${ELEMENT_SNAP_GRID_SIZE}px`]

  if (session.isMultiSelect) {
    elementGuideOverlay.value = {
      label: source.label,
      x: nextX,
      y: nextY,
      hints,
    }
    return {
      deltaX: nextX - source.x,
      deltaY: nextY - source.y,
    }
  }

  const movingElementIds = new Set(session.items.map(item => item.elementId))
  movingElementIds.add(session.primaryElementId)
  const siblingItems = allEditingElementHitItems.value.filter((item) => {
    return normalizeString(item.element.parentId) === normalizeString(source.parentId)
      && !movingElementIds.has(item.element.id)
  })
  const frame = currentEditingDisplayFrame.value
  const xCandidates: Array<{ value: number, label: string }> = [
    ...siblingItems.flatMap((item) => {
      return [
        { value: Number(item.element.x || 0), label: resolveElementLabel(item.element) },
        { value: Number(item.element.x || 0) + Number(item.element.width || 0) / 2, label: resolveElementLabel(item.element) },
        { value: Number(item.element.x || 0) + Number(item.element.width || 0), label: resolveElementLabel(item.element) },
      ]
    }),
  ]
  const yCandidates: Array<{ value: number, label: string }> = [
    ...siblingItems.flatMap((item) => {
      return [
        { value: Number(item.element.y || 0), label: resolveElementLabel(item.element) },
        { value: Number(item.element.y || 0) + Number(item.element.height || 0) / 2, label: resolveElementLabel(item.element) },
        { value: Number(item.element.y || 0) + Number(item.element.height || 0), label: resolveElementLabel(item.element) },
      ]
    }),
  ]
  if (frame) {
    xCandidates.push(
      { value: 0, label: frame.name || 'Frame' },
      { value: frame.width / 2, label: frame.name || 'Frame' },
      { value: frame.width, label: frame.name || 'Frame' },
    )
    yCandidates.push(
      { value: 0, label: frame.name || 'Frame' },
      { value: frame.height / 2, label: frame.name || 'Frame' },
      { value: frame.height, label: frame.name || 'Frame' },
    )
  }

  interface ElementGuideCandidate { value: number, label: string }
  interface ElementGuideAnchor { key: 'start' | 'center' | 'end', value: number, offset: number }
  interface ElementGuideMatch { delta: number, candidate: ElementGuideCandidate, sourceAnchor: ElementGuideAnchor }

  const sourceXAnchors: ElementGuideAnchor[] = [
    { key: 'start', value: nextX, offset: 0 },
    { key: 'center', value: nextX + source.width / 2, offset: source.width / 2 },
    { key: 'end', value: nextX + source.width, offset: source.width },
  ]
  const sourceYAnchors: ElementGuideAnchor[] = [
    { key: 'start', value: nextY, offset: 0 },
    { key: 'center', value: nextY + source.height / 2, offset: source.height / 2 },
    { key: 'end', value: nextY + source.height, offset: source.height },
  ]

  let bestXMatch: ElementGuideMatch | null = null
  let bestYMatch: ElementGuideMatch | null = null

  for (const anchor of sourceXAnchors) {
    for (const candidate of xCandidates) {
      const delta = Math.abs(anchor.value - candidate.value)
      if (delta > ELEMENT_SNAP_THRESHOLD)
        continue
      if (!bestXMatch || delta < bestXMatch.delta)
        bestXMatch = { delta, candidate, sourceAnchor: anchor }
    }
  }
  for (const anchor of sourceYAnchors) {
    for (const candidate of yCandidates) {
      const delta = Math.abs(anchor.value - candidate.value)
      if (delta > ELEMENT_SNAP_THRESHOLD)
        continue
      if (!bestYMatch || delta < bestYMatch.delta)
        bestYMatch = { delta, candidate, sourceAnchor: anchor }
    }
  }

  let verticalGuideX: number | undefined
  let horizontalGuideY: number | undefined

  const resolvedBestXMatch = bestXMatch
  if (resolvedBestXMatch) {
    nextX = Math.round(resolvedBestXMatch.candidate.value - resolvedBestXMatch.sourceAnchor.offset)
    hints.push(`X 对齐 · ${resolvedBestXMatch.candidate.label}`)
    verticalGuideX = frame ? frame.x + resolvedBestXMatch.candidate.value : resolvedBestXMatch.candidate.value
  }
  const resolvedBestYMatch = bestYMatch
  if (resolvedBestYMatch) {
    nextY = Math.round(resolvedBestYMatch.candidate.value - resolvedBestYMatch.sourceAnchor.offset)
    hints.push(`Y 对齐 · ${resolvedBestYMatch.candidate.label}`)
    horizontalGuideY = frame ? frame.y + resolvedBestYMatch.candidate.value : resolvedBestYMatch.candidate.value
  }

  elementGuideOverlay.value = {
    label: source.label,
    x: nextX,
    y: nextY,
    verticalGuideX,
    horizontalGuideY,
    hints,
  }

  return {
    deltaX: nextX - source.x,
    deltaY: nextY - source.y,
  }
}

function snapElementMetricToGrid(value: number, minimum = Number.NEGATIVE_INFINITY): number {
  const snapped = Math.round(value / ELEMENT_SNAP_GRID_SIZE) * ELEMENT_SNAP_GRID_SIZE
  return Number.isFinite(minimum) ? Math.max(minimum, snapped) : snapped
}

function beginGroupEditSession(item: ElementHitItem): void {
  if (item.element.type !== 'group')
    return
  groupEditSession.value = {
    groupId: item.element.id,
    ownerFrameId: item.ownerFrameId,
    displayFrameId: item.displayFrameId,
  }
}

function closeGroupEditSession(options: {
  selectGroup?: boolean
} = {}): void {
  const session = groupEditSession.value
  groupEditSession.value = null
  if (!session || !options.selectGroup)
    return
  const groupItem = allEditingElementHitItems.value.find(item => item.element.id === session.groupId) || null
  emitElementSelection(groupItem, groupItem ? [groupItem.element.id] : [])
}

function resolveAutoLayoutSiblingItems(item: ElementHitItem): ElementHitItem[] {
  return allEditingElementHitItems.value
    .filter((candidate) => {
      return normalizeString(candidate.ownerFrameId) === normalizeString(item.ownerFrameId)
        && normalizeString(candidate.displayFrameId) === normalizeString(item.displayFrameId)
        && normalizeString(candidate.element.parentId) === normalizeString(item.element.parentId)
        && candidate.element.type !== 'group'
    })
    .sort((left, right) => Number(left.element.zIndex || 0) - Number(right.element.zIndex || 0))
}

function beginAutoLayoutReorderSession(item: ElementHitItem, event: PointerEvent): void {
  const layoutDirection = normalizeString(item.ownerFrame?.metadata?.layout?.direction) === 'horizontal'
    ? 'horizontal'
    : 'vertical'
  const siblings = resolveAutoLayoutSiblingItems(item)
  const fromIndex = siblings.findIndex(candidate => candidate.element.id === item.element.id)
  if (fromIndex < 0)
    return

  rootRef.value?.setPointerCapture?.(event.pointerId)
  autoLayoutReorderSession.value = {
    pointerId: event.pointerId,
    elementId: item.element.id,
    ownerFrameId: item.ownerFrameId,
    displayFrameId: item.displayFrameId,
    parentId: normalizeString(item.element.parentId) || undefined,
    direction: layoutDirection,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false,
    fromIndex,
    targetIndex: fromIndex,
    indicator: null,
  }
}

function stopAutoLayoutReorderSession(pointerId?: number): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  autoLayoutReorderSession.value = null
}

function resolveElementResizeHandleStyle(item: ElementHitItem): Record<string, string> {
  const layerBase = normalizeString(item.ownerFrameId) ? 80 : 130
  return {
    left: `${item.rect.x}px`,
    top: `${item.rect.y}px`,
    width: `${item.rect.width}px`,
    height: `${item.rect.height}px`,
    zIndex: String(layerBase + Math.max(0, Math.round(Number(item.element.zIndex) || 0))),
    transform: Number(item.element.rotation || 0) ? `rotate(${Number(item.element.rotation || 0)}deg)` : 'none',
    transformOrigin: 'center center',
  }
}

function applyElementResizeDelta(
  session: ElementResizeSession,
  clientX: number,
  clientY: number,
): Partial<DesignElementModel> {
  const deltaX = (clientX - session.startClientX) / session.startZoom
  const deltaY = (clientY - session.startClientY) / session.startZoom
  let { x, y, width, height } = session.item

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

  const minimumWidth = 12
  const minimumHeight = 12
  if (width < minimumWidth) {
    if (session.direction.includes('w'))
      x -= minimumWidth - width
    width = minimumWidth
  }
  if (height < minimumHeight) {
    if (session.direction.includes('n'))
      y -= minimumHeight - height
    height = minimumHeight
  }

  const snappedWidth = snapElementMetricToGrid(width, minimumWidth)
  const snappedHeight = snapElementMetricToGrid(height, minimumHeight)
  if (session.direction.includes('w'))
    x -= snappedWidth - width
  if (session.direction.includes('n'))
    y -= snappedHeight - height
  width = snappedWidth
  height = snappedHeight

  return {
    x: snapElementMetricToGrid(x, 0),
    y: snapElementMetricToGrid(y, 0),
    width: Math.max(minimumWidth, Math.round(width)),
    height: Math.max(minimumHeight, Math.round(height)),
  }
}

function applyFrameResizeDelta(
  session: FrameResizeSession,
  clientX: number,
  clientY: number,
): {
  x: number
  y: number
  width: number
  height: number
} {
  const deltaX = (clientX - session.startClientX) / viewport.value.zoom
  const deltaY = (clientY - session.startClientY) / viewport.value.zoom
  let { x, y, width, height } = session.startBox

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

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(MIN_FRAME_WIDTH, Math.round(width)),
    height: Math.max(MIN_FRAME_HEIGHT, Math.round(height)),
  }
}

function stopFrameDrag(pointerId?: number): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  frameDragSession.value = null
}

function stopFrameResize(pointerId?: number): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  frameResizeSession.value = null
}

function stopElementDrag(
  pointerId?: number,
  options: { preservePreview?: boolean } = {},
): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  elementDragSession.value = null
  if (!options.preservePreview)
    clearTransientElementPatches()
  clearElementGuideOverlay()
}

function stopElementResize(
  pointerId?: number,
  options: { preservePreview?: boolean } = {},
): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  elementResizeSession.value = null
  if (!options.preservePreview)
    clearTransientElementPatches()
}

function stopElementRotation(
  pointerId?: number,
  options: { preservePreview?: boolean } = {},
): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  elementRotationSession.value = null
  if (!options.preservePreview)
    clearTransientElementPatches()
}

function stopCreateElementSession(pointerId?: number): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  createElementSession.value = null
}

function stopSelectionDraft(pointerId?: number): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  selectionDraft.value = null
}

function stopMockupScreenDragSession(
  pointerId?: number,
  options: { preservePreview?: boolean } = {},
): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  mockupScreenDragSession.value = null
  if (!options.preservePreview)
    clearTransientFramePatches()
}

function handleElementPointerDown(item: ElementHitItem, event: PointerEvent): void {
  const autoLayoutFrame = resolveFrameUsesAutoLayout(item.ownerFrame)
  const canAutoLayoutReorder = elementSelectionEnabled.value
    && autoLayoutFrame
    && !textEditSession.value
    && !pendingImagePlacementState.value
    && item.element.type !== 'group'
    && event.button === 0
    && !event.shiftKey
  if ((!elementDragEnabled.value && !canAutoLayoutReorder) || textEditSession.value || event.button !== 0 || event.shiftKey)
    return
  if (item.ownerFrame?.locked)
    return

  if (canAutoLayoutReorder) {
    focusCanvas()
    suppressBackgroundClick.value = true
    suppressFrameClick = true
    const selectedIds = props.selectionState.scope === 'element'
      ? props.selectionState.elementIds
      : []
    if (!selectedIds.includes(item.element.id)) {
      emitElementSelection(item, [item.element.id], {
        primaryElementId: item.element.id,
      })
    }
    beginAutoLayoutReorderSession(item, event)
    return
  }

  focusCanvas()
  suppressBackgroundClick.value = true
  suppressFrameClick = true
  const selectedIds = props.selectionState.scope === 'element'
    ? props.selectionState.elementIds
    : []
  const itemMap = new Map(editingElementHitItems.value.map(candidate => [candidate.element.id, candidate] as const))
  const requestedDragItems = selectedIds.includes(item.element.id)
    ? selectedIds
        .map(elementId => itemMap.get(elementId) || null)
        .filter((candidate): candidate is ElementHitItem => Boolean(candidate))
    : [item]
  const dragItems = resolveExpandedDragItems(requestedDragItems)

  if (!dragItems.length)
    return

  if (!selectedIds.includes(item.element.id)) {
    emit('update-selection', {
      scope: 'element',
      editingFrameId: item.ownerFrameId,
      displayFrameId: item.displayFrameId,
      frameIds: [],
      primaryFrameId: '',
      elementIds: [item.element.id],
      primaryElementId: item.element.id,
    })
  }

  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })

  rootRef.value?.setPointerCapture?.(event.pointerId)
  elementDragSession.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startZoom: viewport.value.zoom,
    moved: false,
    historyMergeKey: `element-drag:${Date.now()}:${dragItems.map(candidate => candidate.elementId).join(',')}`,
    primaryElementId: item.element.id,
    guideSource: {
      label: resolveElementLabel(item.element),
      x: Number(item.element.x || 0),
      y: Number(item.element.y || 0),
      width: Math.max(1, Number(item.element.width || item.rect.width || 1)),
      height: Math.max(1, Number(item.element.height || item.rect.height || 1)),
      parentId: normalizeString(item.element.parentId) || undefined,
    },
    isMultiSelect: requestedDragItems.length > 1,
    items: dragItems,
    previewPatches: {},
  }
  clearElementGuideOverlay()
}

function handleElementResizePointerDown(direction: ResizeDirection, event: PointerEvent): void {
  if (!elementResizeEnabled.value || textEditSession.value || event.button !== 0)
    return
  const item = primaryEditingElementHitItem.value
  if (!item)
    return

  focusCanvas()
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })

  rootRef.value?.setPointerCapture?.(event.pointerId)
  elementResizeSession.value = {
    pointerId: event.pointerId,
    direction,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startZoom: viewport.value.zoom,
    moved: false,
    historyMergeKey: `element-resize:${Date.now()}:${item.element.id}:${direction}`,
    item: {
      elementId: item.element.id,
      label: resolveElementLabel(item.element),
      type: item.element.type,
      x: item.element.x,
      y: item.element.y,
      width: Math.max(1, item.element.width),
      height: Math.max(1, item.element.height),
    },
    previewPatch: null,
  }
}

function handleElementRotatePointerDown(event: PointerEvent): void {
  if (!elementTransformTarget.value || textEditSession.value || event.button !== 0)
    return

  const target = elementTransformTarget.value
  const worldPoint = toWorldPoint(event.clientX, event.clientY)
  if (!worldPoint)
    return

  focusCanvas()
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })

  const centerX = target.geometry.x + target.geometry.width / 2
  const centerY = target.geometry.y + target.geometry.height / 2
  rootRef.value?.setPointerCapture?.(event.pointerId)
  elementRotationSession.value = {
    pointerId: event.pointerId,
    elementId: target.item.element.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startPointerAngle: Math.atan2(worldPoint.y - centerY, worldPoint.x - centerX),
    startRotation: Number(target.item.element.rotation || 0),
    previewRotation: Number(target.item.element.rotation || 0),
    startCenterX: centerX,
    startCenterY: centerY,
    moved: false,
    historyMergeKey: `element-rotate:${Date.now()}:${target.item.element.id}`,
  }
}

function handleElementDoubleClick(item: ElementHitItem): void {
  if (props.disabled || Boolean(props.mockupScreenEditingFrameId))
    return
  if (item.element.type === 'group') {
    emitElementSelection(item, [item.element.id], {
      primaryElementId: item.element.id,
    })
    beginGroupEditSession(item)
    return
  }
  if (item.element.type !== 'text' && item.element.type !== 'caption' && item.element.type !== 'badge')
    return

  emitElementSelection(item, [item.element.id], {
    primaryElementId: item.element.id,
  })
  openTextEditSession(item, {
    selectAllOnOpen: false,
  })
}

function handleFrameResizePointerDown(direction: ResizeDirection, event: PointerEvent): void {
  const target = frameResizeTarget.value
  if (!target || event.button !== 0)
    return

  focusCanvas()
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })
  event.preventDefault()
  rootRef.value?.setPointerCapture?.(event.pointerId)
  frameResizeSession.value = {
    pointerId: event.pointerId,
    frameId: target.frame.id,
    direction,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false,
    historyMergeKey: 'frame-resize',
    startBox: {
      x: target.box.x,
      y: target.box.y,
      width: target.box.width,
      height: target.box.height,
    },
    previewBox: {
      x: target.box.x,
      y: target.box.y,
      width: target.box.width,
      height: target.box.height,
    },
  }
}

function toWorldPoint(clientX: number, clientY: number): { x: number, y: number } | null {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect)
    return null

  const relativeX = clientX - rect.left
  const relativeY = clientY - rect.top
  return {
    x: roundMetric((relativeX - viewport.value.x) / viewport.value.zoom),
    y: roundMetric((relativeY - viewport.value.y) / viewport.value.zoom),
  }
}

function emitPointerCursor(clientX: number, clientY: number): void {
  const point = toWorldPoint(clientX, clientY)
  if (!point)
    return
  emit('updateCollabCursor', {
    cursorX: point.x,
    cursorY: point.y,
  })
}

function emitViewportChange(nextViewport: ViewportState): void {
  viewport.value = nextViewport
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })
  emit('viewport-change', {
    x: roundMetric(nextViewport.x),
    y: roundMetric(nextViewport.y),
    zoom: roundMetric(nextViewport.zoom),
  })
}

function centerViewportAtWorldPoint(worldX: number, worldY: number, zoom = viewport.value.zoom): void {
  emitViewportChange(resolveViewportFromCenter(worldX, worldY, zoom))
}

function zoomCanvasTo(nextZoom: number): void {
  const nextCenter = resolveViewportCenterWorld()
  centerViewportAtWorldPoint(nextCenter.x, nextCenter.y, nextZoom)
}

function adjustCanvasZoom(delta: number): void {
  zoomCanvasTo(viewport.value.zoom + delta)
}

function cycleQuickZoomPreset(): void {
  zoomCanvasTo(nextQuickZoomPreset.value / 100)
}

function fitCanvasView(): void {
  const horizontalPadding = Math.min(120, rootClientSize.value.width * 0.16)
  const verticalPadding = Math.min(120, rootClientSize.value.height * 0.18)
  const availableWidth = Math.max(1, rootClientSize.value.width - horizontalPadding * 2)
  const availableHeight = Math.max(1, rootClientSize.value.height - verticalPadding * 2)
  const nextZoom = clampCanvasZoom(Math.min(
    availableWidth / pageRenderBounds.value.width,
    availableHeight / pageRenderBounds.value.height,
  ))
  centerViewportAtWorldPoint(
    pageRenderBounds.value.x + pageRenderBounds.value.width / 2,
    pageRenderBounds.value.y + pageRenderBounds.value.height / 2,
    nextZoom,
  )
}

function startPan(event: PointerEvent): void {
  if (!rootRef.value)
    return

  rootRef.value.setPointerCapture?.(event.pointerId)
  panSession.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startViewportX: viewport.value.x,
    startViewportY: viewport.value.y,
    moved: false,
  }
}

function stopPan(pointerId?: number): void {
  if (typeof pointerId === 'number')
    rootRef.value?.releasePointerCapture?.(pointerId)
  panSession.value = null
}

function resolveMinimapWorldPoint(clientX: number, clientY: number): { x: number, y: number } | null {
  const rect = minimapRef.value?.getBoundingClientRect()
  if (!rect)
    return null

  const metrics = minimapMetrics.value
  const bounds = minimapWorldBounds.value
  const relativeX = clampNumber(
    clientX - rect.left,
    metrics.contentX,
    metrics.contentX + metrics.contentWidth,
  )
  const relativeY = clampNumber(
    clientY - rect.top,
    metrics.contentY,
    metrics.contentY + metrics.contentHeight,
  )

  return {
    x: roundMetric(bounds.x + (relativeX - metrics.contentX) / metrics.scale),
    y: roundMetric(bounds.y + (relativeY - metrics.contentY) / metrics.scale),
  }
}

function updateViewportFromMinimapPointer(clientX: number, clientY: number): void {
  const point = resolveMinimapWorldPoint(clientX, clientY)
  if (!point)
    return
  centerViewportAtWorldPoint(point.x, point.y)
}

function handleMinimapPointerDown(event: PointerEvent): void {
  if (props.disabled || !minimapRef.value)
    return
  focusCanvas()
  activeMinimapPointerId = event.pointerId
  minimapRef.value.setPointerCapture?.(event.pointerId)
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })
  updateViewportFromMinimapPointer(event.clientX, event.clientY)
}

function handleMinimapPointerMove(event: PointerEvent): void {
  if (activeMinimapPointerId !== event.pointerId)
    return
  updateViewportFromMinimapPointer(event.clientX, event.clientY)
}

function handleMinimapPointerUp(event: PointerEvent): void {
  if (activeMinimapPointerId !== event.pointerId)
    return
  minimapRef.value?.releasePointerCapture?.(event.pointerId)
  activeMinimapPointerId = null
}

function handleStagePointerDown(event: PointerEvent): void {
  if ((event.target as HTMLElement | null)?.closest('[data-canvas-role="chrome"]'))
    return
  if ((event.target as HTMLElement | null)?.closest('[data-canvas-role="frame-hit"]'))
    return
  if ((event.target as HTMLElement | null)?.closest('[data-canvas-role="element-hit"]'))
    return

  if (textEditSession.value) {
    focusCanvas()
    return
  }

  focusCanvas()
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })
  emitPointerCursor(event.clientX, event.clientY)

  if (event.button === 1 || props.interactionContext.effectiveTool === 'hand') {
    event.preventDefault()
    startPan(event)
    return
  }

  if (event.button !== 0)
    return

  const mockupLayout = activeMockupScreenEditingLayout.value
  if (props.interactionContext.effectiveTool === 'select' && mockupLayout) {
    const worldPoint = toWorldPoint(event.clientX, event.clientY)
    if (!worldPoint)
      return
    const isInsideScreenRect = worldPoint.x >= mockupLayout.screenRect.x
      && worldPoint.x <= mockupLayout.screenRect.x + mockupLayout.screenRect.width
      && worldPoint.y >= mockupLayout.screenRect.y
      && worldPoint.y <= mockupLayout.screenRect.y + mockupLayout.screenRect.height
    if (isInsideScreenRect) {
      const transform = resolveMockupScreenTransform(mockupLayout.displayFrame)
      event.preventDefault()
      suppressBackgroundClick.value = true
      rootRef.value?.setPointerCapture?.(event.pointerId)
      mockupScreenDragSession.value = {
        pointerId: event.pointerId,
        frameId: mockupLayout.displayFrame.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        scale: transform.scale,
        startOffsetX: transform.offsetX,
        startOffsetY: transform.offsetY,
        previewOffsetX: transform.offsetX,
        previewOffsetY: transform.offsetY,
        moved: false,
      }
      return
    }
  }

  const creationTool = activeCreateElementTool.value
  const pendingImagePlacement = pendingImagePlacementState.value
  if (pendingImagePlacement) {
    const worldPoint = toWorldPoint(event.clientX, event.clientY)
    if (!worldPoint)
      return
    const frameContext = resolveCreateSessionFrameContext({
      worldX: worldPoint.x,
      worldY: worldPoint.y,
      allowAutoLayout: true,
    })
    if (!frameContext)
      return

    beginCreateElementSession(frameContext, 'image', event, {
      imagePlacement: pendingImagePlacement,
    })
    return
  }
  if (creationTool) {
    const worldPoint = toWorldPoint(event.clientX, event.clientY)
    if (!worldPoint)
      return
    const frameContext = resolveCreateSessionFrameContext({
      worldX: worldPoint.x,
      worldY: worldPoint.y,
    })
    if (!frameContext)
      return

    beginCreateElementSession(frameContext, creationTool, event)
    return
  }

  if (elementSelectionEnabled.value) {
    event.preventDefault()
    suppressBackgroundClick.value = true
    rootRef.value?.setPointerCapture?.(event.pointerId)
    selectionDraft.value = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      selecting: false,
      additive: Boolean(event.shiftKey),
      previewElementIds: [],
    }
  }
}

function handlePointerMove(event: PointerEvent): void {
  const rect = rootRef.value?.getBoundingClientRect()
  localPointerScreen.value = rect
    ? {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    : {
        x: event.clientX,
        y: event.clientY,
      }
  emitPointerCursor(event.clientX, event.clientY)

  const currentFrameResizeSession = frameResizeSession.value
  if (currentFrameResizeSession && currentFrameResizeSession.pointerId === event.pointerId) {
    const deltaClientX = event.clientX - currentFrameResizeSession.startClientX
    const deltaClientY = event.clientY - currentFrameResizeSession.startClientY
    const moved = currentFrameResizeSession.moved
      || Math.abs(deltaClientX) > PAN_GESTURE_THRESHOLD
      || Math.abs(deltaClientY) > PAN_GESTURE_THRESHOLD

    if (moved && !currentFrameResizeSession.moved) {
      suppressBackgroundClick.value = true
      suppressFrameClick = true
    }

    frameResizeSession.value = {
      ...currentFrameResizeSession,
      moved,
      previewBox: applyFrameResizeDelta(currentFrameResizeSession, event.clientX, event.clientY),
    }
    return
  }

  const currentFrameDragSession = frameDragSession.value
  if (currentFrameDragSession && currentFrameDragSession.pointerId === event.pointerId) {
    const deltaClientX = event.clientX - currentFrameDragSession.startClientX
    const deltaClientY = event.clientY - currentFrameDragSession.startClientY
    const moved = currentFrameDragSession.moved
      || Math.abs(deltaClientX) > PAN_GESTURE_THRESHOLD
      || Math.abs(deltaClientY) > PAN_GESTURE_THRESHOLD

    if (!moved)
      return

    if (!currentFrameDragSession.moved) {
      suppressBackgroundClick.value = true
      suppressFrameClick = true
    }

    const deltaWorldX = deltaClientX / viewport.value.zoom
    const deltaWorldY = deltaClientY / viewport.value.zoom
    setFrameDragFeedback({
      ...currentFrameDragSession,
      moved,
    }, deltaWorldX, deltaWorldY)
    return
  }

  const reorderSession = autoLayoutReorderSession.value
  if (reorderSession && reorderSession.pointerId === event.pointerId) {
    const deltaClientX = event.clientX - reorderSession.startClientX
    const deltaClientY = event.clientY - reorderSession.startClientY
    const moved = reorderSession.moved
      || Math.abs(deltaClientX) > PAN_GESTURE_THRESHOLD
      || Math.abs(deltaClientY) > PAN_GESTURE_THRESHOLD
    if (moved && !reorderSession.moved) {
      suppressBackgroundClick.value = true
      suppressElementClick = true
    }
    const draggedItem = allEditingElementHitItems.value.find(item => item.element.id === reorderSession.elementId) || null
    if (!draggedItem)
      return

    const siblings = resolveAutoLayoutSiblingItems(draggedItem)
    const otherSiblings = siblings.filter(item => item.element.id !== reorderSession.elementId)
    const worldPoint = toWorldPoint(event.clientX, event.clientY)
    const pointerAxis = reorderSession.direction === 'horizontal'
      ? Number(worldPoint?.x ?? draggedItem.rect.x)
      : Number(worldPoint?.y ?? draggedItem.rect.y)
    let targetIndex = 0
    while (targetIndex < otherSiblings.length) {
      const sibling = otherSiblings[targetIndex]
      if (!sibling)
        break
      const threshold = reorderSession.direction === 'horizontal'
        ? sibling.element.x + sibling.element.width / 2
        : sibling.element.y + sibling.element.height / 2
      if (pointerAxis < threshold)
        break
      targetIndex += 1
    }

    let indicator = null as AutoLayoutReorderSession['indicator']
    if (currentEditingDisplayFrame.value) {
      if (reorderSession.direction === 'horizontal') {
        const indicatorX = targetIndex === 0
          ? otherSiblings[0]?.rect.x ?? draggedItem.rect.x
          : targetIndex >= otherSiblings.length
            ? (otherSiblings[otherSiblings.length - 1]?.rect.x || draggedItem.rect.x) + (otherSiblings[otherSiblings.length - 1]?.rect.width || draggedItem.rect.width)
            : otherSiblings[targetIndex]?.rect.x || draggedItem.rect.x
        indicator = {
          left: indicatorX - 1,
          top: currentEditingDisplayFrame.value.y + 8,
          width: 2,
          height: Math.max(24, currentEditingDisplayFrame.value.height - 16),
        }
      }
      else {
        const indicatorY = targetIndex === 0
          ? otherSiblings[0]?.rect.y ?? draggedItem.rect.y
          : targetIndex >= otherSiblings.length
            ? (otherSiblings[otherSiblings.length - 1]?.rect.y || draggedItem.rect.y) + (otherSiblings[otherSiblings.length - 1]?.rect.height || draggedItem.rect.height)
            : otherSiblings[targetIndex]?.rect.y || draggedItem.rect.y
        indicator = {
          left: currentEditingDisplayFrame.value.x + 8,
          top: indicatorY - 1,
          width: Math.max(24, currentEditingDisplayFrame.value.width - 16),
          height: 2,
        }
      }
    }

    autoLayoutReorderSession.value = {
      ...reorderSession,
      moved,
      targetIndex,
      indicator,
    }
    clearElementGuideOverlay()
    return
  }

  const mockupDragSession = mockupScreenDragSession.value
  if (mockupDragSession && mockupDragSession.pointerId === event.pointerId) {
    const deltaX = (event.clientX - mockupDragSession.startClientX) / viewport.value.zoom
    const deltaY = (event.clientY - mockupDragSession.startClientY) / viewport.value.zoom
    if (!mockupDragSession.moved && (Math.abs(deltaX) > PAN_GESTURE_THRESHOLD / viewport.value.zoom || Math.abs(deltaY) > PAN_GESTURE_THRESHOLD / viewport.value.zoom))
      mockupDragSession.moved = true

    mockupDragSession.previewOffsetX = roundMetric(mockupDragSession.startOffsetX + deltaX)
    mockupDragSession.previewOffsetY = roundMetric(mockupDragSession.startOffsetY + deltaY)
    scheduleTransientFramePatches({
      [mockupDragSession.frameId]: {
        metadata: {
          device: {
            screenTransform: {
              scale: mockupDragSession.scale,
              offsetX: mockupDragSession.previewOffsetX,
              offsetY: mockupDragSession.previewOffsetY,
            },
          },
        },
      },
    })
    return
  }

  const creationSession = createElementSession.value
  if (creationSession && creationSession.pointerId === event.pointerId) {
    const worldPoint = toWorldPoint(event.clientX, event.clientY)
    if (!worldPoint)
      return
    const frameContext = resolveCreateSessionFrameContext({
      worldX: worldPoint.x,
      worldY: worldPoint.y,
      requireInsideDisplayFrame: false,
      allowAutoLayout: creationSession.tool === 'image',
    })
    if (!frameContext)
      return

    const deltaClientX = event.clientX - creationSession.startClientX
    const deltaClientY = event.clientY - creationSession.startClientY
    if (!creationSession.moved && (Math.abs(deltaClientX) > PAN_GESTURE_THRESHOLD || Math.abs(deltaClientY) > PAN_GESTURE_THRESHOLD))
      creationSession.moved = true

    creationSession.currentX = frameContext.localX
    creationSession.currentY = frameContext.localY
    if (creationSession.tool === 'pencil') {
      const lastPoint = creationSession.points?.[creationSession.points.length - 1] || null
      if (!lastPoint || Math.hypot(frameContext.localX - lastPoint.x, frameContext.localY - lastPoint.y) >= 1) {
        creationSession.points = [
          ...(creationSession.points || []),
          { x: frameContext.localX, y: frameContext.localY },
        ]
      }
    }
    return
  }

  const rotationSession = elementRotationSession.value
  if (rotationSession && rotationSession.pointerId === event.pointerId) {
    const worldPoint = toWorldPoint(event.clientX, event.clientY)
    if (!worldPoint)
      return
    const deltaClientX = event.clientX - rotationSession.startClientX
    const deltaClientY = event.clientY - rotationSession.startClientY
    if (!rotationSession.moved && (Math.abs(deltaClientX) > PAN_GESTURE_THRESHOLD || Math.abs(deltaClientY) > PAN_GESTURE_THRESHOLD)) {
      rotationSession.moved = true
      suppressBackgroundClick.value = true
      suppressElementClick = true
    }

    const nextPointerAngle = Math.atan2(worldPoint.y - rotationSession.startCenterY, worldPoint.x - rotationSession.startCenterX)
    const rotationDelta = ((nextPointerAngle - rotationSession.startPointerAngle) * 180) / Math.PI
    rotationSession.previewRotation = normalizeRotation(rotationSession.startRotation + rotationDelta)
    scheduleTransientElementPatches({
      [rotationSession.elementId]: {
        rotation: rotationSession.previewRotation,
      },
    })
    return
  }

  const resizeSession = elementResizeSession.value
  if (resizeSession && resizeSession.pointerId === event.pointerId) {
    const deltaClientX = event.clientX - resizeSession.startClientX
    const deltaClientY = event.clientY - resizeSession.startClientY
    if (!resizeSession.moved && (Math.abs(deltaClientX) > PAN_GESTURE_THRESHOLD || Math.abs(deltaClientY) > PAN_GESTURE_THRESHOLD)) {
      resizeSession.moved = true
      suppressBackgroundClick.value = true
      suppressElementClick = true
    }

    resizeSession.previewPatch = applyElementResizeDelta(
      resizeSession,
      event.clientX,
      event.clientY,
    )
    elementGuideOverlay.value = {
      label: resizeSession.item.label,
      x: Number(resizeSession.previewPatch.x ?? resizeSession.item.x),
      y: Number(resizeSession.previewPatch.y ?? resizeSession.item.y),
      hints: [
        `栅格吸附 ${ELEMENT_SNAP_GRID_SIZE}px`,
        `W ${Number(resizeSession.previewPatch.width ?? resizeSession.item.width)} / H ${Number(resizeSession.previewPatch.height ?? resizeSession.item.height)}`,
      ],
    }
    scheduleTransientElementPatches({
      [resizeSession.item.elementId]: resizeSession.previewPatch,
    })
    return
  }

  const dragSession = elementDragSession.value
  if (dragSession && dragSession.pointerId === event.pointerId) {
    const deltaClientX = event.clientX - dragSession.startClientX
    const deltaClientY = event.clientY - dragSession.startClientY
    if (!dragSession.moved && (Math.abs(deltaClientX) > PAN_GESTURE_THRESHOLD || Math.abs(deltaClientY) > PAN_GESTURE_THRESHOLD)) {
      dragSession.moved = true
      suppressBackgroundClick.value = true
      suppressElementClick = true
    }

    if (dragSession.moved) {
      const nextDelta = resolveElementGuideAdjustment(
        dragSession,
        deltaClientX / dragSession.startZoom,
        deltaClientY / dragSession.startZoom,
      )
      dragSession.previewPatches = Object.fromEntries(
        dragSession.items.map(item => [
          item.elementId,
          resolveElementDragPatch(item, nextDelta.deltaX, nextDelta.deltaY),
        ]),
      )
      scheduleTransientElementPatches(dragSession.previewPatches)
    }
    return
  }

  const currentSelectionDraft = selectionDraft.value
  if (currentSelectionDraft && currentSelectionDraft.pointerId === event.pointerId) {
    const selecting = Math.abs(event.clientX - currentSelectionDraft.startClientX) > PAN_GESTURE_THRESHOLD
      || Math.abs(event.clientY - currentSelectionDraft.startClientY) > PAN_GESTURE_THRESHOLD
    const nextDraft: SelectionDraft = {
      ...currentSelectionDraft,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      selecting,
      previewElementIds: [],
    }
    if (selecting)
      nextDraft.previewElementIds = resolveSelectionDraftMatches(nextDraft)
    selectionDraft.value = nextDraft
    return
  }

  const session = panSession.value
  if (!session || session.pointerId !== event.pointerId)
    return

  const deltaX = event.clientX - session.startClientX
  const deltaY = event.clientY - session.startClientY
  if (!session.moved && (Math.abs(deltaX) > PAN_GESTURE_THRESHOLD || Math.abs(deltaY) > PAN_GESTURE_THRESHOLD)) {
    session.moved = true
    suppressBackgroundClick.value = true
  }

  emitViewportChange({
    x: session.startViewportX + deltaX,
    y: session.startViewportY + deltaY,
    zoom: viewport.value.zoom,
  })
}

function handlePointerUp(event: PointerEvent): void {
  if (frameResizeSession.value?.pointerId === event.pointerId) {
    const session = frameResizeSession.value
    stopFrameResize(event.pointerId)
    if (session?.moved) {
      emit('update-frame-size', {
        frameId: session.frameId,
        x: session.previewBox.x,
        y: session.previewBox.y,
        width: session.previewBox.width,
        height: session.previewBox.height,
        historyMergeKey: 'frame-resize',
      })
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
        suppressFrameClick = false
      }, 0)
    }
    return
  }

  if (frameDragSession.value?.pointerId === event.pointerId) {
    const session = frameDragSession.value
    stopFrameDrag(event.pointerId)
    clearFrameDragFeedback()
    if (session?.moved) {
      const nextPositions = session.items
        .map((item) => {
          const previewPosition = session.previewPositions[item.frameId]
          if (!previewPosition)
            return null
          return {
            frameId: item.frameId,
            x: roundMetric(previewPosition.x),
            y: roundMetric(previewPosition.y),
          }
        })
        .filter((item): item is { frameId: string, x: number, y: number } => Boolean(item))

      if (nextPositions.length === 1) {
        const position = nextPositions[0]
        if (!position)
          return
        emit('update-frame-position', {
          frameId: position.frameId,
          x: position.x,
          y: position.y,
          historyMergeKey: session.historyMergeKey,
        })
      }
      else if (nextPositions.length > 1) {
        emit('update-frame-positions', {
          positions: nextPositions,
          historyMergeKey: session.historyMergeKey,
        })
      }

      window.setTimeout(() => {
        suppressBackgroundClick.value = false
        suppressFrameClick = false
      }, 0)
    }
    else {
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
      }, 0)
    }
    return
  }

  if (autoLayoutReorderSession.value?.pointerId === event.pointerId) {
    const session = autoLayoutReorderSession.value
    stopAutoLayoutReorderSession(event.pointerId)
    if (session?.moved && session.targetIndex !== session.fromIndex) {
      emit('update-element', {
        elementId: session.elementId,
        patch: {
          zIndex: session.targetIndex,
        },
        historyMergeKey: 'element-reorder',
      })
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
        suppressFrameClick = false
        suppressElementClick = false
      }, 0)
    }
    else {
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
        suppressFrameClick = false
      }, 0)
    }
    return
  }

  if (mockupScreenDragSession.value?.pointerId === event.pointerId) {
    const session = mockupScreenDragSession.value
    flushTransientFramePatches()
    stopMockupScreenDragSession(event.pointerId, {
      preservePreview: true,
    })
    clearTransientFramePatches()
    if (session?.moved) {
      emit('update-mockup-screen-transform', {
        frameId: session.frameId,
        offsetX: session.previewOffsetX,
        offsetY: session.previewOffsetY,
        historyMergeKey: 'mockup-screen-transform',
      })
    }
    if (session?.moved) {
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
      }, 0)
    }
    else {
      suppressBackgroundClick.value = false
    }
    return
  }

  if (createElementSession.value?.pointerId === event.pointerId) {
    const session = createElementSession.value
    stopCreateElementSession(event.pointerId)
    if (session)
      emitCreateElementFromSession(session)
    window.setTimeout(() => {
      suppressBackgroundClick.value = false
    }, 0)
    return
  }

  if (elementRotationSession.value?.pointerId === event.pointerId) {
    const session = elementRotationSession.value
    flushTransientElementPatches()
    stopElementRotation(event.pointerId, {
      preservePreview: true,
    })
    clearTransientElementPatches()
    if (session?.moved) {
      emit('update-element', {
        elementId: session.elementId,
        patch: {
          rotation: session.previewRotation,
        },
        historyMergeKey: session.historyMergeKey,
      })
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
        suppressElementClick = false
      }, 0)
    }
    return
  }

  if (elementResizeSession.value?.pointerId === event.pointerId) {
    const session = elementResizeSession.value
    flushTransientElementPatches()
    stopElementResize(event.pointerId, {
      preservePreview: true,
    })
    clearTransientElementPatches()
    clearElementGuideOverlay()
    if (session?.moved && session.previewPatch) {
      emit('update-element', {
        elementId: session.item.elementId,
        patch: session.previewPatch,
        historyMergeKey: session.historyMergeKey,
      })
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
        suppressElementClick = false
      }, 0)
    }
    return
  }

  if (elementDragSession.value?.pointerId === event.pointerId) {
    const session = elementDragSession.value
    flushTransientElementPatches()
    stopElementDrag(event.pointerId, {
      preservePreview: true,
    })
    clearTransientElementPatches()
    clearElementGuideOverlay()
    if (session?.moved) {
      const patches = session.items
        .map((item) => {
          const patch = session.previewPatches[item.elementId]
          if (!patch)
            return null
          return {
            elementId: item.elementId,
            patch,
          }
        })
        .filter((item): item is { elementId: string, patch: Partial<DesignElementModel> } => Boolean(item))
      if (patches.length > 0) {
        emit('update-elements', {
          patches,
          historyMergeKey: session.historyMergeKey,
        })
      }
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
        suppressFrameClick = false
        suppressElementClick = false
      }, 0)
    }
    else {
      window.setTimeout(() => {
        suppressBackgroundClick.value = false
        suppressFrameClick = false
      }, 0)
    }
    return
  }

  if (selectionDraft.value?.pointerId === event.pointerId) {
    const draft = selectionDraft.value
    stopSelectionDraft(event.pointerId)
    if (draft?.selecting) {
      const previewIds = draft.previewElementIds
      const nextIds = draft.additive
        ? Array.from(new Set([
            ...(props.selectionState.scope === 'element' ? props.selectionState.elementIds : []),
            ...previewIds,
          ]))
        : previewIds
      const anchorItem = nextIds.length > 0
        ? editingElementHitItems.value.find(item => item.element.id === (nextIds[nextIds.length - 1] || '')) || null
        : null
      if (anchorItem)
        emitElementSelection(anchorItem, nextIds, { primaryElementId: nextIds[nextIds.length - 1] || '' })
      else
        emitClearedElementSelection()
    }
    else {
      if (groupEditSession.value) {
        closeGroupEditSession({
          selectGroup: true,
        })
      }
      else {
        emitClearedElementSelection()
      }
    }
    window.setTimeout(() => {
      suppressBackgroundClick.value = false
    }, 0)
    return
  }

  if (panSession.value?.pointerId === event.pointerId) {
    stopPan(event.pointerId)
    window.setTimeout(() => {
      suppressBackgroundClick.value = false
    }, 0)
  }
}

function handlePointerLeave(): void {
  localPointerScreen.value = null
  emit('updateCollabCursor', {})
}

function handleWheel(event: WheelEvent): void {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect)
    return

  if (event.ctrlKey || event.metaKey) {
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const worldX = (pointerX - viewport.value.x) / viewport.value.zoom
    const worldY = (pointerY - viewport.value.y) / viewport.value.zoom
    const zoomFactor = Math.exp(-event.deltaY * 0.0025)
    const nextZoom = clampCanvasZoom(viewport.value.zoom * zoomFactor)
    emitViewportChange({
      x: pointerX - worldX * nextZoom,
      y: pointerY - worldY * nextZoom,
      zoom: nextZoom,
    })
    return
  }

  emitViewportChange({
    x: viewport.value.x - event.deltaX,
    y: viewport.value.y - event.deltaY,
    zoom: viewport.value.zoom,
  })
}

function handleBackgroundClick(): void {
  if (suppressBackgroundClick.value || props.disabled || selectionDraft.value)
    return
  if (groupEditSession.value) {
    closeGroupEditSession({
      selectGroup: true,
    })
    return
  }
  emitClearedElementSelection()
}

function handleFrameClick(frame: DesignFrameModel, event: MouseEvent): void {
  if (suppressFrameClick)
    return
  if (!frameSelectionEnabled.value)
    return

  const additive = event.shiftKey
  const currentFrameIds = props.selectionState.scope === 'frame'
    ? props.selectionState.frameIds
    : []
  const nextFrameIds = additive
    ? Array.from(new Set([...currentFrameIds, frame.id]))
    : [frame.id]

  emitFrameSelection(nextFrameIds, frame.id)
}

function handleFramePointerDown(frame: DesignFrameModel, event: PointerEvent): void {
  if (props.disabled)
    return

  if (event.button === 1 || props.interactionContext.effectiveTool === 'hand') {
    focusCanvas()
    startPan(event)
    return
  }

  const creationTool = activeCreateElementTool.value
  const pendingImagePlacement = pendingImagePlacementState.value
  if (pendingImagePlacement && event.button === 0 && !props.mockupScreenEditingFrameId) {
    const worldPoint = toWorldPoint(event.clientX, event.clientY)
    if (!worldPoint)
      return

    const ownerFrame = props.frameOwnerFrames[frame.id] || frame
    const frameContext = resolveCreateSessionFrameContextForFrame(
      frame,
      ownerFrame,
      {
        worldX: worldPoint.x,
        worldY: worldPoint.y,
        allowAutoLayout: true,
      },
    )
    if (!frameContext)
      return

    emitFrameEditingSelection(frameContext)
    beginCreateElementSession(frameContext, 'image', event, {
      imagePlacement: pendingImagePlacement,
    })
    return
  }
  if (creationTool && event.button === 0 && !props.mockupScreenEditingFrameId) {
    const worldPoint = toWorldPoint(event.clientX, event.clientY)
    if (!worldPoint)
      return

    const ownerFrame = props.frameOwnerFrames[frame.id] || frame
    const frameContext = resolveCreateSessionFrameContextForFrame(
      frame,
      ownerFrame,
      {
        worldX: worldPoint.x,
        worldY: worldPoint.y,
        allowAutoLayout: false,
      },
    )
    if (!frameContext)
      return

    emitFrameEditingSelection(frameContext)
    beginCreateElementSession(frameContext, creationTool, event)
    return
  }

  if (!frameSelectionEnabled.value || event.button !== 0 || event.shiftKey)
    return

  suppressBackgroundClick.value = true
  focusCanvas()
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })
  emitPointerCursor(event.clientX, event.clientY)

  const currentFrameIds = props.selectionState.scope === 'frame'
    ? props.selectionState.frameIds
    : []
  const isSelected = currentFrameIds.includes(frame.id)
  if (!isSelected)
    emitFrameSelection([frame.id], frame.id)
  if (frame.locked) {
    window.setTimeout(() => {
      suppressBackgroundClick.value = false
    }, 0)
    return
  }

  const dragFrameIds = isSelected
    ? currentFrameIds
    : [frame.id]
  const dragFrames = dragFrameIds
    .map(frameId => normalizedFrames.value.find(item => item.id === frameId) || null)
    // Regression contract: filter((item): item is DesignFrameModel => Boolean(item) && !item.locked)
    .filter((item): item is DesignFrameModel => item !== null && !item.locked)
  if (!dragFrames.length) {
    window.setTimeout(() => {
      suppressBackgroundClick.value = false
    }, 0)
    return
  }

  event.preventDefault()
  rootRef.value?.setPointerCapture?.(event.pointerId)
  frameDragSession.value = {
    pointerId: event.pointerId,
    primaryFrameId: frame.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false,
    historyMergeKey: `frame-drag:${Date.now()}:${dragFrames.map(item => item.id).join(',')}`,
    items: dragFrames.map(item => ({
      frameId: item.id,
      label: normalizeString(item.name) || item.id,
      startX: item.x,
      startY: item.y,
      width: Math.max(1, item.width),
      height: Math.max(1, item.height),
    })),
    previewPositions: Object.fromEntries(
      dragFrames.map(item => [
        item.id,
        {
          x: roundMetric(item.x),
          y: roundMetric(item.y),
        },
      ]),
    ),
  }
  clearFrameDragFeedback()
}

function handleFrameDoubleClick(frame: DesignFrameModel, event: MouseEvent): void {
  if (props.disabled)
    return

  if (frame.kind === 'diagram') {
    emit('open-frame', frame.id)
    return
  }

  if (frame.kind === 'device_mockup') {
    emit('edit-mockup-screen', {
      frameId: frame.id,
    })
    return
  }

  const ownerFrame = props.frameOwnerFrames[frame.id] || frame
  if (!canDesignFrameCreateElements(ownerFrame))
    return

  const worldPoint = toWorldPoint(event.clientX, event.clientY)
  const hitItem = worldPoint
    ? resolveFrameElementHitItems(frame, ownerFrame)
      .filter(item => !item.element.hidden && !item.element.locked)
      .sort((left, right) => Number(right.element.zIndex || 0) - Number(left.element.zIndex || 0))
      .find((item) => {
        return worldPoint.x >= item.rect.x
          && worldPoint.x <= item.rect.x + item.rect.width
          && worldPoint.y >= item.rect.y
          && worldPoint.y <= item.rect.y + item.rect.height
      }) || null
    : null

  if (hitItem) {
    emitElementSelection(hitItem, [hitItem.element.id], {
      primaryElementId: hitItem.element.id,
    })
    return
  }

  emit('request-deep-selection', {
    ownerFrameId: ownerFrame.id,
    ownerPageId: normalizeString(ownerFrame.pageId),
    displayFrameId: frame.id,
  })
}

function handleElementClick(item: ElementHitItem, event: MouseEvent): void {
  if (suppressElementClick)
    return
  if (!elementSelectionEnabled.value)
    return

  if (groupEditSession.value && item.element.type === 'group') {
    beginGroupEditSession(item)
    return
  }

  const currentIds = props.selectionState.scope === 'element'
    ? props.selectionState.elementIds
    : []
  const additive = event.shiftKey
  const nextIds = additive
    ? currentIds.includes(item.element.id)
      ? currentIds.filter(id => id !== item.element.id)
      : [...currentIds, item.element.id]
    : [item.element.id]

  emit('update-selection', {
    scope: nextIds.length > 0 ? 'element' : 'none',
    editingFrameId: item.ownerFrameId,
    displayFrameId: item.displayFrameId,
    frameIds: [],
    primaryFrameId: '',
    elementIds: nextIds,
    primaryElementId: nextIds.length > 0 ? item.element.id : '',
  })
}

function handleOverflowElementClick(item: ElementHitItem): void {
  const ownerFrameId = normalizeString(item.ownerFrameId)
  const displayFrameId = normalizeString(item.displayFrameId)
  if (!ownerFrameId || !displayFrameId)
    return

  emit('update-selection', {
    scope: 'element',
    editingFrameId: ownerFrameId,
    displayFrameId,
    frameIds: [],
    primaryFrameId: '',
    elementIds: [item.element.id],
    primaryElementId: item.element.id,
  })
  window.setTimeout(() => {
    suppressBackgroundClick.value = false
    suppressFrameClick = false
  }, 0)
}

function handleTextEditorInput(event: Event): void {
  if (!textEditSession.value)
    return
  textEditSession.value = {
    ...textEditSession.value,
    draftText: (event.target as HTMLTextAreaElement).value,
  }
}

function handleTextEditorBlur(): void {
  closeTextEditSession({ commit: true })
}

function handleTextEditorKeydown(event: KeyboardEvent): void {
  if (!textEditSession.value)
    return

  const key = normalizeString(event.key).toLowerCase()
  if (key === 'escape') {
    event.preventDefault()
    closeTextEditSession({ commit: false })
    focusCanvas()
    return
  }

  if ((event.metaKey || event.ctrlKey) && (key === 'enter' || key === 'return')) {
    event.preventDefault()
    closeTextEditSession({ commit: true })
    focusCanvas()
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.disabled || isEditableKeyboardTarget(event.target))
    return

  const key = normalizeString(event.key).toLowerCase()
  const metaOrCtrl = event.metaKey || event.ctrlKey

  if (key === 'escape' && pendingImagePlacementState.value) {
    event.preventDefault()
    stopCreateElementSession()
    emit('clear-pending-image-placement')
    return
  }

  if (key === 'escape' && groupEditSession.value) {
    event.preventDefault()
    closeGroupEditSession({
      selectGroup: true,
    })
    return
  }

  if (activeCreateElementTool.value || pendingImagePlacementState.value || textEditSession.value)
    return

  if (props.selectionState.scope === 'element' && props.selectionState.elementIds.length > 0) {
    const movableItems = props.selectionState.elementIds
      .map(elementId => editingElementHitItems.value.find(item => item.element.id === elementId) || null)
      .filter((item): item is ElementHitItem => Boolean(item))
    const nudgeItems = resolveExpandedDragItems(movableItems)

    if (key === 'backspace' || key === 'delete') {
      event.preventDefault()
      emit('delete-element')
      return
    }

    if (metaOrCtrl && key === 'd') {
      event.preventDefault()
      emit('duplicate-element')
      return
    }

    if (!key.startsWith('arrow') || !nudgeItems.length || currentEditingOwnerFrameAutoLayout.value)
      return

    event.preventDefault()
    const step = event.shiftKey ? CANVAS_GRID_NUDGE_STEP : CANVAS_NUDGE_STEP
    const deltaX = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
    const deltaY = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
    emit('update-elements', {
      patches: nudgeItems.map((item) => {
        return {
          elementId: item.elementId,
          patch: resolveElementDragPatch(item, deltaX, deltaY),
        }
      }),
      historyMergeKey: 'element-nudge',
    })
    revealZoomControl({
      collapseAfterIdle: true,
      ignoreHover: true,
    })
    return
  }

  if (props.selectionState.scope !== 'frame' || !props.selectionState.frameIds.length)
    return

  const selectedFrames = normalizedFrames.value.filter(frame => props.selectionState.frameIds.includes(frame.id))
  if (!selectedFrames.length)
    return

  const primarySelectedFrame = selectedFrames.find(frame => frame.id === normalizeString(props.selectionState.primaryFrameId))
    || selectedFrames[0]
    || null
  const movableFrames = selectedFrames.filter(frame => !frame.locked)

  if (key === 'backspace' || key === 'delete') {
    event.preventDefault()
    emit('delete-frame')
    return
  }

  if ((key === 'enter' || key === 'return') && selectedFrames.length === 1 && primarySelectedFrame?.kind === 'diagram') {
    event.preventDefault()
    emit('open-frame', primarySelectedFrame.id)
    return
  }

  if (metaOrCtrl && key === 'd') {
    event.preventDefault()
    emit('duplicate-frame')
    return
  }

  if (!key.startsWith('arrow') || !movableFrames.length)
    return

  event.preventDefault()
  const step = event.shiftKey ? CANVAS_GRID_NUDGE_STEP : CANVAS_NUDGE_STEP
  const deltaX = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
  const deltaY = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
  emit('update-frame-positions', {
    positions: movableFrames.map(frame => ({
      frameId: frame.id,
      x: Math.round(frame.x + deltaX),
      y: Math.round(frame.y + deltaY),
    })),
    historyMergeKey: 'frame-nudge',
  })
  revealZoomControl({
    collapseAfterIdle: true,
    ignoreHover: true,
  })
}
</script>

<template>
  <div
    ref="rootRef"
    class="workspace-design-canvaskit-host outline-none rounded-[28px] h-full min-h-0 w-full relative overflow-hidden touch-none"
    :class="stageCursorClass"
    :data-zoom-state="zoomControlState"
    :style="{
      ...canvasChromeStyle,
      backgroundColor: workspaceBackground,
    }"
    data-testid="workspace-design-canvaskit-host"
    tabindex="0"
    @click.self="handleBackgroundClick"
    @keydown="handleKeydown"
    @pointerdown="handleStagePointerDown"
    @pointerleave="handlePointerLeave"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
    @wheel.prevent="handleWheel"
  >
    <div class="bg-[linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:32px_32px] opacity-60 pointer-events-none inset-0 absolute" />

    <div class="inset-0 absolute overflow-visible" :style="viewportLayerStyle">
      <div
        v-if="!normalizedFrames.length && !pageRootElementPreviewItems.length"
        class="border border-slate-300/70 rounded-[32px] border-dashed bg-white/72 pointer-events-none shadow-[0_24px_60px_rgba(15,23,42,0.08)] absolute overflow-hidden"
        :style="stageContentBoundsStyle"
      >
        <div class="flex h-full w-full items-center justify-center">
          <div class="text-center max-w-sm">
            <p class="text-xs text-sky-600 tracking-[0.16em] font-semibold uppercase">
              CanvasKit Host
            </p>
            <p class="text-lg text-slate-900 font-semibold mt-3">
              当前页面还没有可渲染的 Frame
            </p>
            <p class="text-sm text-slate-500 leading-6 mt-2">
              这一版 host 已脱离 Vue Flow，后续会在这里补独立图元编辑和客户端导出。
            </p>
          </div>
        </div>
      </div>

      <div
        v-for="item in pageRootElementPreviewItems"
        :key="item.key"
        class="pointer-events-none select-none absolute"
        :style="resolvePageRootElementStyle(item)"
      >
        <div
          v-if="item.element.type === 'text' || item.element.type === 'caption' || item.element.type === 'badge'"
          class="h-full w-full"
          :style="resolvePageRootElementTextStyle(item)"
        >
          {{ item.element.text }}
        </div>

        <svg
          v-else
          class="h-full w-full"
          :viewBox="resolvePageRootElementSvgViewBox(item)"
          preserveAspectRatio="none"
          :style="resolvePageRootElementSvgStyle(item)"
        >
          <template v-if="item.element.type === 'shape'">
            <ellipse
              v-if="resolvePageRootElementPresentation(item).shapeKind === 'ellipse' || resolvePageRootElementPresentation(item).shapeKind === 'circle'"
              :cx="resolvePageRootElementPresentation(item).width / 2"
              :cy="resolvePageRootElementPresentation(item).height / 2"
              :rx="resolvePageRootElementPresentation(item).width / 2"
              :ry="resolvePageRootElementPresentation(item).height / 2"
              :fill="resolvePageRootElementPresentation(item).fill"
              :stroke="resolvePageRootElementPresentation(item).stroke"
              :stroke-width="resolvePageRootElementPresentation(item).strokeWidth"
            />
            <g v-else-if="resolvePageRootElementPresentation(item).shapeKind === 'arrow'">
              <line
                x1="0"
                :y1="resolvePageRootElementPresentation(item).height / 2"
                :x2="resolvePageRootElementPresentation(item).width"
                :y2="resolvePageRootElementPresentation(item).height / 2"
                :stroke="resolvePageRootElementPresentation(item).stroke"
                :stroke-width="resolvePageRootElementPresentation(item).strokeWidth"
                stroke-linecap="round"
              />
              <path
                :d="`M ${resolvePageRootElementPresentation(item).width - Math.max(12, Math.min(32, resolvePageRootElementPresentation(item).height * 0.35))} ${resolvePageRootElementPresentation(item).height / 2 - Math.max(12, Math.min(32, resolvePageRootElementPresentation(item).height * 0.35)) * 0.7} L ${resolvePageRootElementPresentation(item).width} ${resolvePageRootElementPresentation(item).height / 2} L ${resolvePageRootElementPresentation(item).width - Math.max(12, Math.min(32, resolvePageRootElementPresentation(item).height * 0.35))} ${resolvePageRootElementPresentation(item).height / 2 + Math.max(12, Math.min(32, resolvePageRootElementPresentation(item).height * 0.35)) * 0.7}`"
                fill="none"
                :stroke="resolvePageRootElementPresentation(item).stroke"
                :stroke-width="resolvePageRootElementPresentation(item).strokeWidth"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </g>
            <rect
              v-else
              x="0"
              y="0"
              :width="resolvePageRootElementPresentation(item).width"
              :height="resolvePageRootElementPresentation(item).height"
              :rx="resolvePageRootElementPresentation(item).borderRadius"
              :ry="resolvePageRootElementPresentation(item).borderRadius"
              :fill="resolvePageRootElementPresentation(item).fill"
              :stroke="resolvePageRootElementPresentation(item).stroke"
              :stroke-width="resolvePageRootElementPresentation(item).strokeWidth"
            />
          </template>

          <template v-else-if="item.element.type === 'image'">
            <image
              v-if="item.element.imageSrc"
              :href="item.element.imageSrc"
              x="0"
              y="0"
              :width="item.rect.width"
              :height="item.rect.height"
              preserveAspectRatio="xMidYMid slice"
            />
            <rect
              v-else
              x="0"
              y="0"
              :width="item.rect.width"
              :height="item.rect.height"
              rx="18"
              ry="18"
              fill="#cbd5e1"
            />
          </template>

          <polyline
            v-else-if="item.element.type === 'path'"
            :points="resolvePageRootPathSvgPoints(item)"
            fill="none"
            :stroke="resolvePageRootElementPresentation(item).stroke"
            :stroke-width="resolvePageRootElementPresentation(item).strokeWidth"
            :stroke-linecap="resolvePageRootPathStrokeLineCap(item)"
            :stroke-linejoin="resolvePageRootPathStrokeLineJoin(item)"
          />
        </svg>
      </div>

      <div
        v-for="frame in normalizedFrames"
        :key="`frame-surface-${frame.id}`"
        class="workspace-design-canvaskit-host__frame-surface pointer-events-none absolute overflow-hidden"
        :style="resolveFrameSurfaceStyle(frame)"
        v-html="framePreviewMarkupById.get(frame.id) || ''"
      />

      <div
        v-for="frame in normalizedFrames"
        :key="`frame-title-${frame.id}`"
        class="text-[12px] leading-none tracking-[0.01em] font-medium pointer-events-none truncate absolute"
        :style="resolveFrameTitleStyle(frame)"
      >
        {{ frame.name }}
      </div>

      <div
        v-if="createElementPreviewRectStyle"
        class="border-2 border-sky-500/80 border-dashed bg-sky-200/10 pointer-events-none absolute"
        :style="createElementPreviewRectStyle"
        data-testid="workspace-design-canvaskit-create-preview"
      >
        <div
          v-if="createElementSession?.tool === 'text' || createElementSession?.tool === 'image'"
          class="text-[11px] text-sky-700 font-semibold px-2 py-1 rounded-full bg-sky-500/12 left-3 top-3 absolute"
        >
          {{ createElementSession?.tool === 'image' ? '放置图片' : '新建文本' }}
        </div>
      </div>

      <svg
        v-if="createElementPreviewArrow"
        class="pointer-events-none absolute overflow-visible"
        :style="createElementPreviewArrow.style"
        data-testid="workspace-design-canvaskit-create-arrow-preview"
      >
        <line
          :x1="createElementPreviewArrow.line.x1"
          :y1="createElementPreviewArrow.line.y1"
          :x2="createElementPreviewArrow.line.x2"
          :y2="createElementPreviewArrow.line.y2"
          stroke="#0f172a"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <polyline
          :points="createElementPreviewArrow.head"
          fill="none"
          stroke="#0f172a"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <svg
        v-if="createElementPreviewPath"
        class="pointer-events-none absolute overflow-visible"
        :style="createElementPreviewPath.style"
        data-testid="workspace-design-canvaskit-create-path-preview"
      >
        <polyline
          :points="createElementPreviewPath.points"
          fill="none"
          stroke="#0f172a"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <div
        v-if="activeMockupScreenRectStyle"
        class="border border-sky-400/80 rounded-[22px] border-dashed bg-sky-300/10 pointer-events-none shadow-[0_0_0_1px_rgba(255,255,255,0.8)_inset] absolute"
        :style="activeMockupScreenRectStyle"
        data-testid="workspace-design-canvaskit-mockup-screen"
      />

      <div
        v-if="elementGuideVerticalStyle"
        class="bg-sky-400/80 w-px pointer-events-none absolute z-[132]"
        :style="elementGuideVerticalStyle"
        data-testid="workspace-design-canvaskit-element-guide-vertical"
      />

      <div
        v-if="elementGuideHorizontalStyle"
        class="bg-sky-400/80 h-px pointer-events-none absolute z-[132]"
        :style="elementGuideHorizontalStyle"
        data-testid="workspace-design-canvaskit-element-guide-horizontal"
      />

      <div
        v-if="elementGuideOverlay && elementGuideOverlayChipStyle"
        class="text-[11px] text-slate-200 px-3 py-2 border border-slate-900/90 rounded-xl bg-slate-950/88 min-w-[180px] pointer-events-none shadow-[0_18px_48px_rgba(2,6,23,0.28)] absolute z-[135]"
        :style="elementGuideOverlayChipStyle"
        data-testid="workspace-design-canvaskit-element-guide-overlay"
      >
        <div class="flex gap-3 items-center justify-between">
          <span class="text-white font-semibold">{{ elementGuideOverlay.label }}</span>
          <span class="text-sky-200 font-semibold px-2 py-0.5 border border-sky-800 rounded-full bg-sky-950/40">
            X {{ elementGuideOverlay.x }} / Y {{ elementGuideOverlay.y }}
          </span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="hint in elementGuideOverlay.hints"
            :key="`${elementGuideOverlay.label}-${hint}`"
            class="text-[10px] text-slate-300 font-semibold px-2 py-1 border border-slate-800 rounded-full bg-slate-900"
          >
            {{ hint }}
          </span>
        </div>
      </div>

      <div
        v-if="autoLayoutInsertionIndicatorStyle"
        class="rounded-full bg-sky-500 pointer-events-none shadow-[0_0_0_2px_rgba(125,211,252,0.22)] absolute z-[134]"
        :style="autoLayoutInsertionIndicatorStyle"
        data-testid="workspace-design-canvaskit-autolayout-indicator"
      />

      <div
        v-for="grid in visibleFrameGrids"
        :key="`frame-grid-${grid.frame.id}`"
        class="pointer-events-none absolute"
        :style="{
          left: `${roundMetric(grid.frameBox.x)}px`,
          top: `${roundMetric(grid.frameBox.y)}px`,
          width: `${roundMetric(grid.frameBox.width)}px`,
          height: `${roundMetric(grid.frameBox.height)}px`,
        }"
        data-testid="workspace-design-canvaskit-frame-guides"
      >
        <div class="border border-sky-400/20 inset-0 absolute" :style="{ borderRadius: `${resolveDesignFrameSurfaceRadius(grid.frame)}px` }" />
        <div
          v-for="guide in grid.columnGuides"
          :key="`column-${grid.frame.id}-${guide}`"
          class="border-l border-sky-400/30 border-dashed inset-y-0 absolute"
          :style="{ left: `${roundMetric(guide - grid.frameBox.x)}px` }"
        />
        <div
          v-for="guide in grid.rowGuides"
          :key="`row-${grid.frame.id}-${guide}`"
          class="border-t border-sky-400/25 border-dashed inset-x-0 absolute"
          :style="{ top: `${roundMetric(guide - grid.frameBox.y)}px` }"
        />
      </div>

      <button
        v-for="item in overflowFrameElementHitItems"
        :key="`overflow-element-${item.element.id}`"
        class="border border-transparent bg-transparent absolute focus:outline-none"
        :style="resolveOverflowElementHitBoxStyle(item)"
        data-canvas-role="element-hit"
        data-testid="workspace-design-canvaskit-overflow-element-hit"
        type="button"
        @pointerdown.stop.prevent="handleOverflowElementPointerDown()"
        @click.stop="handleOverflowElementClick(item)"
      >
        <span class="sr-only">{{ item.element.id }}</span>
      </button>

      <button
        v-for="frame in normalizedFrames"
        :key="frame.id"
        class="border bg-transparent transition-[box-shadow,border-color] absolute focus:outline-none"
        :class="{ 'pointer-events-none': createElementEnabled || Boolean(props.mockupScreenEditingFrameId) || Boolean(props.selectionState.editingFrameId) }"
        :style="resolveFrameHitBoxStyle(frame)"
        data-canvas-role="frame-hit"
        type="button"
        @pointerdown.stop="handleFramePointerDown(frame, $event)"
        @click.stop="handleFrameClick(frame, $event)"
        @dblclick.stop="handleFrameDoubleClick(frame, $event)"
      >
        <span class="sr-only">{{ frame.name }}</span>
      </button>

      <button
        v-for="item in editingElementHitItems"
        :key="item.element.id"
        class="border border-transparent rounded-[18px] bg-transparent transition-[box-shadow,border-color,background-color] absolute focus:outline-none hover:border-sky-300/60"
        :class="{ 'pointer-events-none': Boolean(activeCreateElementTool) || Boolean(props.mockupScreenEditingFrameId) || Boolean(pendingImagePlacementState) }"
        :style="resolveElementHitBoxStyle(item)"
        data-canvas-role="element-hit"
        data-testid="workspace-design-canvaskit-element-hit"
        type="button"
        @pointerdown.stop="handleElementPointerDown(item, $event)"
        @click.stop="handleElementClick(item, $event)"
        @dblclick.stop="handleElementDoubleClick(item)"
      >
        <span class="sr-only">{{ item.element.id }}</span>
      </button>

      <div
        v-if="elementResizeEnabled && primaryEditingElementHitItem"
        class="pointer-events-none absolute"
        :style="resolveElementResizeHandleStyle(primaryEditingElementHitItem)"
        data-testid="workspace-design-canvaskit-element-resize"
      >
        <button
          class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-w-resize pointer-events-auto shadow-sm top-1/2 absolute -translate-y-1/2 -left-1.5"
          type="button"
          @pointerdown.stop.prevent="handleElementResizePointerDown('w', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-e-resize pointer-events-auto shadow-sm top-1/2 absolute -translate-y-1/2 -right-1.5"
          type="button"
          @pointerdown.stop.prevent="handleElementResizePointerDown('e', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-n-resize pointer-events-auto shadow-sm left-1/2 absolute -translate-x-1/2 -top-1.5"
          type="button"
          @pointerdown.stop.prevent="handleElementResizePointerDown('n', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-s-resize pointer-events-auto shadow-sm left-1/2 absolute -translate-x-1/2 -bottom-1.5"
          type="button"
          @pointerdown.stop.prevent="handleElementResizePointerDown('s', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-nw-resize pointer-events-auto shadow-sm absolute -left-1.5 -top-1.5"
          type="button"
          @pointerdown.stop.prevent="handleElementResizePointerDown('nw', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-ne-resize pointer-events-auto shadow-sm absolute -right-1.5 -top-1.5"
          type="button"
          @pointerdown.stop.prevent="handleElementResizePointerDown('ne', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-sw-resize pointer-events-auto shadow-sm absolute -bottom-1.5 -left-1.5"
          type="button"
          @pointerdown.stop.prevent="handleElementResizePointerDown('sw', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-3.5 w-3.5 cursor-se-resize pointer-events-auto shadow-sm absolute -bottom-1.5 -right-1.5"
          type="button"
          @pointerdown.stop.prevent="handleElementResizePointerDown('se', $event)"
        />
      </div>

      <div
        v-if="elementTransformBoxStyle && rotateHandleStyle"
        class="pointer-events-none absolute"
        :style="elementTransformBoxStyle"
        data-testid="workspace-design-canvaskit-element-rotate"
      >
        <div class="border border-sky-400/70 rounded-[16px] shadow-[0_0_0_1px_rgba(14,165,233,0.16)] inset-0 absolute" />
        <div class="bg-sky-400/80 h-7 w-px left-1/2 top-0 absolute -translate-x-1/2 -translate-y-full" />
        <button
          class="border-2 border-white rounded-full bg-sky-500 h-4 w-4 cursor-grab pointer-events-auto shadow-sm absolute active:cursor-grabbing"
          type="button"
          :style="rotateHandleStyle"
          @pointerdown.stop.prevent="handleElementRotatePointerDown($event)"
        />
      </div>

      <div
        v-if="frameResizeTarget && frameResizeOutlineStyle"
        class="pointer-events-none absolute"
        :style="frameResizeOutlineStyle"
        data-testid="workspace-design-canvaskit-frame-resize"
      >
        <div class="border border-sky-500/80 shadow-[0_0_0_1px_rgba(14,165,233,0.18)] inset-0 absolute" :style="{ borderRadius: `${resolveDesignFrameSurfaceRadius(frameResizeTarget.frame)}px` }" />
        <button
          class="border border-white rounded-full bg-sky-500 h-4 w-4 cursor-w-resize pointer-events-auto shadow-sm top-1/2 absolute -translate-y-1/2 -left-2"
          type="button"
          @pointerdown.stop.prevent="handleFrameResizePointerDown('w', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-4 w-4 cursor-e-resize pointer-events-auto shadow-sm top-1/2 absolute -translate-y-1/2 -right-2"
          type="button"
          @pointerdown.stop.prevent="handleFrameResizePointerDown('e', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-4 w-4 cursor-n-resize pointer-events-auto shadow-sm left-1/2 absolute -translate-x-1/2 -top-2"
          type="button"
          @pointerdown.stop.prevent="handleFrameResizePointerDown('n', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-4 w-4 cursor-s-resize pointer-events-auto shadow-sm left-1/2 absolute -translate-x-1/2 -bottom-2"
          type="button"
          @pointerdown.stop.prevent="handleFrameResizePointerDown('s', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-4 w-4 cursor-nw-resize pointer-events-auto shadow-sm absolute -left-2 -top-2"
          type="button"
          @pointerdown.stop.prevent="handleFrameResizePointerDown('nw', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-4 w-4 cursor-ne-resize pointer-events-auto shadow-sm absolute -right-2 -top-2"
          type="button"
          @pointerdown.stop.prevent="handleFrameResizePointerDown('ne', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-4 w-4 cursor-sw-resize pointer-events-auto shadow-sm absolute -bottom-2 -left-2"
          type="button"
          @pointerdown.stop.prevent="handleFrameResizePointerDown('sw', $event)"
        />
        <button
          class="border border-white rounded-full bg-sky-500 h-4 w-4 cursor-se-resize pointer-events-auto shadow-sm absolute -bottom-2 -right-2"
          type="button"
          @pointerdown.stop.prevent="handleFrameResizePointerDown('se', $event)"
        />
      </div>
    </div>

    <div
      v-if="selectionDraftRectStyle"
      class="border-2 border-sky-500/80 border-dashed bg-sky-200/10 pointer-events-none absolute"
      :style="selectionDraftRectStyle"
      data-testid="workspace-design-canvaskit-selection-preview"
    />

    <div
      v-if="frameDragFeedback"
      class="text-[11px] text-slate-300 px-3 py-2 border border-slate-900/90 rounded-2xl bg-slate-950/90 min-w-[240px] pointer-events-none shadow-[0_18px_48px_rgba(2,6,23,0.28)] right-6 top-6 absolute z-[180] backdrop-blur-xl"
      data-testid="workspace-design-canvaskit-frame-feedback"
    >
      <div class="flex gap-3 items-center justify-between">
        <span class="text-slate-100 font-semibold">Frame · {{ frameDragFeedback.label }}</span>
        <span class="text-sky-200 font-semibold px-2 py-0.5 border border-sky-800 rounded-full bg-sky-950/40">
          X {{ frameDragFeedback.x }} / Y {{ frameDragFeedback.y }}
        </span>
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <span
          v-for="hint in frameDragFeedback.hints"
          :key="`${frameDragFeedback.frameId}-${hint}`"
          class="text-[10px] text-slate-300 font-semibold px-2 py-1 border border-slate-800 rounded-full bg-slate-900"
        >
          {{ hint }}
        </span>
      </div>
    </div>

    <textarea
      v-if="textEditSession && textEditStyle"
      ref="textEditorRef"
      class="workspace-design-canvaskit-host__text-editor text-slate-900 p-3 outline-none border border-sky-300/70 bg-white/96 resize-none shadow-[0_20px_40px_rgba(15,23,42,0.16)] absolute z-[220]"
      :style="textEditStyle"
      :value="textEditSession.draftText"
      data-testid="workspace-design-canvaskit-text-editor"
      spellcheck="false"
      @pointerdown.stop
      @click.stop
      @input="handleTextEditorInput"
      @keydown.stop="handleTextEditorKeydown"
      @blur="handleTextEditorBlur"
    />

    <div
      class="workspace-design-canvaskit-host__chrome"
      :data-zoom-state="zoomControlState"
      :style="canvasChromeStyle"
      data-canvas-role="chrome"
    >
      <div
        ref="minimapRef"
        class="workspace-design-canvaskit-host__minimap"
        data-testid="workspace-design-canvaskit-minimap"
        @pointerenter="handleZoomControlPointerEnter"
        @pointermove="handleZoomControlPointerMove"
        @pointerleave="handleZoomControlPointerLeave"
        @pointerdown.stop.prevent="handleMinimapPointerDown"
        @pointermove.stop.prevent="handleMinimapPointerMove"
        @pointerup.stop.prevent="handleMinimapPointerUp"
        @pointercancel.stop.prevent="handleMinimapPointerUp"
      >
        <div class="workspace-design-canvaskit-host__minimap-surface">
          <div
            class="workspace-design-canvaskit-host__minimap-page"
            :style="minimapPageStyle"
          />
          <div
            v-for="frameItem in minimapFrameItems"
            :key="frameItem.id"
            class="workspace-design-canvaskit-host__minimap-frame"
            :class="`workspace-design-canvaskit-host__minimap-frame--${frameItem.state}`"
            :style="frameItem.style"
            :title="frameItem.label"
          />
          <div
            class="workspace-design-canvaskit-host__minimap-viewport"
            :style="minimapViewportStyle"
          />
        </div>
      </div>

      <div class="workspace-design-canvaskit-host__zoom-anchor">
        <div
          class="workspace-design-canvaskit-host__zoom-shell"
          data-testid="workspace-design-canvaskit-zoom-hud"
          :data-state="zoomControlState"
          @pointerenter="handleZoomControlPointerEnter"
          @pointermove="handleZoomControlPointerMove"
          @pointerleave="handleZoomControlPointerLeave"
          @focusin="handleZoomControlFocusIn"
          @focusout="handleZoomControlFocusOut"
          @click.stop="handleZoomControlShellClick"
        >
          <div
            class="workspace-design-canvaskit-host__zoom-collapsed-track"
            aria-hidden="true"
          >
            <span
              class="workspace-design-canvaskit-host__zoom-collapsed-indicator"
              :style="zoomCollapsedIndicatorStyle"
            />
          </div>

          <button
            class="workspace-design-canvaskit-host__zoom-button"
            type="button"
            title="缩小画布"
            aria-label="缩小画布"
            @click.stop="adjustCanvasZoom(-CANVAS_ZOOM_STEP)"
          >
            <span class="material-symbols-outlined text-[18px]">remove</span>
          </button>

          <div
            class="workspace-design-canvaskit-host__zoom-range-shell"
            :style="zoomRangeStyle"
          >
            <button
              class="workspace-design-canvaskit-host__zoom-label"
              type="button"
              :title="`切换到 ${nextQuickZoomPreset}%`"
              :aria-label="`快速切换到 ${nextQuickZoomPreset}%`"
              @click.stop="cycleQuickZoomPreset"
            >
              {{ zoomDisplayText }}
            </button>
          </div>

          <button
            class="workspace-design-canvaskit-host__zoom-button"
            type="button"
            title="放大画布"
            aria-label="放大画布"
            @click.stop="adjustCanvasZoom(CANVAS_ZOOM_STEP)"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
          </button>

          <button
            class="workspace-design-canvaskit-host__zoom-fit"
            type="button"
            title="适配当前画布"
            aria-label="适配当前画布"
            @click.stop="fitCanvasView"
          >
            Fit
          </button>
        </div>
      </div>
    </div>

    <WorkspaceDesignCanvasCollabOverlay :cursors="remoteScreenCursors" />
  </div>
</template>

<style scoped>
.workspace-design-canvaskit-host__frame-surface :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.workspace-design-canvaskit-host__chrome {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 28;
  display: flex;
  flex-direction: column;
  gap: var(--workspace-design-control-gap, 12px);
  pointer-events: none;
}

.workspace-design-canvaskit-host__minimap,
.workspace-design-canvaskit-host__zoom-anchor {
  pointer-events: auto;
}

.workspace-design-canvaskit-host__minimap {
  position: relative;
  width: var(--workspace-design-control-width, 200px);
  height: var(--workspace-design-minimap-height, 136px);
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: var(--workspace-design-minimap-radius, 14px);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
  box-shadow:
    0 18px 38px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  cursor: grab;
  touch-action: none;
  transition:
    width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    border-radius 180ms ease,
    box-shadow 180ms ease;
}

.workspace-design-canvaskit-host__minimap:active {
  cursor: grabbing;
}

.workspace-design-canvaskit-host[data-zoom-state='dormant'] .workspace-design-canvaskit-host__minimap {
  box-shadow:
    0 8px 18px rgba(15, 23, 42, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.workspace-design-canvaskit-host__minimap-surface {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.12) 1px, transparent 1px);
  background-size: 18px 18px;
}

.workspace-design-canvaskit-host__minimap-page,
.workspace-design-canvaskit-host__minimap-frame,
.workspace-design-canvaskit-host__minimap-viewport {
  position: absolute;
  box-sizing: border-box;
}

.workspace-design-canvaskit-host__minimap-page {
  border: 1px solid rgba(148, 163, 184, 0.38);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
}

.workspace-design-canvaskit-host__minimap-frame {
  border: 1px solid rgba(100, 116, 139, 0.32);
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.18);
}

.workspace-design-canvaskit-host__minimap-frame--selected {
  border-color: rgba(14, 165, 233, 0.72);
  background: rgba(14, 165, 233, 0.28);
}

.workspace-design-canvaskit-host__minimap-frame--editing {
  border-color: rgba(56, 189, 248, 0.72);
  background: rgba(56, 189, 248, 0.22);
}

.workspace-design-canvaskit-host__minimap-viewport {
  border: 1.5px solid rgba(14, 165, 233, 0.92);
  border-radius: 8px;
  background: rgba(14, 165, 233, 0.1);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.92),
    0 8px 18px rgba(14, 165, 233, 0.16);
}

.workspace-design-canvaskit-host__zoom-anchor {
  width: var(--workspace-design-control-width, 200px);
  height: var(--workspace-design-control-hit-height, 40px);
}

.workspace-design-canvaskit-host__text-editor {
  box-sizing: border-box;
  font-family: inherit;
}

.workspace-design-canvaskit-host__zoom-shell {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 72px) 40px 52px;
  align-items: center;
  width: var(--workspace-design-control-width, 200px);
  height: var(--workspace-design-control-hit-height, 40px);
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: var(--workspace-design-control-radius, 14px);
  background: rgba(255, 255, 255, 0.96);
  box-shadow:
    0 16px 32px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  transition:
    width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 180ms ease,
    border-color 180ms ease,
    border-radius 180ms ease;
}

.workspace-design-canvaskit-host__zoom-shell[data-state='resting'],
.workspace-design-canvaskit-host__zoom-shell[data-state='dormant'] {
  display: flex;
  align-items: center;
  height: var(--workspace-design-control-hit-height, 28px);
  border-color: transparent;
  background: transparent;
  cursor: pointer;
  box-shadow: none;
}

.workspace-design-canvaskit-host__zoom-button,
.workspace-design-canvaskit-host__zoom-label,
.workspace-design-canvaskit-host__zoom-fit {
  height: var(--workspace-design-control-height, 40px);
  border: 0;
  background: transparent;
  color: #0f172a;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workspace-design-canvaskit-host__zoom-button,
.workspace-design-canvaskit-host__zoom-fit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.workspace-design-canvaskit-host__zoom-shell[data-state='resting'] .workspace-design-canvaskit-host__zoom-button,
.workspace-design-canvaskit-host__zoom-shell[data-state='resting'] .workspace-design-canvaskit-host__zoom-fit,
.workspace-design-canvaskit-host__zoom-shell[data-state='dormant'] .workspace-design-canvaskit-host__zoom-button,
.workspace-design-canvaskit-host__zoom-shell[data-state='dormant'] .workspace-design-canvaskit-host__zoom-fit {
  position: absolute;
  inset: 0 auto 0 0;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.9);
}

.workspace-design-canvaskit-host__zoom-button:hover,
.workspace-design-canvaskit-host__zoom-label:hover,
.workspace-design-canvaskit-host__zoom-fit:hover {
  background: rgba(248, 250, 252, 0.96);
}

.workspace-design-canvaskit-host__zoom-button:focus-visible,
.workspace-design-canvaskit-host__zoom-label:focus-visible,
.workspace-design-canvaskit-host__zoom-fit:focus-visible {
  outline: none;
  background: rgba(240, 249, 255, 0.92);
}

.workspace-design-canvaskit-host__zoom-label {
  min-width: 0;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.workspace-design-canvaskit-host__zoom-range-shell {
  position: relative;
  display: flex;
  min-width: 0;
  height: var(--workspace-design-control-height, 40px);
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-right: 1px solid rgba(226, 232, 240, 0.96);
  border-left: 1px solid rgba(226, 232, 240, 0.96);
  transition:
    border-color 180ms ease,
    background-color 180ms ease,
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workspace-design-canvaskit-host__zoom-shell[data-state='resting'] .workspace-design-canvaskit-host__zoom-range-shell,
.workspace-design-canvaskit-host__zoom-shell[data-state='dormant'] .workspace-design-canvaskit-host__zoom-range-shell {
  position: absolute;
  inset: 0;
  border-right-color: transparent;
  border-left-color: transparent;
  opacity: 0;
  pointer-events: none;
}

.workspace-design-canvaskit-host__zoom-shell[data-state='resting'] .workspace-design-canvaskit-host__zoom-label,
.workspace-design-canvaskit-host__zoom-shell[data-state='dormant'] .workspace-design-canvaskit-host__zoom-label {
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
}

.workspace-design-canvaskit-host__zoom-fit {
  border-left: 1px solid rgba(226, 232, 240, 0.96);
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.workspace-design-canvaskit-host__zoom-collapsed-track {
  position: absolute;
  inset-inline: 1px;
  top: 50%;
  display: block;
  height: var(--workspace-design-collapsed-track-height, 4px);
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--workspace-design-collapsed-track-radius, 2px);
  background: rgba(203, 213, 225, 0.66);
  opacity: 0;
  transform: translateY(-50%) scaleX(0.92);
  transition:
    opacity 160ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}

.workspace-design-canvaskit-host__zoom-shell[data-state='resting']
  .workspace-design-canvaskit-host__zoom-collapsed-track,
.workspace-design-canvaskit-host__zoom-shell[data-state='dormant']
  .workspace-design-canvaskit-host__zoom-collapsed-track {
  opacity: 1;
  transform: translateY(-50%) scaleX(1);
}

.workspace-design-canvaskit-host__zoom-collapsed-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  width: var(--workspace-design-collapsed-indicator-width, 12px);
  height: var(--workspace-design-collapsed-indicator-height, 8px);
  border-radius: var(--workspace-design-collapsed-indicator-radius, 2px);
  border: 0;
  background: rgba(100, 116, 139, 0.82);
  transform: translateY(-50%);
}

@media (max-width: 1023px) {
  .workspace-design-canvaskit-host__chrome {
    left: 12px;
    bottom: 12px;
  }

  .workspace-design-canvaskit-host__zoom-shell {
    grid-template-columns: 36px minmax(0, 60px) 36px 48px;
  }
}
</style>
