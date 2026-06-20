import type { Queryable } from '~~/server/utils/db'
import type { AuthUser, PlatformRole } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { createSessionToken, hashToken } from '~~/server/utils/security'

export type AdminUserStatus = 'active' | 'inactive' | 'disabled'
export const ADMIN_USER_MAGIC_LINK_TOKEN_PREFIX = 'wl_magic_'

export interface AdminUserListItem {
  userId: string
  username: string
  avatarUrl: string | null
  roles: PlatformRole[]
  status: AdminUserStatus
  source: string
  identityProviders: string[]
  activeSessionCount: number
  totalSessionCount: number
  workspaceCount: number
  projectCount: number
  lastSessionAt: string
  createdAt: string
  updatedAt: string
}

export interface AdminUserIdentity {
  provider: string
  providerUserId: string
  profile: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AdminUserSessionSummary {
  id: string
  status: 'active' | 'expired' | 'revoked'
  createdAt: string
  expiresAt: string
  revokedAt: string | null
}

export interface AdminUserWorkspaceSummary {
  workspaceId: string
  name: string
  type: string
  roles: string[]
  updatedAt: string
}

export interface AdminUserProjectSummary {
  projectId: string
  title: string
  role: string
  status: string
  updatedAt: string
}

export interface AdminUserDetail extends AdminUserListItem {
  identities: AdminUserIdentity[]
  sessions: AdminUserSessionSummary[]
  workspaces: AdminUserWorkspaceSummary[]
  projects: AdminUserProjectSummary[]
}

interface AdminUserAggregateRow {
  id: string
  username: string
  avatar_url: string | null
  is_platform_admin: boolean
  is_disabled: boolean
  created_at: string
  updated_at: string
  roles: PlatformRole[] | null
  identity_providers: string[] | null
  active_session_count: string | number | null
  total_session_count: string | number | null
  workspace_count: string | number | null
  project_count: string | number | null
  last_session_at: string | null
}

interface AdminUserIdentityRow {
  provider: string
  provider_user_id: string
  profile_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface AdminUserSessionRow {
  id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  status: 'active' | 'expired' | 'revoked'
}

interface AdminUserWorkspaceRow {
  workspace_id: string
  name: string
  type: string
  roles: string[] | null
  updated_at: string
}

interface AdminUserProjectRow {
  project_id: string
  title: string
  role: string
  status: string
  updated_at: string
}

function toCount(value: string | number | null | undefined): number {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeProviders(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value))
    return []
  return [...new Set(value.map(item => normalizeText(item)).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function normalizeRoles(row: Pick<AdminUserAggregateRow, 'is_platform_admin' | 'roles'>): PlatformRole[] {
  const roles = new Set<PlatformRole>()
  if (row.is_platform_admin)
    roles.add('platform_super_admin')
  for (const role of row.roles || [])
    roles.add(role)
  return [...roles]
}

function resolveUserStatus(row: AdminUserAggregateRow): AdminUserStatus {
  if (row.is_disabled)
    return 'disabled'
  return toCount(row.active_session_count) > 0 ? 'active' : 'inactive'
}

function resolveUserSource(providers: string[]): string {
  if (providers.length === 0)
    return 'password'
  return providers.join('+')
}

function parseProfile(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value
}

function mapAggregateRow(row: AdminUserAggregateRow): AdminUserListItem {
  const providers = normalizeProviders(row.identity_providers)
  return {
    userId: row.id,
    username: row.username,
    avatarUrl: normalizeText(row.avatar_url) || null,
    roles: normalizeRoles(row),
    status: resolveUserStatus(row),
    source: resolveUserSource(providers),
    identityProviders: providers,
    activeSessionCount: toCount(row.active_session_count),
    totalSessionCount: toCount(row.total_session_count),
    workspaceCount: toCount(row.workspace_count),
    projectCount: toCount(row.project_count),
    lastSessionAt: normalizeText(row.last_session_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAuthUser(row: {
  id: string
  username: string
  avatar_url: string | null
  is_platform_admin: boolean
  is_disabled: boolean
  created_at: string
  updated_at: string
}): AuthUser {
  return {
    id: row.id,
    username: row.username,
    avatarUrl: normalizeText(row.avatar_url) || null,
    isPlatformAdmin: Boolean(row.is_platform_admin),
    isDisabled: Boolean(row.is_disabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const ADMIN_USER_AGGREGATE_SELECT = `
WITH session_stats AS (
  SELECT
    user_id,
    COUNT(*)::TEXT AS total_session_count,
    COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at > NOW())::TEXT AS active_session_count,
    MAX(created_at)::TEXT AS last_session_at
  FROM sessions
  GROUP BY user_id
),
workspace_stats AS (
  SELECT user_id, COUNT(DISTINCT workspace_id)::TEXT AS workspace_count
  FROM workspace_members
  WHERE is_enabled = TRUE
  GROUP BY user_id
),
project_stats AS (
  SELECT user_id, COUNT(DISTINCT project_id)::TEXT AS project_count
  FROM project_members
  GROUP BY user_id
)
SELECT
  u.id,
  u.username,
  u.avatar_url,
  u.is_platform_admin,
  u.is_disabled,
  u.created_at::TEXT,
  u.updated_at::TEXT,
  COALESCE(
    ARRAY_AGG(DISTINCT pr.role) FILTER (WHERE pr.role IS NOT NULL),
    '{}'::TEXT[]
  ) AS roles,
  COALESCE(
    ARRAY_AGG(DISTINCT ai.provider) FILTER (WHERE ai.provider IS NOT NULL),
    '{}'::TEXT[]
  ) AS identity_providers,
  COALESCE(ss.active_session_count, '0') AS active_session_count,
  COALESCE(ss.total_session_count, '0') AS total_session_count,
  COALESCE(ws.workspace_count, '0') AS workspace_count,
  COALESCE(ps.project_count, '0') AS project_count,
  COALESCE(ss.last_session_at, '') AS last_session_at
FROM users u
LEFT JOIN platform_user_roles pr ON pr.user_id = u.id
LEFT JOIN auth_identities ai ON ai.user_id = u.id
LEFT JOIN session_stats ss ON ss.user_id = u.id
LEFT JOIN workspace_stats ws ON ws.user_id = u.id
LEFT JOIN project_stats ps ON ps.user_id = u.id
`

export async function listAdminUsers(db: Queryable): Promise<AdminUserListItem[]> {
  const result = await db.query<AdminUserAggregateRow>(
    `${ADMIN_USER_AGGREGATE_SELECT}
     GROUP BY
       u.id,
       ss.active_session_count,
       ss.total_session_count,
       ss.last_session_at,
       ws.workspace_count,
       ps.project_count
     ORDER BY u.created_at ASC`,
  )

  return result.rows.map(mapAggregateRow)
}

export async function findAdminUserListItem(db: Queryable, userId: string): Promise<AdminUserListItem | null> {
  const result = await db.query<AdminUserAggregateRow>(
    `${ADMIN_USER_AGGREGATE_SELECT}
     WHERE u.id = $1
     GROUP BY
       u.id,
       ss.active_session_count,
       ss.total_session_count,
       ss.last_session_at,
       ws.workspace_count,
       ps.project_count
     LIMIT 1`,
    [userId],
  )

  const row = result.rows[0]
  return row ? mapAggregateRow(row) : null
}

export async function getAdminUserDetail(db: Queryable, userId: string): Promise<AdminUserDetail | null> {
  const summary = await findAdminUserListItem(db, userId)
  if (!summary)
    return null

  const [identityResult, sessionResult, workspaceResult, projectResult] = await Promise.all([
    db.query<AdminUserIdentityRow>(
      `SELECT
        provider,
        provider_user_id,
        profile_json,
        created_at::TEXT,
        updated_at::TEXT
       FROM auth_identities
       WHERE user_id = $1
       ORDER BY updated_at DESC, provider ASC`,
      [userId],
    ),
    db.query<AdminUserSessionRow>(
      `SELECT
        id,
        created_at::TEXT,
        expires_at::TEXT,
        revoked_at::TEXT,
        CASE
          WHEN revoked_at IS NOT NULL THEN 'revoked'
          WHEN expires_at <= NOW() THEN 'expired'
          ELSE 'active'
        END AS status
       FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 12`,
      [userId],
    ),
    db.query<AdminUserWorkspaceRow>(
      `SELECT
        w.id AS workspace_id,
        w.name,
        w.type,
        ARRAY_AGG(DISTINCT wm.role ORDER BY wm.role)::TEXT[] AS roles,
        MAX(wm.updated_at)::TEXT AS updated_at
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
         AND wm.is_enabled = TRUE
       GROUP BY w.id
       ORDER BY MAX(wm.updated_at) DESC
       LIMIT 20`,
      [userId],
    ),
    db.query<AdminUserProjectRow>(
      `SELECT
        p.id AS project_id,
        p.title,
        pm.role,
        p.status,
        pm.updated_at::TEXT
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = $1
       ORDER BY pm.updated_at DESC
       LIMIT 20`,
      [userId],
    ),
  ])

  return {
    ...summary,
    identities: identityResult.rows.map(row => ({
      provider: row.provider,
      providerUserId: row.provider_user_id,
      profile: parseProfile(row.profile_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    sessions: sessionResult.rows.map(row => ({
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    })),
    workspaces: workspaceResult.rows.map(row => ({
      workspaceId: row.workspace_id,
      name: row.name,
      type: row.type,
      roles: Array.isArray(row.roles) ? row.roles.map(item => normalizeText(item)).filter(Boolean) : [],
      updatedAt: row.updated_at,
    })),
    projects: projectResult.rows.map(row => ({
      projectId: row.project_id,
      title: row.title,
      role: row.role,
      status: row.status,
      updatedAt: row.updated_at,
    })),
  }
}

export async function updateAdminUserProfile(
  db: Queryable,
  input: {
    userId: string
    username: string
  },
): Promise<AdminUserListItem | null> {
  const username = normalizeText(input.username)
  if (!username)
    throw new Error('USERNAME_REQUIRED')
  if (username.length < 3)
    throw new Error('USERNAME_TOO_SHORT')

  const updated = await db.query<{ id: string }>(
    `UPDATE users
     SET username = $2,
         updated_at = NOW()
     WHERE id = $1
       AND username IS DISTINCT FROM $2
     RETURNING id`,
    [input.userId, username],
  )

  if (!updated.rows[0]?.id) {
    const existing = await findAdminUserListItem(db, input.userId)
    if (!existing)
      return null
    if (existing.username !== username)
      throw new Error('USERNAME_ALREADY_EXISTS')
    return existing
  }

  return findAdminUserListItem(db, input.userId)
}

export async function findAdminAuthUserForMagicLink(
  db: Queryable,
  tokenHash: string,
): Promise<{ sessionId: string, user: AuthUser } | null> {
  const result = await db.query<{
    session_id: string
    user_id: string
    username: string
    avatar_url: string | null
    is_platform_admin: boolean
    is_disabled: boolean
    user_created_at: string
    user_updated_at: string
    expires_at: string
  }>(
    `SELECT
      s.id AS session_id,
      s.expires_at::TEXT,
      u.id AS user_id,
      u.username,
      u.avatar_url,
      u.is_platform_admin,
      u.is_disabled,
      u.created_at::TEXT AS user_created_at,
      u.updated_at::TEXT AS user_updated_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
     LIMIT 1
     FOR UPDATE OF s`,
    [tokenHash],
  )

  const row = result.rows[0]
  if (!row)
    return null
  if (new Date(row.expires_at).getTime() <= Date.now())
    throw new Error('MAGIC_LINK_EXPIRED')
  if (row.is_disabled)
    throw new Error('USER_DISABLED')

  return {
    sessionId: row.session_id,
    user: mapAuthUser({
      id: row.user_id,
      username: row.username,
      avatar_url: row.avatar_url,
      is_platform_admin: row.is_platform_admin,
      is_disabled: row.is_disabled,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
    }),
  }
}

export async function markAdminUserMagicLinkUsed(db: Queryable, sessionId: string): Promise<void> {
  await db.query(
    `UPDATE sessions
     SET revoked_at = NOW()
     WHERE id = $1
       AND revoked_at IS NULL`,
    [sessionId],
  )
}

export async function createAdminUserMagicLink(
  db: Queryable,
  input: {
    targetUserId: string
    actorUserId: string
    ttlMinutes?: number
  },
): Promise<{ token: string, expiresAt: string }> {
  const target = await findAdminUserListItem(db, input.targetUserId)
  if (!target)
    throw new Error('TARGET_NOT_FOUND')
  if (target.status === 'disabled')
    throw new Error('TARGET_DISABLED')

  const ttlMinutes = Math.max(5, Math.min(120, Math.trunc(Number(input.ttlMinutes || 15))))
  const token = `${ADMIN_USER_MAGIC_LINK_TOKEN_PREFIX}${createSessionToken()}`
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()

  await db.query(
    `INSERT INTO sessions (
      id,
      user_id,
      token_hash,
      expires_at,
      revoked_at,
      created_at
    ) VALUES ($1, $2, $3, $4, NULL, NOW())`,
    [randomUUID(), input.targetUserId, hashToken(token), expiresAt],
  )

  return {
    token,
    expiresAt,
  }
}
