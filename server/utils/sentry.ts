import * as Sentry from '@sentry/nuxt'
import { readRuntimeSettings } from '~~/server/utils/env'
import { sanitizeSentryPayload, shouldCaptureSentryError } from '~~/shared/utils/sentry'

type SentryLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'

interface CaptureServerExceptionInput {
  module: string
  level?: SentryLevel
  projectId?: string
  taskId?: string
  traceId?: string
  workspaceId?: string
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export function captureServerException(error: unknown, input: CaptureServerExceptionInput): void {
  if (!shouldCaptureSentryError(error))
    return

  if (!Sentry.getClient())
    return

  const runtime = readRuntimeSettings()
  const moduleName = normalizeText(input.module) || 'server'
  const taskId = normalizeText(input.taskId)
  const workspaceId = normalizeText(input.workspaceId)
  const projectId = normalizeText(input.projectId)
  const traceId = normalizeText(input.traceId)

  Sentry.withScope((scope) => {
    scope.setLevel(input.level || 'error')
    scope.setTag('module', moduleName)

    scope.setContext('winloop', sanitizeSentryPayload({
      module: moduleName,
      taskId,
      workspaceId,
      projectId,
      traceId,
      buildVersion: runtime.build.version,
      buildCommitSha: runtime.build.commitSha,
    }))

    Sentry.captureException(error)
  })
}
