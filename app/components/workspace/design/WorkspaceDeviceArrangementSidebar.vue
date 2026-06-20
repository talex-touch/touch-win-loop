<script setup lang="ts">
import type {
  ApiResponse,
  DesignAssetModel,
  MockupProjectCatalog,
  MockupProjectCatalogVariant,
  SceneDocument,
} from '~~/shared/types/domain'
import type {
  DeviceArrangementExportSizePresetKey,
  DeviceArrangementLayoutPresetKey,
  DeviceArrangementRotationPresetKey,
  DeviceArrangementShadowPresetKey,
  DeviceArrangementSpacingPresetKey,
} from '~~/shared/utils/scene-document'
import { computed, ref, watch } from 'vue'
import {
  buildDesignAssetFromCanvasLibraryPayload,
  buildDeviceArrangementSceneDocument,
  DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS,
  DEVICE_ARRANGEMENT_LAYOUT_PRESETS,
  DEVICE_ARRANGEMENT_ROTATION_PRESETS,
  DEVICE_ARRANGEMENT_SHADOW_PRESETS,
  DEVICE_ARRANGEMENT_SPACING_PRESETS,
  DEVICE_ARRANGEMENT_TEMPLATE_PRESETS,
  DEVICE_FRAME_PRESETS,
  parseSceneDocumentString,
  renderCompositionAssetToSvg,
  serializeSceneDocument,
} from '~~/shared/utils/scene-document'
import { uploadDeviceArrangementScreenshotAsset } from '~/utils/device-arrangement-assets'

interface ArrangementScreenshotItem {
  id: string
  name: string
  src: string
  width: number
  height: number
  deviceChoiceKey: string
  deviceFramePresetKey: string
  shellAssetId: string
  offsetX: number
  offsetY: number
  scale: number
  rotationOffset: number
}

interface ArrangementDeviceChoice {
  key: string
  label: string
  helper: string
  shellStatusText: string
  presetKey: string
  presetTitle: string
  source: 'catalog' | 'builtin'
  variant?: MockupProjectCatalogVariant | null
}

const props = withDefaults(defineProps<{
  modelValue?: string
  projectId?: string
  resourceTitle?: string
}>(), {
  modelValue: '',
  projectId: '',
  resourceTitle: '设备排布',
})

const emit = defineEmits<{
  updateDocument: [value: string]
}>()

