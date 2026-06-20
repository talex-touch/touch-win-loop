<script setup lang="ts">
import type {
  ApiResponse,
  MockupProjectCatalog,
  MockupProjectCatalogVariant,
} from '~~/shared/types/domain'
import type {
  DeviceArrangementDocumentV1,
  DeviceArrangementExportSizePresetKey,
  DeviceArrangementItemV1,
  DeviceArrangementLayoutPresetKey,
} from '~~/shared/utils/device-arrangement-document'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  createDeviceArrangementItem,
  DEVICE_ARRANGEMENT_BUILTIN_DEVICE_PRESETS,
  DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS,
  DEVICE_ARRANGEMENT_LAYOUT_PRESETS,
  DEVICE_ARRANGEMENT_SHADOW_PRESETS,
  DEVICE_ARRANGEMENT_TEMPLATE_PRESETS,
  layoutDeviceArrangementItems,
  normalizeDeviceArrangementDocument,
  renderDeviceArrangementDocumentToSvg,
  resolveDeviceArrangementPreset,
  resolveDeviceArrangementSize,
} from '~~/shared/utils/device-arrangement-document'
import { uploadDeviceArrangementScreenshotAsset } from '~/utils/device-arrangement-assets'

interface DeviceArrangementEditLock {
  userId: string
  username: string
  sessionId: string
  acquiredAt: string
  heartbeatAt: string
  expiresAt: string
}

interface DeviceChoice {
  key: string
  label: string
  meta: string
  categoryKey: string
  categoryLabel: string
  source: 'catalog' | 'builtin'
  variant?: MockupProjectCatalogVariant | null
}

interface DeviceCategoryOption {
  key: string
  label: string
  count: number
}

interface ImportedScreenshot {
  src: string
  previewSrc: string
  width: number
  height: number
  name: string
}

interface PreviewDeviceItem {
  item: DeviceArrangementItemV1
  imageSrc: string
  shellImageSrc: string
  rootStyle: Record<string, string>
  frameStyle: Record<string, string>
  screenStyle: Record<string, string>
  shellStyle: Record<string, string>
  mode: 'builtin' | 'external' | 'none'
}

const props = withDefaults(defineProps<{
  projectId?: string
  resourceId?: string
  resourceTitle?: string
}>(), {
  projectId: '',
  resourceId: '',
  resourceTitle: '设备排布',
})

const emit = defineEmits<{
  saveStateChange: [payload: { dirty: boolean, saving: boolean, blocked?: boolean }]
}>()

const runtime = useRuntimeConfig()
const { endpoint, resolveApiUrl } = useApiEndpoint(runtime)

const CATALOG_DEVICE_CATEGORY_PREFIX = 'catalog:'
const BUILTIN_DEVICE_CATEGORY_PREFIX = 'builtin:'
const AUTO_SAVE_DEBOUNCE_MS = 850
const LOCK_HEARTBEAT_MS = 25_000

