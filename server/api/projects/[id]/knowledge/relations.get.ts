import type {
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeModality,
  ProjectKnowledgeProvenanceSourceType,
  ProjectKnowledgeRelationNodeType,
} from '~~/shared/types/domain'
import { getQuery, setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { buildProjectKnowledgeRelationsPayload } from '~~/server/utils/project-knowledge-analytics-store'

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.map(item => String(item || '').trim()).filter(Boolean)
  const normalized = String(value || '').trim()
  if (!normalized)
    return []
  return normalized.split(',').map(item => item.trim()).filter(Boolean)
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
    }, 40094)
  }

  const query = getQuery(event)
  const nodeType = String(query.nodeType || '').trim() as ProjectKnowledgeRelationNodeType | ''
  const modality = normalizeStringList(query.modality) as Array<ProjectKnowledgeModality | 'unknown'>
  const embeddingStatus = normalizeStringList(query.embeddingStatus) as ProjectKnowledgeEmbeddingStatus[]
  const provenance = normalizeStringList(query.provenance) as ProjectKnowledgeProvenanceSourceType[]
  const modelVersion = normalizeStringList(query.modelVersion)
  const timeRangeDays = Number(query.timeRangeDays || 0)

  const payload = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return null
    return buildProjectKnowledgeRelationsPayload(db, {
      projectId,
      nodeType,
      modality,
      embeddingStatus,
      provenance,
      modelVersion,
      timeRangeDays: Number.isFinite(timeRangeDays) && timeRangeDays > 0 ? Math.round(timeRangeDays) : null,
    })
  })

  if (!payload) {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40494)
  }

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
  })
})
