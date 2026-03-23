import type { ProjectIssueStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import {
  listProjectIssueReportsByProject,
  listProjectIssuesByProject,
} from '~~/server/utils/project-ai-store'

const ALL_ISSUE_STATUSES: ProjectIssueStatus[] = ['open', 'in_progress', 'resolved', 'ignored']

function parseIssueStatuses(value: unknown): ProjectIssueStatus[] {
  const text = String(value || '').trim()
  if (!text)
    return ALL_ISSUE_STATUSES

  const parsed = text
    .split(',')
    .map(item => item.trim())
    .filter((item): item is ProjectIssueStatus => ALL_ISSUE_STATUSES.includes(item as ProjectIssueStatus))

  return parsed.length > 0 ? parsed : ALL_ISSUE_STATUSES
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)
  const statuses = parseIssueStatuses(query.statuses)
  const reportLimit = Number(query.reportLimit || 20)
  const issueLimit = Number(query.issueLimit || 200)

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40104)
  }

  const result = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')

    const [reports, issues] = await Promise.all([
      listProjectIssueReportsByProject(db, {
        projectId,
        limit: reportLimit,
      }),
      listProjectIssuesByProject(db, {
        projectId,
        statuses,
        limit: issueLimit,
      }),
    ])

    return {
      reports,
      issues,
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return null
    }
    throw error
  })

  if (!result) {
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40498)
  }

  return ok(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
