import { listAdminUsers } from '~~/server/utils/admin-user-store'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { listPlatformRoleAssignments } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getPlatformAccess } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const access = await getPlatformAccess(event, user)
  const canAssign = access.permissions.includes('role.assign')

  const { assignments, users } = canAssign
    ? await withClient(event, async db => ({
        assignments: await listPlatformRoleAssignments(db),
        users: (await listAdminUsers(db)).map(item => ({
          userId: item.userId,
          username: item.username,
          roles: item.roles,
        })),
      }))
    : { assignments: [], users: [] }

  return ok({
    current: {
      userId: user.id,
      username: user.username,
      roles: access.roles,
      permissions: access.permissions,
    },
    assignments,
    users,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
