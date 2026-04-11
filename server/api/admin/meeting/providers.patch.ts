import { setResponseStatus } from 'h3'
import { listMeetingAsrConfigIssues, listMeetingRtcConfigIssues } from '~~/server/services/meeting/meeting-runtime'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  getPlatformMeetingOverrideState,
  normalizePlatformMeetingRuntimeOverrides,
  readEffectiveMeetingRuntimeSettings,
  readPlatformMeetingRuntimeOverrides,
  writePlatformMeetingRuntimeOverrides,
} from '~~/server/utils/platform-meeting-config-store'
import { hasConfigMasterKey } from '~~/server/utils/secure-config'

type SecretMode = 'keep' | 'replace' | 'clear'

interface ProvidersPatchBody {
  rtc?: {
    provider?: string
    serverUrl?: string
    embedBaseUrl?: string
    roomPrefix?: string
    apiKey?: string
    apiKeyMode?: SecretMode
    apiSecret?: string
    apiSecretMode?: SecretMode
    webhookSecret?: string
    webhookSecretMode?: SecretMode
  }
  asr?: {
    provider?: string
    serviceUrl?: string
    apiKey?: string
    apiKeyMode?: SecretMode
    webhookSecret?: string
    webhookSecretMode?: SecretMode
  }
  worker?: {
    enabled?: boolean
    intervalMs?: number
    batchSize?: number
    maxAttempts?: number
  }
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function toMode(raw: unknown): SecretMode {
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

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<ProvidersPatchBody>(event).catch(() => ({} as ProvidersPatchBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改会议服务配置。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40422)
  }

  const rtcBody = body?.rtc && typeof body.rtc === 'object' ? body.rtc as Record<string, unknown> : null
  const asrBody = body?.asr && typeof body.asr === 'object' ? body.asr as Record<string, unknown> : null
  const workerBody = body?.worker && typeof body.worker === 'object' ? body.worker as Record<string, unknown> : null

  const masterKeyReady = hasConfigMasterKey(event)
  const requiresSecretReplace = (
    toMode(rtcBody?.apiKeyMode) === 'replace'
    || toMode(rtcBody?.apiSecretMode) === 'replace'
    || toMode(rtcBody?.webhookSecretMode) === 'replace'
    || toMode(asrBody?.apiKeyMode) === 'replace'
    || toMode(asrBody?.webhookSecretMode) === 'replace'
  )
  if (requiresSecretReplace && !masterKeyReady) {
    setResponseStatus(event, 400)
    return fail('缺少 WINLOOP_CONFIG_MASTER_KEY，无法替换会议服务密钥字段。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  try {
    await withTransaction(event, async (db) => {
      const existing = normalizePlatformMeetingRuntimeOverrides(await readPlatformMeetingRuntimeOverrides(db, event))
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

      next.updatedAt = new Date().toISOString()
      next.updatedByUserId = user.id

      const normalized = normalizePlatformMeetingRuntimeOverrides(next)
      await writePlatformMeetingRuntimeOverrides(db, normalized, event)
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'write.admin.meeting.providers',
        payload: {
          hasRtcUpdate: Boolean(rtcBody),
          hasAsrUpdate: Boolean(asrBody),
          hasWorkerUpdate: Boolean(workerBody),
        },
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '会议服务配置保存失败。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40100)
  }

  const { runtime, overrides, configSource } = await readEffectiveMeetingRuntimeSettings(event)
  const rtcIssues = listMeetingRtcConfigIssues(runtime)
  const asrIssues = listMeetingAsrConfigIssues(runtime)

  return ok({
    rtc: {
      provider: runtime.meeting.rtc.provider,
      serverUrl: runtime.meeting.rtc.serverUrl,
      embedBaseUrl: runtime.meeting.rtc.embedBaseUrl,
      roomPrefix: runtime.meeting.rtc.roomPrefix,
      apiKeyConfigured: Boolean(runtime.meeting.rtc.apiKey),
      apiSecretConfigured: Boolean(runtime.meeting.rtc.apiSecret),
      webhookSecretConfigured: Boolean(runtime.meeting.rtc.webhookSecret),
    },
    asr: {
      provider: runtime.meeting.asr.provider,
      serviceUrl: runtime.meeting.asr.serviceUrl,
      apiKeyConfigured: Boolean(runtime.meeting.asr.apiKey),
      webhookSecretConfigured: Boolean(runtime.meeting.asr.webhookSecret),
    },
    worker: {
      enabled: runtime.meeting.worker.enabled,
      intervalMs: runtime.meeting.worker.intervalMs,
      batchSize: runtime.meeting.worker.batchSize,
      maxAttempts: runtime.meeting.worker.maxAttempts,
    },
    health: {
      ready: rtcIssues.length === 0 && asrIssues.length === 0,
      rtcIssues,
      asrIssues,
      issues: [...rtcIssues, ...asrIssues],
    },
    masterKeyReady,
    overrideState: getPlatformMeetingOverrideState(overrides),
    configSource,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
