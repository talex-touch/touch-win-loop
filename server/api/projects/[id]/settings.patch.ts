import type { ProjectSettingsPatchInput } from '~~/server/utils/platform-store'
import { setResponseStatus } from 'h3'
import { generateAndSaveProjectOutline } from '~~/server/services/project-outline-generator'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { patchProjectSettings } from '~~/server/utils/platform-store'

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function normalizeContestBindings(input: unknown): Array<{ contestId: string, trackId: string, sortOrder: number }> {
  if (!Array.isArray(input))
    return []

  return input
    .map((item, index) => {
      const record = (item || {}) as Record<string, unknown>
      return {
        contestId: String(record.contestId || '').trim(),
        trackId: String(record.trackId || '').trim(),
        sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : index,
      }
    })
    .filter(item => item.contestId && item.trackId)
}

interface PatchSettingsBody {
  common?: {
    title?: string
    summary?: string
    icon?: string
    accentColor?: string
    problemStatement?: string
    innovationPoints?: string[]
    techRouteSteps?: string[]
    scoringMapping?: string[]
    risks?: string[]
    deliverables?: string[]
  }
  contestBindings?: Array<{
    contestId?: string
    trackId?: string
    sortOrder?: number
  }>
  currentContestId?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = (await readBody<PatchSettingsBody>(event)) || {}

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40072)
  }

  const payload: ProjectSettingsPatchInput = {
    currentContestId: String(body.currentContestId || '').trim(),
  }

  if (body.common) {
    const common: ProjectSettingsPatchInput['common'] = {}

    if (body.common.title !== undefined)
      common.title = body.common.title
    if (body.common.summary !== undefined)
      common.summary = body.common.summary
    if (body.common.icon !== undefined)
      common.icon = String(body.common.icon || '').trim()
    if (body.common.accentColor !== undefined)
      common.accentColor = String(body.common.accentColor || '').trim()
    if (body.common.problemStatement !== undefined)
      common.problemStatement = body.common.problemStatement
    if (Array.isArray(body.common.innovationPoints))
      common.innovationPoints = normalizeStringArray(body.common.innovationPoints)
    if (Array.isArray(body.common.techRouteSteps))
      common.techRouteSteps = normalizeStringArray(body.common.techRouteSteps)
    if (Array.isArray(body.common.scoringMapping))
      common.scoringMapping = normalizeStringArray(body.common.scoringMapping)
    if (Array.isArray(body.common.risks))
      common.risks = normalizeStringArray(body.common.risks)
    if (Array.isArray(body.common.deliverables))
      common.deliverables = normalizeStringArray(body.common.deliverables)

    if (Object.keys(common).length > 0)
      payload.common = common
  }

  if (Array.isArray(body.contestBindings))
    payload.contestBindings = normalizeContestBindings(body.contestBindings)

  try {
    const settings = await withTransaction(event, async (db) => {
      return patchProjectSettings(db, user, projectId, payload)
    })

    if (!settings) {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40472)
    }

    await withTransaction(event, async (db) => {
      await generateAndSaveProjectOutline(db, {
        projectId,
        user,
        reason: 'settings_saved',
        context: {
          contestId: settings.currentContestId,
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
      }, 40372)
    }

    if (error instanceof Error && error.message === 'PROJECT_CONTEST_BINDINGS_REQUIRED') {
      setResponseStatus(event, 400)
      return fail('至少需要绑定一个竞赛。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40073)
    }

    if (error instanceof Error && error.message === 'PROJECT_CONTEST_BINDINGS_DUPLICATED') {
      setResponseStatus(event, 400)
      return fail('竞赛绑定存在重复项。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40074)
    }

    if (error instanceof Error && error.message === 'PROJECT_CONTEST_TRACK_MISMATCH') {
      setResponseStatus(event, 400)
      return fail('存在赛道与竞赛不匹配的绑定。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40075)
    }

    if (error instanceof Error && error.message === 'TRACK_NOT_FOUND') {
      setResponseStatus(event, 400)
      return fail('目标竞赛没有可用赛道。', {
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
