import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { continueIntelligenceWorkflow } from '~~/server/services/ai/intelligence-workflow-engine'
import { getManageableIntelligenceProject } from '~~/server/services/ai/intelligence-project-guard'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readEffectiveRuntimeSettings(event)
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
    const project = await getManageableIntelligenceProject(db, user, projectId)
    return continueIntelligenceWorkflow({
      event,
      db,
      runtime,
      user,
      project,
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
    if (error instanceof Error && error.message.startsWith('WORKFLOW_')) {
      setResponseStatus(event, 400)
      return error.message
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
    return fail('当前用户无权继续执行该工作流。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  if (typeof result === 'string') {
    return fail('当前工作流尚未满足继续执行条件，请先完成审批。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  return ok(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
