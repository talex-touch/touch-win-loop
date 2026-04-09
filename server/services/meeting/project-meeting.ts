import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  AuthUser,
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingGuestJoinSession,
  ProjectMeetingGuestShare,
  ProjectMeetingInvitee,
  ProjectMeetingMode,
  ProjectMeetingParticipant,
  ProjectMeetingParticipantRole,
  ProjectMeetingUtterance,
  SharedProjectMeetingParticipant,
  SharedProjectMeetingSnapshot,
  SharedProjectMeetingUtterance,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { getMeetingAsrGateway } from '~~/server/services/meeting/asr-gateway'
import { createMeetingGuestToken, verifyMeetingGuestToken } from '~~/server/services/meeting/meeting-guest-token'
import {
  buildMeetingParticipantIdentity,
  getRtcProviderGateway,
} from '~~/server/services/meeting/rtc-provider'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getProjectMemberManagementSnapshot } from '~~/server/utils/platform-store'
import {
  createProjectMeetingGuestShare,
  getActiveProjectMeetingGuestShareByMeeting,
  getProjectMeetingGuestShareById,
  getProjectMeetingGuestShareByShareKey,
  revokeActiveProjectMeetingGuestShareByMeeting,
  revokeProjectMeetingGuestShare,
} from '~~/server/utils/project-meeting-guest-share-store'
import {
  appendProjectMeetingUtterance,
  createProjectMeeting,
  enqueueProjectMeetingJob,
  getProjectMeetingDetail,
  getProjectMeetingDetailByMeetingId,
  getProjectMeetingParticipantByIdentity,
  listProjectMeetingParticipants,
  listProjectMeetingUtterances,
  patchProjectMeeting,
  replaceProjectMeetingInvitees,
  upsertProjectMeetingParticipant,
} from '~~/server/utils/project-meeting-store'
import { closeRealtimeMeetingGuestPeers } from '~~/server/utils/realtime-hub'

interface ProjectMeetingSessionPayload {
  meeting: ProjectMeetingDetail
  rtcJoinToken: string
  rtcJoinExpiresAt: string
  rtcServerUrl?: string
  rtcJoinUrl?: string
  joinToken: string
  joinExpiresAt: string
  joinUrl?: string
}

interface ValidatedMeetingGuestToken {
  meeting: ProjectMeetingDetail
  share: ProjectMeetingGuestShare
  guestDisplayName: string
  providerIdentity: string
}

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

function normalizeDisplayName(value: unknown, fallback = 'Guest'): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ')
  if (!normalized)
    return fallback
  return normalized.slice(0, 60)
}

function buildRtcParticipantAlias(role: 'host' | 'member' | 'guest'): string {
  if (role === 'host')
    return 'host'
  if (role === 'member')
    return 'member'
  return 'guest'
}

function buildRtcParticipantMetadata(role: 'host' | 'member' | 'guest'): Record<string, unknown> {
  return {
    role,
  }
}

function isTimestampInPast(value: string | null | undefined): boolean {
  const normalized = normalizeString(value)
  if (!normalized)
    return false
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()))
    return false
  return parsed.getTime() <= Date.now()
}

function buildRtcServerUrl(runtime: RuntimeSettings): string {
  return normalizeString(runtime.meeting.rtc.serverUrl)
}

function buildLegacyJoinPayload(join: {
  token: string
  expiresAt: string
  joinUrl?: string
}, runtime: RuntimeSettings): Omit<ProjectMeetingSessionPayload, 'meeting'> {
  return {
    rtcJoinToken: join.token,
    rtcJoinExpiresAt: join.expiresAt,
    rtcServerUrl: buildRtcServerUrl(runtime) || undefined,
    rtcJoinUrl: join.joinUrl,
    joinToken: join.token,
    joinExpiresAt: join.expiresAt,
    joinUrl: join.joinUrl,
  }
}

