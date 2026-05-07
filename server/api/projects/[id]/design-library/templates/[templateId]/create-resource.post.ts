import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createProjectDesignResourceFromCanvasLibrarySceneTemplate } from '~~/server/utils/canvas-library-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanImportCanvasLibraryToProject } from '~~/server/utils/project-access-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const templateId = normalizeString(getRouterParam(event, 'templateId'))

  const resource = await withTransaction(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')
    const canImport = await teamCanImportCanvasLibraryToProject(db, user, projectId)
    if (!canImport)
      throw new Error('FORBIDDEN')
    return createProjectDesignResourceFromCanvasLibrarySceneTemplate(db, {
      projectId,
      itemId: templateId,
      actorUserId: user.id,
    })
  }).catch((error) => {
    if (error instanceof Error && ['PROJECT_NOT_FOUND', 'FORBIDDEN', 'CANVAS_LIBRARY_TEMPLATE_NOT_FOUND', 'CANVAS_LIBRARY_TEMPLATE_INVALID'].includes(error.message))
      return error.message
    throw error
  })

  if (resource === 'PROJECT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40502)
  }

  if (resource === 'FORBIDDEN') {
    setResponseStatus(event, 403)
    return fail('当前用户无权导入画布资源库模板。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40503)
  }

  if (resource === 'CANVAS_LIBRARY_TEMPLATE_NOT_FOUND' || resource === 'CANVAS_LIBRARY_TEMPLATE_INVALID') {
    setResponseStatus(event, 404)
    return fail('scene template 不存在，或不是可创建设计资源的模板。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40504)
  }

  return ok(resource, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
