import type { Queryable } from '~~/server/utils/db'
import type {
  AuthSession,
  AuthUser,
  Invitation,
  Project,
  ProjectAdvisorBinding,
  ProjectCollegeBinding,
  ProjectContestAdaptation,
  ProjectContestBinding,
  ProjectInvitationSummary,
  ProjectMemberManagementSnapshot,
  ProjectMemberRole,
  ProjectMemberSummary,
  ProjectPayload,
  ProjectSeatQuota,
  ProjectSeatQuotaSummary,
  ProjectSettingsDraft,
  ProjectSettingsDraftPayload,
  ProjectSettingsSnapshot,
  ProjectSource,
  ProjectStatus,
  TeamProfile,
  TeamQuota,
  WorkspaceMemberManagementSnapshot,
  WorkspaceMemberRole,
  WorkspaceMemberSummary,
  WorkspaceType,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import {
  teamAssertProjectCreationAllowed as assertWorkspaceProjectCreationAllowedImpl,
  teamCanManageProject as canManageProjectImpl,
} from '~~/server/utils/project-access-store'
import {
  teamAcceptInvitation as acceptInvitationImpl,
  teamCreateInvitation as createInvitationImpl,
  teamRevokeWorkspaceInvitation as revokeWorkspaceInvitationImpl,
} from '~~/server/utils/team-invitation-store'
import {
  teamEnsureWorkspaceMember as ensureWorkspaceMemberImpl,
  teamGetWorkspaceAccess as getWorkspaceAccessImpl,
  teamGetWorkspaceMemberManagementSnapshot as getWorkspaceMemberManagementSnapshotImpl,
  teamHasWorkspaceMembership as hasWorkspaceMembershipImpl,
  teamHasWorkspaceRole as hasWorkspaceRoleImpl,
  teamHasWorkspaceRoles as hasWorkspaceRolesImpl,
  teamPatchWorkspaceMemberRole as patchWorkspaceMemberRoleImpl,
  teamRemoveWorkspaceMember as removeWorkspaceMemberImpl,
} from '~~/server/utils/team-membership-store'
import {
  teamConsumeAiQuota as consumeAiQuotaImpl,
  teamGetWorkspaceType as getWorkspaceTypeImpl,
  teamPatchSeatLimit as patchWorkspaceSeatLimitImpl,
  teamRefreshSeatUsage as refreshTeamSeatUsageImpl,
} from '~~/server/utils/team-quota-store'
import {
  teamCreateWorkspace as createTeamWorkspaceImpl,
  teamListUserWorkspaces as listUserWorkspacesImpl,
} from '~~/server/utils/team-workspace-store'

const FULL_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin']
const BASIC_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['manager', 'member']
const WORKSPACE_CREATE_PROJECT_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']

const WORKSPACE_ROLE_PRIORITY: Record<WorkspaceMemberRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  member: 1,
}

const MAX_PROJECT_SEAT_LIMIT = 15
const MAX_PROJECT_ADVISOR_COUNT = 3

interface UserRow {
  id: string
  username: string
  is_platform_admin: boolean
  is_disabled: boolean
  created_at: string
  updated_at: string
}

interface ProjectMemberSummaryRow {
  project_id: string
  user_id: string
  username: string
  role: ProjectMemberRole
  added_by_user_id: string
  added_by_username: string
  created_at: string
  updated_at: string
}

