export function useAuthApiFetch() {
  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)

  return async function authApiFetch<T>(path: string, options?: Parameters<typeof $fetch>[1]): Promise<T> {
    const serverHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    return $fetch(endpoint(path), {
      ...options,
      credentials: 'include',
      headers: {
        ...(serverHeaders || {}),
        ...((options && typeof options === 'object' && 'headers' in options && options.headers) ? options.headers as Record<string, string> : {}),
      },
    }) as Promise<T>
  }
}
