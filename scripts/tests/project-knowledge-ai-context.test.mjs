import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const CANVAS_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/canvas/stream.post.ts')
const TOPIC_PROPOSAL_SERVICE_FILE = resolve(process.cwd(), 'server/services/ai/topic-proposal-service.ts')
const TOPIC_PROPOSAL_CHAIN_FILE = resolve(process.cwd(), 'server/services/ai/topic-proposal-chain.ts')

describe('project knowledge ai context', () => {
  it('canvas 与 topic proposal 改走项目知识检索上下文', async () => {
    const [canvasSource, topicServiceSource] = await Promise.all([
      readFile(CANVAS_STREAM_FILE, 'utf8'),
      readFile(TOPIC_PROPOSAL_SERVICE_FILE, 'utf8'),
    ])

    assert.match(canvasSource, /buildProjectKnowledgeLocalContext/, 'canvas stream 未接入项目知识检索上下文')
    assert.doesNotMatch(canvasSource, /buildProjectResourceLocalContext/, 'canvas stream 仍在使用旧的项目资源摘要上下文')
    assert.match(topicServiceSource, /buildProjectKnowledgeLocalContext/, 'topic proposal service 未接入项目知识检索上下文')
    assert.doesNotMatch(topicServiceSource, /buildProjectResourceLocalContext/, 'topic proposal service 仍在使用旧的项目资源摘要上下文')
    assert.match(topicServiceSource, /effectiveUserMessage/, 'topic proposal service 未使用有效用户问题作为知识检索查询')
  })

  it('topic proposal prompt 强制保留索引提示与资料引用标签', async () => {
    const source = await readFile(TOPIC_PROPOSAL_CHAIN_FILE, 'utf8')

    assert.match(source, /方括号资料标签/, 'topic proposal chain 未要求保留资料引用标签')
    assert.match(source, /索引未完成，结果可能不完整/, 'topic proposal chain 未要求保留索引未完成提示')
  })
})
