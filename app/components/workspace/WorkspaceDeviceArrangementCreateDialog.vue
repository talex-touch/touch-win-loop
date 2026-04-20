<script setup lang="ts">
import type {
  ApiResponse,
  DesignAssetModel,
  MockupProjectCatalog,
  MockupProjectCatalogModel,
  MockupProjectCatalogVariant,
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
  renderCompositionAssetToSvg,
  serializeSceneDocument,
} from '~~/shared/utils/scene-document'
import { uploadDeviceArrangementScreenshotAsset } from '~/utils/device-arrangement-assets'

interface ScreenshotDraft {
  id: string
  name: string
  src: string
  width: number
  height: number
  deviceChoiceKey: string
  deviceFramePresetKey: string
  shellAssetId: string
}

interface ArrangementDeviceChoice {
  key: string
  label: string
  helper: string
  shellStatusText: string
  presetKey: string
  source: 'catalog' | 'builtin'
  variant?: MockupProjectCatalogVariant | null
}

interface DeviceArrangementPayload {
  title: string
  initialDrawValue: string
  designMode: 'device_arrangement'
}

const props = withDefaults(defineProps<{
  visible: boolean
  activeProjectId?: string
  resourceMutating?: boolean
  mode?: 'create' | 'insert'
}>(), {
  activeProjectId: '',
  resourceMutating: false,
  mode: 'create',
})

const emit = defineEmits<{
  close: []
  create: [payload: DeviceArrangementPayload]
  insert: [payload: DeviceArrangementPayload]
}>()

