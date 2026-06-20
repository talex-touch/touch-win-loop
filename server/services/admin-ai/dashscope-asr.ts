import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { RuntimeSettings } from '~~/server/utils/env'
import type { PlatformAiProviderConfig } from '~~/server/utils/platform-ai-channels'
import { Buffer } from 'node:buffer'
import { normalizePlatformAiApiKey, resolvePlatformAiRequestBaseURL } from '~~/server/utils/platform-ai-base-url'

export interface DashScopeAsrRuntimeConfig {
  baseURL: string
  apiKey: string
  model: string
  language: string
  enableItn: boolean
  timeoutMs: number
}

export interface DashScopeAsrTranscriptionResult {
  text: string
  language: string
  model: string
  requestId: string
  usage: Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function isDashScopeRuntime(input: {
  provider?: PlatformAiProviderConfig | null
  ai?: AiRuntimeConfig | null
}): boolean {
  const providerText = [
    input.provider?.type,
    input.provider?.provider,
    input.provider?.baseURL,
    input.ai?.provider,
    input.ai?.baseURL,
  ].map(item => normalizeString(item).toLowerCase()).join(' ')
  return providerText.includes('dashscope')
    || providerText.includes('bailian')
    || providerText.includes('qwen')
    || providerText.includes('aliyuncs.com')
}

function resolveTimeoutMs(provider?: PlatformAiProviderConfig | null, ai?: AiRuntimeConfig | null): number {
  return Math.max(3000, Math.min(120000, Number(provider?.timeoutMs || ai?.timeoutMs || 20000)))
}

function firstEnabledQwenAsrProfile(provider?: PlatformAiProviderConfig | null): {
  model: string
  language: string
} | null {
  const profiles = provider?.voice?.qwen?.asrProfiles || []
  return profiles.find(item => item.enabled) || null
}

function normalizeDashScopeAsrModel(value: unknown): string {
  const model = normalizeString(value) || 'qwen3-asr-flash'
  return model.endsWith('-realtime')
    ? model.replace(/-realtime$/i, '')
    : model
}

export function isDashScopeAsrProvider(
  provider?: PlatformAiProviderConfig | null,
  ai?: AiRuntimeConfig | null,
): boolean {
  return isDashScopeRuntime({ provider, ai })
}

export function resolveDashScopeAsrRuntimeConfig(input: {
  provider?: PlatformAiProviderConfig | null
  ai?: AiRuntimeConfig | null
  runtime?: RuntimeSettings | null
  model?: string
  language?: string
}): DashScopeAsrRuntimeConfig | null {
  if (!isDashScopeRuntime(input))
    return null

  const profile = firstEnabledQwenAsrProfile(input.provider)
  const model = normalizeDashScopeAsrModel(input.model || input.ai?.model || profile?.model)
  const apiKey = normalizePlatformAiApiKey(input.provider?.apiKey || input.ai?.apiKey || input.runtime?.ai.apiKey || '')
  const baseURL = resolvePlatformAiRequestBaseURL(
    input.provider?.baseURL || input.ai?.baseURL || input.runtime?.ai.baseURL || '',
    input.provider?.provider || input.ai?.provider || 'dashscope',
  )
  if (!apiKey || !baseURL || !model)
    return null

  return {
    baseURL,
    apiKey,
    model,
    language: normalizeString(input.language || profile?.language),
    enableItn: true,
    timeoutMs: resolveTimeoutMs(input.provider, input.ai),
  }
}

export function resolveDashScopeAsrEndpoint(config: Pick<DashScopeAsrRuntimeConfig, 'baseURL'>): string {
  return `${normalizeString(config.baseURL).replace(/\/+$/g, '')}/chat/completions`
}

export function buildDashScopeAsrProbeWavBuffer(input: {
  durationMs?: number
  sampleRate?: number
  frequencyHz?: number
} = {}): Buffer {
  const sampleRate = Math.max(8000, Math.min(48000, Math.round(Number(input.sampleRate || 16000))))
  const frameCount = Math.max(1, Math.round(sampleRate * Math.max(100, Number(input.durationMs || 800)) / 1000))
  const pcm = Buffer.alloc(frameCount * 2)
  for (let index = 0; index < frameCount; index += 1) {
    const sample = Math.sin(2 * Math.PI * Number(input.frequencyHz || 440) * index / sampleRate)
    pcm.writeInt16LE(Math.round(sample * 0.25 * 0x7FFF), index * 2)
  }

  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.byteLength, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.byteLength, 40)
  return Buffer.concat([header, pcm])
}

export async function transcribeDashScopeAsrAudio(input: {
  config: DashScopeAsrRuntimeConfig
  audioBuffer: Buffer
  mimeType?: string
  contextText?: string
}): Promise<DashScopeAsrTranscriptionResult> {
  const mimeType = normalizeString(input.mimeType) || 'audio/wav'
  const dataUrl = `data:${mimeType};base64,${input.audioBuffer.toString('base64')}`
  const messages: Array<Record<string, unknown>> = []
  const contextText = normalizeString(input.contextText)
  if (contextText) {
    messages.push({
      role: 'system',
      content: [
        {
          type: 'text',
          text: contextText.slice(0, 8000),
        },
      ],
    })
  }
  messages.push({
    role: 'user',
    content: [
      {
        type: 'input_audio',
        input_audio: {
          data: dataUrl,
        },
      },
    ],
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs)
  try {
    const response = await fetch(resolveDashScopeAsrEndpoint(input.config), {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${input.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.config.model,
        messages,
        stream: false,
        asr_options: {
          ...(input.config.language ? { language: input.config.language } : {}),
          enable_itn: input.config.enableItn,
        },
      }),
      signal: controller.signal,
    })
    const payload = normalizeRecord(await response.json().catch(() => ({})))
    if (!response.ok) {
      const message = normalizeString(payload.message || payload.error || payload.code) || `DashScope ASR 请求失败（HTTP ${response.status}）。`
      const error = new Error(message) as Error & { statusCode?: number }
      error.statusCode = response.status
      throw error
    }

    const choice = normalizeRecord((Array.isArray(payload.choices) ? payload.choices[0] : null))
    const message = normalizeRecord(choice.message)
    const annotations = Array.isArray(message.annotations) ? message.annotations : []
    const audioInfo = normalizeRecord(annotations.find(item => normalizeRecord(item).type === 'audio_info'))
    return {
      text: normalizeString(message.content),
      language: normalizeString(audioInfo.language || input.config.language),
      model: normalizeString(payload.model) || input.config.model,
      requestId: normalizeString(payload.id || payload.request_id),
      usage: normalizeRecord(payload.usage),
    }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('DashScope ASR 请求超时。')
    throw error
  }
  finally {
    clearTimeout(timeout)
  }
}
