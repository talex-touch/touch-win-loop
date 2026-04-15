interface AiRuntimeLike {
  provider?: string
  apiKey?: string
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export function isAiRuntimeConfigured(runtime: AiRuntimeLike | null | undefined): boolean {
  if (!runtime)
    return false

  const provider = normalizeText(runtime.provider).toLowerCase()
  const apiKey = normalizeText(runtime.apiKey)
  if (!apiKey)
    return false
  return provider !== 'mock'
}

export function buildAiNotConfiguredMessage(label = 'AI'): string {
  return `${label} 未配置，请先在后台完成模型与密钥配置后再试。`
}
