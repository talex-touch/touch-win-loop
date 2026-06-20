import type { H3Event } from 'h3'
import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeProjectionType,
  ProjectKnowledgeRelationType,
  ProjectKnowledgeRetrievalIntent,
  ProjectKnowledgeRetrievalModalityFilter,
  ProjectKnowledgeRetrievalPlan,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'

export const VISUAL_QUERY_HINTS = ['截图', '界面', '海报', '页面', '版式', '图里', '这张图', '图片', '视觉', '布局', '封面', '图表']
export const MEETING_QUERY_HINTS = ['会议', '讨论', '老师说', '刚才提到', '刚刚提到', '会上', '纪要', '转写', '录音', '录屏']
export const RELATION_QUERY_HINTS = ['关系', '关联', '证据', '依据', '来源链', '引用链', '为什么相关', '相似', '重复', '从哪来']
export const GLOBAL_QUERY_HINTS = ['全局', '整体', '总览', '主题', '聚类', '有哪些', '分布', '概览', '总结一下']

const retrievalIntentSchema = z.enum([
  'direct_answer',
  'evidence_trace',
  'global_summary',
  'relation_explore',
  'visual_lookup',
  'meeting_lookup',
])

const modalitySchema = z.enum(['text', 'image', 'audio', 'video', 'draw', 'unknown'])
const projectionTypeSchema = z.enum([
  'document_text',
  'markdown_text',
  'draw_projection',
  'resource_summary',
  'image_summary',
  'image_ocr',
  'meeting_notes',
  'meeting_transcript',
])
const embeddingStatusSchema = z.enum(['native', 'derived', 'fallback', 'missing', 'failed'])
const relationTypeSchema = z.enum(['belongs_to', 'derived_from', 'similar_to', 'aligned_to', 'references', 'duplicated_with'])

const retrievalPlanSchema = z.object({
  intent: retrievalIntentSchema.default('direct_answer'),
  queryVariants: z.array(z.string()).default([]),
  preferredModalities: z.array(modalitySchema).default([]),
  preferredProjectionTypes: z.array(projectionTypeSchema).default([]),
  preferredEmbeddingStatuses: z.array(embeddingStatusSchema).default([]),
  relationTypes: z.array(relationTypeSchema).default([]),
  retrievalBudget: z.number().min(3).max(12).default(6),
  reasoning: z.string().default(''),
})

interface BuildProjectKnowledgeRetrievalPlanInput {
  runtime: RuntimeSettings
  event?: H3Event
  query: string
  limit?: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function includesAny(query: string, hints: string[]): boolean {
  const normalized = query.toLowerCase()
  return hints.some(hint => normalized.includes(hint.toLowerCase()))
}

function dedupeStrings(values: string[], limit: number): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeString(value)
    if (!normalized || seen.has(normalized))
      continue
    result.push(normalized)
    seen.add(normalized)
    if (result.length >= limit)
      break
  }
  return result
}

function normalizeBudget(value: unknown, fallback: number): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return fallback
  return Math.max(3, Math.min(12, Math.round(normalized)))
}

function normalizeIntent(value: unknown): ProjectKnowledgeRetrievalIntent {
  const normalized = normalizeString(value)
  if (
    normalized === 'direct_answer'
    || normalized === 'evidence_trace'
    || normalized === 'global_summary'
    || normalized === 'relation_explore'
    || normalized === 'visual_lookup'
    || normalized === 'meeting_lookup'
  ) {
    return normalized
  }
  return 'direct_answer'
}

function normalizeModalities(values: unknown): ProjectKnowledgeRetrievalModalityFilter[] {
  if (!Array.isArray(values))
    return []
  return values.filter((item): item is ProjectKnowledgeRetrievalModalityFilter => {
    return item === 'text' || item === 'image' || item === 'audio' || item === 'video' || item === 'draw' || item === 'unknown'
  })
}

function normalizeProjectionTypes(values: unknown): ProjectKnowledgeProjectionType[] {
  if (!Array.isArray(values))
    return []
  return values.filter((item): item is ProjectKnowledgeProjectionType => {
    return item === 'document_text'
      || item === 'markdown_text'
      || item === 'draw_projection'
      || item === 'resource_summary'
      || item === 'image_summary'
      || item === 'image_ocr'
      || item === 'meeting_notes'
      || item === 'meeting_transcript'
  })
}

function normalizeEmbeddingStatuses(values: unknown): ProjectKnowledgeEmbeddingStatus[] {
  if (!Array.isArray(values))
    return []
  return values.filter((item): item is ProjectKnowledgeEmbeddingStatus => {
    return item === 'native' || item === 'derived' || item === 'fallback' || item === 'missing' || item === 'failed'
  })
}

function normalizeRelationTypes(values: unknown): ProjectKnowledgeRelationType[] {
  if (!Array.isArray(values))
    return []
  return values.filter((item): item is ProjectKnowledgeRelationType => {
    return item === 'belongs_to'
      || item === 'derived_from'
      || item === 'similar_to'
      || item === 'aligned_to'
      || item === 'references'
      || item === 'duplicated_with'
  })
}

