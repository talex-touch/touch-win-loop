import type { Buffer } from 'node:buffer'
import type { KnowledgeEmbeddingContentItem } from '~~/server/services/knowledge-ai'
import type { RuntimeSettings } from '~~/server/utils/env'
import type { ProjectKnowledgeTaskContext } from '~~/server/utils/project-knowledge-store'
import type {
  DocumentAnalysis,
  ProjectKnowledgeChunkKind,
  ProjectKnowledgeChunkMetadata,
  ProjectKnowledgeEmbeddingApiStyle,
  ProjectKnowledgeEmbeddingInputType,
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeModality,
  ProjectKnowledgeProvenanceSourceType,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { analyzePdfBufferWithDocAi } from '~~/server/services/document/analysis'
import { createKnowledgeEmbedding } from '~~/server/services/knowledge-ai'
import { analyzeKnowledgeVisualProjection } from '~~/server/services/knowledge-vision'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { withClient, withTransaction } from '~~/server/utils/db'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { scheduleProjectKnowledgeAnalyticsRefresh } from '~~/server/utils/project-knowledge-analytics-store'
import {
  claimNextQueuedProjectKnowledgeIndexTask,
  completeProjectKnowledgeTaskFailure,
  completeProjectKnowledgeTaskSuccess,
  getProjectKnowledgeTaskContext,
  replaceProjectKnowledgeChunks,
  resetStaleProjectKnowledgeTasks,
  updateProjectKnowledgeTaskProgress,
} from '~~/server/utils/project-knowledge-store'
import {
  getProjectKnowledgeWorkerState,
  pushProjectKnowledgeWorkerRunRecord,
} from '~~/server/utils/project-knowledge-worker-state'
import { listProjectMeetingUtterances } from '~~/server/utils/project-meeting-store'
import { buildProjectResourceSignedUrls } from '~~/server/utils/project-resource-access-url'
import {
  getProjectResourcePreviewFileRef,
  getProjectResourceSourceFileRef,
} from '~~/server/utils/project-resource-document-store'
import { captureServerException } from '~~/server/utils/sentry'

const PROJECT_KNOWLEDGE_WORKER_TIMER_KEY = Symbol.for('winloop.project-knowledge-worker.timer.v1')
const PROJECT_KNOWLEDGE_WORKER_INTERVAL_MS = 2500
const PROJECT_KNOWLEDGE_WORKER_BATCH_SIZE = 2

interface WorkerTimerState {
  timer: NodeJS.Timeout | null
}

interface WorkerChunk {
  chunkIndex: number
  chunkKind: ProjectKnowledgeChunkKind
  title?: string
  content: string
  citationLabel?: string
  pageNumber?: number | null
  sectionLabel?: string
  metadata?: Record<string, unknown>
  embeddingInput?: {
    contents?: KnowledgeEmbeddingContentItem[]
    inputType?: ProjectKnowledgeEmbeddingInputType
    enableFusion?: boolean
  }
}

function getWorkerTimerState(): WorkerTimerState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[PROJECT_KNOWLEDGE_WORKER_TIMER_KEY] as WorkerTimerState | undefined
  if (existing)
    return existing

  const created: WorkerTimerState = {
    timer: null,
  }
  globalRef[PROJECT_KNOWLEDGE_WORKER_TIMER_KEY] = created
  return created
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return error.message || 'unknown error'
  return String(error)
}

function compactText(value: string): string {
  return normalizeString(value).replace(/\s+/g, ' ').trim()
}

function normalizeConfidence(value: unknown, fallback = 0.7): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return fallback
  return Math.max(0, Math.min(1, normalized))
}

function isImageMimeType(value: string): boolean {
  return normalizeString(value).toLowerCase().startsWith('image/')
}

function isPdfMimeType(value: string): boolean {
  return normalizeString(value).toLowerCase().includes('pdf')
}

function isAudioMimeType(value: string): boolean {
  return normalizeString(value).toLowerCase().startsWith('audio/')
}

function isVideoMimeType(value: string): boolean {
  return normalizeString(value).toLowerCase().startsWith('video/')
}

function isBailianMultimodalEmbeddingEnabled(runtime: RuntimeSettings): boolean {
  const resolved = resolveAiRuntimeForChannel(runtime, 'knowledge_visual_embedding')
  return normalizeString(resolved.candidates[0]?.modelConfig?.embeddingApiStyle) === 'bailian-multimodal'
}

function toImageDataUrl(buffer: Buffer, mimeType: string): string {
  const safeMimeType = normalizeString(mimeType) || 'image/png'
  return `data:${safeMimeType};base64,${buffer.toString('base64')}`
}

function isExternallyReachableMediaUrl(value: string): boolean {
  const normalized = normalizeString(value)
  if (!/^https?:\/\//i.test(normalized))
    return false

  try {
    const url = new URL(normalized)
    const host = String(url.hostname || '').trim().toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.local'))
      return false
    if (host === '127.0.0.1' || host === '::1')
      return false
    if (/^10\./.test(host) || /^192\.168\./.test(host))
      return false
    if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(host))
      return false
    return true
  }
  catch {
    return false
  }
}

function isDocumentVisualFallbackCandidate(value: string): boolean {
  const normalized = normalizeString(value).toLowerCase()
  if (isPdfMimeType(normalized))
    return true
  return [
    'msword',
    'wordprocessingml',
    'presentation',
    'powerpoint',
    'spreadsheet',
    'excel',
    'officedocument',
  ].some(token => normalized.includes(token))
}

