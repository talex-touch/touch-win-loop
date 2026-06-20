const SENSITIVE_KEY_PATTERN = /authorization|cookie|token|secret|password|api[-_]?key/i
const IGNORED_ERROR_CODES = new Set([
  'FORBIDDEN',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'PROJECT_NOT_FOUND',
  'WORKSPACE_NOT_FOUND',
  'RESOURCE_NOT_FOUND',
  'SESSION_NOT_FOUND',
  'USER_NOT_FOUND',
  'TARGET_NOT_FOUND',
  'INVITATION_NOT_FOUND',
  'TRACK_NOT_FOUND',
  'QUOTA_EXCEEDED',
])

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized)
      return normalized
  }
  return ''
}

function normalizeErrorCodeCandidate(value: unknown): string {
  const normalized = normalizeText(value).toUpperCase()
  if (!normalized)
    return ''

  const primary = normalized.split(':')[0] || ''
  return /^[A-Z0-9_]+$/.test(primary) ? primary : ''
}

function sanitizeArray(value: unknown[]): unknown[] {
  return value.map(item => sanitizeSentryPayload(item))
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]'
      continue
    }
    sanitized[key] = sanitizeSentryPayload(rawValue)
  }
  return sanitized
}

export function buildSentryTracePropagationTargets(apiBaseUrl: string): Array<string | RegExp> {
  const targets: Array<string | RegExp> = [/^\/api\//]
  const normalized = normalizeText(apiBaseUrl)
  if (!/^https?:\/\//i.test(normalized))
    return targets

  try {
    const origin = new URL(normalized).origin
    if (origin)
      targets.push(origin)
  }
  catch {
    // ignore malformed absolute api base url
  }

  return targets
}

export function resolveSentryErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object')
    return undefined

  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
  }

  const values = [
    candidate.statusCode,
    candidate.status,
    candidate.response?.status,
  ]

  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed))
      return parsed
  }

  return undefined
}

export function resolveSentryErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object')
    return normalizeErrorCodeCandidate(error)

  const candidate = error as {
    code?: unknown
    statusMessage?: unknown
    message?: unknown
  }

  return firstNonEmpty(
    normalizeErrorCodeCandidate(candidate.code),
    normalizeErrorCodeCandidate(candidate.statusMessage),
    normalizeErrorCodeCandidate(candidate.message),
  )
}

export function shouldCaptureSentryError(error: unknown): boolean {
  const statusCode = resolveSentryErrorStatusCode(error)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500)
    return false

  const errorCode = resolveSentryErrorCode(error)
  if (!errorCode)
    return true

  return !IGNORED_ERROR_CODES.has(errorCode)
}

export function sanitizeSentryPayload<T>(value: T): T {
  if (Array.isArray(value))
    return sanitizeArray(value) as T

  if (!value || typeof value !== 'object')
    return value

  return sanitizeRecord(value as Record<string, unknown>) as T
}
