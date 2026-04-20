import type { RuntimeSettings } from '~~/server/utils/env'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { readRuntimeSettings } from '~~/server/utils/env'
import { buildApiEndpoint, isHttpUrl } from '~~/shared/utils/api-url'

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

export interface MeetingAsrProbeResult {
  provider: string
  endpoint: string
  ok: boolean
  statusCode?: number
  latencyMs: number
  detail: string
}

interface EmbeddedAsrParticipantState {
  participantIdentity: string
  mimeType: string
  sampleRate: number
  channels: number
  pendingChunks: Buffer[]
  pendingBytes: number
  totalBytes: number
  transcribedMs: number
  flushCount: number
  emittedCaptionCount: number
  eventSeq: number
  pipeline: Promise<void>
  lastError: string
  nextRetryAt: number
}

interface EmbeddedAsrSessionState {
  sessionId: string
  meetingId: string
  roomName: string
  startedAt: string
  participantStates: Map<string, EmbeddedAsrParticipantState>
}

interface EmbeddedAsrState {
  sessions: Map<string, EmbeddedAsrSessionState>
}

interface EmbeddedTranscriptionResult {
  text: string
  language: string
  model: string
}

const EMBEDDED_ASR_STATE_KEY = Symbol.for('winloop.meeting.embedded-asr.state.v1')
const EMBEDDED_ASR_MIN_CHUNK_MS = 4000
const EMBEDDED_ASR_RETRY_DELAY_MS = 3000
const EMBEDDED_ASR_TIMEOUT_MS = 20000
const EMBEDDED_ASR_FALLBACK_MODELS = ['gpt-4o-mini-transcribe', 'whisper-1']

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

function summarizeProbeResponse(value: unknown, fallback = '请求成功。'): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return fallback
  return normalized.replace(/\s+/g, ' ').slice(0, 240)
}

function getEmbeddedAsrState(): EmbeddedAsrState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[EMBEDDED_ASR_STATE_KEY] as EmbeddedAsrState | undefined
  if (existing)
    return existing

  const created: EmbeddedAsrState = {
    sessions: new Map(),
  }
  globalRef[EMBEDDED_ASR_STATE_KEY] = created
  return created
}

function parsePcmMimeType(rawMimeType: unknown): {
  mimeType: string
  sampleRate: number
  channels: number
} {
  const normalized = normalizeString(rawMimeType).toLowerCase()
  const rateMatch = normalized.match(/(?:^|[;\s])rate=(\d+)/)
  const channelsMatch = normalized.match(/(?:^|[;\s])channels=(\d+)/)
  return {
    mimeType: normalized || 'audio/pcm;channels=1;encoding=s16le',
    sampleRate: Math.max(8000, Math.min(96000, Number(rateMatch?.[1] || 48000))),
    channels: Math.max(1, Math.min(2, Number(channelsMatch?.[1] || 1))),
  }
}

function estimatePcmDurationMs(byteLength: number, sampleRate: number, channels: number): number {
  const bytes = Math.max(0, Number(byteLength || 0))
  const rate = Math.max(1, Number(sampleRate || 48000))
  const channelCount = Math.max(1, Number(channels || 1))
  return Math.round(bytes / (rate * channelCount * 2) * 1000)
}

function buildWavBuffer(pcmBuffer: Buffer, sampleRate: number, channels: number): Buffer {
  const byteRate = sampleRate * channels * 2
  const blockAlign = channels * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcmBuffer.byteLength, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcmBuffer.byteLength, 40)
  return Buffer.concat([header, pcmBuffer])
}

function buildSineWavePcmBuffer(input: {
  durationMs: number
  sampleRate: number
  frequencyHz: number
  amplitude?: number
}): Buffer {
  const sampleRate = Math.max(8000, Math.min(48000, Math.round(Number(input.sampleRate || 16000))))
  const durationMs = Math.max(100, Math.min(3000, Math.round(Number(input.durationMs || 800))))
  const frameCount = Math.max(1, Math.round(sampleRate * durationMs / 1000))
  const frequencyHz = Math.max(80, Math.min(1600, Number(input.frequencyHz || 440)))
  const amplitude = Math.max(0.05, Math.min(0.8, Number(input.amplitude || 0.25)))
  const pcm = Buffer.alloc(frameCount * 2)

  for (let index = 0; index < frameCount; index += 1) {
    const sample = Math.sin(2 * Math.PI * frequencyHz * index / sampleRate)
    pcm.writeInt16LE(Math.round(sample * amplitude * 0x7FFF), index * 2)
  }

  return pcm
}

