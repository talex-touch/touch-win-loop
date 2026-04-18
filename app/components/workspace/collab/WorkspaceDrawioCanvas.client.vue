<script setup lang="ts">
import type { WorkspaceOutlineNode } from '~/utils/workspace-outline'
import {
  buildDrawioEmbedUrl,
  moveDrawioPageToFront,
  resolveDrawioCollabValue,
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
  'requestRebuild': []
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const runtimeConfig = useRuntimeConfig()
const drawioEmbedBaseUrl = computed(() => String(runtimeConfig.public?.drawio?.embedBaseUrl || '').trim())
const frameUrl = computed(() => buildDrawioEmbedUrl(drawioEmbedBaseUrl.value))
const drawioOrigin = computed(() => resolveDrawioOrigin(drawioEmbedBaseUrl.value))
const resolvedDrawioDocument = computed(() => resolveDrawioCollabValue(String(props.modelValue || ''), props.diagramTitle))
const isLegacyUnavailable = computed(() => resolvedDrawioDocument.value.status === 'legacy_unavailable')
const iframeBooting = ref(true)
const iframeError = ref('')
const editorReady = ref(false)
const currentXml = ref(resolvedDrawioDocument.value.status === 'ready' ? resolvedDrawioDocument.value.xml : '')
const isMounted = ref(false)
const messageListenerAttached = ref(false)
const locateFeedbackMessage = ref('')

let bootTimeout: ReturnType<typeof setTimeout> | null = null
let pendingEmitTimer: ReturnType<typeof setTimeout> | null = null
let locateFeedbackTimer: ReturnType<typeof setTimeout> | null = null

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

function clearLocateFeedbackTimer(): void {
  if (!locateFeedbackTimer)
    return
  clearTimeout(locateFeedbackTimer)
  locateFeedbackTimer = null
}

function attachMessageListener(): void {
  if (messageListenerAttached.value)
    return
  window.addEventListener('message', handleMessage)
  messageListenerAttached.value = true
}

function detachMessageListener(): void {
  if (!messageListenerAttached.value)
    return
  window.removeEventListener('message', handleMessage)
  messageListenerAttached.value = false
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

function requestLegacyRebuild(): void {
  if (props.readonly)
    return
  emit('requestRebuild')
}

function pushLocateFeedback(message: string): void {
  const normalized = String(message || '').trim()
  locateFeedbackMessage.value = normalized
  clearLocateFeedbackTimer()
  if (!normalized)
    return
  locateFeedbackTimer = setTimeout(() => {
    locateFeedbackMessage.value = ''
    locateFeedbackTimer = null
  }, 2200)
}

function locateOutlineItem(node: WorkspaceOutlineNode): boolean {
  const locator = node.locator
  if (locator.surface !== 'workflow')
    return false

  const targetPageId = String(locator.workflowPageId || locator.pageId || '').trim()
  if (targetPageId && currentXml.value) {
    const relocatedXml = moveDrawioPageToFront(currentXml.value, targetPageId)
    if (relocatedXml && relocatedXml !== currentXml.value) {
      currentXml.value = relocatedXml
      if (editorReady.value)
        loadEditorXml(relocatedXml)
    }
  }

  const targetTitle = String(node.label || '').trim() || '目标节点'
  const pageHint = String(node.locator.workflowPageId || node.locator.pageId || '').trim()
  pushLocateFeedback(pageHint ? `已定位：${targetTitle} · ${pageHint}` : `已定位：${targetTitle}`)
  return true
}

function startBootWatchdog(): void {
  clearBootTimeout()
  iframeBooting.value = true
  iframeError.value = ''
  editorReady.value = false
  bootTimeout = setTimeout(() => {
    if (editorReady.value)
      return
    iframeBooting.value = false
    iframeError.value = `draw.io 编辑器初始化超时，请检查当前环境是否可访问 ${drawioOrigin.value}。`
  }, 8000)
}

function stopEditorRuntime(): void {
  clearBootTimeout()
  editorReady.value = false
  iframeBooting.value = false
  iframeError.value = ''
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
  const nextState = resolveDrawioCollabValue(String(nextValue || ''), props.diagramTitle)
  if (nextState.status !== 'ready') {
    currentXml.value = ''
    return
  }

  const nextXml = nextState.xml
  if (!nextXml || nextXml === currentXml.value)
    return

  currentXml.value = nextXml
  if (editorReady.value)
    loadEditorXml(nextXml)
}, { immediate: true })

watch(() => props.diagramTitle, () => {
  if (!editorReady.value || isLegacyUnavailable.value)
    return
  loadEditorXml(currentXml.value)
})

watch(isLegacyUnavailable, async (nextValue) => {
  if (!isMounted.value)
    return

  if (nextValue) {
    detachMessageListener()
    stopEditorRuntime()
    return
  }

  attachMessageListener()
  await nextTick()
  startBootWatchdog()
})

onMounted(() => {
  isMounted.value = true
  if (!isLegacyUnavailable.value) {
    attachMessageListener()
    startBootWatchdog()
  }
})

onBeforeUnmount(() => {
  detachMessageListener()
  clearBootTimeout()
  clearPendingEmitTimer()
  clearLocateFeedbackTimer()
})

defineExpose({
  locateOutlineItem,
})
</script>

<template>
  <div class="bg-slate-100 h-full min-h-0 w-full relative">
    <template v-if="!isLegacyUnavailable">
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

      <div
        v-if="locateFeedbackMessage"
        class="pointer-events-none absolute left-4 top-4 z-10 rounded-2xl border border-sky-200 bg-sky-50/96 px-4 py-2 text-[12px] font-semibold leading-5 text-sky-700 shadow-sm"
      >
        {{ locateFeedbackMessage }}
      </div>
    </template>

    <div v-else class="px-6 py-12 flex h-full items-center justify-center">
      <div class="text-center max-w-3xl">
        <h3 class="text-lg text-slate-900 font-semibold">
          {{ resolvedDrawioDocument.title }}
        </h3>
        <p class="text-[13px] text-slate-600 leading-7 mt-4">
          {{ resolvedDrawioDocument.message }}
        </p>
        <p class="text-[13px] text-slate-600 leading-7 mt-3">
          解决方式：点击下方“重建流程画布”会覆盖当前流程画布并载入新的默认 draw.io 模板；如果你还需要参考旧自由绘制内容，请先记录关键节点、责任角色和分支条件，再手动重建。
        </p>
        <div v-if="!props.readonly" class="mt-6">
          <a-button type="primary" @click="requestLegacyRebuild">
            重建流程画布
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>
