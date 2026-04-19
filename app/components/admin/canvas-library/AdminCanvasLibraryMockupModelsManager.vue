<script setup lang="ts">
import type { RequestOption, UploadRequest } from '@arco-design/web-vue'
import type {
  ApiResponse,
  CanvasLibraryAssetKind,
  CanvasLibraryItem,
  DeviceFramePreset,
  MockupDeviceCategory,
  MockupDeviceModel,
  MockupDeviceModelStatus,
  MockupDeviceVariant,
  MockupVariantSlotKey,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'
import { createMockupDevicePresetKey } from '~~/shared/utils/mockup-device-catalog'
import { DEVICE_FRAME_PRESETS } from '~~/shared/utils/scene-document'
import AdminCanvasLibraryMockupPreviewUploadCard from '~/components/admin/canvas-library/AdminCanvasLibraryMockupPreviewUploadCard.vue'

const emit = defineEmits<{
  openLibraryItems: []
}>()

interface MockupModelDetail {
  model: MockupDeviceModel
  variants: MockupDeviceVariant[]
}

interface CanvasLibraryDetail {
  item: CanvasLibraryItem
  draftVersion: { id: string } | null
  publishedVersion: { id: string } | null
}

interface AssetBindingPatch {
  itemId: string | null
  versionId: string | null
}

interface MockupFormState {
  modelId: string
  presetKey: string
  sizePresetKey: string
  category: MockupDeviceCategory
  brand: string
  modelName: string
  screenWidth: number
  screenHeight: number
  previewAssetItemId: string
  previewAssetVersionId: string
}

interface ModelPresetOption {
  key: string
  label: string
  category: MockupDeviceCategory
  group: string
  modelName: string
  screenWidth: number
  screenHeight: number
  screenRadius: number
}

interface ShellViewportRect {
  x: number
  y: number
  width: number
  height: number
}

interface PendingVariantShellUpload {
  slotKey: MockupVariantSlotKey
  variantTitle: string
  file: File | null
  fileName: string
  imageWidth: number
  imageHeight: number
  viewportRect: ShellViewportRect
  cornerRadius: number
  requestOption: RequestOption | null
  abortController: AbortController | null
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const PREVIEW_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml'
const DEFAULT_SCREEN_WIDTH = 1179
const DEFAULT_SCREEN_HEIGHT = 2556
const MAINSTREAM_BRANDS = [
  'Apple',
  'Samsung',
  'Google',
  'Xiaomi',
  'HUAWEI',
  'HONOR',
  'OPPO',
  'vivo',
  'OnePlus',
  'Lenovo',
  'Microsoft',
  'ASUS',
  'Sony',
  'DJI',
] as const

const CATEGORY_OPTIONS: Array<{
  key: MockupDeviceCategory
  label: string
}> = [
  { key: 'phone', label: '手机' },
  { key: 'tablet', label: '平板' },
  { key: 'desktop', label: '电脑' },
  { key: 'watch', label: '手表' },
  { key: 'earbuds', label: '耳机' },
  { key: 'glasses', label: '眼镜 / XR' },
  { key: 'browser', label: '浏览器' },
]

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.trunc(parsed)
}

function resolvePresetCategory(preset: Pick<DeviceFramePreset, 'deviceFamily'>): MockupDeviceCategory {
  if (preset.deviceFamily === 'tablet')
    return 'tablet'
  if (preset.deviceFamily === 'desktop')
    return 'desktop'
  if (preset.deviceFamily === 'watch')
    return 'watch'
  if (preset.deviceFamily === 'browser')
    return 'browser'
  return 'phone'
}

const MODEL_PRESET_OPTIONS: ModelPresetOption[] = DEVICE_FRAME_PRESETS.map((preset) => {
  return {
    key: preset.key,
    label: `${preset.title} · ${preset.screenWidth} × ${preset.screenHeight}`,
    category: resolvePresetCategory(preset),
    group: preset.group,
    modelName: preset.title,
    screenWidth: preset.screenWidth,
    screenHeight: preset.screenHeight,
    screenRadius: Math.max(0, toInteger(preset.screenRadius, 0)),
  }
})

const loading = ref(false)
const mutating = ref(false)
const detailLoading = ref(false)
const createPreviewUploading = ref(false)
const editPreviewUploading = ref(false)
const createConfirmVisible = ref(false)
const detailErrorText = ref('')
const models = ref<MockupDeviceModel[]>([])
const assetLibraryItems = ref<CanvasLibraryItem[]>([])
const page = ref(1)
const pageSize = ref(10)
const createDialogVisible = ref(false)
const editDialogVisible = ref(false)
const variantsDialogVisible = ref(false)
const shellUploadConfirmVisible = ref(false)
const shellUploadSubmitting = ref(false)
const selectedDetail = ref<MockupModelDetail | null>(null)
const variantPreviewUploading = reactive<Record<string, boolean>>({})
const variantShellUploading = reactive<Record<string, boolean>>({})
const variantTitleDrafts = reactive<Record<string, string>>({})

const pendingVariantShellUpload = reactive<PendingVariantShellUpload>({
  slotKey: '',
  variantTitle: '',
  file: null,
  fileName: '',
  imageWidth: 0,
  imageHeight: 0,
  viewportRect: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  },
  cornerRadius: 0,
  requestOption: null,
  abortController: null,
})

const filters = reactive({
  category: '' as MockupDeviceCategory | '',
  status: '' as MockupDeviceModelStatus | '',
  search: '',
})

const createForm = reactive<MockupFormState>({
  modelId: '',
  presetKey: '',
  sizePresetKey: '',
  category: 'phone',
  brand: '',
  modelName: '',
  screenWidth: DEFAULT_SCREEN_WIDTH,
  screenHeight: DEFAULT_SCREEN_HEIGHT,
  previewAssetItemId: '',
  previewAssetVersionId: '',
})

const editForm = reactive<MockupFormState>({
  modelId: '',
  presetKey: '',
  sizePresetKey: '',
  category: 'phone',
  brand: '',
  modelName: '',
  screenWidth: DEFAULT_SCREEN_WIDTH,
  screenHeight: DEFAULT_SCREEN_HEIGHT,
  previewAssetItemId: '',
  previewAssetVersionId: '',
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return models.value.slice(start, start + pageSize.value)
})

const assetItemMap = computed(() => {
  const map = new Map<string, CanvasLibraryItem>()
  for (const item of assetLibraryItems.value)
    map.set(item.id, item)
  return map
})

const selectedVariants = computed<MockupDeviceVariant[]>(() => {
  return [...(selectedDetail.value?.variants || [])].sort((left, right) => {
    return left.sortOrder - right.sortOrder || left.slotKey.localeCompare(right.slotKey)
  })
})

const publishedShellAssets = computed(() => {
  return assetLibraryItems.value.filter(
    item =>
      item.kind === 'asset'
      && item.assetKind === 'device_shell'
      && item.status === 'published'
      && normalizeString(item.publishedVersionId),
  )
})

function resolveModelPresetOption(presetKey: string): ModelPresetOption | null {
  const normalizedKey = normalizeString(presetKey)
  if (!normalizedKey)
    return null
  return MODEL_PRESET_OPTIONS.find(item => item.key === normalizedKey) || null
}

function matchesModelPreset(form: MockupFormState, preset: ModelPresetOption): boolean {
  return preset.category === form.category
    && normalizeString(form.modelName).toLowerCase() === normalizeString(preset.modelName).toLowerCase()
    && toInteger(form.screenWidth, 0) === preset.screenWidth
    && toInteger(form.screenHeight, 0) === preset.screenHeight
}

function matchesSizePreset(form: MockupFormState, preset: ModelPresetOption): boolean {
  return toInteger(form.screenWidth, 0) === preset.screenWidth
    && toInteger(form.screenHeight, 0) === preset.screenHeight
}

function resolveMatchedModelPresetKey(form: MockupFormState): string {
  const currentPreset = resolveModelPresetOption(form.presetKey)
  if (currentPreset && matchesModelPreset(form, currentPreset))
    return currentPreset.key
  return MODEL_PRESET_OPTIONS.find(item => matchesModelPreset(form, item))?.key || ''
}

function resolveMatchedSizePresetKey(form: MockupFormState): string {
  const currentPreset = resolveModelPresetOption(form.sizePresetKey)
  if (currentPreset && matchesSizePreset(form, currentPreset))
    return currentPreset.key
  return MODEL_PRESET_OPTIONS.find(item => matchesSizePreset(form, item))?.key || ''
}

