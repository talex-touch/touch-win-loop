<script setup lang="ts">
import type {
  DesignAssetModel,
  DesignElementModel,
  DesignFrameDeviceMetadata,
  DesignFrameKind,
  DesignFrameModel,
  DesignPageModel,
  DeviceFramePreset,
} from "~~/shared/types/domain";
import { computed, reactive, ref } from "vue";
import {
  resolveDesignFrameExportMetadata,
  resolveDesignFrameGridMetadata,
  resolveDesignFrameLayoutMetadata,
} from "~~/shared/utils/scene-document";

const props = withDefaults(
  defineProps<{
    page?: DesignPageModel | null;
    frame?: DesignFrameModel | null;
    element?: DesignElementModel | null;
    elementFrame?: DesignFrameModel | null;
    selectedFrameCount?: number;
    selectedElementCount?: number;
    deviceFramePresets?: DeviceFramePreset[];
    deviceArtboardOptions?: DeviceArtboardOption[];
    deviceShellAssets?: DesignAssetModel[];
    framePreviewMarkup?: string;
    frameShellPreviewMarkup?: string;
    designResourceId?: string;
    collabDrawError?: string;
    canOpenDiagramEditor?: boolean;
    diagramSourceFormat?:
      | "mermaid"
      | "markdown_outline"
      | "ddl"
      | "architecture";
    diagramSourceText?: string;
  }>(),
  {
    page: null,
    frame: null,
    element: null,
    elementFrame: null,
    selectedFrameCount: 0,
    selectedElementCount: 0,
    deviceFramePresets: () => [],
    deviceArtboardOptions: () => [],
    deviceShellAssets: () => [],
    framePreviewMarkup: "",
    frameShellPreviewMarkup: "",
    designResourceId: "",
    collabDrawError: "",
    canOpenDiagramEditor: false,
    diagramSourceFormat: "mermaid",
    diagramSourceText: "",
  },
);

const emit = defineEmits<{
  updatePage: [patch: Partial<DesignPageModel>];
  updateFrame: [patch: Partial<DesignFrameModel>];
  updateElement: [patch: Partial<DesignElementModel>];
  toggleFramesLocked: [];
  duplicateFrame: [];
  removeFrame: [];
  runSelectionCommand: [command: string];
  "update:diagramSourceFormat": [
    "mermaid" | "markdown_outline" | "ddl" | "architecture",
  ];
  "update:diagramSourceText": [string];
  applyDiagramSource: [];
  openDiagramEditor: [];
}>();

const selectionCommands = [
  { id: "align-left", label: "左对齐", icon: "format_align_left" },
  { id: "align-center-x", label: "水平居中", icon: "format_align_center" },
  { id: "align-right", label: "右对齐", icon: "format_align_right" },
  { id: "align-top", label: "顶对齐", icon: "vertical_align_top" },
  { id: "align-center-y", label: "垂直居中", icon: "vertical_align_center" },
  { id: "align-bottom", label: "底对齐", icon: "vertical_align_bottom" },
  { id: "distribute-x", label: "横向分布", icon: "horizontal_distribute" },
  { id: "distribute-y", label: "纵向分布", icon: "vertical_distribute" },
  { id: "match-width", label: "等宽", icon: "straighten" },
  { id: "match-height", label: "等高", icon: "straighten" },
  { id: "mirror-x", label: "水平镜像", icon: "flip" },
  { id: "mirror-y", label: "垂直镜像", icon: "flip" },
  { id: "snap-grid", label: "吸附网格", icon: "grid_on" },
] as const;

const selectionCommandRows = [
  selectionCommands.slice(0, 8),
  selectionCommands.slice(8),
] as const;

type InspectorSectionScope = "element" | "frame" | "page";
type DeviceArtboardOption = {
  id: string;
  name: string;
  presetKey?: string;
  pageId?: string;
};

const sectionOpenState = reactive<Record<string, boolean>>({});

function resolveSectionKey(
  scope: InspectorSectionScope,
  sectionId: string,
): string {
  return `${scope}:${sectionId}`;
}

function isSectionOpen(
  scope: InspectorSectionScope,
  sectionId: string,
  defaultOpen = false,
): boolean {
  return sectionOpenState[resolveSectionKey(scope, sectionId)] ?? defaultOpen;
}

function toggleSection(
  scope: InspectorSectionScope,
  sectionId: string,
  defaultOpen = false,
): void {
  const sectionKey = resolveSectionKey(scope, sectionId);
  sectionOpenState[sectionKey] = !isSectionOpen(scope, sectionId, defaultOpen);
}

function getSectionToggleLabel(
  scope: InspectorSectionScope,
  sectionId: string,
  title: string,
  defaultOpen = false,
): string {
  return `${isSectionOpen(scope, sectionId, defaultOpen) ? "收起" : "展开"}${title}`;
}

const isTextElement = computed(() =>
  ["text", "caption", "badge"].includes(props.element?.type || ""),
);
const isShapeElement = computed(() => props.element?.type === "shape");
const isPathElement = computed(() => props.element?.type === "path");
const isImageElement = computed(() => props.element?.type === "image");
const isMultiFrameSelection = computed(
  () => props.selectedFrameCount > 1 && !props.element,
);
const activeElementFrame = computed(() => props.elementFrame || null);
const activeElementFrameLayout = computed(() =>
  resolveDesignFrameLayoutMetadata(activeElementFrame.value?.metadata?.layout),
);
const frameLayout = computed(() =>
  resolveDesignFrameLayoutMetadata(props.frame?.metadata?.layout),
);
const frameGrid = computed(() =>
  resolveDesignFrameGridMetadata(props.frame?.metadata?.grid),
);
const frameExport = computed(() =>
  resolveDesignFrameExportMetadata(
    props.frame?.metadata?.export,
    props.frame?.metadata?.exportWithVisiblePageOverlays !== false,
  ),
);
const elementLayoutSizing = computed(() =>
  String(props.element?.metadata?.layoutSizing || "fixed"),
);
const elementConstraints = computed(() => {
  return {
    horizontal: String(
      props.element?.metadata?.constraints?.horizontal || "left",
    ),
    vertical: String(props.element?.metadata?.constraints?.vertical || "top"),
    referenceWidth: Number(
      props.element?.metadata?.constraints?.referenceWidth ||
        activeElementFrame.value?.width ||
        0,
    ),
    referenceHeight: Number(
      props.element?.metadata?.constraints?.referenceHeight ||
        activeElementFrame.value?.height ||
        0,
    ),
  };
});
const pageViewportText = computed(() => {
  if (!props.page) return "";
  return `x ${Math.round(props.page.viewport?.x || 0)} / y ${Math.round(props.page.viewport?.y || 0)} / zoom ${Number(props.page.viewport?.zoom || 1).toFixed(2)}`;
});
const showSelectionCommandBar = computed(() =>
  Boolean(props.element || props.frame),
);
const elementInAutoLayoutFrame = computed(() =>
  Boolean(props.element && activeElementFrameLayout.value.mode === "auto"),
);
const selectionCommandDisabled = computed(() =>
  Boolean(props.element && elementInAutoLayoutFrame.value),
);
const selectionCommandNote = computed(() => {
  if (selectionCommandDisabled.value)
    return "自动布局容器内元素位置由 layout 求值，命令栏已禁用。";
  return "";
});
const frameClipContentEnabled = computed(
  () => props.frame?.metadata?.clipContent ?? true,
);
const pageClipToPage = computed(() =>
  Boolean(props.page?.metadata?.clipToPage),
);
const elementSupportsRadius = computed(() =>
  Boolean(
    props.element &&
    (isShapeElement.value ||
      isImageElement.value ||
      props.element.type === "badge"),
  ),
);
const elementSupportsFill = computed(() =>
  Boolean(props.element && (isShapeElement.value || isTextElement.value)),
);
const elementSupportsStroke = computed(() =>
  Boolean(props.element && (isShapeElement.value || isPathElement.value)),
);
const elementSupportsConstraints = computed(() =>
  Boolean(
    props.element &&
    activeElementFrame.value &&
    activeElementFrame.value.kind !== "diagram",
  ),
);
const frameSupportsLayout = computed(() =>
  Boolean(props.frame && props.frame.kind !== "diagram"),
);
const frameSupportsVisualTokens = computed(() =>
  Boolean(props.frame && props.frame.kind !== "diagram"),
);
const isDeviceArtboard = computed(
  () => props.frame?.kind === "device_artboard",
);
const isDeviceMockup = computed(() => props.frame?.kind === "device_mockup");
const isDeviceFrame = computed(
  () => isDeviceArtboard.value || isDeviceMockup.value,
);
const frameKindValue = computed<DesignFrameKind | "">(() => {
  if (!props.frame) return "";
  return props.frame.kind;
});
const devicePresetSearch = ref("");
const devicePreviewMode = ref<"screen" | "shell">("screen");
const frameDeviceMetadata = computed(() => {
  const source = props.frame?.metadata?.device || {};
  const shellMode = source.shellMode;
  const screenScaleMode = source.screenScaleMode;
  return {
    shellMode:
      shellMode === "none" ||
      shellMode === "builtin" ||
      shellMode === "external"
        ? shellMode
        : isDeviceArtboard.value
          ? "none"
          : "builtin",
    shellAssetId: String(source.shellAssetId || "").trim() || undefined,
    screenScaleMode: screenScaleMode === "fill" ? "fill" : "fit",
    showSafeArea: Boolean(source.showSafeArea),
  } satisfies Required<
    Pick<
      DesignFrameDeviceMetadata,
      "shellMode" | "screenScaleMode" | "showSafeArea"
    >
  > &
    Pick<
      DesignFrameDeviceMetadata,
      "shellAssetId"
    >;
});
const frameDevicePreset = computed(() => {
  if (!props.frame) return props.deviceFramePresets[0] || null;
  return (
    props.deviceFramePresets.find(
      (preset) => preset.key === props.frame?.deviceFramePresetKey,
    ) ||
    props.deviceFramePresets[0] ||
    null
  );
});
const filteredDeviceFramePresets = computed(() => {
  const query = devicePresetSearch.value.trim().toLowerCase();
  if (!query) return props.deviceFramePresets;
  return props.deviceFramePresets.filter((preset) =>
    [
      preset.title,
      preset.group,
      preset.platform,
      preset.key,
      `${preset.screenWidth}x${preset.screenHeight}`,
    ].some((token) => String(token || "").toLowerCase().includes(query)),
  );
});
const groupedDeviceFramePresets = computed(() => {
  const groups = new Map<string, DeviceFramePreset[]>();
  filteredDeviceFramePresets.value.forEach((preset) => {
    const bucket = groups.get(preset.group) || [];
    bucket.push(preset);
    groups.set(preset.group, bucket);
  });
  return Array.from(groups.entries()).map(([group, items]) => ({
    group,
    items,
  }));
});
const framePresetBound = computed(() =>
  Boolean(isDeviceArtboard.value && props.frame?.deviceFramePresetKey),
);
const selectedShellAsset = computed(() => {
  const shellAssetId = frameDeviceMetadata.value.shellAssetId;
  if (!shellAssetId) return null;
  return (
    props.deviceShellAssets.find((asset) => asset.id === shellAssetId) || null
  );
});
const activeFramePreviewMarkup = computed(() => {
  if (!isDeviceFrame.value) return "";
  if (isDeviceArtboard.value) {
    return devicePreviewMode.value === "shell"
      ? props.frameShellPreviewMarkup
      : props.framePreviewMarkup;
  }
  return props.framePreviewMarkup || props.frameShellPreviewMarkup;
});

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function updatePageMetadata(patch: Record<string, unknown>): void {
  emit("updatePage", {
    metadata: {
      ...(props.page?.metadata || {}),
      ...patch,
    },
  });
}

