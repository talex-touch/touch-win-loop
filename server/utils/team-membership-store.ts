import type { Queryable } from '~~/server/utils/db'
import type {
  AuthUser,
  ProjectMemberRole,
  WorkspaceInvitationSummary,
  WorkspaceMemberManagementSnapshot,
  WorkspaceMemberRole,
  WorkspaceMemberSummary,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { teamAssertWorkspaceSeatAvailable, teamGetWorkspaceType, teamRefreshSeatUsage } from '~~/server/utils/team-quota-store'

const ALL_WORKSPACE_MEMBER_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager', 'member']
const WORKSPACE_ROLE_PRIORITY: Record<WorkspaceMemberRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  member: 1,
}

interface WorkspaceMemberSummaryRow {
  user_id: string
  username: string
  roles: WorkspaceMemberRole[] | null
  joined_at: string
  updated_at: string
}

interface WorkspaceInvitationSummaryRow {
  id: string
  workspace_id: string
  project_id: string | null
  project_role: ProjectMemberRole | null
  project_title: string | null
  role: WorkspaceMemberRole
  invitee_username: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
  invited_by_user_id: string
  invited_by_username: string
}

export interface TeamWorkspaceAccess {
  workspaceId: string
  roles: WorkspaceMemberRole[]
  isMember: boolean
}

function normalizeStringArray(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function uniqueStringArray(value: string[] | null | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of normalizeStringArray(value)) {
    if (seen.has(item))
      continue
    seen.add(item)
    result.push(item)
  }

  return result
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  for (const item of items) {
    const key = keyOf(item)
    if (!key || seen.has(key))
      continue
    seen.add(key)
    result.push(item)
  }

  return result
}

function mapWorkspaceMemberSummary(row: WorkspaceMemberSummaryRow): WorkspaceMemberSummary {
  const roles = uniqueStringArray((row.roles || []).map(item => String(item || '').trim()))
    .filter((item): item is WorkspaceMemberRole => ALL_WORKSPACE_MEMBER_ROLES.includes(item as WorkspaceMemberRole))

  return {
    userId: row.user_id,
    username: row.username,
    roles,
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
  }
}

function mapWorkspaceInvitationSummary(row: WorkspaceInvitationSummaryRow): WorkspaceInvitationSummary {
  const expiresAt = String(row.expires_at || '').trim()
  const expiresMs = new Date(expiresAt).getTime()
  const isExpired = Number.isFinite(expiresMs) && expiresMs <= Date.now()

  return {
    id: row.id,
    teamId: row.workspace_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    projectRole: row.project_role,
    role: row.role,
    inviteeUsername: row.invitee_username,
    expiresAt,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    invitedByUserId: row.invited_by_user_id,
    invitedByUsername: row.invited_by_username,
    projectTitle: row.project_title,
    isExpired,
  }
}

function getHighestWorkspaceRole(roles: WorkspaceMemberRole[]): WorkspaceMemberRole | null {
  if (!roles.length)
    return null

  let highest: WorkspaceMemberRole | null = null
  let maxPriority = 0

  for (const role of roles) {
    const priority = WORKSPACE_ROLE_PRIORITY[role] || 0
    if (priority > maxPriority) {
      maxPriority = priority
      highest = role
    }
  }

  return highest
}

function normalizeWorkspaceRoleForType(
  workspaceType: 'personal' | 'team' | null,
  role: WorkspaceMemberRole,
): WorkspaceMemberRole {
  if (workspaceType === 'personal' && role !== 'owner')
    return 'member'
  return role
}