function resolveMeetingTypeTitle(mode: ProjectMeetingMode, external = false): string {
  if (external)
    return mode === 'audio' ? '外部语音会议' : '外部视频会议'
  return mode === 'audio' ? '项目语音会议' : '项目视频会议'
}

function toFiniteMs(value: string | null | undefined): number {
  const normalized = normalizeString(value)
  if (!normalized)
    return 0
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()))
    return 0
  return parsed.getTime()
}

function computeDurationMinutes(startAt: string | null | undefined, endAt: string | null | undefined): number {
  const startMs = toFiniteMs(startAt)
  const endMs = toFiniteMs(endAt)
  if (startMs <= 0 || endMs <= startMs)
    return 0
  return Math.ceil((endMs - startMs) / 60000)
}

function resolveSchedule(input: {
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
}): {
  scheduledStartAt: string | null
  scheduledEndAt: string | null
  durationMinutes: number
  status: 'scheduled' | 'active'
} {
  const scheduledStartAt = normalizeString(input.scheduledStartAt) || null
  const scheduledEndAt = normalizeString(input.scheduledEndAt) || null
  const durationMinutes = computeDurationMinutes(scheduledStartAt, scheduledEndAt)

  if (scheduledStartAt && scheduledEndAt) {
    if (toFiniteMs(scheduledEndAt) <= toFiniteMs(scheduledStartAt))
      throw new Error('MEETING_INVALID_SCHEDULE')
  }

  const status = scheduledStartAt && toFiniteMs(scheduledStartAt) > Date.now()
    ? 'scheduled'
    : 'active'

  return {
    scheduledStartAt,
    scheduledEndAt,
    durationMinutes,
    status,
  }
}

async function resolveMeetingPlanTier(
  db: Queryable,
  workspaceId: string,
): Promise<'personal_team' | 'business_team'> {
  const result = await db.query<{ type: string }>(
    `SELECT type
     FROM workspaces
     WHERE id = $1
     LIMIT 1`,
    [normalizeString(workspaceId)],
  )
  return normalizeString(result.rows[0]?.type) === 'personal' ? 'personal_team' : 'business_team'
}

async function validateMeetingDurationLimit(
  db: Queryable,
  workspaceId: string,
  durationMinutes: number,
): Promise<void> {
  if (durationMinutes <= 0)
    return
  const planTier = await resolveMeetingPlanTier(db, workspaceId)
  const maxMinutes = planTier === 'personal_team' ? 15 : 24 * 60
  if (durationMinutes > maxMinutes)
    throw new Error('MEETING_DURATION_EXCEEDED')
}

async function assertProjectMemberAccess(
  db: Queryable,
  projectId: string,
  user: AuthUser,
): Promise<Set<string>> {
  const snapshot = await getProjectMemberManagementSnapshot(db, projectId)
  if (!snapshot)
    throw new Error('PROJECT_NOT_FOUND')

  const memberIds = new Set(snapshot.members.map(item => normalizeString(item.userId)).filter(Boolean))
  if (!user.isPlatformAdmin && !memberIds.has(normalizeString(user.id)))
    throw new Error('FORBIDDEN')
  return memberIds
}

function assertMeetingHost(
  meeting: ProjectMeetingDetail,
  user: AuthUser,
): void {
  if (user.isPlatformAdmin)
    return
  if (normalizeString(meeting.startedByUserId) !== normalizeString(user.id))
    throw new Error('FORBIDDEN')
}

