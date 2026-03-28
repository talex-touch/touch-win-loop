import type {
  AdminAgentRunRequest,
  AdminAgentStreamEvent,
  AdminAgentStreamEventType,
  AdminAgentTaskType,
} from '~~/shared/types/domain'
import { createEventStream, setResponseStatus } from 'h3'
import { executeAdminAgent } from '~~/server/services/admin-ai/orchestrator'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  appendAiChatMessage,
  createAiChatSession,
  getAiChatSessionById,
  patchAiChatSessionContext,
} from '~~/server/utils/chat-store'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

const ALLOWED_TASK_TYPES: AdminAgentTaskType[] = [
  'publish_assistant',
  'import_sync_analysis',
  'general',
]

function normalizeTaskType(value: unknown): AdminAgentTaskType {
  const text = String(value || '').trim() as AdminAgentTaskType
  return ALLOWED_TASK_TYPES.includes(text) ? text : 'general'
}

function normalizeRequest(body: Partial<AdminAgentRunRequest> | null | undefined): AdminAgentRunRequest {
  const context = body?.context || {}

  return {
    workspaceId: String(body?.workspaceId || '').trim(),
    contestId: String(body?.contestId || '').trim(),
    sessionId: String(body?.sessionId || '').trim() || undefined,
    taskType: normalizeTaskType(body?.taskType),
    message: String(body?.message || '').trim(),
    context: {
      trackId: String(context.trackId || '').trim() || undefined,
      major: String(context.major || '').trim() || undefined,
      csvText: String(context.csvText || '').trim() || undefined,
      sourceId: String(context.sourceId || '').trim() || undefined,
      sourceUrl: String(context.sourceUrl || '').trim() || undefined,
      targetModule: context.targetModule,
    },
  }
}

function buildSessionTitle(request: AdminAgentRunRequest): string {
  const map: Record<AdminAgentTaskType, string> = {
    publish_assistant: '发布助手',
    import_sync_analysis: '导入同步分析',
    general: '管理助手',
  }

  return `管理助手 · ${map[request.taskType]}`
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message || 'UNKNOWN_ERROR'
  return 'UNKNOWN_ERROR'
}

