import { getRequestURL, setResponseStatus } from 'h3'
import { createAdminUserMagicLink } from '~~/server/utils/admin-user-store'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateMagicLinkBody {
  ttlMinutes?: number
  redirect?: string
}

function resolveSafeRedirect(value: unknown): string {
  const redirect = String(value || '').trim()
  if (!redirect)
    return '/dashboard'
  if (!redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/login'))
    return '/dashboard'
  return redirect
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const userId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<CreateMagicLinkBody>(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权生成用户登录链接。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  if (!userId) {
    setResponseStatus(event, 400)
    return fail('缺少用户 ID。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400108)
  }

  try {
    const magic = await withTransaction(event, db => createAdminUserMagicLink(db, {
      targetUserId: userId,
      actorUserId: user.id,
      ttlMinutes: body?.ttlMinutes,
    }))

    const requestUrl = getRequestURL(event)
    const linkUrl = new URL('/api/auth/magic-login', requestUrl.origin)
    linkUrl.searchParams.set('token', magic.token)
    linkUrl.searchParams.set('redirect', resolveSafeRedirect(body?.redirect))

    return ok({
      url: linkUrl.toString(),
      expiresAt: magic.expiresAt,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, '登录链接已生成。')
  }
  catch (error) {
    if (error instanceof Error && error.message === 'TARGET_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标用户不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40499)
    }

    if (error instanceof Error && error.message === 'TARGET_DISABLED') {
      setResponseStatus(event, 400)
      return fail('目标用户已禁用，不能生成登录链接。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 400109)
    }

    throw error
  }
})
