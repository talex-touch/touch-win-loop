import type { PlatformAiChannelKey } from '~~/server/utils/platform-ai-channels'
import { ok } from '~~/server/utils/api'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
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
  defense: UserAiRuntimeFeatureStatus
  contestFilter: UserAiRuntimeFeatureStatus
  topicProposal: UserAiRuntimeFeatureStatus
  projectChat: UserAiRuntimeFeatureStatus
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
  const defense = buildFeatureStatus(runtime, 'defense', '答辩 AI')
  const contestFilter = buildFeatureStatus(runtime, 'contest_filter', '赛事筛选 AI')
  const topicProposal = buildFeatureStatus(runtime, 'topic_proposal', '选题助手 AI')
  const projectChat = buildFeatureStatus(runtime, 'project_chat', '项目对话 AI')

  const payload: UserAiRuntimeStatus = {
    workspaceDialogAsk,
    workspaceAutoOptimize,
    workspaceIssueDiscovery,
    documentAssist: {
      ...workspaceDialogAsk,
      reason: buildAiNotConfiguredMessage('文档 AI'),
    },
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
