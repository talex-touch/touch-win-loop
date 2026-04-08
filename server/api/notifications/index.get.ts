import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { ensureContestDeadlineNotifications, listUserNotifications } from '~~/server/utils/notification-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getQuery(event).workspaceId || '').trim()
  const cursor = String(getQuery(event).cursor || '').trim()
  const limit = Math.max(1, Math.min(50, Number(getQuery(event).limit || 20)))

  try {
    const result = await withClient(event, async (db) => {
      if (workspaceId)
        await ensureContestDeadlineNotifications(db, user, workspaceId)
      return listUserNotifications(db, {
        userId: user.id,
        workspaceId,
        limit,
        cursor,
      })
    })

    return ok(result, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '通知列表加载失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40091)
  }
})
