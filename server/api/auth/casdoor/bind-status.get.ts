import type { CasdoorAuthBindStatus } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getCasdoorAuthBindStatusByUserId } from '~~/server/utils/feishu-integration-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const data = await withClient(event, async (db) => {
    return getCasdoorAuthBindStatusByUserId(db, user.id)
  })

  return ok<CasdoorAuthBindStatus>(data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
