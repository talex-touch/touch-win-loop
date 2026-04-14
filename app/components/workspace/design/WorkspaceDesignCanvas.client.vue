<script setup lang="ts">
import type { DesignFrameModel, DesignPageModel } from "~~/shared/types/domain";
import type { WorkspaceCollabCursorUser } from "~/components/workspace/collab/presence";
import { resolveWorkspaceCollabPresenceInitial } from "~/components/workspace/collab/presence";
import type {
  DesignCanvasInteractionContext,
  DesignCanvasSelectionState,
} from "~~/app/composables/useDesignCanvasSelection";
import type { NodeMouseEvent, VueFlowStore } from "@vue-flow/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PanOnScrollMode, SelectionMode, VueFlow } from "@vue-flow/core";
import { createEmptyDesignCanvasSelectionState } from "~~/app/composables/useDesignCanvasSelection";
import { DESIGN_TOOL_PRESETS } from "~~/app/composables/useDesignToolController";
import { canDesignFrameCreateElements } from "~~/shared/utils/scene-document";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/minimap/dist/style.css";

const FRAME_DRAG_GRID_SIZE = 24;
const FRAME_DRAG_ALIGN_THRESHOLD = 16;
const POINTER_GESTURE_THRESHOLD = 4;
const MIN_CANVAS_ZOOM = 0.1;
const MAX_CANVAS_ZOOM = 2.5;
const MIN_ZOOM_PERCENT = MIN_CANVAS_ZOOM * 100;
const MAX_ZOOM_PERCENT = MAX_CANVAS_ZOOM * 100;
const CANVAS_ZOOM_STEP = 0.1;
const CANVAS_CONTROL_WIDTH = 200;
const CANVAS_MINIMAP_HEIGHT = 136;
const CANVAS_RESTING_CONTROL_WIDTH = 128;
const CANVAS_COLLAPSED_CONTROL_WIDTH = 92;
const CANVAS_EXPANDED_CONTROL_HEIGHT = 36;
const CANVAS_RESTING_CONTROL_HEIGHT = 12;
const CANVAS_COLLAPSED_CONTROL_HEIGHT = 8;
const CANVAS_RESTING_CONTROL_HIT_HEIGHT = 28;
const CANVAS_COLLAPSED_CONTROL_HIT_HEIGHT = 24;
const CANVAS_EXPANDED_CONTROL_GAP = 12;
const CANVAS_RESTING_CONTROL_GAP = 10;
const CANVAS_COLLAPSED_CONTROL_GAP = 8;
const CANVAS_RESTING_MINIMAP_HEIGHT = Math.round(
  CANVAS_MINIMAP_HEIGHT * (CANVAS_RESTING_CONTROL_WIDTH / CANVAS_CONTROL_WIDTH),
);
const CANVAS_COLLAPSED_MINIMAP_HEIGHT = Math.round(
  CANVAS_MINIMAP_HEIGHT *
    (CANVAS_COLLAPSED_CONTROL_WIDTH / CANVAS_CONTROL_WIDTH),
);
const ZOOM_CONTROL_COLLAPSE_DELAY = 1400;
const ZOOM_CONTROL_DEEP_COLLAPSE_DELAY = 12 * 60 * 1000;
const PRESENCE_CURSOR_FLUSH_DELAY = 48;
const CURSOR_LABEL_COLLAPSE_DISTANCE = 72;
const QUICK_ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];
const ZOOM_RANGE_SNAP_STEP = 5;

const props = withDefaults(
  defineProps<{
    page?: DesignPageModel | null;
    frames?: DesignFrameModel[];
    selectionState?: DesignCanvasSelectionState;
    interactionContext?: DesignCanvasInteractionContext;
    remoteCursors?: WorkspaceCollabCursorUser[];
    viewportX?: number;
    viewportY?: number;
    viewportZoom?: number;
    disabled?: boolean;
  }>(),
  {
    page: null,
    frames: () => [],
    selectionState: () => createEmptyDesignCanvasSelectionState(),
    interactionContext: () => ({
      effectiveTool: "select",
      isTemporaryHandActive: false,
      isDeepSelectModifierPressed: false,
    }),
    remoteCursors: () => [],
    viewportX: 0,
    viewportY: 0,
    viewportZoom: 1,
    disabled: false,
  },
);

const emit = defineEmits<{
  "update-selection": [payload: DesignCanvasSelectionState];
  "open-frame": [frameId: string];
  "duplicate-frame": [];
  "delete-frame": [];
  "update-frame-position": [
    payload: {
      frameId: string;
      x: number;
      y: number;
      historyMergeKey?: string;
    },
  ];
  "update-frame-positions": [
    payload: {
      positions: Array<{ frameId: string; x: number; y: number }>;
      historyMergeKey?: string;
    },
  ];
  "update-frame-size": [
    payload: {
      frameId: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      historyMergeKey?: string;
    },
  ];
  "viewport-change": [payload: { x: number; y: number; zoom: number }];
  updateCollabCursor: [value: { cursorX?: number; cursorY?: number }];
}>();

type FrameDragAnchor = "start" | "center" | "end";
type FrameDragFeedback = {
  frameId: string;
  x: number;
  y: number;
  hints: string[];
};
type ZoomControlState = "expanded" | "resting" | "dormant";
type ScreenCursor = {
  userId: string;
  username: string;
  colorToken: string;
  screenX: number;
  screenY: number;
  label: string;
};

const nodes = ref<any[]>([]);
const dragFeedback = ref<FrameDragFeedback | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const flowInstance = ref<VueFlowStore | null>(null);
const flowViewport = ref({
  x: 0,
  y: 0,
  zoom: 1,
});
const shortcutDialogOpen = ref(false);
const zoomControlState = ref<ZoomControlState>("expanded");
const zoomControlHovering = ref(false);
const localPointerScreen = ref<{ x: number; y: number } | null>(null);
const shortcutButtonRef = ref<HTMLButtonElement | null>(null);
const shortcutDialogRef = ref<HTMLElement | null>(null);
const floatingChromeTarget = ref<HTMLElement | null>(null);
let zoomControlRestingTimer: ReturnType<typeof setTimeout> | null = null;
let zoomControlDormantTimer: ReturnType<typeof setTimeout> | null = null;
let rootResizeObserver: ResizeObserver | null = null;
let presenceCursorTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPresencePoint: { clientX: number; clientY: number } | null = null;
let activeZoomRangePointerId: number | null = null;
let activeZoomRangePercent: number | null = null;
const shortcutItems: Array<{ description: string; keys: string[] }> = [
  ...DESIGN_TOOL_PRESETS.map((tool) => ({
    description: `${tool.label}工具`,
    keys: [tool.shortcutLabel],
  })),
  { description: "临时平移画布", keys: ["Hold", "Space"] },
  { description: "多选 Frame", keys: ["Shift", "Click / 框选"] },
  { description: "微调位置", keys: ["Arrow"] },
  { description: "按栅格步进", keys: ["Shift", "Arrow"] },
  { description: "复制选中 Frame", keys: ["Cmd / Ctrl", "D"] },
  { description: "撤销 / 重做", keys: ["Cmd / Ctrl", "Z / Shift+Z"] },
  { description: "删除选中 Frame", keys: ["Delete"] },
  { description: "打开 Diagram 编辑态", keys: ["Enter"] },
];

