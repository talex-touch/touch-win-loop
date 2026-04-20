import type { AiWorkspaceInlineCompletionRequest, AiWorkspaceInlineCompletionResult } from '~~/shared/types/domain'
import { createEventStream, setResponseStatus } from 'h3'
import { generateWorkspaceInlineCompletion, getWorkspaceInlineCompletionResource } from '~~/server/services/ai/workspace-inline-completion'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

const INLINE_COMPLETION_TIMEOUT_MS = 120_000
const INLINE_COMPLETION_CACHE_TTL_MS = 10 * 60_000
const INLINE_COMPLETION_HEARTBEAT_MS = 10_000

const inlineCompletionResultCache = new Map<string, {
  suggestion: string
  expiresAt: number
}>()

const inlineCompletionInflightCache = new Map<string, Promise<string>>()

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
  return error.name === 'TimeoutError'
    || error.message === 'INLINE_COMPLETION_TIMEOUT'
    || /timed out/i.test(String(error.message || ''))
}

function isInlineCompletionModelMissingError(error: unknown): boolean {
  if (!(error instanceof Error))
    return false

  const message = String(error.message || '')
  return /model not exist|model_not_supported|invalid_request_error/i.test(message)
    && /model/i.test(message)
}

function resolveInlineCompletionFailure(input: {
  error: unknown
  channelLabel: string
}): {
  message: string
  code: number
} {
  if (isInlineCompletionTimeoutError(input.error)) {
    return {
      message: '文档自动补齐请求超时，请检查当前续写模型是否可用。',
      code: 50497,
    }
  }

  if (isInlineCompletionModelMissingError(input.error)) {
    return {
      message: `文档自动补齐当前配置的模型不存在或不支持当前补全模式，请在后台 AI 场景检查「${input.channelLabel || '文档续写'}」模型配置。`,
      code: 50299,
    }
  }

  return {
    message: '文档自动补齐请求失败，请稍后重试。',
    code: 50298,
  }
}

function cleanupInlineCompletionResultCache(now = Date.now()): void {
  for (const [cacheKey, entry] of inlineCompletionResultCache.entries()) {
    if (entry.expiresAt > now)
      continue
    inlineCompletionResultCache.delete(cacheKey)
  }
}

function buildInlineCompletionCacheKey(input: {
  request: AiWorkspaceInlineCompletionRequest
  aiConfig: Record<string, unknown>
  channelPrompt: string
}): string {
  return JSON.stringify({
    workspaceId: input.request.workspaceId,
    projectId: input.request.projectId,
    resourceId: input.request.context?.resourceId || '',
    resourceTitle: input.request.context?.resourceTitle || '',
    markdown: input.request.context?.markdown || '',
    selectionRange: input.request.context?.selectionRange || null,
    ai: {
      provider: input.aiConfig.provider,
      baseURL: input.aiConfig.baseURL,
      model: input.aiConfig.model,
      format: input.aiConfig.format,
      temperature: input.aiConfig.temperature,
      topP: input.aiConfig.topP,
      maxTokens: input.aiConfig.maxTokens,
      presencePenalty: input.aiConfig.presencePenalty,
      frequencyPenalty: input.aiConfig.frequencyPenalty,
    },
    channelPrompt: input.channelPrompt || '',
  })
}

function getCachedInlineCompletionSuggestion(cacheKey: string): string | null {
  cleanupInlineCompletionResultCache()
  const cached = inlineCompletionResultCache.get(cacheKey)
  if (!cached)
    return null
  if (cached.expiresAt <= Date.now()) {
    inlineCompletionResultCache.delete(cacheKey)
    return null
  }
  return cached.suggestion
}

function setCachedInlineCompletionSuggestion(cacheKey: string, suggestion: string): void {
  cleanupInlineCompletionResultCache()
  inlineCompletionResultCache.set(cacheKey, {
    suggestion,
    expiresAt: Date.now() + INLINE_COMPLETION_CACHE_TTL_MS,
  })
}

async function runInlineCompletionWithTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort('INLINE_COMPLETION_TIMEOUT')
  }, timeoutMs)

  const timeoutPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(new Error('INLINE_COMPLETION_TIMEOUT'))
    }, { once: true })
  })

  try {
    return await Promise.race([
      task(controller.signal),
      timeoutPromise,
    ])
  }
  finally {
    clearTimeout(timer)
  }
}

