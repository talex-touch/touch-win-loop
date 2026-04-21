import type { PlatformAiChannelKey } from '~~/server/utils/platform-ai-channels'
import type {
  AiCanvasAssistSourceFormat,
  AiCanvasAssistTemplate,
  AiWorkspaceDocumentAction,
  AiWorkspaceRequest,
  AiWorkspaceResult,
  AiWorkspaceStreamEvent,
  AiWorkspaceStreamEventType,
  ChatMessage,
  CollabPurpose,
  WorkflowArchitectureView,
  WorkflowDraftAction,
  WorkflowLayoutPreset,
  WorkflowStylePreset,
  WorkspaceAiActionSource,
  WorkspaceAiInteractionIntent,
  WorkspaceAiMode,
  WorkspaceContextualAssistantKey,
} from '~~/shared/types/domain'
import { createEventStream, setResponseStatus } from 'h3'
import { buildProjectKnowledgeLocalContext } from '~~/server/services/ai/project-knowledge-context'
import { loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { executeWorkspaceAi } from '~~/server/services/ai/workspace-orchestrator'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  appendAiChatMessage,
  createAiChatSession,
  getAiChatSessionById,
  patchAiChatSessionContext,
} from '~~/server/utils/chat-store'
import { upsertAiChatSessionContext } from '~~/server/utils/chat-session-context-store'
import { getContestDetail, recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { resolveAiRuntimeForChannel, runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { getProjectSettingsSnapshot } from '~~/server/utils/platform-store'
import {
  createAiProjectChangeRequests,
  createProjectIssueReportWithIssues,
} from '~~/server/utils/project-ai-store'
import { getProjectOutlineSnapshot } from '~~/server/utils/project-outline-store'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'
import { createWorkspaceStreamSystemChatMessage } from '~~/shared/utils/workspace-ai-stream'

const ALLOWED_MODES: WorkspaceAiMode[] = [
  'dialog_ask',
  'auto_optimize',
  'issue_discovery',
  'document_assist',
  'contextual_agent',
]
const DOCUMENT_ASSIST_CHANNEL_KEYS: PlatformAiChannelKey[] = [
  'workspace_document_summarize',
  'workspace_document_rewrite',
  'workspace_document_continue',
  'workspace_document_expand',
  'workspace_document_complete_context',
  'workspace_document_restructure',
]
const SCENE_SOURCE_FORMATS: AiCanvasAssistSourceFormat[] = ['mermaid', 'markdown_outline', 'ddl', 'architecture']
type WorkspaceRequestContext = NonNullable<AiWorkspaceRequest['context']>

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeMode(value: unknown): WorkspaceAiMode {
  const text = toText(value) as WorkspaceAiMode
  return ALLOWED_MODES.includes(text) ? text : 'dialog_ask'
}

function normalizeInteractionIntent(value: unknown): WorkspaceAiInteractionIntent {
  return toText(value) === 'draft_action' ? 'draft_action' : 'context_chat'
}

function normalizeActionSource(value: unknown): WorkspaceAiActionSource {
  return toText(value) === 'toolbar' ? 'toolbar' : 'composer'
}

function normalizeSceneSourceFormat(value: unknown): AiCanvasAssistSourceFormat | undefined {
  const text = toText(value) as AiCanvasAssistSourceFormat
  return SCENE_SOURCE_FORMATS.includes(text) ? text : undefined
}

function normalizeRequest(body: Partial<AiWorkspaceRequest> | null | undefined): AiWorkspaceRequest {
  const context = body?.context || {}
  const workspaceId = toText(body?.teamId || body?.workspaceId || context.teamId || context.workspaceId)
  const projectId = toText(body?.projectId || context.projectId)
  return {
    teamId: workspaceId,
    workspaceId,
    projectId,
    sessionId: toText(body?.sessionId),
    mode: normalizeMode(body?.mode),
    messages: Array.isArray(body?.messages) ? body.messages : [],
    context: {
      teamId: workspaceId,
      workspaceId,
      projectId,
      projectTitle: toText(context.projectTitle),
      contestId: toText(context.contestId),
      trackId: toText(context.trackId),
      major: toText(context.major),
      resourceId: toText(context.resourceId),
      resourceTitle: toText(context.resourceTitle),
      markdown: toText(context.markdown),
      selectionText: toText(context.selectionText),
      selectionRange: context.selectionRange || null,
      trigger: context.trigger,
      documentAction: context.documentAction,
      assistantPreset: context.assistantPreset,
      assistantLabel: toText(context.assistantLabel),
      contextualAssistantKey: toText(context.contextualAssistantKey) as WorkspaceContextualAssistantKey | '',
      interactionIntent: normalizeInteractionIntent(context.interactionIntent),
      actionSource: normalizeActionSource(context.actionSource),
      requestedAgentAction: toText(context.requestedAgentAction) as WorkflowDraftAction | undefined,
      activeTabId: toText(context.activeTabId),
      previewMode: toText(context.previewMode),
      resourcePurpose: toText(context.resourcePurpose) as CollabPurpose | '',
      workflowSnapshot: context.workflowSnapshot || null,
      workflowAction: toText(context.workflowAction) as WorkflowDraftAction | undefined,
      workflowTemplate: toText(context.workflowTemplate) as AiCanvasAssistTemplate | undefined,
      workflowArchitectureView: toText(context.workflowArchitectureView) as WorkflowArchitectureView | undefined,
      workflowStylePreset: toText(context.workflowStylePreset) as WorkflowStylePreset | undefined,
      workflowLayoutPreset: toText(context.workflowLayoutPreset) as WorkflowLayoutPreset | undefined,
      sceneHash: toText(context.sceneHash),
      sceneSourceText: toText(context.sceneSourceText),
      sceneSourceFormat: normalizeSceneSourceFormat(context.sceneSourceFormat),
      sceneAction: toText(context.sceneAction) as WorkflowDraftAction | undefined,
      sceneTemplate: toText(context.sceneTemplate) as AiCanvasAssistTemplate | undefined,
      sceneArchitectureView: toText(context.sceneArchitectureView) as WorkflowArchitectureView | undefined,
      sceneStylePreset: toText(context.sceneStylePreset) as WorkflowStylePreset | undefined,
      sceneLayoutPreset: toText(context.sceneLayoutPreset) as WorkflowLayoutPreset | undefined,
    },
    aiOptions: body?.aiOptions || {},
  }
}

function buildSessionTitle(
  mode: WorkspaceAiMode,
  contestName: string,
  trackName: string,
  assistantLabel?: string,
): string {
  const left = contestName.trim()
  const right = trackName.trim()

  const modeLabel = mode === 'auto_optimize'
    ? 'Loopy 自动优化'
    : mode === 'issue_discovery'
      ? 'Loopy 寻疑发现'
      : mode === 'document_assist'
        ? 'Loopy 文稿助手'
        : mode === 'contextual_agent'
          ? `Loopy ${toText(assistantLabel) || '上下文助手'}`
          : 'Loopy 对话'

  if (left && right)
    return `${modeLabel} · ${left} · ${right}`
  if (left)
    return `${modeLabel} · ${left}`
  return modeLabel
}

function buildDialogSessionTitleFromMessage(message: string): string {
  const compact = toText(message).replace(/\s+/g, ' ')
  if (!compact)
    return '新对话'
  if (compact.length <= 16)
    return compact
  return `${compact.slice(0, 16)}…`
}

function resolveInitialSessionTitle(
  mode: WorkspaceAiMode,
  contestName: string,
  trackName: string,
): string {
  if (mode === 'dialog_ask')
    return '新对话'
  return buildSessionTitle(mode, contestName, trackName)
}

function resolvePersistedSessionTitle(input: {
  mode: WorkspaceAiMode
  latestUserMessage: string
  initialMessageCount: number
  contestName: string
  trackName: string
  assistantLabel?: string
}): string | undefined {
  if (input.mode === 'dialog_ask') {
    if (input.initialMessageCount > 0)
      return undefined
    return buildDialogSessionTitleFromMessage(input.latestUserMessage)
  }

  return buildSessionTitle(input.mode, input.contestName, input.trackName, input.assistantLabel)
}

function buildSessionContextSnapshot(request: AiWorkspaceRequest) {
  return {
    resourceId: toText(request.context?.resourceId),
    resourceTitle: toText(request.context?.resourceTitle),
    previewMode: toText(request.context?.previewMode),
    contextualAssistantKey: toText(request.context?.contextualAssistantKey) as WorkspaceContextualAssistantKey | '',
    assistantPreset: request.context?.assistantPreset || 'default',
    assistantLabel: toText(request.context?.assistantLabel),
    selectionText: toText(request.context?.selectionText),
    selectionRange: request.context?.selectionRange || null,
    activeTabId: toText(request.context?.activeTabId),
    resourcePurpose: toText(request.context?.resourcePurpose) as WorkspaceRequestContext['resourcePurpose'],
    requestedAgentAction: toText(request.context?.requestedAgentAction) as WorkspaceRequestContext['requestedAgentAction'],
    workflowSnapshot: request.context?.workflowSnapshot || null,
    sceneHash: toText(request.context?.sceneHash),
    sceneSourceFormat: request.context?.sceneSourceFormat,
    sceneSourceText: toText(request.context?.sceneSourceText),
    updatedAt: new Date().toISOString(),
  }
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

function buildWorkspaceBootstrapProgressMessage(request: AiWorkspaceRequest): string {
  const projectTitle = toText(request.context?.projectTitle)
  const resourceTitle = toText(request.context?.resourceTitle)

  if (request.mode === 'document_assist')
    return `正在读取当前文档「${resourceTitle || '未命名文档'}」的上下文...`

  if (request.mode === 'contextual_agent') {
    const assistantLabel = toText(request.context?.assistantLabel)
    if (request.context?.interactionIntent === 'draft_action' && assistantLabel && resourceTitle)
      return `正在准备「${assistantLabel}」草案上下文：${resourceTitle}`
    if (assistantLabel && resourceTitle)
      return `正在准备「${assistantLabel}」当前资源上下文：${resourceTitle}`
    if (assistantLabel)
      return `正在准备「${assistantLabel}」项目上下文：${projectTitle || '未命名项目'}`
  }

  return `正在读取当前项目「${projectTitle || '未命名项目'}」的上下文...`
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

function createAbortError(): Error {
  const error = new Error('AbortError')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw createAbortError()
}

function resolveDocumentAssistChannelKey(action: unknown): 'workspace_document_summarize' | 'workspace_document_rewrite' | 'workspace_document_continue' | 'workspace_document_expand' | 'workspace_document_complete_context' | 'workspace_document_restructure' {
  const normalized = toText(action) as AiWorkspaceDocumentAction
  if (normalized === 'rewrite')
    return 'workspace_document_rewrite'
  if (normalized === 'continue')
    return 'workspace_document_continue'
  if (normalized === 'expand')
    return 'workspace_document_expand'
  if (normalized === 'complete_context')
    return 'workspace_document_complete_context'
  if (normalized === 'restructure')
    return 'workspace_document_restructure'
  return 'workspace_document_summarize'
}

function resolveWorkspaceChannelKey(
  mode: WorkspaceAiMode,
  documentAction?: unknown,
): 'workspace_dialog_ask' | 'workspace_auto_optimize' | 'workspace_issue_discovery' | 'workspace_document_summarize' | 'workspace_document_rewrite' | 'workspace_document_continue' | 'workspace_document_expand' | 'workspace_document_complete_context' | 'workspace_document_restructure' {
  if (mode === 'auto_optimize')
    return 'workspace_auto_optimize'
  if (mode === 'issue_discovery')
    return 'workspace_issue_discovery'
  if (mode === 'document_assist')
    return resolveDocumentAssistChannelKey(documentAction)
  return 'workspace_dialog_ask'
}

function resolveDocumentAssistExecutionChannelKey(
  runtime: Awaited<ReturnType<typeof readEffectiveRuntimeSettings>>['runtime'],
  documentAction?: unknown,
): PlatformAiChannelKey {
  const explicitAction = toText(documentAction)
  if (explicitAction)
    return resolveDocumentAssistChannelKey(explicitAction)

  for (const key of DOCUMENT_ASSIST_CHANNEL_KEYS) {
    const resolved = resolveAiRuntimeForChannel(runtime, key)
    if (resolved.channel.enabled && isAiRuntimeConfigured(resolved.ai))
      return key
  }

  return 'workspace_document_summarize'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = normalizeRequest(await readBody<Partial<AiWorkspaceRequest>>(event).catch(() => ({})))
  const channelKey = request.mode === 'document_assist'
    ? resolveDocumentAssistExecutionChannelKey(runtime, request.context?.documentAction)
    : resolveWorkspaceChannelKey(request.mode || 'dialog_ask', request.context?.documentAction)
  const channelRuntime = resolveAiRuntimeForChannel(runtime, channelKey)
  const workspaceAiConfig = {
    ...channelRuntime.ai,
    temperature: Number.isFinite(Number(request.aiOptions?.temperature))
      ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
      : channelRuntime.ai.temperature,
  }

  if (!request.workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用工作台 AI 时必须传 teamId。', {
      startedAt,
      provider: workspaceAiConfig.provider,
      model: workspaceAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  if (!channelRuntime.channel.enabled || !isAiRuntimeConfigured(workspaceAiConfig)) {
    setResponseStatus(event, 503)
    return fail(
      buildAiNotConfiguredMessage(channelRuntime.channel.label || (request.mode === 'document_assist' ? 'AgentDoc AI' : '工作台 AI')),
      {
        startedAt,
        provider: workspaceAiConfig.provider,
        model: workspaceAiConfig.model,
        fallbackUsed: false,
        attempts: 1,
      },
      50395,
    )
  }

  if (!request.projectId && request.mode !== 'dialog_ask') {
    setResponseStatus(event, 400)
    return fail('除对话询问外，工作台 AI 调用必须传 projectId。', {
      startedAt,
      provider: workspaceAiConfig.provider,
      model: workspaceAiConfig.model,
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
  const scopeProjectId = String(request.projectId || '').trim()
  const scopeMode = request.mode || 'dialog_ask'
  const latestUserMessage = [...(request.messages || [])]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?.trim() || ''

  const prepared = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, user, request.workspaceId || '')
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    let session = request.sessionId
      ? await getAiChatSessionById(db, {
          workspaceId: request.workspaceId || '',
          sessionId: request.sessionId,
          projectId: scopeProjectId,
          mode: scopeMode,
          strictScope: Boolean(scopeProjectId),
        })
      : null

    if (!session) {
      session = await createAiChatSession(db, {
        workspaceId: request.workspaceId || '',
        projectId: scopeProjectId,
        mode: scopeMode,
        createdByUserId: user.id,
        title: resolveInitialSessionTitle(scopeMode, contestName, trackName),
        contestId: request.context?.contestId,
        trackId: request.context?.trackId,
        major: request.context?.major,
      })
    }

    if (!session)
      throw new Error('SESSION_NOT_FOUND')

    await patchAiChatSessionContext(db, {
      workspaceId: request.workspaceId || '',
      sessionId: session.id,
      projectId: scopeProjectId,
      mode: scopeMode,
      contestId: request.context?.contestId,
      trackId: request.context?.trackId,
      major: request.context?.major,
      title: resolvePersistedSessionTitle({
        mode: scopeMode,
        latestUserMessage,
        initialMessageCount: session.messageCount,
        contestName,
        trackName,
        assistantLabel: request.context?.assistantLabel,
      }),
    })

    await upsertAiChatSessionContext(db, {
      workspaceId: request.workspaceId || '',
      sessionId: session.id,
      projectId: scopeProjectId,
      mode: scopeMode,
      contextSnapshot: buildSessionContextSnapshot(request),
      runState: {
        status: 'running',
        lastEventSeq: 0,
        resumeAvailable: false,
        degraded: false,
        degradedReason: '',
      },
      lastCheckpointRef: '',
      lastError: '',
      touchActiveAt: true,
    })

    const quota = await teamConsumeAiQuota(db, {
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
      initialMessageCount: session.messageCount,
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
      provider: workspaceAiConfig.provider,
      model: workspaceAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  if (prepared === 'SESSION_NOT_FOUND') {
    return fail('会话不存在，请刷新后重试。', {
      startedAt,
      provider: workspaceAiConfig.provider,
      model: workspaceAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40495)
  }

  if (prepared === 'QUOTA_EXCEEDED') {
    return fail('Team AI 额度不足，请扩容或等待重置。', {
      startedAt,
      provider: workspaceAiConfig.provider,
      model: workspaceAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42995)
  }

  const stream = createEventStream(event)
  const abortController = new AbortController()
  const streamSystemMessages: ChatMessage[] = []
  let streamSystemSeq = 0
  let streamClosed = false
  let hasVisibleExecutionOutput = false

  stream.onClosed(() => {
    streamClosed = true
    if (!abortController.signal.aborted)
      abortController.abort()
  })

  const markVisibleExecutionOutput = () => {
    hasVisibleExecutionOutput = true
  }

  const pushEvent = async (eventType: AiWorkspaceStreamEventType, data: Record<string, unknown>) => {
    if (streamClosed)
      return

    if (eventType === 'progress' || eventType === 'tool') {
      streamSystemSeq += 1
      streamSystemMessages.push(createWorkspaceStreamSystemChatMessage(eventType, data, streamSystemSeq))
    }
    if (eventType === 'tool' || eventType === 'proposal' || eventType === 'issue' || eventType === 'delta')
      markVisibleExecutionOutput()

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
        message: buildWorkspaceBootstrapProgressMessage(request),
        sessionId: prepared.sessionId,
      })
      throwIfAborted(abortController.signal)

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
        const knowledgeContext = await buildProjectKnowledgeLocalContext(db, {
          projectId: request.projectId || '',
          query: latestUserMessage,
          resources,
          contestName,
          trackName,
          major: request.context?.major,
          limit: 6,
          event,
        })
        return {
          projectSettingsSummary: summarizeProjectSettings(projectSettings),
          projectOutlineSummary: summarizeOutline(projectOutline),
          resourceSummary: knowledgeContext.summaryText,
          knowledge: {
            citations: knowledgeContext.citations,
            warning: knowledgeContext.warning,
            usedFallback: knowledgeContext.usedFallback,
          },
        }
      })
      throwIfAborted(abortController.signal)

      const execution = await runWithPlatformAiChannelFallback(runtime, channelKey, async ({ ai, prompt }) => {
        const nextAiConfig: typeof runtime.ai = {
          ...runtime.ai,
          ...ai,
          temperature: Number.isFinite(Number(request.aiOptions?.temperature))
            ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
            : Number(ai.temperature ?? runtime.ai.temperature ?? 0.2),
        }

        return executeWorkspaceAi({
          sessionId: prepared.sessionId,
          runtime,
          ai: nextAiConfig,
          mode: request.mode || 'dialog_ask',
          messages: request.messages || [],
          context: {
            workspaceId: request.workspaceId || '',
            projectId: request.projectId || '',
            projectTitle: request.context?.projectTitle || '',
            contestId: request.context?.contestId || '',
            trackId: request.context?.trackId || '',
            major: request.context?.major || '',
            contestName,
            trackName,
            resourceId: request.context?.resourceId || '',
            resourceTitle: request.context?.resourceTitle || '',
            markdown: request.context?.markdown || '',
            selectionText: request.context?.selectionText || '',
            selectionRange: request.context?.selectionRange
              ? {
                  ...request.context.selectionRange,
                } as Record<string, unknown>
              : null,
            trigger: toText(request.context?.trigger),
            documentAction: toText(request.context?.documentAction),
            assistantPreset: request.context?.assistantPreset || 'default',
            assistantLabel: toText(request.context?.assistantLabel),
            contextualAssistantKey: toText(request.context?.contextualAssistantKey) as WorkspaceContextualAssistantKey | '',
            interactionIntent: normalizeInteractionIntent(request.context?.interactionIntent),
            actionSource: normalizeActionSource(request.context?.actionSource),
            requestedAgentAction: toText(request.context?.requestedAgentAction),
            activeTabId: toText(request.context?.activeTabId),
            previewMode: toText(request.context?.previewMode),
            resourcePurpose: toText(request.context?.resourcePurpose),
            workflowSnapshot: request.context?.workflowSnapshot || null,
            workflowAction: toText(request.context?.workflowAction),
            workflowTemplate: toText(request.context?.workflowTemplate),
            workflowArchitectureView: toText(request.context?.workflowArchitectureView),
            workflowStylePreset: toText(request.context?.workflowStylePreset),
            workflowLayoutPreset: toText(request.context?.workflowLayoutPreset),
            sceneHash: toText(request.context?.sceneHash),
            sceneSourceText: toText(request.context?.sceneSourceText),
            sceneSourceFormat: toText(request.context?.sceneSourceFormat),
            sceneAction: toText(request.context?.sceneAction),
            sceneTemplate: toText(request.context?.sceneTemplate),
            sceneArchitectureView: toText(request.context?.sceneArchitectureView),
            sceneStylePreset: toText(request.context?.sceneStylePreset),
            sceneLayoutPreset: toText(request.context?.sceneLayoutPreset),
            projectSettingsSummary: contextBundle.projectSettingsSummary,
            projectOutlineSummary: contextBundle.projectOutlineSummary,
            resourceSummary: contextBundle.resourceSummary,
            latestUserMessage,
          },
          channelPrompt: request.mode === 'document_assist' && !toText(request.context?.documentAction)
            ? ''
            : prompt,
          hooks: {
            onProgress: message => pushEvent('progress', { message }),
            onTool: (name, payload) => pushEvent('tool', { name, payload }),
            onDelta: text => pushEvent('delta', { text }),
            onProposal: () => markVisibleExecutionOutput(),
            onIssue: () => markVisibleExecutionOutput(),
          },
          signal: abortController.signal,
        })
      }, {
        shouldContinueOnError: () => !hasVisibleExecutionOutput && !abortController.signal.aborted,
      })
      throwIfAborted(abortController.signal)

      const persisted = await withTransaction(event, async (db) => {
        throwIfAborted(abortController.signal)
        const assistantFallbackUsed = Boolean(execution.data.fallbackUsed)
        const baseMetadata = {
          mode: scopeMode,
          projectId: scopeProjectId,
          channelKey: execution.channel.key,
          providerId: execution.provider?.id || null,
          attemptChain: execution.attemptChain,
          usedFailover: Boolean(execution.usedFallback && !assistantFallbackUsed),
        }

        if (latestUserMessage) {
          throwIfAborted(abortController.signal)
          await appendAiChatMessage(db, {
            workspaceId: request.workspaceId || '',
            sessionId: prepared.sessionId,
            role: 'user',
            content: latestUserMessage,
            provider: execution.ai.provider,
            model: execution.ai.model,
            fallbackUsed: false,
            metadata: baseMetadata,
            createdByUserId: user.id,
          })
        }

        for (const systemMessage of streamSystemMessages) {
          throwIfAborted(abortController.signal)
          await appendAiChatMessage(db, {
            workspaceId: request.workspaceId || '',
            sessionId: prepared.sessionId,
            role: 'system',
            content: systemMessage.content,
            provider: execution.ai.provider,
            model: execution.ai.model,
            fallbackUsed: false,
            metadata: {
              ...baseMetadata,
              ...(systemMessage.metadata || {}),
            },
            createdByUserId: user.id,
          })
        }

        throwIfAborted(abortController.signal)
        await appendAiChatMessage(db, {
          workspaceId: request.workspaceId || '',
          sessionId: prepared.sessionId,
          role: 'assistant',
          content: execution.data.data.assistantReply,
          provider: execution.ai.provider,
          model: execution.ai.model,
          fallbackUsed: assistantFallbackUsed,
          metadata: {
            ...baseMetadata,
            latencyMs: execution.latencyMs,
            degraded: assistantFallbackUsed,
            degradedReason: execution.data.degradedReason || '',
            checkpointRef: execution.data.checkpointRef || '',
            knowledgeRuntimeStatus: contextBundle.knowledge,
            ...(execution.data.data.documentDraft
              ? {
                  agentDocDraft: execution.data.data.documentDraft,
                }
              : {}),
            ...(execution.data.data.workflowDraft
              ? {
                  workflowDraft: execution.data.data.workflowDraft,
                }
              : {}),
            ...(execution.data.data.sceneDraft
              ? {
                  sceneDraft: execution.data.data.sceneDraft,
                }
              : {}),
            knowledge: execution.data.data.knowledge || contextBundle.knowledge,
          },
          createdByUserId: user.id,
        })

        await patchAiChatSessionContext(db, {
          workspaceId: request.workspaceId || '',
          sessionId: prepared.sessionId,
          projectId: scopeProjectId,
          mode: scopeMode,
          contestId: request.context?.contestId,
          trackId: request.context?.trackId,
          major: request.context?.major,
          title: resolvePersistedSessionTitle({
            mode: scopeMode,
            latestUserMessage,
            initialMessageCount: prepared.initialMessageCount,
            contestName,
            trackName,
            assistantLabel: request.context?.assistantLabel,
          }),
        })

        await upsertAiChatSessionContext(db, {
          workspaceId: request.workspaceId || '',
          sessionId: prepared.sessionId,
          projectId: scopeProjectId,
          mode: scopeMode,
          contextSnapshot: buildSessionContextSnapshot(request),
          runState: {
            status: 'completed',
            lastEventSeq: streamSystemSeq,
            lastCheckpointRef: execution.data.checkpointRef,
            lastError: '',
            degraded: assistantFallbackUsed,
            degradedReason: execution.data.degradedReason || '',
            resumeAvailable: Boolean(execution.data.checkpointRef),
          },
          lastCheckpointRef: execution.data.checkpointRef || '',
          lastError: '',
          touchActiveAt: true,
        })

        const proposals = request.projectId
          && request.mode === 'auto_optimize'
          && execution.data.data.changeDrafts.length > 0
          ? await createAiProjectChangeRequests(db, {
              workspaceId: request.workspaceId || '',
              projectId: request.projectId,
              sessionId: prepared.sessionId,
              mode: request.mode || 'dialog_ask',
              createdByUserId: user.id,
              changes: execution.data.data.changeDrafts,
            })
          : []
        throwIfAborted(abortController.signal)

        const issuePayload = request.projectId && request.mode === 'issue_discovery'
          ? await createProjectIssueReportWithIssues(db, {
              workspaceId: request.workspaceId || '',
              projectId: request.projectId,
              sessionId: prepared.sessionId,
              sourceMode: request.mode || 'dialog_ask',
              title: execution.data.data.reportTitle || 'AI 寻疑报告',
              summary: execution.data.data.reportSummary || execution.data.data.assistantReply,
              markdown: execution.data.data.reportMarkdown || execution.data.data.assistantReply,
              createdByUserId: user.id,
              issues: execution.data.data.issueDrafts,
            })
          : null
        throwIfAborted(abortController.signal)

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
            channelKey: execution.channel.key,
            providerId: execution.provider?.id || null,
            proposals: proposals.length,
            issues: issuePayload?.issues.length || 0,
            fallbackUsed: assistantFallbackUsed,
            usedFailover: Boolean(execution.usedFallback && !assistantFallbackUsed),
            attempts: execution.attemptChain.length,
            attemptChain: execution.attemptChain,
            latencyMs: execution.latencyMs,
            remainingQuota: prepared.remainingQuota,
          },
        })

        return {
          proposals,
          report: issuePayload?.report || null,
          issues: issuePayload?.issues || [],
          documentDraft: execution.data.data.documentDraft || null,
          workflowDraft: execution.data.data.workflowDraft || null,
          sceneDraft: execution.data.data.sceneDraft || null,
        }
      })

      const result: AiWorkspaceResult = {
        assistantReply: execution.data.data.assistantReply,
        mode: request.mode || 'dialog_ask',
        sessionId: prepared.sessionId,
        proposals: persisted.proposals,
        report: persisted.report,
        issues: persisted.issues,
        documentDraft: persisted.documentDraft,
        workflowDraft: persisted.workflowDraft,
        sceneDraft: persisted.sceneDraft,
        knowledge: execution.data.data.knowledge || contextBundle.knowledge,
      }

      throwIfAborted(abortController.signal)
      await pushEvent('done', {
        result,
        meta: {
          attempts: execution.attemptChain.length,
          fallbackUsed: execution.data.fallbackUsed,
          usedFailover: Boolean(execution.usedFallback && !execution.data.fallbackUsed),
          degradedReason: execution.data.degradedReason || '',
          checkpointRef: execution.data.checkpointRef || '',
          latencyMs: execution.latencyMs,
        },
      })
    }
    catch (error) {
      if (isAbortError(error)) {
        await withTransaction(event, async (db) => {
          await upsertAiChatSessionContext(db, {
            workspaceId: request.workspaceId || '',
            sessionId: prepared.sessionId,
            projectId: scopeProjectId,
            mode: scopeMode,
            contextSnapshot: buildSessionContextSnapshot(request),
            runState: {
              status: 'interrupted',
              lastEventSeq: streamSystemSeq,
              lastError: 'ABORTED',
              resumeAvailable: true,
            },
            lastError: 'ABORTED',
            touchActiveAt: true,
          })
        }).catch(() => undefined)
        return
      }

      await withTransaction(event, async (db) => {
        await upsertAiChatSessionContext(db, {
          workspaceId: request.workspaceId || '',
          sessionId: prepared.sessionId,
          projectId: scopeProjectId,
          mode: scopeMode,
          contextSnapshot: buildSessionContextSnapshot(request),
          runState: {
            status: 'failed',
            lastEventSeq: streamSystemSeq,
            lastError: toErrorMessage(error),
            resumeAvailable: false,
          },
          lastError: toErrorMessage(error),
          touchActiveAt: true,
        })
      }).catch(() => undefined)

      await pushEvent('error', {
        message: toErrorMessage(error),
      })
    }
    finally {
      if (!streamClosed)
        await stream.close().catch(() => {})
    }
  }

  void run()
  return stream.send()
})
