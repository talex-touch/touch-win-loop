import type { RuntimeSettings } from '~~/server/utils/env'
import type { MeetingSettingsConfigSource, PlatformMeetingRuntimeOverrides } from '~~/server/utils/platform-meeting-config-store'
import { listMeetingAsrConfigIssues, listMeetingRtcConfigIssues } from '~~/server/services/meeting/meeting-runtime'
import { getPlatformMeetingOverrideState, normalizePlatformMeetingRuntimeOverrides } from '~~/server/utils/platform-meeting-config-store'

export type MeetingSecretMode = 'keep' | 'replace' | 'clear'

export interface MeetingProvidersMutationBody {
  rtc?: {
    provider?: string
    serverUrl?: string
    embedBaseUrl?: string
    roomPrefix?: string
    apiKey?: string
    apiKeyMode?: MeetingSecretMode
    apiSecret?: string
    apiSecretMode?: MeetingSecretMode
    webhookSecret?: string
    webhookSecretMode?: MeetingSecretMode
  }
  asr?: {
    provider?: string
    serviceUrl?: string
    apiKey?: string
    apiKeyMode?: MeetingSecretMode
    webhookSecret?: string
    webhookSecretMode?: MeetingSecretMode
  }
  worker?: {
    enabled?: boolean
    intervalMs?: number
    batchSize?: number
    maxAttempts?: number
  }
}

export interface MeetingProvidersPayload {
  rtc: {
    provider: string
    serverUrl: string
    embedBaseUrl: string
    roomPrefix: string
    apiKeyConfigured: boolean
    apiSecretConfigured: boolean
    webhookSecretConfigured: boolean
  }
  asr: {
    provider: string
    serviceUrl: string
    apiKeyConfigured: boolean
    webhookSecretConfigured: boolean
  }
  worker: {
    enabled: boolean
    intervalMs: number
    batchSize: number
    maxAttempts: number
  }
  health: {
    ready: boolean
    rtcIssues: string[]
    asrIssues: string[]
    issues: string[]
  }
  masterKeyReady: boolean
  overrideState: {
    rtcApiKeyOverridden: boolean
    rtcApiSecretOverridden: boolean
    rtcWebhookSecretOverridden: boolean
    asrApiKeyOverridden: boolean
    asrWebhookSecretOverridden: boolean
    updatedAt: string
    updatedByUserId: string
  }
  configSource: MeetingSettingsConfigSource
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function toMode(raw: unknown): MeetingSecretMode {
  const value = String(raw || '').trim()
  if (value === 'replace' || value === 'clear')
    return value
  return 'keep'
}

function toBoolean(raw: unknown, fieldName: string): boolean {
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized))
      return true
    if (['0', 'false', 'no', 'off'].includes(normalized))
      return false
  }
  throw new Error(`${fieldName} 必须为布尔值。`)
}

function toNumber(raw: unknown, fieldName: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value))
    throw new Error(`${fieldName} 必须为有效数字。`)
  return value
}

function clamp(input: number, min: number, max: number, integer = false): number {
  const bounded = Math.max(min, Math.min(max, input))
  return integer ? Math.round(bounded) : bounded
}

export function isMeetingSecretReplaceRequested(body: MeetingProvidersMutationBody): boolean {
  const rtcBody = body?.rtc && typeof body.rtc === 'object' ? body.rtc : null
  const asrBody = body?.asr && typeof body.asr === 'object' ? body.asr : null
  return (
    toMode(rtcBody?.apiKeyMode) === 'replace'
    || toMode(rtcBody?.apiSecretMode) === 'replace'
    || toMode(rtcBody?.webhookSecretMode) === 'replace'
    || toMode(asrBody?.apiKeyMode) === 'replace'
    || toMode(asrBody?.webhookSecretMode) === 'replace'
  )
}

