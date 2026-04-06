import type { Ref } from 'vue'
import type { useWorkspaceRealtime } from '~/composables/useWorkspaceRealtime'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as Y from 'yjs'
import {
  ensureMarkdownCollabDocShape,
  syncMarkdownMirrorFromRichText,
} from '~~/shared/utils/collab-markdown-rich-text'

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

export interface WorkspaceCollabPresenceMember {
  peerId: string
  userId: string
  username: string
  cursorX?: number
  cursorY?: number
  updatedAt?: string
}

interface UseCollabSessionInput {
  workspaceRealtime: ReturnType<typeof useWorkspaceRealtime>
  projectId: Ref<string>
  resourceId: Ref<string>
  statusLine: Ref<string>
  fetchSnapshot: (resourceId: string) => Promise<CollabSnapshotPayload | null>
}

interface ApplySnapshotInput {
  kind: 'markdown' | 'draw'
  revision?: number
  updateBase64?: string
  updatedAt?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (!bytes.length || !import.meta.client)
    return ''

  let binary = ''
  for (const value of bytes)
    binary += String.fromCharCode(value)
  return window.btoa(binary)
}

function decodeBase64ToBytes(rawBase64: string): Uint8Array {
  const normalized = normalizeString(rawBase64)
  if (!normalized || !import.meta.client)
    return new Uint8Array()

  try {
    const binary = window.atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1)
      bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  catch {
    return new Uint8Array()
  }
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
  const markdownDoc = computed(() => {
    if (resourceKind.value !== 'markdown')
      return null
    return docRef.value
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
  let pendingUpdates: Uint8Array[] = []

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
      pendingUpdates = []
      return
    }

    if (pendingUpdates.length === 0)
      return

    const merged = pendingUpdates.length === 1
      ? pendingUpdates[0] || new Uint8Array()
      : Y.mergeUpdates(pendingUpdates)
    pendingUpdates = []

    if (!merged.length)
      return

    input.workspaceRealtime.sendCollabUpdate({
      projectId,
      resourceId,
      revision: revision.value,
      updateBase64: encodeBytesToBase64(merged),
    })
  }

  function queueBatchedUpdate(update: Uint8Array): void {
    if (!update.length)
      return

    pendingUpdates.push(update)
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

    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || origin === 'bootstrap')
        return
      queueBatchedUpdate(update)
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

    const update = decodeBase64ToBytes(snapshot.updateBase64)
    if (!update.length)
      return

    applyingRemote.value = true
    try {
      Y.applyUpdate(doc, update, 'remote')
      revision.value = Math.max(revision.value, Math.max(0, Number(snapshot.revision || 0)))
      syncDraftFromDoc()
    }
    finally {
      applyingRemote.value = false
    }
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

    input.workspaceRealtime.subscribeProject(projectId)
    input.workspaceRealtime.joinCollab(projectId, resourceId)
    syncFallbackSnapshotPoller()
  }

  function dispose(leaveRoom = true): void {
    if (docDispose) {
      docDispose()
      docDispose = null
    }

    clearSnapshotPollTimer()
    clearBatchSendTimer()
    clearMarkdownMirrorSyncTimer()
    pendingUpdates = []

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

      applySnapshot({
        kind,
        revision: Math.max(0, Number(message.revision || payload.revision || 0)),
        updateBase64: normalizeString(payload.updateBase64),
        updatedAt: normalizeString(payload.updatedAt),
      })
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

      const doc = docRef.value
      if (!doc)
        return true

      const update = decodeBase64ToBytes(updateBase64)
      if (!update.length)
        return true

      applyingRemote.value = true
      try {
        Y.applyUpdate(doc, update, 'remote')
        if (resourceKind.value === 'markdown') {
          doc.transact(() => {
            ensureMarkdownCollabDocShape(doc)
          }, 'markdown-normalize')
        }
        revision.value = Math.max(revision.value, Math.max(0, Number(message.revision || 0)))
        syncDraftFromDoc()
      }
      finally {
        applyingRemote.value = false
      }
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
          updatedAt: normalizeString(record.updatedAt),
        }
      })
      return true
    }

    return false
  }

  watch(() => connected.value, () => {
    syncFallbackSnapshotPoller()
  })

  watch(() => roomKey.value, () => {
    if (!roomKey.value)
      presenceMembers.value = []
    syncFallbackSnapshotPoller()
  })

  onBeforeUnmount(() => {
    dispose(true)
  })

  return {
    resourceKind,
    revision,
    markdownDoc,
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
    handleRealtimeEnvelope,
  }
}
