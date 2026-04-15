<script setup lang="ts">
import type {
  ApiResponse,
  CanvasLibraryAssetKind,
  CanvasLibraryItem,
  CanvasLibraryItemKind,
  CanvasLibraryItemPayloadType,
  CanvasLibraryItemStatus,
  CanvasLibraryItemVersion,
  CanvasLibraryTemplateTarget,
} from "~~/shared/types/domain";

definePageMeta({
  layout: "admin",
});

type CanvasLibraryDetail = {
  item: CanvasLibraryItem;
  draftVersion: CanvasLibraryItemVersion | null;
  publishedVersion: CanvasLibraryItemVersion | null;
};

const runtime = useRuntimeConfig();
const { endpoint } = useApiEndpoint(runtime);

const loading = ref(false);
const mutating = ref(false);
const errorText = ref("");
const items = ref<CanvasLibraryItem[]>([]);
const selectedItemId = ref("");
const selectedDetail = ref<CanvasLibraryDetail | null>(null);

const filters = reactive({
  status: "" as CanvasLibraryItemStatus | "",
  kind: "" as CanvasLibraryItemKind | "",
  source: "",
  search: "",
});

const createMode = ref<CanvasLibraryItemKind>("template");
const createTitle = ref("");
const createSummary = ref("");
const createSlug = ref("");
const createTags = ref("");
const createTemplateTarget = ref<CanvasLibraryTemplateTarget>("scene");
const createAssetKind = ref<CanvasLibraryAssetKind>("image");
const createPublishNow = ref(true);
const createPayloadText = ref("");
const createAssetFile = ref<File | null>(null);
const createAssetInputRef = ref<HTMLInputElement | null>(null);
const createAssetViewportRect = ref('{"x":0,"y":0,"width":0,"height":0}');
const createAssetCornerRadius = ref("0");
const createAssetPresetKeys = ref("");

const editTitle = ref("");
const editSummary = ref("");
const editSlug = ref("");
const editTags = ref("");
const editPayloadText = ref("");
const editPayloadType = ref<CanvasLibraryItemPayloadType>("scene_document");

const selectedEditableVersion = computed(() => {
  return selectedDetail.value?.draftVersion || selectedDetail.value?.publishedVersion || null;
});
const selectedAssetPreviewUrl = computed(() => {
  if (!selectedDetail.value) return "";
  const version = selectedEditableVersion.value;
  if (!version || version.payloadType !== "binary_asset") return "";
  return endpoint(
    `/admin/canvas-library/items/${encodeURIComponent(selectedDetail.value.item.id)}/asset`,
  );
});

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function parseJsonText<T = unknown>(value: string, fieldLabel: string): T {
  const text = value.trim();
  if (!text) throw new Error(`${fieldLabel} 不能为空。`);
  try {
    return JSON.parse(text) as T;
  }
  catch {
    throw new Error(`${fieldLabel} 不是合法 JSON。`);
  }
}

function resetCreateAssetInput(): void {
  createAssetFile.value = null;
  if (createAssetInputRef.value) createAssetInputRef.value.value = "";
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(path), {
    credentials: "include",
    ...init,
  });
  const result = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !result || result.code !== 0)
    throw new Error(String(result?.message || "请求失败。"));
  return result.data;
}

function syncSelectedEditor(detail: CanvasLibraryDetail | null): void {
  const editableVersion = detail?.draftVersion || detail?.publishedVersion || null;
  editTitle.value = detail?.item.title || "";
  editSummary.value = detail?.item.summary || "";
  editSlug.value = detail?.item.slug || "";
  editTags.value = (detail?.item.tags || []).join(", ");
  editPayloadType.value = editableVersion?.payloadType || "scene_document";
  editPayloadText.value = editableVersion
    ? JSON.stringify(editableVersion.payload, null, 2)
    : "";
}

async function loadItems(): Promise<void> {
  loading.value = true;
  errorText.value = "";
  try {
    const query = new URLSearchParams();
    if (filters.status) query.set("status", filters.status);
    if (filters.kind) query.set("kind", filters.kind);
    if (filters.source) query.set("source", filters.source);
    if (filters.search.trim()) query.set("search", filters.search.trim());
    items.value = await apiRequest<CanvasLibraryItem[]>(
      `/admin/canvas-library/items${query.size ? `?${query.toString()}` : ""}`,
    );
    if (selectedItemId.value && !items.value.some((item) => item.id === selectedItemId.value))
      selectedItemId.value = "";
    if (!selectedItemId.value && items.value[0]?.id) {
      selectedItemId.value = items.value[0].id;
      await loadSelectedItem();
    }
  }
  catch (error: any) {
    items.value = [];
    errorText.value = String(error?.message || "画布资源库加载失败。");
  }
  finally {
    loading.value = false;
  }
}