function buildAsrProviderEndpoint(serviceUrl: string, suffix: '/healthz' | '/models' | '/audio/transcriptions'): string {
  const normalized = normalizeString(serviceUrl).replace(/\/+$/g, '')
  if (!normalized)
    return ''
  if (normalized.endsWith(suffix))
    return normalized
  return `${normalized}${suffix}`
}

function rewriteLoopbackSourceBaseUrl(rawUrl: string): string {
  const normalized = normalizeString(rawUrl)
  if (!normalized)
    return ''

  try {
    const parsed = new URL(normalized)
    const host = normalizeString(parsed.hostname).toLowerCase()
    if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1')
      parsed.hostname = 'localhost'
    return parsed.toString().replace(/\/+$/g, '')
  }
  catch {
    return normalized
  }
}

function buildMeetingAsrCallbackUrl(runtime: RuntimeSettings): string {
  const callbackPath = buildApiEndpoint(runtime.apiBaseUrl, '/internal/meetings/asr-events')
  const sourceBaseUrl = rewriteLoopbackSourceBaseUrl(runtime.onlyOffice.sourceBaseURL)
  if (!isHttpUrl(sourceBaseUrl))
    throw new Error('MEETING_PUBLIC_BASE_URL_NOT_CONFIGURED')
  return buildApiEndpoint(sourceBaseUrl, callbackPath)
}

function createEmbeddedParticipantState(participantIdentity: string, mimeType: unknown): EmbeddedAsrParticipantState {
  const pcm = parsePcmMimeType(mimeType)
  return {
    participantIdentity: normalizeString(participantIdentity) || 'unknown',
    mimeType: pcm.mimeType,
    sampleRate: pcm.sampleRate,
    channels: pcm.channels,
    pendingChunks: [],
    pendingBytes: 0,
    totalBytes: 0,
    transcribedMs: 0,
    flushCount: 0,
    emittedCaptionCount: 0,
    eventSeq: 0,
    pipeline: Promise.resolve(),
    lastError: '',
    nextRetryAt: 0,
  }
}

function getOrCreateEmbeddedParticipantState(
  session: EmbeddedAsrSessionState,
  participantIdentity: string,
  mimeType: unknown,
): EmbeddedAsrParticipantState {
  const key = normalizeString(participantIdentity) || 'unknown'
  const existing = session.participantStates.get(key)
  if (existing) {
    const pcm = parsePcmMimeType(mimeType || existing.mimeType)
    existing.mimeType = pcm.mimeType
    existing.sampleRate = pcm.sampleRate
    existing.channels = pcm.channels
    return existing
  }

  const created = createEmbeddedParticipantState(key, mimeType)
  session.participantStates.set(key, created)
  return created
}

async function fetchWithTimeout(input: {
  url: string
  init?: RequestInit
  timeoutMs?: number
}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(input.timeoutMs || EMBEDDED_ASR_TIMEOUT_MS)))
  try {
    return await fetch(input.url, {
      ...(input.init || {}),
      signal: controller.signal,
    })
  }
  finally {
    clearTimeout(timer)
  }
}

