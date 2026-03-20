import type { H3Event } from 'h3'
import type { AuthUser, PlatformPermission, PlatformRole } from '~~/shared/types/domain'
import { resolvePlatformAccess } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'

export async function checkPlatformPermission(
  event: H3Event,
  user: AuthUser,
  permission: PlatformPermission,
): Promise<boolean> {
  const access = await withClient(event, async (db) => {
    return resolvePlatformAccess(db, user)
  })

  return access.permissions.includes(permission)
}

export async function getPlatformAccess(
  event: H3Event,
  user: AuthUser,
): Promise<{ roles: PlatformRole[], permissions: PlatformPermission[] }> {
  return withClient(event, async (db) => {
    return resolvePlatformAccess(db, user)
  })
}