async function loadSelectedItem(): Promise<void> {
  const itemId = normalizeString(selectedItemId.value);
  if (!itemId) {
    selectedDetail.value = null;
    syncSelectedEditor(null);
    return;
  }

  try {
    selectedDetail.value = await apiRequest<CanvasLibraryDetail>(
      `/admin/canvas-library/items/${encodeURIComponent(itemId)}`,
    );
    syncSelectedEditor(selectedDetail.value);
  }
  catch (error: any) {
    errorText.value = String(error?.message || "条目详情加载失败。");
  }
}

function handleCreateAssetFileChange(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  createAssetFile.value = input?.files?.[0] || null;
}

async function inspectImageFile(file: File): Promise<{ width: number; height: number }> {
  if (!import.meta.client || !file.type.startsWith("image/"))
    return { width: 0, height: 0 };
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () =>
        resolve({
          width: Number(image.naturalWidth || image.width || 0),
          height: Number(image.naturalHeight || image.height || 0),
        });
      image.onerror = () => resolve({ width: 0, height: 0 });
      image.src = String(reader.result || "");
    };
    reader.onerror = () => resolve({ width: 0, height: 0 });
    reader.readAsDataURL(file);
  });
}

async function createLibraryItem(): Promise<void> {
  mutating.value = true;
  errorText.value = "";
  try {
    if (!createTitle.value.trim())
      throw new Error("标题不能为空。");

    let created: CanvasLibraryDetail | null = null;
    if (createMode.value === "template") {
      const payload = parseJsonText(createPayloadText.value, "模板 payload");
      const payloadType: CanvasLibraryItemPayloadType =
        createTemplateTarget.value === "scene" ? "scene_document" : "design_fragment";
      created = await apiRequest<CanvasLibraryDetail>("/admin/canvas-library/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: createTitle.value.trim(),
          slug: createSlug.value.trim(),
          summary: createSummary.value.trim(),
          kind: "template",
          templateTarget: createTemplateTarget.value,
          tags: createTags.value
            .split(/[，,\n]+/)
            .map((item) => item.trim())
            .filter(Boolean),
          payloadType,
          payload,
          previewPayload: payload,
          publish: createPublishNow.value,
        }),
      });
    }
    else {
      if (!createAssetFile.value)
        throw new Error("请先选择要上传的素材文件。");
      const dimensions = await inspectImageFile(createAssetFile.value);
      const formData = new FormData();
      formData.set("file", createAssetFile.value);
      formData.set("assetKind", createAssetKind.value);
      formData.set("width", String(dimensions.width || 0));
      formData.set("height", String(dimensions.height || 0));
      if (createAssetKind.value === "device_shell") {
        formData.set("viewportRect", createAssetViewportRect.value.trim() || "{}");
        formData.set("cornerRadius", createAssetCornerRadius.value.trim() || "0");
        formData.set("presetKeys", createAssetPresetKeys.value.trim());
      }
      const uploaded = await apiRequest<{
        assetKind: CanvasLibraryAssetKind;
        payload: Record<string, unknown>;
      }>("/admin/canvas-library/assets/upload", {
        method: "POST",
        body: formData,
      });
      created = await apiRequest<CanvasLibraryDetail>("/admin/canvas-library/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: createTitle.value.trim(),
          slug: createSlug.value.trim(),
          summary: createSummary.value.trim(),
          kind: "asset",
          assetKind: uploaded.assetKind,
          tags: createTags.value
            .split(/[，,\n]+/)
            .map((item) => item.trim())
            .filter(Boolean),
          payloadType: "binary_asset",
          payload: uploaded.payload,
          previewPayload: {},
          publish: createPublishNow.value,
        }),
      });
    }

    createTitle.value = "";
    createSummary.value = "";
    createSlug.value = "";
    createTags.value = "";
    createPayloadText.value = "";
    resetCreateAssetInput();
    if (created?.item.id) {
      selectedItemId.value = created.item.id;
      selectedDetail.value = created;
      syncSelectedEditor(created);
    }
    await loadItems();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "创建条目失败。");
  }
  finally {
    mutating.value = false;
  }
}

