<script setup lang="ts">
import {
  buildDrawioEmbedUrl,
  extractDrawioXmlFromCollabValue,
  resolveDrawioOrigin,
  serializeDrawioCollabValue,
} from '~/utils/workspace-drawio'

const props = withDefaults(defineProps<{
  modelValue?: string
  diagramTitle?: string
  readonly?: boolean
}>(), {
  modelValue: '',
  diagramTitle: '流程画布',
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const runtimeConfig = useRuntimeConfig()
const drawioEmbedBaseUrl = computed(() => String(runtimeConfig.public?.drawio?.embedBaseUrl || '').trim())
const frameUrl = computed(() => buildDrawioEmbedUrl(drawioEmbedBaseUrl.value))
const drawioOrigin = computed(() => resolveDrawioOrigin(drawioEmbedBaseUrl.value))
const iframeBooting = ref(true)
const iframeError = ref('')
const editorReady = ref(false)
const currentXml = ref(extractDrawioXmlFromCollabValue(props.modelValue, props.diagramTitle))

let bootTimeout: ReturnType<typeof setTimeout> | null = null
let pendingEmitTimer: ReturnType<typeof setTimeout> | null = null

function clearBootTimeout(): void {
  if (!bootTimeout)
    return
  clearTimeout(bootTimeout)
  bootTimeout = null
}

function clearPendingEmitTimer(): void {
  if (!pendingEmitTimer)
    return
  clearTimeout(pendingEmitTimer)
  pendingEmitTimer = null
}

function postMessage(message: Record<string, unknown>): void {
  const targetWindow = iframeRef.value?.contentWindow
  if (!targetWindow)
    return
  targetWindow.postMessage(JSON.stringify(message), drawioOrigin.value)
}

function loadEditorXml(xml: string): void {
  currentXml.value = xml
  postMessage({
    action: 'load',
    autosave: 1,
    saveAndExit: '0',
    noSaveBtn: props.readonly ? '1' : '0',
    modified: 'unsavedChanges',
    title: props.diagramTitle,
    xml,
  })
}

function emitSerializedDocument(xml: string): void {
  clearPendingEmitTimer()
  pendingEmitTimer = setTimeout(() => {
    emit('update:modelValue', serializeDrawioCollabValue(xml))
  }, 120)
}

function applyEditorXml(xml: unknown): void {
  const nextXml = String(xml || '').trim()
  if (!nextXml)
    return

  currentXml.value = nextXml
  iframeError.value = ''
  emitSerializedDocument(nextXml)
}

function startBootWatchdog(): void {
  clearBootTimeout()
  iframeBooting.value = true
  iframeError.value = ''
  bootTimeout = setTimeout(() => {
    if (editorReady.value)
      return
    iframeBooting.value = false
    iframeError.value = `draw.io 编辑器初始化超时，请检查当前环境是否可访问 ${drawioOrigin.value}。`
  }, 8000)
}

function handleMessage(event: MessageEvent): void {
  if (event.origin !== drawioOrigin.value)
    return
  if (event.source !== iframeRef.value?.contentWindow)
    return

  let payload: Record<string, unknown> | null = null
  try {
    payload = typeof event.data === 'string'
      ? JSON.parse(event.data)
      : event.data
  }
  catch {
    return
  }

  if (!payload)
    return

  const eventType = String(payload.event || '').trim()
  if (!eventType)
    return

  if (eventType === 'init') {
    editorReady.value = true
    iframeBooting.value = false
    clearBootTimeout()
    loadEditorXml(currentXml.value)
    if (props.readonly) {
      postMessage({
        action: 'status',
        message: '当前为只读预览',
        modified: false,
      })
    }
    return
  }

  if (eventType === 'autosave' || eventType === 'save') {
    if (!props.readonly)
      applyEditorXml(payload.xml)
    return
  }

  if (eventType === 'exit') {
    if (!props.readonly)
      applyEditorXml(payload.xml)
    loadEditorXml(currentXml.value)
  }
}

watch(() => props.modelValue, (nextValue) => {
  const nextXml = extractDrawioXmlFromCollabValue(String(nextValue || ''), props.diagramTitle)
  if (!nextXml || nextXml === currentXml.value)
    return

  currentXml.value = nextXml
  if (editorReady.value)
    loadEditorXml(nextXml)
}, { immediate: true })

watch(() => props.diagramTitle, () => {
  if (!editorReady.value)
    return
  loadEditorXml(currentXml.value)
})

onMounted(() => {
  window.addEventListener('message', handleMessage)
  startBootWatchdog()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage)
  clearBootTimeout()
  clearPendingEmitTimer()
})
</script>

<template>
  <div class="bg-slate-100 h-full min-h-0 w-full relative">
    <iframe
      ref="iframeRef"
      class="border-0 bg-white h-full min-h-0 w-full"
      :src="frameUrl"
      title="draw.io 流程画布"
    />

    <div v-if="iframeBooting" class="bg-slate-100/80 flex pointer-events-none items-center inset-0 justify-center absolute backdrop-blur-[1px]">
      <div class="text-[12px] text-slate-600 px-4 py-3 border border-slate-200 rounded-2xl bg-white shadow-sm">
        正在初始化 draw.io...
      </div>
    </div>

    <div v-if="iframeError" class="text-[12px] text-amber-700 leading-6 px-4 py-3 border border-amber-200 rounded-2xl bg-amber-50 max-w-md pointer-events-none shadow-sm left-4 top-4 absolute">
      {{ iframeError }}
    </div>
  </div>
</template>
