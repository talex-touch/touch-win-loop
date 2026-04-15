import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { Queryable } from '~~/server/utils/db'
import type { AiWorkspaceDocumentSelectionRange, AuthUser, Resource } from '~~/shared/types/domain'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { convertMessagesToCompletionsMessageParams } from '@langchain/openai'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { resolvePlatformAiRequestBaseURL } from '~~/server/utils/platform-ai-base-url'
import { buildMergedPrompt } from '~~/server/utils/platform-ai-channels'
import { getProjectResourceById } from '~~/server/utils/project-resource-store'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'

const INLINE_COMPLETION_PREFIX_LIMIT = 1500
const INLINE_COMPLETION_SUFFIX_LIMIT = 500
const INLINE_COMPLETION_MAX_CHARS = 120
const INLINE_COMPLETION_MAX_LINES = 2
const INLINE_COMPLETION_DEFAULT_MAX_TOKENS = 160

interface OpenAiCompatibleChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>
    }
  }>
}

interface PartialModeChatModel {
  invocationParams: (options?: Record<string, unknown>, extra?: { streaming?: boolean }) => Record<string, unknown>
  completionWithRetry: (
    request: Record<string, unknown>,
    requestOptions?: { signal?: AbortSignal },
  ) => Promise<OpenAiCompatibleChatCompletionResponse>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeLineBreaks(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

function resolveInlineCompletionMaxTokens(ai: AiRuntimeConfig): number {
  const fallback = Math.min(INLINE_COMPLETION_DEFAULT_MAX_TOKENS, Math.max(32, Number(ai.maxTokens || INLINE_COMPLETION_DEFAULT_MAX_TOKENS)))
  return clampInt(ai.maxTokens, fallback, 32, 256)
}

function resolveNormalizedTemperature(ai: AiRuntimeConfig): number {
  const parsed = Number(ai.temperature)
  if (!Number.isFinite(parsed))
    return 0.2
  return Math.max(0, Math.min(1, parsed))
}

function extractOpenAiCompatibleMessageText(payload: OpenAiCompatibleChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string')
    return content

  if (Array.isArray(content)) {
    return content
      .map(item => String(item?.text || ''))
      .join('\n')
  }

  return ''
}

function extractLangChainMessageText(content: unknown): string {
  if (typeof content === 'string')
    return content

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .join('\n')
  }

  return ''
}

function stripCodeFenceWrapper(value: string): string {
  const normalized = normalizeLineBreaks(value).trim()
  if (!normalized.startsWith('```'))
    return normalized

  const lines = normalized.split('\n')
  if (lines.length < 2)
    return normalized.replace(/^```[^\n]*\n?/u, '').replace(/\n?```$/u, '').trim()

  const firstLine = lines[0] || ''
  const lastLine = lines[lines.length - 1] || ''
  if (!firstLine.startsWith('```') || !lastLine.startsWith('```'))
    return normalized

  return lines.slice(1, -1).join('\n').trim()
}

function stripLeadingLabel(value: string): string {
  return value.replace(/^(?:补全(?:内容)?|续写(?:内容)?|输出|正文|建议|completion|suggestion)\s*[:：]\s*/iu, '')
}

function trimSuggestionToLineLimit(value: string): string {
  const normalized = normalizeLineBreaks(value)
  const lines = normalized
    .split('\n')
    .slice(0, INLINE_COMPLETION_MAX_LINES)
    .map(line => line.replace(/\s+$/u, ''))
  return lines.join('\n').trim()
}

function removeSuggestionPrefixOverlap(value: string, suffix: string): string {
  const suggestion = String(value || '')
  const normalizedSuffix = String(suffix || '')
  const maxLength = Math.min(suggestion.length, normalizedSuffix.length)
  let matchedLength = 0

  for (let index = maxLength; index > 0; index -= 1) {
    if (suggestion.slice(0, index) === normalizedSuffix.slice(0, index)) {
      matchedLength = index
      break
    }
  }

  if (matchedLength <= 0)
    return suggestion

  return suggestion.slice(matchedLength).replace(/^\s+/u, '')
}

function buildInlineCompletionSystemPrompt(channelPrompt = ''): string {
  return buildMergedPrompt(
    channelPrompt,
    [
      '你是 WinLoop 协作文档的自动补齐引擎。',
      '你只负责生成“应当插入到当前位置”的新增正文，不要解释，不要标题，不要代码块围栏。',
      `输出最多 ${INLINE_COMPLETION_MAX_CHARS} 个字符，最多 ${INLINE_COMPLETION_MAX_LINES} 行。`,
      '如果给定的后文片段已经包含你准备输出的开头，请避免重复后文。',
      '保持当前文档语气、结构和主题一致。',
    ].join('\n'),
  )
}

function buildInlineCompletionUserPrompt(input: {
  resourceTitle: string
  suffix: string
}): string {
  return [
    `文档标题：${input.resourceTitle || '未命名文档'}`,
    '',
    '请基于后续 assistant 前缀继续补全文档。',
    '只输出新增内容，不要重复前缀。',
    '',
    '当前后文片段：',
    input.suffix || '（无后文）',
  ].join('\n')
}

export function supportsInlineCompletionPartialMode(ai: AiRuntimeConfig): boolean {
  if (ai.format === 'response')
    return false

  const model = normalizeString(ai.model).toLowerCase()
  return model.includes('qwen')
}

async function invokePartialModeInlineCompletion(input: {
  ai: AiRuntimeConfig
  systemPrompt: string
  userPrompt: string
  prefix: string
  signal?: AbortSignal
}): Promise<string> {
  const model = createChatModel({
    ...input.ai,
    temperature: resolveNormalizedTemperature(input.ai),
    maxTokens: resolveInlineCompletionMaxTokens(input.ai),
  })
  const partialModeModel = model as PartialModeChatModel
  const requestMessages = convertMessagesToCompletionsMessageParams({
    messages: [
      new SystemMessage(input.systemPrompt),
      new HumanMessage(input.userPrompt),
      new AIMessage({ content: input.prefix }),
    ],
    model: input.ai.model,
  }).map((message, index, messages) => {
    if (index !== messages.length - 1 || message.role !== 'assistant')
      return message

    return {
      ...message,
      partial: true,
    }
  })
  const requestPayload = {
    ...partialModeModel.invocationParams(),
    stream: false,
    messages: requestMessages,
  }

  try {
    console.info('[inline-completion] partial mode request', {
      provider: input.ai.provider,
      model: input.ai.model,
      baseURL: resolvePlatformAiRequestBaseURL(input.ai.baseURL, input.ai.provider),
      timeoutMs: input.ai.timeoutMs,
      request: requestPayload,
    })

    const response = await partialModeModel.completionWithRetry(requestPayload, {
      signal: input.signal,
    })

    return extractOpenAiCompatibleMessageText(response).trim()
  }
  catch (error) {
    if (input.signal?.aborted)
      throw error

    const message = error instanceof Error
      ? (error.message || error.name || 'UNKNOWN_ERROR')
      : 'UNKNOWN_ERROR'
    if (/timed out/i.test(message))
      throw new Error('INLINE_COMPLETION_TIMEOUT')

    throw error
  }
}

async function invokePromptModeInlineCompletion(input: {
  ai: AiRuntimeConfig
  systemPrompt: string
  userPrompt: string
  signal?: AbortSignal
}): Promise<string> {
  const model = createChatModel({
    ...input.ai,
    temperature: resolveNormalizedTemperature(input.ai),
    maxTokens: resolveInlineCompletionMaxTokens(input.ai),
  })
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', '{systemPrompt}'],
    ['human', '{userPrompt}'],
  ])
  const promptValue = await prompt.invoke({
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
  })
  const output = await model.invoke(promptValue)
  return normalizeString(extractLangChainMessageText(output.content))
}

