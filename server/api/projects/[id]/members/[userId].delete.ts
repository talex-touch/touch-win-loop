import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { removeProjectMember } from '~~/server/utils/platform-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const targetUserId = String(getRouterParam(event, 'userId') || '').trim()

  if (!projectId || !targetUserId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 targetUserId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40054)
  }

  try {
    const snapshot = await withTransaction(event, async (db) => {
      return removeProjectMember(db, {
        projectId,
        actorUser: user,
        targetUserId,
      })
    })

    return ok(snapshot, {
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
      return fail('当前用户无权管理该项目成员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40354)
    }

    if (error instanceof Error && error.message === 'MANAGER_CAN_ONLY_REMOVE_MEMBER') {
      setResponseStatus(event, 403)
      return fail('manager 仅可移除普通成员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40355)
    }

    if (error instanceof Error && error.message === 'PROJECT_OWNER_IMMUTABLE') {
      setResponseStatus(event, 409)
      return fail('项目 owner 不可移除。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40954)
    }

    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('项目不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40454)
    }

    throw error
  }
})
