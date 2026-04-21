import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { normalizeAiWorkflowDefinitionPayload } from '~~/server/services/ai/intelligence-workflow-definition'
import { getManageableIntelligenceProject } from '~~/server/services/ai/intelligence-project-guard'
import { saveAiWorkflowDefinition } from '~~/server/utils/project-intelligence-workflow-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  const result = await withTransaction(event, async (db) => {
    const project = await getManageableIntelligenceProject(db, user, projectId)
    const workflowId = String(body.id || body.workflowId || '').trim()
    const definitionSource = body.definition && typeof body.definition === 'object' && !Array.isArray(body.definition)
      ? body.definition
      : body
    const definition = normalizeAiWorkflowDefinitionPayload(definitionSource)
    return saveAiWorkflowDefinition(db, {
      workflowId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      definition,
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
    if (error instanceof Error && (error.message === 'INVALID_WORKFLOW_DEFINITION' || error.message.startsWith('WORKFLOW_'))) {
      setResponseStatus(event, 400)
      return error.message
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
    }, 40497)
  }

  if (result === 'FORBIDDEN') {
    return fail('当前用户无权保存智能工作流。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  if (typeof result === 'string') {
    return fail('工作流定义不合法，请检查步骤与工具配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  return ok(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
