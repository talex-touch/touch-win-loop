<script setup lang="ts">
import type {
  ApiResponse,
  MockupProjectCatalog,
  MockupProjectCatalogVariant,
} from '~~/shared/types/domain'
import type { DeviceArrangementDocumentV1, DeviceArrangementExportSizePresetKey, DeviceArrangementItemV1 } from '~~/shared/utils/device-arrangement-document'
import { computed, ref, watch } from 'vue'
import {
  createDeviceArrangementItem,
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
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const screenshotUploadError = ref('')
const mockupCatalog = ref<MockupProjectCatalog | null>(null)
const documentState = ref<DeviceArrangementDocumentV1>(normalizeDeviceArrangementDocument({
  title: props.resourceTitle,
}))

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function cloneDocument(): DeviceArrangementDocumentV1 {
  return JSON.parse(JSON.stringify(documentState.value)) as DeviceArrangementDocumentV1
}

function commitDocument(nextDocument: DeviceArrangementDocumentV1, relayout = false): void {
  documentState.value = normalizeDeviceArrangementDocument(nextDocument, { relayout })
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

const previewMarkup = computed(() => renderDeviceArrangementDocumentToSvg(documentState.value))

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
    commitDocument(result.data?.arrangement?.document || { title: props.resourceTitle }, false)
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
  try {
    const current = cloneDocument()
    for (const file of files) {
      const image = await readImageFile(file)
      const fallbackVariant = variantEntries.value[0]?.variant || null
      current.items.push(createDeviceArrangementItem({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: image.name,
        screenshotSrc: image.src,
        screenshotWidth: image.width,
        screenshotHeight: image.height,
        devicePresetKey: fallbackVariant?.presetKey || 'iphone-16-pro',
        shellAssetPayload: fallbackVariant?.shellAssetPayload || null,
        shellAssetUrl: fallbackVariant?.shellAssetUrl,
      }))
    }
    current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
    commitDocument(current, false)
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

function handlePaste(event: ClipboardEvent): void {
  const clipboardItems = Array.from(event.clipboardData?.items || [])
  const files = clipboardItems
    .map((item) => {
      if (!item.type.startsWith('image/'))
        return null
      return item.getAsFile()
    })
    .filter((file): file is File => Boolean(file))

  if (files.length === 0) {
    const clipboardFiles = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'))
    if (clipboardFiles.length === 0)
      return
    event.preventDefault()
    void addScreenshotFiles(clipboardFiles)
    return
  }

  event.preventDefault()
  void addScreenshotFiles(files)
}

function relayoutCurrentDocument(): void {
  const current = cloneDocument()
  current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
  commitDocument(current, false)
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
  commitDocument(current, false)
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
  commitDocument(current, false)
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
        : (patch.shell || item.shell),
    }
  })
  if (relayout)
    current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
  commitDocument(current, false)
}

function removeItem(itemId: string): void {
  const current = cloneDocument()
  current.items = current.items.filter(item => item.id !== itemId)
  current.items = layoutDeviceArrangementItems(current.items, current.canvas, current.layoutPresetKey)
  commitDocument(current, false)
}

