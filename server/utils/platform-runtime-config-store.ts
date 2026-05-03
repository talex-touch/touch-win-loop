import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { decryptConfigSecretSafe, encryptConfigSecret, hasConfigMasterKey, isEncryptedConfigValue } from '~~/server/utils/secure-config'

const PLATFORM_RUNTIME_OVERRIDES_KEY = 'platform_runtime_overrides.v1'
const PLATFORM_RUNTIME_OVERRIDES_CACHE_KEY = Symbol.for('winloop.platform-runtime-overrides.cache.v1')
const PLATFORM_RUNTIME_OVERRIDES_CACHE_TTL_MS = 5000

interface CachedRuntimeOverridesState {
  expiresAt: number
  overrides: PlatformRuntimeOverrides
}

export interface PlatformRuntimeOverrides {
  auth?: {
    registrationEnabled?: boolean
  }
  feishuScheduler?: {
    enabled?: boolean
    intervalMs?: number
    batchSize?: number
    lockTtlMs?: number
  }
  resourceRecycle?: {
    enabled?: boolean
    intervalMs?: number
    retentionDays?: number
    batchSize?: number
  }
  contest?: {
    autoSeed?: boolean
  }
  storage?: {
    provider?: string
    localRoot?: string
    endpoint?: string
    region?: string
    bucket?: string
    accessKey?: string
    secretKey?: string
    forcePathStyle?: boolean
  }
  updatedAt?: string
  updatedByUserId?: string
}

