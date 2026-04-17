import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { reindexProjectKnowledgeSourceByResourceId } from '~~/server/utils/project-knowledge-store'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'

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
    }, 40094)
  }

  const payload = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return { ok: false as const, reason: 'PROJECT_NOT_FOUND' as const }
    const manageable = await teamCanManageProject(db, user, projectId)
    if (!manageable)
      return { ok: false as const, reason: 'FORBIDDEN' as const }

    const source = await reindexProjectKnowledgeSourceByResourceId(db, {
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
    if (payload.reason === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40495)
    }
    if (payload.reason === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权重建该资源的知识索引。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40395)
    }

    setResponseStatus(event, 404)
    return fail('资源不存在或尚未接入索引。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40496)
  }

  return ok(payload.source, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
  })
})
