import type { MeetingProvidersMutationBody } from '~~/server/services/meeting/admin-provider-config'
import { setResponseStatus } from 'h3'
import { applyMeetingProvidersMutation } from '~~/server/services/meeting/admin-provider-config'
import { probeMeetingAsrGateway } from '~~/server/services/meeting/asr-gateway'
import { listMeetingAsrConfigIssues, listMeetingRtcConfigIssues } from '~~/server/services/meeting/meeting-runtime'
import { probeRtcProviderGateway } from '~~/server/services/meeting/rtc-provider'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  applyPlatformMeetingRuntimeOverrides,
  readEffectiveMeetingRuntimeSettings,
} from '~~/server/utils/platform-meeting-config-store'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

interface MeetingProviderTestProbe {
  provider: string
  endpoint: string
  configured: boolean
  ok: boolean
  statusCode?: number
  latencyMs: number
  detail: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function buildConfigIssueProbe(input: {
  provider: string
  endpoint: string
  detail: string
}): MeetingProviderTestProbe {
  return {
    provider: normalizeString(input.provider) || 'unknown',
    endpoint: normalizeString(input.endpoint),
    configured: false,
    ok: false,
    latencyMs: 0,
    detail: normalizeString(input.detail) || '配置缺失。',
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<MeetingProvidersMutationBody>(event).catch(() => ({} as MeetingProvidersMutationBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权测试会议服务配置。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40423)
  }

  try {
    const { runtime: baseRuntime } = await readEffectivePlatformRuntimeSettings(event)
    const { overrides } = await readEffectiveMeetingRuntimeSettings(event)
    const nextOverrides = applyMeetingProvidersMutation(overrides, body)
    const runtime = applyPlatformMeetingRuntimeOverrides(baseRuntime, nextOverrides)
    const rtcIssues = listMeetingRtcConfigIssues(runtime)
    const asrIssues = listMeetingAsrConfigIssues(runtime)

    const rtcProbe = rtcIssues.length > 0
      ? buildConfigIssueProbe({
          provider: runtime.meeting.rtc.provider,
          endpoint: runtime.meeting.rtc.serverUrl,
          detail: rtcIssues.join('；'),
        })
      : (() => probeRtcProviderGateway(runtime))()
    const asrProbe = asrIssues.length > 0
      ? buildConfigIssueProbe({
          provider: runtime.meeting.asr.provider,
          endpoint: runtime.meeting.asr.serviceUrl,
          detail: asrIssues.join('；'),
        })
      : (() => probeMeetingAsrGateway(runtime))()

    const [resolvedRtcProbe, resolvedAsrProbe] = await Promise.all([rtcProbe, asrProbe])
    const payload = {
      ready: resolvedRtcProbe.ok && resolvedAsrProbe.ok,
      testedAt: new Date().toISOString(),
      rtc: {
        ...resolvedRtcProbe,
        configured: resolvedRtcProbe.configured ?? true,
      },
      asr: {
        ...resolvedAsrProbe,
        configured: resolvedAsrProbe.configured ?? true,
      },
    }

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'test.admin.meeting.providers',
        payload: {
          rtcProvider: payload.rtc.provider,
          rtcOk: payload.rtc.ok,
          asrProvider: payload.asr.provider,
          asrOk: payload.asr.ok,
          latencyMs: Date.now() - startedAt,
        },
      })
    })

    return ok(payload, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '会议服务配置测试失败。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40101)
  }
})
