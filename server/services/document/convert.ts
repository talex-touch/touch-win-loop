import type { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DOC_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function normalizeLowerText(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function getFileExtension(fileName: string): string {
  return normalizeLowerText(extname(fileName || ''))
}

export function isWordDocument(input: {
  fileName: string
  mimeType: string
}): boolean {
  const extension = getFileExtension(input.fileName)
  if (extension === '.doc' || extension === '.docx')
    return true
  const mime = normalizeLowerText(input.mimeType)
  return DOC_MIME_TYPES.has(mime)
}

export function isPdfDocument(input: {
  fileName: string
  mimeType: string
}): boolean {
  const extension = getFileExtension(input.fileName)
  if (extension === '.pdf')
    return true
  return normalizeLowerText(input.mimeType).includes('pdf')
}

function toPdfFileName(fileName: string): string {
  const base = String(fileName || '').trim().replace(/\.[^.]+$/, '')
  const safe = base || randomUUID()
  return `${safe}.pdf`
}

export async function convertWordBufferToPdf(input: {
  fileName: string
  sourceBuffer: Buffer
  timeoutMs?: number
}): Promise<{ pdfBuffer: Buffer, fileName: string }> {
  const extension = getFileExtension(input.fileName) || '.docx'
  const tmpRoot = await mkdtemp(join(tmpdir(), 'winloop-doc-convert-'))
  const sourcePath = join(tmpRoot, `input${extension}`)
  const targetPath = join(tmpRoot, 'input.pdf')

  try {
    await writeFile(sourcePath, input.sourceBuffer)

    await execFileAsync('soffice', [
      '--headless',
      '--convert-to',
      'pdf:writer_pdf_Export',
      '--outdir',
      tmpRoot,
      sourcePath,
    ], {
      timeout: Math.max(10_000, Number(input.timeoutMs || 45_000)),
      maxBuffer: 10 * 1024 * 1024,
    })

    const pdfBuffer = await readFile(targetPath)
    return {
      pdfBuffer,
      fileName: toPdfFileName(input.fileName),
    }
  }
  catch (error) {
    if (error instanceof Error && /ENOENT/i.test(error.message))
      throw new Error('SOFFICE_NOT_AVAILABLE')
    throw error
  }
  finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}
