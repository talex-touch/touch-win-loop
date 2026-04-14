<script setup lang="ts">
import type {
  CompositionModel,
  DesignAssetModel,
  DesignElementModel,
  DesignFrameKind,
  DesignFrameModel,
  DesignPageModel,
  GraphSourceEdge,
  GraphSourceGroup,
  GraphSourceModel,
  GraphSourceNode,
  SceneDocument,
  WorkspaceFontSizePreset,
  WorkspaceTabSpacingPreset,
} from "~~/shared/types/domain";
import type { WorkspaceCollabCursorUser } from "~/components/workspace/collab/presence";
import type { ContextMenuItem } from "~/components/ui/context-menu";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { DesignEditorTool } from "~~/app/composables/useDesignToolController";
import {
  type DesignCanvasInteractionContext,
  type DesignCanvasSelectionState,
  useDesignCanvasSelection,
} from "~~/app/composables/useDesignCanvasSelection";
import {
  type DesignLayerTreeNode,
  useDesignLayerTree,
} from "~~/app/composables/useDesignLayerTree";
import { useDesignEditorState } from "~~/app/composables/useDesignEditorState";
import { useDesignHistory } from "~~/app/composables/useDesignHistory";
import {
  resolveDesignToolByShortcut,
  resolveDesignToolPreset,
  useDesignToolController,
} from "~~/app/composables/useDesignToolController";
import {
  appendDesignFrameToSceneDocument,
  appendDesignElementToSceneDocument,
  appendDesignPageToSceneDocument,
  buildDeviceMockupSceneDocument,
  canDesignFrameCreateElements,
  DEVICE_FRAME_PRESETS,
  exportArchitectureModelToMermaid,
  exportSchemaModelToDDL,
  importArchitectureFromMetadata,
  importFromDDL,
  importFromMarkdownOutline,
  importFromMermaid,
  parseSceneDocumentString,
  relayoutSceneDocument,
  removeDesignElementFromSceneDocument,
  removeDesignFrameFromSceneDocument,
  removeDesignPageFromSceneDocument,
  resolveDesignFrameExportMetadata,
  resolveDeviceFramePreset,
  resolveDisplayCompositionElementsForFrame,
  resolveDisplayCompositionElementsForPage,
  resolveCompositionElementsForPage,
  renderCompositionAssetToSvg,
  resolveCompositionElementsForFrame,
  sceneDocumentFromUnknown,
  serializeSceneDocument,
  setCurrentDesignPageInSceneDocument,
  SYSTEM_SCENE_TEMPLATES,
  updateDesignElementInSceneDocument,
  updateDesignFrameInSceneDocument,
  updateDesignPageInSceneDocument,
} from "~~/shared/utils/scene-document";
import WLDesignContainer from "../wl-design/WLDesignContainer.vue";
import WLDesignLayer from "../wl-design/WLDesignLayer.vue";
import WLDesignLayout from "../wl-design/WLDesignLayout.vue";
import UiContextMenu from "../ui/UiContextMenu.vue";
import WorkspaceDesignInspector from "./design/WorkspaceDesignInspector.vue";
import WorkspaceDesignSidebarTabs from "./design/WorkspaceDesignSidebarTabs.vue";
import WorkspaceDesignStage from "./design/WorkspaceDesignStage.vue";
import WorkspaceDesignToolbar from "./design/WorkspaceDesignToolbar.vue";

// WorkspaceDesignCanvas 作为 Vue Flow stage 适配层继续保留在 WorkspaceDesignStage 内部。

type DesignSidebarTab = "pages" | "frames" | "assets";
type StageViewportState = { x: number; y: number; zoom: number };
type SidebarLayerTreeRow = {
  node: DesignLayerTreeNode;
  depth: number;
};

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    hasDesignResource?: boolean;
    designResourceId?: string;
    boundResourceId?: string;
    designPanelTitle?: string;
    collabRevision?: number;
    collabConnected?: boolean;
    collabConnectionText?: string;
    collabDrawError?: string;
    collabPresenceCursors?: WorkspaceCollabCursorUser[];
    fontSizePreset?: WorkspaceFontSizePreset | "";
    tabSpacingPreset?: WorkspaceTabSpacingPreset | "";
  }>(),
  {
    modelValue: "",
    hasDesignResource: false,
    designResourceId: "",
    boundResourceId: "",
    designPanelTitle: "设计画布",
    collabRevision: 0,
    collabConnected: false,
    collabConnectionText: "",
    collabDrawError: "",
    collabPresenceCursors: () => [],
    fontSizePreset: "",
    tabSpacingPreset: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  updateCollabCursor: [value: { cursorX?: number, cursorY?: number }];
}>();

const templateOptions = SYSTEM_SCENE_TEMPLATES.filter(
  (template) => template.category === "composition",
);
const DEFAULT_TEMPLATE_KEY =
  templateOptions[0]?.templateKey || "device-showcase";
const DEFAULT_DEVICE_FRAME_KEY =
  DEVICE_FRAME_PRESETS[0]?.key || "iphone-16-pro";

const draftDocument = ref<SceneDocument>(
  buildDeviceMockupSceneDocument({
    title: "统一设计文档",
    subtitle: "一个文档多 Page，一个 Page 多 Frame，图表与设计稿统一协作。",
    badge: "Design",
    templateKey: DEFAULT_TEMPLATE_KEY,
    deviceFramePresetKey: DEFAULT_DEVICE_FRAME_KEY,
  }),
);
const panelRootRef = ref<HTMLElement | null>(null);
const activeTool = ref<DesignEditorTool>("select");
const stageViewportX = ref(0);
const stageViewportY = ref(0);
const stageViewportZoom = ref(1);
const activeSidebarTab = ref<DesignSidebarTab>("pages");
const sidebarCollapsed = ref(false);
const inspectorCollapsed = ref(false);
const actionMenuOpen = ref(false);
const actionMenuRef = ref<HTMLElement | null>(null);
const collapsedLayerNodeIds = ref<string[]>([]);
const layerTreeMenuVisible = ref(false);
const layerTreeMenuNodeId = ref("");
const layerTreeMenuItems = ref<ContextMenuItem[]>([]);
const layerTreeMenuAnchorEl = ref<HTMLElement | null>(null);
const inspectorHeaderEditing = ref(false);
const inspectorHeaderDraft = ref("");
const inspectorHeaderInputRef = ref<HTMLInputElement | null>(null);
const syncingFromModel = ref(false);
const lastAppliedSceneJson = ref("");
const diagramEditorFrameId = ref("");
const diagramSourceFormat = ref<
  "mermaid" | "markdown_outline" | "ddl" | "architecture"
>("mermaid");
const diagramSourceText = ref("");
const diagramSelectedGroupId = ref("");
const diagramSelectedNodeId = ref("");
const diagramSelectedEdgeId = ref("");
const localPageViewportById = ref<Record<string, StageViewportState>>({});
const temporaryHandToolActive = ref(false);
const deepSelectModifierPressed = ref(false);
const toolSwitchHint = ref("");
let toolSwitchHintTimer: ReturnType<typeof setTimeout> | null = null;

const TOOL_SWITCH_HINT_DURATION = 1600;

const resolvedDesignPanelFontSizePreset = computed<WorkspaceFontSizePreset>(
  () => props.fontSizePreset || "md",
);
const resolvedDesignPanelTabSpacingPreset = computed<WorkspaceTabSpacingPreset>(
  () => props.tabSpacingPreset || "default",
);
const layerTreeMenuFontSizePreset = computed<WorkspaceFontSizePreset>(() => {
  return props.fontSizePreset || "sm";
});
const layerTreeMenuSpacingPreset = computed<WorkspaceTabSpacingPreset>(() => {
  return props.tabSpacingPreset || "compact";
});
const layerTreeMetricsStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};

  if (resolvedDesignPanelTabSpacingPreset.value === "compact") {
    Object.assign(style, {
      "--wl-design-layer-indent-base": "8px",
      "--wl-design-layer-indent-step": "12px",
      "--wl-design-layer-row-gap": "5px",
      "--wl-design-layer-row-radius": "3px",
      "--wl-design-layer-row-padding-y": "3.5px",
      "--wl-design-layer-row-padding-right": "4px",
      "--wl-design-layer-toggle-size": "21px",
      "--wl-design-layer-action-size": "19px",
      "--wl-design-layer-action-gap": "2px",
    });
  }
  else if (resolvedDesignPanelTabSpacingPreset.value === "relaxed") {
    Object.assign(style, {
      "--wl-design-layer-indent-base": "11px",
      "--wl-design-layer-indent-step": "15px",
      "--wl-design-layer-row-gap": "7px",
      "--wl-design-layer-row-radius": "5px",
      "--wl-design-layer-row-padding-y": "5.75px",
      "--wl-design-layer-row-padding-right": "5px",
      "--wl-design-layer-toggle-size": "25px",
      "--wl-design-layer-action-size": "23px",
      "--wl-design-layer-action-gap": "3px",
    });
  }
  else {
    Object.assign(style, {
      "--wl-design-layer-indent-base": "9px",
      "--wl-design-layer-indent-step": "13px",
      "--wl-design-layer-row-gap": "6px",
      "--wl-design-layer-row-radius": "4px",
      "--wl-design-layer-row-padding-y": "4.6px",
      "--wl-design-layer-row-padding-right": "4px",
      "--wl-design-layer-toggle-size": "23px",
      "--wl-design-layer-action-size": "21px",
      "--wl-design-layer-action-gap": "2px",
    });
  }

  if (resolvedDesignPanelFontSizePreset.value === "xs") {
    Object.assign(style, {
      "--wl-design-layer-label-size": "10.5px",
      "--wl-design-layer-label-line-height": "18px",
      "--wl-design-layer-meta-size": "9px",
      "--wl-design-layer-meta-line-height": "15px",
      "--wl-design-layer-icon-size": "14px",
      "--wl-design-layer-chevron-icon-size": "13px",
      "--wl-design-layer-action-icon-size": "14px",
    });
  }
  else if (resolvedDesignPanelFontSizePreset.value === "sm") {
    Object.assign(style, {
      "--wl-design-layer-label-size": "11px",
      "--wl-design-layer-label-line-height": "18px",
      "--wl-design-layer-meta-size": "9.25px",
      "--wl-design-layer-meta-line-height": "15px",
      "--wl-design-layer-icon-size": "14.5px",
      "--wl-design-layer-chevron-icon-size": "13.5px",
      "--wl-design-layer-action-icon-size": "14.5px",
    });
  }
  else if (resolvedDesignPanelFontSizePreset.value === "lg") {
    Object.assign(style, {
      "--wl-design-layer-label-size": "12.5px",
      "--wl-design-layer-label-line-height": "21px",
      "--wl-design-layer-meta-size": "10px",
      "--wl-design-layer-meta-line-height": "16px",
      "--wl-design-layer-icon-size": "16px",
      "--wl-design-layer-chevron-icon-size": "14.5px",
      "--wl-design-layer-action-icon-size": "16px",
    });
  }
  else if (resolvedDesignPanelFontSizePreset.value === "xl") {
    Object.assign(style, {
      "--wl-design-layer-label-size": "13px",
      "--wl-design-layer-label-line-height": "22px",
      "--wl-design-layer-meta-size": "10.5px",
      "--wl-design-layer-meta-line-height": "17px",
      "--wl-design-layer-icon-size": "16.5px",
      "--wl-design-layer-chevron-icon-size": "15px",
      "--wl-design-layer-action-icon-size": "16.5px",
    });
  }
  else {
    Object.assign(style, {
      "--wl-design-layer-label-size": "11.5px",
      "--wl-design-layer-label-line-height": "19px",
      "--wl-design-layer-meta-size": "9.5px",
      "--wl-design-layer-meta-line-height": "15px",
      "--wl-design-layer-icon-size": "15px",
      "--wl-design-layer-chevron-icon-size": "14px",
      "--wl-design-layer-action-icon-size": "15px",
    });
  }

  return style;
});

function resolveLayerTreeGuideMetrics(): {
  indentBase: number;
  indentStep: number;
  toggleSize: number;
} {
  if (resolvedDesignPanelTabSpacingPreset.value === "compact") {
    return {
      indentBase: 8,
      indentStep: 12,
      toggleSize: 21,
    };
  }
  if (resolvedDesignPanelTabSpacingPreset.value === "relaxed") {
    return {
      indentBase: 11,
      indentStep: 15,
      toggleSize: 25,
    };
  }
  return {
    indentBase: 9,
    indentStep: 13,
    toggleSize: 23,
  };
}

function resolveLayerTreeRowPaddingLeft(depth: number): string {
  const { indentBase, indentStep } = resolveLayerTreeGuideMetrics();
  return `${indentBase + depth * indentStep}px`;
}

function resolveLayerTreeGuideLeft(depth: number): string {
  const { indentBase, indentStep, toggleSize } = resolveLayerTreeGuideMetrics();
  return `${indentBase + depth * indentStep + Math.round(toggleSize / 2)}px`;
}

function resolveLayerTreeConnectorStyle(depth: number): Record<string, string> {
  const { indentBase, indentStep, toggleSize } = resolveLayerTreeGuideMetrics();
  const left = indentBase + (depth - 1) * indentStep + Math.round(toggleSize / 2);
  const width = Math.max(indentStep - Math.round(toggleSize / 2), 7);
  return {
    left: `${left}px`,
    width: `${width}px`,
  };
}

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeStageViewportState(
  value?: Partial<StageViewportState> | null,
): StageViewportState {
  const resolvedX = Number(value?.x ?? 0);
  const resolvedY = Number(value?.y ?? 0);
  const resolvedZoom = Number(value?.zoom ?? 1);
  return {
    x: Math.round(Number.isFinite(resolvedX) ? resolvedX : 0),
    y: Math.round(Number.isFinite(resolvedY) ? resolvedY : 0),
    zoom: Number.isFinite(resolvedZoom) && resolvedZoom > 0 ? resolvedZoom : 1,
  };
}

function resolveStageViewportState(
  page?: DesignPageModel | null,
): StageViewportState {
  const pageId = normalizeString(page?.id);
  if (pageId && localPageViewportById.value[pageId])
    return localPageViewportById.value[pageId]!;
  return normalizeStageViewportState(page?.viewport);
}

function syncStageViewportState(page?: DesignPageModel | null): void {
  const nextViewport = resolveStageViewportState(page);
  stageViewportX.value = nextViewport.x;
  stageViewportY.value = nextViewport.y;
  stageViewportZoom.value = nextViewport.zoom;
}

function rememberStageViewportState(
  pageId: string,
  payload: StageViewportState,
): void {
  const normalizedPageId = normalizeString(pageId);
  if (!normalizedPageId) return;

  localPageViewportById.value = {
    ...localPageViewportById.value,
    [normalizedPageId]: normalizeStageViewportState(payload),
  };
}

function closeActionMenu(): void {
  actionMenuOpen.value = false;
}

function closeLayerTreeMenu(): void {
  layerTreeMenuVisible.value = false;
  layerTreeMenuNodeId.value = "";
  layerTreeMenuAnchorEl.value = null;
  layerTreeMenuItems.value = [];
}

function toggleActionMenu(): void {
  actionMenuOpen.value = !actionMenuOpen.value;
}