const DEVICE_CHOICE_CATALOG_PREFIX = 'catalog:'
const DEVICE_CHOICE_BUILTIN_PREFIX = 'builtin:'

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const fileInputRef = ref<HTMLInputElement | null>(null)
const screenshots = ref<ArrangementScreenshotItem[]>([])
const mockupCatalog = ref<MockupProjectCatalog | null>(null)
const mockupCatalogLoading = ref(false)
const mockupCatalogError = ref('')
const screenshotUploadError = ref('')
const selectedCategoryKey = ref('')
const selectedModelId = ref('')
const selectedVariantPresetKey = ref('')
const fallbackPresetKey = ref('iphone-16-pro')
const layoutPresetKey = ref<DeviceArrangementLayoutPresetKey>('solo')
const exportSizePresetKey = ref<DeviceArrangementExportSizePresetKey>('square')
const shadowPresetKey = ref<DeviceArrangementShadowPresetKey>('soft')
const spacingPresetKey = ref<DeviceArrangementSpacingPresetKey>('balanced')
const rotationPresetKey = ref<DeviceArrangementRotationPresetKey>('soft')
const customWidth = ref(1600)
const customHeight = ref(1600)
const background = ref('#f8fafc')
const backgroundMode = ref<'solid' | 'gradient' | 'transparent'>('solid')
const watermarkText = ref('')
const hydrating = ref(false)
const lastEmittedValue = ref('')
const persistedShellAssetsById = ref<Record<string, DesignAssetModel>>({})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sanitizeLocalId(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function inferExportSizePresetKey(width: number, height: number): DeviceArrangementExportSizePresetKey {
  const matchedPreset = DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS.find((preset) => {
    return preset.key !== 'custom'
      && preset.width === width
      && preset.height === height
  })
  return matchedPreset?.key || 'custom'
}

function parseSceneDocumentValue(value: string): SceneDocument {
  return parseSceneDocumentString(value || '', {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
}

function resolveCatalogChoiceKey(presetKey: string): string {
  return `${DEVICE_CHOICE_CATALOG_PREFIX}${presetKey}`
}

function resolveBuiltinChoiceKey(presetKey: string): string {
  return `${DEVICE_CHOICE_BUILTIN_PREFIX}${presetKey}`
}

const catalogVariantEntries = computed(() => {
  return (mockupCatalog.value?.categories || []).flatMap((category) => {
    return category.models.flatMap((model) => {
      return model.variants.map(variant => ({
        category,
        model,
        variant,
      }))
    })
  })
})

const catalogDeviceChoices = computed<ArrangementDeviceChoice[]>(() => {
  return catalogVariantEntries.value.map(({ model, variant }) => ({
    key: resolveCatalogChoiceKey(variant.presetKey),
    label: `${model.title} · ${variant.title}`,
    helper: `${variant.resolvedPreset.screenWidth}×${variant.resolvedPreset.screenHeight}`,
    shellStatusText: variant.shellAssetPayload && variant.shellAssetUrl ? '真实设备壳' : '内置设备壳',
    presetKey: variant.resolvedPreset.key,
    presetTitle: variant.resolvedPreset.title,
    source: 'catalog',
    variant,
  }))
})

const builtinDeviceChoices = computed<ArrangementDeviceChoice[]>(() => {
  return DEVICE_FRAME_PRESETS.map(preset => ({
    key: resolveBuiltinChoiceKey(preset.key),
    label: preset.title,
    helper: `${preset.screenWidth}×${preset.screenHeight}`,
    shellStatusText: '内置设备壳',
    presetKey: preset.key,
    presetTitle: preset.title,
    source: 'builtin',
    variant: null,
  }))
})

const deviceChoiceMap = computed(() => {
  return new Map(
    [...catalogDeviceChoices.value, ...builtinDeviceChoices.value].map(choice => [choice.key, choice]),
  )
})

const currentCatalogVariantEntry = computed(() => {
  const presetKey = normalizeString(selectedVariantPresetKey.value)
  if (!presetKey)
    return null
  return catalogVariantEntries.value.find(entry => entry.variant.presetKey === presetKey) || null
})

const selectedCategory = computed(() => {
  const categoryKey = normalizeString(selectedCategoryKey.value)
    || currentCatalogVariantEntry.value?.category.key
    || mockupCatalog.value?.categories[0]?.key
    || ''
  return mockupCatalog.value?.categories.find(category => category.key === categoryKey) || null
})

const selectedModel = computed(() => {
  const modelId = normalizeString(selectedModelId.value)
    || currentCatalogVariantEntry.value?.model.id
    || selectedCategory.value?.models[0]?.id
    || ''
  return selectedCategory.value?.models.find(model => model.id === modelId) || null
})

const selectedVariant = computed<MockupProjectCatalogVariant | null>(() => {
  const presetKey = normalizeString(selectedVariantPresetKey.value)
  if (!presetKey)
    return null
  return selectedModel.value?.variants.find(variant => variant.presetKey === presetKey)
    || currentCatalogVariantEntry.value?.variant
    || null
})

const defaultDeviceChoice = computed(() => {
  const selectedCatalogChoice = selectedVariant.value
    ? deviceChoiceMap.value.get(resolveCatalogChoiceKey(selectedVariant.value.presetKey))
    : null
  return selectedCatalogChoice
    || deviceChoiceMap.value.get(resolveBuiltinChoiceKey(fallbackPresetKey.value))
    || builtinDeviceChoices.value[0]
    || null
})

const selectedShellStatusText = computed(() => {
  return defaultDeviceChoice.value?.shellStatusText || '内置设备壳'
})

const activeArrangementTemplateKey = computed(() => {
  const matchedTemplate = DEVICE_ARRANGEMENT_TEMPLATE_PRESETS.find(template => (
    template.layoutPresetKey === layoutPresetKey.value
    && template.exportSizePresetKey === exportSizePresetKey.value
    && template.background === background.value
    && template.backgroundMode === backgroundMode.value
    && template.shadowPresetKey === shadowPresetKey.value
    && template.spacingPresetKey === spacingPresetKey.value
    && template.rotationPresetKey === rotationPresetKey.value
    && normalizeString(template.watermarkText) === normalizeString(watermarkText.value)
    && (template.exportSizePresetKey !== 'custom'
      || (
        Math.round(template.customWidth || 0) === Math.round(customWidth.value)
        && Math.round(template.customHeight || 0) === Math.round(customHeight.value)
      ))
  ))
  return matchedTemplate?.key || ''
})

const previewSizeLabel = computed(() => {
  if (exportSizePresetKey.value === 'custom')
    return `${Math.max(320, Math.round(customWidth.value))}×${Math.max(320, Math.round(customHeight.value))}`
  const preset = DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS.find(item => item.key === exportSizePresetKey.value)
  return preset ? `${preset.title} · ${preset.width}×${preset.height}` : '1:1'
})

function resolveDeviceChoice(value: unknown, fallbackPresetKeyValue = 'iphone-16-pro'): ArrangementDeviceChoice {
  const normalized = normalizeString(value)
  if (normalized && deviceChoiceMap.value.has(normalized))
    return deviceChoiceMap.value.get(normalized)!
  if (normalized && deviceChoiceMap.value.has(resolveCatalogChoiceKey(normalized)))
    return deviceChoiceMap.value.get(resolveCatalogChoiceKey(normalized))!
  if (normalized && deviceChoiceMap.value.has(resolveBuiltinChoiceKey(normalized)))
    return deviceChoiceMap.value.get(resolveBuiltinChoiceKey(normalized))!
  return deviceChoiceMap.value.get(resolveBuiltinChoiceKey(fallbackPresetKeyValue))
    || builtinDeviceChoices.value[0]!
}

function inferDeviceChoiceKey(presetKey: unknown, shellAssetId: unknown): string {
  const normalizedPresetKey = normalizeString(presetKey) || 'iphone-16-pro'
  if (normalizeString(shellAssetId)) {
    const catalogChoice = catalogDeviceChoices.value.find(choice => choice.presetKey === normalizedPresetKey)
    if (catalogChoice)
      return catalogChoice.key
  }
  return resolveBuiltinChoiceKey(normalizedPresetKey)
}

function normalizeDeviceChoiceKey(
  value: unknown,
  deviceFramePresetKey: unknown,
  shellAssetId: unknown,
): string {
  const normalized = normalizeString(value)
  if (normalized.startsWith(DEVICE_CHOICE_CATALOG_PREFIX) || normalized.startsWith(DEVICE_CHOICE_BUILTIN_PREFIX))
    return normalized
  if (normalized && deviceChoiceMap.value.has(resolveCatalogChoiceKey(normalized)))
    return resolveCatalogChoiceKey(normalized)
  if (normalized && deviceChoiceMap.value.has(resolveBuiltinChoiceKey(normalized)))
    return resolveBuiltinChoiceKey(normalized)
  return inferDeviceChoiceKey(deviceFramePresetKey, shellAssetId)
}

function resolveCatalogShellAssetId(variant: MockupProjectCatalogVariant): string {
  return `device-arrangement-shell-${sanitizeLocalId(variant.presetKey, 'device')}`
}

function buildCatalogShellAsset(variant?: MockupProjectCatalogVariant | null): DesignAssetModel | null {
  if (!variant?.shellAssetPayload || !variant.shellAssetUrl)
    return null
  return buildDesignAssetFromCanvasLibraryPayload(variant.shellAssetPayload, {
    id: resolveCatalogShellAssetId(variant),
    src: variant.shellAssetUrl,
    assetKind: 'device_shell',
    name: normalizeString(variant.shellAssetTitle)
      || normalizeString(variant.title)
      || variant.resolvedPreset.title,
  })
}

function resolveShellAssetForItem(item: ArrangementScreenshotItem): DesignAssetModel | null {
  const choice = resolveDeviceChoice(item.deviceChoiceKey, item.deviceFramePresetKey)
  const catalogShellAsset = buildCatalogShellAsset(choice.variant || null)
  if (catalogShellAsset)
    return catalogShellAsset
  const persistedShellAssetId = normalizeString(item.shellAssetId)
  return persistedShellAssetId
    ? (persistedShellAssetsById.value[persistedShellAssetId] || null)
    : null
}

function resolveShellStatusText(item: ArrangementScreenshotItem): string {
  const choice = resolveDeviceChoice(item.deviceChoiceKey, item.deviceFramePresetKey)
  const shellAsset = resolveShellAssetForItem(item)
  if (choice.variant?.shellAssetPayload && choice.variant?.shellAssetUrl)
    return '真实设备壳'
  if (shellAsset)
    return '已绑定外部设备壳'
  return '内置设备壳'
}

function resolveScreenshotDeviceLabel(item: ArrangementScreenshotItem): string {
  const choice = resolveDeviceChoice(item.deviceChoiceKey, item.deviceFramePresetKey)
  return `${choice.label} · ${choice.helper}`
}

function applyChoiceToScreenshot(
  item: ArrangementScreenshotItem,
  choiceKey: string,
): ArrangementScreenshotItem {
  const choice = resolveDeviceChoice(choiceKey, item.deviceFramePresetKey || fallbackPresetKey.value)
  const shellAsset = buildCatalogShellAsset(choice.variant || null)
  return {
    ...item,
    deviceChoiceKey: choice.key,
    deviceFramePresetKey: choice.presetKey,
    shellAssetId: shellAsset?.id || '',
  }
}

function resolveArrangementSourceItems(scene: SceneDocument): {
  screenshots: ArrangementScreenshotItem[]
  preferredChoiceKey: string
  shellAssetsById: Record<string, DesignAssetModel>
} {
  if (scene.sourceModel.kind !== 'composition') {
    return {
      screenshots: [],
      preferredChoiceKey: resolveBuiltinChoiceKey('iphone-16-pro'),
      shellAssetsById: {},
    }
  }

  const composition = scene.sourceModel
  const frames = composition.frames || []
  const elements = composition.elements || []
  const assets = composition.assets || []
  const arrangementSettings = composition.metadata?.deviceArrangement as Record<string, unknown> | undefined
  const arrangementItems = Array.isArray(arrangementSettings?.items)
    ? arrangementSettings.items as Array<Record<string, unknown>>
    : []
  const shellAssetsById = Object.fromEntries(
    assets
      .filter(asset => normalizeString(asset.id))
      .map(asset => [asset.id, asset]),
  )
  const mockupFrames = frames
    .filter(frame => frame.kind === 'device_mockup')
    .sort((left, right) => left.x - right.x || left.y - right.y)
  const sourceFrames = frames
    .filter(frame => frame.kind === 'device_artboard')
    .sort((left, right) => left.x - right.x || left.y - right.y)
  const resolvedItems = (mockupFrames.length > 0 ? mockupFrames : sourceFrames)
    .map((frame, index) => {
      const sourceFrameId = normalizeString(frame.metadata?.device?.mockupSourceFrameId) || frame.id
      const sourceFrame = frames.find(candidate => candidate.id === sourceFrameId) || frame
      const imageElement = elements.find((element) => {
        return element.frameId === sourceFrame.id
          && element.type === 'image'
          && normalizeString(element.imageSrc)
      })
      if (!imageElement?.imageSrc)
        return null
      const metadataItem = arrangementItems[index] || {}
      const deviceFramePresetKey = normalizeString(frame.deviceFramePresetKey || sourceFrame.deviceFramePresetKey) || 'iphone-16-pro'
      const shellAssetId = normalizeString(frame.metadata?.device?.shellAssetId || metadataItem.shellAssetId)
      return {
        id: sourceFrame.id || `device-arrangement-screenshot-${index + 1}`,
        name: normalizeString(sourceFrame.name) || normalizeString(frame.name) || `截图 ${index + 1}`,
        src: imageElement.imageSrc,
        width: Math.max(0, Math.round(toFiniteNumber(sourceFrame.width, 0))),
        height: Math.max(0, Math.round(toFiniteNumber(sourceFrame.height, 0))),
        deviceFramePresetKey,
        deviceChoiceKey: normalizeDeviceChoiceKey(metadataItem.deviceChoiceKey, deviceFramePresetKey, shellAssetId),
        shellAssetId,
        offsetX: Math.round(toFiniteNumber(metadataItem.offsetX, 0)),
        offsetY: Math.round(toFiniteNumber(metadataItem.offsetY, 0)),
        scale: Math.max(0.35, Math.min(2.5, toFiniteNumber(metadataItem.scale, 1))),
        rotationOffset: Math.max(-45, Math.min(45, Math.round(toFiniteNumber(metadataItem.rotationOffset, 0)))),
      }
    })
    .filter((item): item is ArrangementScreenshotItem => Boolean(item))

  return {
    screenshots: resolvedItems,
    preferredChoiceKey: resolvedItems[0]?.deviceChoiceKey || resolveBuiltinChoiceKey('iphone-16-pro'),
    shellAssetsById,
  }
}

function syncStateFromDocument(value: string): void {
  hydrating.value = true
  const scene = parseSceneDocumentValue(value)
  const composition = scene.sourceModel.kind === 'composition' ? scene.sourceModel : null
  const arrangementSettings = composition?.metadata?.deviceArrangement as Record<string, unknown> | undefined
  const exportPage = composition?.pages?.find(page => page.id === composition.currentPageId) || composition?.pages?.[0] || null
  const pageExport = exportPage?.metadata?.export as Record<string, unknown> | undefined
  const resolvedSource = resolveArrangementSourceItems(scene)
  const preferredChoice = resolveDeviceChoice(
    resolvedSource.preferredChoiceKey,
    resolvedSource.screenshots[0]?.deviceFramePresetKey || 'iphone-16-pro',
  )

  screenshots.value = resolvedSource.screenshots
  persistedShellAssetsById.value = resolvedSource.shellAssetsById
  fallbackPresetKey.value = preferredChoice.presetKey || 'iphone-16-pro'
  selectedVariantPresetKey.value = preferredChoice.source === 'catalog'
    ? normalizeString(preferredChoice.variant?.presetKey)
    : ''
  layoutPresetKey.value = normalizeString(arrangementSettings?.layoutPresetKey) as DeviceArrangementLayoutPresetKey || 'solo'
  background.value = normalizeString(arrangementSettings?.background || exportPage?.background) || '#f8fafc'
  backgroundMode.value = (normalizeString(arrangementSettings?.backgroundMode || pageExport?.backgroundMode) || 'solid') as typeof backgroundMode.value
  shadowPresetKey.value = normalizeString(arrangementSettings?.shadowPresetKey) as DeviceArrangementShadowPresetKey || 'soft'
  spacingPresetKey.value = normalizeString(arrangementSettings?.spacingPresetKey) as DeviceArrangementSpacingPresetKey || 'balanced'
  rotationPresetKey.value = normalizeString(arrangementSettings?.rotationPresetKey) as DeviceArrangementRotationPresetKey || 'soft'
  watermarkText.value = normalizeString(arrangementSettings?.watermarkText)
  customWidth.value = Math.max(320, Math.round(toFiniteNumber(arrangementSettings?.customWidth || pageExport?.width, 1600)))
  customHeight.value = Math.max(320, Math.round(toFiniteNumber(arrangementSettings?.customHeight || pageExport?.height, 1600)))
  exportSizePresetKey.value = normalizeString(arrangementSettings?.exportSizePresetKey) as DeviceArrangementExportSizePresetKey
    || inferExportSizePresetKey(
      Math.max(0, Math.round(toFiniteNumber(pageExport?.width, 0))),
      Math.max(0, Math.round(toFiniteNumber(pageExport?.height, 0))),
    )
  if (!DEVICE_ARRANGEMENT_LAYOUT_PRESETS.some(item => item.key === layoutPresetKey.value))
    layoutPresetKey.value = 'solo'
  if (!DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS.some(item => item.key === exportSizePresetKey.value))
    exportSizePresetKey.value = 'square'
  if (!DEVICE_ARRANGEMENT_SHADOW_PRESETS.some(item => item.key === shadowPresetKey.value))
    shadowPresetKey.value = 'soft'
  if (!DEVICE_ARRANGEMENT_SPACING_PRESETS.some(item => item.key === spacingPresetKey.value))
    spacingPresetKey.value = 'balanced'
  if (!DEVICE_ARRANGEMENT_ROTATION_PRESETS.some(item => item.key === rotationPresetKey.value))
    rotationPresetKey.value = 'soft'
  hydrating.value = false
}

async function requestProjectApi<T>(path: string): Promise<T> {
  const response = await fetch(endpoint(path), {
    credentials: 'include',
  })
  const result = (await response.json().catch(() => null)) as ApiResponse<T> | null
  if (!response.ok || !result || result.code !== 0)
    throw new Error(String(result?.message || '请求失败。'))
  return result.data
}

async function loadMockupCatalog(): Promise<void> {
  const projectId = normalizeString(props.projectId)
  if (!projectId) {
    mockupCatalog.value = null
    mockupCatalogError.value = ''
    return
  }

  mockupCatalogLoading.value = true
  mockupCatalogError.value = ''
  try {
    mockupCatalog.value = await requestProjectApi<MockupProjectCatalog>(
      `/projects/${projectId}/mockups/catalog`,
    )
  }
  catch (error) {
    mockupCatalog.value = null
    mockupCatalogError.value = String(error instanceof Error ? error.message : 'Mockup 目录加载失败。')
  }
  finally {
    mockupCatalogLoading.value = false
  }
}

watch(
  () => props.projectId,
  () => {
    void loadMockupCatalog()
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (nextValue) => {
    if (nextValue && nextValue === lastEmittedValue.value) {
      lastEmittedValue.value = ''
      return
    }
    syncStateFromDocument(nextValue || '')
  },
  { immediate: true },
)

watch(
  catalogDeviceChoices,
  () => {
    if (!catalogDeviceChoices.value.length || hydrating.value || !screenshots.value.length)
      return
    screenshots.value = screenshots.value.map((item) => {
      const inferredChoiceKey = normalizeDeviceChoiceKey(
        item.deviceChoiceKey,
        item.deviceFramePresetKey,
        item.shellAssetId,
      )
      return inferredChoiceKey === item.deviceChoiceKey
        ? item
        : {
            ...item,
            deviceChoiceKey: inferredChoiceKey,
          }
    })
  },
)

function handleCategoryChange(value: string): void {
  selectedCategoryKey.value = value
  selectedModelId.value = ''
  selectedVariantPresetKey.value = ''
}

function handleModelChange(value: string): void {
  selectedModelId.value = value
  selectedVariantPresetKey.value = ''
}

function buildCurrentArrangementDocument(): SceneDocument {
  return buildDeviceArrangementSceneDocument({
    title: props.resourceTitle || '设备排布',
    items: screenshots.value.map((item) => {
      const choice = resolveDeviceChoice(item.deviceChoiceKey, item.deviceFramePresetKey)
      const shellAsset = resolveShellAssetForItem(item)
      return {
        screenshotSrc: item.src,
        screenshotName: item.name,
        screenshotWidth: item.width,
        screenshotHeight: item.height,
        deviceFramePresetKey: choice.presetKey,
        shellAsset,
        shellMode: shellAsset ? 'external' : 'builtin',
        offsetX: item.offsetX,
        offsetY: item.offsetY,
        scale: item.scale,
        rotationOffset: item.rotationOffset,
      }
    }),
    layoutPresetKey: layoutPresetKey.value,
    exportSizePresetKey: exportSizePresetKey.value,
    shadowPresetKey: shadowPresetKey.value,
    spacingPresetKey: spacingPresetKey.value,
    rotationPresetKey: rotationPresetKey.value,
    customWidth: customWidth.value,
    customHeight: customHeight.value,
    background: background.value,
    backgroundMode: backgroundMode.value,
    watermarkText: watermarkText.value,
  })
}

const arrangementPreviewDocument = computed(() => buildCurrentArrangementDocument())

const arrangementPreviewMarkup = computed(() => {
  return renderCompositionAssetToSvg(arrangementPreviewDocument.value, {
    pageId: 'device-arrangement-export',
  })
})

const serializedArrangementDocument = computed(() => {
  return serializeSceneDocument(arrangementPreviewDocument.value)
})

watch(
  serializedArrangementDocument,
  (serialized) => {
    if (hydrating.value || serialized === props.modelValue)
      return
    lastEmittedValue.value = serialized
    emit('updateDocument', serialized)
  },
)

async function resolveScreenshotAssetSrc(file: File, fallbackSrc: string): Promise<string> {
  screenshotUploadError.value = ''
  try {
    return await uploadDeviceArrangementScreenshotAsset({
      endpoint,
      projectId: props.projectId,
      file,
    }) || fallbackSrc
  }
  catch (error) {
    screenshotUploadError.value = String(error instanceof Error ? error.message : '截图资源化失败，已临时使用内嵌图片。')
    return fallbackSrc
  }
}

function readImageFile(file: File): Promise<ArrangementScreenshotItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'))
    reader.onload = () => {
      const src = String(reader.result || '')
      const image = new Image()
      image.onload = async () => {
        const assetSrc = await resolveScreenshotAssetSrc(file, src)
        resolve({
          id: `device-arrangement-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name || 'screenshot',
          src: assetSrc,
          width: image.naturalWidth || 0,
          height: image.naturalHeight || 0,
          deviceChoiceKey: defaultDeviceChoice.value?.key || resolveBuiltinChoiceKey(fallbackPresetKey.value),
          deviceFramePresetKey: defaultDeviceChoice.value?.presetKey || fallbackPresetKey.value,
          shellAssetId: buildCatalogShellAsset(defaultDeviceChoice.value?.variant || null)?.id || '',
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          rotationOffset: 0,
        })
      }
      image.onerror = async () => {
        const assetSrc = await resolveScreenshotAssetSrc(file, src)
        resolve({
          id: `device-arrangement-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name || 'screenshot',
          src: assetSrc,
          width: 0,
          height: 0,
          deviceChoiceKey: defaultDeviceChoice.value?.key || resolveBuiltinChoiceKey(fallbackPresetKey.value),
          deviceFramePresetKey: defaultDeviceChoice.value?.presetKey || fallbackPresetKey.value,
          shellAssetId: buildCatalogShellAsset(defaultDeviceChoice.value?.variant || null)?.id || '',
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          rotationOffset: 0,
        })
      }
      image.src = src
    }
    reader.readAsDataURL(file)
  })
}

async function addFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList)
    .filter(file => file.type.startsWith('image/'))
    .slice(0, Math.max(0, 9 - screenshots.value.length))
  if (!files.length)
    return
  const nextItems = await Promise.all(files.map(file => readImageFile(file)))
  screenshots.value = [...screenshots.value, ...nextItems]
}

