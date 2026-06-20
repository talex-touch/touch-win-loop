import { setResponseStatus } from 'h3'
import { getManageableIntelligenceProject } from '~~/server/services/ai/intelligence-project-guard'
import { normalizeAiWorkflowRunTriggerPayload } from '~~/server/services/ai/intelligence-workflow-definition'
import { executeIntelligenceWorkflow } from '~~/server/services/ai/intelligence-workflow-engine'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { getAiWorkflowDefinitionById } from '~~/server/utils/project-intelligence-workflow-store'

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const workflowId = String(getRouterParam(event, 'workflowId') || '').trim()
  const body = normalizeRecord(await readBody<unknown>(event).catch(() => ({})))

  if (!projectId || !workflowId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 workflowId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  const result = await withClient(event, async (db) => {
    const project = await getManageableIntelligenceProject(db, user, projectId)
    const workflow = await getAiWorkflowDefinitionById(db, {
      projectId,
      workflowId,
    })
    if (!workflow)
      throw new Error('WORKFLOW_NOT_FOUND')

    return executeIntelligenceWorkflow({
      event,
      db,
      runtime,
      user,
      project,
      workflow,
      triggerPayload: normalizeAiWorkflowRunTriggerPayload(body.triggerPayload ? normalizeRecord(body.triggerPayload) : body),
    })
  }).catch((error) => {
    if (error instanceof Error && (error.message === 'PROJECT_NOT_FOUND' || error.message === 'WORKFLOW_NOT_FOUND')) {
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
    return fail('workflow not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40498)
  }

  if (result === 'FORBIDDEN') {
    return fail('当前用户无权运行智能工作流。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40398)
  }

  if (typeof result === 'string') {
    return fail('工作流运行失败，请检查步骤配置或审批状态。', {
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
