<script setup lang="ts">
import type { WorkspaceCollabCursorUser } from '~/components/workspace/collab/presence'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  parseSceneDocumentString,
  sceneDocumentHasStructuredPreview,
  serializeSceneDocument,
  withRuntimeSnapshot,
} from '~~/shared/utils/scene-document'
import { resolveWorkspaceCollabPresenceInitial } from '~/components/workspace/collab/presence'
import WorkspaceScenePreview from '~/components/workspace/collab/WorkspaceScenePreview.vue'

interface DrawDocumentSnapshot {
  schema?: unknown
  store?: Record<string, unknown>
}

interface ScreenCursor {
  userId: string
  username: string
  colorToken: string
  screenX: number
  screenY: number
  label: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  remoteCursors?: WorkspaceCollabCursorUser[]
  persistenceKey?: string
  readonly?: boolean
  revision?: number
  warningText?: string
  errorText?: string
}>(), {
  modelValue: '{}',
  remoteCursors: () => [],
  persistenceKey: '',
  readonly: false,
  revision: 0,
  warningText: '',
  errorText: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'updateCollabCursor': [value: { cursorX?: number, cursorY?: number }]
}>()

const wrapperRef = ref<HTMLDivElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const mountError = ref('')
const remoteScreenCursorSeeds = ref<Omit<ScreenCursor, 'label'>[]>([])
const localPointerScreen = ref<{ x: number, y: number } | null>(null)
const scenePreviewDocument = ref<ReturnType<typeof parseSceneDocumentString> | null>(null)
const currentSceneDocument = ref(parseSceneDocumentString(props.modelValue))
const runtime = useRuntimeConfig()
const tldrawLicenseKey = computed(() => String(runtime.public?.tldraw?.licenseKey || '').trim())

const CURSOR_LABEL_COLLAPSE_DISTANCE = 72

let reactRoot: any = null
let tldrawModule: any = null
let editor: any = null
let unlistenStore: (() => void) | null = null
let emitTimer: ReturnType<typeof setTimeout> | null = null
let presenceCursorTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let viewportSyncFrame: number | null = null
let removeViewportListeners: (() => void) | null = null
let applyingRemote = false
let hasBootstrappedIncomingModel = false
let lastAppliedIncomingRevision = -1
let lastSerializedModel = ''
let pendingPointerEvent: PointerEvent | null = null

function isLocalTldrawHostname(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]'
}

function requiresTldrawLicense(): boolean {
  if (!import.meta.client || !import.meta.env.PROD)
    return false

  return window.location.protocol === 'https:' && !isLocalTldrawHostname(window.location.hostname)
}

function resolveScenePreview(rawValue: string): ReturnType<typeof parseSceneDocumentString> | null {
  const sceneDocument = parseSceneDocumentString(rawValue, {
    fallbackDrawMode: 'freeform',
    fallbackSourceType: 'manual',
  })
  currentSceneDocument.value = sceneDocument
  return !normalizeSnapshot(sceneDocument.runtimeSnapshot) && sceneDocumentHasStructuredPreview(sceneDocument)
    ? sceneDocument
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeSnapshot(raw: unknown): DrawDocumentSnapshot | null {
  if (isRecord(raw)) {
    const documentPart = raw.document
    if (isRecord(documentPart) && isRecord(documentPart.store))
      return documentPart as DrawDocumentSnapshot
    if (isRecord(raw.store))
      return raw as DrawDocumentSnapshot
  }

  if (Array.isArray(raw)) {
    const store: Record<string, unknown> = {}
    for (const item of raw) {
      if (!isRecord(item))
        continue
      const id = String(item.id || '').trim()
      if (!id)
        continue
      store[id] = item
    }

    if (Object.keys(store).length === 0)
      return null

    return { store }
  }

  return null
}

function serializeEditorSnapshot(): string {
  if (!editor || !tldrawModule)
    return serializeSceneDocument(currentSceneDocument.value)

  const snapshot = tldrawModule.getSnapshot(editor.store)
  const documentSnapshot = isRecord(snapshot) && isRecord(snapshot.document)
    ? snapshot.document
    : snapshot
  return serializeSceneDocument(withRuntimeSnapshot(currentSceneDocument.value, documentSnapshot || {}))
}

function clearEmitTimer(): void {
  if (!emitTimer)
    return
  clearTimeout(emitTimer)
  emitTimer = null
}

function clearPresenceCursorTimer(): void {
  if (!presenceCursorTimer)
    return
  clearTimeout(presenceCursorTimer)
  presenceCursorTimer = null
}

function clearViewportSyncFrame(): void {
  if (viewportSyncFrame === null || !import.meta.client)
    return
  cancelAnimationFrame(viewportSyncFrame)
  viewportSyncFrame = null
}

function isScreenPointNear(
  left: { x: number, y: number },
  right: { x: number, y: number },
  threshold = CURSOR_LABEL_COLLAPSE_DISTANCE,
): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= threshold
}