function handleFileInputChange(event: Event): void {
  const target = event.target as HTMLInputElement
  if (target.files)
    void addFiles(target.files)
  target.value = ''
}

function handlePaste(event: ClipboardEvent): void {
  const files = Array.from(event.clipboardData?.files || [])
  if (!files.some(file => file.type.startsWith('image/')))
    return
  event.preventDefault()
  void addFiles(files)
}

function removeScreenshot(id: string): void {
  screenshots.value = screenshots.value.filter(item => item.id !== id)
}

function updateScreenshotDeviceChoice(id: string, choiceKey: string): void {
  screenshots.value = screenshots.value.map((item) => {
    if (item.id !== id)
      return item
    return applyChoiceToScreenshot(item, choiceKey)
  })
}

function updateScreenshotTransform(
  id: string,
  patch: Partial<Pick<ArrangementScreenshotItem, 'offsetX' | 'offsetY' | 'scale' | 'rotationOffset'>>,
): void {
  screenshots.value = screenshots.value.map((item) => {
    if (item.id !== id)
      return item
    return {
      ...item,
      offsetX: Math.max(-600, Math.min(600, Number(patch.offsetX ?? item.offsetX ?? 0))),
      offsetY: Math.max(-600, Math.min(600, Number(patch.offsetY ?? item.offsetY ?? 0))),
      scale: Math.max(0.35, Math.min(2.5, Number(patch.scale ?? item.scale ?? 1))),
      rotationOffset: Math.max(-45, Math.min(45, Number(patch.rotationOffset ?? item.rotationOffset ?? 0))),
    }
  })
}

