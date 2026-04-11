<script setup lang="ts">
import type { CompositionModel } from '~~/shared/types/domain'
import { computed, ref, watch } from 'vue'
import {
  buildDeviceMockupSceneDocument,
  DEVICE_FRAME_PRESETS,
  relayoutSceneDocument,
  renderCompositionAssetToSvg,
  parseSceneDocumentString,
  serializeSceneDocument,
  SYSTEM_SCENE_TEMPLATES,
} from '~~/shared/utils/scene-document'

const props = withDefaults(defineProps<{
  modelValue?: string
  hasDesignResource?: boolean
  designResourceId?: string
  boundResourceId?: string
  designPanelTitle?: string
  collabRevision?: number
  collabConnected?: boolean
  collabConnectionText?: string
  collabDrawError?: string
}>(), {
  modelValue: '',
  hasDesignResource: false,
  designResourceId: '',
  boundResourceId: '',
  designPanelTitle: '设计稿',
  collabRevision: 0,
  collabConnected: false,
  collabConnectionText: '',
  collabDrawError: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const templateOptions = SYSTEM_SCENE_TEMPLATES.filter(template => template.category === 'composition')
const DEFAULT_TEMPLATE_KEY = templateOptions[0]?.templateKey || 'device-showcase'
const DEFAULT_DEVICE_FRAME_KEY = DEVICE_FRAME_PRESETS[0]?.key || 'iphone-16-pro'
const DEFAULT_TITLE = '统一图形/设计/结构源平台'
const DEFAULT_SUBTITLE = '文本/结构源 -> canonical 模型 -> 交互编辑 -> 模板套用 -> 导出资产'
const DEFAULT_BADGE = 'Design'
const DEFAULT_ACCENT_COLOR = '#38bdf8'
const DEFAULT_BACKGROUND_COLOR = '#0f172a'

function createDefaultDesignSceneDocument() {
  return buildDeviceMockupSceneDocument({
    title: DEFAULT_TITLE,
    subtitle: DEFAULT_SUBTITLE,
    badge: DEFAULT_BADGE,
    templateKey: DEFAULT_TEMPLATE_KEY,
    deviceFramePresetKey: DEFAULT_DEVICE_FRAME_KEY,
    themeTokens: {
      accent: DEFAULT_ACCENT_COLOR,
      background: DEFAULT_BACKGROUND_COLOR,
    },
  })
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function createFallbackCompositionModel(): CompositionModel {
  const fallbackSourceModel = createDefaultDesignSceneDocument().sourceModel
  if (fallbackSourceModel.kind === 'composition')
    return fallbackSourceModel
  throw new Error('DEFAULT_DESIGN_SOURCE_MODEL_INVALID')
}

function resolveCompositionModel(document: ReturnType<typeof createDefaultDesignSceneDocument>): CompositionModel {
  if (document.sourceModel.kind === 'composition')
    return document.sourceModel
  return createFallbackCompositionModel()
}

function resolveIncomingDesignDocument(rawValue: string): {
  document: ReturnType<typeof createDefaultDesignSceneDocument>
  shouldPersistNormalized: boolean
} {
  const normalizedRawValue = String(rawValue || '').trim()
  if (!normalizedRawValue) {
    return {
      document: createDefaultDesignSceneDocument(),
      shouldPersistNormalized: true,
    }
  }

  const parsed = parseSceneDocumentString(normalizedRawValue, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
  const migratedFromLegacyDraw = Boolean(parsed.metadata?.migratedFromLegacyDraw)

  if (migratedFromLegacyDraw || parsed.drawMode !== 'composition' || parsed.sourceModel.kind !== 'composition') {
    return {
      document: createDefaultDesignSceneDocument(),
      shouldPersistNormalized: true,
    }
  }

  return {
    document: relayoutSceneDocument(parsed),
    shouldPersistNormalized: false,
  }
}

const baseSceneDocument = ref(createDefaultDesignSceneDocument())
const selectedTemplateKey = ref(DEFAULT_TEMPLATE_KEY)
const selectedDeviceFrameKey = ref(DEFAULT_DEVICE_FRAME_KEY)
const title = ref(DEFAULT_TITLE)
const subtitle = ref(DEFAULT_SUBTITLE)
const badge = ref(DEFAULT_BADGE)
const accentColor = ref(DEFAULT_ACCENT_COLOR)
const backgroundColor = ref(DEFAULT_BACKGROUND_COLOR)
const uploadedImageName = ref('')
const uploadedImageSrc = ref('')
const syncingFromModel = ref(false)
const lastAppliedSceneJson = ref('')

const isBoundToDesignResource = computed(() => {
  const designResourceId = normalizeString(props.designResourceId)
  const boundResourceId = normalizeString(props.boundResourceId)
  return Boolean(designResourceId) && designResourceId === boundResourceId
})

const panelStatusLabel = computed(() => {
  if (!props.hasDesignResource)
    return '正在初始化设计稿...'
  if (!isBoundToDesignResource.value)
    return '正在连接设计稿...'
  return props.collabConnectionText || '设计稿已连接'
})

const panelStatusToneClass = computed(() => {
  if (!props.hasDesignResource || !isBoundToDesignResource.value)
    return 'text-amber-700 border-amber-200 bg-amber-50'
  return props.collabConnected ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-amber-700 border-amber-200 bg-amber-50'
})

function syncDraftFromDocument(document: ReturnType<typeof createDefaultDesignSceneDocument>): void {
  const composition = resolveCompositionModel(document)
  const compositionSlots = composition.slots || {}
  const compositionThemeTokens = composition.themeTokens || {}

  baseSceneDocument.value = document
  selectedTemplateKey.value = normalizeString(document.templateKey || composition.templateKey) || DEFAULT_TEMPLATE_KEY
  selectedDeviceFrameKey.value = normalizeString(composition.deviceFramePresetKey) || DEFAULT_DEVICE_FRAME_KEY
  title.value = normalizeString(compositionSlots.title) || DEFAULT_TITLE
  subtitle.value = normalizeString(compositionSlots.subtitle) || DEFAULT_SUBTITLE
  badge.value = normalizeString(compositionSlots.badge) || DEFAULT_BADGE
  accentColor.value = normalizeString(compositionThemeTokens.accent) || DEFAULT_ACCENT_COLOR
  backgroundColor.value = normalizeString(compositionThemeTokens.background) || DEFAULT_BACKGROUND_COLOR
  uploadedImageSrc.value = normalizeString(compositionSlots.imageSrc)
  uploadedImageName.value = uploadedImageSrc.value ? '已载入设计图片' : ''
}

const sceneDocument = computed(() => {
  const fallbackDocument = createDefaultDesignSceneDocument()
  const baseDocument = baseSceneDocument.value
  const fallbackSourceModel = resolveCompositionModel(fallbackDocument)
  const baseSourceModel = resolveCompositionModel(baseDocument)

  return relayoutSceneDocument({
    ...baseDocument,
    drawMode: 'composition',
    sourceType: 'image_mockup',
    templateKey: selectedTemplateKey.value,
    sourceModel: {
      ...baseSourceModel,
      templateKey: selectedTemplateKey.value,
      deviceFramePresetKey: selectedDeviceFrameKey.value,
      slots: {
        ...(baseSourceModel.slots || {}),
        title: normalizeString(title.value) || DEFAULT_TITLE,
        subtitle: normalizeString(subtitle.value) || DEFAULT_SUBTITLE,
        badge: normalizeString(badge.value) || DEFAULT_BADGE,
        imageSrc: normalizeString(uploadedImageSrc.value),
      },
      themeTokens: {
        ...(fallbackSourceModel.themeTokens || {}),
        ...(baseSourceModel.themeTokens || {}),
        accent: normalizeString(accentColor.value) || DEFAULT_ACCENT_COLOR,
        background: normalizeString(backgroundColor.value) || DEFAULT_BACKGROUND_COLOR,
      },
    },
  })
})

const svgMarkup = computed(() => renderCompositionAssetToSvg(sceneDocument.value))
const sceneJson = computed(() => serializeSceneDocument(sceneDocument.value))

watch(
  [() => props.modelValue, isBoundToDesignResource],
  ([nextModelValue, nextIsBound]) => {
    const resolved = resolveIncomingDesignDocument(nextIsBound ? nextModelValue : '')
    syncingFromModel.value = true
    syncDraftFromDocument(resolved.document)
    lastAppliedSceneJson.value = sceneJson.value
    syncingFromModel.value = false

    if (nextIsBound && resolved.shouldPersistNormalized) {
      lastAppliedSceneJson.value = sceneJson.value
      emit('update:modelValue', sceneJson.value)
    }
  },
  { immediate: true },
)

watch(
  [
    selectedTemplateKey,
    selectedDeviceFrameKey,
    title,
    subtitle,
    badge,
    accentColor,
    backgroundColor,
    uploadedImageSrc,
  ],
  () => {
    if (syncingFromModel.value || !isBoundToDesignResource.value)
      return
    if (sceneJson.value === lastAppliedSceneJson.value)
      return
    lastAppliedSceneJson.value = sceneJson.value
    emit('update:modelValue', sceneJson.value)
  },
)

async function handleImageChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file)
    return

  uploadedImageName.value = file.name
  uploadedImageSrc.value = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'))
    reader.readAsDataURL(file)
  }).catch(() => '')
}

