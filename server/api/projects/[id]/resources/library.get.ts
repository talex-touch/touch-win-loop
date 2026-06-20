import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { listProjectLibraryResources } from '~~/server/utils/project-resource-store'

function parsePositiveLimit(value: unknown): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return undefined
  return Math.max(1, Math.min(20, Math.trunc(parsed)))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)
  const keyword = String(query.q || '').trim()
  const limit = parsePositiveLimit(query.limit)

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40062)
  }

  try {
    const resources = await withClient(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      return listProjectLibraryResources(db, {
        projectId,
        actorUserId: user.id,
        query: keyword,
        limit,
      })
    })

    return ok(resources, {
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
      }, 40462)
    }

    throw error
  }
})
