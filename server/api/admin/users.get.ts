import { setResponseStatus } from 'h3'
import { listAdminUsers } from '~~/server/utils/admin-user-store'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canReadUsers = await checkPlatformPermission(event, user, 'user.read')
  if (!canReadUsers) {
    setResponseStatus(event, 403)
    return fail('当前用户无权访问用户管理。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40391)
  }

  const users = await withClient(event, db => listAdminUsers(db))

  return ok(users, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
