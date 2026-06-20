import type { Peer } from 'crossws'
import type { AuthUser } from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { resolveValidatedMeetingGuestToken } from '~~/server/services/meeting/project-meeting'
import {
  ACCESS_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '~~/server/utils/auth'
import { withClient, withTransaction } from '~~/server/utils/db'
import { findAuthBySessionTokenHash } from '~~/server/utils/platform-store'
import { getProjectMeetingDetailByMeetingId } from '~~/server/utils/project-meeting-store'
import { applyProjectCollabUpdate, getProjectCollabSnapshot } from '~~/server/utils/project-resource-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { createRealtimeEvent, publishRealtimeEvent } from '~~/server/utils/realtime-events'
import {
  buildCollabRoomKey,
  getRealtimeRoomPresence,
  joinRealtimeCollabRoom,
  leaveRealtimeCollabRoom,
  registerRealtimePeer,
  removeRealtimePeer,
  subscribeRealtimeMeeting,
  subscribeRealtimeProject,
  subscribeRealtimeWorkspace,
  touchRealtimePeer,
  updateRealtimePresence,
} from '~~/server/utils/realtime-hub'
import { hashToken } from '~~/server/utils/security'
import { captureServerException } from '~~/server/utils/sentry'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'

const HEARTBEAT_INTERVAL_MS = 25_000
const HEARTBEAT_TIMEOUT_MS = 70_000
const REALTIME_CONTEXT_KEY = '__wlRealtimeContext'
const REALTIME_PEER_CONTEXT = new WeakMap<Peer, Record<string, unknown>>()
const REALTIME_DEBUG_ENABLED = new Set(['1', 'true', 'yes', 'on']).has(
  String(process.env.WINLOOP_REALTIME_DEBUG || '').trim().toLowerCase(),
)

interface RealtimeClientMessage {
  type: string
  requestId?: string
  workspaceId?: string
  projectId?: string
  resourceId?: string
  payload?: Record<string, unknown>
}

interface RealtimeRuntimeContext {
  peerId: string
  user: AuthUser
  authKind: 'member' | 'meeting_guest'
  meetingId?: string
  guestShareId?: string
  lastSeenAt: number
  heartbeatTimer: NodeJS.Timeout | null
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function ensurePeerContextRecord(peer: Peer): Record<string, unknown> {
  const fromMap = REALTIME_PEER_CONTEXT.get(peer)
  if (fromMap)
    return fromMap

  const fallback = peer.context && typeof peer.context === 'object' && !Array.isArray(peer.context)
    ? { ...(peer.context as Record<string, unknown>) }
    : {}
  REALTIME_PEER_CONTEXT.set(peer, fallback)
  return fallback
}

function parseCookieHeader(rawCookie: string): Record<string, string> {
  const cookieMap: Record<string, string> = {}
  const normalized = normalizeString(rawCookie)
  if (!normalized)
    return cookieMap

  for (const chunk of normalized.split(';')) {
    const part = normalizeString(chunk)
    if (!part)
      continue
    const index = part.indexOf('=')
    if (index <= 0)
      continue

    const key = normalizeString(part.slice(0, index))
    const value = normalizeString(part.slice(index + 1))
    if (!key || !value)
      continue

    try {
      cookieMap[key] = decodeURIComponent(value)
    }
    catch {
      cookieMap[key] = value
    }
  }
  return cookieMap
}

function readRequestHeader(peer: Peer, headerName: string): string {
  const targetName = normalizeString(headerName).toLowerCase()
  if (!targetName)
    return ''

  const rawHeaders = peer.request?.headers as unknown
  if (!rawHeaders)
    return ''

  const maybeHeaders = rawHeaders as { get?: (name: string) => string | null }
  if (typeof maybeHeaders.get === 'function')
    return normalizeString(maybeHeaders.get(targetName))

  if (typeof rawHeaders !== 'object' || Array.isArray(rawHeaders))
    return ''

  const headersRecord = rawHeaders as Record<string, unknown>
  const value = headersRecord[targetName] ?? headersRecord[headerName]
  if (Array.isArray(value))
    return normalizeString(value[0] || '')
  return normalizeString(value)
}

function readRequestUrl(peer: Peer): URL | null {
  const rawUrl = normalizeString(String(peer.request?.url || ''))
  if (!rawUrl)
    return null

  const host = readRequestHeader(peer, 'host') || 'localhost'
  const protocol = normalizeString(readRequestHeader(peer, 'x-forwarded-proto')) === 'https' ? 'https' : 'http'
  try {
    return new URL(rawUrl, `${protocol}://${host}`)
  }
  catch {
    return null
  }
}

function readQueryParam(peer: Peer, name: string): string {
  const requestUrl = readRequestUrl(peer)
  if (!requestUrl)
    return ''
  return normalizeString(requestUrl.searchParams.get(name))
}

function logRealtimeDebug(
  message: string,
  detail: Record<string, unknown> = {},
  level: 'debug' | 'warn' | 'error' = 'debug',
): void {
  if (level === 'debug' && !REALTIME_DEBUG_ENABLED)
    return

  if (level === 'error') {
    console.error('[realtime-ws]', message, detail)
    const detailMessage = normalizeString(detail.message)
    captureServerException(new Error(detailMessage ? `${message}: ${detailMessage}` : message), {
      module: 'realtime-ws',
      traceId: normalizeString(detail.requestId),
    })
    return
  }

  if (level === 'warn') {
    console.warn('[realtime-ws]', message, detail)
    return
  }

  console.warn('[realtime-ws]', message, detail)
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function')
}

function absorbSocketResult(result: unknown): void {
  if (!isPromiseLike(result))
    return

  void result.catch((error) => {
    logRealtimeDebug('socket action rejected', {
      message: error instanceof Error ? error.message : String(error || ''),
    })
  })
}

function safeClose(peer: Peer, code: number, reason: string): void {
  try {
    const result = peer.close(code, reason)
    absorbSocketResult(result)
  }
  catch (error) {
    logRealtimeDebug('close failed', {
      code,
      reason,
      message: error instanceof Error ? error.message : String(error || ''),
    })
  }
}

function resolvePeerContext(peer: Peer): RealtimeRuntimeContext | null {
  const context = ensurePeerContextRecord(peer)
  const resolved = context[REALTIME_CONTEXT_KEY]
  if (!resolved || typeof resolved !== 'object')
    return null
  return resolved as RealtimeRuntimeContext
}

function setPeerContext(peer: Peer, context: RealtimeRuntimeContext): void {
  const target = ensurePeerContextRecord(peer)
  target[REALTIME_CONTEXT_KEY] = context
}

function clearPeerContext(peer: Peer): void {
  const target = ensurePeerContextRecord(peer)
  const existing = target[REALTIME_CONTEXT_KEY]
  if (existing && typeof existing === 'object') {
    const heartbeatTimer = (existing as RealtimeRuntimeContext).heartbeatTimer
    if (heartbeatTimer)
      clearInterval(heartbeatTimer)
  }
  delete target[REALTIME_CONTEXT_KEY]
  REALTIME_PEER_CONTEXT.delete(peer)
}

function sendJson(peer: Peer, payload: Record<string, unknown>): void {
  try {
    const result = peer.send(JSON.stringify(payload))
    absorbSocketResult(result)
  }
  catch {
    // ignore send failures
  }
}

function sendAck(peer: Peer, requestId: string | undefined, payload: Record<string, unknown> = {}): void {
  sendJson(peer, {
    type: 'ack',
    requestId: normalizeString(requestId) || undefined,
    payload,
  })
}

function sendError(peer: Peer, requestId: string | undefined, code: string, message: string): void {
  sendJson(peer, {
    type: 'error',
    requestId: normalizeString(requestId) || undefined,
    payload: {
      code,
      message,
    },
  })
}

function parseClientMessage(rawText: string): RealtimeClientMessage | null {
  const normalized = normalizeString(rawText)
  if (!normalized)
    return null

  try {
    const parsed = JSON.parse(normalized) as Partial<RealtimeClientMessage>
    const type = normalizeString(parsed.type)
    if (!type)
      return null

    return {
      type,
      requestId: normalizeString(parsed.requestId) || undefined,
      workspaceId: normalizeString(parsed.workspaceId) || undefined,
      projectId: normalizeString(parsed.projectId) || undefined,
      resourceId: normalizeString(parsed.resourceId) || undefined,
      payload: normalizeObject(parsed.payload),
    }
  }
  catch {
    return null
  }
}

function toUint8ArrayFromBase64(rawValue: string): Uint8Array {
  const normalized = normalizeString(rawValue)
  if (!normalized)
    return new Uint8Array()
  try {
    return new Uint8Array(Buffer.from(normalized, 'base64'))
  }
  catch {
    return new Uint8Array()
  }
}

function splitRoomKey(roomKey: string): { projectId: string, resourceId: string } {
  const normalized = normalizeString(roomKey)
  const separatorIndex = normalized.indexOf(':')
  if (separatorIndex <= 0) {
    return {
      projectId: '',
      resourceId: '',
    }
  }
  return {
    projectId: normalizeString(normalized.slice(0, separatorIndex)),
    resourceId: normalizeString(normalized.slice(separatorIndex + 1)),
  }
}

async function publishCollabPresenceSnapshot(roomKey: string): Promise<void> {
  const { projectId, resourceId } = splitRoomKey(roomKey)
  if (!projectId || !resourceId)
    return

  const event = createRealtimeEvent({
    type: 'collab.presence',
    workspaceId: '',
    projectId,
    resourceId,
  })
  await publishRealtimeEvent(event, {
    presence: {
      members: getRealtimeRoomPresence(roomKey),
    },
  })
}

function publishCollabPresenceSnapshotSilently(roomKey: string): void {
  void publishCollabPresenceSnapshot(roomKey).catch((error) => {
    logRealtimeDebug('presence publish failed', {
      roomKey,
      message: error instanceof Error ? error.message : String(error || ''),
    })
  })
}

async function resolveAuthUserFromPeer(peer: Peer): Promise<AuthUser | null> {
  const cookieHeader = readRequestHeader(peer, 'cookie')
  if (!cookieHeader)
    return null

  const cookies = parseCookieHeader(cookieHeader)
  const token = normalizeString(
    cookies[ACCESS_COOKIE_NAME]
    || cookies[REFRESH_COOKIE_NAME]
    || cookies[LEGACY_SESSION_COOKIE_NAME]
    || '',
  )
  if (!token)
    return null

  return withClient(undefined, async (db) => {
    const auth = await findAuthBySessionTokenHash(db, hashToken(token))
    return auth?.user || null
  })
}

async function resolveGuestAuthFromPeer(peer: Peer): Promise<{
  user: AuthUser
  meetingId: string
  guestShareId: string
} | null> {
  const meetingGuestToken = readQueryParam(peer, 'meetingGuestToken')
  if (!meetingGuestToken)
    return null

  return withClient(undefined, async (db) => {
    const resolved = await resolveValidatedMeetingGuestToken(db, meetingGuestToken)
    if (!resolved)
      return null

    const now = new Date().toISOString()
    return {
      user: {
        id: `guest:${resolved.meeting.id}:${resolved.providerIdentity}`,
        username: resolved.guestDisplayName,
        avatarUrl: null,
        isPlatformAdmin: false,
        isDisabled: false,
        createdAt: now,
        updatedAt: now,
      },
      meetingId: resolved.meeting.id,
      guestShareId: resolved.share.id,
    }
  })
}

function touchPeerRuntime(peer: Peer): RealtimeRuntimeContext | null {
  const context = resolvePeerContext(peer)
  if (!context)
    return null
  context.lastSeenAt = Date.now()
  touchRealtimePeer(context.peerId)
  return context
}

export default defineWebSocketHandler({
  async open(peer) {
    const cookieHeader = readRequestHeader(peer, 'cookie')
    const memberUser = await resolveAuthUserFromPeer(peer)
    const guestAuth = memberUser ? null : await resolveGuestAuthFromPeer(peer)
    const user = memberUser || guestAuth?.user || null
    if (!user) {
      const cookieMap = parseCookieHeader(cookieHeader)
      logRealtimeDebug('reject unauthorized', {
        remoteAddress: peer.remoteAddress || '',
        hasAccessCookie: Boolean(cookieMap[ACCESS_COOKIE_NAME]),
        hasRefreshCookie: Boolean(cookieMap[REFRESH_COOKIE_NAME] || cookieMap[LEGACY_SESSION_COOKIE_NAME]),
        hasMeetingGuestToken: Boolean(readQueryParam(peer, 'meetingGuestToken')),
      }, 'warn')
      sendJson(peer, {
        type: 'error',
        payload: {
          code: 'UNAUTHORIZED',
          message: '实时连接鉴权失败，请先登录。',
        },
      })
      safeClose(peer, 4401, 'unauthorized')
      return
    }
    if (!guestAuth && user.isDisabled) {
      logRealtimeDebug('reject forbidden(disabled)', {
        userId: user.id,
        remoteAddress: peer.remoteAddress || '',
      }, 'warn')
      sendJson(peer, {
        type: 'error',
        payload: {
          code: 'FORBIDDEN',
          message: '当前账号已被禁用。',
        },
      })
      safeClose(peer, 4403, 'forbidden')
      return
    }

    const peerId = registerRealtimePeer(peer, user, {
      authKind: guestAuth ? 'meeting_guest' : 'member',
      guestShareId: guestAuth?.guestShareId,
      guestMeetingId: guestAuth?.meetingId,
    })
    if (!peerId) {
      logRealtimeDebug('reject peer_register_failed', {
        userId: user.id,
      }, 'warn')
      safeClose(peer, 4500, 'peer_register_failed')
      return
    }

    const runtimeContext: RealtimeRuntimeContext = {
      peerId,
      user,
      authKind: guestAuth ? 'meeting_guest' : 'member',
      meetingId: guestAuth?.meetingId,
      guestShareId: guestAuth?.guestShareId,
      lastSeenAt: Date.now(),
      heartbeatTimer: null,
    }
    setPeerContext(peer, runtimeContext)

    const heartbeatTimer = setInterval(() => {
      const latest = resolvePeerContext(peer)
      if (!latest)
        return
      const idleMs = Date.now() - latest.lastSeenAt
      if (idleMs > HEARTBEAT_TIMEOUT_MS) {
        safeClose(peer, 4000, 'heartbeat_timeout')
        return
      }
      sendJson(peer, {
        type: 'ping',
        payload: {
          sentAt: new Date().toISOString(),
        },
      })
    }, HEARTBEAT_INTERVAL_MS)
    heartbeatTimer.unref?.()
    runtimeContext.heartbeatTimer = heartbeatTimer

    sendJson(peer, {
      type: 'ready',
      payload: {
        peerId,
        user: {
          id: user.id,
          username: user.username,
        },
        authKind: runtimeContext.authKind,
        meetingId: runtimeContext.meetingId,
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
        heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      },
    })

    logRealtimeDebug('open ready', {
      peerId,
      userId: user.id,
    })
  },

  async message(peer, message) {
    const runtimeContext = touchPeerRuntime(peer)
    if (!runtimeContext) {
      sendError(peer, undefined, 'NOT_READY', '连接初始化中，请稍后重试。')
      logRealtimeDebug('message ignored before ready', {
        remoteAddress: peer.remoteAddress || '',
      })
      return
    }

    const parsedMessage = parseClientMessage(message.text())
    if (!parsedMessage) {
      sendError(peer, undefined, 'INVALID_MESSAGE', '消息格式错误。')
      return
    }

    const messageType = normalizeString(parsedMessage.type)
    if (messageType === 'pong')
      return
    if (messageType === 'ping') {
      sendJson(peer, {
        type: 'pong',
        payload: {
          sentAt: new Date().toISOString(),
        },
      })
      return
    }

    try {
      if (messageType === 'workspace.subscribe') {
        if (runtimeContext.authKind !== 'member') {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '外部来宾不能订阅工作区事件。')
          return
        }
        const workspaceId = normalizeString(parsedMessage.workspaceId || parsedMessage.payload?.workspaceId)
        if (!workspaceId) {
          sendError(peer, parsedMessage.requestId, 'INVALID_WORKSPACE_ID', '缺少 workspaceId。')
          return
        }

        const allowed = await withClient(undefined, async (db) => {
          return teamHasWorkspaceMembership(db, runtimeContext.user, workspaceId)
        })
        if (!allowed) {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '当前用户无权订阅该空间。')
          return
        }

        subscribeRealtimeWorkspace(runtimeContext.peerId, workspaceId)
        sendAck(peer, parsedMessage.requestId, {
          type: messageType,
          workspaceId,
        })
        return
      }

      if (messageType === 'project.subscribe') {
        if (runtimeContext.authKind !== 'member') {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '外部来宾不能订阅项目事件。')
          return
        }
        const projectId = normalizeString(parsedMessage.projectId || parsedMessage.payload?.projectId)
        if (!projectId) {
          sendError(peer, parsedMessage.requestId, 'INVALID_PROJECT_ID', '缺少 projectId。')
          return
        }

        const access = await withClient(undefined, async (db) => {
          return resolveProjectRealtimeAccess(db, runtimeContext.user, projectId)
        })
        if (!access) {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '当前用户无权订阅该项目。')
          return
        }

        subscribeRealtimeWorkspace(runtimeContext.peerId, access.workspaceId)
        subscribeRealtimeProject(runtimeContext.peerId, access.projectId)
        sendAck(peer, parsedMessage.requestId, {
          type: messageType,
          workspaceId: access.workspaceId,
          projectId: access.projectId,
        })
        return
      }

      if (messageType === 'meeting.subscribe') {
        const meetingId = normalizeString(parsedMessage.payload?.meetingId)
        if (!meetingId) {
          sendError(peer, parsedMessage.requestId, 'INVALID_MEETING_ID', '缺少 meetingId。')
          return
        }

        if (runtimeContext.authKind === 'meeting_guest') {
          if (meetingId !== normalizeString(runtimeContext.meetingId)) {
            sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '来宾只能订阅当前分享会议。')
            return
          }
          subscribeRealtimeMeeting(runtimeContext.peerId, meetingId)
          sendAck(peer, parsedMessage.requestId, {
            type: messageType,
            meetingId,
          })
          return
        }

        const context = await withClient(undefined, async (db) => {
          const meeting = await getProjectMeetingDetailByMeetingId(db, meetingId)
          if (!meeting)
            return null
          const access = await resolveProjectRealtimeAccess(db, runtimeContext.user, meeting.projectId)
          if (!access)
            return null
          return {
            meeting,
            access,
          }
        })
        if (!context) {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '当前用户无权订阅该会议。')
          return
        }

        subscribeRealtimeWorkspace(runtimeContext.peerId, context.access.workspaceId)
        subscribeRealtimeProject(runtimeContext.peerId, context.access.projectId)
        subscribeRealtimeMeeting(runtimeContext.peerId, meetingId)
        sendAck(peer, parsedMessage.requestId, {
          type: messageType,
          workspaceId: context.access.workspaceId,
          projectId: context.access.projectId,
          meetingId,
        })
        return
      }

      if (messageType === 'collab.join') {
        if (runtimeContext.authKind !== 'member') {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '外部来宾不能加入协作房间。')
          return
        }
        const projectId = normalizeString(parsedMessage.projectId || parsedMessage.payload?.projectId)
        const resourceId = normalizeString(parsedMessage.resourceId || parsedMessage.payload?.resourceId)
        if (!projectId || !resourceId) {
          sendError(peer, parsedMessage.requestId, 'INVALID_COLLAB_ROOM', '缺少 projectId 或 resourceId。')
          return
        }

        const context = await withClient(undefined, async (db) => {
          const access = await resolveProjectRealtimeAccess(db, runtimeContext.user, projectId)
          if (!access)
            return null
          const snapshot = await getProjectCollabSnapshot(db, {
            projectId,
            resourceId,
          })
          if (!snapshot)
            return null
          return {
            access,
            snapshot,
          }
        })

        if (!context) {
          sendError(peer, parsedMessage.requestId, 'COLLAB_NOT_FOUND', '协作文档或画布不存在，或当前用户无权限。')
          return
        }

        subscribeRealtimeWorkspace(runtimeContext.peerId, context.access.workspaceId)
        subscribeRealtimeProject(runtimeContext.peerId, context.access.projectId)

        const roomKey = buildCollabRoomKey(projectId, resourceId)
        joinRealtimeCollabRoom(runtimeContext.peerId, roomKey)
        publishCollabPresenceSnapshotSilently(roomKey)

        sendJson(peer, {
          type: 'collab.bootstrap',
          workspaceId: context.access.workspaceId,
          projectId,
          resourceId,
          revision: context.snapshot.revision,
          payload: {
            kind: context.snapshot.kind,
            updateBase64: Buffer.from(context.snapshot.update).toString('base64'),
          },
        })
        sendAck(peer, parsedMessage.requestId, {
          type: messageType,
          workspaceId: context.access.workspaceId,
          projectId,
          resourceId,
          revision: context.snapshot.revision,
        })
        return
      }

      if (messageType === 'collab.leave') {
        if (runtimeContext.authKind !== 'member') {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '外部来宾不能加入协作房间。')
          return
        }
        const projectId = normalizeString(parsedMessage.projectId || parsedMessage.payload?.projectId)
        const resourceId = normalizeString(parsedMessage.resourceId || parsedMessage.payload?.resourceId)
        if (!projectId || !resourceId) {
          sendError(peer, parsedMessage.requestId, 'INVALID_COLLAB_ROOM', '缺少 projectId 或 resourceId。')
          return
        }

        const roomKey = buildCollabRoomKey(projectId, resourceId)
        leaveRealtimeCollabRoom(runtimeContext.peerId, roomKey)
        publishCollabPresenceSnapshotSilently(roomKey)
        sendAck(peer, parsedMessage.requestId, {
          type: messageType,
          projectId,
          resourceId,
        })
        return
      }

      if (messageType === 'collab.update') {
        if (runtimeContext.authKind !== 'member') {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '外部来宾不能编辑协作内容。')
          return
        }
        const projectId = normalizeString(parsedMessage.projectId || parsedMessage.payload?.projectId)
        const resourceId = normalizeString(parsedMessage.resourceId || parsedMessage.payload?.resourceId)
        const updateBase64 = normalizeString(parsedMessage.payload?.updateBase64)
        if (!projectId || !resourceId || !updateBase64) {
          sendError(peer, parsedMessage.requestId, 'INVALID_COLLAB_UPDATE', '缺少 projectId/resourceId/updateBase64。')
          return
        }

        const update = toUint8ArrayFromBase64(updateBase64)
        if (update.length === 0) {
          sendError(peer, parsedMessage.requestId, 'INVALID_COLLAB_UPDATE', 'updateBase64 解析失败。')
          return
        }

        const result = await withTransaction(undefined, async (db) => {
          const access = await resolveProjectRealtimeAccess(db, runtimeContext.user, projectId)
          if (!access)
            throw new Error('FORBIDDEN')

          const snapshot = await applyProjectCollabUpdate(db, {
            projectId,
            resourceId,
            actorUserId: runtimeContext.user.id,
            update,
          })

          return {
            access,
            snapshot,
          }
        })

        const realtimeEvent = createRealtimeEvent({
          type: 'collab.update',
          workspaceId: result.snapshot.workspaceId || result.access.workspaceId,
          projectId,
          resourceId,
          revision: result.snapshot.revision,
        })
        await publishRealtimeEvent(realtimeEvent, {
          excludePeerId: runtimeContext.peerId,
          collab: {
            updateBase64: Buffer.from(update).toString('base64'),
            kind: result.snapshot.kind,
          },
        })

        logRealtimeDebug('collab.update committed', {
          peerId: runtimeContext.peerId,
          userId: runtimeContext.user.id,
          projectId,
          resourceId,
          revision: result.snapshot.revision,
          incomingUpdateBytes: update.length,
          snapshotBytes: result.snapshot.update.length,
        })

        sendAck(peer, parsedMessage.requestId, {
          type: messageType,
          workspaceId: result.snapshot.workspaceId || result.access.workspaceId,
          projectId,
          resourceId,
          revision: result.snapshot.revision,
        })
        return
      }

      if (messageType === 'presence.update') {
        if (runtimeContext.authKind !== 'member') {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '外部来宾不能更新协作状态。')
          return
        }
        const projectId = normalizeString(parsedMessage.projectId || parsedMessage.payload?.projectId)
        const resourceId = normalizeString(parsedMessage.resourceId || parsedMessage.payload?.resourceId)
        if (!projectId || !resourceId) {
          sendError(peer, parsedMessage.requestId, 'INVALID_PRESENCE_TARGET', '缺少 projectId 或 resourceId。')
          return
        }

        const access = await withClient(undefined, async (db) => {
          return resolveProjectRealtimeAccess(db, runtimeContext.user, projectId)
        })
        if (!access) {
          sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '当前用户无权更新协作状态。')
          return
        }

        const cursorX = Number(parsedMessage.payload?.cursorX)
        const cursorY = Number(parsedMessage.payload?.cursorY)
        const awarenessClientId = Number(parsedMessage.payload?.awarenessClientId)
        const awarenessUpdateBase64 = normalizeString(parsedMessage.payload?.awarenessUpdateBase64)
        const activityState = normalizeString(parsedMessage.payload?.activityState) === 'background'
          ? 'background'
          : 'active'
        const roomKey = buildCollabRoomKey(projectId, resourceId)
        updateRealtimePresence(
          runtimeContext.peerId,
          roomKey,
          Number.isFinite(cursorX) ? cursorX : undefined,
          Number.isFinite(cursorY) ? cursorY : undefined,
          activityState,
          Number.isInteger(awarenessClientId) ? Math.trunc(awarenessClientId) : undefined,
          awarenessUpdateBase64 || undefined,
        )
        publishCollabPresenceSnapshotSilently(roomKey)
        sendAck(peer, parsedMessage.requestId, {
          type: messageType,
          projectId,
          resourceId,
        })
        return
      }

      sendError(peer, parsedMessage.requestId, 'UNKNOWN_MESSAGE_TYPE', `未知消息类型：${messageType}`)
    }
    catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        sendError(peer, parsedMessage.requestId, 'FORBIDDEN', '当前用户无权限执行该操作。')
        return
      }
      if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND') {
        sendError(peer, parsedMessage.requestId, 'RESOURCE_NOT_FOUND', '目标协作文档或画布不存在。')
        return
      }
      if (error instanceof Error && error.message === 'INVALID_COLLAB_UPDATE') {
        sendError(peer, parsedMessage.requestId, 'INVALID_COLLAB_UPDATE', '协作增量格式无效。')
        return
      }
      sendError(peer, parsedMessage.requestId, 'INTERNAL_ERROR', '实时服务处理失败。')
      logRealtimeDebug('message failed', {
        peerId: runtimeContext.peerId,
        userId: runtimeContext.user.id,
        type: messageType,
        requestId: normalizeString(parsedMessage.requestId),
        workspaceId: normalizeString(parsedMessage.workspaceId || parsedMessage.payload?.workspaceId),
        projectId: normalizeString(parsedMessage.projectId || parsedMessage.payload?.projectId),
        resourceId: normalizeString(parsedMessage.resourceId || parsedMessage.payload?.resourceId),
        message: error instanceof Error ? error.message : String(error || ''),
      }, 'error')
    }
  },

  close(peer, details) {
    const runtimeContext = resolvePeerContext(peer)
    const cookies = parseCookieHeader(readRequestHeader(peer, 'cookie'))
    const closeCode = Number(details?.code || 0)
    const closeLevel = closeCode === 1000 || closeCode === 1001 || closeCode === 1005 ? 'debug' : 'warn'
    logRealtimeDebug('close', {
      peerId: runtimeContext?.peerId || '',
      userId: runtimeContext?.user?.id || '',
      code: closeCode,
      reason: normalizeString(details?.reason),
      origin: readRequestHeader(peer, 'origin'),
      host: readRequestHeader(peer, 'host'),
      hasAccessCookie: Boolean(cookies[ACCESS_COOKIE_NAME]),
      hasRefreshCookie: Boolean(cookies[REFRESH_COOKIE_NAME] || cookies[LEGACY_SESSION_COOKIE_NAME]),
    }, closeLevel)
    clearPeerContext(peer)
    const affectedRooms = removeRealtimePeer(peer)
    for (const roomKey of affectedRooms)
      publishCollabPresenceSnapshotSilently(roomKey)
  },

  error(peer, error) {
    const runtimeContext = resolvePeerContext(peer)
    logRealtimeDebug('error', {
      peerId: runtimeContext?.peerId || '',
      userId: runtimeContext?.user?.id || '',
      message: error instanceof Error ? error.message : String(error || ''),
    }, 'error')
    clearPeerContext(peer)
    const affectedRooms = removeRealtimePeer(peer)
    for (const roomKey of affectedRooms)
      publishCollabPresenceSnapshotSilently(roomKey)
  },
})
