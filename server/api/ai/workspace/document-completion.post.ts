import type { AiWorkspaceInlineCompletionRequest, AiWorkspaceInlineCompletionResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { generateWorkspaceInlineCompletion, getWorkspaceInlineCompletionResource } from '~~/server/services/ai/workspace-inline-completion'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRequest(body: Partial<AiWorkspaceInlineCompletionRequest> | null | undefined): AiWorkspaceInlineCompletionRequest {
  const context = body?.context || {}
  const workspaceId = toText(body?.teamId || body?.workspaceId || context.teamId || context.workspaceId)
  const projectId = toText(body?.projectId || context.projectId)
  return {
    teamId: workspaceId,
    workspaceId,
    projectId,
    context: {
      teamId: workspaceId,
      workspaceId,
      projectId,
      resourceId: toText(context.resourceId),
      resourceTitle: toText(context.resourceTitle),
      markdown: toText(context.markdown),
      selectionRange: context.selectionRange || null,
    },
    aiOptions: body?.aiOptions || {},
  }
}

function isInlineCompletionTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error))
    return false
  return error.name === 'TimeoutError' || /timed out/i.test(String(error.message || ''))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = normalizeRequest(await readBody<Partial<AiWorkspaceInlineCompletionRequest>>(event).catch(() => ({})))
  const channelRuntime = resolveAiRuntimeForChannel(runtime, 'workspace_document_continue')
  const completionAi = {
    ...channelRuntime.ai,
    maxRetries: 0,
  }
  const aiConfig = {
    ...completionAi,
    temperature: Number.isFinite(Number(request.aiOptions?.temperature))
      ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
      : completionAi.temperature,
  }

  if (!request.workspaceId || !request.projectId || !request.context?.resourceId) {
    setResponseStatus(event, 400)
    return fail('调用文档自动补齐时必须传 workspaceId、projectId 和 resourceId。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  if (!request.context?.selectionRange?.isCollapsed) {
    setResponseStatus(event, 400)
    return fail('文档自动补齐只支持折叠光标。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  if (!request.context?.markdown) {
    setResponseStatus(event, 400)
    return fail('当前文档内容为空，暂时无法生成补齐建议。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  if (!isAiRuntimeConfigured(aiConfig)) {
    setResponseStatus(event, 503)
    return fail(buildAiNotConfiguredMessage(channelRuntime.channel.label || '文档续写 AI'), {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50397)
  }

  const resourceCheck = await withClient(event, async (db) => {
    return getWorkspaceInlineCompletionResource(db, {
      user,
      workspaceId: request.workspaceId || '',
      projectId: request.projectId || '',
      resourceId: request.context?.resourceId || '',
    })
  }).catch((error) => {
    if (error instanceof Error)
      return error.message
    throw error
  })

  if (typeof resourceCheck === 'string') {
    if (resourceCheck === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权访问该空间。', {
        startedAt,
        provider: aiConfig.provider,
        model: aiConfig.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40397)
    }

    if (resourceCheck === 'PROJECT_NOT_FOUND' || resourceCheck === 'RESOURCE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标文档不存在，请刷新后重试。', {
        startedAt,
        provider: aiConfig.provider,
        model: aiConfig.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40497)
    }

    setResponseStatus(event, 400)
    return fail('当前资源不支持自动补齐。', {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400910)
  }

  try {
    const suggestion = await generateWorkspaceInlineCompletion({
      ai: aiConfig,
      channelPrompt: channelRuntime.prompt,
      resourceTitle: request.context?.resourceTitle || resourceCheck.title,
      markdown: request.context?.markdown || '',
      selectionRange: request.context?.selectionRange,
    })

    return ok<AiWorkspaceInlineCompletionResult>({
      suggestion,
    }, {
      startedAt,
      provider: aiConfig.provider,
      model: aiConfig.model,
      fallbackUsed: channelRuntime.usedFallback,
      attempts: 1,
    })
  }
  catch (error) {
    const timedOut = isInlineCompletionTimeoutError(error)
    console.error('[inline-completion] request failed', {
      provider: aiConfig.provider,
      model: aiConfig.model,
      baseURL: aiConfig.baseURL,
      resourceId: request.context?.resourceId || '',
      selectionRange: request.context?.selectionRange || null,
      error: error instanceof Error ? (error.message || error.name || 'UNKNOWN_ERROR') : 'UNKNOWN_ERROR',
    })

    setResponseStatus(event, timedOut ? 504 : 502)
    return fail(
      timedOut
        ? '文档自动补齐请求超时，请检查当前续写模型是否可用。'
        : '文档自动补齐请求失败，请稍后重试。',
      {
        startedAt,
        provider: aiConfig.provider,
        model: aiConfig.model,
        fallbackUsed: channelRuntime.usedFallback,
        attempts: 1,
      },
      timedOut ? 50497 : 50298,
    )
  }
})