const defaultViewport = computed(() => {
  return {
    x: Math.round(Number(props.viewportX || 0)),
    y: Math.round(Number(props.viewportY || 0)),
    zoom: clampCanvasZoom(props.viewportZoom),
  };
});
const zoomPercent = computed(() => {
  const rawValue = Math.round(clampCanvasZoom(flowViewport.value.zoom) * 100);
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, rawValue));
});
const zoomRatio = computed(() => {
  return Math.min(
    1,
    Math.max(
      0,
      (zoomPercent.value - MIN_ZOOM_PERCENT) /
        (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT),
    ),
  );
});
const zoomDisplayText = computed(() => `${zoomPercent.value}%`);
const nextQuickZoomPreset = computed(() => {
  const matchedPresetIndex = QUICK_ZOOM_PRESETS.findIndex(
    (preset) => preset === zoomPercent.value,
  );
  if (matchedPresetIndex >= 0)
    return QUICK_ZOOM_PRESETS[
      (matchedPresetIndex + 1) % QUICK_ZOOM_PRESETS.length
    ];
  const nextHigherPreset = QUICK_ZOOM_PRESETS.find(
    (preset) => preset > zoomPercent.value,
  );
  return nextHigherPreset ?? QUICK_ZOOM_PRESETS[0];
});
const zoomRangeStyle = computed(() => {
  const progress = Math.round(zoomRatio.value * 100);
  return {
    background: `linear-gradient(90deg, rgba(226,232,240,0.92) 0%, rgba(226,232,240,0.92) ${progress}%, rgba(248,250,252,1) ${progress}%, rgba(248,250,252,1) 100%)`,
  };
});
const zoomCollapsedIndicatorStyle = computed(() => {
  const trackWidth = Math.max(0, zoomChromeMetrics.value.controlWidth - 2);
  const minimumWidth = zoomChromeMetrics.value.collapsedIndicatorWidth;
  const rawWidth = Math.round(zoomRatio.value * trackWidth);
  const width = Math.min(trackWidth, Math.max(minimumWidth, rawWidth));
  return {
    width: `${width}px`,
  };
});
const zoomChromeMetrics = computed(() => {
  const controlWidth =
    zoomControlState.value === "dormant"
      ? CANVAS_COLLAPSED_CONTROL_WIDTH
      : zoomControlState.value === "resting"
        ? CANVAS_RESTING_CONTROL_WIDTH
        : CANVAS_CONTROL_WIDTH;
  const controlHeight =
    zoomControlState.value === "dormant"
      ? CANVAS_COLLAPSED_CONTROL_HEIGHT
      : zoomControlState.value === "resting"
        ? CANVAS_RESTING_CONTROL_HEIGHT
        : CANVAS_EXPANDED_CONTROL_HEIGHT;
  const controlHitHeight =
    zoomControlState.value === "dormant"
      ? CANVAS_COLLAPSED_CONTROL_HIT_HEIGHT
      : zoomControlState.value === "resting"
        ? CANVAS_RESTING_CONTROL_HIT_HEIGHT
        : CANVAS_EXPANDED_CONTROL_HEIGHT;
  const controlGap =
    zoomControlState.value === "dormant"
      ? CANVAS_COLLAPSED_CONTROL_GAP
      : zoomControlState.value === "resting"
        ? CANVAS_RESTING_CONTROL_GAP
        : CANVAS_EXPANDED_CONTROL_GAP;
  const minimapHeight =
    zoomControlState.value === "dormant"
      ? CANVAS_COLLAPSED_MINIMAP_HEIGHT
      : zoomControlState.value === "resting"
        ? CANVAS_RESTING_MINIMAP_HEIGHT
        : CANVAS_MINIMAP_HEIGHT;
  const collapsedTrackHeight =
    zoomControlState.value === "dormant"
      ? 3
      : zoomControlState.value === "resting"
        ? 4
        : 8;
  const collapsedIndicatorWidth =
    zoomControlState.value === "dormant"
      ? 8
      : zoomControlState.value === "resting"
        ? 12
        : 14;
  const collapsedIndicatorHeight =
    zoomControlState.value === "dormant"
      ? 6
      : zoomControlState.value === "resting"
        ? 8
        : 12;
  return {
    controlWidth,
    controlHeight,
    controlHitHeight,
    controlGap,
    minimapHeight,
    collapsedTrackHeight,
    collapsedIndicatorWidth,
    collapsedIndicatorHeight,
  };
});
const canvasChromeStyle = computed<Record<string, string>>(() => {
  return {
    "--workspace-design-control-width": `${zoomChromeMetrics.value.controlWidth}px`,
    "--workspace-design-control-height": `${zoomChromeMetrics.value.controlHeight}px`,
    "--workspace-design-control-hit-height": `${zoomChromeMetrics.value.controlHitHeight}px`,
    "--workspace-design-control-gap": `${zoomChromeMetrics.value.controlGap}px`,
    "--workspace-design-minimap-height": `${zoomChromeMetrics.value.minimapHeight}px`,
    "--workspace-design-control-radius":
      zoomControlState.value === "dormant"
        ? "3px"
        : zoomControlState.value === "resting"
          ? "4px"
          : "10px",
    "--workspace-design-collapsed-track-height": `${zoomChromeMetrics.value.collapsedTrackHeight}px`,
    "--workspace-design-collapsed-track-radius":
      zoomControlState.value === "dormant"
        ? "1px"
        : zoomControlState.value === "resting"
          ? "1px"
          : "2px",
    "--workspace-design-collapsed-indicator-width": `${zoomChromeMetrics.value.collapsedIndicatorWidth}px`,
    "--workspace-design-collapsed-indicator-height": `${zoomChromeMetrics.value.collapsedIndicatorHeight}px`,
    "--workspace-design-collapsed-indicator-radius":
      zoomControlState.value === "dormant"
        ? "1px"
        : zoomControlState.value === "resting"
          ? "1px"
          : "2px",
    "--workspace-design-minimap-radius":
      zoomControlState.value === "dormant"
        ? "7px"
        : zoomControlState.value === "resting"
          ? "8px"
          : "10px",
  };
});
const selectedFrames = computed(() => {
  const selectedIdSet = new Set(props.selectionState.frameIds || []);
  return (props.frames || []).filter((frame) => selectedIdSet.has(frame.id));
});
const selectedFrameId = computed(() =>
  normalizeString(props.selectionState.primaryFrameId),
);
const isHandToolActive = computed(
  () => props.interactionContext.effectiveTool === "hand",
);
const frameInteractionEnabled = computed(() => {
  return (
    !props.disabled &&
    props.interactionContext.effectiveTool === "select" &&
    props.selectionState.scope !== "element" &&
    !normalizeString(props.selectionState.editingFrameId)
  );
});
const remoteScreenCursors = computed<ScreenCursor[]>(() => {
  const viewport = flowViewport.value;
  const cursors = props.remoteCursors.flatMap((cursor) => {
    const screenX = Number(cursor.cursorX) * viewport.zoom + viewport.x;
    const screenY = Number(cursor.cursorY) * viewport.zoom + viewport.y;
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return [];

    return [
      {
        userId: cursor.userId,
        username: cursor.username,
        colorToken: cursor.colorToken,
        screenX,
        screenY,
        label: cursor.username,
      },
    ];
  });

  return cursors.map((cursor, index) => {
    const cursorPoint = { x: cursor.screenX, y: cursor.screenY };
    const isNearLocalPointer = Boolean(
      localPointerScreen.value &&
      isScreenPointNear(cursorPoint, localPointerScreen.value),
    );
    const isNearAnotherCursor = cursors.some((candidate, candidateIndex) => {
      if (candidateIndex === index) return false;
      return isScreenPointNear(cursorPoint, {
        x: candidate.screenX,
        y: candidate.screenY,
      });
    });

    return {
      ...cursor,
      label:
        isNearLocalPointer || isNearAnotherCursor
          ? resolveWorkspaceCollabPresenceInitial(cursor.username)
          : cursor.username,
    };
  });
});

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeFrameSelection(frameIds: string[]): string[] {
  const availableFrameIds = new Set(
    (props.frames || []).map((frame) => frame.id),
  );
  const uniqueFrameIds = new Set<string>();
  for (const frameId of frameIds) {
    const normalizedFrameId = normalizeString(frameId);
    if (
      !normalizedFrameId ||
      !availableFrameIds.has(normalizedFrameId) ||
      uniqueFrameIds.has(normalizedFrameId)
    )
      continue;
    uniqueFrameIds.add(normalizedFrameId);
  }
  return [...uniqueFrameIds];
}

