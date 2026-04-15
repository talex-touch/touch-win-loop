import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getCanvasLibraryItemDetail } from '~~/server/utils/canvas-library-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const itemId = normalizeString(getRouterParam(event, 'itemId'))

  const detail = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')
    return getCanvasLibraryItemDetail(db, {
      itemId,
      publishedOnly: true,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND')
      return null
    throw error
  })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('project 或资源库条目不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40499)
  }

  const publishedVersion = detail.publishedVersion
  const assetUrl = publishedVersion?.payloadType === 'binary_asset'
    ? `/api/projects/${projectId}/design-library/items/${itemId}/asset`
    : ''

  return ok({
    ...detail,
    assetUrl,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
