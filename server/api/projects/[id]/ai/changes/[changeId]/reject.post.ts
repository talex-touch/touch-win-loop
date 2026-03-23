import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { canManageProject, getVisibleProjectById } from '~~/server/utils/platform-store'
import {
  getAiProjectChangeRequestById,
  markAiProjectChangeRequestRejected,
} from '~~/server/utils/project-ai-store'

interface RejectChangeRequestPayload {
  reason?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const changeId = String(getRouterParam(event, 'changeId') || '').trim()
  const body = await readBody<RejectChangeRequestPayload>(event)
    .catch(() => ({} as RejectChangeRequestPayload))
  const reason = String(body.reason || '').trim()

  if (!projectId || !changeId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 changeId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40103)
  }

  const rejected = await withTransaction(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')

    const manageable = await canManageProject(db, user, projectId)
    if (!manageable)
      throw new Error('FORBIDDEN')

    const change = await getAiProjectChangeRequestById(db, {
      projectId,
      changeId,
    })
    if (!change)
      throw new Error('CHANGE_NOT_FOUND')
    if (change.status !== 'pending')
      throw new Error('CHANGE_NOT_PENDING')

    const result = await markAiProjectChangeRequestRejected(db, {
      projectId,
      changeId,
      actorUserId: user.id,
      reason,
    })

    if (!result)
      throw new Error('CHANGE_NOT_FOUND')

    return result
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return null
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return 'FORBIDDEN'
    }
    if (error instanceof Error && error.message === 'CHANGE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return 'CHANGE_NOT_FOUND'
    }
    if (error instanceof Error && error.message === 'CHANGE_NOT_PENDING') {
      setResponseStatus(event, 409)
      return 'CHANGE_NOT_PENDING'
    }
    throw error
  })

  if (!rejected) {
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40498)
  }

  if (rejected === 'FORBIDDEN') {
    return fail('当前用户无权拒绝该变更。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  if (rejected === 'CHANGE_NOT_FOUND') {
    return fail('变更请求不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40499)
  }

  if (rejected === 'CHANGE_NOT_PENDING') {
    return fail('变更请求已被处理，请刷新列表。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40998)
  }

  return ok(rejected, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
