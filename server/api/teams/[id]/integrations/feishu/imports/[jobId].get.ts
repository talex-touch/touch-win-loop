import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { getWorkspaceFeishuImportJob } from '~~/server/utils/workspace-integration-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const jobId = String(getRouterParam(event, 'jobId') || '').trim()

  if (!workspaceId || !jobId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId 或 jobId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40103)
  }

  try {
    const data = await withClient(event, async (db) => {
      const canAccess = await teamHasWorkspaceMembership(db, user, workspaceId)
      if (!canAccess)
        throw new Error('FORBIDDEN')
      const job = await getWorkspaceFeishuImportJob(db, {
        workspaceId,
        jobId,
      })
      if (!job)
        throw new Error('IMPORT_JOB_NOT_FOUND')
      return job
    })

    return ok(data, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权查看飞书导入任务。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40404)
    }
    if (error instanceof Error && error.message === 'IMPORT_JOB_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('飞书导入任务不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40405)
    }
    throw error
  }
})