function emitFrameSelection(frameIds: string[], primaryFrameId = ""): void {
  const nextFrameIds = normalizeFrameSelection(frameIds);
  emit("update-selection", {
    scope: nextFrameIds.length > 0 ? "frame" : "none",
    editingFrameId: "",
    frameIds: nextFrameIds,
    primaryFrameId: normalizeString(primaryFrameId) || nextFrameIds[0] || "",
    elementIds: [],
    primaryElementId: "",
  });
}

function emitFrameEditing(frameId: string): void {
  emit("update-selection", {
    scope: "none",
    editingFrameId: normalizeString(frameId),
    frameIds: [],
    primaryFrameId: "",
    elementIds: [],
    primaryElementId: "",
  });
}

function resolveFrameAnchorOffset(
  anchor: FrameDragAnchor,
  size: number,
): number {
  if (anchor === "center") return size / 2;
  if (anchor === "end") return size;
  return 0;
}

function describeFrameAnchor(axis: "x" | "y", anchor: FrameDragAnchor): string {
  if (axis === "x")
    return anchor === "start"
      ? "left"
      : anchor === "center"
        ? "center"
        : "right";
  return anchor === "start" ? "top" : anchor === "center" ? "middle" : "bottom";
}

function snapFrameToGrid(value: number): number {
  return Math.round(value / FRAME_DRAG_GRID_SIZE) * FRAME_DRAG_GRID_SIZE;
}

function resolveFrameBox(
  frameId: string,
  position?: { x?: number; y?: number },
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const currentFrame = (props.frames || []).find(
    (frame) => frame.id === frameId,
  );
  const resolvedX = Number(position?.x ?? currentFrame?.x ?? 0);
  const resolvedY = Number(position?.y ?? currentFrame?.y ?? 0);
  const resolvedWidth = Number(currentFrame?.width || 320);
  const resolvedHeight = Number(currentFrame?.height || 220);
  return {
    x: Number.isFinite(resolvedX) ? resolvedX : 0,
    y: Number.isFinite(resolvedY) ? resolvedY : 0,
    width:
      Number.isFinite(resolvedWidth) && resolvedWidth > 0 ? resolvedWidth : 320,
    height:
      Number.isFinite(resolvedHeight) && resolvedHeight > 0
        ? resolvedHeight
        : 220,
  };
}

function resolveFrameDragAssist(
  frameId: string,
  position?: { x?: number; y?: number },
): FrameDragFeedback | null {
  const normalizedFrameId = normalizeString(frameId);
  if (!normalizedFrameId) return null;

  const currentBox = resolveFrameBox(normalizedFrameId, position);
  let nextX = snapFrameToGrid(currentBox.x);
  let nextY = snapFrameToGrid(currentBox.y);
  const hints: string[] = [`栅格吸附 ${FRAME_DRAG_GRID_SIZE}px`];
  const xAnchors: FrameDragAnchor[] = ["start", "center", "end"];
  const yAnchors: FrameDragAnchor[] = ["start", "center", "end"];
  let bestXMatch: {
    delta: number;
    value: number;
    label: string;
    anchor: FrameDragAnchor;
  } | null = null;
  let bestYMatch: {
    delta: number;
    value: number;
    label: string;
    anchor: FrameDragAnchor;
  } | null = null;

  for (const candidate of props.frames || []) {
    if (candidate.id === normalizedFrameId) continue;

    const candidateLabel = normalizeString(candidate.name) || candidate.id;
    const candidateXAnchors = {
      start: candidate.x,
      center: candidate.x + candidate.width / 2,
      end: candidate.x + candidate.width,
    };
    const candidateYAnchors = {
      start: candidate.y,
      center: candidate.y + candidate.height / 2,
      end: candidate.y + candidate.height,
    };

    for (const anchor of xAnchors) {
      const draggedValue =
        nextX + resolveFrameAnchorOffset(anchor, currentBox.width);
      for (const targetAnchor of xAnchors) {
        const candidateValue = candidateXAnchors[targetAnchor];
        const delta = Math.abs(draggedValue - candidateValue);
        if (delta > FRAME_DRAG_ALIGN_THRESHOLD) continue;
        if (!bestXMatch || delta < bestXMatch.delta) {
          bestXMatch = {
            delta,
            value: candidateValue,
            label: candidateLabel,
            anchor: targetAnchor,
          };
        }
      }
    }

    for (const anchor of yAnchors) {
      const draggedValue =
        nextY + resolveFrameAnchorOffset(anchor, currentBox.height);
      for (const targetAnchor of yAnchors) {
        const candidateValue = candidateYAnchors[targetAnchor];
        const delta = Math.abs(draggedValue - candidateValue);
        if (delta > FRAME_DRAG_ALIGN_THRESHOLD) continue;
        if (!bestYMatch || delta < bestYMatch.delta) {
          bestYMatch = {
            delta,
            value: candidateValue,
            label: candidateLabel,
            anchor: targetAnchor,
          };
        }
      }
    }
  }

  if (bestXMatch) {
    const xAnchor = xAnchors.reduce((matchedAnchor, anchor) => {
      const draggedValue =
        nextX + resolveFrameAnchorOffset(anchor, currentBox.width);
      const currentDelta = Math.abs(draggedValue - bestXMatch!.value);
      const matchedValue =
        nextX + resolveFrameAnchorOffset(matchedAnchor, currentBox.width);
      return currentDelta < Math.abs(matchedValue - bestXMatch!.value)
        ? anchor
        : matchedAnchor;
    }, "start" as FrameDragAnchor);
    nextX = Math.round(
      bestXMatch.value - resolveFrameAnchorOffset(xAnchor, currentBox.width),
    );
    hints.push(
      `X 对齐 · ${bestXMatch.label} ${describeFrameAnchor("x", bestXMatch.anchor)}`,
    );
  }

  if (bestYMatch) {
    const yAnchor = yAnchors.reduce((matchedAnchor, anchor) => {
      const draggedValue =
        nextY + resolveFrameAnchorOffset(anchor, currentBox.height);
      const currentDelta = Math.abs(draggedValue - bestYMatch!.value);
      const matchedValue =
        nextY + resolveFrameAnchorOffset(matchedAnchor, currentBox.height);
      return currentDelta < Math.abs(matchedValue - bestYMatch!.value)
        ? anchor
        : matchedAnchor;
    }, "start" as FrameDragAnchor);
    nextY = Math.round(
      bestYMatch.value - resolveFrameAnchorOffset(yAnchor, currentBox.height),
    );
    hints.push(
      `Y 对齐 · ${bestYMatch.label} ${describeFrameAnchor("y", bestYMatch.anchor)}`,
    );
  }

  return {
    frameId: normalizedFrameId,
    x: Math.round(nextX),
    y: Math.round(nextY),
    hints,
  };
}

function setDragFeedback(
  frameId: string,
  position?: { x?: number; y?: number },
): FrameDragFeedback | null {
  const nextFeedback = resolveFrameDragAssist(frameId, position);
  dragFeedback.value = nextFeedback;
  return nextFeedback;
}

function clearDragFeedback(): void {
  dragFeedback.value = null;
}

function focusCanvas(): void {
  rootRef.value?.focus();
}

function clampCanvasZoom(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, numericValue));
}

function syncFlowViewportState(
  payload?: Partial<{ x: number; y: number; zoom: number }>,
): void {
  const fallbackViewport = flowInstance.value?.viewport;
  const resolvedX = Number(
    payload?.x ?? fallbackViewport?.x ?? defaultViewport.value.x,
  );
  const resolvedY = Number(
    payload?.y ?? fallbackViewport?.y ?? defaultViewport.value.y,
  );
  const resolvedZoom = Number(
    payload?.zoom ?? fallbackViewport?.zoom ?? defaultViewport.value.zoom,
  );
  flowViewport.value = {
    x: Math.round(Number.isFinite(resolvedX) ? resolvedX : 0),
    y: Math.round(Number.isFinite(resolvedY) ? resolvedY : 0),
    zoom: clampCanvasZoom(resolvedZoom),
  };
}

