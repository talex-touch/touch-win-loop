import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import { withClient } from '~~/server/utils/db'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'
import { decryptConfigSecretSafe, encryptConfigSecret, hasConfigMasterKey, isEncryptedConfigValue } from '~~/server/utils/secure-config'

const PLATFORM_MEETING_RUNTIME_OVERRIDES_KEY = 'platform_meeting_runtime_overrides.v1'
const PLATFORM_MEETING_RUNTIME_OVERRIDES_CACHE_KEY = Symbol.for('winloop.platform-meeting-runtime-overrides.cache.v1')
const PLATFORM_MEETING_RUNTIME_OVERRIDES_CACHE_TTL_MS = 5000

interface CachedMeetingOverridesState {
  expiresAt: number
  overrides: PlatformMeetingRuntimeOverrides
}

export interface PlatformMeetingRuntimeOverrides {
  rtc?: {
    provider?: string
    serverUrl?: string
    apiKey?: string
    apiSecret?: string
    embedBaseUrl?: string
    webhookSecret?: string
    roomPrefix?: string
  }
  asr?: {
    provider?: string
    serviceUrl?: string
    apiKey?: string
    webhookSecret?: string
  }
  worker?: {
    enabled?: boolean
    intervalMs?: number
    batchSize?: number
    maxAttempts?: number
  }
  monitoring?: {
    prometheusBaseUrl?: string
  }
  updatedAt?: string
  updatedByUserId?: string
}

export interface MeetingSettingsConfigSource {
  rtc: 'default' | 'override'
  asr: 'default' | 'override'
  worker: 'default' | 'override'
  monitoring: 'default' | 'override'
}

const DEFAULT_MEETING_ROOM_PREFIX = 'winloop'
const DEFAULT_MEETING_WORKER_SETTINGS = Object.freeze({
  enabled: true,
  intervalMs: 5000,
  batchSize: 6,
  maxAttempts: 5,
})

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

function trimTrailingSlash(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/g, '')
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw as Record<string, unknown>
}

function clamp(input: number | undefined, fallback: number, min: number, max: number): number {
  const value = Number.isFinite(Number(input)) ? Number(input) : fallback
  return Math.max(min, Math.min(max, value))
}

function hasSectionOverrides(section: Record<string, unknown> | undefined): boolean {
  if (!section)
    return false
  return Object.keys(section).length > 0
}

function getCachedMeetingOverridesState(): CachedMeetingOverridesState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[PLATFORM_MEETING_RUNTIME_OVERRIDES_CACHE_KEY] as CachedMeetingOverridesState | undefined
  if (existing)
    return existing

  const created: CachedMeetingOverridesState = {
    expiresAt: 0,
    overrides: {},
  }
  globalRef[PLATFORM_MEETING_RUNTIME_OVERRIDES_CACHE_KEY] = created
  return created
}

