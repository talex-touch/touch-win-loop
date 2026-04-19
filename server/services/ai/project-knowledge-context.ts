import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectKnowledgeCitation,
  ProjectKnowledgeIndexSourceStatus,
  ProjectKnowledgeSourceStatus,
  ProjectKnowledgeModality,
  ProjectKnowledgeProjectionType,
  Resource,
} from '~~/shared/types/domain'
import type { ProjectKnowledgeMessagePayload } from '~~/shared/types/domain-legacy'
import { buildProjectResourceLocalContext } from '~~/server/services/ai/project-resource-context'
import {
  createKnowledgeEmbedding,
  extractKnowledgeKeywords,
  toKnowledgeText,
} from '~~/server/services/knowledge-ai'
import {
  buildProjectKnowledgeIndexDashboard,
  listProjectKnowledgeSearchChunks,
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
  sourceResourceId?: string | null
  resourceTitle: string
  chunkKind: string
  citationLabel: string
  pageNumber?: number | null
  sectionLabel?: string
  content: string
  sourceStatus: ProjectKnowledgeSourceStatus
  modality?: ProjectKnowledgeModality
  projectionType?: ProjectKnowledgeProjectionType
  projectionSource?: string
  fallbackUsed: boolean
  score: number
}

const VISUAL_QUERY_HINTS = ['截图', '界面', '海报', '页面', '版式', '图里', '这张图', '图片', '视觉', '布局', '封面', '图表']
const MEETING_QUERY_HINTS = ['会议', '讨论', '老师说', '刚才提到', '刚刚提到', '会上', '纪要', '转写', '录音', '录屏']

export interface ProjectKnowledgeContextResult extends ProjectKnowledgeMessagePayload {
  summaryText: string
}

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
    || normalized === 'document_visual_fallback'
    || normalized === 'meeting_notes'
    || normalized === 'meeting_transcript'
  ) {
    return normalized
  }
  return undefined
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
  if (hit.projectionType === 'image_summary' || hit.projectionType === 'document_visual_fallback')
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

function buildCitation(hit: ProjectKnowledgeChunkHit): ProjectKnowledgeCitation {
  return {
    sourceId: hit.sourceId,
    sourceResourceId: hit.sourceResourceId,
    chunkId: hit.chunkId,
    resourceTitle: hit.resourceTitle,
    label: hit.citationLabel || hit.resourceTitle,
    sourceStatus: hit.sourceStatus,
    modality: hit.modality,
    projectionType: hit.projectionType,
    page: hit.pageNumber == null ? undefined : hit.pageNumber,
    section: normalizeString(hit.sectionLabel) || undefined,
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
  const tokens = buildQueryTokens(query)
  const [dashboard, chunks, queryEmbeddingResult] = await Promise.all([
    buildProjectKnowledgeIndexDashboard(db, {
      projectId,
      syncSources: false,
    }),
    listProjectKnowledgeSearchChunks(db, {
      projectId,
      includeStale: true,
    }),
    query
      ? createKnowledgeEmbedding({
          text: query,
          inputType: 'text',
          event: input.event,
        })
      : Promise.resolve({
          embedding: [],
          provider: '',
          model: '',
          fallbackUsed: true,
          attempts: 1,
        }),
  ])

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

  const warning = buildIncompleteWarning({
    relatedResources,
    sourceByResourceId,
  })

  const queryEmbedding = queryEmbeddingResult.embedding
  const queryIntent = detectQueryIntent(query, tokens)
  const scoredHits = chunks
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
      const cosine = cosineSimilarity(queryEmbedding, chunk.embedding)
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
        sourceResourceId: chunk.sourceResourceId,
        resourceTitle: chunk.resourceTitle,
        chunkKind: chunk.chunkKind,
        citationLabel: chunk.citationLabel || chunk.resourceTitle,
        pageNumber: chunk.pageNumber,
        sectionLabel: chunk.sectionLabel,
        content: chunk.content,
        sourceStatus: chunk.sourceStatus as ProjectKnowledgeSourceStatus,
        modality,
        projectionType,
        projectionSource: normalizeString(chunk.metadata.projectionSource) || undefined,
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
    }
  }

  const citations = selectedHits.map(buildCitation)
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
    warning ? `提示：${warning}` : '',
  ].filter(Boolean)

  return {
    summaryText: lines.join('\n\n'),
    citations,
    warning,
    usedFallback: false,
  }
}
