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

interface DeviceChoice {
  key: string
  label: string
  meta: string
  source: 'catalog' | 'builtin'
  variant?: MockupProjectCatalogVariant | null
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

const runtime = useRuntimeConfig()
const { endpoint, resolveApiUrl } = useApiEndpoint(runtime)

const fileInputRef = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const saving = ref(false)
const exportBusy = ref(false)
const errorMessage = ref('')
const screenshotUploadError = ref('')
const exportError = ref('')
const selectedItemId = ref('')
const dragOver = ref(false)
const activeTemplateKey = ref('')
const savedDocumentSnapshot = ref('')
const mockupCatalog = ref<MockupProjectCatalog | null>(null)
const localScreenshotSrcByItemId = ref<Record<string, string>>({})
const hydratedScreenshotSrcByItemId = ref<Record<string, string>>({})
const documentState = ref<DeviceArrangementDocumentV1>(createAutomaticLayoutDocument({
  title: props.resourceTitle,
}))
let hydrationRunId = 0

function normalizeString(value: unknown): string {
  return String(value || '').trim()
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
        categoryTitle: category.title,
        modelTitle: model.title,
        variant,
      })),
    ),
  )
})

const catalogDeviceChoices = computed<DeviceChoice[]>(() => {
  return variantEntries.value.map(({ categoryTitle, modelTitle, variant }) => ({
    key: variant.presetKey,
    label: `${modelTitle} / ${variant.title}`,
    meta: `${categoryTitle} · ${variant.resolvedPreset.screenWidth}×${variant.resolvedPreset.screenHeight}`,
    source: 'catalog',
    variant,
  }))
})

