import { setResponseStatus } from 'h3'
import { buildMeetingProvidersPayload } from '~~/server/services/meeting/admin-provider-config'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  readEffectiveMeetingRuntimeSettings,
} from '~~/server/utils/platform-meeting-config-store'
import { hasConfigMasterKey } from '~~/server/utils/secure-config'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { user } = await requireAuth(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看会议服务配置。', {
      startedAt,
      provider: '',
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40421)
  }

  const { runtime, overrides, configSource } = await readEffectiveMeetingRuntimeSettings(event)

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

  return ok(buildMeetingProvidersPayload({
    runtime,
    overrides,
    configSource,
    masterKeyReady: hasConfigMasterKey(event),
  }), {
    startedAt,
    provider: '',
    model: '',
    fallbackUsed: false,
    attempts: 1,
  })
})