function applyDefaultDeviceToAll(): void {
  const choice = defaultDeviceChoice.value
  if (!choice)
    return
  screenshots.value = screenshots.value.map(item => applyChoiceToScreenshot(item, choice.key))
}

function applyArrangementTemplate(template: (typeof DEVICE_ARRANGEMENT_TEMPLATE_PRESETS)[number]): void {
  layoutPresetKey.value = template.layoutPresetKey
  exportSizePresetKey.value = template.exportSizePresetKey
  shadowPresetKey.value = template.shadowPresetKey
  spacingPresetKey.value = template.spacingPresetKey
  rotationPresetKey.value = template.rotationPresetKey
  if (template.exportSizePresetKey === 'custom') {
    customWidth.value = Math.max(320, Math.round(template.customWidth || customWidth.value))
    customHeight.value = Math.max(320, Math.round(template.customHeight || customHeight.value))
  }
  background.value = template.background
  backgroundMode.value = template.backgroundMode
  watermarkText.value = normalizeString(template.watermarkText)
}
</script>

<template>
  <div
    class="workspace-device-arrangement-sidebar"
    data-testid="workspace-design-sidebar-arrangement"
    @paste="handlePaste"
  >
    <section class="workspace-device-arrangement-sidebar__section">
      <div class="workspace-device-arrangement-sidebar__section-header">
        <h4>排布预览</h4>
        <span>{{ previewSizeLabel }}</span>
      </div>
      <p class="workspace-device-arrangement-sidebar__hint">
        改动会直接写回当前设计资源，重新打开仍可继续编辑。
      </p>
      <div
        class="workspace-device-arrangement-sidebar__preview"
        data-testid="workspace-device-arrangement-preview"
        v-html="arrangementPreviewMarkup"
      />
    </section>

    <section class="workspace-device-arrangement-sidebar__section">
      <div class="workspace-device-arrangement-sidebar__section-header">
        <h4>排布模版</h4>
        <span>{{ DEVICE_ARRANGEMENT_TEMPLATE_PRESETS.length }} 套</span>
      </div>
      <div
        class="workspace-device-arrangement-sidebar__template-grid"
        data-testid="workspace-device-arrangement-templates"
      >
        <button
          v-for="template in DEVICE_ARRANGEMENT_TEMPLATE_PRESETS"
          :key="template.key"
          type="button"
          class="workspace-device-arrangement-sidebar__template-button"
          :class="{ 'workspace-device-arrangement-sidebar__template-button--active': activeArrangementTemplateKey === template.key }"
          @click="applyArrangementTemplate(template)"
        >
          <strong>{{ template.title }}</strong>
          <span>{{ template.summary }}</span>
        </button>
      </div>
    </section>

    <section class="workspace-device-arrangement-sidebar__section">
      <div class="workspace-device-arrangement-sidebar__section-header">
        <h4>截图</h4>
        <span>{{ screenshots.length }}/9</span>
      </div>
      <button
        class="workspace-device-arrangement-sidebar__upload"
        type="button"
        data-testid="workspace-device-arrangement-upload"
        @click="fileInputRef?.click()"
      >
        <span class="material-symbols-outlined">add_photo_alternate</span>
        <span>添加截图 / 粘贴截图</span>
      </button>
      <input
        ref="fileInputRef"
        class="workspace-device-arrangement-sidebar__file-input"
        type="file"
        accept="image/*"
        multiple
        @change="handleFileInputChange"
      >
      <p v-if="screenshotUploadError" class="workspace-device-arrangement-sidebar__hint workspace-device-arrangement-sidebar__hint--error">
        {{ screenshotUploadError }}
      </p>
      <div v-if="screenshots.length" class="workspace-device-arrangement-sidebar__screenshot-list">
        <div
          v-for="item in screenshots"
          :key="item.id"
          class="workspace-device-arrangement-sidebar__screenshot-item"
        >
          <img :src="item.src" :alt="item.name">
          <div class="workspace-device-arrangement-sidebar__screenshot-body">
            <div class="workspace-device-arrangement-sidebar__screenshot-meta">
              <strong>{{ item.name }}</strong>
              <span>{{ item.width || '-' }}×{{ item.height || '-' }}</span>
            </div>
            <label class="workspace-device-arrangement-sidebar__field workspace-device-arrangement-sidebar__field--dense">
              <span>设备</span>
              <select
                :value="item.deviceChoiceKey"
                data-testid="workspace-device-arrangement-item-device-select"
                @change="updateScreenshotDeviceChoice(item.id, ($event.target as HTMLSelectElement).value)"
              >
                <optgroup v-if="catalogDeviceChoices.length" label="项目设备">
                  <option v-for="choice in catalogDeviceChoices" :key="choice.key" :value="choice.key">
                    {{ choice.label }}
                  </option>
                </optgroup>
                <optgroup label="内置设备">
                  <option v-for="choice in builtinDeviceChoices" :key="choice.key" :value="choice.key">
                    {{ choice.label }}
                  </option>
                </optgroup>
              </select>
            </label>
            <span class="workspace-device-arrangement-sidebar__device-summary">
              {{ resolveScreenshotDeviceLabel(item) }} · {{ resolveShellStatusText(item) }}
            </span>
            <div class="workspace-device-arrangement-sidebar__manual-grid" data-testid="workspace-device-arrangement-manual-transform">
              <label>
                <span>X</span>
                <input
                  :value="item.offsetX"
                  type="number"
                  min="-600"
                  max="600"
                  step="10"
                  @input="updateScreenshotTransform(item.id, { offsetX: Number(($event.target as HTMLInputElement).value) })"
                >
              </label>
              <label>
                <span>Y</span>
                <input
                  :value="item.offsetY"
                  type="number"
                  min="-600"
                  max="600"
                  step="10"
                  @input="updateScreenshotTransform(item.id, { offsetY: Number(($event.target as HTMLInputElement).value) })"
                >
              </label>
              <label>
                <span>缩放</span>
                <input
                  :value="item.scale"
                  type="number"
                  min="0.35"
                  max="2.5"
                  step="0.05"
                  @input="updateScreenshotTransform(item.id, { scale: Number(($event.target as HTMLInputElement).value) })"
                >
              </label>
              <label>
                <span>旋转</span>
                <input
                  :value="item.rotationOffset"
                  type="number"
                  min="-45"
                  max="45"
                  step="1"
                  @input="updateScreenshotTransform(item.id, { rotationOffset: Number(($event.target as HTMLInputElement).value) })"
                >
              </label>
            </div>
          </div>
          <button type="button" aria-label="移除截图" @click="removeScreenshot(item.id)">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
      <div v-else class="workspace-device-arrangement-sidebar__empty">
        暂无截图，先添加一张图开始排布。
      </div>
    </section>

    <section class="workspace-device-arrangement-sidebar__section">
      <div class="workspace-device-arrangement-sidebar__section-header">
        <h4>默认设备</h4>
        <span>{{ selectedShellStatusText }}</span>
      </div>
      <p v-if="mockupCatalogLoading" class="workspace-device-arrangement-sidebar__hint">
        正在同步项目 mockup 目录。
      </p>
      <p v-else-if="mockupCatalogError" class="workspace-device-arrangement-sidebar__hint workspace-device-arrangement-sidebar__hint--error">
        {{ mockupCatalogError }}
      </p>

      <div class="workspace-device-arrangement-sidebar__grid">
        <label v-if="mockupCatalog?.categories?.length">
          <span>分类</span>
          <select :value="selectedCategory?.key || ''" @change="handleCategoryChange(($event.target as HTMLSelectElement).value)">
            <option v-for="category in mockupCatalog.categories" :key="category.key" :value="category.key">
              {{ category.title }}
            </option>
          </select>
        </label>
        <label v-if="mockupCatalog?.categories?.length">
          <span>型号</span>
          <select :value="selectedModel?.id || ''" @change="handleModelChange(($event.target as HTMLSelectElement).value)">
            <option v-for="model in selectedCategory?.models || []" :key="model.id" :value="model.id">
              {{ model.title }}
            </option>
          </select>
        </label>
        <label v-if="mockupCatalog?.categories?.length" class="workspace-device-arrangement-sidebar__grid-wide">
          <span>项目变体</span>
          <select v-model="selectedVariantPresetKey">
            <option value="">
              使用内置设备
            </option>
            <option v-for="variant in selectedModel?.variants || []" :key="variant.presetKey" :value="variant.presetKey">
              {{ variant.title }} · {{ variant.resolvedPreset.screenWidth }}×{{ variant.resolvedPreset.screenHeight }}
            </option>
          </select>
        </label>
        <label class="workspace-device-arrangement-sidebar__grid-wide">
          <span>内置设备</span>
          <select v-model="fallbackPresetKey" data-testid="workspace-device-arrangement-device-select">
            <option v-for="preset in DEVICE_FRAME_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }} · {{ preset.screenWidth }}×{{ preset.screenHeight }}
            </option>
          </select>
        </label>
      </div>
      <button
        class="workspace-device-arrangement-sidebar__secondary-button"
        type="button"
        :disabled="!screenshots.length"
        data-testid="workspace-device-arrangement-apply-all-devices"
        @click="applyDefaultDeviceToAll"
      >
        应用到全部截图
      </button>
    </section>

    <section class="workspace-device-arrangement-sidebar__section">
      <div class="workspace-device-arrangement-sidebar__section-header">
        <h4>布局与导出</h4>
        <span data-testid="workspace-device-arrangement-batch-export">批量导出尺寸</span>
      </div>
      <label class="workspace-device-arrangement-sidebar__field">
        <span>布局</span>
        <select v-model="layoutPresetKey" data-testid="workspace-device-arrangement-layout">
          <option v-for="layout in DEVICE_ARRANGEMENT_LAYOUT_PRESETS" :key="layout.key" :value="layout.key">
            {{ layout.title }}
          </option>
        </select>
      </label>
      <div class="workspace-device-arrangement-sidebar__grid">
        <label>
          <span>尺寸</span>
          <select v-model="exportSizePresetKey" data-testid="workspace-device-arrangement-export-size">
            <option v-for="preset in DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
        <label>
          <span>背景</span>
          <select v-model="backgroundMode">
            <option value="solid">纯色</option>
            <option value="gradient">渐变</option>
            <option value="transparent">透明</option>
          </select>
        </label>
        <label v-if="exportSizePresetKey === 'custom'">
          <span>宽</span>
          <input v-model.number="customWidth" type="number" min="320">
        </label>
        <label v-if="exportSizePresetKey === 'custom'">
          <span>高</span>
          <input v-model.number="customHeight" type="number" min="320">
        </label>
      </div>
      <div class="workspace-device-arrangement-sidebar__grid">
        <label>
          <span>底色</span>
          <input v-model="background" type="color">
        </label>
        <label>
          <span>水印</span>
          <input v-model="watermarkText" type="text" placeholder="可选">
        </label>
      </div>
      <div class="workspace-device-arrangement-sidebar__grid" data-testid="workspace-device-arrangement-effects">
        <label>
          <span>阴影</span>
          <select v-model="shadowPresetKey">
            <option v-for="preset in DEVICE_ARRANGEMENT_SHADOW_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
        <label>
          <span>间距</span>
          <select v-model="spacingPresetKey">
            <option v-for="preset in DEVICE_ARRANGEMENT_SPACING_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
        <label class="workspace-device-arrangement-sidebar__grid-wide">
          <span>倾斜</span>
          <select v-model="rotationPresetKey">
            <option v-for="preset in DEVICE_ARRANGEMENT_ROTATION_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>
      </div>
    </section>
  </div>
