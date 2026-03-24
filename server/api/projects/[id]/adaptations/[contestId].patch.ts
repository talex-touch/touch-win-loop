import type { ProjectAdaptationPatchInput } from '~~/server/utils/platform-store'
import { setResponseStatus } from 'h3'
import { generateAndSaveProjectOutline } from '~~/server/services/project-outline-generator'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { patchProjectContestAdaptation } from '~~/server/utils/platform-store'

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

interface PatchAdaptationBody {
  problemStatement?: string
  innovationPoints?: string[]
  techRouteSteps?: string[]
  scoringMapping?: string[]
  risks?: string[]
  deliverables?: string[]
  summary?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const contestId = String(getRouterParam(event, 'contestId') || '').trim()
  const body = (await readBody<PatchAdaptationBody>(event)) || {}

  if (!projectId || !contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40077)
  }

  const patch: ProjectAdaptationPatchInput = {}

  if (body.problemStatement !== undefined)
    patch.problemStatement = body.problemStatement
  if (Array.isArray(body.innovationPoints))
    patch.innovationPoints = normalizeStringArray(body.innovationPoints)
  if (Array.isArray(body.techRouteSteps))
    patch.techRouteSteps = normalizeStringArray(body.techRouteSteps)
  if (Array.isArray(body.scoringMapping))
    patch.scoringMapping = normalizeStringArray(body.scoringMapping)
  if (Array.isArray(body.risks))
    patch.risks = normalizeStringArray(body.risks)
  if (Array.isArray(body.deliverables))
    patch.deliverables = normalizeStringArray(body.deliverables)
  if (body.summary !== undefined)
    patch.summary = body.summary

  try {
    const settings = await withTransaction(event, async (db) => {
      return patchProjectContestAdaptation(db, user, projectId, contestId, patch)
    })

    if (!settings) {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40473)
    }

    await withTransaction(event, async (db) => {
      await generateAndSaveProjectOutline(db, {
        projectId,
        user,
        reason: 'adaptation_saved',
        context: {
          contestId: settings.currentContestId || contestId,
          trackId: settings.currentAdaptation?.trackId || '',
        },
      })
    }).catch(() => undefined)

    return ok(settings, {
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
      return fail('当前用户无权管理项目设置。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40373)
    }

    if (error instanceof Error && error.message === 'PROJECT_CONTEST_NOT_BOUND') {
      setResponseStatus(event, 400)
      return fail('当前竞赛尚未绑定到该项目。', {
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
