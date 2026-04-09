import { resolveBuildVersion, resolveEnvNumber, resolveEnvValue } from './env'

const ALLOWED_SENTRY_ENVIRONMENTS = new Set(['staging', 'production'])

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized)
      return normalized
  }
  return ''
}

export function resolveSentryDsn(): string {
  return normalizeText(resolveEnvValue('WINLOOP_SENTRY_DSN', ''))
}

export function resolveSentryEnvironment(): string {
  const normalized = normalizeText(resolveEnvValue('WINLOOP_SENTRY_ENVIRONMENT', '')).toLowerCase()
  return ALLOWED_SENTRY_ENVIRONMENTS.has(normalized) ? normalized : ''
}

export function resolveSentryRelease(defaultRelease = ''): string {
  return firstNonEmpty(
    resolveEnvValue('WINLOOP_SENTRY_RELEASE', ''),
    defaultRelease,
    resolveBuildVersion(),
  )
}

export function resolveSentryTracesSampleRate(fallback = 0.1): number {
  const value = resolveEnvNumber('WINLOOP_SENTRY_TRACES_SAMPLE_RATE', fallback)
  if (!Number.isFinite(value))
    return fallback
  return Math.max(0, Math.min(1, value))
}

export function resolveSentryBuildOrganization(): string {
  return firstNonEmpty(
    resolveEnvValue('WINLOOP_SENTRY_ORG', ''),
    resolveEnvValue('SENTRY_ORG', ''),
  )
}

export function resolveSentryBuildProject(): string {
  return firstNonEmpty(
    resolveEnvValue('WINLOOP_SENTRY_PROJECT', ''),
    resolveEnvValue('SENTRY_PROJECT', ''),
  )
}

export function resolveSentrySourceMapsUploadState(): {
  enabled: boolean
  missing: string[]
} {
  const missing: string[] = []
  if (!normalizeText(resolveEnvValue('SENTRY_AUTH_TOKEN', '')))
    missing.push('SENTRY_AUTH_TOKEN')
  if (!resolveSentryBuildOrganization())
    missing.push('WINLOOP_SENTRY_ORG')
  if (!resolveSentryBuildProject())
    missing.push('WINLOOP_SENTRY_PROJECT')

  return {
    enabled: missing.length === 0,
    missing,
  }
}
