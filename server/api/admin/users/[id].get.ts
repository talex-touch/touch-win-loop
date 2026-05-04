import { setResponseStatus } from 'h3'
import { getAdminUserDetail } from '~~/server/utils/admin-user-store'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const userId = String(getRouterParam(event, 'id') || '').trim()

  const canReadUsers = await checkPlatformPermission(event, user, 'user.read')
  if (!canReadUsers) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看用户详情。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  if (!userId) {
    setResponseStatus(event, 400)
    return fail('缺少用户 ID。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  const detail = await withClient(event, db => getAdminUserDetail(db, userId))
  if (!detail) {
    setResponseStatus(event, 404)
    return fail('目标用户不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40494)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
