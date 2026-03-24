import type { ProviderModelScope } from '~~/server/services/admin-ai/provider-models'
import type { PlatformAiProviderAdapter } from '~~/server/utils/platform-ai-channels'
import { getQuery, setResponseStatus } from 'h3'
import { discoverProviderModels } from '~~/server/services/admin-ai/provider-models'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

function resolveScope(raw: unknown): ProviderModelScope {
  return String(raw || '').trim() === 'docAi' ? 'docAi' : 'llm'
}

function resolveAdapter(value: unknown): PlatformAiProviderAdapter {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'response')
    return 'response'
  return 'openai-compatible'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看模型目录配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40396)
  }

  const query = getQuery(event)
  const providerId = String(query.providerId || '').trim()
  const scope = resolveScope(query.scope)
  const registry = resolvePlatformAiRegistry(runtime)
  const providerFromRegistry = providerId
    ? registry.providers.find(item => item.id === providerId)
    : null
  const useRegistryProvider = Boolean(providerFromRegistry)
  const mode: ProviderModelScope = useRegistryProvider ? 'provider' : scope
  const providerConfig = useRegistryProvider
    ? {
        provider: providerFromRegistry!.provider,
        baseURL: providerFromRegistry!.baseURL,
        apiKey: providerFromRegistry!.apiKey || runtime.ai.apiKey,
        model: providerFromRegistry!.models[0]?.model || runtime.ai.model,
        modelPricingJson: '',
        timeoutMs: providerFromRegistry!.timeoutMs,
        maxRetries: providerFromRegistry!.maxRetries,
        adapter: providerFromRegistry!.adapter,
      }
    : (scope === 'docAi'
        ? {
            ...runtime.docAi,
            adapter: resolveAdapter(runtime.docAi.provider),
          }
        : {
            ...runtime.ai,
            adapter: resolveAdapter(runtime.ai.provider),
          })

  if (providerId && !providerFromRegistry) {
    setResponseStatus(event, 404)
    return fail(`Provider(${providerId}) 不存在。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40496)
  }

  if (!String(providerConfig.apiKey || '').trim()) {
    setResponseStatus(event, 400)
    return fail(`${scope === 'docAi' ? 'DocAI' : useRegistryProvider ? 'Provider' : 'LLM'} API Key 未配置，无法自动拉取模型。`, {
      startedAt,
      provider: providerConfig.provider,
      model: providerConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40096)
  }

  try {
    const items = await discoverProviderModels({
      scope: mode,
      provider: providerConfig.provider,
      baseURL: providerConfig.baseURL,
      apiKey: providerConfig.apiKey,
      modelPricingJson: providerConfig.modelPricingJson,
      timeoutMs: providerConfig.timeoutMs,
      adapter: providerConfig.adapter,
    })

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'read.admin.ai.provider_models',
        payload: {
          scope,
          mode,
          providerId: providerId || null,
          provider: providerConfig.provider,
          count: items.length,
        },
      })
    })

    return ok({
      scope,
      mode,
      providerId: providerId || '',
      provider: providerConfig.provider,
      baseURL: providerConfig.baseURL,
      fetchedAt: new Date().toISOString(),
      items,
    }, {
      startedAt,
      provider: providerConfig.provider,
      model: providerConfig.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    setResponseStatus(event, 502)
    return fail(String(error?.message || '模型列表拉取失败，请检查 provider/baseURL/apiKey。'), {
      startedAt,
      provider: providerConfig.provider,
      model: providerConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50296)
  }
})
