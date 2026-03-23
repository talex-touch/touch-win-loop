import type { Queryable } from '~~/server/utils/db'
import type {
  AuthSession,
  AuthUser,
  Invitation,
  Project,
  ProjectAdvisorBinding,
  ProjectCollegeBinding,
  ProjectMemberRole,
  ProjectPayload,
  ProjectSource,
  ProjectStatus,
  SchoolProfile,
  TeamQuota,
  Workspace,
  WorkspaceMemberRole,
  WorkspaceType,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

const FULL_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['team_owner', 'team_admin', 'school_admin']
const MANAGER_PROJECT_ROLES: ProjectMemberRole[] = ['owner', 'manager']

interface UserRow {
  id: string
  username: string
  is_platform_admin: boolean
  is_disabled: boolean
  created_at: string
  updated_at: string
}

interface WorkspaceRow {
  id: string
  type: WorkspaceType
  name: string
  owner_user_id: string
  school_profile: SchoolProfile | null
  created_at: string
  updated_at: string
  roles?: WorkspaceMemberRole[]
}

interface TeamQuotaRow {
  workspace_id: string
  seat_limit: number
  seat_used: number
  ai_quota_total: number
  ai_quota_used: number
  reset_cycle: string
  updated_at: string
}

interface ProjectRow {
  id: string
  workspace_id: string
  owner_user_id: string
  creator_user_id: string
  payer_user_id: string | null
  title: string
  contest_id: string
  track_id: string
  contest_ids: string[] | null
  problem_statement: string
  innovation_points: string[]
  tech_route_steps: string[]
  scoring_mapping: string[]
  risks: string[]
  deliverables: string[]
  summary: string | null
  source: ProjectSource
  status: ProjectStatus
  created_at: string
  updated_at: string
}

interface CreateUserInput {
  username: string
  passwordHash: string
  isPlatformAdmin: boolean
}

interface CreateSessionInput {
  userId: string
  tokenHash: string
  expiresAt: string
}

interface CreateTeamWorkspaceInput {
  ownerUserId: string
  name: string
  schoolProfile?: SchoolProfile | null
  seatLimit?: number
  aiQuotaTotal?: number
  resetCycle?: string
}

interface CreateInvitationInput {
  workspaceId: string
  invitedByUserId: string
  tokenHash: string
  inviteeUsername?: string | null
  role: WorkspaceMemberRole
  collegeCodes?: string[]
  expiresAt: string
}

interface CreateProjectInput extends ProjectPayload {
  workspaceId: string
  ownerUserId: string
  creatorUserId: string
  payerUserId?: string | null
  source: ProjectSource
  status?: ProjectStatus
  collegeBindings?: ProjectCollegeBinding[]
  advisorUserIds?: string[]
}

interface ProjectBindingPatch {
  collegeBindings?: ProjectCollegeBinding[]
  advisorUserIds?: string[]
  advisorUsernames?: string[]
  contestIds?: string[]
}

interface WorkspaceAccess {
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

function normalizeProjectContestIds(primaryContestId: string, contestIds: string[] | null | undefined): string[] {
  const normalizedPrimary = String(primaryContestId || '').trim()
  const normalizedList = uniqueStringArray(contestIds)

  if (!normalizedPrimary)
    return normalizedList
  if (normalizedList.length === 0)
    return [normalizedPrimary]

  return uniqueStringArray([normalizedPrimary, ...normalizedList])
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

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    isPlatformAdmin: row.is_platform_admin,
    isDisabled: Boolean(row.is_disabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    ownerUserId: row.owner_user_id,
    schoolProfile: row.school_profile,
    roles: dedupeBy(row.roles || [], item => item),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTeamQuota(row: TeamQuotaRow): TeamQuota {
  return {
    workspaceId: row.workspace_id,
    seatLimit: Number(row.seat_limit),
    seatUsed: Number(row.seat_used),
    aiQuotaTotal: Number(row.ai_quota_total),
    aiQuotaUsed: Number(row.ai_quota_used),
    resetCycle: row.reset_cycle,
    updatedAt: row.updated_at,
  }
}

function mapProject(
  row: ProjectRow,
  collegeBindings: ProjectCollegeBinding[],
  advisorBindings: ProjectAdvisorBinding[],
): Project {
  const contestIds = normalizeProjectContestIds(row.contest_id, row.contest_ids)
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id,
    creatorUserId: row.creator_user_id,
    payerUserId: row.payer_user_id,
    title: row.title,
    contestId: row.contest_id,
    trackId: row.track_id,
    contestIds,
    problemStatement: row.problem_statement,
    innovationPoints: normalizeStringArray(row.innovation_points),
    techRouteSteps: normalizeStringArray(row.tech_route_steps),
    scoringMapping: normalizeStringArray(row.scoring_mapping),
    risks: normalizeStringArray(row.risks),
    deliverables: normalizeStringArray(row.deliverables),
    summary: row.summary || '',
    source: row.source,
    status: row.status,
    collegeBindings,
    advisorBindings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function countUsers(db: Queryable): Promise<number> {
  const result = await db.query<{ count: string }>('SELECT COUNT(*)::TEXT AS count FROM users')
  return Number(result.rows[0]?.count || '0')
}

export async function ensureBootstrapPlatformSuperAdmin(db: Queryable, userId: string): Promise<boolean> {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['winloop.bootstrap.platform-super-admin'])

  const hasAdminResult = await db.query<{ has_admin: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM users WHERE is_platform_admin = TRUE
      UNION
      SELECT 1 FROM platform_user_roles WHERE role = 'platform_super_admin'
    ) AS has_admin`,
  )

  if (hasAdminResult.rows[0]?.has_admin)
    return false

  const now = new Date().toISOString()
  const promoted = await db.query<{ id: string }>(
    `UPDATE users
     SET is_platform_admin = TRUE, updated_at = $2
     WHERE id = $1
     RETURNING id`,
    [userId, now],
  )

  if (!promoted.rows[0]?.id)
    return false

  await db.query(
    `INSERT INTO platform_user_roles (id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, 'platform_super_admin', $3, $3)
     ON CONFLICT (user_id, role) DO NOTHING`,
    [randomUUID(), userId, now],
  )

  return true
}

export async function findUserByUsername(db: Queryable, username: string): Promise<AuthUser | null> {
  const result = await db.query<UserRow>(
    'SELECT id, username, is_platform_admin, is_disabled, created_at::TEXT, updated_at::TEXT FROM users WHERE username = $1 LIMIT 1',
    [username],
  )

  const row = result.rows[0]
  return row ? mapUser(row) : null
}

export async function getUserPasswordHashByUsername(db: Queryable, username: string): Promise<string | null> {
  const result = await db.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE username = $1 LIMIT 1',
    [username],
  )
  return result.rows[0]?.password_hash || null
}

export async function findUserById(db: Queryable, userId: string): Promise<AuthUser | null> {
  const result = await db.query<UserRow>(
    'SELECT id, username, is_platform_admin, is_disabled, created_at::TEXT, updated_at::TEXT FROM users WHERE id = $1 LIMIT 1',
    [userId],
  )

  const row = result.rows[0]
  return row ? mapUser(row) : null
}

export async function createUserWithPersonalWorkspace(db: Queryable, input: CreateUserInput): Promise<AuthUser> {
  const userId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO users (id, username, password_hash, is_platform_admin, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [userId, input.username, input.passwordHash, input.isPlatformAdmin, now],
  )

  const workspaceId = randomUUID()
  await db.query(
    `INSERT INTO workspaces (id, type, name, owner_user_id, school_profile, created_at, updated_at)
     VALUES ($1, 'personal', $2, $3, NULL, $4, $4)`,
    [workspaceId, `${input.username} Personal`, userId, now],
  )

  await db.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, college_codes, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'team_owner', '{}', TRUE, $4, $4)`,
    [randomUUID(), workspaceId, userId, now],
  )

  const user = await findUserById(db, userId)
  if (!user)
    throw new Error('failed to create user')
  return user
}

export async function createSession(db: Queryable, input: CreateSessionInput): Promise<AuthSession> {
  const sessionId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
     VALUES ($1, $2, $3, $4, NULL, $5)`,
    [sessionId, input.userId, input.tokenHash, input.expiresAt, now],
  )

  return {
    id: sessionId,
    userId: input.userId,
    expiresAt: input.expiresAt,
    createdAt: now,
  }
}

export async function revokeSessionByTokenHash(db: Queryable, tokenHash: string): Promise<void> {
  await db.query(
    `UPDATE sessions
     SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  )
}

export async function extendSessionExpiresAtById(db: Queryable, sessionId: string, expiresAt: string): Promise<void> {
  await db.query(
    `UPDATE sessions
     SET expires_at = $2
     WHERE id = $1
       AND revoked_at IS NULL`,
    [sessionId, expiresAt],
  )
}

export async function findAuthBySessionTokenHash(
  db: Queryable,
  tokenHash: string,
): Promise<{ user: AuthUser, session: AuthSession } | null> {
  const result = await db.query<{
    user_id: string
    username: string
    is_platform_admin: boolean
    is_disabled: boolean
    user_created_at: string
    user_updated_at: string
    session_id: string
    session_expires_at: string
    session_created_at: string
  }>(
    `SELECT
      u.id AS user_id,
      u.username,
      u.is_platform_admin,
      u.is_disabled,
      u.created_at::TEXT AS user_created_at,
      u.updated_at::TEXT AS user_updated_at,
      s.id AS session_id,
      s.expires_at::TEXT AS session_expires_at,
      s.created_at::TEXT AS session_created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  )

  const row = result.rows[0]
  if (!row)
    return null

  const user: AuthUser = {
    id: row.user_id,
    username: row.username,
    isPlatformAdmin: row.is_platform_admin,
    isDisabled: Boolean(row.is_disabled),
    createdAt: row.user_created_at,
    updatedAt: row.user_updated_at,
  }

  const session: AuthSession = {
    id: row.session_id,
    userId: row.user_id,
    expiresAt: row.session_expires_at,
    createdAt: row.session_created_at,
  }

  return { user, session }
}

async function listTeamQuotasByWorkspaceIds(db: Queryable, workspaceIds: string[]): Promise<Map<string, TeamQuota>> {
  if (workspaceIds.length === 0)
    return new Map<string, TeamQuota>()

  const result = await db.query<TeamQuotaRow>(
    `SELECT workspace_id, seat_limit, seat_used, ai_quota_total, ai_quota_used, reset_cycle, updated_at::TEXT
     FROM team_quotas
     WHERE workspace_id = ANY($1::TEXT[])`,
    [workspaceIds],
  )

  return new Map(result.rows.map(row => [row.workspace_id, mapTeamQuota(row)]))
}

export async function listUserWorkspaces(db: Queryable, userId: string): Promise<WorkspaceWithQuota[]> {
  const result = await db.query<WorkspaceRow>(
    `SELECT
      w.id,
      w.type,
      w.name,
      w.owner_user_id,
      w.school_profile,
      w.created_at::TEXT,
      w.updated_at::TEXT,
      ARRAY_AGG(DISTINCT wm.role) AS roles
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1
       AND wm.is_active = TRUE
     GROUP BY w.id
     ORDER BY w.created_at ASC`,
    [userId],
  )

  const workspaces = result.rows.map(mapWorkspace)
  const quotaMap = await listTeamQuotasByWorkspaceIds(db, workspaces.map(item => item.id))

  return workspaces.map((workspace) => {
    if (workspace.type !== 'team')
      return { workspace, quota: null }

    return {
      workspace,
      quota: quotaMap.get(workspace.id) || null,
    }
  })
}

export async function refreshTeamSeatUsage(db: Queryable, workspaceId: string): Promise<void> {
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(DISTINCT wm.user_id)::TEXT AS count
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.workspace_id = $1
       AND wm.is_active = TRUE
       AND w.type = 'team'`,
    [workspaceId],
  )

  const seatUsed = Number(countResult.rows[0]?.count || '0')

  await db.query(
    `UPDATE team_quotas
     SET seat_used = $2, updated_at = NOW()
     WHERE workspace_id = $1`,
    [workspaceId, seatUsed],
  )
}

export async function createTeamWorkspace(db: Queryable, input: CreateTeamWorkspaceInput): Promise<WorkspaceWithQuota> {
  const workspaceId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO workspaces (id, type, name, owner_user_id, school_profile, created_at, updated_at)
     VALUES ($1, 'team', $2, $3, $4::JSONB, $5, $5)`,
    [workspaceId, input.name, input.ownerUserId, input.schoolProfile ? JSON.stringify(input.schoolProfile) : null, now],
  )

  await db.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, college_codes, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'team_owner', '{}', TRUE, $4, $4)`,
    [randomUUID(), workspaceId, input.ownerUserId, now],
  )

  await db.query(
    `INSERT INTO team_subscriptions (id, workspace_id, payer_user_id, plan_code, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'team-basic', 'pending_payment', $4, $4)`,
    [randomUUID(), workspaceId, input.ownerUserId, now],
  )

  await db.query(
    `INSERT INTO team_quotas (workspace_id, seat_limit, seat_used, ai_quota_total, ai_quota_used, reset_cycle, updated_at)
     VALUES ($1, $2, 0, $3, 0, $4, $5)`,
    [workspaceId, Math.max(1, Number(input.seatLimit ?? 20)), Math.max(1, Number(input.aiQuotaTotal ?? 1000)), input.resetCycle || 'monthly', now],
  )

  await refreshTeamSeatUsage(db, workspaceId)

  const workspaceList = await listUserWorkspaces(db, input.ownerUserId)
  const created = workspaceList.find(item => item.workspace.id === workspaceId)
  if (!created)
    throw new Error('failed to create workspace')
  return created
}

export async function getWorkspaceAccess(db: Queryable, userId: string, workspaceId: string): Promise<WorkspaceAccess> {
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

export function hasWorkspaceRole(access: WorkspaceAccess, expected: WorkspaceMemberRole[]): boolean {
  return access.roles.some(role => expected.includes(role))
}

export async function createInvitation(db: Queryable, input: CreateInvitationInput): Promise<Invitation> {
  const id = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO invitations (
      id,
      workspace_id,
      token_hash,
      invited_by_user_id,
      invitee_username,
      role,
      college_codes,
      expires_at,
      accepted_at,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::TEXT[], $8, NULL, $9)`,
    [
      id,
      input.workspaceId,
      input.tokenHash,
      input.invitedByUserId,
      input.inviteeUsername || null,
      input.role,
      normalizeStringArray(input.collegeCodes),
      input.expiresAt,
      now,
    ],
  )

  return {
    id,
    workspaceId: input.workspaceId,
    role: input.role,
    inviteeUsername: input.inviteeUsername || null,
    collegeCodes: normalizeStringArray(input.collegeCodes),
    expiresAt: input.expiresAt,
    acceptedAt: null,
    createdAt: now,
  }
}

export async function acceptInvitation(db: Queryable, tokenHash: string, user: AuthUser): Promise<Invitation | null> {
  const result = await db.query<{
    id: string
    workspace_id: string
    role: WorkspaceMemberRole
    invitee_username: string | null
    college_codes: string[]
    expires_at: string
    accepted_at: string | null
    created_at: string
  }>(
    `SELECT id, workspace_id, role, invitee_username, college_codes, expires_at::TEXT, accepted_at::TEXT, created_at::TEXT
     FROM invitations
     WHERE token_hash = $1
       AND accepted_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  )

  const invitation = result.rows[0]
  if (!invitation)
    return null

  if (invitation.invitee_username && invitation.invitee_username !== user.username)
    throw new Error('INVITATION_TARGET_MISMATCH')

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

  let seatLimit: number | null = null
  if (workspaceType === 'team') {
    const quotaResult = await db.query<{ seat_limit: number }>(
      `SELECT seat_limit
       FROM team_quotas
       WHERE workspace_id = $1
       LIMIT 1
       FOR UPDATE`,
      [invitation.workspace_id],
    )
    seatLimit = quotaResult.rows[0]?.seat_limit ?? null
  }

  const memberExistsResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count
     FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2
       AND is_active = TRUE`,
    [invitation.workspace_id, user.id],
  )

  const alreadyMember = Number(memberExistsResult.rows[0]?.count || '0') > 0

  const currentSeatResult = await db.query<{ count: string }>(
    `SELECT COUNT(DISTINCT user_id)::TEXT AS count
     FROM workspace_members
     WHERE workspace_id = $1
       AND is_active = TRUE`,
    [invitation.workspace_id],
  )
  const currentSeats = Number(currentSeatResult.rows[0]?.count || '0')

  if (
    workspaceType === 'team'
    && !alreadyMember
    && seatLimit !== null
    && currentSeats >= Number(seatLimit)
  ) {
    throw new Error('SEAT_LIMIT_REACHED')
  }

  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, college_codes, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::TEXT[], TRUE, $6, $6)
     ON CONFLICT (workspace_id, user_id, role)
     DO UPDATE SET
       college_codes = EXCLUDED.college_codes,
       is_active = TRUE,
       updated_at = EXCLUDED.updated_at`,
    [randomUUID(), invitation.workspace_id, user.id, invitation.role, invitation.college_codes || [], now],
  )

  await db.query(
    `UPDATE invitations
     SET accepted_at = $2
     WHERE id = $1`,
    [invitation.id, now],
  )

  await refreshTeamSeatUsage(db, invitation.workspace_id)

  return {
    id: invitation.id,
    workspaceId: invitation.workspace_id,
    role: invitation.role,
    inviteeUsername: invitation.invitee_username,
    collegeCodes: normalizeStringArray(invitation.college_codes),
    expiresAt: invitation.expires_at,
    acceptedAt: now,
    createdAt: invitation.created_at,
  }
}

