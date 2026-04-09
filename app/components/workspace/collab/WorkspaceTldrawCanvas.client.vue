<script setup lang="ts">
import type { WorkspaceCollabCursorUser } from '~/components/workspace/collab/presence'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveWorkspaceCollabPresenceInitial } from '~/components/workspace/collab/presence'

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
}

const props = withDefaults(defineProps<{
  modelValue?: string
  remoteCursors?: WorkspaceCollabCursorUser[]
  persistenceKey?: string
  readonly?: boolean
}>(), {
  modelValue: '{}',
  remoteCursors: () => [],
  persistenceKey: '',
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'updateCollabCursor': [value: { cursorX?: number, cursorY?: number }]
}>()

const wrapperRef = ref<HTMLDivElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const mountError = ref('')
const remoteScreenCursors = ref<ScreenCursor[]>([])

let reactRoot: any = null
let tldrawModule: any = null
let editor: any = null
let unlistenStore: (() => void) | null = null
let emitTimer: ReturnType<typeof setTimeout> | null = null
let presenceCursorTimer: ReturnType<typeof setTimeout> | null = null
let applyingRemote = false
let lastSerializedModel = ''
let pendingPointerEvent: PointerEvent | null = null

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
    return '{}'

  const snapshot = tldrawModule.getSnapshot(editor.store)
  const documentSnapshot = isRecord(snapshot) && isRecord(snapshot.document)
    ? snapshot.document
    : snapshot
  return JSON.stringify(documentSnapshot || {}, null, 2)
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

function syncRemoteScreenCursors(): void {
  if (!editor || !wrapperRef.value || typeof editor.pageToScreen !== 'function') {
    remoteScreenCursors.value = []
    return
  }

  const wrapperRect = wrapperRef.value.getBoundingClientRect()
  remoteScreenCursors.value = props.remoteCursors.flatMap((cursor) => {
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

function applyIncomingModel(rawValue: string): void {
  if (!editor || !tldrawModule)
    return

  const normalized = String(rawValue || '').trim()
  if (!normalized)
    return
  if (normalized === lastSerializedModel)
    return

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  }
  catch {
    mountError.value = '画布状态解析失败，已跳过本次同步。'
    return
  }

  const snapshot = normalizeSnapshot(parsed)
  if (!snapshot)
    return

  try {
    applyingRemote = true
    tldrawModule.loadSnapshot(editor.store, snapshot)
    lastSerializedModel = serializeEditorSnapshot()
    mountError.value = ''
  }
  catch {
    mountError.value = '画布状态加载失败，请刷新后重试。'
  }
  finally {
    applyingRemote = false
  }
}

async function mountTldrawCanvas(): Promise<void> {
  if (!containerRef.value)
    return

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
        applyIncomingModel(props.modelValue)
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

watch(() => props.modelValue, (nextValue) => {
  applyIncomingModel(String(nextValue || ''))
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
  emit('updateCollabCursor', {})
}

onMounted(() => {
  void mountTldrawCanvas()
})

onBeforeUnmount(() => {
  clearEmitTimer()
  clearPresenceCursorTimer()
  unlistenStore?.()
  unlistenStore = null
  editor = null
  reactRoot?.unmount()
  reactRoot = null
})
</script>

<template>
  <div
    ref="wrapperRef"
    class="bg-white h-full min-h-0 w-full relative"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
    @pointercancel="handlePointerLeave"
  >
    <div ref="containerRef" class="h-full min-h-0 w-full" />
    <div class="pointer-events-none absolute inset-0 overflow-hidden" data-testid="collab-cursor-overlay">
      <div
        v-for="cursor in remoteScreenCursors"
        :key="cursor.userId"
        class="absolute left-0 top-0 will-change-transform"
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
            class="absolute left-4 top-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            :style="{ backgroundColor: cursor.colorToken }"
          >
            {{ resolveWorkspaceCollabPresenceInitial(cursor.username) }}
          </div>
        </div>
      </div>
    </div>
    <div v-if="mountError" class="text-[11px] text-rose-700 px-3 py-2 border border-rose-200 rounded bg-rose-50 inset-x-4 top-3 absolute">
      {{ mountError }}
    </div>
  </div>
</template>