function syncFormPresetSelections(form: MockupFormState): void {
  form.presetKey = resolveMatchedModelPresetKey(form)
  form.sizePresetKey = resolveMatchedSizePresetKey(form)
}

function applyModelPreset(form: MockupFormState, presetKey: string | number | boolean): void {
  const preset = resolveModelPresetOption(String(presetKey || ''))
  if (!preset) {
    form.presetKey = ''
    return
  }
  form.category = preset.category
  form.modelName = preset.modelName
  form.screenWidth = preset.screenWidth
  form.screenHeight = preset.screenHeight
  form.presetKey = preset.key
  form.sizePresetKey = preset.key
}

function applySizePreset(form: MockupFormState, presetKey: string | number | boolean): void {
  const preset = resolveModelPresetOption(String(presetKey || ''))
  if (!preset) {
    form.sizePresetKey = ''
    return
  }
  form.screenWidth = preset.screenWidth
  form.screenHeight = preset.screenHeight
  form.sizePresetKey = preset.key
}

function formatDate(value?: string): string {
  return normalizeString(value).replace('T', ' ').slice(0, 16) || '-'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function resolveCategoryLabel(category: MockupDeviceCategory): string {
  return CATEGORY_OPTIONS.find(item => item.key === category)?.label || category
}

function notifySuccess(message: string): void {
  if (normalizeString(message))
    Message.success(message)
}

function notifyError(message: string): void {
  if (normalizeString(message))
    Message.error(message)
}

function formatVariantSlotLabel(slotKey: MockupVariantSlotKey): string {
  const normalized = normalizeString(slotKey)
  const matchedNumber = normalized.match(/^variant_(\d+)$/i)?.[1]
  if (matchedNumber)
    return `变体 ${matchedNumber}`
  return normalized || '-'
}

function resolveFormPresetSourceLabel(form: MockupFormState): string {
  const preset = resolveModelPresetOption(form.presetKey)
  return preset ? preset.label : '自定义型号'
}

function resolveFormSizeSourceLabel(form: MockupFormState): string {
  const preset = resolveModelPresetOption(form.sizePresetKey)
  return preset ? preset.label : '自定义尺寸'
}

function resolveAssetItem(itemId?: string | null): CanvasLibraryItem | null {
  const normalizedId = normalizeString(itemId)
  if (!normalizedId)
    return null
  return assetItemMap.value.get(normalizedId) || null
}

function resolveAssetPreviewUrl(itemId?: string | null): string {
  const item = resolveAssetItem(itemId)
  if (!item)
    return ''
  return endpoint(`/admin/canvas-library/items/${encodeURIComponent(item.id)}/asset`)
}

function resolveAssetLabel(itemId: string | null | undefined, emptyLabel: string): string {
  return resolveAssetItem(itemId)?.title || emptyLabel
}

function resolveShellAssetBinding(itemId: string): AssetBindingPatch {
  const normalizedItemId = normalizeString(itemId)
  if (!normalizedItemId)
    return { itemId: null, versionId: null }

  const item = resolveAssetItem(normalizedItemId)
  if (
    !item
    || item.kind !== 'asset'
    || item.assetKind !== 'device_shell'
    || item.status !== 'published'
    || !normalizeString(item.publishedVersionId)
  ) {
    throw new Error('素材图必须选择已发布的 `device_shell` 素材。')
  }

  return {
    itemId: item.id,
    versionId: normalizeString(item.publishedVersionId) || null,
  }
}

function ensurePreviewBinding(
  itemId: string,
  versionId: string,
  fieldLabel: string,
): AssetBindingPatch {
  const normalizedItemId = normalizeString(itemId)
  const normalizedVersionId = normalizeString(versionId)
  if (!normalizedItemId || !normalizedVersionId)
    throw new Error(`请先手动上传${fieldLabel}。`)

  return {
    itemId: normalizedItemId,
    versionId: normalizedVersionId,
  }
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

function resolvePreviewAssetKind(file: File): Extract<CanvasLibraryAssetKind, 'image' | 'svg'> {
  const fileName = normalizeString(file.name).toLowerCase()
  const mimeType = normalizeString(file.type).toLowerCase()
  if (mimeType.includes('svg') || fileName.endsWith('.svg'))
    return 'svg'
  return 'image'
}

function buildModelPreviewAssetTitle(modelName: string, category: MockupDeviceCategory): string {
  const normalizedModelName = normalizeString(modelName)
  if (normalizedModelName)
    return `${normalizedModelName} 预览图`
  return `${resolveCategoryLabel(category)} Mockup 预览图`
}

function buildVariantPreviewAssetTitle(
  modelName: string,
  variantTitle: string,
  slotKey: MockupVariantSlotKey,
): string {
  const normalizedModelName = normalizeString(modelName) || 'Mockup 型号'
  const normalizedVariantTitle = normalizeString(variantTitle) || formatVariantSlotLabel(slotKey)
  return `${normalizedModelName} ${normalizedVariantTitle} 预览图`
}

function buildVariantShellAssetTitle(
  modelName: string,
  variantTitle: string,
  slotKey: MockupVariantSlotKey,
): string {
  const normalizedModelName = normalizeString(modelName) || 'Mockup 型号'
  const normalizedVariantTitle = normalizeString(variantTitle) || formatVariantSlotLabel(slotKey)
  return `${normalizedModelName} ${normalizedVariantTitle} 素材图`
}

function buildDefaultShellViewportRect(
  imageWidth: number,
  imageHeight: number,
  screenWidth: number,
  screenHeight: number,
): ShellViewportRect {
  const safeImageWidth = Math.max(1, toInteger(imageWidth, 1))
  const safeImageHeight = Math.max(1, toInteger(imageHeight, 1))
  const nextWidth = Math.max(1, Math.min(Math.max(1, toInteger(screenWidth, safeImageWidth)), safeImageWidth))
  const nextHeight = Math.max(1, Math.min(Math.max(1, toInteger(screenHeight, safeImageHeight)), safeImageHeight))
  return {
    x: Math.max(0, Math.trunc((safeImageWidth - nextWidth) / 2)),
    y: Math.max(0, Math.trunc((safeImageHeight - nextHeight) / 2)),
    width: nextWidth,
    height: nextHeight,
  }
}

function normalizeShellViewportRect(
  viewportRect: ShellViewportRect,
  imageWidth: number,
  imageHeight: number,
): ShellViewportRect {
  const safeImageWidth = Math.max(1, toInteger(imageWidth, 1))
  const safeImageHeight = Math.max(1, toInteger(imageHeight, 1))
  const width = Math.max(1, Math.min(toInteger(viewportRect.width, 1), safeImageWidth))
  const height = Math.max(1, Math.min(toInteger(viewportRect.height, 1), safeImageHeight))
  const x = Math.max(0, Math.min(toInteger(viewportRect.x, 0), Math.max(0, safeImageWidth - width)))
  const y = Math.max(0, Math.min(toInteger(viewportRect.y, 0), Math.max(0, safeImageHeight - height)))
  return { x, y, width, height }
}

function resetCreateForm(): void {
  createForm.modelId = ''
  createForm.presetKey = ''
  createForm.sizePresetKey = ''
  createForm.category = 'phone'
  createForm.brand = ''
  createForm.modelName = ''
  createForm.screenWidth = DEFAULT_SCREEN_WIDTH
  createForm.screenHeight = DEFAULT_SCREEN_HEIGHT
  createForm.previewAssetItemId = ''
  createForm.previewAssetVersionId = ''
  createPreviewUploading.value = false
  createConfirmVisible.value = false
}

function syncEditForm(detail: MockupModelDetail | null): void {
  editForm.modelId = detail?.model.id || ''
  editForm.presetKey = ''
  editForm.sizePresetKey = ''
  editForm.category = detail?.model.category || 'phone'
  editForm.brand = detail?.model.brand || ''
  editForm.modelName = detail?.model.modelName || ''
  editForm.screenWidth = Number(detail?.model.screenWidth || DEFAULT_SCREEN_WIDTH)
  editForm.screenHeight = Number(detail?.model.screenHeight || DEFAULT_SCREEN_HEIGHT)
  editForm.previewAssetItemId = detail?.model.previewAssetItemId || ''
  editForm.previewAssetVersionId = detail?.model.previewAssetVersionId || ''
  editPreviewUploading.value = false
  syncFormPresetSelections(editForm)
}

function resetPendingVariantShellUpload(): void {
  pendingVariantShellUpload.slotKey = ''
  pendingVariantShellUpload.variantTitle = ''
  pendingVariantShellUpload.file = null
  pendingVariantShellUpload.fileName = ''
  pendingVariantShellUpload.imageWidth = 0
  pendingVariantShellUpload.imageHeight = 0
  pendingVariantShellUpload.viewportRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }
  pendingVariantShellUpload.cornerRadius = 0
  pendingVariantShellUpload.requestOption = null
  pendingVariantShellUpload.abortController = null
}

function resetVariantLocalState(variants: MockupDeviceVariant[]): void {
  const activeKeys = new Set<string>()
  for (const variant of variants) {
    activeKeys.add(variant.slotKey)
    variantTitleDrafts[variant.slotKey] = variant.title
  }

  Object.keys(variantTitleDrafts).forEach((slotKey) => {
    if (!activeKeys.has(slotKey))
      delete variantTitleDrafts[slotKey]
  })
  Object.keys(variantPreviewUploading).forEach((slotKey) => {
    if (!activeKeys.has(slotKey))
      delete variantPreviewUploading[slotKey]
  })
  Object.keys(variantShellUploading).forEach((slotKey) => {
    if (!activeKeys.has(slotKey))
      delete variantShellUploading[slotKey]
  })
}

function createNextVariantSlotKey(): MockupVariantSlotKey {
  const existingKeys = selectedDetail.value?.variants.map(variant => normalizeString(variant.slotKey)) || []
  const maxIndex = existingKeys.reduce((currentMax, slotKey) => {
    const matched = slotKey.match(/^variant_(\d+)$/i)
    return matched ? Math.max(currentMax, Number(matched[1] || 0)) : currentMax
  }, 0)
  return `variant_${maxIndex + 1}`
}

function getVariantBySlotKey(slotKey: MockupVariantSlotKey): MockupDeviceVariant | null {
  return selectedVariants.value.find(variant => variant.slotKey === slotKey) || null
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

async function loadModels(): Promise<void> {
  loading.value = true
  try {
    const query = new URLSearchParams()
    if (filters.category)
      query.set('category', filters.category)
    if (filters.status)
      query.set('status', filters.status)
    if (filters.search.trim())
      query.set('search', filters.search.trim())
    models.value = await apiRequest<MockupDeviceModel[]>(
      `/admin/mockups/models${query.size ? `?${query.toString()}` : ''}`,
    )
  }
  catch (error: any) {
    models.value = []
    notifyError(String(error?.message || 'Mockup 型号目录加载失败。'))
  }
  finally {
    loading.value = false
  }
}

async function loadAssetLibraryItems(): Promise<void> {
  try {
    assetLibraryItems.value = await apiRequest<CanvasLibraryItem[]>(
      '/admin/canvas-library/items?kind=asset',
    )
  }
  catch (error: any) {
    notifyError(String(error?.message || '画布资源库素材加载失败。'))
  }
}

async function loadSelectedModel(modelId: string): Promise<MockupModelDetail> {
  return await apiRequest<MockupModelDetail>(
    `/admin/mockups/models/${encodeURIComponent(modelId)}`,
  )
}

async function createPreviewAssetBinding(
  input: {
    file: File
    title: string
    summary: string
    signal?: AbortSignal
  },
): Promise<AssetBindingPatch> {
  const dimensions = await inspectImageFile(input.file)
  const formData = new FormData()
  formData.set('file', input.file)
  formData.set('assetKind', resolvePreviewAssetKind(input.file))
  formData.set('width', String(dimensions.width || 0))
  formData.set('height', String(dimensions.height || 0))

  const uploaded = await apiRequest<{
    assetKind: CanvasLibraryAssetKind
    payload: Record<string, unknown>
  }>('/admin/canvas-library/assets/upload', {
    method: 'POST',
    body: formData,
    signal: input.signal,
  })

  const detail = await apiRequest<CanvasLibraryDetail>('/admin/canvas-library/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: input.title,
      summary: input.summary,
      kind: 'asset',
      assetKind: uploaded.assetKind,
      tags: ['mockup', 'preview'],
      payloadType: 'binary_asset',
      payload: uploaded.payload,
      previewPayload: {
        width: dimensions.width || undefined,
        height: dimensions.height || undefined,
      },
      publish: true,
    }),
    signal: input.signal,
  })

  await loadAssetLibraryItems()

  const versionId = normalizeString(
    detail.publishedVersion?.id || detail.item.publishedVersionId || detail.draftVersion?.id,
  )
  const itemId = normalizeString(detail.item.id)
  if (!itemId || !versionId)
    throw new Error('预览图上传成功，但绑定版本解析失败。')

  return {
    itemId,
    versionId,
  }
}

