import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamWithQuotaResponse } from '~~/server/utils/team-api-presenter'
import { teamListUserWorkspaces } from '~~/server/utils/team-workspace-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const workspaces = await withClient(event, async (db) => {
    return teamListUserWorkspaces(db, user.id)
  })
  const teams = workspaces.map(toTeamWithQuotaResponse)

  return ok(teams, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
