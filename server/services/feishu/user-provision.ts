import type { FeishuOAuthLoginProfile } from '~~/server/services/feishu/client'
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

function normalizeUsernameSeed(profile: FeishuOAuthLoginProfile): string {
  const preferred = String(profile.enName || profile.name || '').trim()
  const normalized = preferred
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  if (normalized)
    return `fs_${normalized}`

  const unionTail = String(profile.unionId || '').replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()
  if (unionTail)
    return `fs_${unionTail}`
  return 'fs_user'
}

function buildErrorWithDetail(code: string, detail: string): Error {
  const normalizedCode = String(code || '').trim()
  const normalizedDetail = encodeURIComponent(String(detail || '').trim())
  return new Error(normalizedDetail ? `${normalizedCode}:${normalizedDetail}` : normalizedCode)
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
}

function buildFeishuIdentityProfile(
  profile: FeishuOAuthLoginProfile,
  existingProfile?: unknown,
): Record<string, unknown> {
  const existing = normalizeRecord(existingProfile)
  return {
    ...existing,
    unionId: profile.unionId,
    openId: profile.openId,
    name: profile.name,
    enName: profile.enName,
    avatarUrl: profile.avatarUrl,
    email: profile.email,
    mobile: profile.mobile,
    departmentIds: normalizeStringArray(existing.departmentIds),
    groupIds: normalizeStringArray(existing.groupIds),
    tenantKey: String(existing.tenantKey || '').trim(),
  }
}

async function allocateUniqueUsername(db: Queryable, seed: string): Promise<string> {
  const base = String(seed || 'fs_user').trim().slice(0, 30) || 'fs_user'
  const safeBase = base.replace(/\s+/g, '_')

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const candidate = `${safeBase}${suffix}`.slice(0, 40)
    const existing = await findUserByUsername(db, candidate)
    if (!existing)
      return candidate
  }

  return `fs_${createSessionToken().slice(0, 12)}`.toLowerCase()
}

export async function ensureLocalUserByFeishuProfile(
  db: Queryable,
  profile: FeishuOAuthLoginProfile,
  input: {
    preferredUserId?: string | null
    allowRegistration?: boolean
  } = {},
): Promise<{ user: AuthUser, created: boolean }> {
  const preferredUserId = String(input.preferredUserId || '').trim()
  const allowRegistration = input.allowRegistration !== false
  const identity = await findAuthIdentityByProviderUserId(db, {
    provider: 'feishu',
    providerUserId: profile.unionId,
  })

  if (identity) {
    const existing = await findUserById(db, identity.user_id)
    if (existing) {
      if (preferredUserId && existing.id !== preferredUserId)
        throw buildErrorWithDetail('FEISHU_IDENTITY_ALREADY_BOUND_OTHER_USER', existing.username)

      await upsertAuthIdentity(db, {
        provider: 'feishu',
        providerUserId: profile.unionId,
        userId: existing.id,
        profile: buildFeishuIdentityProfile(profile, identity.profile_json),
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
      throw new Error('FEISHU_PREFERRED_USER_NOT_FOUND')

    const existingFeishuIdentity = await findAuthIdentityByProviderAndUserId(db, {
      provider: 'feishu',
      userId: preferredUser.id,
    })
    if (existingFeishuIdentity && existingFeishuIdentity.provider_user_id !== profile.unionId)
      throw buildErrorWithDetail('FEISHU_USER_ALREADY_BOUND_OTHER_IDENTITY', existingFeishuIdentity.provider_user_id)

    await upsertAuthIdentity(db, {
      provider: 'feishu',
      providerUserId: profile.unionId,
      userId: preferredUser.id,
      profile: buildFeishuIdentityProfile(profile, existingFeishuIdentity?.profile_json),
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
    provider: 'feishu',
    providerUserId: profile.unionId,
    userId: createdUser.id,
    profile: buildFeishuIdentityProfile(profile),
  })

  return {
    user: await syncProvisionedUserAvatar(db, createdUser, profile.avatarUrl),
    created: true,
  }
}
