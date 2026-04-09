import type { RuntimeSettings } from '~~/server/utils/env'
import { randomUUID } from 'node:crypto'
import { readRuntimeSettings } from '~~/server/utils/env'

export interface MeetingAsrSession {
  sessionId: string
  metadata?: Record<string, unknown>
}

export interface MeetingAsrGateway {
  provider: string
  startSession: (input: {
    meetingId: string
    roomName: string
  }) => Promise<MeetingAsrSession>
  pushAudioFrame: (input: {
    sessionId: string
    participantIdentity?: string
    chunkBase64: string
    mimeType?: string
  }) => Promise<void>
  finishSession: (input: {
    sessionId: string
  }) => Promise<void>
  verifyWebhook: (input: {
    headers: Headers | Record<string, unknown>
  }) => boolean
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function readHeader(headers: Headers | Record<string, unknown>, name: string): string {
  if (headers instanceof Headers)
    return normalizeString(headers.get(name))

  const normalizedName = name.toLowerCase()
  const record = headers as Record<string, unknown>
  const value = record[normalizedName] ?? record[name]
  if (Array.isArray(value))
    return normalizeString(value[0])
  return normalizeString(value)
}

function createMockMeetingAsrGateway(runtime: RuntimeSettings): MeetingAsrGateway {
  return {
    provider: 'mock',
    async startSession(input) {
      return {
        sessionId: `mock-asr-${input.meetingId}-${Date.now()}`,
        metadata: {
          roomName: input.roomName,
        },
      }
    },
    async pushAudioFrame() {},
    async finishSession() {},
    verifyWebhook(input) {
      const configured = normalizeString(runtime.meeting.asr.webhookSecret)
      if (!configured)
        return true
      const bearer = readHeader(input.headers, 'authorization').replace(/^Bearer\s+/i, '')
      const direct = readHeader(input.headers, 'x-winloop-asr-secret')
      return bearer === configured || direct === configured
    },
  }
}

function createHttpMeetingAsrGateway(runtime: RuntimeSettings): MeetingAsrGateway {
  const serviceUrl = normalizeString(runtime.meeting.asr.serviceUrl).replace(/\/+$/g, '')
  const apiKey = normalizeString(runtime.meeting.asr.apiKey)

  async function post(path: string, body: Record<string, unknown>): Promise<void> {
    if (!serviceUrl)
      throw new Error('MEETING_ASR_SERVICE_URL_MISSING')
    const response = await fetch(`${serviceUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': apiKey ? `Bearer ${apiKey}` : '',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok)
      throw new Error(`MEETING_ASR_HTTP_${response.status}`)
  }

  return {
    provider: normalizeString(runtime.meeting.asr.provider) || 'http',
    async startSession(input) {
      const sessionId = `asr-${randomUUID()}`
      await post('/sessions/start', {
        sessionId,
        meetingId: input.meetingId,
        roomName: input.roomName,
      })
      return {
        sessionId,
      }
    },
    async pushAudioFrame(input) {
      await post('/sessions/frame', input)
    },
    async finishSession(input) {
      await post('/sessions/finish', input)
    },
    verifyWebhook(asrInput) {
      const configured = normalizeString(runtime.meeting.asr.webhookSecret)
      if (!configured)
        return true
      const bearer = readHeader(asrInput.headers, 'authorization').replace(/^Bearer\s+/i, '')
      const direct = readHeader(asrInput.headers, 'x-winloop-asr-secret')
      return bearer === configured || direct === configured
    },
  }
}

export function getMeetingAsrGateway(runtime = readRuntimeSettings()): MeetingAsrGateway {
  const provider = normalizeString(runtime.meeting.asr.provider).toLowerCase()
  if (provider === 'mock' || !provider)
    return createMockMeetingAsrGateway(runtime)
  return createHttpMeetingAsrGateway(runtime)
}
