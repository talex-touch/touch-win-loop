import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { RuntimeSettings } from '~~/server/utils/env'
import type { PlatformAiProviderConfig } from '~~/server/utils/platform-ai-channels'
import { Buffer } from 'node:buffer'
import { normalizePlatformAiApiKey } from '~~/server/utils/platform-ai-base-url'

type CozeAudioFormat = 'wav' | 'pcm' | 'ogg' | 'opus' | 'mp3'
type CozeRoomMode = 'default' | 's2s' | 'podcast' | 'translate'
type CozeTurnDetectionType = 'server_vad' | 'client_vad' | 'client_interrupt'

export interface CozeVoiceRuntimeConfig {
  baseURL: string
  apiKey: string
  botId: string
  connectorId: string
  voiceId: string
  authMode: 'pat' | 'oauth'
  timeoutMs: number
}

export interface CozeVoiceTranscriptionResult {
  text: string
}

export interface CozeVoiceSpeechResult {
  audioBuffer: Buffer
  format: CozeAudioFormat
}

export interface CozeRealtimeRoomInfo {
  token: string
  uid: string
  room_id: string
  app_id: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolveTimeoutMs(provider?: PlatformAiProviderConfig | null, ai?: AiRuntimeConfig | null): number {
  return Math.max(3000, Math.min(120000, Number(provider?.timeoutMs || ai?.timeoutMs || 15000)))
}

export function isCozeVoiceProvider(provider?: PlatformAiProviderConfig | null): boolean {
  return provider?.type === 'coze-voice' || provider?.capability === 'voice'
}

export function resolveCozeVoiceRuntimeConfig(input: {
  provider?: PlatformAiProviderConfig | null
  ai?: AiRuntimeConfig | null
  runtime?: RuntimeSettings | null
}): CozeVoiceRuntimeConfig | null {
  const provider = input.provider || null
  const runtimeCoze = input.runtime?.defenseRealtime.coze
  const voice = provider?.voice
  const apiKey = normalizePlatformAiApiKey(provider?.apiKey || input.ai?.apiKey || runtimeCoze?.patOrOauthSecret || '')
  const baseURL = normalizeString(provider?.baseURL || input.ai?.baseURL || runtimeCoze?.baseUrl || 'https://api.coze.cn')
  const botId = normalizeString(voice?.botId || runtimeCoze?.botId)
  const connectorId = normalizeString(voice?.connectorId || runtimeCoze?.connectorId)
  const voiceId = normalizeString(voice?.voiceId || runtimeCoze?.voiceId)
  const authMode = voice?.authMode || (normalizeString(runtimeCoze?.authMode).toLowerCase() === 'oauth' ? 'oauth' : 'pat')

  if (!apiKey && !baseURL && !botId && !connectorId && !voiceId)
    return null

  return {
    baseURL,
    apiKey,
    botId,
    connectorId,
    voiceId,
    authMode,
    timeoutMs: resolveTimeoutMs(provider, input.ai),
  }
}

function assertCozeToken(config: CozeVoiceRuntimeConfig): void {
  if (!config.apiKey)
    throw new Error('COZE_VOICE_API_KEY_NOT_CONFIGURED')
}

function assertCozeVoiceId(config: CozeVoiceRuntimeConfig): void {
  if (!config.voiceId)
    throw new Error('COZE_VOICE_ID_NOT_CONFIGURED')
}

export function assertCozeRealtimeConfig(config: CozeVoiceRuntimeConfig): void {
  assertCozeToken(config)
  if (!config.botId || !config.connectorId)
    throw new Error('COZE_REALTIME_CONFIG_MISSING')
}

async function createCozeApiClient(config: CozeVoiceRuntimeConfig) {
  assertCozeToken(config)
  const { CozeAPI } = await import('@coze/api')
  return new CozeAPI({
    baseURL: config.baseURL || 'https://api.coze.cn',
    token: config.apiKey,
    axiosOptions: {
      timeout: config.timeoutMs,
    },
  })
}

function buildAudioFile(input: {
  buffer: Buffer
  filename: string
  mimeType: string
}): File | Blob {
  const bytes = new Uint8Array(input.buffer.byteLength)
  bytes.set(input.buffer)
  if (typeof File === 'function')
    return new File([bytes], input.filename, { type: input.mimeType })

  const blob = new Blob([bytes], { type: input.mimeType }) as Blob & { name?: string }
  blob.name = input.filename
  return blob
}

export async function transcribeCozeVoiceAudio(input: {
  config: CozeVoiceRuntimeConfig
  audioBuffer: Buffer
  filename?: string
  mimeType?: string
}): Promise<CozeVoiceTranscriptionResult> {
  const client = await createCozeApiClient(input.config)
  const file = buildAudioFile({
    buffer: input.audioBuffer,
    filename: input.filename || 'coze-audio.wav',
    mimeType: input.mimeType || 'audio/wav',
  })
  const result = await client.audio.transcriptions.create({ file })
  return {
    text: normalizeString(result?.text),
  }
}

export async function synthesizeCozeVoiceSpeech(input: {
  config: CozeVoiceRuntimeConfig
  text: string
  responseFormat?: CozeAudioFormat
  sampleRate?: number
  speed?: number
}): Promise<CozeVoiceSpeechResult> {
  assertCozeVoiceId(input.config)
  const client = await createCozeApiClient(input.config)
  const format = input.responseFormat || 'wav'
  const arrayBuffer = await client.audio.speech.create({
    input: normalizeString(input.text).slice(0, 1024) || 'Coze voice test',
    voice_id: input.config.voiceId,
    response_format: format,
    sample_rate: input.sampleRate || 24000,
    speed: input.speed || 1,
  })
  return {
    audioBuffer: Buffer.from(arrayBuffer),
    format,
  }
}

function normalizeCozeRoomMode(value: unknown): CozeRoomMode | undefined {
  const normalized = normalizeString(value)
  if (normalized === 's2s' || normalized === 'podcast' || normalized === 'translate')
    return normalized
  if (normalized === 'default')
    return 'default'
  return undefined
}

function normalizeCozeTurnDetectionType(value: unknown): CozeTurnDetectionType | undefined {
  const normalized = normalizeString(value)
  if (normalized === 'client_vad' || normalized === 'client_interrupt')
    return normalized
  if (normalized === 'server_vad')
    return 'server_vad'
  return undefined
}

export async function createCozeRealtimeRoom(input: {
  config: CozeVoiceRuntimeConfig
  botId?: string
  connectorId?: string
  voiceId?: string
  conversationId?: string
  uid?: string
  roomMode?: string
  prologueContent?: string
  turnDetectionType?: string
  videoStreamType?: 'main' | 'screen'
}): Promise<CozeRealtimeRoomInfo> {
  const client = await createCozeApiClient(input.config)
  const botId = normalizeString(input.botId) || input.config.botId
  const connectorId = normalizeString(input.connectorId) || input.config.connectorId
  if (!botId || !connectorId)
    throw new Error('COZE_REALTIME_CONFIG_MISSING')

  const config: Record<string, unknown> = {}
  const roomMode = normalizeCozeRoomMode(input.roomMode)
  const turnDetectionType = normalizeCozeTurnDetectionType(input.turnDetectionType)
  const prologueContent = normalizeString(input.prologueContent)
  if (roomMode)
    config.room_mode = roomMode
  if (turnDetectionType)
    config.turn_detection = { type: turnDetectionType }
  if (prologueContent)
    config.prologue_content = prologueContent
  if (input.videoStreamType === 'screen' || input.videoStreamType === 'main')
    config.video_config = { stream_video_type: input.videoStreamType }

  const roomInfo = await client.audio.rooms.create({
    bot_id: botId,
    connector_id: connectorId,
    conversation_id: normalizeString(input.conversationId) || undefined,
    voice_id: normalizeString(input.voiceId) || input.config.voiceId || undefined,
    uid: normalizeString(input.uid) || undefined,
    config: Object.keys(config).length ? config as never : undefined,
  })

  return {
    token: normalizeString(roomInfo?.token),
    uid: normalizeString(roomInfo?.uid),
    room_id: normalizeString(roomInfo?.room_id),
    app_id: normalizeString(roomInfo?.app_id),
  }
}

export async function probeCozeVoiceProvider(input: {
  config: CozeVoiceRuntimeConfig
  text?: string
}): Promise<{
  speechBytes: number
  transcriptionPreview: string
}> {
  const speech = await synthesizeCozeVoiceSpeech({
    config: input.config,
    text: input.text || 'Coze voice probe',
    responseFormat: 'wav',
  })
  const transcription = await transcribeCozeVoiceAudio({
    config: input.config,
    audioBuffer: speech.audioBuffer,
    filename: 'coze-voice-probe.wav',
    mimeType: 'audio/wav',
  })
  return {
    speechBytes: speech.audioBuffer.byteLength,
    transcriptionPreview: transcription.text.slice(0, 120),
  }
}
