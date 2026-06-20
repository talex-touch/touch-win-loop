import type { CasdoorOAuthLoginProfile } from '~~/server/services/casdoor/client'
import type { Queryable } from '~~/server/utils/db'
import type { AuthUser } from '~~/shared/types/domain'
import { syncProvisionedUserAvatar } from '~~/server/services/auth/user-avatar-sync'
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
} from '~~/server/utils/platform-store'
import { createSessionToken, hashPassword } from '~~/server/utils/security'

function normalizeUsernameSeed(profile: CasdoorOAuthLoginProfile): string {
  const emailPrefix = String(profile.email || '').trim().split('@')[0] || ''
  const preferred = String(profile.preferredUsername || emailPrefix || profile.name || '').trim()
  const normalized = preferred
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  if (normalized)
    return `cd_${normalized}`

  const subTail = String(profile.sub || '').replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()
  if (subTail)
    return `cd_${subTail}`
  return 'cd_user'
}

function buildErrorWithDetail(code: string, detail: string): Error {
  const normalizedCode = String(code || '').trim()
  const normalizedDetail = encodeURIComponent(String(detail || '').trim())
  return new Error(normalizedDetail ? `${normalizedCode}:${normalizedDetail}` : normalizedCode)
}

async function allocateUniqueUsername(db: Queryable, seed: string): Promise<string> {
  const base = String(seed || 'cd_user').trim().slice(0, 30) || 'cd_user'
  const safeBase = base.replace(/\s+/g, '_')

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const candidate = `${safeBase}${suffix}`.slice(0, 40)
    const existing = await findUserByUsername(db, candidate)
    if (!existing)
      return candidate
  }

  return `cd_${createSessionToken().slice(0, 12)}`.toLowerCase()
}

export async function ensureLocalUserByCasdoorProfile(
  db: Queryable,
  profile: CasdoorOAuthLoginProfile,
  input: {
    preferredUserId?: string | null
    allowRegistration?: boolean
  } = {},
): Promise<{ user: AuthUser, created: boolean }> {
  const preferredUserId = String(input.preferredUserId || '').trim()
  const allowRegistration = input.allowRegistration !== false

  const identity = await findAuthIdentityByProviderUserId(db, {
    provider: 'casdoor',
    providerUserId: profile.sub,
  })

  if (identity) {
    const existing = await findUserById(db, identity.user_id)
    if (existing) {
      if (preferredUserId && existing.id !== preferredUserId)
        throw buildErrorWithDetail('CASDOOR_IDENTITY_ALREADY_BOUND_OTHER_USER', existing.username)

      await upsertAuthIdentity(db, {
        provider: 'casdoor',
        providerUserId: profile.sub,
        userId: existing.id,
        profile: {
          sub: profile.sub,
          name: profile.name,
          preferredUsername: profile.preferredUsername,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        },
      })
      return {
        user: await syncProvisionedUserAvatar(db, existing, profile.avatarUrl),
        created: false,
      }
    }
  }

  if (preferredUserId) {
    const preferredUser = await findUserById(db, preferredUserId)
    if (!preferredUser)
      throw new Error('CASDOOR_PREFERRED_USER_NOT_FOUND')

    const existingCasdoorIdentity = await findAuthIdentityByProviderAndUserId(db, {
      provider: 'casdoor',
      userId: preferredUser.id,
    })
    if (existingCasdoorIdentity && existingCasdoorIdentity.provider_user_id !== profile.sub)
      throw buildErrorWithDetail('CASDOOR_USER_ALREADY_BOUND_OTHER_IDENTITY', existingCasdoorIdentity.provider_user_id)

    await upsertAuthIdentity(db, {
      provider: 'casdoor',
      providerUserId: profile.sub,
      userId: preferredUser.id,
      profile: {
        sub: profile.sub,
        name: profile.name,
        preferredUsername: profile.preferredUsername,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      },
    })

    return {
      user: await syncProvisionedUserAvatar(db, preferredUser, profile.avatarUrl),
      created: false,
    }
  }

  if (!allowRegistration)
    throw new Error('AUTH_REGISTRATION_DISABLED')

  const username = await allocateUniqueUsername(db, normalizeUsernameSeed(profile))
  const totalUsers = await countUsers(db)
  const createdUser = await createUserWithPersonalWorkspace(db, {
    username,
    passwordHash: await hashPassword(createSessionToken()),
    avatarUrl: profile.avatarUrl,
    isPlatformAdmin: totalUsers === 0,
  })

  await upsertAuthIdentity(db, {
    provider: 'casdoor',
    providerUserId: profile.sub,
    userId: createdUser.id,
    profile: {
      sub: profile.sub,
      name: profile.name,
      preferredUsername: profile.preferredUsername,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    },
  })

  return {
    user: await syncProvisionedUserAvatar(db, createdUser, profile.avatarUrl),
    created: true,
  }
}
