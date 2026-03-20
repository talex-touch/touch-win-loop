import type { ContestStatus, RubricDimension, RubricScoringMode } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { patchAdminRubric } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchRubricBody {
  rubricId?: string
  trackId?: string
  scoringMode?: RubricScoringMode
  version?: number
  dimensions?: RubricDimension[]
  scoringPoints?: string[]
  deductionItems?: string[]
  evidenceRequirements?: string[]
  status?: ContestStatus
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = getRouterParam(event, 'id') || ''
  const body = await readBody<PatchRubricBody>(event)

  if (!contestId || !body?.rubricId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 rubricId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40077)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑 rubric。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40377)
  }

  try {
    const rubric = await withTransaction(event, async (db) => {
      return patchAdminRubric(db, {
        actorUserId: user.id,
        contestId,
        rubricId: body.rubricId!,
        patch: {
          trackId: body?.trackId,
          scoringMode: body?.scoringMode,
          version: body?.version,
          dimensions: body?.dimensions,
          scoringPoints: body?.scoringPoints,
          deductionItems: body?.deductionItems,
          evidenceRequirements: body?.evidenceRequirements,
          status: body?.status,
        },
      })
    })

    if (!rubric) {
      setResponseStatus(event, 404)
      return fail('rubric not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40477)
    }

    return ok(rubric, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('RUBRIC_')) {
      setResponseStatus(event, 400)
      return fail(`rubric 配置不合法：${error.message}`, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40078)
    }
    throw error
  }
})
