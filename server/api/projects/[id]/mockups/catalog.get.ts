import type { MockupProjectCatalog } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { listPublishedMockupProjectCatalog } from '~~/server/utils/mockup-device-store'
import { getVisibleProjectById } from '~~/server/utils/platform-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))

  const catalog = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')

    const result = await listPublishedMockupProjectCatalog(db)
    return {
      ...result,
      categories: result.categories.map((category) => ({
        ...category,
        models: category.models.map((model) => ({
          ...model,
          variants: model.variants.map((variant) => ({
            ...variant,
            shellAssetUrl: variant.shellAssetItemId
              ? `/api/projects/${projectId}/design-library/items/${variant.shellAssetItemId}/asset`
              : undefined,
          })),
        })),
      })),
    } satisfies MockupProjectCatalog
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND')
      return null
    throw error
  })

  if (!catalog) {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40615)
  }

  return ok(catalog, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
