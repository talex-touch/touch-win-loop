import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type {
  AiProjectChatRequest,
  AiProjectChatResult,
  ProjectPayload,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'

const projectDraftSchema = z.object({
  title: z.string().min(4),
  problemStatement: z.string().min(10),
  innovationPoints: z.array(z.string()).min(2).max(5),
  techRouteSteps: z.array(z.string()).min(3).max(6),
  scoringMapping: z.array(z.string()).min(2).max(6),
  risks: z.array(z.string()).min(2).max(6),
  deliverables: z.array(z.string()).min(2).max(6),
  summary: z.string().min(12),
})

const projectChatSchema = z.object({
  assistantReply: z.string(),
  projectDraft: projectDraftSchema,
  missingFields: z.array(z.string()).default([]),
})

interface ProjectChatChainInput {
  request: AiProjectChatRequest
  ai: AiRuntimeConfig
  contestName?: string
  trackName?: string
  injectedPrompt?: string
}

function buildModePrompt(request: AiProjectChatRequest): string {
  const aiOptions = request.aiOptions
  if (!aiOptions)
    return ''

  const lines: string[] = []
  if (aiOptions.reasoningEnabled)
    lines.push('深度思考已开启：输出前先进行完整的假设校验，避免跳步。')
  if (aiOptions.networkEnabled)
    lines.push('联网检索已开启：若知识点存在时效性，请明确提示需进一步核验来源。')

  return lines.join('\n')
}

function toConversation(messages: AiProjectChatRequest['messages']): string {
  if (messages.length === 0)
    return '暂无历史对话。'

  return messages
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
}

export async function runProjectChatChain(input: ProjectChatChainInput): Promise<AiProjectChatResult> {
  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(projectChatSchema, {
    name: 'ProjectChatResult',
    strict: false,
  })
  const modePrompt = buildModePrompt(input.request)
  const injectedPrompt = input.injectedPrompt?.trim() || ''
  const promptParts = [
    '你是大学生竞赛项目教练。你需要生成可执行的项目草案，并指出缺失字段。输出必须是结构化 JSON。',
    modePrompt,
    injectedPrompt ? `[附加提示词]\n${injectedPrompt}` : '',
  ].filter(Boolean)
  const systemPrompt = promptParts.join('\n\n')

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', `竞赛：{contestName}\n赛道：{trackName}\n专业：{major}\n对话内容：\n{conversation}`],
  ])

  const promptValue = await prompt.invoke({
    contestName: input.contestName ?? '未选择',
    trackName: input.trackName ?? '未选择',
    major: input.request.context.major ?? '未提供',
    conversation: toConversation(input.request.messages),
  })

  const parsed = projectChatSchema.parse(await structuredModel.invoke(promptValue))

  const projectDraft: ProjectPayload = {
    title: parsed.projectDraft.title,
    contestId: input.request.context.contestId ?? '',
    trackId: input.request.context.trackId ?? '',
    problemStatement: parsed.projectDraft.problemStatement,
    innovationPoints: parsed.projectDraft.innovationPoints,
    techRouteSteps: parsed.projectDraft.techRouteSteps,
    scoringMapping: parsed.projectDraft.scoringMapping,
    risks: parsed.projectDraft.risks,
    deliverables: parsed.projectDraft.deliverables,
    summary: parsed.projectDraft.summary,
  }

  const missingFields = new Set(parsed.missingFields)
  if (!projectDraft.contestId)
    missingFields.add('contestId')
  if (!projectDraft.trackId)
    missingFields.add('trackId')
  if (!input.request.context.major)
    missingFields.add('major')

  return {
    assistantReply: parsed.assistantReply,
    projectDraft,
    missingFields: [...missingFields],
  }
}
