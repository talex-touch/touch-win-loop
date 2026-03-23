import type { H3Event } from 'h3'
import type { AuthSession, AuthUser } from '~~/shared/types/domain'
import process from 'node:process'
import { createError, deleteCookie, getCookie, setCookie } from 'h3'
import { withClient } from '~~/server/utils/db'
import { extendSessionExpiresAtById, findAuthBySessionTokenHash } from '~~/server/utils/platform-store'
import { hashToken } from '~~/server/utils/security'

export const ACCESS_COOKIE_NAME = 'wl_ak'
export const REFRESH_COOKIE_NAME = 'wl_rk'
export const LEGACY_SESSION_COOKIE_NAME = 'wl_session'
export const SESSION_COOKIE_NAME = REFRESH_COOKIE_NAME
const ACCESS_TTL_MS = 2 * 60 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function sanitizeUsername(value: string): string {
  return String(value || '').trim()
}

export function sanitizePassword(value: string): string {
  return String(value || '')
}

export function resolveSessionExpiresAt(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString()
}

function resolveAccessExpiresAt(sessionExpiresAt: string): string {
  const sessionExpiresDate = new Date(sessionExpiresAt)
  const sessionExpiresMs = Number.isNaN(sessionExpiresDate.getTime())
    ? Number.POSITIVE_INFINITY
    : sessionExpiresDate.getTime()
  const accessExpiresMs = Date.now() + ACCESS_TTL_MS
  return new Date(Math.min(sessionExpiresMs, accessExpiresMs)).toISOString()
}

function resolveSecureCookie(event: H3Event): boolean {
  if (process.env.NODE_ENV !== 'production')
    return false

  const forwardedProtoHeader = event.node?.req?.headers?.['x-forwarded-proto']
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? (forwardedProtoHeader[0] || '') : (forwardedProtoHeader || '')
  if (forwardedProto.trim()) {
    const firstProto = forwardedProto.split(',')[0] || ''
    return firstProto.trim().toLowerCase() === 'https'
  }

  const socket = event.node?.req?.socket as { encrypted?: boolean } | undefined
  return Boolean(socket?.encrypted)
}

export function setSessionCookie(event: H3Event, token: string, expiresAt: string): void {
  setCookie(event, ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: resolveSecureCookie(event),
    expires: new Date(resolveAccessExpiresAt(expiresAt)),
  })

  setCookie(event, REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: resolveSecureCookie(event),
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(event: H3Event): void {
  for (const cookieName of [ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, LEGACY_SESSION_COOKIE_NAME]) {
    deleteCookie(event, cookieName, {
      path: '/',
    })
  }
}

function readRefreshToken(event: H3Event): string {
  return String(
    getCookie(event, REFRESH_COOKIE_NAME)
    || getCookie(event, LEGACY_SESSION_COOKIE_NAME)
    || '',
  ).trim()
}

export function readSessionToken(event: H3Event): string {
  const refreshToken = readRefreshToken(event)
  if (refreshToken)
    return refreshToken

  const accessToken = String(getCookie(event, ACCESS_COOKIE_NAME) || '').trim()
  if (accessToken)
    return accessToken
  return ''
}

export async function getAuthFromEvent(event: H3Event): Promise<{ user: AuthUser, session: AuthSession } | null> {
  const accessToken = String(getCookie(event, ACCESS_COOKIE_NAME) || '').trim()
  const refreshToken = readRefreshToken(event)
  if (!accessToken && !refreshToken)
    return null

  return withClient(event, async (db) => {
    if (accessToken) {
      const auth = await findAuthBySessionTokenHash(db, hashToken(accessToken))
      if (auth) {
        if (!refreshToken)
          setSessionCookie(event, accessToken, auth.session.expiresAt)
        return auth
      }
    }

    const fallbackToken = refreshToken || accessToken
    if (!fallbackToken)
      return null

    const auth = await findAuthBySessionTokenHash(db, hashToken(fallbackToken))
    if (!auth)
      return null

    const nextExpiresAt = resolveSessionExpiresAt()
    await extendSessionExpiresAtById(db, auth.session.id, nextExpiresAt)
    auth.session.expiresAt = nextExpiresAt
    setSessionCookie(event, fallbackToken, nextExpiresAt)
    return auth
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

  if (auth.user.isDisabled) {
    clearSessionCookie(event)
    throw createError({
      statusCode: 403,
      statusMessage: 'forbidden',
      message: '当前账号已被禁用，请联系平台管理员。',
    })
  }

  return auth
}
