type AuthFailureKind = 'unauthorized' | 'forbidden' | 'temporary' | 'unknown'

interface HeadersLike {
  get?: (name: string) => string | null
}

interface AuthErrorMetaLike {
  traceId?: string
}

interface AuthErrorPayloadLike {
  message?: string
  meta?: AuthErrorMetaLike
}

interface AuthErrorResponseLike {
  status?: number
  headers?: HeadersLike
  _data?: AuthErrorPayloadLike
}

interface AuthRequestErrorLike {
  statusCode?: number
  status?: number
  statusMessage?: string
  message?: string
  data?: AuthErrorPayloadLike
  response?: AuthErrorResponseLike
}

export interface AuthRequestErrorInfo {
  statusCode: number
  kind: AuthFailureKind
  message: string
  traceId: string
  isUnauthorized: boolean
  isForbidden: boolean
  isTemporary: boolean
}

const NETWORK_ERROR_PATTERN = /network|timeout|timed out|fetch failed|load failed|failed to fetch|connection|socket|abort/i

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

interface RouteLike {
  fullPath?: string | null
  path?: string | null
}

function normalizeStatusCode(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0)
    return 0
  return Math.trunc(parsed)
}

function readTraceIdFromHeaders(headers: HeadersLike | undefined): string {
  if (!headers || typeof headers.get !== 'function')
    return ''
  return normalizeString(headers.get('x-trace-id'))
}

export function classifyAuthFailureKind(statusCode: number, message = ''): AuthFailureKind {
  if (statusCode === 401)
    return 'unauthorized'
  if (statusCode === 403)
    return 'forbidden'
  if (statusCode >= 500 || statusCode === 0)
    return 'temporary'
  if (NETWORK_ERROR_PATTERN.test(message))
    return 'temporary'
  return 'unknown'
}

export function buildAuthRequestErrorInfo(input: {
  statusCode?: number
  message?: string
  traceId?: string
}): AuthRequestErrorInfo {
  const statusCode = normalizeStatusCode(input.statusCode)
  const message = normalizeString(input.message)
  const traceId = normalizeString(input.traceId)
  const kind = classifyAuthFailureKind(statusCode, message)

  return {
    statusCode,
    kind,
    message,
    traceId,
    isUnauthorized: kind === 'unauthorized',
    isForbidden: kind === 'forbidden',
    isTemporary: kind === 'temporary',
  }
}

export function resolveAuthRequestErrorInfo(error: unknown): AuthRequestErrorInfo {
  const candidate = (error || {}) as AuthRequestErrorLike
  const response = candidate.response
  const responseData = response?._data
  const data = candidate.data

  const statusCode = normalizeStatusCode(
    candidate.statusCode
    || response?.status
    || candidate.status,
  )
  const message = normalizeString(
    data?.message
    || responseData?.message
    || candidate.message
    || candidate.statusMessage,
  )
  const traceId = normalizeString(
    data?.meta?.traceId
    || responseData?.meta?.traceId
    || readTraceIdFromHeaders(response?.headers),
  )

  return buildAuthRequestErrorInfo({
    statusCode,
    message,
    traceId,
  })
}

export function resolveAuthDisplayMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const info = typeof error === 'object' && error && 'kind' in error
    ? error as AuthRequestErrorInfo
    : resolveAuthRequestErrorInfo(error)

  if (info.isForbidden && info.message)
    return info.message
  if (info.isTemporary)
    return fallbackMessage
  return info.message || fallbackMessage
}

export function resolveLoginRedirectTarget(route: RouteLike | null | undefined, fallbackPath = '/'): string {
  return normalizeString(route?.fullPath)
    || normalizeString(route?.path)
    || normalizeString(fallbackPath)
    || '/'
}

export function logAuthProbeDegraded(input: {
  context: string
  route?: string
  error?: unknown
  statusCode?: number
  message?: string
  traceId?: string
}): void {
  const info = input.error
    ? resolveAuthRequestErrorInfo(input.error)
    : buildAuthRequestErrorInfo({
        statusCode: input.statusCode,
        message: input.message,
        traceId: input.traceId,
      })

  console.warn('[auth-probe] degraded', {
    context: normalizeString(input.context),
    route: normalizeString(input.route),
    statusCode: info.statusCode || null,
    traceId: info.traceId || '',
    message: info.message || '',
  })
}
