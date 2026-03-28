<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface DrawDocumentSnapshot {
  schema?: unknown
  store?: Record<string, unknown>
}

const props = withDefaults(defineProps<{
  modelValue?: string
  persistenceKey?: string
  readonly?: boolean
}>(), {
  modelValue: '{}',
  persistenceKey: '',
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const mountError = ref('')

let reactRoot: any = null
let tldrawModule: any = null
let editor: any = null
let unlistenStore: (() => void) | null = null
let emitTimer: ReturnType<typeof setTimeout> | null = null
let applyingRemote = false
let lastSerializedModel = ''

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
    mountError.value = '白板状态解析失败，已跳过本次同步。'
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
    mountError.value = '白板状态加载失败，请刷新后重试。'
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
          },
          {
            source: 'user',
            scope: 'document',
          },
        ) || null

        syncReadonlyState()
        applyIncomingModel(props.modelValue)
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
    mountError.value = '白板引擎加载失败，请稍后重试。'
  }
}

watch(() => props.modelValue, (nextValue) => {
  applyIncomingModel(String(nextValue || ''))
})

watch(() => props.readonly, () => {
  syncReadonlyState()
})

onMounted(() => {
  void mountTldrawCanvas()
})

onBeforeUnmount(() => {
  clearEmitTimer()
  unlistenStore?.()
  unlistenStore = null
  editor = null
  reactRoot?.unmount()
  reactRoot = null
})
</script>

<template>
  <div class="relative h-full min-h-0 w-full bg-white">
    <div ref="containerRef" class="h-full min-h-0 w-full" />
    <div v-if="mountError" class="absolute inset-x-4 top-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
      {{ mountError }}
    </div>
  </div>
</template>
