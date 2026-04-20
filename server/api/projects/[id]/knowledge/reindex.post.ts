import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'
import { reindexProjectKnowledgeSources } from '~~/server/utils/project-knowledge-store'

type ProjectKnowledgeReindexTarget = 'all' | 'stale' | 'failed'

function normalizeTarget(value: unknown): ProjectKnowledgeReindexTarget {
  const normalized = String(value || '').trim()
  if (normalized === 'all' || normalized === 'failed')
    return normalized
  return 'stale'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40092)
  }

  const bodyRaw = await readBody<unknown>(event).catch(() => null)
  const body = bodyRaw && typeof bodyRaw === 'object' ? bodyRaw as Record<string, unknown> : {}
  const target = normalizeTarget(body.target)

  const payload = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return { ok: false as const, reason: 'PROJECT_NOT_FOUND' as const }
    const manageable = await teamCanManageProject(db, user, projectId)
    if (!manageable)
      return { ok: false as const, reason: 'FORBIDDEN' as const }
    const result = await reindexProjectKnowledgeSources(db, {
      projectId,
      target,
    })
    return {
      ok: true as const,
      result,
    }
  })

  if (!payload.ok) {
    if (payload.reason === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40492)
    }

    setResponseStatus(event, 403)
    return fail('当前用户无权重建项目知识索引。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40392)
  }

  return ok(payload.result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
  })
})