async function createShellAssetBinding(
  input: {
    file: File
    title: string
    summary: string
    viewportRect: ShellViewportRect
    cornerRadius: number
    presetKeys: string[]
    signal?: AbortSignal
  },
): Promise<AssetBindingPatch> {
  const dimensions = await inspectImageFile(input.file)
  const normalizedViewportRect = normalizeShellViewportRect(
    input.viewportRect,
    dimensions.width || input.viewportRect.width,
    dimensions.height || input.viewportRect.height,
  )
  const formData = new FormData()
  formData.set('file', input.file)
  formData.set('assetKind', 'device_shell')
  formData.set('width', String(dimensions.width || 0))
  formData.set('height', String(dimensions.height || 0))
  formData.set('viewportRect', JSON.stringify(normalizedViewportRect))
  formData.set('cornerRadius', String(Math.max(0, toInteger(input.cornerRadius, 0))))
  formData.set('presetKeys', input.presetKeys.filter(Boolean).join(','))

  const uploaded = await apiRequest<{
    assetKind: CanvasLibraryAssetKind
    payload: Record<string, unknown>
  }>('/admin/canvas-library/assets/upload', {
    method: 'POST',
    body: formData,
    signal: input.signal,
  })

  const detail = await apiRequest<CanvasLibraryDetail>('/admin/canvas-library/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: input.title,
      summary: input.summary,
      kind: 'asset',
      assetKind: uploaded.assetKind,
      tags: ['mockup', 'device_shell', 'shell'],
      payloadType: 'binary_asset',
      payload: uploaded.payload,
      previewPayload: {
        width: dimensions.width || undefined,
        height: dimensions.height || undefined,
      },
      publish: true,
    }),
    signal: input.signal,
  })

  await loadAssetLibraryItems()

  const versionId = normalizeString(
    detail.publishedVersion?.id || detail.item.publishedVersionId || detail.draftVersion?.id,
  )
  const itemId = normalizeString(detail.item.id)
  if (!itemId || !versionId)
    throw new Error('素材图上传成功，但绑定版本解析失败。')

  return {
    itemId,
    versionId,
  }
}

function createPreviewUploadRequest(input: {
  setUploading: (value: boolean) => void
  buildTitle: () => string
  summary: string
  onUploaded: (binding: AssetBindingPatch) => Promise<void> | void
  successMessage: string
}): (option: RequestOption) => UploadRequest {
  return (option: RequestOption): UploadRequest => {
    const controller = new AbortController()
    const file = option.fileItem.file

    void (async () => {
      if (!file) {
        option.onError(new Error('未找到上传文件。'))
        return
      }

      input.setUploading(true)
      try {
        option.onProgress(0.2)
        const binding = await createPreviewAssetBinding({
          file,
          title: input.buildTitle(),
          summary: input.summary,
          signal: controller.signal,
        })
        option.onProgress(0.8)
        await input.onUploaded(binding)
        option.onProgress(1)
        notifySuccess(input.successMessage)
        option.onSuccess(binding)
      }
      catch (error: any) {
        if (isAbortError(error))
          return
        notifyError(String(error?.message || '预览图上传失败。'))
        option.onError(error)
      }
      finally {
        input.setUploading(false)
      }
    })()

    return {
      abort() {
        controller.abort()
      },
    }
  }
}

