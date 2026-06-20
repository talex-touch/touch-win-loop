import type { RuntimeSettings } from '~~/server/utils/env'
import type { PlatformAiChannelKey } from '~~/server/utils/platform-ai-channels'
import type {
  AiAssistantOptions,
  AiCanvasAssistAction,
  AiCanvasAssistImportPreview,
  AiCanvasAssistRequest,
  AiCanvasAssistResult,
  AiCanvasAssistSourceFormat,
  ChatMessage,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import {
  sceneDocumentToDesignDocument,
  serializeDesignDocument,
} from '~~/shared/utils/design-document'
import {
  importArchitectureFromMetadata,
  importFromDDL,
  importFromMarkdownOutline,
  importFromMermaid,
} from '~~/shared/utils/scene-document'

const MAX_CANVAS_ASSIST_MESSAGES = 8

export function toCanvasAssistText(value: unknown): string {
  return String(value || '').trim()
}

export function normalizeCanvasAction(value: unknown): AiCanvasAssistAction {
  const normalized = toCanvasAssistText(value)
  if (normalized === 'complete' || normalized === 'refine')
    return normalized
  return 'generate'
}

export function normalizeCanvasTemplate(value: unknown): AiCanvasAssistRequest['template'] {
  const normalized = toCanvasAssistText(value)
  if (normalized === 'mindmap' || normalized === 'er' || normalized === 'architecture')
    return normalized
  return 'flowchart'
}

export function resolveCanvasChannelKey(action: AiCanvasAssistAction): 'workspace_canvas_generate' | 'workspace_canvas_complete' | 'workspace_canvas_refine' {
  if (action === 'complete')
    return 'workspace_canvas_complete'
  if (action === 'refine')
    return 'workspace_canvas_refine'
  return 'workspace_canvas_generate'
}

export function resolveCanvasSourceFormat(template: AiCanvasAssistRequest['template']): AiCanvasAssistSourceFormat {
  if (template === 'mindmap')
    return 'markdown_outline'
  if (template === 'er')
    return 'ddl'
  if (template === 'architecture')
    return 'architecture'
  return 'mermaid'
}

function resolveCanvasFormatInstruction(sourceFormat: AiCanvasAssistSourceFormat): string {
  if (sourceFormat === 'markdown_outline')
    return '输出纯 Markdown Outline 文本，不要输出 Mermaid、解释或代码块围栏。'
  if (sourceFormat === 'ddl')
    return '输出纯 DDL 文本，不要输出说明、SQL 注释以外的额外描述或代码块围栏。'
  if (sourceFormat === 'architecture')
    return '输出纯 Architecture Metadata 文本，不要输出解释、标题或代码块围栏。'
  return '输出纯 Mermaid 文本，不要输出解释、标题或代码块围栏。'
}

function normalizeConversationMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant', content: string }> {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: toCanvasAssistText(message.content),
    }))
    .filter(message => Boolean(message.content))
    .slice(-MAX_CANVAS_ASSIST_MESSAGES)
}

export function buildCanvasConversationTranscript(messages: ChatMessage[]): string {
  const normalized = normalizeConversationMessages(messages)
  if (normalized.length === 0)
    return '（无历史消息）'

  return normalized
    .map(message => `${message.role === 'assistant' ? '助手' : '用户'}：${message.content}`)
    .join('\n')
}

function stripCodeFence(text: string): string {
  const normalized = toCanvasAssistText(text)
  if (!normalized.startsWith('```') || !normalized.endsWith('```'))
    return normalized

  const firstLineEnd = normalized.indexOf('\n')
  if (firstLineEnd < 0)
    return normalized.slice(3, -3).trim()

  return normalized.slice(firstLineEnd + 1, -3).trim()
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string')
    return stripCodeFence(content)

  if (Array.isArray(content)) {
    return stripCodeFence(content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .join('\n'))
  }

  return ''
}