async function transcribeOpenAiCompatibleChunk(input: {
  runtime: RuntimeSettings
  sessionId: string
  participantIdentity: string
  eventSeq: number
  wavBuffer: Buffer
}): Promise<EmbeddedTranscriptionResult> {
  const endpoint = buildAsrProviderEndpoint(input.runtime.meeting.asr.serviceUrl, '/audio/transcriptions')
  const apiKey = normalizeString(input.runtime.meeting.asr.apiKey)
  let lastError: Error | null = null

  for (const model of EMBEDDED_ASR_FALLBACK_MODELS) {
    const wavBytes = new Uint8Array(input.wavBuffer.byteLength)
    wavBytes.set(input.wavBuffer)
    const formData = new FormData()
    formData.set('model', model)
    formData.set('file', new Blob([wavBytes], { type: 'audio/wav' }), `${input.sessionId}-${input.participantIdentity}-${input.eventSeq}.wav`)

    try {
      const response = await fetchWithTimeout({
        url: endpoint,
        init: {
          method: 'POST',
          headers: apiKey
            ? {
                authorization: `Bearer ${apiKey}`,
              }
            : undefined,
          body: formData,
        },
      })
      const raw = await response.text().catch(() => '')
      if (!response.ok) {
        const error = new Error(`OPENAI_COMPATIBLE_ASR_HTTP_${response.status}:${summarizeProbeResponse(raw, 'request failed')}`) as Error & { statusCode?: number }
        error.statusCode = response.status
        throw error
      }

      const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}
      return {
        text: normalizeString(payload.text),
        language: normalizeString(payload.language),
        model,
      }
    }
    catch (error: any) {
      lastError = error instanceof Error ? error : new Error('OPENAI_COMPATIBLE_ASR_FAILED')
      const statusCode = Number(error?.statusCode || 0)
      if (statusCode === 400 || statusCode === 404)
        continue
      break
    }
  }

  throw lastError || new Error('OPENAI_COMPATIBLE_ASR_FAILED')
}

async function emitEmbeddedCaptionEvent(input: {
  runtime: RuntimeSettings
  meetingId: string
  participantIdentity: string
  text: string
  language: string
  startedAtMs: number
  endedAtMs: number
  eventId: string
}): Promise<void> {
  const callbackUrl = buildMeetingAsrCallbackUrl(input.runtime)
  const callbackSecret = normalizeString(input.runtime.meeting.asr.webhookSecret)
  const response = await fetchWithTimeout({
    url: callbackUrl,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(callbackSecret
          ? {
              'authorization': `Bearer ${callbackSecret}`,
              'x-winloop-asr-secret': callbackSecret,
            }
          : {}),
      },
      body: JSON.stringify({
        meetingId: input.meetingId,
        eventType: 'final',
        participantIdentity: input.participantIdentity,
        displayName: input.participantIdentity,
        speakerLabel: input.participantIdentity,
        text: input.text,
        language: input.language,
        confidence: 0.9,
        startedAtMs: input.startedAtMs,
        endedAtMs: input.endedAtMs,
        eventId: input.eventId,
      }),
    },
  })

  if (!response.ok) {
    const raw = await response.text().catch(() => '')
    throw new Error(`EMBEDDED_ASR_CALLBACK_HTTP_${response.status}:${summarizeProbeResponse(raw, 'callback failed')}`)
  }
}

async function flushEmbeddedParticipantChunks(
  runtime: RuntimeSettings,
  session: EmbeddedAsrSessionState,
  participant: EmbeddedAsrParticipantState,
  options: { force?: boolean } = {},
): Promise<void> {
  const force = Boolean(options.force)
  if (participant.pendingBytes <= 0)
    return
  if (!force && Date.now() < participant.nextRetryAt)
    return

  const pendingDurationMs = estimatePcmDurationMs(participant.pendingBytes, participant.sampleRate, participant.channels)
  if (!force && pendingDurationMs < EMBEDDED_ASR_MIN_CHUNK_MS)
    return

  const merged = Buffer.concat(participant.pendingChunks)
  participant.pendingChunks = []
  participant.pendingBytes = 0

  try {
    const durationMs = estimatePcmDurationMs(merged.byteLength, participant.sampleRate, participant.channels)
    if (durationMs <= 0)
      return

    const startAtMs = participant.transcribedMs
    const endAtMs = participant.transcribedMs + durationMs
    const transcript = await transcribeOpenAiCompatibleChunk({
      runtime,
      sessionId: session.sessionId,
      participantIdentity: participant.participantIdentity,
      eventSeq: participant.eventSeq + 1,
      wavBuffer: buildWavBuffer(merged, participant.sampleRate, participant.channels),
    })

    participant.flushCount += 1
    participant.lastError = ''
    participant.transcribedMs = endAtMs

    const text = normalizeString(transcript.text)
    if (!text)
      return

    participant.eventSeq += 1
    participant.emittedCaptionCount += 1

    await emitEmbeddedCaptionEvent({
      runtime,
      meetingId: session.meetingId,
      participantIdentity: participant.participantIdentity,
      text,
      language: transcript.language,
      startedAtMs: startAtMs,
      endedAtMs: endAtMs,
      eventId: `${session.sessionId}:${participant.participantIdentity}:${participant.eventSeq}`,
    })
  }
  catch (error) {
    participant.pendingChunks.unshift(merged)
    participant.pendingBytes += merged.byteLength
    participant.nextRetryAt = Date.now() + EMBEDDED_ASR_RETRY_DELAY_MS
    participant.lastError = error instanceof Error ? normalizeString(error.message) : 'embedded asr failed'
    console.error(
      `[meeting-asr] embedded transcription failed session=${session.sessionId} participant=${participant.participantIdentity} error=${participant.lastError}`,
    )
  }
}

