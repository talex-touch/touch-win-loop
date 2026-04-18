import { onBeforeUnmount, ref } from 'vue'

export function useTransientHighlightSet(durationMs = 1400) {
  const highlightedIds = ref<string[]>([])
  const highlightTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function clearHighlight(id: string): void {
    const normalizedId = String(id || '').trim()
    if (!normalizedId)
      return

    const currentTimer = highlightTimers.get(normalizedId)
    if (currentTimer) {
      clearTimeout(currentTimer)
      highlightTimers.delete(normalizedId)
    }

    if (!highlightedIds.value.includes(normalizedId))
      return

    highlightedIds.value = highlightedIds.value.filter(item => item !== normalizedId)
  }

  function queueHighlightedIds(ids: string[]): void {
    for (const rawId of ids) {
      const normalizedId = String(rawId || '').trim()
      if (!normalizedId)
        continue

      if (!highlightedIds.value.includes(normalizedId))
        highlightedIds.value = [...highlightedIds.value, normalizedId]

      const currentTimer = highlightTimers.get(normalizedId)
      if (currentTimer)
        clearTimeout(currentTimer)

      highlightTimers.set(normalizedId, setTimeout(() => {
        highlightTimers.delete(normalizedId)
        highlightedIds.value = highlightedIds.value.filter(item => item !== normalizedId)
      }, durationMs))
    }
  }

  function isHighlighted(id: string): boolean {
    const normalizedId = String(id || '').trim()
    if (!normalizedId)
      return false
    return highlightedIds.value.includes(normalizedId)
  }

  onBeforeUnmount(() => {
    for (const timer of highlightTimers.values())
      clearTimeout(timer)
    highlightTimers.clear()
  })

  return {
    highlightedIds,
    clearHighlight,
    queueHighlightedIds,
    isHighlighted,
  }
}
