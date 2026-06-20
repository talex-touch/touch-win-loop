import type { AuthLoginResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { buildAuthLoginResult } from '~~/server/services/auth/login-session'
import { fail, ok } from '~~/server/utils/api'
import {
  clearSessionCookie,
  sanitizePassword,
  sanitizeUsername,
  setSessionCookie,
} from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'
import {
  countUsers,
  createUserWithPersonalWorkspace,
  findUserByUsername,
  getUserPasswordHashByUsername,
} from '~~/server/utils/platform-store'
import { hashPassword, verifyPassword } from '~~/server/utils/security'

interface LoginBody {
  username?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectivePlatformRuntimeSettings(event)
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
        if (!runtime.auth.registrationEnabled)
          throw new Error('AUTH_REGISTRATION_DISABLED')

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

      return buildAuthLoginResult(db, user)
    })

    setSessionCookie(event, result.sessionToken, result.session.expiresAt)

    return ok<AuthLoginResult>({
      user: result.user,
      session: result.session,
      teams: result.teams,
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

    if (error instanceof Error && error.message === 'AUTH_REGISTRATION_DISABLED') {
      setResponseStatus(event, 403)
      return fail('平台暂未开放注册，请联系管理员开通账号或开启注册。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40312)
    }

    throw error
  }
})
