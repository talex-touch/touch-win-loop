import * as Sentry from '@sentry/nuxt'
import { loadWinloopEnv, resolveBuildVersion } from './config/env'
import {
  resolveSentryDsn,
  resolveSentryEnvironment,
  resolveSentryRelease,
  resolveSentryTracesSampleRate,
} from './config/sentry'
import { sanitizeSentryPayload, shouldCaptureSentryError } from './shared/utils/sentry'

loadWinloopEnv()

const dsn = resolveSentryDsn()
const environment = resolveSentryEnvironment()
const release = resolveSentryRelease(resolveBuildVersion())
const tracesSampleRate = resolveSentryTracesSampleRate()

if (dsn && environment && !Sentry.getClient()) {
  Sentry.init({
    dsn,
    environment,
    release,
    sendDefaultPii: false,
    tracesSampleRate,
    beforeSend(event, hint) {
      if (!shouldCaptureSentryError(hint.originalException))
        return null
      return sanitizeSentryPayload(event)
    },
  })
}
