import type { ProjectSettingsDraftUpsertInput } from '~~/server/utils/platform-store'
import type {
  ProjectSettingsDraftAdaptation,
  ProjectSettingsDraftCommon,
  ProjectSettingsDraftPayload,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { upsertProjectSettingsDraft } from '~~/server/utils/platform-store'

interface PatchProjectSettingsDraftBody {
  payload?: unknown
  expectedRevision?: number | null
  deviceId?: string
}

function normalizePlainText(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  return String(value)
}

function normalizeCommonDraft(value: unknown): ProjectSettingsDraftCommon {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}

  return {
    title: normalizePlainText(source.title),
    summary: normalizePlainText(source.summary),
    problemStatement: normalizePlainText(source.problemStatement),
    innovationPointsText: normalizePlainText(source.innovationPointsText),
    techRouteStepsText: normalizePlainText(source.techRouteStepsText),
    scoringMappingText: normalizePlainText(source.scoringMappingText),
    risksText: normalizePlainText(source.risksText),
    deliverablesText: normalizePlainText(source.deliverablesText),
  }
}

function normalizeBindings(value: unknown): ProjectSettingsDraftPayload['bindings'] {
  if (!Array.isArray(value))
    return []

  return value
    .map((item, index) => {
      const source = item && typeof item === 'object'
        ? item as Record<string, unknown>
        : {}
      return {
        contestId: String(source.contestId || '').trim(),
        trackId: String(source.trackId || '').trim(),
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : index,
      }
    })
    .filter(item => item.contestId && item.trackId)
}

function normalizeAdaptationDraft(contestId: string, value: unknown): ProjectSettingsDraftAdaptation {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}

  return {
    contestId: String(source.contestId || contestId).trim(),
    trackId: String(source.trackId || '').trim(),
    problemStatement: normalizePlainText(source.problemStatement),
    innovationPointsText: normalizePlainText(source.innovationPointsText),
    techRouteStepsText: normalizePlainText(source.techRouteStepsText),
    scoringMappingText: normalizePlainText(source.scoringMappingText),
    risksText: normalizePlainText(source.risksText),
    deliverablesText: normalizePlainText(source.deliverablesText),
    summary: normalizePlainText(source.summary),
  }
}

function normalizeAdaptationDrafts(value: unknown): ProjectSettingsDraftPayload['adaptationDrafts'] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}

  const source = value as Record<string, unknown>
  const output: ProjectSettingsDraftPayload['adaptationDrafts'] = {}

  for (const [contestIdKey, draft] of Object.entries(source)) {
    const normalizedContestId = String(contestIdKey || '').trim()
    if (!normalizedContestId)
      continue

    const adaptation = normalizeAdaptationDraft(normalizedContestId, draft)
    if (!adaptation.contestId)
      continue
    output[adaptation.contestId] = adaptation
  }

  return output
}

function normalizeDraftPayload(value: unknown): ProjectSettingsDraftPayload {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}

  return {
    updatedAt: String(source.updatedAt || '').trim() || new Date().toISOString(),
    deviceId: String(source.deviceId || '').trim() || undefined,
    common: normalizeCommonDraft(source.common),
    bindings: normalizeBindings(source.bindings),
    currentContestId: String(source.currentContestId || '').trim(),
    adaptationDrafts: normalizeAdaptationDrafts(source.adaptationDrafts),
  }
}

function normalizeExpectedRevision(value: unknown): number | null {
  if (!Number.isFinite(Number(value)))
    return null
  return Math.trunc(Number(value))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = (await readBody<PatchProjectSettingsDraftBody>(event)) || {}

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40080)
  }

  if (body.payload === undefined) {
    setResponseStatus(event, 400)
    return fail('缺少 payload。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40081)
  }

  const payload: ProjectSettingsDraftUpsertInput = {
    payload: normalizeDraftPayload(body.payload),
    expectedRevision: normalizeExpectedRevision(body.expectedRevision),
    deviceId: String(body.deviceId || '').trim(),
  }

  try {
    const draft = await withTransaction(event, async (db) => {
      return upsertProjectSettingsDraft(db, user, projectId, payload)
    })

    return ok(draft, {
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
      }, 40375)
    }

    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40475)
    }

    if (error instanceof Error && error.message === 'PROJECT_SETTINGS_DRAFT_CONFLICT') {
      setResponseStatus(event, 409)
      return fail('草稿版本冲突，请刷新后重试。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40975)
    }

    throw error
  }
})