function updateFrameThemeTokens(patch: Record<string, string>): void {
  emit("updateFrame", {
    themeTokens: {
      ...(props.frame?.themeTokens || {}),
      ...patch,
    },
  });
}

function updateFrameMetadata(patch: Record<string, unknown>): void {
  emit("updateFrame", {
    metadata: {
      ...(props.frame?.metadata || {}),
      ...patch,
    },
  });
}

function updateFrameLayout(patch: Record<string, unknown>): void {
  updateFrameMetadata({
    layout: {
      ...(props.frame?.metadata?.layout || {}),
      ...patch,
    },
  });
}

function updateFrameLayoutPadding(
  axis: "top" | "right" | "bottom" | "left",
  value: unknown,
): void {
  updateFrameLayout({
    padding: {
      ...(props.frame?.metadata?.layout?.padding || {}),
      [axis]: Math.max(
        0,
        toFiniteNumber(
          value,
          Number(props.frame?.metadata?.layout?.padding?.[axis] || 24),
        ),
      ),
    },
  });
}

function updateFrameGrid(patch: Record<string, unknown>): void {
  updateFrameMetadata({
    grid: {
      ...(props.frame?.metadata?.grid || {}),
      ...patch,
    },
  });
}

function updateFrameExport(patch: Record<string, unknown>): void {
  updateFrameMetadata({
    export: {
      ...(props.frame?.metadata?.export || {}),
      ...patch,
    },
  });
}

function updateFrameDeviceMetadata(
  patch: Partial<DesignFrameDeviceMetadata>,
): void {
  updateFrameMetadata({
    device: {
      ...(props.frame?.metadata?.device || {}),
      ...patch,
    },
  });
}

function handleFrameKindChange(nextKind: DesignFrameKind): void {
  if (!props.frame) return;
  const resolvedKind = nextKind;
  const patch: Partial<DesignFrameModel> = {
    kind: resolvedKind,
  };
  if (resolvedKind === "device_artboard") {
    const preset = frameDevicePreset.value || props.deviceFramePresets[0] || null;
    if (preset) {
      patch.deviceFramePresetKey = preset.key;
      patch.width = preset.screenWidth;
      patch.height = preset.screenHeight;
    }
    patch.metadata = {
      ...(props.frame.metadata || {}),
      device: {
        ...(props.frame.metadata?.device || {}),
        shellMode:
          frameDeviceMetadata.value.shellMode === "external"
            ? "external"
            : frameDeviceMetadata.value.shellMode === "none"
              ? "none"
              : "builtin",
      },
    };
  }
  if (resolvedKind === "device_mockup") {
    patch.metadata = {
      ...(props.frame.metadata || {}),
      device: {
        ...(props.frame.metadata?.device || {}),
        shellMode:
          frameDeviceMetadata.value.shellMode === "external"
            ? "external"
            : "builtin",
        showSafeArea: false,
      },
    };
  }
  emit("updateFrame", patch);
}

function handleDevicePresetChange(nextKey: string): void {
  if (!props.frame) return;
  const preset = props.deviceFramePresets.find((item) => item.key === nextKey);
  if (!preset) return;
  emit("updateFrame", {
    deviceFramePresetKey: preset.key,
    ...(isDeviceArtboard.value
      ? {
          width: preset.screenWidth,
          height: preset.screenHeight,
        }
      : {}),
  });
}

function bindCurrentDevicePreset(): void {
  if (!props.frame || !isDeviceArtboard.value || !frameDevicePreset.value) return;
  emit("updateFrame", {
    deviceFramePresetKey: frameDevicePreset.value.key,
    width: frameDevicePreset.value.screenWidth,
    height: frameDevicePreset.value.screenHeight,
  });
}

function clearDevicePresetBinding(): void {
  if (!props.frame || !isDeviceArtboard.value) return;
  emit("updateFrame", {
    deviceFramePresetKey: "",
  });
}

function setFrameShellEnabled(enabled: boolean): void {
  updateFrameDeviceMetadata({
    shellMode: enabled
      ? frameDeviceMetadata.value.shellMode === "external"
        ? "external"
        : "builtin"
      : "none",
  });
}

function isDeviceShellAssetValid(
  asset?: DesignAssetModel | null,
): boolean {
  const viewportRect = asset?.metadata?.deviceShell?.viewportRect;
  const cornerRadius = Number(asset?.metadata?.deviceShell?.cornerRadius ?? -1);
  return Boolean(
    asset &&
      viewportRect &&
      Number(viewportRect.width) > 0 &&
      Number(viewportRect.height) > 0 &&
      Number.isFinite(cornerRadius) &&
      cornerRadius >= 0,
  );
}

function updateElementStyle(
  patch: Record<string, string | number | boolean | null>,
): void {
  emit("updateElement", {
    style: {
      ...(props.element?.style || {}),
      ...patch,
    },
  });
}

function updateElementMetadata(patch: Record<string, unknown>): void {
  emit("updateElement", {
    metadata: {
      ...(props.element?.metadata || {}),
      ...patch,
    },
  });
}

function updateElementConstraints(
  axis: "horizontal" | "vertical",
  value: string,
): void {
  updateElementMetadata({
    constraints: {
      ...(props.element?.metadata?.constraints || {}),
      [axis]: value,
      referenceWidth:
        activeElementFrame.value?.width ||
        props.element?.metadata?.constraints?.referenceWidth,
      referenceHeight:
        activeElementFrame.value?.height ||
        props.element?.metadata?.constraints?.referenceHeight,
    },
  });
}
</script>

