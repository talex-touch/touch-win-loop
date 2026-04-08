import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type {
  AiTopicProposalRequest,
  AiTopicProposalResult,
  TopicProposalItem,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'

const topicProposalItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(4),
  reason: z.string().min(10),
  innovationPoints: z.array(z.string()).min(2).max(5),
  techRouteSteps: z.array(z.string()).min(3).max(6),
  scoringMapping: z.array(z.string()).min(2).max(6),
  risks: z.array(z.string()).min(2).max(6),
  estimatedWorkload: z.string().min(6).default('中等工作量，建议先做 MVP 验证。'),
  recommendedTrackId: z.string().default(''),
  recommendedTrackName: z.string().default(''),
  contestFitScore: z.number().min(0).max(100).default(72),
  contestFitReasons: z.array(z.string()).min(2).max(4).default([]),
  requiredSkills: z.array(z.string()).max(8).default([]),
  references: z.array(z.string()).default([]),
})

const topicProposalSchema = z.object({
  assistantReply: z.string().min(8),
  proposals: z.array(topicProposalItemSchema).min(1).max(6),
})

interface TopicProposalChainInput {
  request: AiTopicProposalRequest
  ai: AiRuntimeConfig
  contestName?: string
  trackName?: string
  injectedPrompt?: string
  localContext?: string
  webContext?: string
}

function toConversation(messages: AiTopicProposalRequest['messages']): string {
  if (messages.length === 0)
    return '暂无历史对话。'

  return messages
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
}

function normalizeTopicItem(item: z.infer<typeof topicProposalItemSchema>): TopicProposalItem {
  return {
    id: item.id || '',
    title: item.title,
    reason: item.reason,
    innovationPoints: item.innovationPoints,
    techRouteSteps: item.techRouteSteps,
    scoringMapping: item.scoringMapping,
    risks: item.risks,
    estimatedWorkload: item.estimatedWorkload,
    recommendedTrackId: item.recommendedTrackId,
    recommendedTrackName: item.recommendedTrackName,
    contestFitScore: item.contestFitScore,
    contestFitReasons: item.contestFitReasons,
    similarAwards: [],
    trendSignals: [],
    requiredSkills: item.requiredSkills,
    teamMatchScore: 0,
    teamGapNotes: [],
    evidenceRefs: [],
    decisionStatus: 'candidate',
    compareScores: {
      contestFit: 0,
      noveltySimilarity: 0,
      evidenceReadiness: 0,
      trendHeat: 0,
      teamMatch: 0,
      workloadFeasibility: 0,
    },
    totalScore: 0,
    references: item.references,
  }
}

export async function runTopicProposalChain(input: TopicProposalChainInput): Promise<AiTopicProposalResult> {
  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(topicProposalSchema, {
    name: 'TopicProposalResult',
    strict: false,
  })

  const injectedPrompt = input.injectedPrompt?.trim() || ''
  const localContext = input.localContext?.trim() || '暂无站内检索结果。'
  const webContext = input.webContext?.trim() || '暂无外网检索结果。'
  const topK = Math.max(1, Math.min(5, Number(input.request.topK || 3)))

  const systemPromptParts = [
    '你是大学生竞赛选题教练。请输出结构化 JSON，给出可落地、可答辩的候选命题。',
    '优先利用站内资料，再结合外网资料，避免泛泛而谈。',
    '每个候选题都要补充：创新点、技术路线、评分映射、风险、预估工作量、推荐赛道、竞赛适配理由、所需技能。',
    '避免与往届获奖题高度重复，优先给出可验证、可交付、可答辩的方向。',
    injectedPrompt ? `[附加提示词]\n${injectedPrompt}` : '',
  ].filter(Boolean)

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPromptParts.join('\n\n')],
    ['human', [
      '竞赛：{contestName}',
      '赛道：{trackName}',
      '专业：{major}',
      '所属领域：{discipline}',
      '题目类型：{topicType}',
      '期望难度：{expectedDifficulty}',
      '关键词：{keywords}',
      '团队技能标签：{teamSkillTags}',
      '候选命题数：{topK}',
      '历史对话：',
      '{conversation}',
      '站内检索上下文：',
      '{localContext}',
      '外网检索上下文：',
      '{webContext}',
    ].join('\n')],
  ])

  const promptValue = await prompt.invoke({
    contestName: input.contestName || '未选择',
    trackName: input.trackName || '未选择',
    major: input.request.context.major || '未提供',
    discipline: input.request.context.discipline || '未提供',
    topicType: input.request.context.topicType || '未提供',
    expectedDifficulty: input.request.context.expectedDifficulty || '未提供',
    keywords: (input.request.context.keywords || []).join('、') || '未提供',
    teamSkillTags: (input.request.context.teamSkillTags || []).join('、') || '未提供',
    topK,
    conversation: toConversation(input.request.messages),
    localContext,
    webContext,
  })

  const parsed = topicProposalSchema.parse(await structuredModel.invoke(promptValue))
  const proposals = parsed.proposals
    .slice(0, topK)
    .map(normalizeTopicItem)

  const missingFields = new Set<string>()
  if (!input.request.context.contestId)
    missingFields.add('contestId')
  if (!input.request.context.trackId)
    missingFields.add('trackId')
  if (!input.request.context.major)
    missingFields.add('major')

  return {
    assistantReply: parsed.assistantReply,
    proposals,
    compareMatrix: [],
    boardSummary: '',
    teamSkillProfile: input.request.context.teamSkillTags || [],
    references: [],
    missingFields: [...missingFields],
  }
}
