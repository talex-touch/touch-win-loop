import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'
import {
  countProjectMarkdownResourceImageReferences,
  moveProjectResourceToRecycleBin,
} from '~~/server/utils/project-resource-store'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const resourceId = normalizeString(getRouterParam(event, 'resourceId'))
  const requestBody = await readBody<{ src?: string }>(event).catch(() => ({} as { src?: string }))

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const manageable = await teamCanManageProject(db, user, projectId)
      if (!manageable)
        throw new Error('FORBIDDEN')

      const referenceCount = await countProjectMarkdownResourceImageReferences(db, {
        projectId,
        resourceId,
        src: normalizeString(requestBody.src),
      })

      if (referenceCount > 1)
        throw new Error('RESOURCE_STILL_REFERENCED')

      const removed = await moveProjectResourceToRecycleBin(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
      })

      return {
        removed,
        workspaceId: project.workspaceId || project.teamId,
      }
    })

    await emitRealtimeEvent({
      type: 'project.resources.changed',
      workspaceId: result.workspaceId,
      projectId,
    })

    return ok({
      resourceId: result.removed.resourceId,
      recycle: true,
    }, {
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
      }, 40497)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权回收文档图片资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40397)
    }

    if (error instanceof Error && error.message === 'RESOURCE_STILL_REFERENCED') {
      setResponseStatus(event, 409)
      return fail('该图片仍被当前项目中的其他文档或位置引用，暂时无法回收资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40997)
    }

    if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('图片资源不存在，或已被删除。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40498)
    }

    throw error
  }
})
