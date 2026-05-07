import type { AuthLoginResult } from '~~/shared/types/domain'
import { sendRedirect } from 'h3'
import { loginByFeishuOAuthCode, resolveFeishuLoginErrorInfo } from '~~/server/services/feishu/login-flow'
import {
  clearFeishuOAuthState,
  consumeFeishuOAuthRedirect,
  verifyFeishuOAuthState,
} from '~~/server/services/feishu/security'
import { clearSessionCookie, getAuthFromEvent } from '~~/server/utils/auth'

function sanitizeRedirectTarget(value: unknown): string {
  const redirect = String(value || '').trim()
  if (!redirect)
    return ''
  if (!redirect.startsWith('/') || redirect.startsWith('//'))
    return ''
  if (redirect.startsWith('/login') || redirect.startsWith('/auth/onboarding'))
    return ''
  return redirect
}

function shouldLandInAdmin(loginResult: AuthLoginResult): boolean {
  const user = loginResult.user
  return Boolean(
    user.isPlatformAdmin
    || user.platformRoles?.length
    || user.platformPermissions?.length,
  )
}

function resolveSuccessfulRedirectTarget(input: {
  loginResult: AuthLoginResult
  requestedTarget?: string
}): string {
  const requestedTarget = sanitizeRedirectTarget(input.requestedTarget)
  if (requestedTarget)
    return requestedTarget
  return shouldLandInAdmin(input.loginResult) ? '/admin' : '/dashboard'
}

function buildFailedRedirect(input: {
  message: string
  code?: string
  boundUserHint?: string
}): string {
  const searchParams = new URLSearchParams()
  searchParams.set('feishuError', String(input.message || '').slice(0, 120))
  if (input.code)
    searchParams.set('feishuConflictCode', String(input.code || '').slice(0, 80))
  if (input.boundUserHint)
    searchParams.set('feishuBoundUser', String(input.boundUserHint || '').slice(0, 60))
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
  searchParams.set('feishuBindError', String(input.message || '').slice(0, 120))
  if (input.code)
    searchParams.set('feishuConflictCode', String(input.code || '').slice(0, 80))
  if (input.boundUserHint)
    searchParams.set('feishuBoundUser', String(input.boundUserHint || '').slice(0, 60))
  return `${target}${separator}${searchParams.toString()}`
}

function shouldKeepCurrentSessionOnError(errorCode: string): boolean {
  return [
    'FEISHU_IDENTITY_ALREADY_BOUND_OTHER_USER',
    'FEISHU_USER_ALREADY_BOUND_OTHER_IDENTITY',
    'FEISHU_PREFERRED_USER_NOT_FOUND',
  ].includes(errorCode)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code || '').trim()
  const state = String(query.state || '').trim()

  if (!code || !state) {
    clearFeishuOAuthState(event)
    return sendRedirect(event, buildFailedRedirect({ message: '缺少飞书登录参数。' }), 302)
  }

  if (!verifyFeishuOAuthState(event, state)) {
    clearFeishuOAuthState(event)
    return sendRedirect(event, buildFailedRedirect({ message: '飞书登录状态校验失败，请重试。' }), 302)
  }

  try {
    const redirectFromCookie = consumeFeishuOAuthRedirect(event)
    const redirectFromQuery = sanitizeRedirectTarget(query.redirect)
    const loginResult = await loginByFeishuOAuthCode(event, code, {
      redirectTarget: redirectFromCookie || redirectFromQuery,
    })
    clearFeishuOAuthState(event)
    if ('needsOnboarding' in loginResult)
      return sendRedirect(event, '/auth/onboarding', 302)

    const target = resolveSuccessfulRedirectTarget({
      loginResult,
      requestedTarget: redirectFromCookie || redirectFromQuery,
    })
    return sendRedirect(event, target, 302)
  }
  catch (error) {
    const info = resolveFeishuLoginErrorInfo(error)
    if (!shouldKeepCurrentSessionOnError(info.code))
      clearSessionCookie(event)

    const redirectFromCookie = consumeFeishuOAuthRedirect(event)
    const redirectFromQuery = sanitizeRedirectTarget(query.redirect)
    clearFeishuOAuthState(event)

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
