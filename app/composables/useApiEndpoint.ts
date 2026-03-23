import { buildApiEndpoint, normalizeApiBase, resolveApiUrlByApiBase } from '~~/shared/utils/api-url'

export function useApiEndpoint(runtimeConfig = useRuntimeConfig()) {
  const apiBase = computed(() => {
    return normalizeApiBase(String(runtimeConfig.public?.apiBaseUrl || '/api'))
  })

  function endpoint(path: string): string {
    return buildApiEndpoint(apiBase.value, path)
  }

  function resolveApiUrl(rawUrl: string): string {
    return resolveApiUrlByApiBase(apiBase.value, rawUrl)
  }

  return {
    apiBase,
    endpoint,
    resolveApiUrl,
  }
}
