import type { UserAiSettings } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { getUserAiSettings } from '~~/server/utils/user-ai-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const settings = await withClient(event, async (db) => {
    return getUserAiSettings(db, user.id)
  })

  return ok<UserAiSettings>(settings, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