</template>

<style scoped>
.workspace-device-arrangement-sidebar {
  display: grid;
  gap: 14px;
}

.workspace-device-arrangement-sidebar__section {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgb(226 232 240 / 0.84);
  border-radius: 8px;
  background: rgb(255 255 255 / 0.82);
}

.workspace-device-arrangement-sidebar__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workspace-device-arrangement-sidebar__section-header h4 {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.workspace-device-arrangement-sidebar__section-header span,
.workspace-device-arrangement-sidebar__hint,
.workspace-device-arrangement-sidebar__empty,
.workspace-device-arrangement-sidebar__screenshot-meta span,
.workspace-device-arrangement-sidebar__device-summary {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.workspace-device-arrangement-sidebar__hint--error {
  color: #dc2626;
}

.workspace-device-arrangement-sidebar__preview {
  display: grid;
  overflow: hidden;
  min-height: 180px;
  align-items: center;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.86), rgb(241 245 249 / 0.96));
}

.workspace-device-arrangement-sidebar__preview :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

.workspace-device-arrangement-sidebar__template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-device-arrangement-sidebar__template-button {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #ffffff;
  text-align: left;
}

.workspace-device-arrangement-sidebar__template-button strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 800;
}

.workspace-device-arrangement-sidebar__template-button span {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.workspace-device-arrangement-sidebar__template-button--active {
  border-color: #0ea5e9;
  background: #f0f9ff;
}

.workspace-device-arrangement-sidebar__upload,
.workspace-device-arrangement-sidebar__secondary-button {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
}

.workspace-device-arrangement-sidebar__upload {
  min-height: 52px;
  border: 1px dashed #94a3b8;
  background: #ffffff;
}

.workspace-device-arrangement-sidebar__secondary-button {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
}

.workspace-device-arrangement-sidebar__secondary-button:disabled {
  opacity: 0.55;
}

.workspace-device-arrangement-sidebar__file-input {
  display: none;
}

.workspace-device-arrangement-sidebar__screenshot-list {
  display: grid;
  gap: 8px;
}

.workspace-device-arrangement-sidebar__screenshot-item {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 26px;
  gap: 8px;
  align-items: start;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
}

.workspace-device-arrangement-sidebar__screenshot-item img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 6px;
}

