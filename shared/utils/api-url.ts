function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(normalizeString(value))
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '')
}

function ensureLeadingSlash(value: string): string {
  const normalized = normalizeString(value).replace(/^\/+/g, '')
  if (!normalized)
    return '/'
  return `/${normalized}`
}

function toUrlLike(value: string): URL | null {
  try {
    return new URL(value)
  }
  catch {
    return null
  }
}

function normalizeRelativeBase(value: string, fallback: string): string {
  const normalized = ensureLeadingSlash(value || fallback)
  if (normalized === '/')
    return '/'
  return trimTrailingSlash(normalized)
}

export function normalizeApiBase(apiBase: string, fallback = '/api'): string {
  const raw = normalizeString(apiBase) || normalizeString(fallback) || '/api'
  if (isHttpUrl(raw)) {
    const parsed = toUrlLike(raw)
    if (!parsed)
      return normalizeRelativeBase('', fallback)

    const pathName = trimTrailingSlash(parsed.pathname || '/')
    parsed.pathname = pathName || '/'
    parsed.search = ''
    parsed.hash = ''
    const serialized = parsed.toString()
    if (pathName && pathName !== '/')
      return serialized.replace(/\/$/g, '')
    return serialized.replace(/\/$/g, '')
  }
  return normalizeRelativeBase(raw, fallback)
}

export function extractApiBasePathPrefix(apiBase: string): string {
  const normalized = normalizeApiBase(apiBase)
  if (isHttpUrl(normalized)) {
    const parsed = toUrlLike(normalized)
    if (!parsed)
      return '/api'
    const pathName = trimTrailingSlash(parsed.pathname || '/')
    if (!pathName || pathName === '/')
      return ''
    return pathName
  }
  if (normalized === '/')
    return ''
  return normalized
}

function joinAbsoluteBaseAndPath(base: string, path: string): string {
  const parsed = toUrlLike(base)
  if (!parsed)
    return path

  const basePath = trimTrailingSlash(parsed.pathname || '/')
  const nextPath = ensureLeadingSlash(path)
  const mergedPath = `${basePath === '/' ? '' : basePath}${nextPath}`
  parsed.pathname = mergedPath || '/'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/g, mergedPath === '/' ? '/' : '')
}

export function buildApiEndpoint(apiBase: string, path: string): string {
  const rawPath = normalizeString(path)
  if (isHttpUrl(rawPath))
    return rawPath

  const normalizedPath = ensureLeadingSlash(rawPath)

  const normalizedBase = normalizeApiBase(apiBase)
  if (isHttpUrl(normalizedBase))
    return joinAbsoluteBaseAndPath(normalizedBase, normalizedPath)

  if (normalizedBase === '/')
    return normalizedPath
  return `${normalizedBase}${normalizedPath}`
}

export function resolveApiUrlByApiBase(apiBase: string, rawUrl: string): string {
  const normalized = normalizeString(rawUrl)
  if (!normalized)
    return ''

  if (isHttpUrl(normalized))
    return normalized
  if (normalized.startsWith('data:') || normalized.startsWith('blob:') || normalized.startsWith('mailto:') || normalized.startsWith('tel:'))
    return normalized

  if (normalized.startsWith('/api')) {
    const suffix = normalized === '/api' ? '/' : normalized.slice(4)
    return buildApiEndpoint(apiBase, suffix)
  }
  if (normalized.startsWith('api/'))
    return buildApiEndpoint(apiBase, normalized.slice(3))

  return normalized
}

export function appendQueryParam(rawUrl: string, key: string, value: string): string {
  const url = normalizeString(rawUrl)
  const normalizedKey = normalizeString(key)
  if (!url || !normalizedKey)
    return url

  if (isHttpUrl(url)) {
    const parsed = toUrlLike(url)
    if (!parsed)
      return url
    parsed.searchParams.set(normalizedKey, value)
    return parsed.toString()
  }

  const parts = url.split('#', 2)
  const beforeHash = parts[0] || ''
  const hash = parts[1] || ''
  const separator = beforeHash.includes('?') ? '&' : '?'
  const next = `${beforeHash}${separator}${encodeURIComponent(normalizedKey)}=${encodeURIComponent(value)}`
  return hash ? `${next}#${hash}` : next
}