function toggleSidebarCollapsed(): void {
  closeActionMenu();
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

function toggleInspectorCollapsed(): void {
  inspectorCollapsed.value = !inspectorCollapsed.value;
}

function handleActionMenuPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (
    !actionMenuOpen.value ||
    !actionMenuRef.value ||
    !(target instanceof Node)
  )
    return;
  if (!actionMenuRef.value.contains(target)) closeActionMenu();
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function shouldHandlePanelKeyboardEvent(event: KeyboardEvent): boolean {
  if (isEditableKeyboardTarget(event.target)) return false;
  if (!panelRootRef.value) return false;
  const target = event.target;
  return target instanceof Node
    ? panelRootRef.value.contains(target)
    : panelRootRef.value.contains(document.activeElement);
}

function clearTransientInteractionState(): void {
  temporaryHandToolActive.value = false;
  deepSelectModifierPressed.value = false;
}

function clearToolSwitchHintTimer(): void {
  if (!toolSwitchHintTimer) return;
  clearTimeout(toolSwitchHintTimer);
  toolSwitchHintTimer = null;
}

function showToolSwitchHint(tool: DesignEditorTool): void {
  const preset = resolveDesignToolPreset(tool);
  if (!preset) return;
  toolSwitchHint.value = `已切换到${preset.label}工具 · ${preset.shortcutLabel}`;
  clearToolSwitchHintTimer();
  toolSwitchHintTimer = setTimeout(() => {
    toolSwitchHint.value = "";
    toolSwitchHintTimer = null;
  }, TOOL_SWITCH_HINT_DURATION);
}

function setActiveDesignTool(tool: DesignEditorTool): void {
  if (activeTool.value === tool) return;
  designToolController.setActiveTool(tool);
  showToolSwitchHint(tool);
}

function syncModifierInteractionState(event: KeyboardEvent): void {
  deepSelectModifierPressed.value = Boolean(event.metaKey || event.ctrlKey);
}

function handlePanelKeydown(event: KeyboardEvent): void {
  syncModifierInteractionState(event);
  if (!shouldHandlePanelKeyboardEvent(event)) return;

  const key = normalizeString(event.key).toLowerCase();
  const metaOrCtrl = event.metaKey || event.ctrlKey;
  if (key === " " || key === "spacebar") {
    event.preventDefault();
    temporaryHandToolActive.value = true;
    return;
  }

  if (metaOrCtrl && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redoDesignChange();
    else undoDesignChange();
    return;
  }

  if (metaOrCtrl && key === "y") {
    event.preventDefault();
    redoDesignChange();
    return;
  }

  if (!metaOrCtrl && !event.altKey) {
    const nextTool = resolveDesignToolByShortcut(key);
    if (nextTool) {
      event.preventDefault();
      setActiveDesignTool(nextTool);
      return;
    }
  }

  if (key === "escape") {
    if (actionMenuOpen.value) closeActionMenu();
    if (selectionState.value.editingFrameId) {
      event.preventDefault();
      designSelection.exitFrameEditing();
    }
    return;
  }

  if (key !== "enter" && key !== "return") return;

  if (event.shiftKey && selectionState.value.editingFrameId) {
    event.preventDefault();
    designSelection.exitFrameEditing();
    return;
  }

  if (
    selectionState.value.scope !== "frame" ||
    selectedFrames.value.length !== 1 ||
    !selectedFrame.value
  )
    return;

  if (!canDesignFrameCreateElements(selectedFrame.value)) return;

  event.preventDefault();
  designSelection.enterFrameEditing(selectedFrame.value.id);
}

function handlePanelKeyup(event: KeyboardEvent): void {
  syncModifierInteractionState(event);
  const key = normalizeString(event.key).toLowerCase();
  if (key === " " || key === "spacebar") temporaryHandToolActive.value = false;
}

function cloneDesignElement(element: DesignElementModel): DesignElementModel {
  return {
    ...element,
    points: element.points
      ? element.points.map((point) => ({ ...point }))
      : undefined,
    style: element.style ? { ...element.style } : undefined,
    metadata: element.metadata ? { ...element.metadata } : undefined,
  };
}

function cloneCompositionModel(
  composition: CompositionModel,
): CompositionModel {
  return {
    ...composition,
    pages: (composition.pages || []).map((page) => ({
      ...page,
      frameIds: [...(page.frameIds || [])],
      viewport: {
        x: page.viewport?.x || 0,
        y: page.viewport?.y || 0,
        zoom: page.viewport?.zoom || 1,
      },
      metadata: page.metadata ? { ...page.metadata } : undefined,
    })),
    frames: (composition.frames || []).map((frame) => ({
      ...frame,
      elements: (() => {
        const resolvedElements = resolveCompositionElementsForFrame(
          composition,
          frame.id,
        );
        return (
          resolvedElements.length > 0 ? resolvedElements : frame.elements || []
        ).map(cloneDesignElement);
      })(),
      embeddedScene: frame.embeddedScene
        ? sceneDocumentFromUnknown(frame.embeddedScene, {
            fallbackDrawMode: "diagram",
            fallbackSourceType: "manual",
          })
        : undefined,
      themeTokens: frame.themeTokens ? { ...frame.themeTokens } : undefined,
      metadata: frame.metadata ? { ...frame.metadata } : undefined,
    })),
    elements: (composition.elements || []).map(cloneDesignElement),
    assets: (composition.assets || []).map((asset) => ({
      ...asset,
      metadata: asset.metadata ? { ...asset.metadata } : undefined,
    })),
    slots: { ...(composition.slots || {}) },
    themeTokens: { ...(composition.themeTokens || {}) },
    layoutRules: { ...(composition.layoutRules || {}) },
    allowedBlocks: [...(composition.allowedBlocks || [])],
    exportPresets: [...(composition.exportPresets || [])],
    blocks: (composition.blocks || []).map((block) => ({
      ...block,
      metadata: block.metadata ? { ...block.metadata } : undefined,
    })),
    metadata: { ...(composition.metadata || {}) },
  };
}

function sanitizeGraphId(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function cloneGraphSourceNode(node: GraphSourceNode): GraphSourceNode {
  return {
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
  };
}

function cloneGraphSourceEdge(edge: GraphSourceEdge): GraphSourceEdge {
  return {
    ...edge,
    metadata: edge.metadata ? { ...edge.metadata } : undefined,
  };
}

function cloneGraphSourceGroup(group: GraphSourceGroup): GraphSourceGroup {
  return {
    ...group,
    childNodeIds: [...(group.childNodeIds || [])],
    metadata: group.metadata ? { ...group.metadata } : undefined,
  };
}

function escapeMermaidText(value: string): string {
  return normalizeString(value)
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "/")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function cloneGraphSourceModel(model: GraphSourceModel): GraphSourceModel {
  return {
    ...model,
    nodes: (model.nodes || []).map(cloneGraphSourceNode),
    edges: (model.edges || []).map(cloneGraphSourceEdge),
    groups: (model.groups || []).map(cloneGraphSourceGroup),
    sourceText: normalizeString(model.sourceText) || undefined,
    metadata: model.metadata ? { ...model.metadata } : undefined,
  };
}

function exportGraphSourceToMermaid(model: GraphSourceModel): string {
  const graph = cloneGraphSourceModel(model);
  const header =
    graph.diagramType === "flowchart"
      ? "flowchart TD"
      : `%% diagramType: ${graph.diagramType}\nflowchart TD`;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const renderedStandaloneNodes = new Set<string>();
  const lines: string[] = [header];

  for (const group of graph.groups || []) {
    lines.push(
      `%% group: ${JSON.stringify({
        id: group.id,
        label: group.label,
        childNodeIds: group.childNodeIds || [],
        metadata: group.metadata || {},
      })}`,
    );
  }

  function renderNodeToken(nodeId: string): string {
    const node = nodeById.get(nodeId);
    const safeId = sanitizeGraphId(
      node?.id || nodeId,
      `node-${renderedStandaloneNodes.size + 1}`,
    );
    const label = escapeMermaidText(node?.label || safeId);
    return `${safeId}["${label}"]`;
  }

  for (const edge of graph.edges || []) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    renderedStandaloneNodes.add(edge.source);
    renderedStandaloneNodes.add(edge.target);
    const label = escapeMermaidText(edge.label || "");
    lines.push(
      label
        ? `  ${renderNodeToken(edge.source)} -->|"${label}"| ${renderNodeToken(edge.target)}`
        : `  ${renderNodeToken(edge.source)} --> ${renderNodeToken(edge.target)}`,
    );
  }

  for (const node of graph.nodes || []) {
    if (renderedStandaloneNodes.has(node.id)) continue;
    lines.push(`  ${renderNodeToken(node.id)}`);
  }

  if (lines.length === 1) lines.push('  empty["Untitled diagram"]');

  return lines.join("\n");
}

function ensureUniqueGraphNodeId(
  model: GraphSourceModel,
  rawId: string,
  fallback: string,
  excludeId = "",
): string {
  const baseId = sanitizeGraphId(rawId, fallback);
  const takenIds = new Set(
    (model.nodes || [])
      .map((node) => node.id)
      .filter((id) => id && id !== excludeId),
  );
  if (!takenIds.has(baseId)) return baseId;

  let cursor = 2;
  let nextId = `${baseId}-${cursor}`;
  while (takenIds.has(nextId)) {
    cursor += 1;
    nextId = `${baseId}-${cursor}`;
  }
  return nextId;
}

function ensureUniqueGraphEdgeId(
  model: GraphSourceModel,
  rawId: string,
  fallback: string,
  excludeId = "",
): string {
  const baseId = sanitizeGraphId(rawId, fallback);
  const takenIds = new Set(
    (model.edges || [])
      .map((edge) => edge.id)
      .filter((id) => id && id !== excludeId),
  );
  if (!takenIds.has(baseId)) return baseId;

  let cursor = 2;
  let nextId = `${baseId}-${cursor}`;
  while (takenIds.has(nextId)) {
    cursor += 1;
    nextId = `${baseId}-${cursor}`;
  }
  return nextId;
}

function ensureUniqueGraphGroupId(
  model: GraphSourceModel,
  rawId: string,
  fallback: string,
  excludeId = "",
): string {
  const baseId = sanitizeGraphId(rawId, fallback);
  const takenIds = new Set(
    (model.groups || [])
      .map((group) => group.id)
      .filter((id) => id && id !== excludeId),
  );
  if (!takenIds.has(baseId)) return baseId;

  let cursor = 2;
  let nextId = `${baseId}-${cursor}`;
  while (takenIds.has(nextId)) {
    cursor += 1;
    nextId = `${baseId}-${cursor}`;
  }
  return nextId;
}

function resolveNodeGroupId(
  model: GraphSourceModel,
  nodeId: string,
  fallbackGroupId = "",
): string {
  const normalizedFallback = normalizeString(fallbackGroupId);
  if (
    normalizedFallback &&
    (model.groups || []).some((group) => group.id === normalizedFallback)
  )
    return normalizedFallback;
  return (
    (model.groups || []).find((group) =>
      (group.childNodeIds || []).includes(nodeId),
    )?.id || ""
  );
}

function parseFrameMetric(value: unknown, fallback: number, min = 0): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function createDefaultDesignSceneDocument(): SceneDocument {
  return buildDeviceMockupSceneDocument({
    title: "统一设计文档",
    subtitle: "一个文档多 Page，一个 Page 多 Frame，图表与设计稿统一协作。",
    badge: "Design",
    templateKey: DEFAULT_TEMPLATE_KEY,
    deviceFramePresetKey: DEFAULT_DEVICE_FRAME_KEY,
  });
}

function resolveIncomingDesignDocument(rawValue: string): {
  document: SceneDocument;
  shouldPersistNormalized: boolean;
} {
  const normalizedRawValue = normalizeString(rawValue);
  if (!normalizedRawValue) {
    return {
      document: createDefaultDesignSceneDocument(),
      shouldPersistNormalized: true,
    };
  }

  const parsed = parseSceneDocumentString(normalizedRawValue, {
    fallbackDrawMode: "composition",
    fallbackSourceType: "image_mockup",
  });
  const migratedFromLegacyDraw = Boolean(
    parsed.metadata?.migratedFromLegacyDraw,
  );

  if (
    migratedFromLegacyDraw ||
    parsed.drawMode !== "composition" ||
    parsed.sourceModel.kind !== "composition"
  ) {
    return {
      document: createDefaultDesignSceneDocument(),
      shouldPersistNormalized: true,
    };
  }

  return {
    document: relayoutSceneDocument({
      ...parsed,
      drawMode: "composition",
      editorEngine: "vueflow",
    }),
    shouldPersistNormalized: false,
  };
}

const isBoundToDesignResource = computed(() => {
  const designResourceId = normalizeString(props.designResourceId);
  const boundResourceId = normalizeString(props.boundResourceId);
  return Boolean(designResourceId) && designResourceId === boundResourceId;
});

const compositionModel = computed<CompositionModel>(() => {
  return draftDocument.value.sourceModel.kind === "composition"
    ? draftDocument.value.sourceModel
    : (createDefaultDesignSceneDocument().sourceModel as CompositionModel);
});

const pages = computed(() => compositionModel.value.pages || []);
const currentPage = computed(() => {
  return (
    pages.value.find(
      (page) =>
        page.id === normalizeString(compositionModel.value.currentPageId),
    ) ||
    pages.value[0] ||
    null
  );
});
const currentPageFrames = computed(() => {
  return (compositionModel.value.frames || []).filter(
    (frame) => frame.pageId === currentPage.value?.id,
  );
});
const imageAssets = computed(() => {
  return (compositionModel.value.assets || []).filter(
    (asset) => asset.metadata?.role !== "device_shell",
  );
});
const deviceShellAssets = computed(() => {
  return (compositionModel.value.assets || []).filter(
    (asset) => asset.metadata?.role === "device_shell",
  );
});
const availableDeviceArtboards = computed(() => {
  return (compositionModel.value.frames || [])
    .filter((frame) => frame.kind === "device_artboard")
    .map((frame) => ({
      id: frame.id,
      name: frame.name,
      presetKey: frame.deviceFramePresetKey || "",
      pageId: frame.pageId,
    }));
});
function resolveFrameElements(
  frame: DesignFrameModel | null | undefined,
): DesignElementModel[] {
  if (!frame) return [];
  const resolvedElements = resolveCompositionElementsForFrame(
    compositionModel.value,
    frame.id,
  );
  return (
    resolvedElements.length > 0 ? resolvedElements : frame.elements || []
  ).map(cloneDesignElement);
}

function resolveDisplayFrameElements(
  frame: DesignFrameModel | null | undefined,
): DesignElementModel[] {
  if (!frame) return [];
  return resolveDisplayCompositionElementsForFrame(
    compositionModel.value,
    frame,
  ).map(cloneDesignElement);
}
const currentPageElements = computed(() => {
  if (!currentPage.value) return [];
  return [
    ...resolveDisplayCompositionElementsForPage(
      compositionModel.value,
      currentPage.value.id,
    ).map(cloneDesignElement),
    ...currentPageFrames.value.flatMap((frame) =>
      resolveDisplayFrameElements(frame),
    ),
  ];
});
const designSelection = useDesignCanvasSelection({
  frames: currentPageFrames,
  elements: currentPageElements,
});
const selectionState = designSelection.state;
const selectedFrameIds = designSelection.selectedFrameIds;
const selectedFrameId = designSelection.selectedFrameId;
const selectedElementIds = designSelection.selectedElementIds;
const selectedElementId = designSelection.selectedElementId;
const designHistory = useDesignHistory(
  serializeSceneDocument(draftDocument.value),
);
const interactionContext = computed<DesignCanvasInteractionContext>(() => {
  return {
    effectiveTool: temporaryHandToolActive.value ? "hand" : activeTool.value,
    isTemporaryHandActive: temporaryHandToolActive.value,
    isDeepSelectModifierPressed: deepSelectModifierPressed.value,
  };
});
const diagramEditorFrame = computed(() => {
  return (
    currentPageFrames.value.find(
      (frame) => frame.id === diagramEditorFrameId.value,
    ) || null
  );
});
const diagramEditorScene = computed<SceneDocument | null>(() => {
  const embeddedScene = diagramEditorFrame.value?.embeddedScene;
  return embeddedScene
    ? sceneDocumentFromUnknown(embeddedScene, {
        fallbackDrawMode: "diagram",
        fallbackSourceType: "manual",
      })
    : null;
});
const diagramEditorGraph = computed<GraphSourceModel | null>(() => {
  return diagramEditorScene.value?.sourceModel.kind === "graph"
    ? diagramEditorScene.value.sourceModel
    : null;
});
const diagramSelectedGroup = computed<GraphSourceGroup | null>(() => {
  return (
    diagramEditorGraph.value?.groups?.find(
      (group) => group.id === diagramSelectedGroupId.value,
    ) || null
  );
});
const diagramSelectedGroupSceneNode = computed(() => {
  return (
    diagramEditorScene.value?.sceneModel?.nodes?.find(
      (node) =>
        node.id === diagramSelectedGroupId.value && node.type === "group",
    ) || null
  );
});
const diagramSelectedNode = computed<GraphSourceNode | null>(() => {
  return (
    diagramEditorGraph.value?.nodes.find(
      (node) => node.id === diagramSelectedNodeId.value,
    ) || null
  );
});
const diagramSelectedEdge = computed<GraphSourceEdge | null>(() => {
  return (
    diagramEditorGraph.value?.edges.find(
      (edge) => edge.id === diagramSelectedEdgeId.value,
    ) || null
  );
});
const designToolController = useDesignToolController({
  activeTool,
});
const designEditorState = useDesignEditorState({
  draftDocument,
  selection: {
    frameIds: selectedFrameIds,
    primaryFrameId: selectedFrameId,
    elementIds: selectedElementIds,
    primaryElementId: selectedElementId,
  },
  viewport: {
    x: stageViewportX,
    y: stageViewportY,
    zoom: stageViewportZoom,
  },
});
const designLayerTree = useDesignLayerTree({
  page: currentPage,
  frames: currentPageFrames,
  pageRootElements: designEditorState.pageRootElements,
  resolveFrameElements,
});
const selectedFrames = designEditorState.selectedFrames;
const selectedFrame = designEditorState.selectedFrame;
function resolveDesignElementDisplayName(
  element?: DesignElementModel | null,
): string {
  const explicitName = normalizeString(element?.metadata?.name);
  if (explicitName) return explicitName;

  const text = normalizeString(element?.text);
  if (text) return text;

  const shapeKind = normalizeString(element?.shapeKind);
  if (shapeKind) return shapeKind;

  return normalizeString(element?.type);
}

function flattenDesignLayerTreeRows(
  nodes: DesignLayerTreeNode[],
  depth = 0,
): SidebarLayerTreeRow[] {
  const visibleNodes = normalizeLayerTreeNodes(nodes);
  return visibleNodes.flatMap((node) => {
    const currentRow: SidebarLayerTreeRow = {
      node,
      depth,
    };
    if (!node.children?.length || !isLayerTreeNodeExpanded(node.id))
      return [currentRow];
    return [
      currentRow,
      ...flattenDesignLayerTreeRows(node.children, depth + 1),
    ];
  });
}

const inspectorSelectionTag = computed(() => {
  const elementType = normalizeString(
    designEditorState.selectedElement.value?.type,
  );
  if (elementType) return elementType;

  const frameKind = normalizeString(selectedFrame.value?.kind);
  if (frameKind) return frameKind;

  return designEditorState.currentPage.value ? "page" : "scene";
});
const inspectorHeaderTitle = computed(() => {
  const elementName = resolveDesignElementDisplayName(
    designEditorState.selectedElement.value,
  );
  if (elementName) return elementName;

  const frameName = normalizeString(selectedFrame.value?.name);
  if (frameName) return frameName;

  const pageName = normalizeString(designEditorState.currentPage.value?.name);
  if (pageName) return pageName;

  return "属性";
});
const canRenameInspectorHeader = computed(() => {
  return Boolean(
    designEditorState.selectedElement.value ||
    selectedFrame.value ||
    designEditorState.currentPage.value,
  );
});
const canLockInspectorTarget = computed(() =>
  Boolean(selectedElementIds.value.length || selectedFrameIds.value.length),
);
const canDuplicateInspectorTarget = computed(() =>
  Boolean(selectedElementIds.value.length || selectedFrameIds.value.length),
);
const canDeleteInspectorTarget = computed(() =>
  Boolean(selectedElementIds.value.length || selectedFrameIds.value.length),
);
const inspectorTargetLocked = computed(() => {
  if (selectedElementIds.value.length > 0)
    return resolveRawSelectedElements().every((element) => element.locked);
  if (selectedFrameIds.value.length > 0)
    return selectedFrames.value.every((frame) => Boolean(frame.locked));
  return false;
});
const inspectorHasHeaderExtra = computed(() => {
  return Boolean(inspectorSelectionTag.value);
});
watch(
  [selectedElementId, selectedFrameId, () => currentPage.value?.id || ""],
  () => {
    inspectorHeaderEditing.value = false;
    inspectorHeaderDraft.value = inspectorHeaderTitle.value;
  },
  { immediate: true },
);
const selectedElementFrame = computed(() => {
  const frameId = normalizeString(
    designEditorState.selectedElement.value?.frameId,
  );
  if (!frameId) return null;
  return currentPageFrames.value.find((frame) => frame.id === frameId) || null;
});
const currentPageFrameMap = computed(() => {
  return new Map(
    currentPageFrames.value.map((frame) => [normalizeString(frame.id), frame]),
  );
});
const currentPageElementMap = computed(() => {
  return new Map(
    designEditorState.allPageElements.value.map((element) => [
      normalizeString(element.id),
      element,
    ]),
  );
});
const frameElementsById = computed<Record<string, DesignElementModel[]>>(() => {
  return Object.fromEntries(
    designEditorState.currentPageFrames.value.map((frame) => [
      frame.id,
      resolveDisplayFrameElements(frame),
    ]),
  );
});
const frameSidebarTreeRows = computed<SidebarLayerTreeRow[]>(() => {
  const [pageTree] = designLayerTree.tree.value;
  return flattenDesignLayerTreeRows(pageTree?.children || []);
});
const selectedLayerTreeAncestorNodeIds = computed(() => {
  const nextIds = new Set<string>();

  for (const selectedElementId of selectedElementIds.value) {
    const normalizedElementId = normalizeString(selectedElementId);
    const selectedElement = currentPageElementMap.value.get(normalizedElementId);
    if (!selectedElement) continue;

    const frameId = normalizeString(selectedElement.frameId);
    if (frameId) nextIds.add(`frame:${frameId}`);

    const visitedAncestorIds = new Set<string>();
    let cursorParentId = normalizeString(selectedElement.parentId);
    while (cursorParentId && !visitedAncestorIds.has(cursorParentId)) {
      visitedAncestorIds.add(cursorParentId);
      nextIds.add(`element:${cursorParentId}`);
      const parentElement = currentPageElementMap.value.get(cursorParentId);
      if (!parentElement) break;
      const parentFrameId = normalizeString(parentElement.frameId);
      if (parentFrameId) nextIds.add(`frame:${parentFrameId}`);
      cursorParentId = normalizeString(parentElement.parentId);
    }
  }

  return nextIds;
});
const activeLayerTreePathNodeIds = computed<string[]>(() => {
  const activeElement = currentPageElementMap.value.get(
    normalizeString(selectedElementId.value),
  );
  if (activeElement) {
    const pathNodeIds: string[] = [];
    const frameId = normalizeString(activeElement.frameId);
    if (frameId) pathNodeIds.push(`frame:${frameId}`);

    const ancestorElementNodeIds: string[] = [];
    const visitedAncestorIds = new Set<string>();
    let cursorParentId = normalizeString(activeElement.parentId);
    while (cursorParentId && !visitedAncestorIds.has(cursorParentId)) {
      visitedAncestorIds.add(cursorParentId);
      ancestorElementNodeIds.push(`element:${cursorParentId}`);
      const parentElement = currentPageElementMap.value.get(cursorParentId);
      if (!parentElement) break;
      cursorParentId = normalizeString(parentElement.parentId);
    }

    pathNodeIds.push(...ancestorElementNodeIds.reverse());
    pathNodeIds.push(`element:${normalizeString(activeElement.id)}`);
    return pathNodeIds;
  }

  const frameId = normalizeString(selectedFrameId.value);
  if (frameId) return [`frame:${frameId}`];
  return [];
});
const activeLayerTreeGuideState = computed(() => {
  const rows = frameSidebarTreeRows.value;
  const rowIndexByNodeId = new Map(
    rows.map((row, index) => [normalizeString(row.node.id), index]),
  );
  const verticalDepthsByNodeId = new Map<string, number[]>();
  const connectorDepthByNodeId = new Map<string, number>();

  for (
    let index = 0;
    index < activeLayerTreePathNodeIds.value.length - 1;
    index += 1
  ) {
    const parentNodeId = normalizeString(activeLayerTreePathNodeIds.value[index]);
    const childNodeId = normalizeString(
      activeLayerTreePathNodeIds.value[index + 1],
    );
    const parentRowIndex = rowIndexByNodeId.get(parentNodeId);
    const childRowIndex = rowIndexByNodeId.get(childNodeId);
    if (
      typeof parentRowIndex !== "number"
      || typeof childRowIndex !== "number"
      || childRowIndex <= parentRowIndex
    )
      continue;

    const parentRow = rows[parentRowIndex];
    const childRow = rows[childRowIndex];
    if (!parentRow || !childRow) continue;

    connectorDepthByNodeId.set(childNodeId, childRow.depth);

    for (
      let rowIndex = parentRowIndex + 1;
      rowIndex < childRowIndex;
      rowIndex += 1
    ) {
      const row = rows[rowIndex];
      if (!row) continue;
      const currentDepths = verticalDepthsByNodeId.get(row.node.id) || [];
      if (!currentDepths.includes(parentRow.depth)) {
        verticalDepthsByNodeId.set(row.node.id, [
          ...currentDepths,
          parentRow.depth,
        ]);
      }
    }
  }

  return {
    verticalDepthsByNodeId,
    connectorDepthByNodeId,
  };
});

function resolveActiveLayerTreeGuideDepths(nodeId: string): number[] {
  return activeLayerTreeGuideState.value.verticalDepthsByNodeId.get(
    normalizeString(nodeId),
  ) || [];
}

function resolveActiveLayerTreeConnectorDepth(nodeId: string): number {
  return activeLayerTreeGuideState.value.connectorDepthByNodeId.get(
    normalizeString(nodeId),
  ) ?? -1;
}
const canExportSingleFrame = computed(
  () => selectedFrames.value.length === 1 && Boolean(selectedFrame.value),
);
const canOpenDiagramEditor = computed(
  () =>
    selectedFrames.value.length === 1 &&
    selectedFrame.value?.kind === "diagram",
);
function renderFramePreviewMarkup(
  frameId: string,
  shellMode?: "none" | "builtin" | "external",
): string {
  const frame = resolveFrameFromDocument(draftDocument.value, frameId);
  if (!frame) return "";
  const nextDocument =
    shellMode === undefined
      ? draftDocument.value
      : updateDesignFrameInSceneDocument(draftDocument.value, frameId, {
          metadata: {
            ...(frame.metadata || {}),
            device: {
              ...(frame.metadata?.device || {}),
              shellMode,
            },
          },
        });
  return renderCompositionAssetToSvg(nextDocument, {
    frameId,
  });
}
const selectedFramePreviewSvg = computed(() => {
  if (!selectedFrame.value) return "";
  if (selectedFrame.value.kind === "device_artboard")
    return renderFramePreviewMarkup(selectedFrame.value.id, "none");
  return renderFramePreviewMarkup(selectedFrame.value.id);
});
const selectedFrameShellPreviewSvg = computed(() => {
  if (!selectedFrame.value) return "";
  if (selectedFrame.value.kind === "device_artboard")
    return renderFramePreviewMarkup(
      selectedFrame.value.id,
      selectedFrame.value.metadata?.device?.shellMode === "external"
        ? "external"
        : "builtin",
    );
  return renderFramePreviewMarkup(selectedFrame.value.id);
});

function replaceSelectionState(
  nextState: Partial<DesignCanvasSelectionState> | DesignCanvasSelectionState,
): void {
  designSelection.replaceSelection(nextState);
}

function cloneSelectionStateSnapshot(
  state: DesignCanvasSelectionState,
): DesignCanvasSelectionState {
  return {
    scope: state.scope,
    editingFrameId: state.editingFrameId,
    frameIds: [...state.frameIds],
    primaryFrameId: state.primaryFrameId,
    elementIds: [...state.elementIds],
    primaryElementId: state.primaryElementId,
  };
}

function setSelectedFrames(
  frameIds: string[],
  options: {
    primaryFrameId?: string;
  } = {},
): void {
  designSelection.setFrameSelection(frameIds, {
    primaryFrameId: options.primaryFrameId,
  });
}

function setSelectedElements(
  elementIds: string[],
  options: {
    primaryElementId?: string;
    editingFrameId?: string;
  } = {},
): void {
  designSelection.setElementSelection(elementIds, options);
}

function selectSingleFrame(frameId: string): void {
  setSelectedFrames([frameId], {
    primaryFrameId: frameId,
  });
}

function handleStageViewportChange(payload: {
  x: number;
  y: number;
  zoom: number;
}): void {
  const nextViewport = normalizeStageViewportState(payload);
  stageViewportX.value = nextViewport.x;
  stageViewportY.value = nextViewport.y;
  stageViewportZoom.value = nextViewport.zoom;
  if (currentPage.value)
    rememberStageViewportState(currentPage.value.id, nextViewport);
}

function createDesignElementFromStage(
  payload: Partial<DesignElementModel>,
): void {
  const previousElementIds = new Set(
    draftDocument.value.sourceModel.kind === "composition"
      ? (draftDocument.value.sourceModel.elements || []).map((item) => item.id)
      : [],
  );
  const nextDocument = appendDesignElementToSceneDocument(
    draftDocument.value,
    payload,
  );
  const createdElement =
    nextDocument.sourceModel.kind === "composition"
      ? (nextDocument.sourceModel.elements || []).find(
          (item) => !previousElementIds.has(item.id),
        ) || null
      : null;
  commitDocument(nextDocument);
  if (!createdElement) return;
  setSelectedElements([createdElement.id], {
    primaryElementId: createdElement.id,
    editingFrameId:
      selectionState.value.editingFrameId || normalizeString(createdElement.frameId),
  });
}

function updateDesignElementFromStage(payload: {
  elementId: string;
  patch: Partial<DesignElementModel>;
  historyMergeKey?: string;
}): void {
  commitDocument(
    updateDesignElementInSceneDocument(
      draftDocument.value,
      payload.elementId,
      payload.patch,
    ),
    {
      historyMergeKey: payload.historyMergeKey,
    },
  );
}

function updateDesignElementsFromStage(payload: {
  patches: Array<{ elementId: string; patch: Partial<DesignElementModel> }>;
  historyMergeKey?: string;
}): void {
  if (!payload.patches.length) return;

  let nextDocument = draftDocument.value;
  for (const patch of payload.patches)
    nextDocument = updateDesignElementInSceneDocument(
      nextDocument,
      patch.elementId,
      patch.patch,
    );
  commitDocument(nextDocument, {
    historyMergeKey: payload.historyMergeKey,
  });
}

watch(
  [currentPageFrames, currentPage],
  () => {
    replaceSelectionState(selectionState.value);
    if (
      !currentPageFrames.value.some(
        (frame) => frame.id === diagramEditorFrameId.value,
      )
    )
      diagramEditorFrameId.value = "";
  },
  { immediate: true },
);

watch(
  () => selectedFrameId.value,
  (nextFrameId) => {
    if (
      diagramEditorFrameId.value &&
      diagramEditorFrameId.value !== nextFrameId
    )
      diagramEditorFrameId.value = "";
  },
);

watch(diagramEditorFrame, (frame) => {
  if (frame && frame.kind !== "diagram") diagramEditorFrameId.value = "";
});

watch(
  selectedFrame,
  (frame) => {
    if (!diagramEditorFrameId.value && frame?.kind === "diagram")
      syncDiagramEditorFromFrame(frame);
  },
  { immediate: true },
);

watch(
  diagramEditorGraph,
  (graph) => {
    if (
      !graph?.groups?.some((group) => group.id === diagramSelectedGroupId.value)
    )
      diagramSelectedGroupId.value = "";
    if (!graph?.nodes.some((node) => node.id === diagramSelectedNodeId.value))
      diagramSelectedNodeId.value = "";
    if (!graph?.edges.some((edge) => edge.id === diagramSelectedEdgeId.value))
      diagramSelectedEdgeId.value = "";
  },
  { immediate: true },
);

onMounted(() => {
  if (!import.meta.client) return;
  window.addEventListener("pointerdown", handleActionMenuPointerDown);
  window.addEventListener("blur", clearTransientInteractionState);
});

onBeforeUnmount(() => {
  if (!import.meta.client) return;
  window.removeEventListener("pointerdown", handleActionMenuPointerDown);
  window.removeEventListener("blur", clearTransientInteractionState);
  clearToolSwitchHintTimer();
});

function setDraftDocument(document: SceneDocument): void {
  draftDocument.value = document;
  replaceSelectionState(selectionState.value);
}

function resolveFrameFromDocument(
  document: SceneDocument,
  frameId: string,
): DesignFrameModel | null {
  if (document.sourceModel.kind !== "composition") return null;
  return (
    document.sourceModel.frames?.find((frame) => frame.id === frameId) || null
  );
}

function normalizeHistoryDocument(
  document: SceneDocument | string,
): SceneDocument {
  return typeof document === "string"
    ? sceneDocumentFromUnknown(
        parseSceneDocumentString(document, {
          fallbackDrawMode: "composition",
          fallbackSourceType: "image_mockup",
        }),
        {
          fallbackDrawMode: "composition",
          fallbackSourceType: "image_mockup",
        },
      )
    : sceneDocumentFromUnknown(document, {
        fallbackDrawMode: "composition",
        fallbackSourceType: "image_mockup",
      });
}

function preservePageViewportState(
  nextDocument: SceneDocument,
  baseDocument = draftDocument.value,
): SceneDocument {
  const normalizedNext = normalizeHistoryDocument(nextDocument);
  const normalizedBase = normalizeHistoryDocument(baseDocument);
  if (
    normalizedNext.sourceModel.kind !== "composition" ||
    normalizedBase.sourceModel.kind !== "composition"
  )
    return normalizedNext;

  const viewportByPageId = new Map(
    (normalizedBase.sourceModel.pages || []).map((page) => [
      page.id,
      normalizeStageViewportState(page.viewport),
    ]),
  );
  return {
    ...normalizedNext,
    sourceModel: {
      ...normalizedNext.sourceModel,
      pages: (normalizedNext.sourceModel.pages || []).map((page) => {
        const preservedViewport = viewportByPageId.get(page.id);
        return preservedViewport
          ? { ...page, viewport: preservedViewport }
          : page;
      }),
    },
  };
}

function syncModelValue(serialized: string): void {
  if (
    syncingFromModel.value ||
    !isBoundToDesignResource.value ||
    serialized === lastAppliedSceneJson.value
  )
    return;
  lastAppliedSceneJson.value = serialized;
  emit("update:modelValue", serialized);
}

function applyHistorySnapshot(serialized: string | null): void {
  if (!serialized) return;
  const nextDocument = preservePageViewportState(
    normalizeHistoryDocument(serialized),
  );
  const normalizedDocument = relayoutSceneDocument({
    ...nextDocument,
    drawMode: "composition",
    editorEngine: "vueflow",
  });
  setDraftDocument(normalizedDocument);
  syncModelValue(serializeSceneDocument(normalizedDocument));
}

function commitDocument(
  document: SceneDocument,
  options: { historyMergeKey?: string } = {},
): void {
  const normalizedDocument = relayoutSceneDocument({
    ...document,
    drawMode: "composition",
    editorEngine: "vueflow",
  });
  setDraftDocument(normalizedDocument);

  const serialized = serializeSceneDocument(normalizedDocument);
  designHistory.record(serialized, {
    mergeKey: options.historyMergeKey,
  });
  syncModelValue(serialized);
}

function mutateCompositionDocument(
  mutator: (composition: CompositionModel) => CompositionModel,
): void {
  const normalized = sceneDocumentFromUnknown(draftDocument.value, {
    fallbackDrawMode: "composition",
    fallbackSourceType: "image_mockup",
  });
  if (normalized.sourceModel.kind !== "composition") return;
  const nextComposition = mutator(
    cloneCompositionModel(normalized.sourceModel),
  );
  commitDocument({
    ...normalized,
    drawMode: "composition",
    editorEngine: "vueflow",
    sourceModel: nextComposition,
  });
}

watch(
  [() => props.modelValue, isBoundToDesignResource],
  ([nextModelValue, nextIsBound]) => {
    const resolved = resolveIncomingDesignDocument(
      nextIsBound ? nextModelValue : "",
    );
    const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
    syncingFromModel.value = true;
    setDraftDocument(resolved.document);
    replaceSelectionState(selectionSnapshot);
    lastAppliedSceneJson.value = serializeSceneDocument(resolved.document);
    designHistory.reset(lastAppliedSceneJson.value);
    syncingFromModel.value = false;

    if (nextIsBound && resolved.shouldPersistNormalized) {
      lastAppliedSceneJson.value = serializeSceneDocument(resolved.document);
      emit("update:modelValue", lastAppliedSceneJson.value);
    }
  },
  { immediate: true },
);

watch(
  () => currentPage.value?.id || "",
  () => {
    syncStageViewportState(currentPage.value);
    collapsedLayerNodeIds.value = [];
    closeLayerTreeMenu();
  },
  { immediate: true },
);

watch(
  [selectedElementIds, selectedFrameIds, selectedLayerTreeAncestorNodeIds],
  () => {
    const protectedNodeIds = new Set<string>([
      ...selectedElementIds.value.map(id => `element:${normalizeString(id)}`),
      ...selectedFrameIds.value.map(id => `frame:${normalizeString(id)}`),
      ...selectedLayerTreeAncestorNodeIds.value,
    ]);
    collapsedLayerNodeIds.value = collapsedLayerNodeIds.value.filter(
      nodeId => !protectedNodeIds.has(nodeId),
    );
  },
  { immediate: true },
);

watch(frameSidebarTreeRows, (rows) => {
  if (!layerTreeMenuVisible.value)
    return;
  if (!rows.some(row => row.node.id === layerTreeMenuNodeId.value))
    closeLayerTreeMenu();
});

function selectPage(pageId: string): void {
  const nextDocument = setCurrentDesignPageInSceneDocument(
    draftDocument.value,
    pageId,
  );
  commitDocument(nextDocument);
  designSelection.clearSelection();
}

function createPage(): void {
  commitDocument(
    appendDesignPageToSceneDocument(draftDocument.value, {
      name: `Page ${pages.value.length + 1}`,
      background: currentPage.value?.background || "#0b1220",
      makeCurrent: true,
    }),
  );
}

function removePage(pageId: string): void {
  commitDocument(
    removeDesignPageFromSceneDocument(draftDocument.value, pageId),
  );
}

function movePage(pageId: string, direction: -1 | 1): void {
  mutateCompositionDocument((composition) => {
    const pageList = [...(composition.pages || [])];
    const index = pageList.findIndex((page) => page.id === pageId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= pageList.length)
      return composition;
    const [page] = pageList.splice(index, 1);
    pageList.splice(nextIndex, 0, page!);
    return {
      ...composition,
      pages: pageList,
    };
  });
}

function moveFrame(frameId: string, direction: -1 | 1): void {
  mutateCompositionDocument((composition) => {
    const frames = [...(composition.frames || [])];
    const current = frames.find((frame) => frame.id === frameId);
    if (!current) return composition;
    const pageFrames = frames.filter(
      (frame) => frame.pageId === current.pageId,
    );
    const currentIndex = pageFrames.findIndex((frame) => frame.id === frameId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= pageFrames.length)
      return composition;
    const reorderedPageFrames = [...pageFrames];
    const [movedFrame] = reorderedPageFrames.splice(currentIndex, 1);
    reorderedPageFrames.splice(nextIndex, 0, movedFrame!);
    let pointer = 0;
    return {
      ...composition,
      frames: frames.map((frame) => {
        if (frame.pageId !== current.pageId) return frame;
        const nextFrame = reorderedPageFrames[pointer];
        pointer += 1;
        return nextFrame || frame;
      }),
    };
  });
}

function createFrame(
  kind: DesignFrameKind,
  extra: Partial<DesignFrameModel> & {
    templateKey?: string;
    slots?: Record<string, unknown>;
    themeTokens?: Record<string, string>;
  } = {},
): void {
  if (!currentPage.value) return;
  const nextDocument = appendDesignFrameToSceneDocument(draftDocument.value, {
    pageId: currentPage.value.id,
    kind,
    ...extra,
  });
  const nextComposition =
    nextDocument.sourceModel.kind === "composition"
      ? nextDocument.sourceModel
      : null;
  const nextFrame =
    nextComposition?.frames?.[nextComposition.frames.length - 1] || null;
  commitDocument(nextDocument);
  setSelectedFrames(nextFrame ? [nextFrame.id] : [], {
    primaryFrameId: nextFrame?.id || "",
  });
  if (kind === "diagram" && nextFrame) {
    diagramEditorFrameId.value = nextFrame.id;
    syncDiagramEditorFromFrame(nextFrame);
  }
}

function duplicateSelectedFrame(): void {
  if (!selectedFrames.value.length) return;

  let nextDocument = draftDocument.value;
  const duplicatedFrameIds: string[] = [];
  for (const frame of selectedFrames.value) {
    nextDocument = appendDesignFrameToSceneDocument(nextDocument, {
      ...frame,
      id: "",
      pageId: frame.pageId,
      name: `${frame.name} 副本`,
      x: frame.x + 48,
      y: frame.y + 48,
      elements: resolveFrameElements(frame),
      embeddedScene: frame.embeddedScene
        ? sceneDocumentFromUnknown(frame.embeddedScene, {
            fallbackDrawMode: "diagram",
            fallbackSourceType: "manual",
          })
        : undefined,
    });

    const nextComposition =
      nextDocument.sourceModel.kind === "composition"
        ? nextDocument.sourceModel
        : null;
    const nextFrame =
      nextComposition?.frames?.[nextComposition.frames.length - 1] || null;
    if (nextFrame) duplicatedFrameIds.push(nextFrame.id);
  }

  const nextComposition =
    nextDocument.sourceModel.kind === "composition"
      ? nextDocument.sourceModel
      : null;
  const nextFrame = duplicatedFrameIds.length
    ? nextComposition?.frames?.find(
        (frame) =>
          frame.id === duplicatedFrameIds[duplicatedFrameIds.length - 1],
      )
    : null;
  commitDocument(nextDocument);
  setSelectedFrames(duplicatedFrameIds, {
    primaryFrameId: duplicatedFrameIds[duplicatedFrameIds.length - 1] || "",
  });
  if (duplicatedFrameIds.length === 1 && nextFrame?.kind === "diagram") {
    diagramEditorFrameId.value = nextFrame.id;
    syncDiagramEditorFromFrame(nextFrame);
  }
}

function removeSelectedFrame(): void {
  if (!selectedFrames.value.length) return;

  let nextDocument = draftDocument.value;
  for (const frame of selectedFrames.value)
    nextDocument = removeDesignFrameFromSceneDocument(nextDocument, frame.id);
  commitDocument(nextDocument);
  designSelection.clearSelection();
}

function duplicateSelectedElement(): void {
  const elements = resolveRawSelectedElements();
  if (!elements.length) return;

  let nextDocument = draftDocument.value;
  const duplicatedElementIds: string[] = [];
  for (const element of elements) {
    const previousElementIds = new Set(
      nextDocument.sourceModel.kind === "composition"
        ? (nextDocument.sourceModel.elements || []).map((item) => item.id)
        : [],
    );
    nextDocument = appendDesignElementToSceneDocument(nextDocument, {
      ...element,
      id: "",
      x: element.x + 24,
      y: element.y + 24,
      zIndex: element.zIndex + 1,
      metadata: {
        ...(element.metadata || {}),
      },
      style: element.style ? { ...element.style } : undefined,
      points: element.points
        ? element.points.map((point) => ({ ...point }))
        : undefined,
    });

    const nextComposition =
      nextDocument.sourceModel.kind === "composition"
        ? nextDocument.sourceModel
        : null;
    const duplicatedElement =
      nextComposition?.elements?.find(
        (item) => !previousElementIds.has(item.id),
      ) || null;
    if (duplicatedElement) duplicatedElementIds.push(duplicatedElement.id);
  }

  commitDocument(nextDocument);
  setSelectedElements(duplicatedElementIds, {
    primaryElementId:
      duplicatedElementIds[duplicatedElementIds.length - 1] || "",
    editingFrameId: selectionState.value.editingFrameId,
  });
}

function removeSelectedElement(): void {
  const elements = resolveRawSelectedElements();
  if (!elements.length) return;

  let nextDocument = draftDocument.value;
  for (const element of elements)
    nextDocument = removeDesignElementFromSceneDocument(
      nextDocument,
      element.id,
    );
  commitDocument(nextDocument);
  designSelection.clearSelection();
}

function toggleSelectedElementsLocked(): void {
  const elements = resolveRawSelectedElements();
  if (!elements.length) return;

  const shouldLock = elements.some((element) => !element.locked);
  const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
  let nextDocument = draftDocument.value;
  for (const element of elements)
    nextDocument = updateDesignElementInSceneDocument(
      nextDocument,
      element.id,
      { locked: shouldLock },
    );
  commitDocument(nextDocument);
  replaceSelectionState(selectionSnapshot);
}

function runInspectorHeaderLockAction(): void {
  if (selectedElementIds.value.length > 0) {
    toggleSelectedElementsLocked();
    return;
  }
  if (selectedFrameIds.value.length > 0) toggleSelectedFramesLocked();
}

function runInspectorHeaderDuplicateAction(): void {
  if (selectedElementIds.value.length > 0) {
    duplicateSelectedElement();
    return;
  }
  if (selectedFrameIds.value.length > 0) duplicateSelectedFrame();
}

function runInspectorHeaderDeleteAction(): void {
  if (selectedElementIds.value.length > 0) {
    removeSelectedElement();
    return;
  }
  if (selectedFrameIds.value.length > 0) removeSelectedFrame();
}

function updateSelectedFramePosition(payload: {
  frameId: string;
  x: number;
  y: number;
  historyMergeKey?: string;
}): void {
  updateSelectedFramePositions({
    positions: [
      {
        frameId: payload.frameId,
        x: payload.x,
        y: payload.y,
      },
    ],
    historyMergeKey: payload.historyMergeKey,
  });
}

function updateSelectedFramePositions(payload: {
  positions: Array<{ frameId: string; x: number; y: number }>;
  historyMergeKey?: string;
}): void {
  if (!payload.positions.length) return;

  const normalized = sceneDocumentFromUnknown(draftDocument.value, {
    fallbackDrawMode: "composition",
    fallbackSourceType: "image_mockup",
  });
  if (normalized.sourceModel.kind !== "composition") return;

  const patchMap = new Map(
    payload.positions.map((item) => [
      item.frameId,
      {
        x: Math.round(item.x),
        y: Math.round(item.y),
      },
    ]),
  );
  const nextComposition = cloneCompositionModel(normalized.sourceModel);
  commitDocument(
    {
      ...normalized,
      drawMode: "composition",
      editorEngine: "vueflow",
      sourceModel: {
        ...nextComposition,
        frames: (nextComposition.frames || []).map((frame) => {
          const patch = patchMap.get(frame.id);
          if (!patch) return frame;
          return {
            ...frame,
            x: patch.x,
            y: patch.y,
          };
        }),
      },
    },
    {
      historyMergeKey: payload.historyMergeKey,
    },
  );
}

function updateFrameGeometry(payload: {
  frameId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  historyMergeKey?: string;
}): void {
  const frame =
    currentPageFrames.value.find((item) => item.id === payload.frameId) || null;
  if (!frame) return;

  commitDocument(
    updateDesignFrameInSceneDocument(draftDocument.value, payload.frameId, {
      x:
        payload.x !== undefined
          ? parseFrameMetric(payload.x, frame.x, 0)
          : frame.x,
      y:
        payload.y !== undefined
          ? parseFrameMetric(payload.y, frame.y, 0)
          : frame.y,
      width:
        payload.width !== undefined
          ? parseFrameMetric(payload.width, frame.width, 280)
          : frame.width,
      height:
        payload.height !== undefined
          ? parseFrameMetric(payload.height, frame.height, 180)
          : frame.height,
    }),
    {
      historyMergeKey: payload.historyMergeKey,
    },
  );
}

function undoDesignChange(): void {
  applyHistorySnapshot(designHistory.undo());
}

function redoDesignChange(): void {
  applyHistorySnapshot(designHistory.redo());
}

function updateCurrentPage(patch: Partial<DesignPageModel>): void {
  if (!currentPage.value) return;
  commitDocument(
    updateDesignPageInSceneDocument(
      draftDocument.value,
      currentPage.value.id,
      patch,
    ),
  );
}

function updateSelectedFrame(
  patch: Partial<DesignFrameModel> & {
    slots?: Record<string, unknown>;
    title?: string;
    subtitle?: string;
    badge?: string;
    imageSrc?: string;
  },
): void {
  if (!selectedFrame.value) return;
  const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
  commitDocument(
    updateDesignFrameInSceneDocument(
      draftDocument.value,
      selectedFrame.value.id,
      patch,
    ),
  );
  replaceSelectionState(selectionSnapshot);
}

function updateSelectedElement(patch: Partial<DesignElementModel>): void {
  if (!designEditorState.selectedElement.value) return;
  const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
  commitDocument(
    updateDesignElementInSceneDocument(
      draftDocument.value,
      designEditorState.selectedElement.value.id,
      patch,
    ),
  );
  replaceSelectionState(selectionSnapshot);
}

function openInspectorRenamePrompt(): void {
  if (!canRenameInspectorHeader.value) return;

  inspectorHeaderDraft.value = inspectorHeaderTitle.value;
  inspectorHeaderEditing.value = true;
  nextTick(() => {
    inspectorHeaderInputRef.value?.focus();
    inspectorHeaderInputRef.value?.select();
  });
}

function cancelInspectorHeaderRename(): void {
  inspectorHeaderEditing.value = false;
  inspectorHeaderDraft.value = inspectorHeaderTitle.value;
}

function submitInspectorHeaderRename(): void {
  if (!inspectorHeaderEditing.value) return;

  const nextValue = inspectorHeaderDraft.value.trim();
  inspectorHeaderEditing.value = false;
  if (!nextValue || nextValue === inspectorHeaderTitle.value) return;

  if (designEditorState.selectedElement.value) {
    updateSelectedElement({
      metadata: {
        ...(designEditorState.selectedElement.value.metadata || {}),
        name: nextValue,
      },
    });
    return;
  }

  if (selectedFrame.value) {
    updateSelectedFrame({ name: nextValue });
    return;
  }

  if (designEditorState.currentPage.value)
    updateCurrentPage({ name: nextValue });
}

function resolveRawSelectedElements(): DesignElementModel[] {
  if (!currentPage.value) return [];
  const selectedIdSet = new Set(
    selectedElementIds.value
      .map((item) => normalizeString(item))
      .filter(Boolean),
  );
  return [
    ...resolveCompositionElementsForPage(
      compositionModel.value,
      currentPage.value.id,
    ),
    ...currentPageFrames.value.flatMap((frame) => resolveFrameElements(frame)),
  ].filter((element) => selectedIdSet.has(element.id));
}

function resolveSelectionBounds(
  items: Array<{ x: number; y: number; width: number; height: number }>,
) {
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2,
  };
}

