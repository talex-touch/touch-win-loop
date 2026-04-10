type UnsafeFetch = <T = any>(request: string, options?: any) => Promise<T>

declare global {
  var unsafeFetch: UnsafeFetch
}

export {}
