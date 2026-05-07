import type { ApiResponse, Resource } from '~~/shared/types/domain'
import type { DeviceArrangementPersistedPayload } from '~~/shared/utils/device-arrangement-document'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  ensureProjectDeviceArrangementEditLock,
  isDeviceArrangementLockConflictError,
  isDeviceArrangementLockRequiredError,
  updateProjectDeviceArrangement,
} from '~~/server/utils/project-resource-device-arrangement-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

interface UpdateDeviceArrangementBody {
  title?: string
  document?: Record<string, unknown>
  lockSessionId?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event): Promise<ApiResponse<{
  resource: Resource
  arrangement: DeviceArrangementPersistedPayload
  editLock: {
    userId: string
    username: string
    sessionId: string
    acquiredAt: string
    heartbeatAt: string
    expiresAt: string
  }
} | null>> => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const resourceId = normalizeString(getRouterParam(event, 'resourceId'))
  const body = (await readBody<UpdateDeviceArrangementBody>(event).catch(() => ({} as UpdateDeviceArrangementBody))) || {}
  const lockSessionId = normalizeString(body.lockSessionId)

  if (!projectId || !resourceId || !body.document || !lockSessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId、resourceId、document 或 lockSessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400172)
  }

  try {
    const updated = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')
      const editLock = await ensureProjectDeviceArrangementEditLock(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
        actorUsername: user.username,
        sessionId: lockSessionId,
      })
      const result = await updateProjectDeviceArrangement(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
        title: body.title,
        document: body.document,
      })
      return { ...result, workspaceId: access.workspaceId, editLock }
    })

    await emitRealtimeEvent({
      type: 'project.resources.changed',
      workspaceId: updated.workspaceId,
      projectId,
    })

    return ok({
      resource: updated.resource,
      arrangement: updated.arrangement,
      editLock: updated.editLock,
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
      return fail('当前用户无权编辑该设备排布。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 403172)
    }
    if (error instanceof Error && error.message === 'DEVICE_ARRANGEMENT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('设备排布不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404172)
    }
    if (isDeviceArrangementLockConflictError(error)) {
      setResponseStatus(event, 409)
      return fail(`当前设备排布正由 ${error.lock.username || '其他用户'} 编辑。`, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 409172)
    }
    if (isDeviceArrangementLockRequiredError(error)) {
      setResponseStatus(event, 409)
      return fail('设备排布编辑锁已过期，请重新打开后继续编辑。', {
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
