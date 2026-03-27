import { sendRedirect } from 'h3'
import { loginByFeishuOAuthCode } from '~~/server/services/feishu/login-flow'
import {
  clearFeishuOAuthState,
  consumeFeishuOAuthRedirect,
  verifyFeishuOAuthState,
} from '~~/server/services/feishu/security'
import { clearSessionCookie } from '~~/server/utils/auth'

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

function buildFailedRedirect(message: string): string {
  const searchParams = new URLSearchParams()
  searchParams.set('feishuError', message.slice(0, 120))
  return `/login?${searchParams.toString()}`
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code || '').trim()
  const state = String(query.state || '').trim()

  if (!code || !state) {
    clearSessionCookie(event)
    clearFeishuOAuthState(event)
    return sendRedirect(event, buildFailedRedirect('缺少飞书登录参数。'), 302)
  }

  if (!verifyFeishuOAuthState(event, state)) {
    clearSessionCookie(event)
    clearFeishuOAuthState(event)
    return sendRedirect(event, buildFailedRedirect('飞书登录状态校验失败，请重试。'), 302)
  }

  try {
    await loginByFeishuOAuthCode(event, code)
    const redirectFromCookie = consumeFeishuOAuthRedirect(event)
    clearFeishuOAuthState(event)
    const redirectFromQuery = sanitizeRedirectTarget(query.redirect)
    const target = redirectFromCookie || redirectFromQuery || '/dashboard'
    return sendRedirect(event, target, 302)
  }
  catch (error) {
    clearSessionCookie(event)
    clearFeishuOAuthState(event)
    const message = error instanceof Error ? error.message : '飞书登录失败。'
    return sendRedirect(event, buildFailedRedirect(message), 302)
  }
})
