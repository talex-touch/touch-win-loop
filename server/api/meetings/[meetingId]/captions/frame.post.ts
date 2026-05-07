import { setResponseStatus } from 'h3'
import { getMeetingAsrGateway } from '~~/server/services/meeting/asr-gateway'
import { resolveMeetingRuntimeError } from '~~/server/services/meeting/meeting-runtime'
import { resolveProjectMeetingAudioFrameTarget } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readEffectiveMeetingRuntimeSettings } from '~~/server/utils/platform-meeting-config-store'

interface MeetingCaptionFrameBody {
  chunkBase64?: string
  mimeType?: string
  participantIdentity?: string
  meetingGuestToken?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { runtime } = await readEffectiveMeetingRuntimeSettings(event)
  const meetingId = normalizeString(getRouterParam(event, 'meetingId'))
  const body = await readBody<MeetingCaptionFrameBody>(event).catch(() => ({} as MeetingCaptionFrameBody))
  const meetingGuestToken = normalizeString(body?.meetingGuestToken)
  const chunkBase64 = normalizeString(body?.chunkBase64)

  if (!meetingId) {
    setResponseStatus(event, 400)
    return fail('缺少 meetingId。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }
  if (!chunkBase64) {
    setResponseStatus(event, 400)
    return fail('缺少音频帧数据。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  try {
    const user = meetingGuestToken ? undefined : (await requireAuth(event)).user
    const payload = await withClient(event, async (db) => {
      return resolveProjectMeetingAudioFrameTarget(db, {
        meetingId,
        participantIdentity: normalizeString(body?.participantIdentity),
        meetingGuestToken,
        user,
        runtime,
      })
    })
    const asr = getMeetingAsrGateway(runtime)
    await asr.pushAudioFrame({
      sessionId: payload.asrSessionId,
      participantIdentity: payload.participantIdentity,
      chunkBase64,
      mimeType: normalizeString(body?.mimeType),
    })

    return ok({
      accepted: true,
      meetingId: payload.meeting.id,
      participantIdentity: payload.participantIdentity,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    const runtimeError = resolveMeetingRuntimeError(error)
    if (runtimeError) {
      setResponseStatus(event, runtimeError.status)
      return fail(runtimeError.message, {
        startedAt,
        provider: fallbackRuntime.ai.provider,
        model: fallbackRuntime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 50401)
    }

    if (error instanceof Error && error.message === 'MEETING_GUEST_TOKEN_INVALID') {
      setResponseStatus(event, 401)
      return fail('外部会议临时凭证已失效，请刷新页面重新加入。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40195)
    }

    if (error instanceof Error && error.message === 'MEETING_PARTICIPANT_IDENTITY_MISMATCH') {
      setResponseStatus(event, 403)
      return fail('当前音频身份与会议会话不匹配。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40395)
    }

    if (error instanceof Error && error.message === 'MEETING_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('会议不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40498)
    }

    if (error instanceof Error && error.message === 'MEETING_NOT_ACTIVE') {
      setResponseStatus(event, 409)
      return fail('当前会议未处于进行中状态，无法继续上传字幕音频。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40907)
    }

    if (error instanceof Error && error.message === 'MEETING_ASR_SESSION_NOT_STARTED') {
      setResponseStatus(event, 409)
      return fail('会议转写会话尚未启动。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40908)
    }

    if (error instanceof Error && error.message === 'MEETING_ASR_SESSION_NOT_FOUND') {
      setResponseStatus(event, 409)
      return fail('会议转写会话已失效，请刷新页面后重新加入会议。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40909)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权上传该会议的字幕音频。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40396)
    }

    throw error
  }
})
