import { setResponseStatus } from 'h3'
import { aggregatePlatformAiProviderUsage } from '~~/server/services/admin-ai/provider-usage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { getPlatformAiChannelDefinitions, resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { getPlatformAiOverrideState, readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime, overrides } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看 AI 配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  const registry = resolvePlatformAiRegistry(runtime)
  const providerStats = await withClient(event, db => aggregatePlatformAiProviderUsage(db, registry.providers))
  const payload = {
    llm: {
      provider: runtime.ai.provider,
      baseURL: runtime.ai.baseURL,
      model: runtime.ai.model,
      embeddingModel: runtime.ai.embeddingModel,
      modelCatalogJson: runtime.ai.modelCatalogJson,
      modelPricingJson: runtime.ai.modelPricingJson,
      providersJson: runtime.ai.providersJson,
      channelsJson: runtime.ai.channelsJson,
      temperature: runtime.ai.temperature,
      topP: runtime.ai.topP,
      maxTokens: runtime.ai.maxTokens,
      presencePenalty: runtime.ai.presencePenalty,
      frequencyPenalty: runtime.ai.frequencyPenalty,
      timeoutMs: runtime.ai.timeoutMs,
      maxRetries: runtime.ai.maxRetries,
      apiKeyConfigured: Boolean(runtime.ai.apiKey),
    },
    docAi: {
      provider: runtime.docAi.provider,
      baseURL: runtime.docAi.baseURL,
      model: runtime.docAi.model,
      modelPricingJson: runtime.docAi.modelPricingJson,
      timeoutMs: runtime.docAi.timeoutMs,
      maxRetries: runtime.docAi.maxRetries,
      apiKeyConfigured: Boolean(runtime.docAi.apiKey),
    },
    adminAi: {
      enabled: runtime.adminAi.enabled,
      tavilyConfigured: Boolean(runtime.adminAi.tavilyApiKey),
      webTimeoutMs: runtime.adminAi.webTimeoutMs,
      maxWebResults: runtime.adminAi.maxWebResults,
      maxPageChars: runtime.adminAi.maxPageChars,
    },
    registry: {
      providers: registry.providers.map(item => ({
        id: item.id,
        name: item.name,
        adapter: item.adapter,
        provider: item.provider,
        baseURL: item.baseURL,
        enabled: item.enabled,
        timeoutMs: item.timeoutMs,
        maxRetries: item.maxRetries,
        apiKeyConfigured: Boolean(item.apiKey),
        models: item.models,
      })),
      providerStats,
      channels: registry.channels,
      channelDefinitions: getPlatformAiChannelDefinitions(),
    },
    overrideState: getPlatformAiOverrideState(overrides),
  }

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'read.admin.ai.providers',
      payload: {
        adminAiEnabled: runtime.adminAi.enabled,
      },
    })
  })

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