function normalizeRtcSection(raw: unknown): PlatformMeetingRuntimeOverrides['rtc'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformMeetingRuntimeOverrides['rtc']> = {}
  if (hasOwn(source, 'provider'))
    output.provider = toText(source.provider)
  if (hasOwn(source, 'serverUrl'))
    output.serverUrl = trimTrailingSlash(source.serverUrl)
  if (hasOwn(source, 'apiKey'))
    output.apiKey = String(source.apiKey || '')
  if (hasOwn(source, 'apiSecret'))
    output.apiSecret = String(source.apiSecret || '')
  if (hasOwn(source, 'embedBaseUrl'))
    output.embedBaseUrl = trimTrailingSlash(source.embedBaseUrl)
  if (hasOwn(source, 'webhookSecret'))
    output.webhookSecret = String(source.webhookSecret || '')
  if (hasOwn(source, 'roomPrefix'))
    output.roomPrefix = toText(source.roomPrefix)

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeAsrSection(raw: unknown): PlatformMeetingRuntimeOverrides['asr'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformMeetingRuntimeOverrides['asr']> = {}
  if (hasOwn(source, 'provider'))
    output.provider = toText(source.provider)
  if (hasOwn(source, 'serviceUrl'))
    output.serviceUrl = trimTrailingSlash(source.serviceUrl)
  if (hasOwn(source, 'apiKey'))
    output.apiKey = String(source.apiKey || '')
  if (hasOwn(source, 'webhookSecret'))
    output.webhookSecret = String(source.webhookSecret || '')

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeWorkerSection(raw: unknown): PlatformMeetingRuntimeOverrides['worker'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformMeetingRuntimeOverrides['worker']> = {}
  if (hasOwn(source, 'enabled'))
    output.enabled = toBoolean(source.enabled)
  if (hasOwn(source, 'intervalMs'))
    output.intervalMs = toNumber(source.intervalMs)
  if (hasOwn(source, 'batchSize'))
    output.batchSize = toNumber(source.batchSize)
  if (hasOwn(source, 'maxAttempts'))
    output.maxAttempts = toNumber(source.maxAttempts)

  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeMonitoringSection(raw: unknown): PlatformMeetingRuntimeOverrides['monitoring'] {
  const source = parseJsonObject(raw)
  if (Object.keys(source).length === 0)
    return undefined

  const output: NonNullable<PlatformMeetingRuntimeOverrides['monitoring']> = {}
  if (hasOwn(source, 'prometheusBaseUrl'))
    output.prometheusBaseUrl = trimTrailingSlash(source.prometheusBaseUrl)

  return Object.keys(output).length > 0 ? output : undefined
}

export function invalidatePlatformMeetingOverridesCache(): void {
  const cache = getCachedMeetingOverridesState()
  cache.expiresAt = 0
  cache.overrides = {}
}

export function normalizePlatformMeetingRuntimeOverrides(raw: unknown): PlatformMeetingRuntimeOverrides {
  const source = parseJsonObject(raw)
  const normalized: PlatformMeetingRuntimeOverrides = {
    rtc: normalizeRtcSection(source.rtc),
    asr: normalizeAsrSection(source.asr),
    worker: normalizeWorkerSection(source.worker),
    monitoring: normalizeMonitoringSection(source.monitoring),
    updatedAt: hasOwn(source, 'updatedAt') ? toText(source.updatedAt) : '',
    updatedByUserId: hasOwn(source, 'updatedByUserId') ? toText(source.updatedByUserId) : '',
  }

  if (!normalized.rtc)
    delete normalized.rtc
  if (!normalized.asr)
    delete normalized.asr
  if (!normalized.worker)
    delete normalized.worker
  if (!normalized.monitoring)
    delete normalized.monitoring
  if (!normalized.updatedAt)
    delete normalized.updatedAt
  if (!normalized.updatedByUserId)
    delete normalized.updatedByUserId

  return normalized
}

export async function readPlatformMeetingRuntimeOverrides(
  db: Queryable,
  event?: H3Event,
): Promise<PlatformMeetingRuntimeOverrides> {
  const result = await db.query<{ value: string }>(
    'SELECT value FROM migrations_meta WHERE key = $1 LIMIT 1',
    [PLATFORM_MEETING_RUNTIME_OVERRIDES_KEY],
  )

  const raw = String(result.rows[0]?.value || '').trim()
  if (!raw)
    return {}

  try {
    const normalized = normalizePlatformMeetingRuntimeOverrides(JSON.parse(raw))
    if (normalized.rtc && Object.prototype.hasOwnProperty.call(normalized.rtc, 'apiKey'))
      normalized.rtc.apiKey = decryptConfigSecretSafe(normalized.rtc.apiKey, event)
    if (normalized.rtc && Object.prototype.hasOwnProperty.call(normalized.rtc, 'apiSecret'))
      normalized.rtc.apiSecret = decryptConfigSecretSafe(normalized.rtc.apiSecret, event)
    if (normalized.rtc && Object.prototype.hasOwnProperty.call(normalized.rtc, 'webhookSecret'))
      normalized.rtc.webhookSecret = decryptConfigSecretSafe(normalized.rtc.webhookSecret, event)
    if (normalized.asr && Object.prototype.hasOwnProperty.call(normalized.asr, 'apiKey'))
      normalized.asr.apiKey = decryptConfigSecretSafe(normalized.asr.apiKey, event)
    if (normalized.asr && Object.prototype.hasOwnProperty.call(normalized.asr, 'webhookSecret'))
      normalized.asr.webhookSecret = decryptConfigSecretSafe(normalized.asr.webhookSecret, event)
    return normalized
  }
  catch {
    return {}
  }
}

export async function writePlatformMeetingRuntimeOverrides(
  db: Queryable,
  overrides: PlatformMeetingRuntimeOverrides,
  event?: H3Event,
): Promise<PlatformMeetingRuntimeOverrides> {
  const normalized = normalizePlatformMeetingRuntimeOverrides(overrides)
  const persistable = normalizePlatformMeetingRuntimeOverrides(normalized)
  const masterKeyReady = hasConfigMasterKey(event)

  if (persistable.rtc && Object.prototype.hasOwnProperty.call(persistable.rtc, 'apiKey')) {
    const value = String(persistable.rtc.apiKey || '')
    persistable.rtc.apiKey = masterKeyReady && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value, event) : value
  }
  if (persistable.rtc && Object.prototype.hasOwnProperty.call(persistable.rtc, 'apiSecret')) {
    const value = String(persistable.rtc.apiSecret || '')
    persistable.rtc.apiSecret = masterKeyReady && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value, event) : value
  }
  if (persistable.rtc && Object.prototype.hasOwnProperty.call(persistable.rtc, 'webhookSecret')) {
    const value = String(persistable.rtc.webhookSecret || '')
    persistable.rtc.webhookSecret = masterKeyReady && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value, event) : value
  }
  if (persistable.asr && Object.prototype.hasOwnProperty.call(persistable.asr, 'apiKey')) {
    const value = String(persistable.asr.apiKey || '')
    persistable.asr.apiKey = masterKeyReady && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value, event) : value
  }
  if (persistable.asr && Object.prototype.hasOwnProperty.call(persistable.asr, 'webhookSecret')) {
    const value = String(persistable.asr.webhookSecret || '')
    persistable.asr.webhookSecret = masterKeyReady && value && !isEncryptedConfigValue(value) ? encryptConfigSecret(value, event) : value
  }

  await db.query(
    `INSERT INTO migrations_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [PLATFORM_MEETING_RUNTIME_OVERRIDES_KEY, JSON.stringify(persistable)],
  )
  invalidatePlatformMeetingOverridesCache()
  return normalized
}

export function applyPlatformMeetingRuntimeOverrides(
  runtime: RuntimeSettings,
  overrides: PlatformMeetingRuntimeOverrides,
): RuntimeSettings {
  const next: RuntimeSettings = {
    ...runtime,
    meeting: {
      rtc: {
        provider: runtime.meeting?.rtc?.provider || '',
        serverUrl: runtime.meeting?.rtc?.serverUrl || '',
        apiKey: runtime.meeting?.rtc?.apiKey || '',
        apiSecret: runtime.meeting?.rtc?.apiSecret || '',
        embedBaseUrl: runtime.meeting?.rtc?.embedBaseUrl || '',
        webhookSecret: runtime.meeting?.rtc?.webhookSecret || '',
        roomPrefix: runtime.meeting?.rtc?.roomPrefix || DEFAULT_MEETING_ROOM_PREFIX,
      },
      asr: {
        provider: runtime.meeting?.asr?.provider || '',
        serviceUrl: runtime.meeting?.asr?.serviceUrl || '',
        apiKey: runtime.meeting?.asr?.apiKey || '',
        webhookSecret: runtime.meeting?.asr?.webhookSecret || '',
      },
      worker: {
        ...DEFAULT_MEETING_WORKER_SETTINGS,
        ...(runtime.meeting?.worker || {}),
      },
      monitoring: {
        prometheusBaseUrl: runtime.meeting?.monitoring?.prometheusBaseUrl || '',
      },
    },
  }

  const rtc = overrides.rtc
  if (rtc) {
    if (rtc.provider !== undefined)
      next.meeting.rtc.provider = rtc.provider
    if (rtc.serverUrl !== undefined)
      next.meeting.rtc.serverUrl = rtc.serverUrl
    if (rtc.apiKey !== undefined)
      next.meeting.rtc.apiKey = rtc.apiKey
    if (rtc.apiSecret !== undefined)
      next.meeting.rtc.apiSecret = rtc.apiSecret
    if (rtc.embedBaseUrl !== undefined)
      next.meeting.rtc.embedBaseUrl = rtc.embedBaseUrl
    if (rtc.webhookSecret !== undefined)
      next.meeting.rtc.webhookSecret = rtc.webhookSecret
    if (rtc.roomPrefix !== undefined)
      next.meeting.rtc.roomPrefix = rtc.roomPrefix || next.meeting.rtc.roomPrefix
  }

  const asr = overrides.asr
  if (asr) {
    if (asr.provider !== undefined)
      next.meeting.asr.provider = asr.provider
    if (asr.serviceUrl !== undefined)
      next.meeting.asr.serviceUrl = asr.serviceUrl
    if (asr.apiKey !== undefined)
      next.meeting.asr.apiKey = asr.apiKey
    if (asr.webhookSecret !== undefined)
      next.meeting.asr.webhookSecret = asr.webhookSecret
  }

  const worker = overrides.worker
  if (worker) {
    if (worker.enabled !== undefined)
      next.meeting.worker.enabled = Boolean(worker.enabled)
    if (worker.intervalMs !== undefined)
      next.meeting.worker.intervalMs = Math.round(clamp(worker.intervalMs, next.meeting.worker.intervalMs, 1000, 60_000))
    if (worker.batchSize !== undefined)
      next.meeting.worker.batchSize = Math.round(clamp(worker.batchSize, next.meeting.worker.batchSize, 1, 50))
    if (worker.maxAttempts !== undefined)
      next.meeting.worker.maxAttempts = Math.round(clamp(worker.maxAttempts, next.meeting.worker.maxAttempts, 1, 20))
  }

  const monitoring = overrides.monitoring
  if (monitoring) {
    if (monitoring.prometheusBaseUrl !== undefined)
      next.meeting.monitoring.prometheusBaseUrl = monitoring.prometheusBaseUrl
  }

  return next
}

export function getMeetingSettingsConfigSource(overrides: PlatformMeetingRuntimeOverrides): MeetingSettingsConfigSource {
  return {
    rtc: hasSectionOverrides(overrides.rtc as Record<string, unknown> | undefined) ? 'override' : 'default',
    asr: hasSectionOverrides(overrides.asr as Record<string, unknown> | undefined) ? 'override' : 'default',
    worker: hasSectionOverrides(overrides.worker as Record<string, unknown> | undefined) ? 'override' : 'default',
    monitoring: hasSectionOverrides(overrides.monitoring as Record<string, unknown> | undefined) ? 'override' : 'default',
  }
}

async function resolveMeetingOverridesWithCache(event?: H3Event): Promise<PlatformMeetingRuntimeOverrides> {
  const cache = getCachedMeetingOverridesState()
  const now = Date.now()
  if (cache.expiresAt > now)
    return cache.overrides

  try {
    const overrides = await withClient(event, async (db) => {
      return readPlatformMeetingRuntimeOverrides(db, event)
    })
    cache.overrides = overrides
    cache.expiresAt = now + PLATFORM_MEETING_RUNTIME_OVERRIDES_CACHE_TTL_MS
    return overrides
  }
  catch {
    if (cache.expiresAt > 0)
      return cache.overrides
    return {}
  }
}

export async function readEffectiveMeetingRuntimeSettings(
  event?: H3Event,
): Promise<{
  runtime: RuntimeSettings
  overrides: PlatformMeetingRuntimeOverrides
  configSource: MeetingSettingsConfigSource
}> {
  const { runtime: baseRuntime } = await readEffectivePlatformRuntimeSettings(event)
  const overrides = await resolveMeetingOverridesWithCache(event)
  return {
    runtime: applyPlatformMeetingRuntimeOverrides(baseRuntime, overrides),
    overrides,
    configSource: getMeetingSettingsConfigSource(overrides),
  }
}

export function getPlatformMeetingOverrideState(overrides: PlatformMeetingRuntimeOverrides): {
  rtcApiKeyOverridden: boolean
  rtcApiSecretOverridden: boolean
  rtcWebhookSecretOverridden: boolean
  asrApiKeyOverridden: boolean
  asrWebhookSecretOverridden: boolean
  updatedAt: string
  updatedByUserId: string
} {
  return {
    rtcApiKeyOverridden: Boolean(overrides.rtc && Object.prototype.hasOwnProperty.call(overrides.rtc, 'apiKey')),
    rtcApiSecretOverridden: Boolean(overrides.rtc && Object.prototype.hasOwnProperty.call(overrides.rtc, 'apiSecret')),
    rtcWebhookSecretOverridden: Boolean(overrides.rtc && Object.prototype.hasOwnProperty.call(overrides.rtc, 'webhookSecret')),
    asrApiKeyOverridden: Boolean(overrides.asr && Object.prototype.hasOwnProperty.call(overrides.asr, 'apiKey')),
    asrWebhookSecretOverridden: Boolean(overrides.asr && Object.prototype.hasOwnProperty.call(overrides.asr, 'webhookSecret')),
    updatedAt: String(overrides.updatedAt || ''),
    updatedByUserId: String(overrides.updatedByUserId || ''),
  }
}
