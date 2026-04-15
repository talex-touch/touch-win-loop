import type {
  AiCanvasAssistAction,
  AiCanvasAssistRequest,
  AiCanvasAssistResult,
  AiCanvasAssistSourceFormat,
  AiCanvasAssistStreamEvent,
  AiCanvasAssistStreamEventType,
  ChatMessage,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { createEventStream, setResponseStatus } from 'h3'
import { buildProjectResourceLocalContext, loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { resolveAiRuntimeForChannel, runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

const MAX_CANVAS_ASSIST_MESSAGES = 8

function toText(value: unknown): string {
  return String(value || '').trim()
}

function chunkText(text: string, chunkSize = 48): string[] {
  const normalized = toText(text)
  if (!normalized)
    return []

  const chunks: string[] = []
  for (let index = 0; index < normalized.length; index += chunkSize)
    chunks.push(normalized.slice(index, index + chunkSize))
  return chunks
}

function normalizeCanvasAction(value: unknown): AiCanvasAssistAction {
  const normalized = toText(value)
  if (normalized === 'complete' || normalized === 'refine')
    return normalized
  return 'generate'
}

function normalizeRequest(body: Partial<AiCanvasAssistRequest> | null | undefined): AiCanvasAssistRequest {
  const context = body?.context || {}
  const workspaceId = toText(body?.teamId || body?.workspaceId || context.teamId || context.workspaceId)
  return {
    teamId: workspaceId,
    workspaceId,
    projectId: toText(body?.projectId || context.projectId),
    action: normalizeCanvasAction(body?.action),
    template: (toText(body?.template) || 'flowchart') as AiCanvasAssistRequest['template'],
    messages: Array.isArray(body?.messages) ? body.messages : [],
    context: {
      teamId: workspaceId,
      workspaceId,
      projectId: toText(body?.projectId || context.projectId),
      contestId: toText(context.contestId),
      trackId: toText(context.trackId),
      major: toText(context.major),
      resourceId: toText(context.resourceId),
      resourceTitle: toText(context.resourceTitle),
      sourceText: toText(context.sourceText),
      sourceFormat: (toText(context.sourceFormat) || 'mermaid') as AiCanvasAssistSourceFormat,
    },
    aiOptions: body?.aiOptions || {},
  }
}

function normalizeCanvasTemplate(value: unknown): AiCanvasAssistRequest['template'] {
  const normalized = toText(value)
  if (normalized === 'mindmap' || normalized === 'er' || normalized === 'architecture')
    return normalized
  return 'flowchart'
}

function resolveCanvasChannelKey(action: AiCanvasAssistAction): 'workspace_canvas_generate' | 'workspace_canvas_complete' | 'workspace_canvas_refine' {
  if (action === 'complete')
    return 'workspace_canvas_complete'
  if (action === 'refine')
    return 'workspace_canvas_refine'
  return 'workspace_canvas_generate'
}

function resolveCanvasSourceFormat(template: AiCanvasAssistRequest['template']): AiCanvasAssistSourceFormat {
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
      content: toText(message.content),
    }))
    .filter(message => Boolean(message.content))
    .slice(-MAX_CANVAS_ASSIST_MESSAGES)
}

function buildConversationTranscript(messages: ChatMessage[]): string {
  const normalized = normalizeConversationMessages(messages)
  if (normalized.length === 0)
    return '（无历史消息）'

  return normalized
    .map(message => `${message.role === 'assistant' ? '助手' : '用户'}：${message.content}`)
    .join('\n')
}

