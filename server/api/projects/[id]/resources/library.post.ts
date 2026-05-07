import { setResponseStatus } from 'h3'
import { generateAndSaveProjectOutline } from '~~/server/services/project-outline-generator'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'
import { bindLibraryResourceToProject } from '~~/server/utils/project-resource-store'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

interface AddLibraryResourceBody {
  resourceId?: string
  parentResourceId?: string | null
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = (await readBody<AddLibraryResourceBody>(event)) || {}
  const resourceId = String(body.resourceId || '').trim()

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40063)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const manageable = await teamCanManageProject(db, user, projectId)
      if (!manageable)
        throw new Error('FORBIDDEN')

      const resource = await bindLibraryResourceToProject(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
        parentResourceId: normalizeString(body.parentResourceId) || undefined,
      })

      return {
        resource,
        workspaceId: project.workspaceId || project.teamId,
      }
    })

    await withTransaction(event, async (db) => {
      await generateAndSaveProjectOutline(db, {
        projectId,
        user,
        reason: 'library_add_success',
      })
    }).catch(() => undefined)

    await Promise.allSettled([
      emitRealtimeEvent({
        type: 'project.resources.changed',
        workspaceId: result.workspaceId,
        projectId,
      }),
      emitRealtimeEvent({
        type: 'project.outline.changed',
        workspaceId: result.workspaceId,
        projectId,
      }),
    ])

    return ok(result.resource, {
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
      }, 40463)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理项目资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40363)
    }

    if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('资源不存在，或当前不可加入项目资料池。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40464)
    }

    if (error instanceof Error && error.message === 'RESOURCE_PARENT_NOT_FOUND') {
      setResponseStatus(event, 400)
      return fail('目标父节点不存在，或不在当前项目内。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40064)
    }

    throw error
  }
})