const fileInputRef = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const saving = ref(false)
const autoSaveReady = ref(false)
const lockSessionId = ref('')
const editLock = ref<DeviceArrangementEditLock | null>(null)
const lockedBy = ref<DeviceArrangementEditLock | null>(null)
const lockedProjectId = ref('')
const lockedResourceId = ref('')
const exportBusy = ref(false)
const errorMessage = ref('')
const screenshotUploadError = ref('')
const exportError = ref('')
const selectedItemId = ref('')
const dragOver = ref(false)
const activeTemplateKey = ref('')
const selectedDefaultDevicePresetKey = ref('')
const selectedDeviceCategoryKey = ref('')
const savedDocumentSnapshot = ref('')
const mockupCatalog = ref<MockupProjectCatalog | null>(null)
const localScreenshotSrcByItemId = ref<Record<string, string>>({})
const hydratedScreenshotSrcByItemId = ref<Record<string, string>>({})
const documentState = ref<DeviceArrangementDocumentV1>(createAutomaticLayoutDocument({
  title: props.resourceTitle,
}))
let hydrationRunId = 0
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function ensureLockSessionId(): string {
  if (!lockSessionId.value) {
    lockSessionId.value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `device-arrangement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
  return lockSessionId.value
}

function cloneDocument(): DeviceArrangementDocumentV1 {
  return JSON.parse(JSON.stringify(documentState.value)) as DeviceArrangementDocumentV1
}

function resetItemManualTransform(item: DeviceArrangementItemV1): DeviceArrangementItemV1 {
  return {
    ...item,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotationOffset: 0,
  }
}

function createAutomaticLayoutDocument(input: DeviceArrangementDocumentV1 | Record<string, unknown>, options: {
  title?: string
} = {}): DeviceArrangementDocumentV1 {
  const normalized = normalizeDeviceArrangementDocument(input, {
    title: options.title,
    relayout: false,
  })
  const items = normalized.items.map(resetItemManualTransform)
  return {
    ...normalized,
    items: layoutDeviceArrangementItems(items, normalized.canvas, normalized.layoutPresetKey),
  }
}

function serializeDocument(value: DeviceArrangementDocumentV1): string {
  return JSON.stringify(createAutomaticLayoutDocument(value))
}

function syncSelectedItem(preferredItemId = ''): void {
  const items = documentState.value.items
  const preferred = normalizeString(preferredItemId)
  if (preferred && items.some(item => item.id === preferred)) {
    selectedItemId.value = preferred
    return
  }
  if (selectedItemId.value && items.some(item => item.id === selectedItemId.value))
    return
  selectedItemId.value = items[0]?.id || ''
}

function markSaved(value = documentState.value): void {
  savedDocumentSnapshot.value = serializeDocument(value)
}

function commitDocument(nextDocument: DeviceArrangementDocumentV1 | Record<string, unknown>, options: {
  selectedItemId?: string
} = {}): void {
  documentState.value = createAutomaticLayoutDocument(nextDocument)
  syncSelectedItem(options.selectedItemId)
}

const variantEntries = computed(() => {
  return (mockupCatalog.value?.categories || []).flatMap(category =>
    category.models.flatMap(model =>
      model.variants.map(variant => ({
        categoryKey: `${CATALOG_DEVICE_CATEGORY_PREFIX}${category.key}`,
        categoryTitle: category.title,
        modelTitle: model.title,
        variant,
      })),
    ),
  )
})

const catalogDeviceChoices = computed<DeviceChoice[]>(() => {
  return variantEntries.value.map(({ categoryKey, categoryTitle, modelTitle, variant }) => ({
    key: variant.presetKey,
    label: `${modelTitle} / ${variant.title}`,
    meta: `${categoryTitle} · ${variant.resolvedPreset.screenWidth}×${variant.resolvedPreset.screenHeight}`,
    categoryKey,
    categoryLabel: categoryTitle,
    source: 'catalog',
    variant,
  }))
})

const builtinDeviceChoices = computed<DeviceChoice[]>(() => {
  return DEVICE_ARRANGEMENT_BUILTIN_DEVICE_PRESETS.map(preset => ({
    key: preset.key,
    label: preset.title,
    meta: `${preset.group} · ${preset.screenWidth}×${preset.screenHeight}`,
    categoryKey: `${BUILTIN_DEVICE_CATEGORY_PREFIX}${preset.group}`,
    categoryLabel: preset.group,
    source: 'builtin',
    variant: null,
  }))
})

const deviceChoices = computed<DeviceChoice[]>(() => {
  const seen = new Set<string>()
  return [...catalogDeviceChoices.value, ...builtinDeviceChoices.value].filter((choice) => {
    if (seen.has(choice.key))
      return false
    seen.add(choice.key)
    return true
  })
})

const deviceCategoryOptions = computed<DeviceCategoryOption[]>(() => {
  const optionByKey = new Map<string, DeviceCategoryOption>()
  for (const choice of deviceChoices.value) {
    const current = optionByKey.get(choice.categoryKey)
    optionByKey.set(choice.categoryKey, {
      key: choice.categoryKey,
      label: choice.categoryLabel,
      count: (current?.count || 0) + 1,
    })
  }
  return Array.from(optionByKey.values())
})

const filteredDeviceChoices = computed<DeviceChoice[]>(() => {
  const selectedCategoryKey = normalizeString(selectedDeviceCategoryKey.value)
  if (!selectedCategoryKey)
    return deviceChoices.value
  return deviceChoices.value.filter(choice => choice.categoryKey === selectedCategoryKey)
})

const selectedItem = computed<DeviceArrangementItemV1 | null>(() => {
  return documentState.value.items.find(item => item.id === selectedItemId.value)
    || documentState.value.items[0]
    || null
})

const selectedItemIndex = computed(() => {
  if (!selectedItem.value)
    return -1
  return documentState.value.items.findIndex(item => item.id === selectedItem.value?.id)
})

const canvasWidth = computed(() => Math.max(1, documentState.value.canvas.width))
const canvasHeight = computed(() => Math.max(1, documentState.value.canvas.height))
const canvasAspectRatio = computed(() => `${canvasWidth.value} / ${canvasHeight.value}`)
const canvasRatio = computed(() => String(canvasWidth.value / canvasHeight.value))
const isDirty = computed(() => {
  return savedDocumentSnapshot.value !== serializeDocument(documentState.value)
})
const activeLayoutPreset = computed(() => {
  return DEVICE_ARRANGEMENT_LAYOUT_PRESETS.find(item => item.key === documentState.value.layoutPresetKey)
})
const layoutPresetOptions = computed(() => {
  return DEVICE_ARRANGEMENT_LAYOUT_PRESETS.map(preset => ({
    ...preset,
    countLabel: resolveLayoutCountLabel(preset.key),
  }))
})
const activeDevicePresetKey = computed(() => {
  return selectedItem.value?.devicePresetKey
    || selectedDefaultDevicePresetKey.value
    || resolveDefaultDeviceChoice().key
})
const activeDeviceChoice = computed(() => {
  return resolveDeviceChoice(activeDevicePresetKey.value)
    || resolveDefaultDeviceChoice()
})
const selectedStatusText = computed(() => {
  const count = documentState.value.items.length
  if (loading.value)
    return '加载设备画布中'
  if (lockedBy.value)
    return `当前由 ${lockedBy.value.username || '其他用户'} 编辑`
  if (count === 0)
    return `${activeLayoutPreset.value?.title || '自动排版'} · 等待导入图片`
  return `${count} 张截图 · ${activeLayoutPreset.value?.title || '自动排版'}`
})
const canEdit = computed(() => Boolean(editLock.value && !lockedBy.value))
const previewItems = computed<PreviewDeviceItem[]>(() => {
  return documentState.value.items.map((item) => {
    const preset = resolveDeviceArrangementPreset(item.devicePresetKey)
    const screenBox = resolveItemScreenBox(item)
    const imageSrc = resolvePreviewImageSrc(item)
    const shellImageSrc = resolvePreviewShellImageSrc(item)
    const frameRadiusX = toPercent(Math.max(0, preset.bezelRadius), item.width)
    const frameRadiusY = toPercent(Math.max(0, preset.bezelRadius), item.height)
    return {
      item,
      imageSrc,
      shellImageSrc,
      mode: item.shell.mode,
      rootStyle: {
        left: toPercent(item.x, canvasWidth.value),
        top: toPercent(item.y, canvasHeight.value),
        width: toPercent(item.width, canvasWidth.value),
        height: toPercent(item.height, canvasHeight.value),
        transform: `rotate(${item.rotation}deg)`,
      },
      frameStyle: {
        background: item.shell.mode === 'none' ? 'transparent' : preset.background,
        borderRadius: item.shell.mode === 'none' ? '8px' : `${frameRadiusX} / ${frameRadiusY}`,
      },
      screenStyle: {
        left: toPercent(screenBox.x, item.width),
        top: toPercent(screenBox.y, item.height),
        width: toPercent(screenBox.width, item.width),
        height: toPercent(screenBox.height, item.height),
        borderRadius: `${toPercent(screenBox.radius, screenBox.width)} / ${toPercent(screenBox.radius, screenBox.height)}`,
      },
      shellStyle: {
        objectFit: 'contain',
      },
    }
  })
})

async function loadDocument(): Promise<void> {
  const projectId = normalizeString(props.projectId)
  const resourceId = normalizeString(props.resourceId)
  if (!projectId || !resourceId) {
    markSaved(documentState.value)
    autoSaveReady.value = false
    return
  }

  loading.value = true
  errorMessage.value = ''
  lockedBy.value = null
  editLock.value = null
  lockedProjectId.value = projectId
  lockedResourceId.value = resourceId
  autoSaveReady.value = false
  clearAutoSaveTimer()
  stopLockHeartbeat()
  try {
    const query = new URLSearchParams({ lockSessionId: ensureLockSessionId() })
    const response = await fetch(endpoint(`/projects/${projectId}/device-arrangements/${resourceId}?${query.toString()}`), {
      credentials: 'include',
    })
    const result = await response.json().catch(() => null) as ApiResponse<{
      arrangement: { document: DeviceArrangementDocumentV1 }
      editLock?: DeviceArrangementEditLock
    }> | null
    if (!response.ok || !result || result.code !== 0) {
      const message = resolveApiErrorMessage(result, '设备排布加载失败。')
      if (isConflictStatus(response))
        throw createLockConflictError(message)
      throw new Error(message)
    }
    const nextDocument = createAutomaticLayoutDocument(result.data?.arrangement?.document || { title: props.resourceTitle })
    commitDocument(nextDocument, { selectedItemId: nextDocument.items[0]?.id || '' })
    markSaved(nextDocument)
    editLock.value = result.data?.editLock || null
    autoSaveReady.value = true
    startLockHeartbeat()
  }
  catch (error) {
    const message = String(error instanceof Error ? error.message : '设备排布加载失败。')
    if (isConflictError(error))
      markLockedByMessage(message)
    errorMessage.value = message
  }
  finally {
    loading.value = false
  }
}

async function loadMockupCatalog(): Promise<void> {
  const projectId = normalizeString(props.projectId)
  if (!projectId)
    return

  try {
    const response = await fetch(endpoint(`/projects/${projectId}/mockups/catalog`), {
      credentials: 'include',
    })
    const result = await response.json().catch(() => null) as ApiResponse<MockupProjectCatalog> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '设备目录加载失败。'))
    mockupCatalog.value = result.data || null
  }
  catch {
    mockupCatalog.value = null
  }
}

function clearAutoSaveTimer(): void {
  if (!autoSaveTimer)
    return
  clearTimeout(autoSaveTimer)
  autoSaveTimer = null
}

async function refreshEditLock(): Promise<void> {
  const projectId = normalizeString(props.projectId)
  const resourceId = normalizeString(props.resourceId)
  if (!projectId || !resourceId || !lockSessionId.value || lockedBy.value)
    return

  const response = await fetch(endpoint(`/projects/${projectId}/device-arrangements/${resourceId}/lock`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ lockSessionId: lockSessionId.value }),
  })
  const result = await response.json().catch(() => null) as ApiResponse<{
    editLock?: DeviceArrangementEditLock
  }> | null
  if (!response.ok || !result || result.code !== 0) {
    const message = resolveApiErrorMessage(result, '设备排布编辑锁续期失败。')
    if (isConflictStatus(response)) {
      markLockedByMessage(message)
      throw createLockConflictError(message)
    }
    throw new Error(message)
  }
  editLock.value = result.data?.editLock || editLock.value
}

function stopLockHeartbeat(): void {
  if (!heartbeatTimer)
    return
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

function startLockHeartbeat(): void {
  stopLockHeartbeat()
  if (!import.meta.client || !editLock.value)
    return
  heartbeatTimer = setInterval(() => {
    void refreshEditLock().catch((error) => {
      errorMessage.value = String(error instanceof Error ? error.message : '设备排布编辑锁续期失败。')
    })
  }, LOCK_HEARTBEAT_MS)
}

async function releaseEditLock(): Promise<void> {
  const projectId = normalizeString(lockedProjectId.value)
  const resourceId = normalizeString(lockedResourceId.value)
  const sessionId = normalizeString(lockSessionId.value)
  if (!projectId || !resourceId || !sessionId || lockedBy.value)
    return

  await fetch(endpoint(`/projects/${projectId}/device-arrangements/${resourceId}/lock`), {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ lockSessionId: sessionId }),
  }).catch(() => {})
}

function scheduleAutoSave(): void {
  if (!autoSaveReady.value || !canEdit.value || !isDirty.value)
    return
  clearAutoSaveTimer()
  autoSaveTimer = setTimeout(() => {
    void saveDocument()
  }, AUTO_SAVE_DEBOUNCE_MS)
}

function resolveVariantByPresetKey(presetKey: string): MockupProjectCatalogVariant | null {
  return variantEntries.value.find(entry => entry.variant.presetKey === presetKey)?.variant || null
}

function resolveDeviceChoice(presetKey: string): DeviceChoice | null {
  return deviceChoices.value.find(choice => choice.key === presetKey)
    || deviceChoices.value[0]
    || null
}

function resolveDefaultDeviceChoice(): DeviceChoice {
  const selectedDefaultPresetKey = normalizeString(selectedDefaultDevicePresetKey.value)
  return deviceChoices.value.find(choice => choice.key === selectedDefaultPresetKey)
    || deviceChoices.value[0]
    || {
      key: 'iphone-16-pro',
      label: 'iPhone 16 Pro',
      meta: 'iPhone · 393×852',
      categoryKey: `${BUILTIN_DEVICE_CATEGORY_PREFIX}iPhone`,
      categoryLabel: 'iPhone',
      source: 'builtin',
      variant: null,
    }
}

function resolveLayoutCountLabel(layoutPresetKey: DeviceArrangementLayoutPresetKey): string {
  switch (layoutPresetKey) {
    case 'solo':
      return '1 device'
    case 'duo-overlap':
      return '2 devices'
    case 'trio-fan':
      return '3 devices'
    case 'desktop-phone':
      return '2 devices'
    case 'grid':
      return '4+ devices'
  }
}

function syncDeviceLibrarySelection(preferredPresetKey = ''): void {
  const preferredChoice = resolveDeviceChoice(preferredPresetKey)
  const defaultChoice = resolveDefaultDeviceChoice()
  const nextChoice = preferredChoice || defaultChoice
  if (!nextChoice)
    return
  selectedDefaultDevicePresetKey.value = nextChoice.key
  if (!selectedDeviceCategoryKey.value || !deviceCategoryOptions.value.some(option => option.key === selectedDeviceCategoryKey.value))
    selectedDeviceCategoryKey.value = nextChoice.categoryKey
}

function updateDeviceCategory(categoryKey: string): void {
  if (!canEdit.value)
    return
  selectedDeviceCategoryKey.value = categoryKey
  const firstChoice = deviceChoices.value.find(choice => choice.categoryKey === categoryKey)
  if (firstChoice && !filteredDeviceChoices.value.some(choice => choice.key === selectedDefaultDevicePresetKey.value))
    selectedDefaultDevicePresetKey.value = firstChoice.key
}

function updateLayoutPreset(layoutPresetKey: DeviceArrangementLayoutPresetKey): void {
  if (!canEdit.value)
    return
  documentState.value.layoutPresetKey = layoutPresetKey
  activeTemplateKey.value = ''
  relayoutCurrentDocument()
}

function updateDefaultDeviceChoice(devicePresetKey: string, options: {
  applyToSelected?: boolean
  applyToAll?: boolean
} = {}): void {
  if (!canEdit.value)
    return
  const choice = resolveDeviceChoice(devicePresetKey)
  if (!choice)
    return
  selectedDefaultDevicePresetKey.value = choice.key
  selectedDeviceCategoryKey.value = choice.categoryKey

  if (options.applyToAll) {
    const current = cloneDocument()
    current.items = current.items.map(item => resolveDevicePresetPatch(item, choice))
    commitDocument(current, { selectedItemId: selectedItemId.value })
    return
  }

  const targetItemId = options.applyToSelected ? selectedItem.value?.id : ''
  if (targetItemId)
    updateItem(targetItemId, { devicePresetKey: choice.key })
}

function resolveDeviceShell(devicePresetKey: string, fallbackShell: DeviceArrangementItemV1['shell']): DeviceArrangementItemV1['shell'] {
  const variant = resolveVariantByPresetKey(devicePresetKey)
  return variant
    ? {
        mode: variant.shellAssetUrl || variant.shellAssetPayload ? 'external' : 'builtin',
        assetId: variant.shellAssetItemId || undefined,
        imageSrc: variant.shellAssetUrl,
        viewportRect: variant.shellAssetPayload?.viewportRect || null,
        cornerRadius: variant.shellAssetPayload?.cornerRadius,
        presetKey: variant.presetKey,
      }
    : {
        ...fallbackShell,
        mode: 'builtin',
        imageSrc: undefined,
        viewportRect: null,
        presetKey: devicePresetKey,
      }
}

function resolveDevicePresetPatch(item: DeviceArrangementItemV1, choice: DeviceChoice): DeviceArrangementItemV1 {
  return resetItemManualTransform({
    ...item,
    devicePresetKey: choice.key,
    shell: resolveDeviceShell(choice.key, item.shell),
  })
}

function toPercent(value: number, total: number): string {
  const denominator = Math.max(1, total)
  return `${(value / denominator) * 100}%`
}

function resolveItemScreenBox(item: DeviceArrangementItemV1): { x: number, y: number, width: number, height: number, radius: number } {
  const preset = resolveDeviceArrangementPreset(item.devicePresetKey)
  if (item.shell.mode === 'none') {
    return {
      x: 0,
      y: 0,
      width: item.width,
      height: item.height,
      radius: 8,
    }
  }

  const rect = item.shell.mode === 'external' ? item.shell.viewportRect : null
  if (rect) {
    return {
      x: rect.x * item.width,
      y: rect.y * item.height,
      width: rect.width * item.width,
      height: rect.height * item.height,
      radius: item.shell.cornerRadius || preset.screenRadius,
    }
  }

  const padding = Math.max(0, preset.framePadding)
  return {
    x: padding,
    y: padding,
    width: Math.max(1, item.width - padding * 2),
    height: Math.max(1, item.height - padding * 2),
    radius: preset.screenRadius,
  }
}

function resolvePreviewImageSrc(item: DeviceArrangementItemV1): string {
  return localScreenshotSrcByItemId.value[item.id]
    || hydratedScreenshotSrcByItemId.value[item.id]
    || item.screenshotSrc
}

function resolvePreviewShellImageSrc(item: DeviceArrangementItemV1): string {
  const source = normalizeString(item.shell.imageSrc)
  return source ? resolveApiUrl(source) : ''
}

function isInlineImageSrc(value: string): boolean {
  const src = normalizeString(value)
  return src.startsWith('data:') || src.startsWith('blob:')
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片资源读取失败。'))
    reader.onload = () => resolve(normalizeString(reader.result))
    reader.readAsDataURL(blob)
  })
}

function resolveApiErrorMessage(result: ApiResponse<unknown> | null, fallback: string): string {
  return normalizeString(result?.message) || fallback
}

function isConflictStatus(response: Response): boolean {
  return response.status === 409
}

function isConflictError(error: unknown): boolean {
  return error instanceof Error && error.name === 'DeviceArrangementLockConflict'
}

function resolveLockedByFromMessage(message: string): DeviceArrangementEditLock {
  return {
    userId: '',
    username: message.replace(/^当前设备排布正由\s*/, '').replace(/\s*编辑。?$/, '').trim() || '其他用户',
    sessionId: '',
    acquiredAt: '',
    heartbeatAt: '',
    expiresAt: '',
  }
}

function createLockConflictError(message: string): Error {
  const error = new Error(message)
  error.name = 'DeviceArrangementLockConflict'
  return error
}

function markLockedByMessage(message: string): void {
  lockedBy.value = resolveLockedByFromMessage(message)
  editLock.value = null
  autoSaveReady.value = false
  clearAutoSaveTimer()
  stopLockHeartbeat()
}

async function materializeImageSrc(src: string): Promise<string> {
  const normalized = normalizeString(src)
  if (!normalized || isInlineImageSrc(normalized))
    return normalized
  const response = await fetch(resolveApiUrl(normalized), {
    credentials: 'include',
  })
  if (!response.ok)
    throw new Error('图片资源读取失败。')
  return readBlobAsDataUrl(await response.blob())
}

async function hydratePreviewImageSources(): Promise<void> {
  if (!import.meta.client)
    return
  const runId = ++hydrationRunId
  const pendingItems = documentState.value.items.filter((item) => {
    const src = normalizeString(item.screenshotSrc)
    return src && !isInlineImageSrc(src) && !localScreenshotSrcByItemId.value[item.id] && !hydratedScreenshotSrcByItemId.value[item.id]
  })
  if (pendingItems.length === 0)
    return

  const nextSources: Record<string, string> = {}
  await Promise.all(pendingItems.map(async (item) => {
    try {
      nextSources[item.id] = await materializeImageSrc(item.screenshotSrc)
    }
    catch {
      nextSources[item.id] = ''
    }
  }))
  if (runId !== hydrationRunId)
    return
  hydratedScreenshotSrcByItemId.value = {
    ...hydratedScreenshotSrcByItemId.value,
    ...Object.fromEntries(Object.entries(nextSources).filter(([, value]) => Boolean(value))),
  }
}

async function resolveScreenshotAssetSrc(file: File, fallbackSrc: string): Promise<string> {
  return uploadDeviceArrangementScreenshotAsset({
    endpoint,
    projectId: props.projectId,
    parentResourceId: props.resourceId,
    file,
  }).catch(() => fallbackSrc)
}

function readImageFile(file: File): Promise<ImportedScreenshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取截图失败。'))
    reader.onload = async () => {
      try {
        const localSrc = normalizeString(reader.result)
        const image = new Image()
        image.onload = async () => {
          const uploadedSrc = await resolveScreenshotAssetSrc(file, localSrc)
          resolve({
            src: uploadedSrc || localSrc,
            previewSrc: localSrc,
            width: image.naturalWidth || 0,
            height: image.naturalHeight || 0,
            name: file.name || '截图',
          })
        }
        image.onerror = () => reject(new Error('截图解析失败。'))
        image.src = localSrc
      }
      catch (error) {
        reject(error)
      }
    }
    reader.readAsDataURL(file)
  })
}

async function addScreenshotFiles(fileList: FileList | File[]): Promise<void> {
  if (!canEdit.value)
    return
  const files = Array.from(fileList).filter(file => file.type.startsWith('image/'))
  if (files.length === 0)
    return
  screenshotUploadError.value = ''
  exportError.value = ''
  try {
    const current = cloneDocument()
    let lastCreatedItemId = ''
    const nextLocalSources: Record<string, string> = { ...localScreenshotSrcByItemId.value }
    for (const file of files) {
      const image = await readImageFile(file)
      const defaultChoice = resolveDefaultDeviceChoice()
      const variant = defaultChoice.variant || null
      const item = createDeviceArrangementItem({
        id: `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: image.name,
        screenshotSrc: image.src,
        screenshotWidth: image.width,
        screenshotHeight: image.height,
        devicePresetKey: defaultChoice.key,
        shellAssetPayload: variant?.shellAssetPayload || null,
        shellAssetUrl: variant?.shellAssetUrl,
      })
      current.items.push(item)
      nextLocalSources[item.id] = image.previewSrc
      lastCreatedItemId = item.id
    }
    localScreenshotSrcByItemId.value = nextLocalSources
    commitDocument(current, { selectedItemId: lastCreatedItemId })
  }
  catch (error) {
    screenshotUploadError.value = String(error instanceof Error ? error.message : '截图导入失败。')
  }
}

function handleFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (files && files.length > 0)
    void addScreenshotFiles(files)
  input.value = ''
}

function extractClipboardImageFiles(event: ClipboardEvent): File[] {
  const clipboardItems = Array.from(event.clipboardData?.items || [])
  const files = clipboardItems
    .map((item) => {
      if (!item.type.startsWith('image/'))
        return null
      return item.getAsFile()
    })
    .filter((file): file is File => Boolean(file))
  if (files.length > 0)
    return files
  return Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'))
}

function handlePaste(event: ClipboardEvent): void {
  if (!canEdit.value)
    return
  const files = extractClipboardImageFiles(event)
  if (files.length === 0)
    return
  event.preventDefault()
  void addScreenshotFiles(files)
}

function extractDroppedImageFiles(event: DragEvent): File[] {
  return Array.from(event.dataTransfer?.files || []).filter(file => file.type.startsWith('image/'))
}

function handleDragOver(event: DragEvent): void {
  if (!canEdit.value)
    return
  if (extractDroppedImageFiles(event).length === 0)
    return
  event.preventDefault()
  dragOver.value = true
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'copy'
}

function handleDragLeave(event: DragEvent): void {
  const currentTarget = event.currentTarget
  const relatedTarget = event.relatedTarget
  if (!(currentTarget instanceof Node) || !(relatedTarget instanceof Node) || !currentTarget.contains(relatedTarget))
    dragOver.value = false
}