const remoteScreenCursors = computed<ScreenCursor[]>(() => {
  return remoteScreenCursorSeeds.value.map((cursor, index, cursors) => {
    const cursorPoint = { x: cursor.screenX, y: cursor.screenY }
    const isNearLocalPointer = Boolean(
      localPointerScreen.value
      && isScreenPointNear(cursorPoint, localPointerScreen.value),
    )
    const isNearAnotherCursor = cursors.some((candidate, candidateIndex) => {
      if (candidateIndex === index)
        return false
      return isScreenPointNear(cursorPoint, {
        x: candidate.screenX,
        y: candidate.screenY,
      })
    })

    return {
      ...cursor,
      label: isNearLocalPointer || isNearAnotherCursor
        ? resolveWorkspaceCollabPresenceInitial(cursor.username)
        : cursor.username,
    }
  })
})

function syncViewportScreenBounds(center = false): void {
  if (!editor || !wrapperRef.value || typeof editor.updateViewportScreenBounds !== 'function')
    return

  try {
    editor.updateViewportScreenBounds(wrapperRef.value, center)
    syncRemoteScreenCursors()
  }
  catch {
    // 忽略 reflow 抖动阶段的视口同步异常，保持当前编辑器实例继续可用。
  }
}

function scheduleViewportScreenBoundsSync(center = false): void {
  if (!import.meta.client)
    return

  clearViewportSyncFrame()
  viewportSyncFrame = window.requestAnimationFrame(() => {
    viewportSyncFrame = null
    syncViewportScreenBounds(center)
  })
}

function bindViewportObservers(): void {
  if (!import.meta.client || !wrapperRef.value)
    return

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      scheduleViewportScreenBoundsSync()
    })
    resizeObserver.observe(wrapperRef.value)
  }

  const handleWindowResize = () => {
    scheduleViewportScreenBoundsSync()
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible')
      scheduleViewportScreenBoundsSync()
  }

  window.addEventListener('resize', handleWindowResize)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  removeViewportListeners = () => {
    window.removeEventListener('resize', handleWindowResize)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    removeViewportListeners = null
  }
}

function syncRemoteScreenCursors(): void {
  if (scenePreviewDocument.value || !editor || !wrapperRef.value || typeof editor.pageToScreen !== 'function') {
    remoteScreenCursorSeeds.value = []
    return
  }

  const wrapperRect = wrapperRef.value.getBoundingClientRect()
  remoteScreenCursorSeeds.value = props.remoteCursors.flatMap((cursor) => {
    try {
      const screenPoint = editor.pageToScreen({
        x: cursor.cursorX,
        y: cursor.cursorY,
      })
      const screenX = Number(screenPoint?.x) - wrapperRect.left
      const screenY = Number(screenPoint?.y) - wrapperRect.top
      if (!Number.isFinite(screenX) || !Number.isFinite(screenY))
        return []

      return [{
        userId: cursor.userId,
        username: cursor.username,
        colorToken: cursor.colorToken,
        screenX,
        screenY,
      }]
    }
    catch {
      return []
    }
  })
}

function flushPresenceCursor(): void {
  clearPresenceCursorTimer()

  if (!pendingPointerEvent || !editor || typeof editor.screenToPage !== 'function') {
    emit('updateCollabCursor', {})
    pendingPointerEvent = null
    return
  }

  try {
    const pagePoint = editor.screenToPage({
      x: pendingPointerEvent.clientX,
      y: pendingPointerEvent.clientY,
    })
    emit('updateCollabCursor', {
      cursorX: Number(pagePoint?.x),
      cursorY: Number(pagePoint?.y),
    })
  }
  catch {
    emit('updateCollabCursor', {})
  }
  finally {
    pendingPointerEvent = null
  }
}

