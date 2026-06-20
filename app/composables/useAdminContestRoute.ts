export function fromDatetimeLocal(value: string): string | null {
  const text = value.trim()
  if (!text)
    return null
  const timestamp = new Date(`${text}:00+08:00`).getTime()
  if (Number.isNaN(timestamp))
    return null
  return new Date(timestamp).toISOString()
}

export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value)
    return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return ''
  const local = date.toLocaleString('sv-SE', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
  return local.replace(' ', 'T').slice(0, 16)
}

function readRouteParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key]
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim()
}

export function useAdminContestRoute() {
  const route = useRoute()

  const contestId = computed(() => {
    const params = route.params as Record<string, string | string[] | undefined>
    return readRouteParam(params, 'id')
  })

  const trackId = computed(() => {
    const params = route.params as Record<string, string | string[] | undefined>
    return readRouteParam(params, 'trackId')
  })

  const timelineId = computed(() => {
    const params = route.params as Record<string, string | string[] | undefined>
    return readRouteParam(params, 'timelineId')
  })

  const rubricId = computed(() => {
    const params = route.params as Record<string, string | string[] | undefined>
    return readRouteParam(params, 'rubricId')
  })

  const resourceId = computed(() => {
    const params = route.params as Record<string, string | string[] | undefined>
    return readRouteParam(params, 'resourceId')
  })

  const isEmbedMode = computed(() => {
    const value = route.query.embed
    if (Array.isArray(value))
      return value[0] === '1'
    return value === '1'
  })

  function withEmbed(path: string): string | { path: string, query: { embed: string } } {
    if (isEmbedMode.value)
      return { path, query: { embed: '1' } }
    return path
  }

  return {
    contestId,
    trackId,
    timelineId,
    rubricId,
    resourceId,
    isEmbedMode,
    withEmbed,
  }
}
