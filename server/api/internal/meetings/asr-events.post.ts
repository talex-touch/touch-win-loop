import { setResponseStatus } from 'h3'
import { getMeetingAsrGateway } from '~~/server/services/meeting/asr-gateway'
import { resolveMeetingRuntimeError } from '~~/server/services/meeting/meeting-runtime'
import {
  persistProjectMeetingCaption,
  resolveMaskedProjectMeetingSpeakerLabel,
} from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { getProjectBillingScopeById, recordBillingUsageEventSafely } from '~~/server/utils/billing-usage-tracker'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { readEffectiveMeetingRuntimeSettings } from '~~/server/utils/platform-meeting-config-store'
import { getProjectMeetingByMeetingId } from '~~/server/utils/project-meeting-store'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

interface AsrEventBody {
  meetingId?: string
  eventType?: string
  participantIdentity?: string
  displayName?: string
  speakerLabel?: string
  text?: string
  language?: string
  confidence?: number
  startedAtMs?: number
  endedAtMs?: number
  eventId?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolveMeetingAsrBillingConfig(runtime: ReturnType<typeof readRuntimeSettings>) {
  const registry = resolvePlatformAiRegistry(runtime)
  const channel = registry.channels.find(item => item.key === 'meeting_asr')
  const providerIds = Array.isArray(channel?.providerIds) ? channel.providerIds : []
  const provider = registry.providers.find(item => item.enabled && providerIds.includes(item.id))
    || registry.providers.find(item => item.enabled && (item.capability === 'asr' || item.capability === 'voice' || item.capability === 'realtime'))
  return provider?.voice?.billing || null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { runtime } = await readEffectiveMeetingRuntimeSettings(event)
  const { runtime: aiRuntime } = await readEffectiveRuntimeSettings(event)
  let asr
  try {
    asr = getMeetingAsrGateway(runtime)
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
      }, 50400)
    }
    throw error
  }
  if (!asr.verifyWebhook({ headers: event.node.req.headers as Record<string, unknown> })) {
    setResponseStatus(event, 401)
    return fail('invalid asr webhook signature', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40194)
  }

  const body = await readBody<AsrEventBody>(event).catch(() => ({} as AsrEventBody))
  const meetingId = normalizeString(body?.meetingId)
  const eventType = normalizeString(body?.eventType).toLowerCase()
  const text = normalizeString(body?.text)
  if (!meetingId || !text) {
    setResponseStatus(event, 400)
    return fail('meetingId 与 text 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  const payload = await withTransaction(event, async (db) => {
    const meeting = await getProjectMeetingByMeetingId(db, meetingId)
    if (!meeting)
      throw new Error('MEETING_NOT_FOUND')

    const caption = await persistProjectMeetingCaption(db, {
      meeting,
      participantIdentity: normalizeString(body?.participantIdentity),
      displayName: normalizeString(body?.displayName),
      speakerLabel: normalizeString(body?.speakerLabel),
      text,
      language: normalizeString(body?.language),
      confidence: Number(body?.confidence || 0),
      startedAtMs: Number(body?.startedAtMs || 0),
      endedAtMs: Number(body?.endedAtMs || body?.startedAtMs || 0),
      isFinal: eventType !== 'partial',
      eventId: normalizeString(body?.eventId),
    })

    const isFinal = eventType !== 'partial'
    if (isFinal) {
      const billingConfig = resolveMeetingAsrBillingConfig(aiRuntime)
      const asrUnitsPerMinute = Math.max(0, Number(billingConfig?.asrUnitsPerMinute || 0))
      if (asrUnitsPerMinute > 0) {
        const startedAtMs = Number(body?.startedAtMs || 0)
        const endedAtMs = Number(body?.endedAtMs || startedAtMs || 0)
        const durationMs = Math.max(1000, endedAtMs - startedAtMs)
        const units = Math.max(1, Math.ceil(durationMs / 60000 * asrUnitsPerMinute * Math.max(1, Number(billingConfig?.providerMarkupMultiplier || 1))))
        const sourceRoute = `/api/internal/meetings/asr/${runtime.meeting.asr.provider}/final`
        const quota = await teamConsumeAiQuota(db, {
          workspaceId: meeting.workspaceId,
          userId: meeting.startedByUserId,
          route: sourceRoute,
          units,
        })
        if (!quota.allowed)
          throw new Error('QUOTA_EXCEEDED')
        const scope = await getProjectBillingScopeById(db, meeting.projectId)
        await recordBillingUsageEventSafely(db, {
          workspaceId: meeting.workspaceId,
          projectId: meeting.projectId,
          contestId: scope?.contestId || null,
          trackId: scope?.trackId || null,
          actorUserId: meeting.startedByUserId,
          eventCode: 'ai.meeting.asr',
          result: 'success',
          sourceRoute,
          meta: {
            meetingId: meeting.id,
            provider: runtime.meeting.asr.provider,
            durationMs,
            units,
            eventId: normalizeString(body?.eventId),
          },
        })
      }
    }

    return {
      meeting,
      caption,
      isFinal,
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'MEETING_NOT_FOUND')
      return null
    if (error instanceof Error && error.message === 'QUOTA_EXCEEDED')
      return { quotaExceeded: true }
    throw error
  })

  if (payload && 'quotaExceeded' in payload) {
    setResponseStatus(event, 429)
    return fail('当前工作空间 AI 配额不足，会议 ASR 字幕已停止写入。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42996)
  }

  if (!payload) {
    setResponseStatus(event, 404)
    return fail('meeting not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40500)
  }

  const speakerName = payload.caption.utterance?.speakerName
    || payload.caption.participant?.displayName
    || normalizeString(body?.displayName)
    || normalizeString(body?.speakerLabel)
    || 'Speaker'
  const guestSpeakerLabel = resolveMaskedProjectMeetingSpeakerLabel({
    participants: payload.caption.participants,
    participantId: payload.caption.participant?.id || payload.caption.utterance?.participantId || '',
    speakerUserId: payload.caption.utterance?.speakerUserId || '',
    speakerLabel: payload.caption.utterance?.speakerLabel || normalizeString(body?.speakerLabel),
    speakerName,
  })

  await Promise.allSettled([
    emitRealtimeEvent({
      type: payload.isFinal ? 'meeting.caption.final' : 'meeting.caption.partial',
      workspaceId: payload.meeting.workspaceId,
      projectId: payload.meeting.projectId,
      payload: {
        meetingId: payload.meeting.id,
        participantId: payload.caption.participant?.id || '',
        participantIdentity: payload.caption.participant?.providerIdentity || normalizeString(body?.participantIdentity),
        speakerName,
        speakerLabel: payload.caption.utterance?.speakerLabel || normalizeString(body?.speakerLabel) || speakerName,
        guestSpeakerLabel,
        text,
        startedAtMs: Number(body?.startedAtMs || 0),
        endedAtMs: Number(body?.endedAtMs || body?.startedAtMs || 0),
        confidence: Number(body?.confidence || 0),
        utteranceId: payload.caption.utterance?.id || '',
      },
    }),
    emitRealtimeEvent({
      type: 'meeting.participant.updated',
      workspaceId: payload.meeting.workspaceId,
      projectId: payload.meeting.projectId,
      payload: {
        meetingId: payload.meeting.id,
        participantId: payload.caption.participant?.id || '',
      },
    }),
  ])

  return ok({
    accepted: true,
    meetingId,
    final: payload.isFinal,
    utteranceId: payload.caption.utterance?.id || '',
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
