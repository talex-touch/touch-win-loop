import type { WorkspaceDisplayPreferences } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getUserWorkspaceDisplayDefaults } from '~~/server/utils/workspace-display-preference-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const preferences = await withClient(event, async (db) => {
    return getUserWorkspaceDisplayDefaults(db, user.id)
  })

  return ok<WorkspaceDisplayPreferences | null>(preferences, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
