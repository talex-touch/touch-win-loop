import { sendRedirect } from 'h3'
import { loginByCasdoorOAuthCode, resolveCasdoorLoginErrorInfo } from '~~/server/services/casdoor/login-flow'
import {
  clearCasdoorOAuthState,
  consumeCasdoorOAuthRedirect,
  verifyCasdoorOAuthState,
} from '~~/server/services/casdoor/security'
import { clearSessionCookie, getAuthFromEvent } from '~~/server/utils/auth'

function sanitizeRedirectTarget(value: unknown): string {
  const redirect = String(value || '').trim()
  if (!redirect)
    return '/dashboard'
  if (!redirect.startsWith('/') || redirect.startsWith('//'))
    return '/dashboard'
  if (redirect.startsWith('/login'))
    return '/dashboard'
  return redirect
}

function buildFailedRedirect(input: {
  message: string
  code?: string
  boundUserHint?: string
}): string {
  const searchParams = new URLSearchParams()
  searchParams.set('casdoorError', String(input.message || '').slice(0, 120))
  if (input.code)
    searchParams.set('casdoorConflictCode', String(input.code || '').slice(0, 80))
  if (input.boundUserHint)
    searchParams.set('casdoorBoundUser', String(input.boundUserHint || '').slice(0, 60))
  return `/login?${searchParams.toString()}`
}

function buildBindErrorRedirect(input: {
  targetPath: string
  message: string
  code?: string
  boundUserHint?: string
}): string {
  const target = sanitizeRedirectTarget(input.targetPath) || '/dashboard'
  const separator = target.includes('?') ? '&' : '?'
  const searchParams = new URLSearchParams()
  searchParams.set('casdoorBindError', String(input.message || '').slice(0, 120))
  if (input.code)
    searchParams.set('casdoorConflictCode', String(input.code || '').slice(0, 80))
  if (input.boundUserHint)
    searchParams.set('casdoorBoundUser', String(input.boundUserHint || '').slice(0, 60))
  return `${target}${separator}${searchParams.toString()}`
}

function shouldKeepCurrentSessionOnError(errorCode: string): boolean {
  return [
    'CASDOOR_IDENTITY_ALREADY_BOUND_OTHER_USER',
    'CASDOOR_USER_ALREADY_BOUND_OTHER_IDENTITY',
    'CASDOOR_PREFERRED_USER_NOT_FOUND',
  ].includes(errorCode)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code || '').trim()
  const state = String(query.state || '').trim()

  if (!code || !state) {
    clearCasdoorOAuthState(event)
    return sendRedirect(event, buildFailedRedirect({ message: '缺少 Casdoor 登录参数。' }), 302)
  }

  if (!verifyCasdoorOAuthState(event, state)) {
    clearCasdoorOAuthState(event)
    return sendRedirect(event, buildFailedRedirect({ message: 'Casdoor 登录状态校验失败，请重试。' }), 302)
  }

  try {
    await loginByCasdoorOAuthCode(event, code)
    const redirectFromCookie = consumeCasdoorOAuthRedirect(event)
    clearCasdoorOAuthState(event)
    const redirectFromQuery = sanitizeRedirectTarget(query.redirect)
    const target = redirectFromCookie || redirectFromQuery || '/dashboard'
    return sendRedirect(event, target, 302)
  }
  catch (error) {
    const info = resolveCasdoorLoginErrorInfo(error)
    if (!shouldKeepCurrentSessionOnError(info.code))
      clearSessionCookie(event)

    const redirectFromCookie = consumeCasdoorOAuthRedirect(event)
    const redirectFromQuery = sanitizeRedirectTarget(query.redirect)
    clearCasdoorOAuthState(event)

    if (shouldKeepCurrentSessionOnError(info.code)) {
      const auth = await getAuthFromEvent(event).catch(() => null)
      if (auth?.user?.id) {
        const target = redirectFromCookie || redirectFromQuery || '/dashboard'
        return sendRedirect(event, buildBindErrorRedirect({
          targetPath: target,
          message: info.message,
          code: info.code,
          boundUserHint: info.boundUserHint,
        }), 302)
      }
    }

    return sendRedirect(event, buildFailedRedirect({
      message: info.message,
      code: info.code,
      boundUserHint: info.boundUserHint,
    }), 302)
  }
})
