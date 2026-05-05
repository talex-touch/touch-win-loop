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
} from '~~/shared/types/domain'

interface CanvasLibraryDetail {
  item: CanvasLibraryItem
  draftVersion: CanvasLibraryItemVersion | null
  publishedVersion: CanvasLibraryItemVersion | null
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
// Contract anchors for source-level regression tests:
// "/admin/canvas-library/items"
// "/admin/canvas-library/assets/upload"

const loading = ref(false)
const mutating = ref(false)
const detailLoading = ref(false)
const errorText = ref('')
const successText = ref('')
const items = ref<CanvasLibraryItem[]>([])
const page = ref(1)
const pageSize = ref(10)
const createDialogVisible = ref(false)
const editDialogVisible = ref(false)
const editDetail = ref<CanvasLibraryDetail | null>(null)

const filters = reactive({
  status: '' as CanvasLibraryItemStatus | '',
  kind: '' as CanvasLibraryItemKind | '',
  source: '',
  search: '',
  assetKind: '' as CanvasLibraryAssetKind | '',
})

const createForm = reactive({
  mode: 'template' as CanvasLibraryItemKind,
  title: '',
  summary: '',
  slug: '',
  tags: '',
  templateTarget: 'scene' as CanvasLibraryTemplateTarget,
  assetKind: 'image' as CanvasLibraryAssetKind,
  publishNow: true,
  payloadText: '',
  assetViewportRect: '{"x":0,"y":0,"width":0,"height":0}',
  assetCornerRadius: '0',
  assetPresetKeys: '',
})

const itemKindOptions = [
  { value: '', label: '全部类型' },
  { value: 'template', label: 'template' },
  { value: 'asset', label: 'asset' },
] as const

const assetKindFilterOptions = [
  { value: '', label: '全部素材子类' },
  { value: 'image', label: 'image' },
  { value: 'svg', label: 'svg' },
  { value: 'device_shell', label: 'device_shell' },
] as const

const itemStatusOptions = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: 'draft' },
  { value: 'published', label: 'published' },
  { value: 'archived', label: 'archived' },
] as const

const sourceFilterOptions = [
  { value: '', label: '全部来源' },
  { value: 'admin_upload', label: 'admin_upload' },
  { value: 'design_publish', label: 'design_publish' },
] as const

const templateTargetOptions = [
  { value: 'scene', label: 'scene' },
  { value: 'page', label: 'page' },
  { value: 'frame', label: 'frame' },
] as const

const assetKindOptions = [
  { value: 'image', label: 'image' },
  { value: 'svg', label: 'svg' },
  { value: 'device_shell', label: 'device_shell' },
] as const

const createAssetFile = ref<File | null>(null)
const createAssetInputRef = ref<HTMLInputElement | null>(null)

const editForm = reactive({
  itemId: '',
  title: '',
  summary: '',
  slug: '',
  tags: '',
  payloadType: 'scene_document' as CanvasLibraryItemPayloadType,
  payloadText: '',
})

const selectedEditableVersion = computed(() => {
  return editDetail.value?.draftVersion || editDetail.value?.publishedVersion || null
})

const selectedAssetPreviewUrl = computed(() => {
  const itemId = editDetail.value?.item.id || ''
  const version = selectedEditableVersion.value
  if (!itemId || !version || version.payloadType !== 'binary_asset')
    return ''
  return endpoint(
    `/admin/canvas-library/items/${encodeURIComponent(itemId)}/asset`,
  )
})

