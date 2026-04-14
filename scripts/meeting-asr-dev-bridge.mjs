#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import process from 'node:process'
import { parseArgs } from 'node:util'

function normalizeText(value) {
  return String(value || '').trim()
}

function toInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.max(min, Math.min(max, parsed))
}

function readAuthorizationToken(headers) {
  const raw = normalizeText(headers.authorization)
  return raw.replace(/^Bearer\s+/i, '')
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

function parseJsonObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw
}

function parsePcmMimeType(rawMimeType) {
  const normalized = normalizeText(rawMimeType).toLowerCase()
  const rateMatch = normalized.match(/(?:^|[;\s])rate=(\d+)/)
  const channelsMatch = normalized.match(/(?:^|[;\s])channels=(\d+)/)
  return {
    mimeType: normalized || 'audio/pcm;channels=1;encoding=s16le',
    sampleRate: Math.max(8000, Math.min(96000, toInteger(rateMatch?.[1], 48000, 8000, 96000))),
    channels: Math.max(1, Math.min(2, toInteger(channelsMatch?.[1], 1, 1, 2))),
  }
}

function estimatePcmDurationMs(byteLength, sampleRate, channels) {
  const bytes = Math.max(0, Number(byteLength || 0))
  const rate = Math.max(1, Number(sampleRate || 48000))
  const channelCount = Math.max(1, Number(channels || 1))
  return Math.round(bytes / (rate * channelCount * 2) * 1000)
}

function buildWavBuffer(pcmBuffer, sampleRate, channels) {
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

function summarizeParticipant(participant) {
  return {
    participantIdentity: participant.participantIdentity,
    sampleRate: participant.sampleRate,
    channels: participant.channels,
    pendingBytes: participant.pendingBytes,
    totalBytes: participant.totalBytes,
    transcribedMs: participant.transcribedMs,
    flushCount: participant.flushCount,
    emittedCaptionCount: participant.emittedCaptionCount,
    lastFlushAt: participant.lastFlushAt || null,
    lastTranscriptPreview: participant.lastTranscriptPreview || '',
    lastError: participant.lastError || '',
  }
}

function summarizeSession(session) {
  return {
    sessionId: session.sessionId,
    meetingId: session.meetingId,
    roomName: session.roomName,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt || null,
    frameCount: session.frameCount,
    totalBytes: session.totalBytes,
    participantCount: session.participants.size,
    participantIdentities: [...session.participants],
    durationMs: session.durationMs,
    participantsSummary: [...session.participantStates.values()].map(summarizeParticipant),
  }
}

async function readJsonBody(request, bodyLimitBytes) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of request) {
    totalBytes += chunk.length
    if (totalBytes > bodyLimitBytes)
      throw new Error('BODY_TOO_LARGE')
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!normalizeText(raw))
    return {}

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed
  }
  catch {
    throw new Error('INVALID_JSON')
  }
}

const { values } = parseArgs({
  args: process.argv.slice(2).filter(arg => arg !== '--'),
  options: {
    'host': {
      type: 'string',
    },
    'port': {
      type: 'string',
    },
    'api-key': {
      type: 'string',
    },
    'body-limit-mb': {
      type: 'string',
    },
    'log-frames': {
      type: 'boolean',
    },
    'log-transcripts': {
      type: 'boolean',
    },
    'transcribe-url': {
      type: 'string',
    },
    'transcribe-api-key': {
      type: 'string',
    },
    'transcribe-model': {
      type: 'string',
    },
    'transcribe-language': {
      type: 'string',
    },
    'callback-url': {
      type: 'string',
    },
    'callback-secret': {
      type: 'string',
    },
    'min-chunk-ms': {
      type: 'string',
    },
  },
})

