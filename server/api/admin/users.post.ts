import type { PlatformRole } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { listAdminUsers } from '~~/server/utils/admin-user-store'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { setPlatformRolesByUserId } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { createUserWithPersonalWorkspace } from '~~/server/utils/platform-store'
import { hashPassword } from '~~/server/utils/security'

interface CreateAdminUserBody {
  username?: string
  password?: string
  roles?: PlatformRole[]
  disabled?: boolean
}

const ALLOWED_ROLES: PlatformRole[] = ['platform_super_admin', 'contest_admin', 'pricing_admin']

function normalizeRoles(value: unknown): PlatformRole[] {
  if (!Array.isArray(value))
    return []
  return [...new Set(value.filter((item): item is PlatformRole => ALLOWED_ROLES.includes(item)))]
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<CreateAdminUserBody>(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权创建用户。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40394)
  }

  const username = String(body?.username || '').trim()
  const password = String(body?.password || '')
  const roles = normalizeRoles(body?.roles)
  if (username.length < 3 || password.length < 6) {
    setResponseStatus(event, 400)
    return fail('用户名至少 3 位，初始密码至少 6 位。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  try {
    const created = await withTransaction(event, async (db) => {
      const createdUser = await createUserWithPersonalWorkspace(db, {
        username,
        passwordHash: await hashPassword(password),
        isPlatformAdmin: false,
      })

      if (roles.length > 0) {
        await setPlatformRolesByUserId(db, {
          targetUserId: createdUser.id,
          roles,
        })
      }

      if (body?.disabled) {
        await db.query(
          `UPDATE users
           SET is_disabled = TRUE, updated_at = NOW()
           WHERE id = $1`,
          [createdUser.id],
        )
      }

      return (await listAdminUsers(db)).find(item => item.userId === createdUser.id) || null
    })

    return ok(created, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, '用户创建成功。')
  }
  catch (error) {
    if (error && typeof error === 'object' && 'message' in error && String((error as Error).message).includes('duplicate key')) {
      setResponseStatus(event, 409)
      return fail('用户名已存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40994)
    }
    throw error
  }
})
