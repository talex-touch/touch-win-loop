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
  title: z.string().min(4),
  reason: z.string().min(10),
  innovationPoints: z.array(z.string()).min(2).max(5),
  techRouteSteps: z.array(z.string()).min(3).max(6),
  scoringMapping: z.array(z.string()).min(2).max(6),
  risks: z.array(z.string()).min(2).max(6),
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
    title: item.title,
    reason: item.reason,
    innovationPoints: item.innovationPoints,
    techRouteSteps: item.techRouteSteps,
    scoringMapping: item.scoringMapping,
    risks: item.risks,
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
    injectedPrompt ? `[附加提示词]\n${injectedPrompt}` : '',
  ].filter(Boolean)

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPromptParts.join('\n\n')],
    ['human', [
      '竞赛：{contestName}',
      '赛道：{trackName}',
      '专业：{major}',
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
    references: [],
    missingFields: [...missingFields],
  }
}