function stripCodeFence(text: string): string {
  const normalized = toText(text)
  const match = normalized.match(/^```[a-zA-Z0-9_-]*\n?([\s\S]*?)```$/)
  return match?.[1]?.trim() || normalized
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

function buildCanvasPrompt(input: {
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

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = normalizeRequest(await readBody<Partial<AiCanvasAssistRequest>>(event).catch(() => ({})))
  request.template = normalizeCanvasTemplate(request.template)
  const channelKey = resolveCanvasChannelKey(request.action)
  const channelRuntime = resolveAiRuntimeForChannel(runtime, channelKey)
  const aiConfig = {
    ...channelRuntime.ai,
    temperature: Number.isFinite(Number(request.aiOptions?.temperature))
      ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
      : channelRuntime.ai.temperature,
  }

  if (!request.workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用画布 AI 时必须传 workspaceId。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40096)
  }

  if (!request.projectId) {
    setResponseStatus(event, 400)
    return fail('调用画布 AI 时必须传 projectId。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  if (request.action !== 'generate' && !toText(request.context?.sourceText)) {
    setResponseStatus(event, 400)
    return fail('当前图结构为空，暂时无法执行补全或续改。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  if (!isAiRuntimeConfigured(aiConfig)) {
    setResponseStatus(event, 503)
    return fail(buildAiNotConfiguredMessage(channelRuntime.channel.label || '画布 AI'), {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50396)
  }

  const prepared = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, user, request.workspaceId || '')
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    const quota = await teamConsumeAiQuota(db, {
      workspaceId: request.workspaceId || '',
      userId: user.id,
      route: '/api/ai/canvas/stream',
      units: 1,
    })
    if (!quota.allowed)
      throw new Error('QUOTA_EXCEEDED')

    return {
      remainingQuota: quota.remaining,
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return 'FORBIDDEN'
    }
    if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return 'QUOTA_EXCEEDED'
    }
    throw error
  })

  if (prepared === 'FORBIDDEN') {
    return fail('当前用户无权使用该空间。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40396)
  }

  if (prepared === 'QUOTA_EXCEEDED') {
    return fail('Team AI 额度不足，请扩容或等待重置。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42996)
  }

  const stream = createEventStream(event)
  const pushEvent = async (eventType: AiCanvasAssistStreamEventType, data: Record<string, unknown>) => {
    const payload: AiCanvasAssistStreamEvent = {
      event: eventType,
      data,
    }
    await stream.push({
      event: eventType,
      data: JSON.stringify(payload),
    })
  }

  const run = async () => {
    try {
      await pushEvent('progress', {
        message: 'AI 正在读取当前画布与项目上下文...',
      })

      const contextBundle = await withClient(event, async (db) => {
        const resources = await loadVisibleProjectResourcesForAi(db, user, {
          workspaceId: request.workspaceId || '',
          projectId: request.projectId || '',
        })

        return {
          resourceSummary: buildProjectResourceLocalContext(resources, {
            contestName: '',
            trackName: '',
            major: request.context?.major,
            limit: 8,
          }),
        }
      })

      const sourceFormat = resolveCanvasSourceFormat(request.template)
      const latestUserMessage = toText(request.messages.at(-1)?.content)
      const conversation = buildConversationTranscript(request.messages)

      const execution = await runWithPlatformAiChannelFallback(runtime, channelKey, async ({ ai, prompt }) => {
        const model = createChatModel({
          ...ai,
          temperature: Number.isFinite(Number(request.aiOptions?.temperature))
            ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
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
          message: buildCanvasPrompt({
            action: request.action,
            template: request.template,
            sourceFormat,
            resourceTitle: request.context?.resourceTitle || '',
            resourceSummary: contextBundle.resourceSummary,
            sourceText: request.context?.sourceText || '',
            conversation,
            latestUserMessage,
          }),
        })
        const output = await model.invoke(promptValue)
        const sourceText = extractMessageText(output.content)
        if (!sourceText)
          throw new Error('画布 AI 未返回可用结构源。')

        const result: AiCanvasAssistResult = {
          assistantReply: '画布结构源预览已生成。',
          action: request.action,
          template: request.template,
          sourceFormat,
          sourceText,
        }

        return result
      })

      await pushEvent('progress', {
        message: 'AI 已生成结构源预览，正在返回结果...',
      })
      for (const chunk of chunkText(execution.data.sourceText))
        await pushEvent('delta', { text: chunk })

      await withTransaction(event, async (db) => {
        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'ai.invoke.workspace_canvas',
          contestId: request.context?.contestId,
          payload: {
            route: '/api/ai/canvas/stream',
            workspaceId: request.workspaceId,
            projectId: request.projectId,
            action: request.action,
            template: request.template,
            channelKey,
            providerId: execution.provider?.id || null,
            fallbackUsed: execution.usedFallback,
            attempts: execution.attemptChain.length,
            remainingQuota: prepared.remainingQuota,
          },
        })
      })

      await pushEvent('done', {
        result: execution.data,
      })
    }
    catch (error) {
      await pushEvent('error', {
        message: error instanceof Error ? (error.message || 'CANVAS_AI_FAILED') : 'CANVAS_AI_FAILED',
      })
    }
    finally {
      await stream.close()
    }
  }

  run()
  return stream.send()
})
