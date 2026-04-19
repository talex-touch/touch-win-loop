import { setResponseStatus } from 'h3'
import { discoverProviderModels } from '~~/server/services/admin-ai/provider-models'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { normalizePlatformAiBaseURL, resolvePlatformAiTransientApiKey } from '~~/server/utils/platform-ai-base-url'
import { buildPlatformAiRegistryJson, resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

type SecretMode = 'keep' | 'replace' | 'clear'

interface ProviderDraftBody {
  id?: string
  name?: string
  type?: string
  provider?: string
  clientType?: string
  baseURL?: string
  timeoutMs?: number
  maxRetries?: number
  enabled?: boolean
  apiKey?: string
  embeddingApiStyle?: string
  embeddingDimensions?: number
  visionModel?: string
  models?: unknown[]
}

interface ProviderModelsBody {
  providerId?: string
  draftProvider?: ProviderDraftBody
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
  const currentProvider = registry.providers.find(item => item.id === toText(body.providerId))
    || registry.providers.find(item => item.capability === 'llm')
    || null

  const draftProvider = body.draftProvider && typeof body.draftProvider === 'object'
    ? body.draftProvider
    : null
  const resolvedProvider = draftProvider
    ? (() => {
        const seed = {
          ...currentProvider,
          ...draftProvider,
          id: toText(draftProvider.id) || currentProvider?.id || 'provider_1',
          provider: toText(draftProvider.provider) || currentProvider?.provider || '',
          baseURL: normalizePlatformAiBaseURL(draftProvider.baseURL, toText(draftProvider.provider) || currentProvider?.provider || ''),
          models: Array.isArray(draftProvider.models) ? draftProvider.models : currentProvider?.models || [],
        }
        const draftRuntime = {
          ...runtime,
          ai: {
            ...runtime.ai,
            providersJson: buildPlatformAiRegistryJson(runtime, {
              providers: [seed],
              defaults: registry.defaults,
            }),
          },
        }
        return resolvePlatformAiRegistry(draftRuntime).providers[0] || null
      })()
    : currentProvider

  if (!resolvedProvider || resolvedProvider.capability !== 'llm') {
    setResponseStatus(event, 400)
    return fail('当前 Provider 不支持模型池拉取。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  const apiKeyMode = toMode(body.apiKeyMode)
  const apiKey = resolvePlatformAiTransientApiKey({
    currentApiKey: resolvedProvider.apiKey,
    providedApiKey: body.apiKey ?? draftProvider?.apiKey,
    mode: apiKeyMode,
  })
  const usedProvidedApiKey = Boolean(toText(body.apiKey ?? draftProvider?.apiKey))
  const provider = toText(resolvedProvider.provider)
  const baseURL = normalizePlatformAiBaseURL(resolvedProvider.baseURL, provider)
  const timeoutMs = resolvedProvider.timeoutMs || runtime.ai.timeoutMs

  if (!apiKey) {
    setResponseStatus(event, 400)
    return fail('Provider API Key 未配置，无法自动拉取模型。', {
      startedAt,
      provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  if (!provider) {
    setResponseStatus(event, 400)
    return fail('Provider 标识未配置，无法自动拉取模型。', {
      startedAt,
      provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  if (!baseURL) {
    setResponseStatus(event, 400)
    return fail('Provider Base URL 未配置，无法自动拉取模型。', {
      startedAt,
      provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  try {
    const items = await discoverProviderModels({
      scope: 'provider',
      provider,
      baseURL,
      apiKey,
      modelPricingJson: '',
      timeoutMs,
      adapter: resolvedProvider.adapter,
    })

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'read.admin.ai.provider_models',
        payload: {
          providerId: resolvedProvider.id,
          provider,
          count: items.length,
          usedRequestOverrides: Boolean(draftProvider || usedProvidedApiKey || apiKeyMode !== 'keep'),
        },
      })
    })

    return ok({
      providerId: resolvedProvider.id,
      provider,
      baseURL,
      fetchedAt: new Date().toISOString(),
      items,
    }, {
      startedAt,
      provider,
      model: resolvedProvider.models[0]?.model || runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    setResponseStatus(event, 502)
    const sourceLabel = usedProvidedApiKey ? '当前输入的 API Key' : '已保存的 API Key'
    return fail(`[${sourceLabel}] ${String(error?.message || '模型列表拉取失败，请检查 provider/baseURL/apiKey。')}`, {
      startedAt,
      provider,
      model: resolvedProvider.models[0]?.model || runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50296)
  }
})
