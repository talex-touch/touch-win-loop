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
import { submitProjectIssueReportForReview } from '~~/server/utils/project-ai-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const reportId = String(getRouterParam(event, 'reportId') || '').trim()
  const sourceRoute = resolveBillingSourceRoute(getQuery(event).sourceRoute, event.path)

  if (!projectId || !reportId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 reportId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40124)
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
          reportId,
          actorUserId: user.id,
          eventCode: 'review.submit',
          result: 'failed',
          sourceRoute,
          meta: {
            reason: 'PROJECT_NOT_VISIBLE',
          },
        })
        throw new Error('PROJECT_NOT_VISIBLE')
      }

      const submitted = await submitProjectIssueReportForReview(db, {
        projectId,
        reportId,
        actorUserId: user.id,
      })

      if (!submitted) {
        await recordBillingUsageEventSafely(db, {
          workspaceId: projectScope.workspaceId,
          projectId: projectScope.projectId,
          contestId: projectScope.contestId,
          trackId: projectScope.trackId,
          reportId,
          actorUserId: user.id,
          eventCode: 'review.submit',
          result: 'failed',
          sourceRoute,
          meta: {
            reason: 'REPORT_NOT_FOUND',
          },
        })
        throw new Error('REPORT_NOT_FOUND')
      }

      if (submitted.justSubmitted) {
        await recordBillingUsageEventSafely(db, {
          workspaceId: projectScope.workspaceId,
          projectId: projectScope.projectId,
          contestId: projectScope.contestId,
          trackId: projectScope.trackId,
          reportId,
          actorUserId: user.id,
          eventCode: 'review.submit',
          result: 'success',
          sourceRoute,
          meta: {
            justSubmitted: true,
          },
        })
      }

      return submitted
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
      }, 404126)
    }

    if (error instanceof Error && error.message === 'REPORT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('评审报告不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404127)
    }

    throw error
  }
})