async function provisionProjectMeetingSession(
  input: {
    projectId: string
    meetingId: string
    title: string
    mode: ProjectMeetingMode
    user: AuthUser
    runtime: RuntimeSettings
  },
): Promise<{
  provider: string
  providerRoomId: string
  providerRoomName: string
  providerMetadata: Record<string, unknown>
  hostParticipantIdentity: string
  join: {
    token: string
    expiresAt: string
    joinUrl?: string
  }
}> {
  const rtc = getRtcProviderGateway(input.runtime)
  const asr = getMeetingAsrGateway(input.runtime)
  const room = await rtc.createRoom({
    projectId: input.projectId,
    meetingId: input.meetingId,
    title: input.title,
    mode: input.mode,
  })

  const hostParticipantIdentity = buildMeetingParticipantIdentity(input.user.id)
  const join = await rtc.issueJoinToken({
    roomName: room.roomName,
    participantIdentity: hostParticipantIdentity,
    participantName: buildRtcParticipantAlias('host'),
    metadata: buildRtcParticipantMetadata('host'),
  })

  const [audioSubscription, recordingSession, asrSession] = await Promise.all([
    rtc.subscribeOrEgressAudio({
      roomName: room.roomName,
      meetingId: input.meetingId,
    }),
    rtc.startRecording({
      roomName: room.roomName,
      meetingId: input.meetingId,
    }),
    asr.startSession({
      roomName: room.roomName,
      meetingId: input.meetingId,
    }),
  ])

  return {
    provider: rtc.provider,
    providerRoomId: room.roomId,
    providerRoomName: room.roomName,
    providerMetadata: {
      ...room.metadata,
      audioSubscription,
      recordingSession,
      asrSession,
    },
    hostParticipantIdentity,
    join,
  }
}

async function upsertHostMeetingParticipant(
  db: Queryable,
  input: {
    meeting: ProjectMeeting
    user: AuthUser
    providerIdentity: string
    joinedAt?: string
  },
): Promise<ProjectMeetingParticipant> {
  return upsertProjectMeetingParticipant(db, {
    meetingId: input.meeting.id,
    projectId: input.meeting.projectId,
    userId: input.user.id,
    providerIdentity: input.providerIdentity,
    displayName: input.user.username,
    role: 'host',
    joinedAt: input.joinedAt || input.meeting.startedAt,
    audioTrackState: 'active',
    videoTrackState: input.meeting.mode === 'video' ? 'active' : 'unknown',
    metadata: {
      isCreator: true,
    },
  })
}

async function replaceMeetingInvitees(
  db: Queryable,
  input: {
    meetingId: string
    projectId: string
    user: AuthUser
    invitedUserIds: string[]
    memberIds: Set<string>
  },
): Promise<void> {
  const normalizedInvitees = Array.from(new Set(
    input.invitedUserIds
      .map(item => normalizeString(item))
      .filter(Boolean),
  ))

  for (const userId of normalizedInvitees) {
    if (!input.memberIds.has(userId))
      throw new Error('MEETING_INVITEE_NOT_PROJECT_MEMBER')
  }

  await replaceProjectMeetingInvitees(db, {
    meetingId: input.meetingId,
    projectId: input.projectId,
    invitees: normalizedInvitees.map(userId => ({
      userId,
      role: userId === normalizeString(input.user.id) ? 'host' : 'member',
    })),
  })
}

async function buildMeetingDetailOrThrow(
  db: Queryable,
  projectId: string,
  meetingId: string,
): Promise<ProjectMeetingDetail> {
  const detail = await getProjectMeetingDetail(db, {
    projectId,
    meetingId,
  })
  if (!detail)
    throw new Error('MEETING_NOT_FOUND')
  return detail
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
): Promise<ProjectMeetingSessionPayload> {
  const payload = await createProjectMeetingRecord(db, {
    ...input,
    invitedUserIds: [input.user.id],
    scheduledStartAt: new Date().toISOString(),
    scheduledEndAt: null,
  })

  if (!payload.rtcJoinToken || !payload.rtcJoinExpiresAt)
    throw new Error('MEETING_CREATE_FAILED')

  return {
    meeting: payload.meeting,
    rtcJoinToken: payload.rtcJoinToken,
    rtcJoinExpiresAt: payload.rtcJoinExpiresAt,
    rtcServerUrl: payload.rtcServerUrl,
    rtcJoinUrl: payload.rtcJoinUrl,
    joinToken: payload.joinToken,
    joinExpiresAt: payload.joinExpiresAt,
    joinUrl: payload.joinUrl,
  }
}

