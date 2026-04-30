import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectKnowledgeCitation,
  ProjectKnowledgeCitationLocator,
  ProjectKnowledgeCitationSourceScope,
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeIndexSourceStatus,
  ProjectKnowledgeMessagePayload,
  ProjectKnowledgeModality,
  ProjectKnowledgeProjectionType,
  ProjectKnowledgeRetrievalPlan,
  ProjectKnowledgeScopeType,
  ProjectKnowledgeSourceStatus,
  Resource,
} from '~~/shared/types/domain'
import { buildProjectKnowledgeEvidenceContext } from '~~/server/services/ai/project-knowledge-evidence-context'
import { buildProjectKnowledgeRetrievalPlan } from '~~/server/services/ai/project-knowledge-query-planner'
import { buildProjectResourceLocalContext } from '~~/server/services/ai/project-resource-context'
import {
  createKnowledgeEmbedding,
  extractKnowledgeKeywords,
  resolveKnowledgeEmbeddingFailureReason,
} from '~~/server/services/knowledge-ai'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import {
  buildProjectKnowledgeIndexDashboard,
  listProjectKnowledgeSearchChunks,
  listProjectKnowledgeSearchChunksByVectorPreselect,
} from '~~/server/utils/project-knowledge-store'

interface ProjectKnowledgeContextInput {
  projectId: string
  query: string
  resources?: Resource[]
  contestName?: string
  trackName?: string
  major?: string
  limit?: number
  event?: H3Event
}

interface ProjectKnowledgeChunkHit {
  chunkId: string
  sourceId: string
  scopeType: ProjectKnowledgeScopeType
  sourceResourceId?: string | null
  linkedContestResourceId?: string | null
  resourceTitle: string
  resourceSource?: Resource['source'] | ''
  chunkKind: string
  citationLabel: string
  pageNumber?: number | null
  sectionLabel?: string
  content: string
  sourceStatus: ProjectKnowledgeSourceStatus
  modality?: ProjectKnowledgeModality
  projectionType?: ProjectKnowledgeProjectionType
  projectionSource?: string
  metadata: Record<string, unknown>
  fallbackUsed: boolean
  score: number
}

const VISUAL_QUERY_HINTS = ['截图', '界面', '海报', '页面', '版式', '图里', '这张图', '图片', '视觉', '布局', '封面', '图表']
const MEETING_QUERY_HINTS = ['会议', '讨论', '老师说', '刚才提到', '刚刚提到', '会上', '纪要', '转写', '录音', '录屏']
const EVIDENCE_PATHS_SECTION_TITLE = '结构化证据路径'
const SEMANTIC_SUMMARY_SECTION_TITLE = '语义主题摘要'

export interface ProjectKnowledgeContextResult extends ProjectKnowledgeMessagePayload {
  summaryText: string
}

type ProjectKnowledgeSearchChunkLike = Awaited<ReturnType<typeof listProjectKnowledgeSearchChunks>>[number]

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function summarizeText(value: unknown, max = 180): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ')
  if (!normalized)
    return ''
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, max)}...`
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    const normalized = normalizeString(value).toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }
  return false
}

function splitKeywords(value: string): string[] {
  return normalizeString(value)
    .toLowerCase()
    .split(/[\s,，。.!！?？;；:：/\\|()[\]{}"'`~\-]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
}

function extractHanNgrams(value: string, min = 2, max = 4): string[] {
  const hits = normalizeString(value).match(/[\u4E00-\u9FFF]+/g) || []
  const result: string[] = []
  for (const hit of hits) {
    const safeMax = Math.min(max, hit.length)
    for (let size = min; size <= safeMax; size += 1) {
      for (let index = 0; index <= hit.length - size; index += 1)
        result.push(hit.slice(index, index + size))
    }
  }
  return result
}

