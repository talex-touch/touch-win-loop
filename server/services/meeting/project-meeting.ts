import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  AuthUser,
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingMode,
  ProjectMeetingParticipant,
  ProjectMeetingUtterance,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { getMeetingAsrGateway } from '~~/server/services/meeting/asr-gateway'
import {
  buildMeetingParticipantIdentity,
  getRtcProviderGateway,
} from '~~/server/services/meeting/rtc-provider'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  appendProjectMeetingUtterance,
  createProjectMeeting,
  enqueueProjectMeetingJob,
  getProjectMeetingById,
  getProjectMeetingDetail,
  getProjectMeetingParticipantByIdentity,
  listProjectMeetingParticipants,
  patchProjectMeeting,
  upsertProjectMeetingParticipant,
} from '~~/server/utils/project-meeting-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSpeakerLabel(value: unknown): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return 'Speaker'
  return normalized
}

function normalizeFallbackIdentity(label: string): string {
  return `fallback:${normalizeSpeakerLabel(label).toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'speaker'}`
}

export function buildDefaultProjectMeetingTitle(now = new Date()): string {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join(':')
  return `项目会议 ${date} ${time}`
}

export async function createProjectMeetingSession(
  db: Queryable,
  input: {
    projectId: string
    workspaceId: string
    user: AuthUser
    title?: string
    mode?: ProjectMeetingMode
    runtime?: RuntimeSettings
  },
): Promise<{
  meeting: ProjectMeeting
  detail: ProjectMeetingDetail
  joinToken: string
  joinExpiresAt: string
  joinUrl?: string
}> {
  const runtime = input.runtime || readRuntimeSettings()
  const rtc = getRtcProviderGateway(runtime)
  const asr = getMeetingAsrGateway(runtime)
  const meetingId = randomUUID()
  const title = normalizeString(input.title) || buildDefaultProjectMeetingTitle()
  const mode: ProjectMeetingMode = input.mode === 'audio' ? 'audio' : 'video'
  const room = await rtc.createRoom({
    projectId: input.projectId,
    meetingId,
    title,
    mode,
  })

  const participantIdentity = buildMeetingParticipantIdentity(input.user.id)
  const join = await rtc.issueJoinToken({
    roomName: room.roomName,
    participantIdentity,
    participantName: input.user.username,
    metadata: {
      userId: input.user.id,
      username: input.user.username,
      projectId: input.projectId,
      meetingId,
      role: 'host',
    },
  })
  const [audioSubscription, recordingSession, asrSession] = await Promise.all([
    rtc.subscribeOrEgressAudio({
      roomName: room.roomName,
      meetingId,
    }),
    rtc.startRecording({
      roomName: room.roomName,
      meetingId,
    }),
    asr.startSession({
      roomName: room.roomName,
      meetingId,
    }),
  ])

  const meeting = await createProjectMeeting(db, {
    id: meetingId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    title,
    mode,
    provider: rtc.provider,
    providerRoomId: room.roomId,
    providerRoomName: room.roomName,
    startedByUserId: input.user.id,
    transcriptStatus: 'running',
    recordingStatus: 'requested',
    summaryStatus: 'idle',
    providerMetadata: {
      ...room.metadata,
      audioSubscription,
      recordingSession,
      asrSession,
    },
  })

  await upsertProjectMeetingParticipant(db, {
    meetingId,
    projectId: input.projectId,
    userId: input.user.id,
    providerIdentity: participantIdentity,
    displayName: input.user.username,
    role: 'host',
    joinedAt: meeting.startedAt,
    audioTrackState: 'active',
    videoTrackState: mode === 'video' ? 'active' : 'unknown',
    metadata: {
      isCreator: true,
    },
  })

  const detail = await getProjectMeetingDetail(db, {
    projectId: input.projectId,
    meetingId,
  })
  if (!detail)
    throw new Error('MEETING_CREATE_FAILED')

  return {
    meeting,
    detail,
    joinToken: join.token,
    joinExpiresAt: join.expiresAt,
    joinUrl: join.joinUrl,
  }
}

export async function buildProjectMeetingJoinSession(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    user: AuthUser
    runtime?: RuntimeSettings
  },
): Promise<{
  meeting: ProjectMeetingDetail
  joinToken: string
  joinExpiresAt: string
  joinUrl?: string
}> {
  const runtime = input.runtime || readRuntimeSettings()
  const meeting = await getProjectMeetingDetail(db, {
    projectId: input.projectId,
    meetingId: input.meetingId,
  })
  if (!meeting)
    throw new Error('MEETING_NOT_FOUND')
  if (meeting.status !== 'active')
    throw new Error('MEETING_ALREADY_ENDED')

  const rtc = getRtcProviderGateway(runtime)
  const participantIdentity = buildMeetingParticipantIdentity(input.user.id)
  const join = await rtc.issueJoinToken({
    roomName: meeting.providerRoomName,
    participantIdentity,
    participantName: input.user.username,
    metadata: {
      userId: input.user.id,
      username: input.user.username,
      projectId: input.projectId,
      meetingId: input.meetingId,
      role: 'member',
    },
  })

  await upsertProjectMeetingParticipant(db, {
    meetingId: input.meetingId,
    projectId: input.projectId,
    userId: input.user.id,
    providerIdentity: participantIdentity,
    displayName: input.user.username,
    role: input.user.id === meeting.startedByUserId ? 'host' : 'member',
    joinedAt: new Date().toISOString(),
    audioTrackState: 'active',
    metadata: {
      joinedViaApi: true,
    },
  })

  const refreshed = await getProjectMeetingDetail(db, {
    projectId: input.projectId,
    meetingId: input.meetingId,
  })
  if (!refreshed)
    throw new Error('MEETING_NOT_FOUND')

  return {
    meeting: refreshed,
    joinToken: join.token,
    joinExpiresAt: join.expiresAt,
    joinUrl: join.joinUrl,
  }
}