const handleCreatePreviewUpload = createPreviewUploadRequest({
  setUploading: value => createPreviewUploading.value = value,
  buildTitle: () => buildModelPreviewAssetTitle(createForm.modelName, createForm.category),
  summary: 'Mockup 型号预览图',
  onUploaded: (binding) => {
    createForm.previewAssetItemId = binding.itemId || ''
    createForm.previewAssetVersionId = binding.versionId || ''
  },
  successMessage: '型号预览图上传完成，可继续创建型号。',
})

const handleEditPreviewUpload = createPreviewUploadRequest({
  setUploading: value => editPreviewUploading.value = value,
  buildTitle: () => buildModelPreviewAssetTitle(editForm.modelName, editForm.category),
  summary: 'Mockup 型号预览图',
  onUploaded: (binding) => {
    editForm.previewAssetItemId = binding.itemId || ''
    editForm.previewAssetVersionId = binding.versionId || ''
  },
  successMessage: '型号预览图上传完成，记得保存型号。',
})

function handleVariantPreviewUpload(
  variant: MockupDeviceVariant,
  option: RequestOption,
): UploadRequest {
  return createPreviewUploadRequest({
    setUploading: value => variantPreviewUploading[variant.slotKey] = value,
    buildTitle: () => buildVariantPreviewAssetTitle(
      selectedDetail.value?.model.modelName || '',
      variant.title,
      variant.slotKey,
    ),
    summary: 'Mockup 变体预览图',
    onUploaded: async (binding) => {
      await patchVariant(
        variant.slotKey,
        {
          previewAssetItemId: binding.itemId,
          previewAssetVersionId: binding.versionId,
        },
        {
          silent: true,
        },
      )
    },
    successMessage: `${variant.title || variant.slotKey} 预览图上传成功。`,
  })(option)
}

function createAbortError(): DOMException {
  return new DOMException('已取消上传', 'AbortError')
}

function cancelPendingVariantShellUpload(): void {
  const slotKey = pendingVariantShellUpload.slotKey
  const requestOption = pendingVariantShellUpload.requestOption
  const abortController = pendingVariantShellUpload.abortController
  shellUploadConfirmVisible.value = false
  shellUploadSubmitting.value = false
  if (abortController)
    abortController.abort()
  if (slotKey)
    variantShellUploading[slotKey] = false
  resetPendingVariantShellUpload()
  if (requestOption)
    requestOption.onError(createAbortError())
}

async function confirmPendingVariantShellUpload(): Promise<void> {
  const requestOption = pendingVariantShellUpload.requestOption
  const model = selectedDetail.value?.model || null
  const slotKey = normalizeString(pendingVariantShellUpload.slotKey)
  const file = pendingVariantShellUpload.file
  if (!requestOption || !model || !slotKey || !file) {
    shellUploadConfirmVisible.value = false
    shellUploadSubmitting.value = false
    if (slotKey)
      variantShellUploading[slotKey] = false
    requestOption?.onError(new Error('当前素材图确认信息不完整，请重新上传。'))
    resetPendingVariantShellUpload()
    notifyError('当前素材图确认信息不完整，请重新上传。')
    return
  }

  const presetKey = createMockupDevicePresetKey(model.slug, slotKey)
  if (!presetKey) {
    shellUploadConfirmVisible.value = false
    shellUploadSubmitting.value = false
    variantShellUploading[slotKey] = false
    requestOption.onError(new Error('当前型号缺少 preset 标识，无法上传素材图。'))
    resetPendingVariantShellUpload()
    notifyError('当前型号缺少 preset 标识，无法上传素材图。')
    return
  }

  const uploadTitle = buildVariantShellAssetTitle(
    model.modelName,
    pendingVariantShellUpload.variantTitle,
    slotKey,
  )
  const controller = new AbortController()
  pendingVariantShellUpload.abortController = controller
  shellUploadSubmitting.value = true

  try {
    requestOption.onProgress(0.3)
    const binding = await createShellAssetBinding({
      file,
      title: uploadTitle,
      summary: 'Mockup 变体素材图',
      viewportRect: pendingVariantShellUpload.viewportRect,
      cornerRadius: pendingVariantShellUpload.cornerRadius,
      presetKeys: [presetKey],
      signal: controller.signal,
    })
    requestOption.onProgress(0.8)

    const patched = await patchVariant(
      slotKey,
      {
        shellAssetItemId: binding.itemId,
        shellAssetVersionId: binding.versionId,
      },
      {
        silent: true,
      },
    )
    if (!patched) {
      requestOption.onError(new Error('素材图已上传，但绑定到变体失败，请改用素材列表手动选择。'))
      shellUploadConfirmVisible.value = false
      shellUploadSubmitting.value = false
      variantShellUploading[slotKey] = false
      resetPendingVariantShellUpload()
      return
    }

    requestOption.onProgress(1)
    requestOption.onSuccess(binding)
    notifySuccess('变体素材图上传成功，已绑定到当前变体。')
    shellUploadConfirmVisible.value = false
    shellUploadSubmitting.value = false
    variantShellUploading[slotKey] = false
    resetPendingVariantShellUpload()
  }
  catch (error: any) {
    if (isAbortError(error))
      return
    notifyError(String(error?.message || '变体素材图上传失败。'))
    requestOption.onError(error)
    shellUploadSubmitting.value = false
    variantShellUploading[slotKey] = false
    shellUploadConfirmVisible.value = false
    resetPendingVariantShellUpload()
  }
}

function buildVariantShellUploadRequest(variant: MockupDeviceVariant): (option: RequestOption) => UploadRequest {
  return (option: RequestOption): UploadRequest => {
    let cancelled = false
    const slotKey = variant.slotKey
    const file = option.fileItem.file

    if (!file) {
      option.onError(new Error('未找到上传文件。'))
      return { abort() {} }
    }

    variantShellUploading[slotKey] = true
    void (async () => {
      try {
        if (shellUploadConfirmVisible.value)
          throw new Error('请先完成当前素材图确认。')
        const model = selectedDetail.value?.model || null
        if (!model)
          throw new Error('当前型号信息不存在。')

        const dimensions = await inspectImageFile(file)
        if (cancelled) {
          variantShellUploading[slotKey] = false
          option.onError(createAbortError())
          return
        }

        pendingVariantShellUpload.slotKey = slotKey
        pendingVariantShellUpload.variantTitle = normalizeString(variantTitleDrafts[slotKey]) || variant.title
        pendingVariantShellUpload.file = file
        pendingVariantShellUpload.fileName = normalizeString(file.name) || '未命名素材图'
        pendingVariantShellUpload.imageWidth = Math.max(1, dimensions.width || model.screenWidth || 1)
        pendingVariantShellUpload.imageHeight = Math.max(1, dimensions.height || model.screenHeight || 1)
        pendingVariantShellUpload.viewportRect = buildDefaultShellViewportRect(
          pendingVariantShellUpload.imageWidth,
          pendingVariantShellUpload.imageHeight,
          model.screenWidth,
          model.screenHeight,
        )
        pendingVariantShellUpload.cornerRadius = 0
        pendingVariantShellUpload.requestOption = option
        pendingVariantShellUpload.abortController = null
        option.onProgress(0.15)
        shellUploadConfirmVisible.value = true
      }
      catch (error: any) {
        variantShellUploading[slotKey] = false
        if (isAbortError(error))
          return
        notifyError(String(error?.message || '变体素材图上传准备失败。'))
        option.onError(error)
      }
    })()

    return {
      abort() {
        cancelled = true
        if (
          pendingVariantShellUpload.requestOption === option
          && normalizeString(pendingVariantShellUpload.slotKey) === normalizeString(slotKey)
        ) {
          cancelPendingVariantShellUpload()
          return
        }
        variantShellUploading[slotKey] = false
        option.onError(createAbortError())
      },
    }
  }
}

function openCreateDialog(): void {
  resetCreateForm()
  void loadAssetLibraryItems()
  createDialogVisible.value = true
}

async function openEditDialog(model: MockupDeviceModel): Promise<void> {
  detailLoading.value = true
  detailErrorText.value = ''
  editDialogVisible.value = true
  void loadAssetLibraryItems()
  try {
    selectedDetail.value = await loadSelectedModel(model.id)
    syncEditForm(selectedDetail.value)
  }
  catch (error: any) {
    editDialogVisible.value = false
    selectedDetail.value = null
    detailErrorText.value = String(error?.message || 'Mockup 型号详情加载失败。')
    notifyError(detailErrorText.value)
  }
  finally {
    detailLoading.value = false
  }
}