export async function createProjectMeetingRecord(
  db: Queryable,
  input: {
    projectId: string
    workspaceId: string
    user: AuthUser
    title?: string
    mode?: ProjectMeetingMode
    invitedUserIds?: string[]
    scheduledStartAt?: string | null
    scheduledEndAt?: string | null
    runtime?: RuntimeSettings
  },
): Promise<{
  meeting: ProjectMeetingDetail
  rtcJoinToken?: string
  rtcJoinExpiresAt?: string
  rtcServerUrl?: string
  rtcJoinUrl?: string
  joinToken?: string
  joinExpiresAt?: string
  joinUrl?: string
}> {
  const runtime = input.runtime || readRuntimeSettings()
  const memberIds = await assertProjectMemberAccess(db, input.projectId, input.user)
  const title = normalizeString(input.title) || buildDefaultProjectMeetingTitle()
  const mode: ProjectMeetingMode = input.mode === 'audio' ? 'audio' : 'video'
  const schedule = resolveSchedule({
    scheduledStartAt: input.scheduledStartAt,
    scheduledEndAt: input.scheduledEndAt,
  })
  await validateMeetingDurationLimit(db, input.workspaceId, schedule.durationMinutes)

  const meetingId = randomUUID()
  await createProjectMeeting(db, {
    id: meetingId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    title,
    mode,
    provider: getRtcProviderGateway(runtime).provider,
    providerRoomId: '',
    providerRoomName: '',
    status: schedule.status,
    scheduledStartAt: schedule.scheduledStartAt,
    scheduledEndAt: schedule.scheduledEndAt,
    durationMinutes: schedule.durationMinutes,
    startedByUserId: input.user.id,
    startedAt: new Date().toISOString(),
    transcriptStatus: schedule.status === 'active' ? 'running' : 'idle',
    recordingStatus: schedule.status === 'active' ? 'requested' : 'idle',
    summaryStatus: 'idle',
    providerMetadata: {},
  })

  await replaceMeetingInvitees(db, {
    meetingId,
    projectId: input.projectId,
    user: input.user,
    invitedUserIds: Array.isArray(input.invitedUserIds) ? input.invitedUserIds : [],
    memberIds,
  })

  if (schedule.status === 'scheduled') {
    return {
      meeting: await buildMeetingDetailOrThrow(db, input.projectId, meetingId),
    }
  }

  const provisioned = await provisionProjectMeetingSession({
    projectId: input.projectId,
    meetingId,
    title,
    mode,
    user: input.user,
    runtime,
  })
  const activated = await patchProjectMeeting(db, {
    projectId: input.projectId,
    meetingId,
    providerRoomId: provisioned.providerRoomId,
    providerRoomName: provisioned.providerRoomName,
    transcriptStatus: 'running',
    recordingStatus: 'requested',
    summaryStatus: 'idle',
    providerMetadata: provisioned.providerMetadata,
  })

  await upsertHostMeetingParticipant(db, {
    meeting: activated,
    user: input.user,
    providerIdentity: provisioned.hostParticipantIdentity,
    joinedAt: activated.startedAt,
  })

  const detail = await buildMeetingDetailOrThrow(db, input.projectId, meetingId)
  return {
    meeting: detail,
    ...buildLegacyJoinPayload(provisioned.join, runtime),
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
): Promise<ProjectMeetingSessionPayload> {
  const runtime = input.runtime || readRuntimeSettings()
  await assertProjectMemberAccess(db, input.projectId, input.user)
  const meeting = await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId)
  if (meeting.status !== 'active')
    throw new Error('MEETING_ALREADY_ENDED')
  if (!normalizeString(meeting.providerRoomName))
    throw new Error('MEETING_NOT_STARTED')

  const rtc = getRtcProviderGateway(runtime)
  const participantIdentity = buildMeetingParticipantIdentity(input.user.id)
  const join = await rtc.issueJoinToken({
    roomName: meeting.providerRoomName,
    participantIdentity,
    participantName: buildRtcParticipantAlias(input.user.id === meeting.startedByUserId ? 'host' : 'member'),
    metadata: buildRtcParticipantMetadata(input.user.id === meeting.startedByUserId ? 'host' : 'member'),
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
    videoTrackState: meeting.mode === 'video' ? 'active' : 'unknown',
    metadata: {
      joinedViaApi: true,
    },
  })

  return {
    meeting: await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId),
    ...buildLegacyJoinPayload(join, runtime),
  }
}

