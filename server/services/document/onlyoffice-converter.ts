import { Buffer } from 'node:buffer'
import { createHmac, randomUUID } from 'node:crypto'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getOnlyOfficeErrorCodeDescription } from '~~/shared/constants/onlyoffice'

interface ConverterResponseCandidate {
  fileUrl?: string
  url?: string
  file?: string
  data?: string
  error?: number | string
  errorCode?: number | string
  message?: string
  errorMessage?: string
  percent?: number | string
  endConvert?: boolean | string
}

interface OnlyOfficeJsonResponse {
  fileUrl?: string
  url?: string
  errorCode?: number
  errorMessage?: string
  percent?: number
  endConvert?: boolean
}

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function toSafeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed))
    return parsed
  return fallback
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function ensureTrailingSlashRemoved(value: string): string {
  return String(value || '').trim().replace(/\/+$/g, '')
}

function extensionWithoutDot(fileName: string): string {
  const lower = String(fileName || '').trim().toLowerCase()
  const dotIndex = lower.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex >= lower.length - 1)
    return ''
  return lower.slice(dotIndex + 1)
}

function parseOnlyOfficeXml(text: string): OnlyOfficeJsonResponse | null {
  const payload = String(text || '').trim()
  if (!payload.startsWith('<'))
    return null

  const errorMatch = payload.match(/<Error>([^<]*)<\/Error>/i)
  const fileUrlMatch = payload.match(/<(?:FileUrl|Url)>([^<]+)<\/(?:FileUrl|Url)>/i)
  const percentMatch = payload.match(/<Percent>([^<]*)<\/Percent>/i)
  const endMatch = payload.match(/<EndConvert>([^<]*)<\/EndConvert>/i)

  return {
    fileUrl: normalizeString(fileUrlMatch?.[1]),
    errorCode: toSafeNumber(errorMatch?.[1], 0),
    percent: toSafeNumber(percentMatch?.[1], 0),
    endConvert: /^true$/i.test(normalizeString(endMatch?.[1])),
  }
}

function parseOnlyOfficeJson(text: string): OnlyOfficeJsonResponse | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const response = parsed as ConverterResponseCandidate
    return {
      fileUrl: normalizeString(response.fileUrl || response.url),
      errorCode: toSafeNumber(response.error ?? response.errorCode, 0),
      errorMessage: normalizeString(response.message || response.errorMessage),
      percent: toSafeNumber(response.percent, 0),
      endConvert: response.endConvert === true || String(response.endConvert).toLowerCase() === 'true',
    }
  }
  catch {
    return null
  }
}

function signOnlyOfficeToken(payload: Record<string, unknown>, secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const body = {
    ...payload,
    iat: now,
    exp: now + 60 * 5,
  }
  const headerPart = toBase64Url(JSON.stringify(header))
  const bodyPart = toBase64Url(JSON.stringify(body))
  const signature = createHmac('sha256', secret)
    .update(`${headerPart}.${bodyPart}`)
    .digest()

  return `${headerPart}.${bodyPart}.${toBase64Url(signature)}`
}

function createRequestHeaders(input: {
  jwtSecret: string
  payload: Record<string, unknown>
}): HeadersInit {
  const tokenSecret = normalizeString(input.jwtSecret)
  if (!tokenSecret)
    return {}
  const token = signOnlyOfficeToken(input.payload, tokenSecret)
  return {
    Authorization: `Bearer ${token}`,
  }
}

function parseConverterResponse(text: string): OnlyOfficeJsonResponse {
  const parsedJson = parseOnlyOfficeJson(text)
  if (parsedJson)
    return parsedJson

  const parsedXml = parseOnlyOfficeXml(text)
  if (parsedXml)
    return parsedXml

  throw new Error('ONLYOFFICE_CONVERT_INVALID_RESPONSE')
}

