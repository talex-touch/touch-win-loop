import { setResponseStatus } from 'h3'
import { buildProjectContestExportBundle } from '~~/server/services/project/project-contest-export'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'

interface ContestBundleExportBody {
  profileId?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = (await readBody<ContestBundleExportBody>(event).catch(() => ({} as ContestBundleExportBody))) || {}
  const endpointTag = 'contest-bundle'

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400211)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const exported = await buildProjectContestExportBundle(db, {
        project,
        actorUserId: user.id,
        profileId: normalizeString(body.profileId) || null,
      })

      return {
        endpoint: endpointTag,
        manifest: exported.manifest,
        artifacts: exported.artifacts,
      }
    })

    return ok({
      manifest: result.manifest,
      artifacts: result.artifacts,
      endpoint: result.endpoint,
    }, {
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
      }, 404211)
    }

    throw error
  }
})
