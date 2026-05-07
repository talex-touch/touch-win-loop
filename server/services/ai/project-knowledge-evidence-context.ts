import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectKnowledgeEvidencePath,
  ProjectKnowledgeRelation,
  ProjectKnowledgeRelationNodeType,
  ProjectKnowledgeRetrievalPlan,
} from '~~/shared/types/domain'
import {
  buildProjectKnowledgeNodeDetail,
  buildProjectKnowledgeRelationsPayload,
  buildProjectKnowledgeSemanticLayoutPayload,
} from '~~/server/utils/project-knowledge-analytics-store'

interface ProjectKnowledgeEvidenceHit {
  chunkId: string
  sourceId: string
  citationLabel: string
  resourceTitle: string
}

interface ProjectKnowledgeEvidenceContextInput {
  projectId: string
  retrievalPlan: ProjectKnowledgeRetrievalPlan
  hits: ProjectKnowledgeEvidenceHit[]
  limit?: number
}

export interface ProjectKnowledgeEvidenceContextResult {
  summaryText: string
  evidencePaths: ProjectKnowledgeEvidencePath[]
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeScore(value: unknown): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return 0
  return Math.max(0, Math.min(1, normalized))
}

function relationMatchesHit(relation: ProjectKnowledgeRelation, hit: ProjectKnowledgeEvidenceHit): boolean {
  return relation.sourceNodeId === hit.chunkId
    || relation.targetNodeId === hit.chunkId
    || relation.sourceNodeId === hit.sourceId
    || relation.targetNodeId === hit.sourceId
}

function relationMatchesIntent(relation: ProjectKnowledgeRelation, plan: ProjectKnowledgeRetrievalPlan): boolean {
  if (plan.relationTypes.length > 0 && !plan.relationTypes.includes(relation.relationType))
    return false
  if (relation.relationType === 'belongs_to')
    return true
  if (relation.relationType === 'similar_to' || relation.relationType === 'aligned_to')
    return true
  if (relation.relationType === 'duplicated_with' || relation.relationType === 'references')
    return true
  return plan.intent === 'evidence_trace' || plan.intent === 'relation_explore'
}

function buildNodeLabel(
  nodeMap: Map<string, { label: string }>,
  nodeType: ProjectKnowledgeRelationNodeType,
  nodeId: string,
  fallback = '知识节点',
): string {
  return normalizeString(nodeMap.get(`${nodeType}:${nodeId}`)?.label) || fallback
}

function buildEvidenceSummary(path: Omit<ProjectKnowledgeEvidencePath, 'summary'>): string {
  const relationLabel = path.relationType === 'belongs_to'
    ? '归属'
    : path.relationType === 'derived_from'
      ? '投影来源'
      : path.relationType === 'similar_to'
        ? '相似片段'
        : path.relationType === 'aligned_to'
          ? '跨模态对齐'
          : path.relationType === 'duplicated_with'
            ? '重复资料'
            : '引用关系'
  return `${relationLabel}：${path.sourceLabel} -> ${path.targetLabel}`
}

function buildEvidencePath(input: {
  relation: ProjectKnowledgeRelation
  nodeMap: Map<string, { label: string }>
  citationChunkId?: string
}): ProjectKnowledgeEvidencePath {
  const base = {
    id: input.relation.id,
    relationType: input.relation.relationType,
    sourceNodeType: input.relation.sourceNodeType,
    sourceNodeId: input.relation.sourceNodeId,
    sourceLabel: buildNodeLabel(input.nodeMap, input.relation.sourceNodeType, input.relation.sourceNodeId),
    targetNodeType: input.relation.targetNodeType,
    targetNodeId: input.relation.targetNodeId,
    targetLabel: buildNodeLabel(input.nodeMap, input.relation.targetNodeType, input.relation.targetNodeId),
    score: normalizeScore(input.relation.score),
    evidenceMetric: normalizeString(input.relation.evidenceMetric),
    evidenceModel: normalizeString(input.relation.evidenceModel),
    citationChunkId: input.citationChunkId,
  }
  return {
    ...base,
    summary: buildEvidenceSummary(base),
  }
}

function buildEmptyEvidenceContext(): ProjectKnowledgeEvidenceContextResult {
  return {
    summaryText: '',
    evidencePaths: [],
  }
}

