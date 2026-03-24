import type { ProjectMemberRole } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { upsertProjectMember } from '~~/server/utils/platform-store'

interface UpsertProjectMemberBody {
  userId?: string
  username?: string
  role?: ProjectMemberRole
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<UpsertProjectMemberBody>(event)

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40052)
  }

  try {
    const snapshot = await withTransaction(event, async (db) => {
      return upsertProjectMember(db, {
        projectId,
        actorUser: user,
        targetUserId: String(body?.userId || '').trim() || undefined,
        targetUsername: String(body?.username || '').trim() || undefined,
        role: body?.role,
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
    if (error instanceof Error && error.message === 'PROJECT_MEMBER_TARGET_REQUIRED') {
      setResponseStatus(event, 400)
      return fail('请提供 userId 或 username。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40053)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理该项目成员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40352)
    }

    if (error instanceof Error && error.message === 'MANAGER_CAN_ONLY_ASSIGN_MEMBER') {
      setResponseStatus(event, 403)
      return fail('manager 仅可添加普通成员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40353)
    }

    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标用户不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40452)
    }

    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('项目不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40453)
    }

    if (error instanceof Error && error.message === 'PROJECT_SEAT_LIMIT_REACHED') {
      setResponseStatus(event, 409)
      return fail('项目席位已满，请先扩容席位。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40952)
    }

    if (error instanceof Error && error.message === 'TEAM_SEAT_LIMIT_REACHED') {
      setResponseStatus(event, 409)
      return fail('Team 席位已满，请先 add seat。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40953)
    }

    throw error
  }
})