export function resolveInlineCompletionCursorOffset(
  markdown: string,
  selectionRange: AiWorkspaceDocumentSelectionRange | null | undefined,
): number {
  const normalizedMarkdown = normalizeLineBreaks(markdown)
  const targetLine = Math.max(1, Math.trunc(Number(selectionRange?.headLine || selectionRange?.anchorLine || 1)))
  const targetColumn = Math.max(1, Math.trunc(Number(selectionRange?.headColumn || selectionRange?.anchorColumn || 1)))

  let line = 1
  let column = 1

  for (let index = 0; index < normalizedMarkdown.length; index += 1) {
    if (line === targetLine && column === targetColumn)
      return index

    if (normalizedMarkdown[index] === '\n') {
      line += 1
      column = 1
    }
    else {
      column += 1
    }
  }

  return normalizedMarkdown.length
}

export function normalizeInlineCompletionSuggestion(input: {
  suggestion: string
  suffix: string
}): string {
  let normalized = stripCodeFenceWrapper(String(input.suggestion || ''))
  normalized = stripLeadingLabel(normalized)
  normalized = trimSuggestionToLineLimit(normalized)
  normalized = removeSuggestionPrefixOverlap(normalized, normalizeLineBreaks(input.suffix || ''))
  normalized = trimSuggestionToLineLimit(normalized)

  if (normalized.length > INLINE_COMPLETION_MAX_CHARS)
    normalized = normalized.slice(0, INLINE_COMPLETION_MAX_CHARS).trimEnd()

  return normalized.trim()
}

