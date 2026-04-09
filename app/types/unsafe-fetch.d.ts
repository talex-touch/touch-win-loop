type UnsafeFetch = <T = any>(request: string, options?: any) => Promise<T>

declare global {
  const unsafeFetch: UnsafeFetch

  interface GlobalThis {
    unsafeFetch: UnsafeFetch
  }
}

export {}
