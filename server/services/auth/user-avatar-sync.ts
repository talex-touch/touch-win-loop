import type { AuthUser } from '../../../shared/types/domain'
import type { Queryable } from '../../utils/db'
import { isManualAuthAvatarUrl } from '../../../shared/utils/user-avatar'

type SyncUserAvatarHandler = (
  db: Queryable,
  userId: string,
  avatarUrl: string,
) => Promise<AuthUser | null>

export async function syncProvisionedUserAvatar(
  db: Queryable,
  user: AuthUser,
  avatarUrl: string | null | undefined,
  syncUserAvatar?: SyncUserAvatarHandler,
): Promise<AuthUser> {
  const normalizedAvatarUrl = String(avatarUrl || '').trim()
  if (!normalizedAvatarUrl)
    return user
  if (isManualAuthAvatarUrl(user.avatarUrl))
    return user

  let syncUserAvatarImpl = syncUserAvatar
  if (!syncUserAvatarImpl) {
    const module = await import('../../utils/platform-store')
    syncUserAvatarImpl = module.syncUserAvatarUrl
  }

  const syncedUser = await syncUserAvatarImpl(db, user.id, normalizedAvatarUrl)
  return syncedUser || user
}
