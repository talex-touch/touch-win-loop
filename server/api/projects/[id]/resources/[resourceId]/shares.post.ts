import type { ProjectResourceShareDurationPreset, ProjectResourceShareVisibility } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { canManageProject, getVisibleProjectById } from '~~/server/utils/platform-store'
import { createProjectResourceShare } from '~~/server/utils/project-resource-share-store'

interface ShareBody {
  visibility?: ProjectResourceShareVisibility
  duration?: ProjectResourceShareDurationPreset
}

function normalizeVisibility(value: unknown): ProjectResourceShareVisibility | '' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'public' || normalized === 'workspace')
    return normalized
  return ''
}

function normalizeDuration(value: unknown): ProjectResourceShareDurationPreset | '' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === '1h' || normalized === '1d' || normalized === '3d' || normalized === '7d' || normalized === '1mon')
    return normalized
  return ''
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const body = (await readBody<ShareBody>(event)) || {}
  const visibility = normalizeVisibility(body.visibility)
  const duration = normalizeDuration(body.duration)

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40091)
  }

  if (!visibility || !duration) {
    setResponseStatus(event, 400)
    return fail('分享参数不合法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  try {
    const share = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const manageable = await canManageProject(db, user, projectId)
      if (!manageable)
        throw new Error('FORBIDDEN')

      return createProjectResourceShare(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
        visibility,
        duration,
      })
    })

    return ok(share, {
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
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40491)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理项目资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40391)
    }

    if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('资源不存在，或已被删除。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40492)
    }

    throw error
  }
})
