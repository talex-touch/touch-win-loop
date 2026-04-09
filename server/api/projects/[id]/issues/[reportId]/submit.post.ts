import type { ProjectBillingScope } from '~~/server/utils/billing-usage-tracker'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  getProjectBillingScopeById,
  recordBillingUsageEventSafely,
  resolveBillingSourceRoute,
} from '~~/server/utils/billing-usage-tracker'
import { withClient, withTransaction } from '~~/server/utils/db'
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
  let projectScope: ProjectBillingScope | null = null

  const recordSubmitUsage = async (
    result: 'success' | 'failed',
    meta?: Record<string, unknown>,
  ) => {
    const scope = projectScope
    if (!scope)
      return

    await withClient(event, async (db) => {
      await recordBillingUsageEventSafely(db, {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        contestId: scope.contestId,
        trackId: scope.trackId,
        reportId,
        actorUserId: user.id,
        eventCode: 'review.submit',
        result,
        sourceRoute,
        meta,
      })
    }).catch(() => undefined)
  }

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
      projectScope = await getProjectBillingScopeById(db, projectId)
      if (!projectScope)
        throw new Error('PROJECT_NOT_FOUND')

      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_VISIBLE')

      const submitted = await submitProjectIssueReportForReview(db, {
        projectId,
        reportId,
        actorUserId: user.id,
      })

      if (!submitted)
        throw new Error('REPORT_NOT_FOUND')

      return submitted
    })

    if (result.justSubmitted) {
      await recordSubmitUsage('success', {
        justSubmitted: true,
      })
    }

    return ok(result, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_VISIBLE') {
      await recordSubmitUsage('failed', {
        reason: 'PROJECT_NOT_VISIBLE',
      })
    }

    if (error instanceof Error && error.message === 'REPORT_NOT_FOUND') {
      await recordSubmitUsage('failed', {
        reason: 'REPORT_NOT_FOUND',
      })
    }

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