function resolveFlowPointFromClient(
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rootRect = rootRef.value?.getBoundingClientRect();
  if (!rootRect) return null;

  const viewport = flowViewport.value;
  return {
    x: (clientX - rootRect.left - viewport.x) / viewport.zoom,
    y: (clientY - rootRect.top - viewport.y) / viewport.zoom,
  };
}

function clearPresenceCursorTimer(): void {
  if (!presenceCursorTimer) return;
  clearTimeout(presenceCursorTimer);
  presenceCursorTimer = null;
}

function isScreenPointNear(
  left: { x: number; y: number },
  right: { x: number; y: number },
  threshold = CURSOR_LABEL_COLLAPSE_DISTANCE,
): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= threshold;
}

function flushPresenceCursor(): void {
  clearPresenceCursorTimer();

  if (!pendingPresencePoint) {
    emit("updateCollabCursor", {});
    return;
  }

  const flowPoint = resolveFlowPointFromClient(
    pendingPresencePoint.clientX,
    pendingPresencePoint.clientY,
  );
  pendingPresencePoint = null;
  if (!flowPoint) {
    emit("updateCollabCursor", {});
    return;
  }

  emit("updateCollabCursor", {
    cursorX: Number(flowPoint.x.toFixed(2)),
    cursorY: Number(flowPoint.y.toFixed(2)),
  });
}

function clearPresenceCursor(shouldEmit = true): void {
  pendingPresencePoint = null;
  clearPresenceCursorTimer();
  if (shouldEmit) emit("updateCollabCursor", {});
}

function handlePresencePointerMove(event: PointerEvent): void {
  const rootRect = rootRef.value?.getBoundingClientRect();
  localPointerScreen.value = rootRect
    ? {
        x: event.clientX - rootRect.left,
        y: event.clientY - rootRect.top,
      }
    : null;
  pendingPresencePoint = {
    clientX: event.clientX,
    clientY: event.clientY,
  };
  if (presenceCursorTimer) return;
  presenceCursorTimer = setTimeout(() => {
    flushPresenceCursor();
  }, PRESENCE_CURSOR_FLUSH_DELAY);
}

function handlePresencePointerLeave(): void {
  localPointerScreen.value = null;
  clearPresenceCursor();
}

function handleFlowInit(instance: VueFlowStore): void {
  flowInstance.value = instance;
  syncFlowViewportState(instance.viewport);
}

function clearZoomControlTimers(): void {
  if (zoomControlRestingTimer) {
    clearTimeout(zoomControlRestingTimer);
    zoomControlRestingTimer = null;
  }
  if (zoomControlDormantTimer) {
    clearTimeout(zoomControlDormantTimer);
    zoomControlDormantTimer = null;
  }
}

function revealZoomControl(options?: {
  collapseAfterIdle?: boolean;
  delay?: number;
  deepDelay?: number;
  ignoreHover?: boolean;
}): void {
  zoomControlState.value = "expanded";
  clearZoomControlTimers();
  if (!options?.collapseAfterIdle) return;
  zoomControlRestingTimer = setTimeout(() => {
    if (zoomControlHovering.value && !options.ignoreHover) return;
    zoomControlState.value = "resting";
    zoomControlRestingTimer = null;
  }, options.delay ?? ZOOM_CONTROL_COLLAPSE_DELAY);
  zoomControlDormantTimer = setTimeout(() => {
    if (zoomControlHovering.value && !options.ignoreHover) return;
    zoomControlState.value = "dormant";
    zoomControlDormantTimer = null;
  }, options.deepDelay ?? ZOOM_CONTROL_DEEP_COLLAPSE_DELAY);
}

function handleZoomControlPointerEnter(): void {
  zoomControlHovering.value = true;
  revealZoomControl();
}

function handleZoomControlPointerMove(): void {
  if (zoomControlState.value === "expanded") return;
  zoomControlHovering.value = true;
  revealZoomControl({ collapseAfterIdle: true });
}

function handleZoomControlPointerLeave(): void {
  zoomControlHovering.value = false;
  revealZoomControl({
    collapseAfterIdle: true,
    delay: 260,
    deepDelay: ZOOM_CONTROL_DEEP_COLLAPSE_DELAY,
  });
}

function handleZoomControlFocusIn(): void {
  revealZoomControl();
}

function handleZoomControlShellClick(): void {
  if (zoomControlState.value === "expanded") return;
  zoomControlHovering.value = true;
  revealZoomControl({ collapseAfterIdle: true });
}

function handleZoomControlFocusOut(event: FocusEvent): void {
  const currentTarget = event.currentTarget;
  const relatedTarget = event.relatedTarget;
  if (
    currentTarget instanceof HTMLElement &&
    relatedTarget instanceof Node &&
    currentTarget.contains(relatedTarget)
  )
    return;
  zoomControlHovering.value = false;
  revealZoomControl({
    collapseAfterIdle: true,
    delay: 260,
    deepDelay: ZOOM_CONTROL_DEEP_COLLAPSE_DELAY,
  });
}

function emitViewportSnapshot(zoomOverride?: number): void {
  if (!flowInstance.value) return;
  const currentViewport = flowInstance.value.viewport;
  const nextViewport = {
    x: Math.round(Number(currentViewport.x || 0)),
    y: Math.round(Number(currentViewport.y || 0)),
    zoom: clampCanvasZoom(zoomOverride ?? currentViewport.zoom),
  };
  syncFlowViewportState(nextViewport);
  emit("viewport-change", nextViewport);
}

async function zoomCanvasTo(nextZoom: number): Promise<void> {
  const resolvedZoom = clampCanvasZoom(nextZoom);
  if (!flowInstance.value) return;
  revealZoomControl({ collapseAfterIdle: true, ignoreHover: true });
  await flowInstance.value.zoomTo(resolvedZoom, { duration: 120 });
  emitViewportSnapshot(resolvedZoom);
}

async function zoomCanvasToImmediate(nextZoom: number): Promise<void> {
  const resolvedZoom = clampCanvasZoom(nextZoom);
  if (!flowInstance.value) return;
  revealZoomControl({ collapseAfterIdle: true, ignoreHover: true });
  await flowInstance.value.zoomTo(resolvedZoom, { duration: 0 });
  emitViewportSnapshot(resolvedZoom);
}

async function adjustCanvasZoom(delta: number): Promise<void> {
  const currentZoom = clampCanvasZoom(
    flowInstance.value?.viewport.zoom ?? props.viewportZoom,
  );
  await zoomCanvasTo(currentZoom + delta);
}

async function cycleQuickZoomPreset(): Promise<void> {
  await zoomCanvasTo(nextQuickZoomPreset.value / 100);
}

async function fitCanvasView(): Promise<void> {
  if (!flowInstance.value) return;
  revealZoomControl({ collapseAfterIdle: true, ignoreHover: true });
  await (
    flowInstance.value as unknown as VueFlowStore & {
      fitView: (options?: {
        duration?: number;
        padding?: number;
      }) => Promise<boolean>;
    }
  ).fitView({
    duration: 160,
    padding: 0.18,
  });
  emitViewportSnapshot();
}

function closeShortcutDialog(): void {
  shortcutDialogOpen.value = false;
}

function toggleShortcutDialog(): void {
  shortcutDialogOpen.value = !shortcutDialogOpen.value;
}

function handleRootMouseDown(event: MouseEvent): void {
  const target = event.target;
  if (shortcutDialogOpen.value && target instanceof Node) {
    const clickedShortcutButton = shortcutButtonRef.value?.contains(target);
    const clickedShortcutDialog = shortcutDialogRef.value?.contains(target);
    if (!clickedShortcutButton && !clickedShortcutDialog) closeShortcutDialog();
  }
  revealZoomControl();
  focusCanvas();
}