async function ensureProjectOwnerMember(db: Queryable, projectId: string, userId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO project_members (id, project_id, user_id, role, added_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'owner', $3, $4, $4)
     ON CONFLICT (project_id, user_id)
     DO UPDATE SET role = 'owner', updated_at = EXCLUDED.updated_at`,
    [randomUUID(), projectId, userId, now],
  )
}

async function upsertProjectManagers(db: Queryable, projectId: string, actorUserId: string, userIds: string[]): Promise<void> {
  const targets = dedupeBy(normalizeStringArray(userIds), item => item)
  if (targets.length === 0)
    return

  const now = new Date().toISOString()
  for (const userId of targets) {
    await db.query(
      `INSERT INTO project_members (id, project_id, user_id, role, added_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'manager', $4, $5, $5)
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET
         role = CASE WHEN project_members.role = 'owner' THEN 'owner' ELSE 'manager' END,
         updated_at = EXCLUDED.updated_at`,
      [randomUUID(), projectId, userId, actorUserId, now],
    )
  }
}

async function replaceCollegeBindings(db: Queryable, projectId: string, bindings: ProjectCollegeBinding[]): Promise<void> {
  await db.query('DELETE FROM project_college_bindings WHERE project_id = $1', [projectId])

  const uniqueBindings = dedupeBy(
    bindings
      .map(item => ({
        collegeCode: String(item.collegeCode || '').trim(),
        collegeName: String(item.collegeName || '').trim(),
      }))
      .filter(item => item.collegeCode),
    item => item.collegeCode,
  )

  for (const binding of uniqueBindings) {
    await db.query(
      `INSERT INTO project_college_bindings (id, project_id, college_code, college_name, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), projectId, binding.collegeCode, binding.collegeName || binding.collegeCode],
    )
  }
}

