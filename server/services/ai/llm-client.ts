import { ChatOpenAI } from '@langchain/openai'

export interface AiRuntimeConfig {
  provider: string
  baseURL: string
  apiKey: string
  model: string
  timeoutMs: number
  maxRetries: number
}

export function createChatModel(config: AiRuntimeConfig): ChatOpenAI {
  if (!config.apiKey)
    throw new Error('WINLOOP_AI_API_KEY 未配置，无法调用真实模型')

  return new ChatOpenAI({
    model: config.model,
    temperature: 0.2,
    timeout: config.timeoutMs,
    maxRetries: 0,
    apiKey: config.apiKey,
    configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
  })
}
