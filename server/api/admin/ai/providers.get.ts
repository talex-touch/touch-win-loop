import { setResponseStatus } from 'h3'
import { aggregatePlatformAiProviderUsage } from '~~/server/services/admin-ai/provider-usage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { getPlatformAiChannelDefinitions, resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { getPlatformAiOverrideState, readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { hasConfigMasterKey } from '~~/server/utils/secure-config'

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
  const sharedProvider = registry.providers[0]
  const providerStats = await withClient(event, db => aggregatePlatformAiProviderUsage(db, registry.providers))
  const payload = {
    upstream: {
      provider: sharedProvider?.provider || runtime.ai.provider,
      baseURL: sharedProvider?.baseURL || runtime.ai.baseURL,
      timeoutMs: sharedProvider?.timeoutMs || runtime.ai.timeoutMs,
      maxRetries: sharedProvider?.maxRetries || runtime.ai.maxRetries,
      apiKeyConfigured: Boolean(runtime.ai.apiKey),
      defaultModel: registry.defaults.defaultModel || runtime.ai.model,
      embeddingModel: registry.defaults.embeddingModel || runtime.ai.embeddingModel,
      visionModel: runtime.ai.visionModel,
      documentModel: registry.defaults.documentModel || runtime.docAi.model,
    },
    modelPool: {
      fetchedAt: sharedProvider?.fetchedAt || '',
      total: sharedProvider?.models.length || 0,
      items: sharedProvider?.models || [],
    },
    scenes: {
      items: registry.channels,
      definitions: getPlatformAiChannelDefinitions(),
    },
    adminAi: {
      enabled: runtime.adminAi.enabled,
      tavilyConfigured: Boolean(runtime.adminAi.tavilyApiKey),
      webTimeoutMs: runtime.adminAi.webTimeoutMs,
      maxWebResults: runtime.adminAi.maxWebResults,
      maxPageChars: runtime.adminAi.maxPageChars,
    },
    config: {
      masterKeyReady: hasConfigMasterKey(event),
    },
    stats: {
      providerUsage: providerStats,
    },
    overrideState: getPlatformAiOverrideState(overrides),
  }

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'read.admin.ai.providers',
      payload: {
        upstreamProvider: payload.upstream.provider,
        modelPoolSize: payload.modelPool.total,
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
