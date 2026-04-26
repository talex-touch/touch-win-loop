import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  DocumentAnalysis,
  DocumentBBox,
  DocumentBlock,
  ProjectResourceReviewFinding,
  ProjectResourceReviewSeverity,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { runWithRetry } from '~~/server/utils/retry'

const pageReviewFindingSchema = z.object({
  pageNumber: z.number().int().min(1),
  severity: z.enum(['info', 'low', 'medium', 'high']).default('info'),
  category: z.string().default('content'),
  title: z.string().default('页面建议'),
  comment: z.string().default(''),
  quote: z.string().default(''),
  sourceBlockIds: z.array(z.string()).default([]),
  bbox: z.object({
    x: z.number().min(0).max(1).default(0),
    y: z.number().min(0).max(1).default(0),
    w: z.number().min(0).max(1).default(0),
    h: z.number().min(0).max(1).default(0),
  }).nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.65),
})

const pageReviewResultSchema = z.object({
  summary: z.string().default(''),
  findings: z.array(pageReviewFindingSchema).default([]),
})

interface ReviewPageInput {
  pageNumber: number
  text: string
  blocks: Array<{
    id: string
    text: string
    bbox: DocumentBBox
  }>
}

export interface DocumentPageReviewResult {
  summary: string
  findings: Array<Omit<ProjectResourceReviewFinding, 'id' | 'jobId' | 'projectId' | 'resourceId' | 'documentId' | 'createdAt'>>
  provider: string
  model: string
  fallbackUsed: boolean
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function summarizeText(value: string, max = 420): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ')
  if (!normalized)
    return ''
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, max)}...`
}

function clamp01(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return 0
  return Math.max(0, Math.min(1, parsed))
}

function normalizeBbox(value: unknown): DocumentBBox | null {
  if (!value || typeof value !== 'object')
    return null
  const source = value as Record<string, unknown>
  return {
    x: clamp01(source.x),
    y: clamp01(source.y),
    w: clamp01(source.w ?? source.width),
    h: clamp01(source.h ?? source.height),
  }
}

function normalizeSeverity(value: unknown): ProjectResourceReviewSeverity {
  const normalized = normalizeString(value)
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low' || normalized === 'info')
    return normalized
  return 'info'
}

function pageBlocksToText(blocks: DocumentBlock[]): string {
  return blocks
    .map(block => normalizeString(block.text))
    .filter(Boolean)
    .join('\n')
}

function buildReviewPages(analysis: DocumentAnalysis): ReviewPageInput[] {
  return analysis.pages.map((page) => {
    const blocks = (page.blocks || [])
      .map(block => ({
        id: normalizeString(block.id),
        text: normalizeString(block.text),
        bbox: block.bbox,
      }))
      .filter(block => block.id && block.text)
    return {
      pageNumber: Math.max(1, Number(page.page || 1)),
      text: pageBlocksToText(page.blocks || []),
      blocks,
    }
  })
}

function firstBlockForPage(page: ReviewPageInput) {
  return page.blocks[0] || null
}

function buildFallbackFindings(pages: ReviewPageInput[]) {
  return pages.map((page) => {
    const firstBlock = firstBlockForPage(page)
    const hasText = Boolean(normalizeString(page.text))
    return {
      pageNumber: page.pageNumber,
      severity: hasText ? 'info' as const : 'medium' as const,
      category: hasText ? 'page_review' : 'source_gap',
      title: hasText ? `第 ${page.pageNumber} 页审阅建议` : `第 ${page.pageNumber} 页来源不足`,
      comment: hasText
        ? '已基于该页可解析文本生成基础审阅入口。建议重点检查页面主张、证据链、信息密度与视觉层级。'
        : '该页没有可用文本块，AI 无法可靠给出逐项意见。请先补 OCR 或上传可解析 PDF/PPT 预览。',
      quote: hasText ? summarizeText(firstBlock?.text || page.text, 160) : '',
      sourceBlockIds: firstBlock?.id ? [firstBlock.id] : [],
      locator: {
        page: page.pageNumber,
        label: `第 ${page.pageNumber} 页`,
      },
      bbox: firstBlock?.bbox || null,
      confidence: hasText ? 0.52 : 0.34,
    }
  })
}

function normalizeAiFindings(rawFindings: z.infer<typeof pageReviewFindingSchema>[], pages: ReviewPageInput[]) {
  const pageMap = new Map(pages.map(page => [page.pageNumber, page]))
  const findings = rawFindings
    .map((finding) => {
      const pageNumber = Math.max(1, Number(finding.pageNumber || 1))
      const page = pageMap.get(pageNumber)
      const firstBlock = page ? firstBlockForPage(page) : null
      const sourceBlockIds = finding.sourceBlockIds
        .map(item => normalizeString(item))
        .filter(Boolean)
      const quote = normalizeString(finding.quote)
        || summarizeText(firstBlock?.text || page?.text || '', 160)
      return {
        pageNumber,
        severity: normalizeSeverity(finding.severity),
        category: normalizeString(finding.category) || 'page_review',
        title: normalizeString(finding.title) || `第 ${pageNumber} 页建议`,
        comment: normalizeString(finding.comment) || '该页需要人工复核。',
        quote,
        sourceBlockIds: sourceBlockIds.length > 0 ? sourceBlockIds : (firstBlock?.id ? [firstBlock.id] : []),
        locator: {
          page: pageNumber,
          label: `第 ${pageNumber} 页`,
        },
        bbox: normalizeBbox(finding.bbox) || firstBlock?.bbox || null,
        confidence: Math.max(0, Math.min(1, Number(finding.confidence || 0.65))),
      }
    })
    .filter(finding => finding.pageNumber > 0 && finding.title && finding.comment)

  const coveredPages = new Set(findings.map(finding => finding.pageNumber))
  const fallbackByPage = buildFallbackFindings(pages)
  let fallbackFilledPageCount = 0
  for (const fallback of fallbackByPage) {
    if (!coveredPages.has(fallback.pageNumber)) {
      findings.push(fallback)
      fallbackFilledPageCount += 1
    }
  }
  return {
    findings: findings.sort((left, right) => left.pageNumber - right.pageNumber),
    fallbackFilledPageCount,
  }
}

export async function reviewDocumentPages(input: {
  analysis: DocumentAnalysis
  resourceTitle: string
  prompt?: string
  runtime: RuntimeSettings
}): Promise<DocumentPageReviewResult> {
  const pages = buildReviewPages(input.analysis)
  const channelRuntime = resolveAiRuntimeForChannel(input.runtime, 'document_analysis')
  const provider = channelRuntime.ai.provider
  const model = channelRuntime.ai.model
  const fallbackFindings = buildFallbackFindings(pages)
  if (pages.length === 0 || !channelRuntime.channel.enabled || !isAiRuntimeConfigured(channelRuntime.ai)) {
    return {
      summary: pages.length > 0
        ? '已生成基础逐页审阅意见；当前文档审稿 AI 未配置，结果使用规则回退。'
        : '未发现可审阅页面。',
      findings: fallbackFindings,
      provider,
      model,
      fallbackUsed: true,
    }
  }

  try {
    const chatModel = createChatModel({
      ...channelRuntime.ai,
      temperature: 0.1,
    })
    const structuredModel = chatModel.withStructuredOutput(pageReviewResultSchema, {
      name: 'ProjectResourcePageReview',
      strict: false,
    })
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', [
        '你是 WinLoop 的 PDF/PPT 页级审稿助手。',
        '必须逐页给出可执行意见，每条意见都要绑定页码、quote 和 sourceBlockIds。',
        '只基于输入文本块判断，不能编造未给出的来源。',
        'severity 可用 info/low/medium/high；没有明显问题时也要给出该页最值得优化的建议。',
      ].join('\n')],
      ['human', [
        `资源标题：${input.resourceTitle || '未命名资源'}`,
        input.prompt ? `审稿要求：${input.prompt}` : '审稿要求：检查每页主张、结构、表达、证据与视觉信息密度。',
        `页面 JSON：${JSON.stringify(pages.map(page => ({
          pageNumber: page.pageNumber,
          text: summarizeText(page.text, 1600),
          blocks: page.blocks.slice(0, 40).map(block => ({
            id: block.id,
            text: summarizeText(block.text, 280),
            bbox: block.bbox,
          })),
        })))}`,
      ].join('\n\n')],
    ])
    const promptValue = await promptTemplate.invoke({})
    const reviewResult = await runWithRetry<z.infer<typeof pageReviewResultSchema>>({
      maxRetries: Math.max(0, Math.min(3, Number(channelRuntime.ai.maxRetries || 0))),
      run: async () => pageReviewResultSchema.parse(await structuredModel.invoke(promptValue)),
    })
    const parsed = reviewResult.data
    const normalizedFindings = normalizeAiFindings(parsed.findings, pages)
    const fallbackFilledPageCount = normalizedFindings.fallbackFilledPageCount
    return {
      summary: normalizeString(parsed.summary) || '已完成逐页审稿。',
      findings: normalizedFindings.findings,
      provider,
      model,
      fallbackUsed: fallbackFilledPageCount > 0,
    }
  }
  catch {
    return {
      summary: '文档审稿 AI 调用失败，已使用规则回退生成逐页意见。',
      findings: fallbackFindings,
      provider,
      model,
      fallbackUsed: true,
    }
  }
}
