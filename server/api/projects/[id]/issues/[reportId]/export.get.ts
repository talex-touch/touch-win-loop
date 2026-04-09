import { setHeader, setResponseStatus } from 'h3'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  getProjectBillingScopeById,
  recordBillingUsageEventSafely,
  resolveBillingSourceRoute,
} from '~~/server/utils/billing-usage-tracker'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { getProjectIssueReportById } from '~~/server/utils/project-ai-store'

function encodeFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(/%20/g, '+')
}

function toMarkdownFileName(title: string): string {
  const normalized = String(title || '').trim().replace(/[\\/:*?"<>|]+/g, '-')
  return `${normalized || 'issue-report'}.md`
}

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
    }, 40125)
  }

  const result = await withClient(event, async (db) => {
    const projectScope = await getProjectBillingScopeById(db, projectId)
    if (!projectScope)
      return { reason: 'PROJECT_NOT_FOUND' as const, report: null }

    const project = await getVisibleProjectById(db, user, projectId)
    if (!project) {
      await recordBillingUsageEventSafely(db, {
        workspaceId: projectScope.workspaceId,
        projectId: projectScope.projectId,
        contestId: projectScope.contestId,
        trackId: projectScope.trackId,
        reportId,
        actorUserId: user.id,
        eventCode: 'review.report.export',
        result: 'failed',
        sourceRoute,
        meta: {
          reason: 'PROJECT_NOT_VISIBLE',
        },
      })

      return { reason: 'PROJECT_NOT_FOUND' as const, report: null }
    }

    const report = await getProjectIssueReportById(db, {
      projectId,
      reportId,
    })
    if (!report) {
      await recordBillingUsageEventSafely(db, {
        workspaceId: projectScope.workspaceId,
        projectId: projectScope.projectId,
        contestId: projectScope.contestId,
        trackId: projectScope.trackId,
        reportId,
        actorUserId: user.id,
        eventCode: 'review.report.export',
        result: 'failed',
        sourceRoute,
        meta: {
          reason: 'REPORT_NOT_FOUND',
        },
      })

      return { reason: 'REPORT_NOT_FOUND' as const, report: null }
    }

    await recordBillingUsageEventSafely(db, {
      workspaceId: projectScope.workspaceId,
      projectId: projectScope.projectId,
      contestId: projectScope.contestId,
      trackId: projectScope.trackId,
      reportId,
      actorUserId: user.id,
      eventCode: 'review.report.export',
      result: 'success',
      sourceRoute,
      meta: {
        format: 'markdown',
      },
    })

    return {
      reason: '' as const,
      report,
    }
  })

  if (result.reason === 'PROJECT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404128)
  }

  if (result.reason === 'REPORT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('评审报告不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404129)
  }

  const report = result.report!
  const markdown = String(report.markdown || '').trim()

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeFileName(toMarkdownFileName(report.title))}`)
  return markdown
})
