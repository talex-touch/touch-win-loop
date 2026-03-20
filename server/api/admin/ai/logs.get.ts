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

interface LogRow {
  id: string
  workspace_id: string
  workspace_name: string | null
  session_id: string
  session_title: string
  role: string
  content: string
  provider: string
  model: string
  fallback_used: boolean
  created_by_user_id: string
  actor_name: string | null
  contest_id: string
  contest_name: string | null
  track_id: string
  major: string
  created_at: string
}

function readQueryText(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function toPreview(content: string): string {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= 180)
    return normalized
  return `${normalized.slice(0, 180)}...`
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const query = getQuery(event)

  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看 AI logs。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  const page = Math.max(1, Number(readQueryText(query.page) || 1))
  const pageSize = Math.max(1, Math.min(100, Number(readQueryText(query.pageSize) || 20)))
  const offset = (page - 1) * pageSize
  const days = Math.max(1, Math.min(30, Number(readQueryText(query.days) || 7)))

  const provider = readQueryText(query.provider)
  const model = readQueryText(query.model)
  const role = readQueryText(query.role)
  const workspaceId = readQueryText(query.workspaceId)
  const sessionId = readQueryText(query.sessionId)
  const q = readQueryText(query.q)

  const payload = await withClient(event, async (db) => {
    const where: string[] = [`m.created_at >= NOW() - ($1::INT * INTERVAL '1 day')`]
    const values: unknown[] = [days]

    if (provider) {
      values.push(`%${provider}%`)
      where.push(`m.provider ILIKE $${values.length}`)
    }

    if (model) {
      values.push(`%${model}%`)
      where.push(`m.model ILIKE $${values.length}`)
    }

    if (role) {
      values.push(role)
      where.push(`m.role = $${values.length}`)
    }

    if (workspaceId) {
      values.push(workspaceId)
      where.push(`m.workspace_id = $${values.length}`)
    }

    if (sessionId) {
      values.push(sessionId)
      where.push(`m.session_id = $${values.length}`)
    }

    if (q) {
      values.push(`%${q}%`)
      const idx = values.length
      where.push(`(
        m.content ILIKE $${idx}
        OR s.title ILIKE $${idx}
        OR COALESCE(w.name, '') ILIKE $${idx}
        OR COALESCE(u.username, '') ILIKE $${idx}
        OR COALESCE(c.name, '') ILIKE $${idx}
      )`)
    }

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*)::INT AS total
       FROM ai_chat_messages m
       JOIN ai_chat_sessions s ON s.id = m.session_id AND s.workspace_id = m.workspace_id
       LEFT JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN users u ON u.id = m.created_by_user_id
       LEFT JOIN contests c ON c.id = NULLIF(s.contest_id, '')
       WHERE ${where.join(' AND ')}`,
      values,
    )

    values.push(pageSize)
    values.push(offset)
    const itemResult = await db.query<LogRow>(
      `SELECT
        m.id,
        m.workspace_id,
        w.name AS workspace_name,
        m.session_id,
        s.title AS session_title,
        m.role,
        m.content,
        m.provider,
        m.model,
        m.fallback_used,
        m.created_by_user_id,
        u.username AS actor_name,
        s.contest_id,
        c.name AS contest_name,
        s.track_id,
        s.major,
        m.created_at::TEXT
       FROM ai_chat_messages m
       JOIN ai_chat_sessions s ON s.id = m.session_id AND s.workspace_id = m.workspace_id
       LEFT JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN users u ON u.id = m.created_by_user_id
       LEFT JOIN contests c ON c.id = NULLIF(s.contest_id, '')
       WHERE ${where.join(' AND ')}
       ORDER BY m.created_at DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values,
    )

    return {
      page,
      pageSize,
      total: Number(countResult.rows[0]?.total || 0),
      days,
      items: itemResult.rows.map(row => ({
        id: row.id,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name || '',
        sessionId: row.session_id,
        sessionTitle: row.session_title || '',
        role: row.role,
        provider: row.provider || '',
        model: row.model || '',
        fallbackUsed: Boolean(row.fallback_used),
        actorUserId: row.created_by_user_id || '',
        actorName: row.actor_name || '',
        contestId: row.contest_id || '',
        contestName: row.contest_name || '',
        trackId: row.track_id || '',
        major: row.major || '',
        content: row.content || '',
        contentPreview: toPreview(row.content || ''),
        createdAt: row.created_at,
      })),
    }
  })

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'read.admin.ai.logs',
      payload: {
        page,
        pageSize,
        days,
        provider,
        model,
        role,
        workspaceId,
        sessionId,
        q,
      },
    })
  })

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
