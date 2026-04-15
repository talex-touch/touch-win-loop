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
  applyPlatformAiRuntimeOverrides,
  getPlatformAiOverrideState,
  normalizePlatformAiRuntimeOverrides,
  readEffectiveRuntimeSettings,
  readPlatformAiRuntimeOverrides,
  writePlatformAiRuntimeOverrides,
} from '~~/server/utils/platform-ai-config-store'
import { hasConfigMasterKey } from '~~/server/utils/secure-config'

type SecretMode = 'keep' | 'replace' | 'clear'

interface ProvidersPatchBody {
  upstream?: {
    provider?: string
    baseURL?: string
    timeoutMs?: number
    maxRetries?: number
    defaultModel?: string
    embeddingModel?: string
    documentModel?: string
    apiKey?: string
    apiKeyMode?: SecretMode
  }
  modelPool?: {
    fetchedAt?: string
    pullTriggered?: boolean
    items?: unknown[]
  }
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

function buildManualPriceSignature(items: unknown[]): string {
  const normalized = items
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const source = item as Record<string, unknown>
      return {
        model: toText(source.model),
        manualPriceOverride: Boolean(source.manualPriceOverride),
        manualInputPricePer1M: source.manualInputPricePer1M ?? null,
        manualOutputPricePer1M: source.manualOutputPricePer1M ?? null,
      }
    })
    .filter(item => item.model)
    .sort((a, b) => a.model.localeCompare(b.model, 'en'))

  return JSON.stringify(normalized)
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

  const upstreamBody = body?.upstream && typeof body.upstream === 'object' ? body.upstream as Record<string, unknown> : null
  const modelPoolBody = body?.modelPool && typeof body.modelPool === 'object' ? body.modelPool as Record<string, unknown> : null
  const adminAiBody = body?.adminAi && typeof body.adminAi === 'object' ? body.adminAi as Record<string, unknown> : null
  const scenesItems = normalizeSceneItems(body?.scenes)
  const hasScenesUpdate = scenesItems.length > 0 || Boolean(body?.scenes)
  const masterKeyReady = hasConfigMasterKey(event)
  const ignoredSecretReplace = {
    upstream: toMode(upstreamBody?.apiKeyMode) === 'replace' && !masterKeyReady,
    adminAi: toMode(adminAiBody?.tavilyApiKeyMode) === 'replace' && !masterKeyReady,
  }

  const nextOverrides = await withTransaction(event, async (db) => {
    const existing = normalizePlatformAiRuntimeOverrides(await readPlatformAiRuntimeOverrides(db))
    const next = normalizePlatformAiRuntimeOverrides(existing)
    const currentRuntime = applyPlatformAiRuntimeOverrides(runtime, existing)
    const currentRegistry = resolvePlatformAiRegistry(currentRuntime)
    const currentProvider = currentRegistry.providers[0]
    const currentDefaults = currentRegistry.defaults
    const currentModelItems = currentProvider?.models || []
    const currentManualSignature = buildManualPriceSignature(currentModelItems)
    const upstreamChanged = Boolean(upstreamBody)
    const modelPoolChanged = Boolean(modelPoolBody && (hasOwn(modelPoolBody, 'items') || hasOwn(modelPoolBody, 'fetchedAt')))
    const shouldSyncSharedRuntime = upstreamChanged || modelPoolChanged || hasScenesUpdate

    if (shouldSyncSharedRuntime) {
      const ai = ensureSection(next.ai)
      const docAi = ensureSection(next.docAi)

      const apiKeyMode = toMode(upstreamBody?.apiKeyMode)
      if (apiKeyMode === 'replace' && masterKeyReady)
        ai.apiKey = normalizePlatformAiApiKey(upstreamBody?.apiKey)
      if (apiKeyMode === 'clear')
        ai.apiKey = ''

      const provider = hasOwn(upstreamBody || {}, 'provider')
        ? toText(upstreamBody?.provider)
        : (currentProvider?.provider || currentRuntime.ai.provider)
      const baseURL = hasOwn(upstreamBody || {}, 'baseURL')
        ? normalizePlatformAiBaseURL(upstreamBody?.baseURL, provider)
        : (currentProvider?.baseURL || currentRuntime.ai.baseURL)
      const timeoutMs = hasOwn(upstreamBody || {}, 'timeoutMs')
        ? Number(upstreamBody?.timeoutMs)
        : (currentProvider?.timeoutMs || currentRuntime.ai.timeoutMs)
      const maxRetries = hasOwn(upstreamBody || {}, 'maxRetries')
        ? Number(upstreamBody?.maxRetries)
        : (currentProvider?.maxRetries || currentRuntime.ai.maxRetries)
      const defaultModel = hasOwn(upstreamBody || {}, 'defaultModel')
        ? toText(upstreamBody?.defaultModel)
        : currentDefaults.defaultModel
      const embeddingModel = hasOwn(upstreamBody || {}, 'embeddingModel')
        ? toText(upstreamBody?.embeddingModel)
        : currentDefaults.embeddingModel
      const documentModel = hasOwn(upstreamBody || {}, 'documentModel')
        ? toText(upstreamBody?.documentModel)
        : currentDefaults.documentModel
      const modelItems = Array.isArray(modelPoolBody?.items)
        ? modelPoolBody?.items as unknown[]
        : currentModelItems

      const sharedApiKey = Object.prototype.hasOwnProperty.call(ai, 'apiKey')
        ? String(ai.apiKey || '')
        : currentRuntime.ai.apiKey
      const invalidateFetchedAt = (
        provider !== (currentProvider?.provider || currentRuntime.ai.provider)
        || baseURL !== (currentProvider?.baseURL || currentRuntime.ai.baseURL)
        || apiKeyMode === 'replace'
        || apiKeyMode === 'clear'
      )
      const fetchedAt = invalidateFetchedAt
        ? ''
        : (hasOwn(modelPoolBody || {}, 'fetchedAt')
            ? String(modelPoolBody?.fetchedAt || '')
            : (currentProvider?.fetchedAt || ''))

      ai.providersJson = buildPlatformAiRegistryJson(currentRuntime, {
        provider: {
          provider,
          baseURL,
          timeoutMs,
          maxRetries,
        },
        modelPool: {
          fetchedAt,
          items: modelItems,
        },
        defaults: {
          defaultModel,
          embeddingModel,
          documentModel,
        },
      })

      const providerPreviewRuntime = {
        ...currentRuntime,
        ai: {
          ...currentRuntime.ai,
          ...ai,
          apiKey: sharedApiKey,
          providersJson: ai.providersJson,
        },
      }
      const providerPreviewRegistry = resolvePlatformAiRegistry(providerPreviewRuntime)

      if (hasScenesUpdate) {
        ai.channelsJson = buildPlatformAiChannelsJson(
          providerPreviewRuntime,
          scenesItems,
          providerPreviewRegistry.providers,
        )
      }

      const finalPreviewRuntime = {
        ...providerPreviewRuntime,
        ai: {
          ...providerPreviewRuntime.ai,
          channelsJson: ai.channelsJson || providerPreviewRuntime.ai.channelsJson,
        },
      }
      const finalRegistry = resolvePlatformAiRegistry(finalPreviewRuntime)
      const finalProvider = finalRegistry.providers[0]

      ai.provider = finalProvider?.provider || provider || currentRuntime.ai.provider
      ai.baseURL = finalProvider?.baseURL || baseURL
      ai.model = finalRegistry.defaults.defaultModel || currentRuntime.ai.model
      ai.embeddingModel = finalRegistry.defaults.embeddingModel || currentRuntime.ai.embeddingModel
      ai.timeoutMs = finalProvider?.timeoutMs || timeoutMs
      ai.maxRetries = finalProvider?.maxRetries || maxRetries

      const runtimeForCatalog = {
        ...finalPreviewRuntime,
        ai: {
          ...finalPreviewRuntime.ai,
          provider: ai.provider,
          baseURL: ai.baseURL,
          model: ai.model,
          embeddingModel: ai.embeddingModel,
          timeoutMs: ai.timeoutMs,
          maxRetries: ai.maxRetries,
        },
      }

      ai.modelCatalogJson = resolvePlatformAiModelCatalogJson(runtimeForCatalog)
      ai.modelPricingJson = resolvePlatformAiModelPricingJson(runtimeForCatalog)

      docAi.provider = ai.provider
      docAi.baseURL = ai.baseURL
      docAi.apiKey = sharedApiKey
      docAi.model = finalRegistry.defaults.documentModel || currentRuntime.docAi.model
      docAi.timeoutMs = ai.timeoutMs
      docAi.maxRetries = ai.maxRetries
      docAi.modelPricingJson = ai.modelPricingJson

      next.ai = ai
      next.docAi = docAi

      const nextManualSignature = buildManualPriceSignature(modelItems)
      ;(next as any).__auditMeta = {
        upstreamChanged,
        modelPoolChanged,
        scenesChanged: hasScenesUpdate,
        pullTriggered: Boolean(modelPoolBody?.pullTriggered),
        manualPriceOverrideChanged: currentManualSignature !== nextManualSignature,
      }
    }

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

    const auditMeta = (next as any).__auditMeta || {}
    delete (next as any).__auditMeta

    const normalized = normalizePlatformAiRuntimeOverrides(next)
    await writePlatformAiRuntimeOverrides(db, normalized)
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'write.admin.ai.providers',
      payload: {
        hasSharedUpstreamUpdate: Boolean(auditMeta.upstreamChanged),
        hasModelPoolUpdate: Boolean(auditMeta.modelPoolChanged),
        hasSceneRouteUpdate: Boolean(auditMeta.scenesChanged),
        triggeredModelPull: Boolean(auditMeta.pullTriggered),
        hasManualPriceOverrideUpdate: Boolean(auditMeta.manualPriceOverrideChanged),
        hasAdminAiUpdate: Boolean(adminAiBody),
        ignoredSecretReplaceKeys: Object.entries(ignoredSecretReplace)
          .filter(([, ignored]) => ignored)
          .map(([key]) => key),
      },
    })
    return normalized
  })

  const effectiveRuntime = applyPlatformAiRuntimeOverrides(runtime, nextOverrides)
  const registry = resolvePlatformAiRegistry(effectiveRuntime)
  const sharedProvider = registry.providers[0]
  const providerStats = await withClient(event, db => aggregatePlatformAiProviderUsage(db, registry.providers))
  const ignoredSecretReplaceKeys = Object.entries(ignoredSecretReplace)
    .filter(([, ignored]) => ignored)
    .map(([key]) => key)
  const payload = {
    upstream: {
      provider: sharedProvider?.provider || effectiveRuntime.ai.provider,
      baseURL: sharedProvider?.baseURL || effectiveRuntime.ai.baseURL,
      timeoutMs: sharedProvider?.timeoutMs || effectiveRuntime.ai.timeoutMs,
      maxRetries: sharedProvider?.maxRetries || effectiveRuntime.ai.maxRetries,
      apiKeyConfigured: Boolean(effectiveRuntime.ai.apiKey),
      defaultModel: registry.defaults.defaultModel || effectiveRuntime.ai.model,
      embeddingModel: registry.defaults.embeddingModel || effectiveRuntime.ai.embeddingModel,
      documentModel: registry.defaults.documentModel || effectiveRuntime.docAi.model,
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
      ignoredSecretReplaceKeys,
    },
    stats: {
      providerUsage: providerStats,
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