function normalizePlan(
  raw: z.infer<typeof retrievalPlanSchema>,
  input: BuildProjectKnowledgeRetrievalPlanInput,
  plannerSource: ProjectKnowledgeRetrievalPlan['plannerSource'],
): ProjectKnowledgeRetrievalPlan {
  const query = normalizeString(input.query)
  return {
    intent: normalizeIntent(raw.intent),
    queryVariants: dedupeStrings([query, ...(raw.queryVariants || [])], 4),
    preferredModalities: normalizeModalities(raw.preferredModalities),
    preferredProjectionTypes: normalizeProjectionTypes(raw.preferredProjectionTypes),
    preferredEmbeddingStatuses: normalizeEmbeddingStatuses(raw.preferredEmbeddingStatuses),
    relationTypes: normalizeRelationTypes(raw.relationTypes),
    retrievalBudget: normalizeBudget(raw.retrievalBudget, input.limit || 6),
    plannerSource,
    reasoning: normalizeString(raw.reasoning),
  }
}

function buildPlannerSystemPrompt(channelPrompt: string): string {
  return [
    '你是项目知识检索规划器。请只规划检索策略，不回答用户问题。',
    '优先选择最少但足够的 queryVariants、模态、投影类型和关系类型。',
    '如果问题要求来源、依据、关系、重复或证据链，intent 设为 evidence_trace 或 relation_explore。',
    '如果问题要求全局主题、整体分布或项目总览，intent 设为 global_summary。',
    '如果问题指向截图、图片、界面或版式，intent 设为 visual_lookup。',
    '如果问题指向会议、老师说、录音、转写或纪要，intent 设为 meeting_lookup。',
    channelPrompt ? `[场景提示词]\n${channelPrompt}` : '',
  ].filter(Boolean).join('\n\n')
}

async function runLlmPlanner(
  input: BuildProjectKnowledgeRetrievalPlanInput,
  ai: AiRuntimeConfig,
  channelPrompt: string,
): Promise<z.infer<typeof retrievalPlanSchema>> {
  const model = createChatModel({
    ...ai,
    temperature: 0,
    maxRetries: Math.min(1, Math.max(0, Number(ai.maxRetries || 0))),
  })
  const structuredModel = model.withStructuredOutput(retrievalPlanSchema, {
    name: 'ProjectKnowledgeRetrievalPlan',
    strict: false,
  })
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', buildPlannerSystemPrompt(channelPrompt)],
    ['human', [
      '用户问题：{query}',
      '默认召回预算：{limit}',
      '请输出结构化检索计划。',
    ].join('\n')],
  ])
  const promptValue = await prompt.invoke({
    query: normalizeString(input.query) || '项目知识检索',
    limit: normalizeBudget(input.limit, 6),
  })
  return retrievalPlanSchema.parse(await structuredModel.invoke(promptValue))
}

export function buildHeuristicProjectKnowledgeRetrievalPlan(
  input: Pick<BuildProjectKnowledgeRetrievalPlanInput, 'query' | 'limit'>,
): ProjectKnowledgeRetrievalPlan {
  const query = normalizeString(input.query)
  const visual = includesAny(query, VISUAL_QUERY_HINTS)
  const meeting = includesAny(query, MEETING_QUERY_HINTS)
  const relation = includesAny(query, RELATION_QUERY_HINTS)
  const global = includesAny(query, GLOBAL_QUERY_HINTS)

  let intent: ProjectKnowledgeRetrievalIntent = 'direct_answer'
  if (visual)
    intent = 'visual_lookup'
  else if (meeting)
    intent = 'meeting_lookup'
  else if (global)
    intent = 'global_summary'
  else if (relation)
    intent = query.includes('关系') || query.includes('关联') ? 'relation_explore' : 'evidence_trace'

  const preferredModalities: ProjectKnowledgeRetrievalModalityFilter[] = []
  const preferredProjectionTypes: ProjectKnowledgeProjectionType[] = []
  const relationTypes: ProjectKnowledgeRelationType[] = []

  if (visual) {
    preferredModalities.push('image', 'draw')
    preferredProjectionTypes.push('image_summary', 'image_ocr', 'draw_projection')
  }
  if (meeting) {
    preferredModalities.push('audio', 'video')
    preferredProjectionTypes.push('meeting_notes', 'meeting_transcript')
  }
  if (relation || global) {
    relationTypes.push('belongs_to', 'similar_to', 'aligned_to', 'references', 'duplicated_with')
  }

  return {
    intent,
    queryVariants: dedupeStrings([query], 4),
    preferredModalities: dedupeStrings(preferredModalities, 5) as ProjectKnowledgeRetrievalModalityFilter[],
    preferredProjectionTypes: dedupeStrings(preferredProjectionTypes, 8) as ProjectKnowledgeProjectionType[],
    preferredEmbeddingStatuses: [],
    relationTypes: relationTypes.length > 0 ? relationTypes : ['belongs_to'],
    retrievalBudget: normalizeBudget(input.limit, 6),
    plannerSource: 'heuristic',
    reasoning: intent === 'direct_answer' ? '默认项目知识问答检索。' : '根据查询关键词选择结构化检索策略。',
  }
}

export async function buildProjectKnowledgeRetrievalPlan(
  input: BuildProjectKnowledgeRetrievalPlanInput,
): Promise<ProjectKnowledgeRetrievalPlan> {
  const heuristicPlan = buildHeuristicProjectKnowledgeRetrievalPlan(input)
  if (!normalizeString(input.query))
    return heuristicPlan

  try {
    const execution = await runWithPlatformAiChannelFallback(input.runtime, 'knowledge_query_planner', async ({ ai, prompt }) => {
      const planned = await runLlmPlanner(input, ai, prompt)
      return normalizePlan(planned, input, 'llm')
    })
    return execution.data
  }
  catch {
    return {
      ...heuristicPlan,
      plannerSource: 'fallback',
      reasoning: heuristicPlan.reasoning || '知识检索规划模型不可用，已回退启发式策略。',
    }
  }
}