function getSharedInlineCompletionPromise(input: {
  cacheKey: string
  timeoutMs: number
  task: (signal: AbortSignal) => Promise<string>
}): {
  promise: Promise<string>
  shared: boolean
} {
  const existingPromise = inlineCompletionInflightCache.get(input.cacheKey)
  if (existingPromise) {
    return {
      promise: existingPromise,
      shared: true,
    }
  }

  const promise = runInlineCompletionWithTimeout(input.timeoutMs, input.task)
    .then((suggestion) => {
      setCachedInlineCompletionSuggestion(input.cacheKey, suggestion)
      return suggestion
    })
    .finally(() => {
      if (inlineCompletionInflightCache.get(input.cacheKey) === promise)
        inlineCompletionInflightCache.delete(input.cacheKey)
    })

  inlineCompletionInflightCache.set(input.cacheKey, promise)
  return {
    promise,
    shared: false,
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = normalizeRequest(await readBody<Partial<AiWorkspaceInlineCompletionRequest>>(event).catch(() => ({})))
  const channelRuntime = resolveAiRuntimeForChannel(runtime, 'workspace_document_continue')
  const completionAi = {
    ...channelRuntime.ai,
    timeoutMs: Math.max(INLINE_COMPLETION_TIMEOUT_MS, Number(channelRuntime.ai.timeoutMs || 0) || INLINE_COMPLETION_TIMEOUT_MS),
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

  const selectionRange = request.context?.selectionRange
  if (!selectionRange?.isCollapsed) {
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

  const stream = createEventStream(event)
  const pushEvent = async (eventType: 'heartbeat' | 'done' | 'error', data: Record<string, unknown>) => {
    await stream.push({
      event: eventType,
      data: JSON.stringify({
        event: eventType,
        data,
      }),
    })
  }
  const cacheKey = buildInlineCompletionCacheKey({
    request,
    aiConfig,
    channelPrompt: channelRuntime.prompt || '',
  })
  const cachedSuggestion = getCachedInlineCompletionSuggestion(cacheKey)
  const run = async () => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null

    try {
      await pushEvent('heartbeat', {
        at: Date.now(),
      })
      heartbeatTimer = setInterval(() => {
        void pushEvent('heartbeat', {
          at: Date.now(),
        }).catch(() => undefined)
      }, INLINE_COMPLETION_HEARTBEAT_MS)

      let suggestion = cachedSuggestion
      if (suggestion === null) {
        const sharedRequest = getSharedInlineCompletionPromise({
          cacheKey,
          timeoutMs: aiConfig.timeoutMs,
          task: signal => generateWorkspaceInlineCompletion({
            ai: aiConfig,
            channelPrompt: channelRuntime.prompt,
            resourceTitle: request.context?.resourceTitle || resourceCheck.title,
            markdown: request.context?.markdown || '',
            selectionRange,
            signal,
          }),
        })
        suggestion = await sharedRequest.promise
      }

      await pushEvent('done', {
        result: {
          suggestion,
        } satisfies AiWorkspaceInlineCompletionResult,
        meta: {
          provider: aiConfig.provider,
          model: aiConfig.model,
          latencyMs: Date.now() - startedAt,
        },
      })
    }
    catch (error) {
      const failure = resolveInlineCompletionFailure({
        error,
        channelLabel: channelRuntime.channel.label || '文档续写',
      })
      console.error('[inline-completion] request failed', {
        provider: aiConfig.provider,
        model: aiConfig.model,
        baseURL: aiConfig.baseURL,
        timeoutMs: aiConfig.timeoutMs,
        resourceId: request.context?.resourceId || '',
        selectionRange: request.context?.selectionRange || null,
        error: error instanceof Error ? (error.message || error.name || 'UNKNOWN_ERROR') : 'UNKNOWN_ERROR',
      })

      await pushEvent('error', {
        message: failure.message,
        code: failure.code,
      })
    }
    finally {
      if (heartbeatTimer)
        clearInterval(heartbeatTimer)
      await stream.close()
    }
  }

  void run()
  return stream.send()
})
