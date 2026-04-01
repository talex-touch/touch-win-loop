export interface ResolvedFeishuBitableSource {
  appToken: string
  tableId: string
  viewId: string
  sourceUrl?: string
}

const FEISHU_WIKI_PATH_PATTERN = /\/wiki\/([a-z0-9]+)/i

const APP_TOKEN_LABEL_PATTERNS = [
  /app[_-]?token\s*[:=：]\s*([a-z0-9]+)/i,
  /base[_-]?token\s*[:=：]\s*([a-z0-9]+)/i,
]

const TABLE_ID_LABEL_PATTERNS = [
  /table[_-]?id\s*[:=：]\s*(tbl[a-z0-9]+)/i,
]

const VIEW_ID_LABEL_PATTERNS = [
  /view[_-]?id\s*[:=：]\s*((?:vew|view)[a-z0-9]+)/i,
]

const TABLE_ID_PATTERN = /\b(tbl[a-z0-9]+)\b/i
const VIEW_ID_PATTERN = /\b((?:vew|view)[a-z0-9]+)\b/i

const APP_TOKEN_PATH_SEGMENTS = new Set(['app', 'apps', 'base', 'bitable'])
const APP_TOKEN_IGNORE_SEGMENTS = new Set([
  'app',
  'apps',
  'base',
  'bitable',
  'docx',
  'docs',
  'feishu',
  'lark',
  'open',
  'suite',
  'wiki',
  'table',
  'view',
  'apptoken',
  'tableid',
  'viewid',
  'from',
  'record',
])

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

function extractByPatterns(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const matched = toText(text.match(pattern)?.[1] || '')
    if (matched)
      return matched
  }
  return ''
}

function extractByPattern(text: string, pattern: RegExp): string {
  return toText(text.match(pattern)?.[1] || '')
}

function normalizeCandidateToken(raw: string): string {
  return toText(raw).replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
}

function hasDocumentLikePath(segments: string[]): boolean {
  return segments.some(segment => ['wiki', 'docs', 'docx', 'sheet', 'sheets'].includes(String(segment || '').toLowerCase()))
}

function looksLikeAppToken(raw: string): boolean {
  const token = normalizeCandidateToken(raw)
  if (!token || token.length < 8)
    return false
  if (!/^[a-z0-9]+$/i.test(token))
    return false
  if (TABLE_ID_PATTERN.test(token) || VIEW_ID_PATTERN.test(token))
    return false
  if (APP_TOKEN_IGNORE_SEGMENTS.has(token.toLowerCase()))
    return false
  return true
}

function extractFirstUrl(text: string): string {
  const matched = text.match(/https?:\/\/\S+/i)?.[0] || ''
  return toText(matched).replace(/[)\]>，。；;,.]+$/g, '')
}

function getFirstQueryParam(params: URLSearchParams, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeCandidateToken(params.get(key) || '')
    if (value)
      return value
  }
  return ''
}

