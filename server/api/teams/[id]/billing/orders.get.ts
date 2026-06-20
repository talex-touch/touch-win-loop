import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { listWorkspaceBillingOrders } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400137)
  }

  const orders = await withClient(event, async (db) => {
    const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
    if (!canManage)
      throw new Error('FORBIDDEN')
    return listWorkspaceBillingOrders(db, { workspaceId, limit: 20 })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN')
      return 'FORBIDDEN' as const
    throw error
  })

  if (orders === 'FORBIDDEN') {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看该 Team 结算记录。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403137)
  }

  return ok({ orders }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
