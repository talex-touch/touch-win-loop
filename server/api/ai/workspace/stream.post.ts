import type {
  AiWorkspaceRequest,
  AiWorkspaceResult,
  AiWorkspaceStreamEvent,
  AiWorkspaceStreamEventType,
  WorkspaceAiMode,
} from '~~/shared/types/domain'
import { createEventStream, setResponseStatus } from 'h3'
import { buildProjectResourceLocalContext, loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { executeWorkspaceAi } from '~~/server/services/ai/workspace-orchestrator'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  appendAiChatMessage,
  createAiChatSession,
  getAiChatSessionById,
  patchAiChatSessionContext,
} from '~~/server/utils/chat-store'
import { getContestDetail, recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { consumeAiQuota, getProjectSettingsSnapshot, hasWorkspaceMembership } from '~~/server/utils/platform-store'
import {
  createAiProjectChangeRequests,
  createProjectIssueReportWithIssues,
} from '~~/server/utils/project-ai-store'
import { getProjectOutlineSnapshot } from '~~/server/utils/project-outline-store'

const ALLOWED_MODES: WorkspaceAiMode[] = [
  'dialog_ask',
  'auto_optimize',
  'issue_discovery',
]

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeMode(value: unknown): WorkspaceAiMode {
  const text = toText(value) as WorkspaceAiMode
  return ALLOWED_MODES.includes(text) ? text : 'dialog_ask'
}

function normalizeRequest(body: Partial<AiWorkspaceRequest> | null | undefined): AiWorkspaceRequest {
  const context = body?.context || {}
  const workspaceId = toText(body?.workspaceId || context.workspaceId)
  const projectId = toText(body?.projectId || context.projectId)
  return {
    workspaceId,
    projectId,
    sessionId: toText(body?.sessionId),
    mode: normalizeMode(body?.mode),
    messages: Array.isArray(body?.messages) ? body.messages : [],
    context: {
      workspaceId,
      projectId,
      contestId: toText(context.contestId),
      trackId: toText(context.trackId),
      major: toText(context.major),
    },
    aiOptions: body?.aiOptions || {},
  }
}

function buildSessionTitle(mode: WorkspaceAiMode, contestName: string, trackName: string): string {
  const left = contestName.trim()
  const right = trackName.trim()

  const modeLabel = mode === 'auto_optimize'
    ? '自动优化'
    : mode === 'issue_discovery'
      ? '寻疑发现'
      : '对话询问'

  if (left && right)
    return `${modeLabel} · ${left} · ${right}`
  if (left)
    return `${modeLabel} · ${left}`
  return modeLabel
}

function summarizeProjectSettings(snapshot: Awaited<ReturnType<typeof getProjectSettingsSnapshot>>): string {
  if (!snapshot)
    return '暂无项目设置快照。'

  const project = snapshot.project
  const bindings = snapshot.contestBindings
  const adaptation = snapshot.currentAdaptation

  const lines: string[] = [
    `项目标题：${toText(project.title) || '未命名'}`,
    `项目摘要：${toText(project.summary) || '暂无'}`,
    `问题陈述：${toText(project.problemStatement) || '暂无'}`,
    `竞赛绑定数：${bindings.length}`,
  ]

  if (adaptation) {
    lines.push(`当前适配赛道：${toText(adaptation.trackId) || '未绑定'}`)
    lines.push(`适配摘要：${toText(adaptation.summary) || '暂无'}`)
  }

  return lines.join('\n')
}

function summarizeOutline(snapshot: Awaited<ReturnType<typeof getProjectOutlineSnapshot>>): string {
  if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0)
    return '项目大纲暂无可用内容。'

  const lines = snapshot.items
    .slice(0, 12)
    .map(item => `- ${toText(item.title)}（L${Number(item.level || 0)}）`)
  return `项目大纲摘要（${snapshot.items.length} 条）：\n${lines.join('\n')}`
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message || 'UNKNOWN_ERROR'
  return 'UNKNOWN_ERROR'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = normalizeRequest(await readBody<Partial<AiWorkspaceRequest>>(event).catch(() => ({})))

  if (!request.workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用工作台 AI 时必须传 workspaceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  if (!request.projectId && request.mode !== 'dialog_ask') {
    setResponseStatus(event, 400)
    return fail('自动优化与寻疑发现模式必须传 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40096)
  }

  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  const contestDetail = request.context?.contestId
    ? await withClient(event, async (db) => {
        return getContestDetail(db, {
          contestId: request.context?.contestId || '',
          includeInternal,
        })
      }).catch(() => null)
    : null
  const contestName = contestDetail?.contest?.name || ''
  const trackName = contestDetail?.contest?.tracks.find(item => item.id === request.context?.trackId)?.name || ''

  const prepared = await withTransaction(event, async (db) => {
    const canUseWorkspace = await hasWorkspaceMembership(db, user, request.workspaceId || '')
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    const session = request.sessionId
      ? await getAiChatSessionById(db, {
          workspaceId: request.workspaceId || '',
          sessionId: request.sessionId,
        })
      : await createAiChatSession(db, {
          workspaceId: request.workspaceId || '',
          createdByUserId: user.id,
          title: buildSessionTitle(request.mode || 'dialog_ask', contestName, trackName),
          contestId: request.context?.contestId,
          trackId: request.context?.trackId,
          major: request.context?.major,
        })

    if (!session)
      throw new Error('SESSION_NOT_FOUND')

    await patchAiChatSessionContext(db, {
      workspaceId: request.workspaceId || '',
      sessionId: session.id,
      contestId: request.context?.contestId,
      trackId: request.context?.trackId,
      major: request.context?.major,
      title: buildSessionTitle(request.mode || 'dialog_ask', contestName, trackName),
    })

    const quota = await consumeAiQuota(db, {
      workspaceId: request.workspaceId || '',
      userId: user.id,
      route: '/api/ai/workspace/stream',
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
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  if (prepared === 'SESSION_NOT_FOUND') {
    return fail('会话不存在，请刷新后重试。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40495)
  }

  if (prepared === 'QUOTA_EXCEEDED') {
    return fail('Team AI 额度不足，请扩容或等待重置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42995)
  }

  const stream = createEventStream(event)
  const pushEvent = async (eventType: AiWorkspaceStreamEventType, data: Record<string, unknown>) => {
    const payload: AiWorkspaceStreamEvent = {
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
        message: '已建立工作台 AI 会话，正在加载上下文...',
        sessionId: prepared.sessionId,
      })

      const contextBundle = await withClient(event, async (db) => {
        const projectSettings = request.projectId
          ? await getProjectSettingsSnapshot(db, user, request.projectId)
          : null
        const projectOutline = request.projectId
          ? await getProjectOutlineSnapshot(db, request.projectId)
          : null
        const resources = request.projectId
          ? await loadVisibleProjectResourcesForAi(db, user, {
              workspaceId: request.workspaceId || '',
              projectId: request.projectId,
            })
          : []
        const resourceSummary = buildProjectResourceLocalContext(resources, {
          contestName,
          trackName,
          major: request.context?.major,
          limit: 10,
        })
        return {
          projectSettingsSummary: summarizeProjectSettings(projectSettings),
          projectOutlineSummary: summarizeOutline(projectOutline),
          resourceSummary,
        }
      })

      const latestUserMessage = [...(request.messages || [])]
        .reverse()
        .find(message => message.role === 'user')
        ?.content
        ?.trim() || ''

      const execution = await executeWorkspaceAi({
        runtime: {
          ai: runtime.ai,
          adminAi: runtime.adminAi,
        },
        mode: request.mode || 'dialog_ask',
        context: {
          workspaceId: request.workspaceId || '',
          projectId: request.projectId || '',
          contestId: request.context?.contestId || '',
          trackId: request.context?.trackId || '',
          major: request.context?.major || '',
          contestName,
          trackName,
          projectSettingsSummary: contextBundle.projectSettingsSummary,
          projectOutlineSummary: contextBundle.projectOutlineSummary,
          resourceSummary: contextBundle.resourceSummary,
          latestUserMessage,
        },
        hooks: {
          onProgress: message => pushEvent('progress', { message }),
          onTool: (name, payload) => pushEvent('tool', { name, payload }),
          onDelta: text => pushEvent('delta', { text }),
          onProposal: proposal => pushEvent('proposal', { proposal }),
          onIssue: issue => pushEvent('issue', { issue }),
        },
      })

      const persisted = await withTransaction(event, async (db) => {
        if (latestUserMessage) {
          await appendAiChatMessage(db, {
            workspaceId: request.workspaceId || '',
            sessionId: prepared.sessionId,
            role: 'user',
            content: latestUserMessage,
            provider: runtime.ai.provider,
            model: runtime.ai.model,
            fallbackUsed: false,
            metadata: {
              mode: request.mode,
            },
            createdByUserId: user.id,
          })
        }

        await appendAiChatMessage(db, {
          workspaceId: request.workspaceId || '',
          sessionId: prepared.sessionId,
          role: 'assistant',
          content: execution.data.assistantReply,
          provider: runtime.ai.provider,
          model: runtime.ai.model,
          fallbackUsed: execution.fallbackUsed,
          metadata: {
            mode: request.mode,
          },
          createdByUserId: user.id,
        })

        await patchAiChatSessionContext(db, {
          workspaceId: request.workspaceId || '',
          sessionId: prepared.sessionId,
          contestId: request.context?.contestId,
          trackId: request.context?.trackId,
          major: request.context?.major,
          title: buildSessionTitle(request.mode || 'dialog_ask', contestName, trackName),
        })

        const proposals = request.projectId
          && request.mode === 'auto_optimize'
          && execution.data.changeDrafts.length > 0
          ? await createAiProjectChangeRequests(db, {
              workspaceId: request.workspaceId || '',
              projectId: request.projectId,
              sessionId: prepared.sessionId,
              mode: request.mode || 'dialog_ask',
              createdByUserId: user.id,
              changes: execution.data.changeDrafts,
            })
          : []

        const issuePayload = request.projectId && request.mode === 'issue_discovery'
          ? await createProjectIssueReportWithIssues(db, {
              workspaceId: request.workspaceId || '',
              projectId: request.projectId,
              sessionId: prepared.sessionId,
              sourceMode: request.mode || 'dialog_ask',
              title: execution.data.reportTitle || 'AI 寻疑报告',
              summary: execution.data.reportSummary || execution.data.assistantReply,
              markdown: execution.data.reportMarkdown || execution.data.assistantReply,
              createdByUserId: user.id,
              issues: execution.data.issueDrafts,
            })
          : null

        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'ai.invoke.workspace_agent',
          contestId: request.context?.contestId,
          payload: {
            route: '/api/ai/workspace/stream',
            workspaceId: request.workspaceId,
            projectId: request.projectId,
            sessionId: prepared.sessionId,
            mode: request.mode,
            proposals: proposals.length,
            issues: issuePayload?.issues.length || 0,
            fallbackUsed: execution.fallbackUsed,
            attempts: execution.attempts,
            latencyMs: Date.now() - startedAt,
            remainingQuota: prepared.remainingQuota,
          },
        })

        return {
          proposals,
          report: issuePayload?.report || null,
          issues: issuePayload?.issues || [],
        }
      })

      const result: AiWorkspaceResult = {
        assistantReply: execution.data.assistantReply,
        mode: request.mode || 'dialog_ask',
        sessionId: prepared.sessionId,
        proposals: persisted.proposals,
        report: persisted.report,
        issues: persisted.issues,
      }

      await pushEvent('done', {
        result,
        meta: {
          attempts: execution.attempts,
          fallbackUsed: execution.fallbackUsed,
          latencyMs: Date.now() - startedAt,
        },
      })
    }
    catch (error) {
      await pushEvent('error', {
        message: toErrorMessage(error),
      })
    }
    finally {
      await stream.close()
    }
  }

  void run()
  return stream.send()
})
