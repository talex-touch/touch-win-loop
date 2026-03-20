import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { Contest, DefenseSession, Track } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'

const defenseSchema = z.object({
  topQuestions: z.array(z.string().min(4)).min(8).max(12),
  answer30s: z.array(z.string().min(4)).min(4).max(8),
  answer90s: z.array(z.string().min(4)).min(4).max(8),
  materialGaps: z.array(z.string().min(4)).min(3).max(8),
})

interface DefenseChainInput {
  contest: Contest
  track: Track
  strictness?: 'normal' | 'strict'
  rounds?: number
  ai: AiRuntimeConfig
  injectedPrompt?: string
}

export async function runDefenseChain(input: DefenseChainInput): Promise<DefenseSession> {
  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(defenseSchema, {
    name: 'DefenseResult',
    strict: false,
  })
  const injectedPrompt = input.injectedPrompt?.trim() || ''
  const systemPrompt = injectedPrompt
    ? `你是竞赛答辩教练。请生成尖锐问题清单、30秒与90秒答辩模板、材料缺口。输出必须是结构化 JSON。\n\n[附加提示词]\n${injectedPrompt}`
    : '你是竞赛答辩教练。请生成尖锐问题清单、30秒与90秒答辩模板、材料缺口。输出必须是结构化 JSON。'

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', `竞赛：{contestName}\n赛道：{trackName}\n赛道简介：{trackSummary}\n严格度：{strictness}\n模拟轮数：{rounds}`],
  ])

  const promptValue = await prompt.invoke({
    contestName: input.contest.name,
    trackName: input.track.name,
    trackSummary: input.track.summary || '未提供',
    strictness: input.strictness || 'normal',
    rounds: Math.max(1, Math.min(5, input.rounds || 3)),
  })

  const parsed = defenseSchema.parse(await structuredModel.invoke(promptValue))

  return {
    id: randomUUID(),
    contestId: input.contest.id,
    trackId: input.track.id,
    topQuestions: parsed.topQuestions,
    answer30s: parsed.answer30s,
    answer90s: parsed.answer90s,
    materialGaps: parsed.materialGaps,
    createdAt: new Date().toISOString(),
  }
}
