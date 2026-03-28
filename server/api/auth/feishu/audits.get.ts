import type { FeishuAuthAuditItem } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'

interface FeishuAuthAuditRow {
  id: string
  action: FeishuAuthAuditItem['action']
  payload: unknown
  created_at: string
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw as Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const limit = Math.max(1, Math.min(50, Number(getQuery(event).limit || 20)))

  const items = await withClient(event, async (db) => {
    const result = await db.query<FeishuAuthAuditRow>(
      `SELECT
        id,
        action,
        payload,
        created_at::TEXT
       FROM contest_audit_logs
       WHERE actor_user_id = $1
         AND action IN ('auth.feishu.bind.self', 'auth.feishu.unbind.self')
       ORDER BY created_at DESC
       LIMIT $2`,
      [user.id, limit],
    )

    return result.rows.map(row => ({
      id: row.id,
      action: row.action,
      createdAt: row.created_at,
      payload: parsePayload(row.payload),
    }))
  })

  return ok<FeishuAuthAuditItem[]>(items, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
