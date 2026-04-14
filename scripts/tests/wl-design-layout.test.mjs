import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { it } from "vitest";

const DESIGN_PANEL_FILE = resolve(
  process.cwd(),
  "app/components/workspace/WorkspaceDesignPanel.vue",
);
const WL_DESIGN_LAYOUT_FILE = resolve(
  process.cwd(),
  "app/components/wl-design/WLDesignLayout.vue",
);
const WL_DESIGN_LAYER_FILE = resolve(
  process.cwd(),
  "app/components/wl-design/WLDesignLayer.vue",
);
const WL_DESIGN_CONTAINER_FILE = resolve(
  process.cwd(),
  "app/components/wl-design/WLDesignContainer.vue",
);
const DESIGN_SIDEBAR_TABS_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignSidebarTabs.vue",
);
const DESIGN_STAGE_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignStage.vue",
);
const DESIGN_CANVAS_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignCanvas.client.vue",
);
const DESIGN_TOOLBAR_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignToolbar.vue",
);
const DESIGN_TOOL_CONTROLLER_FILE = resolve(
  process.cwd(),
  "app/composables/useDesignToolController.ts",
);
const LEGACY_FLOATING_TOOLBAR_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignFloatingToolbar.vue",
);
const LEGACY_SIDEBAR_PANEL_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignSidebarPanel.vue",
);
const LEGACY_SHELL_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignShell.vue",
);
const LEGACY_LAYERS_PANEL_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignLayersPanel.vue",
);

