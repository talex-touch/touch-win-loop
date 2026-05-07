import type { ApiResponse, Resource } from '~~/shared/types/domain'
import type { DeviceArrangementPersistedPayload } from '~~/shared/utils/device-arrangement-document'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { migrateProjectDeviceArrangementFromScene } from '~~/server/utils/project-resource-device-arrangement-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event): Promise<ApiResponse<{
  resource: Resource
  arrangement: DeviceArrangementPersistedPayload
  migratedFromResourceId: string
} | null>> => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const resourceId = normalizeString(getRouterParam(event, 'resourceId'))

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400173)
  }

  try {
    const migrated = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')
      return migrateProjectDeviceArrangementFromScene(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
      })
    })

    await Promise.allSettled([
      emitRealtimeEvent({
        type: 'project.resources.changed',
        workspaceId: migrated.workspaceId,
        projectId,
      }),
      emitRealtimeEvent({
        type: 'project.outline.changed',
        workspaceId: migrated.workspaceId,
        projectId,
      }),
    ])

    return ok({
      resource: migrated.resource,
      arrangement: migrated.arrangement,
      migratedFromResourceId: migrated.migratedFromResourceId,
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
      return fail('当前用户无权迁移该设备排布。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 403173)
    }
    if (error instanceof Error && (error.message === 'RESOURCE_NOT_FOUND' || error.message === 'PROJECT_NOT_FOUND')) {
      setResponseStatus(event, 404)
      return fail('资源不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404173)
    }
    if (error instanceof Error && error.message === 'LEGACY_DEVICE_ARRANGEMENT_NOT_FOUND') {
      setResponseStatus(event, 409)
      return fail('该资源不是可迁移的旧设备排布。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 409173)
    }
    throw error
  }
})
