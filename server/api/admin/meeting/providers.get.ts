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
  readEffectiveMeetingRuntimeSettings,
} from '~~/server/utils/platform-meeting-config-store'
import { hasConfigMasterKey } from '~~/server/utils/secure-config'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看会议服务配置。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40421)
  }

  const { runtime, overrides, configSource } = await readEffectiveMeetingRuntimeSettings(event)
  const rtcIssues = listMeetingRtcConfigIssues(runtime)
  const asrIssues = listMeetingAsrConfigIssues(runtime)

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'read.admin.meeting.providers',
      payload: {
        rtcProvider: runtime.meeting.rtc.provider,
        asrProvider: runtime.meeting.asr.provider,
      },
    })
  })

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
    masterKeyReady: hasConfigMasterKey(event),
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