const builtinDeviceChoices = computed<DeviceChoice[]>(() => {
  return DEVICE_ARRANGEMENT_BUILTIN_DEVICE_PRESETS.map(preset => ({
    key: preset.key,
    label: preset.title,
    meta: `${preset.group} · ${preset.screenWidth}×${preset.screenHeight}`,
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

const canvasWidth = computed(() => Math.max(1, documentState.value.canvas.width))
const canvasHeight = computed(() => Math.max(1, documentState.value.canvas.height))
const canvasAspectRatio = computed(() => `${canvasWidth.value} / ${canvasHeight.value}`)
const isDirty = computed(() => {
  return savedDocumentSnapshot.value !== serializeDocument(documentState.value)
})
const activeLayoutPreset = computed(() => {
  return DEVICE_ARRANGEMENT_LAYOUT_PRESETS.find(item => item.key === documentState.value.layoutPresetKey)
})
const selectedStatusText = computed(() => {
  const count = documentState.value.items.length
  if (loading.value)
    return '加载设备画布中'
  if (count === 0)
    return '选择模板后，从右侧导入截图'
  return `${count} 张截图 · ${activeLayoutPreset.value?.title || '自动排版'}`
})
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
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const response = await fetch(endpoint(`/projects/${projectId}/device-arrangements/${resourceId}`), {
      credentials: 'include',
    })
    const result = await response.json().catch(() => null) as ApiResponse<{
      arrangement: { document: DeviceArrangementDocumentV1 }
    }> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '设备排布加载失败。'))
    const nextDocument = createAutomaticLayoutDocument(result.data?.arrangement?.document || { title: props.resourceTitle })
    commitDocument(nextDocument, { selectedItemId: nextDocument.items[0]?.id || '' })
    markSaved(nextDocument)
  }
  catch (error) {
    errorMessage.value = String(error instanceof Error ? error.message : '设备排布加载失败。')
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

function resolveVariantByPresetKey(presetKey: string): MockupProjectCatalogVariant | null {
  return variantEntries.value.find(entry => entry.variant.presetKey === presetKey)?.variant || null
}

function resolveDeviceChoice(presetKey: string): DeviceChoice | null {
  return deviceChoices.value.find(choice => choice.key === presetKey)
    || deviceChoices.value[0]
    || null
}

function resolveDefaultDeviceChoice(): DeviceChoice {
  return deviceChoices.value[0] || {
    key: 'iphone-16-pro',
    label: 'iPhone 16 Pro',
    meta: 'iPhone · 393×852',
    source: 'builtin',
    variant: null,
  }
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
  commitDocument(cloneDocument())
}

function applyTemplate(templateKey: string): void {
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
  const current = cloneDocument()
  current.canvas.background = background
  activeTemplateKey.value = ''
  commitDocument(current)
}

function updateCanvasBackgroundMode(backgroundMode: DeviceArrangementDocumentV1['canvas']['backgroundMode']): void {
  const current = cloneDocument()
  current.canvas.backgroundMode = backgroundMode
  activeTemplateKey.value = ''
  commitDocument(current)
}

function updateItem(itemId: string, patch: Partial<DeviceArrangementItemV1>): void {
  const current = cloneDocument()
  current.items = current.items.map((item) => {
    if (item.id !== itemId)
      return item
    const nextPresetKey = normalizeString(patch.devicePresetKey || item.devicePresetKey) || item.devicePresetKey
    const nextVariant = resolveVariantByPresetKey(nextPresetKey)
    return resetItemManualTransform({
      ...item,
      ...patch,
      devicePresetKey: nextPresetKey,
      shell: nextVariant
        ? {
            mode: nextVariant.shellAssetUrl || nextVariant.shellAssetPayload ? 'external' : 'builtin',
            assetId: nextVariant.shellAssetItemId || undefined,
            imageSrc: nextVariant.shellAssetUrl,
            viewportRect: nextVariant.shellAssetPayload?.viewportRect || null,
            cornerRadius: nextVariant.shellAssetPayload?.cornerRadius,
            presetKey: nextVariant.presetKey,
          }
        : (patch.shell || {
            ...item.shell,
            mode: 'builtin',
            imageSrc: undefined,
            viewportRect: null,
            presetKey: nextPresetKey,
          }),
    })
  })
  commitDocument(current, { selectedItemId: itemId })
}

function removeItem(itemId: string): void {
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
  if (!projectId || !resourceId)
    return

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
      }),
    })
    const result = await response.json().catch(() => null) as ApiResponse<{
      arrangement: { document: DeviceArrangementDocumentV1 }
    }> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '保存失败。'))
    const nextDocument = createAutomaticLayoutDocument(result.data?.arrangement?.document || document)
    commitDocument(nextDocument)
    markSaved(nextDocument)
  }
  catch (error) {
    errorMessage.value = String(error instanceof Error ? error.message : '保存失败。')
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

onBeforeUnmount(() => {
  hydrationRunId += 1
})
</script>

<template>
  <div
    class="workspace-device-arrangement-panel"
    data-testid="workspace-device-arrangement-panel"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @paste="handlePaste"
  >
    <aside class="workspace-device-arrangement-panel__sidebar" data-testid="workspace-device-arrangement-workbench">
      <header class="workspace-device-arrangement-panel__header">
        <div>
          <p class="workspace-device-arrangement-panel__eyebrow">
            设备画布
          </p>
          <input v-model="documentState.title" class="workspace-device-arrangement-panel__title-input" type="text">
        </div>
        <span
          class="workspace-device-arrangement-panel__save-state"
          :class="{ 'workspace-device-arrangement-panel__save-state--dirty': isDirty }"
          data-testid="workspace-device-arrangement-dirty-state"
        >
          {{ isDirty ? '未保存' : '已保存' }}
        </span>
      </header>

      <section class="workspace-device-arrangement-panel__section" data-testid="workspace-device-arrangement-template-panel">
        <div class="workspace-device-arrangement-panel__section-title">
          模板
        </div>
        <div class="workspace-device-arrangement-panel__template-grid">
          <button
            v-for="template in DEVICE_ARRANGEMENT_TEMPLATE_PRESETS"
            :key="template.key"
            class="workspace-device-arrangement-panel__template"
            :class="{ 'workspace-device-arrangement-panel__template--active': activeTemplateKey === template.key }"
            type="button"
            @click="applyTemplate(template.key)"
          >
            <span class="workspace-device-arrangement-panel__template-preview" :style="{ background: template.backgroundMode === 'gradient' ? `linear-gradient(135deg, ${template.background}, #fff)` : template.background }">
              <i />
              <i />
              <i />
            </span>
            <strong>{{ template.title }}</strong>
            <small>{{ template.summary }}</small>
          </button>
        </div>
      </section>

      <section class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          画布
        </div>
        <label class="workspace-device-arrangement-panel__field">
          <span>自动布局</span>
          <select v-model="documentState.layoutPresetKey" class="workspace-device-arrangement-panel__input" @change="relayoutCurrentDocument">
            <option v-for="preset in DEVICE_ARRANGEMENT_LAYOUT_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>尺寸</span>
          <select :value="documentState.canvas.sizePresetKey" class="workspace-device-arrangement-panel__input" @change="updateCanvasSize(($event.target as HTMLSelectElement).value as DeviceArrangementExportSizePresetKey)">
            <option v-for="preset in DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>背景</span>
          <input :value="documentState.canvas.background" class="workspace-device-arrangement-panel__input" type="text" @change="updateCanvasBackground(($event.target as HTMLInputElement).value)">
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>模式</span>
          <select :value="documentState.canvas.backgroundMode" class="workspace-device-arrangement-panel__input" @change="updateCanvasBackgroundMode(($event.target as HTMLSelectElement).value as DeviceArrangementDocumentV1['canvas']['backgroundMode'])">
            <option value="solid">纯色</option>
            <option value="gradient">渐变</option>
            <option value="transparent">透明</option>
          </select>
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>阴影</span>
          <select v-model="documentState.shadowPresetKey" class="workspace-device-arrangement-panel__input" @change="relayoutCurrentDocument">
            <option v-for="preset in DEVICE_ARRANGEMENT_SHADOW_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
      </section>

      <section class="workspace-device-arrangement-panel__section" data-testid="workspace-device-arrangement-export-actions">
        <div class="workspace-device-arrangement-panel__section-title">
          导出
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
        <button
          class="workspace-device-arrangement-panel__button workspace-device-arrangement-panel__button--primary"
          type="button"
          :disabled="saving || !isDirty"
          @click="saveDocument"
        >
          {{ saving ? '保存中' : '保存' }}
        </button>
      </div>

      <div
        class="workspace-device-arrangement-panel__canvas-viewport"
        :class="{ 'workspace-device-arrangement-panel__canvas-viewport--dragover': dragOver }"
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
          <button
            v-else-if="documentState.items.length === 0"
            class="workspace-device-arrangement-panel__empty"
            type="button"
            @click.stop="fileInputRef?.click()"
          >
            <strong>导入第一张截图</strong>
            <span>右侧上传、拖拽或粘贴图片后，模板会自动完成排版。</span>
          </button>
        </div>
      </div>
    </main>

    <aside class="workspace-device-arrangement-panel__inspector" data-testid="workspace-device-arrangement-image-panel">
      <section class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          截图
        </div>
        <button
          class="workspace-device-arrangement-panel__dropzone"
          :class="{ 'workspace-device-arrangement-panel__dropzone--active': dragOver }"
          data-testid="workspace-device-arrangement-dropzone"
          type="button"
          @click="fileInputRef?.click()"
        >
          <span>上传或拖入截图</span>
          <small>支持粘贴截图，导入后自动套入当前模板。</small>
        </button>
        <input
          ref="fileInputRef"
          class="hidden"
          accept="image/*"
          multiple
          type="file"
          @change="handleFileInputChange"
        >
        <p v-if="screenshotUploadError" class="workspace-device-arrangement-panel__hint workspace-device-arrangement-panel__hint--error">
          {{ screenshotUploadError }}
        </p>
      </section>

      <section class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          图片与设备壳
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
                <input :value="item.name" class="workspace-device-arrangement-panel__input" type="text" @change="updateItem(item.id, { name: ($event.target as HTMLInputElement).value })">
              </label>
              <label class="workspace-device-arrangement-panel__field workspace-device-arrangement-panel__field--compact">
                <span>设备壳</span>
                <select
                  :value="item.devicePresetKey"
                  class="workspace-device-arrangement-panel__input"
                  @change="updateItem(item.id, { devicePresetKey: ($event.target as HTMLSelectElement).value })"
                >
                  <option v-for="choice in deviceChoices" :key="`${choice.source}-${choice.key}`" :value="choice.key">
                    {{ choice.label }}
                  </option>
                </select>
                <small>{{ resolveDeviceChoice(item.devicePresetKey)?.meta || '内置设备' }}</small>
              </label>
              <div class="workspace-device-arrangement-panel__actions workspace-device-arrangement-panel__actions--compact">
                <button class="workspace-device-arrangement-panel__button" type="button" @click.stop="duplicateItem(item.id)">
                  复制
                </button>
                <button class="workspace-device-arrangement-panel__button workspace-device-arrangement-panel__button--danger" type="button" @click.stop="removeItem(item.id)">
                  删除
                </button>
              </div>
            </div>
          </article>
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
  grid-template-columns: 288px minmax(0, 1fr) 336px;
  border: 1px solid #e5e7eb;
  background: #f6f7f9;
  color: #0f172a;
}