async function openVariantsDialog(model: MockupDeviceModel): Promise<void> {
  detailLoading.value = true
  detailErrorText.value = ''
  variantsDialogVisible.value = true
  void loadAssetLibraryItems()
  try {
    selectedDetail.value = await loadSelectedModel(model.id)
    syncEditForm(selectedDetail.value)
  }
  catch (error: any) {
    variantsDialogVisible.value = false
    selectedDetail.value = null
    detailErrorText.value = String(error?.message || 'Mockup 变体详情加载失败。')
    notifyError(detailErrorText.value)
  }
  finally {
    detailLoading.value = false
  }
}

function openCreateConfirm(): void {
  try {
    if (!normalizeString(createForm.modelName))
      throw new Error('型号名不能为空。')
    ensurePreviewBinding(
      createForm.previewAssetItemId,
      createForm.previewAssetVersionId,
      '型号预览图',
    )
    createConfirmVisible.value = true
  }
  catch (error: any) {
    notifyError(String(error?.message || '创建参数校验失败。'))
  }
}

async function createModel(): Promise<void> {
  mutating.value = true
  try {
    const modelName = normalizeString(createForm.modelName)
    if (!modelName)
      throw new Error('型号名不能为空。')

    const previewBinding = ensurePreviewBinding(
      createForm.previewAssetItemId,
      createForm.previewAssetVersionId,
      '型号预览图',
    )

    await apiRequest<MockupModelDetail>('/admin/mockups/models', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: modelName,
        category: createForm.category,
        brand: normalizeString(createForm.brand),
        modelName,
        screenWidth: Math.max(1, toInteger(createForm.screenWidth, 1)),
        screenHeight: Math.max(1, toInteger(createForm.screenHeight, 1)),
        previewAssetItemId: previewBinding.itemId,
        previewAssetVersionId: previewBinding.versionId,
      }),
    })

    createConfirmVisible.value = false
    createDialogVisible.value = false
    resetCreateForm()
    notifySuccess('Mockup 型号创建成功。')
    await loadModels()
  }
  catch (error: any) {
    notifyError(String(error?.message || 'Mockup 型号创建失败。'))
  }
  finally {
    mutating.value = false
  }
}

async function saveSelectedModel(): Promise<void> {
  const modelId = normalizeString(editForm.modelId)
  if (!modelId)
    return

  mutating.value = true
  try {
    const modelName = normalizeString(editForm.modelName)
    if (!modelName)
      throw new Error('型号名不能为空。')

    const previewBinding = ensurePreviewBinding(
      editForm.previewAssetItemId,
      editForm.previewAssetVersionId,
      '型号预览图',
    )

    selectedDetail.value = await apiRequest<MockupModelDetail>(
      `/admin/mockups/models/${encodeURIComponent(modelId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: modelName,
          category: editForm.category,
          brand: normalizeString(editForm.brand) || null,
          modelName,
          screenWidth: Math.max(1, toInteger(editForm.screenWidth, 1)),
          screenHeight: Math.max(1, toInteger(editForm.screenHeight, 1)),
          previewAssetItemId: previewBinding.itemId,
          previewAssetVersionId: previewBinding.versionId,
        }),
      },
    )
    syncEditForm(selectedDetail.value)
    editDialogVisible.value = false
    notifySuccess('Mockup 型号保存成功。')
    await loadModels()
  }
  catch (error: any) {
    notifyError(String(error?.message || 'Mockup 型号保存失败。'))
  }
  finally {
    mutating.value = false
  }
}

async function publishModel(modelId: string): Promise<void> {
  mutating.value = true
  try {
    if (editForm.modelId === modelId || normalizeString(selectedDetail.value?.model.id) === modelId) {
      selectedDetail.value = await apiRequest<MockupModelDetail>(
        `/admin/mockups/models/${encodeURIComponent(modelId)}/publish`,
        { method: 'POST' },
      )
      syncEditForm(selectedDetail.value)
    }
    else {
      await apiRequest(
        `/admin/mockups/models/${encodeURIComponent(modelId)}/publish`,
        { method: 'POST' },
      )
    }
    notifySuccess('Mockup 型号发布成功。')
    await loadModels()
  }
  catch (error: any) {
    notifyError(String(error?.message || 'Mockup 型号发布失败。'))
  }
  finally {
    mutating.value = false
  }
}

async function archiveModel(modelId: string): Promise<void> {
  mutating.value = true
  try {
    if (editForm.modelId === modelId || normalizeString(selectedDetail.value?.model.id) === modelId) {
      selectedDetail.value = await apiRequest<MockupModelDetail>(
        `/admin/mockups/models/${encodeURIComponent(modelId)}/archive`,
        { method: 'POST' },
      )
      syncEditForm(selectedDetail.value)
    }
    else {
      await apiRequest(
        `/admin/mockups/models/${encodeURIComponent(modelId)}/archive`,
        { method: 'POST' },
      )
    }
    notifySuccess('Mockup 型号归档成功。')
    await loadModels()
  }
  catch (error: any) {
    notifyError(String(error?.message || 'Mockup 型号归档失败。'))
  }
  finally {
    mutating.value = false
  }
}

async function patchVariant(
  slotKey: MockupVariantSlotKey,
  patch: Partial<Pick<MockupDeviceVariant, 'title' | 'enabled' | 'sortOrder'>> & {
    shellAssetItemId?: string | null
    shellAssetVersionId?: string | null
    previewAssetItemId?: string | null
    previewAssetVersionId?: string | null
  },
  options: {
    successMessage?: string
    silent?: boolean
    errorMessage?: string
  } = {},
): Promise<boolean> {
  const modelId = normalizeString(selectedDetail.value?.model.id)
  if (!modelId)
    return false

  mutating.value = true
  try {
    await apiRequest(
      `/admin/mockups/models/${encodeURIComponent(modelId)}/variants/${encodeURIComponent(slotKey)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      },
    )
    selectedDetail.value = await loadSelectedModel(modelId)
    syncEditForm(selectedDetail.value)
    if (!options.silent)
      notifySuccess(options.successMessage || 'Mockup 变体保存成功。')
    await loadModels()
    return true
  }
  catch (error: any) {
    notifyError(String(error?.message || options.errorMessage || 'Mockup 变体保存失败。'))
    return false
  }
  finally {
    mutating.value = false
  }
}

async function saveVariantTitle(slotKey: MockupVariantSlotKey): Promise<void> {
  const variant = getVariantBySlotKey(slotKey)
  if (!variant)
    return
  const fallbackTitle = normalizeString(variant.title) || formatVariantSlotLabel(slotKey)
  const nextTitle = normalizeString(variantTitleDrafts[slotKey])
  if (!nextTitle) {
    variantTitleDrafts[slotKey] = fallbackTitle
    return
  }
  if (nextTitle === fallbackTitle)
    return
  const saved = await patchVariant(
    slotKey,
    { title: nextTitle },
    {
      silent: true,
      errorMessage: '展示变体标题保存失败。',
    },
  )
  if (!saved)
    variantTitleDrafts[slotKey] = fallbackTitle
}

async function addVariant(): Promise<void> {
  const nextIndex = selectedVariants.value.length + 1
  await patchVariant(
    createNextVariantSlotKey(),
    {
      title: `展示变体 ${nextIndex}`,
      sortOrder: selectedVariants.value.length,
      enabled: false,
    },
    {
      successMessage: '展示变体已新增。',
    },
  )
}

async function deleteVariant(slotKey: MockupVariantSlotKey): Promise<void> {
  const modelId = normalizeString(selectedDetail.value?.model.id)
  if (!modelId)
    return

  mutating.value = true
  try {
    selectedDetail.value = await apiRequest<MockupModelDetail>(
      `/admin/mockups/models/${encodeURIComponent(modelId)}/variants/${encodeURIComponent(slotKey)}`,
      {
        method: 'DELETE',
      },
    )
    syncEditForm(selectedDetail.value)
    notifySuccess('展示变体已删除。')
    await loadModels()
  }
  catch (error: any) {
    notifyError(String(error?.message || '展示变体删除失败。'))
  }
  finally {
    mutating.value = false
  }
}