function toggleExportSizePreset(sizePresetKey: DeviceArrangementExportSizePresetKey): void {
  const current = cloneDocument()
  const exists = current.exportSizePresetKeys.includes(sizePresetKey)
  current.exportSizePresetKeys = exists
    ? current.exportSizePresetKeys.filter(item => item !== sizePresetKey)
    : [...current.exportSizePresetKeys, sizePresetKey]
  if (current.exportSizePresetKeys.length === 0)
    current.exportSizePresetKeys = [current.canvas.sizePresetKey]
  commitDocument(current, false)
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
    commitDocument(result.data?.arrangement?.document || documentState.value, false)
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

function downloadSvgBlob(fileName: string, svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
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
  URL.revokeObjectURL(url)
  const pngUrl = canvas.toDataURL('image/png')
  const anchor = document.createElement('a')
  anchor.href = pngUrl
  anchor.download = `${sanitizeFileName(exportDocument.title)}-${sizePresetKey}.png`
  anchor.click()
}

async function downloadBatchPng(): Promise<void> {
  for (const sizePresetKey of documentState.value.exportSizePresetKeys)
    await downloadPresetPng(sizePresetKey)
}

watch(() => [props.projectId, props.resourceId], () => {
  void loadDocument()
  void loadMockupCatalog()
}, { immediate: true })
</script>

<template>
  <div class="workspace-device-arrangement-panel" data-testid="workspace-device-arrangement-panel" tabindex="0" @paste="handlePaste">
    <div class="workspace-device-arrangement-panel__sidebar">
      <div class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          截图
        </div>
        <button class="workspace-device-arrangement-panel__button" type="button" @click="fileInputRef?.click()">
          上传截图
        </button>
        <p class="workspace-device-arrangement-panel__hint">
          也支持直接粘贴截图。
        </p>
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
      </div>

      <div class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          模板
        </div>
        <div class="workspace-device-arrangement-panel__chip-grid">
          <button
            v-for="template in DEVICE_ARRANGEMENT_TEMPLATE_PRESETS"
            :key="template.key"
            class="workspace-device-arrangement-panel__chip"
            type="button"
            @click="applyTemplate(template.key)"
          >
            {{ template.title }}
          </button>
        </div>
      </div>

      <div class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          画布
        </div>
        <label class="workspace-device-arrangement-panel__field">
          <span>标题</span>
          <input v-model="documentState.title" class="workspace-device-arrangement-panel__input" type="text">
        </label>
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
          <span>背景模式</span>
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
      </div>

      <div class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          批量导出
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
          <button class="workspace-device-arrangement-panel__button" type="button" @click="downloadPresetSvg(documentState.canvas.sizePresetKey)">
            导出当前 SVG
          </button>
          <button class="workspace-device-arrangement-panel__button" type="button" @click="downloadBatchPng">
            批量导出 PNG
          </button>
        </div>
      </div>
    </div>

    <div class="workspace-device-arrangement-panel__preview">
      <div class="workspace-device-arrangement-panel__preview-toolbar">
        <span v-if="loading" class="workspace-device-arrangement-panel__hint">加载中…</span>
        <span v-else-if="errorMessage" class="workspace-device-arrangement-panel__hint workspace-device-arrangement-panel__hint--error">{{ errorMessage }}</span>
        <span v-else class="workspace-device-arrangement-panel__hint">{{ documentState.items.length }} 台设备</span>
        <button class="workspace-device-arrangement-panel__button workspace-device-arrangement-panel__button--primary" type="button" :disabled="saving" @click="saveDocument">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
      <div class="workspace-device-arrangement-panel__preview-stage">
        <div class="workspace-device-arrangement-panel__preview-card" v-html="previewMarkup" />
      </div>
    </div>

    <div class="workspace-device-arrangement-panel__inspector">
      <div class="workspace-device-arrangement-panel__section">
        <div class="workspace-device-arrangement-panel__section-title">
          设备项
        </div>
      </div>
      <div class="workspace-device-arrangement-panel__item-list">
        <div v-for="item in documentState.items" :key="item.id" class="workspace-device-arrangement-panel__item-card">
          <div class="workspace-device-arrangement-panel__item-header">
            <div class="workspace-device-arrangement-panel__item-title">
              {{ item.name }}
            </div>
            <button class="workspace-device-arrangement-panel__link" type="button" @click="removeItem(item.id)">
              删除
            </button>
          </div>

          <label class="workspace-device-arrangement-panel__field">
            <span>设备壳</span>
            <select
              :value="item.devicePresetKey"
              class="workspace-device-arrangement-panel__input"
              @change="updateItem(item.id, { devicePresetKey: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="entry in variantEntries" :key="entry.variant.id" :value="entry.variant.presetKey">
                {{ entry.categoryTitle }} / {{ entry.modelTitle }} / {{ entry.variant.title }}
              </option>
            </select>
          </label>

          <div class="workspace-device-arrangement-panel__manual-grid" data-testid="workspace-device-arrangement-manual-transform">
            <label class="workspace-device-arrangement-panel__field">
              <span>X</span>
              <input :value="item.offsetX" class="workspace-device-arrangement-panel__input" type="number" @change="updateItem(item.id, { offsetX: Number(($event.target as HTMLInputElement).value || 0) })">
            </label>
            <label class="workspace-device-arrangement-panel__field">
              <span>Y</span>
              <input :value="item.offsetY" class="workspace-device-arrangement-panel__input" type="number" @change="updateItem(item.id, { offsetY: Number(($event.target as HTMLInputElement).value || 0) })">
            </label>
            <label class="workspace-device-arrangement-panel__field">
              <span>缩放</span>
              <input :value="item.scale" class="workspace-device-arrangement-panel__input" type="number" step="0.05" min="0.25" max="3" @change="updateItem(item.id, { scale: Number(($event.target as HTMLInputElement).value || 1) })">
            </label>
            <label class="workspace-device-arrangement-panel__field">
              <span>旋转</span>
              <input :value="item.rotationOffset" class="workspace-device-arrangement-panel__input" type="number" step="1" min="-45" max="45" @change="updateItem(item.id, { rotationOffset: Number(($event.target as HTMLInputElement).value || 0) })">
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-device-arrangement-panel {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: 16px;
  height: 100%;
  min-height: 0;
  padding: 16px;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
}

.workspace-device-arrangement-panel__sidebar,
.workspace-device-arrangement-panel__preview,
.workspace-device-arrangement-panel__inspector {
  min-height: 0;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
}

.workspace-device-arrangement-panel__sidebar,
.workspace-device-arrangement-panel__inspector {
  overflow: auto;
  padding: 16px;
}

.workspace-device-arrangement-panel__preview {
  display: flex;
  flex-direction: column;
}

.workspace-device-arrangement-panel__preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.workspace-device-arrangement-panel__preview-stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.workspace-device-arrangement-panel__preview-card {
  min-height: 100%;
  border-radius: 24px;
  background: radial-gradient(circle at top, rgba(255, 255, 255, 0.96), rgba(226, 232, 240, 0.9));
  padding: 24px;
}

.workspace-device-arrangement-panel__preview-card :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 18px;
}

