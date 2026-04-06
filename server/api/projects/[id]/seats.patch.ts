import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { patchProjectSeatLimit } from '~~/server/utils/platform-store'

interface PatchProjectSeatBody {
  seatLimit?: number
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchProjectSeatBody>(event)
  const rawSeatLimit = Number(body?.seatLimit)
  const seatLimit = Number.isFinite(rawSeatLimit) ? Math.max(1, Math.trunc(rawSeatLimit)) : Number.NaN

  if (!projectId || !Number.isFinite(seatLimit) || seatLimit <= 0) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 seatLimit 非法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40055)
  }

  try {
    const quota = await withTransaction(event, async (db) => {
      return patchProjectSeatLimit(db, {
        projectId,
        actorUser: user,
        seatLimit,
      })
    })

    return ok(quota, {
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
      return fail('当前用户无权修改项目席位。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40356)
    }

    if (error instanceof Error && error.message === 'PROJECT_SEAT_LIMIT_BELOW_USED') {
      setResponseStatus(event, 409)
      return fail('seatLimit 不能小于当前已使用席位。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40955)
    }

    if (error instanceof Error && error.message === 'PROJECT_SEAT_LIMIT_MAX_EXCEEDED') {
      setResponseStatus(event, 409)
      return fail('项目席位上限为 15。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40956)
    }

    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('项目不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40455)
    }

    throw error
  }
})