function buildSelectionGeometryPatches<
  T extends { id: string; x: number; y: number; width: number; height: number },
>(items: T[], command: string): Map<string, Partial<T>> {
  const patches = new Map<string, Partial<T>>();
  if (!items.length) return patches;

  const bounds = resolveSelectionBounds(items);
  const primary =
    items.find(
      (item) =>
        item.id === selectedElementId.value ||
        item.id === selectedFrameId.value,
    ) ||
    items[0] ||
    null;
  const referenceWidth = primary?.width || items[0]?.width || 0;
  const referenceHeight = primary?.height || items[0]?.height || 0;

  if (command === "align-left") {
    items.forEach((item) =>
      patches.set(item.id, { x: Math.round(bounds.minX) }),
    );
    return patches;
  }
  if (command === "align-center-x") {
    items.forEach((item) =>
      patches.set(item.id, { x: Math.round(bounds.centerX - item.width / 2) }),
    );
    return patches;
  }
  if (command === "align-right") {
    items.forEach((item) =>
      patches.set(item.id, { x: Math.round(bounds.maxX - item.width) }),
    );
    return patches;
  }
  if (command === "align-top") {
    items.forEach((item) =>
      patches.set(item.id, { y: Math.round(bounds.minY) }),
    );
    return patches;
  }
  if (command === "align-center-y") {
    items.forEach((item) =>
      patches.set(item.id, { y: Math.round(bounds.centerY - item.height / 2) }),
    );
    return patches;
  }
  if (command === "align-bottom") {
    items.forEach((item) =>
      patches.set(item.id, { y: Math.round(bounds.maxY - item.height) }),
    );
    return patches;
  }
  if (command === "match-width") {
    if (items.length < 2 || referenceWidth <= 0) return patches;
    items.forEach((item) =>
      patches.set(item.id, { width: Math.round(referenceWidth) }),
    );
    return patches;
  }
  if (command === "match-height") {
    if (items.length < 2 || referenceHeight <= 0) return patches;
    items.forEach((item) =>
      patches.set(item.id, { height: Math.round(referenceHeight) }),
    );
    return patches;
  }
  if (command === "mirror-x") {
    items.forEach((item) => {
      patches.set(item.id, {
        x: Math.round(bounds.minX + bounds.maxX - item.x - item.width),
      });
    });
    return patches;
  }
  if (command === "mirror-y") {
    items.forEach((item) => {
      patches.set(item.id, {
        y: Math.round(bounds.minY + bounds.maxY - item.y - item.height),
      });
    });
    return patches;
  }
  if (command === "snap-grid") {
    items.forEach((item) => {
      patches.set(item.id, {
        x: Math.round(item.x / 8) * 8,
        y: Math.round(item.y / 8) * 8,
        width: Math.max(8, Math.round(item.width / 8) * 8),
        height: Math.max(8, Math.round(item.height / 8) * 8),
      });
    });
    return patches;
  }
  if (command === "distribute-x") {
    if (items.length < 3) return patches;
    const ordered = [...items].sort((left, right) => left.x - right.x);
    const totalWidth = ordered.reduce((sum, item) => sum + item.width, 0);
    const gap = (bounds.width - totalWidth) / (ordered.length - 1);
    let cursor = bounds.minX;
    for (const item of ordered) {
      patches.set(item.id, { x: Math.round(cursor) });
      cursor += item.width + gap;
    }
    return patches;
  }
  if (command === "distribute-y") {
    if (items.length < 3) return patches;
    const ordered = [...items].sort((left, right) => left.y - right.y);
    const totalHeight = ordered.reduce((sum, item) => sum + item.height, 0);
    const gap = (bounds.height - totalHeight) / (ordered.length - 1);
    let cursor = bounds.minY;
    for (const item of ordered) {
      patches.set(item.id, { y: Math.round(cursor) });
      cursor += item.height + gap;
    }
    return patches;
  }
  return patches;
}

function runSelectionCommand(command: string): void {
  if (selectedElementIds.value.length > 0) {
    const elements = resolveRawSelectedElements().filter(
      (element) => element.type !== "path",
    );
    const patches = buildSelectionGeometryPatches(elements, command);
    if (!patches.size) return;
    const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
    let nextDocument = draftDocument.value;
    for (const element of elements) {
      const patch = patches.get(element.id);
      if (!patch) continue;
      nextDocument = updateDesignElementInSceneDocument(
        nextDocument,
        element.id,
        patch,
      );
    }
    commitDocument(nextDocument, {
      historyMergeKey: "selection-command",
    });
    replaceSelectionState(selectionSnapshot);
    return;
  }

  if (!selectedFrameIds.value.length) return;

  const frameRects = selectedFrames.value.map((frame) => ({
    id: frame.id,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  }));
  const patches = buildSelectionGeometryPatches(frameRects, command);
  if (!patches.size) return;
  const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
  let nextDocument = draftDocument.value;
  for (const frame of selectedFrames.value) {
    const patch = patches.get(frame.id);
    if (!patch) continue;
    nextDocument = updateDesignFrameInSceneDocument(
      nextDocument,
      frame.id,
      patch,
    );
  }
  commitDocument(nextDocument, {
    historyMergeKey: "selection-command",
  });
  replaceSelectionState(selectionSnapshot);
}

function toggleSelectedFramesLocked(): void {
  if (!selectedFrames.value.length) return;

  const selectedIdSet = new Set(selectedFrames.value.map((frame) => frame.id));
  const shouldLock = selectedFrames.value.some((frame) => !frame.locked);
  mutateCompositionDocument((composition) => {
    return {
      ...composition,
      frames: (composition.frames || []).map((frame) => {
        if (!selectedIdSet.has(frame.id)) return frame;
        return {
          ...frame,
          locked: shouldLock,
        };
      }),
    };
  });
}

function isFrameSelected(frameId: string): boolean {
  return selectedFrameIds.value.includes(frameId);
}

function isPrimarySelectedFrame(frameId: string): boolean {
  return selectedFrameId.value === frameId;
}

function isElementSelected(elementId: string): boolean {
  return selectedElementIds.value.includes(elementId);
}

function isPrimarySelectedElement(elementId: string): boolean {
  return selectedElementId.value === elementId;
}

function isLayerTreeNodeExpanded(nodeId: string): boolean {
  return !collapsedLayerNodeIds.value.includes(nodeId);
}

function toggleLayerTreeNodeExpanded(nodeId: string): void {
  const normalizedNodeId = normalizeString(nodeId);
  if (!normalizedNodeId) return;
  collapsedLayerNodeIds.value = collapsedLayerNodeIds.value.includes(normalizedNodeId)
    ? collapsedLayerNodeIds.value.filter(id => id !== normalizedNodeId)
    : [...collapsedLayerNodeIds.value, normalizedNodeId];
}