const filteredRows = computed(() => {
  if (!filters.assetKind)
    return items.value
  return items.value.filter(item => item.assetKind === filters.assetKind)
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function formatDate(value?: string): string {
  return normalizeString(value).replace('T', ' ').slice(0, 16) || '-'
}

function parseJsonText<T = unknown>(value: string, fieldLabel: string): T {
  const text = value.trim()
  if (!text)
    throw new Error(`${fieldLabel} 不能为空。`)
  try {
    return JSON.parse(text) as T
  }
  catch {
    throw new Error(`${fieldLabel} 不是合法 JSON。`)
  }
}

function buildTagList(value: string): string[] {
  return value
    .split(/[，,\n]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function resetCreateAssetInput(): void {
  createAssetFile.value = null
  if (createAssetInputRef.value)
    createAssetInputRef.value.value = ''
}

function resetCreateForm(): void {
  createForm.mode = 'template'
  createForm.title = ''
  createForm.summary = ''
  createForm.slug = ''
  createForm.tags = ''
  createForm.templateTarget = 'scene'
  createForm.assetKind = 'image'
  createForm.publishNow = true
  createForm.payloadText = ''
  createForm.assetViewportRect = '{"x":0,"y":0,"width":0,"height":0}'
  createForm.assetCornerRadius = '0'
  createForm.assetPresetKeys = ''
  resetCreateAssetInput()
}

function syncEditForm(detail: CanvasLibraryDetail | null): void {
  const editableVersion = detail?.draftVersion || detail?.publishedVersion || null
  editForm.itemId = detail?.item.id || ''
  editForm.title = detail?.item.title || ''
  editForm.summary = detail?.item.summary || ''
  editForm.slug = detail?.item.slug || ''
  editForm.tags = (detail?.item.tags || []).join(', ')
  editForm.payloadType = editableVersion?.payloadType || 'scene_document'
  editForm.payloadText = editableVersion
    ? JSON.stringify(editableVersion.payload, null, 2)
    : ''
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(path), {
    credentials: 'include',
    ...init,
  })
  const result = (await response.json().catch(() => null)) as ApiResponse<T> | null
  if (!response.ok || !result || result.code !== 0)
    throw new Error(String(result?.message || '请求失败。'))
  return result.data
}

async function inspectImageFile(file: File): Promise<{ width: number, height: number }> {
  if (!import.meta.client || !file.type.startsWith('image/'))
    return { width: 0, height: 0 }

  return await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () =>
        resolve({
          width: Number(image.naturalWidth || image.width || 0),
          height: Number(image.naturalHeight || image.height || 0),
        })
      image.onerror = () => resolve({ width: 0, height: 0 })
      image.src = String(reader.result || '')
    }
    reader.onerror = () => resolve({ width: 0, height: 0 })
    reader.readAsDataURL(file)
  })
}

