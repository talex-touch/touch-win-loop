import { setResponseStatus } from 'h3'
import { getOrGenerateProjectOutline } from '~~/server/services/project-outline-generator'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const query = getQuery(event)

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40079)
  }

  try {
    const snapshot = await withClient(event, async (db) => {
      return getOrGenerateProjectOutline(db, {
        projectId,
        user,
        reason: 'read_or_auto_init',
        context: {
          contestId: normalizeString(query.contestId),
          trackId: normalizeString(query.trackId),
          major: normalizeString(query.major),
          discipline: normalizeString(query.discipline),
          level: normalizeString(query.level),
          trackType: normalizeString(query.trackType),
        },
      })
    })

    return ok(snapshot, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40474)
    }

    throw error
  }
})