export function buildCanvasAssistPrompt(input: {
  action: AiCanvasAssistAction
  template: AiCanvasAssistRequest['template']
  sourceFormat: AiCanvasAssistSourceFormat
  resourceTitle: string
  resourceSummary: string
  sourceText: string
  conversation: string
  latestUserMessage: string
}): string {
  const actionInstruction = input.action === 'complete'
    ? '当前任务：补全现有结构源，优先补齐缺失节点、连线和层级。'
    : input.action === 'refine'
      ? '当前任务：续改现有结构源，重构表达、命名和结构，但保持可导入。'
      : '当前任务：从上下文生成新的结构源首稿。'

  return [
    `画布类型：${input.template}`,
    `目标结构源格式：${input.sourceFormat}`,
    actionInstruction,
    resolveCanvasFormatInstruction(input.sourceFormat),
    '如果上下文不足，仍要输出一个最小但结构完整、可导入的版本，不要返回“无法生成”。',
    '',
    `当前资源：${input.resourceTitle || '未命名画布'}`,
    '',
    '项目上下文：',
    input.resourceSummary || '（暂无额外项目资料）',
    '',
    '当前结构源：',
    input.sourceText || '（当前为空）',
    '',
    '最近多轮交互：',
    input.conversation,
    '',
    '本轮用户要求：',
    input.latestUserMessage || '请生成一版可直接导入的结构源。',
  ].join('\n')
}

function buildCanvasAssistImportPreview(input: {
  sourceText: string
  sourceFormat: AiCanvasAssistSourceFormat
  template: AiCanvasAssistRequest['template']
}): AiCanvasAssistImportPreview | null {
  const sourceText = toCanvasAssistText(input.sourceText)
  if (!sourceText)
    return null

  try {
    const sceneDocument = input.sourceFormat === 'markdown_outline'
      ? importFromMarkdownOutline(sourceText)
      : input.sourceFormat === 'ddl'
        ? importFromDDL(sourceText).sceneDocument
        : input.sourceFormat === 'architecture'
          ? importArchitectureFromMetadata(sourceText).sceneDocument
          : importFromMermaid(sourceText)
    return {
      target: 'scene_document',
      summary: `已生成可导入设计画布的 ${input.template} 预览。`,
      sceneDocument,
      designDocument: serializeDesignDocument(sceneDocumentToDesignDocument(sceneDocument)),
    }
  }
  catch {
    return null
  }
}

export async function runCanvasAssistGeneration(input: {
  runtime: RuntimeSettings
  action: AiCanvasAssistAction
  template: AiCanvasAssistRequest['template']
  messages: ChatMessage[]
  resourceTitle: string
  resourceSummary: string
  sourceText: string
  aiOptions?: Partial<AiAssistantOptions>
}): Promise<{
  channelKey: PlatformAiChannelKey
  data: AiCanvasAssistResult
  provider: { id?: string | null } | null
  usedFallback: boolean
  attemptChain: unknown[]
  latencyMs: number
}> {
  const sourceFormat = resolveCanvasSourceFormat(input.template)
  const channelKey = resolveCanvasChannelKey(input.action)
  const latestUserMessage = toCanvasAssistText(input.messages.at(-1)?.content)
  const conversation = buildCanvasConversationTranscript(input.messages)

  const execution = await runWithPlatformAiChannelFallback(input.runtime, channelKey, async ({ ai, prompt }) => {
    const model = createChatModel({
      ...ai,
      temperature: Number.isFinite(Number(input.aiOptions?.temperature))
        ? Math.max(0, Math.min(1, Number(input.aiOptions?.temperature)))
        : ai.temperature,
      maxRetries: 0,
    })

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', [
        '你是工作台设计画布 AI 助手。',
        '你只输出可直接导入的结构源正文。',
        prompt ? `[场景提示词]\n${prompt}` : '',
      ].filter(Boolean).join('\n\n')],
      ['human', '{message}'],
    ])

    const promptValue = await promptTemplate.invoke({
      message: buildCanvasAssistPrompt({
        action: input.action,
        template: input.template,
        sourceFormat,
        resourceTitle: input.resourceTitle,
        resourceSummary: input.resourceSummary,
        sourceText: input.sourceText,
        conversation,
        latestUserMessage,
      }),
    })
    const output = await model.invoke(promptValue)
    const sourceText = extractMessageText(output.content)
    if (!sourceText)
      throw new Error('画布 AI 未返回可用结构源。')
    const importPreview = buildCanvasAssistImportPreview({
      sourceText,
      sourceFormat,
      template: input.template,
    })

    return {
      assistantReply: '画布结构源预览已生成。',
      action: input.action,
      template: input.template,
      sourceFormat,
      sourceText,
      importPreview,
      previewSummary: importPreview?.summary || '画布结构源预览已生成。',
    } satisfies AiCanvasAssistResult
  })

  return {
    channelKey,
    data: execution.data,
    provider: execution.provider || null,
    usedFallback: execution.usedFallback,
    attemptChain: execution.attemptChain,
    latencyMs: execution.latencyMs,
  }
}
