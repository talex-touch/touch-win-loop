import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { readRuntimeSettings } from '~~/server/utils/env'

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value: string): Buffer {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function getSecret(): string {
  const runtime = readRuntimeSettings()
  return normalizeString(runtime.onlyOffice.jwtSecret)
}

function signPayload(rawPayload: string, secret: string): string {
  return toBase64Url(createHmac('sha256', secret).update(rawPayload).digest())
}

export function createProjectPreviewSourceToken(input: {
  documentId: string
  ttlSeconds?: number
}): string {
  const secret = getSecret()
  if (!secret)
    throw new Error('ONLYOFFICE_JWT_SECRET_NOT_CONFIGURED')

  const ttlSeconds = Math.max(60, Math.min(3600, Math.round(Number(input.ttlSeconds || 300))))
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = {
    documentId: normalizeString(input.documentId),
    exp,
  }
  const payloadBase64 = toBase64Url(JSON.stringify(payload))
  const signature = signPayload(payloadBase64, secret)
  return `${payloadBase64}.${signature}`
}

export function verifyProjectPreviewSourceToken(input: {
  token: string
  documentId: string
}): boolean {
  const secret = getSecret()
  if (!secret)
    return false

  const token = normalizeString(input.token)
  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart)
    return false

  const expectedSignature = signPayload(payloadPart, secret)
  if (expectedSignature !== signaturePart)
    return false

  try {
    const parsed = JSON.parse(fromBase64Url(payloadPart).toString('utf-8')) as Record<string, unknown>
    const exp = Number(parsed.exp || 0)
    const documentId = normalizeString(parsed.documentId)
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000))
      return false
    return documentId === normalizeString(input.documentId)
  }
  catch {
    return false
  }
}