function isLayerTreeNodeAncestor(nodeId: string): boolean {
  return selectedLayerTreeAncestorNodeIds.value.has(normalizeString(nodeId));
}

function resolveLayerTreeNodeIcon(node: DesignLayerTreeNode): string {
  if (node.type === "page_root_group") return "layers";
  if (node.type === "frame") {
    const frame = currentPageFrameMap.value.get(normalizeString(node.frameId));
    if (frame?.kind === "diagram") return "schema";
    if (frame?.kind === "device_mockup") return "phone_iphone";
    if (frame?.kind === "device_artboard") return "smartphone";
    return "crop_portrait";
  }

  const element = currentPageElementMap.value.get(normalizeString(node.elementId));
  if (element?.type === "text" || element?.type === "caption") return "text_fields";
  if (element?.type === "badge") return "label";
  if (element?.type === "image") return "imagesmode";
  if (element?.type === "path") return "draw";
  if (element?.type === "shape" && normalizeString(element.shapeKind) === "ellipse")
    return "circle";
  if (element?.type === "shape" && normalizeString(element.shapeKind) === "arrow")
    return "trending_flat";
  return "crop_square";
}

function resolveLayerTreeNodeClass(node: DesignLayerTreeNode): string {
  if (node.type === "frame" && node.frameId) {
    if (isPrimarySelectedFrame(node.frameId))
      return "workspace-design-layer-tree__row--frame workspace-design-layer-tree__row--primary";
    if (isFrameSelected(node.frameId))
      return "workspace-design-layer-tree__row--frame workspace-design-layer-tree__row--selected";
    if (isLayerTreeNodeAncestor(node.id))
      return "workspace-design-layer-tree__row--frame workspace-design-layer-tree__row--ancestor";
    return "workspace-design-layer-tree__row--frame workspace-design-layer-tree__row--idle";
  }

  if (node.type === "element" && node.elementId) {
    if (isPrimarySelectedElement(node.elementId))
      return "workspace-design-layer-tree__row--element workspace-design-layer-tree__row--primary";
    if (isElementSelected(node.elementId))
      return "workspace-design-layer-tree__row--element workspace-design-layer-tree__row--selected";
    if (isLayerTreeNodeAncestor(node.id))
      return "workspace-design-layer-tree__row--element workspace-design-layer-tree__row--ancestor";
    return "workspace-design-layer-tree__row--element workspace-design-layer-tree__row--idle";
  }

  return "workspace-design-layer-tree__row--idle";
}

function resolveLayerTreeFrameMeta(frameId?: string): string {
  const frame = currentPageFrameMap.value.get(normalizeString(frameId));
  if (!frame) return "";
  return `${frame.kind} · ${Math.round(frame.width)} × ${Math.round(frame.height)}`;
}

function normalizeLayerTreeNodes(
  nodes: DesignLayerTreeNode[],
): DesignLayerTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "page_root_group" || node.type === "frame_children_group")
      return normalizeLayerTreeNodes(node.children || []);
    return [node];
  });
}

function handleLayerTreeNodeSelection(
  node: DesignLayerTreeNode,
  event?: MouseEvent,
): void {
  if (node.type === "frame" && node.frameId) {
    handleFrameListSelection(node.frameId, event);
    return;
  }

  if (node.type !== "element" || !node.elementId) return;

  const editingFrameId = normalizeString(node.frameId);
  if (event?.shiftKey) {
    const nextSelection = isElementSelected(node.elementId)
      ? selectedElementIds.value.filter((id) => id !== node.elementId)
      : [...selectedElementIds.value, node.elementId];
    setSelectedElements(nextSelection, {
      primaryElementId: node.elementId,
      editingFrameId,
    });
    return;
  }

  setSelectedElements([node.elementId], {
    primaryElementId: node.elementId,
    editingFrameId,
  });
}

function canMoveFrame(frameId: string, direction: -1 | 1): boolean {
  const normalizedFrameId = normalizeString(frameId);
  const frame = currentPageFrameMap.value.get(normalizedFrameId);
  if (!frame) return false;
  const pageFrames = currentPageFrames.value.filter(
    item => normalizeString(item.pageId) === normalizeString(frame.pageId),
  );
  const currentIndex = pageFrames.findIndex(item => item.id === normalizedFrameId);
  const nextIndex = currentIndex + direction;
  return currentIndex >= 0 && nextIndex >= 0 && nextIndex < pageFrames.length;
}

function toggleElementHiddenById(elementId: string): void {
  const normalizedElementId = normalizeString(elementId);
  const element = currentPageElementMap.value.get(normalizedElementId);
  if (!element) return;
  const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
  commitDocument(
    updateDesignElementInSceneDocument(draftDocument.value, normalizedElementId, {
      hidden: !element.hidden,
    }),
  );
  replaceSelectionState(selectionSnapshot);
}

function toggleFrameLockedById(frameId: string): void {
  const normalizedFrameId = normalizeString(frameId);
  const frame = currentPageFrameMap.value.get(normalizedFrameId);
  if (!frame) return;

  const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
  mutateCompositionDocument((composition) => {
    return {
      ...composition,
      frames: (composition.frames || []).map((item) => {
        if (normalizeString(item.id) !== normalizedFrameId) return item;
        return {
          ...item,
          locked: !frame.locked,
        };
      }),
    };
  });
  replaceSelectionState(selectionSnapshot);
}

function toggleElementLockedById(elementId: string): void {
  const normalizedElementId = normalizeString(elementId);
  const element = currentPageElementMap.value.get(normalizedElementId);
  if (!element) return;

  const selectionSnapshot = cloneSelectionStateSnapshot(selectionState.value);
  commitDocument(
    updateDesignElementInSceneDocument(draftDocument.value, normalizedElementId, {
      locked: !element.locked,
    }),
  );
  replaceSelectionState(selectionSnapshot);
}

function toggleLayerTreeNodeLocked(node: DesignLayerTreeNode): void {
  if (node.type === "frame" && node.frameId) {
    toggleFrameLockedById(node.frameId);
    return;
  }
  if (node.type === "element" && node.elementId)
    toggleElementLockedById(node.elementId);
}

function selectLayerTreeParent(node: DesignLayerTreeNode): void {
  const element = currentPageElementMap.value.get(normalizeString(node.elementId));
  if (!element) return;
  const parentElementId = normalizeString(element.parentId);
  if (parentElementId && currentPageElementMap.value.has(parentElementId)) {
    setSelectedElements([parentElementId], {
      primaryElementId: parentElementId,
      editingFrameId: normalizeString(element.frameId),
    });
    return;
  }
  const frameId = normalizeString(element.frameId);
  if (frameId) {
    setSelectedFrames([frameId], {
      primaryFrameId: frameId,
    });
  }
}

function buildLayerTreeMenuItems(node: DesignLayerTreeNode): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  if (node.children?.length) {
    items.push({
      key: "toggle-expand",
      label: isLayerTreeNodeExpanded(node.id) ? "折叠" : "展开",
      icon: isLayerTreeNodeExpanded(node.id) ? "unfold_less" : "unfold_more",
    });
  }

  if (node.type === "frame" && node.frameId) {
    items.push(
      {
        key: "move-up",
        label: "上移",
        icon: "keyboard_arrow_up",
        disabled: !canMoveFrame(node.frameId, -1),
      },
      {
        key: "move-down",
        label: "下移",
        icon: "keyboard_arrow_down",
        disabled: !canMoveFrame(node.frameId, 1),
      },
      {
        key: "duplicate",
        label: "复制",
        icon: "content_copy",
        separatorBefore: items.length > 0,
      },
    );
    if (frame?.kind === "diagram") {
      items.push({
        key: "open-diagram",
        label: "打开 Diagram 编辑态",
        icon: "schema",
      });
    }
    items.push({
      key: "delete",
      label: "删除",
      icon: "delete",
      tone: "danger",
      separatorBefore: true,
    });
    return items;
  }

  if (node.type === "element" && node.elementId) {
    const element = currentPageElementMap.value.get(normalizeString(node.elementId));
    if (normalizeString(element?.parentId) || normalizeString(element?.frameId)) {
      items.push({
        key: "select-parent",
        label: "选择父级",
        icon: "arrow_upward",
        separatorBefore: items.length > 0,
      });
    }
    items.push(
      {
        key: "duplicate",
        label: "复制",
        icon: "content_copy",
        separatorBefore: items.length > 0,
      },
      {
        key: "delete",
        label: "删除",
        icon: "delete",
        tone: "danger",
        separatorBefore: true,
      },
    );
  }

  return items;
}

function openLayerTreeMenu(node: DesignLayerTreeNode, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  layerTreeMenuNodeId.value = node.id;
  layerTreeMenuItems.value = buildLayerTreeMenuItems(node);
  layerTreeMenuAnchorEl.value = event.currentTarget as HTMLElement | null;
  layerTreeMenuVisible.value = true;
}

function handleLayerTreeMenuSelect(key: string): void {
  const row = frameSidebarTreeRows.value.find(
    item => item.node.id === layerTreeMenuNodeId.value,
  );
  const node = row?.node || null;
  closeLayerTreeMenu();
  if (!node) return;

  if (key === "toggle-expand") {
    toggleLayerTreeNodeExpanded(node.id);
    return;
  }

  if (node.type === "frame" && node.frameId) {
    if (key === "move-up") {
      moveFrame(node.frameId, -1);
      return;
    }
    if (key === "move-down") {
      moveFrame(node.frameId, 1);
      return;
    }
    if (key === "toggle-lock") {
      toggleFrameLockedById(node.frameId);
      return;
    }
    if (key === "duplicate") {
      setSelectedFrames([node.frameId], {
        primaryFrameId: node.frameId,
      });
      duplicateSelectedFrame();
      return;
    }
    if (key === "open-diagram") {
      openFrameEditor(node.frameId);
      return;
    }
    if (key === "delete") {
      setSelectedFrames([node.frameId], {
        primaryFrameId: node.frameId,
      });
      removeSelectedFrame();
    }
    return;
  }

  if (node.type !== "element" || !node.elementId) return;

  if (key === "select-parent") {
    selectLayerTreeParent(node);
    return;
  }
  if (key === "toggle-lock") {
    toggleElementLockedById(node.elementId);
    return;
  }
  if (key === "toggle-visibility") {
    toggleElementHiddenById(node.elementId);
    return;
  }
  if (key === "duplicate") {
    setSelectedElements([node.elementId], {
      primaryElementId: node.elementId,
      editingFrameId: normalizeString(node.frameId),
    });
    duplicateSelectedElement();
    return;
  }
  if (key === "delete") {
    setSelectedElements([node.elementId], {
      primaryElementId: node.elementId,
      editingFrameId: normalizeString(node.frameId),
    });
    removeSelectedElement();
  }
}

function handleFrameListSelection(frameId: string, event?: MouseEvent): void {
  if (event?.shiftKey) {
    const nextSelection = isFrameSelected(frameId)
      ? selectedFrameIds.value.filter((id) => id !== frameId)
      : [...selectedFrameIds.value, frameId];
    setSelectedFrames(nextSelection, {
      primaryFrameId: frameId,
    });
    return;
  }
  selectSingleFrame(frameId);
}

function upsertFrameElement(
  frame: DesignFrameModel,
  matcher: (element: DesignElementModel) => boolean,
  nextElement: DesignElementModel,
): DesignElementModel[] {
  const elements = resolveFrameElements(frame);
  const index = elements.findIndex(matcher);
  if (index === -1) {
    elements.push(nextElement);
    return elements;
  }
  elements[index] = {
    ...elements[index],
    ...nextElement,
    style: {
      ...(elements[index]?.style || {}),
      ...(nextElement.style || {}),
    },
    metadata: {
      ...(elements[index]?.metadata || {}),
      ...(nextElement.metadata || {}),
    },
  };
  return elements;
}

function applyImageToSelectedFrame(src: string): void {
  if (!selectedFrame.value) return;
  const isMarketingFrame =
    selectedFrame.value.kind === "device_mockup" ||
    selectedFrame.value.kind === "template";
  const isDeviceArtboard = selectedFrame.value.kind === "device_artboard";
  const nextElements = upsertFrameElement(
    selectedFrame.value,
    (element) => element.id === "hero-image" || element.type === "image",
    {
      id: "hero-image",
      type: "image",
      x: isMarketingFrame ? 960 : isDeviceArtboard ? 0 : 56,
      y: isMarketingFrame ? 128 : isDeviceArtboard ? 0 : 220,
      width: isMarketingFrame ? 520 : isDeviceArtboard ? selectedFrame.value.width : 320,
      height: isMarketingFrame ? 640 : isDeviceArtboard ? selectedFrame.value.height : 220,
      imageSrc: src,
    },
  );
  updateSelectedFrame({
    elements: nextElements,
  });
}

async function readImageAsDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  }).catch(() => "");
}

async function readImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  if (!import.meta.client || !src) return { width: 0, height: 0 };
  return await new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: Number(image.naturalWidth || image.width || 0),
        height: Number(image.naturalHeight || image.height || 0),
      });
    };
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = src;
  });
}

function createAssetId(): string {
  return `asset-${Date.now()}`;
}

async function handleAssetUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  const src = await readImageAsDataUrl(file);
  if (!src) return;

  const asset: DesignAssetModel = {
    id: createAssetId(),
    type: "image",
    name: file.name,
    src,
    mimeType: file.type || undefined,
    metadata: {
      size: file.size,
    },
  };

  mutateCompositionDocument((composition) => {
    return {
      ...composition,
      assets: [...(composition.assets || []), asset],
    };
  });
  applyImageToSelectedFrame(src);
  if (input) input.value = "";
}

function useAsset(asset: DesignAssetModel): void {
  applyImageToSelectedFrame(asset.src);
}

function buildShellViewportDefaults() {
  const preset = resolveDeviceFramePreset(
    selectedFrame.value?.deviceFramePresetKey || DEFAULT_DEVICE_FRAME_KEY,
  );
  if (preset.deviceFamily === "browser") {
    return {
      x: 0,
      y: 54,
      width: preset.screenWidth,
      height: preset.screenHeight,
      cornerRadius: preset.screenRadius,
    };
  }
  if (preset.deviceFamily === "desktop") {
    return {
      x: 35,
      y: 24,
      width: preset.screenWidth,
      height: preset.screenHeight,
      cornerRadius: preset.screenRadius,
    };
  }
  return {
    x: preset.framePadding,
    y: preset.framePadding,
    width: preset.screenWidth,
    height: preset.screenHeight,
    cornerRadius: preset.screenRadius,
  };
}

async function handleShellAssetUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  const src = await readImageAsDataUrl(file);
  if (!src) return;
  const dimensions = await readImageDimensions(src);
  const viewportDefaults = buildShellViewportDefaults();

  const asset: DesignAssetModel = {
    id: createAssetId(),
    type: "image",
    name: file.name,
    src,
    mimeType: file.type || undefined,
    width: dimensions.width || undefined,
    height: dimensions.height || undefined,
    metadata: {
      role: "device_shell",
      deviceShell: {
        presetKeys: [
          selectedFrame.value?.deviceFramePresetKey || DEFAULT_DEVICE_FRAME_KEY,
        ],
        viewportRect: {
          x: viewportDefaults.x,
          y: viewportDefaults.y,
          width: viewportDefaults.width,
          height: viewportDefaults.height,
        },
        cornerRadius: viewportDefaults.cornerRadius,
        source: "uploaded",
      },
    },
  };

  mutateCompositionDocument((composition) => {
    return {
      ...composition,
      assets: [...(composition.assets || []), asset],
    };
  });

  if (
    selectedFrame.value &&
    (selectedFrame.value.kind === "device_mockup" ||
      selectedFrame.value.kind === "device_artboard")
  ) {
    updateSelectedFrame({
      metadata: {
        ...(selectedFrame.value.metadata || {}),
        device: {
          ...(selectedFrame.value.metadata?.device || {}),
          shellMode: "external",
          shellAssetId: asset.id,
        },
      },
    });
  }
  if (input) input.value = "";
}

