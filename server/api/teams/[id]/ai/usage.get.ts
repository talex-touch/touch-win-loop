import type { WorkspaceAiUsageHistory, WorkspaceAiUsageHistoryItem, WorkspaceAiUsageMemberSummary } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'

interface CountRow {
  total: number | string
  total_calls: number | string
  total_units: number | string
}

interface UsageMemberRow {
  user_id: string
  username: string | null
  calls: number | string
  units: number | string
  last_used_at: string | null
}

interface UsageHistoryRow {
  id: string
  user_id: string
  username: string | null
  route: string
  units: number | string
  created_at: string
}

function readQueryText(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)
  const page = Math.max(1, Math.trunc(Number(readQueryText(query.page) || 1)))
  const pageSize = Math.max(1, Math.min(50, Math.trunc(Number(readQueryText(query.pageSize) || 10))))
  const offset = (page - 1) * pageSize

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40094)
  }

  try {
    const payload = await withClient(event, async (db) => {
      const canAccess = await teamHasWorkspaceMembership(db, user, workspaceId)
      if (!canAccess)
        throw new Error('FORBIDDEN')

      const summaryResult = await db.query<UsageMemberRow>(
        `SELECT
            l.user_id,
            u.username,
            COUNT(*)::INT AS calls,
            COALESCE(SUM(l.units), 0)::INT AS units,
            MAX(l.created_at)::TEXT AS last_used_at
           FROM ai_usage_ledger l
           LEFT JOIN users u ON u.id = l.user_id
           WHERE l.workspace_id = $1
           GROUP BY l.user_id, u.username
           ORDER BY units DESC, calls DESC, COALESCE(u.username, '') ASC`,
        [workspaceId],
      )
      const countResult = await db.query<CountRow>(
        `SELECT
            COUNT(*)::INT AS total,
            COUNT(*)::INT AS total_calls,
            COALESCE(SUM(units), 0)::INT AS total_units
           FROM ai_usage_ledger
           WHERE workspace_id = $1`,
        [workspaceId],
      )
      const historyResult = await db.query<UsageHistoryRow>(
        `SELECT
            l.id,
            l.user_id,
            u.username,
            l.route,
            l.units::INT,
            l.created_at::TEXT
           FROM ai_usage_ledger l
           LEFT JOIN users u ON u.id = l.user_id
           WHERE l.workspace_id = $1
           ORDER BY l.created_at DESC
           LIMIT $2
           OFFSET $3`,
        [workspaceId, pageSize, offset],
      )

      const memberSummaries: WorkspaceAiUsageMemberSummary[] = summaryResult.rows.map(row => ({
        userId: row.user_id,
        username: String(row.username || '未知成员'),
        units: Math.max(0, Number(row.units || 0)),
        calls: Math.max(0, Number(row.calls || 0)),
        lastUsedAt: row.last_used_at,
      }))

      const items: WorkspaceAiUsageHistoryItem[] = historyResult.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        username: String(row.username || '未知成员'),
        route: String(row.route || ''),
        units: Math.max(0, Number(row.units || 0)),
        createdAt: row.created_at,
      }))

      const totals = countResult.rows[0]
      const response: WorkspaceAiUsageHistory = {
        workspaceId,
        page,
        pageSize,
        total: Math.max(0, Number(totals?.total || 0)),
        totalCalls: Math.max(0, Number(totals?.total_calls || 0)),
        totalUnits: Math.max(0, Number(totals?.total_units || 0)),
        memberSummaries,
        items,
      }

      return response
    })

    return ok(payload, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权查看该 Team 的 AI 配额记录。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40394)
    }

    throw error
  }
})
