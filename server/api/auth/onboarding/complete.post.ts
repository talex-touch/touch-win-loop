import type {
  AuthOnboardingCompleteRequest,
  AuthOnboardingCompleteResult,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import {
  clearExternalAuthOnboarding,
  completeExternalAuthOnboarding,
  resolvePendingExternalAuthRedirect,
} from '~~/server/services/auth/external-identity'
import { fail, ok } from '~~/server/utils/api'
import { setSessionCookie } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'

function shouldLandInAdmin(result: Pick<AuthOnboardingCompleteResult, 'user'>): boolean {
  const user = result.user
  return Boolean(
    user.isPlatformAdmin
    || user.platformRoles?.length
    || user.platformPermissions?.length,
  )
}

function resolveOnboardingErrorMessage(error: unknown): { status: number, code: number, message: string } {
  const raw = error instanceof Error ? error.message : String(error || '')
  if (raw === 'AUTH_ONBOARDING_PENDING_NOT_FOUND')
    return { status: 400, code: 40071, message: '登录引导状态已失效，请重新使用第三方账号登录。' }
  if (raw === 'AUTH_ONBOARDING_USERNAME_REQUIRED')
    return { status: 400, code: 40072, message: '请输入 WinLoop 名字。' }
  if (raw === 'AUTH_ONBOARDING_USERNAME_TOO_SHORT')
    return { status: 400, code: 40073, message: '名字至少 3 位。' }
  if (raw === 'AUTH_ONBOARDING_USERNAME_TOO_LONG')
    return { status: 400, code: 40074, message: '名字最多 40 位。' }
  if (raw === 'AUTH_ONBOARDING_USERNAME_INVALID')
    return { status: 400, code: 40075, message: '名字仅支持字母、数字、下划线、点和短横线，且需以字母、数字或下划线开头。' }
  if (raw === 'AUTH_ONBOARDING_USERNAME_TAKEN')
    return { status: 409, code: 40971, message: '该名字已被使用，请换一个。' }
  if (raw === 'AUTH_ONBOARDING_PASSWORD_REQUIRED')
    return { status: 400, code: 40076, message: '关联已有账号时请输入密码。' }
  if (raw === 'INVALID_CREDENTIALS')
    return { status: 401, code: 40171, message: '账号或密码错误。' }
  if (raw.includes('IDENTITY_ALREADY_BOUND_OTHER_USER'))
    return { status: 409, code: 40972, message: '该第三方账号已绑定其他 WinLoop 账号。' }
  if (raw.includes('USER_ALREADY_BOUND_OTHER_IDENTITY'))
    return { status: 409, code: 40973, message: '该 WinLoop 账号已绑定其他同类第三方身份。' }
  if (raw === 'USER_DISABLED')
    return { status: 403, code: 40371, message: '当前账号已被禁用，请联系平台管理员。' }
  return { status: 500, code: 50071, message: raw || '登录引导完成失败。' }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const redirectFromPending = resolvePendingExternalAuthRedirect(event)
  const body = await readBody<AuthOnboardingCompleteRequest>(event).catch(() => ({} as AuthOnboardingCompleteRequest))

  try {
    const result = await completeExternalAuthOnboarding(event, {
      mode: body?.mode === 'link' ? 'link' : 'create',
      username: body?.username,
      password: body?.password,
    })

    setSessionCookie(event, result.sessionToken, result.session.expiresAt)
    clearExternalAuthOnboarding(event)

    const payload: AuthOnboardingCompleteResult = {
      user: result.user,
      session: result.session,
      teams: result.teams,
      workspaces: result.workspaces,
      onboarding: {
        ...result.onboarding,
        needsProfileSetup: false,
        pendingProvider: undefined,
      },
      redirectTarget: redirectFromPending || (shouldLandInAdmin(result) ? '/admin' : '/dashboard'),
    }

    return ok<AuthOnboardingCompleteResult>(payload, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    const info = resolveOnboardingErrorMessage(error)
    setResponseStatus(event, info.status)
    return fail(info.message, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, info.code)
  }
})
