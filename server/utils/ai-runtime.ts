interface AiRuntimeLike {
  provider?: string
  baseURL?: string
  apiKey?: string
  model?: string
}

export const UNCONFIGURED_RUNTIME_MARKER = 'unconfigured'

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export function normalizeAiRuntimeProvider(value: unknown): string {
  return normalizeText(value) || UNCONFIGURED_RUNTIME_MARKER
}

export function isAiRuntimeConfigured(runtime: AiRuntimeLike | null | undefined): boolean {
  if (!runtime)
    return false

  const provider = normalizeText(runtime.provider).toLowerCase()
  const baseURL = normalizeText(runtime.baseURL)
  const apiKey = normalizeText(runtime.apiKey)
  const model = normalizeText(runtime.model)
  if (!provider || provider === UNCONFIGURED_RUNTIME_MARKER || !baseURL || !apiKey || !model)
    return false
  return true
}

export function buildAiNotConfiguredMessage(label = 'AI'): string {
  return `${label} 未配置，请先在后台完成模型与密钥配置后再试。`
}

export function assertAiRuntimeConfigured(runtime: AiRuntimeLike | null | undefined, label = 'AI'): void {
  if (!isAiRuntimeConfigured(runtime))
    throw new Error(buildAiNotConfiguredMessage(label))
}
