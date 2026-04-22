import type { RuntimeSettings } from '~~/server/utils/env'
import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { readRuntimeSettings } from '~~/server/utils/env'
import { buildApiEndpoint, isHttpUrl } from '~~/shared/utils/api-url'

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
  localFilePath?: string
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
    mode: 'audio' | 'video'
  }) => Promise<RtcProviderRecordingSession>
  stopRecording: (input: {
    recordingId: string
    roomName?: string
  }) => Promise<RtcProviderRecordingSession>
  deleteRoom: (input: {
    roomName: string
  }) => Promise<RtcProviderRoom>
  resolveRecordingArtifact: (input: {
    meetingMetadata?: Record<string, unknown>
    eventPayload?: Record<string, unknown>
  }) => Promise<RtcRecordingArtifact | null>
  verifyWebhook: (input: {
    headers: Headers | Record<string, unknown>
    rawBody?: string
  }) => boolean
}

export interface RtcProviderProbeResult {
  provider: string
  endpoint: string
  ok: boolean
  statusCode?: number
  latencyMs: number
  detail: string
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

function fromBase64Url(input: string): Buffer {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
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

function normalizeArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function summarizeProbeResponse(value: unknown, fallback = '请求成功。'): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return fallback
  return normalized.replace(/\s+/g, ' ').slice(0, 240)
}

function normalizePathSegment(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')
  return normalized || fallback
}

function rewriteMeetingProviderSourceBaseUrl(rawUrl: string): string {
  const normalized = normalizeString(rawUrl)
  if (!normalized)
    return normalized

  try {
    const parsed = new URL(normalized)
    const host = normalizeString(parsed.hostname).toLowerCase()
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '0.0.0.0')
      parsed.hostname = 'host.docker.internal'
    return parsed.toString().replace(/\/+$/g, '')
  }
  catch {
    return normalized
  }
}

function buildMeetingProviderWebhookUrl(runtime: RuntimeSettings): string {
  const callbackPath = buildApiEndpoint(runtime.apiBaseUrl, '/internal/meetings/provider-events')
  const sourceBaseUrl = rewriteMeetingProviderSourceBaseUrl(runtime.onlyOffice.sourceBaseURL)
  if (!isHttpUrl(sourceBaseUrl))
    throw new Error('MEETING_PUBLIC_BASE_URL_NOT_CONFIGURED')
  return buildApiEndpoint(sourceBaseUrl, callbackPath)
}

function buildLiveKitRecordingOutputPath(input: {
  meetingId: string
  roomName: string
  mode: 'audio' | 'video'
}): string {
  const extension = input.mode === 'audio' ? 'ogg' : 'mp4'
  const meetingId = normalizePathSegment(input.meetingId, 'meeting')
  const roomName = normalizePathSegment(input.roomName, 'room')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `/tmp/winloop-meeting-egress/${meetingId}/${roomName}-${timestamp}.${extension}`
}

function resolveMimeTypeFromFileNameOrType(fileName: string, fileType: string): string {
  const normalizedType = normalizeString(fileType).toLowerCase()
  const normalizedFileName = normalizeString(fileName).toLowerCase()
  if (normalizedType === 'ogg' || normalizedFileName.endsWith('.ogg'))
    return 'audio/ogg'
  if (normalizedType === 'mp3' || normalizedFileName.endsWith('.mp3'))
    return 'audio/mpeg'
  if (normalizedType === 'm4a' || normalizedFileName.endsWith('.m4a'))
    return 'audio/mp4'
  if (normalizedType === 'webm' || normalizedFileName.endsWith('.webm'))
    return 'video/webm'
  return 'video/mp4'
}

function resolveArtifactFileName(value: string, fallback = 'meeting-recording.mp4'): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return fallback

  if (isHttpUrl(normalized) || normalized.startsWith('file://')) {
    try {
      const parsed = new URL(normalized)
      return basename(parsed.pathname || '') || fallback
    }
    catch {
      return fallback
    }
  }

  return basename(normalized) || fallback
}