export interface RuntimeSettingsConfigSource {
  authRegistration: 'env' | 'override'
  feishuScheduler: 'env' | 'override'
  resourceRecycle: 'env' | 'override'
  contestAutoSeed: 'env' | 'override'
  storage: 'env' | 'override'
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
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

function clamp(input: number | undefined, fallback: number, min: number, max: number): number {
  const value = Number.isFinite(Number(input)) ? Number(input) : fallback
  return Math.max(min, Math.min(max, value))
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw as Record<string, unknown>
}

function normalizeFeishuSchedulerSection(raw: unknown): PlatformRuntimeOverrides['feishuScheduler'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformRuntimeOverrides['feishuScheduler']> = {}

  if (hasOwn(source, 'enabled')) {
    const value = toBoolean(source.enabled)
    if (value !== undefined)
      output.enabled = value
  }
  if (hasOwn(source, 'intervalMs')) {
    const value = toNumber(source.intervalMs)
    if (value !== undefined)
      output.intervalMs = value
  }
  if (hasOwn(source, 'batchSize')) {
    const value = toNumber(source.batchSize)
    if (value !== undefined)
      output.batchSize = value
  }
  if (hasOwn(source, 'lockTtlMs')) {
    const value = toNumber(source.lockTtlMs)
    if (value !== undefined)
      output.lockTtlMs = value
  }

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeAuthSection(raw: unknown): PlatformRuntimeOverrides['auth'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformRuntimeOverrides['auth']> = {}
  if (hasOwn(source, 'registrationEnabled')) {
    const value = toBoolean(source.registrationEnabled)
    if (value !== undefined)
      output.registrationEnabled = value
  }

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeResourceRecycleSection(raw: unknown): PlatformRuntimeOverrides['resourceRecycle'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformRuntimeOverrides['resourceRecycle']> = {}
  if (hasOwn(source, 'enabled')) {
    const value = toBoolean(source.enabled)
    if (value !== undefined)
      output.enabled = value
  }
  if (hasOwn(source, 'intervalMs')) {
    const value = toNumber(source.intervalMs)
    if (value !== undefined)
      output.intervalMs = value
  }
  if (hasOwn(source, 'retentionDays')) {
    const value = toNumber(source.retentionDays)
    if (value !== undefined)
      output.retentionDays = value
  }
  if (hasOwn(source, 'batchSize')) {
    const value = toNumber(source.batchSize)
    if (value !== undefined)
      output.batchSize = value
  }

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeContestSection(raw: unknown): PlatformRuntimeOverrides['contest'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformRuntimeOverrides['contest']> = {}
  if (hasOwn(source, 'autoSeed')) {
    const value = toBoolean(source.autoSeed)
    if (value !== undefined)
      output.autoSeed = value
  }

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeStorageProvider(raw: unknown): string {
  const normalized = toText(raw).toLowerCase()
  if (normalized === 's3' || normalized === 'minio')
    return normalized
  if (normalized === 'local')
    return normalized
  return normalized
}

function normalizeStorageSection(raw: unknown): PlatformRuntimeOverrides['storage'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformRuntimeOverrides['storage']> = {}
  if (hasOwn(source, 'provider'))
    output.provider = normalizeStorageProvider(source.provider)
  if (hasOwn(source, 'localRoot'))
    output.localRoot = toText(source.localRoot) || './tmp/document-storage'
  if (hasOwn(source, 'endpoint'))
    output.endpoint = toText(source.endpoint).replace(/\/+$/g, '')
  if (hasOwn(source, 'region'))
    output.region = toText(source.region)
  if (hasOwn(source, 'bucket'))
    output.bucket = toText(source.bucket)
  if (hasOwn(source, 'accessKey'))
    output.accessKey = String(source.accessKey || '')
  if (hasOwn(source, 'secretKey'))
    output.secretKey = String(source.secretKey || '')
  if (hasOwn(source, 'forcePathStyle')) {
    const value = toBoolean(source.forcePathStyle)
    if (value !== undefined)
      output.forcePathStyle = value
  }

  return Object.keys(output).length > 0 ? output : undefined
}

function hasSectionOverrides(section: Record<string, unknown> | undefined): boolean {
  if (!section)
    return false
  return Object.keys(section).length > 0
}

function getCachedRuntimeOverridesState(): CachedRuntimeOverridesState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[PLATFORM_RUNTIME_OVERRIDES_CACHE_KEY] as CachedRuntimeOverridesState | undefined
  if (existing)
    return existing

  const created: CachedRuntimeOverridesState = {
    expiresAt: 0,
    overrides: {},
  }
  globalRef[PLATFORM_RUNTIME_OVERRIDES_CACHE_KEY] = created
  return created
}

export function invalidatePlatformRuntimeOverridesCache(): void {
  const cache = getCachedRuntimeOverridesState()
  cache.expiresAt = 0
  cache.overrides = {}
}

export function getCachedPlatformRuntimeOverridesSnapshot(): PlatformRuntimeOverrides {
  return normalizePlatformRuntimeOverrides(getCachedRuntimeOverridesState().overrides)
}

export function normalizePlatformRuntimeOverrides(raw: unknown): PlatformRuntimeOverrides {
  const source = parseJsonObject(raw)

  const normalized: PlatformRuntimeOverrides = {
    auth: normalizeAuthSection(source.auth),
    feishuScheduler: normalizeFeishuSchedulerSection(source.feishuScheduler),
    resourceRecycle: normalizeResourceRecycleSection(source.resourceRecycle),
    contest: normalizeContestSection(source.contest),
    storage: normalizeStorageSection(source.storage),
    updatedAt: hasOwn(source, 'updatedAt') ? toText(source.updatedAt) : '',
    updatedByUserId: hasOwn(source, 'updatedByUserId') ? toText(source.updatedByUserId) : '',
  }

  if (!normalized.auth)
    delete normalized.auth
  if (!normalized.feishuScheduler)
    delete normalized.feishuScheduler
  if (!normalized.resourceRecycle)
    delete normalized.resourceRecycle
  if (!normalized.contest)
    delete normalized.contest
  if (!normalized.storage)
    delete normalized.storage
  if (!normalized.updatedAt)
    delete normalized.updatedAt
  if (!normalized.updatedByUserId)
    delete normalized.updatedByUserId

  return normalized
}

export async function readPlatformRuntimeOverrides(db: Queryable): Promise<PlatformRuntimeOverrides> {
  const result = await db.query<{ value: string }>(
    'SELECT value FROM migrations_meta WHERE key = $1 LIMIT 1',
    [PLATFORM_RUNTIME_OVERRIDES_KEY],
  )

  const raw = String(result.rows[0]?.value || '').trim()
  if (!raw)
    return {}

  try {
    const normalized = normalizePlatformRuntimeOverrides(JSON.parse(raw))
    if (normalized.storage && Object.prototype.hasOwnProperty.call(normalized.storage, 'accessKey'))
      normalized.storage.accessKey = decryptConfigSecretSafe(normalized.storage.accessKey, undefined)
    if (normalized.storage && Object.prototype.hasOwnProperty.call(normalized.storage, 'secretKey'))
      normalized.storage.secretKey = decryptConfigSecretSafe(normalized.storage.secretKey, undefined)
    return normalized
  }
  catch {
    return {}
  }
}

export async function writePlatformRuntimeOverrides(
  db: Queryable,
  overrides: PlatformRuntimeOverrides,
): Promise<PlatformRuntimeOverrides> {
  const normalized = normalizePlatformRuntimeOverrides(overrides)
  const persistable = normalizePlatformRuntimeOverrides(normalized)
  const masterKeyReady = hasConfigMasterKey()
  if (persistable.storage && Object.prototype.hasOwnProperty.call(persistable.storage, 'accessKey')) {
    const value = String(persistable.storage.accessKey || '')
    persistable.storage.accessKey = masterKeyReady && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value) : value
  }
  if (persistable.storage && Object.prototype.hasOwnProperty.call(persistable.storage, 'secretKey')) {
    const value = String(persistable.storage.secretKey || '')
    persistable.storage.secretKey = masterKeyReady && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value) : value
  }
  await db.query(
    `INSERT INTO migrations_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [PLATFORM_RUNTIME_OVERRIDES_KEY, JSON.stringify(persistable)],
  )
  invalidatePlatformRuntimeOverridesCache()
  return normalized
}

export function applyPlatformRuntimeOverrides(
  runtime: RuntimeSettings,
  overrides: PlatformRuntimeOverrides,
): RuntimeSettings {
  const next: RuntimeSettings = {
    ...runtime,
    auth: { ...runtime.auth },
    contest: { ...runtime.contest },
    storage: { ...runtime.storage },
    resourceRecycle: { ...runtime.resourceRecycle },
    feishuScheduler: { ...runtime.feishuScheduler },
  }

  const auth = overrides.auth
  if (auth) {
    if (auth.registrationEnabled !== undefined)
      next.auth.registrationEnabled = Boolean(auth.registrationEnabled)
  }

  const contest = overrides.contest
  if (contest) {
    if (contest.autoSeed !== undefined)
      next.contest.autoSeed = Boolean(contest.autoSeed)
  }

  const resourceRecycle = overrides.resourceRecycle
  if (resourceRecycle) {
    if (resourceRecycle.enabled !== undefined)
      next.resourceRecycle.enabled = Boolean(resourceRecycle.enabled)
    if (resourceRecycle.intervalMs !== undefined) {
      next.resourceRecycle.intervalMs = clamp(
        resourceRecycle.intervalMs,
        next.resourceRecycle.intervalMs,
        60_000,
        24 * 60 * 60 * 1000,
      )
    }
    if (resourceRecycle.retentionDays !== undefined) {
      next.resourceRecycle.retentionDays = Math.round(clamp(
        resourceRecycle.retentionDays,
        next.resourceRecycle.retentionDays,
        1,
        365,
      ))
    }
    if (resourceRecycle.batchSize !== undefined) {
      next.resourceRecycle.batchSize = Math.round(clamp(
        resourceRecycle.batchSize,
        next.resourceRecycle.batchSize,
        20,
        1000,
      ))
    }
  }

  const storage = overrides.storage
  if (storage) {
    if (storage.provider !== undefined)
      next.storage.provider = normalizeStorageProvider(storage.provider)
    if (storage.localRoot !== undefined)
      next.storage.localRoot = storage.localRoot || next.storage.localRoot
    if (storage.endpoint !== undefined)
      next.storage.endpoint = storage.endpoint
    if (storage.region !== undefined)
      next.storage.region = storage.region
    if (storage.bucket !== undefined)
      next.storage.bucket = storage.bucket
    if (storage.accessKey !== undefined)
      next.storage.accessKey = storage.accessKey
    if (storage.secretKey !== undefined)
      next.storage.secretKey = storage.secretKey
    if (storage.forcePathStyle !== undefined)
      next.storage.forcePathStyle = Boolean(storage.forcePathStyle)
  }

  const feishuScheduler = overrides.feishuScheduler
  if (feishuScheduler) {
    if (feishuScheduler.enabled !== undefined)
      next.feishuScheduler.enabled = Boolean(feishuScheduler.enabled)
    if (feishuScheduler.intervalMs !== undefined) {
      next.feishuScheduler.intervalMs = clamp(
        feishuScheduler.intervalMs,
        next.feishuScheduler.intervalMs,
        15_000,
        24 * 60 * 60 * 1000,
      )
    }
    if (feishuScheduler.batchSize !== undefined) {
      next.feishuScheduler.batchSize = Math.round(clamp(
        feishuScheduler.batchSize,
        next.feishuScheduler.batchSize,
        1,
        200,
      ))
    }
    if (feishuScheduler.lockTtlMs !== undefined) {
      next.feishuScheduler.lockTtlMs = clamp(
        feishuScheduler.lockTtlMs,
        next.feishuScheduler.lockTtlMs,
        60_000,
        24 * 60 * 60 * 1000,
      )
    }
  }

  return next
}

export function getRuntimeSettingsConfigSource(overrides: PlatformRuntimeOverrides): RuntimeSettingsConfigSource {
  return {
    authRegistration: hasSectionOverrides(overrides.auth as Record<string, unknown> | undefined) ? 'override' : 'env',
    feishuScheduler: hasSectionOverrides(overrides.feishuScheduler as Record<string, unknown> | undefined) ? 'override' : 'env',
    resourceRecycle: hasSectionOverrides(overrides.resourceRecycle as Record<string, unknown> | undefined) ? 'override' : 'env',
    contestAutoSeed: hasSectionOverrides(overrides.contest as Record<string, unknown> | undefined) ? 'override' : 'env',
    storage: hasSectionOverrides(overrides.storage as Record<string, unknown> | undefined) ? 'override' : 'env',
  }
}

async function resolveRuntimeOverridesWithCache(event?: H3Event): Promise<PlatformRuntimeOverrides> {
  const cache = getCachedRuntimeOverridesState()
  const now = Date.now()
  if (cache.expiresAt > now)
    return cache.overrides

  try {
    const overrides = await withClient(event, async (db) => {
      return readPlatformRuntimeOverrides(db)
    })
    cache.overrides = overrides
    cache.expiresAt = now + PLATFORM_RUNTIME_OVERRIDES_CACHE_TTL_MS
    return overrides
  }
  catch {
    if (cache.expiresAt > 0)
      return cache.overrides
    return {}
  }
}

export async function readEffectivePlatformRuntimeSettings(
  event?: H3Event,
): Promise<{
  runtime: RuntimeSettings
  overrides: PlatformRuntimeOverrides
  configSource: RuntimeSettingsConfigSource
}> {
  const baseRuntime = readRuntimeSettings(event)
  const overrides = await resolveRuntimeOverridesWithCache(event)
  return {
    runtime: applyPlatformRuntimeOverrides(baseRuntime, overrides),
    overrides,
    configSource: getRuntimeSettingsConfigSource(overrides),
  }
}

export function getPlatformRuntimeOverrideState(overrides: PlatformRuntimeOverrides): {
  storageAccessKeyOverridden: boolean
  storageSecretKeyOverridden: boolean
  updatedAt: string
  updatedByUserId: string
} {
  return {
    storageAccessKeyOverridden: Boolean(overrides.storage && Object.prototype.hasOwnProperty.call(overrides.storage, 'accessKey')),
    storageSecretKeyOverridden: Boolean(overrides.storage && Object.prototype.hasOwnProperty.call(overrides.storage, 'secretKey')),
    updatedAt: String(overrides.updatedAt || ''),
    updatedByUserId: String(overrides.updatedByUserId || ''),
  }
}