function handleZoomInput(event: Event): void {
  const nextValue = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(nextValue)) return;
  void zoomCanvasTo(nextValue / 100);
}

function resolveZoomPercentFromPointer(
  clientX: number,
  element: HTMLElement,
): number {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) return zoomPercent.value;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const rawPercent =
    MIN_ZOOM_PERCENT + (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT) * ratio;
  const snappedPercent =
    Math.round(rawPercent / ZOOM_RANGE_SNAP_STEP) * ZOOM_RANGE_SNAP_STEP;
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, snappedPercent));
}

function updateZoomRangeFromPointer(
  clientX: number,
  element: HTMLElement,
): void {
  const nextPercent = resolveZoomPercentFromPointer(clientX, element);
  if (activeZoomRangePercent === nextPercent) return;
  activeZoomRangePercent = nextPercent;
  void zoomCanvasToImmediate(nextPercent / 100);
}

function resetZoomRangePointerState(): void {
  activeZoomRangePointerId = null;
  activeZoomRangePercent = null;
}

function handleZoomRangePointerDown(event: PointerEvent): void {
  if (zoomControlState.value !== "expanded") return;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.closest(".workspace-design-canvas__zoom-label")
  )
    return;
  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof HTMLElement)) return;
  activeZoomRangePointerId = event.pointerId;
  currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
  updateZoomRangeFromPointer(event.clientX, currentTarget);
}

function handleZoomRangePointerMove(event: PointerEvent): void {
  if (activeZoomRangePointerId !== event.pointerId) return;
  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof HTMLElement)) return;
  event.preventDefault();
  updateZoomRangeFromPointer(event.clientX, currentTarget);
}

function handleZoomRangePointerUp(event: PointerEvent): void {
  if (activeZoomRangePointerId !== event.pointerId) return;
  const currentTarget = event.currentTarget;
  if (
    currentTarget instanceof HTMLElement &&
    currentTarget.hasPointerCapture(event.pointerId)
  )
    currentTarget.releasePointerCapture(event.pointerId);
  resetZoomRangePointerState();
  revealZoomControl({ collapseAfterIdle: true, ignoreHover: true });
}

function applyFrameNodePreview(
  frameId: string,
  patch: { x?: number; y?: number; width?: number; height?: number },
): void {
  nodes.value = nodes.value.map((node) => {
    if (node.id !== frameId) return node;
    const nextPosition = {
      x:
        patch.x !== undefined
          ? Math.round(Number(patch.x || 0))
          : node.position.x,
      y:
        patch.y !== undefined
          ? Math.round(Number(patch.y || 0))
          : node.position.y,
    };
    const nextWidth =
      patch.width !== undefined
        ? Math.max(280, Math.round(Number(patch.width || 0)))
        : Number.parseInt(String(node.style?.width || "0")) || 320;
    const nextHeight =
      patch.height !== undefined
        ? Math.max(180, Math.round(Number(patch.height || 0)))
        : Number.parseInt(String(node.style?.height || "0")) || 220;
    return {
      ...node,
      position: nextPosition,
      style: {
        ...(node.style || {}),
        width: `${nextWidth}px`,
        height: `${nextHeight}px`,
      },
    };
  });
}

watch(
  [
    () => props.frames,
    () => props.selectionState.frameIds,
    () => props.page?.id,
    () => props.disabled,
    frameInteractionEnabled,
  ],
  () => {
    nodes.value = (props.frames || []).map((frame) => {
      return {
        id: frame.id,
        type: "frame",
        position: { x: frame.x, y: frame.y },
        selected: (props.selectionState.frameIds || []).includes(frame.id),
        data: {
          frame,
          disabled:
            props.disabled || frame.locked || !frameInteractionEnabled.value,
          onResizePreview: (payload: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          }) => {
            applyFrameNodePreview(frame.id, payload);
          },
          onResizeCommit: (payload: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          }) => {
            emit("update-frame-size", {
              frameId: frame.id,
              ...payload,
              historyMergeKey: "frame-resize",
            });
          },
        },
        draggable: frameInteractionEnabled.value && !frame.locked,
        selectable: frameInteractionEnabled.value,
        connectable: false,
        style: {
          width: `${frame.width}px`,
          height: `${frame.height}px`,
        },
      };
    });
  },
  { immediate: true, deep: true },
);

watch(
  () => props.viewportZoom,
  async (nextZoom) => {
    const nextResolvedZoom = clampCanvasZoom(nextZoom);
    const currentZoom = Number(flowInstance.value?.viewport.zoom || 1);
    if (
      !flowInstance.value ||
      Math.abs(currentZoom - nextResolvedZoom) < 0.005
    ) {
      syncFlowViewportState({ zoom: nextResolvedZoom });
      return;
    }
    await flowInstance.value.zoomTo(nextResolvedZoom, { duration: 120 });
    syncFlowViewportState({ zoom: nextResolvedZoom });
  },
);

watch(
  () => props.page?.id || "",
  () => {
    syncFlowViewportState(defaultViewport.value);
  },
  { immediate: true },
);

function handleNodeClick(payload: NodeMouseEvent): void {
  if (!frameInteractionEnabled.value) return;
  const frameId = normalizeString(payload?.node?.id);
  if (!frameId) return;
  if ("shiftKey" in payload.event && payload.event.shiftKey) {
    const nextFrameIds = (props.selectionState.frameIds || []).includes(frameId)
      ? (props.selectionState.frameIds || []).filter((id) => id !== frameId)
      : [...(props.selectionState.frameIds || []), frameId];
    emitFrameSelection(nextFrameIds, frameId);
  } else {
    emitFrameSelection([frameId], frameId);
  }
  focusCanvas();
}

function handleNodeDoubleClick(payload: { node?: { id?: string } }): void {
  const frameId = normalizeString(payload?.node?.id);
  if (!frameId) return;
  const frame =
    (props.frames || []).find((item) => item.id === frameId) || null;
  if (frame?.kind === "diagram") {
    emit("open-frame", frameId);
    return;
  }
  if (frame && canDesignFrameCreateElements(frame)) emitFrameEditing(frameId);
}

function handleNodeDragStart(payload: {
  node?: { id?: string; position?: { x?: number; y?: number } };
}): void {
  if (!frameInteractionEnabled.value) return;
  const frameId = normalizeString(payload?.node?.id);
  if (!frameId) return;
  revealZoomControl();
  if (!(props.selectionState.frameIds || []).includes(frameId))
    emitFrameSelection([frameId], frameId);
  setDragFeedback(frameId, payload?.node?.position);
}

function handleNodeDrag(payload: {
  node?: { id?: string; position?: { x?: number; y?: number } };
}): void {
  if (!frameInteractionEnabled.value) return;
  const frameId = normalizeString(payload?.node?.id);
  if (!frameId) return;
  revealZoomControl();
  setDragFeedback(frameId, payload?.node?.position);
}

function handleNodeDragStop(payload: {
  node?: { id?: string; position?: { x?: number; y?: number } };
  nodes?: Array<{ id?: string }>;
}): void {
  if (!frameInteractionEnabled.value) return;
  const frameId = normalizeString(payload?.node?.id);
  if (!frameId) return;
  if ((payload?.nodes || []).length > 1) {
    clearDragFeedback();
    return;
  }

  const nextFeedback = setDragFeedback(frameId, payload?.node?.position);
  emit("update-frame-position", {
    frameId,
    x: nextFeedback?.x ?? Math.round(Number(payload?.node?.position?.x || 0)),
    y: nextFeedback?.y ?? Math.round(Number(payload?.node?.position?.y || 0)),
  });
  revealZoomControl({ collapseAfterIdle: true });
  clearDragFeedback();
}

