import { setResponseStatus } from 'h3'
import { getMeetingAsrGateway } from '~~/server/services/meeting/asr-gateway'
import {
  persistProjectMeetingCaption,
  resolveMaskedProjectMeetingSpeakerLabel,
} from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getProjectMeetingByMeetingId } from '~~/server/utils/project-meeting-store'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

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

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const asr = getMeetingAsrGateway(runtime)
  if (!asr.verifyWebhook({ headers: event.node.req.headers as Record<string, unknown> })) {
    setResponseStatus(event, 401)
    return fail('invalid asr webhook signature', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
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

    return {
      meeting,
      caption,
      isFinal: eventType !== 'partial',
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'MEETING_NOT_FOUND')
      return null
    throw error
  })

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
