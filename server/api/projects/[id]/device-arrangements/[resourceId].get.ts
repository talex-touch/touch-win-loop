import type { ApiResponse, Resource } from '~~/shared/types/domain'
import type { DeviceArrangementPersistedPayload } from '~~/shared/utils/device-arrangement-document'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  acquireProjectDeviceArrangementEditLock,
  isDeviceArrangementLockConflictError,
} from '~~/server/utils/project-resource-device-arrangement-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

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
  const lockSessionId = normalizeString(getQuery(event).lockSessionId)

  if (!projectId || !resourceId || !lockSessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId、resourceId 或 lockSessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400171)
  }

  const result = await withTransaction(event, async (db) => {
    const access = await resolveProjectRealtimeAccess(db, user, projectId)
    if (!access)
      throw new Error('FORBIDDEN')
    return acquireProjectDeviceArrangementEditLock(db, {
      projectId,
      resourceId,
      actorUserId: user.id,
      actorUsername: user.username,
      sessionId: lockSessionId,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN')
      return 'FORBIDDEN' as const
    if (isDeviceArrangementLockConflictError(error))
      return { lockedBy: error.lock } as const
    throw error
  })

  if (result === 'FORBIDDEN') {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看该设备排布。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403171)
  }

  if (result && 'lockedBy' in result) {
    setResponseStatus(event, 409)
    return fail(`当前设备排布正由 ${result.lockedBy.username || '其他用户'} 编辑。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 409171)
  }

  if (!result) {
    setResponseStatus(event, 404)
    return fail('设备排布不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404171)
  }

  return ok(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
