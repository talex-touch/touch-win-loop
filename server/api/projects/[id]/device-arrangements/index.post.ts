import type { ApiResponse } from '~~/shared/types/domain'
import type { DeviceArrangementPersistedPayload } from '~~/shared/utils/device-arrangement-document'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createProjectDeviceArrangement } from '~~/server/utils/project-resource-device-arrangement-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'
import type { Resource } from '~~/shared/types/domain'

interface CreateDeviceArrangementBody {
  title?: string
  document?: Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event): Promise<ApiResponse<{
  resource: Resource
  arrangement: DeviceArrangementPersistedPayload
}>> => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = (await readBody<CreateDeviceArrangementBody>(event).catch(() => ({} as CreateDeviceArrangementBody))) || {}

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400170)
  }

  try {
    const created = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')
      return createProjectDeviceArrangement(db, {
        projectId,
        actorUserId: user.id,
        title: body.title,
        document: body.document,
      })
    })

    await Promise.allSettled([
      emitRealtimeEvent({
        type: 'project.resources.changed',
        workspaceId: created.workspaceId,
        projectId,
      }),
      emitRealtimeEvent({
        type: 'project.outline.changed',
        workspaceId: created.workspaceId,
        projectId,
      }),
    ])

    return ok({
      resource: created.resource,
      arrangement: created.arrangement,
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
      return fail('当前用户无权创建设备排布。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 403170)
    }
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404170)
    }
    throw error
  }
})