export async function endProjectMeetingSession(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    runtime?: RuntimeSettings
  },
): Promise<ProjectMeetingDetail> {
  const runtime = input.runtime || readRuntimeSettings()
  const meeting = await getProjectMeetingById(db, {
    projectId: input.projectId,
    meetingId: input.meetingId,
  })
  if (!meeting)
    throw new Error('MEETING_NOT_FOUND')

  const endedAt = meeting.endedAt || new Date().toISOString()
  await patchProjectMeeting(db, {
    projectId: input.projectId,
    meetingId: input.meetingId,
    status: 'ended',
    transcriptStatus: 'completed',
    summaryStatus: 'queued',
    endedAt,
    providerMetadata: {
      endedBySystemAt: endedAt,
    },
  })

  await enqueueProjectMeetingJob(db, {
    meetingId: input.meetingId,
    jobType: 'transcript_finalize',
    maxAttempt: runtime.meeting.worker.maxAttempts,
  })
  await enqueueProjectMeetingJob(db, {
    meetingId: input.meetingId,
    jobType: 'meeting_summary',
    maxAttempt: runtime.meeting.worker.maxAttempts,
  })

  const detail = await getProjectMeetingDetail(db, {
    projectId: input.projectId,
    meetingId: input.meetingId,
  })
  if (!detail)
    throw new Error('MEETING_NOT_FOUND')
  return detail
}

export async function resolveMeetingCaptionParticipant(
  db: Queryable,
  input: {
    meeting: ProjectMeeting
    participantIdentity?: string
    displayName?: string
    speakerLabel?: string
  },
): Promise<ProjectMeetingParticipant | null> {
  const participantIdentity = normalizeString(input.participantIdentity)
  if (participantIdentity) {
    const existing = await getProjectMeetingParticipantByIdentity(db, {
      meetingId: input.meeting.id,
      providerIdentity: participantIdentity,
    })
    if (existing)
      return existing

    return upsertProjectMeetingParticipant(db, {
      meetingId: input.meeting.id,
      projectId: input.meeting.projectId,
      providerIdentity: participantIdentity,
      displayName: normalizeString(input.displayName) || participantIdentity,
      role: 'guest',
      audioTrackState: 'active',
      metadata: {
        autoCreatedByCaption: true,
      },
    })
  }

  const speakerLabel = normalizeSpeakerLabel(input.speakerLabel || 'Speaker')
  const fallbackIdentity = normalizeFallbackIdentity(speakerLabel)
  const existingFallback = await getProjectMeetingParticipantByIdentity(db, {
    meetingId: input.meeting.id,
    providerIdentity: fallbackIdentity,
  })
  if (existingFallback)
    return existingFallback

  return upsertProjectMeetingParticipant(db, {
    meetingId: input.meeting.id,
    projectId: input.meeting.projectId,
    providerIdentity: fallbackIdentity,
    displayName: speakerLabel,
    role: 'unknown',
    audioTrackState: 'active',
    metadata: {
      awaitingMapping: true,
    },
  })
}

export async function persistProjectMeetingCaption(
  db: Queryable,
  input: {
    meeting: ProjectMeeting
    participantIdentity?: string
    displayName?: string
    speakerLabel?: string
    text: string
    language?: string
    confidence?: number
    startedAtMs?: number
    endedAtMs?: number
    isFinal?: boolean
    eventId?: string
  },
): Promise<{
  participant: ProjectMeetingParticipant | null
  utterance: ProjectMeetingUtterance | null
  participants: ProjectMeetingParticipant[]
}> {
  const participant = await resolveMeetingCaptionParticipant(db, {
    meeting: input.meeting,
    participantIdentity: input.participantIdentity,
    displayName: input.displayName,
    speakerLabel: input.speakerLabel,
  })

  if (input.isFinal === false) {
    const participants = await listProjectMeetingParticipants(db, {
      meetingId: input.meeting.id,
    })
    return {
      participant,
      utterance: null,
      participants,
    }
  }

  const speakerName = normalizeString(participant?.displayName || input.displayName || input.speakerLabel || 'Speaker')
  const speakerLabel = normalizeString(input.speakerLabel || participant?.displayName || speakerName)
  const utterance = await appendProjectMeetingUtterance(db, {
    meetingId: input.meeting.id,
    participantId: participant?.id || null,
    speakerUserId: participant?.userId || null,
    speakerName,
    speakerLabel,
    startedAtMs: Number(input.startedAtMs || 0),
    endedAtMs: Number(input.endedAtMs || input.startedAtMs || 0),
    text: normalizeString(input.text),
    language: normalizeString(input.language),
    confidence: input.confidence,
    isFinal: true,
    providerEventKey: normalizeString(input.eventId) || null,
  })

  const participants = await listProjectMeetingParticipants(db, {
    meetingId: input.meeting.id,
  })

  return {
    participant,
    utterance,
    participants,
  }
}
