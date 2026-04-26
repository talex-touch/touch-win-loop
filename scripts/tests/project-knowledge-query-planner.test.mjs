import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const PLANNER_FILE = resolve(process.cwd(), 'server/services/ai/project-knowledge-query-planner.ts')
const CONTEXT_FILE = resolve(process.cwd(), 'server/services/ai/project-knowledge-context.ts')
const CHANNELS_FILE = resolve(process.cwd(), 'server/utils/platform-ai-channels.ts')
const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const WORKSPACE_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/workspace/stream.post.ts')
const PROJECT_CHAT_FILE = resolve(process.cwd(), 'server/api/ai/project-chat.post.ts')
const CANVAS_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/canvas/stream.post.ts')

describe('project knowledge query planner', () => {
  it('注册 knowledge_query_planner chat channel 与 retrieval plan 类型', async () => {
    const [channelsSource, typesSource] = await Promise.all([
      readFile(CHANNELS_FILE, 'utf8'),
      readFile(DOMAIN_TYPES_FILE, 'utf8'),
    ])

    assert.match(channelsSource, /\| 'knowledge_query_planner'/, '平台 AI channel key 缺少 knowledge_query_planner')
    assert.match(channelsSource, /key: 'knowledge_query_planner'[\s\S]*知识检索规划/, '平台 AI channel definitions 缺少知识检索规划场景')
    assert.match(typesSource, /export type ProjectKnowledgeRetrievalIntent[\s\S]*direct_answer[\s\S]*evidence_trace[\s\S]*global_summary[\s\S]*relation_explore[\s\S]*visual_lookup[\s\S]*meeting_lookup/, '共享类型缺少 retrieval intent')
    assert.match(typesSource, /export interface ProjectKnowledgeRetrievalPlan \{[\s\S]*queryVariants: string\[\][\s\S]*preferredModalities: ProjectKnowledgeRetrievalModalityFilter\[\][\s\S]*relationTypes: ProjectKnowledgeRelationType\[\][\s\S]*plannerSource: ProjectKnowledgeRetrievalPlannerSource/, '共享类型缺少 retrieval plan 合同')
    assert.match(typesSource, /retrievalPlan\?: ProjectKnowledgeRetrievalPlan \| null/, 'ProjectKnowledgeMessagePayload 未携带 retrievalPlan')
  })

  it('planner 提供 LLM structured output，并在不可用时回退启发式计划', async () => {
    const source = await readFile(PLANNER_FILE, 'utf8')

    assert.match(source, /const retrievalPlanSchema = z\.object\(/, 'planner 未定义 zod structured output schema')
    assert.match(source, /runWithPlatformAiChannelFallback\(input\.runtime, 'knowledge_query_planner'/, 'planner 未走 knowledge_query_planner channel')
    assert.match(source, /buildHeuristicProjectKnowledgeRetrievalPlan/, 'planner 缺少启发式 fallback')
    assert.match(source, /plannerSource: 'heuristic'/, '启发式计划未标记 plannerSource')
    assert.match(source, /plannerSource: 'fallback'/, 'planner 异常回退未标记 fallback')
    assert.match(source, /VISUAL_QUERY_HINTS[\s\S]*截图[\s\S]*图片/, 'planner 缺少视觉意图提示词')
    assert.match(source, /MEETING_QUERY_HINTS[\s\S]*会议[\s\S]*转写/, 'planner 缺少会议意图提示词')
    assert.match(source, /RELATION_QUERY_HINTS[\s\S]*关系[\s\S]*证据[\s\S]*来源链/, 'planner 缺少关系与证据链意图提示词')
    assert.match(source, /GLOBAL_QUERY_HINTS[\s\S]*全局[\s\S]*主题/, 'planner 缺少全局总结意图提示词')
  })

  it('knowledge context 先生成 retrieval plan，再按 queryVariants 执行检索', async () => {
    const source = await readFile(CONTEXT_FILE, 'utf8')

    assert.match(source, /buildProjectKnowledgeRetrievalPlan/, 'knowledge context 未接入 retrieval planner')
    assert.match(source, /retrievalPlan\.queryVariants/, 'knowledge context 未消费 queryVariants')
    assert.match(source, /matchesRetrievalPlanFilters/, 'knowledge context 未按 retrieval plan 过滤 chunk')
    assert.match(source, /queryEmbeddingResultsByVariant/, 'knowledge context 未为多个 query variant 建立 embedding 结果')
    assert.match(source, /retrievalPlan,[\s\S]*evidencePaths/, 'knowledge context 返回值未包含 retrievalPlan 与 evidencePaths')
  })

  it('workspace/project-chat/canvas 继续透传扩展后的 knowledge metadata', async () => {
    const [workspaceSource, projectChatSource, canvasSource] = await Promise.all([
      readFile(WORKSPACE_STREAM_FILE, 'utf8'),
      readFile(PROJECT_CHAT_FILE, 'utf8'),
      readFile(CANVAS_STREAM_FILE, 'utf8'),
    ])

    assert.match(workspaceSource, /retrievalPlan: knowledgeContext\.retrievalPlan/, 'workspace stream 未透传 retrievalPlan')
    assert.match(workspaceSource, /evidencePaths: knowledgeContext\.evidencePaths/, 'workspace stream 未透传 evidencePaths')
    assert.match(projectChatSource, /retrievalPlan: knowledgeContext\.retrievalPlan/, 'project chat 未透传 retrievalPlan')
    assert.match(projectChatSource, /evidencePaths: knowledgeContext\.evidencePaths/, 'project chat 未透传 evidencePaths')
    assert.match(canvasSource, /retrievalPlan: knowledgeContext\.retrievalPlan/, 'canvas stream 未透传 retrievalPlan')
    assert.match(canvasSource, /evidencePaths: knowledgeContext\.evidencePaths/, 'canvas stream 未透传 evidencePaths')
  })
})
