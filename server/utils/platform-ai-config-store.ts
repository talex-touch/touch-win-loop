import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import { withClient } from '~~/server/utils/db'
import { readEffectivePlatformRuntimeSettings as readEffectiveBaseRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'
import { decryptConfigSecretSafe, encryptConfigSecret, hasConfigMasterKey, isEncryptedConfigValue } from '~~/server/utils/secure-config'

const PLATFORM_AI_RUNTIME_OVERRIDES_KEY = 'platform_ai_runtime_overrides.v1'

export interface PlatformAiRuntimeOverrides {
  ai?: {
    provider?: string
    baseURL?: string
    apiKey?: string
    model?: string
    embeddingModel?: string
    visionModel?: string
    modelCatalogJson?: string
    modelPricingJson?: string
    providersJson?: string
    channelsJson?: string
    temperature?: number
    topP?: number
    maxTokens?: number
    presencePenalty?: number
    frequencyPenalty?: number
    timeoutMs?: number
    maxRetries?: number
  }
  docAi?: {
    provider?: string
    baseURL?: string
    apiKey?: string
    model?: string
    modelPricingJson?: string
    timeoutMs?: number
    maxRetries?: number
  }
  adminAi?: {
    enabled?: boolean
    tavilyApiKey?: string
    webTimeoutMs?: number
    maxWebResults?: number
    maxPageChars?: number
  }
  updatedAt?: string
  updatedByUserId?: string
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function toNumber(raw: unknown): number | undefined {
  const value = Number(raw)
  if (!Number.isFinite(value))
    return undefined
  return value
}

function toBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized))
      return true
    if (['0', 'false', 'no', 'off'].includes(normalized))
      return false
  }
  return undefined
}

function normalizeAiSection(raw: unknown): PlatformAiRuntimeOverrides['ai'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return undefined

  const source = raw as Record<string, unknown>
  const output: NonNullable<PlatformAiRuntimeOverrides['ai']> = {}

  if (hasOwn(source, 'provider'))
    output.provider = toText(source.provider)
  if (hasOwn(source, 'baseURL'))
    output.baseURL = toText(source.baseURL)
  if (hasOwn(source, 'apiKey'))
    output.apiKey = String(source.apiKey || '')
  if (hasOwn(source, 'model'))
    output.model = toText(source.model)
  if (hasOwn(source, 'embeddingModel'))
    output.embeddingModel = toText(source.embeddingModel)
  if (hasOwn(source, 'visionModel'))
    output.visionModel = toText(source.visionModel)
  if (hasOwn(source, 'modelCatalogJson'))
    output.modelCatalogJson = String(source.modelCatalogJson || '')
  if (hasOwn(source, 'modelPricingJson'))
    output.modelPricingJson = String(source.modelPricingJson || '')
  if (hasOwn(source, 'providersJson'))
    output.providersJson = String(source.providersJson || '')
  if (hasOwn(source, 'channelsJson'))
    output.channelsJson = String(source.channelsJson || '')
  if (hasOwn(source, 'temperature'))
    output.temperature = toNumber(source.temperature)
  if (hasOwn(source, 'topP'))
    output.topP = toNumber(source.topP)
  if (hasOwn(source, 'maxTokens'))
    output.maxTokens = toNumber(source.maxTokens)
  if (hasOwn(source, 'presencePenalty'))
    output.presencePenalty = toNumber(source.presencePenalty)
  if (hasOwn(source, 'frequencyPenalty'))
    output.frequencyPenalty = toNumber(source.frequencyPenalty)
  if (hasOwn(source, 'timeoutMs'))
    output.timeoutMs = toNumber(source.timeoutMs)
  if (hasOwn(source, 'maxRetries'))
    output.maxRetries = toNumber(source.maxRetries)

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeDocAiSection(raw: unknown): PlatformAiRuntimeOverrides['docAi'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return undefined

  const source = raw as Record<string, unknown>
  const output: NonNullable<PlatformAiRuntimeOverrides['docAi']> = {}

  if (hasOwn(source, 'provider'))
    output.provider = toText(source.provider)
  if (hasOwn(source, 'baseURL'))
    output.baseURL = toText(source.baseURL)
  if (hasOwn(source, 'apiKey'))
    output.apiKey = String(source.apiKey || '')
  if (hasOwn(source, 'model'))
    output.model = toText(source.model)
  if (hasOwn(source, 'modelPricingJson'))
    output.modelPricingJson = String(source.modelPricingJson || '')
  if (hasOwn(source, 'timeoutMs'))
    output.timeoutMs = toNumber(source.timeoutMs)
  if (hasOwn(source, 'maxRetries'))
    output.maxRetries = toNumber(source.maxRetries)

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeAdminAiSection(raw: unknown): PlatformAiRuntimeOverrides['adminAi'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return undefined

  const source = raw as Record<string, unknown>
  const output: NonNullable<PlatformAiRuntimeOverrides['adminAi']> = {}

  if (hasOwn(source, 'enabled'))
    output.enabled = toBoolean(source.enabled)
  if (hasOwn(source, 'tavilyApiKey'))
    output.tavilyApiKey = String(source.tavilyApiKey || '')
  if (hasOwn(source, 'webTimeoutMs'))
    output.webTimeoutMs = toNumber(source.webTimeoutMs)
  if (hasOwn(source, 'maxWebResults'))
    output.maxWebResults = toNumber(source.maxWebResults)
  if (hasOwn(source, 'maxPageChars'))
    output.maxPageChars = toNumber(source.maxPageChars)

  return Object.keys(output).length > 0 ? output : undefined
}

function clamp(input: number | undefined, fallback: number, min: number, max: number): number {
  const value = Number.isFinite(Number(input)) ? Number(input) : fallback
  return Math.max(min, Math.min(max, value))
}

export function normalizePlatformAiRuntimeOverrides(raw: unknown): PlatformAiRuntimeOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}

  const source = raw as Record<string, unknown>
  const normalized: PlatformAiRuntimeOverrides = {
    ai: normalizeAiSection(source.ai),
    docAi: normalizeDocAiSection(source.docAi),
    adminAi: normalizeAdminAiSection(source.adminAi),
    updatedAt: hasOwn(source, 'updatedAt') ? toText(source.updatedAt) : '',
    updatedByUserId: hasOwn(source, 'updatedByUserId') ? toText(source.updatedByUserId) : '',
  }

  if (!normalized.updatedAt)
    delete normalized.updatedAt
  if (!normalized.updatedByUserId)
    delete normalized.updatedByUserId

  if (!normalized.ai)
    delete normalized.ai
  if (!normalized.docAi)
    delete normalized.docAi
  if (!normalized.adminAi)
    delete normalized.adminAi

  return normalized
}