function resolveShellViewportRect(asset: DesignAssetModel) {
  return asset.metadata?.deviceShell?.viewportRect || {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
}

function isDeviceShellAssetValid(asset: DesignAssetModel): boolean {
  const viewportRect = asset.metadata?.deviceShell?.viewportRect;
  const cornerRadius = Number(asset.metadata?.deviceShell?.cornerRadius ?? -1);
  return Boolean(
    viewportRect &&
      Number(viewportRect.width) > 0 &&
      Number(viewportRect.height) > 0 &&
      Number.isFinite(cornerRadius) &&
      cornerRadius >= 0,
  );
}

function resolveDeviceShellPresetSummary(asset: DesignAssetModel): string {
  const presetKeys = asset.metadata?.deviceShell?.presetKeys || [];
  if (!presetKeys.length) return "未绑定机型";
  return presetKeys.join(" / ");
}

function updateShellAssetMetadata(
  assetId: string,
  patch: {
    viewportRect?: Partial<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    cornerRadius?: number;
  },
): void {
  mutateCompositionDocument((composition) => {
    return {
      ...composition,
      assets: (composition.assets || []).map((asset) => {
        if (asset.id !== assetId) return asset;
        return {
          ...asset,
          metadata: {
            ...(asset.metadata || {}),
            role: "device_shell",
            deviceShell: {
              ...(asset.metadata?.deviceShell || {}),
              ...(patch.viewportRect
                ? {
                    viewportRect: {
                      ...(asset.metadata?.deviceShell?.viewportRect || {}),
                      ...patch.viewportRect,
                    },
                  }
                : {}),
              ...(patch.cornerRadius !== undefined
                ? {
                    cornerRadius: patch.cornerRadius,
                  }
                : {}),
            },
          },
        };
      }),
    };
  });
}

function useShellAsset(asset: DesignAssetModel): void {
  if (!selectedFrame.value) return;
  updateSelectedFrame({
    metadata: {
      ...(selectedFrame.value.metadata || {}),
      device: {
        ...(selectedFrame.value.metadata?.device || {}),
        shellMode: "external",
        shellAssetId: asset.id,
      },
    },
  });
}

function applyTemplateFrame(templateKey: string): void {
  const template = templateOptions.find(
    (item) => item.templateKey === templateKey,
  );
  createFrame("template", {
    name: template?.title || "模板 Frame",
    templateKey,
    themeTokens: template?.themeTokens || {},
    slots: {
      title: template?.title || "模板标题",
      subtitle:
        template?.summary || "模板内容已落成普通设计对象，可继续自由编辑。",
      badge: "Template",
    },
  });
}

function resolveActiveDiagramFrame(): DesignFrameModel | null {
  if (diagramEditorFrame.value?.kind === "diagram")
    return diagramEditorFrame.value;
  return selectedFrame.value?.kind === "diagram" ? selectedFrame.value : null;
}

function commitDiagramFrameUpdate(
  frameId: string,
  patch: Partial<DesignFrameModel>,
): void {
  const nextDocument = updateDesignFrameInSceneDocument(
    draftDocument.value,
    frameId,
    {
      kind: "diagram",
      ...patch,
    },
  );
  const nextFrame = resolveFrameFromDocument(nextDocument, frameId);
  commitDocument(nextDocument);
  selectSingleFrame(frameId);
  if (nextFrame) syncDiagramEditorFromFrame(nextFrame);
}

function selectDiagramNode(nodeId: string): void {
  diagramSelectedGroupId.value = "";
  diagramSelectedNodeId.value = nodeId;
  diagramSelectedEdgeId.value = "";
}

function selectDiagramEdge(edgeId: string): void {
  diagramSelectedGroupId.value = "";
  diagramSelectedEdgeId.value = edgeId;
  diagramSelectedNodeId.value = "";
}

function selectDiagramGroup(groupId: string): void {
  diagramSelectedGroupId.value = groupId;
  diagramSelectedNodeId.value = "";
  diagramSelectedEdgeId.value = "";
}

function clearDiagramSelection(): void {
  diagramSelectedGroupId.value = "";
  diagramSelectedNodeId.value = "";
  diagramSelectedEdgeId.value = "";
}

function applyDiagramSource(): void {
  const frame = resolveActiveDiagramFrame();
  if (!frame || !diagramSourceText.value.trim()) return;

  const embeddedScene =
    diagramSourceFormat.value === "mermaid"
      ? importFromMermaid(diagramSourceText.value)
      : diagramSourceFormat.value === "markdown_outline"
        ? importFromMarkdownOutline(diagramSourceText.value)
        : diagramSourceFormat.value === "ddl"
          ? importFromDDL(diagramSourceText.value).sceneDocument
          : importArchitectureFromMetadata(diagramSourceText.value)
              .sceneDocument;

  clearDiagramSelection();
  commitDiagramFrameUpdate(frame.id, { embeddedScene });
}

function resolveDiagramSourceFormat(
  frame: DesignFrameModel | null,
): "mermaid" | "markdown_outline" | "ddl" | "architecture" {
  const embeddedScene = frame?.embeddedScene;
  if (!embeddedScene) return "mermaid";
  if (embeddedScene.sourceType === "markdown_outline")
    return "markdown_outline";
  if (
    embeddedScene.sourceType === "ddl" ||
    embeddedScene.sourceModel.kind === "schema"
  )
    return "ddl";
  if (
    embeddedScene.drawMode === "architecture" ||
    embeddedScene.sourceModel.kind === "architecture"
  )
    return "architecture";
  return "mermaid";
}

function resolveDiagramSourceText(frame: DesignFrameModel | null): string {
  const embeddedScene = frame?.embeddedScene;
  if (!embeddedScene) return "";
  if (embeddedScene.sourceModel.kind === "graph")
    return (
      normalizeString(embeddedScene.sourceModel.sourceText) ||
      exportGraphSourceToMermaid(embeddedScene.sourceModel)
    );
  if (embeddedScene.sourceModel.kind === "schema")
    return exportSchemaModelToDDL(embeddedScene);
  if (embeddedScene.sourceModel.kind === "architecture")
    return exportArchitectureModelToMermaid(embeddedScene, "dependency_map");
  return serializeSceneDocument(embeddedScene);
}

function syncDiagramEditorFromFrame(frame: DesignFrameModel | null): void {
  diagramSourceFormat.value = resolveDiagramSourceFormat(frame);
  diagramSourceText.value = resolveDiagramSourceText(frame);
}

function openFrameEditor(frameId: string): void {
  const frame =
    currentPageFrames.value.find((item) => item.id === frameId) || null;
  if (!frame) return;
  selectSingleFrame(frame.id);
  if (frame.kind !== "diagram") {
    diagramEditorFrameId.value = "";
    return;
  }
  diagramEditorFrameId.value = frame.id;
  syncDiagramEditorFromFrame(frame);
}

function closeDiagramEditor(): void {
  diagramEditorFrameId.value = "";
}

function updateDiagramEmbeddedScene(
  mutator: (scene: SceneDocument) => SceneDocument | null,
): void {
  const frame = resolveActiveDiagramFrame();
  if (!frame?.embeddedScene) return;

  const currentScene = sceneDocumentFromUnknown(frame.embeddedScene, {
    fallbackDrawMode: "diagram",
    fallbackSourceType: "manual",
  });
  const nextScene = mutator(currentScene);
  if (!nextScene) return;

  commitDiagramFrameUpdate(frame.id, { embeddedScene: nextScene });
}

function updateDiagramGraph(
  mutator: (graph: GraphSourceModel) => GraphSourceModel | null,
): void {
  updateDiagramEmbeddedScene((scene) => {
    if (scene.sourceModel.kind !== "graph") return null;

    const nextGraph = mutator(cloneGraphSourceModel(scene.sourceModel));
    if (!nextGraph) return null;

    const nextSourceText = exportGraphSourceToMermaid(nextGraph);
    diagramSourceFormat.value = "mermaid";
    diagramSourceText.value = nextSourceText;

    return relayoutSceneDocument({
      ...scene,
      drawMode: "diagram",
      sourceType: "manual",
      sourceModel: {
        ...nextGraph,
        sourceText: nextSourceText,
      },
    });
  });
}

function addDiagramGraphNode(): void {
  const currentGraph = diagramEditorGraph.value;
  const nextIndex = (currentGraph?.nodes.length || 0) + 1;
  const nextId = currentGraph
    ? ensureUniqueGraphNodeId(
        currentGraph,
        `node-${nextIndex}`,
        `node-${nextIndex}`,
      )
    : `node-${nextIndex}`;
  updateDiagramGraph((graph) => {
    graph.nodes.push({
      id: nextId,
      label: `Node ${nextIndex}`,
      type:
        graph.diagramType === "mindmap" && graph.nodes.length === 0
          ? "root"
          : "node",
      metadata: {},
    });
    return graph;
  });
  selectDiagramNode(nextId);
}

function addDiagramGraphGroup(
  layoutKind: "container" | "swimlane" = "container",
): void {
  const currentGraph = diagramEditorGraph.value;
  const groupIndex = (currentGraph?.groups?.length || 0) + 1;
  const baseId =
    layoutKind === "swimlane" ? `lane-${groupIndex}` : `group-${groupIndex}`;
  const nextId = currentGraph
    ? ensureUniqueGraphGroupId(currentGraph, baseId, baseId)
    : sanitizeGraphId(baseId, baseId);

  updateDiagramGraph((graph) => {
    graph.groups = [
      ...(graph.groups || []),
      {
        id: nextId,
        label:
          layoutKind === "swimlane"
            ? `Swimlane ${groupIndex}`
            : `Group ${groupIndex}`,
        childNodeIds: [],
        metadata: {
          layoutKind,
        },
      },
    ];
    return graph;
  });
  selectDiagramGroup(nextId);
}

function addDiagramChildNode(parentNodeId: string): void {
  const currentGraph = diagramEditorGraph.value;
  const parentNode =
    currentGraph?.nodes.find((node) => node.id === parentNodeId) || null;
  if (!currentGraph || !parentNode) return;

  const nextIndex = currentGraph.nodes.length + 1;
  const nextId = ensureUniqueGraphNodeId(
    currentGraph,
    `${parentNode.id}-child`,
    `node-${nextIndex}`,
  );
  const edgeId = ensureUniqueGraphEdgeId(
    currentGraph,
    `${parentNode.id}-${nextId}`,
    `edge-${currentGraph.edges.length + 1}`,
  );
  const inheritedGroupId = resolveNodeGroupId(
    currentGraph,
    parentNodeId,
    parentNode.parentId,
  );

  updateDiagramGraph((graph) => {
    graph.nodes.push({
      id: nextId,
      label: `${parentNode.label || parentNode.id} Child`,
      type:
        graph.diagramType === "mindmap" ? "topic" : parentNode.type || "node",
      parentId: inheritedGroupId || undefined,
      metadata: {},
    });
    graph.edges.push({
      id: edgeId,
      source: parentNodeId,
      target: nextId,
      label: undefined,
      metadata: {},
    });
    if (inheritedGroupId) {
      graph.groups = (graph.groups || []).map((group) => {
        if (group.id !== inheritedGroupId) return cloneGraphSourceGroup(group);
        return {
          ...cloneGraphSourceGroup(group),
          childNodeIds: [...new Set([...(group.childNodeIds || []), nextId])],
        };
      });
    }
    return graph;
  });
  selectDiagramNode(nextId);
}

function updateDiagramGraphGroup(
  groupId: string,
  patch: Partial<GraphSourceGroup>,
): void {
  const currentGraph = diagramEditorGraph.value;
  const currentGroup =
    currentGraph?.groups?.find((group) => group.id === groupId) || null;
  const nextSelectionId =
    currentGraph && currentGroup
      ? ensureUniqueGraphGroupId(
          currentGraph,
          patch.id || currentGroup.id,
          currentGroup.id,
          currentGroup.id,
        )
      : groupId;

  updateDiagramGraph((graph) => {
    const groupIndex = (graph.groups || []).findIndex(
      (group) => group.id === groupId,
    );
    if (groupIndex < 0) return null;

    const currentGroup = graph.groups?.[groupIndex];
    if (!currentGroup) return null;

    const uniqueId =
      patch.id !== undefined
        ? ensureUniqueGraphGroupId(
            graph,
            patch.id || currentGroup.id,
            currentGroup.id,
            currentGroup.id,
          )
        : currentGroup.id;

    const nextGroup: GraphSourceGroup = {
      ...cloneGraphSourceGroup(currentGroup),
      ...patch,
      id: uniqueId,
      label:
        normalizeString(
          patch.label !== undefined ? patch.label : currentGroup.label,
        ) || uniqueId,
      childNodeIds:
        patch.childNodeIds !== undefined
          ? [...patch.childNodeIds]
          : [...(currentGroup.childNodeIds || [])],
      metadata: patch.metadata
        ? {
            ...(currentGroup.metadata || {}),
            ...patch.metadata,
          }
        : currentGroup.metadata
          ? { ...currentGroup.metadata }
          : undefined,
    };

    graph.groups = (graph.groups || []).map((group, index) =>
      index === groupIndex ? nextGroup : cloneGraphSourceGroup(group),
    );
    if (uniqueId !== currentGroup.id) {
      graph.nodes = graph.nodes.map((node) => {
        if (node.parentId !== currentGroup.id)
          return cloneGraphSourceNode(node);
        return {
          ...cloneGraphSourceNode(node),
          parentId: uniqueId,
        };
      });
    }
    return graph;
  });
  if (diagramSelectedGroupId.value === groupId)
    selectDiagramGroup(nextSelectionId);
}

function toggleDiagramGraphGroupMembership(
  groupId: string,
  nodeId: string,
): void {
  updateDiagramGraph((graph) => {
    const group = (graph.groups || []).find((item) => item.id === groupId);
    const nodeIndex = graph.nodes.findIndex((node) => node.id === nodeId);
    if (!group || nodeIndex < 0) return null;

    const node = graph.nodes[nodeIndex];
    if (!node) return null;

    const hasMembership =
      (group.childNodeIds || []).includes(nodeId) || node.parentId === groupId;
    graph.groups = (graph.groups || []).map((item) => {
      const baseChildNodeIds = (item.childNodeIds || []).filter(
        (childId) => childId !== nodeId,
      );
      if (item.id !== groupId) {
        return {
          ...cloneGraphSourceGroup(item),
          childNodeIds: baseChildNodeIds,
        };
      }
      return {
        ...cloneGraphSourceGroup(item),
        childNodeIds: hasMembership
          ? baseChildNodeIds
          : [...new Set([...baseChildNodeIds, nodeId])],
      };
    });
    const nextNode = cloneGraphSourceNode(node);
    if (hasMembership) delete nextNode.parentId;
    else nextNode.parentId = groupId;
    graph.nodes[nodeIndex] = nextNode;
    return graph;
  });
}

function removeDiagramGraphGroup(groupId: string): void {
  updateDiagramGraph((graph) => {
    graph.groups = (graph.groups || []).filter((group) => group.id !== groupId);
    graph.nodes = graph.nodes.map((node) => {
      if (node.parentId !== groupId) return cloneGraphSourceNode(node);
      const nextNode = cloneGraphSourceNode(node);
      delete nextNode.parentId;
      return nextNode;
    });
    return graph;
  });
  if (diagramSelectedGroupId.value === groupId)
    diagramSelectedGroupId.value = "";
}

function duplicateDiagramGraphNode(nodeId: string): void {
  const currentGraph = diagramEditorGraph.value;
  const sourceNode =
    currentGraph?.nodes.find((node) => node.id === nodeId) || null;
  if (!currentGraph || !sourceNode) return;

  const nextId = ensureUniqueGraphNodeId(
    currentGraph,
    `${sourceNode.id}-copy`,
    `${sourceNode.id}-copy`,
  );
  const inheritedGroupId = resolveNodeGroupId(
    currentGraph,
    nodeId,
    sourceNode.parentId,
  );
  updateDiagramGraph((graph) => {
    graph.nodes.push({
      ...cloneGraphSourceNode(sourceNode),
      id: nextId,
      label: `${sourceNode.label} Copy`,
      parentId: inheritedGroupId || undefined,
      metadata: sourceNode.metadata ? { ...sourceNode.metadata } : undefined,
    });
    if (inheritedGroupId) {
      graph.groups = (graph.groups || []).map((group) => {
        if (group.id !== inheritedGroupId) return cloneGraphSourceGroup(group);
        return {
          ...cloneGraphSourceGroup(group),
          childNodeIds: [...new Set([...(group.childNodeIds || []), nextId])],
        };
      });
    }
    return graph;
  });
  selectDiagramNode(nextId);
}

function updateDiagramGraphNodePosition(
  nodeId: string,
  position: { x: number; y: number },
): void {
  updateDiagramGraph((graph) => {
    const nodeIndex = graph.nodes.findIndex((node) => node.id === nodeId);
    if (nodeIndex < 0) return null;

    const currentNode = graph.nodes[nodeIndex];
    if (!currentNode) return null;

    graph.nodes[nodeIndex] = {
      ...currentNode,
      metadata: {
        ...(currentNode.metadata || {}),
        manualPosition: {
          x: Math.round(Number(position.x || 0)),
          y: Math.round(Number(position.y || 0)),
        },
      },
    };
    return graph;
  });
  selectDiagramNode(nodeId);
}

function updateDiagramGraphGroupFrame(
  groupIdOrPayload:
    | string
    | {
        groupId: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      },
  patch: Partial<{ x: number; y: number; width: number; height: number }> = {},
): void {
  const groupId =
    typeof groupIdOrPayload === "string"
      ? groupIdOrPayload
      : normalizeString(groupIdOrPayload.groupId);
  const nextPatch =
    typeof groupIdOrPayload === "string"
      ? patch
      : {
          x: groupIdOrPayload.x,
          y: groupIdOrPayload.y,
          width: groupIdOrPayload.width,
          height: groupIdOrPayload.height,
        };
  const currentScene = diagramEditorScene.value;
  const currentGraph = diagramEditorGraph.value;
  if (!currentScene || !currentGraph || !groupId) return;

  const sceneNodeMap = new Map(
    (currentScene.sceneModel.nodes || []).map((node) => [node.id, node]),
  );
  const currentGroupSceneNode = sceneNodeMap.get(groupId);
  const currentGroup =
    currentGraph.groups?.find((group) => group.id === groupId) || null;
  if (!currentGroupSceneNode || !currentGroup) return;

  const nextX = parseFrameMetric(nextPatch.x, currentGroupSceneNode.x, 0);
  const nextY = parseFrameMetric(nextPatch.y, currentGroupSceneNode.y, 0);
  const nextWidth = parseFrameMetric(
    nextPatch.width,
    currentGroupSceneNode.width,
    260,
  );
  const nextHeight = parseFrameMetric(
    nextPatch.height,
    currentGroupSceneNode.height,
    180,
  );
  const deltaX = nextX - Math.round(currentGroupSceneNode.x);
  const deltaY = nextY - Math.round(currentGroupSceneNode.y);
  const memberIds = new Set<string>([
    ...(currentGroup.childNodeIds || []),
    ...currentGraph.nodes
      .filter((node) => node.parentId === groupId)
      .map((node) => node.id),
  ]);

  updateDiagramGraph((graph) => {
    graph.nodes = graph.nodes.map((node) => {
      if (!memberIds.has(node.id) || (!deltaX && !deltaY))
        return cloneGraphSourceNode(node);

      const sceneNode = sceneNodeMap.get(node.id);
      const currentManualPosition = node.metadata?.manualPosition as
        | { x?: number; y?: number }
        | undefined;
      const baseX = Math.round(
        Number(sceneNode?.x ?? currentManualPosition?.x ?? 96),
      );
      const baseY = Math.round(
        Number(sceneNode?.y ?? currentManualPosition?.y ?? 96),
      );
      return {
        ...cloneGraphSourceNode(node),
        metadata: {
          ...(node.metadata || {}),
          manualPosition: {
            x: baseX + deltaX,
            y: baseY + deltaY,
          },
        },
      };
    });

    graph.groups = (graph.groups || []).map((group) => {
      if (group.id !== groupId) return cloneGraphSourceGroup(group);
      return {
        ...cloneGraphSourceGroup(group),
        metadata: {
          ...(group.metadata || {}),
          manualPosition: {
            x: nextX,
            y: nextY,
          },
          size: {
            width: nextWidth,
            height: nextHeight,
          },
        },
      };
    });

    return graph;
  });
  selectDiagramGroup(groupId);
}

function relayoutDiagramGraphGroup(groupId: string): void {
  const currentScene = diagramEditorScene.value;
  const currentGraph = diagramEditorGraph.value;
  if (!currentScene || !currentGraph) return;

  const sceneNodeMap = new Map(
    (currentScene.sceneModel.nodes || []).map((node) => [node.id, node]),
  );
  const currentGroupSceneNode = sceneNodeMap.get(groupId);
  const currentGroup =
    currentGraph.groups?.find((group) => group.id === groupId) || null;
  if (!currentGroupSceneNode || !currentGroup) return;

  const orderedMemberIds = [
    ...(currentGroup.childNodeIds || []),
    ...currentGraph.nodes
      .filter((node) => node.parentId === groupId)
      .map((node) => node.id)
      .filter((nodeId) => !(currentGroup.childNodeIds || []).includes(nodeId)),
  ];
  const memberNodes = orderedMemberIds
    .map(
      (nodeId) => currentGraph.nodes.find((node) => node.id === nodeId) || null,
    )
    .filter((node): node is GraphSourceNode => Boolean(node));

  if (!memberNodes.length) return;

  const layoutKind =
    currentGroup.metadata?.layoutKind === "swimlane" ? "swimlane" : "container";
  const laneDirection =
    currentGroup.metadata?.laneDirection === "vertical"
      ? "vertical"
      : "horizontal";
  const paddingX = 28;
  const headerHeight = layoutKind === "swimlane" ? 52 : 44;
  const contentTop = 16;
  const paddingBottom = 28;
  const gapX = 24;
  const gapY = 20;
  const groupX = Math.round(currentGroupSceneNode.x);
  const groupY = Math.round(currentGroupSceneNode.y);
  const baseWidth = Math.max(260, Math.round(currentGroupSceneNode.width));
  const baseHeight = Math.max(180, Math.round(currentGroupSceneNode.height));
  const maxNodeWidth = Math.max(
    ...memberNodes.map((node) =>
      Math.round(sceneNodeMap.get(node.id)?.width || 180),
    ),
    180,
  );
  const maxNodeHeight = Math.max(
    ...memberNodes.map((node) =>
      Math.round(sceneNodeMap.get(node.id)?.height || 64),
    ),
    64,
  );
  const startX = groupX + paddingX;
  const startY = groupY + headerHeight + contentTop;

  const manualPositions = new Map<string, { x: number; y: number }>();
  let nextWidth = baseWidth;
  let nextHeight = baseHeight;

  if (layoutKind === "swimlane") {
    if (laneDirection === "vertical") {
      let cursorY = startY;
      for (const node of memberNodes) {
        const sceneNode = sceneNodeMap.get(node.id);
        const nodeHeight = Math.round(sceneNode?.height || 64);
        manualPositions.set(node.id, {
          x: startX,
          y: cursorY,
        });
        cursorY += nodeHeight + gapY;
      }
      const totalHeight = cursorY - startY - gapY;
      nextWidth = Math.max(baseWidth, paddingX * 2 + maxNodeWidth);
      nextHeight = Math.max(
        baseHeight,
        headerHeight + contentTop + totalHeight + paddingBottom,
      );
    } else {
      let cursorX = startX;
      for (const node of memberNodes) {
        const sceneNode = sceneNodeMap.get(node.id);
        const nodeWidth = Math.round(sceneNode?.width || 180);
        manualPositions.set(node.id, {
          x: cursorX,
          y: startY,
        });
        cursorX += nodeWidth + gapX;
      }
      const totalWidth = cursorX - startX - gapX;
      nextWidth = Math.max(baseWidth, paddingX * 2 + totalWidth);
      nextHeight = Math.max(
        baseHeight,
        headerHeight + contentTop + maxNodeHeight + paddingBottom,
      );
    }
  } else {
    const columnCount = Math.min(
      memberNodes.length,
      baseWidth >= 760 ? 3 : baseWidth >= 520 ? 2 : 1,
    );
    const rowCount = Math.max(1, Math.ceil(memberNodes.length / columnCount));
    for (const [index, node] of memberNodes.entries()) {
      const row = Math.floor(index / columnCount);
      const column = index % columnCount;
      manualPositions.set(node.id, {
        x: startX + column * (maxNodeWidth + gapX),
        y: startY + row * (maxNodeHeight + gapY),
      });
    }
    nextWidth = Math.max(
      baseWidth,
      paddingX * 2 +
        columnCount * maxNodeWidth +
        Math.max(0, columnCount - 1) * gapX,
    );
    nextHeight = Math.max(
      baseHeight,
      headerHeight +
        contentTop +
        rowCount * maxNodeHeight +
        Math.max(0, rowCount - 1) * gapY +
        paddingBottom,
    );
  }

  updateDiagramGraph((graph) => {
    graph.nodes = graph.nodes.map((node) => {
      const manualPosition = manualPositions.get(node.id);
      if (!manualPosition) return cloneGraphSourceNode(node);
      return {
        ...cloneGraphSourceNode(node),
        parentId: groupId,
        metadata: {
          ...(node.metadata || {}),
          manualPosition,
        },
      };
    });

    graph.groups = (graph.groups || []).map((group) => {
      if (group.id !== groupId) return cloneGraphSourceGroup(group);
      return {
        ...cloneGraphSourceGroup(group),
        childNodeIds: orderedMemberIds,
        metadata: {
          ...(group.metadata || {}),
          layoutKind,
          laneDirection,
          manualPosition: {
            x: groupX,
            y: groupY,
          },
          size: {
            width: nextWidth,
            height: nextHeight,
          },
        },
      };
    });

    return graph;
  });
  selectDiagramGroup(groupId);
}

function fitDiagramGraphGroupToMembers(groupId: string): void {
  const currentScene = diagramEditorScene.value;
  const currentGraph = diagramEditorGraph.value;
  if (!currentScene || !currentGraph) return;

  const sceneNodeMap = new Map(
    (currentScene.sceneModel.nodes || []).map((node) => [node.id, node]),
  );
  const currentGroupSceneNode = sceneNodeMap.get(groupId);
  const currentGroup =
    currentGraph.groups?.find((group) => group.id === groupId) || null;
  if (!currentGroupSceneNode || !currentGroup) return;

  const memberIds = new Set<string>([
    ...(currentGroup.childNodeIds || []),
    ...currentGraph.nodes
      .filter((node) => node.parentId === groupId)
      .map((node) => node.id),
  ]);
  const memberSceneNodes = [...memberIds]
    .map((nodeId) => sceneNodeMap.get(nodeId))
    .filter((node): node is NonNullable<typeof currentGroupSceneNode> =>
      Boolean(node),
    );

  if (!memberSceneNodes.length) return;

  const layoutKind =
    currentGroup.metadata?.layoutKind === "swimlane" ? "swimlane" : "container";
  const paddingX = 28;
  const paddingBottom = 28;
  const maxRight = Math.max(
    ...memberSceneNodes.map((node) => Math.round(node.x + node.width)),
  );
  const maxBottom = Math.max(
    ...memberSceneNodes.map((node) => Math.round(node.y + node.height)),
  );
  const nextWidth = Math.max(
    260,
    maxRight - Math.round(currentGroupSceneNode.x) + paddingX,
  );
  const nextHeight = Math.max(
    180,
    maxBottom - Math.round(currentGroupSceneNode.y) + paddingBottom,
  );

  updateDiagramGraph((graph) => {
    graph.groups = (graph.groups || []).map((group) => {
      if (group.id !== groupId) return cloneGraphSourceGroup(group);
      return {
        ...cloneGraphSourceGroup(group),
        metadata: {
          ...(group.metadata || {}),
          layoutKind,
          manualPosition: {
            x: Math.round(currentGroupSceneNode.x),
            y: Math.round(currentGroupSceneNode.y),
          },
          size: {
            width: nextWidth,
            height: nextHeight,
          },
        },
      };
    });
    return graph;
  });
  selectDiagramGroup(groupId);
}

function resetDiagramGraphGroupManualLayout(groupId: string): void {
  const currentGraph = diagramEditorGraph.value;
  const currentGroup =
    currentGraph?.groups?.find((group) => group.id === groupId) || null;
  if (!currentGraph || !currentGroup) return;

  const memberIds = new Set<string>([
    ...(currentGroup.childNodeIds || []),
    ...currentGraph.nodes
      .filter((node) => node.parentId === groupId)
      .map((node) => node.id),
  ]);

  updateDiagramGraph((graph) => {
    graph.nodes = graph.nodes.map((node) => {
      if (!memberIds.has(node.id)) return cloneGraphSourceNode(node);

      const nextMetadata = { ...(node.metadata || {}) };
      delete nextMetadata.manualPosition;
      return {
        ...cloneGraphSourceNode(node),
        metadata: nextMetadata,
      };
    });

    graph.groups = (graph.groups || []).map((group) => {
      if (group.id !== groupId) return cloneGraphSourceGroup(group);

      const nextMetadata = { ...(group.metadata || {}) };
      delete nextMetadata.manualPosition;
      delete nextMetadata.size;
      return {
        ...cloneGraphSourceGroup(group),
        metadata: nextMetadata,
      };
    });
    return graph;
  });
  selectDiagramGroup(groupId);
}

function updateDiagramGraphNode(
  nodeId: string,
  patch: Partial<GraphSourceNode>,
): void {
  const currentGraph = diagramEditorGraph.value;
  const currentNode =
    currentGraph?.nodes.find((node) => node.id === nodeId) || null;
  const nextSelectionId =
    currentNode && patch.id !== undefined
      ? ensureUniqueGraphNodeId(
          currentGraph ||
            cloneGraphSourceModel({
              kind: "graph",
              diagramType: "flowchart",
              nodes: [],
              edges: [],
              groups: [],
            }),
          patch.id || currentNode.id,
          currentNode.id || "node",
          currentNode.id,
        )
      : nodeId;
  updateDiagramGraph((graph) => {
    const nodeIndex = graph.nodes.findIndex((node) => node.id === nodeId);
    if (nodeIndex < 0) return null;

    const currentNode = graph.nodes[nodeIndex];
    if (!currentNode) return null;

    const nextId =
      patch.id !== undefined
        ? ensureUniqueGraphNodeId(
            graph,
            patch.id || currentNode.id,
            currentNode.id || `node-${nodeIndex + 1}`,
            currentNode.id,
          )
        : currentNode.id;
    const nextNode: GraphSourceNode = {
      ...currentNode,
      ...patch,
      id: nextId,
      label:
        normalizeString(
          patch.label !== undefined ? patch.label : currentNode.label,
        ) || nextId,
      type:
        normalizeString(
          patch.type !== undefined ? patch.type : currentNode.type,
        ) || undefined,
      metadata: patch.metadata
        ? {
            ...(currentNode.metadata || {}),
            ...patch.metadata,
          }
        : currentNode.metadata
          ? { ...currentNode.metadata }
          : undefined,
    };
    graph.nodes[nodeIndex] = nextNode;

    if (nextId !== currentNode.id) {
      graph.edges = graph.edges.map((edge) => ({
        ...cloneGraphSourceEdge(edge),
        source: edge.source === currentNode.id ? nextId : edge.source,
        target: edge.target === currentNode.id ? nextId : edge.target,
      }));
      graph.groups = (graph.groups || []).map((group) => ({
        ...group,
        childNodeIds: (group.childNodeIds || []).map((childId) =>
          childId === currentNode.id ? nextId : childId,
        ),
        metadata: group.metadata ? { ...group.metadata } : undefined,
      }));
    }

    return graph;
  });
  if (diagramSelectedNodeId.value === nodeId)
    selectDiagramNode(nextSelectionId);
}

function removeDiagramGraphNode(nodeId: string): void {
  updateDiagramGraph((graph) => {
    graph.nodes = graph.nodes.filter((node) => node.id !== nodeId);
    graph.edges = graph.edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    );
    graph.groups = (graph.groups || []).map((group) => ({
      ...cloneGraphSourceGroup(group),
      childNodeIds: (group.childNodeIds || []).filter(
        (childId) => childId !== nodeId,
      ),
    }));
    return graph;
  });
  if (diagramSelectedNodeId.value === nodeId) diagramSelectedNodeId.value = "";
}

