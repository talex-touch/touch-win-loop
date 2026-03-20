import type { BillingCycle } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { ensureDefaultBillingPlans } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getPlatformAccess } from '~~/server/utils/platform-access'

interface OrganizationRow {
  workspace_id: string
  workspace_name: string
  owner_username: string
  seat_limit: number | null
  seat_used: number | null
  ai_quota_total: number | null
  ai_quota_used: number | null
  member_count: number
  plan_id: string | null
  plan_code: string | null
  plan_name: string | null
  billing_cycle: BillingCycle | null
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const access = await getPlatformAccess(event, user)
  const hasOrgPermission = access.permissions.some(item =>
    ['contest.read_internal', 'pricing.write', 'role.assign'].includes(item),
  )

  if (!hasOrgPermission) {
    setResponseStatus(event, 403)
    return fail('当前用户无权访问组织管理。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40392)
  }

  const organizations = await withClient(event, async (db) => {
    await ensureDefaultBillingPlans(db)

    const result = await db.query<OrganizationRow>(
      `SELECT
        w.id AS workspace_id,
        w.name AS workspace_name,
        owner.username AS owner_username,
        tq.seat_limit,
        tq.seat_used,
        tq.ai_quota_total,
        tq.ai_quota_used,
        (
          SELECT COUNT(DISTINCT wm.user_id)::INT
          FROM workspace_members wm
          WHERE wm.workspace_id = w.id
            AND wm.is_active = TRUE
        ) AS member_count,
        wb.plan_id,
        bp.code AS plan_code,
        bp.name AS plan_name,
        wb.billing_cycle,
        w.updated_at::TEXT AS updated_at
       FROM workspaces w
       JOIN users owner ON owner.id = w.owner_user_id
       LEFT JOIN team_quotas tq ON tq.workspace_id = w.id
       LEFT JOIN workspace_billing wb ON wb.workspace_id = w.id
       LEFT JOIN billing_plans bp ON bp.id = wb.plan_id
       WHERE w.type = 'team'
       ORDER BY w.updated_at DESC`,
    )

    return result.rows.map(row => ({
      workspaceId: row.workspace_id,
      name: row.workspace_name,
      owner: row.owner_username,
      seatUsed: Number(row.seat_used || 0),
      seatLimit: Number(row.seat_limit || 0),
      memberCount: Number(row.member_count || 0),
      aiQuotaUsed: Number(row.ai_quota_used || 0),
      aiQuotaTotal: Number(row.ai_quota_total || 0),
      billingCycle: row.billing_cycle || 'monthly',
      planId: row.plan_id || '',
      planCode: row.plan_code || 'team-basic',
      planName: row.plan_name || '团队基础版',
      updatedAt: row.updated_at,
    }))
  })

  return ok(organizations, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