.workspace-device-arrangement-panel__section + .workspace-device-arrangement-panel__section {
  margin-top: 20px;
}

.workspace-device-arrangement-panel__section-title {
  margin-bottom: 10px;
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}

.workspace-device-arrangement-panel__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.workspace-device-arrangement-panel__input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  padding: 9px 11px;
  color: #0f172a;
  font-size: 13px;
}

.workspace-device-arrangement-panel__button,
.workspace-device-arrangement-panel__chip,
.workspace-device-arrangement-panel__link {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
  padding: 10px 12px;
}

.workspace-device-arrangement-panel__button--primary {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}

.workspace-device-arrangement-panel__chip-grid,
.workspace-device-arrangement-panel__actions,
.workspace-device-arrangement-panel__checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-device-arrangement-panel__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #475569;
  font-size: 12px;
}

.workspace-device-arrangement-panel__hint {
  color: #64748b;
  font-size: 12px;
}

.workspace-device-arrangement-panel__hint--error {
  color: #b91c1c;
}

.workspace-device-arrangement-panel__item-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-device-arrangement-panel__item-card {
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.92);
  padding: 12px;
}

.workspace-device-arrangement-panel__item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.workspace-device-arrangement-panel__item-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}

.workspace-device-arrangement-panel__manual-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 1280px) {
  .workspace-device-arrangement-panel {
    grid-template-columns: 1fr;
  }
}
</style>
