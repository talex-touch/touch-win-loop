type UnsafeFetch = typeof unsafeFetch

export default defineNuxtPlugin((nuxtApp) => {
  (globalThis as typeof globalThis & { unsafeFetch: UnsafeFetch }).unsafeFetch = nuxtApp.$fetch as UnsafeFetch
})

export {}
