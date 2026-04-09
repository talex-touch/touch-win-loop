type AuthApiFetchMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'get' | 'post' | 'put' | 'patch' | 'delete'

interface AuthApiFetchOptions {
  method?: AuthApiFetchMethod
  body?: RequestInit['body'] | Record<string, any>
  params?: Record<string, any>
  query?: Record<string, any>
  baseURL?: string
  headers?: Record<string, string>
  ignoreResponseError?: boolean
}

export function useAuthApiFetch() {
  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)

  return async function authApiFetch<T>(path: string, options?: AuthApiFetchOptions): Promise<T> {
    const serverHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

    return $fetch(endpoint(path), {
      ...options,
      credentials: 'include',
      headers: {
        ...(serverHeaders || {}),
        ...(options?.headers || {}),
      },
    }) as Promise<T>
  }
}
