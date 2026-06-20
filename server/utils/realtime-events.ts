import type { ResourceKind } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { query } from '~~/server/utils/db'
import {
  broadcastRealtimeMeetingEvent,
  broadcastRealtimeProjectEvent,
  broadcastRealtimeRoomEvent,
  broadcastRealtimeWorkspaceEvent,
  buildCollabRoomKey,
  rememberRealtimeEvent,
} from '~~/server/utils/realtime-hub'

export const REALTIME_PG_CHANNEL = 'wl_realtime'
const REALTIME_INSTANCE_ID_KEY = Symbol.for('winloop.realtime.instance-id.v1')

export type RealtimeEventType
  = | 'project.resources.changed'
    | 'project.outline.changed'
    | 'collab.update'
    | 'collab.presence'
    | 'meeting.state.updated'
    | 'meeting.participant.updated'
    | 'meeting.share.updated'
    | 'meeting.caption.partial'
    | 'meeting.caption.final'
    | 'meeting.summary.ready'

export interface RealtimePresenceMemberPayload {
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

export interface RealtimeEventPayload {
  eventId: string
  originInstanceId: string
  type: RealtimeEventType
  workspaceId: string
  projectId: string
  resourceId?: string
  revision?: number
  payload?: Record<string, unknown>
  sentAt: string
}

export interface PublishRealtimeEventOptions {
  excludePeerId?: string
  collab?: {
    updateBase64?: string
    kind?: Extract<ResourceKind, 'markdown' | 'draw'>
  }
  presence?: {
    members?: RealtimePresenceMemberPayload[]
  }
  payload?: Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizePresenceMembers(rawMembers: unknown): RealtimePresenceMemberPayload[] {
  if (!Array.isArray(rawMembers))
    return []

  const normalized: RealtimePresenceMemberPayload[] = []
  for (const item of rawMembers) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue
    const record = item as Record<string, unknown>
    const peerId = normalizeString(record.peerId)
    if (!peerId)
      continue
    const cursorX = Number(record.cursorX)
    const cursorY = Number(record.cursorY)
    const awarenessClientId = Number(record.awarenessClientId)
    normalized.push({
      peerId,
      userId: normalizeString(record.userId),
      username: normalizeString(record.username),
      cursorX: Number.isFinite(cursorX) ? cursorX : undefined,
      cursorY: Number.isFinite(cursorY) ? cursorY : undefined,
      awarenessClientId: Number.isInteger(awarenessClientId) ? Math.trunc(awarenessClientId) : undefined,
      awarenessUpdateBase64: normalizeString(record.awarenessUpdateBase64) || undefined,
      activityState: normalizeString(record.activityState) === 'background' ? 'background' : 'active',
      updatedAt: normalizeString(record.updatedAt) || new Date().toISOString(),
    })
  }
  return normalized
}

function normalizePayload(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}

export function getRealtimeInstanceId(): string {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = normalizeString(globalRef[REALTIME_INSTANCE_ID_KEY])
  if (existing)
    return existing

  const created = randomUUID()
  globalRef[REALTIME_INSTANCE_ID_KEY] = created
  return created
}

export function createRealtimeEvent(input: {
  type: RealtimeEventType
  workspaceId: string
  projectId: string
  resourceId?: string
  revision?: number
  payload?: Record<string, unknown>
}): RealtimeEventPayload {
  const revision = Number(input.revision)
  return {
    eventId: randomUUID(),
    originInstanceId: getRealtimeInstanceId(),
    type: input.type,
    workspaceId: normalizeString(input.workspaceId),
    projectId: normalizeString(input.projectId),
    resourceId: normalizeString(input.resourceId) || undefined,
    revision: Number.isFinite(revision) && revision > 0 ? Math.trunc(revision) : undefined,
    payload: normalizePayload(input.payload),
    sentAt: new Date().toISOString(),
  }
}

export async function notifyRealtimeEvent(
  event: RealtimeEventPayload,
  options: PublishRealtimeEventOptions = {},
): Promise<void> {
  const presenceMembers = event.type === 'collab.presence'
    ? normalizePresenceMembers(options.presence?.members)
    : []

  const serialized = JSON.stringify({
    eventId: normalizeString(event.eventId),
    originInstanceId: normalizeString(event.originInstanceId),
    type: normalizeString(event.type),
    workspaceId: normalizeString(event.workspaceId),
    projectId: normalizeString(event.projectId),
    resourceId: normalizeString(event.resourceId) || undefined,
    revision: Number.isFinite(Number(event.revision)) ? Number(event.revision) : undefined,
    payload: normalizePayload(options.payload) || normalizePayload(event.payload),
    sentAt: normalizeString(event.sentAt) || new Date().toISOString(),
    presenceMembers: presenceMembers.length > 0 ? presenceMembers : undefined,
  })

  await query(undefined, 'SELECT pg_notify($1, $2)', [REALTIME_PG_CHANNEL, serialized])
}

export function broadcastRealtimeEventLocally(
  event: RealtimeEventPayload,
  options: PublishRealtimeEventOptions = {},
): void {
  const eventId = normalizeString(event.eventId)
  const workspaceId = normalizeString(event.workspaceId)
  const projectId = normalizeString(event.projectId)
  const resourceId = normalizeString(event.resourceId)
  const revision = Number.isFinite(Number(event.revision)) ? Number(event.revision) : undefined
  const excludePeerId = normalizeString(options.excludePeerId)

  if (event.type === 'collab.presence')
    return

  if (event.type === 'collab.update') {
    if (!projectId || !resourceId)
      return

    const roomKey = buildCollabRoomKey(projectId, resourceId)
    const collabPayload: Record<string, unknown> = {
      eventId,
    }
    const updateBase64 = normalizeString(options.collab?.updateBase64)
    if (updateBase64)
      collabPayload.updateBase64 = updateBase64
    if (options.collab?.kind)
      collabPayload.kind = options.collab.kind

    broadcastRealtimeRoomEvent(roomKey, {
      type: 'collab.update',
      workspaceId,
      projectId,
      resourceId,
      revision,
      payload: collabPayload,
    }, excludePeerId)
    return
  }

  const nextPayload = {
    type: event.type,
    workspaceId,
    projectId,
    resourceId: resourceId || undefined,
    revision,
    payload: {
      eventId,
      ...(normalizePayload(event.payload) || {}),
      ...(normalizePayload(options.payload) || {}),
    },
  } as {
    type: RealtimeEventType
    workspaceId: string
    projectId: string
    resourceId?: string
    revision?: number
    payload: Record<string, unknown>
  }
  const meetingId = normalizeString(nextPayload.payload.meetingId)

  if (workspaceId)
    broadcastRealtimeWorkspaceEvent(workspaceId, nextPayload, excludePeerId)
  if (projectId)
    broadcastRealtimeProjectEvent(projectId, nextPayload, excludePeerId)
  if (meetingId)
    broadcastRealtimeMeetingEvent(meetingId, nextPayload, excludePeerId)
}

export async function publishRealtimeEvent(
  event: RealtimeEventPayload,
  options: PublishRealtimeEventOptions = {},
): Promise<void> {
  rememberRealtimeEvent(event.eventId)
  broadcastRealtimeEventLocally(event, options)
  await notifyRealtimeEvent(event, options)
}

export async function emitRealtimeEvent(
  input: {
    type: RealtimeEventType
    workspaceId: string
    projectId: string
    resourceId?: string
    revision?: number
    payload?: Record<string, unknown>
  },
  options: PublishRealtimeEventOptions = {},
): Promise<RealtimeEventPayload> {
  const event = createRealtimeEvent(input)
  await publishRealtimeEvent(event, options)
  return event
}
