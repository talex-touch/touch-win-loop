import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type {
  AiDefenseRequest,
  AiDefenseResult,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'

const defenseJudgeRoundSchema = z.object({
  judge: z.enum(['technical', 'business', 'expression']),
  question: z.string().min(8),
  score: z.number().min(0).max(100),
  comment: z.string().min(6),
  followUp: z.string().min(6),
})

const defenseScorecardSchema = z.object({
  technical: z.number().min(0).max(100),
  business: z.number().min(0).max(100),
  expression: z.number().min(0).max(100),
  total: z.number().min(0).max(100),
  summary: z.string().min(8),
  materialGaps: z.array(z.string()).min(1).max(8),
  actionItems: z.array(z.string()).min(1).max(8),
})

const defenseSchema = z.object({
  assistantReply: z.string().min(8),
  rounds: z.array(defenseJudgeRoundSchema).length(3),
  scorecard: defenseScorecardSchema,
})

interface DefenseChainInput {
  request: AiDefenseRequest
  ai: AiRuntimeConfig
  contestName?: string
  trackName?: string
  injectedPrompt?: string
  localContext?: string
}

function toConversation(messages: AiDefenseRequest['messages']): string {
  if (messages.length === 0)
    return '暂无历史对话。'

  return messages
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
}

export async function runDefenseChain(input: DefenseChainInput): Promise<AiDefenseResult> {
  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(defenseSchema, {
    name: 'DefenseSimulationResult',
    strict: false,
  })

  const injectedPrompt = input.injectedPrompt?.trim() || ''
  const localContext = input.localContext?.trim() || '项目资料池暂无可用资料。'

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', [
      '你是竞赛答辩模拟评委团协调器。',
      '你必须输出结构化 JSON，固定三位评委：technical、business、expression。',
      '每位评委都要给出追问与即时评分；最后给总评与改进动作。',
      injectedPrompt ? `[附加提示词]\n${injectedPrompt}` : '',
    ].filter(Boolean).join('\n\n')],
    ['human', [
      '竞赛：{contestName}',
      '赛道：{trackName}',
      '专业：{major}',
      '项目资料池上下文：',
      '{localContext}',
      '对话内容：',
      '{conversation}',
    ].join('\n')],
  ])

  const promptValue = await prompt.invoke({
    contestName: input.contestName || '未选择',
    trackName: input.trackName || '未选择',
    major: input.request.context.major || '未提供',
    localContext,
    conversation: toConversation(input.request.messages),
  })

  const parsed = defenseSchema.parse(await structuredModel.invoke(promptValue))

  const missingFields = new Set<string>()
  if (!input.request.context.contestId)
    missingFields.add('contestId')
  if (!input.request.context.trackId)
    missingFields.add('trackId')
  if (!input.request.context.major)
    missingFields.add('major')

  return {
    assistantReply: parsed.assistantReply,
    rounds: parsed.rounds,
    scorecard: parsed.scorecard,
    missingFields: [...missingFields],
  }
}