function resolveLocalFilePath(value: string): string | undefined {
  const normalized = normalizeString(value)
  if (!normalized)
    return undefined
  if (normalized.startsWith('file://')) {
    try {
      return new URL(normalized).pathname || undefined
    }
    catch {
      return undefined
    }
  }
  if (isHttpUrl(normalized))
    return undefined
  return normalized
}

function verifyLiveKitWebhookToken(input: {
  token: string
  rawBody: string
  apiKey: string
  apiSecret: string
}): boolean {
  const [headerPart, payloadPart, signaturePart] = normalizeString(input.token).split('.')
  if (!headerPart || !payloadPart || !signaturePart)
    return false

  const unsigned = `${headerPart}.${payloadPart}`
  const expectedSignature = createHmac('sha256', input.apiSecret).update(unsigned).digest('base64url')
  if (expectedSignature !== signaturePart)
    return false

  try {
    const header = JSON.parse(fromBase64Url(headerPart).toString('utf8')) as Record<string, unknown>
    const payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8')) as Record<string, unknown>
    if (normalizeString(header.alg).toUpperCase() !== 'HS256')
      return false

    const nowSeconds = Math.floor(Date.now() / 1000)
    const exp = Number(payload.exp || 0)
    if (Number.isFinite(exp) && exp > 0 && nowSeconds >= exp)
      return false
    const nbf = Number(payload.nbf || 0)
    if (Number.isFinite(nbf) && nbf > 0 && nowSeconds + 5 < nbf)
      return false
    const iss = normalizeString(payload.iss)
    if (normalizeString(input.apiKey) && iss && iss !== normalizeString(input.apiKey))
      return false

    const bodyHash = createHash('sha256').update(input.rawBody).digest()
    const actualHashes = new Set([
      bodyHash.toString('hex'),
      bodyHash.toString('base64'),
      bodyHash.toString('base64url'),
    ])
    const claimedHash = normalizeString(payload.sha256)
    if (claimedHash && !actualHashes.has(claimedHash))
      return false
    return true
  }
  catch {
    return false
  }
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

async function postJsonWithTimeout(
  url: string,
  body: Record<string, unknown>,
  token: string,
  timeoutMs = 4000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs))
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  }
  finally {
    clearTimeout(timer)
  }
}

