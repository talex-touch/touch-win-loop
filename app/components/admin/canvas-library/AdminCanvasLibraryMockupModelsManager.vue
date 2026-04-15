<script setup lang="ts">
import type {
  ApiResponse,
  CanvasLibraryItem,
  MockupDeviceCategory,
  MockupDeviceModel,
  MockupDeviceModelStatus,
  MockupDeviceVariant,
  MockupVariantSlotKey,
} from "~~/shared/types/domain";

const emit = defineEmits<{
  openLibraryItems: [];
}>();

type MockupModelDetail = {
  model: MockupDeviceModel;
  variants: MockupDeviceVariant[];
};

const runtime = useRuntimeConfig();
const { endpoint } = useApiEndpoint(runtime);
const VARIANT_SLOT_KEYS: MockupVariantSlotKey[] = [
  "variant_1",
  "variant_2",
  "variant_3",
  "variant_4",
];
const CATEGORY_OPTIONS: Array<{
  key: MockupDeviceCategory;
  label: string;
}> = [
  { key: "iphone", label: "iPhone" },
  { key: "tablet", label: "Tablet" },
  { key: "pc", label: "PC" },
  { key: "watch", label: "Watch" },
  { key: "android", label: "Android" },
  { key: "browser", label: "Browser" },
];

const loading = ref(false);
const mutating = ref(false);
const detailLoading = ref(false);
const errorText = ref("");
const successText = ref("");
const models = ref<MockupDeviceModel[]>([]);
const shellLibraryItems = ref<CanvasLibraryItem[]>([]);
const page = ref(1);
const pageSize = ref(10);
const createDialogVisible = ref(false);
const editDialogVisible = ref(false);
const variantsDialogVisible = ref(false);
const selectedDetail = ref<MockupModelDetail | null>(null);

const filters = reactive({
  category: "" as MockupDeviceCategory | "",
  status: "" as MockupDeviceModelStatus | "",
  search: "",
});

const createForm = reactive({
  title: "",
  slug: "",
  category: "iphone" as MockupDeviceCategory,
  brand: "",
  modelName: "",
  screenWidth: "1179",
  screenHeight: "2556",
  sortOrder: "0",
  defaultVariantSlotKey: "variant_1" as MockupVariantSlotKey,
});

const editForm = reactive({
  modelId: "",
  title: "",
  slug: "",
  category: "iphone" as MockupDeviceCategory,
  brand: "",
  modelName: "",
  screenWidth: "1179",
  screenHeight: "2556",
  sortOrder: "0",
  defaultVariantSlotKey: "",
});

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return models.value.slice(start, start + pageSize.value);
});

const selectedVariantMap = computed(() => {
  const variantMap = new Map<MockupVariantSlotKey, MockupDeviceVariant>();
  for (const variant of selectedDetail.value?.variants || []) {
    variantMap.set(variant.slotKey, variant);
  }
  return variantMap;
});

const selectedVariants = computed(() => {
  return VARIANT_SLOT_KEYS.map((slotKey, index) => {
    const existing = selectedVariantMap.value.get(slotKey);
    return existing || {
      id: `${normalizeString(selectedDetail.value?.model.id) || "pending"}:${slotKey}`,
      deviceModelId: normalizeString(selectedDetail.value?.model.id),
      slotKey,
      title: `展示姿态 ${index + 1}`,
      shellAssetItemId: null,
      shellAssetVersionId: null,
      enabled: false,
      sortOrder: index,
    };
  });
});

const publishedShellAssets = computed(() => {
  return shellLibraryItems.value.filter(
    (item) =>
      item.kind === "asset"
      && item.assetKind === "device_shell"
      && item.status === "published"
      && normalizeString(item.publishedVersionId),
  );
});

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function toInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function formatDate(value?: string): string {
  return normalizeString(value).replace("T", " ").slice(0, 16) || "-";
}

function resolveShellItemLabel(itemId?: string | null): string {
  const item = publishedShellAssets.value.find((entry) => entry.id === normalizeString(itemId));
  return item?.title || "未绑定壳素材";
}