<template>
  <section
    class="workspace-design-inspector"
    data-testid="workspace-design-inspector"
  >
    <div
      v-if="props.collabDrawError"
      class="workspace-design-inspector__alert workspace-design-inspector__alert--danger"
    >
      <p class="workspace-design-inspector__alert-title">文档同步异常</p>
      <p class="workspace-design-inspector__alert-body">
        {{ props.collabDrawError }}
      </p>
    </div>

    <div
      v-if="showSelectionCommandBar"
      class="workspace-design-inspector__command-strip"
    >
      <div class="workspace-design-inspector__command-grid">
        <div
          v-for="(commandRow, rowIndex) in selectionCommandRows"
          :key="`selection-row-${rowIndex}`"
          class="workspace-design-inspector__command-row"
          :class="
            rowIndex === 0
              ? 'workspace-design-inspector__command-row--adaptive'
              : ''
          "
        >
          <div
            v-for="command in commandRow"
            :key="command.id"
            class="workspace-design-inspector__command-item"
            :class="
              rowIndex === 0
                ? 'workspace-design-inspector__command-item--tooltip-below'
                : 'workspace-design-inspector__command-item--tooltip-above'
            "
          >
            <button
              class="workspace-design-inspector__command-button workspace-design-inspector__command-button--icon workspace-design-inspector__command-button--ghost"
              type="button"
              :disabled="selectionCommandDisabled"
              :aria-label="command.label"
              @click="emit('runSelectionCommand', command.id)"
            >
              <span
                class="material-symbols-outlined workspace-design-inspector__command-icon"
                :class="
                  ['mirror-y', 'match-height'].includes(command.id)
                    ? 'workspace-design-inspector__command-icon--mirror-y'
                    : ''
                "
              >
                {{ command.icon }}
              </span>
            </button>
            <span class="workspace-design-inspector__command-tooltip">
              {{ command.label }}
            </span>
          </div>
        </div>
      </div>
      <p
        v-if="selectionCommandNote"
        class="workspace-design-inspector__subsection-note"
      >
        {{ selectionCommandNote }}
      </p>
    </div>

    <template v-if="props.element">
      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('element', 'geometry', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">几何</h4>
            <p class="workspace-design-inspector__group-description">
              尺寸、旋转和基础内容。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('element', 'geometry', '几何', true)"
            :aria-label="
              getSectionToggleLabel('element', 'geometry', '几何', true)
            "
            @click="toggleSection('element', 'geometry', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("element", "geometry", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('element', 'geometry', true)"
          class="workspace-design-inspector__group-body"
        >
          <div class="workspace-design-inspector__geometry-grid">
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">x</span>
              <input
                :value="Math.round(props.element.x)"
                class="workspace-design-inspector__input"
                type="number"
                :disabled="elementInAutoLayoutFrame"
                @change="
                  emit('updateElement', {
                    x: toFiniteNumber(
                      ($event.target as HTMLInputElement).value,
                      props.element.x,
                    ),
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">y</span>
              <input
                :value="Math.round(props.element.y)"
                class="workspace-design-inspector__input"
                type="number"
                :disabled="elementInAutoLayoutFrame"
                @change="
                  emit('updateElement', {
                    y: toFiniteNumber(
                      ($event.target as HTMLInputElement).value,
                      props.element.y,
                    ),
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">width</span>
              <input
                :value="Math.round(props.element.width)"
                class="workspace-design-inspector__input"
                type="number"
                min="1"
                @change="
                  emit('updateElement', {
                    width: Math.max(
                      1,
                      toFiniteNumber(
                        ($event.target as HTMLInputElement).value,
                        props.element.width,
                      ),
                    ),
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">height</span>
              <input
                :value="Math.round(props.element.height)"
                class="workspace-design-inspector__input"
                type="number"
                min="1"
                @change="
                  emit('updateElement', {
                    height: Math.max(
                      1,
                      toFiniteNumber(
                        ($event.target as HTMLInputElement).value,
                        props.element.height,
                      ),
                    ),
                  })
                "
              />
            </label>
          </div>

          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">旋转</span>
              <input
                :value="Math.round(Number(props.element.rotation || 0))"
                class="workspace-design-inspector__input"
                type="number"
                @change="
                  emit('updateElement', {
                    rotation: toFiniteNumber(
                      ($event.target as HTMLInputElement).value,
                      Number(props.element.rotation || 0),
                    ),
                  })
                "
              />
            </label>
            <label
              v-if="elementSupportsRadius"
              class="workspace-design-inspector__field"
            >
              <span class="workspace-design-inspector__label">圆角</span>
              <input
                :value="Number(props.element.style?.borderRadius || 0)"
                class="workspace-design-inspector__input"
                type="number"
                min="0"
                @change="
                  updateElementStyle({
                    borderRadius: Math.max(
                      0,
                      toFiniteNumber(
                        ($event.target as HTMLInputElement).value,
                        Number(props.element.style?.borderRadius || 0),
                      ),
                    ),
                  })
                "
              />
            </label>
            <label
              v-if="isShapeElement"
              class="workspace-design-inspector__field"
            >
              <span class="workspace-design-inspector__label">形状</span>
              <select
                :value="props.element.shapeKind || 'rectangle'"
                class="workspace-design-inspector__input"
                @change="
                  emit('updateElement', {
                    shapeKind: ($event.target as HTMLSelectElement)
                      .value as DesignElementModel['shapeKind'],
                  })
                "
              >
                <option value="rectangle">rectangle</option>
                <option value="ellipse">ellipse</option>
                <option value="arrow">arrow</option>
              </select>
            </label>
          </div>

          <label v-if="isTextElement" class="workspace-design-inspector__field">
            <span class="workspace-design-inspector__label">文本内容</span>
            <textarea
              :value="props.element.text || ''"
              class="workspace-design-inspector__textarea"
              @input="
                emit('updateElement', {
                  text: ($event.target as HTMLTextAreaElement).value,
                })
              "
            />
          </label>
          <p
            v-if="elementInAutoLayoutFrame"
            class="workspace-design-inspector__subsection-note"
          >
            当前元素位于自动布局容器中，x / y 主要由父级 layout 求值。
          </p>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('element', 'layout', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">布局</h4>
            <p class="workspace-design-inspector__group-description">
              最小布局语义只保留 sizing 和文本自适应。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('element', 'layout', '布局', true)"
            :aria-label="
              getSectionToggleLabel('element', 'layout', '布局', true)
            "
            @click="toggleSection('element', 'layout', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("element", "layout", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('element', 'layout', true)"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">尺寸模式</span>
              <select
                :value="elementLayoutSizing"
                class="workspace-design-inspector__input"
                @change="
                  updateElementMetadata({
                    layoutSizing: ($event.target as HTMLSelectElement).value,
                  })
                "
              >
                <option value="fixed">fixed</option>
                <option value="hug">hug</option>
                <option value="fill">fill</option>
              </select>
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">文本自适应</span>
              <select
                :value="String(props.element.metadata?.textAutoSize || 'fixed')"
                class="workspace-design-inspector__input"
                :disabled="!isTextElement"
                @change="
                  updateElementMetadata({
                    textAutoSize: ($event.target as HTMLSelectElement).value,
                  })
                "
              >
                <option value="fixed">fixed</option>
                <option value="auto_width">auto_width</option>
                <option value="auto_height">auto_height</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div
        v-if="elementSupportsConstraints"
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('element', 'constraints', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">约束</h4>
            <p class="workspace-design-inspector__group-description">
              仅相对父 frame 生效，支持 left / center / right / scale 与 top /
              center / bottom / scale。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('element', 'constraints', '约束')"
            :aria-label="
              getSectionToggleLabel('element', 'constraints', '约束')
            "
            @click="toggleSection('element', 'constraints')"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("element", "constraints")
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('element', 'constraints')"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">水平</span>
              <select
                :value="elementConstraints.horizontal"
                class="workspace-design-inspector__input"
                @change="
                  updateElementConstraints(
                    'horizontal',
                    ($event.target as HTMLSelectElement).value,
                  )
                "
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
                <option value="scale">scale</option>
              </select>
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">垂直</span>
              <select
                :value="elementConstraints.vertical"
                class="workspace-design-inspector__input"
                @change="
                  updateElementConstraints(
                    'vertical',
                    ($event.target as HTMLSelectElement).value,
                  )
                "
              >
                <option value="top">top</option>
                <option value="center">center</option>
                <option value="bottom">bottom</option>
                <option value="scale">scale</option>
              </select>
            </label>
          </div>
          <p class="workspace-design-inspector__subsection-note">
            参考容器尺寸：{{ Math.round(elementConstraints.referenceWidth) }} ×
            {{ Math.round(elementConstraints.referenceHeight) }}
          </p>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('element', 'layer', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">图层</h4>
            <p class="workspace-design-inspector__group-description">
              可见性、锁定和图层顺序。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('element', 'layer', '图层')"
            :aria-label="getSectionToggleLabel('element', 'layer', '图层')"
            @click="toggleSection('element', 'layer')"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("element", "layer")
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('element', 'layer')"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">zIndex</span>
              <input
                :value="Number(props.element.zIndex || 0)"
                class="workspace-design-inspector__input"
                type="number"
                min="0"
                @change="
                  emit('updateElement', {
                    zIndex: Math.max(
                      0,
                      Math.round(
                        toFiniteNumber(
                          ($event.target as HTMLInputElement).value,
                          Number(props.element.zIndex || 0),
                        ),
                      ),
                    ),
                  })
                "
              />
            </label>
          </div>

          <div class="workspace-design-inspector__meta-list">
            <div class="workspace-design-inspector__meta-row">
              <span class="workspace-design-inspector__meta-key">元素 ID</span>
              <span class="workspace-design-inspector__meta-value">{{
                props.element.id
              }}</span>
            </div>
            <div class="workspace-design-inspector__meta-row">
              <span class="workspace-design-inspector__meta-key">容器角色</span>
              <span class="workspace-design-inspector__meta-value">{{
                props.element.metadata?.containerRole ||
                (props.element.frameId ? "frame_child" : "page_root")
              }}</span>
            </div>
            <div
              v-if="props.element.frameId"
              class="workspace-design-inspector__meta-row"
            >
              <span class="workspace-design-inspector__meta-key"
                >所属 Frame</span
              >
              <span class="workspace-design-inspector__meta-value">{{
                props.element.frameId
              }}</span>
            </div>
            <div
              v-if="props.element.imageSrc"
              class="workspace-design-inspector__meta-row"
            >
              <span class="workspace-design-inspector__meta-key">图片源</span>
              <span class="workspace-design-inspector__meta-value">{{
                props.element.imageSrc
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="elementSupportsFill"
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('element', 'fill', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">填充</h4>
            <p class="workspace-design-inspector__group-description">
              v1 仅支持单 fill。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('element', 'fill', '填充', true)"
            :aria-label="getSectionToggleLabel('element', 'fill', '填充', true)"
            @click="toggleSection('element', 'fill', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("element", "fill", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('element', 'fill', true)"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label
              v-if="isTextElement"
              class="workspace-design-inspector__field"
            >
              <span class="workspace-design-inspector__label"
                >文字颜色 / token</span
              >
              <input
                :value="String(props.element.style?.color || '')"
                class="workspace-design-inspector__input"
                type="text"
                @input="
                  updateElementStyle({
                    color: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
            <label
              v-if="isTextElement"
              class="workspace-design-inspector__field"
            >
              <span class="workspace-design-inspector__label">对齐</span>
              <select
                :value="String(props.element.style?.textAlign || 'left')"
                class="workspace-design-inspector__input"
                @change="
                  updateElementStyle({
                    textAlign: ($event.target as HTMLSelectElement).value,
                  })
                "
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </label>
            <label
              v-if="isTextElement"
              class="workspace-design-inspector__field"
            >
              <span class="workspace-design-inspector__label">字号</span>
              <input
                :value="Number(props.element.style?.fontSize || 28)"
                class="workspace-design-inspector__input"
                type="number"
                min="8"
                @change="
                  updateElementStyle({
                    fontSize: Math.max(
                      8,
                      toFiniteNumber(
                        ($event.target as HTMLInputElement).value,
                        Number(props.element.style?.fontSize || 28),
                      ),
                    ),
                  })
                "
              />
            </label>
            <label
              v-if="isTextElement"
              class="workspace-design-inspector__field"
            >
              <span class="workspace-design-inspector__label">字重</span>
              <input
                :value="Number(props.element.style?.fontWeight || 500)"
                class="workspace-design-inspector__input"
                type="number"
                min="100"
                step="100"
                @change="
                  updateElementStyle({
                    fontWeight: Math.max(
                      100,
                      toFiniteNumber(
                        ($event.target as HTMLInputElement).value,
                        Number(props.element.style?.fontWeight || 500),
                      ),
                    ),
                  })
                "
              />
            </label>
            <label
              v-if="isShapeElement"
              class="workspace-design-inspector__field workspace-design-inspector__field--span-two"
            >
              <span class="workspace-design-inspector__label"
                >填充 / token</span
              >
              <input
                :value="String(props.element.style?.fill || '')"
                class="workspace-design-inspector__input"
                type="text"
                @input="
                  updateElementStyle({
                    fill: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
          </div>
        </div>
      </div>

      <div
        v-if="elementSupportsStroke"
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('element', 'stroke', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">描边</h4>
            <p class="workspace-design-inspector__group-description">
              v1 仅支持单 stroke。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('element', 'stroke', '描边')"
            :aria-label="getSectionToggleLabel('element', 'stroke', '描边')"
            @click="toggleSection('element', 'stroke')"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("element", "stroke")
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('element', 'stroke')"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label"
                >描边 / token</span
              >
              <input
                :value="String(props.element.style?.stroke || '')"
                class="workspace-design-inspector__input"
                type="text"
                @input="
                  updateElementStyle({
                    stroke: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">描边宽度</span>
              <input
                :value="Number(props.element.style?.strokeWidth || 1)"
                class="workspace-design-inspector__input"
                type="number"
                min="0"
                step="0.5"
                @change="
                  updateElementStyle({
                    strokeWidth: Math.max(
                      0,
                      toFiniteNumber(
                        ($event.target as HTMLInputElement).value,
                        Number(props.element.style?.strokeWidth || 1),
                      ),
                    ),
                  })
                "
              />
            </label>
          </div>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('element', 'effects', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">效果</h4>
            <p class="workspace-design-inspector__group-description">
              v1 仅支持透明度和单阴影。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('element', 'effects', '效果')"
            :aria-label="getSectionToggleLabel('element', 'effects', '效果')"
            @click="toggleSection('element', 'effects')"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("element", "effects")
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('element', 'effects')"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">透明度</span>
              <input
                :value="Number(props.element.style?.opacity ?? 1)"
                class="workspace-design-inspector__input"
                type="number"
                min="0"
                max="1"
                step="0.05"
                @change="
                  updateElementStyle({
                    opacity: Math.min(
                      1,
                      Math.max(
                        0,
                        toFiniteNumber(
                          ($event.target as HTMLInputElement).value,
                          Number(props.element.style?.opacity ?? 1),
                        ),
                      ),
                    ),
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">阴影</span>
              <input
                :value="String(props.element.style?.shadow || '')"
                class="workspace-design-inspector__input"
                type="text"
                placeholder="0 16px 40px rgba(15,23,42,0.18)"
                @input="
                  updateElementStyle({
                    shadow: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="props.frame">
      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'geometry', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">几何</h4>
            <p class="workspace-design-inspector__group-description">
              画板尺寸、位置与容器类型。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('frame', 'geometry', '几何', true)"
            :aria-label="
              getSectionToggleLabel('frame', 'geometry', '几何', true)
            "
            @click="toggleSection('frame', 'geometry', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("frame", "geometry", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('frame', 'geometry', true)"
          class="workspace-design-inspector__group-body"
        >
          <div
            v-if="isMultiFrameSelection"
            class="workspace-design-inspector__note"
          >
            当前右栏展示主选中画板的属性，批量命令仍以当前 selection 为准。
          </div>

          <div class="workspace-design-inspector__compact-grid">
            <label class="workspace-design-inspector__compact-field">
              <span class="workspace-design-inspector__compact-label">X</span>
              <input
                :value="Math.round(props.frame.x)"
                class="workspace-design-inspector__compact-input"
                type="number"
                @change="
                  emit('updateFrame', {
                    x: toFiniteNumber(
                      ($event.target as HTMLInputElement).value,
                      props.frame.x,
                    ),
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__compact-field">
              <span class="workspace-design-inspector__compact-label">Y</span>
              <input
                :value="Math.round(props.frame.y)"
                class="workspace-design-inspector__compact-input"
                type="number"
                @change="
                  emit('updateFrame', {
                    y: toFiniteNumber(
                      ($event.target as HTMLInputElement).value,
                      props.frame.y,
                    ),
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__compact-field">
              <span class="workspace-design-inspector__compact-label">W</span>
              <input
                :value="Math.round(props.frame.width)"
                class="workspace-design-inspector__compact-input"
                type="number"
                min="280"
                :disabled="framePresetBound"
                @change="
                  emit('updateFrame', {
                    width: Math.max(
                      280,
                      toFiniteNumber(
                        ($event.target as HTMLInputElement).value,
                        props.frame.width,
                      ),
                    ),
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__compact-field">
              <span class="workspace-design-inspector__compact-label">H</span>
              <input
                :value="Math.round(props.frame.height)"
                class="workspace-design-inspector__compact-input"
                type="number"
                min="180"
                :disabled="framePresetBound"
                @change="
                  emit('updateFrame', {
                    height: Math.max(
                      180,
                      toFiniteNumber(
                        ($event.target as HTMLInputElement).value,
                        props.frame.height,
                      ),
                    ),
                  })
                "
              />
            </label>
            <label
              class="workspace-design-inspector__compact-field workspace-design-inspector__compact-field--span-two"
            >
              <span class="workspace-design-inspector__compact-label"
                >名称</span
              >
              <input
                :value="props.frame.name"
                class="workspace-design-inspector__compact-input"
                type="text"
                @input="
                  emit('updateFrame', {
                    name: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
            <label
              class="workspace-design-inspector__compact-field workspace-design-inspector__compact-field--select"
            >
              <span class="workspace-design-inspector__compact-label"
                >类型</span
              >
	              <select
	                :value="frameKindValue"
	                class="workspace-design-inspector__compact-input"
                @change="
                  handleFrameKindChange(
                    ($event.target as HTMLSelectElement).value as
                      DesignFrameKind,
                  )
                "
	              >
	                <option value="freeform">freeform</option>
	                <option value="template">template</option>
	                <option value="device_mockup">device_mockup</option>
	                <option value="device_artboard">device_artboard</option>
	                <option value="diagram">diagram</option>
	              </select>
            </label>
          </div>

          <div
            v-if="framePresetBound"
            class="workspace-design-inspector__subsection-note"
          >
            当前预设尺寸已绑定。解除绑定前，设备画板宽高会跟随预设尺寸。
          </div>

          <div
            v-if="isDeviceFrame"
            class="workspace-design-inspector__subsection"
          >
            <div class="workspace-design-inspector__group-header">
              <div>
                <h5 class="workspace-design-inspector__subsection-title">
                  设备预设
                </h5>
                <p class="workspace-design-inspector__group-description">
                  通过分组和搜索统一管理真实设备尺寸库。
                </p>
              </div>
            </div>

            <div
              class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
            >
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label">搜索预设</span>
                <input
                  :value="devicePresetSearch"
                  class="workspace-design-inspector__input"
                  type="text"
                  placeholder="iPhone 16 Pro / Android / iPad"
                  @input="
                    devicePresetSearch = (
                      $event.target as HTMLInputElement
                    ).value
                  "
                />
              </label>
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label">当前预设</span>
                <select
                  :value="frameDevicePreset?.key || ''"
                  class="workspace-design-inspector__input"
                  @change="
                    handleDevicePresetChange(
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option
                    v-if="!groupedDeviceFramePresets.length"
                    value=""
                    disabled
                  >
                    未找到匹配预设
                  </option>
                  <optgroup
                    v-for="group in groupedDeviceFramePresets"
                    :key="group.group"
                    :label="group.group"
                  >
                    <option
                      v-for="preset in group.items"
                      :key="preset.key"
                      :value="preset.key"
                    >
                      {{
                        `${preset.title} · ${preset.screenWidth}×${preset.screenHeight}`
                      }}
                    </option>
                  </optgroup>
                </select>
              </label>
            </div>

            <div
              v-if="frameDevicePreset"
              class="workspace-design-inspector__meta-list"
            >
              <div class="workspace-design-inspector__meta-row">
                <span class="workspace-design-inspector__meta-key">分组</span>
                <span class="workspace-design-inspector__meta-value">{{
                  frameDevicePreset.group
                }}</span>
              </div>
              <div class="workspace-design-inspector__meta-row">
                <span class="workspace-design-inspector__meta-key">平台</span>
                <span class="workspace-design-inspector__meta-value">{{
                  frameDevicePreset.platform
                }}</span>
              </div>
              <div class="workspace-design-inspector__meta-row">
                <span class="workspace-design-inspector__meta-key">屏幕</span>
                <span class="workspace-design-inspector__meta-value">{{
                  `${frameDevicePreset.screenWidth} × ${frameDevicePreset.screenHeight}`
                }}</span>
              </div>
            </div>

            <div
              v-if="isDeviceArtboard"
              class="workspace-design-inspector__compact-actions"
            >
              <span class="workspace-design-inspector__status-pill">
                {{
                  framePresetBound
                    ? "当前尺寸跟随预设"
                    : "已解除绑定，可手动输入自定义尺寸"
                }}
              </span>
              <button
                v-if="framePresetBound"
                class="workspace-design-inspector__command-button"
                type="button"
                @click="clearDevicePresetBinding"
              >
                解除绑定
              </button>
              <button
                v-else
                class="workspace-design-inspector__command-button"
                type="button"
                @click="bindCurrentDevicePreset"
              >
                重新绑定当前预设
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'layout', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">布局</h4>
            <p class="workspace-design-inspector__group-description">
              仅实现 absolute / auto 单层 stack，grid 只做编辑辅助。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('frame', 'layout', '布局', true)"
            :aria-label="getSectionToggleLabel('frame', 'layout', '布局', true)"
            @click="toggleSection('frame', 'layout', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("frame", "layout", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>

        <div
          v-if="isSectionOpen('frame', 'layout', true)"
          class="workspace-design-inspector__group-body"
        >
          <template v-if="frameSupportsLayout">
            <div
              class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
            >
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label">布局模式</span>
                <select
                  :value="frameLayout.mode"
                  class="workspace-design-inspector__input"
                  @change="
                    updateFrameLayout({
                      mode: ($event.target as HTMLSelectElement).value,
                    })
                  "
                >
                  <option value="absolute">absolute</option>
                  <option value="auto">auto</option>
                </select>
              </label>
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label">主轴方向</span>
                <select
                  :value="frameLayout.direction"
                  class="workspace-design-inspector__input"
                  :disabled="frameLayout.mode !== 'auto'"
                  @change="
                    updateFrameLayout({
                      direction: ($event.target as HTMLSelectElement).value,
                    })
                  "
                >
                  <option value="horizontal">horizontal</option>
                  <option value="vertical">vertical</option>
                </select>
              </label>
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label">Gap</span>
                <input
                  :value="frameLayout.gap"
                  class="workspace-design-inspector__input"
                  type="number"
                  min="0"
                  :disabled="frameLayout.mode !== 'auto'"
                  @change="
                    updateFrameLayout({
                      gap: Math.max(
                        0,
                        toFiniteNumber(
                          ($event.target as HTMLInputElement).value,
                          frameLayout.gap,
                        ),
                      ),
                    })
                  "
                />
              </label>
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label">主轴对齐</span>
                <select
                  :value="frameLayout.alignPrimary"
                  class="workspace-design-inspector__input"
                  :disabled="frameLayout.mode !== 'auto'"
                  @change="
                    updateFrameLayout({
                      alignPrimary: ($event.target as HTMLSelectElement).value,
                    })
                  "
                >
                  <option value="start">start</option>
                  <option value="center">center</option>
                  <option value="end">end</option>
                  <option value="space-between">space-between</option>
                </select>
              </label>
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label"
                  >交叉轴对齐</span
                >
                <select
                  :value="frameLayout.alignCross"
                  class="workspace-design-inspector__input"
                  :disabled="frameLayout.mode !== 'auto'"
                  @change="
                    updateFrameLayout({
                      alignCross: ($event.target as HTMLSelectElement).value,
                    })
                  "
                >
                  <option value="start">start</option>
                  <option value="center">center</option>
                  <option value="end">end</option>
                  <option value="stretch">stretch</option>
                </select>
              </label>
            </div>

            <div class="workspace-design-inspector__subsection">
              <div class="workspace-design-inspector__group-header">
                <div>
                  <h5 class="workspace-design-inspector__subsection-title">
                    Padding
                  </h5>
                  <p class="workspace-design-inspector__group-description">
                    自动布局开启后生效。
                  </p>
                </div>
              </div>
              <div class="workspace-design-inspector__geometry-grid">
                <label class="workspace-design-inspector__field">
                  <span class="workspace-design-inspector__label">top</span>
                  <input
                    :value="frameLayout.padding.top"
                    class="workspace-design-inspector__input"
                    type="number"
                    min="0"
                    :disabled="frameLayout.mode !== 'auto'"
                    @change="
                      updateFrameLayoutPadding(
                        'top',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                </label>
                <label class="workspace-design-inspector__field">
                  <span class="workspace-design-inspector__label">right</span>
                  <input
                    :value="frameLayout.padding.right"
                    class="workspace-design-inspector__input"
                    type="number"
                    min="0"
                    :disabled="frameLayout.mode !== 'auto'"
                    @change="
                      updateFrameLayoutPadding(
                        'right',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                </label>
                <label class="workspace-design-inspector__field">
                  <span class="workspace-design-inspector__label">bottom</span>
                  <input
                    :value="frameLayout.padding.bottom"
                    class="workspace-design-inspector__input"
                    type="number"
                    min="0"
                    :disabled="frameLayout.mode !== 'auto'"
                    @change="
                      updateFrameLayoutPadding(
                        'bottom',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                </label>
                <label class="workspace-design-inspector__field">
                  <span class="workspace-design-inspector__label">left</span>
                  <input
                    :value="frameLayout.padding.left"
                    class="workspace-design-inspector__input"
                    type="number"
                    min="0"
                    :disabled="frameLayout.mode !== 'auto'"
                    @change="
                      updateFrameLayoutPadding(
                        'left',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                </label>
              </div>
            </div>

            <div class="workspace-design-inspector__subsection">
              <div class="workspace-design-inspector__group-header">
                <div>
                  <h5 class="workspace-design-inspector__subsection-title">
                    Grid
                  </h5>
                  <p class="workspace-design-inspector__group-description">
                    仅用于画布辅助线和吸附参考，不导出。
                  </p>
                </div>
              </div>
              <label class="workspace-design-inspector__check">
                <input
                  :checked="frameGrid.visible"
                  type="checkbox"
                  @change="
                    updateFrameGrid({
                      visible: ($event.target as HTMLInputElement).checked,
                    })
                  "
                />
                <span>显示编辑网格</span>
              </label>
              <div
                class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
              >
                <label class="workspace-design-inspector__field">
                  <span class="workspace-design-inspector__label">columns</span>
                  <input
                    :value="frameGrid.columns"
                    class="workspace-design-inspector__input"
                    type="number"
                    min="1"
                    @change="
                      updateFrameGrid({
                        columns: Math.max(
                          1,
                          Math.round(
                            toFiniteNumber(
                              ($event.target as HTMLInputElement).value,
                              frameGrid.columns,
                            ),
                          ),
                        ),
                      })
                    "
                  />
                </label>
                <label class="workspace-design-inspector__field">
                  <span class="workspace-design-inspector__label">rows</span>
                  <input
                    :value="frameGrid.rows"
                    class="workspace-design-inspector__input"
                    type="number"
                    min="1"
                    @change="
                      updateFrameGrid({
                        rows: Math.max(
                          1,
                          Math.round(
                            toFiniteNumber(
                              ($event.target as HTMLInputElement).value,
                              frameGrid.rows,
                            ),
                          ),
                        ),
                      })
                    "
                  />
                </label>
                <label class="workspace-design-inspector__field">
                  <span class="workspace-design-inspector__label">margin</span>
                  <input
                    :value="frameGrid.margin"
                    class="workspace-design-inspector__input"
                    type="number"
                    min="0"
                    @change="
                      updateFrameGrid({
                        margin: Math.max(
                          0,
                          toFiniteNumber(
                            ($event.target as HTMLInputElement).value,
                            frameGrid.margin,
                          ),
                        ),
                      })
                    "
                  />
                </label>
                <label class="workspace-design-inspector__field">
                  <span class="workspace-design-inspector__label">gutter</span>
                  <input
                    :value="frameGrid.gutter"
                    class="workspace-design-inspector__input"
                    type="number"
                    min="0"
                    @change="
                      updateFrameGrid({
                        gutter: Math.max(
                          0,
                          toFiniteNumber(
                            ($event.target as HTMLInputElement).value,
                            frameGrid.gutter,
                          ),
                        ),
                      })
                    "
                  />
                </label>
              </div>
            </div>

            <label class="workspace-design-inspector__check">
              <input
                :checked="frameClipContentEnabled"
                type="checkbox"
                @change="
                  updateFrameMetadata({
                    clipContent: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              <span>超出容器不显示</span>
            </label>
          </template>

          <p v-else class="workspace-design-inspector__subsection-note">
            diagram frame 继续走 `embeddedScene` 渲染，不接普通 layout / grid /
            constraint 语义。
          </p>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'layer', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">图层</h4>
            <p class="workspace-design-inspector__group-description">
              图层上下文信息。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('frame', 'layer', '图层')"
            :aria-label="getSectionToggleLabel('frame', 'layer', '图层')"
            @click="toggleSection('frame', 'layer')"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("frame", "layer") ? "expand_less" : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('frame', 'layer')"
          class="workspace-design-inspector__group-body"
        >
          <div class="workspace-design-inspector__meta-list">
            <div class="workspace-design-inspector__meta-row">
              <span class="workspace-design-inspector__meta-key">Frame ID</span>
              <span class="workspace-design-inspector__meta-value">{{
                props.frame.id
              }}</span>
            </div>
            <div class="workspace-design-inspector__meta-row">
              <span class="workspace-design-inspector__meta-key">类型</span>
              <span class="workspace-design-inspector__meta-value">{{
                props.frame.kind
              }}</span>
            </div>
            <div class="workspace-design-inspector__meta-row">
              <span class="workspace-design-inspector__meta-key">设计资源</span>
              <span class="workspace-design-inspector__meta-value">{{
                props.designResourceId || "pending-design-resource"
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'fill', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">填充</h4>
            <p class="workspace-design-inspector__group-description">
              仅保留会真实进入导出链路的 theme token。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('frame', 'fill', '填充', true)"
            :aria-label="getSectionToggleLabel('frame', 'fill', '填充', true)"
            @click="toggleSection('frame', 'fill', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("frame", "fill", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('frame', 'fill', true)"
          class="workspace-design-inspector__group-body"
        >
          <template v-if="frameSupportsVisualTokens">
            <div
              class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
            >
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label"
                  >背景 / token</span
                >
                <input
                  :value="props.frame.themeTokens?.background || ''"
                  class="workspace-design-inspector__input"
                  type="text"
                  @input="
                    updateFrameThemeTokens({
                      background: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </label>
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label"
                  >强调 / token</span
                >
                <input
                  :value="props.frame.themeTokens?.accent || ''"
                  class="workspace-design-inspector__input"
                  type="text"
                  @input="
                    updateFrameThemeTokens({
                      accent: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </label>
            </div>
          </template>
          <p v-else class="workspace-design-inspector__subsection-note">
            diagram frame 的视觉样式由结构化渲染器管理，不暴露假面板。
          </p>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'stroke', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">描边</h4>
            <p class="workspace-design-inspector__group-description">
              当前未为 frame 建模通用 stroke，右栏只保留说明。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('frame', 'stroke', '描边')"
            :aria-label="getSectionToggleLabel('frame', 'stroke', '描边')"
            @click="toggleSection('frame', 'stroke')"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("frame", "stroke") ? "expand_less" : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('frame', 'stroke')"
          class="workspace-design-inspector__group-body"
        >
          <p class="workspace-design-inspector__subsection-note">
            frame 的边框仍由具体 renderer 决定，当前不持久化通用 stroke 属性。
          </p>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'effects', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">效果</h4>
            <p class="workspace-design-inspector__group-description">
              当前未为 frame 提供独立 effect schema。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('frame', 'effects', '效果')"
            :aria-label="getSectionToggleLabel('frame', 'effects', '效果')"
            @click="toggleSection('frame', 'effects')"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("frame", "effects")
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('frame', 'effects')"
          class="workspace-design-inspector__group-body"
        >
          <p class="workspace-design-inspector__subsection-note">
            为避免预览与导出不一致，frame 级效果暂不在 v1 落模。
          </p>
        </div>
      </div>

      <div
        v-if="isDeviceFrame"
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'preview', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">实时预览</h4>
            <p class="workspace-design-inspector__group-description">
              右栏预览直接复用导出链路，避免预览和导出走两套实现。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('frame', 'preview', '实时预览', true)"
            :aria-label="
              getSectionToggleLabel('frame', 'preview', '实时预览', true)
            "
            @click="toggleSection('frame', 'preview', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("frame", "preview", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('frame', 'preview', true)"
          class="workspace-design-inspector__group-body"
        >
          <div
            v-if="isDeviceArtboard"
            class="workspace-design-inspector__segmented"
          >
            <button
              class="workspace-design-inspector__segmented-button"
              :class="
                devicePreviewMode === 'screen'
                  ? 'workspace-design-inspector__segmented-button--active'
                  : ''
              "
              type="button"
              @click="devicePreviewMode = 'screen'"
            >
              裸屏预览
            </button>
            <button
              class="workspace-design-inspector__segmented-button"
              :class="
                devicePreviewMode === 'shell'
                  ? 'workspace-design-inspector__segmented-button--active'
                  : ''
              "
              type="button"
              @click="devicePreviewMode = 'shell'"
            >
              带壳预览
            </button>
          </div>
          <div
            v-if="activeFramePreviewMarkup"
            class="workspace-design-inspector__preview-frame"
            v-html="activeFramePreviewMarkup"
          />
          <p v-else class="workspace-design-inspector__subsection-note">
            当前设备对象还没有可渲染的实时预览。
          </p>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'export', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">导出</h4>
            <p class="workspace-design-inspector__group-description">
              继续走 SVG-first 链路，再转 PNG。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('frame', 'export', '导出', true)"
            :aria-label="getSectionToggleLabel('frame', 'export', '导出', true)"
            @click="toggleSection('frame', 'export', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("frame", "export", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('frame', 'export', true)"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">默认格式</span>
              <select
                :value="frameExport.format"
                class="workspace-design-inspector__input"
                @change="
                  updateFrameExport({
                    format: ($event.target as HTMLSelectElement).value,
                  })
                "
              >
                <option value="png">png</option>
                <option value="svg">svg</option>
                <option value="pdf">pdf</option>
              </select>
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">导出倍率</span>
              <input
                :value="frameExport.scale"
                class="workspace-design-inspector__input"
                type="number"
                min="1"
                step="1"
                @change="
                  updateFrameExport({
                    scale: Math.max(
                      1,
                      Math.round(
                        toFiniteNumber(
                          ($event.target as HTMLInputElement).value,
                          frameExport.scale,
                        ),
                      ),
                    ),
                  })
                "
              />
            </label>
          </div>
          <label class="workspace-design-inspector__check">
            <input
              :checked="frameExport.includePageOverlays"
              type="checkbox"
              @change="
                updateFrameExport({
                  includePageOverlays: ($event.target as HTMLInputElement)
                    .checked,
                })
              "
            />
            <span>导出时继承 page overlays</span>
          </label>

          <div
            v-if="isDeviceFrame"
            class="workspace-design-inspector__subsection"
          >
            <div class="workspace-design-inspector__group-header">
              <div>
                <h5 class="workspace-design-inspector__subsection-title">
                  设备导出
                </h5>
                <p class="workspace-design-inspector__group-description">
                  device_mockup 渲染单图模板，device_artboard 渲染自身内容。
                </p>
              </div>
            </div>

            <label class="workspace-design-inspector__check">
              <input
                :checked="frameDeviceMetadata.shellMode !== 'none'"
                type="checkbox"
                @change="
                  setFrameShellEnabled(
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
              <span>是否带壳</span>
            </label>

            <div
              class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
            >
              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label">壳来源</span>
                <select
                  :value="
                    frameDeviceMetadata.shellMode === 'external'
                      ? 'external'
                      : 'builtin'
                  "
                  class="workspace-design-inspector__input"
                  :disabled="frameDeviceMetadata.shellMode === 'none'"
                  @change="
                    updateFrameDeviceMetadata({
                      shellMode: ($event.target as HTMLSelectElement)
                        .value as 'builtin' | 'external',
                    })
                  "
                >
                  <option value="builtin">内置壳</option>
                  <option value="external">外部壳</option>
                </select>
              </label>

              <label class="workspace-design-inspector__field">
                <span class="workspace-design-inspector__label">屏幕缩放</span>
                <select
                  :value="frameDeviceMetadata.screenScaleMode"
                  class="workspace-design-inspector__input"
                  @change="
                    updateFrameDeviceMetadata({
                      screenScaleMode: ($event.target as HTMLSelectElement)
                        .value as 'fit' | 'fill',
                    })
                  "
                >
                  <option value="fit">fit</option>
                  <option value="fill">fill</option>
                </select>
              </label>

              <label
                v-if="frameDeviceMetadata.shellMode === 'external'"
                class="workspace-design-inspector__field workspace-design-inspector__field--span-two"
              >
                <span class="workspace-design-inspector__label"
                  >外部壳资源</span
                >
                <select
                  :value="frameDeviceMetadata.shellAssetId || ''"
                  class="workspace-design-inspector__input"
                  @change="
                    updateFrameDeviceMetadata({
                      shellAssetId:
                        normalizeString(
                          ($event.target as HTMLSelectElement).value,
                        ) || undefined,
                    })
                  "
                >
                  <option value="">未指定</option>
                  <option
                    v-for="asset in props.deviceShellAssets"
                    :key="asset.id"
                    :value="asset.id"
                    :disabled="!isDeviceShellAssetValid(asset)"
                  >
                    {{
                      `${asset.name}${isDeviceShellAssetValid(asset) ? '' : ' · viewport 未完成'}`
                    }}
                  </option>
                </select>
              </label>

            </div>

            <label
              v-if="isDeviceArtboard"
              class="workspace-design-inspector__check"
            >
              <input
                :checked="frameDeviceMetadata.showSafeArea"
                type="checkbox"
                @change="
                  updateFrameDeviceMetadata({
                    showSafeArea: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              <span>显示 Safe Area</span>
            </label>

            <div
              v-if="selectedShellAsset"
              class="workspace-design-inspector__meta-list"
            >
              <div
                v-if="selectedShellAsset"
                class="workspace-design-inspector__meta-row"
              >
                <span class="workspace-design-inspector__meta-key">当前外部壳</span>
                <span class="workspace-design-inspector__meta-value">{{
                  selectedShellAsset.name
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="props.frame.kind === 'diagram'"
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('frame', 'diagram-source', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h5 class="workspace-design-inspector__subsection-title">结构源</h5>
            <p class="workspace-design-inspector__group-description">
              右栏只保留轻量入口，复杂操作和 AI 生成/续改仍进入 Diagram 编辑态。
            </p>
          </div>
          <div class="workspace-design-inspector__group-actions">
            <button
              v-if="props.canOpenDiagramEditor"
              class="workspace-design-inspector__icon-button"
              type="button"
              title="打开 Diagram 编辑态"
              aria-label="打开 Diagram 编辑态"
              @click="emit('openDiagramEditor')"
            >
              <span class="material-symbols-outlined text-[18px]"
                >open_in_new</span
              >
            </button>
            <button
              class="workspace-design-inspector__section-toggle"
              type="button"
              :title="
                getSectionToggleLabel('frame', 'diagram-source', '结构源')
              "
              :aria-label="
                getSectionToggleLabel('frame', 'diagram-source', '结构源')
              "
              @click="toggleSection('frame', 'diagram-source')"
            >
              <span class="material-symbols-outlined text-[18px]">
                {{
                  isSectionOpen("frame", "diagram-source")
                    ? "expand_less"
                    : "expand_more"
                }}
              </span>
            </button>
          </div>
        </div>
        <div
          v-if="isSectionOpen('frame', 'diagram-source')"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">结构源类型</span>
              <select
                :value="props.diagramSourceFormat"
                class="workspace-design-inspector__input"
                @change="
                  emit(
                    'update:diagramSourceFormat',
                    ($event.target as HTMLSelectElement).value as
                      | 'mermaid'
                      | 'markdown_outline'
                      | 'ddl'
                      | 'architecture',
                  )
                "
              >
                <option value="mermaid">Mermaid</option>
                <option value="markdown_outline">Markdown Outline</option>
                <option value="ddl">DDL</option>
                <option value="architecture">Architecture Metadata</option>
              </select>
            </label>
          </div>

          <label class="workspace-design-inspector__field">
            <span class="workspace-design-inspector__label">源文本</span>
            <textarea
              :value="props.diagramSourceText"
              class="workspace-design-inspector__textarea workspace-design-inspector__textarea--mono"
              @input="
                emit(
                  'update:diagramSourceText',
                  ($event.target as HTMLTextAreaElement).value,
                )
              "
            />
          </label>

          <button
            class="workspace-design-inspector__button workspace-design-inspector__button--primary"
            type="button"
            @click="emit('applyDiagramSource')"
          >
            应用结构源
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="props.page">
      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('page', 'canvas', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">画板</h4>
            <p class="workspace-design-inspector__group-description">
              页面名称、背景与基础导出外观。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('page', 'canvas', '画板', true)"
            :aria-label="getSectionToggleLabel('page', 'canvas', '画板', true)"
            @click="toggleSection('page', 'canvas', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("page", "canvas", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('page', 'canvas', true)"
          class="workspace-design-inspector__group-body"
        >
          <div
            class="workspace-design-inspector__field-grid workspace-design-inspector__field-grid--two"
          >
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">Page 名称</span>
              <input
                :value="props.page.name"
                class="workspace-design-inspector__input"
                type="text"
                @input="
                  emit('updatePage', {
                    name: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
            <label class="workspace-design-inspector__field">
              <span class="workspace-design-inspector__label">背景色</span>
              <input
                :value="props.page.background || '#0b1220'"
                class="workspace-design-inspector__input workspace-design-inspector__input--color"
                type="color"
                @input="
                  emit('updatePage', {
                    background: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
          </div>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('page', 'export', true) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">导出</h4>
            <p class="workspace-design-inspector__group-description">
              页面级裁剪继续收敛到 clip 语义。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('page', 'export', '导出', true)"
            :aria-label="getSectionToggleLabel('page', 'export', '导出', true)"
            @click="toggleSection('page', 'export', true)"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("page", "export", true)
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('page', 'export', true)"
          class="workspace-design-inspector__group-body"
        >
          <label class="workspace-design-inspector__check">
            <input
              :checked="pageClipToPage"
              type="checkbox"
              @change="
                updatePageMetadata({
                  clipToPage: ($event.target as HTMLInputElement).checked,
                })
              "
            />
            <span>超出画板不显示</span>
          </label>
        </div>
      </div>

      <div
        class="workspace-design-inspector__group"
        :data-collapsed="
          isSectionOpen('page', 'viewport', false) ? 'false' : 'true'
        "
      >
        <div class="workspace-design-inspector__group-header">
          <div>
            <h4 class="workspace-design-inspector__group-title">视口</h4>
            <p class="workspace-design-inspector__group-description">
              当前编辑态 viewport 与 page meta。
            </p>
          </div>
          <button
            class="workspace-design-inspector__section-toggle"
            type="button"
            :title="getSectionToggleLabel('page', 'viewport', '视口')"
            :aria-label="getSectionToggleLabel('page', 'viewport', '视口')"
            @click="toggleSection('page', 'viewport')"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{
                isSectionOpen("page", "viewport")
                  ? "expand_less"
                  : "expand_more"
              }}
            </span>
          </button>
        </div>
        <div
          v-if="isSectionOpen('page', 'viewport')"
          class="workspace-design-inspector__group-body"
        >
          <div class="workspace-design-inspector__meta-list">
            <div class="workspace-design-inspector__meta-row">
              <span class="workspace-design-inspector__meta-key">Viewport</span>
              <span class="workspace-design-inspector__meta-value">{{
                pageViewportText
              }}</span>
            </div>
            <div class="workspace-design-inspector__meta-row">
              <span class="workspace-design-inspector__meta-key">Page ID</span>
              <span class="workspace-design-inspector__meta-value">{{
                props.page.id
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="workspace-design-inspector__empty">
      当前没有选中对象。
    </div>
  </section>
</template>

<style scoped>
.workspace-design-inspector {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 100%;
}

.workspace-design-inspector__alert {
  border: 1px solid rgba(253, 164, 175, 0.85);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(255, 241, 242, 0.78);
}

.workspace-design-inspector__alert-title {
  font-size: 12px;
  font-weight: 700;
  color: #881337;
}

.workspace-design-inspector__alert-body {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: #be123c;
}

.workspace-design-inspector__group-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.workspace-design-inspector__command-strip {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-design-inspector__command-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-design-inspector__command-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.workspace-design-inspector__command-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}

.workspace-design-inspector__command-row--adaptive {
  width: 100%;
  gap: 0;
}

.workspace-design-inspector__command-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.workspace-design-inspector__command-row--adaptive
  .workspace-design-inspector__command-item {
  flex: 1 1 0;
}

.workspace-design-inspector__command-button {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(203, 213, 225, 0.94);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.82);
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    opacity 160ms ease;
}

.workspace-design-inspector__command-button:hover {
  border-color: rgba(148, 163, 184, 0.96);
  background: rgba(255, 255, 255, 0.94);
}

.workspace-design-inspector__command-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.workspace-design-inspector__command-button--icon {
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.workspace-design-inspector__command-button--ghost {
  border-color: transparent;
  background: transparent;
  border-radius: 6px;
}

.workspace-design-inspector__command-button--ghost:hover {
  border-color: transparent;
  background: rgba(241, 245, 249, 0.92);
}

.workspace-design-inspector__command-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 16px;
  line-height: 1;
}

.workspace-design-inspector__command-icon--mirror-y {
  transform: rotate(90deg);
}

.workspace-design-inspector__command-tooltip {
  position: absolute;
  left: 50%;
  z-index: 4;
  white-space: nowrap;
  opacity: 0;
  font-size: 11px;
  line-height: 1.1;
  font-weight: 700;
  color: #f8fafc;
  padding: 5px 8px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.workspace-design-inspector__command-item--tooltip-above
  .workspace-design-inspector__command-tooltip {
  bottom: calc(100% + 10px);
  transform: translateX(-50%) translateY(4px);
}

.workspace-design-inspector__command-item--tooltip-below
  .workspace-design-inspector__command-tooltip {
  top: calc(100% + 10px);
  transform: translateX(-50%) translateY(-4px);
}

.workspace-design-inspector__command-item:hover
  .workspace-design-inspector__command-tooltip,
.workspace-design-inspector__command-item:focus-within
  .workspace-design-inspector__command-tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.workspace-design-inspector__compact-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(226, 232, 240, 0.96);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-design-inspector__compact-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.workspace-design-inspector__compact-title {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
}

.workspace-design-inspector__compact-chevron {
  font-size: 16px;
  color: #64748b;
}

.workspace-design-inspector__compact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workspace-design-inspector__compact-field {
  min-width: 0;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.86);
}

.workspace-design-inspector__compact-field--span-two {
  grid-column: span 2;
}

.workspace-design-inspector__compact-field--select {
  position: relative;
}

.workspace-design-inspector__compact-label {
  flex-shrink: 0;
  min-width: 22px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
}

.workspace-design-inspector__compact-input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #0f172a;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  outline: none;
  box-shadow: none;
}

.workspace-design-inspector__compact-check {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.workspace-design-inspector__compact-check input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #2563eb;
}

.workspace-design-inspector__compact-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-design-inspector__status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.9);
  color: #334155;
  font-size: 11px;
  font-weight: 700;
}

.workspace-design-inspector__group {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(226, 232, 240, 0.96);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-design-inspector__group-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-design-inspector__group-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-design-inspector__section-toggle,
.workspace-design-inspector__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.8);
  color: #64748b;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.workspace-design-inspector__section-toggle:hover,
.workspace-design-inspector__icon-button:hover {
  border-color: rgba(148, 163, 184, 0.96);
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
}

.workspace-design-inspector__section-toggle:focus-visible,
.workspace-design-inspector__icon-button:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.32);
  outline-offset: 2px;
}

.workspace-design-inspector__icon-button--active {
  border-color: rgba(15, 23, 42, 0.9);
  background: rgba(15, 23, 42, 0.9);
  color: #fff;
}

.workspace-design-inspector__icon-button--active:hover {
  border-color: rgba(30, 41, 59, 0.92);
  background: rgba(30, 41, 59, 0.94);
  color: #fff;
}

.workspace-design-inspector__icon-button--danger {
  border-color: rgba(251, 113, 133, 0.42);
  background: rgba(255, 255, 255, 0.82);
  color: #e11d48;
}

.workspace-design-inspector__icon-button--danger:hover {
  border-color: rgba(251, 113, 133, 0.72);
  background: rgba(255, 241, 242, 0.88);
  color: #be123c;
}

.workspace-design-inspector__group-title,
.workspace-design-inspector__subsection-title {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  color: #1e293b;
}

.workspace-design-inspector__group-description {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.6;
  color: #64748b;
}

.workspace-design-inspector__subsection {
  padding-top: 10px;
  border-top: 1px solid rgba(226, 232, 240, 0.72);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-design-inspector__segmented {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.82);
}

.workspace-design-inspector__segmented-button {
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.workspace-design-inspector__segmented-button--active {
  background: #0f172a;
  color: #f8fafc;
}

.workspace-design-inspector__preview-frame {
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 18px;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
  min-height: 220px;
}

.workspace-design-inspector__preview-frame :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

.workspace-design-inspector__field-grid {
  display: grid;
  gap: 10px;
}

.workspace-design-inspector__field-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace-design-inspector__geometry-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.workspace-design-inspector__field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-design-inspector__field--span-two {
  grid-column: span 2;
}

.workspace-design-inspector__label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  color: #334155;
}

.workspace-design-inspector__input,
.workspace-design-inspector__textarea {
  width: 100%;
  border: 1px solid rgba(203, 213, 225, 0.94);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: #0f172a;
  outline: none;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.workspace-design-inspector__input {
  height: 36px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 36px;
}

.workspace-design-inspector__input--color {
  padding: 4px;
}

.workspace-design-inspector__textarea {
  min-height: 92px;
  padding: 9px 10px;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}

.workspace-design-inspector__textarea--mono {
  min-height: 136px;
  font-family:
    ui-monospace,
    SFMono-Regular,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    Liberation Mono,
    Courier New,
    monospace;
}

.workspace-design-inspector__input:focus,
.workspace-design-inspector__textarea:focus {
  border-color: rgba(15, 23, 42, 0.88);
  background: rgba(255, 255, 255, 0.92);
}

.workspace-design-inspector__input:disabled,
.workspace-design-inspector__textarea:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.workspace-design-inspector__button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-design-inspector__button-row--compact {
  justify-content: flex-end;
}

.workspace-design-inspector__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(203, 213, 225, 0.94);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.78);
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.workspace-design-inspector__button:hover {
  border-color: rgba(148, 163, 184, 0.96);
  background: rgba(255, 255, 255, 0.92);
}

.workspace-design-inspector__button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.workspace-design-inspector__button--active {
  border-color: rgba(15, 23, 42, 0.9);
  background: rgba(15, 23, 42, 0.9);
  color: #fff;
}

.workspace-design-inspector__button--primary {
  border-color: rgba(15, 23, 42, 0.9);
  background: rgba(15, 23, 42, 0.94);
  color: #fff;
}

.workspace-design-inspector__button--primary:hover,
.workspace-design-inspector__button--active:hover {
  border-color: rgba(30, 41, 59, 0.92);
  background: rgba(30, 41, 59, 0.94);
}

.workspace-design-inspector__button--danger {
  border-color: rgba(251, 113, 133, 0.42);
  background: rgba(255, 255, 255, 0.8);
  color: #e11d48;
}

.workspace-design-inspector__button--danger:hover {
  border-color: rgba(251, 113, 133, 0.72);
  background: rgba(255, 241, 242, 0.88);
}

.workspace-design-inspector__note {
  border: 1px solid rgba(186, 230, 253, 0.92);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(240, 249, 255, 0.78);
  font-size: 11px;
  line-height: 1.6;
  color: #0c4a6e;
}

.workspace-design-inspector__subsection-note {
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.86);
  font-size: 11px;
  line-height: 1.6;
  color: #475569;
}

.workspace-design-inspector__check {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.workspace-design-inspector__check input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #2563eb;
}

.workspace-design-inspector__meta-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-design-inspector__meta-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.workspace-design-inspector__meta-key {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  color: #64748b;
}

.workspace-design-inspector__meta-value {
  min-width: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #0f172a;
  overflow-wrap: anywhere;
}

.workspace-design-inspector__empty {
  margin-top: 14px;
  border: 1px dashed rgba(203, 213, 225, 0.94);
  border-radius: 10px;
  padding: 18px 12px;
  text-align: center;
  font-size: 13px;
  color: #64748b;
  background: rgba(248, 250, 252, 0.78);
}

@media (max-width: 420px) {
  .workspace-design-inspector__group-header {
    flex-direction: column;
  }

  .workspace-design-inspector__field-grid--two,
  .workspace-design-inspector__geometry-grid,
  .workspace-design-inspector__compact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workspace-design-inspector__button-row--compact {
    justify-content: flex-start;
  }

  .workspace-design-inspector__compact-field--span-two {
    grid-column: span 2;
  }
}
</style>
