import type { H3Event } from 'h3'
import process from 'node:process'
import { deleteCookie, getCookie, setCookie } from 'h3'
import { createSessionToken } from '~~/server/utils/security'

const CASDOOR_OAUTH_STATE_COOKIE_NAME = 'wl_casdoor_oauth_state'
const CASDOOR_OAUTH_REDIRECT_COOKIE_NAME = 'wl_casdoor_oauth_redirect'
const CASDOOR_OAUTH_STATE_TTL_SECONDS = 10 * 60

function resolveSecureCookie(event: H3Event): boolean {
  if (process.env.NODE_ENV !== 'production')
    return false

  const node = event.node
  if (!node || !node.req)
    return false
  const req = node.req

  const proto = (String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0] || '')
    .trim()
    .toLowerCase()
  if (proto)
    return proto === 'https'
  const socket = req.socket as { encrypted?: boolean } | undefined
  return Boolean(socket?.encrypted)
}

export function issueCasdoorOAuthState(event: H3Event): string {
  const state = createSessionToken()
  setCookie(event, CASDOOR_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CASDOOR_OAUTH_STATE_TTL_SECONDS,
    secure: resolveSecureCookie(event),
  })
  return state
}

export function persistCasdoorOAuthRedirect(event: H3Event, redirectPath: string): void {
  const normalized = String(redirectPath || '').trim()
  if (!normalized) {
    deleteCookie(event, CASDOOR_OAUTH_REDIRECT_COOKIE_NAME, { path: '/' })
    return
  }
  setCookie(event, CASDOOR_OAUTH_REDIRECT_COOKIE_NAME, normalized, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CASDOOR_OAUTH_STATE_TTL_SECONDS,
    secure: resolveSecureCookie(event),
  })
}

export function consumeCasdoorOAuthRedirect(event: H3Event): string {
  const value = String(getCookie(event, CASDOOR_OAUTH_REDIRECT_COOKIE_NAME) || '').trim()
  deleteCookie(event, CASDOOR_OAUTH_REDIRECT_COOKIE_NAME, { path: '/' })
  return value
}

export function clearCasdoorOAuthState(event: H3Event): void {
  deleteCookie(event, CASDOOR_OAUTH_STATE_COOKIE_NAME, {
    path: '/',
  })
  deleteCookie(event, CASDOOR_OAUTH_REDIRECT_COOKIE_NAME, {
    path: '/',
  })
}

export function verifyCasdoorOAuthState(event: H3Event, candidate: string): boolean {
  const current = String(getCookie(event, CASDOOR_OAUTH_STATE_COOKIE_NAME) || '').trim()
  if (!current || !candidate)
    return false
  return current === String(candidate || '').trim()
}
