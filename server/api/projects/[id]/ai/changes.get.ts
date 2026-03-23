import type { AiProjectChangeStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { canManageProject, getVisibleProjectById } from '~~/server/utils/platform-store'
import { listAiProjectChangeRequestsByProject } from '~~/server/utils/project-ai-store'

const ALL_STATUSES: AiProjectChangeStatus[] = ['pending', 'approved', 'rejected', 'failed']

function parseStatuses(value: unknown): AiProjectChangeStatus[] {
  const text = String(value || '').trim()
  if (!text)
    return ALL_STATUSES
  const picked = text
    .split(',')
    .map(item => item.trim())
    .filter((item): item is AiProjectChangeStatus => ALL_STATUSES.includes(item as AiProjectChangeStatus))
  return picked.length > 0 ? picked : ALL_STATUSES
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)
  const statuses = parseStatuses(query.statuses)
  const limit = Number(query.limit || 100)

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  const result = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')

    const manageable = await canManageProject(db, user, projectId)
    if (!manageable)
      throw new Error('FORBIDDEN')

    return listAiProjectChangeRequestsByProject(db, {
      projectId,
      statuses,
      limit,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return null
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return 'FORBIDDEN'
    }
    throw error
  })

  if (!result) {
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40497)
  }

  if (result === 'FORBIDDEN') {
    return fail('当前用户无权管理 AI 变更审批。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  return ok(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
