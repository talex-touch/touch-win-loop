import type { ProjectWorkspaceViewState } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  normalizeProjectWorkspaceViewStatePayload,
  upsertProjectWorkspaceViewState,
} from '~~/server/utils/project-workspace-view-store'

interface PutProjectViewStateBody {
  payload?: unknown
  deviceId?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = (await readBody<PutProjectViewStateBody>(event)) || {}

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40088)
  }

  if (body.payload === undefined) {
    setResponseStatus(event, 400)
    return fail('缺少 payload。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40089)
  }

  const deviceId = String(body.deviceId || '').trim()
  if (!deviceId) {
    setResponseStatus(event, 400)
    return fail('缺少 deviceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  const payload = normalizeProjectWorkspaceViewStatePayload(body.payload) as ProjectWorkspaceViewState

  try {
    const preference = await withTransaction(event, async (db) => {
      return upsertProjectWorkspaceViewState(db, user, projectId, deviceId, payload)
    })

    return ok(preference, {
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
      return fail('当前用户无权更新该项目工作区视图。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40388)
    }

    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40488)
    }

    if (error instanceof Error && error.message === 'DEVICE_ID_REQUIRED') {
      setResponseStatus(event, 400)
      return fail('缺少 deviceId。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40093)
    }

    throw error
  }
})