export async function endProjectMeetingSession(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    user?: AuthUser
    runtime?: RuntimeSettings
  },
): Promise<ProjectMeetingDetail> {
  const runtime = input.runtime || readRuntimeSettings()
  const meeting = await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId)
  if (input.user)
    assertMeetingHost(meeting, input.user)
  if (meeting.status !== 'active')
    throw new Error('MEETING_NOT_ACTIVE')

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

  await revokeActiveProjectMeetingGuestShareByMeeting(db, input.meetingId)
  closeRealtimeMeetingGuestPeers({
    meetingId: input.meetingId,
    reason: 'meeting_ended',
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

  return buildMeetingDetailOrThrow(db, input.projectId, input.meetingId)
}

export async function joinProjectMeetingSession(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    user: AuthUser
    runtime?: RuntimeSettings
  },
): Promise<ProjectMeetingSessionPayload> {
  const meeting = await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId)
  if (meeting.status === 'scheduled')
    throw new Error('MEETING_NOT_STARTED')
  return buildProjectMeetingJoinSession(db, input)
}

export async function startProjectMeetingSession(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    user: AuthUser
    runtime?: RuntimeSettings
  },
): Promise<ProjectMeetingSessionPayload> {
  const runtime = input.runtime || readRuntimeSettings()
  await assertProjectMemberAccess(db, input.projectId, input.user)
  const meeting = await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId)
  assertMeetingHost(meeting, input.user)
  if (meeting.status !== 'scheduled')
    throw new Error('MEETING_CANNOT_START')

  const activatedAt = new Date().toISOString()
  const provisioned = await provisionProjectMeetingSession({
    projectId: input.projectId,
    meetingId: input.meetingId,
    title: meeting.title,
    mode: meeting.mode,
    user: input.user,
    runtime,
  })

  const updatedMeeting = await patchProjectMeeting(db, {
    projectId: input.projectId,
    meetingId: input.meetingId,
    status: 'active',
    providerRoomId: provisioned.providerRoomId,
    providerRoomName: provisioned.providerRoomName,
    transcriptStatus: 'running',
    recordingStatus: 'requested',
    summaryStatus: 'idle',
    startedAt: activatedAt,
    providerMetadata: provisioned.providerMetadata,
  })

  await upsertHostMeetingParticipant(db, {
    meeting: updatedMeeting,
    user: input.user,
    providerIdentity: provisioned.hostParticipantIdentity,
    joinedAt: activatedAt,
  })

  return {
    meeting: await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId),
    ...buildLegacyJoinPayload(provisioned.join, runtime),
  }
}

function createGuestProviderIdentity(meetingId: string): string {
  return `guest:${meetingId}:${randomUUID().slice(0, 8)}`
}

function buildMaskedParticipantLabel(
  role: ProjectMeetingParticipantRole,
  counters: {
    member: number
    guest: number
    unknown: number
  },
): string {
  if (role === 'host')
    return '主持人'
  if (role === 'member') {
    counters.member += 1
    return `成员 ${counters.member}`
  }
  if (role === 'guest') {
    counters.guest += 1
    return `来宾 ${counters.guest}`
  }
  if (role === 'system')
    return '系统'
  counters.unknown += 1
  return `发言人 ${counters.unknown}`
}

