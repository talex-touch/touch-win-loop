import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamQuotaResponse } from '~~/server/utils/team-api-presenter'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'
import { teamPatchSeatLimit } from '~~/server/utils/team-quota-store'

interface PatchTeamSeatLimitBody {
  seatLimit?: number
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchTeamSeatLimitBody>(event)

  const rawSeatLimit = Number(body?.seatLimit)
  const seatLimit = Number.isFinite(rawSeatLimit) ? Math.max(1, Math.trunc(rawSeatLimit)) : Number.NaN

  if (!workspaceId || !Number.isFinite(seatLimit) || seatLimit <= 0) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId 或 seatLimit 非法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  try {
    const quota = await withTransaction(event, async (db) => {
      const canManage = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canManage)
        throw new Error('FORBIDDEN')

      return teamPatchSeatLimit(db, {
        workspaceId,
        seatLimit,
      })
    })

    return ok(toTeamQuotaResponse(quota), {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权修改该 Team 席位。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40393)
    }

    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('Team 不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40493)
    }

    if (error instanceof Error && error.message === 'PERSONAL_TEAM_SEAT_READ_ONLY') {
      setResponseStatus(event, 409)
      return fail('Personal Team 为只读席位，不支持 add seat。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40993)
    }

    if (error instanceof Error && error.message === 'TEAM_SEAT_LIMIT_BELOW_USED') {
      setResponseStatus(event, 409)
      return fail('seatLimit 不能小于当前已使用席位。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40994)
    }

    throw error
  }
})
