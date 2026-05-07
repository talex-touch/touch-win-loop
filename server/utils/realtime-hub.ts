import type { AuthUser } from '~~/shared/types/domain'

export interface RealtimePeerPresence {
  peerId: string
  userId: string
  username: string
  cursorX?: number
  cursorY?: number
  awarenessClientId?: number
  awarenessUpdateBase64?: string
  activityState: 'active' | 'background'
  updatedAt: string
}

interface RealtimeRemotePresenceSnapshot {
  members: RealtimePeerPresence[]
  updatedAtMs: number
}

interface RealtimePeerRecord {
  peer: any
  user: AuthUser
  authKind: 'member' | 'meeting_guest'
  guestShareId?: string
  guestMeetingId?: string
  workspaces: Set<string>
  projects: Set<string>
  meetings: Set<string>
  rooms: Set<string>
  lastSeenAt: number
}

interface RealtimeHubState {
  peers: Map<string, RealtimePeerRecord>
  workspaceSubs: Map<string, Set<string>>
  projectSubs: Map<string, Set<string>>
  meetingSubs: Map<string, Set<string>>
  roomSubs: Map<string, Set<string>>
  roomPresence: Map<string, Map<string, RealtimePeerPresence>>
  remoteRoomPresence: Map<string, Map<string, RealtimeRemotePresenceSnapshot>>
  seenEvents: Map<string, number>
}

const REALTIME_HUB_STATE_KEY = Symbol.for('winloop.realtime.hub.state.v1')
const SEEN_EVENT_TTL_MS = 3 * 60 * 1000
const REMOTE_ROOM_PRESENCE_TTL_MS = 2 * 60 * 1000

function getHubState(): RealtimeHubState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[REALTIME_HUB_STATE_KEY] as RealtimeHubState | undefined
  if (existing)
    return existing

  const created: RealtimeHubState = {
    peers: new Map<string, RealtimePeerRecord>(),
    workspaceSubs: new Map<string, Set<string>>(),
    projectSubs: new Map<string, Set<string>>(),
    meetingSubs: new Map<string, Set<string>>(),
    roomSubs: new Map<string, Set<string>>(),
    roomPresence: new Map<string, Map<string, RealtimePeerPresence>>(),
    remoteRoomPresence: new Map<string, Map<string, RealtimeRemotePresenceSnapshot>>(),
    seenEvents: new Map<string, number>(),
  }
  globalRef[REALTIME_HUB_STATE_KEY] = created
  return created
}

function cleanupSeenEvents(state: RealtimeHubState): void {
  const now = Date.now()
  for (const [eventId, expiresAt] of state.seenEvents) {
    if (expiresAt <= now)
      state.seenEvents.delete(eventId)
  }
}

function resolvePeerId(peer: any): string {
  const id = String(peer?.id || '').trim()
  if (!id)
    return ''
  return id
}

function addPeerToIndex(index: Map<string, Set<string>>, key: string, peerId: string): void {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey)
    return
  const current = index.get(normalizedKey)
  if (current) {
    current.add(peerId)
    return
  }
  index.set(normalizedKey, new Set([peerId]))
}

function removePeerFromIndex(index: Map<string, Set<string>>, key: string, peerId: string): void {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey)
    return
  const current = index.get(normalizedKey)
  if (!current)
    return
  current.delete(peerId)
  if (current.size === 0)
    index.delete(normalizedKey)
}

function safeSendJson(peer: any, payload: Record<string, unknown>): void {
  try {
    const result = peer?.send?.(JSON.stringify(payload))
    if (result && typeof result.then === 'function')
      void result.catch(() => undefined)
  }
  catch {
    // ignore socket send errors
  }
}

function sanitizeGuestMeetingPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const type = String(payload.type || '').trim()
  const rawPayload = payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
    ? payload.payload as Record<string, unknown>
    : {}
  const meetingId = String(rawPayload.meetingId || '').trim()
  const basePayload: Record<string, unknown> = {
    type,
    payload: meetingId ? { meetingId } : {},
  }

  if (type === 'meeting.caption.partial' || type === 'meeting.caption.final') {
    const speakerLabel = String(rawPayload.guestSpeakerLabel || rawPayload.speakerLabel || '发言人').trim() || '发言人'
    basePayload.payload = {
      meetingId,
      speakerName: speakerLabel,
      speakerLabel,
      text: String(rawPayload.text || '').trim(),
      startedAtMs: Number.isFinite(Number(rawPayload.startedAtMs)) ? Number(rawPayload.startedAtMs) : 0,
      endedAtMs: Number.isFinite(Number(rawPayload.endedAtMs)) ? Number(rawPayload.endedAtMs) : 0,
      confidence: Number.isFinite(Number(rawPayload.confidence)) ? Number(rawPayload.confidence) : 0,
      utteranceId: String(rawPayload.utteranceId || '').trim() || undefined,
      eventId: String(rawPayload.eventId || '').trim() || undefined,
      final: type === 'meeting.caption.final',
    }
  }

  return basePayload
}

function buildPresence(
  peerId: string,
  user: AuthUser,
  cursorX?: number,
  cursorY?: number,
  activityState: 'active' | 'background' = 'active',
  awarenessClientId?: number,
  awarenessUpdateBase64?: string,
): RealtimePeerPresence {
  return {
    peerId,
    userId: String(user.id || ''),
    username: String(user.username || ''),
    cursorX: Number.isFinite(Number(cursorX)) ? Number(cursorX) : undefined,
    cursorY: Number.isFinite(Number(cursorY)) ? Number(cursorY) : undefined,
    awarenessClientId: Number.isInteger(Number(awarenessClientId)) ? Math.trunc(Number(awarenessClientId)) : undefined,
    awarenessUpdateBase64: String(awarenessUpdateBase64 || '').trim() || undefined,
    activityState,
    updatedAt: new Date().toISOString(),
  }
}

function removePeerPresenceFromRoom(state: RealtimeHubState, roomKey: string, peerId: string): void {
  const roomPresence = state.roomPresence.get(roomKey)
  if (!roomPresence)
    return
  roomPresence.delete(peerId)
  if (roomPresence.size === 0)
    state.roomPresence.delete(roomKey)
}

function normalizePeerPresence(rawMember: unknown): RealtimePeerPresence | null {
  if (!rawMember || typeof rawMember !== 'object' || Array.isArray(rawMember))
    return null

  const member = rawMember as Record<string, unknown>
  const peerId = String(member.peerId || '').trim()
  const userId = String(member.userId || '').trim()
  const username = String(member.username || '').trim()
  if (!peerId)
    return null

  const cursorX = Number(member.cursorX)
  const cursorY = Number(member.cursorY)
  const awarenessClientId = Number(member.awarenessClientId)
  const updatedAt = String(member.updatedAt || '').trim() || new Date().toISOString()
  const activityState = String(member.activityState || '').trim().toLowerCase() === 'background'
    ? 'background'
    : 'active'
  return {
    peerId,
    userId,
    username,
    cursorX: Number.isFinite(cursorX) ? cursorX : undefined,
    cursorY: Number.isFinite(cursorY) ? cursorY : undefined,
    awarenessClientId: Number.isInteger(awarenessClientId) ? Math.trunc(awarenessClientId) : undefined,
    awarenessUpdateBase64: String(member.awarenessUpdateBase64 || '').trim() || undefined,
    activityState,
    updatedAt,
  }
}

function pruneRemoteRoomPresence(state: RealtimeHubState, roomKey: string): void {
  const snapshots = state.remoteRoomPresence.get(roomKey)
  if (!snapshots)
    return

  const now = Date.now()
  for (const [instanceId, snapshot] of snapshots) {
    if (snapshot.updatedAtMs + REMOTE_ROOM_PRESENCE_TTL_MS < now)
      snapshots.delete(instanceId)
  }

  if (snapshots.size === 0)
    state.remoteRoomPresence.delete(roomKey)
}