.workspace-device-arrangement-panel__sidebar,
.workspace-device-arrangement-panel__inspector {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: #fff;
}

.workspace-device-arrangement-panel__sidebar {
  border-right: 1px solid #e5e7eb;
}

.workspace-device-arrangement-panel__inspector {
  border-left: 1px solid #e5e7eb;
}

.workspace-device-arrangement-panel__stage {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
}

.workspace-device-arrangement-panel__header,
.workspace-device-arrangement-panel__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #e5e7eb;
  padding: 12px;
}

.workspace-device-arrangement-panel__toolbar {
  background: #fff;
}

.workspace-device-arrangement-panel__eyebrow {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.workspace-device-arrangement-panel__title-input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: #0f172a;
  font-size: 16px;
  font-weight: 750;
  outline: none;
}

.workspace-device-arrangement-panel__save-state {
  flex: 0 0 auto;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 3px 8px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.workspace-device-arrangement-panel__save-state--dirty {
  border-color: #f59e0b;
  color: #92400e;
  background: #fffbeb;
}

.workspace-device-arrangement-panel__section {
  padding: 12px;
}

.workspace-device-arrangement-panel__section + .workspace-device-arrangement-panel__section {
  border-top: 1px solid #eef2f7;
}

.workspace-device-arrangement-panel__section-title {
  margin-bottom: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 750;
}

.workspace-device-arrangement-panel__template-grid,
.workspace-device-arrangement-panel__image-list {
  display: grid;
  gap: 8px;
}

.workspace-device-arrangement-panel__template {
  display: grid;
  gap: 7px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  padding: 9px;
  color: #0f172a;
  text-align: left;
}

.workspace-device-arrangement-panel__template--active,
.workspace-device-arrangement-panel__image-card--active {
  border-color: #2563eb;
  background: #eff6ff;
}

.workspace-device-arrangement-panel__template-preview {
  position: relative;
  display: block;
  height: 52px;
  overflow: hidden;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
}

.workspace-device-arrangement-panel__template-preview i {
  position: absolute;
  bottom: 9px;
  width: 22px;
  height: 34px;
  border-radius: 5px;
  background: #0f172a;
}

.workspace-device-arrangement-panel__template-preview i:nth-child(1) {
  left: 32%;
  transform: rotate(-8deg);
}

.workspace-device-arrangement-panel__template-preview i:nth-child(2) {
  left: 45%;
  height: 39px;
}

.workspace-device-arrangement-panel__template-preview i:nth-child(3) {
  left: 58%;
  transform: rotate(8deg);
}

.workspace-device-arrangement-panel__template strong,
.workspace-device-arrangement-panel__dropzone span {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-device-arrangement-panel__template small,
.workspace-device-arrangement-panel__dropzone small,
.workspace-device-arrangement-panel__field small {
  overflow: hidden;
  max-width: 100%;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-device-arrangement-panel__field {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.workspace-device-arrangement-panel__field--compact {
  margin-bottom: 8px;
}

.workspace-device-arrangement-panel__input {
  width: 100%;
  min-width: 0;
  border: 1px solid #dbe3ef;
  border-radius: 7px;
  background: #fff;
  padding: 8px 9px;
  color: #0f172a;
  font-size: 12px;
  outline: none;
}

.workspace-device-arrangement-panel__input:focus {
  border-color: #93b4ff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.workspace-device-arrangement-panel__button {
  min-width: 0;
  border: 1px solid #dbe3ef;
  border-radius: 7px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  font-weight: 750;
  line-height: 1;
  padding: 9px 10px;
}

.workspace-device-arrangement-panel__button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.workspace-device-arrangement-panel__button--primary {
  border-color: #0f172a;
  background: #0f172a;
  color: #fff;
}

.workspace-device-arrangement-panel__button--danger {
  border-color: #fecaca;
  color: #b91c1c;
}

.workspace-device-arrangement-panel__dropzone {
  display: flex;
  width: 100%;
  min-height: 82px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  padding: 12px;
  color: #0f172a;
  text-align: left;
}

.workspace-device-arrangement-panel__dropzone--active,
.workspace-device-arrangement-panel__canvas-viewport--dragover {
  border-color: #2563eb;
  background: #eff6ff;
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
  margin-top: 4px;
}

.workspace-device-arrangement-panel__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #475569;
  font-size: 12px;
  font-weight: 650;
}

.workspace-device-arrangement-panel__hint {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.workspace-device-arrangement-panel__hint--error {
  color: #b91c1c;
}

.workspace-device-arrangement-panel__canvas-viewport {
  min-height: 0;
  overflow: auto;
  border: 1px solid transparent;
  padding: 28px;
}

.workspace-device-arrangement-panel__canvas-sheet {
  position: relative;
  width: min(100%, 1120px);
  margin: 0 auto;
  border: 1px solid #dbe3ef;
  background: #fff;
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
    linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
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
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
}

.workspace-device-arrangement-panel__preview-device--none .workspace-device-arrangement-panel__preview-frame {
  box-shadow: none;
}

.workspace-device-arrangement-panel__preview-device--active .workspace-device-arrangement-panel__preview-frame {
  outline: 3px solid rgba(37, 99, 235, 0.85);
  outline-offset: 6px;
}

.workspace-device-arrangement-panel__preview-screen {
  position: absolute;
  display: block;
  overflow: hidden;
  background: #e2e8f0;
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
  color: rgba(71, 85, 105, 0.72);
  font-size: 20px;
  font-weight: 750;
}

.workspace-device-arrangement-panel__empty {
  position: absolute;
  inset: 50% auto auto 50%;
  display: grid;
  width: min(340px, calc(100% - 32px));
  transform: translate(-50%, -50%);
  gap: 6px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  padding: 18px;
  color: #0f172a;
  text-align: center;
}

.workspace-device-arrangement-panel__empty span {
  color: #64748b;
  font-size: 12px;
}

.workspace-device-arrangement-panel__image-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  padding: 9px;
}

.workspace-device-arrangement-panel__thumb {
  display: block;
  width: 72px;
  height: 96px;
  overflow: hidden;
  border: 1px solid #dbe3ef;
  border-radius: 7px;
  background: #f8fafc;
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
    max-height: 36vh;
    border-right: 0;
    border-left: 0;
  }

  .workspace-device-arrangement-panel__stage {
    min-height: 68vh;
    order: -1;
  }
}
</style>