function buildQueryTokens(query: string): string[] {
  return [...new Set([
    ...splitKeywords(query),
    ...extractKnowledgeKeywords(query, 12),
    ...extractHanNgrams(query),
  ])].slice(0, 24)
}

function flattenMetadataText(value: unknown): string {
  if (value == null)
    return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return normalizeString(value)
  if (Array.isArray(value))
    return value.map(item => flattenMetadataText(item)).filter(Boolean).join(' ')
  if (typeof value === 'object')
    return Object.values(value as Record<string, unknown>).map(item => flattenMetadataText(item)).filter(Boolean).join(' ')
  return ''
}

function detectQueryIntent(query: string, tokens: string[]): {
  visual: boolean
  meeting: boolean
} {
  const haystack = [normalizeString(query), ...tokens].join(' ').toLowerCase()
  return {
    visual: VISUAL_QUERY_HINTS.some(item => haystack.includes(item.toLowerCase())),
    meeting: MEETING_QUERY_HINTS.some(item => haystack.includes(item.toLowerCase())),
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || !right.length || left.length !== right.length)
    return 0

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index] || 0)
    const rightValue = Number(right[index] || 0)
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }

  if (leftNorm <= 0 || rightNorm <= 0)
    return 0

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function calcLexicalScore(input: {
  query: string
  tokens: string[]
  title: string
  body: string
  resourceTitle: string
  citationLabel: string
  sectionLabel: string
}): number {
  const query = normalizeString(input.query).toLowerCase()
  const title = normalizeString(input.title).toLowerCase()
  const body = normalizeString(input.body).toLowerCase()
  const resourceTitle = normalizeString(input.resourceTitle).toLowerCase()
  const citationLabel = normalizeString(input.citationLabel).toLowerCase()
  const sectionLabel = normalizeString(input.sectionLabel).toLowerCase()

  const titleTarget = [title, resourceTitle, citationLabel, sectionLabel].filter(Boolean).join(' ')
  const bodyTarget = body

  let score = 0
  if (query && (titleTarget.includes(query) || bodyTarget.includes(query)))
    score += 0.4

  const tokens = input.tokens
  if (tokens.length === 0)
    return Math.min(1, score)

  let matchedWeight = 0
  const maxWeight = tokens.length * 2
  for (const token of tokens) {
    if (titleTarget.includes(token)) {
      matchedWeight += 2
      continue
    }
    if (bodyTarget.includes(token))
      matchedWeight += 1
  }

  score += matchedWeight / Math.max(1, maxWeight)
  return Math.max(0, Math.min(1.25, score))
}

function calcResourceRelevance(resource: Resource, query: string, tokens: string[]): number {
  return calcLexicalScore({
    query,
    tokens,
    title: normalizeString(resource.title),
    body: [resource.summary, resource.content, resource.type, resource.category].map(item => normalizeString(item)).join('\n'),
    resourceTitle: normalizeString(resource.title),
    citationLabel: '',
    sectionLabel: '',
  })
}

function resolveChunkModality(metadata: Record<string, unknown>): ProjectKnowledgeModality | undefined {
  const normalized = normalizeString(metadata.modality)
  if (normalized === 'text' || normalized === 'image' || normalized === 'audio' || normalized === 'video' || normalized === 'draw')
    return normalized
  return undefined
}

function resolveChunkProjectionType(metadata: Record<string, unknown>): ProjectKnowledgeProjectionType | undefined {
  const normalized = normalizeString(metadata.projectionType)
  if (
    normalized === 'document_text'
    || normalized === 'markdown_text'
    || normalized === 'draw_projection'
    || normalized === 'resource_summary'
    || normalized === 'image_summary'
    || normalized === 'image_ocr'
    || normalized === 'meeting_notes'
    || normalized === 'meeting_transcript'
  ) {
    return normalized
  }
  return undefined
}

