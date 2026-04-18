function toText(value: unknown): string {
  return String(value || '').trim()
}

export function normalizePlatformAiBaseURL(baseURL: unknown, _provider = ''): string {
  const raw = toText(baseURL)
  if (!raw)
    return ''
  let normalized = raw.replace(/\/+$/, '')

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
  return `${normalized}/v1`
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
