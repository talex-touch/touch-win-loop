import type { AuthSessionProbeResult } from '~~/shared/types/domain'
import { setHeader } from 'h3'
import { createTraceId, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const traceId = createTraceId()

  setHeader(event, 'x-trace-id', traceId)

  try {
    const { user, session } = await requireAuth(event)

    return ok<AuthSessionProbeResult>({
      authenticated: true,
      userId: user.id,
      expiresAt: session.expiresAt,
    }, {
      startedAt,
      traceId,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error
      ? Number((error as { statusCode?: number }).statusCode || 0)
      : 0

    if (statusCode !== 401) {
      console.error('[auth.session] probe failed', {
        traceId,
        statusCode: statusCode || 500,
        error,
      })
    }

    throw error
  }
})