function createLiveKitGateway(runtime: RuntimeSettings): RtcProviderGateway {
  const serverUrl = normalizeString(runtime.meeting.rtc.serverUrl).replace(/\/+$/g, '')
  const apiKey = normalizeString(runtime.meeting.rtc.apiKey)
  const apiSecret = normalizeString(runtime.meeting.rtc.apiSecret)

  function assertLiveKitConfig(): void {
    if (!serverUrl || !apiKey || !apiSecret)
      throw new Error('MEETING_RTC_CONFIG_MISSING')
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

  assertLiveKitConfig()

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
      assertLiveKitConfig()
      const token = createAccessToken({
        subject: `server-recording-${randomUUID().slice(0, 8)}`,
        grants: {
          roomRecord: true,
          roomAdmin: true,
          room: input.roomName,
        },
        expiresInSeconds: 10 * 60,
      })
      const outputPath = buildLiveKitRecordingOutputPath({
        meetingId: input.meetingId,
        roomName: input.roomName,
        mode: input.mode,
      })
      const webhookUrl = buildMeetingProviderWebhookUrl(runtime)
      const response = await postJson<Record<string, unknown>>(`${serverUrl}/twirp/livekit.Egress/StartRoomCompositeEgress`, {
        room_name: input.roomName,
        layout: input.mode === 'audio' ? '' : 'speaker',
        audio_only: input.mode === 'audio',
        file_outputs: [
          {
            filepath: outputPath,
            file_type: input.mode === 'audio' ? 'OGG' : 'MP4',
          },
        ],
        webhooks: [
          {
            url: webhookUrl,
          },
        ],
      }, token)
      const egressInfo = normalizeRecord(response.egressInfo ?? response.egress_info ?? response)
      const egressId = normalizeString(egressInfo.egressId ?? egressInfo.egress_id) || `livekit-recording-${input.meetingId}`
      return {
        recordingId: egressId,
        metadata: {
          roomName: input.roomName,
          provider: 'livekit',
          pendingWebhook: true,
          egressId,
          outputPath,
          webhookUrl,
          mode: input.mode,
        },
      }
    },
    async stopRecording(input) {
      assertLiveKitConfig()
      const recordingId = normalizeString(input.recordingId)
      if (!recordingId)
        throw new Error('MEETING_RECORDING_ID_MISSING')

      const roomName = normalizeString(input.roomName)
      const token = createAccessToken({
        subject: `server-recording-stop-${randomUUID().slice(0, 8)}`,
        grants: {
          roomRecord: true,
          ...(roomName
            ? {
                roomAdmin: true,
                room: roomName,
              }
            : {}),
        },
        expiresInSeconds: 10 * 60,
      })
      const response = await postJson<Record<string, unknown>>(`${serverUrl}/twirp/livekit.Egress/StopEgress`, {
        egressId: recordingId,
      }, token)
      const egressInfo = normalizeRecord(response.egressInfo ?? response.egress_info ?? response)
      return {
        recordingId,
        metadata: {
          provider: 'livekit',
          roomName,
          egressInfo,
        },
      }
    },
    async deleteRoom(input) {
      assertLiveKitConfig()
      const roomName = normalizeString(input.roomName)
      if (!roomName)
        throw new Error('MEETING_ROOM_NAME_MISSING')

      const token = createAccessToken({
        subject: `server-room-delete-${randomUUID().slice(0, 8)}`,
        grants: {
          roomCreate: true,
        },
        expiresInSeconds: 10 * 60,
      })
      await postJson<Record<string, unknown>>(`${serverUrl}/twirp/livekit.RoomService/DeleteRoom`, {
        room: roomName,
      }, token)
      return {
        roomId: roomName,
        roomName,
        metadata: {
          provider: 'livekit',
        },
      }
    },
    async resolveRecordingArtifact(input) {
      const payload = {
        ...normalizeRecord(input.meetingMetadata),
        ...normalizeRecord(input.eventPayload),
      }
      let artifact = normalizeRecord(payload.recordingArtifact)
      if (Object.keys(artifact).length === 0) {
        const egressInfo = normalizeRecord(payload.egressInfo ?? payload.egress_info ?? payload.recordingSession)
        const fileResult = normalizeRecord(normalizeArray(egressInfo.fileResults ?? egressInfo.file_results)[0])
        const rawLocation = normalizeString(
          fileResult.location
          ?? fileResult.filename
          ?? fileResult.filepath
          ?? egressInfo.location
          ?? egressInfo.filepath,
        )
        if (rawLocation) {
          const resolvedFileName = resolveArtifactFileName(rawLocation, 'meeting-recording.mp4')
          const resolvedFileType = normalizeString(fileResult.fileType ?? fileResult.file_type)
          artifact = {
            fileName: resolvedFileName,
            mimeType: resolveMimeTypeFromFileNameOrType(resolvedFileName, resolvedFileType),
            downloadUrl: isHttpUrl(rawLocation) ? rawLocation : undefined,
            localFilePath: resolveLocalFilePath(rawLocation),
            metadata: {
              provider: 'livekit',
              egressId: normalizeString(egressInfo.egressId ?? egressInfo.egress_id),
              egressStatus: normalizeString(egressInfo.status),
              location: rawLocation,
            },
          }
        }
      }
      if (Object.keys(artifact).length === 0)
        return null
      return {
        fileName: normalizeString(artifact.fileName) || 'meeting-recording.mp4',
        mimeType: normalizeString(artifact.mimeType) || 'video/mp4',
        downloadUrl: normalizeString(artifact.downloadUrl) || undefined,
        localFilePath: normalizeString(artifact.localFilePath) || undefined,
        base64Content: normalizeString(artifact.base64Content) || undefined,
        textContent: normalizeString(artifact.textContent) || undefined,
        metadata: normalizeRecord(artifact.metadata),
      }
    },
    verifyWebhook(input) {
      const signed = readHeader(input.headers, 'authorization').replace(/^Bearer\s+/i, '')
        || readHeader(input.headers, 'authorize').replace(/^Bearer\s+/i, '')
      if (signed && normalizeString(input.rawBody)) {
        if (verifyLiveKitWebhookToken({ token: signed, rawBody: normalizeString(input.rawBody), apiKey, apiSecret })) {
          return true
        }
      }

      const configured = normalizeString(runtime.meeting.rtc.webhookSecret)
      const bearer = signed || readHeader(input.headers, 'authorization').replace(/^Bearer\s+/i, '')
      const direct = readHeader(input.headers, 'x-winloop-meeting-secret')
      if (configured)
        return bearer === configured || direct === configured
      return false
    },
  }
}