function handleDrop(event: DragEvent): void {
  const files = extractDroppedImageFiles(event)
  if (files.length === 0)
    return
  event.preventDefault()
  dragOver.value = false
  void addScreenshotFiles(files)
}

function relayoutCurrentDocument(): void {
  if (!canEdit.value)
    return
  commitDocument(cloneDocument())
}

function applyTemplate(templateKey: string): void {
  if (!canEdit.value)
    return
  const template = DEVICE_ARRANGEMENT_TEMPLATE_PRESETS.find(item => item.key === templateKey)
  if (!template)
    return
  const current = cloneDocument()
  const size = resolveDeviceArrangementSize(template.sizePresetKey)
  current.layoutPresetKey = template.layoutPresetKey
  current.shadowPresetKey = template.shadowPresetKey
  current.canvas.width = size.width
  current.canvas.height = size.height
  current.canvas.sizePresetKey = size.sizePresetKey
  current.canvas.background = template.background
  current.canvas.backgroundMode = template.backgroundMode
  current.watermarkText = template.watermarkText
  if (!current.exportSizePresetKeys.includes(size.sizePresetKey))
    current.exportSizePresetKeys = [...current.exportSizePresetKeys, size.sizePresetKey]
  activeTemplateKey.value = template.key
  commitDocument(current)
}

function updateCanvasSize(sizePresetKey: DeviceArrangementExportSizePresetKey): void {
  if (!canEdit.value)
    return
  const current = cloneDocument()
  const size = resolveDeviceArrangementSize(sizePresetKey, current.canvas.width, current.canvas.height)
  current.canvas.width = size.width
  current.canvas.height = size.height
  current.canvas.sizePresetKey = size.sizePresetKey
  if (!current.exportSizePresetKeys.includes(size.sizePresetKey))
    current.exportSizePresetKeys = [...current.exportSizePresetKeys, size.sizePresetKey]
  activeTemplateKey.value = ''
  commitDocument(current)
}

function updateCanvasBackground(background: string): void {
  if (!canEdit.value)
    return
  const current = cloneDocument()
  current.canvas.background = background
  activeTemplateKey.value = ''
  commitDocument(current)
}

function updateCanvasBackgroundMode(backgroundMode: DeviceArrangementDocumentV1['canvas']['backgroundMode']): void {
  if (!canEdit.value)
    return
  const current = cloneDocument()
  current.canvas.backgroundMode = backgroundMode
  activeTemplateKey.value = ''
  commitDocument(current)
}

function updateItem(itemId: string, patch: Partial<DeviceArrangementItemV1>): void {
  if (!canEdit.value)
    return
  const current = cloneDocument()
  current.items = current.items.map((item) => {
    if (item.id !== itemId)
      return item
    const nextPresetKey = normalizeString(patch.devicePresetKey || item.devicePresetKey) || item.devicePresetKey
    return resetItemManualTransform({
      ...item,
      ...patch,
      devicePresetKey: nextPresetKey,
      shell: patch.shell || resolveDeviceShell(nextPresetKey, item.shell),
    })
  })
  commitDocument(current, { selectedItemId: itemId })
}

function removeItem(itemId: string): void {
  if (!canEdit.value)
    return
  const current = cloneDocument()
  const removeIndex = current.items.findIndex(item => item.id === itemId)
  current.items = current.items.filter(item => item.id !== itemId)
  const nextSelectedItemId = current.items[Math.min(removeIndex, current.items.length - 1)]?.id || ''
  const nextLocalSources = { ...localScreenshotSrcByItemId.value }
  const nextHydratedSources = { ...hydratedScreenshotSrcByItemId.value }
  delete nextLocalSources[itemId]
  delete nextHydratedSources[itemId]
  localScreenshotSrcByItemId.value = nextLocalSources
  hydratedScreenshotSrcByItemId.value = nextHydratedSources
  commitDocument(current, { selectedItemId: nextSelectedItemId })
}

function duplicateItem(itemId: string): void {
  if (!canEdit.value)
    return
  const current = cloneDocument()
  const item = current.items.find(entry => entry.id === itemId)
  if (!item)
    return
  const nextItem: DeviceArrangementItemV1 = resetItemManualTransform({
    ...JSON.parse(JSON.stringify(item)),
    id: `device-copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${item.name} 副本`,
  })
  const index = current.items.findIndex(entry => entry.id === itemId)
  current.items.splice(index + 1, 0, nextItem)
  if (localScreenshotSrcByItemId.value[itemId]) {
    localScreenshotSrcByItemId.value = {
      ...localScreenshotSrcByItemId.value,
      [nextItem.id]: localScreenshotSrcByItemId.value[itemId]!,
    }
  }
  if (hydratedScreenshotSrcByItemId.value[itemId]) {
    hydratedScreenshotSrcByItemId.value = {
      ...hydratedScreenshotSrcByItemId.value,
      [nextItem.id]: hydratedScreenshotSrcByItemId.value[itemId]!,
    }
  }
  commitDocument(current, { selectedItemId: nextItem.id })
}

function selectItem(itemId: string): void {
  selectedItemId.value = itemId
}

function toggleExportSizePreset(sizePresetKey: DeviceArrangementExportSizePresetKey): void {
  if (!canEdit.value)
    return
  const current = cloneDocument()
  const exists = current.exportSizePresetKeys.includes(sizePresetKey)
  current.exportSizePresetKeys = exists
    ? current.exportSizePresetKeys.filter(item => item !== sizePresetKey)
    : [...current.exportSizePresetKeys, sizePresetKey]
  if (current.exportSizePresetKeys.length === 0)
    current.exportSizePresetKeys = [current.canvas.sizePresetKey]
  commitDocument(current)
}

