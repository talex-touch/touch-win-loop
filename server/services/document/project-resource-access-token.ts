import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { readRuntimeSettings } from '~~/server/utils/env'

export type ProjectResourceAccessKind = 'source' | 'preview'

interface ProjectResourceAccessPayload {
  projectId: string
  resourceId: string
  kind: ProjectResourceAccessKind
  exp: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

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

function getSecret(): string {
  const runtime = readRuntimeSettings()
  return normalizeString(runtime.onlyOffice.jwtSecret)
}

function signPayload(payloadBase64: string, secret: string): string {
  return toBase64Url(createHmac('sha256', secret).update(payloadBase64).digest())
}

function normalizeTtlSeconds(rawTtl?: number): number {
  const runtime = readRuntimeSettings()
  const fallback = runtime.projectResource.accessUrlTtlSeconds
  const target = Number.isFinite(Number(rawTtl)) ? Number(rawTtl) : fallback
  return Math.max(60, Math.min(2 * 60 * 60, Math.round(target)))
}

function toExpireIso(expSeconds: number): string {
  return new Date(expSeconds * 1000).toISOString()
}

export function createProjectResourceAccessToken(input: {
  projectId: string
  resourceId: string
  kind: ProjectResourceAccessKind
  ttlSeconds?: number
}): { token: string, expiresAt: string } {
  const secret = getSecret()
  if (!secret)
    throw new Error('ONLYOFFICE_JWT_SECRET_NOT_CONFIGURED')

  const ttlSeconds = normalizeTtlSeconds(input.ttlSeconds)
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload: ProjectResourceAccessPayload = {
    projectId: normalizeString(input.projectId),
    resourceId: normalizeString(input.resourceId),
    kind: input.kind,
    exp,
  }
  const payloadBase64 = toBase64Url(JSON.stringify(payload))
  const signature = signPayload(payloadBase64, secret)

  return {
    token: `${payloadBase64}.${signature}`,
    expiresAt: toExpireIso(exp),
  }
}

export function verifyProjectResourceAccessToken(input: {
  token: string
  projectId: string
  resourceId: string
  kind: ProjectResourceAccessKind
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
    const parsed = JSON.parse(fromBase64Url(payloadPart).toString('utf-8')) as ProjectResourceAccessPayload
    if (normalizeString(parsed.projectId) !== normalizeString(input.projectId))
      return false
    if (normalizeString(parsed.resourceId) !== normalizeString(input.resourceId))
      return false
    if (normalizeString(parsed.kind) !== normalizeString(input.kind))
      return false

    const exp = Number(parsed.exp || 0)
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000))
      return false
    return true
  }
  catch {
    return false
  }
}
