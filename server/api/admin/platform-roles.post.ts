import type { PlatformRole } from '~~/shared/types/domain'
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

const ALLOWED_ROLES: PlatformRole[] = ['platform_super_admin', 'contest_admin', 'pricing_admin']

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
    ? body.roles.filter(item => ALLOWED_ROLES.includes(item))
    : []

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

  const assignment = await withTransaction(event, async (db) => {
    return setPlatformRolesByUserId(db, {
      targetUserId,
      roles,
    })
  })

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