function resolveChunkEmbeddingStatus(metadata: Record<string, unknown>): ProjectKnowledgeEmbeddingStatus {
  const normalized = normalizeString(metadata.embeddingStatus)
  if (normalized === 'native' || normalized === 'derived' || normalized === 'fallback' || normalized === 'missing' || normalized === 'failed')
    return normalized
  if (metadata.embeddingFallbackUsed === true)
    return 'fallback'
  if (metadata.embeddingFallbackUsed === false)
    return 'native'
  return 'missing'
}

function matchesRetrievalPlanFilters(
  chunk: ProjectKnowledgeSearchChunkLike,
  retrievalPlan: ProjectKnowledgeRetrievalPlan,
): boolean {
  const metadata = chunk.metadata
  const modality = resolveChunkModality(metadata) || 'unknown'
  const projectionType = resolveChunkProjectionType(metadata)
  const embeddingStatus = resolveChunkEmbeddingStatus(metadata)

  if (retrievalPlan.preferredModalities.length > 0 && !retrievalPlan.preferredModalities.includes(modality))
    return false
  if (retrievalPlan.preferredProjectionTypes.length > 0 && (!projectionType || !retrievalPlan.preferredProjectionTypes.includes(projectionType)))
    return false
  if (retrievalPlan.preferredEmbeddingStatuses?.length && !retrievalPlan.preferredEmbeddingStatuses.includes(embeddingStatus))
    return false
  return true
}

function normalizeQueryVariants(query: string, retrievalPlan: ProjectKnowledgeRetrievalPlan): string[] {
  const variants = [query, ...(retrievalPlan.queryVariants || [])]
    .map(item => normalizeString(item))
    .filter(Boolean)
  return [...new Set(variants)].slice(0, 4)
}

function dedupeChunks(chunks: ProjectKnowledgeSearchChunkLike[]): ProjectKnowledgeSearchChunkLike[] {
  const seen = new Set<string>()
  const result: ProjectKnowledgeSearchChunkLike[] = []
  for (const chunk of chunks) {
    if (seen.has(chunk.id))
      continue
    seen.add(chunk.id)
    result.push(chunk)
  }
  return result
}

function shouldAttachEvidenceContext(retrievalPlan: ProjectKnowledgeRetrievalPlan): boolean {
  return retrievalPlan.intent === 'evidence_trace'
    || retrievalPlan.intent === 'relation_explore'
    || retrievalPlan.intent === 'global_summary'
}

function formatEvidenceContextSummary(summaryText: string): string {
  const normalized = normalizeString(summaryText)
  if (!normalized)
    return ''
  if (normalized.includes(EVIDENCE_PATHS_SECTION_TITLE) || normalized.includes(SEMANTIC_SUMMARY_SECTION_TITLE))
    return normalized
  return `${EVIDENCE_PATHS_SECTION_TITLE}：\n${normalized}`
}

function calcChunkPriorityBoost(hit: Pick<ProjectKnowledgeChunkHit, 'chunkKind' | 'projectionType' | 'fallbackUsed'>): number {
  let boost = 0
  if (hit.chunkKind === 'document_page' || hit.projectionType === 'document_text')
    boost += 0.16
  else if (hit.chunkKind === 'markdown_section')
    boost += 0.12
  else if (hit.chunkKind === 'meeting_notes')
    boost += 0.11
  else if (hit.chunkKind === 'image_ocr')
    boost += 0.08
  else if (hit.chunkKind === 'meeting_transcript')
    boost += 0.05
  else if (hit.chunkKind === 'draw_summary')
    boost += 0.04
  else if (hit.chunkKind === 'image_summary')
    boost += 0.03

  if (hit.fallbackUsed)
    boost -= 0.07
  return boost
}

