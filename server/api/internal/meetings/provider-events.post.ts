import { setResponseStatus } from 'h3'
import { endProjectMeetingSession } from '~~/server/services/meeting/project-meeting'
import { getRtcProviderGateway } from '~~/server/services/meeting/rtc-provider'
import { fail, ok } from '~~/server/utils/api'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  enqueueProjectMeetingJob,
  findProjectMeetingByProviderRoom,
  getProjectMeetingByMeetingId,
  patchProjectMeeting,
  upsertProjectMeetingParticipant,
} from '~~/server/utils/project-meeting-store'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

interface ProviderEventBody {
  provider?: string
  eventType?: string
  meetingId?: string
  roomId?: string
  roomName?: string
  participantIdentity?: string
  participantId?: string
  displayName?: string
  role?: string
  joinedAt?: string
  leftAt?: string
  audioTrackState?: string
  videoTrackState?: string
  artifact?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const rtc = getRtcProviderGateway(runtime)
  if (!rtc.verifyWebhook({ headers: event.node.req.headers as Record<string, unknown> })) {
    setResponseStatus(event, 401)
    return fail('invalid meeting webhook signature', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40193)
  }

  const body = await readBody<ProviderEventBody>(event).catch(() => ({} as ProviderEventBody))
  const eventType = normalizeString(body?.eventType).toLowerCase()
  const provider = normalizeString(body?.provider) || rtc.provider

  const payload = await withTransaction(event, async (db) => {
    const meeting = normalizeString(body?.meetingId)
      ? await getProjectMeetingByMeetingId(db, normalizeString(body.meetingId))
      : await findProjectMeetingByProviderRoom(db, {
          provider,
          providerRoomId: normalizeString(body?.roomId),
          providerRoomName: normalizeString(body?.roomName),
        })

    if (!meeting)
      throw new Error('MEETING_NOT_FOUND')

    if (eventType === 'participant_joined' || eventType === 'participant_left') {
      const participantIdentity = normalizeString(body?.participantIdentity)
        || normalizeString(body?.participantId)
        || normalizeString(body?.displayName)
        || `provider-participant-${Date.now()}`
      const participant = await upsertProjectMeetingParticipant(db, {
        meetingId: meeting.id,
        projectId: meeting.projectId,
        providerIdentity: participantIdentity,
        providerParticipantId: normalizeString(body?.participantId),
        displayName: normalizeString(body?.displayName) || participantIdentity,
        role: normalizeString(body?.role) as any || 'member',
        joinedAt: eventType === 'participant_joined' ? (normalizeString(body?.joinedAt) || new Date().toISOString()) : undefined,
        leftAt: eventType === 'participant_left' ? (normalizeString(body?.leftAt) || new Date().toISOString()) : undefined,
        audioTrackState: normalizeString(body?.audioTrackState) as any || (eventType === 'participant_left' ? 'ended' : 'active'),
        videoTrackState: normalizeString(body?.videoTrackState) as any || 'unknown',
        metadata: body?.metadata || {},
      })

      return {
        meeting,
        type: 'participant',
        participant,
      }
    }

    if (eventType === 'recording_ready') {
      await patchProjectMeeting(db, {
        projectId: meeting.projectId,
        meetingId: meeting.id,
        recordingStatus: 'processing',
        providerMetadata: {
          recordingArtifact: body?.artifact || {},
          recordingReadyAt: new Date().toISOString(),
        },
      })
      await enqueueProjectMeetingJob(db, {
        meetingId: meeting.id,
        jobType: 'recording_finalize',
        payload: {
          recordingArtifact: body?.artifact || {},
        },
        maxAttempt: runtime.meeting.worker.maxAttempts,
      })

      return {
        meeting,
        type: 'recording',
      }
    }

    if (eventType === 'room_finished') {
      const detail = await endProjectMeetingSession(db, {
        projectId: meeting.projectId,
        meetingId: meeting.id,
        runtime,
      })
      return {
        meeting: detail,
        type: 'ended',
      }
    }

    if (eventType === 'room_failed') {
      const failed = await patchProjectMeeting(db, {
        projectId: meeting.projectId,
        meetingId: meeting.id,
        status: 'failed',
        transcriptStatus: 'failed',
        recordingStatus: 'failed',
        summaryStatus: 'failed',
        providerMetadata: {
          failurePayload: body?.metadata || {},
          failedAt: new Date().toISOString(),
        },
      })
      return {
        meeting: failed,
        type: 'failed',
      }
    }

    return {
      meeting,
      type: 'ignored',
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
    }, 40499)
  }

  await Promise.allSettled([
    emitRealtimeEvent({
      type: payload.type === 'participant' ? 'meeting.participant.updated' : 'meeting.state.updated',
      workspaceId: payload.meeting.workspaceId,
      projectId: payload.meeting.projectId,
      payload: {
        meetingId: payload.meeting.id,
        participantId: payload.type === 'participant' ? payload.participant?.id : undefined,
      },
    }),
  ])

  return ok({
    accepted: true,
    type: payload.type,
    meetingId: payload.meeting.id,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
