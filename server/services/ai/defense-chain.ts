import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type {
  AiDefenseEvidenceRef,
  AiDefensePersona,
  AiDefensePersonaJudgeType,
  AiDefenseRequest,
  AiDefenseResult,
  AiDefenseStage,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'

interface DefenseChainInput {
  request: AiDefenseRequest
  ai: AiRuntimeConfig
  contestName?: string
  trackName?: string
  injectedPrompt?: string
  rubricDigest?: string
  promptContextText?: string
  evidenceRefs?: AiDefenseEvidenceRef[]
  personas: AiDefensePersona[]
  stage: AiDefenseStage
  turnIndex: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toConversation(messages: AiDefenseRequest['messages']): string {
  if (messages.length === 0)
    return '暂无历史对话。'

  return messages
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
}

function normalizeJudgeType(value: unknown): AiDefensePersonaJudgeType {
  const normalized = normalizeString(value)
  if (normalized === 'technical' || normalized === 'business' || normalized === 'expression')
    return normalized
  return 'custom'
}

function computeNextStage(stage: AiDefenseStage, turnIndex: number): AiDefenseStage {
  if (turnIndex >= 5)
    return 'closing'
  if (stage === 'opening')
    return 'qa'
  if (stage === 'qa' && turnIndex >= 3)
    return 'rebuttal'
  if (stage === 'rebuttal' && turnIndex >= 4)
    return 'closing'
  return stage
}

function buildDefenseSchema(personaCount: number) {
  const defenseEvidenceRefSchema = z.object({
    resourceId: z.string().optional().default(''),
    resourceTitle: z.string().min(1),
    excerpt: z.string().min(6),
    page: z.number().nullable().optional(),
    sourceType: z.enum(['project', 'contest', 'attachment']).optional().default('project'),
    category: z.string().optional().default(''),
  })

  const defenseJudgeRoundSchema = z.object({
    judge: z.string().min(2),
    judgeType: z.enum(['technical', 'business', 'expression', 'custom']).optional().default('custom'),
    personaId: z.string().optional().default(''),
    question: z.string().min(8),
    score: z.number().min(0).max(100),
    comment: z.string().min(6),
    followUp: z.string().min(6),
    evidenceRefs: z.array(defenseEvidenceRefSchema).max(3).default([]),
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

  return z.object({
    assistantReply: z.string().min(8),
    rounds: z.array(defenseJudgeRoundSchema).length(personaCount),
    scorecard: defenseScorecardSchema,
  })
}

export async function runDefenseChain(input: DefenseChainInput): Promise<AiDefenseResult> {
  const personas = input.personas.length > 0 ? input.personas : []
  const personaCount = Math.max(1, personas.length)
  const defenseSchema = buildDefenseSchema(personaCount)
  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(defenseSchema, {
    name: 'DefenseSimulationResult',
    strict: false,
  })

  const injectedPrompt = normalizeString(input.injectedPrompt)
  const promptContextText = normalizeString(input.promptContextText) || '暂无可用证据，请基于当前对话继续模拟答辩。'
  const rubricDigest = normalizeString(input.rubricDigest) || '暂无评分规则。'
  const personaText = personas.length > 0
    ? personas
        .map((persona, index) => {
          return [
            `${index + 1}. ${persona.name}`,
            `personaId=${persona.id}`,
            `judgeType=${persona.judgeType}`,
            `summary=${persona.summary}`,
            `focus=${(persona.focusAreas || []).join(' / ') || '无'}`,
            `systemPrompt=${persona.systemPrompt}`,
          ].join('\n')
        })
        .join('\n\n')
    : '1. 技术评委\npersonaId=builtin-technical\njudgeType=technical'

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', [
      '你是竞赛答辩模拟评委团协调器。',
      '你必须输出结构化 JSON。',
      `当前阶段：${input.stage}；当前轮次：${input.turnIndex}。`,
      'rounds 数组长度必须与传入评委人数完全一致，且顺序必须与“评委团配置”一致。',
      '每个评委都要给出 question、comment、followUp、score，并尽量引用提供的证据。',
      'assistantReply 负责给出协调器口吻的总回应，适合直接展示给用户。',
      injectedPrompt ? `[附加提示词]\n${injectedPrompt}` : '',
    ].filter(Boolean).join('\n\n')],
    ['human', [
      `竞赛：${input.contestName || '未选择'}`,
      `赛道：${input.trackName || '未选择'}`,
      `专业：${input.request.context.major || '未提供'}`,
      `输入模式：${input.request.inputMode || 'text'}`,
      '评分规则：',
      rubricDigest,
      '评委团配置：',
      personaText,
      '证据包：',
      promptContextText,
      '对话内容：',
      toConversation(input.request.messages),
    ].join('\n\n')],
  ])

  const promptValue = await prompt.invoke({})
  const parsed = defenseSchema.parse(await structuredModel.invoke(promptValue))

  const rounds = parsed.rounds.map((round, index) => {
    const persona = personas[index]
    return {
      judge: normalizeString(round.judge) || persona?.name || `评委 ${index + 1}`,
      judgeType: normalizeJudgeType(round.judgeType || persona?.judgeType),
      personaId: normalizeString(round.personaId) || persona?.id,
      question: normalizeString(round.question),
      score: Math.max(0, Math.min(100, Number(round.score || 0))),
      comment: normalizeString(round.comment),
      followUp: normalizeString(round.followUp),
      evidenceRefs: (round.evidenceRefs || []).map((item: {
        resourceId?: string
        resourceTitle: string
        excerpt: string
        page?: number | null
        sourceType?: 'project' | 'contest' | 'attachment'
        category?: string
      }) => ({
        resourceId: normalizeString(item.resourceId) || undefined,
        resourceTitle: normalizeString(item.resourceTitle),
        excerpt: normalizeString(item.excerpt),
        page: item.page ?? null,
        sourceType: item.sourceType,
        category: normalizeString(item.category) || undefined,
      })),
    }
  })

  const missingFields = new Set<string>()
  if (!input.request.context.contestId)
    missingFields.add('contestId')
  if (!input.request.context.trackId)
    missingFields.add('trackId')
  if (!input.request.context.major)
    missingFields.add('major')

  return {
    assistantReply: parsed.assistantReply,
    rounds,
    scorecard: parsed.scorecard,
    missingFields: [...missingFields],
    stage: input.stage,
    nextStage: computeNextStage(input.stage, input.turnIndex),
    turnIndex: input.turnIndex,
    evidenceRefs: input.evidenceRefs || [],
    summaryStatus: 'queued',
    selectedPersonaIds: personas.map(item => item.id),
  }
}
