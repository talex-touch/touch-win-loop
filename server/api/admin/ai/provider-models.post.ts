import { setResponseStatus } from 'h3'
import { discoverProviderModels } from '~~/server/services/admin-ai/provider-models'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { normalizePlatformAiBaseURL, resolvePlatformAiTransientApiKey } from '~~/server/utils/platform-ai-base-url'
import { resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

type SecretMode = 'keep' | 'replace' | 'clear'

interface ProviderModelsBody {
  provider?: string
  baseURL?: string
  apiKey?: string
  apiKeyMode?: SecretMode
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function toMode(value: unknown): SecretMode {
  const normalized = toText(value)
  if (normalized === 'replace' || normalized === 'clear')
    return normalized
  return 'keep'
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

  const body = await readBody<ProviderModelsBody>(event).catch(() => ({} as ProviderModelsBody))
  const registry = resolvePlatformAiRegistry(runtime)
  const currentProvider = registry.providers[0]
  const provider = toText(body.provider) || currentProvider?.provider || runtime.ai.provider
  const baseURL = normalizePlatformAiBaseURL(body.baseURL, provider) || currentProvider?.baseURL || runtime.ai.baseURL
  const apiKeyMode = toMode(body.apiKeyMode)
  const apiKey = resolvePlatformAiTransientApiKey({
    currentApiKey: currentProvider?.apiKey || runtime.ai.apiKey,
    providedApiKey: body.apiKey,
    mode: apiKeyMode,
  })
  const usedProvidedApiKey = Boolean(toText(body.apiKey))
  const timeoutMs = currentProvider?.timeoutMs || runtime.ai.timeoutMs

  console.warn('[admin-ai][provider-models] starting pull', {
    provider,
    baseURL,
    apiKeyMode,
    usedProvidedApiKey,
    apiKeyPresent: Boolean(apiKey),
    apiKeyLength: String(apiKey || '').length,
  })

  if (!toText(apiKey)) {
    setResponseStatus(event, 400)
    return fail('共享上游 API Key 未配置，无法自动拉取模型。', {
      startedAt,
      provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  try {
    const items = await discoverProviderModels({
      scope: 'provider',
      provider,
      baseURL,
      apiKey,
      modelPricingJson: '',
      timeoutMs,
      adapter: currentProvider?.adapter,
    })

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'read.admin.ai.provider_models',
        payload: {
          provider,
          count: items.length,
          usedRequestOverrides: Boolean(toText(body.provider) || toText(body.baseURL) || usedProvidedApiKey || apiKeyMode !== 'keep'),
        },
      })
    })

    return ok({
      provider,
      baseURL,
      fetchedAt: new Date().toISOString(),
      items,
    }, {
      startedAt,
      provider,
      model: currentProvider?.models[0]?.model || runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    console.warn('[admin-ai][provider-models] pull failed', {
      provider,
      baseURL,
      apiKeyMode,
      usedProvidedApiKey,
      message: String(error?.message || '模型列表拉取失败'),
    })
    setResponseStatus(event, 502)
    const sourceLabel = usedProvidedApiKey ? '当前输入的 API Key' : '已保存的 API Key'
    return fail(`[${sourceLabel}] ${String(error?.message || '模型列表拉取失败，请检查 provider/baseURL/apiKey。')}`, {
      startedAt,
      provider,
      model: currentProvider?.models[0]?.model || runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50296)
  }
})
