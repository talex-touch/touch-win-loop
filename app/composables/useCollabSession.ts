import type { Ref } from 'vue'
import type { WorkspaceCollabPresenceActivityState, WorkspaceCollabPresenceMember } from '../components/workspace/collab/presence'
import type { useWorkspaceRealtime } from '~/composables/useWorkspaceRealtime'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { ensureMarkdownCollabDocShape, syncMarkdownMirrorFromRichText } from '~~/shared/utils/collab-markdown-rich-text'
import {
  normalizeWorkspaceCollabPresenceActivityState,
  resolveWorkspaceCollabPresenceColor,
} from '../components/workspace/collab/presence'

export interface CollabSnapshotPayload {
  kind: 'markdown' | 'draw'
  revision: number
  updateBase64: string
  updatedAt?: string
}

export interface WorkspaceRealtimeEnvelope {
  type: string
  requestId?: string
  workspaceId?: string
  projectId?: string
  resourceId?: string
  revision?: number
  payload?: Record<string, unknown>
}

interface UseCollabSessionInput {
  workspaceRealtime: ReturnType<typeof useWorkspaceRealtime>
  projectId: Ref<string>
  resourceId: Ref<string>
  currentUserId: Ref<string>
  currentUsername: Ref<string>
  statusLine: Ref<string>
  fetchSnapshot: (resourceId: string) => Promise<CollabSnapshotPayload | null>
}

interface ApplySnapshotInput {
  kind: 'markdown' | 'draw'
  revision?: number
  updateBase64?: string
  updatedAt?: string
}

interface BufferLikeResult extends Uint8Array {
  toString: (encoding?: string) => string
}

interface BufferLike {
  from: (input: Uint8Array | string, encoding?: string) => BufferLikeResult
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolveBufferLike(): BufferLike | null {
  const candidate = Reflect.get(globalThis as object, 'Buffer') as Partial<BufferLike> | undefined
  if (typeof candidate?.from !== 'function')
    return null
  return {
    from: candidate.from.bind(candidate) as BufferLike['from'],
  }
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (!bytes.length)
    return ''

  if (typeof globalThis.btoa === 'function') {
    let binary = ''
    for (const value of bytes)
      binary += String.fromCharCode(value)
    return globalThis.btoa(binary)
  }

  const bufferLike = resolveBufferLike()
  if (bufferLike)
    return bufferLike.from(bytes).toString('base64')

  return ''
}

function decodeBase64ToBytes(rawBase64: string): Uint8Array {
  const normalized = normalizeString(rawBase64)
  if (!normalized)
    return new Uint8Array()

  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(normalized)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i)
      return bytes
    }

    const bufferLike = resolveBufferLike()
    if (bufferLike)
      return new Uint8Array(bufferLike.from(normalized, 'base64'))
  }
  catch {
    return new Uint8Array()
  }

  return new Uint8Array()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeDrawPayload(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed))
    return parsed
  if (isRecord(parsed))
    return [parsed]
  return null
}

function resolveCollabNodesArray(doc: Y.Doc): Y.Array<unknown> {
  const drawMap = doc.getMap('draw')
  const existingNodes = drawMap.get('nodes')
  if (existingNodes instanceof Y.Array)
    return existingNodes

  const created = new Y.Array<unknown>()
  drawMap.set('nodes', created)
  return created
}

function toDrawModelJson(nodes: unknown[]): string {
  if (nodes.length === 1 && isRecord(nodes[0]))
    return JSON.stringify(nodes[0], null, 2)
  return JSON.stringify(nodes, null, 2)
}

