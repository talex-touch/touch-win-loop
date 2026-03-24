import type { ProjectSettingsDraftDeleteInput } from '~~/server/utils/platform-store'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { deleteProjectSettingsDraft } from '~~/server/utils/platform-store'

interface DeleteProjectSettingsDraftBody {
  expectedRevision?: number | null
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
  let body: DeleteProjectSettingsDraftBody = {}

  try {
    body = (await readBody<DeleteProjectSettingsDraftBody>(event)) || {}
  }
  catch {
    body = {}
  }

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40082)
  }

  const payload: ProjectSettingsDraftDeleteInput = {
    expectedRevision: normalizeExpectedRevision(body.expectedRevision),
  }

  try {
    const deleted = await withTransaction(event, async (db) => {
      return deleteProjectSettingsDraft(db, user, projectId, payload)
    })

    return ok(deleted, {
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
      }, 40376)
    }

    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40476)
    }

    if (error instanceof Error && error.message === 'PROJECT_SETTINGS_DRAFT_CONFLICT') {
      setResponseStatus(event, 409)
      return fail('草稿版本冲突，请刷新后重试。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40976)
    }

    throw error
  }
})