function hasDocumentAnalysisText(analysis: DocumentAnalysis | null | undefined): boolean {
  const pages = Array.isArray(analysis?.pages) ? analysis?.pages : []
  return pages.some(page => (page.blocks || []).some(block => compactText(normalizeString(block.text)).length > 0))
}

function buildChunkMetadata(input: ProjectKnowledgeChunkMetadata & Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => {
        if (value == null)
          return false
        if (typeof value === 'string')
          return normalizeString(value).length > 0
        if (Array.isArray(value))
          return value.length > 0
        return true
      })
      .map(([key, value]) => {
        if (typeof value === 'string')
          return [key, normalizeString(value)]
        return [key, value]
      }),
  )
}

function resolveProvenanceSourceType(input: {
  metadata: Record<string, unknown>
  embeddingFallbackUsed: boolean
}): ProjectKnowledgeProvenanceSourceType {
  if (input.embeddingFallbackUsed || input.metadata.fallbackUsed === true)
    return 'fallback_template'
  const projectionType = normalizeString(input.metadata.projectionType)
  const projectionSource = normalizeString(input.metadata.projectionSource)
  if (projectionType === 'image_ocr')
    return 'ocr'
  if (projectionType === 'meeting_transcript')
    return 'asr'
  if (projectionType === 'image_summary' || projectionSource === 'vision_model')
    return 'vision_summary'
  return 'native'
}

function resolveEmbeddingStatus(input: {
  provenanceSourceType: ProjectKnowledgeProvenanceSourceType
  embeddingFallbackUsed: boolean
}): ProjectKnowledgeEmbeddingStatus {
  if (input.embeddingFallbackUsed)
    return 'fallback'
  if (input.provenanceSourceType === 'ocr' || input.provenanceSourceType === 'asr' || input.provenanceSourceType === 'vision_summary')
    return 'derived'
  return 'native'
}

function resolveSourceConfidence(metadata: Record<string, unknown>): number {
  return normalizeConfidence(metadata.sourceConfidence ?? metadata.confidence, 0.72)
}

function resolveModalitySupportWeight(input: {
  metadata: Record<string, unknown>
  embeddingApiStyle: ProjectKnowledgeEmbeddingApiStyle
}): number {
  const modality = normalizeString(input.metadata.modality) as ProjectKnowledgeModality | ''
  if (input.embeddingApiStyle === 'bailian-multimodal') {
    if (modality === 'image' || modality === 'video')
      return 1
    if (modality === 'audio')
      return 0.82
    if (modality === 'draw')
      return 0.78
    return 0.96
  }
  if (modality === 'image' || modality === 'video')
    return 0.52
  if (modality === 'audio')
    return 0.46
  if (modality === 'draw')
    return 0.68
  return 1
}

function reindexChunks(chunks: WorkerChunk[]): WorkerChunk[] {
  return chunks.map((chunk, index) => ({
    ...chunk,
    chunkIndex: index,
  }))
}

function chunkLongText(text: string, size = 1200): string[] {
  const normalized = compactText(text)
  if (!normalized)
    return []
  if (normalized.length <= size)
    return [normalized]

  const chunks: string[] = []
  let cursor = 0
  while (cursor < normalized.length) {
    const slice = normalized.slice(cursor, cursor + size)
    chunks.push(slice)
    cursor += size
  }
  return chunks
}

function buildFallbackSummaryChunks(input: {
  title: string
  summary: string
  content: string
  sourceLink: string
  metadata: Record<string, unknown>
  chunkKind?: ProjectKnowledgeChunkKind
  modality?: ProjectKnowledgeModality
  projectionType?: ProjectKnowledgeChunkMetadata['projectionType']
  projectionSource?: string
  confidence?: number
  fallbackUsed?: boolean
  sectionLabel?: string
}): WorkerChunk[] {
  const header = [
    normalizeString(input.title),
    normalizeString(input.summary),
  ].filter(Boolean).join('\n')
  const bodyChunks = chunkLongText(input.content || header || '')
  const chunks = bodyChunks.length > 0 ? bodyChunks : [header || normalizeString(input.sourceLink)]
  return chunks
    .map((content, index) => ({
      chunkIndex: index,
      chunkKind: input.chunkKind || 'resource_summary',
      title: normalizeString(input.title),
      content: compactText(content),
      citationLabel: `${normalizeString(input.title) || '资源'}${chunks.length > 1 ? `/片段${index + 1}` : ''}`,
      sectionLabel: normalizeString(input.sectionLabel) || undefined,
      metadata: {
        ...normalizeRecord(input.metadata),
        ...buildChunkMetadata({
          modality: input.modality || 'text',
          projectionType: input.projectionType || 'resource_summary',
          projectionSource: input.projectionSource || 'fallback_summary',
          confidence: normalizeConfidence(input.confidence, 0.42),
          sectionLabel: input.sectionLabel,
          fallbackUsed: input.fallbackUsed !== false,
          sourceLink: normalizeString(input.sourceLink),
        }),
      },
    }))
    .filter(item => normalizeString(item.content))
}

