import type { ProjectCompetitionLoopPayload } from '~~/shared/types/project-competition-loop'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectCompetitionLoop } from '~~/server/utils/project-competition-loop-store'

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
    }, 40097)
  }

  const payload = await withTransaction(event, db => getVisibleProjectCompetitionLoop(db, {
    user,
    projectId,
    syncKnowledge: true,
    persist: true,
  }))

  if (!payload) {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40497)
  }

  return ok<ProjectCompetitionLoopPayload>(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
  })
})
