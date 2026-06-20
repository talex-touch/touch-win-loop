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
  targetUserIds?: string[]
  roles?: PlatformRole[]
}

const ASSIGNABLE_ROLES: PlatformRole[] = ['user_admin', 'contest_admin', 'pricing_admin']

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

  const targetUserIds = Array.isArray(body?.targetUserIds)
    ? body.targetUserIds.map(item => String(item || '').trim()).filter(Boolean)
    : [String(body?.targetUserId || '').trim()].filter(Boolean)
  const uniqueTargetUserIds = [...new Set(targetUserIds)]
  const roles = Array.isArray(body?.roles)
    ? [...new Set(body.roles.filter(item => ASSIGNABLE_ROLES.includes(item)))]
    : []

  if (uniqueTargetUserIds.length === 0) {
    setResponseStatus(event, 400)
    return fail('targetUserIds 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40088)
  }

  let assignments: PlatformRoleAssignment[] = []
  try {
    assignments = await withTransaction(event, async (db) => {
      const results: PlatformRoleAssignment[] = []
      for (const targetUserId of uniqueTargetUserIds) {
        const result = await setPlatformRolesByUserId(db, {
          targetUserId,
          roles,
        })
        if (!result)
          throw new Error('TARGET_USER_NOT_FOUND')
        results.push(result)
      }
      return results
    })
  }
  catch (error) {
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

    if (error instanceof Error && error.message === 'TARGET_USER_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('target user not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40488)
    }

    throw error
  }

  return ok({
    assignments,
    count: assignments.length,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