const host = normalizeText(values.host || process.env.MEETING_ASR_DEV_HOST || '127.0.0.1')
const port = toInteger(values.port || process.env.MEETING_ASR_DEV_PORT, 8790, 1, 65535)
const apiKey = normalizeText(values['api-key'] || process.env.MEETING_ASR_DEV_API_KEY)
const bodyLimitBytes = toInteger(values['body-limit-mb'] || process.env.MEETING_ASR_DEV_BODY_LIMIT_MB, 12, 1, 128) * 1024 * 1024
const logFrames = Boolean(values['log-frames'] || normalizeText(process.env.MEETING_ASR_DEV_LOG_FRAMES).toLowerCase() === 'true')
const logTranscripts = Boolean(values['log-transcripts'] || normalizeText(process.env.MEETING_ASR_DEV_LOG_TRANSCRIPTS).toLowerCase() === 'true')
const transcribeUrl = normalizeText(values['transcribe-url'] || process.env.MEETING_ASR_DEV_TRANSCRIBE_URL)
const transcribeApiKey = normalizeText(values['transcribe-api-key'] || process.env.MEETING_ASR_DEV_TRANSCRIBE_API_KEY)
const transcribeModel = normalizeText(values['transcribe-model'] || process.env.MEETING_ASR_DEV_TRANSCRIBE_MODEL || 'whisper-1')
const transcribeLanguage = normalizeText(values['transcribe-language'] || process.env.MEETING_ASR_DEV_TRANSCRIBE_LANGUAGE)
const callbackUrl = normalizeText(values['callback-url'] || process.env.MEETING_ASR_DEV_CALLBACK_URL)
const callbackSecret = normalizeText(values['callback-secret'] || process.env.MEETING_ASR_DEV_CALLBACK_SECRET)
const minChunkMs = toInteger(values['min-chunk-ms'] || process.env.MEETING_ASR_DEV_MIN_CHUNK_MS, 4000, 500, 60000)
const transcriptionEnabled = Boolean(transcribeUrl && callbackUrl)

if ((transcribeUrl && !callbackUrl) || (!transcribeUrl && callbackUrl)) {
  console.warn('[meeting-asr-dev-bridge] transcribe-url 与 callback-url 需要同时配置，否则只运行协议桥接，不做真实转写。')
}

function createParticipantState(participantIdentity, mimeType) {
  const pcm = parsePcmMimeType(mimeType)
  return {
    participantIdentity: participantIdentity || 'unknown',
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
    lastFlushAt: '',
    lastTranscriptPreview: '',
    lastError: '',
    nextRetryAt: 0,
  }
}

function getOrCreateParticipantState(session, participantIdentity, mimeType) {
  const key = participantIdentity || 'unknown'
  const existing = session.participantStates.get(key)
  if (existing) {
    const pcm = parsePcmMimeType(mimeType || existing.mimeType)
    existing.mimeType = pcm.mimeType
    existing.sampleRate = pcm.sampleRate
    existing.channels = pcm.channels
    return existing
  }

  const created = createParticipantState(key, mimeType)
  session.participantStates.set(key, created)
  return created
}

async function transcribeAudioChunk(input) {
  const formData = new FormData()
  formData.set('model', transcribeModel)
  if (transcribeLanguage)
    formData.set('language', transcribeLanguage)
  formData.set(
    'file',
    new Blob([input.wavBuffer], { type: 'audio/wav' }),
    `${input.sessionId}-${input.participantIdentity}-${input.eventSeq}.wav`,
  )

  const response = await fetch(transcribeUrl, {
    method: 'POST',
    headers: {
      authorization: transcribeApiKey ? `Bearer ${transcribeApiKey}` : '',
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = normalizeText(await response.text().catch(() => ''))
    throw new Error(`TRANSCRIBE_HTTP_${response.status}${errorText ? `:${errorText}` : ''}`)
  }

  const payload = parseJsonObject(await response.json().catch(() => ({})))
  return {
    text: normalizeText(payload.text),
    language: normalizeText(payload.language || transcribeLanguage),
  }
}

async function emitCaptionEvent(input) {
  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': callbackSecret ? `Bearer ${callbackSecret}` : '',
      'x-winloop-asr-secret': callbackSecret,
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
  })

  if (!response.ok) {
    const errorText = normalizeText(await response.text().catch(() => ''))
    throw new Error(`CALLBACK_HTTP_${response.status}${errorText ? `:${errorText}` : ''}`)
  }
}