function schedulePresenceCursor(pointerEvent: PointerEvent): void {
  pendingPointerEvent = pointerEvent
  if (wrapperRef.value) {
    const wrapperRect = wrapperRef.value.getBoundingClientRect()
    localPointerScreen.value = {
      x: pointerEvent.clientX - wrapperRect.left,
      y: pointerEvent.clientY - wrapperRect.top,
    }
  }
  if (presenceCursorTimer)
    return

  presenceCursorTimer = setTimeout(() => {
    flushPresenceCursor()
  }, 50)
}

function emitModelFromEditor(): void {
  clearEmitTimer()
  if (!editor || !tldrawModule)
    return
  if (applyingRemote)
    return

  const serialized = serializeEditorSnapshot()
  if (!serialized || serialized === lastSerializedModel)
    return

  lastSerializedModel = serialized
  emit('update:modelValue', serialized)
}

function scheduleEmitModelFromEditor(): void {
  if (emitTimer)
    return

  emitTimer = setTimeout(() => {
    emitModelFromEditor()
  }, 120)
}

function syncReadonlyState(): void {
  if (!editor || !editor.updateInstanceState)
    return

  editor.updateInstanceState({
    isReadonly: Boolean(props.readonly),
  })
}

function applyIncomingModel(rawValue: string, options: { force?: boolean } = {}): void {
  const normalized = String(rawValue || '').trim()
  const previewDocument = resolveScenePreview(normalized)
  scenePreviewDocument.value = previewDocument

  if (previewDocument) {
    mountError.value = ''
    lastSerializedModel = serializeSceneDocument(previewDocument)
    hasBootstrappedIncomingModel = true
    syncRemoteScreenCursors()
    return
  }

  if (!editor || !tldrawModule)
    return

  const incomingRevision = Math.max(0, Number(props.revision || 0))
  if (!normalized) {
    hasBootstrappedIncomingModel = true
    mountError.value = ''
    return
  }

  if (!options.force) {
    if (normalized === lastSerializedModel)
      return
    if (hasBootstrappedIncomingModel && incomingRevision <= lastAppliedIncomingRevision)
      return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  }
  catch {
    mountError.value = '画布状态解析失败，已跳过本次同步。'
    return
  }

  const sceneDocument = parseSceneDocumentString(normalized, {
    fallbackDrawMode: 'freeform',
    fallbackSourceType: 'manual',
  })
  currentSceneDocument.value = sceneDocument
  const snapshot = normalizeSnapshot(sceneDocument.runtimeSnapshot ?? parsed)
  if (!snapshot) {
    hasBootstrappedIncomingModel = true
    mountError.value = ''
    return
  }

  try {
    applyingRemote = true
    tldrawModule.loadSnapshot(editor.store, snapshot)
    lastSerializedModel = serializeEditorSnapshot()
    lastAppliedIncomingRevision = incomingRevision
    hasBootstrappedIncomingModel = true
    mountError.value = ''
    scheduleViewportScreenBoundsSync()
  }
  catch {
    mountError.value = '画布状态加载失败，已忽略本次远端同步。'
  }
  finally {
    applyingRemote = false
  }
}

function teardownTldrawCanvas(): void {
  clearEmitTimer()
  unlistenStore?.()
  unlistenStore = null
  editor = null
  reactRoot?.unmount()
  reactRoot = null
}

async function mountTldrawCanvas(): Promise<void> {
  if (!containerRef.value || reactRoot || scenePreviewDocument.value)
    return

  if (requiresTldrawLicense() && !tldrawLicenseKey.value) {
    mountError.value = '当前部署缺少 tldraw licenseKey，请配置 WINLOOP_TLDRAW_LICENSE_KEY。'
    return
  }

  try {
    const react = await import('react')
    const reactDomClient = await import('react-dom/client')
    const tldraw = await import('tldraw')
    await import('tldraw/tldraw.css')

    tldrawModule = {
      Tldraw: tldraw.Tldraw,
      getSnapshot: tldraw.getSnapshot,
      loadSnapshot: tldraw.loadSnapshot,
    }

    reactRoot = reactDomClient.createRoot(containerRef.value)
    const reactElement = react.createElement(tldrawModule.Tldraw as never, {
      persistenceKey: String(props.persistenceKey || '').trim() || undefined,
      licenseKey: tldrawLicenseKey.value || undefined,
      inferDarkMode: false,
      onMount: (mountedEditor: any) => {
        editor = mountedEditor
        unlistenStore = editor?.store?.listen(
          () => {
            scheduleEmitModelFromEditor()
            syncRemoteScreenCursors()
          },
        ) || null

        syncReadonlyState()
        scheduleViewportScreenBoundsSync(true)
        applyIncomingModel(props.modelValue, { force: true })
        syncRemoteScreenCursors()
        if (!lastSerializedModel)
          emitModelFromEditor()

        return () => {
          unlistenStore?.()
          unlistenStore = null
          editor = null
        }
      },
    })

    reactRoot.render(reactElement)
  }
  catch {
    mountError.value = '画布引擎加载失败，请稍后重试。'
  }
}