async function loadItems(): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    const query = new URLSearchParams()
    if (filters.status)
      query.set('status', filters.status)
    if (filters.kind)
      query.set('kind', filters.kind)
    if (filters.source)
      query.set('source', filters.source)
    if (filters.search.trim())
      query.set('search', filters.search.trim())
    items.value = await apiRequest<CanvasLibraryItem[]>(
      `/admin/canvas-library/items${query.size ? `?${query.toString()}` : ''}`,
    )
  }
  catch (error: any) {
    items.value = []
    errorText.value = String(error?.message || '画布资源库条目加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function loadItemDetail(itemId: string): Promise<CanvasLibraryDetail> {
  return await apiRequest<CanvasLibraryDetail>(
    `/admin/canvas-library/items/${encodeURIComponent(itemId)}`,
  )
}

function openCreateDialog(): void {
  successText.value = ''
  errorText.value = ''
  resetCreateForm()
  createDialogVisible.value = true
}

async function openEditDialog(item: CanvasLibraryItem): Promise<void> {
  detailLoading.value = true
  errorText.value = ''
  successText.value = ''
  editDialogVisible.value = true
  try {
    editDetail.value = await loadItemDetail(item.id)
    syncEditForm(editDetail.value)
  }
  catch (error: any) {
    editDialogVisible.value = false
    editDetail.value = null
    errorText.value = String(error?.message || '条目详情加载失败。')
  }
  finally {
    detailLoading.value = false
  }
}

async function createLibraryItem(): Promise<void> {
  mutating.value = true
  errorText.value = ''
  successText.value = ''
  try {
    if (!createForm.title.trim())
      throw new Error('标题不能为空。')

    if (createForm.mode === 'template') {
      const payload = parseJsonText(createForm.payloadText, '模板 payload')
      const payloadType: CanvasLibraryItemPayloadType
        = createForm.templateTarget === 'scene' ? 'scene_document' : 'design_fragment'
      await apiRequest<CanvasLibraryDetail>('/admin/canvas-library/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: createForm.title.trim(),
          slug: createForm.slug.trim(),
          summary: createForm.summary.trim(),
          kind: 'template',
          templateTarget: createForm.templateTarget,
          tags: buildTagList(createForm.tags),
          payloadType,
          payload,
          previewPayload: payload,
          publish: createForm.publishNow,
        }),
      })
    }
    else {
      if (!createAssetFile.value)
        throw new Error('请先选择要上传的素材文件。')

      const dimensions = await inspectImageFile(createAssetFile.value)
      const formData = new FormData()
      formData.set('file', createAssetFile.value)
      formData.set('assetKind', createForm.assetKind)
      formData.set('width', String(dimensions.width || 0))
      formData.set('height', String(dimensions.height || 0))
      if (createForm.assetKind === 'device_shell') {
        formData.set('viewportRect', createForm.assetViewportRect.trim() || '{}')
        formData.set('cornerRadius', createForm.assetCornerRadius.trim() || '0')
        formData.set('presetKeys', createForm.assetPresetKeys.trim())
      }
      const uploaded = await apiRequest<{
        assetKind: CanvasLibraryAssetKind
        payload: Record<string, unknown>
      }>('/admin/canvas-library/assets/upload', {
        method: 'POST',
        body: formData,
      })

      await apiRequest<CanvasLibraryDetail>('/admin/canvas-library/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: createForm.title.trim(),
          slug: createForm.slug.trim(),
          summary: createForm.summary.trim(),
          kind: 'asset',
          assetKind: uploaded.assetKind,
          tags: buildTagList(createForm.tags),
          payloadType: 'binary_asset',
          payload: uploaded.payload,
          previewPayload: {},
          publish: createForm.publishNow,
        }),
      })
    }

    createDialogVisible.value = false
    resetCreateForm()
    successText.value = '条目创建成功。'
    await loadItems()
  }
  catch (error: any) {
    errorText.value = String(error?.message || '创建条目失败。')
  }
  finally {
    mutating.value = false
  }
}