function downloadSvg(): void {
  if (!import.meta.client)
    return

  const blob = new Blob([svgMarkup.value], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${selectedTemplateKey.value || 'scene'}.svg`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="mx-auto grid h-full min-h-0 max-w-7xl grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[360px,minmax(0,1fr)] xl:p-6">
    <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold text-slate-900">
            {{ props.designPanelTitle }}
          </h2>
          <p class="mt-1 text-xs leading-6 text-slate-500">
            设计稿现在直接写入协作 `SceneDocument`。原图保持不改写，边框与导出效果仍然走非破坏性 composition 层。
          </p>
        </div>
        <button
          class="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          type="button"
          :disabled="!props.hasDesignResource"
          @click="downloadSvg"
        >
          下载 SVG
        </button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <span class="rounded-full border px-2.5 py-1 text-[11px] font-semibold" :class="panelStatusToneClass">
          {{ panelStatusLabel }}
        </span>
        <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {{ selectedTemplateKey }} / {{ selectedDeviceFrameKey }}
        </span>
        <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          revision {{ props.collabRevision }}
        </span>
      </div>

      <div class="mt-4 space-y-4">
        <label class="block space-y-1">
          <span class="text-xs font-semibold text-slate-700">上传图片</span>
          <input
            class="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100"
            accept="image/*"
            type="file"
            :disabled="!isBoundToDesignResource"
            @change="handleImageChange"
          >
          <p class="text-[11px] text-slate-500">
            {{ uploadedImageName || '未选择图片，将先展示占位态。' }}
          </p>
        </label>

        <label class="block space-y-1">
          <span class="text-xs font-semibold text-slate-700">模板</span>
          <select
            v-model="selectedTemplateKey"
            class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            :disabled="!isBoundToDesignResource"
          >
            <option v-for="template in templateOptions" :key="template.templateKey" :value="template.templateKey">
              {{ template.title }}
            </option>
          </select>
        </label>

        <label class="block space-y-1">
          <span class="text-xs font-semibold text-slate-700">设备边框</span>
          <select
            v-model="selectedDeviceFrameKey"
            class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            :disabled="!isBoundToDesignResource"
          >
            <option v-for="preset in DEVICE_FRAME_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.title }}
            </option>
          </select>
        </label>

        <label class="block space-y-1">
          <span class="text-xs font-semibold text-slate-700">标题</span>
          <input
            v-model="title"
            class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="text"
            :disabled="!isBoundToDesignResource"
          >
        </label>

        <label class="block space-y-1">
          <span class="text-xs font-semibold text-slate-700">副标题</span>
          <textarea
            v-model="subtitle"
            class="min-h-[88px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            :disabled="!isBoundToDesignResource"
          />
        </label>

        <label class="block space-y-1">
          <span class="text-xs font-semibold text-slate-700">角标</span>
          <input
            v-model="badge"
            class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="text"
            :disabled="!isBoundToDesignResource"
          >
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block space-y-1">
            <span class="text-xs font-semibold text-slate-700">强调色</span>
            <input
              v-model="accentColor"
              class="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 disabled:cursor-not-allowed disabled:bg-slate-100"
              type="color"
              :disabled="!isBoundToDesignResource"
            >
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-semibold text-slate-700">背景色</span>
            <input
              v-model="backgroundColor"
              class="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 disabled:cursor-not-allowed disabled:bg-slate-100"
              type="color"
              :disabled="!isBoundToDesignResource"
            >
          </label>
        </div>
      </div>
    </section>

    <section class="grid min-h-0 grid-cols-1 gap-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-slate-900">
              实时预览
            </h3>
            <p class="mt-1 text-xs text-slate-500">
              当前编辑值会直接同步到协作 draw 资源，重新打开 design 页时可继续基于同一份 SceneDocument 编辑。
            </p>
          </div>
          <div class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
            {{ props.designResourceId || 'pending-design-resource' }}
          </div>
        </div>
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" v-html="svgMarkup" />
        <p v-if="props.collabDrawError" class="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
          {{ props.collabDrawError }}
        </p>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-slate-950 p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-white">
              SceneDocument JSON
            </h3>
            <p class="mt-1 text-xs text-slate-400">
              设计页现在直接维护持久化 JSON，不再只是本地态预览。
            </p>
          </div>
        </div>
        <pre class="max-h-[360px] overflow-auto rounded-2xl bg-slate-900 p-3 text-[11px] leading-5 text-slate-200">{{ sceneJson }}</pre>
      </div>
    </section>
  </div>
</template>