const DEVICE_CHOICE_CATALOG_PREFIX = 'catalog:'
const DEVICE_CHOICE_BUILTIN_PREFIX = 'builtin:'

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const fileInputRef = ref<HTMLInputElement | null>(null)
const screenshots = ref<ScreenshotDraft[]>([])
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

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function sanitizeLocalId(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function resolveCatalogChoiceKey(presetKey: string): string {
  return `${DEVICE_CHOICE_CATALOG_PREFIX}${presetKey}`
}

function resolveBuiltinChoiceKey(presetKey: string): string {
  return `${DEVICE_CHOICE_BUILTIN_PREFIX}${presetKey}`
}

const catalogCategories = computed(() => mockupCatalog.value?.categories || [])
const catalogVariantEntries = computed(() => {
  return catalogCategories.value.flatMap((category) => {
    return category.models.flatMap((model) => {
      return model.variants.map(variant => ({
        category,
        model,
        variant,
      }))
    })
  })
})
const selectedCategory = computed(() => {
  const categoryKey = selectedCategoryKey.value || catalogCategories.value[0]?.key || ''
  return catalogCategories.value.find(category => category.key === categoryKey) || null
})
const selectedModel = computed<MockupProjectCatalogModel | null>(() => {
  const modelId = selectedModelId.value || selectedCategory.value?.models[0]?.id || ''
  return selectedCategory.value?.models.find(model => model.id === modelId) || null
})
const selectedVariant = computed<MockupProjectCatalogVariant | null>(() => {
  const presetKey = selectedVariantPresetKey.value
  return selectedModel.value?.variants.find(variant => variant.presetKey === presetKey) || null
})
const catalogDeviceChoices = computed<ArrangementDeviceChoice[]>(() => {
  return catalogVariantEntries.value.map(({ model, variant }) => ({
    key: resolveCatalogChoiceKey(variant.presetKey),
    label: `${model.title} · ${variant.title}`,
    helper: `${variant.resolvedPreset.screenWidth}×${variant.resolvedPreset.screenHeight}`,
    shellStatusText: variant.shellAssetPayload && variant.shellAssetUrl ? '真实设备壳' : '内置设备壳',
    presetKey: variant.resolvedPreset.key,
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
    source: 'builtin',
    variant: null,
  }))
})
const deviceChoiceMap = computed(() => {
  return new Map(
    [...catalogDeviceChoices.value, ...builtinDeviceChoices.value].map(choice => [choice.key, choice]),
  )
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
const createDisabled = computed(() => {
  return props.resourceMutating
    || screenshots.value.length === 0
    || !defaultDeviceChoice.value
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
  ))
  return matchedTemplate?.key || ''
})

async function requestProjectApi<T>(path: string): Promise<T> {
  const response = await fetch(endpoint(path), {
    credentials: 'include',
  })
  const result = (await response.json().catch(() => null)) as ApiResponse<T> | null
  if (!response.ok || !result || result.code !== 0)
    throw new Error(String(result?.message || '请求失败。'))
  return result.data
}

function syncCatalogSelection(): void {
  const firstCategory = catalogCategories.value[0] || null
  if (!selectedCategory.value && firstCategory)
    selectedCategoryKey.value = firstCategory.key
  const firstModel = selectedCategory.value?.models[0] || null
  if (!selectedModel.value && firstModel)
    selectedModelId.value = firstModel.id
  const firstVariant = selectedModel.value?.variants[0] || null
  if (!selectedVariant.value && firstVariant)
    selectedVariantPresetKey.value = firstVariant.presetKey
}

async function loadMockupCatalog(): Promise<void> {
  const projectId = normalizeString(props.activeProjectId)
  if (!props.visible || !projectId) {
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
    syncCatalogSelection()
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
  () => [props.visible, props.activeProjectId] as const,
  () => {
    if (props.visible)
      void loadMockupCatalog()
  },
  { immediate: true },
)

watch(
  catalogCategories,
  () => syncCatalogSelection(),
)

function handleCategoryChange(value: string): void {
  selectedCategoryKey.value = value
  selectedModelId.value = ''
  selectedVariantPresetKey.value = ''
  syncCatalogSelection()
}

function handleModelChange(value: string): void {
  selectedModelId.value = value
  selectedVariantPresetKey.value = ''
  syncCatalogSelection()
}

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

function applyChoiceToScreenshot(item: ScreenshotDraft, choiceKey: string): ScreenshotDraft {
  const choice = resolveDeviceChoice(choiceKey, item.deviceFramePresetKey || fallbackPresetKey.value)
  const shellAsset = buildCatalogShellAsset(choice.variant || null)
  return {
    ...item,
    deviceChoiceKey: choice.key,
    deviceFramePresetKey: choice.presetKey,
    shellAssetId: shellAsset?.id || '',
  }
}

function resolveScreenshotDeviceLabel(item: ScreenshotDraft): string {
  const choice = resolveDeviceChoice(item.deviceChoiceKey, item.deviceFramePresetKey)
  return `${choice.label} · ${choice.helper} · ${choice.shellStatusText}`
}

function createScreenshotDraft(input: {
  name: string
  src: string
  width: number
  height: number
}): ScreenshotDraft {
  const defaultChoice = defaultDeviceChoice.value
  return {
    id: `screenshot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: input.name || 'screenshot',
    src: input.src,
    width: input.width,
    height: input.height,
    deviceChoiceKey: defaultChoice?.key || resolveBuiltinChoiceKey(fallbackPresetKey.value),
    deviceFramePresetKey: defaultChoice?.presetKey || fallbackPresetKey.value,
    shellAssetId: buildCatalogShellAsset(defaultChoice?.variant || null)?.id || '',
  }
}

async function resolveScreenshotAssetSrc(file: File, fallbackSrc: string): Promise<string> {
  screenshotUploadError.value = ''
  try {
    return await uploadDeviceArrangementScreenshotAsset({
      endpoint,
      projectId: props.activeProjectId,
      file,
    }) || fallbackSrc
  }
  catch (error) {
    screenshotUploadError.value = String(error instanceof Error ? error.message : '截图资源化失败，已临时使用内嵌图片。')
    return fallbackSrc
  }
}

function readImageFile(file: File): Promise<ScreenshotDraft> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'))
    reader.onload = () => {
      const src = String(reader.result || '')
      const image = new Image()
      const fallback = async () => {
        const assetSrc = await resolveScreenshotAssetSrc(file, src)
        resolve(createScreenshotDraft({
          name: file.name || 'screenshot',
          src: assetSrc,
          width: 0,
          height: 0,
        }))
      }
      image.onload = async () => {
        const assetSrc = await resolveScreenshotAssetSrc(file, src)
        resolve(createScreenshotDraft({
          name: file.name || 'screenshot',
          src: assetSrc,
          width: image.naturalWidth || 0,
          height: image.naturalHeight || 0,
        }))
      }
      image.onerror = fallback
      image.src = src
    }
    reader.readAsDataURL(file)
  })
}

async function addFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList)
    .filter(file => file.type.startsWith('image/'))
    .slice(0, 9)
  if (!files.length)
    return

  const nextItems = await Promise.all(files.map(file => readImageFile(file)))
  screenshots.value = [...screenshots.value, ...nextItems].slice(0, 9)
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

function buildArrangementDocument() {
  return buildDeviceArrangementSceneDocument({
    title: '设备排布',
    items: screenshots.value.map((item) => {
      const choice = resolveDeviceChoice(item.deviceChoiceKey, item.deviceFramePresetKey)
      const shellAsset = buildCatalogShellAsset(choice.variant || null)
      return {
        screenshotSrc: item.src,
        screenshotName: item.name,
        screenshotWidth: item.width,
        screenshotHeight: item.height,
        deviceFramePresetKey: choice.presetKey,
        shellAsset,
        shellMode: shellAsset ? 'external' : 'builtin',
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

const previewMarkup = computed(() => {
  const document = buildArrangementDocument()
  if (!document)
    return ''
  return renderCompositionAssetToSvg(document, {
    pageId: 'device-arrangement-export',
  })
})

function submit(): void {
  const document = buildArrangementDocument()
  if (!document || createDisabled.value)
    return
  const payload: DeviceArrangementPayload = {
    title: '设备排布',
    initialDrawValue: serializeSceneDocument(document),
    designMode: 'device_arrangement',
  }
  if (props.mode === 'insert')
    emit('insert', payload)
  else
    emit('create', payload)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="device-arrangement-dialog"
      data-testid="workspace-device-arrangement-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="设备排布"
      @paste="handlePaste"
    >
      <div class="device-arrangement-dialog__backdrop" @click="emit('close')" />
      <section class="device-arrangement-dialog__panel">
        <header class="device-arrangement-dialog__header">
          <div>
            <p class="device-arrangement-dialog__eyebrow">
              设备排布
            </p>
            <h2 class="device-arrangement-dialog__title">
              上传截图，生成静态 mockup
            </h2>
          </div>
          <button
            class="device-arrangement-dialog__icon-button"
            type="button"
            aria-label="关闭"
            @click="emit('close')"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>

        <div class="device-arrangement-dialog__body">
          <div class="device-arrangement-dialog__controls">
            <section class="device-arrangement-dialog__section">
              <div class="device-arrangement-dialog__section-header">
                <h3>排布模版</h3>
                <span>{{ DEVICE_ARRANGEMENT_TEMPLATE_PRESETS.length }} 套</span>
              </div>
              <div class="device-arrangement-dialog__template-grid" data-testid="workspace-device-arrangement-templates">
                <button
                  v-for="template in DEVICE_ARRANGEMENT_TEMPLATE_PRESETS"
                  :key="template.key"
                  type="button"
                  class="device-arrangement-dialog__template-button"
                  :class="{ 'device-arrangement-dialog__template-button--active': activeArrangementTemplateKey === template.key }"
                  @click="applyArrangementTemplate(template)"
                >
                  <strong>{{ template.title }}</strong>
                  <span>{{ template.summary }}</span>
                </button>
              </div>
            </section>

            <section class="device-arrangement-dialog__section">
              <div class="device-arrangement-dialog__section-header">
                <h3>截图</h3>
                <span>{{ screenshots.length }}/9</span>
              </div>
              <button
                class="device-arrangement-dialog__upload"
                type="button"
                data-testid="workspace-device-arrangement-upload"
                @click="fileInputRef?.click()"
              >
                <span class="material-symbols-outlined">add_photo_alternate</span>
                <span>选择图片，或直接粘贴截图</span>
              </button>
              <input
                ref="fileInputRef"
                class="device-arrangement-dialog__file-input"
                type="file"
                accept="image/*"
                multiple
                @change="handleFileInputChange"
              >
              <p v-if="screenshotUploadError" class="device-arrangement-dialog__hint device-arrangement-dialog__hint--error">
                {{ screenshotUploadError }}
              </p>
              <div v-if="screenshots.length" class="device-arrangement-dialog__screenshot-list">
                <div
                  v-for="item in screenshots"
                  :key="item.id"
                  class="device-arrangement-dialog__screenshot"
                >
                  <img :src="item.src" :alt="item.name">
                  <div class="device-arrangement-dialog__screenshot-body">
                    <div class="device-arrangement-dialog__screenshot-meta">
                      <strong>{{ item.name }}</strong>
                      <span>{{ item.width || '-' }}×{{ item.height || '-' }}</span>
                    </div>
                    <label class="device-arrangement-dialog__field device-arrangement-dialog__field--dense">
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
                    <span class="device-arrangement-dialog__device-summary">
                      {{ resolveScreenshotDeviceLabel(item) }}
                    </span>
                  </div>
                  <button type="button" aria-label="移除截图" @click="removeScreenshot(item.id)">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>
            </section>

            <section class="device-arrangement-dialog__section">
              <div class="device-arrangement-dialog__section-header">
                <h3>默认设备</h3>
                <span>{{ selectedShellStatusText }}</span>
              </div>
              <p v-if="mockupCatalogLoading" class="device-arrangement-dialog__hint">
                正在读取项目 mockup 目录。
              </p>
              <p v-else-if="mockupCatalogError" class="device-arrangement-dialog__hint">
                {{ mockupCatalogError }} 已切换到内置设备。
              </p>
              <div v-if="catalogCategories.length" class="device-arrangement-dialog__grid">
                <label>
                  <span>分类</span>
                  <select :value="selectedCategory?.key || ''" @change="handleCategoryChange(($event.target as HTMLSelectElement).value)">
                    <option v-for="category in catalogCategories" :key="category.key" :value="category.key">
                      {{ category.title }}
                    </option>
                  </select>
                </label>
                <label>
                  <span>型号</span>
                  <select :value="selectedModel?.id || ''" @change="handleModelChange(($event.target as HTMLSelectElement).value)">
                    <option v-for="model in selectedCategory?.models || []" :key="model.id" :value="model.id">
                      {{ model.title }}
                    </option>
                  </select>
                </label>
                <label class="device-arrangement-dialog__wide-field">
                  <span>变体</span>
                  <select
                    :value="selectedVariant?.presetKey || ''"
                    data-testid="workspace-device-arrangement-device-select"
                    @change="selectedVariantPresetKey = ($event.target as HTMLSelectElement).value"
                  >
                    <option value="">
                      使用内置设备
                    </option>
                    <option v-for="variant in selectedModel?.variants || []" :key="variant.presetKey" :value="variant.presetKey">
                      {{ variant.title }} · {{ variant.resolvedPreset.screenWidth }}×{{ variant.resolvedPreset.screenHeight }}
                    </option>
                  </select>
                </label>
              </div>
              <label class="device-arrangement-dialog__field">
                <span>内置设备</span>
                <select
                  v-model="fallbackPresetKey"
                  data-testid="workspace-device-arrangement-device-select"
                >
                  <option v-for="preset in DEVICE_FRAME_PRESETS" :key="preset.key" :value="preset.key">
                    {{ preset.title }} · {{ preset.screenWidth }}×{{ preset.screenHeight }}
                  </option>
                </select>
              </label>
              <button
                class="device-arrangement-dialog__secondary device-arrangement-dialog__wide-action"
                type="button"
                :disabled="!screenshots.length"
                data-testid="workspace-device-arrangement-apply-all-devices"
                @click="applyDefaultDeviceToAll"
              >
                应用到全部截图
              </button>
            </section>

            <section class="device-arrangement-dialog__section">
              <div class="device-arrangement-dialog__section-header">
                <h3>布局与导出</h3>
              </div>
              <label class="device-arrangement-dialog__field">
                <span>布局</span>
                <select v-model="layoutPresetKey" data-testid="workspace-device-arrangement-layout">
                  <option v-for="layout in DEVICE_ARRANGEMENT_LAYOUT_PRESETS" :key="layout.key" :value="layout.key">
                    {{ layout.title }}
                  </option>
                </select>
              </label>
              <div class="device-arrangement-dialog__grid">
                <label>
                  <span>尺寸</span>
                  <select v-model="exportSizePresetKey" data-testid="workspace-device-arrangement-export-size">
                    <option v-for="size in DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS" :key="size.key" :value="size.key">
                      {{ size.title }}
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
              <div class="device-arrangement-dialog__grid">
                <label>
                  <span>底色</span>
                  <input v-model="background" type="color">
                </label>
                <label>
                  <span>水印</span>
                  <input v-model="watermarkText" type="text" placeholder="可选">
                </label>
              </div>
              <div class="device-arrangement-dialog__grid" data-testid="workspace-device-arrangement-effects">
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
                <label class="device-arrangement-dialog__wide-field">
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

          <div class="device-arrangement-dialog__preview">
            <div v-if="previewMarkup" class="device-arrangement-dialog__preview-surface" v-html="previewMarkup" />
            <div v-else class="device-arrangement-dialog__empty-preview">
              <span class="material-symbols-outlined">devices</span>
              <p>添加截图后生成预览。</p>
            </div>
          </div>
        </div>

        <footer class="device-arrangement-dialog__footer">
          <button type="button" class="device-arrangement-dialog__secondary" @click="emit('close')">
            取消
          </button>
          <button
            type="button"
            class="device-arrangement-dialog__primary"
            data-testid="workspace-device-arrangement-create"
            :disabled="createDisabled"
            @click="submit"
          >
            {{ mode === 'insert' ? '插入设备排布' : '创建设备排布' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.device-arrangement-dialog {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.device-arrangement-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(15 23 42 / 0.38);
  backdrop-filter: blur(10px);
}

.device-arrangement-dialog__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1180px, calc(100vw - 32px));
  max-height: min(860px, calc(100vh - 32px));
  overflow: hidden;
  border: 1px solid rgb(226 232 240 / 0.95);
  border-radius: 8px;
  background: #ffffff;
}

.device-arrangement-dialog__header,
.device-arrangement-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.device-arrangement-dialog__footer {
  border-top: 1px solid #e2e8f0;
  border-bottom: 0;
}

.device-arrangement-dialog__eyebrow {
  margin: 0 0 4px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 800;
}

.device-arrangement-dialog__title {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
  font-weight: 800;
}

.device-arrangement-dialog__icon-button,
.device-arrangement-dialog__secondary,
.device-arrangement-dialog__primary {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.device-arrangement-dialog__icon-button {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
}

.device-arrangement-dialog__secondary,
.device-arrangement-dialog__primary {
  min-height: 34px;
  padding: 0 14px;
}

.device-arrangement-dialog__primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.device-arrangement-dialog__primary:disabled {
  border-color: #cbd5e1;
  background: #e2e8f0;
  color: #64748b;
  cursor: not-allowed;
}

.device-arrangement-dialog__body {
  display: grid;
  min-height: 0;
  grid-template-columns: 360px minmax(0, 1fr);
  overflow: hidden;
}

.device-arrangement-dialog__controls {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 16px;
}

.device-arrangement-dialog__section {
  padding: 0 0 18px;
}

.device-arrangement-dialog__section + .device-arrangement-dialog__section {
  padding-top: 18px;
  border-top: 1px solid #e2e8f0;
}

.device-arrangement-dialog__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.device-arrangement-dialog__section-header h3 {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.device-arrangement-dialog__section-header span,
.device-arrangement-dialog__hint,
.device-arrangement-dialog__device-summary {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.device-arrangement-dialog__hint--error {
  color: #dc2626;
}

.device-arrangement-dialog__template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.device-arrangement-dialog__template-button {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #ffffff;
  text-align: left;
}

.device-arrangement-dialog__template-button strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 800;
}

.device-arrangement-dialog__template-button span {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.device-arrangement-dialog__template-button--active {
  border-color: #0ea5e9;
  background: #f0f9ff;
}

.device-arrangement-dialog__upload {
  display: flex;
  width: 100%;
  min-height: 74px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed #94a3b8;
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

.device-arrangement-dialog__file-input {
  display: none;
}

.device-arrangement-dialog__screenshot-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.device-arrangement-dialog__screenshot {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 28px;
  align-items: start;
  gap: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  padding: 6px;
}

.device-arrangement-dialog__screenshot img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 6px;
}

.device-arrangement-dialog__screenshot-body,
.device-arrangement-dialog__screenshot-meta {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.device-arrangement-dialog__screenshot-meta {
  gap: 2px;
}

.device-arrangement-dialog__screenshot-meta strong,
.device-arrangement-dialog__screenshot-meta span,
.device-arrangement-dialog__device-summary {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-arrangement-dialog__screenshot-meta strong {
  color: #0f172a;
  font-size: 12px;
}

.device-arrangement-dialog__screenshot-meta span {
  color: #64748b;
  font-size: 11px;
}

.device-arrangement-dialog__screenshot button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
}

.device-arrangement-dialog__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.device-arrangement-dialog__field,
.device-arrangement-dialog__grid label {
  display: grid;
  gap: 5px;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.device-arrangement-dialog__field--dense {
  gap: 4px;
}

.device-arrangement-dialog__wide-field {
  grid-column: 1 / -1;
}

.device-arrangement-dialog__wide-action {
  width: 100%;
  margin-top: 10px;
}

.device-arrangement-dialog__wide-action:disabled {
  opacity: 0.55;
}

.device-arrangement-dialog__field input,
.device-arrangement-dialog__field select,
.device-arrangement-dialog__grid input,
.device-arrangement-dialog__grid select {
  min-width: 0;
  height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
  padding: 0 9px;
}

.device-arrangement-dialog__preview {
  display: flex;
  min-width: 0;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: #eef2f7;
  padding: 28px;
}

.device-arrangement-dialog__preview-surface {
  width: min(100%, 760px);
}

.device-arrangement-dialog__preview-surface :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 24px 70px rgb(15 23 42 / 0.16);
}

.device-arrangement-dialog__empty-preview {
  display: grid;
  gap: 10px;
  place-items: center;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}

.device-arrangement-dialog__empty-preview .material-symbols-outlined {
  font-size: 42px;
}

@media (max-width: 860px) {
  .device-arrangement-dialog {
    padding: 12px;
  }

  .device-arrangement-dialog__body {
    grid-template-columns: 1fr;
  }

  .device-arrangement-dialog__controls {
    max-height: 48vh;
    border-right: 0;
    border-bottom: 1px solid #e2e8f0;
  }
}
</style>
