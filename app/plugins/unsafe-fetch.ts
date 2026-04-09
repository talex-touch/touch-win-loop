type UnsafeFetch = <T = any>(request: string, options?: any) => Promise<T>

export default defineNuxtPlugin(() => {
  ;(globalThis as typeof globalThis & { unsafeFetch: UnsafeFetch }).unsafeFetch = ((request, options = {}) => {
    return $fetch(request, {
      ...options,
      credentials: options?.credentials ?? 'include',
    })
  }) as UnsafeFetch
})

export {}
