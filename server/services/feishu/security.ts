import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createDecipheriv, createHash } from 'node:crypto'
import process from 'node:process'
import { deleteCookie, getCookie, getHeader, setCookie } from 'h3'
import { createSessionToken } from '~~/server/utils/security'

const FEISHU_OAUTH_STATE_COOKIE_NAME = 'wl_feishu_oauth_state'
const FEISHU_OAUTH_REDIRECT_COOKIE_NAME = 'wl_feishu_oauth_redirect'
const FEISHU_OAUTH_STATE_TTL_SECONDS = 10 * 60

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

export function issueFeishuOAuthState(event: H3Event): string {
  const state = createSessionToken()
  setCookie(event, FEISHU_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: FEISHU_OAUTH_STATE_TTL_SECONDS,
    secure: resolveSecureCookie(event),
  })
  return state
}

export function persistFeishuOAuthRedirect(event: H3Event, redirectPath: string): void {
  const normalized = String(redirectPath || '').trim()
  if (!normalized) {
    deleteCookie(event, FEISHU_OAUTH_REDIRECT_COOKIE_NAME, { path: '/' })
    return
  }
  setCookie(event, FEISHU_OAUTH_REDIRECT_COOKIE_NAME, normalized, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: FEISHU_OAUTH_STATE_TTL_SECONDS,
    secure: resolveSecureCookie(event),
  })
}

export function consumeFeishuOAuthRedirect(event: H3Event): string {
  const value = String(getCookie(event, FEISHU_OAUTH_REDIRECT_COOKIE_NAME) || '').trim()
  deleteCookie(event, FEISHU_OAUTH_REDIRECT_COOKIE_NAME, { path: '/' })
  return value
}

export function clearFeishuOAuthState(event: H3Event): void {
  deleteCookie(event, FEISHU_OAUTH_STATE_COOKIE_NAME, {
    path: '/',
  })
  deleteCookie(event, FEISHU_OAUTH_REDIRECT_COOKIE_NAME, {
    path: '/',
  })
}

export function verifyFeishuOAuthState(event: H3Event, candidate: string): boolean {
  const current = String(getCookie(event, FEISHU_OAUTH_STATE_COOKIE_NAME) || '').trim()
  if (!current || !candidate)
    return false
  return current === String(candidate || '').trim()
}

function toHexSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function verifyFeishuWebhookSignature(input: {
  event: H3Event
  encryptKey: string
  rawBody: string
}): boolean {
  const encryptKey = String(input.encryptKey || '').trim()
  if (!encryptKey)
    return true

  const timestamp = String(getHeader(input.event, 'x-lark-request-timestamp') || '').trim()
  const nonce = String(getHeader(input.event, 'x-lark-request-nonce') || '').trim()
  const signature = String(getHeader(input.event, 'x-lark-signature') || '').trim().toLowerCase()
  if (!timestamp || !nonce || !signature)
    return false

  const expected = toHexSha256(`${timestamp}${nonce}${encryptKey}${input.rawBody}`).toLowerCase()
  return expected === signature
}

function resolveFeishuEncryptKey(encryptKey: string): Buffer {
  const trimmed = String(encryptKey || '').trim()
  if (!trimmed)
    throw new Error('FEISHU_EVENT_ENCRYPT_KEY_REQUIRED')

  try {
    const decoded = Buffer.from(`${trimmed}=`, 'base64')
    if (decoded.length === 32)
      return decoded
  }
  catch {
    // fallback below
  }

  const utf8 = Buffer.from(trimmed, 'utf8')
  if (utf8.length >= 32)
    return utf8.subarray(0, 32)
  if (utf8.length === 0)
    throw new Error('FEISHU_EVENT_ENCRYPT_KEY_INVALID')

  const padded = Buffer.alloc(32)
  utf8.copy(padded, 0, 0, Math.min(utf8.length, 32))
  return padded
}

export function decryptFeishuEventPayload(input: {
  encryptKey: string
  encrypted: string
}): Record<string, unknown> {
  const encrypted = String(input.encrypted || '').trim()
  if (!encrypted)
    throw new Error('FEISHU_EVENT_ENCRYPTED_EMPTY')

  const key = resolveFeishuEncryptKey(input.encryptKey)
  const iv = key.subarray(0, 16)
  const encryptedBuffer = Buffer.from(encrypted, 'base64')

  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const plaintext = Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ]).toString('utf8')

  const trimmed = plaintext.trim()
  if (!trimmed)
    throw new Error('FEISHU_EVENT_DECRYPT_EMPTY')

  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  }
  catch {
    throw new Error('FEISHU_EVENT_DECRYPT_PARSE_FAILED')
  }
}
