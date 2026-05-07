import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { markUserNotificationRead } from '~~/server/utils/notification-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const notificationId = String(getRouterParam(event, 'id') || '').trim()

  if (!notificationId) {
    setResponseStatus(event, 400)
    return fail('缺少通知 ID。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  const updated = await withTransaction(event, async (db) => {
    return markUserNotificationRead(db, {
      userId: user.id,
      notificationId,
    })
  })

  if (!updated) {
    setResponseStatus(event, 404)
    return fail('通知不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40492)
  }

  return ok({ updated: true }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
