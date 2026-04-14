import { computed, ref } from 'vue'

export interface DesignHistoryRecordOptions {
  mergeKey?: string
  mergeWindowMs?: number
  timestamp?: number
}

const DEFAULT_HISTORY_MERGE_WINDOW = 300

export function useDesignHistory(initialValue = '') {
  const past = ref<string[]>([])
  const present = ref(String(initialValue || ''))
  const future = ref<string[]>([])
  const lastRecordMeta = ref<{
    mergeKey: string
    recordedAt: number
  } | null>(null)

  function reset(nextValue: string): void {
    past.value = []
    present.value = String(nextValue || '')
    future.value = []
    lastRecordMeta.value = null
  }

  function record(nextValue: string, options: DesignHistoryRecordOptions = {}): void {
    const normalizedValue = String(nextValue || '')
    if (!normalizedValue || normalizedValue === present.value)
      return

    const mergeKey = String(options.mergeKey || '').trim()
    const recordedAt = Number.isFinite(options.timestamp) ? Number(options.timestamp) : Date.now()
    const mergeWindowMs = Number.isFinite(options.mergeWindowMs)
      ? Math.max(0, Number(options.mergeWindowMs))
      : DEFAULT_HISTORY_MERGE_WINDOW
    const shouldMerge = Boolean(
      mergeKey
      && lastRecordMeta.value
      && lastRecordMeta.value.mergeKey === mergeKey
      && recordedAt - lastRecordMeta.value.recordedAt <= mergeWindowMs,
    )

    if (!shouldMerge)
      past.value = [...past.value, present.value]

    present.value = normalizedValue
    future.value = []
    lastRecordMeta.value = mergeKey
      ? { mergeKey, recordedAt }
      : null
  }

  function undo(): string | null {
    if (!past.value.length)
      return null

    const nextPast = [...past.value]
    const previous = nextPast.pop() || ''
    future.value = [present.value, ...future.value]
    past.value = nextPast
    present.value = previous
    lastRecordMeta.value = null
    return previous
  }

  function redo(): string | null {
    if (!future.value.length)
      return null

    const [nextValue, ...nextFuture] = future.value
    past.value = [...past.value, present.value]
    future.value = nextFuture
    present.value = nextValue || ''
    lastRecordMeta.value = null
    return present.value
  }

  return {
    past,
    present,
    future,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    reset,
    record,
    undo,
    redo,
  }
}
