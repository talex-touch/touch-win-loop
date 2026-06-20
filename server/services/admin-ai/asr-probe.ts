import type { Buffer } from 'node:buffer'
import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type { RuntimeSettings } from '~~/server/utils/env'
import type { PlatformAiProviderConfig } from '~~/server/utils/platform-ai-channels'
import { isCozeVoiceProvider, resolveCozeVoiceRuntimeConfig, transcribeCozeVoiceAudio } from '~~/server/services/admin-ai/coze-voice'
import { buildDashScopeAsrProbeWavBuffer, resolveDashScopeAsrRuntimeConfig, transcribeDashScopeAsrAudio } from '~~/server/services/admin-ai/dashscope-asr'
import { normalizePlatformAiApiKey, resolvePlatformAiRequestBaseURL } from '~~/server/utils/platform-ai-base-url'

export interface AdminAiAsrProbeResult {
  provider: string
  model: string
  profileId: string
  text: string
  language: string
  requestId: string
  audioBytes: number
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

function resolveProbeModel(provider: PlatformAiProviderConfig | null | undefined, ai: AiRuntimeConfig, profileId?: string): string {
  const requestedProfileId = normalizeString(profileId)
  if (requestedProfileId && provider?.voice?.qwen?.asrProfiles?.length) {
    const profile = provider.voice.qwen.asrProfiles.find(item => item.id === requestedProfileId && item.enabled)
      || provider.voice.qwen.asrProfiles.find(item => item.id === requestedProfileId)
    if (profile?.model)
      return profile.model
  }
  return normalizeString(ai.model || provider?.voice?.qwen?.asrProfiles?.find(item => item.enabled)?.model || 'qwen3-asr-flash')
}

function resolveOpenAiCompatibleAsrEndpoint(ai: AiRuntimeConfig): string {
  const baseURL = resolvePlatformAiRequestBaseURL(ai.baseURL, ai.provider).replace(/\/+$/g, '')
  if (!baseURL)
    return ''
  return baseURL.endsWith('/audio/transcriptions')
    ? baseURL
    : `${baseURL}/audio/transcriptions`
}

async function transcribeOpenAiCompatibleAsr(input: {
  ai: AiRuntimeConfig
  audioBuffer: Buffer
  model: string
}): Promise<{ text: string, language: string, requestId: string }> {
  const endpoint = resolveOpenAiCompatibleAsrEndpoint(input.ai)
  const apiKey = normalizePlatformAiApiKey(input.ai.apiKey)
  if (!endpoint || !apiKey || !input.model)
    throw new Error('OPENAI_COMPATIBLE_ASR_NOT_CONFIGURED')

  const bytes = new Uint8Array(input.audioBuffer.byteLength)
  bytes.set(input.audioBuffer)
  const formData = new FormData()
  formData.set('model', input.model)
  formData.set('file', new Blob([bytes], { type: 'audio/wav' }), 'admin-asr-probe.wav')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(3000, Math.min(120000, Number(input.ai.timeoutMs || 15000))))
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    })
    const raw = await response.text().catch(() => '')
    const payload = raw ? normalizeRecord(JSON.parse(raw)) : {}
    if (!response.ok) {
      const message = normalizeString(payload.message || payload.error || raw) || `OpenAI Compatible ASR 请求失败（HTTP ${response.status}）。`
      throw new Error(message)
    }
    return {
      text: normalizeString(payload.text),
      language: normalizeString(payload.language),
      requestId: normalizeString(payload.id || payload.request_id),
    }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('OpenAI Compatible ASR 请求超时。')
    throw error
  }
  finally {
    clearTimeout(timer)
  }
}

export async function runAdminAiAsrProbe(input: {
  runtime: RuntimeSettings
  provider: PlatformAiProviderConfig | null
  ai: AiRuntimeConfig
  message?: string
  profileId?: string
}): Promise<AdminAiAsrProbeResult> {
  const audioBuffer = buildDashScopeAsrProbeWavBuffer({
    durationMs: 800,
    sampleRate: 16000,
    frequencyHz: 440,
  })

  if (isCozeVoiceProvider(input.provider)) {
    const config = resolveCozeVoiceRuntimeConfig({ provider: input.provider, ai: input.ai, runtime: input.runtime })
    if (!config)
      throw new Error('Coze 语音 Provider 未完整配置。')
    const transcription = await transcribeCozeVoiceAudio({
      config,
      audioBuffer,
      filename: 'admin-coze-asr-probe.wav',
      mimeType: 'audio/wav',
    })
    return {
      provider: input.ai.provider,
      model: 'coze-voice',
      profileId: normalizeString(input.profileId),
      text: transcription.text,
      language: '',
      requestId: '',
      audioBytes: audioBuffer.byteLength,
      detail: `Coze ASR OK，text=${transcription.text || '（空文本）'}。`,
    }
  }

  const model = resolveProbeModel(input.provider, input.ai, input.profileId)
  const dashScopeConfig = resolveDashScopeAsrRuntimeConfig({
    provider: input.provider,
    ai: {
      ...input.ai,
      model,
    },
    runtime: input.runtime,
    model,
  })
  if (dashScopeConfig) {
    const transcription = await transcribeDashScopeAsrAudio({
      config: dashScopeConfig,
      audioBuffer,
      mimeType: 'audio/wav',
      contextText: normalizeString(input.message),
    })
    return {
      provider: input.ai.provider,
      model: transcription.model,
      profileId: normalizeString(input.profileId),
      text: transcription.text,
      language: transcription.language,
      requestId: transcription.requestId,
      audioBytes: audioBuffer.byteLength,
      detail: `DashScope ASR OK，model=${transcription.model}，text=${transcription.text || '（空文本）'}。`,
    }
  }

  const transcription = await transcribeOpenAiCompatibleAsr({
    ai: input.ai,
    audioBuffer,
    model,
  })
  return {
    provider: input.ai.provider,
    model,
    profileId: normalizeString(input.profileId),
    text: transcription.text,
    language: transcription.language,
    requestId: transcription.requestId,
    audioBytes: audioBuffer.byteLength,
    detail: `OpenAI Compatible ASR OK，model=${model}，text=${transcription.text || '（空文本）'}。`,
  }
}
