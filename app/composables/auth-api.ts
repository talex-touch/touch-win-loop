function buildAuthApiEndpoint(apiBase: string, path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

export function useAuthApiFetch() {
  const runtime = useRuntimeConfig()
  const apiBase = runtime.public.apiBaseUrl || '/api'

  return async function authApiFetch<T>(path: string, options?: Parameters<typeof $fetch>[1]): Promise<T> {
    const serverHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    return $fetch(buildAuthApiEndpoint(apiBase, path), {
      ...options,
      credentials: 'include',
      headers: {
        ...(serverHeaders || {}),
        ...((options && typeof options === 'object' && 'headers' in options && options.headers) ? options.headers as Record<string, string> : {}),
      },
    }) as Promise<T>
  }
}
