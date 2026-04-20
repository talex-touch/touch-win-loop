function toText(value: unknown): string {
  return String(value || '').trim()
}

function isDashScopeProvider(provider: unknown, baseURL: unknown): boolean {
  const text = `${toText(provider)} ${toText(baseURL)}`.toLowerCase()
  return text.includes('dashscope')
    || text.includes('bailian')
    || text.includes('qwen')
    || text.includes('aliyuncs.com')
}

export function normalizePlatformAiBaseURL(baseURL: unknown, provider = ''): string {
  const raw = toText(baseURL)
  if (!raw)
    return ''
  let normalized = raw.replace(/\/+$/, '')

  if (isDashScopeProvider(provider, normalized)) {
    normalized = normalized.replace(/\/api\/v1\/services\/embeddings\/multimodal-embedding\/multimodal-embedding$/i, '')
    normalized = normalized.replace(/\/compatible-mode\/v1\/chat\/completions$/i, '')
    normalized = normalized.replace(/\/compatible-mode\/v1\/models$/i, '')
    normalized = normalized.replace(/\/compatible-mode\/v1$/i, '')
    normalized = normalized.replace(/\/compatible-mode$/i, '')
  }

  normalized = normalized.replace(/\/v1\/chat\/completions$/i, '')
  normalized = normalized.replace(/\/v1\/responses$/i, '')
  normalized = normalized.replace(/\/v1\/embeddings$/i, '')
  normalized = normalized.replace(/\/v1\/audio\/transcriptions$/i, '')
  normalized = normalized.replace(/\/v1\/models$/i, '')
  normalized = normalized.replace(/\/chat\/completions$/i, '')
  normalized = normalized.replace(/\/responses$/i, '')
  normalized = normalized.replace(/\/embeddings$/i, '')
  normalized = normalized.replace(/\/audio\/transcriptions$/i, '')
  normalized = normalized.replace(/\/models$/i, '')
  normalized = normalized.replace(/\/v1$/i, '')

  return normalized.replace(/\/+$/, '')
}

export function resolvePlatformAiRequestBaseURL(baseURL: unknown, provider = ''): string {
  const normalized = normalizePlatformAiBaseURL(baseURL, provider)
  if (!normalized)
    return ''
  if (isDashScopeProvider(provider, normalized))
    return `${normalized}/compatible-mode/v1`
  return `${normalized}/v1`
}

export function resolveDashScopeNativeBaseURL(baseURL: unknown, provider = ''): string {
  const normalized = normalizePlatformAiBaseURL(baseURL, provider)
  const providerText = toText(provider).toLowerCase()
  const fallbackByProvider = providerText.includes('intl')
    ? 'https://dashscope-intl.aliyuncs.com'
    : providerText.includes('us')
      ? 'https://dashscope-us.aliyuncs.com'
      : providerText.includes('bailian') || providerText.includes('dashscope') || providerText.includes('qwen')
        ? 'https://dashscope.aliyuncs.com'
        : ''

  if (!normalized)
    return fallbackByProvider

  try {
    const url = new URL(normalized)
    if (url.hostname === 'dashscope-intl.aliyuncs.com')
      return 'https://dashscope-intl.aliyuncs.com'
    if (url.hostname === 'dashscope-us.aliyuncs.com')
      return 'https://dashscope-us.aliyuncs.com'
    if (url.hostname === 'dashscope.aliyuncs.com')
      return 'https://dashscope.aliyuncs.com'
    return `${url.protocol}//${url.host}`.replace(/\/+$/, '')
  }
  catch {
    return fallbackByProvider
  }
}

export function normalizePlatformAiApiKey(apiKey: unknown): string {
  const normalized = toText(apiKey)
  if (!normalized)
    return ''
  return normalized.replace(/^Bearer\s+/i, '').trim()
}

export function resolvePlatformAiTransientApiKey(input: {
  currentApiKey?: unknown
  providedApiKey?: unknown
  mode?: 'keep' | 'replace' | 'clear'
}): string {
  const mode = toText(input.mode)
  if (mode === 'clear')
    return ''

  const providedApiKey = normalizePlatformAiApiKey(input.providedApiKey)
  if (providedApiKey)
    return providedApiKey

  return normalizePlatformAiApiKey(input.currentApiKey)
}
