import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { readRuntimeSettings } from '~~/server/utils/env'

export interface MeetingGuestTokenPayload {
  meetingId: string
  shareId: string
  guestDisplayName: string
  providerIdentity: string
  role: 'guest'
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
  return normalizeString(runtime.meeting.rtc.apiSecret)
    || normalizeString(runtime.onlyOffice.jwtSecret)
    || 'winloop-meeting-guest'
}

function signPayload(payloadBase64: string, secret: string): string {
  return toBase64Url(createHmac('sha256', secret).update(payloadBase64).digest())
}

function normalizeTtlSeconds(rawTtl?: number): number {
  const target = Number.isFinite(Number(rawTtl)) ? Number(rawTtl) : 15 * 60
  return Math.max(60, Math.min(2 * 60 * 60, Math.round(target)))
}

export function createMeetingGuestToken(input: {
  meetingId: string
  shareId: string
  guestDisplayName: string
  providerIdentity: string
  ttlSeconds?: number
}): { token: string, expiresAt: string } {
  const ttlSeconds = normalizeTtlSeconds(input.ttlSeconds)
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload: MeetingGuestTokenPayload = {
    meetingId: normalizeString(input.meetingId),
    shareId: normalizeString(input.shareId),
    guestDisplayName: normalizeString(input.guestDisplayName),
    providerIdentity: normalizeString(input.providerIdentity),
    role: 'guest',
    exp,
  }
  const payloadBase64 = toBase64Url(JSON.stringify(payload))
  const signature = signPayload(payloadBase64, getSecret())
  return {
    token: `${payloadBase64}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  }
}

export function verifyMeetingGuestToken(token: string): MeetingGuestTokenPayload | null {
  const normalized = normalizeString(token)
  const [payloadPart, signaturePart] = normalized.split('.')
  if (!payloadPart || !signaturePart)
    return null

  const expectedSignature = signPayload(payloadPart, getSecret())
  if (expectedSignature !== signaturePart)
    return null

  try {
    const parsed = JSON.parse(fromBase64Url(payloadPart).toString('utf-8')) as MeetingGuestTokenPayload
    if (normalizeString(parsed.role) !== 'guest')
      return null
    if (!normalizeString(parsed.meetingId) || !normalizeString(parsed.shareId) || !normalizeString(parsed.providerIdentity))
      return null
    const exp = Number(parsed.exp || 0)
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000))
      return null
    return {
      meetingId: normalizeString(parsed.meetingId),
      shareId: normalizeString(parsed.shareId),
      guestDisplayName: normalizeString(parsed.guestDisplayName) || 'Guest',
      providerIdentity: normalizeString(parsed.providerIdentity),
      role: 'guest',
      exp,
    }
  }
  catch {
    return null
  }
}
