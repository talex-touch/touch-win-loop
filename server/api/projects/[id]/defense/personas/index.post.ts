import type { AiDefensePersonaJudgeType, RubricDimension } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createProjectDefensePersona, listProjectDefensePersonas } from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

interface CreateDefensePersonaBody {
  judgeType?: AiDefensePersonaJudgeType
  name?: string
  summary?: string
  systemPrompt?: string
  focusAreas?: string[]
  scoringRubric?: RubricDimension[]
  enabled?: boolean
  sortOrder?: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeJudgeType(value: unknown): AiDefensePersonaJudgeType {
  const normalized = normalizeString(value)
  if (normalized === 'technical' || normalized === 'business' || normalized === 'expression')
    return normalized
  return 'custom'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = await readBody<CreateDefensePersonaBody>(event).catch(() => ({} as CreateDefensePersonaBody))

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

  const name = normalizeString(body?.name)
  const systemPrompt = normalizeString(body?.systemPrompt)
  if (!name || !systemPrompt) {
    setResponseStatus(event, 400)
    return fail('name 和 systemPrompt 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  try {
    const persona = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      const existing = await listProjectDefensePersonas(db, { projectId })
      return createProjectDefensePersona(db, {
        projectId,
        judgeType: normalizeJudgeType(body?.judgeType),
        name,
        summary: normalizeString(body?.summary),
        systemPrompt,
        focusAreas: Array.isArray(body?.focusAreas) ? body.focusAreas : [],
        scoringRubric: Array.isArray(body?.scoringRubric) ? body.scoringRubric : [],
        enabled: body?.enabled !== false,
        sortOrder: Number.isFinite(Number(body?.sortOrder)) ? Number(body?.sortOrder) : existing.length,
        isCustomized: true,
        actorUserId: user.id,
      })
    })

    return ok({
      item: persona,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权编辑项目答辩人设。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40396)
    }
    throw error
  }
})
