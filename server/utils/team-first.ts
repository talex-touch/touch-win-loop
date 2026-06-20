import type { H3Event } from 'h3'
import { setResponseStatus } from 'h3'
import { fail } from '~~/server/utils/api'
import { createDeprecatedApiHandler } from '~~/server/utils/api-handler'
import { readRuntimeSettings } from '~~/server/utils/env'

export function teamFirstApiRemoved(event: H3Event) {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  setResponseStatus(event, 410)
  return fail('API_REMOVED_TEAM_FIRST：workspace 路径已下线，请改用 /api/teams/*。', {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }, 41010)
}

export const teamFirstDeprecatedHandler = createDeprecatedApiHandler(teamFirstApiRemoved)
