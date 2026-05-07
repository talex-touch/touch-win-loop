import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  getProjectBillingScopeById,
  recordBillingUsageEventSafely,
  resolveBillingSourceRoute,
} from '~~/server/utils/billing-usage-tracker'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { createContestResourceFavorite } from '~~/server/utils/project-resource-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const sourceRoute = resolveBillingSourceRoute(getQuery(event).sourceRoute, event.path)

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40121)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const projectScope = await getProjectBillingScopeById(db, projectId)
      if (!projectScope)
        throw new Error('PROJECT_NOT_FOUND')

      const project = await getVisibleProjectById(db, user, projectId)
      if (!project) {
        await recordBillingUsageEventSafely(db, {
          workspaceId: projectScope.workspaceId,
          projectId: projectScope.projectId,
          contestId: projectScope.contestId,
          trackId: projectScope.trackId,
          contestResourceId: resourceId,
          actorUserId: user.id,
          eventCode: 'resource.favorite.create',
          result: 'failed',
          sourceRoute,
          meta: {
            reason: 'PROJECT_NOT_VISIBLE',
          },
        })
        throw new Error('PROJECT_NOT_VISIBLE')
      }

      try {
        const favorite = await createContestResourceFavorite(db, {
          resourceId,
          actorUserId: user.id,
        })

        if (!favorite.alreadyFavorited) {
          await recordBillingUsageEventSafely(db, {
            workspaceId: projectScope.workspaceId,
            projectId: projectScope.projectId,
            contestId: projectScope.contestId,
            trackId: projectScope.trackId,
            contestResourceId: favorite.resource.id,
            actorUserId: user.id,
            eventCode: 'resource.favorite.create',
            result: 'success',
            sourceRoute,
            meta: {
              alreadyFavorited: false,
            },
          })
        }

        return {
          favorited: true,
          alreadyFavorited: favorite.alreadyFavorited,
          resource: favorite.resource,
        }
      }
      catch (error) {
        if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND') {
          await recordBillingUsageEventSafely(db, {
            workspaceId: projectScope.workspaceId,
            projectId: projectScope.projectId,
            contestId: projectScope.contestId,
            trackId: projectScope.trackId,
            contestResourceId: resourceId,
            actorUserId: user.id,
            eventCode: 'resource.favorite.create',
            result: 'failed',
            sourceRoute,
            meta: {
              reason: 'RESOURCE_NOT_FOUND',
            },
          })
        }
        throw error
      }
    })

    return ok(result, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && (error.message === 'PROJECT_NOT_FOUND' || error.message === 'PROJECT_NOT_VISIBLE')) {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404121)
    }

    if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('资源不存在，或当前不可收藏。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404122)
    }

    throw error
  }
})
