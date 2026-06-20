import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message || 'unknown error'
  return String(error || 'unknown error')
}

export default defineNitroPlugin(() => {
  void readEffectivePlatformRuntimeSettings().catch((error) => {
    console.warn('[platform-runtime-config-cache] preload failed:', toErrorMessage(error))
  })
})
