import type { ProjectOutlineSnapshot } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { generateAndSaveProjectOutline } from '~~/server/services/project-outline-generator'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'

interface GenerateOutlineBody {
  reason?: string
  context?: Partial<ProjectOutlineSnapshot['context']>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = (await readBody<GenerateOutlineBody>(event).catch(() => ({} as GenerateOutlineBody))) || {}

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40080)
  }

  try {
    const snapshot = await withTransaction(event, async (db) => {
      return generateAndSaveProjectOutline(db, {
        projectId,
        user,
        reason: normalizeString(body.reason) || 'manual_generate',
        context: {
          contestId: normalizeString(body.context?.contestId),
          trackId: normalizeString(body.context?.trackId),
          major: normalizeString(body.context?.major),
          discipline: normalizeString(body.context?.discipline),
          level: normalizeString(body.context?.level),
          trackType: normalizeString(body.context?.trackType),
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
      }, 40475)
    }

    throw error
  }
})
