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

interface CanvasPoint {
  x: number
  y: number
}

interface DeviceInteractionState {
  itemId: string
  mode: 'move' | 'resize' | 'rotate'
  startPoint: CanvasPoint
  startItem: DeviceArrangementItemV1
  startDistance: number
  startAngle: number
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
const { endpoint } = useApiEndpoint(runtime)

const fileInputRef = ref<HTMLInputElement | null>(null)
const stageSheetRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const saving = ref(false)
const exportBusy = ref(false)
const errorMessage = ref('')
const screenshotUploadError = ref('')
const exportError = ref('')
const selectedItemId = ref('')
const dragOver = ref(false)
const savedDocumentSnapshot = ref('')
const mockupCatalog = ref<MockupProjectCatalog | null>(null)
const interactionState = ref<DeviceInteractionState | null>(null)
const documentState = ref<DeviceArrangementDocumentV1>(normalizeDeviceArrangementDocument({
  title: props.resourceTitle,
}))

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function cloneDocument(): DeviceArrangementDocumentV1 {
  return JSON.parse(JSON.stringify(documentState.value)) as DeviceArrangementDocumentV1
}

function serializeDocument(value: DeviceArrangementDocumentV1): string {
  return JSON.stringify(normalizeDeviceArrangementDocument(value, { relayout: false }))
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
  relayout?: boolean
  selectedItemId?: string
} = {}): void {
  documentState.value = normalizeDeviceArrangementDocument(nextDocument, {
    relayout: options.relayout ?? false,
  })
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

const previewMarkup = computed(() => renderDeviceArrangementDocumentToSvg(documentState.value))
const canvasWidth = computed(() => Math.max(1, documentState.value.canvas.width))
const canvasHeight = computed(() => Math.max(1, documentState.value.canvas.height))
const canvasViewBox = computed(() => `0 0 ${canvasWidth.value} ${canvasHeight.value}`)
const canvasAspectRatio = computed(() => `${canvasWidth.value} / ${canvasHeight.value}`)
const selectedItem = computed(() => {
  return documentState.value.items.find(item => item.id === selectedItemId.value) || null
})
const isDirty = computed(() => {
  return savedDocumentSnapshot.value !== serializeDocument(documentState.value)
})
const selectedItemIndex = computed(() => {
  return selectedItem.value
    ? documentState.value.items.findIndex(item => item.id === selectedItem.value?.id)
    : -1
})
const selectedDeviceChoice = computed(() => {
  if (!selectedItem.value)
    return null
  return resolveDeviceChoice(selectedItem.value.devicePresetKey)
})
const selectedStatusText = computed(() => {
  if (selectedItem.value)
    return `${selectedItem.value.name} · ${Math.round(selectedItem.value.width)}×${Math.round(selectedItem.value.height)}`
  return documentState.value.items.length > 0 ? '选择画布上的设备继续编辑' : '导入截图后开始排布'
})
const canMoveLayerDown = computed(() => selectedItemIndex.value > 0)
const canMoveLayerUp = computed(() => selectedItemIndex.value >= 0 && selectedItemIndex.value < documentState.value.items.length - 1)

async function loadDocument(): Promise<void> {
  const projectId = normalizeString(props.projectId)
  const resourceId = normalizeString(props.resourceId)
  if (!projectId || !resourceId)
    return

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
    const nextDocument = normalizeDeviceArrangementDocument(result.data?.arrangement?.document || { title: props.resourceTitle }, { relayout: false })
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

function resolveScreenshotAssetSrc(file: File, fallbackSrc: string): Promise<string> {
  return uploadDeviceArrangementScreenshotAsset({
    endpoint,
    projectId: props.projectId,
    file,
  }).catch(() => fallbackSrc)
}

function readImageFile(file: File): Promise<{ src: string, width: number, height: number, name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取截图失败。'))
    reader.onload = async () => {
      try {
        const localSrc = normalizeString(reader.result)
        const uploadedSrc = await resolveScreenshotAssetSrc(file, localSrc)
        const image = new Image()
        image.onload = () => resolve({
          src: uploadedSrc || localSrc,
          width: image.naturalWidth || 0,
          height: image.naturalHeight || 0,
          name: file.name || '截图',
        })
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
      lastCreatedItemId = item.id
    }
    current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
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
  const current = cloneDocument()
  current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
  commitDocument(current)
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
  current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
  commitDocument(current)
}

function updateCanvasSize(sizePresetKey: DeviceArrangementExportSizePresetKey): void {
  const current = cloneDocument()
  const size = resolveDeviceArrangementSize(sizePresetKey, current.canvas.width, current.canvas.height)
  current.canvas.width = size.width
  current.canvas.height = size.height
  current.canvas.sizePresetKey = size.sizePresetKey
  current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
  if (!current.exportSizePresetKeys.includes(size.sizePresetKey))
    current.exportSizePresetKeys = [...current.exportSizePresetKeys, size.sizePresetKey]
  commitDocument(current)
}

function updateItem(itemId: string, patch: Partial<DeviceArrangementItemV1>, relayout = true): void {
  const current = cloneDocument()
  current.items = current.items.map((item) => {
    if (item.id !== itemId)
      return item
    const nextPresetKey = normalizeString(patch.devicePresetKey || item.devicePresetKey) || item.devicePresetKey
    const nextVariant = resolveVariantByPresetKey(nextPresetKey)
    return {
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
    }
  })
  if (relayout)
    current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
  commitDocument(current, { selectedItemId: itemId })
}

function removeItem(itemId: string): void {
  const current = cloneDocument()
  const removeIndex = current.items.findIndex(item => item.id === itemId)
  current.items = current.items.filter(item => item.id !== itemId)
  const nextSelectedItemId = current.items[Math.min(removeIndex, current.items.length - 1)]?.id || ''
  commitDocument(current, { selectedItemId: nextSelectedItemId })
}

function duplicateItem(itemId: string): void {
  const current = cloneDocument()
  const item = current.items.find(entry => entry.id === itemId)
  if (!item)
    return
  const nextItem: DeviceArrangementItemV1 = {
    ...JSON.parse(JSON.stringify(item)),
    id: `device-copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${item.name} 副本`,
    x: item.x + 32,
    y: item.y + 32,
    offsetX: item.offsetX + 32,
    offsetY: item.offsetY + 32,
  }
  const index = current.items.findIndex(entry => entry.id === itemId)
  current.items.splice(index + 1, 0, nextItem)
  commitDocument(current, { selectedItemId: nextItem.id })
}

function moveItemLayer(itemId: string, direction: 'backward' | 'forward' | 'back' | 'front'): void {
  const current = cloneDocument()
  const index = current.items.findIndex(item => item.id === itemId)
  if (index < 0)
    return
  const [item] = current.items.splice(index, 1)
  if (!item)
    return
  if (direction === 'back') {
    current.items.unshift(item)
  }
  else if (direction === 'front') {
    current.items.push(item)
  }
  else {
    const nextIndex = direction === 'forward'
      ? Math.min(current.items.length, index + 1)
      : Math.max(0, index - 1)
    current.items.splice(nextIndex, 0, item)
  }
  commitDocument(current, { selectedItemId: itemId })
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
    const response = await fetch(endpoint(`/projects/${projectId}/device-arrangements/${resourceId}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: documentState.value.title,
        document: documentState.value,
      }),
    })
    const result = await response.json().catch(() => null) as ApiResponse<{
      arrangement: { document: DeviceArrangementDocumentV1 }
    }> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '保存失败。'))
    const nextDocument = normalizeDeviceArrangementDocument(result.data?.arrangement?.document || documentState.value, { relayout: false })
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
  current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
  return current
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
  const exportDocument = buildExportDocument(sizePresetKey)
  downloadSvgBlob(`${sanitizeFileName(exportDocument.title)}-${sizePresetKey}.svg`, renderDeviceArrangementDocumentToSvg(exportDocument))
}

async function downloadPresetPng(sizePresetKey: DeviceArrangementExportSizePresetKey): Promise<void> {
  const exportDocument = buildExportDocument(sizePresetKey)
  const svg = renderDeviceArrangementDocumentToSvg(exportDocument)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'
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
      throw new Error('PNG 导出被浏览器拦截，通常是截图或设备壳跨域资源未允许 Canvas 导出。请先保存为 SVG，或重新上传图片资源后再导出 PNG。')
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

function resolveCanvasPoint(event: PointerEvent): CanvasPoint {
  const sheet = stageSheetRef.value
  if (!sheet)
    return { x: 0, y: 0 }
  const rect = sheet.getBoundingClientRect()
  const x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * canvasWidth.value : 0
  const y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * canvasHeight.value : 0
  return {
    x: clampNumber(x, -canvasWidth.value, canvasWidth.value * 2),
    y: clampNumber(y, -canvasHeight.value, canvasHeight.value * 2),
  }
}

function distanceBetween(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angleBetween(a: CanvasPoint, b: CanvasPoint): number {
  return Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI
}

function itemCenter(item: DeviceArrangementItemV1): CanvasPoint {
  return {
    x: item.x + item.width / 2,
    y: item.y + item.height / 2,
  }
}

function stopInteraction(): void {
  interactionState.value = null
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerUp)
}

function beginItemInteraction(event: PointerEvent, item: DeviceArrangementItemV1, mode: DeviceInteractionState['mode']): void {
  event.preventDefault()
  event.stopPropagation()
  selectedItemId.value = item.id
  const startPoint = resolveCanvasPoint(event)
  const center = itemCenter(item)
  interactionState.value = {
    itemId: item.id,
    mode,
    startPoint,
    startItem: JSON.parse(JSON.stringify(item)) as DeviceArrangementItemV1,
    startDistance: Math.max(1, distanceBetween(startPoint, center)),
    startAngle: angleBetween(startPoint, center),
  }
  window.addEventListener('pointermove', handleWindowPointerMove)
  window.addEventListener('pointerup', handleWindowPointerUp)
}

function handleWindowPointerMove(event: PointerEvent): void {
  const state = interactionState.value
  if (!state)
    return
  event.preventDefault()
  const point = resolveCanvasPoint(event)
  if (state.mode === 'move') {
    const dx = Math.round(point.x - state.startPoint.x)
    const dy = Math.round(point.y - state.startPoint.y)
    updateItem(state.itemId, {
      offsetX: state.startItem.offsetX + dx,
      offsetY: state.startItem.offsetY + dy,
    })
    return
  }

  const center = itemCenter(state.startItem)
  if (state.mode === 'resize') {
    const nextDistance = Math.max(1, distanceBetween(point, center))
    const nextScale = Number(clampNumber(state.startItem.scale * (nextDistance / state.startDistance), 0.25, 3).toFixed(2))
    updateItem(state.itemId, { scale: nextScale })
    return
  }

  const nextAngle = angleBetween(point, center)
  const nextRotation = Math.round(clampNumber(state.startItem.rotationOffset + nextAngle - state.startAngle, -45, 45))
  updateItem(state.itemId, { rotationOffset: nextRotation })
}

function handleWindowPointerUp(): void {
  stopInteraction()
}

function clearSelection(): void {
  selectedItemId.value = ''
}

function handleCanvasPointerDown(): void {
  clearSelection()
}

function selectItem(itemId: string): void {
  selectedItemId.value = itemId
}

function handleKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)
    return
  const item = selectedItem.value
  if (!item)
    return
  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault()
    removeItem(item.id)
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    duplicateItem(item.id)
    return
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
    return
  event.preventDefault()
  const step = event.shiftKey ? 10 : 1
  const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
  const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
  updateItem(item.id, {
    offsetX: item.offsetX + dx,
    offsetY: item.offsetY + dy,
  })
}

watch(() => [props.projectId, props.resourceId], () => {
  void loadDocument()
  void loadMockupCatalog()
}, { immediate: true })

onBeforeUnmount(() => {
  stopInteraction()
})
</script>

<template>
  <div
    class="workspace-device-arrangement-panel"
    data-testid="workspace-device-arrangement-panel"
    tabindex="0"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @keydown="handleKeydown"
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
          <small>支持粘贴截图，自动进入当前画布。</small>
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
          模板
        </div>
        <div class="workspace-device-arrangement-panel__template-grid">
          <button
            v-for="template in DEVICE_ARRANGEMENT_TEMPLATE_PRESETS"
            :key="template.key"
            class="workspace-device-arrangement-panel__chip"
            type="button"
            @click="applyTemplate(template.key)"
          >
            <strong>{{ template.title }}</strong>
            <span>{{ template.summary }}</span>
          </button>
        </div>
      </section>

      <section class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          画布
        </div>
        <label class="workspace-device-arrangement-panel__field">
          <span>布局</span>
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
          <input v-model="documentState.canvas.background" class="workspace-device-arrangement-panel__input" type="text">
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>模式</span>
          <select v-model="documentState.canvas.backgroundMode" class="workspace-device-arrangement-panel__input">
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
          <button class="workspace-device-arrangement-panel__button" type="button" @click="runExport(() => downloadPresetSvg(documentState.canvas.sizePresetKey))">
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
          ref="stageSheetRef"
          class="workspace-device-arrangement-panel__canvas-sheet"
          data-testid="workspace-device-arrangement-canvas-sheet"
          :style="{ aspectRatio: canvasAspectRatio }"
          @pointerdown="handleCanvasPointerDown"
        >
          <div class="workspace-device-arrangement-panel__canvas-render" v-html="previewMarkup" />
          <svg
            class="workspace-device-arrangement-panel__interaction-layer"
            data-testid="workspace-device-arrangement-interaction-layer"
            :viewBox="canvasViewBox"
            preserveAspectRatio="none"
          >
            <g v-for="item in documentState.items" :key="item.id">
              <rect
                class="workspace-device-arrangement-panel__hit-area"
                :class="{ 'workspace-device-arrangement-panel__hit-area--selected': item.id === selectedItemId }"
                :x="item.x"
                :y="item.y"
                :width="item.width"
                :height="item.height"
                :transform="`rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})`"
                @pointerdown="beginItemInteraction($event, item, 'move')"
              />
              <template v-if="item.id === selectedItemId">
                <rect
                  class="workspace-device-arrangement-panel__selection-outline"
                  data-testid="workspace-device-arrangement-selected-outline"
                  :x="item.x"
                  :y="item.y"
                  :width="item.width"
                  :height="item.height"
                  :transform="`rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})`"
                />
                <circle
                  class="workspace-device-arrangement-panel__resize-handle"
                  :cx="item.x + item.width"
                  :cy="item.y + item.height"
                  r="18"
                  @pointerdown="beginItemInteraction($event, item, 'resize')"
                />
                <line
                  class="workspace-device-arrangement-panel__rotate-line"
                  :x1="item.x + item.width / 2"
                  :y1="item.y"
                  :x2="item.x + item.width / 2"
                  :y2="item.y - 72"
                />
                <circle
                  class="workspace-device-arrangement-panel__rotate-handle"
                  :cx="item.x + item.width / 2"
                  :cy="item.y - 72"
                  r="18"
                  @pointerdown="beginItemInteraction($event, item, 'rotate')"
                />
              </template>
            </g>
          </svg>
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
            <span>上传、拖拽或粘贴图片后即可套用设备壳。</span>
          </button>
        </div>
      </div>
    </main>

    <aside class="workspace-device-arrangement-panel__inspector">
      <section v-if="selectedItem" class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          选中设备
        </div>
        <label class="workspace-device-arrangement-panel__field">
          <span>名称</span>
          <input :value="selectedItem.name" class="workspace-device-arrangement-panel__input" type="text" @change="updateItem(selectedItem.id, { name: ($event.target as HTMLInputElement).value }, false)">
        </label>
        <label class="workspace-device-arrangement-panel__field">
          <span>设备壳</span>
          <select
            :value="selectedItem.devicePresetKey"
            class="workspace-device-arrangement-panel__input"
            @change="updateItem(selectedItem.id, { devicePresetKey: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="choice in deviceChoices" :key="`${choice.source}-${choice.key}`" :value="choice.key">
              {{ choice.label }}
            </option>
          </select>
          <small>{{ selectedDeviceChoice?.meta || '内置设备' }}</small>
        </label>

        <div class="workspace-device-arrangement-panel__manual-grid" data-testid="workspace-device-arrangement-manual-transform">
          <label class="workspace-device-arrangement-panel__field">
            <span>X</span>
            <input :value="selectedItem.offsetX" class="workspace-device-arrangement-panel__input" type="number" @change="updateItem(selectedItem.id, { offsetX: Number(($event.target as HTMLInputElement).value || 0) })">
          </label>
          <label class="workspace-device-arrangement-panel__field">
            <span>Y</span>
            <input :value="selectedItem.offsetY" class="workspace-device-arrangement-panel__input" type="number" @change="updateItem(selectedItem.id, { offsetY: Number(($event.target as HTMLInputElement).value || 0) })">
          </label>
          <label class="workspace-device-arrangement-panel__field">
            <span>缩放</span>
            <input :value="selectedItem.scale" class="workspace-device-arrangement-panel__input" type="number" step="0.05" min="0.25" max="3" @change="updateItem(selectedItem.id, { scale: Number(($event.target as HTMLInputElement).value || 1) })">
          </label>
          <label class="workspace-device-arrangement-panel__field">
            <span>旋转</span>
            <input :value="selectedItem.rotationOffset" class="workspace-device-arrangement-panel__input" type="number" step="1" min="-45" max="45" @change="updateItem(selectedItem.id, { rotationOffset: Number(($event.target as HTMLInputElement).value || 0) })">
          </label>
        </div>

        <div class="workspace-device-arrangement-panel__actions workspace-device-arrangement-panel__actions--grid" data-testid="workspace-device-arrangement-layer-actions">
          <button class="workspace-device-arrangement-panel__button" type="button" :disabled="!canMoveLayerDown" @click="moveItemLayer(selectedItem.id, 'backward')">
            后移
          </button>
          <button class="workspace-device-arrangement-panel__button" type="button" :disabled="!canMoveLayerUp" @click="moveItemLayer(selectedItem.id, 'forward')">
            前移
          </button>
          <button class="workspace-device-arrangement-panel__button" type="button" @click="moveItemLayer(selectedItem.id, 'back')">
            置底
          </button>
          <button class="workspace-device-arrangement-panel__button" type="button" @click="moveItemLayer(selectedItem.id, 'front')">
            置顶
          </button>
          <button class="workspace-device-arrangement-panel__button" type="button" @click="duplicateItem(selectedItem.id)">
            复制
          </button>
          <button class="workspace-device-arrangement-panel__button workspace-device-arrangement-panel__button--danger" type="button" @click="removeItem(selectedItem.id)">
            删除
          </button>
        </div>
      </section>

      <section v-else class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          设备项
        </div>
        <p class="workspace-device-arrangement-panel__hint">
          {{ documentState.items.length ? '从列表或画布中选择一个设备。' : '当前还没有截图。' }}
        </p>
      </section>

      <section class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          图层
        </div>
        <div class="workspace-device-arrangement-panel__item-list">
          <button
            v-for="item in [...documentState.items].reverse()"
            :key="item.id"
            class="workspace-device-arrangement-panel__item-row"
            :class="{ 'workspace-device-arrangement-panel__item-row--active': item.id === selectedItemId }"
            type="button"
            @click="selectItem(item.id)"
          >
            <span>{{ item.name }}</span>
            <small>{{ resolveDeviceChoice(item.devicePresetKey)?.label || item.devicePresetKey }}</small>
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
  grid-template-columns: 288px minmax(0, 1fr) 320px;
  border: 1px solid #e5e7eb;
  background: #f6f7f9;
  color: #0f172a;
  outline: none;
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

.workspace-device-arrangement-panel__dropzone {
  display: flex;
  width: 100%;
  min-height: 78px;
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

.workspace-device-arrangement-panel__dropzone span,
.workspace-device-arrangement-panel__chip strong,
.workspace-device-arrangement-panel__item-row span {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-device-arrangement-panel__dropzone small,
.workspace-device-arrangement-panel__chip span,
.workspace-device-arrangement-panel__field small,
.workspace-device-arrangement-panel__item-row small {
  overflow: hidden;
  max-width: 100%;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-device-arrangement-panel__template-grid {
  display: grid;
  gap: 8px;
}

.workspace-device-arrangement-panel__chip {
  display: grid;
  gap: 3px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  padding: 9px 10px;
  color: #0f172a;
  text-align: left;
}

.workspace-device-arrangement-panel__field {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
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

.workspace-device-arrangement-panel__actions,
.workspace-device-arrangement-panel__checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-device-arrangement-panel__actions {
  margin-top: 10px;
}

.workspace-device-arrangement-panel__actions--grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
.workspace-device-arrangement-panel__interaction-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.workspace-device-arrangement-panel__canvas-render :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.workspace-device-arrangement-panel__interaction-layer {
  touch-action: none;
}

.workspace-device-arrangement-panel__hit-area {
  cursor: move;
  fill: transparent;
  stroke: transparent;
  stroke-width: 2;
}

.workspace-device-arrangement-panel__hit-area--selected {
  fill: rgba(37, 99, 235, 0.04);
}

.workspace-device-arrangement-panel__selection-outline {
  pointer-events: none;
  fill: transparent;
  stroke: #2563eb;
  stroke-dasharray: 12 8;
  stroke-width: 4;
}

.workspace-device-arrangement-panel__resize-handle,
.workspace-device-arrangement-panel__rotate-handle {
  fill: #fff;
  stroke: #2563eb;
  stroke-width: 4;
}

.workspace-device-arrangement-panel__resize-handle {
  cursor: nwse-resize;
}

.workspace-device-arrangement-panel__rotate-handle {
  cursor: grab;
}

.workspace-device-arrangement-panel__rotate-line {
  pointer-events: none;
  stroke: #2563eb;
  stroke-width: 3;
}

.workspace-device-arrangement-panel__empty {
  position: absolute;
  inset: 50% auto auto 50%;
  display: grid;
  width: min(320px, calc(100% - 32px));
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

.workspace-device-arrangement-panel__manual-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workspace-device-arrangement-panel__item-list {
  display: grid;
  gap: 8px;
}

.workspace-device-arrangement-panel__item-row {
  display: grid;
  min-width: 0;
  gap: 3px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  padding: 9px 10px;
  color: #0f172a;
  text-align: left;
}

.workspace-device-arrangement-panel__item-row--active {
  border-color: #2563eb;
  background: #eff6ff;
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