function buildSharedParticipantMaskState(input: {
  participants: ProjectMeetingParticipant[]
  invitees?: ProjectMeetingInvitee[]
}): {
  participants: SharedProjectMeetingParticipant[]
  labelByParticipantId: Map<string, string>
  labelBySpeakerUserId: Map<string, string>
} {
  const participantsSource: Array<{
    id: string
    role: ProjectMeetingParticipantRole
    audioTrackState: ProjectMeetingParticipant['audioTrackState']
    videoTrackState: ProjectMeetingParticipant['videoTrackState']
    joinedAt?: string | null
    leftAt?: string | null
  }> = input.participants.length > 0
    ? input.participants.map(item => ({
        id: item.id,
        role: item.role,
        audioTrackState: item.audioTrackState,
        videoTrackState: item.videoTrackState,
        joinedAt: item.joinedAt,
        leftAt: item.leftAt,
      }))
    : (input.invitees || []).map(item => ({
        id: item.id,
        role: item.role,
        audioTrackState: 'unknown',
        videoTrackState: 'unknown',
        joinedAt: null,
        leftAt: null,
      }))

  const counters = {
    member: 0,
    guest: 0,
    unknown: 0,
  }
  const labelByParticipantId = new Map<string, string>()
  const labelBySpeakerUserId = new Map<string, string>()
  const participants: SharedProjectMeetingParticipant[] = participantsSource.map((item) => {
    const displayName = buildMaskedParticipantLabel(item.role, counters)
    labelByParticipantId.set(item.id, displayName)
    return {
      id: item.id,
      displayName,
      role: item.role,
      audioTrackState: item.audioTrackState,
      videoTrackState: item.videoTrackState,
      joinedAt: item.joinedAt,
      leftAt: item.leftAt,
    }
  })

  for (const item of input.participants) {
    const label = labelByParticipantId.get(item.id)
    if (!label)
      continue
    if (item.userId)
      labelBySpeakerUserId.set(item.userId, label)
  }

  return {
    participants,
    labelByParticipantId,
    labelBySpeakerUserId,
  }
}

export function resolveMaskedProjectMeetingSpeakerLabel(input: {
  participants: ProjectMeetingParticipant[]
  invitees?: ProjectMeetingInvitee[]
  participantId?: string | null
  speakerUserId?: string | null
  speakerLabel?: string | null
  speakerName?: string | null
}): string {
  const maskState = buildSharedParticipantMaskState({
    participants: input.participants,
    invitees: input.invitees,
  })

  const participantId = normalizeString(input.participantId)
  if (participantId) {
    const matched = maskState.labelByParticipantId.get(participantId)
    if (matched)
      return matched
  }

  const speakerUserId = normalizeString(input.speakerUserId)
  if (speakerUserId) {
    const matched = maskState.labelBySpeakerUserId.get(speakerUserId)
    if (matched)
      return matched
  }

  const fallback = normalizeString(input.speakerLabel || input.speakerName)
  if (fallback.toLowerCase() === 'system')
    return '系统'

  return '发言人'
}

