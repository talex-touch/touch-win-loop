import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type {
  ProjectMeeting,
  ProjectMeetingParticipant,
  ProjectMeetingUtterance,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'

export interface MeetingSummaryResult {
  summary: string
  todos: string[]
  decisions: string[]
  risks: string[]
  timeline: string[]
  markdown: string
}

const meetingSummarySchema = z.object({
  summary: z.string().min(12),
  todos: z.array(z.string()).max(8).default([]),
  decisions: z.array(z.string()).max(8).default([]),
  risks: z.array(z.string()).max(8).default([]),
  timeline: z.array(z.string()).max(10).default([]),
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function formatMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function compactUnique(items: string[], fallback: string): string[] {
  const next = Array.from(new Set(
    items
      .map(item => normalizeString(item))
      .filter(Boolean),
  ))
  return next.length > 0 ? next : [fallback]
}

function buildTranscriptText(utterances: ProjectMeetingUtterance[]): string {
  return utterances
    .map((item) => {
      return `[${formatMs(item.startedAtMs)}-${formatMs(item.endedAtMs)}] ${item.speakerName || item.speakerLabel}: ${item.text}`
    })
    .join('\n')
}

function buildFallbackMeetingSummary(input: {
  meeting: ProjectMeeting
  utterances: ProjectMeetingUtterance[]
}): MeetingSummaryResult {
  const utterances = input.utterances
  const transcript = buildTranscriptText(utterances)
  const todoKeywords = ['待办', 'TODO', 'todo', '需要', '安排', '跟进']
  const decisionKeywords = ['决定', '结论', '确认', '采用', '定为']
  const riskKeywords = ['风险', '问题', '阻塞', '延期', '卡住']

  function pickLines(keywords: string[], fallbackPrefix: string): string[] {
    const matched = utterances
      .filter(item => keywords.some(keyword => item.text.includes(keyword)))
      .slice(0, 5)
      .map(item => `${item.speakerName || item.speakerLabel}：${item.text}`)
    if (matched.length > 0)
      return compactUnique(matched, `${fallbackPrefix}待补充`)
    return [`${fallbackPrefix}待补充`]
  }

  const timeline = utterances
    .slice(0, 6)
    .map(item => `- ${formatMs(item.startedAtMs)} ${item.speakerName || item.speakerLabel}：${item.text}`)

  const summary = transcript
    ? `会议围绕「${input.meeting.title}」完成了讨论，已沉淀逐句稿并生成待办、决策与风险摘要。`
    : `会议「${input.meeting.title}」尚未收到有效转写内容，纪要已创建但需要补充逐句稿。`

  const result = {
    summary,
    todos: pickLines(todoKeywords, '待办'),
    decisions: pickLines(decisionKeywords, '决策'),
    risks: pickLines(riskKeywords, '风险'),
    timeline: timeline.length > 0 ? timeline : ['- 暂无时间线片段'],
    markdown: '',
  }
  result.markdown = buildMeetingSummaryMarkdown(input.meeting, result)
  return result
}

function buildMeetingSummaryMarkdown(meeting: ProjectMeeting, summary: Omit<MeetingSummaryResult, 'markdown'>): string {
  const sections = [
    `# 会议纪要：${meeting.title}`,
    '',
    `- 会议 ID：\`${meeting.id}\``,
    `- 会议模式：${meeting.mode === 'audio' ? '语音会议' : '视频会议'}`,
    `- 开始时间：${meeting.startedAt}`,
    `- 结束时间：${meeting.endedAt || '进行中'}`,
    '',
    '## 摘要',
    summary.summary,
    '',
    '## 待办',
    ...summary.todos.map(item => `- [ ] ${item}`),
    '',
    '## 决策',
    ...summary.decisions.map(item => `- ${item}`),
    '',
    '## 风险',
    ...summary.risks.map(item => `- ${item}`),
    '',
    '## 时间线片段',
    ...summary.timeline,
  ]
  return sections.join('\n')
}

export async function summarizeMeetingByAi(input: {
  meeting: ProjectMeeting
  participants: ProjectMeetingParticipant[]
  utterances: ProjectMeetingUtterance[]
  ai: AiRuntimeConfig
}): Promise<MeetingSummaryResult> {
  if (!isAiRuntimeConfigured(input.ai))
    return buildFallbackMeetingSummary(input)

  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(meetingSummarySchema, {
    name: 'MeetingSummary',
    strict: false,
  })

  const participantText = input.participants
    .map(item => `${item.displayName}(${item.role})`)
    .join('、') || '暂无参会人名单'
  const transcript = buildTranscriptText(input.utterances).slice(0, 20_000)

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', '你是项目会议纪要助手。请基于会议逐句稿输出结构化摘要，固定包含 summary、todos、decisions、risks、timeline。timeline 要保留关键时间片段。'],
    ['human', '会议标题：{meetingTitle}\n会议模式：{meetingMode}\n参会人：{participants}\n逐句稿：\n{transcript}'],
  ])

  const promptValue = await prompt.invoke({
    meetingTitle: input.meeting.title,
    meetingMode: input.meeting.mode === 'audio' ? '语音会议' : '视频会议',
    participants: participantText,
    transcript: transcript || '暂无有效逐句稿。',
  })

  const parsed = meetingSummarySchema.parse(await structuredModel.invoke(promptValue))
  const result: MeetingSummaryResult = {
    summary: normalizeString(parsed.summary),
    todos: compactUnique(parsed.todos, '待办待补充'),
    decisions: compactUnique(parsed.decisions, '决策待补充'),
    risks: compactUnique(parsed.risks, '风险待补充'),
    timeline: compactUnique(parsed.timeline, '- 暂无时间线片段'),
    markdown: '',
  }
  result.markdown = buildMeetingSummaryMarkdown(input.meeting, result)
  return result
}

export function buildMeetingSummary(input: {
  meeting: ProjectMeeting
  utterances: ProjectMeetingUtterance[]
}): MeetingSummaryResult {
  return buildFallbackMeetingSummary(input)
}