function handleSelectionDragStop(payload: {
  nodes?: Array<{ id?: string; position?: { x?: number; y?: number } }>;
}): void {
  if (!frameInteractionEnabled.value) return;
  const nextPositions = (payload?.nodes || [])
    .map((node) => {
      const frameId = normalizeString(node.id);
      if (!frameId) return null;
      return {
        frameId,
        x: Math.round(Number(node.position?.x || 0)),
        y: Math.round(Number(node.position?.y || 0)),
      };
    })
    .filter((item): item is { frameId: string; x: number; y: number } =>
      Boolean(item),
    );

  if (nextPositions.length)
    emit("update-frame-positions", { positions: nextPositions });
  revealZoomControl({ collapseAfterIdle: true });
  clearDragFeedback();
}

function handleNodesChange(
  changes: Array<{ id?: string; type?: string; selected?: boolean }>,
): void {
  if (!frameInteractionEnabled.value) return;
  const selectionChanges = changes.filter((change) => change.type === "select");
  if (!selectionChanges.length) return;

  const nextSelectionMap = new Map<string, boolean>(
    normalizeFrameSelection(props.selectionState.frameIds || []).map(
      (frameId) => [frameId, true],
    ),
  );
  let nextPrimaryFrameId = selectedFrameId.value;
  for (const change of selectionChanges) {
    const frameId = normalizeString(change.id);
    if (!frameId) continue;
    if (change.selected) {
      nextSelectionMap.set(frameId, true);
      nextPrimaryFrameId = frameId;
    } else {
      nextSelectionMap.delete(frameId);
      if (nextPrimaryFrameId === frameId) nextPrimaryFrameId = "";
    }
  }

  const nextFrameIds = (props.frames || [])
    .map((frame) => frame.id)
    .filter((frameId) => nextSelectionMap.has(frameId));
  emitFrameSelection(nextFrameIds, nextPrimaryFrameId || nextFrameIds[0] || "");
}

function handleMoveEnd(payload: {
  flowTransform?: { x?: number; y?: number; zoom?: number };
}): void {
  const nextViewport = {
    x: Math.round(Number(payload?.flowTransform?.x || 0)),
    y: Math.round(Number(payload?.flowTransform?.y || 0)),
    zoom: Number(payload?.flowTransform?.zoom || 1) || 1,
  };
  revealZoomControl({ collapseAfterIdle: true });
  syncFlowViewportState(nextViewport);
  emit("viewport-change", nextViewport);
}

function handleMove(payload: {
  flowTransform?: { x?: number; y?: number; zoom?: number };
}): void {
  revealZoomControl();
  const nextViewport = {
    x: Math.round(Number(payload?.flowTransform?.x || 0)),
    y: Math.round(Number(payload?.flowTransform?.y || 0)),
    zoom: Number(payload?.flowTransform?.zoom || 1) || 1,
  };
  syncFlowViewportState(nextViewport);
  emit("viewport-change", nextViewport);
}

function handleKeydown(event: KeyboardEvent): void {
  const key = normalizeString(event.key).toLowerCase();
  if (shortcutDialogOpen.value && key === "escape") {
    event.preventDefault();
    closeShortcutDialog();
    return;
  }

  if (
    props.disabled ||
    props.selectionState.scope !== "frame" ||
    !selectedFrames.value.length
  )
    return;

  const metaOrCtrl = event.metaKey || event.ctrlKey;
  const primarySelectedFrame =
    selectedFrames.value.find((frame) => frame.id === selectedFrameId.value) ||
    selectedFrames.value[0] ||
    null;
  const movableFrames = selectedFrames.value.filter((frame) => !frame.locked);

  if (key === "backspace" || key === "delete") {
    event.preventDefault();
    emit("delete-frame");
    return;
  }

  if (
    (key === "enter" || key === "return") &&
    selectedFrames.value.length === 1 &&
    primarySelectedFrame?.kind === "diagram"
  ) {
    event.preventDefault();
    emit("open-frame", primarySelectedFrame.id);
    return;
  }

  if (metaOrCtrl && key === "d") {
    event.preventDefault();
    emit("duplicate-frame");
    return;
  }

  if (!key.startsWith("arrow") || !movableFrames.length) return;

  event.preventDefault();
  const step = event.shiftKey ? FRAME_DRAG_GRID_SIZE : 8;
  const deltaX = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
  const deltaY = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
  emit("update-frame-positions", {
    positions: movableFrames.map((frame) => ({
      frameId: frame.id,
      x: Math.round(frame.x + deltaX),
      y: Math.round(frame.y + deltaY),
    })),
    historyMergeKey: "frame-nudge",
  });
  revealZoomControl({ collapseAfterIdle: true });
}

function resolveFloatingChromeTarget(): HTMLElement | null {
  if (!rootRef.value) return null;
  const layoutRoot = rootRef.value.closest('[data-testid="wl-design-layout"]');
  if (!(layoutRoot instanceof HTMLElement)) return rootRef.value;
  const target = layoutRoot.querySelector("[data-wl-design-floating-controls-root]");
  return target instanceof HTMLElement ? target : rootRef.value;
}

onMounted(() => {
  floatingChromeTarget.value = resolveFloatingChromeTarget();
  if (typeof ResizeObserver === "undefined" || !rootRef.value) return;
  rootResizeObserver = new ResizeObserver(() => {
    revealZoomControl({
      collapseAfterIdle: true,
      delay: 900,
      deepDelay: ZOOM_CONTROL_DEEP_COLLAPSE_DELAY,
    });
  });
  rootResizeObserver.observe(rootRef.value);
});

onBeforeUnmount(() => {
  clearPresenceCursor();
  clearZoomControlTimers();
  resetZoomRangePointerState();
  rootResizeObserver?.disconnect();
  rootResizeObserver = null;
  floatingChromeTarget.value = null;
});
</script>

