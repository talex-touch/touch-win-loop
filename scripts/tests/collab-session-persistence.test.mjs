import assert from 'node:assert/strict'
import { afterEach, beforeEach, it, vi } from 'vitest'
import { ref } from 'vue'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { useCollabSession } from '../../app/composables/useCollabSession.ts'
import { ensureMarkdownCollabDocShape, readMarkdownFromRichText, writeRichTextBlocksToFragment } from '../../shared/utils/collab-markdown-rich-text.ts'

function resolveBufferLike() {
  const candidate = Reflect.get(globalThis, 'Buffer')
  if (!candidate || typeof candidate.from !== 'function')
    throw new Error('Buffer 不可用')
  return candidate
}

function encodeUpdate(doc) {
  return resolveBufferLike().from(Y.encodeStateAsUpdate(doc)).toString('base64')
}

function createMarkdownSnapshot(markdown = '初始内容') {
  const doc = new Y.Doc()
  if (markdown)
    doc.getText('content').insert(0, markdown)
  ensureMarkdownCollabDocShape(doc)
  return {
    kind: 'markdown',
    revision: 1,
    updateBase64: encodeUpdate(doc),
    updatedAt: new Date().toISOString(),
  }
}

function createSession(sendCollabUpdate = () => {}) {
  return useCollabSession({
    workspaceRealtime: {
      connected: ref(true),
      sendCollabUpdate,
      updatePresence: () => {},
      subscribeProject: () => {},
      joinCollab: () => {},
      leaveCollab: () => {},
    },
    projectId: ref('project-1'),
    resourceId: ref('resource-1'),
    currentUserId: ref('user-1'),
    currentUsername: ref('我'),
    statusLine: ref(''),
    fetchSnapshot: async () => null,
  })
}

function writeParagraph(doc, text) {
  doc.transact(() => {
    writeRichTextBlocksToFragment(doc.getXmlFragment('prosemirror'), [
      { type: 'paragraph', text },
    ])
  }, 'local-edit')
}

function applySnapshotUpdate(base64) {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array(resolveBufferLike().from(base64, 'base64')))
  return doc
}

let warnSpy

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy?.mockRestore()
})

it('销毁协作会话前会强制冲刷待发送增量，避免刚输入就切走时丢内容', () => {
  const sentUpdates = []
  const session = createSession((payload) => {
    sentUpdates.push(payload)
  })
  const snapshot = createMarkdownSnapshot()

  session.applySnapshot(snapshot)

  const doc = session.markdownDoc.value
  assert.ok(doc, '协作文档未初始化')
  writeParagraph(doc, '123')

  session.dispose(true)

  assert.equal(sentUpdates.length, 1, '销毁前未冲刷协作更新')
  assert.ok(sentUpdates[0].updateBase64, '冲刷出的协作增量为空')

  const replayDoc = applySnapshotUpdate(snapshot.updateBase64)
  Y.applyUpdate(replayDoc, new Uint8Array(resolveBufferLike().from(sentUpdates[0].updateBase64, 'base64')))
  assert.equal(readMarkdownFromRichText(replayDoc), '123', '发送给服务端的 payload 不能在另一份文档中重放出最新内容')
})

it('bootstrap 回包会合并到当前文档，而不是覆盖本地未确认编辑', () => {
  const session = createSession()
  const snapshot = createMarkdownSnapshot()

  session.applySnapshot(snapshot)

  const doc = session.markdownDoc.value
  assert.ok(doc, '协作文档未初始化')
  writeParagraph(doc, '123')

  const handled = session.handleRealtimeEnvelope({
    type: 'collab.bootstrap',
    projectId: 'project-1',
    resourceId: 'resource-1',
    revision: 1,
    payload: {
      kind: 'markdown',
      updateBase64: snapshot.updateBase64,
      updatedAt: snapshot.updatedAt,
    },
  })

  assert.equal(handled, true, 'bootstrap 消息未被协作会话处理')
  assert.equal(session.markdownDoc.value, doc, 'bootstrap 不应替换当前 Y.Doc 实例')
  assert.equal(readMarkdownFromRichText(doc), '123')
})

it('presence 快照会应用并清理远端 awareness 状态', () => {
  const session = createSession()
  const snapshot = createMarkdownSnapshot('hello world')

  session.applySnapshot(snapshot)

  const awareness = session.markdownAwareness.value
  assert.ok(awareness, 'markdown Awareness 未初始化')

  const remoteDoc = new Y.Doc()
  Y.applyUpdate(remoteDoc, new Uint8Array(resolveBufferLike().from(snapshot.updateBase64, 'base64')))
  const remoteAwareness = new Awareness(remoteDoc)
  remoteAwareness.setLocalState({
    user: {
      id: 'user-2',
      userId: 'user-2',
      name: '协作者',
      color: '#2563eb',
    },
    cursor: {
      anchor: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
      head: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
    },
  })

  const remoteUpdateBase64 = resolveBufferLike()
    .from(encodeAwarenessUpdate(remoteAwareness, [remoteAwareness.clientID]))
    .toString('base64')

  const roomKey = session.roomKey.value
  assert.equal(roomKey, 'project-1:resource-1')

  session.handleRealtimeEnvelope({
    type: 'collab.presence',
    payload: {
      roomKey,
      members: [{
        peerId: 'peer-2',
        userId: 'user-2',
        username: '协作者',
        awarenessClientId: remoteAwareness.clientID,
        awarenessUpdateBase64: remoteUpdateBase64,
        activityState: 'active',
        updatedAt: new Date().toISOString(),
      }],
    },
  })

  assert.equal(session.presenceMembers.value.length, 1, 'presence 成员未更新')
  assert.ok(awareness.getStates().has(remoteAwareness.clientID), '远端 awareness 状态未写入本地')

  session.handleRealtimeEnvelope({
    type: 'collab.presence',
    payload: {
      roomKey,
      members: [],
    },
  })

  assert.equal(session.presenceMembers.value.length, 0, '离线成员未从 presence 列表移除')
  assert.equal(awareness.getStates().has(remoteAwareness.clientID), false, '离线成员 awareness 状态未清理')
})