async function getWorkspaceRolesByUserId(
  db: Queryable,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMemberRole[]> {
  const result = await db.query<{ role: WorkspaceMemberRole }>(
    `SELECT role
     FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2
       AND is_active = TRUE`,
    [workspaceId, userId],
  )

  return dedupeBy(result.rows.map(row => row.role), item => item)
}

export async function teamGetWorkspaceAccess(db: Queryable, userId: string, workspaceId: string): Promise<TeamWorkspaceAccess> {
  const result = await db.query<{ role: WorkspaceMemberRole }>(
    `SELECT role
     FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2
       AND is_active = TRUE`,
    [workspaceId, userId],
  )

  const roles = dedupeBy(result.rows.map(row => row.role), item => item)

  return {
    workspaceId,
    roles,
    isMember: roles.length > 0,
  }
}

export function teamHasWorkspaceRole(access: TeamWorkspaceAccess, expected: WorkspaceMemberRole[]): boolean {
  return access.roles.some(role => expected.includes(role))
}

export async function teamGetWorkspaceMemberManagementSnapshot(
  db: Queryable,
  workspaceId: string,
): Promise<WorkspaceMemberManagementSnapshot> {
  const membersResult = await db.query<WorkspaceMemberSummaryRow>(
    `SELECT
       wm.user_id,
       u.username,
       ARRAY_AGG(DISTINCT wm.role ORDER BY wm.role)::TEXT[] AS roles,
       MIN(wm.created_at)::TEXT AS joined_at,
       MAX(wm.updated_at)::TEXT AS updated_at
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
       AND wm.is_active = TRUE
     GROUP BY wm.user_id, u.username
     ORDER BY MIN(wm.created_at) ASC, u.username ASC`,
    [workspaceId],
  )

  const invitationsResult = await db.query<WorkspaceInvitationSummaryRow>(
    `SELECT
       i.id,
       i.workspace_id,
       i.project_id,
       i.project_role,
       p.title AS project_title,
       i.role,
       i.invitee_username,
       i.expires_at::TEXT,
       i.accepted_at::TEXT,
       i.created_at::TEXT,
       i.invited_by_user_id,
       invited_by.username AS invited_by_username
     FROM invitations i
     JOIN users invited_by ON invited_by.id = i.invited_by_user_id
     LEFT JOIN projects p ON p.id = i.project_id
     WHERE i.workspace_id = $1
       AND i.accepted_at IS NULL
     ORDER BY i.created_at DESC`,
    [workspaceId],
  )

  return {
    teamId: workspaceId,
    workspaceId,
    members: membersResult.rows.map(mapWorkspaceMemberSummary),
    invitations: invitationsResult.rows.map(mapWorkspaceInvitationSummary),
  }
}

export async function teamHasWorkspaceMembership(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
): Promise<boolean> {
  if (user.isPlatformAdmin)
    return true

  const access = await teamGetWorkspaceAccess(db, user.id, workspaceId)
  return access.isMember
}

export async function teamHasWorkspaceRoles(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
  roles: WorkspaceMemberRole[],
): Promise<boolean> {
  if (user.isPlatformAdmin)
    return true

  const access = await teamGetWorkspaceAccess(db, user.id, workspaceId)
  if (!access.isMember)
    return false

  return teamHasWorkspaceRole(access, roles)
}

export async function teamEnsureWorkspaceMember(
  db: Queryable,
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole = 'member',
): Promise<void> {
  const workspaceType = await teamGetWorkspaceType(db, workspaceId)
  if (!workspaceType)
    throw new Error('WORKSPACE_NOT_FOUND')

  const normalizedRole = normalizeWorkspaceRoleForType(workspaceType, role)
  const existingActiveResult = await db.query<{ user_id: string }>(
    `SELECT user_id
     FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2
       AND is_active = TRUE
     LIMIT 1`,
    [workspaceId, userId],
  )
  const hasActiveMembership = Boolean(existingActiveResult.rows[0]?.user_id)
  if (!hasActiveMembership)
    await teamAssertWorkspaceSeatAvailable(db, workspaceId, 1)

  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, $5, $5)
     ON CONFLICT (workspace_id, user_id, role)
     DO UPDATE SET
       is_active = TRUE,
       updated_at = EXCLUDED.updated_at`,
    [randomUUID(), workspaceId, userId, normalizedRole, now],
  )

  await teamRefreshSeatUsage(db, workspaceId)
}

export async function teamPatchWorkspaceMemberRole(
  db: Queryable,
  input: {
    workspaceId: string
    actorUser: AuthUser
    targetUserId: string
    role: 'admin' | 'manager' | 'member'
  },
): Promise<WorkspaceMemberSummary | null> {
  const normalizedTargetUserId = String(input.targetUserId || '').trim()
  if (!normalizedTargetUserId)
    throw new Error('WORKSPACE_MEMBER_TARGET_REQUIRED')

  if (!input.actorUser.isPlatformAdmin) {
    const actorAccess = await teamGetWorkspaceAccess(db, input.actorUser.id, input.workspaceId)
    const actorHighest = getHighestWorkspaceRole(actorAccess.roles)
    if (!actorAccess.isMember || (actorHighest !== 'owner' && actorHighest !== 'admin'))
      throw new Error('FORBIDDEN')
  }

  const targetRoles = await getWorkspaceRolesByUserId(db, input.workspaceId, normalizedTargetUserId)
  if (targetRoles.length === 0)
    throw new Error('WORKSPACE_MEMBER_NOT_FOUND')
  if (targetRoles.includes('owner'))
    throw new Error('WORKSPACE_OWNER_IMMUTABLE')

  const workspaceType = await teamGetWorkspaceType(db, input.workspaceId)
  if (!workspaceType)
    throw new Error('WORKSPACE_NOT_FOUND')
  if (workspaceType === 'personal' && input.role !== 'member')
    throw new Error('PERSONAL_WORKSPACE_SECONDARY_ROLE_FORBIDDEN')

  const now = new Date().toISOString()
  await db.query(
    `DELETE FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2`,
    [input.workspaceId, normalizedTargetUserId],
  )

  await db.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, $5, $5)`,
    [randomUUID(), input.workspaceId, normalizedTargetUserId, input.role, now],
  )

  await teamRefreshSeatUsage(db, input.workspaceId)

  const summaryResult = await db.query<WorkspaceMemberSummaryRow>(
    `SELECT
      wm.user_id,
      u.username,
      ARRAY_AGG(DISTINCT wm.role ORDER BY wm.role)::TEXT[] AS roles,
      MIN(wm.created_at)::TEXT AS joined_at,
      MAX(wm.updated_at)::TEXT AS updated_at
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
       AND wm.user_id = $2
       AND wm.is_active = TRUE
     GROUP BY wm.user_id, u.username`,
    [input.workspaceId, normalizedTargetUserId],
  )

  const row = summaryResult.rows[0]
  return row ? mapWorkspaceMemberSummary(row) : null
}

