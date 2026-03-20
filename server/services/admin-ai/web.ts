import { lookup } from 'node:dns/promises'
import { URL } from 'node:url'

export interface WebSearchResultItem {
  title: string
  url: string
  snippet: string
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
])

function isPrivateIpv4(ip: string): boolean {
  if (/^127\./.test(ip))
    return true
  if (/^10\./.test(ip))
    return true
  if (/^192\.168\./.test(ip))
    return true
  if (/^169\.254\./.test(ip))
    return true

  const matched = ip.match(/^172\.(\d{1,3})\./)
  if (!matched)
    return false

  const second = Number(matched[1] || '0')
  return second >= 16 && second <= 31
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
}

export async function assertSafeHttpUrl(rawUrl: string): Promise<URL> {
  const text = String(rawUrl || '').trim()
  if (!text)
    throw new Error('WEB_URL_REQUIRED')

  let parsed: URL
  try {
    parsed = new URL(text)
  }
  catch {
    throw new Error('WEB_URL_INVALID')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('WEB_URL_PROTOCOL_NOT_ALLOWED')

  const host = parsed.hostname.trim().toLowerCase()
  if (!host)
    throw new Error('WEB_URL_INVALID_HOST')

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal'))
    throw new Error('WEB_URL_HOST_BLOCKED')

  const records = await lookup(host, { all: true })
  for (const record of records) {
    if (record.family === 4 && isPrivateIpv4(record.address))
      throw new Error('WEB_URL_PRIVATE_IP_BLOCKED')
    if (record.family === 6 && isPrivateIpv6(record.address))
      throw new Error('WEB_URL_PRIVATE_IP_BLOCKED')
  }

  return parsed
}

export async function fetchWebPageText(input: {
  url: string
  timeoutMs: number
  maxChars: number
}): Promise<string> {
  const parsed = await assertSafeHttpUrl(input.url)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, input.timeoutMs))

  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'WinLoopAdminAI/1.0',
      },
    })

    if (!response.ok)
      throw new Error(`WEB_FETCH_FAILED:${response.status}`)

    const text = await response.text()
    return text.slice(0, Math.max(1000, input.maxChars))
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function searchWithTavily(input: {
  query: string
  tavilyApiKey: string
  maxResults: number
  timeoutMs: number
}): Promise<WebSearchResultItem[]> {
  const apiKey = String(input.tavilyApiKey || '').trim()
  if (!apiKey)
    throw new Error('TAVILY_API_KEY_MISSING')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, input.timeoutMs))

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: input.query,
        max_results: Math.max(1, Math.min(10, input.maxResults)),
        include_answer: false,
        include_raw_content: false,
      }),
    })

    if (!response.ok)
      throw new Error(`TAVILY_SEARCH_FAILED:${response.status}`)

    const payload = await response.json() as {
      results?: Array<{ title?: string, url?: string, content?: string }>
    }

    return (payload.results || [])
      .map(item => ({
        title: String(item.title || '').trim(),
        url: String(item.url || '').trim(),
        snippet: String(item.content || '').trim(),
      }))
      .filter(item => Boolean(item.url))
  }
  finally {
    clearTimeout(timeout)
  }
}
