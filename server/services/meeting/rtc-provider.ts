import type { RuntimeSettings } from '~~/server/utils/env'
import { Buffer } from 'node:buffer'
import { createHmac, randomUUID } from 'node:crypto'
import { readRuntimeSettings } from '~~/server/utils/env'

export interface RtcProviderRoom {
  roomId: string
  roomName: string
  metadata?: Record<string, unknown>
}

export interface RtcProviderJoinToken {
  token: string
  expiresAt: string
  participantIdentity: string
  joinUrl?: string
}

export interface RtcProviderAudioSubscription {
  subscriptionId: string
  metadata?: Record<string, unknown>
}

export interface RtcProviderRecordingSession {
  recordingId: string
  metadata?: Record<string, unknown>
}

export interface RtcRecordingArtifact {
  fileName: string
  mimeType: string
  downloadUrl?: string
  base64Content?: string
  textContent?: string
  metadata?: Record<string, unknown>
}

export interface RtcProviderGateway {
  provider: string
  createRoom: (input: {
    projectId: string
    meetingId: string
    title: string
    mode: 'audio' | 'video'
  }) => Promise<RtcProviderRoom>
  issueJoinToken: (input: {
    roomName: string
    participantIdentity: string
    participantName: string
    metadata?: Record<string, unknown>
  }) => Promise<RtcProviderJoinToken>
  subscribeOrEgressAudio: (input: {
    roomName: string
    meetingId: string
  }) => Promise<RtcProviderAudioSubscription>
  startRecording: (input: {
    roomName: string
    meetingId: string
  }) => Promise<RtcProviderRecordingSession>
  resolveRecordingArtifact: (input: {
    meetingMetadata?: Record<string, unknown>
    eventPayload?: Record<string, unknown>
  }) => Promise<RtcRecordingArtifact | null>
  verifyWebhook: (input: {
    headers: Headers | Record<string, unknown>
  }) => boolean
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.isBuffer(input)
    ? input.toString('base64url')
    : Buffer.from(input).toString('base64url')
}

