import type { AuthOnboardingPendingResult } from '~~/shared/types/domain'
import { buildPendingExternalAuthView } from '~~/server/services/auth/external-identity'
import { ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)

  return ok<AuthOnboardingPendingResult>(buildPendingExternalAuthView(event), {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
