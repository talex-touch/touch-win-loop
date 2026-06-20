import type { Queryable } from '~~/server/utils/db'
import type { ProjectMeeting, ProjectMeetingGuestShare } from '~~/shared/types/domain'
import { randomBytes, randomUUID } from 'node:crypto'
import { buildServerAppUrl } from '~~/server/utils/api-url'

interface ProjectMeetingGuestShareRow {
  id: string
  meeting_id: string
  project_id: string
  workspace_id: string
  share_key: string
  expires_at: string
  revoked_at: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function createShareKey(): string {
  return randomBytes(20).toString('hex')
}

function resolveFallbackExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
}

function resolveShareExpiresAt(meeting: ProjectMeeting): string {
  const scheduledEndAt = normalizeString(meeting.scheduledEndAt)
  if (scheduledEndAt) {
    const parsed = new Date(scheduledEndAt)
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now())
      return parsed.toISOString()
  }
  return resolveFallbackExpiresAt()
}

function mapProjectMeetingGuestShare(row: ProjectMeetingGuestShareRow): ProjectMeetingGuestShare {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    shareKey: row.share_key,
    shareUrl: buildServerAppUrl(`/meeting/share/${row.share_key}`),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdByUserId: normalizeString(row.created_by_user_id) || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getActiveProjectMeetingGuestShareByMeeting(
  db: Queryable,
  meetingId: string,
): Promise<ProjectMeetingGuestShare | null> {
  const result = await db.query<ProjectMeetingGuestShareRow>(
    `SELECT
      id,
      meeting_id,
      project_id,
      workspace_id,
      share_key,
      expires_at::TEXT,
      revoked_at::TEXT,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_meeting_guest_shares
     WHERE meeting_id = $1
       AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizeString(meetingId)],
  )
  const row = result.rows[0]
  return row ? mapProjectMeetingGuestShare(row) : null
}

export async function getProjectMeetingGuestShareByShareKey(
  db: Queryable,
  shareKey: string,
): Promise<ProjectMeetingGuestShare | null> {
  const result = await db.query<ProjectMeetingGuestShareRow>(
    `SELECT
      id,
      meeting_id,
      project_id,
      workspace_id,
      share_key,
      expires_at::TEXT,
      revoked_at::TEXT,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_meeting_guest_shares
     WHERE share_key = $1
     LIMIT 1`,
    [normalizeString(shareKey)],
  )
  const row = result.rows[0]
  return row ? mapProjectMeetingGuestShare(row) : null
}

export async function getProjectMeetingGuestShareById(
  db: Queryable,
  shareId: string,
): Promise<ProjectMeetingGuestShare | null> {
  const result = await db.query<ProjectMeetingGuestShareRow>(
    `SELECT
      id,
      meeting_id,
      project_id,
      workspace_id,
      share_key,
      expires_at::TEXT,
      revoked_at::TEXT,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_meeting_guest_shares
     WHERE id = $1
     LIMIT 1`,
    [normalizeString(shareId)],
  )
  const row = result.rows[0]
  return row ? mapProjectMeetingGuestShare(row) : null
}

export async function createProjectMeetingGuestShare(
  db: Queryable,
  input: {
    meeting: ProjectMeeting
    actorUserId: string
  },
): Promise<ProjectMeetingGuestShare> {
  const now = new Date().toISOString()
  const result = await db.query<ProjectMeetingGuestShareRow>(
    `INSERT INTO project_meeting_guest_shares (
      id,
      meeting_id,
      project_id,
      workspace_id,
      share_key,
      expires_at,
      revoked_at,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::TIMESTAMPTZ, NULL, $7, $8::TIMESTAMPTZ, $8::TIMESTAMPTZ
    )
    RETURNING
      id,
      meeting_id,
      project_id,
      workspace_id,
      share_key,
      expires_at::TEXT,
      revoked_at::TEXT,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      input.meeting.id,
      input.meeting.projectId,
      input.meeting.workspaceId,
      createShareKey(),
      resolveShareExpiresAt(input.meeting),
      normalizeString(input.actorUserId) || null,
      now,
    ],
  )
  const row = result.rows[0]
  if (!row)
    throw new Error('MEETING_GUEST_SHARE_CREATE_FAILED')
  return mapProjectMeetingGuestShare(row)
}

export async function revokeProjectMeetingGuestShare(
  db: Queryable,
  input: {
    shareId: string
  },
): Promise<ProjectMeetingGuestShare | null> {
  const now = new Date().toISOString()
  const result = await db.query<ProjectMeetingGuestShareRow>(
    `UPDATE project_meeting_guest_shares
     SET revoked_at = COALESCE(revoked_at, $2::TIMESTAMPTZ),
         updated_at = $2::TIMESTAMPTZ
     WHERE id = $1
     RETURNING
       id,
       meeting_id,
       project_id,
       workspace_id,
       share_key,
       expires_at::TEXT,
       revoked_at::TEXT,
       created_by_user_id,
       created_at::TEXT,
       updated_at::TEXT`,
    [normalizeString(input.shareId), now],
  )
  const row = result.rows[0]
  return row ? mapProjectMeetingGuestShare(row) : null
}

export async function revokeActiveProjectMeetingGuestShareByMeeting(
  db: Queryable,
  meetingId: string,
): Promise<ProjectMeetingGuestShare | null> {
  const active = await getActiveProjectMeetingGuestShareByMeeting(db, meetingId)
  if (!active)
    return null
  return revokeProjectMeetingGuestShare(db, {
    shareId: active.id,
  })
}