async function resolveAdvisorUserIds(
  db: Queryable,
  advisorUserIds: string[] | undefined,
  advisorUsernames: string[] | undefined,
): Promise<string[]> {
  const ids = normalizeStringArray(advisorUserIds)
  const usernames = normalizeStringArray(advisorUsernames)

  if (usernames.length === 0)
    return dedupeBy(ids, item => item)

  const result = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE username = ANY($1::TEXT[])',
    [usernames],
  )

  return dedupeBy([...ids, ...result.rows.map(row => row.id)], item => item)
}

async function replaceAdvisorBindings(
  db: Queryable,
  projectId: string,
  actorUserId: string,
  advisorUserIds: string[] | undefined,
  advisorUsernames?: string[] | undefined,
): Promise<void> {
  const resolvedIds = await resolveAdvisorUserIds(db, advisorUserIds, advisorUsernames)

  await db.query('DELETE FROM project_advisor_bindings WHERE project_id = $1', [projectId])

  for (const userId of resolvedIds) {
    await db.query(
      `INSERT INTO project_advisor_bindings (id, project_id, advisor_user_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (project_id, advisor_user_id) DO NOTHING`,
      [randomUUID(), projectId, userId],
    )
  }

  await upsertProjectManagers(db, projectId, actorUserId, resolvedIds)
}

