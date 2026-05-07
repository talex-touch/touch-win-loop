import { setResponseStatus } from 'h3'
import { getManageableIntelligenceProject } from '~~/server/services/ai/intelligence-project-guard'
import { getIntelligenceWorkflowRunDetail } from '~~/server/services/ai/intelligence-workflow-engine'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const runId = String(getRouterParam(event, 'runId') || '').trim()

  if (!projectId || !runId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 runId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  const result = await withClient(event, async (db) => {
    await getManageableIntelligenceProject(db, user, projectId)
    return getIntelligenceWorkflowRunDetail(db, {
      projectId,
      runId,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return null
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return 'FORBIDDEN'
    }
    throw error
  })

  if (!result) {
    return fail('run not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40499)
  }

  if (result === 'FORBIDDEN') {
    return fail('当前用户无权查看该工作流运行。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  return ok(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