function getMergedRoomPresence(roomKey: string): RealtimePeerPresence[] {
  const state = getHubState()
  const normalizedRoomKey = String(roomKey || '').trim()
  if (!normalizedRoomKey)
    return []

  pruneRemoteRoomPresence(state, normalizedRoomKey)

  const merged = new Map<string, RealtimePeerPresence>()
  const local = state.roomPresence.get(normalizedRoomKey)
  if (local) {
    for (const [peerId, member] of local)
      merged.set(peerId, member)
  }

  const snapshots = state.remoteRoomPresence.get(normalizedRoomKey)
  if (!snapshots)
    return [...merged.values()]

  for (const [instanceId, snapshot] of snapshots) {
    for (const rawMember of snapshot.members) {
      const member = normalizePeerPresence(rawMember)
      if (!member)
        continue
      const dedupeKey = `${instanceId}:${member.peerId}`
      merged.set(dedupeKey, member)
    }
  }

  return [...merged.values()]
}

export function buildCollabRoomKey(projectId: string, resourceId: string): string {
  return `${String(projectId || '').trim()}:${String(resourceId || '').trim()}`
}

export function registerRealtimePeer(
  peer: any,
  user: AuthUser,
  options: {
    authKind?: 'member' | 'meeting_guest'
    guestShareId?: string
    guestMeetingId?: string
  } = {},
): string {
  const peerId = resolvePeerId(peer)
  if (!peerId)
    return ''

  const state = getHubState()
  state.peers.set(peerId, {
    peer,
    user,
    authKind: options.authKind === 'meeting_guest' ? 'meeting_guest' : 'member',
    guestShareId: String(options.guestShareId || '').trim() || undefined,
    guestMeetingId: String(options.guestMeetingId || '').trim() || undefined,
    workspaces: new Set<string>(),
    projects: new Set<string>(),
    meetings: new Set<string>(),
    rooms: new Set<string>(),
    lastSeenAt: Date.now(),
  })
  return peerId
}

export function touchRealtimePeer(peerId: string): void {
  const state = getHubState()
  const record = state.peers.get(String(peerId || '').trim())
  if (!record)
    return
  record.lastSeenAt = Date.now()
}

export function removeRealtimePeer(peer: any): string[] {
  const peerId = resolvePeerId(peer)
  if (!peerId)
    return []

  const state = getHubState()
  const record = state.peers.get(peerId)
  if (!record)
    return []

  const affectedRooms = [...record.rooms]
  state.peers.delete(peerId)

  for (const workspaceId of record.workspaces)
    removePeerFromIndex(state.workspaceSubs, workspaceId, peerId)
  for (const projectId of record.projects)
    removePeerFromIndex(state.projectSubs, projectId, peerId)
  for (const meetingId of record.meetings)
    removePeerFromIndex(state.meetingSubs, meetingId, peerId)
  for (const roomKey of record.rooms) {
    removePeerFromIndex(state.roomSubs, roomKey, peerId)
    removePeerPresenceFromRoom(state, roomKey, peerId)
    broadcastRoomPresence(roomKey)
  }

  return affectedRooms
}

export function subscribeRealtimeWorkspace(peerId: string, workspaceId: string): void {
  const state = getHubState()
  const normalizedPeerId = String(peerId || '').trim()
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  const record = state.peers.get(normalizedPeerId)
  if (!record || !normalizedWorkspaceId)
    return

  record.workspaces.add(normalizedWorkspaceId)
  addPeerToIndex(state.workspaceSubs, normalizedWorkspaceId, normalizedPeerId)
  touchRealtimePeer(normalizedPeerId)
}

export function subscribeRealtimeProject(peerId: string, projectId: string): void {
  const state = getHubState()
  const normalizedPeerId = String(peerId || '').trim()
  const normalizedProjectId = String(projectId || '').trim()
  const record = state.peers.get(normalizedPeerId)
  if (!record || !normalizedProjectId)
    return

  record.projects.add(normalizedProjectId)
  addPeerToIndex(state.projectSubs, normalizedProjectId, normalizedPeerId)
  touchRealtimePeer(normalizedPeerId)
}

export function subscribeRealtimeMeeting(peerId: string, meetingId: string): void {
  const state = getHubState()
  const normalizedPeerId = String(peerId || '').trim()
  const normalizedMeetingId = String(meetingId || '').trim()
  const record = state.peers.get(normalizedPeerId)
  if (!record || !normalizedMeetingId)
    return

  record.meetings.add(normalizedMeetingId)
  addPeerToIndex(state.meetingSubs, normalizedMeetingId, normalizedPeerId)
  touchRealtimePeer(normalizedPeerId)
}

