import type { Queryable } from '~~/server/utils/db'
import type { TeamQuota, WorkspaceType } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface TeamQuotaRow {
  workspace_id: string
  seat_limit: number
  seat_used: number
  ai_quota_total: number
  ai_quota_used: number
  reset_cycle: string
  updated_at: string
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

async function countActiveWorkspaceSeatUsed(db: Queryable, workspaceId: string): Promise<number> {
  const usageResult = await db.query<{ count: string }>(
    `SELECT COUNT(DISTINCT wm.user_id)::TEXT AS count
     FROM workspace_members wm
     WHERE wm.workspace_id = $1
       AND wm.is_active = TRUE`,
    [workspaceId],
  )

  return Math.max(0, Number(usageResult.rows[0]?.count || '0'))
}

async function getOrCreateTeamQuotaRowForUpdate(db: Queryable, workspaceId: string): Promise<TeamQuotaRow> {
  const loadQuota = async () => {
    return db.query<TeamQuotaRow>(
      `SELECT workspace_id, seat_limit, seat_used, ai_quota_total, ai_quota_used, reset_cycle, updated_at::TEXT
       FROM team_quotas
       WHERE workspace_id = $1
       FOR UPDATE`,
      [workspaceId],
    )
  }

  let quotaResult = await loadQuota()
  if (quotaResult.rows.length > 0) {
    const row = quotaResult.rows[0]
    if (!row)
      throw new Error('TEAM_QUOTA_NOT_FOUND')
    return row
  }

  const seatUsed = await countActiveWorkspaceSeatUsed(db, workspaceId)
  await db.query(
    `INSERT INTO team_quotas (workspace_id, seat_limit, seat_used, ai_quota_total, ai_quota_used, reset_cycle, updated_at)
     VALUES ($1, 20, $2, 1000, 0, 'monthly', NOW())
     ON CONFLICT (workspace_id) DO NOTHING`,
    [workspaceId, seatUsed],
  )

  quotaResult = await loadQuota()
  const created = quotaResult.rows[0]
  if (!created)
    throw new Error('TEAM_QUOTA_NOT_FOUND')
  return created
}

export async function teamAssertWorkspaceSeatAvailable(
  db: Queryable,
  workspaceId: string,
  additionalSeats: number,
): Promise<void> {
  const normalizedAdditional = Math.max(0, Math.trunc(Number(additionalSeats || 0)))
  if (normalizedAdditional <= 0)
    return

  const workspaceType = await teamGetWorkspaceType(db, workspaceId)
  if (!workspaceType)
    throw new Error('WORKSPACE_NOT_FOUND')
  if (workspaceType === 'personal')
    return

  const quota = await getOrCreateTeamQuotaRowForUpdate(db, workspaceId)
  const seatLimit = Math.max(1, Number(quota.seat_limit || 1))
  const seatUsed = await countActiveWorkspaceSeatUsed(db, workspaceId)
  if (seatUsed + normalizedAdditional > seatLimit)
    throw new Error('TEAM_SEAT_LIMIT_REACHED')
}

export async function teamRefreshSeatUsage(db: Queryable, workspaceId: string): Promise<void> {
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

export async function teamGetWorkspaceType(db: Queryable, workspaceId: string): Promise<WorkspaceType | null> {
  const result = await db.query<{ type: WorkspaceType }>(
    'SELECT type FROM workspaces WHERE id = $1 LIMIT 1',
    [workspaceId],
  )

  return result.rows[0]?.type || null
}

export async function teamPatchSeatLimit(
  db: Queryable,
  input: {
    workspaceId: string
    seatLimit: number
  },
) {
  const workspaceType = await teamGetWorkspaceType(db, input.workspaceId)
  if (!workspaceType)
    throw new Error('WORKSPACE_NOT_FOUND')
  if (workspaceType === 'personal')
    throw new Error('PERSONAL_TEAM_SEAT_READ_ONLY')

  const nextSeatLimit = Math.max(1, Math.trunc(Number(input.seatLimit || 1)))
  await getOrCreateTeamQuotaRowForUpdate(db, input.workspaceId)

  const seatUsed = await countActiveWorkspaceSeatUsed(db, input.workspaceId)
  if (seatUsed > nextSeatLimit)
    throw new Error('TEAM_SEAT_LIMIT_BELOW_USED')

  const updated = await db.query<TeamQuotaRow>(
    `UPDATE team_quotas
     SET seat_limit = $2,
         seat_used = $3,
         updated_at = NOW()
     WHERE workspace_id = $1
     RETURNING workspace_id, seat_limit, seat_used, ai_quota_total, ai_quota_used, reset_cycle, updated_at::TEXT`,
    [input.workspaceId, nextSeatLimit, seatUsed],
  )

  const row = updated.rows[0]
  if (!row)
    throw new Error('TEAM_QUOTA_WRITE_FAILED')
  return mapTeamQuota(row)
}

export async function teamConsumeAiQuota(
  db: Queryable,
  input: {
    workspaceId: string
    userId: string
    route: string
    units: number
  },
): Promise<{ allowed: boolean, remaining: number | null }> {
  const workspaceType = await teamGetWorkspaceType(db, input.workspaceId)
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

    return teamConsumeAiQuota(db, input)
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