function addDiagramGraphEdge(): void {
  const currentGraph = diagramEditorGraph.value;
  const edgeId = ensureUniqueGraphEdgeId(
    currentGraph || {
      kind: "graph",
      diagramType: "flowchart",
      nodes: [],
      edges: [],
      groups: [],
    },
    `edge-${(currentGraph?.edges.length || 0) + 1}`,
    `edge-${(currentGraph?.edges.length || 0) + 1}`,
  );

  updateDiagramGraph((graph) => {
    if (graph.nodes.length === 0) {
      graph.nodes.push({
        id: "node-1",
        label: "Node 1",
        type: graph.diagramType === "mindmap" ? "root" : "node",
        metadata: {},
      });
    }

    if (graph.nodes.length === 1) {
      graph.nodes.push({
        id: ensureUniqueGraphNodeId(graph, "node-2", "node-2"),
        label: "Node 2",
        type: graph.diagramType === "mindmap" ? "topic" : "node",
        metadata: {},
      });
    }

    graph.edges.push({
      id: edgeId,
      source: graph.nodes[0]?.id || "",
      target: graph.nodes[1]?.id || graph.nodes[0]?.id || "",
      label: undefined,
      metadata: {},
    });
    return graph;
  });
  selectDiagramEdge(edgeId);
}

function updateDiagramGraphEdge(
  edgeId: string,
  patch: Partial<GraphSourceEdge>,
): void {
  updateDiagramGraph((graph) => {
    const edgeIndex = graph.edges.findIndex((edge) => edge.id === edgeId);
    if (edgeIndex < 0) return null;

    const currentEdge = graph.edges[edgeIndex];
    if (!currentEdge) return null;

    const availableNodeIds = new Set(graph.nodes.map((node) => node.id));
    const fallbackSource = availableNodeIds.has(currentEdge.source)
      ? currentEdge.source
      : graph.nodes[0]?.id || "";
    const fallbackTarget = availableNodeIds.has(currentEdge.target)
      ? currentEdge.target
      : graph.nodes[0]?.id || "";
    graph.edges[edgeIndex] = {
      ...currentEdge,
      ...patch,
      id: currentEdge.id,
      source:
        patch.source && availableNodeIds.has(patch.source)
          ? patch.source
          : fallbackSource,
      target:
        patch.target && availableNodeIds.has(patch.target)
          ? patch.target
          : fallbackTarget,
      label:
        normalizeString(
          patch.label !== undefined ? patch.label : currentEdge.label,
        ) || undefined,
      metadata: patch.metadata
        ? {
            ...(currentEdge.metadata || {}),
            ...patch.metadata,
          }
        : currentEdge.metadata
          ? { ...currentEdge.metadata }
          : undefined,
    };
    return graph;
  });
}

function removeDiagramGraphEdge(edgeId: string): void {
  updateDiagramGraph((graph) => {
    graph.edges = graph.edges.filter((edge) => edge.id !== edgeId);
    return graph;
  });
  if (diagramSelectedEdgeId.value === edgeId) diagramSelectedEdgeId.value = "";
}

function reverseDiagramGraphEdge(edgeId: string): void {
  updateDiagramGraph((graph) => {
    const edgeIndex = graph.edges.findIndex((edge) => edge.id === edgeId);
    if (edgeIndex < 0) return null;
    const currentEdge = graph.edges[edgeIndex];
    if (!currentEdge) return null;
    graph.edges[edgeIndex] = {
      ...cloneGraphSourceEdge(currentEdge),
      source: currentEdge.target,
      target: currentEdge.source,
    };
    return graph;
  });
  selectDiagramEdge(edgeId);
}

function updateDiagramGraphType(
  diagramType: GraphSourceModel["diagramType"],
): void {
  updateDiagramGraph((graph) => {
    graph.diagramType = diagramType;
    return graph;
  });
}

function connectDiagramGraphEdge(payload: {
  source?: string;
  target?: string;
}): void {
  const source = normalizeString(payload.source);
  const target = normalizeString(payload.target);
  if (!source || !target) return;

  const existingEdge = diagramEditorGraph.value?.edges.find(
    (edge) => edge.source === source && edge.target === target,
  );
  if (existingEdge) {
    selectDiagramEdge(existingEdge.id);
    return;
  }

  const edgeId = ensureUniqueGraphEdgeId(
    diagramEditorGraph.value || {
      kind: "graph",
      diagramType: "flowchart",
      nodes: [],
      edges: [],
      groups: [],
    },
    `${source}-${target}`,
    `edge-${(diagramEditorGraph.value?.edges.length || 0) + 1}`,
  );

  updateDiagramGraph((graph) => {
    if (
      !graph.nodes.some((node) => node.id === source) ||
      !graph.nodes.some((node) => node.id === target)
    )
      return null;

    graph.edges.push({
      id: edgeId,
      source,
      target,
      label: undefined,
      metadata: {},
    });
    return graph;
  });
  selectDiagramEdge(edgeId);
}

function relayoutSelectedDiagramFrame(): void {
  updateDiagramEmbeddedScene((scene) => {
    if (scene.sourceModel.kind !== "graph") return relayoutSceneDocument(scene);

    return relayoutSceneDocument({
      ...scene,
      sourceModel: {
        ...cloneGraphSourceModel(scene.sourceModel),
        nodes: scene.sourceModel.nodes.map((node) => {
          const nextMetadata = { ...(node.metadata || {}) };
          delete nextMetadata.manualPosition;
          return {
            ...cloneGraphSourceNode(node),
            metadata: nextMetadata,
          };
        }),
      },
    });
  });
}

function fileSlug(value: string): string {
  return (
    normalizeString(value)
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "design"
  );
}

function resolveFrameName(frameId: string): string {
  return (
    currentPageFrames.value.find((frame) => frame.id === frameId)?.name ||
    "frame"
  );
}

function resolveFrameExportScale(frameId: string): number {
  const frame =
    currentPageFrames.value.find((item) => item.id === frameId) || null;
  if (!frame) return 1;
  return resolveDesignFrameExportMetadata(
    frame.metadata?.export,
    frame.metadata?.exportWithVisiblePageOverlays !== false,
  ).scale;
}

function downloadBlob(blob: Blob, fileName: string): void {
  if (!import.meta.client) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadSvg(frameId = ""): void {
  if (!currentPage.value) return;
  const svgMarkup = renderCompositionAssetToSvg(draftDocument.value, {
    pageId: currentPage.value.id,
    frameId: frameId || undefined,
  });
  const fileName = frameId
    ? `${fileSlug(resolveFrameName(frameId))}.svg`
    : `${fileSlug(currentPage.value.name)}.svg`;
  downloadBlob(
    new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }),
    fileName,
  );
}

async function downloadPng(frameId = ""): Promise<void> {
  if (!import.meta.client || !currentPage.value) return;
  const svgMarkup = renderCompositionAssetToSvg(draftDocument.value, {
    pageId: currentPage.value.id,
    frameId: frameId || undefined,
  });
  const svgBlob = new Blob([svgMarkup], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();
  const fileName = frameId
    ? `${fileSlug(resolveFrameName(frameId))}.png`
    : `${fileSlug(currentPage.value.name)}.png`;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("SVG_TO_IMAGE_FAILED"));
    image.src = svgUrl;
  }).catch(() => {});

  const canvas = document.createElement("canvas");
  const exportScale = frameId ? resolveFrameExportScale(frameId) : 1;
  canvas.width = Math.max(1, Math.round((image.width || 1600) * exportScale));
  canvas.height = Math.max(1, Math.round((image.height || 900) * exportScale));
  const context = canvas.getContext("2d");
  if (context) context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(svgUrl);

  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, fileName);
  }, "image/png");
}

async function downloadAllCurrentPageFrames(): Promise<void> {
  for (const frame of currentPageFrames.value) {
    await downloadPng(frame.id);
  }
}
</script>

