import type { ProjectMeetingTrackState } from '~~/shared/types/domain'
import { readRawBody, setResponseStatus } from 'h3'
import { resolveMeetingRuntimeError } from '~~/server/services/meeting/meeting-runtime'
import { endProjectMeetingSession, finalizeProjectMeetingAsrSession } from '~~/server/services/meeting/project-meeting'
import { getRtcProviderGateway } from '~~/server/services/meeting/rtc-provider'
import { fail, ok } from '~~/server/utils/api'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readEffectiveMeetingRuntimeSettings } from '~~/server/utils/platform-meeting-config-store'
import {
  enqueueProjectMeetingJob,
  findProjectMeetingByProviderRoom,
  getProjectMeetingByMeetingId,
  getProjectMeetingParticipantByIdentity,
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
  screenShareTrackState?: string
  screenShareAudioTrackState?: string
  artifact?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

interface LiveKitWebhookBody {
  event?: string
  room?: Record<string, unknown>
  participant?: Record<string, unknown>
  track?: Record<string, unknown>
  egressInfo?: Record<string, unknown>
  egress_info?: Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function safeParseRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  if (typeof value !== 'string')
    return {}
  try {
    return normalizeRecord(JSON.parse(value))
  }
  catch {
    return {}
  }
}

function normalizeMeetingRole(value: unknown): string {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'host' || normalized === 'member' || normalized === 'guest' || normalized === 'system' || normalized === 'unknown')
    return normalized
  return ''
}

function resolveLiveKitTrackSource(value: unknown): 'audio' | 'video' | 'screen' | 'screen_audio' | '' {
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized)
    return ''
  if (normalized.includes('screen') && normalized.includes('audio'))
    return 'screen_audio'
  if (normalized.includes('screen'))
    return 'screen'
  if (normalized.includes('camera') || normalized.includes('video'))
    return 'video'
  if (normalized.includes('microphone') || normalized.includes('audio'))
    return 'audio'
  return ''
}

function resolveTrackStateFromWebhook(eventType: string, track: Record<string, unknown>): ProjectMeetingTrackState {
  const normalizedEventType = normalizeString(eventType).toLowerCase()
  if (track.muted === true)
    return 'muted'
  if (normalizedEventType === 'track_unpublished')
    return 'ended'
  return 'active'
}

function resolveRawBody(rawBody: string): Record<string, unknown> {
  const normalized = String(rawBody || '').trim()
  if (!normalized)
    return {}
  try {
    return normalizeRecord(JSON.parse(normalized))
  }
  catch {
    return {}
  }
}

function buildRecordingArtifactFromLiveKitEgress(egressInfo: Record<string, unknown>): Record<string, unknown> {
  const fileResult = normalizeRecord(normalizeArray(egressInfo.fileResults ?? egressInfo.file_results)[0])
  const location = normalizeString(fileResult.location ?? fileResult.filename ?? fileResult.filepath)
  const fileName = normalizeString(fileResult.filename)
  const fileType = normalizeString(fileResult.fileType ?? fileResult.file_type).toLowerCase()
  const mimeType = fileType === 'ogg'
    ? 'audio/ogg'
    : fileType === 'mp3'
      ? 'audio/mpeg'
      : fileType === 'm4a'
        ? 'audio/mp4'
        : fileType === 'webm'
          ? 'video/webm'
          : 'video/mp4'
  return {
    fileName: fileName || location || 'meeting-recording.mp4',
    mimeType,
    downloadUrl: /^https?:\/\//i.test(location) ? location : undefined,
    localFilePath: /^https?:\/\//i.test(location) ? undefined : location || undefined,
    metadata: {
      provider: 'livekit',
      egressId: normalizeString(egressInfo.egressId ?? egressInfo.egress_id),
      egressStatus: normalizeString(egressInfo.status),
      location,
    },
  }
}

