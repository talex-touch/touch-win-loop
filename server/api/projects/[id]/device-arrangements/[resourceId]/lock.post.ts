import type { ApiResponse } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  isDeviceArrangementLockConflictError,
  refreshProjectDeviceArrangementEditLock,
} from '~~/server/utils/project-resource-device-arrangement-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

interface DeviceArrangementLockBody {
  lockSessionId?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event): Promise<ApiResponse<{
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
  const body = (await readBody<DeviceArrangementLockBody>(event).catch(() => ({} as DeviceArrangementLockBody))) || {}
  const lockSessionId = normalizeString(body.lockSessionId)

  if (!projectId || !resourceId || !lockSessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId、resourceId 或 lockSessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400173)
  }

  try {
    const editLock = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')
      return refreshProjectDeviceArrangementEditLock(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
        actorUsername: user.username,
        sessionId: lockSessionId,
      })
    })

    return ok({ editLock }, {
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
      }, 403173)
    }
    if (error instanceof Error && error.message === 'DEVICE_ARRANGEMENT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('设备排布不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404173)
    }
    if (isDeviceArrangementLockConflictError(error)) {
      setResponseStatus(event, 409)
      return fail(`当前设备排布正由 ${error.lock.username || '其他用户'} 编辑。`, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 409174)
    }
    throw error
  }
})
