import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getManageableIntelligenceProject } from '~~/server/services/ai/intelligence-project-guard'
import { archiveAiWorkflowDefinition } from '~~/server/utils/project-intelligence-workflow-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const workflowId = String(getRouterParam(event, 'workflowId') || '').trim()

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

  const archived = await withTransaction(event, async (db) => {
    await getManageableIntelligenceProject(db, user, projectId)
    return archiveAiWorkflowDefinition(db, {
      projectId,
      workflowId,
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

  if (archived === null) {
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40497)
  }

  if (archived === 'FORBIDDEN') {
    return fail('当前用户无权删除智能工作流。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  return ok({ archived: Boolean(archived) }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
