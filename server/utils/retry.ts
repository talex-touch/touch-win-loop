export interface RetryResult<T> {
  data: T
  fallbackUsed: boolean
  attempts: number
  lastError?: unknown
}

interface RetryOptions<T> {
  maxRetries: number
  run: () => Promise<T>
  fallback: () => Promise<T> | T
}

export async function runWithRetry<T>(options: RetryOptions<T>): Promise<RetryResult<T>> {
  let attempts = 0
  let lastError: unknown

  while (attempts <= options.maxRetries) {
    try {
      attempts += 1
      const data = await options.run()
      return {
        data,
        fallbackUsed: false,
        attempts,
      }
    }
    catch (error) {
      lastError = error
      if (attempts > options.maxRetries)
        break
    }
  }

  const fallbackData = await options.fallback()
  return {
    data: fallbackData,
    fallbackUsed: true,
    attempts,
    lastError,
  }
}
