import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DESIGN_PANEL_FILE = resolve(
  process.cwd(),
  'app/components/workspace/WorkspaceDesignPanel.vue',
)
const WL_DESIGN_LAYOUT_FILE = resolve(
  process.cwd(),
  'app/components/wl-design/WLDesignLayout.vue',
)
const WL_DESIGN_LAYER_FILE = resolve(
  process.cwd(),
  'app/components/wl-design/WLDesignLayer.vue',
)
const WL_DESIGN_CONTAINER_FILE = resolve(
  process.cwd(),
  'app/components/wl-design/WLDesignContainer.vue',
)
const DESIGN_SIDEBAR_TABS_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignSidebarTabs.vue',
)
const DESIGN_CANVASKIT_HOST_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignCanvasKitHost.client.vue',
)
const DESIGN_TOOLBAR_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignToolbar.vue',
)
const DESIGN_TOOL_CONTROLLER_FILE = resolve(
  process.cwd(),
  'app/composables/useDesignToolController.ts',
)
const LEGACY_FLOATING_TOOLBAR_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignFloatingToolbar.vue',
)
const LEGACY_SIDEBAR_PANEL_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignSidebarPanel.vue',
)
const LEGACY_SHELL_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignShell.vue',
)
const LEGACY_LAYERS_PANEL_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignLayersPanel.vue',
)

