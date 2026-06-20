import type { ContestStatus, RubricDimension, RubricScoringMode } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAdminRubric } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateRubricBody {
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
  const body = await readBody<CreateRubricBody>(event)

  if (!contestId || !body?.trackId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 trackId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40075)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增 rubric。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40375)
  }

  const dimensions = Array.isArray(body?.dimensions) ? body.dimensions : []

  try {
    const rubric = await withTransaction(event, async (db) => {
      return createAdminRubric(db, {
        actorUserId: user.id,
        contestId,
        trackId: body.trackId!,
        scoringMode: body?.scoringMode,
        version: Number(body?.version || 1),
        dimensions,
        scoringPoints: body?.scoringPoints,
        deductionItems: body?.deductionItems,
        evidenceRequirements: body?.evidenceRequirements,
        status: body?.status,
      })
    })

    return ok(rubric, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'CONTEST_RELEASE_WORKFLOW_REQUIRED') {
      setResponseStatus(event, 409)
      return fail('当前赛事已接入版本流，请通过“审核/版本”生成新版本后再发布。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 409751)
    }
    if (error instanceof Error && error.message.startsWith('RUBRIC_')) {
      setResponseStatus(event, 400)
      return fail(`rubric 配置不合法：${error.message}`, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40076)
    }
    throw error
  }
})
