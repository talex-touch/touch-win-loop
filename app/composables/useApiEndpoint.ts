import { buildApiEndpoint, normalizeApiBase, resolveApiUrlByApiBase, resolveUserFacingUrlByAppBase } from '~~/shared/utils/api-url'

export function useApiEndpoint(runtimeConfig = useRuntimeConfig()) {
  const apiBase = computed(() => {
    return normalizeApiBase(String(runtimeConfig.public?.apiBaseUrl || '/api'))
  })
  const appBase = computed(() => {
    return String(runtimeConfig.public?.appBaseUrl || '').trim()
  })

  function endpoint(path: string): string {
    return buildApiEndpoint(apiBase.value, path)
  }

  function resolveApiUrl(rawUrl: string): string {
    return resolveApiUrlByApiBase(apiBase.value, rawUrl)
  }

  function resolveAppUrl(rawUrl: string): string {
    const currentOrigin = import.meta.client ? window.location.origin : ''
    return resolveUserFacingUrlByAppBase(appBase.value, rawUrl, currentOrigin)
  }

  return {
    apiBase,
    appBase,
    endpoint,
    resolveApiUrl,
    resolveAppUrl,
  }
}
