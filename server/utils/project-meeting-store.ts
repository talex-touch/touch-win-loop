import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingJob,
  ProjectMeetingJobStatus,
  ProjectMeetingJobType,
  ProjectMeetingMode,
  ProjectMeetingParticipant,
  ProjectMeetingParticipantRole,
  ProjectMeetingRecordingStatus,
  ProjectMeetingStatus,
  ProjectMeetingSummaryStatus,
  ProjectMeetingTrackState,
  ProjectMeetingTranscriptStatus,
  ProjectMeetingUtterance,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ProjectMeetingRow {
  id: string
  project_id: string
  workspace_id: string
  title: string
  mode: ProjectMeetingMode
  provider: string
  provider_room_id: string
  provider_room_name: string
  status: ProjectMeetingStatus
  transcript_status: ProjectMeetingTranscriptStatus
  recording_status: ProjectMeetingRecordingStatus
  summary_status: ProjectMeetingSummaryStatus
  recording_resource_id: string | null
  notes_resource_id: string | null
  started_by_user_id: string
  started_at: string
  ended_at: string | null
  provider_metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface ProjectMeetingParticipantRow {
  id: string
  meeting_id: string
  project_id: string
  user_id: string | null
  provider_participant_id: string
  provider_identity: string
  display_name: string
  role: ProjectMeetingParticipantRole
  joined_at: string | null
  left_at: string | null
  audio_track_state: ProjectMeetingTrackState
  video_track_state: ProjectMeetingTrackState
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  username?: string | null
  avatar_url?: string | null
}

interface ProjectMeetingUtteranceRow {
  id: string
  meeting_id: string
  participant_id: string | null
  speaker_user_id: string | null
  speaker_name: string
  speaker_label: string
  sequence_no: string | number
  started_at_ms: string | number
  ended_at_ms: string | number
  text: string
  language: string
  confidence: string | number
  is_final: boolean
  provider_event_key: string | null
  created_at: string
  updated_at: string
}

interface ProjectMeetingJobRow {
  id: string
  meeting_id: string
  job_type: ProjectMeetingJobType
  status: ProjectMeetingJobStatus
  attempt: string | number
  max_attempt: string | number
  next_run_at: string
  error_message: string
  payload: Record<string, unknown> | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return parsed
}

function mapMeeting(row: ProjectMeetingRow): ProjectMeeting {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    title: normalizeString(row.title),
    mode: row.mode,
    provider: normalizeString(row.provider),
    providerRoomId: normalizeString(row.provider_room_id),
    providerRoomName: normalizeString(row.provider_room_name),
    status: row.status,
    transcriptStatus: row.transcript_status,
    recordingStatus: row.recording_status,
    summaryStatus: row.summary_status,
    recordingResourceId: normalizeString(row.recording_resource_id) || null,
    notesResourceId: normalizeString(row.notes_resource_id) || null,
    startedByUserId: row.started_by_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    providerMetadata: normalizeRecord(row.provider_metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapParticipant(row: ProjectMeetingParticipantRow): ProjectMeetingParticipant {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    projectId: row.project_id,
    userId: normalizeString(row.user_id) || null,
    username: normalizeString(row.username) || undefined,
    avatarUrl: row.avatar_url || null,
    providerParticipantId: normalizeString(row.provider_participant_id) || undefined,
    providerIdentity: normalizeString(row.provider_identity),
    displayName: normalizeString(row.display_name),
    role: row.role,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    audioTrackState: row.audio_track_state,
    videoTrackState: row.video_track_state,
    metadata: normalizeRecord(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapUtterance(row: ProjectMeetingUtteranceRow): ProjectMeetingUtterance {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    participantId: normalizeString(row.participant_id) || null,
    speakerUserId: normalizeString(row.speaker_user_id) || null,
    speakerName: normalizeString(row.speaker_name),
    speakerLabel: normalizeString(row.speaker_label),
    sequenceNo: Math.max(0, Math.trunc(toNumber(row.sequence_no, 0))),
    startedAtMs: Math.max(0, Math.trunc(toNumber(row.started_at_ms, 0))),
    endedAtMs: Math.max(0, Math.trunc(toNumber(row.ended_at_ms, 0))),
    text: normalizeString(row.text),
    language: normalizeString(row.language),
    confidence: Math.max(0, Math.min(1, toNumber(row.confidence, 0))),
    isFinal: Boolean(row.is_final),
    providerEventKey: normalizeString(row.provider_event_key) || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapJob(row: ProjectMeetingJobRow): ProjectMeetingJob {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    jobType: row.job_type,
    status: row.status,
    attempt: Math.max(0, Math.trunc(toNumber(row.attempt, 0))),
    maxAttempt: Math.max(1, Math.trunc(toNumber(row.max_attempt, 1))),
    nextRunAt: row.next_run_at,
    errorMessage: normalizeString(row.error_message),
    payload: normalizeRecord(row.payload),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const MEETING_BASE_SELECT = `
  SELECT
    id,
    project_id,
    workspace_id,
    title,
    mode,
    provider,
    provider_room_id,
    provider_room_name,
    status,
    transcript_status,
    recording_status,
    summary_status,
    recording_resource_id,
    notes_resource_id,
    started_by_user_id,
    started_at::TEXT,
    ended_at::TEXT,
    provider_metadata,
    created_at::TEXT,
    updated_at::TEXT
  FROM project_meetings`

export async function createProjectMeeting(
  db: Queryable,
  input: {
    id?: string
    projectId: string
    workspaceId: string
    title: string
    mode: ProjectMeetingMode
    provider: string
    providerRoomId: string
    providerRoomName: string
    startedByUserId: string
    providerMetadata?: Record<string, unknown>
    transcriptStatus?: ProjectMeetingTranscriptStatus
    recordingStatus?: ProjectMeetingRecordingStatus
    summaryStatus?: ProjectMeetingSummaryStatus
  },
): Promise<ProjectMeeting> {
  const id = normalizeString(input.id) || randomUUID()
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO project_meetings (
      id,
      project_id,
      workspace_id,
      title,
      mode,
      provider,
      provider_room_id,
      provider_room_name,
      status,
      transcript_status,
      recording_status,
      summary_status,
      started_by_user_id,
      started_at,
      provider_metadata,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, $12, $13, $14::JSONB, $15, $15
    )`,
    [
      id,
      input.projectId,
      input.workspaceId,
      normalizeString(input.title),
      input.mode,
      normalizeString(input.provider) || 'mock',
      normalizeString(input.providerRoomId),
      normalizeString(input.providerRoomName),
      input.transcriptStatus || 'idle',
      input.recordingStatus || 'idle',
      input.summaryStatus || 'idle',
      input.startedByUserId,
      now,
      JSON.stringify(normalizeRecord(input.providerMetadata)),
      now,
    ],
  )
  const meeting = await getProjectMeetingById(db, {
    projectId: input.projectId,
    meetingId: id,
  })
  if (!meeting)
    throw new Error('MEETING_CREATE_FAILED')
  return meeting
}

export async function listProjectMeetings(
  db: Queryable,
  input: {
    projectId: string
    limit?: number
  },
): Promise<ProjectMeeting[]> {
  const limit = Math.max(1, Math.min(50, Math.trunc(toNumber(input.limit, 12))))
  const result = await db.query<ProjectMeetingRow>(
    `${MEETING_BASE_SELECT}
     WHERE project_id = $1
     ORDER BY started_at DESC, created_at DESC
     LIMIT $2`,
    [input.projectId, limit],
  )
  return result.rows.map(mapMeeting)
}

export async function getProjectMeetingById(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
  },
): Promise<ProjectMeeting | null> {
  const result = await db.query<ProjectMeetingRow>(
    `${MEETING_BASE_SELECT}
     WHERE project_id = $1
       AND id = $2
     LIMIT 1`,
    [input.projectId, input.meetingId],
  )
  const row = result.rows[0]
  return row ? mapMeeting(row) : null
}

export async function getProjectMeetingByMeetingId(
  db: Queryable,
  meetingId: string,
): Promise<ProjectMeeting | null> {
  const result = await db.query<ProjectMeetingRow>(
    `${MEETING_BASE_SELECT}
     WHERE id = $1
     LIMIT 1`,
    [meetingId],
  )
  const row = result.rows[0]
  return row ? mapMeeting(row) : null
}

export async function findProjectMeetingByProviderRoom(
  db: Queryable,
  input: {
    provider: string
    providerRoomId?: string
    providerRoomName?: string
  },
): Promise<ProjectMeeting | null> {
  const roomId = normalizeString(input.providerRoomId)
  const roomName = normalizeString(input.providerRoomName)
  if (!roomId && !roomName)
    return null

  const result = await db.query<ProjectMeetingRow>(
    `${MEETING_BASE_SELECT}
     WHERE provider = $1
       AND (
         ($2::TEXT <> '' AND provider_room_id = $2)
         OR ($3::TEXT <> '' AND provider_room_name = $3)
       )
     ORDER BY started_at DESC
     LIMIT 1`,
    [normalizeString(input.provider) || 'mock', roomId, roomName],
  )

  const row = result.rows[0]
  return row ? mapMeeting(row) : null
}

export async function patchProjectMeeting(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
    status?: ProjectMeetingStatus
    transcriptStatus?: ProjectMeetingTranscriptStatus
    recordingStatus?: ProjectMeetingRecordingStatus
    summaryStatus?: ProjectMeetingSummaryStatus
    recordingResourceId?: string | null
    notesResourceId?: string | null
    endedAt?: string | null
    providerMetadata?: Record<string, unknown>
  },
): Promise<ProjectMeeting> {
  const current = await getProjectMeetingById(db, {
    projectId: input.projectId,
    meetingId: input.meetingId,
  })
  if (!current)
    throw new Error('MEETING_NOT_FOUND')

  const sets: string[] = []
  const values: unknown[] = [input.projectId, input.meetingId]
  let index = values.length + 1

  if (input.status) {
    sets.push(`status = $${index}`)
    values.push(input.status)
    index += 1
  }
  if (input.transcriptStatus) {
    sets.push(`transcript_status = $${index}`)
    values.push(input.transcriptStatus)
    index += 1
  }
  if (input.recordingStatus) {
    sets.push(`recording_status = $${index}`)
    values.push(input.recordingStatus)
    index += 1
  }
  if (input.summaryStatus) {
    sets.push(`summary_status = $${index}`)
    values.push(input.summaryStatus)
    index += 1
  }
  if (input.recordingResourceId !== undefined) {
    sets.push(`recording_resource_id = $${index}`)
    values.push(normalizeString(input.recordingResourceId) || null)
    index += 1
  }
  if (input.notesResourceId !== undefined) {
    sets.push(`notes_resource_id = $${index}`)
    values.push(normalizeString(input.notesResourceId) || null)
    index += 1
  }
  if (input.endedAt !== undefined) {
    sets.push(`ended_at = $${index}`)
    values.push(input.endedAt || null)
    index += 1
  }
  if (input.providerMetadata !== undefined) {
    sets.push(`provider_metadata = $${index}::JSONB`)
    values.push(JSON.stringify({
      ...normalizeRecord(current.providerMetadata),
      ...normalizeRecord(input.providerMetadata),
    }))
    index += 1
  }

  sets.push(`updated_at = $${index}`)
  values.push(new Date().toISOString())

  await db.query(
    `UPDATE project_meetings
     SET ${sets.join(', ')}
     WHERE project_id = $1
       AND id = $2`,
    values,
  )

  const meeting = await getProjectMeetingById(db, {
    projectId: input.projectId,
    meetingId: input.meetingId,
  })
  if (!meeting)
    throw new Error('MEETING_NOT_FOUND')
  return meeting
}

export async function listProjectMeetingParticipants(
  db: Queryable,
  input: {
    meetingId: string
  },
): Promise<ProjectMeetingParticipant[]> {
  const result = await db.query<ProjectMeetingParticipantRow>(
    `SELECT
      pmp.id,
      pmp.meeting_id,
      pmp.project_id,
      pmp.user_id,
      pmp.provider_participant_id,
      pmp.provider_identity,
      pmp.display_name,
      pmp.role,
      pmp.joined_at::TEXT,
      pmp.left_at::TEXT,
      pmp.audio_track_state,
      pmp.video_track_state,
      pmp.metadata,
      pmp.created_at::TEXT,
      pmp.updated_at::TEXT,
      u.username,
      u.avatar_url
     FROM project_meeting_participants pmp
     LEFT JOIN users u
       ON u.id = pmp.user_id
     WHERE pmp.meeting_id = $1
     ORDER BY COALESCE(pmp.joined_at, pmp.created_at) ASC, pmp.created_at ASC`,
    [input.meetingId],
  )
  return result.rows.map(mapParticipant)
}

export async function upsertProjectMeetingParticipant(
  db: Queryable,
  input: {
    meetingId: string
    projectId: string
    userId?: string | null
    providerParticipantId?: string
    providerIdentity: string
    displayName: string
    role?: ProjectMeetingParticipantRole
    joinedAt?: string | null
    leftAt?: string | null
    audioTrackState?: ProjectMeetingTrackState
    videoTrackState?: ProjectMeetingTrackState
    metadata?: Record<string, unknown>
  },
): Promise<ProjectMeetingParticipant> {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO project_meeting_participants (
      id,
      meeting_id,
      project_id,
      user_id,
      provider_participant_id,
      provider_identity,
      display_name,
      role,
      joined_at,
      left_at,
      audio_track_state,
      video_track_state,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB, $14, $14
    )
    ON CONFLICT (meeting_id, provider_identity)
    DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, project_meeting_participants.user_id),
      provider_participant_id = CASE
        WHEN EXCLUDED.provider_participant_id <> '' THEN EXCLUDED.provider_participant_id
        ELSE project_meeting_participants.provider_participant_id
      END,
      display_name = CASE
        WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name
        ELSE project_meeting_participants.display_name
      END,
      role = COALESCE(EXCLUDED.role, project_meeting_participants.role),
      joined_at = COALESCE(project_meeting_participants.joined_at, EXCLUDED.joined_at),
      left_at = COALESCE(EXCLUDED.left_at, project_meeting_participants.left_at),
      audio_track_state = COALESCE(EXCLUDED.audio_track_state, project_meeting_participants.audio_track_state),
      video_track_state = COALESCE(EXCLUDED.video_track_state, project_meeting_participants.video_track_state),
      metadata = project_meeting_participants.metadata || EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at`,
    [
      id,
      input.meetingId,
      input.projectId,
      normalizeString(input.userId) || null,
      normalizeString(input.providerParticipantId),
      normalizeString(input.providerIdentity),
      normalizeString(input.displayName),
      input.role || 'member',
      input.joinedAt || null,
      input.leftAt || null,
      input.audioTrackState || 'unknown',
      input.videoTrackState || 'unknown',
      JSON.stringify(normalizeRecord(input.metadata)),
      now,
    ],
  )

  const result = await db.query<ProjectMeetingParticipantRow>(
    `SELECT
      pmp.id,
      pmp.meeting_id,
      pmp.project_id,
      pmp.user_id,
      pmp.provider_participant_id,
      pmp.provider_identity,
      pmp.display_name,
      pmp.role,
      pmp.joined_at::TEXT,
      pmp.left_at::TEXT,
      pmp.audio_track_state,
      pmp.video_track_state,
      pmp.metadata,
      pmp.created_at::TEXT,
      pmp.updated_at::TEXT,
      u.username,
      u.avatar_url
     FROM project_meeting_participants pmp
     LEFT JOIN users u
       ON u.id = pmp.user_id
     WHERE pmp.meeting_id = $1
       AND pmp.provider_identity = $2
     LIMIT 1`,
    [input.meetingId, normalizeString(input.providerIdentity)],
  )
  const row = result.rows[0]
  if (!row)
    throw new Error('MEETING_PARTICIPANT_UPSERT_FAILED')
  return mapParticipant(row)
}

export async function getProjectMeetingParticipantByIdentity(
  db: Queryable,
  input: {
    meetingId: string
    providerIdentity: string
  },
): Promise<ProjectMeetingParticipant | null> {
  const result = await db.query<ProjectMeetingParticipantRow>(
    `SELECT
      pmp.id,
      pmp.meeting_id,
      pmp.project_id,
      pmp.user_id,
      pmp.provider_participant_id,
      pmp.provider_identity,
      pmp.display_name,
      pmp.role,
      pmp.joined_at::TEXT,
      pmp.left_at::TEXT,
      pmp.audio_track_state,
      pmp.video_track_state,
      pmp.metadata,
      pmp.created_at::TEXT,
      pmp.updated_at::TEXT,
      u.username,
      u.avatar_url
     FROM project_meeting_participants pmp
     LEFT JOIN users u
       ON u.id = pmp.user_id
     WHERE pmp.meeting_id = $1
       AND pmp.provider_identity = $2
     LIMIT 1`,
    [input.meetingId, normalizeString(input.providerIdentity)],
  )
  const row = result.rows[0]
  return row ? mapParticipant(row) : null
}

export async function appendProjectMeetingUtterance(
  db: Queryable,
  input: {
    meetingId: string
    participantId?: string | null
    speakerUserId?: string | null
    speakerName: string
    speakerLabel: string
    startedAtMs: number
    endedAtMs: number
    text: string
    language?: string
    confidence?: number
    isFinal?: boolean
    providerEventKey?: string | null
  },
): Promise<ProjectMeetingUtterance> {
  const providerEventKey = normalizeString(input.providerEventKey)
  if (providerEventKey) {
    const existingResult = await db.query<ProjectMeetingUtteranceRow>(
      `SELECT
        id,
        meeting_id,
        participant_id,
        speaker_user_id,
        speaker_name,
        speaker_label,
        sequence_no,
        started_at_ms,
        ended_at_ms,
        text,
        language,
        confidence,
        is_final,
        provider_event_key,
        created_at::TEXT,
        updated_at::TEXT
       FROM project_meeting_utterances
       WHERE meeting_id = $1
         AND provider_event_key = $2
       LIMIT 1`,
      [input.meetingId, providerEventKey],
    )
    const existing = existingResult.rows[0]
    if (existing)
      return mapUtterance(existing)
  }

  const sequenceResult = await db.query<{ next_sequence_no: string }>(
    `SELECT COALESCE(MAX(sequence_no), 0)::TEXT AS next_sequence_no
     FROM project_meeting_utterances
     WHERE meeting_id = $1`,
    [input.meetingId],
  )
  const sequenceNo = Math.max(1, Math.trunc(toNumber(sequenceResult.rows[0]?.next_sequence_no, 0)) + 1)
  const id = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO project_meeting_utterances (
      id,
      meeting_id,
      participant_id,
      speaker_user_id,
      speaker_name,
      speaker_label,
      sequence_no,
      started_at_ms,
      ended_at_ms,
      text,
      language,
      confidence,
      is_final,
      provider_event_key,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
    )`,
    [
      id,
      input.meetingId,
      normalizeString(input.participantId) || null,
      normalizeString(input.speakerUserId) || null,
      normalizeString(input.speakerName),
      normalizeString(input.speakerLabel),
      sequenceNo,
      Math.max(0, Math.trunc(toNumber(input.startedAtMs, 0))),
      Math.max(0, Math.trunc(toNumber(input.endedAtMs, 0))),
      normalizeString(input.text),
      normalizeString(input.language),
      Math.max(0, Math.min(1, toNumber(input.confidence, 0))),
      input.isFinal !== false,
      providerEventKey || null,
      now,
    ],
  )

  const result = await db.query<ProjectMeetingUtteranceRow>(
    `SELECT
      id,
      meeting_id,
      participant_id,
      speaker_user_id,
      speaker_name,
      speaker_label,
      sequence_no,
      started_at_ms,
      ended_at_ms,
      text,
      language,
      confidence,
      is_final,
      provider_event_key,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_meeting_utterances
     WHERE id = $1
     LIMIT 1`,
    [id],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('MEETING_UTTERANCE_CREATE_FAILED')
  return mapUtterance(row)
}

export async function listProjectMeetingUtterances(
  db: Queryable,
  input: {
    meetingId: string
    finalsOnly?: boolean
  },
): Promise<ProjectMeetingUtterance[]> {
  const result = await db.query<ProjectMeetingUtteranceRow>(
    `SELECT
      id,
      meeting_id,
      participant_id,
      speaker_user_id,
      speaker_name,
      speaker_label,
      sequence_no,
      started_at_ms,
      ended_at_ms,
      text,
      language,
      confidence,
      is_final,
      provider_event_key,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_meeting_utterances
     WHERE meeting_id = $1
       AND ($2::BOOLEAN = FALSE OR is_final = TRUE)
     ORDER BY sequence_no ASC, created_at ASC`,
    [input.meetingId, input.finalsOnly !== false],
  )
  return result.rows.map(mapUtterance)
}

export async function enqueueProjectMeetingJob(
  db: Queryable,
  input: {
    meetingId: string
    jobType: ProjectMeetingJobType
    payload?: Record<string, unknown>
    maxAttempt?: number
    nextRunAt?: string
  },
): Promise<ProjectMeetingJob> {
  const existingResult = await db.query<ProjectMeetingJobRow>(
    `SELECT
      id,
      meeting_id,
      job_type,
      status,
      attempt,
      max_attempt,
      next_run_at::TEXT,
      error_message,
      payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_meeting_jobs
     WHERE meeting_id = $1
       AND job_type = $2
       AND status = ANY($3::TEXT[])
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.meetingId, input.jobType, ['queued', 'processing']],
  )
  const existing = existingResult.rows[0]
  if (existing)
    return mapJob(existing)

  const id = randomUUID()
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO project_meeting_jobs (
      id,
      meeting_id,
      job_type,
      status,
      attempt,
      max_attempt,
      next_run_at,
      error_message,
      payload,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, 'queued', 0, $4, $5, '', $6::JSONB, $7, $7
    )`,
    [
      id,
      input.meetingId,
      input.jobType,
      Math.max(1, Math.trunc(toNumber(input.maxAttempt, 5))),
      input.nextRunAt || now,
      JSON.stringify(normalizeRecord(input.payload)),
      now,
    ],
  )

  const result = await db.query<ProjectMeetingJobRow>(
    `SELECT
      id,
      meeting_id,
      job_type,
      status,
      attempt,
      max_attempt,
      next_run_at::TEXT,
      error_message,
      payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_meeting_jobs
     WHERE id = $1
     LIMIT 1`,
    [id],
  )
  const row = result.rows[0]
  if (!row)
    throw new Error('MEETING_JOB_ENQUEUE_FAILED')
  return mapJob(row)
}

export async function listProjectMeetingRecentJobs(
  db: Queryable,
  input: {
    meetingId: string
    limit?: number
  },
): Promise<ProjectMeetingJob[]> {
  const limit = Math.max(1, Math.min(20, Math.trunc(toNumber(input.limit, 8))))
  const result = await db.query<ProjectMeetingJobRow>(
    `SELECT
      id,
      meeting_id,
      job_type,
      status,
      attempt,
      max_attempt,
      next_run_at::TEXT,
      error_message,
      payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_meeting_jobs
     WHERE meeting_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [input.meetingId, limit],
  )
  return result.rows.map(mapJob)
}

export async function claimNextQueuedProjectMeetingJob(
  db: Queryable,
  input: {
    maxAttempts: number
  },
): Promise<ProjectMeetingJob | null> {
  const now = new Date().toISOString()
  const result = await db.query<ProjectMeetingJobRow>(
    `WITH target AS (
      SELECT id
      FROM project_meeting_jobs
      WHERE status IN ('queued', 'failed')
        AND attempt < LEAST(max_attempt, $1)
        AND next_run_at <= $2::TIMESTAMPTZ
      ORDER BY next_run_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE project_meeting_jobs job
    SET status = 'processing',
        attempt = job.attempt + 1,
        started_at = $2::TIMESTAMPTZ,
        finished_at = NULL,
        updated_at = $2::TIMESTAMPTZ
    FROM target
    WHERE job.id = target.id
    RETURNING
      job.id,
      job.meeting_id,
      job.job_type,
      job.status,
      job.attempt,
      job.max_attempt,
      job.next_run_at::TEXT,
      job.error_message,
      job.payload,
      job.started_at::TEXT,
      job.finished_at::TEXT,
      job.created_at::TEXT,
      job.updated_at::TEXT`,
    [Math.max(1, Math.trunc(toNumber(input.maxAttempts, 5))), now],
  )
  const row = result.rows[0]
  return row ? mapJob(row) : null
}

export async function finishProjectMeetingJobSuccess(
  db: Queryable,
  input: {
    jobId: string
    payload?: Record<string, unknown>
  },
): Promise<ProjectMeetingJob | null> {
  const now = new Date().toISOString()
  const result = await db.query<ProjectMeetingJobRow>(
    `UPDATE project_meeting_jobs
     SET status = 'succeeded',
         error_message = '',
         payload = COALESCE($2::JSONB, payload),
         finished_at = $3,
         updated_at = $3
     WHERE id = $1
     RETURNING
       id,
       meeting_id,
       job_type,
       status,
       attempt,
       max_attempt,
       next_run_at::TEXT,
       error_message,
       payload,
       started_at::TEXT,
       finished_at::TEXT,
       created_at::TEXT,
       updated_at::TEXT`,
    [input.jobId, input.payload ? JSON.stringify(normalizeRecord(input.payload)) : null, now],
  )
  const row = result.rows[0]
  return row ? mapJob(row) : null
}

export async function finishProjectMeetingJobFailure(
  db: Queryable,
  input: {
    jobId: string
    errorMessage: string
    retryAt?: string
    payload?: Record<string, unknown>
  },
): Promise<ProjectMeetingJob | null> {
  const now = new Date().toISOString()
  const result = await db.query<ProjectMeetingJobRow>(
    `UPDATE project_meeting_jobs
     SET status = 'failed',
         error_message = $2,
         next_run_at = COALESCE($3::TIMESTAMPTZ, next_run_at),
         payload = COALESCE($4::JSONB, payload),
         finished_at = $5,
         updated_at = $5
     WHERE id = $1
     RETURNING
       id,
       meeting_id,
       job_type,
       status,
       attempt,
       max_attempt,
       next_run_at::TEXT,
       error_message,
       payload,
       started_at::TEXT,
       finished_at::TEXT,
       created_at::TEXT,
       updated_at::TEXT`,
    [
      input.jobId,
      normalizeString(input.errorMessage) || 'unknown error',
      input.retryAt || null,
      input.payload ? JSON.stringify(normalizeRecord(input.payload)) : null,
      now,
    ],
  )
  const row = result.rows[0]
  return row ? mapJob(row) : null
}

export async function getProjectMeetingDetail(
  db: Queryable,
  input: {
    projectId: string
    meetingId: string
  },
): Promise<ProjectMeetingDetail | null> {
  const meeting = await getProjectMeetingById(db, input)
  if (!meeting)
    return null

  const [participants, recentJobs] = await Promise.all([
    listProjectMeetingParticipants(db, { meetingId: input.meetingId }),
    listProjectMeetingRecentJobs(db, { meetingId: input.meetingId }),
  ])

  return {
    ...meeting,
    participants,
    recentJobs,
  }
}

export async function getProjectMeetingDetailByMeetingId(
  db: Queryable,
  meetingId: string,
): Promise<ProjectMeetingDetail | null> {
  const meeting = await getProjectMeetingByMeetingId(db, meetingId)
  if (!meeting)
    return null
  return getProjectMeetingDetail(db, {
    projectId: meeting.projectId,
    meetingId,
  })
}