async function saveSelectedItem(): Promise<void> {
  const itemId = normalizeString(editForm.itemId)
  if (!itemId)
    return

  mutating.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const nextPayload = editForm.payloadText.trim()
      ? parseJsonText(editForm.payloadText, '版本 payload')
      : undefined

    await apiRequest(
      `/admin/canvas-library/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: editForm.title.trim(),
          slug: editForm.slug.trim(),
          summary: editForm.summary.trim(),
          tags: buildTagList(editForm.tags),
          payloadType: nextPayload !== undefined ? editForm.payloadType : undefined,
          payload: nextPayload,
          previewPayload: nextPayload,
        }),
      },
    )

    editDetail.value = await loadItemDetail(itemId)
    syncEditForm(editDetail.value)
    successText.value = '条目保存成功。'
    editDialogVisible.value = false
    await loadItems()
  }
  catch (error: any) {
    errorText.value = String(error?.message || '保存条目失败。')
  }
  finally {
    mutating.value = false
  }
}

async function publishItem(itemId: string): Promise<void> {
  mutating.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await apiRequest(
      `/admin/canvas-library/items/${encodeURIComponent(itemId)}/publish`,
      {
        method: 'POST',
      },
    )
    if (editForm.itemId === itemId) {
      editDetail.value = await loadItemDetail(itemId)
      syncEditForm(editDetail.value)
    }
    successText.value = '条目发布成功。'
    await loadItems()
  }
  catch (error: any) {
    errorText.value = String(error?.message || '发布失败。')
  }
  finally {
    mutating.value = false
  }
}

async function archiveItem(itemId: string): Promise<void> {
  mutating.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await apiRequest(
      `/admin/canvas-library/items/${encodeURIComponent(itemId)}/archive`,
      {
        method: 'POST',
      },
    )
    if (editForm.itemId === itemId) {
      editDetail.value = await loadItemDetail(itemId)
      syncEditForm(editDetail.value)
    }
    successText.value = '条目归档成功。'
    await loadItems()
  }
  catch (error: any) {
    errorText.value = String(error?.message || '归档失败。')
  }
  finally {
    mutating.value = false
  }
}

function handleCreateAssetFileChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  createAssetFile.value = input?.files?.[0] || null
}

watch(
  () => [filters.status, filters.kind, filters.source, filters.search] as const,
  () => {
    page.value = 1
    void loadItems()
  },
  { immediate: true },
)

watch([filteredRows, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 class="text-sm text-slate-900 font-semibold">
            模板 / 素材列表
          </h2>
          <p class="text-xs text-slate-500 leading-5 mt-1">
            统一维护 Scene / Page / Frame 模板与素材条目。`device_shell` 也在这里创建，供 Mockup 型号绑定。
          </p>
        </div>
        <a-button type="primary" size="small" @click="openCreateDialog">
          新增条目
        </a-button>
      </div>

      <div class="mt-4 gap-3 grid md:grid-cols-5">
        <input
          v-model="filters.search"
          class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300 md:col-span-2"
          type="search"
          placeholder="搜索标题 / slug / 摘要"
        >
        <UiSelect v-model="filters.kind" :options="itemKindOptions" size="sm" aria-label="类型" />
        <UiSelect v-model="filters.assetKind" :options="assetKindFilterOptions" size="sm" aria-label="素材子类" />
        <UiSelect v-model="filters.status" :options="itemStatusOptions" size="sm" aria-label="状态" />
        <UiSelect v-model="filters.source" :options="sourceFilterOptions" size="sm" aria-label="来源" />
      </div>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 px-4 py-3 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
    <section v-if="successText" class="text-sm text-emerald-700 px-4 py-3 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ successText }}
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-table
        :bordered="{ cell: true }"
        :data="pagedRows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="small"
      >
        <template #columns>
          <a-table-column title="标题" data-index="title">
            <template #cell="scope">
              <div class="min-w-0">
                <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                  {{ scope.record.title }}
                </p>
                <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                  {{ scope.record.slug }}
                </p>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="类型" data-index="kind" :width="190">
            <template #cell="scope">
              <div class="text-[11px] text-slate-700">
                <div>{{ scope.record.kind }}</div>
                <div class="text-slate-500 mt-1">
                  {{ scope.record.templateTarget || scope.record.assetKind || "-" }}
                </div>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="状态" data-index="status" :width="110">
            <template #cell="scope">
              <a-tag :color="scope.record.status === 'published' ? 'green' : scope.record.status === 'archived' ? 'red' : 'gray'" size="small">
                {{ scope.record.status }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="来源" data-index="source" :width="130">
            <template #cell="scope">
              <span class="text-[11px] text-slate-600">{{ scope.record.source }}</span>
            </template>
          </a-table-column>
          <a-table-column title="标签" data-index="tags">
            <template #cell="scope">
              <div class="flex flex-wrap gap-1">
                <a-tag
                  v-for="tag in (scope.record.tags.length ? scope.record.tags : ['-'])"
                  :key="`${scope.record.id}-${tag}`"
                  bordered
                  size="small"
                >
                  {{ tag }}
                </a-tag>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="更新时间" data-index="updatedAt" :width="160">
            <template #cell="scope">
              <span class="text-[10px] text-slate-500">{{ formatDate(scope.record.updatedAt || scope.record.createdAt) }}</span>
            </template>
          </a-table-column>
          <a-table-column title="操作" data-index="actions" :width="240" fixed="right">
            <template #cell="scope">
              <div class="flex flex-wrap gap-2">
                <a-button size="mini" @click="void openEditDialog(scope.record)">
                  编辑
                </a-button>
                <a-button size="mini" type="primary" :disabled="scope.record.status === 'published' || mutating" @click="void publishItem(scope.record.id)">
                  发布
                </a-button>
                <a-button size="mini" status="danger" :disabled="scope.record.status === 'archived' || mutating" @click="void archiveItem(scope.record.id)">
                  归档
                </a-button>
              </div>
            </template>
          </a-table-column>
        </template>
      </a-table>

      <div class="mt-3 flex justify-end">
        <a-pagination
          :current="page"
          :page-size="pageSize"
          :page-size-options="[10, 20, 50]"
          :show-total="true"
          :total="filteredRows.length"
          size="small"
          @change="(value: number) => page = value"
          @page-size-change="(value: number) => { pageSize = value; page = 1 }"
        />
      </div>
    </section>

    <a-modal
      v-model:visible="createDialogVisible"
      :footer="false"
      title="新增条目"
      width="860px"
    >
      <div class="space-y-4">
        <div class="flex gap-2">
          <button
            class="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
            :class="createForm.mode === 'template' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'"
            type="button"
            @click="createForm.mode = 'template'"
          >
            Template
          </button>
          <button
            class="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
            :class="createForm.mode === 'asset' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'"
            type="button"
            @click="createForm.mode = 'asset'"
          >
            Asset
          </button>
        </div>

        <div class="gap-3 grid md:grid-cols-2">
          <input
            v-model="createForm.title"
            class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300"
            type="text"
            placeholder="标题"
          >
          <input
            v-model="createForm.slug"
            class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300"
            type="text"
            placeholder="slug（可选）"
          >
          <textarea
            v-model="createForm.summary"
            class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white min-h-[80px] transition-colors focus:border-slate-300 md:col-span-2"
            placeholder="摘要"
          />
          <input
            v-model="createForm.tags"
            class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300 md:col-span-2"
            type="text"
            placeholder="标签，逗号分隔"
          >
        </div>

        <div v-if="createForm.mode === 'template'" class="space-y-3">
          <UiSelect v-model="createForm.templateTarget" :options="templateTargetOptions" size="sm" aria-label="模板目标" class="w-full" />
          <textarea
            v-model="createForm.payloadText"
            class="text-xs text-slate-100 leading-6 font-mono px-3 py-3 outline-none border border-slate-200 rounded-lg bg-slate-950 min-h-[260px] w-full transition-colors focus:border-slate-400"
            placeholder="粘贴 SceneDocument JSON 或 design fragment JSON"
          />
        </div>

        <div v-else class="space-y-3">
          <UiSelect v-model="createForm.assetKind" :options="assetKindOptions" size="sm" aria-label="素材类型" class="w-full" />
          <input
            ref="createAssetInputRef"
            class="text-sm text-slate-700 px-3 py-2 border border-slate-200 rounded-lg bg-white w-full"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            @change="handleCreateAssetFileChange"
          >
          <template v-if="createForm.assetKind === 'device_shell'">
            <textarea
              v-model="createForm.assetViewportRect"
              class="text-xs text-slate-100 leading-6 font-mono px-3 py-3 outline-none border border-slate-200 rounded-lg bg-slate-950 min-h-[88px] w-full transition-colors focus:border-slate-400"
              placeholder="{&quot;x&quot;:0,&quot;y&quot;:0,&quot;width&quot;:1179,&quot;height&quot;:2556}"
            />
            <div class="gap-3 grid md:grid-cols-2">
              <input
                v-model="createForm.assetCornerRadius"
                class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300"
                type="number"
                placeholder="cornerRadius"
              >
              <input
                v-model="createForm.assetPresetKeys"
                class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300"
                type="text"
                placeholder="presetKeys，逗号分隔"
              >
            </div>
          </template>
        </div>

        <div class="flex gap-3 items-center justify-between">
          <label class="text-sm text-slate-600 flex gap-2 items-center">
            <input v-model="createForm.publishNow" type="checkbox">
            创建后立即发布
          </label>
          <div class="flex gap-2">
            <a-button @click="createDialogVisible = false">
              取消
            </a-button>
            <a-button type="primary" :loading="mutating" @click="void createLibraryItem()">
              创建条目
            </a-button>
          </div>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="editDialogVisible"
      :footer="false"
      title="编辑条目"
      width="860px"
    >
      <div v-if="detailLoading" class="py-8">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>
      </div>
      <div v-else-if="editDetail" class="space-y-4">
        <div class="gap-3 grid md:grid-cols-2">
          <input
            v-model="editForm.title"
            class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300"
            type="text"
            placeholder="标题"
          >
          <input
            v-model="editForm.slug"
            class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300"
            type="text"
            placeholder="slug"
          >
          <textarea
            v-model="editForm.summary"
            class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white min-h-[80px] transition-colors focus:border-slate-300 md:col-span-2"
            placeholder="摘要"
          />
          <input
            v-model="editForm.tags"
            class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded-lg bg-white transition-colors focus:border-slate-300 md:col-span-2"
            type="text"
            placeholder="标签，逗号分隔"
          >
        </div>

        <div class="text-sm text-slate-700 p-3 border border-slate-200 rounded-lg bg-slate-50">
          <p class="m-0">
            draft: <span class="font-semibold">{{ editDetail.draftVersion?.version || "-" }}</span>
            · published: <span class="font-semibold">{{ editDetail.publishedVersion?.version || "-" }}</span>
          </p>
          <p class="text-xs text-slate-500 m-0 mt-1">
            {{ editDetail.item.kind }} / {{ editDetail.item.templateTarget || editDetail.item.assetKind || "-" }}
          </p>
        </div>

        <textarea
          v-model="editForm.payloadText"
          class="text-xs text-slate-100 leading-6 font-mono px-3 py-3 outline-none border border-slate-200 rounded-lg bg-slate-950 min-h-[260px] w-full transition-colors focus:border-slate-400"
          placeholder="payload JSON"
        />

        <div class="p-3 border border-slate-200 rounded-lg bg-slate-50">
          <p class="text-xs text-slate-500 font-semibold">
            预览
          </p>
          <div v-if="selectedAssetPreviewUrl" class="mt-3 p-3 border border-slate-200 rounded-lg bg-white">
            <img :src="selectedAssetPreviewUrl" alt="" class="rounded max-h-[320px] w-full object-contain">
          </div>
          <pre
            v-else
            class="text-xs text-slate-100 leading-6 mt-3 px-3 py-3 border border-slate-200 rounded-lg bg-slate-950 overflow-auto"
          >{{ JSON.stringify(selectedEditableVersion?.previewPayload || selectedEditableVersion?.payload || {}, null, 2) }}</pre>
        </div>

        <div class="flex gap-3 items-center justify-between">
          <div class="flex gap-2">
            <a-button :loading="mutating" @click="void saveSelectedItem()">
              保存草稿
            </a-button>
            <a-button
              type="primary"
              :loading="mutating"
              :disabled="editDetail.item.status === 'published'"
              @click="void publishItem(editDetail.item.id)"
            >
              发布
            </a-button>
            <a-button
              status="danger"
              :loading="mutating"
              :disabled="editDetail.item.status === 'archived'"
              @click="void archiveItem(editDetail.item.id)"
            >
              归档
            </a-button>
          </div>
          <a-button @click="editDialogVisible = false">
            关闭
          </a-button>
        </div>
      </div>
      <div v-else class="text-sm text-slate-500 py-6">
        条目详情加载失败，请关闭后重试。
      </div>
    </a-modal>
  </div>
</template>