async function downloadConvertedFile(fileUrl: string, timeoutMs: number): Promise<Buffer> {
  const targetUrl = normalizeString(fileUrl)
  if (!targetUrl)
    throw new Error('ONLYOFFICE_CONVERT_MISSING_FILE_URL')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
    })
    if (!response.ok)
      throw new Error(`ONLYOFFICE_CONVERT_DOWNLOAD_FAILED:${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error(`ONLYOFFICE_CONVERT_TIMEOUT:${timeoutMs}`)
    throw error
  }
  finally {
    clearTimeout(timer)
  }
}

function buildRequestPayload(input: {
  fileName: string
  sourceUrl: string
  outputType: string
}): Record<string, unknown> {
  return {
    async: false,
    filetype: extensionWithoutDot(input.fileName),
    outputtype: input.outputType,
    title: input.fileName,
    key: randomUUID(),
    url: input.sourceUrl,
  }
}

export async function convertOfficeByOnlyOffice(input: {
  fileName: string
  sourceUrl: string
  outputType?: 'pdf'
}): Promise<{ fileUrl: string, percent: number }> {
  const runtime = readRuntimeSettings()
  const endpoint = ensureTrailingSlashRemoved(runtime.onlyOffice.endpoint)
  if (!endpoint)
    throw new Error('ONLYOFFICE_ENDPOINT_NOT_CONFIGURED')

  const outputType = input.outputType || 'pdf'
  const payload = buildRequestPayload({
    fileName: input.fileName,
    sourceUrl: input.sourceUrl,
    outputType,
  })
  const requestBody = JSON.stringify(payload)
  const headers = createRequestHeaders({
    jwtSecret: runtime.onlyOffice.jwtSecret,
    payload,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), runtime.onlyOffice.timeoutMs)

  try {
    const response = await fetch(`${endpoint}/converter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json, text/xml;q=0.9, */*;q=0.8',
        ...headers,
      },
      body: requestBody,
      signal: controller.signal,
    })

    const responseText = await response.text()
    if (!response.ok)
      throw new Error(`ONLYOFFICE_CONVERT_HTTP_FAILED:${response.status}:${responseText.slice(0, 200)}`)

    const parsed = parseConverterResponse(responseText)
    const errorCode = toSafeNumber(parsed.errorCode, 0)
    if (errorCode !== 0) {
      const rawMessage = normalizeString(parsed.errorMessage)
      const detail = rawMessage && rawMessage.toLowerCase() !== 'unknown'
        ? rawMessage
        : getOnlyOfficeErrorCodeDescription(errorCode)
      throw new Error(`ONLYOFFICE_CONVERT_ERROR_${errorCode}:${detail}`)
    }

    const fileUrl = normalizeString(parsed.fileUrl)
    if (!fileUrl)
      throw new Error('ONLYOFFICE_CONVERT_MISSING_FILE_URL')

    return {
      fileUrl,
      percent: Math.max(0, Math.min(100, toSafeNumber(parsed.percent, 100))),
    }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error(`ONLYOFFICE_CONVERT_TIMEOUT:${runtime.onlyOffice.timeoutMs}`)
    throw error
  }
  finally {
    clearTimeout(timer)
  }
}

export async function convertOfficeToPdfByOnlyOffice(input: {
  fileName: string
  sourceUrl: string
}): Promise<{ pdfBuffer: Buffer, fileName: string, percent: number }> {
  const runtime = readRuntimeSettings()
  const converted = await convertOfficeByOnlyOffice({
    fileName: input.fileName,
    sourceUrl: input.sourceUrl,
    outputType: 'pdf',
  })
  const pdfBuffer = await downloadConvertedFile(converted.fileUrl, runtime.onlyOffice.timeoutMs)
  const baseName = String(input.fileName || '').replace(/\.[^.]+$/, '').trim() || randomUUID()

  return {
    pdfBuffer,
    fileName: `${baseName}.pdf`,
    percent: converted.percent,
  }
}
