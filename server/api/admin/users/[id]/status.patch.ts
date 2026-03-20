import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchUserStatusBody {
  status?: 'active' | 'disabled'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const userId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchUserStatusBody>(event)
  const nextStatus = body?.status

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改用户状态。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40393)
  }

  if (!userId) {
    setResponseStatus(event, 400)
    return fail('缺少用户 ID。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  if (nextStatus !== 'active' && nextStatus !== 'disabled') {
    setResponseStatus(event, 400)
    return fail('status 仅支持 active 或 disabled。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40094)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const targetResult = await db.query<{
        id: string
        username: string
        is_platform_admin: boolean
        is_disabled: boolean
        has_super_role: boolean
      }>(
        `SELECT
          u.id,
          u.username,
          u.is_platform_admin,
          u.is_disabled,
          EXISTS (
            SELECT 1
            FROM platform_user_roles pr
            WHERE pr.user_id = u.id
              AND pr.role = 'platform_super_admin'
          ) AS has_super_role
         FROM users u
         WHERE u.id = $1
         LIMIT 1
         FOR UPDATE`,
        [userId],
      )

      const target = targetResult.rows[0]
      if (!target)
        throw new Error('TARGET_NOT_FOUND')

      if (nextStatus === 'disabled' && target.id === user.id)
        throw new Error('SELF_DISABLE_NOT_ALLOWED')

      const targetIsSuperAdmin = target.is_platform_admin || target.has_super_role
      if (nextStatus === 'disabled' && targetIsSuperAdmin) {
        const otherSuperAdmins = await db.query<{ count: string }>(
          `SELECT COUNT(*)::TEXT AS count
           FROM users u
           WHERE u.id <> $1
             AND u.is_disabled = FALSE
             AND (
               u.is_platform_admin = TRUE
               OR EXISTS (
                 SELECT 1
                 FROM platform_user_roles pr
                 WHERE pr.user_id = u.id
                   AND pr.role = 'platform_super_admin'
               )
             )`,
          [target.id],
        )

        const count = Number(otherSuperAdmins.rows[0]?.count || '0')
        if (count <= 0)
          throw new Error('LAST_SUPER_ADMIN')
      }

      const disabled = nextStatus === 'disabled'
      await db.query(
        `UPDATE users
         SET is_disabled = $2, updated_at = NOW()
         WHERE id = $1`,
        [target.id, disabled],
      )

      if (disabled) {
        await db.query(
          `UPDATE sessions
           SET revoked_at = NOW()
           WHERE user_id = $1
             AND revoked_at IS NULL`,
          [target.id],
        )
      }

      return {
        userId: target.id,
        username: target.username,
        status: disabled ? 'disabled' as const : 'active' as const,
      }
    })

    return ok(result, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'TARGET_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标用户不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40493)
    }

    if (error instanceof Error && error.message === 'SELF_DISABLE_NOT_ALLOWED') {
      setResponseStatus(event, 400)
      return fail('不能禁用当前登录账号。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40095)
    }

    if (error instanceof Error && error.message === 'LAST_SUPER_ADMIN') {
      setResponseStatus(event, 400)
      return fail('不能禁用最后一个平台超管账号。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40096)
    }

    throw error
  }
})
