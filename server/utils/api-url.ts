import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  buildApiEndpoint,
  extractApiBasePathPrefix,
  normalizeApiBase,
  resolveApiUrlByApiBase,
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

export function buildOnlyOfficeSourceApiEndpoint(path: string): string {
  const runtime = readRuntimeSettings()
  const apiPathPrefix = extractApiBasePathPrefix(runtime.apiBaseUrl) || '/'
  const relativeWithApiPrefix = buildApiEndpoint(apiPathPrefix, path)
  return buildApiEndpoint(runtime.onlyOffice.sourceBaseURL, relativeWithApiPrefix)
}
