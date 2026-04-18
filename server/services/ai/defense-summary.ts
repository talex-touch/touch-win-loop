import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type {
  AiDefenseScorecard,
  AiDefenseStage,
  AiDefenseTurn,
  ChatMessage,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { assertAiRuntimeConfigured } from '~~/server/utils/ai-runtime'

export interface DefenseSummaryResult {
  summary: string
  strengths: string[]
  risks: string[]
  actionItems: string[]
  evidenceGaps: string[]
  markdown: string
}

const defenseSummarySchema = z.object({
  summary: z.string().min(12),
  strengths: z.array(z.string()).max(8).default([]),
  risks: z.array(z.string()).max(8).default([]),
  actionItems: z.array(z.string()).max(8).default([]),
  evidenceGaps: z.array(z.string()).max(8).default([]),
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function compactUnique(items: string[], fallback: string): string[] {
  const next = Array.from(new Set(
    items
      .map(item => normalizeString(item))
      .filter(Boolean),
  ))
  return next.length > 0 ? next : [fallback]
}

function stageLabel(stage: AiDefenseStage | undefined): string {
  if (stage === 'opening')
    return '开场'
  if (stage === 'qa')
    return '问答'
  if (stage === 'rebuttal')
    return '反驳'
  if (stage === 'closing')
    return '收束'
  return '答辩'
}

function buildTurnsDigest(turns: AiDefenseTurn[]): string {
  return turns
    .map((item) => {
      const evidence = item.evidenceRefs.slice(0, 2).map(ref => `${ref.resourceTitle}${ref.page ? ` p.${ref.page}` : ''}`).join('、')
      return [
        `[第 ${item.turnIndex} 轮 / ${stageLabel(item.stage)}] ${item.judgeName}(${item.score})`,
        `问题：${item.question}`,
        `评论：${item.comment}`,
        `追问：${item.followUp}`,
        evidence ? `证据：${evidence}` : '',
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

function buildChatDigest(messages: ChatMessage[]): string {
  return messages
    .filter(item => item.role === 'user' || item.role === 'assistant')
    .slice(-10)
    .map(item => `${item.role}: ${item.content}`)
    .join('\n')
}

function buildDefenseSummaryMarkdown(input: {
  sessionTitle: string
  currentStage?: AiDefenseStage
  turnCount: number
  scorecard?: AiDefenseScorecard | null
  result: Omit<DefenseSummaryResult, 'markdown'>
}): string {
  const scorecard = input.scorecard
  const lines = [
    `# 模拟答辩总结：${input.sessionTitle}`,
    '',
    `- 当前阶段：${stageLabel(input.currentStage)}`,
    `- 已完成轮次：${input.turnCount}`,
    scorecard ? `- 当前总分：${scorecard.total}（技术 ${scorecard.technical} / 业务 ${scorecard.business} / 表达 ${scorecard.expression}）` : '',
    '',
    '## 总结',
    input.result.summary,
    '',
    '## 优势',
    ...input.result.strengths.map(item => `- ${item}`),
    '',
    '## 风险',
    ...input.result.risks.map(item => `- ${item}`),
    '',
    '## 改进动作',
    ...input.result.actionItems.map(item => `- [ ] ${item}`),
    '',
    '## 证据缺口',
    ...input.result.evidenceGaps.map(item => `- ${item}`),
  ].filter(Boolean)
  return lines.join('\n')
}

export async function summarizeDefenseSessionByAi(input: {
  sessionTitle: string
  currentStage?: AiDefenseStage
  turnCount: number
  turns: AiDefenseTurn[]
  scorecard?: AiDefenseScorecard | null
  messages: ChatMessage[]
  ai: AiRuntimeConfig
}): Promise<DefenseSummaryResult> {
  assertAiRuntimeConfigured(input.ai, '答辩总结 AI')

  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(defenseSummarySchema, {
    name: 'DefenseSummary',
    strict: false,
  })

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', [
      '你是竞赛答辩总结助手。',
      '请基于答辩轮次、评分卡和最近对话，输出 summary、strengths、risks、actionItems、evidenceGaps。',
      '总结必须可执行，避免空泛评价。',
    ].join('\n')],
    ['human', [
      `会话标题：${input.sessionTitle}`,
      `阶段：${stageLabel(input.currentStage)}`,
      `轮次：${input.turnCount}`,
      input.scorecard ? `评分卡：${JSON.stringify(input.scorecard)}` : '评分卡：暂无',
      '答辩轮次：',
      buildTurnsDigest(input.turns).slice(0, 18_000) || '暂无结构化轮次。',
      '最近对话：',
      buildChatDigest(input.messages).slice(0, 8_000) || '暂无对话。',
    ].join('\n\n')],
  ])

  const promptValue = await prompt.invoke({})
  const parsed = defenseSummarySchema.parse(await structuredModel.invoke(promptValue))
  const result: DefenseSummaryResult = {
    summary: normalizeString(parsed.summary),
    strengths: compactUnique(parsed.strengths, '当前答辩优势待补充。'),
    risks: compactUnique(parsed.risks, '当前答辩风险待补充。'),
    actionItems: compactUnique(parsed.actionItems, '后续动作待补充。'),
    evidenceGaps: compactUnique(parsed.evidenceGaps, '证据缺口待补充。'),
    markdown: '',
  }
  result.markdown = buildDefenseSummaryMarkdown({
    sessionTitle: input.sessionTitle,
    currentStage: input.currentStage,
    turnCount: input.turnCount,
    scorecard: input.scorecard,
    result,
  })
  return result
}
