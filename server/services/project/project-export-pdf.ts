import type { ProjectExportPdfReportPayload } from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'

const PDF_HEADER = '%PDF-1.4'
const PDF_PAGE_WIDTH = 595
const PDF_PAGE_HEIGHT = 842
const PDF_MARGIN_X = 52
const PDF_MARGIN_TOP = 780
const PDF_MARGIN_BOTTOM = 52
const PDF_FONT_NAME = 'STSong-Light'
const PDF_FONT_ENCODING = 'UniGB-UCS2-H'

interface PdfLine {
  text: string
  fontSize: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function splitTextToLines(text: string, maxChars: number): string[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const paragraphs = normalized.split('\n')
  const result: string[] = []

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed) {
      result.push('')
      continue
    }

    let cursor = ''
    for (const char of Array.from(trimmed)) {
      cursor += char
      if (Array.from(cursor).length >= maxChars) {
        result.push(cursor)
        cursor = ''
      }
    }
    if (cursor)
      result.push(cursor)
  }

  return result
}

function encodePdfTextHex(text: string): string {
  const utf16le = Buffer.from(String(text || ''), 'utf16le')
  const utf16be = Buffer.from(utf16le)
  utf16be.swap16()
  return `<${utf16be.toString('hex').toUpperCase()}>`
}

function buildPdfLines(payload: ProjectExportPdfReportPayload): PdfLine[] {
  const lines: PdfLine[] = []
  lines.push({ text: normalizeString(payload.title) || 'WinLoop 项目导出报告', fontSize: 22 })
  if (normalizeString(payload.summary))
    lines.push({ text: normalizeString(payload.summary), fontSize: 12 })
  lines.push({ text: '', fontSize: 12 })

  for (const section of payload.sections || []) {
    const title = normalizeString(section.title)
    const body = normalizeString(section.body)
    if (title)
      lines.push({ text: title, fontSize: 15 })
    const wrapped = splitTextToLines(body, 28)
    if (wrapped.length === 0)
      lines.push({ text: '暂无内容。', fontSize: 11 })
    else
      wrapped.forEach(text => lines.push({ text, fontSize: 11 }))
    lines.push({ text: '', fontSize: 11 })
  }

  return lines
}

function paginatePdfLines(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = []
  let currentPage: PdfLine[] = []
  let cursorY = PDF_MARGIN_TOP

  for (const line of lines) {
    const lineHeight = Math.max(18, Math.round(line.fontSize * 1.7))
    if (cursorY - lineHeight < PDF_MARGIN_BOTTOM && currentPage.length > 0) {
      pages.push(currentPage)
      currentPage = []
      cursorY = PDF_MARGIN_TOP
    }
    currentPage.push(line)
    cursorY -= lineHeight
  }

  if (currentPage.length === 0)
    currentPage.push({ text: '暂无内容。', fontSize: 12 })
  pages.push(currentPage)
  return pages
}

function renderPageContent(lines: PdfLine[]): string {
  let cursorY = PDF_MARGIN_TOP
  const commands = ['BT', '0 g']

  for (const line of lines) {
    const fontSize = Math.max(10, line.fontSize)
    const lineHeight = Math.max(18, Math.round(fontSize * 1.7))
    commands.push(`/F1 ${fontSize} Tf`)
    commands.push(`1 0 0 1 ${PDF_MARGIN_X} ${cursorY} Tm`)
    commands.push(`${encodePdfTextHex(line.text || ' ')} Tj`)
    cursorY -= lineHeight
  }

  commands.push('ET')
  return commands.join('\n')
}

export function generateProjectExportPdfBuffer(payload: ProjectExportPdfReportPayload): Buffer {
  const pages = paginatePdfLines(buildPdfLines(payload))
  const pageObjectIds = pages.map((_, index) => 3 + index * 2)
  const contentObjectIds = pages.map((_, index) => 4 + index * 2)
  const fontObjectId = 3 + pages.length * 2
  const cidFontObjectId = fontObjectId + 1
  const fontDescriptorObjectId = fontObjectId + 2

  const objects = new Map<number, string>()
  objects.set(1, `<< /Type /Catalog /Pages 2 0 R >>`)
  objects.set(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] >>`)

  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index]!
    const contentId = contentObjectIds[index]!
    const stream = renderPageContent(pageLines)
    const streamBuffer = Buffer.from(stream, 'utf8')
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    objects.set(contentId, `<< /Length ${streamBuffer.length} >>\nstream\n${stream}\nendstream`)
  })

  objects.set(
    fontObjectId,
    `<< /Type /Font /Subtype /Type0 /BaseFont /${PDF_FONT_NAME} /Encoding /${PDF_FONT_ENCODING} /DescendantFonts [${cidFontObjectId} 0 R] >>`,
  )
  objects.set(
    cidFontObjectId,
    `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${PDF_FONT_NAME} /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor ${fontDescriptorObjectId} 0 R /DW 1000 >>`,
  )
  objects.set(
    fontDescriptorObjectId,
    `<< /Type /FontDescriptor /FontName /${PDF_FONT_NAME} /Flags 4 /Ascent 880 /Descent -120 /CapHeight 700 /ItalicAngle 0 /StemV 80 /MissingWidth 500 >>`,
  )

  let pdf = `${PDF_HEADER}\n%\xE4\xE5\xF6\xE7\n`
  const offsets: number[] = [0]

  for (let objectId = 1; objectId <= objects.size; objectId += 1) {
    offsets[objectId] = Buffer.byteLength(pdf, 'utf8')
    pdf += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.size + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let objectId = 1; objectId <= objects.size; objectId += 1)
    pdf += `${String(offsets[objectId] || 0).padStart(10, '0')} 00000 n \n`

  pdf += `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(pdf, 'utf8')
}
