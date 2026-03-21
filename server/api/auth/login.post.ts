import type { AuthLoginResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import {
  clearSessionCookie,
  resolveSessionExpiresAt,
  sanitizePassword,
  sanitizeUsername,
  setSessionCookie,
} from '~~/server/utils/auth'
import { resolvePlatformAccess } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  countUsers,
  createSession,
  createUserWithPersonalWorkspace,
  ensureBootstrapPlatformSuperAdmin,
  findUserByUsername,
  getUserPasswordHashByUsername,
  listUserWorkspaces,
} from '~~/server/utils/platform-store'
import { createSessionToken, hashPassword, hashToken, verifyPassword } from '~~/server/utils/security'

interface LoginBody {
  username?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const body = await readBody<LoginBody>(event)
  const username = sanitizeUsername(body?.username || '')
  const password = sanitizePassword(body?.password || '')

  if (!username || !password) {
    setResponseStatus(event, 400)
    return fail('用户名和密码不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40001)
  }

  if (username.length < 3 || password.length < 6) {
    setResponseStatus(event, 400)
    return fail('用户名至少 3 位，密码至少 6 位。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40002)
  }

  try {
    const result = await withTransaction(event, async (db): Promise<AuthLoginResult & { sessionToken: string }> => {
      let user = await findUserByUsername(db, username)

      if (!user) {
        const totalUsers = await countUsers(db)
        user = await createUserWithPersonalWorkspace(db, {
          username,
          passwordHash: await hashPassword(password),
          isPlatformAdmin: totalUsers === 0,
        })
      }
      else {
        const passwordHashInDb = await getUserPasswordHashByUsername(db, username)
        const matched = passwordHashInDb ? await verifyPassword(password, passwordHashInDb) : false
        if (!matched) {
          throw new Error('INVALID_CREDENTIALS')
        }
      }

      const promotedAsBootstrapAdmin = await ensureBootstrapPlatformSuperAdmin(db, user.id)
      if (promotedAsBootstrapAdmin) {
        user = {
          ...user,
          isPlatformAdmin: true,
        }
      }

      if (user.isDisabled)
        throw new Error('USER_DISABLED')

      const sessionToken = createSessionToken()
      const session = await createSession(db, {
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: resolveSessionExpiresAt(),
      })

      const workspaces = await listUserWorkspaces(db, user.id)
      const teamCount = workspaces.filter(item => item.workspace.type === 'team').length
      const platformAccess = await resolvePlatformAccess(db, user)

      return {
        user: {
          ...user,
          platformRoles: platformAccess.roles,
          platformPermissions: platformAccess.permissions,
        },
        session,
        workspaces,
        onboarding: {
          needCreateTeam: teamCount === 0,
        },
        sessionToken,
      }
    })

    setSessionCookie(event, result.sessionToken, result.session.expiresAt)

    return ok<AuthLoginResult>({
      user: result.user,
      session: result.session,
      workspaces: result.workspaces,
      onboarding: result.onboarding,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    clearSessionCookie(event)
    if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
      setResponseStatus(event, 401)
      return fail('账号或密码错误。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40101)
    }

    if (error instanceof Error && error.message === 'USER_DISABLED') {
      setResponseStatus(event, 403)
      return fail('当前账号已被禁用，请联系平台管理员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40311)
    }

    throw error
  }
})
