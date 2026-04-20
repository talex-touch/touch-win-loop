import type {
  AiCanvasAssistRequest,
  AiCanvasAssistSourceFormat,
  AiCanvasAssistStreamEvent,
  AiCanvasAssistStreamEventType,
} from '~~/shared/types/domain'
import { createEventStream, setResponseStatus } from 'h3'
import {
  normalizeCanvasAction,
  normalizeCanvasTemplate,
  runCanvasAssistGeneration,
  toCanvasAssistText,
} from '~~/server/services/ai/canvas-assist'
import { buildProjectKnowledgeLocalContext } from '~~/server/services/ai/project-knowledge-context'
import { loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

function chunkText(text: string, chunkSize = 48): string[] {
  const normalized = toCanvasAssistText(text)
  if (!normalized)
    return []

  const chunks: string[] = []
  for (let index = 0; index < normalized.length; index += chunkSize)
    chunks.push(normalized.slice(index, index + chunkSize))
  return chunks
}

function normalizeRequest(body: Partial<AiCanvasAssistRequest> | null | undefined): AiCanvasAssistRequest {
  const context = body?.context || {}
  const workspaceId = toCanvasAssistText(body?.teamId || body?.workspaceId || context.teamId || context.workspaceId)
  return {
    teamId: workspaceId,
    workspaceId,
    projectId: toCanvasAssistText(body?.projectId || context.projectId),
    action: normalizeCanvasAction(body?.action),
    template: (toCanvasAssistText(body?.template) || 'flowchart') as AiCanvasAssistRequest['template'],
    messages: Array.isArray(body?.messages) ? body.messages : [],
    context: {
      teamId: workspaceId,
      workspaceId,
      projectId: toCanvasAssistText(body?.projectId || context.projectId),
      contestId: toCanvasAssistText(context.contestId),
      trackId: toCanvasAssistText(context.trackId),
      major: toCanvasAssistText(context.major),
      resourceId: toCanvasAssistText(context.resourceId),
      resourceTitle: toCanvasAssistText(context.resourceTitle),
      sourceText: toCanvasAssistText(context.sourceText),
      sourceFormat: (toCanvasAssistText(context.sourceFormat) || 'mermaid') as AiCanvasAssistSourceFormat,
    },
    aiOptions: body?.aiOptions || {},
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = normalizeRequest(await readBody<Partial<AiCanvasAssistRequest>>(event).catch(() => ({})))
  request.template = normalizeCanvasTemplate(request.template)
  const channelKey = request.action === 'complete'
    ? 'workspace_canvas_complete'
    : request.action === 'refine'
      ? 'workspace_canvas_refine'
      : 'workspace_canvas_generate'
  const channelRuntime = resolveAiRuntimeForChannel(runtime, channelKey)
  const aiConfig = {
    ...channelRuntime.ai,
    temperature: Number.isFinite(Number(request.aiOptions?.temperature))
      ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
      : channelRuntime.ai.temperature,
  }
  const latestUserMessage = [...request.messages]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?.trim() || ''

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

  if (request.action !== 'generate' && !toCanvasAssistText(request.context?.sourceText)) {
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

        const knowledgeContext = await buildProjectKnowledgeLocalContext(db, {
          projectId: request.projectId || '',
          query: [
            latestUserMessage,
            request.context?.resourceTitle,
            request.context?.sourceText,
          ].filter(Boolean).join('\n'),
          resources,
          contestName: '',
          trackName: '',
          major: request.context?.major,
          limit: 6,
          event,
        })

        return {
          resourceSummary: knowledgeContext.summaryText,
          knowledge: {
            citations: knowledgeContext.citations,
            warning: knowledgeContext.warning,
            usedFallback: knowledgeContext.usedFallback,
          },
        }
      })

      const execution = await runCanvasAssistGeneration({
        runtime,
        action: request.action,
        template: request.template,
        messages: request.messages,
        resourceTitle: request.context?.resourceTitle || '',
        resourceSummary: contextBundle.resourceSummary,
        sourceText: request.context?.sourceText || '',
        aiOptions: request.aiOptions,
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
            channelKey: execution.channelKey,
            providerId: execution.provider?.id || null,
            fallbackUsed: execution.usedFallback,
            attempts: execution.attemptChain.length,
            latencyMs: execution.latencyMs,
            remainingQuota: prepared.remainingQuota,
          },
        })
      })

      await pushEvent('done', {
        result: {
          ...execution.data,
          knowledge: execution.data.knowledge || contextBundle.knowledge,
        },
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
