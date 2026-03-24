import { setResponseStatus } from 'h3'
import { aggregatePlatformAiProviderUsage } from '~~/server/services/admin-ai/provider-usage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  buildPlatformAiChannelsJson,
  buildPlatformAiRegistryJson,
  getPlatformAiChannelDefinitions,
  resolvePlatformAiRegistry,
} from '~~/server/utils/platform-ai-channels'
import {
  applyPlatformAiRuntimeOverrides,
  getPlatformAiOverrideState,
  normalizePlatformAiRuntimeOverrides,
  readEffectiveRuntimeSettings,
  readPlatformAiRuntimeOverrides,
  writePlatformAiRuntimeOverrides,
} from '~~/server/utils/platform-ai-config-store'

type SecretMode = 'keep' | 'replace' | 'clear'

interface ProvidersPatchBody {
  ai?: {
    provider?: string
    baseURL?: string
    model?: string
    modelCatalogJson?: string
    modelPricingJson?: string
    providers?: unknown
    channels?: unknown
    temperature?: number
    topP?: number
    maxTokens?: number
    presencePenalty?: number
    frequencyPenalty?: number
    timeoutMs?: number
    maxRetries?: number
    apiKey?: string
    apiKeyMode?: SecretMode
  }
  docAi?: {
    provider?: string
    baseURL?: string
    model?: string
    modelPricingJson?: string
    timeoutMs?: number
    maxRetries?: number
    apiKey?: string
    apiKeyMode?: SecretMode
  }
  adminAi?: {
    enabled?: boolean
    webTimeoutMs?: number
    maxWebResults?: number
    maxPageChars?: number
    tavilyApiKey?: string
    tavilyApiKeyMode?: SecretMode
  }
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function toMode(raw: unknown): SecretMode {
  const value = String(raw || '').trim()
  if (value === 'replace' || value === 'clear')
    return value
  return 'keep'
}

function ensureSection<T extends object>(value: T | undefined): T {
  return (value || {}) as T
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<ProvidersPatchBody>(event).catch(() => ({} as ProvidersPatchBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改 AI 配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40390)
  }

  const nextOverrides = await withTransaction(event, async (db) => {
    const existing = normalizePlatformAiRuntimeOverrides(await readPlatformAiRuntimeOverrides(db))
    const next = normalizePlatformAiRuntimeOverrides(existing)

    const aiBody = body?.ai && typeof body.ai === 'object' ? body.ai as Record<string, unknown> : null
    if (aiBody) {
      const ai = ensureSection(next.ai)
      if (hasOwn(aiBody, 'provider'))
        ai.provider = String(aiBody.provider || '').trim()
      if (hasOwn(aiBody, 'baseURL'))
        ai.baseURL = String(aiBody.baseURL || '').trim()
      if (hasOwn(aiBody, 'model'))
        ai.model = String(aiBody.model || '').trim()
      if (hasOwn(aiBody, 'modelCatalogJson'))
        ai.modelCatalogJson = String(aiBody.modelCatalogJson || '')
      if (hasOwn(aiBody, 'modelPricingJson'))
        ai.modelPricingJson = String(aiBody.modelPricingJson || '')
      if (hasOwn(aiBody, 'providers')) {
        ai.providersJson = buildPlatformAiRegistryJson({
          ...runtime,
          ai: {
            ...runtime.ai,
            ...ai,
          },
        }, aiBody.providers)
      }
      if (hasOwn(aiBody, 'channels')) {
        const providersRuntime = {
          ...runtime,
          ai: {
            ...runtime.ai,
            ...ai,
            providersJson: ai.providersJson || runtime.ai.providersJson,
          },
        }
        const providers = resolvePlatformAiRegistry(providersRuntime).providers
        ai.channelsJson = buildPlatformAiChannelsJson(providersRuntime, aiBody.channels, providers)
      }
      if (hasOwn(aiBody, 'temperature'))
        ai.temperature = Number(aiBody.temperature)
      if (hasOwn(aiBody, 'topP'))
        ai.topP = Number(aiBody.topP)
      if (hasOwn(aiBody, 'maxTokens'))
        ai.maxTokens = Number(aiBody.maxTokens)
      if (hasOwn(aiBody, 'presencePenalty'))
        ai.presencePenalty = Number(aiBody.presencePenalty)
      if (hasOwn(aiBody, 'frequencyPenalty'))
        ai.frequencyPenalty = Number(aiBody.frequencyPenalty)
      if (hasOwn(aiBody, 'timeoutMs'))
        ai.timeoutMs = Number(aiBody.timeoutMs)
      if (hasOwn(aiBody, 'maxRetries'))
        ai.maxRetries = Number(aiBody.maxRetries)

      const apiKeyMode = toMode(aiBody.apiKeyMode)
      if (apiKeyMode === 'replace')
        ai.apiKey = String(aiBody.apiKey || '')
      if (apiKeyMode === 'clear')
        ai.apiKey = ''

      next.ai = ai
    }

    const docAiBody = body?.docAi && typeof body.docAi === 'object' ? body.docAi as Record<string, unknown> : null
    if (docAiBody) {
      const docAi = ensureSection(next.docAi)
      if (hasOwn(docAiBody, 'provider'))
        docAi.provider = String(docAiBody.provider || '').trim()
      if (hasOwn(docAiBody, 'baseURL'))
        docAi.baseURL = String(docAiBody.baseURL || '').trim()
      if (hasOwn(docAiBody, 'model'))
        docAi.model = String(docAiBody.model || '').trim()
      if (hasOwn(docAiBody, 'modelPricingJson'))
        docAi.modelPricingJson = String(docAiBody.modelPricingJson || '')
      if (hasOwn(docAiBody, 'timeoutMs'))
        docAi.timeoutMs = Number(docAiBody.timeoutMs)
      if (hasOwn(docAiBody, 'maxRetries'))
        docAi.maxRetries = Number(docAiBody.maxRetries)

      const apiKeyMode = toMode(docAiBody.apiKeyMode)
      if (apiKeyMode === 'replace')
        docAi.apiKey = String(docAiBody.apiKey || '')
      if (apiKeyMode === 'clear')
        docAi.apiKey = ''

      next.docAi = docAi
    }

    const adminAiBody = body?.adminAi && typeof body.adminAi === 'object' ? body.adminAi as Record<string, unknown> : null
    if (adminAiBody) {
      const adminAi = ensureSection(next.adminAi)
      if (hasOwn(adminAiBody, 'enabled'))
        adminAi.enabled = Boolean(adminAiBody.enabled)
      if (hasOwn(adminAiBody, 'webTimeoutMs'))
        adminAi.webTimeoutMs = Number(adminAiBody.webTimeoutMs)
      if (hasOwn(adminAiBody, 'maxWebResults'))
        adminAi.maxWebResults = Number(adminAiBody.maxWebResults)
      if (hasOwn(adminAiBody, 'maxPageChars'))
        adminAi.maxPageChars = Number(adminAiBody.maxPageChars)

      const tavilyApiKeyMode = toMode(adminAiBody.tavilyApiKeyMode)
      if (tavilyApiKeyMode === 'replace')
        adminAi.tavilyApiKey = String(adminAiBody.tavilyApiKey || '')
      if (tavilyApiKeyMode === 'clear')
        adminAi.tavilyApiKey = ''

      next.adminAi = adminAi
    }

    next.updatedAt = new Date().toISOString()
    next.updatedByUserId = user.id

    const normalized = normalizePlatformAiRuntimeOverrides(next)
    await writePlatformAiRuntimeOverrides(db, normalized)
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'write.admin.ai.providers',
      payload: {
        hasAiUpdate: Boolean(aiBody),
        hasDocAiUpdate: Boolean(docAiBody),
        hasAdminAiUpdate: Boolean(adminAiBody),
        hasProviderRegistryUpdate: Boolean(aiBody && hasOwn(aiBody, 'providers')),
        hasChannelConfigUpdate: Boolean(aiBody && hasOwn(aiBody, 'channels')),
      },
    })
    return normalized
  })

  const effectiveRuntime = applyPlatformAiRuntimeOverrides(runtime, nextOverrides)
  const registry = resolvePlatformAiRegistry(effectiveRuntime)
  const providerStats = await withClient(event, db => aggregatePlatformAiProviderUsage(db, registry.providers))
  const payload = {
    llm: {
      provider: effectiveRuntime.ai.provider,
      baseURL: effectiveRuntime.ai.baseURL,
      model: effectiveRuntime.ai.model,
      modelCatalogJson: effectiveRuntime.ai.modelCatalogJson,
      modelPricingJson: effectiveRuntime.ai.modelPricingJson,
      providersJson: effectiveRuntime.ai.providersJson,
      channelsJson: effectiveRuntime.ai.channelsJson,
      temperature: effectiveRuntime.ai.temperature,
      topP: effectiveRuntime.ai.topP,
      maxTokens: effectiveRuntime.ai.maxTokens,
      presencePenalty: effectiveRuntime.ai.presencePenalty,
      frequencyPenalty: effectiveRuntime.ai.frequencyPenalty,
      timeoutMs: effectiveRuntime.ai.timeoutMs,
      maxRetries: effectiveRuntime.ai.maxRetries,
      apiKeyConfigured: Boolean(effectiveRuntime.ai.apiKey),
    },
    docAi: {
      provider: effectiveRuntime.docAi.provider,
      baseURL: effectiveRuntime.docAi.baseURL,
      model: effectiveRuntime.docAi.model,
      modelPricingJson: effectiveRuntime.docAi.modelPricingJson,
      timeoutMs: effectiveRuntime.docAi.timeoutMs,
      maxRetries: effectiveRuntime.docAi.maxRetries,
      apiKeyConfigured: Boolean(effectiveRuntime.docAi.apiKey),
    },
    adminAi: {
      enabled: effectiveRuntime.adminAi.enabled,
      tavilyConfigured: Boolean(effectiveRuntime.adminAi.tavilyApiKey),
      webTimeoutMs: effectiveRuntime.adminAi.webTimeoutMs,
      maxWebResults: effectiveRuntime.adminAi.maxWebResults,
      maxPageChars: effectiveRuntime.adminAi.maxPageChars,
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
    overrideState: getPlatformAiOverrideState(nextOverrides),
  }

  return ok(payload, {
    startedAt,
    provider: effectiveRuntime.ai.provider,
    model: effectiveRuntime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