<template>
  <div
    ref="rootRef"
    class="workspace-design-canvas__root relative h-full min-h-0 overflow-hidden outline-none"
    :data-zoom-state="zoomControlState"
    :style="canvasChromeStyle"
    tabindex="0"
    @keydown="handleKeydown"
    @mousedown="handleRootMouseDown"
    @pointermove="handlePresencePointerMove"
    @pointerleave="handlePresencePointerLeave"
    @pointercancel="handlePresencePointerLeave"
  >
    <VueFlow
      :key="props.page?.id || 'page'"
      :nodes="nodes"
      :edges="[]"
      class="workspace-design-canvas__flow h-full w-full"
      :default-viewport="defaultViewport"
      :min-zoom="MIN_CANVAS_ZOOM"
      :max-zoom="MAX_CANVAS_ZOOM"
      :node-drag-threshold="POINTER_GESTURE_THRESHOLD"
      :pane-click-distance="POINTER_GESTURE_THRESHOLD"
      :nodes-draggable="frameInteractionEnabled"
      :nodes-connectable="false"
      :elements-selectable="frameInteractionEnabled"
      :selection-key-code="true"
      :selection-mode="SelectionMode.Partial"
      :pan-on-drag="isHandToolActive"
      :pan-on-scroll="true"
      :pan-on-scroll-mode="PanOnScrollMode.Free"
      :zoom-on-scroll="false"
      :zoom-on-pinch="true"
      :select-nodes-on-drag="true"
      @nodes-change="handleNodesChange"
      @node-click="handleNodeClick"
      @node-double-click="handleNodeDoubleClick"
      @node-drag-start="handleNodeDragStart"
      @node-drag="handleNodeDrag"
      @node-drag-stop="handleNodeDragStop"
      @selection-drag-stop="handleSelectionDragStop"
      @move="handleMove"
      @move-end="handleMoveEnd"
      @init="handleFlowInit"
      @pane-click="
        !isHandToolActive && emitFrameSelection([]);
        focusCanvas();
      "
    >
      <Background
        variant="dots"
        :gap="28"
        :size="1"
        color="rgba(148, 163, 184, 0.18)"
      />
      <MiniMap
        :width="zoomChromeMetrics.controlWidth"
        :height="zoomChromeMetrics.minimapHeight"
        class="workspace-design-canvas__minimap"
      />

      <template #node-frame="nodeProps">
        <WorkspaceDesignFrameNode
          :frame="nodeProps.data.frame"
          :selected="nodeProps.selected"
          :disabled="Boolean(nodeProps.data.disabled)"
          :on-resize-preview="nodeProps.data.onResizePreview"
          :on-resize-commit="nodeProps.data.onResizeCommit"
        />
      </template>
    </VueFlow>

    <div
      class="workspace-design-canvas__presence-layer absolute inset-0 overflow-hidden pointer-events-none"
      data-testid="workspace-design-collab-cursor-overlay"
    >
      <div
        v-for="cursor in remoteScreenCursors"
        :key="cursor.userId"
        class="workspace-design-canvas__presence-cursor"
        :style="{
          transform: `translate(${cursor.screenX}px, ${cursor.screenY}px)`,
        }"
      >
        <div class="relative">
          <svg
            width="18"
            height="22"
            viewBox="0 0 18 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 1.5L2.2 17.2L6.9 13.6L10.3 20.3L12.8 19.1L9.4 12.4L15.2 12.1L2 1.5Z"
              :fill="cursor.colorToken"
              stroke="white"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
          <div
            class="workspace-design-canvas__presence-label"
            :style="{ backgroundColor: cursor.colorToken }"
            :title="cursor.username"
          >
            {{ cursor.label }}
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="dragFeedback"
      class="workspace-design-canvas__feedback absolute z-10 min-w-[220px] rounded-2xl border border-slate-700/90 bg-slate-950/88 px-3 py-2 text-[11px] text-slate-300 shadow-[0_18px_48px_rgba(2,6,23,0.3)] backdrop-blur-xl"
    >
      <div class="flex items-center justify-between gap-3">
        <span class="font-semibold text-slate-100"
          >Frame · {{ dragFeedback.frameId }}</span
        >
        <span
          class="rounded-full border border-sky-800 bg-sky-950/40 px-2 py-0.5 font-semibold text-sky-200"
          >X {{ dragFeedback.x }} / Y {{ dragFeedback.y }}</span
        >
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <span
          v-for="hint in dragFeedback.hints"
          :key="`${dragFeedback.frameId}-${hint}`"
          class="rounded-full border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-300"
        >
          {{ hint }}
        </span>
      </div>
    </div>

    <Teleport v-if="floatingChromeTarget" :to="floatingChromeTarget">
      <div
        class="workspace-design-canvas__floating-chrome"
        :data-zoom-state="zoomControlState"
        :style="canvasChromeStyle"
      >
        <div class="workspace-design-canvas__shortcut-anchor absolute">
          <section
            v-if="shortcutDialogOpen"
            ref="shortcutDialogRef"
            class="workspace-design-canvas__shortcut-dialog w-[320px] max-w-[calc(100vw-32px)] rounded-[12px] border border-slate-200/90 bg-white/96 p-3 text-slate-900 shadow-[0_16px_38px_rgba(15,23,42,0.1)] backdrop-blur-xl"
            role="dialog"
            aria-modal="false"
            aria-label="设计画布快捷键"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p
                  class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400"
                >
                  Shortcuts
                </p>
                <h3 class="mt-1 text-sm font-semibold text-slate-900">
                  设计画布快捷键
                </h3>
              </div>
              <button
                class="flex h-7 w-7 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900"
                type="button"
                title="关闭快捷键面板"
                @click="closeShortcutDialog"
              >
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div class="mt-3 space-y-2">
              <div
                v-for="item in shortcutItems"
                :key="item.description"
                class="flex items-center justify-between gap-3 rounded-[10px] border border-slate-200 bg-slate-50/80 px-3 py-2"
              >
                <span class="text-xs font-medium text-slate-600">{{
                  item.description
                }}</span>
                <div class="flex flex-wrap justify-end gap-1.5">
                  <span
                    v-for="keyName in item.keys"
                    :key="`${item.description}-${keyName}`"
                    class="rounded-[8px] border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    {{ keyName }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <button
            ref="shortcutButtonRef"
            class="flex h-10 w-10 items-center justify-center rounded-[12px] border border-slate-200/92 bg-white/98 text-slate-500 shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            type="button"
            title="查看快捷键"
            aria-haspopup="dialog"
            :aria-expanded="shortcutDialogOpen ? 'true' : 'false'"
            @click="toggleShortcutDialog"
          >
            <span class="material-symbols-outlined text-[18px]"
              >question_mark</span
            >
          </button>
        </div>

        <div class="workspace-design-canvas__zoom-anchor absolute">
          <div
            class="workspace-design-canvas__zoom-shell"
            :data-state="zoomControlState"
            @pointerenter="handleZoomControlPointerEnter"
            @pointermove="handleZoomControlPointerMove"
            @pointerleave="handleZoomControlPointerLeave"
            @focusin="handleZoomControlFocusIn"
            @focusout="handleZoomControlFocusOut"
            @click.stop="handleZoomControlShellClick"
          >
            <div
              class="workspace-design-canvas__zoom-collapsed-track"
              aria-hidden="true"
            >
              <span
                class="workspace-design-canvas__zoom-collapsed-indicator"
                :style="zoomCollapsedIndicatorStyle"
              />
            </div>
            <button
              class="workspace-design-canvas__zoom-button"
              type="button"
              title="放大画布"
              aria-label="放大画布"
              @click="void adjustCanvasZoom(CANVAS_ZOOM_STEP)"
            >
              <span class="material-symbols-outlined text-[18px]">add</span>
            </button>
            <div
              class="workspace-design-canvas__zoom-range-shell"
              :style="zoomRangeStyle"
              @pointerdown="handleZoomRangePointerDown"
              @pointermove="handleZoomRangePointerMove"
              @pointerup="handleZoomRangePointerUp"
              @pointercancel="handleZoomRangePointerUp"
            >
              <input
                class="workspace-design-canvas__zoom-range"
                :value="zoomPercent"
                type="range"
                :min="MIN_ZOOM_PERCENT"
                :max="MAX_ZOOM_PERCENT"
                step="5"
                aria-label="调整画布缩放"
                tabindex="-1"
                @input="handleZoomInput"
              />
              <button
                class="workspace-design-canvas__zoom-label"
                type="button"
                :title="`切换到 ${nextQuickZoomPreset}%`"
                :aria-label="`快速切换到 ${nextQuickZoomPreset}%`"
                @click.stop="void cycleQuickZoomPreset()"
              >
                {{ zoomDisplayText }}
              </button>
            </div>
            <button
              class="workspace-design-canvas__zoom-button"
              type="button"
              title="缩小画布"
              aria-label="缩小画布"
              @click="void adjustCanvasZoom(-CANVAS_ZOOM_STEP)"
            >
              <span class="material-symbols-outlined text-[18px]">remove</span>
            </button>
            <button
              class="workspace-design-canvas__zoom-button workspace-design-canvas__zoom-button--fit"
              type="button"
              title="适配当前画布"
              aria-label="适配当前画布"
              @click="void fitCanvasView()"
            >
              <span class="material-symbols-outlined text-[18px]"
                >fit_screen</span
              >
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div
      v-if="!(props.frames || []).length"
      class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/72 text-center backdrop-blur-[2px]"
    >
      <h3 class="text-base font-semibold text-slate-900">
        当前 Page 还没有 Frame
      </h3>
      <p class="max-w-sm text-sm leading-6 text-slate-500">
        在顶部工具栏插入 `freeform`、`template`、`device_mockup` 或 `diagram`
        Frame。
      </p>
    </div>
  </div>
</template>

