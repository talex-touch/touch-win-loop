import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface CountRow {
  total: number | string
}

interface AuditRow {
  id: string
  action: string
  contest_id: string | null
  contest_name: string | null
  actor_user_id: string | null
  actor_name: string | null
  payload: Record<string, unknown> | string | null
  created_at: string
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    }
    catch {
      return {}
    }
    return {}
  }
  if (typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  return {}
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const query = getQuery(event)

  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看 AI 审计。', {
      startedAt,
      provider: runtime.ai.provider,
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40398)
  }

  const page = Math.max(1, Number(query.page || 1))
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize || 20)))
  const offset = (page - 1) * pageSize
  const action = String(query.action || '').trim()

  const payload = await withClient(event, async (db) => {
    const where: string[] = [`l.action ILIKE 'ai.invoke.%'`]
    const values: unknown[] = []

    if (action) {
      values.push(`%${action}%`)
      where.push(`l.action ILIKE $${values.length}`)
    }

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::INT AS total
       FROM contest_audit_logs l
       WHERE ${where.join(' AND ')}`,
      values,
    )

    values.push(pageSize)
    values.push(offset)
    const itemsResult = await db.query<AuditRow>(
      `SELECT
        l.id,
        l.action,
        l.contest_id,
        c.name AS contest_name,
        l.actor_user_id,
        u.username AS actor_name,
        l.payload,
        l.created_at::TEXT
       FROM contest_audit_logs l
       LEFT JOIN contests c ON c.id = l.contest_id
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values,
    )

    return {
      page,
      pageSize,
      total: Number(countResult.rows[0]?.total || 0),
      items: itemsResult.rows.map(row => ({
        id: row.id,
        action: row.action,
        contestId: row.contest_id || '',
        contestName: row.contest_name || '',
        actorUserId: row.actor_user_id || '',
        actorName: row.actor_name || '',
        payload: normalizePayload(row.payload),
        createdAt: row.created_at,
      })),
    }
  })

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'read.admin.ai.audits',
      payload: {
        page,
        pageSize,
        action,
      },
    })
  })

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: '',
    fallbackUsed: false,
    attempts: 1,
  })
})
