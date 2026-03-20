import type { PlatformRole } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface AdminUserRow {
  id: string
  username: string
  is_platform_admin: boolean
  is_disabled: boolean
  created_at: string
  updated_at: string
  roles: PlatformRole[]
  has_active_session: boolean
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权访问用户管理。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40391)
  }

  const users = await withClient(event, async (db) => {
    const result = await db.query<AdminUserRow>(
      `SELECT
        u.id,
        u.username,
        u.is_platform_admin,
        u.is_disabled,
        u.created_at::TEXT,
        u.updated_at::TEXT,
        COALESCE(
          ARRAY_AGG(DISTINCT pr.role) FILTER (WHERE pr.role IS NOT NULL),
          '{}'::TEXT[]
        ) AS roles,
        EXISTS (
          SELECT 1
          FROM sessions s
          WHERE s.user_id = u.id
            AND s.revoked_at IS NULL
            AND s.expires_at > NOW()
        ) AS has_active_session
       FROM users u
       LEFT JOIN platform_user_roles pr ON pr.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at ASC`,
    )

    return result.rows.map(row => ({
      userId: row.id,
      username: row.username,
      roles: row.is_platform_admin
        ? Array.from(new Set<PlatformRole>(['platform_super_admin', ...(row.roles || [])]))
        : (row.roles || []),
      status: row.is_disabled
        ? 'disabled'
        : (row.has_active_session ? 'active' : 'inactive'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  })

  return ok(users, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
