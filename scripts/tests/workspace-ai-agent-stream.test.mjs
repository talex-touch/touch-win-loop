import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const WORKSPACE_ORCHESTRATOR_FILE = resolve(process.cwd(), 'server/services/ai/workspace-orchestrator.ts')

function toAsyncIterable(items) {
  return {
    async* [Symbol.asyncIterator]() {
      for (const item of items)
        yield item
    },
  }
}

it('工作台 agent stream 只把可见文本 chunk 透传为 delta，并忽略纯 tool-call chunk', async () => {
  const {
    consumeWorkspaceAgentStream,
    extractWorkspaceStreamTextChunk,
  } = await import(pathToFileURL(WORKSPACE_ORCHESTRATOR_FILE).href)

  assert.equal(extractWorkspaceStreamTextChunk({
    content: '',
    tool_calls: [{ name: 'get_workspace_context' }],
  }), '')

  const deltaChunks = []
  const documentDraft = {
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

  const result = await consumeWorkspaceAgentStream({
    stream: toAsyncIterable([
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            content: '你',
          },
        },
      },
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            content: '',
            tool_calls: [{ name: 'get_workspace_context' }],
          },
        },
      },
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            content: '好',
          },
        },
      },
      {
        event: 'on_chain_end',
        name: 'LangGraph',
        data: {
          output: {
            messages: [
              {
                role: 'assistant',
                content: '你好，世界',
              },
            ],
          },
        },
      },
    ]),
    profile: {
      mode: 'document_assist',
    },
    state: {
      changeDrafts: [],
      issueDrafts: [],
      issueFingerprints: new Set(),
      reportTitle: '',
      reportSummary: '',
      documentDraft,
    },
    hooks: {
      onDelta: text => deltaChunks.push(text),
    },
  })

  assert.deepEqual(deltaChunks, ['你', '好'])
  assert.equal(result.assistantReply, '你好，世界')
  assert.deepEqual(result.documentDraft, documentDraft)
})

it('工作台 agent stream 在缺少 LangGraph 收尾时，会回退到已流出的正文，同时保留提案结果', async () => {
  const { consumeWorkspaceAgentStream } = await import(pathToFileURL(WORKSPACE_ORCHESTRATOR_FILE).href)

  const result = await consumeWorkspaceAgentStream({
    stream: toAsyncIterable([
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            content: '已生成可审批提案。',
          },
        },
      },
    ]),
    profile: {
      mode: 'auto_optimize',
      maxProposals: 5,
    },
    state: {
      changeDrafts: [
        {
          changeType: 'settings_common_patch',
          title: '补齐摘要',
          summary: '补齐项目摘要字段',
          destructive: false,
          payload: {
            summary: '新的摘要',
          },
        },
      ],
      issueDrafts: [],
      issueFingerprints: new Set(),
      reportTitle: '',
      reportSummary: '',
      documentDraft: null,
    },
    hooks: {},
  })

  assert.equal(result.assistantReply, '已生成可审批提案。')
  assert.equal(result.changeDrafts.length, 1)
  assert.equal(result.changeDrafts[0].changeType, 'settings_common_patch')
})