async function flushParticipantChunks(session, participant, options = {}) {
  const force = Boolean(options.force)
  if (!transcriptionEnabled || participant.pendingBytes <= 0)
    return
  if (!force && Date.now() < participant.nextRetryAt)
    return

  const pendingDurationMs = estimatePcmDurationMs(participant.pendingBytes, participant.sampleRate, participant.channels)
  if (!force && pendingDurationMs < minChunkMs)
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
    const wavBuffer = buildWavBuffer(merged, participant.sampleRate, participant.channels)
    const transcript = await transcribeAudioChunk({
      sessionId: session.sessionId,
      participantIdentity: participant.participantIdentity,
      eventSeq: participant.eventSeq + 1,
      wavBuffer,
    })

    participant.flushCount += 1
    participant.lastFlushAt = new Date().toISOString()
    participant.lastError = ''
    participant.transcribedMs = endAtMs

    const text = normalizeText(transcript.text)
    if (!text)
      return

    participant.eventSeq += 1
    participant.emittedCaptionCount += 1
    participant.lastTranscriptPreview = text.slice(0, 120)

    await emitCaptionEvent({
      meetingId: session.meetingId,
      participantIdentity: participant.participantIdentity,
      text,
      language: transcript.language,
      startedAtMs: startAtMs,
      endedAtMs: endAtMs,
      eventId: `${session.sessionId}:${participant.participantIdentity}:${participant.eventSeq}`,
    })

    if (logTranscripts) {
      console.log(
        `[meeting-asr-dev-bridge] transcript session=${session.sessionId} participant=${participant.participantIdentity} window=${startAtMs}-${endAtMs} text=${JSON.stringify(text)}`,
      )
    }
  }
  catch (error) {
    participant.pendingChunks.unshift(merged)
    participant.pendingBytes += merged.byteLength
    participant.nextRetryAt = Date.now() + 3000
    participant.lastError = error instanceof Error ? normalizeText(error.message) : 'transcribe failed'
    console.error(
      `[meeting-asr-dev-bridge] transcript failed session=${session.sessionId} participant=${participant.participantIdentity} error=${participant.lastError}`,
    )
  }
}

function queueParticipantFlush(session, participant, options = {}) {
  participant.pipeline = participant.pipeline
    .catch(() => undefined)
    .then(async () => {
      await flushParticipantChunks(session, participant, options)
    })
  return participant.pipeline
}

const activeSessions = new Map()
const finishedSessions = []
const bootedAt = new Date().toISOString()

