import type { ApiResponse } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { releaseProjectDeviceArrangementEditLock } from '~~/server/utils/project-resource-device-arrangement-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

interface DeviceArrangementLockBody {
  lockSessionId?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event): Promise<ApiResponse<{ released: boolean } | null>> => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const resourceId = normalizeString(getRouterParam(event, 'resourceId'))
  const body = (await readBody<DeviceArrangementLockBody>(event).catch(() => ({} as DeviceArrangementLockBody))) || {}
  const lockSessionId = normalizeString(body.lockSessionId || getQuery(event).lockSessionId)

  if (!projectId || !resourceId || !lockSessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId、resourceId 或 lockSessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400174)
  }

  try {
    await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')
      await releaseProjectDeviceArrangementEditLock(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
        sessionId: lockSessionId,
      })
    })

    return ok({ released: true }, {
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
      return fail('当前用户无权释放该设备排布编辑锁。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 403174)
    }
    throw error
  }
})
