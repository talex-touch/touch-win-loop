import type { H3Event } from 'h3'
import type { ResourceSearchSort } from '~~/shared/types/domain'
import { getCookie } from 'h3'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export function parseResourceSearchTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => parseResourceSearchTags(item))
      .filter(Boolean)
  }
  return normalizeString(value)
    .split(/[,\n，、]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

export function parseResourceSearchSort(value: unknown): ResourceSearchSort | undefined {
  const normalized = normalizeString(value)
  if (normalized === 'relevance' || normalized === 'quality' || normalized === 'value' || normalized === 'hot')
    return normalized
  return undefined
}

export function parseResourceMinQuality(value: unknown): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return undefined
  return Math.max(0, Math.min(100, parsed))
}

export function resolveResourceSearchSessionId(
  event: H3Event,
  fallback?: string,
): string {
  const headerValue = event.node.req.headers['x-resource-session-id']
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue
  const cookieValue = getCookie(event, 'wl_resource_session')
  return normalizeString(header) || normalizeString(cookieValue) || normalizeString(fallback)
}
