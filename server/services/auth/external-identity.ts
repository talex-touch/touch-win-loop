import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type {
  AuthLoginResult,
  AuthOnboardingPendingResult,
  AuthUser,
  ExternalAuthProvider,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { deleteCookie, getCookie, setCookie } from 'h3'
import { buildAuthLoginResult } from '~~/server/services/auth/login-session'
import { syncProvisionedUserAvatar } from '~~/server/services/auth/user-avatar-sync'
import { withClient, withTransaction } from '~~/server/utils/db'
import {
  findAuthIdentityByProviderAndUserId,
  findAuthIdentityByProviderUserId,
  upsertAuthIdentity,
} from '~~/server/utils/feishu-integration-store'
import {
  countUsers,
  createUserWithPersonalWorkspace,
  findUserById,
  findUserByUsername,
  getUserPasswordHashByUsername,
} from '~~/server/utils/platform-store'
import { createSessionToken, hashPassword, verifyPassword } from '~~/server/utils/security'

const EXTERNAL_AUTH_ONBOARDING_COOKIE_NAME = 'wl_external_auth_onboarding'
const EXTERNAL_AUTH_ONBOARDING_TTL_SECONDS = 10 * 60
const MIN_USERNAME_LENGTH = 3
const MAX_USERNAME_LENGTH = 40
const DEV_ONBOARDING_SECRET = randomBytes(32).toString('base64url')

export interface ExternalAuthProfile {
  provider: ExternalAuthProvider
  providerUserId: string
  displayName?: string
  preferredUsername?: string
  avatarUrl?: string
  email?: string
  mobile?: string
  rawProfile?: Record<string, unknown>
}

export type ExternalAuthLoginResult
  = | (AuthLoginResult & { sessionToken: string })
    | {
      needsOnboarding: true
      provider: ExternalAuthProvider
    }

interface PendingExternalAuthPayload {
  provider: ExternalAuthProvider
  providerUserId: string
  displayName?: string
  preferredUsername?: string
  avatarUrl?: string
  email?: string
  mobile?: string
  rawProfile?: Record<string, unknown>
  redirectTarget?: string
  issuedAt: number
}

function resolveSecureCookie(event: H3Event): boolean {
  if (process.env.NODE_ENV !== 'production')
    return false

  const forwardedProtoHeader = event.node?.req?.headers?.['x-forwarded-proto']
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? (forwardedProtoHeader[0] || '') : (forwardedProtoHeader || '')
  if (forwardedProto.trim())
    return forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https'

  const socket = event.node?.req?.socket as { encrypted?: boolean } | undefined
  return Boolean(socket?.encrypted)
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function encodePendingPayload(payload: PendingExternalAuthPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encodedPayload}.${signPendingPayload(encodedPayload)}`
}

function resolvePendingSigningSecret(): string {
  const configured = String(
    process.env.WINLOOP_AUTH_ONBOARDING_SECRET
    || process.env.WINLOOP_CONFIG_MASTER_KEY
    || process.env.WINLOOP_ONLYOFFICE_JWT_SECRET
    || '',
  ).trim()
  if (configured)
    return configured

  if (process.env.NODE_ENV === 'production')
    throw new Error('AUTH_ONBOARDING_SECRET_REQUIRED')

  return DEV_ONBOARDING_SECRET
}

function signPendingPayload(encodedPayload: string): string {
  return createHmac('sha256', resolvePendingSigningSecret())
    .update(encodedPayload)
    .digest('base64url')
}

function isValidPendingSignature(encodedPayload: string, signature: string): boolean {
  if (!encodedPayload || !signature)
    return false

  const expected = Buffer.from(signPendingPayload(encodedPayload), 'base64url')
  const received = Buffer.from(signature, 'base64url')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function decodePendingPayload(value: string): PendingExternalAuthPayload | null {
  const source = String(value || '').trim()
  if (!source)
    return null

  try {
    const [encodedPayload = '', signature = ''] = source.split('.', 2)
    if (!isValidPendingSignature(encodedPayload, signature))
      return null

    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Record<string, unknown>
    const provider = String(parsed.provider || '').trim() as ExternalAuthProvider
    const providerUserId = String(parsed.providerUserId || '').trim()
    const issuedAt = Number(parsed.issuedAt || 0)
    if (!['feishu', 'casdoor', 'oauth'].includes(provider) || !providerUserId || !Number.isFinite(issuedAt))
      return null
    if (Date.now() - issuedAt > EXTERNAL_AUTH_ONBOARDING_TTL_SECONDS * 1000)
      return null

    return {
      provider,
      providerUserId,
      displayName: String(parsed.displayName || '').trim(),
      preferredUsername: String(parsed.preferredUsername || '').trim(),
      avatarUrl: String(parsed.avatarUrl || '').trim(),
      email: String(parsed.email || '').trim(),
      mobile: String(parsed.mobile || '').trim(),
      rawProfile: normalizeRecord(parsed.rawProfile),
      redirectTarget: sanitizeRedirectTarget(parsed.redirectTarget),
      issuedAt,
    }
  }
  catch {
    return null
  }
}

export function clearExternalAuthOnboarding(event: H3Event): void {
  deleteCookie(event, EXTERNAL_AUTH_ONBOARDING_COOKIE_NAME, { path: '/' })
}

function readPendingExternalAuth(event: H3Event): PendingExternalAuthPayload | null {
  const payload = decodePendingPayload(String(getCookie(event, EXTERNAL_AUTH_ONBOARDING_COOKIE_NAME) || '').trim())
  if (!payload)
    clearExternalAuthOnboarding(event)
  return payload
}

export function hasPendingExternalAuthOnboarding(event: H3Event): boolean {
  return Boolean(readPendingExternalAuth(event))
}

export function persistExternalAuthOnboarding(
  event: H3Event,
  profile: ExternalAuthProfile,
  input: {
    redirectTarget?: string
  } = {},
): void {
  const payload: PendingExternalAuthPayload = {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    displayName: String(profile.displayName || '').trim(),
    preferredUsername: String(profile.preferredUsername || '').trim(),
    avatarUrl: String(profile.avatarUrl || '').trim(),
    email: String(profile.email || '').trim(),
    mobile: String(profile.mobile || '').trim(),
    rawProfile: normalizeRecord(profile.rawProfile),
    redirectTarget: sanitizeRedirectTarget(input.redirectTarget),
    issuedAt: Date.now(),
  }

  setCookie(event, EXTERNAL_AUTH_ONBOARDING_COOKIE_NAME, encodePendingPayload(payload), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: EXTERNAL_AUTH_ONBOARDING_TTL_SECONDS,
    secure: resolveSecureCookie(event),
  })
}

export function sanitizeRedirectTarget(value: unknown): string {
  const redirect = String(value || '').trim()
  if (!redirect)
    return ''
  if (!redirect.startsWith('/') || redirect.startsWith('//'))
    return ''
  if (redirect.startsWith('/login') || redirect.startsWith('/auth/onboarding'))
    return ''
  return redirect
}

export function resolveProviderLabel(provider: ExternalAuthProvider): string {
  if (provider === 'feishu')
    return '飞书'
  if (provider === 'casdoor' || provider === 'oauth')
    return '第三方 OAuth'
  return '第三方账号'
}

function normalizeUsernameCandidate(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
}

export function suggestUsernameFromExternalProfile(profile: Pick<ExternalAuthProfile, 'preferredUsername' | 'displayName' | 'email' | 'providerUserId'>): string {
  const emailPrefix = String(profile.email || '').trim().split('@')[0] || ''
  const preferred = normalizeUsernameCandidate(profile.preferredUsername || emailPrefix || profile.displayName)
  if (preferred)
    return preferred

  const tail = String(profile.providerUserId || '').replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()
  return tail || 'user'
}

function normalizeUsernameInput(value: unknown): string {
  return String(value || '').trim()
}

export function validateExternalAuthUsername(value: unknown): string {
  const username = normalizeUsernameInput(value)
  if (!username)
    throw new Error('AUTH_ONBOARDING_USERNAME_REQUIRED')
  if (username.length < MIN_USERNAME_LENGTH)
    throw new Error('AUTH_ONBOARDING_USERNAME_TOO_SHORT')
  if (username.length > MAX_USERNAME_LENGTH)
    throw new Error('AUTH_ONBOARDING_USERNAME_TOO_LONG')
  if (!/^\w[\w.-]*$/.test(username))
    throw new Error('AUTH_ONBOARDING_USERNAME_INVALID')
  return username
}

function validateExistingAccountUsername(value: unknown): string {
  const username = normalizeUsernameInput(value)
  if (!username)
    throw new Error('AUTH_ONBOARDING_USERNAME_REQUIRED')
  if (username.length < MIN_USERNAME_LENGTH)
    throw new Error('AUTH_ONBOARDING_USERNAME_TOO_SHORT')
  return username
}

function buildErrorWithDetail(code: string, detail: string): Error {
  const normalizedCode = String(code || '').trim()
  const normalizedDetail = encodeURIComponent(String(detail || '').trim())
  return new Error(normalizedDetail ? `${normalizedCode}:${normalizedDetail}` : normalizedCode)
}

function buildIdentityProfile(profile: ExternalAuthProfile, existingProfile?: unknown): Record<string, unknown> {
  return {
    ...normalizeRecord(existingProfile),
    ...normalizeRecord(profile.rawProfile),
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    displayName: profile.displayName || '',
    preferredUsername: profile.preferredUsername || '',
    avatarUrl: profile.avatarUrl || '',
    email: profile.email || '',
    mobile: profile.mobile || '',
  }
}

function resolveIdentityAlreadyBoundCode(provider: ExternalAuthProvider): string {
  if (provider === 'feishu')
    return 'FEISHU_IDENTITY_ALREADY_BOUND_OTHER_USER'
  if (provider === 'casdoor')
    return 'CASDOOR_IDENTITY_ALREADY_BOUND_OTHER_USER'
  return 'OAUTH_IDENTITY_ALREADY_BOUND_OTHER_USER'
}

function resolveUserAlreadyBoundCode(provider: ExternalAuthProvider): string {
  if (provider === 'feishu')
    return 'FEISHU_USER_ALREADY_BOUND_OTHER_IDENTITY'
  if (provider === 'casdoor')
    return 'CASDOOR_USER_ALREADY_BOUND_OTHER_IDENTITY'
  return 'OAUTH_USER_ALREADY_BOUND_OTHER_IDENTITY'
}

function resolvePreferredUserNotFoundCode(provider: ExternalAuthProvider): string {
  if (provider === 'feishu')
    return 'FEISHU_PREFERRED_USER_NOT_FOUND'
  if (provider === 'casdoor')
    return 'CASDOOR_PREFERRED_USER_NOT_FOUND'
  return 'OAUTH_PREFERRED_USER_NOT_FOUND'
}

export async function resolveExistingExternalAuthUser(
  db: Queryable,
  profile: ExternalAuthProfile,
): Promise<AuthUser | null> {
  const identity = await findAuthIdentityByProviderUserId(db, {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
  })
  if (!identity)
    return null

  const user = await findUserById(db, identity.user_id)
  if (!user)
    return null

  await upsertAuthIdentity(db, {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    userId: user.id,
    profile: buildIdentityProfile(profile, identity.profile_json),
  })

  return syncProvisionedUserAvatar(db, user, profile.avatarUrl)
}

export async function bindExternalAuthToExistingUser(
  db: Queryable,
  profile: ExternalAuthProfile,
  userId: string,
): Promise<AuthUser> {
  const preferredUserId = String(userId || '').trim()
  if (!preferredUserId)
    throw new Error(resolvePreferredUserNotFoundCode(profile.provider))

  const existingIdentity = await findAuthIdentityByProviderUserId(db, {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
  })
  if (existingIdentity && existingIdentity.user_id !== preferredUserId) {
    const boundUser = await findUserById(db, existingIdentity.user_id)
    throw buildErrorWithDetail(resolveIdentityAlreadyBoundCode(profile.provider), boundUser?.username || existingIdentity.user_id)
  }

  const user = await findUserById(db, preferredUserId)
  if (!user)
    throw new Error(resolvePreferredUserNotFoundCode(profile.provider))

  const existingUserIdentity = await findAuthIdentityByProviderAndUserId(db, {
    provider: profile.provider,
    userId: user.id,
  })
  if (existingUserIdentity && existingUserIdentity.provider_user_id !== profile.providerUserId)
    throw buildErrorWithDetail(resolveUserAlreadyBoundCode(profile.provider), existingUserIdentity.provider_user_id)

  await upsertAuthIdentity(db, {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    userId: user.id,
    profile: buildIdentityProfile(profile, existingUserIdentity?.profile_json),
  })

  return syncProvisionedUserAvatar(db, user, profile.avatarUrl)
}

export async function loginWithExternalAuthProfile(
  event: H3Event,
  profile: ExternalAuthProfile,
  input: {
    preferredUserId?: string | null
    allowRegistration?: boolean
    redirectTarget?: string
  } = {},
): Promise<ExternalAuthLoginResult> {
  const preferredUserId = String(input.preferredUserId || '').trim()
  const allowRegistration = input.allowRegistration !== false

  if (preferredUserId) {
    return withTransaction(event, async (db) => {
      const user = await bindExternalAuthToExistingUser(db, profile, preferredUserId)
      return buildAuthLoginResult(db, user)
    })
  }

  const existingUser = await withClient(event, db => resolveExistingExternalAuthUser(db, profile))
  if (existingUser) {
    return withTransaction(event, db => buildAuthLoginResult(db, existingUser))
  }

  if (!allowRegistration)
    throw new Error('AUTH_REGISTRATION_DISABLED')

  persistExternalAuthOnboarding(event, profile, {
    redirectTarget: input.redirectTarget,
  })

  return { needsOnboarding: true, provider: profile.provider }
}

export function buildPendingExternalAuthView(event: H3Event): AuthOnboardingPendingResult {
  const pending = readPendingExternalAuth(event)
  if (!pending)
    return { pending: false }

  return {
    pending: true,
    provider: pending.provider,
    providerLabel: resolveProviderLabel(pending.provider),
    suggestedUsername: suggestUsernameFromExternalProfile(pending),
    displayName: pending.displayName,
    avatarUrl: pending.avatarUrl,
    email: pending.email,
  }
}

export function resolvePendingExternalAuthRedirect(event: H3Event): string {
  return readPendingExternalAuth(event)?.redirectTarget || ''
}

export async function completeExternalAuthOnboarding(
  event: H3Event,
  input: {
    mode: 'create' | 'link'
    username: string
    password?: string
  },
): Promise<AuthLoginResult & { sessionToken: string }> {
  const pending = readPendingExternalAuth(event)
  if (!pending)
    throw new Error('AUTH_ONBOARDING_PENDING_NOT_FOUND')

  const mode = input.mode === 'link' ? 'link' : 'create'
  const username = mode === 'link'
    ? validateExistingAccountUsername(input.username)
    : validateExternalAuthUsername(input.username)

  return withTransaction(event, async (db) => {
    const profile: ExternalAuthProfile = {
      provider: pending.provider,
      providerUserId: pending.providerUserId,
      displayName: pending.displayName,
      preferredUsername: pending.preferredUsername,
      avatarUrl: pending.avatarUrl,
      email: pending.email,
      mobile: pending.mobile,
      rawProfile: pending.rawProfile,
    }

    if (mode === 'link') {
      const password = String(input.password || '')
      if (!password)
        throw new Error('AUTH_ONBOARDING_PASSWORD_REQUIRED')

      const user = await findUserByUsername(db, username)
      const passwordHash = await getUserPasswordHashByUsername(db, username)
      const matched = passwordHash ? await verifyPassword(password, passwordHash) : false
      if (!user || !matched)
        throw new Error('INVALID_CREDENTIALS')

      const boundUser = await bindExternalAuthToExistingUser(db, profile, user.id)
      return buildAuthLoginResult(db, boundUser)
    }

    const existing = await findUserByUsername(db, username)
    if (existing)
      throw new Error('AUTH_ONBOARDING_USERNAME_TAKEN')

    const totalUsers = await countUsers(db)
    const createdUser = await createUserWithPersonalWorkspace(db, {
      username,
      passwordHash: await hashPassword(createSessionToken()),
      avatarUrl: pending.avatarUrl,
      isPlatformAdmin: totalUsers === 0,
    })

    await upsertAuthIdentity(db, {
      provider: pending.provider,
      providerUserId: pending.providerUserId,
      userId: createdUser.id,
      profile: buildIdentityProfile(profile),
    })

    return buildAuthLoginResult(db, await syncProvisionedUserAvatar(db, createdUser, pending.avatarUrl))
  })
}

export async function findExternalAuthIdentityByProviderUserId(
  db: Queryable,
  provider: ExternalAuthProvider,
  providerUserId: string,
): Promise<{ userId: string, profile: Record<string, unknown> } | null> {
  const identity = await findAuthIdentityByProviderUserId(db, {
    provider,
    providerUserId,
  })
  if (!identity)
    return null
  return {
    userId: identity.user_id,
    profile: normalizeRecord(identity.profile_json),
  }
}