const server = createServer(async (request, response) => {
  const method = normalizeText(request.method || 'GET').toUpperCase()
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)

  if (method === 'GET' && url.pathname === '/healthz') {
    sendJson(response, 200, {
      ok: true,
      service: 'meeting-asr-dev-bridge',
      bootedAt,
      activeSessionCount: activeSessions.size,
      finishedSessionCount: finishedSessions.length,
      authRequired: Boolean(apiKey),
      transcriptionEnabled,
      transcribeUrlConfigured: Boolean(transcribeUrl),
      callbackUrlConfigured: Boolean(callbackUrl),
      minChunkMs,
    })
    return
  }

  if (method === 'GET' && url.pathname === '/sessions') {
    sendJson(response, 200, {
      ok: true,
      transcriptionEnabled,
      activeSessions: [...activeSessions.values()].map(summarizeSession),
      finishedSessions,
    })
    return
  }

  if (!url.pathname.startsWith('/sessions/')) {
    sendJson(response, 404, {
      ok: false,
      message: 'Not Found',
    })
    return
  }

  if (apiKey && readAuthorizationToken(request.headers) !== apiKey) {
    sendJson(response, 401, {
      ok: false,
      message: 'Unauthorized',
    })
    return
  }

  if (method !== 'POST') {
    sendJson(response, 405, {
      ok: false,
      message: 'Method Not Allowed',
    })
    return
  }

  let body = {}
  try {
    body = await readJsonBody(request, bodyLimitBytes)
  }
  catch (error) {
    if (error instanceof Error && error.message === 'BODY_TOO_LARGE') {
      sendJson(response, 413, {
        ok: false,
        message: 'Payload Too Large',
      })
      return
    }

    sendJson(response, 400, {
      ok: false,
      message: 'Invalid JSON body',
    })
    return
  }

  if (url.pathname === '/sessions/start') {
    const sessionId = normalizeText(body.sessionId)
    const meetingId = normalizeText(body.meetingId)
    const roomName = normalizeText(body.roomName)

    if (!sessionId || !meetingId || !roomName) {
      sendJson(response, 400, {
        ok: false,
        message: 'sessionId、meetingId、roomName 为必填项。',
      })
      return
    }

    if (!activeSessions.has(sessionId)) {
      const session = {
        sessionId,
        meetingId,
        roomName,
        startedAt: new Date().toISOString(),
        finishedAt: '',
        frameCount: 0,
        totalBytes: 0,
        participants: new Set(),
        durationMs: 0,
        participantStates: new Map(),
      }
      activeSessions.set(sessionId, session)
      console.log(`[meeting-asr-dev-bridge] start session=${sessionId} meeting=${meetingId} room=${roomName}`)
    }

    sendJson(response, 200, {
      ok: true,
      sessionId,
      transcriptionEnabled,
    })
    return
  }

  if (url.pathname === '/sessions/frame') {
    const sessionId = normalizeText(body.sessionId)
    const session = activeSessions.get(sessionId)

    if (!session) {
      sendJson(response, 404, {
        ok: false,
        message: 'Session Not Found',
      })
      return
    }

    const participantIdentity = normalizeText(body.participantIdentity) || 'unknown'
    const chunkBase64 = normalizeText(body.chunkBase64)
    const mimeType = normalizeText(body.mimeType)
    const pcmBuffer = chunkBase64 ? Buffer.from(chunkBase64, 'base64') : Buffer.alloc(0)
    const participant = getOrCreateParticipantState(session, participantIdentity, mimeType)

    session.frameCount += 1
    session.totalBytes += pcmBuffer.byteLength
    session.durationMs = Math.max(0, Date.now() - Date.parse(session.startedAt))
    session.participants.add(participantIdentity)

    participant.pendingChunks.push(pcmBuffer)
    participant.pendingBytes += pcmBuffer.byteLength
    participant.totalBytes += pcmBuffer.byteLength

    if (logFrames) {
      console.log(
        `[meeting-asr-dev-bridge] frame session=${sessionId} frame=${session.frameCount} bytes=${pcmBuffer.byteLength} participant=${participantIdentity}`,
      )
    }

    void queueParticipantFlush(session, participant, { force: false })

    sendJson(response, 200, {
      ok: true,
      sessionId,
      frameCount: session.frameCount,
      totalBytes: session.totalBytes,
      participantIdentity,
      transcriptionEnabled,
    })
    return
  }

  if (url.pathname === '/sessions/finish') {
    const sessionId = normalizeText(body.sessionId)
    const session = activeSessions.get(sessionId)

    if (!session) {
      const archived = finishedSessions.find(item => item.sessionId === sessionId)
      sendJson(response, archived ? 200 : 404, archived
        ? { ok: true, ...archived }
        : { ok: false, message: 'Session Not Found' })
      return
    }

    await Promise.all(
      [...session.participantStates.values()].map(participant => queueParticipantFlush(session, participant, { force: true })),
    )

    activeSessions.delete(sessionId)
    session.finishedAt = new Date().toISOString()
    session.durationMs = Math.max(0, Date.parse(session.finishedAt) - Date.parse(session.startedAt))
    const summary = summarizeSession(session)
    finishedSessions.unshift(summary)
    finishedSessions.splice(50)

    console.log(
      `[meeting-asr-dev-bridge] finish session=${sessionId} frames=${summary.frameCount} bytes=${summary.totalBytes} participants=${summary.participantCount} transcription=${transcriptionEnabled ? 'enabled' : 'disabled'}`,
    )

    sendJson(response, 200, {
      ok: true,
      ...summary,
    })
    return
  }

  sendJson(response, 404, {
    ok: false,
    message: 'Not Found',
  })
})

server.listen(port, host, () => {
  const authLabel = apiKey ? 'enabled' : 'disabled'
  const transcriptionLabel = transcriptionEnabled ? 'enabled' : 'disabled'
  console.log(
    `[meeting-asr-dev-bridge] listening on http://${host}:${port} (auth=${authLabel}, bodyLimit=${Math.round(bodyLimitBytes / 1024 / 1024)}MB, transcription=${transcriptionLabel}, minChunkMs=${minChunkMs})`,
  )
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[meeting-asr-dev-bridge] received ${signal}, shutting down`)
    server.close(() => {
      process.exit(0)
    })
  })
}