function normalizeLiveKitWebhookBody(rawBody: Record<string, unknown>): ProviderEventBody {
  const room = normalizeRecord(rawBody.room)
  const participant = normalizeRecord(rawBody.participant)
  const track = normalizeRecord(rawBody.track)
  const egressInfo = normalizeRecord(rawBody.egressInfo ?? rawBody.egress_info)
  const roomMetadata = safeParseRecord(room.metadata)
  const participantMetadata = safeParseRecord(participant.metadata)
  const eventName = normalizeString(rawBody.event).toLowerCase()
  const meetingId = normalizeString(rawBody.meetingId ?? roomMetadata.meetingId)
  const provider = 'livekit'
  const roomId = normalizeString(room.sid ?? room.id ?? egressInfo.roomId ?? egressInfo.room_id)
  const roomName = normalizeString(room.name ?? egressInfo.roomName ?? egressInfo.room_name)

  if (eventName === 'participant_joined' || eventName === 'participant_left') {
    return {
      provider,
      eventType: eventName,
      meetingId,
      roomId,
      roomName,
      participantIdentity: normalizeString(participant.identity),
      participantId: normalizeString(participant.sid ?? participant.id),
      displayName: '',
      role: normalizeMeetingRole(participantMetadata.role),
      joinedAt: normalizeString(participant.joinedAt ?? participant.joined_at),
      leftAt: normalizeString(participant.leftAt ?? participant.left_at),
      metadata: {
        rawEvent: eventName,
      },
    }
  }

  if (eventName === 'track_published' || eventName === 'track_unpublished') {
    const source = resolveLiveKitTrackSource(track.source ?? track.type)
    const state = resolveTrackStateFromWebhook(eventName, track)
    return {
      provider,
      eventType: 'participant_track_updated',
      meetingId,
      roomId,
      roomName,
      participantIdentity: normalizeString(participant.identity),
      participantId: normalizeString(participant.sid ?? participant.id),
      displayName: '',
      role: normalizeMeetingRole(participantMetadata.role),
      audioTrackState: source === 'audio' ? state : '',
      videoTrackState: source === 'video' ? state : '',
      screenShareTrackState: source === 'screen' ? state : '',
      screenShareAudioTrackState: source === 'screen_audio' ? state : '',
      metadata: {
        rawEvent: eventName,
        trackSource: normalizeString(track.source ?? track.type),
        trackSid: normalizeString(track.sid ?? track.id),
      },
    }
  }

  if (eventName === 'egress_started' || eventName === 'egress_updated') {
    return {
      provider,
      eventType: 'recording_started',
      meetingId,
      roomId,
      roomName,
      artifact: buildRecordingArtifactFromLiveKitEgress(egressInfo),
      metadata: {
        rawEvent: eventName,
        egressInfo,
      },
    }
  }

  if (eventName === 'egress_ended') {
    const status = normalizeString(egressInfo.status).toLowerCase()
    const artifact = buildRecordingArtifactFromLiveKitEgress(egressInfo)
    return {
      provider,
      eventType: status.includes('complete') && (normalizeString(artifact.downloadUrl) || normalizeString(artifact.localFilePath))
        ? 'recording_ready'
        : 'recording_failed',
      meetingId,
      roomId,
      roomName,
      artifact,
      metadata: {
        rawEvent: eventName,
        egressInfo,
      },
    }
  }

  return {
    provider,
    eventType: eventName,
    meetingId,
    roomId,
    roomName,
    metadata: {
      rawEvent: eventName,
    },
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { runtime } = await readEffectiveMeetingRuntimeSettings(event)
  let rtc
  try {
    rtc = getRtcProviderGateway(runtime)
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
      }, 50399)
    }
    throw error
  }
  const rawBody = await readRawBody(event, 'utf8').catch(() => '')
  if (!rtc.verifyWebhook({ headers: event.node.req.headers as Record<string, unknown>, rawBody })) {
    setResponseStatus(event, 401)
    return fail('invalid meeting webhook signature', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40193)
  }

  const parsedBody = resolveRawBody(rawBody)
  const body = normalizeString(parsedBody.event) && !normalizeString(parsedBody.eventType)
    ? normalizeLiveKitWebhookBody(parsedBody as LiveKitWebhookBody)
    : parsedBody as ProviderEventBody
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

    if (eventType === 'participant_joined' || eventType === 'participant_left' || eventType === 'participant_track_updated') {
      const participantIdentity = normalizeString(body?.participantIdentity)
        || normalizeString(body?.participantId)
        || normalizeString(body?.displayName)
        || `provider-participant-${Date.now()}`
      const existingParticipant = await getProjectMeetingParticipantByIdentity(db, {
        meetingId: meeting.id,
        providerIdentity: participantIdentity,
      })
      const participant = await upsertProjectMeetingParticipant(db, {
        meetingId: meeting.id,
        projectId: meeting.projectId,
        providerIdentity: participantIdentity,
        providerParticipantId: normalizeString(body?.participantId),
        displayName: normalizeString(body?.displayName) || existingParticipant?.displayName || participantIdentity,
        role: normalizeMeetingRole(body?.role) as any || existingParticipant?.role || 'member',
        joinedAt: eventType === 'participant_joined' ? (normalizeString(body?.joinedAt) || new Date().toISOString()) : undefined,
        leftAt: eventType === 'participant_left' ? (normalizeString(body?.leftAt) || new Date().toISOString()) : undefined,
        audioTrackState: normalizeString(body?.audioTrackState) as any || (eventType === 'participant_left' ? 'ended' : eventType === 'participant_joined' ? 'active' : undefined),
        videoTrackState: normalizeString(body?.videoTrackState) as any || (eventType === 'participant_left' ? 'ended' : undefined),
        screenShareTrackState: normalizeString(body?.screenShareTrackState) as any || (eventType === 'participant_left' ? 'ended' : undefined),
        screenShareAudioTrackState: normalizeString(body?.screenShareAudioTrackState) as any || (eventType === 'participant_left' ? 'ended' : undefined),
        metadata: body?.metadata || {},
      })

      return {
        meeting,
        type: eventType === 'participant_track_updated' ? 'share' : 'participant',
        participant,
      }
    }

    if (eventType === 'recording_started') {
      const updated = await patchProjectMeeting(db, {
        projectId: meeting.projectId,
        meetingId: meeting.id,
        recordingStatus: 'processing',
        providerMetadata: {
          recordingArtifact: body?.artifact || {},
          recordingStartedAt: new Date().toISOString(),
          recordingWebhookMetadata: body?.metadata || {},
        },
      })
      return {
        meeting: updated,
        type: 'recording',
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

    if (eventType === 'recording_failed') {
      const failed = await patchProjectMeeting(db, {
        projectId: meeting.projectId,
        meetingId: meeting.id,
        recordingStatus: 'failed',
        providerMetadata: {
          recordingFailurePayload: body?.metadata || {},
          recordingFailedAt: new Date().toISOString(),
        },
      })
      return {
        meeting: failed,
        type: 'failed',
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

  if (payload.type === 'ended') {
    await withTransaction(event, async (db) => {
      await finalizeProjectMeetingAsrSession(db, {
        projectId: payload.meeting.projectId,
        meetingId: payload.meeting.id,
        runtime,
      })
    }).catch(() => undefined)
  }

  await Promise.allSettled([
    emitRealtimeEvent({
      type: payload.type === 'participant'
        ? 'meeting.participant.updated'
        : payload.type === 'share'
          ? 'meeting.share.updated'
          : 'meeting.state.updated',
      workspaceId: payload.meeting.workspaceId,
      projectId: payload.meeting.projectId,
      payload: {
        meetingId: payload.meeting.id,
        participantId: payload.type === 'participant' || payload.type === 'share' ? payload.participant?.id : undefined,
        screenShareTrackState: payload.type === 'share' ? payload.participant?.screenShareTrackState : undefined,
        screenShareAudioTrackState: payload.type === 'share' ? payload.participant?.screenShareAudioTrackState : undefined,
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
