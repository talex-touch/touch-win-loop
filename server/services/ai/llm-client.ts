import { ChatOpenAI } from '@langchain/openai'

export interface AiRuntimeConfig {
  provider: string
  baseURL: string
  apiKey: string
  model: string
  temperature?: number
  topP?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
  timeoutMs: number
  maxRetries: number
}

export function createChatModel(config: AiRuntimeConfig): ChatOpenAI {
  if (!config.apiKey)
    throw new Error('AI 模型密钥未配置，无法调用真实模型')

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

  return new ChatOpenAI({
    model: config.model,
    temperature: normalizedTemperature,
    topP: normalizedTopP,
    maxTokens: normalizedMaxTokens && normalizedMaxTokens > 0 ? normalizedMaxTokens : undefined,
    presencePenalty: normalizedPresencePenalty,
    frequencyPenalty: normalizedFrequencyPenalty,
    timeout: config.timeoutMs,
    maxRetries: 0,
    apiKey: config.apiKey,
    configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
  })
}
