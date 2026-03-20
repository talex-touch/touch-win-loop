import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { Contest, TopicProposal, TopicProposalItem, Track } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'

const topicProposalSchema = z.object({
  proposals: z.array(z.object({
    title: z.string().min(6),
    reason: z.string().min(10),
    innovationPoints: z.array(z.string().min(2)).min(2).max(5),
    techRouteSteps: z.array(z.string().min(2)).min(3).max(6),
    scoringMapping: z.array(z.string().min(2)).min(2).max(6),
    risks: z.array(z.string().min(2)).min(2).max(6),
    references: z.array(z.string().min(2)).min(1).max(6),
  })).min(3).max(5),
})

interface TopicProposalChainInput {
  contest: Contest
  track: Track
  major?: string
  ai: AiRuntimeConfig
  injectedPrompt?: string
}

export async function runTopicProposalChain(input: TopicProposalChainInput): Promise<TopicProposal> {
  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(topicProposalSchema, {
    name: 'TopicProposalResult',
    strict: false,
  })
  const injectedPrompt = input.injectedPrompt?.trim() || ''
  const systemPrompt = injectedPrompt
    ? `你是大学生竞赛选题专家。请根据赛事和赛道信息，生成 3-5 个可执行、可答辩、可交付的选题建议。输出必须是结构化 JSON。\n\n[附加提示词]\n${injectedPrompt}`
    : '你是大学生竞赛选题专家。请根据赛事和赛道信息，生成 3-5 个可执行、可答辩、可交付的选题建议。输出必须是结构化 JSON。'

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', `竞赛名称：{contestName}\n赛道名称：{trackName}\n赛道简介：{trackSummary}\n适配专业：{majors}\n交付物：{deliverables}\n用户专业：{major}`],
  ])

  const promptValue = await prompt.invoke({
    contestName: input.contest.name,
    trackName: input.track.name,
    trackSummary: input.track.summary || '未提供',
    majors: input.track.suitableMajors.join('、') || input.contest.recommendedFor.join('、') || '未提供',
    deliverables: input.track.deliverableTypes.join('、') || '未提供',
    major: input.major || '未提供',
  })

  const parsed = topicProposalSchema.parse(await structuredModel.invoke(promptValue))
  const proposals: TopicProposalItem[] = parsed.proposals.map(item => ({
    title: item.title,
    reason: item.reason,
    innovationPoints: item.innovationPoints,
    techRouteSteps: item.techRouteSteps,
    scoringMapping: item.scoringMapping,
    risks: item.risks,
    references: item.references,
  }))

  return {
    id: randomUUID(),
    contestId: input.contest.id,
    trackId: input.track.id,
    createdAt: new Date().toISOString(),
    proposals,
  }
}