async function syncIncomingModel(rawValue: string): Promise<void> {
  const previewDocument = resolveScenePreview(rawValue)
  if (previewDocument) {
    scenePreviewDocument.value = previewDocument
    teardownTldrawCanvas()
    mountError.value = ''
    lastSerializedModel = serializeSceneDocument(previewDocument)
    syncRemoteScreenCursors()
    return
  }

  if (scenePreviewDocument.value) {
    scenePreviewDocument.value = null
    await nextTick()
  }

  if (!reactRoot) {
    await nextTick()
    await mountTldrawCanvas()
  }

  applyIncomingModel(rawValue)
}

watch([() => props.modelValue, () => props.revision], ([nextValue]) => {
  void syncIncomingModel(String(nextValue || ''))
})

watch(() => props.remoteCursors, () => {
  syncRemoteScreenCursors()
}, { deep: true })

watch(() => props.readonly, () => {
  syncReadonlyState()
})

function handlePointerMove(event: PointerEvent): void {
  schedulePresenceCursor(event)
}

function handlePointerLeave(): void {
  clearPresenceCursorTimer()
  pendingPointerEvent = null
  localPointerScreen.value = null
  emit('updateCollabCursor', {})
}

onMounted(() => {
  bindViewportObservers()
  void syncIncomingModel(String(props.modelValue || ''))
})

onBeforeUnmount(() => {
  clearEmitTimer()
  clearPresenceCursorTimer()
  clearViewportSyncFrame()
  resizeObserver?.disconnect()
  resizeObserver = null
  removeViewportListeners?.()
  teardownTldrawCanvas()
})
</script>

<template>
  <div
    ref="wrapperRef"
    class="bg-white h-full min-h-0 w-full relative"
    data-collab-canvas-root
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
    @pointercancel="handlePointerLeave"
  >
    <WorkspaceScenePreview
      v-if="scenePreviewDocument"
      :scene-document="scenePreviewDocument"
    />
    <div v-else ref="containerRef" class="h-full min-h-0 w-full" />

    <div class="pointer-events-none inset-0 absolute overflow-hidden" data-testid="collab-cursor-overlay">
      <div
        v-for="cursor in remoteScreenCursors"
        :key="cursor.userId"
        class="will-change-transform left-0 top-0 absolute"
        :style="{ transform: `translate(${cursor.screenX}px, ${cursor.screenY}px)` }"
      >
        <div class="relative">
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2 1.5L2.2 17.2L6.9 13.6L10.3 20.3L12.8 19.1L9.4 12.4L15.2 12.1L2 1.5Z"
              :fill="cursor.colorToken"
              stroke="white"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
          <div
            class="text-[10px] text-white font-semibold px-2 py-0.5 rounded-full max-w-40 truncate shadow-sm left-4 top-1 absolute"
            :style="{ backgroundColor: cursor.colorToken }"
            :title="cursor.username"
          >
            {{ cursor.label }}
          </div>
        </div>
      </div>
    </div>

    <div class="pointer-events-none inset-0 absolute z-30">
      <div v-if="warningText" class="left-3 top-3 absolute">
        <div class="text-[11px] text-amber-700 px-3 py-1.5 border border-amber-200 rounded-full bg-amber-50 shadow-sm">
          {{ warningText }}
        </div>
      </div>
      <div v-if="errorText || mountError" class="left-3 top-14 absolute space-y-2">
        <div v-if="errorText" class="text-[11px] text-rose-700 px-3 py-2 border border-rose-200 rounded-xl bg-rose-50 max-w-sm shadow-sm">
          {{ errorText }}
        </div>
        <div v-if="mountError" class="text-[11px] text-rose-700 px-3 py-2 border border-rose-200 rounded-xl bg-rose-50 max-w-sm shadow-sm">
          {{ mountError }}
        </div>
      </div>
    </div>
  </div>
</template>
