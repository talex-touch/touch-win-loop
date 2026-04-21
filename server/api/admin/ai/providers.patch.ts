import type { PlatformAiProviderType } from '~~/server/utils/platform-ai-channels'
import type {
  PlatformAiClientType,
  ProjectKnowledgeEmbeddingApiStyle,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { aggregatePlatformAiProviderUsage } from '~~/server/services/admin-ai/provider-usage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { normalizePlatformAiApiKey, normalizePlatformAiBaseURL } from '~~/server/utils/platform-ai-base-url'
import {
  buildPlatformAiChannelsJson,
  buildPlatformAiRegistryJson,
  getPlatformAiChannelDefinitions,

  resolvePlatformAiModelCatalogJson,
  resolvePlatformAiModelPricingJson,
  resolvePlatformAiRegistry,
} from '~~/server/utils/platform-ai-channels'
import {
  normalizePlatformAiClientType,
  normalizeProjectKnowledgeEmbeddingApiStyle,
} from '~~/server/utils/platform-ai-client'
import {
  applyPlatformAiRuntimeOverrides,
  getPlatformAiOverrideState,
  normalizePlatformAiRuntimeOverrides,
  readEffectiveRuntimeSettings,
  readPlatformAiRuntimeOverrides,
  writePlatformAiRuntimeOverrides,
} from '~~/server/utils/platform-ai-config-store'
import { hasConfigMasterKey } from '~~/server/utils/secure-config'

type SecretMode = 'keep' | 'replace' | 'clear'

interface ProviderDraftBody {
  id?: string
  name?: string
  type?: PlatformAiProviderType
  provider?: string
  clientType?: PlatformAiClientType
  baseURL?: string
  timeoutMs?: number
  maxRetries?: number
  enabled?: boolean
  apiKey?: string
  apiKeyMode?: SecretMode
  embeddingApiStyle?: ProjectKnowledgeEmbeddingApiStyle
  embeddingDimensions?: number
  visionModel?: string
  models?: unknown[]
}

interface ProvidersPatchBody {
  providers?: ProviderDraftBody[]
  scenes?: {
    items?: unknown[]
  } | unknown[]
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

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSceneItems(raw: ProvidersPatchBody['scenes']): unknown[] {
  if (Array.isArray(raw))
    return raw
  if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items))
    return (raw as { items?: unknown[] }).items || []
  return []
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
      fallbackUsed: false,
      attempts: 1,
    }, 40390)
  }

  const hasProvidersUpdate = Array.isArray(body.providers)
  const scenesItems = normalizeSceneItems(body.scenes)
  const hasScenesUpdate = scenesItems.length > 0 || Boolean(body.scenes)
  const adminAiBody = body.adminAi && typeof body.adminAi === 'object' ? body.adminAi as Record<string, unknown> : null
  const masterKeyReady = hasConfigMasterKey(event)
  const ignoredProviderApiKeyIds: string[] = []

  const nextOverrides = await withTransaction(event, async (db) => {
    const existing = normalizePlatformAiRuntimeOverrides(await readPlatformAiRuntimeOverrides(db))
    const next = normalizePlatformAiRuntimeOverrides(existing)
    const currentRuntime = applyPlatformAiRuntimeOverrides(runtime, existing)
    const currentRegistry = resolvePlatformAiRegistry(currentRuntime)
    const currentProvidersById = new Map(currentRegistry.providers.map(item => [item.id, item]))

    const providerDrafts = hasProvidersUpdate ? body.providers || [] : currentRegistry.providers
    const providerSeeds = providerDrafts.map((rawProvider, index) => {
      const source = rawProvider && typeof rawProvider === 'object'
        ? rawProvider as ProviderDraftBody
        : {} as ProviderDraftBody
      const currentProvider = currentProvidersById.get(toText(source.id)) || null
      const providerId = toText(source.id) || currentProvider?.id || `provider_${index + 1}`
      const providedApiKey = normalizePlatformAiApiKey(source.apiKey)
      const apiKeyMode = providedApiKey ? 'replace' : toMode(source.apiKeyMode)
      let apiKey = currentProvider?.apiKey || ''
      if (apiKeyMode === 'replace') {
        if (masterKeyReady)
          apiKey = providedApiKey
        else
          ignoredProviderApiKeyIds.push(providerId)
      }
      else if (apiKeyMode === 'clear') {
        apiKey = ''
      }

      return {
        id: providerId,
        name: toText(source.name) || currentProvider?.name || '',
        type: source.type || currentProvider?.type || 'openai-compatible',
        provider: toText(source.provider) || currentProvider?.provider || '',
        clientType: hasOwn(source as Record<string, unknown>, 'clientType')
          ? normalizePlatformAiClientType(source.clientType, currentRuntime.ai.clientType)
          : (currentProvider?.clientType || currentRuntime.ai.clientType),
        baseURL: hasOwn(source as Record<string, unknown>, 'baseURL')
          ? normalizePlatformAiBaseURL(source.baseURL, toText(source.provider) || currentProvider?.provider || '')
          : (currentProvider?.baseURL || currentRuntime.ai.baseURL),
        enabled: hasOwn(source as Record<string, unknown>, 'enabled')
          ? Boolean(source.enabled)
          : (currentProvider?.enabled ?? true),
        timeoutMs: hasOwn(source as Record<string, unknown>, 'timeoutMs')
          ? Number(source.timeoutMs || currentRuntime.ai.timeoutMs)
          : (currentProvider?.timeoutMs || currentRuntime.ai.timeoutMs),
        maxRetries: hasOwn(source as Record<string, unknown>, 'maxRetries')
          ? Number(source.maxRetries || currentRuntime.ai.maxRetries)
          : (currentProvider?.maxRetries || currentRuntime.ai.maxRetries),
        apiKey,
        fetchedAt: currentProvider?.fetchedAt || '',
        embeddingApiStyle: hasOwn(source as Record<string, unknown>, 'embeddingApiStyle')
          ? normalizeProjectKnowledgeEmbeddingApiStyle(source.embeddingApiStyle, currentRuntime.ai.embeddingApiStyle)
          : (currentProvider?.embeddingApiStyle || currentRuntime.ai.embeddingApiStyle),
        embeddingDimensions: hasOwn(source as Record<string, unknown>, 'embeddingDimensions')
          ? Number(source.embeddingDimensions || currentRuntime.ai.embeddingDimensions)
          : (currentProvider?.embeddingDimensions || currentRuntime.ai.embeddingDimensions),
        visionModel: hasOwn(source as Record<string, unknown>, 'visionModel')
          ? toText(source.visionModel)
          : (currentProvider?.visionModel || currentRuntime.ai.visionModel),
        models: Array.isArray(source.models)
          ? source.models
          : (currentProvider?.models || []),
      }
    })

    const ai = ensureSection(next.ai)

    ai.providersJson = buildPlatformAiRegistryJson(currentRuntime, {
      providers: providerSeeds,
    })

    const providerPreviewRuntime = {
      ...currentRuntime,
      ai: {
        ...currentRuntime.ai,
        providersJson: ai.providersJson,
      },
    }
    const providerPreviewRegistry = resolvePlatformAiRegistry(providerPreviewRuntime)

    const nextSceneItems = hasScenesUpdate ? scenesItems : currentRegistry.channels
    ai.channelsJson = buildPlatformAiChannelsJson(
      providerPreviewRuntime,
      nextSceneItems,
      providerPreviewRegistry.providers,
    )

    const finalPreviewRuntime = {
      ...providerPreviewRuntime,
      ai: {
        ...providerPreviewRuntime.ai,
        channelsJson: ai.channelsJson,
      },
    }
    delete ai.provider
    delete ai.baseURL
    delete ai.apiKey
    delete ai.model
    delete ai.embeddingModel
    delete ai.embeddingApiStyle
    delete ai.embeddingDimensions
    delete ai.visionModel

    const runtimeForCatalog = {
      ...finalPreviewRuntime,
      ai: {
        ...finalPreviewRuntime.ai,
        providersJson: ai.providersJson,
        channelsJson: ai.channelsJson,
      },
    }

    ai.modelCatalogJson = resolvePlatformAiModelCatalogJson(runtimeForCatalog)
    ai.modelPricingJson = resolvePlatformAiModelPricingJson(runtimeForCatalog)

    next.ai = ai
    delete next.docAi

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
      if (tavilyApiKeyMode === 'replace' && masterKeyReady)
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
        providerCount: providerSeeds.length,
        sceneCount: nextSceneItems.length,
        ignoredProviderApiKeyIds,
        hasAdminAiUpdate: Boolean(adminAiBody),
      },
    })
    return normalized
  })

  const effectiveRuntime = applyPlatformAiRuntimeOverrides(runtime, nextOverrides)
  const registry = resolvePlatformAiRegistry(effectiveRuntime)
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
      embeddingApiStyle: provider.embeddingApiStyle || effectiveRuntime.ai.embeddingApiStyle,
      embeddingDimensions: provider.embeddingDimensions || effectiveRuntime.ai.embeddingDimensions,
      visionModel: provider.visionModel || '',
      models: provider.models,
    })),
    scenes: {
      items: registry.channels,
      definitions: getPlatformAiChannelDefinitions(),
    },
    adminAi: {
      enabled: effectiveRuntime.adminAi.enabled,
      tavilyConfigured: Boolean(effectiveRuntime.adminAi.tavilyApiKey),
      webTimeoutMs: effectiveRuntime.adminAi.webTimeoutMs,
      maxWebResults: effectiveRuntime.adminAi.maxWebResults,
      maxPageChars: effectiveRuntime.adminAi.maxPageChars,
    },
    config: {
      masterKeyReady,
    },
    warnings: {
      ignoredProviderApiKeyIds,
    },
    stats: {
      providerUsage: providerStats,
    },
    overrideState: getPlatformAiOverrideState(nextOverrides),
  }

  return ok(payload, {
    startedAt,
    fallbackUsed: false,
    attempts: 1,
  })
})