function resetCreateForm(): void {
  createForm.title = "";
  createForm.slug = "";
  createForm.category = "iphone";
  createForm.brand = "";
  createForm.modelName = "";
  createForm.screenWidth = "1179";
  createForm.screenHeight = "2556";
  createForm.sortOrder = "0";
  createForm.defaultVariantSlotKey = "variant_1";
}

function syncEditForm(detail: MockupModelDetail | null): void {
  editForm.modelId = detail?.model.id || "";
  editForm.title = detail?.model.title || "";
  editForm.slug = detail?.model.slug || "";
  editForm.category = detail?.model.category || "iphone";
  editForm.brand = detail?.model.brand || "";
  editForm.modelName = detail?.model.modelName || "";
  editForm.screenWidth = String(detail?.model.screenWidth || 1179);
  editForm.screenHeight = String(detail?.model.screenHeight || 2556);
  editForm.sortOrder = String(detail?.model.sortOrder || 0);
  editForm.defaultVariantSlotKey = detail?.model.defaultVariantSlotKey || "";
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

async function loadModels(): Promise<void> {
  loading.value = true;
  errorText.value = "";
  try {
    const query = new URLSearchParams();
    if (filters.category) query.set("category", filters.category);
    if (filters.status) query.set("status", filters.status);
    if (filters.search.trim()) query.set("search", filters.search.trim());
    models.value = await apiRequest<MockupDeviceModel[]>(
      `/admin/mockups/models${query.size ? `?${query.toString()}` : ""}`,
    );
  }
  catch (error: any) {
    models.value = [];
    errorText.value = String(error?.message || "Mockup 型号目录加载失败。");
  }
  finally {
    loading.value = false;
  }
}

async function loadShellAssets(): Promise<void> {
  try {
    shellLibraryItems.value = await apiRequest<CanvasLibraryItem[]>(
      "/admin/canvas-library/items?kind=asset",
    );
  }
  catch (error: any) {
    errorText.value = String(error?.message || "设备壳素材加载失败。");
  }
}

async function loadSelectedModel(modelId: string): Promise<MockupModelDetail> {
  return await apiRequest<MockupModelDetail>(
    `/admin/mockups/models/${encodeURIComponent(modelId)}`,
  );
}

function openCreateDialog(): void {
  successText.value = "";
  errorText.value = "";
  resetCreateForm();
  createDialogVisible.value = true;
}

async function openEditDialog(model: MockupDeviceModel): Promise<void> {
  detailLoading.value = true;
  errorText.value = "";
  successText.value = "";
  editDialogVisible.value = true;
  try {
    selectedDetail.value = await loadSelectedModel(model.id);
    syncEditForm(selectedDetail.value);
  }
  catch (error: any) {
    editDialogVisible.value = false;
    selectedDetail.value = null;
    errorText.value = String(error?.message || "Mockup 型号详情加载失败。");
  }
  finally {
    detailLoading.value = false;
  }
}

async function openVariantsDialog(model: MockupDeviceModel): Promise<void> {
  detailLoading.value = true;
  errorText.value = "";
  successText.value = "";
  variantsDialogVisible.value = true;
  try {
    selectedDetail.value = await loadSelectedModel(model.id);
    syncEditForm(selectedDetail.value);
  }
  catch (error: any) {
    variantsDialogVisible.value = false;
    selectedDetail.value = null;
    errorText.value = String(error?.message || "Mockup 变体详情加载失败。");
  }
  finally {
    detailLoading.value = false;
  }
}

async function createModel(): Promise<void> {
  mutating.value = true;
  errorText.value = "";
  successText.value = "";
  try {
    await apiRequest<MockupModelDetail>("/admin/mockups/models", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: createForm.title.trim(),
        slug: createForm.slug.trim(),
        category: createForm.category,
        brand: createForm.brand.trim(),
        modelName: createForm.modelName.trim(),
        screenWidth: Math.max(1, toInteger(createForm.screenWidth, 1)),
        screenHeight: Math.max(1, toInteger(createForm.screenHeight, 1)),
        sortOrder: Math.max(0, toInteger(createForm.sortOrder, 0)),
        defaultVariantSlotKey: createForm.defaultVariantSlotKey,
      }),
    });

    createDialogVisible.value = false;
    resetCreateForm();
    successText.value = "Mockup 型号创建成功。";
    await loadModels();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "Mockup 型号创建失败。");
  }
  finally {
    mutating.value = false;
  }
}

