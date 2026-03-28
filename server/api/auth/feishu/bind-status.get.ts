import type { FeishuAuthBindStatus } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getFeishuAuthBindStatusByUserId } from '~~/server/utils/feishu-integration-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const data = await withClient(event, async (db) => {
    return getFeishuAuthBindStatusByUserId(db, user.id)
  })

  return ok<FeishuAuthBindStatus>(data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
