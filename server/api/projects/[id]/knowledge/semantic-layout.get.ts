import type {
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeModality,
  ProjectKnowledgeProvenanceSourceType,
  ProjectKnowledgeSemanticLayoutLevel,
  ProjectKnowledgeSemanticLayoutType,
} from '~~/shared/types/domain'
import { getQuery, setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { buildProjectKnowledgeSemanticLayoutPayload } from '~~/server/utils/project-knowledge-analytics-store'

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.map(item => String(item || '').trim()).filter(Boolean)
  const normalized = String(value || '').trim()
  if (!normalized)
    return []
  return normalized.split(',').map(item => item.trim()).filter(Boolean)
}

function normalizeLayoutType(value: unknown): ProjectKnowledgeSemanticLayoutType {
  const normalized = String(value || '').trim()
  if (normalized === 'document_galaxy' || normalized === 'multimodal_bridge')
    return normalized
  return 'chunk_space'
}

function normalizeLevel(value: unknown): ProjectKnowledgeSemanticLayoutLevel {
  const normalized = String(value || '').trim()
  if (normalized === 'cluster' || normalized === 'document')
    return normalized
  return 'chunk'
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
    }, 40095)
  }

  const query = getQuery(event)
  const layoutType = normalizeLayoutType(query.layoutType)
  const level = normalizeLevel(query.level)
  const modality = normalizeStringList(query.modality) as Array<ProjectKnowledgeModality | 'unknown'>
  const embeddingStatus = normalizeStringList(query.embeddingStatus) as ProjectKnowledgeEmbeddingStatus[]
  const provenance = normalizeStringList(query.provenance) as ProjectKnowledgeProvenanceSourceType[]
  const modelVersion = normalizeStringList(query.modelVersion)
  const timeRangeDays = Number(query.timeRangeDays || 0)

  const payload = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return null
    return buildProjectKnowledgeSemanticLayoutPayload(db, {
      projectId,
      layoutType,
      level,
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
    }, 40495)
  }

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
  })
})
