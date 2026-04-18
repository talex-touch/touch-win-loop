import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const WORKSPACE_CHAT_LOCAL_STATE_FILE = resolve(process.cwd(), 'shared/utils/workspace-chat-local-state.ts')

it('toWorkspaceModelMessages 会忽略 system 与 localOnly 临时消息', async () => {
  const {
    createWorkspaceLocalChatMessage,
    toWorkspaceModelMessages,
  } = await import(pathToFileURL(WORKSPACE_CHAT_LOCAL_STATE_FILE).href)

  const localUserMessage = createWorkspaceLocalChatMessage({
    role: 'user',
    content: '这条不该进入下一轮',
    localRequestId: 'req-local',
    streamState: 'streaming',
  })

  const result = toWorkspaceModelMessages([
    { role: 'system', content: '进度：整理上下文' },
    { role: 'user', content: '保留历史用户消息' },
    { role: 'assistant', content: '保留历史助手消息' },
    localUserMessage,
  ])

  assert.deepEqual(result, [
    { role: 'user', content: '保留历史用户消息' },
    { role: 'assistant', content: '保留历史助手消息' },
  ])
})

it('工作台本地消息在 done 后会清除 localOnly 标记，并保留业务 metadata', async () => {
  const {
    createWorkspaceLocalChatMessage,
    finalizeWorkspaceLocalChatMessages,
    markWorkspaceLocalChatMessagesAborted,
  } = await import(pathToFileURL(WORKSPACE_CHAT_LOCAL_STATE_FILE).href)

  const draft = {
    action: 'rewrite',
    title: 'AgentDoc 草案',
    summary: '补充摘要',
    resourceId: 'res-1',
    resourceTitle: '方案文档',
    selectionText: '原文',
    selectionRange: null,
    applyMode: 'replace_selection',
    baseDocumentHash: 'hash-1',
    originalText: '原文',
    proposedText: '新文',
  }

  const messages = [
    createWorkspaceLocalChatMessage({
      role: 'user',
      content: '请优化这段内容',
      localRequestId: 'req-1',
      streamState: 'streaming',
    }),
    createWorkspaceLocalChatMessage({
      role: 'assistant',
      content: '这是半截回答',
      localRequestId: 'req-1',
      streamState: 'streaming',
      metadata: {
        agentDocDraft: draft,
      },
    }),
  ]

  const aborted = markWorkspaceLocalChatMessagesAborted(messages, 'req-1')
  assert.equal(aborted[0].metadata.streamState, 'aborted')
  assert.equal(aborted[1].metadata.localOnly, true)
  assert.equal(aborted[1].metadata.localRequestId, 'req-1')

  const finalized = finalizeWorkspaceLocalChatMessages(aborted, 'req-1')
  assert.equal(finalized[0].metadata, undefined)
  assert.deepEqual(finalized[1].metadata, {
    agentDocDraft: draft,
  })
})
