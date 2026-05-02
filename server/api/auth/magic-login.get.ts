import { sendRedirect } from 'h3'
import { buildAuthLoginResult } from '~~/server/services/auth/login-session'
import { clearSessionCookie, setSessionCookie } from '~~/server/utils/auth'
import { findAdminAuthUserForMagicLink, markAdminUserMagicLinkUsed } from '~~/server/utils/admin-user-store'
import { withTransaction } from '~~/server/utils/db'
import { hashToken } from '~~/server/utils/security'

function resolveRedirect(value: unknown): string {
  const redirect = String(value || '').trim()
  if (!redirect)
    return '/dashboard'
  if (!redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/login'))
    return '/dashboard'
  return redirect
}

function buildFailedRedirect(message: string): string {
  const params = new URLSearchParams()
  params.set('magicError', message)
  return `/login?${params.toString()}`
}

export default defineEventHandler(async (event) => {
  const token = String(getQuery(event).token || '').trim()
  if (!token) {
    clearSessionCookie(event)
    return sendRedirect(event, buildFailedRedirect('登录链接缺少令牌。'), 302)
  }

  try {
    const loginResult = await withTransaction(event, async (db) => {
      const magic = await findAdminAuthUserForMagicLink(db, hashToken(token))
      if (!magic)
        throw new Error('MAGIC_LINK_INVALID')

      await markAdminUserMagicLinkUsed(db, magic.sessionId)
      return buildAuthLoginResult(db, magic.user)
    })

    setSessionCookie(event, loginResult.sessionToken, loginResult.session.expiresAt)
    return sendRedirect(event, resolveRedirect(getQuery(event).redirect), 302)
  }
  catch (error) {
    clearSessionCookie(event)

    if (error instanceof Error && error.message === 'MAGIC_LINK_EXPIRED')
      return sendRedirect(event, buildFailedRedirect('登录链接已过期。'), 302)
    if (error instanceof Error && error.message === 'USER_DISABLED')
      return sendRedirect(event, buildFailedRedirect('当前账号已被禁用，请联系平台管理员。'), 302)

    return sendRedirect(event, buildFailedRedirect('登录链接无效。'), 302)
  }
})
