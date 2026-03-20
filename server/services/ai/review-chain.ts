import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type {
  Contest,
  ReviewDimensionScore,
  ReviewReport,
  Rubric,
  WorkloadLevel,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'

const reviewSchema = z.object({
  totalScore: z.number().min(0).max(100),
  dimensionScores: z.array(z.object({
    role: z.string().min(2),
    score: z.number().min(0).max(100),
    comment: z.string().min(6),
  })).min(1),
  topPriorities: z.array(z.string().min(4)).min(3).max(5),
  chapterSuggestions: z.array(z.object({
    chapter: z.string().min(1),
    suggestions: z.array(z.string().min(2)).min(1).max(5),
  })).min(2).max(6),
  actionItems: z.array(z.object({
    task: z.string().min(4),
    workload: z.enum(['low', 'medium', 'high']),
  })).min(3).max(8),
  riskWarnings: z.array(z.string().min(4)).min(2).max(6),
})

interface ReviewChainInput {
  contest: Contest
  trackId: string
  text: string
  rubric: Rubric
  ai: AiRuntimeConfig
  injectedPrompt?: string
}

export async function runReviewChain(input: ReviewChainInput): Promise<ReviewReport> {
  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(reviewSchema, {
    name: 'ReviewResult',
    strict: false,
  })
  const injectedPrompt = input.injectedPrompt?.trim() || ''
  const systemPrompt = injectedPrompt
    ? `你是竞赛评审专家。请按给定 Rubric 对作品文本进行评审，给出可执行改进建议。输出必须是结构化 JSON。\n\n[附加提示词]\n${injectedPrompt}`
    : '你是竞赛评审专家。请按给定 Rubric 对作品文本进行评审，给出可执行改进建议。输出必须是结构化 JSON。'

  const track = input.contest.tracks.find(item => item.id === input.trackId)
  const rubricBrief = input.rubric.dimensions.map(item => ({
    key: item.key,
    name: item.name,
    weight: item.weight || 0,
    description: item.description,
    scoringPoint: item.scoringPoint || '',
    deductionPoint: item.deductionPoint || '',
  }))

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', `竞赛：{contestName}\n赛道：{trackName}\nRubric：{rubric}\n作品文本：\n{text}`],
  ])

  const promptValue = await prompt.invoke({
    contestName: input.contest.name,
    trackName: track?.name || input.trackId,
    rubric: JSON.stringify(rubricBrief, null, 2),
    text: input.text || '未提供作品文本。',
  })

  const parsed = reviewSchema.parse(await structuredModel.invoke(promptValue))
  const dimensionScores: ReviewDimensionScore[] = parsed.dimensionScores.map(item => ({
    role: item.role,
    score: Math.round(item.score),
    comment: item.comment,
  }))

  return {
    id: randomUUID(),
    contestId: input.contest.id,
    trackId: input.trackId,
    totalScore: Math.round(parsed.totalScore),
    dimensionScores,
    topPriorities: parsed.topPriorities,
    chapterSuggestions: parsed.chapterSuggestions.map(item => ({
      chapter: item.chapter,
      suggestions: item.suggestions,
    })),
    actionItems: parsed.actionItems.map(item => ({
      task: item.task,
      workload: item.workload as WorkloadLevel,
    })),
    riskWarnings: parsed.riskWarnings,
    createdAt: new Date().toISOString(),
  }
}
