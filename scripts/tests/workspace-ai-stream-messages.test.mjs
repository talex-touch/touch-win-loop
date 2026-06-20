import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const WORKSPACE_AI_STREAM_UTIL_FILE = resolve(process.cwd(), 'shared/utils/workspace-ai-stream.ts')

it('工作区流式 progress/tool 事件会生成统一的 system 消息与 metadata', async () => {
  const {
    createWorkspaceStreamSystemChatMessage,
    resolveWorkspaceStreamSystemMessageView,
  } = await import(pathToFileURL(WORKSPACE_AI_STREAM_UTIL_FILE).href)

  const progressMessage = createWorkspaceStreamSystemChatMessage('progress', {
    message: '已建立会话并开始整理上下文。',
  }, 1)
  const toolMessage = createWorkspaceStreamSystemChatMessage('tool', {
    name: 'fetch_resource_context',
    payload: {
      resourceId: 'res-1',
      resourceTitle: '设计说明',
    },
  }, 2)

  assert.deepEqual(progressMessage, {
    role: 'system',
    content: '进度：已建立会话并开始整理上下文。',
    metadata: {
      eventType: 'progress',
      seq: 1,
    },
  })
  assert.equal(toolMessage.role, 'system')
  assert.match(toolMessage.content, /^工具：fetch_resource_context · /)
  assert.deepEqual(toolMessage.metadata, {
    eventType: 'tool',
    seq: 2,
    toolName: 'fetch_resource_context',
    payloadSummary: '{"resourceId":"res-1","resourceTitle":"设计说明"}',
  })

  const progressView = resolveWorkspaceStreamSystemMessageView(progressMessage)
  const toolView = resolveWorkspaceStreamSystemMessageView(toolMessage)
  assert.deepEqual(progressView, {
    eventType: 'progress',
    seq: 1,
    title: '已建立会话并开始整理上下文。',
    toolName: '',
    payloadSummary: '',
  })
  assert.deepEqual(toolView, {
    eventType: 'tool',
    seq: 2,
    title: '调用 fetch_resource_context',
    toolName: 'fetch_resource_context',
    payloadSummary: '{"resourceId":"res-1","resourceTitle":"设计说明"}',
  })
})

it('工作区流式 system 消息在缺少 metadata 时也能从历史内容回放出展示信息', async () => {
  const { resolveWorkspaceStreamSystemMessageView } = await import(pathToFileURL(WORKSPACE_AI_STREAM_UTIL_FILE).href)

  const legacyToolView = resolveWorkspaceStreamSystemMessageView({
    role: 'system',
    content: '工具：search_web · {"query":"竞赛规则"}',
    metadata: {},
  })
  const legacyProgressView = resolveWorkspaceStreamSystemMessageView({
    role: 'system',
    content: '进度：正在汇总上下文',
    metadata: null,
  })

  assert.deepEqual(legacyToolView, {
    eventType: 'tool',
    seq: 0,
    title: '调用 search_web',
    toolName: 'search_web',
    payloadSummary: '{"query":"竞赛规则"}',
  })
  assert.deepEqual(legacyProgressView, {
    eventType: 'progress',
    seq: 0,
    title: '正在汇总上下文',
    toolName: '',
    payloadSummary: '',
  })
})
