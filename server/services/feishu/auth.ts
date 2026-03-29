import type { H3Event } from 'h3'
import type { FeishuOAuthLoginProfile } from '~~/server/services/feishu/client'
import type { AuthLoginResult } from '~~/shared/types/domain'
import { ensureLocalUserByFeishuProfile } from '~~/server/services/feishu/user-provision'
import { resolveSessionExpiresAt } from '~~/server/utils/auth'
import { resolvePlatformAccess } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import {
  createSession,
  ensureBootstrapPlatformSuperAdmin,
} from '~~/server/utils/platform-store'
import { createSessionToken, hashToken } from '~~/server/utils/security'
import { teamListUserWorkspaces } from '~~/server/utils/team-workspace-store'

export async function loginWithFeishuProfile(
  event: H3Event,
  profile: FeishuOAuthLoginProfile,
  input: {
    preferredUserId?: string | null
  } = {},
): Promise<AuthLoginResult & { sessionToken: string }> {
  return withTransaction(event, async (db) => {
    const provisioned = await ensureLocalUserByFeishuProfile(db, profile, {
      preferredUserId: input.preferredUserId,
    })
    let user = provisioned.user

    const promotedAsBootstrapAdmin = await ensureBootstrapPlatformSuperAdmin(db, user.id)
    if (promotedAsBootstrapAdmin) {
      user = {
        ...user,
        isPlatformAdmin: true,
      }
    }

    if (user.isDisabled)
      throw new Error('USER_DISABLED')

    const sessionToken = createSessionToken()
    const session = await createSession(db, {
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt: resolveSessionExpiresAt(),
    })

    const workspaces = await teamListUserWorkspaces(db, user.id)
    const teams = workspaces.map(item => ({ team: item.workspace, quota: item.quota }))
    const teamCount = workspaces.filter(item => item.workspace.type === 'team').length
    const platformAccess = await resolvePlatformAccess(db, user)

    return {
      user: {
        ...user,
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
  })
}