export async function buildProjectKnowledgeEvidenceContext(
  db: Queryable,
  input: ProjectKnowledgeEvidenceContextInput,
): Promise<ProjectKnowledgeEvidenceContextResult> {
  const projectId = normalizeString(input.projectId)
  if (!projectId || input.hits.length === 0)
    return buildEmptyEvidenceContext()

  const [relationsPayload, semanticPayload] = await Promise.all([
    buildProjectKnowledgeRelationsPayload(db, {
      projectId,
    }),
    input.retrievalPlan.intent === 'global_summary'
      ? buildProjectKnowledgeSemanticLayoutPayload(db, {
          projectId,
          layoutType: 'chunk_space',
          level: 'cluster',
        })
      : Promise.resolve(null),
  ])

  const nodeDetails = await Promise.all(input.hits.slice(0, 4).flatMap((hit) => {
    return [
      buildProjectKnowledgeNodeDetail(db, {
        projectId,
        nodeId: hit.chunkId,
        nodeType: 'chunk',
      }),
      buildProjectKnowledgeNodeDetail(db, {
        projectId,
        nodeId: hit.sourceId,
        nodeType: 'source',
      }),
    ]
  })).catch(() => [])

  const nodeMap = new Map(
    relationsPayload.nodes.map(node => [`${node.nodeType}:${node.id}`, { label: node.label }]),
  )
  for (const detail of nodeDetails) {
    if (!detail)
      continue
    nodeMap.set(`${detail.nodeType}:${detail.nodeId}`, { label: detail.label })
  }
  const paths: ProjectKnowledgeEvidencePath[] = []
  const seen = new Set<string>()
  const hitByChunkId = new Map(input.hits.map(hit => [hit.chunkId, hit]))

  for (const hit of input.hits) {
    const relations = relationsPayload.relations
      .filter(relation => relationMatchesHit(relation, hit))
      .filter(relation => relationMatchesIntent(relation, input.retrievalPlan))
      .sort((left, right) => right.score - left.score)

    for (const relation of relations) {
      const key = `${relation.relationType}:${relation.sourceNodeType}:${relation.sourceNodeId}:${relation.targetNodeType}:${relation.targetNodeId}`
      if (seen.has(key))
        continue
      seen.add(key)
      paths.push(buildEvidencePath({
        relation,
        nodeMap,
        citationChunkId: relation.sourceNodeId === hit.chunkId || relation.targetNodeId === hit.chunkId
          ? hit.chunkId
          : hitByChunkId.get(relation.sourceNodeId)?.chunkId || hitByChunkId.get(relation.targetNodeId)?.chunkId,
      }))
      if (paths.length >= Math.max(3, Math.min(10, Number(input.limit || 8))))
        break
    }
    if (paths.length >= Math.max(3, Math.min(10, Number(input.limit || 8))))
      break
  }

  const semanticClusters = semanticPayload?.clusters.slice(0, 5) || []
  for (const cluster of semanticClusters) {
    paths.push({
      id: `semantic:${cluster.id}`,
      relationType: 'similar_to',
      sourceNodeType: 'source',
      sourceNodeId: cluster.id,
      sourceLabel: cluster.topicLabel || cluster.label,
      targetNodeType: 'source',
      targetNodeId: cluster.id,
      targetLabel: `语义主题摘要：${cluster.topicLabel || cluster.label}`,
      score: normalizeScore(cluster.similarityScore),
      evidenceMetric: 'semantic_cluster',
      evidenceModel: 'project_knowledge_semantic_layout',
      summary: `语义主题摘要：${cluster.topicLabel || cluster.label}（${cluster.nodeCount} 个节点）`,
    })
  }

  const relationLines = paths
    .filter(path => !path.id.startsWith('semantic:'))
    .slice(0, 6)
    .map((path, index) => `${index + 1}. ${path.summary}（score=${path.score.toFixed(2)}）`)
  const semanticLines = semanticClusters
    .map((cluster, index) => `${index + 1}. ${cluster.topicLabel || cluster.label}（${cluster.nodeCount} 节点，相似度 ${cluster.similarityScore.toFixed(2)}）`)

  const lines = [
    relationLines.length > 0 ? `结构化证据路径：\n${relationLines.join('\n')}` : '',
    semanticLines.length > 0 ? `语义主题摘要：\n${semanticLines.join('\n')}` : '',
  ].filter(Boolean)

  return {
    summaryText: lines.join('\n\n'),
    evidencePaths: paths.slice(0, Math.max(3, Math.min(12, Number(input.limit || 8)))),
  }
}