export function buildSharedProjectMeetingSnapshot(
  meeting: ProjectMeetingDetail,
  utterances: ProjectMeetingUtterance[],
  share?: ProjectMeetingGuestShare | null,
): SharedProjectMeetingSnapshot {
  const maskState = buildSharedParticipantMaskState({
    participants: meeting.participants,
    invitees: meeting.invitees,
  })

  const fallbackUnknownLabelByKey = new Map<string, string>()
  const sharedUtterances: SharedProjectMeetingUtterance[] = utterances.map((item) => {
    let speakerLabel = item.participantId ? maskState.labelByParticipantId.get(item.participantId) || '' : ''
    if (!speakerLabel && item.speakerUserId)
      speakerLabel = maskState.labelBySpeakerUserId.get(item.speakerUserId) || ''
    if (!speakerLabel) {
      const fallbackKey = normalizeString(item.speakerLabel || item.speakerName || item.id)
      if (normalizeString(item.speakerLabel).toLowerCase() === 'system') {
        speakerLabel = '系统'
      }
      else if (fallbackUnknownLabelByKey.has(fallbackKey)) {
        speakerLabel = fallbackUnknownLabelByKey.get(fallbackKey) || ''
      }
      else {
        speakerLabel = `发言人 ${fallbackUnknownLabelByKey.size + 1}`
        fallbackUnknownLabelByKey.set(fallbackKey, speakerLabel)
      }
    }

    return {
      id: item.id,
      participantId: item.participantId,
      speakerLabel,
      sequenceNo: item.sequenceNo,
      startedAtMs: item.startedAtMs,
      endedAtMs: item.endedAtMs,
      text: item.text,
      language: item.language,
      confidence: item.confidence,
      isFinal: item.isFinal,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
  })

  return {
    meetingId: meeting.id,
    title: resolveMeetingTypeTitle(meeting.mode, true),
    mode: meeting.mode,
    status: meeting.status,
    scheduledStartAt: meeting.scheduledStartAt || null,
    scheduledEndAt: meeting.scheduledEndAt || null,
    durationMinutes: meeting.durationMinutes || 0,
    participantCount: maskState.participants.length,
    shareExpiresAt: share?.expiresAt || undefined,
    participants: maskState.participants,
    utterances: sharedUtterances,
  }
}

async function validateActiveGuestShare(
  db: Queryable,
  share: ProjectMeetingGuestShare | null,
): Promise<{
  share: ProjectMeetingGuestShare
  meeting: ProjectMeetingDetail
}> {
  if (!share)
    throw new Error('MEETING_SHARE_NOT_FOUND')
  if (share.revokedAt)
    throw new Error('MEETING_SHARE_REVOKED')
  if (isTimestampInPast(share.expiresAt))
    throw new Error('MEETING_SHARE_EXPIRED')

  const meeting = await getProjectMeetingDetailByMeetingId(db, share.meetingId)
  if (!meeting)
    throw new Error('MEETING_NOT_FOUND')
  if (meeting.status === 'ended' || meeting.status === 'failed')
    throw new Error('MEETING_SHARE_UNAVAILABLE')

  return {
    share,
    meeting,
  }
}

export async function getProjectMeetingGuestShareForHost(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    user: AuthUser
  },
): Promise<ProjectMeetingGuestShare | null> {
  const meeting = await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId)
  assertMeetingHost(meeting, input.user)
  const share = await getActiveProjectMeetingGuestShareByMeeting(db, input.meetingId)
  if (!share)
    return null
  if (share.revokedAt || isTimestampInPast(share.expiresAt) || meeting.status === 'ended' || meeting.status === 'failed')
    return null
  return share
}

export async function getOrCreateProjectMeetingGuestShare(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    user: AuthUser
    regenerate?: boolean
  },
): Promise<ProjectMeetingGuestShare> {
  const meeting = await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId)
  assertMeetingHost(meeting, input.user)
  if (meeting.status === 'ended' || meeting.status === 'failed')
    throw new Error('MEETING_SHARE_UNAVAILABLE')

  const existing = await getActiveProjectMeetingGuestShareByMeeting(db, input.meetingId)
  if (existing && !existing.revokedAt && !isTimestampInPast(existing.expiresAt) && !input.regenerate)
    return existing

  if (existing) {
    await revokeProjectMeetingGuestShare(db, { shareId: existing.id })
    closeRealtimeMeetingGuestPeers({
      meetingId: input.meetingId,
      guestShareId: existing.id,
      reason: 'meeting_share_rotated',
    })
  }

  return createProjectMeetingGuestShare(db, {
    meeting,
    actorUserId: input.user.id,
  })
}

export async function revokeProjectMeetingGuestShareByHost(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    user: AuthUser
  },
): Promise<ProjectMeetingGuestShare | null> {
  const meeting = await buildMeetingDetailOrThrow(db, input.projectId, input.meetingId)
  assertMeetingHost(meeting, input.user)
  const revoked = await revokeActiveProjectMeetingGuestShareByMeeting(db, input.meetingId)
  if (revoked) {
    closeRealtimeMeetingGuestPeers({
      meetingId: input.meetingId,
      guestShareId: revoked.id,
      reason: 'meeting_share_revoked',
    })
  }
  return revoked
}