async function saveSelectedItem(): Promise<void> {
  if (!selectedDetail.value) return;
  mutating.value = true;
  errorText.value = "";
  try {
    const nextPayload = editPayloadText.value.trim()
      ? parseJsonText(editPayloadText.value, "版本 payload")
      : undefined;
    await apiRequest(
      `/admin/canvas-library/items/${encodeURIComponent(selectedDetail.value.item.id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle.value.trim(),
          slug: editSlug.value.trim(),
          summary: editSummary.value.trim(),
          tags: editTags.value
            .split(/[，,\n]+/)
            .map((item) => item.trim())
            .filter(Boolean),
          payloadType: nextPayload !== undefined ? editPayloadType.value : undefined,
          payload: nextPayload,
          previewPayload: nextPayload,
        }),
      },
    );
    await loadSelectedItem();
    await loadItems();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "保存条目失败。");
  }
  finally {
    mutating.value = false;
  }
}

async function publishSelectedItem(): Promise<void> {
  if (!selectedDetail.value) return;
  mutating.value = true;
  errorText.value = "";
  try {
    await apiRequest(
      `/admin/canvas-library/items/${encodeURIComponent(selectedDetail.value.item.id)}/publish`,
      {
        method: "POST",
      },
    );
    await loadSelectedItem();
    await loadItems();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "发布失败。");
  }
  finally {
    mutating.value = false;
  }
}

async function archiveSelectedItem(): Promise<void> {
  if (!selectedDetail.value) return;
  mutating.value = true;
  errorText.value = "";
  try {
    await apiRequest(
      `/admin/canvas-library/items/${encodeURIComponent(selectedDetail.value.item.id)}/archive`,
      {
        method: "POST",
      },
    );
    await loadSelectedItem();
    await loadItems();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "归档失败。");
  }
  finally {
    mutating.value = false;
  }
}

watch(
  () => [filters.status, filters.kind, filters.source, filters.search],
  () => {
    void loadItems();
  },
  {
    deep: true,
  },
);

watch(selectedItemId, () => {
  void loadSelectedItem();
});

onMounted(async () => {
  await loadItems();
});
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-2xl border border-slate-200 bg-white p-4">
      <h1 class="text-lg font-semibold text-slate-900">
        平台级画布资源库
      </h1>
      <p class="mt-1 text-xs leading-5 text-slate-500">
        管理员可在这里创建、编辑、发布和归档 Scene / Page / Frame 模板与单文件素材条目。
      </p>
    </section>

    <section v-if="errorText" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ errorText }}
    </section>

    <div class="grid gap-4 xl:grid-cols-[320px,minmax(0,1fr)]">
      <section class="space-y-4">
        <article class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="grid gap-3">
            <input
              v-model="filters.search"
              class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
              type="search"
              placeholder="搜索标题 / slug / 摘要"
            />
            <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
              <select
                v-model="filters.kind"
                class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
              >
                <option value="">
                  全部类型
                </option>
                <option value="template">
                  Templates
                </option>
                <option value="asset">
                  Assets
                </option>
              </select>
              <select
                v-model="filters.status"
                class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
              >
                <option value="">
                  全部状态
                </option>
                <option value="draft">
                  Draft
                </option>
                <option value="published">
                  Published
                </option>
                <option value="archived">
                  Archived
                </option>
              </select>
              <select
                v-model="filters.source"
                class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
              >
                <option value="">
                  全部来源
                </option>
                <option value="admin_upload">
                  后台直建
                </option>
                <option value="design_publish">
                  设计发布
                </option>
              </select>
            </div>
          </div>
        </article>

        <article class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-slate-900">
              条目列表
            </h2>
            <span class="text-xs text-slate-400">
              {{ loading ? "加载中" : `${items.length} 条` }}
            </span>
          </div>
          <div class="space-y-2">
            <button
              v-for="item in items"
              :key="item.id"
              class="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
              :class="selectedItemId === item.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white'"
              type="button"
              @click="selectedItemId = item.id"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="truncate text-sm font-semibold">
                  {{ item.title }}
                </p>
                <span class="rounded-full border px-2 py-0.5 text-[10px] font-semibold" :class="selectedItemId === item.id ? 'border-white/30 text-white/90' : 'border-slate-200 text-slate-500'">
                  {{ item.status }}
                </span>
              </div>
              <p class="mt-1 truncate text-[11px]" :class="selectedItemId === item.id ? 'text-white/70' : 'text-slate-500'">
                {{ item.slug }} · {{ item.kind }}{{ item.templateTarget ? ` / ${item.templateTarget}` : item.assetKind ? ` / ${item.assetKind}` : "" }}
              </p>
            </button>
          </div>
        </article>
      </section>

      <section class="space-y-4">
        <article class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-slate-900">
              新建条目
            </h2>
            <div class="flex items-center gap-2">
              <button
                class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                :class="createMode === 'template' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'"
                type="button"
                @click="createMode = 'template'"
              >
                Template
              </button>
              <button
                class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                :class="createMode === 'asset' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'"
                type="button"
                @click="createMode = 'asset'"
              >
                Asset
              </button>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <input
              v-model="createTitle"
              class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
              type="text"
              placeholder="标题"
            />
            <input
              v-model="createSlug"
              class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
              type="text"
              placeholder="slug（可选）"
            />
            <textarea
              v-model="createSummary"
              class="md:col-span-2 min-h-[80px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
              placeholder="摘要"
            />
            <input
              v-model="createTags"
              class="md:col-span-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
              type="text"
              placeholder="标签，逗号分隔"
            />
          </div>

          <div v-if="createMode === 'template'" class="mt-3 space-y-3">
            <select
              v-model="createTemplateTarget"
              class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            >
              <option value="scene">Scene</option>
              <option value="page">Page</option>
              <option value="frame">Frame</option>
            </select>
            <textarea
              v-model="createPayloadText"
              class="min-h-[240px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-xs leading-6 text-slate-100 outline-none transition-colors focus:border-slate-400"
              placeholder='粘贴 SceneDocument JSON 或 design fragment JSON'
            />
          </div>

          <div v-else class="mt-3 space-y-3">
            <select
              v-model="createAssetKind"
              class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            >
              <option value="image">image</option>
              <option value="svg">svg</option>
              <option value="device_shell">device_shell</option>
            </select>
            <input
              ref="createAssetInputRef"
              class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              @change="handleCreateAssetFileChange"
            />
            <template v-if="createAssetKind === 'device_shell'">
              <textarea
                v-model="createAssetViewportRect"
                class="min-h-[88px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-xs leading-6 text-slate-100 outline-none transition-colors focus:border-slate-400"
                placeholder='{"x":0,"y":0,"width":1179,"height":2556}'
              />
              <div class="grid gap-3 md:grid-cols-2">
                <input
                  v-model="createAssetCornerRadius"
                  class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
                  type="number"
                  placeholder="cornerRadius"
                />
                <input
                  v-model="createAssetPresetKeys"
                  class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
                  type="text"
                  placeholder="presetKeys，逗号分隔"
                />
              </div>
            </template>
          </div>

          <div class="mt-3 flex items-center justify-between gap-3">
            <label class="flex items-center gap-2 text-sm text-slate-600">
              <input v-model="createPublishNow" type="checkbox">
              创建后立即发布
            </label>
            <button
              class="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
              type="button"
              :disabled="mutating"
              @click="createLibraryItem"
            >
              {{ mutating ? "处理中..." : "创建条目" }}
            </button>
          </div>
        </article>

        <article class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-slate-900">
              条目详情
            </h2>
            <span class="text-xs text-slate-400">
              {{ selectedDetail?.item.status || "未选择" }}
            </span>
          </div>

          <div v-if="selectedDetail" class="space-y-4">
            <div class="grid gap-3 md:grid-cols-2">
              <input
                v-model="editTitle"
                class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
                type="text"
                placeholder="标题"
              />
              <input
                v-model="editSlug"
                class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
                type="text"
                placeholder="slug"
              />
              <textarea
                v-model="editSummary"
                class="md:col-span-2 min-h-[80px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
                placeholder="摘要"
              />
              <input
                v-model="editTags"
                class="md:col-span-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
                type="text"
                placeholder="标签"
              />
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-xs font-semibold text-slate-500">
                版本
              </p>
              <p class="mt-1 text-sm text-slate-700">
                draft:
                <span class="font-semibold">{{ selectedDetail.draftVersion?.version || "-" }}</span>
                · published:
                <span class="font-semibold">{{ selectedDetail.publishedVersion?.version || "-" }}</span>
              </p>
            </div>

            <textarea
              v-model="editPayloadText"
              class="min-h-[260px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-xs leading-6 text-slate-100 outline-none transition-colors focus:border-slate-400"
              placeholder="payload JSON"
            />

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-xs font-semibold text-slate-500">
                预览
              </p>
              <div v-if="selectedAssetPreviewUrl" class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                <img :src="selectedAssetPreviewUrl" alt="" class="max-h-[360px] w-full rounded-xl object-contain">
              </div>
              <pre
                v-else
                class="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100"
              >{{ JSON.stringify(selectedEditableVersion?.previewPayload || selectedEditableVersion?.payload || {}, null, 2) }}</pre>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                class="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300"
                type="button"
                :disabled="mutating"
                @click="saveSelectedItem"
              >
                保存草稿
              </button>
              <button
                class="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
                type="button"
                :disabled="mutating"
                @click="publishSelectedItem"
              >
                发布
              </button>
              <button
                class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:border-rose-300"
                type="button"
                :disabled="mutating"
                @click="archiveSelectedItem"
              >
                归档
              </button>
            </div>
          </div>

          <div
            v-else
            class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500"
          >
            从左侧选择一个条目以查看详情。
          </div>
        </article>
      </section>
    </div>
  </div>
</template>