<template>
  <div
    ref="panelRootRef"
    class="workspace-design-panel relative h-full min-h-0 w-full overflow-hidden bg-[#f7f8fb]"
    @keydown.capture="handlePanelKeydown"
    @keyup.capture="handlePanelKeyup"
  >
    <WLDesignLayout
      :gap="0"
      :collapsed-left-width="36"
      :collapsed-right-width="36"
      :left-collapsed="sidebarCollapsed"
      :right-collapsed="inspectorCollapsed"
      data-testid="workspace-design-layout"
    >
      <template #left>
        <WLDesignContainer
          class="workspace-design-floating-panel workspace-design-glass-panel workspace-design-sidebar-panel self-start max-h-[min(72vh,820px)] w-full"
          :data-collapsed="sidebarCollapsed ? 'true' : 'false'"
          :scrollable="!sidebarCollapsed"
          :padding="activeSidebarTab === 'frames' ? 'sm' : 'md'"
          :title="''"
        >
          <template v-if="!sidebarCollapsed" #header-title>
            <button
              class="workspace-design-sidebar-toggle flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900"
              type="button"
              title="收起设计面板"
              data-testid="workspace-design-sidebar-toggle"
              @click="toggleSidebarCollapsed"
            >
              <span class="material-symbols-outlined text-[18px]">
                left_panel_close
              </span>
            </button>
          </template>

          <template v-if="!sidebarCollapsed" #header-title-extra>
            <div class="workspace-design-sidebar-tabs-inline flex min-w-0 flex-1 justify-center">
              <WorkspaceDesignSidebarTabs
                :active-tab="activeSidebarTab"
                @update:active-tab="activeSidebarTab = $event"
              />
            </div>
          </template>

          <template #actions>
            <div
              class="flex items-center gap-2"
              :class="sidebarCollapsed ? 'w-full justify-start' : ''"
            >
              <div
                v-if="!sidebarCollapsed"
                ref="actionMenuRef"
                class="relative"
              >
                <button
                  class="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-[10px] border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-900 transition-colors hover:bg-slate-50"
                  type="button"
                  title="新建"
                  aria-label="新建"
                  @click="toggleActionMenu"
                >
                  <span class="material-symbols-outlined text-sm">add</span>
                  <span class="material-symbols-outlined text-sm"
                    >arrow_drop_down</span
                  >
                </button>

                <div
                  v-if="actionMenuOpen"
                  class="absolute right-0 top-10 z-30 w-[208px] rounded-[12px] border border-slate-200/95 bg-white/80 p-1.5 shadow-none backdrop-blur-xl"
                >
                  <div class="space-y-1">
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      type="button"
                      @click="
                        createPage();
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >note_stack_add</span
                      >
                      <span>新建 Page</span>
                    </button>
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      type="button"
                      :disabled="!currentPage"
                      @click="
                        createFrame('freeform');
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >dashboard</span
                      >
                      <span>新建自由 Frame</span>
                    </button>
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      type="button"
                      :disabled="!currentPage"
                      @click="
                        createFrame('device_artboard');
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >smartphone</span
                      >
                      <span>新建设备画板</span>
                    </button>
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      type="button"
                      :disabled="!currentPage"
                      @click="
                        createFrame('device_mockup');
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >phone_iphone</span
                      >
                      <span>新建设备 Mockup</span>
                    </button>
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      type="button"
                      :disabled="!currentPage"
                      @click="
                        createFrame('diagram');
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >account_tree</span
                      >
                      <span>新建 Diagram</span>
                    </button>
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      type="button"
                      :disabled="!currentPage"
                      @click="
                        applyTemplateFrame(DEFAULT_TEMPLATE_KEY);
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >auto_awesome_mosaic</span
                      >
                      <span>插入模板稿</span>
                    </button>
                  </div>

                  <div class="my-2 border-t border-slate-100" />

                  <div class="space-y-1">
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      type="button"
                      :disabled="!currentPage"
                      @click="
                        downloadSvg();
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >download</span
                      >
                      <span>导出 Page SVG</span>
                    </button>
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      type="button"
                      :disabled="!currentPage"
                      @click="
                        downloadPng();
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >image</span
                      >
                      <span>导出 Page PNG</span>
                    </button>
                    <button
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      type="button"
                      :disabled="!canExportSingleFrame"
                      @click="
                        downloadPng(selectedFrame?.id || '');
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >crop_portrait</span
                      >
                      <span>导出 Frame PNG</span>
                    </button>
                    <button
                      v-if="canOpenDiagramEditor"
                      class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50"
                      type="button"
                      @click="
                        openFrameEditor(selectedFrame?.id || '');
                        closeActionMenu();
                      "
                    >
                      <span class="material-symbols-outlined text-base"
                        >schema</span
                      >
                      <span>打开 Diagram 编辑态</span>
                    </button>
                  </div>
                </div>
              </div>
              <button
                v-if="sidebarCollapsed"
                class="workspace-design-sidebar-toggle flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900"
                type="button"
                title="展开设计面板"
                data-testid="workspace-design-sidebar-toggle"
                @click="toggleSidebarCollapsed"
              >
                <span class="material-symbols-outlined text-[18px]">
                  right_panel_open
                </span>
              </button>
            </div>
          </template>

          <template v-if="!sidebarCollapsed">
            <div
              v-if="activeSidebarTab !== 'frames'"
              class="mb-3 flex flex-wrap gap-2"
            >
              <template v-if="activeSidebarTab === 'pages'">
                <span
                  class="rounded-full border border-slate-200 bg-white/72 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                >
                  {{ pages.length }} pages
                </span>
              </template>

              <template v-else>
                <span
                  class="rounded-full border border-slate-200 bg-white/72 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                >
                  {{ templateOptions.length }} templates
                </span>
                <span
                  class="rounded-full border border-slate-200 bg-white/72 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                >
                  {{ imageAssets.length }} 图片
                </span>
                <span
                  class="rounded-full border border-slate-200 bg-white/72 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                >
                  {{ deviceShellAssets.length }} 设备壳
                </span>
              </template>
            </div>

            <div
              v-if="activeSidebarTab === 'pages'"
              class="space-y-2"
              data-testid="workspace-design-sidebar-pages"
            >
              <button
                v-for="page in pages"
                :key="page.id"
                class="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
                :class="
                  page.id === currentPage?.id
                    ? 'border-slate-300 bg-white/88 text-slate-950'
                    : 'border-slate-200 bg-white/56 text-slate-700 hover:border-slate-300 hover:bg-white/78'
                "
                type="button"
                @click="selectPage(page.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold">
                      {{ page.name }}
                    </p>
                    <p class="mt-1 text-[11px] text-slate-500">
                      {{
                        (compositionModel.frames || []).filter(
                          (frame) => frame.pageId === page.id,
                        ).length
                      }}
                      frame
                    </p>
                  </div>
                  <div class="flex shrink-0 gap-1">
                    <button
                      class="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900"
                      type="button"
                      @click.stop="movePage(page.id, -1)"
                    >
                      ↑
                    </button>
                    <button
                      class="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900"
                      type="button"
                      @click.stop="movePage(page.id, 1)"
                    >
                      ↓
                    </button>
                    <button
                      class="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                      type="button"
                      :disabled="pages.length <= 1"
                      @click.stop="removePage(page.id)"
                    >
                      删
                    </button>
                  </div>
                </div>
              </button>
            </div>

            <div
              v-else-if="activeSidebarTab === 'frames'"
              class="workspace-design-layer-tree space-y-0.5"
              :style="layerTreeMetricsStyle"
              data-testid="workspace-design-sidebar-frames"
            >
              <div
                v-if="!frameSidebarTreeRows.length"
                class="rounded-2xl border border-dashed border-slate-200 bg-white/52 px-3 py-4 text-[12px] font-medium text-slate-500"
              >
                当前 Page 还没有可展示的 Frame 或元素
              </div>

              <template v-for="row in frameSidebarTreeRows" :key="row.node.id">
                <div
                  class="workspace-design-layer-tree__row group flex items-center transition-colors"
                  :class="resolveLayerTreeNodeClass(row.node)"
                  :style="{ paddingLeft: resolveLayerTreeRowPaddingLeft(row.depth) }"
                >
                  <template
                    v-for="guideDepth in resolveActiveLayerTreeGuideDepths(row.node.id)"
                    :key="`${row.node.id}-guide-${guideDepth}`"
                  >
                    <span
                      class="workspace-design-layer-tree__guide-line"
                      :style="{ left: resolveLayerTreeGuideLeft(guideDepth) }"
                      aria-hidden="true"
                    />
                  </template>
                  <span
                    v-if="resolveActiveLayerTreeConnectorDepth(row.node.id) >= 0"
                    class="workspace-design-layer-tree__connector"
                    :style="
                      resolveLayerTreeConnectorStyle(
                        resolveActiveLayerTreeConnectorDepth(row.node.id),
                      )
                    "
                    aria-hidden="true"
                  />
                  <button
                    v-if="row.node.children?.length"
                    class="workspace-design-layer-tree__toggle flex shrink-0 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    type="button"
                    :title="isLayerTreeNodeExpanded(row.node.id) ? '折叠' : '展开'"
                    @click.stop="toggleLayerTreeNodeExpanded(row.node.id)"
                  >
                    <span class="material-symbols-outlined workspace-design-layer-tree__toggle-icon leading-none">
                      {{
                        isLayerTreeNodeExpanded(row.node.id)
                          ? "keyboard_arrow_down"
                          : "keyboard_arrow_right"
                      }}
                    </span>
                  </button>
                  <span
                    v-else
                    class="workspace-design-layer-tree__toggle-placeholder shrink-0"
                    aria-hidden="true"
                  />
                  <button
                    class="workspace-design-layer-tree__body flex min-w-0 flex-1 items-center text-left"
                    type="button"
                    @click="handleLayerTreeNodeSelection(row.node, $event)"
                  >
                    <span
                      class="material-symbols-outlined workspace-design-layer-tree__node-icon shrink-0 leading-none"
                      :class="isLayerTreeNodeAncestor(row.node.id) ? 'text-slate-700' : ''"
                    >
                      {{ resolveLayerTreeNodeIcon(row.node) }}
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="workspace-design-layer-tree__label truncate font-semibold">
                        {{ row.node.label }}
                      </p>
                      <p
                        v-if="row.node.type === 'frame' && row.node.frameId"
                        class="workspace-design-layer-tree__meta truncate text-slate-500"
                      >
                        {{ resolveLayerTreeFrameMeta(row.node.frameId) }}
                      </p>
                    </div>
                  </button>

                  <div class="workspace-design-layer-tree__actions flex shrink-0 items-center">
                    <button
                      v-if="row.node.type === 'element' && row.node.elementId"
                      class="workspace-design-layer-tree__action flex shrink-0 items-center justify-center text-slate-400"
                      :class="row.node.hidden ? 'workspace-design-layer-tree__action--active' : ''"
                      type="button"
                      :title="row.node.hidden ? '显示元素' : '隐藏元素'"
                      :aria-label="row.node.hidden ? '显示元素' : '隐藏元素'"
                      :aria-pressed="row.node.hidden ? 'true' : 'false'"
                      @click.stop="toggleElementHiddenById(row.node.elementId)"
                    >
                      <span class="material-symbols-outlined workspace-design-layer-tree__action-icon leading-none">
                        {{ row.node.hidden ? "visibility_off" : "visibility" }}
                      </span>
                    </button>
                    <button
                      v-if="
                        (row.node.type === 'frame' && row.node.frameId)
                        || (row.node.type === 'element' && row.node.elementId)
                      "
                      class="workspace-design-layer-tree__action flex shrink-0 items-center justify-center text-slate-400"
                      :class="row.node.locked ? 'workspace-design-layer-tree__action--active' : ''"
                      type="button"
                      :title="row.node.locked ? '解锁图层' : '锁定图层'"
                      :aria-label="row.node.locked ? '解锁图层' : '锁定图层'"
                      :aria-pressed="row.node.locked ? 'true' : 'false'"
                      @click.stop="toggleLayerTreeNodeLocked(row.node)"
                    >
                      <span class="material-symbols-outlined workspace-design-layer-tree__action-icon leading-none">
                        {{ row.node.locked ? "lock" : "lock_open" }}
                      </span>
                    </button>
                    <button
                      class="workspace-design-layer-tree__menu-trigger flex shrink-0 items-center justify-center text-slate-400"
                      :class="
                        layerTreeMenuNodeId === row.node.id
                          ? 'workspace-design-layer-tree__menu-trigger--active'
                          : ''
                      "
                      type="button"
                      title="更多操作"
                      aria-label="更多操作"
                      @click.stop="openLayerTreeMenu(row.node, $event)"
                    >
                      <span class="material-symbols-outlined workspace-design-layer-tree__action-icon leading-none">
                        more_horiz
                      </span>
                    </button>
                  </div>
                </div>
              </template>
            </div>

            <div v-else data-testid="workspace-design-sidebar-assets">
              <div class="space-y-4">
                <section class="space-y-2">
                  <div
                    class="flex items-center justify-between gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                  >
                    <span>模板</span>
                    <span>{{ templateOptions.length }}</span>
                  </div>
                  <div class="space-y-2">
                    <button
                      v-for="template in templateOptions"
                      :key="template.templateKey"
                      class="w-full rounded-2xl border border-slate-200 bg-white/56 px-3 py-3 text-left transition-colors hover:border-slate-300 hover:bg-white/78"
                      type="button"
                      @click="applyTemplateFrame(template.templateKey)"
                    >
                      <p class="text-sm font-semibold text-slate-800">
                        {{ template.title }}
                      </p>
                      <p class="mt-1 text-[11px] leading-5 text-slate-500">
                        {{ template.summary }}
                      </p>
                    </button>
                  </div>
                </section>

                <section class="space-y-2">
                  <div
                    class="flex items-center justify-between gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                  >
                    <span>普通图片资源</span>
                    <span>{{ imageAssets.length }}</span>
                  </div>

                  <label
                    class="block rounded-2xl border border-dashed border-slate-300 bg-white/56 px-3 py-4 text-center"
                  >
                    <span class="text-xs font-semibold text-slate-700"
                      >上传图片资源</span
                    >
                    <input
                      class="hidden"
                      accept="image/*"
                      type="file"
                      @change="handleAssetUpload"
                    />
                  </label>

                  <div v-if="imageAssets.length" class="space-y-2">
                    <button
                      v-for="asset in imageAssets"
                      :key="asset.id"
                      class="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/72 px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-white/88"
                      type="button"
                      @click="useAsset(asset)"
                    >
                      <img
                        :src="asset.src"
                        alt=""
                        class="h-12 w-12 rounded-xl object-cover"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-semibold text-slate-800">
                          {{ asset.name }}
                        </p>
                        <p class="truncate text-[11px] text-slate-500">
                          {{ asset.mimeType || "image/*" }}
                        </p>
                      </div>
                      <span
                        class="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500"
                      >
                        应用
                      </span>
                    </button>
                  </div>
                </section>

                <section class="space-y-2">
                  <div
                    class="flex items-center justify-between gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                  >
                    <span>设备壳资源</span>
                    <span>{{ deviceShellAssets.length }}</span>
                  </div>

                  <label
                    class="block rounded-2xl border border-dashed border-slate-300 bg-white/56 px-3 py-4 text-center"
                  >
                    <span class="text-xs font-semibold text-slate-700"
                      >上传 SVG / PNG 设备壳</span
                    >
                    <p class="mt-1 text-[11px] leading-5 text-slate-500">
                      上传后可直接填写 viewportRect 和 cornerRadius。
                    </p>
                    <input
                      class="hidden"
                      accept="image/svg+xml,image/png"
                      type="file"
                      @change="handleShellAssetUpload"
                    />
                  </label>

                  <div
                    v-if="deviceShellAssets.length"
                    class="space-y-3"
                  >
                    <div
                      v-for="asset in deviceShellAssets"
                      :key="asset.id"
                      class="rounded-2xl border border-slate-200 bg-white/72 p-3"
                    >
                      <div class="flex items-start gap-3">
                        <img
                          :src="asset.src"
                          alt=""
                          class="h-14 w-14 rounded-xl border border-slate-200 bg-slate-50 object-contain"
                        />
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <p class="truncate text-sm font-semibold text-slate-800">
                              {{ asset.name }}
                            </p>
                            <span
                              class="rounded-full px-2 py-1 text-[10px] font-semibold"
                              :class="
                                isDeviceShellAssetValid(asset)
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border border-amber-200 bg-amber-50 text-amber-700'
                              "
                            >
                              {{
                                isDeviceShellAssetValid(asset)
                                  ? '可导出'
                                  : '待补 viewport'
                              }}
                            </span>
                          </div>
                          <p class="mt-1 truncate text-[11px] text-slate-500">
                            {{ resolveDeviceShellPresetSummary(asset) }}
                          </p>
                        </div>
                        <button
                          class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                          type="button"
                          :disabled="
                            !selectedFrame ||
                            (selectedFrame.kind !== 'device_mockup' &&
                              selectedFrame.kind !== 'device_artboard') ||
                            !isDeviceShellAssetValid(asset)
                          "
                          @click="useShellAsset(asset)"
                        >
                          应用到当前设备
                        </button>
                      </div>

                      <div class="mt-3 grid grid-cols-2 gap-2">
                        <label class="flex flex-col gap-1">
                          <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">x</span>
                          <input
                            :value="resolveShellViewportRect(asset).x"
                            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-slate-300"
                            type="number"
                            @change="
                              updateShellAssetMetadata(asset.id, {
                                viewportRect: {
                                  x: Number(
                                    ($event.target as HTMLInputElement).value,
                                  ),
                                },
                              })
                            "
                          />
                        </label>
                        <label class="flex flex-col gap-1">
                          <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">y</span>
                          <input
                            :value="resolveShellViewportRect(asset).y"
                            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-slate-300"
                            type="number"
                            @change="
                              updateShellAssetMetadata(asset.id, {
                                viewportRect: {
                                  y: Number(
                                    ($event.target as HTMLInputElement).value,
                                  ),
                                },
                              })
                            "
                          />
                        </label>
                        <label class="flex flex-col gap-1">
                          <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">width</span>
                          <input
                            :value="resolveShellViewportRect(asset).width"
                            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-slate-300"
                            type="number"
                            min="0"
                            @change="
                              updateShellAssetMetadata(asset.id, {
                                viewportRect: {
                                  width: Number(
                                    ($event.target as HTMLInputElement).value,
                                  ),
                                },
                              })
                            "
                          />
                        </label>
                        <label class="flex flex-col gap-1">
                          <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">height</span>
                          <input
                            :value="resolveShellViewportRect(asset).height"
                            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-slate-300"
                            type="number"
                            min="0"
                            @change="
                              updateShellAssetMetadata(asset.id, {
                                viewportRect: {
                                  height: Number(
                                    ($event.target as HTMLInputElement).value,
                                  ),
                                },
                              })
                            "
                          />
                        </label>
                      </div>

                      <label class="mt-2 flex flex-col gap-1">
                        <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">cornerRadius</span>
                        <input
                          :value="
                            Number(asset.metadata?.deviceShell?.cornerRadius || 0)
                          "
                          class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-slate-300"
                          type="number"
                          min="0"
                          @change="
                            updateShellAssetMetadata(asset.id, {
                              cornerRadius: Number(
                                ($event.target as HTMLInputElement).value,
                              ),
                            })
                          "
                        />
                      </label>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </template>
        </WLDesignContainer>
      </template>

      <template #canvas>
        <WLDesignLayer variant="stage" :padded="false">
          <WorkspaceDesignStage
            :page="designEditorState.currentPage.value"
            :frames="designEditorState.currentPageFrames.value"
            :page-root-elements="designEditorState.pageRootElements.value"
            :frame-elements="frameElementsById.value"
            :theme-tokens="compositionModel.themeTokens || {}"
            :active-tool="activeTool"
            :selection-state="selectionState"
            :interaction-context="interactionContext"
            :remote-cursors="props.collabPresenceCursors"
            :viewport-x="stageViewportX"
            :viewport-y="stageViewportY"
            :viewport-zoom="stageViewportZoom"
            :disabled="!isBoundToDesignResource"
            @update-selection="replaceSelectionState($event)"
            @open-frame="openFrameEditor"
            @duplicate-frame="duplicateSelectedFrame"
            @delete-frame="removeSelectedFrame"
            @update-frame-position="updateSelectedFramePosition"
            @update-frame-positions="updateSelectedFramePositions"
            @update-frame-size="updateFrameGeometry"
            @viewport-change="handleStageViewportChange"
            @update-collab-cursor="emit('updateCollabCursor', $event)"
            @create-element="createDesignElementFromStage"
            @update-element="updateDesignElementFromStage"
            @update-elements="updateDesignElementsFromStage"
          />
        </WLDesignLayer>
      </template>

      <template #bottom-toolbar>
        <div class="workspace-design-toolbar-stack workspace-design-toolbar-shell">
          <div
            v-if="toolSwitchHint"
            class="workspace-design-tool-switch-hint"
            aria-live="polite"
            role="status"
          >
            {{ toolSwitchHint }}
          </div>
          <WLDesignLayer variant="toolbar" :fill="false" :padded="false" class="workspace-design-floating-panel">
            <WorkspaceDesignToolbar
              :active-tool="activeTool"
              @update:active-tool="setActiveDesignTool($event)"
            />
          </WLDesignLayer>
        </div>
      </template>

      <template #right>
        <div
          class="workspace-design-inspector-host flex h-full min-h-0 w-full items-stretch justify-end overflow-hidden"
        >
          <WLDesignContainer
            class="workspace-design-floating-panel workspace-design-glass-panel workspace-design-inspector-panel h-full min-h-0 max-h-full w-full"
            :data-collapsed="inspectorCollapsed ? 'true' : 'false'"
            :scrollable="!inspectorCollapsed"
            :title="''"
            :subtitle="''"
          >
            <template #header-title>
              <div v-if="!inspectorCollapsed" class="min-w-0">
                <input
                  v-if="inspectorHeaderEditing"
                  ref="inspectorHeaderInputRef"
                  v-model="inspectorHeaderDraft"
                  class="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold leading-4 text-slate-900 outline-none transition-colors focus:border-slate-400"
                  type="text"
                  @blur="submitInspectorHeaderRename"
                  @keydown.enter.prevent="submitInspectorHeaderRename"
                  @keydown.esc.prevent="cancelInspectorHeaderRename"
                />
                <button
                  v-else
                  class="min-w-0 truncate text-left text-[12px] font-semibold leading-4 text-slate-900 transition-colors hover:text-slate-700"
                  :title="
                    canRenameInspectorHeader
                      ? `点击修改名称：${inspectorHeaderTitle}`
                      : inspectorHeaderTitle
                  "
                  type="button"
                  @click="openInspectorRenamePrompt"
                >
                  {{ inspectorHeaderTitle }}
                </button>
              </div>
            </template>
            <template #actions>
              <button
                class="workspace-design-inspector-toggle flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900"
                :class="
                  inspectorCollapsed
                    ? 'workspace-design-inspector-toggle--collapsed'
                    : ''
                "
                type="button"
                :title="inspectorCollapsed ? '展开属性面板' : '收起属性面板'"
                data-testid="workspace-design-inspector-toggle"
                @click="toggleInspectorCollapsed"
              >
                <span class="material-symbols-outlined text-[18px]">
                  {{
                    inspectorCollapsed ? "left_panel_open" : "right_panel_close"
                  }}
                </span>
              </button>
            </template>
            <template #header-extra>
              <div
                v-if="!inspectorCollapsed && inspectorHasHeaderExtra"
                class="-mt-1 flex items-center gap-1.5"
              >
                <div class="flex items-center gap-1.5">
                  <button
                    class="workspace-design-inspector-header-icon"
                    :class="
                      inspectorTargetLocked
                        ? 'workspace-design-inspector-header-icon--active'
                        : ''
                    "
                    type="button"
                    :disabled="!canLockInspectorTarget"
                    :title="
                      inspectorTargetLocked ? '解锁当前对象' : '锁定当前对象'
                    "
                    :aria-label="
                      inspectorTargetLocked ? '解锁当前对象' : '锁定当前对象'
                    "
                    @click="runInspectorHeaderLockAction"
                  >
                    <span
                      class="material-symbols-outlined text-[16px] leading-none"
                    >
                      {{ inspectorTargetLocked ? "lock" : "lock_open" }}
                    </span>
                  </button>
                  <button
                    class="workspace-design-inspector-header-icon"
                    type="button"
                    :disabled="!canDuplicateInspectorTarget"
                    title="复制当前对象"
                    aria-label="复制当前对象"
                    @click="runInspectorHeaderDuplicateAction"
                  >
                    <span
                      class="material-symbols-outlined text-[16px] leading-none"
                      >content_copy</span
                    >
                  </button>
                  <button
                    class="workspace-design-inspector-header-icon workspace-design-inspector-header-icon--danger"
                    type="button"
                    :disabled="!canDeleteInspectorTarget"
                    title="删除当前对象"
                    aria-label="删除当前对象"
                    @click="runInspectorHeaderDeleteAction"
                  >
                    <span
                      class="material-symbols-outlined text-[16px] leading-none"
                      >delete</span
                    >
                  </button>
                </div>
                <span
                  class="inline-flex h-4 items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-600"
                  :title="`当前对象类型：${inspectorSelectionTag}`"
                >
                  {{ inspectorSelectionTag }}
                </span>
              </div>
            </template>
            <WorkspaceDesignInspector
              :page="designEditorState.currentPage.value"
              :frame="designEditorState.selectedFrame.value"
              :element="designEditorState.selectedElement.value"
              :element-frame="selectedElementFrame"
              :selected-frame-count="selectedFrameIds.length"
              :selected-element-count="selectedElementIds.length"
              :device-frame-presets="DEVICE_FRAME_PRESETS"
              :device-artboard-options="availableDeviceArtboards"
              :device-shell-assets="deviceShellAssets"
              :frame-preview-markup="selectedFramePreviewSvg"
              :frame-shell-preview-markup="selectedFrameShellPreviewSvg"
              :design-resource-id="
                props.designResourceId || 'pending-design-resource'
              "
              :collab-draw-error="props.collabDrawError"
              :can-open-diagram-editor="canOpenDiagramEditor"
              :diagram-source-format="diagramSourceFormat"
              :diagram-source-text="diagramSourceText"
              @update-page="updateCurrentPage"
              @update-frame="updateSelectedFrame"
              @update-element="updateSelectedElement"
              @toggle-frames-locked="toggleSelectedFramesLocked"
              @duplicate-frame="duplicateSelectedFrame"
              @remove-frame="removeSelectedFrame"
              @run-selection-command="runSelectionCommand"
              @update:diagram-source-format="diagramSourceFormat = $event"
              @update:diagram-source-text="diagramSourceText = $event"
              @apply-diagram-source="applyDiagramSource"
              @open-diagram-editor="openFrameEditor(selectedFrame?.id || '')"
            />
          </WLDesignContainer>
        </div>
      </template>

      <template #overlay>
        <div
          v-if="diagramEditorFrame"
          class="workspace-design-diagram-overlay pointer-events-auto fixed inset-5 z-[60] grid min-h-0 grid-cols-1 gap-4 overflow-hidden rounded-[12px] border border-slate-200/90 bg-white/96 p-4 shadow-[0_32px_96px_rgba(15,23,42,0.16)] xl:grid-cols-[minmax(0,1fr),360px]"
        >
          <section
            class="min-h-0 rounded-[24px] border border-slate-800 bg-slate-900/80 p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-sm font-bold text-white">Diagram 编辑态</h3>
                <p class="mt-1 text-xs leading-6 text-slate-400">
                  当前正在编辑 {{ diagramEditorFrame.name }}。导入会覆盖该 frame
                  的 `embeddedScene`，但仍保留结构化语义。
                </p>
              </div>
              <button
                class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                type="button"
                @click="closeDiagramEditor"
              >
                关闭
              </button>
            </div>

            <div
              class="mt-4 grid gap-3 xl:grid-cols-[220px,minmax(0,1fr),160px,160px]"
            >
              <label class="block space-y-1">
                <span class="text-xs font-semibold text-slate-300"
                  >结构源类型</span
                >
                <select
                  v-model="diagramSourceFormat"
                  class="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                >
                  <option value="mermaid">Mermaid</option>
                  <option value="markdown_outline">Markdown Outline</option>
                  <option value="ddl">DDL</option>
                  <option value="architecture">Architecture Metadata</option>
                </select>
              </label>
              <div class="hidden xl:block"></div>
              <button
                class="rounded-2xl bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400"
                type="button"
                @click="applyDiagramSource"
              >
                覆盖导入
              </button>
              <button
                class="rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800"
                type="button"
                @click="relayoutSelectedDiagramFrame"
              >
                重新布局
              </button>
            </div>

            <label class="mt-4 block space-y-1">
              <span class="text-xs font-semibold text-slate-300">源文本</span>
              <textarea
                v-model="diagramSourceText"
                class="min-h-[360px] w-full rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-slate-100 outline-none focus:border-sky-400"
              ></textarea>
            </label>
          </section>

          <section class="flex min-h-0 flex-col gap-4">
            <div
              class="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4"
            >
              <h4
                class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
              >
                Frame Preview
              </h4>
              <div
                class="mt-3 overflow-hidden rounded-[20px] border border-slate-800 bg-slate-950"
                v-html="
                  renderCompositionAssetToSvg(draftDocument, {
                    frameId: diagramEditorFrame.id,
                  })
                "
              ></div>
            </div>
            <div
              v-if="diagramEditorGraph && diagramEditorScene"
              class="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h4
                    class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
                  >
                    Diagram Canvas
                  </h4>
                  <p class="mt-1 text-xs leading-5 text-slate-500">
                    点击容器、节点或边会聚焦
                    inspector；拖拽节点时会显示栅格吸附与对齐反馈，连线会直接创建
                    graph edge。
                  </p>
                </div>
                <button
                  class="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-900"
                  type="button"
                  @click="addDiagramGraphNode"
                >
                  Add Node
                </button>
              </div>
              <div
                class="mt-3 h-[320px] overflow-hidden rounded-[20px] border border-slate-800 bg-slate-950"
              >
                <ClientOnly>
                  <WorkspaceDesignDiagramEditor
                    :graph="diagramEditorGraph"
                    :scene="diagramEditorScene"
                    :selected-group-id="diagramSelectedGroupId"
                    :selected-node-id="diagramSelectedNodeId"
                    :selected-edge-id="diagramSelectedEdgeId"
                    @select-group="selectDiagramGroup"
                    @select-node="selectDiagramNode"
                    @select-edge="selectDiagramEdge"
                    @connect-edge="connectDiagramGraphEdge"
                    @update-node-position="updateDiagramGraphNodePosition"
                    @update-group-frame="updateDiagramGraphGroupFrame"
                    @create-group="addDiagramGraphGroup"
                    @delete-group="removeDiagramGraphGroup"
                    @create-node="addDiagramGraphNode"
                    @add-child="addDiagramChildNode"
                    @duplicate-node="duplicateDiagramGraphNode"
                    @delete-node="removeDiagramGraphNode"
                    @reverse-edge="reverseDiagramGraphEdge"
                    @delete-edge="removeDiagramGraphEdge"
                    @clear-selection="clearDiagramSelection"
                  />
                </ClientOnly>
              </div>
            </div>
            <div
              class="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4"
            >
              <h4
                class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
              >
                Embedded Scene
              </h4>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div
                  class="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                >
                  <p
                    class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                  >
                    Draw Mode
                  </p>
                  <p class="mt-2 text-sm font-semibold text-slate-100">
                    {{
                      diagramEditorFrame.embeddedScene?.drawMode || "diagram"
                    }}
                  </p>
                </div>
                <div
                  class="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                >
                  <p
                    class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                  >
                    Source Type
                  </p>
                  <p class="mt-2 text-sm font-semibold text-slate-100">
                    {{
                      diagramEditorFrame.embeddedScene?.sourceType || "manual"
                    }}
                  </p>
                </div>
                <div
                  class="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                >
                  <p
                    class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                  >
                    Nodes
                  </p>
                  <p class="mt-2 text-sm font-semibold text-slate-100">
                    {{
                      diagramEditorFrame.embeddedScene?.sceneModel?.nodes
                        ?.length || 0
                    }}
                  </p>
                </div>
                <div
                  class="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                >
                  <p
                    class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                  >
                    Edges
                  </p>
                  <p class="mt-2 text-sm font-semibold text-slate-100">
                    {{
                      diagramEditorFrame.embeddedScene?.sceneModel?.edges
                        ?.length || 0
                    }}
                  </p>
                </div>
              </div>
            </div>

            <div
              v-if="diagramEditorGraph"
              class="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h4
                    class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
                  >
                    Graph Controls
                  </h4>
                  <p class="mt-1 text-xs leading-5 text-slate-500">
                    仅对 `graph` 型 diagram 开放节点与边级编辑，修改后会写回
                    `embeddedScene.sourceModel` 并重新布局。
                  </p>
                </div>
                <button
                  class="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-900"
                  type="button"
                  @click="addDiagramGraphNode"
                >
                  Add Node
                </button>
              </div>

              <label class="mt-4 block space-y-1">
                <span class="text-xs font-semibold text-slate-300"
                  >Diagram Type</span
                >
                <select
                  :value="diagramEditorGraph.diagramType"
                  class="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                  @change="
                    updateDiagramGraphType(
                      ($event.target as HTMLSelectElement)
                        .value as GraphSourceModel['diagramType'],
                    )
                  "
                >
                  <option value="flowchart">flowchart</option>
                  <option value="mindmap">mindmap</option>
                  <option value="relationship">relationship</option>
                  <option value="architecture">architecture</option>
                </select>
              </label>

              <div
                class="mt-4 rounded-[20px] border border-slate-800 bg-slate-950 px-4 py-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h5
                      class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400"
                    >
                      Selection Inspector
                    </h5>
                    <p class="mt-1 text-xs leading-5 text-slate-500">
                      当前聚焦的容器、节点或边会在这里提供快捷操作，配合右上角子画布使用。
                    </p>
                  </div>
                  <button
                    class="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-slate-800"
                    type="button"
                    @click="clearDiagramSelection"
                  >
                    Clear
                  </button>
                </div>

                <div v-if="diagramSelectedGroup" class="mt-4 space-y-3">
                  <div
                    class="rounded-2xl border border-sky-500/30 bg-sky-500/5 px-3 py-3"
                  >
                    <p
                      class="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300"
                    >
                      Selected Group
                    </p>
                    <p class="mt-2 text-sm font-semibold text-slate-100">
                      {{
                        diagramSelectedGroup.label || diagramSelectedGroup.id
                      }}
                    </p>
                    <p class="mt-1 text-[11px] text-slate-500">
                      {{ diagramSelectedGroup.id }} ·
                      {{
                        diagramSelectedGroup.metadata?.layoutKind === "swimlane"
                          ? "swimlane"
                          : "container"
                      }}
                    </p>
                  </div>

                  <div class="grid gap-3">
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >id</span
                      >
                      <input
                        :value="diagramSelectedGroup.id"
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="text"
                        @change="
                          updateDiagramGraphGroup(diagramSelectedGroup.id, {
                            id: ($event.target as HTMLInputElement).value,
                          })
                        "
                      />
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >label</span
                      >
                      <input
                        :value="diagramSelectedGroup.label"
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="text"
                        @input="
                          updateDiagramGraphGroup(diagramSelectedGroup.id, {
                            label: ($event.target as HTMLInputElement).value,
                          })
                        "
                      />
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >layout kind</span
                      >
                      <select
                        :value="
                          diagramSelectedGroup.metadata?.layoutKind ===
                          'swimlane'
                            ? 'swimlane'
                            : 'container'
                        "
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        @change="
                          updateDiagramGraphGroup(diagramSelectedGroup.id, {
                            metadata: {
                              layoutKind: ($event.target as HTMLSelectElement)
                                .value,
                            },
                          })
                        "
                      >
                        <option value="container">container</option>
                        <option value="swimlane">swimlane</option>
                      </select>
                    </label>
                    <label
                      v-if="
                        diagramSelectedGroup.metadata?.layoutKind === 'swimlane'
                      "
                      class="block space-y-1"
                    >
                      <span class="text-[11px] font-semibold text-slate-400"
                        >lane direction</span
                      >
                      <select
                        :value="
                          diagramSelectedGroup.metadata?.laneDirection ===
                          'vertical'
                            ? 'vertical'
                            : 'horizontal'
                        "
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        @change="
                          updateDiagramGraphGroup(diagramSelectedGroup.id, {
                            metadata: {
                              laneDirection: (
                                $event.target as HTMLSelectElement
                              ).value,
                            },
                          })
                        "
                      >
                        <option value="horizontal">horizontal</option>
                        <option value="vertical">vertical</option>
                      </select>
                    </label>
                  </div>

                  <div class="grid grid-cols-2 gap-3">
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >x</span
                      >
                      <input
                        :value="
                          Math.round(diagramSelectedGroupSceneNode?.x || 0)
                        "
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="number"
                        @change="
                          updateDiagramGraphGroupFrame(
                            diagramSelectedGroup.id,
                            {
                              x: Number(
                                ($event.target as HTMLInputElement).value,
                              ),
                            },
                          )
                        "
                      />
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >y</span
                      >
                      <input
                        :value="
                          Math.round(diagramSelectedGroupSceneNode?.y || 0)
                        "
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="number"
                        @change="
                          updateDiagramGraphGroupFrame(
                            diagramSelectedGroup.id,
                            {
                              y: Number(
                                ($event.target as HTMLInputElement).value,
                              ),
                            },
                          )
                        "
                      />
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >width</span
                      >
                      <input
                        :value="
                          Math.round(
                            diagramSelectedGroupSceneNode?.width || 320,
                          )
                        "
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="number"
                        min="260"
                        @change="
                          updateDiagramGraphGroupFrame(
                            diagramSelectedGroup.id,
                            {
                              width: Number(
                                ($event.target as HTMLInputElement).value,
                              ),
                            },
                          )
                        "
                      />
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >height</span
                      >
                      <input
                        :value="
                          Math.round(
                            diagramSelectedGroupSceneNode?.height || 220,
                          )
                        "
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="number"
                        min="180"
                        @change="
                          updateDiagramGraphGroupFrame(
                            diagramSelectedGroup.id,
                            {
                              height: Number(
                                ($event.target as HTMLInputElement).value,
                              ),
                            },
                          )
                        "
                      />
                    </label>
                  </div>

                  <div
                    class="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p
                        class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400"
                      >
                        Members
                      </p>
                      <div
                        class="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-slate-400"
                      >
                        {{ (diagramSelectedGroup.childNodeIds || []).length }}
                      </div>
                    </div>

                    <div class="mt-3 space-y-2">
                      <label
                        v-for="node in diagramEditorGraph.nodes"
                        :key="`group-member-${diagramSelectedGroup.id}-${node.id}`"
                        class="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
                      >
                        <span class="min-w-0 truncate text-xs text-slate-200">{{
                          node.label || node.id
                        }}</span>
                        <input
                          class="h-4 w-4 rounded border-slate-700 bg-slate-900 text-sky-400"
                          type="checkbox"
                          :checked="
                            (diagramSelectedGroup.childNodeIds || []).includes(
                              node.id,
                            ) || node.parentId === diagramSelectedGroup.id
                          "
                          @change="
                            toggleDiagramGraphGroupMembership(
                              diagramSelectedGroup.id,
                              node.id,
                            )
                          "
                        />
                      </label>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <button
                      class="rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-900/40"
                      type="button"
                      @click="
                        relayoutDiagramGraphGroup(diagramSelectedGroup.id)
                      "
                    >
                      整理成员
                    </button>
                    <button
                      class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
                      type="button"
                      @click="
                        fitDiagramGraphGroupToMembers(diagramSelectedGroup.id)
                      "
                    >
                      按内容收紧
                    </button>
                    <button
                      class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
                      type="button"
                      @click="
                        resetDiagramGraphGroupManualLayout(
                          diagramSelectedGroup.id,
                        )
                      "
                    >
                      恢复自动布局
                    </button>
                    <button
                      class="rounded-full border border-sky-800 bg-sky-950/40 px-3 py-1.5 text-[11px] font-semibold text-sky-200 transition-colors hover:bg-sky-900/40"
                      type="button"
                      @click="addDiagramGraphGroup('container')"
                    >
                      添加容器
                    </button>
                    <button
                      class="rounded-full border border-sky-800 bg-sky-950/40 px-3 py-1.5 text-[11px] font-semibold text-sky-200 transition-colors hover:bg-sky-900/40"
                      type="button"
                      @click="addDiagramGraphGroup('swimlane')"
                    >
                      添加泳道
                    </button>
                    <button
                      class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                      type="button"
                      @click="removeDiagramGraphGroup(diagramSelectedGroup.id)"
                    >
                      删除容器
                    </button>
                  </div>
                </div>

                <div v-else-if="diagramSelectedNode" class="mt-4 space-y-3">
                  <div
                    class="rounded-2xl border border-sky-500/30 bg-sky-500/5 px-3 py-3"
                  >
                    <p
                      class="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300"
                    >
                      Selected Node
                    </p>
                    <p class="mt-2 text-sm font-semibold text-slate-100">
                      {{ diagramSelectedNode.label || diagramSelectedNode.id }}
                    </p>
                    <p class="mt-1 text-[11px] text-slate-500">
                      {{ diagramSelectedNode.id }} ·
                      {{ diagramSelectedNode.type || "node" }}
                    </p>
                  </div>

                  <div class="grid gap-3">
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >id</span
                      >
                      <input
                        :value="diagramSelectedNode.id"
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="text"
                        @change="
                          updateDiagramGraphNode(diagramSelectedNode.id, {
                            id: ($event.target as HTMLInputElement).value,
                          })
                        "
                      />
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >label</span
                      >
                      <input
                        :value="diagramSelectedNode.label"
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="text"
                        @input="
                          updateDiagramGraphNode(diagramSelectedNode.id, {
                            label: ($event.target as HTMLInputElement).value,
                          })
                        "
                      />
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >type</span
                      >
                      <input
                        :value="diagramSelectedNode.type || ''"
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="text"
                        @input="
                          updateDiagramGraphNode(diagramSelectedNode.id, {
                            type: ($event.target as HTMLInputElement).value,
                          })
                        "
                      />
                    </label>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <button
                      class="rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-900/40"
                      type="button"
                      @click="addDiagramChildNode(diagramSelectedNode.id)"
                    >
                      添加下游节点
                    </button>
                    <button
                      class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
                      type="button"
                      @click="duplicateDiagramGraphNode(diagramSelectedNode.id)"
                    >
                      复制节点
                    </button>
                    <button
                      class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                      type="button"
                      @click="removeDiagramGraphNode(diagramSelectedNode.id)"
                    >
                      删除节点
                    </button>
                  </div>
                </div>

                <div v-else-if="diagramSelectedEdge" class="mt-4 space-y-3">
                  <div
                    class="rounded-2xl border border-sky-500/30 bg-sky-500/5 px-3 py-3"
                  >
                    <p
                      class="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300"
                    >
                      Selected Edge
                    </p>
                    <p class="mt-2 text-sm font-semibold text-slate-100">
                      {{ diagramSelectedEdge.source }} →
                      {{ diagramSelectedEdge.target }}
                    </p>
                    <p class="mt-1 text-[11px] text-slate-500">
                      {{ diagramSelectedEdge.id }}
                    </p>
                  </div>

                  <div class="grid gap-3">
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >source</span
                      >
                      <select
                        :value="diagramSelectedEdge.source"
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        @change="
                          updateDiagramGraphEdge(diagramSelectedEdge.id, {
                            source: ($event.target as HTMLSelectElement).value,
                          })
                        "
                      >
                        <option
                          v-for="node in diagramEditorGraph.nodes"
                          :key="`inspector-source-${node.id}`"
                          :value="node.id"
                        >
                          {{ node.id }}
                        </option>
                      </select>
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >target</span
                      >
                      <select
                        :value="diagramSelectedEdge.target"
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        @change="
                          updateDiagramGraphEdge(diagramSelectedEdge.id, {
                            target: ($event.target as HTMLSelectElement).value,
                          })
                        "
                      >
                        <option
                          v-for="node in diagramEditorGraph.nodes"
                          :key="`inspector-target-${node.id}`"
                          :value="node.id"
                        >
                          {{ node.id }}
                        </option>
                      </select>
                    </label>
                    <label class="block space-y-1">
                      <span class="text-[11px] font-semibold text-slate-400"
                        >label</span
                      >
                      <input
                        :value="diagramSelectedEdge.label || ''"
                        class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                        type="text"
                        @input="
                          updateDiagramGraphEdge(diagramSelectedEdge.id, {
                            label: ($event.target as HTMLInputElement).value,
                          })
                        "
                      />
                    </label>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <button
                      class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
                      type="button"
                      @click="reverseDiagramGraphEdge(diagramSelectedEdge.id)"
                    >
                      反转方向
                    </button>
                    <button
                      class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                      type="button"
                      @click="removeDiagramGraphEdge(diagramSelectedEdge.id)"
                    >
                      删除边
                    </button>
                  </div>
                </div>

                <div
                  v-else
                  class="mt-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950 px-3 py-4 text-center text-xs text-slate-500"
                >
                  先在 Diagram Canvas 中选中容器、节点或边，再进行聚焦编辑。
                </div>
              </div>

              <div class="mt-4">
                <div class="flex items-center justify-between gap-3">
                  <h5 class="text-xs font-semibold text-slate-200">Nodes</h5>
                  <div
                    class="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-slate-400"
                  >
                    {{ diagramEditorGraph.nodes.length }}
                  </div>
                </div>

                <div
                  v-if="diagramEditorGraph.nodes.length"
                  class="mt-3 space-y-3"
                >
                  <div
                    v-for="node in diagramEditorGraph.nodes"
                    :key="node.id"
                    class="rounded-2xl border bg-slate-950 px-3 py-3 transition-colors"
                    :class="
                      node.id === diagramSelectedNodeId
                        ? 'border-sky-500/70 ring-1 ring-sky-400/40'
                        : 'border-slate-800'
                    "
                    @click="selectDiagramNode(node.id)"
                  >
                    <div class="grid gap-3">
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400"
                          >id</span
                        >
                        <input
                          :value="node.id"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          type="text"
                          @change="
                            updateDiagramGraphNode(node.id, {
                              id: ($event.target as HTMLInputElement).value,
                            })
                          "
                        />
                      </label>
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400"
                          >label</span
                        >
                        <input
                          :value="node.label"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          type="text"
                          @input="
                            updateDiagramGraphNode(node.id, {
                              label: ($event.target as HTMLInputElement).value,
                            })
                          "
                        />
                      </label>
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400"
                          >type</span
                        >
                        <input
                          :value="node.type || ''"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          type="text"
                          @input="
                            updateDiagramGraphNode(node.id, {
                              type: ($event.target as HTMLInputElement).value,
                            })
                          "
                        />
                      </label>
                    </div>

                    <div class="mt-3 flex justify-end">
                      <button
                        class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                        type="button"
                        @click="removeDiagramGraphNode(node.id)"
                      >
                        删除节点
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="mt-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950 px-3 py-4 text-center text-xs text-slate-500"
                >
                  当前 graph 还没有节点。
                </div>
              </div>

              <div class="mt-4">
                <div class="flex items-center justify-between gap-3">
                  <h5 class="text-xs font-semibold text-slate-200">Edges</h5>
                  <button
                    class="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-900"
                    type="button"
                    @click="addDiagramGraphEdge"
                  >
                    Add Edge
                  </button>
                </div>

                <div
                  v-if="diagramEditorGraph.edges.length"
                  class="mt-3 space-y-3"
                >
                  <div
                    v-for="edge in diagramEditorGraph.edges"
                    :key="edge.id"
                    class="rounded-2xl border bg-slate-950 px-3 py-3 transition-colors"
                    :class="
                      edge.id === diagramSelectedEdgeId
                        ? 'border-sky-500/70 ring-1 ring-sky-400/40'
                        : 'border-slate-800'
                    "
                    @click="selectDiagramEdge(edge.id)"
                  >
                    <div class="grid gap-3">
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400"
                          >source</span
                        >
                        <select
                          :value="edge.source"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          @change="
                            updateDiagramGraphEdge(edge.id, {
                              source: ($event.target as HTMLSelectElement)
                                .value,
                            })
                          "
                        >
                          <option
                            v-for="node in diagramEditorGraph.nodes"
                            :key="`${edge.id}-source-${node.id}`"
                            :value="node.id"
                          >
                            {{ node.id }}
                          </option>
                        </select>
                      </label>
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400"
                          >target</span
                        >
                        <select
                          :value="edge.target"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          @change="
                            updateDiagramGraphEdge(edge.id, {
                              target: ($event.target as HTMLSelectElement)
                                .value,
                            })
                          "
                        >
                          <option
                            v-for="node in diagramEditorGraph.nodes"
                            :key="`${edge.id}-target-${node.id}`"
                            :value="node.id"
                          >
                            {{ node.id }}
                          </option>
                        </select>
                      </label>
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400"
                          >label</span
                        >
                        <input
                          :value="edge.label || ''"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          type="text"
                          @input="
                            updateDiagramGraphEdge(edge.id, {
                              label: ($event.target as HTMLInputElement).value,
                            })
                          "
                        />
                      </label>
                    </div>

                    <div class="mt-3 flex justify-end">
                      <button
                        class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                        type="button"
                        @click="removeDiagramGraphEdge(edge.id)"
                      >
                        删除边
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="mt-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950 px-3 py-4 text-center text-xs text-slate-500"
                >
                  当前 graph 还没有边。
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>
    </WLDesignLayout>

    <UiContextMenu
      :visible="layerTreeMenuVisible"
      :items="layerTreeMenuItems"
      :anchor-el="layerTreeMenuAnchorEl"
      :font-size-preset="layerTreeMenuFontSizePreset"
      :spacing-preset="layerTreeMenuSpacingPreset"
      test-id="workspace-design-layer-tree-menu"
      @select="handleLayerTreeMenuSelect"
      @close="closeLayerTreeMenu"
    />
  </div>
