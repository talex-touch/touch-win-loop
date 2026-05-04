import process from 'node:process'

export function shouldSkipBackgroundWorkers(): boolean {
  const value = String(process.env.WINLOOP_DISABLE_BACKGROUND_WORKERS || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}
