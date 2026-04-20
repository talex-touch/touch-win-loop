import type {
  AiDefensePersona,
  AiDefenseSessionState,
  AiDefenseStage,
  DefenseRealtimeConnectionState,
  DefenseRealtimeMediaMode,
  DefenseRealtimeNormalizedEvent,
  DefenseRealtimePersonaPack,
  DefenseRealtimeProvider,
  DefenseRealtimeSessionMeta,
} from '~~/shared/types/domain'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export function normalizeDefenseRealtimeProvider(value: unknown): DefenseRealtimeProvider {
  return normalizeString(value).toLowerCase() === 'coze' ? 'coze' : 'qwen'
}

export function normalizeDefenseRealtimeMediaMode(value: unknown): DefenseRealtimeMediaMode {
  return normalizeString(value).toLowerCase() === 'audio' ? 'audio' : 'audio_video'
}

export function normalizeDefenseRealtimeConnectionState(value: unknown): DefenseRealtimeConnectionState {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'bootstrapping')
    return 'bootstrapping'
  if (normalized === 'connecting')
    return 'connecting'
  if (normalized === 'connected')
    return 'connected'
  if (normalized === 'interrupted')
    return 'interrupted'
  if (normalized === 'error')
    return 'error'
  if (normalized === 'closed')
    return 'closed'
  return 'idle'
}

function normalizeDefenseRealtimeBootstrapState(value: unknown): DefenseRealtimeSessionMeta['bootstrapState'] {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'bootstrapping')
    return 'bootstrapping'
  if (normalized === 'ready')
    return 'ready'
  if (normalized === 'error')
    return 'error'
  return normalized === 'idle' ? 'idle' : undefined
}

export function normalizeDefenseRealtimeSessionMeta(
  value: Partial<DefenseRealtimeSessionMeta> | null | undefined,
): DefenseRealtimeSessionMeta {
  return {
    provider: normalizeDefenseRealtimeProvider(value?.provider),
    mediaMode: normalizeDefenseRealtimeMediaMode(value?.mediaMode),
    transport: normalizeString(value?.transport).toLowerCase() === 'rtc_sidecar' ? 'rtc_sidecar' : 'websocket',
    connectionState: normalizeDefenseRealtimeConnectionState(value?.connectionState),
    bootstrapState: normalizeDefenseRealtimeBootstrapState(value?.bootstrapState),
    providerSessionId: normalizeString(value?.providerSessionId) || null,
    conversationId: normalizeString(value?.conversationId) || null,
    linkedMeetingId: normalizeString(value?.linkedMeetingId) || null,
    lastProviderEventAt: normalizeString(value?.lastProviderEventAt) || null,
    latestSpeakerId: normalizeString(value?.latestSpeakerId) || null,
    latestSpeakerLabel: normalizeString(value?.latestSpeakerLabel) || null,
    latestLatencyMs: Number.isFinite(Number(value?.latestLatencyMs)) ? Math.max(0, Number(value?.latestLatencyMs)) : null,
    audioEnabled: value?.audioEnabled,
    videoEnabled: value?.videoEnabled,
    lastError: normalizeString(value?.lastError) || null,
    metadata: value?.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata)
      ? value.metadata
      : {},
  }
}

export function mergeDefenseRealtimeSessionMeta(
  current: DefenseRealtimeSessionMeta | null | undefined,
  patch: Partial<DefenseRealtimeSessionMeta>,
): DefenseRealtimeSessionMeta {
  const base = normalizeDefenseRealtimeSessionMeta(current)
  return normalizeDefenseRealtimeSessionMeta({
    ...base,
    ...patch,
    metadata: {
      ...(base.metadata || {}),
      ...((patch.metadata && typeof patch.metadata === 'object' && !Array.isArray(patch.metadata)) ? patch.metadata : {}),
    },
  })
}

export function buildDefenseRealtimePersonaPack(input: {
  sessionId: string
  projectId: string
  contestName?: string
  trackName?: string
  state?: AiDefenseSessionState | null
  personas: AiDefensePersona[]
}): DefenseRealtimePersonaPack {
  const stage = input.state?.currentStage || 'opening'
  const turnCount = Math.max(0, Number(input.state?.turnCount || 0))
  const selectedPersonaIds = input.state?.selectedPersonaIds?.length
    ? input.state.selectedPersonaIds
    : input.personas.filter(item => item.enabled).map(item => item.id)

  return {
    sessionId: input.sessionId,
    projectId: input.projectId,
    contestName: normalizeString(input.contestName),
    trackName: normalizeString(input.trackName),
    stage,
    turnCount,
    selectedPersonaIds,
    judges: input.personas.map(persona => ({
      id: persona.id,
      name: persona.name,
      judgeType: persona.judgeType,
      enabled: persona.enabled,
      summary: persona.summary,
      focusAreas: persona.focusAreas,
    })),
  }
}

export function resolveDefenseRealtimeStage(
  currentStage: AiDefenseStage | undefined,
  turnCount: number,
): AiDefenseStage {
  if (currentStage)
    return currentStage
  if (turnCount <= 0)
    return 'opening'
  if (turnCount <= 2)
    return 'qa'
  if (turnCount <= 4)
    return 'rebuttal'
  return 'closing'
}

export function buildDefenseRealtimeEventKey(event: DefenseRealtimeNormalizedEvent): string {
  const eventId = normalizeString(event.eventId)
  if (eventId)
    return eventId
  return [
    normalizeString(event.provider),
    normalizeString(event.sessionId),
    normalizeString(event.type),
    normalizeString(event.speakerId || event.speakerLabel),
    Number.isFinite(Number(event.turnIndex)) ? String(event.turnIndex) : '',
    normalizeString(event.createdAt),
    normalizeString(event.text),
  ].join('::')
}