export async function teamRemoveWorkspaceMember(
  db: Queryable,
  input: {
    workspaceId: string
    actorUser: AuthUser
    targetUserId: string
  },
): Promise<boolean> {
  const normalizedTargetUserId = String(input.targetUserId || '').trim()
  if (!normalizedTargetUserId)
    throw new Error('WORKSPACE_MEMBER_TARGET_REQUIRED')

  if (!input.actorUser.isPlatformAdmin) {
    const actorAccess = await teamGetWorkspaceAccess(db, input.actorUser.id, input.workspaceId)
    const actorHighest = getHighestWorkspaceRole(actorAccess.roles)
    if (!actorAccess.isMember || (actorHighest !== 'owner' && actorHighest !== 'admin'))
      throw new Error('FORBIDDEN')
  }

  const targetRoles = await getWorkspaceRolesByUserId(db, input.workspaceId, normalizedTargetUserId)
  if (targetRoles.length === 0)
    throw new Error('WORKSPACE_MEMBER_NOT_FOUND')
  if (targetRoles.includes('owner'))
    throw new Error('WORKSPACE_OWNER_IMMUTABLE')

  const ownedProjectResult = await db.query<{ id: string }>(
    `SELECT id
     FROM projects
     WHERE workspace_id = $1
       AND owner_user_id = $2
     LIMIT 1`,
    [input.workspaceId, normalizedTargetUserId],
  )
  if (ownedProjectResult.rows[0]?.id)
    throw new Error('WORKSPACE_MEMBER_OWNS_PROJECTS')

  await db.query(
    `DELETE FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2`,
    [input.workspaceId, normalizedTargetUserId],
  )

  const removedProjectMemberResult = await db.query<{ project_id: string }>(
    `DELETE FROM project_members pm
     USING projects p
     WHERE pm.project_id = p.id
       AND p.workspace_id = $1
       AND pm.user_id = $2
     RETURNING pm.project_id`,
    [input.workspaceId, normalizedTargetUserId],
  )

  const affectedProjectIds = Array.from(new Set(
    removedProjectMemberResult.rows.map(row => String(row.project_id || '').trim()).filter(Boolean),
  ))
  for (const projectId of affectedProjectIds) {
    await db.query(
      `UPDATE project_seat_quotas psq
       SET seat_used = usage.seat_used,
           updated_at = NOW()
       FROM (
         SELECT COUNT(DISTINCT pm.user_id)::INTEGER AS seat_used
         FROM project_members pm
         WHERE pm.project_id = $1
       ) usage
       WHERE psq.project_id = $1`,
      [projectId],
    )
  }

  await teamRefreshSeatUsage(db, input.workspaceId)
  return true
}
