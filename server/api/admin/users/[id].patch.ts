import { setResponseStatus } from 'h3'
import { updateAdminUserProfile } from '~~/server/utils/admin-user-store'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchAdminUserBody {
  username?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const userId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchAdminUserBody>(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改用户资料。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40396)
  }

  if (!userId) {
    setResponseStatus(event, 400)
    return fail('缺少用户 ID。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  try {
    const updated = await withTransaction(event, db => updateAdminUserProfile(db, {
      userId,
      username: String(body?.username || '').trim(),
    }))

    if (!updated) {
      setResponseStatus(event, 404)
      return fail('目标用户不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40496)
    }

    return ok(updated, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, '用户资料更新成功。')
  }
  catch (error) {
    if (error instanceof Error && error.message === 'USERNAME_REQUIRED') {
      setResponseStatus(event, 400)
      return fail('用户名不能为空。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 400100)
    }

    if (error instanceof Error && error.message === 'USERNAME_TOO_SHORT') {
      setResponseStatus(event, 400)
      return fail('用户名至少 3 位。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 400101)
    }

    if (error instanceof Error && (error.message === 'USERNAME_ALREADY_EXISTS' || error.message.includes('duplicate key'))) {
      setResponseStatus(event, 409)
      return fail('用户名已存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40995)
    }

    throw error
  }
})