function calcIntentBoost(input: {
  hit: Pick<ProjectKnowledgeChunkHit, 'chunkKind' | 'projectionType'>
  visualIntent: boolean
  meetingIntent: boolean
}): number {
  let boost = 0
  if (input.visualIntent) {
    if (input.hit.chunkKind === 'image_summary' || input.hit.chunkKind === 'image_ocr')
      boost += 0.18
    if (input.hit.chunkKind === 'draw_summary' || input.hit.projectionType === 'draw_projection')
      boost += 0.16
  }
  if (input.meetingIntent) {
    if (input.hit.chunkKind === 'meeting_notes')
      boost += 0.2
    else if (input.hit.chunkKind === 'meeting_transcript')
      boost += 0.14
  }
  return boost
}

function buildProjectionLabel(hit: Pick<ProjectKnowledgeChunkHit, 'projectionType' | 'modality'>): string {
  if (hit.projectionType === 'image_summary')
    return '视觉投影'
  if (hit.projectionType === 'image_ocr')
    return 'OCR 投影'
  if (hit.projectionType === 'meeting_transcript')
    return '转写投影'
  if (hit.projectionType === 'meeting_notes')
    return '会议纪要'
  if (hit.modality === 'draw')
    return '画布投影'
  return ''
}

function resolveCitationSourceScope(hit: ProjectKnowledgeChunkHit): ProjectKnowledgeCitationSourceScope {
  if (
    hit.projectionType === 'meeting_notes'
    || hit.projectionType === 'meeting_transcript'
    || normalizeString(hit.metadata.meetingId)
    || hit.metadata.meetingMemory === true
    || hit.metadata.defenseSummaryNotes === true
  ) {
    return 'meeting_artifact'
  }

  if (
    hit.modality === 'draw'
    || hit.projectionType === 'draw_projection'
    || normalizeString(hit.metadata.drawMode)
  ) {
    return 'canvas_resource'
  }

  if (hit.scopeType === 'contest_resource' || normalizeString(hit.linkedContestResourceId))
    return 'contest_resource'

  if (hit.resourceSource === 'library')
    return 'platform_resource'

  return 'project_resource'
}

function buildCitationLocator(hit: ProjectKnowledgeChunkHit): ProjectKnowledgeCitationLocator | null {
  const nodeId = normalizeString(
    hit.metadata.nodeId
    || hit.metadata.primaryNodeId
    || (Array.isArray(hit.metadata.nodeIds) ? hit.metadata.nodeIds[0] : ''),
  )
  const anchorId = normalizeString(
    hit.metadata.anchorId
    || hit.metadata.anchor
    || hit.metadata.sectionAnchorId
    || hit.metadata.headingId,
  )
  const utteranceRange = normalizeString(hit.metadata.utteranceRange)
  const page = hit.pageNumber == null ? undefined : hit.pageNumber
  const section = normalizeString(hit.sectionLabel) || undefined

  if (!page && !section && !anchorId && !nodeId && !utteranceRange)
    return null

  const labelParts: string[] = []
  if (page != null)
    labelParts.push(`第 ${page} 页`)
  if (section)
    labelParts.push(section)
  if (utteranceRange)
    labelParts.push(`发言 ${utteranceRange}`)
  if (nodeId)
    labelParts.push(`节点 ${nodeId}`)
  if (anchorId)
    labelParts.push(`锚点 ${anchorId}`)

  return {
    page,
    section,
    anchorId: anchorId || undefined,
    nodeId: nodeId || undefined,
    utteranceRange: utteranceRange || undefined,
    label: labelParts.join(' · ') || undefined,
  }
}

function buildCitation(hit: ProjectKnowledgeChunkHit): ProjectKnowledgeCitation {
  const locator = buildCitationLocator(hit)
  return {
    sourceId: hit.sourceId,
    sourceResourceId: hit.sourceResourceId,
    chunkId: hit.chunkId,
    resourceTitle: hit.resourceTitle,
    label: hit.citationLabel || hit.resourceTitle,
    sourceScope: resolveCitationSourceScope(hit),
    sourceStatus: hit.sourceStatus,
    modality: hit.modality,
    projectionType: hit.projectionType,
    page: hit.pageNumber == null ? undefined : hit.pageNumber,
    section: normalizeString(hit.sectionLabel) || undefined,
    anchorId: normalizeString(locator?.anchorId) || undefined,
    nodeId: normalizeString(locator?.nodeId) || undefined,
    locator,
    quote: summarizeText(hit.content, 140) || undefined,
  }
}