function updateVariantShellAsset(slotKey: MockupVariantSlotKey, itemId: string | number | boolean): void {
  try {
    const binding = resolveShellAssetBinding(String(itemId || ''))
    void patchVariant(
      slotKey,
      {
        shellAssetItemId: binding.itemId,
        shellAssetVersionId: binding.versionId,
      },
      {
        successMessage: '变体素材图已更新。',
      },
    )
  }
  catch (error: any) {
    notifyError(String(error?.message || '变体素材图更新失败。'))
  }
}

function handleVariantShellAssetChange(
  slotKey: MockupVariantSlotKey,
  value: string | number | boolean,
): void {
  updateVariantShellAsset(slotKey, value)
}

function isVariantPreviewUploading(slotKey: MockupVariantSlotKey): boolean {
  return variantPreviewUploading[slotKey] === true
}

function isVariantShellUploading(slotKey: MockupVariantSlotKey): boolean {
  return variantShellUploading[slotKey] === true
}

function buildVariantPreviewUploadRequest(variant: MockupDeviceVariant): (option: RequestOption) => UploadRequest {
  return (option: RequestOption) => handleVariantPreviewUpload(variant, option)
}

watch(
  () => [createForm.category, createForm.modelName, createForm.screenWidth, createForm.screenHeight] as const,
  () => syncFormPresetSelections(createForm),
  { immediate: true },
)

watch(
  () => [editForm.category, editForm.modelName, editForm.screenWidth, editForm.screenHeight] as const,
  () => syncFormPresetSelections(editForm),
  { immediate: true },
)

watch(
  () => selectedVariants.value,
  variants => resetVariantLocalState(variants),
  { immediate: true, deep: true },
)

watch(
  () => [filters.category, filters.status, filters.search] as const,
  () => {
    page.value = 1
    void loadModels()
  },
  { immediate: true },
)

