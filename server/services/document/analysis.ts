import type { Buffer } from 'node:buffer'
import type { RuntimeSettings } from '~~/server/utils/env'
import type { DocumentAnalysis, DocumentBBox, DocumentBlock, DocumentField } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { buildAnalysisFromDraft, extractPdfDraftFromBuffer } from '~~/server/services/document/pdf-layout'
import { runWithRetry } from '~~/server/utils/retry'

interface NormalizedPage {
  page: number
  width?: number
  height?: number
  blocks: DocumentBlock[]
  fields: DocumentField[]
}

function clamp01(value: number): number {
  if (!Number.isFinite(value))
    return 0
  if (value <= 0)
    return 0
  if (value >= 1)
    return 1
  return value
}

function normalizeBbox(value: unknown): DocumentBBox {
  const source = (value || {}) as Record<string, unknown>
  const x = clamp01(Number(source.x ?? source.left ?? 0))
  const y = clamp01(Number(source.y ?? source.top ?? 0))
  const w = clamp01(Number(source.w ?? source.width ?? 0))
  const h = clamp01(Number(source.h ?? source.height ?? 0))
  return {
    x,
    y,
    w: Math.min(w, 1 - x),
    h: Math.min(h, 1 - y),
  }
}

function normalizeFromAi(raw: unknown, fallback: DocumentAnalysis): DocumentAnalysis {
  const root = (raw || {}) as Record<string, unknown>
  const pages = Array.isArray(root.pages) ? root.pages : []
  if (pages.length === 0)
    return fallback

  const normalizedPages: NormalizedPage[] = pages.map((pageItem, index) => {
    const pageRecord = (pageItem || {}) as Record<string, unknown>
    const pageNumber = Math.max(1, Number(pageRecord.page || index + 1))
    const pageBlocks = Array.isArray(pageRecord.blocks) ? pageRecord.blocks : []
    const pageFields = Array.isArray(pageRecord.fields) ? pageRecord.fields : []

    const blocks: DocumentBlock[] = []
    for (const block of pageBlocks) {
      const item = (block || {}) as Record<string, unknown>
      const text = String(item.text || '').trim()
      if (!text)
        continue
      blocks.push({
        id: String(randomUUID()),
        page: pageNumber,
        type: String(item.type || 'paragraph') as DocumentBlock['type'],
        text,
        bbox: normalizeBbox(item.bbox),
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.7,
      })
    }

    const fields: DocumentField[] = []
    for (const field of pageFields) {
      const item = (field || {}) as Record<string, unknown>
      const key = String(item.key || '').trim()
      const value = String(item.value || '').trim()
      if (!key || !value)
        continue
      fields.push({
        id: String(randomUUID()),
        page: pageNumber,
        key,
        value,
        bbox: normalizeBbox(item.bbox),
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.7,
      })
    }

    return {
      page: pageNumber,
      width: Number(pageRecord.width || 0) || undefined,
      height: Number(pageRecord.height || 0) || undefined,
      blocks,
      fields,
    }
  })

  return {
    version: 'v1',
    source: 'doc-ai',
    pages: normalizedPages.map((page, index) => ({
      page: page.page,
      width: page.width || fallback.pages[index]?.width || 1,
      height: page.height || fallback.pages[index]?.height || 1,
      blocks: page.blocks,
      fields: page.fields,
    })),
  }
}

function extractJsonFromText(content: string): string {
  const trimmed = content.trim()
  if (!trimmed)
    return '{}'
  if (trimmed.startsWith('{') && trimmed.endsWith('}'))
    return trimmed

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace)
    return trimmed.slice(firstBrace, lastBrace + 1)
  return '{}'
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string')
    return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

async function invokeDocAi(input: {
  baseURL: string
  apiKey: string
  model: string
  timeoutMs: number
  payload: Record<string, unknown>
}): Promise<DocumentAnalysis | null> {
  try {
    const model = createChatModel({
      provider: 'doc-ai',
      baseURL: input.baseURL,
      apiKey: input.apiKey,
      model: input.model,
      timeoutMs: Math.max(2000, input.timeoutMs),
      maxRetries: 0,
      temperature: 0,
    })

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', [
        '你是文档解析引擎。',
        '请将输入中的每页文本行归并成 blocks 与 fields，并返回 JSON。',
        '坐标必须是 0~1 的归一化 bbox={x,y,w,h}，并且每项包含 page。',
      ].join('\n')],
      ['human', '{payload}'],
    ])

    const promptValue = await prompt.invoke({
      payload: JSON.stringify(input.payload),
    })

    const output = await model.invoke(promptValue)
    const content = extractMessageText(output.content) || '{}'
    const parsed = JSON.parse(extractJsonFromText(content)) as DocumentAnalysis
    if (!parsed || typeof parsed !== 'object')
      return null
    return parsed
  }
  catch {
    return null
  }
}

export async function analyzePdfBufferWithDocAi(
  buffer: Buffer,
  input: {
    fileName: string
    runtime: RuntimeSettings
  },
): Promise<{ analysis: DocumentAnalysis, pageCount: number }> {
  const draft = await extractPdfDraftFromBuffer(buffer)
  const fallbackAnalysis = buildAnalysisFromDraft(draft)
  const aiConfig = input.runtime.docAi
  const enableDocAi = aiConfig.provider !== 'mock' && Boolean(aiConfig.apiKey) && Boolean(aiConfig.baseURL)

  if (!enableDocAi || !draft.hasText) {
    return {
      analysis: fallbackAnalysis,
      pageCount: draft.pageCount,
    }
  }

  const aiPayload = {
    fileName: input.fileName,
    pageCount: draft.pageCount,
    pages: draft.pages.map(page => ({
      page: page.page,
      width: page.width,
      height: page.height,
      lines: page.lines.slice(0, 250),
    })),
  }

  const result = await runWithRetry<DocumentAnalysis | null>({
    maxRetries: Math.max(0, aiConfig.maxRetries),
    run: () => invokeDocAi({
      baseURL: aiConfig.baseURL,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      timeoutMs: aiConfig.timeoutMs,
      payload: aiPayload,
    }),
    fallback: () => null,
  })

  const analysis = result.data
    ? normalizeFromAi(result.data, fallbackAnalysis)
    : fallbackAnalysis

  return {
    analysis,
    pageCount: draft.pageCount,
  }
}
