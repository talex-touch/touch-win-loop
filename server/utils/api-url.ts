import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  buildApiEndpoint,
  extractApiBasePathPrefix,
  isHttpUrl,
  normalizeApiBase,
  resolveApiUrlByApiBase,
  resolveUserFacingUrlByAppBase,
} from '~~/shared/utils/api-url'

function getFirstHeaderValue(rawValue: string | string[] | undefined): string {
  const first = Array.isArray(rawValue) ? (rawValue[0] || '') : (rawValue || '')
  return String(first).split(',')[0]?.trim() || ''
}

function getRuntimeApiBase(event?: H3Event): string {
  const runtime = useRuntimeConfig(event)
  return normalizeApiBase(String(runtime.public?.apiBaseUrl || '/api'))
}

export function buildServerApiEndpoint(path: string, event?: H3Event): string {
  return buildApiEndpoint(getRuntimeApiBase(event), path)
}

export function resolveServerApiUrl(rawUrl: string, event?: H3Event): string {
  return resolveApiUrlByApiBase(getRuntimeApiBase(event), rawUrl)
}

export function resolveServerRequestOrigin(event?: H3Event): string {
  const req = event?.node?.req
  if (!req)
    return ''

  const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto'])
  const forwardedHost = getFirstHeaderValue(req.headers['x-forwarded-host'])
  const host = forwardedHost || getFirstHeaderValue(req.headers.host)
  if (!host)
    return ''

  const isTlsSocket = 'encrypted' in req.socket && req.socket.encrypted === true
  const protocol = forwardedProto || (isTlsSocket ? 'https' : 'http')

  return `${protocol === 'https' ? 'https' : 'http'}://${host}`
}

export function warnIfPublicBaseHostMismatch(input: {
  event?: H3Event
  publicBaseUrl: string
  context: string
}): void {
  const requestOrigin = resolveServerRequestOrigin(input.event)
  const publicBaseUrl = String(input.publicBaseUrl || '').trim()

  if (!requestOrigin || !isHttpUrl(publicBaseUrl))
    return

  try {
    const requestHost = new URL(requestOrigin).host
    const publicBaseHost = new URL(publicBaseUrl).host
    if (requestHost && publicBaseHost && requestHost !== publicBaseHost) {
      console.warn(`[${input.context}] request origin host mismatches public base host`, {
        requestOrigin,
        publicBaseUrl,
      })
    }
  }
  catch {
    // ignore malformed diagnostic input
  }
}

export function buildServerAppUrl(path: string, event?: H3Event): string {
  const runtime = useRuntimeConfig(event)
  const appBase = String(runtime.public?.appBaseUrl || '').trim()
  const requestOrigin = resolveServerRequestOrigin(event)
  return resolveUserFacingUrlByAppBase(appBase, path, requestOrigin)
}

export function buildOnlyOfficeSourceApiEndpoint(path: string): string {
  const runtime = readRuntimeSettings()
  const sourceBaseURL = String(runtime.onlyOffice.sourceBaseURL || '').trim()
  if (!isHttpUrl(sourceBaseURL))
    throw new Error('ONLYOFFICE_SOURCE_BASE_URL_NOT_CONFIGURED')
  const apiPathPrefix = extractApiBasePathPrefix(runtime.apiBaseUrl) || '/'
  const relativeWithApiPrefix = buildApiEndpoint(apiPathPrefix, path)
  return buildApiEndpoint(sourceBaseURL, relativeWithApiPrefix)
}
