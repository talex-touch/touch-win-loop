import type { ProjectKnowledgeRelationNodeType } from '~~/shared/types/domain'
import { getQuery, setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { buildProjectKnowledgeNodeDetail } from '~~/server/utils/project-knowledge-analytics-store'

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
    }, 40096)
  }

  const query = getQuery(event)
  const nodeId = String(query.nodeId || '').trim()
  const nodeType = String(query.nodeType || '').trim() as ProjectKnowledgeRelationNodeType
  if (!nodeId || (nodeType !== 'source' && nodeType !== 'chunk')) {
    setResponseStatus(event, 400)
    return fail('缺少合法的 nodeId / nodeType。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40097)
  }

  const payload = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return null
    return buildProjectKnowledgeNodeDetail(db, {
      projectId,
      nodeId,
      nodeType,
    })
  })

  if (!payload) {
    setResponseStatus(event, 404)
    return fail('node not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40496)
  }

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
  })
})
