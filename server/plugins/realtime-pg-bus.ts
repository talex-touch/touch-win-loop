import type { PoolClient } from 'pg'
import type { RealtimeEventPayload, RealtimePresenceMemberPayload } from '~~/server/utils/realtime-events'
import { Buffer } from 'node:buffer'
import { getPool, withClient } from '~~/server/utils/db'
import { getProjectCollabSnapshot } from '~~/server/utils/project-resource-store'
import {
  broadcastRealtimeEventLocally,
  getRealtimeInstanceId,
  REALTIME_PG_CHANNEL,
} from '~~/server/utils/realtime-events'
import {
  applyRemoteRealtimeRoomPresence,
  buildCollabRoomKey,
  hasSeenRealtimeEvent,
  rememberRealtimeEvent,
} from '~~/server/utils/realtime-hub'

const REALTIME_PG_BUS_STATE_KEY = Symbol.for('winloop.realtime.pg-bus.runtime.v1')

interface RealtimePgBusState {
  booted: boolean
  client: PoolClient | null
  reconnectTimer: NodeJS.Timeout | null
  reconnectStep: number
  connecting: boolean
  stopped: boolean
}

const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000]

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

interface ParsedRealtimeNotification {
  event: RealtimeEventPayload
  presenceMembers: RealtimePresenceMemberPayload[]
}

function parseRealtimePresenceMembers(rawMembers: unknown): RealtimePresenceMemberPayload[] {
  if (!Array.isArray(rawMembers))
    return []

  const members: RealtimePresenceMemberPayload[] = []
  for (const item of rawMembers) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue
    const member = item as Record<string, unknown>
    const peerId = normalizeString(member.peerId)
    if (!peerId)
      continue
    const cursorX = Number(member.cursorX)
    const cursorY = Number(member.cursorY)
    members.push({
      peerId,
      userId: normalizeString(member.userId),
      username: normalizeString(member.username),
      cursorX: Number.isFinite(cursorX) ? cursorX : undefined,
      cursorY: Number.isFinite(cursorY) ? cursorY : undefined,
      updatedAt: normalizeString(member.updatedAt) || new Date().toISOString(),
    })
  }
  return members
}

function getRealtimePgBusState(): RealtimePgBusState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[REALTIME_PG_BUS_STATE_KEY] as RealtimePgBusState | undefined
  if (existing)
    return existing

  const created: RealtimePgBusState = {
    booted: false,
    client: null,
    reconnectTimer: null,
    reconnectStep: 0,
    connecting: false,
    stopped: false,
  }
  globalRef[REALTIME_PG_BUS_STATE_KEY] = created
  return created
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return normalizeString(error.message) || 'unknown error'
  return normalizeString(error) || 'unknown error'
}

function clearReconnectTimer(state: RealtimePgBusState): void {
  if (!state.reconnectTimer)
    return
  clearTimeout(state.reconnectTimer)
  state.reconnectTimer = null
}

function scheduleReconnect(state: RealtimePgBusState, reason: string): void {
  if (state.stopped)
    return

  clearReconnectTimer(state)
  const delay = RECONNECT_BACKOFF_MS[Math.min(state.reconnectStep, RECONNECT_BACKOFF_MS.length - 1)] || 1000
  state.reconnectStep += 1

  console.warn('[realtime-pg-bus] reconnect scheduled', {
    reason: normalizeString(reason) || 'unknown',
    delayMs: delay,
    attempt: state.reconnectStep,
  })

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    void bootstrapRealtimePgBus(state)
  }, delay)
  state.reconnectTimer.unref?.()
}

function releaseClientSafely(client: PoolClient | null): void {
  if (!client)
    return
  try {
    client.release()
  }
  catch {
    // ignore release errors
  }
}

function parseRealtimeEventPayload(rawPayload: string): ParsedRealtimeNotification | null {
  if (!rawPayload)
    return null

  try {
    const parsed = JSON.parse(rawPayload) as Partial<RealtimeEventPayload> & Record<string, unknown>
    const type = normalizeString(parsed.type) as RealtimeEventPayload['type']
    if (type !== 'project.resources.changed' && type !== 'project.outline.changed' && type !== 'collab.update' && type !== 'collab.presence')
      return null

    const eventId = normalizeString(parsed.eventId)
    const originInstanceId = normalizeString(parsed.originInstanceId)
    const workspaceId = normalizeString(parsed.workspaceId)
    const projectId = normalizeString(parsed.projectId)
    if (!eventId || !originInstanceId || !projectId)
      return null
    if (type !== 'collab.presence' && !workspaceId)
      return null

    const revision = Number(parsed.revision)
    return {
      event: {
        eventId,
        originInstanceId,
        type,
        workspaceId,
        projectId,
        resourceId: normalizeString(parsed.resourceId) || undefined,
        revision: Number.isFinite(revision) ? Math.max(0, Math.trunc(revision)) : undefined,
        sentAt: normalizeString(parsed.sentAt) || new Date().toISOString(),
      },
      presenceMembers: parseRealtimePresenceMembers(parsed.presenceMembers),
    }
  }
  catch {
    return null
  }
}