export function useCollabSession(input: UseCollabSessionInput) {
  const resourceKind = ref<'' | 'markdown' | 'draw'>('')
  const revision = ref(0)
  const drawValue = ref('{}')
  const drawError = ref('')
  const presenceMembers = ref<WorkspaceCollabPresenceMember[]>([])
  const applyingRemote = ref(false)
  const docRef = shallowRef<Y.Doc | null>(null)
  const awarenessRef = shallowRef<Awareness | null>(null)
  const markdownDoc = computed(() => {
    if (resourceKind.value !== 'markdown')
      return null
    return docRef.value
  })
  const markdownAwareness = computed(() => {
    if (resourceKind.value !== 'markdown')
      return null
    return awarenessRef.value
  })

  const connected = computed(() => input.workspaceRealtime.connected.value)
  const statusText = computed(() => {
    if (!connected.value)
      return '离线编辑（待重连）'

    const signal = normalizeString(input.statusLine.value).toLowerCase()
    const backendErrorSignals = [
      'connection terminated',
      'timeout',
      'timed out',
      '数据库',
      '请求失败',
      'request error',
    ]
    if (backendErrorSignals.some(keyword => signal.includes(keyword.toLowerCase())))
      return 'WS 已连接（后端服务异常）'

    return '实时连接中'
  })

  const roomKey = computed(() => {
    const projectId = normalizeString(input.projectId.value)
    const resourceId = normalizeString(input.resourceId.value)
    if (!projectId || !resourceId || !resourceKind.value)
      return ''
    return `${projectId}:${resourceId}`
  })

  let docDispose: (() => void) | null = null
  let snapshotPollTimer: ReturnType<typeof setInterval> | null = null
  let batchSendTimer: ReturnType<typeof setTimeout> | null = null
  let markdownMirrorSyncTimer: ReturnType<typeof setTimeout> | null = null
  let presenceCursorTimer: ReturnType<typeof setTimeout> | null = null
  let hasPendingLocalChanges = false
  let removeVisibilityListener: (() => void) | null = null
  let pendingPresenceCursor: { cursorX?: number, cursorY?: number } | null = null
  let awarenessDispose: (() => void) | null = null
  const remoteAwarenessClientIds = new Set<number>()

  function resolvePresenceActivityState(): WorkspaceCollabPresenceActivityState {
    if (!import.meta.client || typeof document === 'undefined')
      return 'active'
    return document.visibilityState === 'hidden' ? 'background' : 'active'
  }

  function syncPresenceActivityState(activityState = resolvePresenceActivityState()): void {
    const projectId = normalizeString(input.projectId.value)
    const resourceId = normalizeString(input.resourceId.value)
    if (!projectId || !resourceId)
      return

    input.workspaceRealtime.updatePresence({
      projectId,
      resourceId,
      activityState,
    })
  }

  function bindVisibilityListener(): void {
    if (!import.meta.client || typeof document === 'undefined' || removeVisibilityListener)
      return

    const handleVisibilityChange = () => {
      syncPresenceActivityState(resolvePresenceActivityState())
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    removeVisibilityListener = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      removeVisibilityListener = null
    }
  }

  function unbindVisibilityListener(): void {
    removeVisibilityListener?.()
  }

  function syncLocalAwarenessUser(): void {
    const awareness = awarenessRef.value
    if (!awareness)
      return

    const userId = normalizeString(input.currentUserId.value)
    const username = normalizeString(input.currentUsername.value)
    if (!userId || !username) {
      awareness.setLocalStateField('user', null)
      return
    }

    awareness.setLocalStateField('user', {
      id: userId,
      userId,
      name: username,
      color: resolveWorkspaceCollabPresenceColor(userId),
    })
  }

  function clearAwarenessBinding(): void {
    awarenessDispose?.()
    awarenessDispose = null

    const awareness = awarenessRef.value
    if (awareness) {
      try {
        awareness.setLocalState(null)
      }
      catch {
        // ignore awareness disposal errors
      }
      awareness.destroy()
    }

    awarenessRef.value = null
    remoteAwarenessClientIds.clear()
  }

  function syncRemoteAwarenessFromPresenceMembers(members: WorkspaceCollabPresenceMember[]): void {
    const awareness = awarenessRef.value
    if (!awareness)
      return

    const nextRemoteClientIds = new Set<number>()
    for (const member of members) {
      const awarenessClientId = Number(member.awarenessClientId)
      if (!Number.isInteger(awarenessClientId) || awarenessClientId === awareness.clientID)
        continue

      const awarenessUpdateBase64 = normalizeString(member.awarenessUpdateBase64)
      if (!awarenessUpdateBase64)
        continue

      const awarenessUpdate = decodeBase64ToBytes(awarenessUpdateBase64)
      if (awarenessUpdate.length === 0)
        continue

      nextRemoteClientIds.add(awarenessClientId)
      try {
        applyAwarenessUpdate(awareness, awarenessUpdate, 'remote-snapshot')
      }
      catch {
        // ignore malformed awareness updates
      }
    }

    const staleClientIds = [...remoteAwarenessClientIds].filter(clientId => !nextRemoteClientIds.has(clientId))
    if (staleClientIds.length > 0)
      removeAwarenessStates(awareness, staleClientIds, 'remote-snapshot')

    remoteAwarenessClientIds.clear()
    for (const clientId of nextRemoteClientIds)
      remoteAwarenessClientIds.add(clientId)
  }

  function bindMarkdownAwareness(doc: Y.Doc): void {
    clearAwarenessBinding()

    const awareness = new Awareness(doc)
    const handleAwarenessUpdate = ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, origin: unknown) => {
      if (origin === 'remote-snapshot' || origin === 'markdown-awareness-bootstrap')
        return

      const changedClientIds = [...added, ...updated, ...removed].filter(clientId => clientId === awareness.clientID)
      if (changedClientIds.length === 0)
        return

      const awarenessUpdate = encodeAwarenessUpdate(awareness, changedClientIds)
      if (awarenessUpdate.length === 0)
        return

      const projectId = normalizeString(input.projectId.value)
      const resourceId = normalizeString(input.resourceId.value)
      if (!projectId || !resourceId)
        return

      input.workspaceRealtime.updatePresence({
        projectId,
        resourceId,
        activityState: resolvePresenceActivityState(),
        awarenessClientId: awareness.clientID,
        awarenessUpdateBase64: encodeBytesToBase64(awarenessUpdate),
      })
    }

    awareness.on('update', handleAwarenessUpdate)
    awarenessDispose = () => {
      awareness.off('update', handleAwarenessUpdate)
    }
    awarenessRef.value = awareness
    remoteAwarenessClientIds.clear()
    syncLocalAwarenessUser()
    syncRemoteAwarenessFromPresenceMembers(presenceMembers.value)
  }

  function clearPresenceCursorTimer(): void {
    if (!presenceCursorTimer)
      return
    clearTimeout(presenceCursorTimer)
    presenceCursorTimer = null
  }

  function flushPresenceCursor(): void {
    clearPresenceCursorTimer()

    const pendingCursor = pendingPresenceCursor
    pendingPresenceCursor = null
    if (!pendingCursor)
      return

    const projectId = normalizeString(input.projectId.value)
    const resourceId = normalizeString(input.resourceId.value)
    if (!projectId || !resourceId)
      return

    input.workspaceRealtime.updatePresence({
      projectId,
      resourceId,
      cursorX: pendingCursor.cursorX,
      cursorY: pendingCursor.cursorY,
      activityState: resolvePresenceActivityState(),
    })
  }

  function updatePresenceCursor(cursorX?: number, cursorY?: number): void {
    pendingPresenceCursor = {
      cursorX: Number.isFinite(Number(cursorX)) ? Number(cursorX) : undefined,
      cursorY: Number.isFinite(Number(cursorY)) ? Number(cursorY) : undefined,
    }
    if (presenceCursorTimer)
      return

    presenceCursorTimer = setTimeout(() => {
      flushPresenceCursor()
    }, 50)
  }

  function syncDraftFromDoc(): void {
    const doc = docRef.value
    if (!doc)
      return

    if (resourceKind.value === 'draw') {
      const nodes = resolveCollabNodesArray(doc).toArray()
      drawValue.value = toDrawModelJson(nodes)
    }
  }

  function clearBatchSendTimer(): void {
    if (!batchSendTimer)
      return
    clearTimeout(batchSendTimer)
    batchSendTimer = null
  }

  function clearMarkdownMirrorSyncTimer(): void {
    if (!markdownMirrorSyncTimer)
      return
    clearTimeout(markdownMirrorSyncTimer)
    markdownMirrorSyncTimer = null
  }

  function flushMarkdownMirrorSync(): void {
    clearMarkdownMirrorSyncTimer()

    if (resourceKind.value !== 'markdown')
      return

    const doc = docRef.value
    if (!doc)
      return

    doc.transact(() => {
      syncMarkdownMirrorFromRichText(doc)
    }, 'markdown-mirror')
  }

  function queueMarkdownMirrorSync(): void {
    clearMarkdownMirrorSyncTimer()
    markdownMirrorSyncTimer = setTimeout(() => {
      flushMarkdownMirrorSync()
    }, 40)
  }

  function flushBatchedUpdates(): void {
    clearBatchSendTimer()

    const projectId = normalizeString(input.projectId.value)
    const resourceId = normalizeString(input.resourceId.value)
    if (!projectId || !resourceId) {
      hasPendingLocalChanges = false
      return
    }

    if (!hasPendingLocalChanges)
      return

    const doc = docRef.value
    hasPendingLocalChanges = false
    if (!doc)
      return

    const currentStateUpdate = Y.encodeStateAsUpdate(doc)
    if (!currentStateUpdate.length)
      return

    input.workspaceRealtime.sendCollabUpdate({
      projectId,
      resourceId,
      revision: revision.value,
      updateBase64: encodeBytesToBase64(currentStateUpdate),
    })
  }

  function queueBatchedUpdate(): void {
    hasPendingLocalChanges = true
    if (batchSendTimer)
      return

    // 批量合并短时间内的高频更新，降低 WS 写入频率。
    batchSendTimer = setTimeout(() => {
      flushBatchedUpdates()
    }, 120)
  }

  function bindDoc(doc: Y.Doc): void {
    if (docDispose)
      docDispose()

    if (resourceKind.value === 'markdown')
      bindMarkdownAwareness(doc)
    else
      clearAwarenessBinding()

    const handleDocUpdate = (_update: Uint8Array, origin: unknown) => {
      if (
        origin === 'remote'
        || origin === 'bootstrap'
        || origin === 'markdown-bootstrap'
        || origin === 'markdown-normalize'
      ) {
        return
      }
      queueBatchedUpdate()
    }

    const nodes = resolveCollabNodesArray(doc)
    const handleNodesChange = () => {
      if (resourceKind.value !== 'draw')
        return
      if (applyingRemote.value)
        return
      drawValue.value = toDrawModelJson(nodes.toArray())
    }

    const richTextFragment = doc.getXmlFragment('prosemirror')
    const handleRichTextChange = () => {
      if (resourceKind.value !== 'markdown')
        return
      if (applyingRemote.value)
        return
      queueMarkdownMirrorSync()
    }

    doc.on('update', handleDocUpdate)
    nodes.observe(handleNodesChange)
    richTextFragment.observeDeep(handleRichTextChange)

    docDispose = () => {
      doc.off('update', handleDocUpdate)
      nodes.unobserve(handleNodesChange)
      richTextFragment.unobserveDeep(handleRichTextChange)
      clearAwarenessBinding()
      doc.destroy()
    }
  }

  function applySnapshot(snapshot: ApplySnapshotInput): void {
    const doc = new Y.Doc()
    const initialUpdate = decodeBase64ToBytes(normalizeString(snapshot.updateBase64))
    if (initialUpdate.length > 0)
      Y.applyUpdate(doc, initialUpdate, 'bootstrap')

    if (snapshot.kind === 'markdown') {
      doc.getText('content')
    }
    else {
      resolveCollabNodesArray(doc)
    }

    docRef.value = doc
    resourceKind.value = snapshot.kind
    revision.value = Math.max(0, Number(snapshot.revision || 0))
    drawError.value = ''
    bindDoc(doc)
    if (snapshot.kind === 'markdown') {
      doc.transact(() => {
        ensureMarkdownCollabDocShape(doc)
      }, 'markdown-bootstrap')
    }
    syncDraftFromDoc()
  }

  function mergeSnapshotIntoCurrentDoc(snapshot: ApplySnapshotInput): boolean {
    const doc = docRef.value
    if (!doc || resourceKind.value !== snapshot.kind)
      return false

    const update = decodeBase64ToBytes(normalizeString(snapshot.updateBase64))
    applyingRemote.value = true
    try {
      if (update.length > 0)
        Y.applyUpdate(doc, update, 'remote')
      if (snapshot.kind === 'markdown') {
        doc.transact(() => {
          ensureMarkdownCollabDocShape(doc)
        }, 'markdown-normalize')
      }
      revision.value = Math.max(revision.value, Math.max(0, Number(snapshot.revision || 0)))
      syncDraftFromDoc()
    }
    finally {
      applyingRemote.value = false
    }

    return true
  }

  async function syncSnapshotIfStale(): Promise<void> {
    if (connected.value)
      return

    const expectedKind = resourceKind.value
    const doc = docRef.value
    const resourceId = normalizeString(input.resourceId.value)
    if (!resourceId || !expectedKind || !doc)
      return

    const snapshot = await input.fetchSnapshot(resourceId)
    if (!snapshot)
      return
    if (snapshot.kind !== expectedKind)
      return
    if (Number(snapshot.revision || 0) <= revision.value)
      return

    mergeSnapshotIntoCurrentDoc(snapshot)
  }

  function clearSnapshotPollTimer(): void {
    if (!snapshotPollTimer)
      return
    clearInterval(snapshotPollTimer)
    snapshotPollTimer = null
  }

  function syncFallbackSnapshotPoller(): void {
    clearSnapshotPollTimer()
    if (connected.value)
      return
    if (!roomKey.value)
      return

    snapshotPollTimer = setInterval(() => {
      void syncSnapshotIfStale()
    }, 5000)
  }

  function activateRoom(): void {
    const projectId = normalizeString(input.projectId.value)
    const resourceId = normalizeString(input.resourceId.value)
    if (!projectId || !resourceId)
      return

    bindVisibilityListener()
    input.workspaceRealtime.subscribeProject(projectId)
    input.workspaceRealtime.joinCollab(projectId, resourceId)
    syncPresenceActivityState()
    syncFallbackSnapshotPoller()
  }

  function dispose(leaveRoom = true): void {
    flushMarkdownMirrorSync()
    flushBatchedUpdates()

    if (docDispose) {
      docDispose()
      docDispose = null
    }

    clearSnapshotPollTimer()
    clearBatchSendTimer()
    clearMarkdownMirrorSyncTimer()
    clearPresenceCursorTimer()
    unbindVisibilityListener()
    hasPendingLocalChanges = false
    pendingPresenceCursor = null

    if (leaveRoom) {
      const projectId = normalizeString(input.projectId.value)
      const resourceId = normalizeString(input.resourceId.value)
      if (projectId && resourceId)
        input.workspaceRealtime.leaveCollab(projectId, resourceId)
    }

    docRef.value = null
    resourceKind.value = ''
    revision.value = 0
    drawValue.value = '{}'
    drawError.value = ''
    presenceMembers.value = []
    applyingRemote.value = false
  }

  function updateDraw(nextValue: string): void {
    drawValue.value = nextValue
    drawError.value = ''
    if (resourceKind.value !== 'draw')
      return

    let parsed: unknown
    try {
      parsed = JSON.parse(nextValue)
    }
    catch {
      drawError.value = '画布状态解析失败，请稍后重试。'
      return
    }

    const normalizedPayload = normalizeDrawPayload(parsed)
    if (!normalizedPayload) {
      drawError.value = '画布状态格式不合法。'
      return
    }

    const doc = docRef.value
    if (!doc)
      return

    const nodes = resolveCollabNodesArray(doc)
    doc.transact(() => {
      nodes.delete(0, nodes.length)
      if (normalizedPayload.length > 0)
        nodes.insert(0, normalizedPayload)
    }, 'local-input')
  }

  function handleRealtimeEnvelope(message: WorkspaceRealtimeEnvelope): boolean {
    const messageType = normalizeString(message.type)
    if (!messageType)
      return false

    if (messageType === 'ack') {
      const payload = message.payload || {}
      const ackType = normalizeString(payload.type)
      if (ackType !== 'collab.update')
        return false

      const projectId = normalizeString(payload.projectId || message.projectId)
      const resourceId = normalizeString(payload.resourceId || message.resourceId)
      if (projectId !== normalizeString(input.projectId.value) || resourceId !== normalizeString(input.resourceId.value))
        return true

      const ackRevision = Math.max(0, Number(payload.revision || message.revision || 0))
      if (ackRevision > 0)
        revision.value = Math.max(revision.value, ackRevision)
      return true
    }

    if (messageType === 'collab.bootstrap') {
      const projectId = normalizeString(message.projectId)
      const resourceId = normalizeString(message.resourceId)
      if (projectId !== normalizeString(input.projectId.value) || resourceId !== normalizeString(input.resourceId.value))
        return true

      const payload = message.payload || {}
      const kind = normalizeString(payload.kind).toLowerCase()
      if (kind !== 'markdown' && kind !== 'draw')
        return true

      const snapshot = {
        kind,
        revision: Math.max(0, Number(message.revision || payload.revision || 0)),
        updateBase64: normalizeString(payload.updateBase64),
        updatedAt: normalizeString(payload.updatedAt),
      } satisfies ApplySnapshotInput

      if (docRef.value) {
        revision.value = Math.max(revision.value, snapshot.revision)
        return true
      }

      applySnapshot(snapshot)
      return true
    }

    if (messageType === 'collab.update') {
      const projectId = normalizeString(message.projectId)
      const resourceId = normalizeString(message.resourceId)
      if (!roomKey.value)
        return true
      if (projectId !== normalizeString(input.projectId.value) || resourceId !== normalizeString(input.resourceId.value))
        return true

      const payload = message.payload || {}
      const updateBase64 = normalizeString(payload.updateBase64)
      if (!updateBase64)
        return true

      const payloadKind = normalizeString(payload.kind).toLowerCase()
      const kind = payloadKind === 'markdown' || payloadKind === 'draw'
        ? payloadKind
        : resourceKind.value

      if (!kind)
        return true

      mergeSnapshotIntoCurrentDoc({
        kind,
        revision: Math.max(0, Number(message.revision || payload.revision || 0)),
        updateBase64,
        updatedAt: normalizeString(payload.updatedAt),
      })
      return true
    }

    if (messageType === 'collab.presence') {
      const payload = message.payload || {}
      const payloadRoomKey = normalizeString(payload.roomKey)
      if (!payloadRoomKey || payloadRoomKey !== roomKey.value)
        return true

      const members = Array.isArray(payload.members) ? payload.members : []
      presenceMembers.value = members.map((item) => {
        const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
        return {
          peerId: normalizeString(record.peerId),
          userId: normalizeString(record.userId),
          username: normalizeString(record.username),
          cursorX: Number.isFinite(Number(record.cursorX)) ? Number(record.cursorX) : undefined,
          cursorY: Number.isFinite(Number(record.cursorY)) ? Number(record.cursorY) : undefined,
          awarenessClientId: Number.isInteger(Number(record.awarenessClientId)) ? Math.trunc(Number(record.awarenessClientId)) : undefined,
          awarenessUpdateBase64: normalizeString(record.awarenessUpdateBase64),
          activityState: normalizeWorkspaceCollabPresenceActivityState(record.activityState),
          updatedAt: normalizeString(record.updatedAt),
        }
      })
      if (resourceKind.value === 'markdown')
        syncRemoteAwarenessFromPresenceMembers(presenceMembers.value)
      return true
    }

    return false
  }

  watch(() => connected.value, () => {
    syncFallbackSnapshotPoller()
    if (roomKey.value && connected.value)
      syncPresenceActivityState()
  })

  watch(() => roomKey.value, () => {
    if (!roomKey.value)
      presenceMembers.value = []
    syncFallbackSnapshotPoller()
  })

  watch([
    () => input.currentUserId.value,
    () => input.currentUsername.value,
  ], () => {
    syncLocalAwarenessUser()
  }, { immediate: true })

  onBeforeUnmount(() => {
    dispose(true)
  })

  return {
    resourceKind,
    revision,
    markdownDoc,
    markdownAwareness,
    drawValue,
    drawError,
    presenceMembers,
    connected,
    statusText,
    roomKey,
    applySnapshot,
    activateRoom,
    dispose,
    updateDraw,
    updatePresenceCursor,
    handleRealtimeEnvelope,
  }
}