async function loadProjectBindingsByIds(
  db: Queryable,
  projectIds: string[],
): Promise<{ collegeMap: Map<string, ProjectCollegeBinding[]>, advisorMap: Map<string, ProjectAdvisorBinding[]> }> {
  const collegeMap = new Map<string, ProjectCollegeBinding[]>()
  const advisorMap = new Map<string, ProjectAdvisorBinding[]>()

  if (projectIds.length === 0)
    return { collegeMap, advisorMap }

  const collegeRows = await db.query<{
    project_id: string
    college_code: string
    college_name: string
  }>(
    `SELECT project_id, college_code, college_name
     FROM project_college_bindings
     WHERE project_id = ANY($1::TEXT[])
     ORDER BY created_at ASC`,
    [projectIds],
  )

  for (const row of collegeRows.rows) {
    const list = collegeMap.get(row.project_id) || []
    list.push({
      collegeCode: row.college_code,
      collegeName: row.college_name,
    })
    collegeMap.set(row.project_id, list)
  }

  const advisorRows = await db.query<{
    project_id: string
    advisor_user_id: string
    username: string
  }>(
    `SELECT pab.project_id, pab.advisor_user_id, u.username
     FROM project_advisor_bindings pab
     JOIN users u ON u.id = pab.advisor_user_id
     WHERE pab.project_id = ANY($1::TEXT[])
     ORDER BY pab.created_at ASC`,
    [projectIds],
  )

  for (const row of advisorRows.rows) {
    const list = advisorMap.get(row.project_id) || []
    list.push({
      userId: row.advisor_user_id,
      username: row.username,
    })
    advisorMap.set(row.project_id, list)
  }

  return { collegeMap, advisorMap }
}