function createUrlSearchParams(text: string): URLSearchParams {
  const normalized = safeDecode(String(text || '').replace(/^#/, '').trim())
  if (!normalized)
    return new URLSearchParams()
  if (normalized.includes('?'))
    return new URLSearchParams(normalized.split('?').slice(1).join('?'))
  if (normalized.includes('='))
    return new URLSearchParams(normalized)
  return new URLSearchParams()
}

function pickAppTokenFromTokenList(tokens: string[], preferredAnchor = -1): string {
  if (!tokens.length)
    return ''

  if (preferredAnchor >= 0) {
    for (let index = preferredAnchor - 1; index >= 0; index -= 1) {
      if (looksLikeAppToken(tokens[index] || ''))
        return normalizeCandidateToken(tokens[index] || '')
    }
  }

  for (const token of tokens) {
    if (looksLikeAppToken(token))
      return normalizeCandidateToken(token)
  }

  return ''
}

function extractAppTokenFromPath(pathname: string, tableId: string, viewId: string): string {
  const segments = pathname
    .split('/')
    .map(segment => safeDecode(segment))
    .filter(Boolean)

  for (let index = 0; index < segments.length; index += 1) {
    const current = String(segments[index] || '').toLowerCase()
    if (!APP_TOKEN_PATH_SEGMENTS.has(current))
      continue
    const next = normalizeCandidateToken(segments[index + 1] || '')
    if (looksLikeAppToken(next))
      return next
  }

  if (hasDocumentLikePath(segments))
    return ''

  const tokens = pathname
    .split(/[^a-z0-9]+/gi)
    .map(token => normalizeCandidateToken(token))
    .filter(Boolean)

  const anchorToken = tableId || viewId
  const anchorIndex = anchorToken
    ? tokens.findIndex(token => token.toLowerCase() === anchorToken.toLowerCase())
    : -1
  return pickAppTokenFromTokenList(tokens, anchorIndex)
}

export function extractFeishuWikiNodeToken(raw: string): string {
  const text = toText(raw)
  if (!text)
    return ''

  const sourceUrl = extractFirstUrl(text)
  const match = (sourceUrl || text).match(FEISHU_WIKI_PATH_PATTERN)
  return normalizeCandidateToken(match?.[1] || '')
}

function extractFromUrl(rawUrl: string): ResolvedFeishuBitableSource | null {
  const candidate = extractFirstUrl(rawUrl)
  if (!candidate)
    return null

  let parsedUrl: URL
  try {
    parsedUrl = new URL(candidate)
  }
  catch {
    return null
  }

  const hashParams = createUrlSearchParams(parsedUrl.hash)
  let appToken = getFirstQueryParam(parsedUrl.searchParams, ['appToken', 'app_token', 'baseToken', 'base_token'])
  if (!appToken)
    appToken = getFirstQueryParam(hashParams, ['appToken', 'app_token', 'baseToken', 'base_token'])

  let tableId = getFirstQueryParam(parsedUrl.searchParams, ['table', 'tableId', 'table_id'])
  if (!tableId)
    tableId = getFirstQueryParam(hashParams, ['table', 'tableId', 'table_id'])

  let viewId = getFirstQueryParam(parsedUrl.searchParams, ['view', 'viewId', 'view_id'])
  if (!viewId)
    viewId = getFirstQueryParam(hashParams, ['view', 'viewId', 'view_id'])

  const decodedPathname = safeDecode(parsedUrl.pathname)
  const decodedHash = safeDecode(parsedUrl.hash)
  const fullText = [decodedPathname, parsedUrl.search, decodedHash].filter(Boolean).join(' ')

  if (!tableId)
    tableId = extractByPattern(fullText, TABLE_ID_PATTERN)
  if (!viewId)
    viewId = extractByPattern(fullText, VIEW_ID_PATTERN)
  if (!appToken)
    appToken = extractAppTokenFromPath(decodedPathname, tableId, viewId)

  return {
    appToken: toText(appToken),
    tableId: toText(tableId),
    viewId: toText(viewId),
    sourceUrl: candidate,
  }
}

export function resolveFeishuBitableSourceInput(raw: string): ResolvedFeishuBitableSource {
  const text = toText(raw)
  if (!text)
    return { appToken: '', tableId: '', viewId: '' }

  const resolvedFromUrl = extractFromUrl(text)
  let appToken = toText(resolvedFromUrl?.appToken)
  let tableId = toText(resolvedFromUrl?.tableId)
  let viewId = toText(resolvedFromUrl?.viewId)

  if (!appToken)
    appToken = extractByPatterns(text, APP_TOKEN_LABEL_PATTERNS)
  if (!tableId)
    tableId = extractByPatterns(text, TABLE_ID_LABEL_PATTERNS)
  if (!viewId)
    viewId = extractByPatterns(text, VIEW_ID_LABEL_PATTERNS)

  if (!tableId)
    tableId = extractByPattern(text, TABLE_ID_PATTERN)
  if (!viewId)
    viewId = extractByPattern(text, VIEW_ID_PATTERN)

  if (!appToken) {
    appToken = extractByPattern(text, /\/(?:base|bitable|apps|app)\/([a-z0-9]+)/i)
  }

  if (!appToken) {
    const tokens = text
      .split(/[^a-z0-9]+/gi)
      .map(token => normalizeCandidateToken(token))
      .filter(Boolean)

    if (!extractFeishuWikiNodeToken(text)) {
      const anchorToken = tableId || viewId
      const anchorIndex = anchorToken
        ? tokens.findIndex(token => token.toLowerCase() === anchorToken.toLowerCase())
        : -1
      appToken = pickAppTokenFromTokenList(tokens, anchorIndex)
    }
  }

  return {
    appToken: toText(appToken),
    tableId: toText(tableId),
    viewId: toText(viewId),
    sourceUrl: resolvedFromUrl?.sourceUrl || (text.includes('http://') || text.includes('https://') ? text : ''),
  }
}
