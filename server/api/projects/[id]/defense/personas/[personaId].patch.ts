import type { AiDefensePersonaJudgeType, RubricDimension } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getProjectDefensePersonaById, patchProjectDefensePersona } from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

interface PatchDefensePersonaBody {
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

function normalizeJudgeType(value: unknown): AiDefensePersonaJudgeType | undefined {
  const normalized = normalizeString(value)
  if (!normalized)
    return undefined
  if (normalized === 'technical' || normalized === 'business' || normalized === 'expression')
    return normalized
  return 'custom'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const personaId = normalizeString(getRouterParam(event, 'personaId'))
  const body = await readBody<PatchDefensePersonaBody>(event).catch(() => ({} as PatchDefensePersonaBody))

  if (!projectId || !personaId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 personaId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40100)
  }

  try {
    const persona = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      const existing = await getProjectDefensePersonaById(db, {
        projectId,
        personaId,
      })
      if (!existing)
        throw new Error('NOT_FOUND')

      const patched = await patchProjectDefensePersona(db, {
        projectId,
        personaId,
        actorUserId: user.id,
        patch: {
          judgeType: normalizeJudgeType(body?.judgeType),
          name: body?.name === undefined ? undefined : normalizeString(body.name),
          summary: body?.summary === undefined ? undefined : normalizeString(body.summary),
          systemPrompt: body?.systemPrompt === undefined ? undefined : normalizeString(body.systemPrompt),
          focusAreas: Array.isArray(body?.focusAreas) ? body.focusAreas : undefined,
          scoringRubric: Array.isArray(body?.scoringRubric) ? body.scoringRubric : undefined,
          enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
          sortOrder: Number.isFinite(Number(body?.sortOrder)) ? Number(body?.sortOrder) : undefined,
          isCustomized: true,
        },
      })
      if (!patched)
        throw new Error('NOT_FOUND')
      return patched
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
      }, 40398)
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('答辩人设不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40498)
    }
    throw error
  }
})
