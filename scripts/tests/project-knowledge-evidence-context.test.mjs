import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const EVIDENCE_FILE = resolve(process.cwd(), 'server/services/ai/project-knowledge-evidence-context.ts')
const CONTEXT_FILE = resolve(process.cwd(), 'server/services/ai/project-knowledge-context.ts')
const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const ASSISTANT_MESSAGE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAssistantMessageContent.vue')
const LOOPY_OVERVIEW_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLoopyDataOverviewView.vue')

describe('project knowledge evidence context', () => {
  it('共享协议暴露 bounded evidence path，并继续以 citation 为核心证据', async () => {
    const source = await readFile(DOMAIN_TYPES_FILE, 'utf8')

    assert.match(source, /export interface ProjectKnowledgeEvidencePath \{[\s\S]*relationType: ProjectKnowledgeRelationType[\s\S]*score: number[\s\S]*citationChunkId\?: string/, '共享类型缺少 evidence path 合同')
    assert.match(source, /evidencePaths\?: ProjectKnowledgeEvidencePath\[\]/, 'ProjectKnowledgeMessagePayload 未携带 evidencePaths')
    assert.match(source, /citations: ProjectKnowledgeCitation\[\]/, 'ProjectKnowledgeMessagePayload 不应移除 citations')
  })

  it('evidence context 复用 relations、node detail 与 semantic layout，不新增独立数据层', async () => {
    const source = await readFile(EVIDENCE_FILE, 'utf8')

    assert.match(source, /buildProjectKnowledgeNodeDetail/, 'evidence context 未复用 node-detail')
    assert.match(source, /buildProjectKnowledgeRelationsPayload/, 'evidence context 未复用 relations payload')
    assert.match(source, /buildProjectKnowledgeSemanticLayoutPayload/, 'evidence context 未复用 semantic layout payload')
    assert.match(source, /relationType === 'belongs_to'/, 'evidence context 未提取 chunk -> source 证据链')
    assert.match(source, /relationType === 'similar_to' \|\| relation\.relationType === 'aligned_to'/, 'evidence context 未提取 similar/aligned 证据链')
    assert.match(source, /relationType === 'duplicated_with' \|\| relation\.relationType === 'references'/, 'evidence context 未提取 source 级证据链')
    assert.match(source, /\.slice\(0, 5\)/, 'global summary 语义 cluster 摘要未限制为最多 5 个')
  })

  it('knowledge context 对证据链和全局总结意图接入结构化 evidence summary', async () => {
    const source = await readFile(CONTEXT_FILE, 'utf8')

    assert.match(source, /buildProjectKnowledgeEvidenceContext/, 'knowledge context 未接入 evidence context')
    assert.match(source, /shouldAttachEvidenceContext/, 'knowledge context 未按 intent 决定是否补证据链')
    assert.match(source, /结构化证据路径/, 'knowledge context summary 未输出结构化证据路径')
    assert.match(source, /语义主题摘要/, 'knowledge context summary 未输出语义主题摘要')
  })

  it('assistant 引用折叠区展示检索路径，Loopy Data 主视图只补状态提示', async () => {
    const [assistantSource, overviewSource] = await Promise.all([
      readFile(ASSISTANT_MESSAGE_FILE, 'utf8'),
      readFile(LOOPY_OVERVIEW_FILE, 'utf8'),
    ])

    assert.match(assistantSource, /normalizeRetrievalPlan/, 'assistant message 未归一化 retrievalPlan')
    assert.match(assistantSource, /normalizeEvidencePaths/, 'assistant message 未归一化 evidencePaths')
    assert.match(assistantSource, /workspace-assistant-knowledge-paths/, 'assistant message 未渲染检索路径小节')
    assert.match(assistantSource, /检索路径/, 'assistant message 缺少检索路径标题')
    assert.match(overviewSource, /AI 检索策略已接入/, 'Loopy Data overview 缺少 AI 检索策略接入提示')
  })
})
