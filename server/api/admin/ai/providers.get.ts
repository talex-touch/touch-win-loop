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
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  const registry = resolvePlatformAiRegistry(runtime)
  const providerStats = await withClient(event, db => aggregatePlatformAiProviderUsage(db, registry.providers))
  const payload = {
    providers: registry.providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      capability: provider.capability,
      adapter: provider.adapter,
      provider: provider.provider,
      clientType: provider.clientType,
      baseURL: provider.baseURL,
      enabled: provider.enabled,
      timeoutMs: provider.timeoutMs,
      maxRetries: provider.maxRetries,
      fetchedAt: provider.fetchedAt,
      apiKeyConfigured: Boolean(String(provider.apiKey || '').trim()),
      embeddingApiStyle: provider.embeddingApiStyle || runtime.ai.embeddingApiStyle,
      embeddingDimensions: provider.embeddingDimensions || runtime.ai.embeddingDimensions,
      voice: provider.voice,
      models: provider.models,
    })),
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
        providerCount: payload.providers.length,
        sceneCount: payload.scenes.items.length,
      },
    })
  })

  return ok(payload, {
    startedAt,
    fallbackUsed: false,
    attempts: 1,
  })
})
