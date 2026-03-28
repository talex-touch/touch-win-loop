import type { Queryable } from '~~/server/utils/db'
import type { AuthUser, Invitation, WorkspaceMemberRole, WorkspaceType } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { teamEnsureWorkspaceMember, teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'

const MANAGE_INVITATION_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']

interface CreateTeamInvitationInput {
  workspaceId: string
  invitedByUserId: string
  tokenHash: string
  inviteeUsername?: string | null
  role: WorkspaceMemberRole
  expiresAt: string
}

export async function teamCreateInvitation(db: Queryable, input: CreateTeamInvitationInput): Promise<Invitation> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const normalizedInviteeUsername = String(input.inviteeUsername || '').trim() || null

  await db.query(
    `UPDATE invitations
     SET expires_at = NOW()
     WHERE workspace_id = $1
       AND role = $2
       AND accepted_at IS NULL
       AND expires_at > NOW()
       AND COALESCE(invitee_username, '') = COALESCE($3, '')`,
    [input.workspaceId, input.role, normalizedInviteeUsername],
  )

  await db.query(
    `INSERT INTO invitations (
      id,
      workspace_id,
      token_hash,
      invited_by_user_id,
      invitee_username,
      role,
      expires_at,
      accepted_at,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)`,
    [
      id,
      input.workspaceId,
      input.tokenHash,
      input.invitedByUserId,
      normalizedInviteeUsername,
      input.role,
      input.expiresAt,
      now,
    ],
  )

  return {
    id,
    teamId: input.workspaceId,
    workspaceId: input.workspaceId,
    role: input.role,
    inviteeUsername: normalizedInviteeUsername,
    expiresAt: input.expiresAt,
    acceptedAt: null,
    createdAt: now,
  }
}

export async function teamAcceptInvitation(db: Queryable, tokenHash: string, user: AuthUser): Promise<Invitation | null> {
  const result = await db.query<{
    id: string
    workspace_id: string
    role: WorkspaceMemberRole
    invitee_username: string | null
    expires_at: string
    accepted_at: string | null
    created_at: string
  }>(
    `SELECT id, workspace_id, role, invitee_username, expires_at::TEXT, accepted_at::TEXT, created_at::TEXT
     FROM invitations
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  )

  const invitation = result.rows[0]
  if (!invitation)
    return null

  if (invitation.invitee_username && invitation.invitee_username !== user.username)
    throw new Error('INVITATION_TARGET_MISMATCH')

  if (invitation.accepted_at) {
    return {
      id: invitation.id,
      teamId: invitation.workspace_id,
      workspaceId: invitation.workspace_id,
      role: invitation.role,
      inviteeUsername: invitation.invitee_username,
      expiresAt: invitation.expires_at,
      acceptedAt: invitation.accepted_at,
      createdAt: invitation.created_at,
    }
  }

  const expiresAtMs = new Date(invitation.expires_at).getTime()
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now())
    return null

  const workspaceTypeResult = await db.query<{ type: WorkspaceType }>(
    `SELECT type
     FROM workspaces
     WHERE id = $1
     LIMIT 1
     FOR UPDATE`,
    [invitation.workspace_id],
  )

  const workspaceType = workspaceTypeResult.rows[0]?.type
  if (!workspaceType)
    throw new Error('WORKSPACE_NOT_FOUND')

  const now = new Date().toISOString()

  await teamEnsureWorkspaceMember(db, invitation.workspace_id, user.id, invitation.role)

  await db.query(
    `UPDATE invitations
     SET accepted_at = $2
     WHERE id = $1`,
    [invitation.id, now],
  )

  return {
    id: invitation.id,
    teamId: invitation.workspace_id,
    workspaceId: invitation.workspace_id,
    role: invitation.role,
    inviteeUsername: invitation.invitee_username,
    expiresAt: invitation.expires_at,
    acceptedAt: now,
    createdAt: invitation.created_at,
  }
}

export async function teamRevokeWorkspaceInvitation(
  db: Queryable,
  input: {
    workspaceId: string
    invitationId: string
    actorUser: AuthUser
  },
): Promise<boolean> {
  const normalizedInvitationId = String(input.invitationId || '').trim()
  if (!normalizedInvitationId)
    throw new Error('INVITATION_ID_REQUIRED')

  if (!input.actorUser.isPlatformAdmin) {
    const canManage = await teamHasWorkspaceRoles(db, input.actorUser, input.workspaceId, MANAGE_INVITATION_ROLES)
    if (!canManage)
      throw new Error('FORBIDDEN')
  }

  const result = await db.query<{ accepted_at: string | null, expires_at: string }>(
    `SELECT accepted_at::TEXT, expires_at::TEXT
     FROM invitations
     WHERE id = $1
       AND workspace_id = $2
     LIMIT 1
     FOR UPDATE`,
    [normalizedInvitationId, input.workspaceId],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('INVITATION_NOT_FOUND')

  if (row.accepted_at)
    return false

  const expiresAtMs = new Date(String(row.expires_at || '')).getTime()
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now())
    return false

  await db.query(
    `UPDATE invitations
     SET expires_at = NOW()
     WHERE id = $1`,
    [normalizedInvitationId],
  )

  return true
}