export function applyMeetingProvidersMutation(
  existing: PlatformMeetingRuntimeOverrides,
  body: MeetingProvidersMutationBody,
): PlatformMeetingRuntimeOverrides {
  const rtcBody = body?.rtc && typeof body.rtc === 'object' ? body.rtc as Record<string, unknown> : null
  const asrBody = body?.asr && typeof body.asr === 'object' ? body.asr as Record<string, unknown> : null
  const workerBody = body?.worker && typeof body.worker === 'object' ? body.worker as Record<string, unknown> : null
  const next = normalizePlatformMeetingRuntimeOverrides(existing)

  if (rtcBody) {
    const rtc = { ...(next.rtc || {}) }
    if (hasOwn(rtcBody, 'provider'))
      rtc.provider = String(rtcBody.provider || '').trim()
    if (hasOwn(rtcBody, 'serverUrl'))
      rtc.serverUrl = String(rtcBody.serverUrl || '').trim()
    if (hasOwn(rtcBody, 'embedBaseUrl'))
      rtc.embedBaseUrl = String(rtcBody.embedBaseUrl || '').trim()
    if (hasOwn(rtcBody, 'roomPrefix'))
      rtc.roomPrefix = String(rtcBody.roomPrefix || '').trim()

    const rtcApiKeyMode = toMode(rtcBody.apiKeyMode)
    if (rtcApiKeyMode === 'replace')
      rtc.apiKey = String(rtcBody.apiKey || '')
    if (rtcApiKeyMode === 'clear')
      rtc.apiKey = ''

    const rtcApiSecretMode = toMode(rtcBody.apiSecretMode)
    if (rtcApiSecretMode === 'replace')
      rtc.apiSecret = String(rtcBody.apiSecret || '')
    if (rtcApiSecretMode === 'clear')
      rtc.apiSecret = ''

    const rtcWebhookSecretMode = toMode(rtcBody.webhookSecretMode)
    if (rtcWebhookSecretMode === 'replace')
      rtc.webhookSecret = String(rtcBody.webhookSecret || '')
    if (rtcWebhookSecretMode === 'clear')
      rtc.webhookSecret = ''

    next.rtc = rtc
  }

  if (asrBody) {
    const asr = { ...(next.asr || {}) }
    if (hasOwn(asrBody, 'provider'))
      asr.provider = String(asrBody.provider || '').trim()
    if (hasOwn(asrBody, 'serviceUrl'))
      asr.serviceUrl = String(asrBody.serviceUrl || '').trim()

    const asrApiKeyMode = toMode(asrBody.apiKeyMode)
    if (asrApiKeyMode === 'replace')
      asr.apiKey = String(asrBody.apiKey || '')
    if (asrApiKeyMode === 'clear')
      asr.apiKey = ''

    const asrWebhookSecretMode = toMode(asrBody.webhookSecretMode)
    if (asrWebhookSecretMode === 'replace')
      asr.webhookSecret = String(asrBody.webhookSecret || '')
    if (asrWebhookSecretMode === 'clear')
      asr.webhookSecret = ''

    next.asr = asr
  }

  if (workerBody) {
    const worker = { ...(next.worker || {}) }
    if (hasOwn(workerBody, 'enabled'))
      worker.enabled = toBoolean(workerBody.enabled, 'worker.enabled')
    if (hasOwn(workerBody, 'intervalMs'))
      worker.intervalMs = clamp(toNumber(workerBody.intervalMs, 'worker.intervalMs'), 1000, 60_000, true)
    if (hasOwn(workerBody, 'batchSize'))
      worker.batchSize = clamp(toNumber(workerBody.batchSize, 'worker.batchSize'), 1, 50, true)
    if (hasOwn(workerBody, 'maxAttempts'))
      worker.maxAttempts = clamp(toNumber(workerBody.maxAttempts, 'worker.maxAttempts'), 1, 20, true)
    next.worker = worker
  }

  return normalizePlatformMeetingRuntimeOverrides(next)
}

export function buildMeetingProvidersPayload(input: {
  runtime: RuntimeSettings
  overrides: PlatformMeetingRuntimeOverrides
  configSource: MeetingSettingsConfigSource
  masterKeyReady: boolean
}): MeetingProvidersPayload {
  const rtcIssues = listMeetingRtcConfigIssues(input.runtime)
  const asrIssues = listMeetingAsrConfigIssues(input.runtime)

  return {
    rtc: {
      provider: input.runtime.meeting.rtc.provider,
      serverUrl: input.runtime.meeting.rtc.serverUrl,
      embedBaseUrl: input.runtime.meeting.rtc.embedBaseUrl,
      roomPrefix: input.runtime.meeting.rtc.roomPrefix,
      apiKeyConfigured: Boolean(input.runtime.meeting.rtc.apiKey),
      apiSecretConfigured: Boolean(input.runtime.meeting.rtc.apiSecret),
      webhookSecretConfigured: Boolean(input.runtime.meeting.rtc.webhookSecret),
    },
    asr: {
      provider: input.runtime.meeting.asr.provider,
      serviceUrl: input.runtime.meeting.asr.serviceUrl,
      apiKeyConfigured: Boolean(input.runtime.meeting.asr.apiKey),
      webhookSecretConfigured: Boolean(input.runtime.meeting.asr.webhookSecret),
    },
    worker: {
      enabled: input.runtime.meeting.worker.enabled,
      intervalMs: input.runtime.meeting.worker.intervalMs,
      batchSize: input.runtime.meeting.worker.batchSize,
      maxAttempts: input.runtime.meeting.worker.maxAttempts,
    },
    health: {
      ready: rtcIssues.length === 0 && asrIssues.length === 0,
      rtcIssues,
      asrIssues,
      issues: [...rtcIssues, ...asrIssues],
    },
    masterKeyReady: input.masterKeyReady,
    overrideState: getPlatformMeetingOverrideState(input.overrides),
    configSource: input.configSource,
  }
}