it('wl design 骨架组件和设计主面板已切换到插槽式布局', async () => {
  const [
    panelSource,
    layoutSource,
    layerSource,
    containerSource,
    sidebarTabsSource,
    hostSource,
    toolbarSource,
    toolControllerSource,
  ] = await Promise.all([
    readFile(DESIGN_PANEL_FILE, 'utf8'),
    readFile(WL_DESIGN_LAYOUT_FILE, 'utf8'),
    readFile(WL_DESIGN_LAYER_FILE, 'utf8'),
    readFile(WL_DESIGN_CONTAINER_FILE, 'utf8'),
    readFile(DESIGN_SIDEBAR_TABS_FILE, 'utf8'),
    readFile(DESIGN_CANVASKIT_HOST_FILE, 'utf8'),
    readFile(DESIGN_TOOLBAR_FILE, 'utf8'),
    readFile(DESIGN_TOOL_CONTROLLER_FILE, 'utf8'),
  ])

  assert.match(layoutSource, /leftWidth\?: number/)
  assert.match(layoutSource, /leftCollapsed\?: boolean/)
  assert.match(layoutSource, /collapsedLeftWidth\?: number/)
  assert.match(layoutSource, /rightWidth\?: number/)
  assert.match(layoutSource, /rightCollapsed\?: boolean/)
  assert.match(layoutSource, /collapsedRightWidth\?: number/)
  assert.match(layoutSource, /minCanvasWidth\?: number/)
  assert.match(layoutSource, /gap\?: number/)
  assert.match(layoutSource, /--wl-design-left-width/)
  assert.match(layoutSource, /--wl-design-right-width/)
  assert.match(layoutSource, /<slot name="left" \/>/)
  assert.match(layoutSource, /<slot name="canvas" \/>/)
  assert.match(layoutSource, /<slot name="right" \/>/)
  assert.match(layoutSource, /<slot name="bottom-toolbar" \/>/)
  assert.match(layoutSource, /<slot name="overlay" \/>/)
  assert.match(layoutSource, /data-testid="wl-design-layout"/)
  assert.match(layoutSource, /wl-design-layout__dock--left/)
  assert.match(layoutSource, /wl-design-layout__dock--right/)
  assert.match(layoutSource, /wl-design-layout__toolbar/)
  assert.match(
    layoutSource,
    /wl-design-layout__dock--left \.wl-design-layout__dock-inner/,
  )
  assert.match(layoutSource, /height: auto;/)
  assert.match(layoutSource, /max-height: 100%;/)
  assert.match(
    layoutSource,
    /wl-design-layout__dock--right \.wl-design-layout__dock-inner/,
  )

  assert.match(
    layerSource,
    /variant\?: 'surface' \| 'rail' \| 'stage' \| 'toolbar'/,
  )
  assert.match(
    layerSource,
    /data-testid="`wl-design-layer-\$\{props\.variant\}`"/,
  )

  assert.match(containerSource, /title\?: string/)
  assert.match(containerSource, /subtitle\?: string/)
  assert.match(containerSource, /scrollable\?: boolean/)
  assert.match(containerSource, /headerSticky\?: boolean/)
  assert.match(containerSource, /padding\?: 'sm' \| 'md' \| 'lg'/)
  assert.match(containerSource, /<slot name="actions" \/>/)
  assert.match(containerSource, /<slot name="badges" \/>/)
  assert.match(containerSource, /<slot \/>/)
  assert.match(containerSource, /<slot name="footer" \/>/)

  assert.match(panelSource, /<WLDesignLayout/)
  assert.match(panelSource, /useDesignCanvasSelection/)
  assert.match(panelSource, /useDesignHistory/)
  assert.match(panelSource, /temporaryHandToolActive/)
  assert.match(panelSource, /deepSelectModifierPressed/)
  assert.match(panelSource, /resolveDesignToolByShortcut/)
  assert.match(panelSource, /resolveDesignToolPreset/)
  assert.match(
    panelSource,
    /function setActiveDesignTool\(tool: DesignEditorTool\): void/,
  )
  assert.match(panelSource, /toolSwitchHint/)
  assert.match(panelSource, /workspace-design-tool-switch-hint/)
  assert.match(panelSource, /undoDesignChange\(\)/)
  assert.match(panelSource, /redoDesignChange\(\)/)
  assert.match(panelSource, /function requestDeepSelection\(payload: StageDeepSelectionRequest\): void/)
  assert.match(panelSource, /function enterFrameEditingFromSelection\(frame: DesignFrameModel\): void/)
  assert.match(panelSource, /designSelection\.exitFrameEditing/)
  assert.match(panelSource, /resolveDisplayFrameIdForOwnerSelection/)
  assert.match(panelSource, /<template #left>/)
  assert.match(panelSource, /<template #canvas>/)
  assert.match(panelSource, /<template #right>/)
  assert.match(panelSource, /<template #bottom-toolbar>/)
  assert.match(panelSource, /<template #overlay>/)
  assert.match(panelSource, /<WLDesignContainer/)
  assert.match(panelSource, /<WLDesignLayer variant="stage"/)
  assert.match(panelSource, /<WLDesignLayer[\s\S]*variant="toolbar"/)
  assert.match(panelSource, /data-testid="workspace-design-layout"/)
  assert.match(panelSource, /:collapsed-left-width="36"/)
  assert.match(panelSource, /:left-collapsed="sidebarCollapsed"/)
  assert.match(panelSource, /workspace-design-sidebar-panel/)
  assert.match(panelSource, /data-testid="workspace-design-sidebar-toggle"/)
  assert.match(panelSource, /data-testid="workspace-design-sidebar-pages"/)
  assert.match(panelSource, /data-testid="workspace-design-sidebar-frames"/)
  assert.match(panelSource, /data-testid="workspace-design-sidebar-assets"/)
  assert.match(panelSource, /data-testid="workspace-design-inspector-toggle"/)
  assert.match(panelSource, /data-layer-tree-node-id/)
  assert.match(panelSource, /scrollActiveLayerTreeNodeIntoView/)
  assert.match(
    panelSource,
    /:theme-tokens="compositionModel\.themeTokens \|\| \{\}"/,
  )
  assert.doesNotMatch(panelSource, /<WLDesignLayer variant="rail"/)
  assert.doesNotMatch(panelSource, /WorkspaceDesignFloatingToolbar/)
  assert.doesNotMatch(panelSource, /WorkspaceDesignSidebarPanel/)

  assert.match(
    sidebarTabsSource,
    /data-testid="workspace-design-sidebar-tabs"/,
  )
  assert.match(sidebarTabsSource, /label: ["']Pages["']/)
  assert.match(sidebarTabsSource, /label: ["']Frames["']/)
  assert.match(sidebarTabsSource, /label: ["']Assets["']/)

  assert.match(hostSource, /data-testid="workspace-design-canvaskit-host"/)
  assert.match(hostSource, /frameOwnerFrames\?: Record<string, DesignFrameModel>/)
  assert.match(hostSource, /selectionState\?: DesignCanvasSelectionState/)
  assert.match(hostSource, /interactionContext\?: DesignCanvasInteractionContext/)
  assert.match(hostSource, /["']update-selection["']:\s*\[payload: DesignCanvasSelectionState\]/)
  assert.match(
    hostSource,
    /["']update-elements["']:\s*\[payload: \{ patches: Array<\{ elementId: string, patch: Partial<DesignElementModel> \}>, historyMergeKey\?: string \}\]/,
  )
  assert.match(
    hostSource,
    /["']request-deep-selection["']:\s*\[payload: \{ ownerFrameId: string, ownerPageId: string, displayFrameId: string, ownerElementId\?: string \}\]/,
  )
  assert.match(hostSource, /interface ElementHitItem \{/)
  assert.match(hostSource, /type FrameDragSession = \{/)
  assert.match(hostSource, /type FrameResizeSession = \{/)
  assert.match(hostSource, /type MockupScreenDragSession = \{/)
  assert.match(hostSource, /type PendingImagePlacement = \{/)
  assert.match(hostSource, /const CANVAS_CONTROL_WIDTH = 200/)
  assert.match(hostSource, /const CANVAS_RESTING_CONTROL_WIDTH = 128/)
  assert.match(hostSource, /const CANVAS_COLLAPSED_CONTROL_WIDTH = 92/)
  assert.match(hostSource, /const CANVAS_MINIMAP_HEIGHT = 136/)
  assert.match(hostSource, /const ZOOM_CONTROL_COLLAPSE_DELAY = 1400/)
  assert.match(hostSource, /const ZOOM_CONTROL_DEEP_COLLAPSE_DELAY = 12 \* 60 \* 1000/)
  assert.match(hostSource, /const QUICK_ZOOM_PRESETS = \[50, 75, 100, 125, 150, 200\]/)
  assert.match(hostSource, /const ROTATE_HANDLE_OFFSET = 28/)
  assert.match(hostSource, /const ELEMENT_SNAP_GRID_SIZE = 8/)
  assert.match(hostSource, /resolveDesignElementPresentation/)
  assert.match(hostSource, /resolveDesignFrameGridMetadata/)
  assert.match(hostSource, /resolveDesignFrameProjectionLayoutForFrames/)
  assert.match(hostSource, /canDesignFrameCreateElements/)
  assert.match(hostSource, /visibleFrameGrids = computed/)
  assert.match(hostSource, /const elementTransformBoxStyle = computed/)
  assert.match(hostSource, /const zoomChromeMetrics = computed/)
  assert.match(hostSource, /const zoomCollapsedIndicatorStyle = computed/)
  assert.match(hostSource, /zoomControlState = ref<ZoomControlState>\(["']expanded["']\)/)
  assert.match(hostSource, /function revealZoomControl\(options\?: \{/)
  assert.match(hostSource, /function cycleQuickZoomPreset\(\): void/)
  assert.match(hostSource, /function fitCanvasView\(\): void/)
  assert.match(hostSource, /function handleZoomControlPointerMove\(\): void/)
  assert.match(hostSource, /function handleZoomControlShellClick\(\): void/)
  assert.match(hostSource, /function resolveElementGuideAdjustment\(/)
  assert.match(hostSource, /function beginAutoLayoutReorderSession\(/)
  assert.match(hostSource, /function handleElementResizePointerDown\(/)
  assert.match(hostSource, /function handleElementRotatePointerDown\(/)
  assert.match(hostSource, /function handleFrameResizePointerDown\(/)
  assert.match(hostSource, /function handleFramePointerDown\(/)
  assert.match(hostSource, /function handleElementDoubleClick\(/)
  assert.match(hostSource, /function resolveMockupScreenTransform\(/)
  assert.match(hostSource, /emit\('request-deep-selection', \{/)
  assert.match(hostSource, /emit\('update-elements', \{/)
  assert.match(hostSource, /emit\('update-frame-size', \{/)
  assert.match(hostSource, /emit\('duplicate-frame'\)/)
  assert.match(hostSource, /emit\('delete-frame'\)/)
  assert.match(hostSource, /:data-zoom-state="zoomControlState"/)
  assert.match(hostSource, /data-testid="workspace-design-canvaskit-minimap"/)
  assert.match(hostSource, /data-testid="workspace-design-canvaskit-zoom-hud"/)
  assert.match(hostSource, /data-testid="workspace-design-canvaskit-create-preview"/)
  assert.match(hostSource, /data-testid="workspace-design-canvaskit-element-hit"/)
  assert.match(hostSource, /data-testid="workspace-design-canvaskit-element-resize"/)
  assert.match(hostSource, /data-testid="workspace-design-canvaskit-frame-resize"/)
  assert.match(hostSource, /WorkspaceDesignCanvasCollabOverlay/)
  assert.match(hostSource, /workspace-design-canvaskit-host__zoom-collapsed-track/)
  assert.match(hostSource, /workspace-design-canvaskit-host__zoom-collapsed-indicator/)
  assert.match(hostSource, /["']--workspace-design-control-hit-height["']:\s*`\$\{zoomChromeMetrics\.value\.controlHitHeight\}px`/)
  assert.match(hostSource, /["']--workspace-design-collapsed-track-height["']:\s*`\$\{zoomChromeMetrics\.value\.collapsedTrackHeight\}px`/)
  assert.match(hostSource, /["']--workspace-design-collapsed-indicator-width["']:\s*`\$\{zoomChromeMetrics\.value\.collapsedIndicatorWidth\}px`/)
  assert.doesNotMatch(hostSource, /mix-blend-mode: difference/)
  assert.doesNotMatch(hostSource, /zoomControlCollapsed/)

  assert.match(toolbarSource, /data-testid="workspace-design-toolbar"/)
  assert.match(toolbarSource, /DESIGN_TOOL_PRESETS/)
  assert.match(toolbarSource, /tool\.shortcutLabel/)
  assert.match(toolbarSource, /快捷键/)
  assert.match(toolbarSource, /no-scrollbar/)
  assert.match(toolbarSource, /overflow-x-auto/)
  assert.match(toolbarSource, /justify-center/)
  assert.doesNotMatch(toolbarSource, /floating\?: boolean/)
  assert.doesNotMatch(toolbarSource, /props\.floating/)
  assert.doesNotMatch(toolbarSource, /rounded-\[28px\]/)
  assert.doesNotMatch(toolbarSource, /backdrop-blur/)

  assert.match(
    toolControllerSource,
    /export const DESIGN_TOOL_PRESETS: DesignToolPreset\[\] = \[/,
  )
  assert.match(toolControllerSource, /label:\s*["']选择["']/)
  assert.match(toolControllerSource, /label:\s*["']手型["']/)
  assert.match(toolControllerSource, /label:\s*["']铅笔["']/)
  assert.match(toolControllerSource, /label:\s*["']矩形["']/)
  assert.match(toolControllerSource, /label:\s*["']椭圆["']/)
  assert.match(toolControllerSource, /label:\s*["']箭头["']/)
  assert.match(toolControllerSource, /label:\s*["']文本["']/)
  assert.match(toolControllerSource, /shortcut:\s*["']v["']/)
  assert.match(toolControllerSource, /shortcut:\s*["']h["']/)
  assert.match(toolControllerSource, /shortcut:\s*["']p["']/)
  assert.match(toolControllerSource, /shortcut:\s*["']r["']/)
  assert.match(toolControllerSource, /shortcut:\s*["']o["']/)
  assert.match(toolControllerSource, /shortcut:\s*["']l["']/)
  assert.match(toolControllerSource, /shortcut:\s*["']t["']/)
  assert.match(
    toolControllerSource,
    /export function resolveDesignToolByShortcut/,
  )
  assert.match(toolControllerSource, /export function resolveDesignToolPreset/)

  await assert.rejects(readFile(LEGACY_FLOATING_TOOLBAR_FILE, 'utf8'))
  await assert.rejects(readFile(LEGACY_SIDEBAR_PANEL_FILE, 'utf8'))
  await assert.rejects(readFile(LEGACY_SHELL_FILE, 'utf8'))
  await assert.rejects(readFile(LEGACY_LAYERS_PANEL_FILE, 'utf8'))
})