watch([models, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(models.value.length / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

watch(
  () => createDialogVisible.value,
  (visible) => {
    if (!visible)
      createConfirmVisible.value = false
  },
)

watch(
  () => variantsDialogVisible.value,
  (visible) => {
    if (!visible && shellUploadConfirmVisible.value)
      cancelPendingVariantShellUpload()
  },
)

onMounted(() => {
  void loadAssetLibraryItems()
})
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 class="text-sm text-slate-900 font-semibold">
            Mockup 型号列表
          </h2>
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

      <div class="mt-4 gap-3 grid md:grid-cols-4">
        <a-input
          v-model="filters.search"
          allow-clear
          class="md:col-span-2"
          placeholder="搜索型号 / 品牌 / slug"
        />
        <a-select v-model="filters.category" placeholder="全部分类">
          <a-option value="">
            全部分类
          </a-option>
          <a-option
            v-for="item in CATEGORY_OPTIONS"
            :key="item.key"
            :value="item.key"
          >
            {{ item.label }}
          </a-option>
        </a-select>
        <a-select v-model="filters.status" placeholder="全部状态">
          <a-option value="">
            全部状态
          </a-option>
          <a-option value="draft">
            draft
          </a-option>
          <a-option value="published">
            published
          </a-option>
          <a-option value="archived">
            archived
          </a-option>
        </a-select>
      </div>
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
          <a-table-column title="预览图" data-index="previewAssetItemId" :width="96">
            <template #cell="scope">
              <div class="flex justify-center">
                <img
                  v-if="resolveAssetPreviewUrl(scope.record.previewAssetItemId)"
                  :src="resolveAssetPreviewUrl(scope.record.previewAssetItemId)"
                  alt="型号预览图"
                  class="border border-slate-200 rounded-lg bg-slate-50 h-14 w-14 object-contain"
                >
                <div
                  v-else
                  class="text-[10px] text-slate-400 border border-slate-200 rounded-lg border-dashed bg-slate-50 flex h-14 w-14 items-center justify-center"
                >
                  无预览图
                </div>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="型号" data-index="modelName" :width="260">
            <template #cell="scope">
              <div class="min-w-0">
                <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                  {{ scope.record.modelName }}
                </p>
                <p class="text-[11px] text-slate-500 m-0 mt-1 truncate">
                  {{ scope.record.brand || "未填写品牌" }}
                </p>
                <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 truncate">
                  {{ scope.record.slug }}
                </p>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="分类" data-index="category" :width="120">
            <template #cell="scope">
              <span class="text-[11px] text-slate-700">{{ resolveCategoryLabel(scope.record.category) }}</span>
            </template>
          </a-table-column>
          <a-table-column title="屏幕尺寸" data-index="screenWidth" :width="140">
            <template #cell="scope">
              <span class="text-[11px] text-slate-700">{{ scope.record.screenWidth }} × {{ scope.record.screenHeight }}</span>
            </template>
          </a-table-column>
          <a-table-column title="型号预览图" data-index="previewAssetVersionId" :width="220">
            <template #cell="scope">
              <span class="text-[11px] text-slate-600">
                {{ resolveAssetLabel(scope.record.previewAssetItemId, "未绑定型号预览图") }}
              </span>
            </template>
          </a-table-column>
          <a-table-column title="状态" data-index="status" :width="110">
            <template #cell="scope">
              <a-tag
                :color="scope.record.status === 'published' ? 'green' : scope.record.status === 'archived' ? 'red' : 'gray'"
                size="small"
              >
                {{ scope.record.status }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="更新时间" data-index="updatedAt" :width="160">
            <template #cell="scope">
              <span class="text-[10px] text-slate-500">{{ formatDate(scope.record.updatedAt || scope.record.createdAt) }}</span>
            </template>
          </a-table-column>
          <a-table-column title="操作" data-index="actions" :width="280" fixed="right">
            <template #cell="scope">
              <div class="flex flex-wrap gap-2">
                <a-button size="mini" @click="void openEditDialog(scope.record)">
                  编辑
                </a-button>
                <a-button size="mini" @click="void openVariantsDialog(scope.record)">
                  变体
                </a-button>
                <a-button
                  size="mini"
                  type="primary"
                  :disabled="scope.record.status === 'published' || mutating"
                  @click="void publishModel(scope.record.id)"
                >
                  发布
                </a-button>
                <a-button
                  size="mini"
                  status="danger"
                  :disabled="scope.record.status === 'archived' || mutating"
                  @click="void archiveModel(scope.record.id)"
                >
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
          :total="models.length"
          size="small"
          @change="(value: number) => page = value"
          @page-size-change="(value: number) => { pageSize = value; page = 1; }"
        />
      </div>
    </section>

    <a-modal
      v-model:visible="createDialogVisible"
      :footer="false"
      title="新增 Mockup 型号"
      width="820px"
    >
      <a-form :model="createForm" layout="vertical">
        <div class="gap-x-4 grid md:grid-cols-2">
          <div>
            <a-form-item label="品牌">
              <a-select
                v-model="createForm.brand"
                allow-clear
                allow-search
                allow-create
                placeholder="选择或输入品牌"
              >
                <a-option
                  v-for="brand in MAINSTREAM_BRANDS"
                  :key="brand"
                  :value="brand"
                >
                  {{ brand }}
                </a-option>
              </a-select>
            </a-form-item>
          </div>
          <div>
            <a-form-item label="分类">
              <a-select v-model="createForm.category" placeholder="选择设备分类">
                <a-option
                  v-for="item in CATEGORY_OPTIONS"
                  :key="item.key"
                  :value="item.key"
                >
                  {{ item.label }}
                </a-option>
              </a-select>
            </a-form-item>
          </div>
          <div>
            <a-form-item label="型号预设">
              <a-select
                :model-value="createForm.presetKey"
                allow-clear
                allow-search
                placeholder="选择内置型号预设，或保持自定义"
                @change="applyModelPreset(createForm, $event)"
              >
                <a-option
                  v-for="preset in MODEL_PRESET_OPTIONS"
                  :key="preset.key"
                  :value="preset.key"
                >
                  {{ `${preset.group} / ${preset.label}` }}
                </a-option>
              </a-select>
            </a-form-item>
          </div>
          <div>
            <a-form-item label="尺寸预设">
              <a-select
                :model-value="createForm.sizePresetKey"
                allow-clear
                allow-search
                placeholder="选择内置尺寸，或保持自定义"
                @change="applySizePreset(createForm, $event)"
              >
                <a-option
                  v-for="preset in MODEL_PRESET_OPTIONS"
                  :key="preset.key"
                  :value="preset.key"
                >
                  {{ preset.label }}
                </a-option>
              </a-select>
            </a-form-item>
          </div>
          <div class="md:col-span-2">
            <p class="text-xs text-slate-500 m-0 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
              当前型号来源：{{ resolveFormPresetSourceLabel(createForm) }} ｜ 当前尺寸来源：{{ resolveFormSizeSourceLabel(createForm) }}
            </p>
          </div>
          <div class="md:col-span-2">
            <a-form-item label="型号名">
              <a-input
                v-model="createForm.modelName"
                allow-clear
                placeholder="例如 iPhone 17 Pro Max"
              />
            </a-form-item>
          </div>
          <div>
            <a-form-item label="屏幕宽（px）">
              <a-input-number
                v-model="createForm.screenWidth"
                class="w-full"
                :min="1"
                placeholder="请输入屏幕宽"
              />
            </a-form-item>
          </div>
          <div>
            <a-form-item label="屏幕高（px）">
              <a-input-number
                v-model="createForm.screenHeight"
                class="w-full"
                :min="1"
                placeholder="请输入屏幕高"
              />
            </a-form-item>
          </div>
          <div class="md:col-span-2">
            <a-form-item label="型号预览图">
              <AdminCanvasLibraryMockupPreviewUploadCard
                :preview-url="resolveAssetPreviewUrl(createForm.previewAssetItemId)"
                :asset-label="resolveAssetLabel(createForm.previewAssetItemId, '请手动上传型号预览图')"
                helper-text="预览图由管理员手动上传，支持 PNG / JPG / WEBP / SVG。上传后会自动写入画布资源库并绑定到当前型号。"
                :upload-button-text="createForm.previewAssetItemId ? '重新上传型号预览图' : '上传型号预览图'"
                :uploading="createPreviewUploading"
                :accept="PREVIEW_UPLOAD_ACCEPT"
                :custom-request="handleCreatePreviewUpload"
                alt="型号预览图"
              />
            </a-form-item>
          </div>
        </div>
      </a-form>

      <div class="mt-6 flex gap-2 justify-end">
        <a-button @click="createDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" :loading="mutating" @click="openCreateConfirm">
          创建型号
        </a-button>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="createConfirmVisible"
      :footer="false"
      title="请确认型号尺寸"
      width="560px"
    >
      <div class="text-sm text-slate-700 space-y-3">
        <div class="p-4 border border-slate-200 rounded-lg bg-slate-50">
          <p class="text-slate-900 font-semibold m-0">
            {{ createForm.modelName || "未命名型号" }}
          </p>
          <p class="m-0 mt-2">
            品牌：{{ createForm.brand || "未填写品牌" }}
          </p>
          <p class="m-0 mt-1">
            分类：{{ resolveCategoryLabel(createForm.category) }}
          </p>
          <p class="m-0 mt-1">
            型号来源：{{ resolveFormPresetSourceLabel(createForm) }}
          </p>
          <p class="m-0 mt-1">
            尺寸来源：{{ resolveFormSizeSourceLabel(createForm) }}
          </p>
          <p class="text-base text-slate-900 font-semibold m-0 mt-1">
            最终尺寸：{{ createForm.screenWidth }} × {{ createForm.screenHeight }} px
          </p>
        </div>
        <p class="text-xs text-slate-500 m-0">
          请确认大小无误后再创建，创建后仍可继续编辑。
        </p>
      </div>

      <div class="mt-6 flex gap-2 justify-end">
        <a-button @click="createConfirmVisible = false">
          返回修改
        </a-button>
        <a-button type="primary" :loading="mutating" @click="void createModel()">
          确认创建
        </a-button>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="editDialogVisible"
      :footer="false"
      title="编辑 Mockup 型号"
      width="820px"
    >
      <div v-if="detailLoading" class="py-8">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>
      </div>
      <div v-else-if="selectedDetail" class="space-y-4">
        <a-form :model="editForm" layout="vertical">
          <div class="gap-x-4 grid md:grid-cols-2">
            <div>
              <a-form-item label="品牌">
                <a-select
                  v-model="editForm.brand"
                  allow-clear
                  allow-search
                  allow-create
                  placeholder="选择或输入品牌"
                >
                  <a-option
                    v-for="brand in MAINSTREAM_BRANDS"
                    :key="brand"
                    :value="brand"
                  >
                    {{ brand }}
                  </a-option>
                </a-select>
              </a-form-item>
            </div>
            <div>
              <a-form-item label="分类">
                <a-select v-model="editForm.category" placeholder="选择设备分类">
                  <a-option
                    v-for="item in CATEGORY_OPTIONS"
                    :key="item.key"
                    :value="item.key"
                  >
                    {{ item.label }}
                  </a-option>
                </a-select>
              </a-form-item>
            </div>
            <div>
              <a-form-item label="型号预设">
                <a-select
                  :model-value="editForm.presetKey"
                  allow-clear
                  allow-search
                  placeholder="选择内置型号预设，或保持自定义"
                  @change="applyModelPreset(editForm, $event)"
                >
                  <a-option
                    v-for="preset in MODEL_PRESET_OPTIONS"
                    :key="preset.key"
                    :value="preset.key"
                  >
                    {{ `${preset.group} / ${preset.label}` }}
                  </a-option>
                </a-select>
              </a-form-item>
            </div>
            <div>
              <a-form-item label="尺寸预设">
                <a-select
                  :model-value="editForm.sizePresetKey"
                  allow-clear
                  allow-search
                  placeholder="选择内置尺寸，或保持自定义"
                  @change="applySizePreset(editForm, $event)"
                >
                  <a-option
                    v-for="preset in MODEL_PRESET_OPTIONS"
                    :key="preset.key"
                    :value="preset.key"
                  >
                    {{ preset.label }}
                  </a-option>
                </a-select>
              </a-form-item>
            </div>
            <div class="md:col-span-2">
              <p class="text-xs text-slate-500 m-0 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                当前型号来源：{{ resolveFormPresetSourceLabel(editForm) }} ｜ 当前尺寸来源：{{ resolveFormSizeSourceLabel(editForm) }}
              </p>
            </div>
            <div class="md:col-span-2">
              <a-form-item label="型号名">
                <a-input v-model="editForm.modelName" allow-clear placeholder="请输入型号名" />
              </a-form-item>
            </div>
            <div>
              <a-form-item label="屏幕宽（px）">
                <a-input-number
                  v-model="editForm.screenWidth"
                  class="w-full"
                  :min="1"
                  placeholder="请输入屏幕宽"
                />
              </a-form-item>
            </div>
            <div>
              <a-form-item label="屏幕高（px）">
                <a-input-number
                  v-model="editForm.screenHeight"
                  class="w-full"
                  :min="1"
                  placeholder="请输入屏幕高"
                />
              </a-form-item>
            </div>
            <div class="md:col-span-2">
              <a-form-item label="型号预览图">
                <AdminCanvasLibraryMockupPreviewUploadCard
                  :preview-url="resolveAssetPreviewUrl(editForm.previewAssetItemId)"
                  :asset-label="resolveAssetLabel(editForm.previewAssetItemId, '请手动上传型号预览图')"
                  helper-text="预览图由管理员手动上传。重新上传后会生成新的画布资源库资产，保存型号后才会正式生效。"
                  :upload-button-text="editForm.previewAssetItemId ? '重新上传型号预览图' : '上传型号预览图'"
                  :uploading="editPreviewUploading"
                  :accept="PREVIEW_UPLOAD_ACCEPT"
                  :custom-request="handleEditPreviewUpload"
                  alt="型号预览图"
                />
              </a-form-item>
            </div>
          </div>
        </a-form>

        <div class="text-sm text-slate-700 p-3 border border-slate-200 rounded-lg bg-slate-50">
          <p class="m-0">
            {{ selectedDetail.model.slug }} · {{ selectedDetail.model.screenWidth }} × {{ selectedDetail.model.screenHeight }}
          </p>
          <p class="text-xs text-slate-500 m-0 mt-1">
            createdBy {{ selectedDetail.model.createdBy }} / updatedBy {{ selectedDetail.model.updatedBy }}
          </p>
        </div>

        <div class="flex gap-3 items-center justify-between">
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
      <div v-else class="text-sm text-slate-500 py-6">
        {{ detailErrorText || "型号详情加载失败，请关闭后重试。" }}
      </div>
    </a-modal>

    <a-modal
      v-model:visible="variantsDialogVisible"
      :footer="false"
      title="管理展示变体"
      width="1320px"
    >
      <div v-if="detailLoading" class="py-8">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>
      </div>
      <div v-else-if="selectedDetail" class="space-y-4">
        <div class="flex gap-3 items-center justify-between">
          <a-button type="primary" size="small" :loading="mutating" @click="void addVariant()">
            新增变体
          </a-button>
        </div>

        <a-table
          :bordered="{ cell: true }"
          :data="selectedVariants"
          :pagination="false"
          row-key="slotKey"
          size="small"
        >
          <template #columns>
            <a-table-column title="标识" data-index="slotKey" :width="120">
              <template #cell="scope">
                <span class="text-[11px] text-slate-600 font-semibold">
                  {{ formatVariantSlotLabel(scope.record.slotKey) }}
                </span>
              </template>
            </a-table-column>
            <a-table-column title="标题" data-index="title" :width="240">
              <template #cell="scope">
                <a-input
                  v-model="variantTitleDrafts[scope.record.slotKey]"
                  allow-clear
                  :disabled="mutating"
                  @blur="void saveVariantTitle(scope.record.slotKey)"
                  @press-enter="void saveVariantTitle(scope.record.slotKey)"
                />
              </template>
            </a-table-column>
            <a-table-column title="启用" data-index="enabled" :width="90">
              <template #cell="scope">
                <a-switch
                  :model-value="scope.record.enabled"
                  size="small"
                  @change="(value: string | number | boolean) => patchVariant(scope.record.slotKey, { enabled: Boolean(value) }, { silent: true })"
                />
              </template>
            </a-table-column>
            <a-table-column title="素材图" data-index="shellAssetItemId" :width="430">
              <template #cell="scope">
                <div class="space-y-3">
                  <div class="flex gap-3 items-center">
                    <img
                      v-if="resolveAssetPreviewUrl(scope.record.shellAssetItemId)"
                      :src="resolveAssetPreviewUrl(scope.record.shellAssetItemId)"
                      alt="变体素材图"
                      class="border border-slate-200 rounded-lg bg-slate-50 h-16 w-16 object-contain"
                    >
                    <div
                      v-else
                      class="text-[10px] text-slate-400 border border-slate-200 rounded-lg border-dashed bg-slate-50 flex h-16 w-16 items-center justify-center"
                    >
                      无素材图
                    </div>
                    <span class="text-[11px] text-slate-500 flex-1 min-w-0">
                      {{ resolveAssetLabel(scope.record.shellAssetItemId, "未绑定素材图") }}
                    </span>
                  </div>
                  <div class="flex gap-2 items-center">
                    <a-select
                      :model-value="scope.record.shellAssetItemId || ''"
                      allow-clear
                      class="flex-1"
                      placeholder="选择素材图（device_shell）"
                      @change="handleVariantShellAssetChange(scope.record.slotKey, $event)"
                    >
                      <a-option
                        v-for="item in publishedShellAssets"
                        :key="item.id"
                        :value="item.id"
                      >
                        {{ item.title }}
                      </a-option>
                    </a-select>
                    <a-upload
                      :accept="PREVIEW_UPLOAD_ACCEPT"
                      :custom-request="buildVariantShellUploadRequest(scope.record)"
                      :show-file-list="false"
                      :limit="1"
                    >
                      <template #upload-button>
                        <a-button
                          type="outline"
                          size="mini"
                          :loading="isVariantShellUploading(scope.record.slotKey)"
                        >
                          快速上传素材图
                        </a-button>
                      </template>
                    </a-upload>
                  </div>
                  <p class="text-[10px] text-slate-400 m-0">
                    快速上传素材图后会要求你确认可视区域与圆角，再自动创建正式 `device_shell` 素材。
                  </p>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="预览图" data-index="previewAssetItemId" :width="360">
              <template #cell="scope">
                <AdminCanvasLibraryMockupPreviewUploadCard
                  compact
                  button-size="mini"
                  :preview-url="resolveAssetPreviewUrl(scope.record.previewAssetItemId)"
                  :asset-label="resolveAssetLabel(scope.record.previewAssetItemId, '请手动上传变体预览图')"
                  helper-text="预览图由管理员手动上传，不从素材列表选择。"
                  :upload-button-text="scope.record.previewAssetItemId ? '重新上传预览图' : '上传预览图'"
                  :uploading="isVariantPreviewUploading(scope.record.slotKey)"
                  :accept="PREVIEW_UPLOAD_ACCEPT"
                  :custom-request="buildVariantPreviewUploadRequest(scope.record)"
                  alt="变体预览图"
                />
              </template>
            </a-table-column>
            <a-table-column title="操作" data-index="variantActions" :width="120">
              <template #cell="scope">
                <a-popconfirm
                  content="确认删除该展示变体吗？"
                  ok-text="确认删除"
                  cancel-text="取消"
                  @ok="void deleteVariant(scope.record.slotKey)"
                >
                  <a-button size="mini" status="danger" :disabled="mutating">
                    删除变体
                  </a-button>
                </a-popconfirm>
              </template>
            </a-table-column>
          </template>
        </a-table>

        <div class="flex items-center justify-end">
          <a-button @click="variantsDialogVisible = false">
            关闭
          </a-button>
        </div>
      </div>
      <div v-else class="text-sm text-slate-500 py-6">
        {{ detailErrorText || "变体详情加载失败，请关闭后重试。" }}
      </div>
    </a-modal>

    <a-modal
      v-model:visible="shellUploadConfirmVisible"
      :footer="false"
      title="确认变体素材图"
      width="680px"
    >
      <div class="space-y-4">
        <div class="text-sm text-slate-700 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <p class="text-slate-900 font-semibold m-0">
            {{ pendingVariantShellUpload.variantTitle || "展示变体" }}
          </p>
          <p class="m-0 mt-2">
            型号：{{ selectedDetail?.model.modelName || "未知型号" }}
          </p>
          <p class="m-0 mt-1">
            当前屏幕尺寸：{{ selectedDetail?.model.screenWidth || 0 }} × {{ selectedDetail?.model.screenHeight || 0 }} px
          </p>
          <p class="m-0 mt-1">
            上传文件：{{ pendingVariantShellUpload.fileName || "未选择文件" }}
          </p>
          <p class="m-0 mt-1">
            图片尺寸：{{ pendingVariantShellUpload.imageWidth }} × {{ pendingVariantShellUpload.imageHeight }} px
          </p>
        </div>

        <a-form layout="vertical">
          <div class="gap-x-4 grid md:grid-cols-2">
            <div>
              <a-form-item label="可视区域 X">
                <a-input-number
                  v-model="pendingVariantShellUpload.viewportRect.x"
                  class="w-full"
                  :min="0"
                  placeholder="0"
                />
              </a-form-item>
            </div>
            <div>
              <a-form-item label="可视区域 Y">
                <a-input-number
                  v-model="pendingVariantShellUpload.viewportRect.y"
                  class="w-full"
                  :min="0"
                  placeholder="0"
                />
              </a-form-item>
            </div>
            <div>
              <a-form-item label="可视区域宽">
                <a-input-number
                  v-model="pendingVariantShellUpload.viewportRect.width"
                  class="w-full"
                  :min="1"
                  placeholder="请输入屏幕可视宽度"
                />
              </a-form-item>
            </div>
            <div>
              <a-form-item label="可视区域高">
                <a-input-number
                  v-model="pendingVariantShellUpload.viewportRect.height"
                  class="w-full"
                  :min="1"
                  placeholder="请输入屏幕可视高度"
                />
              </a-form-item>
            </div>
            <div class="md:col-span-2">
              <a-form-item label="圆角">
                <a-input-number
                  v-model="pendingVariantShellUpload.cornerRadius"
                  class="w-full"
                  :min="0"
                  placeholder="请输入屏幕圆角"
                />
              </a-form-item>
            </div>
          </div>
        </a-form>

        <p class="text-xs text-slate-500 m-0">
          上传后会自动创建并发布新的 `device_shell` 资产，再回填到当前展示变体。
        </p>
      </div>

      <div class="mt-6 flex gap-2 justify-end">
        <a-button @click="cancelPendingVariantShellUpload">
          取消
        </a-button>
        <a-button type="primary" :loading="shellUploadSubmitting" @click="void confirmPendingVariantShellUpload()">
          确认上传并绑定
        </a-button>
      </div>
    </a-modal>
  </div>
</template>