export async function generateWorkspaceInlineCompletion(input: {
  ai: AiRuntimeConfig
  channelPrompt?: string
  resourceTitle?: string
  markdown: string
  selectionRange: AiWorkspaceDocumentSelectionRange
  signal?: AbortSignal
}): Promise<string> {
  const normalizedMarkdown = normalizeLineBreaks(input.markdown)
  const cursorOffset = resolveInlineCompletionCursorOffset(normalizedMarkdown, input.selectionRange)
  const prefix = normalizedMarkdown.slice(Math.max(0, cursorOffset - INLINE_COMPLETION_PREFIX_LIMIT), cursorOffset)
  const suffix = normalizedMarkdown.slice(cursorOffset, cursorOffset + INLINE_COMPLETION_SUFFIX_LIMIT)
  const systemPrompt = buildInlineCompletionSystemPrompt(input.channelPrompt || '')
  const userPrompt = buildInlineCompletionUserPrompt({
    resourceTitle: normalizeString(input.resourceTitle) || '未命名文档',
    suffix,
  })

  let rawSuggestion = ''
  const promptModeUserPrompt = [
    userPrompt,
    '',
    '前文片段：',
    prefix || '（无前文）',
  ].join('\n')

  if (supportsInlineCompletionPartialMode(input.ai) && prefix) {
    try {
      rawSuggestion = await invokePartialModeInlineCompletion({
        ai: input.ai,
        systemPrompt,
        userPrompt,
        prefix,
        signal: input.signal,
      })
    }
    catch (error) {
      if (input.signal?.aborted)
        throw error

      console.warn('[inline-completion] partial mode failed, fallback to prompt mode', {
        provider: input.ai.provider,
        model: input.ai.model,
        baseURL: resolvePlatformAiRequestBaseURL(input.ai.baseURL, input.ai.provider),
        error: error instanceof Error ? (error.message || error.name || 'UNKNOWN_ERROR') : 'UNKNOWN_ERROR',
      })

      rawSuggestion = await invokePromptModeInlineCompletion({
        ai: input.ai,
        systemPrompt,
        userPrompt: promptModeUserPrompt,
        signal: input.signal,
      })
    }
  }
  else {
    rawSuggestion = await invokePromptModeInlineCompletion({
      ai: input.ai,
      systemPrompt,
      userPrompt: promptModeUserPrompt,
      signal: input.signal,
    })
  }

  return normalizeInlineCompletionSuggestion({
    suggestion: rawSuggestion,
    suffix,
  })
}

export async function getWorkspaceInlineCompletionResource(
  db: Queryable,
  input: {
    user: AuthUser
    workspaceId: string
    projectId: string
    resourceId: string
  },
): Promise<Resource> {
  const canUseWorkspace = await teamHasWorkspaceMembership(db, input.user, input.workspaceId)
  if (!canUseWorkspace)
    throw new Error('FORBIDDEN')

  const projectResult = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [input.projectId],
  )
  const projectWorkspaceId = normalizeString(projectResult.rows[0]?.workspace_id)
  if (!projectWorkspaceId)
    throw new Error('PROJECT_NOT_FOUND')
  if (projectWorkspaceId !== input.workspaceId)
    throw new Error('PROJECT_SCOPE_MISMATCH')

  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
  })
  if (!resource)
    throw new Error('RESOURCE_NOT_FOUND')
  if (resource.resourceKind !== 'markdown' || resource.collabPurpose !== 'notes')
    throw new Error('RESOURCE_NOT_SUPPORTED')

  return resource
}