interface ProjectInvitationSummaryRow {
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

interface ProjectSeatQuotaRow {
  project_id: string
  workspace_id: string
  seat_limit: number
  seat_used: number
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
  teamProfile?: TeamProfile | null
  seatLimit?: number
  aiQuotaTotal?: number
  resetCycle?: string
}

interface CreateInvitationInput {
  workspaceId: string
  projectId?: string | null
  projectRole?: ProjectMemberRole | null
  invitedByUserId: string
  tokenHash: string
  inviteeUsername?: string | null
  role: WorkspaceMemberRole
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

export interface ProjectSettingsCommonPatch {
  title?: string
  summary?: string
  problemStatement?: string
  innovationPoints?: string[]
  techRouteSteps?: string[]
  scoringMapping?: string[]
  risks?: string[]
  deliverables?: string[]
}

export interface ProjectSettingsPatchInput {
  common?: ProjectSettingsCommonPatch
  contestBindings?: Array<{
    contestId: string
    trackId: string
    sortOrder?: number
  }>
  currentContestId?: string
}

export interface ProjectAdaptationPatchInput {
  problemStatement?: string
  innovationPoints?: string[]
  techRouteSteps?: string[]
  scoringMapping?: string[]
  risks?: string[]
  deliverables?: string[]
  summary?: string
}

interface WorkspaceAccess {
  workspaceId: string
  roles: WorkspaceMemberRole[]
  isMember: boolean
}

interface ProjectContestBindingRow {
  project_id: string
  contest_id: string
  track_id: string
  sort_order: number
  updated_at: string
}

interface ProjectContestAdaptationRow {
  project_id: string
  contest_id: string
  track_id: string
  problem_statement: string
  innovation_points: string[]
  tech_route_steps: string[]
  scoring_mapping: string[]
  risks: string[]
  deliverables: string[]
  summary: string
  created_at: string
  updated_at: string
}

interface ProjectSettingsDraftRow {
  project_id: string
  payload: ProjectSettingsDraftPayload
  revision: string | number
  device_id: string
  created_at: string
  updated_at: string
}

export interface ProjectSettingsDraftUpsertInput {
  payload: ProjectSettingsDraftPayload
  deviceId?: string
  expectedRevision?: number | null
}

export interface ProjectSettingsDraftDeleteInput {
  expectedRevision?: number | null
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

function mapProjectContestBinding(row: ProjectContestBindingRow): ProjectContestBinding {
  return {
    contestId: row.contest_id,
    trackId: row.track_id,
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at,
  }
}

function mapProjectContestAdaptation(row: ProjectContestAdaptationRow): ProjectContestAdaptation {
  return {
    contestId: row.contest_id,
    trackId: row.track_id,
    problemStatement: row.problem_statement,
    innovationPoints: normalizeStringArray(row.innovation_points),
    techRouteSteps: normalizeStringArray(row.tech_route_steps),
    scoringMapping: normalizeStringArray(row.scoring_mapping),
    risks: normalizeStringArray(row.risks),
    deliverables: normalizeStringArray(row.deliverables),
    summary: row.summary || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function createEmptyProjectSettingsDraftPayload(): ProjectSettingsDraftPayload {
  return {
    updatedAt: '',
    common: {
      title: '',
      summary: '',
      problemStatement: '',
      innovationPointsText: '',
      techRouteStepsText: '',
      scoringMappingText: '',
      risksText: '',
      deliverablesText: '',
    },
    bindings: [],
    currentContestId: '',
    adaptationDrafts: {},
    ui: {
      leftSidebarCollapsed: false,
      rightSidebarCollapsed: false,
    },
  }
}

function mapProjectSettingsDraft(row: ProjectSettingsDraftRow): ProjectSettingsDraft {
  const payload = row.payload && typeof row.payload === 'object'
    ? row.payload
    : createEmptyProjectSettingsDraftPayload()

  return {
    projectId: row.project_id,
    payload,
    revision: Math.max(1, Number(row.revision || 1)),
    deviceId: String(row.device_id || ''),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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

function isSameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length)
    return false

  for (const [index, value] of left.entries()) {
    if (right[index] !== value)
      return false
  }

  return true
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

function mapProjectMemberSummary(row: ProjectMemberSummaryRow): ProjectMemberSummary {
  return {
    projectId: row.project_id,
    userId: row.user_id,
    username: row.username,
    role: row.role,
    addedByUserId: row.added_by_user_id,
    addedByUsername: row.added_by_username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProjectInvitationSummary(row: ProjectInvitationSummaryRow): ProjectInvitationSummary {
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

function mapProjectSeatQuota(row: ProjectSeatQuotaRow): ProjectSeatQuota {
  return {
    projectId: row.project_id,
    teamId: row.workspace_id,
    workspaceId: row.workspace_id,
    seatLimit: Math.max(1, Number(row.seat_limit || 1)),
    seatUsed: Math.max(0, Number(row.seat_used || 0)),
    updatedAt: row.updated_at,
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

function mapProject(
  row: ProjectRow,
  collegeBindings: ProjectCollegeBinding[],
  advisorBindings: ProjectAdvisorBinding[],
  projectSeatQuota?: ProjectSeatQuotaSummary | null,
): Project {
  const contestIds = normalizeProjectContestIds(row.contest_id, row.contest_ids)
  return {
    id: row.id,
    teamId: row.workspace_id,
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
    projectSeatQuota: projectSeatQuota || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProjectSeatQuotaSummary(row: ProjectSeatQuotaRow): ProjectSeatQuotaSummary {
  return {
    seatLimit: Math.max(1, Number(row.seat_limit || 1)),
    seatUsed: Math.max(0, Number(row.seat_used || 0)),
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
    `INSERT INTO workspaces (id, type, name, owner_user_id, team_profile, created_at, updated_at)
     VALUES ($1, 'personal', $2, $3, NULL, $4, $4)`,
    [workspaceId, `${input.username} Personal`, userId, now],
  )

  await db.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'owner', TRUE, $4, $4)`,
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

export async function listUserWorkspaces(db: Queryable, userId: string): Promise<WorkspaceWithQuota[]> {
  return listUserWorkspacesImpl(db, userId)
}

export async function refreshTeamSeatUsage(db: Queryable, workspaceId: string): Promise<void> {
  return refreshTeamSeatUsageImpl(db, workspaceId)
}

export async function createTeamWorkspace(db: Queryable, input: CreateTeamWorkspaceInput): Promise<WorkspaceWithQuota> {
  return createTeamWorkspaceImpl(db, input)
}

export async function getWorkspaceAccess(db: Queryable, userId: string, workspaceId: string): Promise<WorkspaceAccess> {
  return getWorkspaceAccessImpl(db, userId, workspaceId)
}

export function hasWorkspaceRole(access: WorkspaceAccess, expected: WorkspaceMemberRole[]): boolean {
  return hasWorkspaceRoleImpl(access, expected)
}

export async function getWorkspaceMemberManagementSnapshot(
  db: Queryable,
  workspaceId: string,
): Promise<WorkspaceMemberManagementSnapshot> {
  return getWorkspaceMemberManagementSnapshotImpl(db, workspaceId)
}

export async function createInvitation(db: Queryable, input: CreateInvitationInput): Promise<Invitation> {
  return createInvitationImpl(db, input)
}

export async function acceptInvitation(db: Queryable, tokenHash: string, user: AuthUser): Promise<Invitation | null> {
  return acceptInvitationImpl(db, tokenHash, user)
}

export async function revokeWorkspaceInvitation(
  db: Queryable,
  input: {
    workspaceId: string
    invitationId: string
    actorUser: AuthUser
  },
): Promise<boolean> {
  return revokeWorkspaceInvitationImpl(db, input)
}

async function resolveWorkspaceDefaultProjectSeatLimit(db: Queryable, workspaceId: string): Promise<number> {
  const result = await db.query<{
    type: WorkspaceType
    default_project_seat_limit: number | null
  }>(
    `SELECT
      w.type,
      bp.default_project_seat_limit
     FROM workspaces w
     LEFT JOIN workspace_billing wb ON wb.workspace_id = w.id
     LEFT JOIN billing_plans bp ON bp.id = wb.plan_id
     WHERE w.id = $1
     LIMIT 1`,
    [workspaceId],
  )

  const row = result.rows[0]
  if (!row)
    return MAX_PROJECT_SEAT_LIMIT

  return MAX_PROJECT_SEAT_LIMIT
}

export async function ensureWorkspaceMember(
  db: Queryable,
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole = 'member',
): Promise<void> {
  return ensureWorkspaceMemberImpl(db, workspaceId, userId, role)
}

export async function refreshProjectSeatUsage(db: Queryable, projectId: string): Promise<void> {
  const usageResult = await db.query<{ count: string }>(
    `SELECT COUNT(DISTINCT pm.user_id)::TEXT AS count
     FROM project_members pm
     WHERE pm.project_id = $1`,
    [projectId],
  )

  const seatUsed = Math.max(0, Number(usageResult.rows[0]?.count || '0'))

  await db.query(
    `UPDATE project_seat_quotas
     SET seat_used = $2,
         updated_at = NOW()
     WHERE project_id = $1`,
    [projectId, seatUsed],
  )
}

export async function ensureProjectSeatQuota(
  db: Queryable,
  projectId: string,
  workspaceId: string,
  seatLimit?: number,
): Promise<ProjectSeatQuota> {
  const defaultSeatLimit = seatLimit !== undefined
    ? Math.max(1, Math.trunc(Number(seatLimit || 1)))
    : await resolveWorkspaceDefaultProjectSeatLimit(db, workspaceId)

  const result = await db.query<ProjectSeatQuotaRow>(
    `INSERT INTO project_seat_quotas (
      project_id,
      workspace_id,
      seat_limit,
      seat_used,
      updated_at
    ) VALUES (
      $1, $2, $3, 0, NOW()
    )
    ON CONFLICT (project_id)
    DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      seat_limit = GREATEST(1, project_seat_quotas.seat_limit),
      updated_at = EXCLUDED.updated_at
    RETURNING
      project_id,
      workspace_id,
      seat_limit,
      seat_used,
      updated_at::TEXT`,
    [projectId, workspaceId, defaultSeatLimit],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('PROJECT_SEAT_QUOTA_WRITE_FAILED')

  await refreshProjectSeatUsage(db, projectId)

  const refreshed = await db.query<ProjectSeatQuotaRow>(
    `SELECT
      project_id,
      workspace_id,
      seat_limit,
      seat_used,
      updated_at::TEXT
     FROM project_seat_quotas
     WHERE project_id = $1
     LIMIT 1`,
    [projectId],
  )

  const quotaRow = refreshed.rows[0] || row
  return mapProjectSeatQuota(quotaRow)
}

export async function getProjectSeatQuotaByProjectId(
  db: Queryable,
  projectId: string,
): Promise<ProjectSeatQuota | null> {
  const result = await db.query<ProjectSeatQuotaRow>(
    `SELECT
      project_id,
      workspace_id,
      seat_limit,
      seat_used,
      updated_at::TEXT
     FROM project_seat_quotas
     WHERE project_id = $1
     LIMIT 1`,
    [projectId],
  )

  const row = result.rows[0]
  return row ? mapProjectSeatQuota(row) : null
}

export async function assertProjectSeatAvailable(
  db: Queryable,
  projectId: string,
  workspaceId: string,
  additionalSeats = 1,
): Promise<void> {
  const normalizedAdditional = Math.max(0, Math.trunc(Number(additionalSeats || 0)))
  if (normalizedAdditional <= 0)
    return

  await ensureProjectSeatQuota(db, projectId, workspaceId)

  const quotaResult = await db.query<ProjectSeatQuotaRow>(
    `SELECT
      project_id,
      workspace_id,
      seat_limit,
      seat_used,
      updated_at::TEXT
     FROM project_seat_quotas
     WHERE project_id = $1
     LIMIT 1
     FOR UPDATE`,
    [projectId],
  )

  const quota = quotaResult.rows[0]
  if (!quota)
    throw new Error('PROJECT_SEAT_QUOTA_NOT_FOUND')

  const seatLimit = Math.max(1, Number(quota.seat_limit || 1))
  const effectiveSeatLimit = Math.min(MAX_PROJECT_SEAT_LIMIT, seatLimit)
  const seatUsed = Math.max(0, Number(quota.seat_used || 0))
  if (seatUsed + normalizedAdditional > effectiveSeatLimit)
    throw new Error('PROJECT_SEAT_LIMIT_REACHED')
}

export async function assertWorkspaceProjectCreationAllowed(
  db: Queryable,
  workspaceId: string,
): Promise<void> {
  return assertWorkspaceProjectCreationAllowedImpl(db, workspaceId)
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

async function ensureProjectManagerMember(db: Queryable, projectId: string, userId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO project_members (id, project_id, user_id, role, added_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'manager', $3, $4, $4)
     ON CONFLICT (project_id, user_id)
     DO UPDATE SET
       role = CASE WHEN project_members.role = 'owner' THEN 'owner' ELSE 'manager' END,
       updated_at = EXCLUDED.updated_at`,
    [randomUUID(), projectId, userId, now],
  )
}

async function upsertProjectManagers(db: Queryable, projectId: string, actorUserId: string, userIds: string[]): Promise<void> {
  const targets = dedupeBy(normalizeStringArray(userIds), item => item)
  if (targets.length === 0)
    return

  const projectResult = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId],
  )
  const workspaceId = String(projectResult.rows[0]?.workspace_id || '').trim()
  if (!workspaceId)
    throw new Error('PROJECT_NOT_FOUND')

  const now = new Date().toISOString()
  for (const userId of targets) {
    await ensureWorkspaceMember(db, workspaceId, userId, 'member')

    const existingResult = await db.query<{ role: ProjectMemberRole }>(
      `SELECT role
       FROM project_members
       WHERE project_id = $1
         AND user_id = $2
       LIMIT 1`,
      [projectId, userId],
    )

    if (!existingResult.rows[0]?.role)
      await assertProjectSeatAvailable(db, projectId, workspaceId, 1)

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
  if (resolvedIds.length > MAX_PROJECT_ADVISOR_COUNT)
    throw new Error('PROJECT_ADVISOR_LIMIT_EXCEEDED')

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

async function loadProjectRowById(db: Queryable, projectId: string): Promise<ProjectRow | null> {
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

  return result.rows[0] || null
}

async function loadMappedProjectById(db: Queryable, projectId: string): Promise<Project | null> {
  const row = await loadProjectRowById(db, projectId)
  if (!row)
    return null

  const { collegeMap, advisorMap } = await loadProjectBindingsByIds(db, [projectId])
  return mapProject(
    row,
    collegeMap.get(projectId) || [],
    advisorMap.get(projectId) || [],
  )
}

async function resolveDefaultTrackIdByContestId(db: Queryable, contestId: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM contest_tracks
     WHERE contest_id = $1
       AND status <> 'archived'
     ORDER BY
       CASE WHEN status = 'published' THEN 0 ELSE 1 END,
       sort_order ASC,
       created_at ASC
     LIMIT 1`,
    [contestId],
  )

  const trackId = String(result.rows[0]?.id || '').trim()
  if (!trackId)
    throw new Error('TRACK_NOT_FOUND')
  return trackId
}

async function listExistingContestIds(db: Queryable, contestIds: string[]): Promise<string[]> {
  const normalizedContestIds = uniqueStringArray(contestIds)
  if (normalizedContestIds.length === 0)
    return []

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM contests
     WHERE id = ANY($1::TEXT[])`,
    [normalizedContestIds],
  )
  const existingContestIdSet = new Set(result.rows.map(row => String(row.id || '').trim()).filter(Boolean))
  return normalizedContestIds.filter(contestId => existingContestIdSet.has(contestId))
}

async function resolveContestIdByTrackId(db: Queryable, trackId: string): Promise<string> {
  const normalizedTrackId = String(trackId || '').trim()
  if (!normalizedTrackId)
    return ''

  const result = await db.query<{ contest_id: string }>(
    `SELECT contest_id
     FROM contest_tracks
     WHERE id = $1
     LIMIT 1`,
    [normalizedTrackId],
  )

  return String(result.rows[0]?.contest_id || '').trim()
}

async function resolveSeedContestIds(db: Queryable, projectRow: ProjectRow): Promise<string[]> {
  const normalizedContestIds = normalizeProjectContestIds(projectRow.contest_id, projectRow.contest_ids)
  const existingContestIds = await listExistingContestIds(db, normalizedContestIds)
  if (existingContestIds.length > 0)
    return existingContestIds

  const contestIdByTrack = await resolveContestIdByTrackId(db, projectRow.track_id)
  if (!contestIdByTrack)
    return []

  return listExistingContestIds(db, [contestIdByTrack])
}

async function resolveSeedTrackIdByContestId(
  db: Queryable,
  contestId: string,
  preferredTrackId: string,
): Promise<string> {
  const normalizedPreferredTrackId = String(preferredTrackId || '').trim()
  if (normalizedPreferredTrackId) {
    const result = await db.query<{ ok: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM contest_tracks
        WHERE id = $1
          AND contest_id = $2
      ) AS ok`,
      [normalizedPreferredTrackId, contestId],
    )

    if (result.rows[0]?.ok)
      return normalizedPreferredTrackId
  }

  try {
    return await resolveDefaultTrackIdByContestId(db, contestId)
  }
  catch (error) {
    if (error instanceof Error && error.message === 'TRACK_NOT_FOUND')
      return ''
    throw error
  }
}

async function listProjectContestBindingsByProjectId(
  db: Queryable,
  projectId: string,
): Promise<ProjectContestBinding[]> {
  const result = await db.query<ProjectContestBindingRow>(
    `SELECT
      project_id,
      contest_id,
      track_id,
      sort_order,
      updated_at::TEXT
     FROM project_contest_bindings
     WHERE project_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  )

  return result.rows.map(mapProjectContestBinding)
}

async function getProjectContestBindingByContestId(
  db: Queryable,
  projectId: string,
  contestId: string,
): Promise<ProjectContestBinding | null> {
  const result = await db.query<ProjectContestBindingRow>(
    `SELECT
      project_id,
      contest_id,
      track_id,
      sort_order,
      updated_at::TEXT
     FROM project_contest_bindings
     WHERE project_id = $1
       AND contest_id = $2
     LIMIT 1`,
    [projectId, contestId],
  )

  const row = result.rows[0]
  return row ? mapProjectContestBinding(row) : null
}

async function getProjectContestAdaptationByContestId(
  db: Queryable,
  projectId: string,
  contestId: string,
): Promise<ProjectContestAdaptation | null> {
  const result = await db.query<ProjectContestAdaptationRow>(
    `SELECT
      project_id,
      contest_id,
      track_id,
      problem_statement,
      innovation_points,
      tech_route_steps,
      scoring_mapping,
      risks,
      deliverables,
      summary,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_contest_adaptations
     WHERE project_id = $1
       AND contest_id = $2
     LIMIT 1`,
    [projectId, contestId],
  )

  const row = result.rows[0]
  return row ? mapProjectContestAdaptation(row) : null
}

async function ensureProjectContestSettingsSeeded(
  db: Queryable,
  projectId: string,
): Promise<void> {
  const projectRow = await loadProjectRowById(db, projectId)
  if (!projectRow)
    return

  const now = new Date().toISOString()
  const seedContestIds = await resolveSeedContestIds(db, projectRow)
  if (seedContestIds.length === 0)
    return

  const existingBindings = await listProjectContestBindingsByProjectId(db, projectId)
  const existingContestSet = new Set(existingBindings.map(item => item.contestId))

  if (existingBindings.length === 0) {
    for (const [index, contestId] of seedContestIds.entries()) {
      const preferredTrackId = contestId === projectRow.contest_id
        ? String(projectRow.track_id || '').trim()
        : ''
      const trackId = await resolveSeedTrackIdByContestId(db, contestId, preferredTrackId)
      if (!trackId)
        continue

      await db.query(
        `INSERT INTO project_contest_bindings (
          id,
          project_id,
          contest_id,
          track_id,
          sort_order,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (project_id, contest_id)
        DO UPDATE SET
          track_id = EXCLUDED.track_id,
          sort_order = EXCLUDED.sort_order,
          updated_at = EXCLUDED.updated_at`,
        [randomUUID(), projectId, contestId, trackId, index, now],
      )
    }
  }
  else {
    let nextSortOrder = existingBindings.length
    for (const contestId of seedContestIds) {
      if (existingContestSet.has(contestId))
        continue

      const preferredTrackId = contestId === projectRow.contest_id
        ? String(projectRow.track_id || '').trim()
        : ''
      const trackId = await resolveSeedTrackIdByContestId(db, contestId, preferredTrackId)
      if (!trackId)
        continue

      await db.query(
        `INSERT INTO project_contest_bindings (
          id,
          project_id,
          contest_id,
          track_id,
          sort_order,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (project_id, contest_id) DO NOTHING`,
        [randomUUID(), projectId, contestId, trackId, nextSortOrder, now],
      )
      nextSortOrder++
    }
  }

  const finalBindings = await listProjectContestBindingsByProjectId(db, projectId)
  if (finalBindings.length === 0)
    return

  const nextContestIds = finalBindings.map(item => item.contestId)
  const nextPrimary = finalBindings[0]!
  const currentContestIds = normalizeProjectContestIds(projectRow.contest_id, projectRow.contest_ids)
  if (
    projectRow.contest_id !== nextPrimary.contestId
    || projectRow.track_id !== nextPrimary.trackId
    || !isSameStringArray(currentContestIds, nextContestIds)
  ) {
    await db.query(
      `UPDATE projects
       SET contest_id = $2,
           track_id = $3,
           contest_ids = $4::TEXT[],
           updated_at = NOW()
       WHERE id = $1`,
      [projectId, nextPrimary.contestId, nextPrimary.trackId, nextContestIds],
    )
  }

  for (const binding of finalBindings) {
    await db.query(
      `INSERT INTO project_contest_adaptations (
        id,
        project_id,
        contest_id,
        track_id,
        problem_statement,
        innovation_points,
        tech_route_steps,
        scoring_mapping,
        risks,
        deliverables,
        summary,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::TEXT[], $7::TEXT[], $8::TEXT[], $9::TEXT[], $10::TEXT[], $11, $12, $12
      )
      ON CONFLICT (project_id, contest_id) DO NOTHING`,
      [
        randomUUID(),
        projectId,
        binding.contestId,
        binding.trackId,
        projectRow.problem_statement,
        normalizeStringArray(projectRow.innovation_points),
        normalizeStringArray(projectRow.tech_route_steps),
        normalizeStringArray(projectRow.scoring_mapping),
        normalizeStringArray(projectRow.risks),
        normalizeStringArray(projectRow.deliverables),
        String(projectRow.summary || ''),
        now,
      ],
    )
  }
}

async function validateProjectContestBindings(
  db: Queryable,
  bindings: Array<{ contestId: string, trackId: string, sortOrder?: number }>,
): Promise<Array<{ contestId: string, trackId: string, sortOrder: number }>> {
  const normalized = bindings
    .map((item, index) => ({
      contestId: String(item.contestId || '').trim(),
      trackId: String(item.trackId || '').trim(),
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
    }))
    .filter(item => item.contestId && item.trackId)

  if (normalized.length === 0)
    throw new Error('PROJECT_CONTEST_BINDINGS_REQUIRED')

  const uniqueContests = new Set<string>()
  for (const item of normalized) {
    if (uniqueContests.has(item.contestId))
      throw new Error('PROJECT_CONTEST_BINDINGS_DUPLICATED')
    uniqueContests.add(item.contestId)

    const trackResult = await db.query<{ ok: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM contest_tracks
        WHERE id = $1
          AND contest_id = $2
      ) AS ok`,
      [item.trackId, item.contestId],
    )

    if (!trackResult.rows[0]?.ok)
      throw new Error('PROJECT_CONTEST_TRACK_MISMATCH')
  }

  return normalized.map((item, index) => ({
    contestId: item.contestId,
    trackId: item.trackId,
    sortOrder: index,
  }))
}

async function applyProjectContestBindings(
  db: Queryable,
  projectId: string,
  bindings: Array<{ contestId: string, trackId: string, sortOrder?: number }>,
): Promise<ProjectContestBinding[]> {
  const projectRow = await loadProjectRowById(db, projectId)
  if (!projectRow)
    throw new Error('PROJECT_NOT_FOUND')

  const normalized = await validateProjectContestBindings(db, bindings)
  const now = new Date().toISOString()

  for (const item of normalized) {
    await db.query(
      `INSERT INTO project_contest_bindings (
        id,
        project_id,
        contest_id,
        track_id,
        sort_order,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $6
      )
      ON CONFLICT (project_id, contest_id)
      DO UPDATE SET
        track_id = EXCLUDED.track_id,
        sort_order = EXCLUDED.sort_order,
        updated_at = EXCLUDED.updated_at`,
      [
        randomUUID(),
        projectId,
        item.contestId,
        item.trackId,
        item.sortOrder,
        now,
      ],
    )
  }

  const contestIds = normalized.map(item => item.contestId)
  await db.query(
    `DELETE FROM project_contest_bindings
     WHERE project_id = $1
       AND NOT (contest_id = ANY($2::TEXT[]))`,
    [projectId, contestIds],
  )

  const primary = normalized[0]!
  await db.query(
    `UPDATE projects
     SET contest_id = $2,
         track_id = $3,
         contest_ids = $4::TEXT[],
         updated_at = NOW()
     WHERE id = $1`,
    [projectId, primary.contestId, primary.trackId, contestIds],
  )

  for (const item of normalized) {
    await db.query(
      `INSERT INTO project_contest_adaptations (
        id,
        project_id,
        contest_id,
        track_id,
        problem_statement,
        innovation_points,
        tech_route_steps,
        scoring_mapping,
        risks,
        deliverables,
        summary,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::TEXT[], $7::TEXT[], $8::TEXT[], $9::TEXT[], $10::TEXT[], $11, $12, $12
      )
      ON CONFLICT (project_id, contest_id)
      DO UPDATE SET
        track_id = EXCLUDED.track_id,
        updated_at = EXCLUDED.updated_at`,
      [
        randomUUID(),
        projectId,
        item.contestId,
        item.trackId,
        projectRow.problem_statement,
        normalizeStringArray(projectRow.innovation_points),
        normalizeStringArray(projectRow.tech_route_steps),
        normalizeStringArray(projectRow.scoring_mapping),
        normalizeStringArray(projectRow.risks),
        normalizeStringArray(projectRow.deliverables),
        String(projectRow.summary || ''),
        now,
      ],
    )
  }

  await db.query(
    `DELETE FROM project_contest_adaptations
     WHERE project_id = $1
       AND NOT (contest_id = ANY($2::TEXT[]))`,
    [projectId, contestIds],
  )

  return listProjectContestBindingsByProjectId(db, projectId)
}

async function patchProjectCommonFields(
  db: Queryable,
  projectId: string,
  patch: ProjectSettingsCommonPatch,
): Promise<void> {
  const values: unknown[] = [projectId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (patch.title !== undefined)
    addSet('title', String(patch.title || '').trim())
  if (patch.summary !== undefined)
    addSet('summary', String(patch.summary || '').trim() || null)
  if (patch.problemStatement !== undefined)
    addSet('problem_statement', String(patch.problemStatement || '').trim())
  if (patch.innovationPoints !== undefined)
    addSet('innovation_points', normalizeStringArray(patch.innovationPoints))
  if (patch.techRouteSteps !== undefined)
    addSet('tech_route_steps', normalizeStringArray(patch.techRouteSteps))
  if (patch.scoringMapping !== undefined)
    addSet('scoring_mapping', normalizeStringArray(patch.scoringMapping))
  if (patch.risks !== undefined)
    addSet('risks', normalizeStringArray(patch.risks))
  if (patch.deliverables !== undefined)
    addSet('deliverables', normalizeStringArray(patch.deliverables))

  if (sets.length === 0)
    return

  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE projects
     SET ${sets.join(', ')}
     WHERE id = $1`,
    values,
  )
}

async function upsertProjectContestAdaptation(
  db: Queryable,
  projectId: string,
  contestId: string,
  patch: ProjectAdaptationPatchInput,
): Promise<ProjectContestAdaptation> {
  const normalizedContestId = String(contestId || '').trim()
  if (!normalizedContestId)
    throw new Error('PROJECT_CONTEST_ID_REQUIRED')

  const projectRow = await loadProjectRowById(db, projectId)
  if (!projectRow)
    throw new Error('PROJECT_NOT_FOUND')

  const binding = await getProjectContestBindingByContestId(db, projectId, normalizedContestId)
  if (!binding)
    throw new Error('PROJECT_CONTEST_NOT_BOUND')

  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO project_contest_adaptations (
      id,
      project_id,
      contest_id,
      track_id,
      problem_statement,
      innovation_points,
      tech_route_steps,
      scoring_mapping,
      risks,
      deliverables,
      summary,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::TEXT[], $7::TEXT[], $8::TEXT[], $9::TEXT[], $10::TEXT[], $11, $12, $12
    )
    ON CONFLICT (project_id, contest_id) DO NOTHING`,
    [
      randomUUID(),
      projectId,
      normalizedContestId,
      binding.trackId,
      projectRow.problem_statement,
      normalizeStringArray(projectRow.innovation_points),
      normalizeStringArray(projectRow.tech_route_steps),
      normalizeStringArray(projectRow.scoring_mapping),
      normalizeStringArray(projectRow.risks),
      normalizeStringArray(projectRow.deliverables),
      String(projectRow.summary || ''),
      now,
    ],
  )

  const values: unknown[] = [projectId, normalizedContestId]
  const sets: string[] = ['track_id = $3']
  values.push(binding.trackId)

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (patch.problemStatement !== undefined)
    addSet('problem_statement', String(patch.problemStatement || '').trim())
  if (patch.innovationPoints !== undefined)
    addSet('innovation_points', normalizeStringArray(patch.innovationPoints))
  if (patch.techRouteSteps !== undefined)
    addSet('tech_route_steps', normalizeStringArray(patch.techRouteSteps))
  if (patch.scoringMapping !== undefined)
    addSet('scoring_mapping', normalizeStringArray(patch.scoringMapping))
  if (patch.risks !== undefined)
    addSet('risks', normalizeStringArray(patch.risks))
  if (patch.deliverables !== undefined)
    addSet('deliverables', normalizeStringArray(patch.deliverables))
  if (patch.summary !== undefined)
    addSet('summary', String(patch.summary || '').trim())

  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE project_contest_adaptations
     SET ${sets.join(', ')}
     WHERE project_id = $1
       AND contest_id = $2`,
    values,
  )

  const updated = await getProjectContestAdaptationByContestId(db, projectId, normalizedContestId)
  if (!updated)
    throw new Error('PROJECT_ADAPTATION_NOT_FOUND')
  return updated
}

export async function createProject(db: Queryable, input: CreateProjectInput): Promise<Project> {
  const now = new Date().toISOString()
  const projectId = randomUUID()
  const contestIds = normalizeProjectContestIds(input.contestId, input.contestIds)
  const primaryContestId = contestIds[0] || input.contestId
  const creatorIsDifferentOwner = input.creatorUserId !== input.ownerUserId

  await assertWorkspaceProjectCreationAllowed(db, input.workspaceId)

  const workspaceAccess = await getWorkspaceAccess(db, input.ownerUserId, input.workspaceId)
  if (!workspaceAccess.isMember)
    throw new Error('WORKSPACE_MEMBER_REQUIRED')
  if (!hasWorkspaceRole(workspaceAccess, WORKSPACE_CREATE_PROJECT_ROLES))
    throw new Error('FORBIDDEN')

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

  await ensureProjectSeatQuota(db, projectId, input.workspaceId)
  await assertProjectSeatAvailable(db, projectId, input.workspaceId, creatorIsDifferentOwner ? 2 : 1)
  await ensureProjectOwnerMember(db, projectId, input.ownerUserId)
  if (creatorIsDifferentOwner)
    await ensureProjectManagerMember(db, projectId, input.creatorUserId)
  await refreshProjectSeatUsage(db, projectId)

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
  const [bindings, projectSeatQuotaMap] = await Promise.all([
    loadProjectBindingsByIds(db, projectIds),
    listProjectSeatQuotaSummaryByProjectIds(db, projectIds),
  ])
  const { collegeMap, advisorMap } = bindings

  return rows.map(row => mapProject(
    row,
    collegeMap.get(row.id) || [],
    advisorMap.get(row.id) || [],
    projectSeatQuotaMap.get(row.id) || null,
  ))
}

async function listProjectSeatQuotaSummaryByProjectIds(
  db: Queryable,
  projectIds: string[],
): Promise<Map<string, ProjectSeatQuotaSummary>> {
  if (projectIds.length === 0)
    return new Map<string, ProjectSeatQuotaSummary>()

  const result = await db.query<ProjectSeatQuotaRow>(
    `SELECT
      project_id,
      workspace_id,
      seat_limit,
      seat_used,
      updated_at::TEXT
     FROM project_seat_quotas
     WHERE project_id = ANY($1::TEXT[])`,
    [projectIds],
  )

  return new Map(result.rows.map(row => [row.project_id, mapProjectSeatQuotaSummary(row)]))
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
    `SELECT
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
       AND EXISTS (
         SELECT 1
         FROM workspace_members wm_visible
         WHERE wm_visible.workspace_id = p.workspace_id
           AND wm_visible.user_id = $1
           AND wm_visible.is_active = TRUE
       )
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
           JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = wm.user_id
           WHERE wm.workspace_id = p.workspace_id
             AND wm.user_id = $1
             AND wm.is_active = TRUE
             AND wm.role = ANY($4::TEXT[])
         )
       )
     ORDER BY p.updated_at DESC`,
    [user.id, workspaceId || null, FULL_WORKSPACE_ROLES, BASIC_WORKSPACE_ROLES],
  )

  return loadProjectsFromRows(db, result.rows)
}

export async function getVisibleProjectById(
  db: Queryable,
  user: AuthUser,
  projectId: string,
): Promise<Project | null> {
  const normalizedProjectId = String(projectId || '').trim()
  if (!normalizedProjectId)
    return null

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
       WHERE id = $1
       LIMIT 1`,
      [normalizedProjectId],
    )

    const projects = await loadProjectsFromRows(db, result.rows)
    return projects[0] || null
  }

  const result = await db.query<ProjectRow>(
    `SELECT
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
     WHERE p.id = $2
       AND EXISTS (
         SELECT 1
         FROM workspace_members wm_visible
         WHERE wm_visible.workspace_id = p.workspace_id
           AND wm_visible.user_id = $1
           AND wm_visible.is_active = TRUE
       )
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
           JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = wm.user_id
           WHERE wm.workspace_id = p.workspace_id
             AND wm.user_id = $1
             AND wm.is_active = TRUE
             AND wm.role = ANY($4::TEXT[])
         )
       )
     LIMIT 1`,
    [user.id, normalizedProjectId, FULL_WORKSPACE_ROLES, BASIC_WORKSPACE_ROLES],
  )

  const projects = await loadProjectsFromRows(db, result.rows)
  return projects[0] || null
}

export async function getProjectSettingsSnapshot(
  db: Queryable,
  user: AuthUser,
  projectId: string,
  preferredContestId = '',
): Promise<ProjectSettingsSnapshot | null> {
  const visibleProject = await getVisibleProjectById(db, user, projectId)
  if (!visibleProject)
    return null

  await ensureProjectContestSettingsSeeded(db, projectId)
  const latestProject = await loadMappedProjectById(db, projectId)
  if (!latestProject)
    return null

  const bindings = await listProjectContestBindingsByProjectId(db, projectId)
  const preferred = String(preferredContestId || '').trim()
  const defaultContestId = preferred && bindings.some(item => item.contestId === preferred)
    ? preferred
    : (bindings[0]?.contestId || '')
  const currentAdaptation = defaultContestId
    ? await getProjectContestAdaptationByContestId(db, projectId, defaultContestId)
    : null

  return {
    project: latestProject,
    contestBindings: bindings,
    currentContestId: defaultContestId,
    currentAdaptation,
  }
}

export async function patchProjectSettings(
  db: Queryable,
  user: AuthUser,
  projectId: string,
  input: ProjectSettingsPatchInput,
): Promise<ProjectSettingsSnapshot | null> {
  const manageable = await canManageProject(db, user, projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')

  await ensureProjectContestSettingsSeeded(db, projectId)

  if (input.common)
    await patchProjectCommonFields(db, projectId, input.common)

  if (Array.isArray(input.contestBindings))
    await applyProjectContestBindings(db, projectId, input.contestBindings)

  return getProjectSettingsSnapshot(db, user, projectId, input.currentContestId || '')
}

export async function patchProjectContestAdaptation(
  db: Queryable,
  user: AuthUser,
  projectId: string,
  contestId: string,
  patch: ProjectAdaptationPatchInput,
): Promise<ProjectSettingsSnapshot | null> {
  const manageable = await canManageProject(db, user, projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')

  await ensureProjectContestSettingsSeeded(db, projectId)
  await upsertProjectContestAdaptation(db, projectId, contestId, patch)

  return getProjectSettingsSnapshot(db, user, projectId, contestId)
}

async function assertManageableProjectForSettingsDraft(
  db: Queryable,
  user: AuthUser,
  projectId: string,
): Promise<void> {
  const projectRow = await loadProjectRowById(db, projectId)
  if (!projectRow)
    throw new Error('PROJECT_NOT_FOUND')

  const manageable = await canManageProject(db, user, projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')
}

function normalizeExpectedRevision(value: number | null | undefined): number | null {
  if (!Number.isFinite(Number(value)))
    return null

  const normalized = Math.trunc(Number(value))
  return normalized > 0 ? normalized : null
}

async function getProjectSettingsDraftRowByUserProject(
  db: Queryable,
  userId: string,
  projectId: string,
  lock = false,
): Promise<ProjectSettingsDraftRow | null> {
  const lockClause = lock ? 'FOR UPDATE' : ''
  const result = await db.query<ProjectSettingsDraftRow>(
    `SELECT
      project_id,
      payload,
      revision,
      device_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_settings_drafts
     WHERE user_id = $1
       AND project_id = $2
     LIMIT 1
     ${lockClause}`,
    [userId, projectId],
  )

  return result.rows[0] || null
}

export async function getProjectSettingsDraft(
  db: Queryable,
  user: AuthUser,
  projectId: string,
): Promise<ProjectSettingsDraft | null> {
  await assertManageableProjectForSettingsDraft(db, user, projectId)

  const row = await getProjectSettingsDraftRowByUserProject(db, user.id, projectId)
  if (!row)
    return null

  return mapProjectSettingsDraft(row)
}

export async function upsertProjectSettingsDraft(
  db: Queryable,
  user: AuthUser,
  projectId: string,
  input: ProjectSettingsDraftUpsertInput,
): Promise<ProjectSettingsDraft> {
  await assertManageableProjectForSettingsDraft(db, user, projectId)

  const expectedRevision = normalizeExpectedRevision(input.expectedRevision)
  const now = new Date().toISOString()
  const deviceId = String(input.deviceId || '').trim()
  const existing = await getProjectSettingsDraftRowByUserProject(db, user.id, projectId, true)

  if (!existing) {
    if (expectedRevision !== null)
      throw new Error('PROJECT_SETTINGS_DRAFT_CONFLICT')

    const inserted = await db.query<ProjectSettingsDraftRow>(
      `INSERT INTO project_settings_drafts (
        id,
        user_id,
        project_id,
        payload,
        revision,
        device_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4::JSONB, 1, $5, $6, $6)
      RETURNING
        project_id,
        payload,
        revision,
        device_id,
        created_at::TEXT,
        updated_at::TEXT`,
      [randomUUID(), user.id, projectId, JSON.stringify(input.payload || {}), deviceId, now],
    )

    const row = inserted.rows[0]
    if (!row)
      throw new Error('PROJECT_SETTINGS_DRAFT_WRITE_FAILED')
    return mapProjectSettingsDraft(row)
  }

  const currentRevision = Math.max(1, Number(existing.revision || 1))
  if (expectedRevision === null || expectedRevision !== currentRevision)
    throw new Error('PROJECT_SETTINGS_DRAFT_CONFLICT')

  const updated = await db.query<ProjectSettingsDraftRow>(
    `UPDATE project_settings_drafts
     SET payload = $3::JSONB,
         revision = revision + 1,
         device_id = $4,
         updated_at = $5
     WHERE user_id = $1
       AND project_id = $2
     RETURNING
       project_id,
       payload,
       revision,
       device_id,
       created_at::TEXT,
       updated_at::TEXT`,
    [user.id, projectId, JSON.stringify(input.payload || {}), deviceId, now],
  )

  const row = updated.rows[0]
  if (!row)
    throw new Error('PROJECT_SETTINGS_DRAFT_WRITE_FAILED')
  return mapProjectSettingsDraft(row)
}

export async function deleteProjectSettingsDraft(
  db: Queryable,
  user: AuthUser,
  projectId: string,
  input: ProjectSettingsDraftDeleteInput = {},
): Promise<ProjectSettingsDraft | null> {
  await assertManageableProjectForSettingsDraft(db, user, projectId)

  const existing = await getProjectSettingsDraftRowByUserProject(db, user.id, projectId, true)
  if (!existing)
    return null

  const expectedRevision = normalizeExpectedRevision(input.expectedRevision)
  const currentRevision = Math.max(1, Number(existing.revision || 1))
  if (expectedRevision === null || expectedRevision !== currentRevision)
    throw new Error('PROJECT_SETTINGS_DRAFT_CONFLICT')

  const deleted = await db.query<ProjectSettingsDraftRow>(
    `DELETE FROM project_settings_drafts
     WHERE user_id = $1
       AND project_id = $2
     RETURNING
       project_id,
       payload,
       revision,
       device_id,
       created_at::TEXT,
       updated_at::TEXT`,
    [user.id, projectId],
  )

  const row = deleted.rows[0]
  return row ? mapProjectSettingsDraft(row) : null
}

export async function hasWorkspaceMembership(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
): Promise<boolean> {
  return hasWorkspaceMembershipImpl(db, user, workspaceId)
}

export async function hasWorkspaceRoles(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
  roles: WorkspaceMemberRole[],
): Promise<boolean> {
  return hasWorkspaceRolesImpl(db, user, workspaceId, roles)
}

export async function canManageProject(db: Queryable, user: AuthUser, projectId: string): Promise<boolean> {
  return canManageProjectImpl(db, user, projectId)
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

async function resolveProjectWorkspaceRow(
  db: Queryable,
  projectId: string,
): Promise<{ workspaceId: string, ownerUserId: string } | null> {
  const result = await db.query<{ workspace_id: string, owner_user_id: string }>(
    `SELECT workspace_id, owner_user_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  return {
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id,
  }
}

async function listProjectMembersByProjectId(
  db: Queryable,
  projectId: string,
): Promise<ProjectMemberSummary[]> {
  const result = await db.query<ProjectMemberSummaryRow>(
    `SELECT
      pm.project_id,
      pm.user_id,
      u.username,
      pm.role,
      pm.added_by_user_id,
      added_by.username AS added_by_username,
      pm.created_at::TEXT,
      pm.updated_at::TEXT
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     JOIN users added_by ON added_by.id = pm.added_by_user_id
     WHERE pm.project_id = $1
     ORDER BY
       CASE pm.role
         WHEN 'owner' THEN 0
         WHEN 'manager' THEN 1
         WHEN 'editor' THEN 2
         ELSE 3
       END,
       pm.created_at ASC`,
    [projectId],
  )

  return result.rows.map(mapProjectMemberSummary)
}

async function listProjectInvitationsByProjectId(
  db: Queryable,
  projectId: string,
): Promise<ProjectInvitationSummary[]> {
  const result = await db.query<ProjectInvitationSummaryRow>(
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
     JOIN projects p ON p.id = i.project_id
     WHERE i.project_id = $1
       AND i.accepted_at IS NULL
     ORDER BY i.created_at DESC`,
    [projectId],
  )

  return result.rows.map(mapProjectInvitationSummary)
}

export async function getProjectMemberManagementSnapshot(
  db: Queryable,
  projectId: string,
): Promise<ProjectMemberManagementSnapshot | null> {
  const project = await resolveProjectWorkspaceRow(db, projectId)
  if (!project)
    return null

  await ensureProjectSeatQuota(db, projectId, project.workspaceId)
  await refreshProjectSeatUsage(db, projectId)

  const [members, invitations, seatQuota] = await Promise.all([
    listProjectMembersByProjectId(db, projectId),
    listProjectInvitationsByProjectId(db, projectId),
    getProjectSeatQuotaByProjectId(db, projectId),
  ])

  return {
    projectId,
    teamId: project.workspaceId,
    workspaceId: project.workspaceId,
    members,
    invitations,
    seatQuota,
  }
}

async function resolveUserIdForProjectMemberUpsert(
  db: Queryable,
  targetUserId: string | undefined,
  targetUsername: string | undefined,
): Promise<string> {
  const normalizedUserId = String(targetUserId || '').trim()
  if (normalizedUserId) {
    const result = await db.query<{ id: string }>(
      `SELECT id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [normalizedUserId],
    )
    if (!result.rows[0]?.id)
      throw new Error('USER_NOT_FOUND')
    return normalizedUserId
  }

  const normalizedUsername = String(targetUsername || '').trim()
  if (!normalizedUsername)
    throw new Error('PROJECT_MEMBER_TARGET_REQUIRED')

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE username = $1
     LIMIT 1`,
    [normalizedUsername],
  )
  if (!result.rows[0]?.id)
    throw new Error('USER_NOT_FOUND')
  return result.rows[0].id
}

function normalizeProjectMemberRole(input: ProjectMemberRole | undefined): ProjectMemberRole {
  if (input === 'owner')
    return 'manager'
  if (input === 'manager' || input === 'editor' || input === 'viewer')
    return input
  return 'viewer'
}

function normalizeProjectInvitationRole(input: ProjectMemberRole | null | undefined): ProjectMemberRole {
  if (input === 'manager' || input === 'editor' || input === 'viewer')
    return input
  return 'viewer'
}

function canAssignElevatedProjectRole(actorUser: AuthUser, actorWorkspaceRoles: WorkspaceMemberRole[]): boolean {
  const actorHighestRole = actorUser.isPlatformAdmin ? 'owner' : getHighestWorkspaceRole(actorWorkspaceRoles)
  return actorUser.isPlatformAdmin
    || actorHighestRole === 'owner'
    || actorHighestRole === 'admin'
}

export async function upsertProjectMember(
  db: Queryable,
  input: {
    projectId: string
    actorUser: AuthUser
    targetUserId?: string
    targetUsername?: string
    role?: ProjectMemberRole
  },
): Promise<ProjectMemberManagementSnapshot> {
  const project = await resolveProjectWorkspaceRow(db, input.projectId)
  if (!project)
    throw new Error('PROJECT_NOT_FOUND')

  const manageable = await canManageProject(db, input.actorUser, input.projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')

  const actorWorkspaceRoles = input.actorUser.isPlatformAdmin
    ? ['owner'] as WorkspaceMemberRole[]
    : await getWorkspaceRolesByUserId(db, project.workspaceId, input.actorUser.id)
  const actorHighestRole = input.actorUser.isPlatformAdmin ? 'owner' : getHighestWorkspaceRole(actorWorkspaceRoles)
  const isOwnerOrAdminActor = input.actorUser.isPlatformAdmin
    || actorHighestRole === 'owner'
    || actorHighestRole === 'admin'

  const nextRole = normalizeProjectMemberRole(input.role)
  if (!isOwnerOrAdminActor && nextRole !== 'viewer')
    throw new Error('MANAGER_CAN_ONLY_ASSIGN_MEMBER')

  const targetUserId = await resolveUserIdForProjectMemberUpsert(db, input.targetUserId, input.targetUsername)

  const workspaceMemberResult = await db.query<{ role: WorkspaceMemberRole }>(
    `SELECT role
     FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2
       AND is_active = TRUE
     LIMIT 1`,
    [project.workspaceId, targetUserId],
  )

  if (!workspaceMemberResult.rows[0]?.role)
    await ensureWorkspaceMember(db, project.workspaceId, targetUserId, 'member')

  const existingProjectMember = await db.query<{ role: ProjectMemberRole }>(
    `SELECT role
     FROM project_members
     WHERE project_id = $1
       AND user_id = $2
     LIMIT 1`,
    [input.projectId, targetUserId],
  )

  const existingRole = existingProjectMember.rows[0]?.role
  const finalRole = existingRole === 'owner' ? 'owner' : nextRole
  if (!isOwnerOrAdminActor && finalRole !== 'viewer')
    throw new Error('MANAGER_CAN_ONLY_ASSIGN_MEMBER')

  if (!existingRole)
    await assertProjectSeatAvailable(db, input.projectId, project.workspaceId, 1)

  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO project_members (
      id,
      project_id,
      user_id,
      role,
      added_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $6
    )
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET
      role = CASE WHEN project_members.role = 'owner' THEN 'owner' ELSE EXCLUDED.role END,
      added_by_user_id = EXCLUDED.added_by_user_id,
      updated_at = EXCLUDED.updated_at`,
    [
      randomUUID(),
      input.projectId,
      targetUserId,
      finalRole,
      input.actorUser.id,
      now,
    ],
  )

  await refreshProjectSeatUsage(db, input.projectId)
  const snapshot = await getProjectMemberManagementSnapshot(db, input.projectId)
  if (!snapshot)
    throw new Error('PROJECT_NOT_FOUND')
  return snapshot
}

export async function createProjectInvitation(
  db: Queryable,
  input: {
    projectId: string
    actorUser: AuthUser
    tokenHash: string
    inviteeUsername?: string | null
    projectRole?: ProjectMemberRole | null
    expiresAt: string
  },
): Promise<Invitation> {
  const project = await resolveProjectWorkspaceRow(db, input.projectId)
  if (!project)
    throw new Error('PROJECT_NOT_FOUND')

  const manageable = await canManageProject(db, input.actorUser, input.projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')

  const actorWorkspaceRoles = input.actorUser.isPlatformAdmin
    ? ['owner'] as WorkspaceMemberRole[]
    : await getWorkspaceRolesByUserId(db, project.workspaceId, input.actorUser.id)
  const nextProjectRole = normalizeProjectInvitationRole(input.projectRole)
  if (!canAssignElevatedProjectRole(input.actorUser, actorWorkspaceRoles) && nextProjectRole !== 'viewer')
    throw new Error('MANAGER_CAN_ONLY_INVITE_VIEWER')

  await assertProjectSeatAvailable(db, input.projectId, project.workspaceId, 1)

  return createInvitationImpl(db, {
    workspaceId: project.workspaceId,
    projectId: input.projectId,
    projectRole: nextProjectRole,
    invitedByUserId: input.actorUser.id,
    tokenHash: input.tokenHash,
    inviteeUsername: String(input.inviteeUsername || '').trim() || null,
    role: 'member',
    expiresAt: input.expiresAt,
  })
}

export async function removeProjectMember(
  db: Queryable,
  input: {
    projectId: string
    actorUser: AuthUser
    targetUserId: string
  },
): Promise<ProjectMemberManagementSnapshot> {
  const project = await resolveProjectWorkspaceRow(db, input.projectId)
  if (!project)
    throw new Error('PROJECT_NOT_FOUND')

  const manageable = await canManageProject(db, input.actorUser, input.projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')

  const normalizedTargetUserId = String(input.targetUserId || '').trim()
  if (!normalizedTargetUserId)
    throw new Error('PROJECT_MEMBER_TARGET_REQUIRED')

  if (normalizedTargetUserId === project.ownerUserId)
    throw new Error('PROJECT_OWNER_IMMUTABLE')

  const actorWorkspaceRoles = input.actorUser.isPlatformAdmin
    ? ['owner'] as WorkspaceMemberRole[]
    : await getWorkspaceRolesByUserId(db, project.workspaceId, input.actorUser.id)
  const actorHighestRole = input.actorUser.isPlatformAdmin ? 'owner' : getHighestWorkspaceRole(actorWorkspaceRoles)
  const isOwnerOrAdminActor = input.actorUser.isPlatformAdmin
    || actorHighestRole === 'owner'
    || actorHighestRole === 'admin'

  if (!isOwnerOrAdminActor) {
    const targetRoleResult = await db.query<{ role: ProjectMemberRole }>(
      `SELECT role
       FROM project_members
       WHERE project_id = $1
         AND user_id = $2
       LIMIT 1`,
      [input.projectId, normalizedTargetUserId],
    )
    const targetRole = targetRoleResult.rows[0]?.role || null
    if (targetRole && targetRole !== 'viewer')
      throw new Error('MANAGER_CAN_ONLY_REMOVE_MEMBER')
  }

  await db.query(
    `DELETE FROM project_members
     WHERE project_id = $1
       AND user_id = $2
       AND role <> 'owner'`,
    [input.projectId, normalizedTargetUserId],
  )

  await refreshProjectSeatUsage(db, input.projectId)
  const snapshot = await getProjectMemberManagementSnapshot(db, input.projectId)
  if (!snapshot)
    throw new Error('PROJECT_NOT_FOUND')
  return snapshot
}

export async function revokeProjectInvitation(
  db: Queryable,
  input: {
    projectId: string
    actorUser: AuthUser
    invitationId: string
  },
): Promise<boolean> {
  const project = await resolveProjectWorkspaceRow(db, input.projectId)
  if (!project)
    throw new Error('PROJECT_NOT_FOUND')

  const manageable = await canManageProject(db, input.actorUser, input.projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')

  const invitationId = String(input.invitationId || '').trim()
  if (!invitationId)
    throw new Error('INVITATION_ID_REQUIRED')

  const actorWorkspaceRoles = input.actorUser.isPlatformAdmin
    ? ['owner'] as WorkspaceMemberRole[]
    : await getWorkspaceRolesByUserId(db, project.workspaceId, input.actorUser.id)
  const canAssignElevated = canAssignElevatedProjectRole(input.actorUser, actorWorkspaceRoles)

  const result = await db.query<{ accepted_at: string | null, expires_at: string, project_role: ProjectMemberRole | null }>(
    `SELECT accepted_at::TEXT, expires_at::TEXT, project_role
     FROM invitations
     WHERE id = $1
       AND project_id = $2
     LIMIT 1
     FOR UPDATE`,
    [invitationId, input.projectId],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('INVITATION_NOT_FOUND')

  if (!canAssignElevated && normalizeProjectInvitationRole(row.project_role) !== 'viewer')
    throw new Error('MANAGER_CAN_ONLY_REVOKE_VIEWER')

  if (row.accepted_at)
    return false

  const expiresAtMs = new Date(String(row.expires_at || '')).getTime()
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now())
    return false

  await db.query(
    `UPDATE invitations
     SET expires_at = NOW()
     WHERE id = $1`,
    [invitationId],
  )

  return true
}

export async function patchProjectSeatLimit(
  db: Queryable,
  input: {
    projectId: string
    actorUser: AuthUser
    seatLimit: number
  },
): Promise<ProjectSeatQuota> {
  const project = await resolveProjectWorkspaceRow(db, input.projectId)
  if (!project)
    throw new Error('PROJECT_NOT_FOUND')

  const manageable = await canManageProject(db, input.actorUser, input.projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')

  const nextSeatLimit = Math.max(1, Math.trunc(Number(input.seatLimit || 1)))
  if (nextSeatLimit > MAX_PROJECT_SEAT_LIMIT)
    throw new Error('PROJECT_SEAT_LIMIT_MAX_EXCEEDED')
  await ensureProjectSeatQuota(db, input.projectId, project.workspaceId)
  await refreshProjectSeatUsage(db, input.projectId)

  const currentResult = await db.query<ProjectSeatQuotaRow>(
    `SELECT
      project_id,
      workspace_id,
      seat_limit,
      seat_used,
      updated_at::TEXT
     FROM project_seat_quotas
     WHERE project_id = $1
     LIMIT 1
     FOR UPDATE`,
    [input.projectId],
  )

  const current = currentResult.rows[0]
  if (!current)
    throw new Error('PROJECT_SEAT_QUOTA_NOT_FOUND')

  if (Number(current.seat_used || 0) > nextSeatLimit)
    throw new Error('PROJECT_SEAT_LIMIT_BELOW_USED')

  const updated = await db.query<ProjectSeatQuotaRow>(
    `UPDATE project_seat_quotas
     SET seat_limit = $2,
         updated_at = NOW()
     WHERE project_id = $1
     RETURNING
       project_id,
       workspace_id,
       seat_limit,
       seat_used,
       updated_at::TEXT`,
    [input.projectId, nextSeatLimit],
  )

  const row = updated.rows[0]
  if (!row)
    throw new Error('PROJECT_SEAT_QUOTA_WRITE_FAILED')
  return mapProjectSeatQuota(row)
}

export async function patchWorkspaceSeatLimit(
  db: Queryable,
  input: {
    workspaceId: string
    seatLimit: number
  },
): Promise<TeamQuota> {
  return patchWorkspaceSeatLimitImpl(db, input)
}

export async function patchWorkspaceMemberRole(
  db: Queryable,
  input: {
    workspaceId: string
    actorUser: AuthUser
    targetUserId: string
    role: 'admin' | 'manager' | 'member'
  },
): Promise<WorkspaceMemberSummary | null> {
  return patchWorkspaceMemberRoleImpl(db, input)
}

export async function removeWorkspaceMember(
  db: Queryable,
  input: {
    workspaceId: string
    actorUser: AuthUser
    targetUserId: string
  },
): Promise<boolean> {
  return removeWorkspaceMemberImpl(db, input)
}

export async function patchProjectBindings(
  db: Queryable,
  projectId: string,
  actorUserId: string,
  input: ProjectBindingPatch,
): Promise<Project | null> {
  if (Array.isArray(input.contestIds)) {
    await ensureProjectContestSettingsSeeded(db, projectId)
    const currentResult = await db.query<{ contest_id: string }>(
      `SELECT contest_id
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [projectId],
    )

    const currentContestId = String(currentResult.rows[0]?.contest_id || '').trim()
    const nextContestIds = normalizeProjectContestIds(currentContestId, input.contestIds)

    if (nextContestIds.length > 0) {
      const existingBindings = await listProjectContestBindingsByProjectId(db, projectId)
      const existingMap = new Map(existingBindings.map(item => [item.contestId, item.trackId]))
      const nextBindings: Array<{ contestId: string, trackId: string, sortOrder: number }> = []

      for (const [index, contestId] of nextContestIds.entries()) {
        const trackId = existingMap.get(contestId) || await resolveDefaultTrackIdByContestId(db, contestId)
        nextBindings.push({
          contestId,
          trackId,
          sortOrder: index,
        })
      }

      await applyProjectContestBindings(db, projectId, nextBindings)
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
  return getWorkspaceTypeImpl(db, workspaceId)
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
  return consumeAiQuotaImpl(db, input)
}
