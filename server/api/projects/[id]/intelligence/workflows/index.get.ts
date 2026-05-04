import type { AiWorkflowCatalogPayload } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { getManageableIntelligenceProject } from '~~/server/services/ai/intelligence-project-guard'
import { listBuiltinWorkflowTemplates } from '~~/server/services/ai/intelligence-workflow-definition'
import { listIntelligenceWorkflowToolCatalog } from '~~/server/services/ai/intelligence-workflow-engine'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { listAiWorkflowDefinitionsByProject } from '~~/server/utils/project-intelligence-workflow-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()

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

  const result = await withClient(event, async (db): Promise<AiWorkflowCatalogPayload> => {
    await getManageableIntelligenceProject(db, user, projectId)
    const items = await listAiWorkflowDefinitionsByProject(db, projectId)
    return {
      items,
      availableTools: listIntelligenceWorkflowToolCatalog(),
      builtinTemplates: listBuiltinWorkflowTemplates(),
    }
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
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40497)
  }

  if (result === 'FORBIDDEN') {
    return fail('当前用户无权管理智能工作流。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  return ok(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
