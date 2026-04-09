type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

interface RealtimeEnvelope {
  type: string
  requestId?: string
  workspaceId?: string
  projectId?: string
  resourceId?: string
  revision?: number
  payload?: Record<string, unknown>
}

type RealtimeMessageListener = (message: RealtimeEnvelope) => void

interface WorkspaceRealtimeClient {
  apiBase: string
  socket: WebSocket | null
  serverReady: boolean
  requestSeed: number
  retryStep: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  heartbeatWatchTimer: ReturnType<typeof setInterval> | null
  heartbeatTimeoutMs: number
  lastServerActivityAt: number
  closedByUser: boolean
  queue: string[]
  listeners: Set<RealtimeMessageListener>
  workspaceSubscriptions: Set<string>
  projectSubscriptions: Set<string>
  collabSubscriptions: Set<string>
  status: Ref<RealtimeStatus>
  connected: Ref<boolean>
}

const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000]
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 70_000
const NON_RETRY_CLOSE_CODES = new Set([4401, 4403])
let realtimeClientSingleton: WorkspaceRealtimeClient | null = null

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function buildRoomKey(projectId: string, resourceId: string): string {
  return `${normalizeString(projectId)}:${normalizeString(resourceId)}`
}

function splitRoomKey(roomKey: string): { projectId: string, resourceId: string } {
  const normalized = normalizeString(roomKey)
  const separatorIndex = normalized.indexOf(':')
  if (separatorIndex < 0) {
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

function buildRealtimeWsUrl(apiBase: string): string {
  const normalizedApiBase = normalizeString(apiBase) || '/api'
  const origin = window.location.origin
  const wsOrigin = origin.replace(/^http/i, 'ws')
  if (/^https?:\/\//i.test(normalizedApiBase)) {
    const parsed = new URL(normalizedApiBase)
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    const path = parsed.pathname.replace(/\/$/, '')
    return `${wsProtocol}//${parsed.host}${path}/realtime/ws`
  }

  const path = normalizedApiBase.startsWith('/')
    ? normalizedApiBase
    : `/${normalizedApiBase}`
  return `${wsOrigin}${path.replace(/\/$/, '')}/realtime/ws`
}

function createRealtimeClient(apiBase: string): WorkspaceRealtimeClient {
  return {
    apiBase,
    socket: null,
    serverReady: false,
    requestSeed: 0,
    retryStep: 0,
    reconnectTimer: null,
    heartbeatWatchTimer: null,
    heartbeatTimeoutMs: DEFAULT_HEARTBEAT_TIMEOUT_MS,
    lastServerActivityAt: 0,
    closedByUser: false,
    queue: [],
    listeners: new Set<RealtimeMessageListener>(),
    workspaceSubscriptions: new Set<string>(),
    projectSubscriptions: new Set<string>(),
    collabSubscriptions: new Set<string>(),
    status: ref<RealtimeStatus>('idle'),
    connected: ref<boolean>(false),
  }
}

function nextRequestId(client: WorkspaceRealtimeClient): string {
  client.requestSeed += 1
  return `rt-${Date.now()}-${client.requestSeed}`
}

function emitToListeners(client: WorkspaceRealtimeClient, message: RealtimeEnvelope): void {
  for (const listener of client.listeners) {
    try {
      listener(message)
    }
    catch {
      // ignore listener errors
    }
  }
}

function sendRaw(client: WorkspaceRealtimeClient, rawMessage: string): void {
  if (!import.meta.client) {
    return
  }

  const socket = client.socket
  if (socket && socket.readyState === WebSocket.OPEN && client.serverReady) {
    socket.send(rawMessage)
    return
  }

  client.queue.push(rawMessage)
}

function sendEnvelope(client: WorkspaceRealtimeClient, message: RealtimeEnvelope): void {
  const requestId = normalizeString(message.requestId) || nextRequestId(client)
  sendRaw(client, JSON.stringify({
    ...message,
    requestId,
  }))
}

function flushQueue(client: WorkspaceRealtimeClient): void {
  if (!import.meta.client)
    return
  if (!client.socket || client.socket.readyState !== WebSocket.OPEN)
    return

  while (client.queue.length > 0) {
    const rawMessage = client.queue.shift()
    if (!rawMessage)
      continue
    client.socket.send(rawMessage)
  }
}

function clearReconnectTimer(client: WorkspaceRealtimeClient): void {
  if (!client.reconnectTimer)
    return
  clearTimeout(client.reconnectTimer)
  client.reconnectTimer = null
}

function clearHeartbeatWatchTimer(client: WorkspaceRealtimeClient): void {
  if (!client.heartbeatWatchTimer)
    return
  clearInterval(client.heartbeatWatchTimer)
  client.heartbeatWatchTimer = null
}

function startHeartbeatWatch(client: WorkspaceRealtimeClient): void {
  clearHeartbeatWatchTimer(client)
  client.heartbeatWatchTimer = setInterval(() => {
    if (!client.socket || client.socket.readyState !== WebSocket.OPEN)
      return
    if (client.lastServerActivityAt <= 0)
      return
    const idleMs = Date.now() - client.lastServerActivityAt
    if (idleMs > client.heartbeatTimeoutMs) {
      try {
        client.socket.close()
      }
      catch {
        // ignore close errors
      }
    }
  }, 5000)
}

function replaySubscriptions(client: WorkspaceRealtimeClient): void {
  for (const workspaceId of client.workspaceSubscriptions) {
    sendEnvelope(client, {
      type: 'workspace.subscribe',
      workspaceId,
    })
  }

  for (const projectId of client.projectSubscriptions) {
    sendEnvelope(client, {
      type: 'project.subscribe',
      projectId,
    })
  }

  for (const roomKey of client.collabSubscriptions) {
    const { projectId, resourceId } = splitRoomKey(roomKey)
    if (!projectId || !resourceId)
      continue
    sendEnvelope(client, {
      type: 'collab.join',
      projectId,
      resourceId,
    })
  }
}

function scheduleReconnect(client: WorkspaceRealtimeClient): void {
  if (!import.meta.client)
    return
  if (client.closedByUser)
    return
  clearReconnectTimer(client)

  client.status.value = 'reconnecting'
  const delay = RECONNECT_BACKOFF_MS[Math.min(client.retryStep, RECONNECT_BACKOFF_MS.length - 1)] || 1000
  client.retryStep += 1
  client.reconnectTimer = setTimeout(() => {
    connectClient(client)
  }, delay)
}

function connectClient(client: WorkspaceRealtimeClient): void {
  if (!import.meta.client)
    return
  if (client.socket && (client.socket.readyState === WebSocket.CONNECTING || client.socket.readyState === WebSocket.OPEN))
    return

  clearReconnectTimer(client)
  client.closedByUser = false
  client.status.value = client.retryStep > 0 ? 'reconnecting' : 'connecting'

  const socket = new WebSocket(buildRealtimeWsUrl(client.apiBase))
  client.socket = socket

  socket.onopen = () => {
    if (client.socket !== socket)
      return
    client.connected.value = true
    client.serverReady = false
    client.status.value = 'open'
    client.retryStep = 0
    client.lastServerActivityAt = Date.now()
    startHeartbeatWatch(client)
  }

  socket.onmessage = (event) => {
    if (client.socket !== socket)
      return
    client.lastServerActivityAt = Date.now()
    const rawData = typeof event.data === 'string' ? event.data : ''
    if (!rawData)
      return

    try {
      const message = JSON.parse(rawData) as RealtimeEnvelope
      if (!message || typeof message !== 'object')
        return
      const messageType = normalizeString(message.type)
      if (!messageType)
        return

      if (messageType === 'ping') {
        sendEnvelope(client, {
          type: 'pong',
        })
      }

      if (messageType === 'ready') {
        const timeoutFromServer = Number(message.payload?.heartbeatTimeoutMs)
        if (Number.isFinite(timeoutFromServer) && timeoutFromServer > 0)
          client.heartbeatTimeoutMs = Math.max(15_000, Math.trunc(timeoutFromServer))

        if (!client.serverReady) {
          client.serverReady = true
          replaySubscriptions(client)
          flushQueue(client)
        }
      }

      emitToListeners(client, message)
    }
    catch {
      // ignore malformed message
    }
  }

  socket.onclose = (event) => {
    if (client.socket !== socket)
      return
    client.connected.value = false
    client.serverReady = false
    client.socket = null
    clearHeartbeatWatchTimer(client)
    const closeCode = Number(event?.code || 0)
    if (NON_RETRY_CLOSE_CODES.has(closeCode)) {
      client.status.value = 'closed'
      emitToListeners(client, {
        type: 'error',
        payload: {
          code: closeCode === 4401 ? 'WS_UNAUTHORIZED' : 'WS_FORBIDDEN',
          closeCode,
          closeReason: normalizeString(event?.reason),
          message: closeCode === 4401
            ? '实时连接鉴权失败，请先重新登录。'
            : '实时连接被拒绝，请检查当前空间/项目权限。',
        },
      })
      return
    }

    if (client.closedByUser) {
      client.status.value = 'closed'
      return
    }
    scheduleReconnect(client)
  }

  socket.onerror = () => {
    if (client.socket !== socket)
      return
    client.connected.value = false
  }
}

function closeClient(client: WorkspaceRealtimeClient): void {
  client.closedByUser = true
  clearReconnectTimer(client)
  clearHeartbeatWatchTimer(client)
  client.retryStep = 0
  client.serverReady = false
  client.queue = []

  if (client.socket && (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING)) {
    try {
      client.socket.close()
    }
    catch {
      // ignore close failures
    }
  }

  client.socket = null
  client.connected.value = false
  client.status.value = 'closed'
}

export function useWorkspaceRealtime() {
  const runtime = useRuntimeConfig()
  const { apiBase } = useApiEndpoint(runtime)
  const normalizedApiBase = normalizeString(apiBase.value) || '/api'

  if (!realtimeClientSingleton || realtimeClientSingleton.apiBase !== normalizedApiBase)
    realtimeClientSingleton = createRealtimeClient(normalizedApiBase)

  const client = realtimeClientSingleton

  function connect(): void {
    connectClient(client)
  }

  function disconnect(): void {
    closeClient(client)
  }

  function onMessage(listener: RealtimeMessageListener): () => void {
    client.listeners.add(listener)
    return () => {
      client.listeners.delete(listener)
    }
  }

  function subscribeWorkspace(workspaceId: string): void {
    const normalizedWorkspaceId = normalizeString(workspaceId)
    if (!normalizedWorkspaceId)
      return
    client.workspaceSubscriptions.add(normalizedWorkspaceId)
    connectClient(client)
    sendEnvelope(client, {
      type: 'workspace.subscribe',
      workspaceId: normalizedWorkspaceId,
    })
  }

  function subscribeProject(projectId: string): void {
    const normalizedProjectId = normalizeString(projectId)
    if (!normalizedProjectId)
      return
    client.projectSubscriptions.add(normalizedProjectId)
    connectClient(client)
    sendEnvelope(client, {
      type: 'project.subscribe',
      projectId: normalizedProjectId,
    })
  }

  function joinCollab(projectId: string, resourceId: string): void {
    const normalizedProjectId = normalizeString(projectId)
    const normalizedResourceId = normalizeString(resourceId)
    if (!normalizedProjectId || !normalizedResourceId)
      return

    const roomKey = buildRoomKey(normalizedProjectId, normalizedResourceId)
    client.collabSubscriptions.add(roomKey)
    connectClient(client)
    sendEnvelope(client, {
      type: 'collab.join',
      projectId: normalizedProjectId,
      resourceId: normalizedResourceId,
    })
  }

  function leaveCollab(projectId: string, resourceId: string): void {
    const normalizedProjectId = normalizeString(projectId)
    const normalizedResourceId = normalizeString(resourceId)
    if (!normalizedProjectId || !normalizedResourceId)
      return

    const roomKey = buildRoomKey(normalizedProjectId, normalizedResourceId)
    client.collabSubscriptions.delete(roomKey)
    sendEnvelope(client, {
      type: 'collab.leave',
      projectId: normalizedProjectId,
      resourceId: normalizedResourceId,
    })
  }

  function sendCollabUpdate(input: {
    projectId: string
    resourceId: string
    updateBase64: string
    revision?: number
  }): void {
    const projectId = normalizeString(input.projectId)
    const resourceId = normalizeString(input.resourceId)
    const updateBase64 = normalizeString(input.updateBase64)
    if (!projectId || !resourceId || !updateBase64)
      return

    sendEnvelope(client, {
      type: 'collab.update',
      projectId,
      resourceId,
      revision: Number.isFinite(Number(input.revision)) ? Number(input.revision) : undefined,
      payload: {
        updateBase64,
      },
    })
  }

  function updatePresence(input: {
    projectId: string
    resourceId: string
    cursorX?: number
    cursorY?: number
    activityState?: 'active' | 'background'
    awarenessClientId?: number
    awarenessUpdateBase64?: string
  }): void {
    const projectId = normalizeString(input.projectId)
    const resourceId = normalizeString(input.resourceId)
    if (!projectId || !resourceId)
      return

    sendEnvelope(client, {
      type: 'presence.update',
      projectId,
      resourceId,
      payload: {
        cursorX: Number.isFinite(Number(input.cursorX)) ? Number(input.cursorX) : undefined,
        cursorY: Number.isFinite(Number(input.cursorY)) ? Number(input.cursorY) : undefined,
        activityState: input.activityState === 'background' ? 'background' : 'active',
        awarenessClientId: Number.isInteger(Number(input.awarenessClientId)) ? Math.trunc(Number(input.awarenessClientId)) : undefined,
        awarenessUpdateBase64: normalizeString(input.awarenessUpdateBase64) || undefined,
      },
    })
  }

  return {
    status: readonly(client.status),
    connected: readonly(client.connected),
    connect,
    disconnect,
    onMessage,
    subscribeWorkspace,
    subscribeProject,
    joinCollab,
    leaveCollab,
    sendCollabUpdate,
    updatePresence,
  }
}
