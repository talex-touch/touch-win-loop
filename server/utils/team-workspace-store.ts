import type { Queryable } from '~~/server/utils/db'
import type { TeamProfile, TeamQuota, Workspace, WorkspaceMemberRole, WorkspaceType, WorkspaceWithQuota } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { teamRefreshSeatUsage } from '~~/server/utils/team-quota-store'

interface WorkspaceRow {
  id: string
  type: WorkspaceType
  name: string
  owner_user_id: string
  team_profile: TeamProfile | null
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

interface CreateTeamWorkspaceInput {
  ownerUserId: string
  name: string
  teamProfile?: TeamProfile | null
  seatLimit?: number
  aiQuotaTotal?: number
  resetCycle?: string
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

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    ownerUserId: row.owner_user_id,
    teamProfile: row.team_profile,
    roles: dedupeBy(row.roles || [], item => item),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTeamQuota(row: TeamQuotaRow): TeamQuota {
  return {
    teamId: row.workspace_id,
    workspaceId: row.workspace_id,
    seatLimit: Number(row.seat_limit),
    seatUsed: Number(row.seat_used),
    aiQuotaTotal: Number(row.ai_quota_total),
    aiQuotaUsed: Number(row.ai_quota_used),
    resetCycle: row.reset_cycle,
    updatedAt: row.updated_at,
  }
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

export async function teamListUserWorkspaces(db: Queryable, userId: string): Promise<WorkspaceWithQuota[]> {
  const result = await db.query<WorkspaceRow>(
    `SELECT
      w.id,
      w.type,
      w.name,
      w.owner_user_id,
      w.team_profile,
      w.created_at::TEXT,
      w.updated_at::TEXT,
      ARRAY_AGG(DISTINCT wm.role) AS roles
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1
       AND wm.is_enabled = TRUE
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

export async function teamCreateWorkspace(db: Queryable, input: CreateTeamWorkspaceInput): Promise<WorkspaceWithQuota> {
  const workspaceId = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO workspaces (id, type, name, owner_user_id, team_profile, created_at, updated_at)
     VALUES ($1, 'team', $2, $3, $4::JSONB, $5, $5)`,
    [workspaceId, input.name, input.ownerUserId, input.teamProfile ? JSON.stringify(input.teamProfile) : null, now],
  )

  await db.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, is_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, 'owner', TRUE, $4, $4)`,
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

  await teamRefreshSeatUsage(db, workspaceId)

  const workspaceList = await teamListUserWorkspaces(db, input.ownerUserId)
  const created = workspaceList.find(item => item.workspace.id === workspaceId)
  if (!created)
    throw new Error('failed to create workspace')
  return created
}
