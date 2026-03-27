import type { FeishuOAuthLoginProfile } from '~~/server/services/feishu/client'
import type { Queryable } from '~~/server/utils/db'
import type { AuthUser } from '~~/shared/types/domain'
import { findAuthIdentityByProviderUserId, upsertAuthIdentity } from '~~/server/utils/feishu-integration-store'
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
): Promise<{ user: AuthUser, created: boolean }> {
  const identity = await findAuthIdentityByProviderUserId(db, {
    provider: 'feishu',
    providerUserId: profile.unionId,
  })

  if (identity) {
    const existing = await findUserById(db, identity.user_id)
    if (existing) {
      await upsertAuthIdentity(db, {
        provider: 'feishu',
        providerUserId: profile.unionId,
        userId: existing.id,
        profile: {
          unionId: profile.unionId,
          openId: profile.openId,
          name: profile.name,
          enName: profile.enName,
          avatarUrl: profile.avatarUrl,
          email: profile.email,
          mobile: profile.mobile,
        },
      })
      return {
        user: existing,
        created: false,
      }
    }
  }

  const username = await allocateUniqueUsername(db, normalizeUsernameSeed(profile))
  const totalUsers = await countUsers(db)
  const createdUser = await createUserWithPersonalWorkspace(db, {
    username,
    passwordHash: await hashPassword(createSessionToken()),
    isPlatformAdmin: totalUsers === 0,
  })

  await upsertAuthIdentity(db, {
    provider: 'feishu',
    providerUserId: profile.unionId,
    userId: createdUser.id,
    profile: {
      unionId: profile.unionId,
      openId: profile.openId,
      name: profile.name,
      enName: profile.enName,
      avatarUrl: profile.avatarUrl,
      email: profile.email,
      mobile: profile.mobile,
    },
  })

  return {
    user: createdUser,
    created: true,
  }
}