function resolveAdminChannelKey(taskType: AdminAgentTaskType): 'admin_general' | 'admin_publish_assistant' | 'admin_import_sync_analysis' {
  if (taskType === 'publish_assistant')
    return 'admin_publish_assistant'
  if (taskType === 'import_sync_analysis')
    return 'admin_import_sync_analysis'
  return 'admin_general'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = normalizeRequest(await readBody<Partial<AdminAgentRunRequest>>(event).catch(() => ({})))
  const channelRuntime = resolveAiRuntimeForChannel(runtime, resolveAdminChannelKey(request.taskType))
  const adminAiConfig = channelRuntime.ai

  if (!runtime.adminAi.enabled) {
    setResponseStatus(event, 404)
    return fail('管理侧 AI 助手未启用。', {
      startedAt,
      provider: adminAiConfig.provider,
      model: adminAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40493)
  }

  if (!request.workspaceId || !request.contestId || !request.message) {
    setResponseStatus(event, 400)
    return fail('workspaceId、contestId、message 不能为空。', {
      startedAt,
      provider: adminAiConfig.provider,
      model: adminAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权使用管理侧 AI 助手。', {
      startedAt,
      provider: adminAiConfig.provider,
      model: adminAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40393)
  }

  const prepared = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, user, request.workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    const session = request.sessionId
      ? await getAiChatSessionById(db, {
          workspaceId: request.workspaceId,
          sessionId: request.sessionId,
        })
      : await createAiChatSession(db, {
          workspaceId: request.workspaceId,
          createdByUserId: user.id,
          title: buildSessionTitle(request),
          contestId: request.contestId,
          trackId: request.context?.trackId,
          major: request.context?.major,
        })

    if (!session)
      throw new Error('SESSION_NOT_FOUND')

    await patchAiChatSessionContext(db, {
      workspaceId: request.workspaceId,
      sessionId: session.id,
      contestId: request.contestId,
      trackId: request.context?.trackId,
      major: request.context?.major,
      title: buildSessionTitle(request),
    })

    const quota = await teamConsumeAiQuota(db, {
      workspaceId: request.workspaceId,
      userId: user.id,
      route: '/api/admin/ai/stream',
      units: 1,
    })

    if (!quota.allowed)
      throw new Error('QUOTA_EXCEEDED')

    return {
      sessionId: session.id,
      remainingQuota: quota.remaining,
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return null
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return 'SESSION_NOT_FOUND'
    }
    if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return 'QUOTA_EXCEEDED'
    }
    throw error
  })

  if (!prepared) {
    return fail('当前用户无权使用该空间。', {
      startedAt,
      provider: adminAiConfig.provider,
      model: adminAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40394)
  }

  if (prepared === 'SESSION_NOT_FOUND') {
    return fail('会话不存在，请刷新后重试。', {
      startedAt,
      provider: adminAiConfig.provider,
      model: adminAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40494)
  }

  if (prepared === 'QUOTA_EXCEEDED') {
    return fail('Team AI 额度不足，请扩容或等待重置。', {
      startedAt,
      provider: adminAiConfig.provider,
      model: adminAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42994)
  }

  const stream = createEventStream(event)

  const pushEvent = async (eventType: AdminAgentStreamEventType, data: Record<string, unknown>) => {
    const payload: AdminAgentStreamEvent = {
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
        message: '已建立会话并开始执行任务。',
        sessionId: prepared.sessionId,
      })

      const execution = await executeAdminAgent(event, request, {
        onProgress: message => pushEvent('progress', { message }),
        onTool: (name, payload) => pushEvent('tool', {
          name,
          payload,
        }),
        onDelta: text => pushEvent('delta', { text }),
        onArtifact: artifact => pushEvent('artifact', { artifact }),
      }, {
        runtime: {
          ...runtime,
          ai: {
            ...runtime.ai,
            ...adminAiConfig,
          },
        },
        channelPrompt: channelRuntime.prompt,
      })

      await withTransaction(event, async (db) => {
        const canUseWorkspace = await teamHasWorkspaceMembership(db, user, request.workspaceId)
        if (!canUseWorkspace)
          throw new Error('FORBIDDEN')

        if (request.message) {
          await appendAiChatMessage(db, {
            workspaceId: request.workspaceId,
            sessionId: prepared.sessionId,
            role: 'user',
            content: request.message,
            provider: adminAiConfig.provider,
            model: adminAiConfig.model,
            fallbackUsed: false,
            createdByUserId: user.id,
          })
        }

        await appendAiChatMessage(db, {
          workspaceId: request.workspaceId,
          sessionId: prepared.sessionId,
          role: 'assistant',
          content: execution.data.assistantReply,
          provider: adminAiConfig.provider,
          model: adminAiConfig.model,
          fallbackUsed: execution.fallbackUsed,
          createdByUserId: user.id,
        })

        await patchAiChatSessionContext(db, {
          workspaceId: request.workspaceId,
          sessionId: prepared.sessionId,
          contestId: request.contestId,
          trackId: request.context?.trackId,
          major: request.context?.major,
          title: buildSessionTitle(request),
        })

        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'ai.invoke.admin_agent',
          contestId: request.contestId,
          payload: {
            route: '/api/admin/ai/stream',
            workspaceId: request.workspaceId,
            sessionId: prepared.sessionId,
            taskType: request.taskType,
            channelKey: channelRuntime.key,
            providerId: channelRuntime.provider?.id || null,
            fallbackUsed: execution.fallbackUsed,
            attempts: execution.attempts,
            latencyMs: Date.now() - startedAt,
            remainingQuota: prepared.remainingQuota,
          },
        })
      })

      await pushEvent('done', {
        result: {
          ...execution.data,
          sessionId: prepared.sessionId,
        },
        meta: {
          attempts: execution.attempts,
          fallbackUsed: execution.fallbackUsed,
          latencyMs: Date.now() - startedAt,
        },
      })
    }
    catch (error) {
      const message = toErrorMessage(error)

      await withTransaction(event, async (db) => {
        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'ai.invoke.admin_agent_failed',
          contestId: request.contestId,
          payload: {
            route: '/api/admin/ai/stream',
            workspaceId: request.workspaceId,
            sessionId: prepared.sessionId,
            taskType: request.taskType,
            channelKey: channelRuntime.key,
            providerId: channelRuntime.provider?.id || null,
            error: message,
            latencyMs: Date.now() - startedAt,
          },
        })
      }).catch(() => undefined)

      await pushEvent('error', {
        message,
      })
    }
    finally {
      await stream.close()
    }
  }

  void run()
  return stream.send()
})