function buildDocumentChunks(input: {
  title: string
  analysis: { pages?: Array<{ page: number, blocks?: Array<{ text?: string }> }> }
  metadata?: Record<string, unknown>
}): WorkerChunk[] {
  const pages = Array.isArray(input.analysis.pages) ? input.analysis.pages : []
  const chunks: WorkerChunk[] = []
  for (const page of pages) {
    const pageNumber = Math.max(1, Number(page.page || 1))
    const text = compactText(
      (Array.isArray(page.blocks) ? page.blocks : [])
        .map(block => normalizeString(block?.text))
        .filter(Boolean)
        .join('\n'),
    )
    if (!text)
      continue
    chunks.push({
      chunkIndex: chunks.length,
      chunkKind: 'document_page',
      title: normalizeString(input.title),
      content: text,
      citationLabel: `${normalizeString(input.title) || '资源'}/p.${pageNumber}`,
      pageNumber,
      metadata: {
        ...normalizeRecord(input.metadata),
        ...buildChunkMetadata({
          modality: 'text',
          projectionType: 'document_text',
          projectionSource: 'document_analysis',
          confidence: 0.92,
          pageNumber,
          fallbackUsed: false,
        }),
      },
    })
  }
  return chunks
}

function buildMarkdownChunks(input: {
  title: string
  markdown: string
  chunkKind?: ProjectKnowledgeChunkKind
  metadata?: Record<string, unknown>
  modality?: ProjectKnowledgeModality
  projectionType?: ProjectKnowledgeChunkMetadata['projectionType']
  projectionSource?: string
}): WorkerChunk[] {
  const normalized = normalizeString(input.markdown)
  if (!normalized)
    return []

  const lines = normalized.split(/\r?\n/)
  const sections: Array<{ title: string, lines: string[] }> = []
  let current = {
    title: normalizeString(input.title) || '正文',
    lines: [] as string[],
  }

  for (const line of lines) {
    const headingPrefix = line.match(/^(#{1,6})[^\S\r\n]+/)
    if (headingPrefix) {
      if (current.lines.length > 0)
        sections.push(current)
      current = {
        title: compactText(line.slice(headingPrefix[0].length)) || '正文',
        lines: [],
      }
      continue
    }
    current.lines.push(line)
  }
  if (current.lines.length > 0)
    sections.push(current)

  const chunks: WorkerChunk[] = []
  for (const section of sections) {
    const paragraphs = chunkLongText(section.lines.join('\n'))
    for (const paragraph of paragraphs) {
      chunks.push({
        chunkIndex: chunks.length,
        chunkKind: input.chunkKind || 'markdown_section',
        title: normalizeString(input.title),
        content: paragraph,
        citationLabel: `${normalizeString(input.title) || '文档'}/section:${section.title}`,
        sectionLabel: section.title,
        metadata: {
          ...normalizeRecord(input.metadata),
          ...buildChunkMetadata({
            modality: input.modality || 'text',
            projectionType: input.projectionType || 'markdown_text',
            projectionSource: input.projectionSource || 'markdown_content',
            confidence: 0.9,
            sectionLabel: section.title,
            fallbackUsed: false,
            sectionTitle: section.title,
          }),
        },
      })
    }
  }

  return chunks
}

function extractMetadataText(metadata: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null)
      continue
    if (typeof value === 'string') {
      const text = compactText(value)
      if (text)
        parts.push(`${key}: ${text}`)
      continue
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}: ${String(value)}`)
    }
  }
  return parts.join('\n')
}

function buildDrawChunks(input: {
  title: string
  summary: string
  content: string
  metadata: Record<string, unknown>
}): WorkerChunk[] {
  const text = [
    normalizeString(input.title),
    normalizeString(input.summary),
    normalizeString(input.content),
    extractMetadataText(input.metadata),
  ].filter(Boolean).join('\n')

  return buildFallbackSummaryChunks({
    title: input.title,
    summary: input.summary,
    content: text,
    sourceLink: '',
    metadata: input.metadata,
    chunkKind: 'draw_summary',
    modality: 'draw',
    projectionType: 'draw_projection',
    projectionSource: 'draw_structure',
    confidence: 0.74,
    fallbackUsed: false,
  }).map((item, index) => ({
    ...item,
    chunkIndex: index,
    chunkKind: 'draw_summary' as const,
    citationLabel: `${normalizeString(input.title) || '画布'}/draw`,
  }))
}

function buildVisualFallbackText(input: {
  title: string
  summary: string
  content: string
  metadata: Record<string, unknown>
  sourceLink?: string
}): string {
  return [
    normalizeString(input.title),
    normalizeString(input.summary),
    normalizeString(input.content),
    extractMetadataText(input.metadata),
    normalizeString(input.sourceLink),
  ].filter(Boolean).join('\n')
}

function buildImageProjectionChunks(input: {
  title: string
  metadata: Record<string, unknown>
  visual: {
    summary: string
    tags: string[]
    ocrText: string
    layout: string
    confidence: number
    fallbackUsed: boolean
  }
  modality?: ProjectKnowledgeModality
  projectionSource: string
}): WorkerChunk[] {
  const modality = input.modality || 'image'
  const chunks: WorkerChunk[] = []
  const summaryText = [
    normalizeString(input.visual.summary),
    input.visual.tags.length > 0 ? `标签: ${input.visual.tags.join(' / ')}` : '',
    normalizeString(input.visual.layout) ? `版面: ${normalizeString(input.visual.layout)}` : '',
  ].filter(Boolean).join('\n')

  if (summaryText) {
    chunks.push({
      chunkIndex: chunks.length,
      chunkKind: 'image_summary',
      title: normalizeString(input.title),
      content: summaryText,
      citationLabel: `${normalizeString(input.title) || '图片'}/image`,
      metadata: {
        ...normalizeRecord(input.metadata),
        ...buildChunkMetadata({
          modality,
          projectionType: 'image_summary',
          projectionSource: input.projectionSource,
          confidence: normalizeConfidence(input.visual.confidence, 0.45),
          fallbackUsed: input.visual.fallbackUsed,
          tags: input.visual.tags,
          layout: normalizeString(input.visual.layout),
        }),
      },
    })
  }

  const ocrText = compactText(input.visual.ocrText)
  if (ocrText) {
    chunks.push({
      chunkIndex: chunks.length,
      chunkKind: 'image_ocr',
      title: normalizeString(input.title),
      content: ocrText,
      citationLabel: `${normalizeString(input.title) || '图片'}/ocr`,
      metadata: {
        ...normalizeRecord(input.metadata),
        ...buildChunkMetadata({
          modality,
          projectionType: 'image_ocr',
          projectionSource: input.projectionSource,
          confidence: normalizeConfidence(input.visual.confidence, 0.45),
          fallbackUsed: input.visual.fallbackUsed,
        }),
      },
    })
  }

  return chunks
}

function resolveMeetingModality(mimeType: string): ProjectKnowledgeModality {
  return normalizeString(mimeType).toLowerCase().includes('video') ? 'video' : 'audio'
}

async function resolveProjectResourceFileRefs(context: ProjectKnowledgeTaskContext): Promise<{
  sourceRef: Awaited<ReturnType<typeof getProjectResourceSourceFileRef>>
  previewRef: Awaited<ReturnType<typeof getProjectResourcePreviewFileRef>>
}> {
  const resourceId = normalizeString(context.resource.id)
  if (!resourceId) {
    return {
      sourceRef: null,
      previewRef: null,
    }
  }

  return withClient(undefined, async (db) => {
    const [sourceRef, previewRef] = await Promise.all([
      getProjectResourceSourceFileRef(db, {
        projectId: context.resource.projectId,
        resourceId,
      }),
      getProjectResourcePreviewFileRef(db, {
        projectId: context.resource.projectId,
        resourceId,
      }),
    ])
    return { sourceRef, previewRef }
  })
}

async function resolveProjectResourceBuffer(objectKey: string): Promise<Buffer | null> {
  const safeObjectKey = normalizeString(objectKey)
  if (!safeObjectKey)
    return null
  try {
    return await getDocumentStorage().getObjectBuffer(safeObjectKey)
  }
  catch {
    return null
  }
}

async function resolveProjectedDocumentAnalysis(context: ProjectKnowledgeTaskContext): Promise<DocumentAnalysis | null> {
  if (hasDocumentAnalysisText(context.documentAnalysis))
    return context.documentAnalysis

  const { sourceRef, previewRef } = await resolveProjectResourceFileRefs(context)
  const { runtime } = await readEffectiveRuntimeSettings()
  const candidates = [
    sourceRef && isPdfMimeType(sourceRef.mimeType) ? sourceRef : null,
    previewRef && isPdfMimeType(previewRef.mimeType) ? previewRef : null,
  ].filter((candidate): candidate is NonNullable<typeof sourceRef> => Boolean(candidate))

  for (const candidate of candidates) {
    const buffer = await resolveProjectResourceBuffer(candidate.objectKey)
    if (!buffer)
      continue
    try {
      const parsed = await analyzePdfBufferWithDocAi(buffer, {
        fileName: candidate.fileName,
        runtime,
      })
      if (hasDocumentAnalysisText(parsed.analysis))
        return parsed.analysis
    }
    catch {
      continue
    }
  }

  return context.documentAnalysis
}

function buildImageFusionText(input: {
  summary: string
  tags: string[]
  layout: string
  ocrText: string
}): string {
  return [
    normalizeString(input.summary),
    input.tags.length > 0 ? `标签: ${input.tags.join(' / ')}` : '',
    normalizeString(input.layout) ? `版面: ${normalizeString(input.layout)}` : '',
    normalizeString(input.ocrText) ? `OCR: ${normalizeString(input.ocrText)}` : '',
  ].filter(Boolean).join('\n')
}

async function resolveImageProjectionChunks(context: ProjectKnowledgeTaskContext, runtime: RuntimeSettings): Promise<WorkerChunk[]> {
  const { sourceRef, previewRef } = await resolveProjectResourceFileRefs(context)
  const strictMultimodal = isBailianMultimodalEmbeddingEnabled(runtime)
  const imageRef = sourceRef && isImageMimeType(sourceRef.mimeType)
    ? sourceRef
    : previewRef && isImageMimeType(previewRef.mimeType)
      ? previewRef
      : null

  const fallbackText = buildVisualFallbackText({
    title: context.resource.title,
    summary: context.resource.summary,
    content: context.resource.content,
    metadata: context.resource.metadata,
    sourceLink: context.resource.sourceLink,
  })

  if (!imageRef) {
    if (strictMultimodal)
      throw new Error('BAILIAN_MULTIMODAL_IMAGE_SOURCE_MISSING')
    return buildFallbackSummaryChunks({
      title: context.resource.title,
      summary: context.resource.summary,
      content: fallbackText,
      sourceLink: context.resource.sourceLink,
      metadata: context.resource.metadata,
      chunkKind: 'image_summary',
      modality: 'image',
      projectionType: 'image_summary',
      projectionSource: 'fallback_metadata',
      confidence: 0.32,
      fallbackUsed: true,
    })
  }

  const imageBuffer = await resolveProjectResourceBuffer(imageRef.objectKey)
  if (!imageBuffer) {
    if (strictMultimodal)
      throw new Error('BAILIAN_MULTIMODAL_IMAGE_BUFFER_MISSING')
    return buildFallbackSummaryChunks({
      title: context.resource.title,
      summary: context.resource.summary,
      content: fallbackText,
      sourceLink: context.resource.sourceLink,
      metadata: context.resource.metadata,
      chunkKind: 'image_summary',
      modality: 'image',
      projectionType: 'image_summary',
      projectionSource: 'fallback_metadata',
      confidence: 0.32,
      fallbackUsed: true,
    })
  }

  if (strictMultimodal && imageBuffer.length > 5 * 1024 * 1024)
    throw new Error('BAILIAN_MULTIMODAL_IMAGE_TOO_LARGE')

  const visual = await analyzeKnowledgeVisualProjection({
    imageBuffer,
    mimeType: imageRef.mimeType,
    textFallback: fallbackText,
  })
  return buildImageProjectionChunks({
    title: context.resource.title,
    metadata: context.resource.metadata,
    visual,
    modality: 'image',
    projectionSource: visual.fallbackUsed ? 'fallback_metadata' : 'vision_model',
  }).map((chunk) => {
    if (chunk.chunkKind !== 'image_summary')
      return chunk
    return {
      ...chunk,
      embeddingInput: {
        contents: [
          { image: toImageDataUrl(imageBuffer, imageRef.mimeType) },
          { text: buildImageFusionText(visual) || chunk.content },
        ],
        inputType: 'fused',
        enableFusion: true,
      },
    }
  })
}

async function resolveVideoProjectionChunks(context: ProjectKnowledgeTaskContext, runtime: RuntimeSettings): Promise<WorkerChunk[]> {
  const strictMultimodal = isBailianMultimodalEmbeddingEnabled(runtime)
  const signedUrls = buildProjectResourceSignedUrls({
    projectId: context.resource.projectId,
    resourceId: context.resource.id,
  })
  const videoUrl = normalizeString(signedUrls.sourceDownloadUrl || signedUrls.previewUrl)
  if (!videoUrl) {
    if (strictMultimodal)
      throw new Error('BAILIAN_MULTIMODAL_VIDEO_URL_MISSING')
    return []
  }
  if (!isExternallyReachableMediaUrl(videoUrl)) {
    if (strictMultimodal)
      throw new Error('BAILIAN_MULTIMODAL_VIDEO_URL_UNREACHABLE')
    return []
  }

  const content = compactText([
    normalizeString(context.resource.title),
    normalizeString(context.resource.summary),
    normalizeString(context.resource.content),
    extractMetadataText(normalizeRecord(context.resource.metadata)),
  ].filter(Boolean).join('\n')) || normalizeString(context.resource.title) || '视频资源'

  return [{
    chunkIndex: 0,
    chunkKind: 'resource_summary',
    title: normalizeString(context.resource.title),
    content,
    citationLabel: `${normalizeString(context.resource.title) || '视频资源'}/video`,
    metadata: {
      ...normalizeRecord(context.resource.metadata),
      ...buildChunkMetadata({
        modality: 'video',
        projectionType: 'resource_summary',
        projectionSource: 'video_resource',
        confidence: 0.72,
        fallbackUsed: false,
        signedSourceUrl: videoUrl,
      }),
    },
    embeddingInput: {
      contents: [{ video: videoUrl }],
      inputType: 'video',
      enableFusion: false,
    },
  }]
}

function buildMeetingTranscriptChunks(input: {
  title: string
  metadata: Record<string, unknown>
  modality: ProjectKnowledgeModality
  utterances: Array<{
    sequenceNo: number
    speakerLabel: string
    text: string
    confidence?: number
  }>
}): WorkerChunk[] {
  const chunks: WorkerChunk[] = []
  let currentLines: string[] = []
  let currentStart = 0
  let currentEnd = 0
  let confidenceSum = 0
  let confidenceCount = 0

  const flush = () => {
    if (currentLines.length === 0)
      return
    const utteranceRange = `${currentStart}-${currentEnd}`
    const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0.78
    chunks.push({
      chunkIndex: chunks.length,
      chunkKind: 'meeting_transcript',
      title: normalizeString(input.title),
      content: currentLines.join('\n'),
      citationLabel: `${normalizeString(input.title) || '会议'}/transcript:${utteranceRange}`,
      sectionLabel: `utterance:${utteranceRange}`,
      metadata: {
        ...normalizeRecord(input.metadata),
        ...buildChunkMetadata({
          modality: input.modality,
          projectionType: 'meeting_transcript',
          projectionSource: 'meeting_utterances',
          confidence: normalizeConfidence(avgConfidence, 0.78),
          fallbackUsed: false,
          utteranceRange,
        }),
      },
    })
    currentLines = []
    currentStart = 0
    currentEnd = 0
    confidenceSum = 0
    confidenceCount = 0
  }

  for (const utterance of input.utterances) {
    const text = compactText(`${normalizeString(utterance.speakerLabel) || '发言'}: ${normalizeString(utterance.text)}`)
    if (!text)
      continue
    const projectedLength = currentLines.join('\n').length + text.length + 1
    if (projectedLength > 1200 || currentLines.length >= 6)
      flush()
    if (currentLines.length === 0)
      currentStart = Math.max(1, Math.trunc(Number(utterance.sequenceNo || 1)))
    currentEnd = Math.max(currentStart, Math.trunc(Number(utterance.sequenceNo || currentStart)))
    currentLines.push(text)
    confidenceSum += normalizeConfidence(utterance.confidence, 0.78)
    confidenceCount += 1
  }

  flush()
  return chunks
}

async function buildResourceChunks(context: ProjectKnowledgeTaskContext, runtime: RuntimeSettings): Promise<WorkerChunk[]> {
  const metadata = normalizeRecord(context.resource.metadata)
  const artifactKind = normalizeString(metadata.artifactKind)
  const mimeType = normalizeString(context.resource.mimeType)
  if (context.resource.resourceKind === 'markdown') {
    const markdownChunkKind = artifactKind === 'meeting_notes' ? 'meeting_notes' : 'markdown_section'
    const markdownProjectionType = artifactKind === 'meeting_notes' ? 'meeting_notes' : 'markdown_text'
    const markdownChunks = buildMarkdownChunks({
      title: context.resource.title,
      markdown: context.resource.content,
      chunkKind: markdownChunkKind,
      metadata,
      modality: artifactKind === 'meeting_notes' ? 'audio' : 'text',
      projectionType: markdownProjectionType,
      projectionSource: artifactKind === 'meeting_notes' ? 'meeting_notes_resource' : 'markdown_content',
    })
    if (markdownChunks.length > 0)
      return markdownChunks
    return buildFallbackSummaryChunks({
      title: context.resource.title,
      summary: context.resource.summary,
      content: context.resource.content,
      sourceLink: context.resource.sourceLink,
      metadata,
      chunkKind: artifactKind === 'meeting_notes' ? 'meeting_notes' : 'resource_summary',
      modality: artifactKind === 'meeting_notes' ? 'audio' : 'text',
      projectionType: artifactKind === 'meeting_notes' ? 'meeting_notes' : 'resource_summary',
      projectionSource: artifactKind === 'meeting_notes' ? 'meeting_notes_resource' : 'fallback_summary',
      confidence: artifactKind === 'meeting_notes' ? 0.84 : 0.42,
      fallbackUsed: artifactKind !== 'meeting_notes',
    })
  }

  if (context.resource.resourceKind === 'draw') {
    return buildDrawChunks({
      title: context.resource.title,
      summary: context.resource.summary,
      content: context.resource.content,
      metadata,
    })
  }

  const chunks: WorkerChunk[] = []
  const documentAnalysis = await resolveProjectedDocumentAnalysis(context)
  if (documentAnalysis) {
    chunks.push(...buildDocumentChunks({
      title: context.resource.title,
      analysis: documentAnalysis,
      metadata,
    }))
  }

  if (isImageMimeType(mimeType)) {
    chunks.push(...await resolveImageProjectionChunks(context, runtime))
  }
  else if (isVideoMimeType(mimeType)) {
    chunks.push(...await resolveVideoProjectionChunks(context, runtime))
  }
  else if (chunks.length === 0 && isDocumentVisualFallbackCandidate(mimeType)) {
    chunks.push(...buildFallbackSummaryChunks({
      title: context.resource.title,
      summary: context.resource.summary,
      content: buildVisualFallbackText({
        title: context.resource.title,
        summary: context.resource.summary,
        content: context.resource.content,
        metadata,
        sourceLink: context.resource.sourceLink,
      }),
      sourceLink: context.resource.sourceLink,
      metadata,
      chunkKind: 'image_summary',
      modality: 'image',
      projectionType: 'document_visual_fallback',
      projectionSource: 'fallback_metadata',
      confidence: 0.3,
      fallbackUsed: true,
    }))
  }

  if (artifactKind === 'meeting_recording' && normalizeString(metadata.meetingId)) {
    const utterances = await withClient(undefined, async db => listProjectMeetingUtterances(db, {
      meetingId: normalizeString(metadata.meetingId),
      finalsOnly: true,
    }))
    if (utterances.length > 0) {
      chunks.push(...buildMeetingTranscriptChunks({
        title: context.resource.title,
        metadata,
        modality: resolveMeetingModality(mimeType),
        utterances: utterances.map(item => ({
          sequenceNo: item.sequenceNo,
          speakerLabel: item.speakerLabel,
          text: item.text,
          confidence: item.confidence,
        })),
      }))
    }
  }

  if (chunks.length === 0) {
    chunks.push(...buildFallbackSummaryChunks({
      title: context.resource.title,
      summary: context.resource.summary,
      content: context.resource.content,
      sourceLink: context.resource.sourceLink,
      metadata,
      modality: isAudioMimeType(mimeType)
        ? 'audio'
        : isVideoMimeType(mimeType)
          ? 'video'
          : 'text',
      projectionType: 'resource_summary',
      projectionSource: artifactKind === 'meeting_recording' ? 'meeting_recording_metadata' : 'fallback_summary',
      fallbackUsed: true,
    }))
  }

  return reindexChunks(chunks)
}

function estimateEmbeddingEtaSeconds(total: number, indexed: number): number {
  const remaining = Math.max(0, total - indexed)
  return Math.max(0, remaining * 4)
}

async function processSingleTask(): Promise<'idle' | 'succeeded' | 'failed'> {
  const task = await withTransaction(undefined, async db => claimNextQueuedProjectKnowledgeIndexTask(db))
  if (!task)
    return 'idle'

  const context = await withClient(undefined, async db => getProjectKnowledgeTaskContext(db, {
    taskId: task.id,
  }))

  if (!context) {
    await withTransaction(undefined, async (db) => {
      await completeProjectKnowledgeTaskFailure(db, {
        taskId: task.id,
        errorMessage: 'PROJECT_KNOWLEDGE_CONTEXT_NOT_FOUND',
      })
    })
    return 'failed'
  }

  try {
    await withTransaction(undefined, async (db) => {
      await updateProjectKnowledgeTaskProgress(db, {
        taskId: task.id,
        status: 'extracting',
        stage: 'extracting',
        progressPercent: 20,
        etaSeconds: 120,
      })
    })

    const { runtime } = await readEffectiveRuntimeSettings()
    const chunks = await buildResourceChunks(context, runtime)
    const chunkKinds = chunks.reduce<Record<string, number>>((accumulator, chunk) => {
      const key = normalizeString(chunk.chunkKind) || 'unknown'
      accumulator[key] = (accumulator[key] || 0) + 1
      return accumulator
    }, {})

    await withTransaction(undefined, async (db) => {
      await updateProjectKnowledgeTaskProgress(db, {
        taskId: task.id,
        status: 'chunking',
        stage: 'chunking',
        progressPercent: 45,
        etaSeconds: Math.max(10, chunks.length * 4),
        chunkTotal: chunks.length,
        chunkIndexed: 0,
      })
    })

    const embeddedChunks: Array<WorkerChunk & {
      embedding: number[]
      embeddingProvider: string
      embeddingModel: string
      embeddingFallbackUsed: boolean
      embeddingApiStyle: ProjectKnowledgeEmbeddingApiStyle
      embeddingInputType: ProjectKnowledgeEmbeddingInputType
      embeddingDimensions: number
      embeddingFusionUsed: boolean
      embeddingRuntimeVersion: string
      embeddingSignature: ProjectKnowledgeChunkMetadata['embeddingSignature']
      embeddingFailureReason?: string
    }> = []
    const chunkTotal = chunks.length

    for (const chunk of chunks) {
      const embeddingResult = await createKnowledgeEmbedding({
        text: chunk.content,
        contents: chunk.embeddingInput?.contents,
        inputType: chunk.embeddingInput?.inputType,
        enableFusion: chunk.embeddingInput?.enableFusion,
      })
      embeddedChunks.push({
        ...chunk,
        embedding: embeddingResult.embedding,
        embeddingProvider: embeddingResult.provider,
        embeddingModel: embeddingResult.model,
        embeddingFallbackUsed: embeddingResult.fallbackUsed,
        embeddingApiStyle: embeddingResult.apiStyle,
        embeddingInputType: embeddingResult.inputType,
        embeddingDimensions: embeddingResult.dimensions,
        embeddingFusionUsed: embeddingResult.fusionUsed,
        embeddingRuntimeVersion: embeddingResult.runtimeVersion,
        embeddingSignature: embeddingResult.signature,
        embeddingFailureReason: embeddingResult.failureReason,
      })

      const chunkIndexed = embeddedChunks.length
      const progressPercent = chunkTotal > 0
        ? 55 + Math.round((chunkIndexed / chunkTotal) * 40)
        : 95
      await withTransaction(undefined, async (db) => {
        await updateProjectKnowledgeTaskProgress(db, {
          taskId: task.id,
          status: 'embedding',
          stage: 'embedding',
          progressPercent: Math.max(55, Math.min(95, progressPercent)),
          etaSeconds: estimateEmbeddingEtaSeconds(chunkTotal, chunkIndexed),
          chunkTotal,
          chunkIndexed,
          resultJson: {
            embeddedChunkCount: chunkIndexed,
            chunkKinds,
          },
        })
      })
    }

    await withTransaction(undefined, async (db) => {
      await updateProjectKnowledgeTaskProgress(db, {
        taskId: task.id,
        status: 'embedding',
        stage: 'finalizing',
        progressPercent: 97,
        etaSeconds: 2,
        chunkTotal,
        chunkIndexed: chunkTotal,
      })

      await replaceProjectKnowledgeChunks(db, {
        sourceId: context.source.id,
        projectId: context.source.projectId,
        scopeType: context.source.scopeType,
        sourceResourceId: context.source.sourceResourceId,
        linkedContestResourceId: context.source.linkedContestResourceId,
        sourceHash: context.processedSourceHash,
        indexVersion: context.source.indexVersion,
        chunks: embeddedChunks.map(item => ({
          ...(function () {
            const existingMetadata = normalizeRecord(item.metadata)
            const provenanceSourceType = resolveProvenanceSourceType({
              metadata: existingMetadata,
              embeddingFallbackUsed: item.embeddingFallbackUsed,
            })
            const embeddingStatus = resolveEmbeddingStatus({
              provenanceSourceType,
              embeddingFallbackUsed: item.embeddingFallbackUsed,
            })
            const sourceConfidence = resolveSourceConfidence(existingMetadata)
            const modalitySupportWeight = resolveModalitySupportWeight({
              metadata: existingMetadata,
              embeddingApiStyle: item.embeddingApiStyle,
            })
            return {
              chunkIndex: item.chunkIndex,
              chunkKind: item.chunkKind,
              title: item.title,
              content: item.content,
              citationLabel: item.citationLabel,
              pageNumber: item.pageNumber,
              sectionLabel: item.sectionLabel,
              metadata: {
                ...existingMetadata,
                ...buildChunkMetadata({
                  embeddingProvider: item.embeddingProvider,
                  embeddingModel: item.embeddingModel,
                  embeddingFallbackUsed: item.embeddingFallbackUsed,
                  embeddingApiStyle: item.embeddingApiStyle,
                  embeddingInputType: item.embeddingInputType,
                  embeddingDimensions: item.embeddingDimensions,
                  embeddingFusionUsed: item.embeddingFusionUsed,
                  embeddingRuntimeVersion: item.embeddingRuntimeVersion,
                  embeddingSignature: item.embeddingSignature,
                  embeddingFailureReason: item.embeddingFailureReason,
                  provenanceSourceType,
                  embeddingStatus,
                  sourceConfidence,
                  stageSuccessRatio: 1,
                  modalitySupportWeight,
                  neighborhoodConsistency: 0,
                  embeddingQualityScore: 0,
                }),
              },
              embedding: item.embedding,
            }
          })(),
        })),
      })

      await completeProjectKnowledgeTaskSuccess(db, {
        taskId: task.id,
        processedSourceHash: context.processedSourceHash,
        chunkTotal,
        chunkIndexed: chunkTotal,
        resultJson: {
          chunkTotal,
          indexedChunkCount: chunkTotal,
          chunkKinds,
          realEmbeddedChunkCount: embeddedChunks.filter(item => !item.embeddingFallbackUsed).length,
          fallbackEmbeddedChunkCount: embeddedChunks.filter(item => item.embeddingFallbackUsed).length,
        },
      })
    })

    await withTransaction(undefined, async (db) => {
      await scheduleProjectKnowledgeAnalyticsRefresh(db, {
        projectId: context.source.projectId,
        snapshotType: 'manual',
        targetSourceId: context.source.id,
      })
    })
  }
  catch (error) {
    const errorMessage = toErrorMessage(error)
    await withTransaction(undefined, async (db) => {
      await completeProjectKnowledgeTaskFailure(db, {
        taskId: task.id,
        errorMessage,
      })
    })
    captureServerException(error, {
      module: 'project-knowledge-worker',
      taskId: task.id,
    })
    return 'failed'
  }

  return 'succeeded'
}

function logWorkerError(stage: 'bootstrap' | 'tick', error: unknown): void {
  const prefix = stage === 'bootstrap'
    ? '[project-knowledge-worker] bootstrap failed:'
    : '[project-knowledge-worker] tick failed:'
  console.error(prefix, toErrorMessage(error))
  getProjectKnowledgeWorkerState().lastError = toErrorMessage(error)
  captureServerException(error, {
    module: 'project-knowledge-worker',
  })
}

async function runTick(): Promise<void> {
  const state = getProjectKnowledgeWorkerState()
  if (state.ticking)
    return

  state.ticking = true
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  state.lastStartedAt = startedAt

  let processedTaskCount = 0
  let succeededTaskCount = 0
  let failedTaskCount = 0
  let runErrorMessage = ''

  try {
    let count = 0
    while (count < PROJECT_KNOWLEDGE_WORKER_BATCH_SIZE) {
      const handled = await processSingleTask()
      if (handled === 'idle')
        break
      processedTaskCount += 1
      if (handled === 'succeeded')
        succeededTaskCount += 1
      else
        failedTaskCount += 1
      count += 1
    }
  }
  catch (error) {
    runErrorMessage = toErrorMessage(error)
    logWorkerError('tick', error)
  }
  finally {
    const finishedAt = new Date().toISOString()
    const durationMs = Math.max(0, Date.now() - startedMs)
    const success = !runErrorMessage && failedTaskCount === 0

    state.runCount += 1
    state.processedTaskCount += processedTaskCount
    state.succeededTaskCount += succeededTaskCount
    state.failedTaskCount += failedTaskCount
    state.lastFinishedAt = finishedAt
    state.lastDurationMs = durationMs
    state.lastError = runErrorMessage || (failedTaskCount > 0 ? '最近一轮索引存在失败任务。' : '')
    if (success)
      state.successCount += 1
    else
      state.failureCount += 1
    if (success && processedTaskCount > 0)
      state.lastSuccessAt = finishedAt

    pushProjectKnowledgeWorkerRunRecord(state, {
      id: randomUUID(),
      startedAt,
      finishedAt,
      durationMs,
      processedTaskCount,
      succeededTaskCount,
      failedTaskCount,
      success,
      errorMessage: runErrorMessage,
    })
    state.ticking = false
  }
}

export default defineNitroPlugin((nitroApp) => {
  const state = getProjectKnowledgeWorkerState()
  const timerState = getWorkerTimerState()
  if (state.started)
    return

  state.started = true
  state.enabled = true
  state.intervalMs = PROJECT_KNOWLEDGE_WORKER_INTERVAL_MS
  state.batchSize = PROJECT_KNOWLEDGE_WORKER_BATCH_SIZE
  void withClient(undefined, async (db) => {
    await resetStaleProjectKnowledgeTasks(db, {
      staleMinutes: 20,
    })
  }).catch((error) => {
    logWorkerError('bootstrap', error)
  })

  timerState.timer = setInterval(() => {
    void runTick()
  }, PROJECT_KNOWLEDGE_WORKER_INTERVAL_MS)
  timerState.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (timerState.timer)
      clearInterval(timerState.timer)
    timerState.timer = null
    state.started = false
    state.enabled = false
  })
})
