import type { H3Event } from 'h3'
import type { AuthSession, AuthUser } from '~~/shared/types/domain'
import process from 'node:process'
import { createError, deleteCookie, getCookie, setCookie } from 'h3'
import { withClient } from '~~/server/utils/db'
import { findAuthBySessionTokenHash } from '~~/server/utils/platform-store'
import { hashToken } from '~~/server/utils/security'

export const SESSION_COOKIE_NAME = 'wl_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function sanitizeUsername(value: string): string {
  return String(value || '').trim()
}

export function sanitizePassword(value: string): string {
  return String(value || '')
}

export function resolveSessionExpiresAt(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString()
}

export function setSessionCookie(event: H3Event, token: string, expiresAt: string): void {
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE_NAME, {
    path: '/',
  })
}

export async function getAuthFromEvent(event: H3Event): Promise<{ user: AuthUser, session: AuthSession } | null> {
  const token = getCookie(event, SESSION_COOKIE_NAME)
  if (!token)
    return null

  const tokenHash = hashToken(token)

  return withClient(event, async (db) => {
    return findAuthBySessionTokenHash(db, tokenHash)
  })
}

export async function requireAuth(event: H3Event): Promise<{ user: AuthUser, session: AuthSession }> {
  const auth = await getAuthFromEvent(event)
  if (!auth) {
    throw createError({
      statusCode: 401,
      statusMessage: 'unauthorized',
      message: '请先登录。',
    })
  }

  return auth
}