<style scoped>
.workspace-design-canvas__root {
  background-color: #f7f8fb;
  --workspace-design-control-width: 200px;
  --workspace-design-control-collapsed-width: 92px;
  --workspace-design-control-height: 36px;
  --workspace-design-control-hit-height: 36px;
  --workspace-design-control-radius: 10px;
  --workspace-design-control-gap: 12px;
  --workspace-design-minimap-height: 136px;
  --workspace-design-minimap-radius: 10px;
}

.workspace-design-canvas__feedback {
  bottom: calc(var(--wl-design-gap, 16px) + 82px);
}

.workspace-design-canvas__feedback {
  right: calc(
    var(--wl-design-right-width, 340px) + (var(--wl-design-gap, 16px) * 2)
  );
}

.workspace-design-canvas__presence-layer {
  z-index: 24;
}

.workspace-design-canvas__presence-cursor {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.workspace-design-canvas__presence-label {
  position: absolute;
  top: 2px;
  left: 14px;
  max-width: 160px;
  padding: 2px 8px;
  overflow: hidden;
  border-radius: 999px;
  color: #ffffff;
  font-size: 10px;
  line-height: 1.4;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
}

.workspace-design-canvas__shortcut-anchor {
  z-index: 160;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.workspace-design-canvas__shortcut-dialog {
  width: min(320px, calc(100vw - 32px));
}

.workspace-design-canvas__floating-chrome {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

:deep(.workspace-design-canvas__flow .vue-flow__attribution) {
  display: none;
}

:deep(.workspace-design-canvas__flow .vue-flow__background-pattern) {
  opacity: 0.55;
}

:deep(.workspace-design-canvas__flow .vue-flow__minimap) {
  margin: 0 !important;
  left: 16px !important;
  right: auto !important;
  bottom: calc(
    16px + var(--workspace-design-control-height) +
      var(--workspace-design-control-gap)
  ) !important;
  z-index: 160 !important;
  box-sizing: border-box;
  width: var(--workspace-design-control-width) !important;
  height: var(--workspace-design-minimap-height) !important;
  border: 1px solid rgba(226, 232, 240, 1);
  border-radius: var(--workspace-design-minimap-radius);
  overflow: hidden;
  background-color: #ffffff !important;
  opacity: 1 !important;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  isolation: isolate;
  transition:
    width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    bottom 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    border-radius 180ms ease,
    box-shadow 180ms ease;
}

.workspace-design-canvas__root[data-zoom-state="dormant"]
  :deep(.workspace-design-canvas__flow .vue-flow__minimap) {
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
}

:deep(.workspace-design-canvas__flow .vue-flow__minimap svg) {
  display: block;
  background-color: #ffffff;
  opacity: 1 !important;
}

.workspace-design-canvas__zoom-anchor {
  z-index: 160;
  left: 16px;
  bottom: 16px;
  width: var(--workspace-design-control-width);
  height: var(--workspace-design-control-hit-height);
  pointer-events: auto;
}

.workspace-design-canvas__zoom-shell {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 36px 40px;
  align-items: center;
  gap: 0;
  width: var(--workspace-design-control-width);
  height: var(--workspace-design-control-hit-height);
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid rgba(226, 232, 240, 1);
  border-radius: var(--workspace-design-control-radius);
  background: #ffffff;
  cursor: default;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  transition:
    width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.workspace-design-canvas__zoom-shell[data-state="resting"],
.workspace-design-canvas__zoom-shell[data-state="dormant"] {
  display: flex;
  align-items: center;
  width: var(--workspace-design-control-width);
  height: var(--workspace-design-control-hit-height);
  border-color: transparent;
  background: transparent;
  cursor: pointer;
  box-shadow: none;
}

.workspace-design-canvas__zoom-button {
  display: inline-flex;
  width: 100%;
  height: var(--workspace-design-control-height);
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: #0f172a;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workspace-design-canvas__zoom-shell[data-state="resting"]
  .workspace-design-canvas__zoom-button,
.workspace-design-canvas__zoom-shell[data-state="dormant"]
  .workspace-design-canvas__zoom-button {
  position: absolute;
  inset: 0 auto 0 0;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.9);
}

.workspace-design-canvas__zoom-button:hover {
  background: rgba(248, 250, 252, 0.96);
}

.workspace-design-canvas__zoom-button--fit {
  border-right: 0;
  border-left: 1px solid rgba(226, 232, 240, 0.92);
}

.workspace-design-canvas__zoom-range-shell {
  position: relative;
  display: flex;
  min-width: 0;
  height: var(--workspace-design-control-height);
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-right: 1px solid rgba(226, 232, 240, 1);
  border-left: 1px solid rgba(226, 232, 240, 1);
  cursor: ew-resize;
  user-select: none;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.workspace-design-canvas__zoom-shell[data-state="resting"]
  .workspace-design-canvas__zoom-range-shell,
.workspace-design-canvas__zoom-shell[data-state="dormant"]
  .workspace-design-canvas__zoom-range-shell {
  position: absolute;
  inset: 0;
  border-right-color: transparent;
  border-left-color: transparent;
  opacity: 0;
  pointer-events: none;
}

.workspace-design-canvas__zoom-range {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  border: 0;
  background: transparent;
  appearance: none;
  pointer-events: none;
  opacity: 0;
}

.workspace-design-canvas__zoom-label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  min-width: 48px;
  height: calc(var(--workspace-design-control-height) - 8px);
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  transition:
    background-color 160ms ease,
    opacity 160ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workspace-design-canvas__zoom-label:hover,
.workspace-design-canvas__zoom-label:focus-visible {
  background: rgba(255, 255, 255, 0.48);
  outline: none;
}

.workspace-design-canvas__zoom-shell[data-state="resting"]
  .workspace-design-canvas__zoom-label,
.workspace-design-canvas__zoom-shell[data-state="dormant"]
  .workspace-design-canvas__zoom-label {
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
}

.workspace-design-canvas__zoom-collapsed-track {
  position: absolute;
  inset-inline: 1px;
  top: 50%;
  display: block;
  height: var(--workspace-design-collapsed-track-height);
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--workspace-design-collapsed-track-radius);
  background: rgba(203, 213, 225, 0.66);
  opacity: 0;
  transform: translateY(-50%) scaleX(0.92);
  transition:
    opacity 160ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}

.workspace-design-canvas__zoom-shell[data-state="resting"]
  .workspace-design-canvas__zoom-collapsed-track,
.workspace-design-canvas__zoom-shell[data-state="dormant"]
  .workspace-design-canvas__zoom-collapsed-track {
  opacity: 1;
  transform: translateY(-50%) scaleX(1);
}

.workspace-design-canvas__zoom-collapsed-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  width: var(--workspace-design-collapsed-indicator-width);
  height: var(--workspace-design-collapsed-indicator-height);
  border-radius: var(--workspace-design-collapsed-indicator-radius);
  border: 0;
  background: rgba(100, 116, 139, 0.82);
  transform: translateY(-50%);
}

.workspace-design-canvas__zoom-range::-webkit-slider-runnable-track {
  background: transparent;
}

.workspace-design-canvas__zoom-range::-webkit-slider-thumb {
  appearance: none;
  width: 0;
  height: 0;
  margin-top: 0;
}

.workspace-design-canvas__zoom-range::-moz-range-track {
  border: 0;
  background: transparent;
}

.workspace-design-canvas__zoom-range::-moz-range-thumb {
  width: 0;
  height: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

@media (max-width: 1023px) {
  .workspace-design-canvas__feedback {
    bottom: 96px;
  }

  .workspace-design-canvas__feedback {
    right: 16px;
  }

  .workspace-design-canvas__shortcut-anchor {
    right: 16px;
    bottom: 16px;
  }

  .workspace-design-canvas__shortcut-dialog {
    width: min(320px, calc(100vw - 32px));
  }

  :deep(.workspace-design-canvas__flow .vue-flow__minimap) {
    left: 16px !important;
    right: auto !important;
    bottom: calc(
      16px + var(--workspace-design-control-height) +
        var(--workspace-design-control-gap)
    ) !important;
  }
}
</style>