export function joinRealtimeCollabRoom(
  peerId: string,
  roomKey: string,
): RealtimePeerPresence[] {
  const state = getHubState()
  const normalizedPeerId = String(peerId || '').trim()
  const normalizedRoomKey = String(roomKey || '').trim()
  const record = state.peers.get(normalizedPeerId)
  if (!record || !normalizedRoomKey)
    return []

  record.rooms.add(normalizedRoomKey)
  addPeerToIndex(state.roomSubs, normalizedRoomKey, normalizedPeerId)
  touchRealtimePeer(normalizedPeerId)

  let roomPresence = state.roomPresence.get(normalizedRoomKey)
  if (!roomPresence) {
    roomPresence = new Map<string, RealtimePeerPresence>()
    state.roomPresence.set(normalizedRoomKey, roomPresence)
  }

  roomPresence.set(normalizedPeerId, buildPresence(normalizedPeerId, record.user))
  const currentPresence = [...roomPresence.values()]
  broadcastRoomPresence(normalizedRoomKey)
  return currentPresence
}

export function leaveRealtimeCollabRoom(peerId: string, roomKey: string): void {
  const state = getHubState()
  const normalizedPeerId = String(peerId || '').trim()
  const normalizedRoomKey = String(roomKey || '').trim()
  const record = state.peers.get(normalizedPeerId)
  if (!record || !normalizedRoomKey)
    return

  record.rooms.delete(normalizedRoomKey)
  removePeerFromIndex(state.roomSubs, normalizedRoomKey, normalizedPeerId)
  removePeerPresenceFromRoom(state, normalizedRoomKey, normalizedPeerId)
  touchRealtimePeer(normalizedPeerId)
  broadcastRoomPresence(normalizedRoomKey)
}

export function updateRealtimePresence(
  peerId: string,
  roomKey: string,
  cursorX?: number,
  cursorY?: number,
  activityState?: 'active' | 'background',
  awarenessClientId?: number,
  awarenessUpdateBase64?: string,
): void {
  const state = getHubState()
  const normalizedPeerId = String(peerId || '').trim()
  const normalizedRoomKey = String(roomKey || '').trim()
  const record = state.peers.get(normalizedPeerId)
  if (!record || !normalizedRoomKey)
    return

  let roomPresence = state.roomPresence.get(normalizedRoomKey)
  if (!roomPresence) {
    roomPresence = new Map<string, RealtimePeerPresence>()
    state.roomPresence.set(normalizedRoomKey, roomPresence)
  }

  const currentPresence = roomPresence.get(normalizedPeerId)
  roomPresence.set(normalizedPeerId, buildPresence(
    normalizedPeerId,
    record.user,
    cursorX,
    cursorY,
    activityState || currentPresence?.activityState || 'active',
    awarenessClientId || currentPresence?.awarenessClientId,
    awarenessUpdateBase64 || currentPresence?.awarenessUpdateBase64,
  ))
  touchRealtimePeer(normalizedPeerId)
  broadcastRoomPresence(normalizedRoomKey)
}

function getPeersByIds(peerIds: Set<string>): RealtimePeerRecord[] {
  const state = getHubState()
  const records: RealtimePeerRecord[] = []
  for (const peerId of peerIds) {
    const record = state.peers.get(peerId)
    if (record)
      records.push(record)
  }
  return records
}

export function broadcastRealtimeWorkspaceEvent(
  workspaceId: string,
  payload: Record<string, unknown>,
  excludePeerId = '',
): void {
  const state = getHubState()
  const subscribers = state.workspaceSubs.get(String(workspaceId || '').trim())
  if (!subscribers || subscribers.size === 0)
    return

  const excluded = String(excludePeerId || '').trim()
  for (const record of getPeersByIds(subscribers)) {
    if (excluded && resolvePeerId(record.peer) === excluded)
      continue
    safeSendJson(record.peer, payload)
  }
}

export function broadcastRealtimeProjectEvent(
  projectId: string,
  payload: Record<string, unknown>,
  excludePeerId = '',
): void {
  const state = getHubState()
  const subscribers = state.projectSubs.get(String(projectId || '').trim())
  if (!subscribers || subscribers.size === 0)
    return

  const excluded = String(excludePeerId || '').trim()
  for (const record of getPeersByIds(subscribers)) {
    if (excluded && resolvePeerId(record.peer) === excluded)
      continue
    safeSendJson(record.peer, payload)
  }
}