async function saveSelectedModel(): Promise<void> {
  const modelId = normalizeString(editForm.modelId);
  if (!modelId) return;

  mutating.value = true;
  errorText.value = "";
  successText.value = "";
  try {
    selectedDetail.value = await apiRequest<MockupModelDetail>(
      `/admin/mockups/models/${encodeURIComponent(modelId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editForm.title.trim(),
          slug: editForm.slug.trim(),
          category: editForm.category,
          brand: editForm.brand.trim() || null,
          modelName: editForm.modelName.trim(),
          screenWidth: Math.max(1, toInteger(editForm.screenWidth, 1)),
          screenHeight: Math.max(1, toInteger(editForm.screenHeight, 1)),
          sortOrder: Math.max(0, toInteger(editForm.sortOrder, 0)),
          defaultVariantSlotKey: normalizeString(editForm.defaultVariantSlotKey) || null,
        }),
      },
    );
    syncEditForm(selectedDetail.value);
    editDialogVisible.value = false;
    successText.value = "Mockup 型号保存成功。";
    await loadModels();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "Mockup 型号保存失败。");
  }
  finally {
    mutating.value = false;
  }
}

async function publishModel(modelId: string): Promise<void> {
  mutating.value = true;
  errorText.value = "";
  successText.value = "";
  try {
    if (editForm.modelId === modelId || normalizeString(selectedDetail.value?.model.id) === modelId) {
      selectedDetail.value = await apiRequest<MockupModelDetail>(
        `/admin/mockups/models/${encodeURIComponent(modelId)}/publish`,
        { method: "POST" },
      );
      syncEditForm(selectedDetail.value);
    }
    else {
      await apiRequest(
        `/admin/mockups/models/${encodeURIComponent(modelId)}/publish`,
        { method: "POST" },
      );
    }
    successText.value = "Mockup 型号发布成功。";
    await loadModels();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "Mockup 型号发布失败。");
  }
  finally {
    mutating.value = false;
  }
}

async function archiveModel(modelId: string): Promise<void> {
  mutating.value = true;
  errorText.value = "";
  successText.value = "";
  try {
    if (editForm.modelId === modelId || normalizeString(selectedDetail.value?.model.id) === modelId) {
      selectedDetail.value = await apiRequest<MockupModelDetail>(
        `/admin/mockups/models/${encodeURIComponent(modelId)}/archive`,
        { method: "POST" },
      );
      syncEditForm(selectedDetail.value);
    }
    else {
      await apiRequest(
        `/admin/mockups/models/${encodeURIComponent(modelId)}/archive`,
        { method: "POST" },
      );
    }
    successText.value = "Mockup 型号归档成功。";
    await loadModels();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "Mockup 型号归档失败。");
  }
  finally {
    mutating.value = false;
  }
}

async function patchVariant(
  slotKey: MockupVariantSlotKey,
  patch: Partial<Pick<MockupDeviceVariant, "title" | "enabled" | "sortOrder">> & {
    shellAssetItemId?: string | null;
    shellAssetVersionId?: string | null;
  },
): Promise<void> {
  const modelId = normalizeString(selectedDetail.value?.model.id);
  if (!modelId) return;

  mutating.value = true;
  errorText.value = "";
  successText.value = "";
  try {
    await apiRequest(
      `/admin/mockups/models/${encodeURIComponent(modelId)}/variants/${encodeURIComponent(slotKey)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      },
    );
    selectedDetail.value = await loadSelectedModel(modelId);
    syncEditForm(selectedDetail.value);
    successText.value = "Mockup 变体保存成功。";
    await loadModels();
  }
  catch (error: any) {
    errorText.value = String(error?.message || "Mockup 变体保存失败。");
  }
  finally {
    mutating.value = false;
  }
}

