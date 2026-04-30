import type { MeetingProvidersMutationBody } from '~~/server/services/meeting/admin-provider-config'
import { setResponseStatus } from 'h3'
import {
  applyMeetingProvidersMutation,
  buildMeetingProvidersPayload,
} from '~~/server/services/meeting/admin-provider-config'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  readEffectiveMeetingRuntimeSettings,
  readPlatformMeetingRuntimeOverrides,
  writePlatformMeetingRuntimeOverrides,
} from '~~/server/utils/platform-meeting-config-store'
import { hasConfigMasterKey } from '~~/server/utils/secure-config'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { user } = await requireAuth(event)
  const body = await readBody<MeetingProvidersMutationBody>(event).catch(() => ({} as MeetingProvidersMutationBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改会议服务配置。', {
      startedAt,
      provider: '',
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40422)
  }

  const masterKeyReady = hasConfigMasterKey(event)

  try {
    await withTransaction(event, async (db) => {
      const existing = await readPlatformMeetingRuntimeOverrides(db, event)
      const next = applyMeetingProvidersMutation(existing, body)
      next.updatedAt = new Date().toISOString()
      next.updatedByUserId = user.id

      await writePlatformMeetingRuntimeOverrides(db, next, event)
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'write.admin.meeting.providers',
        payload: {
          hasRtcUpdate: Boolean(body?.rtc && typeof body.rtc === 'object'),
          hasAsrUpdate: Boolean(body?.asr && typeof body.asr === 'object'),
          hasWorkerUpdate: Boolean(body?.worker && typeof body.worker === 'object'),
        },
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '会议服务配置保存失败。', {
      startedAt,
      provider: '',
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40100)
  }

  const { runtime, overrides, configSource } = await readEffectiveMeetingRuntimeSettings(event)
  return ok(buildMeetingProvidersPayload({
    runtime,
    overrides,
    configSource,
    masterKeyReady,
  }), {
    startedAt,
    provider: '',
    model: '',
    fallbackUsed: false,
    attempts: 1,
  })
})
