import * as Sentry from '@sentry/nuxt'
import { buildSentryTracePropagationTargets, sanitizeSentryPayload } from './shared/utils/sentry'

const runtimeConfig = useRuntimeConfig()
const sentryConfig = runtimeConfig.public?.sentry || {}
const dsn = String(sentryConfig.dsn || '').trim()
const environment = String(sentryConfig.environment || '').trim()
const release = String(sentryConfig.release || '').trim()
const tracesSampleRate = Number(sentryConfig.tracesSampleRate || 0.1)

if (dsn && environment && !Sentry.getClient()) {
  Sentry.init({
    dsn,
    environment,
    release,
    sendDefaultPii: false,
    tracePropagationTargets: buildSentryTracePropagationTargets(String(runtimeConfig.public?.apiBaseUrl || '/api')),
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    beforeSend(event) {
      return sanitizeSentryPayload(event)
    },
  })
}