export async function getSharedProjectMeetingSnapshotByShareKey(
  db: Queryable,
  shareKey: string,
): Promise<SharedProjectMeetingSnapshot> {
  const { share, meeting } = await validateActiveGuestShare(
    db,
    await getProjectMeetingGuestShareByShareKey(db, shareKey),
  )
  const utterances = (await listProjectMeetingUtterances(db, {
    meetingId: meeting.id,
    finalsOnly: true,
  })).slice(-24)
  return buildSharedProjectMeetingSnapshot(meeting, utterances, share)
}

export async function joinSharedProjectMeetingSession(
  db: Queryable,
  input: {
    shareKey: string
    displayName: string
    runtime?: RuntimeSettings
  },
): Promise<ProjectMeetingGuestJoinSession> {
  const runtime = input.runtime || readRuntimeSettings()
  const { share, meeting } = await validateActiveGuestShare(
    db,
    await getProjectMeetingGuestShareByShareKey(db, input.shareKey),
  )
  if (meeting.status !== 'active')
    throw new Error('MEETING_NOT_STARTED')
  if (!normalizeString(meeting.providerRoomName))
    throw new Error('MEETING_NOT_STARTED')

  const rtc = getRtcProviderGateway(runtime)
  const providerIdentity = createGuestProviderIdentity(meeting.id)
  const guestDisplayName = normalizeDisplayName(input.displayName, '来宾')
  const join = await rtc.issueJoinToken({
    roomName: meeting.providerRoomName,
    participantIdentity: providerIdentity,
    participantName: buildRtcParticipantAlias('guest'),
    metadata: buildRtcParticipantMetadata('guest'),
  })

  await upsertProjectMeetingParticipant(db, {
    meetingId: meeting.id,
    projectId: meeting.projectId,
    providerIdentity,
    displayName: guestDisplayName,
    role: 'guest',
    joinedAt: new Date().toISOString(),
    audioTrackState: 'active',
    videoTrackState: meeting.mode === 'video' ? 'active' : 'unknown',
    metadata: {
      guest: true,
      joinedViaShareKey: share.id,
    },
  })

  const meetingGuest = createMeetingGuestToken({
    meetingId: meeting.id,
    shareId: share.id,
    guestDisplayName,
    providerIdentity,
  })
  const refreshed = await buildMeetingDetailOrThrow(db, meeting.projectId, meeting.id)
  const utterances = (await listProjectMeetingUtterances(db, {
    meetingId: meeting.id,
    finalsOnly: true,
  })).slice(-24)

  return {
    meetingId: meeting.id,
    meetingGuestToken: meetingGuest.token,
    meetingGuestExpiresAt: meetingGuest.expiresAt,
    rtcJoinToken: join.token,
    rtcJoinExpiresAt: join.expiresAt,
    rtcServerUrl: buildRtcServerUrl(runtime) || undefined,
    rtcJoinUrl: join.joinUrl,
    snapshot: buildSharedProjectMeetingSnapshot(refreshed, utterances, share),
  }
}

export async function resolveValidatedMeetingGuestToken(
  db: Queryable,
  token: string,
): Promise<ValidatedMeetingGuestToken | null> {
  const parsed = verifyMeetingGuestToken(token)
  if (!parsed)
    return null

  const share = await getProjectMeetingGuestShareById(db, parsed.shareId)
  if (!share)
    return null
  if (share.revokedAt || isTimestampInPast(share.expiresAt))
    return null
  if (normalizeString(share.meetingId) !== normalizeString(parsed.meetingId))
    return null

  const meeting = await getProjectMeetingDetailByMeetingId(db, parsed.meetingId)
  if (!meeting || meeting.status !== 'active')
    return null

  return {
    meeting,
    share,
    guestDisplayName: parsed.guestDisplayName,
    providerIdentity: parsed.providerIdentity,
  }
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
