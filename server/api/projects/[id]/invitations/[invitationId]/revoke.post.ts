import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getProjectMemberManagementSnapshot, revokeProjectInvitation } from '~~/server/utils/platform-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const invitationId = String(getRouterParam(event, 'invitationId') || '').trim()

  if (!projectId || !invitationId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 invitationId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40058)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const revoked = await revokeProjectInvitation(db, {
        projectId,
        actorUser: user,
        invitationId,
      })
      const snapshot = await getProjectMemberManagementSnapshot(db, projectId)
      if (!snapshot)
        throw new Error('PROJECT_NOT_FOUND')
      return {
        ...snapshot,
        revoked,
      }
    })

    return ok(result, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('项目不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40458)
    }

    if (error instanceof Error && error.message === 'INVITATION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('邀请不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40459)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权撤销该项目邀请。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40359)
    }

    if (error instanceof Error && error.message === 'MANAGER_CAN_ONLY_REVOKE_VIEWER') {
      setResponseStatus(event, 403)
      return fail('当前角色仅可撤销 viewer 邀请。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40360)
    }

    throw error
  }
})
