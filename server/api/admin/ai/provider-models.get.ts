import { setResponseStatus } from 'h3'
import { discoverProviderModels } from '~~/server/services/admin-ai/provider-models'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

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

  const registry = resolvePlatformAiRegistry(runtime)
  const query = getQuery(event)
  const providerId = String(query.providerId || '').trim()
  const provider = (providerId ? registry.providers.find(item => item.id === providerId) : null)
    || registry.providers.find(item => item.capability !== 'search')
    || null
  if (!provider) {
    setResponseStatus(event, 400)
    return fail('尚未配置可拉取模型池的 Provider。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40096)
  }

  if (provider.capability === 'search') {
    setResponseStatus(event, 400)
    return fail('当前 Provider 不支持模型池拉取。', {
      startedAt,
      provider: provider.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  if (!String(provider.apiKey || '').trim()) {
    setResponseStatus(event, 400)
    return fail('Provider API Key 未配置，无法自动拉取模型。', {
      startedAt,
      provider: provider.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  try {
    const items = await discoverProviderModels({
      scope: 'provider',
      provider: provider.provider,
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      modelPricingJson: '',
      timeoutMs: provider.timeoutMs,
      adapter: provider.adapter,
    })

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'read.admin.ai.provider_models',
        payload: {
          provider: provider.provider,
          count: items.length,
        },
      })
    })

    return ok({
      providerId: provider.id,
      providerName: provider.name,
      provider: provider.provider,
      baseURL: provider.baseURL,
      fetchedAt: new Date().toISOString(),
      items,
    }, {
      startedAt,
      provider: provider.provider,
      model: provider.models[0]?.model || runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    setResponseStatus(event, 502)
    return fail(String(error?.message || '模型列表拉取失败，请检查 provider/baseURL/apiKey。'), {
      startedAt,
      provider: provider.provider,
      model: provider.models[0]?.model || runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50296)
  }
})