export function buildMeetingParticipantIdentity(userId: string, runtime = readRuntimeSettings()): string {
  const normalizedUserId = normalizeString(userId)
  if (!normalizedUserId)
    return `member:${randomUUID().slice(0, 12)}`

  const secret = normalizeString(runtime.meeting.rtc.apiSecret || runtime.meeting.rtc.webhookSecret || 'winloop-meeting-identity')
  return `member:${createHmac('sha256', secret).update(normalizedUserId).digest('hex').slice(0, 24)}`
}

export async function probeRtcProviderGateway(runtime = readRuntimeSettings()): Promise<RtcProviderProbeResult> {
  const provider = normalizeString(runtime.meeting.rtc.provider).toLowerCase()
  const serverUrl = normalizeString(runtime.meeting.rtc.serverUrl).replace(/\/+$/g, '')
  const endpoint = provider === 'livekit'
    ? `${serverUrl}/twirp/livekit.RoomService/ListRooms`
    : serverUrl
  const startedAt = Date.now()

  try {
    const gateway = getRtcProviderGateway(runtime)
    if (gateway.provider !== 'livekit') {
      return {
        provider: gateway.provider,
        endpoint,
        ok: false,
        latencyMs: Date.now() - startedAt,
        detail: '当前 RTC provider 暂未适配连通性探针。',
      }
    }

    const apiKey = normalizeString(runtime.meeting.rtc.apiKey)
    const apiSecret = normalizeString(runtime.meeting.rtc.apiSecret)
    const token = signJwt({
      video: {
        roomList: true,
      },
    }, {
      keyId: apiKey,
      secret: apiSecret,
      subject: `meeting-probe-${randomUUID().slice(0, 8)}`,
      expiresInSeconds: 60,
    })
    const response = await postJsonWithTimeout(endpoint, {}, token)
    const raw = await response.text()
    const latencyMs = Date.now() - startedAt
    if (!response.ok) {
      return {
        provider: gateway.provider,
        endpoint,
        ok: false,
        statusCode: response.status,
        latencyMs,
        detail: summarizeProbeResponse(raw, `LiveKit API 返回 HTTP ${response.status}。`),
      }
    }

    let roomCountText = ''
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const roomCount = normalizeArray(parsed.rooms).length
      roomCountText = `ListRooms 可达，当前返回 ${roomCount} 个房间。`
    }
    catch {
      roomCountText = summarizeProbeResponse(raw, 'LiveKit API 请求成功。')
    }

    return {
      provider: gateway.provider,
      endpoint,
      ok: true,
      statusCode: response.status,
      latencyMs,
      detail: roomCountText,
    }
  }
  catch (error: any) {
    const detail = error?.name === 'AbortError'
      ? 'LiveKit API 请求超时。'
      : summarizeProbeResponse(error?.message, 'LiveKit API 请求失败。')
    return {
      provider: provider || 'unknown',
      endpoint,
      ok: false,
      latencyMs: Date.now() - startedAt,
      detail,
    }
  }
}

export function getRtcProviderGateway(runtime = readRuntimeSettings()): RtcProviderGateway {
  const provider = normalizeString(runtime.meeting.rtc.provider).toLowerCase()
  if (!provider)
    throw new Error('MEETING_RTC_CONFIG_MISSING')
  if (provider === 'livekit')
    return createLiveKitGateway(runtime)
  throw new Error('MEETING_RTC_PROVIDER_UNSUPPORTED')
}