</template>

<style scoped>
.workspace-design-layer-tree {
  --wl-design-layer-indent-base: 9px;
  --wl-design-layer-indent-step: 13px;
  --wl-design-layer-row-gap: 6px;
  --wl-design-layer-row-radius: 4px;
  --wl-design-layer-row-padding-y: 4.6px;
  --wl-design-layer-row-padding-right: 4px;
  --wl-design-layer-toggle-size: 23px;
  --wl-design-layer-action-size: 21px;
  --wl-design-layer-action-gap: 2px;
  --wl-design-layer-label-size: 11.5px;
  --wl-design-layer-label-line-height: 19px;
  --wl-design-layer-meta-size: 9.5px;
  --wl-design-layer-meta-line-height: 15px;
  --wl-design-layer-icon-size: 15px;
  --wl-design-layer-chevron-icon-size: 14px;
  --wl-design-layer-action-icon-size: 15px;
  --wl-design-layer-guide-color: rgba(148, 163, 184, 0.34);
  --wl-design-layer-guide-active-color: rgba(100, 116, 139, 0.52);
}

.workspace-design-layer-tree__row {
  position: relative;
  gap: var(--wl-design-layer-row-gap);
  padding-right: var(--wl-design-layer-row-padding-right);
  border-radius: var(--wl-design-layer-row-radius);
  background: transparent;
  color: #475569;
}

.workspace-design-layer-tree__guide-line,
.workspace-design-layer-tree__connector {
  position: absolute;
  pointer-events: none;
}

.workspace-design-layer-tree__guide-line {
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--wl-design-layer-guide-color);
}

.workspace-design-layer-tree__connector {
  top: 0;
  bottom: 0;
}

.workspace-design-layer-tree__connector::before,
.workspace-design-layer-tree__connector::after {
  content: "";
  position: absolute;
  background: var(--wl-design-layer-guide-color);
}

.workspace-design-layer-tree__connector::before {
  left: 0;
  top: 0;
  bottom: 50%;
  width: 1px;
}

.workspace-design-layer-tree__connector::after {
  left: 0;
  top: 50%;
  width: 100%;
  height: 1px;
  transform: translateY(-0.5px);
}

.workspace-design-layer-tree__row--frame {
  color: #334155;
}

.workspace-design-layer-tree__row--element {
  color: #475569;
}

.workspace-design-layer-tree__row--idle:hover,
.workspace-design-layer-tree__row--idle:focus-within {
  background: rgba(15, 23, 42, 0.045);
  color: #0f172a;
}

.workspace-design-layer-tree__row--ancestor {
  background: rgba(148, 163, 184, 0.12);
  color: #334155;
}

.workspace-design-layer-tree__row--ancestor .workspace-design-layer-tree__guide-line,
.workspace-design-layer-tree__row--ancestor .workspace-design-layer-tree__connector::before,
.workspace-design-layer-tree__row--ancestor .workspace-design-layer-tree__connector::after,
.workspace-design-layer-tree__row--selected .workspace-design-layer-tree__guide-line,
.workspace-design-layer-tree__row--selected .workspace-design-layer-tree__connector::before,
.workspace-design-layer-tree__row--selected .workspace-design-layer-tree__connector::after,
.workspace-design-layer-tree__row--primary .workspace-design-layer-tree__guide-line,
.workspace-design-layer-tree__row--primary .workspace-design-layer-tree__connector::before,
.workspace-design-layer-tree__row--primary .workspace-design-layer-tree__connector::after {
  background: var(--wl-design-layer-guide-active-color);
}

.workspace-design-layer-tree__row--selected {
  background: rgba(14, 165, 233, 0.1);
  color: #082f49;
}

.workspace-design-layer-tree__row--primary {
  background: rgba(15, 23, 42, 0.08);
  color: #020617;
}

.workspace-design-layer-tree__toggle,
.workspace-design-layer-tree__toggle-placeholder {
  width: var(--wl-design-layer-toggle-size);
  height: var(--wl-design-layer-toggle-size);
}

.workspace-design-layer-tree__toggle {
  border-radius: 4px;
}

.workspace-design-layer-tree__toggle-icon {
  font-size: var(--wl-design-layer-chevron-icon-size);
}

.workspace-design-layer-tree__body {
  gap: var(--wl-design-layer-row-gap);
  padding-top: var(--wl-design-layer-row-padding-y);
  padding-bottom: var(--wl-design-layer-row-padding-y);
}

.workspace-design-layer-tree__node-icon {
  font-size: var(--wl-design-layer-icon-size);
}

.workspace-design-layer-tree__label {
  font-size: var(--wl-design-layer-label-size);
  line-height: var(--wl-design-layer-label-line-height);
}

.workspace-design-layer-tree__meta {
  font-size: var(--wl-design-layer-meta-size);
  line-height: var(--wl-design-layer-meta-line-height);
}

.workspace-design-layer-tree__actions {
  gap: var(--wl-design-layer-action-gap);
}

.workspace-design-layer-tree__action,
.workspace-design-layer-tree__menu-trigger {
  width: var(--wl-design-layer-action-size);
  height: var(--wl-design-layer-action-size);
  border-radius: 4px;
  opacity: 0;
  transform: translateX(3px);
  transition:
    opacity 150ms ease,
    transform 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}

.workspace-design-layer-tree__action-icon {
  font-size: var(--wl-design-layer-action-icon-size);
}

.workspace-design-layer-tree__row:hover .workspace-design-layer-tree__action,
.workspace-design-layer-tree__row:hover .workspace-design-layer-tree__menu-trigger,
.workspace-design-layer-tree__row:focus-within .workspace-design-layer-tree__action,
.workspace-design-layer-tree__row:focus-within .workspace-design-layer-tree__menu-trigger,
.workspace-design-layer-tree__action--active,
.workspace-design-layer-tree__menu-trigger--active {
  opacity: 1;
  transform: translateX(0);
}

.workspace-design-layer-tree__action:hover,
.workspace-design-layer-tree__menu-trigger:hover,
.workspace-design-layer-tree__action:focus-visible,
.workspace-design-layer-tree__menu-trigger:focus-visible,
.workspace-design-layer-tree__action--active,
.workspace-design-layer-tree__menu-trigger--active {
  background: rgba(15, 23, 42, 0.07);
  color: #0f172a;
}

.workspace-design-panel .workspace-design-floating-panel :deep(.rounded-full) {
  border-radius: 9px !important;
}

.workspace-design-panel .workspace-design-floating-panel :deep(.rounded-2xl),
.workspace-design-panel .workspace-design-floating-panel :deep(.rounded-xl),
.workspace-design-panel
  .workspace-design-floating-panel
  :deep(.rounded-\[14px\]),
.workspace-design-panel
  .workspace-design-floating-panel
  :deep(.rounded-\[18px\]),
.workspace-design-panel
  .workspace-design-floating-panel
  :deep(.rounded-\[20px\]),
.workspace-design-panel
  .workspace-design-floating-panel
  :deep(.rounded-\[22px\]),
.workspace-design-panel
  .workspace-design-floating-panel
  :deep(.rounded-\[24px\]),
.workspace-design-panel
  .workspace-design-floating-panel
  :deep(.rounded-\[28px\]) {
  border-radius: 10px !important;
}

.workspace-design-panel .workspace-design-floating-panel :deep(.bg-slate-50) {
  background-color: rgba(248, 250, 252, 0.92);
}

.workspace-design-panel .workspace-design-floating-panel :deep(button),
.workspace-design-panel .workspace-design-floating-panel :deep(input),
.workspace-design-panel .workspace-design-floating-panel :deep(select),
.workspace-design-panel .workspace-design-floating-panel :deep(textarea) {
  box-shadow: none;
}

.workspace-design-panel :deep(.workspace-design-glass-panel) {
  background: rgba(255, 255, 255, 0.74) !important;
  border-color: rgba(203, 213, 225, 0.92) !important;
  box-shadow: none !important;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  clip-path: inset(0 round 12px);
  overflow: hidden;
  transition:
    clip-path 240ms cubic-bezier(0.22, 1, 0.36, 1),
    max-height 240ms cubic-bezier(0.22, 1, 0.36, 1),
    min-height 240ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 180ms ease,
    border-color 180ms ease;
}

.workspace-design-panel :deep(.workspace-design-sidebar-panel) {
  transform-origin: top left;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel:not([data-collapsed="true"])
      > div
      > div:first-child
      > div
  ) {
  align-items: center;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel:not([data-collapsed="true"])
      > div
      > div:first-child
      > div
      > div:first-child
  ) {
  flex: 1 1 auto;
  min-width: 0;
}

.workspace-design-panel :deep(.workspace-design-inspector-panel) {
  transform-origin: top right;
}

.workspace-design-panel
  :deep(.workspace-design-sidebar-panel[data-collapsed="true"]) {
  clip-path: inset(0 calc(100% - 36px) calc(100% - 36px) 0 round 10px);
  min-height: 36px;
  max-height: 36px !important;
}

.workspace-design-panel
  :deep(.workspace-design-inspector-panel[data-collapsed="true"]) {
  clip-path: inset(0 0 calc(100% - 36px) calc(100% - 36px) round 10px);
  min-height: 36px;
  max-height: 36px !important;
}

.workspace-design-panel :deep(.workspace-design-glass-panel .border-b),
.workspace-design-panel :deep(.workspace-design-glass-panel .border-t) {
  border-color: rgba(226, 232, 240, 0.96) !important;
}

.workspace-design-panel
  :deep(.workspace-design-sidebar-panel .workspace-design-sidebar-toggle),
.workspace-design-panel
  :deep(.workspace-design-inspector-panel .workspace-design-inspector-toggle) {
  outline: none;
}

.workspace-design-panel .workspace-design-inspector-header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #64748b;
  transition:
    color 160ms ease,
    opacity 160ms ease;
}

.workspace-design-panel .workspace-design-inspector-header-icon:disabled {
  cursor: not-allowed;
  opacity: 0.32;
}

.workspace-design-panel .workspace-design-inspector-header-icon:hover {
  color: #0f172a;
}

.workspace-design-panel .workspace-design-inspector-header-icon:disabled:hover {
  color: #64748b;
}

.workspace-design-panel .workspace-design-inspector-header-icon:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.28);
  outline-offset: 2px;
  border-radius: 4px;
}

.workspace-design-panel .workspace-design-inspector-header-icon--active {
  color: #0f172a;
}

.workspace-design-panel .workspace-design-inspector-header-icon--danger {
  color: #e11d48;
}

.workspace-design-panel .workspace-design-inspector-header-icon--danger:hover {
  color: #be123c;
}

.workspace-design-panel
  :deep(.workspace-design-sidebar-panel[data-collapsed="true"] > div),
.workspace-design-panel
  :deep(.workspace-design-inspector-panel[data-collapsed="true"] > div) {
  min-height: 36px;
  height: 36px;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel[data-collapsed="true"]
      > div
      > div:first-child
  ),
.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]
      > div
      > div:first-child
  ) {
  padding: 0;
  border-bottom-color: transparent !important;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel[data-collapsed="true"]
      > div
      > div:first-child
      > div
  ) {
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  gap: 0;
}

.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]
      > div
      > div:first-child
      > div
  ) {
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 0;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel[data-collapsed="true"]
      > div
      > div:first-child
      > div
      > div:first-child
  ),
.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]
      > div
      > div:first-child
      > div
      > div:first-child
  ) {
  width: 0;
  min-width: 0;
  opacity: 0;
  pointer-events: none;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel[data-collapsed="true"]
      .workspace-design-sidebar-toggle
  ) {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  border-color: transparent !important;
  background: transparent !important;
  color: #64748b !important;
  border-radius: 10px !important;
}

.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]
      .workspace-design-inspector-toggle
  ) {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  border-color: transparent !important;
  background: transparent !important;
  color: #64748b !important;
  border-radius: 10px !important;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel[data-collapsed="true"]
      .workspace-design-sidebar-toggle:hover
  ) {
  background: rgba(241, 245, 249, 0.72) !important;
  color: #0f172a !important;
}

.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]
      .workspace-design-inspector-toggle:hover
  ) {
  background: rgba(241, 245, 249, 0.72) !important;
  color: #0f172a !important;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel[data-collapsed="true"]
      .workspace-design-sidebar-toggle:focus-visible
  ) {
  box-shadow: none;
  outline: none;
}

.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]
      .workspace-design-inspector-toggle:focus-visible
  ) {
  box-shadow: none;
  outline: none;
}

.workspace-design-panel
  :deep(
    .workspace-design-sidebar-panel[data-collapsed="true"]:has(
        .workspace-design-sidebar-toggle:focus-visible
      )
  ) {
  border-color: rgba(59, 130, 246, 0.9) !important;
}

.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]:has(
        .workspace-design-inspector-toggle:focus-visible
      )
  ) {
  border-color: rgba(59, 130, 246, 0.9) !important;
}

.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]
      > div
      > div:nth-child(2)
  ) {
  height: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  opacity: 0;
  pointer-events: none;
}

.workspace-design-panel
  :deep(.workspace-design-inspector-panel[data-collapsed="true"] h3),
.workspace-design-panel
  :deep(.workspace-design-inspector-panel[data-collapsed="true"] p) {
  opacity: 0;
  transition: opacity 120ms ease;
}

.workspace-design-panel
  :deep(
    .workspace-design-inspector-panel[data-collapsed="true"]
      [data-testid="workspace-design-inspector"]
  ) {
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.workspace-design-toolbar-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  overflow: visible !important;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.workspace-design-panel:hover .workspace-design-toolbar-shell,
.workspace-design-panel:focus-within .workspace-design-toolbar-shell {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.workspace-design-toolbar-stack {
  width: max-content;
  max-width: min(calc(100vw - 28px), 100%);
}

.workspace-design-tool-switch-hint {
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  max-width: min(420px, calc(100vw - 48px));
  padding: 0 14px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.84);
  color: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(12px);
}

@media (max-width: 1023px) {
  .workspace-design-tool-switch-hint {
    max-width: calc(100vw - 40px);
    padding: 8px 12px;
    white-space: normal;
    text-align: center;
  }
}

.workspace-design-panel .workspace-design-diagram-overlay :deep(.rounded-full) {
  border-radius: 9px !important;
}

.workspace-design-panel .workspace-design-diagram-overlay :deep(.rounded-2xl),
.workspace-design-panel .workspace-design-diagram-overlay :deep(.rounded-xl),
.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep(.rounded-\[20px\]),
.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep(.rounded-\[24px\]),
.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep(.rounded-\[28px\]) {
  border-radius: 10px !important;
}

.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="border-slate-8"]),
.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="border-slate-7"]) {
  border-color: rgba(226, 232, 240, 0.92) !important;
}

.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="bg-slate-95"]),
.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="bg-slate-90"]) {
  background: rgba(248, 250, 252, 0.92) !important;
}

.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="text-white"]),
.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="text-slate-1"]),
.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="text-slate-2"]) {
  color: #0f172a !important;
}

.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="text-slate-3"]),
.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep([class*="text-slate-4"]) {
  color: #64748b !important;
}

.workspace-design-panel .workspace-design-diagram-overlay :deep(input),
.workspace-design-panel .workspace-design-diagram-overlay :deep(select),
.workspace-design-panel .workspace-design-diagram-overlay :deep(textarea) {
  border-color: rgba(203, 213, 225, 0.92) !important;
  background: rgba(255, 255, 255, 0.94) !important;
  color: #0f172a !important;
  box-shadow: none;
}

.workspace-design-panel .workspace-design-diagram-overlay :deep(button),
.workspace-design-panel .workspace-design-diagram-overlay :deep(input),
.workspace-design-panel .workspace-design-diagram-overlay :deep(select),
.workspace-design-panel .workspace-design-diagram-overlay :deep(textarea) {
  box-shadow: none;
}

.workspace-design-panel
  .workspace-design-diagram-overlay
  :deep(button[class*="bg-slate"]:hover) {
  border-color: rgba(203, 213, 225, 0.92) !important;
  background: rgba(255, 255, 255, 0.98) !important;
  color: #0f172a !important;
}
</style>