function queueEmbeddedParticipantFlush(
  runtime: RuntimeSettings,
  session: EmbeddedAsrSessionState,
  participant: EmbeddedAsrParticipantState,
  options: { force?: boolean } = {},
): Promise<void> {
  participant.pipeline = participant.pipeline
    .catch(() => undefined)
    .then(async () => {
      await flushEmbeddedParticipantChunks(runtime, session, participant, options)
    })
  return participant.pipeline
}

function verifyAsrWebhookSecret(
  runtime: RuntimeSettings,
  input: {
    headers: Headers | Record<string, unknown>
  },
): boolean {
  const configured = normalizeString(runtime.meeting.asr.webhookSecret)
  if (!configured)
    return true
  const bearer = readHeader(input.headers, 'authorization').replace(/^Bearer\s+/i, '')
  const direct = readHeader(input.headers, 'x-winloop-asr-secret')
  return bearer === configured || direct === configured
}

function createHttpMeetingAsrGateway(runtime: RuntimeSettings): MeetingAsrGateway {
  const serviceUrl = normalizeString(runtime.meeting.asr.serviceUrl).replace(/\/+$/g, '')
  const apiKey = normalizeString(runtime.meeting.asr.apiKey)

  if (!serviceUrl)
    throw new Error('MEETING_ASR_SERVICE_URL_MISSING')

  async function post(path: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${serviceUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey
          ? {
              authorization: `Bearer ${apiKey}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    })
    if (!response.ok)
      throw new Error(`MEETING_ASR_HTTP_${response.status}`)
  }

  return {
    provider: 'http',
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
    verifyWebhook(input) {
      return verifyAsrWebhookSecret(runtime, input)
    },
  }
}

function createOpenAiCompatibleMeetingAsrGateway(runtime: RuntimeSettings): MeetingAsrGateway {
  const serviceUrl = normalizeString(runtime.meeting.asr.serviceUrl).replace(/\/+$/g, '')
  if (!serviceUrl)
    throw new Error('MEETING_ASR_SERVICE_URL_MISSING')

  const state = getEmbeddedAsrState()

  return {
    provider: 'openai-compatible',
    async startSession(input) {
      const sessionId = `asr-${randomUUID()}`
      state.sessions.set(sessionId, {
        sessionId,
        meetingId: input.meetingId,
        roomName: input.roomName,
        startedAt: new Date().toISOString(),
        participantStates: new Map(),
      })
      return {
        sessionId,
        metadata: {
          callbackUrl: buildMeetingAsrCallbackUrl(runtime),
          transport: 'embedded_openai_compatible',
        },
      }
    },
    async pushAudioFrame(input) {
      const session = state.sessions.get(normalizeString(input.sessionId))
      if (!session)
        throw new Error('MEETING_ASR_SESSION_NOT_FOUND')

      const pcmBuffer = normalizeString(input.chunkBase64)
        ? Buffer.from(normalizeString(input.chunkBase64), 'base64')
        : Buffer.alloc(0)
      const participant = getOrCreateEmbeddedParticipantState(
        session,
        normalizeString(input.participantIdentity) || 'unknown',
        input.mimeType,
      )

      participant.pendingChunks.push(pcmBuffer)
      participant.pendingBytes += pcmBuffer.byteLength
      participant.totalBytes += pcmBuffer.byteLength
      void queueEmbeddedParticipantFlush(runtime, session, participant, { force: false })
    },
    async finishSession(input) {
      const session = state.sessions.get(normalizeString(input.sessionId))
      if (!session)
        return

      await Promise.all(
        [...session.participantStates.values()].map(participant =>
          queueEmbeddedParticipantFlush(runtime, session, participant, { force: true })),
      )
      state.sessions.delete(session.sessionId)
    },
    verifyWebhook(input) {
      return verifyAsrWebhookSecret(runtime, input)
    },
  }
}

export function getMeetingAsrGateway(runtime = readRuntimeSettings()): MeetingAsrGateway {
  const provider = normalizeString(runtime.meeting.asr.provider).toLowerCase()
  if (!provider)
    throw new Error('MEETING_ASR_CONFIG_MISSING')
  if (provider === 'http')
    return createHttpMeetingAsrGateway(runtime)
  if (provider === 'openai-compatible')
    return createOpenAiCompatibleMeetingAsrGateway(runtime)
  throw new Error('MEETING_ASR_PROVIDER_UNSUPPORTED')
}

export async function probeMeetingAsrGateway(runtime = readRuntimeSettings()): Promise<MeetingAsrProbeResult> {
  const provider = normalizeString(runtime.meeting.asr.provider).toLowerCase()
  const serviceUrl = normalizeString(runtime.meeting.asr.serviceUrl).replace(/\/+$/g, '')
  const endpoint = provider === 'openai-compatible'
    ? buildAsrProviderEndpoint(serviceUrl, '/audio/transcriptions')
    : buildAsrProviderEndpoint(serviceUrl, '/healthz')
  const startedAt = Date.now()

  try {
    const gateway = getMeetingAsrGateway(runtime)
    if (gateway.provider === 'openai-compatible') {
      const transcript = await transcribeOpenAiCompatibleChunk({
        runtime,
        sessionId: 'probe',
        participantIdentity: 'probe',
        eventSeq: 1,
        wavBuffer: buildWavBuffer(
          buildSineWavePcmBuffer({
            durationMs: 800,
            sampleRate: 16000,
            frequencyHz: 440,
          }),
          16000,
          1,
        ),
      })
      const latencyMs = Date.now() - startedAt
      return {
        provider: gateway.provider,
        endpoint,
        ok: true,
        statusCode: 200,
        latencyMs,
        detail: `OpenAI Compatible ASR 真实转写样本成功，model=${transcript.model}，text=${transcript.text ? transcript.text.slice(0, 80) : '（空文本）'}.`,
      }
    }

    const response = await fetchWithTimeout({
      url: endpoint,
      init: {
        headers: runtime.meeting.asr.apiKey
          ? {
              authorization: `Bearer ${runtime.meeting.asr.apiKey}`,
            }
          : undefined,
      },
      timeoutMs: 4000,
    })
    const raw = await response.text().catch(() => '')
    const latencyMs = Date.now() - startedAt

    if (!response.ok) {
      return {
        provider: gateway.provider,
        endpoint,
        ok: false,
        statusCode: response.status,
        latencyMs,
        detail: summarizeProbeResponse(raw, `ASR 探针返回 HTTP ${response.status}。`),
      }
    }

    let detail = ''
    try {
      const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {}
      detail = `ASR 健康检查通过，activeSessionCount=${Number(parsed.activeSessionCount || 0)}，transcriptionEnabled=${Boolean(parsed.transcriptionEnabled)}.`
    }
    catch {
      detail = summarizeProbeResponse(raw, 'ASR 健康检查通过。')
    }

    return {
      provider: gateway.provider,
      endpoint,
      ok: true,
      statusCode: response.status,
      latencyMs,
      detail,
    }
  }
  catch (error: any) {
    const detail = error?.name === 'AbortError'
      ? 'ASR 健康检查超时。'
      : summarizeProbeResponse(error?.message, 'ASR 健康检查失败。')
    return {
      provider: provider || 'unknown',
      endpoint,
      ok: false,
      latencyMs: Date.now() - startedAt,
      detail,
    }
  }
}