async function saveDocument(): Promise<void> {
  const projectId = normalizeString(props.projectId)
  const resourceId = normalizeString(props.resourceId)
  if (!projectId || !resourceId || !canEdit.value || !lockSessionId.value)
    return

  clearAutoSaveTimer()
  saving.value = true
  errorMessage.value = ''
  try {
    const document = createAutomaticLayoutDocument(documentState.value)
    const response = await fetch(endpoint(`/projects/${projectId}/device-arrangements/${resourceId}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: document.title,
        document,
        lockSessionId: lockSessionId.value,
      }),
    })
    const result = await response.json().catch(() => null) as ApiResponse<{
      arrangement: { document: DeviceArrangementDocumentV1 }
      editLock?: DeviceArrangementEditLock
    }> | null
    if (!response.ok || !result || result.code !== 0) {
      const message = resolveApiErrorMessage(result, '保存失败。')
      if (isConflictStatus(response))
        throw createLockConflictError(message)
      throw new Error(message)
    }
    const nextDocument = createAutomaticLayoutDocument(result.data?.arrangement?.document || document)
    commitDocument(nextDocument)
    markSaved(nextDocument)
    editLock.value = result.data?.editLock || editLock.value
  }
  catch (error) {
    const message = String(error instanceof Error ? error.message : '保存失败。')
    if (isConflictError(error))
      markLockedByMessage(message)
    errorMessage.value = message
  }
  finally {
    saving.value = false
  }
}

function buildExportDocument(sizePresetKey: DeviceArrangementExportSizePresetKey): DeviceArrangementDocumentV1 {
  const current = cloneDocument()
  const size = resolveDeviceArrangementSize(sizePresetKey, current.canvas.width, current.canvas.height)
  current.canvas.width = size.width
  current.canvas.height = size.height
  current.canvas.sizePresetKey = size.sizePresetKey
  return createAutomaticLayoutDocument(current)
}

async function buildRenderableExportDocument(sizePresetKey: DeviceArrangementExportSizePresetKey): Promise<DeviceArrangementDocumentV1> {
  const document = buildExportDocument(sizePresetKey)
  const items = await Promise.all(document.items.map(async (item) => {
    const localScreenshotSrc = localScreenshotSrcByItemId.value[item.id] || hydratedScreenshotSrcByItemId.value[item.id]
    const screenshotSrc = localScreenshotSrc || await materializeImageSrc(item.screenshotSrc).catch(() => '')
    if (!screenshotSrc)
      throw new Error(`截图「${item.name}」无法读取，通常是登录态图片地址不能被导出流程访问。请重新上传该截图后再导出。`)
    const shellImageSrc = item.shell.imageSrc
      ? await materializeImageSrc(item.shell.imageSrc).catch(() => item.shell.imageSrc || '')
      : ''
    return {
      ...item,
      screenshotSrc,
      shell: {
        ...item.shell,
        imageSrc: shellImageSrc || item.shell.imageSrc,
      },
    }
  }))
  return {
    ...document,
    items,
  }
}

function downloadBlobUrl(fileName: string, url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
}

function downloadSvgBlob(fileName: string, svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    downloadBlobUrl(fileName, url)
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'device-arrangement'
}

async function downloadPresetSvg(sizePresetKey: DeviceArrangementExportSizePresetKey): Promise<void> {
  const exportDocument = await buildRenderableExportDocument(sizePresetKey)
  downloadSvgBlob(`${sanitizeFileName(exportDocument.title)}-${sizePresetKey}.svg`, renderDeviceArrangementDocumentToSvg(exportDocument))
}

async function downloadPresetPng(sizePresetKey: DeviceArrangementExportSizePresetKey): Promise<void> {
  const exportDocument = await buildRenderableExportDocument(sizePresetKey)
  const svg = renderDeviceArrangementDocumentToSvg(exportDocument)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('PNG 导出失败。'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = exportDocument.canvas.width
    canvas.height = exportDocument.canvas.height
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('浏览器不支持 PNG 导出。')
    context.drawImage(image, 0, 0)
    try {
      const pngUrl = canvas.toDataURL('image/png')
      downloadBlobUrl(`${sanitizeFileName(exportDocument.title)}-${sizePresetKey}.png`, pngUrl)
    }
    catch {
      throw new Error('PNG 导出被浏览器拦截，通常是截图或设备壳跨域资源未允许 Canvas 导出。请重新上传截图，或先导出 SVG。')
    }
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

async function runExport(action: () => Promise<void>): Promise<void> {
  if (exportBusy.value)
    return
  exportBusy.value = true
  exportError.value = ''
  try {
    await action()
  }
  catch (error) {
    exportError.value = String(error instanceof Error ? error.message : '导出失败。')
  }
  finally {
    exportBusy.value = false
  }
}

async function downloadBatchPng(): Promise<void> {
  for (const sizePresetKey of documentState.value.exportSizePresetKeys)
    await downloadPresetPng(sizePresetKey)
}

watch(() => [props.projectId, props.resourceId], () => {
  void loadDocument()
  void loadMockupCatalog()
}, { immediate: true })

watch(() => documentState.value.items.map(item => `${item.id}:${item.screenshotSrc}`).join('|'), () => {
  void hydratePreviewImageSources()
}, { immediate: true })

watch(() => [
  selectedItem.value?.devicePresetKey || '',
  deviceChoices.value.map(choice => choice.key).join('|'),
], ([devicePresetKey]) => {
  syncDeviceLibrarySelection(devicePresetKey)
}, { immediate: true })

watch(() => [isDirty.value, saving.value], ([dirty, nextSaving]) => {
  emit('saveStateChange', { dirty: Boolean(dirty), saving: Boolean(nextSaving), blocked: Boolean(lockedBy.value) })
}, { immediate: true })

watch(() => lockedBy.value, () => {
  emit('saveStateChange', { dirty: isDirty.value, saving: saving.value, blocked: Boolean(lockedBy.value) })
})

watch(() => serializeDocument(documentState.value), () => {
  scheduleAutoSave()
})

onBeforeUnmount(() => {
  clearAutoSaveTimer()
  stopLockHeartbeat()
  void releaseEditLock()
  emit('saveStateChange', { dirty: false, saving: false, blocked: false })
  hydrationRunId += 1
})
</script>

<template>
  <div
    class="workspace-device-arrangement-panel"
    :class="{ 'workspace-device-arrangement-panel--locked': lockedBy }"
    data-testid="workspace-device-arrangement-panel"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @paste="handlePaste"
  >
    <aside class="workspace-device-arrangement-panel__sidebar" data-testid="workspace-device-arrangement-workbench">
      <header class="workspace-device-arrangement-panel__header">
        <div class="workspace-device-arrangement-panel__header-main">
          <p class="workspace-device-arrangement-panel__eyebrow">
            Mockup
          </p>
          <input v-model="documentState.title" class="workspace-device-arrangement-panel__title-input" type="text">
        </div>
      </header>

      <div class="workspace-device-arrangement-panel__mode-tabs" aria-label="Mockup mode">
        <button class="workspace-device-arrangement-panel__mode-tab workspace-device-arrangement-panel__mode-tab--active" type="button">
          Mockup
        </button>
        <button class="workspace-device-arrangement-panel__mode-tab" type="button">
          Frame
        </button>
      </div>

      <section class="workspace-device-arrangement-panel__section" data-testid="workspace-device-arrangement-layout-panel">
        <div class="workspace-device-arrangement-panel__section-title">
          Layout
        </div>
        <div class="workspace-device-arrangement-panel__layout-grid" data-testid="workspace-device-arrangement-layout-presets">
          <button
            v-for="preset in layoutPresetOptions"
            :key="preset.key"
            class="workspace-device-arrangement-panel__layout-card"
            :class="{ 'workspace-device-arrangement-panel__layout-card--active': documentState.layoutPresetKey === preset.key }"
            type="button"
            :disabled="!canEdit"
            @click="updateLayoutPreset(preset.key)"
          >
            <span class="workspace-device-arrangement-panel__layout-thumb" :data-layout="preset.key">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span class="workspace-device-arrangement-panel__layout-copy">
              <strong>{{ preset.countLabel }}</strong>
              <small>{{ preset.title }}</small>
            </span>
          </button>
        </div>
      </section>

      <section class="workspace-device-arrangement-panel__section" data-testid="workspace-device-arrangement-mockup-library">
        <div class="workspace-device-arrangement-panel__section-title">
          Mockup Library
        </div>
        <div class="workspace-device-arrangement-panel__category-tabs">
          <button
            v-for="category in deviceCategoryOptions"
            :key="category.key"
            class="workspace-device-arrangement-panel__category-tab"
            :class="{ 'workspace-device-arrangement-panel__category-tab--active': selectedDeviceCategoryKey === category.key }"
            data-testid="workspace-device-arrangement-device-category"
            type="button"
            :disabled="!canEdit"
            @click="updateDeviceCategory(category.key)"
          >
            <span>{{ category.label }}</span>
            <small>{{ category.count }}</small>
          </button>
        </div>

        <div class="workspace-device-arrangement-panel__device-list">
          <button
            v-for="choice in filteredDeviceChoices"
            :key="`${choice.source}-${choice.key}`"
            class="workspace-device-arrangement-panel__device-choice"
            :class="{ 'workspace-device-arrangement-panel__device-choice--active': activeDevicePresetKey === choice.key }"
            data-testid="workspace-device-arrangement-device-choice"
            type="button"
            :disabled="!canEdit"
            @click="updateDefaultDeviceChoice(choice.key, { applyToSelected: Boolean(selectedItem) })"
          >
            <span class="workspace-device-arrangement-panel__device-mini">
              <i />
            </span>
            <span class="workspace-device-arrangement-panel__device-copy">
              <strong>{{ choice.label }}</strong>
              <small>{{ choice.meta }}</small>
            </span>
          </button>
        </div>

        <button
          class="workspace-device-arrangement-panel__button workspace-device-arrangement-panel__button--full"
          type="button"
          :disabled="!canEdit || documentState.items.length === 0"
          @click="updateDefaultDeviceChoice(activeDevicePresetKey, { applyToAll: true })"
        >
          应用到全部截图
        </button>
      </section>

      <section class="workspace-device-arrangement-panel__section" data-testid="workspace-device-arrangement-details">
        <div class="workspace-device-arrangement-panel__section-title">
          Details
        </div>
        <div class="workspace-device-arrangement-panel__detail-list">
          <div class="workspace-device-arrangement-panel__detail-row">
            <span>Device</span>
            <strong>{{ activeDeviceChoice.label }}</strong>
          </div>
          <div class="workspace-device-arrangement-panel__detail-row">
            <span>Source</span>
            <strong>{{ activeDeviceChoice.source === 'catalog' ? '设备资源库' : '内置边框' }}</strong>
          </div>
          <div class="workspace-device-arrangement-panel__detail-row">
            <span>Selected</span>
            <strong>{{ selectedItemIndex >= 0 ? `图片 ${selectedItemIndex + 1}` : '默认边框' }}</strong>
          </div>
          <div class="workspace-device-arrangement-panel__detail-row">
            <span>Screen</span>
            <strong>{{ selectedItem?.screenshotWidth || '-' }} × {{ selectedItem?.screenshotHeight || '-' }}</strong>
          </div>
        </div>
      </section>
    </aside>

    <main class="workspace-device-arrangement-panel__stage">
      <div class="workspace-device-arrangement-panel__toolbar">
        <div>
          <span class="workspace-device-arrangement-panel__hint">
            {{ selectedStatusText }}
          </span>
          <span v-if="errorMessage" class="workspace-device-arrangement-panel__hint workspace-device-arrangement-panel__hint--error">
            {{ errorMessage }}
          </span>
        </div>
        <span v-if="lockedBy" class="workspace-device-arrangement-panel__lock-badge">
          已被占用
        </span>
      </div>

      <div
        class="workspace-device-arrangement-panel__canvas-viewport"
        :class="{ 'workspace-device-arrangement-panel__canvas-viewport--dragover': dragOver }"
        data-testid="workspace-device-arrangement-checkerboard"
        :style="{ '--device-arrangement-canvas-ratio': canvasRatio }"
      >
        <div
          class="workspace-device-arrangement-panel__canvas-sheet"
          data-testid="workspace-device-arrangement-canvas-sheet"
          :style="{ aspectRatio: canvasAspectRatio }"
        >
          <div class="workspace-device-arrangement-panel__canvas-render">
            <div
              class="workspace-device-arrangement-panel__canvas-background"
              :class="`workspace-device-arrangement-panel__canvas-background--${documentState.canvas.backgroundMode}`"
              :style="{ '--device-arrangement-bg': documentState.canvas.background }"
            />
            <button
              v-for="preview in previewItems"
              :key="preview.item.id"
              class="workspace-device-arrangement-panel__preview-device"
              :class="{
                'workspace-device-arrangement-panel__preview-device--active': preview.item.id === selectedItemId,
                'workspace-device-arrangement-panel__preview-device--none': preview.mode === 'none',
                'workspace-device-arrangement-panel__preview-device--external': preview.mode === 'external',
              }"
              :style="preview.rootStyle"
              type="button"
              :disabled="!canEdit"
              @click="selectItem(preview.item.id)"
            >
              <span class="workspace-device-arrangement-panel__preview-frame" :style="preview.frameStyle">
                <span class="workspace-device-arrangement-panel__preview-screen" :style="preview.screenStyle">
                  <img :src="preview.imageSrc" :alt="preview.item.name" draggable="false">
                </span>
                <img
                  v-if="preview.shellImageSrc"
                  class="workspace-device-arrangement-panel__preview-shell"
                  :src="preview.shellImageSrc"
                  :alt="`${preview.item.name} 设备壳`"
                  :style="preview.shellStyle"
                  draggable="false"
                >
              </span>
            </button>
            <div v-if="documentState.watermarkText" class="workspace-device-arrangement-panel__watermark">
              {{ documentState.watermarkText }}
            </div>
          </div>
          <div v-if="loading" class="workspace-device-arrangement-panel__empty">
            加载设备画布中
          </div>
          <div v-else-if="lockedBy" class="workspace-device-arrangement-panel__empty workspace-device-arrangement-panel__empty--locked" data-testid="workspace-device-arrangement-lock-blocked">
            <strong>当前不可编辑</strong>
            <span>{{ lockedBy.username || '其他用户' }} 正在编辑这个设备排布</span>
          </div>
          <button
            v-else-if="documentState.items.length === 0"
            class="workspace-device-arrangement-panel__empty"
            type="button"
            @click.stop="fileInputRef?.click()"
          >
            <strong>Drop or Paste</strong>
            <span>Images</span>
          </button>
        </div>
      </div>
    </main>

    <aside class="workspace-device-arrangement-panel__inspector" data-testid="workspace-device-arrangement-image-panel">
      <section class="workspace-device-arrangement-panel__section" data-testid="workspace-device-arrangement-export-actions">
        <div class="workspace-device-arrangement-panel__section-title">
          Export
        </div>
        <div class="workspace-device-arrangement-panel__checkbox-list" data-testid="workspace-device-arrangement-batch-export">
          <label v-for="preset in DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS" :key="preset.key" class="workspace-device-arrangement-panel__checkbox">
            <input
              :checked="documentState.exportSizePresetKeys.includes(preset.key)"
              type="checkbox"
              @change="toggleExportSizePreset(preset.key)"
            >
            <span>{{ preset.title }}</span>
          </label>
        </div>
        <div class="workspace-device-arrangement-panel__actions">
          <button class="workspace-device-arrangement-panel__button" type="button" :disabled="exportBusy" @click="runExport(() => downloadPresetSvg(documentState.canvas.sizePresetKey))">
            当前 SVG
          </button>
          <button class="workspace-device-arrangement-panel__button" type="button" :disabled="exportBusy" @click="runExport(() => downloadPresetPng(documentState.canvas.sizePresetKey))">
            当前 PNG
          </button>
          <button class="workspace-device-arrangement-panel__button" type="button" :disabled="exportBusy" @click="runExport(downloadBatchPng)">
            批量 PNG
          </button>
        </div>
        <p v-if="exportError" class="workspace-device-arrangement-panel__hint workspace-device-arrangement-panel__hint--error">
          {{ exportError }}
        </p>
      </section>

      <section class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          Images
        </div>
        <button
          class="workspace-device-arrangement-panel__dropzone"
          :class="{ 'workspace-device-arrangement-panel__dropzone--active': dragOver }"
          data-testid="workspace-device-arrangement-dropzone"
          type="button"
          :disabled="!canEdit"
          @click="fileInputRef?.click()"
        >
          <span>上传 / 拖入 / 粘贴图片</span>
          <small>新图片会使用左侧当前边框。</small>
        </button>
        <input
          ref="fileInputRef"
          class="hidden"
          accept="image/*"
          multiple
          type="file"
          :disabled="!canEdit"
          @change="handleFileInputChange"
        >
        <p v-if="screenshotUploadError" class="workspace-device-arrangement-panel__hint workspace-device-arrangement-panel__hint--error">
          {{ screenshotUploadError }}
        </p>
      </section>

      <section class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          Selected Images
        </div>
        <p v-if="documentState.items.length === 0" class="workspace-device-arrangement-panel__hint">
          当前还没有截图。
        </p>
        <div v-else class="workspace-device-arrangement-panel__image-list">
          <article
            v-for="(item, index) in documentState.items"
            :key="item.id"
            class="workspace-device-arrangement-panel__image-card"
            :class="{ 'workspace-device-arrangement-panel__image-card--active': item.id === selectedItemId }"
            data-testid="workspace-device-arrangement-image-card"
            @click="selectItem(item.id)"
          >
            <button class="workspace-device-arrangement-panel__thumb" type="button">
              <img :src="resolvePreviewImageSrc(item)" :alt="item.name" draggable="false">
            </button>
            <div class="workspace-device-arrangement-panel__image-meta">
              <label class="workspace-device-arrangement-panel__field workspace-device-arrangement-panel__field--compact">
                <span>图片 {{ index + 1 }}</span>
                <input :value="item.name" class="workspace-device-arrangement-panel__input" type="text" :disabled="!canEdit" @change="updateItem(item.id, { name: ($event.target as HTMLInputElement).value })">
              </label>
              <small class="workspace-device-arrangement-panel__image-device">
                {{ resolveDeviceChoice(item.devicePresetKey)?.label || '内置设备' }}
              </small>
              <div class="workspace-device-arrangement-panel__actions workspace-device-arrangement-panel__actions--compact">
                <button class="workspace-device-arrangement-panel__button" type="button" :disabled="!canEdit" @click.stop="duplicateItem(item.id)">
                  复制
                </button>
                <button class="workspace-device-arrangement-panel__button workspace-device-arrangement-panel__button--danger" type="button" :disabled="!canEdit" @click.stop="removeItem(item.id)">
                  删除
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          Canvas
        </div>
        <label class="workspace-device-arrangement-panel__field">
          <span>尺寸</span>
          <select :value="documentState.canvas.sizePresetKey" class="workspace-device-arrangement-panel__input" :disabled="!canEdit" @change="updateCanvasSize(($event.target as HTMLSelectElement).value as DeviceArrangementExportSizePresetKey)">
            <option v-for="preset in DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>背景</span>
          <input :value="documentState.canvas.background" class="workspace-device-arrangement-panel__input" type="text" :disabled="!canEdit" @change="updateCanvasBackground(($event.target as HTMLInputElement).value)">
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>模式</span>
          <select :value="documentState.canvas.backgroundMode" class="workspace-device-arrangement-panel__input" :disabled="!canEdit" @change="updateCanvasBackgroundMode(($event.target as HTMLSelectElement).value as DeviceArrangementDocumentV1['canvas']['backgroundMode'])">
            <option value="solid">纯色</option>
            <option value="gradient">渐变</option>
            <option value="transparent">透明</option>
          </select>
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>阴影</span>
          <select v-model="documentState.shadowPresetKey" class="workspace-device-arrangement-panel__input" :disabled="!canEdit" @change="relayoutCurrentDocument">
            <option v-for="preset in DEVICE_ARRANGEMENT_SHADOW_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
      </section>

      <section class="workspace-device-arrangement-panel__section" data-testid="workspace-device-arrangement-template-panel">
        <div class="workspace-device-arrangement-panel__section-title">
          Style Presets
        </div>
        <div class="workspace-device-arrangement-panel__template-strip">
          <button
            v-for="template in DEVICE_ARRANGEMENT_TEMPLATE_PRESETS"
            :key="template.key"
            class="workspace-device-arrangement-panel__template-chip"
            :class="{ 'workspace-device-arrangement-panel__template-chip--active': activeTemplateKey === template.key }"
            type="button"
            :disabled="!canEdit"
            @click="applyTemplate(template.key)"
          >
            {{ template.title }}
          </button>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.workspace-device-arrangement-panel {
  display: grid;
  height: 100%;
  min-height: 0;
  grid-template-columns: 304px minmax(0, 1fr) 328px;
  border: 1px solid #202124;
  background: #0b0b0c;
  color: #f4f4f5;
}

.workspace-device-arrangement-panel__sidebar,
.workspace-device-arrangement-panel__inspector {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: #101112;
}

.workspace-device-arrangement-panel__sidebar {
  border-right: 1px solid #242528;
}

.workspace-device-arrangement-panel__inspector {
  border-left: 1px solid #242528;
}

.workspace-device-arrangement-panel__stage {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  background: #0b0b0c;
  overflow: hidden;
}

.workspace-device-arrangement-panel__header,
.workspace-device-arrangement-panel__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #242528;
  padding: 12px;
}

.workspace-device-arrangement-panel__header-main {
  min-width: 0;
}

.workspace-device-arrangement-panel__toolbar {
  background: #101112;
}

.workspace-device-arrangement-panel__eyebrow {
  margin: 0 0 3px;
  color: #8b8d94;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0;
}

.workspace-device-arrangement-panel__title-input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: #f8fafc;
  font-size: 15px;
  font-weight: 750;
  outline: none;
}

.workspace-device-arrangement-panel__mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 12px;
  border: 1px solid #242528;
  border-radius: 8px;
  background: #0b0b0c;
  padding: 3px;
}

.workspace-device-arrangement-panel__mode-tab {
  min-width: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #858891;
  font-size: 12px;
  font-weight: 750;
  padding: 7px 8px;
}

.workspace-device-arrangement-panel__mode-tab--active {
  background: #f4f4f5;
  color: #111113;
}

.workspace-device-arrangement-panel__section {
  padding: 12px;
}

.workspace-device-arrangement-panel__section + .workspace-device-arrangement-panel__section {
  border-top: 1px solid #1f2023;
}

.workspace-device-arrangement-panel__section-title {
  margin-bottom: 10px;
  color: #c6c8ce;
  font-size: 12px;
  font-weight: 800;
}

.workspace-device-arrangement-panel__layout-grid,
.workspace-device-arrangement-panel__image-list,
.workspace-device-arrangement-panel__device-list,
.workspace-device-arrangement-panel__detail-list,
.workspace-device-arrangement-panel__template-strip {
  display: grid;
  gap: 8px;
}

.workspace-device-arrangement-panel__layout-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace-device-arrangement-panel__layout-card,
.workspace-device-arrangement-panel__device-choice,
.workspace-device-arrangement-panel__image-card {
  min-width: 0;
  border: 1px solid #27292d;
  border-radius: 8px;
  background: #151618;
  color: #f4f4f5;
  text-align: left;
}

.workspace-device-arrangement-panel__layout-card {
  display: grid;
  gap: 8px;
  padding: 8px;
}

.workspace-device-arrangement-panel__layout-card--active,
.workspace-device-arrangement-panel__device-choice--active,
.workspace-device-arrangement-panel__image-card--active {
  border-color: #f4f4f5;
  background: #202124;
}

.workspace-device-arrangement-panel__layout-thumb {
  position: relative;
  display: block;
  height: 58px;
  overflow: hidden;
  border: 1px solid #282a2f;
  border-radius: 6px;
  background: #0c0d0e;
}

.workspace-device-arrangement-panel__layout-thumb i {
  position: absolute;
  display: none;
  border: 1px solid #4b4f58;
  border-radius: 5px;
  background: #d7d9de;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='solo'] i:nth-child(1) {
  display: block;
  inset: 11px 37% 8px;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='duo-overlap'] i:nth-child(1),
.workspace-device-arrangement-panel__layout-thumb[data-layout='duo-overlap'] i:nth-child(2),
.workspace-device-arrangement-panel__layout-thumb[data-layout='desktop-phone'] i:nth-child(1),
.workspace-device-arrangement-panel__layout-thumb[data-layout='desktop-phone'] i:nth-child(2) {
  display: block;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='duo-overlap'] i:nth-child(1) {
  inset: 13px 42% 8px 23%;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='duo-overlap'] i:nth-child(2) {
  inset: 8px 22% 13px 43%;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='trio-fan'] i:nth-child(1),
.workspace-device-arrangement-panel__layout-thumb[data-layout='trio-fan'] i:nth-child(2),
.workspace-device-arrangement-panel__layout-thumb[data-layout='trio-fan'] i:nth-child(3) {
  display: block;
  width: 22%;
  height: 64%;
  bottom: 8px;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='trio-fan'] i:nth-child(1) {
  left: 21%;
  transform: rotate(-10deg);
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='trio-fan'] i:nth-child(2) {
  left: 39%;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='trio-fan'] i:nth-child(3) {
  left: 57%;
  transform: rotate(10deg);
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='desktop-phone'] i:nth-child(1) {
  inset: 14px 18% 13px 15%;
  border-radius: 4px;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='desktop-phone'] i:nth-child(2) {
  right: 17%;
  bottom: 9px;
  width: 18%;
  height: 52%;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='grid'] i {
  display: block;
  width: 28%;
  height: 32%;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='grid'] i:nth-child(1) {
  left: 19%;
  top: 9px;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='grid'] i:nth-child(2) {
  right: 19%;
  top: 9px;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='grid'] i:nth-child(3) {
  left: 19%;
  bottom: 9px;
}

.workspace-device-arrangement-panel__layout-thumb[data-layout='grid'] i:nth-child(4) {
  right: 19%;
  bottom: 9px;
}

.workspace-device-arrangement-panel__layout-copy,
.workspace-device-arrangement-panel__device-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.workspace-device-arrangement-panel__layout-copy strong,
.workspace-device-arrangement-panel__device-copy strong,
.workspace-device-arrangement-panel__dropzone span {
  overflow: hidden;
  max-width: 100%;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-device-arrangement-panel__layout-copy small,
.workspace-device-arrangement-panel__device-copy small,
.workspace-device-arrangement-panel__dropzone small,
.workspace-device-arrangement-panel__field small,
.workspace-device-arrangement-panel__image-device {
  overflow: hidden;
  max-width: 100%;
  color: #858891;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-device-arrangement-panel__category-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.workspace-device-arrangement-panel__category-tab,
.workspace-device-arrangement-panel__template-chip {
  display: inline-flex;
  min-width: max-content;
  align-items: center;
  gap: 6px;
  border: 1px solid #282a2f;
  border-radius: 999px;
  background: #151618;
  color: #c7c9d1;
  font-size: 11px;
  font-weight: 750;
  padding: 6px 9px;
}

.workspace-device-arrangement-panel__category-tab small {
  color: #777a83;
}

.workspace-device-arrangement-panel__category-tab--active,
.workspace-device-arrangement-panel__template-chip--active {
  border-color: #f4f4f5;
  background: #f4f4f5;
  color: #111113;
}

.workspace-device-arrangement-panel__device-choice {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  padding: 8px;
}

.workspace-device-arrangement-panel__device-mini {
  display: grid;
  width: 38px;
  height: 44px;
  place-items: center;
  border: 1px solid #2f3238;
  border-radius: 7px;
  background: #0b0b0c;
}

.workspace-device-arrangement-panel__device-mini i {
  display: block;
  width: 16px;
  height: 28px;
  border: 2px solid #d8dae0;
  border-radius: 5px;
}

.workspace-device-arrangement-panel__detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #202124;
  padding: 7px 0;
  color: #858891;
  font-size: 12px;
  font-weight: 650;
}

.workspace-device-arrangement-panel__detail-row strong {
  overflow: hidden;
  color: #f4f4f5;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-device-arrangement-panel__field {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
  color: #aaadb5;
  font-size: 12px;
  font-weight: 700;
}

.workspace-device-arrangement-panel__field--compact {
  margin-bottom: 8px;
}

.workspace-device-arrangement-panel__input {
  width: 100%;
  min-width: 0;
  border: 1px solid #2b2d32;
  border-radius: 7px;
  background: #0b0b0c;
  padding: 8px 9px;
  color: #f4f4f5;
  font-size: 12px;
  outline: none;
}

.workspace-device-arrangement-panel__input:focus {
  border-color: #f4f4f5;
}

.workspace-device-arrangement-panel__button {
  min-width: 0;
  border: 1px solid #2b2d32;
  border-radius: 7px;
  background: #151618;
  color: #f4f4f5;
  font-size: 12px;
  font-weight: 750;
  line-height: 1;
  padding: 9px 10px;
}

.workspace-device-arrangement-panel__button--full {
  width: 100%;
  margin-top: 10px;
}

.workspace-device-arrangement-panel__button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.workspace-device-arrangement-panel__button--primary {
  border-color: #f4f4f5;
  background: #f4f4f5;
  color: #111113;
}

.workspace-device-arrangement-panel__button--danger {
  border-color: rgba(248, 113, 113, 0.32);
  color: #f87171;
}

.workspace-device-arrangement-panel__dropzone {
  display: flex;
  width: 100%;
  min-height: 88px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  border: 1px dashed #3d4047;
  border-radius: 8px;
  background: #151618;
  padding: 12px;
  color: #f4f4f5;
  text-align: left;
}

.workspace-device-arrangement-panel__dropzone--active,
.workspace-device-arrangement-panel__canvas-viewport--dragover {
  border-color: #f4f4f5;
  background: rgba(244, 244, 245, 0.08);
}

.workspace-device-arrangement-panel__actions,
.workspace-device-arrangement-panel__checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-device-arrangement-panel__actions {
  margin-top: 10px;
}

.workspace-device-arrangement-panel__actions--compact {
  margin-top: 8px;
}

.workspace-device-arrangement-panel__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #aaadb5;
  font-size: 12px;
  font-weight: 650;
}

.workspace-device-arrangement-panel__hint {
  color: #9a9da6;
  font-size: 12px;
  font-weight: 650;
}

.workspace-device-arrangement-panel__hint--error {
  color: #fb7185;
}

.workspace-device-arrangement-panel__canvas-viewport {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  place-items: center;
  border: 1px solid transparent;
  padding: 24px;
  background-color: #171717;
  background-image:
    linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%);
  background-position:
    0 0,
    0 16px,
    16px -16px,
    -16px 0;
  background-size: 32px 32px;
}

.workspace-device-arrangement-panel__canvas-sheet {
  position: relative;
  width: min(100%, calc((100vh - 168px) * var(--device-arrangement-canvas-ratio, 1)));
  max-width: min(100%, 1040px);
  height: auto;
  max-height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
}

.workspace-device-arrangement-panel__canvas-render,
.workspace-device-arrangement-panel__canvas-background {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.workspace-device-arrangement-panel__canvas-background--solid {
  background: var(--device-arrangement-bg, #f8fafc);
}

.workspace-device-arrangement-panel__canvas-background--gradient {
  background: linear-gradient(135deg, var(--device-arrangement-bg, #f8fafc), #fff);
}

.workspace-device-arrangement-panel__canvas-background--transparent {
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.08) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.08) 75%);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
}

.workspace-device-arrangement-panel__preview-device {
  position: absolute;
  display: block;
  border: 0;
  background: transparent;
  padding: 0;
  transform-origin: 50% 50%;
}

.workspace-device-arrangement-panel__preview-frame {
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.34);
}

.workspace-device-arrangement-panel__preview-device--none .workspace-device-arrangement-panel__preview-frame {
  box-shadow: none;
}

.workspace-device-arrangement-panel__preview-device--active .workspace-device-arrangement-panel__preview-frame {
  outline: 2px solid rgba(244, 244, 245, 0.92);
  outline-offset: 7px;
}

.workspace-device-arrangement-panel__preview-screen {
  position: absolute;
  display: block;
  overflow: hidden;
  background: #27272a;
}

.workspace-device-arrangement-panel__preview-screen img,
.workspace-device-arrangement-panel__preview-shell,
.workspace-device-arrangement-panel__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.workspace-device-arrangement-panel__preview-shell {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.workspace-device-arrangement-panel__watermark {
  position: absolute;
  right: 4%;
  bottom: 4%;
  color: rgba(15, 23, 42, 0.62);
  font-size: 20px;
  font-weight: 750;
}

.workspace-device-arrangement-panel__empty {
  position: absolute;
  inset: 50% auto auto 50%;
  display: grid;
  width: min(280px, calc(100% - 32px));
  min-height: 154px;
  transform: translate(-50%, -50%);
  place-items: center;
  gap: 3px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(17, 18, 20, 0.92);
  padding: 18px;
  color: #f4f4f5;
  text-align: center;
}

.workspace-device-arrangement-panel__empty::before {
  content: '+';
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid #f4f4f5;
  border-radius: 999px;
  color: #f4f4f5;
  font-size: 28px;
  font-weight: 400;
  line-height: 1;
}

.workspace-device-arrangement-panel__empty strong {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 800;
}

.workspace-device-arrangement-panel__empty span {
  color: #9699a2;
  font-size: 12px;
}

.workspace-device-arrangement-panel__empty--locked::before {
  content: '!';
}

.workspace-device-arrangement-panel__lock-badge {
  flex: 0 0 auto;
  border: 1px solid rgba(251, 191, 36, 0.42);
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  font-size: 12px;
  font-weight: 750;
  padding: 5px 9px;
}

.workspace-device-arrangement-panel__image-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  padding: 9px;
}

.workspace-device-arrangement-panel__thumb {
  display: block;
  width: 72px;
  height: 96px;
  overflow: hidden;
  border: 1px solid #2b2d32;
  border-radius: 7px;
  background: #0b0b0c;
  padding: 0;
}

.workspace-device-arrangement-panel__image-meta {
  min-width: 0;
}

@media (max-width: 1280px) {
  .workspace-device-arrangement-panel {
    grid-template-columns: 1fr;
  }

  .workspace-device-arrangement-panel__sidebar,
  .workspace-device-arrangement-panel__inspector {
    max-height: 38vh;
    border-right: 0;
    border-left: 0;
  }

  .workspace-device-arrangement-panel__stage {
    min-height: 68vh;
    order: -1;
  }
}
</style>