export async function createProject(db: Queryable, input: CreateProjectInput): Promise<Project> {
  const now = new Date().toISOString()
  const projectId = randomUUID()
  const contestIds = normalizeProjectContestIds(input.contestId, input.contestIds)
  const primaryContestId = contestIds[0] || input.contestId

  const createResult = await db.query<ProjectRow>(
    `INSERT INTO projects (
      id,
      workspace_id,
      owner_user_id,
      creator_user_id,
      payer_user_id,
      title,
      contest_id,
      track_id,
      contest_ids,
      problem_statement,
      innovation_points,
      tech_route_steps,
      scoring_mapping,
      risks,
      deliverables,
      summary,
      source,
      status,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9::TEXT[], $10, $11::TEXT[],
      $12::TEXT[], $13::TEXT[], $14::TEXT[], $15::TEXT[],
      $16, $17, $18, $19, $19
    )
    RETURNING
      id,
      workspace_id,
      owner_user_id,
      creator_user_id,
      payer_user_id,
      title,
      contest_id,
      track_id,
      contest_ids,
      problem_statement,
      innovation_points,
      tech_route_steps,
      scoring_mapping,
      risks,
      deliverables,
      summary,
      source,
      status,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      projectId,
      input.workspaceId,
      input.ownerUserId,
      input.creatorUserId,
      input.payerUserId || null,
      input.title,
      primaryContestId,
      input.trackId,
      contestIds,
      input.problemStatement,
      normalizeStringArray(input.innovationPoints),
      normalizeStringArray(input.techRouteSteps),
      normalizeStringArray(input.scoringMapping),
      normalizeStringArray(input.risks),
      normalizeStringArray(input.deliverables),
      input.summary || null,
      input.source,
      input.status || 'draft',
      now,
    ],
  )

  const row = createResult.rows[0]
  if (!row)
    throw new Error('failed to create project')

  await ensureProjectOwnerMember(db, projectId, input.ownerUserId)

  if (input.collegeBindings)
    await replaceCollegeBindings(db, projectId, input.collegeBindings)

  if (input.advisorUserIds)
    await replaceAdvisorBindings(db, projectId, input.creatorUserId, input.advisorUserIds)

  const { collegeMap, advisorMap } = await loadProjectBindingsByIds(db, [projectId])

  return mapProject(
    row,
    collegeMap.get(projectId) || [],
    advisorMap.get(projectId) || [],
  )
}

export async function batchCreateProjects(
  db: Queryable,
  creatorUserId: string,
  workspaceId: string,
  projects: Array<ProjectPayload & { source?: ProjectSource }>,
): Promise<Project[]> {
  const created: Project[] = []

  for (const project of projects) {
    const item = await createProject(db, {
      workspaceId,
      ownerUserId: creatorUserId,
      creatorUserId,
      payerUserId: creatorUserId,
      source: project.source || 'form',
      status: 'draft',
      title: project.title,
      contestId: project.contestId,
      trackId: project.trackId,
      contestIds: project.contestIds,
      problemStatement: project.problemStatement,
      innovationPoints: project.innovationPoints,
      techRouteSteps: project.techRouteSteps,
      scoringMapping: project.scoringMapping,
      risks: project.risks,
      deliverables: project.deliverables,
      summary: project.summary,
    })

    created.push(item)
  }

  return created
}

async function loadProjectsFromRows(db: Queryable, rows: ProjectRow[]): Promise<Project[]> {
  const projectIds = rows.map(row => row.id)
  const { collegeMap, advisorMap } = await loadProjectBindingsByIds(db, projectIds)

  return rows.map(row => mapProject(
    row,
    collegeMap.get(row.id) || [],
    advisorMap.get(row.id) || [],
  ))
}

export async function listVisibleProjects(
  db: Queryable,
  user: AuthUser,
  workspaceId?: string,
): Promise<Project[]> {
  if (user.isPlatformAdmin) {
    const result = await db.query<ProjectRow>(
      `SELECT
        id,
        workspace_id,
        owner_user_id,
        creator_user_id,
        payer_user_id,
        title,
        contest_id,
        track_id,
        contest_ids,
        problem_statement,
        innovation_points,
        tech_route_steps,
        scoring_mapping,
        risks,
        deliverables,
        summary,
        source,
        status,
        created_at::TEXT,
        updated_at::TEXT
       FROM projects
       WHERE ($1::TEXT IS NULL OR workspace_id = $1)
       ORDER BY updated_at DESC`,
      [workspaceId || null],
    )

    return loadProjectsFromRows(db, result.rows)
  }

  const result = await db.query<ProjectRow>(
    `SELECT DISTINCT
      p.id,
      p.workspace_id,
      p.owner_user_id,
      p.creator_user_id,
      p.payer_user_id,
      p.title,
      p.contest_id,
      p.track_id,
      p.contest_ids,
      p.problem_statement,
      p.innovation_points,
      p.tech_route_steps,
      p.scoring_mapping,
      p.risks,
      p.deliverables,
      p.summary,
      p.source,
      p.status,
      p.created_at::TEXT,
      p.updated_at::TEXT
     FROM projects p
     WHERE ($2::TEXT IS NULL OR p.workspace_id = $2)
       AND (
         EXISTS (
           SELECT 1
           FROM workspace_members wm
           WHERE wm.workspace_id = p.workspace_id
             AND wm.user_id = $1
             AND wm.is_active = TRUE
             AND wm.role = ANY($3::TEXT[])
         )
         OR EXISTS (
           SELECT 1
           FROM workspace_members wm
           JOIN project_college_bindings pcb ON pcb.project_id = p.id
           WHERE wm.workspace_id = p.workspace_id
             AND wm.user_id = $1
             AND wm.is_active = TRUE
             AND wm.role = 'college_admin'
             AND array_length(wm.college_codes, 1) IS NOT NULL
             AND pcb.college_code = ANY(wm.college_codes)
         )
         OR EXISTS (
           SELECT 1
           FROM project_members pm
           WHERE pm.project_id = p.id
             AND pm.user_id = $1
             AND pm.role = ANY($4::TEXT[])
         )
       )
     ORDER BY p.updated_at::TEXT DESC`,
    [user.id, workspaceId || null, FULL_WORKSPACE_ROLES, MANAGER_PROJECT_ROLES],
  )

  return loadProjectsFromRows(db, result.rows)
}

export async function getVisibleProjectById(
  db: Queryable,
  user: AuthUser,
  projectId: string,
): Promise<Project | null> {
  const projects = await listVisibleProjects(db, user)
  return projects.find(project => project.id === projectId) || null
}

export async function hasWorkspaceMembership(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
): Promise<boolean> {
  if (user.isPlatformAdmin)
    return true

  const access = await getWorkspaceAccess(db, user.id, workspaceId)
  return access.isMember
}

export async function hasWorkspaceRoles(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
  roles: WorkspaceMemberRole[],
): Promise<boolean> {
  if (user.isPlatformAdmin)
    return true

  const access = await getWorkspaceAccess(db, user.id, workspaceId)
  if (!access.isMember)
    return false

  return hasWorkspaceRole(access, roles)
}

export async function canManageProject(db: Queryable, user: AuthUser, projectId: string): Promise<boolean> {
  if (user.isPlatformAdmin)
    return true

  const workspaceRoleResult = await db.query<{ can_manage: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM projects p
      JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = $1
        AND wm.user_id = $2
        AND wm.is_active = TRUE
        AND wm.role = ANY($3::TEXT[])
    ) AS can_manage`,
    [projectId, user.id, FULL_WORKSPACE_ROLES],
  )

  if (workspaceRoleResult.rows[0]?.can_manage)
    return true

  const memberRoleResult = await db.query<{ can_manage: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM project_members pm
      WHERE pm.project_id = $1
        AND pm.user_id = $2
        AND pm.role = ANY($3::TEXT[])
    ) AS can_manage`,
    [projectId, user.id, MANAGER_PROJECT_ROLES],
  )

  return Boolean(memberRoleResult.rows[0]?.can_manage)
}

export async function patchProjectBindings(
  db: Queryable,
  projectId: string,
  actorUserId: string,
  input: ProjectBindingPatch,
): Promise<Project | null> {
  if (Array.isArray(input.contestIds)) {
    const currentResult = await db.query<{ contest_id: string }>(
      `SELECT contest_id
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [projectId],
    )

    const currentContestId = String(currentResult.rows[0]?.contest_id || '').trim()
    const nextContestIds = normalizeProjectContestIds(currentContestId, input.contestIds)
    const nextPrimaryContestId = nextContestIds[0] || currentContestId

    if (nextPrimaryContestId) {
      await db.query(
        `UPDATE projects
         SET contest_id = $2,
             contest_ids = $3::TEXT[],
             updated_at = NOW()
         WHERE id = $1`,
        [projectId, nextPrimaryContestId, nextContestIds],
      )
    }
  }

  if (input.collegeBindings)
    await replaceCollegeBindings(db, projectId, input.collegeBindings)

  if (input.advisorUserIds || input.advisorUsernames)
    await replaceAdvisorBindings(db, projectId, actorUserId, input.advisorUserIds, input.advisorUsernames)

  const result = await db.query<ProjectRow>(
    `SELECT
      id,
      workspace_id,
      owner_user_id,
      creator_user_id,
      payer_user_id,
      title,
      contest_id,
      track_id,
      contest_ids,
      problem_statement,
      innovation_points,
      tech_route_steps,
      scoring_mapping,
      risks,
      deliverables,
      summary,
      source,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  const { collegeMap, advisorMap } = await loadProjectBindingsByIds(db, [projectId])

  return mapProject(
    row,
    collegeMap.get(projectId) || [],
    advisorMap.get(projectId) || [],
  )
}

export async function getWorkspaceType(db: Queryable, workspaceId: string): Promise<WorkspaceType | null> {
  const result = await db.query<{ type: WorkspaceType }>(
    'SELECT type FROM workspaces WHERE id = $1 LIMIT 1',
    [workspaceId],
  )

  return result.rows[0]?.type || null
}

export async function consumeAiQuota(
  db: Queryable,
  input: {
    workspaceId: string
    userId: string
    route: string
    units: number
  },
): Promise<{ allowed: boolean, remaining: number | null }> {
  const workspaceType = await getWorkspaceType(db, input.workspaceId)
  if (!workspaceType)
    return { allowed: false, remaining: null }

  if (workspaceType === 'personal') {
    return { allowed: true, remaining: null }
  }

  const quotaResult = await db.query<TeamQuotaRow>(
    `SELECT workspace_id, seat_limit, seat_used, ai_quota_total, ai_quota_used, reset_cycle, updated_at::TEXT
     FROM team_quotas
     WHERE workspace_id = $1
     FOR UPDATE`,
    [input.workspaceId],
  )

  if (quotaResult.rows.length === 0) {
    await db.query(
      `INSERT INTO team_quotas (workspace_id, seat_limit, seat_used, ai_quota_total, ai_quota_used, reset_cycle, updated_at)
       VALUES ($1, 20, 0, 1000, 0, 'monthly', NOW())`,
      [input.workspaceId],
    )

    return consumeAiQuota(db, input)
  }

  const quotaRow = quotaResult.rows[0]
  if (!quotaRow)
    return { allowed: false, remaining: null }

  const quota = mapTeamQuota(quotaRow)
  const nextUsed = quota.aiQuotaUsed + input.units
  if (nextUsed > quota.aiQuotaTotal) {
    return {
      allowed: false,
      remaining: Math.max(0, quota.aiQuotaTotal - quota.aiQuotaUsed),
    }
  }

  await db.query(
    `UPDATE team_quotas
     SET ai_quota_used = $2,
         updated_at = NOW()
     WHERE workspace_id = $1`,
    [input.workspaceId, nextUsed],
  )

  await db.query(
    `INSERT INTO ai_usage_ledger (id, workspace_id, user_id, route, units, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [randomUUID(), input.workspaceId, input.userId, input.route, input.units],
  )

  return {
    allowed: true,
    remaining: Math.max(0, quota.aiQuotaTotal - nextUsed),
  }
}
