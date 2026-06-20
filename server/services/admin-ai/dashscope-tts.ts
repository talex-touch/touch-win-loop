import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { RuntimeSettings } from '~~/server/utils/env'
import type { PlatformAiProviderConfig } from '~~/server/utils/platform-ai-channels'
import { Buffer } from 'node:buffer'
import { normalizePlatformAiApiKey, resolveDashScopeNativeBaseURL } from '~~/server/utils/platform-ai-base-url'

export interface DashScopeTtsRuntimeConfig {
  baseURL: string
  apiKey: string
  model: string
  voice: string
  languageType: string
  timeoutMs: number
}

export interface DashScopeTtsSpeechResult {
  audioBuffer: Buffer | null
  audioUrl: string
  audioId: string
  expiresAt: number | null
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
  return Math.max(3000, Math.min(120000, Number(provider?.timeoutMs || ai?.timeoutMs || 15000)))
}

export function resolveDashScopeTtsRuntimeConfig(input: {
  provider?: PlatformAiProviderConfig | null
  ai?: AiRuntimeConfig | null
  runtime?: RuntimeSettings | null
  model?: string
}): DashScopeTtsRuntimeConfig | null {
  if (!isDashScopeRuntime(input))
    return null

  const model = normalizeString(input.model || input.ai?.model)
  const apiKey = normalizePlatformAiApiKey(input.provider?.apiKey || input.ai?.apiKey || input.runtime?.ai.apiKey || '')
  const baseURL = resolveDashScopeNativeBaseURL(input.provider?.baseURL || input.ai?.baseURL || input.runtime?.ai.baseURL || '', input.provider?.provider || input.ai?.provider || 'dashscope')
  if (!apiKey || !baseURL || !model)
    return null

  return {
    baseURL,
    apiKey,
    model,
    voice: 'Cherry',
    languageType: 'Chinese',
    timeoutMs: resolveTimeoutMs(input.provider, input.ai),
  }
}

export async function synthesizeDashScopeTtsSpeech(input: {
  config: DashScopeTtsRuntimeConfig
  text: string
  voice?: string
  languageType?: string
  instructions?: string
  optimizeInstructions?: boolean
}): Promise<DashScopeTtsSpeechResult> {
  const text = normalizeString(input.text) || 'SCENE_TTS_OK'
  const bodyInput: Record<string, unknown> = {
    text,
    voice: normalizeString(input.voice) || input.config.voice,
    language_type: normalizeString(input.languageType) || input.config.languageType,
  }
  const instructions = normalizeString(input.instructions)
  if (instructions) {
    bodyInput.instructions = instructions
    bodyInput.optimize_instructions = input.optimizeInstructions === true
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs)
  try {
    const response = await fetch(`${input.config.baseURL}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${input.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.config.model,
        input: bodyInput,
      }),
      signal: controller.signal,
    })
    const payload = normalizeRecord(await response.json().catch(() => ({})))
    const statusCode = Number(payload.status_code || response.status)
    if (!response.ok || statusCode < 200 || statusCode >= 300) {
      const message = normalizeString(payload.message || payload.code) || `DashScope TTS 请求失败（HTTP ${response.status}）。`
      throw new Error(message)
    }

    const output = normalizeRecord(payload.output)
    const audio = normalizeRecord(output.audio)
    const audioData = normalizeString(audio.data)
    return {
      audioBuffer: audioData ? Buffer.from(audioData, 'base64') : null,
      audioUrl: normalizeString(audio.url),
      audioId: normalizeString(audio.id),
      expiresAt: Number.isFinite(Number(audio.expires_at)) ? Number(audio.expires_at) : null,
      requestId: normalizeString(payload.request_id),
      usage: normalizeRecord(payload.usage),
    }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('DashScope TTS 请求超时。')
    throw error
  }
  finally {
    clearTimeout(timeout)
  }
}
