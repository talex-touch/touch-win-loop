import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getProjectKnowledgeSourceStatusByResourceId } from '~~/server/utils/project-knowledge-store'
import { getVisibleProjectById } from '~~/server/utils/platform-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40093)
  }

  const payload = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return { ok: false as const, reason: 'PROJECT_NOT_FOUND' as const }

    const source = await getProjectKnowledgeSourceStatusByResourceId(db, {
      projectId,
      resourceId,
    })

    if (!source)
      return { ok: false as const, reason: 'RESOURCE_NOT_FOUND' as const }

    return {
      ok: true as const,
      source,
    }
  })

  if (!payload.ok) {
    setResponseStatus(event, payload.reason === 'PROJECT_NOT_FOUND' ? 404 : 404)
    return fail(payload.reason === 'PROJECT_NOT_FOUND' ? 'project not found' : '资源不存在或尚未接入索引。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, payload.reason === 'PROJECT_NOT_FOUND' ? 40493 : 40494)
  }

  return ok(payload.source, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
  })
})
