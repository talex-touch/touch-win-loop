import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  buildApiEndpoint,
  extractApiBasePathPrefix,
  normalizeApiBase,
  resolveApiUrlByApiBase,
  resolveUserFacingUrlByAppBase,
} from '~~/shared/utils/api-url'

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

export function buildServerAppUrl(path: string, event?: H3Event): string {
  const runtime = useRuntimeConfig(event)
  const appBase = String(runtime.public?.appBaseUrl || '').trim()
  const requestOrigin = (() => {
    const req = event?.node?.req
    if (!req)
      return ''
    const forwardedProtoHeader = req.headers['x-forwarded-proto']
    const forwardedHostHeader = req.headers['x-forwarded-host']
    const hostHeader = req.headers.host
    const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader
    const forwardedHost = Array.isArray(forwardedHostHeader) ? forwardedHostHeader[0] : forwardedHostHeader
    const host = String(forwardedHost || hostHeader || '').split(',')[0]?.trim() || ''
    if (!host)
      return ''
    const isTlsSocket = 'encrypted' in req.socket && req.socket.encrypted === true
    const protocol = String(forwardedProto || (isTlsSocket ? 'https' : 'http')).split(',')[0]?.trim() || 'http'
    return `${protocol === 'https' ? 'https' : 'http'}://${host}`
  })()
  return resolveUserFacingUrlByAppBase(appBase, path, requestOrigin)
}

export function buildOnlyOfficeSourceApiEndpoint(path: string): string {
  const runtime = readRuntimeSettings()
  const apiPathPrefix = extractApiBasePathPrefix(runtime.apiBaseUrl) || '/'
  const relativeWithApiPrefix = buildApiEndpoint(apiPathPrefix, path)
  return buildApiEndpoint(runtime.onlyOffice.sourceBaseURL, relativeWithApiPrefix)
}