async function handleRealtimeNotification(rawPayload: string): Promise<void> {
  const parsed = parseRealtimeEventPayload(rawPayload)
  if (!parsed)
    return
  const { event, presenceMembers } = parsed

  if (event.originInstanceId === getRealtimeInstanceId())
    return

  if (hasSeenRealtimeEvent(event.eventId))
    return

  rememberRealtimeEvent(event.eventId)

  if (event.type === 'collab.presence') {
    const resourceId = normalizeString(event.resourceId)
    if (!resourceId)
      return
    applyRemoteRealtimeRoomPresence({
      roomKey: buildCollabRoomKey(event.projectId, resourceId),
      originInstanceId: event.originInstanceId,
      members: presenceMembers,
    })
    return
  }

  if (event.type === 'collab.update') {
    const resourceId = normalizeString(event.resourceId)
    if (!resourceId)
      return

    const snapshot = await withClient(undefined, async (db) => {
      return getProjectCollabSnapshot(db, {
        projectId: event.projectId,
        resourceId,
      })
    }).catch(() => null)

    if (!snapshot)
      return

    broadcastRealtimeEventLocally(
      {
        ...event,
        revision: snapshot.revision,
      },
      {
        collab: {
          updateBase64: Buffer.from(snapshot.update).toString('base64'),
          kind: snapshot.kind,
        },
      },
    )
    return
  }

  broadcastRealtimeEventLocally(event)
}

async function bootstrapRealtimePgBus(state: RealtimePgBusState): Promise<void> {
  if (state.stopped || state.connecting || state.client)
    return

  state.connecting = true
  try {
    const pool = await getPool(undefined)
    const client = await pool.connect()
    if (state.stopped) {
      releaseClientSafely(client)
      return
    }

    function onNotification(message: { channel?: string, payload?: string }) {
      if (normalizeString(message.channel) !== REALTIME_PG_CHANNEL)
        return
      void handleRealtimeNotification(normalizeString(message.payload))
    }

    function cleanupClient(reason: string, error?: unknown) {
      if (state.client !== client)
        return

      state.client = null
      client.removeListener('notification', onNotification)
      client.removeListener('error', onError)
      client.removeListener('end', onEnd)
      releaseClientSafely(client)

      if (error) {
        console.error('[realtime-pg-bus] listener disconnected:', normalizeErrorMessage(error), {
          reason,
        })
      }
      else {
        console.warn('[realtime-pg-bus] listener disconnected', {
          reason,
        })
      }

      scheduleReconnect(state, reason)
    }

    function onError(error: unknown) {
      cleanupClient('client_error', error)
    }

    function onEnd() {
      cleanupClient('client_end')
    }

    state.client = client
    client.on('notification', onNotification)
    client.on('error', onError)
    client.on('end', onEnd)
    await client.query(`LISTEN ${REALTIME_PG_CHANNEL}`)

    state.reconnectStep = 0
    console.warn('[realtime-pg-bus] listening', {
      channel: REALTIME_PG_CHANNEL,
    })
  }
  catch (error) {
    console.error('[realtime-pg-bus] bootstrap failed:', normalizeErrorMessage(error))
    scheduleReconnect(state, 'bootstrap_failed')
  }
  finally {
    state.connecting = false
  }
}

export default defineNitroPlugin((nitroApp) => {
  const state = getRealtimePgBusState()
  if (state.booted)
    return
  state.booted = true
  state.stopped = false
  void bootstrapRealtimePgBus(state)

  nitroApp.hooks.hookOnce('close', () => {
    state.stopped = true
    state.connecting = false
    clearReconnectTimer(state)

    const client = state.client
    state.client = null
    state.booted = false
    state.reconnectStep = 0
    if (!client)
      return

    void client.query(`UNLISTEN ${REALTIME_PG_CHANNEL}`)
      .catch(() => undefined)
      .finally(() => {
        releaseClientSafely(client)
      })
  })
})
