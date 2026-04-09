type UnsafeFetch = <T = any>(request: string, options?: any) => Promise<T>

declare global {
  var unsafeFetch: UnsafeFetch
}

export default defineNuxtPlugin(() => {
  globalThis.unsafeFetch = ((request, options = {}) => {
    return $fetch(request, {
      ...options,
      credentials: options?.credentials ?? 'include',
    })
  }) as UnsafeFetch
})

export {}
