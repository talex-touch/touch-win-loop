import type { PlatformRole, PlatformRoleAssignment } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { setPlatformRolesByUserId } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface SetRoleBody {
  targetUserId?: string
  roles?: PlatformRole[]
}

const ALLOWED_ROLES: PlatformRole[] = ['platform_super_admin', 'user_admin', 'contest_admin', 'pricing_admin']

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<SetRoleBody>(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权分配平台角色。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40388)
  }

  const targetUserId = String(body?.targetUserId || '').trim()
  const roles = Array.isArray(body?.roles)
    ? [...new Set(body.roles.filter(item => ALLOWED_ROLES.includes(item)))]
    : []
  const includesSuperAdmin = roles.includes('platform_super_admin')

  if (includesSuperAdmin) {
    const canAssignSuper = await checkPlatformPermission(event, user, 'role.super.assign')
    if (!canAssignSuper) {
      setResponseStatus(event, 403)
      return fail('当前用户无权转移平台超管角色。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40389)
    }
  }

  if (!targetUserId) {
    setResponseStatus(event, 400)
    return fail('targetUserId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40088)
  }

  let assignment: PlatformRoleAssignment | null = null
  try {
    assignment = await withTransaction(event, async (db) => {
      return setPlatformRolesByUserId(db, {
        targetUserId,
        roles,
        allowSuperAdminTransfer: includesSuperAdmin,
      })
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'SUPER_ADMIN_ASSIGN_FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权转移平台超管角色。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40389)
    }

    if (error instanceof Error && error.message === 'UNIQUE_SUPER_ADMIN_REQUIRED') {
      setResponseStatus(event, 400)
      return fail('平台必须且只能保留一个 platform_super_admin。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40089)
    }

    throw error
  }

  if (!assignment) {
    setResponseStatus(event, 404)
    return fail('target user not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40488)
  }

  return ok(assignment, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