export async function readPlatformAiRuntimeOverrides(db: Queryable): Promise<PlatformAiRuntimeOverrides> {
  const result = await db.query<{ value: string }>(
    'SELECT value FROM migrations_meta WHERE key = $1 LIMIT 1',
    [PLATFORM_AI_RUNTIME_OVERRIDES_KEY],
  )

  const raw = result.rows[0]?.value
  if (!raw)
    return {}

  try {
    const normalized = normalizePlatformAiRuntimeOverrides(JSON.parse(raw))
    if (normalized.ai && Object.prototype.hasOwnProperty.call(normalized.ai, 'apiKey'))
      normalized.ai.apiKey = decryptConfigSecretSafe(normalized.ai.apiKey)
    if (normalized.docAi && Object.prototype.hasOwnProperty.call(normalized.docAi, 'apiKey'))
      normalized.docAi.apiKey = decryptConfigSecretSafe(normalized.docAi.apiKey)
    if (normalized.adminAi && Object.prototype.hasOwnProperty.call(normalized.adminAi, 'tavilyApiKey'))
      normalized.adminAi.tavilyApiKey = decryptConfigSecretSafe(normalized.adminAi.tavilyApiKey)
    return normalized
  }
  catch {
    return {}
  }
}

export async function writePlatformAiRuntimeOverrides(
  db: Queryable,
  overrides: PlatformAiRuntimeOverrides,
): Promise<void> {
  const normalized = normalizePlatformAiRuntimeOverrides(overrides)
  const persistable = normalizePlatformAiRuntimeOverrides(normalized)
  const hasMasterKey = hasConfigMasterKey()

  if (persistable.ai && Object.prototype.hasOwnProperty.call(persistable.ai, 'apiKey')) {
    const value = String(persistable.ai.apiKey || '')
    persistable.ai.apiKey = hasMasterKey && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value) : value
  }
  if (persistable.docAi && Object.prototype.hasOwnProperty.call(persistable.docAi, 'apiKey')) {
    const value = String(persistable.docAi.apiKey || '')
    persistable.docAi.apiKey = hasMasterKey && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value) : value
  }
  if (persistable.adminAi && Object.prototype.hasOwnProperty.call(persistable.adminAi, 'tavilyApiKey')) {
    const value = String(persistable.adminAi.tavilyApiKey || '')
    persistable.adminAi.tavilyApiKey = hasMasterKey && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value) : value
  }

  await db.query(
    `INSERT INTO migrations_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [PLATFORM_AI_RUNTIME_OVERRIDES_KEY, JSON.stringify(persistable)],
  )
}

export function applyPlatformAiRuntimeOverrides(
  runtime: RuntimeSettings,
  overrides: PlatformAiRuntimeOverrides,
): RuntimeSettings {
  const next: RuntimeSettings = {
    ...runtime,
    ai: { ...runtime.ai },
    docAi: { ...runtime.docAi },
    adminAi: { ...runtime.adminAi },
  }

  const ai = overrides.ai
  if (ai) {
    if (ai.provider !== undefined)
      next.ai.provider = ai.provider
    if (ai.baseURL !== undefined)
      next.ai.baseURL = ai.baseURL
    if (ai.apiKey !== undefined)
      next.ai.apiKey = ai.apiKey
    if (ai.model !== undefined)
      next.ai.model = ai.model
    if (ai.embeddingModel !== undefined)
      next.ai.embeddingModel = ai.embeddingModel
    if (ai.visionModel !== undefined)
      next.ai.visionModel = ai.visionModel
    if (ai.modelCatalogJson !== undefined)
      next.ai.modelCatalogJson = ai.modelCatalogJson
    if (ai.modelPricingJson !== undefined)
      next.ai.modelPricingJson = ai.modelPricingJson
    if (ai.providersJson !== undefined)
      next.ai.providersJson = ai.providersJson
    if (ai.channelsJson !== undefined)
      next.ai.channelsJson = ai.channelsJson
    if (ai.temperature !== undefined)
      next.ai.temperature = clamp(ai.temperature, next.ai.temperature, 0, 1)
    if (ai.topP !== undefined)
      next.ai.topP = clamp(ai.topP, next.ai.topP, 0, 1)
    if (ai.maxTokens !== undefined)
      next.ai.maxTokens = Math.max(0, Math.round(ai.maxTokens))
    if (ai.presencePenalty !== undefined)
      next.ai.presencePenalty = clamp(ai.presencePenalty, next.ai.presencePenalty, -2, 2)
    if (ai.frequencyPenalty !== undefined)
      next.ai.frequencyPenalty = clamp(ai.frequencyPenalty, next.ai.frequencyPenalty, -2, 2)
    if (ai.timeoutMs !== undefined)
      next.ai.timeoutMs = clamp(ai.timeoutMs, next.ai.timeoutMs, 1000, 120000)
    if (ai.maxRetries !== undefined)
      next.ai.maxRetries = clamp(ai.maxRetries, next.ai.maxRetries, 0, 10)
  }

  const docAi = overrides.docAi
  if (docAi) {
    if (docAi.provider !== undefined)
      next.docAi.provider = docAi.provider
    if (docAi.baseURL !== undefined)
      next.docAi.baseURL = docAi.baseURL
    if (docAi.apiKey !== undefined)
      next.docAi.apiKey = docAi.apiKey
    if (docAi.model !== undefined)
      next.docAi.model = docAi.model
    if (docAi.modelPricingJson !== undefined)
      next.docAi.modelPricingJson = docAi.modelPricingJson
    if (docAi.timeoutMs !== undefined)
      next.docAi.timeoutMs = clamp(docAi.timeoutMs, next.docAi.timeoutMs, 1000, 120000)
    if (docAi.maxRetries !== undefined)
      next.docAi.maxRetries = clamp(docAi.maxRetries, next.docAi.maxRetries, 0, 10)
  }

  const adminAi = overrides.adminAi
  if (adminAi) {
    if (adminAi.enabled !== undefined)
      next.adminAi.enabled = Boolean(adminAi.enabled)
    if (adminAi.tavilyApiKey !== undefined)
      next.adminAi.tavilyApiKey = adminAi.tavilyApiKey
    if (adminAi.webTimeoutMs !== undefined)
      next.adminAi.webTimeoutMs = clamp(adminAi.webTimeoutMs, next.adminAi.webTimeoutMs, 1000, 120000)
    if (adminAi.maxWebResults !== undefined)
      next.adminAi.maxWebResults = clamp(adminAi.maxWebResults, next.adminAi.maxWebResults, 1, 10)
    if (adminAi.maxPageChars !== undefined)
      next.adminAi.maxPageChars = clamp(adminAi.maxPageChars, next.adminAi.maxPageChars, 1000, 50000)
  }

  return next
}

export async function readEffectiveRuntimeSettings(
  event?: H3Event,
): Promise<{ runtime: RuntimeSettings, overrides: PlatformAiRuntimeOverrides }> {
  const { runtime: baseRuntime } = await readEffectiveBaseRuntimeSettings(event)
  if (!event)
    return { runtime: baseRuntime, overrides: {} }

  try {
    const overrides = await withClient(event, async (db) => {
      return readPlatformAiRuntimeOverrides(db)
    })
    return {
      runtime: applyPlatformAiRuntimeOverrides(baseRuntime, overrides),
      overrides,
    }
  }
  catch {
    return {
      runtime: baseRuntime,
      overrides: {},
    }
  }
}

export function getPlatformAiOverrideState(overrides: PlatformAiRuntimeOverrides): {
  aiApiKeyOverridden: boolean
  docAiApiKeyOverridden: boolean
  adminTavilyApiKeyOverridden: boolean
  updatedAt: string
  updatedByUserId: string
} {
  return {
    aiApiKeyOverridden: Boolean(overrides.ai && Object.prototype.hasOwnProperty.call(overrides.ai, 'apiKey')),
    docAiApiKeyOverridden: Boolean(overrides.docAi && Object.prototype.hasOwnProperty.call(overrides.docAi, 'apiKey')),
    adminTavilyApiKeyOverridden: Boolean(overrides.adminAi && Object.prototype.hasOwnProperty.call(overrides.adminAi, 'tavilyApiKey')),
    updatedAt: String(overrides.updatedAt || ''),
    updatedByUserId: String(overrides.updatedByUserId || ''),
  }
}
