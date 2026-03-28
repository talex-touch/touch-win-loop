import type { AuthMeResult } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { resolvePlatformAccess } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { ensureBootstrapPlatformSuperAdmin } from '~~/server/utils/platform-store'
import { teamListUserWorkspaces } from '~~/server/utils/team-workspace-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const { userWithAccess, workspaces } = await withTransaction(event, async (db) => {
    let effectiveUser = user

    const promotedAsBootstrapAdmin = await ensureBootstrapPlatformSuperAdmin(db, user.id)
    if (promotedAsBootstrapAdmin) {
      effectiveUser = {
        ...user,
        isPlatformAdmin: true,
      }
    }

    const workspaces = await teamListUserWorkspaces(db, user.id)
    const access = await resolvePlatformAccess(db, effectiveUser)

    return {
      userWithAccess: {
        ...effectiveUser,
        platformRoles: access.roles,
        platformPermissions: access.permissions,
      },
      workspaces,
    }
  })

  const data: AuthMeResult = {
    user: userWithAccess,
    teams: workspaces.map(item => ({ team: item.workspace, quota: item.quota })),
    workspaces,
    onboarding: {
      needCreateTeam: workspaces.every(item => item.workspace.type !== 'team'),
    },
  }

  return ok(data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