function buildIncompleteWarning(input: {
  relatedResources: Resource[]
  sourceByResourceId: Map<string, ProjectKnowledgeIndexSourceStatus>
}): string {
  if (input.relatedResources.length === 0)
    return ''

  let incompleteCount = 0
  for (const resource of input.relatedResources) {
    const resourceId = normalizeString(resource.id)
    const source = resourceId ? input.sourceByResourceId.get(resourceId) : null
    const status = normalizeString(source?.status)
    if (status !== 'ready')
      incompleteCount += 1
  }

  if (incompleteCount === 0)
    return ''
  if (incompleteCount >= Math.ceil(input.relatedResources.length / 2))
    return '索引未完成，结果可能不完整。'
  return ''
}

export async function buildProjectKnowledgeLocalContext(
  db: Queryable,
  input: ProjectKnowledgeContextInput,
): Promise<ProjectKnowledgeContextResult> {
  const projectId = normalizeString(input.projectId)
  const resources = Array.isArray(input.resources) ? input.resources : []
  if (!projectId) {
    return {
      summaryText: buildProjectResourceLocalContext(resources, {
        contestName: input.contestName,
        trackName: input.trackName,
        major: input.major,
        limit: input.limit,
      }),
      citations: [],
      warning: '',
      usedFallback: true,
    }
  }

  const query = normalizeString(input.query) || [input.contestName, input.trackName, input.major].map(item => normalizeString(item)).filter(Boolean).join(' ')
  const runtime = (await readEffectiveRuntimeSettings(input.event)).runtime
  const retrievalPlan = await buildProjectKnowledgeRetrievalPlan({
    runtime,
    event: input.event,
    query,
    limit: input.limit,
  })
  const queryVariants = normalizeQueryVariants(query, retrievalPlan)
  const tokens = buildQueryTokens(queryVariants.join('\n'))
  const fallbackEmbeddingResult = {
    embedding: [],
    provider: '',
    model: '',
    fallbackUsed: true,
    attempts: 1,
    clientType: 'openai-compatible' as const,
    apiStyle: 'openai-compatible-text' as const,
    inputType: 'text' as const,
    dimensions: 0,
    fusionUsed: false,
    runtimeVersion: '',
    signature: {
      provider: '',
      model: '',
      apiStyle: 'openai-compatible-text' as const,
      dimensions: 0,
      inputType: 'text' as const,
      fusionUsed: false,
      runtimeVersion: '',
    },
    failureReason: 'EMPTY_QUERY',
  }
  const [dashboard, queryEmbeddingResultsByVariant] = await Promise.all([
    buildProjectKnowledgeIndexDashboard(db, {
      projectId,
      syncSources: false,
    }),
    Promise.all(queryVariants.map(async (variant) => {
      try {
        const result = await createKnowledgeEmbedding({
          text: variant,
          inputType: 'text',
          event: input.event,
        })
        return {
          query: variant,
          result,
        }
      }
      catch (error) {
        return {
          query: variant,
          result: {
            ...fallbackEmbeddingResult,
            failureReason: resolveKnowledgeEmbeddingFailureReason(error),
          },
        }
      }
    })),
  ])
  const queryEmbeddingResult = queryEmbeddingResultsByVariant[0]?.result || fallbackEmbeddingResult
  const queryEmbeddings = queryEmbeddingResultsByVariant
    .map(item => item.result.embedding)
    .filter(item => item.length > 0)
  const preselectedChunks = dedupeChunks((await Promise.all(
    queryEmbeddingResultsByVariant
      .filter(item => item.result.embedding.length > 0 && !item.result.fallbackUsed)
      .map(item => listProjectKnowledgeSearchChunksByVectorPreselect(db, {
        projectId,
        includeStale: true,
        embedding: item.result.embedding,
        limit: Math.max(18, Math.min(80, Number(retrievalPlan.retrievalBudget || input.limit || 6) * 6)),
      }).catch(() => [])),
  )).flat())
  const chunks = preselectedChunks.length > 0
    ? preselectedChunks
    : await listProjectKnowledgeSearchChunks(db, {
        projectId,
        includeStale: true,
      })

  const sourceByResourceId = new Map(
    dashboard.sources
      .filter(item => normalizeString(item.sourceResourceId))
      .map(item => [normalizeString(item.sourceResourceId), item]),
  )

  const relatedResources = resources
    .map((resource) => {
      return {
        resource,
        score: calcResourceRelevance(resource, query, tokens),
      }
    })
    .filter(item => item.score > 0.1)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map(item => item.resource)

  const runtimeWarnings = [
    queryEmbeddingResult.fallbackUsed
      ? `Query embedding 当前处于 degraded 状态：${normalizeString(queryEmbeddingResult.failureReason) || 'EMBEDDING_RUNTIME_NOT_CONFIGURED'}`
      : '',
    dashboard.diagnostics.degradedReason
      ? `知识索引当前状态：${dashboard.diagnostics.healthMessage}`
      : '',
  ].filter(Boolean)

  const warning = [
    buildIncompleteWarning({
      relatedResources,
      sourceByResourceId,
    }),
    ...runtimeWarnings,
  ].filter(Boolean).join('；')

  const queryIntent = detectQueryIntent(query, tokens)
  const scoredHits = chunks
    .filter(chunk => matchesRetrievalPlanFilters(chunk, retrievalPlan))
    .map((chunk) => {
      const metadataText = flattenMetadataText(chunk.metadata)
      const modality = resolveChunkModality(chunk.metadata)
      const projectionType = resolveChunkProjectionType(chunk.metadata)
      const fallbackUsed = normalizeBoolean(chunk.metadata.fallbackUsed)
      const lexicalScore = calcLexicalScore({
        query,
        tokens,
        title: chunk.title,
        body: [chunk.content, metadataText].filter(Boolean).join('\n'),
        resourceTitle: chunk.resourceTitle,
        citationLabel: chunk.citationLabel,
        sectionLabel: chunk.sectionLabel || '',
      })
      const cosine = queryEmbeddings.reduce((best, embedding) => {
        return Math.max(best, cosineSimilarity(embedding, chunk.embedding))
      }, 0)
      const vectorScore = cosine > 0 ? (cosine + 1) / 2 : 0
      const statusBonus = chunk.sourceStatus === 'ready' ? 0.12 : 0.02
      const pageBonus = chunk.pageNumber ? 0.03 : 0
      const stalePenalty = chunk.sourceStatus === 'stale' ? 0.82 : 1
      const priorityBoost = calcChunkPriorityBoost({
        chunkKind: chunk.chunkKind,
        projectionType,
        fallbackUsed,
      })
      const intentBoost = calcIntentBoost({
        hit: {
          chunkKind: chunk.chunkKind,
          projectionType,
        },
        visualIntent: queryIntent.visual,
        meetingIntent: queryIntent.meeting,
      })
      const score = ((lexicalScore * 0.6) + (vectorScore * 0.4) + statusBonus + pageBonus + priorityBoost + intentBoost) * stalePenalty
      return {
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        scopeType: chunk.scopeType,
        sourceResourceId: chunk.sourceResourceId,
        linkedContestResourceId: chunk.linkedContestResourceId,
        resourceTitle: chunk.resourceTitle,
        resourceSource: chunk.resourceSource,
        chunkKind: chunk.chunkKind,
        citationLabel: chunk.citationLabel || chunk.resourceTitle,
        pageNumber: chunk.pageNumber,
        sectionLabel: chunk.sectionLabel,
        content: chunk.content,
        sourceStatus: chunk.sourceStatus as ProjectKnowledgeSourceStatus,
        modality,
        projectionType,
        projectionSource: normalizeString(chunk.metadata.projectionSource) || undefined,
        metadata: chunk.metadata,
        fallbackUsed,
        score,
      } satisfies ProjectKnowledgeChunkHit
    })
    .filter(hit => hit.score > 0.18)
    .sort((left, right) => right.score - left.score)

  const hitLimit = Math.max(3, Math.min(8, Number(input.limit || 6)))
  const sourceUsage = new Map<string, number>()
  const selectedHits: ProjectKnowledgeChunkHit[] = []
  for (const hit of scoredHits) {
    const sourceKey = normalizeString(hit.sourceResourceId) || hit.sourceId
    const usedCount = sourceUsage.get(sourceKey) || 0
    if (usedCount >= 2)
      continue
    selectedHits.push(hit)
    sourceUsage.set(sourceKey, usedCount + 1)
    if (selectedHits.length >= hitLimit)
      break
  }

  const degradedHitUsed = selectedHits.some(hit => hit.fallbackUsed || hit.sourceStatus === 'stale')
  const degradedResultUsed = Boolean(queryEmbeddingResult.fallbackUsed || dashboard.diagnostics.degradedReason || degradedHitUsed)

  if (selectedHits.length === 0) {
    const fallback = buildProjectResourceLocalContext(resources, {
      contestName: input.contestName,
      trackName: input.trackName,
      major: input.major,
      limit: input.limit,
    })
    const lines = [
      '项目知识检索结果：暂无 ready 索引命中，已回退到项目资源摘要。',
      warning ? `提示：${warning}` : '',
      fallback,
    ].filter(Boolean)
    return {
      summaryText: lines.join('\n\n'),
      citations: [],
      warning,
      usedFallback: true,
      retrievalPlan,
      evidencePaths: [],
    }
  }

  const citations = selectedHits.map(buildCitation)
  const evidenceContext = shouldAttachEvidenceContext(retrievalPlan)
    ? await buildProjectKnowledgeEvidenceContext(db, {
        projectId,
        retrievalPlan,
        hits: selectedHits.map(hit => ({
          chunkId: hit.chunkId,
          sourceId: hit.sourceId,
          citationLabel: hit.citationLabel,
          resourceTitle: hit.resourceTitle,
        })),
        limit: 8,
      }).catch(() => ({
        summaryText: '',
        evidencePaths: [],
      }))
    : {
        summaryText: '',
        evidencePaths: [],
      }
  const lines = [
    `项目知识检索结果（命中 ${selectedHits.length} 条）：`,
    ...selectedHits.map((hit, index) => {
      const staleTag = hit.sourceStatus === 'stale' ? ' · stale 回退' : ''
      const projectionTag = buildProjectionLabel(hit)
      const excerpt = summarizeText(hit.content, 160) || '暂无摘要'
      const projectionSuffix = projectionTag ? ` · ${projectionTag}` : ''
      return `${index + 1}. [${hit.citationLabel}]${staleTag}${projectionSuffix}\n${excerpt}`
    }),
    '引用规则：回答引用以上资料时，请直接保留对应方括号标签，不要编造新的 citation。',
    '如果命中视觉投影、OCR 投影或会议转写投影，请明确说明这是投影结果，不要表述为原始正文摘录。',
    formatEvidenceContextSummary(evidenceContext.summaryText),
    warning ? `提示：${warning}` : '',
  ].filter(Boolean)

  return {
    summaryText: lines.join('\n\n'),
    citations,
    warning,
    usedFallback: degradedResultUsed,
    retrievalPlan,
    evidencePaths: evidenceContext.evidencePaths,
  }
}
