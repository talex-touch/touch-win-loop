import { ChatOpenAI, ChatOpenAIResponses } from '@langchain/openai'
import { assertAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { normalizePlatformAiApiKey, resolvePlatformAiRequestBaseURL } from '~~/server/utils/platform-ai-base-url'

export type AiModelFormat = 'openai-compatible' | 'response'

export interface AiRuntimeConfig {
  provider: string
  baseURL: string
  apiKey: string
  model: string
  format?: AiModelFormat
  temperature?: number
  topP?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
  timeoutMs: number
  maxRetries: number
}

export function createChatModel(config: AiRuntimeConfig): ChatOpenAI | ChatOpenAIResponses {
  assertAiRuntimeConfigured(config, 'AI 模型')

  const normalizedApiKey = normalizePlatformAiApiKey(config.apiKey)
  const requestBaseURL = resolvePlatformAiRequestBaseURL(config.baseURL, config.provider)

  const normalizedTemperature = Number.isFinite(Number(config.temperature))
    ? Math.max(0, Math.min(1, Number(config.temperature)))
    : 0.2
  const normalizedTopP = Number.isFinite(Number(config.topP))
    ? Math.max(0, Math.min(1, Number(config.topP)))
    : undefined
  const normalizedMaxTokens = Number.isFinite(Number(config.maxTokens))
    ? Math.max(0, Math.round(Number(config.maxTokens)))
    : undefined
  const normalizedPresencePenalty = Number.isFinite(Number(config.presencePenalty))
    ? Math.max(-2, Math.min(2, Number(config.presencePenalty)))
    : undefined
  const normalizedFrequencyPenalty = Number.isFinite(Number(config.frequencyPenalty))
    ? Math.max(-2, Math.min(2, Number(config.frequencyPenalty)))
    : undefined
  const normalizedRetries = Number.isFinite(Number(config.maxRetries))
    ? Math.max(0, Math.min(10, Math.round(Number(config.maxRetries))))
    : 0
  const modelFields = {
    model: config.model,
    temperature: normalizedTemperature,
    topP: normalizedTopP,
    maxTokens: normalizedMaxTokens && normalizedMaxTokens > 0 ? normalizedMaxTokens : undefined,
    presencePenalty: normalizedPresencePenalty,
    frequencyPenalty: normalizedFrequencyPenalty,
    timeout: config.timeoutMs,
    maxRetries: normalizedRetries,
    apiKey: normalizedApiKey,
    configuration: requestBaseURL ? { baseURL: requestBaseURL } : undefined,
  }

  if (config.format === 'response')
    return new ChatOpenAIResponses(modelFields)

  return new ChatOpenAI(modelFields)
}
