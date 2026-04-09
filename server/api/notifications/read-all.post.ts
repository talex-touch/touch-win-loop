import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { markAllUserNotificationsRead } from '~~/server/utils/notification-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<{ workspaceId?: string }>(event).catch(() => ({ } as { workspaceId?: string }))
  const workspaceId = String(body?.workspaceId || '').trim()

  const updatedCount = await withTransaction(event, async (db) => {
    return markAllUserNotificationsRead(db, {
      userId: user.id,
      workspaceId,
    })
  })

  return ok({ updatedCount }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
