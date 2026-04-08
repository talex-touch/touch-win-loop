import type { Queryable } from '~~/server/utils/db'
import type { AuthUser, Invitation, ProjectMemberRole, WorkspaceMemberRole, WorkspaceType } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { teamEnsureWorkspaceMember, teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import { teamGetWorkspaceType } from '~~/server/utils/team-quota-store'

const MANAGE_INVITATION_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']

interface CreateTeamInvitationInput {
  workspaceId: string
  projectId?: string | null
  projectRole?: ProjectMemberRole | null
  invitedByUserId: string
  tokenHash: string
  inviteeUsername?: string | null
  role: WorkspaceMemberRole
  expiresAt: string
}

function normalizeInvitationProjectRole(input: ProjectMemberRole | null | undefined): ProjectMemberRole | null {
  if (input === 'manager' || input === 'editor' || input === 'viewer')
    return input
  return null
}

export async function teamCreateInvitation(db: Queryable, input: CreateTeamInvitationInput): Promise<Invitation> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const normalizedProjectId = String(input.projectId || '').trim() || null
  const normalizedProjectRole = normalizeInvitationProjectRole(input.projectRole)
  const normalizedInviteeUsername = String(input.inviteeUsername || '').trim() || null
  const workspaceType = await teamGetWorkspaceType(db, input.workspaceId)
  if (!workspaceType)
    throw new Error('WORKSPACE_NOT_FOUND')
  if (workspaceType === 'personal' && input.role !== 'member')
    throw new Error('PERSONAL_WORKSPACE_ONLY_MEMBER_ALLOWED')

  await db.query(
    `UPDATE invitations
     SET expires_at = NOW()
     WHERE workspace_id = $1
       AND COALESCE(project_id, '') = COALESCE($2, '')
       AND COALESCE(project_role, '') = COALESCE($3, '')
       AND role = $4
       AND accepted_at IS NULL
       AND expires_at > NOW()
       AND COALESCE(invitee_username, '') = COALESCE($5, '')`,
    [input.workspaceId, normalizedProjectId, normalizedProjectRole, input.role, normalizedInviteeUsername],
  )

  await db.query(
    `INSERT INTO invitations (
      id,
      workspace_id,
      project_id,
      project_role,
      token_hash,
      invited_by_user_id,
      invitee_username,
      role,
      expires_at,
      accepted_at,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10)`,
    [
      id,
      input.workspaceId,
      normalizedProjectId,
      normalizedProjectRole,
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
    projectId: normalizedProjectId,
    projectRole: normalizedProjectRole,
    role: input.role,
    inviteeUsername: normalizedInviteeUsername,
    expiresAt: input.expiresAt,
    acceptedAt: null,
    createdAt: now,
  }
}

async function resolveInvitationProjectId(
  db: Queryable,
  workspaceId: string,
  rawProjectId: string | null,
): Promise<string | null> {
  const projectId = String(rawProjectId || '').trim()
  if (!projectId)
    return null

  const result = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId],
  )

  const projectWorkspaceId = String(result.rows[0]?.workspace_id || '').trim()
  if (!projectWorkspaceId || projectWorkspaceId !== workspaceId)
    return null

  return projectId
}

async function ensureInvitationProjectMember(
  db: Queryable,
  invitation: {
    project_id: string | null
    project_role: ProjectMemberRole | null
    workspace_id: string
    invited_by_user_id: string
    created_at: string
  },
  targetUserId: string,
): Promise<string | null> {
  const projectId = await resolveInvitationProjectId(db, invitation.workspace_id, invitation.project_id)
  if (!projectId)
    return null

  const { upsertProjectMember } = await import('~~/server/utils/platform-store')
  await upsertProjectMember(db, {
    projectId,
    actorUser: {
      id: invitation.invited_by_user_id,
      username: 'invitation-system',
      isPlatformAdmin: true,
      isDisabled: false,
      createdAt: invitation.created_at,
      updatedAt: invitation.created_at,
    },
    targetUserId,
    role: normalizeInvitationProjectRole(invitation.project_role) || 'viewer',
    source: 'invitation',
  })

  return projectId
}

export async function teamAcceptInvitation(db: Queryable, tokenHash: string, user: AuthUser): Promise<Invitation | null> {
  const result = await db.query<{
    id: string
    workspace_id: string
    project_id: string | null
    project_role: ProjectMemberRole | null
    invited_by_user_id: string
    role: WorkspaceMemberRole
    invitee_username: string | null
    expires_at: string
    accepted_at: string | null
    created_at: string
  }>(
    `SELECT id, workspace_id, project_id, project_role, invited_by_user_id, role, invitee_username, expires_at::TEXT, accepted_at::TEXT, created_at::TEXT
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
    const projectId = await resolveInvitationProjectId(db, invitation.workspace_id, invitation.project_id)
    return {
      id: invitation.id,
      teamId: invitation.workspace_id,
      workspaceId: invitation.workspace_id,
      projectId,
      projectRole: normalizeInvitationProjectRole(invitation.project_role),
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
  const projectId = await ensureInvitationProjectMember(db, invitation, user.id)

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
    projectId,
    projectRole: normalizeInvitationProjectRole(invitation.project_role),
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