function signJwt(
  payload: Record<string, unknown>,
  input: {
    keyId?: string
    secret: string
    subject?: string
    expiresInSeconds?: number
  },
): string {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }
  const body = {
    ...payload,
    iss: normalizeString(input.keyId) || undefined,
    sub: normalizeString(input.subject) || undefined,
    iat: nowSeconds,
    nbf: nowSeconds - 5,
    exp: nowSeconds + Math.max(60, Math.trunc(Number(input.expiresInSeconds || 3600))),
  }
  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(body))}`
  const signature = createHmac('sha256', input.secret).update(unsigned).digest('base64url')
  return `${unsigned}.${signature}`
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

function buildJoinUrl(runtime: RuntimeSettings, payload: {
  roomName: string
  token: string
  participantIdentity: string
  participantName: string
}): string {
  const embedBaseUrl = normalizeString(runtime.meeting.rtc.embedBaseUrl)
  if (!embedBaseUrl)
    return ''

  const url = new URL(embedBaseUrl)
  url.searchParams.set('room', payload.roomName)
  url.searchParams.set('token', payload.token)
  url.searchParams.set('participantIdentity', payload.participantIdentity)
  url.searchParams.set('participantName', payload.participantName)
  if (runtime.meeting.rtc.serverUrl)
    url.searchParams.set('serverUrl', runtime.meeting.rtc.serverUrl)
  return url.toString()
}

async function postJson<T>(url: string, body: Record<string, unknown>, token: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok)
    throw new Error(`RTC_PROVIDER_HTTP_${response.status}`)
  return await response.json() as T
}

function createMockGateway(runtime: RuntimeSettings): RtcProviderGateway {
  const signingSecret = runtime.meeting.rtc.apiSecret || 'winloop-meeting-mock'
  return {
    provider: 'mock',
    async createRoom(input) {
      const roomName = `${runtime.meeting.rtc.roomPrefix}-${input.projectId.slice(0, 8)}-${input.meetingId.slice(0, 8)}`
      return {
        roomId: roomName,
        roomName,
        metadata: {
          mocked: true,
        },
      }
    },
    async issueJoinToken(input) {
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      const token = signJwt({
        room: input.roomName,
        name: input.participantName,
        metadata: normalizeRecord(input.metadata),
        provider: 'mock',
      }, {
        keyId: 'mock',
        subject: input.participantIdentity,
        secret: signingSecret,
        expiresInSeconds: 2 * 60 * 60,
      })

      return {
        token,
        expiresAt,
        participantIdentity: input.participantIdentity,
        joinUrl: buildJoinUrl(runtime, {
          roomName: input.roomName,
          token,
          participantIdentity: input.participantIdentity,
          participantName: input.participantName,
        }) || undefined,
      }
    },
    async subscribeOrEgressAudio(input) {
      return {
        subscriptionId: `mock-audio-${input.meetingId}`,
        metadata: {
          roomName: input.roomName,
        },
      }
    },
    async startRecording(input) {
      return {
        recordingId: `mock-recording-${input.meetingId}`,
        metadata: {
          roomName: input.roomName,
        },
      }
    },
    async resolveRecordingArtifact(input) {
      const payload = {
        ...normalizeRecord(input.meetingMetadata),
        ...normalizeRecord(input.eventPayload),
      }
      const artifact = normalizeRecord(payload.recordingArtifact)
      if (Object.keys(artifact).length === 0)
        return null
      return {
        fileName: normalizeString(artifact.fileName) || 'meeting-recording.txt',
        mimeType: normalizeString(artifact.mimeType) || 'text/plain',
        downloadUrl: normalizeString(artifact.downloadUrl) || undefined,
        base64Content: normalizeString(artifact.base64Content) || undefined,
        textContent: normalizeString(artifact.textContent) || undefined,
        metadata: normalizeRecord(artifact.metadata),
      }
    },
    verifyWebhook(input) {
      const configured = normalizeString(runtime.meeting.rtc.webhookSecret)
      if (!configured)
        return true
      const bearer = readHeader(input.headers, 'authorization').replace(/^Bearer\s+/i, '')
      const direct = readHeader(input.headers, 'x-winloop-meeting-secret')
      return bearer === configured || direct === configured
    },
  }
}

function createLiveKitGateway(runtime: RuntimeSettings): RtcProviderGateway {
  const serverUrl = normalizeString(runtime.meeting.rtc.serverUrl).replace(/\/+$/g, '')
  const apiKey = normalizeString(runtime.meeting.rtc.apiKey)
  const apiSecret = normalizeString(runtime.meeting.rtc.apiSecret)

  function assertLiveKitConfig(): void {
    if (!serverUrl || !apiKey || !apiSecret)
      throw new Error('LIVEKIT_CONFIG_MISSING')
  }

  function createAccessToken(
    input: {
      subject: string
      grants: Record<string, unknown>
      name?: string
      metadata?: Record<string, unknown>
      expiresInSeconds?: number
    },
  ): string {
    return signJwt({
      name: normalizeString(input.name) || undefined,
      metadata: JSON.stringify(normalizeRecord(input.metadata)),
      video: input.grants,
    }, {
      keyId: apiKey,
      secret: apiSecret,
      subject: input.subject,
      expiresInSeconds: input.expiresInSeconds || 2 * 60 * 60,
    })
  }

  return {
    provider: 'livekit',
    async createRoom(input) {
      assertLiveKitConfig()
      const roomName = `${runtime.meeting.rtc.roomPrefix}-${input.projectId.slice(0, 8)}-${input.meetingId.slice(0, 8)}`
      const token = createAccessToken({
        subject: `server-${randomUUID().slice(0, 8)}`,
        grants: {
          roomCreate: true,
          roomList: true,
          roomRecord: true,
        },
        expiresInSeconds: 10 * 60,
      })
      await postJson(`${serverUrl}/twirp/livekit.RoomService/CreateRoom`, {
        name: roomName,
        emptyTimeout: 10 * 60,
        maxParticipants: 25,
        metadata: JSON.stringify({
          projectId: input.projectId,
          meetingId: input.meetingId,
          title: input.title,
          mode: input.mode,
        }),
      }, token)

      return {
        roomId: roomName,
        roomName,
      }
    },
    async issueJoinToken(input) {
      assertLiveKitConfig()
      const token = createAccessToken({
        subject: input.participantIdentity,
        name: input.participantName,
        metadata: input.metadata,
        grants: {
          roomJoin: true,
          room: input.roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      })
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      return {
        token,
        expiresAt,
        participantIdentity: input.participantIdentity,
        joinUrl: buildJoinUrl(runtime, {
          roomName: input.roomName,
          token,
          participantIdentity: input.participantIdentity,
          participantName: input.participantName,
        }) || undefined,
      }
    },
    async subscribeOrEgressAudio(input) {
      return {
        subscriptionId: `livekit-audio-${input.meetingId}`,
        metadata: {
          roomName: input.roomName,
          provider: 'livekit',
        },
      }
    },
    async startRecording(input) {
      return {
        recordingId: `livekit-recording-${input.meetingId}`,
        metadata: {
          roomName: input.roomName,
          provider: 'livekit',
          pendingWebhook: true,
        },
      }
    },
    async resolveRecordingArtifact(input) {
      const payload = {
        ...normalizeRecord(input.meetingMetadata),
        ...normalizeRecord(input.eventPayload),
      }
      const artifact = normalizeRecord(payload.recordingArtifact)
      if (Object.keys(artifact).length === 0)
        return null
      return {
        fileName: normalizeString(artifact.fileName) || 'meeting-recording.mp4',
        mimeType: normalizeString(artifact.mimeType) || 'video/mp4',
        downloadUrl: normalizeString(artifact.downloadUrl) || undefined,
        base64Content: normalizeString(artifact.base64Content) || undefined,
        textContent: normalizeString(artifact.textContent) || undefined,
        metadata: normalizeRecord(artifact.metadata),
      }
    },
    verifyWebhook(input) {
      const configured = normalizeString(runtime.meeting.rtc.webhookSecret)
      if (!configured)
        return true
      const bearer = readHeader(input.headers, 'authorization').replace(/^Bearer\s+/i, '')
      const direct = readHeader(input.headers, 'x-winloop-meeting-secret')
      return bearer === configured || direct === configured
    },
  }
}

export function buildMeetingParticipantIdentity(userId: string): string {
  const normalizedUserId = normalizeString(userId)
  if (!normalizedUserId)
    return `member:${randomUUID().slice(0, 12)}`

  const runtime = readRuntimeSettings()
  const secret = normalizeString(runtime.meeting.rtc.apiSecret || runtime.meeting.rtc.webhookSecret || 'winloop-meeting-identity')
  return `member:${createHmac('sha256', secret).update(normalizedUserId).digest('hex').slice(0, 24)}`
}

export function getRtcProviderGateway(runtime = readRuntimeSettings()): RtcProviderGateway {
  const provider = normalizeString(runtime.meeting.rtc.provider).toLowerCase()
  if (provider === 'livekit')
    return createLiveKitGateway(runtime)
  return createMockGateway(runtime)
}