it("wl design 骨架组件和设计主面板已切换到插槽式布局", async () => {
  const [
    panelSource,
    layoutSource,
    layerSource,
    containerSource,
    sidebarTabsSource,
    stageSource,
    canvasSource,
    toolbarSource,
    toolControllerSource,
  ] = await Promise.all([
    readFile(DESIGN_PANEL_FILE, "utf8"),
    readFile(WL_DESIGN_LAYOUT_FILE, "utf8"),
    readFile(WL_DESIGN_LAYER_FILE, "utf8"),
    readFile(WL_DESIGN_CONTAINER_FILE, "utf8"),
    readFile(DESIGN_SIDEBAR_TABS_FILE, "utf8"),
    readFile(DESIGN_STAGE_FILE, "utf8"),
    readFile(DESIGN_CANVAS_FILE, "utf8"),
    readFile(DESIGN_TOOLBAR_FILE, "utf8"),
    readFile(DESIGN_TOOL_CONTROLLER_FILE, "utf8"),
  ]);

  assert.match(layoutSource, /leftWidth\?: number/);
  assert.match(layoutSource, /leftCollapsed\?: boolean/);
  assert.match(layoutSource, /collapsedLeftWidth\?: number/);
  assert.match(layoutSource, /rightWidth\?: number/);
  assert.match(layoutSource, /rightCollapsed\?: boolean/);
  assert.match(layoutSource, /collapsedRightWidth\?: number/);
  assert.match(layoutSource, /minCanvasWidth\?: number/);
  assert.match(layoutSource, /gap\?: number/);
  assert.match(layoutSource, /--wl-design-left-width/);
  assert.match(layoutSource, /--wl-design-right-width/);
  assert.match(layoutSource, /<slot name="left" \/>/);
  assert.match(layoutSource, /<slot name="canvas" \/>/);
  assert.match(layoutSource, /<slot name="right" \/>/);
  assert.match(layoutSource, /<slot name="bottom-toolbar" \/>/);
  assert.match(layoutSource, /<slot name="overlay" \/>/);
  assert.match(layoutSource, /data-testid="wl-design-layout"/);
  assert.match(layoutSource, /wl-design-layout__dock--left/);
  assert.match(layoutSource, /wl-design-layout__dock--right/);
  assert.match(layoutSource, /wl-design-layout__toolbar/);
  assert.match(
    layoutSource,
    /wl-design-layout__dock--left \.wl-design-layout__dock-inner/,
  );
  assert.match(layoutSource, /height: auto;/);
  assert.match(layoutSource, /max-height: 100%;/);
  assert.match(
    layoutSource,
    /wl-design-layout__dock--right \.wl-design-layout__dock-inner/,
  );

  assert.match(
    layerSource,
    /variant\?: 'surface' \| 'rail' \| 'stage' \| 'toolbar'/,
  );
  assert.match(
    layerSource,
    /data-testid="`wl-design-layer-\$\{props\.variant\}`"/,
  );

  assert.match(containerSource, /title\?: string/);
  assert.match(containerSource, /subtitle\?: string/);
  assert.match(containerSource, /scrollable\?: boolean/);
  assert.match(containerSource, /headerSticky\?: boolean/);
  assert.match(containerSource, /padding\?: 'sm' \| 'md' \| 'lg'/);
  assert.match(containerSource, /<slot name="actions" \/>/);
  assert.match(containerSource, /<slot name="badges" \/>/);
  assert.match(containerSource, /<slot \/>/);
  assert.match(containerSource, /<slot name="footer" \/>/);

  assert.match(panelSource, /<WLDesignLayout/);
  assert.match(panelSource, /useDesignCanvasSelection/);
  assert.match(panelSource, /useDesignHistory/);
  assert.match(panelSource, /temporaryHandToolActive/);
  assert.match(panelSource, /deepSelectModifierPressed/);
  assert.match(panelSource, /resolveDesignToolByShortcut/);
  assert.match(panelSource, /resolveDesignToolPreset/);
  assert.match(
    panelSource,
    /function setActiveDesignTool\(tool: DesignEditorTool\): void/,
  );
  assert.match(panelSource, /toolSwitchHint/);
  assert.match(panelSource, /workspace-design-tool-switch-hint/);
  assert.match(panelSource, /undoDesignChange\(\)/);
  assert.match(panelSource, /redoDesignChange\(\)/);
  assert.match(panelSource, /designSelection\.enterFrameEditing/);
  assert.match(panelSource, /designSelection\.exitFrameEditing/);
  assert.match(panelSource, /<template #left>/);
  assert.match(panelSource, /<template #canvas>/);
  assert.match(panelSource, /<template #right>/);
  assert.match(panelSource, /<template #bottom-toolbar>/);
  assert.match(panelSource, /<template #overlay>/);
  assert.match(panelSource, /<WLDesignContainer/);
  assert.match(panelSource, /<WLDesignLayer variant="stage"/);
  assert.match(panelSource, /<WLDesignLayer[\s\S]*variant="toolbar"/);
  assert.match(panelSource, /data-testid="workspace-design-layout"/);
  assert.match(panelSource, /:collapsed-left-width="36"/);
  assert.match(panelSource, /:left-collapsed="sidebarCollapsed"/);
  assert.match(panelSource, /workspace-design-sidebar-panel/);
  assert.match(panelSource, /data-testid="workspace-design-sidebar-toggle"/);
  assert.match(panelSource, /data-testid="workspace-design-sidebar-pages"/);
  assert.match(panelSource, /data-testid="workspace-design-sidebar-frames"/);
  assert.match(panelSource, /data-testid="workspace-design-sidebar-assets"/);
  assert.match(panelSource, /data-testid="workspace-design-inspector-toggle"/);
  assert.match(
    panelSource,
    /:theme-tokens="compositionModel\.themeTokens \|\| \{\}"/,
  );
  assert.doesNotMatch(panelSource, /<WLDesignLayer variant="rail"/);
  assert.doesNotMatch(panelSource, /WorkspaceDesignFloatingToolbar/);
  assert.doesNotMatch(panelSource, /WorkspaceDesignSidebarPanel/);

  assert.match(
    sidebarTabsSource,
    /data-testid="workspace-design-sidebar-tabs"/,
  );
  assert.match(sidebarTabsSource, /label: ["']Pages["']/);
  assert.match(sidebarTabsSource, /label: ["']Frames["']/);
  assert.match(sidebarTabsSource, /label: ["']Assets["']/);

  assert.match(stageSource, /data-testid="workspace-design-stage"/);
  assert.match(stageSource, /selectionState\?: DesignCanvasSelectionState/);
  assert.match(
    stageSource,
    /interactionContext\?: DesignCanvasInteractionContext/,
  );
  assert.match(
    stageSource,
    /["']update-selection["']:\s*\[payload: DesignCanvasSelectionState\]/,
  );
  assert.match(
    stageSource,
    /["']update-elements["']:\s*\[payload: \{ patches: Array<\{ elementId: string, patch: Partial<DesignElementModel> \}>, historyMergeKey\?: string \}\]/,
  );
  assert.match(
    stageSource,
    /const elementTransformDraft = ref<ElementTransformDraft \| null>\(null\)/,
  );
  assert.match(
    stageSource,
    /function handleOverlayWheel\(event: WheelEvent\): void/,
  );
  assert.match(
    stageSource,
    /historyMergeKey:\s*draft\.mode === ["']resize["']\s*\?\s*["']element-resize["']\s*:\s*["']element-rotate["']/,
  );
  assert.match(stageSource, /handleElementRotateHandlePointerDown/);
  assert.match(stageSource, /handleElementResizeHandlePointerDown/);
  assert.match(stageSource, /ROTATE_HANDLE_OFFSET = 28/);
  assert.match(stageSource, /RESIZE_HANDLE_SIZE = 12/);
  assert.match(stageSource, /resolveDesignElementPresentation/);
  assert.match(stageSource, /resolveDesignFrameLayoutMetadata/);
  assert.match(stageSource, /resolveDesignFrameGridMetadata/);
  assert.match(stageSource, /canDesignFrameCreateElements/);
  assert.match(stageSource, /visibleFrameGrids = computed/);
  assert.match(stageSource, /resolvePathSvgPoints/);
  assert.match(stageSource, /historyMergeKey:\s*["']element-drag["']/);
  assert.match(stageSource, /deepSelectionEnabled/);
  assert.match(stageSource, /overlayCapturesCanvasPointer/);
  assert.match(
    stageSource,
    /props\.activeTool === 'rectangle' \|\| props\.activeTool === 'ellipse' \|\| props\.activeTool === 'arrow' \|\| props\.activeTool === 'text'/,
  );
  assert.match(
    stageSource,
    /shapeKind: props\.activeTool === 'ellipse' \? 'ellipse' : props\.activeTool === 'arrow' \? 'arrow' : 'rectangle'/,
  );
  assert.match(
    stageSource,
    /<g v-else-if="resolveElementPresentationForOverlay\(item\)\.shapeKind === 'arrow'">/,
  );
  assert.match(stageSource, /const selectedTransformTarget = computed\(/);
  assert.match(stageSource, /const selectedTransformBoxStyle = computed/);
  assert.match(stageSource, /v-if="selectedTransformBoxStyle"/);
  assert.match(stageSource, /v-for="handle in resizeHandleDefinitions"/);
  assert.match(stageSource, /pointer-events-auto/);
  assert.match(stageSource, /pointer-events-none/);
  assert.doesNotMatch(stageSource, /Design Overlay ·/);

  assert.match(canvasSource, /const CANVAS_CONTROL_WIDTH = 200/);
  assert.match(canvasSource, /const CANVAS_RESTING_CONTROL_WIDTH = 128/);
  assert.match(canvasSource, /const CANVAS_COLLAPSED_CONTROL_WIDTH = 92/);
  assert.match(canvasSource, /const CANVAS_EXPANDED_CONTROL_HEIGHT = 36/);
  assert.match(canvasSource, /const CANVAS_RESTING_CONTROL_HEIGHT = 12/);
  assert.match(canvasSource, /const CANVAS_COLLAPSED_CONTROL_HEIGHT = 8/);
  assert.match(canvasSource, /const CANVAS_RESTING_CONTROL_HIT_HEIGHT = 28/);
  assert.match(canvasSource, /const CANVAS_COLLAPSED_CONTROL_HIT_HEIGHT = 24/);
  assert.match(canvasSource, /const CANVAS_MINIMAP_HEIGHT = 136/);
  assert.match(canvasSource, /function emitFrameEditing\(frameId: string\): void/);
  assert.match(canvasSource, /function handleNodeDoubleClick\(payload: \{ node\?: \{ id\?: string \} \}\): void/);
  assert.match(
    canvasSource,
    /if \(frame && canDesignFrameCreateElements\(frame\)\) emitFrameEditing\(frameId\);/,
  );
  assert.match(
    canvasSource,
    /const CANVAS_RESTING_MINIMAP_HEIGHT = Math\.round/,
  );
  assert.match(
    canvasSource,
    /const CANVAS_COLLAPSED_MINIMAP_HEIGHT = Math\.round/,
  );
  assert.match(canvasSource, /const ZOOM_CONTROL_COLLAPSE_DELAY = 1400/);
  assert.match(
    canvasSource,
    /const ZOOM_CONTROL_DEEP_COLLAPSE_DELAY = 12 \* 60 \* 1000/,
  );
  assert.match(
    canvasSource,
    /const QUICK_ZOOM_PRESETS = \[50, 75, 100, 125, 150, 200\]/,
  );
  assert.match(canvasSource, /const ZOOM_RANGE_SNAP_STEP = 5/);
  assert.match(canvasSource, /zoomDisplayText = computed/);
  assert.match(canvasSource, /nextQuickZoomPreset = computed/);
  assert.match(canvasSource, /zoomCollapsedIndicatorStyle = computed/);
  assert.match(
    canvasSource,
    /const trackWidth = Math\.max\(0, zoomChromeMetrics\.value\.controlWidth - 2\)/,
  );
  assert.match(
    canvasSource,
    /const minimumWidth = zoomChromeMetrics\.value\.collapsedIndicatorWidth/,
  );
  assert.match(
    canvasSource,
    /const rawWidth = Math\.round\(zoomRatio\.value \* trackWidth\)/,
  );
  assert.match(
    canvasSource,
    /const width = Math\.min\(trackWidth, Math\.max\(minimumWidth, rawWidth\)\)/,
  );
  assert.match(canvasSource, /canvasChromeStyle = computed/);
  assert.match(
    canvasSource,
    /zoomControlState = ref<ZoomControlState>\(["']expanded["']\)/,
  );
  assert.match(canvasSource, /selectionState\?: DesignCanvasSelectionState/);
  assert.match(
    canvasSource,
    /interactionContext\?: DesignCanvasInteractionContext/,
  );
  assert.match(
    canvasSource,
    /["']update-selection["']:\s*\[payload: DesignCanvasSelectionState\]/,
  );
  assert.match(
    canvasSource,
    /revealZoomControl\(options\?:\s*\{\s*collapseAfterIdle\?: boolean;\s*delay\?: number;\s*deepDelay\?: number;\s*ignoreHover\?: boolean;\s*\}\): void/,
  );
  assert.match(canvasSource, /cycleQuickZoomPreset\(\): Promise<void>/);
  assert.match(
    canvasSource,
    /zoomCanvasToImmediate\(nextZoom: number\): Promise<void>/,
  );
  assert.match(canvasSource, /handleZoomControlPointerMove\(\): void/);
  assert.match(canvasSource, /handleZoomControlShellClick\(\): void/);
  assert.match(
    canvasSource,
    /handleZoomRangePointerDown\(event: PointerEvent\): void/,
  );
  assert.match(
    canvasSource,
    /handleZoomRangePointerMove\(event: PointerEvent\): void/,
  );
  assert.match(
    canvasSource,
    /handleZoomRangePointerUp\(event: PointerEvent\): void/,
  );
  assert.match(canvasSource, /DESIGN_TOOL_PRESETS/);
  assert.match(
    canvasSource,
    /description: ["']临时平移画布["'], keys: \[["']Hold["'], ["']Space["']\]/,
  );
  assert.match(canvasSource, /description: `\$\{tool\.label\}工具`,/);
  assert.match(canvasSource, /:data-zoom-state="zoomControlState"/);
  assert.match(
    canvasSource,
    /<MiniMap[\s\S]*:width="zoomChromeMetrics\.controlWidth"[\s\S]*:height="zoomChromeMetrics\.minimapHeight"/,
  );
  assert.match(canvasSource, /:selection-key-code="true"/);
  assert.match(canvasSource, /:pan-on-drag="isHandToolActive"/);
  assert.match(canvasSource, /:pan-on-scroll="true"/);
  assert.match(canvasSource, /:zoom-on-scroll="false"/);
  assert.match(canvasSource, /:zoom-on-pinch="true"/);
  assert.match(
    canvasSource,
    /:node-drag-threshold="POINTER_GESTURE_THRESHOLD"/,
  );
  assert.match(
    canvasSource,
    /:pane-click-distance="POINTER_GESTURE_THRESHOLD"/,
  );
  assert.match(canvasSource, /onResizePreview/);
  assert.match(canvasSource, /onResizeCommit/);
  assert.match(canvasSource, /:data-state="zoomControlState"/);
  assert.match(canvasSource, /class="workspace-design-canvas__zoom-label"/);
  assert.match(canvasSource, /@pointerdown="handleZoomRangePointerDown"/);
  assert.match(canvasSource, /@pointermove="handleZoomRangePointerMove"/);
  assert.match(canvasSource, /@pointerup="handleZoomRangePointerUp"/);
  assert.match(canvasSource, /@pointercancel="handleZoomRangePointerUp"/);
  assert.match(canvasSource, /@pointermove="handleZoomControlPointerMove"/);
  assert.match(canvasSource, /@click\.stop="void cycleQuickZoomPreset\(\)"/);
  assert.match(canvasSource, /@click\.stop="handleZoomControlShellClick"/);
  assert.match(canvasSource, /workspace-design-canvas__zoom-collapsed-track/);
  assert.match(
    canvasSource,
    /workspace-design-canvas__zoom-collapsed-indicator/,
  );
  assert.match(canvasSource, /left: 16px !important;/);
  assert.match(canvasSource, /margin: 0 !important;/);
  assert.match(canvasSource, /z-index: 160 !important;/);
  assert.match(canvasSource, /background: #ffffff;/);
  assert.match(
    canvasSource,
    /["']--workspace-design-control-hit-height["']:\s*`\$\{zoomChromeMetrics\.value\.controlHitHeight\}px`/,
  );
  assert.match(
    canvasSource,
    /["']--workspace-design-collapsed-track-height["']:\s*`\$\{zoomChromeMetrics\.value\.collapsedTrackHeight\}px`/,
  );
  assert.match(
    canvasSource,
    /["']--workspace-design-collapsed-track-radius["']:\s*zoomControlState\.value === ["']dormant["']\s*\?\s*["']1px["']\s*:\s*zoomControlState\.value === ["']resting["']\s*\?\s*["']1px["']\s*:\s*["']2px["']/,
  );
  assert.match(
    canvasSource,
    /["']--workspace-design-collapsed-indicator-width["']:\s*`\$\{zoomChromeMetrics\.value\.collapsedIndicatorWidth\}px`/,
  );
  assert.match(
    canvasSource,
    /["']--workspace-design-collapsed-indicator-height["']:\s*`\$\{zoomChromeMetrics\.value\.collapsedIndicatorHeight\}px`/,
  );
  assert.match(
    canvasSource,
    /["']--workspace-design-collapsed-indicator-radius["']:\s*zoomControlState\.value === ["']dormant["']\s*\?\s*["']1px["']\s*:\s*zoomControlState\.value === ["']resting["']\s*\?\s*["']1px["']\s*:\s*["']2px["']/,
  );
  assert.match(
    canvasSource,
    /["']--workspace-design-minimap-radius["']:\s*zoomControlState\.value === ["']dormant["']\s*\?\s*["']7px["']\s*:\s*zoomControlState\.value === ["']resting["']\s*\?\s*["']8px["']\s*:\s*["']10px["']/,
  );
  assert.match(canvasSource, /overflow: hidden;/);
  assert.match(
    canvasSource,
    /height: var\(--workspace-design-collapsed-track-height\);/,
  );
  assert.match(
    canvasSource,
    /border-radius: var\(--workspace-design-collapsed-track-radius\);/,
  );
  assert.match(
    canvasSource,
    /width: var\(--workspace-design-collapsed-indicator-width\);/,
  );
  assert.match(
    canvasSource,
    /height: var\(--workspace-design-collapsed-indicator-height\);/,
  );
  assert.match(
    canvasSource,
    /border-radius: var\(--workspace-design-collapsed-indicator-radius\);/,
  );
  assert.match(canvasSource, /left: 0;/);
  assert.match(canvasSource, /transform: translateY\(-50%\);/);
  assert.match(canvasSource, /cursor: ew-resize;/);
  assert.match(canvasSource, /user-select: none;/);
  assert.match(canvasSource, /pointer-events: none;/);
  assert.match(canvasSource, /display: flex;/);
  assert.match(
    canvasSource,
    /height: var\(--workspace-design-control-hit-height\);/,
  );
  assert.doesNotMatch(canvasSource, /mix-blend-mode: difference/);
  assert.doesNotMatch(canvasSource, /zoomControlCollapsed/);

  assert.match(toolbarSource, /data-testid="workspace-design-toolbar"/);
  assert.match(toolbarSource, /DESIGN_TOOL_PRESETS/);
  assert.match(toolbarSource, /tool\.shortcutLabel/);
  assert.match(toolbarSource, /快捷键/);
  assert.match(toolbarSource, /no-scrollbar/);
  assert.match(toolbarSource, /overflow-x-auto/);
  assert.match(toolbarSource, /justify-center/);
  assert.doesNotMatch(toolbarSource, /floating\?: boolean/);
  assert.doesNotMatch(toolbarSource, /props\.floating/);
  assert.doesNotMatch(toolbarSource, /rounded-\[28px\]/);
  assert.doesNotMatch(toolbarSource, /backdrop-blur/);

  assert.match(
    toolControllerSource,
    /export const DESIGN_TOOL_PRESETS: DesignToolPreset\[\] = \[/,
  );
  assert.match(toolControllerSource, /label:\s*["']选择["']/);
  assert.match(toolControllerSource, /label:\s*["']手型["']/);
  assert.match(toolControllerSource, /label:\s*["']铅笔["']/);
  assert.match(toolControllerSource, /label:\s*["']矩形["']/);
  assert.match(toolControllerSource, /label:\s*["']椭圆["']/);
  assert.match(toolControllerSource, /label:\s*["']箭头["']/);
  assert.match(toolControllerSource, /label:\s*["']文本["']/);
  assert.match(toolControllerSource, /shortcut:\s*["']v["']/);
  assert.match(toolControllerSource, /shortcut:\s*["']h["']/);
  assert.match(toolControllerSource, /shortcut:\s*["']p["']/);
  assert.match(toolControllerSource, /shortcut:\s*["']r["']/);
  assert.match(toolControllerSource, /shortcut:\s*["']o["']/);
  assert.match(toolControllerSource, /shortcut:\s*["']l["']/);
  assert.match(toolControllerSource, /shortcut:\s*["']t["']/);
  assert.match(
    toolControllerSource,
    /export function resolveDesignToolByShortcut/,
  );
  assert.match(toolControllerSource, /export function resolveDesignToolPreset/);

  await assert.rejects(readFile(LEGACY_FLOATING_TOOLBAR_FILE, "utf8"));
  await assert.rejects(readFile(LEGACY_SIDEBAR_PANEL_FILE, "utf8"));
  await assert.rejects(readFile(LEGACY_SHELL_FILE, "utf8"));
  await assert.rejects(readFile(LEGACY_LAYERS_PANEL_FILE, "utf8"));
});