export function broadcastRealtimeMeetingEvent(
  meetingId: string,
  payload: Record<string, unknown>,
  excludePeerId = '',
): void {
  const state = getHubState()
  const subscribers = state.meetingSubs.get(String(meetingId || '').trim())
  if (!subscribers || subscribers.size === 0)
    return

  const excluded = String(excludePeerId || '').trim()
  for (const record of getPeersByIds(subscribers)) {
    if (excluded && resolvePeerId(record.peer) === excluded)
      continue
    safeSendJson(
      record.peer,
      record.authKind === 'meeting_guest'
        ? sanitizeGuestMeetingPayload(payload)
        : payload,
    )
  }
}

export function broadcastRealtimeRoomEvent(
  roomKey: string,
  payload: Record<string, unknown>,
  excludePeerId = '',
): void {
  const state = getHubState()
  const subscribers = state.roomSubs.get(String(roomKey || '').trim())
  if (!subscribers || subscribers.size === 0)
    return

  const excluded = String(excludePeerId || '').trim()
  for (const record of getPeersByIds(subscribers)) {
    if (excluded && resolvePeerId(record.peer) === excluded)
      continue
    safeSendJson(record.peer, payload)
  }
}

function broadcastRoomPresence(roomKey: string): void {
  const members = getMergedRoomPresence(roomKey)
  const payload = {
    type: 'collab.presence',
    payload: {
      roomKey,
      members,
    },
  }
  broadcastRealtimeRoomEvent(roomKey, payload)
}

export function getRealtimeRoomPresence(roomKey: string): RealtimePeerPresence[] {
  const state = getHubState()
  const roomPresence = state.roomPresence.get(String(roomKey || '').trim())
  if (!roomPresence)
    return []
  return [...roomPresence.values()]
}

export function applyRemoteRealtimeRoomPresence(input: {
  roomKey: string
  originInstanceId: string
  members: RealtimePeerPresence[]
}): void {
  const state = getHubState()
  const roomKey = String(input.roomKey || '').trim()
  const originInstanceId = String(input.originInstanceId || '').trim()
  if (!roomKey || !originInstanceId)
    return

  let snapshots = state.remoteRoomPresence.get(roomKey)
  if (!snapshots) {
    snapshots = new Map<string, RealtimeRemotePresenceSnapshot>()
    state.remoteRoomPresence.set(roomKey, snapshots)
  }

  const members = Array.isArray(input.members)
    ? input.members.map(item => normalizePeerPresence(item)).filter((item): item is RealtimePeerPresence => Boolean(item))
    : []

  snapshots.set(originInstanceId, {
    members,
    updatedAtMs: Date.now(),
  })

  broadcastRoomPresence(roomKey)
}

export function rememberRealtimeEvent(eventId: string): void {
  const normalized = String(eventId || '').trim()
  if (!normalized)
    return
  const state = getHubState()
  cleanupSeenEvents(state)
  state.seenEvents.set(normalized, Date.now() + SEEN_EVENT_TTL_MS)
}

export function hasSeenRealtimeEvent(eventId: string): boolean {
  const normalized = String(eventId || '').trim()
  if (!normalized)
    return false
  const state = getHubState()
  cleanupSeenEvents(state)
  return state.seenEvents.has(normalized)
}

export function closeRealtimeMeetingGuestPeers(input: {
  meetingId?: string
  guestShareId?: string
  code?: number
  reason?: string
}): void {
  const state = getHubState()
  const normalizedMeetingId = String(input.meetingId || '').trim()
  const normalizedShareId = String(input.guestShareId || '').trim()
  for (const record of state.peers.values()) {
    if (record.authKind !== 'meeting_guest')
      continue
    if (normalizedMeetingId && record.guestMeetingId !== normalizedMeetingId)
      continue
    if (normalizedShareId && record.guestShareId !== normalizedShareId)
      continue
    try {
      const result = record.peer?.close?.(Number(input.code || 4403), String(input.reason || 'meeting_share_revoked'))
      if (result && typeof result.then === 'function')
        void result.catch(() => undefined)
    }
    catch {
      // ignore socket close failures
    }
  }
}