.workspace-device-arrangement-sidebar__screenshot-body {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.workspace-device-arrangement-sidebar__screenshot-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.workspace-device-arrangement-sidebar__screenshot-meta strong,
.workspace-device-arrangement-sidebar__device-summary {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-device-arrangement-sidebar__screenshot-meta strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 800;
}

.workspace-device-arrangement-sidebar__screenshot-item button {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
}

.workspace-device-arrangement-sidebar__manual-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.workspace-device-arrangement-sidebar__manual-grid label {
  display: grid;
  gap: 3px;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
}

.workspace-device-arrangement-sidebar__manual-grid input {
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 5px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 11px;
}

.workspace-device-arrangement-sidebar__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workspace-device-arrangement-sidebar__grid-wide {
  grid-column: 1 / -1;
}

.workspace-device-arrangement-sidebar__field,
.workspace-device-arrangement-sidebar__grid label {
  display: grid;
  gap: 5px;
  color: #475569;
  font-size: 11px;
  font-weight: 800;
}

.workspace-device-arrangement-sidebar__field--dense {
  gap: 4px;
}

.workspace-device-arrangement-sidebar__field input,
.workspace-device-arrangement-sidebar__field select,
.workspace-device-arrangement-sidebar__grid input,
.workspace-device-arrangement-sidebar__grid select {
  min-width: 0;
  height: 32px;
  padding: 0 9px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
}
</style>
