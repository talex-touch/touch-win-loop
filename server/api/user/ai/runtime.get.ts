import type { PlatformAiChannelKey, PlatformAiProviderConfig } from '~~/server/utils/platform-ai-channels'
import type { DefenseRealtimeRuntimeOptions } from '~~/shared/types/domain'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { resolveAiRuntimeForChannel, resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface UserAiRuntimeFeatureStatus {
  configured: boolean
  provider: string
  model: string
  reason: string
  degraded: boolean
  writeBlocked: boolean
  rebuildRecommended: boolean
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
  knowledgeEmbedding: UserAiRuntimeFeatureStatus
  knowledgeVisualEmbedding: UserAiRuntimeFeatureStatus
  defense: UserAiRuntimeFeatureStatus
  contestFilter: UserAiRuntimeFeatureStatus
  topicProposal: UserAiRuntimeFeatureStatus
  projectChat: UserAiRuntimeFeatureStatus
  defenseRealtime: DefenseRealtimeRuntimeOptions
}

function resolveDefenseCozeVoiceProvider(runtime: Awaited<ReturnType<typeof readEffectiveRuntimeSettings>>['runtime']): PlatformAiProviderConfig | null {
  const registry = resolvePlatformAiRegistry(runtime)
  const providerMap = new Map(registry.providers.map(provider => [provider.id, provider]))
  const defenseChannel = registry.channels.find(item => item.key === 'defense')
  return (defenseChannel?.providerIds || [])
    .map(providerId => providerMap.get(providerId) || null)
    .find(provider => provider?.enabled && provider.type === 'coze-voice') || null
}

function buildDefenseRealtimeRuntimeOptions(runtime: Awaited<ReturnType<typeof readEffectiveRuntimeSettings>>['runtime']): DefenseRealtimeRuntimeOptions {
  const cozeProvider = resolveDefenseCozeVoiceProvider(runtime)
  const cozeVoice = cozeProvider?.voice?.coze
  return {
    defaultProvider: cozeProvider ? 'coze' : 'qwen',
    coze: {
      configured: Boolean(cozeProvider?.enabled && cozeVoice?.agents.some(item => item.enabled)),
      agents: (cozeVoice?.agents || []).map(item => ({
        id: item.id,
        name: item.name,
        judgeType: item.judgeType === 'technical' || item.judgeType === 'business' || item.judgeType === 'expression'
          ? item.judgeType
          : 'custom',
        defaultVoiceId: item.defaultVoiceId || undefined,
        enabled: item.enabled,
      })),
      voices: (cozeVoice?.voices || []).map(item => ({
        id: item.id,
        name: item.name,
        voiceId: item.voiceId,
        style: item.style || undefined,
        enabled: item.enabled,
      })),
      roomConfig: cozeVoice?.roomConfig
        ? {
            createRoomOnServer: cozeVoice.roomConfig.createRoomOnServer,
            roomNamePrefix: cozeVoice.roomConfig.roomNamePrefix,
          }
        : null,
    },
  }
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
    degraded: !items.some(item => item.configured),
    writeBlocked: !items.some(item => item.configured),
    rebuildRecommended: !items.some(item => item.configured),
  }
}

function buildFeatureStatus(
  runtime: Awaited<ReturnType<typeof readEffectiveRuntimeSettings>>['runtime'],
  channelKey: PlatformAiChannelKey,
  label: string,
  options: {
    writeBlocked?: boolean
    rebuildRecommended?: boolean
  } = {},
): UserAiRuntimeFeatureStatus {
  const resolved = resolveAiRuntimeForChannel(runtime, channelKey)
  const configured = isAiRuntimeConfigured(resolved.ai)
  return {
    configured,
    provider: String(resolved.ai.provider || '').trim(),
    model: String(resolved.ai.model || '').trim(),
    reason: buildAiNotConfiguredMessage(label),
    degraded: !configured,
    writeBlocked: Boolean(options.writeBlocked && !configured),
    rebuildRecommended: Boolean(options.rebuildRecommended && !configured),
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  await requireAuth(event)

  const workspaceDialogAsk = buildFeatureStatus(runtime, 'workspace_dialog_ask', '工作台 AI')
  const workspaceAutoOptimize = buildFeatureStatus(runtime, 'workspace_auto_optimize', '工作台 AI', { writeBlocked: true })
  const workspaceIssueDiscovery = buildFeatureStatus(runtime, 'workspace_issue_discovery', '工作台 AI', { writeBlocked: true })
  const documentSummarize = buildFeatureStatus(runtime, 'workspace_document_summarize', '文档总结 AI', { writeBlocked: true })
  const documentRewrite = buildFeatureStatus(runtime, 'workspace_document_rewrite', '文档润写 AI', { writeBlocked: true })
  const documentContinue = buildFeatureStatus(runtime, 'workspace_document_continue', '文档续写 AI', { writeBlocked: true })
  const documentExpand = buildFeatureStatus(runtime, 'workspace_document_expand', '文档扩写 AI', { writeBlocked: true })
  const documentCompleteContext = buildFeatureStatus(runtime, 'workspace_document_complete_context', '文档补全上下文 AI', { writeBlocked: true })
  const documentRestructure = buildFeatureStatus(runtime, 'workspace_document_restructure', '文档结构整理 AI', { writeBlocked: true })
  const documentAssist = combineFeatureStatuses('文档 AI', [
    documentSummarize,
    documentRewrite,
    documentContinue,
    documentExpand,
    documentCompleteContext,
    documentRestructure,
  ])
  const canvasGenerate = buildFeatureStatus(runtime, 'workspace_canvas_generate', '画布生成 AI', { writeBlocked: true })
  const canvasComplete = buildFeatureStatus(runtime, 'workspace_canvas_complete', '画布补全 AI', { writeBlocked: true })
  const canvasRefine = buildFeatureStatus(runtime, 'workspace_canvas_refine', '画布续改 AI', { writeBlocked: true })
  const knowledgeEmbedding = buildFeatureStatus(runtime, 'knowledge_embedding', '知识 Embedding', {
    rebuildRecommended: true,
  })
  const knowledgeVisualEmbedding = buildFeatureStatus(runtime, 'knowledge_visual_embedding', '知识视觉 Embedding', {
    rebuildRecommended: true,
  })
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
    knowledgeEmbedding,
    knowledgeVisualEmbedding,
    defenseRealtime: buildDefenseRealtimeRuntimeOptions(runtime),
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
