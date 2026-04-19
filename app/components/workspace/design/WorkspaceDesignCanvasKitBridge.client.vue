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
import {
  createEmptyDesignCanvasSelectionState,
} from '~~/app/composables/useDesignCanvasSelection'
import WorkspaceDesignCanvasKitHost from './WorkspaceDesignCanvasKitHost.client.vue'

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
  pendingImagePlacement?: {
    src: string
    name?: string
    intrinsicWidth?: number
    intrinsicHeight?: number
    assetId?: string
    mimeType?: string
  } | null
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
  updateCollabCursor: [value: { cursorX?: number, cursorY?: number }]
  'create-element': [payload: Partial<DesignElementModel>]
  'update-element': [payload: { elementId: string, patch: Partial<DesignElementModel>, historyMergeKey?: string }]
  'update-elements': [payload: { patches: Array<{ elementId: string, patch: Partial<DesignElementModel> }>, historyMergeKey?: string }]
  'node-double-click': [payload: { frameId: string, clientX: number, clientY: number }]
  'request-deep-selection': [payload: { ownerFrameId: string, ownerPageId: string, displayFrameId: string, ownerElementId?: string }]
  'edit-mockup-screen': [payload: { frameId: string }]
  'update-mockup-screen-transform': [payload: { frameId: string, offsetX: number, offsetY: number, historyMergeKey?: string }]
  'clear-pending-image-placement': []
}>()
</script>

<template>
  <div
    class="relative h-full min-h-0 w-full"
    data-testid="workspace-design-canvaskit-bridge"
  >
    <WorkspaceDesignCanvasKitHost
      :page="props.page"
      :frames="props.frames"
      :assets="props.assets"
      :page-root-elements="props.pageRootElements"
      :frame-elements="props.frameElements"
      :frame-owner-frames="props.frameOwnerFrames"
      :theme-tokens="props.themeTokens"
      :active-tool="props.activeTool"
      :selection-state="props.selectionState"
      :interaction-context="props.interactionContext"
      :remote-cursors="props.remoteCursors"
      :viewport-x="props.viewportX"
      :viewport-y="props.viewportY"
      :viewport-zoom="props.viewportZoom"
      :mockup-screen-editing-frame-id="props.mockupScreenEditingFrameId"
      :pending-image-placement="props.pendingImagePlacement"
      :disabled="props.disabled"
      @update-selection="emit('update-selection', $event)"
      @open-frame="emit('open-frame', $event)"
      @duplicate-frame="emit('duplicate-frame')"
      @delete-frame="emit('delete-frame')"
      @duplicate-element="emit('duplicate-element')"
      @delete-element="emit('delete-element')"
      @update-frame-position="emit('update-frame-position', $event)"
      @update-frame-positions="emit('update-frame-positions', $event)"
      @update-frame-size="emit('update-frame-size', $event)"
      @viewport-change="emit('viewport-change', $event)"
      @update-collab-cursor="emit('updateCollabCursor', $event)"
      @create-element="emit('create-element', $event)"
      @update-element="emit('update-element', $event)"
      @update-elements="emit('update-elements', $event)"
      @node-double-click="emit('node-double-click', $event)"
      @request-deep-selection="emit('request-deep-selection', $event)"
      @edit-mockup-screen="emit('edit-mockup-screen', $event)"
      @update-mockup-screen-transform="emit('update-mockup-screen-transform', $event)"
      @clear-pending-image-placement="emit('clear-pending-image-placement')"
    />
  </div>
</template>
