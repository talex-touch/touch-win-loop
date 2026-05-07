import type { Queryable } from '~~/server/utils/db'
import type { AuthLoginResult, AuthUser } from '~~/shared/types/domain'
import { resolveSessionExpiresAt } from '~~/server/utils/auth'
import { resolvePlatformAccess } from '~~/server/utils/contest-store'
import {
  createSession,
  ensureBootstrapPlatformSuperAdmin,
} from '~~/server/utils/platform-store'
import { createSessionToken, hashToken } from '~~/server/utils/security'
import { teamListUserWorkspaces } from '~~/server/utils/team-workspace-store'

export async function buildAuthLoginResult(
  db: Queryable,
  user: AuthUser,
): Promise<AuthLoginResult & { sessionToken: string }> {
  let nextUser = user

  const promotedAsBootstrapAdmin = await ensureBootstrapPlatformSuperAdmin(db, nextUser.id)
  if (promotedAsBootstrapAdmin) {
    nextUser = {
      ...nextUser,
      isPlatformAdmin: true,
    }
  }

  if (nextUser.isDisabled)
    throw new Error('USER_DISABLED')

  const sessionToken = createSessionToken()
  const session = await createSession(db, {
    userId: nextUser.id,
    tokenHash: hashToken(sessionToken),
    expiresAt: resolveSessionExpiresAt(),
  })

  const workspaces = await teamListUserWorkspaces(db, nextUser.id)
  const teams = workspaces.map(item => ({ team: item.workspace, quota: item.quota }))
  const teamCount = workspaces.filter(item => item.workspace.type === 'team').length
  const platformAccess = await resolvePlatformAccess(db, nextUser)

  return {
    user: {
      ...nextUser,
      platformRoles: platformAccess.roles,
      platformPermissions: platformAccess.permissions,
    },
    session,
    teams,
    workspaces,
    onboarding: {
      needCreateTeam: teamCount === 0,
    },
    sessionToken,
  }
}
