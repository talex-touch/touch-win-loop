import type { AuthSessionHistoryItem } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'

interface SessionHistoryRow {
  id: string
  user_id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user, session } = await requireAuth(event)
  const limit = Math.max(1, Math.min(20, Number(getQuery(event).limit || 10)))

  const sessions = await withClient(event, async (db) => {
    const result = await db.query<SessionHistoryRow>(
      `SELECT
        s.id,
        s.user_id,
        s.created_at::TEXT,
        s.expires_at::TEXT,
        s.revoked_at::TEXT
       FROM sessions s
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2`,
      [user.id, limit],
    )

    const now = Date.now()
    return result.rows.map((row): AuthSessionHistoryItem => {
      const isCurrent = row.id === session.id
      const isRevoked = Boolean(row.revoked_at)
      const isExpired = !isRevoked && new Date(String(row.expires_at || '')).getTime() <= now
      return {
        id: row.id,
        userId: row.user_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        status: isCurrent
          ? 'current'
          : (isRevoked ? 'revoked' : (isExpired ? 'expired' : 'active')),
        isCurrent,
      }
    })
  })

  return ok(sessions, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
