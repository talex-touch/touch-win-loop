import type { PlatformAiChannelKey } from '~~/server/utils/platform-ai-channels'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface UserAiRuntimeFeatureStatus {
  configured: boolean
  provider: string
  model: string
  reason: string
}

interface UserAiRuntimeStatus {
  workspaceDialogAsk: UserAiRuntimeFeatureStatus
  workspaceAutoOptimize: UserAiRuntimeFeatureStatus
  workspaceIssueDiscovery: UserAiRuntimeFeatureStatus
  documentAssist: UserAiRuntimeFeatureStatus
  documentSummarize: UserAiRuntimeFeatureStatus
  documentRewrite: UserAiRuntimeFeatureStatus
  documentContinue: UserAiRuntimeFeatureStatus
  documentExpand: UserAiRuntimeFeatureStatus
  documentCompleteContext: UserAiRuntimeFeatureStatus
  documentRestructure: UserAiRuntimeFeatureStatus
  canvasGenerate: UserAiRuntimeFeatureStatus
  canvasComplete: UserAiRuntimeFeatureStatus
  canvasRefine: UserAiRuntimeFeatureStatus
  defense: UserAiRuntimeFeatureStatus
  contestFilter: UserAiRuntimeFeatureStatus
  topicProposal: UserAiRuntimeFeatureStatus
  projectChat: UserAiRuntimeFeatureStatus
}

function combineFeatureStatuses(
  label: string,
  items: UserAiRuntimeFeatureStatus[],
): UserAiRuntimeFeatureStatus {
  const configuredItem = items.find(item => item.configured) || null
  return {
    configured: items.some(item => item.configured),
    provider: configuredItem?.provider || '',
    model: configuredItem?.model || '',
    reason: buildAiNotConfiguredMessage(label),
  }
}

function buildFeatureStatus(
  runtime: Awaited<ReturnType<typeof readEffectiveRuntimeSettings>>['runtime'],
  channelKey: PlatformAiChannelKey,
  label: string,
): UserAiRuntimeFeatureStatus {
  const resolved = resolveAiRuntimeForChannel(runtime, channelKey)
  return {
    configured: isAiRuntimeConfigured(resolved.ai),
    provider: String(resolved.ai.provider || '').trim(),
    model: String(resolved.ai.model || '').trim(),
    reason: buildAiNotConfiguredMessage(label),
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  await requireAuth(event)

  const workspaceDialogAsk = buildFeatureStatus(runtime, 'workspace_dialog_ask', '工作台 AI')
  const workspaceAutoOptimize = buildFeatureStatus(runtime, 'workspace_auto_optimize', '工作台 AI')
  const workspaceIssueDiscovery = buildFeatureStatus(runtime, 'workspace_issue_discovery', '工作台 AI')
  const documentSummarize = buildFeatureStatus(runtime, 'workspace_document_summarize', '文档总结 AI')
  const documentRewrite = buildFeatureStatus(runtime, 'workspace_document_rewrite', '文档润写 AI')
  const documentContinue = buildFeatureStatus(runtime, 'workspace_document_continue', '文档续写 AI')
  const documentExpand = buildFeatureStatus(runtime, 'workspace_document_expand', '文档扩写 AI')
  const documentCompleteContext = buildFeatureStatus(runtime, 'workspace_document_complete_context', '文档补全上下文 AI')
  const documentRestructure = buildFeatureStatus(runtime, 'workspace_document_restructure', '文档结构整理 AI')
  const documentAssist = combineFeatureStatuses('文档 AI', [
    documentSummarize,
    documentRewrite,
    documentContinue,
    documentExpand,
    documentCompleteContext,
    documentRestructure,
  ])
  const canvasGenerate = buildFeatureStatus(runtime, 'workspace_canvas_generate', '画布生成 AI')
  const canvasComplete = buildFeatureStatus(runtime, 'workspace_canvas_complete', '画布补全 AI')
  const canvasRefine = buildFeatureStatus(runtime, 'workspace_canvas_refine', '画布续改 AI')
  const defense = buildFeatureStatus(runtime, 'defense', '答辩 AI')
  const contestFilter = buildFeatureStatus(runtime, 'contest_filter', '赛事筛选 AI')
  const topicProposal = buildFeatureStatus(runtime, 'topic_proposal', '选题助手 AI')
  const projectChat = buildFeatureStatus(runtime, 'project_chat', '项目对话 AI')

  const payload: UserAiRuntimeStatus = {
    workspaceDialogAsk,
    workspaceAutoOptimize,
    workspaceIssueDiscovery,
    documentAssist,
    documentSummarize,
    documentRewrite,
    documentContinue,
    documentExpand,
    documentCompleteContext,
    documentRestructure,
    canvasGenerate,
    canvasComplete,
    canvasRefine,
    defense,
    contestFilter,
    topicProposal,
    projectChat,
  }

  return ok<UserAiRuntimeStatus>(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