watch(
  () => [filters.category, filters.status, filters.search] as const,
  () => {
    page.value = 1;
    void loadModels();
  },
  { immediate: true },
);

watch([models, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(models.value.length / pageSize.value));
  if (page.value > maxPage)
    page.value = maxPage;
});

onMounted(() => {
  void loadShellAssets();
});
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">
            Mockup 型号列表
          </h2>
          <p class="mt-1 text-xs leading-5 text-slate-500">
            Mockup 型号归入画布资源库后台统一管理。设备壳素材请在“模板 / 素材”里以 `device_shell` 新建，再回到这里绑定 4 个 variant。
          </p>
        </div>
        <div class="flex gap-2">
          <a-button size="small" @click="emit('openLibraryItems')">
            去素材列表
          </a-button>
          <a-button type="primary" size="small" @click="openCreateDialog">
            新增型号
          </a-button>
        </div>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-4">
        <input
          v-model="filters.search"
          class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300 md:col-span-2"
          type="search"
          placeholder="搜索标题 / slug / 型号"
        />
        <select
          v-model="filters.category"
          class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
        >
          <option value="">
            全部分类
          </option>
          <option
            v-for="item in CATEGORY_OPTIONS"
            :key="item.key"
            :value="item.key"
          >
            {{ item.label }}
          </option>
        </select>
        <select
          v-model="filters.status"
          class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
        >
          <option value="">
            全部状态
          </option>
          <option value="draft">
            draft
          </option>
          <option value="published">
            published
          </option>
          <option value="archived">
            archived
          </option>
        </select>
      </div>
    </section>

    <section v-if="errorText" class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ errorText }}
    </section>
    <section v-if="successText" class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {{ successText }}
    </section>

    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <a-table
        :bordered="{ cell: true }"
        :data="pagedRows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="small"
      >
        <a-table-column title="标题">
          <template #cell="{ record }">
            <div class="min-w-0">
              <p class="m-0 truncate text-[12px] font-semibold text-slate-900">
                {{ record.title }}
              </p>
              <p class="m-0 mt-1 truncate font-mono text-[10px] text-slate-500">
                {{ record.slug }}
              </p>
            </div>
          </template>
        </a-table-column>
        <a-table-column title="分类" :width="120">
          <template #cell="{ record }">
            <span class="text-[11px] text-slate-700">{{ record.category }}</span>
          </template>
        </a-table-column>
        <a-table-column title="型号" :width="220">
          <template #cell="{ record }">
            <div class="text-[11px] text-slate-700">
              <div>{{ record.modelName }}</div>
              <div class="mt-1 text-slate-500">
                {{ record.brand || "-" }}
              </div>
            </div>
          </template>
        </a-table-column>
        <a-table-column title="屏幕尺寸" :width="140">
          <template #cell="{ record }">
            <span class="text-[11px] text-slate-700">{{ record.screenWidth }} × {{ record.screenHeight }}</span>
          </template>
        </a-table-column>
        <a-table-column title="状态" :width="110">
          <template #cell="{ record }">
            <a-tag :color="record.status === 'published' ? 'green' : record.status === 'archived' ? 'red' : 'gray'" size="small">
              {{ record.status }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="更新时间" :width="160">
          <template #cell="{ record }">
            <span class="text-[10px] text-slate-500">{{ formatDate(record.updatedAt || record.createdAt) }}</span>
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="280" fixed="right">
          <template #cell="{ record }">
            <div class="flex flex-wrap gap-2">
              <a-button size="mini" @click="void openEditDialog(record)">
                编辑
              </a-button>
              <a-button size="mini" @click="void openVariantsDialog(record)">
                变体
              </a-button>
              <a-button size="mini" type="primary" :disabled="record.status === 'published' || mutating" @click="void publishModel(record.id)">
                发布
              </a-button>
              <a-button size="mini" status="danger" :disabled="record.status === 'archived' || mutating" @click="void archiveModel(record.id)">
                归档
              </a-button>
            </div>
          </template>
        </a-table-column>
      </a-table>

      <div class="mt-3 flex justify-end">
        <a-pagination
          :current="page"
          :page-size="pageSize"
          :page-size-options="[10, 20, 50]"
          :show-total="true"
          :total="models.length"
          size="small"
          @change="(value: number) => page = value"
          @page-size-change="(value: number) => { pageSize = value; page = 1 }"
        />
      </div>
    </section>

    <a-modal
      v-model:visible="createDialogVisible"
      :footer="false"
      title="新增 Mockup 型号"
      width="720px"
    >
      <div class="space-y-4">
        <div class="grid gap-3 md:grid-cols-2">
          <input
            v-model="createForm.title"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="text"
            placeholder="标题"
          />
          <input
            v-model="createForm.slug"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="text"
            placeholder="slug（可选）"
          />
          <select
            v-model="createForm.category"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
          >
            <option
              v-for="item in CATEGORY_OPTIONS"
              :key="item.key"
              :value="item.key"
            >
              {{ item.label }}
            </option>
          </select>
          <input
            v-model="createForm.brand"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="text"
            placeholder="品牌（可选）"
          />
          <input
            v-model="createForm.modelName"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300 md:col-span-2"
            type="text"
            placeholder="型号名"
          />
          <input
            v-model="createForm.screenWidth"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="number"
            min="1"
            placeholder="screenWidth"
          />
          <input
            v-model="createForm.screenHeight"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="number"
            min="1"
            placeholder="screenHeight"
          />
          <input
            v-model="createForm.sortOrder"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="number"
            min="0"
            placeholder="sortOrder"
          />
          <select
            v-model="createForm.defaultVariantSlotKey"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
          >
            <option
              v-for="slotKey in VARIANT_SLOT_KEYS"
              :key="slotKey"
              :value="slotKey"
            >
              {{ slotKey }}
            </option>
          </select>
        </div>
        <div class="flex justify-end gap-2">
          <a-button @click="createDialogVisible = false">
            取消
          </a-button>
          <a-button type="primary" :loading="mutating" @click="void createModel()">
            创建型号
          </a-button>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="editDialogVisible"
      :footer="false"
      title="编辑 Mockup 型号"
      width="720px"
    >
      <div v-if="detailLoading" class="py-8">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>
      </div>
      <div v-else-if="selectedDetail" class="space-y-4">
        <div class="grid gap-3 md:grid-cols-2">
          <input
            v-model="editForm.title"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="text"
            placeholder="标题"
          />
          <input
            v-model="editForm.slug"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="text"
            placeholder="slug"
          />
          <select
            v-model="editForm.category"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
          >
            <option
              v-for="item in CATEGORY_OPTIONS"
              :key="item.key"
              :value="item.key"
            >
              {{ item.label }}
            </option>
          </select>
          <input
            v-model="editForm.brand"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="text"
            placeholder="品牌（可选）"
          />
          <input
            v-model="editForm.modelName"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300 md:col-span-2"
            type="text"
            placeholder="型号名"
          />
          <input
            v-model="editForm.screenWidth"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="number"
            min="1"
          />
          <input
            v-model="editForm.screenHeight"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="number"
            min="1"
          />
          <input
            v-model="editForm.sortOrder"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
            type="number"
            min="0"
          />
          <select
            v-model="editForm.defaultVariantSlotKey"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-slate-300"
          >
            <option value="">
              不指定默认 variant
            </option>
            <option
              v-for="slotKey in VARIANT_SLOT_KEYS"
              :key="slotKey"
              :value="slotKey"
            >
              {{ slotKey }}
            </option>
          </select>
        </div>

        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p class="m-0">
            {{ selectedDetail.model.modelName }} · {{ selectedDetail.model.screenWidth }} × {{ selectedDetail.model.screenHeight }}
          </p>
          <p class="m-0 mt-1 text-xs text-slate-500">
            createdBy {{ selectedDetail.model.createdBy }} / updatedBy {{ selectedDetail.model.updatedBy }}
          </p>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="flex gap-2">
            <a-button :loading="mutating" @click="void saveSelectedModel()">
              保存型号
            </a-button>
            <a-button
              type="primary"
              :loading="mutating"
              :disabled="selectedDetail.model.status === 'published'"
              @click="void publishModel(selectedDetail.model.id)"
            >
              发布
            </a-button>
            <a-button
              status="danger"
              :loading="mutating"
              :disabled="selectedDetail.model.status === 'archived'"
              @click="void archiveModel(selectedDetail.model.id)"
            >
              归档
            </a-button>
          </div>
          <a-button @click="editDialogVisible = false">
            关闭
          </a-button>
        </div>
      </div>
      <div v-else class="py-6 text-sm text-slate-500">
        型号详情加载失败，请关闭后重试。
      </div>
    </a-modal>

    <a-modal
      v-model:visible="variantsDialogVisible"
      :footer="false"
      title="管理 4 个展示姿态"
      width="980px"
    >
      <div v-if="detailLoading" class="py-8">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>
      </div>
      <div v-else-if="selectedDetail" class="space-y-4">
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p class="m-0 font-semibold">
            {{ selectedDetail.model.title }}
          </p>
          <p class="m-0 mt-1 text-xs text-slate-500">
            仅允许绑定已发布的 `device_shell` 素材。壳素材上传入口已合并到“模板 / 素材”。
          </p>
        </div>

        <a-table
          :bordered="{ cell: true }"
          :data="selectedVariants"
          :pagination="false"
          row-key="slotKey"
          size="small"
        >
          <a-table-column title="槽位" :width="120">
            <template #cell="{ record }">
              <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                {{ record.slotKey }}
              </span>
            </template>
          </a-table-column>
          <a-table-column title="标题" :width="240">
            <template #cell="{ record }">
              <input
                :value="record.title"
                class="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none transition-colors focus:border-slate-300"
                type="text"
                @change="
                  patchVariant(record.slotKey, {
                    title: ($event.target as HTMLInputElement).value,
                  })
                "
              >
            </template>
          </a-table-column>
          <a-table-column title="启用" :width="90">
            <template #cell="{ record }">
              <a-switch
                :model-value="record.enabled"
                size="small"
                @change="(value: string | number | boolean) => patchVariant(record.slotKey, { enabled: Boolean(value) })"
              />
            </template>
          </a-table-column>
          <a-table-column title="壳素材">
            <template #cell="{ record }">
              <select
                :value="record.shellAssetItemId || ''"
                class="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none transition-colors focus:border-slate-300"
                @change="
                  (() => {
                    const nextItemId = normalizeString(($event.target as HTMLSelectElement).value);
                    const matchedItem = publishedShellAssets.find(
                      (item) => item.id === nextItemId,
                    );
                    patchVariant(record.slotKey, {
                      shellAssetItemId: nextItemId || null,
                      shellAssetVersionId: matchedItem?.publishedVersionId || null,
                    });
                  })()
                "
              >
                <option value="">
                  未绑定壳素材
                </option>
                <option
                  v-for="item in publishedShellAssets"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.title }}
                </option>
              </select>
            </template>
          </a-table-column>
          <a-table-column title="当前绑定" :width="220">
            <template #cell="{ record }">
              <span class="text-[11px] text-slate-600">
                {{ resolveShellItemLabel(record.shellAssetItemId) }}
              </span>
            </template>
          </a-table-column>
        </a-table>

        <div class="flex justify-end">
          <a-button @click="variantsDialogVisible = false">
            关闭
          </a-button>
        </div>
      </div>
      <div v-else class="py-6 text-sm text-slate-500">
        变体详情加载失败，请关闭后重试。
      </div>
    </a-modal>
  </div>
</template>
