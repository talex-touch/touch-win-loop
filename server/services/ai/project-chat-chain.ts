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

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', '你是大学生竞赛项目教练。你需要生成可执行的项目草案，并指出缺失字段。输出必须是结构化 JSON。'],
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
