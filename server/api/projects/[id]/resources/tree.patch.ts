import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'
import { patchProjectResourceTree } from '~~/server/utils/project-resource-store'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

interface ProjectResourceTreePatchBody {
  items?: Array<{
    resourceId?: string
    parentResourceId?: string | null
    sortOrder?: number
  }>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = await readBody<ProjectResourceTreePatchBody>(event).catch(() => null)
  const items = Array.isArray(body?.items) ? body!.items : []

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40131)
  }

  if (items.length === 0) {
    setResponseStatus(event, 400)
    return fail('缺少树排序数据。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40132)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const manageable = await teamCanManageProject(db, user, projectId)
      if (!manageable)
        throw new Error('FORBIDDEN')

      const resources = await patchProjectResourceTree(db, {
        projectId,
        actorUserId: user.id,
        items: items.map(item => ({
          resourceId: normalizeString(item.resourceId),
          parentResourceId: normalizeString(item.parentResourceId) || null,
          sortOrder: Number(item.sortOrder || 0),
        })),
      })

      return {
        resources,
        workspaceId: project.workspaceId || project.teamId,
      }
    })

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

    return ok({
      items: result.resources,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, '资源树已更新。')
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
      }, 404131)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理项目资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 403131)
    }

    if (error instanceof Error && error.message === 'RESOURCE_PARENT_NOT_FOUND') {
      setResponseStatus(event, 400)
      return fail('目标父节点不存在，或不在当前项目内。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 400131)
    }

    if (error instanceof Error && error.message === 'RESOURCE_TREE_CYCLE') {
      setResponseStatus(event, 400)
      return fail('资源树结构非法，不能将节点移动到自身后代下。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 400132)
    }

    if (error instanceof Error && (error.message === 'RESOURCE_NOT_FOUND' || error.message === 'RESOURCE_TREE_DUPLICATE_ITEM')) {
      setResponseStatus(event, 400)
      return fail('资源树排序请求包含无效节点。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 400133)
    }

    throw error
  }
})
