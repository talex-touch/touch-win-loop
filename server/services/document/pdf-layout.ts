import type { Buffer } from 'node:buffer'
import type { DocumentAnalysis, DocumentBBox, DocumentBlock, DocumentBlockType, DocumentField } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface PdfTextItem {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

interface PdfTextContent {
  items?: PdfTextItem[]
}

export interface PdfLineDraft {
  text: string
  bbox: DocumentBBox
}

export interface PdfPageDraft {
  page: number
  width: number
  height: number
  lines: PdfLineDraft[]
}

export interface PdfDraft {
  pageCount: number
  pages: PdfPageDraft[]
  hasText: boolean
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

function normalizeBbox(box: DocumentBBox): DocumentBBox {
  const x = clamp01(box.x)
  const y = clamp01(box.y)
  const w = clamp01(box.w)
  const h = clamp01(box.h)
  return {
    x,
    y,
    w: Math.min(w, 1 - x),
    h: Math.min(h, 1 - y),
  }
}

function inferBlockType(text: string, lineIndex: number): DocumentBlockType {
  const normalized = text.trim()
  if (!normalized)
    return 'unknown'
  if (lineIndex <= 1 && normalized.length <= 24)
    return 'title'
  if (/^图\s*\d+/.test(normalized) || /^figure\s*\d+/i.test(normalized))
    return 'image'
  if (/^表\s*\d+/.test(normalized) || /^table\s*\d+/i.test(normalized))
    return 'table'
  return 'paragraph'
}

function parseField(line: PdfLineDraft, page: number): DocumentField | null {
  const matched = line.text.match(/^(.{1,40}?)[：:]\s*(.{1,200})$/)
  if (!matched)
    return null
  const key = matched[1]?.trim() || ''
  const value = matched[2]?.trim() || ''
  if (!key || !value)
    return null
  return {
    id: randomUUID(),
    page,
    key,
    value,
    bbox: line.bbox,
    confidence: 0.85,
  }
}

function buildFallbackLine(page: number): PdfLineDraft {
  return {
    text: `扫描页 ${page}（未提取到文本，建议人工核验）`,
    bbox: {
      x: 0.05,
      y: 0.05,
      w: 0.9,
      h: 0.05,
    },
  }
}

export async function extractPdfDraftFromBuffer(buffer: Buffer): Promise<PdfDraft> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  })
  const doc = await loadingTask.promise
  const pages: PdfPageDraft[] = []
  let hasText = false

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({
      scale: 1,
    })
    const content = await page.getTextContent() as PdfTextContent
    const items = (content.items || []).filter(item => (item?.str || '').trim().length > 0)

    const fragments = items.map((item) => {
      const transform = item.transform || [1, 0, 0, 1, 0, 0]
      const rawX = Number(transform[4] || 0)
      const rawY = Number(transform[5] || 0)
      const width = Math.max(1, Number(item.width || 0))
      const height = Math.max(1, Number(item.height || Math.abs(Number(transform[0] || 0)) || 12))

      const bbox = normalizeBbox({
        x: rawX / viewport.width,
        y: (viewport.height - rawY - height) / viewport.height,
        w: width / viewport.width,
        h: height / viewport.height,
      })
      return {
        text: (item.str || '').trim(),
        bbox,
      }
    })

    fragments.sort((a, b) => {
      if (Math.abs(a.bbox.y - b.bbox.y) < 0.006)
        return a.bbox.x - b.bbox.x
      return a.bbox.y - b.bbox.y
    })

    const lines: PdfLineDraft[] = []
    for (const fragment of fragments) {
      const prev = lines[lines.length - 1]
      if (!prev) {
        lines.push({
          text: fragment.text,
          bbox: fragment.bbox,
        })
        continue
      }

      const sameLine = Math.abs(prev.bbox.y - fragment.bbox.y) < 0.01
      if (!sameLine) {
        lines.push({
          text: fragment.text,
          bbox: fragment.bbox,
        })
        continue
      }

      prev.text = `${prev.text} ${fragment.text}`.replace(/\s+/g, ' ').trim()
      prev.bbox = normalizeBbox({
        x: Math.min(prev.bbox.x, fragment.bbox.x),
        y: Math.min(prev.bbox.y, fragment.bbox.y),
        w: Math.max(prev.bbox.x + prev.bbox.w, fragment.bbox.x + fragment.bbox.w) - Math.min(prev.bbox.x, fragment.bbox.x),
        h: Math.max(prev.bbox.y + prev.bbox.h, fragment.bbox.y + fragment.bbox.h) - Math.min(prev.bbox.y, fragment.bbox.y),
      })
    }

    const filteredLines = lines
      .map(line => ({
        ...line,
        text: line.text.trim(),
      }))
      .filter(line => line.text.length > 0)

    if (filteredLines.length > 0)
      hasText = true

    pages.push({
      page: pageNum,
      width: viewport.width,
      height: viewport.height,
      lines: filteredLines.length > 0 ? filteredLines : [buildFallbackLine(pageNum)],
    })
  }

  return {
    pageCount: doc.numPages,
    pages,
    hasText,
  }
}

export function buildAnalysisFromDraft(draft: PdfDraft): DocumentAnalysis {
  return {
    version: 'v1',
    source: draft.hasText ? 'pdfjs-text' : 'pdfjs-fallback',
    pages: draft.pages.map((page) => {
      const blocks: DocumentBlock[] = page.lines.map((line, index) => ({
        id: randomUUID(),
        page: page.page,
        type: inferBlockType(line.text, index),
        text: line.text,
        bbox: line.bbox,
        confidence: draft.hasText ? 0.9 : 0.12,
      }))

      const fields: DocumentField[] = page.lines
        .map(line => parseField(line, page.page))
        .filter((item): item is DocumentField => Boolean(item))

      return {
        page: page.page,
        width: page.width,
        height: page.height,
        blocks,
        fields,
      }
    }),
  }
}
